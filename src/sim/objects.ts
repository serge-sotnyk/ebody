// Objects placed in a level (tiles with the "active" flag) and their
// animation. Ported from PyElectroMan emgame.py (Cycle, CyclePlus, Pulse,
// PulsePlus, Flash, FlashPlus, FlashSpecial, Monitor, Entity.set_initial_delay)
// and emdata.py (Level.__init_*), which follow EB_ENEM.C of the original.
//
// Frame lookups use Array.prototype.at() on purpose: PyElectroMan indexes with
// Python lists, where -1 means the last element, and a few edge cases rely on it.

import { FLAG } from '../data/sprite-status.ts';
import { TILE, type SpriteInfo } from '../data/types.ts';
import { CREATURES } from './enemy-data.ts';
import type { BorlandRandom } from './random.ts';
import type { LevelSprites, Sheet } from './tiles.ts';

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
 * animate on their own (displays, teleports, checkpoints) and, until later
 * steps port them, rockets, enemies and cannons.
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
  | 'killingFloor'
  /** Shows a blinking indicator above itself once three disks are collected. */
  | 'exit'
  /** The blinking indicator above an exit; touching it with Down ends the level. */
  | 'exitIndicator'
  /** Eight frames from the weapons sprite set, then gone. */
  | 'explosion'
  /** A shot from the hero's weapon (weapons.ts). */
  | 'shot'
  /** What a destroyed object leaves behind; it stays in the level map. */
  | 'broken'
  /** A walking or flying creature (enemies.ts). */
  | 'enemy'
  /** A creature's or cannon's shot; kills the hero on contact. */
  | 'enemyShot'
  /** Fires shots in one direction every so often. */
  | 'cannon'
  /** Waits for the hero to pass under (or over) it, then flies up (down). */
  | 'rocket';

export type { Sheet } from './tiles.ts';

export interface SimObject {
  kind: ObjectKind;
  /**
   * Position in the screen's creation order (screenLayout().objects), used to
   * remove it from the level map; -1 for objects made during play.
   */
  id: number;
  /** Sprite set of `frames`, when not the level's. */
  sheet?: Sheet;
  /** The sprite placed in the level for this object; null for objects made during play. */
  placed: number | null;
  /** Shots: pixels moved per tick (negative to the left) and weapon level 1..5. */
  step?: number;
  level?: number;
  /** Enemy shots and rockets: pixels moved per tick. */
  vx?: number;
  vy?: number;
  /**
   * Creatures, cannons, rockets: 'init' until the first update; creatures
   * then 'patrol' or 'shoot', rockets 'waiting' or 'flying', cannons 'ready'.
   */
  phase?: 'init' | 'patrol' | 'shoot' | 'waiting' | 'flying' | 'ready';
  /** Creatures: type 0..3 (enemy-data.ts), facing right, whether they shoot, patrol range. */
  creature?: number;
  facingRight?: boolean;
  shoots?: boolean;
  left?: number;
  right?: number;
  /** Creatures and cannons: ticks until the next shot; cannons: the base interval. */
  timer?: number;
  interval?: number;
  /** Cannons: firing direction; rockets: -1 up, 1 down. */
  dx?: number;
  dy?: number;
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
  /** Set when the object is gone (a killing floor that fired, a finished explosion). */
  removed: boolean;
}

export interface ObjectContext {
  sprites: LevelSprites;
  rng: BorlandRandom;
  /** Per-screen random bytes, one per tile column (initScreenRandoms). */
  randoms: readonly number[];
  /** Disks collected so far (exits wait for three). */
  disks: number;
  /** The main tick counter (blinking). */
  counter: number;
}

const param = (sprites: LevelSprites, index: number | undefined): number =>
  index === undefined ? 0 : (sprites.get(index)?.param ?? 0);

/** The sprite an object shows now, or null when it is hidden. */
export function objectSprite(o: SimObject): number | null {
  return o.show ? (o.frames.at(o.frame) ?? null) : null;
}

/** What touching an object does (status byte 3). */
export const TOUCH = { none: 0, battery: 1, teleport: 2, checkpoint: 3, killer: 4, floppy: 5, exit: 6, special: 7 } as const;

/** Status of the current frame (a hidden "plus" animation keeps its last frame, as in PyElectroMan). */
export const currentInfo = (o: SimObject, sprites: LevelSprites): SpriteInfo | null => {
  const index = o.frames.at(o.frame);
  return index === undefined ? null : sprites.info(index, o.sheet);
};

/**
 * Can the hero touch this object now? Hidden cycle+/pulse+ animations cannot
 * be touched; hidden flashes can (Entity.is_touchable and its overrides).
 */
export function objectTouchable(o: SimObject, sprites: LevelSprites): boolean {
  // Creatures and their shots kill by their own test (enemies.ts), not by touch.
  if (o.kind === 'enemy' || o.kind === 'enemyShot') return false;
  if ((o.kind === 'cyclePlus' || o.kind === 'pulsePlus') && !o.show) return false;
  const info = currentInfo(o, sprites);
  return info !== null && (info.flags & FLAG.touchable) !== 0;
}

