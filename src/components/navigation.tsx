"use client";

import { LeagueLink as Link } from "./league-context";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search } from "./search";
import { AuthModal } from "./auth-modal";
import { ProjectMewPromptModal } from "./project-mew-prompt-modal";
import { isProjectMewReleased } from "@/lib/project-mew";

interface AuthUser {
  type: "coach" | "spectator";
  id: number;
  name: string;
  isMod: boolean;
  projectMewConfirmed?: boolean;
  projectMewPromptSeen?: boolean;
}

interface FeatureSettings {
  fantasyUiHidden: boolean;
  blogUiHidden: boolean;
}

const navItems = [
  { href: "/seasons", label: "Seasons" },
  { href: "/coaches", label: "Coaches" },
  { href: "/matchup-prep", label: "Game Prep" },
  { href: "/pick-ems", label: "Pick-Ems" },
  { href: "/fantasy", label: "Fantasy" },
  { href: "/blog", label: "Blog" },
  { href: "/leaderboards", label: "PBO Stats" },
];

const matchPrepLinks = [
  { href: "/matchup-prep", label: "Matchup Prep" },
  { href: "/draft-planner", label: "Free Agency" },
  { href: "/analyzer", label: "Replay Analyzer" },
];

const pboStatsLinks = [
  { href: "/leaderboards", label: "Rankings & Stats" },
  { href: "/compare", label: "Compare Coaches & Pokémon" },
  { href: "/leaderboards/comprehensive", label: "Detailed Rankings" },
  { href: "/battle-record", label: "Coach & League Records" },
  { href: "/battle-record?tab=move-usage", label: "Move Usage" },
  { href: "/leaderboards/items", label: "Item Usage" },
];

const socialLinks = [
  { href: "https://www.youtube.com/@Pokemon.Battle.Organization", label: "YouTube" },
  { href: "https://www.twitch.tv/pokemonbattleorg", label: "Twitch" },
  { href: "https://www.patreon.com/cw/PBO1", label: "Patreon" },
  { href: "https://discord.com/channels/964768747690799124", label: "Discord" },
] as const;

function SocialIcon({ label }: { label: (typeof socialLinks)[number]["label"] }) {
  if (label === "YouTube") {
    return (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 3.993L9 16z" />
      </svg>
    );
  }

  if (label === "Twitch") {
    return (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
      </svg>
    );
  }

  if (label === "Patreon") {
    return (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15.386.524c-4.764 0-8.64 3.876-8.64 8.64 0 4.75 3.876 8.613 8.64 8.613 4.75 0 8.614-3.864 8.614-8.613C24 4.4 20.136.524 15.386.524zM.003 23.537h4.22V.524H.003z" />
      </svg>
    );
  }

  if (label === "Discord") {
    return (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    );
  }

  return null;
}

function SocialLinks({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "flex flex-wrap gap-2" : "hidden items-center gap-1 border-r border-[var(--background-tertiary)] pr-2 xl:flex"} aria-label="Social links">
      {socialLinks.map((social) => (
        <a
          key={social.label}
          href={social.href}
          target="_blank"
          rel="noopener noreferrer"
          className={compact
            ? "flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] text-[var(--foreground-muted)] transition-colors hover:text-white"
            : "flex h-8 w-8 items-center justify-center rounded-lg text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background-tertiary)] hover:text-white"}
          title={social.label}
          aria-label={social.label}
        >
          <SocialIcon label={social.label} />
        </a>
      ))}
    </div>
  );
}

