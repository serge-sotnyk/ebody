// Software rasteriser for draw lists, used to check level rendering in Node.

import { ATLAS_COLUMNS, SCREEN_COLS, SCREEN_ROWS, SET_SIZE, TILE } from '../../src/data/types.ts';
import type { DrawOp } from '../../src/render/compose.ts';
import type { RgbaImage } from './bmp.ts';

export const PLAYFIELD_W = SCREEN_COLS * TILE;
export const PLAYFIELD_H = SCREEN_ROWS * TILE;

/** Draw ops onto a black playfield; a pixel is copied when its alpha is non-zero. */
export function rasterize(ops: readonly DrawOp[], atlases: readonly [RgbaImage, RgbaImage]): RgbaImage {
  const out: RgbaImage = { width: PLAYFIELD_W, height: PLAYFIELD_H, data: new Uint8Array(PLAYFIELD_W * PLAYFIELD_H * 4) };
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = 255;
  for (const op of ops) {
    const atlas = atlases[op.sprite < SET_SIZE ? 0 : 1];
    const cell = op.sprite % SET_SIZE;
    const sx0 = (cell % ATLAS_COLUMNS) * TILE;
    const sy0 = Math.floor(cell / ATLAS_COLUMNS) * TILE;
    for (let y = 0; y < TILE; y++) {
      const dy = op.y + y;
      if (dy < 0 || dy >= PLAYFIELD_H) continue;
      for (let x = 0; x < TILE; x++) {
        const dx = op.x + x;
        if (dx < 0 || dx >= PLAYFIELD_W) continue;
        const s = ((sy0 + y) * atlas.width + sx0 + x) * 4;
        if (atlas.data[s + 3] === 0) continue;
        const d = (dy * PLAYFIELD_W + dx) * 4;
        out.data[d] = atlas.data[s]!;
        out.data[d + 1] = atlas.data[s + 1]!;
        out.data[d + 2] = atlas.data[s + 2]!;
      }
    }
  }
  return out;
}

/** Number of pixels whose RGB differs. */
export function diffPixels(a: RgbaImage, b: RgbaImage): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) n++;
  }
  return n;
}

/** Crop a region out of an RGB or RGBA image into RGBA. */
export function crop(image: RgbaImage, x0: number, y0: number, w: number, h: number): RgbaImage {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    data.set(image.data.subarray(((y0 + y) * image.width + x0) * 4, ((y0 + y) * image.width + x0 + w) * 4), y * w * 4);
  }
  return { width: w, height: h, data };
}
