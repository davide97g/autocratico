// Which film the engine plays: the trailer (default) or another cut with its own track, analysis and
// edit (`?film=board`: the Board promo, src/board/). Each film keeps its data under data/<film>/ and its
// track at song/<film>.mp3.
export const FILM = new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('film') ?? 'trailer';
export const DATA_DIR = FILM === 'trailer' ? 'data' : `data/${FILM}`;
export const SONG = FILM === 'trailer' ? 'song/autocratico.mp3' : `song/${FILM}.mp3`;
