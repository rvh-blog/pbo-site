export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="Loading page">
      <div className="poke-card h-24 animate-pulse bg-[var(--background-secondary)]" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="poke-card h-36 animate-pulse bg-[var(--background-secondary)]"
          />
        ))}
      </div>
    </div>
  );
}
