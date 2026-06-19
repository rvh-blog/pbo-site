#!/usr/bin/env python3
"""
Import missing Pokemon data from match stats CSVs into the database.
"""
import csv
import sqlite3
import re
import sys
from pathlib import Path

# Database path
DB_PATH = Path(__file__).parent.parent / "data" / "pbo.db"

# Mapping from CSV names to database Pokemon names (displayName or name)
POKEMON_NAME_FIXES = {
    # Handle common variations
    "Ogerpon-W": "Ogerpon-Wellspring",
    "Ogerpon-H": "Ogerpon-Hearthflame",
    "Ogerpon-C": "Ogerpon-Cornerstone",
    "Ursaluna-BM": "Ursaluna-Bloodmoon",
    "Ursaluna-Blood Moon": "Ursaluna-Bloodmoon",
    "Hisuian Samurott": "Samurott-Hisui",
    "Hisuian Goodra": "Goodra-Hisui",
    "Hisuian Arcanine": "Arcanine-Hisui",
    "Hisuian Zoroark": "Zoroark-Hisui",
    "Hisuian Typhlosion": "Typhlosion-Hisui",
    "Hisuian Decidueye": "Decidueye-Hisui",
    "Hisuian Lilligant": "Lilligant-Hisui",
    "Hisuian Braviary": "Braviary-Hisui",
    "Hisuian Electrode": "Electrode-Hisui",
    "Hisuian Voltorb": "Voltorb-Hisui",
    "Hisuian Avalugg": "Avalugg-Hisui",
    "Hisuian Sneasel": "Sneasel-Hisui",
    "Galarian Weezing": "Weezing-Galar",
    "Galarian Slowking": "Slowking-Galar",
    "Galarian Slowbro": "Slowbro-Galar",
    "Galarian Zapdos": "Zapdos-Galar",
    "Galarian Moltres": "Moltres-Galar",
    "Galarian Articuno": "Articuno-Galar",
    "Galarian Rapidash": "Rapidash-Galar",
    "Alolan Ninetales": "Ninetales-Alola",
    "Alolan Marowak": "Marowak-Alola",
    "Alolan Muk": "Muk-Alola",
    "Alolan Raichu": "Raichu-Alola",
    "Alolan Exeggutor": "Exeggutor-Alola",
    "Alolan Sandslash": "Sandslash-Alola",
    "Alolan Persian": "Persian-Alola",
    "Paldean Tauros": "Tauros-Paldea-Combat",
    "Paldean Wooper": "Wooper-Paldea",
    "Rotom-Wash": "Rotom-Wash",
    "Rotom-Heat": "Rotom-Heat",
}

def normalize_pokemon_name(name):
    """Normalize a Pokemon name to match database format."""
    if not name or name.strip() == "":
        return None

    name = name.strip()

    # Skip if it's a header or non-pokemon string
    if name.lower() in ("pokemon", "k", "d", "t1w", "t1l", "t2w", "t2l", "replay", "w", "l"):
        return None

    # Check for exact fixes first
    if name in POKEMON_NAME_FIXES:
        return POKEMON_NAME_FIXES[name]

    return name


def is_forfeit_placeholder(team1_pokemon, team2_pokemon):
    """Check if a match appears to be a forfeit (only Abra placeholder)."""
    all_pokemon = team1_pokemon + team2_pokemon
    if not all_pokemon:
        return True

    # Check if all entries are just "Abra" - the forfeit placeholder
    non_abra = [p for p in all_pokemon if p["name"].lower() != "abra"]
    return len(non_abra) == 0


