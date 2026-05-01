// All polyomino pieces used by the game.
// Each piece has rotations as arrays of [row, col] offsets.
// colorIndex points into the active palette's blocks[] array.

export const PIECES = [
  // ===== Standard tetrominoes =====
  {
    id: 'I',
    colorIndex: 0,
    rotations: [
      [[1, 0], [1, 1], [1, 2], [1, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
    ],
  },
  {
    id: 'O',
    colorIndex: 1,
    rotations: [
      [[0, 0], [0, 1], [1, 0], [1, 1]],
    ],
  },
  {
    id: 'T',
    colorIndex: 2,
    rotations: [
      [[0, 1], [1, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 1]],
      [[0, 1], [1, 0], [1, 1], [2, 1]],
    ],
  },
  {
    id: 'S',
    colorIndex: 3,
    rotations: [
      [[0, 1], [0, 2], [1, 0], [1, 1]],
      [[0, 1], [1, 1], [1, 2], [2, 2]],
    ],
  },
  {
    id: 'Z',
    colorIndex: 4,
    rotations: [
      [[0, 0], [0, 1], [1, 1], [1, 2]],
      [[0, 2], [1, 1], [1, 2], [2, 1]],
    ],
  },
  {
    id: 'J',
    colorIndex: 5,
    rotations: [
      [[0, 0], [1, 0], [1, 1], [1, 2]],
      [[0, 1], [0, 2], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 0], [2, 1]],
    ],
  },
  {
    id: 'L',
    colorIndex: 6,
    rotations: [
      [[0, 2], [1, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]],
      [[1, 0], [1, 1], [1, 2], [2, 0]],
      [[0, 0], [0, 1], [1, 1], [2, 1]],
    ],
  },

  // ===== Custom: domino (2 blocks) =====
  {
    id: 'D2',
    colorIndex: 7,
    rotations: [
      [[0, 0], [0, 1]],
      [[0, 0], [1, 0]],
    ],
  },

  // ===== Custom: triomino I (3 in line) =====
  {
    id: 'I3',
    colorIndex: 8,
    rotations: [
      [[0, 0], [0, 1], [0, 2]],
      [[0, 0], [1, 0], [2, 0]],
    ],
  },

  // ===== Custom: triomino L (right-angle 3) =====
  {
    id: 'L3',
    colorIndex: 9,
    rotations: [
      [[0, 0], [1, 0], [1, 1]],
      [[0, 0], [0, 1], [1, 0]],
      [[0, 0], [0, 1], [1, 1]],
      [[0, 1], [1, 0], [1, 1]],
    ],
  },

  // ===== Custom: long-I pentomino (5 in line) =====
  {
    id: 'I5',
    colorIndex: 10,
    rotations: [
      [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
      [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
    ],
  },
];

export function randomPiece() {
  const def = PIECES[Math.floor(Math.random() * PIECES.length)];
  return {
    id: def.id,
    colorIndex: def.colorIndex,
    rotations: def.rotations,
    rotation: 0,
    row: 0,
    col: 0,
  };
}

export function pieceCells(piece) {
  return piece.rotations[piece.rotation];
}

export function pieceBoundingBox(piece) {
  const cells = pieceCells(piece);
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (const [r, c] of cells) {
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }
  return { minR, maxR, minC, maxC, width: maxC - minC + 1, height: maxR - minR + 1 };
}
