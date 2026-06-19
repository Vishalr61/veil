/* Minimal browser globals for unit tests run under vitest's default `node`
   environment. Several modules touch the DOM at import time — constants.ts reads
   window.devicePixelRatio, and render/surface.ts (pulled in via core/dims.ts)
   does document.getElementById('game').getContext('2d'). doCapture builds a
   Path2D for the border, and the leaderboard/stats persist via localStorage.
   The game-logic tests never render, so stubs are enough to let the graph load.

   Import this FIRST in a test file (ES imports evaluate in source order), before
   any game/* import, so the globals exist when those modules evaluate. Grid dims
   keep their seeded defaults (COLS 24 / ROWS 44 / CELL 16) since computeLayout()
   is never called here. */
const g = globalThis as any;

if (!g.window) {
  g.window = { devicePixelRatio: 2, innerWidth: 430, innerHeight: 932 };
}
if (!g.document) {
  const stubCanvas = { width: 0, height: 0, style: {}, getContext: () => ({}) };
  g.document = { getElementById: () => stubCanvas, documentElement: {} };
}
if (!g.Path2D) {
  // capture.ts/recomputeBorderPath only calls move/line; a no-op shape is fine.
  g.Path2D = class { moveTo() {} lineTo() {} arcTo() {} closePath() {} arc() {} rect() {} };
}
if (!g.localStorage) {
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}
export {};
