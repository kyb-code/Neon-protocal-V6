// net.js — P2P networking via PeerJS. Host-authoritative.
// Robustness pass: multiple STUN + TURN relays, fallback signaling servers (encoded in
// the room-code suffix so both sides meet on the same server), long timeouts, ICE-state
// monitoring, and a live diagnostic stream (onDiag) so connection failures are VISIBLE.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
const ID_PREFIX = 'neonprotocol-raid-';

// signaling servers. index 0 = PeerJS public cloud, others = community fallbacks.
// the server index is appended to the room code so guests connect to the right one.
const SIGNAL_SERVERS = [
  null, // default PeerJS cloud (0.peerjs.com)
  { host: '0.peerjs.com', port: 443, secure: true, path: '/', key: 'peerjs' }, // explicit cloud
  { host: 'peerjs.92k.de', port: 443, secure: true, path: '/' },               // community mirror
];

// STUN (find your public address) + TURN (relay when a direct link fails on strict/symmetric
// NAT — the usual case for two players in different homes). Multiple providers so one dead
// server doesn't sink the connection; ICE tries them all in parallel.
const STUN = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
  'stun:global.stun.twilio.com:3478',
];
// Free public TURN relays (Metered's Open Relay — the classic no-signup relay). These are
// shared/rate-limited and may occasionally be down; the Settings → custom TURN field is the
// guaranteed path when these fail.
const TURN = [
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

// Players can paste their own TURN credentials (e.g. a free metered.ca account) in Settings —
// this is the guaranteed path across any network. Stored in localStorage as JSON.
function userTurn() {
  try {
    const raw = localStorage.getItem('np_turn');
    if (!raw) return [];
    const t = JSON.parse(raw);
    if (t && t.urls) return [{ urls: t.urls, username: t.username || '', credential: t.credential || '' }];
  } catch (e) { /* ignore */ }
  return [];
}

function buildIceConfig() {
  return {
    iceServers: [...userTurn(), { urls: STUN }, ...TURN],
    iceCandidatePoolSize: 6,
  };
}

const HOST_SIGNAL_TIMEOUT = 10000; // per signaling server before falling back
const DATA_TIMEOUT = 25000;        // guest: allow time for TURN relay allocation

export function genCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function peerOptions(serverIdx) {
  const base = { debug: 1, config: buildIceConfig() };
  const srv = SIGNAL_SERVERS[serverIdx];
  return srv ? Object.assign({}, base, srv) : base;
}

// split "XFZVA" / "XFZVA2" into {code, serverIdx}
function parseCode(raw) {
  const c = (raw || '').toUpperCase().trim();
  const m = c.match(/^([A-Z2-9]{5})([0-9]?)$/);
  if (!m) return null;
  const idx = m[2] ? parseInt(m[2], 10) : 0;
  if (idx >= SIGNAL_SERVERS.length) return null;
  return { code: m[1], serverIdx: idx };
}

export class Net {
  constructor() {
    this.peer = null;
    this.conns = [];
    this.isHost = false;
    this.code = null;        // display code (may include server suffix)
    this.onMessage = null;
    this.onPeerJoin = null;
    this.onPeerLeave = null;
    this.onError = null;     // (kind) => {}
    this.onStatus = null;    // (i18n-key) => {} — high-level phase for the lobby title
    this.onDiag = null;      // (text) => {} — raw diagnostic line, shown in the lobby log
    this.destroyed = false;
    this.mode = null;        // 'peer' | 'manual' | 'mqtt'
    this.mqtt = null;
    this.myId = null;
    this.mqttConnById = new Map(); // host: clientId -> conn wrapper
  }

  available() { return typeof window.Peer !== 'undefined'; }
  mqttAvailable() { return typeof window.mqtt !== 'undefined'; }

  // ========================================================================
  // MQTT RELAY — no WebRTC at all. Both players connect OUTBOUND to a public
  // broker and relay messages through it. Immune to NAT, client isolation and
  // dead TURN — if you can load a web page, you can play.
  // ========================================================================
  _mqttBrokers() {
    return [
      'wss://broker.emqx.io:8084/mqtt',
      'wss://broker.hivemq.com:8884/mqtt',
      'wss://test.mosquitto.org:8081/mqtt',
      'wss://mqtt.eclipseprojects.io:443/mqtt',
    ];
  }

  // baseCode = 5-char room id (used for the topic, same on both peers).
  // brokerIdx = which public broker; the host encodes it into the DISPLAY code so the
  // guest joins the exact same broker (mixing brokers = can't see each other).
  // guestFixed = true means the guest must stay on this broker (no fallback iteration).
  _mqttStart(baseCode, isHost, onReady, brokerIdx, guestFixed) {
    if (this.destroyed) return;
    brokerIdx = brokerIdx || 0;
    const brokers = this._mqttBrokers();
    if (brokerIdx >= brokers.length) { this._diag('모든 릴레이 서버 연결 실패.'); this.onError && this.onError('signal'); return; }
    this.mode = 'mqtt';
    this.isHost = isHost;
    this.topic = 'neonproto/' + baseCode;
    this.code = baseCode + (brokerIdx > 0 ? String(brokerIdx) : ''); // display code carries broker
    this.myId = (isHost ? 'h_' : 'g_') + Math.random().toString(36).slice(2, 9);
    const url = brokers[brokerIdx];
    this._diag(`릴레이 서버 #${brokerIdx} 연결 중…`);
    let opened = false;
    const client = window.mqtt.connect(url, {
      clientId: 'np_' + this.myId + '_' + Math.random().toString(36).slice(2, 6),
      // keepalive short + AUTO-RECONNECT so a transient broker drop doesn't freeze a guest.
      clean: true, keepalive: 20, reconnectPeriod: 2500, connectTimeout: 8000,
      will: { topic: this.topic, payload: JSON.stringify({ f: this.myId, to: 'all', d: { __bye: 1 } }), qos: 0 },
    });
    this.mqtt = client;

    const failTimer = setTimeout(() => {
      if (!opened && !this.destroyed) {
        try { client.end(true); } catch (e) {}
        if (guestFixed) { this._diag('릴레이 응답 없음.'); this.onError && this.onError('signal'); return; }
        this._diag(`릴레이 #${brokerIdx} 응답 없음 → 다음 서버로.`);
        this._mqttStart(baseCode, isHost, onReady, brokerIdx + 1, guestFixed);
      }
    }, 9000);

    // fires on first connect AND every reconnect — always (re)subscribe (clean session drops subs)
    client.on('connect', () => {
      if (this.destroyed) { try { client.end(true); } catch (e) {} return; }
      const first = !opened;
      opened = true;
      clearTimeout(failTimer);
      client.subscribe(this.topic, { qos: 0 }, (err) => {
        if (err) { if (first) this.onError && this.onError('signal'); return; }
        if (first) {
          this._diag(isHost ? `방 생성됨 · 코드 ${this.code} · 상대 대기 중` : `방 "${this.code}" 접속됨`);
          onReady && onReady(this.code);
        } else {
          this._diag('릴레이 재연결됨');
          // re-announce presence so the peer re-registers our conn if it expired
          if (!isHost) this._mqttPublish('host', { __hi: 1 });
        }
      });
    });
    client.on('reconnect', () => { if (!this.destroyed) this._diag('릴레이 재연결 시도…'); });
    client.on('message', (topic, payload) => {
      if (this.destroyed) return;
      let env;
      try { env = JSON.parse(payload.toString()); } catch (e) { return; }
      if (!env || env.f === this.myId) return;               // ignore our own echoes
      if (env.to !== 'all' && env.to !== this.myId && !(isHost && env.to === 'host')) return;
      // peer bookkeeping
      if (env.d && env.d.__bye) { this._mqttPeerGone(env.f); return; }
      let conn = this.mqttConnById.get(env.f);
      if (!conn) {
        conn = this._makeMqttConn(env.f);
        this.mqttConnById.set(env.f, conn);
        this.conns.push(conn);
        if (isHost) this.onPeerJoin && this.onPeerJoin(conn);
      }
      if (env.d && env.d.__hi) return; // presence ping only; real 'hello' comes as a game msg
      this.onMessage && this.onMessage(env.d, conn);
    });
    client.on('error', () => {
      if (opened || this.destroyed) return;
      clearTimeout(failTimer);
      try { client.end(true); } catch (e) {}
      if (guestFixed) { this.onError && this.onError('signal'); return; }
      this._mqttStart(baseCode, isHost, onReady, brokerIdx + 1, guestFixed);
    });
    client.on('close', () => { if (opened && !this.destroyed) this._diag('릴레이 연결 끊김'); });
  }

  _makeMqttConn(peerId) {
    return { id: peerId, open: true, _mqtt: true, send: (m) => this._mqttPublish(peerId, m) };
  }
  _mqttPublish(to, data) {
    if (!this.mqtt) return;
    // high-frequency state ('s' snapshot, 'i' input) → QoS 0 (fast, lossy ok).
    // everything else (hello/lobby/start/pick/loadout/over) → QoS 1 (must arrive).
    const t = data && data.t;
    const qos = (t === 's' || t === 'i') ? 0 : 1;
    try { this.mqtt.publish(this.topic, JSON.stringify({ f: this.myId, to, d: data }), { qos }); } catch (e) { /* dropped */ }
  }
  _mqttPeerGone(peerId) {
    const conn = this.mqttConnById.get(peerId);
    if (!conn) return;
    this.mqttConnById.delete(peerId);
    const i = this.conns.indexOf(conn);
    if (i !== -1) this.conns.splice(i, 1);
    this.onPeerLeave && this.onPeerLeave(conn);
  }

  hostMqtt(onReady) {
    if (!this.mqttAvailable()) { this.onError && this.onError('mqtt-missing'); return; }
    this._diag('호스트 시작… (릴레이)');
    this._mqttStart(genCode(), true, onReady, 0);
  }
  joinMqtt(rawCode, onReady) {
    if (!this.mqttAvailable()) { this.onError && this.onError('mqtt-missing'); return; }
    const raw = (rawCode || '').toUpperCase().trim();
    // split trailing broker digit: "ABCDE" (broker 0) or "ABCDE2" (broker 2)
    const m = raw.match(/^([A-Z2-9]{5})([0-9]?)$/);
    if (!m) { this.onError && this.onError('connect'); return; }
    const baseCode = m[1];
    const brokerIdx = m[2] ? parseInt(m[2], 10) : 0;
    this._mqttStart(baseCode, false, () => {
      // announce presence so the host registers us, then the game sends its own 'hello'
      this._mqttPublish('host', { __hi: 1 });
      onReady && onReady();
    }, brokerIdx, true); // guestFixed: must stay on the host's broker
  }

  _status(key) { if (this.onStatus) this.onStatus(key); }
  _diag(text) { if (this.onDiag) this.onDiag(text); }

  // watch the underlying RTCPeerConnection so we can report checking/connected/failed
  _watchICE(conn, label) {
    // PeerJS exposes the RTCPeerConnection as conn.peerConnection (may appear slightly late)
    const attach = () => {
      const pc = conn && conn.peerConnection;
      if (!pc) { setTimeout(attach, 300); return; }
      const report = () => this._diag(`${label} · ICE: ${pc.iceConnectionState}`);
      pc.addEventListener('iceconnectionstatechange', report);
      pc.addEventListener('icegatheringstatechange', () => this._diag(`${label} · 후보수집: ${pc.iceGatheringState}`));
      report();
    };
    attach();
  }

  // ---------- host: try each signaling server until one opens ----------
  host(onReady) {
    if (!this.available()) { this.onError && this.onError('peerjs-missing'); return; }
    this.isHost = true;
    this._diag('호스트 시작…');
    this._tryHost(0, onReady, 0);
  }

  _tryHost(serverIdx, onReady, idRetries) {
    if (this.destroyed) return;
    if (serverIdx >= SIGNAL_SERVERS.length) {
      this._diag('모든 신호 서버 연결 실패.');
      this.onError && this.onError('signal');
      return;
    }
    this._status(serverIdx === 0 ? 'coop.connecting' : 'coop.connecting_alt');
    this._diag(`신호 서버 #${serverIdx} 연결 시도…`);
    const baseCode = genCode();
    const peer = new window.Peer(ID_PREFIX + baseCode, peerOptions(serverIdx));
    let settled = false;
    const giveUp = setTimeout(() => {
      if (settled || this.destroyed) return;
      settled = true;
      this._diag(`신호 서버 #${serverIdx} 응답 없음 → 다음 서버로.`);
      try { peer.destroy(); } catch (e) { /* noop */ }
      this._tryHost(serverIdx + 1, onReady, 0);
    }, HOST_SIGNAL_TIMEOUT);

    peer.on('open', () => {
      if (settled || this.destroyed) { try { peer.destroy(); } catch (e) {} return; }
      settled = true;
      clearTimeout(giveUp);
      this.peer = peer;
      this.code = baseCode + (serverIdx === 0 ? '' : String(serverIdx));
      this._diag(`방 생성됨 · 코드 ${this.code} · 상대 접속 대기 중`);
      this._wireHost(peer);
      onReady && onReady(this.code);
    });
    peer.on('error', (e) => {
      const type = (e && e.type) || 'error';
      this._diag(`신호 서버 #${serverIdx} 오류: ${type}`);
      if (settled || this.destroyed) return;
      if (type === 'unavailable-id' && idRetries < 3) {
        settled = true;
        clearTimeout(giveUp);
        try { peer.destroy(); } catch (err) {}
        this._tryHost(serverIdx, onReady, idRetries + 1); // code collision: reroll
        return;
      }
      if (['server-error', 'socket-error', 'socket-closed', 'network', 'unavailable-id', 'ssl-unavailable'].includes(type)) {
        settled = true;
        clearTimeout(giveUp);
        try { peer.destroy(); } catch (err) {}
        this._tryHost(serverIdx + 1, onReady, 0); // this server is unusable: fall back
      }
    });
  }

  _wireHost(peer) {
    peer.on('connection', (conn) => {
      this._diag(`상대 접속 요청 감지…`);
      if (this.conns.length >= 3) { try { conn.close(); } catch (e) {} return; }
      conn._rtc = true; // WebRTC data-channel conn — send/broadcast delivers over the channel
      this._watchICE(conn, '게스트');
      conn.on('open', () => {
        this._diag('게스트 연결 완료! (WebRTC)');
        this.conns.push(conn);
        this.onPeerJoin && this.onPeerJoin(conn);
      });
      conn.on('data', (data) => this.onMessage && this.onMessage(data, conn));
      conn.on('close', () => {
        const i = this.conns.indexOf(conn);
        if (i !== -1) this.conns.splice(i, 1);
        this.onPeerLeave && this.onPeerLeave(conn);
      });
      conn.on('error', (e) => this._diag('게스트 연결 오류: ' + ((e && e.type) || e)));
    });
    // if the signaling socket drops later, existing WebRTC links keep working;
    // we only lose the ability to accept NEW guests — try to reconnect the socket.
    peer.on('disconnected', () => { this._diag('신호 서버 재연결 시도…'); try { peer.reconnect(); } catch (e) {} });
  }

  // ---------- guest ----------
  join(rawCode, onReady) {
    if (!this.available()) { this.onError && this.onError('peerjs-missing'); return; }
    const parsed = parseCode(rawCode);
    if (!parsed) { this._diag('코드 형식이 올바르지 않습니다.'); this.onError && this.onError('connect'); return; }
    this.isHost = false;
    this.code = rawCode.toUpperCase().trim();
    this._status('coop.connecting');
    this._diag(`신호 서버 #${parsed.serverIdx} 연결 중…`);
    const peer = new window.Peer(peerOptions(parsed.serverIdx));
    this.peer = peer;
    let opened = false;
    let settled = false;

    const fail = (kind) => {
      if (settled || this.destroyed) return;
      settled = true;
      this.onError && this.onError(kind);
    };

    const signalTimer = setTimeout(() => {
      if (!peer.open && !this.destroyed) { this._diag('신호 서버 응답 없음.'); fail('signal'); }
    }, HOST_SIGNAL_TIMEOUT);

    peer.on('open', () => {
      if (this.destroyed) return;
      clearTimeout(signalTimer);
      this._status('coop.connecting_peer');
      this._diag(`방 "${parsed.code}" 찾는 중…`);
      const conn = peer.connect(ID_PREFIX + parsed.code, { reliable: true });
      conn._rtc = true; // WebRTC data-channel conn
      this._watchICE(conn, '호스트');
      const failTimer = setTimeout(() => {
        if (!opened) {
          const pc = conn && conn.peerConnection;
          this._diag('연결 시간 초과' + (pc ? ` (ICE: ${pc.iceConnectionState})` : ''));
          fail('timeout');
        }
      }, this._joinTimeout || DATA_TIMEOUT);
      conn.on('open', () => {
        opened = true;
        settled = true;
        clearTimeout(failTimer);
        this._diag('연결 완료! (WebRTC)');
        this.conns = [conn];
        onReady && onReady();
      });
      conn.on('data', (data) => this.onMessage && this.onMessage(data, conn));
      conn.on('close', () => { if (opened) this.onPeerLeave && this.onPeerLeave(conn); });
      conn.on('error', (e) => { this._diag('연결 오류: ' + ((e && e.type) || e)); if (!opened) fail('connect'); });
    });
    peer.on('error', (e) => {
      const type = (e && e.type) || 'error';
      this._diag('오류: ' + type);
      if (type === 'peer-unavailable') { clearTimeout(signalTimer); fail('connect'); } // wrong/expired code
      else if (!opened) { clearTimeout(signalTimer); fail('signal'); }
    });
  }

  // ========================================================================
  // AUTO TRANSPORT — the co-op default. Prefer a private WebRTC data channel
  // (low-latency, reliable, immune to public-broker rate limits) and keep the
  // MQTT relay as an automatic fallback so a locked-down network still connects.
  //   HOST  : listens on BOTH at once under one clean room code.
  //   GUEST : tries WebRTC first, silently falls back to relay on failure.
  // The guest never sees the difference — the same room code works either way.
  // ========================================================================
  hostAuto(onReady) {
    const hasPeer = this.available();
    const hasMqtt = this.mqttAvailable();
    if (!hasPeer && !hasMqtt) { this.onError && this.onError('peerjs-missing'); return; }
    if (!hasPeer) { this.hostMqtt(onReady); return; } // relay only
    if (!hasMqtt) { this.host(onReady); return; }      // WebRTC only

    this.isHost = true;
    this.dual = true;
    const baseCode = genCode();
    const appError = this.onError;
    let announced = false;
    const announce = () => { if (announced) return; announced = true; onReady && onReady(baseCode); };

    // In dual mode a dead relay must NOT abort the session — WebRTC may still serve.
    // Only surface an error if BOTH transports fail to come up (watchdog below).
    this.onError = (kind) => {
      if (this.dual && kind === 'signal') { this._diag('릴레이 준비 실패(무시) · WebRTC 시도 유지'); return; }
      appError && appError(kind);
    };

    this._diag('호스트 시작… (WebRTC + 릴레이 동시 대기)');
    // 1) relay listener on the exact base code (broker 0, no suffix → code stays clean)
    this._mqttStart(baseCode, true, () => { this._diag('릴레이 대기 준비됨'); announce(); }, 0, true);
    // 2) preferred WebRTC listener on the same base code
    this._peerHostFixed(baseCode, () => announce());

    // watchdog: if neither transport announced in time, report the failure to the app
    setTimeout(() => {
      if (!announced && !this.destroyed) { this.onError = appError; appError && appError('signal'); }
    }, 15000);
  }

  // PeerJS host bound to a FIXED code (no server-index suffix), so the same code
  // also works for the relay listener. Signaling server 0 only; if it fails the
  // relay still covers us, so we don't tear anything down.
  _peerHostFixed(baseCode, onUp) {
    if (this.destroyed || !this.available()) return;
    let idRetries = 0;
    const attempt = () => {
      if (this.destroyed) return;
      const peer = new window.Peer(ID_PREFIX + baseCode, peerOptions(0));
      let settled = false;
      peer.on('open', () => {
        if (settled || this.destroyed) { try { peer.destroy(); } catch (e) {} return; }
        settled = true;
        this.peer = peer;
        this._diag(`WebRTC 호스트 준비됨 · 코드 ${baseCode}`);
        this._wireHost(peer);
        onUp && onUp();
      });
      peer.on('error', (e) => {
        const type = (e && e.type) || 'error';
        this._diag('WebRTC 신호 오류: ' + type);
        if (settled || this.destroyed) return;
        if (type === 'unavailable-id' && idRetries < 2) { idRetries++; try { peer.destroy(); } catch (err) {} attempt(); return; }
        // WebRTC unavailable — relay listener still accepts this guest, so leave it be.
      });
    };
    attempt();
  }

  // GUEST: WebRTC first, relay fallback. Same code, transparent to the caller.
  joinAuto(rawCode, onReady) {
    const hasPeer = this.available();
    const hasMqtt = this.mqttAvailable();
    if (!hasPeer && !hasMqtt) { this.onError && this.onError('peerjs-missing'); return; }
    if (!hasPeer) { this.joinMqtt(rawCode, onReady); return; }
    if (!hasMqtt) { this.join(rawCode, onReady); return; }

    const appError = this.onError;
    let done = false;
    const succeed = () => { if (done) return; done = true; this.onError = appError; onReady && onReady(); };
    const fallback = () => {
      if (done) return; done = true;
      this.onError = appError;
      try { if (this.peer) this.peer.destroy(); } catch (e) {}
      this.peer = null;
      this._diag('WebRTC 실패 → 릴레이(MQTT)로 전환');
      this.joinMqtt(rawCode, onReady);
    };
    // any WebRTC error → fall back to relay instead of failing the join
    this.onError = () => fallback();
    this._joinTimeout = 9000; // give WebRTC a fair shot, then fall back quickly
    this._diag('WebRTC 연결 시도 중…');
    this.join(rawCode, succeed);
    setTimeout(() => fallback(), 10000); // hard backstop in case no error fires
  }

  // ========================================================================
  // MANUAL SIGNALING — zero server dependency. Host and guest exchange two
  // text codes by hand (copy/paste). Works whenever WebRTC itself works, even
  // if every signaling relay is down or blocked.
  // ========================================================================
  _encodeSDP(desc) {
    const json = JSON.stringify({ t: desc.type, s: desc.sdp });
    return btoa(unescape(encodeURIComponent(json)));
  }
  _decodeSDP(code) {
    const json = decodeURIComponent(escape(atob(code.trim())));
    const o = JSON.parse(json);
    return { type: o.t, sdp: o.s };
  }

  // wait for ICE gathering to finish (all candidates baked into the SDP), then callback
  _gatherThenCode(pc, cb) {
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      cb(this._encodeSDP(pc.localDescription));
    };
    if (pc.iceGatheringState === 'complete') { finish(); return; }
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') finish(); });
    setTimeout(finish, 4000); // TURN candidates can lag — cap the wait
  }

  _wrapManualChannel(dc) {
    const conn = { open: false, _dc: dc, send: (m) => { try { dc.send(JSON.stringify(m)); } catch (e) {} } };
    dc.onopen = () => {
      conn.open = true;
      this._diag('연결 완료! (수동)');
      this.conns = [conn];
      if (this.isHost) this.onPeerJoin && this.onPeerJoin(conn);
      if (this._manualReady) { this._manualReady(); this._manualReady = null; }
    };
    dc.onmessage = (e) => { try { this.onMessage && this.onMessage(JSON.parse(e.data), conn); } catch (err) {} };
    dc.onclose = () => { conn.open = false; this.onPeerLeave && this.onPeerLeave(conn); };
    return conn;
  }

  // HOST step 1: create an offer code to hand to the friend
  hostManual(onOfferCode) {
    if (typeof RTCPeerConnection === 'undefined') { this.onError && this.onError('peerjs-missing'); return; }
    this.isHost = true;
    this._diag('오퍼 생성 중… (수동)');
    const pc = new RTCPeerConnection(buildIceConfig());
    this._pc = pc;
    pc.oniceconnectionstatechange = () => this._diag('수동 · ICE: ' + pc.iceConnectionState);
    const dc = pc.createDataChannel('np', { ordered: true });
    this._wrapManualChannel(dc);
    pc.createOffer().then((o) => pc.setLocalDescription(o))
      .then(() => this._gatherThenCode(pc, onOfferCode))
      .catch(() => this.onError && this.onError('connect'));
  }

  // HOST step 2: paste the friend's answer code → link opens
  finishManual(answerCode, onReady) {
    try {
      this._manualReady = onReady;
      this._pc.setRemoteDescription(this._decodeSDP(answerCode)).catch(() => this.onError && this.onError('connect'));
    } catch (e) { this.onError && this.onError('connect'); }
  }

  // GUEST: paste the host's offer code → produce an answer code to send back
  acceptManual(offerCode, onAnswerCode, onReady) {
    if (typeof RTCPeerConnection === 'undefined') { this.onError && this.onError('peerjs-missing'); return; }
    this.isHost = false;
    this._manualReady = onReady;
    let offer;
    try { offer = this._decodeSDP(offerCode); } catch (e) { this.onError && this.onError('connect'); return; }
    this._diag('응답 생성 중… (수동)');
    const pc = new RTCPeerConnection(buildIceConfig());
    this._pc = pc;
    pc.oniceconnectionstatechange = () => this._diag('수동 · ICE: ' + pc.iceConnectionState);
    pc.ondatachannel = (e) => this._wrapManualChannel(e.channel);
    pc.setRemoteDescription(offer)
      .then(() => pc.createAnswer())
      .then((a) => pc.setLocalDescription(a))
      .then(() => this._gatherThenCode(pc, onAnswerCode))
      .catch(() => this.onError && this.onError('connect'));
  }

  // Two kinds of conn: relay wrappers (_mqtt, publish through the broker) and direct
  // channels (WebRTC or manual, have a real .send). A single host can hold a mix.
  send(msg, conn) {
    // explicit target conn → use ITS transport
    if (conn) {
      if (conn._mqtt) { this._mqttPublish(conn.id, msg); return; }
      try { conn.send(msg); } catch (e) { /* dropped */ } // direct channel
      return;
    }
    // no target (typically the guest → host)
    const c = this.conns[0];
    if (c && !c._mqtt) { try { c.send(msg); } catch (e) { /* dropped */ } return; } // direct
    if (this.mode === 'mqtt') {
      if (!this.isHost) this._mqttPublish('host', msg);
      else if (c) this._mqttPublish(c.id, msg);
      return;
    }
    if (c) { try { c.send(msg); } catch (e) { /* dropped frame */ } }
  }

  broadcast(msg) {
    // direct peers (WebRTC / manual): send over each channel
    let hasRelayPeer = false;
    for (const c of this.conns) {
      if (c._mqtt) { hasRelayPeer = true; continue; }
      try { c.send(msg); } catch (e) { /* dropped */ }
    }
    // relay peers: one fan-out publish covers all of them
    if (this.mode === 'mqtt' && (hasRelayPeer || this.conns.length === 0)) this._mqttPublish('all', msg);
  }

  destroy() {
    this.destroyed = true;
    this.dual = false;
    this._joinTimeout = null;
    this.onMessage = this.onPeerJoin = this.onPeerLeave = this.onError = this.onStatus = this.onDiag = null;
    try { if (this.mqtt) this.mqtt.end(true); } catch (e) { /* gone */ }
    this.mqtt = null;
    if (this.mqttConnById) this.mqttConnById.clear();
    this._manualReady = null;
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* gone */ }
    try { if (this._pc) this._pc.close(); } catch (e) { /* gone */ }
    this.peer = null;
    this._pc = null;
    this.conns = [];
  }
}
