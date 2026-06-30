"use client";

import { useRef, useEffect, useState, ReactNode } from "react";

interface SyncedHeightGridProps {
  leftContent: ReactNode;
  rightContent: ReactNode;
  mobileMiddleContent?: ReactNode;
}

export function SyncedHeightGrid({ leftContent, rightContent, mobileMiddleContent }: SyncedHeightGridProps) {
  const leftRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const updateHeight = () => {
      if (leftRef.current) {
        setMaxHeight(leftRef.current.offsetHeight);
      }
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  return (
    <div className="grid lg:grid-cols-3 gap-6 items-start">
      {/* Left Column: Battle Log */}
      <div className="lg:col-span-2" ref={leftRef}>
        {leftContent}
      </div>

      {mobileMiddleContent && (
        <div className="lg:hidden">
          {mobileMiddleContent}
        </div>
      )}

      {/* Right Column: Top Trainers */}
      <div
        className="flex flex-col overflow-hidden"
        style={{ maxHeight }}
      >
        {rightContent}
      </div>
    </div>
  );
}
