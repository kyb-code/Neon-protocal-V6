// bosses.js — 9 guardians with phase-based pattern scripts
import { TAU, rand, clamp, angleTo, dist, dist2, lerp, choice } from './utils.js';
import { glowSprite } from './effects.js';

// ---- pattern primitives (called with boss `b`, world `w`, player `p`) ----
function radialBurst(b, w, n, speed, offset = 0, color) {
  for (let i = 0; i < n; i++) {
    const a = offset + (TAU * i) / n;
    w.spawnBullet(b.x, b.y, Math.cos(a) * speed, Math.sin(a) * speed, { dmg: b.dmg * 0.8, color: color || b.color });
  }
  w.audio.sfx('shoot');
}

function aimedFan(b, w, p, n, spread, speed, color) {
  const base = angleTo(b.x, b.y, p.x, p.y);
  for (let i = 0; i < n; i++) {
    const a = base + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
    w.spawnBullet(b.x, b.y, Math.cos(a) * speed, Math.sin(a) * speed, { dmg: b.dmg * 0.8, color: color || b.color });
  }
  w.audio.sfx('shoot');
}

// ---- move library: each move = {dur, start?, tick?} using b.moveState ----
const MOVES = {
  idle: (dur = 1.0) => ({
    dur,
    tick(b, dt, w, p) { b.seekPlayer(p, 0.55, dt); },
  }),
  radials: (count = 3, n = 14, speed = 160) => ({
    dur: count * 0.8,
    start(b) { b.moveState.next = 0; b.moveState.fired = 0; },
    tick(b, dt, w, p) {
      b.seekPlayer(p, 0.3, dt);
      b.moveState.next -= dt;
      if (b.moveState.next <= 0 && b.moveState.fired < count) {
        b.moveState.next = 0.8;
        radialBurst(b, w, n, speed * b.phaseMul, rand(TAU));
        b.moveState.fired++;
      }
    },
  }),
  spiral: (dur = 3.2, rate = 0.09, speed = 150) => ({
    dur,
    start(b) { b.moveState.a = rand(TAU); b.moveState.next = 0; },
    tick(b, dt, w, p) {
      b.seekPlayer(p, 0.25, dt);
      b.moveState.next -= dt;
      if (b.moveState.next <= 0) {
        b.moveState.next = rate / b.phaseMul;
        b.moveState.a += 0.55;
        for (const s of [1, -1]) {
          const a = b.moveState.a * s;
          w.spawnBullet(b.x, b.y, Math.cos(a) * speed, Math.sin(a) * speed, { dmg: b.dmg * 0.7, color: b.color });
        }
      }
    },
  }),
  fans: (count = 4, n = 5, spread = 0.9, speed = 240) => ({
    dur: count * 0.65,
    start(b) { b.moveState.next = 0.3; b.moveState.fired = 0; },
    tick(b, dt, w, p) {
      b.seekPlayer(p, 0.4, dt);
      b.moveState.next -= dt;
      if (b.moveState.next <= 0 && b.moveState.fired < count) {
        b.moveState.next = 0.65;
        aimedFan(b, w, p, n, spread, speed * b.phaseMul);
        b.moveState.fired++;
      }
    },
  }),
  charge: (times = 1) => ({
    dur: times * 1.6 + 0.4,
    start(b) { b.moveState.phase = 'tele'; b.moveState.t = 0.7; b.moveState.left = times; },
    tick(b, dt, w, p) {
      const ms = b.moveState;
      if (ms.phase === 'tele') {
        b.vx *= 0.9; b.vy *= 0.9;
        ms.lockA = angleTo(b.x, b.y, p.x, p.y);
        b.telegraphA = ms.lockA;
        ms.t -= dt;
        if (ms.t <= 0) { ms.phase = 'go'; ms.t = 0.55; b.telegraphA = null; w.audio.sfx('dash'); }
      } else if (ms.phase === 'go') {
        b.vx = Math.cos(ms.lockA) * 620 * b.phaseMul;
        b.vy = Math.sin(ms.lockA) * 620 * b.phaseMul;
        w.effects.trail(b.x, b.y, b.color);
        ms.t -= dt;
        if (ms.t <= 0) {
          ms.left -= 1;
          if (ms.left > 0) { ms.phase = 'tele'; ms.t = 0.55; w.audio.sfx('telegraph'); }
          else { ms.phase = 'done'; b.vx *= 0.3; b.vy *= 0.3; }
        }
      } else { b.vx *= 0.92; b.vy *= 0.92; }
    },
  }),
  summon: (types, n = 3) => ({
    dur: 1.2,
    start(b, w) {
      for (let i = 0; i < n; i++) {
        const a = rand(TAU);
        w.spawnEnemy(choice(types), b.x + Math.cos(a) * 90, b.y + Math.sin(a) * 90);
      }
      w.effects.shockwave(b.x, b.y, b.color, 100, 4);
      w.audio.sfx('teleport');
    },
    tick(b, dt, w, p) { b.seekPlayer(p, 0.3, dt); },
  }),
  crossLasers: (count = 2) => ({
    dur: count * 2.0 + 0.5,
    start(b) { b.moveState.next = 0; b.moveState.fired = 0; },
    tick(b, dt, w, p) {
      b.vx *= 0.9; b.vy *= 0.9;
      b.moveState.next -= dt;
      if (b.moveState.next <= 0 && b.moveState.fired < count) {
        b.moveState.next = 2.0;
        b.moveState.fired++;
        // horizontal + vertical beams through player's current position
        w.spawnBeam(w.arena.x, p.y, 0, w.arena.w, { dmg: b.dmg, width: 26 });
        w.spawnBeam(p.x, w.arena.y, Math.PI / 2, w.arena.h, { dmg: b.dmg, width: 26 });
      }
    },
  }),
  sweepLaser: (dur = 4.0) => ({
    dur: dur + 1.0,
    start(b, w, p) {
      b.moveState.a = angleTo(b.x, b.y, p.x, p.y);
      b.moveState.beam = w.spawnBeam(b.x, b.y, b.moveState.a, 900, { dmg: b.dmg, width: 20, teleDur: 1.0, fireDur: dur, tracking: true });
    },
    tick(b, dt, w, p) {
      b.vx *= 0.92; b.vy *= 0.92;
      const beam = b.moveState.beam;
      if (beam && beam.state !== 'dead') {
        beam.x = b.x; beam.y = b.y;
        // slowly track player
        const target = angleTo(b.x, b.y, p.x, p.y);
        let diff = ((target - beam.a + Math.PI * 3) % TAU) - Math.PI;
        const rate = beam.state === 'tele' ? 2.2 : 0.55 * b.phaseMul;
        beam.a += clamp(diff, -rate * dt, rate * dt);
      }
    },
  }),
  mineRing: (n = 8, r = 150) => ({
    dur: 1.0,
    start(b, w, p) {
      for (let i = 0; i < n; i++) {
        const a = (TAU * i) / n;
        w.spawnMine(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, b.dmg * 0.9);
      }
      w.audio.sfx('mine');
    },
    tick(b, dt, w, p) { b.seekPlayer(p, 0.4, dt); },
  }),
  teleportStrike: () => ({
    dur: 1.4,
    start(b, w, p) {
      w.effects.burst(b.x, b.y, b.color, 20, 240);
      const a = rand(TAU);
      b.x = clamp(p.x + Math.cos(a) * 220, w.arena.x + 60, w.arena.x + w.arena.w - 60);
      b.y = clamp(p.y + Math.sin(a) * 220, w.arena.y + 60, w.arena.y + w.arena.h - 60);
      w.effects.burst(b.x, b.y, b.color, 20, 240);
      w.audio.sfx('teleport');
      b.moveState.next = 0.4;
    },
    tick(b, dt, w, p) {
      b.moveState.next -= dt;
      if (b.moveState.next !== null && b.moveState.next <= 0) {
        b.moveState.next = null;
        aimedFan(b, w, p, 7, 1.4, 230 * b.phaseMul);
      }
    },
  }),
};

