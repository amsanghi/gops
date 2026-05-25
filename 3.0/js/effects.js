// Audio, haptics, confetti, floating reactions.

import { S } from './state.js';
import { $ } from './util.js';

// ---- Audio ----
let audioCtx = null;
function ensureCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function beep(freq, dur, type = 'sine', vol = 0.06) {
  if (!S.sound) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  } catch { /* */ }
}

export const sfx = {
  pick:    () => beep(440, 0.07, 'triangle', 0.05),
  confirm: () => { beep(660, 0.05, 'triangle'); setTimeout(() => beep(880, 0.07, 'triangle'), 45); },
  reveal:  () => beep(330, 0.10, 'sine', 0.045),
  win:     () => { beep(523, 0.09, 'triangle'); setTimeout(() => beep(659, 0.09, 'triangle'), 75); setTimeout(() => beep(784, 0.13, 'triangle'), 150); },
  lose:    () => { beep(330, 0.13, 'sawtooth'); setTimeout(() => beep(220, 0.18, 'sawtooth'), 90); },
  tie:     () => { beep(440, 0.07, 'square', 0.045); setTimeout(() => beep(440, 0.07, 'square', 0.045), 90); },
  endWin:  () => { beep(523, 0.10); setTimeout(() => beep(659, 0.10), 90); setTimeout(() => beep(784, 0.10), 180); setTimeout(() => beep(1047, 0.28), 270); },
  endLose: () => { beep(440, 0.13, 'sawtooth'); setTimeout(() => beep(330, 0.18, 'sawtooth'), 140); setTimeout(() => beep(220, 0.28, 'sawtooth'), 320); },
  reaction:() => beep(880, 0.06, 'triangle', 0.04),
  tick:    () => beep(660, 0.04, 'square', 0.03),
};

// ---- Haptics ----
export function haptic(pattern) {
  if (!S.haptics) return;
  if ('vibrate' in navigator) {
    try { navigator.vibrate(pattern); } catch { /* */ }
  }
}

// ---- Confetti ----
export function fireConfetti(opts = {}) {
  const canvas = $('confetti-canvas');
  if (!canvas) return;
  canvas.hidden = false;
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.hidden = true; return; }
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  ctx.scale(dpr, dpr);

  const root = getComputedStyle(document.documentElement);
  const accent = root.getPropertyValue('--me').trim() || '#f5f5f5';
  const gold = root.getPropertyValue('--gold').trim() || '#f5d062';
  const ink = root.getPropertyValue('--ink').trim() || '#fff';
  const opp = root.getPropertyValue('--opp').trim() || '#a1a1aa';
  const colors = [accent, accent, gold, ink, opp];

  const count = opts.count || 140;
  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: innerWidth * (0.3 + Math.random() * 0.4),
      y: innerHeight * 0.4,
      vx: (Math.random() - 0.5) * 18,
      vy: -Math.random() * 18 - 8,
      g: 0.55,
      size: Math.random() * 9 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      life: 1,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    });
  }

  function frame() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = false;
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.99;
      p.rot += p.vr; p.life -= 0.0065;
      if (p.life > 0 && p.y < innerHeight + 50) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      else { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    if (alive) requestAnimationFrame(frame);
    else canvas.hidden = true;
  }
  requestAnimationFrame(frame);
}

// ---- Floating reaction ----
export function floatReaction(emoji, fromOpponent = false) {
  const el = document.createElement('div');
  el.className = 'react-float';
  el.textContent = emoji;
  el.style.left = fromOpponent ? '30%' : '70%';
  el.style.top = '45%';
  document.body.appendChild(el);
  if (fromOpponent) { sfx.reaction(); haptic([15]); }
  setTimeout(() => el.remove(), 2400);
}
