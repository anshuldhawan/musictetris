import { COLS, ROWS, emptyGrid, collides, lockPiece, findFullRows, removeRows, scoreForClear,
         spawnPiece, tryRotate, stackHeightFraction } from './board.js';
import { pieceCells } from './pieces.js';
import { ParticleSystem } from './particles.js';
import { FloatingShape } from './shapes.js';
import { Effects, easeInOut } from './effects.js';
import { PALETTES, lerpPalette, lerpColor, withAlpha } from './palette.js';
import { startAudio, pauseAudio, resumeAudio, setStackFraction, setFrenzy, getBpm,
         getBeatPhase, onKick, playClearSting } from './audio.js';
import { initPortals, updatePortals, drawPortals, isAudioPending,
         consumeAudioPending, arrivedFromPortal } from './portals.js';

// ===== Canvas setup =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * window.devicePixelRatio;
  canvas.height = H * window.devicePixelRatio;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
}
window.addEventListener('resize', resize);
resize();
initPortals(canvas);

// ===== Game state =====
let grid, piece, score, linesCleared, paused, gameOver;
let lastTime = 0, dropAccumulator = 0;
let softDropStartedAt = 0;
let softDropKeyHeld = false;
let frenzyTimer = 0;
let frenzyActive = false;
let paletteIdx = 0;
let clearingRows = [];
let clearingT = 0;
const CLEAR_HOLD_MS = 300;
const CLEAR_HOLD_SEC = CLEAR_HOLD_MS / 1000;
function isClearing() { return clearingRows.length > 0; }
const particles = new ParticleSystem();
const effects = new Effects();
const shapeLeft = new FloatingShape();
const shapeRight = new FloatingShape();

function resetGame() {
  grid = emptyGrid();
  piece = spawnPiece();
  score = 0;
  linesCleared = 0;
  paused = false;
  gameOver = false;
  paletteIdx = 0;
  clearingRows = [];
  clearingT = 0;
  frenzyTimer = 0;
  frenzyActive = false;
  setFrenzy(false);
  effects.startPaletteSwap(0, 0);
  effects.paletteT = 1;
  updateHud();
}

function updateHud() {
  document.getElementById('score').textContent = String(score);
  document.getElementById('lines').textContent = String(linesCleared);
  document.getElementById('bpm').textContent = String(getBpm());
}

// ===== Drop / locking =====
const SOFT_DROP_MIN_FACTOR = 6;       // matches current soft-drop speed
const SOFT_DROP_MAX_FACTOR = 240;     // effectively instant at typical BPM
const SOFT_DROP_RAMP_MS = 600;        // time to reach max acceleration

const FRENZY_CYCLE_SEC = 20;
const FRENZY_DURATION_SEC = 5;
const FRENZY_DROP_MULT = 3;

function currentDropInterval() {
  const beatSec = 60 / Math.max(60, getBpm());
  let interval;
  if (!softDropStartedAt) {
    interval = beatSec;
  } else {
    const heldMs = performance.now() - softDropStartedAt;
    const t = Math.min(1, heldMs / SOFT_DROP_RAMP_MS);
    const eased = t * t * t;
    const factor = SOFT_DROP_MIN_FACTOR
      + (SOFT_DROP_MAX_FACTOR - SOFT_DROP_MIN_FACTOR) * eased;
    interval = beatSec / factor;
  }
  if (frenzyActive) interval /= FRENZY_DROP_MULT;
  return interval;
}

function tryMove(dRow, dCol) {
  if (collides(grid, piece, dRow, dCol)) return false;
  piece.row += dRow;
  piece.col += dCol;
  return true;
}

