// Coach: analyzes a finished game and surfaces the 1-3 turns where the player
// made the worst expected-value decision against the opponent's known hand.
//
// Approach (simple, transparent):
// For each round, compute the player's actual bid vs. the best alternative bid:
//   - "best" = highest bid among available cards at that point that would have won
//     (or tied) for the LEAST cost, or, if winning was impossible, the lowest card
//     available.
// We compute lost value: prize_value if a winning bid was available and the player
// played a higher one OR played a losing one. We rank rounds by lost value (desc)
// and return the top N.
//
// This is not optimal play (which requires minimax/expectimax), but it's a fast
// post-mortem that captures "you wasted your K on a 1-point prize" or "you let
// the 10-prize go for a 2-card bid".

import { rankText } from './constants.js';

export function analyze(history, deckSize = 13) {
  if (!history || history.length === 0) return [];
  const myUsed = new Set();
  const theirUsed = new Set();
  const insights = [];

  for (const h of history) {
    // What did the player have available to bid?
    const myAvail = [];
    for (let n = 1; n <= deckSize; n++) {
      if (!myUsed.has(n)) myAvail.push(n);
    }
    // The opponent's actual bid is known from history.
    const oppBid = h.theirs;

    // Find the smallest winning bid (smallest card that beats opp's bid).
    let smallestWinner = null;
    for (const n of myAvail) {
      if (n > oppBid) { smallestWinner = (smallestWinner == null) ? n : Math.min(smallestWinner, n); }
    }

    // Find the highest losing bid (best "throw away" if winning impossible).
    let lowestAvail = Math.min(...myAvail);

    let kind = null, why = '', cost = 0;
    if (smallestWinner != null && h.mine > smallestWinner + 1 && h.winner === 'me') {
      kind = 'overpaid';
      cost = h.mine - smallestWinner;
      why = `You won the ${rankText(h.prize, deckSize)} with ${rankText(h.mine, deckSize)}, but ${rankText(smallestWinner, deckSize)} would have done the job — saving ${cost} card-rank for later.`;
    } else if (h.winner === 'me' && (h.mine - h.prize) >= 5) {
      kind = 'overpaid';
      cost = h.mine - h.prize;
      why = `You won the ${rankText(h.prize, deckSize)} (worth ${h.prize}) with ${rankText(h.mine, deckSize)} — consider folding small prizes with low cards next time.`;
    } else if (smallestWinner != null && h.winner !== 'me') {
      kind = 'missed';
      cost = h.prizeValue;
      why = `You could have taken the ${rankText(h.prize, deckSize)} (worth ${h.prizeValue}) by bidding ${rankText(smallestWinner, deckSize)} instead of ${rankText(h.mine, deckSize)}.`;
    } else if (smallestWinner == null && h.mine > lowestAvail && h.winner !== 'me') {
      kind = 'wasted';
      cost = h.mine - lowestAvail;
      why = `Couldn't win this round — bidding ${rankText(lowestAvail, deckSize)} instead of ${rankText(h.mine, deckSize)} would have preserved your high cards.`;
    }

    if (kind) insights.push({ round: h.round, kind, why, cost });

    myUsed.add(h.mine);
    theirUsed.add(h.theirs);
  }

  insights.sort((a, b) => b.cost - a.cost);
  return insights.slice(0, 3);
}
