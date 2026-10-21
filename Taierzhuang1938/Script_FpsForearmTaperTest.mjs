// Independently verify the reviewed forearm-to-wrist taper of the scanned FPS
// skin, then recover the exact previous bytes of both hand GLBs. The previous
// bytes are what the weight-repair and grip-corrective audits (and the v8
// HanYang repair manifest) were reviewed against, so they chain from here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {LoadFpsWristNormalSeam,UndoFpsWristNormalSeam} from './Script_FpsWristNormalSeamTest.mjs';

const project=path.dirname(fileURLToPath(import.meta.url));
export const FPS_FOREARM_TAPER_RECIPE='Model/Data_FpsForearmTaper.json';
const Hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const Normalize=name=>name.toLowerCase().replace(/[^a-z0-9]/g,'');
const CHANNELS=[['POSITION',3],['NORMAL',3],['TANGENT',4]];

export function LoadFpsForearmTaper(){return JSON.parse(fs.readFileSync(path.join(project,FPS_FOREARM_TAPER_RECIPE),'utf8'));}

function Decode(text,width,count){
  const bytes=Buffer.from(text,'base64');assert.equal(bytes.length,count*width*4,'complete float32 rows');
  return Array.from({length:count},(_,i)=>Array.from({length:width},(_,k)=>bytes.readFloatLE((i*width+k)*4)));
}

function Glb(bytes){
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length)),base=28+length;
  const matches=[];doc.meshes.forEach((mesh,mi)=>mesh.primitives.forEach((p,pi)=>{if(doc.materials[p.material]?.name==='Material_HanYangScanSkin')matches.push([mi,pi]);}));
  assert.equal(matches.length,1,'one scanned skin primitive');
  const [meshIndex,primitiveIndex]=matches[0],primitive=doc.meshes[meshIndex].primitives[primitiveIndex];
  const node=doc.nodes.find(n=>n.mesh===meshIndex&&n.skin!==undefined),skin=doc.skins[node.skin];
  const Slot=index=>{
    const a=doc.accessors[index],v=doc.bufferViews[a.bufferView],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType];
    assert(!a.sparse&&!a.normalized&&(v.buffer||0)===0);
    return{accessor:a,width,size,stride:v.byteStride||width*size,start:base+(v.byteOffset||0)+(a.byteOffset||0)};
  };
  const Read=(index,source=bytes)=>{
    const s=Slot(index),read={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[s.accessor.componentType];
    const out=new Float64Array(s.accessor.count*s.width);
    for(let i=0;i<s.accessor.count;i++)for(let k=0;k<s.width;k++)out[i*s.width+k]=source[read](s.start+i*s.stride+k*s.size);
    return out;
  };
  return{doc,base,meshIndex,primitiveIndex,primitive,skin,Slot,Read,names:skin.joints.map(j=>Normalize(doc.nodes[j].name))};
}

export function UndoFpsForearmTaper(bytes,recipe,asset){
  assert.equal(recipe.version,1,'supported forearm taper recipe');
  const row=recipe.assets.find(r=>r.asset===asset);assert(row,'asset belongs to the reviewed taper');
  assert.equal(Hash(bytes),row.after.sha256,'exact reviewed tapered asset');
  const glb=Glb(bytes);assert.equal(Hash(bytes.subarray(glb.base)),row.after.binarySha256);
  assert.equal(glb.meshIndex,recipe.mesh.meshIndex);assert.equal(glb.primitiveIndex,recipe.mesh.primitiveIndex);
  const vertices=recipe.vertices,count=vertices.length;
  assert(count>0&&count<=4000&&vertices.every((v,i)=>Number.isInteger(v)&&v>=0&&v<recipe.mesh.vertexCount&&(i===0||v>vertices[i-1])),'sorted, localized vertex list');
  const restored=Buffer.from(bytes);
  const values={POSITION:[recipe.positionBefore,recipe.positionAfter],NORMAL:[row.normalBefore,row.normalAfter],TANGENT:[row.tangentBefore,row.tangentAfter]};
  for(const [semantic,width] of CHANNELS){
    const slot=glb.Slot(glb.primitive.attributes[semantic]);assert.equal(slot.accessor.componentType,5126);assert.equal(slot.width,width);
    assert.equal(slot.accessor.count,recipe.mesh.vertexCount);
    const before=Decode(values[semantic][0],width,count),after=Decode(values[semantic][1],width,count);
    vertices.forEach((vertex,i)=>{for(let k=0;k<width;k++){
      const at=slot.start+vertex*slot.stride+k*4;
      assert.equal(restored.readFloatLE(at),after[i][k],`${semantic} ${vertex}.${k} matches the reviewed taper`);
      restored.writeFloatLE(before[i][k],at);
    }});
  }
  assert.equal(Hash(restored),row.before.sha256,'undo restores every previous GLB byte');
  assert.equal(Hash(restored.subarray(glb.base)),row.before.binarySha256);
  return restored;
}

const Sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],Dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],Len=a=>Math.hypot(a[0],a[1],a[2]);
const Cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],Scale=(a,s)=>[a[0]*s,a[1]*s,a[2]*s],Unit=a=>Scale(a,1/Len(a));
const Vec=(array,i,width=3)=>[array[i*width],array[i*width+1],array[i*width+2]];

function Invert4(m){ // column-major glTF matrix; only rigid-ish bind matrices are inverted here
  const r=[[m[0],m[4],m[8]],[m[1],m[5],m[9]],[m[2],m[6],m[10]]],t=[m[12],m[13],m[14]];
  const det=r[0][0]*(r[1][1]*r[2][2]-r[1][2]*r[2][1])-r[0][1]*(r[1][0]*r[2][2]-r[1][2]*r[2][0])+r[0][2]*(r[1][0]*r[2][1]-r[1][1]*r[2][0]);
  const inv=[[(r[1][1]*r[2][2]-r[1][2]*r[2][1])/det,(r[0][2]*r[2][1]-r[0][1]*r[2][2])/det,(r[0][1]*r[1][2]-r[0][2]*r[1][1])/det],
    [(r[1][2]*r[2][0]-r[1][0]*r[2][2])/det,(r[0][0]*r[2][2]-r[0][2]*r[2][0])/det,(r[0][2]*r[1][0]-r[0][0]*r[1][2])/det],
    [(r[1][0]*r[2][1]-r[1][1]*r[2][0])/det,(r[0][1]*r[2][0]-r[0][0]*r[2][1])/det,(r[0][0]*r[1][1]-r[0][1]*r[1][0])/det]];
  return Scale([Dot(inv[0],t),Dot(inv[1],t),Dot(inv[2],t)],-1); // translation of the inverse = bone position in bind space
}

function AngleNormals(points,triangles,weld,groups){
  const sums=new Float64Array(groups*3);
  for(let f=0;f<triangles.length;f+=3){
    const id=[triangles[f],triangles[f+1],triangles[f+2]],p=id.map(i=>Vec(points,i));
    const face=Cross(Sub(p[1],p[0]),Sub(p[2],p[0])),n=Scale(face,1/Math.max(Len(face),1e-30));
    for(let c=0;c<3;c++){
      const e1=Sub(p[(c+1)%3],p[c]),e2=Sub(p[(c+2)%3],p[c]),angle=Math.acos(Math.max(-1,Math.min(1,Dot(e1,e2)/Math.max(Len(e1)*Len(e2),1e-30)))),g=weld[id[c]];
      for(let k=0;k<3;k++)sums[g*3+k]+=n[k]*angle;
    }
  }
  return sums;
}

function Frames(glb){
  const binds=glb.Read(glb.skin.inverseBindMatrices),Bone=suffix=>{const i=glb.names.findIndex(n=>n.endsWith(suffix));assert(i>=0,suffix);return Invert4(Array.from(binds.subarray(i*16,i*16+16)));};
  return Object.fromEntries([['l',1],['r',-1]].map(([side,sign])=>{
    const wrist=Bone(side+'hand'),axis=Unit(Sub(wrist,Bone(side+'forearm')));
    let u=Sub(Bone(side+'finger0'),wrist);u=Unit(Sub(u,Scale(axis,Dot(u,axis))));
    return [side,{sign,wrist,axis,u,v:Scale(Cross(axis,u),sign)}];
  }));
}

