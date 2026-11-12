# ebody

A browser port of **Electro Man** (Polish title *Electro Body*), the 1992 DOS
platformer by xLand. The goal of the first stage is a faithful recreation of
the original game that runs in any modern browser, on desktop and on phones,
without installation. Extending the game comes later.

**Status:** early work in progress. The game is not playable yet. What exists
today:

- the game page: every level running at 20 ticks a second with its animated
  objects, scaled to the whole window, with fullscreen; the hero walks,
  jumps, shoots, uses teleports, collects batteries and disks, reaches
  checkpoints, dies and comes back, and leaves through the exit; the status
  bars show weapon heat, weapon level and disks (enemies come next);
- a reproducible converter from the original DOS data files to web formats,
  checked against PyElectroMan's own converted data;
- object animation and hero movement checked tick by tick against
  PyElectroMan run headless;
- a level viewer (every screen of every level, with collision boxes);
- a sprite viewer (decoded sprite metadata, sounds, title screens).

## Running locally

Requires Node.js 22 or newer.

```bash
npm install
npm run assets      # convert assets/original -> assets/generated
npm run dev         # http://localhost:5173/ebody/
```

The game page is `/ebody/`; press H there for the keys. The viewers are at
`/ebody/levels.html` and `/ebody/sprites.html`.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | unit tests (Vitest) |
| `npm run build` | type-check and build the static site into `dist/` |
| `npm run preview` | serve `dist/` at http://localhost:4173/ebody/ |
| `npm run verify-assets` | compare our conversion with PyElectroMan's data; needs a PyElectroMan checkout in `../pyelectroman` or `$PYELECTROMAN_DIR` |
| `npm run verify-objects` | run PyElectroMan's object code headless and compare every object's animation with ours, tick by tick; also needs Python with pygame (below) |
| `npm run verify-hero` | play random key sequences from every checkpoint, teleport and exit in PyElectroMan and in our code, and compare the hero (position, state, animation, weapon), the disks, the checkpoint and every object on the screen tick by tick, through shooting, deaths and level exits; same needs |

`verify-objects` and `verify-hero` look for Python in `../pyelectroman-venv` unless
`$PYELECTROMAN_PYTHON` names another one. To create that environment:

```bash
python3 -m venv ../pyelectroman-venv
../pyelectroman-venv/bin/pip install -r tools/reference/requirements.txt
```

The site is built for the base path `/ebody/` (GitHub Pages project site).

## Project layout

| Path | Contents |
|---|---|
| `src/data/` | asset formats and loading |
| `src/sim/` | game logic at a fixed 20 ticks a second, independent of the browser |
| `src/render/` | drawing into the 320×200 frame and scaling it to the window |
| `src/platform/` | browser services: game loop, keyboard, fullscreen |
| `src/shell/` | the game page |
| `src/viewer/` | level and sprite viewer pages |
| `tools/convert/` | asset converter and its verification |
| `tools/reference/` | PyElectroMan run headless as a reference for game logic |
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
generator, the object animations, collisions, the hero and the weapons), so the licence carries both copyright
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
