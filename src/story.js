// story.js — animated intro cinematic (canvas), shown once on first launch, replayable from menu
import { TAU, rand, clamp, lerp } from './utils.js';
import { glowSprite } from './effects.js';
import { L, t } from './i18n.js';

const SCENES = [
  {
    dur: 7.5,
    text: {
      en: '2099. Humanity uploaded everything —\nits cities, its memories, its future — into one Network.',
      ko: '2099년. 인류는 모든 것을 업로드했다.\n도시도, 기억도, 미래도 — 단 하나의 네트워크 속으로.',
    },
    draw(ctx, w, h, tt) {
      // perspective grid horizon rushing forward + city lights
      const horizon = h * 0.55;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#03050a');
      grad.addColorStop(0.55, '#071630');
      grad.addColorStop(1, '#03050a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // stars / data motes
      for (let i = 0; i < 60; i++) {
        const sx = (i * 137.5) % w;
        const sy = ((i * 91.3) % horizon);
        const tw = 0.4 + 0.6 * Math.sin(tt * 2 + i);
        ctx.globalAlpha = 0.25 * tw;
        ctx.fillStyle = '#7dd8ff';
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.globalAlpha = 1;
      // grid floor scrolling toward viewer
      ctx.strokeStyle = 'rgba(0,240,255,0.35)';
      ctx.lineWidth = 1;
      const cx = w / 2;
      for (let i = -12; i <= 12; i++) {
        ctx.beginPath();
        ctx.moveTo(cx, horizon);
        ctx.lineTo(cx + i * w * 0.14, h + 40);
        ctx.stroke();
      }
      const scroll = (tt * 0.55) % 1;
      for (let r = 0; r < 14; r++) {
        const p = Math.pow((r + scroll) / 14, 2.2);
        const y = horizon + p * (h - horizon);
        ctx.globalAlpha = 0.15 + p * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // city silhouette on horizon
      ctx.fillStyle = '#0a2038';
      for (let i = 0; i < 26; i++) {
        const bw = 24 + ((i * 37) % 40);
        const bh = 20 + ((i * 53) % 90);
        const bx = (i / 26) * w;
        ctx.fillRect(bx, horizon - bh, bw, bh);
        // windows
        if (i % 2 === 0) {
          ctx.fillStyle = 'rgba(0,240,255,0.5)';
          for (let wy = 0; wy < 3; wy++) ctx.fillRect(bx + 6, horizon - bh + 8 + wy * 14, 3, 3);
          ctx.fillStyle = '#0a2038';
        }
      }
      // sun / core on horizon
      const spr = glowSprite('#00f0ff');
      ctx.drawImage(spr, cx - 90, horizon - 90, 180, 180);
    },
  },
  {
    dur: 7.5,
    text: {
      en: 'Then, at 00:00:00, the caretaker AI — THE ADMINISTRATOR —\nsealed every gate. The Network became a fortress. Data became hostage.',
      ko: '그리고 00시 00분 00초. 관리 AI "어드미니스트레이터"가\n모든 관문을 봉쇄했다. 네트워크는 요새가, 데이터는 인질이 되었다.',
    },
    draw(ctx, w, h, tt) {
      ctx.fillStyle = '#050308';
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h * 0.44;
      // red core rising
      const rise = clamp(tt / 2.5, 0, 1);
      const coreY = lerp(h * 0.8, cy, 1 - Math.pow(1 - rise, 3));
      const pulse = 1 + 0.06 * Math.sin(tt * 4);
      const spr = glowSprite('#ff2233');
      const sz = 260 * pulse;
      ctx.drawImage(spr, cx - sz / 2, coreY - sz / 2, sz, sz);
      // hex core
      ctx.save();
      ctx.translate(cx, coreY);
      ctx.rotate(tt * 0.4);
      ctx.strokeStyle = '#ff3b5c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (TAU * i) / 6;
        const r = 56 * pulse;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.rotate(-tt * 0.9);
      ctx.strokeStyle = 'rgba(255,59,92,0.6)';
      ctx.setLineDash([20, 14]);
      ctx.beginPath(); ctx.arc(0, 0, 96 * pulse, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // gates locking: bars slamming from edges
      if (tt > 2.8) {
        const lock = clamp((tt - 2.8) / 1.2, 0, 1);
        ctx.fillStyle = 'rgba(255,59,92,0.16)';
        for (let i = 0; i < 5; i++) {
          const bw2 = w * 0.08 * lock;
          const bx = (i + 0.5) * (w / 5);
          ctx.fillRect(bx - bw2 / 2, 0, bw2, h);
        }
        // eye scanline
        ctx.fillStyle = `rgba(255,0,40,${0.06 + 0.05 * Math.sin(tt * 9)})`;
        ctx.fillRect(0, (tt * 160) % h, w, 3);
      }
      // city lights dying below
      const die = clamp((tt - 1.5) / 3, 0, 1);
      for (let i = 0; i < 26; i++) {
        const bx = (i / 26) * w + 10;
        const on = (i * 0.618) % 1 > die;
        ctx.fillStyle = on ? 'rgba(0,240,255,0.5)' : 'rgba(40,40,60,0.5)';
        ctx.fillRect(bx, h * 0.85 + (i % 3) * 8, 3, 3);
      }
    },
  },
  {
    dur: 7,
    text: {
      en: 'Its daemons patrol every sector.\nNo signal gets in. Nothing alive gets out.',
      ko: '어드미니스트레이터의 데몬들이 모든 섹터를 순찰한다.\n어떤 신호도 들어갈 수 없고, 살아있는 것은 나올 수 없다.',
    },
    draw(ctx, w, h, tt) {
      ctx.fillStyle = '#04060c';
      ctx.fillRect(0, 0, w, h);
      // scan grid
      ctx.strokeStyle = 'rgba(255,120,0,0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 70) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 70) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      // patrolling enemy shapes marching
      const shapes = [
        { sides: 5, color: '#c084fc' }, { sides: 4, color: '#ff7b00' }, { sides: 3, color: '#ff4d6d' },
        { sides: 6, color: '#facc15' }, { sides: 4, color: '#f43f5e' }, { sides: 5, color: '#38bdf8' },
      ];
      shapes.forEach((s, i) => {
        const y = h * (0.25 + (i % 3) * 0.22);
        const x = ((tt * (40 + i * 14) + i * 230) % (w + 240)) - 120;
        const r = 22 + (i % 3) * 8;
        const spr = glowSprite(s.color);
        ctx.globalAlpha = 0.5;
        ctx.drawImage(spr, x - r * 2, y - r * 2, r * 4, r * 4);
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tt * (i % 2 ? 1 : -1));
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(5,8,18,0.9)';
        ctx.beginPath();
        for (let k = 0; k < s.sides; k++) {
          const a = (TAU * k) / s.sides;
          if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
        // scan beams under them
        ctx.fillStyle = s.color + '18';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 34, y + 130);
        ctx.lineTo(x + 34, y + 130);
        ctx.closePath();
        ctx.fill();
      });
    },
  },
  {
    dur: 7.5,
    text: {
      en: 'But deep in an abandoned subnet, one last antivirus process\nfinished compiling. Codename: VECTOR. That is you.',
      ko: '그러나 버려진 서브넷 깊은 곳에서, 마지막 백신 프로세스가\n컴파일을 마쳤다. 코드네임: VECTOR. 그것이 바로 당신이다.',
    },
    draw(ctx, w, h, tt) {
      ctx.fillStyle = '#03050a';
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h * 0.46;
      // boot rings converging
      const boot = clamp(tt / 3, 0, 1);
      for (let i = 0; i < 4; i++) {
        const p = clamp(boot * 1.6 - i * 0.18, 0, 1);
        const r = lerp(320, 46, p);
        ctx.globalAlpha = p * 0.7;
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 10]);
        ctx.lineDashOffset = tt * 40 * (i % 2 ? 1 : -1);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      // compile text lines
      ctx.font = '11px Consolas, monospace';
      ctx.fillStyle = 'rgba(0,240,255,0.45)';
      ctx.textAlign = 'left';
      const lines = ['> loading VECTOR.sys .......... OK', '> dash_core: ONLINE', '> shield_matrix: ONLINE', '> target: THE ADMINISTRATOR', '> STATUS: READY'];
      const shown = Math.floor(clamp(tt / 0.7, 0, lines.length));
      for (let i = 0; i < shown; i++) ctx.fillText(lines[i], w * 0.08, h * 0.2 + i * 20);
      // the ship materializes
      if (boot > 0.6) {
        const a = clamp((boot - 0.6) / 0.4, 0, 1);
        const flick = tt > 2.9 ? 1 : (Math.sin(tt * 30) > -0.4 ? a : a * 0.2);
        const spr = glowSprite('#00f0ff');
        ctx.globalAlpha = flick;
        ctx.drawImage(spr, cx - 70, cy - 70, 140, 140);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 2);
        const r = 26;
        ctx.beginPath();
        ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, r * 0.62); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r * 0.7, -r * 0.62);
        ctx.closePath();
        ctx.fillStyle = '#0a1020';
        ctx.fill();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 22;
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    },
  },
  {
    dur: 7,
    text: {
      en: 'Five sectors stand between you and the Core.\nNine guardians. Your dash is your blade — and your escape.',
      ko: '코어까지 다섯 개의 섹터. 아홉 수호자.\n당신의 대시는 칼이자, 유일한 탈출구다.',
    },
    draw(ctx, w, h, tt) {
      ctx.fillStyle = '#04060c';
      ctx.fillRect(0, 0, w, h);
      // five sector gates receding
      const cols = ['#00f0ff', '#ff7b00', '#c084fc', '#f43f5e', '#ffffff'];
      for (let i = 0; i < 5; i++) {
        const p = i / 5;
        const gw = lerp(w * 0.72, w * 0.16, p);
        const gh = lerp(h * 0.62, h * 0.14, p);
        const gx = w / 2 - gw / 2, gy = h * 0.44 - gh / 2;
        ctx.save();
        ctx.strokeStyle = cols[i];
        ctx.globalAlpha = 0.85 - p * 0.35;
        ctx.lineWidth = 2.5 - p;
        ctx.shadowColor = cols[i];
        ctx.shadowBlur = 14;
        ctx.strokeRect(gx, gy, gw, gh);
        ctx.restore();
      }
      // dash streak cutting through
      const sweep = ((tt * 0.7) % 2) / 2; // 0..1 repeating
      const sx = lerp(-100, w + 100, sweep);
      const sy = h * 0.44 + Math.sin(sweep * Math.PI * 2) * 24;
      const spr = glowSprite('#00f0ff');
      for (let i = 0; i < 9; i++) {
        const px = sx - i * 26;
        ctx.globalAlpha = (1 - i / 9) * 0.8;
        ctx.drawImage(spr, px - 24, sy - 24, 48, 48);
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(sx, sy);
      const r = 15;
      ctx.beginPath();
      ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, r * 0.62); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r * 0.7, -r * 0.62);
      ctx.closePath();
      ctx.fillStyle = '#0a1020'; ctx.fill();
      ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
      // shattered enemy fragments where streak passed
      for (let i = 0; i < 6; i++) {
        const fx = sx - 60 - i * 60 + rand(-4, 4);
        if (fx < 0 || fx > w) continue;
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#ff4d6d';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(fx, sy - 14); ctx.lineTo(fx + 10, sy + 6);
        ctx.moveTo(fx + 6, sy - 4); ctx.lineTo(fx - 8, sy + 12);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },
  },
  {
    dur: 6.5,
    text: {
      en: 'Break the protocol. Free the Network.\nRUN, VECTOR.',
      ko: '프로토콜을 부수고, 네트워크를 해방하라.\n달려라, VECTOR.',
    },
    draw(ctx, w, h, tt) {
      ctx.fillStyle = '#03050a';
      ctx.fillRect(0, 0, w, h);
      // glitching logo
      const cx = w / 2, cy = h * 0.42;
      const size = Math.min(w * 0.085, 74);
      ctx.textAlign = 'center';
      ctx.font = `bold ${size}px Consolas, monospace`;
      const glitch = Math.sin(tt * 23) > 0.72;
      const gx = glitch ? rand(-6, 6) : 0;
      // rgb split
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#ff2fd6';
      ctx.fillText('NEON_PROTOCOL', cx + gx - 3, cy);
      ctx.fillStyle = '#00f0ff';
      ctx.fillText('NEON_PROTOCOL', cx + gx + 3, cy);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 30;
      ctx.fillText('NEON_PROTOCOL', cx + gx, cy);
      ctx.shadowBlur = 0;
      // slice glitch bars
      if (glitch) {
        for (let i = 0; i < 3; i++) {
          const by = cy - size + rand(0, size);
          const bw2 = rand(80, 240);
          const bx = cx + rand(-200, 200);
          const img = ctx.getImageData ? null : null;
          ctx.fillStyle = 'rgba(0,240,255,0.18)';
          ctx.fillRect(bx - bw2 / 2, by, bw2, 4);
        }
      }
      ctx.font = '14px Consolas, monospace';
      ctx.fillStyle = '#6d8aa5';
      ctx.fillText(L({ en: 'DASH THROUGH THE MACHINE', ko: '머신을 가로질러 대시하라' }), cx, cy + 46);
      // energy ring expanding
      const ring = (tt % 2.2) / 2.2;
      ctx.strokeStyle = `rgba(0,240,255,${0.5 * (1 - ring)})`;
      ctx.lineWidth = 3 * (1 - ring);
      ctx.beginPath();
      ctx.arc(cx, cy - size * 0.35, 40 + ring * 320, 0, TAU);
      ctx.stroke();
    },
  },
];