// Outermost skin surface along a ray leaving the bone axis at `along` (m) toward angle `theta` (deg).
function Profile(points,triangles,frame,theta,alongs){
  const dir=[0,1,2].map(k=>Math.cos(theta*Math.PI/180)*frame.u[k]+Math.sin(theta*Math.PI/180)*frame.v[k]);
  const near=[];for(let f=0;f<triangles.length;f+=3){const p=Vec(points,triangles[f]);if(Len(Sub(p,frame.wrist))<.14)near.push(f);}
  return alongs.map(along=>{
    const o=[0,1,2].map(k=>frame.wrist[k]+along*frame.axis[k]);let best=NaN;
    for(const f of near){
      const a=Vec(points,triangles[f]),e1=Sub(Vec(points,triangles[f+1]),a),e2=Sub(Vec(points,triangles[f+2]),a),pv=Cross(dir,e2),det=Dot(e1,pv);
      if(Math.abs(det)<1e-14)continue;const tv=Sub(o,a),uu=Dot(tv,pv)/det;if(uu<0||uu>1)continue;
      const qv=Cross(tv,e1),vv=Dot(dir,qv)/det;if(vv<0||uu+vv>1)continue;const t=Dot(e2,qv)/det;
      if(t>0&&t<.09&&!(t<=best))best=t;
    }
    return best;
  });
}

function Ridge(points,triangles,frame){
  const alongs=Array.from({length:86},(_,i)=>-.070+i*.001),rows=[];
  for(const theta of [-135,-120,-105,-90,-75,-60,-45]){
    const r=Profile(points,triangles,frame,theta,alongs);assert(r.every(Number.isFinite),'continuous dorsal skin profile');
    const slope=r.slice(1).map((x,i)=>(x-r[i])/.001),window=[];for(let i=0;i+4<=slope.length;i+=4)window.push(slope.slice(i,i+4).reduce((s,x)=>s+x,0)/4);
    rows.push({theta,maxSlope:Math.max(...slope.map(Math.abs)),maxBend:Math.max(...window.slice(1).map((x,i)=>Math.abs(x-window[i])))});
  }
  return{maxSlope:Math.max(...rows.map(r=>r.maxSlope)),maxBend:Math.max(...rows.map(r=>r.maxBend)),rows};
}

