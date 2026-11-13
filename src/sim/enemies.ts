// Creatures, cannons, rockets and their shots.
// Ported from PyElectroMan emgame.py (EnemyPlatform, EnemyFlying,
// EnemyProjectile, CannonBase, RocketUp/RocketDown) and emhero.py
// (check_enemy_collision), which follow EB_ENEM.C and EB_HERO.C of the
// original. Values are in original pixels; where PyElectroMan applies the
// original's offsets to its doubled pixels without doubling them, the
// original's values are used (docs/fidelity.md G18).

import { SCREEN_COLS, SCREEN_ROWS, TILE } from '../data/types.ts';
import { collides, rectsOverlap, type Rect, type SolidBox } from './collision.ts';
import { CREATURES, FLYING } from './enemy-data.ts';
import { blank, currentInfo, type SimObject } from './objects.ts';
import type { BorlandRandom } from './random.ts';
import type { LevelSprites } from './tiles.ts';

const MAX_X = SCREEN_COLS * TILE;
const MAX_Y = SCREEN_ROWS * TILE;

export interface EnemyContext {
  sprites: LevelSprites;
  rng: BorlandRandom;
  solids: () => readonly SolidBox[];
  /** The hero's position at the start of the tick, if there is a hero. */
  hero: { x: number; y: number } | null;
  /** All objects of the room (explosions are added to it). */
  objects: SimObject[];
  /** Remove an object from the room and from the level map. */
  destroy(o: SimObject): void;
  /** A new shot; it joins the room at the end of the tick. */
  spawn(o: SimObject): void;
  explode(x: number, y: number): void;
}

const NO_BOX: Rect = { x: 0, y: 0, w: 0, h: 0 };

/** Collision box of an object's current sprite, relative to the object. */
function box(o: SimObject, sprites: LevelSprites): Rect {
  const index = o.frames[((o.frame % o.frames.length) + o.frames.length) % o.frames.length];
  return (index === undefined ? null : sprites.info(index, o.sheet)?.bbox) ?? NO_BOX;
}

const at = (b: Rect, x: number, y: number): Rect => ({ x: x + b.x, y: y + b.y, w: b.w, h: b.h });

// --- creatures -------------------------------------------------------------

export function updateCreature(o: SimObject, c: EnemyContext): void {
  if (o.phase === 'init') return startPatrol(o, c);
  if (o.delay > 0) {
    o.delay -= 1;
    return;
  }
  if (o.phase === 'shoot') return creatureShoots(o, c);

  // Count down to a shot; it waits for the first frame of the walk (EB_ENEM.C:821-831).
  if (o.shoots) {
    if (o.timer! > 0) o.timer! -= 1;
    if (o.timer === 0 && o.frame === 0) {
      o.delay = 16;
      o.timer = 32 + c.rng.random(64);
      o.phase = 'shoot';
      return;
    }
  }
  o.x += o.step!;
  o.frame = (o.frame + 1) % o.frames.length;
  o.delay = (currentInfo(o, c.sprites)?.param ?? 0) & 0x0f;
  const flying = o.creature === FLYING;
  if (o.step! < 0 && o.x <= o.left!) turn(o, true, !flying);
  else if (o.step! > 0 && o.x >= o.right!) turn(o, false, !flying);
}

function turn(o: SimObject, toRight: boolean, restartWalk: boolean): void {
  o.step = -o.step!;
  face(o, toRight);
  if (restartWalk) o.frame = 0; // flying creatures keep their frame (EB_ENEM.C:1003-1020)
}

function face(o: SimObject, right: boolean): void {
  const anims = CREATURES[o.creature!]!;
  o.facingRight = right;
  o.frames = right ? anims.right : anims.left;
}

/**
 * First update: find the patrol range, tile by tile, up to a wall (and for
 * walking creatures, the end of the floor); creatures with less than one
 * tile of room are removed. Then face the hero (EB_ENEM.C:867-944, 1039-1081).
 */
