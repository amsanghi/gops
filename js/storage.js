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

// ---- Heatmap (bid frequency by prize rank) ----
// 13x13 matrix: rows = prize rank, cols = bid value. Counts occurrences.
export function getHeatmap() { return getJSON(STORAGE.HEATMAP, null); }
export function updateHeatmap(history, deckSize = 13) {
  if (deckSize !== 13) return; // only track full-deck games for consistent heatmap
  const cur = getHeatmap() || makeBlankHeatmap();
  for (const h of history) {
    const row = h.prize - 1, col = h.mine - 1;
    if (row >= 0 && row < 13 && col >= 0 && col < 13) cur[row][col]++;
  }
  setJSON(STORAGE.HEATMAP, cur);
}
function makeBlankHeatmap() {
  return Array.from({ length: 13 }, () => Array.from({ length: 13 }, () => 0));
}

// ---- Per-mode high scores ----
const RECORD_MODES = ['solo','daily','bullet','endless','tournament','ghost','hotseat','battle','puzzle','multi'];
export function getRecords() {
  const r = getJSON(STORAGE.RECORDS, {});
  RECORD_MODES.forEach(m => { if (!(m in r)) r[m] = { score: 0, ts: 0, wins: 0 }; });
  return r;
}
export function updateRecord(mode, score, didWin) {
  const r = getRecords();
  if (!r[mode]) r[mode] = { score: 0, ts: 0, wins: 0 };
  if (score > r[mode].score) { r[mode].score = score; r[mode].ts = Date.now(); }
  if (didWin) r[mode].wins = (r[mode].wins || 0) + 1;
  setJSON(STORAGE.RECORDS, r);
}

// ---- Custom theme ----
export function getCustomTheme() { return getJSON(STORAGE.CUSTOM_THEME, null); }
export function saveCustomTheme(t) { setJSON(STORAGE.CUSTOM_THEME, t); }

// ---- AI mastery — wins per tournament AI ----
const MASTERY_KEY = 'gops-mastery';
export function getMastery() { return getJSON(MASTERY_KEY, {}); }
export function recordMasteryWin(aiName) {
  const m = getMastery();
  m[aiName] = (m[aiName] || 0) + 1;
  setJSON(MASTERY_KEY, m);
}

// ---- Multi-session (for refresh-rejoin) ----
export function getMultiSession() { return getJSON(STORAGE.MULTI_SESSION, null); }
export function saveMultiSession(s) { setJSON(STORAGE.MULTI_SESSION, { ...s, ts: Date.now() }); }
export function clearMultiSession() { delKey(STORAGE.MULTI_SESSION); }

// ---- Saved game (in-progress) ----
export function getSavedGame() { return getJSON(STORAGE.SAVE, null); }
export function saveGame(snap) { setJSON(STORAGE.SAVE, snap); }
export function clearSavedGame() { delKey(STORAGE.SAVE); }

// ---- One-shot migration from old gops3-* keys to new gops-* keys ----
// Runs on init. If user has existing data under old keys, copy & clean up.
const MIGRATION_FLAG = 'gops-migrated-v1';
export function migrateStorage() {
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return;
    const renames = {
      'gops3-prefs': 'gops-prefs',
      'gops3-saved-game': 'gops-saved-game',
      'gops3-stats': 'gops-stats',
      'gops3-achievements': 'gops-achievements',
      'gops3-daily': 'gops-daily',
      'gops3-puzzles': 'gops-puzzles',
      'gops3-tournament': 'gops-tournament',
      'gops3-ghost': 'gops-ghost',
      'gops3-heatmap': 'gops-heatmap',
      'gops3-records': 'gops-records',
      'gops3-custom-theme': 'gops-custom-theme',
      'gops3-mastery': 'gops-mastery',
    };
    for (const [oldK, newK] of Object.entries(renames)) {
      const v = localStorage.getItem(oldK);
      if (v != null && localStorage.getItem(newK) == null) {
        localStorage.setItem(newK, v);
      }
      localStorage.removeItem(oldK);
    }
    // H2H prefix: gops3-h2h-X → gops-h2h-X
    const toMove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('gops3-h2h-')) toMove.push(k);
    }
    for (const oldK of toMove) {
      const newK = 'gops-h2h-' + oldK.slice('gops3-h2h-'.length);
      const v = localStorage.getItem(oldK);
      if (v != null && localStorage.getItem(newK) == null) localStorage.setItem(newK, v);
      localStorage.removeItem(oldK);
    }
    localStorage.setItem(MIGRATION_FLAG, '1');
  } catch { /* ignore */ }
}

// ---- Bulk export/import ----
export function exportAll() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('gops-')) out[k] = localStorage.getItem(k);
  }
  return out;
}
export function importAll(obj) {
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (k.startsWith('gops-')) localStorage.setItem(k, v);
  });
}
export function wipeAll() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('gops-')) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
}
