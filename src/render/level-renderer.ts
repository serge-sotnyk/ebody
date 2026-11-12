import type { LoadedSpriteSet } from '../data/loader.ts';
import { ATLAS_COLUMNS, SCREEN_COLS, SCREEN_ROWS, SET_SIZE, TILE, type LevelFile } from '../data/types.ts';
import { classifyTile, LevelSprites } from '../sim/tiles.ts';
import { composeScreen, type DrawOp, type LayerOrder } from './compose.ts';
import { PLAYFIELD_X, PLAYFIELD_Y } from './display.ts';

/** Draws a level's sprites from its two atlases. */
export class LevelRenderer {
  readonly sprites: LevelSprites;

  constructor(
    readonly level: LevelFile,
    private readonly sets: readonly [LoadedSpriteSet, LoadedSpriteSet],
  ) {
    this.sprites = new LevelSprites([sets[0].meta, sets[1].meta]);
  }

  /** Static picture of a screen, tiles as placed in the level. */
  drawScreen(ctx: CanvasRenderingContext2D, screen: number, order: LayerOrder): DrawOp[] {
    const { ops } = composeScreen(this.level, this.sprites, screen, order);
    this.drawOps(ctx, ops);
    return ops;
  }

  /** Clear the playfield and draw sprites in the given order. */
  drawOps(ctx: CanvasRenderingContext2D, ops: readonly DrawOp[]): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(PLAYFIELD_X, PLAYFIELD_Y, SCREEN_COLS * TILE, SCREEN_ROWS * TILE);
    for (const op of ops) this.drawSprite(ctx, op.sprite, PLAYFIELD_X + op.x, PLAYFIELD_Y + op.y);
  }

  drawSprite(ctx: CanvasRenderingContext2D, index: number, x: number, y: number): void {
    const set = this.sets[index < SET_SIZE ? 0 : 1];
    const cell = index % SET_SIZE;
    const sx = (cell % ATLAS_COLUMNS) * TILE;
    const sy = Math.floor(cell / ATLAS_COLUMNS) * TILE;
    ctx.drawImage(set.atlas, sx, sy, TILE, TILE, x, y, TILE, TILE);
  }

  /** Debug overlay: collision boxes of solid tiles (magenta) and objects (cyan); dashed sides are not solid. */
  drawBoxes(ctx: CanvasRenderingContext2D, ops: readonly DrawOp[]): void {
    ctx.save();
    ctx.lineWidth = 1;
    for (const op of ops) {
      const info = this.sprites.get(op.sprite);
      if (!info) continue;
      const kind = classifyTile(info);
      if (kind === 'background' || info.bbox.w <= 0 || info.bbox.h <= 0) continue;
      ctx.strokeStyle = kind === 'collision' ? '#ff00ff' : '#00e0ff';
      const x0 = PLAYFIELD_X + op.x + info.bbox.x + 0.5;
      const y0 = PLAYFIELD_Y + op.y + info.bbox.y + 0.5;
      const x1 = x0 + info.bbox.w - 1;
      const y1 = y0 + info.bbox.h - 1;
      const side = (solid: boolean, ax: number, ay: number, bx: number, by: number): void => {
        ctx.setLineDash(solid ? [] : [1, 2]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      };
      side(info.solid.top, x0, y0, x1, y0);
      side(info.solid.bottom, x0, y1, x1, y1);
      side(info.solid.left, x0, y0, x0, y1);
      side(info.solid.right, x1, y0, x1, y1);
    }
    ctx.restore();
  }
}