function startPatrol(o: SimObject, c: EnemyContext): void {
  const flying = o.creature === FLYING;
  const solids = c.solids();
  const b = box(o, c.sprites);
  const wall = (x: number, dir: number): boolean =>
    solids.some((s) => rectsOverlap(at(b, x, o.y), s) && ((dir > 0 && s.sides.left) || (dir < 0 && s.sides.right)));
  const ground = (x: number): boolean =>
    solids.some((s) => s.sides.top && s.y >= o.y + TILE && s.y < o.y + 2 * TILE && s.x <= x && x < s.x + s.w);
  const scan = (dir: number): number => {
    let x = o.x;
    for (let i = 0; i < (flying ? SCREEN_COLS : 12); i++) {
      const next = x + dir * TILE;
      if (flying && (next > MAX_X || next < 0)) break;
      if (wall(next, dir)) break;
      if (!flying && !ground(next)) break;
      x = next;
    }
    return x;
  };
  o.right = scan(1);
  o.left = scan(-1);
  if (o.right - o.left < TILE) {
    c.destroy(o);
    return;
  }
  const right = c.hero !== null && c.hero.x > o.x;
  o.step = right ? Math.abs(o.step!) : -Math.abs(o.step!);
  face(o, right);
  if (o.shoots) o.timer = 32 + c.rng.random(64);
  const spawner = o.placed === null ? null : c.sprites.get(o.placed);
  o.delay = c.rng.random(256) % (((spawner?.param ?? 0) & 0x0f) + 1);
  o.phase = 'patrol';
}

/** Walking creatures shoot sideways, flying ones straight down (EB_ENEM.C:770-812, 947-974). */
function creatureShoots(o: SimObject, c: EnemyContext): void {
  const anims = CREATURES[o.creature!]!;
  const frames = o.step! < 0 ? anims.shotLeft : anims.shotRight;
  const speed = c.sprites.info(frames[0]!, 'enem')?.param ?? 2;
  const b = box(o, c.sprites);
  if (o.creature === FLYING) {
    c.spawn(enemyShot(frames, 'enem', o.x, o.y + b.y + b.h + 1, 0, speed));
  } else if (o.step! < 0) {
    c.spawn(enemyShot(frames, 'enem', o.x + b.x - TILE, o.y, -speed, 0));
  } else {
    c.spawn(enemyShot(frames, 'enem', o.x + b.x + b.w + 1, o.y, speed, 0));
  }
  o.phase = 'patrol';
}

/** A shot kills a creature: an explosion over its middle (EB_ENEM.C xplode). */
export function killCreature(o: SimObject, c: Pick<EnemyContext, 'sprites' | 'destroy' | 'explode'>): void {
  const b = at(box(o, c.sprites), o.x, o.y);
  c.explode(b.x + Math.floor(b.w / 2) - TILE / 2, b.y + Math.floor(b.h / 2) - TILE / 2);
  c.destroy(o);
}

// --- shots -----------------------------------------------------------------

function enemyShot(frames: number[], sheet: 'enem' | undefined, x: number, y: number, vx: number, vy: number): SimObject {
  return { ...blank(-1, 0, x, y, frames), kind: 'enemyShot', ...(sheet ? { sheet } : {}), vx, vy };
}

/** Flies straight; gone past the screen edge or at a solid wall facing it (EB_ENEM.C:581-642). */
export function updateEnemyShot(o: SimObject, c: EnemyContext): void {
  o.x += o.vx!;
  o.y += o.vy!;
  o.frame = (o.frame + 1) % o.frames.length;
  if (o.x < -TILE || o.x > MAX_X || o.y < -TILE || o.y > MAX_Y) {
    o.removed = true;
    return;
  }
  const me = at(box(o, c.sprites), o.x, o.y);
  const vx = o.vx!;
  const vy = o.vy!;
  for (const s of c.solids()) {
    if (!rectsOverlap(me, s)) continue;
    const { left, right, top, bottom } = s.sides;
    // Only walls solid on two sides or more stop it.
    if (Number(left) + Number(right) + Number(top) + Number(bottom) < 2) continue;
    if ((vx > 0 && left) || (vx < 0 && right) || (vy > 0 && top) || (vy < 0 && bottom)) {
      o.removed = true;
      return;
    }
  }
}

// --- cannons ---------------------------------------------------------------

