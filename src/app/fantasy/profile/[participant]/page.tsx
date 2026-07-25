import Link from "next/link";
import { FantasyProfileClient } from "./fantasy-profile-client";

type PageProps = {
  params: Promise<{ participant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FantasyProfilePage({ params, searchParams }: PageProps) {
  const [{ participant }, query] = await Promise.all([params, searchParams]);
  const seasonId = Number(firstParam(query.seasonId));
  const match = /^(coach|user)-(\d+)$/.exec(participant);

  if (!match || !Number.isInteger(seasonId)) {
    return (
      <div className="poke-card p-8 text-center">
        <h1 className="font-pixel text-lg text-white">Fantasy Profile</h1>
        <p className="mt-3 text-sm text-[var(--foreground-muted)]">This Fantasy profile link is invalid.</p>
        <Link href="/fantasy" className="btn-retro-secondary mt-5 inline-block px-4 py-2 text-[9px]">
          Back to Fantasy
        </Link>
      </div>
    );
  }

  return (
    <FantasyProfileClient
      participantType={match[1] as "coach" | "user"}
      participantId={Number(match[2])}
      seasonId={seasonId}
    />
  );
}
