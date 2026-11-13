// Fixed-rate game loop on top of requestAnimationFrame.
//
// The screen refreshes 60-144 times a second depending on the monitor, but
// the game logic must advance at a fixed rate (20 ticks a second), or it
// would run at different speeds on different screens. Each animation frame
// adds the elapsed time to an accumulator and runs as many whole ticks as
// fit; the picture is redrawn only after a tick, with no interpolation, like
// the original.

export interface Loop {
  readonly paused: boolean;
  hz: number;
  pause(paused: boolean): void;
  /** Run exactly one tick (for stepping while paused). */
  stepOnce(): void;
  /** Redraw on the next animation frame even without a tick. */
  invalidate(): void;
}

/**
 * At most this much time is caught up at once (after a stall or a hidden
 * tab), so the game slows down rather than jumping ahead.
 */
export const MAX_CATCH_UP_MS = 250;

/** Where the loop gets time and animation frames from; replaceable in tests. */
export interface Scheduler {
  now(): number;
  requestFrame(callback: (now: number) => void): void;
}

const browserScheduler: Scheduler = {
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
};

export function startLoop(
  hz: number,
  tick: () => void,
  render: () => void,
  scheduler: Scheduler = browserScheduler,
): Loop {
  const { requestFrame } = scheduler;
  let last = scheduler.now();
  let acc = 0;
  let dirty = true;
  const loop: Loop = {
    paused: false,
    hz,
    pause(paused: boolean): void {
      (loop as { paused: boolean }).paused = paused;
      acc = 0;
    },
    stepOnce(): void {
      tick();
      dirty = true;
    },
    invalidate(): void {
      dirty = true;
    },
  };

  const frame = (now: number): void => {
    const dt = Math.min(now - last, MAX_CATCH_UP_MS);
    last = now;
    if (!loop.paused) {
      acc += dt;
      const step = 1000 / loop.hz;
      while (acc >= step) {
        tick();
        acc -= step;
        dirty = true;
      }
    }
    if (dirty) {
      render();
      dirty = false;
    }
    requestFrame(frame);
  };
  requestFrame(frame);
  return loop;
}
