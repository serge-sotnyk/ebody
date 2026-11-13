// Game page. Screens follow the original: the title (tit1/tit2 to the title
// song), then our own menu, the levels, a "level completed" screen between
// them and the final screen after the last one. During play the URL hash
// keeps the place, e.g. #elek/1; opening such a link skips the title.

import { GAME_LEVELS } from '../data/levels.ts';
import { loadBitmap, loadLevel, loadSpriteSet, type LoadedSpriteSet } from '../data/loader.ts';
import { END_SONG, LEVEL_SONG, TITLE_SONG, titlePicture } from '../data/songs.ts';
import { MAP_COLS, MAP_ROWS, SCREEN_COLS, SCREEN_ROWS, TILE } from '../data/types.ts';
import { applyUpdate, canInstall, install, startApp, updateReady } from '../platform/app.ts';
import { SoundSystem } from '../platform/audio.ts';
import { fullscreenAvailable, startedFullscreen, toggleFullscreen } from '../platform/fullscreen.ts';
import { Keyboard } from '../platform/keyboard.ts';
import { clearSave, loadGame, saveGame } from '../platform/save.ts';
import { attachTouchPad } from '../platform/touch.ts';
import { startLoop } from '../platform/loop.ts';
import { roomLayers } from '../render/compose.ts';
import { createGameDisplay, FRAME_H, FRAME_W, PLAYFIELD_X, PLAYFIELD_Y } from '../render/display.ts';
import { drawHud } from '../render/hud.ts';
import { padLayout } from '../render/pad-layout.ts';
import { clearPlayfield, drawCell, LevelRenderer } from '../render/level-renderer.ts';
import type { PixelAspect } from '../render/scale.ts';
import { layoutText } from '../render/text.ts';
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
const menuButton = $<HTMLButtonElement>('menuButton');
const menu = $<HTMLElement>('menu');
const extraSets = Promise.all([loadSpriteSet('hero'), loadSpriteSet('weapons'), loadSpriteSet('info'), loadSpriteSet('enem')]);
const sound = new SoundSystem(readSetting('sound') === 'off', savedVolume() / 100);
sound.setMusic(readSetting('music') !== 'off');
const soundReady = sound.load([TITLE_SONG, LEVEL_SONG, END_SONG]);
const pictures = Promise.all(['tit1', 'tit2', 'back', 'over'].map((n) => loadBitmap(`screens/${n}.png`)));
const lettersSet = loadSpriteSet('letters');

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

/** Which screen shows: the title (with the menu over it), a level, or a picture between levels. */
type Mode = 'title' | 'play' | 'levelDone' | 'end';
let mode: Mode = 'title';
let titleImages: ImageBitmap[] = [];
let letters: LoadedSpriteSet | null = null;
/** The text on the "level completed" screen, and the level that follows it. */
let doneText = '';
let nextLevel = '';
let savedCheckpoints = 0;
/** The first fire on the title only asks the browser for sound (once). */
let audioAsked = false;
/** The touch buttons are wanted (touch screen or T); they show during play only. */
let padWanted = false;

const loop = startLoop(TICK_HZ, tick, render);

function tick(): void {
  const input = keyboard.sample() | touch.sample();
  if (mode !== 'play' || !world || !menu.hidden) return;
  world.step(input);
  for (const name of world.takeSounds()) sound.play(name);
  if (world.checkpoints !== savedCheckpoints) {
    savedCheckpoints = world.checkpoints;
    saveGame(levelName, world.progress());
  }
  if (world.completed) {
    finishLevel();
    return;
  }
  if (world.room.screen !== shownScreen) placeChanged();
  showStatus();
}

/** After the exit: "level completed", or after the last level the final screen. */
function finishLevel(): void {
  const i = (GAME_LEVELS as readonly string[]).indexOf(levelName);
  world = null;
  if (i + 1 < GAME_LEVELS.length) {
    nextLevel = GAME_LEVELS[i + 1]!;
    saveGame(nextLevel); // Continue starts the next level
    doneText = `good job* *level ${i + 1}*completed* *press fire`; // MESSAGES.H MELEVCMP
    setMode('levelDone');
    sound.playSong(LEVEL_SONG);
  } else {
    clearSave();
    setMode('end');
    sound.playSong(END_SONG);
  }
}

function setMode(next: Mode): void {
  mode = next;
  if (mode !== 'play') history.replaceState(null, '', location.pathname);
  layoutPad();
  loop.invalidate();
}

