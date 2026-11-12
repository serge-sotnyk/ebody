// npm run verify-hero
// Plays random key sequences from every checkpoint and every teleport of every
// game level, in PyElectroMan (trace_hero.py, headless) and in our simulation,
// and checks that the hero's screen, position, state, animation, weapon,
// disks and checkpoint agree on every tick, through deaths and respawns, up
// to the level exit.
//
// Needs the same PyElectroMan checkout and Python as verify-objects.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkpoints, GAME_LEVELS, type TilePlace } from '../../src/data/levels.ts';
import type { LevelFile, SpriteSetFile } from '../../src/data/types.ts';
import { INPUT, MAGAZINE, TELEPORT_TIME } from '../../src/sim/hero.ts';
import { ACTION, objectSprite } from '../../src/sim/objects.ts';
import { screenLayout } from '../../src/sim/room.ts';
import { SCREEN_COUNT, TILE } from '../../src/data/types.ts';
import { LevelSprites } from '../../src/sim/tiles.ts';
import { World } from '../../src/sim/world.ts';
import { GENERATED_DATA, PYELECTROMAN, ROOT } from '../convert/paths.ts';

const TICKS = Number(process.env.TRACE_TICKS ?? 400);
const SEEDS = [1, 2, 3];
const python = process.env.PYELECTROMAN_PYTHON ?? resolve(ROOT, '../pyelectroman-venv/bin/python');

interface Scenario extends TilePlace {
  level: string;
  seed: number;
  inputs: number[];
  /** Disks already collected (3 opens the exit). */
  disks?: number;
  /** Weapon level to start with, magazine full. */
  power?: number;
}

/** Hold a random key combination for 1-20 ticks, again and again. Deterministic per seed. */
function randomInputs(seed: number, ticks: number): number[] {
  let s = seed * 0x9e3779b9 || 1;
  const next = (): number => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2 ** 32;
  };
  const { left: L, right: R, up: U, down: D, fire: F } = INPUT;
  const choices = [0, L, L, R, R, U, L | U, R | U, L | R, 0, D, D, D | L, D | R, F, F, F | L, F | R, F | U];
  const out: number[] = [];
  while (out.length < ticks) {
    const keys = choices[Math.floor(next() * choices.length)]!;
    const hold = 1 + Math.floor(next() * 20);
    for (let i = 0; i < hold && out.length < ticks; i++) out.push(keys);
  }
  return out;
}

const readJson = <T>(...p: string[]): T => JSON.parse(readFileSync(join(GENERATED_DATA, ...p), 'utf8')) as T;
const levels = new Map<string, { level: LevelFile; sprites: LevelSprites }>(
  GAME_LEVELS.map((name) => {
    const level = readJson<LevelFile>('levels', `${name}.json`);
    const sprites = new LevelSprites([
      readJson<SpriteSetFile>('sprites', `${level.sets[0]}.json`),
      readJson<SpriteSetFile>('sprites', `${level.sets[1]}.json`),
    ]);
    return [name, { level, sprites }] as const;
  }),
);

const scenarios: Scenario[] = [];
for (const [name, { level, sprites }] of levels) {
  for (const c of checkpoints(level, sprites)) {
    for (const seed of SEEDS) {
      scenarios.push({ level: name, screen: c.screen, x: c.x, y: c.y, seed, inputs: randomInputs(seed + c.screen * 7 + c.x, TICKS) });
    }
    // Armed, with each weapon level.
    for (let power = 1; power <= 5; power++) {
      const seed = 300 + power * 31 + c.screen * 7 + c.x;
      scenarios.push({ level: name, screen: c.screen, x: c.x, y: c.y, seed, power, inputs: randomInputs(seed, TICKS) });
    }
  }
  // Standing on each teleport (on its base, in the upper tile) and pressing Down first.
  for (let screen = 0; screen < SCREEN_COUNT; screen++) {
    for (const t of screenLayout(level, sprites, screen).objects) {
      if (sprites.get(t.sprite)?.action !== ACTION.teleport) continue;
      const seed = 100 + screen * 13 + t.x + t.y;
      const inputs = [INPUT.down, ...randomInputs(seed, TICKS - 1)];
      scenarios.push({ level: name, screen, x: t.x, y: t.y - TILE, seed, inputs });
    }
  }
  // Next to each exit tile with three disks: walk around it, pressing Down.
  for (let screen = 0; screen < SCREEN_COUNT; screen++) {
    for (const t of screenLayout(level, sprites, screen).objects) {
      if (sprites.get(t.sprite)?.action !== ACTION.exit) continue;
      const seed = 500 + screen * 13 + t.x;
      const inputs = [0, 0, INPUT.down, ...randomInputs(seed, TICKS - 3)];
      scenarios.push({ level: name, screen, x: t.x, y: t.y - TILE, seed, inputs, disks: 3 });
    }
  }
}

