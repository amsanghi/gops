// AI bidding logic. Pure function of state — no DOM, no side effects.

import { S } from './state.js';
import { $ } from './util.js';

export function aiBid({ difficulty, personality } = {}) {
  // Scripted moves take priority (puzzles can repeat values intentionally).
  if (S.scriptedAI) {
    const move = S.scriptedAI[S.round];
    if (move !== undefined) return move;
  }
  // Fallback to UI selects when params not supplied.
  difficulty = difficulty || $('ai-diff')?.value || 'medium';
  personality = personality || $('ai-persona')?.value || 'balanced';

  const currentPrize = S.prizes[S.round];
  const remainingPrizes = S.prizes.slice(S.round);
  const aiHand = S.theirHand.slice().sort((a, b) => b - a); // high-first
  const sortedPrizes = remainingPrizes.slice().sort((a, b) => b - a);
  const prizeRank = sortedPrizes.indexOf(currentPrize);

  // ---- Personality overrides ----
  if (personality === 'aggressive') {
    const earlyHalf = S.round < S.totalRounds / 2;
    if (earlyHalf && Math.random() < 0.7) {
      return aiHand[Math.floor(Math.random() * Math.min(3, aiHand.length))] ?? aiHand[0];
    }
  }
  if (personality === 'defensive') {
    const lateGame = S.round >= S.totalRounds * 0.7;
    if (!lateGame && Math.random() < 0.7) {
      const lowSorted = aiHand.slice().sort((a, b) => a - b);
      return lowSorted[Math.floor(Math.random() * Math.min(3, lowSorted.length))];
    }
  }
  if (personality === 'bluffer' && Math.random() < 0.4) {
    return aiHand[Math.floor(Math.random() * aiHand.length)];
  }
  if (personality === 'mirror' && S.history.length > 0) {
    const myLast = S.history[S.history.length - 1].mine;
    return aiHand.reduce((best, c) => Math.abs(c - myLast) < Math.abs(best - myLast) ? c : best, aiHand[0]);
  }

  // ---- Difficulty ----
  if (difficulty === 'easy') {
    return aiHand[Math.floor(Math.random() * aiHand.length)];
  }
  if (difficulty === 'medium') {
    const offset = Math.floor(Math.random() * 3) - 1; // -1..1
    const idx = Math.max(0, Math.min(aiHand.length - 1, prizeRank + offset));
    return aiHand[idx];
  }
  // Hard
  if (S.settings.direction === 'low') {
    const lowSorted = aiHand.slice().sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(lowSorted.length - 1, prizeRank));
    const offset = Math.random() < 0.7 ? 0 : (Math.random() < 0.5 ? -1 : 1);
    return lowSorted[Math.max(0, Math.min(lowSorted.length - 1, idx + offset))];
  }
  if (Math.random() < 0.3) {
    const offset = Math.random() < 0.5 ? -2 : 2;
    const idx = Math.max(0, Math.min(aiHand.length - 1, prizeRank + offset));
    return aiHand[idx];
  }
  return aiHand[Math.max(0, Math.min(aiHand.length - 1, prizeRank))];
}
