// N-player multiplayer (2..8 players).
// Star topology: host is authoritative, joiners send picks to host,
// host resolves and broadcasts state to everyone.
//
// Voice/video chat uses PeerJS .call() between every pair (mesh for media only).
//
// Messages (over data conn):
//   hello       {name, avatar, version}           joiner → host  (initial)
//   roster      {players: [{id, name, avatar}]}    host → all     (broadcast on changes)
//   start       {prizes, settings, players}        host → all     (game begins)
//   pick        {round, card}                      joiner → host
//   reveal      {round, picks: {id: card}, scores, history, winnerId, prizeValue}   host → all
//   end         {scores, history}                  host → all
//   rematch     {}                                 joiner → host (or host → all to confirm)
//   chat        {text}                             anyone → host → all
//   reaction    {emoji}                            anyone → host → all
//   quit        {}                                 anyone

import { S } from './state.js';
import { $, $$, show, hide, shuffle } from './util.js';
import { PROTO_VERSION, PEER_PREFIX } from './constants.js';
import { PEER_CONFIG } from './multi.js';
import { sfx, haptic, fireConfetti, floatReaction } from './effects.js';
import { makeCard, renderHand } from './render.js';
import { startTimer, clearTimer, setTimerExpireCallback } from './timer.js';
import { saveMultiSession, clearMultiSession } from './storage.js';

const HOST_ID_PREFIX = PEER_PREFIX + 'PARTY-';

let PeerLib = null;
async function loadPeerJS() {
  if (window.Peer) { PeerLib = window.Peer; return PeerLib; }
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    s.onload = res; s.onerror = () => rej(new Error('Failed to load PeerJS'));
    document.head.appendChild(s);
  });
  PeerLib = window.Peer;
  return PeerLib;
}

// ---- Public API ----
let onError = () => {};
let onReturnToLobby = () => {};
export function configureMultiN(opts) {
  onError = opts.onError || onError;
  onReturnToLobby = opts.onReturnToLobby || onReturnToLobby;
}

