// npm run assets
// Converts assets/original/** into assets/generated/data/** (served by Vite as /ebody/data/**),
// and the Android app's launcher icon and TV banner into android/app/src/generated/res/.

import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { AssetManifest } from '../../src/data/types.ts';
import { u8ToWav } from './audio.ts';
import { parseBmp8 } from './bmp.ts';
import { convertLevel, convertSpriteSet } from './convert.ts';
import { heroIcon, ICONS, tvBanner } from './icons.ts';
import { ANDROID_RES, ASSET_LICENSE_FILES, GENERATED_DATA, ORIGINAL_DOS, ORIGINAL_SCREENS } from './paths.ts';
import { encodePng } from './png.ts';
import type { RgbaImage } from './bmp.ts';

function filesWithExt(dir: string, ext: string): string[] {
  return readdirSync(dir)
    .filter((f) => extname(f).toLowerCase() === ext)
    .sort();
}

const stem = (file: string): string => basename(file, extname(file)).toLowerCase();

function main(): void {
  rmSync(GENERATED_DATA, { recursive: true, force: true });
  for (const sub of ['sprites', 'levels', 'sound', 'screens', 'icons']) mkdirSync(join(GENERATED_DATA, sub), { recursive: true });
  rmSync(ANDROID_RES, { recursive: true, force: true });
  for (const sub of ['drawable-xhdpi', 'mipmap-xxxhdpi']) mkdirSync(join(ANDROID_RES, sub), { recursive: true });
  const manifest: AssetManifest = { spriteSets: [], levels: [], sounds: [], screens: [] };
  let heroAtlas: RgbaImage | null = null;

  for (const file of filesWithExt(ORIGINAL_DOS, '.ggs')) {
    const name = stem(file);
    const { meta, atlas } = convertSpriteSet(name, readFileSync(join(ORIGINAL_DOS, file)));
    writeFileSync(join(GENERATED_DATA, 'sprites', `${name}.png`), encodePng(atlas));
    writeFileSync(join(GENERATED_DATA, 'sprites', `${name}.json`), JSON.stringify(meta));
    manifest.spriteSets.push(name);
    if (name === 'hero') heroAtlas = atlas;
  }

  if (!heroAtlas) throw new Error('no hero sprite set for the app icons');
  for (const icon of ICONS) {
    writeFileSync(join(GENERATED_DATA, 'icons', icon.file), encodePng(heroIcon(heroAtlas, icon.size, icon.scale)));
  }
  // 192 px is the launcher icon's xxxhdpi size; Android scales it down for other screens.
  writeFileSync(join(ANDROID_RES, 'mipmap-xxxhdpi', 'ic_launcher.png'), encodePng(heroIcon(heroAtlas, 192, 3)));

  for (const file of filesWithExt(ORIGINAL_DOS, '.ggc')) {
    const name = stem(file);
    const level = convertLevel(name, readFileSync(join(ORIGINAL_DOS, file)));
    writeFileSync(join(GENERATED_DATA, 'levels', `${name}.json`), JSON.stringify(level));
    manifest.levels.push(name);
  }

  for (const file of filesWithExt(ORIGINAL_DOS, '.u8')) {
    const name = stem(file);
    writeFileSync(join(GENERATED_DATA, 'sound', `${name}.wav`), u8ToWav(readFileSync(join(ORIGINAL_DOS, file))));
    manifest.sounds.push(name);
  }

  for (const file of filesWithExt(ORIGINAL_SCREENS, '.bmp')) {
    const name = stem(file);
    const picture = parseBmp8(readFileSync(join(ORIGINAL_SCREENS, file)));
    writeFileSync(join(GENERATED_DATA, 'screens', `${name}.png`), encodePng(picture));
    if (name === 'tit1') writeFileSync(join(ANDROID_RES, 'drawable-xhdpi', 'banner.png'), encodePng(tvBanner(picture)));
    manifest.screens.push(name);
  }

  for (const licenseFile of ASSET_LICENSE_FILES) copyFileSync(licenseFile, join(GENERATED_DATA, basename(licenseFile)));
  writeFileSync(join(GENERATED_DATA, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(
    `assets: ${manifest.spriteSets.length} sprite sets, ${manifest.levels.length} levels, ` +
      `${manifest.sounds.length} sounds, ${manifest.screens.length} screens, ${ICONS.length} icons -> ${GENERATED_DATA}`,
  );
}

main();
