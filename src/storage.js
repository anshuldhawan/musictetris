const STORAGE_PREFIX = 'musictetris:v1';
const DEFAULT_PLAYER_ID = 'tetromino';

function storage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getPlayerId() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('username');
    return raw && raw.trim() ? raw.trim() : DEFAULT_PLAYER_ID;
  } catch {
    return DEFAULT_PLAYER_ID;
  }
}

function storageKey(kind) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(getPlayerId())}:${kind}`;
}

export function loadGameState() {
  const local = storage();
  if (!local) return null;
  try {
    const raw = local.getItem(storageKey('save'));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    clearGameState();
    return null;
  }
}

export function saveGameState(state) {
  const local = storage();
  if (!local) return;
  try {
    local.setItem(storageKey('save'), JSON.stringify({
      ...state,
      savedAt: Date.now(),
    }));
  } catch {
    // Storage can be disabled or full; gameplay should continue either way.
  }
}

export function clearGameState() {
  const local = storage();
  if (!local) return;
  try {
    local.removeItem(storageKey('save'));
  } catch {
    // Ignore storage failures.
  }
}

export function loadHighScore() {
  const local = storage();
  if (!local) return 0;
  try {
    const value = Number.parseInt(local.getItem(storageKey('highScore')) || '0', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function saveHighScore(score) {
  const local = storage();
  if (!local) return;
  try {
    const value = Math.max(0, Math.floor(Number(score) || 0));
    local.setItem(storageKey('highScore'), String(value));
  } catch {
    // Ignore storage failures.
  }
}
