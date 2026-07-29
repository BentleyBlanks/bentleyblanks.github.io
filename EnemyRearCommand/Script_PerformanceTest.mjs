import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import * as Rules from "./Script_Rules.mjs";
import * as Supply from "./Script_Supply.mjs";

function Measure(label, operation) {
  const startedAt = performance.now();
  const value = operation();
  const elapsedMs = performance.now() - startedAt;
  console.log(`${label}: ${elapsedMs.toFixed(1)} ms`);
  return { value, elapsedMs };
}

function RunCampaign(seed) {
  let state = Rules.CreateInitialState({ seed, difficulty: "Normal" });
  while (!state.over && state.turn < 32) state = Rules.EndTurn(state).nextState;
  return state;
}

const initial = Measure("CreateInitialState", () => Rules.CreateInitialState({
  seed: 20260730,
  difficulty: "Normal",
}));

const supply = Measure("ComputeSupplyNetwork x20", () => {
  let checksum = 0;
  for (let index = 0; index < 20; index += 1) {
    checksum += Supply.ComputeSupplyNetwork(
      initial.value,
      index % 2 === 0 ? "Resistance" : "Enemy",
    ).suppliedKeys.length;
  }
  return checksum;
});

const supplyRefresh = Measure("Rules.RecomputeSupply x20", () => {
  const probe = Rules.CloneState(initial.value);
  for (let index = 0; index < 20; index += 1) Rules.RecomputeSupply(probe, false);
  return probe.supply;
});
assert.ok(supplyRefresh.value?.resistance, "supply refresh must populate both network summaries");

const campaign = Measure("Deterministic 32-turn campaign", () => RunCampaign(20260730));
assert.equal(campaign.value.turn, 32, "benchmark must simulate all 32 turns");
assert.equal(campaign.value.over, true, "benchmark campaign must reach its ending");

const repeat = Measure("Determinism replay", () => RunCampaign(20260730));
assert.deepEqual(
  repeat.value.result,
  campaign.value.result,
  "performance optimizations must preserve deterministic results",
);
assert.deepEqual(
  repeat.value.ledger,
  campaign.value.ledger,
  "performance optimizations must preserve the people's cost ledger",
);
assert.equal(repeat.value.rngState, campaign.value.rngState);

const rendererSource = Measure("Rendering-budget contract", () => (
  readFileSync(new URL("./Script_Renderer.mjs", import.meta.url), "utf8")
));
assert.match(
  rendererSource.value,
  /nextStrategicSignature\s*!==\s*strategicSignature/,
  "strategic overlay geometry must rebuild only when its state signature changes",
);
assert.match(
  rendererSource.value,
  /Math\.min\(devicePixelRatio,\s*cap\)/,
  "renderer pixel ratio must remain capped by the active quality profile",
);
assert.match(
  rendererSource.value,
  /fixed only increases once draw call|固定只增加一次 draw call/,
  "strategic overlays must remain merged into a single draw call",
);

// Generous regression budgets: these catch accidental O(VE) / clone explosions without
// turning normal CI variance into noise. The smoke suite still owns gameplay coverage.
assert.ok(supply.elapsedMs < 15_000, "20 supply-network analyses exceeded the 15 s budget");
assert.ok(supplyRefresh.elapsedMs < 15_000, "20 rules-layer supply refreshes exceeded the 15 s budget");
assert.ok(campaign.elapsedMs < 60_000, "32-turn campaign exceeded the 60 s budget");
assert.ok(repeat.elapsedMs < 60_000, "determinism replay exceeded the 60 s budget");
assert.ok(rendererSource.elapsedMs < 250, "rendering-budget contract inspection exceeded 250 ms");

console.log("Performance contracts passed.");
