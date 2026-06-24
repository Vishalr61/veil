/* =========================================================================
   VEIL — module entry point.

   Phase 0: this simply boots the legacy single-file game unchanged. As the
   migration proceeds (Phase 1+), systems are carved out of legacy.js into
   typed modules under src/ and imported here instead.
   ========================================================================= */

import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import { initAudio } from './audio/audio';
import { G } from './game/state';
import './legacy';

// Tap-to-begin gate: browsers block audio until a user gesture, so the splash
// stays until the first interaction — which starts the music and drops you on
// the menu with it already playing. The gesture is consumed here (game doesn't
// start), so you land on the title, not mid-game.
function enter(e: Event) {
  e.stopImmediatePropagation();
  initAudio();
  G.menuStarted = true; G.menuIntroT = 0;   // the title is now visible — play the draw-and-flood intro
  const s = document.getElementById('splash');
  if (s) { s.classList.add('hide'); setTimeout(() => s.remove(), 700); }
  window.removeEventListener('pointerdown', enter, true);
  window.removeEventListener('keydown', enter, true);
  window.removeEventListener('touchstart', enter, true);
}
window.addEventListener('pointerdown', enter, true);
window.addEventListener('keydown', enter, true);
window.addEventListener('touchstart', enter, true);
