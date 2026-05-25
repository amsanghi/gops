// Sharing: image export, text/result copy, challenge link, CSV export.

import { S } from './state.js';
import { $, copyToClipboard, todayKey } from './util.js';
import { rankText } from './constants.js';
import { compareScores } from './game.js';
import { exportAll, importAll } from './storage.js';

// Compose a Wordle-style result grid.
function buildResultGrid() {
  return S.history.map(h => h.winner === 'me' ? '🟩' : h.winner === 'them' ? '🟥' : '🟨').join('');
}

// Compact, tweet-friendly: under 240 chars.
export async function copyCompactShare() {
  const cmp = (S.settings.winCondition === 'fewest') ? S.theirScore - S.myScore : S.myScore - S.theirScore;
  const outcome = cmp > 0 ? '✓ W' : cmp < 0 ? '✗ L' : '~';
  const grid = buildResultGrid();
  const text = `GOPS ${outcome} ${S.myScore}-${S.theirScore}\n${grid}\namsanghi.github.io/gops/3.0/`;
  if (await copyToClipboard(text)) {
    const btn = $('share-text-btn');
    if (btn) { const old = btn.textContent; btn.textContent = '✓ Copied'; setTimeout(() => btn.textContent = old, 1500); }
  }
}

export async function copyDailyResult() {
  const date = todayKey();
  const grid = buildResultGrid();
  const text = `GOPS Daily ${date}\nScore: ${S.myScore}–${S.theirScore}\n${grid}\nhttps://amsanghi.github.io/gops/3.0/`;
  if (await copyToClipboard(text)) {
    const btn = $('share-text-btn');
    if (btn) { const old = btn.textContent; btn.textContent = '✓ Copied'; setTimeout(() => btn.textContent = old, 1500); }
  }
}

export async function copyAnyResult() {
  const date = todayKey();
  const grid = buildResultGrid();
  const cmp = compareScores(S.myScore, S.theirScore);
  const outcome = cmp > 0 ? 'Win' : cmp < 0 ? 'Loss' : 'Tie';
  const tag = S.currentMode ? S.currentMode[0].toUpperCase() + S.currentMode.slice(1) : '';
  const text = `GOPS ${tag} · ${date} · ${outcome}\n${S.myName} ${S.myScore} — ${S.theirScore} ${S.theirName}\n${grid}\nhttps://amsanghi.github.io/gops/3.0/`;
  if (await copyToClipboard(text)) {
    const btn = $('share-text-btn');
    if (btn) { const old = btn.textContent; btn.textContent = '✓ Copied'; setTimeout(() => btn.textContent = old, 1500); }
  }
}

export function shareImage() {
  const w = 1080, h = 1350; // 4:5 social ratio
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const root = getComputedStyle(document.documentElement);
  const bg = root.getPropertyValue('--bg').trim() || '#0a0a0b';
  const ink = root.getPropertyValue('--ink').trim() || '#f4f4f5';
  const dim = root.getPropertyValue('--ink-dim').trim() || '#9a9aa3';
  const me = root.getPropertyValue('--me').trim() || '#f4f4f5';
  const opp = root.getPropertyValue('--opp').trim() || '#a1a1aa';
  const gold = root.getPropertyValue('--gold').trim() || '#f5d062';

  // Background
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  // Glow
  const g = ctx.createRadialGradient(w * 0.8, 0, 10, w * 0.8, 0, w);
  g.addColorStop(0, hexA(me, 0.25));
  g.addColorStop(1, hexA(me, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  // Header
  ctx.font = '500 64px Fraunces, Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = ink;
  ctx.fillText('GOPS', 60, 110);
  ctx.font = '500 18px Inter, sans-serif';
  ctx.fillStyle = dim;
  ctx.fillText('GAME OF PURE STRATEGY', 60, 142);

  // Result
  const cmp = compareScores(S.myScore, S.theirScore);
  const result = cmp > 0 ? 'You won' : cmp < 0 ? `${S.theirName} won` : 'Tied';
  ctx.font = '400 120px Fraunces, Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = cmp > 0 ? '#4ade80' : cmp < 0 ? '#f87171' : gold;
  ctx.fillText(result, 60, 320);

  // Score
  ctx.font = '500 88px Fraunces, Georgia, serif';
  ctx.fillStyle = me;
  ctx.fillText(String(S.myScore), 60, 430);
  ctx.fillStyle = dim;
  ctx.font = '400 56px Fraunces, Georgia, serif';
  ctx.fillText('—', 200, 425);
  ctx.fillStyle = opp;
  ctx.font = '500 88px Fraunces, Georgia, serif';
  ctx.fillText(String(S.theirScore), 270, 430);

  // Names
  ctx.font = '500 22px Inter, sans-serif';
  ctx.fillStyle = me;
  ctx.fillText(`${S.myAvatar}  ${S.myName}`, 60, 475);
  ctx.fillStyle = opp;
  ctx.fillText(`${S.theirAvatar}  ${S.theirName}`, 60, 510);

  // Grid
  ctx.font = '64px sans-serif';
  const grid = buildResultGrid();
  const cols = 7;
  const cell = 90;
  const xstart = 60;
  let cx = xstart, cy = 640;
  for (let i = 0; i < grid.length; i += 2) {
    const ch = grid[i] + (grid[i + 1] || '');
    ctx.fillText(ch, cx, cy);
    cx += cell;
    if ((i / 2 + 1) % cols === 0) { cx = xstart; cy += cell; }
  }

  // Footer
  ctx.font = '400 20px Inter, sans-serif';
  ctx.fillStyle = dim;
  ctx.textAlign = 'right';
  ctx.fillText('amsanghi.github.io/gops/3.0', w - 60, h - 80);

  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `gops-${todayKey()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  });
}

function hexA(hex, alpha) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;
}

// Challenge link (host settings → URL)
export function copyChallengeLink() {
  const params = new URLSearchParams();
  params.set('deck', $('host-deck').value);
  params.set('bestOf', $('host-bestof').value);
  params.set('dir', $('host-dir').value);
  params.set('goal', $('host-goal').value);
  params.set('tie', $('host-tie').value);
  params.set('time', $('host-time').value);
  const stakes = $('host-stakes').value.trim();
  if (stakes) params.set('stakes', stakes);
  const code = ($('host-code').value || '').toUpperCase();
  if (code) params.set('code', code);
  const url = location.origin + location.pathname + '#challenge=' + params.toString();
  copyToClipboard(url).then(ok => {
    const btn = $('copy-challenge-btn');
    if (ok && btn) { btn.textContent = '✓ Link copied'; setTimeout(() => btn.textContent = 'Copy challenge link', 1500); }
  });
}

export function parseChallengeLink() {
  const hash = location.hash;
  if (!hash.startsWith('#challenge=')) return false;
  const params = new URLSearchParams(hash.slice('#challenge='.length));
  const set = (id, key) => { const v = params.get(key); if (v != null) $(id).value = v; };
  set('host-deck', 'deck'); set('host-bestof', 'bestOf');
  set('host-dir', 'dir'); set('host-goal', 'goal');
  set('host-tie', 'tie'); set('host-time', 'time');
  set('host-stakes', 'stakes'); set('host-code', 'code');
  history.replaceState(null, '', location.pathname);
  return true;
}

// Export full local data
export function exportData() {
  const data = exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `gops-backup-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function importData(file, onDone) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      importAll(data);
      onDone?.(true);
    } catch (err) {
      onDone?.(false, err.message);
    }
  };
  reader.readAsText(file);
}

