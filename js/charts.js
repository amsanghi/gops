// Small canvas-based chart helpers — heatmap + score curve. No deps.

import { rankText } from './constants.js';

// Draw a 13x13 heatmap. data[prizeRank-1][bidValue-1] = count.
export function drawHeatmap(canvas, data, opts = {}) {
  if (!canvas || !data) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const padL = 30, padB = 26, padR = 8, padT = 12;
  const cw = (w - padL - padR) / 13;
  const ch = (h - padT - padB) / 13;

  // Find max for normalization
  let max = 0;
  for (const row of data) for (const v of row) if (v > max) max = v;
  if (max === 0) max = 1;

  const root = getComputedStyle(document.documentElement);
  const ink = root.getPropertyValue('--ink').trim();
  const dim = root.getPropertyValue('--ink-faint').trim();
  const accent = root.getPropertyValue('--brass-lit').trim() || root.getPropertyValue('--me').trim();

  // Cells
  for (let r = 0; r < 13; r++) {
    for (let c = 0; c < 13; c++) {
      const v = data[r][c] / max;
      ctx.fillStyle = mix(accent, 'transparent', v);
      ctx.fillRect(padL + c * cw, padT + (12 - r) * ch, cw - 1, ch - 1);
    }
  }

  // Axis labels
  ctx.fillStyle = dim;
  ctx.font = '10px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < 13; r++) {
    const y = padT + (12 - r) * ch + ch / 2;
    ctx.fillText(rankText(r + 1, 13), 6, y);
  }
  ctx.textAlign = 'center';
  for (let c = 0; c < 13; c++) {
    const x = padL + c * cw + cw / 2;
    ctx.fillText(rankText(c + 1, 13), x, h - padB + 14);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = ink;
  ctx.font = '11px Jost, system-ui';
  ctx.fillText('prize', 2, padT - 2);
  ctx.fillText('bid →', padL, h - 2);
}

// Score over rounds curve.
// history = [{winner, prizeValue, ...}]
export function drawScoreCurve(canvas, history, theirName = 'Them', myName = 'You') {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  if (!history || !history.length) return;

  const root = getComputedStyle(document.documentElement);
  const ink = root.getPropertyValue('--ink').trim();
  const dim = root.getPropertyValue('--ink-faint').trim();
  const accent = root.getPropertyValue('--me').trim();
  const opp = root.getPropertyValue('--opp').trim();

  const padL = 30, padR = 12, padT = 14, padB = 18;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const me = [0], them = [0];
  for (const r of history) {
    if (r.winner === 'me') { me.push(me[me.length - 1] + r.prizeValue); them.push(them[them.length - 1]); }
    else if (r.winner === 'them') { them.push(them[them.length - 1] + r.prizeValue); me.push(me[me.length - 1]); }
    else { me.push(me[me.length - 1]); them.push(them[them.length - 1]); }
  }
  const max = Math.max(me[me.length - 1], them[them.length - 1], 1);
  const n = me.length;

  // Axes
  ctx.strokeStyle = dim; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH); ctx.stroke();

  // Ticks
  ctx.fillStyle = dim; ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const v = Math.round((max * i) / 4);
    const y = padT + plotH - (i / 4) * plotH;
    ctx.fillText(String(v), padL - 4, y);
  }

  // Curves
  function curve(arr, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = padL + (i / (n - 1 || 1)) * plotW;
      const y = padT + plotH - (arr[i] / max) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  curve(them, opp);
  curve(me, accent);

  // Labels
  ctx.fillStyle = accent; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = '11px Jost, system-ui';
  ctx.fillText(myName, padL, 0);
  ctx.fillStyle = opp; ctx.textAlign = 'right';
  ctx.fillText(theirName, padL + plotW, 0);
}

// "color mix" via canvas globalAlpha trick — accept hex/rgb accent and produce a fade.
function mix(accent, _bg, t) {
  if (!accent) return `rgba(255,255,255,${t * 0.6})`;
  // Parse #rrggbb or rgb()
  const m1 = /^#?([0-9a-f]{6})$/i.exec(accent.trim());
  let r = 244, g = 244, b = 245;
  if (m1) {
    const v = parseInt(m1[1], 16);
    r = (v >> 16) & 255; g = (v >> 8) & 255; b = v & 255;
  } else {
    const m2 = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(accent.trim());
    if (m2) { r = +m2[1]; g = +m2[2]; b = +m2[3]; }
  }
  return `rgba(${r},${g},${b},${Math.max(0.04, t * 0.85)})`;
}
