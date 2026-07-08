// enemies.js — 20 hostile types, data-driven behaviors
import { TAU, rand, clamp, angleTo, dist, dist2, lerp, choice } from './utils.js';
import { glowSprite } from './effects.js';

// Behavior helpers -------------------------------------------------
function seek(e, tx, ty, speed, dt, accel = 6) {
  const a = angleTo(e.x, e.y, tx, ty);
  e.vx = lerp(e.vx, Math.cos(a) * speed, 1 - Math.exp(-accel * dt));
  e.vy = lerp(e.vy, Math.sin(a) * speed, 1 - Math.exp(-accel * dt));
}

function keepDistance(e, p, ideal, speed, dt) {
  const d = dist(e.x, e.y, p.x, p.y);
  const a = angleTo(e.x, e.y, p.x, p.y);
  const dir = d > ideal + 40 ? 1 : d < ideal - 40 ? -1 : 0;
  e.vx = lerp(e.vx, Math.cos(a) * speed * dir, 1 - Math.exp(-5 * dt));
  e.vy = lerp(e.vy, Math.sin(a) * speed * dir, 1 - Math.exp(-5 * dt));
  // strafe
  e.vx += Math.cos(a + Math.PI / 2) * speed * 0.35 * e.strafeDir * dt * 4;
  e.vy += Math.sin(a + Math.PI / 2) * speed * 0.35 * e.strafeDir * dt * 4;
}

