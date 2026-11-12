// Game state advanced in fixed 20 Hz ticks. No DOM here, so the same code
// runs in the browser and in Node tests.

import { startCheckpoint, type TilePlace } from '../data/levels.ts';
import { MAP_COLS, SCREEN_COUNT, SCREEN_ROWS, TILE, type LevelFile, type SpriteSetFile } from '../data/types.ts';
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
  type TouchEffects,
  type Touchable,
} from './hero.ts';
import { ACTION, createExplosion, objectBox, objectTouch, objectTouchable, type SimObject } from './objects.ts';
import { BorlandRandom } from './random.ts';
import { enterRoom, screenLayout, stepRoom, type MapRemoval, type Room } from './room.ts';
import type { LevelSprites } from './tiles.ts';

/** Ticks per second, as in PyElectroMan and (by eye) the DOS game; see docs/fidelity.md R5. */
export const TICK_HZ = 20;

export interface WorldOptions {
  /** Screen to start on; default: the level start. */
  screen?: number;
  /** Without a hero only the objects run (used to compare object animation). */
  hero?: boolean;
  /**
   * Screens keep their objects' state between visits, as in PyElectroMan,
   * instead of starting them afresh on every visit (docs/fidelity.md G3).
   */
  keepObjects?: boolean;
  /** The weapons sprite set; shots need its collision boxes. */
  weapons?: SpriteSetFile;
}

interface Removal {
  screen: number;
  id: MapRemoval;
}

/** Ids of objects added to the level map during play start here. */
const ADDED_IDS = 1000;

export class World {
  readonly rng = new BorlandRandom();
  /** Ticks since the level started; during a tick, the original's main counter. */
  tick = 0;
  room: Room;
  hero: Hero | null;
  /** The level start checkpoint. */
  readonly start: TilePlace;
  /** Where the hero comes back after dying: the start, then the last checkpoint touched. */
  checkpoint: TilePlace;
  /** Disks collected on this level; the exit opens at three. */
  disks = 0;
  /** Set when a killing floor opens; falling low then kills, on any screen, until respawn. */
  killingFloor = false;
  /** The hero is going out through the exit. */
  exiting = false;
  /** The exit animation has finished: the level is done. */
  completed = false;
  /**
   * Objects removed from the level map. The original keeps a working copy of
   * the map that objects are deleted from, and restores it when the hero
   * dies, except for the disks collected (PyElectroMan reset_level).
   */
  private removed: Removal[] = [];
  private diskRemovals: Removal[] = [];
  /** Objects added to the level map during play (remains of destroyed objects); lost when the hero dies. */
  private added: { screen: number; object: SimObject }[] = [];
  private nextAddedId = ADDED_IDS;
  /** Shots fired this tick; they join the room at its end. */
  private newShots: SimObject[] = [];
  private readonly keepObjects: boolean;
  private readonly weapons: SpriteSetFile | null;
  /** Rooms visited since the level (re)started, when objects keep their state. */
  private rooms = new Map<number, Room>();

  constructor(
    readonly level: LevelFile,
    readonly sprites: LevelSprites,
    options: WorldOptions = {},
  ) {
    this.start = startCheckpoint(level, sprites) ?? { screen: 0, x: 0, y: 0 };
    this.checkpoint = this.start;
    this.keepObjects = options.keepObjects ?? false;
    this.weapons = options.weapons ?? null;
    this.room = this.makeRoom(options.screen ?? this.start.screen);
    this.hero = options.hero === false ? null : createHero();
    if (this.hero) standOnTile(this.hero, this.start.x, this.start.y);
  }

  /**
   * Switch to another screen. Its objects start from their initial state on
   * every visit unless `keepObjects` is set; which one the original does is
   * open (fidelity G3).
   */
  enter(screen: number): void {
    this.room = this.makeRoom(screen);
  }

  private makeRoom(screen: number): Room {
    const removed = this.removed.filter((r) => r.screen === screen).map((r) => r.id);
    const added = this.added.filter((a) => a.screen === screen && !removed.includes(a.object.id)).map((a) => a.object);
    const kept = this.keepObjects ? this.rooms.get(screen) : undefined;
    if (!kept) {
      const room = enterRoom(this.level, this.sprites, this.rng, screen, removed, added);
      if (this.keepObjects) this.rooms.set(screen, room);
      return room;
    }
    // PyElectroMan change_screen: the generator is reseeded and the solid tiles
    // come back from the level (a killing floor's row too); objects keep their
    // state, but those made during play and not in the map (explosions, shots,
    // exit indicators) are gone.
    const fresh = enterRoom(this.level, this.sprites, this.rng, screen, removed);
    kept.solid = fresh.solid;
    kept.killingFloor = false;
    kept.objects = kept.objects.filter((o) => o.id >= 0 && !removed.includes(o.id));
    return kept;
  }

