// Thin wrapper over localStorage with safe defaults and namespaced keys.

import { STORAGE } from './constants.js';

export function getJSON(key, def) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return def;
    return JSON.parse(raw);
  } catch { return def; }
}

export function setJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); }
  catch { /* quota exceeded or disabled; silently ignore */ }
}

export function delKey(key) {
  try { localStorage.removeItem(key); } catch { /* */ }
}

// ---- Prefs (UI state + last host settings) ----
export function getPrefs() {
  return getJSON(STORAGE.PREFS, {});
}
export function savePrefs(patch) {
  const cur = getPrefs();
  setJSON(STORAGE.PREFS, { ...cur, ...patch });
}

// ---- Head-to-head per opponent name ----
export function getH2H(otherName) {
  const k = STORAGE.H2H_PREFIX + (otherName || '').toLowerCase().trim();
  return getJSON(k, { mine: 0, theirs: 0, ties: 0 });
}
export function saveH2H(otherName, rec) {
  const k = STORAGE.H2H_PREFIX + (otherName || '').toLowerCase().trim();
  setJSON(k, rec);
}
export function totalH2H() {
  let mine = 0, theirs = 0, ties = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE.H2H_PREFIX)) {
        const r = getJSON(k, {});
        mine += r.mine || 0;
        theirs += r.theirs || 0;
        ties += r.ties || 0;
      }
    }
  } catch { /* */ }
  return { mine, theirs, ties };
}

// ---- Stats ----
const DEFAULT_STATS = {
  gamesPlayed: 0, gamesWon: 0,
  multiGames: 0, multiWon: 0,
  soloGames: 0, soloWon: 0,
  totalScore: 0, highScore: 0,
  rounds: 0,
};
export function getStats() {
  return { ...DEFAULT_STATS, ...getJSON(STORAGE.STATS, {}) };
}
export function updateStats(patch) {
  const s = getStats();
  for (const [k, v] of Object.entries(patch)) {
    s[k] = typeof v === 'function' ? v(s[k] || 0) : v;
  }
  setJSON(STORAGE.STATS, s);
  return s;
}

// ---- Achievements ----
export function getAchievements() { return getJSON(STORAGE.ACH, []); }
export function hasAch(id) { return getAchievements().includes(id); }
export function unlockAchRaw(id) {
  const list = getAchievements();
  if (list.includes(id)) return false;
  list.push(id);
  setJSON(STORAGE.ACH, list);
  return true;
}

// ---- Daily ----
export function getDailyState() {
  return { lastCompleted: null, streak: 0, totalCompleted: 0, history: {}, ...getJSON(STORAGE.DAILY, {}) };
}
export function saveDailyState(s) { setJSON(STORAGE.DAILY, s); }

// ---- Puzzles ----
export function getSolvedPuzzles() { return getJSON(STORAGE.PUZZLE, []); }
export function saveSolvedPuzzles(arr) { setJSON(STORAGE.PUZZLE, arr); }

// ---- Tournament ----
export function getTournament() { return getJSON(STORAGE.TOURNEY, { level: 0 }); }
export function saveTournament(t) { setJSON(STORAGE.TOURNEY, t); }

// ---- Ghost (best previous solo game) ----
export function getGhost() { return getJSON(STORAGE.GHOST, null); }
export function saveGhost(g) { setJSON(STORAGE.GHOST, g); }

// ---- Saved game (in-progress) ----
export function getSavedGame() { return getJSON(STORAGE.SAVE, null); }
export function saveGame(snap) { setJSON(STORAGE.SAVE, snap); }
export function clearSavedGame() { delKey(STORAGE.SAVE); }

// ---- Bulk export/import ----
export function exportAll() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('gops3-')) out[k] = localStorage.getItem(k);
  }
  return out;
}
export function importAll(obj) {
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (k.startsWith('gops3-')) localStorage.setItem(k, v);
  });
}
export function wipeAll() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('gops3-')) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
}
