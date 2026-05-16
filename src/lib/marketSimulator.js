/**
 * Aviator-style volatile market: chart whips through greens/reds;
 * trade rate caps at RATE_MAX (2.19). Extra chaos while user has an open trade.
 */

export const RATE_MIN = 2.0;
export const RATE_MAX = 2.19;
export const CHART_MAX = 2.19;
export const CHART_MIN = -2.2;
export const CHART_ZERO = 0;

export const CHART_LABELS = [CHART_MAX, 1.1, 0, -1.1, CHART_MIN];

/** Example swings within ~5s (greens/reds) — used as seeds + noise. */
const AVIATOR_CHART_SAMPLES = [
  0.04, 2.0, -0.4, 1.4, 0.01, 0.27, -2.2, 1.3, -2.0, -1.3, 1.4,
  -0.15, 0.82, -1.7, 1.95, -0.9, 0.55, -2.19, 2.19, 0.0,
];

const RATE_DELTAS_IDLE = [0.01, 0.02, 0.03, 0.05, 0.07, 0.09, 0.11, 0.15];
const RATE_DELTAS_TRADE = [
  0.01, 0.02, 0.04, 0.05, 0.07, 0.09, 0.11, 0.15, 0.19, 0.23, 0.27,
  0.31, 0.35, 0.41, 0.49, 0.58, 0.67, 0.79, 0.91,
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Unpredictable chart Y — any value in range, Aviator-style during trade. */
function nextChartPoint(inTrade, prevChart = 0) {
  if (inTrade) {
    const roll = Math.random();
    if (roll < 0.4) {
      const base = pick(AVIATOR_CHART_SAMPLES);
      return +clamp(base + (Math.random() - 0.5) * 0.5, CHART_MIN, CHART_MAX).toFixed(2);
    }
    if (roll < 0.7) {
      return +(CHART_MIN + Math.random() * (CHART_MAX - CHART_MIN)).toFixed(2);
    }
    const jump = (Math.random() - 0.5) * 3.8;
    return +clamp(prevChart + jump, CHART_MIN, CHART_MAX).toFixed(2);
  }

  const drift = (Math.random() - 0.5) * 1.2;
  if (Math.random() < 0.25) {
    return +clamp(pick(AVIATOR_CHART_SAMPLES), CHART_MIN, CHART_MAX).toFixed(2);
  }
  return +clamp(prevChart + drift, CHART_MIN, CHART_MAX).toFixed(2);
}

function nextRate(prev, inTrade) {
  let dir = Math.random() < 0.5 ? -1 : 1;
  if (Math.random() < (inTrade ? 0.35 : 0.2)) dir *= -1;

  const pool = inTrade ? RATE_DELTAS_TRADE : RATE_DELTAS_IDLE;
  let mag = pick(pool);
  if (inTrade && Math.random() < 0.12) mag *= 1.5;

  let next = prev + dir * mag;

  if (next > RATE_MAX) {
    next = RATE_MAX - pick([0.01, 0.03, 0.05, 0.09]) * (0.5 + Math.random());
  } else if (next < RATE_MIN) {
    next = RATE_MIN + pick([0.01, 0.03, 0.05, 0.09]) * (0.5 + Math.random());
  }

  if (inTrade && Math.random() < 0.08) {
    next = RATE_MIN + Math.random() * (RATE_MAX - RATE_MIN);
  }

  return +clamp(next, RATE_MIN, RATE_MAX).toFixed(4);
}

export function createMarketState() {
  const rate = +(RATE_MIN + Math.random() * (RATE_MAX - RATE_MIN) * 0.5).toFixed(4);
  return {
    rate,
    prevRate: rate,
    chartY: pick(AVIATOR_CHART_SAMPLES),
    burstTicks: 0,
    burstDir: 1,
  };
}

/**
 * @param {object} state
 * @param {{ inTrade?: boolean }} opts — true while user has an open position
 */
export function tickMarket(state, opts = {}) {
  const inTrade = !!opts.inTrade;
  const prev = state.rate;
  const prevChart = state.chartY ?? 0;

  const next = nextRate(prev, inTrade);
  const chartPoint = nextChartPoint(inTrade, prevChart);

  state.prevRate = prev;
  state.rate = next;
  state.chartY = chartPoint;

  const pctChange = +(((next - prev) / prev) * 100).toFixed(2);

  return {
    rate: next,
    chartPoint,
    pctChange,
    isUp: next >= prev,
    inTrade,
  };
}

export function seedChartPoints(count, state, inTrade = false) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    pts.push(tickMarket(state, { inTrade }).chartPoint);
  }
  return pts;
}

/** Tick interval ms: faster during open trade (~5s feels like Aviator). */
export function getTickIntervalMs(inTrade) {
  return inTrade ? 95 : 200;
}
