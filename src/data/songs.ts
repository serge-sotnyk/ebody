// The original's music: there is no music format, only "songs" written as
// strings of 2-4 second sound patterns chained without gaps and looped
// (PyElectroMan emsound.py, EB.C:184-202 and 1139-1295).
//
// The first character names the pattern files' prefix; each letter a-z adds
// one play of pattern <prefix><letter>; a modifier cuts the previous entry:
// '<' its first half, '>' its second half, '1'-'4' one of its quarters,
// '!' its first sixteenth.

/** Title screen, alternating tit1/tit2. */
export const TITLE_SONG =
  't' +
  'hhhhaaaabbbbbbbbc<c>c<c>c<c>c<c>bbbbbbbbdddddddd' +
  'c<c>c<c>c<c>c<c>e<e>e<e>e<e>e<e>j<j>j<j>j<j>j<j>' +
  'ffffffffhhhhdddd' +
  'bbbbbbbbc<c>c<c>c<c>c<c>ffffffffbbbbbbbb' +
  'c<c>c<c>c<c>c<c>e<e>e<e>e<e>e<e>' +
  'ffffffffggggdddd';
/** "Level completed" screen. */
export const LEVEL_SONG = 'cbbbbccccddddbbbbaaaaccccddddaaaa';
/** Final "congratulations" screen. */
export const END_SONG = 'eaaaabbbbccccddddbbbbcccceeee';

export interface SongEntry {
  /** Pattern file, e.g. "ta". */
  pattern: string;
  /** Part of the pattern to play, in samples. */
  offset: number;
  length: number;
}

/** The patterns a song uses (to load them). */
export function songPatterns(song: string): string[] {
  const prefix = song[0]!;
  return [...new Set([...song.slice(1)].filter((c) => c >= 'a' && c <= 'z').map((c) => prefix + c))];
}

/** A song as a list of pattern pieces; `lengths` gives each pattern's length in samples. */
export function parseSong(song: string, lengths: Record<string, number>): SongEntry[] {
  const prefix = song[0]!;
  const entries: SongEntry[] = [];
  for (const c of song.slice(1)) {
    if (c >= 'a' && c <= 'z') {
      const pattern = prefix + c;
      const length = lengths[pattern];
      if (length !== undefined) entries.push({ pattern, offset: 0, length });
      continue;
    }
    const e = entries.at(-1);
    if (!e) continue;
    if (c === '<') {
      e.length = Math.floor(e.length / 2);
    } else if (c === '>') {
      e.length = Math.floor(e.length / 2);
      e.offset += e.length;
    } else if (c >= '1' && c <= '4') {
      e.length = Math.floor(e.length / 4);
      e.offset += e.length * (c.charCodeAt(0) - 49);
    } else if (c === '!') {
      e.length = Math.floor(e.length / 16);
    }
  }
  return entries;
}

/**
 * Which picture the title screen shows while entry `position` plays: the
 * original redraws at every fourth pattern, alternating (EB.C:1222-1240).
 */
export const titlePicture = (position: number): 0 | 1 => (Math.floor((position + 1) / 4) % 2 ? 1 : 0);
