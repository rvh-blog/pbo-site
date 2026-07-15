type BrowserPerformanceMetric = {
  path: string;
  routeDurationMs?: number;
  navigationDurationMs?: number;
  lcpMs?: number;
  cls?: number;
  inpMs?: number;
};

type StoredMetric = BrowserPerformanceMetric & { receivedAt: string };

const MAX_SAMPLES = 500;
const samples: StoredMetric[] = [];

function finiteNumber(value: unknown, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? value : undefined;
}

export function recordBrowserPerformanceMetric(input: BrowserPerformanceMetric) {
  const path = typeof input.path === "string" && input.path.startsWith("/") ? input.path.slice(0, 180) : "/";
  const sample: StoredMetric = {
    path,
    routeDurationMs: finiteNumber(input.routeDurationMs, 120_000),
    navigationDurationMs: finiteNumber(input.navigationDurationMs, 120_000),
    lcpMs: finiteNumber(input.lcpMs, 120_000),
    cls: finiteNumber(input.cls, 100),
    inpMs: finiteNumber(input.inpMs, 120_000),
    receivedAt: new Date().toISOString(),
  };

  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
}

export function getBrowserPerformanceStats() {
  const byPath = new Map<string, { count: number; routeDurations: number[]; navigationDurations: number[]; lcp: number[]; cls: number[]; inp: number[] }>();

  for (const sample of samples) {
    const current = byPath.get(sample.path) || { count: 0, routeDurations: [], navigationDurations: [], lcp: [], cls: [], inp: [] };
    current.count++;
    if (sample.routeDurationMs !== undefined) current.routeDurations.push(sample.routeDurationMs);
    if (sample.navigationDurationMs !== undefined) current.navigationDurations.push(sample.navigationDurationMs);
    if (sample.lcpMs !== undefined) current.lcp.push(sample.lcpMs);
    if (sample.cls !== undefined) current.cls.push(sample.cls);
    if (sample.inpMs !== undefined) current.inp.push(sample.inpMs);
    byPath.set(sample.path, current);
  }

  const percentile = (values: number[], p: number) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] * 100) / 100;
  };

  return {
    sampleCount: samples.length,
    routes: [...byPath.entries()].map(([path, data]) => ({
      path,
      count: data.count,
      p75RouteDurationMs: percentile(data.routeDurations, 0.75),
      p75NavigationDurationMs: percentile(data.navigationDurations, 0.75),
      p75LcpMs: percentile(data.lcp, 0.75),
      p75Cls: percentile(data.cls, 0.75),
      p75InpMs: percentile(data.inp, 0.75),
    })).sort((a, b) => (b.p75RouteDurationMs || 0) - (a.p75RouteDurationMs || 0)),
  };
}
