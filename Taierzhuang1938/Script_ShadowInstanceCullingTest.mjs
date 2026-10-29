import assert from "node:assert/strict";
import fs from "node:fs";
import { InstallShadowInstanceCulling } from "./Script_ShadowInstanceCulling.mjs";

let checks = 0;
const Check = (condition, label) => { assert.ok(condition, label); checks += 1; };
const Light = (id, type = "directional", pending = true, automatic = false) => ({ id,
  isDirectionalLight: type === "directional", isPointLight: type === "point", isSpotLight: type === "spot",
  shadow: { autoUpdate: automatic, needsUpdate: pending, map: null, updates: 0,
    camera: { isOrthographicCamera: type === "directional", prepared: false, projectionUpdates: 0, updateProjectionMatrix() { this.projectionUpdates += 1; } },
    updateMatrices() { this.updates += 1; this.camera.prepared = true; } } });

function Fixture(prime = true) {
  const calls = [], baked = [], scopes = [], scene = { sourceVisible: true }, camera = {};
  const renderer = { info: { render: { triangles: 0 } }, shadowMap: { enabled: true, autoUpdate: false, needsUpdate: true, type: "basic" } };
  const shadowMap = renderer.shadowMap;
  let previousType = shadowMap.type;
  shadowMap.render = function Native(lights, world, main) {
    calls.push({ ids: lights.map((light) => light.id), gate: shadowMap.needsUpdate, scoped: !world.sourceVisible, context: this, world, main });
    if (!this.enabled || (!this.autoUpdate && !this.needsUpdate) || !lights.length) return "early";
    if (this.type === "soft") this.type = "pcf";
    const typeChanged = previousType !== this.type;
    for (const light of lights) {
      const shadow = light.shadow;
      if (!shadow.autoUpdate && !shadow.needsUpdate) continue;
      if (world.throwLight === light.id) throw new Error("native failure");
      if (!shadow.map || typeChanged) shadow.map = { type: this.type };
      shadow.updateMatrices(light); shadow.needsUpdate = false; baked.push(light.id); renderer.info.render.triangles += 100;
    }
    shadowMap.needsUpdate = false;
    previousType = this.type;
    return "native";
  };
  const culler = { enabled: true, bypass: false, stats: {}, open: false,
    Begin(world, shadowCamera, main) {
      Check(shadowCamera.prepared, "scope must see the light's updated camera");
      Check(main === camera, "scope must retain the main camera for layers");
      Check(!this.open && world.sourceVisible, "scopes cannot overlap or leak hidden sources");
      this.open = true; world.sourceVisible = false; scopes.push(shadowCamera);
      this.stats = { trianglesSaved: 60, visibleInstances: 2, culledInstances: 3 };
      return () => { this.open = false; world.sourceVisible = true; };
    } };
  Check(InstallShadowInstanceCulling(renderer, culler), "install succeeds");
  if (prime) { shadowMap.render([Light(-1, "point")], scene, camera); calls.length = 0; baked.length = 0; renderer.info.render.triangles = 0; shadowMap.needsUpdate = true; }
  return { renderer, shadowMap, culler, calls, baked, scopes, scene, camera };
}
{
  const f = Fixture(false), lights = [Light(1), Light(2), Light(3)];
  f.shadowMap.render(lights, f.scene, f.camera);
  Check(f.calls.length === 1 && f.scopes.length === 0 && f.baked.length === 3, "first native call remains whole for shared type initialization");
  for (const type of ["pcf", "basic", "soft"]) {
    f.calls.length = 0; f.scopes.length = 0; f.shadowMap.type = type; f.shadowMap.needsUpdate = true; lights.forEach((light) => { light.shadow.needsUpdate = true; });
    f.shadowMap.render(lights, f.scene, f.camera);
    Check(f.calls.length === 1 && f.scopes.length === 0, "type transition retains one native multi-light call");
    Check(lights.every((light) => light.shadow.map.type === f.shadowMap.type), "native recreates every scheduled map on type transition");
  }
  f.calls.length = 0; f.scopes.length = 0; f.shadowMap.needsUpdate = true; lights.forEach((light) => { light.shadow.needsUpdate = true; });
  f.shadowMap.render(lights, f.scene, f.camera);
  Check(f.scopes.length === 3, "post-normalization actual type is remembered and ordinary compaction resumes");
}

