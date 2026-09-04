// Pure Node integration seams: execute the actual Main inventory/input functions
// with deterministic peripherals. This is not a browser animation or full-run test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { DebugOptions } from "./Script_DebugOptions.mjs";
import { AmmoReadout } from "./Script_Hud.mjs";
import { AllowP012InfiniteAmmo, SyncP012ActiveMagazine, CompleteP012ManualReload, RestoreP012ManualReload } from "./Script_FirstLevelP012Opening.mjs";

const main = readFileSync(new URL("./Script_Main.mjs", import.meta.url), "utf8");
function MainFunction(name) {
  const match = main.match(new RegExp(`function ${name}\\([^]*?\\n}`));
  assert.ok(match, `Main ${name} remains executable by the integration seam`);
  return match[0];
}
const store = new Map([["tengxian1938_debug_options_v1", JSON.stringify({ infiniteAmmo: true })]]);
const debugOptions = new DebugOptions({ getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) });
assert.equal(debugOptions.Enabled("infiniteAmmo"), true, "reproduce an existing user's persisted debug setting");
let busy = false;
const state = { activeSlot: "primary", slots: { primary: "HanYang" }, mags: { primary: { ammo: 0, clips: 0 } }, ammo: 0, clips: 0, playerShots: 0, grenades: 0 };
const context = vm.createContext({ state, debugOptions, currentWeapon: "HanYang", p012Runtime: null,
  WEAPONS: { HanYang: { magazine: 5 } }, AllowP012InfiniteAmmo, SyncP012ActiveMagazine, CompleteP012ManualReload,
  player: { Alive: true, Busy: false, InWater: false }, viewmodel: { IsBusy: () => busy, TriggerReload: () => { busy = true; } },
  audio: { Play() {} }, hud: { Hint() {} }, fireCooldown: 0, fireEdge: true,
  emplacement: null, carry: null, input: { fire: true }, BeginMeleeCharge: () => { state.meleeCharge = true; },
});
vm.runInContext(["EffectiveInfiniteAmmo", "EnsureDebugInventory", "Reload", "TryFire"].map(MainFunction).join("\n"), context);
context.EnsureDebugInventory();
assert.equal(state.ammo, 5, "ordinary chapters retain the existing debug refill");

context.p012Runtime = { weaponActionCount: 0 };
state.ammo = 0; state.clips = 0; SyncP012ActiveMagazine(state);
for (let frame = 0; frame < 600; frame++) context.EnsureDebugInventory();
assert.deepEqual([state.ammo, state.clips, state.mags.primary.ammo], [0, 0, 0], "issued empty rifle stays empty despite persisted infiniteAmmo");
context.TryFire(1 / 60);
assert.equal(state.playerShots, 0, "actual Main trigger cannot bypass an empty issued chamber");
assert.equal(context.Reload(), false, "R before real ammunition issue cannot load free rounds");
state.meleeCharge = null;
state.clips = 3; SyncP012ActiveMagazine(state);
context.EnsureDebugInventory();
assert.deepEqual([state.ammo, state.clips], [0, 3]);
assert.deepEqual([AmmoReadout({ ...state, magazine: 5 }).current, AmmoReadout({ ...state, magazine: 5 }).reserve], ["00", "15"]);
assert.equal(context.Reload(), true, "actual optional R consumes real reserve");
assert.deepEqual([state.ammo, state.clips], [5, 2]);
assert.deepEqual([state.mags.primary.ammo,state.mags.primary.clips],[5,2],"actual R synchronizes the active slot ledger");
assert.equal(context.p012Runtime.manualReloadPending, true);
assert.equal(context.EffectiveInfiniteAmmo(), false, "R down is not reload completion");
const reloadCompletion = main.match(/if \(p012Runtime\.weaponActionPending && !viewmodel\.IsBusy\?\.\(\)\) \{[^]*?\n    }/)?.[0];
assert.ok(reloadCompletion, "real Frame completion seam exists");
vm.runInContext(reloadCompletion, context);
assert.equal(context.EffectiveInfiniteAmmo(), false, "busy reload animation cannot grant completion");
busy = false;
vm.runInContext(reloadCompletion, context);
assert.equal(context.p012Runtime.weaponActionCount, 1);
assert.equal(context.EffectiveInfiniteAmmo(), true, "completed normal reload restores the unchanged debug preference");
assert.equal(debugOptions.Enabled("infiniteAmmo"), true, "P012 never rewrites the user's global debug preference");

RestoreP012ManualReload(context.p012Runtime, { manualReloadCompleted: false });
state.ammo = 0; state.clips = 3; SyncP012ActiveMagazine(state);
context.EnsureDebugInventory();
assert.deepEqual([state.ammo, state.clips, state.mags.primary.ammo, state.mags.primary.clips], [0, 3, 0, 3], "checkpoint restores both ledgers without inventing a loaded chamber");
assert.equal(context.p012Runtime.weaponActionPending, false);
RestoreP012ManualReload(context.p012Runtime, { manualReloadCompleted: true });
assert.equal(context.EffectiveInfiniteAmmo(), true, "post-reload checkpoint retains its completion receipt");
context.p012Runtime = {};
assert.equal(context.EffectiveInfiniteAmmo(), false, "new run starts unissued, not with an old reload receipt");
state.ammo = 5; state.clips = 0;
assert.equal(context.Reload(), true, "existing full-magazine bolt inspection remains available");
busy = false;
vm.runInContext(reloadCompletion, context);
assert.equal(context.EffectiveInfiniteAmmo(), false, "bolt inspection without consuming reserve does not unlock infinite ammunition");
state.activeSlot = "melee";
assert.equal(SyncP012ActiveMagazine(state), false, "non-firearm slots do not acquire a magazine ledger");
console.log("FirstLevelP012OpeningTest PASS: persisted debug, real Main input seams, HUD and checkpoint magazine ledgers");
