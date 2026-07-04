"use client";

import { useState } from "react";

interface BlogImageProps {
  src: string;
  variant: "card" | "post";
}

type ImageResolution = {
  imageSrc: string | null;
  message?: string;
};

function resolveImageSrc(src: string): ImageResolution {
  try {
    const url = new URL(src);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    if (host === "i.imgur.com") {
      return { imageSrc: src };
    }

    if (host !== "imgur.com") {
      return { imageSrc: src };
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const [typeOrId, maybeId] = parts;

    if ((typeOrId === "a" || typeOrId === "gallery") && maybeId) {
      return {
        imageSrc: null,
        message: "Imgur gallery links cannot be displayed here. Use the direct i.imgur.com image URL or upload the image.",
      };
    }

    if (typeOrId) {
      const imageMatch = typeOrId.match(/^([a-zA-Z0-9]+)(\.(png|jpe?g|webp|gif))?$/);
      if (imageMatch) {
        const id = imageMatch[1];
        const extension = imageMatch[2] || ".png";
        return { imageSrc: `https://i.imgur.com/${id}${extension}` };
      }
    }
  } catch {
    return { imageSrc: src };
  }

  return {
    imageSrc: null,
    message: "This image URL is not a direct image file.",
  };
}

export function BlogImage({ src, variant }: BlogImageProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const resolved = resolveImageSrc(src);
  const isCard = variant === "card";

  if (!resolved.imageSrc || loadFailed) {
    return (
      <div
        className={
          isCard
            ? "flex h-48 w-full items-center justify-center bg-[var(--background-secondary)] px-4 text-center text-xs text-[var(--foreground-muted)]"
            : "flex min-h-48 w-full items-center justify-center rounded-lg bg-[var(--background-secondary)] px-4 text-center text-sm text-[var(--foreground-muted)]"
        }
      >
        {resolved.message || "This image could not be loaded. Use a direct image URL or upload the image."}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolved.imageSrc}
      alt=""
      loading="lazy"
      onError={() => setLoadFailed(true)}
      className={
        isCard
          ? "h-48 w-full object-cover"
          : "max-h-[520px] w-full object-contain"
      }
    />
  );
}
