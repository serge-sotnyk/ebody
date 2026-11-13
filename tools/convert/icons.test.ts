import { describe, expect, it } from 'vitest';
import { ATLAS_COLUMNS, TILE } from '../../src/data/types.ts';
import { HERO_ANIMS } from '../../src/sim/hero.ts';
import type { RgbaImage } from './bmp.ts';
import { BANNER, heroIcon, ICON_BACKGROUND, ICONS, tvBanner } from './icons.ts';

/** A hero atlas whose standing sprites are each one red pixel, at their top-left corner. */
function atlas(): RgbaImage {
  const width = ATLAS_COLUMNS * TILE;
  const height = 8 * TILE;
  const data = new Uint8Array(width * height * 4);
  for (const sprite of HERO_ANIMS.RSTAND[0]!) {
    const i = (Math.floor(sprite / ATLAS_COLUMNS) * TILE * width + (sprite % ATLAS_COLUMNS) * TILE) * 4;
    data.set([255, 0, 0, 255], i);
  }
  return { width, height, data };
}

const pixel = (img: RgbaImage, x: number, y: number): number[] => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

describe('app icons', () => {
  it('draws the standing hero, scaled, centred on the title blue', () => {
    const icon = heroIcon(atlas(), 192, 3);
    expect(icon.width).toBe(192);
    const blue = [...ICON_BACKGROUND, 255];
    expect(pixel(icon, 0, 0)).toEqual(blue);
    // The hero box is 72 x 144, at (60, 24); each sprite's corner pixel becomes a 3 x 3 block.
    expect(pixel(icon, 60, 24)).toEqual([255, 0, 0, 255]);
    expect(pixel(icon, 62, 26)).toEqual([255, 0, 0, 255]);
    expect(pixel(icon, 63, 24)).toEqual(blue);
    expect(pixel(icon, 60, 24 + 72)).toEqual([255, 0, 0, 255]);
  });

  it('keeps the hero inside the safe circle of the maskable icon', () => {
    const { size, scale } = ICONS.find((i) => i.file.includes('maskable'))!;
    const halfDiagonal = Math.hypot((TILE * scale) / 2, TILE * scale);
    expect(halfDiagonal).toBeLessThanOrEqual(0.4 * size);
  });

  it('cuts the TV banner from the middle of the title picture', () => {
    const data = new Uint8Array(320 * 200 * 4);
    for (let y = 0; y < 200; y++) data.fill(y, y * 320 * 4, (y + 1) * 320 * 4); // each row's bytes hold its number
    const banner = tvBanner({ width: 320, height: 200, data });
    expect(banner).toMatchObject(BANNER);
    expect(pixel(banner, 0, 0)).toEqual([10, 10, 10, 10]);
    expect(pixel(banner, 319, 179)).toEqual([189, 189, 189, 189]);
  });
});
