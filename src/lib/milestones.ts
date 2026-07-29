import { rawClient } from "@/lib/db";

type SqlRow = Record<string, unknown>;

function rows<T extends SqlRow>(result: Awaited<ReturnType<typeof rawClient.execute>>): T[] {
  return result.rows as unknown as T[];
}

export async function ensureMilestoneTables(): Promise<void> {
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS milestone_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_key TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      milestone_type TEXT NOT NULL,
      season_id INTEGER NOT NULL,
      division_id INTEGER NOT NULL,
      match_id INTEGER NOT NULL,
      coach_id INTEGER,
      season_coach_id INTEGER,
      pokemon_id INTEGER,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS milestone_evaluation_queue (
      match_id INTEGER PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      queued_at TEXT NOT NULL,
      processed_at TEXT
    )
  `);
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS milestone_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      sent_at TEXT,
      UNIQUE(event_id, guild_id),
      FOREIGN KEY(event_id) REFERENCES milestone_events(id)
    )
  `);
  await rawClient.execute("CREATE INDEX IF NOT EXISTS idx_milestone_events_match ON milestone_events(match_id)");
  await rawClient.execute("CREATE INDEX IF NOT EXISTS idx_milestone_queue_status ON milestone_evaluation_queue(status, attempts)");
  await rawClient.execute("CREATE INDEX IF NOT EXISTS idx_milestone_deliveries_status ON milestone_deliveries(status, attempts)");
  await ensureMilestoneChannelColumn();
}

