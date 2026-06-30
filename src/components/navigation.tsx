"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
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
  { href: "/draft-planner", label: "Draft Planner" },
  { href: "/matchup-prep", label: "Match Prep" },
  { href: "/analyzer", label: "Analyzer" },
  { href: "/pick-ems", label: "Pick-Ems" },
  { href: "/fantasy", label: "Fantasy" },
  { href: "/blog", label: "Blog" },
  { href: "/leaderboards", label: "Leaderboards" },
];

export function Navigation() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [activeDivision, setActiveDivision] = useState<{ seasonId: number; divisionId: number } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProjectMewPrompt, setShowProjectMewPrompt] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [featureSettings, setFeatureSettings] = useState<FeatureSettings>({
    fantasyUiHidden: false,
    blogUiHidden: false,
  });
  const projectMewReleased = isProjectMewReleased();

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
    <nav className="sticky top-0 z-50 bg-[var(--background-secondary)]/90 backdrop-blur-md border-b-4 border-[var(--background-tertiary)] shadow-xl relative">
      <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group" onClick={() => setMobileMenuOpen(false)}>
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
            <span className="text-[10px] font-bold text-[var(--foreground-subtle)] uppercase tracking-widest hidden sm:block">
              Draft League
            </span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6">
          {visibleNavItems.map((item) => {
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

          <Search />

          {/* Persona Button */}
          <div className="relative">
            <button
              onClick={() => setPersonaOpen(!personaOpen)}
              className={`relative p-2 rounded-lg transition-colors ${
                authUser
                  ? "text-[var(--accent)] hover:bg-[var(--accent)]/10"
                  : "text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--background-tertiary)]"
              }`}
              aria-label="Account"
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

                <div className="absolute right-0 top-full mt-2 w-56 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] shadow-xl z-50 overflow-hidden">
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
                          <div className="text-sm font-bold text-white truncate">{authUser.name}</div>
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
        <div className="md:hidden flex items-center gap-2">
          <Search />
          {authUser && (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]/15 text-xs font-bold text-[var(--accent)]">
              {userInitial}
            </span>
          )}
          <button
            className="p-2 text-[var(--foreground-muted)] hover:text-white transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
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
        </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown - absolute to overlay content */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute left-0 right-0 top-full border-t border-[var(--background-tertiary)] bg-[var(--background-secondary)] shadow-xl">
          <div className="container mx-auto px-4 py-4 space-y-1">
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
                      <div className="text-sm font-bold text-white truncate">{authUser.name}</div>
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
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block py-3 px-4 rounded-lg font-bold uppercase text-sm tracking-wide transition-all ${
                    isActive
                      ? "text-white bg-[var(--background-tertiary)]"
                      : "text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--background-tertiary)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

          </div>
        </div>
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
