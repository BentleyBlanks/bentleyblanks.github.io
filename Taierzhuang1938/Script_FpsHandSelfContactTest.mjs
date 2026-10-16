// CPU skin evidence for real authored packet-hand poses. No browser/renderer.
// Default right: 50 working poses. --side=l: actual leftHolding, CW=1/op=null.
// --motion-report replays the selected side; --gun-cloud is right-hand only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {CaptureAnatomy,ApplyAnatomicalFingers} from './Script_FpsAnatomy.mjs';
import {FPS_HAND_SHAPES,FPS_ARM_POSES} from './Data_FpsArmPoses.mjs';
import {CreateReloadClearanceGeometry} from './Script_FpsReloadClearanceGeometry.mjs';

const project=path.dirname(fileURLToPath(import.meta.url));
const Option=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const side=Option('side')||'r';
assert(side==='r'||side==='l','--side must be r or l');
assert(side==='r'||!Option('gun-cloud'),'--gun-cloud is calibrated only for the right hand');
const defaultContactWeight=side==='l'?1:0;
const output=path.resolve(Option('output')||path.join(project,'_shots/FpsHandSelfContact',side==='l'?'Data_LeftSelfContacts.json':'Data_SelfContacts.json'));
const asset=path.resolve(Option('asset')||path.join(project,'Model/Model_FpsHanYangHands.glb'));
const reportOnly=process.argv.includes('--report-only'),geometry=CreateReloadClearanceGeometry(THREE);
const bytes=await fs.readFile(asset),jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+jsonLength));
assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);
const binary=bytes.subarray(28+jsonLength),widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},readers={5121:['getUint8',1],5123:['getUint16',2],5125:['getUint32',4],5126:['getFloat32',4]};
const Accessor=index=>{
  const a=doc.accessors[index],v=doc.bufferViews[a.bufferView],width=widths[a.type],[reader,size]=readers[a.componentType];
  assert(!a.sparse,'Sparse skin accessors need their own reader');
  const view=new DataView(binary.buffer,binary.byteOffset,binary.byteLength),start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||size*width;
  return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,j)=>{const n=view[reader](start+i*stride+j*size,true);return a.normalized?n/(a.componentType===5121?255:65535):n;}));
};
const jointNodes=new Set(doc.skins.flatMap(s=>s.joints)),objects=doc.nodes.map((n,i)=>{
  const object=jointNodes.has(i)?new THREE.Bone():new THREE.Object3D();object.name=n.name||'';
  if(n.matrix)new THREE.Matrix4().fromArray(n.matrix).decompose(object.position,object.quaternion,object.scale);
  else {if(n.translation)object.position.fromArray(n.translation);if(n.rotation)object.quaternion.fromArray(n.rotation);if(n.scale)object.scale.fromArray(n.scale);}return object;
});
doc.nodes.forEach((n,i)=>n.children?.forEach(j=>objects[i].add(objects[j])));
const root=new THREE.Group();doc.scenes[doc.scene||0].nodes.forEach(i=>root.add(objects[i]));root.updateMatrixWorld(true);
const bind=objects.map(object=>({object,position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone()}));
const Restore=()=>{for(const entry of bind){entry.object.position.copy(entry.position);entry.object.quaternion.copy(entry.quaternion);entry.object.scale.copy(entry.scale);}root.updateMatrixWorld(true);};
const Find=suffix=>objects.find(o=>o.name.toLowerCase().replace(/[^a-z0-9]/g,'').endsWith(suffix));
const rig={root,bindPose:bind,_Restore:Restore,_FingerRoot:(side,digit)=>Find(side+'finger'+digit),bones:{},fingerBones:{},
  poseSpec:FPS_ARM_POSES.HanYang,poseState:{},contactWeight:{r:0,l:1},operationPose:{r:null,l:null}};
