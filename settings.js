// settings.js — Grand Buffer Auto
// Manages all user settings, persists to localStorage,
// and sends commands to game.html via postMessage.

const GBA = window.GBA = {};

GBA.Settings = {

  // defaults
  gfxLevel:    2,
  fov:         62,
  sensitivity: 5,
  invertY:     false,
  shake:       true,
  bob:         true,
  joystickSize:110,
  btnOpacity:  80,
  masterVol:   80,
  musicVol:    50,
  sfxVol:      90,
  bloom:       true,
  grain:       true,
  shadows:     true,
  drawDist:    3,
  showFps:     false,
  crosshair:   true,
  minimap:     true,
  starsHUD:    true,
  hudOpacity:  100,
  autoRes:     true,
  trafficDensity: 3,
  pedDensity:  3,
  particleQual: 3,

  // ── lifecycle ───────────────────────────────────────────
  init() {
    this._load();
    this._buildUI();
    this._applyAll();
  },

  _load() {
    try {
      const raw = localStorage.getItem('gba_s');
      if (!raw) return;
      Object.assign(this, JSON.parse(raw));
    } catch(e) {}
  },

  save() {
    try { localStorage.setItem('gba_s', JSON.stringify(this._serialise())); } catch(e) {}
  },

  _serialise() {
    const keys = [
      'gfxLevel','fov','sensitivity','invertY','shake','bob',
      'joystickSize','btnOpacity','masterVol','musicVol','sfxVol',
      'bloom','grain','shadows','drawDist','showFps','crosshair',
      'minimap','starsHUD','hudOpacity','autoRes',
      'trafficDensity','pedDensity','particleQual',
    ];
    const o = {};
    keys.forEach(k => o[k] = this[k]);
    return o;
  },

  // ── panel open / close ──────────────────────────────────
  open() {
    document.getElementById('settingsPanel').classList.remove('hidden');
    this._panel_open = true;
  },
  close() {
    document.getElementById('settingsPanel').classList.add('hidden');
    this._panel_open = false;
    this.save();
    this._applyAll();
  },
  isOpen() { return !!this._panel_open; },

  // ── send a command to the game iframe ───────────────────
  _cmd(type, payload) {
    const frame = document.getElementById('gameFrame');
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage({ __gba: true, type, payload }, '*');
    }
  },

  // ── apply everything ────────────────────────────────────
  _applyAll() {
    this._cmd('settings', this._serialise());
    this._applyMobileUI();
    this._applyFps();
    this._applyHUD();
  },

  _applyMobileUI() {
    const base = document.getElementById('joystickBase');
    if (base) {
      base.style.width  = this.joystickSize + 'px';
      base.style.height = this.joystickSize + 'px';
    }
    const knob = document.getElementById('joystickKnob');
    if (knob) {
      const ks = Math.round(this.joystickSize * 0.4);
      knob.style.width = ks + 'px';
      knob.style.height = ks + 'px';
    }
    const opac = this.btnOpacity / 100;
    document.querySelectorAll('.mBtn, .wBtn').forEach(b => b.style.opacity = opac);
  },

  _applyFps() {
    const el = document.getElementById('fpsCounter');
    if (el) el.classList.toggle('hidden', !this.showFps);
  },

  _applyHUD() {
    const hud = document.getElementById('mobileUI');
    if (hud) hud.style.opacity = this.hudOpacity / 100;
  },

  // ── UI builder ──────────────────────────────────────────
  _buildUI() {
    // close button + backdrop click
    document.getElementById('settingsClose').addEventListener('click', () => this.close());
    document.getElementById('settingsPanel').addEventListener('click', e => {
      if (e.target.id === 'settingsPanel') this.close();
    });

    // ESC key (desktop)
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape') {
        if (this.isOpen()) this.close(); else this.open();
      }
    });

    // settings button in mobile UI
    const mset = document.getElementById('mSettings');
    if (mset) mset.addEventListener('click', () => {
      if (this.isOpen()) this.close(); else this.open();
    });

    // ── graphics preset ──────────────────────────────────
    document.querySelectorAll('#gfxGroup .sBtn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.val) === this.gfxLevel);
      btn.addEventListener('click', () => {
        document.querySelectorAll('#gfxGroup .sBtn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.gfxLevel = parseInt(btn.dataset.val);
        this._cmd('gfx', { level: this.gfxLevel });
      });
    });

    // ── sliders ──────────────────────────────────────────
    this._sl('fovSlider',       'fovVal',        'fov',          1, v => this._cmd('fov', { v }));
    this._sl('sensSlider',      'sensVal',        'sensitivity',  1, v => this._cmd('sens', { v }));
    this._sl('drawSlider',      'drawVal',        'drawDist',     1, v => this._cmd('draw', { v }));
    this._sl('joySizeSlider',   'joyVal',         'joystickSize', 1, () => this._applyMobileUI());
    this._sl('btnOpacSlider',   'btnOpacVal',     'btnOpacity',   1, () => this._applyMobileUI());
    this._sl('masterVolSlider', 'masterVolVal',   'masterVol',    1, v => this._cmd('vol', { master: v/100 }));
    this._sl('musicVolSlider',  'musicVolVal',    'musicVol',     1, v => this._cmd('vol', { music: v/100 }));
    this._sl('sfxVolSlider',    'sfxVolVal',      'sfxVol',       1, v => this._cmd('vol', { sfx: v/100 }));
    this._sl('hudOpacSlider',   'hudOpacVal',     'hudOpacity',   1, () => this._applyHUD());
    this._sl('trafficSlider',   'trafficVal',     'trafficDensity',1,v => this._cmd('traffic', { v }));
    this._sl('pedSlider',       'pedVal',         'pedDensity',   1, v => this._cmd('peds', { v }));
    this._sl('partSlider',      'partVal',        'particleQual', 1, v => this._cmd('particles', { v }));

    // ── toggles ──────────────────────────────────────────
    this._tog('bloomToggle',     'bloom',      v => this._cmd('bloom', { v }));
    this._tog('grainToggle',     'grain',      v => this._cmd('grain', { v }));
    this._tog('shadowToggle',    'shadows',    v => this._cmd('shadows', { v }));
    this._tog('shakeToggle',     'shake',      v => this._cmd('shake', { v }));
    this._tog('bobToggle',       'bob',        v => this._cmd('bob', { v }));
    this._tog('invertYToggle',   'invertY',    v => this._cmd('invertY', { v }));
    this._tog('fpsToggle',       'showFps',    () => this._applyFps());
    this._tog('crosshairToggle', 'crosshair',  v => this._cmd('crosshair', { v }));
    this._tog('minimapToggle',   'minimap',    v => this._cmd('minimap', { v }));
    this._tog('starsToggle',     'starsHUD',   v => this._cmd('starsHUD', { v }));
    this._tog('autoResToggle',   'autoRes',    v => this._cmd('autoRes', { v }));
  },

  _sl(sliderId, valId, key, div, cb) {
    const slider = document.getElementById(sliderId);
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

  _tog(id, key, cb) {
    const el = document.getElementById(id);
    if (!el) return;
    const sync = () => {
      el.dataset.on = String(this[key]);
      el.textContent = this[key] ? 'ON' : 'OFF';
    };
    sync();
    el.addEventListener('click', () => {
      this[key] = !this[key];
      sync();
      if (cb) cb(this[key]);
    });
  },
};