def parse_match_stats_csv(csv_path):
    """
    Parse a match stats CSV and return a dict of matches by (team1, team2, week).
    Each match has team1_pokemon and team2_pokemon lists with {name, kills, deaths}.
    """
    matches = {}

    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = list(csv.reader(f))

    if len(reader) < 10:
        return matches

    # Week columns are at fixed positions: 2, 16, 30, 44, 58, 72, 86, 100 (14 col stride)
    week_cols = [2, 16, 30, 44, 58, 72, 86, 100]

    for row_idx, row in enumerate(reader):
        # Look for team name rows (they have "T1W,T1L,T2W,T2L" pattern)
        if "T1W" in row and "T2W" in row:
            # This is a team names row - parse each week's matchup
            for week_num, col in enumerate(week_cols, 1):
                if col + 6 < len(row):
                    team1 = row[col].strip() if row[col] else ""
                    team2 = row[col + 4].strip() if row[col + 4] else ""

                    if team1 and team2 and team1 != team2:
                        # Get Pokemon data from next 6 rows (skip header at +1)
                        team1_pokemon = []
                        team2_pokemon = []

                        for poke_offset in range(2, 8):  # rows 2-7 after team row
                            if row_idx + poke_offset < len(reader):
                                poke_row = reader[row_idx + poke_offset]
                                if col + 6 < len(poke_row):
                                    # Team 1: Pokemon at col, K at col+1, D at col+2
                                    p1_name = poke_row[col] if col < len(poke_row) else ""
                                    p1_k = poke_row[col + 1] if col + 1 < len(poke_row) else ""
                                    p1_d = poke_row[col + 2] if col + 2 < len(poke_row) else ""

                                    # Team 2: D at col+4, K at col+5, Pokemon at col+6
                                    p2_d = poke_row[col + 4] if col + 4 < len(poke_row) else ""
                                    p2_k = poke_row[col + 5] if col + 5 < len(poke_row) else ""
                                    p2_name = poke_row[col + 6] if col + 6 < len(poke_row) else ""

                                    p1_name_norm = normalize_pokemon_name(p1_name)
                                    p2_name_norm = normalize_pokemon_name(p2_name)

                                    if p1_name_norm:
                                        try:
                                            kills = int(p1_k) if p1_k and p1_k.isdigit() else 0
                                            deaths = int(p1_d) if p1_d and p1_d.isdigit() else 0
                                            team1_pokemon.append({
                                                "name": p1_name_norm,
                                                "kills": kills,
                                                "deaths": deaths
                                            })
                                        except ValueError:
                                            pass

                                    if p2_name_norm:
                                        try:
                                            kills = int(p2_k) if p2_k and p2_k.isdigit() else 0
                                            deaths = int(p2_d) if p2_d and p2_d.isdigit() else 0
                                            team2_pokemon.append({
                                                "name": p2_name_norm,
                                                "kills": kills,
                                                "deaths": deaths
                                            })
                                        except ValueError:
                                            pass

                        # Skip if this is a forfeit (only Abra placeholders)
                        if is_forfeit_placeholder(team1_pokemon, team2_pokemon):
                            continue

                        if team1_pokemon or team2_pokemon:
                            week_name = f"week {week_num}"
                            key = (team1.lower(), team2.lower(), week_name)
                            matches[key] = {
                                "team1": team1,
                                "team2": team2,
                                "week": week_name,
                                "team1_pokemon": team1_pokemon,
                                "team2_pokemon": team2_pokemon
                            }

    return matches


def get_pokemon_lookup(conn):
    """Get a dict mapping pokemon names to IDs."""
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, display_name FROM pokemon")
    rows = cursor.fetchall()

    lookup = {}
    for row in rows:
        pid, name, display_name = row
        # Add all variations
        lookup[name.lower()] = pid
        if display_name:
            lookup[display_name.lower()] = pid

    return lookup


def find_pokemon_id(name, lookup):
    """Find a Pokemon ID by name, trying various normalizations."""
    if not name:
        return None

    name_lower = name.lower()

    # Direct lookup
    if name_lower in lookup:
        return lookup[name_lower]

    # Try without spaces
    no_spaces = name_lower.replace(" ", "-")
    if no_spaces in lookup:
        return lookup[no_spaces]

    # Try partial match
    for db_name, pid in lookup.items():
        if name_lower in db_name or db_name in name_lower:
            return pid

    return None


