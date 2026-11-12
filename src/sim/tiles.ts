// How tiles placed in a level are interpreted.
// Ported from PyElectroMan emdata.py (Level.process, Level.get_anim_ends).

import { FLAG, hasFlag } from '../data/sprite-status.ts';
import { SET_SIZE, type SpriteInfo, type SpriteSetFile } from '../data/types.ts';

export type TileKind = 'background' | 'collision' | 'active';

/** Action code of a teleport; with param 1 it is two tiles tall. */
export const ACTION_TELEPORT = 13;

/**
 * Plain solid tiles have flags exactly 0x80 and no action; any other tile with
 * the active flag is an object; everything else is scenery.
 */
export function classifyTile(sprite: SpriteInfo): TileKind {
  if (sprite.flags === FLAG.active && sprite.action === 0) return 'collision';
  if (sprite.flags & FLAG.active) return 'active';
  return 'background';
}

/** Sprite sets shared by all levels, as opposed to a level's own two. */
export type Sheet = 'weapons' | 'info' | 'enem';

/**
 * Sprite lookup for a level: indices 0..63 come from the first set, 64..127
 * from the second. `sheets` holds the shared sets the game logic needs
 * (collision boxes of shots and enemies).
 */
export class LevelSprites {
  constructor(
    readonly sets: readonly [SpriteSetFile, SpriteSetFile],
    public sheets: Partial<Record<Sheet, SpriteSetFile>> = {},
  ) {}

  get(index: number): SpriteInfo | null {
    if (index < 0 || index >= 2 * SET_SIZE) return null;
    const set = this.sets[index < SET_SIZE ? 0 : 1];
    return set.sprites[index % SET_SIZE] ?? null;
  }

  /** A sprite of the level (no sheet) or of a shared set. */
  info(index: number, sheet?: Sheet): SpriteInfo | null {
    if (!sheet) return this.get(index);
    return this.sheets[sheet]?.sprites[index] ?? null;
  }

  /**
   * Animation containing `index`: scan back to a sprite with the first-frame
   * flag and forward to one with the last-frame flag. Animations may cross
   * from the first set into the second.
   */
  animEnds(index: number): [number, number] {
    let s = index;
    while (s > 0 && !this.flag(s, 'firstFrame')) s -= 1;
    const start = s;
    while (s < 2 * SET_SIZE && !this.flag(s, 'lastFrame')) s += 1;
    return [start, Math.min(s, 2 * SET_SIZE - 1)];
  }

  private flag(index: number, name: 'firstFrame' | 'lastFrame'): boolean {
    const sprite = this.get(index);
    return sprite !== null && hasFlag(sprite, name);
  }
}
