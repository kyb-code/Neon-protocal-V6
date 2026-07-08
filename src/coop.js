// coop.js — OVERCLOCK PROTOCOL: 2-4 player host-authoritative co-op raid.
// Host runs a CoopWorld (extends World); guests run a GuestClient renderer.
import { TAU, rand, randInt, clamp, lerp, choice, sample, dist, dist2, angleTo, circleSegHit } from './utils.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Enemy, ENEMY_TYPES } from './enemies.js';
import { Boss, BOSSES } from './bosses.js';
import { rollUpgrades, UPGRADES } from './upgrades.js';
import { glowSprite, Effects, Background } from './effects.js';
import { L, t } from './i18n.js';

export const COOP_PALETTE = {
  bgInner: '#140812', bgOuter: '#070308',
  grid: 'rgba(255,94,138,0.07)', mote: '#ff5e8a',
  player: '#00f0ff', wall: '#ff5e8a', accent: '#ff5e8a',
};

const E_LIST = Object.keys(ENEMY_TYPES);
const B_LIST = Object.keys(BOSSES);
const RAID_WAVES = 12;
const RAID_POOL = ['chaser', 'swarmer', 'darter', 'shooter', 'splitter', 'bomber', 'shielded', 'turret',
  'orbiter', 'sniper', 'warper', 'pulsar', 'spinner', 'charger', 'tank', 'miner', 'leech', 'healer', 'guardian',
  'lancer', 'weaver', 'mortar', 'fractal', 'repulsor', 'railgun', 'broodmother', 'phantasm', 'bulwark',
  'corruptor', 'blitz', 'flak', 'hunterKiller', 'pylon', 'wingman', 'mirrorer', 'overseer', 'magnetar', 'drainSpire', 'aegisDrone'];

export function coopRewards(victory) {
  return victory ? { rubies: 6, credits: 150 } : { rubies: 1, credits: 30 };
}

// input proxy for remote players (fed by network messages)
export class RemoteInput {
  constructor() {
    this.vx = 0; this.vy = 0;
    this.aimX = 0; this.aimY = 0;
    this.dash = false;
  }
  set(msg) {
    this.vx = clamp(msg.vx || 0, -1, 1);
    this.vy = clamp(msg.vy || 0, -1, 1);
    this.aimX = msg.ax || 0;
    this.aimY = msg.ay || 0;
    if (msg.d) this.dash = true;
  }
  moveVector() {
    let x = this.vx, y = this.vy;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }
  consumeDash() { const d = this.dash; this.dash = false; return d; }
}

// ---------------------------------------------------------------- host world
// entries: [{player, input (Input|RemoteInput), conn (null for host), name, colorHex, shapeId}]
export class CoopWorld extends World {
  constructor(game, entries, net) {
    super(game);
    this.isCoop = true;
    this.net = net;
    this.entries = entries;
    this.players = entries.map((e) => e.player);
    this.arena = { x: -900, y: -550, w: 1800, h: 1100 };
    // scatter spawn positions
    this.players.forEach((p, i) => { p.x = -120 + i * 80; p.y = 0; });
    // wipe the sector-1 combat node the base constructor started
    this.enemies.length = 0;
    this.spawnQueue.length = 0;
    this.bullets.length = 0;

    const n = this.players.length;
    this.hpMul = 1.7 + 0.5 * (n - 1);
    this.dmgMul = 1.35 + 0.12 * (n - 1);
    this.wave = 0;
    this.phase = 'interWave';
    this.interWaveTimer = 3.0;
    this.bosses = [];
    this.bossNamesSent = [];

    // shared team progression
    this.teamXp = 0;
    this.teamLevel = 1;
    this.teamXpNeed = this.xpNeedFor(1);
    this.pendingOffers = new Map(); // entry -> card ids

    this.killFxStyle = game.meta.killFxStyle().style;
    this.snapTimer = 0;
    this.netAnnounce = [];
    this._prevLocalHp = 1;
    this.raidOverSent = false;
  }

  get coopPalette() { return COOP_PALETTE; }
  get palette() { return COOP_PALETTE; }

  aimFor(p) {
    const entry = this.entries.find((e) => e.player === p);
    if (!entry || !entry.remote) return { x: this.mouseWX, y: this.mouseWY };
    return { x: entry.input.aimX, y: entry.input.aimY };
  }

  xpNeedFor(lvl) {
    return Math.round((7 + lvl * 4.2 + Math.pow(lvl, 1.5)) * (0.7 + 0.3 * this.players.length));
  }

  alivePlayers() { return this.players.filter((p) => !p.downed && !p.out); }

