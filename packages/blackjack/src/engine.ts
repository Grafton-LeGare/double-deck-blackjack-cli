import type {
    Suit, Card, Shoe, RuleSet, DealerHand, Hand, Action, PlayerAction, GameState, 
    GameEvent, Step,
} from './blackjack-types.ts';

import { SUIT_SYMBOLS, PLAYING_CARDS } from './blackjack-types.ts';

export function reduce(state: GameState, action: PlayerAction): Step {
    // ONLY CALL THIS FUNCTION WHEN THE PLAYER HITS ENTER
    const PREV_STATE = state;
    const EVENTS: GameEvent[] = [];

    switch (action.type) {
        case 'bet': {
            // Finish Game/State setup with amount wagered. Also functions as a reset
            state = {
                ...state, 
                bank: state.bank - action.amount,
                hands: [{
                    cards: [],
                    bet: action.amount,
                    fromSplit: false,
                    result: 'pending'
                }],
                dealerHand: {
                    drawn: [],
                    playedOut: false
                },
                activeHand: 0,
                insurance: 0
            };

            // The player has bet -> deal out cards and check for player blackjack
            state = hit(hit(hit(hit(state, 'player', EVENTS), 'dealer', EVENTS), 'player', EVENTS), 'dealer', EVENTS);

            const startingHand: Hand | undefined = state.hands[state.activeHand];
            if (!startingHand) throw new Error("Starting hand is undefined after the initial deal.");
            const upcard: Card | undefined = state.dealerHand.upcard;
            if (!upcard) throw new Error("Dealer upcard is undefined after the initial deal.");
            if (isBlackjack(startingHand)) {
                if (upcard.rank === 'A') {
                    // Offer even money on Blackjack vs A
                    return {before: PREV_STATE, action: action, after: {...state, gamePhase: 'insurance'}, events: EVENTS};
                }
                return {before: PREV_STATE, action: action, after: settleHands(state, EVENTS), events: EVENTS};
            }

            // Offer insurance on dealer ace
            if (upcard.rank === 'A' && state.bank >= 1) {
                // Transition to insurance offer
                return {before: PREV_STATE, action: action, after: {...state, gamePhase: 'insurance'}, events: EVENTS};
            }

            // Check for dealer blackjack
            if (isBlackjack(state.dealerHand)) {
                return {before: PREV_STATE, action: action, after: settleHands(state, EVENTS), events: EVENTS};
            }

            // Transition to gameplay
            return {before: PREV_STATE, action: action, after: {...state, gamePhase: 'play'}, events: EVENTS};
        }
        case 'insurance': {
            // Record and deduct insurance bet
            state = {...state, insurance: action.amount, bank: state.bank - action.amount};

            // Dealer checks for blackjack
            // player blackjack vs A also goes through this flow
            const startingHand: Hand | undefined = state.hands[state.activeHand];
            if (isBlackjack(state.dealerHand) || (startingHand && isBlackjack(startingHand))) {
                return {before: PREV_STATE, action: action, after: settleHands(state, EVENTS), events: EVENTS};
            }
            else {
                return {before: PREV_STATE, action: action, after: {...state, gamePhase: 'play'}, events: EVENTS};
            }
        }
        case 'evenMoney': {
            // Even money IS the insurance bet a natural would have to make to lock in 1:1 --
            // half the wager, paid 2:1 on a dealer natural, lost otherwise. Settling it as that
            // bet lands on +1x the wager down both branches, and keeps one payout path.
            const currentHand: Hand | undefined = state.hands[state.activeHand];
            if (!currentHand || !isBlackjack(currentHand)) throw new Error("Current hand is not blackjack or is undefined after taking Even Money.");

            const evenMoneyBet = currentHand.bet / 2;
            state = {...state, insurance: evenMoneyBet, bank: state.bank - evenMoneyBet};

            return {before: PREV_STATE, action: action, after: settleHands(state, EVENTS), events: EVENTS};
        }
        case 'hit': {
            state = hit(state, 'player', EVENTS);

            // Check whether the player busted and settle accordingly
            const currentHand: Hand | undefined = state.hands[state.activeHand];
            if (!currentHand) {
                throw new Error("Current hand became undefined after hitting.");
            }
            else {               
                if(handTotal(currentHand) > 21) {
                    if(isLastHand(state)) return {before: PREV_STATE, action: action, after: settleHands(state, EVENTS), events: EVENTS};
                    return {before: PREV_STATE, action: action, after: activateNextHand(state, EVENTS), events: EVENTS};
                }
                else {
                    return {before: PREV_STATE, action: action, after: {...state}, events: EVENTS};
                }
            }
        }
        case 'stand': {
            if (isLastHand(state)) return {before: PREV_STATE, action: action, after: settleHands(state, EVENTS), events: EVENTS};
            return {before: PREV_STATE, action: action, after: activateNextHand(state, EVENTS), events: EVENTS};
        }
        case 'double': {
            const currentHand: Hand | undefined = state.hands[state.activeHand];
            if (!currentHand) {
                throw new Error(`Attempted to double an undefined hand (${state.activeHand + 1}/${state.hands.length}).`);
            }
            else {
                state = hit(state, 'player', EVENTS);
                state = {
                    ...state,
                    hands: state.hands.map((hand, index) => index == state.activeHand ? 
                        { ...hand, bet: hand.bet * 2}
                        : hand),
                    bank: state.bank - currentHand.bet
                }

                if (isLastHand(state)) return {before: PREV_STATE, action: action, after: settleHands(state, EVENTS), events: EVENTS};
                return {before: PREV_STATE, action: action, after: activateNextHand(state, EVENTS), events: EVENTS};
            }    
        }
        case 'split': {
            const currentHand: Hand | undefined = state.hands[state.activeHand];
            if (!currentHand) {
                throw new Error(`Attempted to split an undefined hand (${state.activeHand + 1}/${state.hands.length}).`);
            }
            state = split(state, EVENTS);

            // Aces were split -> game may need to be settled now
            if (currentHand.cards[0]?.rank == 'A') {
                let nextHand = -1;
                let index: number = 0;
                for (const hand of state.hands) {
                    if (hand.cards[0]?.rank == 'A' && hand.cards[1]?.rank == 'A') {
                        nextHand = index;
                        break;
                    }
                    index++;
                }
                return nextHand == -1 ?
                    {before: PREV_STATE, action: action, after: settleHands(state, EVENTS), events: EVENTS}
                    : {before: PREV_STATE, action: action, after: {...state, activeHand: nextHand}, events: EVENTS};
            }
            else {
                return {before: PREV_STATE, action: action, after: {...state}, events: EVENTS};
            }
        }
        case 'surrender': {
            return {before: PREV_STATE, action: action, after: settleSurrender(state, EVENTS), events: EVENTS};
        }
    }
}

