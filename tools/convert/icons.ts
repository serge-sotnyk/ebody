// App icons (home screen, install, browser tab): the hero standing, facing
// right, scaled up with square pixels on the title screens' blue.

import { TILE } from '../../src/data/types.ts';
import { HERO_ANIMS } from '../../src/sim/hero.ts';
import type { RgbaImage } from './bmp.ts';
import { atlasCell } from './convert.ts';

/** The background blue of the title and "level completed" screens. */
export const ICON_BACKGROUND = [8, 8, 96] as const;

export interface IconSpec {
  file: string;
  size: number;
  /** How many icon pixels one sprite pixel takes. */
  scale: number;
}

/**
 * The hero is two tiles tall. In the maskable icon it stays inside the
 * middle circle that every launcher shape keeps (80% of the width).
 */
export const ICONS: readonly IconSpec[] = [
  { file: 'icon-64.png', size: 64, scale: 1 },
  { file: 'icon-180.png', size: 180, scale: 3 },
  { file: 'icon-192.png', size: 192, scale: 3 },
  { file: 'icon-512.png', size: 512, scale: 8 },
  { file: 'icon-maskable-512.png', size: 512, scale: 7 },
];

/** A square icon with the hero (from the hero sprite set's atlas) in the middle. */
export function heroIcon(heroAtlas: RgbaImage, size: number, scale: number): RgbaImage {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) data.set([...ICON_BACKGROUND, 255], i * 4);
  const x0 = Math.floor((size - TILE * scale) / 2);
  const y0 = Math.floor((size - 2 * TILE * scale) / 2);
  HERO_ANIMS.RSTAND[0]!.forEach((sprite, row) => {
    const cell = atlasCell(heroAtlas, sprite);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const s = (y * TILE + x) * 4;
        if (cell.data[s + 3] === 0) continue;
        for (let dy = 0; dy < scale; dy++) {
          const py = y0 + (row * TILE + y) * scale + dy;
          for (let dx = 0; dx < scale; dx++) {
            data.set(cell.data.subarray(s, s + 4), (py * size + x0 + x * scale + dx) * 4);
          }
        }
      }
    }
  });
  return { width: size, height: size, data };
}
