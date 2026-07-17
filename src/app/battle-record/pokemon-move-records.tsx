import Image from "next/image";

export type PokemonMoveRecord = {
  pokemonId: number;
  pokemonName: string;
  spriteUrl: string | null;
  games: number;
  totalUses: number;
  moves: Array<{
    name: string;
    uses: number;
  }>;
};

export function PokemonMoveRecords({ records }: { records: PokemonMoveRecord[] }) {
  return (
    <div>
      <div className="border-b-2 border-[var(--background-tertiary)] px-4 py-3 text-center text-xs text-[var(--foreground-muted)] sm:px-6">
        Actual move commands from completed, non-forfeit matches played from January 8, 2026 onward.
      </div>

      {records.length > 0 ? (
        <div className="divide-y-2 divide-[var(--background-tertiary)]">
          {records.map((record) => (
            <div key={record.pokemonId} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(180px,0.8fr)_90px_minmax(0,2fr)] sm:items-center sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                {record.spriteUrl ? (
                  <Image
                    src={record.spriteUrl}
                    alt={record.pokemonName}
                    width={40}
                    height={40}
                    className="h-10 w-10 shrink-0 object-contain"
                  />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded bg-[var(--background-tertiary)]" />
                )}
                <div className="min-w-0">
                  <div className="truncate font-bold text-white">{record.pokemonName}</div>
                  <div className="text-[11px] text-[var(--foreground-muted)]">{record.games} {record.games === 1 ? "game" : "games"}</div>
                </div>
              </div>

              <div className="text-left sm:text-center">
                <div className="font-pixel text-lg text-[var(--accent)]">{record.totalUses}</div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">uses</div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {record.moves.map((move) => (
                  <span
                    key={move.name}
                    className="rounded border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 py-1 text-xs text-white"
                  >
                    {move.name} <span className="font-mono text-[var(--foreground-muted)]">{move.uses}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-10 text-center text-sm text-[var(--foreground-muted)]">
          No replay move data is available for this date range yet.
        </div>
      )}
    </div>
  );
}
