/* =========================================================================
   Earth-to-space bands — the progression journey.

   Each band is a few levels and has its own palette + backdrop style, so
   ascending visibly moves you from molten depths up through caves, ocean,
   surface, sky, aurora, and out to deep space. Replaces arbitrary palette
   cycling with a sense of place. (A Band is shaped like a palette plus a
   `style` flag, so existing `pal.blobs / pal.edge / ...` usage just works.)
   ========================================================================= */

export interface Band {
  name: string;
  style: string; // backdrop flavor: magma|caves|ocean|surface|sky|aurora|space
  blobs: string[];
  star: string;
  edge: string;
  edge2: string;
  trail: string;
  player: string;
  accent: string;
}

export const BANDS: Band[] = [
  { name: 'the depths', style: 'magma', blobs: ['#0a0202', '#3a0e08', '#8a1e0e', '#ff5a1e', '#ffc24f'],
    star: '#ffd9b0', edge: '#ff7a3a', edge2: '#ffc88f', trail: '#fff0e0', player: '#ffffff', accent: '#ff8a3a' },
  { name: 'crystal caves', style: 'caves', blobs: ['#0a0612', '#1c0e34', '#4a1e72', '#a64dff', '#e89dff'],
    star: '#f3e0ff', edge: '#c060ff', edge2: '#e8b8ff', trail: '#f6ecff', player: '#ffffff', accent: '#d070e8' },
  { name: 'the abyss', style: 'ocean', blobs: ['#02080c', '#063b42', '#0a8d82', '#23e0c8', '#86ffe8'],
    star: '#d8fff8', edge: '#39f0e0', edge2: '#aafff2', trail: '#eafffb', player: '#ffffff', accent: '#5ffbd0' },
  { name: 'the surface', style: 'surface', blobs: ['#06100a', '#143018', '#2e6e2e', '#5ec24f', '#bfff8f'],
    star: '#eaffe0', edge: '#7adf6a', edge2: '#c8ffb0', trail: '#f0ffe8', player: '#ffffff', accent: '#8aff6a' },
  { name: 'open sky', style: 'sky', blobs: ['#081628', '#143a5e', '#2e6ea0', '#6ab0e8', '#cfe8ff'],
    star: '#ffffff', edge: '#a8d4ff', edge2: '#e0f2ff', trail: '#f4fbff', player: '#ffffff', accent: '#9ccfff' },
  { name: 'aurora', style: 'aurora', blobs: ['#04081a', '#0e2a3a', '#1e7a5e', '#4fffb0', '#c0a0ff'],
    star: '#eafff4', edge: '#6affc0', edge2: '#c8ffe6', trail: '#f0fff8', player: '#ffffff', accent: '#a07aff' },
  { name: 'deep space', style: 'space', blobs: ['#060616', '#191642', '#3a2b8a', '#7a5cff', '#c2a0ff'],
    star: '#eae6ff', edge: '#9a7aff', edge2: '#d6c8ff', trail: '#f0ecff', player: '#ffffff', accent: '#b89aff' },
];

export const LEVELS_PER_BAND = 5;

export function bandForLevel(level: number): Band {
  const i = Math.floor((level - 1) / LEVELS_PER_BAND);
  return BANDS[Math.min(i, BANDS.length - 1)]; // stay in deep space past the last band
}
