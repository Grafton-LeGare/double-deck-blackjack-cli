// Cards
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'] as const;
export const SUITS = ['S', 'C', 'H', 'D'] as const;

export type Rank = typeof RANKS[number];
export type Suit = typeof SUITS[number];

export const SUIT_SYMBOLS: Record<Suit, string> = {
    S: '\u2660',
    C: '\u2663',
    H: '\u2665',
    D: '\u2666'
};

export type Card = {
    readonly rank: Rank;
    readonly suit: Suit
};

export const PLAYING_CARDS: readonly Card[] = [
    {rank: 'A', suit: 'S'}, {rank: '2', suit: 'S'}, {rank: '3', suit: 'S'}, {rank: '4', suit: 'S'},
    {rank: '5', suit: 'S'}, {rank: '6', suit: 'S'}, {rank: '7', suit: 'S'}, {rank: '8', suit: 'S'},
    {rank: '9', suit: 'S'}, {rank: 'T', suit: 'S'}, {rank: 'J', suit: 'S'}, {rank: 'Q', suit: 'S'},
    {rank: 'K', suit: 'S'},

    {rank: 'A', suit: 'C'}, {rank: '2', suit: 'C'}, {rank: '3', suit: 'C'}, {rank: '4', suit: 'C'},
    {rank: '5', suit: 'C'}, {rank: '6', suit: 'C'}, {rank: '7', suit: 'C'}, {rank: '8', suit: 'C'},
    {rank: '9', suit: 'C'}, {rank: 'T', suit: 'C'}, {rank: 'J', suit: 'C'}, {rank: 'Q', suit: 'C'},
    {rank: 'K', suit: 'C'},

    {rank: 'A', suit: 'H'}, {rank: '2', suit: 'H'}, {rank: '3', suit: 'H'}, {rank: '4', suit: 'H'},
    {rank: '5', suit: 'H'}, {rank: '6', suit: 'H'}, {rank: '7', suit: 'H'}, {rank: '8', suit: 'H'},
    {rank: '9', suit: 'H'}, {rank: 'T', suit: 'H'}, {rank: 'J', suit: 'H'}, {rank: 'Q', suit: 'H'},
    {rank: 'K', suit: 'H'},

    {rank: 'A', suit: 'D'}, {rank: '2', suit: 'D'}, {rank: '3', suit: 'D'}, {rank: '4', suit: 'D'},
    {rank: '5', suit: 'D'}, {rank: '6', suit: 'D'}, {rank: '7', suit: 'D'}, {rank: '8', suit: 'D'},
    {rank: '9', suit: 'D'}, {rank: 'T', suit: 'D'}, {rank: 'J', suit: 'D'}, {rank: 'Q', suit: 'D'},
    {rank: 'K', suit: 'D'}
] as const;

// Dealer
export type Shoe = {
    readonly decks: number;
    readonly seed?: number;
    readonly cutCardPosition: number;
    readonly cardsDealt: number;
    readonly cardsRemaining: readonly Card[]
};

export type RuleSet = {
    decks: number;
    h17: boolean;
    das: boolean;
    rsa: boolean;
    maxHands: number;
    surrender: boolean;
    blackjackPays: 1.5 | 1.2;
    penetration: number;         // fraction of the full shoe seen before the shuffle
    penMode: 'notch' | 'cutcard' | 'dealer'
};

export type Casino = {
    id: string;
    name: string;
    area: 'locals' | 'downtown' | 'strip';
    rules: RuleSet;
    minBet: number;
    maxBet: number;
    tables: number;
    deal: 'pitch' | 'shoe';
    edgeOffTop: number;
    note: string;
    source: { survey: string; asOf: string }
};

export type DealerHand = {
    readonly upcard?: Card;
    readonly hole?: Card;
    readonly drawn: readonly Card[];
    readonly holeRevealed: boolean;
    readonly playedOut: boolean
};


// Player
export type RunningCount = {
    readonly system: 'hilo';
    readonly count: number
};

export type Hand = {
    readonly cards: readonly Card[];
    readonly bet: number;
    readonly fromSplit: boolean;
    readonly result: HandResult
};

export type HandResult = 'pending' | 'win' | 'loss' | 'push' | 'surrender';

export type Action = 'H' | 'S' | 'D' | 'P' | 'R';

export type PlayerAction = 
    | { readonly type: 'bet';               readonly amount: number }
    | { readonly type: 'insurance';    readonly amount: number }
    | { readonly type: 'hit' }
    | { readonly type: 'stand' }
    | { readonly type: 'double' }
    | { readonly type: 'split' }
    | { readonly type: 'surrender' };

// STATE
export type GameEvent = 
    | { readonly type: 'reshuffle'; readonly cause: 'cutcard' | 'empty' };

export type GameState = {
    readonly rules: RuleSet;
    readonly casino?: Casino;
    readonly shoe: Shoe;
    readonly hands: readonly Hand[];
    readonly dealerHand: DealerHand;
    readonly activeHand: number;
    readonly gamePhase: 'bet' | 'insurance' | 'play' | 'settle';
    readonly insurance: number;
    readonly bank: number
};

export type Step = {
    readonly before: GameState;
    readonly action: PlayerAction;
    readonly after: GameState;
    readonly events: readonly GameEvent[]
};