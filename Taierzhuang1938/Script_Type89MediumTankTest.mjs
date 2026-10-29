// Independent checks against the actual shipped glTF scene, including instances.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {LoadGlb,ReadAccessor} from './_import/Script_LugouGlbPose.mjs';
import {AuditEnclosedShoeCleanup,VerifyRejectsExternalRemoval} from './_blender/Script_Type89EnclosedSurfaceAudit.mjs';
import {OPTIONAL_VEHICLE_ASSETS} from './Data_VehicleAssets.mjs';
import {MESHES} from './Data_Meshes.mjs';
import {createHash} from 'node:crypto';

const here=path.dirname(fileURLToPath(import.meta.url));
const fileArgument=process.argv.find(value=>value.startsWith('--file='))?.slice(7);
const contractArgument=process.argv.find(value=>value.startsWith('--contract='))?.slice(11);
const file=fileArgument?path.resolve(fileArgument):path.join(here,'Model/Type89MediumTank/Model_Type89MediumTank.glb');
const glb=LoadGlb(file),g=glb.json;
const contract=JSON.parse(fs.readFileSync(contractArgument?path.resolve(contractArgument):path.join(here,'Model/Type89MediumTank/Data_ReferenceContract.json'),'utf8'));
let failures=0,checks=0;
function Check(condition,name,detail=''){checks++;if(!condition)failures++;console.log(`${condition?'ok  ':'FAIL'} ${name}${detail?'  '+detail:''}`);}
function Matrix(node){
  if(node.matrix)return node.matrix;
  const [x,y,z,w]=node.rotation??[0,0,0,1],[sx,sy,sz]=node.scale??[1,1,1],[tx,ty,tz]=node.translation??[0,0,0];
  return [(1-2*(y*y+z*z))*sx,2*(x*y+w*z)*sx,2*(x*z-w*y)*sx,0,2*(x*y-w*z)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+w*x)*sy,0,2*(x*z+w*y)*sz,2*(y*z-w*x)*sz,(1-2*(x*x+y*y))*sz,0,tx,ty,tz,1];
}
function Multiply(a,b){const out=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
let triangles=0,nonFinite=0,normalError=0,degenerate=0;
const cannon=[];
const nodesByName=new Map(g.nodes.map(node=>[node.name,node]));
const optionalAsset=OPTIONAL_VEHICLE_ASSETS.find(asset=>asset.id==='Type89MediumTank');
Check(optionalAsset?.campaignEnabled===false&&optionalAsset.scale===1,'Reference tank is an opt-in vehicle at native metric scale');
Check(optionalAsset?.url.split('?')[0]==='./Model/Type89MediumTank/Model_Type89MediumTank.glb'&&optionalAsset.trackPathUrl.split('?')[0]==='./Model/Type89MediumTank/Data_TrackPath.json','Configured model and motion path use the shipped asset pair');
Check(MESHES.Type89Tank.file==='Model_Type89Tank.tzm.json','Existing campaign tank keeps its original model');
function Walk(index,parent){
  const node=g.nodes[index],world=Multiply(parent,Matrix(node));
  Check(!node.name?.startsWith('BakeProxy')&&!node.name?.startsWith('High_'),'Only the selected articulated model is exported: '+node.name);
  if(node.mesh!==undefined)for(const primitive of g.meshes[node.mesh].primitives){
    const positions=ReadAccessor(glb,primitive.attributes.POSITION),normal=ReadAccessor(glb,primitive.attributes.NORMAL);
    const indices=primitive.indices===undefined?Array.from({length:positions.count},(_,i)=>i):ReadAccessor(glb,primitive.indices).data;
    triangles+=indices.length/3;
    for(let i=0;i<positions.count;i++){
      const [x,y,z]=positions.data.slice(i*3,i*3+3),point=[world[0]*x+world[4]*y+world[8]*z+world[12],world[1]*x+world[5]*y+world[9]*z+world[13],world[2]*x+world[6]*y+world[10]*z+world[14]];
      for(let axis=0;axis<3;axis++){if(!Number.isFinite(point[axis]))nonFinite++;low[axis]=Math.min(low[axis],point[axis]);high[axis]=Math.max(high[axis],point[axis]);}
      normalError=Math.max(normalError,Math.abs(Math.hypot(...normal.data.slice(i*3,i*3+3))-1));
      if(node.name==='Mesh_MainGunRecoil')cannon.push(point);
    }
    for(let i=0;i<indices.length;i+=3){
      const a=positions.data.slice(indices[i]*3,indices[i]*3+3),b=positions.data.slice(indices[i+1]*3,indices[i+1]*3+3),c=positions.data.slice(indices[i+2]*3,indices[i+2]*3+3);
      const u=b.map((value,k)=>value-a[k]),v=c.map((value,k)=>value-a[k]);
      if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-12)degenerate++;
    }
  }
  for(const child of node.children??[])Walk(child,world);
}
for(const root of g.scenes[g.scene??0].nodes)Walk(root,identity);
Check(triangles===contract.runtimeRenderedTriangles&&triangles<=contract.runtimeTriangleCeiling,'Vehicle budget counts every repeated shoe after certified export cleanup',String(triangles));
const selectedGame=contract.selectedGameSourceTrianglesBeforeCleanup??triangles;
const versionBudgets={'20261025GeometryV34':[360000,378000],'20261025GeometryV35':[400000,420000],'20261026GeometryV36':[400000,420000],'20261026GeometryV37':[400000,420000],'20261026GeometryV38':[400000,420000],'20261026GeometryV39':[400000,420000],'20261026GeometryV40':[400000,420000],'20261026GeometryV41':[400000,420000],'20261026GeometryV42':[400000,420000],'20261027GeometryV43':[400000,420000],'20261027GeometryV44':[400000,420000],'20261027GeometryV46':[400000,420000],'20261027GeometryV47':[400000,420000],'20261027GeometryV48':[400000,420000],'20261027GeometryV54':[400000,420000]},versionBudget=versionBudgets[contract.geometryVersion];
let enclosedAudit,enclosedError;try{enclosedAudit=AuditEnclosedShoeCleanup(glb);}catch(error){enclosedError=String(error);}
const enclosedRequired=['20261027GeometryV47','20261027GeometryV48','20261027GeometryV54'].includes(contract.geometryVersion),removedEnclosed=enclosedAudit?.removedRenderedTriangles??0;
Check(!enclosedError&&enclosedAudit?.pass&&(!enclosedRequired||removedEnclosed>0)&&removedEnclosed===(contract.exportRemovedWhollyEnclosedTriangles??0),'Every removed enclosed shoe triangle is independently inside the actual current casting',enclosedError??JSON.stringify(enclosedAudit));
if(removedEnclosed){let rejection,error;try{rejection=VerifyRejectsExternalRemoval(glb);}catch(e){error=String(e);}Check(rejection?.pass&&!error,'Same-count deletion of an exposed casting face is independently rejected',error??JSON.stringify(rejection));}
const selectedVisible=selectedGame-removedEnclosed,budgetPolicy=removedEnclosed?'PreserveSelectedVisibleGameTopologyWithinFivePercentWithCertifiedEnclosure':'PreserveSelectedGameTopologyWithinFivePercent';
Check(versionBudget&&contract.runtimeTriangleTarget===versionBudget[0]&&contract.runtimeTriangleCeiling===versionBudget[1]&&(!removedEnclosed||contract.selectedGameVisibleSourceTrianglesBeforeZeroAreaCleanup===selectedVisible)&&(triangles<=versionBudget[0]||((selectedVisible-versionBudget[0])/selectedVisible<=.05&&contract.budgetPolicy===budgetPolicy)),'Declared per-version fidelity budget retains all visible cast topology within the existing five-percent policy',JSON.stringify({selectedGame,certifiedEnclosed:removedEnclosed,selectedVisible,actual:triangles,target:contract.runtimeTriangleTarget,ceiling:contract.runtimeTriangleCeiling}));
const removedZeroArea=(g.asset.extras?.Type89ZeroAreaCleanup??[]).reduce((sum,row)=>sum+row.removedRenderedTriangles,0);
const triangulation=g.asset.extras?.Type89TriangulationAccounting,triangulationZero=triangulation?.removedRenderedZeroAreaTriangles??0;
if(triangulationZero)Check(triangulation.sourceRenderedTriangles===selectedGame&&triangulation.sourceRenderedTriangles-triangulation.explicitRenderedTrianglesBeforeCleanup===triangulationZero&&triangulation.rows.reduce((s,row)=>s+row.removedRenderedZeroAreaTriangles,0)===triangulationZero&&triangulation.rows.every(row=>row.changedPolygons.every(face=>face.positiveTrianglesExact&&face.before-face.after===face.removedZeroAreaTriangles)),'Explicit triangulation accounts only independently witnessed zero-area fans',JSON.stringify(triangulation));
Check(selectedGame-triangles===removedZeroArea+removedEnclosed+triangulationZero&&contract.exportRemovedZeroAreaTriangles===removedZeroArea&&triangulationZero===(contract.exportTriangulationZeroAreaTriangles??0),'Every source/export triangle difference has separate zero-area and certified-enclosure accounting',JSON.stringify({removedZeroArea,removedEnclosed,triangulationZero}));
Check(nonFinite===0&&normalError<2e-4&&degenerate===0,'Finite geometry, unit normals, noncollapsed triangles',JSON.stringify({nonFinite,normalError,degenerate}));
let tangentMissing=0,tangentUnitError=0,tangentDotError=0,tangentHandednessErrors=0;
for(const mesh of g.meshes)for(const primitive of mesh.primitives){
  if(!g.materials[primitive.material].normalTexture)continue;
  if(primitive.attributes.TANGENT===undefined){tangentMissing++;continue;}
  const normals=ReadAccessor(glb,primitive.attributes.NORMAL).data,tangents=ReadAccessor(glb,primitive.attributes.TANGENT).data;
  for(let i=0;i<normals.length/3;i++){
    tangentUnitError=Math.max(tangentUnitError,Math.abs(Math.hypot(...tangents.slice(i*4,i*4+3))-1));
    tangentDotError=Math.max(tangentDotError,Math.abs(normals[i*3]*tangents[i*4]+normals[i*3+1]*tangents[i*4+1]+normals[i*3+2]*tangents[i*4+2]));
    if(Math.abs(tangents[i*4+3])!==1)tangentHandednessErrors++;
  }
}
Check(tangentMissing===0&&tangentUnitError<2e-4&&tangentDotError<2e-4&&tangentHandednessErrors===0,'Normal-mapped primitives retain unit orthogonal authored tangents and signed handedness',JSON.stringify({tangentMissing,tangentUnitError,tangentDotError,tangentHandednessErrors}));
const size=high.map((value,i)=>value-low[i]);
Check(Math.abs(size[0]-2.18)<.01&&Math.abs(size[1]-2.56)<.015&&Math.abs(size[2]-5.70)<.03&&Math.abs(low[1])<.001,'Measured metre scale and ground origin',JSON.stringify({low,high,size}));
Check(cannon.length>100&&cannon.reduce((sum,point)=>sum+point[2],0)/cannon.length<-.9,'Actual cannon vertex cloud faces -Z');
for(const side of ['Left','Right']){
  const links=g.nodes.filter(node=>node.name?.startsWith('Node_TrackLink'+side));
  const wheels=g.nodes.filter(node=>node.name?.includes(side)&&/^Node_(RoadWheel|LeadingWheel|FrontIdler|RearSprocket|ReturnRoller)/.test(node.name));
  Check(links.length===contract.linksPerSide&&wheels.length===15,'Independent links and all rotating wheel groups: '+side,`${links.length}/${wheels.length}`);
}
for(const name of ['Node_TurretYaw','Node_MainGunPitch','Node_MainGunRecoil','Node_BowMachineGun','Node_TurretMachineGun','Node_CommanderHatchFront','Node_CommanderHatchRear','Node_BowHatch','Node_BowDoorLatch','Node_DriverVisionFlap','Node_DriverPortShutter','Node_EngineHatchLeft','Node_EngineHatchRight'])Check(nodesByName.has(name),'Movable part survives export: '+name);
Check(nodesByName.get('Node_TurretYaw')?.extras?.runtimeAxis==='+Y'&&nodesByName.get('Node_MainGunRecoil')?.extras?.runtimeAxis==='-Z','Source and runtime axes are distinguished');
Check(g.nodes.some(node=>node.extras?.geometryVersion===contract.geometryVersion),'The exported geometry matches this reference contract');

