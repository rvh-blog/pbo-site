"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/seasons", label: "Seasons" },
  { href: "/coaches", label: "Coaches" },
  { href: "/leaderboards", label: "Leaderboards" },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 bg-[var(--background-secondary)]/90 backdrop-blur-md border-b-4 border-[var(--background-tertiary)] shadow-xl">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 bg-[var(--primary)] rounded-lg flex items-center justify-center shadow-[4px_4px_0px_var(--primary-dark)] border-2 border-white/20 group-hover:translate-y-1 group-hover:shadow-none transition-all overflow-hidden">
            {/* Pokeball Icon */}
            <div className="w-6 h-6 rounded-full border-2 border-white relative bg-[var(--primary)] overflow-hidden">
              <div className="absolute bottom-0 w-full h-1/2 bg-white border-t-2 border-white" />
              <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-white rounded-full border-2 border-[var(--primary)] -translate-x-1/2 -translate-y-1/2 z-10" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-pixel text-xs text-white group-hover:text-[var(--primary-light)] transition-colors">
              PBO
            </span>
            <span className="text-[10px] font-bold text-[var(--foreground-subtle)] uppercase tracking-widest">
              Draft League
            </span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`font-bold uppercase text-sm tracking-wide transition-all ${
                  isActive
                    ? "text-white underline decoration-[var(--primary)] decoration-2 underline-offset-4"
                    : "text-[var(--foreground-muted)] hover:text-white hover:underline hover:decoration-[var(--primary)] hover:decoration-2 hover:underline-offset-4"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          {/* Admin Button */}
          <Link href="/admin">
            <button className="btn-retro-dark py-2 px-4 text-[9px] flex items-center gap-2">
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Admin
            </button>
          </Link>
        </div>

        {/* Mobile Menu Button (simplified) */}
        <div className="md:hidden flex items-center gap-2">
          <Link href="/admin" className="p-2 text-[var(--foreground-muted)]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </Link>
        </div>
      </div>
    </nav>
  );
}
