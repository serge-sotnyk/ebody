import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { u8ToWav } from './audio.ts';
import { parseBmp8 } from './bmp.ts';
import { atlasCell, convertLevel, convertSpriteSet } from './convert.ts';
import { ORIGINAL_DOS, ORIGINAL_SCREENS } from './paths.ts';

const original = (file: string): Uint8Array => readFileSync(join(ORIGINAL_DOS, file));

describe('sprite sets (.ggs)', () => {
  const { meta, atlas } = convertSpriteSet('hero', original('hero.ggs'));

  it('produces a 192x192 atlas with 64 slots', () => {
    expect(atlas.width).toBe(192);
    expect(atlas.height).toBe(192);
    expect(meta.sprites).toHaveLength(64);
  });

  it('decodes status bytes of the first hero frame', () => {
    const s = meta.sprites[0]!;
    expect(s.status).toEqual([3, 0, 0, 20, 5, 23, 7, 24]);
    expect(s.bbox).toEqual({ x: 5, y: 7, w: 18, h: 17 });
    expect(s.solid).toEqual({ left: true, right: true, top: true, bottom: true });
  });

  it('leaves empty slots transparent', () => {
    const empty = meta.sprites.findIndex((s) => s === null);
    expect(empty).toBeGreaterThan(0);
    expect(atlasCell(atlas, empty).data.every((v) => v === 0)).toBe(true);
  });

  it('applies the documented elek1 patch', () => {
    const elek1 = convertSpriteSet('elek1', original('elek1.ggs'));
    expect(elek1.meta.sprites[38]!.status).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('levels (.ggc)', () => {
  const level = convertLevel('elek', original('elek.ggc'));

  it('reads set names and the 16x16 screen grid', () => {
    expect(level.sets).toEqual(['elek1', 'elek2']);
    expect(level.screens).toHaveLength(256);
    expect(level.screens.filter(Boolean)).toHaveLength(82);
  });

  it('decodes 13x8 planes', () => {
    const screen0 = level.screens[0]!;
    expect(screen0).toHaveLength(4);
    expect(screen0[0]).toHaveLength(104);
    expect(screen0[2]).toBeNull();
  });
});

describe('sound (.u8 -> .wav)', () => {
  it('writes a 16-bit 8 kHz mono WAV with (u8 ^ 0x80) << 8 samples', () => {
    const wav = u8ToWav(new Uint8Array([0x80, 0xff, 0x00]));
    const view = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF');
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true)]).toEqual([0, 0x7f00, -0x8000]);
  });
});

describe('screens (.bmp)', () => {
  it('decodes the 320x200 title screen', () => {
    const image = parseBmp8(readFileSync(join(ORIGINAL_SCREENS, 'tit1.bmp')));
    expect([image.width, image.height]).toEqual([320, 200]);
    expect(image.data).toHaveLength(320 * 200 * 4);
  });
});
