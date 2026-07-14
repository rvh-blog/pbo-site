# Broadcast Overlay

Parent index: [[Home|PBO Site Wiki]]

The broadcast tool exposes two visual variants that share the same match data
and battle behavior:

- /broadcast/overlay: V1 fullscreen battle layout.
- /broadcast/overlay2: V2 contained battle layout.

The route wrappers call the shared server component in
src/app/broadcast/overlay-page.tsx. It loads the match, time-synced rosters,
transaction history, Tera Captain assignments, Pokemon aliases, standings, and
match context once for either visual client.

## Shared Battle Behavior

Core behavior is intentionally outside the visual clients:

- src/lib/broadcast-pokemon-matching.ts: roster aliases, battle-state matching,
  and brought/bench classification.
- src/lib/showdown-room.ts: live and replay Showdown room parsing.
- src/lib/showdown-sprites.ts: sprite IDs, special-form overrides, and fallback
  URLs.
- src/lib/season-battle-rules.ts: season-specific battle rules and accepted
  Showdown formats.
- src/app/broadcast/overlay/battle-scene.tsx: shared Showdown renderer with
  contained and fullscreen presentation variants.
- src/hooks/use-showdown-battle.ts: live protocol state, HP, status, forms,
  turns, and playback.

Keep data and identity behavior in these shared modules. V1 and V2 client files
should contain only layout-specific presentation and controls.

## Pokemon Identity And Mega Evolution

The overlay uses canonical names, database aliases/collapses, roster lookup
keys, and Showdown battle forms when connecting a battle Pokemon to a roster
entry.

Mega roster entries also include their base species as a battle lookup key.
Showdown therefore may announce Pinsir during preview and later announce
Pinsir-Mega without creating two overlay entries. The same roster slot keeps its
HP, status, active state, kills, and brought classification throughout the
transition. This generic rule also covers X/Y Megas.

If a Pokemon appears during preview or battle, its matching roster entry belongs
in the brought list and must not remain under Bench.

## Sidebar Presentation Invariants

The sidebars must not infer a battle team from the full draft roster while
Showdown team preview is still loading. Until at least one brought Pokemon is
confirmed, both the six-card area and Bench remain empty. Once confirmed:

- The main card area displays at most six brought Pokemon.
- Bench is rendered only from unbrought roster entries.
- A Pokemon cannot appear simultaneously as a main card and a bench chip.
- The fixed-height sidebar must not be allowed to overflow into Bench.

On fainted cards, the `FAINTED` label and any KO skull count render as one
centered row inside the card, with the skull badge immediately to the right of
the label. The skull number remains that Pokemon's credited KO count; it is not
a death counter.

Competitive forms that are separately draftable must remain distinct. Follow
the Pokemon normalization guidance in [[Change Guide]] before broadening form
collapses.

## Season 11 Format

getSeasonBattleRules(11) currently defines:

- Showdown format: gen9championsnatdexdraft.
- Level 50 battles.
- Stat Points instead of EV presets in the overlay calculator.
- Friendly Mega display names.

The room parser accepts standard live links, replay links, numeric room IDs, and
optional private-room suffixes. Both overlay variants use the same parser.

The shared battle scene loads Showdown's official teambuilder tables before
starting playback. Champions is a Showdown mod, and its ability, move, item,
and species overrides are read from `BattleTeambuilderTable.champions`. Omitting
that data stops the renderer with an `overrideAbilityData` error, leaving the
battlefield empty even though sidebar protocol state continues updating.

## Verification

Run the focused synchronization checks:

    npx tsx scripts/check-overlay-sync.ts

Also run:

    npx tsc --noEmit
    npm run build

When changing either visual client, test both overlay routes with the same match
and battle URL. Confirm roster sides, active/bench membership, HP/status updates,
Mega transitions, sprites, and playback.