export const BOSSES = {
  sentinel: {
    name: { en: 'SENTINEL.EXE', ko: '센티넬.EXE' }, color: '#ff3b5c', shape: 'tri', radius: 34,
    hp: 520, dmg: 16,
    moves: (b) => [MOVES.radials(3, 12, 150), MOVES.idle(0.8), MOVES.charge(2), MOVES.idle(0.7), MOVES.fans(3, 5, 0.8, 230)],
  },
  hydra: {
    name: { en: 'HYDRA PROCESS', ko: '히드라 프로세스' }, color: '#4ade80', shape: 'hexa', radius: 36,
    hp: 480, dmg: 14,
    moves: (b) => [MOVES.fans(4, 3, 0.5, 250), MOVES.idle(0.6), MOVES.summon(['mini', 'swarmer'], 4), MOVES.radials(2, 10, 140), MOVES.idle(0.8)],
    onPhase(b, w) { for (let i = 0; i < 2; i++) w.spawnEnemy('splitter', b.x + rand(-60, 60), b.y + rand(-60, 60)); },
  },
  pyre: {
    name: { en: 'PYRE DAEMON', ko: '파이어 데몬' }, color: '#ff7b00', shape: 'penta', radius: 36,
    hp: 700, dmg: 16,
    moves: (b) => [MOVES.spiral(3.4, 0.08, 160), MOVES.idle(0.7), MOVES.fans(4, 7, 1.1, 220), MOVES.idle(0.6), MOVES.charge(1), MOVES.radials(2, 16, 170)],
  },
  gatekeeper: {
    name: { en: 'GATEKEEPER', ko: '게이트키퍼' }, color: '#38bdf8', shape: 'penta', radius: 40,
    hp: 640, dmg: 15, frontShield: true,
    moves: (b) => [MOVES.fans(5, 4, 0.6, 240), MOVES.idle(0.6), MOVES.summon(['shielded', 'chaser'], 3), MOVES.radials(3, 12, 150), MOVES.idle(0.8)],
  },
  librarian: {
    name: { en: 'THE LIBRARIAN', ko: '라이브러리안' }, color: '#e879f9', shape: 'diamond', radius: 34,
    hp: 860, dmg: 17,
    moves: (b) => [MOVES.teleportStrike(), MOVES.crossLasers(2), MOVES.idle(0.7), MOVES.teleportStrike(), MOVES.radials(2, 14, 160), MOVES.idle(0.6)],
  },
  swarmIndex: {
    name: { en: 'SWARM INDEX', ko: '스웜 인덱스' }, color: '#facc15', shape: 'hexa', radius: 42,
    hp: 780, dmg: 14,
    moves: (b) => [MOVES.summon(['swarmer'], 5), MOVES.radials(2, 12, 140), MOVES.idle(0.7), MOVES.summon(['mini', 'swarmer'], 4), MOVES.spiral(2.6, 0.11, 140), MOVES.idle(0.8)],
  },
  watchdog: {
    name: { en: 'WATCHDOG', ko: '워치독' }, color: '#f43f5e', shape: 'square', radius: 40,
    hp: 1050, dmg: 18,
    moves: (b) => [MOVES.sweepLaser(3.5), MOVES.idle(0.8), MOVES.mineRing(8, 170), MOVES.fans(3, 5, 0.7, 250), MOVES.idle(0.7), MOVES.charge(2)],
  },
  scheduler: {
    name: { en: 'SCHEDULER', ko: '스케줄러' }, color: '#22d3ee', shape: 'diamond', radius: 36,
    hp: 980, dmg: 17,
    moves: (b) => [MOVES.radials(2, 16, 180), MOVES.fans(3, 7, 1.2, 260), MOVES.charge(1), MOVES.spiral(2.2, 0.07, 170), MOVES.teleportStrike(), MOVES.idle(0.5)],
  },
  administrator: {
    name: { en: 'THE ADMINISTRATOR', ko: '어드미니스트레이터' }, color: '#ffffff', shape: 'hexa', radius: 48,
    hp: 1600, dmg: 20,
    moves: (b) => {
      if (b.phase === 0) return [MOVES.radials(3, 16, 170), MOVES.idle(0.6), MOVES.fans(4, 5, 0.8, 260), MOVES.charge(1), MOVES.idle(0.7)];
      if (b.phase === 1) return [MOVES.crossLasers(2), MOVES.summon(['warper', 'shielded'], 3), MOVES.spiral(3, 0.07, 170), MOVES.idle(0.6), MOVES.mineRing(10, 190)];
      return [MOVES.sweepLaser(3.0), MOVES.radials(2, 20, 190), MOVES.teleportStrike(), MOVES.fans(3, 9, 1.5, 280), MOVES.idle(0.4)];
    },
    onPhase(b, w) { w.spawnEnemy('healer', b.x + 80, b.y); w.spawnEnemy('healer', b.x - 80, b.y); },
  },

  // ================= DEEP LAYERS (sectors 6–13) =================
  abyssMaw: {
    name: { en: 'ABYSS MAW', ko: '심연의 아가리' }, color: '#818cf8', shape: 'hexa', radius: 42,
    hp: 1900, dmg: 21,
    moves: (b) => [MOVES.spiral(3.6, 0.06, 180), MOVES.fans(4, 7, 1.1, 250), MOVES.charge(2), MOVES.radials(3, 18, 180), MOVES.idle(0.6)],
    onPhase(b, w) { for (let i = 0; i < 3; i++) w.spawnEnemy('leech', b.x + rand(-70, 70), b.y + rand(-70, 70)); },
  },
  plagueLord: {
    name: { en: 'PLAGUE LORD', ko: '역병군주' }, color: '#4ade80', shape: 'penta', radius: 40,
    hp: 2100, dmg: 20,
    moves: (b) => [MOVES.summon(['corruptor', 'splitter'], 4), MOVES.spiral(3, 0.07, 170), MOVES.fans(4, 5, 0.9, 240), MOVES.mineRing(10, 180), MOVES.idle(0.6)],
    onPhase(b, w) { for (let i = 0; i < 2; i++) w.spawnEnemy('healer', b.x + rand(-80, 80), b.y); if (w.spawnPool) w.spawnPool(b.x, b.y, 90, 12, 5); },
  },
  forgemaster: {
    name: { en: 'FORGEMASTER', ko: '포지마스터' }, color: '#ff7b00', shape: 'square', radius: 46,
    hp: 2600, dmg: 24, frontShield: true,
    moves: (b) => [MOVES.charge(2), MOVES.radials(3, 20, 190), MOVES.summon(['tank', 'bulwark'], 2), MOVES.fans(5, 5, 0.7, 260), MOVES.idle(0.6)],
  },
  mirrorKing: {
    name: { en: 'MIRROR SOVEREIGN', ko: '거울 군주' }, color: '#c4b5fd', shape: 'diamond', radius: 38,
    hp: 2400, dmg: 22,
    moves: (b) => [MOVES.teleportStrike(), MOVES.crossLasers(2), MOVES.teleportStrike(), MOVES.radials(2, 18, 190), MOVES.summon(['mirrorer', 'warper'], 3), MOVES.idle(0.5)],
    onPhase(b, w) { for (let i = 0; i < 2; i++) w.spawnEnemy('mirrorer', b.x + rand(-90, 90), b.y + rand(-40, 40)); },
  },
  overmind: {
    name: { en: 'THE OVERMIND', ko: '오버마인드' }, color: '#facc15', shape: 'hexa', radius: 48,
    hp: 3000, dmg: 23,
    moves: (b) => [MOVES.summon(['overseer', 'pulsar', 'swarmer'], 4), MOVES.spiral(3.2, 0.06, 180), MOVES.fans(4, 9, 1.3, 260), MOVES.radials(3, 20, 190), MOVES.idle(0.6)],
    onPhase(b, w) { w.spawnEnemy('overseer', b.x, b.y - 90); w.spawnEnemy('healer', b.x + 90, b.y); },
  },
  voidReaper: {
    name: { en: 'VOID REAPER', ko: '공허의 사신' }, color: '#a5b4fc', shape: 'diamond', radius: 42,
    hp: 3300, dmg: 26,
    moves: (b) => [MOVES.sweepLaser(3.8), MOVES.teleportStrike(), MOVES.radials(3, 22, 200), MOVES.crossLasers(3), MOVES.fans(4, 7, 1.4, 280), MOVES.idle(0.4)],
  },
  genesisCore: {
    name: { en: 'GENESIS CORE', ko: '제네시스 코어' }, color: '#22d3ee', shape: 'hexa', radius: 50,
    hp: 3900, dmg: 27,
    moves: (b) => {
      if (b.phase === 0) return [MOVES.spiral(3.4, 0.055, 190), MOVES.radials(3, 22, 200), MOVES.fans(4, 7, 1.2, 270), MOVES.idle(0.5)];
      if (b.phase === 1) return [MOVES.crossLasers(3), MOVES.summon(['railgun', 'pulsar'], 3), MOVES.mineRing(12, 200), MOVES.charge(2)];
      return [MOVES.sweepLaser(3.4), MOVES.radials(3, 26, 210), MOVES.spiral(2.6, 0.05, 200), MOVES.teleportStrike()];
    },
    onPhase(b, w) { for (let i = 0; i < 2; i++) w.spawnEnemy('railgun', b.x + (i ? 120 : -120), b.y); },
  },
  theZeroth: {
    name: { en: 'THE ZEROTH', ko: '제로스' }, color: '#ffffff', shape: 'hexa', radius: 56,
    hp: 5200, dmg: 30, final: true,
    moves: (b) => {
      if (b.phase === 0) return [MOVES.radials(4, 24, 200), MOVES.fans(5, 7, 1.0, 280), MOVES.charge(2), MOVES.spiral(3, 0.05, 200), MOVES.idle(0.5)];
      if (b.phase === 1) return [MOVES.crossLasers(3), MOVES.sweepLaser(3.2), MOVES.summon(['overseer', 'hunterKiller', 'railgun'], 3), MOVES.mineRing(14, 210), MOVES.teleportStrike()];
      return [MOVES.sweepLaser(2.8), MOVES.radials(3, 30, 220), MOVES.teleportStrike(), MOVES.fans(4, 11, 1.6, 300), MOVES.spiral(2.2, 0.045, 210)];
    },
    onPhase(b, w) { w.spawnEnemy('healer', b.x + 100, b.y); w.spawnEnemy('healer', b.x - 100, b.y); w.spawnEnemy('overseer', b.x, b.y - 100); },
  },
};

