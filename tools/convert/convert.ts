// Conversion of the original game files into web-friendly assets.
// Pure functions over bytes; main.ts does the file I/O.

import { ATLAS_COLUMNS, SET_SIZE, TILE, type LevelFile, type SpriteSetFile } from '../../src/data/types.ts';
import { decodeStatus } from '../../src/data/sprite-status.ts';
import type { RgbaImage } from './bmp.ts';
import { parseGgc } from './ggc.ts';
import { parseGgs } from './ggs.ts';
import { applySpritePatches } from './patches.ts';

export interface ConvertedSpriteSet {
  meta: SpriteSetFile;
  atlas: RgbaImage;
}

/** One .ggs file -> an 8x8 atlas of 24x24 cells plus decoded metadata. */
export function convertSpriteSet(name: string, bytes: Uint8Array): ConvertedSpriteSet {
  const ggs = parseGgs(bytes);
  const status = applySpritePatches(name, ggs.status);
  const rows = Math.ceil(SET_SIZE / ATLAS_COLUMNS);
  const atlas: RgbaImage = {
    width: ATLAS_COLUMNS * TILE,
    height: rows * TILE,
    data: new Uint8Array(ATLAS_COLUMNS * TILE * rows * TILE * 4),
  };
  const sprites = ggs.sprites.map((pixels, i) => {
    if (!pixels) return null;
    blitCell(atlas, pixels, i);
    return decodeStatus(status.slice(i * 8, i * 8 + 8), ggs.size.slice(i * 4, i * 4 + 4));
  });
  return { meta: { name, cell: TILE, columns: ATLAS_COLUMNS, sprites }, atlas };
}

function blitCell(atlas: RgbaImage, pixels: Uint8Array, index: number): void {
  const cx = (index % ATLAS_COLUMNS) * TILE;
  const cy = Math.floor(index / ATLAS_COLUMNS) * TILE;
  for (let y = 0; y < TILE; y++) {
    const src = y * TILE * 4;
    const dst = ((cy + y) * atlas.width + cx) * 4;
    atlas.data.set(pixels.subarray(src, src + TILE * 4), dst);
  }
}

/** Extract one cell of an atlas back into a 24x24 image (used by verification and tests). */
export function atlasCell(atlas: RgbaImage, index: number): RgbaImage {
  const cx = (index % ATLAS_COLUMNS) * TILE;
  const cy = Math.floor(index / ATLAS_COLUMNS) * TILE;
  const data = new Uint8Array(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++) {
    const src = ((cy + y) * atlas.width + cx) * 4;
    data.set(atlas.data.subarray(src, src + TILE * 4), y * TILE * 4);
  }
  return { width: TILE, height: TILE, data };
}

export function convertLevel(name: string, bytes: Uint8Array): LevelFile {
  return parseGgc(bytes, name);
}
