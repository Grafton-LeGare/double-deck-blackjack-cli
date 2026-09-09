import type { Card, Rank, Suit, RuleSet, GameState, Hand, DealerHand, PlayerAction, Step } from '../src/blackjack-types.ts';
import { RANKS, SUITS } from '../src/blackjack-types.ts';
import { getCutCardPosition, reduce } from '../src/engine.ts';

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

// DO NOT CHANGE THIS - many tests would have to be adjusted
export const DEFAULT_TEST_RULES: RuleSet = {
    decks: 2,
    h17: true,
    rsa: true,
    das: true,
    maxHands: 6,
    surrender: true,
    blackjackPays: 1.5,
    penetration: 0.75,
    penMode: 'notch'
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

// Builds a player hand from card shorthand -- overrides only the fields it names
export function testHand(cards: string[], overrides?: Partial<Hand>): Hand {
    return { cards: parseCards(cards), bet: 10, fromSplit: false, result: 'pending', ...overrides };
}

// Builds a dealer hand from card shorthand -- upcard, then hole, then any drawn cards
export function testDealerHand(cards: string[], overrides?: Partial<DealerHand>): DealerHand {
    const [upcard, hole, ...drawn] = parseCards(cards);

    return { upcard, hole, drawn, holeRevealed: false, playedOut: false, ...overrides };
}

const SIMPLE_ACTIONS = ['hit', 'stand', 'double', 'split', 'surrender', 'evenMoney'] as const;
const AMOUNT_ACTIONS = ['bet', 'insurance'] as const;

type SimpleAction = typeof SIMPLE_ACTIONS[number];
type AmountAction = typeof AMOUNT_ACTIONS[number];

// Parses action shorthand -- 'hit', 'bet 10', 'split x3' -- and throws on anything else
function parseAction(shorthand: string, i: number): { action: PlayerAction; repeat: number } {
    const parts = shorthand.trim().split(/\s+/);
    let repeat = 1;

    const last = parts.at(-1) ?? '';
    if (parts.length > 1 && /^x\d+$/.test(last)) {
        repeat = Number(last.slice(1));
        parts.pop();
    }

    const word = parts.at(0) as SimpleAction & AmountAction;
    const arg = parts.at(1);
    const isSimple = SIMPLE_ACTIONS.includes(word);
    const isAmount = AMOUNT_ACTIONS.includes(word);

    const bad =
        parts.length > 2 ||
        repeat < 1 ||
        (!isSimple && !isAmount) ||
        (isSimple && arg !== undefined) ||
        (isAmount && !Number.isFinite(Number(arg)));

    if (bad) {
        throw new Error(
            `play: bad action ${JSON.stringify(shorthand)} at index ${i} ` +
            `(expected ${SIMPLE_ACTIONS.join('/')}, or ${AMOUNT_ACTIONS.join('/')} with an amount, ` +
            `each optionally followed by a repeat count like "x3")`
        );
    }

    const action: PlayerAction = isAmount
        ? { type: word as AmountAction, amount: Number(arg) }
        : { type: word as SimpleAction };

    return { action, repeat };
}

// Folds a sequence of actions over reduce, returning every Step it produced
export function playSteps(state: GameState, ...actions: (string | PlayerAction)[]): Step[] {
    const steps: Step[] = [];
    let current = state;

    actions.forEach((entry, i) => {
        const { action, repeat } = typeof entry === 'string'
            ? parseAction(entry, i)
            : { action: entry, repeat: 1 };

        for (let n = 0; n < repeat; n++) {
            const step = reduce(current, action);
            steps.push(step);
            current = step.after;
        }
    });

    return steps;
}

// Folds a sequence of actions over reduce, returning only the final state
export function play(state: GameState, ...actions: (string | PlayerAction)[]): GameState {
    return playSteps(state, ...actions).at(-1)?.after ?? state;
}
