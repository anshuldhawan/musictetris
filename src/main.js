import { COLS, ROWS, emptyGrid, collides, lockPiece, findFullRows, removeRows, scoreForClear,
         spawnPiece, tryRotate, stackHeightFraction } from './board.js';
import { PIECES } from './pieces.js';
import { ParticleSystem } from './particles.js';
import { FloatingShape } from './shapes.js';
import { Effects } from './effects.js';
import { PALETTES, lerpPalette } from './palette.js';
import { easeInOut } from './effects.js';
import { startAudio, pauseAudio, resumeAudio, setStackFraction, setFrenzy, getBpm,
         getBeatPhase, onKick, playClearSting, setMusicMuted, isMusicMuted } from './audio.js';
import { initPortals, updatePortals, isAudioPending,
         consumeAudioPending } from './portals.js';
import { initRenderer, resizeRenderer, renderFrame, viewportSize,
         rendererPixelRatio, emitClusterRowClear } from './renderer.js';
import { initOverlays, updateFrenzyBanner, setPausedVisible } from './ui/overlays.js';
import { loadGameState, saveGameState, clearGameState, loadHighScore,
         saveHighScore } from './storage.js';

// ===== Canvas / renderer setup =====
const canvas = document.getElementById('game');
let W = 0, H = 0;

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  resizeRenderer(W, H);
}
window.addEventListener('resize', resize);

initRenderer(canvas);
resize();
initPortals(canvas, persistNow);
initOverlays();

// ===== Game state =====
let grid, piece, score, linesCleared, paused, gameOver;
let lastTime = 0, dropAccumulator = 0;
let lastSaveAt = 0;
let softDropStartedAt = 0;
let softDropKeyHeld = false;
let frenzyTimer = 0;
let frenzyState = 'idle';
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
let highScore = loadHighScore();

let startTime = performance.now();
const SAVE_INTERVAL_MS = 2000;

function resetGame({ clearSave = false } = {}) {
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
  frenzyState = 'idle';
  setFrenzy(false);
  effects.startPaletteSwap(0, 0);
  effects.paletteT = 1;
  setPausedVisible(false);
  if (clearSave) clearGameState();
  updateHud();
}

function updateHud() {
  updateHighScore();
  document.getElementById('score').textContent = String(score);
  document.getElementById('high-score').textContent = String(highScore);
  document.getElementById('lines').textContent = String(linesCleared);
  document.getElementById('bpm').textContent = String(getBpm());
}

function numberOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function integerOr(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
}

function cloneGrid(source) {
  return source.map(row => row.slice());
}

function validGrid(source) {
  if (!Array.isArray(source) || source.length !== ROWS) return null;
  const next = [];
  for (const row of source) {
    if (!Array.isArray(row) || row.length !== COLS) return null;
    next.push(row.map(cell => {
      const value = Number(cell);
      return Number.isInteger(value) && value >= -1 ? value : -1;
    }));
  }
  return next;
}

function serializePiece(activePiece) {
  if (!activePiece) return null;
  return {
    id: activePiece.id,
    rotation: activePiece.rotation,
    row: activePiece.row,
    col: activePiece.col,
  };
}

function hydratePiece(savedPiece) {
  if (!savedPiece || typeof savedPiece.id !== 'string') return null;
  const def = PIECES.find(candidate => candidate.id === savedPiece.id);
  if (!def) return null;
  const rotation = integerOr(savedPiece.rotation, 0);
  return {
    id: def.id,
    colorIndex: def.colorIndex,
    rotations: def.rotations,
    rotation: ((rotation % def.rotations.length) + def.rotations.length) % def.rotations.length,
    row: integerOr(savedPiece.row, 0),
    col: integerOr(savedPiece.col, Math.floor(COLS / 2)),
  };
}

function serializeGameState() {
  return {
    grid: cloneGrid(grid),
    piece: serializePiece(piece),
    score,
    linesCleared,
    paused,
    gameOver,
    paletteIdx,
    frenzyState,
    frenzyTimer,
    clearingRows: clearingRows.slice(),
    clearingT,
    dropAccumulator,
  };
}

function updateHighScore() {
  if (Number.isFinite(score) && score > highScore) {
    highScore = score;
    saveHighScore(highScore);
  }
}

function persistNow() {
  if (!grid) return;
  updateHighScore();
  if (gameOver) {
    clearGameState();
    return;
  }
  saveGameState(serializeGameState());
  lastSaveAt = performance.now();
}

