"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

interface AdminPollData {
  id: number | null;
  question: string;
  options: string[];
  isActive: boolean;
  totalVotes: number;
  results: Array<{
    index: number;
    label: string;
    votes: number;
    percentage: number;
  }>;
}

export function PollAdminCard({ initialPoll }: { initialPoll: AdminPollData }) {
  const [question, setQuestion] = useState(initialPoll.question);
  const [options, setOptions] = useState(initialPoll.options.length >= 2 ? initialPoll.options : ["", ""]);
  const [isActive, setIsActive] = useState(initialPoll.isActive);
  const [totalVotes, setTotalVotes] = useState(initialPoll.totalVotes);
  const [results, setResults] = useState(initialPoll.results);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateOption(index: number, value: string) {
    setOptions((current) => current.map((option, i) => (i === index ? value : option)));
  }

  function removeOption(index: number) {
    setOptions((current) => current.filter((_, i) => i !== index));
  }

  function save() {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, options, isActive }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Failed to save poll");
        return;
      }

      setQuestion(data.poll.question);
      setOptions(data.poll.options.length >= 2 ? data.poll.options : ["", ""]);
      setIsActive(data.poll.isActive);
      setTotalVotes(data.poll.totalVotes);
      setResults(data.poll.results);
      setMessage("Poll saved.");
    });
  }

  const resultRows = results.length > 0
    ? results
    : options
        .map((label, index) => ({ index, label: label.trim(), votes: 0, percentage: 0 }))
        .filter((result) => result.label);

  return (
    <div className="space-y-4 rounded-lg border border-[var(--background-tertiary)] p-4">
      <div className="rounded-lg border-2 border-[var(--primary)]/30 bg-[var(--background)]/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-white">Current Results</h4>
            <p className="text-xs text-[var(--foreground-muted)]">Aggregate vote totals only.</p>
          </div>
          <span className="rounded bg-[var(--background-secondary)] px-2 py-1 text-xs font-bold text-[var(--foreground-muted)]">
            {totalVotes} vote{totalVotes === 1 ? "" : "s"}
          </span>
        </div>

        {resultRows.length > 0 ? (
          <div className="space-y-2">
            {resultRows.map((result) => (
              <div key={result.index}>
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate font-bold text-white">{result.label}</span>
                  <span className="shrink-0 font-mono text-[var(--foreground-muted)]">
                    {Math.round(result.percentage * 10) / 10}% ({result.votes})
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--background-tertiary)]">
                  <div
                    className="h-full rounded-full bg-[var(--primary)] transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, result.percentage))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--foreground-subtle)]">Save poll options to see results here.</p>
        )}
      </div>

      <div className="grid gap-2">
        <label className="text-xs font-bold uppercase tracking-wide text-[var(--foreground-muted)]">Question</label>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          className="rounded border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none focus:border-white/40"
          placeholder="What should the league vote on?"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label className="text-xs font-bold uppercase tracking-wide text-[var(--foreground-muted)]">Options</label>
          <Button type="button" size="sm" variant="outline" onClick={() => setOptions((current) => [...current, ""])}>
            Add Option
          </Button>
        </div>
        {options.map((option, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={option}
              onChange={(event) => updateOption(index, event.target.value)}
              className="min-w-0 flex-1 rounded border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none focus:border-white/40"
              placeholder={`Option ${index + 1}`}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => removeOption(index)}
              disabled={options.length <= 2}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        Show this poll on coach pages and the home page
      </label>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={isPending}>
          {isPending ? "Saving..." : "Save Poll"}
        </Button>
        {message && <span className="text-sm text-[var(--success)]">{message}</span>}
        {error && <span className="text-sm text-[var(--error)]">{error}</span>}
      </div>
    </div>
  );
}
