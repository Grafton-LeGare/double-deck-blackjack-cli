import type { Card, Rank, Suit, RuleSet, GameState } from '../src/blackjack-types.ts';
import { RANKS, SUITS } from '../src/blackjack-types.ts';
import { getCutCardPosition } from '../src/engine.ts';

// Filler for test shoes -- cycles ranks/suits
export function shoeFiller(decks: number, testSize: number): Card[] {
    return Array.from({ length: decks * 52 - testSize }, (_, i) => {
        const fillerRanks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
        const fillerSuits: Suit[] = ['S', 'C', 'H', 'D'];
        return {
            rank: fillerRanks[i % fillerRanks.length]!,
            suit: fillerSuits[Math.floor(i / fillerRanks.length) % fillerSuits.length]!
        };
    });
}

// Parses test-card shorthand into cards -- throws on anything that isn't a real card
export function parseCards(shorthand: string[]): Card[] {
    return shorthand.map((str, i) => {
        const rank = str.at(0) as Rank;
        const suit = str.at(1) as Suit;
        const validRank = RANKS.includes(rank);
        const validSuit = SUITS.includes(suit);

        if (str.length !== 2 || !validRank || !validSuit) {
            throw new Error(
                `parseCards: bad shorthand ${JSON.stringify(str)} at index ${i} ` +
                `(expected a rank ${RANKS.join('')} followed by a suit ${SUITS.join('')}, e.g. "AS")`
            );
        }

        return { rank, suit };
    });
}

export const DEFAULT_TEST_RULES: RuleSet = {
    decks: 2,
    h17: true,
    rsa: true,
    das: true,
    maxHands: 6,
    surrender: true,
    blackjackPays: 1.5,
    penetration: 0.75,
    penMode: 'notch'    // DO NOT change if testing penetration
};

// Builds a testable state with testCards as the first cards from the shoe
// -- testRules overrides only the rules it names, the rest come from DEFAULT_TEST_RULES
export function testState(testCards: string[], testRules?: Partial<RuleSet>): GameState {
    const parsedCards: readonly Card[] = parseCards(testCards);
    
    const rules: RuleSet = { ...DEFAULT_TEST_RULES, ...testRules };

    return {
        rules,
        shoe: {
            decks: rules.decks,
            cutCardPosition: getCutCardPosition(rules),
            cardsDealt: 0,
            cardsRemaining: [...parsedCards, ...shoeFiller(rules.decks, parsedCards.length)]
        },
        hands: [],
        dealerHand: { drawn: [], holeRevealed: false, playedOut: false },
        activeHand: 0,
        insurance: 0,
        gamePhase: 'bet',
        bank: 999999
    }
};