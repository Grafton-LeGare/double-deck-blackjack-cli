import type {
    Card, Shoe, RuleSet, DealerHand, Hand, Action, PlayerAction, GameState, Step,
} from '@doubledeck/blackjack';

import {
    reduce, combineDecks, shuffleDecks, getCutCardPosition, refreshShoe, handTotal, isBlackjack, 
    legalMoves, maxInsurance, suitSymbol, cardsFromHand, cardValue,  
} from '@doubledeck/blackjack';

import type { Animation } from './blackjack-animations.ts';

import { 
    GREETING_ANIMATION, RESHUFFLE_ANIMATION, formatCard, dealAnimation, playerBlackjackAnimation, 
    DOUBLE_ANIMATION, SPLIT_ANIMATION, SPLIT_HAND_ANIMATION, NEXT_HAND_ANIMATION, SURRENDER_ANIMATION,
    GAME_OVER_ANIMATION, 
} from './blackjack-animations.ts';

import * as readline from 'node:readline/promises';
import * as linereader from 'node:readline';
import process, { stdin as input, stdout as output } from 'node:process';

// DA RULES
const defaultGameRules: RuleSet = {
    decks: 2,
    h17: true,
    rsa: true,
    das: true,
    maxHands: 6,
    surrender: false,
    blackjackPays: 1.5,
    penetration: 0.75,
    penMode: 'notch'
};
let gameRules: RuleSet = defaultGameRules;

// Animation play speed
const SPEED_OPTIONS = { slow: 2, normal: 1, fast: (1/3), off: 0 };
let SPEED: number = SPEED_OPTIONS.normal;

// Reusable currency formatting (No $25.66521 amounts)
const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    useGrouping: false,
    trailingZeroDisplay: 'stripIfInteger'
});
const formatCurrency = (amount: number) => currencyFormatter.format(amount);

// Keep track of whether we're in the constructed window or the actual terminal for errors
let inAltScreen: boolean = false;

async function main() {
    // Initialize Game/State
    const STARTING_BANKROLL = 10000;   
    let gameState: GameState = newGame(gameRules, STARTING_BANKROLL);
    let firstHand: boolean = true;

    // This program hides the cursor by default -> see process.on for giving it back
    output.write('\x1b[?25l');

    output.write('\n');
    await displayAnimation(GREETING_ANIMATION);
    await sleep(0.5);

    let userResponse: string = '';
    do {
        // Pre-game Menu
        printSpaced(`Your current bankroll is ${formatCurrency(gameState.bank)}`);
        await sleep(1 * SPEED);
        printSpaced("Would you like to play a new hand? (P - Play | Q - Quit | D - Display shoe | R - Reshuffle | S - Settings)");
        await sleep(0.5 * SPEED);

        userResponse = (await arrowedPrompt()).toLowerCase();

        if (userResponse == 'p' || userResponse == 'play') {
            output.write('\x1b[?1049h');
            inAltScreen = true;
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
                    if (amount <= 0 || amount > gameState.bank) return ["Invalid bet", `Please limit your bet to (${formatCurrency(1)} - ${formatCurrency(gameState.bank)})`];
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
                inAltScreen = false;
                await sleep(SPEED < 1 ? 0.25 : 0.5);
            }    
            gameState = {...gameState, gamePhase: 'bet'};  
            
            // Check and display message for Game Over
            if (gameState.bank <= 0) {
                await sleep(0.5);
                printSpaced("You've run out of bank!");
                await sleep(2);
                await displayAnimation(GAME_OVER_ANIMATION);
                break;
            }
        }

        else if (userResponse == 'q' || userResponse == 'quit') {
            // Quit the game
            printSpaced("See you next time...");
        }

        else if (userResponse == 'd' || userResponse == 'display') {
            // Display the shoe at current state
            const PER_ROW = 13;
            output.write(formatShoe(gameState.shoe, PER_ROW));
            await sleep(1.25 * SPEED);
        }

        else if (userResponse == 'r' || userResponse == 'reshuffle') {
            // Refresh the shoe with animated shuffling waiter
            output.write('\r');
            await displayAnimation(RESHUFFLE_ANIMATION);
            gameState = refreshShoe(gameState);
            await sleep(0.5 * SPEED);
        }

        else if (userResponse == 's' || userResponse == 'settings') {
            // Switch to alt-screen
            output.write('\x1b[?1049h');
            inAltScreen = true;
            try {
                gameRules = await settingsMenu(gameRules);
                gameState = newGame(gameRules, gameState.bank);
            }
            finally {
                output.write('\x1b[?1049l');
                inAltScreen = false;
                await sleep(SPEED < 1 ? 0.25 : 0.5);
            }
        }

        else {
            // Redirect for invalid input
            printSpaced("Invalid response");
            await sleep(1 * SPEED);
            printSpaced("Please choose a selection from the menu (P, Q, D, R)");
            await sleep(2 * SPEED);
        }
    } while (userResponse != 'q' && userResponse != 'quit');
}

