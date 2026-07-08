// pvp.js — VERSUS PROTOCOL: 1v1 duel with QWER skill loadouts, host-authoritative over P2P.
// Movement: WASD/arrows, or hold Right Mouse Button to glide toward the cursor (MOBA-style).
// Q/W/E/R cast skills at the cursor. Space/LMB = dash. First to 3 kills.
import { TAU, rand, clamp, lerp, angleTo, dist, dist2, circleSegHit } from './utils.js';
import { Player } from './player.js';
import { glowSprite, resolveColor, Effects, Background } from './effects.js';
import { L, t } from './i18n.js';

export const PVP_PALETTE = {
  bgInner: '#0a0714', bgOuter: '#050308',
  grid: 'rgba(192,132,252,0.08)', mote: '#c084fc',
  player: '#00f0ff', wall: '#c084fc', accent: '#c084fc',
};

const ARENA = { x: -575, y: -360, w: 1150, h: 720 };
const WIN_SCORE = 3;

// ---- skill definitions: two options per slot, pick one each ----
export const SKILLS = {
  bolt: { slot: 'q', icon: '➹', cd: 1.1,
    name: { en: 'VOLT BOLT', ko: '볼트 탄' },
    desc: { en: 'Fast skillshot. 16 dmg. Spammable poke.', ko: '빠른 스킬샷. 피해 16. 부담 없이 견제하는 기본기.' } },
  lance: { slot: 'q', cd: 3.2, icon: '⇶',
    name: { en: 'SHARD LANCE', ko: '파편 랜스' },
    desc: { en: 'Heavy slow skillshot. 30 dmg + knockback.', ko: '무겁고 느린 스킬샷. 피해 30 + 넉백. 맞히면 아픕니다.' } },
  ward: { slot: 'w', cd: 7, icon: '⛨',
    name: { en: 'NULL WARD', ko: '널 워드' },
    desc: { en: 'Block ALL damage for 1.2s.', ko: '1.2초간 모든 피해를 막는 보호막.' } },
  mend: { slot: 'w', cd: 9, icon: '✚',
    name: { en: 'HOT PATCH', ko: '핫 패치' },
    desc: { en: 'Instantly restore 30 integrity.', ko: '무결성을 즉시 30 회복.' } },
  flicker: { slot: 'e', cd: 6, icon: '✧',
    name: { en: 'FLICKER', ko: '플리커' },
    desc: { en: 'Blink 240 units toward your cursor.', ko: '커서 방향으로 240만큼 순간이동. 진실의 점멸.' } },
  hook: { slot: 'e', cd: 8.5, icon: '⚓',
    name: { en: 'GRAVITY HOOK', ko: '그래비티 훅' },
    desc: { en: 'Skillshot that drags the enemy to you. 12 dmg.', ko: '적중 시 상대를 내 앞까지 끌어옵니다. 피해 12.' } },
  nova: { slot: 'r', cd: 13, icon: '❂',
    name: { en: 'OVERDRIVE NOVA', ko: '오버드라이브 노바' },
    desc: { en: 'ULT: 16 bolts burst out around you. 14 dmg each.', ko: '궁극기: 사방으로 탄환 16발 폭사. 발당 피해 14.' } },
  railstorm: { slot: 'r', cd: 15, icon: '☄',
    name: { en: 'RAILSTORM', ko: '레일스톰' },
    desc: { en: 'ULT: 3 telegraphed rail beams chase your cursor. 22 dmg each.', ko: '궁극기: 커서를 쫓는 레일 빔 3연발. 발당 피해 22.' } },
};
export const SLOT_OPTIONS = { q: ['bolt', 'lance'], w: ['ward', 'mend'], e: ['flicker', 'hook'], r: ['nova', 'railstorm'] };
export const DEFAULT_LOADOUT = { q: 'bolt', w: 'ward', e: 'flicker', r: 'nova' };

export function pvpRewards(won) { return won ? { rubies: 3, credits: 60 } : { rubies: 1, credits: 20 }; }

