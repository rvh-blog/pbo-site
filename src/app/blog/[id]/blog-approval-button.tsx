"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BlogApprovalButton({ postId }: { postId: number }) {
  const router = useRouter();
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setIsApproving(true);
    setError(null);

    try {
      const response = await fetch(`/api/blog?id=${postId}`, {
        method: "PATCH",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "Failed to approve blog post");
        return;
      }

      router.refresh();
    } catch {
      setError("Failed to approve blog post");
    } finally {
      setIsApproving(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleApprove}
        disabled={isApproving}
        className="btn-retro px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isApproving ? "Approving..." : "Approve Post"}
      </button>
      {error && (
        <p className="max-w-xs text-xs font-bold text-[var(--error)]">{error}</p>
      )}
    </div>
  );
}
