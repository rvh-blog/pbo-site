# Admin And Engagement

Parent index: [[Home|PBO Site Wiki]]

The admin area contains league operations tools and site-wide engagement controls.

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

## League Poll Admin

Admins can edit the active league poll from the admin home page. Changes are
served to the home page Your League box and all coach profile pages through the
shared poll service.

Current behavior:

- The admin editor controls the question, option list, and active state.
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

## Infinity Release Controls

The Infinity Division has public visibility controls so it can stay hidden until the scheduled reveal or an admin manual release.

Current scheduled reveal:

```text
2026-07-03 17:15:00 America/Los_Angeles
```

Before release, public season/division views filter out the Infinity division. After scheduled or manual release, it becomes visible.

Relevant files:

- `src/lib/public-visibility.ts`
- `src/app/api/admin/infinity-release/route.ts`
- `src/components/admin/infinity-release-card.tsx`
- `src/lib/site-settings.ts`

## Admin Audit Log

High-risk admin actions write to `admin_audit_logs` where supported. The audit table is also ensured at runtime so admin tools do not fail if the migration has not been manually applied yet.

Relevant files:

- `src/app/admin/audit-log/page.tsx`
- `src/lib/admin-audit.ts`
- `migrations/add-admin-audit-logs.sql`

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
