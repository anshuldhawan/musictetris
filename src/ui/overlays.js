// DOM overlays for the frenzy banner and the "PAUSED" centered text.
// Replace the canvas-text drawing that used to live in main.js.

let banner = null, pausedEl = null;

export function initOverlays() {
  banner = document.createElement('div');
  banner.id = 'frenzy-banner';
  banner.style.display = 'none';
  document.body.appendChild(banner);

  pausedEl = document.createElement('div');
  pausedEl.id = 'paused-overlay';
  pausedEl.textContent = 'PAUSED';
  pausedEl.style.display = 'none';
  document.body.appendChild(pausedEl);
}

export function updateFrenzyBanner(state) {
  if (!banner) return;
  const { frenzyState, frenzyTimer, frenzyGapSec, layout } = state;
  if (frenzyState !== 'warning' && frenzyState !== 'frenzy') {
    if (banner.style.display !== 'none') banner.style.display = 'none';
    return;
  }
  banner.style.display = 'block';

  let text, color, period;
  if (frenzyState === 'warning') {
    const remaining = frenzyGapSec - frenzyTimer;
    const n = Math.max(1, Math.ceil(remaining));
    text = `FRENZY IN ${n}`;
    color = '#ffcc33';
    period = 220;
  } else {
    text = 'FRENZY!';
    color = '#ff3366';
    period = 90;
  }
  if (banner.textContent !== text) banner.textContent = text;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / period * Math.PI);
  const scale = 1 + 0.08 * pulse;
  const blur = 20 + 30 * pulse;

  // Positioned above the playfield; layout.x/y are canvas-pixel coords.
  const cx = layout.x + layout.boardW / 2;
  const top = Math.max(8, layout.y - 56);
  banner.style.color = color;
  banner.style.left = `${cx}px`;
  banner.style.top = `${top}px`;
  banner.style.textShadow =
    `0 0 ${blur * 0.4}px ${color}, 0 0 ${blur}px ${color}`;
  banner.style.transform = `translateX(-50%) scale(${scale})`;
}

export function setPausedVisible(visible) {
  if (!pausedEl) return;
  pausedEl.style.display = visible ? 'flex' : 'none';
}
