// The hero: a state machine for standing, walking, turning, jumping, falling
// and landing, plus screen changes at the playfield edges.
// Ported from PyElectroMan emhero.py (PlayerEntity) and emgame.py (FSM),
// which follow EB_HERO.C of the original. Values are in original pixels
// (PyElectroMan's are doubled).
//
// The state functions keep PyElectroMan's control flow on purpose, quirks
// included (e.g. entering "stand" in mid-air runs the first fall step twice),
// so that verify-hero can compare trajectories tick by tick.

import { MAP_COLS, SCREEN_COLS, SCREEN_ROWS, TILE } from '../data/types.ts';
import { checkMove, groundDistance, rectsOverlap, type Rect, type SolidBox } from './collision.ts';
import { TOUCH, type SimObject } from './objects.ts';
import type { BorlandRandom } from './random.ts';

/** Controller bits, sampled once per tick. */
export const INPUT = { left: 1, right: 2, up: 4, down: 8, fire: 16 } as const;

const MOVE_STEP = 4;
const JUMP_STEPS = [10, 9, 8, 6, 5, 4, 3, 2, 1, 0];
const FALL_STEPS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 24];
const MAX_X = SCREEN_COLS * TILE;
const MAX_Y = SCREEN_ROWS * TILE;
/** Ticks the hero stays frozen after appearing from a teleport (EB_HERO.C:134). */
const TELEPORT_TIME = 12;

/** One collision box for every hero sprite: narrow, two tiles tall. */
export const HERO_BOX = { x: 8, y: 6, w: 8, h: 42 } as const;
const HERO_CENTER_X = HERO_BOX.x + HERO_BOX.w / 2;
const HERO_BOTTOM = HERO_BOX.y + HERO_BOX.h;

/** Animations as [top, bottom] sprite pairs from the hero set; the hero is drawn as two tiles. */
export const HERO_ANIMS = {
  LSTAND: [[0, 1]],
  RSTAND: [[2, 3]],
  LWALK: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((b) => [4, b]),
  RWALK: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25].map((b) => [15, b]),
  TURN: [
    [26, 29],
    [27, 30],
    [28, 31],
  ],
  LLAND: [[32, 33]],
  RLAND: [[34, 35]],
  LJUMP: [[4, 8]],
  RJUMP: [[15, 19]],
  TELE: [36, 37, 38, 39, 40, 41].map((t) => [t, t + 6]),
} as const satisfies Record<string, readonly (readonly [number, number])[]>;

export type HeroAnim = keyof typeof HERO_ANIMS;
export type HeroState =
  | 'stand'
  | 'move'
  | 'turn'
  | 'beforeJump'
  | 'jump'
  | 'fall'
  | 'land'
  | 'teleportOut'
  | 'teleportIn'
  | 'death';

/** Where a teleport takes the hero: the target teleport's base tile. */
export interface TeleportTarget {
  screen: number;
  x: number;
  y: number;
}

export interface Hero {
  /** Top-left corner of the two-tile sprite, playfield pixels. */
  x: number;
  y: number;
  state: HeroState;
  /** State to enter on the next tick. */
  next: HeroState | null;
  anim: HeroAnim;
  frame: number;
  /** 0 facing left, 1 facing right. */
  orientation: 0 | 1;
  moveX: number;
  moveY: number;
  /** Distance from the hero's feet to the ground below. */
  toGround: number;
  /** Index into the jump or fall steps. */
  jump: number;
  counter: number;
  turnStep: 1 | -1;
  deathTimer: number;
  teleportTarget: TeleportTarget | null;
  /** Ticks left frozen after a teleport; -1 while still fading in. */
  waitCounter: number;
}

/** An object the hero can touch this tick, with its box and touch type. */
export interface Touchable {
  object: SimObject;
  box: Rect;
  touch: number;
}