def update_match_pokemon(conn, match_id, coach1_id, coach2_id, team1_pokemon, team2_pokemon, pokemon_lookup, dry_run=False):
    """Insert Pokemon data for a match."""
    cursor = conn.cursor()

    # Delete existing match_pokemon for this match (if any partial data exists)
    if not dry_run:
        cursor.execute("DELETE FROM match_pokemon WHERE match_id = ?", (match_id,))

    inserted = 0
    errors = []

    # Insert team 1 Pokemon
    for poke in team1_pokemon:
        pokemon_id = find_pokemon_id(poke["name"], pokemon_lookup)
        if pokemon_id:
            if not dry_run:
                cursor.execute("""
                    INSERT INTO match_pokemon (match_id, season_coach_id, pokemon_id, kills, deaths)
                    VALUES (?, ?, ?, ?, ?)
                """, (match_id, coach1_id, pokemon_id, poke["kills"], poke["deaths"]))
            inserted += 1
        else:
            errors.append(f"Team1: Could not find Pokemon: {poke['name']}")

    # Insert team 2 Pokemon
    for poke in team2_pokemon:
        pokemon_id = find_pokemon_id(poke["name"], pokemon_lookup)
        if pokemon_id:
            if not dry_run:
                cursor.execute("""
                    INSERT INTO match_pokemon (match_id, season_coach_id, pokemon_id, kills, deaths)
                    VALUES (?, ?, ?, ?, ?)
                """, (match_id, coach2_id, pokemon_id, poke["kills"], poke["deaths"]))
            inserted += 1
        else:
            errors.append(f"Team2: Could not find Pokemon: {poke['name']}")

    return inserted, errors


def normalize_team_name(name):
    """Normalize team name for matching."""
    name = name.lower().strip()
    # Remove common suffixes/variations
    name = name.replace("'s", "s")
    name = name.replace("'", "")
    name = name.replace(".", "")
    name = name.replace("-", " ")
    return name

# Team name aliases for replacements and variations
TEAM_ALIASES = {
    # S6 replacements
    "santa cruz swadloons": "syracuse snorlax",  # Santa Cruz replaced Syracuse
    "harbour rockruffs": "adelaide arbolivas",   # Harbour replaced Adelaide
    "sunnyside suicunes": "new york malamars",   # Possible alias
    # S7 variations
    "gelnhausen gengars": "columbus conkeldurrs",  # Merged team
    "uncertain unowns": "uncertain unknowns",    # Typo variation
    "uncertain unknowns": "uncertain unowns",    # Both directions
    "richmond raging bolts": "richmond ragingbolts",
    "richmond ragingbolts": "richmond raging bolts",
    # Other variations
    "clonbrooks kyogres": "clonbrook kyogres",
    "clonbrook kyogres": "clonbrooks kyogres",
    "saudas chimps": "sauda's chimps",
    "sauda's chimps": "saudas chimps",
}


def get_team_variants(name):
    """Get all variants of a team name including aliases."""
    name_norm = normalize_team_name(name)
    variants = {name_norm}

    # Add alias if exists
    if name_norm in TEAM_ALIASES:
        variants.add(normalize_team_name(TEAM_ALIASES[name_norm]))

    # Check if any alias points to this team
    for alias, target in TEAM_ALIASES.items():
        if normalize_team_name(target) == name_norm:
            variants.add(normalize_team_name(alias))

    return variants


def find_match_data(team1, team2, week, csv_matches):
    """Find match data trying both team orderings and aliases."""
    t1_variants = get_team_variants(team1)
    t2_variants = get_team_variants(team2)
    week_lower = week.lower()

    # Try all combinations of team variants
    for t1 in t1_variants:
        for t2 in t2_variants:
            # Try exact match
            key = (t1, t2, week_lower)
            if key in csv_matches:
                return csv_matches[key], False

            # Try swapped
            key = (t2, t1, week_lower)
            if key in csv_matches:
                return csv_matches[key], True

    # Try partial match with all variants
    for csv_key, data in csv_matches.items():
        csv_t1, csv_t2, csv_week = csv_key
        if csv_week == week_lower:
            for t1 in t1_variants:
                for t2 in t2_variants:
                    # Check if team names match (partial)
                    if (t1 in csv_t1 or csv_t1 in t1) and (t2 in csv_t2 or csv_t2 in t2):
                        return data, False
                    if (t2 in csv_t1 or csv_t1 in t2) and (t1 in csv_t2 or csv_t2 in t1):
                        return data, True

    return None, None


