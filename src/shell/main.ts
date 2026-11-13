// Game page: the levels in play, with the hero, objects and enemies.
// The URL hash keeps the place, e.g. #elek/1.

import { GAME_LEVELS } from '../data/levels.ts';
import { loadLevel, loadSpriteSet, type LoadedSpriteSet } from '../data/loader.ts';
import { MAP_COLS, MAP_ROWS, SCREEN_COLS, SCREEN_ROWS, TILE } from '../data/types.ts';
import { fullscreenAvailable, toggleFullscreen } from '../platform/fullscreen.ts';
import { Keyboard } from '../platform/keyboard.ts';
import { attachTouchPad } from '../platform/touch.ts';
import { startLoop } from '../platform/loop.ts';
import { roomLayers } from '../render/compose.ts';
import { createGameDisplay, FRAME_H, FRAME_W, PLAYFIELD_X, PLAYFIELD_Y } from '../render/display.ts';
import { drawHud } from '../render/hud.ts';
import { clearPlayfield, drawCell, LevelRenderer } from '../render/level-renderer.ts';
import type { PixelAspect } from '../render/scale.ts';
import { heroSprites } from '../sim/hero.ts';
import { TICK_HZ, World } from '../sim/world.ts';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const help = $<HTMLElement>('help');
const status = $<HTMLElement>('status');
const toastEl = $<HTMLElement>('toast');
const fullscreenButton = $<HTMLButtonElement>('fullscreen');
const display = createGameDisplay($<HTMLCanvasElement>('screen'), $<HTMLDivElement>('fit'));
const keyboard = new Keyboard();
const pad = $<HTMLElement>('pad');
const touch = attachTouchPad(pad);
const helpButton = $<HTMLButtonElement>('helpButton');
const extraSets = Promise.all([loadSpriteSet('hero'), loadSpriteSet('weapons'), loadSpriteSet('info'), loadSpriteSet('enem')]);

const settings = {
  get aspect(): PixelAspect {
    return readSetting('aspect') === '1.2' ? 1.2 : 1;
  },
  set aspect(value: PixelAspect) {
    writeSetting('aspect', String(value));
  },
};

let renderer: LevelRenderer | null = null;
let hero: LoadedSpriteSet | null = null;
let info: LoadedSpriteSet | null = null;
let world: World | null = null;
let levelName: string = GAME_LEVELS[0];
let shownScreen = -1;
let loading = 0;

const loop = startLoop(TICK_HZ, tick, render);

function tick(): void {
  if (!world) return;
  world.step(keyboard.sample() | touch.sample());
  if (world.completed) {
    // The level-complete screen comes in step 9.
    const i = (GAME_LEVELS as readonly string[]).indexOf(levelName);
    if (i + 1 < GAME_LEVELS.length) {
      toast('level complete');
      void openLevel(GAME_LEVELS[i + 1]!);
    } else {
      toast('game complete');
      void openLevel(GAME_LEVELS[0]);
    }
    world = null;
    return;
  }
  if (world.room.screen !== shownScreen) placeChanged();
  showStatus();
}

function render(): void {
  const { ctx } = display;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, FRAME_W, FRAME_H);
  if (world && renderer) {
    // Sprites partly outside the playfield (the hero at an edge) are cut off at its border.
    ctx.save();
    ctx.beginPath();
    ctx.rect(PLAYFIELD_X, PLAYFIELD_Y, SCREEN_COLS * TILE, SCREEN_ROWS * TILE);
    ctx.clip();
    clearPlayfield(ctx);
    const { back, front } = roomLayers(world.room, renderer.sprites, world.activeCheckpointHere());
    renderer.drawOps(ctx, back);
    const pair = world.hero && heroSprites(world.hero);
    if (pair && hero) {
      const x = PLAYFIELD_X + world.hero!.x;
      const y = PLAYFIELD_Y + world.hero!.y;
      drawCell(ctx, hero.atlas, pair[0], x, y);
      drawCell(ctx, hero.atlas, pair[1], x, y + TILE);
    }
    renderer.drawOps(ctx, front);
    if (info && world.hero) {
      const { temp, power, ammo } = world.hero;
      drawHud(ctx, info.atlas, { temp, power, ammo, disks: world.disks, counter: Math.max(0, world.tick - 1) });
    }
    ctx.restore();
  }
  display.present();
}

async function openLevel(name: string, screen?: number): Promise<void> {
  const ticket = ++loading;
  const level = await loadLevel(name);
  const sets = await Promise.all([loadSpriteSet(level.sets[0]), loadSpriteSet(level.sets[1])]);
  const [heroSheet, weapons, infoSheet, enem] = await extraSets;
  if (ticket !== loading) return; // a later request won
  hero = heroSheet;
  info = infoSheet;
  renderer = new LevelRenderer(level, sets);
  renderer.sheets = { weapons, info: infoSheet, enem };
  renderer.sprites.sheets = { weapons: weapons.meta, enem: enem.meta };
  levelName = name;
  world = new World(level, renderer.sprites, screen === undefined ? {} : { screen });
  placeChanged();
}

