// Objects placed in a level (tiles with the "active" flag) and their
// animation. Ported from PyElectroMan emgame.py (Cycle, CyclePlus, Pulse,
// PulsePlus, Flash, FlashPlus, FlashSpecial, Monitor, Entity.set_initial_delay)
// and emdata.py (Level.__init_*), which follow EB_ENEM.C of the original.
//
// Frame lookups use Array.prototype.at() on purpose: PyElectroMan indexes with
// Python lists, where -1 means the last element, and a few edge cases rely on it.

import { TILE } from '../data/types.ts';
import type { BorlandRandom } from './random.ts';
import type { LevelSprites } from './tiles.ts';

/** Object types selected by a sprite's `action` field. */
export const ACTION = {
  cycle: 1,
  pulse: 2,
  monitor: 3,
  display: 4,
  cyclePlus: 5,
  pulsePlus: 6,
  flashPlus: 7,
  rocketUp: 9,
  rocketDown: 10,
  killingFloor: 11,
  checkpoint: 12,
  teleport: 13,
  flash: 14,
  exit: 15,
  enemy: 16,
  cannonLeft: 17,
  cannonRight: 18,
  cannonUp: 19,
  cannonDown: 20,
  flashSpecial: 21,
} as const;

/**
 * How an object behaves each tick. 'static' covers objects that do not
 * animate on their own (displays, teleports, checkpoints, exits) and, until
 * later steps port them, rockets, enemies and cannons.
 */
export type ObjectKind =
  | 'static'
  | 'cycle'
  | 'cyclePlus'
  | 'pulse'
  | 'pulsePlus'
  | 'flash'
  | 'flashPlus'
  | 'flashSpecial'
  | 'monitor'
  | 'killingFloor';

export interface SimObject {
  kind: ObjectKind;
  /** Action code of the placed sprite. */
  action: number;
  /** Top-left corner in the playfield, original pixels. */
  x: number;
  y: number;
  /** Sprite indices of the object's animation. */
  frames: number[];
  /** Index into `frames`; -1 before the first frame of a "plus" animation. */
  frame: number;
  /** Ticks to wait before the next change. */
  delay: number;
  /** Hidden objects are not drawn (flashes, "plus" animations between runs). */
  show: boolean;
  /** Pulse direction through `frames`. */
  dir: 1 | -1;
  /** Hidden-phase length of "plus" animations: the param of the sprite before the animation. */
  emptyDelay: number;
  /** Monitor: ticks left of a special animation frame. */
  counter: number;
  /** Set when the object removes itself (killing floor). */
  removed: boolean;
}

export interface ObjectContext {
  sprites: LevelSprites;
  rng: BorlandRandom;
  /** Per-screen random bytes, one per tile column (initScreenRandoms). */
  randoms: readonly number[];
}

const param = (sprites: LevelSprites, index: number | undefined): number =>
  index === undefined ? 0 : (sprites.get(index)?.param ?? 0);

/** The sprite an object shows now, or null when it is hidden. */
export function objectSprite(o: SimObject): number | null {
  return o.show ? (o.frames.at(o.frame) ?? null) : null;
}

/** Create the object for a placed active tile (emdata.py Level.__get_active_entity). */
export function createObject(index: number, x: number, y: number, ctx: ObjectContext): SimObject {
  const { sprites } = ctx;
  const info = sprites.get(index);
  const action = info?.action ?? 0;
  const o: SimObject = {
    kind: 'static',
    action,
    x,
    y,
    frames: [index],
    frame: 0,
    delay: 0,
    show: true,
    dir: 1,
    emptyDelay: 0,
    counter: 0,
    removed: false,
  };
  if (!info) return o;

  const [first, last] = sprites.animEnds(index);
  const anim = (): number[] => Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const preceding = param(sprites, first - 1);

  switch (action) {
    case ACTION.cycle:
    case ACTION.pulse:
      o.kind = action === ACTION.cycle ? 'cycle' : 'pulse';
      o.frames = anim();
      o.frame = index - first;
      setInitialDelay(o, info.init, info.param, ctx);
      break;
    case ACTION.cyclePlus:
    case ACTION.pulsePlus:
      o.kind = action === ACTION.cyclePlus ? 'cyclePlus' : 'pulsePlus';
      o.frames = anim();
      o.frame = -1;
      o.show = false;
      o.emptyDelay = preceding;
      setInitialDelay(o, info.init, preceding, ctx);
      break;
    case ACTION.flash:
    case ACTION.flashSpecial:
      o.kind = action === ACTION.flash ? 'flash' : 'flashSpecial';
      o.show = false;
      setInitialDelay(o, info.init, info.param, ctx);
      break;
    case ACTION.flashPlus: {
      // Off-phase and start delay use the param of the sprite before this one.
      const before = index > 0 ? param(sprites, index - 1) : info.param;
      o.kind = 'flashPlus';
      o.show = false;
      o.emptyDelay = before;
      setInitialDelay(o, info.init, before, ctx);
      break;
    }
    case ACTION.monitor:
      o.kind = 'monitor';
      o.frames = anim();
      o.frame = index - first;
      break;
    case ACTION.killingFloor:
      o.kind = 'killingFloor';
      break;
    case ACTION.checkpoint:
    case ACTION.cannonLeft:
    case ACTION.cannonRight:
    case ACTION.cannonUp:
    case ACTION.cannonDown:
      // Static for now; these keep their whole animation for later steps.
      o.frames = anim();
      o.frame = index - first;
      break;
    default:
      break;
  }
  return o;
}

