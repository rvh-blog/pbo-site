interface LoadingStateProps {
  label?: string;
  rows?: number;
  compact?: boolean;
}

export function LoadingState({
  label = "Loading content",
  rows = 3,
  compact = false,
}: LoadingStateProps) {
  return (
    <div
      className={`loading-state ${compact ? "loading-state-compact" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
      <div className="skeleton-line skeleton-line-title" />
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="skeleton-line"
          style={{ width: `${92 - index * 9}%` }}
        />
      ))}
    </div>
  );
}