// ---------------------------------------------------------------- duelist
class Duelist {
  constructor(loadout, color, shape, name) {
    this.loadout = Object.assign({}, DEFAULT_LOADOUT, loadout || {});
    this.color = color; this.shape = shape; this.name = name;
    this.maxHp = 180; this.maxShield = 50;
    this.reset(0, 0);
    this.cds = { q: 0, w: 0, e: 0, r: 0 };
    this.score = 0;
  }
  reset(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.hp = this.maxHp; this.shield = this.maxShield;
    this.shieldTimer = 0;
    this.aim = 0;
    this.dashCharges = 3; this.dashing = false; this.dashT = 0; this.dashDir = 0;
    this.blockT = 0; this.hitFlash = 0; this.slowT = 0;
    this.alive = true;
  }
}

// ---------------------------------------------------------------- host world
export class PvpWorld {
  constructor(game, net, loadouts, roster) {
    this.game = game;
    this.net = net;
    this.audio = game.audio;
    this.effects = game.effects;
    this.arena = ARENA;
    this.time = 0;
    this.duelists = [
      new Duelist(loadouts[0], roster[0].color, roster[0].shape, roster[0].name),
      new Duelist(loadouts[1], roster[1].color, roster[1].shape, roster[1].name),
    ];
    this.remote = { vx: 0, vy: 0, ax: 0, ay: 0, d: false, q: false, w: false, e: false, r: false };
    this.projectiles = [];
    this.beams = [];
    this.phase = 'count'; // count | fight | pause | over
    this.phaseT = 3.0;
    this.round = 1;
    this.snapTimer = 0;
    this.camX = 0; this.camY = 0;
    this.mouseWX = 0; this.mouseWY = 0;
    this.resetRound();
  }

  resetRound() {
    this.duelists[0].reset(this.arena.x + 180, 0);
    this.duelists[1].reset(this.arena.x + this.arena.w - 180, 0);
    this.projectiles.length = 0;
    this.beams.length = 0;
    this.phase = 'count';
    this.phaseT = 3.0;
    this.audio.sfx('telegraph');
  }

  onRemoteInput(msg) {
    this.remote.vx = clamp(msg.vx || 0, -1, 1);
    this.remote.vy = clamp(msg.vy || 0, -1, 1);
    this.remote.ax = msg.ax || 0; this.remote.ay = msg.ay || 0;
    if (msg.d) this.remote.d = true;
    for (const k of ['q', 'w', 'e', 'r']) if (msg[k]) this.remote[k] = true;
  }

  localMove(input, w, h) {
    // RMB glides toward cursor; otherwise WASD/arrows
    if (input.rightDown) {
      const dx = this.mouseWX - this.duelists[0].x, dy = this.mouseWY - this.duelists[0].y;
      const m = Math.hypot(dx, dy);
      if (m > 24) return { x: dx / m, y: dy / m };
      return { x: 0, y: 0 };
    }
    return input.moveVector();
  }

  castSkill(d, other, key) {
    const skillId = d.loadout[key];
    const sk = SKILLS[skillId];
    if (!sk || d.cds[key] > 0 || !d.alive) return;
    d.cds[key] = sk.cd;
    const a = d.aim;
    this.audio.sfx('uiClick');
    switch (skillId) {
      case 'bolt':
        this.projectiles.push({ x: d.x, y: d.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, r: 6, dmg: 16, kind: 'bolt', owner: d, life: 2 });
        this.audio.sfx('shoot');
        break;
      case 'lance':
        this.projectiles.push({ x: d.x, y: d.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, r: 10, dmg: 30, kind: 'lance', owner: d, life: 2.4, knock: 340 });
        this.audio.sfx('laser');
        break;
      case 'ward':
        d.blockT = 1.2;
        this.audio.sfx('shieldUp');
        break;
      case 'mend':
        d.hp = Math.min(d.maxHp, d.hp + 30);
        this.effects.burst(d.x, d.y, '#4aff8f', 12, 160);
        this.audio.sfx('heal');
        break;
      case 'flicker': {
        this.effects.burst(d.x, d.y, d.color === 'rainbow' ? '#fff' : d.color, 12, 200);
        d.x = clamp(d.x + Math.cos(a) * 240, this.arena.x + 14, this.arena.x + this.arena.w - 14);
        d.y = clamp(d.y + Math.sin(a) * 240, this.arena.y + 14, this.arena.y + this.arena.h - 14);
        this.effects.burst(d.x, d.y, d.color === 'rainbow' ? '#fff' : d.color, 12, 200);
        this.audio.sfx('teleport');
        break;
      }
      case 'hook':
        this.projectiles.push({ x: d.x, y: d.y, vx: Math.cos(a) * 460, vy: Math.sin(a) * 460, r: 7, dmg: 12, kind: 'hook', owner: d, life: 1.4 });
        this.audio.sfx('dash');
        break;
      case 'nova':
        for (let i = 0; i < 16; i++) {
          const na = (TAU * i) / 16;
          this.projectiles.push({ x: d.x, y: d.y, vx: Math.cos(na) * 300, vy: Math.sin(na) * 300, r: 6, dmg: 14, kind: 'nova', owner: d, life: 1.6 });
        }
        this.effects.shockwave(d.x, d.y, '#ff2fd6', 120, 6);
        this.audio.sfx('bigExplode');
        break;
      case 'railstorm':
        for (let i = 0; i < 3; i++) {
          this.beams.push({ owner: d, t: 0.45 + i * 0.45, tele: 0.45, dmg: 22, len: 900, a, fired: false });
        }
        this.audio.sfx('bossWarn');
        break;
    }
  }