function lockAndAdvance() {
  lockPiece(grid, piece);
  const cleared = findFullRows(grid);
  const n = cleared.length;
  if (n > 0) {
    const gained = scoreForClear(n);
    const prev = score;
    score += gained;
    linesCleared += n;
    effects.triggerClear(n);
    playClearSting(n);
    // particle burst from cleared row centers (board-relative coords resolved later in draw)
    pendingClearBursts.push({ rows: cleared, count: 25 + n * 20, power: 2 + n * 1.5 });
    // palette progression
    const newIdx = Math.floor(score / 20) % PALETTES.length;
    const oldIdx = Math.floor(prev / 20) % PALETTES.length;
    if (newIdx !== oldIdx) {
      effects.startPaletteSwap(paletteIdx, newIdx);
      paletteIdx = newIdx;
    }
    updateHud();
    // Enter clearing phase: rows stay visible while animating out.
    clearingRows = cleared;
    clearingT = CLEAR_HOLD_SEC;
    piece = null;
    dropAccumulator = 0;
    softDropStartedAt = 0;
    return;
  }
  setStackFraction(stackHeightFraction(grid));
  piece = spawnPiece();
  softDropStartedAt = 0;
  if (collides(grid, piece, 0, 0)) {
    gameOver = true;
    showGameOver();
  }
  updateHud();
}

function finishClearing() {
  removeRows(grid, clearingRows);
  clearingRows = [];
  clearingT = 0;
  setStackFraction(stackHeightFraction(grid));
  piece = spawnPiece();
  softDropStartedAt = 0;
  if (collides(grid, piece, 0, 0)) {
    gameOver = true;
    showGameOver();
  }
  updateHud();
}

const pendingClearBursts = [];

function hardDrop() {
  while (tryMove(1, 0)) {}
  lockAndAdvance();
}

// ===== Input =====
const keyHandlers = {
  ArrowLeft:  () => { if (!paused && !gameOver && piece) tryMove(0, -1); },
  ArrowRight: () => { if (!paused && !gameOver && piece) tryMove(0, 1); },
  ArrowUp:    () => { if (!paused && !gameOver && piece) tryRotate(grid, piece, 1); },
  ArrowDown:  () => { if (!softDropKeyHeld) { softDropKeyHeld = true; softDropStartedAt = performance.now(); } },
  ' ':        () => { if (!paused && !gameOver && piece) hardDrop(); },
  p:          () => togglePause(),
  P:          () => togglePause(),
};

window.addEventListener('keydown', (e) => {
  if (isAudioPending()) { consumeAudioPending(); startAudio().catch(err => console.error('Audio failed to start', err)); }
  const h = keyHandlers[e.key];
  if (h) { h(); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowDown') { softDropKeyHeld = false; softDropStartedAt = 0; }
});

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (paused) pauseAudio(); else resumeAudio();
}

// ===== Rendering =====
function getActivePalette() {
  const t = easeInOut(effects.paletteT);
  const a = PALETTES[effects.paletteFromIdx];
  const b = PALETTES[effects.paletteToIdx];
  return lerpPalette(a, b, t);
}

function boardLayout() {
  // Cell size from height, leave margin.
  const cell = Math.max(18, Math.min(40, Math.floor(H * 0.85 / ROWS)));
  const boardW = cell * COLS;
  const boardH = cell * ROWS;
  const x = Math.floor((W - boardW) / 2);
  const y = Math.floor((H - boardH) / 2);
  return { cell, boardW, boardH, x, y };
}

function drawBackground(palette, beatPhase) {
  const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(beatPhase * Math.PI * 2));
  const cx = W / 2, cy = H / 2;
  const grad = ctx.createRadialGradient(cx, cy, 50, cx, cy, Math.hypot(W, H) / 1.5);
  grad.addColorStop(0, palette.bgB);
  grad.addColorStop(1, palette.bgA);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // subtle vignette tint synced to beat
  ctx.fillStyle = withAlpha(palette.glow, 0.04 * pulse);
  ctx.fillRect(0, 0, W, H);
}

