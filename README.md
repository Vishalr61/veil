# veil

Draw light into the dark. A neon territory-capture game for the browser.

Cut continuous lines through a dark veil to enclose space and reveal the
nebula beneath, while drifters hunt you. Hit the target percentage to clear
the level. Snake meets Qix with a reveal hook.

## Play

Open `index.html` in a browser (no build step, no dependencies, runs from
`file://`), or serve the folder:

```bash
npx serve .
```

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
