# PBO Site Wiki

This is the root map for the `pbo-site` knowledge base.

Open this note first in Obsidian. The local graph from this note should show the main clusters: architecture, data model, workflows, and runbooks.

## Start Here

- [[Project Overview]]
- [[GitHub Collaboration Runbook]]
- [[Data Model]]
- [[Change Guide]]
- [[Operations]]
- [[Feature Map]]
- [[Fantasy]]
- [[Draft Planner]]
- [[Admin And Engagement]]
- [[Store And Cosmetics]]
- [[Blog]]
- [[Public Tools And Stats]]
- [[Broadcast Overlay]]
- [[Recent Website Updates]]

## GitHub And Fly

For shared development, use [[GitHub Collaboration Runbook]] as the normal human/agent flow:

```text
GitHub branch -> pull request -> merge to main -> deploy merged main to Fly
```

GitHub is the source code and review layer. Fly is the production runtime. The production SQLite database stays on the Fly volume and should not be committed to GitHub.

## Architecture

- [[Project Overview]]
- [[Codebase Layout]]
- [[Feature Map]]
- [[Glossary]]

## Data Model

- [[Data Model]]
- [[Core League Entities]]
- [[Match Entities]]
- [[Roster And Transaction Entities]]
- [[Elo, Betting, And Pick-Em Entities]]
- [[Integration Entities]]

## Workflows

- [[Match Results Workflow]]
- [[Rosters And Transactions Workflow]]
- [[Elo Workflow]]
- [[Replay Analysis Workflow]]
- [[Sheets Sync Workflow]]
- [[Wiglett Workflow]]
- [[Discord Bot Workflow]]
- [[Frontend Pages Workflow]]
- [[Fantasy]]
- [[Draft Planner]]
- [[Admin And Engagement]]
- [[Store And Cosmetics]]
- [[Blog]]
- [[Public Tools And Stats]]
- [[Recent Website Updates]]

## Runbooks

- [[Local Development Runbook]]
- [[GitHub Collaboration Runbook]]
- [[Deploy Runbook]]
- [[Database Runbook]]
- [[Migration Runbook]]
- [[Verification Runbook]]
- [[Production Safety Runbook]]

## Highest-Risk Areas

Read [[Data Model]] and the matching workflow before changing:

- Match result write paths.
- Roster or transaction logic.
- Elo recalculation.
- Betting, kill betting, death betting, or pick-em reward settlement.
- Google Sheets sync.
- Season/division/coach deletes or imports.
- Replay parsing used by match recording.

## Critical Mental Model

- `coaches.id` is the persistent person/account.
- `season_coaches.id` is that person's team in one division/season.

Most league data points to `season_coaches.id`. Elo, auth, profile identity, store purchases, and coins generally point to `coaches.id`.

## Verification Reality

Use:

```bash
npx tsc --noEmit
npx eslint path/to/file.ts path/to/file.tsx
```

`npm run lint` currently reports many pre-existing unrelated lint errors across generated/build/scripts code.
