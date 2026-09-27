import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,"_shots/BreakableTrees");
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(path.resolve(here,".."),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on("pageerror",e=>errors.push(String(e)));
page.on("console",m=>{if(m.type()==="error")console.log("BROWSER",m.text().slice(0,300));});
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&missionStage=3&quality=high&scale=small`,{timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state.ready,null,{timeout:240000});
  const initial=await page.evaluate(async()=>{
    const g=window.Tengxian,trees=g.battlefield.breakableTrees;
    const tree=trees.trees.find(t=>t.region==="Village");window.treeProbe=tree;
    const {Vector3}=await import("three");
    const hit=g.physics.Raycast(new Vector3(tree.x-3,tree.y+2,tree.z),new Vector3(1,0,0),6);
    g.player.Spawn(tree.x-10,tree.z+13,Math.atan2(-10,13));g.player.pitch=0.08;
    g.StepFrames(3,0,true);
    const sight=new Vector3(tree.x,tree.y+3,tree.z).sub(g.camera.position);
    const cameraHit=g.physics.Raycast(g.camera.position,sight.clone().normalize(),sight.length());
    // Distance detail: one draw per member, caps only on broken stumps, crowns only on standing trees.
    const members=new Map();
    for(const b of trees.root.children)if(b.isInstancedMesh){const k=b.name.replace(/^Trees_[^_]+_[^_]+_/,"");members.set(k,(members.get(k)||0)+(b.visible?b.count:0));}
    return {snapshot:trees.Snapshot(),collider:hit?.box?.id,expected:tree.trunk.id,probeLod:tree.lod,members:Object.fromEntries(members),
      cameraHit:cameraHit?.box?.id,
      triangles:g.renderer.info.render.triangles,calls:g.renderer.info.render.calls};
  });
  assert.equal(initial.snapshot.count,84);assert.equal(initial.snapshot.broken,0);
  assert.equal(initial.probeLod,0,"the tree 16 m away draws at full detail");
  assert.ok(initial.snapshot.lod[0]<12&&initial.snapshot.lod.slice(2).reduce((a,b)=>a+b,0)>40,"distant trees use the clustered copies: "+initial.snapshot.lod);
  assert.equal(initial.members.StumpCap_L0||0,0,"standing trees hide their fracture caps");
  for(const part of ["Stump","Crown"])assert.equal(initial.snapshot.lod.reduce((n,_,l)=>n+(initial.members[`${part}_L${l}`]||0),0),84,part+" is drawn exactly once per tree");
  assert.equal(initial.collider,initial.expected,"standing trunk has a real Rapier collider");
  assert.equal(initial.cameraHit,initial.expected,"capture camera has an unobstructed view of the tree");
  await page.screenshot({path:path.join(out,"Image_TreesIntact.png")});
  const broken=await page.evaluate(async()=>{
    const g=window.Tengxian,tree=window.treeProbe,{Vector3}=await import("three");
    g.combat.Blast(new Vector3(tree.x-1,tree.y+0.8,tree.z),6,160,"shell");
    const hit=g.physics.Raycast(new Vector3(tree.x-3,tree.y+2,tree.z),new Vector3(1,0,0),6);
    const snapshot=g.battlefield.breakableTrees.Snapshot();
    const drawn=part=>tree.sector.batches.reduce((n,{batch})=>n+(batch.name.includes(`_${part}_`)&&batch.visible?batch.count:0),0);
    const sectorDraws={cap:drawn("StumpCap"),crown:drawn("Crown"),stump:drawn("Stump"),trees:tree.sector.trees.length};
    g.StepFrames(45,1/60,false);g.StepFrames(1,0,true);
    return {snapshot,sectorDraws,oldCollider:hit?.box?.id||null,stumpHandle:tree.stump._physicsHandle,
      moved:tree.fallen?.quaternion.toArray(),body:!!tree.body};
  });
  assert.equal(broken.snapshot.broken,1);
  assert.deepEqual([broken.sectorDraws.cap,broken.sectorDraws.crown,broken.sectorDraws.stump],[1,broken.sectorDraws.trees-1,broken.sectorDraws.trees],"a broken tree keeps its stump, shows its cap and loses its standing crown");assert.equal(broken.snapshot.activeBodies,1);
  assert.notEqual(broken.oldCollider,initial.expected);assert.ok(broken.body);
  await page.screenshot({path:path.join(out,"Image_TreeBreaking.png")});
  const fallen=await page.evaluate(()=>{
    const g=window.Tengxian,trees=g.battlefield.breakableTrees,tree=window.treeProbe;
    // Continue the same production frame loop, including Physics.Step and Combat.Update.
    g.StepFrames(900,1/60,false);g.StepFrames(8,0,true);
    const snapshot=trees.Snapshot();
    let minGap=Infinity;
    for(const point of trees.support){
      const v=point.clone().applyMatrix4(tree.fallen.matrixWorld);
      minGap=Math.min(minGap,v.y-g.battlefield.GroundHeight(v.x,v.z));
    }
    return {snapshot,minGap,quaternion:tree.fallen.quaternion.toArray(),
      linked:g.renderer.info.programs.every(p=>g.renderer.getContext().getProgramParameter(p.program,g.renderer.getContext().LINK_STATUS))};
  });
  assert.equal(fallen.snapshot.activeBodies,0);assert.ok(fallen.minGap>=-0.08&&fallen.minGap<0.4,JSON.stringify(fallen));
  assert.ok(Math.hypot(fallen.quaternion[0],fallen.quaternion[2])>0.45,"crown actually topples");
  assert.ok(fallen.linked);
  await page.screenshot({path:path.join(out,"Image_TreeFallen.png")});
  const lifecycle=await page.evaluate(async()=>{
    const g=window.Tengxian,system=g.battlefield.breakableTrees,tree=system.trees.find(t=>!t.broken);
    const {Vector3}=await import("three");
    // A real wall must shield the tree; repeat blasts must not duplicate detached crowns.
    const wall={c:[tree.x-1,tree.y+2,tree.z],h:[.1,3,2],ry:0,tag:"whiteboxWall"};
    const handle=g.physics.AddSolid(wall);g.physics.RefreshStaticQueries();
    const shielded=system.Blast(new Vector3(tree.x-2,tree.y+1,tree.z),6,999);
    g.physics.RemoveSolid(handle);g.physics.RefreshStaticQueries();
    system.Blast(new Vector3(window.treeProbe.x,window.treeProbe.y+1,window.treeProbe.z),6,999);
    const count=system.Snapshot().broken,root=system.root;
    const bodiesBefore=g.physics.dynamics.size;
    system.Break(tree,new Vector3(tree.x-1,tree.y+1,tree.z));
    const bodiesDuring=g.physics.dynamics.size;
    system.Dispose();
    return {shielded,count,detached:!root.parent,bodiesBefore,bodiesDuring,bodiesAfter:g.physics.dynamics.size};
  });
  assert.equal(lifecycle.shielded,0);assert.equal(lifecycle.count,1);assert.ok(lifecycle.detached);
  assert.equal(lifecycle.bodiesDuring,lifecycle.bodiesBefore+1);assert.equal(lifecycle.bodiesAfter,lifecycle.bodiesBefore);
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,"Data_Verification.json"),JSON.stringify({initial,broken,fallen,lifecycle,errors},null,2));
  console.log("PASS BreakableTreesBrowserTest",JSON.stringify({count:84,broken:fallen.snapshot.broken,minGap:fallen.minGap,lifecycle}));
}catch(error){
  await page.screenshot({path:path.join(out,"Image_Failure.png")}).catch(()=>{});
  console.error(await page.evaluate(()=>({boot:document.querySelector("#bootText")?.textContent,errors:document.body.innerText.slice(-1200)})).catch(()=>{}));
  throw error;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
