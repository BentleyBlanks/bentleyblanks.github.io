import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {LoadGlb,ReadAccessor,ReadAccessorInt} from '../_import/Script_LugouGlbPose.mjs';
const Read=(n,d)=>process.argv.find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3)??d;
const baseline=Read('baseline'),file=Read('file'),out=Read('out','tmp/Type89PoseAoAudit'),quality=Read('quality','High');
assert.ok(baseline&&file,'Supply the actual matching --baseline and --file');
const a=LoadGlb(baseline),b=LoadGlb(file),Sha=x=>createHash('sha256').update(x).digest('hex');
function Geometry(g){const sums=g.json.meshes.map(m=>{const rows=[];for(const p of m.primitives){const keys=Object.keys(p.attributes).sort(),attrs=keys.map(k=>ReadAccessor(g,p.attributes[k])),ix=ReadAccessorInt(g,p.indices).data;for(let i=0;i<ix.length;i+=3){const v=[...ix.subarray(i,i+3)].map(j=>attrs.flatMap(x=>[...x.data.subarray(j*x.width,(j+1)*x.width)])),tri=[0,1,2].map(k=>JSON.stringify([v[k],v[(k+1)%3],v[(k+2)%3]])).sort()[0];rows.push(Sha(JSON.stringify([g.json.materials[p.material].name,keys,tri])));}}return Sha(rows.sort().join(''));});return g.json.nodes.map(n=>({name:n.name,children:(n.children??[]).map(i=>g.json.nodes[i].name).sort(),translation:n.translation,rotation:n.rotation,scale:n.scale,matrix:n.matrix,mesh:n.mesh===undefined?null:sums[n.mesh]})).sort((x,y)=>x.name.localeCompare(y.name));}
const ga=Geometry(a),gb=Geometry(b);assert.ok(JSON.stringify(ga)===JSON.stringify(gb),'Actual geometry/normals/tangents/UVs/roles/pivots changed');
function Materials(g){
 function Normalize(value,key=''){
  if(Array.isArray(value))return value.map(v=>Normalize(v));
  if(!value||typeof value!=='object')return value;
  const row={};for(const k of Object.keys(value).sort()){
   if(k==='index'&&/texture/i.test(key)&&Number.isInteger(value[k])){const t=g.json.textures[value[k]],image=g.json.images[t.source??t.extensions?.EXT_texture_webp?.source];row[k]={image:image.name.replace('ArmorPoseOrm','ArmorOrm'),sampler:Normalize(g.json.samplers?.[t.sampler]??{})};}
   else row[k]=Normalize(value[k],k);
  }return row;
 }
 return g.json.materials.map(m=>Normalize(m)).sort((a,b)=>a.name.localeCompare(b.name));
}
assert.deepEqual(Materials(a),Materials(b),'Material factors, texture transforms, normal scales or sampling changed beyond the AO image binding');
function ImageBytes(g,img){const v=g.json.bufferViews[img.bufferView];return g.bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);}
assert.equal(a.json.images.length,b.json.images.length);const rows=[];let orm;
const alphaImages=new Set();for(const material of a.json.materials){if((material.alphaMode??'OPAQUE')==='OPAQUE'&&(material.pbrMetallicRoughness?.baseColorFactor?.[3]??1)===1)continue;const ti=material.pbrMetallicRoughness?.baseColorTexture?.index;if(ti===undefined)continue;const texture=a.json.textures[ti];alphaImages.add(texture.source??texture.extensions?.EXT_texture_webp?.source);}
for(const [imageIndex,img]of a.json.images.entries()){const isOrm=img.name==='Texture_Type89'+quality+'ArmorOrm',target=b.json.images.find(i=>i.name===(isOrm?'Texture_Type89'+quality+'ArmorPoseOrm':img.name));assert.ok(target,'Missing image:'+img.name);const src=await sharp(ImageBytes(a,img)).ensureAlpha().raw().toBuffer({resolveWithObject:true}),dst=await sharp(ImageBytes(b,target)).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual(src.info,dst.info);let unusedAlphaDifferences=0;if(isOrm)orm={src,dst};else{let rgbDifferences=0,alphaDifferences=0;for(let i=0;i<src.data.length;i++)if(src.data[i]!==dst.data[i]){if(i%4===3)alphaDifferences++;else rgbDifferences++;}assert.equal(rgbDifferences,0,'Other decoded RGB changed:'+img.name);if(alphaImages.has(imageIndex))assert.equal(alphaDifferences,0,'Effective opacity changed:'+img.name);else unusedAlphaDifferences=alphaDifferences;}rows.push({name:img.name,otherChannelsExact:!isOrm,unusedAlphaDifferences});}
assert.ok(orm);const width=orm.src.info.width,height=orm.src.info.height,mask=new Uint8Array(width*height),parts=['Mesh_SideVisionFrameLeft','Mesh_SideVisionFrameRight','Mesh_SideVisionFlapLeft','Mesh_SideVisionFlapRight'];
function IntersectsCell(v,x,y){const axes=[[1,0],[0,1],...v.map((p,i)=>{const q=v[(i+1)%3];return[-(q[1]-p[1]),q[0]-p[0]];})];for(const [nx,ny]of axes){const lo=Math.min(...v.map(p=>p[0]*nx+p[1]*ny)),hi=Math.max(...v.map(p=>p[0]*nx+p[1]*ny)),c=(x+.5)*nx+(y+.5)*ny,r=.5*(Math.abs(nx)+Math.abs(ny));if(hi<c-r-1e-5||lo>c+r+1e-5)return false;}return true;}
for(const name of parts){const n=a.json.nodes.find(n=>n.name===name);assert.ok(n?.mesh!==undefined,name);for(const p of a.json.meshes[n.mesh].primitives){if(!a.json.materials[p.material].name.endsWith('Armor'))continue;const uv=ReadAccessor(a,p.attributes.TEXCOORD_0).data,ix=ReadAccessorInt(a,p.indices).data;for(let i=0;i<ix.length;i+=3){const v=[...ix.subarray(i,i+3)].map(j=>[uv[j*2]*width,uv[j*2+1]*height]);const minX=Math.max(0,Math.floor(Math.min(...v.map(p=>p[0])))),maxX=Math.min(width,Math.ceil(Math.max(...v.map(p=>p[0])))),minY=Math.max(0,Math.floor(Math.min(...v.map(p=>p[1])))),maxY=Math.min(height,Math.ceil(Math.max(...v.map(p=>p[1]))));for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++)if(IntersectsCell(v,x,y))mask[y*width+x]=1;}}}
for(let step=0;step<3;step++){const old=mask.slice();for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(old[y*width+x]){if(x)mask[y*width+x-1]=1;if(x+1<width)mask[y*width+x+1]=1;if(y)mask[(y-1)*width+x]=1;if(y+1<height)mask[(y+1)*width+x]=1;}}
let changed=0,outside=0,gbChanged=0,maxAoDelta=0;for(let i=0;i<mask.length;i++){const j=i*4;if(orm.src.data[j]!==orm.dst.data[j]){changed++;maxAoDelta=Math.max(maxAoDelta,Math.abs(orm.src.data[j]-orm.dst.data[j]));if(!mask[i])outside++;}for(const k of [1,2,3])if(orm.src.data[j+k]!==orm.dst.data[j+k])gbChanged++;}
assert.equal(gbChanged,0,'ORM roughness/metallic/alpha changed');assert.equal(outside,0,'AO pixels changed outside the actual side-lid/frame UV footprint and narrow gutter');assert.ok(changed>100);
const report={pass:true,baseline,file,baselineSha256:Sha(a.buffer),sha256:Sha(b.buffer),geometryCornerDataExact:true,materialParametersTransformsAndSamplingExact:true,allOtherDecodedImagesExact:true,ormGreenBlueAlphaExact:true,changedAoTexels:changed,outsideScope:outside,maxAoDelta,scopeParts:parts,images:rows,goalComplete:false};await fs.mkdir(out,{recursive:true});await fs.writeFile(out+'/Data_ActualPatchAudit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:true,changedAoTexels:changed,outside,geometryExact:true,materialsExact:true,otherImagesExact:true}));
