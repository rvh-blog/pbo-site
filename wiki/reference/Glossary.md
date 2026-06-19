# Glossary

## League Terms

- **Coach**: A persistent person/account in `coaches`.
- **Season coach**: A team slot in one division/season in `season_coaches`.
- **Division**: A competitive grouping inside a season.
- **Roster**: Current Pokemon owned by a season coach.
- **Time-synced roster**: Roster reconstructed for a specific match week using current roster plus transaction history.
- **Transaction**: Roster change such as FA pickup/drop/swap, P2P trade, or Tera swap.
- **Tera captain**: Roster Pokemon marked as `isTeraCaptain`, with cost rules from season prices.
- **Game of the Week**: Featured match with pick-em bonus.

## Database Terms

- **Persistent identity**: Long-lived account identity, usually `coaches.id` or `users.id`.
- **Competitive identity**: Team-in-season identity, usually `season_coaches.id`.
- **WAL**: SQLite write-ahead log. Production DB downloads must include `pbo.db-wal` and `pbo.db-shm`.
- **Replay key events**: JSON faint/win events stored on `matches.keyEvents`.
- **Turn snapshots**: HP-over-time JSON stored on `matches.turnSnapshots`.

## External Systems

- **Wiglett**: External integration that can submit draft picks and match results.
- **Sheet sync**: Google Sheets export/sync for rosters, transactions, and match stats.
- **Showdown replay**: Pokemon Showdown replay URL parsed by `/api/replay-scrape`.

## See Also

- [[Core League Entities]]
- [[Data Model]]
