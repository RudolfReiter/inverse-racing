/* Fixed-origin comparisons: prediction and observation always share a time. */
(() => {
  'use strict';
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  function interpolateState(states, seconds, dt) {
    const position = clamp(seconds / dt, 0, states.length - 1);
    const i = Math.min(Math.floor(position), states.length - 2);
    const h = (position - i) * dt, a = states[i], b = states[i + 1];
    // Exact integration of the recorded piecewise-constant jerk. This removes
    // the velocity discontinuities of linear position interpolation.
    const jerk = (b[2] - a[2]) / dt;
    return [a[0] + h*a[1] + h*h*a[2]/2 + h*h*h*jerk/6,
            a[1] + h*a[2] + h*h*jerk/2, a[2] + h*jerk];
  }

  function interpolateXY(points, seconds, dt) {
    const position = clamp(seconds / dt, 0, points.length - 1);
    const i = Math.min(Math.floor(position), points.length - 2), t = position - i;
    return points[i].map((value, axis) => value + (points[i + 1][axis] - value)*t);
  }

  class ComparisonReplay {
    constructor(scenario, config, {holdSeconds = 1.4} = {}) {
      this.config = config;
      this.horizon = config.intervals * config.dt;
      this.holdSeconds = holdSeconds;
      this.setScenario(scenario);
    }
    setScenario(scenario) {
      this.scenario = scenario;
      // The benchmark exports more frequent forecasts. The visual comparison
      // uses nonoverlapping origins, while the benchmark still uses all of them.
      this.windows = scenario.race.forecasts.filter(f =>
        Math.abs(f.time / this.horizon - Math.round(f.time / this.horizon)) < 1e-7);
      if (!this.windows.length) throw new Error('No complete comparison windows');
      this.index = 0; this.elapsed = 0; this.holdRemaining = 0; this.ended = false;
    }
    get forecast() { return this.windows[this.index]; }
    get duration() { return this.windows.at(-1).time + this.horizon; }
    get time() { return this.forecast.time + this.elapsed; }
    get phase() { return this.elapsed >= this.horizon ? 'result' : 'prediction'; }
    seek(seconds) {
      const time = clamp(seconds, 0, this.duration);
      // A scrub exactly on a boundary shows the completed comparison, so its
      // final error can be inspected. Playing proceeds to the following window.
      this.index = clamp(Math.ceil(time / this.horizon) - 1, 0, this.windows.length - 1);
      this.elapsed = clamp(time - this.forecast.time, 0, this.horizon);
      this.holdRemaining = this.phase === 'result' ? this.holdSeconds : 0;
      this.ended = time === this.duration;
    }
    advanceWindow() {
      if (this.index >= this.windows.length - 1) { this.ended = true; return false; }
      this.index++; this.elapsed = 0; this.holdRemaining = 0;
      return true;
    }
    tick(seconds) {
      let remaining = Math.max(0, seconds);
      while (remaining > 1e-9 && !this.ended) {
        if (this.phase === 'prediction') {
          const step = Math.min(remaining, this.horizon - this.elapsed);
          this.elapsed += step; remaining -= step;
          if (this.elapsed >= this.horizon - 1e-9) {
            this.elapsed = this.horizon; this.holdRemaining = this.holdSeconds;
          }
        } else {
          const step = Math.min(remaining, this.holdRemaining);
          this.holdRemaining -= step; remaining -= step;
          if (this.holdRemaining <= 1e-9) this.advanceWindow();
        }
      }
    }
    snapshot(method = 'learned') {
      const forecast = this.forecast, dt = this.config.dt;
      const actual = interpolateState(forecast.actual.states, this.elapsed, dt);
      const predicted = method === 'constant_velocity'
        ? [forecast[method].states[0][0] + this.elapsed*forecast[method].states[0][1], forecast[method].states[0][1], 0]
        : interpolateState(forecast[method].states, this.elapsed, dt);
      const actualXY = interpolateXY(forecast.actual.xy, this.elapsed, dt);
      const predictedXY = interpolateXY(forecast[method].xy, this.elapsed, dt);
      return {forecast, actual, predicted, actualXY, predictedXY, method,
              time: this.time, elapsed: this.elapsed, horizon: this.horizon,
              phase: this.phase, error: Math.hypot(predictedXY[0]-actualXY[0], predictedXY[1]-actualXY[1]),
              alongPathError: predicted[0]-actual[0]};
    }
  }
  window.ComparisonReplay = ComparisonReplay;
})();