// Test physical openings against the exported triangles, independently of
// dark paint, normal maps or metadata claiming that an opening exists.
const geometryRevision=Number(/GeometryV(\d+)/.exec(contract.geometryVersion)?.[1]||0);
function LocalGeometry(name,armorOnly=false,excludeShadow=false){
  const index=g.nodes.findIndex(node=>node.name===name),vertices=[],faces=[];
  if(index<0)return {vertices,faces};
  function Visit(i,parent,isRoot=false){
    const node=g.nodes[i],matrix=Multiply(parent,isRoot?identity:Matrix(node));
    if(node.mesh!==undefined)for(const primitive of g.meshes[node.mesh].primitives){
      if(armorOnly&&!g.materials[primitive.material].name.endsWith('Armor'))continue;
      if(excludeShadow&&g.materials[primitive.material].name.endsWith('Shadow'))continue;
      const positions=ReadAccessor(glb,primitive.attributes.POSITION).data,indices=ReadAccessor(glb,primitive.indices).data,base=vertices.length;
      for(let k=0;k<positions.length;k+=3){const [x,y,z]=positions.slice(k,k+3);vertices.push([matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]]);}
      for(let k=0;k<indices.length;k+=3)faces.push([base+indices[k],base+indices[k+1],base+indices[k+2]]);
    }
    for(const child of node.children??[])if(!g.nodes[child].name?.startsWith('Node_'))Visit(child,matrix);
  }
  Visit(index,identity,true);return {vertices,faces};
}
const Sub=(a,b)=>a.map((v,i)=>v-b[i]),Dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),Cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function RayHits(geometry,origin,direction,maxDistance){
  for(const face of geometry.faces){
    const [a,b,c]=face.map(i=>geometry.vertices[i]),edge1=Sub(b,a),edge2=Sub(c,a),p=Cross(direction,edge2),det=Dot(edge1,p);
    if(Math.abs(det)<1e-10)continue;
    const t=Sub(origin,a),u=Dot(t,p)/det;if(u<0||u>1)continue;
    const q=Cross(t,edge1),v=Dot(direction,q)/det;if(v<0||u+v>1)continue;
    const distance=Dot(edge2,q)/det;if(distance>1e-6&&distance<maxDistance)return true;
  }
  return false;
}
function FirstSurface(geometry,origin,direction,maxDistance){
  let nearest=Infinity;
  for(const face of geometry.faces){
    const [a,b,c]=face.map(i=>geometry.vertices[i]),edge1=Sub(b,a),edge2=Sub(c,a),p=Cross(direction,edge2),det=Dot(edge1,p);
    if(Math.abs(det)<1e-10)continue;
    const t=Sub(origin,a),u=Dot(t,p)/det;if(u<0||u>1)continue;
    const q=Cross(t,edge1),v=Dot(direction,q)/det;if(v<0||u+v>1)continue;
    const distance=Dot(edge2,q)/det;if(distance>1e-6&&distance<maxDistance)nearest=Math.min(nearest,distance);
  }
  return nearest;
}
if(geometryRevision>=46){
  for(const side of ['Left','Right']){
    const sign=side==='Left'?-1:1,upper=g.nodes.filter(n=>new RegExp('^Node_SuspensionCover'+side+'0[123]$').test(n.name)),lower=g.nodes.filter(n=>new RegExp('^Node_VerticalSkirt'+side+'(Front|Rear)$').test(n.name));
    Check(upper.length===3&&lower.length===2,'Photographed three upper sheets and two distinct lower skirt sheets: '+side);
    function LowerSheetHit(part,y,z){
      const name='Node_VerticalSkirt'+side+part,node=nodesByName.get(name);
      if(!node)return false;
      const t=Matrix(node).slice(12,15),geometry=LocalGeometry(name,true);
      return RayHits(geometry,[sign*.10,z-t[1],-y-t[2]],[-sign,0,0],.20);
    }
    Check(LowerSheetHit('Front',.84,.330)&&!LowerSheetHit('Front',.84,.315)&&!LowerSheetHit('Front',-.20,.330),'Actual front skirt has the photographed curved lower boundary rather than the old high straight edge: '+side);
    Check(LowerSheetHit('Rear',-1.20,.370)&&!LowerSheetHit('Rear',-1.20,.345),'Actual separate rear skirt retains its rising lower profile: '+side);
  }
}
if(geometryRevision>=42){
  const geometry=LocalGeometry('Node_SuspensionLeft',true),axle=Matrix(nodesByName.get('Node_RearSprocketLeft')).slice(12,15),y=axle[1],z=axle[2];
  const centre=FirstSurface(geometry,[-1.10,y,z],[1,0,0],.08),annulus=FirstSurface(geometry,[-1.10,y+.017,z],[1,0,0],.08);
  Check(Number.isFinite(centre)&&Number.isFinite(annulus)&&centre-annulus>.0075&&centre-annulus<.0085,'Photographed left rear-nut centre has a real blind recess, independently of dark paint',JSON.stringify({centre,annulus,depthM:centre-annulus}));
  const support=FirstSurface(geometry,[-1.059,y,z+.025],[0,0,-1],.05);
  Check(Number.isFinite(support)&&support>.0065&&support<.0075,'Left rear nut has a physical neck across the former axial gap',JSON.stringify({firstSupportDistanceM:support}));
  if(geometryRevision>=43){
    for(const [name,dy,dz]of [['Rear',-.206473251,-.102848969],['Front',-.188655099,-.264287245],['Lower',-.235485759,-.237999527]]){
      const distance=FirstSurface(geometry,[-1.10,y+dy,z+dz],[1,0,0],.10);
      Check(Number.isFinite(distance)&&distance>.045&&distance<.065,'Photographed rear apron covers the actual opaque '+name+' point rather than exposing a wheel/hull/void',JSON.stringify({distance}));
    }
  }
}
if(geometryRevision>=44){
  const gun=LocalGeometry('Node_TurretMachineGun'),mount=LocalGeometry('Node_TurretMgMount',true);
  const RadiusAt=z=>.10-FirstSurface(gun,[-.10,0,z],[1,0,0],.20),base=RadiusAt(-.140),end=RadiusAt(-.415);
  Check(base>.050&&base<.060&&end>.010&&end<.020&&base/end>2.5,'Rear machine-gun exterior is a broad tapered sheath rather than a thin parallel pipe',JSON.stringify({baseRadiusM:base,endRadiusM:end}));
  const front=FirstSurface(gun,[.008,0,-.450],[0,0,1],.10),bore=FirstSurface(gun,[0,0,-.450],[0,0,1],.10);
  Check(Number.isFinite(front)&&Number.isFinite(bore)&&bore-front>.010&&bore-front<.020,'Rear sheath small end retains a physical recessed opening',JSON.stringify({depthM:bore-front}));
  const foot=FirstSurface(mount,[0,-.141,-.10],[0,0,1],.20);
  Check(Number.isFinite(foot)&&foot>.060&&foot<.080,'Rear machine-gun fixed mounting frame retains its lower foot',JSON.stringify({firstFootDistanceM:foot}));
}
// Native2007/20 show a broad shallow pressed face around a compact hub.
// Probe the actual exported surfaces; chosen profile points are not evidence.
const wheelProfiles=g.nodes.filter(node=>/^Node_(RoadWheel|LeadingWheel)/.test(node.name)).map(node=>{
  const geometry=LocalGeometry(node.name),radius=node.extras.radiusM,sign=node.name.includes('Left')?-1:1;
  const At=r=>FirstSurface(geometry,[sign*.2,r*Math.cos(Math.PI/7),r*Math.sin(Math.PI/7)],[-sign,0,0],.3);
  const rim=At(radius*.90),dish=At(radius*.48),nearHub=At(radius*.32);
  return {name:node.name,dishDepthM:dish-rim,hubSpreadM:Math.abs(nearHub-dish)};
});
Check(wheelProfiles.length===18&&wheelProfiles.every(row=>row.dishDepthM>.009&&row.dishDepthM<.022),'All18 road/leading wheels retain the photographed shallow dish',JSON.stringify(wheelProfiles));
Check(wheelProfiles.every(row=>Number.isFinite(row.hubSpreadM)&&row.hubSpreadM<.003),'Wheel centres do not swell into the broad bowl face',JSON.stringify({maximumHubSpreadM:Math.max(...wheelProfiles.map(row=>row.hubSpreadM))}));
const shoeGeometry=LocalGeometry('Node_TrackLinkLeft000');
const shoeWidth=Math.max(...shoeGeometry.vertices.map(p=>p[0]))-Math.min(...shoeGeometry.vertices.map(p=>p[0]));
Check(Math.abs(shoeWidth-.320)<.0005,'Actual casting width follows the same-car front-photo320mm reconstruction',String(shoeWidth));
function WideCasting(geometry,width){
  const canonical=new Map(),parent=geometry.vertices.map((_,i)=>i),Find=i=>parent[i]===i?i:(parent[i]=Find(parent[i]));
  const Join=(a,b)=>{a=Find(a);b=Find(b);if(a!==b)parent[b]=a;};
  for(const [i,p]of geometry.vertices.entries()){const key=p.map(v=>v.toFixed(7)).join(',');if(canonical.has(key))Join(i,canonical.get(key));else canonical.set(key,i);}
  for(const face of geometry.faces){Join(face[0],face[1]);Join(face[1],face[2]);}
  const groups=new Map();for(const face of geometry.faces){const key=Find(face[0]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(face);}
  const selected=[...groups.values()].filter(faces=>{const xs=[...new Set(faces.flat())].map(i=>geometry.vertices[i][0]);return Math.max(...xs)-Math.min(...xs)>width*.95;});
  return {vertices:geometry.vertices,faces:selected.flat(),components:selected.length};
}
const shoePlateGeometry=WideCasting(shoeGeometry,shoeWidth);
Check(shoePlateGeometry.components===1,'Window probes select the actual connected casting, separately from its pin barrels');
const roundedWindowSamples=[];
for(const sign of [-1,1])for(const [[cx,cy],start]of [[[.036,-.024],-Math.PI],[[.076,-.024],-Math.PI/2],[[.072,.028],0],[[.041,.028],Math.PI/2]])for(const offset of [15,30,45,60,75]){
  const angle=start+offset*Math.PI/180;
  const Point=radius=>[sign*(cx+radius*Math.cos(angle))*shoeWidth/.366,.10,-(cy+radius*Math.sin(angle))];
  roundedWindowSamples.push({open:!RayHits(shoePlateGeometry,Point(.01375),[0,-1,0],.20),solid:RayHits(shoePlateGeometry,Point(.01625),[0,-1,0],.20)});
}
Check(roundedWindowSamples.every(row=>row.open&&row.solid),'Cast centre windows retain real rounded shoulders with adjacent solid-metal controls',JSON.stringify({samples:roundedWindowSamples.length,failed:roundedWindowSamples.filter(row=>!row.open||!row.solid).length}));
for(const side of ['Left','Right']){
  const sign=side==='Left'?-1:1,wheel=nodesByName.get('Node_LeadingWheel'+side),position=wheel.translation;
  const support=LocalGeometry('Node_Suspension'+side),disc=LocalGeometry(wheel.name);
  const offsets=[[.075,-.055],[.045,-.055]];
  Check(offsets.every(([y,z])=>RayHits(disc,[sign*.30,y,z],[-sign,0,0],.25)&&!RayHits(support,[sign*1.2,position[1]+y,position[2]+z],[-sign,0,0],.25)),
    'Reference-visible leading wheel dish is unobstructed by the fixed support: '+side);
  const roller=nodesByName.get('Node_ReturnRoller'+side+'01'),nextRoller=nodesByName.get('Node_ReturnRoller'+side+'02');
  const rollerGeometry=LocalGeometry(roller.name),radius=Math.max(...rollerGeometry.vertices.map(p=>Math.hypot(p[1],p[2])));
  const stationPitch=Math.hypot(...nextRoller.translation.map((value,i)=>value-roller.translation[i])),ratio=radius/stationPitch;
  // Independent2007/2025 rim measurements constrain this visible proportion;
  // camera fits and chosen factory-scale assumptions are not acceptance gates.
  Check(ratio>.086&&ratio<.100,'Return-rim size agrees with the measured adjacent-axle proportion: '+side,JSON.stringify({radius,stationPitch,ratio}));
}
Check(shoePlateGeometry.faces.length>0&&[-.375,-.150,.150,.375].every(ratio=>!RayHits(shoePlateGeometry,[ratio*shoeWidth,.10,0],[0,-1,0],.20))&&RayHits(shoePlateGeometry,[0,.10,0],[0,-1,0],.20),'Four true cast-shoe windows and a solid middle web');
// Full-depth casting probes must not mistake the separate hinge barrel,
// which can legitimately be visible through the relief, for filled metal.
Check([-.336,0,.336].every(ratio=>!RayHits(shoePlateGeometry,[ratio*shoeWidth,.10,.065],[0,-1,0],.20))&&!RayHits(shoePlateGeometry,[0,.10,-.059],[0,-1,0],.20)&&RayHits(shoePlateGeometry,[.074*shoeWidth,.10,-.059],[0,-1,0],.20),'Photographed flange keyways and trailing central relief are true silhouette cut-outs');
Check([-.429,.429].every(ratio=>RayHits(shoePlateGeometry,[ratio*shoeWidth,.10,-.015],[0,-1,0],.20)),'Outer shoe windows retain their cast side webs');
Check([-.161,.161].every(x=>!RayHits(shoePlateGeometry,[x*.320/.366,.10,.052],[0,-1,0],.20)&&RayHits(shoePlateGeometry,[x*.320/.366,.10,.035],[0,-1,0],.20)),'Small flange pin-eye bores are open through real metal with solid adjacent casting');
const knuckleZ=-.057*((contract.castingPitchM??.150)/.119);
Check(!RayHits(shoeGeometry,[-.055,-.010,knuckleZ],[1,0,0],.110)&&RayHits(shoeGeometry,[-.055,.004,knuckleZ],[1,0,0],.110),'Cast pin knuckles retain a real axial bore and a surrounding barrel wall');
for(const side of ['Left','Right']){
  const sign=side==='Left'?-1:1,cover=LocalGeometry('Node_SideVisionFlap'+side,true),frame=LocalGeometry('Node_SideVisionFrame'+side,true);
  Check(!RayHits(cover,[sign*.10,0,.086],[-sign,0,0],.20)&&RayHits(cover,[sign*.10,.010,.086],[-sign,0,0],.20),'Side vision cover has a true narrow slit and solid adjacent lid: '+side);
  Check(!RayHits(frame,[sign*.10,0,0],[-sign,0,0],.20)&&RayHits(frame,[sign*.10,0,.085],[-sign,0,0],.20),'Side vision frame has a real aperture and solid rebate flange: '+side);
}
const turretGeometry=LocalGeometry('Node_TurretYaw',true);
const bowGeometry=LocalGeometry('Node_BowPlate',true);
const bowPortProbe=geometryRevision>=54?[-.09925,.19128]:[-.13,.30];
Check(!RayHits(bowGeometry,[...bowPortProbe,-.20],[0,0,1],.30)&&RayHits(bowGeometry,[bowPortProbe[0]-.085,bowPortProbe[1],-.20],[0,0,1],.30),'Round bow port has a true opening and solid surrounding armor beneath its independent cover');
if(geometryRevision>=38){
  const visor=LocalGeometry('Node_DriverVisionFlap',true,true),shutter=LocalGeometry('Node_DriverPortShutter',true,true),mount=nodesByName.get('Node_DriverPortShutter');
  const closed={vertices:shutter.vertices.map(([x,y,z])=>[-x+mount.translation[0],-y+mount.translation[1],z+mount.translation[2]]),faces:shutter.faces};
  const peeperDistance=FirstSurface(visor,[.05,-.25,-.10],[0,0,1],.20),shutterDistance=FirstSurface(closed,[0,-.225,-.10],[0,0,1],.20),setbackM=shutterDistance-peeperDistance;
  Check(!RayHits(visor,[0,-.225,-.10],[0,0,1],.20)&&Number.isFinite(shutterDistance)&&setbackM>.012&&setbackM<.030,'Driver half-port remains a true aperture and its closed shutter sits behind the photographed peeper face',JSON.stringify({setbackM}));
  if(geometryRevision>=39){
    const node=nodesByName.get('Mesh_DriverVisionFlap');
    Check(g.meshes[node.mesh].primitives.every(p=>!g.materials[p.material].name.endsWith('Shadow')),'Driver visor return walls retain painted armor without the boolean cutter dark material');
  }
}
Check(!RayHits(turretGeometry,[0,.30,-.80],[0,0,1],.25)&&RayHits(turretGeometry,[.24,.30,-.80],[0,0,1],.25),'Mantlet aperture is cut through armor and its border remains solid');
Check([-.16,-.08,0,.08,.16].every(x=>RayHits(turretGeometry,[x,.506,-.90],[0,0,1],.45)),'Front turret armor is closed above the mantlet, without the exposed full-height shell strip');
Check([-.12,0,.12].every(x=>RayHits(turretGeometry,[x,.080,-.90],[0,0,1],.45)),'Front turret armor is closed below the mantlet while the actual gun aperture stays open');
const towGeometry=LocalGeometry('Node_BowTowClevis',true);
Check(!RayHits(towGeometry,[-.12,.010,-.095],[1,0,0],.24)&&RayHits(towGeometry,[-.12,0,-.045],[1,0,0],.24),'Tow eyes have transverse bores and solid surrounding metal');
const gunMountGeometry=LocalGeometry('Node_MainGunPitch',true);
Check(!RayHits(gunMountGeometry,[-.035,-.020,-.16],[0,0,1],.09)&&RayHits(gunMountGeometry,[-.14,-.020,-.16],[0,0,1],.09),'Sight shield has an open inner notch and a solid outer arm');
Check(!RayHits(gunMountGeometry,[-.025,-.024,-.16],[0,0,1],.18)&&RayHits(gunMountGeometry,[-.045,-.024,-.16],[0,0,1],.18),'A real vertical slit remains in the separate sight backing plate');
const boreGeometry=LocalGeometry('Node_MainGunRecoil',false,true);
Check(!RayHits(boreGeometry,[0,.032,-.80],[0,0,1],.18)&&RayHits(boreGeometry,[.035,.032,-.80],[0,0,1],.18),'Main bore stays physically open behind the flat muzzle annulus');
const allBoreGeometry=LocalGeometry('Node_MainGunRecoil');
const UniqueRing=points=>[...new Map(points.map(p=>[`${p[0].toFixed(8)},${p[1].toFixed(8)}`,p])).values()];
const metalRing=UniqueRing(allBoreGeometry.vertices.filter(p=>Math.abs(p[2]+.712)<1e-5&&Math.abs(Math.hypot(p[0],p[1]-.032)-.0285)<2e-6))
  .sort((a,b)=>Math.atan2(a[1]-.032,a[0])-Math.atan2(b[1]-.032,b[0]));
const linerRing=UniqueRing(allBoreGeometry.vertices.filter(p=>Math.abs(p[2]+.7072)<1e-5&&Math.hypot(p[0],p[1]-.032)>.027&&Math.hypot(p[0],p[1]-.032)<.0285));
const minimumMetalChord=Math.min(...metalRing.map((p,i)=>{const q=metalRing[(i+1)%metalRing.length],a=p[1]-.032,b=q[1]-.032;return Math.abs(p[0]*b-a*q[0])/Math.hypot(q[0]-p[0],b-a);}));
const maximumLinerRadius=Math.max(...linerRing.map(p=>Math.hypot(p[0],p[1]-.032)));
Check(metalRing.length>=24&&linerRing.length>=24&&minimumMetalChord-maximumLinerRadius>.0002,'Dark bore liner stays inside the actual low-poly metal chords',JSON.stringify({minimumMetalChord,maximumLinerRadius,gapM:minimumMetalChord-maximumLinerRadius}));

if(geometryRevision>=40){
  const rows=[];
  for(const [side,sign]of [['Left',-1],['Right',1]]){
    const leading=LocalGeometry('Node_LeadingWheel'+side);
    Check(RayHits(leading,[-sign*.2,.005,0],[sign,0,0],.125),'Photo-visible inboard leading-wheel hub/end remains physical geometry: '+side);
    const supportName='Node_InboardIdlerSupport'+side;
    Check(nodesByName.has(supportName),'Photo-visible inboard tensioner support survives export: '+side);
    if(nodesByName.has(supportName)){
      const support=LocalGeometry(supportName,true,true);
      Check(RayHits(support,[sign*.55,.85,-1.805],[sign,0,0],.5)&&RayHits(support,[sign*.55,.62,-1.02],[sign,0,0],.5),'Inboard support retains a real cylinder and armor cheek: '+side);
    }
    const points=LocalGeometry('Node_FrontIdler'+side).vertices.filter(p=>Math.abs(Math.hypot(p[1],p[2])-.433*.5)<2e-6&&Math.abs(p[0])>.060);
    const Spread=faceSign=>{const values=points.filter(p=>Math.sign(p[0])===faceSign).map(p=>Math.abs(p[0]));return {samples:values.length,spread:Math.max(...values)-Math.min(...values)};};
    const inner=Spread(-sign),outer=Spread(sign);rows.push({side,inner,outer});
    Check(inner.samples>=100&&inner.spread<1e-6,'Photo-visible inboard idler face has a smooth dish: '+side,JSON.stringify(inner));
    if(side==='Left'){
      Check(outer.samples>=100&&outer.spread>.004,'Photo-visible left exterior retains its cast-rib relief',JSON.stringify(outer));
      const profile=[...new Map(points.filter(p=>Math.sign(p[0])===sign).map(p=>[Math.atan2(p[2],p[1]).toFixed(6),Math.abs(p[0])])).entries()].sort((a,b)=>+a[0]-+b[0]);
      const peaks=profile.filter((p,i)=>p[1]>profile[(i+profile.length-1)%profile.length][1]+1e-8&&p[1]>profile[(i+1)%profile.length][1]+1e-8).length;
      const settings=nodesByName.get('Node_FrontIdler'+side).extras;
      Check(peaks===settings.ribCountWorking&&settings.ribCountFactoryVerified===false,'Declared working rib density survives in the actual exterior casting',JSON.stringify({peaks,working:settings.ribCountWorking,factoryVerified:false}));
    }
  }
}

if(geometryRevision>=35){
  const angles=[],turret=g.nodes.find(node=>node.name==='Node_TurretYaw');
  for(const child of turret.children){const node=g.nodes[child];if(node.mesh===undefined)continue;
    for(const primitive of g.meshes[node.mesh].primitives){
      const p=ReadAccessor(glb,primitive.attributes.POSITION).data,n=ReadAccessor(glb,primitive.attributes.NORMAL).data,indices=ReadAccessor(glb,primitive.indices).data,wall=new Set();
      for(let k=0;k<indices.length;k+=3){
        const tri=Array.from(indices.slice(k,k+3)),heights=tri.map(v=>p[v*3+1]);
        // CSG openings split the straight wall into short triangles. Exclude
        // planar caps by height span without depending on a full-height fan.
        if(Math.max(...heights)-Math.min(...heights)<.001)continue;
        if(tri.every(v=>{const x=p[v*3],y=p[v*3+1],z=p[v*3+2],rx=.717-(y-.055)/.5*.097,rz=rx/.717*(z<=0?.720:.900);return x<-.5&&Math.abs(x*x/(rx*rx)+z*z/(rz*rz)-1)<1e-4;}))tri.forEach(v=>wall.add(v));
      }
      for(const v of wall)if(Math.abs(p[v*3+2])<1e-5)angles.push(Math.atan2(n[v*3+1],-n[v*3])*180/Math.PI);
    }
  }
  Check(angles.length>=2&&Math.max(...angles)-Math.min(...angles)<.1,'Straight turret plate generators retain consistent real exported normals',JSON.stringify({samples:angles.length,spreadDegrees:Math.max(...angles)-Math.min(...angles)}));
}

if(geometryRevision>=41){
  // Native16/20 resolve seven evenly spaced lower rounded heads. Weld only
  // coincident exported corners so UV/normal splits cannot invent extra heads.
  const geometry=LocalGeometry('Node_TurretYaw',true),points=geometry.vertices.map(([x,y,z])=>[x,-z,y]);
  const parent=points.map((_,i)=>i),Find=i=>parent[i]===i?i:(parent[i]=Find(parent[i]));
  const Join=(a,b)=>{a=Find(a);b=Find(b);if(a!==b)parent[b]=a;},weld=new Map();
  points.forEach((p,i)=>{const key=p.map(v=>v.toFixed(7)).join(',');if(weld.has(key))Join(i,weld.get(key));else weld.set(key,i);});
  for(const face of geometry.faces){Join(face[0],face[1]);Join(face[1],face[2]);}
  const groups=new Map();points.forEach((p,i)=>{const key=Find(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);});
  const heads=[...groups.values()].map(points=>{const min=[0,1,2].map(a=>Math.min(...points.map(p=>p[a]))),max=[0,1,2].map(a=>Math.max(...points.map(p=>p[a])));return {points,min,max,center:min.map((v,a)=>(v+max[a])/2),size:min.map((v,a)=>max[a]-v)};})
    .filter(h=>h.size.every(v=>v<.046)&&h.size[0]>.012&&Math.abs(h.center[0])<.25&&h.center[1]>.687&&h.center[1]<.715&&h.center[2]>.11&&h.center[2]<.15).sort((a,b)=>a.center[0]-b.center[0]);
  const gaps=heads.slice(1).map((h,i)=>h.center[0]-heads[i].center[0]);
  Check(heads.length===7,'Photo16/20 mantlet lower row has exactly seven independent heads',JSON.stringify({count:heads.length,centres:heads.map(h=>h.center)}));
  Check(gaps.length===6&&Math.max(...gaps)-Math.min(...gaps)<.0002&&Math.abs(heads[0].center[0]+heads.at(-1).center[0])<.0002,'Mantlet lower heads retain regular spacing through both corners',JSON.stringify(gaps));
  Check(heads.length===7&&heads.every(h=>h.size[0]>.020&&h.size[0]<.026&&h.size[1]>.004&&h.points.some(p=>p[1]>h.max[1]-.0005&&Math.hypot(p[0]-h.center[0],p[2]-h.center[2])<.002)),'Every lower head has a raised rounded crown rather than a flat hexagonal cap');
}

const imageCache=new Map();
async function ImageFor(textureInfo){
  const texture=g.textures[textureInfo.index],imageIndex=texture.source??texture.extensions?.EXT_texture_webp?.source;
  if(imageCache.has(imageIndex))return imageCache.get(imageIndex);
  const image=g.images[imageIndex],view=g.bufferViews[image.bufferView];
  const decoded=await sharp(Buffer.from(glb.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  imageCache.set(imageIndex,decoded);return decoded;
}
function UvSamples(materialIndex){
  const output=[];
  for(const mesh of g.meshes)for(const primitive of mesh.primitives){
    if(primitive.material!==materialIndex)continue;
    const uv=ReadAccessor(glb,primitive.attributes.TEXCOORD_0),indices=ReadAccessor(glb,primitive.indices).data;
    for(let i=0;i<indices.length;i+=3){
      const p=[0,1,2].map(k=>uv.data.slice(indices[i+k]*2,indices[i+k]*2+2));
      const area=Math.abs((p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]))*.5;
      if(area>2e-6)output.push({uv:[(p[0][0]+p[1][0]+p[2][0])/3,(p[0][1]+p[1][1]+p[2][1])/3],area});
    }
  }
  return output;
}
function Sample(image,uv,channel){const x=Math.min(image.info.width-1,Math.max(0,Math.floor(uv[0]*image.info.width))),y=Math.min(image.info.height-1,Math.max(0,Math.floor(uv[1]*image.info.height)));return image.data[(y*image.info.width+x)*4+channel]/255;}
function ComponentTexelDensity(name,materialIndex,pixels){
  const node=nodesByName.get(name);let area=0,uvArea=0;
  if(node?.mesh===undefined)return 0;
  for(const primitive of g.meshes[node.mesh].primitives){
    if(primitive.material!==materialIndex)continue;
    const positions=ReadAccessor(glb,primitive.attributes.POSITION).data,uv=ReadAccessor(glb,primitive.attributes.TEXCOORD_0).data,indices=ReadAccessor(glb,primitive.indices).data;
    for(let k=0;k<indices.length;k+=3){
      const [a,b,c]=[0,1,2].map(i=>positions.slice(indices[k+i]*3,indices[k+i]*3+3)),[p,q,r]=[0,1,2].map(i=>uv.slice(indices[k+i]*2,indices[k+i]*2+2));
      area+=Math.hypot(...Cross(Sub(b,a),Sub(c,a)))/2;uvArea+=Math.abs((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]))/2;
    }
  }
  return area>0?Math.sqrt(uvArea/area)*pixels:0;
}
function PlaneNormalProbe(name,origin,direction,normalImage){
  const rootIndex=g.nodes.findIndex(node=>node.name===name);let nearest=null;
  const Unit=v=>{const length=Math.hypot(...v);return v.map(value=>value/length);};
  const Transform=(matrix,p,vector=false)=>[0,1,2].map(axis=>matrix[axis]*p[0]+matrix[axis+4]*p[1]+matrix[axis+8]*p[2]+(vector?0:matrix[axis+12]));
  function Visit(index,parent,isRoot=false){
    const node=g.nodes[index],matrix=Multiply(parent,isRoot?identity:Matrix(node));
    if(node.mesh!==undefined)for(const primitive of g.meshes[node.mesh].primitives){
      if(!g.materials[primitive.material].name.endsWith('Armor'))continue;
      const positions=ReadAccessor(glb,primitive.attributes.POSITION).data,normals=ReadAccessor(glb,primitive.attributes.NORMAL).data,tangents=ReadAccessor(glb,primitive.attributes.TANGENT).data,uv=ReadAccessor(glb,primitive.attributes.TEXCOORD_0).data,indices=ReadAccessor(glb,primitive.indices).data;
      for(let k=0;k<indices.length;k+=3){
        const ids=Array.from(indices.slice(k,k+3)),points=ids.map(id=>Transform(matrix,positions.slice(id*3,id*3+3))),[a,b,c]=points,edge1=Sub(b,a),edge2=Sub(c,a),p=Cross(direction,edge2),det=Dot(edge1,p);
        if(Math.abs(det)<1e-10)continue;
        const t=Sub(origin,a),beta=Dot(t,p)/det,q=Cross(t,edge1),gamma=Dot(direction,q)/det,distance=Dot(edge2,q)/det;
        if(beta<0||gamma<0||beta+gamma>1||distance<=1e-6||distance>.25||(nearest&&distance>=nearest.distance))continue;
        const weights=[1-beta-gamma,beta,gamma],n=Unit(Transform(matrix,[0,1,2].map(axis=>ids.reduce((sum,id,i)=>sum+normals[id*3+axis]*weights[i],0)),true));
        let tangent=Transform(matrix,[0,1,2].map(axis=>ids.reduce((sum,id,i)=>sum+tangents[id*4+axis]*weights[i],0)),true);tangent=Unit(tangent.map((value,i)=>value-n[i]*Dot(tangent,n)));
        const sign=ids.reduce((sum,id,i)=>sum+tangents[id*4+3]*weights[i],0)>=0?1:-1,bitangent=Cross(n,tangent).map(value=>value*sign),sample=[0,1].map(axis=>ids.reduce((sum,id,i)=>sum+uv[id*2+axis]*weights[i],0)),encoded=[0,1,2].map(axis=>Sample(normalImage,sample,axis)*2-1);
        nearest={distance,uv:sample,normal:Unit([0,1,2].map(axis=>tangent[axis]*encoded[0]+bitangent[axis]*encoded[1]+n[axis]*encoded[2]))};
      }
    }
    for(const child of node.children??[])if(!g.nodes[child].name?.startsWith('Node_'))Visit(child,matrix);
  }
  if(rootIndex>=0)Visit(rootIndex,identity,true);return nearest;
}
function MappedMisses(materialIndex,base,normal,masked){
  let weight=0,black=0,invalidNormal=0,samples=0;
  for(const mesh of g.meshes)for(const primitive of mesh.primitives){
    if(primitive.material!==materialIndex)continue;
    const uv=ReadAccessor(glb,primitive.attributes.TEXCOORD_0).data,indices=ReadAccessor(glb,primitive.indices).data;
    for(let k=0;k<indices.length;k+=3){
      const p=[0,1,2].map(i=>uv.slice(indices[k+i]*2,indices[k+i]*2+2));
      const area=Math.abs((p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]))*.5;
      // Include the small rivet facets excluded by the broad colour averages.
      if(area*base.info.width*base.info.height<.25)continue;
      for(const bary of [[1/3,1/3,1/3],[.65,.175,.175],[.175,.65,.175],[.175,.175,.65]]){
        const sample=[0,1].map(axis=>p.reduce((sum,point,i)=>sum+point[axis]*bary[i],0));
        if(masked&&Sample(base,sample,3)<.5)continue;
        const rgb=[0,1,2].map(channel=>Sample(base,sample,channel)),n=[0,1,2].map(channel=>Sample(normal,sample,channel)*2-1),length=Math.hypot(...n);
        weight+=area;samples++;if(rgb.every(value=>value<.04))black+=area;if(length<.55||length>1.25)invalidNormal+=area;
      }
    }
  }
  return {samples,blackFraction:black/weight,invalidNormalFraction:invalidNormal/weight};
}
for(const [index,material] of g.materials.entries()){
  if(material.name.endsWith('Shadow'))continue;
  const role=material.name.replace('Material_Type89Game',''),pbr=material.pbrMetallicRoughness;
  Check(pbr.baseColorTexture&&material.normalTexture&&pbr.metallicRoughnessTexture&&material.occlusionTexture&&material.occlusionTexture.index===pbr.metallicRoughnessTexture.index,'Complete Base/Normal/ORM with real AO: '+role);
  const [base,normal,orm]=await Promise.all([ImageFor(pbr.baseColorTexture),ImageFor(material.normalTexture),ImageFor(pbr.metallicRoughnessTexture)]);
  const misses=MappedMisses(index,base,normal,role==='Guard');
  Check(misses.samples>0&&misses.blackFraction<1e-5,'Actual mapped surfaces contain no opaque-black projection fragments: '+role,JSON.stringify(misses));
  Check(misses.invalidNormalFraction<1e-5,'Actual mapped normals contain no opaque ray-miss vectors: '+role,String(misses.invalidNormalFraction));
  if(role==='Armor'){
    Check(base.info.width===4096&&normal.info.width===8192&&orm.info.width===4096,'Fine metal film retains4K Base,8K Normal and4K ORM atlases');
    const densities=['Mesh_Hull','Mesh_BowRoundPortCover','Mesh_RoadWheelLeft01'].map(name=>({name,normalPixelsPerM:ComponentTexelDensity(name,index,normal.info.width)}));
    Check(densities.every(row=>row.normalPixelsPerM>=450),'Actual mapped hull, cover and wheel retain native-photo-scale surface sampling',JSON.stringify(densities));
    const lidDots=Array.from({length:24},(_,i)=>{const angle=i*Math.PI/12,hit=PlaneNormalProbe('Node_BowRoundPortCover',[.063*Math.cos(angle),-.089+.063*Math.sin(angle),.12],[0,0,-1],normal);return hit?.normal[2]??-1;});
    if(process.argv.includes('--normal-diagnostic'))console.log('CoverNormalDiagnostic '+JSON.stringify(lidDots));
    const lidOcclusion=Array.from({length:24},(_,i)=>{const angle=i*Math.PI/12,hit=PlaneNormalProbe('Node_BowRoundPortCover',[.063*Math.cos(angle),-.089+.063*Math.sin(angle),.12],[0,0,-1],normal);return hit?Sample(orm,hit.uv,0):0;});
    if(process.argv.includes('--normal-diagnostic'))console.log('CoverOcclusionDiagnostic '+JSON.stringify(lidOcclusion));
    if(geometryRevision>=37)Check(Math.min(...lidOcclusion)>.85,'Opened flat cover backing retains actual high-surface occlusion without a baked opposite-face triangle',JSON.stringify({minimumAo:Math.min(...lidOcclusion),samples:lidOcclusion.length}));
    Check(Math.min(...lidDots)>.60,'Opened cover backing keeps outward mapped normals around the entire visible star rim; no inverted black patch',JSON.stringify({minimumDot:Math.min(...lidDots),samples:lidDots.length}));
    const flangeDots=Array.from({length:9},(_,i)=>{const angle=(20+i*20)*Math.PI/180,hit=PlaneNormalProbe('Node_BowMgMount',[.183*Math.cos(angle),.183*Math.sin(angle),-.12],[0,0,1],normal);return hit?-hit.normal[2]:-1;});
    Check(Math.min(...flangeDots)>.60,'Machine-gun flange plane has coherent outward normals without projected sawtooth bands',JSON.stringify({minimumDot:Math.min(...flangeDots),samples:flangeDots.length}));
    const cover=nodesByName.get('Mesh_BowRoundPortCover'),badgeSamples=[];
    if(cover?.mesh!==undefined)for(const primitive of g.meshes[cover.mesh].primitives){
      const positions=ReadAccessor(glb,primitive.attributes.POSITION).data,uv=ReadAccessor(glb,primitive.attributes.TEXCOORD_0).data,indices=ReadAccessor(glb,primitive.indices).data;
      for(let k=0;k<indices.length;k+=3){
        const tri=[0,1,2].map(i=>positions.slice(indices[k+i]*3,indices[k+i]*3+3));
        // Select the raised star's actual front facets behind the closed lid,
        // excluding its solid back and the empty surrounding atlas pixels.
        if(!tri.every(p=>p[2]>.0145&&p[1]<-.025)||!tri.some(p=>p[2]>.0225))continue;
        const sample=[0,1].map(axis=>[0,1,2].reduce((sum,i)=>sum+uv[indices[k+i]*2+axis],0)/3);
        badgeSamples.push([0,1,2].map(channel=>Sample(base,sample,channel)));
      }
    }
    Check(badgeSamples.length===10&&badgeSamples.every(([r,g,b])=>r>.70&&g>.54&&b<.40),'Inner five-point badge survives as geometry and mapped2007 gold colour',JSON.stringify(badgeSamples));
  }
  const samples=UvSamples(index);let weight=0,white=0,metal=0,rough=0,normalVariation=0;
  for(const sample of samples){weight+=sample.area;const rgb=[0,1,2].map(channel=>Sample(base,sample.uv,channel));if(rgb.every(value=>value>.99))white+=sample.area;metal+=Sample(orm,sample.uv,2)*sample.area;rough+=Sample(orm,sample.uv,1)*sample.area;normalVariation+=(Math.abs(Sample(normal,sample.uv,0)-.5)+Math.abs(Sample(normal,sample.uv,1)-.5))*sample.area;}
  const values={metal:metal/weight,rough:rough/weight,white:white/weight,normalVariation:normalVariation/weight};
  Check(weight>0&&values.white<.002&&values.normalVariation>.001,'UV surfaces contain mapped detail without blank projection: '+role,JSON.stringify(values));
  if(['Rubber','Glass'].includes(role))Check(values.metal<.005,'Dielectric material has zero metallic channel: '+role,String(values.metal));
  if(role==='Glass')Check(values.rough<.26&&material.extensions?.KHR_materials_transmission?.transmissionFactor>.8,'Actual glass roughness and transmission');
  if(role==='Exhaust')Check(Math.abs(values.metal-.35)<.04,'Exhaust metallic scalar is not stale roughness');
  if(role==='Guard'){
    let clear=0,solid=0,total=0;
    for(const mesh of g.meshes)for(const primitive of mesh.primitives){
      if(primitive.material!==index)continue;
      const uv=ReadAccessor(glb,primitive.attributes.TEXCOORD_0).data,indices=ReadAccessor(glb,primitive.indices).data;
      for(let i=0;i<indices.length;i+=3){const p=[0,1,2].map(k=>uv.slice(indices[i+k]*2,indices[i+k]*2+2));for(const a of [.15,.50,.85])for(const seed of [.15,.50,.85]){const b=(1-a)*seed,c=1-a-b,sample=[0,1].map(axis=>p[0][axis]*a+p[1][axis]*b+p[2][axis]*c),alpha=Sample(base,sample,3);total++;if(alpha<.25)clear++;if(alpha>.75)solid++;}}
    }
    Check(material.alphaMode==='MASK'&&(material.alphaCutoff??.5)===.5&&material.doubleSided===true&&(pbr.baseColorTexture.texCoord??0)===0,'Perforated guard loads as a double-sided UV0 alpha mask');
    Check(total>100&&clear/total>.10&&clear/total<.45&&solid/total>.40,'Holes remain visible on mapped guard surfaces, excluding atlas background',JSON.stringify({clear,solid,total}));
    Check(base.info.width===2048&&normal.info.width===2048&&orm.info.width===1024,'Guard retains its full-resolution opacity and PBR maps');
  }
  if(['Armor','Guard','CastArmor'].includes(role)&&g.nodes.some(node=>node.extras?.microSurface)){
    const coat=material.extensions?.KHR_materials_clearcoat,specular=material.extensions?.KHR_materials_specular;
    Check(coat?.clearcoatTexture&&coat?.clearcoatRoughnessTexture&&coat?.clearcoatNormalTexture&&specular?.specularFactor>=0&&specular.specularFactor<=1,'Portable layered paint/cast material has mapped coating, normals and bounded specular: '+role);
    if(coat?.clearcoatTexture&&coat.clearcoatRoughnessTexture&&coat.clearcoatNormalTexture){
      const [weight,coatRoughness,coatNormal]=await Promise.all([ImageFor(coat.clearcoatTexture),ImageFor(coat.clearcoatRoughnessTexture),ImageFor(coat.clearcoatNormalTexture)]);
      const fineInfo=role==='CastArmor'?material.normalTexture:coat.clearcoatNormalTexture,fine=await ImageFor(fineInfo),transform=fineInfo.extensions?.KHR_texture_transform;
      Check(weight.info.width===(role==='Guard'?1024:4096)&&coatRoughness.info.width===weight.info.width,'Coating weights/roughness retain the authored atlas resolution: '+role);
      Check(fine.info.width===2048&&fine.info.height===2048&&transform?.scale?.every(value=>Number.isFinite(value)&&value>1),'Fine normal field retains its 2K map and physical UV repetition: '+role);
      let invalid=0;for(let y=0;y<fine.info.height;y+=32)for(let x=0;x<fine.info.width;x+=32){const vector=[0,1,2].map(channel=>Sample(fine,[(x+.5)/fine.info.width,(y+.5)/fine.info.height],channel)*2-1);if(Math.abs(Math.hypot(...vector)-1)>.025||vector[2]<=0)invalid++;}
      Check(invalid===0,'Decoded fine normal field stays unit length and outward-facing: '+role,String(invalid));
      if(role==='CastArmor')Check(coatNormal.info.width===8192,'Cast reflection layer retains the original 8K macro normal');
    }
  }
}
const layeredSurface=g.nodes.some(node=>node.extras?.microSurface);
Check(imageCache.size===(layeredSurface?25:21)&&g.materials.length===(layeredSurface?9:8),'Every physical set and optional film/cast layer is actually decoded',String(imageCache.size));
const paintFinish=g.nodes.find(node=>node.name==='Model_Type89MediumTank')?.extras?.paintFinish;
if(paintFinish){
  const bytes=fs.readFileSync(path.join(here,'Model/Type89MediumTank/Data_PaintFinishProfile.json')),profile=JSON.parse(bytes);
  Check(paintFinish.profileSha256===createHash('sha256').update(bytes).digest('hex')&&paintFinish.newDamageMask===false,'The delivered paint refinement matches its reproducible profile and retained exposure masks');
  for(const[role,settings]of Object.entries(profile.roles)){
    const material=g.materials.find(m=>m.name==='Material_Type89Game'+role),coat=material?.extensions?.KHR_materials_clearcoat,fine=role==='CastArmor'?material?.normalTexture:coat?.clearcoatNormalTexture;
    Check(Math.abs(coat?.clearcoatRoughnessFactor-settings.coatRoughnessScale)<1e-6&&Math.abs(fine?.scale-settings.fineNormalScale)<1e-6,'Actual paint/cast finish is the declared refined physical material: '+role);
  }
}
console.log(`Type89MediumTank: ${checks-failures}/${checks} passed`);
process.exitCode=failures?1:0;
