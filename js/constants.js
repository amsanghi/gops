// All static lookup data lives here.

export const PROTO_VERSION = 6;
export const PEER_PREFIX = 'gops-room-';

export const STORAGE = {
  PREFS: 'gops-prefs',
  SAVE: 'gops-saved-game',
  STATS: 'gops-stats',
  ACH: 'gops-achievements',
  DAILY: 'gops-daily',
  PUZZLE: 'gops-puzzles',
  TOURNEY: 'gops-tournament',
  GHOST: 'gops-ghost',
  H2H_PREFIX: 'gops-h2h-',
  HEATMAP: 'gops-heatmap',
  RECORDS: 'gops-records',
  CUSTOM_THEME: 'gops-custom-theme',
  MULTI_SESSION: 'gops-multi-session',  // for refresh-rejoin
};

export const SAVE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const AVATARS = ['😎','🎭','👑','🐱','🦊','🐉','🌹','⭐','🌙','🔥','💎','🎲','🦋','🌸','🍀','⚡','🦄','🎸','🐺','🦅','🪐','🍒'];

export const CARD_BACKS = [
  { id: 'mono',   label: 'Mono' },
  { id: 'dots',   label: 'Dots' },
  { id: 'grid',   label: 'Grid' },
  { id: 'waves',  label: 'Waves' },
];

export const REACTIONS = ['😘','😤','🔥','😂','💀','❤️','🤔','😎'];

// The felt you play on. Your ivory counters stay ivory on every table.
export const THEMES = [
  { name: 'emerald',   color: '#174236' },
  { name: 'claret',    color: '#41191D' },
  { name: 'midnight',  color: '#1A263F' },
  { name: 'cognac',    color: '#3B2A1A' },
  { name: 'slate',     color: '#242C30' },
  { name: 'aubergine', color: '#311B3E' },
];

export const TOURNAMENT_AIS = [
  { name: 'Rookie Ron',      avatar: '🤓', personality: 'easy',       difficulty: 'easy',   description: 'Plays randomly. Warm-up.' },
  { name: 'Mirror Mira',     avatar: '🪞', personality: 'mirror',     difficulty: 'medium', description: 'Copies your last bid.' },
  { name: 'Defender Donna',  avatar: '🛡️', personality: 'defensive',  difficulty: 'medium', description: 'Hoards her high cards.' },
  { name: 'Aggressor Andy',  avatar: '⚔️', personality: 'aggressive', difficulty: 'medium', description: 'Dumps high cards early.' },
  { name: 'Bluffer Bob',     avatar: '🎭', personality: 'bluffer',    difficulty: 'hard',   description: 'Unpredictable plays.' },
  { name: 'Calculator Cal',  avatar: '🧮', personality: 'balanced',   difficulty: 'hard',   description: 'Optimal medium play.' },
  { name: 'Sphinx Sam',      avatar: '🦁', personality: 'balanced',   difficulty: 'hard',   description: 'Subtle and patient.' },
  { name: 'Grandmaster Gabe',avatar: '👑', personality: 'balanced',   difficulty: 'hard',   description: 'The final boss.' },
];

// AI flavor lines — sometimes shown as floating notes when an AI takes its bid.
export const AI_CATCHPHRASES = {
  easy:       ["¯\\_(ツ)_/¯", "this card looks fine", "whatever", "🎲"],
  aggressive: ["all-in", "go big", "no fear", "I'm taking this one", "watch me"],
  defensive:  ["saving the good ones", "patience", "not yet", "you bid first", "mine"],
  bluffer:    ["you'll never guess", "I'm doing what?", "trust me, don't", "what is bidding"],
  mirror:     ["interesting choice", "I see what you did", "two can play", "copy that"],
  balanced:   ["calculating…", "weighing options", "fair trade", "expected", "noted"],
};

