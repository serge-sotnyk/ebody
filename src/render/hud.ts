// The status display drawn over the bottom of the playfield: weapon heat on
// the left, weapon level on the right, collected disks between them.
// Ported from PyElectroMan emdisplay.py (Indicators, LEDBar, DiskInfo); the
// positions match the DOS screenshots (docs/fidelity.md R1).

import { ATLAS_COLUMNS, TILE } from '../data/types.ts';
import { PLAYFIELD_X, PLAYFIELD_Y } from './display.ts';

/** Info sprite 4 holds the lamps: 8x8 cells, green, yellow, red, blue (off) and an empty end piece. */
const LAMP_SPRITE = 4;
const LAMPS: readonly (readonly [number, number])[] = [
  [0, 0],
  [8, 0],
  [16, 0],
  [0, 8],
  [8, 8],
];
const GREEN = 0;
const YELLOW = 1;
const RED = 2;
const OFF = 3;
const END = 4;

/** Lamps lit for heat 0..6: the first is red while the weapon is cold (no weapon). */
const HEAT_BAR = [
  [RED, OFF, OFF, OFF, OFF, OFF],
  [GREEN, OFF, OFF, OFF, OFF, OFF],
  [GREEN, GREEN, OFF, OFF, OFF, OFF],
  [GREEN, GREEN, YELLOW, OFF, OFF, OFF],
  [GREEN, GREEN, YELLOW, RED, OFF, OFF],
  [GREEN, GREEN, YELLOW, RED, RED, OFF],
  [GREEN, GREEN, YELLOW, RED, RED, RED],
];
/** Lamps lit for weapon level 0..6. */
const POWER_BAR = [
  [RED, OFF, OFF, OFF, OFF, OFF],
  [RED, YELLOW, OFF, OFF, OFF, OFF],
  [RED, YELLOW, GREEN, OFF, OFF, OFF],
  [RED, YELLOW, GREEN, GREEN, OFF, OFF],
  [RED, YELLOW, GREEN, GREEN, GREEN, OFF],
  [RED, YELLOW, GREEN, GREEN, GREEN, GREEN],
  [RED, YELLOW, GREEN, GREEN, GREEN, GREEN],
];

/** Info sprite 3: the disk icon is its top-left 9x8 pixels. */
const DISK_SPRITE = 3;

export interface HudState {
  temp: number;
  power: number;
  ammo: number;
  disks: number;
  /** The tick counter the frame was made with (blinking). */
  counter: number;
}

export function drawHud(ctx: CanvasRenderingContext2D, info: CanvasImageSource, s: HudState): void {
  bar(ctx, info, 8, 176, HEAT_BAR[s.temp % 7]!);
  // Running out of shots (fewer than 3): the level lamp blinks one step down.
  const level = s.ammo < 3 && s.power && s.counter & 0x02 ? s.power - 1 : s.power;
  bar(ctx, info, 256, 176, POWER_BAR[level % 7]!);
  // Three disks: the icons blink.
  if (s.disks && (s.disks < 3 || s.counter & 0x04)) {
    for (let d = 0; d < Math.min(s.disks, 3); d++) part(ctx, info, DISK_SPRITE, 0, 0, 9, 8, 72 + 11 * d, 176);
  }
}

function bar(ctx: CanvasRenderingContext2D, info: CanvasImageSource, x: number, y: number, lamps: readonly number[]): void {
  lamps.forEach((lamp, i) => {
    const [sx, sy] = LAMPS[lamp]!;
    part(ctx, info, LAMP_SPRITE, sx, sy, 8, 8, x + 8 * i, y);
  });
  const [sx, sy] = LAMPS[END]!;
  part(ctx, info, LAMP_SPRITE, sx, sy, 8, 8, x + 8 * lamps.length, y);
}

/** Draw part of an info sprite (atlas cell `cell`, offset sx, sy, size w x h) at playfield (x, y). */
function part(
  ctx: CanvasRenderingContext2D,
  atlas: CanvasImageSource,
  cell: number,
  sx: number,
  sy: number,
  w: number,
  h: number,
  x: number,
  y: number,
): void {
  const cx = (cell % ATLAS_COLUMNS) * TILE + sx;
  const cy = Math.floor(cell / ATLAS_COLUMNS) * TILE + sy;
  ctx.drawImage(atlas, cx, cy, w, h, PLAYFIELD_X + x, PLAYFIELD_Y + y, w, h);
}