  damage(d, dmg, from) {
    if (!d.alive || d.blockT > 0) {
      if (d.blockT > 0) { this.effects.shockwave(d.x, d.y, '#ffffff', 34, 3); this.audio.sfx('hit'); }
      return;
    }
    if (d.dashing) return; // dash i-frames
    d.shieldTimer = 0;
    d.hitFlash = 1;
    if (d.shield > 0) {
      const abs = Math.min(d.shield, dmg);
      d.shield -= abs; dmg -= abs;
      if (d.shield <= 0) this.audio.sfx('shieldBreak');
    }
    if (dmg > 0) d.hp -= dmg;
    this.audio.sfx('playerHit');
    this.effects.burst(d.x, d.y, '#ff3b5c', 10, 200);
    if (d === this.duelists[0]) this.game.flashDamage();
    if (d.hp <= 0) {
      d.alive = false;
      d.hp = 0;
      const killer = this.duelists[0] === d ? this.duelists[1] : this.duelists[0];
      killer.score += 1;
      this.effects.burst(d.x, d.y, resolveColor(d.color, this.time), 40, 380);
      this.effects.shockwave(d.x, d.y, '#ffffff', 200, 8);
      this.audio.sfx('bigExplode');
      this.effects.shake(12);
      if (killer.score >= WIN_SCORE) {
        this.phase = 'over';
        this.phaseT = 2.0;
        this.net.broadcast({ t: 'over', v: killer === this.duelists[1], pvp: true }); // guest is index 1
        this.game.pvpOver(killer === this.duelists[0]);
      } else {
        this.phase = 'pause';
        this.phaseT = 2.2;
        this.round += 1;
      }
    }
  }

