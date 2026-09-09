"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import type { YouTubePlaylistVideo } from "@/lib/youtube-playlists";

interface YouTubePlaylistBrowserProps {
  label: string;
  videos: YouTubePlaylistVideo[];
}

export function YouTubePlaylistBrowser({ label, videos }: YouTubePlaylistBrowserProps) {
  const [selectedVideoId, setSelectedVideoId] = useState(videos[0]?.videoId ?? "");

  if (!selectedVideoId) return null;

  return (
    <div className="grid max-w-[720px] gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="aspect-video w-full max-w-[320px] overflow-hidden rounded-lg bg-black">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${selectedVideoId}?rel=0`}
          title={label}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
      <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1" aria-label="Playlist videos">
        {videos.map((video, index) => (
          <button
            key={video.videoId}
            type="button"
            onClick={() => setSelectedVideoId(video.videoId)}
            className={`flex w-full gap-3 rounded-lg border p-2 text-left transition-colors ${
              selectedVideoId === video.videoId
                ? "border-red-300/60 bg-red-300/10"
                : "border-[var(--border)] bg-[var(--background-primary)]/40 hover:border-[var(--primary)]"
            }`}
            aria-label={`Play video ${index + 1}: ${video.title}`}
          >
            {video.thumbnailUrl ? (
              <img src={video.thumbnailUrl} alt="" className="h-14 w-24 shrink-0 rounded object-cover" />
            ) : (
              <span className="flex h-14 w-24 shrink-0 items-center justify-center rounded bg-[var(--background-tertiary)] text-xs text-[var(--foreground-subtle)]">Video</span>
            )}
            <span className="min-w-0">
              <span className="line-clamp-2 text-xs font-bold text-white">{video.title}</span>
              {video.publishedAt && (
                <span className="mt-1 block text-[10px] text-[var(--foreground-muted)]">
                  {new Date(video.publishedAt).toLocaleDateString()}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
