// Independently verify the wrist-seam fade of the scanned FPS skin normal map,
// then recover the exact previous bytes of both hand GLBs (the forearm taper's
// outputs). The new map is a lossless WebP appended to the BIN; every texel is
// recomputed here from the GLB geometry and the libwebp decode of the old map.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const project=path.dirname(fileURLToPath(import.meta.url));
export const FPS_WRIST_NORMAL_SEAM_RECIPE='Model/Data_FpsWristNormalSeam.json';
const Hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export function LoadFpsWristNormalSeam(){return JSON.parse(fs.readFileSync(path.join(project,FPS_WRIST_NORMAL_SEAM_RECIPE),'utf8'));}

function Split(bytes){
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const jsonLength=bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(16),0x4e4f534a);
  const binLength=bytes.readUInt32LE(20+jsonLength);assert.equal(bytes.readUInt32LE(24+jsonLength),0x004e4942);
  assert.equal(28+jsonLength+binLength,bytes.length);
  let end=20+jsonLength;while(bytes[end-1]===0x20)end--;
  return{jsonLength,binLength,base:28+jsonLength,text:bytes.subarray(20,end),doc:JSON.parse(bytes.subarray(20,20+jsonLength))};
}

function Pack(text,bin,jsonChunkLength=text.length+(-text.length&3)){
  const out=Buffer.alloc(28+jsonChunkLength+bin.length,0x20);
  out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
  out.writeUInt32LE(jsonChunkLength,12);out.writeUInt32LE(0x4e4f534a,16);text.copy(out,20);
  out.writeUInt32LE(bin.length,20+jsonChunkLength);out.writeUInt32LE(0x004e4942,24+jsonChunkLength);bin.copy(out,28+jsonChunkLength);
  return out;
}

// Recorded byte edits of the JSON text; offsets refer to the previous text.
function Splice(text,edits,forward){
  const pieces=[];let cursor=0,shift=0;
  for(const e of [...edits].sort((a,b)=>a.at-b.at)){
    const [from,to]=(forward?[e.before,e.after]:[e.after,e.before]).map(s=>Buffer.from(s,'ascii')),at=e.at+(forward?0:shift);
    assert(text.subarray(at,at+from.length).equals(from),`JSON edit at ${e.at} matches the reviewed text`);
    pieces.push(text.subarray(cursor,at),to);cursor=at+from.length;shift+=e.after.length-e.before.length;
  }
  pieces.push(text.subarray(cursor));return Buffer.concat(pieces);
}

export function UndoFpsWristNormalSeam(bytes,recipe,asset){
  assert.equal(recipe.version,1,'supported wrist-seam recipe');
  const row=recipe.assets.find(r=>r.asset===asset);assert(row,'asset belongs to the reviewed wrist-seam layer');
  assert.equal(Hash(bytes),row.after.sha256,'exact reviewed wrist-seam asset');
  const glb=Split(bytes),keep=row.before.binChunkLength,size=recipe.texture.after.bytes;
  const appended=bytes.subarray(glb.base+keep);
  assert.equal(Hash(appended.subarray(0,size)),recipe.texture.after.sha256,'appended range is the reviewed image');
  assert(appended.subarray(size).every(b=>b===0)&&appended.length-size<4,'only zero padding follows it');
  const restored=Pack(Splice(glb.text,row.jsonEdits,false),bytes.subarray(glb.base,glb.base+keep),row.before.jsonChunkLength);
  assert.equal(Hash(restored),row.before.sha256,'undo restores every previous GLB byte');
  return restored;
}

function Slot(glb,bytes,index){
  const a=glb.doc.accessors[index],v=glb.doc.bufferViews[a.bufferView],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType];
  assert(!a.sparse&&!a.normalized&&(v.buffer||0)===0);
  const read={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType],stride=v.byteStride||width*size,start=glb.base+(v.byteOffset||0)+(a.byteOffset||0);
  const out=new Float64Array(a.count*width);
  for(let i=0;i<a.count;i++)for(let k=0;k<width;k++)out[i*width+k]=bytes[read](start+i*stride+k*size);
  return out;
}

function SkinPrimitive(doc){
  const found=[];doc.meshes.forEach((m,mi)=>m.primitives.forEach((p,pi)=>{if(doc.materials[p.material]?.name==='Material_HanYangScanSkin')found.push([mi,pi]);}));
  assert.equal(found.length,1,'one scanned skin primitive');return doc.meshes[found[0][0]].primitives[found[0][1]];
}

