"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef } from "react";

interface StandingsRowProps {
  team: {
    coachId: number;
    teamName: string;
    teamLogoUrl: string | null;
    teamAbbreviation: string | null;
    coach: { name: string } | null;
    wins: number;
    losses: number;
    differential: number;
    gamesPlayed: number;
  };
  index: number;
  isInRelegationZone: boolean;
  isInPromotionZone: boolean;
  hasBg: boolean;
  hasBorder: boolean;
  hasGlow: boolean;
  bgColor?: string;
  borderColor?: string;
  glowStyle?: React.CSSProperties;
}

export function StandingsRow({
  team,
  index,
  isInRelegationZone,
  isInPromotionZone,
  hasBg,
  hasBorder,
  hasGlow,
  bgColor,
  borderColor,
  glowStyle,
}: StandingsRowProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasBg) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--mouse-x", `${x}%`);
      el.style.setProperty("--mouse-y", `${y}%`);
    };

    el.addEventListener("mousemove", handleMouseMove);

    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
    };
  }, [hasBg]);

  return (
    <div
      ref={ref}
      className={`${hasBg ? 'row-background' : ''} ${hasBorder ? 'row-border' : ''} rounded-lg`}
      style={{
        ...(hasBg ? { "--row-bg-color": bgColor, "--mouse-x": "50%", "--mouse-y": "50%" } : {}),
        ...(hasBorder ? { "--row-border-color": borderColor } : {}),
      } as React.CSSProperties}
    >
      <Link
        href={`/coaches/${team.coachId}`}
        className={`trainer-card gap-2 sm:gap-3 group ${
          isInPromotionZone ? 'border-l-2 border-l-[var(--success)]/50' : ''
        } ${isInRelegationZone ? 'border-l-2 border-l-[var(--error)]/50' : ''}`}
      >
        {/* Rank Badge */}
        <div className={`rank-badge w-5 h-5 sm:w-8 sm:h-8 text-[10px] sm:text-sm ${
          index === 0 ? 'rank-1' :
          index === 1 ? 'rank-2' :
          index === 2 ? 'rank-3' :
          'bg-[var(--background)] text-[var(--foreground-subtle)] border border-[var(--background-tertiary)]'
        }`}>
          {index + 1}
        </div>

        {/* Team Info */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {team.teamLogoUrl ? (
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded overflow-hidden flex items-center justify-center flex-shrink-0">
              <Image
                src={team.teamLogoUrl}
                alt={team.teamName}
                width={28}
                height={28}
                className="object-contain"
              />
            </div>
          ) : (
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded bg-[var(--primary)] flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-[10px] sm:text-xs">
                {team.teamAbbreviation || team.teamName.substring(0, 2).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <div
              className={`font-bold text-xs sm:text-sm ${hasBg ? 'text-white' : 'text-[var(--foreground-muted)]'} group-hover:text-white transition-colors truncate ${hasGlow ? 'team-name-glow' : ''}`}
              style={glowStyle}
            >
              {team.teamName}
            </div>
            <div className={`text-[10px] sm:text-xs ${hasBg ? 'text-[var(--foreground-muted)]' : 'text-[var(--foreground-subtle)]'} truncate`}>
              {team.coach?.name}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center shrink-0 text-xs sm:text-sm font-mono">
          <span className="font-bold text-[var(--success)] w-6 sm:w-8 text-center">{team.wins}</span>
          <span className="font-bold text-[var(--error)] w-6 sm:w-8 text-center">{team.losses}</span>
          <span className="font-bold text-white w-7 sm:w-10 text-center">
            {team.differential > 0 ? "+" : ""}{team.differential}
          </span>
          <span className="text-[var(--foreground-muted)] w-6 sm:w-8 text-center">{team.gamesPlayed}</span>
        </div>
      </Link>
    </div>
  );
}
