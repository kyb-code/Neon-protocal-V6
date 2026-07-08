// minigames.js — 10 bonus-stage minigames, each a different genre. Win → rubies.
import { TAU, rand, randInt, clamp, lerp, choice, dist2, sample } from './utils.js';
import { glowSprite } from './effects.js';
import { L, t } from './i18n.js';

// ---------------------------------------------------------------- host
export class MinigameHost {
  constructor(game, def, onEnd) {
    this.game = game;
    this.def = def;
    this.onEnd = onEnd;
    this.audio = game.audio;
    this.phase = 'intro'; // intro | play | result
    this.time = 0;
    this.playTime = 0;
    this.timeMul = game.meta.bonuses().minigameTime || 1; // Time Dilator: >1 = more time
    this.result = null;
    this.resultT = 0;
    this.pf = { x: 0, y: 0, w: 0, h: 0 };
    this.impl = def.create(this);
  }

  limit(sec) { return sec * this.timeMul; }

  finish(won) {
    if (this.phase === 'result') return;
    this.phase = 'result';
    this.result = won;
    this.resultT = 0;
    this.audio.sfx(won ? 'unlock' : 'defeat');
  }

  update(dt, input, w, h) {
    // playfield: centered
    const pw = Math.min(w * 0.86, 860), ph = Math.min(h * 0.72, 540);
    this.pf = { x: (w - pw) / 2, y: (h - ph) / 2 + 14, w: pw, h: ph };
    this.time += dt;

    if (this.phase === 'intro') {
      if (input.consumeDash() || input.wasPressed('Enter')) {
        this.phase = 'play';
        this.audio.sfx('uiClick');
        if (this.impl.start) this.impl.start(this);
      }
    } else if (this.phase === 'play') {
      this.playTime += dt;
      if (input.wasPressed('Escape')) { this.finish(false); return; }
      this.impl.update(dt, input, this);
    } else {
      this.resultT += dt;
      if (this.resultT > 1.2 && (input.consumeDash() || input.wasPressed('Enter'))) {
        this.onEnd(this.result);
      }
    }
  }

  draw(ctx, w, h) {
    // dim backdrop
    ctx.fillStyle = 'rgba(3,5,10,0.88)';
    ctx.fillRect(0, 0, w, h);
    const pf = this.pf;

    // header
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px Consolas, monospace';
    ctx.fillStyle = '#ffe94a';
    ctx.shadowColor = '#ffe94a';
    ctx.shadowBlur = 14;
    ctx.fillText('◆ ' + t('mg.bonus') + ' — ' + L(this.def.name) + ' ◆', w / 2, pf.y - 26);
    ctx.shadowBlur = 0;
    ctx.restore();

    // playfield frame
    ctx.save();
    ctx.strokeStyle = 'rgba(255,233,74,0.55)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ffe94a';
    ctx.shadowBlur = 12;
    ctx.strokeRect(pf.x, pf.y, pf.w, pf.h);
    ctx.shadowBlur = 0;
    ctx.restore();

    if (this.phase === 'intro') {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '52px Consolas, monospace';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 20;
      ctx.fillText(this.def.icon, w / 2, pf.y + pf.h * 0.32);
      ctx.font = '15px Consolas, monospace';
      ctx.fillStyle = '#d8f4ff';
      ctx.shadowBlur = 0;
      const lines = L(this.def.desc).split('\n');
      lines.forEach((ln, i) => ctx.fillText(ln, w / 2, pf.y + pf.h * 0.46 + i * 24));
      ctx.font = '13px Consolas, monospace';
      ctx.fillStyle = '#ffe94a';
      ctx.fillText(t('mg.reward', { n: this.game.minigameReward() }), w / 2, pf.y + pf.h * 0.72);
      const blink = Math.sin(this.time * 5) > 0;
      if (blink) {
        ctx.fillStyle = '#6d8aa5';
        ctx.fillText(t('mg.start_hint'), w / 2, pf.y + pf.h * 0.84);
      }
      ctx.restore();
      return;
    }

    if (this.phase === 'play') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(pf.x, pf.y, pf.w, pf.h);
      ctx.clip();
      this.impl.draw(ctx, this);
      ctx.restore();
      // hud line below field
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '13px Consolas, monospace';
      ctx.fillStyle = '#6d8aa5';
      ctx.fillText((this.impl.hud ? this.impl.hud(this) : '') + '   [ESC] ' + t('mg.giveup'), this.pf.x + this.pf.w / 2, pf.y + pf.h + 24);
      ctx.restore();
      return;
    }

    // result
    ctx.save();
    ctx.textAlign = 'center';
    const won = this.result;
    ctx.font = 'bold 40px Consolas, monospace';
    ctx.fillStyle = won ? '#4aff8f' : '#ff3b5c';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 24;
    ctx.fillText(won ? t('mg.win') : t('mg.lose'), w / 2, pf.y + pf.h * 0.42);
    ctx.shadowBlur = 0;
    ctx.font = '18px Consolas, monospace';
    ctx.fillStyle = won ? '#ff5e8a' : '#d8f4ff';
    ctx.fillText(won ? `+${this.game.minigameReward()} ◆   +30 ⬡` : '+1 ◆   +10 ⬡', w / 2, pf.y + pf.h * 0.55);
    if (this.resultT > 1.2 && Math.sin(this.time * 5) > 0) {
      ctx.font = '13px Consolas, monospace';
      ctx.fillStyle = '#6d8aa5';
      ctx.fillText(t('mg.continue_hint'), w / 2, pf.y + pf.h * 0.72);
    }
    ctx.restore();
  }
}

