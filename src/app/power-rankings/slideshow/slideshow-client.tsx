"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Slide } from "./slide";
import type { SlideData } from "./page";
import Image from "next/image";

interface Props {
  slides: SlideData[];
  division: {
    name: string;
    logoUrl: string | null;
    color: string;
  };
  season: {
    name: string;
  };
  hostedBy?: string;
}

export function SlideshowClient({ slides, division, season, hostedBy }: Props) {
  // -1 = title slide, 0..N-1 = team slides
  const [currentSlide, setCurrentSlide] = useState(-1);
  const [viewport, setViewport] = useState({ w: 1920, h: 1080 });
  const [transitioning, setTransitioning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hideUI, setHideUI] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derived: scale to fit entirely, center both axes
  const scale = Math.min(viewport.w / 1920, viewport.h / 1080);
  const offsetX = (viewport.w - 1920 * scale) / 2;
  const offsetY = (viewport.h - 1080 * scale) / 2;

  const totalSlides = slides.length;

  const goNext = useCallback(() => {
    if (currentSlide < totalSlides - 1) {
      setTransitioning(true);
      setTimeout(() => {
        setCurrentSlide((prev) => prev + 1);
        setTransitioning(false);
      }, 150);
    }
  }, [currentSlide, totalSlides]);

  const goPrev = useCallback(() => {
    if (currentSlide > -1) {
      setTransitioning(true);
      setTimeout(() => {
        setCurrentSlide((prev) => prev - 1);
        setTransitioning(false);
      }, 150);
    }
  }, [currentSlide]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Track fullscreen state changes
  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        setHideUI((prev) => !prev);
      }
      // Escape is handled natively by the Fullscreen API to exit fullscreen
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev, toggleFullscreen]);

  // Portal mount + hide layout chrome
  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Keep-alive ping to prevent Fly machine from going idle
  useEffect(() => {
    const interval = setInterval(() => {
      fetch("/api/health").catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Viewport scaling — measure container, fill width, center vertically
  useEffect(() => {
    function measure() {
      const el = containerRef.current;
      if (el) {
        setViewport({ w: el.clientWidth, h: el.clientHeight });
      } else {
        setViewport({ w: window.innerWidth, h: window.innerHeight });
      }
    }
    measure();
    // Re-measure on resize and fullscreen change
    window.addEventListener("resize", measure);
    document.addEventListener("fullscreenchange", measure);
    // ResizeObserver for the most accurate container dimensions
    let ro: ResizeObserver | undefined;
    if (containerRef.current) {
      ro = new ResizeObserver(measure);
      ro.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener("resize", measure);
      document.removeEventListener("fullscreenchange", measure);
      ro?.disconnect();
    };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-[#020617] overflow-hidden cursor-pointer select-none"
      onClick={goNext}
    >
      {/* Prerender adjacent slides off-screen to preload images */}
      <div className="absolute w-0 h-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {currentSlide >= 0 && currentSlide < totalSlides - 1 && (
          <div style={{ width: 1920, height: 1080 }}>
            <Slide data={slides[currentSlide + 1]} divisionColor={division.color} />
          </div>
        )}
        {currentSlide > 0 && (
          <div style={{ width: 1920, height: 1080 }}>
            <Slide data={slides[currentSlide - 1]} divisionColor={division.color} />
          </div>
        )}
        {currentSlide === -1 && slides.length > 0 && (
          <div style={{ width: 1920, height: 1080 }}>
            <Slide data={slides[0]} divisionColor={division.color} />
          </div>
        )}
      </div>

      {/* Scaled 1920x1080 container — explicit position, no flex centering */}
      <div
        style={{
          width: 1920,
          height: 1080,
          position: "absolute",
          left: offsetX,
          top: offsetY,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
        }}
        className={`transition-opacity duration-300 ${
          transitioning ? "opacity-0" : "opacity-100"
        }`}
      >
        {currentSlide === -1 ? (
          // Title Slide
          <TitleSlide division={division} season={season} totalTeams={totalSlides} hostedBy={hostedBy} />
        ) : (
          <Slide data={slides[currentSlide]} divisionColor={division.color} />
        )}

        {!hideUI && (
          <>
            {/* Slide counter */}
            <div className="absolute bottom-3 right-6 text-sm font-mono text-[var(--foreground-subtle)]">
              {currentSlide === -1 ? (
                <span>Title</span>
              ) : (
                <span>
                  {currentSlide + 1} / {totalSlides}
                </span>
              )}
            </div>

            {/* Navigation hint on title */}
            {currentSlide === -1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-[var(--foreground-subtle)] animate-pulse">
                Click or press → to start &middot; H to hide UI
              </div>
            )}

            {/* Nav arrows */}
            {currentSlide > -1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white/60 hover:text-white hover:bg-black/60 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            {currentSlide < totalSlides - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white/60 hover:text-white hover:bg-black/60 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </>
        )}

      </div>

      {/* Fullscreen button — outside the scaled container so it's always accessible */}
      {!hideUI && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFullscreen();
          }}
          className="absolute top-4 right-4 w-9 h-9 rounded-lg bg-black/50 flex items-center justify-center text-white/50 hover:text-white hover:bg-black/70 transition-all"
          title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
        >
          {isFullscreen ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v4m0-4h4m7 5l5-5m0 0v4m0-4h-4m-7 7l-5 5m0 0v-4m0 4h4m7-5l5 5m0 0v-4m0 4h-4" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
            </svg>
          )}
        </button>
      )}
    </div>,
    document.body
  );
}