/** Fire (Space, Enter, a click or tap) on a picture screen. */
function onFire(): void {
  if (mode === 'title' && menu.hidden) {
    // Browsers keep the page silent until a key press or a tap. The first one
    // only starts the sound, and the title song plays from its beginning.
    if (!sound.muted && sound.musicOn && !sound.running && !audioAsked) {
      audioAsked = true;
      sound.unlock();
      return;
    }
    sound.unlock();
    showMenu('main');
  } else if (mode === 'levelDone') {
    sound.stopSong();
    void startLevel(nextLevel);
  } else if (mode === 'end') {
    toTitle();
  }
}

function toTitle(): void {
  world = null;
  hideMenu();
  setMode('title');
  void soundReady.then(() => {
    if (mode === 'title') sound.playSong(TITLE_SONG);
  });
}

/** Start a level from its beginning, or from a saved game's checkpoint. */
async function startLevel(name: string, progress?: ReturnType<World['progress']>): Promise<void> {
  hideMenu();
  sound.stopSong();
  await openLevel(name);
  if (!world) return;
  if (progress) world.resume(progress);
  savedCheckpoints = world.checkpoints;
  saveGame(name, progress);
  setMode('play');
  placeChanged();
}

function render(): void {
  const { ctx } = display;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, FRAME_W, FRAME_H);
  if (mode !== 'play') {
    renderPicture(ctx);
    return;
  }
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

/** The title (alternating with the music), "level completed" with its text, or the final picture. */
function renderPicture(ctx: CanvasRenderingContext2D): void {
  const [tit1, tit2, back, over] = titleImages;
  const picture = mode === 'title' ? (titlePicture(sound.songPosition()) ? tit2 : tit1) : mode === 'levelDone' ? back : over;
  if (picture) ctx.drawImage(picture, 0, 0);
  if (mode === 'levelDone' && letters) {
    for (const g of layoutText(doneText, FRAME_W, FRAME_H)) drawCell(ctx, letters.atlas, g.sprite, g.x, g.y);
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
}

function placeChanged(): void {
  shownScreen = world?.room.screen ?? 0;
  if (mode === 'play') history.replaceState(null, '', `#${levelName}/${shownScreen}`);
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
  void startLevel(GAME_LEVELS[(i + delta + GAME_LEVELS.length) % GAME_LEVELS.length]!);
}

// --- menus --------------------------------------------------------------------

type MenuItem = { label: string; note?: string; action: () => void; dim?: boolean };
/** A menu line: one button, two side by side, or another control. */
type MenuEntry = MenuItem | { pair: [MenuItem, MenuItem] } | { control: () => HTMLElement };

/** Our own menu: on the title ("main") or during play ("pause"); `focus` is the control to focus, by position. */
function showMenu(kind: 'main' | 'pause', focus = 0): void {
  const items: MenuEntry[] = [];
  if (kind === 'main') {
    const saved = loadGame();
    if (saved) {
      const n = (GAME_LEVELS as readonly string[]).indexOf(saved.level) + 1;
      items.push({
        label: 'Continue',
        note: `level ${n}${saved.progress ? ', last checkpoint' : ''}`,
        action: () => void startLevel(saved.level, saved.progress),
      });
    }
    items.push({ label: 'New game', action: () => void startLevel(GAME_LEVELS[0]) });
  } else {
    items.push({ label: 'Resume', action: hideMenu });
    items.push({ label: 'Restart level', action: () => void startLevel(levelName) });
  }
  items.push({
    pair: [
      { label: sound.muted ? 'Sound: off' : 'Sound: on', action: toggleSound },
      { label: sound.musicOn ? 'Music: on' : 'Music: off', action: toggleMusic, dim: sound.muted },
    ],
  });
  items.push({ control: volumeSlider });
  items.push({
    label: 'Keys and help',
    action: () => {
      hideMenu();
      toggleHelp(true);
    },
  });
  if (kind === 'pause') items.push({ label: 'Quit to title', action: toTitle });
  if (kind === 'main' && updateReady()) {
    items.push({ label: 'Update', note: 'a new version is ready; the game restarts', action: applyUpdate });
  }
  if (kind === 'main' && canInstall()) {
    items.push({
      label: 'Install app',
      note: 'full screen, plays offline',
      action: () => {
        hideMenu();
        void install();
      },
    });
  }

  const box = menu.querySelector<HTMLElement>('.menu-box')!;
  box.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = kind === 'main' ? 'Electro Man' : 'Paused';
  box.append(heading);
  for (const entry of items) {
    if ('pair' in entry) {
      const row = document.createElement('div');
      row.className = 'menu-pair';
      row.append(...entry.pair.map(menuItemButton));
      box.append(row);
    } else if ('control' in entry) {
      box.append(entry.control());
    } else {
      box.append(menuItemButton(entry));
    }
  }
  menu.dataset.kind = kind;
  menu.hidden = false;
  const controls = menuControls();
  (controls[focus] ?? controls[0])?.focus();
}

function menuItemButton(item: MenuItem): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = item.label;
  if (item.dim) b.classList.add('off');
  if (item.note) {
    const small = document.createElement('small');
    small.textContent = item.note;
    b.append(small);
  }
  b.addEventListener('click', () => {
    sound.unlock();
    item.action();
  });
  return b;
}

