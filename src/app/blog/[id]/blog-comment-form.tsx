"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { TextArea } from "@/components/ui/input";

interface BlogCommentFormProps {
  postId: number;
  parentCommentId?: number;
  placeholder?: string;
  submitLabel?: string;
  rows?: number;
  onPosted?: () => void;
}

export function BlogCommentForm({
  postId,
  parentCommentId,
  placeholder = "Add a comment...",
  submitLabel = "Post Comment",
  rows = 4,
  onPosted,
}: BlogCommentFormProps) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/blog/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, parentCommentId, content }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to post comment");
        return;
      }

      setContent("");
      onPosted?.();
      router.refresh();
    } catch {
      setError("Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 px-4 py-3 text-sm font-bold text-[var(--error)]">
          {error}
        </div>
      )}

      <TextArea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={2000}
        required
        rows={rows}
        placeholder={placeholder}
        className="resize-y leading-7"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-[var(--foreground-subtle)]">{content.length}/2000</span>
        <button
          type="submit"
          className="btn-retro py-2 px-5 text-[10px]"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Posting..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
