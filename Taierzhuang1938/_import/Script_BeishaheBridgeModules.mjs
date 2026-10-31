// Deterministic, lossless packaging of the reviewed Blender export into local
// component scenes. Vertex buffers, PBR images and all existing variants survive.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {LoadGlb} from './Script_LugouGlbPose.mjs';

const Tables=['nodes','meshes','accessors','bufferViews','materials','textures','images','samplers'];
const Clone=value=>structuredClone(value);
const Hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function Sorted(value){return Array.isArray(value)?value.map(Sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,Sorted(value[k])])):value;}
export function ContentHash(json,bin){return Hash(Buffer.concat([Buffer.from(JSON.stringify(Sorted(json))),bin]));}
function Encode(json,bin){
  const j=Buffer.from(JSON.stringify(json)),jp=Buffer.alloc((4-j.length%4)%4,32),bp=Buffer.alloc((4-bin.length%4)%4);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+j.length+jp.length+bin.length+bp.length,8);header.writeUInt32LE(j.length+jp.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length+bp.length);bh.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,j,jp,bh,bin,bp]);
}
function TextureInfos(material){
  const result=[];
  function Walk(value){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){if(key.endsWith('Texture')&&child?.index!=null)result.push(child);else Walk(child);}}
  Walk(material);return result;
}
function Remap(table,row,maps){
  const Map=(kind,index)=>{const result=maps[kind].get(index);if(result==null)throw Error(`Missing ${kind}[${index}]`);return result;};
  if(table==='nodes'){if(row.mesh!=null)row.mesh=Map('meshes',row.mesh);if(row.children)row.children=row.children.map(i=>Map('nodes',i));}
  if(table==='meshes')for(const p of row.primitives){for(const k of Object.keys(p.attributes))p.attributes[k]=Map('accessors',p.attributes[k]);if(p.indices!=null)p.indices=Map('accessors',p.indices);if(p.material!=null)p.material=Map('materials',p.material);if(p.targets)for(const target of p.targets)for(const k of Object.keys(target))target[k]=Map('accessors',target[k]);}
  if(table==='accessors'){if(row.bufferView!=null)row.bufferView=Map('bufferViews',row.bufferView);if(row.sparse)for(const k of ['indices','values'])row.sparse[k].bufferView=Map('bufferViews',row.sparse[k].bufferView);}
  if(table==='materials')for(const info of TextureInfos(row))info.index=Map('textures',info.index);
  if(table==='textures'){if(row.source!=null)row.source=Map('images',row.source);if(row.sampler!=null)row.sampler=Map('samplers',row.sampler);for(const ext of Object.values(row.extensions||{}))if(ext.source!=null)ext.source=Map('images',ext.source);}
  if(table==='images'&&row.bufferView!=null)row.bufferView=Map('bufferViews',row.bufferView);
  return row;
}
function Subset(source,sceneSpecs,kind,version){
  const g=source.json,used=Object.fromEntries(Tables.map(k=>[k,new Set()]));
  function Node(i){if(used.nodes.has(i))return;used.nodes.add(i);const n=g.nodes[i];if(n.mesh!=null)used.meshes.add(n.mesh);for(const c of n.children||[])Node(c);}
  for(const scene of sceneSpecs)for(const i of scene.sourceNodes)Node(i);
  for(const i of used.meshes)for(const p of g.meshes[i].primitives){Object.values(p.attributes).forEach(i=>used.accessors.add(i));if(p.indices!=null)used.accessors.add(p.indices);if(p.material!=null)used.materials.add(p.material);for(const target of p.targets||[])Object.values(target).forEach(i=>used.accessors.add(i));}
  for(const i of used.accessors){const a=g.accessors[i];if(a.bufferView!=null)used.bufferViews.add(a.bufferView);if(a.sparse)for(const key of ['indices','values'])used.bufferViews.add(a.sparse[key].bufferView);}
  for(const i of used.materials)for(const info of TextureInfos(g.materials[i]))used.textures.add(info.index);
  for(const i of used.textures){const t=g.textures[i];if(t.source!=null)used.images.add(t.source);if(t.sampler!=null)used.samplers.add(t.sampler);for(const ext of Object.values(t.extensions||{}))if(ext.source!=null)used.images.add(ext.source);}
  for(const i of used.images){const im=g.images[i];if(im.bufferView==null)throw Error('Expected an embedded image');used.bufferViews.add(im.bufferView);}
  const indices=Object.fromEntries(Tables.map(k=>[k,[...used[k]].sort((a,b)=>a-b)]));
  const maps=Object.fromEntries(Tables.map(k=>[k,new Map(indices[k].map((old,i)=>[old,i]))]));
  const out={asset:Clone(g.asset),scene:0,scenes:[],buffers:[{byteLength:0}]};
  out.asset.extras={moduleKind:kind,assetVersion:version,sourceIndices:indices,
    sourceBufferOffsets:indices.bufferViews.map(i=>g.bufferViews[i].byteOffset??0)};
  if(g.extensionsUsed)out.extensionsUsed=Clone(g.extensionsUsed);
  if(g.extensionsRequired)out.extensionsRequired=Clone(g.extensionsRequired);
  for(const table of Tables)out[table]=indices[table].map(i=>Remap(table,Clone(g[table][i]),maps));
  let length=0;const chunks=[];
  for(const [i,bv] of out.bufferViews.entries()){
    const src=g.bufferViews[indices.bufferViews[i]],pad=Buffer.alloc((4-length%4)%4);chunks.push(pad);length+=pad.length;
    bv.buffer=0;bv.byteOffset=length;const payload=source.bin.subarray(src.byteOffset??0,(src.byteOffset??0)+src.byteLength);chunks.push(payload);length+=payload.length;
  }
  out.buffers[0].byteLength=length;
  const scenes=[];
  for(const [variant,info] of sceneSpecs.entries()){
    // Each default scene is one module. The alternatives are never displayed
    // together, and reuse the same geometry and textures inside their GLB.
    const children=info.sourceNodes.map(i=>maps.nodes.get(i));
    for(const i of children){const node=out.nodes[i];if(node.matrix)throw Error('Unexpected matrix at component root');const t=node.translation||[0,0,0];node.translation=[t[0],t[1],t[2]-info.centerZ];}
    const root=out.nodes.length,name=`Beishahe${kind}${String(variant+1).padStart(2,'0')}`;
    out.nodes.push({name,children,extras:{moduleKind:kind,variantIndex:variant,units:'m',sleeperTopY:0}});
    out.scenes.push({name,nodes:[root]});scenes.push({index:variant,name,sourceCenterZ:info.centerZ,sourceNodes:info.sourceNodes});
  }
  return {bytes:Encode(out,Buffer.concat(chunks)),scenes};
}
export function ExportBridgeModules(sourcePath,outputDir){
  const sourceBytes=fs.readFileSync(sourcePath),source=LoadGlb(sourceBytes),g=source.json;
  if(g.animations?.length||g.skins?.length||g.buffers.length!==1)throw Error('Expected one static reviewed bridge buffer');
  const Span=[],Pier=[],Joint=[],Abutment=[];
  const bySupport=(index,roles)=>g.nodes.flatMap((n,i)=>n.extras?.supportIndex===index&&roles.has(n.extras.role)?[i]:[]);
  const pierRoles=new Set(['Pier','PierDamp','Cap','MasonryOldWash','MasonryRewash']);
  const jointRoles=new Set(['DeckJoint','DeckJointBolts','DeckJointFasteners','DeckJointSplice','DeckJointSupport','GuardJoint','GuardJointBolts','GuardJointSplice','RailJointFasteners','RailJointSplice']);
  for(let i=0;i<14;i++){const id=g.nodes.findIndex(n=>n.extras?.role==='span'&&n.extras.spanIndex===i);if(id<0)throw Error('Missing span');Span.push({sourceNodes:[id],centerZ:g.nodes[id].translation[2]});}
  for(let i=1;i<14;i++){Pier.push({sourceNodes:bySupport(i,pierRoles),centerZ:-140+20*i});Joint.push({sourceNodes:bySupport(i,jointRoles),centerZ:-140+20*i});}
  for(const [end,z] of [['North',-140],['South',140]])Abutment.push({sourceNodes:g.nodes.flatMap((n,i)=>n.name===`Shared_Abutment${end}`||n.extras?.abutment===end?[i]:[]),centerZ:z});
  const version=g.nodes.find(n=>n.name==='BeishaheBridge').extras.assetVersion;
  const manifest={schemaVersion:1,version,appearanceVersion:version,units:'m',axis:'X transverse, Y up, Z along the bridge',sleeperTopY:0,spanPitchM:20,gaugeM:1.435,
    sockets:{Span:{North:[0,0,-10],South:[0,0,10]},Pier:{TrackDatum:[0,0,0]},Joint:{TrackDatum:[0,0,0]},Abutment:{TrackDatum:[0,0,0]}},
    placement:'Span centers are 20 m apart. At each internal boundary place one Pier and one Joint at the same track datum. Use North/South abutment scenes at the endpoints. Do not scale to fit a different span length.',
    reference:{sourceGlbSha256:Hash(sourceBytes),sourceGlbBytes:sourceBytes.length,contentSha256:ContentHash(g,source.bin),sourceGraph:Object.fromEntries(Object.entries(g).filter(([key])=>!Tables.includes(key))),sourceNodes:Clone(g.nodes)},modules:{}};
  fs.mkdirSync(outputDir,{recursive:true});
  for(const [kind,scenes] of Object.entries({Span,Pier,Joint,Abutment})){
    const result=Subset(source,scenes,kind,manifest.version),file=`Model_BeishaheBridge${kind}.glb`;fs.writeFileSync(path.join(outputDir,file),result.bytes);
    manifest.modules[kind]={file,bytes:result.bytes.length,sha256:Hash(result.bytes),defaultScene:0,scenes:result.scenes};
  }
  fs.writeFileSync(path.join(outputDir,'Data_BeishaheBridgeModules.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}

// Reconstruct the original graph only in memory for the existing independent
// geometry audit. Nothing reads a whole-bridge GLB from the repository anymore.
export function AssembleExportedModules(manifestPath){
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')),dir=path.dirname(manifestPath),g=Clone(manifest.reference.sourceGraph),bin=Buffer.alloc(g.buffers[0].byteLength);
  const original=Object.fromEntries(Tables.filter(k=>k!=='nodes').map(k=>[k,[]])),seen=new Map();
  for(const [kind,entry] of Object.entries(manifest.modules)){
    const bytes=fs.readFileSync(path.join(dir,entry.file));if(bytes.length!==entry.bytes||Hash(bytes)!==entry.sha256)throw Error(`Module content mismatch: ${kind}`);
    const {json:part,bin:partBin}=LoadGlb(bytes),meta=part.asset.extras;
    const maps=Object.fromEntries(Tables.map(k=>[k,new Map(meta.sourceIndices[k].map((source,local)=>[local,source]))]));
    for(const table of Object.keys(original))for(const [i,sourceIndex] of meta.sourceIndices[table].entries()){
      const row=Remap(table,Clone(part[table][i]),maps);
      if(table==='bufferViews'){
        const view=part.bufferViews[i],payload=partBin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength),offset=meta.sourceBufferOffsets[i];
        if(seen.has(sourceIndex)&&!payload.equals(seen.get(sourceIndex)))throw Error('Shared buffer bytes differ');seen.set(sourceIndex,payload);payload.copy(bin,offset);row.byteOffset=offset;
      }
      if(original[table][sourceIndex]&&JSON.stringify(Sorted(original[table][sourceIndex]))!==JSON.stringify(Sorted(row)))throw Error(`Shared ${table}[${sourceIndex}] differs`);
      original[table][sourceIndex]=row;
    }
  }
  Object.assign(g,original);g.nodes=Clone(manifest.reference.sourceNodes);
  if(ContentHash(g,bin)!==manifest.reference.contentSha256)throw Error('Modules do not preserve the reviewed graph, geometry and image bytes');
  return {bytes:Encode(g,bin),manifest};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [source,dir]=process.argv.slice(2);if(!source||!dir)throw Error('Usage: node Script_BeishaheBridgeModules.mjs <source.glb> <outputDirectory>');
  const m=ExportBridgeModules(source,dir);AssembleExportedModules(path.join(dir,'Data_BeishaheBridgeModules.json'));
  console.log(JSON.stringify({version:m.version,modules:Object.fromEntries(Object.entries(m.modules).map(([k,v])=>[k,{bytes:v.bytes,scenes:v.scenes.length}]))}));
}