  updateDuelist(d, mv, aimX, aimY, wantDash, keys, other, dt) {
    d.hitFlash = Math.max(0, d.hitFlash - dt * 5);
    d.blockT = Math.max(0, d.blockT - dt);
    d.slowT = Math.max(0, d.slowT - dt);
    for (const k of ['q', 'w', 'e', 'r']) d.cds[k] = Math.max(0, d.cds[k] - dt);
    // shield regen
    d.shieldTimer += dt;
    if (d.shieldTimer > 2.5 && d.shield < d.maxShield) d.shield = Math.min(d.maxShield, d.shield + 9 * dt);
    // dash recharge
    if (d.dashCharges < 3) d.dashCharges = Math.min(3, d.dashCharges + dt / 1.5);
    d.aim = angleTo(d.x, d.y, aimX, aimY);
    if (this.phase !== 'fight') { d.vx *= 0.85; d.vy *= 0.85; return; }

    if (d.dashing) {
      d.x += Math.cos(d.dashDir) * 1400 * dt;
      d.y += Math.sin(d.dashDir) * 1400 * dt;
      d.dashT -= dt;
      this.effects.trail(d.x, d.y, resolveColor(d.color, this.time));
      // dash through the opponent: 25 dmg once
      if (!d.dashHit && other.alive && dist2(d.x, d.y, other.x, other.y) < 30 * 30) {
        d.dashHit = true;
        this.damage(other, 25, d);
      }
      if (d.dashT <= 0) d.dashing = false;
    } else {
      const spd = 285 * (d.slowT > 0 ? 0.55 : 1);
      d.vx = lerp(d.vx, mv.x * spd, 1 - Math.exp(-14 * dt));
      d.vy = lerp(d.vy, mv.y * spd, 1 - Math.exp(-14 * dt));
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (wantDash && d.dashCharges >= 1) {
        d.dashCharges -= 1;
        d.dashing = true; d.dashT = 0.16; d.dashDir = d.aim; d.dashHit = false;
        this.audio.sfx('dash');
      }
      for (const k of ['q', 'w', 'e', 'r']) if (keys[k]) this.castSkill(d, other, k);
    }
    d.x = clamp(d.x, this.arena.x + 12, this.arena.x + this.arena.w - 12);
    d.y = clamp(d.y, this.arena.y + 12, this.arena.y + this.arena.h - 12);
  }

  update(dt, input, w, h) {
    this.time += dt;
    this.mouseWX = input.mouseX + this.camX;
    this.mouseWY = input.mouseY + this.camY;
    const [me, foe] = this.duelists;

    // phase machine
    this.phaseT -= dt;
    if (this.phase === 'count' && this.phaseT <= 0) { this.phase = 'fight'; this.audio.sfx('waveClear'); }
    else if (this.phase === 'pause' && this.phaseT <= 0) this.resetRound();

    // local player keys
    const keys = {
      q: input.wasPressed('KeyQ'), w: input.wasPressed('KeyW'),
      e: input.wasPressed('KeyE'), r: input.wasPressed('KeyR'),
    };
    // in PVP, W is a skill — vertical movement comes from arrows or RMB glide
    const mv = this.localMove(input, w, h);
    if (!input.rightDown) { // strip W from WASD movement to avoid firing+moving conflicts
      mv.y = (input.keys.has('ArrowUp') ? -1 : 0) + (input.keys.has('ArrowDown') || input.keys.has('KeyS') ? 1 : 0);
      mv.x = (input.keys.has('ArrowLeft') || input.keys.has('KeyA') ? -1 : 0) + (input.keys.has('ArrowRight') || input.keys.has('KeyD') ? 1 : 0);
      const m = Math.hypot(mv.x, mv.y);
      if (m > 1) { mv.x /= m; mv.y /= m; }
    }
    this.updateDuelist(me, mv, this.mouseWX, this.mouseWY, input.consumeDash(), keys, foe, dt);

    // remote player
    const rkeys = { q: this.remote.q, w: this.remote.w, e: this.remote.e, r: this.remote.r };
    this.updateDuelist(foe, { x: this.remote.vx, y: this.remote.vy }, this.remote.ax, this.remote.ay, this.remote.d, rkeys, me, dt);
    this.remote.d = false;
    for (const k of ['q', 'w', 'e', 'r']) this.remote[k] = false;

    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt;
      const a = this.arena;
      if (p.life <= 0 || p.x < a.x - 20 || p.x > a.x + a.w + 20 || p.y < a.y - 20 || p.y > a.y + a.h + 20) {
        this.projectiles.splice(i, 1); continue;
      }
      const target = p.owner === me ? foe : me;
      if (target.alive && !target.dashing && dist2(p.x, p.y, target.x, target.y) < (p.r + 12) ** 2) {
        this.projectiles.splice(i, 1);
        this.damage(target, p.dmg, p.owner);
        if (p.kind === 'hook' && target.alive) {
          // drag the target to the caster
          const pull = angleTo(target.x, target.y, p.owner.x, p.owner.y);
          const d3 = dist(target.x, target.y, p.owner.x, p.owner.y);
          const move = Math.max(0, d3 - 60);
          target.x += Math.cos(pull) * move;
          target.y += Math.sin(pull) * move;
          target.slowT = 0.8;
          this.audio.sfx('teleport');
        }
        if (p.knock && target.alive) {
          const ka = Math.atan2(p.vy, p.vx);
          target.vx += Math.cos(ka) * p.knock;
          target.vy += Math.sin(ka) * p.knock;
        }
      }
    }

