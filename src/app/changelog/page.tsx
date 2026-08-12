import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getPublishedChangelogEntries, type ChangelogChangeType } from "@/lib/changelog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Changelog",
  description: "See the latest features, improvements, fixes, and other updates to the PBO website.",
  alternates: { canonical: "/changelog" },
};

const CHANGE_STYLES: Record<ChangelogChangeType, { label: string; className: string; dot: string }> = {
  added: { label: "Added", className: "text-[var(--success)]", dot: "bg-[var(--success)]" },
  improved: { label: "Improved", className: "text-[var(--accent)]", dot: "bg-[var(--accent)]" },
  fixed: { label: "Fixed", className: "text-[var(--warning)]", dot: "bg-[var(--warning)]" },
  removed: { label: "Removed", className: "text-[var(--error)]", dot: "bg-[var(--error)]" },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export default async function ChangelogPage() {
  if (!(await isAuthenticated())) {
    notFound();
  }

  const entries = await getPublishedChangelogEntries();

  return (
    <div className="readable-content mx-auto max-w-4xl">
      <header className="mb-8 text-center sm:mb-10">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-[var(--primary-light)]">Website Updates</p>
        <h1 className="font-pixel text-2xl text-[var(--foreground)] sm:text-3xl">Changelog</h1>
        <div className="mx-auto mt-4 h-1 w-24 rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)]" />
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-[var(--foreground-muted)] sm:text-base">
          New features, quality-of-life improvements, and fixes from around the PBO website.
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="poke-card p-8 text-center sm:p-12">
          <h2 className="font-pixel text-sm text-[var(--foreground)]">No updates yet</h2>
          <p className="mt-3 text-sm text-[var(--foreground-muted)]">Published website updates will appear here.</p>
        </div>
      ) : (
        <div className="space-y-5 sm:space-y-6">
          {entries.map((entry) => (
            <article key={entry.id} className="poke-card overflow-hidden p-0">
              <div className="border-b border-[var(--card-border)] bg-[var(--background-secondary)]/70 px-5 py-5 sm:px-7 sm:py-6">
                <time dateTime={entry.publishedAt} className="font-pixel text-xs text-[var(--primary-light)] sm:text-sm">
                  {formatDate(entry.publishedAt)}
                </time>
                <h2 className="mt-2 text-xl font-black text-[var(--foreground)] sm:text-2xl">{entry.title}</h2>
                {entry.summary && <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--foreground-muted)] sm:text-base">{entry.summary}</p>}
              </div>

              <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
                {(Object.keys(CHANGE_STYLES) as ChangelogChangeType[]).map((type) => {
                  const changes = entry.changes.filter((change) => change.type === type);
                  if (changes.length === 0) return null;
                  const style = CHANGE_STYLES[type];

                  return (
                    <section key={type} aria-labelledby={`entry-${entry.id}-${type}`}>
                      <h3 id={`entry-${entry.id}-${type}`} className={`text-xs font-black uppercase tracking-[0.16em] ${style.className}`}>{style.label}</h3>
                      <ul className="mt-2 space-y-2">
                        {changes.map((change, index) => (
                          <li key={`${type}-${index}`} className="flex gap-3 text-sm leading-6 text-[var(--foreground)] sm:text-base">
                            <span className={`mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
                            <span>{change.text}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
