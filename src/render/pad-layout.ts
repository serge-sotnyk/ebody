// Where the touch buttons go and how big they are: in strips beside the
// picture (phones in landscape) or in a strip below it (tablets), whichever
// leaves the larger picture. Below, the picture comes down to the middle of
// the bottom row of buttons, and a second row (fire on the left, jump on the
// right) sits above it: the buttons in the corners reach a little over the
// picture's edges, which costs less than black bands beside a smaller
// picture; the buttons are see-through (shell.css).

import { FRAME_H, FRAME_W, type PixelAspect } from './scale.ts';

export interface PadLayout {
  mode: 'beside' | 'below';
  /** Size of a single button, and the gap around buttons, CSS pixels. */
  btn: number;
  gap: number;
  /** Beside: the buttons grow to fill the strip (at most 1.4 buttons). */
  big: number;
  /** Beside: width of each side strip. */
  side: number;
  /** Below: room kept under the picture (half the bottom row and the gap under it). */
  bottom: number;
  /**
   * The left/right rocker. Beside: at least 2.2 buttons wide, reaching a
   * little over the picture's edge where the strip is narrower (the buttons
   * are see-through), 1.4 tall; below: 2.4 wide, 1.3 tall.
   */
  rockerW: number;
  rockerH: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Room the corner buttons (help, fullscreen) take at the top. */
export const CORNER = 50;

export function padLayout(w: number, h: number, aspect: PixelAspect = 1): PadLayout {
  const small = Math.min(w, h);
  const btn = clamp(Math.round(small * 0.15), 44, 80);
  const gap = clamp(Math.round(small * 0.025), 6, 14);
  const rockerH = Math.round(btn * 1.3);
  const picture = (sw: number, sh: number): number => Math.min(sw / FRAME_W, sh / (FRAME_H * aspect));

  // Beside: the strips get whatever the picture leaves when it fills the
  // height, but at least room for a rocker 1.6 buttons wide (the picture
  // then shrinks a little), and the rocker never grows past 3.2 buttons.
  const free = Math.floor((w - (h / (FRAME_H * aspect)) * FRAME_W) / 2);
  const side = clamp(free, Math.round(1.6 * btn) + 2 * gap, Math.round(3.2 * btn) + 2 * gap);
  const fitsBeside = 3 * btn + 3 * gap + CORNER <= h;
  const scaleBeside = picture(w - 2 * side, h);

  const bottom = Math.round(rockerH / 2) + gap;
  const scaleBelow = picture(w, h - bottom);

  if (fitsBeside && scaleBeside >= scaleBelow) {
    // Three buttons spread down the right strip, under the corner buttons.
    const big = Math.round(clamp(Math.min(side - 2 * gap, (h - CORNER - 4 * gap) / 3), btn, 1.4 * btn));
    const rockerW = Math.max(side - 2 * gap, Math.round(2.2 * btn));
    return { mode: 'beside', btn, gap, big, side, bottom: 0, rockerW, rockerH: Math.round(1.4 * btn) };
  }
  return { mode: 'below', btn, gap, big: btn, side: 0, bottom, rockerW: Math.round(2.4 * btn), rockerH };
}
