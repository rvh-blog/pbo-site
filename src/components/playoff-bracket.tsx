import Link from "next/link";
import Image from "next/image";

interface SeasonCoach {
  id: number;
  teamName: string;
  teamAbbreviation: string | null;
  teamLogoUrl: string | null;
  coach: { name: string } | null;
}

interface PlayoffMatch {
  id: number;
  seasonId: number;
  round: number;
  bracketPosition: number;
  higherSeedId: number | null;
  lowerSeedId: number | null;
  winnerId: number | null;
  higherSeedWins: number | null;
  lowerSeedWins: number | null;
  higherSeed: SeasonCoach | null;
  lowerSeed: SeasonCoach | null;
  winner: unknown;
  matchId?: number | null; // ID from matches table for linking to match details
}

interface PlayoffBracketProps {
  matches: PlayoffMatch[];
}

function TeamSlot({
  team,
  score,
  isWinner,
  isLoser,
  hasResult,
}: {
  team: SeasonCoach | null;
  score: number;
  isWinner: boolean;
  isLoser: boolean;
  hasResult: boolean;
}) {
  if (!team) {
    return (
      <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--background)]/50 border-2 border-dashed border-[var(--background-tertiary)]">
        <span className="text-xs text-[var(--foreground-muted)] italic">TBD</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between p-2 rounded-lg transition-colors border-2 ${
        isWinner
          ? "bg-[var(--success)]/10 border-[var(--success)]/50"
          : isLoser
          ? "bg-[var(--background)]/30 border-[var(--background-tertiary)] opacity-50"
          : "bg-[var(--background-secondary)] border-[var(--background-tertiary)]"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {team.teamLogoUrl ? (
          <div className="w-6 h-6 rounded overflow-hidden bg-[var(--background-tertiary)] flex items-center justify-center flex-shrink-0">
            <Image
              src={team.teamLogoUrl}
              alt={team.teamName}
              width={24}
              height={24}
              className="object-contain"
            />
          </div>
        ) : (
          <div className="w-6 h-6 rounded bg-[var(--primary)] flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-[10px]">
              {team.teamAbbreviation?.substring(0, 2) || team.teamName.substring(0, 2).toUpperCase()}
            </span>
          </div>
        )}
        <span className={`text-xs font-bold truncate ${isWinner ? "text-[var(--success)]" : ""}`}>
          {team.teamAbbreviation || team.teamName}
        </span>
      </div>
      {hasResult && (
        <span className={`font-pixel text-xs ml-2 ${isWinner ? "text-[var(--success)]" : "text-[var(--foreground-muted)]"}`}>
          {score}
        </span>
      )}
    </div>
  );
}

function MatchCard({ match }: { match: PlayoffMatch }) {
  const hasTeams = match.higherSeed || match.lowerSeed;
  const isCompleted = match.winnerId !== null;
  const higherSeedWon = match.winnerId === match.higherSeedId;
  const lowerSeedWon = match.winnerId === match.lowerSeedId;

  const roundLabels: Record<number, string> = {
    1: "Quarterfinals",
    2: "Semifinals",
    3: "Finals",
  };

  // Content shared between linked and non-linked versions
  const cardContent = (
    <>
      <div className="px-2 py-1.5 bg-[var(--background)] border-b-2 border-[var(--background-tertiary)]">
        <span className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
          {roundLabels[match.round]} {match.round === 1 ? `#${match.bracketPosition}` : ""}
        </span>
      </div>
      <div className="p-2 space-y-1.5">
        <TeamSlot
          team={match.higherSeed}
          score={match.higherSeedWins || 0}
          isWinner={higherSeedWon}
          isLoser={isCompleted && !higherSeedWon}
          hasResult={isCompleted}
        />
        <TeamSlot
          team={match.lowerSeed}
          score={match.lowerSeedWins || 0}
          isWinner={lowerSeedWon}
          isLoser={isCompleted && !lowerSeedWon}
          hasResult={isCompleted}
        />
      </div>
      {hasTeams && match.matchId && (
        <div className="px-2 py-2 border-t-2 border-[var(--background-tertiary)] text-center bg-[var(--background)]/50">
          <span className="text-[10px] text-[var(--primary)] font-bold uppercase group-hover:text-white transition-colors">
            {isCompleted ? "View Results" : "Match Preview"}
          </span>
        </div>
      )}
    </>
  );

  // If we have a matchId, wrap in Link; otherwise just show the card
  if (match.matchId) {
    return (
      <div className="w-full">
        <Link
          href={`/matches/${match.matchId}`}
          className="block rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] hover:border-[var(--primary)] transition-all overflow-hidden group"
        >
          {cardContent}
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] overflow-hidden">
        {cardContent}
      </div>
    </div>
  );
}

export function PlayoffBracket({ matches }: PlayoffBracketProps) {
  // Group matches by round
  const quarterfinals = matches.filter((m) => m.round === 1);
  const semifinals = matches.filter((m) => m.round === 2);
  const finals = matches.filter((m) => m.round === 3);

  // Split QF into left and right brackets
  const leftQF = quarterfinals.filter((m) => m.bracketPosition <= 2);
  const rightQF = quarterfinals.filter((m) => m.bracketPosition > 2);

  const leftSF = semifinals.find((m) => m.bracketPosition === 1);
  const rightSF = semifinals.find((m) => m.bracketPosition === 2);
  const finalMatch = finals[0];

  return (
    <div className="poke-card p-0 overflow-hidden">
      <div className="p-6 border-b-2 border-[var(--background-tertiary)]">
        <div className="section-title !mb-0">
          <div className="section-title-icon !bg-[var(--accent)]" style={{ boxShadow: '0 4px 0 #b45309' }}>
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
          </div>
          <h3>Playoffs</h3>
        </div>
      </div>

      <div className="p-6 overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Bracket Grid */}
          <div className="grid grid-cols-5 gap-4 items-center">
            {/* Left Quarterfinals */}
            <div className="space-y-4">
              {leftQF.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>

            {/* Left Semifinal */}
            <div className="flex items-center justify-center">
              {leftSF && <MatchCard match={leftSF} />}
            </div>

            {/* Finals */}
            <div className="flex items-center justify-center">
              {finalMatch && <MatchCard match={finalMatch} />}
            </div>

            {/* Right Semifinal */}
            <div className="flex items-center justify-center">
              {rightSF && <MatchCard match={rightSF} />}
            </div>

            {/* Right Quarterfinals */}
            <div className="space-y-4">
              {rightQF.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          </div>

          {/* Round Labels */}
          <div className="grid grid-cols-5 gap-4 mt-6 text-center">
            <div className="text-[10px] text-[var(--foreground-muted)] font-bold uppercase tracking-wide">
              Quarterfinals
            </div>
            <div className="text-[10px] text-[var(--foreground-muted)] font-bold uppercase tracking-wide">
              Semifinals
            </div>
            <div className="text-[10px] text-[var(--accent)] font-bold uppercase tracking-wide">
              Finals
            </div>
            <div className="text-[10px] text-[var(--foreground-muted)] font-bold uppercase tracking-wide">
              Semifinals
            </div>
            <div className="text-[10px] text-[var(--foreground-muted)] font-bold uppercase tracking-wide">
              Quarterfinals
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
