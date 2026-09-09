import { expect, test, describe, it, assert } from 'vitest';
import type { Card, Rank, Suit, Shoe, Hand, DealerHand, Action, RuleSet, GameState, Step } from '../src/blackjack-types.ts';
import {
    reduce,
    combineDecks,
    shuffleDecks,
    getCutCardPosition,
    refreshShoe,
    suitSymbol,
    cardValue,
    cardsFromHand,
    handTotal,
    isBlackjack,
    maxInsurance,
    legalMoves
} from '../src/engine.ts';
import { PLAYING_CARDS } from '../src/blackjack-types.ts';
import { testState, testHand, testDealerHand, parseCards, play } from './fixture.ts';

describe('reduce', () => {
    it('returns a proper step', () => {
        const start: GameState = testState(['8H', 'TD', '9H', '3D']);
        const step: Step = reduce(start, { type: 'bet', amount: 10});

        expect(step.before).not.toBe(step.after);
        expect(step.action).toEqual({ type: 'bet', amount: 10 });
        expect(step.events).toEqual([]);
    });
});

describe('reduce: split', () => {
    it('splits a hand successfully', () => {
        const start: GameState = testState(['8H', 'TD', '8H', '3D']);
        const afterBet = play(start, 'bet 10');
        const end = play(afterBet, 'split');

        expect(end.hands.length).toBe(2);
        expect(end.activeHand).toBe(0);
        expect(end.hands[0]!.cards.length).toBe(2);
        expect(end.hands[1]!.cards.length).toBe(1);
        expect(end.bank).toBe(afterBet.bank - 10);
    });

    it('hits both split aces', () => {
        const start: GameState = testState(['AH', 'TD', 'AH', '3D']);
        const end = play(start, 'bet 10', 'split');

        expect(end.hands[0]!.cards.length).toBe(2);
        expect(end.hands[1]!.cards.length).toBe(2);
    });

    it('allows resplitting aces with RSA', () => {
        const start: GameState = testState(['AH', 'TD', 'AH', '3D', 'AS']);
        const end = play(start, 'bet 10', 'split');

        expect(end.activeHand).toBe(0);
        expect(legalMoves(end.hands[0]!, end.rules, end)).toContain('P');
    });

    it('correctly activates next splittable hand with RSA', () => {
        const start: GameState = testState(['AH', 'TD', 'AH', '3D', 'AS', 'AS', 'AC', '8H', '4H', '5H']);
        const end = play(start, 'bet 10', 'split x3');

        assert(end.hands.length === 4);
        expect(end.activeHand).toBe(3);
    });

    it('disallows splitting past maxHands', () => {
        const start: GameState = testState(['8H', 'TD', '8H', '3D', '8H', '8H', '8S', '8S', '8S', '8S', '8C', '8C', '8C', '9H']);
        const end = play(start, 'bet 10', 'split x5');

        assert(end.hands.length === 6);
        assert(end.hands[0]!.cards[0]!.rank === end.hands[0]!.cards[1]!.rank);
        expect(end.activeHand).toBe(0);
        expect(legalMoves(end.hands[0]!, end.rules, end)).not.toContain('P');
    });
});