function drawBlock(x, y, size, color, scale = 1, glow = 0) {
  const inset = (size * (1 - scale)) / 2;
  const s = size * scale;
  const r = Math.max(2, s * 0.12);
  ctx.save();
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 16 * glow;
  }
  ctx.fillStyle = color;
  roundRect(ctx, x + inset + 1, y + inset + 1, s - 2, s - 2, r);
  ctx.fill();
  // inner highlight
  ctx.fillStyle = withAlpha('#ffffff', 0.18);
  roundRect(ctx, x + inset + 2, y + inset + 2, s - 4, (s - 4) * 0.45, r);
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBoardFrame(layout, palette, beatPhase) {
  const { x, y, boardW, boardH } = layout;
  const ambientGlow = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(beatPhase * Math.PI * 2));
  const totalGlow = Math.min(1, ambientGlow + effects.glow);

  // Outer glow
  ctx.save();
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = 30 + 60 * totalGlow;
  ctx.strokeStyle = withAlpha(palette.glow, 0.7);
  ctx.lineWidth = 2;
  roundRect(ctx, x - 4, y - 4, boardW + 8, boardH + 8, 8);
  ctx.stroke();
  ctx.restore();

  // Inner board fill
  ctx.fillStyle = withAlpha('#000000', 0.55);
  roundRect(ctx, x, y, boardW, boardH, 4);
  ctx.fill();

  // Faint grid lines
  ctx.strokeStyle = withAlpha(palette.glow, 0.06);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < COLS; c++) {
    const cx = x + c * layout.cell;
    ctx.moveTo(cx, y);
    ctx.lineTo(cx, y + boardH);
  }
  for (let r = 1; r < ROWS; r++) {
    const cy = y + r * layout.cell;
    ctx.moveTo(x, cy);
    ctx.lineTo(x + boardW, cy);
  }
  ctx.stroke();
}

function drawGrid(layout, palette, beatPhase) {
  const { x, y, cell } = layout;
  const breath = 1 + 0.04 * Math.sin(beatPhase * Math.PI * 2) + effects.blockPulse;
  const clearSet = clearingRows.length ? new Set(clearingRows) : null;
  const clearProgress = clearSet ? 1 - Math.max(0, clearingT) / CLEAR_HOLD_SEC : 0;
  for (let r = 0; r < ROWS; r++) {
    const isClearRow = clearSet && clearSet.has(r);
    for (let c = 0; c < COLS; c++) {
      const v = grid[r][c];
      if (v === -1) continue;
      const baseColor = palette.blocks[v % palette.blocks.length];
      if (isClearRow) {
        // Brighten toward palette.glow early, then fade alpha + shrink scale.
        const t = clearProgress;
        const color = lerpColor(baseColor, palette.glow, Math.min(1, t * 1.5));
        const alpha = 1 - t;
        const scale = breath * (1 - 0.4 * t);
        const glowBoost = 0.4 + 0.8 * (1 - t);
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        drawBlock(x + c * cell, y + r * cell, cell, color, scale, glowBoost);
        ctx.restore();
      } else {
        drawBlock(x + c * cell, y + r * cell, cell, baseColor, breath, 0.4);
      }
    }
  }
}

function drawPiece(layout, palette, beatPhase, p, alpha = 1, ghost = false) {
  const { x, y, cell } = layout;
  const breath = 1 + 0.05 * Math.sin(beatPhase * Math.PI * 2) + effects.blockPulse;
  const color = palette.blocks[p.colorIndex % palette.blocks.length];
  for (const [dr, dc] of pieceCells(p)) {
    const rr = p.row + dr;
    const cc = p.col + dc;
    if (rr < 0) continue;
    if (ghost) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = color;
      roundRect(ctx, x + cc * cell + 3, y + rr * cell + 3, cell - 6, cell - 6, 3);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = alpha;
      drawBlock(x + cc * cell, y + rr * cell, cell, color, breath, 0.6);
      ctx.restore();
    }
  }
}

function ghostPiece() {
  const g = { ...piece };
  while (!collides(grid, g, 1, 0)) g.row += 1;
  return g;
}

