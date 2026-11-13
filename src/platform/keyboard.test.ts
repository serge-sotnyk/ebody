import { describe, expect, it } from 'vitest';
import { INPUT } from '../sim/hero.ts';
import { Keyboard } from './keyboard.ts';

const key = (type: string, code: string, key: string): Event =>
  Object.assign(new Event(type, { cancelable: true }), { code, key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });

function setup(): { target: EventTarget; keyboard: Keyboard } {
  const target = new EventTarget();
  return { target, keyboard: new Keyboard(target as unknown as Window) };
}

describe('Keyboard', () => {
  it('maps the arrows and Space by their physical keys', () => {
    const { target, keyboard } = setup();
    target.dispatchEvent(key('keydown', 'ArrowRight', 'ArrowRight'));
    target.dispatchEvent(key('keydown', 'Space', ' '));
    expect(keyboard.sample()).toBe(INPUT.right | INPUT.fire);
  });

  it('fires on Enter too, and on a TV remote OK that has no physical code', () => {
    const { target, keyboard } = setup();
    const ok = key('keydown', '', 'Enter');
    target.dispatchEvent(ok);
    expect(ok.defaultPrevented).toBe(true);
    expect(keyboard.sample()).toBe(INPUT.fire);
    target.dispatchEvent(key('keyup', '', 'Enter'));
    expect(keyboard.sample()).toBe(0);
  });

  it('keeps a key tapped between two ticks for the next one', () => {
    const { target, keyboard } = setup();
    target.dispatchEvent(key('keydown', 'ArrowUp', 'ArrowUp'));
    target.dispatchEvent(key('keyup', 'ArrowUp', 'ArrowUp'));
    expect(keyboard.sample()).toBe(INPUT.up);
    expect(keyboard.sample()).toBe(0);
  });

  it('leaves other keys alone', () => {
    const { target, keyboard } = setup();
    const esc = key('keydown', 'Escape', 'Escape');
    target.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(false);
    expect(keyboard.sample()).toBe(0);
  });
});
