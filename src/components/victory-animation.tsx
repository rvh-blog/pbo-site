"use client";

import { useEffect, useState } from "react";

interface VictoryAnimationProps {
  winnerSide: "left" | "right";
}

interface Particle {
  id: number;
  left: string;
  delay: number;
  duration: number;
  size: number;
  color: string;
}

export function VictoryAnimation({ winnerSide }: VictoryAnimationProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    // Generate particles only on client to avoid hydration mismatch
    const colors = ["#fbbf24", "#22c55e", "#3b82f6", "#f43f5e", "#a855f7", "#f97316"];
    // Center confetti above the team logo: ~12-40% for left winner, ~60-88% for right winner
    const basePosition = winnerSide === "left" ? 12 : 60;
    const spread = 28; // confetti spreads across 28% width, centered on ~26% or ~74%

    const generated = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: `${basePosition + Math.random() * spread}%`,
      delay: Math.random() * 0.5,
      duration: 1.5 + Math.random() * 1.5,
      size: 6 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    setParticles(generated);

    // Stop animation after 3 seconds
    const timer = setTimeout(() => {
      setIsPlaying(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [winnerSide]);

  if (!isPlaying || particles.length === 0) return null;

  return (
    <div className="victory-animation-container" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="victory-confetti"
          style={{
            left: p.left,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
          }}
        />
      ))}
    </div>
  );
}