// ENEMY TYPES -------------------------------------------------------
// dmg = contact damage. xp = shards dropped. hp/speed base values (scaled per sector).
export const ENEMY_TYPES = {
  chaser: {
    name: { en: 'STRAY PACKET', ko: '길 잃은 패킷' }, shape: 'tri', color: '#ff4d6d',
    hp: 18, speed: 130, radius: 12, dmg: 10, xp: 2, credits: 1,
    update(e, dt, w, p) { seek(e, p.x, p.y, e.speed, dt); e.rot = angleTo(e.x, e.y, p.x, p.y); },
  },
  swarmer: {
    name: { en: 'BIT MITE', ko: '비트 진드기' }, shape: 'tri', color: '#ff8fa3',
    hp: 7, speed: 185, radius: 8, dmg: 6, xp: 1, credits: 1,
    update(e, dt, w, p) {
      const wob = Math.sin(w.time * 6 + e.seed * 10) * 60;
      const a = angleTo(e.x, e.y, p.x, p.y) + Math.PI / 2;
      seek(e, p.x + Math.cos(a) * wob, p.y + Math.sin(a) * wob, e.speed, dt, 8);
      e.rot = Math.atan2(e.vy, e.vx);
    },
  },
  darter: {
    name: { en: 'INTERRUPT', ko: '인터럽트' }, shape: 'diamond', color: '#ffb347',
    hp: 14, speed: 110, radius: 11, dmg: 12, xp: 3, credits: 1,
    update(e, dt, w, p) {
      e.cool -= dt;
      if (e.state === 'stalk') {
        seek(e, p.x, p.y, e.speed * 0.8, dt);
        if (e.cool <= 0 && dist2(e.x, e.y, p.x, p.y) < 320 * 320) {
          e.state = 'tele'; e.t = 0.45; e.lockA = angleTo(e.x, e.y, p.x, p.y);
          w.audio.sfx('telegraph');
        }
      } else if (e.state === 'tele') {
        e.vx *= 0.9; e.vy *= 0.9;
        e.lockA = angleTo(e.x, e.y, p.x, p.y);
        e.t -= dt;
        if (e.t <= 0) { e.state = 'dash'; e.t = 0.32; }
      } else if (e.state === 'dash') {
        e.vx = Math.cos(e.lockA) * e.speed * 4.6;
        e.vy = Math.sin(e.lockA) * e.speed * 4.6;
        e.t -= dt;
        if (e.t <= 0) { e.state = 'stalk'; e.cool = rand(1.4, 2.4); }
      }
      e.rot = e.state === 'stalk' ? angleTo(e.x, e.y, p.x, p.y) : e.lockA;
    },
    init(e) { e.state = 'stalk'; e.cool = rand(0.8, 2); },
  },
  orbiter: {
    name: { en: 'SPIN LOCK', ko: '스핀 락' }, shape: 'circle', color: '#5eead4',
    hp: 16, speed: 150, radius: 10, dmg: 9, xp: 2, credits: 1,
    update(e, dt, w, p) {
      e.orbA = (e.orbA ?? rand(TAU)) + dt * 1.5 * e.strafeDir;
      e.orbR = Math.max(70, (e.orbR ?? 220) - dt * 22);
      seek(e, p.x + Math.cos(e.orbA) * e.orbR, p.y + Math.sin(e.orbA) * e.orbR, e.speed, dt, 7);
      e.rot += dt * 5;
    },
  },
  shooter: {
    name: { en: 'SPITTER NODE', ko: '스피터 노드' }, shape: 'penta', color: '#c084fc',
    hp: 20, speed: 95, radius: 13, dmg: 8, xp: 3, credits: 2,
    update(e, dt, w, p) {
      keepDistance(e, p, 260, e.speed, dt);
      e.cool -= dt;
      if (e.cool <= 0) {
        e.cool = rand(1.6, 2.4);
        const a = angleTo(e.x, e.y, p.x, p.y);
        w.spawnBullet(e.x, e.y, Math.cos(a) * 230, Math.sin(a) * 230, { dmg: e.dmg, color: '#c084fc' });
        w.audio.sfx('shoot');
      }
      e.rot = angleTo(e.x, e.y, p.x, p.y);
    },
    init(e) { e.cool = rand(1, 2); },
  },
  sniper: {
    name: { en: 'LONG POLL', ko: '롱 폴' }, shape: 'diamond', color: '#f97316',
    hp: 15, speed: 80, radius: 12, dmg: 16, xp: 4, credits: 2,
    update(e, dt, w, p) {
      e.cool -= dt;
      if (e.state === 'aim') {
        e.vx *= 0.92; e.vy *= 0.92;
        e.lockA = angleTo(e.x, e.y, p.x, p.y);
        e.t -= dt;
        e.telegraph = { a: e.lockA, len: 620, alpha: 1 - e.t / 0.8 };
        if (e.t <= 0) {
          w.spawnBullet(e.x, e.y, Math.cos(e.lockA) * 560, Math.sin(e.lockA) * 560, { dmg: e.dmg, color: '#f97316', r: 5 });
          w.audio.sfx('laser');
          e.state = 'move'; e.cool = rand(2.2, 3.2); e.telegraph = null;
        }
      } else {
        keepDistance(e, p, 380, e.speed, dt);
        if (e.cool <= 0) { e.state = 'aim'; e.t = 0.8; w.audio.sfx('telegraph'); }
      }
      e.rot = e.state === 'aim' ? e.lockA : angleTo(e.x, e.y, p.x, p.y);
    },
    init(e) { e.state = 'move'; e.cool = rand(1.5, 2.5); },
  },
  splitter: {
    name: { en: 'FORK BOMB', ko: '포크 폭탄' }, shape: 'hexa', color: '#4ade80',
    hp: 26, speed: 100, radius: 15, dmg: 11, xp: 3, credits: 2,
    update(e, dt, w, p) { seek(e, p.x, p.y, e.speed, dt); e.rot += dt * 2; },
    onDeath(e, w) {
      for (let i = 0; i < 2; i++) w.spawnEnemy('mini', e.x + rand(-14, 14), e.y + rand(-14, 14));
    },
  },
  mini: {
    name: { en: 'CHILD PROCESS', ko: '자식 프로세스' }, shape: 'tri', color: '#86efac',
    hp: 6, speed: 200, radius: 7, dmg: 6, xp: 1, credits: 0, noSpawn: true,
    update(e, dt, w, p) { seek(e, p.x, p.y, e.speed, dt, 9); e.rot = Math.atan2(e.vy, e.vx); },
  },
  tank: {
    name: { en: 'MONOLITH', ko: '모놀리스' }, shape: 'square', color: '#94a3b8',
    hp: 90, speed: 52, radius: 22, dmg: 20, xp: 6, credits: 4,
    update(e, dt, w, p) { seek(e, p.x, p.y, e.speed, dt, 3); e.rot += dt * 0.6; },
  },
  shielded: {
    name: { en: 'CHECKSUM', ko: '체크섬' }, shape: 'penta', color: '#38bdf8',
    hp: 30, speed: 92, radius: 14, dmg: 12, xp: 4, credits: 3, frontShield: true,
    update(e, dt, w, p) { seek(e, p.x, p.y, e.speed, dt, 4); e.rot = angleTo(e.x, e.y, p.x, p.y); },
  },
  bomber: {
    name: { en: 'LOGIC BOMB', ko: '로직 폭탄' }, shape: 'circle', color: '#fb7185',
    hp: 14, speed: 120, radius: 12, dmg: 0, xp: 3, credits: 2, blastR: 95, blastDmg: 24,
    update(e, dt, w, p) {
      if (e.state === 'fuse') {
        e.t -= dt;
        e.vx *= 0.9; e.vy *= 0.9;
        if (e.t <= 0) { e.hp = 0; w.killEnemy(e, { noReward: false }); }
      } else {
        seek(e, p.x, p.y, e.speed, dt);
        if (dist2(e.x, e.y, p.x, p.y) < 95 * 95) { e.state = 'fuse'; e.t = 0.8; w.audio.sfx('telegraph'); }
      }
      e.rot += dt * 3;
    },
    init(e) { e.state = 'seek'; },
    onDeath(e, w) {
      w.effects.shockwave(e.x, e.y, '#fb7185', e.type.blastR, 5);
      w.audio.sfx('explode');
      w.playerAreaDamage(e.x, e.y, e.type.blastR, e.type.blastDmg * e.dmgScale);
    },
  },
  miner: {
    name: { en: 'TRAPDOOR', ko: '트랩도어' }, shape: 'square', color: '#fbbf24',
    hp: 22, speed: 105, radius: 12, dmg: 8, xp: 3, credits: 2,
    update(e, dt, w, p) {
      // wander waypoints
      if (!e.wpT || e.wpT <= 0) {
        e.wpX = clamp(e.x + rand(-260, 260), w.arena.x + 40, w.arena.x + w.arena.w - 40);
        e.wpY = clamp(e.y + rand(-260, 260), w.arena.y + 40, w.arena.y + w.arena.h - 40);
        e.wpT = rand(1.6, 2.6);
      }
      e.wpT -= dt;
      seek(e, e.wpX, e.wpY, e.speed, dt, 4);
      e.cool -= dt;
      if (e.cool <= 0) {
        e.cool = rand(2.4, 3.4);
        w.spawnMine(e.x, e.y, 12 * e.dmgScale);
        w.audio.sfx('mine');
      }
      e.rot += dt;
    },
    init(e) { e.cool = rand(1, 2); },
  },
  turret: {
    name: { en: 'DAEMON GUN', ko: '데몬 건' }, shape: 'hexa', color: '#a78bfa',
    hp: 34, speed: 0, radius: 15, dmg: 10, xp: 4, credits: 3,
    update(e, dt, w, p) {
      e.cool -= dt;
      if (e.cool <= 0) {
        e.burst = 3; e.cool = rand(2.6, 3.4); e.burstT = 0;
      }
      if (e.burst > 0) {
        e.burstT -= dt;
        if (e.burstT <= 0) {
          e.burstT = 0.14; e.burst -= 1;
          const a = angleTo(e.x, e.y, p.x, p.y) + rand(-0.08, 0.08);
          w.spawnBullet(e.x, e.y, Math.cos(a) * 260, Math.sin(a) * 260, { dmg: e.dmg, color: '#a78bfa' });
          w.audio.sfx('shoot');
        }
      }
      e.rot = angleTo(e.x, e.y, p.x, p.y);
    },
    init(e) { e.cool = rand(0.8, 1.6); e.burst = 0; },
  },
  charger: {
    name: { en: 'RAM HOG', ko: '램 호그' }, shape: 'square', color: '#f43f5e',
    hp: 46, speed: 90, radius: 18, dmg: 18, xp: 5, credits: 3,
    update(e, dt, w, p) {
      e.cool -= dt;
      if (e.state === 'stalk') {
        seek(e, p.x, p.y, e.speed * 0.7, dt, 3);
        if (e.cool <= 0 && dist2(e.x, e.y, p.x, p.y) < 420 * 420) {
          e.state = 'tele'; e.t = 0.7; w.audio.sfx('telegraph');
        }
      } else if (e.state === 'tele') {
        e.vx *= 0.88; e.vy *= 0.88;
        e.lockA = angleTo(e.x, e.y, p.x, p.y);
        e.t -= dt;
        if (e.t <= 0) { e.state = 'charge'; e.t = 0.85; }
      } else {
        e.vx = Math.cos(e.lockA) * e.speed * 4.4;
        e.vy = Math.sin(e.lockA) * e.speed * 4.4;
        w.effects.trail(e.x, e.y, '#f43f5e');
        e.t -= dt;
        if (e.t <= 0) { e.state = 'stalk'; e.cool = rand(1.8, 3); }
      }
      e.rot = e.state === 'stalk' ? angleTo(e.x, e.y, p.x, p.y) : (e.lockA ?? 0);
    },
    init(e) { e.state = 'stalk'; e.cool = rand(1, 2); },
  },
  healer: {
    name: { en: 'PATCH SERVER', ko: '패치 서버' }, shape: 'circle', color: '#34d399',
    hp: 24, speed: 88, radius: 13, dmg: 6, xp: 5, credits: 4,
    update(e, dt, w, p) {
      // stay away from player, near allies
      keepDistance(e, p, 340, e.speed, dt);
      e.cool -= dt;
      if (e.cool <= 0) {
        e.cool = 3.0;
        let healed = false;
        for (const o of w.enemies) {
          if (o !== e && !o.isBoss && o.hp < o.maxHp && dist2(e.x, e.y, o.x, o.y) < 180 * 180) {
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.18);
            w.effects.burst(o.x, o.y, '#34d399', 6, 90);
            healed = true;
          }
        }
        if (healed) w.effects.shockwave(e.x, e.y, '#34d399', 180, 2);
      }
      e.rot += dt * 1.4;
    },
    init(e) { e.cool = rand(1.5, 2.5); },
  },
  warper: {
    name: { en: 'SEGFAULT', ko: '세그폴트' }, shape: 'diamond', color: '#e879f9',
    hp: 20, speed: 70, radius: 11, dmg: 10, xp: 4, credits: 3,
    update(e, dt, w, p) {
      e.cool -= dt;
      if (e.cool <= 0) {
        e.cool = rand(2.2, 3.2);
        w.effects.burst(e.x, e.y, '#e879f9', 10, 160);
        const a = rand(TAU);
        const d = rand(140, 240);
        e.x = clamp(p.x + Math.cos(a) * d, w.arena.x + 30, w.arena.x + w.arena.w - 30);
        e.y = clamp(p.y + Math.sin(a) * d, w.arena.y + 30, w.arena.y + w.arena.h - 30);
        w.effects.burst(e.x, e.y, '#e879f9', 10, 160);
        w.audio.sfx('teleport');
        // ring of 4 shots
        for (let i = 0; i < 4; i++) {
          const sa = angleTo(e.x, e.y, p.x, p.y) + (i - 1.5) * 0.25;
          w.spawnBullet(e.x, e.y, Math.cos(sa) * 210, Math.sin(sa) * 210, { dmg: e.dmg, color: '#e879f9' });
        }
      }
      e.vx *= 0.94; e.vy *= 0.94;
      e.rot += dt * 4;
    },
    init(e) { e.cool = rand(1.2, 2.2); },
  },
  pulsar: {
    name: { en: 'BROADCAST', ko: '브로드캐스트' }, shape: 'hexa', color: '#22d3ee',
    hp: 30, speed: 40, radius: 16, dmg: 9, xp: 5, credits: 3,
    update(e, dt, w, p) {
      seek(e, p.x, p.y, e.speed, dt, 2);
      e.cool -= dt;
      if (e.cool <= 0) {
        e.cool = rand(2.6, 3.4);
        const n = 10;
        const off = rand(TAU);
        for (let i = 0; i < n; i++) {
          const a = off + (TAU * i) / n;
          w.spawnBullet(e.x, e.y, Math.cos(a) * 150, Math.sin(a) * 150, { dmg: e.dmg, color: '#22d3ee' });
        }
        w.audio.sfx('shoot');
        w.effects.shockwave(e.x, e.y, '#22d3ee', 40, 3);
      }
      e.rot += dt * 0.8;
    },
    init(e) { e.cool = rand(1.5, 2.5); },
  },
  leech: {
    name: { en: 'SIPHON WORM', ko: '사이펀 웜' }, shape: 'tri', color: '#818cf8',
    hp: 18, speed: 145, radius: 10, dmg: 4, xp: 3, credits: 2, drainRange: 130,
    update(e, dt, w, p) {
      const d2 = dist2(e.x, e.y, p.x, p.y);
      const rng = e.type.drainRange;
      if (d2 < rng * rng) {
        // drain shield
        e.vx *= 0.92; e.vy *= 0.92;
        e.draining = true;
        if (!p.dashing && p.hitInvuln <= 0) {
          p.shieldTimer = 0;
          if (p.shield > 0) p.shield = Math.max(0, p.shield - 9 * dt * e.dmgScale);
        }
      } else {
        e.draining = false;
        seek(e, p.x, p.y, e.speed, dt, 7);
      }
      e.rot = angleTo(e.x, e.y, p.x, p.y);
    },
  },
  spinner: {
    name: { en: 'BUSY LOOP', ko: '비지 루프' }, shape: 'penta', color: '#fda4af',
    hp: 26, speed: 55, radius: 14, dmg: 9, xp: 5, credits: 3,
    update(e, dt, w, p) {
      seek(e, p.x, p.y, e.speed, dt, 2);
      e.spiralA = (e.spiralA ?? 0) + dt * 4.2;
      e.cool -= dt;
      if (e.cool <= 0) {
        e.cool = 0.22;
        w.spawnBullet(e.x, e.y, Math.cos(e.spiralA) * 170, Math.sin(e.spiralA) * 170, { dmg: e.dmg, color: '#fda4af' });
      }
      e.rot = e.spiralA;
    },
    init(e) { e.cool = rand(0.5, 1.5); },
  },
  guardian: {
    name: { en: 'MUTEX', ko: '뮤텍스' }, shape: 'hexa', color: '#facc15',
    hp: 40, speed: 65, radius: 17, dmg: 12, xp: 6, credits: 4, auraR: 160,
    update(e, dt, w, p) {
      seek(e, p.x, p.y, e.speed, dt, 3);
      e.rot += dt * 0.7;
      // aura applied in world.dashSweep via guardedBy check
    },
  },

  // ================= EXPANSION ROSTER (20 new types) =================
  lancer: {
    name: { en: 'HOTPATH', ko: '핫패스' }, shape: 'diamond', color: '#fb923c',
    hp: 24, speed: 95, radius: 13, dmg: 15, xp: 4, credits: 2,
    init(e) { e.state = 'stalk'; e.cool = rand(1.2, 2.2); },
    update(e, dt, w, p) {
      e.cool -= dt;
      if (e.state === 'stalk') {
        keepDistance(e, p, 320, e.speed, dt);
        if (e.cool <= 0) { e.state = 'tele'; e.t = 0.85; e.lockA = angleTo(e.x, e.y, p.x, p.y); w.audio.sfx('telegraph'); }
      } else if (e.state === 'tele') {
        e.vx *= 0.88; e.vy *= 0.88;
        e.lockA = angleTo(e.x, e.y, p.x, p.y);
        e.telegraph = { a: e.lockA, len: 900, alpha: 1 - e.t / 0.85 };
        e.t -= dt;
        if (e.t <= 0) { e.state = 'pierce'; e.t = 1.1; e.telegraph = null; w.audio.sfx('dash'); }
      } else {
        e.vx = Math.cos(e.lockA) * e.speed * 6.5;
        e.vy = Math.sin(e.lockA) * e.speed * 6.5;
        w.effects.trail(e.x, e.y, '#fb923c');
        e.t -= dt;
        if (e.t <= 0) { e.state = 'stalk'; e.cool = rand(2, 3); }
      }
      e.rot = e.lockA ?? angleTo(e.x, e.y, p.x, p.y);
    },
  },
  weaver: {
    name: { en: 'LOOM THREAD', ko: '룸 스레드' }, shape: 'tri', color: '#67e8f9',
    hp: 16, speed: 130, radius: 10, dmg: 8, xp: 3, credits: 2,
    init(e) { e.cool = rand(1, 2); },
    update(e, dt, w, p) {
      const a = angleTo(e.x, e.y, p.x, p.y);
      const wob = Math.sin(w.time * 3.4 + e.seed * 9) * 190;
      seek(e, p.x + Math.cos(a + Math.PI / 2) * wob - Math.cos(a) * 240, p.y + Math.sin(a + Math.PI / 2) * wob - Math.sin(a) * 240, e.speed, dt, 5);
      e.cool -= dt;
      if (e.cool <= 0) {
        e.cool = 1.8;
        for (const s of [1, -1]) {
          const sa = a + s * 0.5;
          w.spawnBullet(e.x, e.y, Math.cos(sa) * 220, Math.sin(sa) * 220, { dmg: e.dmg, color: '#67e8f9' });
        }
        w.audio.sfx('shoot');
      }
      e.rot = a;
    },
  },
  mortar: {
    name: { en: 'LOBBER', ko: '로버' }, shape: 'penta', color: '#ffb347',
    hp: 28, speed: 70, radius: 14, dmg: 14, xp: 4, credits: 3,
    init(e) { e.cool = rand(1.5, 2.5); },
    update(e, dt, w, p) {
      keepDistance(e, p, 400, e.speed, dt);
      e.cool -= dt;
      if (e.cool <= 0) {
        e.cool = rand(2.6, 3.4);
        w.spawnMortar(p.x + p.vx * 0.5 + rand(-40, 40), p.y + p.vy * 0.5 + rand(-40, 40), e.dmg);
      }
      e.rot += dt * 0.8;
    },
  },
  aegisDrone: {
    name: { en: 'AEGIS DRONE', ko: '이지스 드론' }, shape: 'circle', color: '#93c5fd',
    hp: 20, speed: 110, radius: 11, dmg: 6, xp: 4, credits: 3,
    update(e, dt, w, p) {
      // find toughest ally and shadow it, granting damage reduction
      let best = null, bestHp = 0;
      for (const o of w.enemies) {
        if (o === e || o.isBoss || o.typeId === 'aegisDrone') continue;
        if (o.maxHp > bestHp) { bestHp = o.maxHp; best = o; }
      }
      if (best) {
        seek(e, best.x + 30, best.y - 30, e.speed, dt, 6);
        if (dist2(e.x, e.y, best.x, best.y) < 160 * 160) { best.aegisT = 0.5; e.tether = best; }
        else e.tether = null;
      } else {
        keepDistance(e, p, 320, e.speed, dt);
        e.tether = null;
      }
      e.rot += dt * 2;
    },
  },
  fractal: {
    name: { en: 'FRACTAL BOMB', ko: '프랙탈 폭탄' }, shape: 'hexa', color: '#86efac',
    hp: 40, speed: 85, radius: 18, dmg: 13, xp: 5, credits: 3,
    update(e, dt, w, p) { seek(e, p.x, p.y, e.speed, dt); e.rot += dt * 1.6; },
    onDeath(e, w) {
      for (let i = 0; i < 2; i++) w.spawnEnemy('splitter', e.x + rand(-18, 18), e.y + rand(-18, 18));
    },
  },
  magnetar: {
    name: { en: 'MAGNETAR', ko: '마그네타' }, shape: 'circle', color: '#a5b4fc',
    hp: 34, speed: 45, radius: 16, dmg: 10, xp: 5, credits: 3,
    init(e) { e.cool = rand(2, 3); },
    update(e, dt, w, p) {
      seek(e, p.x, p.y, e.speed, dt, 2);
      e.cool -= dt;
      if (e.state === 'pull') {
        e.t -= dt;
        if (!p.dashing) {
          const a = angleTo(p.x, p.y, e.x, e.y);
          p.vx += Math.cos(a) * 640 * dt;
          p.vy += Math.sin(a) * 640 * dt;
        }
        if (w.effects && Math.random() < 0.4) {
          const a = angleTo(e.x, e.y, p.x, p.y);
          w.effects.spawnParticle(p.x - Math.cos(a) * rand(0, 40), p.y - Math.sin(a) * rand(0, 40), { vx: Math.cos(a + Math.PI) * 180, vy: Math.sin(a + Math.PI) * 180, color: '#a5b4fc', life: 0.3, size: 3 });
        }
        if (e.t <= 0) { e.state = null; e.cool = rand(2.6, 3.6); }
      } else if (e.cool <= 0 && dist2(e.x, e.y, p.x, p.y) < 420 * 420) {
        e.state = 'pull'; e.t = 0.9;
        w.audio.sfx('laser');
      }
      e.rot -= dt * 3;
    },
  },
  repulsor: {
    name: { en: 'REPULSOR', ko: '리펄서' }, shape: 'hexa', color: '#fca5a5',
    hp: 36, speed: 55, radius: 16, dmg: 9, xp: 5, credits: 3,
    init(e) { e.cool = rand(1.5, 2.5); },
    update(e, dt, w, p) {
      seek(e, p.x, p.y, e.speed, dt, 2);
      const d2 = dist2(e.x, e.y, p.x, p.y);
      if (d2 < 220 * 220 && !p.dashing) {
        const a = angleTo(e.x, e.y, p.x, p.y);
        const push = 420 * (1 - Math.sqrt(d2) / 220);
        p.vx += Math.cos(a) * push * dt * 4;
        p.vy += Math.sin(a) * push * dt * 4;
      }
      e.cool -= dt;
      if (e.cool <= 0) {
        e.cool = 2.5;
        for (let i = 0; i < 8; i++) {
          const a = (TAU * i) / 8 + rand(0.2);
          w.spawnBullet(e.x, e.y, Math.cos(a) * 170, Math.sin(a) * 170, { dmg: e.dmg, color: '#fca5a5' });
        }
        w.audio.sfx('shoot');
      }
      e.rot += dt * 1.2;
    },
  },
  railgun: {
    name: { en: 'RAILSPIRE', ko: '레일스파이어' }, shape: 'diamond', color: '#f87171',
    hp: 30, speed: 0, radius: 14, dmg: 18, xp: 5, credits: 3,
    init(e) { e.cool = rand(1.5, 2.5); },
    update(e, dt, w, p) {
      e.cool -= dt;
      if (e.cool <= 0) {
        e.cool = rand(3.0, 3.8);
        const a = angleTo(e.x, e.y, p.x, p.y);
        w.spawnBeam(e.x, e.y, a, 850, { dmg: e.dmg, width: 12, teleDur: 0.85, fireDur: 0.25, color: '#f87171' });
      }
      e.rot = angleTo(e.x, e.y, p.x, p.y);
    },
  },
  broodmother: {
    name: { en: 'BROOD INDEX', ko: '브루드 인덱스' }, shape: 'hexa', color: '#fde047',
    hp: 55, speed: 48, radius: 19, dmg: 12, xp: 7, credits: 5,
    init(e) { e.cool = rand(1.5, 2.5); },
    update(e, dt, w, p) {
      keepDistance(e, p, 360, e.speed, dt);
      e.cool -= dt;
      if (e.cool <= 0 && w.enemies.length < 70) {
        e.cool = 3.2;
        for (let i = 0; i < 2; i++) w.spawnEnemy('swarmer', e.x + rand(-24, 24), e.y + rand(-24, 24));
        w.effects.shockwave(e.x, e.y, '#fde047', 46, 3);
        w.audio.sfx('teleport');
      }
      e.rot += dt;
    },
  },
  phantasm: {
    name: { en: 'PHANTASM', ko: '팬타즘' }, shape: 'tri', color: '#e2e8f0',
    hp: 20, speed: 150, radius: 11, dmg: 12, xp: 4, credits: 3, ghost: true,
    update(e, dt, w, p) {
      seek(e, p.x, p.y, e.speed, dt, 6);
      e.ghostAlpha = dist2(e.x, e.y, p.x, p.y) < 210 * 210 ? 1 : 0.14;
      e.rot = angleTo(e.x, e.y, p.x, p.y);
    },
  },
  bulwark: {
    name: { en: 'BULWARK', ko: '불워크' }, shape: 'square', color: '#cbd5e1',
    hp: 130, speed: 40, radius: 26, dmg: 22, xp: 8, credits: 6, frontShield: true,
    init(e) { e.cool = rand(1, 2); },
    update(e, dt, w, p) {
      seek(e, p.x, p.y, e.speed, dt, 2);
      e.cool -= dt;
      if (e.cool <= 0 && dist2(e.x, e.y, p.x, p.y) < 150 * 150) {
        e.cool = 2.2;
        w.effects.shockwave(e.x, e.y, '#cbd5e1', 140, 5);
        w.audio.sfx('explode');
        w.playerAreaDamage(e.x, e.y, 140, Math.round(e.dmg * 0.7), 'hazard');
      }
      e.rot = angleTo(e.x, e.y, p.x, p.y);
    },
  },
  corruptor: {
    name: { en: 'CORRUPTOR', ko: '커럽터' }, shape: 'circle', color: '#4ade80',
    hp: 26, speed: 105, radius: 13, dmg: 10, xp: 4, credits: 3,
    update(e, dt, w, p) { seek(e, p.x, p.y, e.speed, dt); e.rot += dt * 2.4; },
    onDeath(e, w) {
      w.spawnPool(e.x, e.y, 70, 10 * e.dmgScale, 4);
    },
  },
  blitz: {
    name: { en: 'BLITZ CYCLE', ko: '블리츠 사이클' }, shape: 'diamond', color: '#5eead4',
    hp: 14, speed: 210, radius: 9, dmg: 10, xp: 3, credits: 2,
    init(e) { e.cool = rand(1, 2); },
    update(e, dt, w, p) {
      e.orbA = (e.orbA ?? rand(TAU)) + dt * 2.2 * e.strafeDir;
      seek(e, p.x + Math.cos(e.orbA) * 180, p.y + Math.sin(e.orbA) * 180, e.speed, dt, 8);
      e.cool -= dt;
      if (e.cool <= 0) {
        e.cool = rand(1.6, 2.4);
        const ta = e.orbA + Math.PI / 2 * e.strafeDir;
        e.vx = Math.cos(ta) * e.speed * 3;
        e.vy = Math.sin(ta) * e.speed * 3;
      }
      e.rot = Math.atan2(e.vy, e.vx);
    },
  },
  drainSpire: {
    name: { en: 'DRAIN SPIRE', ko: '드레인 스파이어' }, shape: 'penta', color: '#818cf8',
    hp: 38, speed: 0, radius: 15, dmg: 5, xp: 5, credits: 4, drainRange: 330,
    update(e, dt, w, p) {
      const rng = e.type.drainRange;
      if (dist2(e.x, e.y, p.x, p.y) < rng * rng) {
        e.draining = true;
        if (!p.dashing && p.hitInvuln <= 0) {
          p.shieldTimer = 0;
          if (p.shield > 0) p.shield = Math.max(0, p.shield - 5 * dt * e.dmgScale);
          else {
            e.hpDrainCd = e.hpDrainCd || 0;
            if (w.time > e.hpDrainCd) { e.hpDrainCd = w.time + 0.6; p.takeDamage(3, w, 'hazard'); }
          }
        }
      } else e.draining = false;
      e.rot += dt * 0.6;
    },
  },
  flak: {
    name: { en: 'FLAK NEST', ko: '플랙 네스트' }, shape: 'penta', color: '#fdba74',
    hp: 26, speed: 85, radius: 13, dmg: 7, xp: 4, credits: 3,
    init(e) { e.cool = rand(1, 2); },
    update(e, dt, w, p) {
      keepDistance(e, p, 250, e.speed, dt);
      e.cool -= dt;
      if (e.cool <= 0) {
        e.cool = rand(2.0, 2.6);
        const base = angleTo(e.x, e.y, p.x, p.y);
        for (let i = 0; i < 5; i++) {
          const a = base + (i - 2) * 0.22;
          w.spawnBullet(e.x, e.y, Math.cos(a) * rand(200, 260), Math.sin(a) * rand(200, 260), { dmg: e.dmg, color: '#fdba74', life: 1.1, r: 4 });
        }
        w.audio.sfx('shoot');
      }
      e.rot = angleTo(e.x, e.y, p.x, p.y);
    },
  },
  hunterKiller: {
    name: { en: 'HUNTER-KILLER', ko: '헌터킬러' }, shape: 'diamond', color: '#f472b6',
    hp: 30, speed: 90, radius: 13, dmg: 11, xp: 5, credits: 4,
    init(e) { e.cool = rand(1.5, 2.5); },
    update(e, dt, w, p) {
      keepDistance(e, p, 340, e.speed, dt);
      e.cool -= dt;
      if (e.cool <= 0) {
        e.cool = rand(2.8, 3.6);
        const a = angleTo(e.x, e.y, p.x, p.y);
        w.spawnBullet(e.x, e.y, Math.cos(a) * 150, Math.sin(a) * 150, { dmg: e.dmg, color: '#f472b6', r: 7, life: 4.5, homing: 2.4 });
        w.audio.sfx('laser');
      }
      e.rot = angleTo(e.x, e.y, p.x, p.y);
    },
  },
  pylon: {
    name: { en: 'WARD PYLON', ko: '워드 파일런' }, shape: 'hexa', color: '#fef08a',
    hp: 46, speed: 0, radius: 16, dmg: 0, xp: 6, credits: 5, auraR: 210,
    update(e, dt, w, p) { e.rot += dt * 0.5; },
  },
  wingman: {
    name: { en: 'KAMIKAZE WING', ko: '카미카제 윙' }, shape: 'tri', color: '#fb7185',
    hp: 12, speed: 195, radius: 10, dmg: 0, xp: 3, credits: 2, blastR: 85, blastDmg: 20,
    init(e) { e.state = 'seek'; },
    update(e, dt, w, p) {
      if (e.state === 'fuse') {
        e.t -= dt;
        e.vx *= 0.9; e.vy *= 0.9;
        if (e.t <= 0) { e.hp = 0; w.killEnemy(e, {}); }
      } else {
        const zig = Math.sin(w.time * 7 + e.seed * 12) * 130;
        const a = angleTo(e.x, e.y, p.x, p.y) + Math.PI / 2;
        seek(e, p.x + Math.cos(a) * zig, p.y + Math.sin(a) * zig, e.speed, dt, 9);
        if (dist2(e.x, e.y, p.x, p.y) < 80 * 80) { e.state = 'fuse'; e.t = 0.5; w.audio.sfx('telegraph'); }
      }
      e.rot = Math.atan2(e.vy, e.vx);
    },
    onDeath(e, w) {
      w.effects.shockwave(e.x, e.y, '#fb7185', e.type.blastR, 4);
      w.audio.sfx('explode');
      w.playerAreaDamage(e.x, e.y, e.type.blastR, e.type.blastDmg * e.dmgScale, 'hazard');
    },
  },
  mirrorer: {
    name: { en: 'MIRROR DAEMON', ko: '미러 데몬' }, shape: 'diamond', color: '#c4b5fd',
    hp: 24, speed: 60, radius: 12, dmg: 10, xp: 4, credits: 3,
    init(e) { e.cool = rand(1.5, 2.5); },
    update(e, dt, w, p) {
      e.cool -= dt;
      if (e.cool <= 0) {
        e.cool = rand(2.4, 3.2);
        w.effects.burst(e.x, e.y, '#c4b5fd', 10, 160);
        // teleport to the player's mirrored position through the arena center
        e.x = clamp(-p.x, w.arena.x + 40, w.arena.x + w.arena.w - 40);
        e.y = clamp(-p.y, w.arena.y + 40, w.arena.y + w.arena.h - 40);
        w.effects.burst(e.x, e.y, '#c4b5fd', 10, 160);
        w.audio.sfx('teleport');
        const a = angleTo(e.x, e.y, p.x, p.y);
        for (let i = 0; i < 3; i++) {
          w.spawnBullet(e.x, e.y, Math.cos(a + (i - 1) * 0.15) * 230, Math.sin(a + (i - 1) * 0.15) * 230, { dmg: e.dmg, color: '#c4b5fd' });
        }
      }
      e.vx *= 0.92; e.vy *= 0.92;
      e.rot += dt * 3;
    },
  },
  overseer: {
    name: { en: 'OVERSEER', ko: '오버시어' }, shape: 'penta', color: '#fbbf24',
    hp: 44, speed: 70, radius: 16, dmg: 10, xp: 7, credits: 5, hasteR: 230,
    update(e, dt, w, p) {
      keepDistance(e, p, 380, e.speed, dt);
      for (const o of w.enemies) {
        if (o !== e && !o.isBoss && dist2(e.x, e.y, o.x, o.y) < 230 * 230) o.hasteT = 0.4;
      }
      e.rot += dt * 1.1;
    },
  },
};

