import * as THREE from 'three';

const MAX_VERTS = 160;
const LAYERS = 7;
const DOT_SLOTS = 56;
const INDICES_PER_QUAD = 6;

const tmpMatrix = new THREE.Matrix4();
const tmpColor = new THREE.Color();

export function makeShapesScene(scene) {
  const left = makeShape();
  const right = makeShape();
  scene.add(left.group);
  scene.add(right.group);

  function makeShape() {
    const positions = new Float32Array(MAX_VERTS * LAYERS * 3);
    const geom = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('position', posAttr);

    const indexAttr = new THREE.BufferAttribute(
      new Uint16Array(MAX_VERTS * (LAYERS - 1) * INDICES_PER_QUAD),
      1,
    );
    indexAttr.setUsage(THREE.DynamicDrawUsage);
    geom.setIndex(indexAttr);
    geom.setDrawRange(0, 0);

    const shellMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.28,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const shell = new THREE.Mesh(geom, shellMat);
    shell.frustumCulled = false;
    shell.renderOrder = 12;

    const wireGeom = new THREE.BufferGeometry();
    const wirePositions = new Float32Array(MAX_VERTS * LAYERS * 3);
    const wireAttr = new THREE.BufferAttribute(wirePositions, 3);
    wireAttr.setUsage(THREE.DynamicDrawUsage);
    wireGeom.setAttribute('position', wireAttr);
    const wireMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.72,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const wire = new THREE.Points(wireGeom, wireMat);
    wire.frustumCulled = false;
    wire.renderOrder = 13;

    const dotGeom = new THREE.IcosahedronGeometry(1, 1);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dots = new THREE.InstancedMesh(dotGeom, dotMat, DOT_SLOTS);
    dots.frustumCulled = false;
    dots.renderOrder = 14;

    const group = new THREE.Group();
    group.add(shell);
    group.add(wire);
    group.add(dots);

    return {
      group,
      shell,
      geom,
      posAttr,
      indexAttr,
      shellMat,
      wire,
      wireAttr,
      wireMat,
      dots,
      dotMat,
    };
  }

  function setPoint(array, idx, x, y, z) {
    array[idx * 3] = x;
    array[idx * 3 + 1] = y;
    array[idx * 3 + 2] = z;
  }

  function buildShell(slot, verts, scale, depth, time, sideSign) {
    const count = Math.min(verts.length, MAX_VERTS);
    if (count < 3) {
      slot.geom.setDrawRange(0, 0);
      slot.wire.geometry.setDrawRange(0, 0);
      slot.dots.count = 0;
      return count;
    }

    const pos = slot.posAttr.array;
    const wire = slot.wireAttr.array;
    const idx = slot.indexAttr.array;
    let indexCount = 0;

    for (let layer = 0; layer < LAYERS; layer++) {
      const lt = LAYERS === 1 ? 0 : layer / (LAYERS - 1);
      const zt = lt * 2 - 1;
      const layerTwist = sideSign * (zt * 0.9 + Math.sin(time * 0.35 + layer) * 0.08);
      const layerScale = 1.0 - Math.abs(zt) * 0.26 + Math.sin(time * 0.7 + layer * 1.7) * 0.045;
      const squash = 0.82 + 0.12 * Math.cos(layer * 1.9 + time * 0.45);
      const cos = Math.cos(layerTwist);
      const sin = Math.sin(layerTwist);

      for (let i = 0; i < count; i++) {
        const v = verts[i];
        const angle = (i / count) * Math.PI * 2;
        const breathe = 1 + 0.08 * Math.sin(angle * 3 + time * 1.2 + layer);
        const x0 = v.x * scale * layerScale * breathe;
        const y0 = v.y * scale * layerScale * squash;
        const x = x0 * cos - y0 * sin;
        const y = x0 * sin + y0 * cos;
        const z = zt * depth + Math.sin(angle * 2.0 + time * 0.9 + layer) * depth * 0.12;
        const out = layer * MAX_VERTS + i;
        setPoint(pos, out, x, y, z);
        setPoint(wire, out, x, y, z);
      }
    }

    for (let layer = 0; layer < LAYERS - 1; layer++) {
      for (let i = 0; i < count; i++) {
        const a = layer * MAX_VERTS + i;
        const b = layer * MAX_VERTS + ((i + 1) % count);
        const c = (layer + 1) * MAX_VERTS + i;
        const d = (layer + 1) * MAX_VERTS + ((i + 1) % count);
        idx[indexCount++] = a;
        idx[indexCount++] = b;
        idx[indexCount++] = c;
        idx[indexCount++] = b;
        idx[indexCount++] = d;
        idx[indexCount++] = c;
      }
    }

    slot.posAttr.needsUpdate = true;
    slot.indexAttr.needsUpdate = true;
    slot.geom.setDrawRange(0, indexCount);
    slot.wireAttr.needsUpdate = true;
    slot.wire.geometry.setDrawRange(0, count * LAYERS);
    return count;
  }

  function updateDots(slot, count, radius, depth, time) {
    if (count < 3) {
      slot.dots.count = 0;
      return;
    }

    const pos = slot.posAttr.array;
    const step = Math.max(1, Math.floor((count * LAYERS) / DOT_SLOTS));
    let dotCount = 0;
    for (let i = 0; i < count * LAYERS && dotCount < DOT_SLOTS; i += step) {
      const size = Math.max(2.2, radius * (0.018 + 0.018 * ((dotCount % 5) / 4)));
      const pulse = 1 + 0.18 * Math.sin(time * 2.4 + dotCount);
      tmpMatrix.makeScale(size * pulse, size * pulse, size * pulse);
      tmpMatrix.setPosition(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2] + depth * 0.03);
      slot.dots.setMatrixAt(dotCount, tmpMatrix);
      dotCount++;
    }
    slot.dots.count = dotCount;
    slot.dots.instanceMatrix.needsUpdate = true;
  }

  function updateOne(slot, shape, cx, cy, radius, color, glowColor, beatPhase, time, sideSign) {
    const verts = shape.currentVerts;
    const beatSin = Math.sin(beatPhase * Math.PI * 2);
    const beatPulse = 0.06 * beatSin;
    const scale = radius * (0.96 + beatPulse + shape.bounceScale * 0.85);
    const depth = Math.max(24, radius * 0.72);
    const count = buildShell(slot, verts, scale, depth, time, sideSign);
    updateDots(slot, count, radius, depth, time);

    slot.group.position.set(cx, cy, depth * 0.28);
    slot.group.rotation.set(
      sideSign * (0.58 + 0.12 * Math.sin(time * 0.55)),
      sideSign * (0.72 + 0.14 * beatSin),
      shape.rotation * 0.75 + sideSign * Math.sin(time * 0.23) * 0.22,
    );

    tmpColor.set(color);
    slot.shellMat.color.copy(tmpColor);
    slot.shellMat.opacity = Math.min(0.52, 0.18 + 0.18 * Math.max(0, beatSin) + shape.bounceScale * 0.45);
    slot.wireMat.color.set(glowColor);
    slot.wireMat.opacity = Math.min(0.88, 0.44 + 0.22 * Math.max(0, beatSin) + shape.bounceScale * 0.4);
    slot.dotMat.color.set(glowColor);
    slot.dotMat.opacity = Math.min(1, 0.62 + 0.25 * Math.max(0, beatSin) + shape.bounceScale * 0.45);
  }

  function update(state) {
    const { layout, palette, beatPhase, time, viewport, shapeLeft, shapeRight } = state;
    const { W, H } = viewport;
    const shapeRadius = Math.min(layout.x * 0.32, H * 0.13);
    const leftCx = layout.x / 2;
    const rightCx = layout.x + layout.boardW + (W - layout.x - layout.boardW) / 2;
    const cy = H / 2;

    if (shapeRadius > 4 && layout.x > 24) {
      left.group.visible = true;
      right.group.visible = true;
      updateOne(left,  shapeLeft,  leftCx,  cy, shapeRadius, palette.particles, palette.glow, beatPhase, time, -1);
      updateOne(right, shapeRight, rightCx, cy, shapeRadius, palette.particles, palette.glow, beatPhase, time, 1);
    } else {
      left.group.visible = false;
      right.group.visible = false;
    }
  }

  return { update };
}