// helpers ------------------------------------------------------------
function mouseIn(input, host) {
  const pf = host.pf;
  return { x: clamp(input.mouseX, pf.x, pf.x + pf.w), y: clamp(input.mouseY, pf.y, pf.y + pf.h) };
}
function glowRect(ctx, x, y, w, h, color) {
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = 12;
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = color + '22';
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}
function glowDot(ctx, x, y, r, color) {
  const spr = glowSprite(color);
  ctx.drawImage(spr, x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, TAU); ctx.fill();
}

// ---------------------------------------------------------------- 1. rhythm
class RhythmGame {
  constructor(host) {
    this.lanes = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
    this.labels = ['D', 'F', 'J', 'K'];
    this.colors = ['#00f0ff', '#4aff8f', '#ff2fd6', '#ffe94a'];
    this.notes = [];
    this.hits = 0; this.misses = 0; this.total = 0;
    this.flash = [0, 0, 0, 0];
    this.lastBeat = -1;
  }
  start(host) {
    const bpm = 112, iv = 60 / bpm;
    let n = 0;
    for (let beat = 4; beat < 60 && n < 44; beat++) {
      if (beat % 8 === 7) continue;               // breathing rests
      const cnt = (beat % 16 === 12) ? 2 : 1;     // occasional chords
      const ls = sample([0, 1, 2, 3], cnt);
      for (const lane of ls) { this.notes.push({ t: beat * iv, lane, state: 'wait' }); n++; }
    }
    this.total = this.notes.length;
    this.iv = iv;
  }
  update(dt, input, host) {
    const now = host.playTime;
    // metronome
    const beat = Math.floor(now / this.iv);
    if (beat !== this.lastBeat) { this.lastBeat = beat; host.audio.sfx('telegraph'); }
    for (let i = 0; i < 4; i++) this.flash[i] = Math.max(0, this.flash[i] - dt * 6);
    // key hits
    for (let i = 0; i < 4; i++) {
      if (input.wasPressed(this.lanes[i])) {
        this.flash[i] = 1;
        let best = null, bestD = 0.18;
        for (const nt of this.notes) {
          if (nt.state !== 'wait' || nt.lane !== i) continue;
          const d = Math.abs(nt.t - now);
          if (d < bestD) { bestD = d; best = nt; }
        }
        if (best) {
          best.state = bestD < 0.07 ? 'perfect' : 'hit';
          this.hits++;
          host.audio.sfx('chain');
        } else {
          host.audio.sfx('denied');
        }
      }
    }
    // misses
    for (const nt of this.notes) {
      if (nt.state === 'wait' && now > nt.t + 0.18) { nt.state = 'miss'; this.misses++; host.audio.sfx('hit'); }
    }
    // end
    if (now > this.notes[this.notes.length - 1].t + 1.0) {
      host.finish(this.hits / this.total >= 0.65);
    }
  }
  hud(host) { return `HIT ${this.hits}/${this.total}  (≥65%)`; }
  draw(ctx, host) {
    const pf = host.pf, now = host.playTime;
    const laneW = Math.min(90, pf.w / 6);
    const x0 = pf.x + pf.w / 2 - laneW * 2;
    const hitY = pf.y + pf.h - 70;
    const speed = (pf.h - 100) / 1.5; // px per sec, 1.5s approach
    for (let i = 0; i < 4; i++) {
      const lx = x0 + i * laneW;
      ctx.fillStyle = `rgba(255,255,255,${0.03 + this.flash[i] * 0.1})`;
      ctx.fillRect(lx + 3, pf.y, laneW - 6, pf.h);
      // receptor
      ctx.save();
      ctx.strokeStyle = this.colors[i];
      ctx.lineWidth = this.flash[i] > 0.5 ? 5 : 2.5;
      ctx.shadowColor = this.colors[i];
      ctx.shadowBlur = 10 + this.flash[i] * 20;
      ctx.strokeRect(lx + 8, hitY - 10, laneW - 16, 20);
      ctx.restore();
      ctx.fillStyle = '#6d8aa5';
      ctx.font = 'bold 15px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.labels[i], lx + laneW / 2, hitY + 42);
    }
    // notes
    for (const nt of this.notes) {
      if (nt.state !== 'wait') continue;
      const y = hitY - (nt.t - now) * speed;
      if (y < pf.y - 20 || y > pf.y + pf.h + 20) continue;
      const lx = x0 + nt.lane * laneW;
      ctx.save();
      ctx.shadowColor = this.colors[nt.lane];
      ctx.shadowBlur = 14;
      ctx.fillStyle = this.colors[nt.lane];
      ctx.fillRect(lx + 10, y - 7, laneW - 20, 14);
      ctx.restore();
    }
    // accuracy bar
    ctx.fillStyle = '#6d8aa5'; ctx.font = '12px Consolas'; ctx.textAlign = 'left';
  }
}

