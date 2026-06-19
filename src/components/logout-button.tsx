"use client";

export function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="px-3 py-1.5 rounded-md text-sm font-medium text-[var(--error)] hover:bg-[var(--card-hover)] transition-colors"
    >
      Logout
    </button>
  );
}
