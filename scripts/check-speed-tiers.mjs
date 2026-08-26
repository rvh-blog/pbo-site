import assert from "node:assert/strict";
import { applySpeedEffect, getActiveSpeedEffect } from "../src/lib/speed-tiers.ts";

const expectEffect = (abilities, condition, multiplier, label) => {
  const effect = getActiveSpeedEffect(abilities, condition);
  assert.equal(effect?.multiplier, multiplier);
  assert.equal(effect?.label, label);
};

expectEffect(["Swift Swim"], "rain", 2, "Swift Swim");
expectEffect(["Chlorophyll"], "sun", 2, "Chlorophyll");
expectEffect(["Sand Rush"], "sand", 2, "Sand Rush");
expectEffect(["Slush Rush"], "snow", 2, "Slush Rush");
expectEffect(["Surge Surfer"], "electric-terrain", 2, "Surge Surfer");
expectEffect(["Unburden"], "unburden", 2, "Unburden");
expectEffect(["Quick Feet"], "status", 1.5, "Quick Feet");
expectEffect(["Protosynthesis"], "sun", 1.5, "Protosynthesis (Spe)");
expectEffect(["Quark Drive"], "electric-terrain", 1.5, "Quark Drive (Spe)");
expectEffect(["Quark Drive"], "booster-energy", 1.5, "Quark Drive (Spe)");
expectEffect([], "tailwind", 2, "Tailwind");
expectEffect(["Slow Start"], "slow-start", 0.5, "Slow Start");

assert.equal(getActiveSpeedEffect(["Swift Swim"], "sun"), null, "Swift Swim must not activate outside rain");
assert.equal(getActiveSpeedEffect(["Chlorophyll"], "none"), null, "Conditional abilities must be inactive by default");
assert.equal(applySpeedEffect(319, getActiveSpeedEffect(["Swift Swim"], "rain")), 638);
assert.equal(applySpeedEffect(319, getActiveSpeedEffect(["Quick Feet"], "status")), 478);

console.log("Speed tier activation rules passed");
