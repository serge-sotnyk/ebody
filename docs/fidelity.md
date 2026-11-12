# Fidelity notes

Places where this port may differ from the original DOS game, and how each
one is (or will be) settled. "DOS check" means it needs someone to look at
the original game (GOG or `em.zip` in DOSBox); PyElectroMan's author has the
original C source and can also answer.

Status: **open** (unknown), **chosen** (we picked something, to be checked),
**settled**.

## Data

| # | Topic | Status | Notes |
|---|---|---|---|
| D1 | `elek1` sprite 38 status bytes | chosen | Original: `[224,1,0,4,0,0,0,0]` (animated object that kills on touch, empty box). PyElectroMan zeroed it as "random data" (commit c37dfe5); we do the same via `tools/convert/patches.ts`. Used twice on level `elek`, screen 44. DOS check: does anything animate or kill there? |
| D2 | Sound sample rate | chosen | Raw `.u8` files have no header; 8000 Hz as in PyElectroMan. DOS check: pitch and length by ear. |
| D3 | Unused level files | open | `level`, `magaz_s`, `hero` exist but are not in the level list. Are any reachable (e.g. `magaz_s` via a secret exit)? |
| D4 | Object types the levels never use | settled | No object in the eight game levels is a monitor (action 3) or a "flash special" (action 21). Both are ported from PyElectroMan but only covered by unit tests, not by the comparison with PyElectroMan's run. |

## Rendering

| # | Topic | Status | Notes |
|---|---|---|---|
| R1 | Playfield position and status panel | settled | Playfield (312×192) at (0, 0) in the 320×200 frame, black strips of 8 px on the right and at the bottom. No panel: the two status bars are drawn over the playfield at (8, 176) and (256, 176), as in PyElectroMan's `Indicators`. Evidence: DOS 1, DOS 2. |
| R2 | Draw order | chosen | Like the running PyElectroMan game: scenery, then solid tiles, then objects, then "in front" sprites. PyElectroMan's level maps draw planes 0–3 in order instead. Apart from teleport tops (R4), the two orders give different pictures on only 50 screens: `elek` 55, 85–88, 143, 163, 182, 211, 212; `magaz` 180; `10x10` 101, 161; `widok` 0–31, 115–119. On those, a scenery tile in a higher plane and a solid tile or object in a lower plane share a cell (e.g. `elek` 55, rows 0 and 3). DOS check on one of them (the level viewer switches orders with G). |
| R3 | "In front" sprites in scenery/solid layers | chosen | PyElectroMan never draws them (its issue #1); we draw them last. |
| R4 | Upper half of two-tile teleports | settled | Drawn one tile above, from the sprite after the teleport's animation (PyElectroMan `Level.__init_teleport`). Not on PyElectroMan's maps, but present in DOS. Evidence: DOS 1, DOS 2. |
| R5 | Frame rate | settled | 20 ticks per second, as in PyElectroMan. Checked by eye against DOS: object animations on the game page (where − and = change the rate) match the original best at 20; 18 was the nearest alternative and looked slower. |
| R6 | Pixel shape | chosen | Square pixels by default. On a 4:3 monitor the 320×200 mode had pixels 1.2 times taller than wide; the game page's A key switches to that shape and remembers the choice. |

## DOS evidence

Screenshots of the DOS game running in js-dos (classicdosgames.com), scaled
back to 320×200 and compared pixel by pixel with our render. The screenshots
carry a display colour profile, so colours were matched through a learned
mapping rather than exactly.

| # | Screen | What matched | What differed, and why |
|---|---|---|---|
| DOS 1 | `elek` 0 | every tile at playfield offset (0, 0); teleport tops (only in our game order) | hero and status bars (not in a level render); teleport colours (animation frame); the start checkpoint is drawn behind the hero |
| DOS 2 | `elek` 1 | every tile at (0, 0); teleport top | hero and status bars; the battery at row 5, column 2 is missing: it is a blinking object (action 14, visible for `param` ticks, then hidden as long), as in PyElectroMan's `Flash` |

## Gameplay (from the PyElectroMan audit, to be checked as the steps reach them)

| # | Topic | Status | Notes |
|---|---|---|---|
| G1 | Leaving a screen upwards | open | PyElectroMan only exits left, right and down. |
| G2 | Ducking | open | Listed in PyElectroMan's debug notes but not implemented. |
| G3 | Objects on re-entering a screen | open | PyElectroMan keeps their state; does the original reset them? Our game page restarts them on every visit for now. |
| G4 | Checkpoint and respawn rules | open | PyElectroMan sends you back to the level start (a bug; fixed in the `kuznetz` fork). |
| G5 | What "Continue" restores | open | |
| G6 | Secret exits (`special` with param ≥ 128) | open | PyElectroMan treats them as "game completed", which looks wrong. |
| G7 | Weapon overheating penalty | open | PyElectroMan only blocks firing. |
| G8 | Enemy types 0, 1, 3 vs 2; behaviour after shooting | open | |
| G9 | In-game music | open | PyElectroMan only plays music on title, level-complete and ending screens. |
| G10 | Pause, joystick, alternative keys | open | |
