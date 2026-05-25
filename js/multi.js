// PeerJS multiplayer wiring. PeerJS is lazy-loaded so single-player users
// don't pay the bandwidth/parse cost.

import { S } from './state.js';
import { $, show, hide, shuffle } from './util.js';
import { PROTO_VERSION, PEER_PREFIX } from './constants.js';
import { setupGame, receiveTheirPick, setNetSender } from './game.js';
import { sfx, floatReaction, haptic } from './effects.js';
import { savePrefs, saveMultiSession, clearMultiSession } from './storage.js';

let PeerLib = null;
async function loadPeerJS() {
  if (PeerLib) return PeerLib;
  // Load on demand from a stable CDN (works on github.io with no build).
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load PeerJS'));
    document.head.appendChild(s);
  });
  PeerLib = window.Peer;
  return PeerLib;
}

setNetSender(msg => {
  if (S.conn && S.conn.open) {
    try { S.conn.send(msg); } catch (e) { console.error('send failed', e); }
  }
});

let onLobbyError = () => {};
let onReturnToLobby = () => {};
let onGameStart = () => {};
let onChatBadge = () => {};
let onChatMessage = () => {};

export function configureMulti(opts) {
  onLobbyError = opts.onLobbyError || onLobbyError;
  onReturnToLobby = opts.onReturnToLobby || onReturnToLobby;
  onGameStart = opts.onGameStart || onGameStart;
  onChatBadge = opts.onChatBadge || onChatBadge;
  onChatMessage = opts.onChatMessage || onChatMessage;
}

