// input.js — keyboard + mouse + touch. Touch maps onto the same fields the game already
// reads (moveVector / mouseX,mouseY / dashQueued / rightDown / pressedQueue) so nothing
// downstream needs to know whether you're on desktop or a phone.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.rightDown = false;
    // edge-triggered queues consumed by game logic
    this.pressedQueue = new Set();
    this.dashQueued = false;

    // ---- touch state ----
    this.touch = false;                 // is this a touch device / touch active
    this.vw = window.innerWidth; this.vh = window.innerHeight;
    this.moveStick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };   // left: movement
    this.aimStick = { id: null, ox: 0, oy: 0, x: 0, y: 0, active: false }; // right: aim
    this.dashBtn = { id: null, downAt: 0 };
    this.skillBtns = { q: null, w: null, e: null, r: null };   // touch ids per skill button
    this.showSkills = false;            // PVP shows QWER buttons

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedQueue.add(e.code);
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.dashQueued = true;
        e.preventDefault();
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; this.rightDown = false; });

    canvas.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseDown = true; this.dashQueued = true; }
      if (e.button === 2) this.rightDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---- touch listeners ----
    const opts = { passive: false };
    canvas.addEventListener('touchstart', (e) => this._touchStart(e), opts);
    canvas.addEventListener('touchmove', (e) => this._touchMove(e), opts);
    canvas.addEventListener('touchend', (e) => this._touchEnd(e), opts);
    canvas.addEventListener('touchcancel', (e) => this._touchEnd(e), opts);
  }

  // read the device safe-area insets (notch / home indicator) so on-screen buttons
  // stay reachable and clear of system gesture zones on phones
  _insets() {
    if (!this._insetProbe && typeof document !== 'undefined' && document.body) {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;'
        + 'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);'
        + 'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);';
      document.body.appendChild(d);
      this._insetProbe = d;
    }
    if (!this._insetProbe) return { top: 0, right: 0, bottom: 0, left: 0 };
    const cs = getComputedStyle(this._insetProbe);
    return {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
  }

  _dashButtonRect() {
    // bottom-right circle, lifted clear of the home indicator
    const ins = this._insets();
    return { x: this.vw - 84 - ins.right, y: this.vh - 96 - ins.bottom, r: 52 };
  }
  _skillButtonRect(i) {
    // QWER 2x2 cluster left of the dash button (PVP)
    const ins = this._insets();
    const gx = this.vw - 150 - ins.right, gy = this.vh - 150 - ins.bottom;
    const pos = [[gx, gy], [gx + 62, gy], [gx, gy + 62], [gx + 62, gy + 62]];
    return { x: pos[i][0], y: pos[i][1], r: 27 };
  }
  _inCircle(px, py, c) { const dx = px - c.x, dy = py - c.y; return dx * dx + dy * dy <= c.r * c.r; }

  _touchStart(e) {
    e.preventDefault();
    this.touch = true;
    this.vw = window.innerWidth; this.vh = window.innerHeight;
    for (const t of e.changedTouches) {
      const x = t.clientX, y = t.clientY;
      // dash button?
      if (this._inCircle(x, y, this._dashButtonRect())) { this.dashBtn.id = t.identifier; this.dashBtn.downAt = performance.now(); this.rightDown = true; continue; }
      // skill buttons (PVP)?
      if (this.showSkills) {
        let hit = false;
        for (const k of ['q', 'w', 'e', 'r']) {
          const idx = { q: 0, w: 1, e: 2, r: 3 }[k];
          if (this._inCircle(x, y, this._skillButtonRect(idx))) { this.skillBtns[k] = t.identifier; this.pressedQueue.add('Key' + k.toUpperCase()); hit = true; break; }
        }
        if (hit) continue;
      }
      // left half → move stick, right half → aim stick
      if (x < this.vw * 0.5 && this.moveStick.id === null) {
        this.moveStick.id = t.identifier; this.moveStick.ox = x; this.moveStick.oy = y; this.moveStick.x = x; this.moveStick.y = y;
      } else if (this.aimStick.id === null) {
        this.aimStick.id = t.identifier; this.aimStick.ox = x; this.aimStick.oy = y; this.aimStick.x = x; this.aimStick.y = y; this.aimStick.active = true;
      }
    }
  }

  _touchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveStick.id) { this.moveStick.x = t.clientX; this.moveStick.y = t.clientY; }
      else if (t.identifier === this.aimStick.id) { this.aimStick.x = t.clientX; this.aimStick.y = t.clientY; }
    }
  }

  _touchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveStick.id) { this.moveStick.id = null; this.moveStick.x = this.moveStick.ox; this.moveStick.y = this.moveStick.oy; }
      else if (t.identifier === this.aimStick.id) { this.aimStick.id = null; this.aimStick.active = false; }
      else if (t.identifier === this.dashBtn.id) {
        this.dashBtn.id = null;
        this.rightDown = false;
        const held = performance.now() - this.dashBtn.downAt;
        if (held < 200) this.dashQueued = true; // quick tap = instant dash; hold = charge (rightDown)
      } else {
        for (const k of ['q', 'w', 'e', 'r']) if (t.identifier === this.skillBtns[k]) this.skillBtns[k] = null;
      }
    }
  }

  // movement vector from WASD/arrows OR the left touch stick, normalized
  moveVector() {
    if (this.touch && this.moveStick.id !== null) {
      const dx = this.moveStick.x - this.moveStick.ox, dy = this.moveStick.y - this.moveStick.oy;
      const m = Math.hypot(dx, dy);
      if (m < 8) return { x: 0, y: 0 };
      const dead = 8, max = 60;
      const mag = Math.min(1, (m - dead) / (max - dead));
      return { x: (dx / m) * mag, y: (dy / m) * mag };
    }
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (x !== 0 && y !== 0) { const inv = 1 / Math.SQRT2; x *= inv; y *= inv; }
    return { x, y };
  }

  // called each frame by the game: fold the aim stick into mouseX/mouseY so the existing
  // aim math (angleTo(player, mouse+cam)) points where the right stick is pushed.
  syncTouchAim() {
    if (!this.touch) return;
    const cx = this.vw / 2, cy = this.vh / 2;
    if (this.aimStick.active) {
      const dx = this.aimStick.x - this.aimStick.ox, dy = this.aimStick.y - this.aimStick.oy;
      const m = Math.hypot(dx, dy);
      if (m > 6) { this.mouseX = cx + (dx / m) * 260; this.mouseY = cy + (dy / m) * 260; return; }
    }
    // no aim input → aim toward current movement so dashes go where you're heading
    const mv = this.moveVector();
    if (mv.x || mv.y) { const m = Math.hypot(mv.x, mv.y); this.mouseX = cx + (mv.x / m) * 260; this.mouseY = cy + (mv.y / m) * 260; }
  }

  wasPressed(code) { return this.pressedQueue.has(code); }

  consumeDash() {
    const d = this.dashQueued;
    this.dashQueued = false;
    return d;
  }

  endFrame() {
    this.pressedQueue.clear();
    this.dashQueued = false;
  }

  // ---- on-screen control overlay (drawn by the game while playing on touch) ----
  drawOverlay(ctx, w, h) {
    if (!this.touch) return;
    this.vw = w; this.vh = h;
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 2;
    // move stick
    if (this.moveStick.id !== null) {
      ctx.strokeStyle = '#00f0ff';
      ctx.beginPath(); ctx.arc(this.moveStick.ox, this.moveStick.oy, 54, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath(); ctx.arc(this.moveStick.x, this.moveStick.y, 24, 0, Math.PI * 2); ctx.fill();
    }
    // aim stick
    if (this.aimStick.active) {
      ctx.strokeStyle = '#ff2fd6';
      ctx.beginPath(); ctx.arc(this.aimStick.ox, this.aimStick.oy, 54, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ff2fd6';
      ctx.beginPath(); ctx.arc(this.aimStick.x, this.aimStick.y, 24, 0, Math.PI * 2); ctx.fill();
    }
    // dash button
    const b = this._dashButtonRect();
    ctx.globalAlpha = this.rightDown ? 0.5 : 0.3;
    ctx.strokeStyle = '#ffe94a'; ctx.fillStyle = 'rgba(255,233,74,0.12)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#ffe94a';
    ctx.font = 'bold 13px Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillText('DASH', b.x, b.y + 5);
    // skill buttons (PVP)
    if (this.showSkills) {
      const labels = ['Q', 'W', 'E', 'R'];
      for (let i = 0; i < 4; i++) {
        const c = this._skillButtonRect(i);
        ctx.globalAlpha = 0.28; ctx.strokeStyle = '#c084fc'; ctx.fillStyle = 'rgba(192,132,252,0.12)';
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#c084fc';
        ctx.font = 'bold 14px Consolas, monospace';
        ctx.fillText(labels[i], c.x, c.y + 5);
      }
    }
    ctx.restore();
  }
}