def process_season(conn, season_num, missing_matches, data_dir, pokemon_lookup, dry_run=False):
    """Process all missing matches for a season."""
    print(f"\n{'='*60}")
    print(f"Processing Season {season_num}")
    print(f"{'='*60}")

    # Find match stats CSVs for this season
    season_dir = data_dir / f"S{season_num}"
    if not season_dir.exists():
        print(f"  ERROR: Season directory not found: {season_dir}")
        return 0, 0

    csv_files = list(season_dir.glob("*Match Stats*.csv"))
    if not csv_files:
        csv_files = list(season_dir.glob("*Match*.csv"))

    print(f"  Found {len(csv_files)} CSV files")

    # Parse all CSVs for this season
    all_csv_matches = {}
    for csv_file in csv_files:
        division = csv_file.stem.split()[0]  # e.g., "Crystal" from "Crystal S9 - Match Stats.csv"
        print(f"  Parsing: {csv_file.name}")
        matches = parse_match_stats_csv(csv_file)
        print(f"    Found {len(matches)} matchups")
        for key, data in matches.items():
            # Add division info
            data["division"] = division
            all_csv_matches[key] = data

    # Filter missing matches for this season
    season_matches = [m for m in missing_matches if m["season"] == season_num]
    print(f"\n  {len(season_matches)} matches to process")

    cursor = conn.cursor()
    success = 0
    failed = 0

    for match in season_matches:
        match_id = match["match_id"]
        week = match["week"]
        team1 = match["team1"]
        team2 = match["team2"]

        # Get match details from DB to get season_coach IDs
        cursor.execute("""
            SELECT coach1_season_id, coach2_season_id
            FROM matches WHERE id = ?
        """, (match_id,))
        row = cursor.fetchone()
        if not row:
            print(f"  [{match_id}] NOT FOUND in database")
            failed += 1
            continue

        coach1_id, coach2_id = row

        # Find in CSV data
        csv_data, swapped = find_match_data(team1, team2, week, all_csv_matches)

        if not csv_data:
            print(f"  [{match_id}] {week}: {team1} vs {team2} - NO CSV DATA FOUND")
            failed += 1
            continue

        # If teams are swapped in CSV, swap the Pokemon data
        if swapped:
            team1_pokemon = csv_data["team2_pokemon"]
            team2_pokemon = csv_data["team1_pokemon"]
        else:
            team1_pokemon = csv_data["team1_pokemon"]
            team2_pokemon = csv_data["team2_pokemon"]

        if not team1_pokemon and not team2_pokemon:
            print(f"  [{match_id}] {week}: {team1} vs {team2} - EMPTY POKEMON DATA")
            failed += 1
            continue

        # Update database
        inserted, errors = update_match_pokemon(
            conn, match_id, coach1_id, coach2_id,
            team1_pokemon, team2_pokemon,
            pokemon_lookup, dry_run
        )

        if errors:
            for e in errors:
                print(f"    WARNING: {e}")

        prefix = "[DRY RUN] " if dry_run else ""
        print(f"  {prefix}[{match_id}] {week}: {team1} vs {team2} - Inserted {inserted} Pokemon records")
        success += 1

    return success, failed


def main():
    dry_run = "--dry-run" in sys.argv

    if dry_run:
        print("*** DRY RUN MODE - No changes will be made ***\n")

    # Load missing matches
    missing_file = Path(__file__).parent.parent / "missing_pokemon_data.csv"
    missing_matches = []
    with open(missing_file, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            missing_matches.append({
                "match_id": int(row["match_id"]),
                "season": int(row["season"]),
                "division": row["division"],
                "week": row["week"],
                "team1": row["team1"],
                "team2": row["team2"],
            })

    print(f"Loaded {len(missing_matches)} missing matches")

    # Connect to database
    conn = sqlite3.connect(DB_PATH)

    # Get Pokemon lookup
    pokemon_lookup = get_pokemon_lookup(conn)
    print(f"Loaded {len(pokemon_lookup)} Pokemon name mappings")

    data_dir = Path(__file__).parent.parent / "data"

    total_success = 0
    total_failed = 0

    for season in [9, 8, 7, 6, 5]:
        success, failed = process_season(
            conn, season, missing_matches, data_dir, pokemon_lookup, dry_run
        )
        total_success += success
        total_failed += failed

    if not dry_run:
        conn.commit()

    conn.close()

    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"Successfully processed: {total_success}")
    print(f"Failed: {total_failed}")

    if dry_run:
        print("\n*** This was a dry run. Run without --dry-run to make changes. ***")


if __name__ == "__main__":
    main()
