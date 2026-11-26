// Pure-Node unit tests for blade blood stain accumulation, drying, dripping, fling, and anchor selection.
import assert from "node:assert/strict";
import { BLADE_BLOOD_DYNAMICS as D, BLADE_PROFILES as P, BLADE_BLOOD_TEXTURE } from "./Data_Tuning_BladeBlood.mjs";
import {
  BladeBloodModel, ResolveBladeProfileKey, BladeStateKey, ResolveHitProfile, SelectLowestDripIndices,
} from "./Script_BladeBloodModel.mjs";

// 1. Profile & state key resolution
assert.equal(ResolveBladeProfileKey("Dadao"), "Dadao");
assert.equal(ResolveBladeProfileKey("Dadao", { procedural: true }), "DadaoBox");
assert.equal(ResolveBladeProfileKey("HanYang", { bayonet: true }), "BayonetHanYang");
assert.equal(ResolveBladeProfileKey("Type38", { bayonet: true }), "BayonetType38");
assert.equal(ResolveBladeProfileKey("ZhongZheng", { bayonet: true }), "BayonetZhongZheng");
assert.equal(ResolveBladeProfileKey("HanYang", { bayonet: false }), null);
assert.equal(BladeStateKey("Dadao"), "Dadao");
assert.equal(BladeStateKey("HanYang", { bayonet: true }), "Bayonet:HanYang");
assert.match(BLADE_BLOOD_TEXTURE, /\?v=/, "blade blood texture URL carries cache-bust ?v=");

// 2. Clean start & multi-hit accumulation (light -> heavy -> rip)
const model = new BladeBloodModel();
const clean = model.Snapshot("Dadao");
assert.equal(clean.coverage, 0);
assert.equal(clean.wetness, 0);
assert.equal(clean.hitCount, 0);

const light = model.RecordHit("Dadao", { kind: "light", sweep: 1 });
assert(light.state.coverage > 0.4 && light.state.coverage < 0.65, `light slash coverage: ${light.state.coverage}`);
assert(light.state.edge > light.state.coverage, "cutting edge gets denser blood than flat");
assert(light.state.wetness >= 0.75, "fresh cut is vividly wet");
assert(light.state.sideBias > 0, "positive sweep biases side asymmetry");
assert(light.flingBurst >= 1, "hit emits immediate burst");

const heavy = model.RecordHit("Dadao", { kind: "heavy", kill: true, sweep: -1 });
assert(heavy.state.coverage > light.state.coverage, "subsequent kill slash accumulates more blood");
assert(heavy.state.lengthReach > light.state.lengthReach, "deep kill slash reaches further back on blade");
assert.equal(heavy.state.hitCount, 2);

const rip = model.RecordHit("Dadao", { kind: "rip" });
assert(rip.state.coverage >= 0.95 && rip.state.edge >= 0.99, "rip saturates blade");

// 3. Real gravity dripping & pendant swelling while active
let totalDrips = 0;
let sawSwelling = false;
for (let i = 0; i < 600; i += 1) { // 10 seconds at 60Hz
  const ev = model.Step(1 / 60, { key: "Dadao", tipSpeedMps: 0.1, gravityDownAlign: 0.9 });
  totalDrips += ev.drips.length;
  const snap = model.Snapshot("Dadao");
  if (snap.pendants[0].active && snap.pendants[0].radiusM > D.pendantMinRadiusM * 1.5) sawSwelling = true;
}
assert(sawSwelling, "pendant blood droplet visibly swells on edge before detaching");
assert(totalDrips >= 5 && totalDrips <= 35, `10s dripping cadence realistic: ${totalDrips}`);
const afterDrip = model.Snapshot("Dadao");
assert(afterDrip.flowOffset > 0.1, `gravity rivulet flow advances while wet: ${afterDrip.flowOffset}`);
assert(afterDrip.wetness < 0.85, "wetness gradually decreases via drying + dripping");

// 4. Stowed blade persists stains but does not drip while holstered
const beforeStowDrips = afterDrip.dripsEmitted;
for (let i = 0; i < 180; i += 1) {
  const ev = model.Step(1 / 60, { key: "Bayonet:HanYang", tipSpeedMps: 0.2 });
  assert.equal(ev.drips.length, 0, "clean active bayonet emits no drips");
}
const afterStow = model.Snapshot("Dadao");
assert.equal(afterStow.dripsEmitted, beforeStowDrips, "stowed Dadao emits zero foreground drips");
assert(afterStow.coverage > 0.9, "stowed Dadao keeps its blood stain when switched back");

