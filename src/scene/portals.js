import * as THREE from 'three';
import { getPortalPositions } from '../portals.js';

export function makePortalsScene(scene) {
  const portals = [makePortal(), makePortal()];
  for (const p of portals) scene.add(p.group);

  function makePortal() {
    const ringGeom = new THREE.PlaneGeometry(1, 1);
    const ringMat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(0xffffff) },
        uPulse: { value: 0 },
        uHover: { value: 0 },
        uAngle: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 uColor;
        uniform float uPulse;
        uniform float uHover;
        uniform float uAngle;
        varying vec2 vUv;

        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float d = length(p);
          // Outer ring at r ~ 0.78 (scaled to 0.62 of half-extent).
          float outerR = 0.62 * (1.0 + 0.12 * uHover);
          float innerR = outerR * 0.78;

          float outerWidth = 0.02 + 0.01 * uPulse;
          float innerWidth = 0.012;

          float outerRing = smoothstep(outerWidth, 0.0, abs(d - outerR));
          float innerRing = smoothstep(innerWidth, 0.0, abs(d - innerR)) * 0.55;

          // Translucent inner disc
          float disc = (1.0 - smoothstep(innerR - 0.02, innerR, d)) * (0.12 + 0.08 * uPulse);

          // Outer glow halo
          float glow = exp(-max(d - outerR, 0.0) * 12.0) * (0.4 + 0.4 * uPulse + 0.5 * uHover);

          // Orbiting bright dots — 12 of them.
          float ang = atan(p.y, p.x) - uAngle;
          float twelfth = 6.2831853 / 12.0;
          float a = mod(ang, twelfth) - twelfth * 0.5;
          float dotRingR = outerR + sin(uAngle * 6.2831853) * 0.005;
          float dotDist = length(vec2(a * dotRingR, d - dotRingR));
          float dot = smoothstep(0.025, 0.0, dotDist) * 0.9;

          float a_total = outerRing + innerRing + disc + glow * 0.5 + dot;
          gl_FragColor = vec4(uColor, clamp(a_total, 0.0, 1.0));
        }
      `,
    });
    const mesh = new THREE.Mesh(ringGeom, ringMat);
    mesh.renderOrder = 999;

    // Label sits below the ring. Y is negative-scaled to compensate for the
    // renderer's Y-down ortho camera (top=0, bottom=H), otherwise text renders
    // upside-down. Texture is baked lazily once we know label text + color.
    const labelGeom = new THREE.PlaneGeometry(1, 1);
    const labelMat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // Negative scale.y below flips winding; we still need both faces visible.
      side: THREE.DoubleSide,
    });
    const labelMesh = new THREE.Mesh(labelGeom, labelMat);
    labelMesh.renderOrder = 1000;

    const group = new THREE.Group();
    group.add(mesh);
    group.add(labelMesh);
    group.visible = false;
    return { group, mesh, mat: ringMat, labelMesh, labelMat, labelText: null, labelColor: null };
  }

  const LABEL_CANVAS_W = 512;
  const LABEL_CANVAS_H = 96;

  function ensureLabelTexture(slot, text, color) {
    if (slot.labelText === text && slot.labelColor === color) return;
    slot.labelText = text;
    slot.labelColor = color;

    const c = document.createElement('canvas');
    c.width = LABEL_CANVAS_W;
    c.height = LABEL_CANVAS_H;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    // Glow pass
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.fillStyle = color;
    ctx.font = "bold 44px 'Courier New', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height / 2);
    // Second crisper pass without shadow for legibility
    ctx.shadowBlur = 0;
    ctx.fillText(text, c.width / 2, c.height / 2);

    if (slot.labelMat.map) slot.labelMat.map.dispose();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    slot.labelMat.map = tex;
    slot.labelMat.needsUpdate = true;
  }

  function update(state) {
    const { layout, palette, beatPhase, viewport } = state;
    const { W, H } = viewport;
    const positions = getPortalPositions(layout, palette, W, H);

    const t = beatPhase > 0 ? beatPhase : ((performance.now() / 1000) % 1);
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);

    for (let i = 0; i < portals.length; i++) {
      const slot = portals[i];
      const data = positions[i];
      if (!data) {
        slot.group.visible = false;
        continue;
      }
      slot.group.visible = true;
      // Plane scale should be ~2x portal radius so SDF math (centered ±1) works.
      const planeSize = data.radius * 2.4;
      slot.mesh.position.set(data.cx, data.cy, 0);
      slot.mesh.scale.set(planeSize, planeSize, 1);
      slot.mat.uniforms.uColor.value.set(data.color);
      slot.mat.uniforms.uPulse.value = pulse;
      slot.mat.uniforms.uHover.value = data.hovered ? 1 : 0;
      slot.mat.uniforms.uAngle.value = data.angle;

      // Label below the ring. data.color is a hex string usable directly as CSS.
      ensureLabelTexture(slot, data.label, data.color);
      const labelW = data.radius * 4.0;
      const labelH = labelW * (LABEL_CANVAS_H / LABEL_CANVAS_W);
      // Y-down ortho camera: positive Y is downward on screen.
      // Negative scale.y flips the textured plane so text reads right-side up.
      slot.labelMesh.position.set(data.cx, data.cy + data.radius * 1.05 + labelH * 0.5, 0);
      slot.labelMesh.scale.set(labelW, -labelH, 1);
    }
  }

  return { update };
}