// ---------------------------------------------------------------- 2. catcher
class CatcherGame {
  constructor(host) { this.items = []; this.caught = 0; this.virus = 0; this.spawnT = 0; }
  update(dt, input, host) {
    const pf = host.pf;
    this.px = mouseIn(input, host).x;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = rand(0.35, 0.7);
      this.items.push({ x: rand(pf.x + 30, pf.x + pf.w - 30), y: pf.y - 10, v: rand(150, 240) + host.playTime * 4, virus: Math.random() < 0.32 });
    }
    const py = pf.y + pf.h - 34;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.y += it.v * dt;
      if (it.y > py - 8 && it.y < py + 20 && Math.abs(it.x - this.px) < 46) {
        this.items.splice(i, 1);
        if (it.virus) { this.virus++; host.audio.sfx('playerHit'); }
        else { this.caught++; host.audio.sfx('pickup'); }
        continue;
      }
      if (it.y > pf.y + pf.h + 16) this.items.splice(i, 1);
    }
    if (this.caught >= 15) host.finish(true);
    if (this.virus >= 3 || host.playTime > host.limit(40)) host.finish(this.caught >= 15);
  }
  hud(host) { return `DATA ${this.caught}/15   VIRUS ${this.virus}/3   ${Math.max(0, host.limit(40) - host.playTime).toFixed(0)}s`; }
  draw(ctx, host) {
    const pf = host.pf;
    const py = pf.y + pf.h - 34;
    glowRect(ctx, this.px - 46, py, 92, 12, '#00f0ff');
    for (const it of this.items) {
      if (it.virus) {
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.rotate(host.time * 3);
        ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 2;
        ctx.shadowColor = '#ff3b5c'; ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, -10); ctx.lineTo(9, 7); ctx.lineTo(-9, 7); ctx.closePath();
        ctx.stroke();
        ctx.restore();
      } else {
        glowDot(ctx, it.x, it.y, 6, '#4aff8f');
      }
    }
  }
}

// ---------------------------------------------------------------- 3. memory
class MemoryGame {
  constructor(host) {
    this.round = 0; this.lens = [3, 4, 5, 6, 7];
    this.seq = []; this.showIdx = -1; this.showT = 0;
    this.inputIdx = 0; this.mode = 'show'; this.lives = 2;
    this.cellFlash = new Array(9).fill(0);
    this.clickedCell = -1;
  }
  start(host) { this.newRound(host); }
  newRound(host) {
    const len = this.lens[this.round];
    this.seq = [];
    for (let i = 0; i < len; i++) this.seq.push(randInt(0, 8));
    this.mode = 'show'; this.showIdx = -1; this.showT = 0.8; this.inputIdx = 0;
  }
  cellRect(i, host) {
    const pf = host.pf;
    const size = Math.min(pf.h - 90, 330);
    const cs = size / 3;
    const x0 = pf.x + pf.w / 2 - size / 2, y0 = pf.y + (pf.h - size) / 2;
    return { x: x0 + (i % 3) * cs + 6, y: y0 + Math.floor(i / 3) * cs + 6, w: cs - 12, h: cs - 12 };
  }
  update(dt, input, host) {
    for (let i = 0; i < 9; i++) this.cellFlash[i] = Math.max(0, this.cellFlash[i] - dt * 3);
    if (this.mode === 'show') {
      this.showT -= dt;
      if (this.showT <= 0) {
        this.showIdx++;
        if (this.showIdx >= this.seq.length) { this.mode = 'input'; }
        else {
          this.cellFlash[this.seq[this.showIdx]] = 1;
          host.audio.sfx('telegraph');
          this.showT = 0.55;
        }
      }
    } else if (this.mode === 'input') {
      if (input.consumeDash()) {
        for (let i = 0; i < 9; i++) {
          const r = this.cellRect(i, host);
          if (input.mouseX >= r.x && input.mouseX <= r.x + r.w && input.mouseY >= r.y && input.mouseY <= r.y + r.h) {
            this.cellFlash[i] = 1;
            if (i === this.seq[this.inputIdx]) {
              this.inputIdx++;
              host.audio.sfx('pickup');
              if (this.inputIdx >= this.seq.length) {
                this.round++;
                host.audio.sfx('waveClear');
                if (this.round >= this.lens.length) { host.finish(true); return; }
                this.newRound(host);
              }
            } else {
              this.lives--;
              host.audio.sfx('denied');
              if (this.lives < 0) { host.finish(false); return; }
              this.newRound(host);
            }
            break;
          }
        }
      }
    }
  }
  hud(host) { return `ROUND ${this.round + 1}/5   LIVES ${Math.max(0, this.lives + 1)}`; }
  draw(ctx, host) {
    for (let i = 0; i < 9; i++) {
      const r = this.cellRect(i, host);
      const f = this.cellFlash[i];
      ctx.save();
      ctx.strokeStyle = f > 0 ? '#ffffff' : '#00f0ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 8 + f * 24;
      ctx.fillStyle = `rgba(0,240,255,${0.05 + f * 0.5})`;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    }
    ctx.textAlign = 'center';
    ctx.font = '14px Consolas, monospace';
    ctx.fillStyle = this.mode === 'show' ? '#ffe94a' : '#4aff8f';
    ctx.fillText(this.mode === 'show' ? t('mg.memory_watch') : t('mg.memory_repeat'), host.pf.x + host.pf.w / 2, host.pf.y + 28);
  }
}

