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
    timePerFrame: 1/3,
    duration: 2
};

function formatCard(card: Card): string {
    return `[${card.rank}${SUIT_SYMBOLS[card.suit]}]`;
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