// Scripted puzzles: order of prizes is fixed in the order shown (not shuffled).
export const PUZZLES = [
  { id: 1, title: 'Last round showdown', desc: 'A pyramid of prizes. Manage your hand.', deckSize: 13, scripted: [{ai:13,prize:1},{ai:12,prize:2},{ai:11,prize:3},{ai:10,prize:4},{ai:9,prize:5},{ai:8,prize:6},{ai:7,prize:7},{ai:6,prize:8},{ai:5,prize:9},{ai:4,prize:10},{ai:3,prize:11},{ai:2,prize:12},{ai:1,prize:13}], goal: 'Win the K (13) on the last round.' },
  { id: 2, title: 'Carryover crisis', desc: 'Big pot builds. Don\'t let the AI take it.', deckSize: 7, scripted: [{ai:4,prize:1},{ai:4,prize:2},{ai:5,prize:3},{ai:6,prize:7},{ai:7,prize:4},{ai:3,prize:5},{ai:2,prize:6}], goal: 'Beat the AI by 5+ points.' },
  { id: 3, title: 'High-stakes opener', desc: 'AI dumps the K early. What\'s your move?', deckSize: 7, scripted: [{ai:7,prize:1},{ai:6,prize:2},{ai:5,prize:3},{ai:4,prize:7},{ai:3,prize:6},{ai:2,prize:5},{ai:1,prize:4}], goal: 'Save your high cards for the prizes that matter.' },
  { id: 4, title: 'The bluff',         desc: 'AI plays low on big prizes. Don\'t fall for it.', deckSize: 7, scripted: [{ai:1,prize:7},{ai:7,prize:1},{ai:2,prize:6},{ai:6,prize:2},{ai:3,prize:5},{ai:5,prize:3},{ai:4,prize:4}], goal: 'Beat the AI.' },
  { id: 5, title: 'Reverse',           desc: 'LOW bid wins. Adjust your strategy.', deckSize: 7, direction: 'low', scripted: [{ai:4,prize:7},{ai:5,prize:6},{ai:6,prize:5},{ai:7,prize:4},{ai:1,prize:3},{ai:2,prize:2},{ai:3,prize:1}], goal: 'Win in low-bid-wins mode.' },
  { id: 6, title: 'Burn mode',         desc: 'Ties burn the prize. Avoid duplicating.', deckSize: 7, tieRule: 'burn', scripted: [{ai:4,prize:7},{ai:4,prize:6},{ai:4,prize:1},{ai:4,prize:2},{ai:7,prize:3},{ai:1,prize:4},{ai:2,prize:5}], goal: 'Win with the burn rule.' },
  { id: 7, title: 'Hoard the king',    desc: 'AI saves her K for last. Bait it out.', deckSize: 7, scripted: [{ai:1,prize:7},{ai:2,prize:6},{ai:3,prize:5},{ai:4,prize:4},{ai:5,prize:3},{ai:6,prize:2},{ai:7,prize:1}], goal: 'Win at least 4 of 7 prize values.' },
  { id: 8, title: 'Mind games',        desc: 'Hard AI, no script.', deckSize: 13, scripted: null, difficulty: 'hard', goal: 'Beat the hard AI on the full deck.' },
  { id: 9, title: 'Quick reflex',      desc: '15s timer per bid. Don\'t hesitate.', deckSize: 7, timeLimit: 15, scripted: null, difficulty: 'medium', goal: 'Win against the clock.' },
  { id: 10, title: 'Fewest wins',      desc: 'LOWEST total wins. Bait the AI.', deckSize: 7, winCondition: 'fewest', scripted: null, difficulty: 'medium', goal: 'Lose fewer points than the AI.' },
];

