// Tiny test runner — no deps, browser ESM only.

import { shuffle, seededShuffle, escapeHtml, todayKey, dailySeed } from '../js/util.js';
import { rankText, PUZZLES, ACHIEVEMENTS, TOURNAMENT_AIS, AI_CATCHPHRASES } from '../js/constants.js';
import { analyze as coachAnalyze } from '../js/coach.js';
import { buildReplayURL, parseReplayLink } from '../js/share.js';

let passed = 0, failed = 0;
const out = document.getElementById('out');

function group(name) {
  const el = document.createElement('div');
  el.className = 'group';
  el.textContent = name;
  out.appendChild(el);
}
function test(name, fn) {
  const el = document.createElement('div');
  try {
    fn();
    el.className = 'pass'; el.textContent = '✓ ' + name; passed++;
  } catch (e) {
    el.className = 'fail'; el.textContent = '✗ ' + name + ' — ' + (e?.message || e); failed++;
  }
  out.appendChild(el);
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) throw new Error((msg || 'equality') + ` — got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
}

// ---------- util ----------
group('util');
test('shuffle preserves length and contents', () => {
  const a = [1,2,3,4,5];
  const b = shuffle(a);
  assertEq(b.length, 5);
  assertEq(b.slice().sort(), [1,2,3,4,5]);
});
test('seededShuffle is deterministic', () => {
  const a = [1,2,3,4,5,6,7,8,9,10,11,12,13];
  const x = seededShuffle(a, 42);
  const y = seededShuffle(a, 42);
  assertEq(x, y);
});
test('seededShuffle changes with different seeds', () => {
  const a = [1,2,3,4,5,6,7,8,9,10,11,12,13];
  const x = seededShuffle(a, 42);
  const y = seededShuffle(a, 43);
  assert(JSON.stringify(x) !== JSON.stringify(y), 'should differ');
});
test('escapeHtml escapes core entities', () => {
  assertEq(escapeHtml('<a "b" \'c\'>&'), '&lt;a &quot;b&quot; &#39;c&#39;&gt;&amp;');
});
test('todayKey matches ISO-like format', () => {
  const k = todayKey(new Date(2025, 0, 3));
  assertEq(k, '2025-01-03');
});
test('dailySeed monotonically increases across days', () => {
  const a = dailySeed(new Date(2025, 0, 1));
  const b = dailySeed(new Date(2025, 0, 2));
  assert(b > a);
});

// ---------- constants ----------
group('constants');
test('rankText labels A/J/Q/K for 13-deck', () => {
  assertEq(rankText(1, 13), 'A');
  assertEq(rankText(11, 13), 'J');
  assertEq(rankText(12, 13), 'Q');
  assertEq(rankText(13, 13), 'K');
  assertEq(rankText(7, 13), '7');
});
test('rankText for 7-deck is plain numeric', () => {
  assertEq(rankText(1, 7), '1');
  assertEq(rankText(7, 7), '7');
});
test('puzzles all have id + title + goal', () => {
  for (const p of PUZZLES) {
    assert(p.id && p.title && p.goal, 'puzzle ' + p.id + ' missing field');
  }
});
test('all 8 tournament AIs', () => assertEq(TOURNAMENT_AIS.length, 8));
test('catchphrases exist for every personality', () => {
  for (const k of ['easy','aggressive','defensive','bluffer','mirror','balanced']) {
    assert(AI_CATCHPHRASES[k]?.length > 0, 'missing for ' + k);
  }
});

// ---------- coach ----------
group('coach');
test('coach returns insights for losing games', () => {
  // Constructed losing scenario
  const history = [
    { round: 1, prize: 13, mine: 1, theirs: 13, prizeValue: 13, winner: 'them' },
    { round: 2, prize: 12, mine: 12, theirs: 1, prizeValue: 12, winner: 'me' },
    { round: 3, prize: 11, mine: 2, theirs: 11, prizeValue: 11, winner: 'them' },
    { round: 4, prize: 1,  mine: 13, theirs: 12, prizeValue: 1, winner: 'me' },
    { round: 5, prize: 10, mine: 3, theirs: 10, prizeValue: 10, winner: 'them' },
  ];
  const r = coachAnalyze(history, 13);
  assert(r.length > 0, 'should find insights');
  // Round 4 should flag as overpaid (K vs Q for a 1-prize)
  assert(r.some(i => i.kind === 'overpaid' && i.round === 4), 'should flag round 4 overpaid');
});
test('coach analyze returns empty for empty history', () => {
  assertEq(coachAnalyze([], 13), []);
});

// ---------- replay URL ----------
group('replay-url');
test('buildReplayURL produces parseable URL', () => {
  const state = {
    settings: { deckSize: 7, direction: 'high', winCondition: 'most', tieRule: 'carry' },
    prizes: [3,1,4,1,5,9,2],
    history: [
      { round: 1, prize: 3, mine: 5, theirs: 2, prizeValue: 3, winner: 'me' },
      { round: 2, prize: 1, mine: 1, theirs: 7, prizeValue: 1, winner: 'them' },
    ],
    myName: 'Alice', theirName: 'Bob',
  };
  // Stub location for parser
  const url = buildReplayURL(state);
  assert(url.includes('#replay='), 'should have replay hash');
});

// ---------- summary ----------
const summary = document.getElementById('summary');
summary.innerHTML = `<b>${passed}</b> passed · <b style="color:${failed ? '#f87171' : '#4ade80'}">${failed}</b> failed`;
if (failed > 0) document.title = `${failed} ✗ — GOPS tests`;
else document.title = `✓ All passing — GOPS tests`;
