import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }    from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass }    from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass }    from 'three/addons/postprocessing/OutputPass.js';

import { PALETTES, lerpColor } from './palette.js';
import { easeInOut } from './effects.js';

import { makeBoardScene }       from './scene/board.js';
import { makeBackgroundScene }  from './scene/background.js';
import { makeShapesScene }      from './scene/shapes.js';
import { makeClusterScene }     from './scene/clusters.js';
import { makeParticlesScene }   from './scene/particles.js';
import { makePortalsScene }     from './scene/portals.js';
import { makeColorGradeShader } from './shaders/colorGrade.js';
import { makeVhsShader }        from './shaders/vhs.js';

let renderer, scene, camera, composer, colorGradePass, vhsPass;
let bg, board, shapes, clusters, particlesScene, portalsScene;
let viewport = { W: 0, H: 0 };
let cameraDistance = 1000;
const CAMERA_FOV = 45;

export function initRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(renderPixelRatio(window.innerWidth));
  renderer.setClearColor(0x000000, 1);

  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
  keyLight.position.set(-0.4, -0.65, 1.0);
  scene.add(keyLight);

  // Perspective camera with a flipped projection-Y term. At z=0, one world
  // unit maps to one CSS pixel, so the existing canvas-pixel layout survives.
  camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 1, 6000);

  bg             = makeBackgroundScene(scene);
  clusters       = makeClusterScene(scene);
  shapes         = makeShapesScene(scene);
  particlesScene = makeParticlesScene(scene);
  portalsScene   = makePortalsScene(scene);
  board          = makeBoardScene(scene);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const grade = makeColorGradeShader();
  colorGradePass = new ShaderPass(grade);
  composer.addPass(colorGradePass);
  const vhs = makeVhsShader();
  vhsPass = new ShaderPass(vhs);
  composer.addPass(vhsPass);
  composer.addPass(new OutputPass());

  resizeRenderer(window.innerWidth, window.innerHeight);
}

export function resizeRenderer(W, H) {
  viewport.W = W;
  viewport.H = H;
  const dpr = renderPixelRatio(W);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  composer.setPixelRatio(dpr);
  composer.setSize(W, H);

  camera.aspect = W / Math.max(1, H);
  camera.fov = CAMERA_FOV;
  cameraDistance = (H / 2) / Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
  camera.position.set(W / 2, H / 2, cameraDistance);
  camera.lookAt(W / 2, H / 2, 0);
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[5] *= -1;

  if (vhsPass) {
    vhsPass.uniforms.uResolution.value.set(W * dpr, H * dpr);
  }
}

export function viewportSize() {
  return viewport;
}

export function rendererPixelRatio() {
  return renderer ? renderer.getPixelRatio() : 1;
}

function renderPixelRatio(width) {
  const native = window.devicePixelRatio || 1;
  const cap = width < 700 ? 1 : 1.25;
  return Math.min(native, cap);
}

const tmpFromColor = new THREE.Color();
const tmpToColor = new THREE.Color();
const tintColor = new THREE.Color();

export function renderFrame(state) {
  const { effects, palette, frenzyState } = state;

  // Camera shake — apply to camera position so the entire scene shakes.
  const [sx, sy] = effects.shakeOffset();
  const cx = viewport.W / 2 + sx;
  const cy = viewport.H / 2 + sy;
  camera.position.set(cx, cy, cameraDistance);
  camera.lookAt(cx, cy, 0);
  camera.updateMatrixWorld();
  state.cameraDistance = cameraDistance;

  // Update each scene module.
  bg.update(state);
  clusters.updateBursts(state.dt || 0);
  clusters.update(state);
  shapes.update(state);
  particlesScene.update(state);
  portalsScene.update(state);
  board.update(state);

  // Color-grade pass uniforms.
  const u = colorGradePass.uniforms;
  u.uBeatPhase.value = state.beatPhase;
  u.uIsFrenzy.value = frenzyState === 'frenzy' ? 1 : 0;
  u.uSaturation.value = 1.0 + (frenzyState === 'frenzy' ? 0.2 : 0.0);
  u.uHueShift.value = 0;
  u.uFlash.value = effects.flash;
  u.uFlashColor.value.set(palette.glow);

  // Palette-transition tint — blend old glow → new glow as the swap eases.
  if (effects.paletteT < 1) {
    const fromGlow = PALETTES[effects.paletteFromIdx].glow;
    const toGlow = PALETTES[effects.paletteToIdx].glow;
    const t = easeInOut(effects.paletteT);
    const blended = lerpColor(fromGlow, toGlow, t);
    tintColor.set(blended);
    u.uTint.value.copy(tintColor);
    u.uTintMix.value = 0.18 * (1 - effects.paletteT);
  } else {
    u.uTint.value.setRGB(1, 1, 1);
    u.uTintMix.value = 0;
  }

  const v = vhsPass.uniforms;
  const paletteRush = effects.paletteT < 1 ? (1 - effects.paletteT) : 0;
  const clearRush = state.clearProgress || 0;
  const frenzyBoost = frenzyState === 'frenzy' ? 0.22 : frenzyState === 'warning' ? 0.1 : 0;
  const beat = Math.max(0, Math.sin(state.beatPhase * Math.PI * 2));
  v.uTime.value = state.time;
  v.uIntensity.value = Math.min(
    0.28,
    frenzyBoost * 0.45 + effects.flash * 0.12 + paletteRush * 0.06 + clearRush * 0.08,
  );
  v.uChromaticAmt.value = 0.35 + frenzyBoost * 2.3 + beat * 0.12;
  v.uScanlineAmt.value = 0.035 + frenzyBoost * 0.12;
  v.uGrainAmt.value = 0.008 + frenzyBoost * 0.035 + effects.flash * 0.018;
  v.uRollSpeed.value = 0.025 + frenzyBoost * 0.09;

  composer.render();
}

export function emitClusterRowClear(layout, rows, power) {
  if (clusters) clusters.emitRowClear(layout, rows, power);
}