function hit(state: GameState, to: 'player' | 'dealer', log: GameEvent[]): GameState {
    // Nothing left to deal -> refresh the shoe around the cards still in play
    if (state.shoe.cardsRemaining.length == 0) {
        const inPlay: Card[] = [...state.hands.flatMap((hand) => cardsFromHand(hand)), ...cardsFromHand(state.dealerHand)];
        state = refreshShoe(state, inPlay);
        log.push({type: 'reshuffle', cause: 'empty'});
    }

    const nextCard: Card | undefined = state.shoe.cardsRemaining[0];
    if (!nextCard) throw new Error("Could not get next card from shoe during hit.");
    const shoe: Shoe = {...state.shoe, cardsDealt: state.shoe.cardsDealt + 1, cardsRemaining: state.shoe.cardsRemaining.slice(1)};

    if (to == 'player') {
        if (!state.hands[state.activeHand]) throw new Error(`Attempted to hit to an undefined hand (${state.activeHand + 1}/${state.hands.length}).`);

        return {
            ...state,
            shoe: shoe,
            hands: state.hands.map((hand, index) =>
                index == state.activeHand ?
                    {...hand, cards: [...hand.cards, nextCard]}
                    : hand)
        };
    }
    else {
        const dealerHand: DealerHand = state.dealerHand;
        let resultingHand: DealerHand;
        if (!dealerHand.upcard) {
            resultingHand = {...dealerHand, upcard: nextCard};
        }
        else if (!dealerHand.hole) {
            resultingHand = {...dealerHand, hole: nextCard};
        }
        else {
            resultingHand = {...dealerHand, drawn: [...dealerHand.drawn, nextCard]};
        }

        return {
            ...state,
            shoe: shoe,
            dealerHand: resultingHand
        };
    }
}