export const ENEMY_IDS = Object.keys(ENEMY_TYPES).filter((id) => !ENEMY_TYPES[id].noSpawn);

let nextEnemyId = 1;

export class Enemy {
  constructor(typeId, x, y, hpScale = 1, dmgScale = 1, elite = false) {
    const t = ENEMY_TYPES[typeId];
    this.id = nextEnemyId++;
    this.typeId = typeId;
    this.type = t;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.elite = elite;
    const eliteMul = elite ? 6.4 : 1; // elites are twice as mean as they used to be
    this.maxHp = Math.round(t.hp * hpScale * eliteMul);
    this.hp = this.maxHp;
    this.speed = t.speed * (elite ? 1.22 : 1) * rand(0.92, 1.08);
    this.radius = t.radius * (elite ? 1.45 : 1);
    this.dmg = Math.round(t.dmg * dmgScale * (elite ? 2.0 : 1));
    this.dmgScale = dmgScale;
    this.xp = t.xp * (elite ? 6 : 1);
    this.credits = t.credits * (elite ? 9 : 1);
    this.rot = rand(TAU);
    this.seed = Math.random();
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.t = 0; this.cool = 0; this.state = null;
    this.hitFlash = 0;
    this.spawnT = 0.6; // spawn-in animation / grace
    this.isBoss = false;
    this.telegraph = null;
    if (t.init) t.init(this);
  }

