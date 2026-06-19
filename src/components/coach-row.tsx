"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

interface CoachRowProps {
  href: string;
  hasBg: boolean;
  hasBorder: boolean;
  bgColor?: string;
  borderColor?: string;
  className?: string;
  children: React.ReactNode;
}

export function CoachRow({
  href,
  hasBg,
  hasBorder,
  bgColor,
  borderColor,
  className = "",
  children,
}: CoachRowProps) {
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

  // If no cosmetics, render just the Link without wrapper
  if (!hasBg && !hasBorder) {
    return (
      <Link href={href} className={`trainer-card group ${className}`}>
        {children}
      </Link>
    );
  }

  return (
    <div
      ref={ref}
      className={`rounded-lg ${hasBg ? 'row-background' : ''} ${hasBorder ? 'row-border' : ''}`}
      style={{
        ...(hasBg ? { "--row-bg-color": bgColor, "--mouse-x": "50%", "--mouse-y": "50%" } : {}),
        ...(hasBorder ? { "--row-border-color": borderColor } : {}),
      } as React.CSSProperties}
    >
      <Link href={href} className={`trainer-card group ${className}`}>
        {children}
      </Link>
    </div>
  );
}
