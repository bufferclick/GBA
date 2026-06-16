// bridge.js — Grand Buffer Auto
// Wires the shell (index.html) to the game iframe (game.html).
// Handles: title screen click-to-start, settings postMessage relay,
// FPS display, fade, and quality preset application inside the game.

(function () {

  // ── helpers ───────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const frame = () => $('gameFrame');
  const send = (type, payload) => {
    const f = frame();
    if (f && f.contentWindow) f.contentWindow.postMessage({ __gba: true, type, payload }, '*');
  };

  // ── fade in ───────────────────────────────────────────────────────────────
  const fade = $('fade');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { fade.classList.add('clear'); });
  });

  // ── title screen ──────────────────────────────────────────────────────────
  const title = $('titleScreen');
  let started = false;

  function startGame() {
    if (started) return;
    started = true;
    title.classList.add('gone');
    // tell the game iframe to start (simulates a click on its own title screen)
    send('start', {});
    // initialise settings
    GBA.Settings.init();
  }

  title.addEventListener('click',     startGame);
  title.addEventListener('touchstart', e => { e.preventDefault(); startGame(); }, { passive: false });

  // also start if the user presses any key
  window.addEventListener('keydown', e => {
    if (!started && e.code !== 'Escape') startGame();
  });

  // ── messages from game iframe ─────────────────────────────────────────────
  window.addEventListener('message', e => {
    if (!e.data || !e.data.__gba) return;
    const { type, payload } = e.data;

    switch (type) {
      case 'fps':
        if (GBA.Settings.showFps) {
          const el = $('fpsCounter');
          if (el) el.textContent = payload.fps + ' fps';
        }
        break;

      case 'driveMode':
      case 'weaponChanged':
        // forwarded to mobile.js via re-dispatch (mobile.js listens on window)
        // already handled there — no action needed here
        break;

      case 'ready':
        // game signals it has booted and is listening for postMessages
        // send initial settings right away
        if (started) GBA.Settings._applyAll();
        break;
    }
  });

  // ── quality preset descriptions ───────────────────────────────────────────
  // (These strings match what game.html reads from the 'gfx' message)
  // Potato: 0, Low: 1, Medium: 2, High: 3, Ultra: 4
  // The game listens for { __gba:true, type:'gfx', payload:{ level:N } }
  // and maps N to its internal Quality.applyPreset(N).

  // ── keyboard shortcut info (desktop only) ─────────────────────────────────
  // ESC → settings (handled in settings.js via window keydown)
  // This is mentioned in the settings footer text only.

  // ── resize: keep iframe crisp ─────────────────────────────────────────────
  // The iframe itself handles resize internally.

  // ── prevent double-tap zoom on iOS ───────────────────────────────────────
  let lastTap = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTap < 300) e.preventDefault();
    lastTap = now;
  }, { passive: false });

  // ── orientation hint on small phones ────────────────────────────────────
  // We don't force landscape, but we nudge the game to re-query its canvas size.
  window.addEventListener('orientationchange', () => {
    setTimeout(() => send('resize', {
      w: window.innerWidth,
      h: window.innerHeight,
    }), 350);
  });

})();
