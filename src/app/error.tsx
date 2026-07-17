"use client";

import { useEffect, useRef } from "react";

type AppError = Error & { digest?: string };

export default function GlobalError({ error, reset }: { error: AppError; reset: () => void }) {
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;

    console.error("[Client Error Boundary]", error);
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest,
        path: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [error]);

  return (
    <main className="flex min-h-[50vh] items-center justify-center px-4 py-16">
      <div className="poke-card max-w-lg p-8 text-center">
        <h1 className="font-pixel text-xl text-white">Something went wrong</h1>
        <p className="mt-3 text-sm text-[var(--foreground-muted)]">
          The page could not load this time. The error was logged for review.
        </p>
        <button type="button" onClick={() => reset()} className="btn-retro mt-6">
          Try Again
        </button>
      </div>
    </main>
  );
}