    // rail beams (track the caster's current aim while telegraphing)
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t -= dt;
      if (!b.fired && b.t <= b.tele) b.a = b.owner.aim; // lock at fire moment approach
      if (!b.fired && b.t <= 0) {
        b.fired = true;
        const target = b.owner === me ? foe : me;
        const ex = b.owner.x + Math.cos(b.a) * b.len, ey = b.owner.y + Math.sin(b.a) * b.len;
        if (target.alive && !target.dashing && circleSegHit(target.x, target.y, 16, b.owner.x, b.owner.y, ex, ey)) {
          this.damage(target, b.dmg, b.owner);
        }
        this.audio.sfx('laser');
        b.flash = 0.15;
      }
      if (b.fired) {
        b.flash -= dt;
        if (b.flash <= 0) this.beams.splice(i, 1);
      }
    }

    this.effects.update(dt);
    // camera: centered arena (fits), slight follow of local player
    const tx = me.x * 0.25 - w / 2, ty = me.y * 0.25 - h / 2;
    this.camX = lerp(this.camX, tx, 1 - Math.exp(-5 * dt)) + this.effects.shakeX;
    this.camY = lerp(this.camY, ty, 1 - Math.exp(-5 * dt)) + this.effects.shakeY;

    // snapshot @30Hz (pvp is latency-sensitive)
    this.snapTimer -= dt;
    if (this.snapTimer <= 0) {
      this.snapTimer = 1 / 22;
      this.net.broadcast(this.snapshot());
    }
  }

  snapshot() {
    return {
      t: 's', mode: 'pvp',
      ph: this.phase, pt: +this.phaseT.toFixed(2), rd: this.round,
      sc: [this.duelists[0].score, this.duelists[1].score],
      pl: this.duelists.map((d) => [
        Math.round(d.x), Math.round(d.y), +d.aim.toFixed(2),
        +(d.hp / d.maxHp).toFixed(3), +(d.shield / d.maxShield).toFixed(3),
        d.dashing ? 1 : 0, +d.blockT.toFixed(2), d.alive ? 1 : 0,
        +d.cds.q.toFixed(1), +d.cds.w.toFixed(1), +d.cds.e.toFixed(1), +d.cds.r.toFixed(1),
        +d.dashCharges.toFixed(1),
      ]),
      pr: this.projectiles.map((p) => [Math.round(p.x), Math.round(p.y), p.kind === 'hook' ? 1 : p.kind === 'lance' ? 2 : 0, p.owner === this.duelists[0] ? 0 : 1]),
      bm: this.beams.filter((b) => !b.fired || b.flash > 0).map((b) => [Math.round(b.owner.x), Math.round(b.owner.y), +b.a.toFixed(2), b.fired ? 1 : 0]),
    };
  }

  // ---------- draw (host view; guest uses PvpView with the same helpers) ----------
  draw(ctx, w, h) {
    drawDuelScene(ctx, w, h, this.camX, this.camY, {
      arena: this.arena, time: this.time,
      duelists: this.duelists.map((d) => ({
        x: d.x, y: d.y, aim: d.aim, color: d.color, shape: d.shape, name: d.name,
        dashing: d.dashing, blockT: d.blockT, alive: d.alive, hitFlash: d.hitFlash,
      })),
      projectiles: this.projectiles.map((p) => ({ x: p.x, y: p.y, kind: p.kind, side: p.owner === this.duelists[0] ? 0 : 1 })),
      beams: this.beams.map((b) => ({ x: b.owner.x, y: b.owner.y, a: b.a, fired: b.fired })),
    });
    this.effects.draw(ctx, this.camX, this.camY);
    drawDuelHud(ctx, w, h, {
      me: this.duelists[0], foe: this.duelists[1],
      score: [this.duelists[0].score, this.duelists[1].score],
      phase: this.phase, phaseT: this.phaseT, round: this.round,
      loadout: this.duelists[0].loadout, cds: this.duelists[0].cds,
      dashCharges: this.duelists[0].dashCharges,
      hp01: this.duelists[0].hp / this.duelists[0].maxHp,
      sh01: this.duelists[0].shield / this.duelists[0].maxShield,
      foeHp01: this.duelists[1].hp / this.duelists[1].maxHp,
      time: this.time,
    });
  }
}

