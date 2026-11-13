import { describe, expect, it } from 'vitest';
import { decodeStatus } from '../data/sprite-status.ts';
import type { LevelFile, SpriteInfo, SpriteSetFile } from '../data/types.ts';
import { classifyTile, LevelSprites } from '../sim/tiles.ts';
import { composeScreen } from './compose.ts';

const sprite = (flags: number, action = 0, param = 0): SpriteInfo =>
  decodeStatus([flags, action, param, 0, 0, 24, 0, 24], [0, 0, 0, 0]);

function makeSet(name: string, entries: Record<number, SpriteInfo>): SpriteSetFile {
  const sprites: (SpriteInfo | null)[] = new Array(64).fill(null);
  for (const [i, s] of Object.entries(entries)) sprites[Number(i)] = s;
  return { name, cell: 24, columns: 8, sprites };
}

const set1 = makeSet('a', {
  1: sprite(0x00), // scenery
  2: sprite(0x80), // solid tile
  3: sprite(0x80 | 0x40, 1), // object (cycle)
  4: sprite(0x04), // scenery drawn in front
  10: sprite(0x80 | 0x01 | 0x02, 13, 1), // two-tile teleport, single-frame animation
  11: sprite(0x80, 4), // its upper half
});
const set2 = makeSet('b', { 0: sprite(0x00) });
const sprites = new LevelSprites([set1, set2]);

function level(planes: (number[] | null)[]): LevelFile {
  const screens: LevelFile['screens'] = new Array(256).fill(null);
  screens[0] = planes;
  return { name: 't', sets: ['a', 'b'], params: [], screens };
}

const plane = (cells: Record<number, number>): number[] => {
  const p = new Array<number>(104).fill(0);
  for (const [i, v] of Object.entries(cells)) p[Number(i)] = v;
  return p;
};

describe('classifyTile', () => {
  it('separates scenery, solid tiles and objects', () => {
    expect(classifyTile(set1.sprites[1]!)).toBe('background');
    expect(classifyTile(set1.sprites[2]!)).toBe('collision');
    expect(classifyTile(set1.sprites[3]!)).toBe('active');
  });
});

describe('LevelSprites', () => {
  it('maps 0..63 to the first set and 64..127 to the second', () => {
    expect(sprites.get(1)).toBe(set1.sprites[1]);
    expect(sprites.get(64)).toBe(set2.sprites[0]);
    expect(sprites.get(5)).toBeNull();
  });
});

describe('composeScreen', () => {
  // Object in plane 0, solid tile in plane 1, scenery in plane 2, in-front scenery in plane 3.
  const lvl = level([plane({ 0: 3 }), plane({ 1: 2 }), plane({ 2: 1 }), plane({ 3: 4 })]);

  it("'planes' keeps plane order", () => {
    expect(composeScreen(lvl, sprites, 0, 'planes').ops.map((o) => o.sprite)).toEqual([3, 2, 1, 4]);
  });

  it("'game' draws scenery, solid tiles, objects, then in-front sprites", () => {
    expect(composeScreen(lvl, sprites, 0, 'game').ops.map((o) => o.sprite)).toEqual([1, 2, 3, 4]);
  });

  it('adds the upper half of a two-tile teleport one tile above', () => {
    const ops = composeScreen(level([plane({ [13 * 2 + 5]: 10 })]), sprites, 0, 'game').ops;
    expect(ops).toEqual([
      { sprite: 10, x: 5 * 24, y: 2 * 24 },
      { sprite: 11, x: 5 * 24, y: 1 * 24 },
    ]);
  });

  it('reports tiles that point at empty slots', () => {
    expect(composeScreen(level([plane({ 0: 7 })]), sprites, 0, 'game').missing).toEqual([7]);
  });
});
