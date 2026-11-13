// Reader for original "GGE file: sprites (ver 1.6)" files (.ggs).
// Ported from PyElectroMan conversion/convert_sprites.py.
//
// Layout:
//   header      32  text " GGE file: sprites (ver 1.6) \r\n\x1a"
//   V16_pal     16
//   V32_pal     32
//   params      16
//   status     512  8 bytes per sprite x 64
//   size       256  4 bytes per sprite x 64
//   future_size  2  little-endian length of a block to skip
//   future       n
//   64 x { used: 1 byte (0xFF = empty slot), then if used a 488-byte definition:
//          future 8, pixels 288 (24x24, 4 bits per pixel, high nibble first),
//          VGA_colors 48, EGA 32, CGA 32, V16 32, V32 48 }

import { TILE, SET_SIZE } from '../../src/data/types.ts';
import { VGA_PALETTE } from './palette.ts';
import { ByteReader } from './reader.ts';

const HEADER = ' GGE file: sprites';
const PIXEL_BYTES = (TILE * TILE) / 2;

export interface GgsFile {
  status: number[];
  size: number[];
  /** RGBA pixels (TILE*TILE*4) per slot, null for empty slots. */
  sprites: (Uint8Array | null)[];
}

export function parseGgs(bytes: Uint8Array): GgsFile {
  const r = new ByteReader(bytes);
  const header = new TextDecoder('latin1').decode(r.read(32));
  if (!header.startsWith(HEADER)) throw new Error(`not a GGE sprites file: ${JSON.stringify(header)}`);
  r.skip(16 + 32 + 16);
  const status = [...r.read(512)];
  const size = [...r.read(256)];
  r.skip(r.u16());

  const sprites: (Uint8Array | null)[] = [];
  for (let i = 0; i < SET_SIZE; i++) {
    if (r.u8() === 0xff) {
      sprites.push(null);
      continue;
    }
    r.skip(8);
    const packed = r.read(PIXEL_BYTES);
    const vgaColors = r.read(48);
    r.skip(32 + 32 + 32 + 48);
    sprites.push(unpackPixels(packed, vgaColors));
  }
  return { status, size, sprites };
}

/**
 * Each nibble picks an entry of the sprite's own VGA_colors table, which in
 * turn indexes the 256-colour palette. Palette index 0 is transparent.
 */
function unpackPixels(packed: Uint8Array, vgaColors: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(TILE * TILE * 4);
  let o = 0;
  const put = (nibble: number): void => {
    const p = vgaColors[nibble]!;
    const [r, g, b] = VGA_PALETTE[p]!;
    rgba[o++] = r * 4;
    rgba[o++] = g * 4;
    rgba[o++] = b * 4;
    rgba[o++] = p === 0 ? 0 : 255;
  };
  for (const byte of packed) {
    put((byte >> 4) & 0x0f);
    put(byte & 0x0f);
  }
  return rgba;
}
