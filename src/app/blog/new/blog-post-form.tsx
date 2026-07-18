"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label, TextArea } from "@/components/ui/input";

function getImageUrlWarning(value: string) {
  if (!value.trim()) return null;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const parts = url.pathname.split("/").filter(Boolean);

    if (host === "imgur.com" && (parts[0] === "a" || parts[0] === "gallery")) {
      return "Imgur album/gallery links do not expose a direct image file. Upload the image here or use the direct i.imgur.com URL.";
    }
  } catch {
    return null;
  }

  return null;
}

interface BlogPostFormProps {
  canPostImages: boolean;
  requiresApproval: boolean;
}

export function BlogPostForm({ canPostImages, requiresApproval }: BlogPostFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const imageUrlWarning = getImageUrlWarning(imageUrl);

  async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setError(null);
    setIsUploadingImage(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title || "blog-image");

    try {
      const response = await fetch("/api/admin/blog-image", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to upload image");
        return;
      }

      setImageUrl(data.imageUrl);
    } catch {
      setError("Failed to upload image");
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (canPostImages && imageUrlWarning) {
      setError(imageUrlWarning);
      return;
    }

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
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              id="imageUrl"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              maxLength={1000}
              placeholder="/uploads/blog/example.png or https://example.com/image.png"
            />
            <label className="btn-retro-secondary flex cursor-pointer items-center justify-center px-4 py-2 text-[10px]">
              {isUploadingImage ? "Uploading..." : "Upload Image"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                disabled={isUploadingImage || isSubmitting}
                onChange={handleImageUpload}
              />
            </label>
          </div>
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="mt-3 max-h-48 w-full rounded-lg bg-[var(--background-secondary)] object-contain"
            />
          )}
          {imageUrlWarning && (
            <p className="mt-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-3 py-2 text-xs font-semibold text-[var(--warning)]">
              {imageUrlWarning}
            </p>
          )}
          <p className="mt-2 text-xs text-[var(--foreground-subtle)]">
            Optional. Uploading stores the image on the site so it does not depend on external embeds.
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
          disabled={isSubmitting || Boolean(imageUrlWarning)}
        >
          {isSubmitting
            ? requiresApproval
              ? "Submitting..."
              : "Posting..."
            : requiresApproval
              ? "Submit for Approval"
              : "Publish Post"}
        </button>
      </div>
    </form>
  );
}
