"use client";

import Link from "next/link";
import React from "react";

interface LiquidMetalRowProps {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  enabled?: boolean; // Only add mouse tracking when enabled
}

export function LiquidMetalRow({ href, className, style, children, enabled = true }: LiquidMetalRowProps) {
  const handleMouseMove = enabled
    ? (e: React.MouseEvent<HTMLAnchorElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        e.currentTarget.style.setProperty("--mouse-x", `${x}%`);
        e.currentTarget.style.setProperty("--mouse-y", `${y}%`);
      }
    : undefined;

  return (
    <Link
      href={href}
      className={className}
      style={style}
      onMouseMove={handleMouseMove}
    >
      {children}
    </Link>
  );
}
