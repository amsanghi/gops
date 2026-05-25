// Core game flow: setup, rounds, picking, resolution, ending.

import { S, resetMatch, emit } from './state.js';
import { $, show, hide, escapeHtml, shuffle, clone } from './util.js';
import { rankText } from './constants.js';
import {
  renderHand, renderPrize, renderMyBid, renderTheirBid,
  renderTheirRemaining, renderPrizesRemaining,
  renderScoreboard, renderMetaCounts, renderSeries, renderModePill, renderMessage,
} from './render.js';
import { startTimer, clearTimer, setTimerExpireCallback } from './timer.js';
import { sfx, haptic, fireConfetti, catchphrase } from './effects.js';
import {
  saveGame, clearSavedGame, getGhost, saveGhost,
  updateStats, getStats, saveH2H, getH2H,
  updateHeatmap, updateRecord, recordMasteryWin,
} from './storage.js';
import { AI_CATCHPHRASES } from './constants.js';
import { aiBid } from './ai.js';
import { checkAchOnBid, checkAchOnGameEnd, unlockAch } from './achievements.js';

// Compare returns positive if "me" beats "them" under the current direction rule.
// Special value 99 = Power card (wild). Power vs Power = tie. Power vs anything = wins.
export function compareBid(my, their) {
  if (my === 99 && their === 99) return 0;
  if (my === 99) return 1;
  if (their === 99) return -1;
  return S.settings.direction === 'low' ? their - my : my - their;
}
// Compare final scores.
export function compareScores(my, their) {
  return S.settings.winCondition === 'fewest' ? their - my : my - their;
}

let sendMsg = () => {};
export function setNetSender(fn) { sendMsg = fn; }

let endHook = () => {};
export function setEndHook(fn) { endHook = fn; }

// Setup once we have prizes + settings ready.
export function setupGame() {
  const size = S.settings.deckSize;
  S.totalRounds = size;
  S.myHand = Array.from({ length: size }, (_, i) => i + 1);
  S.theirHand = Array.from({ length: size }, (_, i) => i + 1);
  if (S.settings.powerCards) {
    S.myHand.push(99); S.theirHand.push(99);
  }
  S.theirUsedCards = [];
  S.round = 0; S.myScore = 0; S.theirScore = 0; S.pot = 0;
  S.myPick = null; S.theirPick = null; S.pendingPick = null;
  S.history = [];
  S.myRematch = false; S.theirRematch = false;
  S.busy = false;
  S.chatMsgs = [];
  attachGameUI();
  nextRound();
}

function attachGameUI() {
  hide('lobby'); hide('end'); show('game');
  document.body.classList.add('in-game');
  document.body.classList.toggle('bullet', S.currentMode === 'bullet');
  renderScoreboard();
  renderSeries();
  renderModePill();
  renderTheirRemaining();
  renderPrizesRemaining();
  emit('game-attached'); // chat & reactions bars react to this
}

// Used by multi reconnect: skip setupGame (state is already in S), just re-render and resume.
export function attachAndResume() {
  attachGameUI();
  nextRound();
}

export function nextRound() {
  S.myPick = null; S.theirPick = null; S.pendingPick = null; S.busy = false;
  $('round-n').textContent = S.round + 1;
  $('confirm-row').innerHTML = '';
  renderPrize();
  renderMyBid(null);
  renderTheirBid(null);
  const winLabel = S.settings.winCondition === 'fewest' ? 'Fewest wins' : 'Most wins';
  const bidLabel = S.settings.direction === 'low' ? 'Low bid' : 'High bid';
  renderMessage(`${bidLabel} wins each prize · ${winLabel} overall`);
  renderMetaCounts();
  S.pickTime = Date.now();
  renderHand(selectCard);
  renderPrizesRemaining();
  sfx.reveal();
  saveGame(buildSaveSnap());

  setTimerExpireCallback(autoBidOnTimeout);
  startTimer();

  // Battle mode: auto-bid the "me" side using personality A.
  if (S.currentMode === 'battle') {
    setTimeout(() => {
      import('./ai.js').then(({ aiBid }) => {
        const saved = { hand: S.myHand.slice(), pick: S.myPick };
        // Temporarily swap to compute "me" bid using A personality on my hand
        const aHand = S.myHand.slice();
        const fakeS = { ...S, theirHand: aHand };
        // simpler: use the standard aiBid by swapping
        const orig = S.theirHand; S.theirHand = S.myHand;
        const card = aiBid({ difficulty: 'hard', personality: S.battlePersonA });
        S.theirHand = orig;
        if (card != null && S.myHand.includes(card)) {
          S.pendingPick = card;
          confirmPick();
        }
      });
    }, 350 + Math.random() * 400);
  }
}

