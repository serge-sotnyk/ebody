// Collision geometry against a room's solid tiles.
// Ported from PyElectroMan emgame.py (Entity.check_ground, check_collision,
// check_move). PyElectroMan works in doubled pixels; we use original pixels,
// and check_move keeps its sampling arithmetic in doubled units so that every
// rounding step stays the same.

import type { BBox, SolidSides } from '../data/types.ts';
import { SCREEN_ROWS, TILE } from '../data/types.ts';
import type { Room } from './room.ts';
import type { LevelSprites } from './tiles.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * pygame Rect.colliderect: rectangles with zero width or height never
 * collide; negative sizes extend the other way; touching edges do not overlap.
 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  if (a.w === 0 || a.h === 0 || b.w === 0 || b.h === 0) return false;
  return (
    Math.min(a.x, a.x + a.w) < Math.max(b.x, b.x + b.w) &&
    Math.min(a.y, a.y + a.h) < Math.max(b.y, b.y + b.h) &&
    Math.max(a.x, a.x + a.w) > Math.min(b.x, b.x + b.w) &&
    Math.max(a.y, a.y + a.h) > Math.min(b.y, b.y + b.h)
  );
}

export interface SolidBox extends Rect {
  sides: SolidSides;
}

/** Collision boxes of a room's solid tiles, in the room's order. */
export function solidBoxes(room: Room, sprites: LevelSprites): SolidBox[] {
  const boxes: SolidBox[] = [];
  for (const t of room.solid) {
    const info = sprites.get(t.sprite);
    if (info) boxes.push({ ...offset(info.bbox, t.x, t.y), sides: info.solid });
  }
  return boxes;
}

const offset = (b: BBox, x: number, y: number): Rect => ({ x: b.x + x, y: b.y + y, w: b.w, h: b.h });

/** Distance from the bottom of `box` (at x, y) down to the first solid top below it. */
export const NO_GROUND = (SCREEN_ROWS * (2 * TILE + 1)) / 2; // PyElectroMan: SCREEN_Y * (SPRITE_Y + 1), doubled pixels

export function groundDistance(box: BBox, x: number, y: number, solids: readonly SolidBox[]): number {
  const left = box.x + x;
  const bottom = box.y + box.h + y;
  const below: Rect = { x: left, y: bottom, w: box.w, h: SCREEN_ROWS * TILE - bottom };
  const hits = solids.filter((s) => rectsOverlap(below, s)).sort((a, b) => a.y - b.y);
  for (const s of hits) {
    if (s.sides.top) return s.y - bottom;
  }
  return NO_GROUND;
}

/** Would `box` at (x + dx, y + dy) run into a solid side facing the movement? */
export function collides(
  box: BBox,
  x: number,
  y: number,
  dx: number,
  dy: number,
  solids: readonly SolidBox[],
  ignoreGround: boolean,
): boolean {
  const me = offset(box, x + dx, y + dy);
  for (const s of solids) {
    if (!rectsOverlap(me, s)) continue;
    const { left, right, top, bottom } = s.sides;
    if ((dx > 0 && left) || (dx < 0 && right) || (dy > 0 && top && !ignoreGround) || (dy < 0 && bottom)) return true;
  }
  return false;
}

/**
 * How far `box` can move towards (dx, dy): it advances one pixel at a time
 * along the longer axis, the other axis following the slope, and stops
 * before the first sample that collides. `visit` sees every sample offset,
 * the colliding one included (the hero collects touched objects with it).
 */
export function checkMove(
  box: BBox,
  x: number,
  y: number,
  dx: number,
  dy: number,
  solids: readonly SolidBox[],
  ignoreGround = false,
  visit?: (dx: number, dy: number) => void,
): { x: number; y: number } {
  // Doubled units, as in PyElectroMan, for identical rounding.
  let ox = 2 * dx;
  let oy = 2 * dy;
  if (ox === 0 && oy === 0) {
    visit?.(0, 0);
    return { x: 0, y: 0 };
  }
  let nx = 0;
  let last: [number, number] = [0, 0];
  const swap = Math.abs(ox) < Math.abs(oy);
  if (swap) [ox, oy] = [oy, ox];
  const sy = (oy / Math.abs(ox)) * 2;
  let fy = 0.01;
  for (let step = 0; step < Math.abs(ox) / 2; step++) {
    nx += 2 * Math.sign(ox);
    fy += sy;
    const ny = Math.trunc(fy) & ~1;
    const current: [number, number] = swap ? [ny, nx] : [nx, ny];
    visit?.(current[0] / 2, current[1] / 2);
    if (collides(box, x, y, current[0] / 2, current[1] / 2, solids, ignoreGround)) break;
    last = current;
  }
  return { x: last[0] / 2, y: last[1] / 2 };
}