  /** Put a fresh hero on a tile of a screen, standing (tests and the reference comparison). */
  placeHero(place: TilePlace): void {
    this.removed = [];
    this.added = [];
    this.rooms.clear();
    this.enter(place.screen);
    this.hero = createHero();
    standOnTile(this.hero, place.x, place.y);
    this.killingFloor = false;
  }

  /** One tick with the given controller bits (INPUT): objects first, then the hero. */
  step(input = 0): void {
    const screen = this.room.screen;
    stepRoom(this.room, this.sprites, this.rng, {
      disks: this.disks,
      counter: this.tick,
      weapons: this.weapons,
      removeFromMap: (o) => {
        if (o.id >= 0) this.removed.push({ screen, id: o.id });
      },
      addToMap: (o) => {
        o.id = this.nextAddedId++;
        this.added.push({ screen, object: structuredClone(o) });
      },
    });
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
        changeScreen: (s) => this.enter(s),
        respawn: () => this.respawn(hero, ctx),
        // From the teleport's own screen, even if the hero left it during this tick.
        teleportTarget: (x, y) => this.teleportTarget(screen, x, y),
        effects: this.effects(screen),
      };
      updateHero(hero, ctx);
    }
    if (this.newShots.length) {
      // Fired into an empty screen (the hero fell into one this tick), shots are lost.
      if (this.level.screens[this.room.screen]) this.room.objects.push(...this.newShots);
      this.newShots = [];
    }
    this.tick += 1;
  }

  /** The active checkpoint's tile, if it is on the current screen. */
  activeCheckpointHere(): { x: number; y: number } | null {
    const c = this.checkpoint;
    return c.screen === this.room.screen ? c : null;
  }

  private touchables(): Touchable[] {
    const list: Touchable[] = [];
    for (const object of this.room.objects) {
      if (!objectTouchable(object, this.sprites)) continue;
      list.push({ object, box: objectBox(object, this.sprites), touch: objectTouch(object, this.sprites) });
    }
    return list;
  }

  /** Touch effects for objects of `screen`, the screen the tick started on. */
  private effects(screen: number): TouchEffects {
    const remove = (o: SimObject): void => {
      if (o.id >= 0) this.removed.push({ screen, id: o.id });
      if (this.room.screen === screen) this.room.objects = this.room.objects.filter((x) => x !== o);
    };
    return {
      remove,
      takeDisk: (o) => {
        this.disks += 1;
        if (o.id >= 0) this.diskRemovals.push({ screen, id: o.id });
      },
      disks: () => this.disks,
      setCheckpoint: (o) => {
        const c = this.checkpoint;
        if (c.screen === screen && c.x === o.x && c.y === o.y) return false;
        this.checkpoint = { screen, x: o.x, y: o.y };
        return true;
      },
      explode: (x, y) => {
        this.room.objects.push(createExplosion(x, y));
      },
      exitLevel: () => {
        this.exiting = true;
      },
      exiting: () => this.exiting,
      levelDone: () => {
        this.completed = true;
      },
      shoot: (shot) => {
        this.newShots.push(shot);
      },
    };
  }

  /**
   * The first teleport above (x, y) in the same column: higher up on this
   * screen, else on the screens above, going up the map and wrapping around
   * to the bottom row (PlayerEntity.find_teleport_target). On screens above,
   * the top row is not searched, as in PyElectroMan.
   */
  private teleportTarget(start: number, x: number, y: number): TeleportTarget | null {
    let screen = start;
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

  /** Back to the checkpoint after dying (PlayerEntity.respawn, EB.C init_level). */
  private respawn(hero: Hero, ctx: HeroContext): void {
    this.removed = [...this.diskRemovals]; // the level map is restored, collected disks stay gone
    this.added = [];
    this.rooms.clear();
    this.enter(this.checkpoint.screen);
    standOnTile(hero, this.checkpoint.x, this.checkpoint.y);
    hero.power = 0;
    hero.ammo = 0;
    hero.temp = 0;
    hero.deathTimer = 0;
    this.killingFloor = false;
    ctx.touched.length = 0;
    hero.toGround = groundDistance(HERO_BOX, hero.x, hero.y, solidBoxes(this.room, this.sprites));
    switchState(hero, 'stand', ctx);
  }

  /** Plain copy of the whole state, for tests and replays. */
  snapshot() {
    return structuredClone({
      tick: this.tick,
      rng: this.rng.state,
      room: this.room,
      hero: this.hero,
      checkpoint: this.checkpoint,
      disks: this.disks,
      killingFloor: this.killingFloor,
      exiting: this.exiting,
      completed: this.completed,
      removed: this.removed,
      diskRemovals: this.diskRemovals,
      added: this.added,
    });
  }
}
