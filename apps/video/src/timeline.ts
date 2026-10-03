// The edit: which scene plays when. Boundaries are anchored to lyric lines and snapped to the beat
// grid (or on section downbeats), so they follow the aligned data (data/lyrics.json, data/audio.json).
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';

// Scene modules are discovered lazily so a missing/broken scene never breaks the build.
const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  /**
   * Cut on the last beat at/before the first word of the matching line (never after the word) — unless
   * the previous word is still being sung on that beat (a fast verse runs into the next section): then
   * as that word ends, so neither plate gets half a word.
   */
  const cut = (q: string, nth = 0, tol = 0.02) => {
    const first = ly.get(q, nth).words[0]!;
    const beat = au.timeOfBeat(Math.floor(au.beatAt(first.start + tol)));
    const prev = ly.words[first.gi - 1];
    return prev && prev.end > beat ? Math.min(prev.end, first.start) : beat;
  };
  /** Downbeat of bar k (bar 0 = the first downbeat; see SECTION_BARS in analysis/analyze.py). */
  const bar = (k: number) => au.downbeats[k]!;

  const b = {
    pile: cut('La burocrazia'),
    queue: cut('Busta verde'),
    follia: cut('La multa'),
    drop: cut('Il futuro è automatico', 0),
    inbox: cut('Mandagli'),
    hero: cut('Il futuro è automatico', 1),
    italia: cut('In un attimo'),
    phone: cut('Inoltro'),
    chant: cut('futuro autocratico', 0),
    outro: bar(31),
    end: au.duration,
  };

  const E = (id: string, file: string, start: number, end: number, extra: Partial<TimelineEntry> = {}): TimelineEntry =>
    ({ id, load: scene(file), start, end, ...extra });

  return [
    E('open', 'open', 0, b.pile),
    E('pile', 'pile', b.pile, b.queue),
    E('queue', 'queue', b.queue, b.follia),
    E('follia', 'follia', b.follia, b.drop),
    E('drop', 'drop', b.drop, b.inbox),
    E('inbox', 'inbox', b.inbox, b.hero),
    E('hero', 'hero', b.hero, b.italia),
    E('italia', 'italia', b.italia, b.phone),
    E('phone', 'phone', b.phone, b.chant),
    E('chant', 'chant', b.chant, b.outro),
    E('outro', 'outro', b.outro, b.end),
  ];
}
