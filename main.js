// main.js — Grand Buffer Auto by BufferClick
// Bootstraps all modules, wires settings, runs the game loop.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

import { Tick, clamp, lerp, damp, rnd, rndi, pick, wrapAngle, angleDamp, sstep } from './utils.js';
import { Settings } from './settings.js';
import { Input, MobileInput } from './input.js';
import { Shake, SlowMo } from './fx.js';
import { CONFIG, ROADS, Graph, Colliders, CityData, groundHeightAt, isWaterAt, buildGraph } from './world.js';
import { buildCity, CityFX } from './city.js';
import { TEX } from './textures.js';
import { Sky, Ocean } from './environment.js';
import { Particles, Tracers, Casings, Debris, FX, Rockets, Combat, Weapons, Pickups } from './combat.js';
import { Peds, Vehicles, Police, Wanted } from './entities.js';
import { AudioFX, Music } from './audio.js';
import { HUD } from './hud.js';
import { Game } from './game.js';

// ── renderer ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('gl');
export const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false,
  powerPreference: 'high-performance', stencil: false
});
export const BASE_PR = Math.min(window.devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(BASE_PR);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvas.addEventListener('webglcontextlost', e => e.preventDefault(), false);

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(CONFIG.fogColor.getHex(), CONFIG.fogDensity);

export const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 4200);
camera.position.set(140, 14, 290);

