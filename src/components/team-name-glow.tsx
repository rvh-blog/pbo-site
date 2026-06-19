import { GLOW_COLORS, type GlowData } from "@/lib/glow-utils";

interface TeamNameGlowProps {
  teamName: string;
  glowData?: GlowData | null;
  className?: string;
}

/**
 * Renders a team name with an optional animated glow effect.
 * Pass glowData from getCoachGlow() or getCoachesGlow() to enable the glow.
 */
export function TeamNameGlow({ teamName, glowData, className = "" }: TeamNameGlowProps) {
  if (!glowData || !glowData.colorData) {
    return <span className={className}>{teamName}</span>;
  }

  const { color } = glowData.colorData;

  return (
    <span
      className={`team-name-glow ${className}`}
      style={{
        "--shimmer-color": color,
      } as React.CSSProperties}
    >
      {teamName}
    </span>
  );
}

/**
 * Inline style generator for use in server components that can't use the component directly.
 * Returns style object to apply to any element displaying a team name.
 */
export function getGlowStyle(glowData?: GlowData | null): React.CSSProperties | undefined {
  if (!glowData || !glowData.colorData) return undefined;

  const { color } = glowData.colorData;

  return {
    "--shimmer-color": color,
  } as React.CSSProperties;
}
