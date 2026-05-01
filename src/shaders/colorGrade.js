// Post-processing color grade pass. Wired into EffectComposer in renderer.js.
// Driven by frenzy state, palette transitions, beat, and the legacy flash overlay.

import * as THREE from 'three';

const COLOR_GRADE_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;
uniform float uHueShift;
uniform float uSaturation;
uniform vec3  uTint;
uniform float uTintMix;
uniform float uFlash;
uniform vec3  uFlashColor;
uniform float uBeatPhase;
uniform float uIsFrenzy;

varying vec2 vUv;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)),
              d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec3 col = texture2D(tDiffuse, vUv).rgb;

  // Hue shift
  vec3 hsv = rgb2hsv(col);
  hsv.x = fract(hsv.x + uHueShift);
  // Saturation (with subtle beat pulse)
  float sat = uSaturation * (1.0 + 0.03 * sin(uBeatPhase * 6.2831853));
  hsv.y = clamp(hsv.y * sat, 0.0, 1.0);
  col = hsv2rgb(hsv);

  // Palette-transition tint blend
  col = mix(col, col * uTint, uTintMix);

  // Frenzy: warm push
  col = mix(col, col * vec3(1.08, 0.92, 0.86), 0.4 * uIsFrenzy);

  // Flash overlay (replaces the old fillRect flash)
  col = mix(col, uFlashColor, uFlash * 0.6);

  gl_FragColor = vec4(col, 1.0);
}
`;

const COLOR_GRADE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export function makeColorGradeShader() {
  return {
    uniforms: {
      tDiffuse:    { value: null },
      uHueShift:   { value: 0 },
      uSaturation: { value: 1 },
      uTint:       { value: new THREE.Color(1, 1, 1) },
      uTintMix:    { value: 0 },
      uFlash:      { value: 0 },
      uFlashColor: { value: new THREE.Color(1, 1, 1) },
      uBeatPhase:  { value: 0 },
      uIsFrenzy:   { value: 0 },
    },
    vertexShader: COLOR_GRADE_VERT,
    fragmentShader: COLOR_GRADE_FRAG,
  };
}