function autoBidOnTimeout() {
  if (S.myPick !== null || S.myHand.length === 0) return;
  const n = S.myHand[Math.floor(Math.random() * S.myHand.length)];
  renderMessage(`Time's up — auto-bid ${rankText(n, S.settings.deckSize)}`);
  S.pendingPick = n;
  setTimeout(confirmPick, 200);
}

// Card selection (hand → tentative pick).
export function selectCard(n) {
  if (S.myPick !== null || S.busy) return;
  if (!S.myHand.includes(n)) return;
  sfx.pick(); haptic([15]);
  if (S.pendingPick === n) { confirmPick(); return; }
  S.pendingPick = n;
  renderHand(selectCard);
  renderConfirm();
}

function renderConfirm() {
  // The lifted card itself is the primary visual cue. The message line below the
  // hand turns into the instruction "Tap again to lock in" while pending.
  $('confirm-row').innerHTML = '';
  const msg = $('message');
  if (!msg) return;
  if (S.pendingPick === null || S.myPick !== null) {
    msg.classList.remove('pending-prompt');
    // Restore the default message
    const winLabel = S.settings.winCondition === 'fewest' ? 'Fewest wins' : 'Most wins';
    const bidLabel = S.settings.direction === 'low' ? 'Low bid' : 'High bid';
    msg.textContent = `${bidLabel} wins each prize · ${winLabel} overall`;
    return;
  }
  const label = S.pendingPick === 99 ? '★' : rankText(S.pendingPick, S.settings.deckSize);
  msg.innerHTML = `Bid <b>${label}</b> — tap again to lock in`;
  msg.classList.add('pending-prompt');
}

export function confirmPick() {
  if (S.pendingPick === null || S.myPick !== null) return;
  const n = S.pendingPick;
  S.lastConfirmTime = Date.now() - S.pickTime;
  S.myPick = n;
  S.myHand = S.myHand.filter(x => x !== n);
  S.pendingPick = null;
  clearTimer();
  renderHand(selectCard);
  $('confirm-row').innerHTML = '';
  renderMetaCounts();
  renderMyBid(n);
  sfx.confirm(); haptic([25]);
  saveGame(buildSaveSnap());

  if (S.currentMode === 'hotseat') {
    // Hot-seat: advance to P2 phase or resolve if both phases done
    if (S.hotseatPhase === 'P1') {
      S._hotseatP1Pick = n;
      // Reset for P2's secret pick — swap names/hands/scores so P2 becomes "me"
      S.myPick = null;
      S.pendingPick = null;
      [S.myHand, S.theirHand] = [S.theirHand, S.myHand];
      [S.myName, S.theirName] = [S.hotseatP2Name, S.hotseatP1Name];
      [S.myAvatar, S.theirAvatar] = [S.hotseatP2Avatar, S.hotseatP1Avatar];
      [S.myScore, S.theirScore] = [S.theirScore, S.myScore];
      S.hotseatPhase = 'P2';
      renderScoreboard();
      $('me-score').textContent = S.myScore;
      $('them-score').textContent = S.theirScore;
      renderMyBid(null);
      renderTheirBid(null);
      renderMessage(`Pass device to ${S.myName} — pick in secret`);
      renderHand(selectCard);
      renderMetaCounts();
      S.pickTime = Date.now();
      return;
    }
    // P2 just confirmed — set theirPick from stashed P1 and resolve
    S.theirPick = S._hotseatP1Pick;
    S.theirHand = S.theirHand.filter(x => x !== S.theirPick);
    resolveRound();
    return;
  }

  if (S.vsAI) {
    // Maybe show a catchphrase for personality-driven AIs
    if (Math.random() < 0.25 && !['battle','ghost','daily','puzzle'].includes(S.currentMode)) {
      const persona = (document.getElementById('ai-persona')?.value) || 'balanced';
      const lines = AI_CATCHPHRASES[persona];
      if (lines && lines.length) setTimeout(() => catchphrase(lines[Math.floor(Math.random() * lines.length)]), 200);
    }
    setTimeout(() => {
      const aiCard = aiBid();
      S.theirPick = aiCard;
      S.theirHand = S.theirHand.filter(x => x !== aiCard);
      resolveRound();
    }, 400 + Math.random() * 600);
  } else {
    sendMsg({ type: 'pick', card: n });
    if (S.theirPick !== null) resolveRound();
    else renderMessage(`Bid locked. Waiting for ${S.theirName}…`);
  }
}

