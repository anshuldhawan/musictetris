const QUALITY_ORDER = ['high', 'medium', 'low'];

export const QUALITY_SETTINGS = {
  high: {
    pixelRatioScale: 1,
    postFx: 1,
    particles: 1,
    clusters: 1,
    shapes: 1,
  },
  medium: {
    pixelRatioScale: 0.88,
    postFx: 0.68,
    particles: 0.72,
    clusters: 0.72,
    shapes: 0.8,
  },
  low: {
    pixelRatioScale: 0.72,
    postFx: 0.32,
    particles: 0.45,
    clusters: 0.45,
    shapes: 0.55,
  },
};

export function createPerformanceTracker() {
  let qualityIndex = 0;
  let avgFrameMs = 16.7;
  let slowFor = 0;
  let fastFor = 0;

  function currentQuality() {
    return QUALITY_ORDER[qualityIndex];
  }

  return {
    get quality() {
      return currentQuality();
    },

    get settings() {
      return QUALITY_SETTINGS[currentQuality()];
    },

    get averageFrameMs() {
      return avgFrameMs;
    },

    update(dt) {
      const frameMs = Math.min(80, Math.max(1, dt * 1000));
      avgFrameMs += (frameMs - avgFrameMs) * 0.08;

      const quality = currentQuality();
      const slowLimit = quality === 'high' ? 19.5 : 22.5;
      const fastLimit = quality === 'low' ? 18.0 : 17.2;

      if (avgFrameMs > slowLimit) {
        slowFor += dt;
        fastFor = 0;
      } else if (avgFrameMs < fastLimit) {
        fastFor += dt;
        slowFor = 0;
      } else {
        slowFor = 0;
        fastFor = 0;
      }

      if (slowFor > 1.1 && qualityIndex < QUALITY_ORDER.length - 1) {
        qualityIndex++;
        slowFor = 0;
        fastFor = 0;
      } else if (fastFor > 5.0 && qualityIndex > 0) {
        qualityIndex--;
        slowFor = 0;
        fastFor = 0;
      }

      return this.settings;
    },
  };
}