// ── post processing ────────────────────────────────────────────────────────────
export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime:    { value: 0 },
    uVig:     { value: 1.05 },
    uFlash:   { value: 0 },
    uDamage:  { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVig, uFlash, uDamage;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb += (1.0 - smoothstep(0.0,0.55,l)) * vec3(-0.010,0.006,0.050);
      c.rgb *= vec3(1.05,0.995,0.945);
      vec2 q = vUv - 0.5;
      c.rgb *= 1.0 - dot(q,q) * uVig;
      float d = uDamage * smoothstep(0.06,0.55,dot(q,q));
      c.rgb = mix(c.rgb, vec3(0.62,0.04,0.07), clamp(d,0.0,0.85));
      c.rgb = mix(c.rgb, vec3(3.2,3.1,3.0), clamp(uFlash,0.0,1.0));
      c.rgb += (hash(vUv*1731.7 + fract(uTime)*91.3) - 0.5) * 0.014;
      gl_FragColor = c;
    }`,
};

const composerTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
  type: THREE.HalfFloatType, samples: 4,
});
export const composer = new EffectComposer(renderer, composerTarget);
composer.setPixelRatio(BASE_PR);
composer.setSize(window.innerWidth, window.innerHeight);
export const renderPass   = new RenderPass(scene, camera);
export const bloomPass    = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.4, 0.85);
export const gradePass    = new ShaderPass(GradeShader);
export const outputPass   = new OutputPass();
composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(gradePass);
composer.addPass(outputPass);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ── quality presets ────────────────────────────────────────────────────────────
export const Quality = {
  scale: 1, ema: 14, busyEma: 8, cool: 0, shadowTier: 0,
  autoEnabled: true,

  PRESETS: {
    0: { pr: 0.4,  bloom: false, shadow: 512,  fog: 0.0014, shadowEnabled: false, label: 'Potato'  },
    1: { pr: 0.6,  bloom: false, shadow: 512,  fog: 0.0012, shadowEnabled: true,  label: 'Low'     },
    2: { pr: 0.85, bloom: true,  shadow: 1024, fog: 0.001,  shadowEnabled: true,  label: 'Medium'  },
    3: { pr: 1.0,  bloom: true,  shadow: 2048, fog: 0.00085,shadowEnabled: true,  label: 'High'    },
    4: { pr: 1.5,  bloom: true,  shadow: 4096, fog: 0.00085,shadowEnabled: true,  label: 'Ultra'   },
  },

  applyPreset(level) {
    const p = this.PRESETS[level];
    if (!p) return;
    const pr = Math.min(BASE_PR * p.pr, BASE_PR * 1.5);
    renderer.setPixelRatio(pr);
    composer.setPixelRatio(pr);
    bloomPass.enabled = p.bloom && Settings.bloom;
    renderer.shadowMap.enabled = p.shadowEnabled;
    if (renderer.shadowMap.enabled) {
      const light = scene.userData.sunLight;
      if (light) {
        light.shadow.mapSize.set(p.shadow, p.shadow);
        if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
      }
    }
    scene.fog.density = p.fog;
  },

  update(rawMs, busyMs, dt) {
    if (!this.autoEnabled) return;
    this.ema = lerp(this.ema, Math.min(rawMs, 80), 0.04);
    this.busyEma = lerp(this.busyEma, Math.min(busyMs, 80), 0.04);
    this.cool -= dt;
    if (this.cool > 0) return;
    if (this.ema > 17.6 && this.scale > 0.55) {
      this.scale = Math.max(0.55, this.scale - 0.1);
      renderer.setPixelRatio(BASE_PR * this.scale);
      composer.setPixelRatio(BASE_PR * this.scale);
      this.cool = 1.6;
    } else if (this.scale < 1 && (this.ema < 12.8 || (this.ema < 17.2 && this.busyEma < 10))) {
      this.scale = Math.min(1, this.scale + 0.05);
      renderer.setPixelRatio(BASE_PR * this.scale);
      composer.setPixelRatio(BASE_PR * this.scale);
      this.cool = 2.8;
    }
  },
};

// ── boot ────────────────────────────────────────────────────────────────────────
Settings.init(Quality, bloomPass, camera, AudioFX);
buildGraph();

// detect mobile
const isMobile = /Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent) || window.matchMedia('(pointer:coarse)').matches;
if (isMobile) document.body.classList.add('mobile');

// async init order
(async () => {
  await TEX.build(renderer);
  Sky.init(scene, renderer, camera, CONFIG);
  Ocean.init(scene, CONFIG);
  buildCity(scene, renderer, Colliders, CityData, Graph, TEX, CONFIG, CityFX, groundHeightAt);
  Particles.init(scene, TEX);
  Tracers.init(scene);
  Casings.init(scene);
  Debris.init(scene);
  Rockets.init(scene);
  FX.init(scene, TEX, Particles);
  Vehicles.init(scene, TEX, renderer, Colliders, groundHeightAt);
  Vehicles.spawnParked();
  Peds.init(scene, TEX, CityData, Colliders, groundHeightAt);
  Police.init(scene, TEX, Vehicles, Peds, Colliders, groundHeightAt);
  Pickups.init(scene, TEX, Weapons, GUN_PROTO);
  HUD.init();
  Game.init(scene, camera, renderer, composer, gradePass, bloomPass, Quality, Settings,
            Shake, SlowMo, Input, MobileInput, Tick,
            Vehicles, Peds, Police, Wanted, Weapons, Rockets, Combat, Particles, FX, Pickups,
            Tracers, Casings, Debris, AudioFX, Music, Sky, Ocean, CityFX, HUD,
            groundHeightAt, isWaterAt, Colliders, CONFIG, TEX);
  Input.init(canvas);
  MobileInput.init();
  Quality.applyPreset(Settings.gfxLevel);
  requestAnimationFrame(frame);
  requestAnimationFrame(() => document.getElementById('fade').classList.add('clear'));
})();

// ── main loop ──────────────────────────────────────────────────────────────────
let _lastNow = performance.now();
let _fpsFrames = 0, _fpsTime = 0, _fps = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const rawMs = now - _lastNow;
  _lastNow = now;
  const rawDt = clamp(rawMs / 1000, 0.0005, 0.05);
  SlowMo.update(rawDt);
  const dt = rawDt * Tick.scale;
  Tick.rawDt = rawDt;
  Tick.dt = dt;
  Tick.t += dt;
  Tick.frame++;

  // fps counter
  _fpsFrames++;
  _fpsTime += rawDt;
  if (_fpsTime >= 0.5) {
    _fps = Math.round(_fpsFrames / _fpsTime);
    _fpsFrames = 0; _fpsTime = 0;
    if (Settings.showFps) {
      const el = document.getElementById('fpsCounter');
      el.textContent = `FPS: ${_fps}`;
    }
  }

  Game.update(dt, rawDt);
  composer.render();
  Quality.update(rawMs, performance.now() - now, rawDt);
  Input.endFrame();
  MobileInput.endFrame();
}
