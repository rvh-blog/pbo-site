import { NextRequest, NextResponse } from "next/server";

interface PokemonStats {
  name: string;
  kills: number;
  deaths: number;
}

interface ParsedReplay {
  p1Username: string;
  p2Username: string;
  p1Team: PokemonStats[];
  p2Team: PokemonStats[];
  winner: "p1" | "p2" | null;
  p1Remaining: number;
  p2Remaining: number;
}

function normalizePokemonName(name: string): string {
  // Remove forme suffixes, gender symbols, and item info
  // e.g., "Tornadus-Therian, L50" -> "Tornadus-Therian"
  // "Greninja, L50, M" -> "Greninja"
  let normalized = name.split(",")[0].trim();
  // Remove asterisk (shiny indicator)
  normalized = normalized.replace(/^\*/, "");
  return normalized;
}

function extractNicknameOwner(pokemonRef: string): { player: "p1" | "p2"; nickname: string } | null {
  // Format: "p1a: Nickname" or "p2a: Nickname"
  const match = pokemonRef.match(/^(p[12])a?: (.+)$/);
  if (match) {
    return {
      player: match[1] as "p1" | "p2",
      nickname: match[2],
    };
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { replayUrl } = await request.json();

    if (!replayUrl) {
      return NextResponse.json({ error: "Replay URL is required" }, { status: 400 });
    }

    // Extract the base replay URL and append .json
    let jsonUrl = replayUrl.trim();
    if (jsonUrl.endsWith("/")) {
      jsonUrl = jsonUrl.slice(0, -1);
    }
    if (!jsonUrl.endsWith(".json")) {
      jsonUrl = jsonUrl + ".json";
    }

    // Fetch the replay JSON
    const response = await fetch(jsonUrl, {
      headers: {
        "User-Agent": "PBO-Site/1.0",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch replay: ${response.status}` },
        { status: 400 }
      );
    }

    const data = await response.json();
    const log: string = data.log;

    if (!log) {
      return NextResponse.json({ error: "No battle log found in replay" }, { status: 400 });
    }

    // Parse the log
    const lines = log.split("\n");

    const result: ParsedReplay = {
      p1Username: "",
      p2Username: "",
      p1Team: [],
      p2Team: [],
      winner: null,
      p1Remaining: 0,
      p2Remaining: 0,
    };

    // Maps to track nicknames to actual Pokemon names
    const p1NicknameMap: Map<string, string> = new Map();
    const p2NicknameMap: Map<string, string> = new Map();

    // Track kills - who was active when the faint happened
    let lastDamageDealer: { player: "p1" | "p2"; nickname: string } | null = null;
    let p1ActivePokemon: string | null = null;
    let p2ActivePokemon: string | null = null;

    for (const line of lines) {
      const parts = line.split("|");
      if (parts.length < 2) continue;

      const command = parts[1];

      switch (command) {
        case "player": {
          // |player|p1|Username|avatar|rating
          const player = parts[2];
          const username = parts[3];
          if (player === "p1") {
            result.p1Username = username;
          } else if (player === "p2") {
            result.p2Username = username;
          }
          break;
        }

        case "poke": {
          // |poke|p1|Pokemon, L50, M|item
          const player = parts[2];
          const pokemonInfo = parts[3];
          const pokemonName = normalizePokemonName(pokemonInfo);

          if (player === "p1") {
            result.p1Team.push({ name: pokemonName, kills: 0, deaths: 0 });
          } else if (player === "p2") {
            result.p2Team.push({ name: pokemonName, kills: 0, deaths: 0 });
          }
          break;
        }

        case "switch":
        case "drag": {
          // |switch|p1a: Nickname|Pokemon, L50, M|100/100
          const pokemonRef = parts[2];
          const pokemonInfo = parts[3];
          const parsed = extractNicknameOwner(pokemonRef);

          if (parsed && pokemonInfo) {
            const pokemonName = normalizePokemonName(pokemonInfo);
            if (parsed.player === "p1") {
              p1NicknameMap.set(parsed.nickname, pokemonName);
              p1ActivePokemon = parsed.nickname;
            } else {
              p2NicknameMap.set(parsed.nickname, pokemonName);
              p2ActivePokemon = parsed.nickname;
            }
          }
          break;
        }

        case "move": {
          // |move|p1a: Nickname|Move Name|p2a: Target
          const attackerRef = parts[2];
          const parsed = extractNicknameOwner(attackerRef);
          if (parsed) {
            lastDamageDealer = parsed;
          }
          break;
        }

        case "-damage": {
          // |-damage|p2a: Nickname|50/100
          // Track who dealt damage for kill attribution
          const targetRef = parts[2];
          const parsed = extractNicknameOwner(targetRef);
          if (parsed) {
            // The opponent's active Pokemon is the damage dealer
            if (parsed.player === "p1" && p2ActivePokemon) {
              lastDamageDealer = { player: "p2", nickname: p2ActivePokemon };
            } else if (parsed.player === "p2" && p1ActivePokemon) {
              lastDamageDealer = { player: "p1", nickname: p1ActivePokemon };
            }
          }
          break;
        }

        case "faint": {
          // |faint|p1a: Nickname
          const pokemonRef = parts[2];
          const parsed = extractNicknameOwner(pokemonRef);

          if (parsed) {
            // Find the Pokemon that fainted and increment deaths
            const nicknameMap = parsed.player === "p1" ? p1NicknameMap : p2NicknameMap;
            const team = parsed.player === "p1" ? result.p1Team : result.p2Team;
            const pokemonName = nicknameMap.get(parsed.nickname);

            if (pokemonName) {
              const pokemon = team.find((p) => p.name === pokemonName);
              if (pokemon) {
                pokemon.deaths++;
              }
            }

            // Credit the kill to the opponent's active Pokemon
            if (lastDamageDealer && lastDamageDealer.player !== parsed.player) {
              const killerNicknameMap = lastDamageDealer.player === "p1" ? p1NicknameMap : p2NicknameMap;
              const killerTeam = lastDamageDealer.player === "p1" ? result.p1Team : result.p2Team;
              const killerName = killerNicknameMap.get(lastDamageDealer.nickname);

              if (killerName) {
                const killer = killerTeam.find((p) => p.name === killerName);
                if (killer) {
                  killer.kills++;
                }
              }
            }
          }
          break;
        }

        case "win": {
          // |win|Username
          const winnerUsername = parts[2];
          if (winnerUsername === result.p1Username) {
            result.winner = "p1";
          } else if (winnerUsername === result.p2Username) {
            result.winner = "p2";
          }
          break;
        }
      }
    }

    // Calculate remaining Pokemon (those with 0 deaths)
    result.p1Remaining = result.p1Team.filter((p) => p.deaths === 0).length;
    result.p2Remaining = result.p2Team.filter((p) => p.deaths === 0).length;

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error scraping replay:", error);
    return NextResponse.json(
      { error: "Failed to parse replay data" },
      { status: 500 }
    );
  }
}
