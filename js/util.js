// Generic helpers — no game-specific knowledge.

export const $ = id => document.getElementById(id);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const show = el => (typeof el === 'string' ? $(el) : el)?.removeAttribute('hidden');
export const hide = el => (typeof el === 'string' ? $(el) : el)?.setAttribute('hidden', '');

export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deterministic shuffle for daily/seeded games.
export function seededShuffle(arr, seed) {
  const a = arr.slice();
  let s = seed >>> 0;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function genCode(len = 5) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dailySeed(d = new Date()) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  }
  // Fallback
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch { return false; }
}

// On-screen confirm dialog (replaces window.confirm with the page's aesthetic).
export function confirmDialog({ title, message, confirm = 'Confirm', cancel = 'Cancel', danger = false }) {
  return new Promise(resolve => {
    const scrim = $('modal-confirm');
    $('confirm-title').textContent = title;
    $('confirm-msg').textContent = message;
    const yes = $('confirm-yes');
    const no = $('confirm-no');
    yes.textContent = confirm; no.textContent = cancel;
    yes.classList.toggle('btn-primary', !danger);
    yes.classList.toggle('btn-ghost', danger);
    if (danger) yes.style.color = 'var(--lose)'; else yes.style.color = '';
    const close = result => {
      hide(scrim);
      yes.removeEventListener('click', onYes);
      no.removeEventListener('click', onNo);
      scrim.removeEventListener('click', onScrim);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onYes = () => close(true);
    const onNo = () => close(false);
    const onScrim = e => { if (e.target === scrim) close(false); };
    const onKey = e => { if (e.key === 'Escape') close(false); if (e.key === 'Enter') close(true); };
    yes.addEventListener('click', onYes);
    no.addEventListener('click', onNo);
    scrim.addEventListener('click', onScrim);
    document.addEventListener('keydown', onKey);
    show(scrim);
    yes.focus();
  });
}

// Debounce — used to avoid thrashing localStorage during fast typing.
export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Robust deep-clone (used for ghost replays & state snapshots).
export const clone = v => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
