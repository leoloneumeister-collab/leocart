import meadow from './meadow.js';
import dunes from './dunes.js';
import neon from './neon.js';

export const TRACKS = [meadow, dunes, neon];
export const TRACK_BY_ID = Object.fromEntries(TRACKS.map((t) => [t.id, t]));
