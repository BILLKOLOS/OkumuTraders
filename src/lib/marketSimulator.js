/**
 * Volatile OTC rate + chart simulator.
 * Rate trades in [RATE_MIN, RATE_MAX]; chart swings [CHART_MIN, CHART_MAX].
 */

export const RATE_MIN = 2.07;
export const RATE_MAX = 2.17;
export const CHART_MAX = 2.11;
export const CHART_MIN = -2.17;
export const CHART_ZERO = (CHART_MAX + CHART_MIN) / 2;

export const CHART_LABELS = [CHART_MAX, CHART_MAX / 2, 0, CHART_MIN / 2, CHART_MIN];

const DELTA_STEPS = [0.09, 0.19, 0.29, 0.39, 0.49, 0.59, 0.69, 0.79, 0.89, 0.99];
const RATE_MID = (RATE_MIN + RATE_MAX) / 2;

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Map live rate into chart Y space with extra jitter so the line whips red/green. */
function rateToChartY(rate, jitter = 0) {
  const t = (rate - RATE_MID) / (RATE_MAX - RATE_MIN);
  const base = t * (CHART_MAX - CHART_MIN) * 0.55;
  return clamp(base + jitter, CHART_MIN, CHART_MAX);
}

export function createMarketState() {
  const rate = +(RATE_MID + (Math.random() - 0.5) * 0.06).toFixed(4);
  return {
    rate,
    prevRate: rate,
    burstTicks: 0,
    burstDir: 1,
  };
}

/**
 * Advance one tick. Returns { rate, chartPoint, pctChange, isUp }.
 */
export function tickMarket(state) {
  const prev = state.rate;
  let dir = Math.random() < 0.5 ? -1 : 1;

  // Burst: 2–4 rapid moves same direction then snap back
  if (state.burstTicks <= 0 && Math.random() < 0.22) {
    state.burstTicks = 2 + Math.floor(Math.random() * 3);
    state.burstDir = Math.random() < 0.5 ? -1 : 1;
  }
  if (state.burstTicks > 0) {
    dir = state.burstDir;
    state.burstTicks -= 1;
  } else if (Math.random() < 0.18) {
    dir *= -1;
  }

  let mag = pick(DELTA_STEPS);
  if (Math.random() < 0.14) mag = pick(DELTA_STEPS.filter((d) => d >= 0.49));
  if (Math.random() < 0.08) mag *= 2;

  let next = prev + dir * mag;

  if (next > RATE_MAX) {
    next = RATE_MAX - pick([0.09, 0.19, 0.29]) * (0.5 + Math.random());
    dir = -1;
  } else if (next < RATE_MIN) {
    next = RATE_MIN + pick([0.09, 0.19, 0.29]) * (0.5 + Math.random());
    dir = 1;
  }

  if (next > 2.11 && Math.random() < 0.35) {
    next -= pick([0.09, 0.19, 0.39, 0.59]);
  }

  next = +clamp(next, RATE_MIN, RATE_MAX).toFixed(4);
  state.prevRate = prev;
  state.rate = next;

  const jitter =
    (Math.random() - 0.5) * 1.4 +
    (next - prev) * 12 +
    (Math.random() < 0.2 ? (Math.random() - 0.5) * 2.2 : 0);

  const chartPoint = +rateToChartY(next, jitter).toFixed(3);
  const pctChange = +(((next - prev) / prev) * 100 + (Math.random() - 0.5) * 0.6).toFixed(2);

  return {
    rate: next,
    chartPoint,
    pctChange,
    isUp: next >= prev,
  };
}

/** Seed historical chart points. */
export function seedChartPoints(count, state) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    pts.push(tickMarket(state).chartPoint);
  }
  return pts;
}