/** What the hero sees of the world during one tick. */
export interface HeroContext {
  input: number;
  /** Solid tiles of the screen the tick started on. */
  solids: readonly SolidBox[];
  /** Set once any killing floor has opened (until respawn). */
  killingFloor(): boolean;
  rng: BorlandRandom;
  /** Objects of the screen the tick started on that can be touched. */
  touchables: readonly Touchable[];
  /** Filled during the tick: everything the hero touched, in order (duplicates possible). */
  touched: Touchable[];
  screen(): number;
  changeScreen(screen: number): void;
  respawn(): void;
  /** The teleport a teleport at (x, y) leads to (PlayerEntity.find_teleport_target). */
  teleportTarget(x: number, y: number): TeleportTarget | null;
}

export function createHero(): Hero {
  return {
    x: 0,
    y: 0,
    state: 'stand',
    next: null,
    anim: 'RSTAND',
    frame: 0,
    orientation: 1,
    moveX: 0,
    moveY: 0,
    toGround: 0,
    jump: 0,
    counter: 0,
    turnStep: 1,
    deathTimer: 0,
    teleportTarget: null,
    waitCounter: -1,
  };
}

/** Put the hero's feet at the middle of the bottom edge of the tile at (x, y). */
export function standOnTile(hero: Hero, x: number, y: number): void {
  hero.x = x + TILE / 2 - HERO_CENTER_X;
  hero.y = y + TILE - HERO_BOTTOM;
}

export function heroSprites(hero: Hero): readonly [number, number] | null {
  if (hero.state === 'death') return null;
  return HERO_ANIMS[hero.anim][hero.frame] ?? null;
}

export function updateHero(h: Hero, c: HeroContext): void {
  if (h.state !== 'death') touchAt(h, c, 0, 0);
  h.toGround = groundDistance(HERO_BOX, h.x, h.y, c.solids);
  if (h.next) {
    const s = h.next;
    h.next = null;
    switchState(h, s, c);
  } else {
    run(h, h.state, false, c);
  }
  checkBounds(h, c);
  handleTouch(h, c);
}

/** Record the objects the hero's box overlaps at an offset from its position. */
function touchAt(h: Hero, c: HeroContext, dx: number, dy: number): void {
  if (c.touchables.length === 0) return;
  const me = { x: h.x + dx + HERO_BOX.x, y: h.y + dy + HERO_BOX.y, w: HERO_BOX.w, h: HERO_BOX.h };
  for (const t of c.touchables) if (rectsOverlap(me, t.box)) c.touched.push(t);
}

/**
 * React to touched objects (PlayerEntity.handle_touch). So far only
 * teleports: Down while standing or walking on one starts it. Batteries,
 * disks, checkpoints, killers and exits come in step 6.
 */
function handleTouch(h: Hero, c: HeroContext): void {
  const seen = new Set<SimObject>();
  for (const t of c.touched) {
    if (seen.has(t.object)) continue;
    seen.add(t.object);
    if (t.touch === TOUCH.teleport && held(c, INPUT.down) && (h.state === 'stand' || h.state === 'move')) {
      h.teleportTarget = c.teleportTarget(t.object.x, t.object.y);
      newState(h, 'teleportOut');
    }
  }
}

/** Enter a state now (its start-up code runs in this tick). */
export function switchState(h: Hero, s: HeroState, c: HeroContext): void {
  h.state = s;
  run(h, s, true, c);
}

const newState = (h: Hero, s: HeroState): void => {
  h.next = s;
};

const held = (c: HeroContext, bit: number): boolean => (c.input & bit) !== 0;
const side = <L, R>(h: Hero, left: L, right: R): L | R => (h.orientation === 0 ? left : right);

function run(h: Hero, s: HeroState, init: boolean, c: HeroContext): void {
  switch (s) {
    case 'stand':
      return stand(h, init, c);
    case 'move':
      return move(h, init, c);
    case 'turn':
      return turn(h, init);
    case 'beforeJump':
      return beforeJump(h, init);
    case 'jump':
      return jump(h, init, c);
    case 'fall':
      return fall(h, init, c);
    case 'land':
      return land(h, init);
    case 'teleportOut':
      return teleportOut(h, init);
    case 'teleportIn':
      return teleportIn(h, init, c);
    case 'death':
      return death(h, init, c);
  }
}

