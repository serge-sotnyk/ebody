import { describe, expect, it } from 'vitest';
import { startLoop, type Scheduler } from './loop.ts';

/** Animation frames on demand at chosen times. */
function fakeScheduler(): Scheduler & { frameAt(t: number): void } {
  let pending: ((now: number) => void) | null = null;
  let time = 0;
  return {
    now: () => time,
    requestFrame: (cb) => {
      pending = cb;
    },
    frameAt(t: number) {
      time = t;
      const cb = pending;
      pending = null;
      cb?.(t);
    },
  };
}

function countTicks(fps: number, seconds: number): { ticks: number; renders: number } {
  const s = fakeScheduler();
  let ticks = 0;
  let renders = 0;
  startLoop(20, () => ticks++, () => renders++, s);
  for (let i = 1; i <= fps * seconds; i++) s.frameAt((i * 1000) / fps);
  return { ticks, renders };
}

describe('startLoop', () => {
  it.each([30, 60, 144])('runs 20 ticks a second at %i frames a second', (fps) => {
    const { ticks } = countTicks(fps, 10);
    expect(Math.abs(ticks - 200)).toBeLessThanOrEqual(1);
  });

  it('redraws only after a tick (plus the first frame)', () => {
    const { ticks, renders } = countTicks(60, 1);
    expect(renders).toBe(ticks + 1);
  });

  it('catches up at most 250 ms after a stall', () => {
    const s = fakeScheduler();
    let ticks = 0;
    startLoop(20, () => ticks++, () => {}, s);
    s.frameAt(5000);
    expect(ticks).toBe(5);
  });

  it('does not tick while paused, and steps one tick on request', () => {
    const s = fakeScheduler();
    let ticks = 0;
    const loop = startLoop(20, () => ticks++, () => {}, s);
    loop.pause(true);
    for (let i = 1; i <= 60; i++) s.frameAt((i * 1000) / 60);
    expect(ticks).toBe(0);
    loop.stepOnce();
    expect(ticks).toBe(1);
  });
});
