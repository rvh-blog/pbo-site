"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label, TextArea } from "@/components/ui/input";

export function BlogPostForm({ canPostImages }: { canPostImages: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          imageUrl: canPostImages ? imageUrl : "",
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to create blog post");
        return;
      }

      router.push(`/blog/${data.postId}`);
      router.refresh();
    } catch {
      setError("Failed to create blog post");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="poke-card p-4 sm:p-6 space-y-5">
      {error && (
        <div className="rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 px-4 py-3 text-sm font-bold text-[var(--error)]">
          {error}
        </div>
      )}

      <div>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          required
          placeholder="Week 4 Neon recap"
        />
      </div>

      {canPostImages && (
        <div>
          <Label htmlFor="imageUrl">Image URL</Label>
          <Input
            id="imageUrl"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            maxLength={1000}
            placeholder="https://example.com/image.png"
          />
          <p className="mt-2 text-xs text-[var(--foreground-subtle)]">
            Optional. Only admins can add images to blog posts.
          </p>
        </div>
      )}

      <div>
        <Label htmlFor="content">Post</Label>
        <TextArea
          id="content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={20000}
          required
          rows={16}
          placeholder="Write your league update..."
          className="resize-y leading-7"
        />
        <div className="mt-2 text-right text-xs text-[var(--foreground-subtle)]">
          {content.length}/20000
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push("/blog")}
          className="btn-retro-secondary py-2 px-5 text-[10px]"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn-retro py-2 px-5 text-[10px]"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Posting..." : "Publish Post"}
        </button>
      </div>
    </form>
  );
}
