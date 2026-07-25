import { extractShowdownRoomId } from "@/lib/showdown-room";
import { MultiCastClient, type MultiCastGame } from "./multi-cast-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ games?: string }>;
}

function parseGames(value: string | undefined): MultiCastGame[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .slice(0, 4)
      .filter((game): game is Record<string, unknown> => Boolean(game) && typeof game === "object")
      .map((game) => ({
        matchId: Number(game.matchId),
        battleUrl: typeof game.battleUrl === "string" ? game.battleUrl : "",
        label: typeof game.label === "string" ? game.label.slice(0, 120) : "PBO Battle",
      }))
      .filter(
        (game) =>
          Number.isInteger(game.matchId) &&
          game.matchId > 0 &&
          Boolean(extractShowdownRoomId(game.battleUrl))
      );
  } catch {
    return [];
  }
}

export default async function MultiCastPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const games = parseGames(params.games);

  if (games.length === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#020617] p-8 text-center text-white">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider">Multi-Cast</h1>
          <p className="mt-2 text-sm text-slate-400">Add between one and four valid games from the broadcast setup page.</p>
        </div>
      </div>
    );
  }

  return <MultiCastClient games={games} />;
}
