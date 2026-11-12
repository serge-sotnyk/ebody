// The object list of a room, coded as in pyem.py object_coder: 'x,y:sprite'
// with the sprite as a level index, 'w' + weapons index, 'e' + enem index, or
// '-' when hidden.

import { objectSprite, type SimObject } from '../../src/sim/objects.ts';

const PREFIX = { weapons: 'w', enem: 'e', info: 'i' } as const;

export function objectCodes(objects: readonly SimObject[]): string {
  return objects
    .map((o) => {
      const s = o.kind === 'exitIndicator' ? o.frames[0]! : objectSprite(o);
      return `${o.x},${o.y}:${s === null ? '-' : o.sheet ? `${PREFIX[o.sheet]}${s}` : s}`;
    })
    .join(' ');
}
