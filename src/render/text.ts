// Text in the original's own font: the "letters" sprite set, one 24x24
// sprite per character, as the original print() draws it (EB.C:319-350,
// PyElectroMan emmenu.Letters.print_text). '*' starts a new line; the text
// block is centred in the given area.

import { TILE } from '../data/types.ts';

/** Characters in sprite order: index 0 is a space, then a-z, Polish letters, digits, punctuation. */
const CHARS = ' abcdefghijklmnopqrstuvwxyząćęłńóśż0123456789:|?()_';

export interface Glyph {
  sprite: number;
  x: number;
  y: number;
}

/** Where each character of `text` goes in an area of w x h pixels (spaces and unknown characters leave a gap). */
export function layoutText(text: string, w: number, h: number): Glyph[] {
  const lines = text.toLowerCase().split('*');
  const glyphs: Glyph[] = [];
  let y = Math.floor((h - TILE * lines.length) / 2);
  for (const line of lines) {
    let x = Math.floor((w - TILE * line.length) / 2);
    for (const ch of line) {
      const sprite = CHARS.indexOf(ch);
      if (sprite > 0) glyphs.push({ sprite, x, y });
      x += TILE;
    }
    y += TILE;
  }
  return glyphs;
}
