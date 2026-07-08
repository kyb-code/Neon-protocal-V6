// main.js — bootstrap, game state machine, main loop
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { Effects, Background } from './effects.js';
import { Meta, SHIP_COLORS, SHIP_SHAPES, KILL_FX, DASH_FX, SPECIAL_ITEMS, RAID_ITEMS } from './meta.js';
import { Player } from './player.js';
import { World, SECTORS } from './world.js';
import { UI } from './ui.js';
import { rollUpgrades, rollEpic } from './upgrades.js';
import { MinigameHost, pickMinigame } from './minigames.js';
import { Story } from './story.js';
import { Net } from './net.js';
import { CoopWorld, GuestClient, RemoteInput, coopRewards } from './coop.js';
import { Accounts } from './accounts.js';
import { PvpWorld, PvpGuestView, DEFAULT_LOADOUT, pvpRewards, PVP_PALETTE } from './pvp.js';
import { TelemetryPublisher, TelemetryWatcher } from './telemetry.js';
import { UPGRADES } from './upgrades.js';
import { t, setLang } from './i18n.js';
import { clamp } from './utils.js';

const MENU_PALETTE = SECTORS[0].palette;

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.input = new Input(this.canvas);
    this.audio = new AudioSys();
    this.effects = new Effects();
    this.background = new Background();
    this.accounts = new Accounts();
    this.meta = new Meta();
    if (this.accounts.current()) this.meta.setUser(this.accounts.current());
    this.telemetry = new TelemetryPublisher();
    this.ui = new UI(this);

    this.state = 'title'; // title | menu | story | run | pause | levelup | epic | path | minigame | over
    this.world = null;
    this.player = null;
    this.story = null;
    this.minigame = null;
    this.minigameReturn = null; // what to do after a minigame ends
    this.net = null;
    this.guest = null;
    this.pvp = null;
    this.coopMode = 'raid';
    this.coopRoster = null;
    this.coopCode = null;
    this.rerollsLeft = 0;
    this.levelUpQueue = 0;
    this.pendingFlow = null;
    this.lastTime = 0;

    this.applySettings();

    this.resize();
    window.addEventListener('resize', () => this.resize());

    // global keys
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.state === 'run' || this.state === 'pause') this.togglePause();
        else if (this.state === 'coop' || this.state === 'pvp') this.abortCoop();
        else if (this.state === 'coopLobby') this.leaveCoop();
      }
      // number-key shortcuts on card screens
      if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
        const idx = +e.code.slice(5) - 1;
        const cards = document.querySelectorAll('#screen-levelup .card, #screen-path .card, #screen-epic .card, #coop-offer .card');
        if (cards[idx]) cards[idx].click();
      }
    });
    // auto-pause on focus loss during a run
    window.addEventListener('blur', () => {
      if (this.state === 'run') this.togglePause();
    });

    this.ui.showTitle();
    requestAnimationFrame((ts) => this.frame(ts));
  }

  t(key, params) { return t(key, params); }

  applyCustomization(player) {
    const cu = this.meta.data.custom || { color: 0, shape: 0 };
    player.color = cu.color === 'rainbow' && this.accounts.isAdmin()
      ? 'rainbow'
      : (SHIP_COLORS[cu.color] || SHIP_COLORS[0]).c;
    player.shape = (SHIP_SHAPES[cu.shape] || SHIP_SHAPES[0]).id;
    player.dashFxStyle = this.meta.dashFxStyle().style;
  }

  currentColorHex() {
    const cu = this.meta.data.custom || { color: 0, shape: 0 };
    return cu.color === 'rainbow' && this.accounts.isAdmin() ? 'rainbow' : (SHIP_COLORS[cu.color] || SHIP_COLORS[0]).c;
  }

  // the name shown above your ship in multiplayer: account name, else saved nickname, else Player
  displayName() {
    const acc = this.accounts.current();
    if (acc) return acc;
    const n = (this.meta.data.nickname || '').trim();
    return n || 'Player';
  }

  // display title/칭호 an admin granted this account (shown as a tag in multiplayer)
  displayTitle() {
    const acc = this.accounts.current();
    if (!acc) return '';
    return (this.accounts.titleOf && this.accounts.titleOf(acc)) || '';
  }

  // live snapshot of what this player is doing, for the admin monitor
  telemetryBeacon() {
    const name = this.displayName();
    if (this.state === 'run' && this.world && this.player) {
      return { id: 'run_' + name, name, mode: 'SOLO', sector: this.world.sector, wave: this.world.wave,
        kills: this.player.stats.kills, level: this.player.level, hp: Math.round(this.player.hp), at: Date.now() };
    }
    if (this.state === 'coop' && this.world && this.world.isCoop) {
      return { id: 'coop_' + this.coopCode, name, mode: 'CO-OP', room: this.coopCode,
        wave: this.world.wave, players: this.world.players.length, alive: this.world.alivePlayers().length,
        lvl: this.world.teamLevel, at: Date.now() };
    }
    if (this.state === 'coopGuest' && this.guest) {
      const s = this.guest.snap;
      return { id: 'guest_' + name, name, mode: 'CO-OP(join)', wave: s ? s.w : 0, at: Date.now() };
    }
    if (this.state === 'pvp' && this.pvp) {
      return { id: 'pvp_' + this.coopCode, name, mode: 'PVP', room: this.coopCode,
        score: this.pvp.duelists.map((d) => d.score).join(':'), round: this.pvp.round, at: Date.now() };
    }
    return null;
  }

  startTelemetry() { if (this.telemetry) this.telemetry.start(() => this.telemetryBeacon()); }
  stopTelemetry() { if (this.telemetry) this.telemetry.stop(); }

  // admin live monitor: watch all players' telemetry beacons
  startAdminWatch(onUpdate) {
    this.stopAdminWatch();
    this.adminWatcher = new TelemetryWatcher(onUpdate);
    this.adminWatcher.start();
  }
  stopAdminWatch() { if (this.adminWatcher) { this.adminWatcher.stop(); this.adminWatcher = null; } }

  applySettings() {
    const st = this.meta.data.settings;
    setLang(st.lang);
    this.audio.volumes = { master: st.master, sfx: st.sfx, music: st.music };
    this.audio.applyVolumes();
    this.effects.shakeEnabled = st.shake;
    this.effects.quality = st.quality === 'high' ? 1 : 0.45;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
    this.dpr = dpr;
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
  }

  refreshStaticText() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    if (this.state === 'run') this.ui.setHint(t('hud.hint_move'));
  }

  // ---------- state transitions ----------
  toMenu() {
    this.stopTelemetry();
    this.state = 'menu';
    this.world = null;
    this.pvp = null;
    this.player = null;
    this.story = null;
    this.minigame = null;
    this.pendingFlow = null;
    this.effects.clear();
    this.ui.showHUD(false);
    this.audio.startMusic(0, 0.3);
    this.audio.setIntensity(0.3);
    this.ui.showMenu();
  }

  // first title dismissal → story once, then menu
  afterTitle() {
    if (!this.meta.data.storySeen) this.startStory(false);
    else this.toMenu();
  }

  startStory(isReplay) {
    this.audio.ensure();
    this.audio.startMusic(0, 0.35);
    this.state = 'story';
    this.ui.clear();
    this.ui.showHUD(false);
    this.story = new Story(this, () => {
      this.meta.data.storySeen = true;
      this.meta.save();
      this.story = null;
      this.toMenu();
    });
  }

  // ---------- accounts ----------
  async doLogin(id, pw, isRegister) {
    const res = isRegister ? await this.accounts.register(id, pw) : await this.accounts.login(id, pw);
    if (res.ok) {
      this.meta.setUser(this.accounts.current());
      this.applySettings();
      this.audio.sfx('unlock');
      this.toMenu();
    }
    return res;
  }

  doLogout() {
    this.accounts.logout();
    this.meta.setUser(null);
    this.applySettings();
    this.audio.sfx('uiBack');
    this.toMenu();
  }

  // admin privilege: unlock every core, color and cosmetic + a currency stack
  adminUnlockAll() {
    const m = this.meta;
    m.data.rubies += 200;
    m.data.credits += 9999;
    m.data.unlockedCores = ['standard', 'blink', 'phantom', 'surge', 'ricochet', 'gemini', 'vortex'];
    m.data.unlockedColors = SHIP_COLORS.map((_, i) => i);
    m.data.ownedFx = [...KILL_FX.map((f) => f.id), ...DASH_FX.map((f) => f.id)];
    m.data.items = SPECIAL_ITEMS.map((it) => it.id).concat(RAID_ITEMS.map((it) => it.id));
    m.save();
  }

  // menu start button: sector key owners pick a start sector first
  requestStartRun() {
    if (this.meta.bonuses().sectorKey) this.ui.showSectorStart();
    else this.startRun(1);
  }

  startRun(startSector = 1) {
    this.audio.ensure();
    const bonuses = this.meta.bonuses();
    this.player = new Player(this.meta.data.core, bonuses);
    this.applyCustomization(this.player);
    this.rerollsLeft = bonuses.rerolls;
    this.levelUpQueue = 0;
    this.pendingFlow = null;
    this.rubiesThisRun = 0;
    this.effects.clear();
    this.world = new World(this);
    this.world.killFxStyle = this.meta.killFxStyle().style;
    if (startSector > 1) {
      this.world.sector = startSector;
      this.world.nodeIndex = 0;
      this.audio.setRoot(startSector - 1);
      this.world.startNode('combat');
    }
    this.ui.showHUD(true);
    this.ui.setHint(t('hud.hint_move'));
    this.ui.buildPips(this.player.maxDashCharges);
    this.audio.startMusic(0, 0.5);
    if (startSector === 1) this.audio.setRoot(0);
    this.meta.data.stats.runs += 1;
    this.meta.save();
    // Boot Loader: start at level 3, pick upgrades right after the briefing
    if (bonuses.startLevel > 1) {
      this.player.level = bonuses.startLevel;
      this.player.xpNeed = Math.round(6 + this.player.level * 3.2 + Math.pow(this.player.level, 1.45));
      this.levelUpQueue = bonuses.startLevel - 1;
    }
    // mission briefing before the fight starts
    this.startTelemetry();
    this.state = 'sectorintro';
    this.ui.showSectorIntro(this.world.sectorDef, () => {
      this.announce(this.worldSectorName(), '#00f0ff');
      if (this.levelUpQueue > 0) { this.openLevelUp(); return; }
      this.state = 'run';
      this.ui.clear();
    });
  }

  // ---------- co-op / versus multiplayer ----------
  // live connection diagnostics — shown in the lobby so failures are visible
  pushDiag(text) {
    if (!this.netDiag) this.netDiag = [];
    this.netDiag.push(text);
    if (this.netDiag.length > 30) this.netDiag.shift();
    const el = document.getElementById('coop-diag');
    if (el) {
      el.innerHTML = this.netDiag.map((l) => `<div>› ${l}</div>`).join('');
      el.scrollTop = el.scrollHeight;
    }
  }

  wireNetCommon() {
    this.netDiag = [];
    this.net.onDiag = (text) => this.pushDiag(text);
  }

  myLoadout() {
    return Object.assign({}, DEFAULT_LOADOUT, this.meta.data.pvpLoadout || {});
  }

  setLoadout(slot, skillId) {
    this.meta.data.pvpLoadout = this.myLoadout();
    this.meta.data.pvpLoadout[slot] = skillId;
    this.meta.save();
    // guests tell the host about loadout changes
    if (this.net && !this.net.isHost) this.net.send({ t: 'loadout', loadout: this.meta.data.pvpLoadout });
  }

  hostCoop(mode = 'raid') {
    this.audio.ensure();
    if (this.net) this.net.destroy();
    this.net = new Net();
    if (!this.net.mqttAvailable()) { this.ui.showCoopMenu(t('coop.error')); return; }
    this.wireNetCommon();
    this.coopMode = mode;
    this.state = 'coopLobby';
    const cu = this.meta.data.custom || { color: 0, shape: 0 };
    this.coopRoster = [{
      name: this.displayName(),
      title: this.displayTitle(),
      color: this.currentColorHex(),
      shape: (SHIP_SHAPES[cu.shape] || SHIP_SHAPES[0]).id,
      bonuses: this.meta.bonuses(),
      core: this.meta.data.core,
      conn: null,
    }];
    this.ui.showLobby({ code: '…', roster: this.coopRoster, isHost: true, youIndex: 0, mode });
    this.net.onStatus = (key) => { if (this.state === 'coopLobby' && !this.coopCode) this.ui.showLobby({ code: t(key), roster: this.coopRoster, isHost: true, youIndex: 0, mode: this.coopMode }); };
    this.net.onError = (e) => { if (this.state === 'coopLobby') this.ui.showCoopMenu(t(e === 'signal' ? 'coop.error_signal' : 'coop.error'), this.netDiag); };
    this.net.onPeerJoin = () => { /* waits for hello */ };
    this.net.onPeerLeave = (conn) => {
      const i = this.coopRoster.findIndex((r) => r.conn === conn);
      if (i > 0) {
        this.coopRoster.splice(i, 1);
        if (this.state === 'coopLobby') this.refreshLobby();
        else if (this.world && this.world.isCoop) {
          const ei = this.world.entries.findIndex((en) => en.conn === conn);
          if (ei > 0) {
            this.world.entries[ei].player.out = true;
            this.world.entries.splice(ei, 1);
            this.world.players.splice(ei, 1);
          }
        }
      }
    };
    this.net.onMessage = (msg, conn) => this.hostHandleMessage(msg, conn);
    this.net.hostAuto((code) => {
      this.coopCode = code;
      if (this.state === 'coopLobby') this.refreshLobby();
    });
  }

  // ---- manual (serverless) connection: host ----
  hostCoopManual(mode = 'raid') {
    this.audio.ensure();
    if (this.net) this.net.destroy();
    this.net = new Net();
    this.wireNetCommon();
    this.coopMode = mode;
    this.state = 'coopLobby';
    const cu = this.meta.data.custom || { color: 0, shape: 0 };
    this.coopRoster = [{
      name: this.displayName(),
      title: this.displayTitle(),
      color: this.currentColorHex(),
      shape: (SHIP_SHAPES[cu.shape] || SHIP_SHAPES[0]).id,
      bonuses: this.meta.bonuses(),
      core: this.meta.data.core,
      conn: null,
    }];
    this._offerCode = '';
    this.net.onError = () => this.ui.showManualConnect('host', { mode, offerCode: this._offerCode, error: t('coop.error') });
    this.net.onPeerJoin = () => {};
    this.net.onPeerLeave = (conn) => {
      const i = this.coopRoster.findIndex((r) => r.conn === conn);
      if (i > 0) { this.coopRoster.splice(i, 1); if (this.state === 'coopLobby') this.refreshLobby(); }
    };
    this.net.onMessage = (msg, conn) => this.hostHandleMessage(msg, conn);
    this.net.hostManual((offerCode) => {
      this._offerCode = offerCode;
      if (this.state === 'coopLobby' && this.coopRoster.length < 2) this.ui.showManualConnect('host', { mode, offerCode });
    });
  }

  submitManualAnswer(answerCode) {
    if (!this.net || !answerCode) return;
    this.net.finishManual(answerCode, () => { /* guest 'hello' drives the lobby */ });
    this.ui.showManualConnect('host', { mode: this.coopMode, offerCode: this._offerCode, waiting: true });
  }

  // ---- manual connection: guest ----
  joinCoopManual() {
    this.state = 'coopLobby';
    this.ui.showManualConnect('guest', {});
  }

  submitManualOffer(offerCode) {
    if (!offerCode) return;
    this.audio.ensure();
    if (this.net) this.net.destroy();
    this.net = new Net();
    this.wireNetCommon();
    this.net.onError = () => this.ui.showManualConnect('guest', { error: t('coop.error') });
    this.net.onPeerLeave = () => this.leaveCoop(t('coop.host_left'));
    this.net.onMessage = (msg) => this.guestHandleMessage(msg);
    this.net.acceptManual(offerCode,
      (answerCode) => this.ui.showManualConnect('guest', { answerCode }),
      () => {
        const cu = this.meta.data.custom || { color: 0, shape: 0 };
        this.net.send({
          t: 'hello', name: this.accounts.current() || null,
          color: this.currentColorHex(), shape: (SHIP_SHAPES[cu.shape] || SHIP_SHAPES[0]).id,
          bonuses: this.meta.bonuses(), core: this.meta.data.core,
        });
      });
  }

  refreshLobby() {
    this.ui.showLobby({ code: this.coopCode, roster: this.coopRoster, isHost: true, youIndex: 0, mode: this.coopMode });
    this.net.broadcast({ t: 'lobby', mode: this.coopMode, roster: this.coopRoster.map((r) => ({ name: r.name, title: r.title || '', color: r.color, shape: r.shape })) });
  }

  hostHandleMessage(msg, conn) {
    if (msg.t === 'hello' && this.state === 'coopLobby') {
      // duplicate hello (guest retrying) → just re-send the lobby, don't add again
      if (this.coopRoster.some((r) => r.conn === conn)) { this.refreshLobby(); return; }
      const cap = this.coopMode === 'pvp' ? 2 : 4;
      if (this.coopRoster.length >= cap) return;
      this.coopRoster.push({
        name: (msg.name && /^[\w가-힣 ]{1,16}$/.test(msg.name) ? msg.name : 'P' + (this.coopRoster.length + 1)),
        title: (typeof msg.title === 'string' ? msg.title.slice(0, 20) : ''),
        color: msg.color || '#4aff8f',
        shape: msg.shape || 'vector',
        bonuses: msg.bonuses || this.meta.bonuses(),
        core: msg.core || 'standard',
        conn,
      });
      this.refreshLobby();
      this.audio.sfx('unlock');
    } else if (msg.t === 'loadout') {
      const r = this.coopRoster && this.coopRoster.find((x) => x.conn === conn);
      if (r) r.loadout = msg.loadout;
    } else if (msg.t === 'i' && this.state === 'pvp' && this.pvp) {
      this.pvp.onRemoteInput(msg);
    } else if (msg.t === 'i' && this.world && this.world.isCoop) {
      const entry = this.world.entries.find((e) => e.conn === conn);
      if (entry) entry.input.set(msg);
    } else if (msg.t === 'pick' && this.world && this.world.isCoop) {
      const entry = this.world.entries.find((e) => e.conn === conn);
      if (entry) this.world.applyPick(entry, msg.id);
    }
  }

  // ---------- 1v1 duel ----------
  startPvpDuel() {
    if (!this.coopRoster || this.coopRoster.length !== 2) return;
    const roster = this.coopRoster.map((r) => ({ name: r.name, title: r.title || '', color: r.color, shape: r.shape }));
    const loadouts = [this.myLoadout(), Object.assign({}, DEFAULT_LOADOUT, this.coopRoster[1].loadout || {})];
    this.net.send({ t: 'start', mode: 'pvp', roster, you: 1, loadouts }, this.coopRoster[1].conn);
    this.effects.clear();
    this.pvp = new PvpWorld(this, this.net, loadouts, roster);
    this.startTelemetry();
    this.state = 'pvp';
    this.ui.clear();
    this.ui.showHUD(false);
    this.audio.startMusic(2, 0.7);
    this.audio.setRoot(2);
  }

  pvpOver(won) {
    if (this.state === 'coopOver') return;
    const rewards = pvpRewards(won);
    this.meta.addRubies(rewards.rubies);
    this.meta.data.credits += rewards.credits;
    this.meta.save();
    this.accounts.snapshot(this.meta.data.stats);
    this.state = 'coopOver';
    this.pvp = null;
    this.guest = null;
    this.ui.showHUD(false);
    this.audio.sfx(won ? 'victory' : 'defeat');
    this.ui.showCoopResult(won, rewards, null, () => this.leaveCoop(), true);
  }

  startCoopRaid() {
    if (!this.coopRoster || this.coopRoster.length < 2) return;
    const entries = this.coopRoster.map((r, i) => {
      const player = new Player(r.core, r.bonuses);
      player.color = r.color;
      player.shape = r.shape;
      return {
        player,
        input: i === 0 ? this.input : new RemoteInput(),
        conn: r.conn,
        remote: i !== 0,
        name: r.name,
        title: r.title || '',
        colorHex: r.color,
      };
    });
    // per-guest start message with their own index — sent a few times to survive packet loss
    const roster = this.coopRoster.map((r) => ({ name: r.name, title: r.title || '', color: r.color, shape: r.shape }));
    const sendStarts = () => this.coopRoster.forEach((r, i) => { if (r.conn) this.net.send({ t: 'start', roster, you: i }, r.conn); });
    sendStarts();
    let reps = 0;
    const rt = setInterval(() => { if (++reps >= 4 || !this.net) { clearInterval(rt); return; } sendStarts(); }, 400);
    this.player = entries[0].player;
    this.effects.clear();
    this.world = new CoopWorld(this, entries, this.net);
    this.startTelemetry();
    this.state = 'coop';
    this.ui.clear();
    this.ui.showHUD(true);
    this.ui.setHint(t('hud.hint_move'));
    this.ui.buildPips(this.player.maxDashCharges);
    this.audio.startMusic(4, 0.6);
    this.audio.setRoot(4);
  }

  joinCoop(code) {
    if (!code || code.trim().length < 4) return;
    this.audio.ensure();
    if (this.net) this.net.destroy();
    this.net = new Net();
    if (!this.net.mqttAvailable()) { this.ui.showCoopMenu(t('coop.error')); return; }
    this.wireNetCommon();
    this.state = 'coopLobby';
    this.ui.showLobby({ code: null, roster: [], isHost: false, joining: true });
    this.net.onError = (e) => this.ui.showCoopMenu(t(e === 'signal' ? 'coop.error_signal' : e === 'timeout' ? 'coop.error_timeout' : 'coop.error'), this.netDiag);
    this.net.onPeerLeave = () => this.leaveCoop(t('coop.host_left'));
    this.net.onMessage = (msg) => this.guestHandleMessage(msg);
    const sendHello = () => {
      const cu = this.meta.data.custom || { color: 0, shape: 0 };
      this.net.send({
        t: 'hello',
        name: this.displayName(), title: this.displayTitle(),
        color: this.currentColorHex(),
        shape: (SHIP_SHAPES[cu.shape] || SHIP_SHAPES[0]).id,
        bonuses: this.meta.bonuses(),
        core: this.meta.data.core,
      });
    };
    this.net.joinAuto(code, () => {
      sendHello();
      // keep announcing until the host acknowledges — survives dropped packets / late host subscribe
      this.clearHelloRetry();
      this.helloRetry = setInterval(() => {
        if (this.state !== 'coopLobby') { this.clearHelloRetry(); return; }
        sendHello();
      }, 1500);
    });
  }

  clearHelloRetry() { if (this.helloRetry) { clearInterval(this.helloRetry); this.helloRetry = null; } }

  guestHandleMessage(msg) {
    if (msg.t === 'lobby' && this.state === 'coopLobby') {
      const you = msg.roster.length - 1; // best effort: we are the newest? host sends explicit index at start
      this.coopMode = msg.mode || 'raid';
      this.ui.showLobby({ code: null, roster: msg.roster, isHost: false, youIndex: you, mode: this.coopMode });
      // make sure the host has our current loadout for duels
      if (this.coopMode === 'pvp') this.net.send({ t: 'loadout', loadout: this.myLoadout() });
    } else if (msg.t === 'start') {
      this.clearHelloRetry();
      if (this.state === 'coopGuest' && this.guest) return; // duplicate start (host re-sent) — ignore
      this.guest = msg.mode === 'pvp'
        ? new PvpGuestView(this, this.net, msg.roster, msg.loadouts || [])
        : new GuestClient(this, this.net, msg.you, msg.roster);
      this.startTelemetry();
      this.state = 'coopGuest';
      this.ui.clear();
      this.ui.showHUD(false);
      this.audio.startMusic(msg.mode === 'pvp' ? 2 : 4, 0.65);
      this.audio.setRoot(msg.mode === 'pvp' ? 2 : 4);
    } else if (msg.t === 's' && this.guest) {
      this.guest.onSnapshot(msg);
    } else if (msg.t === 'offer' && this.guest) {
      const cards = msg.cards.map((id) => UPGRADES.find((u) => u.id === id)).filter(Boolean);
      this.ui.showCoopOffer(cards, (u) => this.net.send({ t: 'pick', id: u.id }));
    } else if (msg.t === 'over') {
      if (msg.pvp) this.pvpOver(msg.v);
      else this.coopOver(msg.v);
    }
  }

  coopOver(victory) {
    const rewards = coopRewards(victory);
    this.meta.addRubies(rewards.rubies);
    this.meta.data.credits += rewards.credits;
    if (victory) this.meta.data.stats.victories += 1;
    // raid trophies drop only from raid victories
    let trophy = null;
    if (victory) {
      trophy = this.meta.grantRaidTrophy();
      if (!trophy) { this.meta.addRubies(5); rewards.rubies += 5; } // full collection → bonus rubies
    }
    this.meta.save();
    this.accounts.snapshot(this.meta.data.stats);
    this.state = 'coopOver';
    this.guest = null;
    this.ui.hideCoopOffer();
    this.ui.showHUD(false);
    this.audio.sfx(victory ? 'victory' : 'defeat');
    this.audio.setIntensity(victory ? 0.6 : 0.2);
    this.ui.showCoopResult(victory, rewards, trophy, () => this.leaveCoop());
  }

  leaveCoop(reason) {
    this.clearHelloRetry();
    if (this.net) { this.net.destroy(); this.net = null; }
    this.guest = null;
    this.pvp = null;
    this.coopRoster = null;
    this.ui.hideCoopOffer();
    this.toMenu();
    if (reason) this.ui.showCoopMenu(reason);
  }

  abortCoop() {
    // host bails: end the raid for everyone
    if (this.net && this.net.isHost) this.net.broadcast({ t: 'over', v: false });
    this.leaveCoop();
  }

  // ---------- minigames (bonus stages) ----------
  minigameReward() {
    return 3 + (this.meta.bonuses().minigameRubyBonus || 0);
  }

  startMinigame(returnTo) {
    this.minigameReturn = returnTo; // 'path' | 'sector'
    const def = pickMinigame(this.meta);
    this.state = 'minigame';
    this.ui.clear();
    this.audio.setIntensity(0.35);
    this.minigame = new MinigameHost(this, def, (won) => this.endMinigame(won, def));
  }

  endMinigame(won, def) {
    this.minigame = null;
    if (!this.meta.data.playedMinigames.includes(def.id)) this.meta.data.playedMinigames.push(def.id);
    if (won) {
      const r = this.minigameReward();
      this.meta.addRubies(r);
      this.rubiesThisRun += r;
      this.meta.data.stats.minigameWins += 1;
      if (this.world) this.world.creditsEarned += 30;
      this.announce(`+${r} ◆  +30 ⬡`, '#ff5e8a');
    } else {
      // consolation: still 1 ruby + some coins
      this.meta.addRubies(1);
      this.rubiesThisRun += 1;
      if (this.world) this.world.creditsEarned += 10;
      this.announce('+1 ◆  +10 ⬡', '#6d8aa5');
    }
    this.meta.save();
    if (this.minigameReturn === 'sector') {
      // after a sector boss: story briefing for the next sector, then its path choice
      this.state = 'sectorintro';
      this.ui.showSectorIntro(this.world.sectorDef, () => {
        this.state = 'path';
        this.ui.showPath(this.world.pathOptions());
      });
    } else {
      this.showPathScreen();
    }
  }

  worldSectorName() {
    const { L } = { L: (o) => o[this.meta.data.settings.lang] || o.en };
    return L(this.world.sectorDef.name);
  }

  togglePause() {
    if (this.state === 'run') {
      this.state = 'pause';
      this.audio.setIntensity(0.15);
      this.ui.showPause();
    } else if (this.state === 'pause') {
      this.state = 'run';
      this.audio.setIntensity(0.5);
      this.ui.clear();
    }
  }

  abortRun() {
    // bank credits even when aborting
    this.finalizeRun(false, true);
    this.toMenu();
  }

  announce(text, color) {
    if (this.state === 'coopLobby') return; // suppress construction noise
    this.ui.announce(text, color);
  }
  flashDamage() { this.ui.flashDamage(); }

  // ---------- world callbacks ----------
  onLevelUp() {
    this.levelUpQueue += 1;
    this.audio.sfx('levelup');
    this.effects.shockwave(this.player.x, this.player.y, '#ff2fd6', 90, 4);
    if (this.state === 'run') this.openLevelUp();
  }

  openLevelUp() {
    if (this.levelUpQueue <= 0) return;
    this.state = 'levelup';
    this.currentChoices = rollUpgrades(this.player, 3);
    this.ui.showLevelUp(this.currentChoices, this.rerollsLeft);
  }

  pickUpgrade(u) {
    u.apply(this.player);
    this.player.upgradeCounts[u.id] = (this.player.upgradeCounts[u.id] || 0) + 1;
    this.audio.sfx('purchase');
    this.levelUpQueue -= 1;
    if (this.levelUpQueue > 0) { this.openLevelUp(); return; }
    // a node-clear / boss-clear flow may have arrived while the card screen was open —
    // run it now instead of letting it clobber the cards (fixes "cards vanish on boss spawn")
    if (this.pendingFlow) {
      const f = this.pendingFlow;
      this.pendingFlow = null;
      f();
      return;
    }
    this.state = 'run';
    this.ui.clear();
  }

  // run `flow` now, or defer it if the player is busy picking cards
  runOrDefer(flow) {
    if (this.state === 'levelup' || this.state === 'epic') this.pendingFlow = flow;
    else flow();
  }

  rerollUpgrades() {
    if (this.rerollsLeft <= 0) return;
    this.rerollsLeft -= 1;
    this.currentChoices = rollUpgrades(this.player, 3);
    this.ui.showLevelUp(this.currentChoices, this.rerollsLeft);
  }

  onNodeCleared() {
    // brief delay so the clear moment breathes, then reward/path
    setTimeout(() => {
      if (!this.world || this.state === 'over') return;
      this.runOrDefer(() => {
        if (!this.world || this.state === 'over') return;
        if (this.world.pendingReward === 'epic') {
          this.world.pendingReward = null;
          const epic = rollEpic(this.player);
          if (epic) {
            this.state = 'epic';
            this.ui.showEpicReward(epic);
            return;
          }
        }
        this.showPathScreen();
      });
    }, 900);
  }

  takeEpicReward(u) {
    u.apply(this.player);
    this.player.upgradeCounts[u.id] = (this.player.upgradeCounts[u.id] || 0) + 1;
    this.audio.sfx('unlock');
    this.showPathScreen();
  }

  showPathScreen() {
    if (!this.world) return;
    this.world.nodeIndex += 1;
    this.state = 'path';
    this.ui.showPath(this.world.pathOptions());
  }

  choosePath(type) {
    if (type === 'bonus') {
      this.ui.clear();
      this.startMinigame('path');
      return;
    }
    this.state = 'run';
    this.ui.clear();
    this.world.advanceToNode(type);
  }

  onBossSpawn(boss) { /* HUD reads world.boss directly */ }

  onBossDefeated() {
    this.announce(t('announce.sector_clear'), '#4aff8f');
    this.audio.sfx('victory');
    const isFinal = this.world.sector >= SECTORS.length;
    setTimeout(() => {
      if (!this.world || this.state === 'over') return;
      this.runOrDefer(() => {
        if (!this.world || this.state === 'over') return;
        if (isFinal) {
          this.gameOver(true);
        } else {
          // reward stage between sectors, then the next sector's path choice
          this.world.nextSector();
          this.world.nodeIndex = 0;
          this.announce(this.worldSectorName(), this.world.palette.accent);
          this.startMinigame('sector');
        }
      });
    }, 1600);
  }

  onPlayerDeath() {
    this.audio.sfx('defeat');
    this.effects.shake(20);
    this.effects.burst(this.player.x, this.player.y, '#00f0ff', 60, 500, { size: 8 });
    this.effects.shockwave(this.player.x, this.player.y, '#00f0ff', 300, 10);
    setTimeout(() => this.gameOver(false), 1400);
  }

  finalizeRun(victory, silent = false) {
    if (!this.world) return null;
    const w = this.world, p = this.player, s = this.meta.data.stats;
    const credits = w.creditsEarned;
    this.meta.data.credits += credits;
    s.kills += p.stats.kills;
    s.dashes += p.stats.dashes;
    const newBest = w.sector > s.bestSector;
    if (newBest) s.bestSector = w.sector;
    if (w.wavesCleared > s.bestWaves) s.bestWaves = w.wavesCleared;
    if (p.stats.kills > s.bestKillsRun) s.bestKillsRun = p.stats.kills;
    if (victory) s.victories += 1;
    const unlocks = this.meta.checkUnlocks();
    this.meta.save();
    this.accounts.snapshot(this.meta.data.stats);
    if (unlocks.length && !silent) this.audio.sfx('unlock');
    return {
      sector: w.sector, waves: w.wavesCleared, kills: p.stats.kills,
      dashes: p.stats.dashes, level: p.level, time: w.runTime,
      credits, rubies: this.rubiesThisRun, newBest, unlocks,
    };
  }

  gameOver(victory) {
    if (this.state === 'over') return;
    const data = this.finalizeRun(victory);
    this.state = 'over';
    this.audio.setIntensity(victory ? 0.6 : 0.2);
    if (victory) this.audio.sfx('victory');
    this.ui.showHUD(false);
    this.ui.showResults(victory, data);
  }

  // ---------- main loop ----------
  frame(ts) {
    const dt = clamp((ts - this.lastTime) / 1000, 0, 0.05);
    this.lastTime = ts;
    const ctx = this.ctx;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.background.update(dt);

    // touch: aim stick feeds the mouse-aim; QWER buttons only shown in PVP
    this.input.showSkills = (this.state === 'pvp' || this.state === 'coopGuest') && this.coopMode === 'pvp';
    const playing = ['run', 'coop', 'pvp', 'coopGuest', 'minigame'].includes(this.state);
    if (playing) this.input.syncTouchAim();

    if (this.state === 'story' && this.story) {
      this.story.update(dt, this.input);
      if (this.story && !this.story.done) this.story.draw(ctx, this.vw, this.vh);
    } else if (this.state === 'coopGuest' && this.guest) {
      this.guest.update(dt, this.input, this.vw, this.vh);
      if (this.guest) this.guest.draw(ctx, this.vw, this.vh);
      this.effects.drawFlash(ctx, this.vw, this.vh);
    } else if (this.state === 'pvp' && this.pvp) {
      this.pvp.update(dt, this.input, this.vw, this.vh);
      if (this.pvp) {
        this.background.draw(ctx, this.vw, this.vh, this.pvp.camX, this.pvp.camY, PVP_PALETTE);
        this.pvp.draw(ctx, this.vw, this.vh);
        this.effects.drawFlash(ctx, this.vw, this.vh);
      }
    } else if (this.world) {
      if (this.state === 'run' || this.state === 'coop') {
        this.world.update(dt, this.input, this.vw, this.vh);
        this.ui.updateHUD(this.world);
      } else if (['pause', 'levelup', 'epic', 'path', 'minigame', 'sectorintro', 'coopOver', 'over'].includes(this.state)) {
        // frozen world; still tick ambient effects lightly
        this.effects.update(dt * 0.3);
      }
      this.background.draw(ctx, this.vw, this.vh, this.world.camX, this.world.camY, this.world.palette);
      this.world.draw(ctx, this.vw, this.vh);
      if (this.state === 'minigame' && this.minigame) {
        this.minigame.update(dt, this.input, this.vw, this.vh);
        if (this.minigame) this.minigame.draw(ctx, this.vw, this.vh);
      }
      this.effects.drawFlash(ctx, this.vw, this.vh);
    } else {
      // menu/title ambient background
      this.effects.update(dt);
      this.background.draw(ctx, this.vw, this.vh, ts * 0.02, ts * 0.012, MENU_PALETTE);
      this.effects.draw(ctx, 0, 0);
    }

    // on-screen touch controls over live gameplay
    if (playing) this.input.drawOverlay(ctx, this.vw, this.vh);

    this.input.endFrame();
    requestAnimationFrame((t2) => this.frame(t2));
  }
}

window.game = new Game();
