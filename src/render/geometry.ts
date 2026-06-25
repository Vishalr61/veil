/* =========================================================================
   Control hit-rects — the menu buttons, the pause button, and the overlay
   buttons (pause HOME, game-over RETRY/HOME). Shared by the render layer
   (which draws them) and the input layer (which hit-tests them), so they live
   in one place to keep the two in sync.
   ========================================================================= */

import { CW, CH, safeTop } from '../core/dims';

export function menuBtnW() { return Math.min(300, CW - 48); }

// The title button bar (Horizon reference). WIDE/landscape screens get the single
// horizontal row — PLAY · DAILY · SCORES · divider · EASY MED HARD; narrow phones
// fall back to the stacked column (one row can't fit). Computed in one place so the
// renderer and the input layer agree.
type Rect = { x: number; y: number; w: number; h: number };
export interface BarLayout { wide: boolean; play: Rect; daily: Rect; scores: Rect; chips: Rect[]; dividerX: number; dividerY: number; dividerH: number; }
export function barLayout(): BarLayout {
  const wide = CW >= 720;
  if (!wide) {   // stacked column, bottom-anchored
    const w = menuBtnW(), hw = (w - 14) / 2, gap = 10, cw = (w - gap * 2) / 3, x0 = CW / 2 - w / 2;
    return {
      wide: false,
      play: { x: CW / 2 - w / 2, y: CH - 206, w, h: 58 },
      daily: { x: CW / 2 - w / 2, y: CH - 134, w: hw, h: 50 },
      scores: { x: CW / 2 - w / 2 + hw + 14, y: CH - 134, w: hw, h: 50 },
      chips: [0, 1, 2].map((i) => ({ x: x0 + i * (cw + gap), y: CH - 70, w: cw, h: 40 })),
      dividerX: 0, dividerY: 0, dividerH: 0,
    };
  }
  const h = 56, chipH = 42, chipW = 66, chipGap = 8, gap = 16, dsW = 128, playW = 200, divGap = 20;
  const chipsW = chipW * 3 + chipGap * 2;
  const totalW = playW + gap + dsW + gap + dsW + divGap + 1 + divGap + chipsW;
  let x = CW / 2 - totalW / 2; const y = CH - 116;
  const play = { x, y, w: playW, h }; x += playW + gap;
  const daily = { x, y, w: dsW, h }; x += dsW + gap;
  const scores = { x, y, w: dsW, h }; x += dsW + divGap;
  const dividerX = x; x += 1 + divGap;
  const chipY = y + (h - chipH) / 2;
  const chips = [0, 1, 2].map((i) => ({ x: x + i * (chipW + chipGap), y: chipY, w: chipW, h: chipH }));
  return { wide: true, play, daily, scores, chips, dividerX, dividerY: y, dividerH: h };
}
export function playBtnRect() { return barLayout().play; }
export function dailyBtnRect() { return barLayout().daily; }
export function scoresBtnRect() { return barLayout().scores; }
export function diffBtnRects(): { x: number; y: number; w: number; h: number; key: 'easy' | 'medium' | 'hard' }[] {
  const keys: ('easy' | 'medium' | 'hard')[] = ['easy', 'medium', 'hard'];
  return barLayout().chips.map((c, i) => ({ ...c, key: keys[i] }));
}
export function pauseBtnRect() { return { x: CW - 56, y: safeTop + 8, w: 46, h: 46 }; }
// tappable mute glyph in the HUD (so phones can mute without a keyboard)
export function muteBtnRect() { return { x: CW - 104, y: safeTop + 8, w: 42, h: 46 }; }

// pause overlay — touch settings: MUTE + MOTION toggles (a row) over QUIT TO HOME.
function pauseBtnW() { return Math.min(264, CW - 56); }
export function pauseMuteRect() { const w = pauseBtnW(), hw = (w - 12) / 2; return { x: CW / 2 - w / 2, y: CH / 2 + 26, w: hw, h: 50 }; }
export function pauseMotionRect() { const w = pauseBtnW(), hw = (w - 12) / 2; return { x: CW / 2 - w / 2 + hw + 12, y: CH / 2 + 26, w: hw, h: 50 }; }
export function pauseControlRect() { const w = pauseBtnW(); return { x: CW / 2 - w / 2, y: CH / 2 + 86, w, h: 50 }; }
export function pauseHomeRect() { const w = pauseBtnW(); return { x: CW / 2 - w / 2, y: CH / 2 + 146, w, h: 50 }; }

// game-over overlay — two side-by-side buttons (primary = RETRY / SHARE, + HOME)
export function goBtnRects() {
  const w = Math.min(150, (CW - 72) / 2), gap = 14;
  const y = CH / 2 + 120, x0 = CW / 2 - (w * 2 + gap) / 2;
  return { primary: { x: x0, y, w, h: 48 }, home: { x: x0 + w + gap, y, w, h: 48 } };
}