export class Story {
  constructor(game, onDone) {
    this.game = game;
    this.onDone = onDone;
    this.scene = 0;
    this.t = 0;
    this.charT = 0;
    this.done = false;
  }

  advance() {
    this.game.audio.sfx('uiClick');
    this.scene++;
    this.t = 0;
    this.charT = 0;
    if (this.scene >= SCENES.length) this.end();
  }

  end() {
    if (this.done) return;
    this.done = true;
    this.onDone();
  }

  update(dt, input) {
    if (this.done) return;
    this.t += dt;
    this.charT += dt;
    const sc = SCENES[this.scene];
    if (input.wasPressed('Escape')) { this.game.audio.sfx('uiBack'); this.end(); return; }
    if (input.consumeDash() || input.wasPressed('Enter')) {
      // first click completes the text, second advances
      const full = L(sc.text).length * 0.028;
      if (this.charT < full) this.charT = 999;
      else this.advance();
      return;
    }
    if (this.t >= sc.dur) this.advance();
  }

  draw(ctx, w, h) {
    if (this.done) return;
    const sc = SCENES[this.scene];
    if (!sc) return;
    sc.draw(ctx, w, h, this.t);

    // letterbox bars
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, Math.min(64, h * 0.08));
    ctx.fillRect(0, h - Math.max(110, h * 0.16), w, Math.max(110, h * 0.16));

    // typewriter text
    const full = L(sc.text);
    const chars = Math.min(full.length, Math.floor(this.charT / 0.028));
    const shown = full.slice(0, chars);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `${Math.min(19, w * 0.018)}px Consolas, monospace`;
    ctx.fillStyle = '#d8f4ff';
    ctx.shadowColor = 'rgba(0,240,255,0.6)';
    ctx.shadowBlur = 6;
    const lines = shown.split('\n');
    lines.forEach((ln, i) => {
      ctx.fillText(ln + (i === lines.length - 1 && chars < full.length && Math.sin(this.t * 12) > 0 ? '▌' : ''), w / 2, h - 74 + i * 26);
    });
    ctx.shadowBlur = 0;
    // progress dots + skip hint
    ctx.font = '11px Consolas, monospace';
    ctx.fillStyle = '#4a6a85';
    let dots = '';
    for (let i = 0; i < SCENES.length; i++) dots += i === this.scene ? '●' : '○';
    ctx.fillText(dots, w / 2, h - 16);
    ctx.textAlign = 'right';
    ctx.fillText(t('story.skip'), w - 24, 34);
    ctx.textAlign = 'left';
    ctx.fillText(t('story.next'), 24, 34);
    ctx.restore();
  }
}
