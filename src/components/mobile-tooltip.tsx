"use client";

import { useState, useRef, useEffect } from "react";

interface MobileTooltipProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  position?: "left" | "right";
  verticalPosition?: "top" | "bottom";
}

export function MobileTooltip({ trigger, children, position = "right", verticalPosition = "bottom" }: MobileTooltipProps) {
  const [isClicked, setIsClicked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside (for mobile tap-to-open behavior)
  useEffect(() => {
    if (!isClicked) return;

    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsClicked(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isClicked]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsClicked(!isClicked);
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-flex group"
    >
      {/* Trigger */}
      <div
        onClick={handleClick}
        tabIndex={0}
        role="button"
        className="cursor-help inline-flex"
      >
        {trigger}
      </div>

      {/* Tooltip - uses CSS hover for instant response, JS click state for mobile */}
      <div
        className={`
          absolute z-[9999] pointer-events-none
          opacity-0 invisible
          group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto
          ${isClicked ? "!opacity-100 !visible !pointer-events-auto" : ""}
          transition-opacity duration-150
          ${verticalPosition === "top" ? "bottom-full mb-2" : "top-full mt-2"}
          ${position === "right" ? "right-0" : "left-0"}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
