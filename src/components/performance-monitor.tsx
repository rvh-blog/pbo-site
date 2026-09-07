"use client";

import { useReportWebVitals } from "next/web-vitals";

const REPORTED_METRICS = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"]);

function reportWebVital(metric: {
  id: string;
  name: string;
  value: number;
  rating?: string;
  navigationType?: string;
}) {
  if (!REPORTED_METRICS.has(metric.name)) return;

  const analyticsWindow = window as Window & {
    gtag?: (...args: unknown[]) => void;
  };
  analyticsWindow.gtag?.("event", metric.name, {
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
    metric_id: metric.id,
    metric_value: metric.value,
    metric_rating: metric.rating,
    non_interaction: true,
  });

  const payload = JSON.stringify({
    path: window.location.pathname,
    id: metric.id,
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    navigationType: metric.navigationType,
  });

  fetch("/api/performance", {
    method: "POST",
    body: payload,
    headers: { "Content-Type": "application/json" },
    keepalive: true,
  }).catch(() => {});
}

export function PerformanceMonitor() {
  useReportWebVitals(reportWebVital);
  return null;
}
