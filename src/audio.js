// audio.js — Web Audio synthesized SFX + procedural synthwave music. No external files.
import { rand, choice, clamp } from './utils.js';

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.noiseBuf = null;
    this.musicTimer = null;
    this.musicOn = false;
    this.intensity = 0.5;
    this.rootIndex = 0;
    this.step = 0;
    this.nextTime = 0;
    this.bpm = 112;
    this.volumes = { master: 0.8, sfx: 0.8, music: 0.6 };
    this._lastHover = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return false; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.sfxGain = c.createGain();
    this.sfxGain.connect(this.master);
    this.musicGain = c.createGain();
    this.musicGain.connect(this.master);
    this.applyVolumes();
    // shared noise buffer (1s white noise)
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    return true;
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfxGain.gain.value = this.volumes.sfx;
    this.musicGain.gain.value = this.volumes.music * 0.7;
  }

  setVolume(kind, v) {
    this.volumes[kind] = clamp(v, 0, 1);
    this.applyVolumes();
  }

  // ---------- SFX primitives ----------
  tone({ freq = 440, endFreq = null, type = 'sine', dur = 0.15, vol = 0.3, attack = 0.005, when = 0, dest = null }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest || this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.25, filterFreq = 3000, filterType = 'lowpass', endFilter = null, when = 0, dest = null }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t0 = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = rand(0.9, 1.1);
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(filterFreq, t0);
    if (endFilter !== null) f.frequency.exponentialRampToValueAtTime(Math.max(endFilter, 20), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ---------- named SFX ----------
  sfx(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'dash':
        this.noise({ dur: 0.18, vol: 0.32, filterFreq: 6000, endFilter: 400, filterType: 'bandpass' });
        this.tone({ freq: 880, endFreq: 220, type: 'sawtooth', dur: 0.14, vol: 0.12 });
        break;
      case 'dashReady':
        this.tone({ freq: 1320, type: 'sine', dur: 0.07, vol: 0.1 });
        break;
      case 'hit':
        this.tone({ freq: rand(300, 380), endFreq: 120, type: 'square', dur: 0.08, vol: 0.16 });
        break;
      case 'kill':
        this.tone({ freq: rand(500, 620), endFreq: 80, type: 'square', dur: 0.16, vol: 0.2 });
        this.noise({ dur: 0.15, vol: 0.18, filterFreq: 2400, endFilter: 200 });
        break;
      case 'explode':
        this.noise({ dur: 0.5, vol: 0.4, filterFreq: 1600, endFilter: 60 });
        this.tone({ freq: 140, endFreq: 30, type: 'sine', dur: 0.4, vol: 0.42 });
        break;
      case 'bigExplode':
        this.noise({ dur: 0.9, vol: 0.5, filterFreq: 2000, endFilter: 40 });
        this.tone({ freq: 100, endFreq: 24, type: 'sine', dur: 0.8, vol: 0.5 });
        this.tone({ freq: 400, endFreq: 50, type: 'sawtooth', dur: 0.5, vol: 0.15 });
        break;
      case 'playerHit':
        this.tone({ freq: 220, endFreq: 60, type: 'sawtooth', dur: 0.25, vol: 0.35 });
        this.noise({ dur: 0.2, vol: 0.25, filterFreq: 900, endFilter: 100 });
        break;
      case 'shieldBreak':
        this.tone({ freq: 700, endFreq: 90, type: 'square', dur: 0.3, vol: 0.28 });
        this.noise({ dur: 0.3, vol: 0.2, filterFreq: 4000, endFilter: 300, filterType: 'highpass' });
        break;
      case 'shieldUp':
        this.tone({ freq: 300, endFreq: 900, type: 'sine', dur: 0.22, vol: 0.14 });
        break;
      case 'pickup':
        this.tone({ freq: rand(900, 1100), endFreq: 1600, type: 'sine', dur: 0.09, vol: 0.11 });
        break;
      case 'credit':
        this.tone({ freq: 1180, type: 'triangle', dur: 0.06, vol: 0.13 });
        this.tone({ freq: 1770, type: 'triangle', dur: 0.09, vol: 0.1, when: 0.05 });
        break;
      case 'heal':
        this.tone({ freq: 520, endFreq: 780, type: 'sine', dur: 0.25, vol: 0.16 });
        this.tone({ freq: 780, endFreq: 1040, type: 'sine', dur: 0.25, vol: 0.12, when: 0.12 });
        break;
      case 'levelup':
        [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.16, when: i * 0.07 }));
        break;
      case 'chain':
        this.tone({ freq: 1000 + Math.random() * 500, endFreq: 2000, type: 'sine', dur: 0.1, vol: 0.14 });
        break;
      case 'bossWarn':
        [0, 0.3, 0.6].forEach((w) => {
          this.tone({ freq: 180, endFreq: 170, type: 'sawtooth', dur: 0.25, vol: 0.3, when: w });
          this.tone({ freq: 360, endFreq: 340, type: 'square', dur: 0.25, vol: 0.12, when: w });
        });
        break;
      case 'bossPhase':
        this.tone({ freq: 240, endFreq: 120, type: 'sawtooth', dur: 0.5, vol: 0.3 });
        this.noise({ dur: 0.4, vol: 0.2, filterFreq: 3000, endFilter: 200 });
        break;
      case 'laser':
        this.tone({ freq: 1800, endFreq: 400, type: 'sawtooth', dur: 0.3, vol: 0.12 });
        break;
      case 'telegraph':
        this.tone({ freq: 660, type: 'square', dur: 0.1, vol: 0.08 });
        break;
      case 'shoot':
        this.tone({ freq: rand(400, 500), endFreq: 200, type: 'square', dur: 0.07, vol: 0.07 });
        break;
      case 'waveClear':
        [392, 523, 659].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.25, vol: 0.15, when: i * 0.09 }));
        break;
      case 'victory':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.4, vol: 0.18, when: i * 0.13 }));
        break;
      case 'defeat':
        [440, 415, 392, 370].forEach((f, i) => this.tone({ freq: f, type: 'sawtooth', dur: 0.5, vol: 0.16, when: i * 0.22 }));
        break;
      case 'uiHover': {
        const now = performance.now();
        if (now - this._lastHover < 40) break;
        this._lastHover = now;
        this.tone({ freq: 900, type: 'sine', dur: 0.04, vol: 0.05 });
        break;
      }
      case 'uiClick':
        this.tone({ freq: 700, endFreq: 1000, type: 'sine', dur: 0.07, vol: 0.12 });
        break;
      case 'uiBack':
        this.tone({ freq: 500, endFreq: 350, type: 'sine', dur: 0.08, vol: 0.1 });
        break;
      case 'purchase':
        [784, 988, 1175].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.15, vol: 0.14, when: i * 0.06 }));
        break;
      case 'denied':
        this.tone({ freq: 200, type: 'square', dur: 0.12, vol: 0.14 });
        this.tone({ freq: 160, type: 'square', dur: 0.16, vol: 0.14, when: 0.1 });
        break;
      case 'unlock':
        [659, 784, 1046, 1318].forEach((f, i) => this.tone({ freq: f, type: 'sine', dur: 0.3, vol: 0.15, when: i * 0.1 }));
        break;
      case 'mine':
        this.tone({ freq: 1400, type: 'sine', dur: 0.05, vol: 0.08 });
        break;
      case 'teleport':
        this.tone({ freq: 300, endFreq: 1500, type: 'sine', dur: 0.15, vol: 0.12 });
        break;
    }
  }

  // ---------- procedural music ----------
  // Natural-minor synthwave sequencer. Layers gated by intensity (0..1).
  startMusic(rootIndex = 0, intensity = 0.5) {
    if (!this.ensure()) return;
    this.rootIndex = rootIndex;
    this.intensity = intensity;
    if (this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.musicTimer = setInterval(() => this._schedule(), 40);
  }

  stopMusic() {
    this.musicOn = false;
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }

  setIntensity(v) { this.intensity = clamp(v, 0, 1); }
  setRoot(i) { this.rootIndex = i; }

  _schedule() {
    if (!this.musicOn || !this.ctx) return;
    const stepDur = 60 / this.bpm / 4; // 16th notes
    while (this.nextTime < this.ctx.currentTime + 0.18) {
      this._playStep(this.step, this.nextTime, stepDur);
      this.step = (this.step + 1) % 64; // 4 bars of 16
      this.nextTime += stepDur;
    }
  }

  _noteFreq(semisFromRoot, octave = 0) {
    // roots per sector: A1, C2, D2, F#1, G#1
    const roots = [55.0, 65.41, 73.42, 46.25, 51.91];
    const root = roots[this.rootIndex % roots.length];
    return root * Math.pow(2, semisFromRoot / 12 + octave);
  }

  _playStep(step, t, stepDur) {
    const c = this.ctx;
    const bar = Math.floor(step / 16); // 0..3
    const s16 = step % 16;
    const inten = this.intensity;
    // chord progression: i, VI, III, VII (natural minor, semitones from root)
    const chordRoots = [0, 8, 3, 10];
    const chordRoot = chordRoots[bar];
    const minorish = bar === 0 || bar === 2; // i and III treated minor/major triads
    const triad = minorish ? [0, 3, 7] : [0, 4, 7];

    const when = t - c.currentTime;

    // KICK: four on the floor (always on)
    if (s16 % 4 === 0) {
      this.tone({ freq: 150, endFreq: 40, type: 'sine', dur: 0.22, vol: 0.5, when, dest: this.musicGain });
    }
    // HAT: offbeats, intensity >= 0.25
    if (inten >= 0.25 && s16 % 2 === 1) {
      this.noise({ dur: 0.04, vol: 0.07 + inten * 0.05, filterFreq: 9000, filterType: 'highpass', when, dest: this.musicGain });
    }
    // SNARE: beats 2 & 4, intensity >= 0.55
    if (inten >= 0.55 && (s16 === 4 || s16 === 12)) {
      this.noise({ dur: 0.14, vol: 0.16, filterFreq: 2200, filterType: 'bandpass', when, dest: this.musicGain });
      this.tone({ freq: 190, endFreq: 130, type: 'triangle', dur: 0.1, vol: 0.12, when, dest: this.musicGain });
    }
    // BASS ARP: driving 16ths on chord tones (always, volume scales)
    {
      const pattern = [0, 0, 12, 0, 7, 0, 12, 7, 0, 0, 12, 0, 7, 12, 0, 7];
      const semis = chordRoot + (pattern[s16] === 12 ? 12 : pattern[s16] === 7 ? triad[2] : 0);
      this.tone({
        freq: this._noteFreq(semis, 1), type: 'sawtooth',
        dur: stepDur * 0.85, vol: 0.10 + inten * 0.06, attack: 0.004, when, dest: this.musicGain,
      });
    }
    // PAD: chord at bar start, intensity >= 0.35
    if (inten >= 0.35 && s16 === 0) {
      for (const iv of triad) {
        this.tone({
          freq: this._noteFreq(chordRoot + iv, 2), type: 'triangle',
          dur: stepDur * 15, vol: 0.045, attack: 0.4, when, dest: this.musicGain,
        });
      }
    }
    // LEAD: sparse melody, intensity >= 0.75
    if (inten >= 0.75 && (s16 === 2 || s16 === 7 || s16 === 10 || s16 === 14) && Math.random() < 0.75) {
      const scale = [0, 2, 3, 5, 7, 8, 10, 12];
      const semis = chordRoot + choice(scale);
      this.tone({
        freq: this._noteFreq(semis, 3), type: 'square',
        dur: stepDur * 2.5, vol: 0.05, attack: 0.01, when, dest: this.musicGain,
      });
    }
  }
}
