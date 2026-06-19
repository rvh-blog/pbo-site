"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthModal } from "@/components/auth-modal";

interface AuthUser {
  type: "coach" | "spectator";
  id: number;
  name: string;
  isMod: boolean;
}

export default function AdminLoginPage() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  // Check if already authenticated
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.user) {
          setAuthUser(data.user);
          if (data.user.isMod) {
            // Already authenticated as mod, redirect to admin
            router.push("/admin");
            router.refresh();
          }
        }
      } catch {
        // Not authenticated
      } finally {
        setChecking(false);
      }
    }
    checkAuth();
  }, [router]);

  const handleAuthSuccess = (user: AuthUser) => {
    setAuthUser(user);
    setShowAuthModal(false);

    if (user.isMod) {
      router.push("/admin");
      router.refresh();
    } else {
      setError("You don't have permission to access the admin area. Only moderators can access this section.");
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore
    }
    setAuthUser(null);
    setError("");
  };

  if (checking) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-[var(--foreground-muted)]">Checking authentication...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
      />

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">
            <span className="text-[var(--primary)]">PBO</span> Admin Login
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {authUser ? (
            // User is logged in but not a mod
            <div className="text-center space-y-4">
              <p className="text-[var(--foreground-muted)]">
                Signed in as <span className="text-[var(--accent)] font-bold">{authUser.name}</span>
              </p>

              {error && (
                <div className="p-3 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20">
                  <p className="text-sm text-[var(--error)]">{error}</p>
                </div>
              )}

              <button
                onClick={handleLogout}
                className="text-sm text-[var(--error)] hover:underline"
              >
                Sign out and try a different account
              </button>
            </div>
          ) : (
            // Not logged in
            <div className="text-center space-y-4">
              <p className="text-[var(--foreground-muted)]">
                Sign in with a moderator account to access the admin area.
              </p>

              <button
                onClick={() => setShowAuthModal(true)}
                className="w-full px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary)]/80 font-medium"
              >
                Sign In
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