function restoreSavedGame() {
  const saved = loadGameState();
  if (!saved) return false;
  if (saved.gameOver) {
    clearGameState();
    return false;
  }

  const savedGrid = validGrid(saved.grid);
  if (!savedGrid) {
    clearGameState();
    return false;
  }

  const savedClearingRows = Array.isArray(saved.clearingRows)
    ? saved.clearingRows.filter(row => Number.isInteger(row) && row >= 0 && row < ROWS)
    : [];
  const savedPiece = hydratePiece(saved.piece);
  if (!savedPiece && savedClearingRows.length === 0) {
    clearGameState();
    return false;
  }

  grid = savedGrid;
  piece = savedPiece;
  score = Math.max(0, integerOr(saved.score, 0));
  linesCleared = Math.max(0, integerOr(saved.linesCleared, 0));
  paused = !!saved.paused;
  gameOver = false;
  paletteIdx = Math.max(0, integerOr(saved.paletteIdx, 0)) % PALETTES.length;
  clearingRows = savedClearingRows;
  clearingT = savedClearingRows.length
    ? Math.max(0.01, numberOr(saved.clearingT, CLEAR_HOLD_SEC))
    : 0;
  dropAccumulator = Math.max(0, numberOr(saved.dropAccumulator, 0));
  softDropStartedAt = 0;
  softDropKeyHeld = false;
  frenzyTimer = Math.max(0, numberOr(saved.frenzyTimer, 0)) % FRENZY_CYCLE_SEC;
  frenzyState = ['idle', 'normal', 'warning', 'frenzy'].includes(saved.frenzyState)
    ? saved.frenzyState
    : (score >= FRENZY_GATE_SCORE ? 'normal' : 'idle');

  setFrenzy(frenzyState === 'frenzy');
  setStackFraction(stackHeightFraction(grid));
  effects.startPaletteSwap(paletteIdx, paletteIdx);
  effects.paletteT = 1;
  setPausedVisible(paused);
  updateHud();
  return true;
}

// ===== Drop / locking =====
const SOFT_DROP_MIN_FACTOR = 6;
const SOFT_DROP_MAX_FACTOR = 240;
const SOFT_DROP_RAMP_MS = 600;

const FRENZY_GATE_SCORE = 25;
const FRENZY_GAP_SEC = 25;
const FRENZY_DURATION_SEC = 5;
const FRENZY_WARNING_SEC = 3;
const FRENZY_CYCLE_SEC = FRENZY_GAP_SEC + FRENZY_DURATION_SEC;
const FRENZY_DROP_MULT = 2;

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
  if (frenzyState === 'frenzy') interval /= FRENZY_DROP_MULT;
  return interval;
}

function tryMove(dRow, dCol, persist = true) {
  if (collides(grid, piece, dRow, dCol)) return false;
  piece.row += dRow;
  piece.col += dCol;
  if (persist) persistNow();
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
    pendingClearBursts.push({ rows: cleared, count: 25 + n * 20, power: 2 + n * 1.5 });
    emitClusterRowClear(boardLayout(), cleared, 1.2 + n * 0.35);
    const newIdx = Math.floor(score / 20) % PALETTES.length;
    const oldIdx = Math.floor(prev / 20) % PALETTES.length;
    if (newIdx !== oldIdx) {
      effects.startPaletteSwap(paletteIdx, newIdx);
      paletteIdx = newIdx;
    }
    updateHud();
    clearingRows = cleared;
    clearingT = CLEAR_HOLD_SEC;
    piece = null;
    dropAccumulator = 0;
    softDropStartedAt = 0;
    persistNow();
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
  persistNow();
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
  persistNow();
}

const pendingClearBursts = [];

function hardDrop() {
  while (tryMove(1, 0, false)) {}
  lockAndAdvance();
  persistNow();
}

// ===== Input =====
const keyHandlers = {
  ArrowLeft:  () => { if (!paused && !gameOver && piece) tryMove(0, -1); },
  ArrowRight: () => { if (!paused && !gameOver && piece) tryMove(0, 1); },
  ArrowUp:    () => { if (!paused && !gameOver && piece && tryRotate(grid, piece, 1)) persistNow(); },
  ArrowDown:  () => { if (!softDropKeyHeld) { softDropKeyHeld = true; softDropStartedAt = performance.now(); persistNow(); } },
  ' ':        () => { if (!paused && !gameOver && piece) hardDrop(); },
  p:          () => togglePause(),
  P:          () => togglePause(),
  m:          () => toggleMute(),
  M:          () => toggleMute(),
};

window.addEventListener('keydown', (e) => {
  if (isAudioPending()) { consumeAudioPending(); startAudio().catch(err => console.error('Audio failed to start', err)); }
  const h = keyHandlers[e.key];
  if (h) { h(); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowDown') { softDropKeyHeld = false; softDropStartedAt = 0; persistNow(); }
});

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (paused) pauseAudio(); else resumeAudio();
  setPausedVisible(paused);
  persistNow();
}

