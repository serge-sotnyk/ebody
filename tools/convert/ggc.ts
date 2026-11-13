// Reader for original "GGE file: caves (ver 1.6)" level files (.ggc).
// Ported from PyElectroMan conversion/convert_levels.py, including its
// run-length decoding, so the output matches PyElectroMan's .ebl files.
//
// Layout:
//   header 32, set names 2 x 9 (NUL-padded), params 16, screen map 256,
//   future_size 2 + future block,
//   for every screen whose map byte is non-zero: 4 x u16 plane offsets + 8 unused bytes,
//   then the compressed plane data. Offsets are stored +2048 relative to the
//   start of the plane data; 0 means "plane absent".

import { SCREEN_COLS, SCREEN_COUNT, SCREEN_ROWS, type LevelFile, type ScreenPlanes } from '../../src/data/types.ts';
import { ByteReader } from './reader.ts';

const HEADER = ' GGE file: caves';
const PLANES = 4;
const OFFSET_BASE = 2048;

export function parseGgc(bytes: Uint8Array, name: string): LevelFile {
  const r = new ByteReader(bytes);
  const latin1 = new TextDecoder('latin1');
  const header = latin1.decode(r.read(32));
  if (!header.startsWith(HEADER)) throw new Error(`not a GGE caves file: ${JSON.stringify(header)}`);
  const setName = (): string => {
    const raw = latin1.decode(r.read(9));
    const nul = raw.indexOf('\0');
    return (nul >= 0 ? raw.slice(0, nul) : raw).toLowerCase();
  };
  const sets: [string, string] = [setName(), setName()];
  const params = [...r.read(16)];
  const map = [...r.read(256)];
  r.skip(r.u16());

  const offsets: ((number | null)[] | null)[] = [];
  for (let s = 0; s < SCREEN_COUNT; s++) {
    if (map[s] === 0) {
      offsets.push(null);
      continue;
    }
    const planeOffsets: (number | null)[] = [];
    for (let p = 0; p < PLANES; p++) {
      const ofs = r.u16();
      planeOffsets.push(ofs === 0 ? null : ofs - OFFSET_BASE);
    }
    r.skip(8);
    offsets.push(planeOffsets);
  }
  const data = r.read(r.remaining);

  const screens: (ScreenPlanes | null)[] = offsets.map((planeOffsets) =>
    planeOffsets ? planeOffsets.map((ofs) => (ofs === null ? null : decodePlane(data, ofs))) : null,
  );
  return { name, sets, params, screens };
}

/**
 * The first byte selects the scan order (>127: column by column, else row by
 * row). Then each byte is a tile index (low 7 bits); if its high bit is set,
 * the next byte is a repeat count and the tile is emitted count+1 times.
 */
function decodePlane(data: Uint8Array, start: number): number[] {
  const tiles = new Array<number>(SCREEN_COLS * SCREEN_ROWS).fill(0);
  const vertical = data[start]! > 127;
  let ptr = start + 1;
  let rpt = 0;
  const step = (x: number, y: number): void => {
    const robj = data[ptr];
    if (robj === undefined) throw new Error(`plane data overrun at ${ptr}`);
    if (robj > 127) {
      if (rpt === 0) {
        rpt = data[ptr + 1]!;
      } else {
        rpt -= 1;
        if (rpt === 0) ptr += 2;
      }
    } else {
      ptr += 1;
    }
    tiles[y * SCREEN_COLS + x] = robj & 0x7f;
  };
  if (vertical) {
    for (let x = 0; x < SCREEN_COLS; x++) for (let y = 0; y < SCREEN_ROWS; y++) step(x, y);
  } else {
    for (let y = 0; y < SCREEN_ROWS; y++) for (let x = 0; x < SCREEN_COLS; x++) step(x, y);
  }
  return tiles;
}