// This application can PERMANENTLY hide the cursor - this makes sure you always get it back.
process.on('exit', () => {
    if (inAltScreen) {
        output.write('\x1b[?1049l');
        inAltScreen = false;
    }    
    if (input.isRaw) {
        input.setRawMode(false);
    }
    output.write('\x1b[?25h');
});
process.on('SIGINT', () => process.exit(130));

main().catch((err) => { console.error(err); process.exit(1) });


async function render(step: Step): Promise<PlayerAction | undefined> {
    const STATE = step.after;
    const PHASE = STATE.gamePhase;

    // Process logged internal events before standard game events
    for (const event of step.events) {
        switch (event.type) {
            case 'reshuffle': {
                if (event.cause == 'empty' && step.action.type != 'stand') {
                    await paint("Shoe has been emptied", 1.25);
                    await paintAnimation(RESHUFFLE_ANIMATION, 0.5);
                }               
                break;
            }
        }
    }

    switch (PHASE) {
        case 'insurance': {
            // A natural against an ace is offered even money rather than insurance: the same
            // half-bet wager, taken as a certain 1:1 instead of gambling 3:2 against a push
            const startingHand: Hand | undefined = STATE.hands[STATE.activeHand];
            if (!startingHand) throw new Error(`Error offering insurance: hand (${STATE.activeHand + 1}/${STATE.hands.length}) not found.`);
            const [firstCard, secondCard] = startingHand.cards;
            const upCard = STATE.dealerHand.upcard;
            if (!firstCard || !secondCard || !upCard) throw new Error("Error offering insurance: the player's two cards or the dealer's upcard is missing.");

            if (isBlackjack(startingHand)) {
                const pbjAnimation = playerBlackjackAnimation();
                await paintAnimation(pbjAnimation, 1);

                // Hold the natural on screen and deal the table in underneath it
                const dAnimation = dealAnimation(firstCard, secondCard, upCard);
                const dealUnderHeadline: Animation = {
                    ...dAnimation,
                    frames: dAnimation.frames.map((frame) => `${lastFrame(pbjAnimation)}\n\n${frame}`)
                };
                await paintAnimation(dealUnderHeadline, 0.5);
                const headline = lastFrame(dealUnderHeadline);

                const OFFER = "Dealer is showing an A: would you like even money? (Y - Yes | N - No)";
                const response = (await paintedPrompt(`${headline}\n\n${OFFER}`, () => [], 1)).toLowerCase();
                if (!['y', 'yes', 'ye', 'yeah'].includes(response)) {
                    // Declined -> the natural settles on its own: 3:2, or a push against a dealer natural
                    await paint(`${headline}\n\n${OFFER}\n\nLetting it ride...`, 1.5);

                    return { type: 'insurance', amount: 0 };
                }

                return { type: 'evenMoney' };
            }

            // Render the deal animation, then display its last frame over every message
            // player should still see the dealer's ace and their own hand while deciding
            const deal: Animation = dealAnimation(firstCard, secondCard, upCard);
            const TABLE = lastFrame(deal);
            const onTable = (message: string): string => `${TABLE}\n\n${message}`;
            await paintAnimation(deal, 0.5);

            // Offer insurance and take insurance bet -- the offer heads both prompts
            const OFFER = "Dealer is showing an A: would you like to buy insurance? (Y - Yes | N - No)";
            const response = (await paintedPrompt(onTable(OFFER), () => [], 1)).toLowerCase();
            if (!['y', 'yes', 'ye', 'yeah'].includes(response)) {
                await paint(onTable(`${OFFER}\n\nBest of luck...`), 1.5);

                return { type: 'insurance', amount: 0 };
            }
            else {
                const max = maxInsurance(startingHand.bet, STATE.bank);
                const INSURANCE_SCREEN = onTable(`${OFFER}\n\nEnter your insurance bet (${formatCurrency(1)} - ${formatCurrency(max)})`);
                const insuranceBet = Number(await paintedPrompt(INSURANCE_SCREEN, (answer) => {
                    const amount = Number(answer);
                    if (Number.isNaN(amount) || amount == 0) return ["Don't be rude: you already agreed to insurance", "Please enter a valid amount (1, 2, 3, etc.)"];
                    if (amount < 0 || amount > max) return ["Invalid insurance bet", `Please limit your bet to (${formatCurrency(1)} - ${formatCurrency(max)})`];
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
                if (!firstCard || !secondCard || !upCard) throw new Error("Error dealing the player in: their two cards or the dealer's upcard is missing.");
                await paintAnimation(dealAnimation(firstCard, secondCard, upCard), 0.5);
            }

            // Display insurance loss if taken
            if (step.action.type == 'insurance') {
                const HEADLINE = "Dealer does not have blackjack";
                await paint(HEADLINE, 1.25);
                if (STATE.insurance > 0) {
                    await paint(`${HEADLINE}\n\nInsurance bet loses (-${formatCurrency(STATE.insurance)})`, 2);
                }     
            } 

            // Display feedback from last move
            await paintMoveFeedback(step);

            // SPECIFICALLY when the user stands, reshuffle can't display until AFTER they have stood
            if (step.events.some((event) => event.type == 'reshuffle' && event.cause == 'empty') && step.action.type == 'stand') {
                await paint("Shoe has been emptied", 1.25);
                await paintAnimation(RESHUFFLE_ANIMATION, 0.5);
            }

            // Display the updated gameboard and prompt for user move
            const currentHand: Hand | undefined = STATE.hands[STATE.activeHand];
            if (!currentHand) {
                throw new Error("Error displaying game board: Current hand not found.");
            }
            else {
                await paint(GAME_BOARD, 0.5);
                const availableActions = legalMoves(currentHand, STATE.rules, STATE);  
                const playerAction: Action = await actionPrompt(availableActions);
                switch(playerAction) {
                    case 'H': return { type: 'hit' };
                    case 'S': return { type: 'stand' };
                    case 'D': return { type: 'double' };
                    case 'P': return { type: 'split' };
                    case 'R': return { type: 'surrender' };
                }
            }           
        }
        case 'settle': {
            // Player took Even Money -> pay it and drop straight back to the menu
            if (step.action.type == 'evenMoney') {
                const wager = STATE.hands[0]?.bet;
                if (!wager) throw new Error("Error paying even money: the settled hand or its bet is missing.");
                const HEADLINE = `Accepted even money (+${formatCurrency(wager)})`;
                await paint(HEADLINE, 2);
                await paint(`${HEADLINE}\n\nHand is now settled`, 2);

                // Reshuffle between rounds if needed
                if (step.events.some((event) => event.type == 'reshuffle' && event.cause == 'cutcard')) {
                    await paint("Current shoe is exhausted", 1.5);
                    await paintAnimation(RESHUFFLE_ANIMATION);
                }

                return undefined;
            }

            // Insurance/Even Money shows the blackjack animation so don't duplicate it here
            // (taking even money returns above, so declining is all that reaches this)
            const blackjackAlreadyShown = step.action.type == 'insurance';
            if (step.after.hands.some(isBlackjack) && !blackjackAlreadyShown) {
                await paintAnimation(playerBlackjackAnimation(), 0.25);
            }
            
            // Only display the deal animation if the player doesn't have blackjack
            else if (step.action.type == 'bet' && isBlackjack(STATE.dealerHand)) {
                const [firstCard, secondCard] = STATE.hands[0]?.cards ?? [];
                const upCard = STATE.dealerHand.upcard;
                if (!firstCard || !secondCard || !upCard) throw new Error("Error dealing the player in: their two cards or the dealer's upcard is missing.");
                await paintAnimation(dealAnimation(firstCard, secondCard, upCard), 0.5);
            } 

            // Display insurance win if taken
            if (step.action.type == 'insurance' && STATE.insurance > 0) {
                const HEADLINE = "Good instincts: Dealer has blackjack";
                await paint(HEADLINE, 1.25);
                await paint(`${HEADLINE}\n\nInsurance bet wins (+${formatCurrency(STATE.insurance * 2)})`, 2);
            }

            // Display feedback from last move made
            await paintMoveFeedback(step);

            // SPECIFICALLY when the user stands, reshuffle can't display until AFTER they have stood
            if (step.events.some((event) => event.type == 'reshuffle' && event.cause == 'empty') && step.action.type == 'stand') {
                await paint("Shoe has been emptied", 1.25);
                await paintAnimation(RESHUFFLE_ANIMATION, 0.5);
            }
            
            // Display settlement & dealer play
            const dealerAction = STATE.dealerHand.playedOut ? 'Dealer plays' : 'Dealer reveal';
            await paint('All hands finished!', 1.5);
            await paint(`All hands finished!\n\n${dealerAction}`, 1.5);

            const frames = dealerPlayFrames(STATE.dealerHand);
            const finalFrame = frames[frames.length - 1];
            if (finalFrame == undefined) throw new Error("Error playing out the dealer's hand: no frames to display.");
            const dealerResult = dealerPlayResult(STATE.dealerHand);

            // Display the 'dealer plays' header atop all dealer frames
            const dealerScreen = (frame: string, outcome: string = '') =>
                `All hands finished!\n\n${dealerAction}\n\n${frame}\n\n${outcome}`;
            const dealerPlayAnimation: Animation = {frames: frames.map((frame) => dealerScreen(frame)), timePerFrame: 1.5, duration: frames.length * 1.5};
            await paintAnimation(dealerPlayAnimation);
            if (dealerResult == '') {
                await paint(dealerScreen(finalFrame, dealerResult), 0.5);
            }
            else {
                await paint(dealerScreen(finalFrame, dealerResult), 2);
            }
            
            // Display the results screen
            await paint("RESULTS:\n", 2);
            await paint(buildResultsScreen(STATE), 2.5);
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

    throw new Error(`Nothing to render: reached the render step in game phase '${PHASE}'.`);
}

function newGame(rules: RuleSet, bankroll: number): GameState {
    // Build initial shoe
    const combinedDeck: Card[] = combineDecks(rules.decks);
    const shuffledDeck: Card[] = shuffleDecks(combinedDeck);

    const shoe: Shoe = {
        decks: rules.decks,
        cutCardPosition: getCutCardPosition(rules),
        cardsDealt: 0,
        cardsRemaining: shuffledDeck
    };

    return {
        rules: rules,
        shoe: shoe,
        hands: [],
        dealerHand: { drawn: [], holeRevealed: false, playedOut: false },
        activeHand: 0,
        insurance: 0,
        gamePhase: 'bet',
        bank: bankroll
    };
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
        if (isBlackjack(state.dealerHand)) {
            net += state.insurance * 2;
        }
        else {
            net -= state.insurance;
        }
    }

    return net;
}

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

        // Every answer comes back trimmed
        return response.trim();
    }
    finally {
        reader.close();
        output.write('\x1b[?25l');
        await sleep(SPEED < 1 ? 0.25 : 0.5);
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
    await sleep(duration * SPEED);
}

// The frame an animation finishes on -- what's left on screen once it has played out
function lastFrame(animation: Animation): string {
    const frame: string | undefined = animation.frames[animation.frames.length - 1];
    if (frame == undefined) throw new Error("Attempted to read the last frame of an animation with no frames.");
    return frame;
}

async function paintAnimation(animation: Animation, after: number = 0) {
    const FRAME_COUNT = animation.frames.length;
    const TIME_PER_FRAME = animation.timePerFrame;
    const DURATION = animation.duration; 
    if (FRAME_COUNT == 0) throw new Error("Attempted to paint an animation with no frames.");

    for (let i = 0; i < DURATION / TIME_PER_FRAME; i++) {
        const frame: string | undefined = animation.frames[i % FRAME_COUNT];
        if (frame == undefined) throw new Error(`Animation frame ${i % FRAME_COUNT}/${FRAME_COUNT} is undefined.`);
        await paint(frame, TIME_PER_FRAME);
    }
    if (after > 0) await sleep(after * SPEED);
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

async function settingsMenu(currentRules: RuleSet): Promise<RuleSet> {
    if (!input.isTTY) throw new Error("Error accessing settings menu: Input is not a TTY.");

    // Every rule reads back as the option it is currently set to, and every option written
    // in the table can be turned back into the value it stands for
    const yesNo = (flag: boolean): string => flag ? 'Yes' : 'No';

    const PENETRATIONS = [[0.5, '1/2'], [2 / 3, '2/3'], [0.75, '3/4']] as const;
    const PEN_MODES = [['notch', 'Notch'], ['cutcard', 'Cutcard'], ['dealer', 'Dealer choice']] as const;
    const SPEEDS = [
        [SPEED_OPTIONS.slow, 'Slow'], [SPEED_OPTIONS.normal, 'Normal'],
        [SPEED_OPTIONS.fast, 'Fast'], [SPEED_OPTIONS.off, 'OFF']
    ] as const;

    // Paired the two together, so neither direction can name an option the other doesn't know
    const labelFor = <T>(pairs: readonly (readonly [T, string])[], value: T): string => {
        const PAIR = pairs.find(([option]) => option == value);
        if (!PAIR) throw new Error(`Error reading settings: ${value} is not one of the offered options.`);
        return PAIR[1];
    };
    const valueFor = <T>(pairs: readonly (readonly [T, string])[], label: string): T => {
        const PAIR = pairs.find(([, name]) => name == label);
        if (!PAIR) throw new Error(`Error writing settings: there is no option named ${label}.`);
        return PAIR[0];
    };

    // Penetration is carried as a fraction of the shoe, so the closest offered slice names it
    const namePenetration = (fraction: number): string => PENETRATIONS
        .reduce((closest, slice) => Math.abs(slice[0] - fraction) < Math.abs(closest[0] - fraction) ? slice : closest)[1];

    // The table is rebuilt from the draft on every keypress, so a cancel can walk away from
    // the edits and a save can hand them back whole. Speed rides along with the rules because
    // it cycles like one, even though it lives outside the rule set
    type Draft = { readonly rules: RuleSet; readonly speed: number };
    let draft: Draft = { rules: { ...currentRules }, speed: SPEED };
    const withRules = (from: Draft, changed: Partial<RuleSet>): Draft =>
        ({ ...from, rules: { ...from.rules, ...changed } });

    // One row per rule, in the order the player reads them, plus the animation speed. Each row
    // owns its options and both halves of its binding -- read lifts the current option out of the
    // draft, write puts a chosen one back -- so a row is added or moved in exactly one place
    type Setting = {
        readonly label: string;
        readonly options: readonly string[];
        readonly read: (from: Draft) => string;
        readonly write: (from: Draft, option: string) => Draft;
    };
    const SETTINGS: readonly Setting[] = [
        {
            label: 'Number of decks',
            options: ['1', '2', '4', '6', '8'],
            read: (from) => `${from.rules.decks}`,
            write: (from, option) => withRules(from, { decks: Number(option) })
        },
        {
            label: 'Hit on soft 17',
            options: ['Yes', 'No'],
            read: (from) => yesNo(from.rules.h17),
            write: (from, option) => withRules(from, { h17: option == 'Yes' })
        },
        {
            label: 'Re-split split aces',
            options: ['Yes', 'No'],
            read: (from) => yesNo(from.rules.rsa),
            write: (from, option) => withRules(from, { rsa: option == 'Yes' })
        },
        {
            label: 'Double after split',
            options: ['Yes', 'No'],
            read: (from) => yesNo(from.rules.das),
            write: (from, option) => withRules(from, { das: option == 'Yes' })
        },
        {
            label: 'Max hands',
            options: ['2', '3', '4', '6'],
            read: (from) => `${from.rules.maxHands}`,
            write: (from, option) => withRules(from, { maxHands: Number(option) })
        },
        {
            label: 'Surrender allowed',
            options: ['Yes', 'No'],
            read: (from) => yesNo(from.rules.surrender),
            write: (from, option) => withRules(from, { surrender: option == 'Yes' })
        },
        {
            label: 'Blackjack payout',
            options: ['3:2', '6:5'],
            read: (from) => from.rules.blackjackPays == 1.5 ? '3:2' : '6:5',
            write: (from, option) => withRules(from, { blackjackPays: option == '3:2' ? 1.5 : 1.2 })
        },
        {
            label: 'Shoe penetration',
            options: PENETRATIONS.map(([, name]) => name),
            read: (from) => namePenetration(from.rules.penetration),
            write: (from, option) => withRules(from, { penetration: valueFor(PENETRATIONS, option) })
        },
        {
            label: 'Penetration mode',
            options: PEN_MODES.map(([, name]) => name),
            read: (from) => labelFor(PEN_MODES, from.rules.penMode),
            write: (from, option) => withRules(from, { penMode: valueFor(PEN_MODES, option) })
        },
        {
            label: 'Animation speed',
            options: SPEEDS.map(([, name]) => name),
            read: (from) => labelFor(SPEEDS, from.speed),
            write: (from, option) => ({ ...from, speed: valueFor(SPEEDS, option) })
        }
    ];

    // A number reads as a quantity rather than a choice, so it wears brackets in the table
    const inCell = (option: string): string => Number.isNaN(Number(option)) ? option : `[${option}]`;

    // The value column is cut for the widest option any row can hold, so the table keeps still
    // as the player cycles through settings rather than breathing in and out a character at a time
    const LABEL_WIDTH: number = Math.max(...SETTINGS.map((setting) => setting.label.length));
    const VALUE_WIDTH: number = Math.max(...SETTINGS.flatMap((setting) => setting.options.map((option) => inCell(option).length)));

    // A single space of padding on either side of the text is the whole of each cell's margin
    const LABEL_CELL: number = LABEL_WIDTH + 2;
    const VALUE_CELL: number = VALUE_WIDTH + 2;

    // The options a row cycles through are listed outside the right border, in a third column
    const CYCLE_GUTTER = ''.padEnd(4);

    // Colour marks wherever the player is standing
    const HIGHLIGHT = '\x1b[1;35m';
    const PLAIN = '\x1b[0m';
    const marked = (text: string, highlighted: boolean): string => highlighted ? `${HIGHLIGHT}${text}${PLAIN}` : text;

    const rule = (left: string, join: string, right: string): string =>
        `${left}${''.padEnd(LABEL_CELL, '─')}${join}${''.padEnd(VALUE_CELL, '─')}${right}`;
    const row = (label: string, value: string, cycled: string = ''): string =>
        `│ ${label.padEnd(LABEL_WIDTH)} │ ${value.padEnd(VALUE_WIDTH)} │`
        + (cycled == '' ? '' : marked(CYCLE_GUTTER + cycled, true));

    const centered = (text: string, width: number): string => {
        const LEFT_PAD: number = Math.max(0, Math.floor((width - text.length) / 2));
        return `${''.padEnd(LEFT_PAD)}${text}`.padEnd(Math.max(width, text.length));
    };

    // Where the player is standing: a rule row, or the footer, where left/right pick the button
    const FOOTER_ROW: number = SETTINGS.length;
    let selectedRow: number = 0;
    let onCancel: boolean = false;

    // The draft is the only record of what is selected -- the option showing in a row IS the row's
    // value -- so cycling reads the draft for where it stands and writes back the neighbouring option
    const cycle = (direction: number): void => {
        const SETTING: Setting | undefined = SETTINGS[selectedRow];
        if (!SETTING) throw new Error(`Error cycling the settings menu: row ${selectedRow} does not exist.`);

        // A rule set carrying a value the menu doesn't offer starts the cycle from the first option
        const CURRENT: number = Math.max(0, SETTING.options.indexOf(SETTING.read(draft)));
        const NEXT: string | undefined = SETTING.options[(CURRENT + direction + SETTING.options.length) % SETTING.options.length];
        if (NEXT == undefined) throw new Error(`Error cycling the settings menu: row ${selectedRow} offers no options.`);

        draft = SETTING.write(draft, NEXT);
    };

    const menu = (): string => {
        const BODY: string = SETTINGS
            .map((setting, index) => index == selectedRow
                ? row(setting.label, inCell(setting.read(draft)), `← ${setting.read(draft)} →`)
                : row(setting.label, inCell(setting.read(draft))))
            .join(`\n${rule('├', '┼', '┤')}\n`);

        // Save and Cancel split the table evenly, the bar sitting under the column divider
        const FOOTER = ` ${marked(centered('Save', LABEL_CELL), selectedRow == FOOTER_ROW && !onCancel)}`
            + `|${marked(centered('Cancel [ESC]', VALUE_CELL), selectedRow == FOOTER_ROW && onCancel)} `;

        return [rule('┌', '┬', '┐'), BODY, rule('└', '┴', '┘'), '', FOOTER].join('\n');
    };

    // Repaint in place -- home the cursor and wipe what was there rather than scrolling a new copy.
    // Kept synchronous so a fast key repeat can never interleave two half-drawn screens
    const draw = (): void => { output.write(`\x1b[H\x1b[0J${menu()}\n`) };

    let onKeypress: ((str: string, key: linereader.Key) => void) | undefined;
    try {
        linereader.emitKeypressEvents(input);
        input.setRawMode(true);

        // The menu's prompt closed stdin's reader on the way in, and a closed reader leaves the
        // stream explicitly paused -- a state that listening alone will not lift. Without this the
        // keys never arrive and, with nothing left holding the loop open, the program simply ends
        input.resume();
        draw();

        // Nothing loops here: awaiting parks settingsMenu and hands the event loop back to Node,
        // which wakes the handler only when a key actually arrives. The promise is the menu --
        // it stays unsettled while the player navigates, and resolving it is what closes the screen
        const SAVED: RuleSet | undefined = await new Promise<RuleSet | undefined>((resolve) => {
            onKeypress = (_str, key) => {
                // Manual exit-hatch for raw mode
                if (!key || (key.ctrl && key.name == 'c')) process.exit(130);

                switch (key.name) {
                    case 'escape': {
                        resolve(undefined);
                        return;
                    }
                    case 'return': {
                        if (selectedRow == FOOTER_ROW) {
                            resolve(onCancel ? undefined : draft.rules);
                            return;
                        }
                        break;
                    }
                    case 'up': {
                        selectedRow = selectedRow == 0 ? FOOTER_ROW : selectedRow - 1;
                        break;
                    }
                    case 'down': {
                        selectedRow = selectedRow == FOOTER_ROW ? 0 : selectedRow + 1;
                        break;
                    }
                    case 'left': {
                        if (selectedRow == FOOTER_ROW) onCancel = !onCancel;
                        else cycle(-1);
                        break;
                    }
                    case 'right': {
                        if (selectedRow == FOOTER_ROW) onCancel = !onCancel;
                        else cycle(1);
                        break;
                    }
                }

                // Every key that didn't end the menu leaves the screen showing the new state
                draw();
            };
            input.on('keypress', onKeypress);
        });

        // Speed lives outside the rule set, so saving has to plant it by hand
        if (SAVED) SPEED = draft.speed;
        return SAVED ?? currentRules;
    }
    finally {
        if (onKeypress) input.off('keypress', onKeypress);
        input.setRawMode(false);
        input.pause();
    }
}

// Re-prompts until the move is legal, wiping the rejected input and the warning in place
async function actionPrompt(legalActions: readonly Action[]): Promise<Action> {
    const INVALID_MOVE_MESSAGE = "Invalid selection! Please select a legal move";
    const INVALID_MOVE_DURATION = 2 * SPEED;

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
            await sleep(SPEED < 1 ? (1/6) : (1/3));
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
    input = input.trim().toLowerCase();
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
            if (nextCard == undefined) throw new Error(`Error formatting the shoe: card ${i * PER_ROW + j} of ${LEN} is undefined.`);
            formattedShoe += `${nextCard.rank}${suitSymbol(nextCard.suit)} `;
        }
        formattedShoe += '\n';
    }

    // Append partial last row if needed
    for (let i = LEN - (LEN % PER_ROW); i < LEN; i++) {
        const nextCard: Card | undefined = shoe.cardsRemaining[i];
        if (nextCard == undefined) throw new Error(`Error formatting the shoe: card ${i} of ${LEN} is undefined.`);
        formattedShoe += `${nextCard.rank}${suitSymbol(nextCard.suit)} `; 
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
    if (FRAME_COUNT == 0) throw new Error("Attempted to display an animation with no frames.");

    if (!output.isTTY) {
        output.write(`${animation.frames[0]}\n\n`);
        await sleep(DURATION);
        return;
    }

    // Walk back up by the rows just written: prevents scroll errors
    let previousRows = 0;
    for (let i = 0; i < DURATION / TIME_PER_FRAME; i++) {
        const frame: string | undefined = animation.frames[i % FRAME_COUNT];
        if (frame == undefined) throw new Error(`Animation frame ${i % FRAME_COUNT}/${FRAME_COUNT} is undefined.`);
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
        throw new Error("Error displaying game board: current hand or dealer upcard not found.");
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
        const youLine = playerLine ?? `${playerCards}${playerPad}${handTotal(currentHand)}${betPad}bet ${formatCurrency(currentHand.bet)}`;
        const availableActions = legalMoves(currentHand, state.rules, state);
        const actionList = availableActions.map((action) => {
            switch (action) {
                case 'H': return '[H]it';
                case 'S': return '[S]tand';
                case 'D': return '[D]ouble';
                case 'P': return '[P]split';
                case 'R': return '[R]surrender';
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
    // Only player moves get feedback -- the boards below are drawn from the hand as it stood
    // before the move, and the pre-deal state a bet steps off of has no hand or upcard yet
    const ACTION = step.action;
    if (ACTION.type == 'bet' || ACTION.type == 'insurance' || ACTION.type == 'evenMoney') return;

    const PREV_BOARD = buildGameBoard(step.before, 'hidden');
    const PLAYED_BOARD = buildGameBoard({...step.after, activeHand: step.before.activeHand}, 'hidden');
    const playedHand: Hand | undefined = step.after.hands[step.before.activeHand];
    if (!playedHand) throw new Error(`Error displaying move feedback: resulting hand not found ${step.after.activeHand + 1}/${step.after.hands.length}.`);

    switch (ACTION.type) {
        case 'hit': {
            const drawnCard: Card | undefined = playedHand.cards[playedHand.cards.length - 1];
            if (!drawnCard) throw new Error("Error displaying move feedback: the played hand has no card after hitting.");
            const drawnRank = drawnCard.rank;
            const hitResult = handTotal(playedHand) > 21 ? 'Hand busted' : `Hand total is ${handTotal(playedHand)}`;
            const resultPause = hitResult == 'Hand busted' ? 3 : 2;
            await paint(PREV_BOARD, 1);
            await paint(PLAYED_BOARD, 1);
            await paint(`${PLAYED_BOARD}\nHit ${drawnRank}: ${hitResult}`, resultPause);

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
            if (!drawnCard) throw new Error("Error displaying move feedback: the played hand has no card after doubling.");
            const drawnRank = drawnCard.rank;
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
            const lastSplitFrame = lastFrame(SPLIT_ANIMATION);
            const halfDuration = SPLIT_ANIMATION.duration / 2;
            if (!firstCard || !secondCard || !firstHitCard) {
                throw new Error(`Error displaying split feedback: hands ${splitIndex + 1} and ${splitIndex + 2} are missing cards.`);
            }

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
            break;
        }
        case 'surrender': {
            await paintAnimation(overBoard(PREV_BOARD, SURRENDER_ANIMATION));
            break;
        }
    }
}

function dealerPlayFrames(hand: DealerHand): string[] {
    const LABEL = 'Dealer:    ';
    const GAP = 4;
    if (!hand.upcard || !hand.hole) throw new Error("Error playing out the dealer's hand: the upcard or the hole card is missing.");
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
        screen = `${screen}\n\nPush  |  Net ${formatCurrency(netPayout)}`;
    }
    else {
        screen = `${screen}\n\nPlayer wins ${handsWon} hands  |  Net ${formatCurrency(netPayout)}`;
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