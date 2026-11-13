// Decoding of the 8 per-sprite status bytes stored in .ggs files.
// Ported from PyElectroMan emdata.py (SpriteData.load, flag_masks).

import type { BBox, SolidSides, SpriteInfo } from './types.ts';

export const FLAG = {
  active: 0x80,
  touchable: 0x40,
  shootable: 0x20,
  staysActive: 0x10,
  destroyable: 0x08,
  inFront: 0x04,
  lastFrame: 0x02,
  firstFrame: 0x01,
} as const;

export type FlagName = keyof typeof FLAG;

/** Object types selected by the `action` field (emdata.py Level.init_functions, sprite_info.py). */
export const ACTION_NAMES: Record<number, string> = {
  0: 'tile',
  1: 'cycle',
  2: 'pulse',
  3: 'monitor',
  4: 'display',
  5: 'cycle+',
  6: 'pulse+',
  7: 'flash+',
  8: 'unused',
  9: 'rocket up',
  10: 'rocket down',
  11: 'killing floor',
  12: 'checkpoint',
  13: 'teleport',
  14: 'flash',
  15: 'exit',
  16: 'enemy',
  17: 'cannon left',
  18: 'cannon right',
  19: 'cannon up',
  20: 'cannon down',
  21: 'flash special',
};

/** How an animated object picks its starting frame/delay (`init` field, sprite_info.py frame_cycles). */
export const INIT_NAMES = ['diag', 'x', 'y', 'zero', 'rand', 'rand_x', 'rand_y', 'rand_frame'];

/** What touching a touchable sprite does (`touch & 7`, sprite_info.py touch_procs). */
export const TOUCH_NAMES = ['none', 'battery', 'teleport', 'checkpoint', 'killer', 'floppy', 'exit', 'special'];

export function decodeStatus(status: readonly number[], size: readonly number[]): SpriteInfo {
  if (status.length !== 8) throw new Error(`expected 8 status bytes, got ${status.length}`);
  const b = (i: number): number => status[i] ?? 0;
  const x1 = b(4) & 0x7f;
  const x2 = b(5) & 0x7f;
  const y1 = b(6) & 0x7f;
  const y2 = b(7) & 0x7f;
  const bbox: BBox = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  // High bit set on a box byte means that side does not collide.
  const solid: SolidSides = {
    left: (b(4) & 0x80) === 0,
    right: (b(5) & 0x80) === 0,
    top: (b(6) & 0x80) === 0,
    bottom: (b(7) & 0x80) === 0,
  };
  return {
    status: [...status],
    size: [...size],
    flags: b(0),
    action: b(1) & 0x1f,
    init: (b(1) & 0xe0) >> 5,
    param: b(2),
    touch: b(3),
    bbox,
    solid,
  };
}

export function hasFlag(sprite: SpriteInfo, flag: FlagName): boolean {
  return (sprite.flags & FLAG[flag]) !== 0;
}

export function flagNames(flags: number): FlagName[] {
  return (Object.keys(FLAG) as FlagName[]).filter((name) => (flags & FLAG[name]) !== 0);
}