// ---------------------------------------------------------------- 4. maze
class MazeGame {
  constructor(host) {
    this.stage = 0; this.lives = 3; this.started = false;
    // corridors in unit coords (x,y,w,h), start in first rect, goal = last rect
    this.layouts = [
      [[0.02, 0.42, 0.2, 0.16], [0.18, 0.42, 0.1, 0.5], [0.18, 0.82, 0.5, 0.12], [0.6, 0.3, 0.1, 0.64], [0.6, 0.3, 0.38, 0.14]],
      [[0.02, 0.08, 0.14, 0.16], [0.06, 0.08, 0.09, 0.8], [0.06, 0.76, 0.4, 0.13], [0.38, 0.3, 0.1, 0.6], [0.38, 0.3, 0.36, 0.12], [0.66, 0.3, 0.09, 0.6], [0.66, 0.78, 0.32, 0.14]],
      [[0.02, 0.8, 0.16, 0.14], [0.1, 0.5, 0.08, 0.44], [0.1, 0.5, 0.34, 0.1], [0.36, 0.16, 0.08, 0.44], [0.36, 0.16, 0.34, 0.09], [0.62, 0.16, 0.08, 0.5], [0.62, 0.56, 0.24, 0.1], [0.78, 0.56, 0.08, 0.34], [0.78, 0.84, 0.2, 0.12]],
    ];
  }
  rects(host) {
    const pf = host.pf;
    return this.layouts[this.stage].map((r) => ({ x: pf.x + r[0] * pf.w, y: pf.y + r[1] * pf.h, w: r[2] * pf.w, h: r[3] * pf.h }));
  }
  update(dt, input, host) {
    if (host.playTime > host.limit(45)) { host.finish(false); return; }
    const rs = this.rects(host);
    const mx = input.mouseX, my = input.mouseY;
    const inside = rs.some((r) => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h);
    const startR = rs[0], goalR = rs[rs.length - 1];
    const inStart = mx >= startR.x && mx <= startR.x + startR.w && my >= startR.y && my <= startR.y + startR.h;
    const inGoal = mx >= goalR.x && mx <= goalR.x + goalR.w && my >= goalR.y && my <= goalR.y + goalR.h;
    if (!this.started) {
      if (inStart) { this.started = true; host.audio.sfx('uiClick'); }
      return;
    }
    if (!inside) {
      this.lives--;
      this.started = false;
      host.audio.sfx('playerHit');
      if (this.lives <= 0) host.finish(false);
      return;
    }
    if (inGoal) {
      this.stage++;
      this.started = false;
      host.audio.sfx('waveClear');
      if (this.stage >= this.layouts.length) host.finish(true);
    }
  }
  hud(host) { return `STAGE ${this.stage + 1}/3   LIVES ${this.lives}   ${Math.max(0, host.limit(45) - host.playTime).toFixed(0)}s`; }
  draw(ctx, host) {
    const rs = this.rects(host);
    rs.forEach((r, i) => {
      const col = i === 0 ? '#4aff8f' : i === rs.length - 1 ? '#ffe94a' : '#00f0ff';
      glowRect(ctx, r.x, r.y, r.w, r.h, col);
    });
    ctx.textAlign = 'center';
    ctx.font = '12px Consolas, monospace';
    const s = rs[0], g = rs[rs.length - 1];
    ctx.fillStyle = '#4aff8f'; ctx.fillText('START', s.x + s.w / 2, s.y + s.h / 2 + 4);
    ctx.fillStyle = '#ffe94a'; ctx.fillText('GOAL', g.x + g.w / 2, g.y + g.h / 2 + 4);
    if (!this.started) {
      ctx.fillStyle = '#6d8aa5';
      ctx.font = '13px Consolas, monospace';
      ctx.fillText(t('mg.maze_hint'), host.pf.x + host.pf.w / 2, host.pf.y + 24);
    }
    // cursor
    glowDot(ctx, mouseIn({ mouseX: host.game.input.mouseX, mouseY: host.game.input.mouseY }, host).x, mouseIn({ mouseX: host.game.input.mouseX, mouseY: host.game.input.mouseY }, host).y, 5, this.started ? '#00f0ff' : '#6d8aa5');
  }
}

