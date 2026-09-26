// Placement safety and camera composition against the actual mission geometry.
import assert from "node:assert/strict";
import { BuildDistantSmoke, FIRST_LEVEL_DISTANT_SMOKE as smoke } from "./Data_FirstLevelDistantSmoke.mjs";
import { MISSION_LAYOUT as layout, MISSION_ROUTES as routes } from "./Data_FirstLevelMissionLayout.mjs";
import { SPACE_KEYFRAMES } from "./Data_FirstLevelSpaceKeyframes.mjs";
import { SampleMissionTerrain as Ground } from "./Data_FirstLevelMissionTerrain.mjs";
import { Sight, Bearing, Eye } from "./Script_FirstLevelSpaceProbe.mjs";
import { VfxSystem } from "./Script_Vfx.mjs";
import { Mulberry32 } from "./Script_Noise.mjs";
import * as THREE from "three";
import { BattleSmoke, BuildBattleSmokeInstances } from "./Script_BattleSmoke.mjs";

function DistanceToSegment(p, a, b) {
  const x=b.x-a.x,z=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.z-a.z)*z)/(x*x+z*z||1)));
  return Math.hypot(p.x-a.x-x*t,p.z-a.z-z*t);
}
assert.deepEqual(BuildDistantSmoke(), smoke, "checkpoint rebuild preserves every world-space fire");
assert.notDeepEqual(BuildDistantSmoke(19380407), smoke, "seed scatters within the reference regions");
for (const source of smoke) {
  const {x,z,options:{backdrop:p}}=source, b=layout.bounds;
  assert.ok(x>b.minX&&x<b.maxX&&z>b.minZ&&z<b.maxZ, source.id+" is grounded on rendered terrain");
  for(const [name,route] of Object.entries(routes)) for(let i=1;i<route.length;i++) {
    // Smoke that reaches walking/head height stays outside the route corridor.
    // Higher crowns may project over the route; they are broad aerial smoke.
    for (const age of [0.1,0.3,0.5,0.7,0.9]) {
      const t=Math.min(1,age/.85),growth=t*t*(3-2*t);
      const size=(p.baseWidth+(p.crownWidth-p.baseWidth)*growth)*1.24;
      const center={x:x+p.driftX*Math.pow(age,1.3),z:z+p.driftZ*Math.pow(age,1.3)};
      const routeGround=Math.max(Ground(route[i-1].x,route[i-1].z),Ground(route[i].x,route[i].z));
      const bottom=Ground(x,z)+source.heightOffset+p.height*age-size*p.aspect*0.5;
      if(bottom>routeGround+4) continue;
      const margin=source.tier==="far"?10:2.5;
      assert.ok(DistanceToSegment(center,route[i-1],route[i])>size*0.62+p.spread*(0.15+age*age)+margin,
        source.id+" keeps low smoke clear of "+name+" age="+age);
    }
  }
  assert.ok(p.driftX<0&&Math.abs(p.driftZ)<12,"all plumes share the prevailing drift");
}
assert.equal(new Set(smoke.map(s=>s.options.backdrop.type)).size,4,"four distinct smoke silhouettes");
assert.ok(smoke.length>=28,"burning districts have continuous density rather than seven isolated wisps");
assert.ok(smoke.filter(s=>s.tier==="near").length>=20,"roads have nearby smoke throughout the map");
assert.ok(smoke.filter(s=>s.tier==="middle").length>=6,"midground links roadside and distant smoke");
assert.ok(smoke.some(s=>s.z>180),"roadside scatter extends beyond the front into the rear map");
for(const id of ["K6","K7","K9","K11"]) {
  const f=SPACE_KEYFRAMES.find(frame=>frame.id===id), eye=Eye(f.camera,f.camera.eyeM);
  const visible=smoke.filter(s=>{
    const p=s.options.backdrop, age=0.65;
    const crown={x:s.x+p.driftX*Math.pow(age,1.3),z:s.z+p.driftZ*Math.pow(age,1.3),
      y:Ground(s.x,s.z)+s.heightOffset+p.height*age};
    const angle=((Bearing(eye,crown)-Bearing(eye,f.look)+540)%360)-180;
    return Math.abs(angle)<40 && !Sight(eye,crown,{state:f.state});
  });
  assert.ok(visible.length>=3,id+" shows several overlapping smoke types above the geometry");
  console.log("ok",id,visible.map(s=>s.id).join(", "));
}
console.log("ok distant smoke: stable districts, layered views and route clearance",smoke.length);

