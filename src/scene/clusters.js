import * as THREE from 'three';
import { makeClusterParticlesMaterial } from '../shaders/clusterParticles.js';

const MAX_STATIC = 360;
const MAX_BURST = 140;
const MAX_TOTAL = MAX_STATIC + MAX_BURST;
const MAX_CLUSTERS_PER_SIDE = 5;
const PARTICLES_PER_CLUSTER = 28;

const positions = new Float32Array(MAX_TOTAL * 3);
const sizes = new Float32Array(MAX_TOTAL);
const alphas = new Float32Array(MAX_TOTAL);
const colorMixes = new Float32Array(MAX_TOTAL);

const seeds = [];
for (let i = 0; i < MAX_STATIC; i++) {
  const cluster = Math.floor(i / PARTICLES_PER_CLUSTER) % MAX_CLUSTERS_PER_SIDE;
  const side = Math.floor(i / (PARTICLES_PER_CLUSTER * MAX_CLUSTERS_PER_SIDE)) % 2;
  const local = i % PARTICLES_PER_CLUSTER;
  const tier = local % 9 === 0 ? 2 : local % 4 === 0 ? 1 : 0;
  seeds.push({
    side,
    cluster,
    angle: (local / PARTICLES_PER_CLUSTER) * Math.PI * 2 + Math.random() * 0.8,
    orbit: 0.35 + Math.random() * 0.85,
    speed: (0.25 + Math.random() * 0.7) * (Math.random() < 0.5 ? -1 : 1),
    phase: Math.random() * Math.PI * 2,
    drift: Math.random(),
    tier,
    colorMix: Math.random(),
  });
}

