// UI pieces: lobby presentation, modals, theme picker, chat, reactions, end screen, hot-seat dialog.

import { S, on } from './state.js';
import { $, $$, show, hide, escapeHtml, confirmDialog, debounce, copyToClipboard } from './util.js';
import {
  AVATARS, CARD_BACKS, REACTIONS, THEMES, ACHIEVEMENTS, PUZZLES, TOURNAMENT_AIS,
} from './constants.js';
import {
  getAchievements, getStats, getDailyState, getSolvedPuzzles, getTournament, getPrefs, savePrefs, totalH2H,
  getHeatmap, getRecords, getCustomTheme, saveCustomTheme, getMastery,
} from './storage.js';
import { drawHeatmap, drawScoreCurve } from './charts.js';
import { analyze as coachAnalyze } from './coach.js';
import { sfx, floatReaction, haptic } from './effects.js';
import { renderHistory, buildReplay, renderReplayStep } from './render.js';
import { compareScores } from './game.js';
import { startPuzzle, startTournamentMatch } from './modes.js';
import { checkThemeAch } from './achievements.js';

const debouncedSavePrefs = debounce(savePrefs, 250);

// ---- Theme & dark/light ----
export function setTheme(name) {
  S.theme = name;
  document.documentElement.setAttribute('data-theme', name);
  S.themesTried.add(name);
  savePrefs({ theme: name, themesTried: Array.from(S.themesTried) });
  $$('.swatch').forEach(el => el.setAttribute('aria-pressed', el.dataset.theme === name ? 'true' : 'false'));
  checkThemeAch();
}

// Light/dark mode toggle was removed — GOPS is dark-only.
// Kept as a no-op so any lingering callers don't break.
export function setMode() { /* noop */ }

export function buildThemePicker() {
  // Rendered in the top bar and again in Settings — the top-bar row is hidden on
  // narrow screens, so Settings is the only way in on a phone.
  ['theme-row', 'theme-row-settings'].forEach(id => {
    const row = $(id);
    if (!row) return;
    row.innerHTML = '';
    THEMES.forEach(t => {
      const sw = document.createElement('button');
      sw.className = 'swatch';
      sw.type = 'button';
      sw.dataset.theme = t.name;
      sw.style.setProperty('--swatch', t.color);
      sw.title = t.name;
      sw.setAttribute('aria-label', `${t.name} table`);
      sw.setAttribute('aria-pressed', S.theme === t.name ? 'true' : 'false');
      sw.onclick = () => setTheme(t.name);
      row.appendChild(sw);
    });
  });
}

// ---- Avatar popover ----
let avatarPopoverEl = null;
export function setupAvatarPicker() {
  const btn = $('avatar-btn');
  btn.textContent = S.myAvatar;
  btn.onclick = (e) => {
    e.stopPropagation();
    if (avatarPopoverEl) { closeAvatarPopover(); return; }
    avatarPopoverEl = document.createElement('div');
    avatarPopoverEl.className = 'popover';
    const grid = document.createElement('div');
    grid.className = 'avatar-grid';
    AVATARS.forEach(a => {
      const b = document.createElement('button');
      b.textContent = a;
      b.setAttribute('aria-pressed', a === S.myAvatar ? 'true' : 'false');
      b.setAttribute('aria-label', `Avatar ${a}`);
      b.onclick = () => {
        S.myAvatar = a;
        $('avatar-btn').textContent = a;
        savePrefs({ avatar: a });
        closeAvatarPopover();
      };
      grid.appendChild(b);
    });
    avatarPopoverEl.appendChild(grid);
    const r = btn.getBoundingClientRect();
    avatarPopoverEl.style.position = 'fixed';
    avatarPopoverEl.style.top = (r.bottom + 6) + 'px';
    avatarPopoverEl.style.left = r.left + 'px';
    document.body.appendChild(avatarPopoverEl);
    btn.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', onDocClick, { once: true }), 0);
  };
}
function onDocClick(e) {
  if (avatarPopoverEl && !avatarPopoverEl.contains(e.target)) closeAvatarPopover();
}
function closeAvatarPopover() {
  avatarPopoverEl?.remove();
  avatarPopoverEl = null;
  $('avatar-btn').setAttribute('aria-expanded', 'false');
}

