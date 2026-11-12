// Deliberate changes to original data, applied during conversion.
// Each entry documents why it exists. Status bytes are 8 per sprite.

interface StatusPatch {
  set: string;
  sprite: number;
  /** Replacement for the sprite's 8 status bytes. */
  status: number[];
  reason: string;
}

export const STATUS_PATCHES: StatusPatch[] = [
  {
    set: 'elek1',
    sprite: 38,
    // Original bytes: [224, 1, 0, 4, 0, 0, 0, 0] — active + touchable + shootable
    // "cycle" object that kills on touch, with an empty collision box.
    status: [0, 0, 0, 0, 0, 0, 0, 0],
    reason:
      'PyElectroMan commit c37dfe5 (2010) zeroed this sprite\'s status as "random data". ' +
      'It is placed twice on level elek, screen 44. Kept to match PyElectroMan; ' +
      'to be checked against the DOS game (docs/fidelity.md).',
  },
];

export function applySpritePatches(set: string, status: readonly number[]): number[] {
  const out = [...status];
  for (const patch of STATUS_PATCHES) {
    if (patch.set !== set) continue;
    if (patch.status.length !== 8) throw new Error(`bad patch for ${set}#${patch.sprite}`);
    out.splice(patch.sprite * 8, 8, ...patch.status);
  }
  return out;
}