function split(state: GameState, log: GameEvent[]): GameState {
    const currentHand: Hand | undefined = state.hands[state.activeHand];
    if (!currentHand) {
        throw new Error(`Current hand became undefined between reduce and split (${state.activeHand + 1}/${state.hands.length}).`);
    }
    const bet = currentHand.bet;
    const [firstCard, secondCard] = cardsFromHand(currentHand);
    if (bet && firstCard && secondCard) {
        state = {
            ...state,
            hands: [
                ...state.hands.slice(0, state.activeHand), 
                {
                    cards: [firstCard],
                    fromSplit: true,
                    bet: bet,
                    result: 'pending'
                },
                {
                    cards: [secondCard],
                    fromSplit: true,
                    bet: bet,
                    result: 'pending'
                },
                ...state.hands.slice(state.activeHand + 1)
            ],
            bank: state.bank - bet
        };
        state = hit(state, 'player', log);

        // Split aces are both hit -> Hit next hand as well then return activeHand to normal
        if (currentHand.cards[0]?.rank == 'A') {
            state = hit({...state, activeHand: state.activeHand + 1}, 'player', log);
            state = {...state, activeHand: state.activeHand - 1};
        }
        return {...state};
    }

    throw new Error(`Attempted to split hand (${state.activeHand + 1}/${state.hands.length}) whose bet or one of its two cards is undefined.`);
}

function activateNextHand(state: GameState, log: GameEvent[]): GameState {
    // Playing right to left activeHand + 1 is always next
    state = {...state, activeHand: state.activeHand + 1};
    const currentHand: Hand | undefined = state.hands[state.activeHand];
    if (!currentHand) {
        throw new Error(`Attempted to activate an undefined hand (${state.activeHand + 1}/${state.hands.length}).`);
    }
    else {
        // If hand is from a non-ace split it needs an extra card
        return currentHand.cards.length < 2 ? hit(state, 'player', log) : {...state};
    }
}

function settleHands(state: GameState, log: GameEvent[]): GameState {
    // Transition to settle -- the CLI reveals the hole off playedOut and gamePhase
    state = {...state, gamePhase: 'settle'};

    // Dealer play - yep this is it
    // Don't play if player fully busted or has natural blackjack
    const naturalBlackjack = state.hands.some(isBlackjack);
    if (state.hands.some((hand) => handTotal(hand) <= 21) && !naturalBlackjack && !isBlackjack(state.dealerHand)) {
        state = {...state, dealerHand: {...state.dealerHand, playedOut: true}};
        while (handTotal(state.dealerHand) < 17 ||
            (handTotal(state.dealerHand) == 17 && hardOrSoft(state.dealerHand) == 'soft' && state.rules.h17)) 
        {
            state = hit(state, 'dealer', log);
        }
    }
    const dealerBlackjack = isBlackjack(state.dealerHand);

    // Payout insurance on dealer blackjack - can be added regardless of win/loss/insurance because default is 0
    if (dealerBlackjack) state = {...state, bank: state.bank + state.insurance * 3};
    
    // Compare each hand to dealer -> Payout chips and assign result
    let totalPayout: number = 0;
    const settledHands: Hand[] = state.hands.map((hand) => {
        if (dealerBlackjack) {
            if (!isBlackjack(hand)) {
                return {...hand, result: 'loss'};
            }
            else {
                totalPayout += hand.bet;
                return {...hand, result: 'push'};
            }
        }
        else {
            if (handTotal(hand) > 21 ) {
                return {...hand, result: 'loss'};
            }
            else if (handTotal(hand) > handTotal(state.dealerHand) || handTotal(state.dealerHand) > 21) {
                totalPayout += isBlackjack(hand) ? hand.bet * (1 + state.rules.blackjackPays) : hand.bet * 2;
                return {...hand, result: 'win'};
            }
            else if (handTotal(hand) < handTotal(state.dealerHand)) {
                return {...hand, result: 'loss'};
            }
            else {
                totalPayout += hand.bet;
                return {...hand, result: 'push'};
            }
        }
    });

    // Game is over -> refresh the shoe if needed
    if (needsRefresh(state.shoe)) {
        state = refreshShoe(state);
        log.push({type: 'reshuffle', cause: 'cutcard'});
    }

    return {...state, hands: settledHands, bank: state.bank + totalPayout};
}

