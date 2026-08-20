import { expect, test } from 'vitest';
import { valueFromRank } from '../src/engine.js';

test('valueFromRank("Q") returns 10', () => {
    expect(valueFromRank('Q')).toBe(10);
});