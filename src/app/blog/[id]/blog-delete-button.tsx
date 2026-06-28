"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BlogDeleteButton({ postId }: { postId: number }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("Delete this blog post? This cannot be undone.")) return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/blog?id=${postId}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "Failed to delete blog post");
        return;
      }

      router.push("/blog");
      router.refresh();
    } catch {
      setError("Failed to delete blog post");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="rounded-lg border border-[var(--error)]/40 bg-[var(--error)]/10 px-4 py-2 text-[10px] font-black uppercase text-[var(--error)] transition-colors hover:bg-[var(--error)]/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isDeleting ? "Deleting..." : "Delete Post"}
      </button>
      {error && (
        <p className="max-w-xs text-xs font-bold text-[var(--error)]">{error}</p>
      )}
    </div>
  );
}