// ===== Main loop =====
function frame(now) {
  if (!lastTime) lastTime = now;
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (!paused && !gameOver) {
    frenzyTimer += dt;
    if (frenzyTimer >= FRENZY_CYCLE_SEC) frenzyTimer -= FRENZY_CYCLE_SEC;
    const shouldBeFrenzy =
      frenzyTimer >= (FRENZY_CYCLE_SEC - FRENZY_DURATION_SEC);
    if (shouldBeFrenzy !== frenzyActive) {
      frenzyActive = shouldBeFrenzy;
      setFrenzy(frenzyActive);
    }

    if (isClearing()) {
      clearingT -= dt;
      if (clearingT <= 0) finishClearing();
    } else {
      dropAccumulator += dt;
      const interval = currentDropInterval();
      while (dropAccumulator >= interval) {
        dropAccumulator -= interval;
        if (!tryMove(1, 0)) {
          lockAndAdvance();
          break;
        }
      }
    }
  }

  effects.update(dt);
  updatePortals(dt);
  particles.update(dt);
  shapeLeft.update(dt);
  shapeRight.update(dt);

  const palette = getActivePalette();
  const layout = boardLayout();
  const beatPhase = getBeatPhase();

  // Ambient particle drift in gutters
  particles.ambient(W, H, layout.x, layout.boardW, beatPhase);

  // Resolve any pending burst spawns now that we know the layout.
  while (pendingClearBursts.length) {
    const b = pendingClearBursts.shift();
    for (const r of b.rows) {
      const cy = layout.y + r * layout.cell + layout.cell / 2;
      particles.burst(layout.x - 6, cy, b.count / 2, b.power);
      particles.burst(layout.x + layout.boardW + 6, cy, b.count / 2, b.power);
    }
  }

  // ===== Render =====
  ctx.clearRect(0, 0, W, H);
  drawBackground(palette, beatPhase);

  const [sx, sy] = effects.shakeOffset();
  ctx.save();
  ctx.translate(sx, sy);

  // Floating shapes in the gutters
  const shapeRadius = Math.min(layout.x * 0.35, H * 0.12);
  const leftCx = layout.x / 2;
  const rightCx = layout.x + layout.boardW + (W - layout.x - layout.boardW) / 2;
  const shapeCy = H / 2;
  shapeLeft.draw(ctx, leftCx, shapeCy, shapeRadius, palette.particles, palette.glow, beatPhase);
  shapeRight.draw(ctx, rightCx, shapeCy, shapeRadius, palette.particles, palette.glow, beatPhase);

  particles.draw(ctx, palette.particles, beatPhase);
  drawPortals(ctx, layout, palette, beatPhase, W, H);

  drawBoardFrame(layout, palette, beatPhase);
  drawGrid(layout, palette, beatPhase);
  if (!gameOver && piece) {
    drawPiece(layout, palette, beatPhase, ghostPiece(), 1, true);
    drawPiece(layout, palette, beatPhase, piece, 1, false);
  }

  ctx.restore();

  // Fullscreen flash overlay (above shake so flash is full-rect)
  if (effects.flash > 0.01) {
    ctx.fillStyle = withAlpha(palette.glow, effects.flash);
    ctx.fillRect(0, 0, W, H);
  }

  if (paused) drawCenterText('PAUSED');

  updateHud();
  requestAnimationFrame(frame);
}

function drawCenterText(text) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2);
  ctx.restore();
}

// ===== Boot =====
function showGameOver() {
  document.getElementById('final-score').textContent = String(score);
  document.getElementById('gameover').classList.remove('hidden');
}

function bootGame() {
  onKick(() => {
    const layout = boardLayout();
    particles.kickBounce(W, H, layout.x, layout.boardW);
    shapeLeft.kick();
    shapeRight.kick();
  });
  resetGame();
  lastTime = 0;
  requestAnimationFrame(frame);
}

document.getElementById('start-btn').addEventListener('click', async () => {
  document.getElementById('overlay').style.display = 'none';
  try {
    await startAudio();
  } catch (err) {
    console.error('Audio failed to start', err);
  }
  bootGame();
});

if (arrivedFromPortal()) {
  document.getElementById('overlay').style.display = 'none';
  bootGame();
}

document.getElementById('restart-btn').addEventListener('click', () => {
  document.getElementById('gameover').classList.add('hidden');
  resetGame();
});
