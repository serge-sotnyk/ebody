import { describe, expect, it } from 'vitest';
import { END_SONG, LEVEL_SONG, parseSong, songPatterns, TITLE_SONG, titlePicture } from './songs.ts';

describe('songs', () => {
  it('lists the patterns a song needs', () => {
    expect(songPatterns(LEVEL_SONG).sort()).toEqual(['ca', 'cb', 'cc', 'cd']);
    expect(songPatterns(END_SONG).sort()).toEqual(['ea', 'eb', 'ec', 'ed', 'ee']);
    expect(songPatterns(TITLE_SONG).sort()).toEqual(['ta', 'tb', 'tc', 'td', 'te', 'tf', 'tg', 'th', 'tj']);
  });

  it('plays whole patterns for plain letters', () => {
    const entries = parseSong('xab', { xa: 100, xb: 50 });
    expect(entries).toEqual([
      { pattern: 'xa', offset: 0, length: 100 },
      { pattern: 'xb', offset: 0, length: 50 },
    ]);
  });

  it('cuts the previous entry with modifiers', () => {
    const lengths = { xa: 1000 };
    expect(parseSong('xa<', lengths)[0]).toEqual({ pattern: 'xa', offset: 0, length: 500 });
    expect(parseSong('xa>', lengths)[0]).toEqual({ pattern: 'xa', offset: 500, length: 500 });
    expect(parseSong('xa3', lengths)[0]).toEqual({ pattern: 'xa', offset: 500, length: 250 });
    expect(parseSong('xa!', lengths)[0]).toEqual({ pattern: 'xa', offset: 0, length: 62 });
  });

  it('turns the title song into its 144 entries', () => {
    const lengths = Object.fromEntries(songPatterns(TITLE_SONG).map((p) => [p, 16000]));
    const entries = parseSong(TITLE_SONG, lengths);
    expect(entries).toHaveLength([...TITLE_SONG.slice(1)].filter((c) => c >= 'a' && c <= 'z').length);
    // "c<c>": the first half of tc, then its second half.
    const i = entries.findIndex((e) => e.pattern === 'tc');
    expect(entries.slice(i, i + 2)).toEqual([
      { pattern: 'tc', offset: 0, length: 8000 },
      { pattern: 'tc', offset: 8000, length: 8000 },
    ]);
  });

  it('alternates the title pictures every four patterns, the first three on picture 0', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11].map(titlePicture)).toEqual([0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1]);
  });
});
