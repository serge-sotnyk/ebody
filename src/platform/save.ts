// The saved game, in the browser's local storage. Like the original, the
// game is saved when the hero reaches a checkpoint (PyElectroMan SaveGame,
// EB.C:920-948); we also save when a level starts, so Continue picks up at
// the level reached. What Continue restores is open (docs/fidelity.md G5).

import type { LevelProgress } from '../sim/world.ts';

const KEY = 'ebody.save';
const VERSION = 1;

export interface SavedGame {
  version: number;
  /** Level name (data/levels.ts GAME_LEVELS). */
  level: string;
  /** Checkpoint and disks; none means the level's start. */
  progress?: LevelProgress;
}

export function loadGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const game = JSON.parse(raw) as SavedGame;
    return game.version === VERSION && typeof game.level === 'string' ? game : null;
  } catch {
    return null;
  }
}

export function saveGame(level: string, progress?: LevelProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, level, progress } satisfies SavedGame));
  } catch {
    // Storage blocked (private mode): the game just is not saved.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
