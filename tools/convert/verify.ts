// npm run verify-assets
// Checks our conversion of assets/original/** against PyElectroMan's own
// converted data (data/*.ebs, *.png, *.ebl, *.wav) and level renders (maps/*.png).
// Needs a PyElectroMan checkout: ../pyelectroman or $PYELECTROMAN_DIR.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { MAP_COLS, SCREEN_COUNT, SET_SIZE, type LevelFile, type SpriteSetFile } from '../../src/data/types.ts';
import { composeScreen } from '../../src/render/compose.ts';
import { LevelSprites } from '../../src/sim/tiles.ts';
import type { RgbaImage } from './bmp.ts';
import { atlasCell } from './convert.ts';
import { GENERATED_DATA, PYELECTROMAN } from './paths.ts';
import { decodePng } from './png.ts';
import { crop, diffPixels, PLAYFIELD_H, PLAYFIELD_W, rasterize } from './raster.ts';

let failures = 0;
const notes: string[] = [];
const fail = (msg: string): void => {
  failures++;
  console.error(`FAIL ${msg}`);
};
const ok = (msg: string): void => console.log(`ok   ${msg}`);

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const ours = (...p: string[]): string => join(GENERATED_DATA, ...p);
const theirs = (...p: string[]): string => join(PYELECTROMAN, ...p);

interface EbsFile {
  'status table': number[];
  'size table': number[];
  'used table': boolean[];
}
interface EblFile {
  names: string[];
  params: number[];
  screens: unknown[];
}

function checkSprites(name: string): void {
  const meta = readJson<SpriteSetFile>(ours('sprites', `${name}.json`));
  const atlas = decodePng(readFileSync(ours('sprites', `${name}.png`)));
  const ebsPath = theirs('data', name, `${name}.ebs`);
  if (!existsSync(ebsPath)) {
    notes.push(`sprite set ${name}: no PyElectroMan counterpart`);
    return;
  }
  const ebs = readJson<EbsFile>(ebsPath);
  const used = meta.sprites.map((s) => s !== null);
  if (!isDeepStrictEqual(used, ebs['used table'])) fail(`${name}: used table differs`);

  let pixelMismatch = 0;
  for (let i = 0; i < SET_SIZE; i++) {
    const sprite = meta.sprites[i];
    if (!sprite) continue;
    const theirStatus = ebs['status table'].slice(i * 8, i * 8 + 8);
    if (!isDeepStrictEqual(sprite.status, theirStatus)) {
      fail(`${name}#${i}: status ours ${JSON.stringify(sprite.status)} theirs ${JSON.stringify(theirStatus)}`);
    }
    if (!isDeepStrictEqual(sprite.size, ebs['size table'].slice(i * 4, i * 4 + 4))) fail(`${name}#${i}: size differs`);
    const png = decodePng(readFileSync(theirs('data', name, `${name}_${String(i).padStart(2, '0')}.png`)));
    if (diffRgba(atlasCell(atlas, i), png) > 0) pixelMismatch++;
  }
  if (pixelMismatch) fail(`${name}: ${pixelMismatch} sprites differ in pixels`);
  else ok(`sprites ${name}: ${used.filter(Boolean).length} sprites, metadata and pixels match`);
}

/** Like diffPixels, but transparent pixels only need to agree on being transparent. */
function diffRgba(a: RgbaImage, b: RgbaImage): number {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const aa = a.data[i + 3]!;
    const ba = b.data[i + 3]!;
    if (aa !== ba) n++;
    else if (aa !== 0 && (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2])) n++;
  }
  return n;
}

