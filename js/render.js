// All card/board rendering. Pure: reads S, mutates the DOM. No side effects beyond that.

import { S } from './state.js';
import { $, escapeHtml } from './util.js';
import { rankText } from './constants.js';

// Build a single card element.
export function makeCard(n, classes = 'in-hand', { size } = {}) {
  const deckSize = size ?? S.settings.deckSize ?? 13;
  const el = document.createElement('div');
  el.className = 'card ' + classes;
  if (classes.includes('face-down')) {
    el.classList.add('pattern-' + (S.cardBack || 'mono'));
  } else if (n === 99) {
    el.classList.add('power');
    el.innerHTML = `<span>★</span><span class="pip">power</span>`;
  } else {
    const pip = pipFor(n, deckSize);
    el.innerHTML = `<span>${rankText(n, deckSize)}</span>${pip ? `<span class="pip">${pip}</span>` : ''}`;
  }
  return el;
}

function pipFor(n, deckSize) {
  if (deckSize === 7) return String(n);
  // For 13-card deck: A/J/Q/K get a tiny pip label; numbers show "♦" softly
  const map = { 1: 'ace', 11: 'jack', 12: 'queen', 13: 'king' };
  return map[n] || '';
}

// ---- Game zones ----
export function renderHand(onSelect) {
  const row = $('hand'); if (!row) return;
  row.innerHTML = '';
  const size = S.settings.deckSize;
  const order = orderedRanks(size);
  // Append power card at end if enabled
  if (S.settings.powerCards) order.push(99);
  for (const n of order) {
    const used = !S.myHand.includes(n);
    const locked = S.myPick !== null;
    const pending = S.pendingPick === n && !locked;
    const cls = 'in-hand' + (used ? ' used' : '') + (locked ? ' locked' : '') + (pending ? ' pending' : '');
    const c = makeCard(n, cls);
    c.setAttribute('tabindex', used || locked ? '-1' : '0');
    c.setAttribute('role', 'button');
    c.setAttribute('aria-label', `Bid ${rankText(n, size)}${used ? ' (used)' : ''}`);
    if (!used && !locked) {
      c.onclick = () => onSelect(n);
      c.onkeydown = e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n); }
      };
      attachSwipe(c, () => onSelect(n));
    }
    row.appendChild(c);
  }
}

function orderedRanks(size) {
  const all = Array.from({ length: size }, (_, i) => i + 1);
  if (S.handSort === 'desc') return all.slice().reverse();
  if (S.handSort === 'used-last') {
    const live = all.filter(n => S.myHand.includes(n));
    const used = all.filter(n => !S.myHand.includes(n));
    return [...live, ...used];
  }
  return all;
}

// Touch swipe-up to select & lock-in (mobile UX shortcut).
function attachSwipe(el, onCommit) {
  let sy = null;
  el.addEventListener('touchstart', e => { sy = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (sy == null) return;
    const dy = sy - e.touches[0].clientY;
    if (dy > 40) {
      el.style.transform = `translateY(${-Math.min(dy, 80)}px) scale(1.05)`;
    }
  }, { passive: true });
  el.addEventListener('touchend', e => {
    if (sy == null) return;
    const dy = sy - (e.changedTouches[0]?.clientY ?? sy);
    el.style.transform = '';
    sy = null;
    if (dy > 60) onCommit();
  }, { passive: true });
}

export function renderPrize() {
  const area = $('prize-area'); if (!area) return;
  area.innerHTML = '';
  area.appendChild(makeCard(S.prizes[S.round], 'prize'));
  const chip = $('pot-chip');
  if (chip) {
    if (S.pot > 0) { chip.textContent = `+${S.pot} carried`; chip.hidden = false; }
    else chip.hidden = true;
  }
}

export function renderMyBid(card = null, klass = 'played') {
  const row = $('me-bid'); if (!row) return;
  row.innerHTML = '';
  row.classList.remove('drop-zone-active');
  if (card !== null) row.appendChild(makeCard(card, klass));
}

export function renderTheirBid(card = null, opts = {}) {
  const row = $('them-bid'); if (!row) return;
  row.innerHTML = '';
  if (opts.faceDown) row.appendChild(makeCard('', 'face-down opp'));
  else if (card !== null) row.appendChild(makeCard(card, opts.klass || 'opp'));
}

export function renderTheirRemaining() {
  const row = $('them-mini'); if (!row) return;
  row.innerHTML = '';
  const remaining = S.theirHand.slice().sort((a, b) => a - b);
  if (remaining.length === 0) {
    const ph = document.createElement('div');
    ph.className = 'empty-text';
    ph.textContent = 'No cards left.';
    row.appendChild(ph);
    return;
  }
  // Practice mode: also show what the AI is *about to play* this round.
  const showHint = S.settings?.practice && S.theirPick == null && S.currentMode === 'practice';
  remaining.forEach(n => {
    const card = makeCard(n, 'mini opp-mini');
    row.appendChild(card);
  });
}

export function renderPrizesRemaining() {
  const row = $('prizes-mini'); if (!row) return;
  row.innerHTML = '';
  const played = new Set(S.history.map(h => h.prize));
  const size = S.settings.deckSize;
  // Include the current visible prize too as "remaining" (still in play visually until resolved)
  const remaining = Array.from({ length: size }, (_, i) => i + 1).filter(n => !played.has(n));
  remaining.sort((a, b) => a - b);
  if (remaining.length === 0) {
    const ph = document.createElement('div');
    ph.className = 'empty-text';
    ph.textContent = 'All revealed.';
    row.appendChild(ph);
    return;
  }
  remaining.forEach(n => row.appendChild(makeCard(n, 'mini prize-mini')));
}

