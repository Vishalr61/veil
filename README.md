<div align="center">

```
██╗   ██╗ ███████╗ ██╗ ██╗
██║   ██║ ██╔════╝ ██║ ██║
██║   ██║ █████╗   ██║ ██║
╚██╗ ██╔╝ ██╔══╝   ██║ ██║
 ╚████╔╝  ███████╗ ██║ ███████╗
  ╚═══╝   ╚══════╝ ╚═╝ ╚══════╝
```

### draw light into the dark

A neon territory-capture arcade game. Carve loops through a living veil, reveal the cosmos hiding beneath it, and outrun the things that hunt you in the dark.

**[▶ Play now — veilgame.vercel.app](https://veilgame.vercel.app)**

[![play](https://img.shields.io/badge/play-veilgame.vercel.app-6fd8ff?style=for-the-badge)](https://veilgame.vercel.app)
&nbsp;
![tests](https://img.shields.io/badge/tests-31%20passing-5cf0b0?style=for-the-badge)
&nbsp;
![price](https://img.shields.io/badge/price-free-ffce5c?style=for-the-badge)

![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Canvas](https://img.shields.io/badge/Canvas_2D-no_engine-ff7ad0)
![Capacitor](https://img.shields.io/badge/Capacitor-iOS%20%2B%20Android-119EFF?logo=capacitor&logoColor=white)
![Web Audio](https://img.shields.io/badge/audio-procedural-b9a6ff)
![PWA](https://img.shields.io/badge/PWA-installable-7dffd0)

</div>

---

## ✶ The pitch

**Qix × Xonix × paper.io**, reimagined as a duel between light and dark.

The board starts black. Every cell hides something. You move along the edges of what you've claimed and **draw a line out into the void** — the second that line loops back to safe ground, everything it enclosed snaps to light, the nebula blazes through, and the score rolls.

But the dark bites back. The longer a line stays open, the closer the **fuse** burns to detonation. Hunters track your trail. A clock is always ticking. And the only way to learn what the veil is hiding — treasure or trap — is to **cut into it and find out.**

> The biggest blind cut reveals the most. It also risks the most. That's the whole game.

---

## ◈ How it plays

| | Desktop | Mobile |
|---|---|---|
| **Steer** | `WASD` / arrow keys | drag anywhere (floating joystick) |
| **Start / confirm** | `Enter` / click **PLAY** | tap **PLAY** |
| **Pause** | `P` / `Esc` | pause button (top-right) |
| **Mute · reduce motion** | `M` · `R` | pause-menu toggles |

**The loop:**

1. **Draw.** Leave safe ground and trace a line through the dark.
2. **Close it.** Touch claimed ground again to enclose territory — the enclosed area floods with light and scores. Bigger cuts pay exponentially more.
3. **Survive the draw.** While a line is open you're exposed: the **fuse** is counting down, **cutters** sprint for the base of your line, and a touched trail is death.
4. **Hit the target.** Reveal enough of the floor before the **clock** runs out to clear it and climb.
5. **Chase the number.** Chain captures for a rising multiplier. Beat your best. Repeat.

---

## ◐ What's under the veil

Capturing is the *only* way to see what a cell was hiding. Two things live in the dark:

- **✦ Caches** — pure reward. Weighted toward the *deepest, most exposed* cells, so boldness out-scores nibbling.
- **✶ Rifts** — traps. Reveal one blind and it snaps your chain, shakes the screen, and bites.

Get close and you can *sense* the disturbance ahead of a cut. Or grab a **SCAN** power-up and light the whole board up at once — then carve a daring path toward the gold and around the red.

---

## ✦ Features

### Seven hand-built worlds + a secret eighth
Each is a bespoke look, not a recolor — its own nebula, ambient particles, veil texture, and palette.

`the depths` 🜂 · `crystal caves` 💎 · `the abyss` 🌊 · `the overgrowth` 🌿 · `the expanse` 🌅 · `aurora` 🎐 · `deep space` 🌌 · and **`the rift`** ⚡ — reserved for the Daily.

### A cast that hunts differently
| Enemy | Behavior |
|---|---|
| **Drifter** | Bounces in a straight line, ignores you. The honest baseline. |
| **Chaser** | Periodically re-aims dead at you. Hunts you *and* your open trail. |
| **Cutter** | The instant you start drawing, beelines for the base of your line to slice it. |
| **Wraith** | *(Daily)* Holds still, telegraphs, then **blinks** five cells toward you. |
| **The Qix** | *(Summits)* A vast, slow boss roamer that **shrinks as you claim the board.** |

### Power-ups
| | | | |
|---|---|---|---|
| ✦ **Score** | ❄ **Freeze** enemies | 🐌 **Slow** | 🛡 **Shield** |
| ❤ **+1 Life** | 👁 **Scan** the veil | ⧗ **Time** (+clock) | ⚡ **Surge** / 💥 **Bomb** *(Daily)* |

### The Daily — *The Rift*
A self-contained **10-floor gauntlet** on a prismatic map, deterministically seeded from the date — **everyone gets the same run.** New enemies, new hazards, panic power-ups, and a **streak** that rewards showing up every day.

### Game feel that lands
Area-scaled spark bursts, a slow-mo **hitstop** "savor" beat on big cuts, chain milestones, layered haptics, screen shake and zoom kicks — all of it tunable, all of it killable via **reduce-motion**.

### A soundtrack that writes itself
No audio files. A **procedural Web Audio engine** schedules a layered groove (kick / hats / snare / bass / arp), builds intensity as you climb, and drops fills and section changes so a long session never loops on you. Punchy SFX for every cut, claim, blink, and clear.

### Built to chase a high score
A local leaderboard, **lifetime stats** (runs, caches, best chain ever, farthest level), live "NEW BEST!" celebrations the moment you pass your old self, and a game-over recap of the run.

### Plays anywhere
One Canvas-2D codebase ships to the **web**, installs as a **PWA**, and wraps into native **iOS + Android** apps via Capacitor — with safe-area insets, haptics, and a native share sheet.

---

## ⚙ Under the hood

No game engine. No sprites. Everything you see is **drawn live to a single `<canvas>`** every frame, and everything the Daily hides is **deterministic** — same seed in, same board out, for every player.

```
src/
├── core/      grid · dims · seeded RNG · math · palettes (the 8 bands)
├── sim/       terrain + the veil-as-discovery board (deterministic)
├── game/      state · blueprints · enemies · capture/flood-fill · player
│              · power-ups · particles · leaderboard · lifetime stats
├── render/    background nebulae · world · HUD · overlays · primitives
├── audio/     procedural music scheduler + SFX synth
├── daily/     date-seeded challenge keys + streaks
├── platform/  haptics (Capacitor, fails silent off-device)
└── legacy.ts  the orchestrator: input, update loop, render glue
```

**Things worth knowing:**

- **Deterministic by design.** The Daily seeds a `SeededRng` from the date; terrain, enemy spawns, hidden caches/rifts, and power-up rolls all draw from it. A test suite pins *same seed → identical board.*
- **Capture is a flood fill.** Closing a loop runs a reach-test outward from the enemies; everything they *can't* reach becomes yours. The value curve rewards bold sweeps and a combo window rewards speed.
- **Glow without melting the GPU.** Per-frame bloom uses additive `globalCompositeOperation = 'lighter'` fake-glow, never per-cell `shadowBlur` — so it holds 60fps on a phone.
- **The clock is the soul.** An Airxonix-style level timer turns "reveal the board" into "reveal it *fast*," and the open-line fuse turns every draw into a held breath.

---

## ▶ Run it

**Web**
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build → dist/
npm run preview    # serve the production build
```

**Quality gates**
```bash
npm run typecheck  # tsc --noEmit
npm run test       # vitest (31 tests)
```

**Mobile (Capacitor)**
```bash
npm run sync       # build + cap sync (both platforms)
npm run ios        # build, sync, open Xcode
npm run android    # build, sync, open Android Studio
```

> Visual iteration uses Playwright screenshots — see `scripts/*.mjs` (menu, capture, scores) for headless captures against the dev server.

---

## ✎ Design notes

A few opinions baked into the code:

- **Light *is* the reward.** Revealed ground always reads brighter than the covered veil. You are literally pushing back the dark.
- **Boldness should win.** Deep caches, exponential cut value, and a bold-clear bonus for overshooting the target all pay you to take the scary line.
- **Readable, not noisy.** Each enemy is a distinct silhouette with one legible behavior. Each zone is a place. Each power-up is one clear idea.
- **Respect the player's body.** Every shake, zoom, and slow-mo is gated behind reduce-motion; every haptic behind a toggle.

---

## ⟶ Roadmap

- [x] Eight bespoke worlds + the Rift daily
- [x] Veil-as-discovery, the fuse, the level clock, the Qix boss
- [x] Procedural music + SFX, capture juice, haptics
- [x] Local leaderboard, daily streaks, lifetime stats
- [ ] Global daily leaderboard (the Daily is already deterministic — perfect substrate)
- [ ] Cosmetic unlocks (hero / trail / zone skins)
- [ ] Near-miss slow-mo, achievements, deeper per-zone music

---

<div align="center">

**VEIL** — cut into the dark and see what it was hiding.

*Made with a canvas, a seed, and no engine.*

</div>
