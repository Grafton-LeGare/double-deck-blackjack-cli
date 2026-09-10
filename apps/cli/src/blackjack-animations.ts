import type { Card } from '@doubledeck/blackjack';
import { SUIT_SYMBOLS } from '@doubledeck/blackjack';

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

export function playerBlackjackAnimation(): Animation {
     const BASE_ROWS = [
          '•••••••••••••••••••••••••',
          '•                       •',
          '•   Player blackjack!   •',
          '•                       •',
          '•••••••••••••••••••••••••'
     ];
     const WIDTH = BASE_ROWS[0]!.length;

     // Every [row, col] on the border, clockwise from the top-left: across the top,
     // down the right edge, back along the bottom, up the left edge
     const BORDER: readonly (readonly [number, number])[] = [
          ...Array.from({length: WIDTH}, (_, col) => [0, col] as const),
          [1, WIDTH - 1],
          [2, WIDTH - 1],
          [3, WIDTH - 1],
          ...Array.from({length: WIDTH}, (_, col) => [4, WIDTH - 1 - col] as const),
          [3, 0],
          [2, 0],
          [1, 0]
     ];

     // The marker starts partway along the top edge and laps the border once
     const START = 4;
     const frames = BORDER.map((_, i) => {
          const [leftStarRow, leftStarCol] = BORDER[(i - 1 + START) % BORDER.length]!;
          const [row, col] = BORDER[(i + START) % BORDER.length]!;
          const [rightStarRow, rightStarCol] = BORDER[(i + 1 + START) % BORDER.length]!;
          const rows = [...BASE_ROWS];
          rows[leftStarRow] = `${rows[leftStarRow]!.slice(0, leftStarCol)}✦${rows[leftStarRow]!.slice(leftStarCol + 1)}`;
          rows[row] = `${rows[row]!.slice(0, col)}*${rows[row]!.slice(col + 1)}`;
          rows[rightStarRow] = `${rows[rightStarRow]!.slice(0, rightStarCol)}✦${rows[rightStarRow]!.slice(rightStarCol + 1)}`;
          return rows.join('\n');
     });

     return {
          frames: frames,
          timePerFrame: 1 / frames.length,
          duration: 3
     };
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
     duration: 1.5
};

export const NEXT_HAND_ANIMATION: Animation = {
     frames: ["Moving to next hand.", "Moving to next hand..", "Moving to next hand..."],
     timePerFrame: 0.5,
     duration: 1.5
};

export const SURRENDER_ANIMATION: Animation = {
     frames: [
          "Surrendered!  |▔▔▔",
          "Surrendered!  |─▔▔",
          "Surrendered!  |▔─▔",
          "Surrendered!  |▔▔─"
     ],
     timePerFrame: 0.15,
     duration: 3
};

export const GAME_OVER_ANIMATION: Animation = {
     frames: [
          "Better luck next time",
          "Better luck next time.",
          "Better luck next time..",
          "Better luck next time...",
     ],
     timePerFrame: 0.75,
     duration: 3
};