  nearestPlayer(e) {
    let best = null, bestD = Infinity;
    for (const p of this.alivePlayers()) {
      const d = dist2(e.x, e.y, p.x, p.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best || this.players[0];
  }

  // difficulty scaling per wave (brutal by design)
  hpScale() { return this.hpMul * (1 + this.wave * 0.17); }
  dmgScale() { return this.dmgMul * (1 + this.wave * 0.05); }

  announceNet(text, color) {
    this.game.announce(text, color);
    this.netAnnounce.push([text, color]);
  }

  startRaidWave() {
    this.wave += 1;
    this.phase = 'fighting';
    this.audio.setIntensity(clamp(0.45 + this.wave * 0.05, 0, 1));
    if (this.wave >= RAID_WAVES) {
      // finale: double boss
      this.announceNet(this.game.t('announce.boss'), '#ff3b5c');
      this.audio.sfx('bossWarn');
      const ids = [];
      while (ids.length < 2) {
        const id = choice(B_LIST.filter((b) => b !== 'administrator' && !ids.includes(b)));
        ids.push(id);
      }
      this.bosses = ids.map((id, i) => {
        const b = new Boss(id, -220 + i * 440, this.arena.y + 180, this.hpMul * 0.75 * (1 + this.wave * 0.05), this.dmgScale());
        this.enemies.push(b);
        this.game.meta.markSeen('boss', id);
        return b;
      });
      this.boss = this.bosses[0];
      return;
    }
    this.announceNet(t('coop.wave') + ' ' + this.wave + '/' + RAID_WAVES, '#ff5e8a');
    // small readable type set per wave, ramping like solo: 2 → 3 → up to 5 types
    const typeCount = Math.min(RAID_POOL.length, this.wave === 1 ? 2 : this.wave === 2 ? 3 : 5);
    const waveTypes = sample(RAID_POOL, typeCount);
    // budget scales with wave and player count
    let budget = Math.round((20 + this.wave * 10) * (0.75 + 0.25 * this.players.length));
    const queue = [];
    while (budget > 0) {
      const id = choice(waveTypes);
      queue.push({ id, elite: false });
      budget -= Math.max(1, ENEMY_TYPES[id].xp);
    }
    if (this.wave % 4 === 0) {
      for (let i = 0; i < 1 + Math.floor(this.wave / 5); i++) queue.push({ id: choice(waveTypes), elite: true });
      this.announceNet(this.game.t('announce.elite'), '#ffd700');
    }
    this.spawnQueue = queue;
    this.spawnTimer = 0.3;
  }

  onTeamLevelUp() {
    this.teamLevel += 1;
    this.teamXpNeed = this.xpNeedFor(this.teamLevel);
    this.audio.sfx('levelup');
    for (const entry of this.entries) {
      if (entry.player.out) continue;
      const cards = rollUpgrades(entry.player, 3);
      if (cards.length === 0) continue;
      this.pendingOffers.set(entry, cards.map((c) => c.id));
      if (entry.remote) {
        this.net.send({ t: 'offer', cards: cards.map((c) => c.id) }, entry.conn);
      } else {
        this.game.ui.showCoopOffer(cards, (u) => this.applyPick(entry, u.id));
      }
    }
  }

  applyPick(entry, cardId) {
    const offered = this.pendingOffers.get(entry);
    if (!offered || !offered.includes(cardId)) return;
    this.pendingOffers.delete(entry);
    const u = UPGRADES.find((x) => x.id === cardId);
    if (!u) return;
    u.apply(entry.player);
    entry.player.upgradeCounts[u.id] = (entry.player.upgradeCounts[u.id] || 0) + 1;
    this.audio.sfx('purchase');
  }

  collectPickup(k, byPlayer) {
    if (k.kind === 'xp') {
      this.teamXp += k.val;
      this.audio.sfx('pickup');
      if (this.teamXp >= this.teamXpNeed) {
        this.teamXp -= this.teamXpNeed;
        this.onTeamLevelUp();
      }
    } else if (k.kind === 'credit') {
      this.creditsEarned += Math.round(k.val);
      this.audio.sfx('credit');
    } else if (k.kind === 'repair') {
      const p = byPlayer || this.players[0];
      p.hp = Math.min(p.maxHp, p.hp + k.val);
      this.audio.sfx('heal');
    }
  }

  playerAreaDamage(x, y, r, dmg, kind = 'contact') {
    for (const p of this.alivePlayers()) {
      if (dist2(x, y, p.x, p.y) < (r + p.radius) ** 2) p.takeDamage(dmg, this, kind);
    }
  }

  flashDamage() { /* handled by local-hp tracking to avoid flashing on teammates' hits */ }

  onPlayerDeath() {
    // convert deaths into "downed" state
    for (const p of this.players) {
      if (p.dead && !p.out) {
        p.dead = false;
        p.downed = true;
        p.downTimer = 25;
        p.revProgress = 0;
        p.hp = 0;
        this.effects.shockwave(p.x, p.y, '#ff3b5c', 120, 6);
        this.audio.sfx('shieldBreak');
      }
    }
    if (this.alivePlayers().length === 0) this.endRaid(false);
  }

  endRaid(victory) {
    if (this.raidOverSent) return;
    this.raidOverSent = true;
    this.phase = 'over';
    this.net.broadcast({ t: 'over', v: victory });
    this.game.coopOver(victory);
  }

  update(dt, input, canvasW, canvasH) {
    this.time += dt;
    this.runTime += dt;
    this.mouseWX = input.mouseX + this.camX;
    this.mouseWY = input.mouseY + this.camY;

    // wave director
    if (this.phase === 'interWave') {
      this.interWaveTimer -= dt;
      if (this.interWaveTimer <= 0) this.startRaidWave();
    } else if (this.phase === 'fighting') {
      if (this.wave < RAID_WAVES) this.spawnFromQueue(dt);
      if (this.spawnQueue.length === 0 && this.enemies.length === 0) {
        if (this.wave >= RAID_WAVES) {
          this.endRaid(true);
        } else {
          this.phase = 'interWave';
          this.interWaveTimer = 2.6;
          this.wavesCleared += 1;
          this.audio.sfx('waveClear');
          // inter-wave breather: drop a couple of repairs
          for (let i = 0; i < 2; i++) {
            this.pickups.push({ kind: 'repair', x: rand(-300, 300), y: rand(-200, 200), vx: 0, vy: 0, val: 20, r: 8, life: 20 });
          }
        }
      }
    }

    // players
    for (const entry of this.entries) {
      const p = entry.player;
      if (p.out) continue;
      if (p.downed) {
        p.downTimer -= dt;
        // ally revive
        let reviving = false;
        for (const ally of this.alivePlayers()) {
          if (dist2(ally.x, ally.y, p.x, p.y) < 80 * 80) { reviving = true; break; }
        }
        if (reviving) {
          p.revProgress += dt / 2.5;
          if (p.revProgress >= 1) {
            p.downed = false;
            p.hp = Math.round(p.maxHp * 0.4);
            p.shield = p.maxShield;
            p.hitInvuln = (p.metaBonus && p.metaBonus.reviveInvuln) || 2;
            this.effects.shockwave(p.x, p.y, '#4aff8f', 130, 6);
            this.audio.sfx('heal');
          }
        } else {
          p.revProgress = Math.max(0, p.revProgress - dt / 2.5);
        }
        if (p.downTimer <= 0 && p.downed) {
          p.out = true;
          p.downed = false;
          this.effects.burst(p.x, p.y, '#ff3b5c', 30, 300);
          this.audio.sfx('defeat');
          if (this.alivePlayers().length === 0) this.endRaid(false);
        }
        continue;
      }
      p.update(dt, entry.input, this);
    }

    // enemies target nearest living player
    for (const e of this.enemies.slice()) {
      // Enemy.update calls type.update(e, dt, w, p) — pass nearest
      const target = this.nearestPlayer(e);
      e.update(dt, this, target);
    }

    // contact damage vs every player
    for (const p of this.alivePlayers()) {
      if (p.dashing || p.hitInvuln > 0) continue;
      for (const e of this.enemies) {
        if (e.spawnT > 0 || e.dmg <= 0) continue;
        if (dist2(e.x, e.y, p.x, p.y) < (e.radius + p.radius) ** 2) {
          p.takeDamage(e.dmg, this);
          const a = angleTo(p.x, p.y, e.x, e.y);
          e.vx += Math.cos(a) * 220;
          e.vy += Math.sin(a) * 220;
          break;
        }
      }
    }

    // trail burn (any player's trail)
    for (const p of this.players) {
      if (!p.trailSegments.length) continue;
      for (const e of this.enemies.slice()) {
        if (e.spawnT > 0) continue;
        e.burnCd = e.burnCd || 0;
        if (this.time <= e.burnCd) continue;
        for (const s of p.trailSegments) {
          if (circleSegHit(e.x, e.y, e.radius + 8, s.x1, s.y1, s.x2, s.y2)) {
            e.burnCd = this.time + 0.35;
            this.damageEnemy(e, 6 * p.mods.trailBurn * p.mods.dashDmg, { pl: p });
            break;
          }
        }
      }
    }

    // hazard zones (pools / mortars) vs all players
    this.updateZones(dt, this.alivePlayers());

    // enemy bullets vs all players
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (b.homing > 0) {
        const target = this.nearestPlayer({ x: b.x, y: b.y });
        if (target) {
          const ta = angleTo(b.x, b.y, target.x, target.y);
          const cur = Math.atan2(b.vy, b.vx);
          const diff = ((ta - cur + Math.PI * 3) % TAU) - Math.PI;
          const na = cur + clamp(diff, -b.homing * dt, b.homing * dt);
          const sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      const a = this.arena;
      if (b.life <= 0 || b.x < a.x - 40 || b.x > a.x + a.w + 40 || b.y < a.y - 40 || b.y > a.y + a.h + 40) {
        this.bullets.splice(i, 1); continue;
      }
      for (const p of this.alivePlayers()) {
        if (p.dashing || p.hitInvuln > 0) continue;
        if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.radius) ** 2) {
          this.bullets.splice(i, 1);
          p.takeDamage(b.dmg, this);
          break;
        }
      }
    }

    // player bullets (drones/seekers)
    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const b = this.playerBullets[i];
      if (b.homing) {
        let best = null, bestD = 500 * 500;
        for (const e of this.enemies) {
          if (e.spawnT > 0) continue;
          const d = dist2(b.x, b.y, e.x, e.y);
          if (d < bestD) { bestD = d; best = e; }
        }
        if (best) {
          const ta = angleTo(b.x, b.y, best.x, best.y);
          const cur = Math.atan2(b.vy, b.vx);
          let diff = ((ta - cur + Math.PI * 3) % TAU) - Math.PI;
          const na = cur + clamp(diff, -5 * dt, 5 * dt);
          const sp = Math.min(520, Math.hypot(b.vx, b.vy) + 500 * dt);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) { this.playerBullets.splice(i, 1); continue; }
      for (const e of this.enemies.slice()) {
        if (e.spawnT > 0) continue;
        if (dist2(b.x, b.y, e.x, e.y) < (b.r + e.radius) ** 2) {
          this.damageEnemy(e, b.dmg, { fromX: b.x, fromY: b.y });
          this.playerBullets.splice(i, 1);
          break;
        }
      }
    }

    // mines vs all players
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.armT -= dt; m.life -= dt;
      if (m.life <= 0) { this.mines.splice(i, 1); continue; }
      if (m.armT > 0) continue;
      for (const p of this.alivePlayers()) {
        if (dist2(m.x, m.y, p.x, p.y) < m.trigR * m.trigR) {
          this.mines.splice(i, 1);
          this.effects.shockwave(m.x, m.y, '#ff7b00', m.blastR, 5);
          this.audio.sfx('explode');
          this.playerAreaDamage(m.x, m.y, m.blastR, m.dmg, 'hazard');
          break;
        }
      }
    }

    // beams vs all players
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const bm = this.beams[i];
      bm.t -= dt;
      if (bm.state === 'tele' && bm.t <= 0) {
        bm.state = 'fire'; bm.t = bm.fireDur;
        this.audio.sfx('laser');
      } else if (bm.state === 'fire') {
        bm.tickCd -= dt;
        if (bm.tickCd <= 0) {
          const ex = bm.x + Math.cos(bm.a) * bm.len;
          const ey = bm.y + Math.sin(bm.a) * bm.len;
          for (const p of this.alivePlayers()) {
            if (p.dashing || p.hitInvuln > 0) continue;
            if (circleSegHit(p.x, p.y, p.radius + bm.width / 2, bm.x, bm.y, ex, ey)) {
              bm.tickCd = 0.4;
              p.takeDamage(bm.dmg, this, 'hazard');
            }
          }
        }
        if (bm.t <= 0) this.beams.splice(i, 1);
      }
    }