/** Start delay by `init` mode (Entity.set_initial_delay). */
function setInitialDelay(o: SimObject, mode: number, p: number, ctx: ObjectContext): void {
  const col = Math.floor(o.x / TILE);
  const row = Math.floor(o.y / TILE);
  switch (mode) {
    case 0: // diagonal wave
      o.delay = (col + row) % (p + 1);
      break;
    case 1:
      o.delay = col % (p + 1);
      break;
    case 2:
      o.delay = row % (p + 1);
      break;
    case 3:
      o.delay = 0;
      break;
    case 4:
      o.delay = ctx.rng.random(p + 1);
      break;
    case 5:
      o.delay = (ctx.randoms[col] ?? 0) % (p + 1);
      break;
    case 6:
      o.delay = (ctx.randoms[row] ?? 0) % (p + 1);
      break;
    case 7: // random start frame
      o.frame = ctx.rng.random(o.frames.length);
      o.delay = 0;
      break;
  }
}

/** Advance an animated object by one tick. Static objects and killing floors are handled by the caller. */
export function updateObject(o: SimObject, ctx: ObjectContext): void {
  const { sprites, rng } = ctx;
  const n = o.frames.length;
  const frameParam = (): number => param(sprites, o.frames.at(o.frame));

  if (o.kind === 'monitor') {
    // Flicker between the first two frames; rarely play a longer "special" frame.
    if (o.counter === 0) {
      o.frame = rng.random(Math.min(2, n));
      if (n > 2 && rng.random(128) === 0) {
        o.frame = rng.random(n - 2) + 2;
        const p = frameParam();
        if (p > 0) o.counter = p + rng.random(p);
      }
    } else {
      o.counter -= 1;
      if (o.counter === 0) o.frame = 0;
    }
    return;
  }

  if (o.delay > 0) {
    o.delay -= 1;
    return;
  }

  switch (o.kind) {
    case 'cycle':
      o.frame = (o.frame + 1) % n;
      o.delay = frameParam();
      break;
    case 'pulse':
      o.frame += o.dir;
      if (o.frame < 0) {
        o.frame = 0;
        o.dir = -o.dir as 1 | -1;
      } else if (o.frame === n) {
        o.frame -= 1;
        o.dir = -o.dir as 1 | -1;
      }
      o.delay = frameParam();
      break;
    case 'cyclePlus':
      o.show = true;
      o.frame += 1;
      if (o.frame === n) {
        o.frame = -1;
        o.show = false;
      }
      o.delay = o.show ? frameParam() : o.emptyDelay;
      break;
    case 'pulsePlus':
      o.show = true;
      o.frame += o.dir;
      if (o.frame < 0) {
        o.frame = -1;
        o.show = false;
        o.dir = 1;
      } else if (o.frame === n) {
        o.frame -= 2;
        o.dir = -1;
      }
      o.delay = o.show ? frameParam() : o.emptyDelay;
      break;
    case 'flash':
      o.show = !o.show;
      o.delay = frameParam();
      break;
    case 'flashPlus':
      o.show = !o.show;
      o.delay = o.show ? frameParam() : o.emptyDelay;
      break;
    case 'flashSpecial':
      o.show = !o.show;
      o.delay = 2;
      break;
    default:
      break;
  }
}
