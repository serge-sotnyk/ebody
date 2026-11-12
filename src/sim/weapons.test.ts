import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertSpriteSet } from '../../tools/convert/convert.ts';
import { ORIGINAL_DOS } from '../../tools/convert/paths.ts';
import { decodeStatus } from '../data/sprite-status.ts';
import type { LevelFile, SpriteInfo } from '../data/types.ts';
import { INPUT } from './hero.ts';
import { LevelSprites } from './tiles.ts';
import { MAGAZINE } from './weapons.ts';
import { World } from './world.ts';

const weapons = convertSpriteSet('weapons', readFileSync(join(ORIGINAL_DOS, 'weapons.ggs'))).meta;
const { fire: F, right: R } = INPUT;
const sprite = (flags: number, action = 0, param = 0, touch = 0): SpriteInfo =>
  decodeStatus([flags, action | (3 << 5), param, touch, 0, 24, 0, 24], [0, 0, 0, 0]);

const FLOOR = 1;
const START = 2;
const CRATE = 3; // shootable and breakable; 4 is what it leaves behind
const PIPE = 5; // shootable, not breakable
const WALL = 6;
const KILLER = 7;

const sprites = new LevelSprites(
  [
  {
    name: 'test',
    cell: 24,
    columns: 8,
    sprites: Object.assign(new Array<SpriteInfo | null>(64).fill(null), {
      [FLOOR]: sprite(0x80),
      [START]: sprite(0x80 | 0x03, 12, 1),
      [CRATE]: sprite(0x80 | 0x20 | 0x08 | 0x03, 4),
      [CRATE + 1]: sprite(0x00),
      [PIPE]: sprite(0x80 | 0x20 | 0x03, 4),
      [WALL]: sprite(0x80),
      [KILLER]: sprite(0x80 | 0x40 | 0x03, 4, 0, 4),
    }),
  },
  { name: 'empty', cell: 24, columns: 8, sprites: new Array(64).fill(null) },
  ],
  { weapons },
);

/** Screen 0: floor; standing on it, the start (column 1), a crate (6), a pipe (8), a wall (11). Screen 1: a killer. */
function level(): LevelFile {
  const tiles = Array.from({ length: 104 }, (_, i) => (i >= 91 ? FLOOR : 0));
  Object.assign(tiles, { [6 * 13 + 11]: WALL, [5 * 13 + 11]: WALL });
  const objects = new Array<number>(104).fill(0);
  Object.assign(objects, { [6 * 13 + 1]: START, [6 * 13 + 6]: CRATE, [5 * 13 + 8]: PIPE });
  const screen1 = Array.from({ length: 104 }, (_, i) => (i >= 91 ? FLOOR : i === 6 * 13 + 2 ? KILLER : 0));
  const screens: LevelFile['screens'] = new Array(256).fill(null);
  screens[0] = [tiles, objects];
  screens[1] = [screen1];
  return { name: 'shoot', sets: ['test', 'empty'], params: [], screens };
}

function armed(power: number): World {
  const world = new World(level(), sprites);
  world.hero!.power = power;
  world.hero!.ammo = MAGAZINE[power]!;
  return world;
}

const shots = (w: World) => w.room.objects.filter((o) => o.kind === 'shot');
/** The level object (not a shot or an explosion) on a tile. */
const at = (w: World, col: number, row: number) =>
  w.room.objects.find((o) => o.x === col * 24 && o.y === row * 24 && o.kind !== 'shot' && o.kind !== 'explosion');
const clearCrate = (w: World): void => {
  w.room.objects = w.room.objects.filter((o) => o !== at(w, 6, 6));
};

describe('weapon', () => {
  it('fires nothing without a battery', () => {
    const world = armed(0);
    world.step(F);
    expect(shots(world)).toHaveLength(0);
  });

  it('one shot per press: it appears in front of the hero and flies on the next ticks', () => {
    const world = armed(1);
    world.step(F);
    world.step(F);
    expect(shots(world)).toHaveLength(1);
    const shot = shots(world)[0]!;
    expect(shot).toMatchObject({ x: 24 + 19 + 14, y: 120 + 16 });
    world.step();
    expect(shot.x).toBe(24 + 19 + 28);
  });

  it('level 1 reaches only as far as one run of its animation', () => {
    const world = armed(1);
    clearCrate(world);
    world.step(F);
    const alive = Array.from({ length: 10 }, () => {
      world.step();
      return shots(world).length;
    });
    expect(alive).toEqual([1, 1, 1, 1, 1, 1, 1, 0, 0, 0]);
  });

  it('heats up: a level 4 shot blocks the next until the weapon cools down', () => {
    const world = armed(4);
    world.step(); // the weapon warms to 1 once it is armed
    world.step(F);
    expect(world.hero!.temp).toBe(5);
    world.step();
    world.step(F);
    expect(shots(world)).toHaveLength(1); // too hot
    // Heat drops by one every five ticks; at 1 a level 4 shot fits again.
    for (let t = 0; t < 20; t++) world.step();
    world.step(F);
    expect(shots(world).length).toBeGreaterThan(0);
  });

  it('an empty magazine drops the weapon one level', () => {
    const world = armed(1);
    world.hero!.ammo = 1;
    world.step(F);
    expect(world.hero).toMatchObject({ power: 0, ammo: 0 });
  });

  it('a breakable object explodes and leaves its next sprite, which stays until the hero dies', () => {
    const world = armed(2);
    world.step(F);
    for (let t = 0; t < 10; t++) world.step();
    expect(at(world, 6, 6)?.frames).toEqual([CRATE + 1]);
    world.enter(1);
    world.enter(0);
    expect(at(world, 6, 6)?.frames).toEqual([CRATE + 1]);
    // Die on screen 1's killer; back at the start, the crate is whole again.
    world.enter(1);
    world.placeHero({ screen: 1, x: 24, y: 144 });
    for (let t = 0; t < 120; t++) world.step(R);
    world.enter(0);
    expect(at(world, 6, 6)?.frames).toEqual([CRATE]);
  });

  it('an unbreakable shootable object just explodes', () => {
    const world = armed(2);
    world.hero!.y -= 24; // shoot along row 5
    world.step(F);
    for (let t = 0; t < 14; t++) world.step();
    expect(at(world, 8, 5)).toBeUndefined();
  });

  it('a wall stops the shot with an explosion', () => {
    const world = armed(3);
    clearCrate(world);
    world.step(F);
    let exploded = false;
    for (let t = 0; t < 20; t++) {
      world.step();
      exploded ||= world.room.objects.some((o) => o.kind === 'explosion' && o.x > 200);
    }
    expect(exploded).toBe(true);
    expect(shots(world)).toHaveLength(0);
  });
});