function TitleSlide({
  division,
  season,
  totalTeams,
  hostedBy,
}: {
  division: { name: string; logoUrl: string | null; color: string };
  season: { name: string };
  totalTeams: number;
  hostedBy?: string;
}) {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "#020617", fontFamily: "'Chakra Petch', sans-serif" }}
    >
      {/* Dot pattern background */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(#334155 1.5px, transparent 1.5px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Scanlines */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none z-50"
        style={{
          background: "linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.1))",
          backgroundSize: "100% 4px",
        }}
      />

      {/* Division Color Glow */}
      <div
        className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[80%] h-[60%] rounded-full opacity-20 pointer-events-none mix-blend-screen"
        style={{ background: division.color, filter: "blur(200px)" }}
      />

      {/* Decorative Pokeball Wireframe */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-10 pointer-events-none flex items-center justify-center"
        style={{ border: `2px solid ${division.color}` }}
      >
        <div className="w-[80%] h-[2px]" style={{ backgroundColor: division.color }} />
        <div className="absolute w-[30%] h-[30%] rounded-full" style={{ border: `2px solid ${division.color}` }} />
      </div>

      {/* Accent border top/bottom */}
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: division.color }} />
      <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: division.color }} />

      {/* Main content card */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Card container with poke-card style */}
        <div
          className="relative flex flex-col items-center gap-10 px-24 py-16"
          style={{
            background: "rgba(15, 23, 42, 0.95)",
            border: `4px solid ${division.color}`,
            boxShadow: `8px 8px 0px rgba(0,0,0,0.5), 0 0 80px ${division.color}20`,
          }}
        >
          {/* Corner accents */}
          <div className="absolute -top-1 -left-1 w-3 h-3" style={{ background: division.color }} />
          <div className="absolute -top-1 -right-1 w-3 h-3" style={{ background: division.color }} />
          <div className="absolute -bottom-1 -left-1 w-3 h-3" style={{ background: division.color }} />
          <div className="absolute -bottom-1 -right-1 w-3 h-3" style={{ background: division.color }} />

          {/* Division Logo */}
          {division.logoUrl && (
            <div
              className="w-44 h-44 flex items-center justify-center"
              style={{
                background: "#020617",
                border: `4px solid ${division.color}`,
                borderRadius: "14px",
                boxShadow: "6px 6px 0 rgba(0,0,0,0.3)",
              }}
            >
              <Image
                src={division.logoUrl}
                alt={division.name}
                width={160}
                height={160}
                className="w-36 h-36 object-contain drop-shadow-md"
              />
            </div>
          )}

          {/* Division Name */}
          <h1
            className="font-pixel text-5xl tracking-wide uppercase"
            style={{ color: division.color, textShadow: `3px 3px 0 rgba(0,0,0,0.5), 0 0 40px ${division.color}40` }}
          >
            {division.name}
          </h1>

          {/* Divider */}
          <div className="w-64 h-1" style={{ background: `linear-gradient(90deg, transparent, ${division.color}, transparent)` }} />

          {/* Power Rankings Label */}
          <h2
            className="font-pixel text-3xl text-white tracking-wider"
            style={{ textShadow: `2px 2px 0 ${division.color}` }}
          >
            POWER RANKINGS
          </h2>

          {/* Season + Teams badge */}
          <div
            className="flex items-center gap-4 px-6 py-2"
            style={{ background: "#020617", border: "2px solid #334155" }}
          >
            <span className="font-pixel text-xs text-slate-300">{season.name}</span>
            <span className="text-slate-600">|</span>
            <span className="font-pixel text-xs text-slate-300">{totalTeams} TEAMS</span>
          </div>

          {/* Hosted By */}
          {hostedBy && (
            <div
              className="flex items-center gap-3 px-4 py-1.5 rounded transform rotate-1"
              style={{ backgroundColor: `${division.color}20`, border: `1px solid ${division.color}60` }}
            >
              <span className="font-pixel text-[10px] uppercase text-slate-400">HOSTED BY</span>
              <span className="text-lg text-white font-bold tracking-wide uppercase">{hostedBy}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 flex items-center gap-3 z-10">
        <span className="font-pixel text-xs" style={{ color: division.color }}>PBO</span>
        <span className="text-slate-600">|</span>
        <span className="text-sm text-slate-500 font-bold uppercase tracking-wider">Pokemon Battle Organization</span>
      </div>
    </div>
  );
}
