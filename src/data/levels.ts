import { SCREEN_COUNT, type LevelFile } from './types.ts';
import type { LevelSprites } from '../sim/tiles.ts';
import { screenLayout } from '../sim/room.ts';

/** The eight levels in play order (PyElectroMan emglobals.level_names). */
export const GAME_LEVELS = ['elek', 'koryt', 'mieszk', 'magaz', 'fiolet', '10x10', 'sluzy', 'widok'] as const;

const ACTION_CHECKPOINT = 12;

export interface TilePlace {
  screen: number;
  /** Top-left corner of the tile, playfield pixels. */
  x: number;
  y: number;
}

/** Every checkpoint tile of a level, in the order the game creates objects. */
export function checkpoints(level: LevelFile, sprites: LevelSprites): (TilePlace & { start: boolean })[] {
  const found: (TilePlace & { start: boolean })[] = [];
  for (let screen = 0; screen < SCREEN_COUNT; screen++) {
    if (!level.screens[screen]) continue;
    for (const t of screenLayout(level, sprites, screen).objects) {
      const info = sprites.get(t.sprite);
      if (info?.action === ACTION_CHECKPOINT) found.push({ screen, x: t.x, y: t.y, start: info.param === 1 });
    }
  }
  return found;
}

/**
 * The level start: a checkpoint with param 1 (the last one, as PyElectroMan's
 * loader keeps overwriting it; every level has exactly one).
 */
export function startCheckpoint(level: LevelFile, sprites: LevelSprites): TilePlace | null {
  return checkpoints(level, sprites)
    .filter((c) => c.start)
    .at(-1) ?? null;
}

/** Screen holding the level start, or the first used screen. */
export function startScreen(level: LevelFile, sprites: LevelSprites): number {
  const start = startCheckpoint(level, sprites);
  if (start) return start.screen;
  return Math.max(
    level.screens.findIndex((s) => s !== null),
    0,
  );
}
