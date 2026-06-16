// input.js — keyboard, mouse (pointer lock), and mobile touch input

import { clamp } from './utils.js';

export const Input = {
  keys: Object.create(null),
  pressed: Object.create(null),
  lookX: 0, lookY: 0, wheel: 0,
  lmb: false, rmb: false, lmbPressed: false,
  locked: false, enabled: false,
  _canvas: null,
  _sensScale: 1,

  init(canvas) {
    this._canvas = canvas;
    window.addEventListener('keydown', e => {
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.pressed[e.code] = true;
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = Object.create(null); this.lmb = this.rmb = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('pointerlockerror', () => {});
    window.addEventListener('mousemove', e => {
      if (!this.locked) return;
      const mx = clamp(e.movementX, -180, 180);
      const my = clamp(e.movementY, -180, 180);
      this.lookX += mx * this._sensScale;
      this.lookY += my * this._sensScale;
    });
    window.addEventListener('mousedown', e => {
      if (!this.enabled) return;
      if (e.button === 0) {
        if (this.locked) { this.lmb = true; this.lmbPressed = true; }
        this.lock();
      }
      if (e.button === 2) this.rmb = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.lmb = false;
      if (e.button === 2) this.rmb = false;
    });
    window.addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener('contextmenu', e => e.preventDefault());
  },

  setSensitivity(val) {
    // val 1..10 -> scale 0.4..1.6
    this._sensScale = 0.4 + (val - 1) / 9 * 1.2;
  },

  lock() {
    if (this.locked) return;
    const p = this._canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => {
      try { this._canvas.requestPointerLock(); } catch(e) {}
    });
  },

  endFrame() {
    for (const k in this.pressed) this.pressed[k] = false;
    this.lmbPressed = false;
    this.lookX = 0; this.lookY = 0; this.wheel = 0;
  },
};

// ── mobile joystick + touch look ──────────────────────────────────────────────
export const MobileInput = {
  joyActive: false, joyId: -1,
  joyX: 0, joyY: 0,           // normalized -1..1
  lookDx: 0, lookDy: 0,
  buttons: {
    fire: false, aim: false, jump: false,
    enter: false, handbrake: false,
    gas: false, brake: false,
  },
  _lookId: -1, _lookLx: 0, _lookLy: 0,
  _joyCenter: { x: 0, y: 0 },
  _joyRadius: 50,

  init() {
    const joy     = document.getElementById('joystick');
    const knob    = document.getElementById('joystickKnob');
    const look    = document.getElementById('mobileLook');

    // joystick
    const joyStart = e => {
      if (this.joyActive) return;
      const t = e.changedTouches[0];
      this.joyActive = true; this.joyId = t.identifier;
      const r = joy.getBoundingClientRect();
      this._joyCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this._joyRadius = r.width / 2;
      this._joyMove(t);
    };
    const joyMove = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) this._joyMove(t);
      }
    };
    const joyEnd = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) {
          this.joyActive = false; this.joyId = -1;
          this.joyX = 0; this.joyY = 0;
          knob.style.transform = 'translate(-50%,-50%)';
        }
      }
    };
    joy.addEventListener('touchstart', joyStart, { passive: true });
    window.addEventListener('touchmove', joyMove, { passive: true });
    window.addEventListener('touchend', joyEnd, { passive: true });
    window.addEventListener('touchcancel', joyEnd, { passive: true });

    // look area
    look.addEventListener('touchstart', e => {
      if (this._lookId >= 0) return;
      const t = e.changedTouches[0];
      this._lookId = t.identifier;
      this._lookLx = t.clientX; this._lookLy = t.clientY;
    }, { passive: true });
    window.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._lookId) continue;
        this.lookDx += (t.clientX - this._lookLx) * 0.45;
        this.lookDy += (t.clientY - this._lookLy) * 0.45;
        this._lookLx = t.clientX; this._lookLy = t.clientY;
      }
    }, { passive: true });
    window.addEventListener('touchend', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._lookId) this._lookId = -1;
      }
    }, { passive: true });

    // action buttons
    const wire = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', e => { e.preventDefault(); this.buttons[key] = true; }, { passive: false });
      el.addEventListener('touchend',   e => { e.preventDefault(); this.buttons[key] = false; }, { passive: false });
      el.addEventListener('touchcancel',e => { this.buttons[key] = false; });
    };
    wire('btnFire',      'fire');
    wire('btnAim',       'aim');
    wire('btnJump',      'jump');
    wire('btnEnter',     'enter');
    wire('btnHandbrake', 'handbrake');
    wire('btnGas',       'gas');
    wire('btnBrake',     'brake');

    // prevent context menu on long-press
    window.addEventListener('contextmenu', e => e.preventDefault());
  },

  _joyMove(touch) {
    const dx = touch.clientX - this._joyCenter.x;
    const dy = touch.clientY - this._joyCenter.y;
    const dist = Math.hypot(dx, dy);
    const r = this._joyRadius;
    const clamped = Math.min(dist, r);
    const angle = Math.atan2(dy, dx);
    const nx = Math.cos(angle) * clamped, ny = Math.sin(angle) * clamped;
    this.joyX = nx / r; this.joyY = ny / r;
    const knob = document.getElementById('joystickKnob');
    if (knob) knob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
  },

  endFrame() {
    this.lookDx = 0; this.lookDy = 0;
  },
};
