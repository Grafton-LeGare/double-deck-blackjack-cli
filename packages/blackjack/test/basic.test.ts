import { expect, test } from 'vitest';
import type { Card, Rank, Suit, Shoe } from '../src/blackjack-types.ts';

// Filler for the test shoe below -- cycles ranks/suits
const TEST_SHOE_FILLER: Card[] = Array.from({ length: 40 }, (_, i) => {
    const fillerRanks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    const fillerSuits: Suit[] = ['S', 'C', 'H', 'D'];
    return {
        rank: fillerRanks[i % fillerRanks.length]!,
        suit: fillerSuits[Math.floor(i / fillerRanks.length) % fillerSuits.length]!
    };
});

// Test shoe: Swap in for `shoe` above to manually exercise specific flows.
const testShoe: Shoe = {
    decks: 2,
    cutCardPosition: 16, // getCutCardPosition(gameRules),
    cardsDealt: 0,
    cardsRemaining: [
        { rank: 'T', suit: 'S' }, // player card 1
        { rank: '3', suit: 'S' }, // dealer upcard
        { rank: 'K', suit: 'C' }, // player card 2
        { rank: 'J', suit: 'H' }, // dealer hole
        { rank: '9', suit: 'D' }, // split card 1
        ...TEST_SHOE_FILLER
    ]
};