/** Everything in the menu the arrow keys move through, in order. */
function menuControls(): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>('button, [role=slider]')];
}

/** Draw the open menu again (after a setting changed), keeping the focus where it was. */
function refreshMenu(): void {
  if (menu.hidden) return;
  const focus = menuControls().indexOf(document.activeElement as HTMLElement);
  showMenu(menu.dataset.kind === 'pause' ? 'pause' : 'main', Math.max(0, focus));
}

function hideMenu(): void {
  menu.hidden = true;
}

/** Volume in steps of 10%: Left/Right when it has the focus, or a tap or drag along it. */
function volumeSlider(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'menu-slider';
  row.tabIndex = 0;
  row.setAttribute('role', 'slider');
  row.setAttribute('aria-label', 'Volume');
  row.setAttribute('aria-valuemin', '0');
  row.setAttribute('aria-valuemax', '100');
  row.innerHTML = '<span>Volume</span><span class="track"><span class="fill"></span></span><span class="value"></span>';
  const track = row.querySelector<HTMLElement>('.track')!;
  const show = (): void => {
    const percent = Math.round(sound.volume * 100);
    row.querySelector<HTMLElement>('.fill')!.style.width = `${percent}%`;
    row.querySelector('.value')!.textContent = `${percent}%`;
    row.setAttribute('aria-valuenow', String(percent));
    row.classList.toggle('off', sound.muted);
  };
  row.addEventListener('volume', show);
  const fromPointer = (e: PointerEvent): void => {
    const r = track.getBoundingClientRect();
    setVolume(Math.round(((e.clientX - r.left) / r.width) * 10) * 10);
  };
  row.addEventListener('pointerdown', (e) => {
    row.setPointerCapture(e.pointerId);
    sound.unlock();
    fromPointer(e);
  });
  row.addEventListener('pointermove', (e) => {
    if (row.hasPointerCapture(e.pointerId)) fromPointer(e);
  });
  show();
  return row;
}

/** Set the volume (percent), remember it, and let it be heard. */
function setVolume(percent: number): void {
  const value = Math.min(100, Math.max(0, percent));
  if (value === Math.round(sound.volume * 100)) return;
  sound.setVolume(value / 100);
  writeSetting('volume', String(value));
  menu.querySelector('.menu-slider')?.dispatchEvent(new Event('volume'));
  sound.play('battery');
}

function savedVolume(): number {
  const n = Number(readSetting('volume') ?? 100);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 100;
}

function toggleSound(): void {
  sound.setMuted(!sound.muted);
  writeSetting('sound', sound.muted ? 'off' : 'on');
  toast(sound.muted ? 'sound off' : 'sound on');
  refreshMenu();
  if (!sound.muted) sound.unlock();
}

/** Music only (title and between levels); the game's sound effects stay. */
function toggleMusic(): void {
  sound.setMusic(!sound.musicOn);
  writeSetting('music', sound.musicOn ? 'on' : 'off');
  toast(sound.musicOn ? 'music on' : 'music off');
  refreshMenu();
}

/**
 * Arrow keys move through the menu (Left/Right set the volume, or move
 * between two buttons on one line); Enter or Space picks; Esc closes it.
 */