function settleSurrender(state: GameState, log: GameEvent[]): GameState {
    const bet = state.hands[0]?.bet;
    const currentHand: Hand | undefined = state.hands[0];
    if (!bet || !currentHand) {     
        throw new Error('Error returning bet to player: current hand or its bet is undefined.');
    }
    else {
        // Game is over -> refresh the shoe if needed
        if (needsRefresh(state.shoe)) {
            state = refreshShoe(state);
            log.push({type: 'reshuffle', cause: 'cutcard'});
        }

        // Return 1/2 bet, switch phase to settle, record surrender, reveal hole card
        return {
            ...state, 
            hands: [{
                cards: currentHand.cards,
                fromSplit: currentHand.fromSplit,
                bet: currentHand.bet,
                result: 'surrender'
            }],
            gamePhase: 'settle', 
            bank: state.bank + bet / 2
        };
    }
}

function isLastHand(state: GameState): boolean {
    return state.activeHand == state.hands.length - 1;
}

/*  ----- Utility functions ----- */

// #region Shoe
export function combineDecks(numDecks: number): Card[] {
    return PLAYING_CARDS.flatMap((card) => Array.from({ length: numDecks }, () => card));
}

export function shuffleDecks(deck: readonly Card[]): Card[] {
    const shuffled: Card[] = [...deck];
    const n = shuffled.length;
    for (let i = n - 1; i > 0; i--) {
        let strike: number = Math.floor(Math.random() * (i + 1));
        [shuffled[strike], shuffled[i]] = [shuffled[i]!, shuffled[strike]!];
    }
    return shuffled;
}

export function getCutCardPosition(rules: RuleSet): number {
    const defaultPen = rules.penetration;
    let adjustedPen: number;
    if (rules.penMode == 'notch') {
        // A notch sits at a fixed depth -- no dealer-to-dealer variance to apply
        adjustedPen = defaultPen;
    }
    else {
        // Minimum 0.4, maximum 0.88, variance -jitter : +jitter
        const jitter = jitterFromPenMode(rules.penMode);
        adjustedPen = Math.max(0.40, Math.min(0.88, defaultPen + (Math.random() * 2 - 1) * jitter));
    }
    return Math.floor(adjustedPen * (rules.decks * 52 - 1)); 
}

function needsRefresh(shoe: Shoe): boolean {
    return shoe.cardsDealt > shoe.cutCardPosition;
}

export function refreshShoe(state: GameState, inPlay: readonly Card[] = []): GameState {
    const combinedDeck: Card[] = combineDecks(state.rules.decks);

    // Cards still on the table haven't reached the discard tray -- pull one copy of each out of
    // the fresh shoe so a hand in progress can never be dealt a card it is already holding
    const undealt: Card[] = [...combinedDeck];
    for (const card of inPlay) {
        const index = undealt.findIndex((spare) => spare.rank === card.rank && spare.suit === card.suit);
        if (index >= 0) undealt.splice(index, 1);
    }

    const shuffledDeck: Card[] = shuffleDecks(undealt);
    const freshShoe: Shoe = {
        cutCardPosition: getCutCardPosition(state.rules),
        // Held cards count as dealt -- keeps shoeSize - cardsDealt equal to what's left to draw
        cardsDealt: inPlay.length,
        cardsRemaining: shuffledDeck
    };
    return {...state, shoe: freshShoe};
}

