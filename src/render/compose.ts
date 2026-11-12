// Turns a level screen into an ordered list of sprites to draw.
// Kept free of DOM so the same order is used in the browser and in Node checks.

import { hasFlag } from '../data/sprite-status.ts';
import { SCREEN_COLS, SCREEN_ROWS, TILE, type LevelFile } from '../data/types.ts';
import { ACTION_TELEPORT, classifyTile, type LevelSprites } from '../sim/tiles.ts';

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

export function composeScreen(
  level: LevelFile,
  sprites: LevelSprites,
  screen: number,
  order: LayerOrder,
): ComposeResult {
  const planes = level.screens[screen];
  const missing: number[] = [];
  if (!planes) return { ops: [], missing };

  const groups = { background: [] as DrawOp[], collision: [] as DrawOp[], active: [] as DrawOp[], front: [] as DrawOp[] };
  const flat: DrawOp[] = [];

  for (const plane of planes) {
    if (!plane) continue;
    for (let row = 0; row < SCREEN_ROWS; row++) {
      for (let col = 0; col < SCREEN_COLS; col++) {
        const index = plane[row * SCREEN_COLS + col] ?? 0;
        if (index === 0) continue;
        const info = sprites.get(index);
        if (!info) {
          missing.push(index);
          continue;
        }
        const op: DrawOp = { sprite: index, x: col * TILE, y: row * TILE };
        if (order === 'planes') {
          flat.push(op);
          continue;
        }
        const kind = classifyTile(info);
        (hasFlag(info, 'inFront') ? groups.front : groups[kind]).push(op);
        // A two-tile teleport spawns its upper half from the sprite after its animation.
        if (kind === 'active' && info.action === ACTION_TELEPORT && info.param === 1) {
          const top = sprites.animEnds(index)[1] + 1;
          const topInfo = sprites.get(top);
          if (topInfo) {
            const topOp: DrawOp = { sprite: top, x: op.x, y: op.y - TILE };
            (hasFlag(topInfo, 'inFront') ? groups.front : groups.active).push(topOp);
          } else {
            missing.push(top);
          }
        }
      }
    }
  }

  if (order === 'planes') return { ops: flat, missing };
  return { ops: [...groups.background, ...groups.collision, ...groups.active, ...groups.front], missing };
}
