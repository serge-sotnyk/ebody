// On-screen buttons for touch screens.
//
// Each finger (pointer) holds at most one button: the one under it right now,
// so a thumb can slide from left to right without lifting. Several fingers
// hold several buttons (walk and jump, walk and fire). Like the keyboard, a
// button tapped and released between two ticks still counts for the next one.

/** Which buttons each finger holds; turns them into controller bits. */
export class TouchPad {
  private fingers = new Map<number, number>();
  private pressed = 0;

  /** Finger `id` is now over the button for `bits` (0: over none). */
  hold(id: number, bits: number): void {
    const before = this.fingers.get(id) ?? 0;
    this.pressed |= bits & ~before;
    if (bits) this.fingers.set(id, bits);
    else this.fingers.delete(id);
  }

  release(id: number): void {
    this.fingers.delete(id);
  }

  releaseAll(): void {
    this.fingers.clear();
    this.pressed = 0;
  }

  /** Bits held now. */
  held(): number {
    let bits = 0;
    for (const b of this.fingers.values()) bits |= b;
    return bits;
  }

  /** Controller bits for one tick: held now, plus tapped since the last tick. */
  sample(): number {
    const bits = this.held() | this.pressed;
    this.pressed = 0;
    return bits;
  }
}

/**
 * Wire a TouchPad to the buttons inside `pad` (elements with `data-bit`).
 * Fingers that start on a button are followed until lifted; the button under
 * a finger is looked up on every move. Buttons show a "pressed" class while held.
 */
export function attachTouchPad(pad: HTMLElement, touch = new TouchPad()): TouchPad {
  const buttons = [...pad.querySelectorAll<HTMLElement>('[data-bit]')];
  const followed = new Set<number>();

  const bitsAt = (x: number, y: number): number => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-bit]');
    return el && pad.contains(el) ? Number(el.dataset.bit) : 0;
  };
  const showHeld = (): void => {
    const held = touch.held();
    for (const b of buttons) b.classList.toggle('pressed', (held & Number(b.dataset.bit)) !== 0);
  };

  pad.addEventListener('pointerdown', (e) => {
    const bits = bitsAt(e.clientX, e.clientY);
    if (!bits) return;
    e.preventDefault(); // no focus, no text selection, no emulated mouse events
    followed.add(e.pointerId);
    touch.hold(e.pointerId, bits);
    showHeld();
  });
  window.addEventListener('pointermove', (e) => {
    if (!followed.has(e.pointerId)) return;
    touch.hold(e.pointerId, bitsAt(e.clientX, e.clientY));
    showHeld();
  });
  const lift = (e: PointerEvent): void => {
    if (!followed.delete(e.pointerId)) return;
    touch.release(e.pointerId);
    showHeld();
  };
  window.addEventListener('pointerup', lift);
  window.addEventListener('pointercancel', lift);
  window.addEventListener('blur', () => {
    followed.clear();
    touch.releaseAll();
    showHeld();
  });
  pad.addEventListener('contextmenu', (e) => e.preventDefault()); // long press
  return touch;
}
