import assert from "node:assert/strict";
import fs from "node:fs";
import { MakeTreePlacements, TreePlacementAllowed, TreeBlastDamage } from "./Data_BreakableTreePlacements.mjs";
import { BREAKABLE_TREES as T } from "./Data_Tuning_BreakableTrees.mjs";
const placements=MakeTreePlacements();
assert.equal(placements.length,84);
assert.deepEqual(placements,MakeTreePlacements());
assert.notDeepEqual(placements,MakeTreePlacements(T.seed+1));
for(const [i,p] of placements.entries()){
  assert.ok(TreePlacementAllowed(p),p.id);
  assert.ok(p.scale>=T.scaleMin&&p.scale<=T.scaleMax);
  for(const q of placements.slice(i+1))assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>=T.minSpacingM);
}
assert.ok(TreeBlastDamage(1,6,120)>=T.health);
assert.ok(TreeBlastDamage(5.9,6,120)<1);
for(const [d,r,h] of [[7,6,120],[0,0,120],[0,6,0]])assert.equal(TreeBlastDamage(d,r,h),0);
const bytes=fs.readFileSync(new URL("./Model/Model_BreakableDeadTree.glb",import.meta.url));
const g=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
assert.deepEqual(g.nodes.filter(n=>n.mesh!==undefined).map(n=>n.name).sort(),["Crown","Stump"]);
assert.equal(g.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+g.accessors[p.indices].count/3,0),12251);
assert.ok(bytes.length<14*1024*1024);
console.log("PASS BreakableTreesTest: 84 reproducible clear placements, blast falloff, actual split GLB budget");