// ---- Card-back picker (in settings modal) ----
export function buildCardBackPicker() {
  const wrap = $('cardback-picker');
  if (!wrap) return;
  wrap.innerHTML = '';
  CARD_BACKS.forEach(cb => {
    const col = document.createElement('div');
    col.style.textAlign = 'center';
    col.style.cursor = 'pointer';
    const card = document.createElement('div');
    card.className = `card face-down pattern-${cb.id}`;
    card.style.setProperty('--w', '48px');
    card.style.setProperty('--h', '68px');
    if (cb.id === S.cardBack) {
      card.style.boxShadow = '0 0 0 2px var(--brass-lit), 0 6px 16px rgba(0,0,0,0.45)';
    }
    const lbl = document.createElement('div');
    lbl.style.fontSize = '9.5px';
    lbl.style.letterSpacing = '0.18em';
    lbl.style.textTransform = 'uppercase';
    lbl.style.color = cb.id === S.cardBack ? 'var(--brass-lit)' : 'var(--ink-faint)';
    lbl.style.marginTop = '8px';
    lbl.textContent = cb.label;
    col.append(card, lbl);
    col.onclick = () => { S.cardBack = cb.id; savePrefs({ cardBack: cb.id }); buildCardBackPicker(); };
    wrap.appendChild(col);
  });
}

// ---- Head-to-head label ----
export function updateH2H() {
  const name = $('name-input').value.trim();
  const wrap = $('h2h');
  const div = $('h2h-divider');
  if (!name) { wrap.textContent = ''; div.hidden = true; return; }
  const { mine, theirs, ties } = totalH2H();
  if (mine + theirs + ties > 0) {
    wrap.innerHTML = `<b>${mine}</b>W · <b>${theirs}</b>L${ties ? ' · ' + ties + 'T' : ''}`;
    div.hidden = false;
  } else { wrap.textContent = ''; div.hidden = true; }
}

// ---- Mode subtitles (lobby) ----
export function refreshLobbySubtitles() {
  const daily = getDailyState();
  const done = daily.history[new Date().toISOString().slice(0,10)];
  $('daily-sub').textContent = done ? `Played ${done.myScore}–${done.theirScore}` : (daily.streak ? `Today · ${daily.streak} in a row` : 'A fresh shuffle');

  const t = getTournament();
  $('tournament-sub').textContent = t.level >= TOURNAMENT_AIS.length
    ? 'Champion'
    : `Next: ${TOURNAMENT_AIS[t.level].name}`;
  S.tournamentLevel = t.level;

  const p = getSolvedPuzzles();
  $('puzzle-sub').textContent = `${p.length} of ${PUZZLES.length} solved`;

  $('endless-sub').textContent = 'Last as long as you can';
}

// ---- Reactions ----
export function buildReactionsBar(sendMsg) {
  const bar = $('reactions');
  bar.innerHTML = '';
  if (S.vsAI || S.currentMode === 'hotseat') { bar.hidden = true; return; }
  bar.hidden = false;
  REACTIONS.forEach(e => {
    const b = document.createElement('button');
    b.className = 'react-btn';
    b.textContent = e;
    b.setAttribute('aria-label', `React with ${e}`);
    b.onclick = () => {
      sendMsg({ type: 'reaction', emoji: e });
      floatReaction(e, false);
      sfx.reaction(); haptic([15]);
    };
    bar.appendChild(b);
  });
}

// ---- Chat ----
export function toggleChat() {
  const panel = $('chat');
  if (panel.hidden) {
    panel.hidden = false;
    $('chat-btn').removeAttribute('data-badge');
    setTimeout(() => $('chat-input').focus(), 50);
  } else panel.hidden = true;
}
export function renderChatMsgs() {
  const msgs = $('chat-msgs');
  msgs.innerHTML = '';
  S.chatMsgs.slice(-50).forEach(m => {
    const d = document.createElement('div');
    d.className = 'chat-msg ' + m.from;
    const name = m.from === 'me' ? S.myName : S.theirName;
    d.innerHTML = `<span class="from">${escapeHtml(name)}:</span>${escapeHtml(m.text)}`;
    msgs.appendChild(d);
  });
  msgs.scrollTop = msgs.scrollHeight;
}
export function sendChat(sendMsg) {
  const inp = $('chat-input');
  const text = inp.value.trim();
  if (!text) return;
  S.chatMsgs.push({ from: 'me', text, t: Date.now() });
  renderChatMsgs();
  sendMsg({ type: 'chat', text });
  inp.value = '';
}
on('game-attached', () => {
  // Show chat + voice/video controls only in real multiplayer (duel or party).
  const isMulti = S.currentMode === 'multi' || S.currentMode === 'multi-n';
  ['chat-btn', 'game-mic-btn', 'game-cam-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isMulti) el.removeAttribute('hidden'); else el.setAttribute('hidden', '');
  });
  renderChatMsgs();
});

