#!/usr/bin/env python3
"""
Parse S6 CSV match stats (team-centric format) and insert missing Pokemon data.
"""

import csv
import sqlite3
from pathlib import Path

DB_PATH = Path("/Users/rafu/pbo-site/pbo.db")
DATA_DIR = Path("/Users/rafu/pbo-site/data/S6")

DIVISION_CSV = {
    "Neon": "PBO Neon Doc S6  - Match Stats.csv",
    "Stargazer": "PBO Stargazer Doc S6 - Match Stats.csv",
    "Sunset": "PBO Sunset Doc S6 - Match Stats.csv",
}

def get_week_cols(week):
    """Get column indices for a given week's data.
    Returns (pokemon_col, kills_col, deaths_col)
    Week 1: Pokemon at col 5, K at col 9, D at col 11
    Week 2: Pokemon at col 15, K at col 19, D at col 21
    Pattern: +10 per week
    """
    base = (week - 1) * 10
    pokemon_col = 5 + base
    kills_col = 9 + base
    deaths_col = 11 + base
    return pokemon_col, kills_col, deaths_col

def normalize_team_name(name):
    """Normalize team name for matching."""
    return name.lower().replace(".", "").replace("  ", " ").strip()

def find_team_section(rows, team_name):
    """Find the row index where a team's section starts (header row with 'Brought')."""
    normalized_search = normalize_team_name(team_name)

    for i, row in enumerate(rows):
        if len(row) > 5:
            col3 = row[3].strip() if row[3] else ''
            col5 = row[5].strip() if len(row) > 5 and row[5] else ''
            if col5 == 'Brought':
                normalized_csv = normalize_team_name(col3)
                if normalized_search in normalized_csv or normalized_csv in normalized_search:
                    return i
    return None

def extract_team_week_pokemon(rows, team_row, week):
    """Extract Pokemon data for a team in a specific week.
    Returns list of (pokemon_name, kills, deaths)
    """
    pokemon_col, kills_col, deaths_col = get_week_cols(week)
    pokemon_data = []

    # Pokemon data is in rows team_row+1 through team_row+6 (6 pokemon)
    # The result row (team_row+6) also contains the 6th pokemon
    for i in range(1, 7):
        row_idx = team_row + i
        if row_idx >= len(rows):
            break
        row = rows[row_idx]

        if pokemon_col >= len(row):
            continue

        pokemon_name = row[pokemon_col].strip() if pokemon_col < len(row) else ''
        kills_str = row[kills_col].strip() if kills_col < len(row) else ''
        deaths_str = row[deaths_col].strip() if deaths_col < len(row) else ''

        # Skip empty rows or header text
        if not pokemon_name or pokemon_name in ['Brought', '', 'Win', 'Lose']:
            continue

        # Parse kills and deaths
        try:
            kills = int(kills_str) if kills_str and kills_str != '-' else 0
        except ValueError:
            kills = 0
        try:
            deaths = int(deaths_str) if deaths_str and deaths_str != '-' else 0
        except ValueError:
            deaths = 0

        pokemon_data.append((pokemon_name, kills, deaths))

    return pokemon_data

