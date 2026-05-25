// Mode launchers: solo, daily, puzzle, endless, tournament, tutorial, hotseat, ghost.

import { S } from './state.js';
import { $, shuffle, seededShuffle, dailySeed, todayKey } from './util.js';
import {
  PUZZLES, TOURNAMENT_AIS, TUTORIAL_STEPS,
} from './constants.js';
import { setupGame } from './game.js';
import {
  getDailyState, saveDailyState,
  getSolvedPuzzles, saveSolvedPuzzles,
  getTournament, saveTournament,
  getGhost,
} from './storage.js';
import { unlockAch } from './achievements.js';

function readAISettings() {
  return {
    deckSize: parseInt($('ai-deck').value, 10) || 13,
    timeLimit: Math.max(0, parseInt($('ai-time').value, 10) || 0),
    power: $('ai-power')?.checked || false,
    practice: $('ai-practice')?.checked || false,
  };
}

// Practice mode: opponent's hand is visible to the player. Useful for learning.
export function startPractice() {
  const a = readAISettings();
  S.vsAI = true; S.isHost = true; S.mode = 'solo'; S.currentMode = 'practice';
  S.myName = $('name-input').value.trim() || 'You';
  S.theirName = 'Coach (peek)'; S.theirAvatar = '👀';
  S.settings = {
    deckSize: a.deckSize, bestOf: 1, tieRule: 'carry',
    direction: 'high', winCondition: 'most', timeLimit: 0, stakes: '',
    powerCards: a.power, practice: true,
  };
  S.totalRounds = a.deckSize;
  S.scriptedAI = null;
  S.prizes = shuffle(Array.from({ length: a.deckSize }, (_, i) => i + 1));
  setupGame();
}

// Seeded daily replay: open any past day's seed by date string (YYYY-MM-DD)
export function startSeeded(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const seed = y * 10000 + m * 100 + d;
  S.vsAI = true; S.isHost = true; S.mode = 'solo'; S.currentMode = 'daily';
  S.myName = $('name-input').value.trim() || 'You';
  S.theirName = `AI · ${dateStr}`; S.theirAvatar = '◷';
  S.settings = { deckSize: 13, bestOf: 1, tieRule: 'carry', direction: 'high', winCondition: 'most', timeLimit: 0, stakes: '' };
  S.totalRounds = 13;
  $('ai-diff').value = 'medium';
  $('ai-persona').value = 'balanced';
  S.scriptedAI = null;
  S.prizes = seededShuffle(Array.from({ length: 13 }, (_, i) => i + 1), seed);
  setupGame();
}

// Weekly puzzle: seeded by ISO week. Anyone playing this week gets the same.
export function startWeekly() {
  const d = new Date();
  // ISO week number
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  const weekNum = 1 + Math.ceil((firstThursday - target) / 604800000);
  const seed = d.getFullYear() * 100 + weekNum;
  S.vsAI = true; S.isHost = true; S.mode = 'solo'; S.currentMode = 'weekly';
  S.myName = $('name-input').value.trim() || 'You';
  S.theirName = `Weekly · W${weekNum}`; S.theirAvatar = '◴';
  S.settings = { deckSize: 13, bestOf: 1, tieRule: 'carry', direction: 'high', winCondition: 'most', timeLimit: 0, stakes: '' };
  S.totalRounds = 13;
  $('ai-diff').value = 'hard';
  $('ai-persona').value = 'balanced';
  S.scriptedAI = null;
  S.prizes = seededShuffle(Array.from({ length: 13 }, (_, i) => i + 1), seed);
  setupGame();
}

