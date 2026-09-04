import type {
    Rank, Suit, Card,
    Shoe, RuleSet, Casino, DealerHand,
    RunningCount, Hand, Action, PlayerAction,
    GameState, GameEvent, Step
} from '../../../packages/blackjack/src/blackjack-types.ts';
import { RANKS, SUITS, SUIT_SYMBOLS, PLAYING_CARDS } from '../../../packages/blackjack/src/blackjack-types.ts';

import type { Animation } from './blackjack-animations.ts';
import { 
    GREETING_ANIMATION, RESHUFFLE_ANIMATION, formatCard, 
    dealAnimation, playerBlackjackAnimation, DOUBLE_ANIMATION,
    SPLIT_ANIMATION, SPLIT_HAND_ANIMATION, NEXT_HAND_ANIMATION,
    SURRENDER_ANIMATION 
} from './blackjack-animations.ts';

import * as readline from 'node:readline/promises';
import process, { stdin as input, stdout as output } from 'node:process';

// DA RULES
const defaultGameRules: RuleSet = {
    decks: 2,
    h17: true,
    rsa: true,
    das: true,
    maxHands: 4,
    surrender: true,
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

// Filler for the test shoes below -- cycles non-ace ranks/suits so nothing past the staged
// opening cards is ever an ace, no matter how deep a hand plays into it.
const TEST_SHOE_FILLER: Card[] = Array.from({ length: 40 }, (_, i) => {
    const fillerRanks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
    const fillerSuits: Suit[] = ['S', 'C', 'H', 'D'];
    return {
        rank: fillerRanks[i % fillerRanks.length]!,
        suit: fillerSuits[Math.floor(i / fillerRanks.length) % fillerSuits.length]!
    };
});

// Test shoe: Swap in for `shoe` above to manually exercise specific flows.
const testShoe: Shoe = {
    decks: gameRules.decks,
    cutCardPosition: 8, // getCutCardPosition(gameRules),
    cardsDealt: 0,
    cardsRemaining: [
        { rank: '8', suit: 'S' }, // player card 1
        { rank: '6', suit: 'S' }, // dealer upcard
        { rank: '8', suit: 'C' }, // player card 2
        { rank: '5', suit: 'S' }, // dealer hole
        { rank: '8', suit: 'D' }, // split card 1
        ...TEST_SHOE_FILLER
    ]
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
    // This program hides the cursor by default -> see process.on for giving it back
    output.write('\x1b[?25l');

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
            output.write('\x1b[?1049h');
            try {
                // Take the player's bet
                const BET_SCREEN = firstHand ? "Mazel tov!!!\n\nHow much do you bet? ([X] - X dollars)" : "How much do you bet? ([X] - X dollars)";
                if (firstHand) {
                    firstHand = false;
                    await paint("Mazel tov!!!", 1);
                } 
                const bet = Number(await paintedPrompt(BET_SCREEN, (answer) => {
                    const amount = Number(answer);
                    if (Number.isNaN(amount)) return ["Invalid response", "Please enter a valid amount (1, 2, 3, etc.)"];
                    if (amount <= 0 || amount > gameState.bank) return ["Invalid bet", `Please limit your bet to ($1 - $${gameState.bank})`];
                    return [];
                }));

                // CORE GAME LOOP: reduce -> render -> reduce
                let playerAction: PlayerAction | undefined = {type: 'bet', amount: bet};
                while (playerAction) {
                    const step = reduce(gameState, playerAction);
                    gameState = step.after;
                    playerAction = await render(step);
                }    
            }
            finally {
                output.write('\x1b[?1049l');
                await sleep(0.75);
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

// This application can PERMANENTLY hide the cursor - this makes sure you always get it back.
process.on('exit', () => output.write('\x1b[?25h'));
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
                    await paint("Shoe has been emptied", 1.25);
                    await paintAnimation(RESHUFFLE_ANIMATION, 0.5);
                }               
                break;
            }
        }
    }

    switch (PHASE) {
        case 'insurance': {
            // Render the deal animation, then display its last frame over every message
            // player should still see the dealer's ace and their own hand while deciding
            const [firstCard, secondCard] = STATE.hands[0]?.cards ?? [];
            const upCard = STATE.dealerHand.upcard;
            const deal: Animation | undefined = firstCard && secondCard && upCard ?
                dealAnimation(firstCard, secondCard, upCard)
                : undefined;
            const TABLE = deal?.frames[deal.frames.length - 1] ?? '';
            const onTable = (message: string): string => TABLE ? `${TABLE}\n\n${message}` : message;
            if (deal) {
                await paintAnimation(deal, 0.5);
            }

            // Offer insurance and take insurance bet -- the offer heads both prompts
            const OFFER = "Dealer is showing an A: would you like to buy insurance? (Y - Yes | N - No)";
            const response = await paintedPrompt(onTable(OFFER), () => [], 1.5);
            if (!['y', 'yes', 'ye', 'yeah'].includes(response.toLowerCase())) {
                await paint(onTable(`${OFFER}\n\nBest of luck...`), 1.5);

                return { type: 'insurance', amount: 0 };
            }
            else {
                const max = maxInsurance(STATE.hands[0]?.bet, STATE.bank);
                const INSURANCE_SCREEN = onTable(`${OFFER}\n\nEnter your insurance bet ($1 - $${max})`);
                const insuranceBet = Number(await paintedPrompt(INSURANCE_SCREEN, (answer) => {
                    const amount = Number(answer);
                    if (Number.isNaN(amount) || amount == 0) return ["Don't be rude: you already agreed to insurance", "Please enter a valid amount (1, 2, 3, etc.)"];
                    if (amount < 0 || amount > max) return ["Invalid insurance bet", `Please limit your bet to ($1 - $${max})`];
                    return [];
                }));

                return { type: 'insurance', amount: insuranceBet};
            }
        }
        case 'play': {
            const GAME_BOARD = buildGameBoard(STATE);

            // Render deal animation if coming straight from the bet
            if (step.action.type == 'bet') {
                const [firstCard, secondCard] = STATE.hands[0]?.cards ?? [];
                const upCard = STATE.dealerHand.upcard;
                if (firstCard && secondCard && upCard) {
                    await paintAnimation(dealAnimation(firstCard, secondCard, upCard), 0.5);
                }
            }

            // Display insurance loss if taken
            if (step.action.type == 'insurance') {
                const HEADLINE = "Dealer does not have blackjack";
                await paint(HEADLINE, 1.25);
                if (STATE.insurance > 0) {
                    await paint(`${HEADLINE}\n\nInsurance bet loses (-$${STATE.insurance})`, 2);
                }     
            } 

            // Display feedback from last move
            await paintMoveFeedback(step);

            // Display the updated gameboard and prompt for user move
            await paint(GAME_BOARD, 0.5);
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
                await paintAnimation(playerBlackjackAnimation(), 0.25);
            }
            else if (step.action.type == 'bet' && isBlackjack(STATE.dealerHand)) {
                const [firstCard, secondCard] = STATE.hands[0]?.cards ?? [];
                const upCard = STATE.dealerHand.upcard;
                if (firstCard && secondCard && upCard) {
                    await paintAnimation(dealAnimation(firstCard, secondCard, upCard), 0.5);
                }
            } 

            // Display insurance win if taken
            if (step.action.type == 'insurance' && STATE.insurance > 0) {
                const HEADLINE = "Good instincts: Dealer has blackjack";
                await paint(HEADLINE, 1.25);
                await paint(`${HEADLINE}\n\nInsurance bet wins (+$${STATE.insurance * 2})`, 2);
            }

            // Display feedback from last move made
            await paintMoveFeedback(step);
            
            // Display settlement & dealer play
            const dealerAction = STATE.dealerHand.playedOut ? 'Dealer plays' : 'Dealer reveal';
            await paint('All hands finished!', 1.5);
            await paint(`All hands finished!\n\n${dealerAction}`, 1.5);

            const frames = dealerPlayFrames(STATE.dealerHand);
            const lastFrame = frames[frames.length - 1] ?? '';
            const dealerResult = dealerPlayResult(STATE.dealerHand);

            // Display the 'dealer plays' header atop all dealer frames
            const dealerScreen = (frame: string, outcome: string = '') =>
                `All hands finished!\n\n${dealerAction}\n\n${frame}\n\n${outcome}`;
            const dealerPlayAnimation: Animation = {frames: frames.map((frame) => dealerScreen(frame)), timePerFrame: 1.5, duration: frames.length * 1.5};
            await paintAnimation(dealerPlayAnimation);
            if (dealerResult == '') {
                await paint(dealerScreen(lastFrame, dealerResult), 1);
            }
            else {
                await paint(dealerScreen(lastFrame, dealerResult), 2);
            }
            
            // Display the results screen
            await paint("RESULTS:\n", 2);
            await paint(buildResultsScreen(STATE), 3);
            await paint(`${buildResultsScreen(STATE)}\nPress Enter to continue...`, 0);
            const reader = readline.createInterface(input, output);
            try { 
                await reader.question('');
            }
            finally {
                reader.close();
            }
            
            // Reshuffle between rounds if needed
            if (step.events.some((event) => event.type == 'reshuffle' && event.cause == 'cutcard')) {
                await paint("Current shoe is exhausted", 1.5);
                await paintAnimation(RESHUFFLE_ANIMATION);
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

function playerNet(state: GameState): number {
    let net: number = state.hands.reduce((net, hand) => {
        switch (hand.result) {
            case 'win': return isBlackjack(hand) ? net + hand.bet * state.rules.blackjackPays : net + hand.bet;
            case 'loss': return net - hand.bet;
            case 'push': return net;
            case 'surrender': return net - hand.bet / 2;
            case 'pending': throw new Error('Game phase is settle but pending hand found');
        }
    }, 0);
    if (state.insurance > 0) {
        if (isBlackjack(state.dealerHand) && state.hands.length == 1 && state.hands[0]?.result == 'loss') {
            net += state.insurance * 2;
        }
        else {
            net -= state.insurance;
        }
    }

    return net;
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
    if (twoCardHand(hand) && !splitAceHand && total < 21 && (!hand.fromSplit || rules.das)) legalActions.push('D');
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
    output.write('\x1b[?25h');
    try {
        const response: string = await reader.question("> ");      
        
        return response;
    }
    finally {
        reader.close();
        output.write('\x1b[?25l');
        await sleep(0.5);
        output.write('\n');
    }
}

async function paint(body: string, duration: number) {
    if (!output.isTTY) {
        output.write(body + '\n');
        return;
    }
    output.write('\x1b[H\x1b[0J');
    output.write(`${body}\n`);
    await sleep(duration);
}

async function paintAnimation(animation: Animation, after: number = 0) {
    const FRAME_COUNT = animation.frames.length;
    const TIME_PER_FRAME = animation.timePerFrame;
    const DURATION = animation.duration; 

    for (let i = 0; i < DURATION / TIME_PER_FRAME; i++) {
        const frame: string = animation.frames[i % FRAME_COUNT] ?? '';
        await paint(frame, TIME_PER_FRAME);
    }
    if (after > 0) await sleep(after);
}

// A screen that asks a question: the body holds still with the arrow beneath it, and a
// rejected answer repaints the same screen with the complaints stacked under the question
async function paintedPrompt(
    body: string,
    validate: (response: string) => readonly string[],
    beat: number = 0.5
): Promise<string> {
    while (true) {
        await paint(`${body}\n`, beat);
        const response: string = await arrowedPrompt();

        const complaints: readonly string[] = validate(response);
        if (complaints.length == 0) return response;

        // Reveal the complaints one at a time, holding longer on the last before re-asking
        let screen: string = body;
        for (const [index, complaint] of complaints.entries()) {
            screen += `\n\n${complaint}`;
            await paint(screen, index == complaints.length - 1 ? 2 : 1);
        }
    }
}

const INVALID_MOVE_MESSAGE = "Invalid selection! Please select a legal move";
const INVALID_MOVE_DURATION = 2;

// Re-prompts until the move is legal, wiping the rejected input and the warning in place
async function actionPrompt(legalActions: readonly Action[]): Promise<Action> {
    while (true) {
        const reader: readline.Interface = readline.createInterface(input, output);
        output.write('\x1b[?25h');
        let response: string;
        try {
            response = await reader.question("> ");
        }
        finally {
            reader.close();
            output.write('\x1b[?25l');
        }

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

// Rows a frame actually takes up on screen -- a line wider than the window wraps onto
// extra rows, and those count against the walk back up to the frame's first line
function frameRows(frame: string, columns: number): number {
    return frame
        .split('\n')
        .reduce((rows, line) => rows + Math.max(1, Math.ceil(line.length / columns)), 0);
}

async function displayAnimation(animation: Animation): Promise<void> {
    // ONLY USE THIS OUTSIDE THE GAME LOOP IN MAIN
    const FRAME_COUNT = animation.frames.length;
    const TIME_PER_FRAME = animation.timePerFrame;
    const DURATION = animation.duration;

    if (!output.isTTY) {
        output.write(`${animation.frames[0] ?? ''}\n\n`);
        await sleep(DURATION);
        return;
    }

    // Walk back up by the rows just written: prevents scroll errors
    let previousRows = 0;
    for (let i = 0; i < DURATION / TIME_PER_FRAME; i++) {
        const frame: string = animation.frames[i % FRAME_COUNT] ?? '';
        const columns = output.columns || 80;

        // Cap the walk at the window height: a frame taller than the window has already had its
        // top scrolled away, so redraw from the top of the screen rather than overshooting
        const climb = Math.min(previousRows - 1, (output.rows || previousRows) - 1);
        if (climb > 0) output.write(`\x1b[${climb}A`);

        output.write('\x1b[G\x1b[0J');
        output.write(frame);
        previousRows = frameRows(frame, columns);
        await sleep(TIME_PER_FRAME);
    }

    // Spacing buffer
    output.write("\n\n");
}

// Actions are hidden while the board is only being shown as a backdrop -- the line they sat
// on and the blank one below it stay, so the board doesn't shift when the prompt returns
function buildGameBoard(state: GameState, actions: 'shown' | 'hidden' = 'shown', playerLine?: string): string {
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
        const youLine = playerLine ?? `${playerCards}${playerPad}${handTotal(currentHand)}${betPad}bet $${currentHand.bet}`;
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
        const actionLine = actions == 'shown' ? `  ${actionList}` : '';
        return (
`CLI Casino • ${h17} • ${das} • ${rsa} • ${bjPays}
${playingHand}

Dealer   ${formatCard(upCard)} [??]${dealerPad}showing ${cardValue(upCard)}
You      ${youLine}

${actionLine}`
        );
    }
}

function overBoard(board: string, animation: Animation): Animation {
    return {...animation, frames: animation.frames.map((frame) => `${board}\n${frame}`)};
}

function splitHandFrames(firstCard: Card, secondCard: Card, firstHitCard: Card, secondHitCard?: Card): string[] {
    const SPLIT_PAD = ''.padEnd(9);
    const SPLIT_GAP = ''.padEnd(11);
    const card1 = formatCard(firstCard), card2 = formatCard(secondCard), hitCard1 = formatCard(firstHitCard);
    const hitCard2 = secondHitCard ? formatCard(secondHitCard) : '';
    const frames = [
        `${SPLIT_PAD}${card1} ${card2}`,
        `${card1}${SPLIT_GAP}     ${card2}`,
        `${card1} ${hitCard1}${SPLIT_GAP}${card2} ${hitCard2}`
    ];
    return frames;
}

async function paintMoveFeedback(step: Step) {
    const PREV_BOARD = buildGameBoard(step.before, 'hidden');
    const PLAYED_BOARD = buildGameBoard({...step.after, activeHand: step.before.activeHand}, 'hidden');
    const playedHand: Hand | undefined = step.after.hands[step.before.activeHand];
    if (!playedHand) return;

    switch (step.action.type) {
        case 'hit': {
            const drawnCard: Card | undefined = playedHand.cards[playedHand.cards.length - 1];
            const drawnRank = drawnCard ? drawnCard.rank : '-1';
            const hitResult = handTotal(playedHand) > 21 ? 'Hand busted' : `Hand total is ${handTotal(playedHand)}`;
            await paint(PREV_BOARD, 1);
            await paint(PLAYED_BOARD, 1);
            await paint(`${PLAYED_BOARD}\nHit ${drawnRank}: ${hitResult}`, 2);

            // Display next hand animation if the hit caused a hand change
            if (step.before.activeHand != step.after.activeHand) {
                await paintAnimation(overBoard(PLAYED_BOARD, NEXT_HAND_ANIMATION));
            }
            break;
        }
        case 'stand': {
            await paint(`${PLAYED_BOARD}\nHand has been stood`, 2);
            if (step.before.activeHand != step.after.activeHand) {
                await paintAnimation(overBoard(PLAYED_BOARD, NEXT_HAND_ANIMATION));
            }         
            break;
        }
        case 'double': {
            const DOUBLED_BOARD = buildGameBoard({
                ...step.after,
                activeHand: step.before.activeHand,
                hands: step.after.hands.map((hand, index) => 
                    index == step.before.activeHand ? {...hand, cards: hand.cards.slice(0, -1)} : hand)
            }, 'hidden');
            const drawnCard: Card | undefined = playedHand.cards[playedHand.cards.length - 1];
            const drawnRank = drawnCard ? drawnCard.rank : '-1';
            const doubleResult = handTotal(playedHand) > 21 ? 'Hand busted' : `Hand finished at ${handTotal(playedHand)}`;

            // Split the double animation between not having and having the doubled bet
            await paintAnimation(overBoard(PREV_BOARD, {...DOUBLE_ANIMATION, duration: DOUBLE_ANIMATION.duration / 2}));
            await paintAnimation(overBoard(DOUBLED_BOARD, {...DOUBLE_ANIMATION, duration: DOUBLE_ANIMATION.duration / 2}), 0.25);           
            await paint(`${PLAYED_BOARD}\nDealt ${drawnRank}: ${doubleResult}`, 4);

            // Display next hand animation if the hit caused a hand change
            if (step.before.activeHand != step.after.activeHand) {
                await paintAnimation(overBoard(PLAYED_BOARD, NEXT_HAND_ANIMATION));
            }
            break;
        }
        case 'split': {
            // Split aces can repoint activeHand, so anchor on the hand that was actually split
            const splitIndex = step.before.activeHand;
            const [firstCard, firstHitCard] = step.after.hands[splitIndex]?.cards ?? [];
            const [secondCard, secondHitCard] = step.after.hands[splitIndex + 1]?.cards ?? [];
            const lastSplitFrame = SPLIT_ANIMATION.frames[SPLIT_ANIMATION.frames.length - 1] ?? '';
            const halfDuration = SPLIT_ANIMATION.duration / 2;
            if (firstCard && secondCard && firstHitCard) {
                const splitFrames: readonly string[] = splitHandFrames(firstCard, secondCard, firstHitCard, secondHitCard);
                let index = 0;
                for (const frame of splitFrames) {
                    index++;
                    const board = buildGameBoard(step.before, 'hidden', frame);
                    if (index == splitFrames.length) {
                        await paintAnimation(overBoard(board, {frames: [lastSplitFrame], timePerFrame: halfDuration, duration: halfDuration}));
                        if (step.after.gamePhase != 'settle') {
                            // Show "Moving to next hand..." instead of "First hand" on split aces (most hands don't play)
                            if (firstCard.rank == 'A') {
                                await paintAnimation(overBoard(board, NEXT_HAND_ANIMATION));
                            }
                            else {
                                await paintAnimation(overBoard(board, SPLIT_HAND_ANIMATION));
                            }                            
                        }                       
                    }      
                    else {
                        await paintAnimation(overBoard(board, {...SPLIT_ANIMATION, duration: halfDuration}));
                    }                              
                }
            }
            else {
                await paintAnimation(overBoard(PREV_BOARD, SPLIT_HAND_ANIMATION));
            }   
            break;
        }
        case 'surrender': {
            await paintAnimation(overBoard(PREV_BOARD, SURRENDER_ANIMATION));
            break;
        }
        case 'bet' : case 'insurance': return;
    }
}

function dealerPlayFrames(hand: DealerHand): string[] {
    const LABEL = 'Dealer:    ';
    const GAP = 4;
    const revealed = [formatCard(hand.upcard), formatCard(hand.hole)];

    // Pad every frame out to the final width so the total holds one column as the cards land
    const finalWidth = [...revealed, ...hand.drawn.map(formatCard)].join(' ').length;
    const frame = (cards: string, total: string) => `${LABEL}${cards.padEnd(finalWidth + GAP)}${total}`.trimEnd();

    // The hole is still face down -- a total here would give it away
    const frames = [frame(`${formatCard(hand.upcard)} [??]`, '')];

    // One frame per card revealed, each carrying the total of what's showing so far
    for (let drawn = 0; drawn <= hand.drawn.length; drawn++) {
        const showing = [...revealed, ...hand.drawn.slice(0, drawn).map(formatCard)];
        const total = handTotal({...hand, drawn: hand.drawn.slice(0, drawn)});
        frames.push(frame(showing.join(' '), total > 21 ? 'BUST' : `${total}`));
    }
    return frames;
}

function dealerPlayResult(hand: DealerHand): string {
    if (isBlackjack(hand)) return 'Dealer has blackjack'
    if (!hand.playedOut) return '';
    return handTotal(hand) > 21 ? 'Dealer busted' : `Dealer stood on ${handTotal(hand)}`;
}

function buildResultsScreen(state: GameState): string {
    let screen: string = 'RESULTS:';

    const handsWon = `${state.hands.filter((hand) => hand.result == 'win').length}/${state.hands.length}`;
    const netPayout = playerNet(state);
    if (!state.hands.some((hand) => hand.result != 'push')) {
        screen = `${screen}\n\nPush  |  Net $0`;
    }
    else {
        screen = `${screen}\n\nPlayer wins ${handsWon} hands  |  Net $${netPayout}`;
    }

    const maxHandLength = Math.max(...state.hands.map((hand) => hand.cards.length)); 
    const resultRows: string[] = state.hands.map((hand) => {
        const cards: string = cardsFromHand(hand).map((card) => formatCard(card)).join(' ');
        const totalPad = ''.padEnd(4 + (maxHandLength - hand.cards.length) * 5);  
        const total = `Total: ${handTotal(hand)}`;
        const result = handTotal(hand) > 21 ?
            'Hand busted'
            : hand.result == 'win' ?
            `Dealer loses ${handTotal(state.dealerHand)}/${handTotal(hand)}`
            : hand.result == 'loss' || hand.result == 'surrender' ?
            `Dealer wins ${handTotal(state.dealerHand)}/${handTotal(hand)}`
            : 'Push';
        return `${cards} →${totalPad}${total} →    ${result}`;
    });

    while (resultRows.length < 4) resultRows.push('');
    screen = `${screen}\n\n${resultRows.join('\n')}\n`;
    
    return screen;
}
// #endregion