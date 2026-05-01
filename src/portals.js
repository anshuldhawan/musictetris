// Vibe Jam 2026 webring portals — https://vibejam.cc/portal/2026
//
// Renders glowing ring portals in the board gutters. Click to enter.
// Exit portal (right gutter): always present, leads to vibejam.cc/portal/2026.
// Start portal (left gutter): only when arriving via ?portal=true&ref=...,
// returns the player to the originating game.

import { withAlpha } from './palette.js';

const VIBEJAM_URL = 'https://vibejam.cc/portal/2026';
const SELF_REF = 'musictetris.anshuldhawan.com';
const START_COLOR = '#ff5d5d';
const LABEL_FONT = "bold 12px 'Courier New', monospace";

const incoming = new URLSearchParams(
  typeof location !== 'undefined' ? location.search : ''
);
const arrivedViaPortal = incoming.get('portal') === 'true';
const refRaw = incoming.get('ref');
const hasStartPortal = arrivedViaPortal && !!refRaw;

let audioPending = arrivedViaPortal;
let mouseX = -1;
let mouseY = -1;
const preloaded = new Set();

const portals = {
  exit: {
    kind: 'exit',
    label: 'VIBE JAM 2026',
    color: '#7afcff',
    cx: 0, cy: 0, radius: 40,
    angle: 0,
    hovered: false,
  },
  start: hasStartPortal ? {
    kind: 'start',
    label: '← ' + refHostLabel(refRaw),
    color: START_COLOR,
    cx: 0, cy: 0, radius: 40,
    angle: 0,
    hovered: false,
  } : null,
};

function refHostLabel(ref) {
  try {
    const u = new URL(ref.startsWith('http') ? ref : 'https://' + ref);
    return u.host.toUpperCase();
  } catch {
    return String(ref).toUpperCase();
  }
}

function activePortals() {
  return [portals.exit, portals.start].filter(Boolean);
}

function hitTest(p, x, y) {
  const dx = x - p.cx;
  const dy = y - p.cy;
  return dx * dx + dy * dy <= p.radius * p.radius;
}

export function initPortals(canvas) {
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouseX = e.clientX - r.left;
    mouseY = e.clientY - r.top;
    let cursor = 'default';
    for (const p of activePortals()) {
      const inside = hitTest(p, mouseX, mouseY);
      if (inside && !p.hovered) preload(p);
      p.hovered = inside;
      if (inside) cursor = 'pointer';
    }
    canvas.style.cursor = cursor;
  });
  canvas.addEventListener('mouseleave', () => {
    mouseX = -1; mouseY = -1;
    for (const p of activePortals()) p.hovered = false;
    canvas.style.cursor = 'default';
  });
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    for (const p of activePortals()) {
      if (hitTest(p, x, y)) { enter(p); return; }
    }
  });
}

export function updatePortals(dt) {
  for (const p of activePortals()) {
    p.angle += dt * (p.kind === 'exit' ? 0.7 : -0.7);
  }
}

export function drawPortals(ctx, layout, palette, beatPhase, W, H) {
  const leftGutter = layout.x;
  const rightGutter = W - layout.x - layout.boardW;
  const gutter = Math.min(leftGutter, rightGutter);
  if (gutter < 60) return; // viewport too narrow to fit a portal cleanly

  const leftCx = leftGutter / 2;
  const rightCx = layout.x + layout.boardW + rightGutter / 2;
  const radius = Math.max(22, Math.min(48, gutter * 0.32));
  const cy = Math.min(H - radius - 32, H * 0.78);

  // Pulse from beat when audio is live, otherwise from wall clock so the
  // portals stay alive on the silent first frame after ?portal=true arrival.
  const t = beatPhase > 0 ? beatPhase : ((performance.now() / 1000) % 1);

  if (portals.exit) {
    portals.exit.cx = rightCx;
    portals.exit.cy = cy;
    portals.exit.radius = radius;
    portals.exit.color = palette.glow;
    drawPortal(ctx, portals.exit, t);
  }
  if (portals.start) {
    portals.start.cx = leftCx;
    portals.start.cy = cy;
    portals.start.radius = radius;
    drawPortal(ctx, portals.start, t);
  }

  if (mouseX >= 0) {
    for (const p of activePortals()) {
      const wasHover = p.hovered;
      p.hovered = hitTest(p, mouseX, mouseY);
      if (p.hovered && !wasHover) preload(p);
    }
  }
}

