# Wiglett Handoff

Base URL: `https://pokemonbattle.org/`

Auth header for every request:

```http
X-PBO-Webhook-Secret: <shared secret>
```

Current production secret:

```text
4075a2a569fdb5675626788035652486980fed3f6dfc837fba581813f47f2f41
```

`X-Wiglett-Webhook-Secret` also works with the same value.

Dedicated endpoints:

- `POST /api/integrations/wiglett/draft-pick`
- `POST /api/integrations/wiglett/match-result`

Generic endpoint:

- `POST /api/integrations/wiglett/events`

Every payload needs a unique `eventId`. Reusing a successful `eventId` returns the stored result instead of processing again.

## Draft Pick Payload

Minimal name-based example:

```json
{
  "eventId": "wiglett-test-draft-001",
  "divisionName": "Neon",
  "teamName": "Caborca Gengars",
  "pokemonName": "Charizard",
  "isTeraCaptain": false
}
```

Equivalent generic-event version:

```json
{
  "eventId": "wiglett-test-draft-002",
  "eventType": "draft_pick",
  "divisionName": "Neon",
  "teamName": "Caborca Gengars",
  "pokemonName": "Garchomp",
  "isTeraCaptain": false
}
```

Accepted team refs include `teamName`, `teamAbbreviation`, `coachName`, or `seasonCoachId`. Accepted Pokemon refs include `pokemonName` or `pokemonId`; name aliases are normalized for common form differences.

## Match Result Payload

For non-forfeit results, Wiglett must send Pokemon rows. The site validates each Pokemon against that team's PBO roster for the match week. Wiglett K/D is treated as canonical; our replay scrape only fills extra stats/timing/key-event data.

Test payload for fake S11:

```json
{
  "eventId": "wiglett-test-match-001",
  "divisionName": "Neon",
  "week": 1,
  "team1TeamName": "Ottawa Donphans",
  "team2TeamName": "Richmond Ragingbolts",
  "winnerTeamName": "Richmond Ragingbolts",
  "differential": 1,
  "replayUrl": "https://replay.pokemonshowdown.com/gen9draft-2530317293",
  "teams": [
    {
      "teamName": "Ottawa Donphans",
      "pokemonData": [
        { "pokemonName": "Donphan", "kills": 0, "deaths": 1 },
        { "pokemonName": "Moltres-Galar", "kills": 1, "deaths": 1 },
        { "pokemonName": "Ogerpon-Hearthflame", "kills": 2, "deaths": 1 },
        { "pokemonName": "Slither Wing", "kills": 1, "deaths": 1 },
        { "pokemonName": "Sylveon", "kills": 1, "deaths": 1 },
        { "pokemonName": "Terapagos", "kills": 0, "deaths": 1 }
      ]
    },
    {
      "teamName": "Richmond Ragingbolts",
      "pokemonData": [
        { "pokemonName": "Annihilape", "kills": 2, "deaths": 0 },
        { "pokemonName": "Dragonite", "kills": 0, "deaths": 1 },
        { "pokemonName": "Hatterene", "kills": 2, "deaths": 1 },
        { "pokemonName": "Thundurus-Incarnate", "kills": 2, "deaths": 1 },
        { "pokemonName": "Ting-Lu", "kills": 0, "deaths": 1 },
        { "pokemonName": "Volcarona", "kills": 0, "deaths": 1 }
      ]
    }
  ]
}
```

Forfeit example:

```json
{
  "eventId": "wiglett-test-forfeit-001",
  "divisionName": "Neon",
  "week": 1,
  "team1TeamName": "Ottawa Donphans",
  "team2TeamName": "Richmond Ragingbolts",
  "winnerTeamName": "Richmond Ragingbolts",
  "isForfeit": true
}
```

## Fake S11 Test Setup

Production currently has a private current season:

- Season: `[TEST] Season 11`
- `season_number`: `11`
- Public: hidden
- Schedule public: hidden
- Divisions/teams copied from S10

Neon test setup:

- Week 1 match: `Ottawa Donphans` vs `Richmond Ragingbolts`
- Replay to test with: `https://replay.pokemonshowdown.com/gen9draft-2530317293`
- Ottawa and Richmond have copied S10 Week 1 rosters for that replay.
- Rest of Neon have empty rosters, so it is useful for draft-pick testing.

When testing, go admin -> seasons, and click 'Show' to unhide the fake S11, so you can properly check the pages are functioning.

What to check:

- Draft test: Roster gains the drafted Pokemon, budget updates, and the draft board updates.
- Match test: Ottawa vs Richmond Week 1 is marked played, Richmond wins by 1, the replay URL is saved, K/D uses Wiglett's submitted values, and league standings update.
- Replay scrape: extra stats/timing/key events are added from the replay, but they should not overwrite Wiglett K/D.

If doc sync should be tested, set it up from the admin Sheets tab first. The API can trigger sync, but the sheet/division mapping has to exist before Google Sheets changes can happen. Each configured division now has category toggles; for S11/Wiglett testing, keep `Rosters & Transactions` on and turn `Match Results` off.