describe('reduce: settle', () => {
    it('pays out a win correctly', () => {
        const start: GameState = testState(['AH', 'TD', '9H', '7D']);
        const end = play(start, 'bet 10', 'stand');

        assert(end.gamePhase === 'settle');
        expect(end.bank - start.bank).toBe(10);
    });

    it('pays out a loss correctly', () => {
        const start: GameState = testState(['3H', 'TD', '9H', '7D']);
        const end = play(start, 'bet 10', 'stand');

        assert(end.gamePhase === 'settle');
        expect(end.bank - start.bank).toBe(-10);
    });

    it('pays out a push correctly', () => {
        const start: GameState = testState(['8H', 'TD', '9H', '7D']);
        const end = play(start, 'bet 10', 'stand');

        assert(end.gamePhase === 'settle');
        expect(end.bank).toBe(start.bank);
    });

    it('pays out the correct total across hands', () => {
        // 4 Hands total, 1 loss, 1 push, 2 wins vs Dealer 18
        const start: GameState = testState(['8H', 'TD', '8H', '8D', '8S', '8S', '2H', '8C', '3H', '6H', 'AH', 'KH', '2H']);
        const end = play(start,
            'bet 10', 'split x3',
            'hit', 'stand', 'hit', 'stand', 'stand', 'hit', 'stand');

        assert(end.gamePhase === 'settle');
        assert(end.hands.filter((hand) => hand.result === 'win').length === 2);
        expect(end.bank - start.bank).toBe(10);
    });

    it('pays out 3:2 blackjack correctly', () => {
        const start: GameState = testState(['AH', 'TD', 'JH', '3D']);
        const end = play(start, 'bet 10');

        assert(end.gamePhase === 'settle');
        expect(end.bank - start.bank).toBe(15);
    });

    it('pays out 6:5 blackjack correctly', () => {
        const start: GameState = testState(['AH', 'TD', 'JH', '3D'], { blackjackPays: 1.2 });
        const end = play(start, 'bet 10');

        assert(end.gamePhase === 'settle');
        expect(end.bank - start.bank).toBe(12);
    });

    it('pays out insurance win correctly', () => {
        const start: GameState = testState(['2H', 'AD', '3H', 'KD']);
        const end = play(start, 'bet 10', 'insurance 5');

        assert(end.gamePhase === 'settle');
        expect(end.bank).toBe(start.bank);
    });

    it('does not payout for insurance loss', () => {
        const start: GameState = testState(['2H', 'AD', '3H', '7D']);
        const end = play(start, 'bet 10', 'insurance 5', 'stand');

        assert(end.gamePhase === 'settle');
        expect(end.bank - start.bank).toBe(-15);
    });

    it('pays out surrender correctly', () => {
        const start: GameState = testState(['2H', 'TD', '3H', '3D']);
        const end = play(start, 'bet 10', 'surrender');

        assert(end.gamePhase === 'settle');
        expect(end.bank - start.bank).toBe(-5);
    });

    it('pays out blackjack v blackjack correctly', () => {
        // King upcard, even money is never offered
        const start: GameState = testState(['AH', 'KD', 'KH', 'AD']);
        const end = play(start, 'bet 10');

        assert(end.gamePhase === 'settle');
        expect(end.bank).toBe(start.bank);
    });

    it('pays out even money correctly', () => {
        const start: GameState = testState(['AH', 'AD', 'KH', 'KD']);
        const end = play(start, 'bet 10', 'evenMoney');

        assert(end.gamePhase === 'settle');
        expect(end.bank - start.bank).toBe(10);
    });

    it('does not payout for declining even money', () => {
        const start: GameState = testState(['AH', 'AD', 'KH', 'KD']);
        const end = play(start, 'bet 10', 'insurance 0');

        assert(end.gamePhase === 'settle');
        expect(end.bank - start.bank).toBe(0);
    });

    it('refreshes the shoe when past the cutcard', () => {
        const start: GameState = testState(['AH', 'TD', '9H', '7D']);
        const shoeAdvanced = {...start, shoe: {...start.shoe, cardsDealt: 76}};
        const end = play(shoeAdvanced, 'bet 10', 'stand');

        assert(end.gamePhase === 'settle');
        expect(end.shoe.cardsDealt).toBe(0);
        expect(end.shoe.cardsRemaining.length).toBe(104);
    });
});

describe('maxInsurance', () => {
    it('returns the correct maximum with surplus bank', () => {
        const max = maxInsurance(10, 999999);
        expect(max).toBe(5);
    });

    it('returns bank amount without surplus bank', () => {
        const max = maxInsurance(10, 2);
        expect(max).toBe(2);
    });

    it('throws an error if bet is nonsensical', () => {
        expect(() => maxInsurance(0, 999999)).toThrow();
        expect(() => maxInsurance(-10, 999999)).toThrow();
    });
});

