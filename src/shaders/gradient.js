// Radial-gradient background quad (replaces drawBackground in the old main.js).

export const GRADIENT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const GRADIENT_FRAG = /* glsl */ `
precision highp float;

uniform vec3 uBgA;
uniform vec3 uBgB;
uniform vec3 uGlow;
uniform float uBeatPhase;

varying vec2 vUv;

void main() {
  vec2 p = vUv - 0.5;
  // Stretch with aspect so the gradient feels like the old radial-gradient call.
  float d = length(p) * 1.4;
  vec3 col = mix(uBgB, uBgA, smoothstep(0.0, 0.7, d));

  // Subtle vignette tint synced to beat.
  float pulse = 0.4 + 0.6 * (0.5 + 0.5 * sin(uBeatPhase * 6.2831853));
  col += uGlow * 0.04 * pulse;

  gl_FragColor = vec4(col, 1.0);
}
`;
