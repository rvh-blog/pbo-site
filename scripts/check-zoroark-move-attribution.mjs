import assert from "node:assert/strict";
import { IllusionMoveAttributionTracker } from "../src/lib/illusion-move-attribution.ts";

function pokemon(name, movesUsed = {}, setupMovesUsed = 0) {
  return { name, movesUsed: { ...movesUsed }, setupMovesUsed };
}

function recordAttributedMove(tracker, team, player, nickname, attributedName, moveName, isSetup = false) {
  const target = team.find((entry) => entry.name === attributedName);
  assert.ok(target, `Missing test Pokemon ${attributedName}`);
  target.movesUsed[moveName] = (target.movesUsed[moveName] || 0) + 1;
  if (isSetup) target.setupMovesUsed += 1;
  tracker.recordMove(player, nickname, moveName, isSetup);
}

for (const zoroarkName of ["Zoroark", "Zoroark-Hisui"]) {
  const team = [
    pokemon("Gengar", { "Shadow Ball": 2 }, 1),
    pokemon(zoroarkName, { "U-turn": 1 }),
  ];
  const tracker = new IllusionMoveAttributionTracker();

  tracker.beginStint("p1", "Gengar", "Gengar");
  recordAttributedMove(tracker, team, "p1", "Gengar", "Gengar", "Flamethrower");
  recordAttributedMove(tracker, team, "p1", "Gengar", "Gengar", "Nasty Plot", true);

  assert.equal(tracker.revealIllusion("p1", "Zoroark", zoroarkName, team), 1);
  assert.deepEqual(team[0].movesUsed, { "Shadow Ball": 2 });
  assert.equal(team[0].setupMovesUsed, 1);
  assert.deepEqual(team[1].movesUsed, {
    "U-turn": 1,
    Flamethrower: 1,
    "Nasty Plot": 1,
  });
  assert.equal(team[1].setupMovesUsed, 1);

  recordAttributedMove(tracker, team, "p1", "Zoroark", zoroarkName, "Dark Pulse");
  assert.equal(tracker.revealIllusion("p1", "Zoroark", zoroarkName, team), 0);
  assert.equal(team[1].movesUsed["Dark Pulse"], 1);
}

{
  const team = [pokemon("Gengar"), pokemon("Zoroark-Hisui")];
  const tracker = new IllusionMoveAttributionTracker();
  tracker.beginStint("p1", "Gengar", "Gengar");
  recordAttributedMove(tracker, team, "p1", "Gengar", "Gengar", "Shadow Ball");
  tracker.beginStint("p1", "Zoroark-Hisui", "Zoroark-Hisui");

  assert.equal(tracker.revealIllusion("p1", "Gengar", "Zoroark-Hisui", team), 0);
  assert.deepEqual(team[0].movesUsed, { "Shadow Ball": 1 });
  assert.deepEqual(team[1].movesUsed, {});
}

{
  const team = [pokemon("Iron Hands", { "Volt Switch": 1 }), pokemon("Cresselia"), pokemon("Zoroark-Hisui")];
  const tracker = new IllusionMoveAttributionTracker();

  tracker.beginStint("p2", "big sloppa", "Iron Hands", "100/100");
  recordAttributedMove(tracker, team, "p2", "big sloppa", "Iron Hands", "Hyper Voice");
  tracker.recordHealth("p2", "big sloppa", "88/100 brn");
  tracker.beginStint("p2", "big sloppa", "Iron Hands", "73/100");
  tracker.beginStint("p2", "kirked", "Cresselia", "88/100 brn");

  assert.equal(tracker.revealIllusion("p2", "kirked", "Zoroark-Hisui", team), 2);
  assert.deepEqual(team[0].movesUsed, { "Volt Switch": 1 });
  assert.deepEqual(team[1].movesUsed, {});
  assert.deepEqual(team[2].movesUsed, { "Hyper Voice": 1 });
}

{
  const team = [pokemon("Gengar"), pokemon("Roaring Moon"), pokemon("Zoroark")];
  const tracker = new IllusionMoveAttributionTracker();

  tracker.beginStint("p1", "Gengar", "Gengar", "100/100");
  recordAttributedMove(tracker, team, "p1", "Gengar", "Gengar", "Shadow Ball");
  tracker.beginStint("p1", "Moon", "Roaring Moon", "100/100");

  assert.equal(tracker.revealIllusion("p1", "Zoroark", "Zoroark", team), 1);
  assert.deepEqual(team[0].movesUsed, { "Shadow Ball": 1 });
  assert.deepEqual(team[2].movesUsed, {});
}

console.log("Zoroark Illusion move attribution checks passed");
