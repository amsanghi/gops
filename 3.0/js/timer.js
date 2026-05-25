// Per-bid countdown timer.

import { S } from './state.js';
import { $, hide, show } from './util.js';
import { sfx } from './effects.js';

let onExpire = null;

export function setTimerExpireCallback(fn) { onExpire = fn; }

export function startTimer() {
  clearTimer();
  if (!S.settings.timeLimit || S.settings.timeLimit <= 0) {
    hide('timer'); $('timer-text').textContent = ''; return;
  }
  S.timerDuration = S.settings.timeLimit * 1000;
  S.timerStart = Date.now();
  show('timer');
  tick();
  S.timerId = setInterval(tick, 100);
}

function tick() {
  const elapsed = Date.now() - S.timerStart;
  const remaining = Math.max(0, S.timerDuration - elapsed);
  const sec = Math.ceil(remaining / 1000);
  const pct = (remaining / S.timerDuration) * 100;
  const bar = $('timer-bar');
  const txt = $('timer-text');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = sec + 's';
  bar?.classList.remove('warn', 'urgent');
  txt?.classList.remove('urgent');
  if (remaining < 5000) {
    bar?.classList.add('urgent');
    txt?.classList.add('urgent');
    if (sec !== S.lastTickSec) { sfx.tick(); S.lastTickSec = sec; }
  } else if (remaining < 10000) {
    bar?.classList.add('warn');
  }
  if (remaining <= 0) {
    clearTimer();
    if (S.myPick === null && typeof onExpire === 'function') onExpire();
  }
}

export function clearTimer() {
  if (S.timerId) clearInterval(S.timerId);
  S.timerId = null;
  S.lastTickSec = null;
  hide('timer');
}

// Pause/resume on tab visibility change — preserves remaining time.
document.addEventListener('visibilitychange', () => {
  if (!S.settings?.timeLimit || S.settings.timeLimit <= 0) return;
  if (document.hidden) {
    if (S.timerId) {
      clearInterval(S.timerId); S.timerId = null;
      S._pausedRemaining = Math.max(0, S.timerDuration - (Date.now() - S.timerStart));
    }
  } else if (S._pausedRemaining !== undefined && S._pausedRemaining > 0 && S.myPick === null && !document.getElementById('game').hidden) {
    S.timerDuration = S._pausedRemaining;
    S.timerStart = Date.now();
    delete S._pausedRemaining;
    S.timerId = setInterval(tick, 100);
  }
});
