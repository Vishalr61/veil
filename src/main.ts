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
import './legacy';

// Reveal the game once it's drawing; the HTML splash covers the font-load flash.
setTimeout(() => document.getElementById('splash')?.classList.add('hide'), 900);
setTimeout(() => document.getElementById('splash')?.remove(), 1600);