function toggleMute() {
  const next = !isMusicMuted();
  setMusicMuted(next);
  const btn = document.getElementById('mute-btn');
  const label = document.getElementById('mute-state');
  if (btn) btn.setAttribute('aria-pressed', next ? 'true' : 'false');
  if (label) label.textContent = next ? 'OFF' : 'ON';
}

// ===== Layout / palette =====
function getActivePalette() {
  const t = easeInOut(effects.paletteT);
  const a = PALETTES[effects.paletteFromIdx];
  const b = PALETTES[effects.paletteToIdx];
  return lerpPalette(a, b, t);
}

function boardLayout() {
  const cell = Math.max(18, Math.min(40, Math.floor(H * 0.85 / ROWS)));
  const boardW = cell * COLS;
  const boardH = cell * ROWS;
  const x = Math.floor((W - boardW) / 2);
  const y = Math.floor((H - boardH) / 2);
  return { cell, boardW, boardH, x, y };
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
    if (frenzyState === 'idle' && score >= FRENZY_GATE_SCORE) {
      frenzyState = 'normal';
      frenzyTimer = 0;
    }
    if (frenzyState !== 'idle') {
      frenzyTimer += dt;
      if (frenzyTimer >= FRENZY_CYCLE_SEC) frenzyTimer -= FRENZY_CYCLE_SEC;
      let nextState;
      if (frenzyTimer >= FRENZY_GAP_SEC) nextState = 'frenzy';
      else if (frenzyTimer >= FRENZY_GAP_SEC - FRENZY_WARNING_SEC) nextState = 'warning';
      else nextState = 'normal';
      if (nextState !== frenzyState) {
        const wasFrenzy = frenzyState === 'frenzy';
        const isFrenzy = nextState === 'frenzy';
        frenzyState = nextState;
        if (isFrenzy && !wasFrenzy) {
          setFrenzy(true);
          effects.flash = Math.max(effects.flash, 0.5);
          effects.glow = Math.max(effects.glow, 0.9);
          effects.shake = Math.max(effects.shake, 8);
        } else if (!isFrenzy && wasFrenzy) {
          setFrenzy(false);
        }
      }
    }

    if (isClearing()) {
      clearingT -= dt;
      if (clearingT <= 0) finishClearing();
    } else {
      dropAccumulator += dt;
      const interval = currentDropInterval();
      let moved = false;
      let locked = false;
      while (dropAccumulator >= interval) {
        dropAccumulator -= interval;
        if (!tryMove(1, 0, false)) {
          lockAndAdvance();
          locked = true;
          break;
        }
        moved = true;
      }
      if (moved && !locked) persistNow();
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

  particles.ambient(W, H, layout.x, layout.boardW, beatPhase);

  while (pendingClearBursts.length) {
    const b = pendingClearBursts.shift();
    for (const r of b.rows) {
      const cy = layout.y + r * layout.cell + layout.cell / 2;
      particles.burst(layout.x - 6, cy, b.count / 2, b.power);
      particles.burst(layout.x + layout.boardW + 6, cy, b.count / 2, b.power);
    }
  }

  const clearProgress = clearingRows.length
    ? 1 - Math.max(0, clearingT) / CLEAR_HOLD_SEC
    : 0;

  const time = (now - startTime) / 1000;

  renderFrame({
    grid,
    piece,
    ghost: !gameOver && piece ? ghostPiece() : null,
    palette,
    layout,
    beatPhase,
    time,
    effects,
    frenzyState,
    clearingRows,
    clearProgress,
    particleSystem: particles,
    shapeLeft,
    shapeRight,
    viewport: { W, H },
    dt,
    pixelRatio: rendererPixelRatio(),
  });

  updateFrenzyBanner({ frenzyState, frenzyTimer, frenzyGapSec: FRENZY_GAP_SEC, layout });

  updateHud();
  if (now - lastSaveAt >= SAVE_INTERVAL_MS) persistNow();
  requestAnimationFrame(frame);
}

// ===== Boot =====
function showGameOver() {
  updateHighScore();
  clearGameState();
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
  if (!restoreSavedGame()) resetGame();
  lastTime = 0;
  startTime = performance.now();
  requestAnimationFrame(frame);
}

window.addEventListener('pointerdown', () => {
  if (isAudioPending()) {
    consumeAudioPending();
    startAudio().catch(err => console.error('Audio failed to start', err));
  }
});

document.getElementById('restart-btn').addEventListener('click', () => {
  document.getElementById('gameover').classList.add('hidden');
  resetGame({ clearSave: true });
  persistNow();
});

document.getElementById('mute-btn').addEventListener('click', toggleMute);

window.addEventListener('pagehide', persistNow);
window.addEventListener('beforeunload', persistNow);

bootGame();
