import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
const TREE_COUNT=130;
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,"_shots/BreakableTrees");
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(path.resolve(here,".."),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on("pageerror",e=>errors.push(String(e)));
page.on("console",m=>{if(m.type()==="error")console.log("BROWSER",m.text().slice(0,300));});
try {
  const origin=process.env.TREE_PREVIEW_ORIGIN||`http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&missionStage=3&quality=high&scale=small`,{timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state.ready,null,{timeout:240000});
  const replacements=await page.evaluate(()=>{
    const field=window.Tengxian.battlefield, trees=field.breakableTrees.trees;
    const authored=trees.filter(t=>t.authored);
    return {count:authored.length, missing:field.layout.blocks.filter(b=>b.treeModel &&
      !authored.some(t=>t.id===b.id&&t.x===b.x&&t.z===b.z)).map(b=>b.id),
      ghostColliders:authored.flatMap(t=>field.colliders.filter(c=>c!==t.stump&&c!==t.trunk&&
        Math.abs(c.c[0]-t.x)<.01&&Math.abs(c.c[2]-t.z)<.01).map(c=>c.id||c.tag)),
      legacyCrowns:field.layout.blocks.filter(b=>/(?:Tree|Poplar).*?(?:Crown|Branch)/.test(b.id)).length};
  });
  assert.equal(replacements.count,46);assert.deepEqual(replacements.missing,[]);
  assert.deepEqual(replacements.ghostColliders,[]);assert.equal(replacements.legacyCrowns,0);
  for(const id of ["FieldPoplarEast3Trunk","FieldPoplarWest3Trunk","FieldPoplarSouthRoad1Trunk",
    "FieldPoplarRailApproach3Trunk","OldYardDeadTreeTrunk","CollectionEastTreeATrunk","SouthExitTreeTrunk","TankRoadDeadTreeTrunk","VillageMouthTree0Trunk"]){
    const visible=await page.evaluate(async id=>{
      const g=window.Tengxian,t=g.battlefield.breakableTrees.trees.find(t=>t.id===id);
      const {Vector3}=await import("three");
      for(let i=0;i<16;i++){
        const angle=-.65+i*Math.PI/8,dx=Math.sin(angle)*16,dz=Math.cos(angle)*16;
        const eye=new Vector3(t.x+dx,g.battlefield.GroundHeight(t.x+dx,t.z+dz)+1.65,t.z+dz);
        const delta=new Vector3(t.x,t.y+3,t.z).sub(eye),distance=delta.length();
        const hit=g.battlefield.Raycast(eye,delta.normalize(),distance,{terrain:true});
        if(hit&&hit.box!==t.trunk)continue;
        g.player.Spawn(eye.x,eye.z,Math.atan2(dx,dz));g.player.pitch=.08;
        g.StepFrames(8,0,true);
        return true;
      }
      return false;
    },id);
    assert.ok(visible,`${id} capture must have an unobstructed view`);
    await page.screenshot({path:path.join(out,`Image_Replaced_${id}.png`)});
  }
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
      treeColliders:g.battlefield.colliders.filter(c=>c.tag==="tree").length,
      cameraHit:cameraHit?.box?.id,
      triangles:g.renderer.info.render.triangles,calls:g.renderer.info.render.calls};
  });
  assert.equal(initial.snapshot.count,TREE_COUNT);assert.equal(initial.snapshot.broken,0);
  assert.equal(initial.treeColliders,TREE_COUNT*2);assert.equal(initial.snapshot.activeBodies,0);
  assert.equal(initial.probeLod,0,"the tree 16 m away draws at full detail");
  assert.ok(initial.snapshot.lod[0]<12&&initial.snapshot.lod.slice(2).reduce((a,b)=>a+b,0)>40,"distant trees use the clustered copies: "+initial.snapshot.lod);
  assert.equal(initial.members.StumpCap_L0||0,0,"standing trees hide their fracture caps");
  for(const part of ["Stump","Crown"])assert.equal(initial.snapshot.lod.reduce((n,_,l)=>n+(initial.members[`${part}_L${l}`]||0),0),TREE_COUNT,part+" is drawn exactly once per tree");
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
    return {snapshot,minGap,staticMatrices:!tree.fallen.matrixAutoUpdate&&!tree.fallen.matrixWorldAutoUpdate,
      quaternion:tree.fallen.quaternion.toArray(),
      linked:g.renderer.info.programs.every(p=>g.renderer.getContext().getProgramParameter(p.program,g.renderer.getContext().LINK_STATUS))};
  });
  assert.equal(fallen.snapshot.activeBodies,0);assert.ok(fallen.minGap>=-0.08&&fallen.minGap<0.4,JSON.stringify(fallen));
  assert.ok(Math.hypot(fallen.quaternion[0],fallen.quaternion[2])>0.45,"crown actually topples");
  assert.ok(fallen.linked);
  assert.ok(fallen.staticMatrices);assert.equal(fallen.snapshot.settled,1);
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
    // Stress the worst case: every remaining tree falls in the same frame.
    for(const t of [...system.standingTrees])system.Break(t,new Vector3(t.x-1,t.y+1,t.z));
    g.battlefield.BuildCollisionGrid();g.physics.RefreshStaticQueries();
    const peak=system.Snapshot();
    const treeBodies=[...system.activeTrees].map(t=>t.body);
    g.StepFrames(1800,1/60,false);g.StepFrames(1,0,true);
    const settled=system.Snapshot();
    const treeColliders=g.battlefield.colliders.filter(c=>c.tag==="tree").length;
    let terrainSamples=0;
    const ground=g.battlefield.GroundHeight;
    g.battlefield.GroundHeight=function(...args){terrainSamples++;return ground.apply(this,args);};
    const start=performance.now();
    for(let i=0;i<10000;i++)system.Update(1/60);
    const idleUpdateMs=performance.now()-start;
    g.battlefield.GroundHeight=ground;
    let allStatic=true;
    for(const t of system.trees)t.fallen.traverse(m=>{allStatic&&=!m.matrixAutoUpdate&&!m.matrixWorldAutoUpdate;});
    const stress={peak:peak.activeBodies,settled:settled.settled,activeBodies:settled.activeBodies,
      standing:settled.standing,treeColliders,terrainSamples,idleUpdateMs,allStatic,
      crownInstances:system.root.children.filter(m=>m.isInstancedMesh&&m.name.includes("_Crown_L")).reduce((n,m)=>n+m.count,0),
      remainingTreeBodies:treeBodies.filter(body=>g.physics.dynamics.has(body)).length,
      bodiesAfterSettling:g.physics.dynamics.size};
    // Gameplay may create unrelated projectiles during those 30 simulated seconds.
    // Track exact tree bodies for leaks and preserve every unrelated body on disposal.
    const unrelatedBodies=[...g.physics.dynamics];
    system.Dispose();
    const preservedBodies=unrelatedBodies.every(body=>g.physics.dynamics.has(body));
    return {shielded,count,detached:!root.parent,bodiesBefore,bodiesDuring,bodiesAfter:g.physics.dynamics.size,
      preservedBodies,treeCollidersAfterDispose:g.battlefield.colliders.filter(c=>c.tag==="tree").length,stress};
  });
  assert.equal(lifecycle.shielded,0);assert.equal(lifecycle.count,1);assert.ok(lifecycle.detached);
  assert.equal(lifecycle.bodiesDuring,lifecycle.bodiesBefore+1);
  assert.equal(lifecycle.bodiesAfter,lifecycle.stress.bodiesAfterSettling);assert.ok(lifecycle.preservedBodies);
  assert.equal(lifecycle.treeCollidersAfterDispose,0);
  assert.equal(lifecycle.stress.peak,TREE_COUNT-1);assert.equal(lifecycle.stress.settled,TREE_COUNT);
  assert.equal(lifecycle.stress.activeBodies,0);assert.equal(lifecycle.stress.standing,0);
  assert.equal(lifecycle.stress.treeColliders,TREE_COUNT);assert.equal(lifecycle.stress.terrainSamples,0);
  assert.equal(lifecycle.stress.crownInstances,0);
  assert.equal(lifecycle.stress.remainingTreeBodies,0);assert.ok(lifecycle.stress.allStatic);
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,"Data_Verification.json"),JSON.stringify({replacements,initial,broken,fallen,lifecycle,errors},null,2));
  console.log("PASS BreakableTreesBrowserTest",JSON.stringify({count:TREE_COUNT,broken:fallen.snapshot.broken,minGap:fallen.minGap,lifecycle}));
}catch(error){
  await page.screenshot({path:path.join(out,"Image_Failure.png")}).catch(()=>{});
  console.error(await page.evaluate(()=>({boot:document.querySelector("#bootText")?.textContent,errors:document.body.innerText.slice(-1200)})).catch(()=>{}));
  throw error;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