// Score / round / labels
export function renderScoreboard() {
  $('me-score').textContent = S.myScore;
  $('them-score').textContent = S.theirScore;
  $('me-name').textContent = S.myName;
  $('them-name').textContent = S.theirName;
  $('me-av').textContent = S.myAvatar;
  $('them-av').textContent = S.theirAvatar;
  $('me-bid-label').textContent = 'Your bid';
  $('them-bid-label').textContent = 'Their bid';
  $('them-cards-label').textContent = `${S.theirName}'s cards`;
  $('round-tot').textContent = S.totalRounds;
}

export function renderMetaCounts() {
  $('me-meta').textContent = `${S.myHand.length} left`;
  $('them-meta').textContent = `${S.theirHand.length} left`;
  $('prizes-meta').textContent = `${S.totalRounds - S.round} left`;
}

export function renderSeries() {
  const bar = $('series-bar');
  const bestOf = S.settings.bestOf;
  if (bestOf === 0) {
    // Indefinite series — show running tally instead of a fixed pip count
    bar.hidden = false;
    bar.classList.add('indefinite');
    bar.innerHTML = `
      <span class="series-tally me-tally">${S.myGames}</span>
      <span class="series-label">∞ Indefinite</span>
      <span class="series-tally them-tally">${S.theirGames}</span>
    `;
  } else if (bestOf > 1) {
    bar.hidden = false;
    bar.classList.remove('indefinite');
    bar.innerHTML = '';
    const goal = Math.ceil(bestOf / 2);
    for (let i = 0; i < goal; i++) {
      const me = document.createElement('div');
      me.className = 'series-pip' + (i < S.myGames ? ' me' : '');
      bar.appendChild(me);
    }
    const spacer = document.createElement('div'); spacer.style.width = '20px';
    bar.appendChild(spacer);
    for (let i = 0; i < goal; i++) {
      const them = document.createElement('div');
      them.className = 'series-pip' + (i < S.theirGames ? ' them' : '');
      bar.appendChild(them);
    }
  } else {
    bar.hidden = true;
    bar.classList.remove('indefinite');
  }
}

export function renderModePill() {
  const pill = $('mode-pill');
  if (!pill) return;
  const m = S.currentMode;
  if (!m || m === 'multi' || m === 'solo') { pill.hidden = true; return; }
  const labels = {
    daily: '◷ Daily',
    endless: `∞ Endless · Round ${S.endlessLevel + 1}`,
    tournament: `♔ ${S.currentTournamentAI ? S.currentTournamentAI.name : 'Tournament'}`,
    puzzle: `◈ Puzzle ${S.currentPuzzle ? S.currentPuzzle.id : ''}`,
    tutorial: '◵ Tutorial',
    hotseat: '◉ Hot seat',
    ghost: '👻 Ghost',
  };
  pill.textContent = labels[m] || '';
  pill.hidden = false;
}

export function renderMessage(text) {
  const el = $('message');
  el.textContent = text;
  el.classList.remove('pending-prompt');
}

// Replay scrubber (end screen)
export function renderReplayStep(idx) {
  const h = S.history;
  if (!h.length) return;
  const i = Math.max(0, Math.min(idx, h.length - 1));
  const m = h[i];
  $('replay-step').textContent = `${i + 1} / ${h.length}`;
  $('rp-me').innerHTML = '';
  $('rp-them').innerHTML = '';
  $('rp-prize').innerHTML = '';
  const sz = S.settings.deckSize;
  $('rp-me').appendChild(makeCard(m.mine, m.winner === 'me' ? 'played winner' : m.winner === 'tie' ? 'played tied' : 'played', { size: sz }));
  $('rp-them').appendChild(makeCard(m.theirs, m.winner === 'them' ? 'opp winner' : m.winner === 'tie' ? 'opp tied' : 'opp', { size: sz }));
  $('rp-prize').appendChild(makeCard(m.prize, 'prize', { size: sz }));
  $('rp-me-name').textContent = S.myName;
  $('rp-them-name').textContent = S.theirName;
  let info;
  if (m.winner === 'me') info = `You take ${m.prizeValue}`;
  else if (m.winner === 'them') info = `${S.theirName} takes ${m.prizeValue}`;
  else info = `Tie — ${m.prizeValue} ${S.settings.tieRule === 'burn' ? 'burned' : 'carried'}`;
  $('replay-info').textContent = `Round ${m.round} · ${info}`;
}

export function buildReplay() {
  const r = $('replay');
  if (!S.history.length) { r.hidden = true; return; }
  r.hidden = false;
  const track = $('replay-track');
  track.min = 0; track.max = S.history.length - 1; track.value = S.history.length - 1;
  renderReplayStep(S.history.length - 1);
}

// History modal table
export function renderHistory(targetId = 'history-body') {
  const el = $(targetId);
  if (!el) return;
  if (!S.history.length) {
    el.innerHTML = '<p style="color:var(--ink-faint);text-align:center;padding:24px 0">No rounds played yet.</p>';
    return;
  }
  let html = `<div class="h-row head"><div>#</div><div>Prize</div><div>${escapeHtml(S.myName)}</div><div>${escapeHtml(S.theirName)}</div></div>`;
  S.history.forEach(h => {
    const myCls = h.winner === 'me' ? 'win' : '';
    const theirCls = h.winner === 'them' ? 'win' : '';
    const tieMark = h.winner === 'tie' ? ' tie' : '';
    html += `<div class="h-row"><div>${h.round}</div><div class="h-prize">${rankText(h.prize, S.settings.deckSize)}${tieMark}</div><div class="h-mine ${myCls}">${rankText(h.mine, S.settings.deckSize)}</div><div class="h-theirs ${theirCls}">${rankText(h.theirs, S.settings.deckSize)}</div></div>`;
  });
  el.innerHTML = html;
}