// ---- End screen ----
export function renderEnd({ didIWin, seriesOver, cmp }) {
  document.body.classList.remove('in-game', 'bullet');
  let resultEl = 'Dead even', cls = 'tie';
  if (cmp > 0) { resultEl = 'You won'; cls = 'win'; }
  else if (cmp < 0) { resultEl = `${escapeHtml(S.theirName)} won`; cls = 'lose'; }
  const er = $('end-result');
  er.innerHTML = resultEl;
  er.className = 'end-result ' + cls;
  $('end-score').textContent = `${S.myScore} – ${S.theirScore}`;

  // Series indicator
  const series = $('end-series');
  if (S.settings.bestOf > 1) {
    series.hidden = false;
    series.innerHTML = `Best of ${S.settings.bestOf}: <b>${S.myGames}–${S.theirGames}</b>`;
  } else series.hidden = true;

  // Stakes
  if (S.settings.stakes && cmp !== 0 && (S.settings.bestOf === 1 || seriesOver)) {
    $('end-stakes').hidden = false;
    const loser = cmp < 0 ? S.myName : S.theirName;
    $('end-stakes-text').innerHTML = `<b>${escapeHtml(loser)}</b>: ${escapeHtml(S.settings.stakes)}`;
  } else $('end-stakes').hidden = true;

  // Daily grid (only on daily mode)
  $('daily-grid').hidden = (S.currentMode !== 'daily');
  if (S.currentMode === 'daily') {
    const lines = [];
    let line = '';
    S.history.forEach((h, i) => {
      line += h.winner === 'me' ? '🟩' : h.winner === 'them' ? '🟥' : '🟨';
      if ((i + 1) % 5 === 0) { lines.push(line); line = ''; }
    });
    if (line) lines.push(line);
    $('daily-grid').innerHTML = lines.join('<br>');
  }

  // Analysis
  renderAnalysis(didIWin);
  // Replay
  buildReplay();
  $('replay-track').oninput = (e) => renderReplayStep(parseInt(e.target.value, 10));

  // Score curve
  if (S.history.length >= 3) {
    $('score-curve-wrap').hidden = false;
    requestAnimationFrame(() => drawScoreCurve($('score-curve'), S.history, S.theirName, S.myName));
  } else $('score-curve-wrap').hidden = true;

  // Coach insights (vsAI only, sufficient history, and coach setting on)
  const coachOn = (getPrefs().coachMode !== false);
  if (S.vsAI && S.history.length >= 5 && coachOn) {
    const insights = coachAnalyze(S.history, S.settings.deckSize);
    const list = $('coach-list'); list.innerHTML = '';
    if (insights.length === 0) {
      list.innerHTML = '<div class="coach-item"><div class="coach-why">Nothing to flag. That was clean bidding.</div></div>';
    } else {
      insights.forEach(i => {
        const div = document.createElement('div');
        div.className = 'coach-item ' + i.kind;
        div.innerHTML = `<div class="coach-round">Round ${i.round}</div><div class="coach-kind">${i.kind}</div><div class="coach-why">${escapeHtml(i.why)}</div>`;
        list.appendChild(div);
      });
    }
    $('coach').hidden = false;
  } else $('coach').hidden = true;

  // Rematch button label
  const rb = $('rematch-btn');
  rb.disabled = false;
  if (S.currentMode === 'tournament') rb.textContent = 'Next opponent';
  else if (S.currentMode === 'endless') rb.textContent = 'Next round';
  else if (S.currentMode === 'puzzle') rb.textContent = 'Back to puzzles';
  else if (seriesOver) rb.textContent = 'New game';
  else rb.textContent = 'Next game';
}

