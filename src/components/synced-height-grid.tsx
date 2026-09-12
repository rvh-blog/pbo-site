import type { ReactNode } from "react";

interface SyncedHeightGridProps {
  leftContent: ReactNode;
  rightContent?: ReactNode;
  mobileMiddleContent?: ReactNode;
  fullWidthContent?: ReactNode;
  belowGridContent?: ReactNode;
}

export function SyncedHeightGrid({
  leftContent,
  rightContent,
  mobileMiddleContent,
  fullWidthContent,
  belowGridContent,
}: SyncedHeightGridProps) {
  return (
    <>
      <div className={`synced-home-grid order-5${rightContent ? "" : " single-column"}`}>
        {/* Left Column: Battle Log */}
        <div>{leftContent}</div>

        {mobileMiddleContent && <div className="lg:hidden">{mobileMiddleContent}</div>}

        {/* Right Column */}
        {rightContent ? <div className="flex min-h-0 flex-col overflow-hidden">{rightContent}</div> : null}
      </div>
      {fullWidthContent ? <div className="order-6 w-full">{fullWidthContent}</div> : null}
      {belowGridContent}
    </>
  );
}