function stand(h: Hero, init: boolean, c: HeroContext): void {
  if (init) {
    h.moveX = 0;
    h.moveY = 0;
    if (h.toGround > 0) switchState(h, 'fall', c);
    h.anim = side(h, 'LSTAND', 'RSTAND');
    h.frame = 0;
  }
  if (h.toGround > 0) return switchState(h, 'fall', c);
  if (held(c, INPUT.left) || held(c, INPUT.right)) return switchState(h, 'move', c);
  if (held(c, INPUT.up)) return switchState(h, 'beforeJump', c);
}

function move(h: Hero, init: boolean, c: HeroContext): void {
  if (init) {
    h.anim = side(h, 'LWALK', 'RWALK');
    h.frame = 0;
  }
  if (h.toGround > 0) return switchState(h, 'fall', c);
  if (held(c, INPUT.up)) return newState(h, 'beforeJump');
  if (held(c, INPUT.left)) {
    if (h.orientation === 1) return switchState(h, 'turn', c);
    h.moveX = -MOVE_STEP;
  } else if (held(c, INPUT.right)) {
    if (h.orientation === 0) return switchState(h, 'turn', c);
    h.moveX = MOVE_STEP;
  } else {
    return switchState(h, 'stand', c);
  }
  const moved = moveBy(h, c);
  if (moved.x !== 0) {
    h.frame = (h.frame + 1) % HERO_ANIMS[h.anim].length;
  } else {
    // Against a wall: stand still facing it.
    h.anim = side(h, 'LSTAND', 'RSTAND');
    h.frame = 0;
    h.moveX = 0;
  }
}

function turn(h: Hero, init: boolean): void {
  if (init) {
    h.orientation = h.orientation === 1 ? 0 : 1;
    h.anim = 'TURN';
    h.frame = h.orientation === 1 ? 0 : 2;
    h.turnStep = h.orientation === 1 ? 1 : -1;
    return;
  }
  const next = h.frame + h.turnStep;
  if (next < 0 || next >= HERO_ANIMS.TURN.length) return newState(h, 'move');
  h.frame = next;
}

/** Two ticks crouching before the jump. */
function beforeJump(h: Hero, init: boolean): void {
  if (init) {
    h.counter = 0;
    h.anim = side(h, 'LLAND', 'RLAND');
    h.frame = 0;
  }
  h.counter += 1;
  if (h.counter === 2) newState(h, 'jump');
}

function jump(h: Hero, init: boolean, c: HeroContext): void {
  if (init) {
    // The direction held when the jump starts decides it; with none, the walking direction is kept.
    if (held(c, INPUT.left)) {
      h.moveX = -MOVE_STEP;
      h.orientation = 0;
    }
    if (held(c, INPUT.right)) {
      h.moveX = MOVE_STEP;
      h.orientation = 1;
    }
    h.jump = 0;
    h.anim = side(h, 'LJUMP', 'RJUMP');
    h.frame = 0;
  }
  const up = -JUMP_STEPS[h.jump]!;
  const climbed = checkMove(HERO_BOX, h.x, h.y, 0, up, c.solids, false, probe(h, c));
  h.x += climbed.x;
  h.y += climbed.y;
  if (climbed.y > up || up === 0) newState(h, 'fall'); // hit the ceiling or reached the top
  const sideways = checkMove(HERO_BOX, h.x, h.y, h.moveX, 0, c.solids, false, probe(h, c));
  h.x += sideways.x;
  h.y += sideways.y;
  h.jump += 1;
}

