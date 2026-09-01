import type {
    Rank, Suit, Card,
    Shoe, RuleSet, Casino, DealerHand,
    RunningCount, Hand, Action, PlayerAction,
    GameState, GameEvent, Step
} from '../../../packages/blackjack/src/blackjack-types.ts';
import { RANKS, SUITS, SUIT_SYMBOLS, PLAYING_CARDS } from '../../../packages/blackjack/src/blackjack-types.ts';

import type { Animation } from './blackjack-animations.ts';
import { GREETING_ANIMATION, RESHUFFLE_ANIMATION, formatCard, dealAnimation, playerBlackjackAnimation } from './blackjack-animations.ts';

import * as readline from 'node:readline/promises';
import process, { stdin as input, stdout as output } from 'node:process';

// DA RULES
const defaultGameRules: RuleSet = {
    decks: 2,
    h17: true,
    rsa: true,
    das: true,
    maxHands: 4,
    surrender: false,
    blackjackPays: 1.5,
    penetration: 0.75,
    penMode: 'notch'
};
let gameRules: RuleSet = defaultGameRules;

// Build initial shoe
const combinedDeck: Card[] = combineDecks(gameRules.decks);
let shuffledDeck: Card[] = shuffleDecks(combinedDeck);

let shoe: Shoe = {
    decks: gameRules.decks,
    cutCardPosition: getCutCardPosition(gameRules),
    cardsDealt: 0,
    cardsRemaining: shuffledDeck
};

// Initialize Game/State
const STARTING_BANKROLL = 10000;
let firstHand: boolean = true;

let gameState: GameState = {
    rules: gameRules,
    shoe: shoe,
    hands: [],
    dealerHand: { drawn: [], holeRevealed: false, playedOut: false },
    activeHand: 0,
    insurance: 0,
    gamePhase: 'bet',
    bank: STARTING_BANKROLL
};

async function main() {
    output.write('\n');
    await displayAnimation(GREETING_ANIMATION);
    await sleep(0.5);

    let userResponse: string = '';
    do {
        // Pre-game Menu
        printSpaced(`Your current bankroll is $${gameState.bank}`);
        await sleep(1);
        printSpaced("Would you like to play a new hand? (P - Play | Q - Quit | D - Display shoe | R - Reshuffle)");
        await sleep(0.5);

        userResponse = await arrowedPrompt();

        if (userResponse.toLowerCase() == 'p' || userResponse.toLowerCase() == 'play') {
            // Take the player's bet
            if (firstHand) {
                firstHand = false;
                printSpaced("Mazel tov!!!");
                await sleep(1);
            }   
            let bet: number;
            do {
                printSpaced("How much do you bet? ([X] - X dollars)");
                await sleep(0.5);
                bet = Number(await arrowedPrompt());
                if (Number.isNaN(bet)) {
                    printSpaced("Invalid response");
                    await sleep(1);
                    printSpaced("Please enter a valid amount (1, 2, 3, etc.)");
                    await sleep(2);
                }
                else if (bet <= 0 || bet > gameState.bank) {
                    printSpaced("Invalid bet");
                    await sleep(1);
                    printSpaced(`Please limit your bet to ($1 - $${gameState.bank})`);
                    await sleep(2);
                }
            } while (Number.isNaN(bet) || bet <= 0 || bet > gameState.bank);

            // CORE GAME LOOP: reduce -> render -> reduce
            let playerAction: PlayerAction | undefined = {type: 'bet', amount: bet};
            while (playerAction) {
                const step = reduce(gameState, playerAction);
                gameState = step.after;
                playerAction = await render(step);
            }    
            gameState = {...gameState, gamePhase: 'bet'};
        }

        else if (userResponse.toLowerCase() == 'q' || userResponse.toLowerCase() == 'quit') {
            // Quit the game
            printSpaced("See you next time...");
        }

        else if (userResponse.toLowerCase() == 'd' || userResponse.toLowerCase() == 'display') {
            // Display the shoe at current state
            const PER_ROW = 13;
            output.write(formatShoe(gameState.shoe, PER_ROW));
            await sleep(1.25);
        }

        else if (userResponse.toLowerCase() == 'r' || userResponse.toLowerCase() == 'reshuffle') {
            // Refresh the shoe with animated shuffling waiter
            output.write('\r');
            await displayAnimation(RESHUFFLE_ANIMATION);
            gameState = refreshShoe(gameState);
            await sleep(0.5);
        }

        else {
            // Redirect for invalid input
            printSpaced("Invalid response");
            await sleep(1);
            printSpaced("Please choose a selection from the menu (P, Q, D, R)");
            await sleep(2);
        }
    } while (userResponse.toLowerCase() != 'q' && userResponse.toLowerCase() != 'quit');
}

