export default function AdminLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="Loading admin page">
      <div className="h-8 w-64 animate-pulse rounded bg-[var(--background-tertiary)]" />
      <div className="h-4 w-96 max-w-full animate-pulse rounded bg-[var(--background-tertiary)]" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl border border-[var(--background-tertiary)] bg-[var(--background-secondary)]"
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl border border-[var(--background-tertiary)] bg-[var(--background-secondary)]" />
    </div>
  );
}
