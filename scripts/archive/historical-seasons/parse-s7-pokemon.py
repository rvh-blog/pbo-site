#!/usr/bin/env python3
"""
Parse S7 CSV match stats to verify forfeits match DB.
"""

import csv
import sqlite3
from pathlib import Path

DB_PATH = Path("/Users/rafu/pbo-site/pbo.db")
DATA_DIR = Path("/Users/rafu/pbo-site/data/S7")

DIVISION_CSV = {
    "Neon": "Neon S7 - Match Stats.csv",
    "Stargazer": "Stargazer S7 - Match Stats.csv",
    "Sunset": "Sunset S7 - Match Stats.csv",
}

def get_week_col(week):
    return 2 + (week - 1) * 14

def find_match_in_csv(rows, week, team1, team2):
    """Find match and check if it's a forfeit (Abra placeholder)."""
    col = get_week_col(week)

    for i, row in enumerate(rows):
        if col + 8 >= len(row):
            continue
        if row[col + 8].strip() != 'T1W':
            continue

        t1 = row[col].strip()
        t2 = row[col + 4].strip()

        # Check for match (fuzzy)
        match_found = False
        if (team1 in t1 or t1 in team1) and (team2 in t2 or t2 in team2):
            match_found = True
        elif (team2 in t1 or t1 in team2) and (team1 in t2 or t2 in team1):
            match_found = True

        if not match_found:
            continue

        # Check for Abra placeholder
        has_abra = False
        has_real_data = False
        for j in range(2, 8):
            if i + j >= len(rows):
                break
            prow = rows[i + j]
            p1 = prow[col].strip() if col < len(prow) else ''
            p2 = prow[col + 6].strip() if col + 6 < len(prow) else ''

            if p1 == 'Abra' or p2 == 'Abra':
                has_abra = True
            elif p1 and p1 != 'Pokemon':
                has_real_data = True

        is_forfeit = has_abra and not has_real_data
        return True, is_forfeit, t1, t2

    return False, None, None, None

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT m.id, d.name as division, m.week,
               sc1.team_name as team1, sc2.team_name as team2,
               m.is_forfeit
        FROM matches m
        JOIN divisions d ON m.division_id = d.id
        JOIN seasons s ON d.season_id = s.id
        JOIN season_coaches sc1 ON m.coach1_season_id = sc1.id
        JOIN season_coaches sc2 ON m.coach2_season_id = sc2.id
        LEFT JOIN match_pokemon mp ON m.id = mp.match_id
        WHERE s.season_number = 7
          AND m.winner_id IS NOT NULL
          AND d.name NOT LIKE '%Playoff%'
          AND m.week < 100
        GROUP BY m.id
        HAVING COUNT(mp.id) = 0
        ORDER BY d.name, m.week
    """)

    missing_matches = cursor.fetchall()
    print(f"Found {len(missing_matches)} S7 matches missing Pokemon data\n")

    by_division = {}
    for match in missing_matches:
        div = match[1]
        if div not in by_division:
            by_division[div] = []
        by_division[div].append(match)

    inconsistencies = []

    for division, matches in by_division.items():
        if division not in DIVISION_CSV:
            continue

        csv_path = DATA_DIR / DIVISION_CSV[division]
        if not csv_path.exists():
            continue

        print(f"=== {division} ===")

        with open(csv_path, 'r', encoding='utf-8') as f:
            csv_rows = list(csv.reader(f))

        for match in matches:
            match_id, div, week, team1, team2, db_forfeit = match

            found, csv_forfeit, csv_t1, csv_t2 = find_match_in_csv(csv_rows, week, team1, team2)

            print(f"Match {match_id}: W{week} {team1} vs {team2}")
            print(f"  DB forfeit: {bool(db_forfeit)}")

            if found:
                print(f"  CSV: {csv_t1} vs {csv_t2}")
                print(f"  CSV forfeit: {csv_forfeit}")
                if csv_forfeit != bool(db_forfeit):
                    inconsistencies.append((match_id, week, team1, team2, db_forfeit, csv_forfeit))
            else:
                print(f"  NOT FOUND in CSV")
            print()

    conn.close()

    if inconsistencies:
        print("\n⚠️  INCONSISTENCIES:")
        for inc in inconsistencies:
            print(f"  Match {inc[0]}: W{inc[1]} {inc[2]} vs {inc[3]}")
            print(f"    DB={inc[4]}, CSV={inc[5]}")

if __name__ == "__main__":
    main()
