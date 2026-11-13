// Level viewer: browse every screen of every level.
// URL hash keeps the state, e.g. levels.html#elek/44

import { GAME_LEVELS, startScreen } from '../data/levels.ts';
import { loadLevel, loadManifest, loadSpriteSet } from '../data/loader.ts';
import { MAP_COLS, MAP_ROWS } from '../data/types.ts';
import type { LayerOrder } from '../render/compose.ts';
import { createDisplay, FRAME_H, FRAME_W } from '../render/display.ts';
import { LevelRenderer } from '../render/level-renderer.ts';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const levelSelect = $<HTMLSelectElement>('level');
const orderSelect = $<HTMLSelectElement>('order');
const boxesCheck = $<HTMLInputElement>('boxes');
const info = $<HTMLParagraphElement>('info');
const minimap = $<HTMLCanvasElement>('minimap');
const display = createDisplay($<HTMLCanvasElement>('screen'), $<HTMLDivElement>('stage'));

let renderer: LevelRenderer | null = null;
let screen = 0;
let start = 0;

async function setLevel(name: string, wantedScreen?: number): Promise<void> {
  const level = await loadLevel(name);
  const sets = await Promise.all([loadSpriteSet(level.sets[0]), loadSpriteSet(level.sets[1])]);
  renderer = new LevelRenderer(level, sets);
  start = startScreen(level, renderer.sprites);
  levelSelect.value = name;
  screen = wantedScreen ?? start;
  draw();
}

function draw(): void {
  if (!renderer) return;
  const { ctx } = display;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, FRAME_W, FRAME_H);
  const ops = renderer.drawScreen(ctx, screen, orderSelect.value as LayerOrder);
  if (boxesCheck.checked) renderer.drawBoxes(ctx, ops);

  const level = renderer.level;
  const present = level.screens[screen] != null;
  info.textContent =
    `${level.name} · screen ${screen} (x ${screen % MAP_COLS}, y ${Math.floor(screen / MAP_COLS)})` +
    `${present ? '' : ' · empty'}${screen === start ? ' · start' : ''}\n` +
    `sets ${level.sets.join(' + ')} · ${level.screens.filter(Boolean).length} screens`;
  info.style.whiteSpace = 'pre-line';
  drawMinimap();
  history.replaceState(null, '', `#${level.name}/${screen}`);
}

function drawMinimap(): void {
  if (!renderer) return;
  const ctx = minimap.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, MAP_COLS, MAP_ROWS);
  renderer.level.screens.forEach((planes, s) => {
    if (!planes) return;
    ctx.fillStyle = s === start ? '#3f8f4f' : '#555b66';
    ctx.fillRect(s % MAP_COLS, Math.floor(s / MAP_COLS), 1, 1);
  });
  ctx.fillStyle = '#6cc4ff';
  ctx.fillRect(screen % MAP_COLS, Math.floor(screen / MAP_COLS), 1, 1);
}

function move(dx: number, dy: number): void {
  const x = (screen % MAP_COLS) + dx;
  const y = Math.floor(screen / MAP_COLS) + dy;
  screen = ((y + MAP_ROWS) % MAP_ROWS) * MAP_COLS + ((x + MAP_COLS) % MAP_COLS);
  draw();
}

function cycleLevel(delta: number): void {
  const options = [...levelSelect.options].map((o) => o.value);
  const i = options.indexOf(levelSelect.value);
  void setLevel(options[(i + delta + options.length) % options.length]!);
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement) return;
  const actions: Record<string, () => void> = {
    ArrowLeft: () => move(-1, 0),
    ArrowRight: () => move(1, 0),
    ArrowUp: () => move(0, -1),
    ArrowDown: () => move(0, 1),
    '[': () => cycleLevel(-1),
    ']': () => cycleLevel(1),
    g: () => {
      orderSelect.value = orderSelect.value === 'game' ? 'planes' : 'game';
      draw();
    },
    c: () => {
      boxesCheck.checked = !boxesCheck.checked;
      draw();
    },
  };
  const action = actions[e.key];
  if (action) {
    e.preventDefault();
    action();
  }
});

minimap.addEventListener('click', (e) => {
  const rect = minimap.getBoundingClientRect();
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * MAP_COLS);
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * MAP_ROWS);
  screen = y * MAP_COLS + x;
  draw();
});

levelSelect.addEventListener('change', () => void setLevel(levelSelect.value));
orderSelect.addEventListener('change', draw);
boxesCheck.addEventListener('change', draw);

async function openFromHash(levels: readonly string[]): Promise<void> {
  const [hashLevel, hashScreen] = location.hash.slice(1).split('/');
  const name = hashLevel && levels.includes(hashLevel) ? hashLevel : GAME_LEVELS[0];
  const parsed = Number(hashScreen);
  const wanted = hashScreen && Number.isInteger(parsed) && parsed >= 0 && parsed < 256 ? parsed : undefined;
  if (renderer?.level.name === name && wanted !== undefined) {
    screen = wanted;
    draw();
  } else {
    await setLevel(name, wanted);
  }
}

async function main(): Promise<void> {
  const manifest = await loadManifest();
  const extras = manifest.levels.filter((l) => !(GAME_LEVELS as readonly string[]).includes(l));
  for (const [i, name] of GAME_LEVELS.entries()) levelSelect.add(new Option(`${i + 1}. ${name}`, name));
  for (const name of extras) levelSelect.add(new Option(`(unused) ${name}`, name));
  window.addEventListener('hashchange', () => void openFromHash(manifest.levels));
  await openFromHash(manifest.levels);
}

main().catch((err: unknown) => {
  info.textContent = `Failed to load: ${String(err)}. Did you run "npm run assets"?`;
  console.error(err);
});
