import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/replay-scrape/route";

const log = [
  "|player|p1|Life Orb User|",
  "|player|p2|Opponent|",
  "|gen|9",
  "|tier|[Gen 9] Draft",
  "|poke|p1|Iron Valiant, L50|",
  "|poke|p2|Qwilfish, L50|",
  "|poke|p2|Garchomp, L50|",
  "|teampreview",
  "|start",
  "|switch|p1a: Iron Valiant|Iron Valiant, L50|100/100",
  "|switch|p2a: Qwilfish|Qwilfish, L50|100/100",
  "|turn|1",
  "|move|p2a: Qwilfish|Aqua Jet|p1a: Iron Valiant",
  "|-damage|p1a: Iron Valiant|3/100",
  "|turn|2",
  "|switch|p2a: Garchomp|Garchomp, L50|100/100",
  "|move|p1a: Iron Valiant|Moonblast|p2a: Garchomp",
  "|-damage|p2a: Garchomp|0 fnt",
  "|faint|p2a: Garchomp",
  "|-damage|p1a: Iron Valiant|0 fnt|[from] item: Life Orb",
  "|faint|p1a: Iron Valiant",
  "|win|Opponent",
].join("\n");

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        p1: "Life Orb User",
        p2: "Opponent",
        format: "gen9draft",
        uploadtime: 1_700_000_000,
        log,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  try {
    const response = await POST(
    new NextRequest("http://localhost/api/replay-scrape", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        replayUrl: "https://replay.pokemonshowdown.com/gen9draft-life-orb-check",
      }),
    })
  );
    const parsed = await response.json();
    assert.equal(response.status, 200, parsed?.error || "Replay parse should succeed");

    const lifeOrbFaint = parsed.keyEvents.find(
    (event: {
      type: string;
      pokemon: string;
      cause?: string;
    }) =>
      event.type === "faint" &&
      event.pokemon === "Iron Valiant" &&
      /life orb/i.test(event.cause || "")
  );
    assert.deepEqual(
    lifeOrbFaint,
    {
      turn: 2,
      type: "faint",
      player: "p1",
      pokemon: "Iron Valiant",
      cause: "item: Life Orb",
      killer: "Garchomp",
      killerPlayer: "p2",
    },
    "Life Orb recoil must credit the opposing Pokemon in front, even if it fainted first"
  );
    assert.equal(
    parsed.p2Team.find((pokemon: { name: string }) => pokemon.name === "Garchomp")?.kills,
    1
  );
    assert.equal(
    parsed.p2Team.find((pokemon: { name: string }) => pokemon.name === "Qwilfish")?.kills,
    0,
    "The earlier damage dealer must not replace the opposing Pokemon in front"
  );

    console.log("Life Orb recoil attribution check passed");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