function ImageBytes(glb,bytes,index){const v=glb.doc.bufferViews[glb.doc.images[index].bufferView];return bytes.subarray(glb.base+(v.byteOffset||0),glb.base+(v.byteOffset||0)+v.byteLength);}

export function ValidateFpsWristNormalSeamStructure(before,after,recipe,asset){
  const row=recipe.assets.find(r=>r.asset===asset),g0=Split(before),g1=Split(after);
  assert.equal(Hash(before),row.before.sha256);assert.equal(Hash(after),row.after.sha256);
  assert(after.subarray(g1.base,g1.base+g0.binLength).equals(before.subarray(g0.base)),'previous BIN bytes stay in place');
  const expected=structuredClone(g0.doc),texture=recipe.texture.index,oldImage=recipe.texture.before.image;
  assert.equal(expected.textures[texture].extensions.EXT_texture_webp.source,oldImage);
  assert.equal(expected.materials[SkinPrimitive(expected).material].normalTexture.index,texture,'texture is the skin normal map');
  expected.bufferViews.push({buffer:0,byteLength:recipe.texture.after.bytes,byteOffset:g0.binLength});
  expected.images.push({bufferView:expected.bufferViews.length-1,mimeType:'image/webp',name:recipe.texture.after.name});
  expected.textures[texture].extensions.EXT_texture_webp.source=expected.images.length-1;
  expected.buffers[0].byteLength=g1.binLength;
  assert.deepEqual(g1.doc,expected,'JSON differs only by the appended view/image, the repointed normal texture and the buffer length');
  assert.equal(g1.doc.textures.filter(t=>t.extensions?.EXT_texture_webp?.source===oldImage||t.source===oldImage).length,0,'old normal map no longer referenced');
  const image=ImageBytes(g1,after,g1.doc.images.length-1);
  assert.equal(Hash(image),recipe.texture.after.sha256);
  assert.equal(image.subarray(0,4).toString(),'RIFF');assert.equal(image.subarray(8,16).toString(),'WEBPVP8L');assert.equal(image[20],0x2f,'lossless WebP');
  const bits=image.readUInt32LE(21);assert.deepEqual([(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1],recipe.texture.size,'same resolution');
  assert(ImageBytes(g0,before,oldImage).equals(ImageBytes(g1,after,oldImage)),'old image bytes unchanged');
  return{oldImage:ImageBytes(g0,before,oldImage),newImage:image};
}

// libwebp (Pillow) decode; Chromium decodes the original lossy map to the identical RGB.
function DecodeWebp(images){
  const input=Buffer.concat(images.flatMap(b=>{const n=Buffer.alloc(4);n.writeUInt32LE(b.length);return [n,b];}));
  const code='import io,struct,sys\nfrom PIL import Image\nd=sys.stdin.buffer.read();o=0\nwhile o<len(d):\n n=struct.unpack_from("<I",d,o)[0];o+=4\n im=Image.open(io.BytesIO(d[o:o+n]));o+=n\n assert im.mode=="RGB",im.mode\n sys.stdout.buffer.write(im.tobytes())\n';
  const run=spawnSync(process.env.PYTHON||'python',['-c',code],{input,maxBuffer:256*1024*1024,windowsHide:true});
  assert.equal(run.status,0,`Pillow WebP decode failed (needs python + Pillow): ${run.stderr}`);
  return run.stdout;
}

const Smooth=x=>{x=Math.min(Math.max(x,0),1);return x*x*(3-2*x);};

// Same arithmetic, in the same order, as _blender/Script_FpsWristNormalSeamBake.py.
function WristField(glb,bytes,taper,p){
  const prim=SkinPrimitive(glb.doc),P=Slot(glb,bytes,prim.attributes.POSITION),T=Slot(glb,bytes,prim.indices),n=P.length/3;
  const t=new Float64Array(n),radius=new Float64Array(n),side=new Uint8Array(n); // 1 = left (x > 0)
  for(let i=0;i<n;i++){
    side[i]=P[i*3]>0?1:0;const s=taper.sides[side[i]?'l':'r'],f=s.frame,pl=s.endPlane,w=f.wrist,ax=f.axis,u=f.thumbSide,v=f.quarterTurn;
    const d0=P[i*3]-w[0],d1=P[i*3+1]-w[1],d2=P[i*3+2]-w[2],along=d0*ax[0]+d1*ax[1]+d2*ax[2];
    const r0=d0-along*ax[0],r1=d1-along*ax[1],r2=d2-along*ax[2],ru=r0*u[0]+r1*u[1]+r2*u[2],rv=r0*v[0]+r1*v[1]+r2*v[2];
    t[i]=along-pl.tiltThumbSide*ru-pl.tiltQuarterTurn*rv-pl.alongOffsetMm/1000;radius[i]=Math.sqrt(r0*r0+r1*r1+r2*r2);
  }
  const window=p.bridgeWindowMm/1000,reach=p.radiusMm/1000,bridge=[];
  for(let f=0;f<T.length;f+=3){
    const c=[T[f],T[f+1],T[f+2]];
    if(c.some(v=>side[v]!==side[c[0]]||!(Math.abs(t[v])<window)||!(radius[v]<reach)))continue;
    if(Math.min(...c.map(v=>t[v]))<0&&Math.max(...c.map(v=>t[v]))>0)bridge.push(f/3);
  }
  const h=new Float64Array(n).fill(Infinity),ring={};
  for(const s of [1,0]){
    let ringT=-Infinity;const ringSet=new Set(),foreSet=new Set();
    for(const f of bridge)if(side[T[f*3]]===s)for(let k=0;k<3;k++){const v=T[f*3+k];if(t[v]>0){ringSet.add(v);ringT=Math.max(ringT,t[v]);}else if(t[v]<0)foreSet.add(v);}
    for(let i=0;i<n;i++)if(side[i]===s&&radius[i]<reach)h[i]=t[i]-ringT;
    ring[s?'l':'r']={bridgeTriangles:bridge.filter(f=>side[T[f*3]]===s).length,ringVertices:ringSet.size,forearmEdgeVertices:foreSet.size,ringTMm:Math.round(ringT*1e7)/1e4};
  }
  return{T,t,h,bridge,ring,uv:Slot(glb,bytes,prim.attributes.TEXCOORD_0)};
}

function Rasterize(uv,T,faces,size,values,covered,field){
  for(const f of faces){
    const a=T[f*3],b=T[f*3+1],c=T[f*3+2];
    const x0=uv[a*2]*size,y0=uv[a*2+1]*size,x1=uv[b*2]*size,y1=uv[b*2+1]*size,x2=uv[c*2]*size,y2=uv[c*2+1]*size;
    const det=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2);if(det===0)continue;
    const lx=Math.max(Math.floor(Math.min(x0,x1,x2)),0),hx=Math.min(Math.ceil(Math.max(x0,x1,x2)),size-1);
    const ly=Math.max(Math.floor(Math.min(y0,y1,y2)),0),hy=Math.min(Math.ceil(Math.max(y0,y1,y2)),size-1);
    for(let y=ly;y<=hy;y++){const py=y+.5;for(let x=lx;x<=hx;x++){
      const px=x+.5,l0=((y1-y2)*(px-x2)+(x2-x1)*(py-y2))/det,l1=((y2-y0)*(px-x2)+(x0-x2)*(py-y2))/det,l2=1-l0-l1;
      if(!(l0>=0&&l1>=0&&l2>=0))continue;
      const i=y*size+x;covered[i]=1;
      if(field){const value=l0*values[a]+l1*values[b]+l2*values[c];if(value<field[i])field[i]=value;}
    }}
  }
}

