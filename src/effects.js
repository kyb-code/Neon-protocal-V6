// effects.js — particles, shockwaves, floating text, screen shake, glow sprites, background
import { TAU, rand, clamp, lerp, choice } from './utils.js';

const MAX_PARTICLES = 900;

// 'rainbow' resolves to a cycling hue (admin hull). Quantized so glow sprites stay cacheable.
export function resolveColor(color, time = 0) {
  if (color !== 'rainbow') return color;
  const hue = Math.floor(((time * 90) % 360) / 20) * 20;
  return `hsl(${hue},100%,62%)`;
}

// smooth flowing nebula palette — soft, quantized to 15° steps so glow sprites cache.
// offset shifts along the band; band spans a lush violet→cyan→magenta sweep.
export function nebulaColor(time, offset = 0, sat = 70, light = 58) {
  // refined deep-space sweep: teal→indigo→violet→rose. Lower sat/light = classy, not neon-loud.
  const raw = 190 + 110 * Math.sin(time * 0.6 + offset * 1.5);
  const hue = ((Math.floor(raw / 12) * 12) % 360 + 360) % 360;
  return `hsl(${hue},${sat}%,${light}%)`;
}

// ---- glow sprite cache: pre-rendered radial gradients, tinted per color ----
const glowCache = new Map();
export function glowSprite(color, size = 64) {
  const key = color + '_' + size;
  let c = glowCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 0.9;
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  glowCache.set(key, c);
  return c;
}

export class Effects {
  constructor() {
    this.particles = [];
    this.shockwaves = [];
    this.texts = [];
    this.shakeAmp = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flashAlpha = 0;
    this.flashColor = '#ffffff';
    this.shakeEnabled = true;
    this.quality = 1; // 0.5 = low
  }

  clear() {
    this.particles.length = 0;
    this.shockwaves.length = 0;
    this.texts.length = 0;
    this.shakeAmp = 0;
    this.flashAlpha = 0;
  }

  shake(amount) {
    if (!this.shakeEnabled) return;
    this.shakeAmp = Math.min(this.shakeAmp + amount, 26);
  }

  flash(color = '#ffffff', alpha = 0.25) {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }

  spawnParticle(x, y, opts = {}) {
    if (this.particles.length >= MAX_PARTICLES * this.quality) return;
    this.particles.push({
      x, y,
      vx: opts.vx ?? rand(-60, 60),
      vy: opts.vy ?? rand(-60, 60),
      life: opts.life ?? rand(0.3, 0.7),
      maxLife: 0,
      size: opts.size ?? rand(2, 4),
      color: opts.color ?? '#00f0ff',
      drag: opts.drag ?? 0.92,
      glow: opts.glow !== false,
      gravity: opts.gravity ?? 0,
      alphaMul: opts.alphaMul ?? 1,   // <1 for soft fog/nebula
      grow: opts.grow ?? 0,           // px/sec the sprite expands as it drifts (fog billows)
      fadeIn: opts.fadeIn ?? 0,       // seconds of ease-in before fading out
    });
    const p = this.particles[this.particles.length - 1];
    p.maxLife = p.life;
  }

  // soft, billowing nebula cloud — large, very low-alpha, slow. Classy, not neon-loud.
  mist(x, y, color, opts = {}) {
    this.spawnParticle(x, y, {
      vx: opts.vx ?? rand(-18, 18), vy: opts.vy ?? rand(-18, 18),
      color, life: opts.life ?? rand(0.8, 1.5),
      size: opts.size ?? rand(9, 15), drag: opts.drag ?? 0.9,
      alphaMul: opts.alphaMul ?? 0.1, grow: opts.grow ?? rand(12, 26),
      fadeIn: opts.fadeIn ?? 0.2,
    });
  }