export async function ensureMilestoneChannelColumn(): Promise<void> {
  const columns = rows<{ name: string }>(
    await rawClient.execute("PRAGMA table_info(discord_channels)")
  );
  if (columns.length === 0 || columns.some((column) => column.name === "is_milestone_enabled")) {
    return;
  }
  try {
    await rawClient.execute(
      "ALTER TABLE discord_channels ADD COLUMN is_milestone_enabled INTEGER NOT NULL DEFAULT 0"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column")) throw error;
  }
}

interface EventInput {
  key: string;
  category: "coach" | "pokemon" | "season";
  type: string;
  seasonId: number;
  divisionId: number;
  matchId: number;
  coachId?: number;
  seasonCoachId?: number;
  pokemonId?: number;
  title: string;
  description: string;
}

async function recordEvent(event: EventInput): Promise<void> {
  await rawClient.execute({
    sql: `INSERT OR IGNORE INTO milestone_events
      (event_key, category, milestone_type, season_id, division_id, match_id,
       coach_id, season_coach_id, pokemon_id, title, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      event.key, event.category, event.type, event.seasonId, event.divisionId,
      event.matchId, event.coachId ?? null, event.seasonCoachId ?? null,
      event.pokemonId ?? null, event.title, event.description, new Date().toISOString(),
    ],
  });
}

interface MatchContext extends SqlRow {
  id: number;
  season_id: number;
  division_id: number;
  week: number;
  coach1_season_id: number;
  coach2_season_id: number;
  winner_id: number;
}

interface Participant extends SqlRow {
  season_coach_id: number;
  coach_id: number;
  coach_name: string;
  team_name: string;
}

async function evaluateCoachMilestones(match: MatchContext, participants: Participant[]) {
  const winner = participants.find((participant) => participant.season_coach_id === match.winner_id);
  if (!winner) return;

  const counts = rows<{ wins: number; playoff_wins: number; championships: number }>(
    await rawClient.execute({
      sql: `SELECT
        SUM(CASE WHEN m.winner_id IS NOT NULL THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN m.week >= 101 THEN 1 ELSE 0 END) AS playoff_wins,
        SUM(CASE WHEN m.week = 103 THEN 1 ELSE 0 END) AS championships
      FROM matches m
      JOIN season_coaches sc ON sc.id = m.winner_id
      WHERE sc.coach_id = ?`,
      args: [winner.coach_id],
    })
  )[0];

  if (Number(counts?.wins) === 1) {
    await recordEvent({
      key: `coach:${winner.coach_id}:first-career-win`,
      category: "coach", type: "first_career_win", seasonId: match.season_id,
      divisionId: match.division_id, matchId: match.id, coachId: winner.coach_id,
      seasonCoachId: winner.season_coach_id, title: "🏆 First Career Victory",
      description: `**${winner.coach_name}** earned their first career victory with **${winner.team_name}**!`,
    });
  }
  if (match.week >= 101 && Number(counts?.playoff_wins) === 1) {
    await recordEvent({
      key: `coach:${winner.coach_id}:first-playoff-win`,
      category: "coach", type: "first_playoff_win", seasonId: match.season_id,
      divisionId: match.division_id, matchId: match.id, coachId: winner.coach_id,
      seasonCoachId: winner.season_coach_id, title: "🔥 First Playoff Victory",
      description: `**${winner.coach_name}** secured their first career playoff win!`,
    });
  }
  if (match.week === 103) {
    for (const finalist of participants) {
      const appearances = rows<{ total: number }>(await rawClient.execute({
        sql: `SELECT COUNT(*) AS total FROM matches m
          JOIN season_coaches a ON a.id = m.coach1_season_id
          JOIN season_coaches b ON b.id = m.coach2_season_id
          WHERE m.week = 103 AND m.winner_id IS NOT NULL AND (a.coach_id = ? OR b.coach_id = ?)`,
        args: [finalist.coach_id, finalist.coach_id],
      }))[0];
      if (Number(appearances?.total) === 1) {
        await recordEvent({
          key: `coach:${finalist.coach_id}:first-championship-appearance`,
          category: "coach", type: "first_championship_appearance", seasonId: match.season_id,
          divisionId: match.division_id, matchId: match.id, coachId: finalist.coach_id,
          seasonCoachId: finalist.season_coach_id, title: "🌟 First Championship Appearance",
          description: `**${finalist.coach_name}** reached the championship for the first time!`,
        });
      }
    }
    const championships = Number(counts?.championships);
    if (championships === 1) {
      await recordEvent({
        key: `coach:${winner.coach_id}:first-championship-win`,
        category: "coach", type: "first_championship_win", seasonId: match.season_id,
        divisionId: match.division_id, matchId: match.id, coachId: winner.coach_id,
        seasonCoachId: winner.season_coach_id, title: "👑 First Championship",
        description: `**${winner.coach_name}** won their first PBO championship!`,
      });
    } else if (championships === 2) {
      await recordEvent({
        key: `coach:${winner.coach_id}:multiple-championships`,
        category: "coach", type: "multiple_championships", seasonId: match.season_id,
        divisionId: match.division_id, matchId: match.id, coachId: winner.coach_id,
        seasonCoachId: winner.season_coach_id, title: "👑 Multiple-Time Champion",
        description: `**${winner.coach_name}** is now a two-time PBO champion!`,
      });
    }
  }
}

interface PokemonMatchRow extends SqlRow {
  pokemon_id: number;
  pokemon_name: string;
  season_coach_id: number;
  coach_id: number;
  coach_name: string;
  kills: number;
  deaths: number;
}

async function evaluatePokemonMilestones(match: MatchContext) {
  const currentRows = rows<PokemonMatchRow>(await rawClient.execute({
    sql: `SELECT mp.pokemon_id, COALESCE(p.display_name, p.name) AS pokemon_name,
      mp.season_coach_id, sc.coach_id, c.name AS coach_name,
      COALESCE(mp.kills, 0) AS kills, COALESCE(mp.deaths, 0) AS deaths
      FROM match_pokemon mp
      JOIN pokemon p ON p.id = mp.pokemon_id
      JOIN season_coaches sc ON sc.id = mp.season_coach_id
      JOIN coaches c ON c.id = sc.coach_id
      WHERE mp.match_id = ?`,
    args: [match.id],
  }));

  for (const pokemon of currentRows) {
    const totals = rows<{ kills: number; appearances: number }>(await rawClient.execute({
      sql: `SELECT COALESCE(SUM(mp.kills), 0) AS kills, COUNT(*) AS appearances
        FROM match_pokemon mp JOIN matches m ON m.id = mp.match_id
        WHERE mp.pokemon_id = ? AND m.winner_id IS NOT NULL`,
      args: [pokemon.pokemon_id],
    }))[0];
    const totalKills = Number(totals?.kills);
    const priorKills = totalKills - Number(pokemon.kills);
    const totalAppearances = Number(totals?.appearances);
    for (const threshold of [1, 10, 25, 50, 100]) {
      if (priorKills < threshold && totalKills >= threshold) {
        await recordEvent({
          key: `pokemon:${pokemon.pokemon_id}:career-kills:${threshold}`,
          category: "pokemon", type: "career_kills", seasonId: match.season_id,
          divisionId: match.division_id, matchId: match.id, pokemonId: pokemon.pokemon_id,
          coachId: pokemon.coach_id, seasonCoachId: pokemon.season_coach_id,
          title: threshold === 1 ? "⚔️ First Recorded Kill" : `⚔️ ${threshold} Career Kills`,
          description: `**${pokemon.pokemon_name}** reached ${threshold === 1 ? "its first recorded kill" : `**${threshold}** career kills`}!`,
        });
      }
    }
    for (const threshold of [25, 50, 100]) {
      if (totalAppearances === threshold) {
        await recordEvent({
          key: `pokemon:${pokemon.pokemon_id}:appearances:${threshold}`,
          category: "pokemon", type: "appearances", seasonId: match.season_id,
          divisionId: match.division_id, matchId: match.id, pokemonId: pokemon.pokemon_id,
          coachId: pokemon.coach_id, seasonCoachId: pokemon.season_coach_id,
          title: `🎮 ${threshold} Appearances`,
          description: `**${pokemon.pokemon_name}** made its **${threshold}th** recorded appearance!`,
        });
      }
    }
    if (pokemon.deaths === 0) {
      const recent = rows<{ match_id: number; deaths: number }>(await rawClient.execute({
        sql: `SELECT mp.match_id, COALESCE(mp.deaths, 0) AS deaths
          FROM match_pokemon mp JOIN matches m ON m.id = mp.match_id
          WHERE mp.pokemon_id = ? AND m.winner_id IS NOT NULL
          ORDER BY COALESCE(m.played_at, '') DESC, m.id DESC LIMIT 10`,
        args: [pokemon.pokemon_id],
      }));
      if (recent[0]?.match_id === match.id) {
        let streak = 0;
        for (const appearance of recent) {
          if (Number(appearance.deaths) !== 0) break;
          streak++;
        }
        for (const threshold of [5, 10]) {
          if (streak === threshold) {
            await recordEvent({
              key: `pokemon:${pokemon.pokemon_id}:survival-streak:${threshold}`,
              category: "pokemon", type: "survival_streak", seasonId: match.season_id,
              divisionId: match.division_id, matchId: match.id, pokemonId: pokemon.pokemon_id,
              coachId: pokemon.coach_id, seasonCoachId: pokemon.season_coach_id,
              title: `🛡️ ${threshold}-Match Survival Streak`,
              description: `**${pokemon.pokemon_name}** has gone **${threshold} appearances** without fainting!`,
            });
          }
        }
      }
    }

    const pairTotal = rows<{ total: number }>(await rawClient.execute({
      sql: `SELECT COALESCE(SUM(mp.kills), 0) AS total FROM match_pokemon mp
        JOIN season_coaches sc ON sc.id = mp.season_coach_id
        JOIN matches m ON m.id = mp.match_id
        WHERE mp.pokemon_id = ? AND sc.coach_id = ? AND m.winner_id IS NOT NULL`,
      args: [pokemon.pokemon_id, pokemon.coach_id],
    }))[0];
    const otherSpeciesBest = rows<{ total: number }>(await rawClient.execute({
      sql: `SELECT COALESCE(MAX(total), 0) AS total FROM (
        SELECT SUM(mp.kills) AS total FROM match_pokemon mp
        JOIN season_coaches sc ON sc.id = mp.season_coach_id
        JOIN matches m ON m.id = mp.match_id
        WHERE mp.pokemon_id = ? AND sc.coach_id <> ? AND m.winner_id IS NOT NULL
        GROUP BY sc.coach_id)`,
      args: [pokemon.pokemon_id, pokemon.coach_id],
    }))[0];
    const otherCoachBest = rows<{ total: number }>(await rawClient.execute({
      sql: `SELECT COALESCE(MAX(total), 0) AS total FROM (
        SELECT SUM(mp.kills) AS total FROM match_pokemon mp
        JOIN season_coaches sc ON sc.id = mp.season_coach_id
        JOIN matches m ON m.id = mp.match_id
        WHERE sc.coach_id = ? AND mp.pokemon_id <> ? AND m.winner_id IS NOT NULL
        GROUP BY mp.pokemon_id)`,
      args: [pokemon.coach_id, pokemon.pokemon_id],
    }))[0];
    const pairKills = Number(pairTotal?.total);
    const priorPairKills = pairKills - Number(pokemon.kills);
    const speciesRecord = Number(otherSpeciesBest?.total);
    const coachPokemonRecord = Number(otherCoachBest?.total);
    if (
      pokemon.kills > 0
      && speciesRecord > 0
      && priorPairKills <= speciesRecord
      && pairKills > speciesRecord
    ) {
      await recordEvent({
        key: `pokemon:${pokemon.pokemon_id}:coach:${pokemon.coach_id}:species-kill-record`,
        category: "pokemon", type: "species_coach_kill_record", seasonId: match.season_id,
        divisionId: match.division_id, matchId: match.id, pokemonId: pokemon.pokemon_id,
        coachId: pokemon.coach_id, seasonCoachId: pokemon.season_coach_id,
        title: "📈 New Species Kill Record",
        description: `**${pokemon.coach_name}** now holds the coach record for career kills with **${pokemon.pokemon_name}** (${pairKills})!`,
      });
    }
    if (
      pokemon.kills > 0
      && coachPokemonRecord > 0
      && priorPairKills <= coachPokemonRecord
      && pairKills > coachPokemonRecord
    ) {
      await recordEvent({
        key: `coach:${pokemon.coach_id}:pokemon:${pokemon.pokemon_id}:personal-kill-record`,
        category: "pokemon", type: "coach_pokemon_kill_record", seasonId: match.season_id,
        divisionId: match.division_id, matchId: match.id, pokemonId: pokemon.pokemon_id,
        coachId: pokemon.coach_id, seasonCoachId: pokemon.season_coach_id,
        title: "⭐ Coach's New Kill Leader",
        description: `**${pokemon.pokemon_name}** now has the most career kills of any Pokémon coached by **${pokemon.coach_name}** (${pairKills})!`,
      });
    }
  }
}

async function evaluateCompletedSeasonMilestones(match: MatchContext) {
  const pending = rows<{ total: number }>(await rawClient.execute({
    sql: `SELECT COUNT(*) AS total FROM matches
      WHERE season_id = ? AND week < 100 AND winner_id IS NULL
        AND NOT (is_forfeit = 1 AND played_at IS NOT NULL)`,
    args: [match.season_id],
  }))[0];
  if (Number(pending?.total) !== 0) return;

  const teams = rows<{ season_coach_id: number; division_id: number; coach_id: number; coach_name: string; team_name: string; wins: number; losses: number; differential: number }>(
    await rawClient.execute({
      sql: `SELECT sc.id AS season_coach_id, sc.division_id, sc.coach_id,
        c.name AS coach_name, sc.team_name,
        SUM(CASE WHEN m.winner_id = sc.id THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN m.winner_id <> sc.id OR (m.winner_id IS NULL AND m.is_forfeit = 1)
                 THEN 1 ELSE 0 END) AS losses,
        SUM(CASE WHEN m.coach1_season_id = sc.id THEN COALESCE(m.coach1_differential, 0)
                 ELSE COALESCE(m.coach2_differential, 0) END) AS differential
      FROM season_coaches sc
      JOIN divisions d ON d.id = sc.division_id
      JOIN coaches c ON c.id = sc.coach_id
      JOIN matches m ON m.season_id = d.season_id AND m.week < 100
        AND (m.coach1_season_id = sc.id OR m.coach2_season_id = sc.id)
      WHERE d.season_id = ? AND (m.winner_id IS NOT NULL OR (m.is_forfeit = 1 AND m.played_at IS NOT NULL))
      GROUP BY sc.id`,
      args: [match.season_id],
    })
  );
  for (const team of teams.filter((entry) => Number(entry.wins) > 0 && Number(entry.losses) === 0)) {
    await recordEvent({
      key: `season:${match.season_id}:team:${team.season_coach_id}:undefeated`,
      category: "season", type: "undefeated_regular_season", seasonId: match.season_id,
      divisionId: team.division_id, matchId: match.id, coachId: team.coach_id,
      seasonCoachId: team.season_coach_id, title: "💎 Undefeated Regular Season",
      description: `**${team.team_name}** and **${team.coach_name}** completed the regular season undefeated!`,
    });
  }
  const bestDifferential = Math.max(...teams.map((team) => Number(team.differential)));
  for (const team of teams.filter((entry) => Number(entry.differential) === bestDifferential)) {
    await recordEvent({
      key: `season:${match.season_id}:team:${team.season_coach_id}:best-differential`,
      category: "season", type: "best_regular_season_differential", seasonId: match.season_id,
      divisionId: team.division_id, matchId: match.id, coachId: team.coach_id,
      seasonCoachId: team.season_coach_id, title: "📊 League's Best Differential",
      description: `**${team.team_name}** finished the regular season with the league's best differential (**${bestDifferential >= 0 ? "+" : ""}${bestDifferential}**)!`,
    });
  }

  const leaders = rows<{ pokemon_id: number; pokemon_name: string; kills: number }>(await rawClient.execute({
    sql: `SELECT mp.pokemon_id, COALESCE(p.display_name, p.name) AS pokemon_name, SUM(mp.kills) AS kills
      FROM match_pokemon mp JOIN matches m ON m.id = mp.match_id
      JOIN pokemon p ON p.id = mp.pokemon_id
      WHERE m.season_id = ? AND m.week < 100 AND m.winner_id IS NOT NULL
      GROUP BY mp.pokemon_id ORDER BY kills DESC`,
    args: [match.season_id],
  }));
  const topKills = Number(leaders[0]?.kills ?? 0);
  for (const leader of leaders.filter((entry) => Number(entry.kills) === topKills && topKills > 0)) {
    const owner = rows<{ coach_id: number; season_coach_id: number; division_id: number }>(await rawClient.execute({
      sql: `SELECT sc.coach_id, sc.id AS season_coach_id, sc.division_id
        FROM match_pokemon mp
        JOIN matches m ON m.id = mp.match_id
        JOIN season_coaches sc ON sc.id = mp.season_coach_id
        WHERE m.season_id = ? AND m.week < 100 AND m.winner_id IS NOT NULL
          AND mp.pokemon_id = ?
        ORDER BY COALESCE(m.played_at, '') DESC, m.id DESC LIMIT 1`,
      args: [match.season_id, leader.pokemon_id],
    }))[0];
    await recordEvent({
      key: `season:${match.season_id}:pokemon:${leader.pokemon_id}:kill-leader`,
      category: "pokemon", type: "season_kill_leader", seasonId: match.season_id,
      divisionId: owner?.division_id ?? match.division_id,
      matchId: match.id, pokemonId: leader.pokemon_id,
      coachId: owner?.coach_id, seasonCoachId: owner?.season_coach_id,
      title: "⚔️ Season Kill Leader",
      description: `**${leader.pokemon_name}** finished as the season's kill leader with **${topKills} kills**!`,
    });
  }
}

