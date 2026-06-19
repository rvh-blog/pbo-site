"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface Coach {
  id: number;
  name: string;
}

interface AuthUser {
  type: "coach" | "spectator";
  id: number;
  name: string;
  isMod: boolean;
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
}

type Mode = "signin" | "claim";
type UserType = "coach" | "spectator";

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [userType, setUserType] = useState<UserType>("coach");
  const [availableCoaches, setAvailableCoaches] = useState<Coach[]>([]);
  const [claimedCoaches, setClaimedCoaches] = useState<Coach[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch coaches on mount and when mode changes
  useEffect(() => {
    if (!isOpen) return;

    async function fetchCoaches() {
      try {
        // Fetch both available and claimed coaches in parallel
        const [availableRes, claimedRes] = await Promise.all([
          fetch("/api/auth/available-coaches"),
          fetch("/api/auth/login"),
        ]);

        if (availableRes.ok) {
          const data = await availableRes.json();
          setAvailableCoaches(data.coaches || []);
        }

        if (claimedRes.ok) {
          const data = await claimedRes.json();
          setClaimedCoaches(data.coaches || []);
        }
      } catch (err) {
        console.error("Failed to fetch coaches:", err);
      }
    }

    fetchCoaches();
  }, [isOpen]);

  // Reset form when modal opens/closes or mode changes
  useEffect(() => {
    setSelectedCoachId(null);
    setUsername("");
    setPassword("");
    setError("");
  }, [isOpen, mode, userType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "claim") {
        // Claim account
        const body =
          userType === "coach"
            ? { type: "coach", coachId: selectedCoachId, password }
            : { type: "spectator", username, password };

        const res = await fetch("/api/auth/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to claim account");
          return;
        }

        onSuccess(data.user);
        onClose();
      } else {
        // Sign in
        const body =
          userType === "coach"
            ? { type: "coach", coachId: selectedCoachId, password }
            : { type: "spectator", username, password };

        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to sign in");
          return;
        }

        onSuccess(data.user);
        onClose();
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const coaches = mode === "claim" ? availableCoaches : claimedCoaches;
  const hasCoaches = coaches.length > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-[var(--card)] border border-[var(--card-border)] rounded-xl shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-[var(--card-border)]">
          <h2 className="text-xl font-bold text-center">
            {mode === "signin" ? "Sign In" : "Create Account"}
          </h2>
          <p className="text-sm text-center text-[var(--foreground-muted)] mt-1">
            {mode === "signin"
              ? "Sign in to make your picks"
              : "Claim your account to participate"}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex border-b border-[var(--card-border)]">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              mode === "signin"
                ? "bg-[var(--primary)]/10 text-[var(--primary)] border-b-2 border-[var(--primary)]"
                : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("claim")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              mode === "claim"
                ? "bg-[var(--primary)]/10 text-[var(--primary)] border-b-2 border-[var(--primary)]"
                : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            First Time? Claim Account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* User Type Toggle - Outlined Segmented Control */}
          <div className="flex items-center justify-center">
            <div className="inline-flex rounded-lg border border-[var(--card-border)] overflow-hidden">
              <button
                type="button"
                onClick={() => setUserType("coach")}
                className={`px-5 py-2 text-sm font-medium transition-all ${
                  userType === "coach"
                    ? "bg-[var(--accent)] text-black"
                    : "bg-transparent text-[var(--foreground-muted)] hover:bg-[var(--background-secondary)] hover:text-[var(--foreground)]"
                }`}
              >
                Coach
              </button>
              <button
                type="button"
                onClick={() => setUserType("spectator")}
                className={`px-5 py-2 text-sm font-medium transition-all border-l border-[var(--card-border)] ${
                  userType === "spectator"
                    ? "bg-[var(--accent)] text-black"
                    : "bg-transparent text-[var(--foreground-muted)] hover:bg-[var(--background-secondary)] hover:text-[var(--foreground)]"
                }`}
              >
                Spectator
              </button>
            </div>
          </div>
          {userType === "coach" ? (
            <div>
              <Label htmlFor="coach">
                {mode === "claim" ? "Select Your Coach Account" : "Coach"}
              </Label>
              <SearchableSelect
                options={coaches.map((coach) => ({
                  value: coach.id.toString(),
                  label: coach.name,
                }))}
                value={selectedCoachId?.toString() ?? ""}
                onChange={(value) => setSelectedCoachId(value ? Number(value) : null)}
                placeholder={
                  !hasCoaches
                    ? mode === "claim"
                      ? "No unclaimed coaches available"
                      : "No coaches have signed up yet"
                    : "Search for a coach..."
                }
                emptyOption="Select a coach..."
              />
              {mode === "claim" && !hasCoaches && (
                <p className="text-xs text-[var(--foreground-muted)] mt-1">
                  All coaches have been claimed. Switch to Spectator to create an account.
                </p>
              )}
            </div>
          ) : (
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoComplete="username"
              />
              {mode === "claim" && (
                <p className="text-xs text-[var(--foreground-muted)] mt-1">
                  Choose a unique username (letters, numbers, spaces, and -_)
                </p>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                mode === "claim" ? "Create a password (6+ characters)" : "Enter your password"
              }
              required
              minLength={6}
              autoComplete={mode === "claim" ? "new-password" : "current-password"}
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20">
              <p className="text-sm text-[var(--error)]">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={
              loading ||
              (userType === "coach" && !selectedCoachId) ||
              (userType === "spectator" && !username)
            }
          >
            {loading
              ? "Loading..."
              : mode === "signin"
              ? "Sign In"
              : "Create Account"}
          </Button>
        </form>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-md text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--glass)] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