    // pickups: attracted to nearest living player
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.life -= dt;
      if (k.life <= 0) { this.pickups.splice(i, 1); continue; }
      let best = null, bestD = Infinity;
      for (const p of this.alivePlayers()) {
        const d = dist2(k.x, k.y, p.x, p.y);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best) {
        const pr = best.pickupRadius();
        const d2 = bestD;
        if (d2 < pr * pr) {
          const a = angleTo(k.x, k.y, best.x, best.y);
          const pull = 560 * (1 - Math.sqrt(d2) / pr) + 140;
          k.vx = lerp(k.vx, Math.cos(a) * pull, 1 - Math.exp(-8 * dt));
          k.vy = lerp(k.vy, Math.sin(a) * pull, 1 - Math.exp(-8 * dt));
        } else {
          k.vx *= Math.pow(0.2, dt); k.vy *= Math.pow(0.2, dt);
        }
        k.x += k.vx * dt; k.y += k.vy * dt;
        if (d2 < (16 + best.radius) ** 2) {
          this.pickups.splice(i, 1);
          this.collectPickup(k, best);
        }
      }
    }

    this.effects.update(dt);

    // damage flash only for the host's own ship
    const local = this.players[0];
    const hpNow = (local.hp + local.shield) / (local.maxHp + local.maxShield);
    if (hpNow < this._prevLocalHp - 0.001) this.game.flashDamage();
    this._prevLocalHp = hpNow;

    // camera follows host player
    const lookX = (input.mouseX - canvasW / 2) * 0.18;
    const lookY = (input.mouseY - canvasH / 2) * 0.18;
    const tx = local.x + lookX - canvasW / 2;
    const ty = local.y + lookY - canvasH / 2;
    this.camX = lerp(this.camX, tx, 1 - Math.exp(-6 * dt));
    this.camY = lerp(this.camY, ty, 1 - Math.exp(-6 * dt));
    const mX = 140, mY = 110;
    const aMinX = this.arena.x - mX, aMaxX = this.arena.x + this.arena.w + mX - canvasW;
    const aMinY = this.arena.y - mY, aMaxY = this.arena.y + this.arena.h + mY - canvasH;
    if (aMaxX > aMinX) this.camX = clamp(this.camX, aMinX, aMaxX); else this.camX = (aMinX + aMaxX) / 2;
    if (aMaxY > aMinY) this.camY = clamp(this.camY, aMinY, aMaxY); else this.camY = (aMinY + aMaxY) / 2;
    this.camX += this.effects.shakeX;
    this.camY += this.effects.shakeY;

    // network snapshot @20Hz
    this.snapTimer -= dt;
    if (this.snapTimer <= 0) {
      this.snapTimer = 0.07; // ~14Hz — kinder to the public relay than 20Hz
      this.net.broadcast(this.buildSnapshot());
    }
  }

  buildSnapshot() {
    const bossesAlive = this.bosses.filter((b) => this.enemies.includes(b));
    const snap = {
      t: 's',
      w: this.wave,
      ph: this.phase,
      lv: this.teamLevel,
      xp: +(this.teamXp / this.teamXpNeed).toFixed(3),
      cr: this.creditsEarned,
      pl: this.players.map((p) => [
        Math.round(p.x), Math.round(p.y), +p.aim.toFixed(2),
        +(p.hp / p.maxHp).toFixed(3), +(p.shield / p.maxShield).toFixed(3),
        p.dashing ? 1 : 0,
        p.out ? -1 : (p.downed ? Math.ceil(p.downTimer) : 0),
        +(p.revProgress || 0).toFixed(2),
        +(p.dashCharges).toFixed(2), p.maxDashCharges,
      ]),
      en: this.enemies.map((e) => [
        e.id,
        e.isBoss ? 200 + B_LIST.indexOf(e.bossId) : E_LIST.indexOf(e.typeId),
        Math.round(e.x), Math.round(e.y), +e.rot.toFixed(2),
        +(e.hp / e.maxHp).toFixed(3), Math.round(e.radius), e.elite ? 1 : 0,
      ]),
      bu: this.bullets.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.r)]),
      pb: this.playerBullets.map((b) => [Math.round(b.x), Math.round(b.y)]),
      pk: this.pickups.map((k) => [Math.round(k.x), Math.round(k.y), k.kind === 'xp' ? 0 : k.kind === 'credit' ? 1 : 2]),
      mn: this.mines.map((m) => [Math.round(m.x), Math.round(m.y), m.armT <= 0 ? 1 : 0]),
      zn: (this.pools || []).map((z) => [Math.round(z.x), Math.round(z.y), Math.round(z.r)]),
      mt: (this.mortars || []).map((m) => [Math.round(m.x), Math.round(m.y), Math.round(m.r), +(1 - m.t / m.fuse).toFixed(2)]),
      bm: this.beams.map((b) => [Math.round(b.x), Math.round(b.y), +b.a.toFixed(2), Math.round(b.len), Math.round(b.width), b.state === 'fire' ? 1 : 0]),
      bs: bossesAlive.map((b) => [L(b.def.name), +(b.hp / b.maxHp).toFixed(3)]),
      an: this.netAnnounce.splice(0),
    };
    return snap;
  }

  // draw: base world draw (arena, entities, host player) + teammates
  draw(ctx, canvasW, canvasH) {
    super.draw(ctx, canvasW, canvasH);
    const camX = this.camX, camY = this.camY;
    // remaining players (index 0 drawn by super via this.player)
    for (let i = 1; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.out) continue;
      p.draw(ctx, camX, camY, this);
    }
    // downed overlays + name tags
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '11px Consolas, monospace';
    this.entries.forEach((entry, i) => {
      const p = entry.player;
      if (p.out) return;
      const x = p.x - camX, y = p.y - camY;
      const nameCol = entry.colorHex === 'rainbow' ? '#fff' : entry.colorHex;
      if (entry.title) {
        ctx.font = '10px Consolas, monospace';
        ctx.fillStyle = '#ffd700';
        ctx.globalAlpha = 0.95;
        ctx.fillText('« ' + entry.title + ' »', x, y - 40);
      }
      ctx.font = 'bold 13px Consolas, monospace';
      ctx.fillStyle = nameCol;
      ctx.globalAlpha = 0.95;
      ctx.fillText(entry.name + (i === 0 ? ' ★' : ''), x, y - 26);
      ctx.globalAlpha = 1;
      if (p.downed) {
        ctx.strokeStyle = '#ff3b5c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#ff3b5c';
        ctx.fillText(Math.ceil(p.downTimer) + 's', x, y + 4);
        if (p.revProgress > 0) {
          ctx.strokeStyle = '#4aff8f';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, 26, -Math.PI / 2, -Math.PI / 2 + TAU * p.revProgress);
          ctx.stroke();
        }
      }
    });
    ctx.restore();
  }
}

