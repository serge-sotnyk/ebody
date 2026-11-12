// The original game's random numbers: Borland C++ 3.1 rand() and the
// random(n) macro, plus the per-screen seeding.
// Ported from PyElectroMan emglobals.py (srand, rand, random, init_screen_randoms).

import { SCREEN_COLS } from '../data/types.ts';

const MULTIPLIER = 0x015a4e35;

export class BorlandRandom {
  private seed = 1;

  srand(seed: number): void {
    this.seed = seed >>> 0;
  }

  /** Seed = Seed * 0x015A4E35 + 1 (32-bit); returns bits 16..30. */
  rand(): number {
    this.seed = (Math.imul(MULTIPLIER, this.seed) + 1) >>> 0;
    return (this.seed >>> 16) & 0x7fff;
  }

  /** `#define random(num) (int)(((long)rand() * (num)) / (RAND_MAX + 1))` */
  random(num: number): number {
    return Math.floor((this.rand() * num) / 0x8000);
  }

  /** Internal state, for snapshots and tests. */
  get state(): number {
    return this.seed;
  }
}

/**
 * Seed the generator from the screen number and draw one random byte per
 * tile column. Objects use these bytes for position-based start delays. The
 * generator is reseeded at the end, so each screen starts from the same state.
 */
export function initScreenRandoms(rng: BorlandRandom, screen: number): number[] {
  rng.srand(256 * screen + screen);
  rng.random(256); // skipped in the original too ("for compatibility reasons")
  const randoms = Array.from({ length: SCREEN_COLS }, () => rng.random(256));
  rng.srand(256 * screen + screen);
  return randoms;
}