for(const side of ['r','l']){
  rig.bones[side]={hand:Find(side+'hand'),forearm:Find(side+'forearm'),upperArm:Find(side+'upperarm')};
  rig.fingerBones[side]=objects.filter(o=>new RegExp(side+'finger[0-4][12]?$').test(o.name.toLowerCase().replace(/[^a-z0-9]/g,'')));
}
CaptureAnatomy(rig);
const materialIds=new Set(doc.materials.flatMap((m,i)=>/HanYang.*Skin/i.test(m.name||'')?[i]:[])),meshes=[];
for(let ni=0;ni<doc.nodes.length;ni++){
  const node=doc.nodes[ni];if(node.mesh===undefined||node.skin===undefined)continue;
  const skin=doc.skins[node.skin],bones=skin.joints.map(i=>objects[i]),ibm=Accessor(skin.inverseBindMatrices).map(a=>new THREE.Matrix4().fromArray(a));
  const pattern=new RegExp(side+'(finger([0-4])([12])?|hand)$');
  const roles=bones.map(b=>{const match=b.name.toLowerCase().replace(/[^a-z0-9]/g,'').match(pattern);return match?{kind:match[1]==='hand'?'Hand':'Finger',digit:match[2]===undefined?null:Number(match[2]),segment:Number(match[3]||0)}:null;});
  for(const primitive of doc.meshes[node.mesh].primitives){
    if(!materialIds.has(primitive.material))continue;
    const positions=Accessor(primitive.attributes.POSITION).map(p=>new THREE.Vector3(...p)),joints=Accessor(primitive.attributes.JOINTS_0),weights=Accessor(primitive.attributes.WEIGHTS_0),indices=primitive.indices===undefined?positions.map((_,i)=>i):Accessor(primitive.indices).flat();
    const ownership=weights.map((w,i)=>{const digits=Array(5).fill(0);let hand=0;for(let k=0;k<4;k++){const role=roles[joints[i][k]];if(role?.kind==='Finger')digits[role.digit]+=w[k];else if(role?.kind==='Hand')hand+=w[k];}const digit=digits.indexOf(Math.max(...digits));return{digits,total:hand+digits.reduce((s,n)=>s+n,0),pureDigit:digits[digit]>.95?digit:-1};});
    meshes.push({name:doc.meshes[node.mesh].name,positions,joints,weights,indices,bones,ibm,roles,ownership});
  }
}
assert(meshes.length>0,'Missing actual dedicated scan skin');
const Skin=mesh=>{
  const matrices=mesh.bones.map((b,j)=>b.matrixWorld.clone().multiply(mesh.ibm[j]));
  return{rotations:matrices.map(m=>new THREE.Quaternion().setFromRotationMatrix(m).normalize()),points:mesh.positions.map((p,i)=>{
    const result=new THREE.Vector3();for(let k=0;k<4;k++){const w=mesh.weights[i][k];if(w)result.addScaledVector(p.clone().applyMatrix4(matrices[mesh.joints[i][k]]),w);}return result;
  })};
};
Restore();for(const mesh of meshes){mesh.bindPoints=Skin(mesh).points;mesh.triangles=[];
  for(let ti=0;ti<mesh.indices.length;ti+=3){const ids=mesh.indices.slice(ti,ti+3),pure=mesh.ownership[ids[0]].pureDigit;
    const whollyOwned=pure>=0&&ids.every(i=>mesh.ownership[i].pureDigit===pure),fingerWeights=Array(5).fill(0);
    for(const i of ids)for(let d=0;d<5;d++)fingerWeights[d]+=mesh.ownership[i].digits[d];
    const digit=fingerWeights.indexOf(Math.max(...fingerWeights));if(fingerWeights.reduce((s,n)=>s+n,0)<1.5)continue;
    const [a,b,c]=ids.map(i=>mesh.bindPoints[i]),e1=b.clone().sub(a),e2=c.clone().sub(a),normal=e1.clone().cross(e2),twiceArea=normal.length();
    if(twiceArea<1e-13)continue;
    mesh.triangles.push({ids,triangle:ti/3,digit,pureDigit:whollyOwned?pure:-1,area:twiceArea/2,normal:normal.divideScalar(twiceArea),g00:e1.lengthSq(),g01:e1.dot(e2),g11:e2.lengthSq()});
  }
}
const gunPath=Option('gun-cloud'),gun=gunPath?JSON.parse(await fs.readFile(path.resolve(gunPath),'utf8')):null;
const obstacles=gun?.gun.map(g=>{const matrix=new THREE.Matrix4().fromArray(g.matrix),points=[];for(let i=0;i<g.positions.length;i+=3)points.push(new THREE.Vector3(...g.positions.slice(i,i+3)).applyMatrix4(matrix));const triangles=[];
  for(let i=0;i<g.indices.length;i+=3)triangles.push(new THREE.Triangle(...g.indices.slice(i,i+3).map(j=>points[j])));return{name:g.name,surface:geometry.Surface(triangles)};
});
// Every listed endpoint and both transition intervals were measured against
// this actual skin before admitting them to the zero-crossing regression gate.
const strictEndpoints=new Set(['packetClip','packetPress','packetBoltClear','packetBolt','packetClear','packetLatch','packetRelax','packetRecover']);
const cases=[];
if(side==='l')cases.push({name:'leftHolding',operation:null,contactWeight:1,strict:true});
else {
  for(const name of ['packetClip','packetPress','packetBolt','packetClear','packetBoltClear','packetLatch','packetRelax','packetRecover'])cases.push({name,from:name,to:name,mix:0,strict:strictEndpoints.has(name)});
  for(const [from,to] of [['packetBoltClear','packetBolt'],['packetPress','packetBoltClear']])for(let i=0;i<=20;i++)cases.push({name:from+' -> '+to+' '+(i*.05).toFixed(2),from,to,mix:i/20,strict:true});
}
const ApplySample=sample=>{
  rig.poseState=sample.poseState?structuredClone(sample.poseState):{};
  Restore();rig.contactWeight[side]=sample.contactWeight??defaultContactWeight;
  rig.operationPose[side]=Object.hasOwn(sample,'operation')?sample.operation:{shape:sample.from,nextShape:sample.to,shapeMix:sample.mix};
  ApplyAnatomicalFingers(rig);root.updateMatrixWorld(true);
};
const PoseKey=()=>JSON.stringify(rig.fingerBones[side].map(bone=>[bone.name,...bone.quaternion.toArray()]));
let motionReport=null;
if(Option('motion-report')){
  const motionPath=path.resolve(Option('motion-report')),raw=await fs.readFile(motionPath),motion=JSON.parse(raw);
  assert.equal(motion.weapon,'HanYang','Motion report must describe the actual HanYang rig');
  assert.equal(motion.completed,true,'Motion report must be complete');
  assert(Array.isArray(motion.cases)&&motion.cases.length>0,'Motion report has no action cases');
  const poseStates=new Map();
  cases.forEach((sample,index)=>{ApplySample(sample);const key=PoseKey();if(!poseStates.has(key))poseStates.set(key,index);});
  motionReport={source:motionPath,sourceSha256:crypto.createHash('sha256').update(raw).digest('hex'),sourceCases:motion.cases.length,
    side,frames:[],uniqueAddedStates:0,actualBonePoseComparisons:0,equivalence:`Exact resulting production ${side==='r'?'right':'left'}-finger local quaternions, checked against the captured actual bone rotations, including thumb opposition, authored grip blending and asynchronous digitMix; no mix rounding or frame subsampling.`};
  const Unit=(value,label)=>assert(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1,label+' must be an explicit finite value in [0,1]');
  for(let ci=0;ci<motion.cases.length;ci++){
    const row=motion.cases[ci];assert(row&&typeof row==='object','Invalid motion action case');
    assert(row.holding&&typeof row.holding==='object',`Motion ${ci}: missing holding frame`);
    assert(Array.isArray(row.frames)&&row.frames.length>0,`Motion ${ci}: missing action frames`);
    const frames=[{location:'holding',frameIndex:null,value:row.holding},...row.frames.map((value,frameIndex)=>({location:'frames',frameIndex,value}))];
    for(const {location,frameIndex,value:frame} of frames){
      const label=`Motion ${row.id??ci} ${location}[${frameIndex??-1}]`;
      assert(frame&&typeof frame==='object',label+': invalid frame');
      assert(frame.operation&&Object.hasOwn(frame.operation,side),label+': missing explicit operation.'+side);
      assert(frame.contactWeight&&Object.hasOwn(frame.contactWeight,side),label+': missing explicit contactWeight.'+side+'; regenerate the GPU report instead of assuming a grip weight');
      Unit(frame.contactWeight[side],label+' contactWeight.'+side);
      const operation=frame.operation[side];
      assert(operation===null||(typeof operation==='object'&&!Array.isArray(operation)),label+': operation.'+side+' must be an object or explicit null');
      if(operation){
        for(const field of ['shape','nextShape'])if(operation[field]!==undefined)assert(typeof operation[field]==='string'&&FPS_HAND_SHAPES[operation[field]],label+': unknown '+field+' '+operation[field]);
        assert(operation.shape!==undefined||operation.nextShape!==undefined,label+': working operation has no actual shape');
        Unit(operation.shapeMix,label+' operation.'+side+'.shapeMix');
        if(operation.digitMix!==undefined){assert(Array.isArray(operation.digitMix)&&operation.digitMix.length===5,label+': digitMix must retain all five actual digits');operation.digitMix.forEach((mix,digit)=>Unit(mix,label+' digitMix['+digit+']'));}
      }
      assert(frame.poseState&&typeof frame.poseState==='object',label+': capture the actual fire/ADS/sprint finger state');
      for(const field of ['fire','ads','sprint'])Unit(frame.poseState[field],label+' poseState.'+field);
      const sample={name:label,motion:true,strict:true,operation:structuredClone(operation),contactWeight:frame.contactWeight[side],poseState:structuredClone(frame.poseState)};
      ApplySample(sample);const key=PoseKey();let stateIndex=poseStates.get(key);
      const actual=Array.isArray(frame.fingerQuaternions)?frame.fingerQuaternions:frame.fingerQuaternions?.[side];
      assert(Array.isArray(actual)&&actual.length===rig.fingerBones[side].length,label+': capture all actual '+side+' finger local rotations');
      const Normalize=name=>name.toLowerCase().replace(/[^a-z0-9]/g,'');
      const actualByName=new Map(actual.map(row=>[Normalize(row.name),row.q]));
      assert.equal(actualByName.size,rig.fingerBones[side].length,label+': actual finger names must be unique');
      for(const bone of rig.fingerBones[side]){
        const values=actualByName.get(Normalize(bone.name));
        assert(Array.isArray(values)&&values.length===4&&values.every(Number.isFinite),label+': missing actual '+bone.name);
        const rotation=new THREE.Quaternion().fromArray(values).normalize();
        assert(1-Math.abs(rotation.dot(bone.quaternion.clone().normalize()))<1e-9,label+': CPU replay differs from actual bone '+bone.name+'; regenerate the motion capture after pose/Idle changes');
        motionReport.actualBonePoseComparisons++;
      }
      if(stateIndex===undefined){stateIndex=cases.length;cases.push(sample);poseStates.set(key,stateIndex);motionReport.uniqueAddedStates++;}
      motionReport.frames.push({caseIndex:ci,caseId:row.id??null,location,frameIndex,frame:frame.frame??null,t:frame.t??null,seconds:frame.seconds??null,phase:frame.phase??null,settleFrame:frame.settleFrame??null,
        operation:sample.operation,contactWeight:sample.contactWeight,stateIndex,poseSha256:crypto.createHash('sha256').update(key).digest('hex')});
    }
  }
  assert(motionReport.frames.length>motion.cases.length,'Motion replay must include action frames as well as holding');
}
const report={asset,assetSha256:crypto.createHash('sha256').update(bytes).digest('hex'),side,defaultContactWeight,motionReport,
  method:`Exact imported runtime anatomy solver and full GLB four-weight LBS. ${side==='r'?'Default fifty right-hand cases use working contactWeight=0.':'Default leftHolding uses contactWeight=1 and explicit operation=null.'} Optional motion cases use explicit captured operation.${side} (including per-digit digitMix) and contactWeight.${side}. All ten ${side==='r'?'right':'left'}-digit pairs inspect triangles whose three vertices each belong >95% to that same digit. Mixed web/palm triangles, same-digit folds and full moving arm/gun paths are outside the inter-digit crossing gate. Area/stretch diagnostics additionally include mixed finger skin. Opposing normals are co-rotated using skin-joint rotations; raw world normals are never used as a flip test.`,gunProbe:gun?{source:path.resolve(gunPath),scope:'Actual exported fully open bolt pose; default endpoint packetBolt and packetBoltClear right-hand frames only. Motion-frame and transition gun clearance is delegated to the full runtime clearance test.',obstacles:obstacles.map(o=>({name:o.name,closed:o.surface.components.filter(c=>c.closed).length,open:o.surface.components.filter(c=>!c.closed).length}))}:null,cases:[]};
