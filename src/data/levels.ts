import { SCREEN_COUNT, type LevelFile } from './types.ts';
import type { LevelSprites } from '../sim/tiles.ts';

/** The eight levels in play order (PyElectroMan emglobals.level_names). */
export const GAME_LEVELS = ['elek', 'koryt', 'mieszk', 'magaz', 'fiolet', '10x10', 'sluzy', 'widok'] as const;

const ACTION_CHECKPOINT = 12;

/** Screen holding the level's start checkpoint (a checkpoint sprite with param 1), or the first used screen. */
export function startScreen(level: LevelFile, sprites: LevelSprites): number {
  let first = -1;
  for (let s = 0; s < SCREEN_COUNT; s++) {
    const planes = level.screens[s];
    if (!planes) continue;
    if (first < 0) first = s;
    for (const plane of planes) {
      for (const index of plane ?? []) {
        const info = index ? sprites.get(index) : null;
        if (info && info.action === ACTION_CHECKPOINT && info.param === 1) return s;
      }
    }
  }
  return Math.max(first, 0);
}
