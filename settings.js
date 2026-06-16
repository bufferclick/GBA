// settings.js — Settings manager + panel UI

export const Settings = {
  gfxLevel:   2,
  fov:        62,
  sensitivity: 5,
  shake:      true,
  masterVol:  0.8,
  musicVol:   0.5,
  sfxVol:     0.9,
  invertY:    false,
  joystickSize: 100,
  btnOpacity: 0.8,
  bloom:      true,
  motionBlur: false,
  showFps:    false,
  crosshair:  true,
  minimap:    true,
  autoQual:   true,
  shadowDist: 3,

  _Q: null, _bloom: null, _camera: null, _audio: null,
  _open: false,

  init(Quality, bloomPass, camera, AudioFX) {
    this._Q = Quality;
    this._bloom = bloomPass;
    this._camera = camera;
    this._audio = AudioFX;
    this._load();
    this._buildUI();
  },

  _load() {
    try {
      const raw = localStorage.getItem('gba_settings');
      if (!raw) return;
      const d = JSON.parse(raw);
      Object.assign(this, d);
    } catch(e) {}
  },

  save() {
    const keys = ['gfxLevel','fov','sensitivity','shake','masterVol','musicVol',
                  'sfxVol','invertY','joystickSize','btnOpacity','bloom','motionBlur',
                  'showFps','crosshair','minimap','autoQual','shadowDist'];
    const d = {};
    keys.forEach(k => d[k] = this[k]);
    try { localStorage.setItem('gba_settings', JSON.stringify(d)); } catch(e) {}
  },

  open() {
    this._open = true;
    document.getElementById('settingsPanel').classList.remove('hidden');
    // release pointer lock so the cursor is visible
    if (document.pointerLockElement) document.exitPointerLock();
  },

  close() {
    this._open = false;
    document.getElementById('settingsPanel').classList.add('hidden');
    this.save();
    this._applyAll();
  },

  isOpen() { return this._open; },

  _applyAll() {
    // graphics
    this._Q.applyPreset(this.gfxLevel);
    this._Q.autoEnabled = this.autoQual;
    // bloom
    if (this._bloom) this._bloom.enabled = this.bloom;
    // fov handled per-frame in Game.updateCamera
    // audio
    if (this._audio && this._audio.master) {
      this._audio.master.gain.value = this.masterVol;
      if (this._audio.musicBus) this._audio.musicBus.gain.value = this.musicVol * 0.5;
      if (this._audio.sfx) this._audio.sfx.gain.value = this.sfxVol;
    }
    // joystick size
    const joy = document.getElementById('joystick');
    if (joy) {
      joy.style.width = joy.style.height = this.joystickSize + 'px';
      const knob = document.getElementById('joystickKnob');
      if (knob) knob.style.width = knob.style.height = (this.joystickSize * 0.4) + 'px';
    }
    // button opacity
    document.querySelectorAll('.mBtn').forEach(b => {
      b.style.opacity = this.btnOpacity / 100;
    });
    // fps counter
    const fpsEl = document.getElementById('fpsCounter');
    if (fpsEl) fpsEl.classList.toggle('hidden', !this.showFps);
    // minimap
    const mm = document.getElementById('mapWrap');
    if (mm) mm.style.visibility = this.minimap ? 'visible' : 'hidden';
  },

  _buildUI() {
    const panel = document.getElementById('settingsPanel');
    const closeBtn = document.getElementById('settingsClose');

    // close
    closeBtn.addEventListener('click', () => this.close());
    panel.addEventListener('click', e => { if (e.target === panel) this.close(); });

    // keyboard ESC (desktop)
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape') {
        if (this._open) this.close();
        else this.open();
      }
    });

    // settings button on mobile HUD
    const mbtn = document.getElementById('btnSettings');
    if (mbtn) mbtn.addEventListener('click', () => {
      if (this._open) this.close(); else this.open();
    });
    // also wire the id that might be used differently
    const mbtn2 = document.getElementById('btnSettingsMobile');
    if (mbtn2 && mbtn2 !== mbtn) mbtn2.addEventListener('click', () => {
      if (this._open) this.close(); else this.open();
    });

    // ── graphics quality ──
    document.querySelectorAll('#gfxGroup .sBtn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#gfxGroup .sBtn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.gfxLevel = parseInt(btn.dataset.val);
        this._Q.applyPreset(this.gfxLevel);
      });
    });
    // set initial active
    document.querySelectorAll('#gfxGroup .sBtn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.val) === this.gfxLevel);
    });

    // ── FOV ──
    const fovSlider = document.getElementById('fovSlider');
    const fovVal    = document.getElementById('fovVal');
    fovSlider.value = this.fov;
    fovVal.textContent = this.fov;
    fovSlider.addEventListener('input', () => {
      this.fov = parseInt(fovSlider.value);
      fovVal.textContent = this.fov;
    });

    // ── mouse sensitivity ──
    const sensSlider = document.getElementById('sensSlider');
    const sensVal    = document.getElementById('sensVal');
    sensSlider.value = this.sensitivity;
    sensVal.textContent = this.sensitivity;
    sensSlider.addEventListener('input', () => {
      this.sensitivity = parseInt(sensSlider.value);
      sensVal.textContent = this.sensitivity;
    });

    // ── camera shake ──
    this._toggle('shakeToggle', 'shake');

    // ── master volume ──
    this._slider('volSlider', 'volVal', 'masterVol', 100, v => {
      if (this._audio && this._audio.master) this._audio.master.gain.value = v;
    });

    // ── music volume ──
    this._slider('musicVolSlider', 'musicVolVal', 'musicVol', 100, v => {
      if (this._audio && this._audio.musicBus) this._audio.musicBus.gain.value = v * 0.5;
    });

    // ── sfx volume ──
    this._slider('sfxVolSlider', 'sfxVolVal', 'sfxVol', 100, v => {
      if (this._audio && this._audio.sfx) this._audio.sfx.gain.value = v;
    });

    // ── invert Y ──
    this._toggle('invertYToggle', 'invertY');

    // ── joystick size ──
    this._slider('joySlider', 'joyVal', 'joystickSize', 1, v => {
      const joy = document.getElementById('joystick');
      if (!joy) return;
      joy.style.width = joy.style.height = v + 'px';
      const knob = document.getElementById('joystickKnob');
      if (knob) knob.style.width = knob.style.height = (v * 0.4) + 'px';
    });

    // ── button opacity ──
    this._slider('btnOpacSlider', 'btnOpacVal', 'btnOpacity', 1, v => {
      document.querySelectorAll('.mBtn').forEach(b => b.style.opacity = v / 100);
    });

    // ── bloom ──
    this._toggle('bloomToggle', 'bloom', v => {
      if (this._bloom) this._bloom.enabled = v;
    });

    // ── motion blur ──
    this._toggle('motionBlurToggle', 'motionBlur');

    // ── show fps ──
    this._toggle('fpsToggle', 'showFps', v => {
      document.getElementById('fpsCounter').classList.toggle('hidden', !v);
    });

    // ── crosshair ──
    this._toggle('crosshairToggle', 'crosshair');

    // ── minimap ──
    this._toggle('minimapToggle', 'minimap', v => {
      const mm = document.getElementById('mapWrap');
      if (mm) mm.style.visibility = v ? 'visible' : 'hidden';
    });

    // ── auto quality ──
    this._toggle('autoQualToggle', 'autoQual', v => {
      this._Q.autoEnabled = v;
    });

    // ── shadow distance ──
    this._slider('shadowSlider', 'shadowVal', 'shadowDist', 1, v => {
      const light = panel.ownerDocument.querySelector('canvas').__scene?.userData?.sunLight;
      if (!light) return;
      const sizes = [256, 512, 1024, 2048, 4096];
      const s = sizes[Math.min(v - 1, sizes.length - 1)];
      light.shadow.mapSize.set(s, s);
      if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
    });

    // apply stored values on start
    this._applyAll();
  },

  _toggle(id, key, cb) {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.on = String(this[key]);
    el.textContent = this[key] ? 'ON' : 'OFF';
    el.addEventListener('click', () => {
      this[key] = !this[key];
      el.dataset.on = String(this[key]);
      el.textContent = this[key] ? 'ON' : 'OFF';
      if (cb) cb(this[key]);
    });
  },

  _slider(id, valId, key, div, cb) {
    const slider = document.getElementById(id);
    const valEl  = document.getElementById(valId);
    if (!slider) return;
    slider.value = this[key] * div;
    if (valEl) valEl.textContent = Math.round(this[key] * div);
    slider.addEventListener('input', () => {
      this[key] = parseInt(slider.value) / div;
      if (valEl) valEl.textContent = Math.round(this[key] * div);
      if (cb) cb(this[key]);
    });
  },
};