// ---------------------------------------------------------------- guest client
export class GuestClient {
  constructor(game, net, myIndex, roster) {
    this.game = game;
    this.net = net;
    this.myIndex = myIndex;
    this.roster = roster; // [{name, color, shape}]
    this.snap = null;
    this.prevEnemyIds = new Map(); // id -> [x, y, colorIdx]
    this.smooth = new Map();       // enemy id -> interpolated {x, y}
    this.plView = [];              // players -> interpolated {x, y, aim}
    this.effects = new Effects();
    this.background = new Background();
    this.camX = 0; this.camY = 0;
    this.sendTimer = 0;
    this.dashPending = false;
    this.prevSelf = null;
    this.prevWave = 0;
    this.prevBossCount = 0;
    this.time = 0;
    this.arena = { x: -900, y: -550, w: 1800, h: 1100 };
    this.over = null;
  }

  onSnapshot(s) {
    this.snap = s;
    this.lastSnapAt = this.time; // freshness marker for the reconnect indicator
    // announcements
    for (const [text, color] of s.an || []) this.game.announce(text, color);
    if (s.w !== this.prevWave) this.prevWave = s.w;
    // infer kills: enemies that vanished
    const seen = new Set();
    for (const e of s.en) seen.add(e[0]);
    for (const [id, info] of this.prevEnemyIds) {
      if (!seen.has(id)) {
        const [x, y, ti] = info;
        const color = ti >= 200 ? (BOSSES[B_LIST[ti - 200]] || {}).color || '#fff' : (ENEMY_TYPES[E_LIST[ti]] || {}).color || '#fff';
        this.effects.burst(x, y, color, ti >= 200 ? 50 : 12, ti >= 200 ? 400 : 200);
        this.game.audio.sfx(ti >= 200 ? 'bigExplode' : 'kill');
        this.smooth.delete(id);
      }
    }
    this.prevEnemyIds.clear();
    for (const e of s.en) this.prevEnemyIds.set(e[0], [e[2], e[3], e[1]]);
    // boss warn
    const bossCount = (s.bs || []).length;
    if (bossCount > this.prevBossCount) this.game.audio.sfx('bossWarn');
    this.prevBossCount = bossCount;
    // own damage flash / dash sfx
    const me = s.pl[this.myIndex];
    if (me && this.prevSelf) {
      const hpNow = me[3] + me[4], hpPrev = this.prevSelf[3] + this.prevSelf[4];
      if (hpNow < hpPrev - 0.001) { this.game.flashDamage(); this.game.audio.sfx('playerHit'); this.effects.shake(6); }
      if (me[5] === 1 && this.prevSelf[5] === 0) this.game.audio.sfx('dash');
    }
    this.prevSelf = me ? me.slice() : null;
  }

