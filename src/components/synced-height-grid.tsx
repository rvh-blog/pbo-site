import type { ReactNode } from "react";

interface SyncedHeightGridProps {
  leftContent: ReactNode;
  rightContent: ReactNode;
  mobileMiddleContent?: ReactNode;
  belowGridContent?: ReactNode;
}

export function SyncedHeightGrid({
  leftContent,
  rightContent,
  mobileMiddleContent,
  belowGridContent,
}: SyncedHeightGridProps) {
  return (
    <>
      <div className="synced-home-grid">
      {/* Left Column: Battle Log */}
      <div>
        {leftContent}
      </div>

      {mobileMiddleContent && (
        <div className="lg:hidden">
          {mobileMiddleContent}
        </div>
      )}

      {/* Right Column */}
      <div className="flex min-h-0 flex-col overflow-hidden">
        {rightContent}
      </div>
    </div>
    {belowGridContent}
    </>
  );
}
