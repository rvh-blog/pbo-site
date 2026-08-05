import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import "./globals.css";
import { Navigation } from "@/components/navigation";
import { PerformanceMonitor } from "@/components/performance-monitor";
import { SITE_URL } from "@/lib/site-url";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PBO - Pokemon Battle Organization",
    template: "%s | PBO",
  },
  description:
    "Follow the Pokémon Battle Organization draft league with live standings, schedules, rosters, match tools, fantasy, and the complete PBO archive.",
  applicationName: "PBO Draft League",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "PBO Draft League",
    title: "PBO - Pokémon Battle Organization",
    description:
      "Live standings, schedules, rosters, match tools, fantasy, and the complete PBO draft league archive.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "PBO - Pokémon Battle Organization",
    description:
      "Live standings, schedules, rosters, match tools, fantasy, and the complete PBO draft league archive.",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            try {
              var savedTheme = localStorage.getItem('pbo-theme');
              var theme = savedTheme === 'light' ? 'light' : 'dark';
              document.documentElement.dataset.theme = theme;
            } catch (_) {}
          `}
        </Script>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-PY549928RV"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-PY549928RV');
          `}
        </Script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
        suppressHydrationWarning
      >
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        {/* Pokeball dot pattern background */}
        <div className="pokeball-bg" />

        {/* Giant Rotating Pokeball Wireframe Background */}
        <div className="pokeball-wireframe">
          <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1" className="w-full h-full text-[var(--foreground-subtle)]">
            <circle cx="50" cy="50" r="48" />
            <path d="M2 50h96" />
            <circle cx="50" cy="50" r="15" fill="black" fillOpacity="0.1" />
            <circle cx="50" cy="50" r="10" />
          </svg>
        </div>

        <Navigation />
        <PerformanceMonitor />
        <main
          id="main-content"
          tabIndex={-1}
          className="relative z-10 container mx-auto px-4 py-6 sm:px-6 sm:py-10 lg:py-12"
        >
          {children}
        </main>

        <footer className="readable-content relative z-10 border-t-4 border-[var(--background-tertiary)] mt-16 bg-[var(--background-secondary)] py-8 sm:mt-20 sm:py-12">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-8">
              <div className="sm:col-span-2 lg:col-span-1">
                <Link href="/" className="inline-flex items-center gap-3 group">
                  <div className="w-10 h-10 bg-[var(--primary)] rounded-lg flex items-center justify-center shadow-[4px_4px_0px_var(--primary-dark)] border-2 border-white/20 overflow-hidden">
                    <div className="w-6 h-6 rounded-full border-2 border-white relative bg-[var(--primary)] overflow-hidden">
                      <div className="absolute bottom-0 w-full h-1/2 bg-white border-t-2 border-white" />
                      <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-white rounded-full border-2 border-[var(--primary)] -translate-x-1/2 -translate-y-1/2 z-10" />
                    </div>
                  </div>
                  <div>
                    <div className="font-pixel text-xs text-[var(--foreground)] group-hover:text-[var(--primary-light)] transition-colors">
                      PBO
                    </div>
                    <div className="text-[10px] font-bold text-[var(--foreground-subtle)] uppercase tracking-widest">
                      Draft League
                    </div>
                  </div>
                </Link>
                <p className="mt-3 max-w-sm text-sm text-[var(--foreground-muted)] sm:mt-4">
                  Pokemon Battle Organization league records, rosters, standings, tools, and season history.
                </p>
                <p className="mt-3 text-xs text-[var(--foreground-subtle)] sm:mt-4">
                  Built by{" "}
                  <Link href="/coaches/9" className="hover:text-[var(--primary)] transition-colors">
                    Helsinki Jellicent Klub
                  </Link>
                </p>
              </div>

              <div>
                <h2 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--foreground)] sm:mb-3">League</h2>
                <div className="space-y-1.5 text-sm sm:space-y-2">
                  <Link href="/seasons" className="block text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">Seasons</Link>
                  <Link href="/coaches" className="block text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">Coaches</Link>
                  <Link href="/leaderboards" className="block text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">PBO Stats</Link>
                  <a
                    href="https://docs.google.com/document/d/1BG35hVyaiSETTEmSNRON6ASE6ctepZf2yXCIxw2MAvM/edit?pli=1&tab=t.0#heading=h.ygaa1qaijmal"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
                  >
                    Rulebook
                  </a>
                </div>
              </div>

              <div>
                <h2 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--foreground)] sm:mb-3">Tools</h2>
                <div className="space-y-1.5 text-sm sm:space-y-2">
                  <Link href="/draft-planner" className="block text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">Free Agency</Link>
                  <Link href="/matchup-prep" className="block text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">Match Prep</Link>
                  <Link href="/analyzer" className="block text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">Replay Analyzer</Link>
                  <a
                    href="/api/export"
                    download
                    className="inline-flex items-center gap-1.5 text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export Data
                  </a>
                </div>
              </div>

              <div>
                <h2 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--foreground)] sm:mb-3">Connect</h2>
                <div className="flex flex-wrap gap-2">
                  <a href="https://www.youtube.com/@Pokemon.Battle.Organization" target="_blank" rel="noopener noreferrer" className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[var(--background)] border border-[var(--background-tertiary)] flex items-center justify-center text-[var(--foreground-muted)] hover:text-[#FF0000] hover:border-[#FF0000]/50 transition-all" title="YouTube" aria-label="YouTube">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
                    </svg>
                  </a>
                  <a href="https://www.twitch.tv/pokemonbattleorg" target="_blank" rel="noopener noreferrer" className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[var(--background)] border border-[var(--background-tertiary)] flex items-center justify-center text-[var(--foreground-muted)] hover:text-[#9146FF] hover:border-[#9146FF]/50 transition-all" title="Twitch" aria-label="Twitch">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                    </svg>
                  </a>
                  <a href="https://www.patreon.com/cw/PBO1" target="_blank" rel="noopener noreferrer" className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[var(--background)] border border-[var(--background-tertiary)] flex items-center justify-center text-[var(--foreground-muted)] hover:text-[#FF424D] hover:border-[#FF424D]/50 transition-all" title="Patreon" aria-label="Patreon">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15.386.524c-4.764 0-8.64 3.876-8.64 8.64 0 4.75 3.876 8.613 8.64 8.613 4.75 0 8.614-3.864 8.614-8.613C24 4.4 20.136.524 15.386.524zM.003 23.537h4.22V.524H.003z" />
                    </svg>
                  </a>
                  <a href="https://discord.com/channels/964768747690799124" target="_blank" rel="noopener noreferrer" className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[var(--background)] border border-[var(--background-tertiary)] flex items-center justify-center text-[var(--foreground-muted)] hover:text-[#5865F2] hover:border-[#5865F2]/50 transition-all" title="Discord" aria-label="Discord">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                    </svg>
                  </a>
                </div>
                <a
                  href="https://discord.com/channels/964768747690799124"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block font-pixel text-[9px] text-[var(--foreground-subtle)] hover:text-[var(--primary)] transition-colors sm:mt-4"
                >
                  PRESS START TO JOIN
                </a>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
