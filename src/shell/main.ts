// Game page. Until the hero arrives (step 4) this is an explore mode: the
// levels run with their animated objects and the arrows move between screens.
// The URL hash keeps the place, e.g. #elek/1.

import { GAME_LEVELS, startScreen } from '../data/levels.ts';
import { loadLevel, loadSpriteSet } from '../data/loader.ts';
import { MAP_COLS, MAP_ROWS } from '../data/types.ts';
import { fullscreenAvailable, toggleFullscreen } from '../platform/fullscreen.ts';
import { startLoop } from '../platform/loop.ts';
import { roomLayers } from '../render/compose.ts';
import { createGameDisplay, FRAME_H, FRAME_W } from '../render/display.ts';
import { LevelRenderer } from '../render/level-renderer.ts';
import type { PixelAspect } from '../render/scale.ts';
import { TICK_HZ, World } from '../sim/world.ts';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const help = $<HTMLElement>('help');
const status = $<HTMLElement>('status');
const toastEl = $<HTMLElement>('toast');
const fullscreenButton = $<HTMLButtonElement>('fullscreen');
const display = createGameDisplay($<HTMLCanvasElement>('screen'), $<HTMLDivElement>('fit'));

const settings = {
  get aspect(): PixelAspect {
    return readSetting('aspect') === '1.2' ? 1.2 : 1;
  },
  set aspect(value: PixelAspect) {
    writeSetting('aspect', String(value));
  },
};

let renderer: LevelRenderer | null = null;
let world: World | null = null;
let levelName: string = GAME_LEVELS[0];
let loading = 0;

const loop = startLoop(
  TICK_HZ,
  () => {
    world?.step();
    showStatus();
  },
  render,
);

function render(): void {
  const { ctx } = display;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, FRAME_W, FRAME_H);
  if (world && renderer) {
    const { back, front } = roomLayers(world.room, renderer.sprites);
    renderer.drawOps(ctx, [...back, ...front]);
  }
  display.present();
}

async function openLevel(name: string, screen?: number): Promise<void> {
  const ticket = ++loading;
  const level = await loadLevel(name);
  const sets = await Promise.all([loadSpriteSet(level.sets[0]), loadSpriteSet(level.sets[1])]);
  if (ticket !== loading) return; // a later request won
  renderer = new LevelRenderer(level, sets);
  levelName = name;
  world = new World(level, renderer.sprites, screen ?? startScreen(level, renderer.sprites));
  placeChanged();
}

function placeChanged(): void {
  history.replaceState(null, '', `#${levelName}/${world?.room.screen ?? 0}`);
  showStatus();
  loop.invalidate();
}

function showStatus(): void {
  if (!world || help.hidden) return;
  const s = world.room.screen;
  const empty = world.level.screens[s] ? '' : ' (empty)';
  status.textContent =
    `${levelName} · screen ${s}${empty} · x ${s % MAP_COLS} y ${Math.floor(s / MAP_COLS)}\n` +
    `${loop.hz} ticks/s · tick ${world.tick}${loop.paused ? ' · paused' : ''}`;
  status.style.whiteSpace = 'pre-line';
}

function move(dx: number, dy: number): void {
  if (!world) return;
  const x = (world.room.screen % MAP_COLS) + dx;
  const y = Math.floor(world.room.screen / MAP_COLS) + dy;
  world.enter(((y + MAP_ROWS) % MAP_ROWS) * MAP_COLS + ((x + MAP_COLS) % MAP_COLS));
  placeChanged();
}

function cycleLevel(delta: number): void {
  const i = (GAME_LEVELS as readonly string[]).indexOf(levelName);
  void openLevel(GAME_LEVELS[(i + delta + GAME_LEVELS.length) % GAME_LEVELS.length]!);
}

let toastTimer = 0;
function toast(text: string): void {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 1500);
}

function toggleHelp(show = help.hidden): void {
  help.hidden = !show;
  showStatus();
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const actions: Record<string, () => void> = {
    ArrowLeft: () => move(-1, 0),
    ArrowRight: () => move(1, 0),
    ArrowUp: () => move(0, -1),
    ArrowDown: () => move(0, 1),
    '[': () => cycleLevel(-1),
    ']': () => cycleLevel(1),
    f: () => void toggleFullscreen(),
    a: () => {
      const aspect: PixelAspect = display.aspect === 1 ? 1.2 : 1;
      settings.aspect = aspect;
      display.setAspect(aspect);
      toast(aspect === 1 ? 'square pixels' : '4:3 monitor pixels');
    },
    p: () => {
      loop.pause(!loop.paused);
      toast(loop.paused ? 'paused' : 'running');
      showStatus();
    },
    '.': () => {
      if (!loop.paused) loop.pause(true);
      loop.stepOnce();
      toast(`tick ${world?.tick ?? 0}`);
    },
    '-': () => setHz(loop.hz - 1),
    '=': () => setHz(loop.hz + 1),
    '+': () => setHz(loop.hz + 1),
    h: () => toggleHelp(),
    '?': () => toggleHelp(),
    Escape: () => toggleHelp(false),
  };
  const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (!action) return;
  e.preventDefault();
  action();
});

function setHz(hz: number): void {
  loop.hz = Math.min(60, Math.max(5, hz));
  toast(`${loop.hz} ticks/s`);
  showStatus();
}

// Tapping the picture toggles the panel (touch controls come in step 5);
// a double click or double tap toggles fullscreen.
$('stage').addEventListener('click', () => toggleHelp());
$('stage').addEventListener('dblclick', () => void toggleFullscreen());

// The fullscreen button shows while the pointer moves and fades after a while.
if (fullscreenAvailable()) {
  fullscreenButton.hidden = false;
  let idleTimer = 0;
  const wake = (): void => {
    fullscreenButton.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => fullscreenButton.classList.add('idle'), 2500);
  };
  window.addEventListener('pointermove', wake);
  window.addEventListener('pointerdown', wake);
  fullscreenButton.addEventListener('click', (e) => {
    e.stopPropagation();
    void toggleFullscreen();
  });
  wake();
}

function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(`ebody.${key}`);
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(`ebody.${key}`, value);
  } catch {
    // Storage blocked: the setting lasts until the page is closed.
  }
}

function openFromHash(): void {
  const [name, screen] = decodeURIComponent(location.hash.slice(1)).split('/');
  const known = (GAME_LEVELS as readonly string[]).includes(name ?? '');
  const n = Number(screen);
  void openLevel(known ? name! : GAME_LEVELS[0], Number.isInteger(n) && n >= 0 && n < 256 ? n : undefined);
}

display.setAspect(settings.aspect);
window.addEventListener('hashchange', () => {
  if (location.hash !== `#${levelName}/${world?.room.screen}`) openFromHash();
});
openFromHash();
