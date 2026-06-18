/* =========================================================================
   Control hit-rects — the menu buttons, the pause button, and the overlay
   buttons (pause HOME, game-over RETRY/HOME). Shared by the render layer
   (which draws them) and the input layer (which hit-tests them), so they live
   in one place to keep the two in sync.
   ========================================================================= */

import { CW, CH, safeTop } from '../core/dims';

export function menuBtnW() { return Math.min(300, CW - 48); }
// PLAY is the dominant primary; DAILY + SCORES share a row beneath it.
export function playBtnRect() { const w = menuBtnW(); return { x: CW / 2 - w / 2, y: CH * 0.58, w, h: 58 }; }
export function dailyBtnRect() { const w = menuBtnW(), hw = (w - 14) / 2; return { x: CW / 2 - w / 2, y: CH * 0.58 + 74, w: hw, h: 50 }; }
export function scoresBtnRect() { const w = menuBtnW(), hw = (w - 14) / 2; return { x: CW / 2 - w / 2 + hw + 14, y: CH * 0.58 + 74, w: hw, h: 50 }; }
export function pauseBtnRect() { return { x: CW - 56, y: safeTop + 8, w: 46, h: 46 }; }

// pause overlay — a single QUIT-TO-HOME button below the resume hints
export function pauseHomeRect() { const w = Math.min(220, CW - 72); return { x: CW / 2 - w / 2, y: CH / 2 + 64, w, h: 46 }; }

// game-over overlay — two side-by-side buttons (primary = RETRY / SHARE, + HOME)
export function goBtnRects() {
  const w = Math.min(150, (CW - 72) / 2), gap = 14;
  const y = CH / 2 + 120, x0 = CW / 2 - (w * 2 + gap) / 2;
  return { primary: { x: x0, y, w, h: 48 }, home: { x: x0 + w + gap, y, w, h: 48 } };
}