function menuKey(e: KeyboardEvent): boolean {
  if (menu.hidden) return false;
  const buttons = menuControls();
  const active = document.activeElement as HTMLElement | null;
  const i = buttons.indexOf(active!);
  const sideways = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
  if (sideways && active?.classList.contains('menu-slider')) {
    setVolume(Math.round(sound.volume * 10) * 10 + (e.key === 'ArrowRight' ? 10 : -10));
  } else if (sideways && active?.parentElement?.classList.contains('menu-pair')) {
    const sibling = e.key === 'ArrowRight' ? active.nextElementSibling : active.previousElementSibling;
    (sibling as HTMLElement | null)?.focus();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const step = e.key === 'ArrowDown' ? 1 : -1;
    buttons[(i + step + buttons.length) % buttons.length]?.focus();
  } else if (e.key === 'Enter' || e.key === ' ') {
    (buttons[i] ?? buttons[0])?.click();
  } else if (e.key === 'Escape') {
    hideMenu();
  } else {
    return false;
  }
  e.preventDefault();
  return true;
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
  if (menuKey(e)) return;
  if (!menu.hidden && e.key.toLowerCase() !== 'm') return; // the menu has the keys
  if (mode !== 'title') sound.unlock();
  if (e.key === 'Escape') {
    e.preventDefault();
    if (!help.hidden) toggleHelp(false);
    else if (mode === 'play') showMenu('pause');
    return;
  }
  if (mode !== 'play' && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    onFire();
    return;
  }
  if (e.key.toLowerCase() === 'm' || e.key === 'F7') {
    e.preventDefault();
    toggleSound();
    return;
  }
  if (mode !== 'play') {
    if (e.key.toLowerCase() === 'h') toggleHelp();
    if (e.key.toLowerCase() === 'f') void toggleFullscreen();
    return;
  }
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
    r: () => void startLevel(levelName),
    '[': () => cycleLevel(-1),
    ']': () => cycleLevel(1),
    n: finishLevel,
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
    t: () => {
      showPad(!padWanted);
      toast(padWanted ? 'touch buttons on' : 'touch buttons off');
    },
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
};
coarse.addEventListener('change', useTouch);
useTouch();
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && !padWanted) showPad(true);
  if (mode !== 'title') sound.unlock();
});

function showPad(show: boolean): void {
  padWanted = show;
  layoutPad();
}

// A click or tap on a picture screen counts as fire.
$('stage').addEventListener('click', () => {
  if (mode !== 'play') onFire();
});

/** Size and place the touch buttons, and keep their room free of the picture (pad-layout.ts). */
function layoutPad(): void {
  const stage = $<HTMLElement>('stage');
  stage.style.padding = '';
  pad.classList.remove('beside', 'below');
  pad.hidden = !(padWanted && mode === 'play'); // under the pause menu they stay, so the picture keeps its size
  if (pad.hidden) return;
  const l = padLayout(window.innerWidth, window.innerHeight, display.aspect);
  const vars = { btn: l.btn, big: l.big, gap: l.gap, side: l.side, 'rocker-w': l.rockerW, 'rocker-h': l.rockerH };
  for (const [name, px] of Object.entries(vars)) pad.style.setProperty(`--${name}`, `${px}px`);
  pad.classList.add(l.mode);
  if (l.mode === 'beside') {
    stage.style.paddingLeft = `calc(env(safe-area-inset-left) + ${l.side}px)`;
    stage.style.paddingRight = `calc(env(safe-area-inset-right) + ${l.side}px)`;
  } else {
    stage.style.paddingBottom = `calc(env(safe-area-inset-bottom) + ${l.bottom}px)`;
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
fullscreenButton.hidden = !fullscreenAvailable() || startedFullscreen();
let idleTimer = 0;
const wake = (): void => {
  for (const b of [menuButton, fullscreenButton]) b.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    for (const b of [menuButton, fullscreenButton]) b.classList.add('idle');
  }, 3000);
};
window.addEventListener('pointermove', wake);
window.addEventListener('pointerdown', wake);
wake();
menuButton.addEventListener('click', () => {
  sound.unlock();
  if (!menu.hidden) {
    hideMenu();
  } else {
    showMenu(mode === 'play' ? 'pause' : 'main');
  }
});
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

/** A link like #elek/1 opens that level and screen directly (for testing). */
function openFromHash(): boolean {
  const [name, screen] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (!(GAME_LEVELS as readonly string[]).includes(name ?? '')) return false;
  const n = Number(screen);
  hideMenu();
  sound.stopSong();
  void openLevel(name!, Number.isInteger(n) && n >= 0 && n < 256 ? n : undefined).then(() => {
    if (!world) return;
    savedCheckpoints = world.checkpoints;
    setMode('play');
    placeChanged();
  });
  return true;
}

display.setAspect(settings.aspect);
window.addEventListener('hashchange', () => {
  if (mode !== 'play' || location.hash !== `#${levelName}/${world?.room.screen}`) openFromHash();
});
void Promise.all([pictures, lettersSet]).then(([images, set]) => {
  titleImages = images;
  letters = set;
  loop.invalidate();
});
if (!openFromHash()) toTitle();
startApp(() => toast('a new version is ready: Update in the menu'));
