// Tone.js loaded via global <script>. Reference as window.Tone.
const Tone = window.Tone;

const BASE_BPM = 100;
const MAX_BPM = 180;

// Pentatonic minor in A — feels good with arbitrary chord stabs.
const BASS_NOTES = ['A1', 'A1', 'E2', 'G1', 'D2', 'D2', 'A1', 'C2'];
const ARP_NOTES = ['A3', 'C4', 'E4', 'G4', 'A4', 'G4', 'E4', 'C4'];

let kick, snare, hat, bass, arp, sting;
let kickSeq, snareSeq, hatSeq, bassSeq, arpSeq;
let musicBus = null;
let musicMuted = false;
let beatPhase = 0;
let lastBeatTime = 0;
let onKickCb = null;
let initialized = false;

export async function startAudio() {
  if (window.Tone === undefined) throw new Error('Tone.js not loaded');
  await Tone.start();

  if (initialized) {
    if (Tone.Transport.state !== 'started') Tone.Transport.start();
    return;
  }
  initialized = true;

  Tone.Transport.bpm.value = BASE_BPM;

  // Music bus — all looped beds route through this so they can be muted as a group.
  // The line-clear sting is SFX and bypasses the bus.
  musicBus = new Tone.Gain(musicMuted ? 0 : 1).toDestination();

  // Drums
  kick = new Tone.MembraneSynth({
    pitchDecay: 0.04,
    octaves: 6,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.35, sustain: 0.01, release: 0.4 },
  }).connect(musicBus);
  kick.volume.value = -4;

  snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
  }).connect(musicBus);
  snare.volume.value = -12;

  hat = new Tone.MetalSynth({
    frequency: 250,
    envelope: { attack: 0.001, decay: 0.06, release: 0.02 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.2,
  }).connect(musicBus);
  hat.volume.value = -28;

  bass = new Tone.MonoSynth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.4 },
    filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.5, baseFrequency: 200, octaves: 2.6 },
  }).connect(musicBus);
  bass.volume.value = -10;

  arp = new Tone.PluckSynth({ attackNoise: 1, dampening: 4000, resonance: 0.85 }).connect(musicBus);
  arp.volume.value = -16;

  sting = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.4, sustain: 0.0, release: 0.6 },
  }).toDestination();
  sting.volume.value = -8;

  // Quarter-note clock for beat phase — single source of rhythmic truth.
  new Tone.Loop((time) => {
    lastBeatTime = time;
    beatPhase = 0;
  }, '4n').start(0);

  // Kick on beats 1 and 3 only (clean pulse).
  kickSeq = new Tone.Sequence((time, hit) => {
    if (hit) {
      kick.triggerAttackRelease('C1', '8n', time);
      if (onKickCb) Tone.Draw.schedule(() => onKickCb(), time);
    }
  }, [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], '16n').start(0);

  // Snare on beats 2 and 4 (sixteenths 4 and 12).
  snareSeq = new Tone.Sequence((time, hit) => {
    if (hit) snare.triggerAttackRelease('16n', time);
  }, [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], '16n').start(0);

  // Hat every 8th, accent offbeats.
  hatSeq = new Tone.Sequence((time, vel) => {
    if (vel > 0) hat.triggerAttackRelease('32n', time, vel);
  }, [0.4, 0, 0.7, 0, 0.4, 0, 0.7, 0, 0.4, 0, 0.7, 0, 0.4, 0, 0.9, 0], '16n').start(0);

  bassSeq = new Tone.Sequence((time, n) => {
    bass.triggerAttackRelease(n, '8n', time);
  }, BASS_NOTES, '4n').start(0);

  arpSeq = new Tone.Sequence((time, n) => {
    // Density grows with tempo: probability = 0.3 (slow) → 0.95 (fast).
    const t = (Tone.Transport.bpm.value - BASE_BPM) / (MAX_BPM - BASE_BPM);
    const p = 0.3 + 0.65 * Math.min(1, Math.max(0, t));
    if (Math.random() < p) arp.triggerAttackRelease(n, '16n', time);
  }, ARP_NOTES, '8n').start(0);

  Tone.Transport.start();
}

export function stopAudio() {
  if (Tone.Transport.state === 'started') Tone.Transport.stop();
}

export function pauseAudio() {
  if (Tone.Transport.state === 'started') Tone.Transport.pause();
}

export function resumeAudio() {
  if (Tone.Transport.state === 'paused') Tone.Transport.start();
}

let lastStackFrac = 0;
let frenzyActive = false;

function applyBpmTarget() {
  const stackTarget = BASE_BPM + (MAX_BPM - BASE_BPM) * Math.min(1, Math.max(0, lastStackFrac));
  if (frenzyActive) {
    Tone.Transport.bpm.rampTo(MAX_BPM, 2.5);
  } else {
    Tone.Transport.bpm.rampTo(stackTarget, 0.6);
  }
}

export function setStackFraction(frac) {
  lastStackFrac = frac;
  applyBpmTarget();
}

export function setFrenzy(active) {
  if (frenzyActive === active) return;
  frenzyActive = active;
  applyBpmTarget();
}

export function getBpm() {
  return Math.round(Tone.Transport.bpm.value);
}

export function setMusicMuted(muted) {
  musicMuted = !!muted;
  if (musicBus) musicBus.gain.rampTo(musicMuted ? 0 : 1, 0.05);
}

export function isMusicMuted() {
  return musicMuted;
}

// 0..1 sawtooth across one beat — read by renderer for ambient pulse.
export function getBeatPhase() {
  const now = Tone.now();
  const beatLen = 60 / Tone.Transport.bpm.value;
  if (lastBeatTime === 0) return 0;
  const phase = ((now - lastBeatTime) / beatLen) % 1;
  return phase < 0 ? 0 : phase;
}

export function onKick(cb) {
  onKickCb = cb;
}

const STING_VOICINGS = [
  null,
  ['A4', 'E5'],                 // 1 line
  ['A4', 'C5', 'E5'],           // 2 lines
  ['A4', 'C5', 'E5', 'G5'],     // 3 lines
  ['A4', 'C5', 'E5', 'G5', 'B5'], // 4 lines (added 9th)
];

export function playClearSting(linesCleared) {
  if (!sting) return;
  const v = STING_VOICINGS[Math.min(linesCleared, 4)];
  if (v) sting.triggerAttackRelease(v, '4n');
}