function fall(h: Hero, init: boolean, c: HeroContext): void {
  if (init) {
    h.anim = side(h, 'LJUMP', 'RJUMP');
    h.frame = 0;
    h.moveY = 0;
    h.jump = 0;
  }
  if (c.killingFloor() && h.y + HERO_BOTTOM > MAX_Y - TILE) return newState(h, 'death');
  if (h.toGround === 0) return switchState(h, 'land', c);
  h.moveY = Math.min(FALL_STEPS[h.jump]!, h.toGround);
  const moved = moveBy(h, c);
  h.moveX = moved.x; // a wall stops the sideways drift
  h.jump += 1;
  if (h.jump === FALL_STEPS.length) {
    // Top speed reached: keep it, and drop straight down.
    h.moveX = 0;
    h.jump -= 1;
  }
}

/** Two ticks crouching after a fall. */
function land(h: Hero, init: boolean): void {
  if (init) h.counter = 2;
  h.anim = side(h, 'LLAND', 'RLAND');
  h.frame = 0;
  h.counter -= 1;
  if (h.counter === 0) newState(h, 'stand');
}

/** Fading out over six ticks, then to the target. */
function teleportOut(h: Hero, init: boolean): void {
  if (init) {
    h.anim = 'TELE';
    h.counter = HERO_ANIMS.TELE.length - 1;
    h.frame = 0;
    return;
  }
  if (h.counter === 0) return newState(h, 'teleportIn');
  h.frame += 1;
  h.counter -= 1;
}

/** At the target: fading in, then frozen for TELEPORT_TIME ticks. */
function teleportIn(h: Hero, init: boolean, c: HeroContext): void {
  const target = h.teleportTarget;
  if (target) {
    if (target.screen !== c.screen()) c.changeScreen(target.screen);
    // Standing on the target teleport's base: feet at its top edge.
    h.x = target.x;
    h.y = target.y - 2 * TILE;
  }
  if (init) {
    h.anim = 'TELE';
    h.counter = HERO_ANIMS.TELE.length - 1;
    h.frame = HERO_ANIMS.TELE.length - 1;
    h.waitCounter = -1;
    return;
  }
  if (h.waitCounter >= 0) {
    if (h.waitCounter === 0) return newState(h, 'stand');
    h.waitCounter -= 1;
  } else if (h.counter === 0) {
    h.waitCounter = TELEPORT_TIME;
  } else {
    h.frame -= 1;
    h.counter -= 1;
  }
}

/**
 * Killed: hidden for 70 ticks, then back at the checkpoint. Explosions and
 * sound come with weapons (step 7); the generator is drawn as they would.
 */
function death(h: Hero, init: boolean, c: HeroContext): void {
  if (init) h.deathTimer = 0;
  h.deathTimer += 1;
  if (h.deathTimer < 10) {
    c.rng.random(24);
    c.rng.random(24);
  } else if (h.deathTimer >= 70) {
    c.respawn();
  }
}

/** Touches along a move are collected at every sample, as the hero passes. */
const probe =
  (h: Hero, c: HeroContext) =>
  (dx: number, dy: number): void =>
    touchAt(h, c, dx, dy);

function moveBy(h: Hero, c: HeroContext): { x: number; y: number } {
  const moved = checkMove(HERO_BOX, h.x, h.y, h.moveX, h.moveY, c.solids, true, probe(h, c));
  h.x += moved.x;
  h.y += moved.y;
  return moved;
}

/**
 * Leaving the playfield: falling below it enters the screen underneath;
 * the hero's middle crossing the left or right edge enters the neighbour.
 * Screen numbers wrap around the 16x16 map. There is no exit upwards.
 */
function checkBounds(h: Hero, c: HeroContext): void {
  const below = h.y + HERO_BOTTOM - MAX_Y;
  if (below > 0) {
    const s = c.screen();
    c.changeScreen(s < 240 ? s + MAP_COLS : s - 240);
    h.y = below - HERO_BOTTOM;
  }
  const center = h.x + HERO_CENTER_X;
  const s = c.screen();
  if (center < 0) {
    c.changeScreen(s > 0 ? s - 1 : 255);
    h.x += MAX_X;
  } else if (center > MAX_X) {
    c.changeScreen(s < 255 ? s + 1 : 0);
    h.x -= MAX_X;
  }
}
