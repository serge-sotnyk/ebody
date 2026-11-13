import { describe, expect, it } from 'vitest';
import { padLayout } from './pad-layout.ts';

describe('padLayout', () => {
  it('phone in landscape (740x360): strips beside the picture, a wide rocker reaching a little over it', () => {
    const l = padLayout(740, 360);
    expect(l.mode).toBe('beside');
    expect(l.rockerW).toBeGreaterThanOrEqual(l.side - 2 * l.gap);
    expect(l.rockerW).toBeGreaterThanOrEqual(Math.round(2.2 * l.btn));
    // It reaches over the picture by less than a button.
    expect(l.rockerW - (l.side - 2 * l.gap)).toBeLessThan(l.btn);
    expect(l.rockerH).toBeLessThan(1.5 * l.btn);
    // The picture keeps most of the height: (740 - 2 * side) / 320 * 200.
    expect(((740 - 2 * l.side) / 320) * 200).toBeGreaterThan(0.9 * 360);
  });

  it('wider phone (892x412): the picture fills the height, the strips take the rest', () => {
    const l = padLayout(892, 412);
    expect(l.mode).toBe('beside');
    const pictureW = (412 / 200) * 320;
    // The strips are at least what the full-height picture leaves.
    expect(2 * l.side).toBeGreaterThanOrEqual(892 - pictureW - 1);
    expect(l.rockerW).toBeGreaterThanOrEqual(Math.round(1.6 * l.btn));
  });

  it('beside, the buttons grow to fill the strips', () => {
    const l = padLayout(892, 412);
    expect(l.big).toBeGreaterThan(l.btn);
    expect(l.big).toBeLessThanOrEqual(l.side - 2 * l.gap);
    // Left column (fire above the rocker) and right column (three buttons) fit under the corner buttons.
    expect(l.big + l.rockerH + 3 * l.gap + 50).toBeLessThanOrEqual(412);
    expect(3 * l.big + 4 * l.gap + 50).toBeLessThanOrEqual(412);
  });

  it('4:3 tablet (1024x768): buttons below, the picture down to the middle of their bottom row', () => {
    const l = padLayout(1024, 768);
    expect(l.mode).toBe('below');
    expect(l.bottom).toBe(Math.round(l.rockerH / 2) + l.gap);
    // The picture fills the width: 1024 / 320 * 200 = 640 tall.
    expect(Math.min(1024 / 320, (768 - l.bottom) / 200) * 200).toBe(640);
  });

  it('wide tablet (1280x768): narrow black bands beside a picture at least 1100 wide', () => {
    const l = padLayout(1280, 768);
    expect(l.mode).toBe('below');
    const pictureW = Math.min(1280 / 320, (768 - l.bottom) / 200) * 320;
    expect(pictureW).toBeGreaterThanOrEqual(1100);
  });

  it('the rocker never grows past 3.2 buttons, even on a very wide screen', () => {
    const l = padLayout(1200, 360);
    expect(l.mode).toBe('beside');
    expect(l.rockerW).toBeLessThanOrEqual(Math.round(3.2 * l.btn));
  });
});
