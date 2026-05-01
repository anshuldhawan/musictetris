// Vibe Jam 2026 webring portals — https://vibejam.cc/portal/2026
//
// Renders glowing ring portals in the board gutters. Click to enter.
// Exit portal (right gutter): always present, leads to vibejam.cc/portal/2026.
// Start portal (left gutter): only when arriving via ?portal=true&ref=...,
// returns the player to the originating game.

const VIBEJAM_URL = 'https://vibejam.cc/portal/2026';
const SELF_REF = 'musictetris.anshuldhawan.com';
const START_COLOR = '#ff5d5d';

const incoming = new URLSearchParams(
  typeof location !== 'undefined' ? location.search : ''
);
const arrivedViaPortal = incoming.get('portal') === 'true';
const refRaw = incoming.get('ref');
const hasStartPortal = arrivedViaPortal && !!refRaw;

// Audio always waits for the first user gesture (browser AudioContext rule),
// regardless of whether the player arrived via a portal or a normal page load.
let audioPending = true;
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

export function initPortals(canvas, onBeforeEnter = null) {
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
      if (hitTest(p, x, y)) { enter(p, onBeforeEnter); return; }
    }
  });
}

export function updatePortals(dt) {
  for (const p of activePortals()) {
    p.angle += dt * (p.kind === 'exit' ? 0.7 : -0.7);
  }
}

// Updates portal positions based on layout and returns rendering data for the
// scene module. Also re-evaluates hover state so click handlers stay accurate.
// Returns an array indexed [exit, start]; entries are null when not visible.
export function getPortalPositions(layout, palette, W, H) {
  const leftGutter = layout.x;
  const rightGutter = W - layout.x - layout.boardW;
  const gutter = Math.min(leftGutter, rightGutter);
  if (gutter < 60) return [null, null]; // viewport too narrow

  const leftCx = leftGutter / 2;
  const rightCx = layout.x + layout.boardW + rightGutter / 2;
  const radius = Math.max(22, Math.min(48, gutter * 0.32));
  const cy = Math.min(H - radius - 32, H * 0.78);

  if (portals.exit) {
    portals.exit.cx = rightCx;
    portals.exit.cy = cy;
    portals.exit.radius = radius;
    portals.exit.color = palette.glow;
  }
  if (portals.start) {
    portals.start.cx = leftCx;
    portals.start.cy = cy;
    portals.start.radius = radius;
  }

  if (mouseX >= 0) {
    for (const p of activePortals()) {
      const wasHover = p.hovered;
      p.hovered = hitTest(p, mouseX, mouseY);
      if (p.hovered && !wasHover) preload(p);
    }
  }

  const exitData = portals.exit ? {
    cx: portals.exit.cx, cy: portals.exit.cy, radius: portals.exit.radius,
    color: portals.exit.color, hovered: portals.exit.hovered, angle: portals.exit.angle,
    label: portals.exit.label,
  } : null;
  const startData = portals.start ? {
    cx: portals.start.cx, cy: portals.start.cy, radius: portals.start.radius,
    color: portals.start.color, hovered: portals.start.hovered, angle: portals.start.angle,
    label: portals.start.label,
  } : null;
  return [exitData, startData];
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

function enter(p, onBeforeEnter) {
  const url = p.kind === 'exit' ? buildExitUrl(p.color) : buildStartUrl();
  if (!url) return;
  if (typeof onBeforeEnter === 'function') onBeforeEnter();
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
