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

const original = (file: string): Uint8Array => readFileSync(join(ORIGINAL_DOS, file));
const sheets = {
  weapons: convertSpriteSet('weapons', original('weapons.ggs')).meta,
  enem: convertSpriteSet('enem', original('enem.ggs')).meta,
};

/** Status bytes: flags, action (init 3), param, touch, box x0 x1 y0 y1. */
const sprite = (flags: number, action = 0, param = 0, touch = 0, box = [0, 24, 0, 24]): SpriteInfo =>
  decodeStatus([flags, action | (3 << 5), param, touch, ...box], [0, 0, 0, 0]);

const FLOOR = 1;
const START = 2;
const CRAWLER = 3; // creature type 0, speed 2
const CRAWLER_TINY = 4; // the same, for a one-tile ledge
const CANNON = 5; // fires right every 10 + random(10) ticks; 6 is its shot
const ROCKET = 7; // flies up when the hero is above it

const sprites = new LevelSprites(
  [
    {
      name: 'test',
      cell: 24,
      columns: 8,
      sprites: Object.assign(new Array<SpriteInfo | null>(64).fill(null), {
        [FLOOR]: sprite(0x80),
        [START]: sprite(0x80 | 0x03, 12, 1),
        [CRAWLER]: sprite(0x80 | 0x03, 16, 0, 2),
        [CRAWLER_TINY]: sprite(0x80 | 0x03, 16, 0, 2),
        [CANNON]: sprite(0x80 | 0x01, 18, 10, 0, [4, 20, 8, 16]),
        [CANNON + 1]: sprite(0x80 | 0x02, 0, 4, 0, [0, 8, 10, 14]),
        [ROCKET]: sprite(0x80 | 0x40 | 0x03, 9, 6, 4, [8, 16, 0, 24]),
      }),
    },
    { name: 'empty', cell: 24, columns: 8, sprites: new Array(64).fill(null) },
  ],
  sheets,
);

type Cells = Record<number, number>;
const cell = (col: number, row: number): number => row * 13 + col;
function level(...screens: Cells[]): LevelFile {
  const all: LevelFile['screens'] = new Array(256).fill(null);
  screens.forEach((cells, s) => {
    all[s] = [Object.assign(new Array<number>(104).fill(0), cells)];
  });
  return { name: 'enemies', sets: ['test', 'empty'], params: [], screens: all };
}
/** Floor along the bottom row and walls in columns 0 and 12 (rows 5-6). */
const room = (extra: Cells): Cells => {
  const cells: Cells = {};
  for (let c = 0; c < 13; c++) cells[cell(c, 7)] = FLOOR;
  for (const c of [0, 12]) for (const r of [5, 6]) cells[cell(c, r)] = FLOOR;
  return { ...cells, ...extra };
};

describe('creatures', () => {
  it('patrol their floor between the walls, turning at each end', () => {
    const world = new World(level(room({ [cell(4, 6)]: CRAWLER })), sprites, { hero: false });
    const creature = world.room.objects.find((o) => o.kind === 'enemy')!;
    const xs: number[] = [];
    for (let t = 0; t < 600; t++) {
      world.step();
      xs.push(creature.x);
    }
    expect(creature).toMatchObject({ left: 24, right: 264 });
    expect(Math.min(...xs)).toBeLessThanOrEqual(24);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(264);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(24 - 2);
    expect(Math.max(...xs)).toBeLessThanOrEqual(264 + 2);
  });

  it('with less than a tile of room, are removed', () => {
    const cells: Cells = { [cell(5, 7)]: FLOOR, [cell(5, 6)]: CRAWLER_TINY };
    const world = new World(level(cells), sprites, { hero: false });
    world.step();
    expect(world.room.objects.some((o) => o.kind === 'enemy')).toBe(false);
  });

  it('kill the hero on contact', () => {
    const world = new World(level(room({ [cell(8, 6)]: START, [cell(3, 6)]: CRAWLER })), sprites);
    let died = false;
    for (let t = 0; t < 200 && !died; t++) {
      world.step();
      died = world.hero!.state === 'death';
    }
    expect(died).toBe(true);
  });

  it('die from a shot, in an explosion', () => {
    const world = new World(level(room({ [cell(2, 6)]: START, [cell(9, 6)]: CRAWLER })), sprites);
    world.hero!.power = 2;
    world.hero!.ammo = MAGAZINE[2]!;
    world.step(INPUT.fire);
    let explosions = 0;
    for (let t = 0; t < 20; t++) {
      world.step();
      explosions = Math.max(explosions, world.room.objects.filter((o) => o.kind === 'explosion').length);
    }
    expect(world.room.objects.some((o) => o.kind === 'enemy')).toBe(false);
    expect(explosions).toBe(2); // the creature's and the shot's
    expect(world.hero!.state).not.toBe('death');
  });
});

describe('cannons', () => {
  it('fire again and again; the shots fly on and stop at a solid wall', () => {
    const cells: Cells = { [cell(2, 3)]: CANNON, [cell(10, 3)]: FLOOR };
    const world = new World(level(cells), sprites, { hero: false });
    const shots = new Set<object>();
    let farthest = 0;
    for (let t = 0; t < 120; t++) {
      world.step();
      for (const o of world.room.objects) {
        if (o.kind !== 'enemyShot') continue;
        shots.add(o);
        farthest = Math.max(farthest, o.x);
      }
    }
    // Every 10 to 19 ticks: at least 6 shots in 120 ticks.
    expect(shots.size).toBeGreaterThanOrEqual(6);
    // A shot's box (x 0..8) never gets past the wall at x 240.
    expect(farthest).toBeLessThan(240);
    expect(farthest).toBeGreaterThan(200);
  });
});

describe('rockets', () => {
  it('launch when the hero is above them and explode at the ceiling', () => {
    // A ledge in row 3 (columns 4-8) for the hero to stand on; the rocket below it in row 6.
    const cells: Cells = room({ [cell(6, 6)]: ROCKET, [cell(6, 2)]: START });
    for (let c = 4; c <= 8; c++) cells[cell(c, 3)] = FLOOR;
    const world = new World(level(cells), sprites);
    const rocket = world.room.objects.find((o) => o.kind === 'rocket')!;
    let exploded = false;
    for (let t = 0; t < 200 && !exploded; t++) {
      world.step();
      exploded = world.room.objects.some((o) => o.kind === 'explosion');
    }
    expect(rocket.phase).toBe('flying');
    expect(exploded).toBe(true);
    expect(world.room.objects.includes(rocket)).toBe(false);
  });
});
