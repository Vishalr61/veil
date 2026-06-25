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
  { name: 'the overgrowth', style: 'flora', blobs: ['#04120a', '#0c2c18', '#1e6e3a', '#3fd86a', '#b8ff9a'],
    star: '#e6ffd0', edge: '#5fe87a', edge2: '#c2ffb0', trail: '#eeffe0', player: '#ffffff', accent: '#7aff8a' },
  { name: 'the expanse', style: 'sky', blobs: ['#1a1838', '#3a2c54', '#9a5a7a', '#ff9e6a', '#ffe0c0'],
    star: '#fff2e0', edge: '#ffba70', edge2: '#ffe6c8', trail: '#fff4e8', player: '#ffffff', accent: '#ff9a7a' },
  { name: 'aurora', style: 'aurora', blobs: ['#04081a', '#0e2a3a', '#1e7a5e', '#4fffb0', '#c0a0ff'],
    star: '#eafff4', edge: '#6affc0', edge2: '#c8ffe6', trail: '#f0fff8', player: '#ffffff', accent: '#a07aff' },
  { name: 'deep space', style: 'space', blobs: ['#060616', '#191642', '#3a2b8a', '#7a5cff', '#c2a0ff'],
    star: '#eae6ff', edge: '#9a7aff', edge2: '#d6c8ff', trail: '#f0ecff', player: '#ffffff', accent: '#b89aff' },
];

// The Rift — the daily challenge's own zone. Deliberately NOT in the BANDS
// progression (it must not shift the campaign's per-level mapping); the daily
// flow uses it directly. A fractured prismatic void: cyan/magenta glitch splits
// over deep violet-black.
export const RIFT_BAND: Band = {
  name: 'the rift', style: 'rift', blobs: ['#04030a', '#170b26', '#3e1a66', '#b85cff', '#ead6ff'],
  star: '#f0e6ff', edge: '#9a6cff', edge2: '#d8c0ff', trail: '#f2ecff', player: '#ffffff', accent: '#c06cff',
};

// The Bloom — Easy mode's own zone (a lush bioluminescent garden), deliberately
// OUTSIDE the BANDS progression (like the Rift) so it never shifts the campaign
// mapping. Its own dedicated 'bloom' backdrop/terrain pipeline (crafted garden
// structures, glowing flora, drifting pollen) over a teal-bio palette, so Easy is
// one coherent, hand-built garden across every floor.
export const BLOOM_BAND: Band = {
  name: 'the bloom', style: 'bloom', blobs: ['#04140f', '#083020', '#0e7058', '#2fe0b0', '#a6ffe0'],
  star: '#e2fff4', edge: '#3fe8c0', edge2: '#bafff0', trail: '#eef6f2', player: '#ffffff', accent: '#dde8e4',
};

// The Grid — Medium mode's own zone: a synthetic neon-circuit world, the cold
// counterpart to Bloom's organic garden. Deliberately OUTSIDE the BANDS array
// (like the Rift + Bloom) so it never shifts the campaign mapping. Electric-blue
// traces + cyan over a deep-navy circuit field; the magenta signature lives in
// the backdrop + enemies (not the palette), so the player trail stays clean cyan.
export const GRID_BAND: Band = {
  name: 'the grid', style: 'grid', blobs: ['#03060f', '#08182e', '#0e4a8a', '#22b8ff', '#9fe8ff'],
  star: '#dff4ff', edge: '#2ad8ff', edge2: '#a0ecff', trail: '#eafaff', player: '#ffffff', accent: '#5fd0ff',
};

export const LEVELS_PER_BAND = 5;

export function bandForLevel(level: number): Band {
  const i = Math.floor((level - 1) / LEVELS_PER_BAND);
  return BANDS[Math.min(i, BANDS.length - 1)]; // stay in deep space past the last band
}
