// Vite plugin that makes the game page an installable app (PWA): the web app
// manifest, the icon links, and a service worker that caches the whole built
// site for offline play (tools/pwa/sw.js).

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { HtmlTagDescriptor, Plugin } from 'vite';

const MANIFEST_FILE = 'manifest.webmanifest';
const SW_FILE = 'sw.js';
/** Icons written by the asset converter (tools/convert/icons.ts). */
const ICON_DIR = 'data/icons';

/** The web app manifest; URLs in it are relative to the manifest, at the site's base. */
export function webManifest(base: string): object {
  return {
    id: base,
    name: 'Electro Man',
    short_name: 'Electro Man',
    description: 'A browser port of Electro Man (Electro Body), the 1992 DOS platformer by xLand.',
    start_url: base,
    scope: base,
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
    orientation: 'landscape',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: `${ICON_DIR}/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${ICON_DIR}/icon-512.png`, sizes: '512x512', type: 'image/png' },
      { src: `${ICON_DIR}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

/** Every file under `dir` (relative, with forward slashes, sorted). */
export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.push(relative(dir, path).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/** The service worker for a build: its files (plus the base URL itself) and a version from their contents. */
export function serviceWorker(template: string, files: readonly { path: string; bytes: Uint8Array }[]): string {
  const hash = createHash('sha256');
  for (const f of files) hash.update(f.path).update('\0').update(f.bytes);
  const version = hash.digest('hex').slice(0, 12);
  const urls = ['./', ...files.map((f) => f.path)];
  return template.replace("'__VERSION__'", JSON.stringify(version)).replace('__FILES__', JSON.stringify(urls, null, 2));
}

export function pwa(): Plugin {
  let base = '/';
  let outDir = 'dist';
  return {
    name: 'ebody-pwa',
    configResolved(config) {
      base = config.base;
      outDir = resolve(config.root, config.build.outDir);
    },
    // The dev server has no service worker, but the manifest is served so the page loads without errors.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path !== `${base}${MANIFEST_FILE}` && path !== `/${MANIFEST_FILE}`) return next();
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(JSON.stringify(webManifest(base)));
      });
    },
    transformIndexHtml(_html, ctx) {
      const tags: HtmlTagDescriptor[] = [
        { tag: 'link', attrs: { rel: 'icon', type: 'image/png', href: `${base}${ICON_DIR}/icon-64.png` }, injectTo: 'head' },
      ];
      if (ctx.filename.endsWith(`${sep}index.html`)) {
        tags.push(
          { tag: 'link', attrs: { rel: 'manifest', href: `${base}${MANIFEST_FILE}` }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'apple-touch-icon', href: `${base}${ICON_DIR}/icon-180.png` }, injectTo: 'head' },
          // iPhone home-screen apps: no browser bars, the picture under the status bar (safe areas keep it clear).
          { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }, injectTo: 'head' },
        );
      }
      return tags;
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: MANIFEST_FILE, source: JSON.stringify(webManifest(base), null, 2) });
    },
    // Last: the public files (game data) are in the output by now, so the list is complete.
    closeBundle() {
      const files = listFiles(outDir)
        .filter((path) => path !== SW_FILE)
        .map((path) => ({ path, bytes: readFileSync(join(outDir, path)) }));
      const template = readFileSync(resolve(import.meta.dirname, 'sw.js'), 'utf8');
      writeFileSync(join(outDir, SW_FILE), serviceWorker(template, files));
    },
  };
}