const TiltDeg=(rgb,i)=>{const x=rgb[i*3]/255*2-1,y=rgb[i*3+1]/255*2-1,z=rgb[i*3+2]/255*2-1;return Math.acos(Math.max(-1,Math.min(1,z/Math.hypot(x,y,z))))*180/Math.PI;};
const Percentile=(values,q)=>{const s=Float64Array.from(values).sort();const r=(s.length-1)*q/100,lo=Math.floor(r);return s[lo]+(s[Math.min(lo+1,s.length-1)]-s[lo])*(r-lo);};

export function ValidateFpsWristNormalSeamPixels(bytes,recipe,taper,oldImage,newImage){
  const p=recipe.parameters,size=p.textureSize,glb=Split(bytes),field=WristField(glb,bytes,taper,p);
  for(const s of ['l','r'])for(const key of ['bridgeTriangles','ringVertices','forearmEdgeVertices'])assert.equal(field.ring[s][key],recipe.sides[s][key],`${s} ${key}`);
  for(const s of ['l','r'])assert.equal(field.ring[s].bridgeTriangles,342,`${s}: one ring of bridge triangles between forearm and hand`);
  const decoded=DecodeWebp([oldImage,newImage]),old=decoded.subarray(0,size*size*3),now=decoded.subarray(size*size*3);
  assert.equal(now.length,size*size*3);
  assert.equal(Hash(old),recipe.texture.before.decodedRgbSha256,'libwebp decode of the original map');
  assert.equal(Hash(now),recipe.texture.after.decodedRgbSha256);
  const {T,h,t,uv}=field,reach=(p.holdMm+p.fadeMm)/1000,nTri=T.length/3;
  const hand=[];for(let f=0;f<nTri;f++){const c=[T[f*3],T[f*3+1],T[f*3+2]];if(c.every(v=>Number.isFinite(h[v])&&t[v]>0)&&Math.min(...c.map(v=>h[v]))<reach)hand.push(f);}
  const zoneSet=new Set([...field.bridge,...hand]),zone=[...zoneSet];
  const values=Float64Array.from(h,v=>Number.isFinite(v)?v:1);
  const covered=new Uint8Array(size*size),weight=new Float64Array(size*size).fill(Infinity);
  Rasterize(uv,T,zone,size,values,covered,weight);
  let y0=size,y1=-1,x0=size,x1=-1;
  for(let i=0;i<size*size;i++)if(covered[i]){weight[i]=Smooth((weight[i]-p.holdMm/1000)/(p.fadeMm/1000));const y=Math.floor(i/size),x=i-y*size;y0=Math.min(y0,y);y1=Math.max(y1,y);x0=Math.min(x0,x);x1=Math.max(x1,x);}
  const pad=2*p.gutterPx+2;y0=Math.max(y0-pad,0);y1=Math.min(y1+pad+1,size);x0=Math.max(x0-pad,0);x1=Math.min(x1+pad+1,size);
  assert.deepEqual([x0,y0,x1,y1],recipe.editBox,'edit box');
  const others=[];
  for(let f=0;f<nTri;f++){if(zoneSet.has(f))continue;const xs=[0,1,2].map(k=>uv[T[f*3+k]*2]*size),ys=[0,1,2].map(k=>uv[T[f*3+k]*2+1]*size);
    if(Math.max(...xs)>=x0&&Math.min(...xs)<=x1&&Math.max(...ys)>=y0&&Math.min(...ys)<=y1)others.push(f);}
  const otherCovered=new Uint8Array(size*size);Rasterize(uv,T,others,size,null,otherCovered,null);
  let shared=0;for(let i=0;i<size*size;i++){if(covered[i]&&otherCovered[i]&&weight[i]<1)shared++;if(!covered[i]&&otherCovered[i])weight[i]=1;}
  assert.equal(shared,recipe.counts.sharedEdgeTexels,'edited zone does not share texels with other triangles');
  // Gutter: synchronous 8-neighbour growth inside the box from every covered texel; ties take the lower weight.
  const step=new Uint8Array(size*size);let frontier=[];
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=y*size+x;if(Number.isFinite(weight[i]))frontier.push(i);}
  let gutter=0;
  for(let k=1;k<=p.gutterPx&&frontier.length;k++){
    const next=new Set();
    for(const i of frontier){const y=Math.floor(i/size),x=i-y*size;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const yy=y+dy,xx=x+dx;if((dy||dx)&&yy>=y0&&yy<y1&&xx>=x0&&xx<x1&&weight[yy*size+xx]===Infinity)next.add(yy*size+xx);}}
    const grown=[];
    for(const i of next){const y=Math.floor(i/size),x=i-y*size;let m=Infinity;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const yy=y+dy,xx=x+dx;if(!(dy||dx)||yy<y0||yy>=y1||xx<x0||xx>=x1)continue;const j=yy*size+xx;if(Number.isFinite(weight[j])&&step[j]<k&&weight[j]<m)m=weight[j];}
      grown.push([i,m]);}
    for(const [i,m] of grown){weight[i]=m;step[i]=k;if(m<1)gutter++;}
    frontier=grown.map(([i])=>i);
  }
  assert.equal(gutter,recipe.counts.gutterTexels,'gutter texels');
  // Every texel: unchanged outside the edit, the recorded blend inside it.
  const flat=p.flatRgb;let edited=0,changed=0,mismatch=0;
  for(let i=0;i<size*size;i++){
    const w=weight[i];
    for(let c=0;c<3;c++){
      const want=w<1?Math.floor((1-w)*flat[c]+w*old[i*3+c]+.5):old[i*3+c];
      if(now[i*3+c]!==want)mismatch++;
    }
    if(w<1)edited++;if(now[i*3]!==old[i*3]||now[i*3+1]!==old[i*3+1]||now[i*3+2]!==old[i*3+2])changed++;
  }
  assert.equal(mismatch,0,'every texel equals the independently recomputed fade (and the original outside it)');
  assert.equal(edited,recipe.counts.editedTexels);assert.equal(changed,recipe.counts.changedTexels);
  // The line itself: the bridge band and the jump at the first hand ring.
  const bridgeCovered=new Uint8Array(size*size);Rasterize(uv,T,field.bridge,size,null,bridgeCovered,null);
  const stats={};
  for(const [name,rgb] of [['before',old],['after',now]]){
    const bridgeTilt=[],jumps=[];
    for(let y=0;y<size-1;y++)for(let x=0;x<size-1;x++){
      const i=y*size+x;if(!covered[i]&&!bridgeCovered[i])continue;
      const here=TiltDeg(rgb,i);if(bridgeCovered[i])bridgeTilt.push(here);
      jumps.push(Math.max(Math.abs(TiltDeg(rgb,i+size)-here),Math.abs(TiltDeg(rgb,i+1)-here)));
    }
    stats[name]={bridgeP90:Percentile(bridgeTilt,90),bridgeMax:Math.max(...bridgeTilt),jumpP999:Percentile(jumps,99.9),jumpMax:jumps.reduce((m,v)=>Math.max(m,v),0)};
  }
  assert(stats.before.bridgeP90>10&&stats.before.jumpMax>20,`the gate still sees the original wrist band (${stats.before.bridgeP90.toFixed(1)}, ${stats.before.jumpMax.toFixed(1)} deg)`);
  assert(stats.after.bridgeMax<.5,`bridge texels are the forearm's flat value (${stats.after.bridgeMax.toFixed(2)} deg)`);
  assert(stats.after.jumpMax<8&&stats.after.jumpP999<4,`no step left between neighbouring wrist texels (max ${stats.after.jumpMax.toFixed(2)}, p99.9 ${stats.after.jumpP999.toFixed(2)} deg)`);
  return{edited,changed,gutter,stats,zone:zone.length};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const recipe=LoadFpsWristNormalSeam(),taper=JSON.parse(fs.readFileSync(path.join(project,recipe.previousLayer),'utf8'));
  assert.deepEqual(recipe.assets.map(r=>r.asset),taper.assets.map(r=>r.asset),'both hand GLBs carry the wrist-seam layer');
  let images=null;const lines=[];
  for(const row of recipe.assets){
    const bytes=fs.readFileSync(path.join(project,row.asset)),restored=UndoFpsWristNormalSeam(bytes,recipe,row.asset);
    assert.equal(Hash(restored),taper.assets.find(r=>r.asset===row.asset).after.sha256,`${row.asset}: undo lands on the reviewed forearm taper`);
    const pair=ValidateFpsWristNormalSeamStructure(restored,bytes,recipe,row.asset);
    if(images)assert(images.newImage.equals(pair.newImage)&&images.oldImage.equals(pair.oldImage),'both GLBs share one normal map');else images=pair;
    const corrupt=Buffer.from(bytes);corrupt[corrupt.length-5]^=1;
    assert.throws(()=>UndoFpsWristNormalSeam(corrupt,recipe,row.asset),/reviewed wrist-seam/,'unrelated corruption is rejected');
    lines.push(`${path.basename(row.asset)} +${bytes.length-restored.length} bytes, undo -> ${Hash(restored).slice(0,8)}`);
  }
  const fieldAsset=fs.readFileSync(path.join(project,recipe.mesh.fieldAsset));
  const r=ValidateFpsWristNormalSeamPixels(fieldAsset,recipe,taper,images.oldImage,images.newImage),f=v=>v.toFixed(1);
  console.log(`PASS FpsWristNormalSeam: ${lines.join(' | ')}; ${r.zone} wrist triangles, ${r.edited} texels faded (${r.changed} changed, ${r.gutter} gutter), all recomputed exactly; `
    +`bridge tilt p90 ${f(r.stats.before.bridgeP90)}->${f(r.stats.after.bridgeP90)} deg, neighbour jump max ${f(r.stats.before.jumpMax)}->${f(r.stats.after.jumpMax)} deg`);
}