function renderAnalysis(didIWin) {
  const grid = $('analysis');
  grid.innerHTML = '';
  if (!S.history.length) return;
  const myWins = S.history.filter(h => h.winner === 'me').length;
  const ties = S.history.filter(h => h.winner === 'tie').length;
  const avgBid = (S.history.reduce((a, h) => a + h.mine, 0) / S.history.length).toFixed(1);
  const wonPrizes = S.history.filter(h => h.winner === 'me').reduce((a, h) => a + h.prizeValue, 0);
  // Best/worst rounds
  let best = S.history[0], worst = S.history[0];
  const delta = h => h.winner === 'me' ? h.prizeValue : h.winner === 'them' ? -h.prizeValue : 0;
  S.history.forEach(h => { if (delta(h) > delta(best)) best = h; if (delta(h) < delta(worst)) worst = h; });
  const items = [
    { label: 'Rounds won', value: `${myWins}/${S.history.length}` },
    { label: 'Avg bid', value: avgBid },
    { label: 'Prize value', value: wonPrizes },
    { label: 'Ties', value: ties },
    { label: 'Best round', value: `R${best.round}: ${ranks(best)}` },
    { label: 'Worst round', value: `R${worst.round}: ${ranks(worst)}` },
  ];
  items.forEach(it => {
    const el = document.createElement('div');
    el.className = 'analysis-item';
    el.innerHTML = `<div class="analysis-label">${escapeHtml(it.label)}</div><div class="analysis-value">${escapeHtml(String(it.value))}</div>`;
    grid.appendChild(el);
  });
}
function ranks(h) {
  const r = (n) => ({1:'A', 11:'J', 12:'Q', 13:'K'})[n] || String(n);
  return `${r(h.mine)} vs ${r(h.theirs)} = ${h.winner === 'me' ? '+' : h.winner === 'them' ? '−' : '·'}${h.prizeValue}`;
}

// ---- Modals ----
export function openModal(id) {
  const el = $(id); if (!el) return;
  show(el);
  // Focus trap basics: focus first interactive
  setTimeout(() => {
    const first = el.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    first?.focus();
  }, 50);
}
export function closeModal(id) { hide(id); }

export function setupModals() {
  // [data-close] buttons (X-style modal-close AND any other button with data-close)
  $$('[data-close]').forEach(btn => {
    btn.onclick = () => hide(btn.dataset.close || btn.closest('.scrim')?.id);
  });
  // Scrim click closes the modal
  $$('.scrim').forEach(scrim => {
    if (scrim.id === 'modal-confirm') return; // confirm dialog handles its own
    scrim.addEventListener('click', e => { if (e.target === scrim) hide(scrim); });
  });
  // Escape closes any open modal
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = $$('.scrim').find(s => !s.hidden && s.id !== 'modal-confirm');
    if (open) hide(open);
  });
}

// ---- Achievements modal ----
export function openAchievementsModal() {
  const unlocked = getAchievements();
  $('ach-progress').textContent = `${unlocked.length} of ${ACHIEVEMENTS.length} unlocked`;
  const grid = $('ach-grid'); grid.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const ok = unlocked.includes(a.id);
    const div = document.createElement('div');
    div.className = 'ach ' + (ok ? 'unlocked' : 'locked');
    div.innerHTML = `<div class="ach-title"><span class="ach-icon">${a.icon}</span>${escapeHtml(a.title)}</div><div class="ach-desc">${escapeHtml(a.desc)}</div>`;
    grid.appendChild(div);
  });
  openModal('modal-ach');
}

