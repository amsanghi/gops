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

// Render the user's stats as a shareable PNG (no html2canvas — direct canvas drawing).
export async function shareStatsImage() {
  const { getStats, getDailyState, getAchievements, getRecords, getTournament, getSolvedPuzzles, getMastery } = await import('./storage.js');
  const { PUZZLES, TOURNAMENT_AIS } = await import('./constants.js');
  const s = getStats();
  const ach = getAchievements();
  const tour = getTournament();
  const puz = getSolvedPuzzles();
  const records = getRecords();
  const dailyState = getDailyState();
  const mastery = getMastery();

  const w = 1080, h = 1350;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const root = getComputedStyle(document.documentElement);
  const bg = root.getPropertyValue('--bg').trim() || '#0E3128';
  const ink = root.getPropertyValue('--ink').trim() || '#F4EEE2';
  const dim = root.getPropertyValue('--ink-dim').trim() || '#A9B1A8';
  const me = root.getPropertyValue('--me').trim() || '#F4EEE2';
  const gold = root.getPropertyValue('--gold').trim() || '#C79A3C';

  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

  // Header
  ctx.fillStyle = ink;
  ctx.font = '500 56px "Bodoni Moda", Didot, Georgia, serif';
  ctx.fillText('GOPS — stats', 60, 110);
  ctx.font = '500 18px Jost, sans-serif';
  ctx.fillStyle = dim;
  ctx.fillText((S.myAvatar || '😎') + ' ' + (S.myName || 'You'), 60, 144);

  // 4-card stat block
  const stats = [
    { label: 'Games', value: s.gamesPlayed },
    { label: 'Win rate', value: s.gamesPlayed ? Math.round(100 * s.gamesWon / s.gamesPlayed) + '%' : '0%' },
    { label: 'High score', value: s.highScore },
    { label: 'Rounds', value: s.rounds || 0 },
  ];
  const cellW = (w - 120 - 30) / 4;
  stats.forEach((stat, i) => {
    const x = 60 + i * (cellW + 10);
    const y = 200;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(x, y, cellW, 140);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.strokeRect(x, y, cellW, 140);
    ctx.fillStyle = me;
    ctx.font = '500 56px "Bodoni Moda", Didot, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(stat.value), x + cellW / 2, y + 78);
    ctx.fillStyle = dim;
    ctx.font = '500 14px Jost, sans-serif';
    ctx.fillText(stat.label.toUpperCase(), x + cellW / 2, y + 110);
  });
  ctx.textAlign = 'left';

  // Section: modes
  ctx.fillStyle = dim;
  ctx.font = '500 12px Jost, sans-serif';
  ctx.fillText('MODES', 60, 420);
  const modeLines = [
    `Daily — ${dailyState.totalCompleted || 0} done · streak ${dailyState.streak || 0}`,
    `Puzzles — ${puz.length}/${PUZZLES.length} solved`,
    `Tournament — Level ${tour.level}/${TOURNAMENT_AIS.length}`,
    `Achievements — ${ach.length} unlocked`,
  ];
  ctx.fillStyle = ink;
  ctx.font = '400 22px Jost, sans-serif';
  modeLines.forEach((line, i) => ctx.fillText(line, 60, 460 + i * 36));

  // Section: per-mode records
  ctx.fillStyle = dim;
  ctx.font = '500 12px Jost, sans-serif';
  ctx.fillText('PER-MODE RECORDS', 60, 650);
  ctx.fillStyle = ink;
  ctx.font = '400 20px Jost, sans-serif';
  const recs = Object.entries(records).filter(([, r]) => (r.score || 0) > 0).sort((a, b) => b[1].score - a[1].score).slice(0, 6);
  recs.forEach(([mode, r], i) => {
    ctx.fillText(`${mode} — ${r.wins || 0} wins · best ${r.score}`, 60, 690 + i * 32);
  });

  // Mastery
  const masteryEntries = Object.entries(mastery).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (masteryEntries.length) {
    ctx.fillStyle = dim;
    ctx.font = '500 12px Jost, sans-serif';
    ctx.fillText('AI MASTERY', 60, 920);
    ctx.fillStyle = gold;
    ctx.font = '400 20px Jost, sans-serif';
    masteryEntries.forEach(([name, wins], i) => {
      ctx.fillText(`★ ${name} — ${wins} wins`, 60, 960 + i * 32);
    });
  }

  // Footer
  ctx.fillStyle = dim;
  ctx.font = '400 18px Jost, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('amsanghi.github.io/gops', w - 60, h - 60);

  return new Promise(resolve => {
    c.toBlob(blob => {
      if (!blob) return resolve(false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `gops-stats-${todayKey()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      resolve(true);
    });
  });
}

// Record a video of the replay scrubber playing through all rounds.
// Uses canvas-frame recording + MediaRecorder → WebM blob.
export async function recordReplayVideo(history, deckSize = 13, opts = {}) {
  if (!history || !history.length) return false;
  const w = 720, h = 720;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const root = getComputedStyle(document.documentElement);
  const bg = root.getPropertyValue('--bg').trim() || '#0E3128';
  const ink = root.getPropertyValue('--ink').trim() || '#F4EEE2';
  const dim = root.getPropertyValue('--ink-dim').trim() || '#A9B1A8';
  const me = root.getPropertyValue('--me').trim() || '#F4EEE2';
  const opp = root.getPropertyValue('--opp').trim() || '#D2665A';
  const gold = root.getPropertyValue('--gold').trim() || '#C79A3C';

  // Frame renderer
  function drawFrame(idx) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    const m = history[idx];
    // Header
    ctx.fillStyle = dim; ctx.font = '500 16px Jost, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`GOPS REPLAY — Round ${m.round} / ${history.length}`, w / 2, 50);
    // Cards
    const cy = 200, cardW = 110, cardH = 160, gap = 60;
    function drawCard(x, y, label, color, sub) {
      ctx.fillStyle = color;
      ctx.beginPath();
      const r = 12;
      ctx.moveTo(x + r, y); ctx.lineTo(x + cardW - r, y); ctx.quadraticCurveTo(x + cardW, y, x + cardW, y + r);
      ctx.lineTo(x + cardW, y + cardH - r); ctx.quadraticCurveTo(x + cardW, y + cardH, x + cardW - r, y + cardH);
      ctx.lineTo(x + r, y + cardH); ctx.quadraticCurveTo(x, y + cardH, x, y + cardH - r);
      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.fill();
      ctx.fillStyle = (color === bg) ? ink : '#0B1E18';
      ctx.font = '500 60px "Bodoni Moda", Didot, Georgia, serif';
      ctx.fillText(label, x + cardW / 2, y + cardH / 2 + 5);
      if (sub) {
        ctx.font = '400 12px Jost, sans-serif';
        ctx.fillText(sub, x + cardW / 2, y + cardH / 2 + 35);
      }
    }
    const rank = (n) => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[n] || String(n);
    // Them | Prize | Me
    const cx = w / 2;
    drawCard(cx - cardW / 2, cy, rank(m.prize), gold, 'PRIZE');
    drawCard(cx - cardW * 1.5 - gap, cy, rank(m.theirs), opp, 'THEM');
    drawCard(cx + cardW / 2 + gap, cy, rank(m.mine), me, 'YOU');
    // Outcome
    ctx.fillStyle = m.winner === 'me' ? '#E7C878' : m.winner === 'them' ? '#D2665A' : gold;
    ctx.font = '400 48px "Bodoni Moda", Didot, Georgia, serif';
    const verb = m.winner === 'me' ? `+${m.prizeValue} to you` : m.winner === 'them' ? `+${m.prizeValue} to opponent` : `Tie · ${m.prizeValue} carries`;
    ctx.fillText(verb, w / 2, cy + cardH + 80);
    // Footer
    ctx.fillStyle = dim;
    ctx.font = '400 14px Jost, sans-serif';
    ctx.fillText('amsanghi.github.io/gops', w / 2, h - 30);
  }

  // Capture
  if (!('MediaRecorder' in window) || !canvas.captureStream) {
    // Fallback: animated PNG-like by stitching frames is complex. Just download a multi-frame Canvas-based loop as webm if possible, else error.
    return false;
  }
  const stream = canvas.captureStream(8); // 8 fps is fine for a slideshow
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_500_000 });
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

  return new Promise(resolve => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `gops-replay-${todayKey()}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      resolve(true);
    };
    recorder.start();
    let i = 0;
    drawFrame(0);
    const interval = setInterval(() => {
      i++;
      if (i >= history.length) {
        clearInterval(interval);
        setTimeout(() => recorder.stop(), 800);
      } else {
        drawFrame(i);
      }
    }, 900);
  });
}

// Compact, tweet-friendly: under 240 chars.
export async function copyCompactShare() {
  const cmp = (S.settings.winCondition === 'fewest') ? S.theirScore - S.myScore : S.myScore - S.theirScore;
  const outcome = cmp > 0 ? '✓ W' : cmp < 0 ? '✗ L' : '~';
  const grid = buildResultGrid();
  const text = `GOPS ${outcome} ${S.myScore}-${S.theirScore}\n${grid}\namsanghi.github.io/gops/`;
  if (await copyToClipboard(text)) {
    const btn = $('share-text-btn');
    if (btn) { const old = btn.textContent; btn.textContent = '✓ Copied'; setTimeout(() => btn.textContent = old, 1500); }
  }
}

export async function copyDailyResult() {
  const date = todayKey();
  const grid = buildResultGrid();
  const text = `GOPS Daily ${date}\nScore: ${S.myScore}–${S.theirScore}\n${grid}\nhttps://amsanghi.github.io/gops/`;
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
  const text = `GOPS ${tag} · ${date} · ${outcome}\n${S.myName} ${S.myScore} — ${S.theirScore} ${S.theirName}\n${grid}\nhttps://amsanghi.github.io/gops/`;
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
  const bg = root.getPropertyValue('--bg').trim() || '#0E3128';
  const ink = root.getPropertyValue('--ink').trim() || '#F4EEE2';
  const dim = root.getPropertyValue('--ink-dim').trim() || '#A9B1A8';
  const me = root.getPropertyValue('--me').trim() || '#F4EEE2';
  const opp = root.getPropertyValue('--opp').trim() || '#D2665A';
  const gold = root.getPropertyValue('--gold').trim() || '#C79A3C';

  // Background
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  // Glow
  const g = ctx.createRadialGradient(w * 0.8, 0, 10, w * 0.8, 0, w);
  g.addColorStop(0, hexA(me, 0.25));
  g.addColorStop(1, hexA(me, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  // Header
  ctx.font = '500 64px "Bodoni Moda", Didot, Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = ink;
  ctx.fillText('GOPS', 60, 110);
  ctx.font = '500 18px Jost, sans-serif';
  ctx.fillStyle = dim;
  ctx.fillText('GAME OF PURE STRATEGY', 60, 142);

  // Result
  const cmp = compareScores(S.myScore, S.theirScore);
  const result = cmp > 0 ? 'You won' : cmp < 0 ? `${S.theirName} won` : 'Tied';
  ctx.font = '400 120px "Bodoni Moda", Didot, Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = cmp > 0 ? '#E7C878' : cmp < 0 ? '#D2665A' : gold;
  ctx.fillText(result, 60, 320);

  // Score
  ctx.font = '500 88px "Bodoni Moda", Didot, Georgia, serif';
  ctx.fillStyle = me;
  ctx.fillText(String(S.myScore), 60, 430);
  ctx.fillStyle = dim;
  ctx.font = '400 56px "Bodoni Moda", Didot, Georgia, serif';
  ctx.fillText('—', 200, 425);
  ctx.fillStyle = opp;
  ctx.font = '500 88px "Bodoni Moda", Didot, Georgia, serif';
  ctx.fillText(String(S.theirScore), 270, 430);

  // Names
  ctx.font = '500 22px Jost, sans-serif';
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
  ctx.font = '400 20px Jost, sans-serif';
  ctx.fillStyle = dim;
  ctx.textAlign = 'right';
  ctx.fillText('amsanghi.github.io/gops', w - 60, h - 80);

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