// ---------------------------------------------------------------- shared drawing
export function drawDuelScene(ctx, w, h, camX, camY, s) {
  // arena
  ctx.save();
  ctx.strokeStyle = PVP_PALETTE.wall;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = PVP_PALETTE.wall;
  ctx.shadowBlur = 18;
  ctx.strokeRect(s.arena.x - camX, s.arena.y - camY, s.arena.w, s.arena.h);
  ctx.shadowBlur = 0;
  // center line
  ctx.globalAlpha = 0.15;
  ctx.setLineDash([14, 12]);
  ctx.beginPath();
  ctx.moveTo(-camX, s.arena.y - camY);
  ctx.lineTo(-camX, s.arena.y + s.arena.h - camY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // beams
  for (const b of s.beams) {
    const x1 = b.x - camX, y1 = b.y - camY;
    const x2 = x1 + Math.cos(b.a) * 900, y2 = y1 + Math.sin(b.a) * 900;
    ctx.save();
    if (!b.fired) {
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#f87171';
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 2;
    } else {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 10;
      ctx.shadowColor = '#f87171';
      ctx.shadowBlur = 24;
    }
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }
  // projectiles
  const PK = ['#67e8f9', '#4aff8f']; // by side
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of s.projectiles) {
    const col = p.kind === 1 ? '#ffe94a' : p.kind === 2 ? '#f87171' : PK[p.side] || '#67e8f9';
    const spr = glowSprite(typeof p.kind === 'string'
      ? (p.kind === 'hook' ? '#ffe94a' : p.kind === 'lance' ? '#f87171' : PK[p.side])
      : col);
    const r = (p.kind === 2 || p.kind === 'lance') ? 10 : 6;
    ctx.drawImage(spr, p.x - camX - r * 2.4, p.y - camY - r * 2.4, r * 4.8, r * 4.8);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(p.x - camX, p.y - camY, r * 0.5, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // duelists
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '12px Consolas, monospace';
  for (const d of s.duelists) {
    if (!d.alive) continue;
    const col = resolveColor(d.color, s.time);
    const x = d.x - camX, y = d.y - camY;
    const spr = glowSprite(col);
    ctx.drawImage(spr, x - 30, y - 30, 60, 60);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(d.aim);
    ctx.beginPath();
    Player.tracePath(ctx, 17, d.shape);
    ctx.fillStyle = d.hitFlash > 0.4 ? '#fff' : '#0a1020';
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    if (d.dashing) { ctx.shadowColor = col; ctx.shadowBlur = 20; }
    ctx.stroke();
    ctx.restore();
    if (d.blockT > 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(s.time * 18);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = col;
    ctx.fillText(d.name, x, y - 32);
  }
  ctx.restore();
}

export function drawDuelHud(ctx, w, h, s) {
  ctx.save();
  // score
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px Consolas, monospace';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#c084fc';
  ctx.shadowBlur = 14;
  ctx.fillText(`${s.score[0]}  :  ${s.score[1]}`, w / 2, 46);
  ctx.shadowBlur = 0;
  ctx.font = '12px Consolas, monospace';
  ctx.fillStyle = '#8aa8c0';
  ctx.fillText(`ROUND ${s.round} — FIRST TO ${WIN_SCORE}`, w / 2, 66);
  // countdown / KO
  if (s.phase === 'count') {
    ctx.font = 'bold 64px Consolas, monospace';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 26;
    ctx.fillText(Math.ceil(s.phaseT), w / 2, h * 0.4);
    ctx.shadowBlur = 0;
  } else if (s.phase === 'pause') {
    ctx.font = 'bold 40px Consolas, monospace';
    ctx.fillStyle = '#ff3b5c';
    ctx.fillText('K.O.', w / 2, h * 0.4);
  }
  // own bars
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,168,255,0.25)'; ctx.fillRect(18, h - 96, 220, 9);
  ctx.fillStyle = '#00a8ff'; ctx.fillRect(18, h - 96, 220 * clamp(s.sh01, 0, 1), 9);
  ctx.fillStyle = 'rgba(255,59,92,0.25)'; ctx.fillRect(18, h - 82, 220, 9);
  ctx.fillStyle = '#ff3b5c'; ctx.fillRect(18, h - 82, 220 * clamp(s.hp01, 0, 1), 9);
  // foe bar top-right
  ctx.fillStyle = 'rgba(255,59,92,0.25)'; ctx.fillRect(w - 238, 30, 220, 9);
  ctx.fillStyle = '#ff3b5c'; ctx.fillRect(w - 238, 30, 220 * clamp(s.foeHp01, 0, 1), 9);
  // dash pips
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = s.dashCharges >= i + 1 ? '#00f0ff' : 'rgba(0,240,255,0.15)';
    ctx.fillRect(18 + i * 28, h - 66, 22, 6);
  }
  // skill bar
  const keys = ['q', 'w', 'e', 'r'];
  keys.forEach((k, i) => {
    const sk = SKILLS[s.loadout[k]];
    const x = w / 2 - 130 + i * 66, y = h - 84;
    const cd = s.cds[k];
    ctx.save();
    ctx.strokeStyle = cd > 0 ? 'rgba(255,255,255,0.25)' : '#c084fc';
    ctx.lineWidth = 2;
    if (cd <= 0) { ctx.shadowColor = '#c084fc'; ctx.shadowBlur = 10; }
    ctx.fillStyle = 'rgba(8,12,28,0.85)';
    ctx.fillRect(x, y, 54, 54);
    ctx.strokeRect(x, y, 54, 54);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.font = '24px Consolas, monospace';
    ctx.globalAlpha = cd > 0 ? 0.35 : 1;
    ctx.fillStyle = '#fff';
    ctx.fillText(sk.icon, x + 27, y + 34);
    ctx.globalAlpha = 1;
    if (cd > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, y, 54, 54 * clamp(cd / sk.cd, 0, 1));
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px Consolas, monospace';
      ctx.fillText(cd.toFixed(cd < 3 ? 1 : 0), x + 27, y + 34);
    }
    ctx.font = 'bold 11px Consolas, monospace';
    ctx.fillStyle = '#c084fc';
    ctx.fillText(k.toUpperCase(), x + 27, y + 66);
    ctx.restore();
  });
  ctx.restore();
}

