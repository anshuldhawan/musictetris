// Floating decorative shapes — one on each side of the board.
// Each shape is a complex geometric figure that morphs every 10-15 seconds
// and bounces/pulses with the beat.

import { withAlpha } from './palette.js';

// ===== Shape generators =====
// Each returns an array of {x, y} points normalized to a unit circle (radius ~1).

function starShape(points, innerRatio) {
  const verts = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 1 : innerRatio;
    verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return verts;
}

function polygonShape(sides) {
  const verts = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    verts.push({ x: Math.cos(a), y: Math.sin(a) });
  }
  return verts;
}

function spirographShape(petals, depth) {
  const verts = [];
  const n = petals * 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.5 + 0.5 * Math.cos(a * petals) * depth;
    verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return verts;
}

function roseShape(k, offset) {
  const verts = [];
  const n = 80;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.4 + 0.6 * Math.abs(Math.cos(a * k + offset));
    verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return verts;
}

function lissajousShape(a, b, delta) {
  const verts = [];
  const n = 80;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    verts.push({ x: Math.sin(a * t + delta), y: Math.sin(b * t) });
  }
  return verts;
}

function concentricShape(sides, layers) {
  const verts = [];
  for (let l = layers; l >= 1; l--) {
    const r = l / layers;
    const rot = (l % 2) * (Math.PI / sides);
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 + rot - Math.PI / 2;
      verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
  }
  return verts;
}

const GENERATORS = [
  () => starShape(5 + Math.floor(Math.random() * 5), 0.3 + Math.random() * 0.3),
  () => spirographShape(3 + Math.floor(Math.random() * 6), 0.5 + Math.random() * 0.5),
  () => roseShape(2 + Math.floor(Math.random() * 5), Math.random() * Math.PI),
  () => lissajousShape(
    1 + Math.floor(Math.random() * 4),
    2 + Math.floor(Math.random() * 4),
    Math.random() * Math.PI,
  ),
  () => concentricShape(4 + Math.floor(Math.random() * 5), 2 + Math.floor(Math.random() * 3)),
  () => polygonShape(6 + Math.floor(Math.random() * 5)),
];

function randomShape() {
  const gen = GENERATORS[Math.floor(Math.random() * GENERATORS.length)];
  return gen();
}

// Normalize vertex count between two shapes so we can lerp them.
function normalizeVertexCount(a, b) {
  const max = Math.max(a.length, b.length);
  return { a: resampleVerts(a, max), b: resampleVerts(b, max) };
}

function resampleVerts(verts, count) {
  if (verts.length === count) return verts.slice();
  if (verts.length === 0) return new Array(count).fill({ x: 0, y: 0 });
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * verts.length;
    const idx = Math.floor(t);
    const frac = t - idx;
    const a = verts[idx % verts.length];
    const b = verts[(idx + 1) % verts.length];
    out.push({ x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac });
  }
  return out;
}

function lerpVerts(a, b, t) {
  return a.map((va, i) => ({
    x: va.x + (b[i].x - va.x) * t,
    y: va.y + (b[i].y - va.y) * t,
  }));
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ===== FloatingShape class =====
export class FloatingShape {
  constructor() {
    const initial = randomShape();
    this.currentVerts = initial;
    this.fromVerts = initial;
    this.toVerts = initial;
    this.morphT = 1;          // 0..1 transition progress
    this.morphDuration = 1.5; // seconds to morph
    this.timer = 0;
    this.nextChangeAt = 10 + Math.random() * 5;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = 0.15 + Math.random() * 0.15; // rad/s
    this.bounceScale = 0; // kicks add to this, decays each frame
  }

  kick() {
    this.bounceScale = 0.25;
  }

  update(dt) {
    this.timer += dt;
    this.rotation += this.rotSpeed * dt;
    this.bounceScale *= Math.max(0, 1 - dt * 6); // fast decay
    if (this.bounceScale < 0.005) this.bounceScale = 0;

    // Morph progress
    if (this.morphT < 1) {
      this.morphT = Math.min(1, this.morphT + dt / this.morphDuration);
      const t = easeInOutCubic(this.morphT);
      this.currentVerts = lerpVerts(this.fromVerts, this.toVerts, t);
    }

    // Time to change?
    if (this.timer >= this.nextChangeAt) {
      this.timer = 0;
      this.nextChangeAt = 10 + Math.random() * 5;
      const next = randomShape();
      const { a, b } = normalizeVertexCount(this.currentVerts, next);
      this.fromVerts = a;
      this.toVerts = b;
      this.currentVerts = a;
      this.morphT = 0;
      // Randomize rotation direction on change
      this.rotSpeed = (0.15 + Math.random() * 0.15) * (Math.random() < 0.5 ? 1 : -1);
    }
  }

  draw(ctx, cx, cy, radius, color, glowColor, beatPhase) {
    const beatPulse = 0.06 * Math.sin(beatPhase * Math.PI * 2);
    const scale = radius * (1 + beatPulse + this.bounceScale);
    const verts = this.currentVerts;
    if (verts.length < 2) return;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.rotation);

    // Outer glow layer
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 20 + 30 * this.bounceScale;
    ctx.strokeStyle = withAlpha(color, 0.5 + 0.3 * Math.sin(beatPhase * Math.PI * 2));
    ctx.lineWidth = 1.5 + this.bounceScale * 3;
    ctx.beginPath();
    ctx.moveTo(verts[0].x * scale, verts[0].y * scale);
    for (let i = 1; i < verts.length; i++) {
      ctx.lineTo(verts[i].x * scale, verts[i].y * scale);
    }
    ctx.closePath();
    ctx.stroke();

    // Inner fill — very transparent
    ctx.fillStyle = withAlpha(color, 0.06 + 0.04 * Math.sin(beatPhase * Math.PI * 2));
    ctx.fill();

    // Draw vertex dots
    ctx.shadowBlur = 8;
    const dotSize = 1.5 + this.bounceScale * 2;
    const step = Math.max(1, Math.floor(verts.length / 20));
    ctx.fillStyle = withAlpha(glowColor, 0.6 + 0.3 * this.bounceScale);
    for (let i = 0; i < verts.length; i += step) {
      ctx.beginPath();
      ctx.arc(verts[i].x * scale, verts[i].y * scale, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