  // ease every networked entity toward its latest snapshot each frame (smooth 60fps motion)
  _interpolate(dt) {
    const s = this.snap; if (!s) return;
    const f = 1 - Math.exp(-16 * dt);
    s.pl.forEach((pd, i) => {
      let v = this.plView[i];
      if (!v) { v = { x: pd[0], y: pd[1], aim: pd[2] }; this.plView[i] = v; }
      v.x = lerp(v.x, pd[0], f); v.y = lerp(v.y, pd[1], f);
      let da = ((pd[2] - v.aim + Math.PI * 3) % TAU) - Math.PI;
      v.aim += da * f;
    });
    this.plView.length = s.pl.length;
    for (const e of s.en) {
      let sm = this.smooth.get(e[0]);
      if (!sm) { sm = { x: e[2], y: e[3] }; this.smooth.set(e[0], sm); }
      sm.x = lerp(sm.x, e[2], f); sm.y = lerp(sm.y, e[3], f);
    }
  }

  update(dt, input, w, h) {
    this.time += dt;
    this.background.update(dt);
    this.effects.update(dt);
    if (input.consumeDash()) this.dashPending = true;
    if (input.wasPressed('Escape')) { this.game.leaveCoop(t('coop.disconnected')); return; }

    // interpolate every networked entity toward its latest snapshot position so 14Hz
    // snapshots render as smooth 60fps motion instead of teleporting each update.
    this._interpolate(dt);

    const me = this.plView && this.plView[this.myIndex];
    // camera on own ship (smoothed position)
    if (me) {
      const tx = me.x + (input.mouseX - w / 2) * 0.18 - w / 2;
      const ty = me.y + (input.mouseY - h / 2) * 0.18 - h / 2;
      this.camX = lerp(this.camX, tx, 1 - Math.exp(-9 * dt));
      this.camY = lerp(this.camY, ty, 1 - Math.exp(-9 * dt));
      this.camX += this.effects.shakeX;
      this.camY += this.effects.shakeY;
    }
    // send input @30Hz
    this.sendTimer -= dt;
    if (this.sendTimer <= 0) {
      this.sendTimer = 1 / 20; // 20Hz input — relay-friendly
      const mv = input.moveVector();
      this.net.send({
        t: 'i', vx: mv.x, vy: mv.y,
        ax: input.mouseX + this.camX, ay: input.mouseY + this.camY,
        d: this.dashPending,
      });
      this.dashPending = false;
    }
  }

