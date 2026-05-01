import { pieceCells, pieceBoundingBox, randomPiece } from './pieces.js';

export const COLS = 10;
export const ROWS = 20;

export function emptyGrid() {
  const g = new Array(ROWS);
  for (let r = 0; r < ROWS; r++) g[r] = new Array(COLS).fill(-1);
  return g;
}

export function collides(grid, piece, dRow = 0, dCol = 0, rotation = piece.rotation) {
  const cells = piece.rotations[rotation];
  for (const [r, c] of cells) {
    const rr = piece.row + r + dRow;
    const cc = piece.col + c + dCol;
    if (cc < 0 || cc >= COLS || rr >= ROWS) return true;
    if (rr >= 0 && grid[rr][cc] !== -1) return true;
  }
  return false;
}

export function lockPiece(grid, piece) {
  for (const [r, c] of pieceCells(piece)) {
    const rr = piece.row + r;
    const cc = piece.col + c;
    if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
      grid[rr][cc] = piece.colorIndex;
    }
  }
}

// Returns array of full row indices (descending), without mutating grid.
export function findFullRows(grid) {
  const cleared = [];
  for (let r = ROWS - 1; r >= 0; r--) {
    if (grid[r].every(v => v !== -1)) cleared.push(r);
  }
  return cleared;
}

// Removes the given rows and prepends blank rows; mutates grid.
export function removeRows(grid, rows) {
  if (!rows || rows.length === 0) return;
  const drop = new Set(rows);
  const kept = [];
  for (let r = 0; r < ROWS; r++) {
    if (!drop.has(r)) kept.push(grid[r]);
  }
  const fresh = [];
  for (let i = 0; i < rows.length; i++) fresh.push(new Array(COLS).fill(-1));
  const merged = fresh.concat(kept);
  for (let r = 0; r < ROWS; r++) grid[r] = merged[r];
}

// Returns array of cleared row indices and mutates grid (legacy API).
export function clearLines(grid) {
  const cleared = findFullRows(grid);
  removeRows(grid, cleared);
  return cleared;
}

export function scoreForClear(linesCleared) {
  return [0, 1, 3, 6, 10][linesCleared] || 0;
}

// Highest non-empty row index (smallest r). Returns ROWS if board is empty.
export function highestStackRow(grid) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== -1) return r;
    }
  }
  return ROWS;
}

// Stack height as fraction in [0, 1]. 0 = empty, 1 = full.
export function stackHeightFraction(grid) {
  return 1 - (highestStackRow(grid) / ROWS);
}

export function spawnPiece() {
  const p = randomPiece();
  const bbox = pieceBoundingBox(p);
  p.col = Math.floor((COLS - bbox.width) / 2) - bbox.minC;
  p.row = -bbox.minR;
  return p;
}

export function tryRotate(grid, piece, dir = 1) {
  const next = (piece.rotation + dir + piece.rotations.length) % piece.rotations.length;
  // Wall-kick: try rotation, then ±1, ±2 column shifts.
  const kicks = [0, -1, 1, -2, 2];
  for (const dc of kicks) {
    if (!collides(grid, piece, 0, dc, next)) {
      piece.rotation = next;
      piece.col += dc;
      return true;
    }
  }
  return false;
}
