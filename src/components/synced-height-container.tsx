"use client";

import { useEffect, useRef, useState, ReactNode, type CSSProperties } from "react";

interface SyncedHeightContainerProps {
  leftContent: ReactNode;
  rightContent: ReactNode;
  className?: string;
}

export function SyncedHeightContainer({
  leftContent,
  rightContent,
  className = "",
}: SyncedHeightContainerProps) {
  const leftRef = useRef<HTMLDivElement>(null);
  const [leftHeight, setLeftHeight] = useState<number | null>(null);

  useEffect(() => {
    const updateHeight = () => {
      if (leftRef.current) {
        setLeftHeight(leftRef.current.offsetHeight);
      }
    };

    updateHeight();

    // Update on resize
    window.addEventListener("resize", updateHeight);

    // Use ResizeObserver for more accurate updates
    const resizeObserver = new ResizeObserver(updateHeight);
    if (leftRef.current) {
      resizeObserver.observe(leftRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateHeight);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-start ${className}`}>
      <div ref={leftRef}>{leftContent}</div>
      <div
        className="flex min-h-0 flex-col overflow-hidden lg:h-[var(--synced-height)]"
        style={{ "--synced-height": leftHeight ? `${leftHeight}px` : "auto" } as CSSProperties}
      >
        {rightContent}
      </div>
    </div>
  );
}
