// player.js — the player process: movement, dash combat, shields, XP, sub-weapons
import { TAU, clamp, lerp, rand, angleTo, dist, dist2, choice } from './utils.js';
import { glowSprite, resolveColor, nebulaColor } from './effects.js';

export const CORE_PARAMS = {
  standard: { charges: 3, dashLen: 235, dashTime: 0.16, width: 26, dmg: 32, cd: 1.55, refund: 0.40, blast: 0, teleport: false, builtInTrail: 0 },
  blink:    { charges: 2, dashLen: 270, dashTime: 0.05, width: 20, dmg: 26, cd: 1.15, refund: 0.35, blast: 1, teleport: true,  builtInTrail: 0 },
  phantom:  { charges: 3, dashLen: 330, dashTime: 0.26, width: 36, dmg: 25, cd: 2.0,  refund: 0.40, blast: 0, teleport: false, builtInTrail: 1 },
  surge:    { charges: 4, dashLen: 150, dashTime: 0.11, width: 24, dmg: 22, cd: 1.30, refund: 0.45, blast: 1, teleport: false, builtInTrail: 0 },
  ricochet: { charges: 3, dashLen: 260, dashTime: 0.17, width: 24, dmg: 27, cd: 1.65, refund: 0.40, blast: 0, teleport: false, builtInTrail: 0, bounces: 2 },
  gemini:   { charges: 3, dashLen: 215, dashTime: 0.15, width: 22, dmg: 22, cd: 1.70, refund: 0.35, blast: 0, teleport: false, builtInTrail: 0, mirror: true },
  vortex:   { charges: 2, dashLen: 245, dashTime: 0.16, width: 26, dmg: 25, cd: 1.95, refund: 0.42, blast: 0, teleport: false, builtInTrail: 0, vortex: true },
};

