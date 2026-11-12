// Sprite viewer: every sprite set with its decoded metadata, plus sounds and screens.

import { loadManifest, loadSpriteSet, screenUrl, soundUrl, type LoadedSpriteSet } from '../data/loader.ts';
import { ACTION_NAMES, flagNames, INIT_NAMES, TOUCH_NAMES } from '../data/sprite-status.ts';
import { ATLAS_COLUMNS, SET_SIZE, TILE, type SpriteInfo } from '../data/types.ts';

const ZOOM = 3;
const GAP = 4;
const CELL = TILE * ZOOM;
const PITCH = CELL + GAP;
const ROWS = Math.ceil(SET_SIZE / ATLAS_COLUMNS);

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const setSelect = $<HTMLSelectElement>('set');
const boxesCheck = $<HTMLInputElement>('boxes');
const grid = $<HTMLCanvasElement>('grid');
const details = $<HTMLDivElement>('details');
grid.width = ATLAS_COLUMNS * PITCH + GAP;
grid.height = ROWS * PITCH + GAP;
const ctx = grid.getContext('2d')!;

let current: LoadedSpriteSet | null = null;
let selected = -1;

async function showSet(name: string): Promise<void> {
  current = await loadSpriteSet(name);
  selected = -1;
  history.replaceState(null, '', `#${name}`);
  draw();
  details.innerHTML = `<p class="muted">${name}: ${current.meta.sprites.filter(Boolean).length} of ${SET_SIZE} slots used. Select a sprite.</p>`;
}

function cellOrigin(i: number): [number, number] {
  return [GAP + (i % ATLAS_COLUMNS) * PITCH, GAP + Math.floor(i / ATLAS_COLUMNS) * PITCH];
}

function draw(): void {
  if (!current) return;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, grid.width, grid.height);
  current.meta.sprites.forEach((sprite, i) => {
    const [x, y] = cellOrigin(i);
    ctx.fillStyle = sprite ? '#1d2028' : '#0b0c0f';
    ctx.fillRect(x, y, CELL, CELL);
    if (!sprite) return;
    const sx = (i % ATLAS_COLUMNS) * TILE;
    const sy = Math.floor(i / ATLAS_COLUMNS) * TILE;
    ctx.drawImage(current!.atlas, sx, sy, TILE, TILE, x, y, CELL, CELL);
    if (boxesCheck.checked) drawBox(sprite, x, y);
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, 18, 13);
    ctx.fillStyle = sprite.flags & 0x80 ? '#ffd166' : '#c8ccd4';
    ctx.fillText(String(i), x + 2, y + 10);
  });
  if (selected >= 0) {
    const [x, y] = cellOrigin(selected);
    ctx.strokeStyle = '#6cc4ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 1, y - 1, CELL + 2, CELL + 2);
  }
}

function drawBox(sprite: SpriteInfo, x: number, y: number): void {
  const { bbox, solid } = sprite;
  if (bbox.w <= 0 || bbox.h <= 0) return;
  const x0 = x + bbox.x * ZOOM + 0.5;
  const y0 = y + bbox.y * ZOOM + 0.5;
  const x1 = x0 + bbox.w * ZOOM - 1;
  const y1 = y0 + bbox.h * ZOOM - 1;
  ctx.save();
  ctx.strokeStyle = sprite.action === 0 && sprite.flags === 0x80 ? '#ff00ff' : '#00e0ff';
  ctx.lineWidth = 1;
  const side = (on: boolean, ax: number, ay: number, bx: number, by: number): void => {
    ctx.setLineDash(on ? [] : [2, 3]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  };
  side(solid.top, x0, y0, x1, y0);
  side(solid.bottom, x0, y1, x1, y1);
  side(solid.left, x0, y0, x0, y1);
  side(solid.right, x1, y0, x1, y1);
  ctx.restore();
}

function showDetails(i: number): void {
  const sprite = current?.meta.sprites[i];
  if (!current || !sprite) {
    details.innerHTML = `<p class="muted">${current?.meta.name ?? ''} #${i}: empty slot</p>`;
    return;
  }
  const solidSides = (['left', 'right', 'top', 'bottom'] as const).filter((s) => sprite.solid[s]);
  const rows: [string, string][] = [
    ['sprite', `${current.meta.name} #${i} (level index ${i} or ${i + SET_SIZE})`],
    ['flags', `0x${sprite.flags.toString(16).padStart(2, '0')} ${flagNames(sprite.flags).join(', ') || '—'}`],
    ['action', `${sprite.action} ${ACTION_NAMES[sprite.action] ?? '?'}`],
    ['init', `${sprite.init} ${INIT_NAMES[sprite.init] ?? ''}`],
    ['param', String(sprite.param)],
    ['touch', `${sprite.touch}${sprite.flags & 0x40 ? ` ${TOUCH_NAMES[sprite.touch & 7] ?? ''}` : ''}`],
    ['box', `x ${sprite.bbox.x}, y ${sprite.bbox.y}, w ${sprite.bbox.w}, h ${sprite.bbox.h}`],
    ['solid', solidSides.join(', ') || '—'],
    ['status bytes', sprite.status.join(' ')],
    ['size bytes', sprite.size.join(' ')],
  ];
  details.innerHTML = `<table class="mono">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
}

grid.addEventListener('click', (e) => {
  const rect = grid.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * grid.width;
  const py = ((e.clientY - rect.top) / rect.height) * grid.height;
  const col = Math.floor((px - GAP) / PITCH);
  const row = Math.floor((py - GAP) / PITCH);
  if (col < 0 || col >= ATLAS_COLUMNS || row < 0 || row >= ROWS) return;
  selected = row * ATLAS_COLUMNS + col;
  draw();
  showDetails(selected);
});

setSelect.addEventListener('change', () => void showSet(setSelect.value));
boxesCheck.addEventListener('change', draw);

async function main(): Promise<void> {
  const manifest = await loadManifest();
  for (const name of manifest.spriteSets) setSelect.add(new Option(name, name));
  const wanted = location.hash.slice(1);
  const initial = manifest.spriteSets.includes(wanted) ? wanted : manifest.spriteSets[0]!;
  setSelect.value = initial;
  await showSet(initial);

  const sounds = $<HTMLDivElement>('sounds');
  for (const name of manifest.sounds) {
    const button = document.createElement('button');
    button.textContent = `▶ ${name}`;
    button.addEventListener('click', () => void new Audio(soundUrl(name)).play());
    sounds.append(button);
  }

  const screens = $<HTMLDivElement>('screens');
  for (const name of manifest.screens) {
    const figure = document.createElement('figure');
    figure.innerHTML = `<img class="pixelated" src="${screenUrl(name)}" alt="${name}"><figcaption class="muted">${name}</figcaption>`;
    screens.append(figure);
  }
}

main().catch((err: unknown) => {
  details.textContent = `Failed to load: ${String(err)}. Did you run "npm run assets"?`;
  console.error(err);
});