  drawShipAt(ctx, x, y, aim, colorHex, shapeId, dashing, downed) {
    const spr = glowSprite(colorHex);
    ctx.save();
    if (downed) ctx.globalAlpha = 0.45;
    ctx.drawImage(spr, x - 26, y - 26, 52, 52);
    ctx.translate(x, y);
    ctx.rotate(aim);
    ctx.beginPath();
    Player.tracePath(ctx, 15, shapeId);
    ctx.fillStyle = '#0a1020';
    ctx.fill();
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 2;
    if (dashing) { ctx.shadowColor = colorHex; ctx.shadowBlur = 18; }
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx, w, h) {
    this.background.draw(ctx, w, h, this.camX, this.camY, COOP_PALETTE);
    const s = this.snap;
    const camX = this.camX, camY = this.camY;
    // arena
    ctx.save();
    ctx.strokeStyle = COOP_PALETTE.wall;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = COOP_PALETTE.wall;
    ctx.shadowBlur = 18;
    ctx.strokeRect(this.arena.x - camX, this.arena.y - camY, this.arena.w, this.arena.h);
    ctx.shadowBlur = 0;
    ctx.restore();
    if (!s) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '16px Consolas, monospace';
      ctx.fillStyle = '#6d8aa5';
      ctx.fillText(t('coop.connecting'), w / 2, h / 2);
      ctx.restore();
      return;
    }

