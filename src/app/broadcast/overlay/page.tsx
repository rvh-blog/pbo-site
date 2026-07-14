import { BroadcastOverlayPage } from "../overlay-page";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ matchId?: string; battleUrl?: string }>;
}

export default function OverlayV1Page({ searchParams }: PageProps) {
  return <BroadcastOverlayPage searchParams={searchParams} variant="v1" />;
}