describe('legalMoves', () => {
    it('returns all possible moves for splittable hands', () => {
        const start: GameState = testState(['8H', 'TD', '8H', '3D']);
        const end = play(start, 'bet 10');
        assert(end.gamePhase === 'play');
        expect(legalMoves(end.hands[0]!, end.rules, end)).toEqual(['H', 'S', 'D', 'P', 'R']);
    });

    it('does not allow surrenders when forbidden', () => {
        const start: GameState = testState(['8H', 'TD', '8H', '3D'], { surrender: false });
        const end = play(start, 'bet 10');
        assert(end.gamePhase === 'play');
        expect(legalMoves(end.hands[0]!, end.rules, end)).toEqual(['H', 'S', 'D', 'P']);
    });

    it('disallows splitting and doubling with insufficient money', () => {
        const start: GameState = testState(['8H', 'TD', '8H', '3D']);
        const end = play(start, 'bet 500000');
        assert(end.gamePhase === 'play');
        expect(legalMoves(end.hands[0]!, end.rules, end)).toEqual(['H', 'S', 'R']);
    });

    it('allows only splitting on split ace pairs', () => {
        const start: GameState = testState(['AH', 'TD', 'AH', '3D', 'AS', '8H']);
        const end = play(start, 'bet 10', 'split');
        assert(end.gamePhase === 'play');
        expect(legalMoves(end.hands[0]!, end.rules, end)).toEqual(['S', 'P']);
    });

    it('disallows split double and surrender after hit', () => {
        const start: GameState = testState(['8H', 'TD', '8H', '3D', '2H']);
        const end = play(start, 'bet 10', 'hit');
        assert(end.gamePhase === 'play');
        expect(legalMoves(end.hands[0]!, end.rules, end)).toEqual(['H', 'S']);
    });

    it('does not allow DAS when forbidden', () => {
        const start: GameState = testState(['8H', 'TD', '8H', '3D', '2H'], { das: false });
        const end = play(start, 'bet 10', 'split');
        assert(end.gamePhase === 'play');
        expect(legalMoves(end.hands[0]!, end.rules, end)).toEqual(['H', 'S']);
    });
});

describe('combineDecks', () => {
    it('returns number of decks * 52 cards', () => {
        expect(combineDecks(1).length).toBe(52);
        expect(combineDecks(2).length).toBe(104);
        expect(combineDecks(4).length).toBe(208);
        expect(combineDecks(6).length).toBe(312);
        expect(combineDecks(8).length).toBe(416);
    });

    it('returns [decks] copies of each card', () => {
        const decks = 6;
        const combined = combineDecks(decks);
        const counts = PLAYING_CARDS.map((card) =>
            combined.filter((copy) => copy.rank === card.rank && copy.suit === card.suit).length);

        expect(counts).toEqual(PLAYING_CARDS.map(() => decks));
    });
});

describe('shuffleDecks', () => {
    it('returns the same size deck as passed', () => {
        expect(shuffleDecks(combineDecks(1)).length).toBe(52);
        expect(shuffleDecks(combineDecks(2)).length).toBe(104);
        expect(shuffleDecks(combineDecks(4)).length).toBe(208);
        expect(shuffleDecks(combineDecks(6)).length).toBe(312);
        expect(shuffleDecks(combineDecks(8)).length).toBe(416);
    });

    it('returns a permutation of the decks passed', () => {
        const decks = 2;
        const beforeShuffle: Card[] = combineDecks(decks);
        const baseCounts = PLAYING_CARDS.map((card) => 
            beforeShuffle.filter((copy) => card.rank === copy.rank && card.suit === copy.suit).length);
        const shuffled: Card[] = shuffleDecks(beforeShuffle);
        const shuffledCounts = PLAYING_CARDS.map((card) => 
            shuffled.filter((copy) => card.rank === copy.rank && card.suit === copy.suit).length);

        // Ensure shuffle isn't mutating what is passed
        expect(beforeShuffle).toEqual(combineDecks(decks));
        expect(shuffledCounts).toEqual(baseCounts);
        expect(shuffled).not.toEqual(beforeShuffle);
    });
});