// AI Bracket: 8 AIs single-elimination, auto-played. Returns a champion.
export function startBracket(onResult) {
  // We don't render a game UI for bracket — it's a quick simulation.
  const personalities = ['balanced','aggressive','defensive','bluffer','mirror','easy','balanced','aggressive'];
  // simulate one match between two personalities; returns winner index
  function simulate(persA, persB, seedOffset = 0) {
    const deck = 13;
    const prizes = shuffle(Array.from({ length: deck }, (_, i) => i + 1));
    const handA = Array.from({ length: deck }, (_, i) => i + 1);
    const handB = Array.from({ length: deck }, (_, i) => i + 1);
    let sA = 0, sB = 0, pot = 0;
    // very simple sim — both AIs pick using a basic rule
    for (let r = 0; r < deck; r++) {
      const sortedA = handA.slice().sort((x,y) => y-x);
      const sortedB = handB.slice().sort((x,y) => y-x);
      // rank of current prize among remaining
      const rem = prizes.slice(r).sort((x,y) => y-x);
      const rank = rem.indexOf(prizes[r]);
      let pickA, pickB;
      if (persA === 'aggressive') pickA = sortedA[Math.min(2, sortedA.length-1)];
      else if (persA === 'defensive') pickA = sortedA[sortedA.length-1-Math.min(2, sortedA.length-1)];
      else if (persA === 'bluffer') pickA = sortedA[Math.floor(Math.random()*sortedA.length)];
      else if (persA === 'mirror') pickA = sortedA[rank] ?? sortedA[0];
      else pickA = sortedA[Math.max(0, Math.min(sortedA.length-1, rank))];
      if (persB === 'aggressive') pickB = sortedB[Math.min(2, sortedB.length-1)];
      else if (persB === 'defensive') pickB = sortedB[sortedB.length-1-Math.min(2, sortedB.length-1)];
      else if (persB === 'bluffer') pickB = sortedB[Math.floor(Math.random()*sortedB.length)];
      else if (persB === 'mirror') pickB = sortedB[rank] ?? sortedB[0];
      else pickB = sortedB[Math.max(0, Math.min(sortedB.length-1, rank))];
      const value = prizes[r] + pot;
      if (pickA > pickB) { sA += value; pot = 0; }
      else if (pickB > pickA) { sB += value; pot = 0; }
      else { pot = value; }
      handA.splice(handA.indexOf(pickA), 1);
      handB.splice(handB.indexOf(pickB), 1);
    }
    return { winnerIdx: sA > sB ? 0 : sB > sA ? 1 : (Math.random() < 0.5 ? 0 : 1), sA, sB };
  }
  let bracket = personalities.slice();
  const log = [{ round: 'Quarterfinals', matches: [] }, { round: 'Semifinals', matches: [] }, { round: 'Final', matches: [] }];
  for (let stage = 0; stage < 3; stage++) {
    const next = [];
    for (let i = 0; i < bracket.length; i += 2) {
      const res = simulate(bracket[i], bracket[i+1]);
      log[stage].matches.push({ a: bracket[i], b: bracket[i+1], sA: res.sA, sB: res.sB, winner: res.winnerIdx === 0 ? bracket[i] : bracket[i+1] });
      next.push(res.winnerIdx === 0 ? bracket[i] : bracket[i+1]);
    }
    bracket = next;
  }
  onResult({ champion: bracket[0], log });
}

export function startSolo() {
  const a = readAISettings();
  S.vsAI = true; S.isHost = true; S.mode = 'solo'; S.currentMode = 'solo';
  S.myName = $('name-input').value.trim() || 'You';
  S.theirName = `AI (${$('ai-diff').value})`;
  S.theirAvatar = '🤖';
  const power = $('ai-power')?.checked || false;
  S.settings = {
    deckSize: a.deckSize, bestOf: 1, tieRule: 'carry',
    direction: 'high', winCondition: 'most', timeLimit: a.timeLimit, stakes: '',
    powerCards: power,
  };
  S.totalRounds = a.deckSize;
  S.scriptedAI = null;
  S.prizes = shuffle(Array.from({ length: a.deckSize }, (_, i) => i + 1));
  setupGame();
}

// Bullet mode: 3-second timer, full 13-deck, medium AI.
export function startBullet() {
  S.vsAI = true; S.isHost = true; S.mode = 'solo'; S.currentMode = 'bullet';
  S.myName = $('name-input').value.trim() || 'You';
  S.theirName = 'Bullet AI'; S.theirAvatar = '⏱';
  $('ai-diff').value = 'medium'; $('ai-persona').value = 'balanced';
  S.settings = { deckSize: 13, bestOf: 1, tieRule: 'carry',
    direction: 'high', winCondition: 'most', timeLimit: 3, stakes: '', powerCards: false };
  S.totalRounds = 13;
  S.scriptedAI = null;
  S.prizes = shuffle(Array.from({ length: 13 }, (_, i) => i + 1));
  setupGame();
}

// AI battle: two AIs play out the deck while you spectate.
// We pre-compute both sides' bids using aiBid logic, then auto-advance.
export function startBattle(personA = 'balanced', personB = 'aggressive', diff = 'hard') {
  S.vsAI = true; S.isHost = true; S.mode = 'solo'; S.currentMode = 'battle';
  S.myName = `AI · ${personA}`; S.myAvatar = '🤖';
  S.theirName = `AI · ${personB}`; S.theirAvatar = '🦾';
  $('ai-diff').value = diff; $('ai-persona').value = personB;
  S.settings = { deckSize: 13, bestOf: 1, tieRule: 'carry',
    direction: 'high', winCondition: 'most', timeLimit: 0, stakes: '', powerCards: false };
  S.totalRounds = 13;
  S.scriptedAI = null;
  S.battlePersonA = personA;
  S.battlePersonB = personB;
  S.prizes = shuffle(Array.from({ length: 13 }, (_, i) => i + 1));
  setupGame();
}

