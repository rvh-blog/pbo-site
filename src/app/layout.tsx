import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "PBO - Pokemon Battle Organization",
  description: "Elite Pokemon Draft League - Track battles, rankings, and dominate the competition",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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
        <main className="relative z-10 container mx-auto px-6 py-12">{children}</main>

        {/* Retro Footer */}
        <footer className="border-t-4 border-[var(--background-tertiary)] mt-20 bg-[var(--background-secondary)] py-12 text-center">
          <div className="mb-4">
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
            Built by Helsinki Jellicent Klub
          </p>
        </footer>
      </body>
    </html>
  );
}
