// Single mutable game state object plus a tiny pub/sub for cross-module updates.

export const S = {
  // Network
  peer: null, conn: null,
  isHost: false,
  vsAI: false,
  mode: null,           // 'host' | 'joiner' | 'solo' | 'hotseat' | null
  currentMode: null,    // 'multi' | 'solo' | 'daily' | 'puzzle' | 'endless' | 'tournament' | 'tutorial' | 'hotseat' | 'ghost'
  roomCode: '',

  // N-player support
  // players: ordered roster. Each = { id, name, avatar, score, hand, pick, used, spectator, connected }
  // For 2-player games and solo, players is length 2 (me + opponent).
  // For multi-N, players is the full roster.
  players: [],
  myId: null,
  hostId: null,
  conns: null,            // host only: Map(id → DataConnection); created on demand
  mediaConns: null,       // Map(id → MediaConnection)
  localStream: null,
  remoteStreams: null,    // Map(id → MediaStream)
  micOn: false,
  camOn: false,
  gameStarted: false,     // for multi-N: distinguishes lobby phase

  // Players (legacy 2-player view — kept synced from players[])
  myName: 'You',
  theirName: 'Them',
  myAvatar: '😎',
  theirAvatar: '🎭',

  // Game config (mutable per-match)
  settings: {
    deckSize: 13,
    bestOf: 1,
    tieRule: 'carry',     // 'carry' | 'burn'
    direction: 'high',    // 'high' | 'low'
    winCondition: 'most', // 'most' | 'fewest'
    timeLimit: 0,         // seconds, 0 = off
    stakes: '',
  },

  // Game progress
  prizes: [],            // remaining prize stack, prizes[round] is the visible prize
  myHand: [],
  theirHand: [],
  theirUsedCards: [],
  round: 0,
  myScore: 0,
  theirScore: 0,
  pot: 0,
  myPick: null,
  theirPick: null,
  pendingPick: null,
  history: [],           // {round, prize, mine, theirs, prizeValue, winner: 'me'|'them'|'tie'}
  myGames: 0, theirGames: 0,
  myStakes: '', theirStakes: '',
  myRematch: false, theirRematch: false,
  busy: false,
  totalRounds: 13,

  // Hot-seat
  hotseatPhase: 'P1', // 'P1' | 'P2' (whose secret bid we're collecting on the same device)
  hotseatP1Name: 'P1', hotseatP2Name: 'P2',
  hotseatP1Avatar: '😎', hotseatP2Avatar: '🎭',

  // Mode-specific
  scriptedAI: null,
  tournamentLevel: 0,
  endlessLevel: 0, endlessScore: 0,
  currentPuzzle: null,
  currentTournamentAI: null,
  ghostMoves: null,    // array of bids for ghost mode
  battlePersonA: null, battlePersonB: null, // AI battle personalities

  // Timer
  timerId: null, timerStart: 0, timerDuration: 0, lastTickSec: null,
  pickTime: 0,
  lastConfirmTime: 0,

  // Preferences
  sound: true, haptics: true,
  theme: 'mono', cardBack: 'mono',
  mode_light: false,
  themesTried: new Set(),
  handSort: 'asc',       // 'asc' | 'desc' | 'used-last'
  animSpeed: 1,          // 0.5 .. 1.5
  coachMode: true,
  customTheme: null,     // {accent, opp} or null

  // Chat
  chatMsgs: [],
};

// Tiny event bus — used so modules can react to settings/theme changes without tight coupling.
const listeners = new Map();
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}
export function emit(event, payload) {
  listeners.get(event)?.forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } });
}

// Reset per-match state (between rematches, mode changes, etc.)
export function resetMatch() {
  S.prizes = [];
  S.myHand = []; S.theirHand = []; S.theirUsedCards = [];
  S.round = 0; S.myScore = 0; S.theirScore = 0; S.pot = 0;
  S.myPick = null; S.theirPick = null; S.pendingPick = null;
  S.history = [];
  S.myRematch = false; S.theirRematch = false;
  S.busy = false;
  S.chatMsgs = [];
  S.scriptedAI = null;
}