const failures=[];
for(let sampleIndex=0;sampleIndex<cases.length;sampleIndex++){
  const sample=cases[sampleIndex];
  if(motionReport&&sampleIndex%40===0)console.log(`HanYang self-contact: ${sampleIndex}/${cases.length} unique/default states; ${motionReport.frames.length} captured frame references`);
  ApplySample(sample);
  const clouds=meshes.map(Skin),triangles=Array.from({length:5},()=>[]),ids=Array.from({length:5},()=>[]),deformation=Array.from({length:5},()=>({triangles:0,bindArea:0,areaBelow10:0,areaBelow25:0,stretchOver3:0,opposingArea:0,maxStretch:0,minAreaRatio:Infinity,maxRuntimePosedEdgeMm:0}));
  for(let mi=0;mi<meshes.length;mi++){const mesh=meshes[mi],cloud=clouds[mi];
    for(const tri of mesh.triangles){const points=tri.ids.map(i=>cloud.points[i]),triangle=new THREE.Triangle(...points);
      if(tri.pureDigit>=0){triangles[tri.pureDigit].push(triangle);ids[tri.pureDigit].push({mesh:mesh.name,triangle:tri.triangle});}
      const f1=points[1].clone().sub(points[0]),f2=points[2].clone().sub(points[0]),normal=f1.clone().cross(f2),ratio=normal.length()/(2*tri.area),h00=f1.lengthSq(),h01=f1.dot(f2),h11=f2.lengthSq(),det=tri.g00*tri.g11-tri.g01**2;
      const trace=(tri.g11*h00+tri.g00*h11-2*tri.g01*h01)/det,product=(h00*h11-h01**2)/det,maxStretch=Math.sqrt(Math.max(0,(trace+Math.sqrt(Math.max(0,trace**2-4*product)))/2));
      const boneWeights=new Map();for(const i of tri.ids)for(let k=0;k<4;k++){const weight=mesh.weights[i][k],joint=mesh.joints[i][k];if(weight)boneWeights.set(joint,(boneWeights.get(joint)||0)+weight/3);}
      const reference=cloud.rotations[[...boneWeights].sort((a,b)=>b[1]-a[1])[0][0]],rotation=new THREE.Quaternion(0,0,0,0);
      for(const [joint,weight] of boneWeights){const q=cloud.rotations[joint],sign=q.dot(reference)<0?-1:1;rotation.x+=q.x*weight*sign;rotation.y+=q.y*weight*sign;rotation.z+=q.z*weight*sign;rotation.w+=q.w*weight*sign;}rotation.normalize();
      const normalDot=normal.normalize().dot(tri.normal.clone().applyQuaternion(rotation)),row=deformation[tri.digit];row.triangles++;row.bindArea+=tri.area;
      if(ratio<.1)row.areaBelow10+=tri.area;if(ratio<.25)row.areaBelow25+=tri.area;if(maxStretch>3)row.stretchOver3+=tri.area;if(normalDot<0)row.opposingArea+=tri.area;
      row.maxStretch=Math.max(row.maxStretch,maxStretch);row.minAreaRatio=Math.min(row.minAreaRatio,ratio);row.maxRuntimePosedEdgeMm=Math.max(row.maxRuntimePosedEdgeMm,...[points[0].distanceTo(points[1]),points[0].distanceTo(points[2]),points[1].distanceTo(points[2])].map(v=>v*.7*1000));
    }
  }
  const surfaces=triangles.map(t=>geometry.Surface(t)),pairs=[];
  for(let a=0;a<5;a++)for(let b=a+1;b<5;b++){const evidence=[];let count=0;
    for(let i=0;i<triangles[a].length;i++){const hit=geometry.Crossing(triangles[a][i],surfaces[b]);if(hit){count++;if(evidence.length<8)evidence.push({a:ids[a][i],b:ids[b][hit.index],point:hit.point.toArray()});}}
    pairs.push({digits:[a,b],crossingTriangles:count,evidence});if(sample.strict&&count)failures.push(sample.name+': digits '+a+'/'+b+' have '+count+' transverse crossing skin triangles');
  }
  const coverage=triangles.map((list,digit)=>({digit,triangles:list.length}));for(const row of coverage)assert(row.triangles>100,'Missing real digit surface '+row.digit);
  assert.equal(pairs.length,10,'Every unordered digit pair must be inspected');
  let gunDepth=null;
  if(gun&&!sample.motion&&sample.from===sample.to&&['packetBolt','packetBoltClear'].includes(sample.from)){
    const spec=FPS_HAND_SHAPES.packetBolt,turn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),gun.turnAngle),rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...spec.rotation,'YXZ')).premultiply(turn),position=new THREE.Vector3(...spec.palmOffset).applyQuaternion(turn).add(new THREE.Vector3(...gun.knob));
    const palm=rig.bones.r.hand.matrixWorld.clone().multiply(new THREE.Matrix4().compose(rig.anatomy.r.frame.position,rig.anatomy.r.frame.quaternion,new THREE.Vector3(1,1,1))),toGun=new THREE.Matrix4().compose(position,rotation,new THREE.Vector3(.007,.007,.007)).multiply(palm.invert());
    gunDepth={vertices:0,maxDepthMm:0,worst:null};for(let mi=0;mi<meshes.length;mi++)for(let i=0;i<meshes[mi].positions.length;i++){
      if(meshes[mi].ownership[i].total<.9999)continue;gunDepth.vertices++;const point=clouds[mi].points[i].clone().applyMatrix4(toGun);
      for(const obstacle of obstacles){if(!obstacle.surface.tree.box.containsPoint(point))continue;const depth=geometry.Interior(obstacle.surface,point).depth*1000;if(depth>gunDepth.maxDepthMm){gunDepth.maxDepthMm=depth;gunDepth.worst={mesh:meshes[mi].name,vertex:i,obstacle:obstacle.name,point:point.toArray()};}}
    }
    if(gunDepth.maxDepthMm>2)failures.push(sample.name+': real closed gun shell penetration '+gunDepth.maxDepthMm.toFixed(3)+' mm');
  }
  report.cases.push({...sample,coverage,pairs,crossingTriangles:pairs.reduce((s,p)=>s+p.crossingTriangles,0),deformation:deformation.map((r,digit)=>({digit,...r,areaBelow10Percent:100*r.areaBelow10/r.bindArea,areaBelow25Percent:100*r.areaBelow25/r.bindArea,stretchOver3Percent:100*r.stretchOver3/r.bindArea,opposingAreaPercent:100*r.opposingArea/r.bindArea})),gunDepth});
}
report.failures=failures;
if(motionReport){
  motionReport.failedFrames=motionReport.frames.filter(frame=>report.cases[frame.stateIndex].crossingTriangles>0).map(frame=>({...frame,crossingTriangles:report.cases[frame.stateIndex].crossingTriangles}));
}
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({side,cases:report.cases.length,strict:report.cases.filter(c=>c.strict).length,failures:failures.length,output,
  motion:motionReport?{frames:motionReport.frames.length,uniqueAddedStates:motionReport.uniqueAddedStates,failedFrames:motionReport.failedFrames.length}:null,
  nonzero:report.cases.filter(c=>c.crossingTriangles).map(c=>({name:c.name,strict:c.strict,crossingTriangles:c.crossingTriangles})),gun:report.cases.filter(c=>c.gunDepth).map(c=>({name:c.name,...c.gunDepth}))},null,2));
if(!reportOnly)assert.deepEqual(failures,[],'Actual packet skin self-contact regression');
