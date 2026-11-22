// The save game: one JSON record in localStorage holding the player's cash, how far the
// story has come, their reputation and where they were standing. Storage can be unavailable
// (private windows, blocked cookies); every function then quietly does nothing, and the game
// simply starts fresh each visit.

const SAVE_KEY = 'palmera-heat.save.v1';

/** The stored save, or null when there is none (or it cannot be read or parsed). */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

/** Store a save record: { cash, missionIndex, rep, x, y }. */
export function storeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // No storage: the run lasts this visit only.
  }
}

/** Forget the save (New Game). */
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to forget.
  }
}