export async function startPartyHost() {
  S.isHost = true; S.vsAI = false; S.mode = 'host'; S.currentMode = 'multi-n';
  S.gameStarted = false;
  S.myName = $('name-input').value.trim() || 'Host';
  S.conns = new Map();
  S.mediaConns = new Map();
  S.remoteStreams = new Map();
  const customCode = ($('host-code')?.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const code = customCode || randomCode();
  S.roomCode = code;
  S.myId = code; // host id is the room code
  S.hostId = S.myId;
  S.players = [{ id: S.myId, name: S.myName, avatar: S.myAvatar, score: 0, hand: [], pick: null, used: [], spectator: false, connected: true }];

  hide('lobby-default');
  showPartyLobby();

  let Peer;
  try { Peer = await loadPeerJS(); }
  catch { onError('Could not load multiplayer.'); hideParty(); return; }

  try { S.peer = new Peer(HOST_ID_PREFIX + code, PEER_CONFIG); }
  catch { onError('Failed to init peer.'); hideParty(); return; }

  S.peer.on('open', () => {
    updatePartyStatus(`Room ${code} — waiting for players...`);
    saveMultiSession({ mode: 'party', role: 'host', code, name: S.myName, avatar: S.myAvatar });
  });
  S.peer.on('connection', c => acceptConnection(c));
  S.peer.on('call', call => handleIncomingCall(call));
  S.peer.on('error', err => {
    if (err.type === 'unavailable-id') {
      try { S.peer.destroy(); } catch {}
      S.peer = null; hideParty();
      onError('Code already in use, try another.');
    } else onError('Conn error: ' + err.type);
  });
}

export async function joinPartyRoom(code) {
  code = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return;
  S.isHost = false; S.vsAI = false; S.mode = 'joiner'; S.currentMode = 'multi-n';
  S.gameStarted = false;
  S.myName = $('name-input').value.trim() || 'Player';
  S.roomCode = code;
  S.players = [];
  S.mediaConns = new Map();
  S.remoteStreams = new Map();

  hide('lobby-default');
  showPartyLobby();
  updatePartyStatus('Connecting...');

  let Peer;
  try { Peer = await loadPeerJS(); }
  catch { onError('Could not load multiplayer.'); hideParty(); return; }

  try { S.peer = new Peer(undefined, PEER_CONFIG); }
  catch { onError('Failed to init peer.'); hideParty(); return; }

  S.peer.on('open', myId => {
    S.myId = myId;
    S.conn = S.peer.connect(HOST_ID_PREFIX + code, { reliable: true });
    bindJoinerConn();
    saveMultiSession({ mode: 'party', role: 'joiner', code, name: S.myName, avatar: S.myAvatar });
  });
  S.peer.on('call', call => handleIncomingCall(call));
  S.peer.on('error', err => {
    onError(err.type === 'peer-unavailable' ? `No party with code "${code}".` : 'Conn error: ' + err.type);
    hideParty();
  });
}

// ---- Host: accept new player ----
function acceptConnection(c) {
  c.on('open', () => {
    // We'll receive their hello which assigns identity
  });
  c.on('data', msg => onHostMessage(c, msg));
  c.on('close', () => {
    const id = [...S.conns.entries()].find(([, conn]) => conn === c)?.[0];
    if (id) {
      S.conns.delete(id);
      const p = S.players.find(p => p.id === id);
      if (p) p.connected = false;
      broadcastRoster();
      renderPartyLobby();
    }
  });
  c.on('error', () => {});
}

function onHostMessage(c, data) {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'hello') {
    const id = c.peer || data.id || Math.random().toString(36).slice(2);
    S.conns.set(id, c);
    if (!S.players.find(p => p.id === id)) {
      S.players.push({
        id,
        name: (data.name || 'Player').slice(0, 14),
        avatar: data.avatar || '🎭',
        score: 0,
        hand: [],
        pick: null,
        used: [],
        spectator: S.gameStarted, // late joiners become spectators
        connected: true,
      });
    }
    // Send back identity confirmation + current roster + game state if started
    c.send({ type: 'welcome', yourId: id, hostId: S.myId, players: stripPlayers() });
    broadcastRoster();
    renderPartyLobby();
    if (S.gameStarted) {
      // Spectator: send current game state
      c.send({ type: 'start', prizes: S.prizes, settings: S.settings, players: stripPlayers(), spectator: true, round: S.round });
    }
  } else if (data.type === 'pick') {
    const id = [...S.conns.entries()].find(([, conn]) => conn === c)?.[0];
    if (!id) return;
    const p = S.players.find(p => p.id === id);
    if (!p || p.spectator) return;
    if (p.pick != null) return;
    if (!p.hand.includes(data.card)) return;
    p.pick = data.card;
    broadcastPicksStatus();
    maybeResolveRoundHost();
  } else if (data.type === 'chat') {
    relayChat(c, data);
  } else if (data.type === 'reaction') {
    relayReaction(c, data);
  } else if (data.type === 'rematch-vote') {
    const id = [...S.conns.entries()].find(([, conn]) => conn === c)?.[0];
    const p = S.players.find(p => p.id === id);
    if (p) p.rematchVote = true;
    maybeStartRematch();
  } else if (data.type === 'quit') {
    const id = [...S.conns.entries()].find(([, conn]) => conn === c)?.[0];
    if (id) {
      S.conns.delete(id);
      const p = S.players.find(p => p.id === id);
      if (p) p.connected = false;
      broadcastRoster();
      renderPartyLobby();
    }
  }
}

