// Turns a level screen into an ordered list of sprites to draw.
// Kept free of DOM so the same order is used in the browser and in Node checks.

import { hasFlag } from '../data/sprite-status.ts';
import { SCREEN_COLS, SCREEN_ROWS, TILE, type LevelFile } from '../data/types.ts';
import { objectSprite } from '../sim/objects.ts';
import { screenLayout, type PlacedTile, type Room } from '../sim/room.ts';
import type { LevelSprites } from '../sim/tiles.ts';

export interface DrawOp {
  /** Level sprite index 1..127. */
  sprite: number;
  /** Position inside the playfield, original pixels. */
  x: number;
  y: number;
}

/**
 * 'planes': draw planes 0..3 in order, as PyElectroMan's level maps do.
 * 'game':   draw like the running game: scenery, then solid tiles, then
 *           objects, then everything flagged "in front" last.
 */
export type LayerOrder = 'planes' | 'game';

export interface ComposeResult {
  ops: DrawOp[];
  /** Tile indices that point at empty sprite slots (skipped). */
  missing: number[];
}

/** Sprites drawn behind the hero and in front of it. */
export interface SceneLayers {
  back: DrawOp[];
  front: DrawOp[];
}

/**
 * Game draw order. Scenery, solid tiles and objects are drawn in that order;
 * any sprite flagged "in front" is held back and drawn after the hero, in the
 * same group order.
 */
export function sceneLayers(sprites: LevelSprites, groups: readonly (readonly DrawOp[])[]): SceneLayers {
  const layers: SceneLayers = { back: [], front: [] };
  for (const group of groups) {
    for (const op of group) {
      const info = sprites.get(op.sprite);
      if (info) (hasFlag(info, 'inFront') ? layers.front : layers.back).push(op);
    }
  }
  return layers;
}

/** Draw order for a room in play: objects show their current frame, hidden ones are skipped. */
export function roomLayers(room: Room, sprites: LevelSprites): SceneLayers {
  const objects: DrawOp[] = [];
  for (const o of room.objects) {
    const sprite = objectSprite(o);
    if (sprite !== null) objects.push({ sprite, x: o.x, y: o.y });
  }
  return sceneLayers(sprites, [room.background, room.solid, objects]);
}

/** Static picture of a screen: every object shows the tile placed in the level. */
export function composeScreen(
  level: LevelFile,
  sprites: LevelSprites,
  screen: number,
  order: LayerOrder,
): ComposeResult {
  if (order === 'game') {
    const layout = screenLayout(level, sprites, screen);
    const { back, front } = sceneLayers(sprites, [layout.background, layout.solid, layout.objects]);
    return { ops: [...back, ...front], missing: layout.missing };
  }

  const ops: PlacedTile[] = [];
  const missing: number[] = [];
  for (const plane of level.screens[screen] ?? []) {
    if (!plane) continue;
    for (let row = 0; row < SCREEN_ROWS; row++) {
      for (let col = 0; col < SCREEN_COLS; col++) {
        const index = plane[row * SCREEN_COLS + col] ?? 0;
        if (index === 0) continue;
        if (sprites.get(index)) ops.push({ sprite: index, x: col * TILE, y: row * TILE });
        else missing.push(index);
      }
    }
  }
  return { ops, missing };
}
