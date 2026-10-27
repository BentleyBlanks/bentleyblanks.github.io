// Test the delivered bytes independently: physical envelope, live hinges, UV/PBR and finite geometry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {LoadGlb,ReadAccessor,ReadAccessorInt} from './_import/Script_LugouGlbPose.mjs';
const dir=process.env.KI4_ASSET_ROOT??path.join(import.meta.dirname,'Model/NakajimaKi4');
const glb=LoadGlb(path.join(dir,'Model_NakajimaKi4.glb')),g=glb.json;
const contract=JSON.parse(fs.readFileSync(path.join(dir,'Data_ReferenceContract.json'),'utf8'));
const audit=JSON.parse(fs.readFileSync(path.join(dir,'Data_ExportAudit.json'),'utf8'));
if(audit.releaseProfile==='ReferenceV48GameRelease'){
 await import('./Script_NakajimaKi4ReleaseAssetTest.mjs');
 process.exit(0);
}
assert.equal(crypto.createHash('sha256').update(glb.buffer).digest('hex'),audit.runtime.sha256,'delivered bytes retain their reviewed identity');
assert.equal(audit.cowlEngineClearance?.trueTriangleIntersections,0,'hash-bound actual fixed cowl/engine triangle check passed');
assert.equal(audit.observerGlassClearance?.trueTriangleIntersections,0,'hash-bound actual parked observer frame/glazing triangle check passed');
assert.ok(audit.aileronNoseCove?.actualGlbReimport&&audit.aileronNoseCove.maxActualSurfaceDistanceM<.0014,'hash-bound actual aileron nose/cove surface queries passed');
assert.ok(audit.aileronNoseCove.maxHighToGameNormalDifferenceDegrees<5,'actual game hinge skin retains the high-source normal field');
assert.ok(audit.upperWingSpars?.actualGlbReimport&&audit.upperWingSpars.maxRuntimeSurfaceDistanceM<.002,'actual upper struts meet the straight-spar installation');
assert.ok(audit.lowerWingSpars?.actualGlbReimport&&audit.lowerWingSpars.maxRuntimeSurfaceDistanceM<.002,'actual lower wires/struts meet the straight480mm spar installation');
for(const [name,expected]of Object.entries(audit.scripts)){const source=fs.readFileSync(path.join(import.meta.dirname,'_blender',name),'utf8').replace(/\r\n/g,'\n');assert.equal(crypto.createHash('sha256').update(source).digest('hex'),expected,name+' retains its reviewed LF-normalized source identity');}
const observerMetadata=g.nodes.find(n=>n.name==='NakajimaKi4').extras;
const surfaceProfile=observerMetadata.fuselageSurfaceProfile??'LegacySurfaceV2';
assert.ok(['LegacySurfaceV2','Photo02QuietRoughness'].includes(surfaceProfile));
if(observerMetadata.fuselageSurfaceProfile)assert.equal(audit.source.fuselageSurfaceProfile,surfaceProfile);
const changedMaterialFiles=audit.changedPrimaryMaterialFiles??[];
assert.ok(changedMaterialFiles.every(p=>surfaceProfile==='Photo02QuietRoughness'&&p.file==='Texture_Ki4FuselageOrm.png'&&p.aoMetallicBytesRetained&&JSON.stringify(p.changedChannels)==='["G"]'),'only the declared body roughness channel may differ from its material baseline');
if(surfaceProfile==='Photo02QuietRoughness'){
 const adjustment=audit.fuselageRoughnessAdjustment,expected='64111b2ce75cca5803731a0e9dc5b2d7c5018ad0f3df72b70f50fbf8317a5726';
 assert.equal(adjustment?.factor,.25);assert.equal(adjustment.reviewedDecodedRgbSha256,expected);assert.equal(adjustment.actualExportedDecodedRgbSha256,expected);
 assert.equal(audit.pbrImages.find(p=>p.name==='Texture_Ki4FuselageOrm')?.decodedRgbSha256,expected,'actual exported roughness map retains the reviewed pixels');
}
if(observerMetadata.servicePhotoCameraProfile){
 assert.ok(['Photo02LegacyCamera','Photo02VisibleArcCamera'].includes(observerMetadata.servicePhotoCameraProfile));
 assert.equal(audit.source.servicePhotoCameraProfile,observerMetadata.servicePhotoCameraProfile,'declared service-photo alignment agrees with the reopened source');
 if(observerMetadata.servicePhotoCameraProfile==='Photo02VisibleArcCamera'){
  const clearance=audit.source.servicePanelApertureClearance?.componentClearance;
  assert.ok(clearance?.actualSourceTriangles&&clearance.pairs===138&&clearance.trueTriangleIntersections===0,'all actual outlet/louvre component pairs remain clear under the new photo alignment');
 }
}
if(['Photo02LowerEnvelope','Photo02Envelope','Photo02InstallationEnvelope'].includes(observerMetadata.fuselageExteriorProfile)){
 assert.equal(audit.source.fuselageExteriorProfile,observerMetadata.fuselageExteriorProfile);
 assert.deepEqual(JSON.parse(observerMetadata.lowerExteriorOffsetsJson),audit.source.lowerExteriorOffsets,'current outer-profile metadata agrees with the reopened source');
 assert.ok(observerMetadata.lowerExteriorShapeScope.includes('hypothesis'),'exterior trial remains explicitly inferred');
}
if(['Photo02Envelope','Photo02InstallationEnvelope'].includes(observerMetadata.fuselageExteriorProfile)){
 assert.deepEqual(JSON.parse(observerMetadata.upperExteriorOffsetsJson),audit.source.upperExteriorOffsets,'upper profile agrees with the reopened source');
 assert.ok(observerMetadata.upperExteriorShapeScope.includes('hypothesis'));
}
if(['Photo02GroupedBanks','Photo02RecessedBanks'].includes(observerMetadata?.servicePanelProfile)){
 const spec=JSON.parse(observerMetadata.engineVentBanksJson),parts=g.nodes.filter(n=>n.mesh!==undefined).flatMap(n=>n.extras?.sourceParts??[n.name]);
 assert.equal(spec.Upper.count,6);assert.equal(spec.Lower.count,7);
 for(const side of [-1,1])for(const [row,count]of [['Upper',6],['Lower',7]]){
  for(const name of ['EngineLouvreBank'+row+'Backing'+side,'EngineLouvreBank'+row+'Rim'+side,'EngineLouvreSingle'+row+'Backing'+side,'EngineLouvreSingle'+row+'Rim'+side,'EngineLouvreSingle'+row+'Hood'+side])assert.ok(parts.includes(name),name+' retained');
  assert.equal(parts.filter(name=>name.startsWith('EngineLouvreBank'+row+'Slat'+side+'_')).length,count,'actual grouped slat count');
 }
 if(observerMetadata.servicePanelProfile==='Photo02GroupedBanks')assert.ok(audit.source.servicePanelRecessClearance?.minOutsideSkinGapM>.00025,'hash-bound actual backing geometry stays outside the curved skin');
 else{
  const source=audit.source.servicePanelApertureClearance,runtime=audit.servicePanelApertureClearance;
  assert.equal(source?.actualApertures,10);assert.equal(source?.retainedSkinObstructions,0);assert.equal(source?.parts.length,10);
  assert.ok(source.parts.every(p=>p.unobstructedSourceExitRays>=5&&p.minNearestSkinDistanceM>.012&&p.minOutwardNormalDot>.5));
  assert.ok(runtime?.actualGlbReimport&&runtime.sourceExitRaySamples===source.unobstructedSourceExitRays&&runtime.runtimeObstructions===0,'actual runtime preserves every clear source aperture exit ray');
 }
}
if(observerMetadata?.geometryAo?.seamStitchingEnabled){
 const proof=audit.aoFieldAgreement;
 assert.ok(proof?.ok&&proof.samples===35&&proof.tolerance===1/255&&proof.maxAoDifference<=1/255,'independent actual high/game AO field proof passed');
 assert.equal(proof.runtimeSha256,audit.runtime.sha256);assert.equal(proof.highSha256,audit.high.sha256);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(import.meta.dirname,'Script_NakajimaKi4AoFieldTest.mjs'),'utf8').replace(/\r\n/g,'\n')).digest('hex'),proof.testScriptSha256,'AO field proof retains its independent test source');
}
if(observerMetadata?.observerConfiguration==='Photo02Carrier'){
 assert.ok(audit.observerCarrierConnections?.maxCrossshaftAxisErrorM<.00001,'hash-bound source carrier and side caps share the same low shaft');
 assert.ok(audit.observerCarrierConnections.feet.length===2&&audit.observerCarrierConnections.feet.every(foot=>Math.min(...foot.signedRingDistancesM)<-.009),'both actual source rear feet enter the ring tube');
 const optionalNames=JSON.parse(observerMetadata.optionalObserverArmamentJson);
 const exportedParts=g.nodes.filter(n=>n.mesh!==undefined).flatMap(n=>n.extras?.sourceParts??[n.name]);
 assert.equal(new Set(optionalNames).size,28,'the optional twin exterior is explicitly accounted for');
 assert.ok(optionalNames.every(name=>!exportedParts.includes(name)),'default exported bytes omit the unresolved twin exterior');
 for(const name of ['ObserverGunCradleRailLeft','ObserverGunCradleRailRight','ObserverGunTrunnionBearingLeft','ObserverGunTrunnionBearingRight','ObserverGunCradleCrossbar-0.07','ObserverGunCradleCrossbar0.18','ObserverGunCentralRib'])assert.ok(exportedParts.includes(name),'retain the independently movable carriage part '+name);
}
const Id=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function Multiply(a,b){const o=Array(16).fill(0);for(let r=0;r<4;r++)for(let c=0;c<4;c++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
function Matrix(n){if(n.matrix)return n.matrix;const[x,y,z,w]=n.rotation??[0,0,0,1],sx=n.scale?.[0]??1,sy=n.scale?.[1]??1,sz=n.scale?.[2]??1;const t=n.translation??[0,0,0];return[(1-2*(y*y+z*z))*sx,2*(x*y+w*z)*sx,2*(x*z-w*y)*sx,0,2*(x*y-w*z)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+w*x)*sy,0,2*(x*z+w*y)*sz,2*(y*z-w*x)*sz,(1-2*(x*x+y*y))*sz,0,...t,1];}
function Transform(m,p){return[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
const world=new Map(),parents=new Map(),points=[];
function Visit(i,m){const n=g.nodes[i],w=Multiply(m,Matrix(n));world.set(i,w);if(n.mesh!==undefined)for(const p of g.meshes[n.mesh].primitives){const a=ReadAccessor(glb,p.attributes.POSITION).data;for(let k=0;k<a.length;k+=3)points.push(Transform(w,a.subarray(k,k+3)));}for(const c of n.children??[]){parents.set(c,i);Visit(c,w);}}
for(const i of g.scenes[g.scene??0].nodes)Visit(i,Id);
const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of points)for(let a=0;a<3;a++){min[a]=Math.min(min[a],p[a]);max[a]=Math.max(max[a],p[a]);}const dimensions=max.map((x,i)=>x-min[i]);
assert.ok(Math.abs(dimensions[0]-12)<.002,'12m upper span, measured from actual world vertices');
assert.ok(Math.abs(dimensions[1]-3.31)<.04,'manual approximate 3.31m height');
const geometryProfile=g.nodes.find(n=>n.name==='NakajimaKi4')?.extras?.geometryProfile??'ManualV3';
assert.ok(['ManualV3','PhotoMountCandidateV4'].includes(geometryProfile),'declared supported geometry profile');
const expectedLength=geometryProfile==='PhotoMountCandidateV4'?7.73:8.25;
assert.equal(contract.dimensionsM.length,expectedLength,'configuration contract declares its own length');
assert.ok(Math.abs(dimensions[2]-expectedLength)<.05,'actual length matches the explicitly declared configuration');
function NodePoints(i){const result=[],n=g.nodes[i];assert.ok(n.mesh!==undefined,n.name+' has actual geometry');for(const p of g.meshes[n.mesh].primitives){const a=ReadAccessor(glb,p.attributes.POSITION).data;for(let k=0;k<a.length;k+=3)result.push(Transform(world.get(i),a.subarray(k,k+3)));}return result;}
function NamedIndex(name){const i=g.nodes.findIndex(n=>n.name===name);assert.ok(i>=0,name);return i;}
function Extent(pts,axis){let lo=Infinity,hi=-Infinity;for(const p of pts){lo=Math.min(lo,p[axis]);hi=Math.max(hi,p[axis]);}return hi-lo;}
function SideArea(i){let area=0;for(const p of g.meshes[g.nodes[i].mesh].primitives){const pos=ReadAccessor(glb,p.attributes.POSITION).data,idx=ReadAccessorInt(glb,p.indices).data;for(let k=0;k<idx.length;k+=3){const [a,b,c]=Array.from(idx.subarray(k,k+3),j=>Transform(world.get(i),pos.subarray(j*3,j*3+3)));area+=Math.abs((b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]))/4;}}return area;}
const finIndex=NamedIndex('VerticalFin'),rudderIndex=NamedIndex('Rudder');
const upperPoints=[];for(let i=0;i<g.nodes.length;i++){const n=g.nodes[i];if(n.mesh!==undefined&&(n.extras?.sourceParts??[n.name]).some(p=>p.startsWith('UpperWing_')||p.startsWith('Aileron_')))for(const p of NodePoints(i))if(p[1]>2.5)upperPoints.push(p);}
assert.ok(Math.abs(Extent(upperPoints,2)-2)<.008,'canvas73 actual2000mm maximum upper-wing outline chord');
const wingOffsetY=observerMetadata.wingInstallationOffsetBlenderM?.[1]??0;
const wingTipPoints=upperPoints.filter(p=>Math.abs(p[0])>5.9999);assert.ok(wingTipPoints.length&&Math.abs(wingTipPoints.reduce((s,p)=>s-p[2],0)/wingTipPoints.length-(1.3984+wingOffsetY))<.005,'actual rounded wing tip follows the manual position in its declared installation frame');
const lowerPlanPoints=[];for(let i=0;i<g.nodes.length;i++){const n=g.nodes[i];if(n.mesh!==undefined&&(n.extras?.sourceParts??[n.name]).some(p=>p.startsWith('LowerWing_')))for(const p of NodePoints(i))if(p[1]<2.1)lowerPlanPoints.push(p);}
assert.ok(Math.abs(Extent(lowerPlanPoints,0)-8.52)<.002&&Math.abs(Extent(lowerPlanPoints,2)-1.25)<.008,'actual lower wing retains approximate8520mm span and nominal1250mm chord');
const finArea=SideArea(finIndex),rudderArea=SideArea(rudderIndex);
assert.ok(finArea>.58&&finArea<.61,'fixed fin retains the manual silhouette and the proper rectangular balance-horn notch');
assert.ok(rudderArea>1.385&&rudderArea<1.415,'rudder includes the full rectangular balance horn and lower silhouette');
assert.ok(Math.abs(Extent([...NodePoints(finIndex),...NodePoints(rudderIndex)],1)-1.8085)<.003,'canvas84 actual 1808.5mm tail height');
const tailFrame=world.get(NamedIndex('Frame_VerticalTailIncidence'));
const rudderBodyPoints=NodePoints(rudderIndex).map(p=>{const d=[p[0]-tailFrame[12],p[1]-tailFrame[13],p[2]-tailFrame[14]];return[0,1,2].map(i=>d[0]*tailFrame[i*4]+d[1]*tailFrame[i*4+1]+d[2]*tailFrame[i*4+2]);});
const rudderPostChords=rudderBodyPoints.map(p=>p[2]+Math.tan(8*Math.PI/180)*p[1]);
assert.ok(Math.abs(Math.max(...rudderPostChords)-.875)<.003,'canvas84 actual 875mm aft chord from the inclined post');
assert.ok(Math.abs(-Math.min(...rudderPostChords)-.205)<.003,'canvas84 actual 205mm balance horn');
const rudderCrown=rudderBodyPoints.filter(p=>p[1]+1.81>3.2284);
assert.ok(rudderCrown.length>0&&rudderCrown.every(p=>Math.abs(p[2]+Math.tan(8*Math.PI/180)*p[1]-.165)<.005),'traced crown must not fall back to an unrelated first outline vertex');
const hornBand=rudderBodyPoints.filter(p=>p[1]+1.81>2.87&&p[1]+1.81<2.95);
assert.ok(Math.abs(Math.min(...hornBand.map(p=>p[2]+Math.tan(8*Math.PI/180)*p[1]))+.205)<.003,'the horn has a full forward edge rather than a triangular sliver');
const finBodyPoints=NodePoints(finIndex).map(p=>{const d=[p[0]-tailFrame[12],p[1]-tailFrame[13],p[2]-tailFrame[14]];return[0,1,2].map(i=>d[0]*tailFrame[i*4]+d[1]*tailFrame[i*4+1]+d[2]*tailFrame[i*4+2]);});
const upperFinChords=finBodyPoints.filter(p=>p[1]+1.81>2.87&&p[1]+1.81<3.10).map(p=>p[2]+Math.tan(8*Math.PI/180)*p[1]);
assert.ok(Math.max(...upperFinChords)<-.206&&Math.max(...upperFinChords)>-.215,'fixed-fin notch leaves a narrow gap around the205mm balance horn');
const lowerFinChords=finBodyPoints.filter(p=>p[1]+1.81>1.95&&p[1]+1.81<2.70).map(p=>p[2]+Math.tan(8*Math.PI/180)*p[1]);
assert.ok(Math.max(...lowerFinChords)<-.001&&Math.max(...lowerFinChords)>-.005,'main fin-to-rudder gap stays within1..5mm');
const tailPoints=[];for(let i=0;i<g.nodes.length;i++){const n=g.nodes[i];if(n.mesh!==undefined&&(n.name.startsWith('Elevator_')||(n.extras?.sourceParts??[]).some(p=>p.startsWith('Tailplane_'))))tailPoints.push(...NodePoints(i));}
assert.ok(Math.abs(Extent(tailPoints,0)-4.36)<.003,'canvas83 actual horizontal-tail span');
assert.ok(Math.abs(Extent(tailPoints,2)-1.407)<.003,'canvas83 actual horizontal-tail chord');
const bodyPoints=NodePoints(NamedIndex('Fuselage_Monocoque'));
function VerticalSkinHeight(x,z){
 let height=-Infinity;
 for(const primitive of g.meshes[g.nodes[NamedIndex('Fuselage_Monocoque')].mesh].primitives){
  const positions=ReadAccessor(glb,primitive.attributes.POSITION).data,indices=ReadAccessorInt(glb,primitive.indices).data,m=world.get(NamedIndex('Fuselage_Monocoque'));
  for(let k=0;k<indices.length;k+=3){
   const[a,b,c]=Array.from(indices.subarray(k,k+3),i=>Transform(m,positions.subarray(i*3,i*3+3)));
   const ux=b[0]-a[0],uz=b[2]-a[2],vx=c[0]-a[0],vz=c[2]-a[2],den=ux*vz-vx*uz;
   if(Math.abs(den)<1e-12)continue;
   const dx=x-a[0],dz=z-a[2],u=(dx*vz-vx*dz)/den,v=(ux*dz-dx*uz)/den;
   if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)height=Math.max(height,a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]));
  }
 }
 return height;
}
const glassIndex=g.nodes.findIndex(n=>n.mesh!==undefined&&(n.extras?.sourceParts??[]).includes('Windscreen1'));
assert.ok(glassIndex>=0,'actual glass assembly is identifiable');
const glassPoints=NodePoints(glassIndex);
const windscreenFootGapsM=[];
for(const station of [.5883,-.3712])for(const side of [-1,1]){
 const feet=glassPoints.filter(p=>Math.abs(p[0]-side*.29)<.00001&&Math.abs(p[2]+station)<.00001);assert.ok(feet.length,'actual windscreen lower corner');
 const foot=feet[0],gap=foot[1]-VerticalSkinHeight(foot[0],foot[2]);
 assert.ok(gap>.003&&gap<.009,'actual windscreen frame seats within its6mm tube radius of the real curved mounting skin');
 windscreenFootGapsM.push({stationBlenderY:station,side,gapM:gap});
}
assert.ok(Extent(bodyPoints,1)>1.50&&Extent(bodyPoints,1)<1.52,'oval fuselage with raised inter-cockpit shoulder');
const frame1Points=bodyPoints.filter(p=>Math.abs(p[2]+.78)<.06);
assert.ok(Extent(frame1Points,1)>1.42&&Extent(frame1Points,1)<1.44,'bay-calibrated tall oval frame1');
assert.ok(Math.abs(Math.max(...bodyPoints.map(p=>p[2]+Math.tan(8*Math.PI/180)*(p[1]-1.810)))-3.82)<.002,'fuselage skin terminates at the inclined rudder post');
const Required=contract.requiredPivots;
for(const name of Required){const i=g.nodes.findIndex(n=>n.name===name);assert.ok(i>=0,name);assert.ok(g.nodes[i].children?.length>0,name+' retains geometry');assert.deepEqual(g.nodes[i].scale??[1,1,1],[1,1,1],name+' has no nonuniform scaling');assert.ok(g.nodes[i].extras?.hingeAxis,name+' declares exported local hinge axis');}
function Hinge(name){const i=g.nodes.findIndex(n=>n.name===name);return{node:g.nodes[i],position:Transform(world.get(i),[0,0,0])};}
const prop=Hinge('Pivot_Propeller'),rudder=Hinge('Pivot_Rudder');
for(const side of ['Left','Right'])assert.ok(Math.abs(Math.abs(Hinge('Pivot_Aileron'+side).position[0])-1.85)<.00001,'canvas73 scan-calibrated aileron inboard station; not the former2.40m placement');
const shaftIndex=NamedIndex('Propeller_DriveShaft'),shaftPoints=NodePoints(shaftIndex);
assert.equal(parents.get(shaftIndex),NamedIndex('Pivot_Propeller'),'actual shaft rotates with the propeller');
const shaftOffset=geometryProfile==='PhotoMountCandidateV4'?.548:0;
assert.ok(Math.min(...shaftPoints.map(p=>p[2]))<-(3.31-shaftOffset)-.025&&Math.max(...shaftPoints.map(p=>p[2]))>-(3.10-shaftOffset)+.010,'actual GLB shaft spans the former210mm crankcase-to-hub gap with seated ends');
assert.ok(shaftPoints.every(p=>Math.hypot(p[0],p[1]-1.810)<.0751),'actual shaft stays coaxial inside the case bore');
assert.ok(Math.abs((rudder.position[2]-prop.position[2])-(expectedLength-.875-.100))<.05,'actual propeller/post separation matches the declared configuration');
const left=Hinge('Pivot_WheelLeft'),right=Hinge('Pivot_WheelRight');
assert.ok(Math.abs(right.position[0]-left.position[0]-2.25)<.0001,'manual 2.25m wheel center track');
assert.equal(left.node.extras.rollingRadiusM,.43);assert.equal(right.node.extras.rollingRadiusM,.43);
const tireIndex=g.nodes.findIndex(n=>(n.extras?.sourceParts??[n.name]).includes('Tire_Right'));
assert.ok(tireIndex>=0&&Math.abs(Extent(NodePoints(tireIndex),0)-.300)<.0005,'canvas86 actual300mm tire section width');
const mountIndex=NamedIndex('TailSkidLowerMountBody'),eyeIndex=NamedIndex('TailSkidUpperEye');
const mountMatrix=world.get(mountIndex),mountCenter=mountMatrix.slice(12,15),skidAxis=[mountMatrix[4],mountMatrix[5],mountMatrix[6]];
const mountFaceOffset=Math.max(...NodePoints(mountIndex).map(p=>p.reduce((s,v,i)=>s+(v-mountCenter[i])*skidAxis[i],0)));
const mountFace=mountCenter.map((v,i)=>v+skidAxis[i]*mountFaceOffset),eyePoints=NodePoints(eyeIndex);
const eyeCenter=[0,1,2].map(i=>eyePoints.reduce((s,p)=>s+p[i],0)/eyePoints.length);
assert.ok(Math.abs(Math.hypot(...eyeCenter.map((v,i)=>v-mountFace[i]))-1.000)<.0005,'canvas90 actual1000mm upper-eye-to-shoe-mount length');
assert.ok(eyeCenter[1]>mountFace[1]+.89,'tail-strut eye is at the upper frame and mounting block at the shoe');
assert.equal(prop.node.extras.hingeAxis,'-Z');assert.equal(rudder.node.extras.hingeAxis,'Y');
const rudderMatrix=world.get(NamedIndex('Pivot_Rudder')),rudderAxis=[rudderMatrix[4],rudderMatrix[5],rudderMatrix[6]];
assert.ok(Math.abs(Math.acos(rudderAxis[1]/Math.hypot(...rudderAxis))*180/Math.PI-8)<.001&&rudderAxis[2]<-.13,'actual exported rudder hinge leans8deg toward the nose');
let triangles=0,vertices=0;
for(const mesh of g.meshes)for(const p of mesh.primitives){
 assert.ok(p.attributes.NORMAL!==undefined&&p.attributes.TEXCOORD_0!==undefined,'exported shading normals and UVs');
 const pos=ReadAccessor(glb,p.attributes.POSITION).data,n=ReadAccessor(glb,p.attributes.NORMAL).data,uv=ReadAccessor(glb,p.attributes.TEXCOORD_0).data,idx=ReadAccessorInt(glb,p.indices).data;
 assert.equal(pos.length,n.length);assert.equal(uv.length,pos.length/3*2);assert.equal(idx.length%3,0);
 for(const a of [pos,n,uv])for(const v of a)assert.ok(Number.isFinite(v),'finite exported attribute');
 for(let i=0;i<n.length;i+=3)assert.ok(Math.abs(Math.hypot(n[i],n[i+1],n[i+2])-1)<.001,'unit shading normals');
 for(let i=0;i<idx.length;i+=3){const [a,b,c]=idx.subarray(i,i+3);assert.ok(Math.max(a,b,c)<pos.length/3);const u=[0,1,2].map(k=>pos[b*3+k]-pos[a*3+k]),v=[0,1,2].map(k=>pos[c*3+k]-pos[a*3+k]);assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-12,'no collapsed delivered triangles');}
 triangles+=idx.length/3;vertices+=pos.length/3;
}
assert.ok(contract.surfaceBudget.gameCeilingTriangles<=190000,'reference rebuild has a bounded 190k ceiling');
assert.ok(triangles<=contract.surfaceBudget.gameCeilingTriangles,'retain complete tails, oval hull and measured gear without exceeding the reference rebuild budget');
assert.equal(triangles,audit.runtime.triangles);assert.equal(g.meshes.length,audit.runtime.meshes);
assert.ok(g.meshes.length<=40,'static merging preserves efficient rendering without merging hinges');
const hasGeometryAo=!!g.nodes.find(n=>n.name==='NakajimaKi4')?.extras?.geometryAo?.enabled;
const observerFinish=observerMetadata?.observerFinish??'DarkSteel';assert.ok(['DarkSteel','PaintedGray'].includes(observerFinish));
const materialSets=['Fuselage','Linen','RibTape','TailFabric','Cowl','Aluminum','EngineCast','Steel','Rubber','Exhaust','Leather'];
if(observerFinish==='PaintedGray')materialSets.push('PaintedFrame');
assert.equal(g.images.length,materialSets.length*3+(hasGeometryAo?1:0),'retain every primary PBR set plus the explicitly declared coating/AO profile');
const expectedImages=materialSets.flatMap(n=>['Base','Normal','Orm'].map(c=>'Texture_Ki4'+n+c));if(hasGeometryAo)expectedImages.push('Texture_Ki4GeometryAo');
if(observerFinish==='PaintedGray'){
 const declared=JSON.parse(observerMetadata.observerPaintedPartsJson),actual=new Set();assert.equal(new Set(declared).size,21);
 for(const node of g.nodes){if(node.mesh===undefined)continue;for(const primitive of g.meshes[node.mesh].primitives)if(g.materials[primitive.material].name==='Material_ObserverPaintedMetal')for(const part of node.extras?.sourceParts??[node.name])actual.add(part);}
 assert.deepEqual(actual,new Set(declared),'actual coated primitives are exactly the21 carriage parts');
 const protectedFiles=materialSets.filter(name=>name!=='PaintedFrame').flatMap(name=>['Base','Normal','Orm'].map(channel=>'Texture_Ki4'+name+channel+'.png'));
 assert.ok(protectedFiles.every(name=>audit.unchangedPrimaryMaterialFiles.includes(name)||changedMaterialFiles.some(p=>p.file===name)),'all prior material channels retain exact bytes except the one explicitly reviewed body roughness map');
 assert.deepEqual(audit.addedMaterialSets,audit.baselineMaterialSets.includes('PaintedFrame')?[]:['PaintedFrame']);
 assert.deepEqual(audit.paintedFrameOrmExtrema[2],[0,0],'actual coating ORM is dielectric');
}
assert.deepEqual(new Set(g.images.map(i=>i.name)),new Set(expectedImages),'each authored PBR channel and declared AO atlas is embedded exactly once');
for(const image of g.images){assert.ok(image.bufferView!==undefined,'self-contained GLB');assert.ok(['image/png','image/webp'].includes(image.mimeType));}
for(const m of g.materials){if(/Shadow|InstrumentFaces|Windscreen/.test(m.name))continue;assert.ok(m.pbrMetallicRoughness.baseColorTexture,m.name+' Base');assert.ok(m.normalTexture,m.name+' Normal');assert.ok(m.pbrMetallicRoughness.metallicRoughnessTexture,m.name+' MR');assert.ok(m.occlusionTexture,m.name+' AO');if(hasGeometryAo){assert.equal(m.occlusionTexture.texCoord,1,m.name+' unique AO UV1');assert.equal(g.images[g.textures[m.occlusionTexture.index].source].name,'Texture_Ki4GeometryAo');for(const t of [m.pbrMetallicRoughness.baseColorTexture,m.pbrMetallicRoughness.metallicRoughnessTexture,m.normalTexture])assert.equal(t.texCoord??0,0,m.name+' original material UV0');}else assert.equal(m.occlusionTexture.index,m.pbrMetallicRoughness.metallicRoughnessTexture.index,m.name+' consistent ORM packing');}
if(hasGeometryAo)for(const mesh of g.meshes)for(const p of mesh.primitives){const m=g.materials[p.material];if(!m.name.includes('Windscreen'))assert.ok(p.attributes.TEXCOORD_1!==undefined,'AO surface retains actual exported UV1');}
assert.ok(!g.animations?.length,'author node controls are explicit; no accidental baked whole-model animation');
const glassMaterial=g.materials.find(m=>m.name==='Material_Windscreen');
assert.equal(glassMaterial.alphaMode??'OPAQUE','OPAQUE','windscreen uses complete surface coverage rather than alpha holes');
assert.equal(glassMaterial.pbrMetallicRoughness.baseColorFactor?.[3]??1,1,'actual glass surface coverage is complete');
assert.ok(glassMaterial.extensions?.KHR_materials_transmission?.transmissionFactor>.9,'glass transparency is exported as light transmission');
console.log(JSON.stringify({ok:true,triangles,vertices,meshes:g.meshes.length,images:g.images.length,dimensionsM:dimensions,pivots:Required.length,finAreaM2:finArea,rudderAreaM2:rudderArea,windscreenFootGapsM}));
