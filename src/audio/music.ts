/* =========================================================================
   Procedural synth soundtrack. A look-ahead scheduler ("A Tale of Two Clocks")
   sequences layered voices (kick / hat / snare / bass / arp) onto a music bus;
   the mix builds with `intensity` (calm menu -> full-energy play), and the
   `theme` (key / tempo / colour) switches per zone. The agent can't hear this,
   so everything here is parameterised for quick tuning.
   ========================================================================= */

let ctx: any = null, bus: any = null, noise: AudioBuffer | null = null;
let playing = false, timer: any = 0;
let nextTime = 0, step = 0;
let intensity = 0, cur = 0;

const LOOKAHEAD = 0.12;   // schedule this far ahead (s)
const TICK = 25;          // scheduler wake interval (ms)
const STEPS = 16;         // 16th-note steps per bar

const SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], penta: [0, 3, 5, 7, 10], lydian: [0, 2, 4, 6, 7, 9, 11] };
// bassline: semitone offset from the theme root per 16th step (-1 = rest)
const BASS = [0, -1, 0, -1, -1, -1, 0, -1, 3, -1, 0, -1, -1, -1, 5, 7];

interface Theme { bpm: number; root: number; scale: number[]; wave: OscillatorType; }
// One groove, recoloured per zone (root note, tempo, scale, bass timbre).
const THEMES: Record<string, Theme> = {
  default: { bpm: 124, root: 55.0, scale: SCALES.minor, wave: 'sawtooth' },
  magma:   { bpm: 122, root: 49.0, scale: SCALES.minor, wave: 'sawtooth' },   // the Depths — dark, low
  caves:   { bpm: 126, root: 58.3, scale: SCALES.minor, wave: 'square' },     // Crystal Caves — brighter
  ocean:   { bpm: 116, root: 51.9, scale: SCALES.minor, wave: 'sine' },       // the Abyss — deep, slow
  flora:   { bpm: 128, root: 61.7, scale: SCALES.penta, wave: 'triangle' },   // Overgrowth — organic
  sky:     { bpm: 120, root: 65.4, scale: SCALES.lydian, wave: 'triangle' },  // the Expanse — open, bright
  aurora:  { bpm: 122, root: 55.0, scale: SCALES.lydian, wave: 'sine' },      // Aurora — airy
  space:   { bpm: 118, root: 49.0, scale: SCALES.minor, wave: 'sawtooth' },   // Deep Space — vast
  rift:    { bpm: 134, root: 58.3, scale: SCALES.penta, wave: 'sawtooth' },   // The Rift — fast, edgy
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
  playing = true; step = 0; nextTime = ctx.currentTime + 0.1; loop();
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
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
  g.gain.setValueAtTime(g0, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.2);
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
  lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 6;
  env(g, t, g0, dur, 0.012);
  o.connect(lp); lp.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
}
function arp(freq: number, t: number, dur: number, g0: number) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square'; o.frequency.setValueAtTime(freq, t);
  env(g, t, g0, dur, 0.005);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
}

function scheduleStep(s: number, t: number) {
  const i = cur, sps = (60 / theme.bpm) / 4;
  if (i > 0.12 && s % 4 === 0) kick(t, 0.9);                         // four-on-the-floor
  if (i > 0.5 && (s === 4 || s === 12)) snare(t, 0.32);              // backbeat
  if (i > 0.4 && s % 4 === 2) hat(t, 0.22 * i);                      // offbeat hats
  if (i > 0.72 && s % 2 === 1) hat(t, 0.12 * i);                     // 16th hats at high energy
  const bo = BASS[s];
  if (i > 0.22 && bo >= 0) bass(theme.root * Math.pow(2, bo / 12), t, sps * 1.7, 0.34);
  if (i > 0.55 && s % 2 === 0) {                                     // arp hook (two octaves up)
    const sc = theme.scale, n = sc[(s / 2) % sc.length];
    arp(theme.root * 4 * Math.pow(2, n / 12), t, sps * 0.9, 0.12 * i);
  }
}

function loop() {
  if (!playing) return;
  cur += (intensity - cur) * 0.06;                                  // smooth intensity glide
  const sps = (60 / theme.bpm) / 4;
  while (nextTime < ctx.currentTime + LOOKAHEAD) {
    scheduleStep(step, nextTime);
    nextTime += sps;
    step = (step + 1) % STEPS;
  }
  timer = setTimeout(loop, TICK);
}
