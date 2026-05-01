// VHS post-processing pass — scanlines, chromatic aberration, slight grain,
// occasional vertical sync roll. Wired into the EffectComposer after the
// color-grade pass.

import * as THREE from 'three';

const VHS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const VHS_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;
uniform float uTime;
uniform vec2  uResolution;
uniform float uIntensity;     // 0 = bypass, 1 = full VHS
uniform float uChromaticAmt;  // chromatic aberration in pixels
uniform float uScanlineAmt;   // scanline darkness 0..1
uniform float uGrainAmt;      // grain noise 0..1
uniform float uRollSpeed;     // sync-roll rate

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;

  // Vertical sync roll — a faint dark bar that drifts slowly down the frame.
  float roll = fract(uTime * uRollSpeed);
  float bar = smoothstep(0.04, 0.0, abs(uv.y - roll));
  // Bend the UV near the bar to fake a tape-tracking glitch.
  uv.x += bar * 0.012 * sin(uTime * 8.0);

  // Chromatic aberration: split RGB along x.
  float caPx = uChromaticAmt / uResolution.x;
  vec2 uvR = uv + vec2( caPx, 0.0);
  vec2 uvG = uv;
  vec2 uvB = uv + vec2(-caPx, 0.0);
  float r = texture2D(tDiffuse, uvR).r;
  float g = texture2D(tDiffuse, uvG).g;
  float b = texture2D(tDiffuse, uvB).b;
  vec3 col = vec3(r, g, b);

  // Scanlines — 50% duty horizontal lines tuned to physical pixel density.
  float scan = 0.5 + 0.5 * sin(uv.y * uResolution.y * 3.14159);
  col *= 1.0 - uScanlineAmt * (1.0 - scan);

  // Grain
  float grain = hash(uv * uResolution + uTime) - 0.5;
  col += grain * uGrainAmt;

  // Bar darkening over the rolling stripe
  col *= 1.0 - bar * 0.25;

  // Mix the whole effect by uIntensity so it can be cross-faded in/out.
  vec3 baseRGB = texture2D(tDiffuse, vUv).rgb;
  col = mix(baseRGB, col, uIntensity);

  gl_FragColor = vec4(col, 1.0);
}
`;

export function makeVhsShader() {
  return {
    uniforms: {
      tDiffuse:      { value: null },
      uTime:         { value: 0 },
      uResolution:   { value: new THREE.Vector2(1, 1) },
      uIntensity:    { value: 0.35 },
      uChromaticAmt: { value: 1.6 },
      uScanlineAmt:  { value: 0.18 },
      uGrainAmt:     { value: 0.05 },
      uRollSpeed:    { value: 0.07 },
    },
    vertexShader: VHS_VERT,
    fragmentShader: VHS_FRAG,
  };
}
