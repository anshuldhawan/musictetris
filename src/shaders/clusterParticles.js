import * as THREE from 'three';

export const CLUSTER_PARTICLES_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aColorMix;

uniform float uPixelRatio;
uniform float uBeatPhase;
uniform float uFrenzy;

varying float vAlpha;
varying float vColorMix;

void main() {
  vAlpha = aAlpha;
  vColorMix = aColorMix;

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;

  float beat = 0.5 + 0.5 * sin(uBeatPhase * 6.2831853);
  float pulse = 1.0 + beat * 0.2 + uFrenzy * 0.25;
  gl_PointSize = aSize * pulse * uPixelRatio;
}
`;

export const CLUSTER_PARTICLES_FRAG = /* glsl */ `
precision highp float;

uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uTime;

varying float vAlpha;
varying float vColorMix;

float ring(float d, float r, float w) {
  return smoothstep(w, 0.0, abs(d - r));
}

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  if (d > 0.5) discard;

  float core = smoothstep(0.5, 0.0, d);
  float halo = pow(core, 2.0);
  float sparkle = ring(d, 0.22 + 0.025 * sin(uTime * 3.0 + vColorMix * 9.0), 0.055);

  vec3 col = mix(uColorA, uColorB, vColorMix);
  float alpha = vAlpha * (halo * 0.78 + sparkle * 0.22);
  gl_FragColor = vec4(col, alpha);
}
`;

export function makeClusterParticlesMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: CLUSTER_PARTICLES_VERT,
    fragmentShader: CLUSTER_PARTICLES_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime:       { value: 0 },
      uPixelRatio: { value: 1 },
      uBeatPhase: { value: 0 },
      uFrenzy:     { value: 0 },
      uColorA:     { value: new THREE.Color(0xffffff) },
      uColorB:     { value: new THREE.Color(0xffffff) },
    },
  });
}
