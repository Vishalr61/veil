/* Bioluminescent Abyss — each level is a different glowing zone on a near-black
   deep-water base. blobs go dark[0] -> bright bioluminescent peak[4]. */
export const PALETTES = [
  { name: 'reef', blobs: ['#02080c', '#063b42', '#0a8d82', '#23e0c8', '#86ffe8'],
    star: '#d8fff8', edge: '#39f0e0', edge2: '#aafff2', trail: '#eafffb', player: '#ffffff', accent: '#5ffbd0' },
  { name: 'violet', blobs: ['#06061a', '#26144f', '#5e2bb8', '#a865ff', '#dcb8ff'],
    star: '#efe6ff', edge: '#b884ff', edge2: '#e2ccff', trail: '#f4ecff', player: '#ffffff', accent: '#c89bff' },
  { name: 'angler', blobs: ['#0a0410', '#3e0e3a', '#a01e72', '#ff4fa8', '#ffb0d8'],
    star: '#ffe6f4', edge: '#ff6fbc', edge2: '#ffc2e4', trail: '#fff0f8', player: '#ffffff', accent: '#ff8fcf' },
  { name: 'jelly', blobs: ['#0a0a06', '#3a2e0e', '#9c7a1e', '#ffcf5f', '#ffe9b8'],
    star: '#fff6e6', edge: '#ffd66f', edge2: '#ffe8c2', trail: '#fff8ec', player: '#ffffff', accent: '#ffd86a' },
  { name: 'plankton', blobs: ['#040a06', '#0e3a22', '#1e9c5a', '#4fffa0', '#b8ffd6'],
    star: '#e8fff0', edge: '#5fffae', edge2: '#c6ffdc', trail: '#f0fff6', player: '#ffffff', accent: '#7affb8' },
];

// Predators read as danger against the cool bioluminescence.
export const ENEMY_COL = '#ff3a4e', ENEMY_GLOW = '#ff6a4a';
export const CHASER_COL = '#ff3ad0', CHASER_GLOW = '#ff6ae0';
