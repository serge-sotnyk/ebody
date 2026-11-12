// Game state advanced in fixed 20 Hz ticks. No DOM here, so the same code
// runs in the browser and in Node tests.

import type { LevelFile } from '../data/types.ts';
import { BorlandRandom } from './random.ts';
import { enterRoom, stepRoom, type Room } from './room.ts';
import type { LevelSprites } from './tiles.ts';

/** Ticks per second in PyElectroMan (clock.tick(20)); see docs/fidelity.md R5. */
export const TICK_HZ = 20;

export class World {
  readonly rng = new BorlandRandom();
  /** Ticks since the level started (the original's main counter). */
  tick = 0;
  room: Room;

  constructor(
    readonly level: LevelFile,
    readonly sprites: LevelSprites,
    screen: number,
  ) {
    this.room = enterRoom(level, sprites, this.rng, screen);
  }

  /**
   * Switch to another screen. Its objects start from their initial state on
   * every visit for now; whether the original keeps them is open (fidelity G3).
   */
  enter(screen: number): void {
    this.room = enterRoom(this.level, this.sprites, this.rng, screen);
  }

  step(): void {
    stepRoom(this.room, this.sprites, this.rng);
    this.tick += 1;
  }

  /** Plain copy of the whole state, for tests and replays. */
  snapshot(): { tick: number; rng: number; room: Room } {
    return structuredClone({ tick: this.tick, rng: this.rng.state, room: this.room });
  }
}
