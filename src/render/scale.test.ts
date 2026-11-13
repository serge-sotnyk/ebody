import { describe, expect, it } from 'vitest';
import { computeFit } from './scale.ts';

describe('computeFit', () => {
  it('uses a whole multiple when it fills most of the space (1920x1080 monitor)', () => {
    // Fill would be 5.4x; 5x covers 93% of the height.
    expect(computeFit(1920, 1080, 1)).toEqual({
      canvasWidth: 1600,
      canvasHeight: 1000,
      cssWidth: 1600,
      cssHeight: 1000,
      exact: true,
    });
  });

  it('counts physical pixels on high-density screens', () => {
    // 1440x860 CSS at 2x = 2880x1720 physical: fill 8.6x, 8x covers 93%.
    const fit = computeFit(1440, 860, 2);
    expect(fit.exact).toBe(true);
    expect(fit.canvasWidth).toBe(2560);
    expect(fit.cssWidth).toBe(1280);
  });

  it('fills a phone in landscape, enlarging by whole multiples first (844x390 at 3x)', () => {
    // Fill 5.85x; 5x would cover only 85%.
    const fit = computeFit(844, 390, 3);
    expect(fit.exact).toBe(false);
    expect(fit.canvasWidth).toBe(1600);
    expect(fit.canvasHeight).toBe(1000);
    expect(fit.cssHeight).toBeCloseTo(390);
    expect(fit.cssWidth).toBeCloseTo(624);
  });

  it('can show 4:3 monitor pixels (1.2 times taller)', () => {
    const fit = computeFit(1280, 960, 1, 1.2);
    expect(fit.cssWidth).toBeCloseTo(1280);
    expect(fit.cssHeight).toBeCloseTo(960);
    expect(fit.exact).toBe(false);
  });

  it('shrinks to fit a window smaller than the frame', () => {
    const fit = computeFit(200, 100, 1);
    expect(fit.canvasWidth).toBe(320);
    expect(fit.cssWidth).toBeCloseTo(160);
  });
});