// Called by net layer when opponent sends their pick.
export function receiveTheirPick(card) {
  S.theirPick = card;
  if (S.myPick !== null) {
    resolveRound();
  } else {
    renderTheirBid(null, { faceDown: true });
    renderMessage(`${S.theirName} locked in. Your turn.`);
    sfx.reveal();
  }
}

function resolveRound() {
  S.busy = true;
  clearTimer();
  if (!S.theirUsedCards.includes(S.theirPick)) S.theirUsedCards.push(S.theirPick);
  S.theirHand = S.theirHand.filter(x => x !== S.theirPick);

  renderTheirBid(S.theirPick);
  // In hot-seat, the visible "me" right now is P2; we want their reveal animation too
  const myCardEl = $('me-bid').firstChild;
  const theirCardEl = $('them-bid').firstChild;

  const prizeValue = S.prizes[S.round] + S.pot;
  const cmp = compareBid(S.myPick, S.theirPick);
  let msg, winner;
  if (cmp > 0) {
    S.myScore += prizeValue;
    msg = `+${prizeValue} to ${S.myName}`; winner = 'me';
    myCardEl?.classList.add('winner');
    S.pot = 0;
    sfx.win(); haptic([40]);
  } else if (cmp < 0) {
    S.theirScore += prizeValue;
    msg = `+${prizeValue} to ${S.theirName}`; winner = 'them';
    theirCardEl?.classList.add('winner');
    S.pot = 0;
    sfx.lose(); haptic([60, 30, 60]);
  } else {
    if (S.settings.tieRule === 'burn') {
      msg = `Tie — ${prizeValue} burned.`;
      S.pot = 0;
    } else {
      S.pot = prizeValue;
      msg = `Tie — ${prizeValue} carries forward.`;
    }
    winner = 'tie';
    myCardEl?.classList.add('tied');
    theirCardEl?.classList.add('tied');
    sfx.tie(); haptic([30, 30, 30]);
  }

  S.history.push({
    round: S.round + 1,
    prize: S.prizes[S.round],
    mine: S.myPick, theirs: S.theirPick,
    prizeValue, winner,
  });
  renderMessage(msg);
  $('me-score').textContent = S.myScore;
  $('them-score').textContent = S.theirScore;
  renderTheirRemaining();
  renderPrizesRemaining();

  checkAchOnBid({ wonRound: winner === 'me', confirmMs: S.lastConfirmTime });

  S.round++;
  saveGame(buildSaveSnap());

  if (S.round >= S.totalRounds) {
    setTimeout(endGame, 2200);
  } else {
    setTimeout(() => {
      if (S.currentMode === 'hotseat') {
        // Reset to P1 phase for next round
        // Currently "me" is whoever the resolveRound last left as me; ensure we're back to P1
        if (S.myName !== S.hotseatP1Name) {
          [S.myHand, S.theirHand] = [S.theirHand, S.myHand];
          [S.myName, S.theirName] = [S.hotseatP1Name, S.hotseatP2Name];
          [S.myAvatar, S.theirAvatar] = [S.hotseatP1Avatar, S.hotseatP2Avatar];
          // Also swap scores back so P1 always shows on left
          [S.myScore, S.theirScore] = [S.theirScore, S.myScore];
          renderScoreboard();
          $('me-score').textContent = S.myScore;
          $('them-score').textContent = S.theirScore;
        }
        S.hotseatPhase = 'P1';
      }
      nextRound();
    }, 2000);
  }
}

function buildSaveSnap() {
  // Snapshot solo Vs-AI for full resume; snapshot multi for mid-game state restore.
  // Skip hot-seat / mode-specific runs (their progression is owned elsewhere).
  if (S.currentMode === 'solo' && !S.vsAI) return null;
  if (S.currentMode && !['solo', 'multi'].includes(S.currentMode)) return null;
  return {
    timestamp: Date.now(),
    mode: S.mode, currentMode: S.currentMode,
    roomCode: S.roomCode, isHost: S.isHost,
    myName: S.myName, theirName: S.theirName,
    myAvatar: S.myAvatar, theirAvatar: S.theirAvatar,
    settings: clone(S.settings),
    prizes: S.prizes.slice(),
    myHand: S.myHand.slice(),
    theirHand: S.theirHand.slice(),
    theirUsedCards: S.theirUsedCards.slice(),
    round: S.round, myScore: S.myScore, theirScore: S.theirScore,
    pot: S.pot, history: clone(S.history),
    myGames: S.myGames, theirGames: S.theirGames,
    totalRounds: S.totalRounds,
  };
}

