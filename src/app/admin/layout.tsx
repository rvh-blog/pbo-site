import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";

const adminNavItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/coaches", label: "Coaches" },
  { href: "/admin/seasons", label: "Seasons" },
  { href: "/admin/rosters", label: "Rosters" },
  { href: "/admin/transactions", label: "Transactions" },
  { href: "/admin/matches", label: "Matches" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authenticated = await isAuthenticated();

  // Allow access to login page without authentication
  // The login page will handle its own redirect after successful login

  return (
    <div className="space-y-6">
      {authenticated && (
        <nav className="flex items-center gap-2 flex-wrap p-4 rounded-lg bg-[var(--card)] border border-[var(--card-hover)]">
          {adminNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-hover)] transition-colors"
            >
              {item.label}
            </Link>
          ))}
          <div className="flex-1" />
          <LogoutButton />
        </nav>
      )}
      {children}
    </div>
  );
}
