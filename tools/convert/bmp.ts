// Minimal reader for 8-bit palettised, uncompressed Windows BMP files
// (the 320x200 title and interstitial screens).

export interface RgbaImage {
  width: number;
  height: number;
  /** width*height*4 bytes, top row first. */
  data: Uint8Array;
}

export function parseBmp8(bytes: Uint8Array): RgbaImage {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] !== 0x42 || bytes[1] !== 0x4d) throw new Error('not a BMP file');
  const pixelOffset = view.getUint32(10, true);
  const headerSize = view.getUint32(14, true);
  const width = view.getInt32(18, true);
  const rawHeight = view.getInt32(22, true);
  const bpp = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  if (bpp !== 8 || compression !== 0) throw new Error(`unsupported BMP: ${bpp} bpp, compression ${compression}`);
  const colorsUsed = view.getUint32(46, true) || 256;
  const paletteOffset = 14 + headerSize;
  const height = Math.abs(rawHeight);
  const bottomUp = rawHeight > 0;
  const stride = (width + 3) & ~3;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = pixelOffset + (bottomUp ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x++) {
      const index = bytes[srcRow + x]!;
      if (index >= colorsUsed) throw new Error(`palette index ${index} out of range`);
      const p = paletteOffset + index * 4; // BGRA quads
      const o = (y * width + x) * 4;
      data[o] = bytes[p + 2]!;
      data[o + 1] = bytes[p + 1]!;
      data[o + 2] = bytes[p]!;
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}
