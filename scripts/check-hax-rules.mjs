import assert from "node:assert/strict";
import {
  isGuaranteedHaxOutcome,
  usesExpandedHaxRules,
} from "../src/lib/hax-rules.ts";

assert.equal(usesExpandedHaxRules(11, 1), false, "Season 11 Weeks 1-5 use legacy rules");
assert.equal(usesExpandedHaxRules(11, 6), true, "Season 11 Week 6 uses expanded rules");
assert.equal(usesExpandedHaxRules(12, 1), true, "Season 12+ uses expanded rules");

assert.equal(isGuaranteedHaxOutcome("flinch", "Fake Out"), true);
assert.equal(isGuaranteedHaxOutcome("flinch", "Iron Head"), false);
assert.equal(isGuaranteedHaxOutcome("crit", "Flower Trick"), true);
assert.equal(isGuaranteedHaxOutcome("crit", "Frost Breath"), true);
assert.equal(isGuaranteedHaxOutcome("crit", "Storm Throw"), true);
assert.equal(isGuaranteedHaxOutcome("crit", "Surging Strikes"), true);
assert.equal(isGuaranteedHaxOutcome("crit", "Wicked Blow"), true);
assert.equal(isGuaranteedHaxOutcome("crit", "Zippy Zap"), true);
assert.equal(isGuaranteedHaxOutcome("crit", "Night Slash"), false);

console.log("Season 11+ HAX rule check passed");
