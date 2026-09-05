// Create an isolated, WAL-aware local preview. Never writes to the source database.
import Database from "better-sqlite3";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

const directory = mkdtempSync(join(tmpdir(), "pbo-weekly-preview-"));
const databasePath = join(directory, "pbo.db");
const source = new Database(resolve("pbo.db"), { readonly: true, fileMustExist: true });
await source.backup(databasePath);
source.close();
const preview = new Database(databasePath, { fileMustExist: true });
const columns = new Set(preview.prepare("PRAGMA table_info(match_pokemon)").all().map((column) => column.name));
for (const [column, type] of [["favorable_confusions", "INTEGER"], ["favorable_confusion_self_hits", "INTEGER"], ["favorable_events", "TEXT"]]) {
  if (!columns.has(column)) preview.exec(`ALTER TABLE match_pokemon ADD COLUMN ${column} ${type}`);
}
let match = preview.prepare(`SELECT m.id, m.week, m.season_id AS seasonId,
  m.division_id AS divisionId, m.coach1_season_id AS teamId, sc.coach_id AS coachId
  FROM matches m JOIN seasons s ON s.id = m.season_id
  JOIN season_coaches sc ON sc.id = m.coach1_season_id
  WHERE s.is_current = 1 AND COALESCE(s.is_public, 1) = 1
    AND COALESCE(s.is_schedule_public, 1) = 1 AND COALESCE(sc.is_active, 1) = 1
    AND m.winner_id IS NULL AND COALESCE(m.is_forfeit, 0) = 0
  ORDER BY m.week, m.id LIMIT 1`).get();
if (!match) {
  const teams = preview.prepare(`SELECT sc.id, sc.coach_id AS coachId, d.id AS divisionId, d.season_id AS seasonId
    FROM season_coaches sc JOIN divisions d ON d.id = sc.division_id JOIN seasons s ON s.id = d.season_id
    WHERE s.is_current = 1 AND COALESCE(s.is_public, 1) = 1 AND COALESCE(sc.is_active, 1) = 1
    ORDER BY d.id, sc.id`).all();
  const first = teams[0];
  const second = teams.find((team) => team.divisionId === first?.divisionId && team.id !== first.id);
  if (!first || !second) throw new Error("Preview needs two current teams in one public division.");
  const inserted = preview.prepare(`INSERT INTO matches (season_id, division_id, week, coach1_season_id, coach2_season_id)
    VALUES (?, ?, 1, ?, ?)`).run(first.seasonId, first.divisionId, first.id, second.id);
  match = { id: Number(inserted.lastInsertRowid), week: 1, seasonId: first.seasonId, divisionId: first.divisionId, teamId: first.id, coachId: first.coachId };
}
preview.prepare("UPDATE coaches SET project_mew_prompt_seen = 1 WHERE id = ?").run(match.coachId);
const token = randomBytes(32).toString("hex");
const expires = new Date(Date.now() + 86_400_000).toISOString();
preview.prepare("INSERT INTO user_sessions (token, coach_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
  .run(token, match.coachId, expires, new Date().toISOString());
// Ensure the fixture has a future local time to display; only the disposable copy is changed.
preview.prepare("UPDATE matches SET scheduled_at = ? WHERE id = ?").run(expires, match.id);
preview.close();
writeFileSync(join(directory, "fixture.json"), JSON.stringify({ ...match, token, databasePath }));
console.log(JSON.stringify({ databasePath, fixturePath: join(directory, "fixture.json") }));