// Replay URL: encode prizes + bids into a compact URL hash, so others can
// open the replay scrubber against this exact game.
// Format: #replay=<deckSize>:<prizes>:<myBids>:<theirBids>:<dir><goal><tie>:<myName>:<theirName>
// Bid arrays are joined as hex chars '1'..'D' for 1-13.
const HEX = '0123456789ABCDEF';
function encArr(arr) { return arr.map(n => HEX[n]).join(''); }
function decArr(s) { return [...s].map(c => HEX.indexOf(c)).filter(n => n >= 0); }

export function buildReplayURL(state) {
  const deck = state.settings.deckSize;
  const prizes = encArr(state.prizes.slice(0, deck));
  const mine = encArr(state.history.map(h => h.mine));
  const theirs = encArr(state.history.map(h => h.theirs));
  const rule = (state.settings.direction === 'low' ? 'L' : 'H')
             + (state.settings.winCondition === 'fewest' ? 'F' : 'M')
             + (state.settings.tieRule === 'burn' ? 'B' : 'C');
  const me = encodeURIComponent((state.myName || 'You').slice(0, 14));
  const them = encodeURIComponent((state.theirName || 'Them').slice(0, 14));
  const payload = [deck, prizes, mine, theirs, rule, me, them].join('~');
  return location.origin + location.pathname + '#replay=' + payload;
}

export async function copyReplayURL(state) {
  const url = buildReplayURL(state);
  if (await copyToClipboard(url)) {
    const btn = $('share-replay-btn');
    if (btn) { const old = btn.textContent; btn.textContent = '✓ Replay copied'; setTimeout(() => btn.textContent = old, 1500); }
  }
}

// Returns parsed replay or null. Side-effect: clears the hash from URL.
export function parseReplayLink() {
  const h = location.hash;
  if (!h.startsWith('#replay=')) return null;
  try {
    const payload = h.slice('#replay='.length);
    const [deckStr, prizes, mine, theirs, rule, me, them] = payload.split('~');
    const deck = parseInt(deckStr, 10);
    if (!deck || deck < 3 || deck > 21) return null;
    history.replaceState(null, '', location.pathname);
    return {
      deckSize: deck,
      prizes: decArr(prizes),
      myBids: decArr(mine),
      theirBids: decArr(theirs),
      direction: rule[0] === 'L' ? 'low' : 'high',
      winCondition: rule[1] === 'F' ? 'fewest' : 'most',
      tieRule: rule[2] === 'B' ? 'burn' : 'carry',
      myName: decodeURIComponent(me || 'You'),
      theirName: decodeURIComponent(them || 'Them'),
    };
  } catch { return null; }
}

// CSV export — round-by-round results from the current game's history.
export function exportHistoryCSV() {
  if (!S.history.length) return;
  const sz = S.settings.deckSize;
  const rows = [
    ['round', 'prize', S.myName, S.theirName, 'winner', 'prize_value', 'my_score_after', 'their_score_after'],
  ];
  let mine = 0, theirs = 0;
  S.history.forEach(h => {
    if (h.winner === 'me') mine += h.prizeValue;
    else if (h.winner === 'them') theirs += h.prizeValue;
    rows.push([
      h.round,
      rankText(h.prize, sz),
      rankText(h.mine, sz),
      rankText(h.theirs, sz),
      h.winner,
      h.prizeValue,
      mine,
      theirs,
    ]);
  });
  const csv = rows.map(r => r.map(cell => {
    const s = String(cell);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `gops-history-${todayKey()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
