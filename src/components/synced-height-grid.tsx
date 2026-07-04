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
    let frameId: number | null = null;
    const desktopQuery = window.matchMedia("(min-width: 1024px)");

    const updateHeight = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;

        if (!desktopQuery.matches) {
          setMaxHeight(undefined);
          return;
        }

        setMaxHeight(leftRef.current?.offsetHeight);
      });
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);

    desktopQuery.addEventListener("change", updateHeight);

    const resizeObserver = new ResizeObserver(updateHeight);
    if (leftRef.current) {
      resizeObserver.observe(leftRef.current);
    }

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", updateHeight);
      desktopQuery.removeEventListener("change", updateHeight);
      resizeObserver.disconnect();
    };
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
