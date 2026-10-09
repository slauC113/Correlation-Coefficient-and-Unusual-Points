export type Point = { x: number y: number }

export const presets = {
  moderate: {
    label: "Moderate positive",
    description: "r ≈ +0.75",
    points: [
      { x: 3, y: 10.5 },
      { x: 5, y: 7.9 },
      { x: 7, y: 6.9 },
      { x: 9, y: 10.9 },
      { x: 11, y: 16.9 },
      { x: 13, y: 12.1 },
      { x: 15, y: 18 },
    ],
    candidate: { x: 17, y: 16 },
  },
  strong: {
    label: "Strong positive",
    description: "r ≈ +0.90",
    points: [
      { x: 3, y: 4.6 },
      { x: 5, y: 8.8 },
      { x: 7, y: 11.6 },
      { x: 9, y: 12.5 },
      { x: 11, y: 15.3 },
      { x: 13, y: 18 },
      { x: 15, y: 14.5 },
    ],
    candidate: { x: 17, y: 17 },
  },
  zero: {
    label: "Near zero",
    description: "r ≈ 0.00",
    points: [
      { x: 3, y: 7.8 },
      { x: 5, y: 14.5 },
      { x: 7, y: 6.9 },
      { x: 9, y: 15 },
      { x: 11, y: 4.4 },
      { x: 13, y: 13.5 },
      { x: 15, y: 7.3 },
    ],
    candidate: { x: 17, y: 16 },
  },
  negative: {
    label: "Strong negative",
    description: "r ≈ −0.90",
    points: [
      { x: 3, y: 16 },
      { x: 5, y: 12 },
      { x: 7, y: 13.5 },
      { x: 9, y: 8.5 },
      { x: 11, y: 10 },
      { x: 13, y: 5 },
      { x: 15, y: 6.5 },
    ],
    candidate: { x: 17, y: 3 },
  },
  perfect: {
    label: "Perfect positive",
    description: "r = +1.00",
    points: [
      { x: 3, y: 3.5 },
      { x: 5, y: 5.5 },
      { x: 7, y: 7.5 },
      { x: 9, y: 9.5 },
      { x: 11, y: 11.5 },
      { x: 13, y: 13.5 },
      { x: 15, y: 15.5 },
    ],
    candidate: { x: 17, y: 17.5 },
  },
}

export type PresetKey = keyof typeof presets

export function computeStats(points: Point[]) {
  const n = points.length
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n
  let ssxx = 0,
    ssyy = 0,
    ssxy = 0
  points.forEach((p) => {
    ssxx += (p.x - meanX) ** 2
    ssyy += (p.y - meanY) ** 2
    ssxy += (p.x - meanX) * (p.y - meanY)
  })
  const defined = ssxx > 1e-10 && ssyy > 1e-10
  const r = defined
    ? Math.max(-1, Math.min(1, ssxy / Math.sqrt(ssxx * ssyy)))
    : 0
  const slope = ssxx > 1e-10 ? ssxy / ssxx : 0
  return {
    n,
    meanX,
    meanY,
    ssxx,
    r,
    r2: r * r,
    slope,
    intercept: meanY - slope * meanX,
    defined,
  }
}

export function computeDiagnostics(points: Point[], candidate: Point) {
  const all = [...points, candidate]
  const stats = computeStats(all)
  const leverage =
    1 / stats.n +
    (stats.ssxx > 1e-10 ? (candidate.x - stats.meanX) ** 2 / stats.ssxx : 0)
  const residual = candidate.y - (stats.slope * candidate.x + stats.intercept)
  const sse = all.reduce(
    (sum, p) => sum + (p.y - stats.slope * p.x - stats.intercept) ** 2,
    0,
  )
  const mse = sse / (stats.n - 2)
  const standardized =
    mse > 1e-10 && leverage < 1 - 1e-10
      ? residual / Math.sqrt(mse * (1 - leverage))
      : 0
  const cook =
    leverage < 1 - 1e-10
      ? ((standardized ** 2 / 2) * leverage) / (1 - leverage)
      : 0
  return { leverage, residual, standardized, cook, threshold: 4 / stats.n }
}

export const signed = (value: number) =>
  `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(3)}`
