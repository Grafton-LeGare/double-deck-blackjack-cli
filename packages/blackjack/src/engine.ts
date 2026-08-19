type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K';

export function valueFromRank(rank: Rank): number {
    if (rank == 'A') {
        return 11;
    }
    else if (['T', 'J', 'Q', 'K'].includes(rank)) {
        return 10;
    }
    else {
        return Number(rank);
    }
}