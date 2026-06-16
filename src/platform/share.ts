/* =========================================================================
   Share — native share sheet on mobile, clipboard fallback elsewhere.
   ========================================================================= */

import { Share } from '@capacitor/share';

// Opens the native iOS/Android share sheet with the given text. On the web
// build (or if the sheet is unavailable/cancelled) it quietly copies to the
// clipboard so the result is never lost.
export async function shareResult(text: string): Promise<void> {
  try {
    const can = await Share.canShare();
    if (can.value) {
      await Share.share({ text });
      return;
    }
  } catch (e) { /* fall through to clipboard */ }
  try { await navigator.clipboard?.writeText(text); } catch (e) {}
}