function checkLevel(name: string, setCache: Map<string, { meta: SpriteSetFile; atlas: RgbaImage }>): void {
  const level = readJson<LevelFile>(ours('levels', `${name}.json`));
  const eblPath = theirs('data', `${name}.ebl`);
  if (!existsSync(eblPath)) {
    notes.push(`level ${name}: no PyElectroMan counterpart`);
  } else {
    const ebl = readJson<EblFile>(eblPath);
    if (!isDeepStrictEqual(level.sets, ebl.names)) fail(`${name}: set names ${level.sets} vs ${ebl.names}`);
    else if (!isDeepStrictEqual(level.params, ebl.params)) fail(`${name}: params differ`);
    else if (!isDeepStrictEqual(level.screens, ebl.screens)) fail(`${name}: screens differ`);
    else ok(`level ${name}: identical to ${name}.ebl (${level.screens.filter(Boolean).length} screens)`);
  }

  const load = (set: string): { meta: SpriteSetFile; atlas: RgbaImage } => {
    let entry = setCache.get(set);
    if (!entry) {
      entry = {
        meta: readJson<SpriteSetFile>(ours('sprites', `${set}.json`)),
        atlas: decodePng(readFileSync(ours('sprites', `${set}.png`))),
      };
      setCache.set(set, entry);
    }
    return entry;
  };
  const [a, b] = [load(level.sets[0]), load(level.sets[1])];
  const sprites = new LevelSprites([a.meta, b.meta]);
  const atlases: [RgbaImage, RgbaImage] = [a.atlas, b.atlas];

  const missing = new Set<number>();
  let orderDiffers = 0;
  let mapMismatch = 0;
  const mapPath = theirs('maps', `${name}.png`);
  const map = existsSync(mapPath) ? decodeRgb(readFileSync(mapPath)) : null;
  for (let s = 0; s < SCREEN_COUNT; s++) {
    const planes = composeScreen(level, sprites, s, 'planes');
    const game = composeScreen(level, sprites, s, 'game');
    planes.missing.forEach((m) => missing.add(m));
    game.missing.forEach((m) => missing.add(m));
    const planeImage = rasterize(planes.ops, atlases);
    if (diffPixels(planeImage, rasterize(game.ops, atlases)) > 0) orderDiffers++;
    if (map) {
      const x = (s % MAP_COLS) * PLAYFIELD_W;
      const y = Math.floor(s / MAP_COLS) * PLAYFIELD_H;
      if (diffPixels(planeImage, crop(map, x, y, PLAYFIELD_W, PLAYFIELD_H)) > 0) mapMismatch++;
    }
  }
  if (!map) notes.push(`level ${name}: no map render to compare`);
  else if (mapMismatch) fail(`${name}: ${mapMismatch} screens differ from maps/${name}.png`);
  else ok(`level ${name}: all 256 screens match maps/${name}.png pixel for pixel`);
  if (missing.size) notes.push(`level ${name}: references empty sprite slots ${[...missing].sort((x, y) => x - y).join(', ')}`);
  notes.push(`level ${name}: ${orderDiffers} screens look different in game draw order than in plane order`);
}

function decodeRgb(bytes: Uint8Array): RgbaImage {
  return decodePng(bytes); // pngjs always returns RGBA
}

function checkSound(name: string): void {
  const path = theirs('data', `${name}.wav`);
  if (!existsSync(path)) {
    notes.push(`sound ${name}: no PyElectroMan counterpart`);
    return;
  }
  const a = readFileSync(ours('sound', `${name}.wav`));
  const b = readFileSync(path);
  if (Buffer.compare(a, b) !== 0) fail(`sound ${name}: WAV bytes differ (${a.length} vs ${b.length})`);
  else ok(`sound ${name}: byte-identical`);
}

function main(): void {
  if (!existsSync(join(PYELECTROMAN, 'data'))) {
    console.error(`PyElectroMan checkout not found at ${PYELECTROMAN}; set PYELECTROMAN_DIR.`);
    process.exit(2);
  }
  const manifest = readJson<{ spriteSets: string[]; levels: string[]; sounds: string[] }>(ours('manifest.json'));
  manifest.spriteSets.forEach(checkSprites);
  const cache = new Map<string, { meta: SpriteSetFile; atlas: RgbaImage }>();
  manifest.levels.forEach((l) => checkLevel(l, cache));
  manifest.sounds.forEach(checkSound);
  console.log('\nnotes:');
  notes.forEach((n) => console.log(`  ${n}`));
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}

main();
