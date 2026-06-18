/* =========================================================================
   Audio — Web Audio API. Synthesized SFX + an ambient pad. Owns mute state.
   ========================================================================= */

let ac: any = null, masterGain: any = null, padGain: any = null;
let muted = false;
try { muted = localStorage.getItem('veil_muted') === '1'; } catch (e) {}

export function isMuted() { return muted; }

export function initAudio() {
  if (ac) return;
  try {
    ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    masterGain = ac.createGain();
    masterGain.gain.value = muted ? 0 : 0.9;
    masterGain.connect(ac.destination);
    padGain = ac.createGain();
    padGain.gain.value = 0.0;
    padGain.connect(masterGain);
    startPad();
  } catch (e) { ac = null; }
}
function startPad() {
  if (!ac) return;
  [55, 82.4, 110].forEach((f, i) => {
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ac.createGain(); g.gain.value = 0.5 / (i + 1);
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.05 + i * 0.03;
    const lg = ac.createGain(); lg.gain.value = 1.5;
    lfo.connect(lg); lg.connect(o.frequency);
    o.connect(g); g.connect(padGain);
    o.start(); lfo.start();
  });
  padGain.gain.linearRampToValueAtTime(0.03, ac.currentTime + 4);
}
function tone(freq: number, dur: number, type?: string, gain?: number, when?: number, slideTo?: number) {
  if (!ac || muted) return;
  const t0 = ac.currentTime + (when || 0);
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain as number, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(masterGain);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
export function sfxStartDraw() { tone(420, 0.12, 'triangle', 0.10, 0, 540); }
export function sfxCapture(ch: number) {
  const base = 360 + Math.min(ch, 8) * 40;
  [0, 4, 7, 11].forEach((n, i) => tone(base * Math.pow(2, n / 12), 0.22, 'triangle', 0.10, i * 0.045, base * Math.pow(2, n / 12) * 1.5));
}
export function sfxBold() { [0, 7, 12, 19].forEach((n, i) => tone(330 * Math.pow(2, n / 12), 0.3, 'sawtooth', 0.08, i * 0.05)); }
export function sfxDeath() { tone(220, 0.5, 'sawtooth', 0.18, 0, 50); tone(110, 0.6, 'square', 0.10, 0.02, 40); }
export function sfxLevel() { [0, 4, 7, 12, 16].forEach((n, i) => tone(440 * Math.pow(2, n / 12), 0.3, 'triangle', 0.12, i * 0.09)); }
export function sfxPickup() { [0, 5, 9, 14].forEach((n, i) => tone(520 * Math.pow(2, n / 12), 0.16, 'triangle', 0.10, i * 0.04, 1400)); }
export function sfxShield() { tone(300, 0.4, 'sine', 0.14, 0, 700); tone(450, 0.4, 'triangle', 0.08, 0.03); }
export function sfxBlip() { tone(660, 0.08, 'triangle', 0.08, 0, 880); }
export function sfxBest() { [0, 4, 7, 12, 16, 19].forEach((n, i) => tone(523 * Math.pow(2, n / 12), 0.35, 'triangle', 0.10, i * 0.1)); }
// --- The Rift daily: new actors + boosters + completion ---
export function sfxBlink() { tone(880, 0.07, 'square', 0.05, 0, 240); tone(330, 0.12, 'triangle', 0.04, 0.03, 1100); }   // wraith warp
export function sfxSentinel() { tone(170, 0.3, 'sawtooth', 0.06, 0, 120); tone(255, 0.24, 'sine', 0.04, 0.05); }          // sentinel eye opens
export function sfxBomb() { tone(160, 0.45, 'sawtooth', 0.2, 0, 36); tone(80, 0.5, 'square', 0.14, 0.01, 28); tone(1200, 0.06, 'square', 0.08, 0, 400); }
export function sfxSurge() { [0, 7, 12, 16].forEach((n, i) => tone(330 * Math.pow(2, n / 12), 0.3, 'sawtooth', 0.08, i * 0.05, 330 * Math.pow(2, n / 12) * 1.5)); }
export function sfxDailyClear() { [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(523 * Math.pow(2, n / 12), 0.42, 'triangle', 0.11, i * 0.11)); }

export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('veil_muted', m ? '1' : '0'); } catch (e) {}
  if (masterGain) masterGain.gain.value = m ? 0 : 0.9;
}
// Ambient pad swells with capture progress (t = percent / target).
export function setPadLevel(t: number) {
  if (padGain && !muted) padGain.gain.value = 0.03 + 0.05 * Math.min(1, t);
}
