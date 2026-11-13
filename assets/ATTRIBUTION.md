# Attribution

## The work

**Electro Man** (Polish title *Electro Body*), a DOS game published by
xLand in 1992.

- Design, programming and graphics: **Janusz Pelc** and **Maciej Miąsik**
- Music: **Daniel Kleczyński**

The authors re-released the game as freeware in 2006 under Creative
Commons Attribution-ShareAlike 2.5, with the permission of the copyright
holders.

## Where these files come from

All files in `assets/original/` are copied unchanged from
[PyElectroMan](https://github.com/tosiabunio/pyelectroman) by Maciej Miąsik,
commit `c4031f05b36f01ef0740c92d41616d94e9a4110f` (2026-06-12), which
publishes the game's art assets under CC BY-SA 4.0:

| Here | In PyElectroMan | Contents |
|---|---|---|
| `original/dos/*.ggs` | `conversion/olddata/*.ggs` | sprite sets (original DOS format) |
| `original/dos/*.ggc` | `conversion/olddata/*.ggc` | levels (original DOS format) |
| `original/dos/*.u8`  | `conversion/olddata/*.u8`  | sound effects and music fragments (raw 8-bit PCM) |
| `original/screens/*.bmp` | `data/*.bmp` | title, level-complete and ending screens |

## Changes

`tools/convert/` (run with `npm run assets`) converts these files into
`assets/generated/data/`:

- sprite sets → one PNG atlas (8×8 cells of 24×24 pixels) plus JSON with
  each sprite's decoded status bytes;
- levels → JSON with the decoded tile planes;
- sounds → 16-bit mono WAV at 8000 Hz;
- screens → PNG.

No pixels, tiles or samples are altered. Deliberate corrections to the
original data, if any, are listed with their reasons in
`tools/convert/patches.ts`.

## Note on sound and music

PyElectroMan's README names "art assets" as CC BY-SA 4.0 and does not
mention sound or music separately; the 2006 freeware release covered the
whole game archive, including sound. According to Polish Wikipedia, some
of the game's sound effects were sampled from third-party music
recordings. We have asked the author to clarify the licensing of the
sound files; this note will be updated with the answer.