// Exercise real emitter methods without a GPU: established smoke must return
// after warm-up/reset, while existing combat sources still use global wind.
const particles = [];
const pool = { Spawn(p, birth) { particles.push({ ...p, birth }); }, Clear() { particles.length = 0; } };
const vfx = Object.assign(Object.create(VfxSystem.prototype), {
  nextSourceId: 1, smokeSources: new Map(), spawnScale: 0.45, time: 100,
  random: Mulberry32(1938), wind: { x: 0.35, z: -0.15 },
  loadedVefectsMasks: new Set(["smoke", "noise"]), pools: { sourceSmoke: pool },
  bloodEffects: { Clear() {} },
  battleSmoke: new BattleSmoke({root:new THREE.Group(),shared:{},quality:"low"}),
});
const oldSource = vfx.SmokeSource({ x: 0, y: 0, z: 0 }, { rate: 1 });
vfx._UpdateSmokeSources(0.01);
assert.equal(particles.length, 0, "existing combat sources do not prewarm");
vfx._SpawnSourceSmoke(vfx.smokeSources.get(oldSource));
assert.equal(particles.at(-1).ax, vfx.wind.x * 0.5, "combat source retains global drift");
vfx.RemoveSmokeSource(oldSource);
pool.Clear();
const warmOptions={rate:2,life:8,prewarm:true,wind:{x:-1.2,z:0.1}};
const maxAmbient=Math.ceil(warmOptions.rate*vfx.spawnScale*warmOptions.life*1.25);
const warmHandle=vfx.SmokeSource({x:0,y:0,z:0},warmOptions);
vfx._UpdateSmokeSources(0.01);
assert.equal(particles.length, maxAmbient, "cold start fills a complete low-quality plume");
assert.ok(particles.every(p => p.birth < vfx.time && p.ax < 0), "aged plumes use their local wind");
assert.deepEqual(vfx.wind, { x: 0.35, z: -0.15 }, "ambient wind leaves the combat wind unchanged");
const count = particles.length;
vfx._UpdateSmokeSources(0.01);
assert.equal(particles.length, count, "prewarm runs once, not every frame");
vfx.ClearParticles();
assert.equal(particles.length, 0, "clearing still empties the pools immediately");
vfx.time = 0.1;
vfx._UpdateSmokeSources(0.01);
assert.equal(particles.length, maxAmbient, "checkpoint clock reset rebuilds established smoke");
assert.ok(particles.every(p => p.birth < vfx.time), "reset does not leave future-dated smoke");
assert.ok(particles.filter(p => p.birth + p.life > vfx.time).length > 4, "rebuilt columns contain live particles");
vfx.RemoveSmokeSource(warmHandle);
pool.Clear();
for(const s of smoke) vfx.SmokeSource({x:s.x,y:Ground(s.x,s.z),z:s.z},s.options);
vfx._UpdateSmokeSources(10);
vfx.battleSmoke.Update();
assert.equal(particles.length,0,"dense backdrop uses no combat particle slots");
assert.equal(vfx.battleSmoke.sources.size,smoke.length,"every emitter appears in the backdrop batch");
assert.ok(vfx.battleSmoke.geometry.instanceCount>=480&&vfx.battleSmoke.geometry.instanceCount<=600,"low quality retains roadside and far smoke in a bounded batch");
const ultra=BuildBattleSmokeInstances(vfx.battleSmoke.sources.values(),"ultra");
assert.ok(ultra.length<=1200,"ultra remains one bounded instanced draw");
for(const attribute of Object.values(vfx.battleSmoke.geometry.attributes)) {
  assert.ok(Array.from(attribute.array).every(Number.isFinite),"GPU attributes stay finite");
}
assert.equal(vfx.battleSmoke.material.transparent,true);
assert.equal(vfx.battleSmoke.material.depthWrite,false);
assert.equal(vfx.battleSmoke.mesh.userData.skipNormalDepth,true,"smoke is excluded from motion/depth prepass");
vfx.ClearParticles();
assert.equal(vfx.battleSmoke.mesh.visible,false,"warm-up cleanup immediately hides the batch");
vfx.battleSmoke.Update();
assert.equal(vfx.battleSmoke.mesh.visible,true,"persistent districts return on the next update");
for (const handle of [...vfx.smokeSources.keys()]) vfx.RemoveSmokeSource(handle);
vfx.ClearParticles();
vfx._UpdateSmokeSources(1);
vfx.battleSmoke.Update();
assert.equal(vfx.battleSmoke.geometry.instanceCount,0,"scene teardown removes the entire batch");
assert.equal(particles.length, 0, "teardown leaves no ghost smoke");
vfx.battleSmoke.Dispose();
console.log("ok smoke lifecycle: combat isolation, bounded density, cold start, clear, checkpoint clock and teardown");