export function ValidateFpsForearmTaper(before,after,recipe,asset){
  const row=recipe.assets.find(r=>r.asset===asset);
  assert.equal(Hash(before),row.before.sha256);assert.equal(Hash(after),row.after.sha256);assert.equal(before.length,after.length);
  const g0=Glb(before),g1=Glb(after);
  assert(before.subarray(0,g0.base).equals(after.subarray(0,g1.base)),'JSON chunk unchanged');
  // Only the listed vertices' POSITION/NORMAL/TANGENT floats may differ.
  const allowed=new Set(),listed=new Set(recipe.vertices);
  for(const [semantic,width] of CHANNELS){const s=g0.Slot(g0.primitive.attributes[semantic]);for(const v of recipe.vertices)for(let b=0;b<width*4;b++)allowed.add(s.start+v*s.stride+b);}
  for(let i=g0.base;i<before.length;i++)if(before[i]!==after[i])assert(allowed.has(i),`unexpected byte change at ${i}`);
  const P0=g0.Read(g0.primitive.attributes.POSITION),P1=g1.Read(g1.primitive.attributes.POSITION),N0=g0.Read(g0.primitive.attributes.NORMAL),N1=g1.Read(g1.primitive.attributes.NORMAL);
  const T0=g0.Read(g0.primitive.attributes.TANGENT),T1=g1.Read(g1.primitive.attributes.TANGENT),J=g0.Read(g0.primitive.attributes.JOINTS_0),W=g0.Read(g0.primitive.attributes.WEIGHTS_0);
  const triangles=Array.from(g0.Read(g0.primitive.indices)),count=P0.length/3;
  const frames=Frames(g0),moved=[];
  for(const [side,frame] of Object.entries(frames)){
    const want=recipe.sides[side].frame;
    for(const [key,value] of [['wrist',frame.wrist],['axis',frame.axis],['thumbSide',frame.u],['quarterTurn',frame.v]])value.forEach((x,k)=>assert(Math.abs(x-want[key][k])<1e-7,`${side} ${key} recomputed from the inverse bind matrices`));
  }
  const arm=Object.fromEntries(Object.keys(frames).map(side=>[side,new Set(['forearm','hand'].map(b=>g0.names.findIndex(n=>n.endsWith(side+b))))]));
  let maxInward=0;
  for(const v of recipe.vertices){
    const p0=Vec(P0,v),p1=Vec(P1,v);if(p0.every((x,k)=>x===p1[k]))continue;moved.push(v);
    const side=p0[0]>0?'l':'r',frame=frames[side],plane=recipe.sides[side].endPlane;
    const d0=Sub(p0,frame.wrist),d1=Sub(p1,frame.wrist),a0=Dot(d0,frame.axis),a1=Dot(d1,frame.axis);
    const r0=Sub(d0,Scale(frame.axis,a0)),r1=Sub(d1,Scale(frame.axis,a1));
    assert(Math.abs(a1-a0)<2e-6,`${v}: radial move only`);
    assert(Len(Cross(Unit(r0),Unit(r1)))<2e-4,`${v}: keeps its angle around the forearm`);
    const inward=Len(r0)-Len(r1);assert(inward>-2e-6&&inward<.025,`${v}: inward taper within 25 mm`);maxInward=Math.max(maxInward,inward);
    const tilted=a0-plane.tiltThumbSide*Dot(r0,frame.u)-plane.tiltQuarterTurn*Dot(r0,frame.v)-plane.alongOffsetMm/1000;
    assert(tilted>recipe.parameters.startMm/1000-1e-6&&tilted<0,`${v}: between the start station and the first hand ring`);
    let w=0;for(let k=0;k<4;k++)if(arm[side].has(J[v*4+k]))w+=W[v*4+k];
    assert(w>recipe.parameters.minimumArmWeight,`${v}: forearm/wrist skin, not fingers`);
  }
  assert.equal(moved.length,recipe.counts.moved,'moved vertex count');
  // Same-position UV-seam copies must stay welded.
  const weldKey=new Map(),weld=new Int32Array(count);
  for(let i=0;i<count;i++){const key=[0,1,2].map(k=>Math.round(P0[i*3+k]/1e-6)).join(',');if(!weldKey.has(key))weldKey.set(key,weldKey.size);weld[i]=weldKey.get(key);}
  const copies=new Map();for(let i=0;i<count;i++){if(!copies.has(weld[i]))copies.set(weld[i],[]);copies.get(weld[i]).push(i);}
  for(const v of moved)for(const c of copies.get(weld[v]))assert([0,1,2].every(k=>P1[c*3+k]===P1[v*3+k]),`${v}/${c}: welded seam`);
  // Normals: independent corner-angle weighted, welded recompute of the geometric change.
  const s0=AngleNormals(P0,triangles,weld,weldKey.size),s1=AngleNormals(P1,triangles,weld,weldKey.size);
  let maxNormalError=0,maxTangentError=0;
  for(let i=0;i<count;i++){
    const a=Unit([s0[weld[i]*3],s0[weld[i]*3+1],s0[weld[i]*3+2]]),b=Unit([s1[weld[i]*3],s1[weld[i]*3+1],s1[weld[i]*3+2]]),change=Len(Sub(b,a));
    if(!listed.has(i)){assert(change<1e-9,`${i}: geometry around an unlisted vertex is unchanged`);continue;}
    const expected=Unit([N0[i*3]+b[0]-a[0],N0[i*3+1]+b[1]-a[1],N0[i*3+2]+b[2]-a[2]]),stored=Vec(N1,i);
    maxNormalError=Math.max(maxNormalError,Len(Sub(expected,stored)));
    // Tangent rotates with its normal; each asset keeps its own tangent convention and w.
    const n0=Unit(Vec(N0,i)),n1=Unit(stored),t0=[T0[i*4],T0[i*4+1],T0[i*4+2]],axis=Cross(n0,n1),s=Len(axis),c=Dot(n0,n1);
    let t=t0;if(s>1e-12){const k=Scale(axis,1/s);t=[0,1,2].map(j=>t0[j]*c+Cross(k,t0)[j]*s+k[j]*Dot(k,t0)*(1-c));}
    maxTangentError=Math.max(maxTangentError,Len(Sub(t,[T1[i*4],T1[i*4+1],T1[i*4+2]])));
    assert.equal(T1[i*4+3],T0[i*4+3],`${i}: tangent handedness unchanged`);
  }
  assert(maxNormalError<2e-6,`normals follow the welded angle-weighted recompute (${maxNormalError})`);
  assert(maxTangentError<2e-6,`tangents rotate with their normals (${maxTangentError})`);
  // Grip correctives are Basis-relative; none of them may displace tapered skin.
  for(const target of g0.primitive.targets||[]){const d=g0.Read(target.POSITION);for(const v of moved)assert(d[v*3]===0&&d[v*3+1]===0&&d[v*3+2]===0,`morph target moves tapered vertex ${v}`);}
  // The ridge itself: dorsal/radial skin profile from 70 mm up the forearm to 15 mm into the hand.
  const ridge=Object.fromEntries(Object.entries(frames).map(([side,frame])=>[side,{before:Ridge(P0,triangles,frame),after:Ridge(P1,triangles,frame)}]));
  for(const [side,{before:b,after:a}] of Object.entries(ridge)){
    assert(b.maxSlope>1&&b.maxBend>.8,`${side}: the gate still sees the original wrist ridge (${b.maxSlope.toFixed(2)}, ${b.maxBend.toFixed(2)})`);
    assert(a.maxSlope<.6,`${side}: tapered dorsal profile slope ${a.maxSlope.toFixed(2)}`);
    assert(a.maxBend<.45,`${side}: no fold left in the dorsal profile (${a.maxBend.toFixed(2)} slope change per 4 mm)`);
  }
  return{moved:moved.length,maxInwardMm:1000*maxInward,maxNormalError,maxTangentError,ridge};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const recipe=LoadFpsForearmTaper(),seam=LoadFpsWristNormalSeam(),lines=[];
  const previous={'Model/Model_FpsHanYangHands.glb':JSON.parse(fs.readFileSync(path.join(project,'Model/Data_FpsHandSkinWeights.json'))).output.sha256,
    'Model/Model_FpsHanYangHandsRepaired.glb':JSON.parse(fs.readFileSync(path.join(project,'Model/Data_FpsHanYangHandRepair.json'))).outputSha256};
  assert.deepEqual(recipe.assets.map(r=>r.asset),Object.keys(previous),'both hand GLBs carry the taper');
  for(const row of recipe.assets){
    // The shipped asset carries the later wrist normal-map seam; peel it off byte-exactly first.
    const bytes=UndoFpsWristNormalSeam(fs.readFileSync(path.join(project,row.asset)),seam,row.asset),restored=UndoFpsForearmTaper(bytes,recipe,row.asset);
    assert.equal(Hash(restored),previous[row.asset],`${row.asset}: undo lands on the previously reviewed layer`);
    const report=ValidateFpsForearmTaper(restored,bytes,recipe,row.asset);
    const corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]^=1;
    assert.throws(()=>UndoFpsForearmTaper(corrupt,recipe,row.asset),/reviewed tapered/,'unrelated corruption is rejected');
    const s=side=>`${side} slope ${report.ridge[side].before.maxSlope.toFixed(2)}->${report.ridge[side].after.maxSlope.toFixed(2)}, fold ${report.ridge[side].before.maxBend.toFixed(2)}->${report.ridge[side].after.maxBend.toFixed(2)}`;
    lines.push(`${path.basename(row.asset)}: ${recipe.vertices.length} vertices (${report.moved} moved, inward <= ${report.maxInwardMm.toFixed(1)} mm), undo -> ${previous[row.asset].slice(0,8)}; dorsal profile ${s('l')}; ${s('r')}`);
  }
  console.log('PASS FpsForearmTaper: '+lines.join(' | '));
}