function placeChanged(): void {
  shownScreen = world?.room.screen ?? 0;
  history.replaceState(null, '', `#${levelName}/${shownScreen}`);
  showStatus();
  loop.invalidate();
}

function showStatus(): void {
  if (!world || help.hidden) return;
  const s = world.room.screen;
  const empty = world.level.screens[s] ? '' : ' (empty)';
  const h = world.hero;
  status.textContent =
    `${levelName} · screen ${s}${empty} · x ${s % MAP_COLS} y ${Math.floor(s / MAP_COLS)}\n` +
    (h ? `hero ${h.x},${h.y} · ${h.state} · disks ${world.disks} · weapon ${h.power}/${h.ammo}\n` : '') +
    `${loop.hz} ticks/s · tick ${world.tick}${loop.paused ? ' · paused' : ''}`;
  status.style.whiteSpace = 'pre-line';
}

/** Debug: look at a neighbouring screen; the hero keeps its place on the playfield. */
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
  // Plain arrows and Space are the game controller (platform/keyboard.ts).
  const screenKeys: Record<string, () => void> = {
    ArrowLeft: () => move(-1, 0),
    ArrowRight: () => move(1, 0),
    ArrowUp: () => move(0, -1),
    ArrowDown: () => move(0, 1),
  };
  if (e.key in screenKeys) {
    if (e.shiftKey) {
      e.preventDefault();
      screenKeys[e.key]!();
    }
    return;
  }
  const actions: Record<string, () => void> = {
    r: () => void openLevel(levelName),
    '[': () => cycleLevel(-1),
    ']': () => cycleLevel(1),
    f: () => void toggleFullscreen(),
    a: () => {
      const aspect: PixelAspect = display.aspect === 1 ? 1.2 : 1;
      settings.aspect = aspect;
      display.setAspect(aspect);
      layoutPad();
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
    t: () => {
      showPad(pad.hidden !== false);
      toast(pad.hidden ? 'touch buttons off' : 'touch buttons on');
    },
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

// Touch screens: the on-screen buttons show from the start, or from the first
// touch on devices that also have a mouse; the help panel starts closed there.
const coarse = matchMedia('(any-pointer: coarse)');
const useTouch = (): void => {
  if (!coarse.matches) return;
  showPad(true);
  toggleHelp(false);
};
coarse.addEventListener('change', useTouch);
useTouch();
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && pad.hidden) showPad(true);
});

function showPad(show: boolean): void {
  pad.hidden = !show;
  layoutPad();
}

/**
 * Keep the touch buttons off the picture: reserve room for them at the sides
 * or along the bottom, whichever leaves the larger picture (sides on phones,
 * bottom on 4:3 tablets).
 */
function layoutPad(): void {
  const stage = $<HTMLElement>('stage');
  stage.style.padding = '';
  if (pad.hidden) return;
  const move = pad.querySelector<HTMLElement>('.cluster.move')!.getBoundingClientRect();
  const act = pad.querySelector<HTMLElement>('.cluster.act')!.getBoundingClientRect();
  const w = window.innerWidth;
  const h = window.innerHeight;
  const side = Math.ceil(Math.max(move.right, w - act.left)) + 4;
  const bottom = Math.ceil(h - Math.min(move.top, act.top)) + 4;
  const aspect = display.aspect;
  const scaleBeside = Math.min((w - 2 * side) / FRAME_W, h / (FRAME_H * aspect));
  const scaleAbove = Math.min(w / FRAME_W, (h - bottom) / (FRAME_H * aspect));
  if (scaleBeside >= scaleAbove) {
    stage.style.paddingLeft = `max(env(safe-area-inset-left), ${side}px)`;
    stage.style.paddingRight = `max(env(safe-area-inset-right), ${side}px)`;
  } else {
    stage.style.paddingBottom = `max(env(safe-area-inset-bottom), ${bottom}px)`;
  }
}
window.addEventListener('resize', layoutPad);

// Held upright, a phone shows "turn your device" (shell.css) and the game waits.
const upright = matchMedia('(orientation: portrait) and (any-pointer: coarse)');
let pausedUpright = false;
const followOrientation = (): void => {
  if (upright.matches && !loop.paused) {
    loop.pause(true);
    pausedUpright = true;
  } else if (!upright.matches && pausedUpright) {
    loop.pause(false);
    pausedUpright = false;
  }
};
upright.addEventListener('change', followOrientation);
followOrientation();

// The corner buttons show while the pointer moves or a finger touches, and fade after a while.
fullscreenButton.hidden = !fullscreenAvailable();
let idleTimer = 0;
const wake = (): void => {
  for (const b of [helpButton, fullscreenButton]) b.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    for (const b of [helpButton, fullscreenButton]) b.classList.add('idle');
  }, 3000);
};
window.addEventListener('pointermove', wake);
window.addEventListener('pointerdown', wake);
wake();
helpButton.addEventListener('click', () => toggleHelp());
fullscreenButton.addEventListener('click', () => void toggleFullscreen());

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