// ---- Stats modal ----
export function openStatsModal() {
  const s = getStats();
  const dailyState = getDailyState();
  const ach = getAchievements();
  const tournament = getTournament();
  const puzzles = getSolvedPuzzles();
  const records = getRecords();
  const winRate = s.gamesPlayed ? Math.round(100 * s.gamesWon / s.gamesPlayed) : 0;
  const avgScore = s.gamesPlayed ? Math.round(s.totalScore / s.gamesPlayed) : 0;

  const modeName = (m) => ({
    solo: 'Vs AI', daily: 'Daily', bullet: 'Bullet', endless: 'Endless',
    tournament: 'Tournament', ghost: 'Ghost', hotseat: 'Hot seat',
    battle: 'AI Battle', puzzle: 'Puzzles', multi: 'Multiplayer',
  })[m] || m;
  const recordRows = Object.entries(records)
    .filter(([_, r]) => (r.score || 0) > 0 || (r.wins || 0) > 0)
    .sort((a, b) => (b[1].score || 0) - (a[1].score || 0))
    .map(([m, r]) => `<div class="bar-row"><div class="bar-name">${escapeHtml(modeName(m))}</div><div class="bar-text" style="margin-left:auto">${r.wins || 0} ${r.wins === 1 ? 'win' : 'wins'} · best ${r.score}</div></div>`)
    .join('');

  $('stats-body').innerHTML = `
    <div class="stats-grid">
      <div class="stat"><div class="stat-value">${s.gamesPlayed}</div><div class="stat-label">Games</div></div>
      <div class="stat"><div class="stat-value">${winRate}%</div><div class="stat-label">Won</div></div>
      <div class="stat"><div class="stat-value">${s.highScore}</div><div class="stat-label">Best score</div></div>
      <div class="stat"><div class="stat-value">${avgScore}</div><div class="stat-label">Average</div></div>
      <div class="stat"><div class="stat-value">${s.rounds || 0}</div><div class="stat-label">Rounds</div></div>
      <div class="stat"><div class="stat-value">${ach.length}</div><div class="stat-label">Badges</div></div>
    </div>
    <div class="stats-section">
      <h3>Alone or against people</h3>
      <div class="bar-row"><div class="bar-name">Solo</div><div class="bar-track"><div class="bar-fill" style="width:${s.soloGames ? (100 * s.soloWon / s.soloGames) : 0}%"></div></div><div class="bar-text">${s.soloWon}/${s.soloGames}</div></div>
      <div class="bar-row"><div class="bar-name">Friends</div><div class="bar-track"><div class="bar-fill" style="width:${s.multiGames ? (100 * s.multiWon / s.multiGames) : 0}%"></div></div><div class="bar-text">${s.multiWon}/${s.multiGames}</div></div>
    </div>
    <div class="stats-section">
      <h3>Best in each mode</h3>
      ${recordRows || '<div class="bar-row"><div class="bar-text" style="margin-left:auto;color:var(--ink-faint)">Finish a game to open your record book.</div></div>'}
    </div>
    <div class="stats-section">
      <h3>Progress</h3>
      <div class="bar-row"><div class="bar-name">Daily</div><div class="bar-text" style="margin-left:auto">${dailyState.totalCompleted || 0} played · ${dailyState.streak || 0} in a row</div></div>
      <div class="bar-row"><div class="bar-name">Puzzles</div><div class="bar-text" style="margin-left:auto">${puzzles.length} of ${PUZZLES.length} solved</div></div>
      <div class="bar-row"><div class="bar-name">Ladder</div><div class="bar-text" style="margin-left:auto">${tournament.level} of ${TOURNAMENT_AIS.length} beaten</div></div>
    </div>
    <div class="stats-section">
      <h3>What you bid, and against what</h3>
      <p class="modal-desc" style="margin-bottom:8px">Brighter means you play that card against that prize more often. Full-deck games only.</p>
      <div class="heatmap-wrap"><canvas id="heatmap-canvas"></canvas></div>
    </div>
  `;
  openModal('modal-stats');
  const heat = getHeatmap();
  if (heat) requestAnimationFrame(() => drawHeatmap($('heatmap-canvas'), heat));
}

// ---- Daily archive modal ----
export function openArchiveModal() {
  const st = getDailyState();
  const hist = st.history || {};
  const days = Object.keys(hist).sort((a, b) => a < b ? 1 : -1);
  if (!days.length) {
    $('archive-body').innerHTML = '<p class="modal-desc">No daily challenges completed yet. Try today\'s!</p>';
    openModal('modal-archive'); return;
  }
  // Group by year-month
  const byMonth = new Map();
  days.forEach(d => {
    const ym = d.slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym).push(d);
  });
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let html = '';
  for (const [ym, list] of byMonth) {
    const [yy, mm] = ym.split('-').map(Number);
    const monthLabel = `${monthNames[mm - 1]} ${yy}`;
    html += `<div class="arc-month">${monthLabel}</div>`;
    html += `<div class="arc-dows"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>`;
    // Build a calendar grid for that month
    const firstDay = new Date(yy, mm - 1, 1);
    const daysInMonth = new Date(yy, mm, 0).getDate();
    const offset = firstDay.getDay();
    const today = new Date().toISOString().slice(0, 10);
    html += '<div class="archive-grid">';
    for (let i = 0; i < offset; i++) html += '<div></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const k = `${yy}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const rec = hist[k];
      const cls = 'arc-day' + (rec ? ' done' : '') + (k === today ? ' today' : '');
      const result = rec ? `<div class="arc-result">${rec.won ? 'W' : 'L'} ${rec.myScore}-${rec.theirScore}</div>` : '';
      html += `<div class="${cls}" data-date="${k}"><div>${d}</div>${result}</div>`;
    }
    html += '</div>';
  }
  $('archive-body').innerHTML = html;
  openModal('modal-archive');
}