describe('getCutCardPosition', () => {
    it('can return a notch-accurate cutcard position', () => {
        const seventyFivePen: RuleSet = testState([]).rules;
        let position: number = getCutCardPosition(seventyFivePen);
        expect(position).toBe(77);

        const twoThirdsPen = {...seventyFivePen,  penetration: (2/3)};
        position = getCutCardPosition(twoThirdsPen);
        expect(position).toBe(68);

        const halfPen = {...seventyFivePen, penetration: 0.5};
        position = getCutCardPosition(halfPen);
        expect(position).toBe(51);

        let doubled: RuleSet = {...seventyFivePen, decks: 4};
        position = getCutCardPosition(doubled);
        expect(position).toBe(155);

        doubled = {...twoThirdsPen, decks: 4};
        position = getCutCardPosition(doubled);
        expect(position).toBe(138);

        doubled = {...halfPen, decks: 4};
        position = getCutCardPosition(doubled);
        expect(position).toBe(103);
    });

    it('keeps a jittered cutcard within bounds', () => {
        // CUTCARD PENETRATION
        const cutcardPen: RuleSet = testState([], { penMode: 'cutcard' }).rules;
        const positions = Array.from({ length: 100 }, () => getCutCardPosition(cutcardPen));

        for (const position of positions) {
            expect(position).toBeGreaterThanOrEqual(Math.floor(0.4 * (cutcardPen.decks * 52 - 1)));
            expect(position).toBeLessThanOrEqual(Math.floor(0.88 * (cutcardPen.decks * 52 - 1)));
        }
        
        // Ensure that the positions are unique values
        expect(new Set(positions).size).toBeGreaterThan(1);
    });

    it('keeps a dealer placed cutcard within bounds', () => {
        // DEALER PENETRATION
        const dealerPen: RuleSet = testState([], { penMode: 'dealer' }).rules;
        const dealerPositions = Array.from({ length: 100 }, () => getCutCardPosition(dealerPen));

        for (const position of dealerPositions) {
            expect(position).toBeGreaterThanOrEqual(Math.floor(0.4 * (dealerPen.decks * 52 - 1)));
            expect(position).toBeLessThanOrEqual(Math.floor(0.88 * (dealerPen.decks * 52 - 1)));
        }
        
        // Ensure that the positions are unique values
        expect(new Set(dealerPositions).size).toBeGreaterThan(1);
    });
});

describe('refreshShoe', () => {
    it('resets cardsDealt of the passed shoe', () => {
        const start: GameState = testState([]);
        const shoeAdvanced = {...start, shoe: {...start.shoe, cardsDealt: 50}};
        const end = refreshShoe(shoeAdvanced);

        expect(end.shoe.cardsDealt).toBe(0);
    });

    it('refills a shoe minus in-play cards', () => {
        const start: GameState = testState([]);
        const inPlay: readonly Card[] = [{rank: 'A', suit: 'H'}, {rank: 'A', suit: 'S'}, {rank: 'A', suit: 'C'}, {rank: 'A', suit: 'D'}];
        const end = refreshShoe(start, inPlay);
        expect(end.shoe.cardsRemaining.length).toBe(100);

        const doubled = testState([], { decks: 4 });
        const doubledEnd = refreshShoe(doubled, inPlay);
        expect(doubledEnd.shoe.cardsRemaining.length).toBe(204);
    });

    it('does not duplicate in-play cards', () => {
        const start: GameState = testState([]);
        const inPlay: readonly Card[] = [{rank: 'J', suit: 'H'}, {rank: '5', suit: 'S'}, {rank: 'T', suit: 'C'}, {rank: 'A', suit: 'D'}];
        const end = refreshShoe(start, inPlay);
        const counts = inPlay.map((card) => 
            end.shoe.cardsRemaining.filter((copy) => copy.rank === card.rank && copy.suit === card.suit).length);

        expect(counts).toEqual(inPlay.map(() => start.rules.decks - 1));
    });
});

describe('suitSymbol', () => {
    it('returns the symbol for every suit', () => {
        expect(suitSymbol('S')).toBe('♠');
        expect(suitSymbol('C')).toBe('♣');
        expect(suitSymbol('H')).toBe('♥');
        expect(suitSymbol('D')).toBe('♦');
    });
});