// ---- Joiner: handle host messages ----
function bindJoinerConn() {
  S.conn.on('open', () => {
    updatePartyStatus('Saying hello...');
    S.conn.send({ type: 'hello', version: PROTO_VERSION, name: S.myName, avatar: S.myAvatar });
  });
  S.conn.on('data', data => {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'welcome') {
      S.myId = data.yourId;
      S.hostId = data.hostId;
      S.players = data.players;
      updatePartyStatus('In the lobby. Waiting for host to start...');
      renderPartyLobby();
    } else if (data.type === 'roster') {
      S.players = data.players;
      renderPartyLobby();
    } else if (data.type === 'start') {
      S.prizes = data.prizes;
      S.settings = data.settings;
      S.players = data.players;
      S.round = data.round || 0;
      const myP = S.players.find(p => p.id === S.myId);
      if (myP) {
        // If spectator, hand is empty; otherwise host initialized it
        S.myHand = myP.hand.slice();
        S.players.forEach(p => { if (p.id !== S.myId) p.handLeft = p.hand.length; });
      }
      S.gameStarted = true;
      enterPartyGame();
    } else if (data.type === 'picks-status') {
      data.lockedIds.forEach(id => {
        const p = S.players.find(p => p.id === id);
        if (p) p.locked = true;
      });
      renderPartyBids();
    } else if (data.type === 'reveal') {
      data.picks && Object.entries(data.picks).forEach(([id, card]) => {
        const p = S.players.find(p => p.id === id);
        if (p) p.pick = card;
      });
      S.players.forEach(p => { p.score = data.scores[p.id] || 0; });
      S.history = data.history;
      renderPartyReveal(data);
    } else if (data.type === 'next-round') {
      S.round = data.round;
      S.players.forEach(p => { p.pick = null; p.locked = false; });
      const myP = S.players.find(p => p.id === S.myId);
      if (myP) S.myHand = myP.hand.slice();
      enterPartyRound();
    } else if (data.type === 'end') {
      S.players.forEach(p => { p.score = data.scores[p.id] || 0; });
      S.history = data.history;
      showPartyEnd();
    } else if (data.type === 'chat') {
      S.chatMsgs.push({ from: data.fromName, text: data.text, t: Date.now() });
      renderPartyChat();
      haptic([15]);
    } else if (data.type === 'reaction') {
      floatReaction(data.emoji, true);
    } else if (data.type === 'quit') {
      onError(`${data.name} left`);
    }
  });
  S.conn.on('close', () => onError('Disconnected from host.'));
  S.conn.on('error', err => onError('Error: ' + (err.type || err.message)));
}

// ---- Voice/video ----
// Auto-answer incoming calls. Exported so duel (multi.js) can register the same handler.
export function handleIncomingCall(call) {
  if (!S.localStream) { call.close(); return; }
  call.answer(S.localStream);
  call.on('stream', remoteStream => {
    S.remoteStreams = S.remoteStreams || new Map();
    S.remoteStreams.set(call.peer, remoteStream);
    renderRemoteStream(call.peer, remoteStream);
  });
  call.on('close', () => {
    S.remoteStreams?.delete(call.peer);
    const tile = document.querySelector(`[data-stream="${call.peer}"]`);
    if (tile) tile.remove();
  });
  S.mediaConns = S.mediaConns || new Map();
  S.mediaConns.set(call.peer, call);
}

