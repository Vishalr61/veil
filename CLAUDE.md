# CLAUDE.md — VEIL

Guidance for working in this repo. **Read the source before changing it; source is ground truth, not this file.** If anything here disagrees with the code, the code wins — fix this file.

VEIL is a neon territory-capture arcade game (Qix/Xonix/paper.io lineage): draw lines through a dark veil, close loops to claim territory and reveal the cosmos beneath, survive the hunters. Plain **Vite + TypeScript + Canvas 2D** — no game engine, no sprites. Ships to the web (live on Vercel from `main`), installs as a PWA, and wraps to iOS/Android via Capacitor.

The three difficulties are **distinct themed worlds, not sliders**: **Easy = Bloom** (a calm bioluminescent garden — the default the app opens in), **Medium = The Grid** (a synthetic neon-circuit world, fuse-only), **Hard = the campaign** (the original timed seven-zone cosmos, which is also the daily's baseline). See **Modes** below — it's the most important recent architecture and the thing to understand before touching world-gen or render.

## Commands

```bash
npm run dev        # vite dev server (http://localhost:5173)
npm run build      # tsc --noEmit && vite build   ← Vercel deploys main; this MUST stay green
npm run typecheck  # tsc --noEmit
npm run test       # vitest run
```

**Every change must keep `tsc --noEmit` and `vite build` green** — `main` auto-deploys to Vercel. Run the full gate (typecheck + vitest + build) before considering anything done.

## Architecture

One `requestAnimationFrame` loop in `legacy.ts` drives `update(dt)` then `render()`. Everything reads and writes one shared mutable state object, `G`.

```
src/
├── main.ts        entry: font imports, the tap-to-begin audio gate, imports legacy
├── legacy.ts      the orchestrator — input handlers, initLevel, the update() loop,
│                  flow (startGame/winLevel/nextLevel/death-finalize), render glue
├── core/
│   ├── bands.ts       the 7 zone palettes + RIFT_BAND (daily) + BLOOM_BAND/GRID_BAND
│   │                  (themed-mode zones, outside the BANDS array), LEVELS_PER_BAND, bandForLevel
│   ├── palettes.ts    colour helpers
│   ├── constants.ts   cell states (EMPTY/FILLED/TRAIL/OBSTACLE), COMBO_WINDOW, etc.
│   ├── dims.ts        grid dims (COLS/ROWS/CELL), canvas size (CW/CH), offsets, safe area
│   ├── grid.ts        cell <-> pixel <-> index helpers
│   ├── math.ts        clamp/lerp/rand/TAU
│   └── rng.ts         SeededRng (mulberry32) + fork() — the determinism backbone
├── sim/               DETERMINISTIC world generation (seeded; affects outcome)
│   ├── terrain.ts     obstacle layout by motif (open/pillars/veins/blobs) +
│   │                  assignObstacleKinds (garden/circuit object KINDS for Bloom & Grid)
│   └── veil.ts        hidden veil board: caches (reward) + rifts (hazard), exposure-weighted
├── game/
│   ├── state.ts       G — the single source of truth (see below)
│   ├── difficulty.ts  the THREE MODES: DiffConfig levers + effectiveDiff (daily forces Hard)
│   ├── blueprints.ts  what each level IS: authored L1.. + procedural fallback; DAILY_FLOORS=10;
│   │                  per-mode bloomBlueprint / gridBlueprint / dailyBlueprint
│   ├── enemies.ts     spawn tables + per-frame AI; ENEMY_INFO cards
│   ├── player.ts      movement, the fuse, collisions/death (timeoutDeath, triggerDeath)
│   ├── capture.ts     the flood-fill claim, scoring, combo, veil resolution
│   ├── powerups.ts    weighted spawn table + applyPickup effects
│   ├── particles.ts   particles / popups / ambient motes (presentation only)
│   ├── leaderboard.ts local top-N table (localStorage)
│   └── stats.ts       lifetime totals (localStorage)
├── render/
│   ├── surface.ts     the canvas + 2D ctx
│   ├── geometry.ts    button rects + hit-testing (menu/pause/scores)
│   ├── primitives.ts  glowText, luminousTitle/Button, drawGlowOrb, roundRect
│   ├── background.ts  per-zone nebula generators (presentation; uses Math.random)
│   ├── world.ts       the board, veil/fog, obstacles, enemies (molecules), the player
│   ├── hud.ts         the top bar (score, reveal %, target, level clock, lives, mute)
│   └── overlays.ts    menu / scores / level-clear / game-over cards / attract backdrop
├── audio/
│   ├── audio.ts       Web Audio master + buses, mute, SFX synths, initAudio/resumeAudio
│   └── music.ts       procedural look-ahead music scheduler (intensity + per-zone themes)
├── daily/daily.ts     date keys, seedFromDateKey, streak helpers, share text
└── platform/          haptics.js (Capacitor, fails silent off-device), share.ts
```

## The `G` state object (`game/state.ts`)

`G` is a single `const` object **mutated by property** (ES-module live bindings are read-only for importers, so it can't be a set of exported `let`s). Every system reads and writes it directly — there is no event bus or store. Examples that matter:

- Run/flow: `state` (scene: `menu | playing | paused | levelclear | gameover | scores`), `level`, `score`, `lives`, `percent`, `target`, `combo`/`comboT`.
- The fuse lives here: `fuseT`, `fuseMax`. The level clock: `levelT`, `levelTimeMax`.
- Power-up timers: `enemyFreezeT`, `enemySlowT`, `surgeT`, `scanT`, `shield`.
- `rng` (the seeded sim stream, re-forked per level), `gameSeed`, `isDaily`, `diff` (`easy | medium | hard`, persisted). Read difficulty via `effectiveDiff()`, never `G.diff` directly — the daily forces Hard.
- `obstacleKind` (Uint8Array parallel to `grid`): the per-cluster object KIND for Bloom/Grid terrain; empty (length 0) in the campaign.
- Presentation-only fields (`shakeAmt`, `flash`, `zoom`, `hitstop`, particles, nebula) are explicitly walled off from the deterministic sim.

## Modes — three themed worlds (`game/difficulty.ts`)

Difficulty is **not** a set of sliders over one game; each mode is its own world with its own palette, terrain, enemy presentation, and music. The mode is chosen on the menu, persisted (`loadDiff`/`setDiff`, default `easy`), and **everything routes off it in `initLevel`**:

```ts
const diff = effectiveDiff();              // daily → forces Hard, so the seeded board + rules match for everyone
const isBloom = diff.key === 'easy'   && !G.isDaily;   // Bloom garden
const isGrid  = diff.key === 'medium' && !G.isDaily;   // The Grid
G.pal = G.isDaily ? RIFT_BAND : isBloom ? BLOOM_BAND : isGrid ? GRID_BAND : bandForLevel(lv);
if (isBloom) bp = bloomBlueprint(bp, lv); else if (isGrid) bp = gridBlueprint(bp, lv);
```

- **`DiffConfig`** (one per mode: `easy`/`medium`/`hard`) is **pure levers** — `fuse`/`clock` on-off, hero `heroBase/heroRamp/heroCap/heroLevelCap`, enemy `speedBase/speedRamp/speedCap/countDelta`, `targetDelta`, `riftScale`, `scoreMult`, etc. The pure helpers (`playerSpeed`, `enemySpeed`, `fuseWindow`, `levelClock`, `clearTarget`, `applyDiffCounts`) take a `DiffConfig` and are unit-tested without standing up the game.
- **Easy = Bloom:** no clock, no fuse, near-flat speed (cap 12, holds at L10). Difficulty rises via enemy count / maze / hazard / reward, never twitch. Built by `bloomBlueprint`; bypasses `applyDiffCounts` (its roster is authored).
- **Medium = The Grid:** **fuse-only** (line-close spark stays, level clock off). Hero + enemies mirror Bloom's *structure*, a gentle step higher. Built by `gridBlueprint`.
- **Hard = the campaign:** the original timed + fused seven-zone game (the old Medium, parked here). `bandForLevel` palettes, the full hunter roster.
- **`effectiveDiff()` is the contract:** systems call it, not `G.diff`. The daily always returns Hard so the seeded board AND the rules are identical for every player.
- **Themed bands sit outside `BANDS`:** `BLOOM_BAND` / `GRID_BAND` / `RIFT_BAND` are deliberately not in the 7-zone array, so adding a mode never shifts the campaign's level→band mapping.
- **Obstacle KINDS:** for Bloom/Grid, `assignObstacleKinds` (in `terrain.ts`, pure) flood-fills each obstacle cluster and tags it a garden/circuit object (boulder/log/bush/flowerbed/crystal in Bloom; the circuit-component set in Grid), rendered distinctly in `world.ts`. Kinds **stagger in** (one new kind every ~2 floors), and each board is capped to **≤3 distinct kinds**, rotated per floor via the optional `allowed` palette. KIND is presentation only — it never changes whether a cell blocks.

## Band + blueprint system

- `bands.ts`: **7 authored zones** (the depths → … → deep space) plus **`RIFT_BAND`** (the daily's own zone, deliberately outside the `BANDS` array so it never shifts the campaign mapping). `LEVELS_PER_BAND = 5`; `bandForLevel(level)` maps level → band and clamps to the last band past the end.
- `blueprints.ts`: `blueprintForLevel(lv)` returns a `LevelBlueprint` (title, motif, density, target, caches, rifts, enemies, depth). Early levels are **authored**; beyond them it falls back to the original **procedural formulas**, so endless and deep-daily play are unchanged. `initLevel` consumes a blueprint and **never branches on the level number itself**.
- Per-mode blueprints **wrap** the base: `bloomBlueprint(bp, lv)` / `gridBlueprint(bp, lv)` re-skin terrain + roster for their world (see **Modes**); the campaign uses `blueprintForLevel` directly.
- Daily: `dailyBlueprint(floor)` over `DAILY_FLOORS = 10`.
- Summits get a boss: `lv % LEVELS_PER_BAND === 0` (or the daily's last floor) spawns **THE QIX**.

## Enemies

Roster (`enemies.ts`), rendered as **molecules** in `world.ts` (`molNode` + `draw*Body`): `drifter` (straight bouncer), `chaser` (re-aims at you), `cutter` (races to slice your line), `charger` (a lane guard — patrols a row, telegraphs, then dashes across it; its own patrol/windup/dash state machine in `moveEnemy`), `wraith` (daily; blinks toward you), and **`qix`** (the vast summit boss that shrinks as you claim the board). `sentinel` and `sleeper` exist but are disabled (count 0). The **Grid** presents the `chaser` as **TRACER** (blue) and leans on `charger`; the molecule style is shared across modes, only colour/identity differs. The player is a molecular "hero" atom.

## Determinism — the rule that protects the daily

The daily challenge hands **every player the same board** by seeding `SeededRng` from the date (`daily.ts` → `seedFromDateKey`), then forking per subsystem. **`effectiveDiff()` forces the daily to Hard** so the *rules* match the *board*. Therefore:

- **Never introduce `Math.random` into world generation** — terrain, veil placement, enemy spawns, power-up rolls must draw from a seeded stream (`G.rng` / a fork). The `veil.test.ts` "same seed → identical board" test guards this.
- **Presentation is exempt and intentionally uses `Math.random`**: particles, nebula art (`render/background.ts`), screen shake, motes, ambient fx. These never affect outcome. Keep that line clean — sim is seeded, presentation is free.
- **Bloom & the Grid never run the daily**, so their *presentation-only* choices (which object KIND a cluster renders as, the per-floor KIND palette) may use `Math.random` or a non-daily seed freely — they don't change whether a cell blocks. The seeded sim (terrain layout, veil, spawns) stays seeded regardless of mode.

## Guardrails for agents

- **Read the source first.** It is ground truth. Verify claims against the code, not against memory or this file.
- **Never rewrite game logic to make a test pass.** If a test fails, diagnose why; if it surfaces a real bug, report it and ask — don't paper over it.
- **Never write a test that merely ratifies current behavior.** Assert *correct* behavior. A test that encodes a bug as "expected" is worse than no test.
- **Keep `tsc --noEmit` and `vite build` green at every step** — `main` deploys to Vercel.
- **Do not touch, unasked:** the input layer (WASD/arrows + the touch joystick in `legacy.ts`), the capture/flood-fill loop (`capture.ts`), or the obstacle/terrain *layout* (`genObstacles` in `sim/terrain.ts`). The obstacle **KIND/render** layer (`assignObstacleKinds` + `drawBloomRock`/Grid render) is the per-mode visual surface and is fair game when the task is about mode identity.
- **Modes route off `effectiveDiff().key`** in `initLevel` (`isBloom`/`isGrid`); the campaign is the fallback. Add mode behaviour there and in `difficulty.ts`/the per-mode blueprint, not by branching on the level number.
- **Respect determinism:** no `Math.random` in `sim/` or generation paths.
- Work in small reviewable increments; run the full gate before declaring done.
