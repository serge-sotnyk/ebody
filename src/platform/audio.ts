// Sound effects and music through Web Audio.
//
// Effects: eight channels with priorities, like the original's driver
// (PyElectroMan SoundManager, EB.C:1410-1428): a new sound takes a free
// channel, else replaces the lowest-priority one if that is strictly lower,
// else it is dropped.
//
// Music: a song's pattern pieces (data/songs.ts) are scheduled back to back
// on the audio clock, a little ahead of time, so they join without gaps.
//
// Browsers keep audio silent until the page gets a click, tap or key press;
// unlock() is called on the first one.

import { soundUrl } from '../data/loader.ts';
import { parseSong, songPatterns, type SongEntry } from '../data/songs.ts';
import { SOUNDS, type SoundName } from '../sim/sounds.ts';

/** The original's sample rate: the .u8 sounds are 8 kHz. */
const RATE = 8000;
const CHANNELS = 8;
/** How far ahead music pieces are scheduled, seconds. */
const LOOKAHEAD = 0.6;

interface Channel {
  source: AudioBufferSourceNode | null;
  priority: number;
  ends: number;
}

export class SoundSystem {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<void>>();
  private channels: Channel[] = Array.from({ length: CHANNELS }, () => ({ source: null, priority: 0, ends: 0 }));
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private song: { entries: SongEntry[]; next: number; at: number; sources: AudioBufferSourceNode[]; timer: number } | null =
    null;
  /** Wall-clock start of the current song and its pieces' durations, for songPosition(). */
  private songClock: { start: number; durations: number[] } | null = null;
  private songName: string | null = null;

  constructor(public muted = false) {}

  /** True once the browser lets the page make sound. */
  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Create the audio context (silent until unlocked) and load sounds and songs' patterns. */
  async load(songs: readonly string[]): Promise<void> {
    this.context();
    const names = [...Object.values(SOUNDS).map((s) => s.file), ...songs.flatMap(songPatterns)];
    await Promise.all(names.map((n) => this.loadBuffer(n)));
  }

  /**
   * Call from a click, tap or key press: lets the browser start the audio.
   * A song that was waiting in silence then starts over, so pictures that
   * follow the music (the title screen) stay in step with what is heard.
   */
  unlock(): void {
    const ctx = this.context();
    if (ctx.state === 'running') return;
    void ctx.resume().then(() => {
      if (this.songName && ctx.state === 'running') this.playSong(this.songName);
    });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      for (const ch of this.channels) this.stopChannel(ch);
    }
    if (this.music) this.music.gain.value = muted ? 0 : 1;
  }

  play(name: SoundName): void {
    const ctx = this.ctx;
    const buffer = this.buffers.get(SOUNDS[name].file);
    if (!ctx || !buffer || this.muted || ctx.state !== 'running') return;
    const priority = SOUNDS[name].priority;
    const now = ctx.currentTime;
    let ch = this.channels.find((c) => c.ends <= now);
    if (!ch) {
      const lowest = this.channels.reduce((a, b) => (b.priority < a.priority ? b : a));
      if (priority <= lowest.priority) return;
      ch = lowest;
      this.stopChannel(ch);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.sfx!);
    source.start(now);
    ch.source = source;
    ch.priority = priority;
    ch.ends = now + buffer.duration;
  }

  /** Play a song (data/songs.ts) in a loop until stopSong() or another song. */
  playSong(song: string): void {
    this.stopSong();
    const lengths: Record<string, number> = {};
    for (const p of songPatterns(song)) {
      const b = this.buffers.get(p);
      if (b) lengths[p] = Math.round(b.duration * RATE);
    }
    const entries = parseSong(song, lengths);
    if (!entries.length) return;
    this.songName = song;
    this.songClock = { start: performance.now() / 1000, durations: entries.map((e) => e.length / RATE) };
    const ctx = this.context();
    const state = { entries, next: 0, at: ctx.currentTime + 0.05, sources: [] as AudioBufferSourceNode[], timer: 0 };
    this.song = state;
    const schedule = (): void => {
      if (this.song !== state) return;
      while (state.at < ctx.currentTime + LOOKAHEAD) {
        const e = state.entries[state.next % state.entries.length]!;
        const source = ctx.createBufferSource();
        source.buffer = this.buffers.get(e.pattern)!;
        source.connect(this.music!);
        source.start(state.at, e.offset / RATE, e.length / RATE);
        state.sources.push(source);
        source.onended = () => {
          state.sources = state.sources.filter((s) => s !== source);
        };
        state.at += e.length / RATE;
        state.next += 1;
      }
    };
    schedule();
    state.timer = window.setInterval(schedule, 150);
  }

  stopSong(): void {
    if (!this.song) return;
    clearInterval(this.song.timer);
    for (const s of this.song.sources) s.stop();
    this.song = null;
    this.songClock = null;
    this.songName = null;
  }

  /**
   * Which piece of the song is playing (counting on over loops), by the
   * clock: the title screen's pictures follow it even when sound is off.
   */
  songPosition(): number {
    const clock = this.songClock;
    if (!clock) return 0;
    const total = clock.durations.reduce((a, b) => a + b, 0);
    let t = performance.now() / 1000 - clock.start;
    const loops = Math.floor(t / total);
    t -= loops * total;
    let i = 0;
    while (i < clock.durations.length - 1 && t >= clock.durations[i]!) t -= clock.durations[i++]!;
    return loops * clock.durations.length + i;
  }

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.ctx.destination);
      this.music = this.ctx.createGain();
      this.music.gain.value = this.muted ? 0 : 1;
      this.music.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private loadBuffer(name: string): Promise<void> {
    let pending = this.loading.get(name);
    if (!pending) {
      pending = fetch(soundUrl(name))
        .then((r) => r.arrayBuffer())
        .then((data) => this.context().decodeAudioData(data))
        .then((buffer) => {
          this.buffers.set(name, buffer);
        })
        .catch(() => {
          // A missing sound only means silence.
        });
      this.loading.set(name, pending);
    }
    return pending;
  }

  private stopChannel(ch: Channel): void {
    try {
      ch.source?.stop();
    } catch {
      // already ended
    }
    ch.source = null;
    ch.priority = 0;
    ch.ends = 0;
  }
}
