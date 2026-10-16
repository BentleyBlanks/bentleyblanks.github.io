// Report-first, full-cycle ZB-26 right-arm audit. Ordinary invocation launches
// the real game; --self-test exercises only the CPU geometry algorithm.
// No uncalibrated art threshold is silently treated as acceptance. A reviewed
// threshold may be supplied explicitly with --max-depth-mm=N / --max-crossings=N.
// node Taierzhuang1938/Script_FpsReloadClearanceTest.mjs --shots
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CreateReloadClearanceGeometry,CreateReloadClearanceProbe} from './Script_FpsReloadClearanceGeometry.mjs';

const project = path.dirname(fileURLToPath(import.meta.url));
const Value = name => process.argv.find(arg=>arg.startsWith(name+'='))?.slice(name.length+1);
const NumberOption = name => {
  const value = Value(name); if (value === undefined) return null;
  const number = Number(value); assert(Number.isFinite(number)&&number>=0,'Invalid '+name); return number;
};
const maximumDepthMm = NumberOption('--max-depth-mm'), maximumCrossings = NumberOption('--max-crossings');
const shots = process.argv.includes('--shots');

if (process.argv.includes('--self-test')) {
  const THREE = await import('./vendor/three/build/three.module.js');
  const probe = CreateReloadClearanceGeometry(THREE);
  const Triangles = geometry => {
    const p=geometry.attributes.position,ix=geometry.index,result=[];
    for(let i=0;i<(ix?.count||p.count);i+=3)result.push(new THREE.Triangle(...[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,ix?ix.getX(i+k):i+k))));
    return result;
  };
  const outer=Triangles(new THREE.BoxGeometry(.1,.1,.1)),surface=probe.Surface(outer);
  assert.equal(surface.components.length,1); assert(surface.components[0].closed);
  const center=probe.Interior(surface,new THREE.Vector3());
  assert(center.witness); assert(center.depth>.04999,'Deep penetration must not have a 12mm early exit');
  assert.equal(probe.Interior(surface,new THREE.Vector3(.2,0,0)).witness,null);
  const union=probe.Surface([...outer,...Triangles(new THREE.BoxGeometry(.04,.04,.04))]);
  assert.equal(union.components.length,2); assert(union.components.every(component=>component.closed));
  assert(probe.Interior(union,new THREE.Vector3()).witness,'Nested shells are a union, not global even/odd cancellation');
  const reversed=probe.Surface(outer.map(t=>new THREE.Triangle(t.c,t.b,t.a)));
  assert(probe.Interior(reversed,new THREE.Vector3()).witness,'Author winding must not invert solid classification');
  const open=probe.Surface(Triangles(new THREE.PlaneGeometry(.1,.1)));
  assert(open.components.every(component=>!component.closed));
  assert.equal(probe.Interior(open,new THREE.Vector3()).witness,null,'An open sheet is not an inferred solid');
  const crossing=new THREE.Triangle(new THREE.Vector3(-.02,0,-.02),new THREE.Vector3(.02,0,.02),new THREE.Vector3(.02,.03,-.02));
  assert(probe.Crossing(crossing,open),'Transverse intersection of two actual finite surfaces must be detected');
  const tangent=new THREE.Triangle(new THREE.Vector3(-.02,0,0),new THREE.Vector3(.02,0,0),new THREE.Vector3(.02,.03,0));
  assert.equal(probe.Crossing(tangent,open),null,'Coplanar touching is not transverse penetration');
  // The target triangle can be the smaller one: checking skin edges alone
  // misses the intersection when both endpoints lie on obstacle edges.
  const small=probe.Surface([new THREE.Triangle(new THREE.Vector3(-.005,-.005,0),new THREE.Vector3(.005,-.005,0),new THREE.Vector3(0,.005,0))]);
  assert(probe.Crossing(new THREE.Triangle(new THREE.Vector3(-.1,0,-.1),new THREE.Vector3(.1,0,-.1),new THREE.Vector3(0,0,.1)),small));
  // A real SkinnedMesh fixture guards against silently measuring fingers only.
  const weaponGroup=new THREE.Group(),armsRoot=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),new THREE.MeshBasicMaterial());body.name='FixtureGun';weaponGroup.add(body);
  const names=['Hand','Forearm','Finger0','Finger1','Finger2','Finger3','Finger4','UpperArm'];
  const bones=names.map(name=>{const bone=new THREE.Bone();bone.name='Bip001 R '+name;return bone;});
  for(const bone of bones.slice(1))bones[0].add(bone);
  const skinGeometry=new THREE.BufferGeometry();
  skinGeometry.setAttribute('position',new THREE.Float32BufferAttribute(names.flatMap((_,i)=>[i*.001,0,0]),3));
  skinGeometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(names.flatMap((_,i)=>[i,0,0,0]),4));
  skinGeometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(names.flatMap(()=>[1,0,0,0]),4));
  skinGeometry.setIndex([0,1,2,2,3,4,4,5,6,5,6,7]);
  const mesh=new THREE.SkinnedMesh(skinGeometry,new THREE.MeshBasicMaterial());mesh.name='FixtureHandAndSleeve';mesh.add(bones[0]);
  armsRoot.add(mesh);mesh.bind(new THREE.Skeleton(bones));
  const actualProbe=CreateReloadClearanceProbe(THREE,{includeUpperArm:true}),fixture={weaponGroup,arms:{root:armsRoot},roots:[weaponGroup],magazine:null,contactClass:'fixedGrip'};
  const actual=actualProbe.Measure(fixture);
  for(const name of names)assert(actual.coverage[name]>0,'Missing whole-arm fixture region '+name);
  assert(actual.maxDepthMm>49,'Real skinned palm/forearm deep interior must be measured');
  assert(actual.rows.some(row=>row.region==='Hand'&&row.expectedContact));
  assert(actual.rows.some(row=>row.region==='Forearm'&&!row.expectedContact),'Sleeve penetration cannot inherit grip exemptions');
  assert(actual.rows.some(row=>row.region==='UpperArm'&&!row.expectedContact),'Upper sleeve penetration must remain in a complete-arm audit');
  assert.equal(CreateReloadClearanceProbe(THREE).Measure(fixture).coverage.UpperArm,undefined,'Default right forearm/finger scope must stay unchanged');
  assert.equal(CreateReloadClearanceProbe(THREE,{side:'l',includeUpperArm:true}).Measure(fixture).skinVertices,0,'A left-hand audit must not silently measure the right hand');
  for(const bone of bones)bone.name=bone.name.replace(' R ',' L ');
  const left=CreateReloadClearanceProbe(THREE,{side:'l',includeUpperArm:true}).Measure(fixture);
  for(const name of names)assert(left.coverage[name]>0,'Missing actual left '+name+' skin/sleeve coverage');
  assert(Math.abs(left.maxDepthMm-actual.maxDepthMm)<1e-9,'Mirrored fixture must retain the same solid-depth measurement');
  assert.throws(()=>CreateReloadClearanceProbe(THREE,{side:'both'}),RangeError);
  for(const bone of bones)bone.name=bone.name.replace(' L ',' R ');
  body.scale.set(2,1,.5);body.rotation.set(.2,.3,.1);
  const anisotropic=actualProbe.Measure(fixture);
  assert(anisotropic.obstacles.some(obstacle=>obstacle.name==='FixtureGun'&&obstacle.transformMode==='bakedNonUniform'),'Nonuniform obstacle must remain in the audit');
  assert(Math.abs(anisotropic.maxDepthMm-25)<.0001,'Anisotropic depth must use the true nearest transformed face, not max axis scale');
  body.matrixAutoUpdate=false;body.matrix.set(1,.4,0,0,0,1,0,0,0,0,1,0,0,0,0,1);
  const sheared=actualProbe.Measure(fixture);
  assert(Math.abs(sheared.maxDepthMm-50/Math.sqrt(1.16))<.0001,'Sheared depth must use the transformed supporting plane');
  console.log('ok reload clearance CPU: closed/open topology, nested-shell union, winding, deep interior, finite surface crossings, actual skinned palm/forearm coverage, anisotropic and sheared obstacles');
} else {
  assert(!Value('--only')||Value('--only')==='Zb26','This targeted audit currently covers --only=Zb26');
  const output=path.resolve(Value('--output')||path.join(project,'_shots','FpsReloadClearance'));
  await fs.mkdir(output,{recursive:true});
  const {LaunchBrowser}=await import('../PrairieFire1937/Script_BrowserTestKit.mjs');
  const {ServeRoot}=await import('./Script_DevServer.mjs');
  const server=await ServeRoot(path.resolve(project,'..'),0);
  let browser=null,report=null;
  const errors=[];
  try {
    browser=await LaunchBrowser(); // Shared runner explicitly mutes audio and manages browser resources.
    const page=await browser.newPage({viewport:{width:1280,height:720}});
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('console',message=>{if(message.text().startsWith('--- Clearance '))console.log(message.text());});
    await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?weapons=1&shot=1&manual=1&quality=medium&scale=small`,{timeout:120000});
    await page.waitForFunction(()=>window.Taierzhuang?.state?.ready,null,{timeout:240000});
    report=await page.evaluate(async()=>{
      const THREE=await import('./vendor/three/build/three.module.js');
      const {CreateReloadClearanceProbe}=await import('./Script_FpsReloadClearanceGeometry.mjs');
      const {FPS_TOP_MAG_RELOAD:motion}=await import('./Data_Tuning_FpsReload.mjs');
      const T=window.Taierzhuang,vm=T.viewmodel;
      T.Debug.OpenEditor('firstPerson');const editor=T.editor.active;
      editor.SetAnimationClean(true);
      const Refresh=()=>{vm.root.updateWorldMatrix(true,true);vm.riggedArms.root.updateWorldMatrix(true,true);};
      const Prepare=remaining=>{
        editor.SetWeapon('Zb26');editor.SetPose('hip');editor.SetView('player');
        for(let i=0;i<90;i++)editor.Update(1/60);
        if(remaining!==null){vm.TriggerReload({remainingRounds:remaining});if(!vm.action)throw Error('Zb26 reload did not start');}
        Refresh();
      };
      const Context=(t,remaining)=>{
        const operation=vm.riggedArms.operationPose.r;
        const release=remaining>0?motion.stowAt:motion.discardAt;
        const magazineGrip=(t>=motion.handGraspAt&&t<=release)||(t>=motion.handNewGraspAt&&t<=motion.holdUntil);
        const contactClass=remaining===null||t>=motion.handBackAt?'fixedGrip':magazineGrip?'magazineGrip':'freeTransit';
        return {contactClass,shape:operation?.shape||null,nextShape:operation?.nextShape||null,shapeMix:operation?.shapeMix??0,
          contactWeight:vm.riggedArms.contactWeight.r,wrist:vm.riggedArms.wristBend.r,
          elbow:vm.riggedArms._InAnchor(vm.riggedArms.bones.r.forearm,new THREE.Vector3()).toArray(),
          elbowArc:vm.riggedArms.elbowArcState?.r||null};
      };
      const Capture=(probe,frame,t,remaining)=>{
        Refresh();const context=Context(t,remaining);
        const roots=[vm.rig.group,...vm.debris.filter(slot=>slot.alive>0&&slot.mesh.userData.debrisKind==='magazine').map(slot=>slot.mesh)];
        return {frame,t,seconds:t*(vm.action?.duration||0),...context,
          ...probe.Measure({weaponGroup:vm.rig.group,arms:vm.riggedArms,roots,magazine:vm.rig.parts.magazine,contactClass:context.contactClass})};
      };
      const cases=[];
      for(const remaining of [0,7]) {
        Prepare(null);const probe=CreateReloadClearanceProbe(THREE),holding=Capture(probe,-1,0,null);
        vm.TriggerReload({remainingRounds:remaining});if(!vm.action)throw Error('Zb26 reload did not start');
        const duration=vm.action.duration,frames=[Capture(probe,0,0,remaining)];let frame=0;
        while(vm.action&&frame<1200){editor.Update(1/60);frame++;const t=vm.action?.t??1;
          const measurement=Capture(probe,frame,t,remaining);measurement.seconds=Math.min(frame/60,duration);frames.push(measurement);
          if(frame%60===0){console.log(`--- Clearance Zb26 remaining=${remaining}: ${frame} frames, t=${t.toFixed(3)}`);await new Promise(resolve=>setTimeout(resolve,0));}
        }
        if(vm.action)throw Error('Zb26 reload exceeded frame budget');
        // The authored working arc returns to the ordinary holding solver.
        // Include its first 200ms so a post-action elbow switch cannot hide
        // beyond the normalized t=1 sample.
        for(let settle=1;settle<=12;settle++){
          editor.Update(1/60);frame++;
          frames.push({...Capture(probe,frame,1,remaining),seconds:duration+settle/60,settleFrame:settle});
        }
        cases.push({id:remaining?'Zb26Partial7':'Zb26Empty',remaining,duration,fps:60,holding,frames,
          maximumDepthMm:Math.max(...frames.map(row=>row.maxDepthMm)),maximumCrossings:Math.max(...frames.map(row=>row.crossingTriangleObstaclePairs))});
      }
      window.__reloadClearanceReplay=({remaining,frame})=>{
        Prepare(remaining);for(let i=0;i<frame;i++)editor.Update(1/60);Refresh();
        const update=editor.Update;editor.Update=()=>{};
        try{T.StepFrames(1);}finally{editor.Update=update;}
      };
      return {schema:1,mode:'diagnostic',weapon:'Zb26',fps:60,cases,
        method:'Every 60fps posed skin vertex influenced >=5% by right Finger/Hand/Forearm; mixed wrist and all corresponding skin/sleeve faces. Per-mesh BVH and micrometre-welded edge-connected shell topology. Closed components require 4/5 bidirectional parity lines; closed components form a union. Open/non-manifold surfaces receive finite transverse triangle intersections, never inferred solid depth. No depth cutoff. All contacts remain in the report, classified as fixed grip / intended magazine contact / free transit.',
        limitations:['Maximum depth is nearest surface distance within a confirmed closed component, not the exterior depth of the union of overlapping solids.',
          'Crossing area sums entire intersected skin triangles, not the actual overlap patch; duplicate vertices/obstacle pairs are reported explicitly.',
          'Expected contact class identifies potential hand/finger grip regions; it never excuses penetration or marks a whole palm/back surface as valid contact. Wrist/forearm contacts are never classified as intended grips.',
          'Open shells with fully buried skin and no surface intersection cannot prove containment. Ray disagreements are ambiguous evidence, never a clean result.',
          'No visual acceptance threshold is implied by successful report generation.']};
    });
    const failures=[];
    for(const row of report.cases){
      assert(row.frames.length>=Math.floor(row.duration*60),'Incomplete full-rate action sampling: '+row.id);
      assert.equal(row.frames[0].t,0);assert.equal(row.frames.at(-1).t,1);
      for(const frame of [row.holding,...row.frames]){
        assert(frame.elbowArc?.feasible!==false,`${row.id}: infeasible wrist/elbow-rate arc at ${frame.t}`);
        for(const region of ['Hand','Forearm','Finger0','Finger1','Finger2','Finger3','Finger4'])assert(frame.coverage[region]>0,`${row.id}: missing actual ${region} skin/sleeve coverage`);
        assert(frame.obstacles.some(target=>target.part==='gun'),'No visible real gun geometry');
      }
      const candidates=row.frames.slice().sort((a,b)=>b.maxDepthMm-a.maxDepthMm||b.crossingTriangleObstaclePairs-a.crossingTriangleObstaclePairs);
      const keys=[];
      for(const frame of candidates)if(keys.every(other=>Math.abs(frame.t-other.t)>.025)){keys.push(frame);if(keys.length===5)break;}
      const crossing=row.frames.reduce((worst,frame)=>frame.crossingTriangleObstaclePairs>worst.crossingTriangleObstaclePairs?frame:worst,row.frames[0]);
      if(!keys.some(frame=>frame.frame===crossing.frame))keys.push(crossing);
      row.keyFrames=keys.map(frame=>({frame:frame.frame,t:frame.t,seconds:frame.seconds,contactClass:frame.contactClass,
        maxDepthMm:frame.maxDepthMm,crossingTriangleObstaclePairs:frame.crossingTriangleObstaclePairs,
        worstRows:frame.rows.slice().sort((a,b)=>b.maxDepthMm-a.maxDepthMm||b.crossingSkinTriangles-a.crossingSkinTriangles).slice(0,5)}));
      if(shots)for(const frame of row.keyFrames){await page.evaluate(({remaining,frame})=>window.__reloadClearanceReplay({remaining,frame}),{remaining:row.remaining,frame:frame.frame});
        frame.screenshot=`Shot_${row.id}_${String(frame.frame).padStart(3,'0')}.jpg`;
        await page.screenshot({path:path.join(output,frame.screenshot),type:'jpeg',quality:82});}
      if(maximumDepthMm!==null&&row.maximumDepthMm>maximumDepthMm)failures.push(`${row.id}: ${row.maximumDepthMm.toFixed(3)}mm > reviewed ${maximumDepthMm}mm`);
      if(maximumCrossings!==null&&row.maximumCrossings>maximumCrossings)failures.push(`${row.id}: ${row.maximumCrossings} crossing skin-triangle/obstacle pairs > reviewed ${maximumCrossings}`);
      console.log(`--- Clearance ${row.id}: ${row.frames.length} frames; maximum closed-component interior ${row.maximumDepthMm.toFixed(3)}mm; maximum transverse pairs ${row.maximumCrossings}`);
    }
    report.gates={maximumDepthMm,maximumCrossings,failures};report.errors=errors;
    await fs.writeFile(path.join(output,'Data_ReloadClearance.json'),JSON.stringify(report,null,2)+'\n');
    assert.deepEqual(errors,[],'No page errors');assert.deepEqual(failures,[],'Reviewed full-arm clearance thresholds');
    console.log(`ok reload clearance ${maximumDepthMm===null&&maximumCrossings===null?'diagnostic generated (visual acceptance not gated)':'reviewed thresholds'}: ${path.join(output,'Data_ReloadClearance.json')}`);
  } finally {
    if(report)await fs.writeFile(path.join(output,'Data_ReloadClearance.json'),JSON.stringify({...report,errors},null,2)+'\n');
    if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
  }
}