export async function startMic(useVideo = false) {
  try {
    const constraints = useVideo ? { audio: true, video: { width: 320, height: 240 } } : { audio: true, video: false };
    S.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    S.micOn = true; S.camOn = useVideo;
    S.mediaConns = S.mediaConns || new Map();
    S.remoteStreams = S.remoteStreams || new Map();

    if (S.currentMode === 'multi-n') {
      // Party: call every other player
      for (const p of S.players) {
        if (p.id !== S.myId && p.connected) callPeer(p.id);
      }
    } else if (S.currentMode === 'multi' && S.conn) {
      // Duel: call the single remote peer
      callPeerDirect(S.conn.peer);
    }
    renderMediaControls();
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

function callPeer(id) {
  if (!S.peer || !S.localStream) return;
  const targetPeerId = (id === S.hostId && !S.isHost) ? HOST_ID_PREFIX + S.roomCode : id;
  callPeerDirect(targetPeerId, id);
}
function callPeerDirect(targetPeerId, trackId) {
  if (!S.peer || !S.localStream) return;
  const key = trackId || targetPeerId;
  const call = S.peer.call(targetPeerId, S.localStream);
  if (!call) return;
  call.on('stream', remoteStream => {
    S.remoteStreams.set(key, remoteStream);
    renderRemoteStream(key, remoteStream);
  });
  call.on('close', () => {
    S.remoteStreams.delete(key);
    const tile = document.querySelector(`[data-stream="${key}"]`);
    if (tile) tile.remove();
  });
  S.mediaConns.set(key, call);
}

export function stopMic() {
  S.localStream?.getTracks().forEach(t => t.stop());
  S.localStream = null;
  S.micOn = false; S.camOn = false;
  if (S.mediaConns) {
    for (const c of S.mediaConns.values()) try { c.close(); } catch {}
    S.mediaConns.clear();
  }
  S.remoteStreams?.clear();
  document.querySelectorAll('[data-stream]').forEach(el => el.remove());
  renderMediaControls();
}

// ---- Roster broadcast ----
function broadcastRoster() {
  const players = stripPlayers();
  for (const c of S.conns.values()) {
    try { c.send({ type: 'roster', players }); } catch {}
  }
}

function stripPlayers() {
  return S.players.map(p => ({
    id: p.id, name: p.name, avatar: p.avatar,
    score: p.score, hand: p.hand, spectator: p.spectator,
    connected: p.connected, pick: p.pick, locked: !!p.locked,
    handLeft: p.hand.length,
  }));
}

// ---- Game logic (host-authoritative) ----
export function startPartyGame() {
  if (!S.isHost) return;
  const players = S.players.filter(p => p.connected && !p.spectator);
  if (players.length < 2) { onError('Need at least 2 players'); return; }

  // Pull host settings
  const deckSize = parseInt($('host-deck').value, 10) || 13;
  S.settings = {
    deckSize,
    bestOf: 1,
    tieRule: $('host-tie').value || 'carry',
    direction: $('host-dir').value || 'high',
    winCondition: $('host-goal').value || 'most',
    timeLimit: Math.max(0, parseInt($('host-time').value, 10) || 0),
    stakes: $('host-stakes').value.trim() || '',
    powerCards: $('host-power')?.checked || false,
  };
  S.prizes = shuffle(Array.from({ length: deckSize }, (_, i) => i + 1));
  S.totalRounds = deckSize;
  S.round = 0;
  S.history = [];

  // Init hands
  for (const p of S.players) {
    if (!p.spectator) {
      p.hand = Array.from({ length: deckSize }, (_, i) => i + 1);
      if (S.settings.powerCards) p.hand.push(99);
    } else {
      p.hand = [];
    }
    p.score = 0;
    p.pick = null;
    p.used = [];
  }
  S.gameStarted = true;

  // Broadcast start to everyone
  for (const c of S.conns.values()) {
    try { c.send({ type: 'start', prizes: S.prizes, settings: S.settings, players: stripPlayers() }); } catch {}
  }
  // Self
  const me = S.players.find(p => p.id === S.myId);
  if (me) S.myHand = me.hand.slice();
  enterPartyGame();
}

function broadcastPicksStatus() {
  const lockedIds = S.players.filter(p => p.pick != null).map(p => p.id);
  for (const c of S.conns.values()) {
    try { c.send({ type: 'picks-status', lockedIds }); } catch {}
  }
  renderPartyBids();
}

function maybeResolveRoundHost() {
  const active = S.players.filter(p => !p.spectator && p.connected);
  if (active.some(p => p.pick == null)) return;
  // Resolve round
  const dir = S.settings.direction;
  const picks = {};
  active.forEach(p => { picks[p.id] = p.pick; });

  let bestVal, bestBidders = [];
  for (const p of active) {
    const v = (dir === 'low') ? -p.pick : p.pick;
    if (bestVal === undefined || v > bestVal) { bestVal = v; bestBidders = [p.id]; }
    else if (v === bestVal) bestBidders.push(p.id);
  }
  const prizeValue = S.prizes[S.round] + (S.pot || 0);
  let winnerId = null;
  if (bestBidders.length === 1) {
    winnerId = bestBidders[0];
    const w = S.players.find(p => p.id === winnerId);
    w.score += prizeValue;
    S.pot = 0;
  } else {
    // Tie at top
    if (S.settings.tieRule === 'burn') S.pot = 0;
    else if (S.settings.tieRule === 'split') {
      const split = Math.floor(prizeValue / bestBidders.length);
      bestBidders.forEach(id => {
        const p = S.players.find(p => p.id === id);
        p.score += split;
      });
      S.pot = 0;
    } else {
      // carry
      S.pot = prizeValue;
    }
  }
  // Remove played cards from hands
  active.forEach(p => {
    p.used.push(p.pick);
    p.hand = p.hand.filter(c => c !== p.pick);
  });

  const histEntry = { round: S.round + 1, prize: S.prizes[S.round], picks, prizeValue, winnerId };
  S.history.push(histEntry);
  const scores = Object.fromEntries(S.players.map(p => [p.id, p.score]));

  // Broadcast reveal
  for (const c of S.conns.values()) {
    try { c.send({ type: 'reveal', round: S.round, picks, scores, history: S.history, winnerId, prizeValue }); } catch {}
  }
  // Self
  renderPartyReveal({ picks, scores, history: S.history, winnerId, prizeValue });

  S.round++;
  setTimeout(() => {
    if (S.round >= S.totalRounds) {
      endPartyGame();
    } else {
      // Reset picks
      S.players.forEach(p => { p.pick = null; p.locked = false; });
      for (const c of S.conns.values()) {
        try { c.send({ type: 'next-round', round: S.round }); } catch {}
      }
      enterPartyRound();
    }
  }, 2400);
}

function endPartyGame() {
  const scores = Object.fromEntries(S.players.map(p => [p.id, p.score]));
  for (const c of S.conns.values()) {
    try { c.send({ type: 'end', scores, history: S.history }); } catch {}
  }
  showPartyEnd();
}

function maybeStartRematch() {
  const need = S.players.filter(p => p.connected && !p.spectator);
  if (need.every(p => p.rematchVote)) {
    need.forEach(p => { p.rematchVote = false; });
    startPartyGame();
  }
}

// ---- Chat / reactions relay ----
function relayChat(fromConn, data) {
  const id = [...S.conns.entries()].find(([, c]) => c === fromConn)?.[0];
  const p = S.players.find(p => p.id === id);
  const msg = { type: 'chat', fromName: p?.name || 'Anon', text: String(data.text || '').slice(0, 200) };
  S.chatMsgs.push({ from: msg.fromName, text: msg.text, t: Date.now() });
  for (const c of S.conns.values()) {
    if (c !== fromConn) try { c.send(msg); } catch {}
  }
  renderPartyChat();
}
function relayReaction(fromConn, data) {
  floatReaction(data.emoji, false);
  const msg = { type: 'reaction', emoji: data.emoji };
  for (const c of S.conns.values()) {
    if (c !== fromConn) try { c.send(msg); } catch {}
  }
}

// ---- Party lobby UI ----
function showPartyLobby() {
  const el = $('party-info');
  if (el) el.hidden = false;
  renderPartyLobby();
}
function hideParty() {
  const el = $('party-info');
  if (el) el.hidden = true;
  show('lobby-default');
}
function updatePartyStatus(text) {
  const el = $('party-status');
  if (el) el.innerHTML = `<span class="dot"></span>${text}`;
}
function renderPartyLobby() {
  const wrap = $('party-roster');
  if (!wrap) return;
  wrap.innerHTML = S.players.map(p => `
    <div class="party-row ${p.connected ? '' : 'offline'} ${p.spectator ? 'spectator' : ''}">
      <span class="av">${p.avatar}</span>
      <span class="nm">${p.name}${p.id === S.myId ? ' (you)' : ''}${p.id === S.hostId ? ' · host' : ''}</span>
      <span class="role">${p.spectator ? 'spectator' : 'player'}${!p.connected ? ' · offline' : ''}</span>
    </div>
  `).join('');
  // Show "Start" button only to host with >=2 players
  const startBtn = $('party-start-btn');
  const playerCount = S.players.filter(p => !p.spectator && p.connected).length;
  if (startBtn) {
    startBtn.hidden = !(S.isHost && !S.gameStarted);
    startBtn.disabled = playerCount < 2;
    startBtn.textContent = playerCount < 2 ? `Need ${2 - playerCount} more player${2 - playerCount === 1 ? '' : 's'}` : `Start game (${playerCount})`;
  }
  const codeDisplay = $('party-code');
  if (codeDisplay) codeDisplay.textContent = S.roomCode;
}

// ---- Party game UI ----
function enterPartyGame() {
  hide('lobby');
  show('game');
  document.body.classList.add('in-game', 'party');
  S.round = S.round || 0;
  enterPartyRound();
}

function enterPartyRound() {
  // Render party header (player scores)
  renderPartyHeader();
  // Prize
  const area = $('prize-area'); if (area) {
    area.innerHTML = '';
    area.appendChild(makeCard(S.prizes[S.round], 'prize'));
  }
  // My hand
  const me = S.players.find(p => p.id === S.myId);
  if (me) S.myHand = me.hand.slice();
  S.myPick = null; S.pendingPick = null;
  renderHand(selectCardN);
  // Bid placeholders
  renderPartyBids();
  // Confirm row
  $('confirm-row').innerHTML = '';
  // Round
  $('round-n').textContent = S.round + 1;
  $('round-tot').textContent = S.totalRounds;
  $('message').textContent = `Round ${S.round + 1} · ${S.players.filter(p => !p.spectator).length} players`;
  S.pickTime = Date.now();
  setTimerExpireCallback(() => autoBidN());
  startTimer();
}

function renderPartyHeader() {
  // Re-render the score area as multi-player roster
  const head = $('game-head');
  if (!head) return;
  const sortable = S.players.filter(p => !p.spectator).slice();
  // Sort by score desc for display
  sortable.sort((a, b) => b.score - a.score);
  head.innerHTML = `
    <div class="party-scores">
      ${sortable.map((p, i) => `
        <div class="party-score ${p.id === S.myId ? 'me' : ''}">
          <span class="rank">${i + 1}</span>
          <span class="av">${p.avatar}</span>
          <span class="nm">${p.name}</span>
          <span class="sc">${p.score}</span>
        </div>
      `).join('')}
    </div>
    <div class="game-center">
      <div class="round-pill">Round <b id="round-n">${S.round + 1}</b> / <b id="round-tot">${S.totalRounds}</b></div>
    </div>
  `;
}

function renderPartyBids() {
  const row = $('them-bid'); if (!row) return;
  row.innerHTML = '';
  const others = S.players.filter(p => !p.spectator && p.id !== S.myId);
  for (const p of others) {
    const slot = document.createElement('div');
    slot.className = 'party-bid-slot';
    if (p.pick != null) {
      slot.appendChild(makeCard(p.pick, 'opp mini'));
    } else if (p.locked) {
      slot.appendChild(makeCard('', 'face-down mini'));
    } else {
      const ph = document.createElement('div');
      ph.className = 'card mini';
      ph.style.opacity = '0.3';
      ph.textContent = '?';
      slot.appendChild(ph);
    }
    const label = document.createElement('div');
    label.className = 'party-bid-label';
    label.textContent = p.name;
    slot.appendChild(label);
    row.appendChild(slot);
  }
  // My bid
  const me = $('me-bid');
  if (me) {
    me.innerHTML = '';
    if (S.myPick != null) me.appendChild(makeCard(S.myPick, 'played'));
  }
}

function renderPartyReveal(data) {
  // Briefly show all picks; the next round renders fresh
  S.players.forEach(p => { p.pick = data.picks[p.id]; });
  renderPartyBids();
  renderPartyHeader();
  const winner = S.players.find(p => p.id === data.winnerId);
  const winName = winner ? winner.name : '(tie)';
  $('message').textContent = winner ? `+${data.prizeValue} to ${winName}` : `Tie · ${S.settings.tieRule === 'burn' ? 'burned' : S.settings.tieRule === 'split' ? 'split' : 'carries'}`;
  sfx.confirm(); haptic([25]);
}

function showPartyEnd() {
  // Use existing end screen but populate from S.players
  hide('game'); show('end');
  document.body.classList.remove('in-game', 'bullet', 'party');
  const sorted = S.players.filter(p => !p.spectator).slice().sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const isWinnerMe = winner && winner.id === S.myId;
  const er = $('end-result');
  er.textContent = isWinnerMe ? 'You won' : `${winner?.name || 'Nobody'} won`;
  er.className = 'end-result ' + (isWinnerMe ? 'win' : 'lose');
  $('end-score').innerHTML = sorted.map(p => `<span style="margin:0 12px">${p.avatar} ${p.name}: <b>${p.score}</b></span>`).join('');
  // Hide replay/coach/analysis for party for now (different data shape)
  $('replay').hidden = true;
  $('coach').hidden = true;
  $('score-curve-wrap').hidden = true;
  $('analysis').innerHTML = '';
  $('end-stakes').hidden = true;
  $('daily-grid').hidden = true;
  $('rematch-btn').textContent = 'Rematch';
  if (isWinnerMe) { setTimeout(() => { sfx.endWin(); fireConfetti(); }, 200); }
  else setTimeout(sfx.endLose, 200);
}

// ---- Player picks ----
function selectCardN(n) {
  if (S.myPick != null || !S.myHand.includes(n)) return;
  sfx.pick(); haptic([15]);
  if (S.pendingPick === n) { confirmPickN(); return; }
  S.pendingPick = n;
  renderHand(selectCardN);
  renderConfirmRowN();
}
function renderConfirmRowN() {
  $('confirm-row').innerHTML = '';
  const msg = $('message');
  const myBid = $('me-bid');
  if (!msg || !myBid) return;
  if (S.pendingPick == null || S.myPick != null) {
    msg.classList.remove('pending-prompt');
    myBid.classList.remove('drop-zone-active');
    return;
  }
  const label = S.pendingPick === 99 ? '★' : S.pendingPick;
  msg.innerHTML = `Bid <b>${label}</b> — tap the card or slot to confirm`;
  msg.classList.add('pending-prompt');
  // Drop-zone in the bid slot
  myBid.innerHTML = '';
  myBid.classList.add('drop-zone-active');
  const dropCard = document.createElement('button');
  dropCard.type = 'button';
  dropCard.className = 'card in-hand drop-zone-card';
  dropCard.setAttribute('aria-label', `Confirm bid ${label}`);
  dropCard.innerHTML = `<span class="drop-check">✓</span><span>${label}</span><span class="drop-sub">Tap to confirm</span>`;
  dropCard.onclick = confirmPickN;
  myBid.appendChild(dropCard);
}
function confirmPickN() {
  if (S.pendingPick == null || S.myPick != null) return;
  const n = S.pendingPick;
  S.myPick = n;
  S.myHand = S.myHand.filter(x => x !== n);
  S.pendingPick = null;
  clearTimer();
  renderHand(selectCardN);
  $('confirm-row').innerHTML = '';
  sfx.confirm(); haptic([25]);
  // Tell host
  if (S.isHost) {
    // Host: also update own state
    const me = S.players.find(p => p.id === S.myId);
    if (me) {
      me.pick = n;
      me.hand = me.hand.filter(c => c !== n);
    }
    broadcastPicksStatus();
    maybeResolveRoundHost();
  } else {
    S.conn?.send({ type: 'pick', round: S.round, card: n });
    $('message').textContent = 'Locked in. Waiting for others...';
  }
  renderPartyBids();
}
function autoBidN() {
  if (S.myPick != null || S.myHand.length === 0) return;
  const n = S.myHand[Math.floor(Math.random() * S.myHand.length)];
  S.pendingPick = n;
  setTimeout(confirmPickN, 200);
}

// ---- Chat ----
function renderPartyChat() {
  const msgs = $('chat-msgs');
  if (!msgs) return;
  msgs.innerHTML = '';
  S.chatMsgs.slice(-50).forEach(m => {
    const d = document.createElement('div');
    d.className = 'chat-msg ' + (m.from === S.myName ? 'me' : 'them');
    d.innerHTML = `<span class="from">${m.from}:</span>${m.text.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}`;
    msgs.appendChild(d);
  });
  msgs.scrollTop = msgs.scrollHeight;
}

function renderRemoteStream(id, stream) {
  // Find player's roster row and add a video tile
  let tile = document.querySelector(`[data-stream="${id}"]`);
  if (!tile) {
    tile = document.createElement('video');
    tile.dataset.stream = id;
    tile.autoplay = true; tile.playsInline = true;
    tile.muted = false;
    tile.className = 'remote-video';
    // Append to body or roster
    document.body.appendChild(tile);
  }
  tile.srcObject = stream;
}
function renderMediaControls() {
  const mic = $('mic-btn');
  if (mic) mic.classList.toggle('on', S.micOn);
  const cam = $('cam-btn');
  if (cam) cam.classList.toggle('on', S.camOn);
}

// ---- Helpers ----
function randomCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export function cleanupParty(intentional = false) {
  if (intentional) clearMultiSession();
  clearTimer();
  stopMic();
  try { S.conn?.close(); } catch {}
  try {
    for (const c of (S.conns?.values() || [])) c.close();
  } catch {}
  try { S.peer?.destroy(); } catch {}
  S.peer = null; S.conn = null;
  S.conns = null;
  S.players = [];
  S.gameStarted = false;
}