// 5. Rapid swing centrifugal blood-fling (respects post-hit grace so follow-through keeps fresh wetness)
model.RecordHit("Dadao", { kind: "heavy" });
const wetAfterImpact = model.Snapshot("Dadao").wetness;
const graceEv = model.Step(0.1, { key: "Dadao", tipSpeedMps: 6.8, gravityDownAlign: 0.8 });
assert.equal(graceEv.flings, 0, "immediate follow-through inside post-hit grace must not strip fresh blood");
for (let i = 0; i < 5; i += 1) model.Step(0.1, { key: "Dadao", tipSpeedMps: 0.1, gravityDownAlign: 0.8 });
const wetBeforeFling = model.Snapshot("Dadao").wetness;
assert(wetBeforeFling > wetAfterImpact * 0.9, "fresh wetness survives follow-through grace");
const flingEv = model.Step(1 / 60, { key: "Dadao", tipSpeedMps: 6.8, gravityDownAlign: 0.8 });
assert(flingEv.flings >= D.flingDropsMin && flingEv.flings <= D.flingDropsMax, `swing flings droplets: ${flingEv.flings}`);
assert(model.Snapshot("Dadao").wetness < wetBeforeFling, "flinging shakes off loose surface wetness");

// 6. Coagulation over time (dries into persistent dark residue, stops dripping)
const dryModel = new BladeBloodModel();
dryModel.RecordHit("Dadao", { kind: "light" });
for (let i = 0; i < 1200; i += 1) dryModel.Step(0.1, { key: "Dadao", tipSpeedMps: 0, gravityDownAlign: 0.5 }); // 120s
const dried = dryModel.Snapshot("Dadao");
assert(dried.wetness < D.dripMinWetness, `blood dries below drip threshold after 120s: ${dried.wetness}`);
assert(dried.coverage > 0.35, `dried battle stain remains visibly on steel: ${dried.coverage}`);
const dryEv = dryModel.Step(0.1, { key: "Dadao", tipSpeedMps: 0, gravityDownAlign: 0.8 });
assert.equal(dryEv.drips.length, 0, "dried blood no longer drips");

// 7. Bayonet independent tracking & reset
dryModel.RecordHit("Bayonet:HanYang", { kind: "heavy", bayonet: true });
assert(dryModel.Snapshot("Bayonet:HanYang").coverage > 0.8, "bayonet stains independently");
assert(ResolveHitProfile("light", { bayonet: true }).lengthReach < ResolveHitProfile("heavy", { bayonet: true }).lengthReach);
dryModel.Reset("Dadao");
assert.equal(dryModel.Snapshot("Dadao").coverage, 0, "single-blade reset clears Dadao");
assert(dryModel.Snapshot("Bayonet:HanYang").coverage > 0.8, "single-blade reset leaves Bayonet intact");
dryModel.Reset();
assert.equal(dryModel.Snapshot("Bayonet:HanYang").coverage, 0, "full reset clears all blades");

// 8. Lowest-gravity drip point selection respects bloody reach and real world Y
const dadaoPts = P.Dadao.dripPoints;
const tipLowYs = dadaoPts.map((_, i) => 1.0 + i * 0.08); // tip (idx 0) lowest
const pickTip = SelectLowestDripIndices("Dadao", 0.9, tipLowYs, 2);
assert.equal(pickTip[0], 0, "tip chosen when tip points down");
assert(pickTip.length === 2 && Math.abs(pickTip[1] - pickTip[0]) >= 2, "second pendant spaced apart");
const heelLowYs = dadaoPts.map((_, i) => 1.5 - i * 0.12); // heel (idx 5) lowest
const pickHeelShort = SelectLowestDripIndices("Dadao", 0.30, heelLowYs, 1);
assert(dadaoPts[pickHeelShort[0]][3] <= 0.38, "short tip-only stain never drips from clean heel");

console.log("PASS BladeBloodTest: profiles, multi-hit accumulation, gravity dripping, swing fling, coagulation, bayonet isolation, anchor selection");
