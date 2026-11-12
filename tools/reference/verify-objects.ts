// npm run verify-objects
// Runs PyElectroMan's object code headless (trace_objects.py) and checks that
// our simulation has the same objects showing the same sprites on every screen
// of every game level, tick by tick, without a hero: animations, cannons and
// their shots, creatures on patrol and their shots, explosions.
//
// Needs a PyElectroMan checkout (../pyelectroman or $PYELECTROMAN_DIR) and a
// Python with pygame ($PYELECTROMAN_PYTHON, default ../pyelectroman-venv/bin/python).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { GAME_LEVELS } from '../../src/data/levels.ts';
import type { LevelFile, SpriteSetFile } from '../../src/data/types.ts';
import { LevelSprites } from '../../src/sim/tiles.ts';
import { World } from '../../src/sim/world.ts';
import { GENERATED_DATA, PYELECTROMAN, ROOT } from '../convert/paths.ts';
import { objectCodes } from './codes.ts';

const TICKS = Number(process.env.TRACE_TICKS ?? 400);
const python = process.env.PYELECTROMAN_PYTHON ?? resolve(ROOT, '../pyelectroman-venv/bin/python');

/** Object codes per tick, per screen, per level. */
type Trace = Record<string, Record<string, string[]>>;

console.log(`tracing PyElectroMan objects for ${TICKS} ticks...`);
const tracePath = join(mkdtempSync(join(tmpdir(), 'ebody-trace-')), 'trace.json');
execFileSync(python, [join(import.meta.dirname, 'trace_objects.py'), PYELECTROMAN, String(TICKS), tracePath], {
  stdio: 'inherit',
});
const trace = JSON.parse(readFileSync(tracePath, 'utf8')) as Trace;

const readJson = <T>(...p: string[]): T => JSON.parse(readFileSync(join(GENERATED_DATA, ...p), 'utf8')) as T;
const sheets = { weapons: readJson<SpriteSetFile>('sprites', 'weapons.json'), enem: readJson<SpriteSetFile>('sprites', 'enem.json') };
let failures = 0;

for (const name of GAME_LEVELS) {
  const level = readJson<LevelFile>('levels', `${name}.json`);
  const sprites = new LevelSprites(
    [readJson<SpriteSetFile>('sprites', `${level.sets[0]}.json`), readJson<SpriteSetFile>('sprites', `${level.sets[1]}.json`)],
    sheets,
  );
  const screens = trace[name] ?? {};
  let objects = 0;
  let bad = 0;
  for (const [screen, ticks] of Object.entries(screens)) {
    const world = new World(level, sprites, { screen: Number(screen), hero: false });
    objects += world.room.objects.length;
    for (let t = 0; t < ticks.length; t++) {
      const ours = objectCodes(world.room.objects);
      if (ticks[t] !== ours) {
        bad++;
        if (bad <= 5) {
          console.error(`FAIL ${name} screen ${screen} tick ${t}\n  theirs ${ticks[t]}\n  ours   ${ours}`);
          if (t > 0) console.error(`  before ${ticks[t - 1]}`);
        }
        break;
      }
      world.step();
    }
  }
  const count = Object.keys(screens).length;
  if (bad) {
    failures += bad;
    console.error(`FAIL ${name}: ${bad} of ${count} screens differ`);
  } else {
    console.log(`ok   ${name}: ${count} screens, ${objects} objects, ${TICKS} ticks match`);
  }
}

if (failures) {
  console.error(`\n${failures} screens differ`);
  process.exit(1);
}
console.log('\nall objects match PyElectroMan');
