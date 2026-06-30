#!/usr/bin/env python3
"""
Parse S9 CSV match stats and insert missing Pokemon data into database.
Handles team replacements and identifies forfeits.
"""

import csv
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path("/Users/rafu/pbo-site/pbo.db")
DATA_DIR = Path("/Users/rafu/pbo-site/data/S9")

# Map division names to CSV files
DIVISION_CSV = {
    "Neon": "Neon S9 - Match Stats.csv",
    "Crystal": "Crystal S9 - Match Stats.csv",
    "Stargazer": "Stargazer S9 - Match Stats.csv",
    "Sunset": "Sunset S9 - Match Stats.csv",
}

# Team name mappings: DB name -> CSV name (for replaced teams)
# The CSV shows the replacement team name for matches involving replaced teams
TEAM_REPLACEMENTS = {
    # Neon S9
    "Kalos Quagsires": "Machampions",
    "Melbourne Metronomes": "BC Litleos",
    "Salt Lake Salandits": "Chicago Chimchars",
    "Hartford Wailords": "Fredericton Froakies",  # Need to verify
    # Add other divisions' replacements as discovered
}

def get_week_col(week):
    """Get starting column for a given week (1-indexed)."""
    return 2 + (week - 1) * 14

def get_csv_team_name(db_team_name):
    """Get the CSV team name, handling replacements."""
    return TEAM_REPLACEMENTS.get(db_team_name, db_team_name)

def find_pokemon_id(cursor, name):
    """Find Pokemon ID by name, handling various forms."""
    if not name or name == "Abra" or name == "Pokemon":
        return None

    original_name = name.strip()

    # Direct match
    cursor.execute("SELECT id FROM pokemon WHERE name = ?", (original_name,))
    row = cursor.fetchone()
    if row:
        return row[0]

    # Handle form variants
    variants = [
        original_name,
        original_name.replace("-Therian", ""),
        original_name + "-Therian",
        original_name.replace("-Rapid-Strike", ""),
        original_name.replace("-Single-Strike", ""),
        original_name.replace("-H", "-Hearthflame"),
        original_name.replace("-T", "-Teal Mask"),
        original_name.replace("-C", "-Cornerstone"),
        original_name.replace("-W", "-Wellspring"),
        original_name.replace("-BM", "-Bloodmoon"),
        "Alolan " + original_name.replace("Alolan ", ""),
        "Galarian " + original_name.replace("Galarian ", ""),
        "Hisuian " + original_name.replace("Hisuian ", ""),
        original_name.replace("Mega ", ""),
        original_name.replace("-Mega", ""),
    ]

    for variant in variants:
        cursor.execute("SELECT id FROM pokemon WHERE name = ?", (variant,))
        row = cursor.fetchone()
        if row:
            return row[0]

    # LIKE match as fallback
    cursor.execute("SELECT id, name FROM pokemon WHERE name LIKE ?", (f"{original_name}%",))
    row = cursor.fetchone()
    if row:
        return row[0]

    return None

