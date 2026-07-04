"use client";

import { useState, useTransition } from "react";

export interface PollOptionResult {
  index: number;
  label: string;
  votes: number;
  percentage: number;
}

export interface PollData {
  id: number;
  question: string;
  options: PollOptionResult[];
  totalVotes: number;
  selectedOptionIndex: number | null;
  canVote: boolean;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export function PollCard({ initialPoll, compact = false }: { initialPoll: PollData | null; compact?: boolean }) {
  const [poll, setPoll] = useState(initialPoll);
  const [error, setError] = useState<string | null>(null);
  const [isHidden, setIsHidden] = useState(() =>
    typeof window !== "undefined" && initialPoll
      ? localStorage.getItem(`pbo-hidden-poll-${initialPoll.id}`) === "true"
      : false
  );
  const [isPending, startTransition] = useTransition();

  if (!poll) return null;

  function hidePoll() {
    if (!poll) return;
    localStorage.setItem(`pbo-hidden-poll-${poll.id}`, "true");
    setIsHidden(true);
  }

  function unhidePoll() {
    if (!poll) return;
    localStorage.removeItem(`pbo-hidden-poll-${poll.id}`);
    setIsHidden(false);
  }

  function vote(optionIndex: number) {
    if (!poll?.canVote) return;

    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pollId: poll.id, optionIndex }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Failed to submit vote");
        return;
      }

      setPoll(data.poll);
    });
  }

  if (isHidden) {
    return (
      <div className={`rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/45 ${compact ? "p-4" : "p-5"}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] text-[var(--foreground-subtle)] uppercase font-bold tracking-widest">
              League Poll
            </div>
            <p className="mt-1 truncate text-xs text-[var(--foreground-muted)]">
              Poll hidden
            </p>
          </div>
          <button
            type="button"
            onClick={unhidePoll}
            className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)] transition-colors hover:text-white"
          >
            Unhide
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/45 ${compact ? "p-4" : "p-5"}`}>
      <div className="text-[10px] text-[var(--foreground-subtle)] uppercase font-bold tracking-widest">
        <div className="flex items-center justify-between gap-3">
          <span>League Poll</span>
          <button
            type="button"
            onClick={hidePoll}
            className="text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)] transition-colors hover:text-white"
          >
            Hide
          </button>
        </div>
      </div>
      <h3 className="mt-2 text-sm font-bold text-white">{poll.question}</h3>
      <div className="mt-3 space-y-2">
        {poll.options.map((option) => {
          const selected = poll.selectedOptionIndex === option.index;
          const showResults = poll.selectedOptionIndex !== null;

          return (
            <button
              key={option.index}
              type="button"
              onClick={() => vote(option.index)}
              disabled={!poll.canVote || isPending}
              className={`w-full rounded border p-2 text-left transition-colors ${
                selected
                  ? "border-[var(--primary)] bg-[var(--primary)]/15"
                  : "border-[var(--background-tertiary)] bg-[var(--background-secondary)]/70 hover:border-white/30"
              } ${poll.canVote ? "" : "cursor-default"}`}
            >
              <div className="flex items-center justify-between gap-3 text-xs font-bold">
                <span className="text-white">{option.label}</span>
                {showResults && (
                  <span className="font-mono text-[var(--foreground-muted)]">
                    {formatPercent(option.percentage)}
                  </span>
                )}
              </div>
              {showResults && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--background-tertiary)]">
                  <div
                    className="h-full rounded-full bg-[var(--primary)]"
                    style={{ width: `${Math.max(0, Math.min(100, option.percentage))}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-[var(--foreground-subtle)]">
        <span>{poll.selectedOptionIndex !== null ? `${poll.totalVotes} vote${poll.totalVotes === 1 ? "" : "s"}` : "Vote to reveal results"}</span>
        {!poll.canVote && <span>Coach login required to vote</span>}
      </div>
      {error && <p className="mt-2 text-xs text-[var(--error)]">{error}</p>}
    </div>
  );
}
