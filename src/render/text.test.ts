import { describe, expect, it } from 'vitest';
import { layoutText } from './text.ts';

describe('layoutText', () => {
  it('centres each line and the block, 24 pixels per character', () => {
    const glyphs = layoutText('ab*c', 320, 200);
    // Two lines: block from y (200 - 48) / 2 = 76; "ab" from x (320 - 48) / 2 = 136, "c" from 148.
    expect(glyphs).toEqual([
      { sprite: 1, x: 136, y: 76 },
      { sprite: 2, x: 160, y: 76 },
      { sprite: 3, x: 148, y: 100 },
    ]);
  });

  it('maps digits and punctuation to their sprites and leaves gaps for spaces', () => {
    const glyphs = layoutText('level 1?', 320, 200);
    expect(glyphs.map((g) => g.sprite)).toEqual([12, 5, 22, 5, 12, 36, 47]);
    expect(glyphs[5]!.x - glyphs[4]!.x).toBe(48); // the space
  });

  it('lays out the level-completed message like the original', () => {
    const glyphs = layoutText('good job* *level 3*completed* *press fire', 320, 200);
    expect(glyphs[0]).toEqual({ sprite: 7, x: 64, y: 28 });
  });
});
