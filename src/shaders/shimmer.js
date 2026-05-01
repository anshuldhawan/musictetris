import { SIMPLEX_2D } from './noise.glsl.js';

// Noise-based shimmer for the gutter background planes.
// One quad per gutter (left + right of the playfield).

export const SHIMMER_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SHIMMER_FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uBeatPhase;
uniform vec3 uBgA;
uniform vec3 uBgB;
uniform vec3 uGlow;
uniform vec3 uParticles;
uniform float uIntensity;

varying vec2 vUv;

${SIMPLEX_2D}

void main() {
  vec2 uv = vUv;

  // Beat-driven swell: 0..1 across the bar, peaks on the downbeat.
  float beatSin = sin(uBeatPhase * 6.2831853);
  float beatPulse = 0.5 + 0.5 * beatSin;

  // Layered noise — second octave's drift speed swells with the beat so the
  // caustics visibly accelerate on each pulse.
  float n1 = snoise(uv * 3.0 + vec2(uTime * 0.05, uTime * 0.07));
  float n2 = snoise(uv * 6.0 - vec2(uTime * (0.03 + 0.06 * beatPulse),
                                     uTime * (0.09 + 0.05 * beatPulse)));
  float shimmer = 0.5 + 0.5 * (n1 * 0.7 + n2 * 0.3);

  vec3 base = mix(uBgA, uBgB, shimmer);

  // Caustic highlights now ride uParticles (the same colour as the drifting
  // gutter dots) and intensify on the beat. uGlow stays as a faint accent.
  float caustic = pow(max(0.0, sin(shimmer * 6.2831853 + uTime)), 8.0);
  vec3 col = base + uParticles * caustic * (0.06 + 0.1 * beatPulse) * uIntensity;
  col += uGlow * caustic * 0.03 * uIntensity;

  // Whole-gutter beat brightening, stronger than before.
  col *= 1.0 + 0.05 * beatSin * uIntensity;

  // Soft fade-in from the playfield edge so the shimmer doesn't have a hard seam.
  // u=0 sits next to the playfield for both gutters (UV is mirrored on the right).
  float edge = smoothstep(0.0, 0.18, vUv.x);
  gl_FragColor = vec4(col, edge * (0.52 + 0.24 * uIntensity));
}
`;