export function Navigation() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [activeDivision, setActiveDivision] = useState<{ seasonId: number; divisionId: number } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProjectMewPrompt, setShowProjectMewPrompt] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [mobileMatchPrepOpen, setMobileMatchPrepOpen] = useState(false);
  const [mobilePboStatsOpen, setMobilePboStatsOpen] = useState(false);
  const [tabletMatchPrepOpen, setTabletMatchPrepOpen] = useState(false);
  const [tabletPboStatsOpen, setTabletPboStatsOpen] = useState(false);
  const [isLightMode, setIsLightMode] = useState(false);
  const [featureSettings, setFeatureSettings] = useState<FeatureSettings>({
    fantasyUiHidden: false,
    blogUiHidden: false,
  });
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const projectMewReleased = isProjectMewReleased();

  useEffect(() => {
    document.documentElement.classList.add("theme-ready");
    const frame = requestAnimationFrame(() => {
      setIsLightMode(document.documentElement.dataset.theme === "light");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!personaOpen) return;

    function closeAccountMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPersonaOpen(false);
        requestAnimationFrame(() => accountButtonRef.current?.focus());
      }
    }

    document.addEventListener("keydown", closeAccountMenuOnEscape);
    return () => document.removeEventListener("keydown", closeAccountMenuOnEscape);
  }, [personaOpen]);

  function toggleTheme() {
    const nextIsLight = !isLightMode;
    const nextTheme = nextIsLight ? "light" : "dark";
    setIsLightMode(nextIsLight);
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("pbo-theme", nextTheme);
  }

  const themeToggle = (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)]"
      aria-label={isLightMode ? "Switch to dark mode" : "Switch to light mode"}
      title={isLightMode ? "Dark mode" : "Light mode"}
    >
      {isLightMode ? (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.752 15.002A9 9 0 1112.998 2.248 7 7 0 0021.752 15.002z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707m12.728 0-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )}
    </button>
  );

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.user) {
          const user = {
            ...data.user,
            projectMewConfirmed: data.projectMew?.confirmed ?? false,
            projectMewPromptSeen: data.projectMew?.promptSeen ?? true,
          };
          setAuthUser(user);
          setShowProjectMewPrompt(projectMewReleased && user.type === "coach" && !user.projectMewPromptSeen);
        }
        if (data.activeDivision) {
          setActiveDivision(data.activeDivision);
        }
      } catch {
        // Not authenticated
      }
    }
    checkAuth();
  }, [projectMewReleased]);

  useEffect(() => {
    async function fetchFeatureSettings() {
      try {
        const res = await fetch("/api/site-settings");
        if (!res.ok) return;
        const data = await res.json();
        setFeatureSettings({
          fantasyUiHidden: Boolean(data.fantasyUiHidden),
          blogUiHidden: Boolean(data.blogUiHidden),
        });
      } catch {
        // Keep features visible if settings cannot be loaded.
      }
    }

    fetchFeatureSettings();
  }, []);

  const visibleNavItems = navItems.filter((item) => {
    if (item.href === "/fantasy") return !featureSettings.fantasyUiHidden;
    if (item.href === "/blog") return !featureSettings.blogUiHidden;
    return true;
  });
  const matchPrepActive =
    pathname === "/matchup-prep" ||
    pathname.startsWith("/draft-planner") ||
    pathname.startsWith("/analyzer");
  const pboStatsActive = pathname === "/leaderboards" || pathname.startsWith("/leaderboards/") || pathname === "/battle-record" || pathname.startsWith("/battle-record/") || pathname === "/compare" || pathname.startsWith("/compare/");
  const userInitial = authUser?.name.trim().charAt(0).toUpperCase() ?? "";

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthUser(null);
    setActiveDivision(null);
    setShowProjectMewPrompt(false);
    setPersonaOpen(false);
    setMobileMenuOpen(false);
  }

  async function handleAuthSuccess(user: AuthUser) {
    setAuthUser(user);
    setShowAuthModal(false);
    // Fetch active division for the newly logged-in user
    if (user.type === "coach") {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        const hydratedUser = {
          ...user,
          projectMewConfirmed: data.projectMew?.confirmed ?? false,
          projectMewPromptSeen: data.projectMew?.promptSeen ?? true,
        };
        setAuthUser(hydratedUser);
        setShowProjectMewPrompt(projectMewReleased && !hydratedUser.projectMewPromptSeen);
        if (data.activeDivision) {
          setActiveDivision(data.activeDivision);
        }
      } catch {
        // Ignore
      }
    }
  }

  function handleProjectMewPromptComplete(confirmed: boolean) {
    setShowProjectMewPrompt(false);
    setAuthUser((current) =>
      current
        ? {
            ...current,
            projectMewConfirmed: confirmed,
            projectMewPromptSeen: true,
          }
        : current
    );
  }

  return (
    <nav className="readable-content site-navigation sticky top-0 z-50 border-b-4 border-[var(--background-tertiary)] bg-[var(--background-secondary)]/90 shadow-xl backdrop-blur-md">
      <div className="container relative mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="group flex min-w-0 items-center gap-2 sm:gap-3" onClick={() => setMobileMenuOpen(false)}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-white/20 bg-[#dc143c] shadow-[4px_4px_0px_#8b0a1a] transition-all group-hover:translate-y-1 group-hover:shadow-none sm:h-10 sm:w-10">
            {/* Pokeball Icon */}
            <div className="w-6 h-6 rounded-full border-2 border-white relative bg-[#dc143c] overflow-hidden">
              <div className="absolute bottom-0 w-full h-1/2 bg-white border-t-2 border-white" />
              <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-white rounded-full border-2 border-[#dc143c] -translate-x-1/2 -translate-y-1/2 z-10" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-pixel text-xs text-[var(--foreground)] group-hover:text-[var(--primary-light)] transition-colors">
              PBO
            </span>
            <span className="text-[10px] font-bold text-[var(--foreground-subtle)] uppercase tracking-widest hidden sm:block">
              Draft League
            </span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <div className="desktop-primary-navigation absolute left-1/2 -translate-x-1/2 items-center gap-5 xl:gap-6">
          {visibleNavItems.map((item) => {
            const isActive = item.href === "/matchup-prep"
              ? matchPrepActive
              : pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

            if (item.href === "/matchup-prep") {
              return (
                <div key={item.href} className="group relative">
                  <button
                    type="button"
                    aria-haspopup="menu"
                    className={`inline-flex items-center gap-1 font-bold uppercase text-sm tracking-wide transition-all ${
                      isActive
                        ? "text-[var(--foreground)] underline decoration-yellow-300 decoration-2 underline-offset-4"
                        : "text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:underline hover:decoration-yellow-300 hover:decoration-2 hover:underline-offset-4"
                    }`}
                  >
                    {item.label}
                    <svg className="h-3 w-3 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <div className="invisible absolute left-1/2 top-full z-50 w-44 -translate-x-1/2 pt-3 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                    <div className="overflow-hidden rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-1 shadow-xl" role="menu">
                      {matchPrepLinks.map((subItem) => {
                        const subActive = pathname === subItem.href || pathname.startsWith(`${subItem.href}/`);
                        return (
                          <Link
                            key={subItem.href}
                            href={subItem.href}
                            role="menuitem"
                            className={`block rounded px-3 py-2 text-xs font-bold uppercase transition-colors ${
                              subActive
                                ? "bg-[var(--background-tertiary)] text-white"
                                : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"
                            }`}
                          >
                            {subItem.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            }

            if (item.href === "/leaderboards") {
              return (
                <div key={item.href} className="group relative">
                  <button
                    type="button"
                    aria-haspopup="menu"
                    className={`inline-flex items-center gap-1 font-bold uppercase text-sm tracking-wide transition-all ${
                      pboStatsActive
                        ? "text-[var(--foreground)] underline decoration-yellow-300 decoration-2 underline-offset-4"
                        : "text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:underline hover:decoration-yellow-300 hover:decoration-2 hover:underline-offset-4"
                    }`}
                  >
                    {item.label}
                    <svg className="h-3 w-3 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <div className="invisible absolute left-1/2 top-full z-50 w-64 -translate-x-1/2 pt-3 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                    <div className="overflow-hidden rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-1 shadow-xl" role="menu">
                      {pboStatsLinks.map((subItem) => (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          role="menuitem"
                          className={`block rounded px-3 py-2 text-xs font-bold uppercase transition-colors ${
                            pathname === subItem.href || (subItem.href !== "/leaderboards" && pathname.startsWith(`${subItem.href}/`))
                              ? "bg-[var(--background-tertiary)] text-white"
                              : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"
                          }`}
                        >
                          {subItem.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`font-bold uppercase text-sm tracking-wide transition-all ${
                  isActive
                    ? "text-[var(--foreground)] underline decoration-yellow-300 decoration-2 underline-offset-4"
                    : "text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:underline hover:decoration-yellow-300 hover:decoration-2 hover:underline-offset-4"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="desktop-navigation-actions items-center gap-3">
          <SocialLinks />
          <Search />

          {themeToggle}

          {/* Persona Button */}
          <div className="relative">
            <button
              ref={accountButtonRef}
              type="button"
              onClick={() => setPersonaOpen(!personaOpen)}
              className={`relative p-2 rounded-lg transition-colors ${
                authUser
                  ? "text-[var(--accent)] hover:bg-[var(--accent)]/10"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-tertiary)]"
              }`}
              aria-label="Account"
              aria-expanded={personaOpen}
              aria-controls="account-menu"
            >
              {authUser ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)]/20 text-[10px] font-bold text-[var(--accent)]">
                  {userInitial}
                </span>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
              {authUser && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--success)] ring-2 ring-[var(--background-secondary)]" />
              )}
            </button>

            {/* Dropdown */}
            {personaOpen && (
              <>
                {/* Backdrop to close */}
                <div className="fixed inset-0 z-40" onClick={() => setPersonaOpen(false)} />

                <div
                  id="account-menu"
                  role="region"
                  aria-label="Account menu"
                  className="absolute right-0 top-full mt-2 w-56 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] shadow-xl z-50 overflow-hidden"
                >
                  {authUser ? (
                    <div className="p-3 space-y-3">
                      {/* User info */}
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[var(--foreground)] truncate">{authUser.name}</div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase">
                              {authUser.type}
                            </span>
                            {authUser.isMod && (
                              <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)] uppercase">
                                MOD
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Links */}
                      <div className="border-t border-[var(--background-tertiary)] pt-2 space-y-1">
                        {authUser.type === "coach" && (
                          <Link
                            href={`/coaches/${authUser.id}`}
                            onClick={() => setPersonaOpen(false)}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs font-bold text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--background-tertiary)] transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            My Coach Page
                          </Link>
                        )}
                        {activeDivision && (
                          <Link
                            href={`/seasons/${activeDivision.seasonId}/divisions/${activeDivision.divisionId}`}
                            onClick={() => setPersonaOpen(false)}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs font-bold text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--background-tertiary)] transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            My Division
                          </Link>
                        )}
                        {authUser.isMod && (
                          <Link
                            href="/admin"
                            onClick={() => setPersonaOpen(false)}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs font-bold text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--background-tertiary)] transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Admin Dashboard
                          </Link>
                        )}
                        <button
                          onClick={handleLogout}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs font-bold text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          Log Out
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3">
                      <button
                        onClick={() => {
                          setPersonaOpen(false);
                          setShowAuthModal(true);
                        }}
                        className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-bold bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Log In / Sign Up
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

        </div>

        {/* Mobile: Search + Menu Button */}
        <div className="compact-navigation-actions shrink-0 items-center gap-0.5 sm:gap-1">
          <Search />
          {themeToggle}
          {authUser && (
            <span className="hidden h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)]/15 text-xs font-bold text-[var(--accent)] min-[400px]:flex">
              {userInitial}
            </span>
          )}
          <button
            type="button"
            className="flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-controls="mobile-navigation"
            aria-expanded={mobileMenuOpen}
          >
          {mobileMenuOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
          <span className="text-xs font-bold uppercase tracking-wide">Menu</span>
        </button>
        </div>
      </div>

      {/* Tablet navigation keeps primary destinations visible without crowding the header. */}
      <div className="tablet-primary-navigation flex-col border-t border-[var(--background-tertiary)] bg-[var(--background-secondary)]/95">
        <div className="container mx-auto flex gap-1 overflow-x-auto px-4 py-1.5 sm:px-6" aria-label="Primary navigation">
          {visibleNavItems.map((item) => {
            const isActive = item.href === "/matchup-prep"
              ? matchPrepActive
              : item.href === "/leaderboards"
                ? pboStatsActive
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            if (item.href === "/matchup-prep") {
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => {
                    setTabletMatchPrepOpen((open) => !open);
                    setTabletPboStatsOpen(false);
                  }}
                  aria-haspopup="menu"
                  aria-expanded={tabletMatchPrepOpen}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                    isActive
                      ? "bg-[var(--background-tertiary)] text-[var(--foreground)]"
                      : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {item.label}
                  <svg className={`h-3 w-3 transition-transform ${tabletMatchPrepOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              );
            }

            if (item.href === "/leaderboards") {
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => {
                    setTabletPboStatsOpen((open) => !open);
                    setTabletMatchPrepOpen(false);
                  }}
                  aria-haspopup="menu"
                  aria-expanded={tabletPboStatsOpen}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                    isActive
                      ? "bg-[var(--background-tertiary)] text-[var(--foreground)]"
                      : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {item.label}
                  <svg className={`h-3 w-3 transition-transform ${tabletPboStatsOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                  isActive
                    ? "bg-[var(--background-tertiary)] text-[var(--foreground)]"
                    : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        {tabletMatchPrepOpen && (
          <div className="container mx-auto flex gap-1 overflow-x-auto border-t border-[var(--background-tertiary)] px-4 py-1.5 sm:px-6" role="menu" aria-label="Game Prep">
            {matchPrepLinks.map((subItem) => (
              <Link
                key={subItem.href}
                href={subItem.href}
                role="menuitem"
                onClick={() => setTabletMatchPrepOpen(false)}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold uppercase transition-colors ${
                  pathname === subItem.href || pathname.startsWith(`${subItem.href}/`)
                    ? "bg-[var(--background-tertiary)] text-white"
                    : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"
                }`}
              >
                {subItem.label}
              </Link>
            ))}
          </div>
        )}
        {tabletPboStatsOpen && (
          <div className="container mx-auto flex gap-1 overflow-x-auto border-t border-[var(--background-tertiary)] px-4 py-1.5 sm:px-6" role="menu" aria-label="PBO Stats">
            {pboStatsLinks.map((subItem) => (
              <Link
                key={subItem.href}
                href={subItem.href}
                role="menuitem"
                onClick={() => setTabletPboStatsOpen(false)}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold uppercase transition-colors ${
                  pathname === subItem.href || (subItem.href !== "/leaderboards" && pathname.startsWith(`${subItem.href}/`))
                    ? "bg-[var(--background-tertiary)] text-white"
                    : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"
                }`}
              >
                {subItem.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Mobile Menu Dropdown - absolute to overlay content */}
      {mobileMenuOpen && (
        <>
          <button
            type="button"
            className="compact-navigation-only fixed inset-x-0 bottom-0 top-[calc(4rem+env(safe-area-inset-top))] bg-black/40 backdrop-blur-[1px] md:top-[calc(7rem+env(safe-area-inset-top))]"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          />
          <div
            id="mobile-navigation"
            className="compact-navigation-only absolute left-0 right-0 top-full z-10 max-h-[calc(100dvh-4rem-env(safe-area-inset-top))] overflow-y-auto overscroll-contain border-t border-[var(--background-tertiary)] bg-[var(--background-secondary)] shadow-xl md:max-h-[calc(100dvh-7rem-env(safe-area-inset-top))]"
          >
          <div className="container mx-auto space-y-1 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
            {/* Persona Section */}
            <div className="pb-3 mb-2 border-b border-[var(--background-tertiary)]">
              {authUser ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-4">
                    <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[var(--foreground)] truncate">{authUser.name}</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase">
                          {authUser.type}
                        </span>
                        {authUser.isMod && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)] uppercase">
                            MOD
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 px-4">
                    {authUser.type === "coach" && (
                      <Link
                        href={`/coaches/${authUser.id}`}
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white transition-colors"
                      >
                        My Page
                      </Link>
                    )}
                    {activeDivision && (
                      <Link
                        href={`/seasons/${activeDivision.seasonId}/divisions/${activeDivision.divisionId}`}
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white transition-colors"
                      >
                        My Division
                      </Link>
                    )}
                    {authUser.isMod && (
                      <Link
                        href="/admin"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white transition-colors"
                      >
                        Admin
                      </Link>
                    )}
                    <button
                      onClick={handleLogout}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[var(--error)]/10 text-[var(--error)] hover:bg-[var(--error)]/20 transition-colors"
                    >
                      Log Out
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowAuthModal(true);
                  }}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-xs font-bold bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Log In / Sign Up
                </button>
              )}
            </div>

            {visibleNavItems.map((item) => {
              const isActive = item.href === "/matchup-prep"
                ? matchPrepActive
                : pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

              if (item.href === "/matchup-prep") {
                return (
                  <div key={item.href}>
                    <button
                      type="button"
                      onClick={() => setMobileMatchPrepOpen((open) => !open)}
                      aria-haspopup="menu"
                      aria-label="Toggle Game Prep menu"
                      aria-expanded={mobileMatchPrepOpen}
                      className={`flex w-full items-center justify-between rounded-lg px-4 py-3 font-bold uppercase text-sm tracking-wide transition-all ${
                          isActive
                            ? "bg-[var(--background-tertiary)] text-[var(--foreground)]"
                            : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)]"
                        }`}
                    >
                      {item.label}
                      <svg className={`h-4 w-4 transition-transform ${mobileMatchPrepOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {mobileMatchPrepOpen && (
                      <div className="ml-4 space-y-1 border-l-2 border-[var(--background-tertiary)] pl-3">
                        {matchPrepLinks.map((subItem) => (
                          <Link
                            key={subItem.href}
                            href={subItem.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`block rounded-lg px-4 py-2 text-xs font-bold uppercase transition-colors ${
                              pathname === subItem.href || pathname.startsWith(`${subItem.href}/`)
                                ? "bg-[var(--background-tertiary)] text-white"
                                : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"
                            }`}
                          >
                            {subItem.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              if (item.href === "/leaderboards") {
                return (
                  <div key={item.href}>
                    <button
                      type="button"
                      onClick={() => setMobilePboStatsOpen((open) => !open)}
                      aria-haspopup="menu"
                      aria-label="Toggle PBO Stats menu"
                      aria-expanded={mobilePboStatsOpen}
                      className={`flex w-full items-center justify-between rounded-lg px-4 py-3 font-bold uppercase text-sm tracking-wide transition-all ${
                          pboStatsActive
                            ? "bg-[var(--background-tertiary)] text-[var(--foreground)]"
                            : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)]"
                        }`}
                    >
                      {item.label}
                      <svg className={`h-4 w-4 transition-transform ${mobilePboStatsOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {mobilePboStatsOpen && (
                      <div className="ml-4 space-y-1 border-l-2 border-[var(--background-tertiary)] pl-3">
                        {pboStatsLinks.map((subItem) => (
                          <Link
                            key={subItem.href}
                            href={subItem.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`block rounded-lg px-4 py-2 text-xs font-bold uppercase transition-colors ${
                              pathname === subItem.href || pathname.startsWith(`${subItem.href}/`)
                                ? "bg-[var(--background-tertiary)] text-white"
                                : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"
                            }`}
                          >
                            {subItem.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block py-3 px-4 rounded-lg font-bold uppercase text-sm tracking-wide transition-all ${
                    isActive
                      ? "text-[var(--foreground)] bg-[var(--background-tertiary)]"
                      : "text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-tertiary)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            <div className="mt-3 border-t border-[var(--background-tertiary)] px-4 pt-4">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--foreground)]">Connect</div>
              <SocialLinks compact />
            </div>

          </div>
          </div>
        </>
      )}

      {/* Auth Modal - portaled to body so it's not constrained by nav */}
      {showAuthModal && createPortal(
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />,
        document.body
      )}
      {showProjectMewPrompt && authUser?.type === "coach" && createPortal(
        <ProjectMewPromptModal
          coachId={authUser.id}
          initialConfirmed={authUser.projectMewConfirmed ?? false}
          onComplete={handleProjectMewPromptComplete}
        />,
        document.body
      )}
    </nav>
  );
}
