import { describe, expect, it } from 'vitest';
import { BorlandRandom, initScreenRandoms } from './random.ts';

// Expected values come from PyElectroMan's emglobals.py (srand, rand, random, init_screen_randoms).
describe('BorlandRandom', () => {
  it('reproduces Borland C++ rand()', () => {
    const rng = new BorlandRandom();
    rng.srand(0);
    expect(Array.from({ length: 8 }, () => rng.rand())).toEqual([0, 346, 130, 10982, 1090, 11656, 7117, 17595]);
  });

  it('scales with random(n)', () => {
    const rng = new BorlandRandom();
    rng.srand(1);
    expect(Array.from({ length: 8 }, () => rng.random(100))).toEqual([1, 0, 33, 3, 35, 21, 53, 19]);
  });
});

describe('initScreenRandoms', () => {
  it.each([
    [0, [2, 1, 85, 8, 91, 55, 137, 50, 179, 243, 70, 113, 27], 0],
    [1, [81, 29, 193, 230, 193, 101, 217, 222, 214, 114, 214, 69, 139], 183],
    [18, [144, 2, 223, 167, 143, 110, 45, 74, 41, 235, 101, 77, 244], 227],
    [255, [178, 107, 31, 82, 101, 197, 107, 135, 150, 10, 166, 241, 69], 153],
  ])('screen %i', (screen, randoms, next) => {
    const rng = new BorlandRandom();
    expect(initScreenRandoms(rng, screen)).toEqual(randoms);
    // The generator is reseeded afterwards.
    expect(rng.random(256)).toBe(next);
  });
});