// This application can permanently hide the cursor - this makes sure you always get it back.
process.on('exit', () => output.write("\x1b[?25h"));
process.on('SIGINT', () => process.exit(130));

main();

function reduce(state: GameState, action: PlayerAction): Step {
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
                    holeRevealed: false,
                    playedOut: false
                },
                activeHand: 0,
                insurance: 0
            };

            // The player has bet -> deal out cards and check for player blackjack
            state = hit(hit(hit(hit(state, 'player', EVENTS), 'dealer', EVENTS), 'player', EVENTS), 'dealer', EVENTS);

            // Return before = after = state on error -> before == after is an error signal with a log up until the failure
            const startingHand: Hand | undefined = state.hands[state.activeHand];
            if (!startingHand) return {before: state, action: action, after: state, events: EVENTS};
            if (isBlackjack(startingHand)) {
                return {before: PREV_STATE, action: action, after: settleHands(state, EVENTS), events: EVENTS};
            }

            // Offer insurance on dealer ace
            if (state.dealerHand.upcard?.rank === 'A' && state.bank >= 1) {
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
            if (isBlackjack(state.dealerHand)) {
                return {before: PREV_STATE, action: action, after: settleHands(state, EVENTS), events: EVENTS};
            }
            else {
                return {before: PREV_STATE, action: action, after: {...state, gamePhase: 'play'}, events: EVENTS};
            }
        }
        case 'hit': {
            state = hit(state, 'player', EVENTS);

            // Check whether the player busted and settle accordingly
            const currentHand: Hand | undefined = state.hands[state.activeHand];
            if (!currentHand) {
                return {before: state, action: action, after: state, events: EVENTS};
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
                return {before: state, action: action, after: state, events: EVENTS};
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
                return {before: state, action: action, after: state, events: EVENTS};
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

async function render(step: Step): Promise<PlayerAction | undefined> {
    const STATE = step.after;
    const PHASE = STATE.gamePhase;

    // Process logged internal events before standard game events
    for (const event of step.events) {
        switch (event.type) {
            case 'reshuffle': {
                if (event.cause == 'empty') {
                    printSpaced("Shoe has been emptied");
                    await sleep(1.25);
                    await displayAnimation(RESHUFFLE_ANIMATION);
                    await sleep(0.5);
                }               
                break;
            }
        }
    }

    switch (PHASE) {
        case 'insurance': {
            // Render the deal animation
            const [firstCard, secondCard] = STATE.hands[0]?.cards ?? [];
            const upCard = STATE.dealerHand.upcard;
            if (firstCard && secondCard && upCard) {
                await displayAnimation(dealAnimation(firstCard, secondCard, upCard));
                await sleep(0.5);
            }

            // Offer insurance and take insurance bet
            printSpaced("Dealer is showing an A: would you like to buy insurance? (Y - Yes | N - No)");
            await sleep(1.5);
            const response = await arrowedPrompt();
            if (!['y', 'yes', 'ye', 'yeah'].includes(response.toLowerCase())) {
                printSpaced("Best of luck...");
                await sleep(1.5);

                return { type: 'insurance', amount: 0 };
            }
            else {
                const max = maxInsurance(STATE.hands[0]?.bet, STATE.bank);
                let insuranceBet: number;
                do {
                    printSpaced(`Enter your insurance bet ($1 - $${max})`);
                    insuranceBet = Number(await arrowedPrompt());
                    if (Number.isNaN(insuranceBet) || insuranceBet == 0) {
                        printSpaced("Don't be rude: you already agreed to insurance");
                        await sleep(1);
                        printSpaced("Please enter a valid amount (1, 2, 3, etc.)");
                        await sleep(2);
                    }
                    else if (insuranceBet < 0 || insuranceBet > max) {
                        printSpaced("Invalid insurance bet");
                        await sleep(1);
                        printSpaced(`Please limit your bet to ($1 - $${max})`);
                        await sleep(2);
                    }
                } while (Number.isNaN(insuranceBet) || insuranceBet <= 0 || insuranceBet > max);

                return { type: 'insurance', amount: insuranceBet};
            }
        }
        case 'play': {
            // Render deal animation if coming straight from the bet
            if (step.action.type == 'bet') {
                const [firstCard, secondCard] = STATE.hands[0]?.cards ?? [];
                const upCard = STATE.dealerHand.upcard;
                if (firstCard && secondCard && upCard) {
                    await displayAnimation(dealAnimation(firstCard, secondCard, upCard));
                    await sleep(0.5);
                }
            }

            // Display insurance loss if taken
            if (step.action.type == 'insurance') {
                printSpaced("Dealer does not have blackjack");
                await sleep(1.25);
                if (STATE.insurance > 0) {
                    printSpaced(`Insurance bet loses (-$${STATE.insurance})`);
                    await sleep(2);
                }
            } 

            // Display player bust if last hand went over 21
            const lastHand: Hand | undefined = STATE.hands[step.before.activeHand];
            const hitOrDouble = step.action.type == 'hit' || step.action.type == 'double';
            if (hitOrDouble && lastHand && handTotal(lastHand) > 21) {
                printSpaced("Hand busted");
                await sleep(1.5);
            }

            // Display the gameboard and prompt for user move
            const gameBoard = buildGameBoard(STATE);
            printSpaced(gameBoard);
            await sleep(1);
            const availableActions = availableMoves(STATE);  
            const playerAction: Action = await actionPrompt(availableActions);
            switch(playerAction) {
                case 'H': return { type: 'hit' };
                case 'S': return { type: 'stand' };
                case 'D': return { type: 'double' };
                case 'P': return { type: 'split' };
                case 'R': return { type: 'surrender' };
            }
        }
        case 'settle': {
            // Play animation for player blackjack
            // Only display the deal animation if the player doesn't have blackjack
            if (step.after.hands.some(isBlackjack)) {
                await displayAnimation(playerBlackjackAnimation);
                await sleep(0.5);
            }
            else if (step.action.type == 'bet' && isBlackjack(STATE.dealerHand)) {
                const [firstCard, secondCard] = STATE.hands[0]?.cards ?? [];
                const upCard = STATE.dealerHand.upcard;
                if (firstCard && secondCard && upCard) {
                    await displayAnimation(dealAnimation(firstCard, secondCard, upCard));
                    await sleep(0.5);
                }
            } 

            // Display insurance win if taken
            if (step.action.type == 'insurance') {
                printSpaced("Good instincts: Dealer has blackjack");
                await sleep(1.25);
                printSpaced(`Insurance bet wins (+$${STATE.insurance * 2})`);
                await sleep(2);
            }

            // Display player bust if last hand went over 21
            const lastHand: Hand | undefined = STATE.hands[step.before.activeHand];
            const hitOrDouble = step.action.type == 'hit' || step.action.type == 'double';
            if (hitOrDouble && lastHand && handTotal(lastHand) > 21) {
                printSpaced("Hand busted");
                await sleep(1.5);
            }
            
            // Display settlement & dealer play
            printSpaced('Hands Finished');
            await sleep(1);
            const dealerResult = isBlackjack(STATE.dealerHand) ? 
                'Dealer has blackjack' 
                : handTotal(STATE.dealerHand) > 21 ? 
                'Dealer busts'
                : `Dealer finishes at ${handTotal(STATE.dealerHand)}`;
            printSpaced(dealerResult);
            await sleep(1);
            output.write('RESULTS:\n');
            await sleep(2);

            const handsWon = `${STATE.hands.filter((hand) => hand.result == 'win').length}/${STATE.hands.length}`;
            let playerNet = STATE.hands.reduce((net, hand) => {
                switch (hand.result) {
                    case 'win': return isBlackjack(hand) ? net + hand.bet * STATE.rules.blackjackPays : net + hand.bet;
                    case 'loss': return net - hand.bet;
                    case 'push': return net;
                    case 'surrender': return net - hand.bet / 2;
                    case 'pending': throw new Error('Game phase is settle but pending hand found');
                }
            }, 0);
            if (STATE.insurance > 0) {
                if (isBlackjack(STATE.dealerHand) && STATE.hands.length == 1 && STATE.hands[0]?.result == 'loss') {
                    playerNet += STATE.insurance * 2;
                }
                else {
                    playerNet -= STATE.insurance;
                }
            }
            if (!STATE.hands.some((hand) => hand.result != 'push')) {
                output.write('Push  |  Net $0');
            }
            else {
                output.write(`Player wins ${handsWon} hands  |  Net $${playerNet}`);
            }          
            await sleep(3);
            output.write('\n\n');

            // Reshuffle between rounds if needed
            if (step.events.some((event) => event.type == 'reshuffle' && event.cause == 'cutcard')) {
                printSpaced("Current shoe is exhausted");
                await sleep(1);
                await displayAnimation(RESHUFFLE_ANIMATION);
            }

            // End of game loop
            return undefined;
        }
    }

    return undefined;
}

function hit(state: GameState, to: 'player' | 'dealer', log: GameEvent[]): GameState {
    // Nothing left to deal -> refresh the shoe
    if (state.shoe.cardsRemaining.length == 0) {
        state = refreshShoe(state);
        log.push({type: 'reshuffle', cause: 'empty'});
    }

    const nextCard: Card | undefined = state.shoe.cardsRemaining[0];
    if (!nextCard) return state;
    const shoe: Shoe = {...state.shoe, cardsDealt: state.shoe.cardsDealt + 1, cardsRemaining: state.shoe.cardsRemaining.slice(1)};

    if (to == 'player') {
        if (!state.hands[state.activeHand]) return state;

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
        return state;
    }
    const bet = currentHand.bet;
    const [firstCard, secondCard] = cardsFromHand(currentHand);
    if (bet && firstCard && secondCard) {
        state = {
            ...state,
            hands: state.hands.toSpliced(state.activeHand, 1, 
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
                }
            ),
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

    // Default return on undefined
    return {...state};
}

function activateNextHand(state: GameState, log: GameEvent[]): GameState {
    // Playing right to left activeHand + 1 is always next
    state = {...state, activeHand: state.activeHand + 1};
    const currentHand: Hand | undefined = state.hands[state.activeHand];
    if (!currentHand) {
        throw new Error('Attempted to activate non-existing hand');
    }
    else {
        // If hand is from a non-ace split it needs an extra card
        return currentHand.cards.length < 2 ? hit(state, 'player', log) : {...state};
    }
}

function settleHands(state: GameState, log: GameEvent[]): GameState {
    // Transition to settle and reveal the dealer's hole 
    state = {...state, dealerHand: {...state.dealerHand, holeRevealed: true}, gamePhase: 'settle'};

    // Dealer play - yep this is it
    // Don't play if player fully busted or has natural blackjack
    const naturalBlackjack = state.hands.some(isBlackjack);
    if (state.hands.some((hand) => handTotal(hand) <= 21) && !naturalBlackjack) {
        state = {...state, dealerHand: {...state.dealerHand, playedOut: true}};
        while (handTotal(state.dealerHand) < 17) state = hit(state, 'dealer', log);
        if (handTotal(state.dealerHand) == 17 && hardOrSoft(state.dealerHand) == 'soft' && state.rules.h17) state = hit(state, 'dealer', log);
    }
    const dealerBlackjack = isBlackjack(state.dealerHand);

    // Payout insurance on dealer blackjack - can be added regardless of win/loss/insurance because default is 0
    if (dealerBlackjack) state = {...state, bank: state.bank + state.insurance * 2};
    
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
    if (needsRefresh(gameState.shoe)) {
        state = refreshShoe(state);
        log.push({type: 'reshuffle', cause: 'cutcard'});
    }

    return {...state, hands: settledHands, bank: state.bank + totalPayout};
}

function settleSurrender(state: GameState, log: GameEvent[]): GameState {
    const bet = state.hands[0]?.bet;
    const currentHand: Hand | undefined = state.hands[0];
    if (!bet || !currentHand) {     
        throw new Error('Error returning bet to player');
    }
    else {
        // Game is over -> refresh the shoe if needed
        if (needsRefresh(gameState.shoe)) {
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
            dealerHand: { ...state.dealerHand, holeRevealed: true},
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
function combineDecks(numDecks: number): Card[] {
    return PLAYING_CARDS.flatMap((card) => Array.from({ length: numDecks }, () => card));
}

function shuffleDecks(deck: readonly Card[]): Card[] {
    const shuffled: Card[] = [...deck];
    const n = shuffled.length;
    for (let i = n - 1; i > 0; i--) {
        let strike: number = Math.floor(Math.random() * (i + 1));
        [shuffled[strike], shuffled[i]] = [shuffled[i]!, shuffled[strike]!];
    }
    return shuffled;
}

function getCutCardPosition(rules: RuleSet): number {
    const defaultPen = rules.penetration;
    const jitter = jitterFromPenMode(rules.penMode);
    let adjustedPen: number;
    if (rules.penMode == 'notch') {
        adjustedPen = defaultPen;
    }
    else {
        // Minimum 0.4, maximum 0.88, variance -jitter : +jitter
        adjustedPen = Math.max(0.40, Math.min(0.88, defaultPen + (Math.random() * 2 - 1) * jitter));      
    }
    return Math.floor(adjustedPen * (rules.decks * 52 - 1)); 
}

function needsRefresh(shoe: Shoe): boolean {
    return shoe.cardsDealt > shoe.cutCardPosition;
}

function refreshShoe(state: GameState): GameState {
    const combinedDeck: Card[] = combineDecks(state.rules.decks);
    const shuffledDeck: Card[] = shuffleDecks(combinedDeck);
    const freshShoe: Shoe = {
        decks: state.rules.decks,
        cutCardPosition: getCutCardPosition(state.rules),
        cardsDealt: 0,
        cardsRemaining: shuffledDeck
    };
    return {...state, shoe: freshShoe};
}

function shoeSize(shoe: Shoe): number {
    return shoe.decks * 52;
}

function decksRemaining(shoe: Shoe): number {
    return Math.max(0.25, (shoeSize(shoe) - shoe.cardsDealt) / 52);
}

function jitterFromPenMode(mode: string): number {
    return mode === 'notch' ? 0 : mode === 'cutcard' ? 0.025 : 0.075;
}
// #endregion

// #region Cards
function suitSymbol(suit: Suit) {
    return SUIT_SYMBOLS[suit];
}

function cardValue(card: Card): number {
    return card.rank === 'A' ? 11 : ['T', 'J', 'Q', 'K'].includes(card.rank) ? 10 : +card.rank;
}

function cardsFromHand(hand: Hand | DealerHand): readonly Card[] {
    return 'cards' in hand
        ? hand.cards
        : [hand.upcard, hand.hole, ...hand.drawn].filter((card): card is Card => card != undefined);
}

function handTotal(hand: Hand | DealerHand): number {
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
        if (state.hands.length < rules.maxHands && (firstCard.rank != 'A' || rules.rsa)) {
            return true;
        }
    }
    return false;
}

function isBlackjack(hand: Hand | DealerHand): boolean {
    const cards: readonly Card[] = cardsFromHand(hand);
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
function totalWagered(hands: readonly Hand[]): number {
    return hands.reduce((total, hand) => total + hand.bet, 0);
}

function maxInsurance(bet: number | undefined, bank: number): number {
    if (!bet) return 0;
    return bet / 2 < bank ? bet / 2 : bank;
}
// #endregion

// #region Strategy
function between(num: number, low: number, high: number): boolean {
    return num >= low && num <= high;
}

function situationKey(playerHand: Hand, upcard: Card): string {
    const [firstCard, secondCard] = playerHand.cards;
    if (playerHand.cards.length === 2 && firstCard && secondCard && firstCard.rank === secondCard.rank) {
        return `pair${cardValue(firstCard)}v${cardValue(upcard)}`;
    }
    return `${hardOrSoft(playerHand)}${handTotal(playerHand)}v${cardValue(upcard)}`;
}

function legalMoves(hand: Hand, rules: RuleSet, state: GameState): Action[] {
    const total = handTotal(hand);
    let legalActions: Action[] = [];
    const splitAceHand = hand.fromSplit && hand.cards[0]?.rank === 'A';
    if (total < 21 && !splitAceHand) legalActions.push('H');
    // Standing is always legal
    legalActions.push('S');
    if (twoCardHand(hand) && !splitAceHand && (!hand.fromSplit || rules.das)) legalActions.push('D');
    if (canSplit(hand, rules, state)) legalActions.push('P');
    if (twoCardHand(hand) && !hand.fromSplit && rules.surrender) legalActions.push('R');
    return legalActions;
}

function availableMoves(state: GameState): Action[] {
    const currentHand: Hand | undefined = state.hands[state.activeHand]; 
    if (!currentHand) return [];
    let availableActions: Action[] = legalMoves(currentHand, state.rules, state);
    if (currentHand.bet > state.bank) {
        availableActions = availableActions.filter((move) => move != 'D' && move != 'P');
    }
    return availableActions;   
}
// #endregion

// #region Input/Output
function printSpaced(msg: string) {
    console.log(`${msg}\n`);
}

function sleep(duration: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, duration * 1000));
}

async function arrowedPrompt(): Promise<string> {
    const reader: readline.Interface = readline.createInterface(input, output);
    const response: string = await reader.question("> ");
    reader.close();
    await sleep(0.5);
    output.write('\n');
    return response;
}

const INVALID_MOVE_MESSAGE = "Invalid selection! Please select a legal move";
const INVALID_MOVE_DURATION = 2;

// Re-prompts until the move is legal, wiping the rejected input and the warning in place
async function actionPrompt(legalActions: readonly Action[]): Promise<Action> {
    const reader: readline.Interface = readline.createInterface(input, output);
    try {
        while (true) {
            const response: string = await reader.question("> ");
            const playerAction: Action | undefined = parseAction(response);
            if (playerAction && legalActions.includes(playerAction)) {
                await sleep(0.5);
                output.write('\n');
                return playerAction;
            }

            // The cursor sits on the line under the arrow; the extra newline leaves the gap
            output.write(`\n${INVALID_MOVE_MESSAGE}`);
            await sleep(INVALID_MOVE_DURATION);

            // Walk back up to the arrow -- a saved row goes stale the moment the screen scrolls
            const columns: number = output.columns ?? 80;
            const promptRows: number = Math.max(1, Math.ceil(`> ${response}`.length / columns));
            const messageRows: number = Math.max(1, Math.ceil(INVALID_MOVE_MESSAGE.length / columns));
            output.write(`\x1b[${promptRows + messageRows}A\x1b[G\x1b[J`);
        }
    }
    finally {
        reader.close();
    }
}

function parseAction(input: string): Action | undefined {
    input = input.toLowerCase();
    if (['h', 'hi', 'hit', 'hits'].includes(input)) return 'H';
    if (['s', 'st', 'stan', 'stay', 'stand', 'stands'].includes(input)) return 'S';
    if (['d', 'do', 'doub', 'double', 'doubles'].includes(input)) return 'D';
    if (['p', 'sp', 'spl', 'split', 'splits'].includes(input)) return 'P';
    if (['r', 'su', 'sur', 'surren', 'surrender', 'surrenders'].includes(input)) return 'R';
    return undefined;
}

function formatShoe(shoe: Shoe, perRow: number): string {
    let formattedShoe: string = '';
            
    const PER_ROW = perRow;
    const LEN = shoe.cardsRemaining.length;

    // Format the shoe with i rows and j columns
    for (let i = 0; i < Math.floor(LEN / PER_ROW); i++) {              
        for (let j = 0; j < PER_ROW; j++) {
            const nextCard: Card | undefined = shoe.cardsRemaining[i * PER_ROW + j];
            if (nextCard != undefined) {
                formattedShoe += `${nextCard.rank}${suitSymbol(nextCard.suit)} `;
            }
        }
        formattedShoe += '\n';
    }

    // Append partial last row if needed
    for (let i = LEN - (LEN % PER_ROW); i < LEN; i++) {
        const nextCard: Card | undefined = shoe.cardsRemaining[i];
        if (nextCard != undefined) {
            formattedShoe += `${nextCard.rank}${suitSymbol(nextCard.suit)} `; 
        }
        if (i == LEN - 1) formattedShoe += '\n';
    }

    // Add spacer
    formattedShoe += '\n';

    return formattedShoe;
}

async function displayAnimation(animation: Animation): Promise<void> {
    const FRAME_COUNT = animation.frames.length;
    const TIME_PER_FRAME = animation.timePerFrame;
    const DURATION = animation.duration; 

    // Hide the cursor so it doesn't flicker between frames; always give it back
    output.write("\x1b[?25l");
    try {
        output.write("\x1b[s");
        for (let i = 0; i < DURATION / TIME_PER_FRAME; i++) {
            const frame: string = animation.frames[i % FRAME_COUNT] ?? '';
            output.write("\x1b[u");
            output.write("\x1b[J");
            output.write(frame);
            await sleep(TIME_PER_FRAME);
        }
    }
    finally {
        output.write("\x1b[?25h");
    }

    // Spacing buffer
    output.write("\n\n");
}

function buildGameBoard(state: GameState): string {
    const upCard = state.dealerHand.upcard;
    const currentHand = state.hands[state.activeHand];
    if (!upCard || !currentHand) {
        return '\n   ERROR DISPLAYING GAME BOARD\n';
    }
    else {
        const h17 = state.rules.h17 ? 'H17' : 'S17';
        const das = state.rules.das ? 'DAS' : 'NDAS';
        const rsa = state.rules.rsa ? 'RSA Allowed' : 'RSA Unallowed';
        const bjPays = state.rules.blackjackPays == 1.5 ? 'BJ Pays 3:2' : 'BJ Pays 6:5';
        const playingHand = `Playing hand ${state.activeHand + 1}/${state.hands.length}`;
        const handLength = cardsFromHand(currentHand).length;
        const playerPad = ''.padEnd(6, ' ');
        const dealerPad = ''.padEnd(6 + (handLength - 2) * 5, ' ');
        const betPad = ''.padEnd(13 + (handTotal(currentHand) < 10 ? 1 : 0) + (cardValue(upCard) < 10 ? 1 : 0), ' ');
        const playerCards = cardsFromHand(currentHand).map((card) => formatCard(card)).join(' ');
        const availableActions = availableMoves(state);
        const actionList = availableActions.map((action) => {
            switch (action) {
                case 'H': return '[H]it';
                case 'S': return '[S]tand';
                case 'D': return '[D]ouble';
                case 'P': return '[P]split';
                case 'R': return '[R]surrender';
                default: return '';
            }
        }).join('  ');
        return (
`CLI Casino • ${h17} • ${das} • ${rsa} • ${bjPays}
${playingHand}

Dealer   ${formatCard(upCard)} [??]${dealerPad}showing ${cardValue(upCard)}
You      ${playerCards}${playerPad}${handTotal(currentHand)}${betPad}bet $${currentHand.bet}

  ${actionList}`
        );
    }
}
// #endregion