describe('cardValue', () => {
    it('returns 11 for every ace', () => {
        const aces: readonly Card[] = parseCards(['AS', 'AC', 'AH', 'AD']);
        expect(aces.map((card) => cardValue(card))).toEqual([11, 11, 11, 11]);
    });

    it('returns 10 for tens and every face card', () => {
        const tens: readonly Card[] = parseCards(['TH', 'JH', 'QH', 'KH']);
        expect(tens.map((card) => cardValue(card))).toEqual([10, 10, 10, 10]);
    });

    it('returns the pip value for number cards', () => {
        const numbers: readonly Card[] = parseCards(['2H', '3H', '4H', '5H', '6H', '7H', '8H', '9H']);
        expect(numbers.map((card) => cardValue(card))).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    });
});

describe('cardsFromHand', () => {
    it('returns the cards of a player hand', () => {
        const hand: Hand = testHand(['8H', '3D']);
        expect(cardsFromHand(hand)).toEqual(parseCards(['8H', '3D']));
    });

    it('returns dealer cards in dealt order', () => {
        const dealer: DealerHand = testDealerHand(['TD', '7S', '4H']);
        expect(cardsFromHand(dealer)).toEqual(parseCards(['TD', '7S', '4H']));
    });

    it('skips a hole card that has not been dealt', () => {
        const dealer: DealerHand = testDealerHand(['TD']);
        expect(cardsFromHand(dealer)).toEqual(parseCards(['TD']));
    });

    it('reads both hands of a game in play', () => {
        const start: GameState = testState(['8H', 'TD', '3H', '7D']);
        const end = play(start, 'bet 10');

        assert(end.gamePhase === 'play');
        expect(cardsFromHand(end.hands[0]!)).toEqual(parseCards(['8H', '3H']));
        expect(cardsFromHand(end.dealerHand)).toEqual(parseCards(['TD', '7D']));
    });
});

describe('handTotal', () => {
    it('adds up a hard hand', () => {
        expect(handTotal(testHand(['TD', '7S']))).toBe(17);
    });

    it('counts an ace as 11 when it fits', () => {
        expect(handTotal(testHand(['AH', '6D']))).toBe(17);
    });

    it('demotes an ace to avoid busting', () => {
        expect(handTotal(testHand(['AH', '6D', 'TS']))).toBe(17);
    });

    it('demotes only as many aces as it needs', () => {
        expect(handTotal(testHand(['AH', 'AS', '9D']))).toBe(21);
        expect(handTotal(testHand(['AH', 'AS', 'AC', 'AD']))).toBe(14);
    });

    it('totals a busted hand above 21', () => {
        expect(handTotal(testHand(['TD', '7S', '8H']))).toBe(25);
    });

    it('totals a dealer hand the same way', () => {
        expect(handTotal(testDealerHand(['AD', '6S']))).toBe(17);
        expect(handTotal(testDealerHand(['AD', '6S', 'TH']))).toBe(17);
    });
});

describe('isBlackjack', () => {
    it('accepts a two card 21 from either order', () => {
        expect(isBlackjack(testHand(['AH', 'KD']))).toBe(true);
        expect(isBlackjack(testHand(['TD', 'AS']))).toBe(true);
    });

    it('rejects a 21 reached from a split', () => {
        expect(isBlackjack(testHand(['AH', 'KD'], { fromSplit: true }))).toBe(false);
    });

    it('rejects a three card 21', () => {
        expect(isBlackjack(testHand(['7H', '7D', '7S']))).toBe(false);
    });

    it('rejects a hand under 21', () => {
        expect(isBlackjack(testHand(['AH', '9D']))).toBe(false);
    });

    it('accepts a dealer blackjack from either card', () => {
        expect(isBlackjack(testDealerHand(['AD', 'KS']))).toBe(true);
        expect(isBlackjack(testDealerHand(['KS', 'AD']))).toBe(true);
    });

    it('rejects a dealer 21 that was drawn to', () => {
        expect(isBlackjack(testDealerHand(['7D', '7S', '7H']))).toBe(false);
    });

    it('matches the blackjack that settles a bet', () => {
        const start: GameState = testState(['AH', 'TD', 'JH', '3D']);
        const end = play(start, 'bet 10');

        assert(end.gamePhase === 'settle');
        expect(isBlackjack(end.hands[0]!)).toBe(true);
        expect(isBlackjack(end.dealerHand)).toBe(false);
    });
});
