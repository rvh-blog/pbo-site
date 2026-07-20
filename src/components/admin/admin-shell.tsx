"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  Boxes,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Command,
  ExternalLink,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  ShieldCheck,
  Swords,
  Trophy,
  UserCog,
  Users,
  X,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const PokeballIcon = forwardRef<SVGSVGElement, LucideProps>(function PokeballIcon(
  { color = "currentColor", size = 24, strokeWidth = 2, ...props },
  ref,
) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h6" />
      <path d="M15 12h6" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
});

interface AdminNavItem {
  href: string;
  label: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  devOnly?: boolean;
}

interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

const NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", description: "League health and action queue", keywords: ["home", "status", "tasks"], icon: LayoutDashboard },
    ],
  },
  {
    label: "League",
    items: [
      { href: "/admin/seasons", label: "Seasons", description: "Season setup and divisions", keywords: ["week", "division", "setup"], icon: CalendarDays },
      { href: "/admin/coaches", label: "Coaches", description: "Coach accounts and teams", keywords: ["account", "team", "elo"], icon: Users },
      { href: "/admin/rosters", label: "Rosters", description: "Drafted Pokemon and budgets", keywords: ["draft", "team", "budget"], icon: Boxes },
      { href: "/admin/pokemon", label: "Pokemon", description: "Pokemon data, aliases, and forms", keywords: ["alias", "mega", "forms", "price"], icon: PokeballIcon },
    ],
  },
  {
    label: "Battles",
    items: [
      { href: "/admin/matches", label: "Matches", description: "Schedules, results, and playoffs", keywords: ["result", "schedule", "replay", "playoffs"], icon: Swords },
      { href: "/admin/transactions", label: "Transactions", description: "Adds, drops, and trades", keywords: ["add", "drop", "trade", "free agency"], icon: ClipboardList },
      { href: "/admin/battle-records", label: "Battle Records", description: "Record category overrides", keywords: ["records", "override", "stats"], icon: Trophy },
    ],
  },
  {
    label: "Community",
    items: [
      { href: "/admin/pick-ems", label: "Pick'Ems", description: "Picks, GOTW, trivia, and badges", keywords: ["gotw", "trivia", "twitch", "picks"], icon: BookOpenCheck },
      { href: "/admin/engagement", label: "Engagement", description: "Polls and community activity", keywords: ["poll", "activity", "rewards"], icon: Activity },
      { href: "/admin/discord", label: "Discord", description: "Discord integration controls", keywords: ["bot", "roles", "server"], icon: MessageCircle },
      { href: "/admin/users", label: "Users", description: "Claims, roles, and permissions", keywords: ["spectator", "editor", "moderator", "password", "claims"], icon: UserCog },
    ],
  },
  {
    label: "Integrations",
    items: [
      { href: "/admin/sheets", label: "Sheets", description: "Google Sheets configuration and sync", keywords: ["google", "sync", "spreadsheet"], icon: FileSpreadsheet },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/audit-log", label: "Audit Log", description: "Review sensitive administrative changes", keywords: ["history", "changes", "security"], icon: History },
      { href: "/dev/damage-calculator", label: "Dev Damage Calc", description: "Development damage calculator", keywords: ["developer", "calculator", "testing"], icon: BarChart3, devOnly: true },
    ],
  },
];

const QUICK_ACTIONS = [
  { label: "Enter match result", href: "/admin/matches", icon: Swords },
  { label: "Add transaction", href: "/admin/transactions", icon: ClipboardList },
  { label: "Edit rosters", href: "/admin/rosters", icon: Boxes },
  { label: "Sync sheets", href: "/admin/sheets", icon: FileSpreadsheet },
];