export async function startHost({ rejoinExisting = false } = {}) {
  S.isHost = true; S.vsAI = false; S.mode = 'host'; S.currentMode = 'multi';
  if (!rejoinExisting) {
    S.myName = $('name-input').value.trim() || 'Player 1';
    // Pull host settings (fresh game)
    S.settings.deckSize = parseInt($('host-deck').value, 10);
    S.settings.bestOf = Math.max(1, Math.min(99, parseInt($('host-bestof').value, 10) || 1));
    S.settings.tieRule = $('host-tie').value;
    S.settings.direction = $('host-dir').value;
    S.settings.winCondition = $('host-goal').value;
    S.settings.timeLimit = Math.max(0, parseInt($('host-time').value, 10) || 0);
    S.settings.stakes = $('host-stakes').value.trim();
    S.settings.powerCards = $('host-power')?.checked || false;
    S.totalRounds = S.settings.deckSize;
  }
  // When rejoining, S.settings / S.totalRounds / S.prizes / etc are already loaded from saved snap.
  savePrefs({
    lastHost: {
      deck: $('host-deck').value, tie: $('host-tie').value,
      dir: $('host-dir').value, goal: $('host-goal').value,
      time: $('host-time').value,
    }
  });

  hide('lobby-default'); show('host-info'); $('lobby-err').textContent = '';
  const customCode = ($('host-code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const code = customCode || randomCode();
  S.roomCode = code;
  $('my-code').textContent = code;
  $('my-code').onclick = async () => {
    if (await navigatorCopy(code)) {
      $('my-code').textContent = 'COPIED';
      setTimeout(() => { $('my-code').textContent = code; }, 900);
    }
  };

  let Peer;
  try { Peer = await loadPeerJS(); }
  catch (e) {
    $('lobby-err').textContent = 'Could not load multiplayer. Check your connection.';
    hide('host-info'); show('lobby-default');
    return;
  }
  try {
    S.peer = new Peer(PEER_PREFIX + code);
  } catch (e) {
    onLobbyError('Failed to initialize peer.');
    hide('host-info'); show('lobby-default'); return;
  }
  S.peer.on('open', () => {
    $('host-status').innerHTML = '<span class="dot"></span>Waiting for them to join…';
    saveMultiSession({ mode: 'duel', role: 'host', code, name: S.myName, avatar: S.myAvatar });
  });
  S.peer.on('connection', c => {
    if (S.conn && S.conn.open) { c.close(); return; }
    S.conn = c;
    bindConn();
    S.conn.on('open', () => S.conn.send({ type: 'hello', version: PROTO_VERSION, name: S.myName, avatar: S.myAvatar }));
  });
  S.peer.on('error', err => {
    if (err.type === 'unavailable-id') {
      try { S.peer.destroy(); } catch {}
      S.peer = null;
      hide('host-info'); show('lobby-default');
      $('lobby-err').textContent = 'Code already in use, try another.';
    } else {
      $('lobby-err').textContent = 'Connection error: ' + err.type;
    }
  });
}

export async function joinGame() {
  const code = ($('join-code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return;
  S.isHost = false; S.vsAI = false; S.mode = 'joiner'; S.currentMode = 'multi';
  S.roomCode = code;
  S.myName = $('name-input').value.trim() || 'Player 2';

  hide('lobby-default'); show('join-info');
  $('lobby-err').textContent = '';
  $('join-status').innerHTML = '<span class="dot"></span>Connecting…';

  let Peer;
  try { Peer = await loadPeerJS(); }
  catch {
    $('lobby-err').textContent = 'Could not load multiplayer. Check your connection.';
    hide('join-info'); show('lobby-default');
    return;
  }
  try {
    S.peer = new Peer();
  } catch (e) {
    $('lobby-err').textContent = 'Failed to initialize peer.';
    hide('join-info'); show('lobby-default'); return;
  }
  S.peer.on('open', () => {
    S.conn = S.peer.connect(PEER_PREFIX + code, { reliable: true });
    bindConn();
    S.conn.on('open', () => {
      $('join-status').innerHTML = '<span class="dot"></span>Connected. Saying hello…';
      saveMultiSession({ mode: 'duel', role: 'joiner', code, name: S.myName, avatar: S.myAvatar });
      S.conn.send({ type: 'hello', version: PROTO_VERSION, name: S.myName, avatar: S.myAvatar });
    });
  });
  S.peer.on('error', err => {
    $('lobby-err').textContent = err.type === 'peer-unavailable'
      ? `No game found with code "${code}".`
      : 'Connection error: ' + err.type;
    hide('join-info'); show('lobby-default');
  });
}

function bindConn() {
  S.conn.on('data', handleMsg);
  S.conn.on('close', () => {
    if (document.getElementById('game').hidden === false) {
      const m = document.getElementById('message'); if (m) m.textContent = 'Disconnected.';
    }
    $('lobby-err').textContent = 'Connection lost.';
  });
  S.conn.on('error', err => {
    $('lobby-err').textContent = 'Error: ' + (err.type || err.message || 'unknown');
  });
}

function handleMsg(data) {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'hello') {
    S.theirName = data.name || 'Opponent';
    S.theirAvatar = data.avatar || '🎭';
    if (S.isHost) {
      // If we (host) have a mid-game snapshot for this same room, resume from it
      // instead of starting a new match.
      if (S.currentMode === 'multi' && S.prizes?.length && S.round < S.totalRounds && S.history) {
        // Reconnect mid-game — send authoritative state to joiner
        S.conn.send({
          type: 'resume',
          prizes: S.prizes, settings: S.settings, stakes: S.settings.stakes,
          round: S.round, myScore: S.theirScore, theirScore: S.myScore, // swap! their POV
          myHand: S.theirHand, theirHand: S.myHand,
          theirUsedCards: [...new Set(S.history.map(h => h.mine))],
          pot: S.pot, history: S.history,
          myGames: S.theirGames, theirGames: S.myGames,
        });
        // Don't begin a new match — we're resuming this one
        return;
      }
      beginHostedMatch();
    }
  } else if (data.type === 'start') {
    S.prizes = data.prizes;
    S.settings = data.settings;
    S.totalRounds = S.settings.deckSize;
    S.theirStakes = data.stakes || '';
    setupGame();
    onGameStart();
  } else if (data.type === 'resume') {
    // Apply host-authoritative mid-game state and jump into the game UI at the saved round.
    S.prizes = data.prizes;
    S.settings = data.settings;
    S.totalRounds = S.settings.deckSize;
    S.theirStakes = data.stakes || '';
    S.round = data.round;
    S.myScore = data.myScore; S.theirScore = data.theirScore;
    S.myHand = data.myHand; S.theirHand = data.theirHand;
    S.theirUsedCards = data.theirUsedCards || [];
    S.pot = data.pot || 0;
    S.history = data.history || [];
    S.myGames = data.myGames || 0;
    S.theirGames = data.theirGames || 0;
    S.myPick = null; S.theirPick = null; S.pendingPick = null; S.busy = false;
    import('./game.js').then(g => { g.attachAndResume(); });
    onGameStart();
  } else if (data.type === 'pick') {
    receiveTheirPick(data.card);
  } else if (data.type === 'rematch') {
    S.theirRematch = true;
    checkRematch();
  } else if (data.type === 'reaction') {
    floatReaction(data.emoji, true);
  } else if (data.type === 'chat') {
    S.chatMsgs.push({ from: 'them', text: String(data.text || '').slice(0, 200), t: Date.now() });
    onChatMessage();
    if (document.getElementById('chat').hidden) onChatBadge(true);
    haptic([20]);
  } else if (data.type === 'quit') {
    $('lobby-err').textContent = `${S.theirName} left the game.`;
    cleanup();
    onReturnToLobby();
  }
}

export function beginHostedMatch() {
  const size = S.settings.deckSize;
  S.prizes = shuffle(Array.from({ length: size }, (_, i) => i + 1));
  S.conn.send({ type: 'start', prizes: S.prizes, settings: S.settings, stakes: S.settings.stakes });
  setupGame();
  onGameStart();
}

export function sendQuit() {
  if (S.conn && S.conn.open) try { S.conn.send({ type: 'quit' }); } catch {}
}

export function cleanup() {
  try { S.conn?.close(); } catch {}
  try { S.peer?.destroy(); } catch {}
  S.conn = null; S.peer = null;
  S.vsAI = false; S.isHost = false; S.mode = null;
}

// Called by Quit button — intentional exit clears the rejoin session.
export function cleanupIntentional() {
  clearMultiSession();
  cleanup();
}

let checkRematchFn = () => {};
export function setRematchHook(fn) { checkRematchFn = fn; }
function checkRematch() { checkRematchFn(); }

// Helpers
function randomCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}
async function navigatorCopy(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
}
