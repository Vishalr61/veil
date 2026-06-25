/* =========================================================================
   Procedural synth soundtrack. A look-ahead scheduler ("A Tale of Two Clocks")
   sequences layered voices (kick / hat / snare / bass / arp) onto a music bus;
   the mix builds with `intensity` (calm menu -> full-energy play), and the
   `theme` (key / tempo / colour) switches per zone. The agent can't hear this,
   so everything here is parameterised for quick tuning.
   ========================================================================= */

let ctx: any = null, bus: any = null, noise: AudioBuffer | null = null;
let playing = false, timer: any = 0;
let nextTime = 0, step = 0, bar = 0;
let intensity = 0, cur = 0;

const LOOKAHEAD = 0.12;   // schedule this far ahead (s)
const TICK = 25;          // scheduler wake interval (ms)
const STEPS = 16;         // 16th-note steps per bar

const SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], penta: [0, 3, 5, 7, 10], lydian: [0, 2, 4, 6, 7, 9, 11] };
// bassline: semitone offset from the theme root per 16th step (-1 = rest).
// A driving, on-beat 8th-note pulse with movement — relentless, not syncopated.
const BASS = [0, -1, 0, -1, 0, -1, 3, -1, 0, -1, 0, -1, 5, -1, 7, -1];

interface Theme { bpm: number; root: number; scale: number[]; wave: OscillatorType; }
// One groove, recoloured per zone (root note, tempo, scale, bass timbre).
// Tempos pushed up ~6 BPM for a more driving, Airxonix-style propulsion.
const THEMES: Record<string, Theme> = {
  default: { bpm: 130, root: 55.0, scale: SCALES.minor, wave: 'sawtooth' },
  magma:   { bpm: 128, root: 49.0, scale: SCALES.minor, wave: 'sawtooth' },   // the Depths — dark, low
  caves:   { bpm: 132, root: 58.3, scale: SCALES.minor, wave: 'square' },     // Crystal Caves — brighter
  ocean:   { bpm: 122, root: 51.9, scale: SCALES.minor, wave: 'sine' },       // the Abyss — deep, slow
  flora:   { bpm: 134, root: 61.7, scale: SCALES.penta, wave: 'triangle' },   // Overgrowth — organic
  sky:     { bpm: 126, root: 65.4, scale: SCALES.lydian, wave: 'triangle' },  // the Expanse — open, bright
  aurora:  { bpm: 128, root: 55.0, scale: SCALES.lydian, wave: 'sine' },      // Aurora — airy
  space:   { bpm: 124, root: 49.0, scale: SCALES.minor, wave: 'sawtooth' },   // Deep Space — vast
  rift:    { bpm: 140, root: 58.3, scale: SCALES.penta, wave: 'sawtooth' },   // The Rift — fast, edgy
  grid:    { bpm: 138, root: 55.0, scale: SCALES.lydian, wave: 'square' },    // The Grid — electric, synthetic
};
let theme: Theme = THEMES.default;

export function initMusic(audioCtx: any, musicBus: any) {
  ctx = audioCtx; bus = musicBus;
  // a short white-noise buffer reused by the percussion voices
  const len = Math.floor(ctx.sampleRate * 0.3);
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}
export function startMusic() {
  if (!ctx || !bus || playing) return;
  playing = true; step = 0; bar = 0; nextTime = ctx.currentTime + 0.1; loop();
}
export function stopMusic() { playing = false; if (timer) { clearTimeout(timer); timer = 0; } }
export function setMusicIntensity(v: number) { intensity = v < 0 ? 0 : v > 1 ? 1 : v; }
export function setMusicTheme(name: string) { theme = THEMES[name] || THEMES.default; }

function env(node: any, t: number, peak: number, dur: number, attack = 0.008) {
  node.gain.setValueAtTime(0.0001, t);
  node.gain.exponentialRampToValueAtTime(peak, t + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function kick(t: number, g0: number) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  // a snappier pitch drop + more body for a punchier, driving four-on-the-floor
  o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
  g.gain.setValueAtTime(g0, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.22);
}
function hat(t: number, g0: number) {
  const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise; hp.type = 'highpass'; hp.frequency.value = 7000;
  env(g, t, g0, 0.04, 0.003);
  s.connect(hp); hp.connect(g); g.connect(bus); s.start(t); s.stop(t + 0.06);
}
function snare(t: number, g0: number) {
  const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise; bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.7;
  env(g, t, g0, 0.13, 0.003);
  s.connect(bp); bp.connect(g); g.connect(bus); s.start(t); s.stop(t + 0.16);
}
function bass(freq: number, t: number, dur: number, g0: number) {
  const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = theme.wave; o.frequency.setValueAtTime(freq, t);
  lp.type = 'lowpass'; lp.frequency.value = 720; lp.Q.value = 4;   // more presence/grind, less boomy
  env(g, t, g0, dur, 0.012);
  o.connect(lp); lp.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
}
function arp(freq: number, t: number, dur: number, g0: number) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square'; o.frequency.setValueAtTime(freq, t);
  env(g, t, g0, dur, 0.005);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
}

function scheduleStep(s: number, b: number, t: number) {
  const i = cur, sps = (60 / theme.bpm) / 4;
  // a snare-roll fill across the back of every 4th bar (only once there's a
  // backbeat, so calm early levels stay clean); it turns the loop over.
  const fill = i > 0.5 && (b % 4) === 3 && s >= 12;
  if (i > 0.1 && s % 4 === 0) kick(t, 1.0);                          // punchy four-on-the-floor
  if (fill) {
    snare(t, (0.16 + (s - 12) * 0.05) * Math.min(i, 1));            // rising roll into the turnaround
  } else {
    if (i > 0.35 && (s === 4 || s === 12)) snare(t, 0.32);           // backbeat — the drive, in early
    if (i > 0.25 && s % 4 === 2) hat(t, 0.22 * i);                   // offbeat hats
    if (i > 0.5 && s % 2 === 1) hat(t, 0.13 * i);                    // busy 16th hats keep it propulsive
  }
  const bo = BASS[s];
  if (i > 0.12 && bo >= 0) bass(theme.root * Math.pow(2, bo / 12), t, sps * 1.1, 0.4);   // tight, relentless pulse
  if (i > 0.55 && s % 2 === 0 && !fill) {                            // arp hook
    const sc = theme.scale, n = sc[(s / 2) % sc.length];
    const oct = ((b >> 2) % 2) === 1 ? 8 : 4;                        // lift an octave for the B section (every 4 bars)
    arp(theme.root * oct * Math.pow(2, n / 12), t, sps * 0.9, 0.12 * i);
  }
}

function loop() {
  if (!playing) return;
  cur += (intensity - cur) * 0.06;                                  // smooth intensity glide
  const sps = (60 / theme.bpm) / 4;
  // If we fell behind (backgrounded tab, a hitch, or the context just resumed),
  // snap forward instead of scheduling a huge backlog all at once — that flood
  // is what made the audio glitch/"get stuck".
  if (nextTime < ctx.currentTime) { nextTime = ctx.currentTime + 0.05; step = 0; }
  let guard = 0;
  while (nextTime < ctx.currentTime + LOOKAHEAD && guard++ < 64) {
    scheduleStep(step, bar, nextTime);
    nextTime += sps;
    step++; if (step >= STEPS) { step = 0; bar = (bar + 1) % 64; }   // bar drives fills + section lifts
  }
  timer = setTimeout(loop, TICK);
}
