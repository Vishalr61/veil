/* Color themes cycled per level, plus enemy colors. Pure data. */
export const PALETTES = [
  { name: 'aurora', blobs: ['#0a2a43', '#0f5568', '#1b8a7a', '#2bd4a7', '#86ffd9'],
    star: '#dff9ff', edge: '#63fbef', edge2: '#bafff5', trail: '#eafffb', player: '#ffffff', accent: '#5ffbd0' },
  { name: 'violet', blobs: ['#190b3a', '#3a1d7a', '#6a34d6', '#a865ff', '#e6c6ff'],
    star: '#f1e6ff', edge: '#c69bff', edge2: '#ecdcff', trail: '#f6ecff', player: '#ffffff', accent: '#c89bff' },
  { name: 'ember', blobs: ['#2c0a26', '#5e1140', '#a8264f', '#e85d3a', '#ffb55a'],
    star: '#ffe9d6', edge: '#ff9d6e', edge2: '#ffd9b0', trail: '#fff0df', player: '#ffffff', accent: '#ff9b5a' },
  { name: 'ocean', blobs: ['#041f3a', '#0a4d8c', '#1683cf', '#37b6ff', '#9fe4ff'],
    star: '#e5f6ff', edge: '#7fdcff', edge2: '#cdf2ff', trail: '#ecfbff', player: '#ffffff', accent: '#6fd2ff' },
  { name: 'rose', blobs: ['#2a0b22', '#6a1450', '#b8327f', '#ff5fa8', '#ffc2e0'],
    star: '#ffe7f4', edge: '#ff8fc6', edge2: '#ffd2e8', trail: '#fff0f7', player: '#ffffff', accent: '#ff8fc6' },
];

export const ENEMY_COL = '#ff465c', ENEMY_GLOW = '#ff7a52';
export const CHASER_COL = '#ff44d4', CHASER_GLOW = '#ff7ae8';