{
  const f = Fixture(), lights = [Light(1), Light(2), Light(3)];
  let meterCalls = 0, meterTriangles = 0; const original = f.shadowMap.render;
  f.shadowMap.render = function(...args) { meterCalls += 1; const before = f.renderer.info.render.triangles; const result = original.apply(this, args); meterTriangles += f.renderer.info.render.triangles - before; return result; };
  Check(f.shadowMap.render(lights, f.scene, f.camera) === "native", "native return value retained");
  Check(JSON.stringify(f.baked) === "[1,2,3]" && f.calls.every((call) => call.gate), "all three scheduled cascades retain the global gate");
  Check(f.scopes.length === 3 && f.calls.every((call) => call.scoped), "each native directional draw uses its own scope");
  Check(f.calls.every((call) => call.context === f.shadowMap && call.world === f.scene && call.main === f.camera), "native this/scene/main-camera retained");
  Check(!f.shadowMap.needsUpdate && lights.every((light) => !light.shadow.needsUpdate), "native success consumes global and per-light gates");
  Check(f.scene.sourceVisible && !f.culler.open && f.culler.lastRender.trianglesSaved === 180, "sources restored and per-light savings accumulated");
  Check(meterCalls === 1 && meterTriangles === 300, "outer BakeMeter/profiler still sees one complete shadow call");
}
{
  const f = Fixture(), lights = [Light(1), Light(2, "directional", false), Light(3)];
  f.shadowMap.render(lights, f.scene, f.camera);
  Check(JSON.stringify(f.baked) === "[1,3]" && f.scopes.length === 2, "unscheduled cascade remains unscheduled");
  Check(lights[1].shadow.updates === 0 && lights[1].shadow.camera.projectionUpdates === 0, "unscheduled camera is untouched");
  Check(lights[0].shadow.updates === 2 && lights[2].shadow.updates === 2, "scope preparation and native matrix setup both run");
}
{
  const f = Fixture(), lights = [Light(1, "point"), Light(2), Light(3, "spot")];
  f.shadowMap.render(lights, f.scene, f.camera);
  Check(JSON.stringify(f.baked) === "[1,2,3]" && f.scopes.length === 1, "point and flare/spot shadows pass through once");
  Check(!f.calls[0].scoped && f.calls[1].scoped && !f.calls[2].scoped, "no duplicate point/flare compaction");
}
for (const change of ["disabled", "bypass", "globalClosed", "cullerDisabled", "noDirectional", "empty"]) {
  const f = Fixture(); let lights = [Light(1)];
  if (change === "disabled") f.shadowMap.enabled = false;
  if (change === "bypass") f.culler.bypass = true;
  if (change === "globalClosed") f.shadowMap.needsUpdate = false;
  if (change === "cullerDisabled") f.culler.enabled = false;
  if (change === "noDirectional") lights = [Light(1, "spot"), Light(2, "point")];
  if (change === "empty") lights = [];
  f.shadowMap.render(lights, f.scene, f.camera);
  Check(f.calls.length === 1 && f.scopes.length === 0 && f.scene.sourceVisible, `${change}: native early/pass-through does not mutate visibility`);
}
{
  const f = Fixture(), lights = [Light(1, "directional", false, true), Light(2, "directional", false, true)];
  f.shadowMap.autoUpdate = true; f.shadowMap.needsUpdate = false; f.shadowMap.render(lights, f.scene, f.camera);
  Check(JSON.stringify(f.baked) === "[1,2]" && f.scopes.length === 2, "automatic global and per-light updates remain automatic");
  Check(f.shadowMap.autoUpdate && lights.every((light) => light.shadow.autoUpdate) && !f.shadowMap.needsUpdate, "autoUpdate configuration remains unchanged");
}
{
  const f = Fixture(), lights = [Light(1), Light(2), Light(3)]; f.scene.throwLight = 2;
  assert.throws(() => f.shadowMap.render(lights, f.scene, f.camera), /native failure/); checks += 1;
  Check(f.scene.sourceVisible && !f.culler.open && f.shadowMap.needsUpdate, "native exception restores source scope and pending global gate");
  Check(!lights[0].shadow.needsUpdate && lights[1].shadow.needsUpdate && lights[2].shadow.needsUpdate, "exception preserves native completed/pending light state");
}
{
  const f = Fixture(), installed = f.shadowMap.render;
  Check(!InstallShadowInstanceCulling(f.renderer, f.culler) && f.shadowMap.render === installed, "installation is idempotent");
  Check(!InstallShadowInstanceCulling(null, f.culler) && !InstallShadowInstanceCulling({}, f.culler), "missing renderer is harmless");
}
const main = fs.readFileSync(new URL("./Script_Main.mjs", import.meta.url), "utf8");
Check(main.indexOf("InstallShadowInstanceCulling(renderer, shadowInstanceCulling)") < main.indexOf("new FrameProfiler("), "production wrapper installed inside profiler");
Check(main.indexOf("InstallShadowInstanceCulling(renderer, shadowInstanceCulling)") < main.indexOf("new LightRig("), "production wrapper installed inside native CSM BakeMeter");
console.log(`PASS ShadowInstanceCullingTest ${checks} checks`);
