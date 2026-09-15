import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,"_shots/FirstLevelFortifications");
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(path.resolve(here,".."),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on("pageerror",e=>errors.push(String(e)));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=high&scale=small`,{timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state.ready,null,{timeout:240000});
  const report=await page.evaluate(async()=>{
    const g=window.Tengxian,field=g.battlefield;
    const groundMeshes=field.meshes.filter(mesh=>mesh.name==='FirstLevelWhitebox_Ground');
    const soil=groundMeshes[0]?.material;
    const terrainPbr={chunks:groundMeshes.length,name:soil?.name,base:soil?.map?.image?.src,
      normal:soil?.normalMap?.image?.src,orm:soil?.roughnessMap?.image?.src,
      baseColorSpace:soil?.map?.colorSpace,normalColorSpace:soil?.normalMap?.colorSpace,
      ormColorSpace:soil?.roughnessMap?.colorSpace,normalScale:soil?.normalScale?.toArray(),
      depths:await (async()=>{const {SampleMissionNaturalHeight}=await import('./Data_FirstLevelMissionTerrain.mjs');
        return [[-24,-53],[-45,30],[-10,-124]].map(([x,z])=>({x,z,depth:SampleMissionNaturalHeight(x,z)-field.TerrainHeight(x,z)}));})()};
    const {MISSION_ROUTES,MISSION_PLACEMENT}=await import("./Data_FirstLevelMissionLayout.mjs");
    const {MissionRouteNextIndex}=await import("./Script_FirstLevelMissionColumn.mjs");
    const {MISSION_TERRAIN}=await import("./Data_FirstLevelMissionTerrain.mjs");
    const {MISSION_TACTICS,MISSION_ENCOUNTERS,MISSION_PURSUIT_ROUTE}=await import("./Data_FirstLevelMission.mjs");
    const {MISSION_DEFENSE_OBJECTS,IsMissionSandbagBlock}=await import("./Data_FirstLevelMissionFortifications.mjs");
    const {Box3,Vector3,Matrix4,Quaternion}=await import("three");
    const blocks=field.layout.blocks.filter(b=>IsMissionSandbagBlock(b.id));
    const missing=blocks.filter(b=>!field.fortificationPlacements.some(p=>p.sourceBlock===b.id)).map(b=>b.id);
    const envelopeErrors=[];
    for(const block of blocks){
      const union=new Box3();
      for(const p of field.fortificationPlacements.filter(p=>p.sourceBlock===block.id)){
        const matrix=new Matrix4().compose(new Vector3(p.x,p.y,p.z),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),p.ry),new Vector3(...p.scale));
        union.union(field.fortificationModels.get(p.asset).box.clone().applyMatrix4(matrix));
      }
      const dimensions=union.getSize(new Vector3()),center=union.getCenter(new Vector3());
      if(Math.abs(dimensions.x-block.w)>.025||Math.abs(dimensions.y-block.h)>.025||Math.abs(dimensions.z-block.d)>.025||
        Math.abs(center.x-block.x)>.025||Math.abs(center.y-block.y)>.025||Math.abs(center.z-block.z)>.025)envelopeErrors.push(block.id);
    }
    const meshes=field.meshes.filter(m=>m.name.includes("MissionDefense_"));
    const obstacles=field.colliders.filter(c=>["fence","barricade"].includes(c.tag));
    const wireGaps=[];
    for(const p of field.fortificationPlacements.filter(p=>p.asset==="battlefieldBarbedWire02")){
      const offset=field.fortificationModels.get(p.asset).root.children[0].position;
      const cos=Math.cos(p.ry),sin=Math.sin(p.ry),scale=p.scale[0];
      const Probe=(localX,height)=>{
        const x=p.x+cos*(localX+offset.x)*scale,z=p.z-sin*(localX+offset.x)*scale;
        return g.physics.Raycast({x:x+sin*1.2,y:p.y+height*scale,z:z+cos*1.2},{x:-sin,y:0,z:-cos},2.4,{terrain:false})?.box?.tag||null;
      };
      wireGaps.push({id:p.id,gap:Probe(-.7,.9),post:Probe(.035*.9/1.28,.9),strand:Probe(-.7,.69)});
    }
    const cuts=[];
    const actors=Object.values(MISSION_ENCOUNTERS).flat();
    const tactics=Object.fromEntries(Object.entries(MISSION_TACTICS).map(([id,plan])=>[id,[actors.find(s=>s.id===id),...plan.points]]));
    for(const s of [...MISSION_ENCOUNTERS.retreat,...MISSION_ENCOUNTERS.air])tactics[s.id+"Pursuit"]=[s,...MISSION_PURSUIT_ROUTE.slice(MissionRouteNextIndex(MISSION_PURSUIT_ROUTE,s))];
    const spawns=Object.fromEntries(actors.map(s=>[s.id+"Spawn",[s,s]]));
    for(const [name,route] of Object.entries({...MISSION_ROUTES,...Object.fromEntries(MISSION_TERRAIN.trenches.filter(t=>t.role).map(t=>[t.id,t.points])),...tactics,...spawns,...Object.fromEntries(MISSION_PLACEMENT.guardWithdrawalRoutes.map((r,i)=>[`Guard${i}`,r]))}))
      for(let i=1;i<route.length;i++){
        const a=route[i-1],b=route[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.2));
        for(let step=0;step<=n;step++){
          const x=a.x+(b.x-a.x)*step/n,z=a.z+(b.z-a.z)*step/n;
          for(const c of obstacles){const dx=x-c.c[0],dz=z-c.c[2],cos=Math.cos(c.ry),sin=Math.sin(c.ry);
            if(Math.abs(dx*cos-dz*sin)<c.h[0]+.5&&Math.abs(dx*sin+dz*cos)<c.h[2]+.5)cuts.push({name,x,z,center:c.c});}
        }
      }
    const assets=Object.fromEntries([...field.fortificationModels].map(([id,m])=>[id,{size:m.size.toArray(),triangles:(()=>{let n=0;m.root.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return n;})()}]));
    const bounds=meshes.map(m=>({name:m.name,size:new Box3().setFromObject(m).getSize(new Vector3()).toArray()}));
    return {terrainPbr,count:field.fortificationPlacements.length,blocks:blocks.length,missing,envelopeErrors,wireGaps,cuts:cuts.slice(0,10),assets,
      objectCount:MISSION_DEFENSE_OBJECTS.length,obstacles:obstacles.length,meshCount:meshes.length,
      triangles:meshes.reduce((n,m)=>n+(m.geometry.index?.count||m.geometry.attributes.position.count)/3,0),bounds};
  });
  await fs.writeFile(path.join(out,"Data_Verification.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({count:report.count,blocks:report.blocks,obstacles:report.obstacles,meshCount:report.meshCount,triangles:report.triangles,missing:report.missing,envelopeErrors:report.envelopeErrors,cuts:report.cuts}));
  assert.ok(report.terrainPbr.chunks>0);
  assert.ok(report.terrainPbr.base.includes('Texture_MissionSoilBase.webp'));
  assert.ok(report.terrainPbr.normal.includes('Texture_MissionSoilNormal.webp'));
  assert.ok(report.terrainPbr.orm.includes('Texture_MissionSoilOrm.png'));
  assert.equal(report.terrainPbr.baseColorSpace,'srgb');
  assert.equal(report.terrainPbr.normalColorSpace,'');assert.equal(report.terrainPbr.ormColorSpace,'');
  assert.deepEqual(report.terrainPbr.normalScale,[.5,.5]);
  assert.ok(report.terrainPbr.depths.every(p=>p.depth>=1.83),'actual heightfield provides full standing cover');
  // Physical capsule traversal is local geometry evidence, separate from the campaign input gate.
  const trenchWalks=await page.evaluate(async()=>{
    const g=window.Tengxian,{MISSION_TERRAIN}=await import("./Data_FirstLevelMissionTerrain.mjs"),results=[];
    const body=g.physics.MakeCharacter();
    try {
      for(const trench of MISSION_TERRAIN.trenches.filter(t=>t.id!=="BundleApproach"))for(const reverse of [false,true]){
        // The live supply crate occupies the centreline; retain its solid collision and walk beside it.
        const {MISSION_SUPPLIES}=await import("./Data_FirstLevelMissionLayout.mjs");
        const supply=MISSION_SUPPLIES.find(s=>s.id==="Front");
        const route=trench.id==="FrontTraverse"?[trench.points[0],
          {x:supply.x-1.5,z:supply.z+1.2},{x:supply.x+1.5,z:supply.z+1.2},...trench.points.slice(1)]:trench.points;
        const points=reverse?[...route].reverse():route;
        body.Teleport(points[0].x,g.physics.groundAt(points[0].x,points[0].z)+.03,points[0].z);
        let reached=1;
        for(let index=1;index<points.length;index++){
          const target=points[index],start=body.position.clone();
          const budget=Math.ceil(Math.hypot(start.x-target.x,start.z-target.z)/.05)+240;
          for(let frame=0;frame<budget;frame++){
            const dx=target.x-body.position.x,dz=target.z-body.position.z,d=Math.hypot(dx,dz);
            if(d<.18){reached++;break;}
            body.Move(dx/d*Math.min(.06,d),-.07,dz/d*Math.min(.06,d));
          }
          if(reached!==index+1)break;
        }
        results.push({id:trench.id,reverse,reached,expected:points.length,position:body.position.toArray(),
          blockers:reached===points.length?[]:g.battlefield.colliders.filter(c=>Math.abs(c.c[0]-body.position.x)<c.h[0]+1&&Math.abs(c.c[2]-body.position.z)<c.h[2]+1)});
      }
    }finally{body.Remove();}
    return results;
  });
  await fs.writeFile(path.join(out,"Data_TrenchWalks.json"),JSON.stringify(trenchWalks,null,2));
  assert.ok(trenchWalks.every(r=>r.reached===r.expected),"every full-height trench walks in both directions: "+JSON.stringify(trenchWalks.filter(r=>r.reached!==r.expected)));
  for(const shot of [
    {id:"Front",x:-10,z:-121,yaw:0,pitch:-.03},
    {id:"FrontWest",x:-33,z:-133,yaw:.9,pitch:-.08},
    {id:"Communication",x:-24,z:-42,yaw:0,pitch:-.03},
    {id:"WestJunction",x:-42,z:-103,yaw:1.6,pitch:-.04},
    {id:"ReserveLoop",x:-55,z:-16,yaw:-.1,pitch:-.04},
    {id:"RearLoop",x:-35,z:103,yaw:1.6,pitch:-.03},
    {id:"Transfer",x:87,z:105,yaw:-.8,pitch:-.04},
    {id:"Station",x:-59,z:54,yaw:.8,pitch:-.04},
  ]) {
    await page.evaluate(shot=>{
      const g=window.Tengxian;
      g.player.Spawn(shot.x,shot.z,shot.yaw);g.player.pitch=shot.pitch;
      g.player.health=100;g.player.bleeding=0;
      g.StepFrames(8,0,true);
    },shot);
    await page.screenshot({path:path.join(out,shot.id+".png")});
  }
  assert.ok(report.count>100);assert.equal(report.missing.length,0);assert.deepEqual(report.envelopeErrors,[],"visual stacks retain the collision envelopes");assert.equal(report.cuts.length,0,"obstacles must leave mission and withdrawal lanes clear");
  assert.ok(report.meshCount>0&&report.meshCount<70);assert.ok(report.triangles<600000);
  assert.ok(report.wireGaps.every(p=>p.gap!=="fence"&&p.post==="fence"&&p.strand==="fence"),"stake and strand collision must leave open firing gaps: "+JSON.stringify(report.wireGaps));
  const rebuild=await page.evaluate(async()=>{
    const g=window.Tengxian,old=g.battlefield,oldMeshes=old.meshes.slice();
    let disposedShared=0;
    const onDispose=()=>disposedShared++;
    const materials=[...old.sharedFortificationMaterials];
    for(const m of materials)m.addEventListener("dispose",onDispose);
    await g.Debug.FirstLevelJump(12);
    const transferCount=g.battlefield.fortificationPlacements.length;
    await g.Debug.FirstLevelJump(3);
    for(const m of materials)m.removeEventListener("dispose",onDispose);
    const result={transferCount,frontCount:g.battlefield.fortificationPlacements.length,disposedShared,
      staleMeshes:oldMeshes.filter(m=>g.scene.children.includes(m)).length};
    g.player.Spawn(-4,-124,0);g.player.pitch=-.035;g.StepFrames(8,0,true);
    return result;
  });
  await page.screenshot({path:path.join(out,"FrontLive.png")});
  await fs.writeFile(path.join(out,"Data_Rebuild.json"),JSON.stringify(rebuild,null,2));
  assert.equal(rebuild.transferCount,report.count);assert.equal(rebuild.frontCount,report.count);
  assert.equal(rebuild.staleMeshes,0);assert.equal(rebuild.disposedShared,0);
  const gpu=await page.evaluate(()=>{
    const renderer=window.Tengxian.renderer,gl=renderer.getContext();
    const kinds=new Set([gl.SAMPLER_2D,gl.SAMPLER_3D,gl.SAMPLER_CUBE,gl.SAMPLER_2D_SHADOW,gl.SAMPLER_2D_ARRAY,
      gl.SAMPLER_2D_ARRAY_SHADOW,gl.SAMPLER_CUBE_SHADOW,gl.INT_SAMPLER_2D,gl.INT_SAMPLER_3D,gl.INT_SAMPLER_CUBE,
      gl.INT_SAMPLER_2D_ARRAY,gl.UNSIGNED_INT_SAMPLER_2D,gl.UNSIGNED_INT_SAMPLER_3D,gl.UNSIGNED_INT_SAMPLER_CUBE,gl.UNSIGNED_INT_SAMPLER_2D_ARRAY]);
    const programs=renderer.info.programs.map(entry=>{const p=entry.program,linked=gl.getProgramParameter(p,gl.LINK_STATUS);let samplers=0;
      if(linked)for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){const u=gl.getActiveUniform(p,i);if(kinds.has(u.type))samplers+=u.size;}
      return {name:entry.name,linked,samplers};});
    return {maxUnits:gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),error:gl.getError(),programs};
  });
  await fs.writeFile(path.join(out,"Data_TerrainGpu.json"),JSON.stringify(gpu,null,2));
  assert.ok(gpu.programs.length>0&&gpu.programs.every(p=>p.linked&&p.samplers<=gpu.maxUnits),"mission soil and crater programs fit the actual GPU");
  assert.equal(gpu.error,0,"mission terrain renders without GL errors");
  assert.deepEqual(errors,[]);
  console.log("ok mission fortifications, physical route clearance, merged geometry and rendered views");
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
