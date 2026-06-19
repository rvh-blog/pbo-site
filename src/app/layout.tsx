import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Navigation } from "@/components/navigation";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "PBO - Pokemon Battle Organization",
    template: "%s | PBO",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
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
      >
        {/* Pokeball dot pattern background */}
        <div className="pokeball-bg" />

        {/* Giant Rotating Pokeball Wireframe Background */}
        <div className="pokeball-wireframe">
          <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1" className="w-full h-full text-slate-400">
            <circle cx="50" cy="50" r="48" />
            <path d="M2 50h96" />
            <circle cx="50" cy="50" r="15" fill="black" fillOpacity="0.1" />
            <circle cx="50" cy="50" r="10" />
          </svg>
        </div>

        <Navigation />
        <main className="relative z-10 container mx-auto px-4 sm:px-6 py-8 sm:py-12">{children}</main>

        {/* Retro Footer */}
        <footer className="relative border-t-4 border-[var(--background-tertiary)] mt-20 bg-[var(--background-secondary)] py-8 sm:py-12">
          <div className="container mx-auto px-4 sm:px-6">
            {/* Mobile: stacked, Desktop: centered with absolute export button */}
            <div className="flex flex-col items-center gap-4 sm:block sm:text-center">
              {/* Center content */}
              <div className="text-center">
                <div className="mb-2">
                  <a
                    href="https://discord.com/channels/964768747690799124"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-pixel text-[10px] text-[var(--foreground-subtle)] animate-pulse hover:text-[var(--primary)] transition-colors"
                  >
                    PRESS START TO JOIN
                  </a>
                </div>
                <p className="text-[var(--foreground-subtle)] text-xs">
                  Built by{" "}
                  <a
                    href="/coaches/9"
                    className="hover:text-[var(--primary)] transition-colors"
                  >
                    Helsinki Jellicent Klub
                  </a>
                </p>
              </div>

              {/* Export Button - below on mobile, absolute right on desktop */}
              <a
                href="/api/export"
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium rounded bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors sm:absolute sm:right-6 sm:top-1/2 sm:-translate-y-1/2"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export Data
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