def parse_csv_match(rows, week, csv_team1, csv_team2):
    """
    Find and parse a match from CSV data.
    Returns (pokemon_data, is_forfeit) where pokemon_data is list of (csv_team, name, kills, deaths).
    """
    col = get_week_col(week)

    # Search for match in team name rows (identified by T1W marker)
    for i, row in enumerate(rows):
        if col + 8 >= len(row):
            continue

        # Check if this is a team name row
        if row[col + 8].strip() != 'T1W':
            continue

        t1 = row[col].strip()
        t2 = row[col + 4].strip()

        # Check if teams match (either order)
        teams_match = False
        if (t1 == csv_team1 and t2 == csv_team2) or (t1 == csv_team2 and t2 == csv_team1):
            teams_match = True

        if not teams_match:
            continue

        # Found the match - extract Pokemon data
        pokemon_data = []
        is_forfeit = False
        has_real_data = False

        # Pokemon rows are 2-7 rows after team name row
        for j in range(2, 8):
            if i + j >= len(rows):
                break
            prow = rows[i + j]
            if col + 6 >= len(prow):
                continue

            p1_name = prow[col].strip() if col < len(prow) else ''
            p1_kills = prow[col + 1].strip() if col + 1 < len(prow) else ''
            p1_deaths = prow[col + 2].strip() if col + 2 < len(prow) else ''

            p2_deaths = prow[col + 4].strip() if col + 4 < len(prow) else ''
            p2_kills = prow[col + 5].strip() if col + 5 < len(prow) else ''
            p2_name = prow[col + 6].strip() if col + 6 < len(prow) else ''

            # Check for Abra placeholder (forfeit indicator)
            if p1_name == 'Abra' or p2_name == 'Abra':
                is_forfeit = True
                continue

            # Skip empty or header rows
            if not p1_name or p1_name == 'Pokemon':
                continue

            has_real_data = True

            # Add team 1 Pokemon
            if p1_name:
                try:
                    kills = int(p1_kills) if p1_kills else 0
                    deaths = int(p1_deaths) if p1_deaths else 0
                    pokemon_data.append((t1, p1_name, kills, deaths))
                except ValueError:
                    pass

            # Add team 2 Pokemon
            if p2_name:
                try:
                    kills = int(p2_kills) if p2_kills else 0
                    deaths = int(p2_deaths) if p2_deaths else 0
                    pokemon_data.append((t2, p2_name, kills, deaths))
                except ValueError:
                    pass

        # If only Abra placeholders found, it's a forfeit
        if not has_real_data:
            is_forfeit = True

        return pokemon_data, is_forfeit, t1, t2

    return None, None, None, None

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Get S9 missing matches (excluding playoffs - week < 100)
    cursor.execute("""
        SELECT m.id, d.name as division, m.week,
               sc1.team_name as team1, sc2.team_name as team2,
               sc1.id as sc1_id, sc2.id as sc2_id,
               m.is_forfeit
        FROM matches m
        JOIN divisions d ON m.division_id = d.id
        JOIN seasons s ON d.season_id = s.id
        JOIN season_coaches sc1 ON m.coach1_season_id = sc1.id
        JOIN season_coaches sc2 ON m.coach2_season_id = sc2.id
        LEFT JOIN match_pokemon mp ON m.id = mp.match_id
        WHERE s.season_number = 9
          AND m.winner_id IS NOT NULL
          AND d.name NOT LIKE '%Playoff%'
          AND m.week < 100
        GROUP BY m.id
        HAVING COUNT(mp.id) = 0
        ORDER BY d.name, m.week
    """)

    missing_matches = cursor.fetchall()
    print(f"Found {len(missing_matches)} S9 matches missing Pokemon data\n")

    # Group by division
    by_division = {}
    for match in missing_matches:
        div = match[1]
        if div not in by_division:
            by_division[div] = []
        by_division[div].append(match)

    total_inserted = 0
    forfeit_inconsistencies = []

    for division, matches in by_division.items():
        if division not in DIVISION_CSV:
            print(f"No CSV file mapping for division: {division}")
            continue

        csv_path = DATA_DIR / DIVISION_CSV[division]
        if not csv_path.exists():
            print(f"CSV file not found: {csv_path}")
            continue

        print(f"\n{'='*60}")
        print(f"Processing {division} ({len(matches)} matches)")
        print(f"{'='*60}")

        # Read CSV
        with open(csv_path, 'r', encoding='utf-8') as f:
            csv_rows = list(csv.reader(f))

        for match in matches:
            match_id, div, week, team1, team2, sc1_id, sc2_id, db_is_forfeit = match

            # Get CSV team names (handling replacements)
            csv_team1 = get_csv_team_name(team1)
            csv_team2 = get_csv_team_name(team2)

            print(f"\nMatch {match_id}: W{week} {team1} vs {team2}")
            if csv_team1 != team1 or csv_team2 != team2:
                print(f"  (CSV names: {csv_team1} vs {csv_team2})")

            pokemon_data, csv_is_forfeit, found_t1, found_t2 = parse_csv_match(
                csv_rows, week, csv_team1, csv_team2
            )

            if pokemon_data is None:
                print(f"  NOT FOUND in CSV")
                continue

            # Check forfeit consistency
            if csv_is_forfeit != bool(db_is_forfeit):
                forfeit_inconsistencies.append({
                    'match_id': match_id,
                    'week': week,
                    'team1': team1,
                    'team2': team2,
                    'db_forfeit': bool(db_is_forfeit),
                    'csv_forfeit': csv_is_forfeit,
                })
                print(f"  ⚠️  FORFEIT MISMATCH: DB={db_is_forfeit}, CSV={'forfeit' if csv_is_forfeit else 'not forfeit'}")

            if csv_is_forfeit:
                print(f"  CSV shows FORFEIT (Abra placeholders)")
                continue

            if not pokemon_data:
                print(f"  No Pokemon data found")
                continue

            print(f"  Found {len(pokemon_data)} Pokemon entries")

            # Insert Pokemon data
            for csv_team, poke_name, kills, deaths in pokemon_data:
                pokemon_id = find_pokemon_id(cursor, poke_name)
                if not pokemon_id:
                    print(f"    ⚠️  Could not find Pokemon: {poke_name}")
                    continue

                # Determine which season_coach_id this Pokemon belongs to
                # Match CSV team back to DB team
                if csv_team == csv_team1:
                    season_coach_id = sc1_id
                elif csv_team == csv_team2:
                    season_coach_id = sc2_id
                else:
                    print(f"    ⚠️  Could not match CSV team: {csv_team}")
                    continue

                cursor.execute("""
                    INSERT INTO match_pokemon (match_id, season_coach_id, pokemon_id, kills, deaths)
                    VALUES (?, ?, ?, ?, ?)
                """, (match_id, season_coach_id, pokemon_id, kills, deaths))
                total_inserted += 1
                print(f"    ✓ {poke_name} ({kills}K/{deaths}D) for sc_id:{season_coach_id}")

    conn.commit()
    conn.close()

    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"Inserted {total_inserted} Pokemon entries")

    if forfeit_inconsistencies:
        print(f"\n⚠️  FORFEIT INCONSISTENCIES ({len(forfeit_inconsistencies)}):")
        for inc in forfeit_inconsistencies:
            print(f"  Match {inc['match_id']}: W{inc['week']} {inc['team1']} vs {inc['team2']}")
            print(f"    DB: {'forfeit' if inc['db_forfeit'] else 'not forfeit'}, CSV: {'forfeit' if inc['csv_forfeit'] else 'not forfeit'}")

if __name__ == "__main__":
    main()
