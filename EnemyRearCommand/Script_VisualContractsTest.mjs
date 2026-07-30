import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const threeUrl = pathToFileURL(path.join(moduleDirectory, "vendor", "three", "build", "three.module.mjs")).href;
const addonsDirectory = path.join(moduleDirectory, "vendor", "three", "examples", "jsm");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "three") return { url: threeUrl, shortCircuit: true };
    if (specifier.startsWith("three/addons/")) {
      return {
        url: pathToFileURL(path.join(addonsDirectory, specifier.slice("three/addons/".length))).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const THREE = await import("three");
const { ResolveStrategicSegments } = await import("./Script_Renderer.mjs");
const { ResolveStrategicLineStyle } = await import("./Script_Materials.mjs");
const { CreateWorkModel, DisposeModelCache } = await import("./Script_Models.mjs");
const { CreateEffects } = await import("./Script_Effects.mjs");

const state = {
  map: {
    frontLines: [
      { pathKeys: ["0,0", "1,0", "2,0"], side: "Enemy", status: "Contested" },
    ],
    transportCorridors: [
      { keys: ["0,1", "1,1", "2,1"], status: "Active" },
      { fromKey: "2,1", toKey: "2,0", status: "Cut" },
    ],
  },
  units: [{ id: "u1", key: "1,0", isolated: true }],
  enemies: [{ id: "e1", key: "2,0", supply: 0 }],
};

const visual = ResolveStrategicSegments(state);
assert.equal(visual.segments.length, 5);
assert.equal(visual.segments[0].styleKey, "FrontEnemy");
assert.equal(visual.segments.at(-1).styleKey, "SupplyCut");
assert.deepEqual(visual.isolatedKeys, ["1,0", "2,0"]);
assert.deepEqual(ResolveStrategicSegments({}), { segments: [], isolatedKeys: [] });

assert.equal(ResolveStrategicLineStyle("Supply", "Broken").key, "SupplyCut");
assert.equal(ResolveStrategicLineStyle("Front", "Active", "Player").key, "FrontPlayer");
assert.equal(ResolveStrategicLineStyle("Unknown", "Unknown").key, "FrontContested");

for (const kind of ["Bridge", "PassMarker", "SupplyNode"]) {
  const group = CreateWorkModel(kind);
  assert.equal(group.children.length, 1, `${kind} 应合并为单一 mesh`);
  assert.ok(group.children[0].geometry.getAttribute("position").count > 20, `${kind} 几何过于空洞`);
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const effects = CreateEffects(scene, camera, null, { seed: 20260730, quality: "low" });
for (const name of ["SpawnCombatPhase", "SpawnCoordination", "SpawnSuppression", "SpawnRetreat"]) {
  assert.equal(typeof effects[name], "function", `缺少战斗视觉入口 ${name}`);
}
effects.Dispose();
DisposeModelCache();

console.log(`Visual contracts passed · ${visual.segments.length} strategic segments · 1 batched strategic layer`);
