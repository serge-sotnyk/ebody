// The 320x200 frame buffer and its scaling to the window.

import { computeFit, FRAME_H, FRAME_W, type PixelAspect } from './scale.ts';

export { FRAME_H, FRAME_W };

/**
 * Where the 13x8-tile (312x192) playfield sits inside the frame: the top-left
 * corner, leaving an 8-pixel black strip on the right and at the bottom. There
 * is no panel around it; the status bars are drawn over the playfield.
 * Checked against DOS screenshots, see docs/fidelity.md (R1).
 */
export const PLAYFIELD_X = 0;
export const PLAYFIELD_Y = 0;

export interface Display {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Re-fit the canvas into its container (call on resize). */
  fit(): void;
}

/**
 * Viewer pages: the canvas holds exactly 320x200 pixels and CSS enlarges it
 * by a whole number of physical pixels with nearest-neighbour filtering.
 */
export function createDisplay(canvas: HTMLCanvasElement, container: HTMLElement): Display {
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  canvas.style.imageRendering = 'pixelated';
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.imageSmoothingEnabled = false;

  const fit = (): void => {
    const dpr = window.devicePixelRatio || 1;
    const availW = container.clientWidth * dpr;
    const availH = container.clientHeight * dpr;
    const scale = Math.max(1, Math.floor(Math.min(availW / FRAME_W, availH / FRAME_H)));
    canvas.style.width = `${(FRAME_W * scale) / dpr}px`;
    canvas.style.height = `${(FRAME_H * scale) / dpr}px`;
  };
  fit();
  new ResizeObserver(fit).observe(container);
  window.addEventListener('resize', fit);
  return { canvas, ctx, fit };
}

export interface GameDisplay {
  /** Draw here: an off-screen 320x200 frame. */
  ctx: CanvasRenderingContext2D;
  /** Copy the frame to the visible canvas. */
  present(): void;
  aspect: PixelAspect;
  setAspect(aspect: PixelAspect): void;
}

/**
 * Game page: fills its container as far as the frame's shape allows (see
 * scale.ts). The frame is drawn off-screen at 320x200, enlarged by whole
 * multiples into the visible canvas, and CSS stretches that the rest of the way.
 */
export function createGameDisplay(canvas: HTMLCanvasElement, container: HTMLElement): GameDisplay {
  const frame = document.createElement('canvas');
  frame.width = FRAME_W;
  frame.height = FRAME_H;
  const ctx = frame.getContext('2d', { alpha: false });
  const view = canvas.getContext('2d', { alpha: false });
  if (!ctx || !view) throw new Error('Canvas 2D is not available');
  ctx.imageSmoothingEnabled = false;

  const display: GameDisplay = {
    ctx,
    aspect: 1,
    present(): void {
      view.imageSmoothingEnabled = false;
      view.drawImage(frame, 0, 0, canvas.width, canvas.height);
    },
    setAspect(aspect: PixelAspect): void {
      display.aspect = aspect;
      fit();
    },
  };

  const fit = (): void => {
    const f = computeFit(container.clientWidth, container.clientHeight, window.devicePixelRatio || 1, display.aspect);
    if (canvas.width !== f.canvasWidth || canvas.height !== f.canvasHeight) {
      canvas.width = f.canvasWidth; // resizing clears the canvas
      canvas.height = f.canvasHeight;
    }
    canvas.style.width = `${f.cssWidth}px`;
    canvas.style.height = `${f.cssHeight}px`;
    canvas.style.imageRendering = f.exact ? 'pixelated' : 'auto';
    display.present();
  };
  fit();
  new ResizeObserver(fit).observe(container);
  window.addEventListener('resize', fit);
  // Moving the window to a screen with another pixel density changes devicePixelRatio without a resize.
  const watchDpr = (): void => {
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
      'change',
      () => {
        fit();
        watchDpr();
      },
      { once: true },
    );
  };
  watchDpr();
  return display;
}
