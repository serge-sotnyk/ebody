// Browser-side loading of converted assets from <base>/data/.

import type { AssetManifest, LevelFile, SpriteSetFile } from './types.ts';

export const DATA_URL = `${import.meta.env.BASE_URL}data/`;

export async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(DATA_URL + path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function loadBitmap(path: string): Promise<ImageBitmap> {
  const response = await fetch(DATA_URL + path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return createImageBitmap(await response.blob());
}

export interface LoadedSpriteSet {
  meta: SpriteSetFile;
  atlas: ImageBitmap;
}

const spriteSetCache = new Map<string, Promise<LoadedSpriteSet>>();

export function loadSpriteSet(name: string): Promise<LoadedSpriteSet> {
  let pending = spriteSetCache.get(name);
  if (!pending) {
    pending = Promise.all([loadJson<SpriteSetFile>(`sprites/${name}.json`), loadBitmap(`sprites/${name}.png`)]).then(
      ([meta, atlas]) => ({ meta, atlas }),
    );
    spriteSetCache.set(name, pending);
  }
  return pending;
}

export const loadManifest = (): Promise<AssetManifest> => loadJson<AssetManifest>('manifest.json');
export const loadLevel = (name: string): Promise<LevelFile> => loadJson<LevelFile>(`levels/${name}.json`);
export const soundUrl = (name: string): string => `${DATA_URL}sound/${name}.wav`;
export const screenUrl = (name: string): string => `${DATA_URL}screens/${name}.png`;
