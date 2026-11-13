// Turns a level screen into an ordered list of sprites to draw.
// Kept free of DOM so the same order is used in the browser and in Node checks.

import { hasFlag } from '../data/sprite-status.ts';
import { SCREEN_COLS, SCREEN_ROWS, TILE, type LevelFile } from '../data/types.ts';
import { ACTION, objectSprite, type Sheet } from '../sim/objects.ts';
import { screenLayout, type PlacedTile, type Room } from '../sim/room.ts';
import { shotSprites } from '../sim/weapons.ts';
import type { LevelSprites } from '../sim/tiles.ts';

export interface DrawOp {
  /** Level sprite index 1..127, or an index into `sheet`. */
  sprite: number;
  /** Position inside the playfield, original pixels. */
  x: number;
  y: number;
  /** Another sprite set than the level's (explosions, shots, creatures). */
  sheet?: Sheet;
  /** Drawn behind the hero even if the sprite is flagged "in front". */
  back?: boolean;
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
      if (op.sheet || op.back) {
        layers.back.push(op);
        continue;
      }
      const info = sprites.get(op.sprite);
      if (info) (hasFlag(info, 'inFront') ? layers.front : layers.back).push(op);
    }
  }
  return layers;
}

/**
 * Draw order for a room in play: objects show their current frame, hidden
 * ones are skipped. Checkpoints have two frames, with and without a cross on
 * top; the level places the start with the cross and the others without, so
 * the active checkpoint (`active`, if on this screen) shows the cross and the
 * others do not (fidelity G14).
 */
export function roomLayers(room: Room, sprites: LevelSprites, active: { x: number; y: number } | null = null): SceneLayers {
  const objects: DrawOp[] = [];
  for (const o of room.objects) {
    let sprite = objectSprite(o);
    if (sprite === null) continue;
    if (o.action === ACTION.checkpoint && !o.sheet) {
      sprite = active && o.x === active.x && o.y === active.y ? o.frames[0]! : o.frames.at(-1)!;
    }
    if (o.kind === 'shot') {
      shotSprites(o).forEach((s, i) => objects.push({ sprite: s, x: o.x, y: o.y + i * TILE, sheet: 'weapons' }));
      continue;
    }
    // PyElectroMan draws enemy shots and remains directly, never held back for the front layer.
    const back = o.kind === 'enemyShot' || o.kind === 'broken';
    objects.push({ sprite, x: o.x, y: o.y, ...(o.sheet ? { sheet: o.sheet } : {}), ...(back ? { back } : {}) });
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