export function startDaily() {
  S.vsAI = true; S.isHost = true; S.mode = 'solo'; S.currentMode = 'daily';
  S.myName = $('name-input').value.trim() || 'You';
  S.theirName = "Today's AI";
  S.theirAvatar = '◷';
  S.settings = { deckSize: 13, bestOf: 1, tieRule: 'carry', direction: 'high', winCondition: 'most', timeLimit: 0, stakes: '' };
  S.totalRounds = 13;
  $('ai-diff').value = 'medium';
  $('ai-persona').value = 'balanced';
  S.scriptedAI = null;
  S.prizes = seededShuffle(Array.from({ length: 13 }, (_, i) => i + 1), dailySeed());
  setupGame();
}

export function startPuzzle(puzzle) {
  S.vsAI = true; S.isHost = true; S.mode = 'solo'; S.currentMode = 'puzzle';
  S.currentPuzzle = puzzle;
  S.myName = $('name-input').value.trim() || 'You';
  S.theirName = 'Puzzle AI'; S.theirAvatar = '◈';
  S.settings = {
    deckSize: puzzle.deckSize || 13,
    bestOf: 1,
    tieRule: puzzle.tieRule || 'carry',
    direction: puzzle.direction || 'high',
    winCondition: puzzle.winCondition || 'most',
    timeLimit: puzzle.timeLimit || 0,
    stakes: '',
  };
  S.totalRounds = S.settings.deckSize;
  if (puzzle.difficulty) $('ai-diff').value = puzzle.difficulty;
  if (puzzle.scripted) {
    S.prizes = puzzle.scripted.map(m => m.prize);
    S.scriptedAI = puzzle.scripted.map(m => m.ai);
  } else {
    S.prizes = shuffle(Array.from({ length: S.settings.deckSize }, (_, i) => i + 1));
    S.scriptedAI = null;
  }
  setupGame();
}

export function startEndless() {
  S.vsAI = true; S.isHost = true; S.mode = 'solo'; S.currentMode = 'endless';
  S.endlessLevel = 0; S.endlessScore = 0;
  S.myName = $('name-input').value.trim() || 'You';
  startNextEndlessRound();
}

export function startNextEndlessRound() {
  const diff = S.endlessLevel < 3 ? 'easy' : S.endlessLevel < 8 ? 'medium' : 'hard';
  $('ai-diff').value = diff;
  S.theirName = `Endless · L${S.endlessLevel + 1}`;
  S.theirAvatar = '∞';
  const deckSize = S.endlessLevel < 5 ? 7 : 13;
  S.settings = { deckSize, bestOf: 1, tieRule: 'carry', direction: 'high', winCondition: 'most',
    timeLimit: S.endlessLevel >= 15 ? 15 : 0, stakes: '' };
  S.totalRounds = deckSize;
  S.scriptedAI = null;
  S.prizes = shuffle(Array.from({ length: deckSize }, (_, i) => i + 1));
  setupGame();
}

export function startTournamentMatch(ai) {
  S.vsAI = true; S.isHost = true; S.mode = 'solo'; S.currentMode = 'tournament';
  S.currentTournamentAI = ai;
  S.myName = $('name-input').value.trim() || 'You';
  S.theirName = ai.name; S.theirAvatar = ai.avatar;
  $('ai-diff').value = ai.difficulty;
  $('ai-persona').value = ai.personality;
  S.settings = { deckSize: 13, bestOf: 1, tieRule: 'carry', direction: 'high', winCondition: 'most', timeLimit: 0, stakes: '' };
  S.totalRounds = 13;
  S.scriptedAI = null;
  S.prizes = shuffle(Array.from({ length: 13 }, (_, i) => i + 1));
  setupGame();
}

export function startNextTournamentMatch() {
  const next = TOURNAMENT_AIS[S.tournamentLevel];
  if (next) startTournamentMatch(next);
}

export function progressTournament(didIWin) {
  if (!didIWin) return false;
  S.tournamentLevel++;
  saveTournament({ level: S.tournamentLevel });
  if (S.tournamentLevel >= TOURNAMENT_AIS.length) {
    unlockAch('tournament');
    S.tournamentLevel = 0;
    saveTournament({ level: 0 });
    return true; // tournament complete
  }
  return false;
}

