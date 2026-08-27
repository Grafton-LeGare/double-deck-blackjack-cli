import { RANKS, SUITS, SUIT_SYMBOLS, PLAYING_CARDS } from '../../../packages/blackjack/src/blackjack-types.ts';
import type {
    Rank, Suit, Card,
    Shoe, RuleSet, Casino, DealerHand,
    RunningCount, Hand, Action,
    GameState
} from '../../../packages/blackjack/src/blackjack-types.ts';
import type * as bjTypes from '../../../packages/blackjack/src/blackjack-types.ts';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

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
    cutCardPosition: Math.floor(gameRules.penetration * (shuffledDeck.length - 1)),
    cardsDealt: 0,
    cardsRemaining: shuffledDeck
};

// Initialize Game/State
const STARTING_BANKROLL = 10000;

let gameState: GameState = {
    rules: gameRules,
    shoe: shoe,
    gamePhase: 'bet',
    bank: STARTING_BANKROLL
};

async function main() {
    await displayGreeting();

    let userResponse: string = '';
    do {
        // Pre-game Menu
        printSpaced(`Your current bankroll is $${gameState.bank}`);
        await sleep(1);
        printSpaced("Would you like to play a new hand? (P - Play | Q - Quit | D - Display shoe | R - Reshuffle)");
        await sleep(0.5);

        let reader: readline.Interface = readline.createInterface(input, output);
        userResponse = await reader.question("> ");
        reader.close();
        await sleep(0.5);
        output.write("\n");

        if (userResponse.toUpperCase() == 'P') {
            // Take the player's bet
            if (gameState.bank === STARTING_BANKROLL) {
                printSpaced("Mazel tov!!!");
                await sleep(1);
            }   
            let bet: number;
            do {
                printSpaced("How much do you bet? ([X] - X dollars)");
                await sleep(0.5);
                reader = readline.createInterface(input, output);
                bet = Number(await reader.question("> ")); 
                reader.close();
                await sleep(0.5);
                output.write("\n");
                if (Number.isNaN(bet)) {
                    printSpaced("Invalid response");
                    await sleep(1);
                    printSpaced("Please enter a valid amount (1, 2, 3, etc.)");
                    await sleep(2);
                }
            } while (Number.isNaN(bet));

            // Finish Game/State setup
            gameState = {
                ...gameState,
                hands: [{
                    cards: [],
                    bet: bet,
                    fromSplit: false,
                    result: ''
                }],
                dealerHand: {
                    drawn: [],
                    holeRevealed: false
                },
                activeHand: 0,
                insurance: 0
            };

            // CORE GAME LOOP: reduce -> render -> reduce
            let userInput: string = 'bet';
            while (userInput != 'dismiss') {
                gameState = reduce(gameState, userInput);
                userInput = await render(gameState);
            }    
            gameState = {...gameState, gamePhase: 'bet'};
        }

        else if (userResponse.toUpperCase() == 'Q') {
            // Quit the game
            printSpaced("See you next time...");
        }

        else if (userResponse.toUpperCase() == 'D') {
            // Display the shoe at current state
            const PER_ROW = 13;
            output.write(formatShoe(gameState.shoe, PER_ROW));
            await sleep(1.25);
        }

        else if (userResponse.toUpperCase() == 'R') {
            // Refresh the shoe with animated shuffling waiter
            const frames = ['Reshuffling the shoe.', 'Reshuffling the shoe..', 'Reshuffling the shoe...'];
            for (let i = 0; i < 6; i++) {
                output.write("\r\x1b[2K");
                output.write("" + frames[i % frames.length]);
                await sleep(2/6);
            }
            output.write("\n\n");
            gameState = refreshShoe(gameState);
        }

        else {
            // Redirect for invalid input
            printSpaced("Invalid response");
            await sleep(1);
            printSpaced("Please choose a selection from the menu (P, Q, D, R)");
            await sleep(2);
        }
    } while (userResponse.toUpperCase() != 'Q');
}

main();

function reduce(state: GameState, input: string): GameState {
    // ONLY CALL THIS FUNCTION WHEN THE PLAYER HITS ENTER
    if (input == 'bet') {
        // The player has bet -> deal out cards and offer insurance on dealer Ace
        state = hit(hit(hit(hit(state, 'player'), 'dealer'), 'player'), 'dealer');
        if (state.dealerHand?.upcard?.rank === 'A') {
            // Transition to insurance offer
            return {...state, gamePhase: 'insurance'};
        }

        // Check for blackjack
        const startingHand: Hand | undefined = state.hands?.[state.activeHand ?? 0];
        if (state.dealerHand && startingHand && (isBlackjack(state.dealerHand) || isBlackjack(startingHand))) {
            return settleHands(state);
        }

        // Transition to gameplay
        return {...state, gamePhase: 'play'};
    }


    // Remove later
    return state;
}

