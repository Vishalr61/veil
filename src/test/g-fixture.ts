/* Shared test fixture for the game-logic unit tests. Imports browser-env FIRST
   so the shared mutable `G` (and the modules that touch it) load under node,
   then re-exports the bits tests need plus a resetG() that returns G to a clean
   mid-play baseline. Tests mutate G directly (that's how the real systems work). */
import './browser-env';
import { G } from '../game/state';
import { COLS, ROWS, CELL } from '../core/dims';
import { EMPTY, FILLED, TRAIL, COMBO_WINDOW } from '../core/constants';

export { G, COLS, ROWS, CELL, EMPTY, FILLED, TRAIL, COMBO_WINDOW };

// A fresh player at cell 0, stopped, on a clean empty grid — a known baseline so
// each test sets only what it cares about.
export function freshPlayer() {
  return { from: 0, to: 0, t: 0, dir: null as any, stopped: true, px: { x: 0, y: 0 }, tail: [] as any[], invuln: 0 };
}

export function resetG() {
  G.state = 'playing';
  G.diff = 'medium'; G.isDaily = false;   // Medium = today's tuning; the difficulty helpers read these
  G.level = 1;
  G.lives = 3;
  G.combo = 0; G.comboT = 0;
  G.maxCombo = 0; G.runCaches = 0;
  G.hasTrail = false; G.trailCells = []; G.trailPoints = [];
  G.fuseT = 0; G.fuseMax = 6;
  G.levelT = 0; G.levelTimeMax = 60;
  G.target = 0.68;
  G.surgeT = 0; G.enemyFreezeT = 0; G.enemySlowT = 0; G.shield = false;
  G.deathFreeze = 0; G.hitstop = 0; G.timeScale = 1; G.timeScaleTarget = 1;
  G.baseSpeed = 9.5;
  G.enemies = []; G.particles = []; G.popups = []; G.pickups = []; G.revealQueue = [];
  G.veilBoard = new Uint8Array(0);
  G.pickupSpawnT = 6;
  G.onboarding = false; G.firstMoveDone = false; G.hintActive = false;
  G.player = freshPlayer();
  G.buffered = null;
  G.grid = new Uint8Array(COLS * ROWS);   // all EMPTY (0)
}

export const popupTexts = () => G.popups.map((p: any) => String(p.text));
export const hasPopup = (needle: string) => popupTexts().some((t) => t.includes(needle));
export const cellAt = (col: number, row: number) => row * COLS + col;
