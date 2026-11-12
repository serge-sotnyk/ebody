// Game state advanced in fixed 20 Hz ticks. No DOM here, so the same code
// runs in the browser and in Node tests.

import { startCheckpoint, type TilePlace } from '../data/levels.ts';
import type { LevelFile } from '../data/types.ts';
import { groundDistance, solidBoxes } from './collision.ts';
import {
  createHero,
  HERO_BOX,
  standOnTile,
  switchState,
  updateHero,
  type Hero,
  type HeroContext,
  type TeleportTarget,
  type Touchable,
} from './hero.ts';
import { ACTION, objectBox, objectTouch, objectTouchable } from './objects.ts';
import { BorlandRandom } from './random.ts';
import { enterRoom, screenLayout, stepRoom, type MapRemoval, type Room } from './room.ts';
import type { LevelSprites } from './tiles.ts';
import { MAP_COLS, SCREEN_COUNT, SCREEN_ROWS, TILE } from '../data/types.ts';

/** Ticks per second, as in PyElectroMan and (by eye) the DOS game; see docs/fidelity.md R5. */
export const TICK_HZ = 20;

export interface WorldOptions {
  /** Screen to start on; default: the level start. */
  screen?: number;
  /** Without a hero only the objects run (used to compare object animation). */
  hero?: boolean;
}

export class World {
  readonly rng = new BorlandRandom();
  /** Ticks since the level started (the original's main counter). */
  tick = 0;
  room: Room;
  hero: Hero | null;
  /** The level start checkpoint, where the hero appears and returns after dying. */
  readonly start: TilePlace;
  /** Set when a killing floor opens; falling low then kills, on any screen, until respawn. */
  killingFloor = false;
  /**
   * Objects removed from the level map, by screen. The original keeps a
   * working copy of the map that objects are deleted from, and restores it
   * when the hero dies (PyElectroMan ScreenManager.delete_object, reset_level).
   */
  private removed = new Map<number, MapRemoval[]>();

  constructor(
    readonly level: LevelFile,
    readonly sprites: LevelSprites,
    options: WorldOptions = {},
  ) {
    this.start = startCheckpoint(level, sprites) ?? { screen: 0, x: 0, y: 0 };
    this.room = enterRoom(level, sprites, this.rng, options.screen ?? this.start.screen);
    this.hero = options.hero === false ? null : createHero();
    if (this.hero) standOnTile(this.hero, this.start.x, this.start.y);
  }

  /**
   * Switch to another screen. Its objects start from their initial state on
   * every visit for now; whether the original keeps them is open (fidelity G3).
   */
  enter(screen: number): void {
    this.room = enterRoom(this.level, this.sprites, this.rng, screen, this.removed.get(screen));
  }

  /** Put a fresh hero on a tile of a screen, standing (tests and the reference comparison). */
  placeHero(place: TilePlace): void {
    this.removed.clear();
    this.enter(place.screen);
    this.hero = createHero();
    standOnTile(this.hero, place.x, place.y);
    this.killingFloor = false;
  }

  /** One tick with the given controller bits (INPUT): objects first, then the hero. */
  step(input = 0): void {
    for (const o of stepRoom(this.room, this.sprites, this.rng)) {
      const list = this.removed.get(this.room.screen) ?? [];
      list.push({ x: o.x, y: o.y });
      this.removed.set(this.room.screen, list);
    }
    if (this.room.killingFloor) this.killingFloor = true;
    const hero = this.hero;
    if (hero) {
      const ctx: HeroContext = {
        input,
        // Fixed for the whole tick, even if the hero changes screens meanwhile (as in PyElectroMan).
        solids: solidBoxes(this.room, this.sprites),
        killingFloor: () => this.killingFloor,
        rng: this.rng,
        touchables: this.touchables(),
        touched: [],
        screen: () => this.room.screen,
        changeScreen: (screen) => this.enter(screen),
        respawn: () => this.respawn(hero, ctx),
        teleportTarget: (x, y) => this.teleportTarget(x, y),
      };
      updateHero(hero, ctx);
    }
    this.tick += 1;
  }

  private touchables(): Touchable[] {
    const list: Touchable[] = [];
    for (const object of this.room.objects) {
      if (!objectTouchable(object, this.sprites)) continue;
      list.push({ object, box: objectBox(object, this.sprites), touch: objectTouch(object, this.sprites) });
    }
    return list;
  }

  /**
   * The first teleport above (x, y) in the same column: higher up on this
   * screen, else on the screens above, going up the map and wrapping around
   * to the bottom row (PlayerEntity.find_teleport_target). On screens above,
   * the top row is not searched, as in PyElectroMan.
   */
  private teleportTarget(x: number, y: number): TeleportTarget | null {
    let screen = this.room.screen;
    let from = y;
    for (let i = 0; i <= SCREEN_COUNT / MAP_COLS; i++) {
      const bases = new Set<number>();
      for (const t of screenLayout(this.level, this.sprites, screen).objects) {
        if (t.x === x && this.sprites.get(t.sprite)?.action === ACTION.teleport) bases.add(t.y);
      }
      for (let ty = from; ty > 0; ty -= TILE) if (bases.has(ty)) return { screen, x, y: ty };
      from = (SCREEN_ROWS + 1) * TILE;
      screen = (screen - MAP_COLS + SCREEN_COUNT) % SCREEN_COUNT;
    }
    return null;
  }

  /** Back to the level start after dying (PyElectroMan PlayerEntity.respawn); checkpoints come in step 6. */
  private respawn(hero: Hero, ctx: HeroContext): void {
    this.removed.clear(); // the level map is restored
    this.enter(this.start.screen);
    standOnTile(hero, this.start.x, this.start.y);
    hero.deathTimer = 0;
    this.killingFloor = false;
    hero.toGround = groundDistance(HERO_BOX, hero.x, hero.y, solidBoxes(this.room, this.sprites));
    switchState(hero, 'stand', ctx);
  }

  /** Plain copy of the whole state, for tests and replays. */
  snapshot(): {
    tick: number;
    rng: number;
    room: Room;
    hero: Hero | null;
    killingFloor: boolean;
    removed: [number, MapRemoval[]][];
  } {
    return structuredClone({
      tick: this.tick,
      rng: this.rng.state,
      room: this.room,
      hero: this.hero,
      killingFloor: this.killingFloor,
      removed: [...this.removed],
    });
  }
}
