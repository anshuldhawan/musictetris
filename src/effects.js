// Visual effects: pulses, glow, shake, flash, palette swap.
// All effects driven by simple time-based decay.

export class Effects {
  constructor() {
    this.glow = 0;        // 0..1 board glow
    this.blockPulse = 0;  // extra block scale boost
    this.flash = 0;       // 0..1 fullscreen flash overlay
    this.shake = 0;       // pixel shake amplitude
    this.paletteT = 1;    // 0..1 palette transition progress (1 = settled)
    this.paletteFromIdx = 0;
    this.paletteToIdx = 0;
  }

  triggerClear(linesCleared) {
    const power = linesCleared / 4; // 0.25 .. 1.0
    this.glow = Math.max(this.glow, 0.5 + 0.5 * power);
    this.blockPulse = Math.max(this.blockPulse, 0.06 + 0.08 * power);
    this.flash = Math.max(this.flash, 0.18 + 0.22 * power);
    this.shake = Math.max(this.shake, 4 * linesCleared);
  }

  startPaletteSwap(fromIdx, toIdx) {
    this.paletteFromIdx = fromIdx;
    this.paletteToIdx = toIdx;
    this.paletteT = 0;
  }

  update(dt) {
    // Decay rates tuned for the visual targets in the plan.
    this.glow      = decay(this.glow,       dt / 0.4);
    this.blockPulse= decay(this.blockPulse, dt / 0.25);
    this.flash     = decay(this.flash,      dt / 0.5);
    this.shake     = decay(this.shake,      dt / 0.3);
    this.paletteT  = Math.min(1, this.paletteT + dt / 0.6);
  }

  shakeOffset() {
    if (this.shake <= 0.01) return [0, 0];
    return [(Math.random() - 0.5) * 2 * this.shake, (Math.random() - 0.5) * 2 * this.shake];
  }
}

function decay(v, k) {
  // exponential-ish decay toward 0 as time advances
  const next = v - v * Math.min(1, k);
  return next < 0.001 ? 0 : next;
}

// Easing for palette interpolation.
export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
