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
| R1 | Playfield position and status panel | settled | Playfield (312×192) at (0, 0) in the 320×200 frame, black strips of 8 px on the right and at the bottom. No panel: the two status bars are drawn over the playfield at (8, 176) and (256, 176), as in PyElectroMan's `Indicators`. Evidence: DOS 1, DOS 2. On the page the frame is shifted right by 4 pixels during play, so the playfield, not the frame, is centred between the black bands. |
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
| G1 | Leaving a screen upwards | settled | No exit upwards: the way up is a teleport (Down on it), as in DOS. A jump past the top edge goes out of sight and falls back. |
| G2 | Down key | settled | No ducking. In DOS, Down while standing or walking on a teleport (or an exit) uses it; nothing else (checked in DOS). We do the same, as PyElectroMan does. |
| G3 | Objects on re-entering a screen | open | PyElectroMan keeps their state; we start them afresh on every visit. The original reseeds its random numbers from the screen number on every entry, which suggests it re-creates them too. `World` has a `keepObjects` switch for PyElectroMan's way (the reference comparison uses it). Objects removed from the level map (collected, exploded) stay removed either way until the hero dies (G11). DOS check: leave a screen with a blinking object and come back. |
| G4 | Checkpoint and respawn rules | chosen | The hero comes back at the last checkpoint touched (the level start before that), with the weapon gone; the level map is restored except for the disks collected. PyElectroMan sends the hero to the level start instead, because rebuilding the level resets its checkpoint (a bug, fixed in the `kuznetz` fork); not ported. Touching a new checkpoint also takes the weapon away (EB_HERO.C:519). DOS check. |
| G5 | What "Continue" restores | chosen | As PyElectroMan (after EB.C:920-948): the game is saved on touching a new checkpoint, with the level, the checkpoint, the disks collected and where they were (the weapon is always gone at a checkpoint). Continue starts that level at that checkpoint; everything else in the level is as at its start (batteries are back). We also save when a level starts, so Continue after a "level completed" screen starts the next level, and we clear the save after the final screen. Saved in the browser's local storage, one slot. DOS check: what Continue does there. |
| G6 | Secret exits (`special` with param ≥ 128) | settled | No object in the eight levels has the "special" touch type, so there is nothing to port. |
| G7 | Weapon heat | chosen | As PyElectroMan: a shot adds heat by weapon level (1, 2, 1, 4, 3 for levels 1-5) and is refused when heat would pass 5; heat falls by one every five ticks; there is no other penalty. DOS check: does overheating do anything else? |
| G8 | Creatures, cannons, rockets | chosen | As PyElectroMan: a creature's spawner tile gives its type ((param & 0x7f) / 3; type 2 flies), whether it shoots (param bit 7) and its speed (touch byte). On its first update it finds its patrol range (walkers: along their floor up to a wall or an edge; flyers: up to a wall or the screen edge), is removed if that is under one tile, and faces the hero; shooters fire every 32-96 ticks, walkers sideways, flyers down. Cannons fire every param..2·param ticks; rockets launch with one chance in eight per tick while the hero is in line. Creatures and their shots kill on contact; shots kill creatures (level 4 flies on). DOS check: patrol ranges, firing rates, what kills. |
| G9 | Music and screens | chosen | As PyElectroMan: music on the title (`tit1`/`tit2` alternating every four patterns of the title song), "level completed" (`back` with the text in the original's letters, MESSAGES.H MELEVCMP) and the final screen (`over`); none during play. A song is a string of short sound patterns chained without gaps (`src/data/songs.ts`). Browsers start sound only after a key press or a tap, so the first fire on the title only starts the music, from its beginning. Our menu (Continue, New game, Sound, Keys; Resume, Restart level, Quit to title while playing) is not the original's. DOS check: music during play, and the title's timing. |
| G10 | Pause, joystick, alternative keys | open | Keys so far: arrows, Up to jump, Down for teleports and the exit, Space to fire. The controller is read once per tick; a key or touch button tapped and released between two ticks still counts for the next one (so short taps are not lost in the browser). Touch screens get on-screen buttons (not in the original): a wide left/right rocker with fire above it for the left thumb; jump, fire and Down spread down the right side, so either thumb can shoot. On phones they sit in the room kept beside the picture (the see-through rocker reaches a little over its edge); on tablets, in a row below it. |
| G11 | Killing floor | chosen | As in PyElectroMan: it opens the bottom row of its screen once, removes itself from the level map (the row is solid again on later visits) and sets a flag that makes falling below the last row deadly on every screen until the hero dies. DOS check on `widok` 0. |
| G12 | Hero movement details | chosen | Ported literally from PyElectroMan, quirks included, and compared tick by tick (`npm run verify-hero`): the hero starts facing right; a jump keeps the walking direction unless another one is held; entering "stand" in mid-air runs the first fall step twice. DOS check: how jumps and falls feel. |
| G13 | Leaving through the exit | chosen | With three disks, a blinking marker appears above each exit tile; Down on it plays the teleport fade-out, then the "level completed" screen (G9) leads to the next level. PyElectroMan switches levels at once, before the fade-out. DOS check: does the hero fade out at the exit? |
| G14 | Checkpoint look | chosen | Checkpoints have two frames, with a neat cross on top and without. The level places the start checkpoint with the cross and all others without, and in DOS a reached checkpoint shows the cross; so the active checkpoint shows the cross frame and the others the plain one. PyElectroMan instead switches to the plain frame and lays a grey diagonal X (info sprite 5) over it; not ported. DOS check: does the previous checkpoint lose its cross? |
| G15 | Death explosions | chosen | Two explosions, then one more each tick for nine ticks, at random spots over the hero, at the original's offsets in original pixels (PyElectroMan applies them to doubled pixels, which bunches them up); the hero is gone for 70 ticks in all. DOS check by eye. |
| G16 | Teleport timing | chosen | Fade out (6 ticks), out of sight for 12 ticks, move to the target, fade in (6 ticks), walk on. PyElectroMan fades in at once and then holds the hero frozen for the 12 ticks; in DOS the hero is gone for a while in between and can move soon after appearing, which also fits the original's names (teleport "in", hero_teleport_wait_proc, teleport "out"). The screen changes at the end of the wait. DOS check: on a teleport to another screen, does the new screen show before the hero appears? |
| G17 | Shots | chosen | As PyElectroMan: one shot per press; level 1 flies one run of its animation (7 ticks), levels 2-5 to the screen edge; a shot stops at a wall (one explosion, three for the level 5 bow) or at the first shootable object, which explodes, and if breakable leaves the sprite after its animation in the level map until the hero dies. Shots do not hit enemies yet (step 8). DOS check: ranges and speeds by eye. |
| G18 | Offsets PyElectroMan does not double | chosen | PyElectroMan works in doubled pixels but uses some of the original's offsets as they are: the explosion over a dying creature (centre − 12), the gap between a cannon and its shot (1 pixel) and the death explosions (G15). We use the original's values in original pixels. |
| G19 | The level 5 "bow" | settled | Reported in play: the bow stopped short, as if on the floor. Its collision box covers both of its tiles; the original sets the box's top at 6 and moves its bottom from 24 to 24 + 18 = 42, so it is 36 pixels tall (EB_HERO.C:285-286). PyElectroMan takes 42 as the height, which reaches 4 pixels into the floor under the hero, so any floor tile with a solid side in its way stopped the shot. We use 36; the reference run patches PyElectroMan the same way. Like levels 1-3 it still stops at the first creature or shootable object, now on either of its two tile rows. DOS check: does the bow pass through creatures? |

## PyElectroMan bugs not ported

Found while comparing tick by tick (`npm run verify-hero`); the reference
run patches each of them out, so the comparison stays exact.

- Removing an object while the objects are being updated skips the next
  object's update for that tick.
- The level 5 bow's collision box is 6 pixels too tall, down into the
  floor (G19).
- Removing an object from the level map deletes the first object at its
  position, which can be a different object (two stacked in one cell), and
  a disappearing shot deletes whatever level object sits at its position.
- Touched objects are de-duplicated with a set, so their effects run in an
  order that depends on memory addresses.
- On a tick when the hero changes screens, touch effects (checkpoints, disks,
  removals, the teleport search) use the new screen's number for an object
  of the old screen.
- After a death the level start becomes the checkpoint again (G4).
- A teleport with no partner in its column of the map loops forever.
- Firing just before falling into an empty screen crashes; here the shot is
  lost.
- Enemy shots, like the hero's, delete a level object at their position
  when they disappear.
