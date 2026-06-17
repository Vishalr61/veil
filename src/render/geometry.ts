/* =========================================================================
   Control hit-rects — the menu buttons and the pause button. Shared by the
   render layer (which draws them) and the input layer (which hit-tests them),
   so they live in one place to keep the two in sync.
   ========================================================================= */

import { CW, CH, safeTop } from '../core/dims';

export function menuBtnW() { return Math.min(264, CW - 56); }
export function playBtnRect() { const w = menuBtnW(); return { x: CW / 2 - w / 2, y: CH / 2 + 26, w, h: 50 }; }
export function dailyBtnRect() { const w = menuBtnW(); return { x: CW / 2 - w / 2, y: CH / 2 + 90, w, h: 50 }; }
export function pauseBtnRect() { return { x: CW - 56, y: safeTop + 8, w: 46, h: 46 }; }
