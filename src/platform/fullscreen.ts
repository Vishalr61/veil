/* =========================================================================
   Fullscreen — request the browser Fullscreen API on a user gesture so the
   game uses the whole screen on platforms that support it: desktop browsers,
   Android Chrome, and iPad Safari.

   iPhone Safari does NOT expose the Fullscreen API to web pages — there the
   real fix is "Add to Home Screen", which launches the installed PWA in
   standalone mode (no Safari toolbar). Native (Capacitor) builds run fullscreen
   through their own immersive config. So this module is one of three fullscreen
   paths, and the only one that's a pure web call.

   Every call is best-effort and swallows errors: an unsupported platform, or a
   user who declines the request, simply stays as-is.
   ========================================================================= */

type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

const swallow = (r: unknown) => {
  if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
};

export function fullscreenSupported(): boolean {
  const el = document.documentElement as FsEl;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

// Enter fullscreen. Must run inside a user gesture (the browser requires it).
export function requestFullscreen(): void {
  try {
    if (isFullscreen() || !fullscreenSupported()) return;
    const el = document.documentElement as FsEl;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fn) swallow(fn.call(el));
  } catch (e) { /* unsupported / declined — ignore */ }
}

export function exitFullscreen(): void {
  try {
    if (!isFullscreen()) return;
    const d = document as FsDoc;
    const fn = d.exitFullscreen || d.webkitExitFullscreen;
    if (fn) swallow(fn.call(d));
  } catch (e) { /* ignore */ }
}

export function toggleFullscreen(): void {
  if (isFullscreen()) exitFullscreen(); else requestFullscreen();
}