// sector -> [bossA, bossB] (random pick per run); sector 13 = the true final
export const SECTOR_BOSSES = [
  ['sentinel', 'hydra'],
  ['pyre', 'gatekeeper'],
  ['librarian', 'swarmIndex'],
  ['watchdog', 'scheduler'],
  ['administrator'],
  ['abyssMaw'],
  ['plagueLord'],
  ['forgemaster'],
  ['mirrorKing'],
  ['overmind'],
  ['voidReaper'],
  ['genesisCore'],
  ['theZeroth'],
];

let nextBossId = 100000;

export class Boss {
  constructor(bossId, x, y, hpScale = 1, dmgScale = 1) {
    const def = BOSSES[bossId];
    this.id = nextBossId++;
    this.bossId = bossId;
    this.def = def;
    this.type = { name: def.name, color: def.color, frontShield: def.frontShield };
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = def.radius;
    this.color = def.color;
    this.maxHp = Math.round(def.hp * hpScale);
    this.hp = this.maxHp;
    this.dmg = Math.round(def.dmg * dmgScale);
    this.xp = 40;
    this.credits = 60;
    this.elite = false;
    this.isBoss = true;
    this.rot = 0;
    this.hitFlash = 0;
    this.spawnT = 1.2;
    this.phase = 0;         // 0,1,2 by hp thirds
    this.phaseMul = 1;
    this.moveIndex = -1;
    this.currentMove = null;
    this.moveT = 0;
    this.moveState = {};
    this.telegraphA = null;
    this.baseSpeed = 85;
    this.telegraph = null;
  }

