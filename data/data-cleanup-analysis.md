# PBO Data Cleanup Analysis

## Summary of Findings

Based on analysis of the battle record xlsx file and comparing with database, here are the key issues:

---

## 1. Duplicate Coaches (Same Person, Multiple IDs)

These coaches appear multiple times with different IDs and should be merged:

| Primary ID | Primary Name | Duplicate ID | Duplicate Name | Evidence |
|------------|--------------|--------------|----------------|----------|
| 84 | holiss7795 | 57 | holiss77 | Caborca Gengars S6-S8 |
| 81 | Nigthamarish | 102 | nigthamarish | Boston Bulbasaurs S7-S8 |
| 80 | Bee | 117, 153 | apointlessbee, ApointlessBee | King Keldeos S5-S8 |
| 61 | Rexx | 86 | RexxRexx | Uncertain Unowns |
| 41 | Mystic Mew | 100 | MysticMew | Sydney Sylveons |
| 151 | Kuma | 93 | kuma | Tokyo Teddiursas |
| 63 | BigWill | 99 | bigwill0207 | East Coast Krooks |
| 68 | platano_power_420 | 130 | platanopower420 | Chicago Chimchars |
| 14 | hotpepper22 | 113 | Hotpepper22 | Cherry Hill Bellsprouts |
| 96 | CarlSHT | 104 | carlsht | Manila Manectrics |
| 55 | clonbrookkyogres | 91 | Clonbrookkyogres | Clonbrook Kyogres |
| 142 | Doncolbus | 76 | doncolbus | Charleston Chesnaughts |
| 53 | Kalib_32 | 94 | Kalib | New York Nickits |
| 12 | shadow2054 | 73 | Shadow2054 | Lion City Leech Life |
| 48 | IntoTheVoid | 126, 109 | IntoTheVoid13, "IntoTheVoid13 " | Pittsburgh Scizors |
| 72 | FireAnt | 127 | FireAnt78 | Vancouver Valiants |
| 157 | DayX | 119 | Dayx2 | Indianapolis Incineroars |
| 67 | Gage | 82 | TheyCallMeGage | Carolina Cetitans |

---

## 2. S5 Team Name Updates

Many S5 teams are using coach names instead of team names. Here are the correct mappings:

### S5 Kalos Division
| Current Team Name | Correct Team Name | Coach |
|-------------------|-------------------|-------|
| King Keldeos | Gros Morne Growlithes | ApointlessBee |
| Kingdozo | GVGT (Glamorgan Vale Great Tusks) | Kingdozo |
| Trainerblack | Tottenham Hoothoots | Trainerblack |
| H7795 | Caborca Gengars | H7795 |
| NickNob | Memphis Magcargos | NickNob |
| Dr.Rizz | Philadelphia Flygons | Dr.Rizz |
| WhiteRaven | Boston Banettes | WhiteRaven |
| DayX | Indianapolis Incineroars | DayX |
| Pickle | *Unknown* (dropped Week 1) | Pickle |

### S5 Unova Division
| Current Team Name | Correct Team Name | Coach |
|-------------------|-------------------|-------|
| Nightmare | Abbotsford Aggrons | Nightmare |
| Taye | Kingston Shadows | Taye |
| Natty | Worcester Woopers | Natty |
| Void | Pittsburgh Scizors | Void |
| Fix | Virginia Zekroms | Fix |
| Drew | Sin City Sableye | Drew |
| Krook | New Jersey Dracos | Krook |

---

## 3. Mid-Season Replacements

### S5 Kalos - CORRECTED
- **Norwalk Noiverns** actually played ALL 8 weeks (battle record shows "SK K Week 1" - typo for S5)
- No mid-season replacement here

### S6 Stargazer - Week 8 Dropout
- **Who dropped:** FireAnt78 (Vancouver Valiants) - only played weeks 1-7
- **Replaced by:** Unknown or forfeited week 8
- **Database evidence:** FireAnt78 has 7 games in S6 Stargazer

### S6 Sunset - Week 7 Issue
- **Who:** Drew876 (Sin City Sableye) - played weeks 1-6 and 8, missing week 7
- **Likely:** Forfeit or data issue in week 7

### S7 Neon - Week 5 Replacement - FIXED
- **Who dropped:** "S7 Gelnhausen Original" placeholder (weeks 1-4, record: 1-3)
- **Replaced by:** BigWill (East Coast Krooks) starting Week 5
- **Status:** ✅ Games correctly reassigned to placeholder coach

### S7 Neon - Week 7 Replacement - FIXED
- **Who dropped:** "S7 Columbus Original" placeholder (weeks 1-6, record: 2-4)
- **Replaced by:** Cowtow (Columbus Conkeldurrs) starting Week 7
- **Status:** ✅ Games correctly reassigned to placeholder coach

---

## 4. Team Name Changes Over Seasons (Same Coach)

| Coach | S5 Team | S6 Team | S7 Team | S8 Team |
|-------|---------|---------|---------|---------|
| ApointlessBee/Bee | Gros Morne Growlithes | King Keldeos | King Keldeos | King Keldeos |
| Gage/TheyCallMeGage | - | Asheville Azumarills | Carolina Cetitans | Carolina Cetitans |
| H7795/holiss77/holiss7795 | Caborca Gengars | Caborca Gengars | Caborca Gengars | Caborca Gengars |
| Nightmare/Nightmarehall | Abbotsford Aggrons | - | Abbotsford Aggrons | - |
| WhiteRaven/Raven | Boston Banettes | Boston Babettes | Boston Banettes | - |
| Aiden | Icirrus City Infernapes | (St Louis Solgaleos) | (Icirrus City) | Icirrus City Infernapes |

---

## 5. Recommended Actions

### Phase 1: Merge Duplicate Coaches
1. For each duplicate pair, keep the coach with more history/games
2. Update all season_coaches records to point to the primary coach_id
3. Update all elo_history records
4. Delete the duplicate coach record

### Phase 2: Fix S5 Team Names
1. Update team_name in season_coaches for S5 entries
2. This is cosmetic but improves data quality

### Phase 3: Fix Mid-Season Replacements
1. For S5 Kalos Week 1: Determine which coach actually played that game
2. For S7 Neon: Investigate who was replaced by East Coast Krooks (week 5) and Columbus Conkeldurrs (week 7)
3. Update match records to reflect actual coaches who played

### Phase 4: Recalculate ELO
After all corrections, recalculate ELO ratings from scratch.

---

## Notes

- The battle record file only covers S5-S8, excludes S9
- Some team name spellings vary (e.g., "Charleston Chesnaughts" vs "Charleston Chestnaughts")
- St Louis Solgaleos appears in matchups but is an alias for Icirrus City Infernapes (same coach: Aiden)