/** Touch type of the current frame; hidden "plus" animations and flash+ report none. */
export function objectTouch(o: SimObject, sprites: LevelSprites): number {
  if (o.kind === 'exitIndicator') return TOUCH.exit;
  if ((o.kind === 'cyclePlus' || o.kind === 'pulsePlus' || o.kind === 'flashPlus') && !o.show) return TOUCH.none;
  return currentInfo(o, sprites)?.touch ?? TOUCH.none;
}

/** Collision box of the current frame, in playfield pixels. */
export function objectBox(o: SimObject, sprites: LevelSprites): { x: number; y: number; w: number; h: number } {
  const b = currentInfo(o, sprites)?.bbox ?? { x: 0, y: 0, w: 0, h: 0 };
  return { x: o.x + b.x, y: o.y + b.y, w: b.w, h: b.h };
}

/** A still object made during play: what a destroyed object leaves behind. */
export function createBroken(frames: number[], frame: number, x: number, y: number): SimObject {
  return { ...blank(-1, 0, x, y, frames), kind: 'broken', frame };
}

/** Explosion sprites: weapons set 0..7 (PyElectroMan emother.Weapons). */
const EXPLOSION_FRAMES = [0, 1, 2, 3, 4, 5, 6, 7];

/** An explosion with its top-left corner at (x, y) (EB_ENEM.C put_explosion). */
export function createExplosion(x: number, y: number): SimObject {
  return { ...blank(-1, 0, x, y, EXPLOSION_FRAMES), kind: 'explosion', sheet: 'weapons' };
}

export const blank = (id: number, action: number, x: number, y: number, frames: number[]): SimObject => ({
  kind: 'static',
  id,
  placed: null,
  action,
  x,
  y,
  frames,
  frame: 0,
  delay: 0,
  show: true,
  dir: 1,
  emptyDelay: 0,
  counter: 0,
  removed: false,
});

/** Create the object for a placed active tile (emdata.py Level.__get_active_entity). */
export function createObject(index: number, x: number, y: number, ctx: ObjectContext, id = -1): SimObject {
  const { sprites } = ctx;
  const info = sprites.get(index);
  const action = info?.action ?? 0;
  const o: SimObject = {
    kind: 'static',
    id,
    placed: index,
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
    case ACTION.exit:
      o.kind = 'exit';
      break;
    case ACTION.killingFloor:
      o.kind = 'killingFloor';
      break;
    case ACTION.checkpoint:
      o.frames = anim();
      o.frame = index - first;
      break;
    case ACTION.cannonLeft:
    case ACTION.cannonRight:
    case ACTION.cannonUp:
    case ACTION.cannonDown: {
      // The animation's last sprite is the shot (EB_ENEM.C:656-657).
      o.kind = 'cannon';
      o.frames = anim();
      o.frame = index - first;
      o.phase = 'init';
      const d = action - ACTION.cannonLeft;
      o.dx = d === 0 ? -1 : d === 1 ? 1 : 0;
      o.dy = d === 2 ? -1 : d === 3 ? 1 : 0;
      break;
    }
    case ACTION.rocketUp:
    case ACTION.rocketDown:
      o.kind = 'rocket';
      o.phase = 'waiting';
      o.dy = action === ACTION.rocketUp ? -1 : 1;
      o.vy = (info.param > 0 ? info.param : 4) * o.dy;
      break;
    case ACTION.enemy: {
      // The spawner tile: type from its param, speed from its touch byte (EB_ENEM.C:1179).
      const type = Math.floor((info.param & 0x7f) / 3);
      const anims = CREATURES[type];
      if (!anims) break;
      o.kind = 'enemy';
      o.sheet = 'enem';
      o.creature = type;
      o.frames = anims.left;
      o.facingRight = false;
      o.shoots = (info.param & 0x80) !== 0;
      o.step = -info.touch;
      o.phase = 'init';
      break;
    }
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

/**
 * Advance an object by one tick. Returns a new object it made (an exit's
 * indicator). Killing floors are handled by the caller.
 */
export function updateObject(o: SimObject, ctx: ObjectContext): SimObject | null {
  const { sprites, rng } = ctx;
  const n = o.frames.length;
  const frameParam = (): number => param(sprites, o.frames.at(o.frame));

  switch (o.kind) {
    case 'explosion':
      o.frame += 1;
      if (o.frame >= n) o.removed = true;
      return null;
    case 'exit':
      // emgame.py Exit.update: once, when the third disk is in.
      if (ctx.disks >= 3 && o.counter === 0 && sprites.get(o.frames[0]! + 1)) {
        o.counter = 1;
        return { ...blank(-1, 0, o.x, o.y - TILE, [o.frames[0]! + 1]), kind: 'exitIndicator' };
      }
      return null;
    case 'exitIndicator':
      // Shown every other four ticks (ExitIndicator.display: counter & 4).
      o.show = (ctx.counter & 0x04) !== 0;
      return null;
    default:
      break;
  }

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
    return null;
  }

  if (o.delay > 0) {
    o.delay -= 1;
    return null;
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
  return null;
}