// ---------------------------------------------------------------- guest view
export class PvpGuestView {
  constructor(game, net, roster, loadouts) {
    this.game = game;
    this.net = net;
    this.roster = roster; // [{name,color,shape}] index 0 = host, 1 = me
    this.loadout = Object.assign({}, DEFAULT_LOADOUT, loadouts[1] || {});
    this.snap = null;
    this.effects = new Effects();
    this.background = new Background();
    this.camX = 0; this.camY = 0;
    this.sendTimer = 0;
    this.pend = { d: false, q: false, w: false, e: false, r: false };
    this.prevSelf = null;
    this.time = 0;
    this.arena = ARENA;
    this.plView = []; // interpolated duelist positions
  }

  _interpolate(dt) {
    const s = this.snap; if (!s) return;
    const f = 1 - Math.exp(-18 * dt);
    s.pl.forEach((pd, i) => {
      let v = this.plView[i];
      if (!v) { v = { x: pd[0], y: pd[1], aim: pd[2] }; this.plView[i] = v; }
      v.x = lerp(v.x, pd[0], f); v.y = lerp(v.y, pd[1], f);
      let da = ((pd[2] - v.aim + Math.PI * 3) % TAU) - Math.PI;
      v.aim += da * f;
    });
  }

  onSnapshot(s) {
    this.snap = s;
    const me = s.pl[1];
    if (me && this.prevSelf) {
      const hpNow = me[3] + me[4], prev = this.prevSelf[3] + this.prevSelf[4];
      if (hpNow < prev - 0.001) { this.game.flashDamage(); this.game.audio.sfx('playerHit'); this.effects.shake(6); }
    }
    this.prevSelf = me ? me.slice() : null;
  }

