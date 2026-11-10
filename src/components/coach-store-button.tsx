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
        className="shrink-0 whitespace-nowrap p-1 md:p-1.5 rounded-full bg-[var(--accent)]/20 border border-[var(--accent)]/30 text-[var(--accent)] text-[11px] md:text-sm font-semibold hover:bg-[var(--accent)]/30 transition-colors scale-110"
        title="Shop"
        aria-label="Shop"
      >
        Shop
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
