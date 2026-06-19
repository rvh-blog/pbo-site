"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

interface ScheduleEditorProps {
  matchId: number;
  scheduledAt: string | null;
  canEdit: boolean;
}

// Mini calendar component
function Calendar({
  selectedDate,
  onSelect,
}: {
  selectedDate: Date | null;
  onSelect: (date: Date) => void;
}) {
  const [viewDate, setViewDate] = useState(() => {
    if (selectedDate) return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const monthName = viewDate.toLocaleString(undefined, { month: "long", year: "numeric" });

  const isSelected = (day: number) =>
    selectedDate &&
    selectedDate.getFullYear() === year &&
    selectedDate.getMonth() === month &&
    selectedDate.getDate() === day;

  const isToday = (day: number) => {
    const now = new Date();
    return now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
  };

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={prevMonth}
          className="p-1 rounded hover:bg-[var(--background-tertiary)] text-[var(--foreground-muted)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-xs font-bold text-white">{monthName}</span>
        <button
          onClick={nextMonth}
          className="p-1 rounded hover:bg-[var(--background-tertiary)] text-[var(--foreground-muted)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-[9px] font-bold text-[var(--foreground-subtle)] py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day, i) => (
          <div key={i} className="aspect-square flex items-center justify-center">
            {day ? (
              <button
                onClick={() => onSelect(new Date(year, month, day))}
                className={`w-full h-full rounded text-[11px] font-bold transition-colors ${
                  isSelected(day)
                    ? "bg-[var(--accent)] text-black"
                    : isToday(day)
                    ? "bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30"
                    : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)]"
                }`}
              >
                {day}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScheduleEditor({ matchId, scheduledAt, canEdit }: ScheduleEditorProps) {
  const [currentSchedule, setCurrentSchedule] = useState<string | null>(scheduledAt);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [hour, setHour] = useState("12");
  const [minute, setMinute] = useState("00");
  const [period, setPeriod] = useState<"AM" | "PM">("PM");
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function formatScheduledTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }

  function openModal() {
    if (currentSchedule) {
      const d = new Date(currentSchedule);
      setSelectedDate(d);
      let h = d.getHours();
      const m = d.getMinutes();
      const p = h >= 12 ? "PM" : "AM";
      if (h === 0) h = 12;
      else if (h > 12) h -= 12;
      setHour(String(h));
      setMinute(String(m).padStart(2, "0"));
      setPeriod(p);
    } else {
      setSelectedDate(null);
      setHour("12");
      setMinute("00");
      setPeriod("PM");
    }
    setIsOpen(true);
  }

  function buildISOFromSelection(): string | null {
    if (!selectedDate) return null;
    let h = parseInt(hour);
    const m = parseInt(minute);
    if (period === "AM" && h === 12) h = 0;
    else if (period === "PM" && h !== 12) h += 12;
    const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), h, m);
    return d.toISOString();
  }

  async function handleSave() {
    const iso = buildISOFromSelection();
    if (!iso) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/matches/${matchId}/schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: iso }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentSchedule(data.scheduledAt);
        setIsOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      const res = await fetch(`/api/matches/${matchId}/schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: null }),
      });
      if (res.ok) {
        setCurrentSchedule(null);
        setIsOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Display */}
      <div className="flex items-center justify-center gap-1 mt-1.5">
        {currentSchedule && mounted ? (
          <p className="text-[10px] sm:text-xs text-[var(--foreground-muted)]">
            {formatScheduledTime(currentSchedule)}
          </p>
        ) : canEdit ? (
          <p className="text-[10px] sm:text-xs text-[var(--foreground-subtle)] italic">
            No time scheduled
          </p>
        ) : null}
        {canEdit && (
          <button
            onClick={openModal}
            className="p-0.5 rounded hover:bg-[var(--background-tertiary)] transition-colors text-[var(--foreground-muted)] hover:text-[var(--accent)]"
            title={currentSchedule ? "Edit scheduled time" : "Set scheduled time"}
          >
            <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        )}
      </div>

      {/* Calendar Modal — portaled to body to avoid container clipping on mobile */}
      {isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[60]">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-[280px] poke-card p-4 pointer-events-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-pixel text-xs text-white">Schedule Match</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-0.5 rounded hover:bg-[var(--background-tertiary)] text-[var(--foreground-muted)] transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Calendar */}
              <Calendar
                selectedDate={selectedDate}
                onSelect={setSelectedDate}
              />

              {/* Time picker */}
              <div className="mt-3 pt-3 border-t border-[var(--background-tertiary)]">
                <label className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase mb-1.5 block">
                  Time
                </label>
                <div className="flex items-center gap-1.5">
                  <select
                    value={hour}
                    onChange={(e) => setHour(e.target.value)}
                    className="px-1.5 py-1 rounded bg-[var(--background-secondary)] border border-[var(--background-tertiary)] text-xs text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="text-[var(--foreground-muted)] font-bold">:</span>
                  <select
                    value={minute}
                    onChange={(e) => setMinute(e.target.value)}
                    className="px-1.5 py-1 rounded bg-[var(--background-secondary)] border border-[var(--background-tertiary)] text-xs text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    {["00", "15", "30", "45"].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <div className="flex rounded overflow-hidden border border-[var(--background-tertiary)]">
                    <button
                      onClick={() => setPeriod("AM")}
                      className={`px-2 py-1 text-[10px] font-bold transition-colors ${
                        period === "AM"
                          ? "bg-[var(--accent)] text-black"
                          : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)]"
                      }`}
                    >
                      AM
                    </button>
                    <button
                      onClick={() => setPeriod("PM")}
                      className={`px-2 py-1 text-[10px] font-bold transition-colors ${
                        period === "PM"
                          ? "bg-[var(--accent)] text-black"
                          : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)]"
                      }`}
                    >
                      PM
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-3 pt-3 border-t border-[var(--background-tertiary)] flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !selectedDate}
                  className="flex-1 px-3 py-1.5 text-[10px] font-bold rounded-lg bg-[var(--accent)] text-black hover:bg-[var(--accent)]/80 transition-colors disabled:opacity-50 uppercase"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                {currentSchedule && (
                  <button
                    onClick={handleClear}
                    disabled={saving}
                    className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-[var(--error)]/20 text-[var(--error)] hover:bg-[var(--error)]/30 transition-colors disabled:opacity-50 uppercase"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