// ---------------------------------------------------------------- 5. typing
const TYPE_WORDS = ['FIREWALL', 'KERNEL', 'DAEMON', 'PACKET', 'CIPHER', 'BUFFER', 'SOCKET', 'VECTOR', 'PROXY', 'CACHE', 'MALWARE', 'BINARY', 'ROUTER', 'SYNTAX', 'THREAD', 'MUTEX', 'STACK', 'ARRAY', 'TOKEN', 'SHELL'];
class TypingGame {
  constructor(host) { this.words = []; this.killed = 0; this.leaked = 0; this.spawnT = 0.5; this.target = null; }
  update(dt, input, host) {
    const pf = host.pf;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.words.length < 5) {
      this.spawnT = rand(1.4, 2.4) - Math.min(0.9, host.playTime * 0.02);
      const w = choice(TYPE_WORDS.filter((x) => !this.words.some((yw) => yw.text === x)));
      if (w) this.words.push({ text: w, done: 0, x: rand(pf.x + 80, pf.x + pf.w - 80), y: pf.y - 10, v: rand(26, 40) + host.playTime * 0.6 });
    }
    // typed letters
    for (const code of input.pressedQueue) {
      if (!code.startsWith('Key')) continue;
      const ch = code.slice(3);
      if (this.target && this.target.done < this.target.text.length && this.target.text[this.target.done] === ch) {
        this.target.done++;
        host.audio.sfx('pickup');
      } else {
        // switch target: pick the lowest word starting with ch; old target's progress resets
        const cand = this.words
          .filter((w2) => w2 !== this.target && w2.text[0] === ch)
          .sort((a, b) => b.y - a.y)[0];
        if (cand) {
          if (this.target) this.target.done = 0;
          this.target = cand;
          cand.done = 1;
          host.audio.sfx('pickup');
        } else {
          host.audio.sfx('denied'); // wrong key: current progress is kept, just no advance
        }
      }
      if (this.target && this.target.done >= this.target.text.length) {
        this.killed++;
        host.audio.sfx('kill');
        this.words.splice(this.words.indexOf(this.target), 1);
        this.target = null;
      }
    }
    for (let i = this.words.length - 1; i >= 0; i--) {
      const w2 = this.words[i];
      w2.y += w2.v * dt;
      if (w2.y > pf.y + pf.h - 14) {
        this.words.splice(i, 1);
        if (this.target === w2) this.target = null;
        this.leaked++;
        host.audio.sfx('playerHit');
      }
    }
    if (this.killed >= 12) host.finish(true);
    if (this.leaked >= 3) host.finish(false);
  }
  hud() { return `PURGED ${this.killed}/12   LEAKED ${this.leaked}/3`; }
  draw(ctx, host) {
    ctx.textAlign = 'center';
    for (const w2 of this.words) {
      ctx.font = 'bold 17px Consolas, monospace';
      const full = w2.text;
      const doneStr = full.slice(0, w2.done);
      const restStr = full.slice(w2.done);
      const tw = ctx.measureText(full).width;
      ctx.save();
      if (this.target === w2) { ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 12; }
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffe94a';
      ctx.fillText(doneStr, w2.x - tw / 2, w2.y);
      ctx.fillStyle = this.target === w2 ? '#ffffff' : '#8aa8c0';
      ctx.fillText(restStr, w2.x - tw / 2 + ctx.measureText(doneStr).width, w2.y);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------- 6. breakout
class BreakoutGame {
  constructor(host) { this.bricks = []; this.balls = 3; this.destroyed = 0; this.needed = 20; this.ballLive = false; }
  start(host) {
    const pf = host.pf;
    const cols = 8, rows = 4;
    const bw = (pf.w - 60) / cols, bh = 22;
    const colors = ['#ff2fd6', '#ffe94a', '#4aff8f', '#00f0ff'];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      this.bricks.push({ x: pf.x + 30 + c * bw, y: pf.y + 40 + r * (bh + 8), w: bw - 6, h: bh, color: colors[r], alive: true });
    }
    this.resetBall(host);
  }
  resetBall(host) {
    const pf = host.pf;
    this.bx = pf.x + pf.w / 2; this.by = pf.y + pf.h - 90;
    const a = -Math.PI / 2 + rand(-0.5, 0.5);
    const sp = 430;
    this.bvx = Math.cos(a) * sp; this.bvy = Math.sin(a) * sp;
    this.ballLive = true;
  }
  update(dt, input, host) {
    const pf = host.pf;
    this.px = mouseIn(input, host).x;
    const py = pf.y + pf.h - 26;
    if (host.playTime > host.limit(50)) { host.finish(this.destroyed >= this.needed); return; }
    // ball
    this.bx += this.bvx * dt; this.by += this.bvy * dt;
    if (this.bx < pf.x + 8) { this.bx = pf.x + 8; this.bvx = Math.abs(this.bvx); }
    if (this.bx > pf.x + pf.w - 8) { this.bx = pf.x + pf.w - 8; this.bvx = -Math.abs(this.bvx); }
    if (this.by < pf.y + 8) { this.by = pf.y + 8; this.bvy = Math.abs(this.bvy); }
    // paddle
    if (this.by > py - 10 && this.by < py + 12 && Math.abs(this.bx - this.px) < 58 && this.bvy > 0) {
      this.bvy = -Math.abs(this.bvy) * 1.03;
      this.bvx += (this.bx - this.px) * 4;
      host.audio.sfx('uiClick');
    }
    // bricks
    for (const b of this.bricks) {
      if (!b.alive) continue;
      if (this.bx > b.x - 7 && this.bx < b.x + b.w + 7 && this.by > b.y - 7 && this.by < b.y + b.h + 7) {
        b.alive = false;
        this.destroyed++;
        host.audio.sfx('kill');
        // reflect on dominant axis
        const cx = clamp(this.bx, b.x, b.x + b.w), cy = clamp(this.by, b.y, b.y + b.h);
        if (Math.abs(this.bx - cx) > Math.abs(this.by - cy)) this.bvx = -this.bvx; else this.bvy = -this.bvy;
        break;
      }
    }
    // drop
    if (this.by > pf.y + pf.h + 12) {
      this.balls--;
      host.audio.sfx('playerHit');
      if (this.balls <= 0) { host.finish(this.destroyed >= this.needed); return; }
      this.resetBall(host);
    }
    if (this.destroyed >= this.needed) host.finish(true);
  }
  hud(host) { return `BLOCKS ${this.destroyed}/${this.needed}   BALLS ${this.balls}   ${Math.max(0, host.limit(50) - host.playTime).toFixed(0)}s`; }
  draw(ctx, host) {
    const pf = host.pf;
    for (const b of this.bricks) if (b.alive) glowRect(ctx, b.x, b.y, b.w, b.h, b.color);
    glowRect(ctx, this.px - 58, pf.y + pf.h - 26, 116, 10, '#00f0ff');
    glowDot(ctx, this.bx, this.by, 7, '#ffffff');
  }
}

// ---------------------------------------------------------------- 7. flappy
class FlappyGame {
  constructor(host) { this.y = 0; this.vy = 0; this.gates = []; this.passed = 0; this.lives = 2; this.spawnT = 0; this.inv = 0; }
  start(host) { this.y = host.pf.y + host.pf.h / 2; }
  update(dt, input, host) {
    const pf = host.pf;
    if (input.consumeDash()) { this.vy = -300; host.audio.sfx('dash'); }
    this.vy += 780 * dt;
    this.y += this.vy * dt;
    this.inv = Math.max(0, this.inv - dt);
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 2.0;
      const gap = 170, gy = rand(pf.y + 70, pf.y + pf.h - 70 - gap);
      this.gates.push({ x: pf.x + pf.w + 30, gy, gap, passed: false });
    }
    const px = pf.x + 140;
    for (let i = this.gates.length - 1; i >= 0; i--) {
      const g = this.gates[i];
      g.x -= 190 * dt;
      if (!g.passed && g.x + 24 < px) { g.passed = true; this.passed++; host.audio.sfx('pickup'); }
      if (g.x < pf.x - 60) this.gates.splice(i, 1);
      // collision
      if (this.inv <= 0 && px + 10 > g.x && px - 10 < g.x + 24) {
        if (this.y - 9 < g.gy || this.y + 9 > g.gy + g.gap) this.hit(host);
      }
    }
    if (this.inv <= 0 && (this.y < pf.y + 8 || this.y > pf.y + pf.h - 8)) this.hit(host);
    if (this.passed >= 10) host.finish(true);
  }
  hit(host) {
    this.lives--;
    this.inv = 1.2;
    this.vy = -180;
    this.y = clamp(this.y, host.pf.y + 30, host.pf.y + host.pf.h - 30);
    host.audio.sfx('playerHit');
    if (this.lives < 0) host.finish(false);
  }
  hud() { return `GATES ${this.passed}/10   LIVES ${Math.max(0, this.lives + 1)}`; }
  draw(ctx, host) {
    const pf = host.pf;
    for (const g of this.gates) {
      glowRect(ctx, g.x, pf.y, 24, g.gy - pf.y, '#ff2fd6');
      glowRect(ctx, g.x, g.gy + g.gap, 24, pf.y + pf.h - g.gy - g.gap, '#ff2fd6');
    }
    const px = pf.x + 140;
    if (this.inv <= 0 || Math.floor(host.time * 10) % 2 === 0) {
      ctx.save();
      ctx.translate(px, this.y);
      ctx.rotate(clamp(this.vy / 600, -0.5, 0.6));
      ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 2;
      ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(12, 0); ctx.lineTo(-9, 8); ctx.lineTo(-4, 0); ctx.lineTo(-9, -8);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------- 8. dodge
class DodgeGame {
  constructor(host) { this.bullets = []; this.spawnT = 0.4; this.lives = 3; this.inv = 0; this.goal = 30; }
  update(dt, input, host) {
    const pf = host.pf;
    const m = mouseIn(input, host);
    this.px = m.x; this.py = m.y;
    this.inv = Math.max(0, this.inv - dt);
    this.spawnT -= dt;
    const rate = Math.max(0.16, 0.65 - host.playTime * 0.015);
    if (this.spawnT <= 0) {
      this.spawnT = rate;
      const side = randInt(0, 3);
      let x, y;
      if (side === 0) { x = pf.x - 10; y = rand(pf.y, pf.y + pf.h); }
      else if (side === 1) { x = pf.x + pf.w + 10; y = rand(pf.y, pf.y + pf.h); }
      else if (side === 2) { x = rand(pf.x, pf.x + pf.w); y = pf.y - 10; }
      else { x = rand(pf.x, pf.x + pf.w); y = pf.y + pf.h + 10; }
      const a = Math.atan2(this.py - y, this.px - x) + rand(-0.25, 0.25);
      const sp = rand(140, 220) + host.playTime * 3;
      this.bullets.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
    }
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < pf.x - 40 || b.x > pf.x + pf.w + 40 || b.y < pf.y - 40 || b.y > pf.y + pf.h + 40) { this.bullets.splice(i, 1); continue; }
      if (this.inv <= 0 && dist2(b.x, b.y, this.px, this.py) < 15 * 15) {
        this.bullets.splice(i, 1);
        this.lives--;
        this.inv = 1.0;
        host.audio.sfx('playerHit');
        if (this.lives <= 0) { host.finish(false); return; }
      }
    }
    if (host.playTime >= this.goal) host.finish(true);
  }
  hud(host) { return `SURVIVE ${Math.max(0, this.goal - host.playTime).toFixed(1)}s   LIVES ${this.lives}`; }
  draw(ctx, host) {
    for (const b of this.bullets) glowDot(ctx, b.x, b.y, 5, '#ff3b5c');
    if (this.inv <= 0 || Math.floor(host.time * 10) % 2 === 0) glowDot(ctx, this.px, this.py, 8, '#00f0ff');
  }
}

// ---------------------------------------------------------------- 9. reaction
class ReactionGame {
  constructor(host) { this.round = 0; this.success = 0; this.fails = 0; this.state = 'idle'; this.t = 0; this.msg = ''; this.rt = 0; }
  start(host) { this.nextRound(host); }
  nextRound(host) {
    this.round++;
    if (this.round > 5) { host.finish(this.success >= 3); return; }
    this.state = 'wait';
    this.t = rand(1.0, 2.6);
  }
  update(dt, input, host) {
    if (this.state === 'wait') {
      this.t -= dt;
      if (input.consumeDash()) {
        this.fails++; this.success = this.success; this.state = 'shame'; this.t = 1.0;
        host.audio.sfx('denied');
        return;
      }
      if (this.t <= 0) { this.state = 'go'; this.t = 0; host.audio.sfx('bossPhase'); }
    } else if (this.state === 'go') {
      this.t += dt;
      if (input.consumeDash()) {
        this.rt = this.t;
        if (this.t <= 0.45 * host.timeMul) { this.success++; host.audio.sfx('waveClear'); }
        else host.audio.sfx('denied');
        this.state = 'shame'; this.t = 1.0;
        return;
      }
      if (this.t > 0.9) { this.state = 'shame'; this.t = 1.0; this.rt = -1; host.audio.sfx('denied'); }
    } else if (this.state === 'shame') {
      this.t -= dt;
      if (this.t <= 0) this.nextRound(host);
    }
    if (this.fails >= 2) host.finish(false);
  }
  hud() { return `ROUND ${Math.min(5, this.round)}/5   OK ${this.success} (need 3)`; }
  draw(ctx, host) {
    const pf = host.pf;
    const cx = pf.x + pf.w / 2, cy = pf.y + pf.h / 2;
    ctx.save();
    ctx.textAlign = 'center';
    if (this.state === 'wait') {
      ctx.strokeStyle = '#6d8aa5'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 70, 0, TAU); ctx.stroke();
      ctx.font = '18px Consolas, monospace';
      ctx.fillStyle = '#6d8aa5';
      ctx.fillText(t('mg.react_wait'), cx, cy + 6);
    } else if (this.state === 'go') {
      const spr = glowSprite('#4aff8f');
      ctx.drawImage(spr, cx - 130, cy - 130, 260, 260);
      ctx.strokeStyle = '#4aff8f'; ctx.lineWidth = 5;
      ctx.shadowColor = '#4aff8f'; ctx.shadowBlur = 30;
      ctx.beginPath(); ctx.arc(cx, cy, 74, 0, TAU); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = 'bold 26px Consolas, monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(t('mg.react_now'), cx, cy + 9);
    } else {
      ctx.font = '20px Consolas, monospace';
      if (this.rt === -1) { ctx.fillStyle = '#ff3b5c'; ctx.fillText(t('mg.react_slow'), cx, cy); }
      else if (this.rt > 0) {
        const ok = this.rt <= 0.45 * host.timeMul;
        ctx.fillStyle = ok ? '#4aff8f' : '#ff3b5c';
        ctx.fillText(Math.round(this.rt * 1000) + 'ms' + (ok ? ' ✓' : ' ✗'), cx, cy);
      } else { ctx.fillStyle = '#ff3b5c'; ctx.fillText(t('mg.react_early'), cx, cy); }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- 10. stacker
class StackerGame {
  constructor(host) { this.layers = []; this.cur = null; this.goal = 8; this.dir = 1; }
  start(host) {
    const pf = host.pf;
    this.baseW = Math.min(240, pf.w * 0.4);
    this.layers.push({ x: pf.x + pf.w / 2 - this.baseW / 2, w: this.baseW });
    this.newBlock(host);
  }
  newBlock(host) {
    const prev = this.layers[this.layers.length - 1];
    this.cur = { x: host.pf.x + 10, w: prev.w, speed: 240 + this.layers.length * 34 };
    this.dir = 1;
  }
  update(dt, input, host) {
    const pf = host.pf;
    if (!this.cur) return;
    this.cur.x += this.cur.speed * this.dir * dt;
    if (this.cur.x + this.cur.w > pf.x + pf.w - 10) this.dir = -1;
    if (this.cur.x < pf.x + 10) this.dir = 1;
    if (input.consumeDash()) {
      const prev = this.layers[this.layers.length - 1];
      const left = Math.max(this.cur.x, prev.x);
      const right = Math.min(this.cur.x + this.cur.w, prev.x + prev.w);
      const w = right - left;
      if (w <= 6) { host.audio.sfx('playerHit'); host.finish(false); return; }
      this.layers.push({ x: left, w });
      host.audio.sfx(w > prev.w - 8 ? 'waveClear' : 'uiClick');
      if (this.layers.length - 1 >= this.goal) { host.finish(true); return; }
      this.newBlock(host);
    }
  }
  hud() { return `LAYERS ${this.layers.length - 1}/${this.goal}`; }
  draw(ctx, host) {
    const pf = host.pf;
    const bh = 30;
    const baseY = pf.y + pf.h - 30;
    this.layers.forEach((l, i) => {
      glowRect(ctx, l.x, baseY - i * (bh + 4) - bh, l.w, bh, i === 0 ? '#6d8aa5' : '#00f0ff');
    });
    if (this.cur) {
      const y = baseY - this.layers.length * (bh + 4) - bh;
      glowRect(ctx, this.cur.x, y, this.cur.w, bh, '#ffe94a');
    }
  }
}

// ---------------------------------------------------------------- registry
export const MINIGAMES = [
  { id: 'rhythm', icon: '♫', create: (h) => new RhythmGame(h),
    name: { en: 'PULSE SYNC', ko: '펄스 싱크' },
    desc: { en: 'Rhythm game — hit D F J K when notes reach the line.\nHit 75% or more to win.', ko: '리듬게임 — 노트가 라인에 닿는 순간 D F J K.\n75% 이상 적중 시 승리.' } },
  { id: 'catcher', icon: '⛁', create: (h) => new CatcherGame(h),
    name: { en: 'PACKET RAIN', ko: '패킷 레인' },
    desc: { en: 'Move the tray with your mouse. Catch 15 data packets.\nCatch 3 viruses (red) and you fail.', ko: '마우스로 트레이를 움직여 데이터 15개를 받으세요.\n바이러스(빨강) 3개를 받으면 실패.' } },
  { id: 'memory', icon: '▦', create: (h) => new MemoryGame(h),
    name: { en: 'ECHO GRID', ko: '에코 그리드' },
    desc: { en: 'Watch the flashing sequence, then click it back.\nClear all 5 rounds. 3 mistakes allowed total.', ko: '빛나는 순서를 기억했다가 그대로 클릭하세요.\n5라운드 클리어. 실수는 총 3번까지.' } },
  { id: 'maze', icon: '⌘', create: (h) => new MazeGame(h),
    name: { en: 'CIRCUIT TRACE', ko: '서킷 트레이스' },
    desc: { en: 'Guide your cursor through the circuit without leaving it.\nClear 3 circuits in 45s. 3 lives.', ko: '커서가 회로 밖으로 나가지 않게 GOAL까지 이동.\n45초 안에 회로 3개 통과. 기회 3번.' } },
  { id: 'typing', icon: '⌨', create: (h) => new TypingGame(h),
    name: { en: 'WORD STORM', ko: '워드 스톰' },
    desc: { en: 'Type the falling words to purge them.\nPurge 12 before 3 reach the bottom.', ko: '떨어지는 단어를 타이핑해 파괴하세요.\n3개가 바닥에 닿기 전에 12개 정화.' } },
  { id: 'breakout', icon: '▤', create: (h) => new BreakoutGame(h),
    name: { en: 'BRICK.EXE', ko: '브릭.EXE' },
    desc: { en: 'Mouse paddle. Break 24 blocks within 50s.\n3 balls.', ko: '마우스 패들로 공을 튕겨 50초 안에 블록 24개 파괴.\n공은 3개.' } },
  { id: 'flappy', icon: '⇞', create: (h) => new FlappyGame(h),
    name: { en: 'SIGNAL DRIFT', ko: '시그널 드리프트' },
    desc: { en: 'Click / Space to hop. Pass 10 gates.\nYou can take 3 hits.', ko: '클릭/스페이스로 상승. 게이트 10개 통과.\n3번까지 부딪혀도 됩니다.' } },
  { id: 'dodge', icon: '❋', create: (h) => new DodgeGame(h),
    name: { en: 'METEOR FIELD', ko: '메테오 필드' },
    desc: { en: 'Your cursor is the ship. Dodge everything for 30s.\n3 lives.', ko: '커서가 곧 기체입니다. 30초간 모든 탄을 회피.\n기회 3번.' } },
  { id: 'reaction', icon: '⚡', create: (h) => new ReactionGame(h),
    name: { en: 'SPIKE TEST', ko: '스파이크 테스트' },
    desc: { en: 'Wait for green — then click as fast as you can.\nUnder 450ms, 4 of 5 rounds. Early clicks fail.', ko: '초록 신호가 뜨면 최대한 빨리 클릭.\n450ms 이내로 5라운드 중 4번. 미리 누르면 실패.' } },
  { id: 'stacker', icon: '☰', create: (h) => new StackerGame(h),
    name: { en: 'STACK PROTOCOL', ko: '스택 프로토콜' },
    desc: { en: 'Click to drop the sliding block on the stack.\nOverhang is cut off. Stack 8 layers.', ko: '움직이는 블록을 클릭해 쌓으세요. 삐져나온 부분은\n잘려나갑니다. 8층을 쌓으면 승리.' } },
];

// prefer minigames the player hasn't seen this profile yet
export function pickMinigame(meta) {
  const played = meta.data.playedMinigames || [];
  const fresh = MINIGAMES.filter((m) => !played.includes(m.id));
  return choice(fresh.length ? fresh : MINIGAMES);
}
