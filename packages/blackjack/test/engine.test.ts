import { expect, test, describe, it, assert } from 'vitest';
import type { Card, Rank, Suit, Shoe, Hand, DealerHand, Action, RuleSet, GameState } from '../src/blackjack-types.ts';
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
import { testState } from './fixture.ts';

describe('reduce: split', () => {
    it('splits a hand successfully', () => {
        const start: GameState = testState(['8H', 'TD', '8H', '3D']);
        const afterBet = reduce(start, { type: 'bet', amount: 10 }).after;
        const afterSplit = reduce(afterBet, { type: 'split' }).after;

        expect(afterSplit.hands.length).toBe(2);
        expect(afterSplit.activeHand).toBe(0);
        expect(afterSplit.hands[0]!.cards.length).toBe(2);
        expect(afterSplit.hands[1]!.cards.length).toBe(1);
        expect(afterSplit.bank).toBe(afterBet.bank - 10);
    });

    it('hits both split aces', () => {
        const start: GameState = testState(['AH', 'TD', 'AH', '3D']);
        const afterBet = reduce(start, { type: 'bet', amount: 10 }).after;
        const afterSplit = reduce(afterBet, { type: 'split' }).after;

        expect(afterSplit.hands[0]!.cards.length).toBe(2);
        expect(afterSplit.hands[1]!.cards.length).toBe(2);
    });

    it('allows resplitting aces with RSA', () => {
        const start: GameState = testState(['AH', 'TD', 'AH', '3D', 'AS']);
        const afterBet = reduce(start, { type: 'bet', amount: 10 }).after;
        const afterSplit = reduce(afterBet, { type: 'split' }).after;

        expect(afterSplit.activeHand).toBe(0);
        expect(legalMoves(afterSplit.hands[0]!, afterSplit.rules, afterSplit)).toContain('P');
    });

    it('correctly activates next splittable hand with RSA', () => {
        const start: GameState = testState(['AH', 'TD', 'AH', '3D', 'AS', 'AS', 'AC', '8H', '4H', '5H']);
        const afterBet = reduce(start, { type: 'bet', amount: 10 }).after;
        const afterFirstSplit = reduce(afterBet, { type: 'split' }).after;
        const afterSecondSplit = reduce(afterFirstSplit, { type: 'split' }).after;
        const afterThirdSplit = reduce(afterSecondSplit, { type: 'split' }).after;

        assert(afterThirdSplit.hands.length === 4);
        expect(afterThirdSplit.activeHand).toBe(3);
    });
});