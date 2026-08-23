import assert from "node:assert/strict";
import {
  getDistinctHeldItemNames,
  isKnockedOffBerryReveal,
  shouldCountHeldItemReveal,
} from "../src/lib/revealed-items";

const knockedOffBerry = { item: "Sitrus Berry", source: "move: Knock Off" };
assert.equal(isKnockedOffBerryReveal(knockedOffBerry), true);
assert.equal(shouldCountHeldItemReveal(knockedOffBerry), false);
assert.deepEqual(getDistinctHeldItemNames([knockedOffBerry]), []);

for (const source of ["consumed", "activation", "item effect"]) {
  assert.equal(
    shouldCountHeldItemReveal({ item: "Sitrus Berry", source }),
    true,
    `A berry revealed by ${source} must count as a successful use`,
  );
}

assert.equal(
  shouldCountHeldItemReveal({ item: "Choice Scarf", source: "move: Knock Off" }),
  true,
  "Knock Off should still reveal and count non-berry held items",
);
assert.equal(
  shouldCountHeldItemReveal({ item: "Leftovers", source: "move: Trick" }),
  false,
  "Items received through Trick must remain excluded",
);

console.log("Revealed item counting checks passed");
