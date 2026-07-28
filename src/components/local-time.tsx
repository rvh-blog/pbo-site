"use client";

import { useState, useEffect } from "react";

interface LocalTimeProps {
  dateString: string;
  format?: "time" | "date" | "datetime";
  className?: string;
}

export function LocalTime({ dateString, format = "datetime", className }: LocalTimeProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const date = new Date(dateString);
  const validDate = !Number.isNaN(date.getTime());

  if (!validDate) {
    return <span className={className}>Time TBD</span>;
  }

  // Give server HTML, crawlers, and no-JavaScript visitors a useful PBO-time fallback.
  if (!mounted) {
    const fallback =
      format === "date"
        ? date.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            timeZone: "America/Los_Angeles",
          })
        : date.toLocaleString("en-US", {
            ...(format === "datetime"
              ? { weekday: "short", month: "short", day: "numeric" }
              : {}),
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/Los_Angeles",
            timeZoneName: "short",
          });
    return (
      <time dateTime={date.toISOString()} className={className}>
        {fallback}
      </time>
    );
  }

  if (format === "time") {
    return (
      <time dateTime={date.toISOString()} className={className}>
        {date.toLocaleString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })}
      </time>
    );
  }

  if (format === "date") {
    return (
      <time dateTime={date.toISOString()} className={className}>
        {date.toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        })}
      </time>
    );
  }

  // datetime (default)
  return (
    <time dateTime={date.toISOString()} className={className}>
      {date.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}
    </time>
  );
}
