/* =========================================================================
   Haptics wrapper — thin, fire-and-forget, fails silently off-device.

   Uses the Capacitor Haptics plugin so real haptics fire on iOS/Android.
   On the web build the plugin falls back to navigator.vibrate where the
   browser supports it (and no-ops where it doesn't, e.g. iOS Safari).
   ========================================================================= */

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

let enabled = true;
try { enabled = localStorage.getItem('veil_haptics') !== '0'; } catch (e) {}

export function setHaptics(on) {
  enabled = on;
  try { localStorage.setItem('veil_haptics', on ? '1' : '0'); } catch (e) {}
}
export function hapticsEnabled() { return enabled; }

function impact(style) {
  if (!enabled) return;
  // Async + guarded: a rejected promise or missing native bridge must never
  // interrupt the game loop.
  try { Haptics.impact({ style }).catch(() => {}); } catch (e) {}
}
function notify(type) {
  if (!enabled) return;
  try { Haptics.notification({ type }).catch(() => {}); } catch (e) {}
}

export function hapticLight() { impact(ImpactStyle.Light); }
export function hapticMedium() { impact(ImpactStyle.Medium); }
export function hapticHeavy() { impact(ImpactStyle.Heavy); }
export function hapticSuccess() { notify(NotificationType.Success); }
export function hapticWarning() { notify(NotificationType.Warning); }
export function hapticError() { notify(NotificationType.Error); }
