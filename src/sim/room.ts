// One level screen in play: its tiles and its live objects.
// Ported from PyElectroMan emdata.py (Level.load, Level.process) and
// emgame.py (ScreenManager.change_screen, KillingFloor).

import { SCREEN_COLS, SCREEN_ROWS, TILE, type LevelFile, type SpriteSetFile } from '../data/types.ts';
import { solidBoxes, type SolidBox } from './collision.ts';
import { createObject, updateObject, type ObjectContext, type SimObject } from './objects.ts';
import { updateShot } from './weapons.ts';
import { initScreenRandoms, type BorlandRandom } from './random.ts';
import { ACTION_TELEPORT, classifyTile, type LevelSprites } from './tiles.ts';

export interface PlacedTile {
  /** Level sprite index 1..127. */
  sprite: number;
  /** Top-left corner in the playfield, original pixels. */
  x: number;
  y: number;
}

export interface ScreenLayout {
  background: PlacedTile[];
  solid: PlacedTile[];
  /** Active tiles in creation order, each two-tile teleport followed by its upper half. */
  objects: PlacedTile[];
  /** Tile indices that point at empty sprite slots (skipped). */
  missing: number[];
}

/** Sort a screen's tiles the way the game does: planes 0..3, rows, columns. */
export function screenLayout(level: LevelFile, sprites: LevelSprites, screen: number): ScreenLayout {
  const layout: ScreenLayout = { background: [], solid: [], objects: [], missing: [] };
  for (const plane of level.screens[screen] ?? []) {
    if (!plane) continue;
    for (let row = 0; row < SCREEN_ROWS; row++) {
      for (let col = 0; col < SCREEN_COLS; col++) {
        const index = plane[row * SCREEN_COLS + col] ?? 0;
        if (index === 0) continue;
        const info = sprites.get(index);
        if (!info) {
          layout.missing.push(index);
          continue;
        }
        const tile = { sprite: index, x: col * TILE, y: row * TILE };
        const kind = classifyTile(info);
        if (kind === 'background') layout.background.push(tile);
        else if (kind === 'collision') layout.solid.push(tile);
        else {
          layout.objects.push(tile);
          // A two-tile teleport adds its upper half: the sprite after its animation, one tile up.
          if (info.action === ACTION_TELEPORT && info.param === 1) {
            const top = sprites.animEnds(index)[1] + 1;
            if (sprites.get(top)) layout.objects.push({ sprite: top, x: tile.x, y: tile.y - TILE });
            else layout.missing.push(top);
          }
        }
      }
    }
  }
  return layout;
}

export interface Room {
  screen: number;
  background: PlacedTile[];
  solid: PlacedTile[];
  objects: SimObject[];
  /** Per-screen random bytes, one per tile column. */
  randoms: number[];
  /** Set once a killing floor has removed the bottom row of solid tiles. */
  killingFloor: boolean;
}

/** An object removed from the level map, by its place in the screen's creation order. */
export type MapRemoval = number;

/**
 * Build a screen's room in its starting state. The generator is seeded from
 * the screen number before the objects are created and again afterwards, as
 * PyElectroMan does when it loads a level and when it enters a screen.
 * Objects removed from the level map earlier (`removed`) are left out, and
 * objects added to it during play (`added`, remains of destroyed objects)
 * come after the level's own.
 */
export function enterRoom(
  level: LevelFile,
  sprites: LevelSprites,
  rng: BorlandRandom,
  screen: number,
  removed: readonly MapRemoval[] = [],
  added: readonly SimObject[] = [],
): Room {
  const layout = screenLayout(level, sprites, screen);
  const randoms = initScreenRandoms(rng, screen);
  const ctx: ObjectContext = { sprites, rng, randoms, disks: 0, counter: 0 };
  // All objects are created, removed ones too, so the generator runs as it did at level load.
  const created = layout.objects.map((t, id) => createObject(t.sprite, t.x, t.y, ctx, id));
  initScreenRandoms(rng, screen);
  const objects = [...created.filter((o) => !removed.includes(o.id)), ...added.map((o) => structuredClone(o))];
  return { screen, background: layout.background, solid: layout.solid, objects, randoms, killingFloor: false };
}

/** What a room's tick needs from the world around it. */
export interface RoomWorld {
  disks: number;
  counter: number;
  /** Weapons sprite set (shot collision boxes). */
  weapons: SpriteSetFile | null;
  /** An object of this room left the level map for good (until the hero dies). */
  removeFromMap(o: SimObject): void;
  /** An object made during play joins the level map (remains of a destroyed object). */
  addToMap(o: SimObject): void;
}

const NO_WORLD: RoomWorld = { disks: 0, counter: 0, weapons: null, removeFromMap: () => {}, addToMap: () => {} };

/**
 * One tick of the room's objects, in order; objects made during the tick
 * (explosions, remains) run in the same tick, removed ones do not.
 */
export function stepRoom(room: Room, sprites: LevelSprites, rng: BorlandRandom, world: RoomWorld = NO_WORLD): void {
  const ctx: ObjectContext = { sprites, rng, randoms: room.randoms, disks: world.disks, counter: world.counter };
  let solids: SolidBox[] | null = null;
  const shots = {
    sprites,
    weapons: world.weapons,
    solids: () => (solids ??= solidBoxes(room, sprites)),
    objects: room.objects,
    destroy: (o: SimObject) => {
      o.removed = true;
      world.removeFromMap(o);
    },
    leave: (o: SimObject) => {
      room.objects.push(o);
      world.addToMap(o);
    },
  };
  for (const o of room.objects) {
    if (o.removed) continue;
    if (o.kind === 'killingFloor') {
      // Opens the bottom row: the hero dies by falling out of the screen (EB_ENEM.C:486-492).
      room.killingFloor = true;
      room.solid = room.solid.filter((t) => t.y < (SCREEN_ROWS - 1) * TILE);
      solids = null;
      o.removed = true;
      world.removeFromMap(o);
    } else if (o.kind === 'shot') {
      updateShot(o, shots);
    } else {
      const made = updateObject(o, ctx);
      if (made) room.objects.push(made);
    }
  }
  // Removed after the loop: PyElectroMan removes during iteration and skips the next object's update.
  if (room.objects.some((o) => o.removed)) room.objects = room.objects.filter((o) => !o.removed);
}
