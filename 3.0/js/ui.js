// UI pieces: lobby presentation, modals, theme picker, chat, reactions, end screen, hot-seat dialog.

import { S, on } from './state.js';
import { $, $$, show, hide, escapeHtml, confirmDialog, debounce, copyToClipboard } from './util.js';
import {
  AVATARS, CARD_BACKS, REACTIONS, THEMES, ACHIEVEMENTS, PUZZLES, TOURNAMENT_AIS,
} from './constants.js';
import {
  getAchievements, getStats, getDailyState, getSolvedPuzzles, getTournament, getPrefs, savePrefs, totalH2H,
} from './storage.js';
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

export function setMode(mode /* 'dark' | 'light' | null=auto */) {
  S.mode_light = mode === 'light';
  if (mode) document.documentElement.setAttribute('data-mode', mode);
  else document.documentElement.removeAttribute('data-mode');
  savePrefs({ modeLight: mode === 'light' });
}

export function buildThemePicker() {
  const row = $('theme-row');
  row.innerHTML = '';
  THEMES.forEach(t => {
    const sw = document.createElement('button');
    sw.className = 'swatch';
    sw.dataset.theme = t.name;
    sw.style.setProperty('--swatch', t.color);
    sw.title = t.name;
    sw.setAttribute('aria-label', `Accent: ${t.name}`);
    sw.setAttribute('aria-pressed', S.theme === t.name ? 'true' : 'false');
    sw.onclick = () => setTheme(t.name);
    row.appendChild(sw);
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
      card.style.boxShadow = '0 0 0 2px var(--me), 0 4px 10px rgba(0,0,0,0.4)';
    }
    const lbl = document.createElement('div');
    lbl.style.fontSize = '11px'; lbl.style.color = 'var(--ink-dim)'; lbl.style.marginTop = '4px';
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
  $('daily-sub').textContent = done ? `✓ Today ${done.myScore}–${done.theirScore}` : (daily.streak ? `Today · 🔥${daily.streak}` : 'Today');

  const t = getTournament();
  $('tournament-sub').textContent = t.level >= TOURNAMENT_AIS.length
    ? '👑 Champion'
    : `Next: ${TOURNAMENT_AIS[t.level].name}`;
  S.tournamentLevel = t.level;

  const p = getSolvedPuzzles();
  $('puzzle-sub').textContent = `${p.length}/${PUZZLES.length} solved`;

  $('endless-sub').textContent = 'Survival';
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
  // Show chat button only in true multiplayer
  if (S.currentMode === 'multi') show('chat-btn'); else hide('chat-btn');
  renderChatMsgs();
});

// ---- End screen ----
export function renderEnd({ didIWin, seriesOver, cmp }) {
  let resultEl = 'Tied', cls = 'tie';
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

  // Rematch button label
  const rb = $('rematch-btn');
  rb.disabled = false;
  if (S.currentMode === 'tournament') rb.textContent = 'Next opponent →';
  else if (S.currentMode === 'endless') rb.textContent = 'Next round →';
  else if (S.currentMode === 'puzzle') rb.textContent = 'Puzzles ↩';
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
  // [data-close] buttons
  $$('.modal-close').forEach(btn => {
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
  const winRate = s.gamesPlayed ? Math.round(100 * s.gamesWon / s.gamesPlayed) : 0;
  const avgScore = s.gamesPlayed ? Math.round(s.totalScore / s.gamesPlayed) : 0;

  $('stats-body').innerHTML = `
    <div class="stats-grid">
      <div class="stat"><div class="stat-value">${s.gamesPlayed}</div><div class="stat-label">Games</div></div>
      <div class="stat"><div class="stat-value">${winRate}%</div><div class="stat-label">Win rate</div></div>
      <div class="stat"><div class="stat-value">${s.highScore}</div><div class="stat-label">High score</div></div>
      <div class="stat"><div class="stat-value">${avgScore}</div><div class="stat-label">Avg score</div></div>
      <div class="stat"><div class="stat-value">${s.rounds || 0}</div><div class="stat-label">Rounds</div></div>
      <div class="stat"><div class="stat-value">${ach.length}</div><div class="stat-label">Badges</div></div>
    </div>
    <div class="stats-section">
      <h3>Breakdown</h3>
      <div class="bar-row"><div class="bar-name">Solo</div><div class="bar-track"><div class="bar-fill" style="width:${s.soloGames ? (100 * s.soloWon / s.soloGames) : 0}%"></div></div><div class="bar-text">${s.soloWon}/${s.soloGames}</div></div>
      <div class="bar-row"><div class="bar-name">Multi</div><div class="bar-track"><div class="bar-fill" style="width:${s.multiGames ? (100 * s.multiWon / s.multiGames) : 0}%"></div></div><div class="bar-text">${s.multiWon}/${s.multiGames}</div></div>
    </div>
    <div class="stats-section">
      <h3>Modes</h3>
      <div class="bar-row"><div class="bar-name">Daily</div><div class="bar-text" style="margin-left:auto">${dailyState.totalCompleted || 0} done · streak ${dailyState.streak || 0} 🔥</div></div>
      <div class="bar-row"><div class="bar-name">Puzzles</div><div class="bar-text" style="margin-left:auto">${puzzles.length}/${PUZZLES.length} solved</div></div>
      <div class="bar-row"><div class="bar-name">Tournament</div><div class="bar-text" style="margin-left:auto">Level ${tournament.level}/${TOURNAMENT_AIS.length}</div></div>
    </div>
  `;
  openModal('modal-stats');
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
  const list = $('tournament-list');
  list.innerHTML = '';
  TOURNAMENT_AIS.forEach((ai, i) => {
    const status = i < S.tournamentLevel ? 'done' : i === S.tournamentLevel ? 'current' : 'locked';
    const card = document.createElement('div');
    card.className = 'list-item' + (status === 'done' ? ' done' : status === 'locked' ? ' locked' : '');
    card.innerHTML = `
      <div class="list-icon">${ai.avatar}</div>
      <div class="list-body">
        <div class="list-title">${status === 'done' ? '✓ ' : ''}${escapeHtml(ai.name)}</div>
        <div class="list-desc">${escapeHtml(ai.description)}</div>
      </div>
      <div class="list-meta">${ai.difficulty} · ${ai.personality}</div>
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

// ---- Quick lookup ----
export const debouncedSave = debouncedSavePrefs;
