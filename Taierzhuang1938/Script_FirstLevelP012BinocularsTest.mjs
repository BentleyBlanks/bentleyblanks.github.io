// Pure Node: execute the presentation against real Three geometry, without WebGL.
import assert from "node:assert/strict";
import fs from "node:fs";
const core=fs.readFileSync(new URL("./vendor/three/build/three.core.js",import.meta.url),"utf8");
const url=`data:text/javascript;base64,${Buffer.from(core).toString("base64")}`;
const THREE=await import(url);
const source=fs.readFileSync(new URL("./Script_FirstLevelP012Binoculars.mjs",import.meta.url),"utf8")
 .replace('from "three"',`from "${url}"`)
 .replace('import { MarkForegroundPrepass } from "./Script_Post.mjs";',"const MarkForegroundPrepass = root => root;");
const {FirstLevelP012Binoculars,P012BinocularLensContains}=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
for(const aspect of [16/9,9/16,1,32/9]) {
  assert.equal(P012BinocularLensContains(0,0,aspect),true,"lens centre is clear at every aspect");
  assert.equal(P012BinocularLensContains(.95,.95,aspect),false,"masked corners never count as visible subjects");
}
assert.equal(P012BinocularLensContains(.7,0,16/9),false,"wide-screen black side rim is not recognition area");
assert.equal(P012BinocularLensContains(.5,0,16/9),true,"visible outer lens may recognize a subject");
assert.equal(P012BinocularLensContains(0,.9,16/9),false,"top black rim is excluded");
assert.equal(P012BinocularLensContains(0,0,0),false);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(55,16/9,.05,500);
scene.add(camera);camera.rotation.set(.1,.2,.3);
const matrix=camera.projectionMatrix.toArray(),rotation=camera.rotation.toArray();
const component=new FirstLevelP012Binoculars({camera,scene});
assert.equal(component.mask,undefined,"headless construction has no DOM dependency");
assert.equal(component.root.parent,camera);
assert.equal(component.root.children.length,5,"two barrels, two eyepieces, one bridge");
component.Update({owned:true,raised:false},.016);
assert.equal(component.root.visible,true,"owned lowered binoculars are physically visible");
const projected=component.root.position.clone().project(camera);
assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1,"lowered model centre is inside view");
component.Update({owned:true,raised:true},.016);
assert.equal(component.root.visible,false,"raised prop does not obscure central sight");
assert.deepEqual(camera.rotation.toArray(),rotation);assert.deepEqual(camera.projectionMatrix.toArray(),matrix);
assert.equal(camera.fov,55);assert.equal(camera.parent,scene);
let disposed=0;
for(const resource of [...component.geometries,...component.materials])resource.addEventListener("dispose",()=>disposed++);
component.Dispose();component.Dispose();component.Update({owned:true},1);
assert.equal(disposed,7,"owned geometry/materials disposed exactly once");
assert.equal(component.root.parent,null);assert.equal(camera.parent,scene);
let removed=0,appended=0;
globalThis.document={createElement:()=>({style:{},setAttribute(){},remove(){removed++;}}),body:{appendChild(){appended++;}}};
const domComponent=new FirstLevelP012Binoculars({camera,scene});
assert.equal(appended,1);
domComponent.Update({owned:true,raised:true},.1);
assert.equal(domComponent.mask.style.display,"block");
assert.equal(domComponent.mask.style.pointerEvents,"none");
assert.equal(domComponent.mask.style.maskComposite,"intersect");
assert.equal((domComponent.mask.style.maskImage.match(/radial-gradient/g)||[]).length,2);
domComponent.Update({owned:false,raised:true},.1);assert.equal(domComponent.mask.style.display,"none");
domComponent.Dispose();assert.equal(removed,1);delete globalThis.document;
console.log("PASS P012 binoculars ownership, visible lowered geometry, camera isolation, mask and disposal");
