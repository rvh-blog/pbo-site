"use client";

import { useState, useEffect } from "react";
import { StoreModal } from "@/components/store-modal";

interface CoachStoreButtonProps {
  coachId: number;
}

export function CoachStoreButton({ coachId }: CoachStoreButtonProps) {
  const [isOwner, setIsOwner] = useState(false);
  const [balance, setBalance] = useState(0);
  const [showStore, setShowStore] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const data = await res.json();
        if (data.user?.type === "coach" && data.user.id === coachId) {
          setIsOwner(true);
          const invRes = await fetch("/api/store/inventory");
          if (invRes.ok) {
            const invData = await invRes.json();
            setBalance(invData.balance ?? 0);
          }
        }
      } catch {}
    }
    checkAuth();
  }, [coachId]);

  if (!isOwner) return null;

  return (
    <>
      <button
        onClick={() => setShowStore(true)}
        className="p-1 md:p-1.5 rounded-full bg-[var(--accent)]/20 border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/30 transition-colors"
        title="PBO Store"
      >
        <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </button>

      <StoreModal
        isOpen={showStore}
        onClose={() => setShowStore(false)}
        balance={balance}
        onBalanceChange={setBalance}
      />
    </>
  );
}