  update(dt, world, player) {
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    if (this.spawnT > 0) { this.spawnT -= dt; return; }
    // buff/debuff timers from support enemies
    if (this.aegisT > 0) this.aegisT -= dt;
    if (this.hasteT > 0) this.hasteT -= dt;
    // slow aura from player
    let slowMul = 1;
    if (player.mods.slowAura > 0 && dist2(this.x, this.y, player.x, player.y) < 240 * 240) {
      slowMul = 1 - player.mods.slowAura;
    }
    if (this.hasteT > 0) slowMul *= 1.35;
    const edt = dt * slowMul;
    this.type.update(this, edt, world, player);
    this.x += this.vx * edt;
    this.y += this.vy * edt;
    const a = world.arena;
    this.x = clamp(this.x, a.x + this.radius, a.x + a.w - this.radius);
    this.y = clamp(this.y, a.y + this.radius, a.y + a.h - this.radius);
  }

  draw(ctx, camX, camY) {
    const x = this.x - camX, y = this.y - camY;
    const t = this.type;
    const spawnScale = this.spawnT > 0 ? 1 - this.spawnT / 0.6 : 1;
    const r = this.radius * (0.4 + 0.6 * spawnScale);

    ctx.save();
    // phase-shifted enemies fade out at range
    if (t.ghost) ctx.globalAlpha = this.ghostAlpha ?? 0.14;
    // spawn-in ring
    if (this.spawnT > 0) {
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, r + 14 * (this.spawnT / 0.6), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = spawnScale * 0.7 + 0.1;
    }
    // glow
    ctx.globalCompositeOperation = 'lighter';
    const spr = glowSprite(this.elite ? '#ffd700' : t.color);
    const gs = r * 4.2;
    ctx.globalAlpha *= 0.5;
    ctx.drawImage(spr, x - gs / 2, y - gs / 2, gs, gs);
    ctx.globalAlpha = this.spawnT > 0 ? spawnScale : 1;
    ctx.globalCompositeOperation = 'source-over';

    // elite aura ring
    if (this.elite) {
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha *= 0.8;
      ctx.beginPath();
      ctx.arc(x, y, r + 6, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = this.spawnT > 0 ? spawnScale : 1;
    }
    // guardian aura
    if (t.auraR) {
      ctx.globalAlpha *= 0.15;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, t.auraR, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = this.spawnT > 0 ? spawnScale : 1;
    }
    // leech drain beam drawn in world (needs player pos)

    // body
    const color = this.hitFlash > 0 ? '#ffffff' : t.color;
    this.drawShape(ctx, x, y, r, this.rot, t.shape, color);

    // front shield arc
    if (t.frontShield) {
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(x, y, r + 6, this.rot - 1.1, this.rot + 1.1);
      ctx.stroke();
    }
    // bomber fuse blink
    if (this.typeId === 'bomber' && this.state === 'fuse') {
      if (Math.floor(this.t * 12) % 2 === 0) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, TAU); ctx.fill();
      }
    }
    // hp bar for damaged non-trash
    if (this.hp < this.maxHp && this.maxHp > 15) {
      const bw = r * 2.4;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x - bw / 2, y - r - 12, bw, 3.5);
      ctx.fillStyle = this.elite ? '#ffd700' : '#ff5577';
      ctx.fillRect(x - bw / 2, y - r - 12, bw * (this.hp / this.maxHp), 3.5);
    }
    // telegraph line (sniper)
    if (this.telegraph) {
      const tg = this.telegraph;
      ctx.globalAlpha = 0.35 * tg.alpha;
      ctx.strokeStyle = '#ff5533';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(tg.a) * tg.len, y + Math.sin(tg.a) * tg.len);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  drawShape(ctx, x, y, r, rot, shape, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.strokeStyle = color;
    ctx.fillStyle = 'rgba(5,8,18,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const sides = { tri: 3, diamond: 4, square: 4, penta: 5, hexa: 6 }[shape];
    if (shape === 'circle') {
      ctx.arc(0, 0, r, 0, TAU);
    } else if (shape === 'diamond') {
      ctx.moveTo(r, 0); ctx.lineTo(0, r * 0.65); ctx.lineTo(-r, 0); ctx.lineTo(0, -r * 0.65);
    } else {
      for (let i = 0; i < sides; i++) {
        const a = (TAU * i) / sides;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // inner core dot
    ctx.fillStyle = color;
    ctx.globalAlpha *= 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2, r * 0.22), 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
