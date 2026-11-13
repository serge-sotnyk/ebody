// The hero's weapon: five levels of shots, what they hit and what that does.
// Ported from PyElectroMan emhero.py (PlayerEntity.fire_weapon, Projectile),
// which follows EB_HERO.C:167-479 of the original; values in original pixels.

import { FLAG } from '../data/sprite-status.ts';
import { SCREEN_COLS, TILE, type SpriteSetFile } from '../data/types.ts';
import { rectsOverlap, type Rect, type SolidBox } from './collision.ts';
import { killCreature } from './enemies.ts';
import { blank, createBroken, createExplosion, currentInfo, objectBox, type SimObject } from './objects.ts';
import type { SoundName } from './sounds.ts';
import type { LevelSprites } from './tiles.ts';

/** Shots per magazine for weapon levels 0..5. */
export const MAGAZINE = [0, 20, 15, 25, 10, 15];
/** Heat added by one shot, levels 0..5; the weapon will not fire above 5. */
export const HEAT = [0, 1, 2, 1, 4, 3];
export const MAX_HEAT = 5;

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/**
 * Per weapon level: animation in the weapons set (facing right, left), where
 * the shot starts relative to the hero, and how fast it flies.
 *   1  short range: gone after one run of its animation
 *   2, 3  long range
 *   4  long range, passes through creatures
 *   5  a two-tile-tall "bow"
 */
const SHOTS: Record<number, { right: number[]; left: number[]; dx: number; dy: number; speed: number }> = {
  1: { right: range(8, 15), left: range(8, 15), dx: 19, dy: 16, speed: 14 },
  2: { right: range(16, 19), left: range(20, 23), dx: 23, dy: 16, speed: 16 },
  3: { right: range(24, 26), left: range(28, 30), dx: 23, dy: 16, speed: 14 },
  4: { right: range(32, 33), left: range(34, 35), dx: 23, dy: 16, speed: 12 },
  5: { right: range(36, 37), left: range(38, 39), dx: 18, dy: 4, speed: 16 },
};

/** The bow's collision box covers both of its tiles (EB_HERO.C:286). */
const BOW_HEIGHT = 2 * TILE - 6;

/** A shot of weapon `level` fired by a hero at (x, y) facing right (1) or left (0). */
export function createShot(level: number, orientation: 0 | 1, x: number, y: number): SimObject {
  const s = SHOTS[level]!;
  const dir = orientation === 1 ? 1 : -1;
  return {
    ...blank(-1, 0, x + dir * s.dx, y + s.dy, orientation === 1 ? s.right : s.left),
    kind: 'shot',
    sheet: 'weapons',
    step: dir * s.speed,
    level,
  };
}

/** The sprites a shot shows: one, or two stacked for the bow. */
export function shotSprites(shot: SimObject): number[] {
  const n = shot.frames.length;
  const first = shot.frames[shot.frame]!;
  return shot.level === 5 ? [first, shot.frames[(shot.frame + 1) % n]!] : [first];
}

export interface ShotContext {
  sprites: LevelSprites;
  weapons: SpriteSetFile | null;
  solids: () => readonly SolidBox[];
  /** All objects of the room, in order (it grows while the tick runs). */
  objects: SimObject[];
  /** Remove an object from the room and from the level map. */
  destroy(o: SimObject): void;
  /** Add an object to the room and to the level map. */
  leave(o: SimObject): void;
  explode(x: number, y: number): void;
  sound(name: SoundName): void;
}

function shotBox(shot: SimObject, weapons: SpriteSetFile | null): Rect {
  const b = weapons?.sprites[shot.frames[shot.frame]!]?.bbox ?? { x: 0, y: 0, w: 0, h: 0 };
  return { x: shot.x + b.x, y: shot.y + b.y, w: b.w, h: shot.level === 5 ? BOW_HEIGHT : b.h };
}

/** PyElectroMan Projectile.collides_with: a plain overlap test, zero-sized boxes included. */
const touches = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * One tick of a shot: animate, fly, then stop at a wall; kill every creature
 * it touches (level 4 flies on), or stop at the first shootable object.
 */
export function updateShot(shot: SimObject, c: ShotContext): void {
  const previous = shot.frame;
  shot.frame = (shot.frame + 1) % shot.frames.length;
  if (shot.frame < previous && shot.level === 1) {
    shot.removed = true; // short range: one run of the animation
    return;
  }
  shot.x += shot.step!;
  if (shot.x > SCREEN_COLS * TILE || shot.x < -TILE) {
    shot.removed = true;
    return;
  }

  const box = shotBox(shot, c.weapons);
  const wall = c.solids().some(
    (s) => rectsOverlap(box, s) && ((shot.step! > 0 && s.sides.left) || (shot.step! < 0 && s.sides.right)),
  );
  if (wall) {
    if (shot.level === 5) {
      const d = Math.sign(shot.step!);
      c.objects.push(createExplosion(shot.x - d, shot.y));
      c.objects.push(createExplosion(shot.x + 8 * d, shot.y + 12));
      c.objects.push(createExplosion(shot.x + d, shot.y + 24));
    } else {
      c.objects.push(createExplosion(shot.x, shot.y));
    }
    shot.removed = true;
    return;
  }

  let hitCreature = false;
  for (const o of [...c.objects]) {
    if (o === shot || o.removed) continue;
    if (o.kind === 'enemy') {
      if (touches(box, objectBox(o, c.sprites))) {
        killCreature(o, c);
        c.explode(shot.x, shot.y);
        c.sound('blast');
        hitCreature = true;
      }
      continue;
    }
    const info = currentInfo(o, c.sprites);
    if (!info || !(info.flags & FLAG.shootable)) continue;
    if (!touches(box, objectBox(o, c.sprites))) continue;
    hitObject(o, info.flags, c);
    shot.removed = true;
    return;
  }
  if (hitCreature && shot.level !== 4) shot.removed = true;
}

/**
 * A shot destroys a shootable object: an explosion over its middle, and if it
 * is breakable, the sprite after its animation is left in its place (EB_HERO.C:528-534).
 */
function hitObject(o: SimObject, flags: number, c: ShotContext): void {
  const b = objectBox(o, c.sprites);
  const explosion = createExplosion(b.x + Math.floor(b.w / 2) - TILE / 2, b.y + Math.floor(b.h / 2) - TILE / 2);
  c.destroy(o);
  if (flags & FLAG.destroyable) {
    const gridX = Math.floor(o.x / TILE) * TILE;
    const gridY = Math.floor(o.y / TILE) * TILE;
    const brokenIndex = o.placed === null ? null : o.placed + o.frames.length;
    const broken =
      brokenIndex !== null && brokenIndex < 128 && c.sprites.get(brokenIndex)
        ? createBroken([brokenIndex], 0, gridX, gridY)
        : createBroken(o.frames, o.frame + 1 < o.frames.length ? Math.max(o.frame + 1, 0) : 0, gridX, gridY);
    c.leave(broken);
  }
  c.objects.push(explosion);
  c.sound('blast');
}
