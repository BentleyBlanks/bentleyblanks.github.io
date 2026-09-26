// Placement safety and camera composition against the actual mission geometry.
import assert from "node:assert/strict";
import { BuildDistantSmoke, FIRST_LEVEL_DISTANT_SMOKE as smoke } from "./Data_FirstLevelDistantSmoke.mjs";
import { MISSION_LAYOUT as layout, MISSION_ROUTES as routes } from "./Data_FirstLevelMissionLayout.mjs";
import { SPACE_KEYFRAMES } from "./Data_FirstLevelSpaceKeyframes.mjs";
import { SampleMissionTerrain as Ground } from "./Data_FirstLevelMissionTerrain.mjs";
import { Sight, Bearing, Eye } from "./Script_FirstLevelSpaceProbe.mjs";
import { VfxSystem } from "./Script_Vfx.mjs";
import { Mulberry32 } from "./Script_Noise.mjs";

function DistanceToSegment(p, a, b) {
  const x=b.x-a.x,z=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.z-a.z)*z)/(x*x+z*z||1)));
  return Math.hypot(p.x-a.x-x*t,p.z-a.z-z*t);
}
assert.deepEqual(BuildDistantSmoke(), smoke, "checkpoint rebuild preserves every world-space fire");
assert.notDeepEqual(BuildDistantSmoke(19380407), smoke, "seed scatters within the reference regions");
for (const source of smoke) {
  const {x,z,options:o}=source, b=layout.bounds;
  assert.ok(x>b.minX&&x<b.maxX&&z>b.minZ&&z<b.maxZ, source.id+" is grounded on rendered terrain");
  for(const [name,route] of Object.entries(routes)) for(let i=1;i<route.length;i++) {
    assert.ok(DistanceToSegment(source,route[i-1],route[i])>o.sizeEnd*1.2+20,
      source.id+" keeps its widest plume away from "+name);
  }
  assert.ok(o.wind.x<0&&Math.abs(o.wind.z)<0.5,"all plumes share the prevailing drift");
}
// Reserve at least 1/4 of the smallest low-quality source pool for tanks, guns
// and scripted bursts. Worst-case smoke lifespan includes the emitter's jitter.
const maxAmbient = smoke.reduce((sum,s)=>sum+Math.ceil(s.options.rate*0.45*s.options.life*1.25),0);
assert.ok(maxAmbient<=Math.floor(2200*0.35*0.08)*0.75, "low/small retains combat particle headroom");
for(const id of ["K6","K7","K9","K11"]) {
  const f=SPACE_KEYFRAMES.find(frame=>frame.id===id), eye=Eye(f.camera,f.camera.eyeM);
  const visible=smoke.filter(s=>{
    const o=s.options, age=o.life*0.65;
    const crown={x:s.x+o.wind.x*age*0.8,z:s.z+o.wind.z*age*0.8,y:Ground(s.x,s.z)+o.rise*age};
    const angle=((Bearing(eye,crown)-Bearing(eye,f.look)+540)%360)-180;
    return Math.abs(angle)<40 && !Sight(eye,crown,{state:f.state});
  });
  assert.ok(visible.length>=1,id+" has a visible distant plume above the geometry");
  console.log("ok",id,visible.map(s=>s.id).join(", "));
}
console.log("ok distant smoke: stable placement, route clearance and low-quality headroom",maxAmbient);

// Exercise real emitter methods without a GPU: established smoke must return
// after warm-up/reset, while existing combat sources still use global wind.
const particles = [];
const pool = { Spawn(p, birth) { particles.push({ ...p, birth }); }, Clear() { particles.length = 0; } };
const vfx = Object.assign(Object.create(VfxSystem.prototype), {
  nextSourceId: 1, smokeSources: new Map(), spawnScale: 0.45, time: 100,
  random: Mulberry32(1938), wind: { x: 0.35, z: -0.15 },
  loadedVefectsMasks: new Set(["smoke", "noise"]), pools: { sourceSmoke: pool },
  bloodEffects: { Clear() {} },
});
const oldSource = vfx.SmokeSource({ x: 0, y: 0, z: 0 }, { rate: 1 });
vfx._UpdateSmokeSources(0.01);
assert.equal(particles.length, 0, "existing combat sources do not prewarm");
vfx._SpawnSourceSmoke(vfx.smokeSources.get(oldSource));
assert.equal(particles.at(-1).ax, vfx.wind.x * 0.5, "combat source retains global drift");
vfx.RemoveSmokeSource(oldSource);
pool.Clear();
for (const s of smoke) vfx.SmokeSource({ x: s.x, y: 0, z: s.z }, s.options);
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
assert.ok(particles.filter(p => p.birth + p.life > vfx.time).length > 20, "rebuilt columns contain live particles");
for (const handle of [...vfx.smokeSources.keys()]) vfx.RemoveSmokeSource(handle);
vfx.ClearParticles();
vfx._UpdateSmokeSources(1);
assert.equal(particles.length, 0, "teardown leaves no ghost smoke");
console.log("ok smoke lifecycle: local/global wind, cold start, clear, checkpoint clock and teardown");
