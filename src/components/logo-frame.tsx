import type { CSSProperties, ReactNode } from "react";
import { getLogoFrameStyle } from "@/lib/logo-frame-items";

interface LogoFrameProps {
  slug?: string | null;
  colors?: string[] | null;
  className?: string;
  children: ReactNode;
}

export function LogoFrame({ slug, colors, className = "", children }: LogoFrameProps) {
  if (!slug) {
    return <div className={className}>{children}</div>;
  }

  const frameStyle = getLogoFrameStyle(slug, colors);
  const ringStyle: CSSProperties | undefined =
    "ringStyle" in frameStyle ? frameStyle.ringStyle : undefined;

  return (
    <div
      className={`rounded-xl p-1.5 ${frameStyle.ringClass} ${className}`}
      style={ringStyle}
    >
      <div className={`w-full h-full rounded-lg bg-[var(--background-secondary)] flex items-center justify-center overflow-hidden ${frameStyle.innerClass}`}>
        {children}
      </div>
    </div>
  );
}
