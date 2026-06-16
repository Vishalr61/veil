# veil

Draw light into the dark. A neon roguelite where every cut is a gamble on
what the veil is hiding.

Cut continuous lines through a dark veil to enclose space and reveal the
nebula beneath, while drifters hunt you. Hit the target percentage to clear
the level. Snake meets Qix with a reveal hook — evolving into a free mobile
roguelite (see `.claude/plans/` for the roadmap).

## Develop (web)

Vite + TypeScript. The game still lives in `src/legacy.js` and is being
carved into typed modules under `src/` phase by phase.

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # production build to dist/
```

## Mobile (Capacitor)

The web build is wrapped with Capacitor for iOS and Android.

```bash
npm run ios        # build, sync, and open the Xcode project
npm run android    # build, sync, and open Android Studio
npm run sync       # build + cap sync (both platforms) without opening
```

Then run on a device/simulator from Xcode or Android Studio. App id:
`dev.vishal.veil` (placeholder — change before store submission).

## Controls

- **Arrows / WASD** — move
- **P / Esc** — pause
- **M** — mute
- **R** — reduce motion (disables shake, zoom, slow-mo)
- Mobile: swipe to steer, tap to pause

## Features

- Anti-nibble scoring (bold cuts pay far more per cell)
- Time-windowed combo multiplier
- Power-ups: score, freeze, slow, shield, extra life
- Sweeping fog reveal, twinkling cosmos, capture juice
- Endless levels with escalating difficulty

Built with vanilla JS and the Canvas 2D API.
