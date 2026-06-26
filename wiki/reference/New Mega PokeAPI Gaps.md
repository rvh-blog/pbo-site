# New Mega PokeAPI Gaps

Parent index: [[Home|PBO Site Wiki]]

Checked against PokeAPI on 2026-06-26.

## New Mega Forms Missing Champions Move Data

These Mega forms currently have no `champions` move data on their PokeAPI Mega record:

```text
Absol Mega Z
Barbaracle Mega
Baxcalibur Mega
Darkrai Mega
Dragalge Mega
Eelektross Mega
Falinks Mega
Garchomp Mega Z
Golisopod Mega
Heatran Mega
Lucario Mega Z
Magearna Mega
Magearna Original Mega
Malamar Mega
Pyroar Mega
Raichu Mega X
Raichu Mega Y
Scolipede Mega
Scrafty Mega
Staraptor Mega
Tatsugiri Curly Mega
Tatsugiri Droopy Mega
Tatsugiri Stretchy Mega
Zeraora Mega
Zygarde Mega
```

## Non-Mega Species Also Missing Champions Move Data

For new Mega forms that have ability data, these base/non-Mega species also currently have no `champions` move data in PokeAPI:

```text
Barbaracle
Dragalge
Eelektross
Falinks
Floette
Malamar
Pyroar
Scolipede
Scrafty
Staraptor
```

## Import Notes

- Keep Meowstic combined in this project as `Meowstic-mega`.
- Do not insert separate `meowstic-female-mega` and `meowstic-male-mega` rows.
- `meowstic-female-mega` is the current PokeAPI source for the combined local row.
- PokeAPI does not provide league draft prices, tera bans, tera captain costs, or complex ban reasons; those belong in `season_pokemon_prices`.

## Move Fallbacks For Missing Champions Data

When a Mega form has no `champions` move data, use the base/non-Mega form's newest available PokeAPI learnset as an explicit fallback. Preferred order:

```text
champions
legends-za
scarlet-violet
sword-shield
ultra-sun-ultra-moon
sun-moon
```

Current fallback sources:

```text
Barbaracle Mega -> barbaracle, sword-shield, 73 moves
Baxcalibur Mega -> baxcalibur, scarlet-violet, 53 moves
Darkrai Mega -> darkrai, scarlet-violet, 60 moves
Dragalge Mega -> dragalge, scarlet-violet, 53 moves
Eelektross Mega -> eelektross, scarlet-violet, 70 moves
Falinks Mega -> falinks, scarlet-violet, 48 moves
Golisopod Mega -> golisopod, sword-shield, 65 moves
Heatran Mega -> heatran, scarlet-violet, 57 moves
Magearna Mega -> magearna, scarlet-violet, 72 moves
Magearna Original Mega -> magearna, scarlet-violet, 72 moves
Malamar Mega -> malamar, scarlet-violet, 65 moves
Pyroar Mega -> pyroar-male, scarlet-violet, 52 moves
Scolipede Mega -> scolipede, sword-shield, 52 moves
Scrafty Mega -> scrafty, scarlet-violet, 82 moves
Staraptor Mega -> staraptor, scarlet-violet, 40 moves
Tatsugiri Curly Mega -> tatsugiri-curly, scarlet-violet, 36 moves
Tatsugiri Droopy Mega -> tatsugiri-droopy, scarlet-violet, 36 moves
Tatsugiri Stretchy Mega -> tatsugiri-stretchy, scarlet-violet, 36 moves
Zeraora Mega -> zeraora, sword-shield, 68 moves
Zygarde Mega -> zygarde-50, sword-shield, 53 moves
```

These are fallback learnsets, not confirmed Mega-specific Champions learnsets.
