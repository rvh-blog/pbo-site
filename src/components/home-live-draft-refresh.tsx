"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function HomeLiveDraftRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    function refreshDraft() {
      if (document.hidden) return;

      const now = Date.now();
      if (now - lastRefreshAt.current < 2_000) return;

      lastRefreshAt.current = now;
      router.refresh();
    }

    const intervalId = window.setInterval(refreshDraft, intervalMs);
    document.addEventListener("visibilitychange", refreshDraft);
    window.addEventListener("focus", refreshDraft);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshDraft);
      window.removeEventListener("focus", refreshDraft);
    };
  }, [intervalMs, router]);

  return null;
}