    // corrosive pools + mortar markers
    for (const [x, y, r] of (s.zn || [])) {
      ctx.save();
      ctx.globalAlpha = 0.2 + 0.06 * Math.sin(this.time * 6);
      ctx.fillStyle = '#4ade80';
      ctx.beginPath(); ctx.arc(x - camX, y - camY, r, 0, TAU); ctx.fill();
      ctx.restore();
    }
    for (const [x, y, r, p01] of (s.mt || [])) {
      ctx.save();
      ctx.strokeStyle = '#ffb347';
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 16);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x - camX, y - camY, r, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(x - camX, y - camY, r * p01, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    // beams
    for (const [x, y, a, len, wd, st] of s.bm) {
      const x1 = x - camX, y1 = y - camY;
      const x2 = x1 + Math.cos(a) * len, y2 = y1 + Math.sin(a) * len;
      ctx.save();
      if (st === 0) {
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#ff5e8a';
        ctx.setLineDash([10, 8]);
        ctx.lineWidth = 2;
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#ff5e8a';
        ctx.lineWidth = wd;
        ctx.lineCap = 'round';
        ctx.shadowColor = '#ff5e8a';
        ctx.shadowBlur = 22;
      }
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.restore();
    }
    // mines
    for (const [x, y, armed] of s.mn) {
      const blink = armed && Math.floor(this.time * 6) % 2 === 0;
      ctx.save();
      const spr = glowSprite('#ff7b00');
      ctx.globalAlpha = 0.6;
      ctx.drawImage(spr, x - camX - 14, y - camY - 14, 28, 28);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = blink ? '#fff' : '#ff7b00';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x - camX, y - camY, 9, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // pickups
    const PK_COLORS = ['#ff2fd6', '#ffe94a', '#4aff8f'];
    for (const [x, y, k] of s.pk) {
      const spr = glowSprite(PK_COLORS[k]);
      ctx.globalAlpha = 0.85;
      ctx.drawImage(spr, x - camX - 10, y - camY - 10, 20, 20);
      ctx.globalAlpha = 1;
    }
    // bullets
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, r] of s.bu) {
      const spr = glowSprite('#ff5577');
      ctx.drawImage(spr, x - camX - r * 2.5, y - camY - r * 2.5, r * 5, r * 5);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - camX, y - camY, r * 0.55, 0, TAU); ctx.fill();
    }
    for (const [x, y] of s.pb) {
      const spr = glowSprite('#4aff8f');
      ctx.drawImage(spr, x - camX - 10, y - camY - 10, 20, 20);
    }
    ctx.restore();

    // enemies (smoothed)
    for (const [id, ti, ex, ey, rot, hp01, r, elite] of s.en) {
      const sm = this.smooth.get(id) || { x: ex, y: ey }; // interpolated in _interpolate()
      const x = sm.x - camX, y = sm.y - camY;
      if (x < -80 || x > w + 80 || y < -80 || y > h + 80) continue;
      if (ti >= 200) {
        // boss: large hexagon + rings
        const def = BOSSES[B_LIST[ti - 200]] || { color: '#fff' };
        const spr = glowSprite(def.color);
        ctx.globalAlpha = 0.5;
        ctx.drawImage(spr, x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.strokeStyle = def.color;
        ctx.fillStyle = 'rgba(5,8,18,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (TAU * i) / 6;
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = def.color;
        ctx.globalAlpha = 0.4;
        ctx.setLineDash([14, 10]);
        ctx.lineDashOffset = rot * 30;
        ctx.beginPath(); ctx.arc(x, y, r + 14, 0, TAU); ctx.stroke();
        ctx.restore();
      } else {
        const et = ENEMY_TYPES[E_LIST[ti]] || { color: '#f66', shape: 'tri' };
        const spr = glowSprite(elite ? '#ffd700' : et.color);
        ctx.globalAlpha = 0.5;
        ctx.drawImage(spr, x - r * 2.1, y - r * 2.1, r * 4.2, r * 4.2);
        ctx.globalAlpha = 1;
        Enemy.prototype.drawShape.call({ }, ctx, x, y, r, rot, et.shape, et.color);
        if (elite) {
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, r + 6, 0, TAU); ctx.stroke();
        }
        if (hp01 < 1) {
          const bw = r * 2.4;
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(x - bw / 2, y - r - 12, bw, 3.5);
          ctx.fillStyle = elite ? '#ffd700' : '#ff5577';
          ctx.fillRect(x - bw / 2, y - r - 12, bw * hp01, 3.5);
        }
      }
    }

    // players
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '11px Consolas, monospace';
    s.pl.forEach((pd, i) => {
      const down = pd[6], dashing = pd[5];
      if (down === -1) return; // out
      const v = this.plView[i] || { x: pd[0], y: pd[1], aim: pd[2] }; // interpolated
      const x = v.x, y = v.y, aim = v.aim;
      const ro = this.roster[i] || { color: '#00f0ff', shape: 'vector', name: 'P' + (i + 1) };
      this.drawShipAt(ctx, x - camX, y - camY, aim, ro.color, ro.shape, dashing === 1, down > 0);
      const nameCol = ro.color === 'rainbow' ? '#fff' : ro.color;
      if (ro.title) {
        ctx.font = '10px Consolas, monospace';
        ctx.fillStyle = '#ffd700';
        ctx.fillText('« ' + ro.title + ' »', x - camX, y - camY - 40);
      }
      ctx.font = 'bold 13px Consolas, monospace';
      ctx.fillStyle = nameCol;
      ctx.fillText(ro.name + (i === this.myIndex ? ' ★' : ''), x - camX, y - camY - 26);
      if (down > 0) {
        ctx.strokeStyle = '#ff3b5c';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x - camX, y - camY, 22, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#ff3b5c';
        ctx.fillText(down + 's', x - camX, y - camY + 4);
        const rev = pd[7];
        if (rev > 0) {
          ctx.strokeStyle = '#4aff8f';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x - camX, y - camY, 26, -Math.PI / 2, -Math.PI / 2 + TAU * rev);
          ctx.stroke();
        }
      }
    });
    ctx.restore();

    this.effects.draw(ctx, camX, camY);

    // ---- guest HUD (canvas) ----
    const me = s.pl[this.myIndex];
    ctx.save();
    ctx.font = 'bold 14px Consolas, monospace';
    ctx.textAlign = 'left';
    // wave + level
    ctx.fillStyle = '#ff5e8a';
    ctx.fillText(`${t('coop.wave')} ${s.w}/${RAID_WAVES}`, 18, 28);
    ctx.fillStyle = '#ff2fd6';
    ctx.fillText(`LV ${s.lv}`, 18, 48);
    ctx.fillStyle = 'rgba(255,47,214,0.25)';
    ctx.fillRect(60, 40, 140, 6);
    ctx.fillStyle = '#ff2fd6';
    ctx.fillRect(60, 40, 140 * clamp(s.xp, 0, 1), 6);
    // own bars
    if (me) {
      ctx.fillStyle = 'rgba(0,168,255,0.25)';
      ctx.fillRect(18, 62, 200, 8);
      ctx.fillStyle = '#00a8ff';
      ctx.fillRect(18, 62, 200 * clamp(me[4], 0, 1), 8);
      ctx.fillStyle = 'rgba(255,59,92,0.25)';
      ctx.fillRect(18, 76, 200, 8);
      ctx.fillStyle = '#ff3b5c';
      ctx.fillRect(18, 76, 200 * clamp(me[3], 0, 1), 8);
      // dash pips
      const charges = me[8], maxCh = me[9];
      for (let i = 0; i < maxCh; i++) {
        ctx.fillStyle = charges >= i + 1 ? '#00f0ff' : 'rgba(0,240,255,0.15)';
        ctx.fillRect(18 + i * 30, 92, 24, 7);
      }
      if (me[6] > 0) {
        ctx.textAlign = 'center';
        ctx.font = 'bold 22px Consolas, monospace';
        ctx.fillStyle = '#ff3b5c';
        ctx.fillText(t('coop.downed'), w / 2, h * 0.4);
      }
    }
    // boss bars
    (s.bs || []).forEach(([name, hp01], i) => {
      ctx.textAlign = 'center';
      ctx.font = '12px Consolas, monospace';
      ctx.fillStyle = '#ff3b5c';
      ctx.fillText(name, w / 2, 58 + i * 34);
      ctx.fillStyle = 'rgba(255,59,92,0.25)';
      ctx.fillRect(w / 2 - 200, 64 + i * 34, 400, 9);
      ctx.fillStyle = '#ff3b5c';
      ctx.fillRect(w / 2 - 200, 64 + i * 34, 400 * clamp(hp01, 0, 1), 9);
    });
    ctx.restore();

    // stale-connection indicator: if snapshots stopped arriving, say so instead of silently freezing
    if (this.lastSnapAt !== undefined && this.time - this.lastSnapAt > 2) {
      ctx.save();
      ctx.fillStyle = 'rgba(3,5,10,0.6)';
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px Consolas, monospace';
      ctx.fillStyle = '#ffe94a';
      ctx.fillText(t('coop.reconnecting'), w / 2, h / 2);
      ctx.restore();
    }
  }
}
