import { describe, expect, it } from 'vitest';
import { INPUT } from '../sim/hero.ts';
import { TouchPad } from './touch.ts';

const { left: L, right: R, up: U, fire: F } = INPUT;

describe('TouchPad', () => {
  it('holds a button while a finger is on it', () => {
    const pad = new TouchPad();
    pad.hold(1, R);
    expect(pad.sample()).toBe(R);
    expect(pad.sample()).toBe(R);
    pad.release(1);
    expect(pad.sample()).toBe(0);
  });

  it('follows a finger sliding from one button to another', () => {
    const pad = new TouchPad();
    pad.hold(1, L);
    pad.hold(1, R);
    expect(pad.held()).toBe(R);
  });

  it('combines fingers: walk with one, jump with another', () => {
    const pad = new TouchPad();
    pad.hold(1, R);
    pad.hold(2, U);
    expect(pad.sample()).toBe(R | U);
    pad.release(2);
    expect(pad.sample()).toBe(R);
  });

  it('keeps a tap that ends between two ticks', () => {
    const pad = new TouchPad();
    pad.hold(3, F);
    pad.release(3);
    expect(pad.sample()).toBe(F);
    expect(pad.sample()).toBe(0);
  });

  it('a finger sliding off the buttons holds nothing', () => {
    const pad = new TouchPad();
    pad.hold(1, L);
    pad.hold(1, 0);
    expect(pad.sample()).toBe(L); // the press still counts once
    expect(pad.sample()).toBe(0);
  });
});
