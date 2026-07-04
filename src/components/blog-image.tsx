interface BlogImageProps {
  src: string;
  variant: "card" | "post";
}

function getImgurEmbedUrl(src: string) {
  try {
    const url = new URL(src);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    if (host !== "imgur.com") return null;

    const parts = url.pathname.split("/").filter(Boolean);
    const type = parts[0];
    const id = parts[1];

    if ((type === "a" || type === "gallery") && id) {
      return `https://imgur.com/${type}/${id}/embed`;
    }
  } catch {
    return null;
  }

  return null;
}

export function BlogImage({ src, variant }: BlogImageProps) {
  const imgurEmbedUrl = getImgurEmbedUrl(src);
  const isCard = variant === "card";

  if (imgurEmbedUrl) {
    return (
      <iframe
        src={imgurEmbedUrl}
        title="Blog post image"
        loading="lazy"
        className={
          isCard
            ? "h-64 w-full border-0 bg-black"
            : "h-[520px] max-h-[70vh] w-full border-0 bg-black"
        }
        allowFullScreen
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      className={
        isCard
          ? "h-48 w-full object-cover"
          : "max-h-[520px] w-full object-contain"
      }
    />
  );
}
