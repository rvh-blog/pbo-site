"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

interface MatchedHeightGridProps {
  leftContent: ReactNode;
  rightContent: ReactNode;
}

export function MatchedHeightGrid({ leftContent, rightContent }: MatchedHeightGridProps) {
  const rightRef = useRef<HTMLDivElement>(null);
  const [matchedHeight, setMatchedHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1280px)");

    const updateHeight = () => {
      if (!mediaQuery.matches || !rightRef.current) {
        setMatchedHeight(undefined);
        return;
      }

      setMatchedHeight(rightRef.current.offsetHeight);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    if (rightRef.current) {
      resizeObserver.observe(rightRef.current);
    }

    window.addEventListener("resize", updateHeight);
    mediaQuery.addEventListener("change", updateHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateHeight);
      mediaQuery.removeEventListener("change", updateHeight);
    };
  }, []);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <div
        className="min-h-0"
        style={matchedHeight ? { height: matchedHeight, maxHeight: matchedHeight } : undefined}
      >
        {leftContent}
      </div>
      <div ref={rightRef} className="min-h-0">
        {rightContent}
      </div>
    </div>
  );
}
