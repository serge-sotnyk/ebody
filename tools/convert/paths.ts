import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../..');
export const ORIGINAL_DOS = resolve(ROOT, 'assets/original/dos');
export const ORIGINAL_SCREENS = resolve(ROOT, 'assets/original/screens');
export const ASSET_LICENSE_FILES = ['LICENSE.md', 'ATTRIBUTION.md'].map((f) => resolve(ROOT, 'assets', f));
/** Everything the browser loads lives under <publicDir>/data. */
export const GENERATED_DATA = resolve(ROOT, 'assets/generated/data');
/** Launcher icon and TV banner for the Android app (android/), outside the site. */
export const ANDROID_RES = resolve(ROOT, 'android/app/src/generated/res');

/** PyElectroMan checkout used only for verification (not needed to build). */
export const PYELECTROMAN = resolve(ROOT, process.env.PYELECTROMAN_DIR ?? '../pyelectroman');