  seekPlayer(p, mul, dt) {
    const a = angleTo(this.x, this.y, p.x, p.y);
    const sp = this.baseSpeed * mul * this.phaseMul;
    this.vx = lerp(this.vx, Math.cos(a) * sp, 1 - Math.exp(-3 * dt));
    this.vy = lerp(this.vy, Math.sin(a) * sp, 1 - Math.exp(-3 * dt));
  }

  update(dt, world, player) {
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    this.rot += dt * 0.9;
    if (this.spawnT > 0) { this.spawnT -= dt; return; }

    // phase transitions at 2/3 and 1/3 hp
    const pct = this.hp / this.maxHp;
    const targetPhase = pct > 0.66 ? 0 : pct > 0.33 ? 1 : 2;
    if (targetPhase > this.phase) {
      this.phase = targetPhase;
      this.phaseMul = 1 + this.phase * 0.28;
      world.audio.sfx('bossPhase');
      world.effects.shake(10);
      world.effects.shockwave(this.x, this.y, this.color, 260, 8);
      world.clearBulletsAround(this.x, this.y, 9999); // breathing room on phase change
      if (this.def.onPhase) this.def.onPhase(this, world);
      this.currentMove = null; // interrupt current move
    }

    // move script
    this.moveT -= dt;
    if (!this.currentMove || this.moveT <= 0) {
      const moves = this.def.moves(this);
      this.moveIndex = (this.moveIndex + 1) % moves.length;
      this.currentMove = moves[this.moveIndex];
      this.moveT = this.currentMove.dur / this.phaseMul;
      this.moveState = {};
      this.telegraphA = null;
      if (this.currentMove.start) this.currentMove.start(this, world, player);
    }
    if (this.currentMove.tick) this.currentMove.tick(this, dt, world, player);

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const a = world.arena;
    this.x = clamp(this.x, a.x + this.radius, a.x + a.w - this.radius);
    this.y = clamp(this.y, a.y + this.radius, a.y + a.h - this.radius);
  }

