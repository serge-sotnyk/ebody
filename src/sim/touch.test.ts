import { describe, expect, it } from 'vitest';
import { decodeStatus } from '../data/sprite-status.ts';
import type { LevelFile, SpriteInfo, SpriteSetFile } from '../data/types.ts';
import { INPUT, MAGAZINE } from './hero.ts';
import { LevelSprites } from './tiles.ts';
import { World } from './world.ts';

const { right: R, down: D } = INPUT;
/** Status bytes: flags, action (init 3 = no start delay), param, touch, bbox x0 x1 y0 y1. */
const sprite = (flags: number, action = 0, param = 0, touch = 0, box = [0, 24, 0, 24]): SpriteInfo =>
  decodeStatus([flags, action | (3 << 5), param, touch, ...box], [0, 0, 0, 0]);
const ONE = 0x80 | 0x40 | 0x03; // active, touchable, first and last frame

const FLOOR = 1;
const START = 2;
const BATTERY = 3;
const DISK = 4;
const CHECKPOINT = 5; // and 6, its activated frame
const KILLER = 7;
const EXIT = 8; // and 9, the indicator shown above it

const sprites = new LevelSprites([
  {
    name: 'test',
    cell: 24,
    columns: 8,
    sprites: Object.assign(new Array<SpriteInfo | null>(64).fill(null), {
      [FLOOR]: sprite(0x80),
      [START]: sprite(0x80 | 0x03, 12, 1),
      [BATTERY]: sprite(ONE, 4, 0, 1),
      [DISK]: sprite(ONE, 4, 0, 5),
      [CHECKPOINT]: sprite(0x80 | 0x40 | 0x01, 12, 0, 3),
      [CHECKPOINT + 1]: sprite(0x80 | 0x40 | 0x02, 12, 0, 3),
      [KILLER]: sprite(ONE, 4, 0, 4),
      [EXIT]: sprite(0x83, 15, 0, 0, [0, 24, 0, 1]),
      [EXIT + 1]: sprite(ONE, 21, 242, 6, [0, 24, 12, 24]),
    }),
  } satisfies SpriteSetFile,
  { name: 'empty', cell: 24, columns: 8, sprites: new Array(64).fill(null) },
]);

/**
 * Screen 0: floor along the bottom; standing on it, left to right: the start
 * (column 1), a battery (3), a disk (5), a checkpoint (7) and a killer (10).
 * Screen 1: floor, an exit tile in the bottom row at column 4.
 */
function level(): LevelFile {
  const floor = (): number[] => Array.from({ length: 104 }, (_, i) => (i >= 91 ? FLOOR : 0));
  const objects = new Array<number>(104).fill(0);
  Object.assign(objects, { [6 * 13 + 1]: START, [6 * 13 + 3]: BATTERY, [6 * 13 + 5]: DISK, [6 * 13 + 7]: CHECKPOINT, [6 * 13 + 10]: KILLER });
  const exits = new Array<number>(104).fill(0);
  exits[7 * 13 + 4] = EXIT;
  const screens: LevelFile['screens'] = new Array(256).fill(null);
  screens[0] = [floor(), objects];
  screens[1] = [floor(), exits];
  return { name: 'touch', sets: ['test', 'empty'], params: [], screens };
}

const walkRight = (world: World, ticks: number): void => {
  for (let t = 0; t < ticks; t++) world.step(R);
};
const objectAt = (world: World, col: number): number | undefined =>
  world.room.objects.find((o) => o.x === col * 24 && o.y === 6 * 24)?.frames[0];