function isActiveRoute(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavContent({
  groups,
  pathname,
  collapsed,
  closeMobile,
}: {
  groups: AdminNavGroup[];
  pathname: string;
  collapsed: boolean;
  closeMobile?: () => void;
}) {
  return (
    <nav aria-label="Admin navigation" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.label}>
          {!collapsed && (
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--foreground-subtle)]">
              {group.label}
            </p>
          )}
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = isActiveRoute(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMobile}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex min-h-10 items-center rounded-lg border transition-colors",
                    collapsed ? "justify-center px-2" : "gap-3 px-3",
                    active
                      ? "border-[var(--primary)]/35 bg-[var(--primary)]/12 text-[var(--foreground)]"
                      : "border-transparent text-[var(--foreground-muted)] hover:border-[var(--card-border)] hover:bg-[var(--card-hover)] hover:text-[var(--foreground)]",
                    item.devOnly && !active && "border-amber-400/20 bg-amber-400/5 text-amber-300"
                  )}
                >
                  {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-[var(--primary)]" />}
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {!collapsed && <span className="truncate text-sm font-medium">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({
  children,
  includeDevTools = false,
}: {
  children: React.ReactNode;
  includeDevTools?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const groups = useMemo(
    () => NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => includeDevTools || !item.devOnly),
    })).filter((group) => group.items.length > 0),
    [includeDevTools]
  );
  const allItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const currentItem = allItems.find((item) => isActiveRoute(pathname, item.href));
  const currentGroup = groups.find((group) => group.items.some((item) => item.href === currentItem?.href));

  const commandResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return allItems;
    return allItems.filter((item) =>
      [item.label, item.description, ...item.keywords].join(" ").toLowerCase().includes(needle)
    );
  }, [allItems, query]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("pbo-admin-sidebar-collapsed") === "true");
    } catch {}
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      } else if (event.key === "Escape") {
        setCommandOpen(false);
        setMobileOpen(false);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!commandOpen) return;
    setQuery("");
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [commandOpen]);

  useEffect(() => {
    setMobileOpen(false);
    setCommandOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      try { localStorage.setItem("pbo-admin-sidebar-collapsed", String(next)); } catch {}
      return next;
    });
  }

  function openResult(href: string) {
    setCommandOpen(false);
    router.push(href);
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/admin/login";
    }
  }

  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div className="min-h-[calc(100vh-12rem)]">
      <div className="mb-4 flex items-center justify-between rounded-xl border border-[var(--card-border)] bg-[var(--card)]/90 p-3 shadow-lg backdrop-blur lg:hidden">
        <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-[var(--foreground-muted)] hover:bg-[var(--card-hover)] hover:text-[var(--foreground)]" aria-label="Open admin menu">
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 px-3 text-center">
          <p className="truncate text-sm font-semibold text-[var(--foreground)]">{currentItem?.label || "Admin"}</p>
          <p className="text-[10px] uppercase tracking-widest text-[var(--foreground-subtle)]">PBO Control Center</p>
        </div>
        <button type="button" onClick={() => setCommandOpen(true)} className="rounded-lg p-2 text-[var(--foreground-muted)] hover:bg-[var(--card-hover)] hover:text-[var(--foreground)]" aria-label="Search admin">
          <Search className="h-5 w-5" />
        </button>
      </div>

      <div className={cn("grid items-start gap-6", collapsed ? "lg:grid-cols-[80px_minmax(0,1fr)]" : "lg:grid-cols-[256px_minmax(0,1fr)]")}>
        <aside className={cn("sticky top-4 hidden max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)]/95 shadow-xl backdrop-blur lg:flex", collapsed ? "w-20" : "w-64")}>
          <div className={cn("flex h-16 items-center border-b border-[var(--card-border)]", collapsed ? "justify-center px-2" : "gap-3 px-4")}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--primary-light)] text-white shadow-lg shadow-[var(--primary)]/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[var(--foreground)]">PBO Admin</p>
                <p className="text-[10px] uppercase tracking-widest text-[var(--foreground-subtle)]">Control Center</p>
              </div>
            )}
          </div>

          <div className="px-3 pt-3">
            <button type="button" onClick={() => setCommandOpen(true)} className={cn("flex h-10 w-full items-center rounded-lg border border-[var(--card-border)] bg-[var(--background-secondary)] text-[var(--foreground-muted)] transition-colors hover:border-[var(--primary)]/40 hover:text-[var(--foreground)]", collapsed ? "justify-center" : "gap-2 px-3")} title={collapsed ? "Search admin" : undefined}>
              <Search className="h-4 w-4 shrink-0" />
              {!collapsed && <><span className="flex-1 text-left text-sm">Search admin</span><kbd className="rounded border border-[var(--card-border)] px-1.5 py-0.5 text-[10px]">Ctrl K</kbd></>}
            </button>
          </div>

          <NavContent groups={groups} pathname={pathname} collapsed={collapsed} />

          <div className="border-t border-[var(--card-border)] p-3">
            <Link href="/" className={cn("mb-1 flex h-10 items-center rounded-lg text-[var(--foreground-muted)] hover:bg-[var(--card-hover)] hover:text-[var(--foreground)]", collapsed ? "justify-center" : "gap-3 px-3")} title={collapsed ? "View public site" : undefined}>
              <ExternalLink className="h-4 w-4" />
              {!collapsed && <span className="text-sm font-medium">View site</span>}
            </Link>
            <button type="button" onClick={logout} disabled={loggingOut} className={cn("flex h-10 w-full items-center rounded-lg text-[var(--error)] hover:bg-[var(--error)]/10 disabled:opacity-50", collapsed ? "justify-center" : "gap-3 px-3")} title={collapsed ? "Logout" : undefined}>
              <LogOut className="h-4 w-4" />
              {!collapsed && <span className="text-sm font-medium">{loggingOut ? "Logging out…" : "Logout"}</span>}
            </button>
            <button type="button" onClick={toggleCollapsed} className="mt-2 flex h-8 w-full items-center justify-center rounded-lg border border-[var(--card-border)] text-[var(--foreground-subtle)] hover:bg-[var(--card-hover)] hover:text-[var(--foreground)]" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="mb-5 hidden items-center justify-between gap-4 border-b border-[var(--card-border)] pb-4 lg:flex">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-[var(--foreground-subtle)]">
                <Link href="/admin" className="hover:text-[var(--foreground)]">Admin</Link>
                {currentGroup && currentItem?.href !== "/admin" && <><ChevronRight className="h-3 w-3" /><span>{currentGroup.label}</span></>}
                {currentItem?.href !== "/admin" && <><ChevronRight className="h-3 w-3" /><span className="font-medium text-[var(--foreground-muted)]">{currentItem?.label || "Administration"}</span></>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {QUICK_ACTIONS.slice(0, 2).map((action) => {
                const Icon = action.icon;
                return <Link key={action.href} href={action.href} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--foreground-muted)] hover:border-[var(--primary)]/40 hover:text-[var(--foreground)]"><Icon className="h-3.5 w-3.5" />{action.label}</Link>;
              })}
            </div>
          </header>
          {children}
        </section>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-label="Close admin menu" />
          <aside className="absolute inset-y-0 left-0 flex w-[min(88vw,320px)] flex-col border-r border-[var(--card-border)] bg-[var(--background)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-[var(--card-border)] px-4">
              <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-[var(--primary)]" /><span className="font-bold">PBO Admin</span></div>
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-[var(--foreground-muted)] hover:bg-[var(--card-hover)]" aria-label="Close admin menu"><X className="h-5 w-5" /></button>
            </div>
            <NavContent groups={groups} pathname={pathname} collapsed={false} closeMobile={() => setMobileOpen(false)} />
            <div className="border-t border-[var(--card-border)] p-3">
              <button type="button" onClick={logout} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[var(--error)] hover:bg-[var(--error)]/10"><LogOut className="h-4 w-4" /><span className="text-sm font-medium">Logout</span></button>
            </div>
          </aside>
        </div>
      )}

      {commandOpen && (
        <div className="fixed inset-0 z-[110] flex items-start justify-center bg-black/70 px-4 pt-[10vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Search admin">
          <button type="button" className="absolute inset-0" onClick={() => setCommandOpen(false)} aria-label="Close search" />
          <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--background-secondary)] shadow-2xl">
            <div className="flex items-center gap-3 border-b border-[var(--card-border)] px-4">
              <Command className="h-5 w-5 text-[var(--primary)]" />
              <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && commandResults[0]) openResult(commandResults[0].href); }} placeholder="Search pages and admin tasks…" className="h-14 flex-1 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-subtle)]" />
              <button type="button" onClick={() => setCommandOpen(false)} className="rounded p-1 text-[var(--foreground-subtle)] hover:text-[var(--foreground)]"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {commandResults.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-[var(--foreground-muted)]">No admin destinations match “{query}”.</p>
              ) : commandResults.map((item) => {
                const Icon = item.icon;
                return <button key={item.href} type="button" onClick={() => openResult(item.href)} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-[var(--card-hover)]"><span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card)]"><Icon className="h-4 w-4 text-[var(--primary)]" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[var(--foreground)]">{item.label}</span><span className="block truncate text-xs text-[var(--foreground-muted)]">{item.description}</span></span><ChevronRight className="h-4 w-4 text-[var(--foreground-subtle)]" /></button>;
              })}
            </div>
            <div className="flex items-center justify-between border-t border-[var(--card-border)] px-4 py-2 text-[10px] text-[var(--foreground-subtle)]"><span>Press Enter to open the first result</span><span>Esc to close</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
