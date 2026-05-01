// Block wobble + breath + Fresnel rim shader.
// Used by the InstancedMesh of 3D rounded boxes in scene/board.js.
//
// Per-instance attributes: iColor, iAlpha, iIsGhost, iClearProgress.
// Uniforms: uTime, uBeatPhase, uBlockPulse, uGlow, uCellSize, uLightDir.

export const WOBBLE_VERT = /* glsl */ `
attribute vec3 iColor;
attribute float iAlpha;
attribute float iIsGhost;
attribute float iClearProgress;

uniform float uTime;
uniform float uBeatPhase;
uniform float uBlockPulse;

varying vec3 vColor;
varying float vAlpha;
varying float vIsGhost;
varying float vClear;
varying vec3 vEyeNormal;
varying vec3 vEyePos;
varying vec3 vLocalNormal;
varying vec3 vLocalPos;

void main() {
  vColor = iColor;
  vAlpha = iAlpha;
  vIsGhost = iIsGhost;
  vClear = iClearProgress;
  vLocalNormal = normal;
  vLocalPos = position;

  vec4 instanceCenter = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec4 worldCenter = modelMatrix * instanceCenter;

  float TWO_PI = 6.2831853;
  float breath = 1.0 + 0.05 * sin(uBeatPhase * TWO_PI) + uBlockPulse;
  float wave = sin(uTime * 2.5 + worldCenter.x * 0.015 + worldCenter.y * 0.008) * 0.04;
  float clearShrink = 1.0 - 0.4 * vClear;
  float scale = mix((breath + wave) * clearShrink, 1.0, iIsGhost);

  vec3 scaled = position * scale;
  vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(scaled, 1.0);
  vEyePos = mvPos.xyz;

  // Per-instance normal: instanceMatrix has uniform scale per axis here, so we
  // just rotate the local normal into world space then into eye space.
  mat3 instRot = mat3(instanceMatrix);
  vec3 worldN = normalize(instRot * normal);
  vEyeNormal = normalize(normalMatrix * worldN);

  gl_Position = projectionMatrix * mvPos;
}
`;

export const WOBBLE_FRAG = /* glsl */ `
precision highp float;

uniform vec3 uGlow;
uniform vec3 uLightDir;   // eye-space light direction (toward light)

varying vec3 vColor;
varying float vAlpha;
varying float vIsGhost;
varying float vClear;
varying vec3 vEyeNormal;
varying vec3 vEyePos;
varying vec3 vLocalNormal;
varying vec3 vLocalPos;

void main() {
  if (vAlpha < 0.001) discard;

  vec3 N = normalize(vEyeNormal);
  vec3 V = normalize(-vEyePos);
  vec3 L = normalize(uLightDir);

  float frontMask = smoothstep(0.52, 0.94, dot(N, V));
  float topMask = smoothstep(0.25, 0.95, max(0.0, -vLocalNormal.y));
  float topBand = smoothstep(0.12, 0.34, -vLocalPos.y) *
                  smoothstep(0.98, 0.76, abs(vLocalPos.x));

  // Ghost piece: dark filled blocks plus a soft Fresnel outline, matching the
  // old 2D preview rather than turning into a wireframe.
  if (vIsGhost > 0.5) {
    float fGhost = pow(1.0 - max(0.0, dot(N, V)), 2.0);
    vec3 ghostCol = vColor * mix(0.18, 0.34, frontMask) + uGlow * fGhost * 0.18;
    float a = 0.18 * frontMask + fGhost * 0.16;
    gl_FragColor = vec4(ghostCol, a);
    return;
  }

  // Keep the front face close to the original 2D palette; push lighting mostly
  // into the sides/rounded edges so depth does not recolor the blocks.
  float lambert = max(0.0, dot(N, L));
  vec3 base = mix(vColor, uGlow, clamp(vClear * 1.5, 0.0, 1.0));
  vec3 sideLit = base * (0.58 + 0.36 * lambert);
  vec3 frontLit = base * 1.05;
  vec3 lit = mix(sideLit, frontLit, frontMask);

  // Recreate the old rounded-rect shine: a soft pastel band near the top edge.
  lit += vec3(0.22) * topBand * frontMask;
  lit += base * 0.16 * topMask;

  // Fresnel rim — useful for 3D, but partly block-tinted so cyan glow does not
  // wash pink/yellow/purple pieces away from the old palette.
  float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.0);
  vec3 rim = mix(uGlow, base, 0.45) * (0.46 + 0.32 * topMask) * fresnel;
  lit += rim;

  // Soft front bloom preserves the candy-neon feel of the 2D blocks.
  float front = pow(max(0.0, dot(N, V)), 8.0);
  lit += base * front * 0.12;

  float a = vAlpha * (1.0 - vClear * 0.6);
  gl_FragColor = vec4(min(lit, vec3(1.0)), a);
}
`;
