import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serviceWorker, webManifest } from './plugin.ts';

const template = readFileSync(resolve(import.meta.dirname, 'sw.js'), 'utf8');
const file = (path: string, text: string): { path: string; bytes: Uint8Array } => ({
  path,
  bytes: new TextEncoder().encode(text),
});

/** The FILES list and VERSION from a generated service worker. */
function parse(source: string): { version: string; files: string[] } {
  const version = /const VERSION = "([0-9a-f]+)";/.exec(source)?.[1] ?? '';
  const files = JSON.parse(/const FILES = (\[[\s\S]*?\]);/.exec(source)?.[1] ?? '[]') as string[];
  return { version, files };
}

describe('the service worker', () => {
  it('caches the base URL and every file of the build', () => {
    const sw = parse(serviceWorker(template, [file('index.html', 'a'), file('data/levels/elek.json', 'b')]));
    expect(sw.files).toEqual(['./', 'index.html', 'data/levels/elek.json']);
    expect(sw.version).toMatch(/^[0-9a-f]{12}$/);
  });

  it('gets a new version when any file changes, and the same one otherwise', () => {
    const v = (text: string): string => parse(serviceWorker(template, [file('index.html', 'a'), file('x.json', text)])).version;
    expect(v('b')).toBe(v('b'));
    expect(v('c')).not.toBe(v('b'));
  });
});

describe('the web app manifest', () => {
  it('opens the game page full screen in landscape, with a maskable icon', () => {
    const m = webManifest('/ebody/') as { start_url: string; scope: string; display: string; orientation: string; icons: { purpose?: string }[] };
    expect(m).toMatchObject({ start_url: '/ebody/', scope: '/ebody/', display: 'fullscreen', orientation: 'landscape' });
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });
});
