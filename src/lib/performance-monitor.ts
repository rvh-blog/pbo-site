type BrowserPerformanceMetric = {
  path: string;
  id: string;
  name: "CLS" | "FCP" | "INP" | "LCP" | "TTFB";
  value: number;
  rating?: string;
  navigationType?: string;
};

type StoredMetric = BrowserPerformanceMetric & { receivedAt: string };

const MAX_SAMPLES = 500;
const samples: StoredMetric[] = [];

const METRIC_LIMITS: Record<BrowserPerformanceMetric["name"], number> = {
  CLS: 100,
  FCP: 120_000,
  INP: 120_000,
  LCP: 120_000,
  TTFB: 120_000,
};

function isMetricName(value: unknown): value is BrowserPerformanceMetric["name"] {
  return typeof value === "string" && value in METRIC_LIMITS;
}

export function recordBrowserPerformanceMetric(input: BrowserPerformanceMetric) {
  if (!isMetricName(input.name)) return false;
  if (typeof input.value !== "number" || !Number.isFinite(input.value) || input.value < 0 || input.value > METRIC_LIMITS[input.name]) {
    return false;
  }

  const path = typeof input.path === "string" && input.path.startsWith("/") ? input.path.slice(0, 180) : "/";
  const sample: StoredMetric = {
    path,
    id: typeof input.id === "string" ? input.id.slice(0, 100) : "",
    name: input.name,
    value: input.value,
    rating: typeof input.rating === "string" ? input.rating.slice(0, 20) : undefined,
    navigationType: typeof input.navigationType === "string" ? input.navigationType.slice(0, 30) : undefined,
    receivedAt: new Date().toISOString(),
  };

  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
  return true;
}

export function getBrowserPerformanceStats() {
  const byPath = new Map<string, { count: number; values: Record<BrowserPerformanceMetric["name"], number[]> }>();

  for (const sample of samples) {
    const current = byPath.get(sample.path) || {
      count: 0,
      values: { CLS: [], FCP: [], INP: [], LCP: [], TTFB: [] },
    };
    current.count++;
    current.values[sample.name].push(sample.value);
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
      metricCount: data.count,
      p75FcpMs: percentile(data.values.FCP, 0.75),
      p75LcpMs: percentile(data.values.LCP, 0.75),
      p75Cls: percentile(data.values.CLS, 0.75),
      p75InpMs: percentile(data.values.INP, 0.75),
      p75TtfbMs: percentile(data.values.TTFB, 0.75),
    })).sort((a, b) => (b.p75LcpMs || 0) - (a.p75LcpMs || 0)),
  };
}
