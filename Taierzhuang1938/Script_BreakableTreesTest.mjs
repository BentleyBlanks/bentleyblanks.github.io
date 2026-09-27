import assert from "node:assert/strict";
import fs from "node:fs";
import { MakeTreePlacements, TreePlacementAllowed, TreeBlastDamage } from "./Data_BreakableTreePlacements.mjs";
import { BREAKABLE_TREES as T } from "./Data_Tuning_BreakableTrees.mjs";
import { EXTERNAL_GLB_STANDARDS } from "./Data_AssetStandards.mjs";
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
assert.deepEqual(g.materials.map(m=>m.name).sort(),["Material_DeadTreeBark","Material_FracturedWood"],
  "runtime LOD identifies fracture caps by their stable material name");
const triangles=g.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+g.accessors[p.indices].count/3,0);
const report=JSON.parse(fs.readFileSync(new URL("./Model/Data_TreeProcessing.json",import.meta.url)));
const standard=EXTERNAL_GLB_STANDARDS.find(s=>s.id==="BreakableDeadTree");
assert.ok(triangles>0&&triangles<=5000,"5K includes both stump and crown, including fracture caps");
assert.equal(triangles,report.totalTriangles);
assert.equal(triangles,standard.actualTriangles);
assert.equal(standard.targetTriangles,5000);
assert.deepEqual(report.sourceFiles.map(s=>s.file),["Tree_50k_2.fbx","Tree_50k_3.fbx"]);
for(const source of report.sourceFiles){
  assert.equal(source.sourceTriangles,50000);
  assert.equal(source.outputTriangles,triangles);
  assert.equal(source.geometryUvSha256,report.sourceFiles[0].geometryUvSha256);
  assert.deepEqual(source.textureSha256,report.sourceFiles[0].textureSha256);
}
assert.ok(bytes.length<14*1024*1024);
console.log("PASS BreakableTreesTest: 84 reproducible clear placements, blast falloff, actual split GLB budget");
