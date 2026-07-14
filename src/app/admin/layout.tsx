import { isAuthenticated } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authenticated = await isAuthenticated();

  if (!authenticated) return <>{children}</>;

  return (
    <AdminShell includeDevTools={process.env.NODE_ENV !== "production"}>
      {children}
    </AdminShell>
  );
}