describe('touching objects', () => {
  it('a battery raises the weapon level, fills the magazine and is gone for good', () => {
    const world = new World(level(), sprites);
    walkRight(world, 10);
    expect(world.hero).toMatchObject({ power: 1, ammo: MAGAZINE[1] });
    expect(objectAt(world, 3)).toBeUndefined();
    world.enter(1);
    world.enter(0);
    expect(objectAt(world, 3)).toBeUndefined();
  });

  it('a disk is counted and taken', () => {
    const world = new World(level(), sprites);
    walkRight(world, 22);
    expect(world.disks).toBe(1);
    expect(objectAt(world, 5)).toBeUndefined();
  });

  it('a checkpoint becomes the respawn point and takes the weapon away', () => {
    const world = new World(level(), sprites);
    walkRight(world, 36);
    expect(world.checkpoint).toEqual({ screen: 0, x: 7 * 24, y: 6 * 24 });
    expect(world.activeCheckpointHere()).toEqual(world.checkpoint);
    expect(world.hero).toMatchObject({ power: 0, ammo: 0 });
  });

  it('a killer explodes and kills; the hero returns at the checkpoint with the level restored, disks kept', () => {
    const world = new World(level(), sprites);
    walkRight(world, 52);
    world.step();
    expect(world.hero!.state).toBe('death');
    expect(world.room.objects.some((o) => o.kind === 'explosion')).toBe(true);
    for (let t = 0; t < 80 && world.hero!.state === 'death'; t++) world.step();
    expect(world.hero).toMatchObject({ state: 'stand', x: 7 * 24, y: 6 * 24 - 24 });
    expect(objectAt(world, 10)).toBe(KILLER); // back in the level
    expect(objectAt(world, 5)).toBeUndefined(); // the disk stays collected
    expect(world.disks).toBe(1);
  });
});

describe('the exit', () => {
  const atExit = (disks: number): World => {
    const world = new World(level(), sprites);
    world.placeHero({ screen: 1, x: 4 * 24, y: 6 * 24 });
    world.disks = disks;
    return world;
  };

  it('stays shut with fewer than three disks', () => {
    const world = atExit(2);
    for (let t = 0; t < 20; t++) world.step(D);
    expect(world.room.objects.some((o) => o.kind === 'exitIndicator')).toBe(false);
    expect(world.exiting).toBe(false);
  });

  it('shows a blinking indicator at three disks; Down on it ends the level after the hero fades out', () => {
    const world = atExit(3);
    world.step();
    const indicator = world.room.objects.find((o) => o.kind === 'exitIndicator');
    expect(indicator).toMatchObject({ x: 4 * 24, y: 6 * 24, frames: [EXIT + 1] });
    const shown = Array.from({ length: 8 }, () => {
      world.step();
      return indicator!.show;
    });
    expect(shown).toContain(true);
    expect(shown).toContain(false);
    world.step(D);
    expect(world.exiting).toBe(true);
    for (let t = 0; t < 10 && !world.completed; t++) world.step();
    expect(world.completed).toBe(true);
    expect(world.hero!.state).toBe('teleportOut');
  });
});

describe('checkpoint look', () => {
  it('the active checkpoint shows its cross frame, the others the plain one', async () => {
    const { roomLayers } = await import('../render/compose.ts');
    const world = new World(level(), sprites);
    const frameAt = (col: number): number | undefined =>
      roomLayers(world.room, sprites, world.activeCheckpointHere()).back.find((op) => op.x === col * 24 && op.y === 6 * 24)
        ?.sprite;
    // Placed with its crossed frame, the checkpoint at column 7 still shows the plain one until it is active.
    expect(frameAt(7)).toBe(CHECKPOINT + 1);
    walkRight(world, 36);
    expect(frameAt(7)).toBe(CHECKPOINT);
  });
});

describe('a saved game', () => {
  it('resumes at its checkpoint with its disks collected, and survives a trip through JSON', () => {
    const played = new World(level(), sprites);
    walkRight(played, 36);
    expect(played.checkpoints).toBe(1);
    const saved = JSON.parse(JSON.stringify(played.progress())) as ReturnType<World['progress']>;

    const world = new World(level(), sprites);
    world.resume(saved);
    expect(world.disks).toBe(1);
    expect(world.checkpoint).toEqual({ screen: 0, x: 7 * 24, y: 6 * 24 });
    expect(world.activeCheckpointHere()).toEqual(world.checkpoint);
    expect(world.hero).toMatchObject({ state: 'stand', x: 7 * 24, y: 6 * 24 - 24, power: 0 });
    expect(objectAt(world, 5)).toBeUndefined(); // the disk stays taken
    expect(objectAt(world, 3)).toBe(BATTERY); // a battery is not part of the save
  });
});
