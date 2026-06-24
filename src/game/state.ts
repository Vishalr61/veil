/* =========================================================================
   Shared mutable game state — the single source of truth.

   Every subsystem (capture, enemies, player, flow, render) reads and writes
   through this one object. It's a CONST object mutated by property, not a set
   of exported `let` bindings: ES module live bindings are read-only for
   importers, so primitives like `score` couldn't be reassigned from another
   module. Property mutation (`G.score = ...`) works everywhere.

   Persisted values (high score, daily streak, onboarding) are loaded from
   localStorage at startup in legacy.ts, right after this object is created.
   ========================================================================= */

import { COLS, ROWS } from '../core/dims';
import { SeededRng } from '../core/rng';
import { bandForLevel } from '../core/bands';

export const G = {
  // settings
  reduceMotion: false,
  controlMode: 'drag',   // mobile steering: 'drag' joystick | 'tap' a direction | 'swipe' a flick
  diff: 'medium',        // difficulty: 'easy' | 'medium' | 'hard' (the daily always runs medium)

  // grid + run identity
  grid: new Uint8Array(COLS * ROWS),
  veilBoard: new Uint8Array(0) as Uint8Array,   // hidden content per cell, revealed on capture
  state: 'menu',                    // scene machine: menu | playing | paused | dead | levelclear | gameover
  gameSeed: 1,                      // per-run seed; the daily challenge sets this to a date seed
  rng: new SeededRng(1),            // seeded simulation stream, re-forked per level in initLevel

  // daily challenge
  isDaily: false,
  dailyWon: false,   // cleared all 10 Rift floors (vs died) — drives the completion card
  dailyRunKey: '',
  dailyResultText: '',
  dailyBest: 0,
  dailyPlayedKey: '',
  dailyStreak: 0,
  dailyStreakDate: '',

  // onboarding
  onboarded: false,
  onboarding: false,
  firstMoveDone: false,

  // progression / scoring
  level: 1,
  score: 0, dispScore: 0,
  highScore: 0,
  prevHighScore: 0,   // best at the START of this run (for the game-over "+X over best")
  lastRank: 0,        // leaderboard rank of the just-finished run (0 = off the table)
  beatBestThisRun: false,   // fired the one-time "NEW BEST!" pop when the live score passed it
  maxCombo: 0, runCaches: 0,   // run summary stats for the game-over recap
  lives: 3,
  combo: 0, comboT: 0,
  percent: 0, dispPercent: 0,
  target: 0.68,
  baseSpeed: 9.5,
  time: 0, menuT: 0,
  lcTimer: 0, goTimer: 0,
  lastBonus: 0, lastTimeBonus: 0, lastOverBonus: 0,
  levelT: 0,           // seconds spent on the current level
  levelTimeMax: 60,    // level time budget — run out and you lose a life (Airxonix-style)

  // player + trail
  player: null as any, buffered: null as any,
  hasTrail: false, trailCells: [] as any[], trailPoints: [] as any[],
  fuseT: 0, fuseMax: 6,   // the "fuse": close your open line before the spark crawls its length
  joyActive: false, joyDir: null as any,   // held floating-joystick steer (set by touch input)

  // entities
  enemies: [] as any[], particles: [] as any[], rings: [] as any[], motes: [] as any[],
  popups: [] as any[], pickups: [] as any[], twinkles: [] as any[],
  revealQueue: [] as any[],

  // background art
  nebula: null as any, fog: null as any, pal: bandForLevel(1),
  bloomDecor: [] as any[],   // garden flora drawn on claimed (Bloom) land — flowers/pools/lilypads/glints
  obstacleKind: new Uint8Array(0) as Uint8Array,   // per-cell garden-object kind for Bloom obstacles (visual)

  borderPath: null as any,
  menuNebula: null as any, menuPal: null as any, menuStars: [] as any[],

  // presentation / fx (never affects the daily-deterministic sim)
  shakeAmt: 0, flash: 0, zoom: 1, introT: 0,   // introT: level fade-up/zoom-settle (1 -> 0)
  timeScale: 1, timeScaleTarget: 1,   // global slow-mo (death cinematic + capture hitstop)
  deathFreeze: 0, hitstop: 0, drawSoundLock: 0,
  enemyFreezeT: 0, enemySlowT: 0,     // power-up effects on enemies
  surgeT: 0,                          // daily SURGE: 2x score while active
  shield: false,
  pickupSpawnT: 6,
  shootingStars: [] as any[], shootTimer: 4,
  banner: { text: '', sub: '', t: 0 } as { text: string; sub: string; t: number; enemy?: string },
  hintActive: false,
};
