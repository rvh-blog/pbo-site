# Broadcast Overlay

Parent index: [[Home|PBO Site Wiki]]

The broadcast tool exposes two visual variants that share the same match data
and battle behavior:

- /broadcast/overlay: V1 fullscreen battle layout.
- /broadcast/overlay2: V2 contained battle layout.
- /broadcast/multi-cast: adaptive 1–4 game broadcast layout.

The route wrappers call the shared server component in
src/app/broadcast/overlay-page.tsx. It loads the match, time-synced rosters,
transaction history, Tera Captain assignments, Pokemon aliases, standings, and
match context once for either visual client.

## Multi-Cast

Select `Multi-Cast` on `/broadcast`, then add between one and four match/Battle
URL pairs. Each game runs the standard fullscreen overlay in its own same-origin
frame, keeping its Showdown connection, renderer state, and playback isolated
from the other live games.

The layout adapts to the number of games:

- One game uses the full frame.
- Two games are centered side by side.
- Three games feature the first game at double width with two games stacked
  beside it.
- Four games use a 2x2 grid.

The first game in the setup list is the featured game in the three-game layout.
Remove and re-add games to change that order. The Multi-Cast frame owns the
fullscreen control; child-overlay fullscreen buttons are suppressed.

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

The brought-card region uses a bounded grid with one row per displayed Pokemon.
Do not use distributed fixed-height flex cards here: with six brought Pokemon,
the sixth row can extend beneath Bench and appear missing even though its battle
identity was matched correctly. Each row and card must retain `min-height: 0`
so all six rows shrink within the reserved region without overlapping Bench.

On fainted cards, the `FAINTED` label and any KO skull count render as one
centered row inside the card, with the skull badge immediately to the right of
the label. The skull number remains that Pokemon's credited KO count; it is not
a death counter.

Competitive forms that are separately draftable must remain distinct. Follow
the Pokemon normalization guidance in [[Change Guide]] before broadening form
collapses.

## Shiny Sidebar Sprites

Both overlay variants preserve Showdown's `shiny` details marker in the shared
battle state. The marker is read during team preview, switches, forced switches,
Illusion reveals, and details changes, and it remains attached during form
changes that do not repeat the full details list.

V1 uses Showdown's animated shiny sidebar art with shiny dex and Gen 5
fallbacks. V2 uses the corresponding shiny Gen 5-style static art. Sprite URL
selection is centralized in `src/lib/showdown-sprites.ts`; do not add
species-specific shiny checks to either visual client. If Showdown has no shiny
art for one of the 48 registered Champions Mega forms, every animated and
static sprite path uses that form's local non-shiny PNG. Ordinary Pokemon with
available shiny art continue to use Showdown's shiny sprite directories.

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

Initial history catch-up and live animation are separate serialized phases.
The renderer seeks through existing history with animations disabled, waits for
Showdown to report both `seeking === null` and `atQueueEnd`, then explicitly
restores animation and playback before accepting live protocol phases. Every
live phase, including the final phase in a socket message, must finish its
animation before the next message is processed. Do not call `play()` while a
seek is still active; that races Showdown's queue and can cause either static or
overlapping sprites.

## Battlefield Sprite Overrides

Missing Showdown battlefield art is handled by a shared, form-specific registry
used by both overlay variants. Mega Dragalge resolves `Dragalge-Mega`,
`Dragalge Mega`, `Mega Dragalge`, and `Mega-Dragalge` to the local form sprite.
Regular Dragalge remains on Showdown's normal sprite until it Mega Evolves.
All 48 newly supported Champions Mega forms use their existing local static
sprites when Showdown has no battlefield art. The registry accepts both
species-first and `Mega ...` form names, including X/Y/Z and alternate-form
suffixes, and recovers failed Showdown sprite URLs. Regular forms remain on
Showdown's normal sprites. The same registry also supplies sidebar art when one
of these custom Megas is marked shiny, because Showdown does not provide
separate shiny assets for them.
Mega Falinks follows the same behavior for `Falinks-Mega`, `Falinks Mega`,
`Mega Falinks`, and `Mega-Falinks`, with regular Falinks left unchanged.

The override wraps `Dex.getSpriteData` and changes only the bitmap URL and
geometry returned to Showdown. It does not replace Showdown's `PokemonSprite`,
so switch, move, damage, faint, and Mega-transition animations retain their
normal lifecycle. Because the current asset set has no distinct back frame, the
correct static Mega form art is used from both perspectives. A frame-scoped
image-error handler provides a controlled base-Dragalge emergency substitute
only if that local Mega asset also fails; it never intercepts move-effect or
unrelated Pokemon images.

## Verification

Run the focused synchronization checks:

    npx tsx scripts/check-overlay-sync.ts

Also run:

    npx tsc --noEmit
    npm run build

When changing either visual client, test both overlay routes with the same match
and battle URL. Confirm roster sides, active/bench membership, HP/status updates,
Mega transitions, sprites, and playback.