  burst(x, y, color, count = 12, speed = 180, opts = {}) {
    count = Math.round(count * this.quality);
    for (let i = 0; i < count; i++) {
      const a = rand(TAU);
      const s = rand(speed * 0.3, speed);
      this.spawnParticle(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        color, life: rand(0.25, 0.8), size: rand(1.5, opts.size ?? 4.5),
        drag: opts.drag ?? 0.9,
      });
    }
  }

  // stylized kill effect — selected via cosmetics. baseColor = enemy color.
  killBurst(x, y, baseColor, style, big) {
    const col = (c) => c || baseColor;
    const n = big ? 2 : 1;
    switch (style) {
      case 'ember':
        this.burst(x, y, '#ff7b00', 10 * n, 200);
        for (let i = 0; i < 8 * n; i++) this.spawnParticle(x, y, { vx: rand(-60, 60), vy: rand(-180, -40), color: choice(['#ff7b00', '#ffd24a', '#ff3b00']), life: rand(0.5, 1.1), size: rand(2, 4), gravity: 260, drag: 0.96 });
        this.shockwave(x, y, '#ff7b00', big ? 120 : 54, 4);
        break;
      case 'prism':
        for (const c of ['#ff2fd6', '#00f0ff', '#ffe94a', '#4aff8f']) this.debris(x, y, c, 5 * n, 300);
        this.shockwave(x, y, '#ffffff', big ? 120 : 56, 3);
        break;
      case 'void':
        // implode then flash
        for (let i = 0; i < 14 * n; i++) { const a = rand(TAU), d = rand(40, 90); this.spawnParticle(x + Math.cos(a) * d, y + Math.sin(a) * d, { vx: -Math.cos(a) * 260, vy: -Math.sin(a) * 260, color: '#9b5cff', life: 0.35, size: 3.5, drag: 0.9 }); }
        this.shockwave(x, y, '#ffffff', big ? 90 : 40, 5);
        this.flash('#9b5cff', big ? 0.14 : 0.05);
        break;
      case 'bloom':
        for (let i = 0; i < 8 * n; i++) { const a = (TAU * i) / (8 * n); this.spawnParticle(x, y, { vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, color: '#4aff8f', life: 0.7, size: 4, drag: 0.86 }); }
        this.shockwave(x, y, '#4aff8f', big ? 120 : 56, 3);
        break;
      case 'glitch':
        this.debris(x, y, '#ff2fd6', 8 * n, 320);
        this.debris(x, y, '#00f0ff', 6 * n, 280);
        for (let i = 0; i < 3; i++) this.spawnParticle(x + rand(-30, 30), y + rand(-30, 30), { vx: 0, vy: 0, color: '#ff2fd6', life: 0.2, size: 6 });
        break;
      case 'frost':
        this.debris(x, y, '#7dd8ff', 10 * n, 240);
        this.burst(x, y, '#e0f7ff', 8 * n, 160);
        this.shockwave(x, y, '#7dd8ff', big ? 120 : 54, 3);
        break;
      case 'gold':
        this.burst(x, y, '#ffd700', 14 * n, 240);
        for (let i = 0; i < 6 * n; i++) this.spawnParticle(x, y, { vx: rand(-100, 100), vy: rand(-200, -60), color: '#ffe94a', life: rand(0.6, 1.1), size: rand(2, 4), gravity: 300, drag: 0.97 });
        this.shockwave(x, y, '#ffd700', big ? 120 : 56, 4);
        break;
      case 'ring':
        this.shockwave(x, y, col('#00f0ff'), big ? 90 : 44, 4);
        this.shockwave(x, y, '#ffffff', big ? 140 : 70, 2);
        this.burst(x, y, col('#00f0ff'), 8 * n, 200);
        break;
      case 'supernova': { // admin ultra — layered prismatic bloom with a lingering nebula
        const T = this._t || 0; this._t = T; // stable-ish phase for color variety
        // expanding prismatic rings
        for (const c of ['#ffffff', '#00f0ff', '#ff2fd6', '#ffe94a', '#4aff8f', '#ff7b00']) {
          this.shockwave(x, y, c, big ? 340 : 210, 6);
        }
        // blinding core flash
        this.spawnParticle(x, y, { vx: 0, vy: 0, color: '#ffffff', life: 0.25, size: big ? 22 : 14, drag: 0.8 });
        // billowing multicolor nebula cloud that hangs in the air
        for (let i = 0; i < (big ? 26 : 16); i++) {
          const a = rand(TAU), s = rand(60, big ? 340 : 220);
          this.mist(x, y, nebulaColor(rand(TAU), a), { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.9, 1.7), size: rand(12, 22), alphaMul: 0.32, grow: rand(20, 50) });
        }
        // fast bright sparks + shards
        for (let i = 0; i < (big ? 44 : 26); i++) { const a = rand(TAU), s = rand(220, 680); this.spawnParticle(x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, color: choice(['#ffffff', '#e8f4ff', nebulaColor(rand(TAU), a)]), life: rand(0.5, 1.2), size: rand(2.5, 6), drag: 0.9 }); }
        this.debris(x, y, '#ffffff', big ? 28 : 18, 560);
        this.flash('#ffffff', big ? 0.32 : 0.18);
        this.shake(big ? 18 : 10);
        break;
      }
      default: // 'burst' — classic
        this.burst(x, y, baseColor, big ? 60 : 14, big ? 420 : 220, { size: big ? 7 : 4.5 });
        this.debris(x, y, baseColor, big ? 18 : 6, big ? 420 : 280);
        this.shockwave(x, y, baseColor, big ? 260 : 54, big ? 8 : 3);
    }
  }

  // spinning line-shard debris (enemy shells breaking apart)
  debris(x, y, color, count = 6, speed = 260) {
    count = Math.round(count * this.quality);
    for (let i = 0; i < count; i++) {
      const a = rand(TAU);
      const s = rand(speed * 0.4, speed);
      if (this.particles.length >= MAX_PARTICLES * this.quality) return;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.35, 0.75), maxLife: 0.75,
        size: rand(5, 11), color, drag: 0.88, glow: false, gravity: 0,
        line: true, ang: rand(TAU), spin: rand(-12, 12),
      });
    }
  }

  trail(x, y, color, vx = 0, vy = 0) {
    this.spawnParticle(x, y, {
      vx: vx + rand(-20, 20), vy: vy + rand(-20, 20),
      color, life: rand(0.15, 0.4), size: rand(2, 5), drag: 0.85,
    });
  }

  shockwave(x, y, color, maxR = 90, width = 3) {
    this.shockwaves.push({ x, y, r: 8, maxR, color, width, life: 1 });
  }

  text(x, y, str, color = '#ffffff', size = 14) {
    if (this.texts.length > 40) this.texts.shift();
    this.texts.push({ x, y, str, color, size, life: 0.9, vy: -46 });
  }

  update(dt) {
    // particles
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      const dragF = Math.pow(p.drag, dt * 60);
      p.vx *= dragF; p.vy *= dragF;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grow) p.size += p.grow * dt;
      if (p.line) p.ang += p.spin * dt;
    }
    // shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.r += (s.maxR - s.r) * 8 * dt + 60 * dt;
      s.life -= dt * 2.2;
      if (s.life <= 0) this.shockwaves.splice(i, 1);
    }
    // texts
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= 0.92;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    // shake
    this.shakeAmp *= Math.pow(0.001, dt); // fast decay
    if (this.shakeAmp < 0.15) this.shakeAmp = 0;
    this.shakeX = rand(-1, 1) * this.shakeAmp;
    this.shakeY = rand(-1, 1) * this.shakeAmp;
    // flash
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.4);
  }

  draw(ctx, camX, camY) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // particles as glow sprites (or spinning line shards)
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      if (p.line) {
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        const hx = Math.cos(p.ang) * p.size, hy = Math.sin(p.ang) * p.size;
        ctx.beginPath();
        ctx.moveTo(p.x - camX - hx, p.y - camY - hy);
        ctx.lineTo(p.x - camX + hx, p.y - camY + hy);
        ctx.stroke();
        continue;
      }
      const spr = glowSprite(p.color);
      const s = p.size * 6 * (p.grow ? 1 : a); // fog keeps its (growing) size; sparks shrink as they die
      // soft ease-in for fog so clouds bloom rather than pop
      let alpha = a;
      if (p.fadeIn && p.life > p.maxLife - p.fadeIn) alpha = (p.maxLife - p.life) / p.fadeIn;
      ctx.globalAlpha = clamp(alpha, 0, 1) * 0.85 * (p.alphaMul || 1);
      ctx.drawImage(spr, p.x - camX - s / 2, p.y - camY - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    // shockwaves
    for (const s of this.shockwaves) {
      ctx.globalAlpha = clamp(s.life, 0, 1) * 0.8;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * s.life;
      ctx.beginPath();
      ctx.arc(s.x - camX, s.y - camY, s.r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // floating texts (normal composite so they stay readable)
    ctx.save();
    ctx.font = 'bold 14px Consolas, monospace';
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      ctx.globalAlpha = clamp(t.life / 0.9, 0, 1);
      ctx.font = `bold ${t.size}px Consolas, monospace`;
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 8;
      ctx.fillText(t.str, t.x - camX, t.y - camY);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawFlash(ctx, w, h) {
    if (this.flashAlpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.flashAlpha;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

// ---- background: parallax neon grid + drifting data motes ----
export class Background {
  constructor() {
    this.motes = [];
    for (let i = 0; i < 70; i++) {
      this.motes.push({
        x: rand(-2000, 2000), y: rand(-2000, 2000),
        z: rand(0.2, 0.7), // parallax factor
        size: rand(1, 3), phase: rand(TAU), speed: rand(4, 18),
      });
    }
    this.t = 0;
  }

  update(dt) { this.t += dt; }

  draw(ctx, w, h, camX, camY, palette) {
    // base fill
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    grad.addColorStop(0, palette.bgInner);
    grad.addColorStop(1, palette.bgOuter);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // grid (parallax 0.5)
    const gs = 90;
    const px = camX * 0.5, py = camY * 0.5;
    ctx.save();
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    for (let x = -((px % gs) + gs) % gs; x <= w; x += gs) {
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
    }
    for (let y = -((py % gs) + gs) % gs; y <= h; y += gs) {
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.restore();

    // motes
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const sx = ((m.x - camX * m.z) % (w + 200) + (w + 200)) % (w + 200) - 100;
      const sy = ((m.y - camY * m.z + this.t * m.speed) % (h + 200) + (h + 200)) % (h + 200) - 100;
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 2 + m.phase);
      ctx.globalAlpha = 0.12 + 0.18 * pulse;
      const spr = glowSprite(palette.mote);
      const s = m.size * 8 * (0.6 + m.z);
      ctx.drawImage(spr, sx - s / 2, sy - s / 2, s, s);
    }
    ctx.restore();
  }
}