export function makeClusterScene(scene) {
  const geom = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const sizeAttr = new THREE.BufferAttribute(sizes, 1);
  const alphaAttr = new THREE.BufferAttribute(alphas, 1);
  const mixAttr = new THREE.BufferAttribute(colorMixes, 1);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  sizeAttr.setUsage(THREE.DynamicDrawUsage);
  alphaAttr.setUsage(THREE.DynamicDrawUsage);
  mixAttr.setUsage(THREE.DynamicDrawUsage);
  geom.setAttribute('position', posAttr);
  geom.setAttribute('aSize', sizeAttr);
  geom.setAttribute('aAlpha', alphaAttr);
  geom.setAttribute('aColorMix', mixAttr);

  const mat = makeClusterParticlesMaterial();
  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  points.renderOrder = 7;
  scene.add(points);

  const bursts = new Array(MAX_BURST).fill(null).map(() => ({
    alive: false,
    x: 0, y: 0, vx: 0, vy: 0,
    life: 0, maxLife: 1,
    size: 1, phase: 0, colorMix: 0,
  }));
  let burstCursor = 0;

  function spawnBurst(x, y, sideSign, power, count) {
    for (let i = 0; i < count; i++) {
      const p = bursts[burstCursor];
      burstCursor = (burstCursor + 1) % MAX_BURST;
      const a = (i / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.8;
      const speed = power * (0.25 + Math.random() * 0.8);
      p.alive = true;
      p.x = x + Math.cos(a) * (6 + Math.random() * 18);
      p.y = y + Math.sin(a) * (4 + Math.random() * 14);
      p.vx = sideSign * (0.35 + Math.random() * 1.2) + Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed - 0.4;
      p.life = 0;
      p.maxLife = 0.65 + Math.random() * 0.65;
      p.size = 2.5 + Math.random() * 9;
      p.phase = Math.random() * Math.PI * 2;
      p.colorMix = Math.random();
    }
  }

  function emitRowClear(layout, rows, power = 1) {
    const count = Math.min(18, 8 + rows.length * 4);
    for (const r of rows) {
      const cy = layout.y + r * layout.cell + layout.cell / 2;
      spawnBurst(layout.x - 18, cy, -1, power, count);
      spawnBurst(layout.x + layout.boardW + 18, cy, 1, power, count);
    }
  }

  function updateBursts(dt) {
    for (const p of bursts) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.965;
      p.vy = p.vy * 0.965 - 0.01;
    }
  }

  function update(state) {
    const { layout, palette, beatPhase, time, viewport, pixelRatio, frenzyState } = state;
    const { W, H } = viewport;
    const leftW = layout.x;
    const rightW = W - layout.x - layout.boardW;
    const minGutter = Math.max(0, Math.min(leftW, rightW));
    const clusterCount = Math.max(1, Math.min(MAX_CLUSTERS_PER_SIDE, Math.floor(minGutter / 90) + 1));
    const quality = pixelRatio > 1.5 || W < 700 ? 0.72 : 1;
    const maxStatic = Math.floor(clusterCount * PARTICLES_PER_CLUSTER * 2 * quality);
    const beat = 0.5 + 0.5 * Math.sin(beatPhase * Math.PI * 2);
    const frenzy = frenzyState === 'frenzy' ? 1 : frenzyState === 'warning' ? 0.45 : 0;

    mat.uniforms.uTime.value = time;
    mat.uniforms.uBeatPhase.value = beatPhase;
    mat.uniforms.uFrenzy.value = frenzy;
    mat.uniforms.uPixelRatio.value = Math.min(1.5, pixelRatio || 1);
    mat.uniforms.uColorA.value.set(palette.particles);
    mat.uniforms.uColorB.value.set(palette.glow);

    let out = 0;
    const centerY = H * 0.5;
    for (let i = 0; i < MAX_STATIC && out < maxStatic; i++) {
      const s = seeds[i];
      if (s.cluster >= clusterCount) continue;
      const sideW = s.side === 0 ? leftW : rightW;
      if (sideW < 28) continue;

      const gutterX = s.side === 0
        ? sideW * (0.2 + 0.6 * ((s.cluster + 0.5) / clusterCount))
        : layout.x + layout.boardW + sideW * (0.2 + 0.6 * ((s.cluster + 0.5) / clusterCount));
      const rowT = (s.cluster + 0.5) / clusterCount;
      const clusterY = H * (0.18 + 0.64 * ((rowT + 0.08 * Math.sin(time * 0.12 + s.cluster)) % 1));
      const clusterR = Math.min(sideW * 0.22, H * 0.105) * (0.8 + s.cluster * 0.035);
      const swirl = s.angle + time * s.speed * (0.35 + frenzy * 0.35) + beat * 0.32;
      const breathe = 0.82 + 0.22 * Math.sin(time * 1.1 + s.phase) + 0.16 * beat + frenzy * 0.12;
      const wobbleX = Math.sin(time * 0.7 + s.phase) * clusterR * 0.08;
      const wobbleY = Math.cos(time * 0.55 + s.phase) * clusterR * 0.06;
      const r = clusterR * s.orbit * breathe;

      positions[out * 3] = gutterX + Math.cos(swirl) * r + wobbleX;
      positions[out * 3 + 1] = clusterY + Math.sin(swirl * 0.83 + s.phase) * r + wobbleY;
      positions[out * 3 + 2] = 18 + s.tier * 8;
      sizes[out] = (s.tier === 2 ? 10 : s.tier === 1 ? 6 : 2.4) * (1 + beat * 0.18 + frenzy * 0.2);
      alphas[out] = (s.tier === 2 ? 0.18 : s.tier === 1 ? 0.28 : 0.5) * (0.7 + beat * 0.36 + frenzy * 0.35);
      colorMixes[out] = s.colorMix;
      out++;
    }

    for (const p of bursts) {
      if (!p.alive || out >= MAX_TOTAL) continue;
      const t = p.life / p.maxLife;
      positions[out * 3] = p.x + Math.sin(time * 4 + p.phase) * 2.5;
      positions[out * 3 + 1] = p.y + Math.cos(time * 3 + p.phase) * 1.5;
      positions[out * 3 + 2] = 42;
      sizes[out] = p.size * (1 - t * 0.35);
      alphas[out] = (1 - t) * 0.75;
      colorMixes[out] = p.colorMix;
      out++;
    }

    posAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    mixAttr.needsUpdate = true;
    geom.setDrawRange(0, out);
  }

  return { update, updateBursts, emitRowClear };
}
