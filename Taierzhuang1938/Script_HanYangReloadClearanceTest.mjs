// Hanyang: report-first, both complete skinned arms/sleeves. Four real actions:
// empty, partial3, held-open reload, ordinary post-shot bolt; 60fps +12 settle.
// No contact regions or phases are exempt. Default mode is report_only.
// --max-depth-mm=2 explicitly gates confirmed closed-shell depth only; open
// shell crossings/ambiguity still require review and never imply clearance.
// --shots saves at most two 1280x720 JPEGs per case; --output=<directory>.
// --case=HanYangBolt (or another exact case id) isolates an amended action;
// omitting it always retains all four complete actions.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';

const project=path.dirname(fileURLToPath(import.meta.url));
const Value=name=>process.argv.find(argument=>argument.startsWith(name+'='))?.slice(name.length+1);
const depthOption=Value('--max-depth-mm'),maximumDepthMm=depthOption===undefined?null:Number(depthOption);
assert(maximumDepthMm===null||(Number.isFinite(maximumDepthMm)&&maximumDepthMm>=0),'--max-depth-mm must be a finite nonnegative number');
const output=path.resolve(Value('--output')||path.join(project,'_shots','HanYangReloadClearance'));
const shots=process.argv.includes('--shots');
const selectedCase=Value('--case');
assert(selectedCase===undefined||['HanYangEmpty','HanYangPartial3','HanYangOpenReload','HanYangBolt'].includes(selectedCase),'Unknown HanYang action case');
await fs.mkdir(output,{recursive:true});
let server=null,browser=null,page=null,report=null;
const pageErrors=[],consoleErrors=[];
try {
  server=await ServeRoot(path.resolve(project,'..'),0);
  browser=await LaunchBrowser({extraArgs:['--mute-audio']});
  page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',error=>pageErrors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());if(message.text().startsWith('--- HanYang clearance '))console.log(message.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?weapons=1&shot=1&manual=1&quality=medium&scale=small`,{timeout:120000});
  await page.waitForFunction(()=>window.Taierzhuang?.state?.ready,null,{timeout:240000});
  report=await page.evaluate(async selectedCase=>{
    const THREE=await import('./vendor/three/build/three.module.js');
    const {CreateReloadClearanceProbe}=await import('./Script_FpsReloadClearanceGeometry.mjs');
    const T=window.Taierzhuang,vm=T.viewmodel;
    if(!T.editor.active?.SetAnimationClean)T.Debug.OpenEditor('firstPerson');
    const editor=T.editor.active;editor.SetAnimationClean(true);
    const Visible=object=>{for(let item=object;item;item=item.parent)if(!item.visible)return false;return true;};
    const Materials=mesh=>[].concat(mesh.material||[]);
    const Surface=materials=>{
      const skin=materials.some(material=>/Material_HanYangScanSkin/i.test(material.name||'')||material.userData?.externalMaterialClass==='skin'||material.userData?.materialShadingSurface?.skin===true);
      const sleeve=materials.some(material=>material.name==='Material #1721585337'||material.userData?.externalMaterialClass==='cloth');
      return skin&&sleeve?'mixed':skin?'skin':sleeve?'sleeve':'unknown';
    };
    // Inventory every rendered vertex influenced by this actual arm, including
    // mixed Hand/Forearm wrist skin and all sleeve meshes. This independently
    // verifies the probe's coverage rather than relying on a fingertip count.
    const Inventory=side=>{
      const meshes=[],coverage={},pattern=new RegExp(side+'(finger[0-4][0-2]?|hand|forearm|upperarm)$');
      vm.riggedArms.root.traverse(mesh=>{
        if(!mesh.isSkinnedMesh||!Visible(mesh))return;
        const g=mesh.geometry,a=g.attributes,materials=Materials(mesh),visible=materials.map(material=>material&&material.visible!==false&&(!material.transparent||material.opacity>0));
        const vertices=new Set(),start=g.drawRange?.start||0,end=Math.min(g.index?.count||a.position.count,start+(g.drawRange?.count??Infinity));
        for(let offset=start;offset+2<end;offset+=3){
          const group=g.groups.find(group=>offset>=group.start&&offset<group.start+group.count);
          if(Array.isArray(mesh.material)&&!group)continue;
          if(!visible[Array.isArray(mesh.material)?group.materialIndex:0])continue;
          for(let i=0;i<3;i++)vertices.add(g.index?g.index.getX(offset+i):offset+i);
        }
        const roles=new Map();mesh.skeleton.bones.forEach((bone,i)=>{
          const match=bone.name.toLowerCase().replace(/[^a-z0-9]/g,'').match(pattern);
          if(match)roles.set(i,match[1].startsWith('finger')?'Finger'+match[1][6]:match[1]==='hand'?'Hand':match[1]==='upperarm'?'UpperArm':'Forearm');
        });
        const regions={};let selected=0;
        for(const i of vertices){
          let owned=0,best=0,role=null,hand=0,forearm=0;
          for(let k=0;k<4;k++){
            const owner=roles.get(a.skinIndex.getComponent(i,k)),weight=a.skinWeight.getComponent(i,k);if(!owner)continue;
            owned+=weight;if(owner==='Hand')hand+=weight;if(owner==='Forearm')forearm+=weight;
            if(weight>best){best=weight;role=owner;}
          }
          if(owned<.05)continue;if(hand>.03&&forearm>.03)role='Wrist';selected++;
          regions[role]=(regions[role]||0)+1;coverage[role]=(coverage[role]||0)+1;
        }
        if(selected)meshes.push({mesh:mesh.name,materials:materials.map(material=>material.name),surface:Surface(materials),vertices:selected,regions});
      });
      return {side,vertices:meshes.reduce((sum,mesh)=>sum+mesh.vertices,0),coverage,meshes,
        wristCoverage:'Wrist labels actual >3% Hand and >3% Forearm mixed weights; pure-weight wrist remains included in Hand/Forearm.'};
    };
    const Prepare=spec=>{
      editor.SetWeapon('HanYang');editor.SetPose('hip');editor.SetView('player');
      vm.autoBolt=false;vm.shotIndex=0;vm.visualAmmo=spec.startedOpen?1:spec.action==='bolt'?5:spec.remaining;
      for(let i=0;i<90;i++)editor.Update(1/60);
      if(!vm.packetProp||!vm.usedPacketProp||!vm.rig.parts.bolt)throw Error('Hanyang requires actual new/old packets and the moving bolt');
      if(spec.startedOpen){
        if(!vm.TriggerFire({cameraKick:false}))throw Error('Hanyang held-open setup shot was rejected');
        vm.visualAmmo=0;vm.pendingHoldOpen=true;
        if(!vm.TriggerBolt())throw Error('Hanyang held-open setup bolt did not start');
        let frame=0;while(vm.action&&frame++<600)editor.Update(1/60);
        if(vm.action||!vm.boltOpen)throw Error('Hanyang setup did not retain the actual last-shot open bolt');
      }
    };
    const Start=spec=>{
      if(spec.action==='bolt'){
        if(!vm.TriggerFire({cameraKick:false}))throw Error('Hanyang ordinary-cycle shot was rejected');
        vm.visualAmmo=spec.remaining;
        return vm.TriggerBolt();
      }
      return vm.TriggerReload({remainingRounds:spec.remaining});
    };
    const Targets=()=>[
      {role:'gun',root:vm.rig.group},{role:'newPacket',root:vm.packetProp},{role:'oldPacket',root:vm.usedPacketProp},
      ...vm.debris.filter(slot=>slot.alive>0).map((slot,index)=>({role:'liveDebris/'+(slot.mesh.userData.debrisKind||'unknown')+'/'+index,root:slot.mesh})),
    ];
    const audit=window.__hanYangReloadClearanceAudit={schema:1,mode:'report_only',weapon:'HanYang',fps:60,postActionFrames:12,selectedCase:selectedCase??null,cases:[],
      method:'Both actual skinned arms: every rendered vertex influenced >=5% by the selected side Finger/Hand/Forearm/UpperArm, mixed-weight Wrist and all skin/sleeve faces. Visible real gun, actual new/old Mannlicher packets and every live released case/cartridge/clip/debris mesh. BVH finite surface crossing plus per-edge-connected closed-shell bidirectional 4/5-ray containment; no depth early exit, no contact exemptions.',
      limitations:[
        'Closed-shell depth is nearest surface distance inside each confirmed watertight component, not the exterior depth of a union of overlapping solids.',
        'Open/non-manifold gun and charger shells are never inferred to be filled solids. Fully buried skin without a finite surface crossing can remain unprovable; openBounds vertices are evidence limitations, not collisions.',
        'Ray disagreements are reported as ambiguous closed-shell evidence, never treated as proved clearance.',
        'Finite transverse skin/obstacle face crossings are recorded even for open shells. Coplanar/tangent contact is not transverse crossing. Crossing area sums entire intersected skin triangles, not the actual penetration patch.',
        'Vertex/triangle counts are obstacle pairs and may repeat across overlapping components; the report retains separate side, mesh, region and obstacle witnesses.',
        'Wrist mixed-weight labels do not define an isolated anatomical wrist mesh: pure Hand/Forearm wrist vertices remain included. Hand includes both palm and dorsum.',
        'Nonuniform/sheared debris is transformed into weapon coordinates before metric queries; it is not skipped.',
        'No intended grip, supporting hand, loading, cocking or settled phase is exempt. Temporary labels identify otherwise unnamed obstacle meshes; transforms, materials, visibility and skin are not changed.',
        'Default success means a complete diagnostic report with valid coverage/reach/wrist/arc protocol. An explicit depth gate does not prove zero surface crossings or open-shell clearance, and does not replace continuous visual review.',
      ]};
    for(const spec of [
      {id:'HanYangEmpty',action:'reload',remaining:0,startedOpen:false},
      {id:'HanYangPartial3',action:'reload',remaining:3,startedOpen:false},
      {id:'HanYangOpenReload',action:'reload',remaining:0,startedOpen:true},
      {id:'HanYangBolt',action:'bolt',remaining:4,startedOpen:false},
    ].filter(spec=>!selectedCase||spec.id===selectedCase)){
      Prepare(spec);
      const probes={r:CreateReloadClearanceProbe(THREE,{side:'r',includeUpperArm:true}),l:CreateReloadClearanceProbe(THREE,{side:'l',includeUpperArm:true})};
      const row={...spec,fps:60,inventory:{r:Inventory('r'),l:Inventory('l')},frames:[]};audit.cases.push(row);
      const Measure=(frame,t,seconds,phase,settleFrame=0)=>{
        vm.root.updateWorldMatrix(true,true);vm.riggedArms.root.updateWorldMatrix(true,true);
        const targets=Targets(),renamed=[],seen=new Set();
        for(const {role,root}of targets){let index=0;root.traverse(mesh=>{
          if(!mesh.isMesh||mesh.isSkinnedMesh||seen.has(mesh))return;seen.add(mesh);
          if(!mesh.name){renamed.push([mesh,mesh.name]);mesh.name=role+'/Mesh'+index;}index++;
        });}
        const sides={};
        try{for(const side of ['r','l'])sides[side]=probes[side].Measure({weaponGroup:vm.rig.group,arms:vm.riggedArms,
          roots:targets.map(target=>target.root),magazine:null,contactClass:'hanYangAuditNoExemptions'});}
        finally{for(const [mesh,name]of renamed)mesh.name=name;}
        const arms=vm.riggedArms;
        return {frame,t,seconds,phase,settleFrame,wrist:{...arms.wristBend},reachable:{...arms.reachable},contactWeight:{...arms.contactWeight},
          poseState:{...arms.poseState},
          fingerQuaternions:Object.fromEntries(['r','l'].map(side=>[side,arms.fingerBones[side].map(bone=>({name:bone.name,q:bone.quaternion.toArray()}))])),
          elbowArc:JSON.parse(JSON.stringify(arms.elbowArcState||{})),
          operation:{r:arms.operationPose.r?{...arms.operationPose.r}:null,l:arms.operationPose.l?{...arms.operationPose.l}:null},
          targets:targets.map(({role,root})=>({role,name:root.name,visible:Visible(root)})),sides,
          maxDepthMm:Math.max(sides.r.maxDepthMm,sides.l.maxDepthMm),
          crossingTriangleObstaclePairs:sides.r.crossingTriangleObstaclePairs+sides.l.crossingTriangleObstaclePairs};
      };
      row.holding=Measure(-1,0,0,'holding');
      if(!Start(spec)||!vm.action)throw Error(row.id+' actual action did not start');
      row.duration=vm.action.duration;row.actualRemaining=vm.action.roundsRemaining;row.actualStartedOpen=vm.action.startedOpen;row.actualActionKind=vm.action.kind;
      row.frames.push(Measure(0,0,0,spec.action));let frame=0;
      while(vm.action&&frame<1200){
        editor.Update(1/60);frame++;
        row.frames.push(Measure(frame,vm.action?.t??1,frame/60,spec.action));
        if(frame%30===0){console.log(`--- HanYang clearance ${row.id}: ${frame} real frames, t=${row.frames.at(-1).t.toFixed(3)}`);await new Promise(resolve=>setTimeout(resolve,0));}
      }
      if(vm.action)throw Error(row.id+' exceeded action frame budget');row.actionFrameCount=frame;row.actualActionElapsedS=frame/60;
      for(let settle=1;settle<=12;settle++){
        editor.Update(1/60);frame++;
        row.frames.push(Measure(frame,1,frame/60,'settle',settle));
      }
      const measured=[row.holding,...row.frames];
      row.maximumDepthMm=Math.max(...measured.map(frame=>frame.maxDepthMm));
      row.maximumCrossingPairs=Math.max(...measured.map(frame=>frame.crossingTriangleObstaclePairs));
      row.maximumWristDeg=Math.max(...measured.flatMap(frame=>[frame.wrist.r,frame.wrist.l]));
      row.sideMaximumDepthMm=Object.fromEntries(['r','l'].map(side=>[side,Math.max(...measured.map(frame=>frame.sides[side].maxDepthMm))]));
    }
    window.__hanYangClearanceReplay=({spec,frame})=>{
      Prepare(spec);if(frame>=0){if(!Start(spec)||!vm.action)throw Error('Hanyang replay action did not start');
        for(let i=0;i<frame;i++)editor.Update(1/60);}
      vm.root.updateWorldMatrix(true,true);
      const update=editor.Update;editor.Update=()=>{};try{T.StepFrames(1);}finally{editor.Update=update;}
    };
    return audit;
  },selectedCase);
  const protocolFailures=[],depthFailures=[];
  const Check=(condition,message)=>{if(!condition)protocolFailures.push(message);};
  for(const row of report.cases){
    Check(row.actualRemaining===row.remaining,row.id+': wrong actual starting round count');
    Check(row.actualActionKind===row.action,row.id+': wrong actual action kind');
    Check(row.actualStartedOpen===row.startedOpen,row.id+': wrong actual held-open starting state');
    Check(row.actionFrameCount>=Math.floor(row.duration*60),row.id+': incomplete actual 60fps action');
    Check(row.frames.filter(frame=>frame.phase==='settle').length===12,row.id+': missing post-action frames');
    Check(row.frames.at(-1).settleFrame===12,row.id+': did not finish the full settle interval');
    if(maximumDepthMm!==null)Check(row.holding.crossingTriangleObstaclePairs===0,row.id+': the actual complete holding arms/wrists/sleeves cross the gun before the action');
    for(const side of ['r','l']){
      const inventory=row.inventory[side];
      Check(inventory.meshes.some(mesh=>mesh.surface==='skin'||mesh.surface==='mixed'),row.id+': no actual '+side+' scan skin inventory');
      Check(inventory.meshes.some(mesh=>mesh.surface==='sleeve'||mesh.surface==='mixed'),row.id+': no actual '+side+' sleeve inventory');
      for(const region of ['UpperArm','Hand','Forearm','Finger0','Finger1','Finger2','Finger3','Finger4'])Check(inventory.coverage[region]>0,row.id+': missing '+side+' '+region+' source coverage');
    }
    for(const frame of [row.holding,...row.frames])for(const side of ['r','l']){
      const sample=frame.sides[side],inventory=row.inventory[side];
      Check(Number.isFinite(frame.wrist[side])&&frame.wrist[side]<65,`${row.id} frame ${frame.frame}: ${side} wrist ${frame.wrist[side]}`);
      Check(frame.reachable[side]===true,`${row.id} frame ${frame.frame}: ${side} arm unreachable`);
      const arc=frame.elbowArc?.[side];
      const enabledArc=arc&&arc.enabled!==false;
      Check(!enabledArc||arc.feasible===true,`${row.id} frame ${frame.frame}: ${side} enabled elbow arc lacks feasible=true ${JSON.stringify(arc)}`);
      Check(!enabledArc||arc.overspeed!==true,`${row.id} frame ${frame.frame}: ${side} elbow arc overspeed`);
      Check(sample.skinVertices===inventory.vertices,`${row.id} frame ${frame.frame}: ${side} skin/sleeve vertex coverage changed`);
      for(const [region,count]of Object.entries(inventory.coverage))Check(sample.coverage[region]===count,`${row.id} frame ${frame.frame}: ${side} ${region} coverage mismatch`);
      Check(sample.obstacles.length>0,`${row.id} frame ${frame.frame}: ${side} real obstacles missing`);
      Check(sample.rows.every(row=>row.expectedContact===false),`${row.id} frame ${frame.frame}: ${side} contact exemption was introduced`);
    }
    const frames=row.frames,measured=[row.holding,...frames];
    const deepest=measured.reduce((worst,frame)=>frame.maxDepthMm>worst.maxDepthMm?frame:worst,measured[0]);
    const crossing=measured.reduce((worst,frame)=>frame.crossingTriangleObstaclePairs>worst.crossingTriangleObstaclePairs?frame:worst,measured[0]);
    const At=t=>frames.reduce((closest,frame)=>Math.abs(frame.t-t)<Math.abs(closest.t-t)?frame:closest,frames[0]);
    const chosen=[];
    for(const frame of [row.maximumDepthMm>0?deepest:row.maximumCrossingPairs>0?crossing:At(.26),row.maximumCrossingPairs>0?crossing:At(.90),At(.90)]){
      if(!chosen.some(other=>other.frame===frame.frame))chosen.push(frame);if(chosen.length===2)break;
    }
    row.keyFrames=chosen.map(frame=>({frame:frame.frame,t:frame.t,seconds:frame.seconds,phase:frame.phase,settleFrame:frame.settleFrame,
      maxDepthMm:frame.maxDepthMm,crossingTriangleObstaclePairs:frame.crossingTriangleObstaclePairs,
      worstRows:['r','l'].flatMap(side=>frame.sides[side].rows.map(entry=>({side,...entry})))
        .sort((a,b)=>b.maxDepthMm-a.maxDepthMm||b.crossingSkinTriangles-a.crossingSkinTriangles).slice(0,8)}));
    if(shots)for(const frame of row.keyFrames){
      await page.evaluate(request=>window.__hanYangClearanceReplay(request),{spec:{action:row.action,remaining:row.remaining,startedOpen:row.startedOpen},frame:frame.frame});
      frame.screenshot=`Shot_${row.id}_${frame.frame<0?'Holding':String(frame.frame).padStart(3,'0')}.jpg`;
      await page.screenshot({path:path.join(output,frame.screenshot),type:'jpeg',quality:82,fullPage:false});
    }
    if(maximumDepthMm!==null&&row.maximumDepthMm>maximumDepthMm)depthFailures.push(`${row.id}: confirmed closed-component depth ${row.maximumDepthMm.toFixed(3)}mm exceeds ${maximumDepthMm}mm`);
    console.log(`--- HanYang clearance ${row.id}: ${row.actionFrameCount} action +12 settle frames; R/L depth ${row.sideMaximumDepthMm.r.toFixed(3)}/${row.sideMaximumDepthMm.l.toFixed(3)}mm; surface pairs ${row.maximumCrossingPairs}`);
  }
  report.mode=maximumDepthMm===null?'report_only':'explicit_depth_gate';
  report.gates={maximumDepthMm,protocolFailures,depthFailures,protocolPassed:protocolFailures.length===0,explicitDepthPassed:maximumDepthMm===null?null:depthFailures.length===0};report.pageErrors=pageErrors;report.consoleErrors=consoleErrors;
  report.completed=true;report.clearanceClaimed=false;
  await fs.writeFile(path.join(output,'Data_HanYangReloadClearance.json'),JSON.stringify(report,null,2)+'\n');
  assert.deepEqual(pageErrors,[],'No HanYang audit page errors');
  assert.deepEqual(protocolFailures,[],'HanYang actual skin coverage / wrist / reach / arc protocol');
  assert.deepEqual(depthFailures,[],'Explicit HanYang closed-component depth gate');
  console.log(`ok HanYang ${maximumDepthMm===null?'diagnostic generated; clearance is not asserted':'explicit depth gate passed; open-shell surface evidence still requires review'}: ${path.join(output,'Data_HanYangReloadClearance.json')}`);
}catch(error){
  if(!report&&page&&!page.isClosed())try{report=await page.evaluate(()=>window.__hanYangReloadClearanceAudit||null);}catch{}
  report||={schema:1,mode:'report_only',weapon:'HanYang'};report.runtimeFailure={message:String(error),stack:error.stack};throw error;
}finally{
  try{if(report)await fs.writeFile(path.join(output,'Data_HanYangReloadClearance.json'),JSON.stringify({...report,pageErrors,consoleErrors},null,2)+'\n');}
  finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
}
