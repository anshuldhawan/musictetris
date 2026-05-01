// Palette progression. Score crosses every multiple of 20 -> advance one palette.
// Each palette has enough block colors (11) for every piece's colorIndex.

export const PALETTES = [
  {
    name: 'aurora',
    blocks: ['#b8f0ff', '#ffd878', '#c8b8f8', '#8ff6b6', '#f070a0', '#6ba9ff', '#ffae5a', '#e6e6ff', '#a6f0ff', '#f0b0d0', '#c8b6ff'],
    particles: '#b388ff',
    glow: '#7afcff',
    bgA: '#0a0612',
    bgB: '#150b1f',
  },
  {
    name: 'ember',
    blocks: ['#ff6b3d', '#ffd25a', '#ff3d7a', '#ffb05a', '#ff5252', '#ff8a3d', '#ffe066', '#ffcc99', '#ff7766', '#ffb380', '#ffd1a3'],
    particles: '#ff6b3d',
    glow: '#ffd25a',
    bgA: '#170808',
    bgB: '#240e0e',
  },
  {
    name: 'forest',
    blocks: ['#5dffb4', '#9eff5d', '#3dffe6', '#5fe07a', '#a6ff9e', '#3dffa1', '#88e0a1', '#c2ff9e', '#5fffd2', '#7fe0a1', '#a1ffc4'],
    particles: '#5dffb4',
    glow: '#9eff5d',
    bgA: '#06140d',
    bgB: '#0c2014',
  },
  {
    name: 'oceanic',
    blocks: ['#3dafff', '#5dffe6', '#7afcff', '#3d7eff', '#5dafff', '#a6e0ff', '#9effe6', '#c2eaff', '#5fcfff', '#88c8ff', '#a1d8ff'],
    particles: '#3dafff',
    glow: '#5dffe6',
    bgA: '#04101c',
    bgB: '#081830',
  },
  {
    name: 'magenta',
    blocks: ['#ff5dff', '#ff7aff', '#c25dff', '#ff9eff', '#ff3dba', '#e05dff', '#a13dff', '#ff8ae0', '#d09eff', '#ffaae0', '#c5a6ff'],
    particles: '#ff5dff',
    glow: '#c25dff',
    bgA: '#16041e',
    bgB: '#23082e',
  },
  {
    name: 'sunset',
    blocks: ['#ff8a5f', '#ffd25a', '#ff5d8a', '#ffae5d', '#ff7a5d', '#ffa17a', '#ffba5d', '#ffd8a1', '#ffb39e', '#ffc77a', '#ffe5b3'],
    particles: '#ff8a5f',
    glow: '#ffd25a',
    bgA: '#1a0810',
    bgB: '#280f1a',
  },
  {
    name: 'monochrome',
    blocks: ['#ffffff', '#dcdcdc', '#b0b0b0', '#f0f0f0', '#c8c8c8', '#a0a0a0', '#e8e8e8', '#d0d0d0', '#bababa', '#f5f5f5', '#9e9e9e'],
    particles: '#ffffff',
    glow: '#cccccc',
    bgA: '#080808',
    bgB: '#141414',
  },
];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  const c = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  return '#' + c.toString(16).padStart(6, '0');
}

export function lerpColor(a, b, t) {
  const ar = hexToRgb(a), br = hexToRgb(b);
  return rgbToHex(
    ar[0] + (br[0] - ar[0]) * t,
    ar[1] + (br[1] - ar[1]) * t,
    ar[2] + (br[2] - ar[2]) * t,
  );
}

export function lerpPalette(a, b, t) {
  const blocks = a.blocks.map((c, i) => lerpColor(c, b.blocks[i] || b.blocks[0], t));
  return {
    blocks,
    particles: lerpColor(a.particles, b.particles, t),
    glow: lerpColor(a.glow, b.glow, t),
    bgA: lerpColor(a.bgA, b.bgA, t),
    bgB: lerpColor(a.bgB, b.bgB, t),
  };
}

export function paletteForScore(score) {
  const idx = Math.floor(score / 20) % PALETTES.length;
  return PALETTES[idx];
}

export function withAlpha(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
