import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COLS, ROWS } from '../board.js';
import { pieceCells } from '../pieces.js';
import { WOBBLE_VERT, WOBBLE_FRAG } from '../shaders/wobble.js';

const MAX_INSTANCES = COLS * ROWS + 5 + 5; // 200 grid + 5 active piece + 5 ghost

const tmpMatrix = new THREE.Matrix4();
const tmpColor = new THREE.Color();
const railNames = ['top', 'bottom', 'left', 'right'];

export function makeBoardScene(scene) {
  const geometry = new RoundedBoxGeometry(1, 1, 1, 5, 0.16);

  const colors = new Float32Array(MAX_INSTANCES * 3);
  const alphas = new Float32Array(MAX_INSTANCES);
  const ghosts = new Float32Array(MAX_INSTANCES);
  const clears = new Float32Array(MAX_INSTANCES);

  const colorAttr = new THREE.InstancedBufferAttribute(colors, 3);
  const alphaAttr = new THREE.InstancedBufferAttribute(alphas, 1);
  const ghostAttr = new THREE.InstancedBufferAttribute(ghosts, 1);
  const clearAttr = new THREE.InstancedBufferAttribute(clears, 1);
  colorAttr.setUsage(THREE.DynamicDrawUsage);
  alphaAttr.setUsage(THREE.DynamicDrawUsage);
  ghostAttr.setUsage(THREE.DynamicDrawUsage);
  clearAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('iColor', colorAttr);
  geometry.setAttribute('iAlpha', alphaAttr);
  geometry.setAttribute('iIsGhost', ghostAttr);
  geometry.setAttribute('iClearProgress', clearAttr);

  const material = new THREE.ShaderMaterial({
    vertexShader: WOBBLE_VERT,
    fragmentShader: WOBBLE_FRAG,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime:       { value: 0 },
      uBeatPhase:  { value: 0 },
      uBlockPulse: { value: 0 },
      uGlow:       { value: new THREE.Color(0xffffff) },
      uCellSize:   { value: 1 },
      uLightDir:   { value: new THREE.Vector3(-0.35, -0.65, 0.7).normalize() },
    },
  });

  const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
  mesh.frustumCulled = false;
  mesh.renderOrder = 50;
  scene.add(mesh);

  // Board frame: a shallow dark backplate plus glowing 3D rails.
  const frameGeom = new RoundedBoxGeometry(1, 1, 1, 4, 0.12);
  const frameMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.55,
    depthTest: true,
    depthWrite: false,
  });
  const frameMesh = new THREE.Mesh(frameGeom, frameMat);
  frameMesh.renderOrder = 40;
  scene.add(frameMesh);

  const railGeom = new THREE.BoxGeometry(1, 1, 1);
  const railMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.42,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const haloMat = railMat.clone();
  haloMat.opacity = 0.16;
  const rails = Object.fromEntries(railNames.map((name) => {
    const rail = new THREE.Mesh(railGeom, railMat);
    const halo = new THREE.Mesh(railGeom, haloMat);
    rail.renderOrder = 45;
    halo.renderOrder = 44;
    scene.add(halo);
    scene.add(rail);
    return [name, { rail, halo }];
  }));

  let layoutCache = null;

  function setLayout(layout) {
    layoutCache = layout;
    const { x, y, boardW, boardH, cell } = layout;
    const cx = x + boardW / 2;
    const cy = y + boardH / 2;
    const pad = Math.max(10, cell * 0.32);
    const rail = Math.max(5, cell * 0.16);
    const railDepth = Math.max(10, cell * 0.34);

    frameMesh.position.set(cx, cy, -railDepth * 0.55);
    frameMesh.scale.set(boardW + pad, boardH + pad, railDepth * 0.6);

    const topY = y - rail * 0.5;
    const bottomY = y + boardH + rail * 0.5;
    const leftX = x - rail * 0.5;
    const rightX = x + boardW + rail * 0.5;

    function place(slot, px, py, sx, sy) {
      slot.rail.position.set(px, py, railDepth * 0.15);
      slot.rail.scale.set(sx, sy, railDepth);
      slot.halo.position.set(px, py, railDepth * 0.05);
      slot.halo.scale.set(sx + rail * 2.2, sy + rail * 2.2, railDepth * 1.2);
    }

    place(rails.top,    cx, topY,    boardW + pad, rail);
    place(rails.bottom, cx, bottomY, boardW + pad, rail);
    place(rails.left,   leftX, cy,   rail, boardH + pad);
    place(rails.right,  rightX, cy,  rail, boardH + pad);

    material.uniforms.uCellSize.value = cell;
  }

  function clearInstance(idx) {
    tmpMatrix.makeTranslation(-9999, -9999, 0);
    mesh.setMatrixAt(idx, tmpMatrix);
    alphas[idx] = 0;
    ghosts[idx] = 0;
    clears[idx] = 0;
  }

  function setInstance(idx, x, y, size, color, alpha, isGhost, clearProgress) {
    const depth = isGhost ? size * 0.24 : size * 0.62;
    tmpMatrix.makeScale(size, size, depth);
    tmpMatrix.setPosition(x, y, depth * 0.5);
    mesh.setMatrixAt(idx, tmpMatrix);

    tmpColor.set(color);
    colors[idx * 3]     = tmpColor.r;
    colors[idx * 3 + 1] = tmpColor.g;
    colors[idx * 3 + 2] = tmpColor.b;
    alphas[idx] = alpha;
    ghosts[idx] = isGhost ? 1 : 0;
    clears[idx] = clearProgress;
  }

  function update(state) {
    const { layout, palette, beatPhase, time, effects, grid, piece, ghost,
            clearingRows, clearProgress } = state;
    if (layoutCache !== layout) setLayout(layout);

    material.uniforms.uTime.value = time;
    material.uniforms.uBeatPhase.value = beatPhase;
    material.uniforms.uBlockPulse.value = effects.blockPulse;
    material.uniforms.uGlow.value.set(palette.glow);

    // Frame & ring colors track the palette glow + ambient pulse.
    const ambient = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(beatPhase * Math.PI * 2));
    const totalGlow = Math.min(1, ambient + effects.glow);
    railMat.color.set(palette.glow);
    railMat.opacity = 0.24 + 0.24 * totalGlow;
    haloMat.color.set(palette.glow);
    haloMat.opacity = 0.08 + 0.18 * totalGlow;
    frameMat.opacity = 0.42 + 0.12 * Math.min(1, effects.glow);

    const { x, y, cell } = layout;
    const halfCell = cell / 2;
    const clearSet = clearingRows && clearingRows.length ? new Set(clearingRows) : null;

    let idx = 0;

    // 1. Grid cells (200)
    for (let r = 0; r < ROWS; r++) {
      const isClearRow = clearSet && clearSet.has(r);
      for (let c = 0; c < COLS; c++) {
        const v = grid[r][c];
        if (v === -1) {
          clearInstance(idx);
        } else {
          const baseColor = palette.blocks[v % palette.blocks.length];
          const cx = x + c * cell + halfCell;
          const cy = y + r * cell + halfCell;
          setInstance(
            idx, cx, cy, cell - 4, baseColor,
            1.0, false,
            isClearRow ? clearProgress : 0.0,
          );
        }
        idx++;
      }
    }

    // 2. Ghost piece (5 slots)
    const ghostSlots = idx;
    for (let i = 0; i < 5; i++) clearInstance(ghostSlots + i);
    if (ghost && piece) {
      const cells = pieceCells(ghost);
      const color = palette.blocks[ghost.colorIndex % palette.blocks.length];
      let g = 0;
      for (const [dr, dc] of cells) {
        if (g >= 5) break;
        const rr = ghost.row + dr;
        const cc = ghost.col + dc;
        if (rr < 0) { g++; continue; }
        const cx = x + cc * cell + halfCell;
        const cy = y + rr * cell + halfCell;
        setInstance(ghostSlots + g, cx, cy, cell - 4, color, 1.0, true, 0);
        g++;
      }
    }
    idx = ghostSlots + 5;

    // 3. Active piece (5 slots)
    const pieceSlots = idx;
    for (let i = 0; i < 5; i++) clearInstance(pieceSlots + i);
    if (piece) {
      const cells = pieceCells(piece);
      const color = palette.blocks[piece.colorIndex % palette.blocks.length];
      let g = 0;
      for (const [dr, dc] of cells) {
        if (g >= 5) break;
        const rr = piece.row + dr;
        const cc = piece.col + dc;
        if (rr < 0) { g++; continue; }
        const cx = x + cc * cell + halfCell;
        const cy = y + rr * cell + halfCell;
        setInstance(pieceSlots + g, cx, cy, cell - 4, color, 1.0, false, 0);
        g++;
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    colorAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    ghostAttr.needsUpdate = true;
    clearAttr.needsUpdate = true;
    mesh.count = MAX_INSTANCES;
  }

  return { update };
}
