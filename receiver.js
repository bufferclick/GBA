// receiver.js — runs INSIDE game.html
// Receives postMessages from the shell and applies them to the live game.
// Add one script tag at the bottom of game.html:
//   <script src="receiver.js"></script>

(function () {

  // Retry until the game's globals are available.
  // The game script sets window.NT (the test-hook object) when ready.
  let _ready = false;

  function tryInit() {
    // NT is exposed by the original game code: window.NT = { Game, Vehicles, ... }
    if (!window.NT) { setTimeout(tryInit, 120); return; }
    _ready = true;
    // tell the parent shell we are ready
    if (window.parent !== window) {
      window.parent.postMessage({ __gba: true, type: 'ready', payload: {} }, '*');
    }
  }
  tryInit();

  // ── helpers ───────────────────────────────────────────────────────────────
  function getGame()    { return window.NT && window.NT.Game; }
  function getVeh()     { return window.NT && window.NT.Vehicles; }
  function getWanted()  { return window.NT && window.NT.Wanted; }
  function getQuality() { return window.NT && window.NT.Quality; }
  function getAudio()   { return window.AudioFX; }
  function getInput()   { return window.NT && window.NT.Input; }

  // map gfx level to Quality preset params
  const GFX_PRESETS = {
    0: { pr: 0.38, bloom: false, shadow: false, shadowSize: 512,  fog: 0.0016 },
    1: { pr: 0.58, bloom: false, shadow: true,  shadowSize: 512,  fog: 0.0013 },
    2: { pr: 0.82, bloom: true,  shadow: true,  shadowSize: 1024, fog: 0.001  },
    3: { pr: 1.0,  bloom: true,  shadow: true,  shadowSize: 2048, fog: 0.00085},
    4: { pr: 1.45, bloom: true,  shadow: true,  shadowSize: 4096, fog: 0.00085},
  };

  function applyGfx(level) {
    const p = GFX_PRESETS[level];
    if (!p) return;
    const Q = getQuality();
    if (!Q) return;
    // pixel ratio
    const BASE = Math.min(window.devicePixelRatio || 1, 1.5);
    const pr = Math.min(BASE * p.pr, BASE * 1.5);
    if (window._renderer) window._renderer.setPixelRatio(pr);
    if (window._composer) window._composer.setPixelRatio(pr);
    // bloom
    if (window._bloomPass) window._bloomPass.enabled = p.bloom;
    // shadows
    if (window._renderer) {
      window._renderer.shadowMap.enabled = p.shadow;
    }
    const light = window._scene && window._scene.userData && window._scene.userData.sunLight;
    if (light && p.shadow) {
      light.shadow.mapSize.set(p.shadowSize, p.shadowSize);
      if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
    }
    // fog
    if (window._scene && window._scene.fog) {
      window._scene.fog.density = p.fog;
    }
  }

  // mobile input accumulator (reset each frame by the game loop)
  const MobileState = window._mobileState = {
    joyX: 0, joyY: 0,
    lookDx: 0, lookDy: 0,
    fire: false, aim: false, jump: false,
    enter: false, sprint: false,
    gas: false, brake: false,
    weapon: 0,
    _pendingWeapon: -1,
  };

  // ── message handler ────────────────────────────────────────────────────────
  window.addEventListener('message', e => {
    if (!e.data || !e.data.__gba) return;
    const { type, payload: P } = e.data;

    switch (type) {

      // ── start (simulate title click) ──
      case 'start': {
        const ts = document.getElementById('titleScreen');
        if (ts && !ts.classList.contains('gone')) {
          ts.classList.add('gone');
          // replicate what the original mousedown handler does
          const G = getGame();
          if (G && G.state === 'title') {
            G.state = 'flyin';
            G.flyT = 0;
            if (window.AudioFX) window.AudioFX.start();
            const inp = getInput();
            if (inp) inp.enabled = true;
          }
        }
        break;
      }

      // ── graphics preset ──
      case 'gfx':
        applyGfx(P.level);
        break;

      // ── fov ──
      case 'fov': {
        const G = getGame();
        if (G) G._settingsFov = P.v;
        break;
      }

      // ── mouse sensitivity ──
      case 'sens': {
        window._inputSens = P.v;   // read by the patched mousemove handler below
        break;
      }

      // ── invert Y ──
      case 'invertY': {
        window._invertY = P.v;
        break;
      }

      // ── camera shake ──
      case 'shake': {
        window._shakeEnabled = P.v;
        break;
      }

      // ── bloom ──
      case 'bloom': {
        if (window._bloomPass) window._bloomPass.enabled = P.v;
        break;
      }

      // ── grain ──
      case 'grain': {
        if (window._gradePass) {
          // grain coefficient stored, read by grade shader each frame
          window._grainAmt = P.v ? 0.014 : 0.0;
        }
        break;
      }

      // ── shadows ──
      case 'shadows': {
        if (window._renderer) window._renderer.shadowMap.enabled = P.v;
        break;
      }

      // ── draw distance ──
      case 'draw': {
        // map 1-5 to fog densities
        const fogs = [0.0016, 0.0013, 0.001, 0.00085, 0.0006];
        const f = fogs[Math.min(P.v - 1, fogs.length - 1)];
        if (window._scene && window._scene.fog) window._scene.fog.density = f;
        break;
      }

      // ── minimap ──
      case 'minimap': {
        const mm = document.getElementById('mapWrap');
        if (mm) mm.style.visibility = P.v ? 'visible' : 'hidden';
        break;
      }

      // ── crosshair ──
      case 'crosshair': {
        window._crosshairEnabled = P.v;
        break;
      }

      // ── starsHUD ──
      case 'starsHUD': {
        const st = document.getElementById('stars');
        if (st) st.style.visibility = P.v ? 'visible' : 'hidden';
        break;
      }

      // ── auto resolution ──
      case 'autoRes': {
        const Q = getQuality();
        if (Q) Q.autoEnabled = P.v;
        break;
      }

      // ── volume ──
      case 'vol': {
        const A = getAudio();
        if (!A) break;
        if (P.master !== undefined && A.master) A.master.gain.value = P.master;
        if (P.music  !== undefined && A.musicBus) A.musicBus.gain.value = P.music * 0.5;
        if (P.sfx    !== undefined && A.sfx) A.sfx.gain.value = P.sfx;
        break;
      }

      // ── traffic density ──
      case 'traffic': {
        // map 1-5 to max traffic count
        const caps = [6, 10, 14, 18, 22];
        window._trafficCap = caps[Math.min(P.v - 1, caps.length - 1)];
        break;
      }

      // ── peds ──
      case 'peds': {
        const caps = [8, 14, 20, 24, 28];
        window._pedCap = caps[Math.min(P.v - 1, caps.length - 1)];
        break;
      }

      // ── full settings bundle ──
      case 'settings': {
        // apply each field individually
        if (P.gfxLevel !== undefined) applyGfx(P.gfxLevel);
        if (P.fov !== undefined) { const G = getGame(); if (G) G._settingsFov = P.fov; }
        if (P.sensitivity !== undefined) window._inputSens = P.sensitivity;
        if (P.invertY !== undefined)     window._invertY = P.invertY;
        if (P.shake !== undefined)       window._shakeEnabled = P.shake;
        if (P.bloom !== undefined && window._bloomPass) window._bloomPass.enabled = P.bloom;
        if (P.grain !== undefined) window._grainAmt = P.grain ? 0.014 : 0.0;
        if (P.minimap !== undefined) {
          const mm = document.getElementById('mapWrap');
          if (mm) mm.style.visibility = P.minimap ? 'visible' : 'hidden';
        }
        if (P.crosshair !== undefined) window._crosshairEnabled = P.crosshair;
        if (P.starsHUD !== undefined) {
          const st = document.getElementById('stars');
          if (st) st.style.visibility = P.starsHUD ? 'visible' : 'hidden';
        }
        if (P.autoRes !== undefined) { const Q = getQuality(); if (Q) Q.autoEnabled = P.autoRes; }
        if (P.masterVol !== undefined) {
          const A = getAudio();
          if (A && A.master) A.master.gain.value = P.masterVol / 100;
          if (A && A.musicBus) A.musicBus.gain.value = (P.musicVol / 100) * 0.5;
          if (A && A.sfx) A.sfx.gain.value = P.sfxVol / 100;
        }
        const fogs = [0.0016, 0.0013, 0.001, 0.00085, 0.0006];
        if (P.drawDist !== undefined && window._scene && window._scene.fog)
          window._scene.fog.density = fogs[Math.min(P.drawDist - 1, fogs.length - 1)];
        if (P.trafficDensity !== undefined) {
          const caps = [6, 10, 14, 18, 22];
          window._trafficCap = caps[Math.min(P.trafficDensity - 1, caps.length - 1)];
        }
        if (P.pedDensity !== undefined) {
          const caps = [8, 14, 20, 24, 28];
          window._pedCap = caps[Math.min(P.pedDensity - 1, caps.length - 1)];
        }
        break;
      }

      // ── mobile input ──
      case 'mobile': {
        MobileState.joyX   = P.joyX   || 0;
        MobileState.joyY   = P.joyY   || 0;
        MobileState.lookDx = P.lookDx || 0;
        MobileState.lookDy = P.lookDy || 0;
        MobileState.fire   = !!P.fire;
        MobileState.aim    = !!P.aim;
        MobileState.jump   = !!P.jump;
        MobileState.enter  = !!P.enter;
        MobileState.sprint = !!P.sprint;
        MobileState.gas    = !!P.gas;
        MobileState.brake  = !!P.brake;
        if (P.weapon !== undefined && P.weapon !== MobileState.weapon) {
          MobileState.weapon = P.weapon;
          MobileState._pendingWeapon = P.weapon;
        }
        break;
      }

      // ── resize ──
      case 'resize': {
        // the game handles window resize internally via its own listener
        window.dispatchEvent(new Event('resize'));
        break;
      }
    }
  });

  // ── FPS reporting back to shell ────────────────────────────────────────────
  let _fpsFrames = 0, _fpsT = 0;
  const _origRAF = window.requestAnimationFrame.bind(window);
  // We hook into the frame loop by watching the NT tick counter
  setInterval(() => {
    if (!window.NT) return;
    const fps = Math.round(_fpsFrames / Math.max(_fpsT, 0.1));
    _fpsFrames = 0; _fpsT = 0;
    if (window.parent !== window) {
      window.parent.postMessage({ __gba: true, type: 'fps', payload: { fps } }, '*');
    }
  }, 500);

  // Patch the frame counter using a MutationObserver on the canvas
  // (lighter than wrapping rAF).
  const cvs = document.getElementById('gl');
  if (cvs) {
    const obs = new MutationObserver(() => { _fpsFrames++; _fpsT += 1 / 60; });
    // fallback: count via setInterval ticks of NT.Tick.frame
    let _lastFrame = 0;
    setInterval(() => {
      if (!window.NT) return;
      const f = window.NT.Tick.frame;
      _fpsFrames += f - _lastFrame;
      _fpsT += 0.1;
      _lastFrame = f;
    }, 100);
  }

  // ── game hooks: patch Input.lookX/Y to add mobile look deltas ─────────────
  // We wait for the game to expose NT, then wrap its Input object.
  function patchInput() {
    if (!window.NT || !window.NT.Input) { setTimeout(patchInput, 200); return; }
    const Inp = window.NT.Input;
    const origEndFrame = Inp.endFrame.bind(Inp);

    Inp.endFrame = function () {
      // inject mobile look
      const MS = window._mobileState;
      if (MS) {
        const sens = (window._inputSens || 5);
        const scale = 0.4 + (sens - 1) / 9 * 1.2;
        this.lookX += MS.lookDx * scale;
        this.lookY += (window._invertY ? -1 : 1) * MS.lookDy * scale;
      }
      origEndFrame();
    };
  }
  patchInput();

  // ── game hooks: patch Game.update to inject mobile movement ───────────────
  function patchGame() {
    if (!window.NT || !window.NT.Game) { setTimeout(patchGame, 200); return; }
    const G = window.NT.Game;

    // Override FOV from settings (checked each camera update)
    const origUpdateCamera = G.updateCamera.bind(G);
    G.updateCamera = function (dt) {
      if (window._settingsFov) {
        // blend toward the settings FOV (the game's own logic still fine-tunes it)
        this.fov = window._settingsFov;
      }
      origUpdateCamera(dt);
    };

    // Patch shake to respect the toggle
    if (window.Shake) {
      const origAdd = window.Shake.add.bind(window.Shake);
      window.Shake.add = function (t) {
        if (window._shakeEnabled === false) return;
        origAdd(t);
      };
    }

    // Patch crosshair HUD
    if (window.HUD) {
      const origCross = window.HUD.crosshair.bind(window.HUD);
      window.HUD.crosshair = function (on, spread) {
        origCross(window._crosshairEnabled !== false && on, spread);
      };
    }
  }
  patchGame();

  // ── game hooks: inject mobile controls into the game's key/button state ───
  function patchMobileControls() {
    if (!window.NT || !window.NT.Game) { setTimeout(patchMobileControls, 200); return; }
    const G = window.NT.Game;
    const Veh = window.NT.Vehicles;
    const Wep = window.Weapons;
    const MS = window._mobileState;
    if (!MS) return;

    const origUpdate = G.update.bind(G);
    G.update = function (dt) {
      if (!MS) { origUpdate(dt); return; }

      // ── weapon selection ──
      if (MS._pendingWeapon >= 0 && Wep) {
        const names = ['pistol', 'smg', 'rocket'];
        const name = names[MS._pendingWeapon];
        if (name && Wep.has && Wep.has[name]) Wep.select(name);
        MS._pendingWeapon = -1;
      }

      // ── inject into Input.keys for the foot/drive logic ──
      const Inp = window.NT.Input;
      if (Inp) {
        const driving = G.mode === 'drive';

        if (driving) {
          // joystick Y → throttle/brake
          Inp.keys.KeyW = MS.gas || MS.joyY < -0.25;
          Inp.keys.KeyS = MS.brake || MS.joyY > 0.25;
          // joystick X → steer
          Inp.keys.KeyA = MS.joyX < -0.25;
          Inp.keys.KeyD = MS.joyX > 0.25;
          // also set analogue steer if the vehicle exposes it
          const v = G.veh;
          if (v) {
            v.inSteer = MS.joyX; // -1..1 directly
            if (MS.gas)           v.inThrottle = 1;
            else if (MS.brake) {
              const sp = Math.hypot(v.vx, v.vz);
              const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
              const movingFwd = v.vx * fx + v.vz * fz > 0.5;
              v.inThrottle = sp > 1 && movingFwd ? 0 : -1;
              v.inBrake = movingFwd && sp > 1 ? 1 : 0;
            }
          }
          Inp.keys.Space = MS.sprint; // handbrake
          // notify shell of drive mode
          if (window.parent !== window) {
            window.parent.postMessage({ __gba: true, type: 'driveMode', payload: { driving: true } }, '*');
          }
        } else {
          // foot
          // joystick → WASD
          Inp.keys.KeyW = MS.joyY < -0.25;
          Inp.keys.KeyS = MS.joyY > 0.25;
          Inp.keys.KeyA = MS.joyX < -0.25;
          Inp.keys.KeyD = MS.joyX > 0.25;
          Inp.keys.ShiftLeft = MS.sprint;
          if (MS.jump && !Inp.keys._jumpHeld) { Inp.pressed.Space = true; }
          Inp.keys._jumpHeld = MS.jump;
          Inp.keys.Space = MS.jump;
          // fire / aim
          Inp.lmb = MS.fire;
          if (MS.fire && !MS._fireHeld) Inp.lmbPressed = true;
          MS._fireHeld = MS.fire;
          Inp.rmb = MS.aim;
          // enter vehicle
          if (MS.enter && !MS._enterHeld) Inp.pressed.KeyF = true;
          MS._enterHeld = MS.enter;
          if (window.parent !== window) {
            window.parent.postMessage({ __gba: true, type: 'driveMode', payload: { driving: false } }, '*');
          }
        }
      }

      origUpdate(dt);
    };
  }
  patchMobileControls();

  // ── expose globals the receiver needs (set by the original game script) ───
  // The original game script uses module scope, so we grab refs via NT:
  //   window._renderer  → renderer
  //   window._composer  → composer
  //   window._bloomPass → bloomPass
  //   window._gradePass → gradePass
  //   window._scene     → scene
  // We set these by watching NT.
  function exposeGlobals() {
    if (!window.NT) { setTimeout(exposeGlobals, 150); return; }
    // The original code does: window.NT = { ..., renderer, ... } — but it
    // doesn't export renderer/composer directly. We grab them via the NT refs.
    // We add them to NT in game.html's script footer (see README).
    window._renderer  = window.NT.renderer;
    window._composer  = window.NT.composer;
    window._bloomPass = window.NT.bloomPass;
    window._gradePass = window.NT.gradePass;
    window._scene     = window.NT.scene;
  }
  exposeGlobals();

})();
