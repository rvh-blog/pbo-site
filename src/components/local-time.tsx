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
    setMounted(true);
  }, []);

  const date = new Date(dateString);

  // Before hydration, show a placeholder or the raw time
  if (!mounted) {
    return <span className={className}>--:--</span>;
  }

  if (format === "time") {
    return (
      <span className={className}>
        {date.toLocaleString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })}
      </span>
    );
  }

  if (format === "date") {
    return (
      <span className={className}>
        {date.toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        })}
      </span>
    );
  }

  // datetime (default)
  return (
    <span className={className}>
      {date.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}
    </span>
  );
}
