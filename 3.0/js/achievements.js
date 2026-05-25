// Achievement unlocking & toast notifications.

import { ACHIEVEMENTS } from './constants.js';
import { getAchievements, unlockAchRaw } from './storage.js';
import { S } from './state.js';
import { escapeHtml } from './util.js';
import { haptic } from './effects.js';

export function unlockAch(id) {
  if (!unlockAchRaw(id)) return false;
  const ach = ACHIEVEMENTS.find(a => a.id === id);
  if (ach) showToast(ach);
  return true;
}

function showToast(ach) {
  const toast = document.createElement('div');
  toast.className = 'ach-toast';
  toast.setAttribute('role', 'status');
  toast.innerHTML = `<span class="icon">${ach.icon}</span><div><div class="label">Achievement</div><div class="title">${escapeHtml(ach.title)}</div></div>`;
  document.body.appendChild(toast);
  haptic([60, 30, 60]);
  setTimeout(() => { toast.style.transition = 'opacity 0.5s'; toast.style.opacity = '0'; }, 2800);
  setTimeout(() => toast.remove(), 3400);
}

// Per-bid check (called from game.js after a round resolves).
export function checkAchOnBid({ wonRound, confirmMs }) {
  if ((S.myPick === 1 || S.myPick === 2) && wonRound) unlockAch('bluff_win');
  if (confirmMs && confirmMs < 2000) unlockAch('speed');
  if (S.myPick === 13 && S.round >= 10) unlockAch('hoarder');
}

// Per-game check.
export function checkAchOnGameEnd({ didIWin, allRoundsWon, maxDeficit, seriesOver }) {
  unlockAch('first_game');
  if (didIWin) unlockAch('first_win');
  if (didIWin && allRoundsWon) unlockAch('perfect');
  if (didIWin && maxDeficit >= 30) unlockAch('comeback');
  if (didIWin && S.settings.tieRule === 'burn') unlockAch('burn');
  if (didIWin && (S.settings.direction === 'low' || S.settings.winCondition === 'fewest')) unlockAch('reverse');
  if (didIWin && S.settings.stakes) unlockAch('stakes');
  if (didIWin && S.myScore >= 60) unlockAch('high_score');
  if (didIWin && S.currentMode === 'hotseat') unlockAch('hotseat');
  if (didIWin && S.currentMode === 'ghost') unlockAch('ghost_beat');
  if (!S.vsAI && didIWin && !S.isHost) unlockAch('underdog');
  if (didIWin && S.vsAI && S.currentMode === 'solo' && (document.getElementById('ai-diff')?.value === 'hard')) unlockAch('ai_hard');
  if (seriesOver && S.settings.bestOf >= 7 && S.myGames !== S.theirGames) unlockAch('marathon');
}

export function checkThemeAch() {
  if (S.themesTried.size >= 6) unlockAch('theme');
}
