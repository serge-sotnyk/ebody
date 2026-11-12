import { describe, expect, it } from 'vitest';
import { decodeStatus } from '../data/sprite-status.ts';
import type { LevelFile, SpriteInfo, SpriteSetFile } from '../data/types.ts';
import { createObject, objectSprite, updateObject, type ObjectContext, type SimObject } from './objects.ts';
import { BorlandRandom } from './random.ts';
import { enterRoom, stepRoom } from './room.ts';
import { LevelSprites } from './tiles.ts';

const ACTIVE = 0x80;
const FIRST = 0x01;
const LAST = 0x02;
/** Status bytes: flags, action | init << 5, param. Init 3 = no start delay. */
const spr = (flags: number, action: number, param = 0, init = 3): SpriteInfo =>
  decodeStatus([flags, action | (init << 5), param, 0, 0, 24, 0, 24], [0, 0, 0, 0]);

function makeSet(entries: Record<number, SpriteInfo>): SpriteSetFile {
  const sprites: (SpriteInfo | null)[] = new Array(64).fill(null);
  for (const [i, s] of Object.entries(entries)) sprites[Number(i)] = s;
  return { name: 'test', cell: 24, columns: 8, sprites };
}

const sprites = new LevelSprites([
  makeSet({
    1: spr(0, 0, 2), // scenery; its param is the hidden-phase length of the cycle+ at 2..3
    2: spr(ACTIVE | FIRST, 5, 0), // cycle+
    3: spr(ACTIVE | LAST, 5, 1),
    4: spr(ACTIVE | FIRST, 1, 1), // cycle
    5: spr(ACTIVE, 1, 0),
    6: spr(ACTIVE | LAST, 1, 2),
    7: spr(ACTIVE | FIRST | LAST, 4, 1), // display; param is the hidden phase of the pulse+ at 8..10
    8: spr(ACTIVE | FIRST, 6), // pulse+
    9: spr(ACTIVE, 6),
    10: spr(ACTIVE | LAST, 6),
    11: spr(ACTIVE | FIRST, 2), // pulse
    12: spr(ACTIVE, 2),
    13: spr(ACTIVE | LAST, 2),
    14: spr(ACTIVE | FIRST | LAST, 14, 2), // flash
    15: spr(ACTIVE | FIRST | LAST, 4, 1), // display; param is the off phase of the flash+ at 16
    16: spr(ACTIVE | FIRST | LAST, 7, 0), // flash+
    17: spr(ACTIVE | FIRST | LAST, 21), // flash special
    18: spr(ACTIVE | FIRST, 3), // monitor with a special frame
    19: spr(ACTIVE, 3),
    20: spr(ACTIVE, 3, 3),
    21: spr(ACTIVE | LAST, 3),
    22: spr(ACTIVE | FIRST, 1, 4, 0), // cycle, diagonal start delay
    23: spr(ACTIVE | LAST, 1, 4, 0),
    24: spr(ACTIVE | FIRST, 1, 4, 5), // cycle, start delay from the screen's random bytes
    25: spr(ACTIVE | LAST, 1, 4, 7), // cycle, random start frame
    30: spr(ACTIVE | FIRST | LAST, 11), // killing floor
    31: spr(ACTIVE, 0), // solid tile
  }),
  makeSet({}),
]);

function ctx(seed = 0, randoms: number[] = new Array(13).fill(0)): ObjectContext {
  const rng = new BorlandRandom();
  rng.srand(seed);
  return { sprites, rng, randoms };
}

/** Sprite shown after each of `n` ticks. */
function run(o: SimObject, n: number, c = ctx()): (number | null)[] {
  return Array.from({ length: n }, () => {
    updateObject(o, c);
    return objectSprite(o);
  });
}

