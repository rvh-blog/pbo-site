"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

interface AdminPollData {
  id: number | null;
  question: string;
  options: string[];
  isActive: boolean;
}

export function PollAdminCard({ initialPoll }: { initialPoll: AdminPollData }) {
  const [question, setQuestion] = useState(initialPoll.question);
  const [options, setOptions] = useState(initialPoll.options.length >= 2 ? initialPoll.options : ["", ""]);
  const [isActive, setIsActive] = useState(initialPoll.isActive);
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
      setMessage("Poll saved.");
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-[var(--background-tertiary)] p-4">
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
