// How large to show the 320x200 frame in the space available.
//
// Two ways to enlarge pixel art:
// - whole multiples (2x, 3x, ...) of physical pixels keep every original pixel
//   the same size, but can leave wide black borders;
// - stretching to fill the space by a fractional factor with nearest-neighbour
//   sampling makes some pixel rows and columns one physical pixel wider than
//   others, which shows as uneven lines at small factors.
// We use whole multiples when they fill at least 90% of the space. Otherwise
// the frame is first enlarged by the largest whole multiple that fits
// (crisp), and the browser stretches that the remaining bit with smooth
// filtering ("sharp bilinear"): even pixels with slightly soft edges.

export const FRAME_W = 320;
export const FRAME_H = 200;

/**
 * Height of one original pixel relative to its width. 1 = square pixels;
 * 1.2 = the shape they had on a 4:3 monitor in the 320x200 VGA mode.
 */
export type PixelAspect = 1 | 1.2;

export interface Fit {
  /** Size of the canvas backing store: the frame enlarged by whole multiples. */
  canvasWidth: number;
  canvasHeight: number;
  /** Size of the canvas on the page, CSS pixels. */
  cssWidth: number;
  cssHeight: number;
  /** True when the canvas is shown 1:1 in physical pixels (no smoothing involved). */
  exact: boolean;
}

export function computeFit(availCssW: number, availCssH: number, dpr: number, aspect: PixelAspect = 1): Fit {
  const devW = availCssW * dpr;
  const devH = availCssH * dpr;
  const fill = Math.min(devW / FRAME_W, devH / (FRAME_H * aspect));
  const whole = Math.max(1, Math.floor(fill));
  const exact = aspect === 1 && fill >= 1 && whole / fill >= 0.9;
  const scale = exact ? whole : fill;
  return {
    canvasWidth: FRAME_W * whole,
    canvasHeight: FRAME_H * (exact ? whole : Math.max(1, Math.floor(fill * aspect))),
    cssWidth: (FRAME_W * scale) / dpr,
    cssHeight: (FRAME_H * aspect * scale) / dpr,
    exact,
  };
}