console.log(`running ${scenarios.length} scenarios of ${TICKS} ticks in PyElectroMan...`);
const dir = mkdtempSync(join(tmpdir(), 'ebody-hero-'));
writeFileSync(join(dir, 'scenarios.json'), JSON.stringify(scenarios));
execFileSync(python, [join(import.meta.dirname, 'trace_hero.py'), PYELECTROMAN, join(dir, 'scenarios.json'), join(dir, 'trace.json')], {
  stdio: 'inherit',
  env: { ...process.env, TELEPORT_TIME: String(TELEPORT_TIME) },
});
type Row = [number, number, number, string, string, number, number, number, number, number, number, number, string];
const weapons = readJson<SpriteSetFile>('sprites', 'weapons.json');
const trace = JSON.parse(readFileSync(join(dir, 'trace.json'), 'utf8')) as Row[][];

const snake = (s: string): string => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
let failures = 0;
let ticks = 0;
let deaths = 0;
let teleports = 0;
let exits = 0;
const screensVisited = new Set<string>();

scenarios.forEach((sc, i) => {
  const { level, sprites } = levels.get(sc.level)!;
  const world = new World(level, sprites, { screen: sc.screen, keepObjects: true, weapons });
  world.placeHero(sc);
  world.disks = sc.disks ?? 0;
  if (sc.power) {
    world.hero!.power = sc.power;
    world.hero!.ammo = MAGAZINE[sc.power]!;
  }
  const theirs = trace[i]!;
  for (let t = 0; t < theirs.length; t++) {
    world.step(sc.inputs[t]);
    const h = world.hero!;
    const ours: Row = [
      world.room.screen,
      h.x,
      h.y,
      snake(h.state),
      h.anim,
      h.frame,
      h.orientation,
      h.power,
      h.ammo,
      h.temp,
      world.disks,
      world.checkpoint.screen,
      world.room.objects
        .map((o) => {
          const s = o.kind === 'exitIndicator' ? o.frames[0]! : objectSprite(o);
          return `${o.x},${o.y}:${s === null ? '-' : o.sheet ? `w${s}` : s}`;
        })
        .join(' '),
    ];
    ticks++;
    screensVisited.add(`${sc.level}/${ours[0]}`);
    if (ours[3] === 'teleport_in' && theirs[t - 1]?.[3] !== 'teleport_in') teleports++;
    if (JSON.stringify(ours) !== JSON.stringify(theirs[t])) {
      failures++;
      if (failures <= 5) {
        const keys = sc.inputs.slice(Math.max(0, t - 5), t + 1).join(',');
        console.error(
          `FAIL ${sc.level} from screen ${sc.screen} (${sc.x},${sc.y}) seed ${sc.seed}, tick ${t} (keys ...${keys})\n` +
            `  theirs ${JSON.stringify(theirs[t])}\n  ours   ${JSON.stringify(ours)}` +
            (t > 0 ? `\n  before ${JSON.stringify(theirs[t - 1])}` : ''),
        );
      }
      return;
    }
  }
  deaths += theirs.filter((row, t) => row[3] === 'death' && theirs[t - 1]?.[3] !== 'death').length;
  if (world.exiting) exits++;
});

console.log(
  `${ticks} ticks compared, ${screensVisited.size} screens visited, ${teleports} teleports, ` +
    `${deaths} deaths, ${exits} level exits`,
);
if (failures) {
  console.error(`\n${failures} of ${scenarios.length} scenarios differ`);
  process.exit(1);
}
console.log(`all ${scenarios.length} hero scenarios match PyElectroMan`);