describe('animation timing', () => {
  it('cycle: each frame stays for its param + 1 ticks', () => {
    const o = createObject(4, 0, 0, ctx());
    expect(objectSprite(o)).toBe(4);
    expect(run(o, 9)).toEqual([5, 6, 6, 6, 4, 4, 5, 6, 6]);
  });

  it('pulse: runs forth and back, showing each end twice', () => {
    const o = createObject(11, 0, 0, ctx());
    expect(run(o, 8)).toEqual([12, 13, 13, 12, 11, 11, 12, 13]);
  });

  it('cycle+: plays once, then hides for the preceding sprite param + 1 ticks', () => {
    const o = createObject(2, 0, 0, ctx());
    expect(objectSprite(o)).toBeNull();
    expect(run(o, 7)).toEqual([2, 3, 3, null, null, null, 2]);
  });

  it('pulse+: plays forth and back once, then hides', () => {
    const o = createObject(8, 0, 0, ctx());
    expect(run(o, 8)).toEqual([8, 9, 10, 9, 8, null, null, 8]);
  });

  it('flash: on and off for param + 1 ticks each', () => {
    const o = createObject(14, 0, 0, ctx());
    expect(objectSprite(o)).toBeNull();
    expect(run(o, 7)).toEqual([14, 14, 14, null, null, null, 14]);
  });

  it('flash+: on for its own param, off for the preceding sprite param', () => {
    const o = createObject(16, 0, 0, ctx());
    expect(run(o, 4)).toEqual([16, null, null, 16]);
  });

  it('flash special: three ticks on, three off', () => {
    const o = createObject(17, 0, 0, ctx());
    expect(run(o, 7)).toEqual([17, 17, 17, null, null, null, 17]);
  });
});

describe('monitor', () => {
  it('flickers between its first two frames, drawing from the generator', () => {
    const c = ctx(42);
    const expected = new BorlandRandom();
    expected.srand(42);
    const o = createObject(18, 0, 0, c);
    for (let t = 0; t < 50; t++) {
      updateObject(o, c);
      const frame = expected.random(2);
      if (expected.random(128) === 0) break; // a special frame: covered by the next test
      expect(o.frame).toBe(frame);
    }
  });

  it('sometimes holds a special frame for param + random(param) ticks', () => {
    // Find a seed whose second draw, random(128), is zero.
    let seed = 0;
    for (const probe = new BorlandRandom(); ; seed++) {
      probe.srand(seed);
      probe.random(2);
      if (probe.random(128) === 0) break;
    }
    const o = createObject(18, 0, 0, ctx());
    const c = ctx(seed);
    updateObject(o, c);
    expect(o.frame).toBeGreaterThanOrEqual(2);
    if (o.frames[o.frame] === 20) {
      expect(o.counter).toBeGreaterThanOrEqual(3);
      expect(o.counter).toBeLessThan(6);
      const hold = o.counter;
      for (let t = 0; t < hold; t++) updateObject(o, c);
      expect(o.frame).toBe(0);
    }
  });
});

describe('start delays', () => {
  it('diagonal: (column + row) mod (param + 1)', () => {
    expect(createObject(22, 2 * 24, 1 * 24, ctx()).delay).toBe(3);
    expect(createObject(22, 3 * 24, 2 * 24, ctx()).delay).toBe(0);
  });

  it("from the screen's random byte for the column", () => {
    const randoms = [0, 0, 0, 13, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(createObject(24, 3 * 24, 0, ctx(0, randoms)).delay).toBe(13 % 5);
  });

  it('random start frame', () => {
    const expected = new BorlandRandom();
    expected.srand(7);
    const o = createObject(25, 0, 0, ctx(7));
    expect(o.frame).toBe(expected.random(2));
    expect(o.delay).toBe(0);
  });
});

describe('rooms', () => {
  function level(planes: (number[] | null)[]): LevelFile {
    const screens: LevelFile['screens'] = new Array(256).fill(null);
    screens[0] = planes;
    return { name: 't', sets: ['test', 'test'], params: [], screens };
  }

  it('a killing floor removes the bottom row of solid tiles and itself', () => {
    const plane = new Array<number>(104).fill(0);
    plane[7 * 13 + 0] = 31; // bottom row
    plane[6 * 13 + 0] = 31;
    plane[0] = 30;
    const room = enterRoom(level([plane]), sprites, new BorlandRandom(), 0);
    expect(room.solid).toHaveLength(2);
    stepRoom(room, sprites, new BorlandRandom());
    expect(room.killingFloor).toBe(true);
    expect(room.solid.map((t) => t.y)).toEqual([6 * 24]);
    expect(room.objects).toHaveLength(0);
  });
});