  draw(ctx, camX, camY) {
    const x = this.x - camX, y = this.y - camY;
    const spawnScale = this.spawnT > 0 ? clamp(1 - this.spawnT / 1.2, 0.05, 1) : 1;
    const r = this.radius * spawnScale;
    ctx.save();

    // charge telegraph
    if (this.telegraphA !== null) {
      ctx.globalAlpha = 0.3 + 0.15 * Math.sin(performance.now() / 60);
      ctx.strokeStyle = '#ff2222';
      ctx.lineWidth = this.radius * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(this.telegraphA) * 700, y + Math.sin(this.telegraphA) * 700);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // layered glow
    ctx.globalCompositeOperation = 'lighter';
    const spr = glowSprite(this.color);
    const gs = r * 5;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(spr, x - gs / 2, y - gs / 2, gs, gs);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // rotating outer rings
    for (let ring = 0; ring < 2; ring++) {
      const rr = r + 12 + ring * 10;
      const rot = this.rot * (ring === 0 ? 1 : -0.7);
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = 0.5 - ring * 0.18;
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = rot * 30;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;

    // body
    const color = this.hitFlash > 0 ? '#ffffff' : this.color;
    const sides = { tri: 3, diamond: 4, square: 4, penta: 5, hexa: 6 }[this.def.shape] || 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = color;
    ctx.fillStyle = 'rgba(5,8,18,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (TAU * i) / sides;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // inner rotating core
    ctx.rotate(-this.rot * 2.4);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (TAU * i) / sides;
      if (i === 0) ctx.moveTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
      else ctx.lineTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.14, 0, TAU);
    ctx.fill();
    ctx.restore();

    // front shield arc (gatekeeper)
    if (this.def.frontShield) {
      const aimA = this.telegraphA ?? this.rot;
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, r + 14, aimA - 1.1, aimA + 1.1);
      ctx.stroke();
    }
    ctx.restore();
  }
}