/**
 * Fires every `param + random(param)` ticks (param of the cannon's first
 * sprite); the shot is the animation's last sprite (EB_ENEM.C:645-679).
 */
export function updateCannon(o: SimObject, c: EnemyContext): void {
  if (o.phase === 'init') {
    const param = c.sprites.get(o.frames[0]!)?.param || 8;
    o.interval = param;
    o.timer = c.rng.random(param);
    o.phase = 'ready';
    return;
  }
  if (o.timer! > 0) {
    o.timer! -= 1;
    return;
  }
  fireCannon(o, c);
  o.timer = o.interval! + c.rng.random(o.interval!);
}

function fireCannon(o: SimObject, c: EnemyContext): void {
  const shot = o.frames.at(-1)!;
  const shotInfo = c.sprites.get(shot);
  const speed = shotInfo?.param || 4;
  const cb = box(o, c.sprites);
  const pb = shotInfo?.bbox ?? NO_BOX;
  let x = o.x;
  let y = o.y;
  // Just outside the cannon's box, on the firing side.
  if (o.dx! < 0) x = o.x + cb.x - (pb.x + pb.w) - 1;
  else if (o.dx! > 0) x = o.x + cb.x + cb.w - pb.x + 1;
  else if (o.dy! < 0) y = o.y + cb.y - (pb.y + pb.h) - 1;
  else y = o.y + cb.y + cb.h - pb.y + 1;
  c.spawn(enemyShot([shot], undefined, x, y, o.dx! * speed, o.dy! * speed));
}

// --- rockets ---------------------------------------------------------------

/**
 * Waits until the hero's middle is within a tile-width band around it and
 * above (or below); then one chance in eight per tick to launch. Flies until
 * it hits a wall (exploding) or leaves the screen (EB_ENEM.C:400-484).
 */
export function updateRocket(o: SimObject, c: EnemyContext): void {
  const b = box(o, c.sprites);
  if (o.phase === 'waiting') {
    if (!c.hero) return;
    const cx = c.hero.x + TILE / 2;
    const cy = c.hero.y + TILE;
    const inBand = o.x + b.x - 8 < cx && cx < o.x + b.x + b.w + 8;
    const ahead = o.dy! < 0 ? cy < o.y + b.y : cy > o.y + b.y + b.h;
    if (inBand && ahead && c.rng.random(8) === 0) o.phase = 'flying';
    return;
  }
  o.y += o.vy!;
  o.frame = (o.frame + 1) % o.frames.length;
  if (collides(b, o.x, o.y, 0, o.vy!, c.solids(), false)) {
    c.explode(o.x, o.y);
    c.destroy(o);
    return;
  }
  if ((o.dy! < 0 && o.y < -TILE) || (o.dy! > 0 && o.y > MAX_Y)) c.destroy(o);
}

// --- contact with the hero -------------------------------------------------

/** The hero's box for enemy contact: narrower than for walls (EB_HERO.C:123). */
const HERO_ENEMY_BOX = { x: 7, y: 10, w: 10, h: 35 } as const;

/**
 * Does a creature or enemy shot kill a hero at (x, y)? The original's
 * POS_COMPARE: the enemy box's middle inside the hero's box grown by half the
 * enemy box (EB_HERO.C:601-626). Worked in doubled pixels to keep halves exact.
 */
export function enemyHits(o: SimObject, sprites: LevelSprites, x: number, y: number): boolean {
  const b = box(o, sprites);
  const cx2 = 2 * (o.x + b.x) + b.w;
  const cy2 = 2 * (o.y + b.y) + b.h;
  const left2 = 2 * (x + HERO_ENEMY_BOX.x);
  const right2 = 2 * (x + HERO_ENEMY_BOX.x + HERO_ENEMY_BOX.w);
  const top2 = 2 * (y + HERO_ENEMY_BOX.y);
  const bottom2 = 2 * (y + HERO_ENEMY_BOX.y + HERO_ENEMY_BOX.h);
  return left2 - b.w < cx2 && cx2 < right2 + b.w && top2 - b.h < cy2 && cy2 < bottom2 + b.h;
}