export class Player {
  // chassis outlines (shared by the ship, afterimages, lobby previews, co-op avatars)
  static tracePath(ctx, r, shape) {
    if (shape === 'arrow') {
      ctx.moveTo(r * 1.2, 0);
      ctx.lineTo(-r * 0.8, r * 0.45);
      ctx.lineTo(-r * 0.5, 0);
      ctx.lineTo(-r * 0.8, -r * 0.45);
    } else if (shape === 'delta') {
      ctx.moveTo(r * 0.9, 0);
      ctx.lineTo(-r * 0.7, r * 0.85);
      ctx.lineTo(-r * 0.35, 0);
      ctx.lineTo(-r * 0.7, -r * 0.85);
    } else { // vector
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.7, r * 0.62);
      ctx.lineTo(-r * 0.3, 0);
      ctx.lineTo(-r * 0.7, -r * 0.62);
    }
    ctx.closePath();
  }

  constructor(coreId, metaBonus) {
    const cp = CORE_PARAMS[coreId] || CORE_PARAMS.standard;
    this.coreId = coreId;
    this.cp = cp;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.radius = 10;
    this.aim = 0;

    this.maxHp = 100 + metaBonus.hp;
    this.hp = this.maxHp;
    this.maxShield = 50 + metaBonus.shield;
    this.shield = this.maxShield;
    this.shieldTimer = 0; // time since last hit
    this.baseShieldDelay = Math.max(1.2, 3.2 - metaBonus.shieldRegenDelay);
    this.baseShieldRate = 4.7 * (metaBonus.shieldRegenMul || 1); // per second (was 14 — tuned down 3x)

    this.maxDashCharges = cp.charges + metaBonus.dashCharges;
    this.dashCharges = this.maxDashCharges;
    this.baseDashCd = cp.cd * metaBonus.dashCd;

    this.baseSpeed = 265 * metaBonus.speed;
    this.basePickup = 70 * metaBonus.magnet;

    this.metaBonus = metaBonus;
    this.revivesLeft = metaBonus.revives || 0;

    // in-run modifiers (upgrades mutate these)
    this.mods = {
      dashDmg: metaBonus.dashDmg, dashWidth: 1, dashLen: 1, dashCd: 1,
      killRefund: 0, endBlast: cp.blast, arcs: 0, trailBurn: cp.builtInTrail,
      critChance: metaBonus.crit0 || 0, execute: 0, firstStrike: 0,
      shieldDelay: 1, shieldRate: 0, killShield: 0, lifesteal: 0,
      iframes: 0, thorns: metaBonus.thorns0 || 0, shieldBlast: 0,
      speed: 1, magnet: 1, xpGain: metaBonus.xp, creditGain: metaBonus.credits,
      slowAura: 0, drones: 0, orbitals: 0, seekers: 0, pulse: 0,
      shardBomb: 0, adrenaline: 0, bossDmg: metaBonus.bossDmg0 || 0,
      momentum: 0, critMult: 3, secondWind: 0, shardCredit: 0, bulletEater: 0,
      comboTime: 0, comboXp: 0.02, hazardResist: 0, deflector: 0,
      levelNova: 0, blastRadius: 0, droneRate: 0, orbitSpeed: 0,
    };
    this.momentumStacks = 0;
    this.momentumT = 0;
    this.deflectorT = 0;
    this.charging = false;
    this.chargeT = 0;
    this.dashCharge = 0;
    this.upgradeCounts = {};

    // dash state
    this.dashing = false;
    this.dashT = 0;
    this.dashDir = 0;
    this.dashPrevX = 0; this.dashPrevY = 0;
    this.dashHitSet = new Set();
    this.dashFirstHit = false;
    this.afterimages = [];

    // xp / level
    this.level = 1;
    this.xp = 0;
    this.xpNeed = 6;

    // timers
    this.hitInvuln = 0;
    this.pulseTimer = 0;
    this.orbitalAngle = 0;
    this.droneAngle = 0;
    this.trailSegments = []; // {x1,y1,x2,y2,life}
    this.dead = false;

    // run stats
    this.stats = { kills: 0, dashes: 0, dmgDealt: 0, dmgTaken: 0 };
    this.combo = 0;
    this.comboTimer = 0;
  }

  speedMul() {
    let m = this.mods.speed;
    if (this.mods.adrenaline > 0 && this.hp / this.maxHp < 0.3) m += this.mods.adrenaline;
    if (this.momentumStacks > 0) m += this.momentumStacks * this.mods.momentum;
    return m;
  }

  dashCdMul() {
    let m = this.mods.dashCd;
    if (this.mods.adrenaline > 0 && this.hp / this.maxHp < 0.3) m /= (1 + this.mods.adrenaline);
    return m;
  }

  pickupRadius() { return this.basePickup * this.mods.magnet; }

  update(dt, input, world) {
    const audio = world.audio;
    // regen shield
    this.shieldTimer += dt;
    const delay = this.baseShieldDelay * this.mods.shieldDelay;
    if (this.shieldTimer >= delay && this.shield < this.maxShield) {
      const wasZero = this.shield <= 0;
      this.shield = Math.min(this.maxShield, this.shield + this.baseShieldRate * (1 + this.mods.shieldRate) * dt);
      if (wasZero && this.shield > 0) audio.sfx('shieldUp');
    }
    this.hitInvuln = Math.max(0, this.hitInvuln - dt);
    this.deflectorT = Math.max(0, this.deflectorT - dt);
    if (this.momentumT > 0) {
      this.momentumT -= dt;
      if (this.momentumT <= 0) this.momentumStacks = 0;
    }

    // combo decay
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // dash recharge
    if (this.dashCharges < this.maxDashCharges) {
      const before = Math.floor(this.dashCharges);
      this.dashCharges = Math.min(this.maxDashCharges, this.dashCharges + dt / (this.baseDashCd * this.dashCdMul()));
      if (Math.floor(this.dashCharges) > before && this.dashCharges >= 1) audio.sfx('dashReady');
    }

    // aim at mouse (world coords); co-op worlds resolve aim per player
    const aimAt = world.aimFor(this);
    this.aim = angleTo(this.x, this.y, aimAt.x, aimAt.y);

    if (this.dashing) {
      this.updateDash(dt, world);
    } else {
      // normal movement
      const mv = input.moveVector();
      const sp = this.baseSpeed * this.speedMul();
      this.vx = lerp(this.vx, mv.x * sp, 1 - Math.exp(-14 * dt));
      this.vy = lerp(this.vy, mv.y * sp, 1 - Math.exp(-14 * dt));
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // charging dash: hold right mouse to build up (up to 2s) → longer, stronger dash
      if (input.rightDown && this.dashCharges >= 1) {
        this.chargeT = Math.min(2.0, (this.chargeT || 0) + dt);
        this.charging = true;
        // slow to a crawl while winding up
        this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt);
        if (Math.random() < 0.4) {
          const a = rand(TAU);
          world.effects.spawnParticle(this.x + Math.cos(a) * 30, this.y + Math.sin(a) * 30, { vx: -Math.cos(a) * 120, vy: -Math.sin(a) * 120, color: resolveColor(this.color || world.palette.player, world.time), life: 0.3, size: 3 });
        }
      } else if (this.charging) {
        this.charging = false;
        const ratio = Math.min(1, (this.chargeT || 0) / 2.0);
        this.chargeT = 0;
        if (ratio > 0.08 && this.dashCharges >= 1) this.startDash(world, ratio);
      }

      // normal instant dash (Space / left click / Shift)
      if (input.consumeDash() && this.dashCharges >= 1) {
        this.charging = false; this.chargeT = 0;
        this.startDash(world, 0);
      }
    }

    // clamp to arena
    const a = world.arena;
    this.x = clamp(this.x, a.x + this.radius, a.x + a.w - this.radius);
    this.y = clamp(this.y, a.y + this.radius, a.y + a.h - this.radius);

    // trail segments decay
    for (let i = this.trailSegments.length - 1; i >= 0; i--) {
      this.trailSegments[i].life -= dt;
      if (this.trailSegments[i].life <= 0) this.trailSegments.splice(i, 1);
    }
    // afterimages decay
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      this.afterimages[i].life -= dt * (this.afterimages[i].slow ? 1.6 : 4);
      if (this.afterimages[i].life <= 0) this.afterimages.splice(i, 1);
    }

    // premium (admin) cosmetic aura — a flowing colored nebula that follows you as you move
    if ((this.dashFxStyle === 'galaxy') && !this.dashing) this.emitPremiumAura(dt, world);

    this.updateWeapons(dt, world);
  }

  // GALAXY skin: a restrained, classy nebula wake — faint colored haze, a few soft stars,
  // and delicate color-shifted ghost afterimages. Only really appears while moving.
  emitPremiumAura(dt, world) {
    const e = world.effects;
    const speed = Math.hypot(this.vx, this.vy);
    const t = world.time;
    // barely there when idle; a gentle wisp as you move
    const rate = 2 + speed * 0.03;
    this._auraAcc = (this._auraAcc || 0) + rate * dt;
    while (this._auraAcc >= 1) {
      this._auraAcc -= 1;
      const off = rand(TAU);
      const r = rand(0, this.radius + 4);
      const px = this.x + Math.cos(off) * r, py = this.y + Math.sin(off) * r;
      // trail the haze behind movement so it reads as a soft wake
      const bvx = -this.vx * 0.3 + rand(-10, 10);
      const bvy = -this.vy * 0.3 + rand(-10, 10);
      e.mist(px, py, nebulaColor(t, off), { vx: bvx, vy: bvy, life: rand(0.8, 1.4), size: rand(7, 12), alphaMul: 0.09 });
    }
    // rare, faint star twinkle (only when actually moving)
    if (speed > 60 && Math.random() < 0.18) {
      e.spawnParticle(this.x + rand(-8, 8), this.y + rand(-8, 8), {
        vx: -this.vx * 0.2 + rand(-20, 20), vy: -this.vy * 0.2 + rand(-20, 20),
        color: choice(['#dfeaff', '#e8f4ff', '#f0e8ff']), life: rand(0.5, 1.0), size: rand(1.2, 2.2), drag: 0.9,
      });
    }
    // delicate ghost afterimages, spaced out so they read as elegant, not busy
    this._ghostAcc = (this._ghostAcc || 0) + speed * dt;
    if (this._ghostAcc > 42) {
      this._ghostAcc = 0;
      this.afterimages.push({ x: this.x, y: this.y, a: this.aim, life: 1, slow: true, hue: nebulaColor(t, 1.6) });
    }
  }

  startDash(world, charge = 0) {
    this.dashCharge = charge; // 0..1 — set by the charged (right-click) dash
    this.dashCharges -= 1;
    this.stats.dashes += 1;
    this.dashDir = this.aim;
    this.dashT = 0;
    this.dashHitSet.clear();
    this.dashFirstHit = false;
    world.audio.sfx('dash');
    world.effects.shake(3 + charge * 6);
    if (charge > 0.5) { world.effects.shockwave(this.x, this.y, resolveColor(this.color || world.palette.player, world.time), 40 + charge * 60, 4); world.audio.sfx('bossPhase'); }

    const cp = this.cp;
    const len = cp.dashLen * this.mods.dashLen * (1 + charge * 1.4); // up to ~2.4x range
    if (cp.teleport) {
      // blink: instantaneous with arrival blast; sweep line for damage
      this.dashPrevX = this.x; this.dashPrevY = this.y;
      const tx = this.x + Math.cos(this.dashDir) * len;
      const ty = this.y + Math.sin(this.dashDir) * len;
      world.effects.burst(this.x, this.y, resolveColor(this.color || world.palette.player, world.time), 10, 200);
      world.dashSweep(this, this.x, this.y, tx, ty);
      this.x = tx; this.y = ty;
      const a = world.arena;
      this.x = clamp(this.x, a.x + this.radius, a.x + a.w - this.radius);
      this.y = clamp(this.y, a.y + this.radius, a.y + a.h - this.radius);
      world.effects.burst(this.x, this.y, resolveColor(this.color || world.palette.player, world.time), 14, 260);
      world.audio.sfx('teleport');
      this.endDashBlast(world);
      this.hitInvuln = Math.max(this.hitInvuln, 0.25 * (1 + this.mods.iframes));
      if (this.mods.trailBurn > 0) {
        this.trailSegments.push({ x1: this.dashPrevX, y1: this.dashPrevY, x2: this.x, y2: this.y, life: 1.2 });
      }
      return;
    }
    this.dashing = true;
    this.dashSpeed = len / cp.dashTime;
    this.dashDuration = cp.dashTime;
    this.bouncesLeft = cp.bounces || 0;
    // gemini: a phantom twin sweeps the opposite direction instantly
    if (cp.mirror) {
      const bx = this.x - Math.cos(this.dashDir) * len;
      const by = this.y - Math.sin(this.dashDir) * len;
      world.dashSweep(this, this.x, this.y, bx, by);
      const steps = 7;
      for (let i = 0; i <= steps; i++) {
        const t2 = i / steps;
        world.effects.spawnParticle(lerp(this.x, bx, t2), lerp(this.y, by, t2), {
          vx: rand(-30, 30), vy: rand(-30, 30), color: resolveColor(this.color || '#00f0ff', world.time), life: 0.35, size: 4,
        });
      }
    }
  }

  updateDash(dt, world) {
    this.dashPrevX = this.x; this.dashPrevY = this.y;
    const step = Math.min(dt, this.dashDuration - this.dashT);
    this.x += Math.cos(this.dashDir) * this.dashSpeed * step;
    this.y += Math.sin(this.dashDir) * this.dashSpeed * step;
    this.dashT += dt;

    // ricochet core: bounce off the arena walls and keep going
    if (this.bouncesLeft > 0) {
      const a = world.arena;
      let bounced = false;
      if (this.x <= a.x + this.radius || this.x >= a.x + a.w - this.radius) {
        this.dashDir = Math.PI - this.dashDir; bounced = true;
      }
      if (this.y <= a.y + this.radius || this.y >= a.y + a.h - this.radius) {
        this.dashDir = -this.dashDir; bounced = true;
      }
      if (bounced) {
        this.bouncesLeft -= 1;
        this.dashT = Math.min(this.dashT, this.dashDuration * 0.35); // extend the ride
        this.dashHitSet.clear(); // fresh hits after each bounce
        world.audio.sfx('chain');
        world.effects.shockwave(this.x, this.y, resolveColor(this.color || '#00f0ff', world.time), 40, 3);
      }
    }

    // afterimage
    this.afterimages.push({ x: this.x, y: this.y, a: this.dashDir, life: 1 });
    // sweep damage along movement
    world.dashSweep(this, this.dashPrevX, this.dashPrevY, this.x, this.y);
    // burn trail
    if (this.mods.trailBurn > 0) {
      this.trailSegments.push({ x1: this.dashPrevX, y1: this.dashPrevY, x2: this.x, y2: this.y, life: 1.2 });
    }
    this.emitDashTrail(world);

    if (this.dashT >= this.dashDuration) {
      this.dashing = false;
      this.vx = Math.cos(this.dashDir) * this.baseSpeed * 0.6;
      this.vy = Math.sin(this.dashDir) * this.baseSpeed * 0.6;
      this.endDashBlast(world);
      // vortex core: drag everything nearby toward the exit point
      if (this.cp.vortex) {
        const r = 200 * (1 + this.mods.blastRadius);
        for (const e of world.enemies) {
          if (e.spawnT > 0 || e.isBoss) continue;
          const d2 = (e.x - this.x) ** 2 + (e.y - this.y) ** 2;
          if (d2 < r * r) {
            const a = Math.atan2(this.y - e.y, this.x - e.x);
            const pull = 460 * (1 - Math.sqrt(d2) / r);
            e.vx += Math.cos(a) * pull;
            e.vy += Math.sin(a) * pull;
          }
        }
        world.areaDamage(this.x, this.y, r * 0.6, 10 * this.mods.dashDmg, { pl: this });
        world.effects.shockwave(this.x, this.y, '#c084fc', r, 5);
        world.audio.sfx('teleport');
      }
      this.hitInvuln = Math.max(this.hitInvuln, 0.12 * (1 + this.mods.iframes));
    }
  }

  // dash trail visual, driven by the selected dash-FX skin
  emitDashTrail(world) {
    const e = world.effects;
    const base = resolveColor(this.color || world.palette.player, world.time);
    const style = this.dashFxStyle || 'streak';
    const bx = -Math.cos(this.dashDir), by = -Math.sin(this.dashDir);
    switch (style) {
      case 'flame':
        for (let i = 0; i < 2; i++) e.spawnParticle(this.x, this.y, { vx: bx * rand(40, 120) + rand(-30, 30), vy: by * rand(40, 120) + rand(-30, 30), color: choice(['#ff7b00', '#ffd24a', '#ff3b00']), life: rand(0.25, 0.5), size: rand(3, 6), drag: 0.85 });
        break;
      case 'rainbow':
        e.trail(this.x, this.y, `hsl(${Math.floor((world.time * 200) % 360)},100%,62%)`, bx * 60, by * 60);
        break;
      case 'shadow':
        e.spawnParticle(this.x, this.y, { vx: bx * 30, vy: by * 30, color: '#9b5cff', life: 0.5, size: 6, drag: 0.9 });
        e.spawnParticle(this.x, this.y, { vx: 0, vy: 0, color: '#1a0a30', life: 0.4, size: 8, drag: 0.9 });
        break;
      case 'star':
        if (Math.random() < 0.7) e.spawnParticle(this.x + rand(-8, 8), this.y + rand(-8, 8), { vx: rand(-40, 40), vy: rand(-40, 40), color: choice(['#ffe94a', '#ffffff', '#fff2a8']), life: rand(0.3, 0.7), size: rand(2, 4), drag: 0.92 });
        break;
      case 'ice':
        e.trail(this.x, this.y, '#7dd8ff', bx * 50, by * 50);
        if (Math.random() < 0.5) e.spawnParticle(this.x, this.y, { vx: rand(-30, 30), vy: rand(-30, 30), color: '#e0f7ff', life: 0.5, size: 3, drag: 0.9 });
        break;
      case 'pulse':
        if (!this._pulseT || world.time > this._pulseT) { this._pulseT = world.time + 0.06; e.shockwave(this.x, this.y, base, 26, 2); }
        break;
      case 'bolt':
        for (let i = 0; i < 4; i++) e.spawnParticle(this.x + rand(-10, 10), this.y + rand(-10, 10), { vx: rand(-50, 50), vy: rand(-50, 50), color: choice(['#a5b4fc', '#ffffff', '#c4b5fd']), life: 0.18, size: 3 });
        break;
      case 'petal':
        e.spawnParticle(this.x, this.y, { vx: bx * 40 + rand(-40, 40), vy: by * 40 + rand(-40, 40), color: choice(['#4aff8f', '#a8ffcf', '#2fd67a']), life: rand(0.4, 0.8), size: rand(3, 5), drag: 0.88 });
        break;
      case 'galaxy': { // admin ultra — dense flowing nebula wake with a bright core and stars
        const t = world.time;
        // layered soft nebula clouds billowing outward from the dash line
        for (let i = 0; i < 3; i++) {
          const off = rand(TAU);
          e.mist(this.x + Math.cos(off) * rand(0, 12), this.y + Math.sin(off) * rand(0, 12), nebulaColor(t, off), {
            vx: bx * rand(60, 140) + Math.cos(off) * 40, vy: by * rand(60, 140) + Math.sin(off) * 40,
            life: rand(0.6, 1.1), size: rand(10, 18), alphaMul: 0.3, grow: rand(20, 44),
          });
        }
        // bright hot core streak
        e.spawnParticle(this.x, this.y, { vx: bx * 60, vy: by * 60, color: '#ffffff', life: 0.3, size: rand(4, 7), drag: 0.82 });
        e.spawnParticle(this.x, this.y, { vx: bx * 40 + rand(-30, 30), vy: by * 40 + rand(-30, 30), color: nebulaColor(t, 3), life: 0.5, size: rand(4, 8), drag: 0.85 });
        // sparkle stars flung off
        if (Math.random() < 0.8) e.spawnParticle(this.x + rand(-8, 8), this.y + rand(-8, 8), { vx: rand(-90, 90), vy: rand(-90, 90), color: choice(['#ffffff', '#e8f4ff', '#fff0ff', '#d8fff0']), life: rand(0.4, 0.9), size: rand(1.5, 3.5), drag: 0.9 });
        // rhythmic prismatic rings
        if (!this._pulseT || t > this._pulseT) { this._pulseT = t + 0.07; e.shockwave(this.x, this.y, nebulaColor(t, 0), 34, 2.5); }
        break;
      }
      default:
        e.trail(this.x, this.y, base, bx * 60, by * 60);
    }
  }

  endDashBlast(world) {
    if (this.mods.endBlast <= 0) return;
    const r = (70 + this.mods.endBlast * 25) * (1 + this.mods.blastRadius);
    const dmg = (18 + this.mods.endBlast * 14) * this.mods.dashDmg;
    world.areaDamage(this.x, this.y, r, dmg, { source: 'blast' });
    world.effects.shockwave(this.x, this.y, resolveColor(this.color || world.palette.player, world.time), r, 4);
    world.audio.sfx('explode');
    world.effects.shake(4);
  }

  dashWidth() { return this.cp.width * this.mods.dashWidth; }

  dashDamage() {
    let d = this.cp.dmg * this.mods.dashDmg * (1 + (this.dashCharge || 0) * 1.6); // charged dash hits far harder
    if (!this.dashFirstHit && this.mods.firstStrike > 0) d *= 1 + this.mods.firstStrike;
    return d;
  }

  // called by world when a dash hit kills an enemy
  onKill(world, enemy) {
    this.stats.kills += 1;
    this.combo += 1;
    this.comboTimer = 2.4 + this.mods.comboTime;
    if (this.mods.momentum > 0) {
      this.momentumStacks = Math.min(5, this.momentumStacks + 1);
      this.momentumT = 5;
    }
    // dash refund
    const refund = this.cp.refund * (1 + this.mods.killRefund);
    this.dashCharges = Math.min(this.maxDashCharges, this.dashCharges + refund);
    if (this.mods.killShield > 0) this.shield = Math.min(this.maxShield, this.shield + this.mods.killShield);
    if (this.mods.lifesteal > 0 && Math.random() < this.mods.lifesteal) {
      this.hp = Math.min(this.maxHp, this.hp + 3);
    }
    if (this.combo > 2) world.audio.sfx('chain');
  }

  gainXp(v, world) {
    this.xp += v * this.mods.xpGain * (1 + Math.min(this.combo, 20) * this.mods.comboXp);
    if (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level += 1;
      this.xpNeed = Math.round(6 + this.level * 3.2 + Math.pow(this.level, 1.45));
      if (this.mods.levelNova > 0) {
        const r = 200 * (1 + this.mods.blastRadius);
        world.areaDamage(this.x, this.y, r, 60 * this.mods.levelNova, { source: 'nova' });
        world.effects.shockwave(this.x, this.y, '#ff2fd6', r, 6);
        world.audio.sfx('bigExplode');
      }
      world.onLevelUp();
    }
  }

  takeDamage(dmg, world, kind = 'contact') {
    if (this.hitInvuln > 0 || this.dashing || this.dead) return false;
    if (kind === 'hazard' && this.mods.hazardResist > 0) {
      dmg = Math.max(1, Math.round(dmg * Math.max(0.1, 1 - this.mods.hazardResist)));
    }
    // deflector: negate one hit entirely, then recharge
    if (this.mods.deflector > 0 && this.deflectorT <= 0) {
      this.deflectorT = this.mods.deflector;
      this.hitInvuln = Math.max(this.hitInvuln, 0.4);
      world.effects.shockwave(this.x, this.y, '#ffffff', 60, 4);
      world.audio.sfx('shieldUp');
      world.effects.text(this.x, this.y - 26, 'DEFLECT', '#ffffff', 12);
      return false;
    }
    this.shieldTimer = 0;
    this.stats.dmgTaken += dmg;
    world.effects.shake(7);
    world.flashDamage();

    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
      if (this.shield <= 0) {
        world.audio.sfx('shieldBreak');
        world.effects.shockwave(this.x, this.y, '#00a8ff', 60, 3);
        if (this.mods.shieldBlast > 0) {
          const r = 170 * (1 + this.mods.blastRadius);
          world.areaDamage(this.x, this.y, r, 60, { source: 'nova' });
          world.effects.shockwave(this.x, this.y, '#00f0ff', r, 6);
          world.audio.sfx('bigExplode');
        }
        if (this.mods.secondWind > 0) {
          this.dashCharges = this.maxDashCharges;
          world.effects.text(this.x, this.y - 40, '⟲', '#00f0ff', 18);
        }
      } else {
        world.audio.sfx('playerHit');
      }
    }
    if (dmg > 0) {
      this.hp -= dmg;
      world.audio.sfx('playerHit');
      world.effects.burst(this.x, this.y, '#ff3b5c', 14, 240);
      if (this.hp <= 0) {
        if (this.revivesLeft > 0) {
          this.revivesLeft -= 1;
          this.hp = Math.round(this.maxHp * 0.3);
          this.shield = this.maxShield;
          this.hitInvuln = this.metaBonus.reviveInvuln || 2;
          world.areaDamage(this.x, this.y, 220, 120, { source: 'nova' });
          world.effects.shockwave(this.x, this.y, '#4aff8f', 220, 8);
          world.audio.sfx('bigExplode');
          return true;
        }
        this.hp = 0;
        this.dead = true;
        world.onPlayerDeath();
      }
    }
    this.hitInvuln = Math.max(this.hitInvuln, 0.7 * (1 + this.mods.iframes));
    if (this.mods.thorns > 0) {
      const r = (100 + this.mods.thorns * 20) * (1 + this.mods.blastRadius);
      world.areaDamage(this.x, this.y, r, 20 * this.mods.thorns, { source: 'nova' });
      world.effects.shockwave(this.x, this.y, '#ffe94a', r, 3);
    }
    return true;
  }

  // drones / orbitals / pulse
  updateWeapons(dt, world) {
    // orbitals
    if (this.mods.orbitals > 0) {
      this.orbitalAngle += dt * 3.2 * (1 + this.mods.orbitSpeed);
      const count = this.mods.orbitals;
      const orbR = 52;
      for (let i = 0; i < count; i++) {
        const a = this.orbitalAngle + (TAU * i) / count;
        const ox = this.x + Math.cos(a) * orbR;
        const oy = this.y + Math.sin(a) * orbR;
        world.orbitalDamage(ox, oy, 12 + this.mods.orbitSpeed * 8, 8 * this.mods.dashDmg);
      }
    }
    // drones
    if (this.mods.drones > 0) {
      this.droneAngle += dt * 1.6;
      this.pulseTimerDrone = (this.pulseTimerDrone || 0) - dt;
      if (this.pulseTimerDrone <= 0) {
        this.pulseTimerDrone = Math.max(0.25, (0.8 - this.mods.drones * 0.12) / (1 + this.mods.droneRate));
        for (let i = 0; i < this.mods.drones; i++) {
          const a = this.droneAngle + (TAU * i) / this.mods.drones;
          const dx = this.x + Math.cos(a) * 38;
          const dy = this.y + Math.sin(a) * 38;
          world.droneFire(dx, dy, 12 * this.mods.dashDmg);
        }
      }
    }
    // pulse
    if (this.mods.pulse > 0) {
      this.pulseTimer -= dt;
      if (this.pulseTimer <= 0) {
        this.pulseTimer = 4.0;
        const r = (120 + this.mods.pulse * 30) * (1 + this.mods.blastRadius);
        world.areaDamage(this.x, this.y, r, (16 + 10 * this.mods.pulse) * this.mods.dashDmg, { source: 'pulse' });
        world.effects.shockwave(this.x, this.y, resolveColor(this.color || world.palette.player, world.time), r, 3);
        world.audio.sfx('laser');
      }
    }
  }

  draw(ctx, camX, camY, world) {
    const px = this.x - camX, py = this.y - camY;
    const color = resolveColor(this.color || world.palette.player, world.time);

    ctx.save();
    // burn trail
    if (this.trailSegments.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const s of this.trailSegments) {
        ctx.globalAlpha = s.life / 1.2 * 0.5;
        ctx.strokeStyle = '#ff7b00';
        ctx.lineWidth = 10 * (s.life / 1.2);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.x1 - camX, s.y1 - camY);
        ctx.lineTo(s.x2 - camX, s.y2 - camY);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // afterimages
    ctx.globalCompositeOperation = 'lighter';
    for (const im of this.afterimages) {
      const gx = im.x - camX, gy = im.y - camY;
      if (im.hue) {
        // premium: faint nebula halo behind a subtle color-shifted ghost ship
        const spr = glowSprite(im.hue);
        const gs = 34 * im.life;
        ctx.globalAlpha = im.life * 0.18;
        ctx.drawImage(spr, gx - gs / 2, gy - gs / 2, gs, gs);
        ctx.globalAlpha = im.life * 0.3;
        this.drawShip(ctx, gx, gy, im.a, im.hue, 1.0 + (1 - im.life) * 0.3);
      } else {
        ctx.globalAlpha = im.life * 0.35;
        this.drawShip(ctx, gx, gy, im.a, color, 0.9);
      }
    }
    ctx.globalAlpha = 1;

    // orbitals
    if (this.mods.orbitals > 0) {
      const count = this.mods.orbitals;
      for (let i = 0; i < count; i++) {
        const a = this.orbitalAngle + (TAU * i) / count;
        const ox = px + Math.cos(a) * 52;
        const oy = py + Math.sin(a) * 52;
        const spr = glowSprite('#ffe94a');
        ctx.drawImage(spr, ox - 12, oy - 12, 24, 24);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ox, oy, 3.5, 0, TAU); ctx.fill();
      }
    }
    // drones
    if (this.mods.drones > 0) {
      for (let i = 0; i < this.mods.drones; i++) {
        const a = this.droneAngle + (TAU * i) / this.mods.drones;
        const dx2 = px + Math.cos(a) * 38;
        const dy2 = py + Math.sin(a) * 38;
        const spr = glowSprite('#4aff8f');
        ctx.drawImage(spr, dx2 - 10, dy2 - 10, 20, 20);
        ctx.fillStyle = '#fff';
        ctx.fillRect(dx2 - 2.5, dy2 - 2.5, 5, 5);
      }
    }

    // charging-dash indicator (right-click hold)
    if (this.charging && this.chargeT > 0) {
      const ratio = Math.min(1, this.chargeT / 2.0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // aim direction preview
      const reach = (this.cp.dashLen * this.mods.dashLen * (1 + ratio * 1.4));
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.25 + ratio * 0.4;
      ctx.lineWidth = 2 + ratio * 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(this.aim) * reach, py + Math.sin(this.aim) * reach);
      ctx.stroke();
      ctx.setLineDash([]);
      // charge ring
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 3;
      ctx.strokeStyle = ratio >= 1 ? '#ffffff' : color;
      ctx.beginPath();
      ctx.arc(px, py, this.radius + 14, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
      ctx.stroke();
      ctx.restore();
    }

    // shield ring
    if (this.shield > 0) {
      const shieldPct = this.shield / this.maxShield;
      ctx.globalAlpha = 0.25 + 0.3 * shieldPct;
      ctx.strokeStyle = '#00a8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, this.radius + 7, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // glow under ship
    const spr = glowSprite(color);
    ctx.drawImage(spr, px - 26, py - 26, 52, 52);

    // hit invuln blink
    if (this.hitInvuln > 0 && !this.dashing && Math.floor(this.hitInvuln * 14) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }
    ctx.globalCompositeOperation = 'source-over';
    this.drawShip(ctx, px, py, this.aim, color, 1);
    ctx.restore();
  }

  drawShip(ctx, x, y, angle, color, scale) {
    const r = this.radius * 1.5 * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    Player.tracePath(ctx, r, this.shape || 'vector');
    ctx.fillStyle = '#0a1020';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r * 0.15, 0, 2.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
