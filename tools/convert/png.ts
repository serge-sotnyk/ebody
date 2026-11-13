import { PNG } from 'pngjs';
import type { RgbaImage } from './bmp.ts';

export function encodePng(image: RgbaImage): Uint8Array {
  const png = new PNG({ width: image.width, height: image.height, colorType: 6 });
  png.data = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  return PNG.sync.write(png, { colorType: 6 });
}

export function decodePng(bytes: Uint8Array): RgbaImage {
  const png = PNG.sync.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}
