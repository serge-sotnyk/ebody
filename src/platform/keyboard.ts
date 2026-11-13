// Keyboard to controller bits. The game reads the controller once per tick
// (every 50 ms); a key pressed and released between two ticks still counts
// for the next tick, so short taps are not lost.

import { INPUT } from '../sim/hero.ts';

/** Physical keys (KeyboardEvent.code), independent of the keyboard layout. */
const KEYS: Record<string, number> = {
  ArrowLeft: INPUT.left,
  ArrowRight: INPUT.right,
  ArrowUp: INPUT.up,
  ArrowDown: INPUT.down,
  Space: INPUT.fire,
};

export class Keyboard {
  private held = 0;
  private pressed = 0;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      const bit = KEYS[e.code];
      if (bit === undefined || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      e.preventDefault();
      this.held |= bit;
      this.pressed |= bit;
    });
    target.addEventListener('keyup', (e) => {
      const bit = KEYS[e.code];
      if (bit !== undefined) this.held &= ~bit;
    });
    // Keys released while the window had no focus never send keyup.
    target.addEventListener('blur', () => {
      this.held = 0;
      this.pressed = 0;
    });
  }

  /** Controller bits for one tick: keys held now, plus keys tapped since the last tick. */
  sample(): number {
    const bits = this.held | this.pressed;
    this.pressed = 0;
    return bits;
  }
}