  update(dt, input, w, h) {
    this.time += dt;
    this.background.update(dt);
    this.effects.update(dt);
    if (input.consumeDash()) this.pend.d = true;
    for (const k of ['q', 'w', 'e', 'r']) {
      if (input.wasPressed('Key' + k.toUpperCase())) this.pend[k] = true;
    }
    if (input.wasPressed('Escape')) { this.game.leaveCoop(t('coop.disconnected')); return; }
    this._interpolate(dt);
    const mv0 = this.plView[1];
    if (mv0) {
      const tx = mv0.x * 0.25 - w / 2, ty = mv0.y * 0.25 - h / 2;
      this.camX = lerp(this.camX, tx, 1 - Math.exp(-6 * dt)) + this.effects.shakeX;
      this.camY = lerp(this.camY, ty, 1 - Math.exp(-6 * dt)) + this.effects.shakeY;
    }
    const me = this.snap && this.snap.pl[1];
    this.sendTimer -= dt;
    if (this.sendTimer <= 0) {
      this.sendTimer = 1 / 22;
      // movement: RMB glide or keys (W excluded — it's a skill)
      let mvx = 0, mvy = 0;
      if (input.rightDown && me) {
        const dx = input.mouseX + this.camX - me[0], dy = input.mouseY + this.camY - me[1];
        const m = Math.hypot(dx, dy);
        if (m > 24) { mvx = dx / m; mvy = dy / m; }
      } else {
        mvx = (input.keys.has('ArrowLeft') || input.keys.has('KeyA') ? -1 : 0) + (input.keys.has('ArrowRight') || input.keys.has('KeyD') ? 1 : 0);
        mvy = (input.keys.has('ArrowUp') ? -1 : 0) + (input.keys.has('ArrowDown') || input.keys.has('KeyS') ? 1 : 0);
        const m = Math.hypot(mvx, mvy);
        if (m > 1) { mvx /= m; mvy /= m; }
      }
      this.net.send({
        t: 'i', vx: mvx, vy: mvy,
        ax: input.mouseX + this.camX, ay: input.mouseY + this.camY,
        d: this.pend.d, q: this.pend.q, w: this.pend.w, e: this.pend.e, r: this.pend.r,
      });
      this.pend = { d: false, q: false, w: false, e: false, r: false };
    }
  }

  draw(ctx, w, h) {
    this.background.draw(ctx, w, h, this.camX, this.camY, PVP_PALETTE);
    const s = this.snap;
    if (!s) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '16px Consolas, monospace';
      ctx.fillStyle = '#8aa8c0';
      ctx.fillText(t('coop.connecting'), w / 2, h / 2);
      ctx.restore();
      return;
    }
    drawDuelScene(ctx, w, h, this.camX, this.camY, {
      arena: this.arena, time: this.time,
      duelists: s.pl.map((pd, i) => {
        const v = this.plView[i] || { x: pd[0], y: pd[1], aim: pd[2] };
        return { x: v.x, y: v.y, aim: v.aim, color: (this.roster[i] || {}).color || '#00f0ff',
          shape: (this.roster[i] || {}).shape || 'vector', name: (this.roster[i] || {}).name || 'P' + (i + 1),
          dashing: pd[5] === 1, blockT: pd[6], alive: pd[7] === 1, hitFlash: 0 };
      }),
      projectiles: s.pr.map(([x, y, kind, side]) => ({ x, y, kind, side })),
      beams: s.bm.map(([x, y, a, fired]) => ({ x, y, a, fired: fired === 1 })),
    });
    this.effects.draw(ctx, this.camX, this.camY);
    const me = s.pl[1];
    drawDuelHud(ctx, w, h, {
      score: [s.sc[0], s.sc[1]],
      phase: s.ph, phaseT: s.pt, round: s.rd,
      loadout: this.loadout,
      cds: { q: me[8], w: me[9], e: me[10], r: me[11] },
      dashCharges: me[12],
      hp01: me[3], sh01: me[4], foeHp01: s.pl[0][3],
      time: this.time,
    });
  }
}