function drawPortal(ctx, p, t) {
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
  const hoverBoost = p.hovered ? 1.12 : 1;
  const ringR = p.radius * 0.78 * hoverBoost;

  ctx.save();
  ctx.translate(p.cx, p.cy);

  // Outer glow ring
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 24 + 18 * pulse + (p.hovered ? 22 : 0);
  ctx.strokeStyle = withAlpha(p.color, 0.85);
  ctx.lineWidth = 4 + pulse * 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, ringR, 0, Math.PI * 2);
  ctx.stroke();

  // Inner thin ring
  ctx.shadowBlur = 10;
  ctx.strokeStyle = withAlpha(p.color, 0.55);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, ringR * 0.78, 0, Math.PI * 2);
  ctx.stroke();

  // Translucent inner disc
  ctx.shadowBlur = 0;
  ctx.fillStyle = withAlpha(p.color, 0.12 + 0.08 * pulse);
  ctx.beginPath();
  ctx.arc(0, 0, ringR * 0.78, 0, Math.PI * 2);
  ctx.fill();

  // Orbiting particles
  const n = 12;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = withAlpha(p.color, 0.9);
  for (let i = 0; i < n; i++) {
    const a = p.angle + (i / n) * Math.PI * 2;
    const rr = ringR + Math.sin(t * Math.PI * 2 + i) * 2;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    ctx.beginPath();
    ctx.arc(px, py, 1.8 + 0.6 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  // Label
  ctx.shadowBlur = 8;
  ctx.shadowColor = p.color;
  ctx.fillStyle = withAlpha(p.color, p.hovered ? 1 : 0.85);
  ctx.font = LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(p.label, 0, ringR + 12);

  ctx.restore();
}

function preload(p) {
  const url = p.kind === 'exit' ? buildExitUrl(p.color) : buildStartUrl();
  if (!url || preloaded.has(url)) return;
  preloaded.add(url);
  const id = 'portal-preload-' + p.kind;
  if (document.getElementById(id)) return;
  const iframe = document.createElement('iframe');
  iframe.id = id;
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);
}

function enter(p) {
  const url = p.kind === 'exit' ? buildExitUrl(p.color) : buildStartUrl();
  if (!url) return;
  preload(p);
  location.href = url;
}

function buildExitUrl(fallbackColor) {
  const out = new URLSearchParams();
  out.set('portal', 'true');
  out.set('username', incoming.get('username') ?? 'tetromino');
  out.set('color',    incoming.get('color')    ?? fallbackColor);
  out.set('speed',    incoming.get('speed')    ?? '0');
  out.set('ref',      SELF_REF);
  for (const [k, v] of incoming) {
    if (out.has(k) || k === 'ref') continue;
    out.set(k, v);
  }
  return VIBEJAM_URL + '?' + out.toString();
}

function buildStartUrl() {
  if (!refRaw) return null;
  const base = refRaw.startsWith('http://') || refRaw.startsWith('https://')
    ? refRaw : 'https://' + refRaw;
  const back = new URLSearchParams();
  for (const [k, v] of incoming) if (k !== 'ref') back.set(k, v);
  const qs = back.toString();
  if (!qs) return base;
  return base + (base.includes('?') ? '&' : '?') + qs;
}

export function isAudioPending() {
  return audioPending;
}

export function consumeAudioPending() {
  audioPending = false;
}

export function arrivedFromPortal() {
  return arrivedViaPortal;
}
