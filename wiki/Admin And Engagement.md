# Admin And Engagement

Parent index: [[Home|PBO Site Wiki]]

The admin area contains league operations tools and site-wide engagement controls.

## Pokemon Admin

Admin -> Pokemon includes season price editing and name normalizer alias
management.

Use Name Normalizer Aliases when an external source may send a Pokemon name in a
new accepted spelling. Aliases are stored in `pokemon_name_aliases` and consumed
through `src/lib/pokemon-name-aliases.ts`, so server-side lookup and
normalization stay centralized.

The same admin surface also shows hardcoded collapses and custom collapses.
Use a custom collapse when an incoming source name should intentionally resolve
to another Pokemon row. The UI displays collapses as `source -> target` so the
direction is explicit.

Do not create new caller-specific alias lists when a Wiglett, sheets, replay, or
admin import name is missing. Add the variation here or update the central
normalizer helpers so every integration benefits from the same rule.

## Engagement Admin

The old Pick-ems admin grouping has been renamed to Engagement where broader site engagement controls live. Pick-ems still exists as a feature and API area, but admin boxes that are not strictly pick-ems should be grouped under Engagement rather than presented as pick-em-specific tools.

Relevant routes:

- `src/app/admin/engagement`
- `src/app/admin/pick-ems`
- `src/app/api/admin/pick-ems`

Feature settings managed through Engagement/admin settings include:

- Betting closed
- Betting UI hidden
- Fantasy UI hidden
- Blog UI hidden

These settings live in `site_settings` and are read through `src/lib/site-settings.ts`.

## Admin Dashboard Visibility Controls

The admin dashboard includes lightweight public-home visibility controls.

Current controls:

- Recent Draft Picks: hides or shows the Recent Draft Picks panel on the public home page.

Recent Draft Picks visibility is stored in `site_settings` as
`recent_draft_picks_hidden`. The home page reads the setting through
`src/lib/site-settings.ts` and skips the recent-picks roster query while the
panel is hidden.

Relevant files:

- `src/app/admin/page.tsx`
- `src/components/admin/homepage-visibility-card.tsx`
- `src/app/page.tsx`
- `src/app/api/admin/pick-ems/route.ts`
- `src/lib/site-settings.ts`

## Season Setup Checklist

The admin dashboard includes a reusable Season Setup Checklist for league setup,
Elo, draft and rosters, schedule and results, engagement, and pre-launch checks.
The wording is season-neutral. Admins can collapse or reveal the checklist with
the Hide Checklist / Show Checklist control.

Relevant files:

- `src/app/admin/page.tsx`
- `src/components/admin/season-setup-checklist.tsx`

## League Poll Admin

Admins can edit the active league poll from the admin home page. Changes are
served to the home page Your League box and all coach profile pages through the
shared poll service.

Current behavior:

- The admin editor controls the question, option list, and active state.
- Admins can start a new poll, which deactivates previous polls and resets voting for the new question.
- Admins can update the current poll for typo fixes or visibility changes.
- Admins can end the active poll, hiding it from the public home page and coach profile pages.
- Coach users can vote once per poll.
- Results are hidden until the current coach has voted.
- Poll visibility can be hidden locally by each viewer; this does not edit the poll.
- Hidden polls leave a compact placeholder with an Unhide control so viewers can restore the poll on the home page or coach profile pages.

Relevant files:

- `src/components/admin/poll-admin-card.tsx`
- `src/components/poll-card.tsx`
- `src/lib/polls.ts`
- `src/app/api/admin/poll/route.ts`
- `src/app/api/poll/route.ts`

## PBO Coin Admin

Admins can grant PBO Coin in larger ranges than before:

- Minimum grant amount: 10
- Maximum grant amount: 500

Match participation rewards were increased so players receive 10 PBO Coin for playing their games.

New coach starting PBO Coin should be 150.

Currency lives on both:

- `coaches.pboCoin`
- `users.pboCoin`

Be careful to update the correct table for the account type involved.

## User Password Reset

Admins can reset a user's password without unclaiming the account first. The reset password flow should operate on the existing claimed user account.

Relevant files:

- `src/app/admin/users/page.tsx`
- `src/app/api/admin/users/[id]/reset-password/route.ts`

## Match Result Admin Controls

On match result pages, admins can hide the Deciding Turns editor controls from all admins for a specific match. The hide state is shared through site settings, so if one admin hides it, other admins see it hidden until an admin unhides it.

This affects the admin editing controls only. The public Deciding Turns display can still render saved content.

Relevant files:

- `src/app/matches/[id]/page.tsx`
- `src/app/api/matches/[id]/deciding-turns/route.ts`
- `src/components/deciding-turns-panel.tsx`
- `src/lib/site-settings.ts`

## Division Logo Uploads

Admins can upload division logos from `Admin -> Seasons` while editing a season. Each division row has Add/Replace/Clear controls.

Uploaded files are saved under `/images/divisions/...` and the returned path is stored on `divisions.logoUrl`.

Relevant files:

- `src/app/admin/seasons/page.tsx`
- `src/app/api/admin/division-logo/route.ts`
- `src/app/api/seasons/route.ts`

## Infinity Release Controls

The Infinity Division has public visibility controls so it can stay hidden until the scheduled reveal or an admin manual release.

Current scheduled reveal:

```text
2026-07-03 17:15:00 America/Los_Angeles
```

Before release, public season/division views filter out the Infinity division. After scheduled or manual release, it becomes visible.

The original admin dashboard release card has been removed now that the
division has been released. The underlying visibility helper and API remain in
place so existing public visibility behavior is not disturbed.

Relevant files:

- `src/lib/public-visibility.ts`
- `src/app/api/admin/infinity-release/route.ts`
- `src/lib/site-settings.ts`

## Admin Audit Log

High-risk admin actions write to `admin_audit_logs` where supported. The audit table is also ensured at runtime so admin tools do not fail if the migration has not been manually applied yet.

Relevant files:

- `src/app/admin/audit-log/page.tsx`
- `src/lib/admin-audit.ts`
- `migrations/add-admin-audit-logs.sql`

## Battle Record Overrides

Admins can correct the displayed PBO Records without editing matches or disabling
the automatic record calculations. The editor is available at
`Admin -> Records` (`/admin/battle-records`).

An override is keyed by Regular Season or Playoffs plus one record category. It
contains one to three ranked display entries, a required correction reason, an
active flag, and timestamps. Entry links are optional and must be an internal
path beginning with `/` or an `https://` URL.

Disabling or deleting an override restores the calculated category immediately.
All writes are recorded in `admin_audit_logs`.

Relevant files:

- `src/app/admin/battle-records/page.tsx`
- `src/app/api/admin/battle-record-overrides/route.ts`
- `src/lib/battle-record-overrides.ts`
- `migrations/add-battle-record-overrides.sql`

## Project Mew

Project Mew has a timed reveal and coach confirmation/prompt flow.

Current release timestamp:

```text
2026-07-04T00:00:00.000Z
```

Relevant files:

- `src/lib/project-mew.ts`
- `src/app/api/coaches/[id]/project-mew/route.ts`
- `src/components/project-mew-confirmation.tsx`
- `src/components/project-mew-prompt-modal.tsx`