export const ACHIEVEMENTS = [
  { id: 'first_game',  icon: '🎮', title: 'First steps',    desc: 'Finish your first game.' },
  { id: 'first_win',   icon: '🏆', title: 'Victory',        desc: 'Win your first game.' },
  { id: 'tutorial',    icon: '🎓', title: 'Graduate',       desc: 'Complete the tutorial.' },
  { id: 'daily_1',     icon: '◷', title: 'Daily devotee',  desc: 'Complete one daily challenge.' },
  { id: 'daily_7',     icon: '🔥', title: 'Week of wins',   desc: 'Complete 7 daily challenges.' },
  { id: 'daily_30',    icon: '💎', title: 'Monthly master', desc: 'Complete 30 daily challenges.' },
  { id: 'perfect',     icon: '✨', title: 'Perfect game',   desc: 'Win every round in one game.' },
  { id: 'comeback',    icon: '🚀', title: 'Comeback king',  desc: 'Win after being behind 30+ points.' },
  { id: 'bluff_win',   icon: '🎭', title: 'The bluffer',    desc: 'Win a round bidding A or 2.' },
  { id: 'hoarder',     icon: '🦅', title: 'Patient hunter', desc: 'Save your K until round 10+.' },
  { id: 'speed',       icon: '⚡', title: 'Lightning bid',  desc: 'Confirm in under 2 seconds.' },
  { id: 'marathon',    icon: '🏃', title: 'Marathon',       desc: 'Win a Best-of-7 series.' },
  { id: 'ai_hard',     icon: '🤖', title: 'Machine slayer', desc: 'Beat the hard AI.' },
  { id: 'tournament',  icon: '👑', title: 'Champion',       desc: 'Win the tournament.' },
  { id: 'endless_10',  icon: '∞',  title: 'Endless 10',     desc: 'Reach round 10 in endless.' },
  { id: 'endless_25',  icon: '🌟', title: 'Endless 25',     desc: 'Reach round 25 in endless.' },
  { id: 'puzzle_5',    icon: '🧩', title: 'Puzzle solver',  desc: 'Solve 5 puzzles.' },
  { id: 'puzzle_all',  icon: '🎯', title: 'Puzzle master',  desc: 'Solve all puzzles.' },
  { id: 'stakes',      icon: '🎰', title: 'High stakes',    desc: 'Win a game with stakes.' },
  { id: 'multi_10',    icon: '🤝', title: 'Social player',  desc: 'Play 10 multiplayer games.' },
  { id: 'reverse',     icon: '🔄', title: 'Reverse master', desc: 'Win in low-bid or fewest-wins.' },
  { id: 'burn',        icon: '🔥', title: 'Burnout',        desc: 'Win with burn-on-tie.' },
  { id: 'high_score',  icon: '💯', title: 'Big spender',    desc: 'Score 60+ in one game.' },
  { id: 'theme',       icon: '🎨', title: 'Table hopper',   desc: 'Sit at all six tables.' },
  { id: 'underdog',    icon: '🐕', title: 'Underdog',       desc: 'Win as the joiner.' },
  { id: 'ghost_beat',  icon: '👻', title: 'Self-defeated',  desc: 'Defeat your own ghost.' },
  { id: 'hotseat',     icon: '🪑', title: 'Pass and play',  desc: 'Finish a hot-seat game.' },
];

export const TUTORIAL_STEPS = [
  { title: 'Welcome to GOPS',  text: 'GOPS — Game of Pure Strategy — is a card duel with no luck. Just bidding wisely.' },
  { title: 'The setup',        text: 'You and your opponent each have cards A–K. A prize deck is shuffled face-down.' },
  { title: 'Each round',       text: 'A prize is revealed. You each secretly pick a card to bid.' },
  { title: 'Who wins',         text: 'The highest bid wins the prize, adding its value to your score. The bid card is gone forever.' },
  { title: 'Ties',             text: 'Equal bids? The prize CARRIES to the next round — making it more valuable.' },
  { title: 'The goal',         text: 'After all rounds, highest total wins. Pick your battles. Good luck.' },
];

// vs2.0 — bare-numeric, no suits, monogram-style rank text
export function rankText(n /*, size */) {
  // Always show A/J/Q/K for those ranks. Deck size doesn't matter — in a
  // 7-card deck only 1 maps (A), and in larger decks J/Q/K kick in too.
  return ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[n] || String(n);
}