// ---- AI Battle modal ----
export function openBattleModal(onStart) {
  openModal('modal-battle');
  $('battle-start-btn').onclick = () => {
    const a = $('battle-a').value;
    const b = $('battle-b').value;
    const d = $('battle-diff').value;
    hide('modal-battle');
    onStart(a, b, d);
  };
}

// ---- Puzzle list modal ----
export function openPuzzleModal() {
  const solved = getSolvedPuzzles();
  $('puzzles-progress').textContent = `${solved.length}/${PUZZLES.length}`;
  const list = $('puzzles-list');
  list.innerHTML = '';
  PUZZLES.forEach(p => {
    const isSolved = solved.includes(p.id);
    const card = document.createElement('div');
    card.className = 'list-item' + (isSolved ? ' done' : '');
    card.innerHTML = `
      <div class="list-icon">${isSolved ? '✓' : '◈'}</div>
      <div class="list-body">
        <div class="list-title">Puzzle ${p.id}: ${escapeHtml(p.title)}</div>
        <div class="list-desc">${escapeHtml(p.desc)} · <i>Goal: ${escapeHtml(p.goal)}</i></div>
      </div>
      <div class="list-meta">${p.deckSize} cards</div>
    `;
    card.onclick = () => { hide('modal-puzzles'); startPuzzle(p); };
    list.appendChild(card);
  });
  openModal('modal-puzzles');
}

// ---- Tournament modal ----
export function openTournamentModal() {
  const t = getTournament();
  S.tournamentLevel = t.level;
  const mastery = getMastery();
  const list = $('tournament-list');
  list.innerHTML = '';
  TOURNAMENT_AIS.forEach((ai, i) => {
    const status = i < S.tournamentLevel ? 'done' : i === S.tournamentLevel ? 'current' : 'locked';
    const wins = mastery[ai.name] || 0;
    const masteryTag = wins > 0 ? ` <span style="color:var(--gold);font-size:11px;font-family:var(--font-mono)">★${wins}</span>` : '';
    const card = document.createElement('div');
    card.className = 'list-item' + (status === 'done' ? ' done' : status === 'locked' ? ' locked' : '');
    card.innerHTML = `
      <div class="list-icon">${ai.avatar}</div>
      <div class="list-body">
        <div class="list-title">${status === 'done' ? '✓ ' : ''}${escapeHtml(ai.name)}${masteryTag}</div>
        <div class="list-desc">${escapeHtml(ai.description)}</div>
      </div>
      <div class="list-meta">${[...new Set([ai.difficulty, ai.personality])].join(' · ')}</div>
    `;
    if (status === 'current') card.onclick = () => { hide('modal-tournament'); startTournamentMatch(ai); };
    list.appendChild(card);
  });
  if (S.tournamentLevel >= TOURNAMENT_AIS.length) {
    const champ = document.createElement('div');
    champ.className = 'list-item done';
    champ.style.justifyContent = 'center'; champ.style.cursor = 'default';
    champ.innerHTML = '👑 You are the Champion!';
    list.appendChild(champ);
    const reset = document.createElement('button');
    reset.className = 'btn btn-ghost btn-sm';
    reset.style.marginTop = '10px';
    reset.textContent = 'Reset tournament';
    reset.onclick = async () => {
      const ok = await confirmDialog({ title: 'Reset tournament?', message: 'Start over from the first opponent.', confirm: 'Reset', cancel: 'Cancel', danger: true });
      if (ok) { import('./storage.js').then(m => m.saveTournament({ level: 0 })); openTournamentModal(); }
    };
    list.appendChild(reset);
  }
  openModal('modal-tournament');
}

