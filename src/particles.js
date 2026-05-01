import { withAlpha } from './palette.js';

const MAX = 500;

export class ParticleSystem {
  constructor() {
    this.pool = new Array(MAX).fill(null).map(() => ({
      x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 1, size: 2, alive: false,
      baseSize: 2,
    }));
    this.cursor = 0;
    this.bounceScale = 0;  // spikes on kick, decays fast
    this.boardCenterX = 0; // set each frame so kick impulse pushes outward
  }

  spawn(x, y, vx, vy, life, size) {
    let p = null;
    for (let i = 0; i < MAX; i++) {
      const idx = (this.cursor + i) % MAX;
      if (!this.pool[idx].alive) {
        p = this.pool[idx];
        this.cursor = (idx + 1) % MAX;
        break;
      }
    }
    if (!p) {
      p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % MAX;
    }
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = 0; p.maxLife = life;
    p.size = size; p.baseSize = size; p.alive = true;
  }

  // Ambient drift in the side gutters.
  ambient(width, height, boardX, boardW, beatPhase) {
    this.boardCenterX = boardX + boardW / 2;
    const intensity = 0.6 + 0.4 * Math.sin(beatPhase * Math.PI * 2);
    const count = Math.random() < 0.45 * intensity ? 1 : 0;
    for (let i = 0; i < count; i++) {
      const onLeft = Math.random() < 0.5;
      const x = onLeft
        ? Math.random() * (boardX - 20)
        : boardX + boardW + 20 + Math.random() * (width - boardX - boardW - 20);
      const y = height + 8;
      const vx = (Math.random() - 0.5) * 0.4;
      const vy = -0.4 - Math.random() * 1.0;
      this.spawn(x, y, vx, vy, 2.5 + Math.random() * 2.5, 1.5 + Math.random() * 2.5);
    }
  }

  // Called on every kick beat — give all alive particles a velocity impulse
  // pushing them outward from the board center + upward, and spike bounceScale.
  kickBounce(width, height, boardX, boardW) {
    this.bounceScale = 1;
    const cx = boardX + boardW / 2;

    for (const p of this.pool) {
      if (!p.alive) continue;
      // Direction away from board center
      const dx = p.x - cx;
      const dir = dx > 0 ? 1 : -1;
      p.vx += dir * (1.2 + Math.random() * 0.8);
      p.vy += -1.5 - Math.random() * 1.0; // kick upward
    }

    // Spawn extra "jump" particles in both gutters
    const n = 8;
    for (let i = 0; i < n; i++) {
      const onLeft = i < n / 2;
      const x = onLeft
        ? Math.random() * boardX
        : boardX + boardW + Math.random() * (width - boardX - boardW);
      const y = height * (0.3 + Math.random() * 0.6);
      const vx = (onLeft ? -1 : 1) * (1 + Math.random() * 2);
      const vy = -2.5 - Math.random() * 2;
      this.spawn(x, y, vx, vy, 1.0 + Math.random() * 0.8, 2.5 + Math.random() * 2.5);
    }
  }

  burst(cx, cy, count, power) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = power * (0.5 + Math.random());
      this.spawn(cx, cy, Math.cos(a) * s, Math.sin(a) * s, 1 + Math.random() * 1.2, 2.2 + Math.random() * 2.5);
    }
  }

  update(dt) {
    // Decay bounce scale
    this.bounceScale *= Math.max(0, 1 - dt * 5);
    if (this.bounceScale < 0.01) this.bounceScale = 0;

    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.maxLife) { p.alive = false; continue; }
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.97;  // slightly more drag so impulse decays visibly
      p.vy *= 0.97;
    }
  }

  draw(ctx, color, beatPhase) {
    ctx.save();
    // Beat pulse: particles scale and brighten on every beat
    const beatSin = Math.sin(beatPhase * Math.PI * 2);
    const sizePulse = 1 + 0.35 * Math.max(0, beatSin) + 0.5 * this.bounceScale;
    const alphaPulse = 0.65 + 0.35 * Math.max(0, beatSin) + 0.3 * this.bounceScale;

    for (const p of this.pool) {
      if (!p.alive) continue;
      const t = p.life / p.maxLife;
      const fadeOut = 1 - t;
      const alpha = fadeOut * alphaPulse;
      const size = p.baseSize * (1 - t * 0.3) * sizePulse;

      ctx.shadowColor = color;
      ctx.shadowBlur = 10 + 8 * this.bounceScale;
      ctx.fillStyle = withAlpha(color, Math.min(1, alpha));
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