// Apply a loaded save snap to S.
export function applySaveSnap(d) {
  Object.assign(S, {
    mode: d.mode, currentMode: d.currentMode,
    roomCode: d.roomCode, isHost: d.isHost,
    myName: d.myName, theirName: d.theirName,
    myAvatar: d.myAvatar || '😎', theirAvatar: d.theirAvatar || '🎭',
    settings: d.settings,
    prizes: d.prizes,
    myHand: d.myHand, theirHand: d.theirHand,
    theirUsedCards: d.theirUsedCards,
    round: d.round, myScore: d.myScore, theirScore: d.theirScore,
    pot: d.pot, history: d.history,
    myGames: d.myGames, theirGames: d.theirGames,
    totalRounds: d.totalRounds,
    vsAI: d.mode === 'solo',
  });
}

// End game — compute result, run achievements, defer mode-specific progression to endHook.
export function endGame() {
  hide('game'); show('end');

  const cmp = compareScores(S.myScore, S.theirScore);
  const didIWin = cmp > 0;
  if (didIWin) S.myGames++;
  else if (cmp < 0) S.theirGames++;

  // Achievements: roll up max deficit and round-streak
  const allRoundsWon = S.history.length > 0 && S.history.every(h => h.winner === 'me');
  let maxDeficit = 0, runMine = 0, runTheirs = 0;
  S.history.forEach(h => {
    if (h.winner === 'me') runMine += h.prizeValue;
    else if (h.winner === 'them') runTheirs += h.prizeValue;
    maxDeficit = Math.max(maxDeficit, runTheirs - runMine);
  });

  const seriesGoal = Math.ceil(S.settings.bestOf / 2);
  const seriesOver = S.settings.bestOf === 1 || S.myGames >= seriesGoal || S.theirGames >= seriesGoal;

  // Stats — only on series end / single game.
  if (seriesOver) {
    if (!S.vsAI && S.currentMode === 'multi') {
      const rec = getH2H(S.theirName);
      if (cmp > 0) rec.mine++; else if (cmp < 0) rec.theirs++; else rec.ties++;
      saveH2H(S.theirName, rec);
    }
    updateStats({
      gamesPlayed: v => v + 1,
      gamesWon: v => v + (didIWin ? 1 : 0),
      [S.vsAI ? 'soloGames' : 'multiGames']: v => v + 1,
      [S.vsAI ? 'soloWon' : 'multiWon']: v => v + (didIWin ? 1 : 0),
      totalScore: v => v + S.myScore,
      rounds: v => v + S.history.length,
      highScore: v => Math.max(v, S.myScore),
    });
    // Per-mode high score
    updateRecord(S.currentMode || (S.vsAI ? 'solo' : 'multi'), S.myScore, didIWin);
    // Mastery (tournament/battle AIs)
    if (didIWin && S.vsAI && S.theirName && ['tournament','battle','solo','random'].includes(S.currentMode)) {
      recordMasteryWin(S.theirName);
    }
    // Heatmap (only full-deck games for consistency)
    if (S.settings.deckSize === 13) updateHeatmap(S.history, 13);
    clearSavedGame();

    // Ghost: record this game if it's a personal best solo win
    if (S.vsAI && didIWin && S.currentMode === 'solo') {
      const prev = getGhost();
      if (!prev || S.myScore > (prev.score || 0)) {
        saveGhost({
          ts: Date.now(),
          score: S.myScore,
          deckSize: S.settings.deckSize,
          prizes: S.prizes.slice(),
          bids: S.history.map(h => h.mine),
        });
      }
    }

    if (!S.vsAI && S.currentMode === 'multi') {
      const s = getStats();
      if (s.multiGames >= 10) unlockAch('multi_10');
    }
  }

  checkAchOnGameEnd({ didIWin, allRoundsWon, maxDeficit, seriesOver });

  // Effects
  if (didIWin) setTimeout(() => { sfx.endWin(); fireConfetti(); haptic([100, 50, 100]); }, 180);
  else if (cmp === 0) setTimeout(sfx.tie, 180);
  else { setTimeout(sfx.endLose, 180); haptic([200, 100, 200]); }

  if (seriesOver) { S.myGames = 0; S.theirGames = 0; }

  endHook({ didIWin, seriesOver, cmp });
}