export async function evaluateMilestonesForMatch(matchId: number): Promise<void> {
  await ensureMilestoneTables();
  const match = rows<MatchContext>(await rawClient.execute({
    sql: "SELECT * FROM matches WHERE id = ? AND winner_id IS NOT NULL",
    args: [matchId],
  }))[0];
  if (!match) return;
  const participants = rows<Participant>(await rawClient.execute({
    sql: `SELECT sc.id AS season_coach_id, sc.coach_id, c.name AS coach_name, sc.team_name
      FROM season_coaches sc JOIN coaches c ON c.id = sc.coach_id
      WHERE sc.id IN (?, ?)`,
    args: [match.coach1_season_id, match.coach2_season_id],
  }));
  await evaluateCoachMilestones(match, participants);
  await evaluatePokemonMilestones(match);
  if (match.week < 100) await evaluateCompletedSeasonMilestones(match);
}

export async function queueMilestoneEvaluation(matchId: number): Promise<void> {
  await ensureMilestoneTables();
  await rawClient.execute({
    sql: `INSERT OR IGNORE INTO milestone_evaluation_queue
      (match_id, status, attempts, queued_at) VALUES (?, 'pending', 0, ?)`,
    args: [matchId, new Date().toISOString()],
  });
}

export async function processMilestoneEvaluationQueue(): Promise<void> {
  await ensureMilestoneTables();
  const queued = rows<{ match_id: number }>(await rawClient.execute(`
    SELECT match_id FROM milestone_evaluation_queue
    WHERE status = 'pending' OR (status = 'failed' AND attempts < 3)
    ORDER BY queued_at ASC LIMIT 10
  `));
  for (const item of queued) {
    try {
      await evaluateMilestonesForMatch(Number(item.match_id));
      await rawClient.execute({
        sql: `UPDATE milestone_evaluation_queue SET status = 'processed',
          attempts = attempts + 1, last_error = NULL, processed_at = ? WHERE match_id = ?`,
        args: [new Date().toISOString(), item.match_id],
      });
    } catch (error) {
      await rawClient.execute({
        sql: `UPDATE milestone_evaluation_queue SET status = 'failed',
          attempts = attempts + 1, last_error = ? WHERE match_id = ?`,
        args: [error instanceof Error ? error.message : String(error), item.match_id],
      });
    }
  }
}
