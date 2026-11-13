# ebody

**Play:** https://serge-sotnyk.github.io/ebody/ (published from `main`)

A browser port of **Electro Man** (Polish title *Electro Body*), the 1992 DOS
platformer by xLand. The goal of the first stage is a faithful recreation of
the original game that runs in any modern browser, on desktop and on phones,
without installation. Extending the game comes later.

**Status:** work in progress. The game can be played from start to end;
checking it against the DOS original is ongoing (`docs/fidelity.md`). What
exists today:

- the game page: the title screen with its music, a menu, the eight levels
  in order with a "level completed" screen between them and the final
  screen after the last; sound effects and a volume control; the game saved
  in the browser at every checkpoint (Continue); installable as an app (PWA)
  that starts full screen and plays offline, and as an Android app for TVs,
  phones and tablets; every level running at 20 ticks a second with
  its animated objects, scaled to the whole window, with fullscreen; the hero walks,
  jumps, shoots, uses teleports, collects batteries and disks, reaches
  checkpoints, dies and comes back, and leaves through the exit; creatures
  patrol and shoot, cannons fire, rockets launch; the status bars show
  weapon heat, weapon level and disks; on touch screens, on-screen buttons
  (multi-touch, a finger can slide between them, fire on both sides) beside
  or below the picture, and a prompt to turn the device sideways;
- a reproducible converter from the original DOS data files to web formats,
  checked against PyElectroMan's own converted data;
- objects, enemies and the hero checked tick by tick against PyElectroMan
  run headless;
- a level viewer (every screen of every level, with collision boxes);
- a sprite viewer (decoded sprite metadata, sounds, title screens).

## Running locally

Requires Node.js 22 or newer.

```bash
npm install         # once, and again when package.json changes
npm run dev         # http://localhost:5173/ebody/
```

`npm run dev`, `npm run dev:lan` and `npm run build` first convert the original
data in `assets/original` into `assets/generated` (`npm run assets`, under a
second).

The game page is `/ebody/`; press H there for the keys. The viewers are at
`/ebody/levels.html` and `/ebody/sprites.html`.

To try it on a phone or tablet in the same network, run `npm run dev:lan`
and open the "Network" address it prints (`http://<computer's IP>:5173/ebody/`).

The app part (web app manifest, icons, the service worker that caches the
whole site for offline play; `tools/pwa/`) exists only in the built site:
try it with `npm run build && npm run preview`. Installing needs HTTPS or
`localhost`, so on a phone use the published site. A new version downloads
in the background and is switched to at the next start, or from "Update" in
the menu.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | unit tests (Vitest) |
| `npm run build` | type-check and build the static site into `dist/` |
| `npm run preview` | serve `dist/` at http://localhost:4173/ebody/ |
| `npm run verify-assets` | compare our conversion with PyElectroMan's data; needs a PyElectroMan checkout in `../pyelectroman` or `$PYELECTROMAN_DIR` |
| `npm run verify-objects` | run PyElectroMan's objects and enemies headless on every screen and compare them with ours, tick by tick; also needs Python with pygame (below) |
| `npm run verify-hero` | play random key sequences from every checkpoint, teleport and exit in PyElectroMan and in our code, and compare the hero (position, state, animation, weapon), the disks, the checkpoint and every object on the screen tick by tick, through shooting, deaths and level exits; same needs |

`verify-objects` and `verify-hero` look for Python in `../pyelectroman-venv` unless
`$PYELECTROMAN_PYTHON` names another one. To create that environment:

```bash
python3 -m venv ../pyelectroman-venv
../pyelectroman-venv/bin/pip install -r tools/reference/requirements.txt
```

The site is built for the base path `/ebody/`. Every push to `main` publishes it to GitHub Pages (`.github/workflows/pages.yml`).

## Android app (TV, phone, tablet)

`android/` wraps the built site in a full-screen WebView, for Android TV
(it shows on the TV home screen with the title picture as its banner),
phones and tablets. The game's files are inside the APK, so it needs no
network. GitHub Actions builds it (`.github/workflows/android.yml`) for every
pull request and every push to `main`; the run's page has `electro-man.apk`
to download. To install it, either copy it to a USB stick and open it with
the TV's file manager (allowing installs from unknown sources), or with
[adb](https://developer.android.com/tools/adb):

```bash
adb connect <TV's IP address>   # once "USB debugging" or "network debugging" is on in the TV's developer options
adb install -r electro-man.apk  # -r keeps the saved game when updating
```

Keys: a keyboard works as on a computer; on a TV remote, the arrows walk
and jump, OK fires (and picks in the menu), Back opens or closes the menu
and leaves the game from the title screen.

The APK is signed with a key committed in `android/app/sideload.p12`
(password `android`). It is public on purpose: it only makes a newer APK
install over an older one and keep the saved game. Anyone can sign an APK
with it, so it is not for a store. A store, or a private key kept in the
repository's secrets, would need a new key: Android 9 and later can move
an installed app to it (APK signature scheme v3 key rotation), otherwise the
app is installed afresh once and the saved game is lost.

Building locally needs JDK 17, Gradle 8.14 and the Android SDK:
`npm run build && gradle --project-dir android assembleRelease`.

## Project layout

| Path | Contents |
|---|---|
| `src/data/` | asset formats and loading |
| `src/sim/` | game logic at a fixed 20 ticks a second, independent of the browser |
| `src/render/` | drawing into the 320×200 frame and scaling it to the window |
| `src/platform/` | browser services: game loop, keyboard, touch buttons, fullscreen, sound, saved game, installed app |
| `src/shell/` | the game page |
| `src/viewer/` | level and sprite viewer pages |
| `tools/convert/` | asset converter and its verification |
| `tools/reference/` | PyElectroMan run headless as a reference for game logic |
| `tools/pwa/` | Vite plugin for the installable app: manifest, icon links, service worker |
| `android/` | the Android app: a WebView with the built site inside |
| `assets/original/` | original game data (CC BY-SA) |
| `assets/generated/` | converter output, not committed |
| `docs/fidelity.md` | known and suspected differences from the original game |

## Provenance and licences

This port builds on **[PyElectroMan](https://github.com/tosiabunio/pyelectroman)**,
an unfinished Python port by Maciej Miąsik, one of the original game's
authors. PyElectroMan publishes its code under the MIT licence and the
original game's art assets under CC BY-SA 4.0.

**Code** in this repository is licensed under the [MIT licence](LICENSE).
Parts of it are ported from PyElectroMan (currently the data converters, the
sprite metadata decoding, the tile classification, the random number
generator, the objects, collisions, the hero, the weapons and the enemies), so the licence carries both copyright
lines.

**Game assets** — everything in `assets/`, and everything the converter
produces from it — are licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). See
[assets/LICENSE.md](assets/LICENSE.md) and
[assets/ATTRIBUTION.md](assets/ATTRIBUTION.md) for credits, sources and
changes. The built site ships both files next to the data.

Electro Man was created by Janusz Pelc and Maciej Miąsik (design,
programming, graphics) with music by Daniel Kleczyński, and published by
xLand in 1992. The authors re-released it as freeware under CC BY-SA 2.5
in 2006.

The licence status of the sound effects and music is being clarified with
the author; see the note in [assets/ATTRIBUTION.md](assets/ATTRIBUTION.md).
