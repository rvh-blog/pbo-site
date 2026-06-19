import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      {/* Giant 404 with Pokeball styling */}
      <div className="relative mb-8">
        <h1 className="font-pixel text-[80px] sm:text-[120px] text-[var(--primary)] leading-none">
          404
        </h1>
        {/* Pokeball decoration */}
        <div className="absolute -top-4 -right-4 w-12 h-12 sm:w-16 sm:h-16 rounded-full border-4 border-[var(--primary)] bg-[var(--background-secondary)] overflow-hidden opacity-50">
          <div className="absolute bottom-0 w-full h-1/2 bg-white/20 border-t-4 border-[var(--primary)]" />
          <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-[var(--background-secondary)] rounded-full border-4 border-[var(--primary)] -translate-x-1/2 -translate-y-1/2" />
        </div>
      </div>

      {/* Message */}
      <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
        Page Not Found
      </h2>
      <p className="text-[var(--foreground-muted)] max-w-md mb-8">
        Looks like this page used Teleport and escaped! The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Link href="/" className="btn-retro px-6 py-3">
          Go Home
        </Link>
        <Link
          href="/seasons"
          className="btn-retro-dark px-6 py-3"
        >
          View Seasons
        </Link>
      </div>

      {/* Fun pixel art style decoration */}
      <div className="mt-12 flex items-center gap-2 text-[var(--foreground-subtle)]">
        <span className="font-pixel text-xs">WILD MISSINGNO APPEARED</span>
      </div>
    </div>
  );
}