def find_pokemon_id(cursor, name):
    """Find Pokemon ID by name, handling various forms."""
    if not name:
        return None

    original_name = name.strip()

    # Direct match
    cursor.execute("SELECT id FROM pokemon WHERE name = ?", (original_name,))
    row = cursor.fetchone()
    if row:
        return row[0]

    # Try case-insensitive match
    cursor.execute("SELECT id FROM pokemon WHERE LOWER(name) = LOWER(?)", (original_name,))
    row = cursor.fetchone()
    if row:
        return row[0]

    # Convert "Iron Bundle" -> "Iron-bundle", "Scream Tail" -> "Scream-tail"
    hyphenated = original_name.replace(" ", "-").lower()
    cursor.execute("SELECT id FROM pokemon WHERE LOWER(name) = ?", (hyphenated,))
    row = cursor.fetchone()
    if row:
        return row[0]

    # Handle form variants
    variants = [
        original_name,
        original_name.replace("-Alola", ""),
        "Alolan " + original_name.replace("-Alola", ""),
        original_name.replace("-Galar", ""),
        "Galarian " + original_name.replace("-Galar", ""),
        original_name.replace("-Hisui", ""),
        "Hisuian " + original_name.replace("-Hisui", ""),
        original_name.replace("-F", "-Female"),
        original_name.replace("-Therian", ""),
        original_name + "-Therian",
        original_name.replace("Weezing-Galar", "Weezing-galar"),
        original_name.replace("Slowking-Galar", "Slowking-galar"),
        original_name.replace("Sandslash-Alola", "Sandslash-alola"),
        original_name.replace("Ninetales-Alola", "Ninetales-alola"),
        original_name.replace("Dugtrio-Alola", "Dugtrio-alola"),
        original_name.replace("Arcanine-Hisui", "Arcanine-hisui"),
        original_name.replace("Qwilfish-Hisui", "Qwilfish-hisui"),
        original_name.replace("Basculegion-F", "Basculegion-female"),
    ]

    for variant in variants:
        cursor.execute("SELECT id FROM pokemon WHERE LOWER(name) = LOWER(?)", (variant,))
        row = cursor.fetchone()
        if row:
            return row[0]

    # LIKE match as fallback (case-insensitive)
    cursor.execute("SELECT id, name FROM pokemon WHERE LOWER(name) LIKE LOWER(?)", (f"%{original_name}%",))
    row = cursor.fetchone()
    if row:
        return row[0]

    return None

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Get S6 non-forfeit matches missing Pokemon data
    cursor.execute("""
        SELECT m.id, d.name as division, m.week,
               sc1.team_name as team1, sc2.team_name as team2,
               sc1.id as sc1_id, sc2.id as sc2_id
        FROM matches m
        JOIN divisions d ON m.division_id = d.id
        JOIN seasons s ON d.season_id = s.id
        JOIN season_coaches sc1 ON m.coach1_season_id = sc1.id
        JOIN season_coaches sc2 ON m.coach2_season_id = sc2.id
        LEFT JOIN match_pokemon mp ON m.id = mp.match_id
        WHERE s.season_number = 6
          AND m.winner_id IS NOT NULL
          AND d.name NOT LIKE '%Playoff%'
          AND m.week < 100
          AND m.is_forfeit = 0
        GROUP BY m.id
        HAVING COUNT(mp.id) = 0
        ORDER BY d.name, m.week
    """)

    missing_matches = cursor.fetchall()
    print(f"Found {len(missing_matches)} S6 non-forfeit matches missing Pokemon data\n")

    total_inserted = 0
    errors = []

    for match in missing_matches:
        match_id, division, week, team1, team2, sc1_id, sc2_id = match

        print(f"\nMatch {match_id}: W{week} {team1} vs {team2} ({division})")

        if division not in DIVISION_CSV:
            print(f"  No CSV for division: {division}")
            continue

        csv_path = DATA_DIR / DIVISION_CSV[division]
        if not csv_path.exists():
            print(f"  CSV not found: {csv_path}")
            continue

        with open(csv_path, 'r', encoding='utf-8') as f:
            csv_rows = list(csv.reader(f))

        # Find both teams in CSV
        team1_row = find_team_section(csv_rows, team1)
        team2_row = find_team_section(csv_rows, team2)

        if team1_row is None:
            print(f"  Team not found in CSV: {team1}")
            errors.append((match_id, f"Team not found: {team1}"))
            continue
        if team2_row is None:
            print(f"  Team not found in CSV: {team2}")
            errors.append((match_id, f"Team not found: {team2}"))
            continue

        print(f"  Found {team1} at row {team1_row}, {team2} at row {team2_row}")

        # Extract Pokemon data for both teams
        team1_pokemon = extract_team_week_pokemon(csv_rows, team1_row, week)
        team2_pokemon = extract_team_week_pokemon(csv_rows, team2_row, week)

        print(f"  {team1}: {len(team1_pokemon)} Pokemon")
        for poke, k, d in team1_pokemon:
            print(f"    {poke}: {k}K/{d}D")

        print(f"  {team2}: {len(team2_pokemon)} Pokemon")
        for poke, k, d in team2_pokemon:
            print(f"    {poke}: {k}K/{d}D")

        if not team1_pokemon and not team2_pokemon:
            print(f"  No Pokemon data found for this week")
            continue

        # Insert into database
        for poke_name, kills, deaths in team1_pokemon:
            pokemon_id = find_pokemon_id(cursor, poke_name)
            if not pokemon_id:
                print(f"    WARNING: Could not find Pokemon ID for: {poke_name}")
                continue
            cursor.execute("""
                INSERT INTO match_pokemon (match_id, season_coach_id, pokemon_id, kills, deaths)
                VALUES (?, ?, ?, ?, ?)
            """, (match_id, sc1_id, pokemon_id, kills, deaths))
            total_inserted += 1

        for poke_name, kills, deaths in team2_pokemon:
            pokemon_id = find_pokemon_id(cursor, poke_name)
            if not pokemon_id:
                print(f"    WARNING: Could not find Pokemon ID for: {poke_name}")
                continue
            cursor.execute("""
                INSERT INTO match_pokemon (match_id, season_coach_id, pokemon_id, kills, deaths)
                VALUES (?, ?, ?, ?, ?)
            """, (match_id, sc2_id, pokemon_id, kills, deaths))
            total_inserted += 1

    conn.commit()
    conn.close()

    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"Inserted {total_inserted} Pokemon entries")

    if errors:
        print(f"\nErrors ({len(errors)}):")
        for match_id, error in errors:
            print(f"  Match {match_id}: {error}")

if __name__ == "__main__":
    main()
