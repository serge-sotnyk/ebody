// Animations of the four creature types in the "enem" sprite set
// (PyElectroMan emother.Enemies). A creature's spawner tile picks its type
// with (param & 0x7f) / 3; type 2 flies, the others walk.

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export interface CreatureAnims {
  /** Walking left and right. */
  left: number[];
  right: number[];
  /** Shot sprites when facing left and right. */
  shotLeft: number[];
  shotRight: number[];
}

export const CREATURES: readonly CreatureAnims[] = [
  { left: range(0, 11), right: range(12, 22), shotLeft: [23], shotRight: [24] },
  { left: range(32, 35), right: range(36, 39), shotLeft: [40], shotRight: [41] },
  { left: [42], right: [43], shotLeft: [44], shotRight: [44] },
  { left: range(48, 51), right: range(52, 55), shotLeft: [56], shotRight: [57] },
];

/** The flying creature type. */
export const FLYING = 2;
