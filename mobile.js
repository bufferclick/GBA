// mobile.js — Grand Buffer Auto
// Full mobile touch input: joystick, look drag, and action buttons.
// Sends state to game.html via postMessage every animation frame.

(function () {

  // ── detect mobile ─────────────────────────────────────────────────────────
  const isMobile =
    /Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent) ||
    window.matchMedia('(pointer: coarse)').matches;

  if (isMobile) {
    document.getElementById('mobileUI').classList.remove('hidden');
  }

  // ── state ─────────────────────────────────────────────────────────────────
  const State = {
    // joystick
    joyX: 0, joyY: 0,
    joyActive: false, joyTouchId: -1,
    joyCenter: { x: 0, y: 0 }, joyRadius: 55,

    // look drag
    lookDx: 0, lookDy: 0,
    lookTouchId: -1, lookLastX: 0, lookLastY: 0,

    // buttons
    fire:      false,
    aim:       false,
    jump:      false,
    enter:     false,
    sprint:    false,
    gas:       false,
    brake:     false,
    weapon:    0,   // 0=pistol,1=smg,2=rocket

    // driving mode flag (shell doesn't know, game tells us)
    driving: false,
  };

  // ── postMessage to game ───────────────────────────────────────────────────
  function sendState() {
    const frame = document.getElementById('gameFrame');
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({
      __gba: true,
      type: 'mobile',
      payload: {
        joyX:   State.joyX,
        joyY:   State.joyY,
        lookDx: State.lookDx,
        lookDy: State.lookDy,
        fire:   State.fire,
        aim:    State.aim,
        jump:   State.jump,
        enter:  State.enter,
        sprint: State.sprint,
        gas:    State.gas,
        brake:  State.brake,
        weapon: State.weapon,
      },
    }, '*');
    // reset per-frame deltas
    State.lookDx = 0;
    State.lookDy = 0;
  }

  // ── joystick ──────────────────────────────────────────────────────────────
  const joyBase = document.getElementById('joystickBase');
  const joyKnob = document.getElementById('joystickKnob');

  function joyReset() {
    State.joyX = 0; State.joyY = 0;
    State.joyActive = false; State.joyTouchId = -1;
    joyKnob.style.transform = 'translate(-50%, -50%)';
  }

  joyBase.addEventListener('touchstart', e => {
    e.preventDefault();
    if (State.joyActive) return;
    const t = e.changedTouches[0];
    State.joyTouchId = t.identifier;
    State.joyActive = true;
    const r = joyBase.getBoundingClientRect();
    State.joyCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    State.joyRadius = r.width / 2 * 0.85;
    updateJoy(t);
  }, { passive: false });

  function updateJoy(touch) {
    const dx = touch.clientX - State.joyCenter.x;
    const dy = touch.clientY - State.joyCenter.y;
    const dist = Math.hypot(dx, dy);
    const r = State.joyRadius;
    const capped = Math.min(dist, r);
    const angle = Math.atan2(dy, dx);
    const ox = Math.cos(angle) * capped;
    const oy = Math.sin(angle) * capped;
    State.joyX = ox / r;
    State.joyY = oy / r;
    joyKnob.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
  }

  window.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === State.joyTouchId) { updateJoy(t); break; }
    }
  }, { passive: true });

  window.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === State.joyTouchId) { joyReset(); break; }
    }
  }, { passive: true });

  window.addEventListener('touchcancel', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === State.joyTouchId) { joyReset(); break; }
    }
  }, { passive: true });

  // ── look drag ─────────────────────────────────────────────────────────────
  const lookZone = document.getElementById('lookZone');

  lookZone.addEventListener('touchstart', e => {
    e.preventDefault();
    if (State.lookTouchId >= 0) return;
    const t = e.changedTouches[0];
    State.lookTouchId = t.identifier;
    State.lookLastX = t.clientX;
    State.lookLastY = t.clientY;
  }, { passive: false });

  window.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== State.lookTouchId) continue;
      State.lookDx += (t.clientX - State.lookLastX) * 0.5;
      State.lookDy += (t.clientY - State.lookLastY) * 0.5;
      State.lookLastX = t.clientX;
      State.lookLastY = t.clientY;
    }
  }, { passive: true });

  window.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === State.lookTouchId) { State.lookTouchId = -1; break; }
    }
  }, { passive: true });

  // ── action buttons ────────────────────────────────────────────────────────
  function wireBtn(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      State[key] = true;
    }, { passive: false });
    el.addEventListener('touchend',    () => State[key] = false);
    el.addEventListener('touchcancel', () => State[key] = false);
  }

  wireBtn('mFire',   'fire');
  wireBtn('mAim',    'aim');
  wireBtn('mJump',   'jump');
  wireBtn('mEnter',  'enter');
  wireBtn('mSprint', 'sprint');
  wireBtn('mGas',    'gas');
  wireBtn('mBrake',  'brake');

  // ── weapon switcher ───────────────────────────────────────────────────────
  const wBtns = [
    document.getElementById('wPistol'),
    document.getElementById('wSMG'),
    document.getElementById('wRocket'),
  ];
  function selectWeapon(i) {
    State.weapon = i;
    wBtns.forEach((b, j) => b && b.classList.toggle('active', j === i));
  }
  wBtns.forEach((b, i) => {
    if (!b) return;
    b.addEventListener('touchstart', e => {
      e.preventDefault();
      selectWeapon(i);
    }, { passive: false });
  });
  selectWeapon(0);

  // ── listen for driving mode from game ────────────────────────────────────
  window.addEventListener('message', e => {
    if (!e.data || !e.data.__gba) return;
    if (e.data.type === 'driveMode') {
      State.driving = e.data.payload.driving;
      // show/hide drive buttons
      const driveEl = document.getElementById('driveButtons');
      if (driveEl) driveEl.style.display = State.driving ? 'flex' : 'none';
    }
    if (e.data.type === 'weaponChanged') {
      selectWeapon(e.data.payload.index || 0);
    }
  });

  // ── game loop tick ────────────────────────────────────────────────────────
  function tick() {
    sendState();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ── prevent default touch behaviors on the overlay ───────────────────────
  document.getElementById('mobileUI').addEventListener('touchmove', e => {
    e.preventDefault();
  }, { passive: false });

})();
