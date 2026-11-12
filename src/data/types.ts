// Shapes of the files produced by tools/convert and loaded by the game.
// All coordinates are in original (320x200) pixels.

/** Size of one sprite / tile in pixels. */
export const TILE = 24;
/** Playfield size in tiles. */
export const SCREEN_COLS = 13;
export const SCREEN_ROWS = 8;
/** A level is a 16x16 grid of screens. */
export const MAP_COLS = 16;
export const MAP_ROWS = 16;
export const SCREEN_COUNT = MAP_COLS * MAP_ROWS;
/** Sprites per set; a level combines two sets into indices 0..127. */
export const SET_SIZE = 64;
/** Sprite atlas layout: SET_SIZE cells in an ATLAS_COLUMNS-wide grid. */
export const ATLAS_COLUMNS = 8;

/** Collision box inside a 24x24 cell (original pixels). */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Which sides of the box block movement. */
export interface SolidSides {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

/** One sprite's metadata, decoded from its 8 status bytes. */
export interface SpriteInfo {
  /** Raw status bytes from the original .ggs file. */
  status: number[];
  /** Raw size-table bytes (unused by the game logic, kept for completeness). */
  size: number[];
  flags: number;
  /** Object type (1..21), 0 for plain tiles. */
  action: number;
  init: number;
  param: number;
  touch: number;
  bbox: BBox;
  solid: SolidSides;
}

/** `sprites/<name>.json`; pixels are in `sprites/<name>.png`. */
export interface SpriteSetFile {
  name: string;
  cell: number;
  columns: number;
  /** SET_SIZE entries, null where the original slot is empty. */
  sprites: (SpriteInfo | null)[];
}

/** One plane: SCREEN_COLS*SCREEN_ROWS tile indices (0 = empty, 1..127). */
export type Plane = number[];
/** A screen is 4 planes (any may be absent), or null if the screen is unused. */
export type ScreenPlanes = (Plane | null)[];

/** `levels/<name>.json` */
export interface LevelFile {
  name: string;
  /** Two sprite set names: indices 0..63 use sets[0], 64..127 use sets[1]. */
  sets: [string, string];
  params: number[];
  screens: (ScreenPlanes | null)[];
}

/** `manifest.json`: what the converter produced. */
export interface AssetManifest {
  spriteSets: string[];
  levels: string[];
  sounds: string[];
  screens: string[];
}
