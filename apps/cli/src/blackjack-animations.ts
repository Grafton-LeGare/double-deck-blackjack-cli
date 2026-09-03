import type { Card } from '../../../packages/blackjack/src/blackjack-types.ts';
import { SUIT_SYMBOLS } from '../../../packages/blackjack/src/blackjack-types.ts';

export type Animation = {
    readonly frames: readonly string[];
    readonly timePerFrame: number;
    readonly duration: number;
};

const GREETING_FRAMES: readonly string[] = [
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

export const GREETING_ANIMATION: Animation = {
    frames: GREETING_FRAMES,
    timePerFrame: (1/3) / GREETING_FRAMES.length,
    duration: 3
};

const RESHUFFLE_FRAMES: readonly string[] = ['Reshuffling the shoe.', 'Reshuffling the shoe..', 'Reshuffling the shoe...'];

export const RESHUFFLE_ANIMATION: Animation = {
    frames: RESHUFFLE_FRAMES,
    timePerFrame: 0.5,
    duration: 3
};

export function formatCard(card: Card | undefined): string {
    return card ? `[${card.rank}${SUIT_SYMBOLS[card.suit]}]` : `[??]`;
}

// Cards land one at a time: player, dealer upcard, player, dealer hole
export function dealAnimation(firstCard: Card, secondCard: Card, upcard: Card): Animation {
    const first = formatCard(firstCard);
    const second = formatCard(secondCard);
    const up = formatCard(upcard);

    const DEALER_LABEL = "Dealer's hand:";
    const PLAYER_LABEL = "Your hand:";
    // Widest label plus a space, so the card columns line up whatever the labels say
    const LABEL_WIDTH = Math.max(DEALER_LABEL.length, PLAYER_LABEL.length) + 4;
    const dealer = DEALER_LABEL.padEnd(LABEL_WIDTH);
    const player = PLAYER_LABEL.padEnd(LABEL_WIDTH);

    const frames: readonly string[] = [
        `${dealer}\n\n${player}`,
        `${dealer}\n\n${player}${first}`,
        `${dealer}${up}\n\n${player}${first}`,
        `${dealer}${up}\n\n${player}${first} ${second}`,
        `${dealer}${up} [??]\n\n${player}${first} ${second}`
    ];
    const timePerFrame = 1;

    // Play through exactly once -- displayAnimation wraps around past the last frame
    return {frames: frames, timePerFrame: timePerFrame, duration: frames.length * timePerFrame};
}

const playerBlackjackFrames: readonly string[] = [
     '    · Player blackjack! ·',
     '    • Player blackjack! •',
     '    * Player blackjack! *',
     '    • Player blackjack! •'
];

export const PLAYER_BLACKJACK_ANIMATION: Animation = {
     frames: playerBlackjackFrames,
     timePerFrame: 0.25,
     duration: 3
};

export const DOUBLE_ANIMATION: Animation = {
     frames: ['Double down!', 'Double down! !'],
     timePerFrame: 0.75,
     duration: 3
};

export const SPLIT_ANIMATION: Animation = {
     frames: ['  SPLIT  ', 'S P L I T'],
     timePerFrame: 0.75,
     duration: 3
};

export const SPLIT_HAND_ANIMATION: Animation = {
     frames: ["Playing first hand.", "Playing first hand..", "Playing first hand..."],
     timePerFrame: 0.5,
     duration: 3
};

export const NEXT_HAND_ANIMATION: Animation = {
     frames: ["Moving to next hand.", "Moving to next hand..", "Moving to next hand..."],
     timePerFrame: 0.5,
     duration: 3
};

export const SURRENDER_ANIMATION: Animation = {
     frames: ["Surrendered!  |▭", "Surrendered!  ▭|"],
     timePerFrame: 0.5,
     duration: 3
};