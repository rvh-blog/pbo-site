"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const seasonChecklist = [
  {
    title: "League Setup",
    items: [
      "Create the season record and divisions.",
      "Add teams as season coaches using the correct persistent coach account.",
      "Confirm team names, abbreviations, logos, divisions, and replacement links.",
      "Mark the season current only when launch data is ready.",
    ],
  },
  {
    title: "ELO",
    items: [
      "Verify dynamic placement ELO for each division.",
      "Exclude new placements from each division average.",
      "Spot-check average minus 100, rounded to the nearest 25.",
      "Run a full ELO recalculation on a copied database before production recalculation.",
    ],
  },
  {
    title: "Draft And Rosters",
    items: [
      "Import Pokemon prices, bans, tera bans, and tera captain costs.",
      "Create initial rosters using the season's season_coaches IDs.",
      "Check roster limits, remaining budget, and tera captains.",
      "Confirm free agent pools are division-specific.",
    ],
  },
  {
    title: "Schedule And Results",
    items: [
      "Import the schedule with correct season, division, and season coach IDs.",
      "Check week numbers, dates, playoff weeks, and Game of the Week flags.",
      "Test replay parser and match report output on a match from the new season.",
      "Confirm any season-specific match or report rules are configured correctly.",
    ],
  },
  {
    title: "Betting And Pick-Ems",
    items: [
      "Confirm pick-em participants and settings for the season.",
      "Verify winner, kill, and death betting use the correct matches and rosters.",
      "Test one local match result settlement for bets, coins, and pick-em rewards.",
    ],
  },
  {
    title: "Pre-Launch Verification",
    items: [
      "Run TypeScript, targeted ESLint, and production build.",
      "Back up production DB before imports, migrations, or recalculations.",
      "Browse public pages and admin pages after deploy.",
      "Check /api/health, blog, divisions, rosters, schedule, and admin matches.",
    ],
  },
];

export function SeasonSetupChecklist() {
  const [hidden, setHidden] = useState(false);

  function toggleHidden() {
    setHidden((current) => !current);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Season Setup Checklist</CardTitle>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Reusable checklist for launching or making major changes to any season.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={toggleHidden}>
          {hidden ? "Show Checklist" : "Hide Checklist"}
        </Button>
      </CardHeader>
      {!hidden && (
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-2">
            {seasonChecklist.map((section) => (
              <div key={section.title} className="rounded-lg bg-[var(--background-secondary)] p-3">
                <p className="text-sm font-semibold text-white">{section.title}</p>
                <div className="mt-3 space-y-2">
                  {section.items.map((item) => (
                    <label key={item} className="flex items-start gap-2 text-sm text-[var(--foreground-muted)]">
                      <input type="checkbox" className="mt-1 h-4 w-4 rounded border-[var(--background-tertiary)] accent-[var(--primary)]" />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
