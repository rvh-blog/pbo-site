import assert from "node:assert/strict";

// Read-only smoke checks. Start the local dev server before running this script.
const base = process.argv[2] ?? "http://localhost:3000";
async function page(path) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, path);
  return response.text();
}

const [pokemon, plays, glossary] = await Promise.all([
  page("/experimental-stats/pokemon?demo=1"),
  page("/experimental-stats/top-plays?demo=1"),
  page("/experimental-stats/glossary?demo=1"),
]);
assert.ok(pokemon.includes("Advanced"));
assert.ok(plays.includes("One record per match"));
assert.ok(plays.includes("Show more"));
assert.ok(glossary.includes('aria-label="Search metrics and visuals"'));
assert.ok(glossary.includes("Open related report"));
for (const id of ["damage-dealt", "direct-damage", "indirect-damage", "hp-restored", "turns-active", "survival-rate", "setup-moves"]) {
  assert.ok(glossary.includes(`id="metric-${id}"`), id);
}
const link = plays.match(/href="([^\"]*battle-visualizer\?[^\"]*turn=[^\"]*)"/);
assert.ok(link, "Top play has a battle-turn link");
const battle = await page(link[1].replaceAll("&amp;", "&"));
assert.ok(battle.includes('id="battle-turn"'), "Linked turn resolves to saved evidence");
assert.ok(battle.includes("Selected play"));
console.log("Experimental usability smoke checks passed (profiles, top plays, glossary, battle-turn link).");
