"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

type MetricState = {
  lcpMs?: number;
  cls?: number;
  inpMs?: number;
};

export function PerformanceMonitor() {
  const pathname = usePathname();

  useEffect(() => {
    const metrics: MetricState = {};
    const startedAt = performance.now();
    let sent = false;
    const observers: PerformanceObserver[] = [];

    const observe = (type: string, callback: (entries: PerformanceEntry[]) => void) => {
      if (!("PerformanceObserver" in window) || !PerformanceObserver.supportedEntryTypes.includes(type)) return;
      const observer = new PerformanceObserver((list) => callback(list.getEntries()));
      observer.observe({ type, buffered: true });
      observers.push(observer);
    };

    observe("largest-contentful-paint", (entries) => {
      const last = entries.at(-1);
      if (last) metrics.lcpMs = last.startTime;
    });
    observe("layout-shift", (entries) => {
      metrics.cls = (metrics.cls || 0) + entries.reduce((total, entry) => {
        const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        return total + (shift.hadRecentInput ? 0 : shift.value || 0);
      }, 0);
    });
    observe("event", (entries) => {
      const latest = entries.at(-1) as PerformanceEntry & { duration?: number } | undefined;
      if (latest?.duration) metrics.inpMs = Math.max(metrics.inpMs || 0, latest.duration);
    });

    const send = () => {
      if (sent) return;
      sent = true;
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const payload = JSON.stringify({
        path: pathname || window.location.pathname,
        routeDurationMs: performance.now() - startedAt,
        navigationDurationMs: navigation?.duration,
        ...metrics,
      });
      fetch("/api/performance", { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    };

    const timer = window.setTimeout(send, 3000);
    window.addEventListener("pagehide", send, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", send);
      observers.forEach((observer) => observer.disconnect());
    };
  }, [pathname]);

  return null;
}
