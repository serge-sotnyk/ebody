// The 320x200 frame buffer and its scaling to the window.
//
// The game draws into a canvas of exactly 320x200 pixels. CSS then enlarges
// that canvas by a whole number of *physical* pixels with nearest-neighbour
// filtering, so every original pixel becomes a crisp square of equal size.

export const FRAME_W = 320;
export const FRAME_H = 200;

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
