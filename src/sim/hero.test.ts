import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertLevel, convertSpriteSet } from '../../tools/convert/convert.ts';
import { ORIGINAL_DOS } from '../../tools/convert/paths.ts';
import { decodeStatus } from '../data/sprite-status.ts';
import type { LevelFile, SpriteInfo, SpriteSetFile } from '../data/types.ts';
import { INPUT } from './hero.ts';
import { LevelSprites } from './tiles.ts';
import { World } from './world.ts';

const { left: L, right: R, up: U } = INPUT;
const sprite = (flags: number, action = 0, param = 0): SpriteInfo =>
  decodeStatus([flags, action | (3 << 5), param, 0, 0, 24, 0, 24], [0, 0, 0, 0]);

function makeSet(entries: Record<number, SpriteInfo>): SpriteSetFile {
  const sprites: (SpriteInfo | null)[] = new Array(64).fill(null);
  for (const [i, s] of Object.entries(entries)) sprites[Number(i)] = s;
  return { name: 'test', cell: 24, columns: 8, sprites };
}

const FLOOR = 1;
const START = 2;
const sprites = new LevelSprites([
  makeSet({ [FLOOR]: sprite(0x80), [START]: sprite(0x80 | 0x03, 12, 1) }),
  makeSet({}),
]);

/** Screens 0, 1 and 16 with a floor along the bottom row; the start checkpoint on screen 0, column 2. */
function flatLevel(): LevelFile {
  const floor = (): number[] => Array.from({ length: 104 }, (_, i) => (i >= 91 ? FLOOR : 0));
  const screens: LevelFile['screens'] = new Array(256).fill(null);
  const start = floor();
  start[6 * 13 + 2] = START;
  screens[0] = [start];
  screens[1] = [floor()];
  screens[16] = [floor()];
  return { name: 'flat', sets: ['test', 'test'], params: [], screens };
}

function play(world: World, keys: number[]): { x: number; y: number; state: string; screen: number }[] {
  return keys.map((k) => {
    world.step(k);
    const h = world.hero!;
    return { x: h.x, y: h.y, state: h.state, screen: world.room.screen };
  });
}

describe('hero', () => {
  it('starts standing on the level start checkpoint', () => {
    const world = new World(flatLevel(), sprites);
    // Feet on the floor top (y 168), centred on the checkpoint tile (x 48..72).
    expect(world.hero).toMatchObject({ x: 48, y: 120, state: 'stand', orientation: 1 });
  });

  it('starts where the DOS game shows it on elek', () => {
    const original = (file: string): Uint8Array => readFileSync(join(ORIGINAL_DOS, file));
    const elek = new World(
      convertLevel('elek', original('elek.ggc')),
      new LevelSprites([convertSpriteSet('elek1', original('elek1.ggs')).meta, convertSpriteSet('elek2', original('elek2.ggs')).meta]),
    );
    // Columns 3, rows 4-5 of screen 0 (docs/fidelity.md, DOS 1).
    expect(elek.room.screen).toBe(0);
    expect(elek.hero).toMatchObject({ x: 72, y: 96 });
  });

  it('walks 4 pixels a tick', () => {
    const world = new World(flatLevel(), sprites);
    expect(play(world, [R, R, R]).map((p) => p.x)).toEqual([52, 56, 60]);
  });

  it('turns for four ticks before walking the other way', () => {
    const world = new World(flatLevel(), sprites);
    const steps = play(world, [L, L, L, L, L, L]);
    expect(steps.map((p) => p.state)).toEqual(['turn', 'turn', 'turn', 'turn', 'move', 'move']);
    expect(steps.map((p) => p.x)).toEqual([48, 48, 48, 48, 44, 40]);
    expect(world.hero!.orientation).toBe(0);
  });

  it('crouches two ticks, jumps 48 pixels high and lands back', () => {
    const world = new World(flatLevel(), sprites);
    const steps = play(world, [U, ...new Array<number>(40).fill(0)]);
    expect(steps.slice(0, 3).map((p) => p.state)).toEqual(['beforeJump', 'beforeJump', 'jump']);
    expect(Math.min(...steps.map((p) => p.y))).toBe(120 - 48);
    expect(world.hero).toMatchObject({ y: 120, state: 'stand' });
  });

  it('enters the screen to the right when its middle crosses the edge', () => {
    const world = new World(flatLevel(), sprites);
    const steps = play(world, new Array<number>(70).fill(R));
    const i = steps.findIndex((p) => p.screen === 1);
    expect(i).toBeGreaterThan(0);
    // Middle (x + 12) past 312 on the old screen becomes x - 312 on the new one.
    expect(steps[i - 1]!.x + 4 + 12).toBeGreaterThan(312);
    expect(steps[i]!.x).toBe(steps[i - 1]!.x + 4 - 312);
  });

  it('falls into the screen below where there is no floor', () => {
    const level = flatLevel();
    level.screens[1] = [new Array<number>(104).fill(0)];
    level.screens[17] = level.screens[16]!;
    const world = new World(level, sprites);
    const steps = play(world, new Array<number>(120).fill(R));
    expect(steps.some((p) => p.screen === 1 + 16)).toBe(true);
    // Landed on the floor of screen 17 and walks on (right is still held).
    expect(steps.at(-1)).toMatchObject({ screen: 17, y: 120, state: 'move' });
  });
});
