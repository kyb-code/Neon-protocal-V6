// telemetry.js — lightweight live-session beacons over the same public MQTT broker.
// Players publish "what I'm doing right now" to a shared topic; the admin console
// subscribes to watch every active game in real time. Fire-and-forget, best-effort.
const TOPIC = 'neonproto/telemetry/v1';
const BROKER = 'wss://broker.emqx.io:8084/mqtt';

// ---- publisher: runs while a player is in a game ----
export class TelemetryPublisher {
  constructor() {
    this.client = null;
    this.timer = null;
    this.getBeacon = null;
  }
  start(getBeacon) {
    if (typeof window.mqtt === 'undefined') return;
    this.getBeacon = getBeacon;
    if (this.client) { this._tick(); return; }
    try {
      this.client = window.mqtt.connect(BROKER, {
        clientId: 'nptel_' + Math.random().toString(36).slice(2, 10),
        clean: true, keepalive: 30, reconnectPeriod: 4000, connectTimeout: 8000,
      });
      this.client.on('connect', () => this._tick());
    } catch (e) { /* ignore */ }
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this._tick(), 3000);
  }
  _tick() {
    if (!this.client || !this.getBeacon) return;
    const b = this.getBeacon();
    if (!b) return;
    try { this.client.publish(TOPIC, JSON.stringify(b), { qos: 0 }); } catch (e) { /* ignore */ }
  }
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.getBeacon = null;
    // keep the connection warm briefly then drop
    const c = this.client; this.client = null;
    if (c) { try { setTimeout(() => c.end(true), 500); } catch (e) {} }
  }
}

// ---- subscriber: the admin console watches all beacons ----
export class TelemetryWatcher {
  constructor(onUpdate) {
    this.client = null;
    this.sessions = new Map(); // id -> {beacon, at}
    this.onUpdate = onUpdate;
    this.sweep = null;
  }
  start() {
    if (typeof window.mqtt === 'undefined') return;
    try {
      this.client = window.mqtt.connect(BROKER, {
        clientId: 'npwatch_' + Math.random().toString(36).slice(2, 10),
        clean: true, keepalive: 30, reconnectPeriod: 4000, connectTimeout: 8000,
      });
      this.client.on('connect', () => this.client.subscribe(TOPIC, { qos: 0 }));
      this.client.on('message', (topic, payload) => {
        let b; try { b = JSON.parse(payload.toString()); } catch (e) { return; }
        if (!b || !b.id) return;
        this.sessions.set(b.id, { beacon: b, at: performance.now() });
        this._emit();
      });
    } catch (e) { /* ignore */ }
    // expire sessions we haven't heard from in ~8s
    this.sweep = setInterval(() => {
      const now = performance.now();
      let changed = false;
      for (const [id, s] of this.sessions) {
        if (now - s.at > 8000) { this.sessions.delete(id); changed = true; }
      }
      if (changed) this._emit();
    }, 2000);
  }
  _emit() {
    if (this.onUpdate) this.onUpdate([...this.sessions.values()].map((s) => s.beacon));
  }
  stop() {
    if (this.sweep) { clearInterval(this.sweep); this.sweep = null; }
    const c = this.client; this.client = null;
    if (c) { try { c.end(true); } catch (e) {} }
  }
}