function jitterFromPenMode(mode: Exclude<RuleSet['penMode'], 'notch'>): number {
    return mode === 'cutcard' ? 0.025 : 0.075;
}
// #endregion

// #region Cards
export function suitSymbol(suit: Suit) {
    return SUIT_SYMBOLS[suit];
}

export function cardValue(card: Card): number {
    return card.rank === 'A' ? 11 : ['T', 'J', 'Q', 'K'].includes(card.rank) ? 10 : +card.rank;
}

export function cardsFromHand(hand: Hand | DealerHand): readonly Card[] {
    return 'cards' in hand
        ? hand.cards
        : [hand.upcard, hand.hole, ...hand.drawn].filter((card): card is Card => card != undefined);
}

export function handTotal(hand: Hand | DealerHand): number {
    const cards: readonly Card[] = cardsFromHand(hand);

    let total = 0, numAces = 0;
    for (const card of cards) {
        total += cardValue(card);
        if (card.rank === 'A') numAces++;
    }
    while (total > 21 && numAces > 0) {
        total -= 10;
        numAces--;
    }

    return total;
}

function twoCardHand(hand: Hand): boolean {
    return hand.cards.length === 2;
}

function hardOrSoft(hand: Hand | DealerHand): 'hard' | 'soft' {
    const cards: readonly Card[] = cardsFromHand(hand);

    // Total with every ace counted as 1; the hand is soft if one can be 11 instead
    const minTotal = cards.reduce((total, card) => total + (card.rank === 'A' ? 1 : cardValue(card)), 0);
    return cards.some((card) => card.rank === 'A') && minTotal + 10 <= 21 ? 'soft' : 'hard';
}

function canSplit(hand: Hand, rules: RuleSet, state: GameState): boolean {
    if (!twoCardHand(hand)) return false;
    const [firstCard, secondCard] = hand.cards;
    if (firstCard && secondCard && cardValue(firstCard) === cardValue(secondCard)) {
        if (state.hands.length < rules.maxHands && (firstCard.rank != 'A' || !hand.fromSplit || rules.rsa)) {
            return true;
        }
    }
    return false;
}

export function isBlackjack(hand: Hand | DealerHand): boolean {
    if ('bet' in hand) {
        const hasAce = hand.cards.some((card) => card.rank === 'A');
        return !hand.fromSplit && twoCardHand(hand) && hasAce && handTotal(hand) == 21;
    }
    else {
        return hand.drawn.length == 0 && handTotal(hand) == 21 && (hand.upcard?.rank === 'A' || hand.hole?.rank === 'A');
    }
}
// #endregion

// #region Accounting
export function maxInsurance(bet: number, bank: number): number {
    if (bet <= 0) throw new Error(`Cannot compute max insurance from a bet of $${bet.toFixed(2)}.`);
    return bet / 2 < bank ? bet / 2 : bank;
}
// #endregion

// #region Strategy
export function legalMoves(hand: Hand, rules: RuleSet, state: GameState): Action[] {
    const total = handTotal(hand);
    let legalActions: Action[] = [];
    const splitAceHand = hand.fromSplit && hand.cards[0]?.rank === 'A';
    if (total < 21 && !splitAceHand) legalActions.push('H');
    // Standing is always legal
    legalActions.push('S');
    if (twoCardHand(hand) && !splitAceHand && total < 21 && (!hand.fromSplit || rules.das)) legalActions.push('D');
    if (canSplit(hand, rules, state)) legalActions.push('P');
    if (twoCardHand(hand) && !hand.fromSplit && rules.surrender) legalActions.push('R');

    // Account for bankroll: don't return an action the user can't legally pay for
    if (hand.bet > state.bank) {
        legalActions = legalActions.filter((move) => move != 'D' && move != 'P');
    }
    return legalActions;
}
// #endregion
