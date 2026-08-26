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

// Shoe
const combinedDeck: Card[] = PLAYING_CARDS.flatMap((card) => Array.from({ length: gameRules.decks }, () => card));
let shuffledDeck: Card[] = shuffleDeck(combinedDeck);

let shoe: Shoe = {
    decks: gameRules.decks,
    cutCardPosition: gameRules.penetration * (shuffledDeck.length - 1),
    cardsDealt: 0,
    cardsRemaining: shuffledDeck
};

/* Assignment for later: shoe = {...shoe, cardsDealt: shoe.cardsDealt + 1}; */

// Initialize Game/State
let gameState: GameState = {
    rules: gameRules,
    shoe: shoe,
    gamePhase: 'bet',
    bank: 10000
};

// Player wager
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
            // Start the game
            printSpaced("Mazel tov!!!");
            await sleep(1);
            printSpaced("Uh... we can't actually do that yet...");
            await sleep(1);
        }
        else if (userResponse.toUpperCase() == 'D') {
            let msg: string = '';
            const PER_ROW = 13;

            // Print the shoe with i rows and j columns
            for (let i = 0; i < Math.floor(shoe.cardsRemaining.length / PER_ROW); i++) {              
                for (let j = 0; j < PER_ROW; j++) {
                    const nextCard: Card | undefined = shoe.cardsRemaining[i * PER_ROW + j];
                    if (nextCard != undefined) {
                        msg += `${nextCard.rank}${suitSymbol(nextCard.suit)} `;
                    }
                }
                output.write(msg + '\n');
                msg = '';
            }

            // Print last row
            for (let i = shoe.cardsRemaining.length - (shoe.cardsRemaining.length % PER_ROW); i < shoe.cardsRemaining.length; i++) {
                const nextCard: Card | undefined = shoe.cardsRemaining[i];
                if (nextCard != undefined) {
                    msg += `${nextCard.rank}${suitSymbol(nextCard.suit)} `; 
                }
            }
            if (msg != '') {
                output.write(msg + "\n\n");
            }
            else {
                output.write("\n");
            }    
        }
        else if (userResponse.toUpperCase() == 'R') {
            // Animated shuffling waiter
            const frames = ['Reshuffling the shoe.', 'Reshuffling the shoe..', 'Reshuffling the shoe...'];
            for (let i = 0; i < 6; i++) {
                output.write("\r\x1b[2K");
                output.write("" + frames[i % frames.length]);
                await sleep(2/6);
            }
            output.write("\n\n");
            shoe = {...shoe, cardsRemaining: shuffleDeck(shoe.cardsRemaining)};
        }
        else if (userResponse.toUpperCase() != 'Q') {
            printSpaced("Invalid response");
            await sleep(1);
            printSpaced("Please choose a selection from the menu (P, Q, D, R)");
            await sleep(2);
        }
        
    } while (userResponse.toUpperCase() != 'Q');
    
    printSpaced("See you next time...");
}

main();

// Deal cards

// Present actions

// Resolve action chosen

// Utility functions
function shuffleDeck(deck: readonly Card[]): Card[] {
    const shuffled: Card[] = [...deck];
    const n = shuffled.length;
    for (let i = n - 1; i > 0; i--) {
        let strike: number = Math.floor(Math.random() * (i + 1));
        [shuffled[strike], shuffled[i]] = [shuffled[i]!, shuffled[strike]!];
    }
    return shuffled;
}

function sleep(duration: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, duration * 1000));
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

function suitSymbol(suit: Suit) {
    return SUIT_SYMBOLS[SUITS.indexOf(suit)];
}

function printSpaced(msg: string) {
    console.log(`${msg}\n`);
}