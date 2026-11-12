import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertLevel, convertSpriteSet } from '../../tools/convert/convert.ts';
import { ORIGINAL_DOS } from '../../tools/convert/paths.ts';
import { objectSprite } from './objects.ts';
import { LevelSprites } from './tiles.ts';
import { World } from './world.ts';

// Real data: level elek, converted straight from the original files.
const original = (file: string): Uint8Array => readFileSync(join(ORIGINAL_DOS, file));
const level = convertLevel('elek', original('elek.ggc'));
const sprites = new LevelSprites([
  convertSpriteSet('elek1', original('elek1.ggs')).meta,
  convertSpriteSet('elek2', original('elek2.ggs')).meta,
]);

const run = (screen: number, ticks: number): World => {
  const world = new World(level, sprites, { screen, hero: false });
  for (let t = 0; t < ticks; t++) world.step();
  return world;
};

describe('World', () => {
  it('gives the same state after 100 ticks every time', () => {
    const a = run(1, 100).snapshot();
    expect(run(1, 100).snapshot()).toEqual(a);
    expect(a.tick).toBe(100);
  });

  it('animates: the state moves away from the start', () => {
    // 37 ticks: the animations on this screen loop back to the start every 20 ticks.
    expect(run(1, 37).snapshot().room).not.toEqual(run(1, 0).snapshot().room);
  });

  it('restarts a screen from its initial state when entered again', () => {
    const world = run(1, 37);
    world.enter(1);
    expect(world.snapshot().room).toEqual(run(1, 0).snapshot().room);
  });

  it('runs the upper half of a teleport as its own animation (elek screen 1)', () => {
    const world = new World(level, sprites, { screen: 1, hero: false });
    const top = world.room.objects.find((o) => o.x === 6 * 24 && o.y === 5 * 24);
    expect(top?.kind).toBe('cycle');
    const seen = new Set<number | null>();
    for (let t = 0; t < 40; t++) {
      world.step();
      seen.add(objectSprite(top!));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