async function render(state: GameState): Promise<string> {
    return 'dismiss';
}

function hit(state: GameState, to: 'player' | 'dealer'): GameState {
    // Nothing left to deal -> leave the state untouched
    const nextCard: Card | undefined = state.shoe.cardsRemaining[0];
    if (!nextCard) return state;
    const shoe: Shoe = {...state.shoe, cardsDealt: state.shoe.cardsDealt + 1, cardsRemaining: state.shoe.cardsRemaining.slice(1)};

    if (to == 'player') {
        const activeHand: number = state.activeHand ?? 0;
        if (!state.hands?.[activeHand]) return state;

        return {
            ...state,
            shoe: shoe,
            hands: state.hands.map((hand, index) =>
                index == activeHand ?
                    {...hand, cards: [...hand.cards, nextCard]}
                    : hand)
        };
    }
    else {
        const dealerHand: DealerHand = state.dealerHand ?? {drawn: [], holeRevealed: false};
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

function settleHands(state: GameState): GameState {
    throw new Error('Function not implemented.');
}

// TO-DO 

// Present actions

// Resolve action chosen

/*  ----- Utility functions ----- */

// Shoe
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
    return Math.max(0.25, (shoeSize(shoe) - shoe.cardsDealt) / shoeSize(shoe));
}

function jitterFromPenMode(mode: string): number {
    return mode === 'notch' ? 0 : mode === 'cutcard' ? 0.025 : 0.075;
}

// Cards
function suitSymbol(suit: Suit) {
    return SUIT_SYMBOLS[SUITS.indexOf(suit)];
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
        if (state.hands && state.hands.length < rules.maxHands && (firstCard.rank != 'A' || rules.rsa)) {
            return true;
        }
    }
    return false;
}

function legalMoves(hand: Hand, rules: RuleSet, state: GameState): Action[] {
    const total = handTotal(hand);
    let legalActions: Action[] = ['S'];
    const splitAceHand = hand.fromSplit && hand.cards.some((card) => card.rank === 'A');
    if (total < 21 && !splitAceHand) legalActions.push('H');
    if (twoCardHand(hand) && !splitAceHand && (!hand.fromSplit || rules.das)) legalActions.push('D');
    if (canSplit(hand, rules, state)) legalActions.push('P');
    if (twoCardHand(hand) && !hand.fromSplit && rules.surrender) legalActions.push('R');
    return legalActions;
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

// Dealer

// Strategy
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

// Output
function printSpaced(msg: string) {
    console.log(`${msg}\n`);
}

function sleep(duration: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, duration * 1000));
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

async function displayGreeting(): Promise<void> {
    // Spacing buffer
    output.write("\n");

    const frames: string[] = [
        `\\ ******************************* \\

     Welcome to CLI Blackjack!
            
\\ ******************************* \\`,
`| ******************************* |

     Welcome to CLI Blackjack!
            
| ******************************* |`,
`/ ******************************* /

     Welcome to CLI Blackjack!
            
/ ******************************* /`,
`- ******************************* -

     Welcome to CLI Blackjack!
            
- ******************************* -`,
`\\ ******************************* \\

     Welcome to CLI Blackjack!
            
\\ ******************************* \\`,
`| ******************************* |

     Welcome to CLI Blackjack!
            
| ******************************* |`,
`/ ******************************* /

     Welcome to CLI Blackjack!
            
/ ******************************* /`,
`- ******************************* -

     Welcome to CLI Blackjack!
            
- ******************************* -`
    ];
    const FRAME_COUNT = frames.length;
    const TIME_PER_FRAME = (1/3) / FRAME_COUNT;
    const DURATION = 3; 

    output.write("\x1b[s");
    for (let i = 0; i < DURATION / TIME_PER_FRAME; i++) {
        output.write("\x1b[u");
        output.write("\x1b[J");
        output.write("" + frames[i % FRAME_COUNT]);
        await sleep(TIME_PER_FRAME);
    }

    // Spacing buffer
    output.write("\n\n");
    await sleep(0.5);
}