export function progressEndless(didIWin) {
  if (!didIWin) return false;
  S.endlessLevel++;
  S.endlessScore += S.myScore;
  if (S.endlessLevel >= 10) unlockAch('endless_10');
  if (S.endlessLevel >= 25) unlockAch('endless_25');
  return true;
}

export function progressPuzzle(didIWin) {
  if (!didIWin || !S.currentPuzzle) return;
  const solved = getSolvedPuzzles();
  if (!solved.includes(S.currentPuzzle.id)) {
    solved.push(S.currentPuzzle.id);
    saveSolvedPuzzles(solved);
    if (solved.length >= 5) unlockAch('puzzle_5');
    if (solved.length >= PUZZLES.length) unlockAch('puzzle_all');
  }
}

export function progressDaily(didIWin) {
  const st = getDailyState();
  const key = todayKey();
  if (!st.history[key]) {
    st.history[key] = { myScore: S.myScore, theirScore: S.theirScore, won: didIWin };
    st.totalCompleted = (st.totalCompleted || 0) + 1;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yKey = todayKey(y);
    st.streak = (st.lastCompleted === yKey) ? (st.streak || 0) + 1 : 1;
    st.lastCompleted = key;
    saveDailyState(st);
    if (st.totalCompleted >= 1) unlockAch('daily_1');
    if (st.totalCompleted >= 7) unlockAch('daily_7');
    if (st.totalCompleted >= 30) unlockAch('daily_30');
  }
}

// Hot-seat: both players on one device. We treat the local "me" as P1 initially,
// then swap mid-round to collect P2's secret bid. Game.js handles the swap logic.
export function startHotSeat(p1Name, p2Name, p1Avatar = '😎', p2Avatar = '🎭') {
  S.vsAI = false; S.isHost = true; S.mode = 'hotseat'; S.currentMode = 'hotseat';
  S.hotseatP1Name = p1Name; S.hotseatP2Name = p2Name;
  S.hotseatP1Avatar = p1Avatar; S.hotseatP2Avatar = p2Avatar;
  S.hotseatPhase = 'P1';
  S.myName = p1Name; S.theirName = p2Name;
  S.myAvatar = p1Avatar; S.theirAvatar = p2Avatar;
  S.settings = { deckSize: 13, bestOf: 1, tieRule: 'carry', direction: 'high', winCondition: 'most', timeLimit: 0, stakes: '' };
  S.totalRounds = 13;
  S.scriptedAI = null;
  S.prizes = shuffle(Array.from({ length: 13 }, (_, i) => i + 1));
  setupGame();
}

// Ghost mode: AI replays your best previous solo game's bids.
export function startGhost() {
  const g = getGhost();
  if (!g) return false;
  S.vsAI = true; S.isHost = true; S.mode = 'solo'; S.currentMode = 'ghost';
  S.myName = $('name-input').value.trim() || 'You';
  S.theirName = 'Ghost (your best)'; S.theirAvatar = '👻';
  S.settings = { deckSize: g.deckSize, bestOf: 1, tieRule: 'carry', direction: 'high', winCondition: 'most', timeLimit: 0, stakes: '' };
  S.totalRounds = g.deckSize;
  // Use ghost's prize sequence and bids as scripted AI
  S.prizes = g.prizes.slice();
  S.scriptedAI = g.bids.slice();
  setupGame();
  return true;
}

// Tutorial
let tutStep = 0;
export function startTutorial(onDone) {
  tutStep = 0;
  $('tutorial').hidden = false;
  renderTutorialStep();
  const next = $('tut-next');
  const skip = $('tut-skip');
  const advance = () => {
    tutStep++;
    if (tutStep >= TUTORIAL_STEPS.length) {
      $('tutorial').hidden = true;
      unlockAch('tutorial');
      $('ai-diff').value = 'easy';
      $('ai-persona').value = 'balanced';
      $('ai-deck').value = '7';
      onDone();
    } else renderTutorialStep();
  };
  next.onclick = advance;
  skip.onclick = () => { $('tutorial').hidden = true; };
}
function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutStep];
  $('tut-title').textContent = step.title;
  $('tut-text').textContent = step.text;
  $('tut-step').textContent = `Step ${tutStep + 1} of ${TUTORIAL_STEPS.length}`;
  const dots = $('tut-dots'); dots.innerHTML = '';
  for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
    const d = document.createElement('div');
    d.className = 'tut-dot' + (i <= tutStep ? ' active' : '');
    dots.appendChild(d);
  }
  $('tut-next').textContent = tutStep === TUTORIAL_STEPS.length - 1 ? 'Start playing' : 'Next';
}
