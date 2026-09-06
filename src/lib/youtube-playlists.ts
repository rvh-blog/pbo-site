import { unstable_cache } from "next/cache";

export type YouTubePlaylistVideo = {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string | null;
};

export type YouTubePlaylistResult =
  | { status: "ready"; videos: YouTubePlaylistVideo[] }
  | { status: "unconfigured" | "unavailable"; videos: [] };

const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{10,120}$/;

export function extractYouTubePlaylistId(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  try {
    const playlistId = trimmed.includes("list=")
      ? new URL(trimmed).searchParams.get("list")
      : trimmed;
    return playlistId && PLAYLIST_ID_PATTERN.test(playlistId) ? playlistId : null;
  } catch {
    return null;
  }
}

async function fetchPlaylistVideos(playlistId: string): Promise<YouTubePlaylistResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return { status: "unconfigured", videos: [] };

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("key", apiKey);

    const response = await fetch(url, { next: { revalidate: 300 } });
    if (!response.ok) return { status: "unavailable", videos: [] };

    const payload = (await response.json()) as {
      items?: Array<{
        contentDetails?: { videoId?: string };
        snippet?: {
          title?: string;
          publishedAt?: string;
          thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
        };
      }>;
    };

    const videos = (payload.items ?? [])
      .map((item) => ({
        videoId: item.contentDetails?.videoId ?? "",
        title: item.snippet?.title ?? "Untitled video",
        publishedAt: item.snippet?.publishedAt ?? "",
        thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
      }))
      .filter((video) => video.videoId);

    return { status: "ready", videos };
  } catch {
    return { status: "unavailable", videos: [] };
  }
}

export function getYouTubePlaylistVideos(playlistId: string) {
  return unstable_cache(
    () => fetchPlaylistVideos(playlistId),
    ["youtube-playlist-videos", playlistId],
    { revalidate: 300 },
  )();
}
