import Link from "next/link";
import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  icon?: ReactNode;
  compact?: boolean;
}

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  icon,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`empty-state ${compact ? "empty-state-compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="empty-state-icon" aria-hidden="true">
        {icon || (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3M5 11h14M6 5h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" />
          </svg>
        )}
      </div>
      <div>
        <h3 className="empty-state-title">{title}</h3>
        <p className="empty-state-description">{description}</p>
      </div>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="empty-state-action">
          {actionLabel}
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}