// ---- Hot-seat dialog (custom prompt for two names) ----
export function openHotSeatPrompt(onStart) {
  const scrim = $('modal-confirm');
  $('confirm-title').textContent = 'Hot-seat game';
  $('confirm-msg').innerHTML = ''; // we'll inject a custom body
  const body = document.createElement('div');
  body.innerHTML = `
    <p style="color:var(--ink-dim);font-size:13px;margin-bottom:14px">Two players, one device. You'll pass the device back and forth each round.</p>
    <div class="settings-grid">
      <div class="field"><label class="field-label">Player 1</label><input class="input" id="hs-p1" type="text" maxlength="14" value="P1"></div>
      <div class="field"><label class="field-label">Player 2</label><input class="input" id="hs-p2" type="text" maxlength="14" value="P2"></div>
    </div>
  `;
  const msg = $('confirm-msg');
  msg.innerHTML = '';
  msg.appendChild(body);

  const yes = $('confirm-yes'); const no = $('confirm-no');
  yes.textContent = 'Start'; no.textContent = 'Cancel';
  yes.classList.add('btn-primary'); yes.classList.remove('btn-ghost');
  yes.style.color = '';

  const onYes = () => {
    const p1 = ($('hs-p1').value || 'P1').trim().slice(0, 14);
    const p2 = ($('hs-p2').value || 'P2').trim().slice(0, 14);
    cleanup();
    onStart(p1, p2);
  };
  const onNo = () => cleanup();
  const onScrim = e => { if (e.target === scrim) cleanup(); };
  const onKey = e => { if (e.key === 'Escape') cleanup(); if (e.key === 'Enter') onYes(); };
  function cleanup() {
    hide(scrim);
    yes.removeEventListener('click', onYes);
    no.removeEventListener('click', onNo);
    scrim.removeEventListener('click', onScrim);
    document.removeEventListener('keydown', onKey);
  }
  yes.addEventListener('click', onYes);
  no.addEventListener('click', onNo);
  scrim.addEventListener('click', onScrim);
  document.addEventListener('keydown', onKey);
  show(scrim);
  setTimeout(() => $('hs-p1')?.focus(), 50);
}

// ---- Resume banner ----
export function showResumeBanner(saved, onResume, onDiscard) {
  const banner = $('resume');
  let modeText;
  if (saved.mode === 'solo') modeText = `Solo game vs ${escapeHtml(saved.theirName)}`;
  else modeText = `Game with ${escapeHtml(saved.theirName)} (code ${escapeHtml(saved.roomCode)})`;
  const ago = Math.round((Date.now() - saved.timestamp) / 60000);
  const agoText = ago < 1 ? 'just now' : ago < 60 ? `${ago}m ago` : `${Math.round(ago/60)}h ago`;
  $('resume-text').innerHTML = ` ${modeText} · Round ${saved.round + 1}/${saved.totalRounds} · ${saved.myScore}–${saved.theirScore} · ${agoText}`;
  banner.hidden = false;
  $('resume-go').onclick = onResume;
  $('resume-discard').onclick = () => { onDiscard(); banner.hidden = true; };
}

// ---- Streak avatar frame ----
// Adds gold halo to avatar based on current daily streak.
export function applyStreakFrame() {
  const st = getDailyState();
  const s = st.streak || 0;
  const tier = s >= 100 ? 100 : s >= 30 ? 30 : s >= 7 ? 7 : 0;
  const apply = (el) => {
    if (!el) return;
    el.classList.remove('streak-7', 'streak-30', 'streak-100');
    if (tier) el.classList.add('streak-' + tier);
  };
  apply($('avatar-btn'));
  apply($('me-av'));
}

// ---- Custom theme application ----
export function applyCustomTheme(t) {
  const root = document.documentElement;
  if (!t || !t.accent) {
    root.style.removeProperty('--me');
    root.style.removeProperty('--me-soft');
    root.style.removeProperty('--me-glow');
    root.style.removeProperty('--opp');
    root.style.removeProperty('--opp-soft');
    root.style.removeProperty('--opp-glow');
    return;
  }
  const me = t.accent;
  const opp = t.opp || '#a1a1aa';
  root.style.setProperty('--me', me);
  root.style.setProperty('--me-soft', alpha(me, 0.14));
  root.style.setProperty('--me-glow', alpha(me, 0.30));
  root.style.setProperty('--opp', opp);
  root.style.setProperty('--opp-soft', alpha(opp, 0.14));
  root.style.setProperty('--opp-glow', alpha(opp, 0.28));
}
function alpha(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

// ---- Animation speed ----
export function applyAnimSpeed(scale) {
  document.documentElement.style.setProperty('--anim-scale', String(scale));
}

// ---- Quick lookup ----
export const debouncedSave = debouncedSavePrefs;
