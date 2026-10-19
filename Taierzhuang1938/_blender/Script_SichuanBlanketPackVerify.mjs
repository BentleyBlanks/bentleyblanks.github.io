// Pure Node audit of the delivered GLB, independent of baker self-reports.
// Usage: node Taierzhuang1938/_blender/Script_SichuanBlanketPackVerify.mjs [model.glb]
// Reports stay in ignored tmp/. Uses the repository's sharp dependency to
// independently decode real pixel data, without a browser or Blender.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {LoadGlb,ReadAccessor,ReadAccessorInt} from '../_import/Script_LugouGlbPose.mjs';

const projectDir=fileURLToPath(new URL('../',import.meta.url));
const defaultFile=path.join(projectDir,'Model/SichuanBlanketPack/Model_SichuanBlanketPack.glb');
const modelFile=path.resolve(process.argv[2]??defaultFile);
const outDir=path.resolve(projectDir,'../tmp/SichuanBlanketPack/Review');
const textureManifestFile=path.join(projectDir,'Model/SichuanBlanketPack/Data_SichuanBlanketPackTextures.json');
const report={file:modelFile,checks:[],parts:{},materials:[],images:[],externalMaps:[],uvPrimitives:[],totalTriangles:0};
const Hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const atlasRegions={surface:{id:'surface',uv:[0,0,1,1]}};
const materialRegions={Material_SichuanPackBaked:'surface'};
let runtimeTexCoord=1;
const uvTriangles=[];
const uvOwners=[];
function Check(ok,label,detail=null){report.checks.push({ok:!!ok,label,...(detail===null?{}:{detail})});if(!ok)console.error(`FAIL ${label}${detail===null?'':`  ${typeof detail==='string'?detail:JSON.stringify(detail)}`}`);}
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const Near=(a,b,epsilon=1e-6)=>a.length===b.length&&a.every((value,index)=>Math.abs(value-b[index])<=epsilon);
function Multiply(a,b){const out=Array(16).fill(0);for(let row=0;row<4;row++)for(let col=0;col<4;col++)for(let k=0;k<4;k++)out[col*4+row]+=a[k*4+row]*b[col*4+k];return out;}
function NodeMatrix(node){
  if(node.matrix)return node.matrix;
  const [x,y,z,w]=node.rotation??[0,0,0,1],[sx,sy,sz]=node.scale??[1,1,1],[tx,ty,tz]=node.translation??[0,0,0];
  return [(1-2*(y*y+z*z))*sx,2*(x*y+w*z)*sx,2*(x*z-w*y)*sx,0,2*(x*y-w*z)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+w*x)*sy,0,2*(x*z+w*y)*sz,2*(y*z-w*x)*sz,(1-2*(x*x+y*y))*sz,0,tx,ty,tz,1];
}
function Transform(m,p){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
function Bounds(points){if(!points.length)return null;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const point of points)for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],point[axis]);max[axis]=Math.max(max[axis],point[axis]);}return {min,max,size:max.map((value,index)=>value-min[index]),center:max.map((value,index)=>(value+min[index])/2)};}
function ImageSize(bytes){
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {format:'png',width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
    for(let offset=12;offset+8<=bytes.length;){const chunk=bytes.toString('ascii',offset,offset+4),length=bytes.readUInt32LE(offset+4),body=offset+8;
      if(chunk==='VP8X')return {format:'webp',width:1+bytes.readUIntLE(body+4,3),height:1+bytes.readUIntLE(body+7,3)};
      if(chunk==='VP8L'){const packed=bytes.readUInt32LE(body+1);return {format:'webp',width:1+(packed&0x3fff),height:1+((packed>>>14)&0x3fff)};}
      if(chunk==='VP8 ')return {format:'webp',width:bytes.readUInt16LE(body+6)&0x3fff,height:bytes.readUInt16LE(body+8)&0x3fff};
      offset=body+length+(length%2);
    }
  }
  if(bytes[0]===0xff&&bytes[1]===0xd8){
    let offset=2;while(offset+4<bytes.length){if(bytes[offset]!==0xff){offset++;continue;}const marker=bytes[offset+1];offset+=2;if(marker===0xd8||marker===0xd9)continue;const length=bytes.readUInt16BE(offset);if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return {format:'jpeg',height:bytes.readUInt16BE(offset+3),width:bytes.readUInt16BE(offset+5)};offset+=length;}
  }
  throw Error('Unsupported or invalid source image encoding');
}

try{
  Check(fs.existsSync(modelFile),'GLB exists',modelFile);
  if(!fs.existsSync(modelFile))throw Error('Model has not been generated');
  const glb=LoadGlb(modelFile),g=glb.json;
  report.sha256=Hash(glb.buffer);
  const textureManifest=JSON.parse(fs.readFileSync(textureManifestFile,'utf8'));
  const bakeRecord=JSON.parse(fs.readFileSync(path.join(projectDir,textureManifest.bakeRecord),'utf8'));
  const externalMaps=new Map();
  Check(textureManifest.normalConvention==='gl','Manifest declares OpenGL tangent-space normals');
  Check(textureManifest.atlas?.uvOrigin==='bottom-left','Manifest atlas coordinates are Blender bottom-left UVs');
  Check(textureManifest.atlas?.layout==='unique-surface-uv','Actual surface reprojection is documented, rather than the old material-study quadrants');
  runtimeTexCoord=textureManifest.atlas?.texCoord;
  Check(runtimeTexCoord===1&&textureManifest.atlas?.uvSet==='GameUV','The production atlas uses the explicit GameUV / TEXCOORD_1 contract');
  for(const channel of ['Base','Normal','Orm']){
    const entries=textureManifest.files.filter(entry=>entry.channel===channel);
    Check(entries.length===1,`Exactly one external ${channel} map is registered`,entries.length);
    if(entries.length!==1)continue;
    const entry=entries[0],file=path.join(projectDir,entry.path),bytes=fs.readFileSync(file),size=ImageSize(bytes),sha256=Hash(bytes);
    const baked=bakeRecord.outputs?.find(value=>value.channel===channel);
    const actual={channel,file,...size,bytes:bytes.length,sha256};report.externalMaps.push(actual);
    externalMaps.set(channel,{...actual,data:bytes,name:path.basename(file)});
    Check(size.width===1024&&size.height===1024,`External ${channel} image is really 1024 square`,size);
    Check(entry.width===size.width&&entry.height===size.height&&entry.bytes===bytes.length,`External ${channel} size matches its manifest`,actual);
    Check(sha256===entry.sha256,`Entire external ${channel} SHA-256 matches its manifest`,{actual:sha256,expected:entry.sha256});
    Check(!!baked&&sha256===baked.sha256&&bytes.length===baked.bytes&&size.width===baked.width&&size.height===baked.height,`Entire external ${channel} matches the independent bake record`,baked);
    Check(entry.colorSpace===(channel==='Base'?'sRGB':'linear'),`External ${channel} has the correct documented color-space semantic`,entry.colorSpace);
  }
  const orm=externalMaps.get('Orm');
  const ormPixels=await sharp(orm.data).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const extrema={min:[255,255,255],max:[0,0,0]};
  for(let pixel=0;pixel<ormPixels.data.length;pixel+=3)for(let channel=0;channel<3;channel++){const value=ormPixels.data[pixel+channel];extrema.min[channel]=Math.min(extrema.min[channel],value);extrema.max[channel]=Math.max(extrema.max[channel],value);}
  report.ormProof={method:'Independent full-pixel decode of the delivered lossless WebP',pixels:ormPixels.info.width*ormPixels.info.height,...extrema};
  Check(ormPixels.info.channels===3&&report.ormProof.pixels===1048576&&extrema.min[2]===0&&extrema.max[2]===0,'Every one of the 1,048,576 metallic pixels is zero',report.ormProof);
  Check(extrema.min[1]===242&&extrema.max[1]===242,'Every roughness pixel stays at the dry-fibre value 242/255',extrema);
  Check(extrema.max[0]-extrema.min[0]>=20&&extrema.max[0]>=240,'AO contains a real varying surface-occlusion bake, rather than the old constant placeholder',extrema);
  Check(glb.buffer.readUInt32LE(4)===2&&glb.buffer.readUInt32LE(8)===glb.buffer.length,'GLB 2 header and byte length are valid');
  Check(g.asset?.version==='2.0','glTF 2.0 asset');
  Check(!(g.skins?.length),'Rigid parts have no skin dependency');
  Check(!(g.extensionsRequired??[]).some(name=>/draco|meshopt|basisu/i.test(name)),'Uncompressed source geometry and ordinary source images can be audited');
  const names=['Pack_Root','Pack_Bundle','Pack_Binding','Pack_Sandals','Pack_StrawMat','Pack_Jacket'];
  const nodeIds=Object.fromEntries(names.map(name=>[name,(g.nodes??[]).flatMap((node,index)=>node.name===name?[index]:[])]));
  for(const name of names)Check(nodeIds[name].length===1,`Exactly one ${name}`,nodeIds[name]);
  const rootId=nodeIds.Pack_Root[0],roots=g.scenes[g.scene??0]?.nodes??[];
  Check(roots.length===1&&roots[0]===rootId,'The active scene root is Pack_Root',roots);
  if(rootId===undefined)throw Error('Cannot audit absent Pack_Root');
  Check(Near(NodeMatrix(g.nodes[rootId]),identity),'Pack_Root origin and axes are identity (meters, Y-up)');
  const parent=new Map(),world=new Map(),reachable=new Set(),allTriangles=[],usedMaterials=new Set();
  function Walk(index,matrix,partName=null){
    if(reachable.has(index))throw Error(`Repeated scene node ${index}`);reachable.add(index);
    const node=g.nodes[index],next=Multiply(matrix,NodeMatrix(node));world.set(index,next);
    const owner=names.slice(1).includes(node.name)?node.name:partName;
    if(owner&&!report.parts[owner])report.parts[owner]={node:nodeIds[owner][0],points:[],triangles:[],meshNodes:[],materials:[]};
    if(node.mesh!==undefined){
      Check(!!owner,`Mesh ${node.name??index} belongs to a named independently controllable part`);
      const part=report.parts[owner];if(part)part.meshNodes.push(index);
      for(const primitive of g.meshes[node.mesh].primitives){
        const mode=primitive.mode??4;Check(mode===4,`${node.name} uses triangle primitives`,mode);if(mode!==4)continue;
        const uvAttribute='TEXCOORD_'+runtimeTexCoord;
        for(const attr of ['POSITION','NORMAL',uvAttribute])Check(primitive.attributes[attr]!==undefined,`${node.name} has ${attr}`);
        if(primitive.attributes.POSITION===undefined)continue;
        const accessor=g.accessors[primitive.attributes.POSITION];Check(!accessor.sparse,`${node.name} POSITION is directly readable`);
        const positions=ReadAccessor(glb,primitive.attributes.POSITION),points=[];
        for(let index=0;index<positions.count;index++){const point=Array.from(positions.data.subarray(index*3,index*3+3));if(!point.every(Number.isFinite))throw Error('Nonfinite geometry');points.push(Transform(next,point));}
        let primitiveUv=null;
        if(primitive.attributes[uvAttribute]!==undefined){
          const uvId=primitive.attributes[uvAttribute],uvAccessor=g.accessors[uvId],uv=ReadAccessor(glb,uvId);primitiveUv=uv;
          const material=g.materials[primitive.material],regionKey=materialRegions[material?.name],region=atlasRegions[regionKey];
          Check(uvAccessor.type==='VEC2'&&!uvAccessor.sparse&&uv.count===positions.count,`${node.name} has one directly readable UV pair per actual vertex`);
          Check(!!region&&material?.extras?.AtlasRegion===regionKey,`${material?.name??primitive.material} declares its expected atlas region`,regionKey);
          if(region){
            // Blender UVs are bottom-left; exported glTF texture coordinates
            // use the image's top-left origin. Audit real exported UVs after
            // this V conversion, rather than comparing incompatible frames.
            const [u0,v0,u1,v1]=region.uv,expected=[u0,1-v1,u1,1-v0];
            const min=[Infinity,Infinity],max=[-Infinity,-Infinity];let outside=0;
            for(let vertex=0;vertex<uv.count;vertex++){
              const u=uv.data[vertex*2],v=uv.data[vertex*2+1];
              if(!Number.isFinite(u)||!Number.isFinite(v)||u<expected[0]-1e-6||v<expected[1]-1e-6||u>expected[2]+1e-6||v>expected[3]+1e-6)outside++;
              min[0]=Math.min(min[0],u);min[1]=Math.min(min[1],v);max[0]=Math.max(max[0],u);max[1]=Math.max(max[1],v);
            }
            const measured={node:node.name,material:material.name,region:regionKey,origin:'glTF top-left image coordinates',expected,bounds:[...min,...max],vertices:uv.count,outside};
            report.uvPrimitives.push(measured);
            Check(outside===0,`${node.name} actual GameUV values stay within the delivered atlas`,measured);
          }
        }
        const indices=primitive.indices!==undefined?Array.from(ReadAccessorInt(glb,primitive.indices).data):Array.from({length:positions.count},(_,index)=>index);
        Check(indices.length%3===0&&indices.every(value=>Number.isInteger(value)&&value>=0&&value<positions.count),`${node.name} triangle indices are in range`);
        if(primitiveUv)for(let corner=0;corner<indices.length;corner+=3){uvTriangles.push(indices.slice(corner,corner+3).map(index=>[primitiveUv.data[index*2],primitiveUv.data[index*2+1]]));uvOwners.push(node.name);}
        report.totalTriangles+=indices.length/3;
        const triangles=[];for(let corner=0;corner<indices.length;corner+=3)triangles.push(indices.slice(corner,corner+3).map(index=>points[index]));
        allTriangles.push(...triangles);
        if(part){part.points.push(...points);part.triangles.push(...triangles);if(primitive.material!==undefined)part.materials.push(primitive.material);}
        Check(primitive.material!==undefined,`${node.name} has an assigned material`);
        if(primitive.material!==undefined)usedMaterials.add(primitive.material);
      }
    }
    for(const child of node.children??[]){parent.set(child,index);Walk(child,next,owner);}
  }
  for(const root of roots)Walk(root,identity);
  const resolution=256,coverage=new Uint8Array(resolution*resolution),coverageOwner=new Int32Array(resolution*resolution);coverageOwner.fill(-1);const overlapExamples=[];
  let overlappingSamples=0,degenerateUvs=0,uvArea=0;
  for(const [triangleId,[a,b,c]] of uvTriangles.entries()){
    const determinant=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    if(Math.abs(determinant)<1e-14){degenerateUvs++;continue;}uvArea+=Math.abs(determinant)/2;
    const minX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0])*resolution)),maxX=Math.min(resolution-1,Math.ceil(Math.max(a[0],b[0],c[0])*resolution));
    const minY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1])*resolution)),maxY=Math.min(resolution-1,Math.ceil(Math.max(a[1],b[1],c[1])*resolution));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const px=(x+.5)/resolution-a[0],py=(y+.5)/resolution-a[1];
      const u=(px*(c[1]-a[1])-py*(c[0]-a[0]))/determinant,v=((b[0]-a[0])*py-(b[1]-a[1])*px)/determinant;
      if(u>1e-7&&v>1e-7&&u+v<1-1e-7){const index=y*resolution+x;if(coverage[index]){overlappingSamples++;if(overlapExamples.length<8)overlapExamples.push({uv:[(x+.5)/resolution,(y+.5)/resolution],owners:[uvOwners[coverageOwner[index]],uvOwners[triangleId]],first:uvTriangles[coverageOwner[index]],second:[a,b,c]});}coverage[index]=1;coverageOwner[index]=triangleId;}
    }
  }
  report.surfaceUv={area:uvArea,rasterResolution:resolution,coveredSamples:coverage.reduce((sum,value)=>sum+value,0),overlappingSamples,degenerateUvs,overlapExamples};
  Check(degenerateUvs===0,'Every production triangle has non-degenerate surface UV area',report.surfaceUv);
  Check(overlappingSamples===0&&uvArea<=1.001,'All five components have genuinely non-overlapping production UV islands',report.surfaceUv);
  Check(report.surfaceUv.coveredSamples>resolution*resolution*.25,'The 1024 atlas has meaningful surface coverage',report.surfaceUv);
  const normalPixels=await sharp(externalMaps.get('Normal').data).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let normalMinBlue=255;for(let pixel=2;pixel<normalPixels.data.length;pixel+=3)normalMinBlue=Math.min(normalMinBlue,normalPixels.data[pixel]);
  Check(normalMinBlue>=128,'Every decoded normal-map pixel stays in the outward hemisphere, including edge padding',{pixels:normalPixels.info.width*normalPixels.info.height,minBlue:normalMinBlue});
  let invalidNormalSamples=0,blackAlbedoSamples=0;const blackAlbedoLocations=[];
  const basePixels=await sharp(externalMaps.get('Base').data).removeAlpha().raw().toBuffer({resolveWithObject:true});
  for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++)if(coverage[y*resolution+x]){
    const offset=((y*4+2)*1024+x*4+2)*3;
    if(normalPixels.data[offset+2]<120)invalidNormalSamples++;
    if(basePixels.data[offset]+basePixels.data[offset+1]+basePixels.data[offset+2]<4){blackAlbedoSamples++;blackAlbedoLocations.push([x*4+2,y*4+2]);}
  }
  Check(invalidNormalSamples===0,'Sampled surface normal texels point into the outward hemisphere',{invalidNormalSamples});
  Check(blackAlbedoSamples===0,'Production UVs do not sample unbaked black albedo holes',{blackAlbedoSamples,blackAlbedoLocations});
  for(const name of names.slice(1)){
    const id=nodeIds[name][0];let cursor=id;const ancestors=[];while(parent.has(cursor)){cursor=parent.get(cursor);ancestors.push(cursor);}
    Check(id!==undefined&&reachable.has(id)&&ancestors.includes(rootId),`${name} is below Pack_Root`);
    Check(!names.slice(1).some(other=>other!==name&&ancestors.includes(nodeIds[other][0])),`${name} is independent of the other four named parts`);
    const part=report.parts[name];Check((part?.triangles.length??0)>0,`${name} contains real triangle geometry`);
    if(part){part.bounds=Bounds(part.points);part.triangleCount=part.triangles.length;part.materials=[...new Set(part.materials)];}
  }
  Check(report.totalTriangles>0&&report.totalTriangles<=3000,'All five parts combined are at most 3000 triangles (including hidden candidates)',report.totalTriangles);
  const jacketPart=report.parts.Pack_Jacket;
  if(jacketPart){
    let jacketArea=0;
    for(const [a,b,c] of jacketPart.triangles){
      const ab=b.map((value,index)=>value-a[index]),ac=c.map((value,index)=>value-a[index]);
      jacketArea+=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])/2;
    }
    jacketPart.surfaceAreaM2=jacketArea;
    Check(jacketArea>=.65&&jacketArea<=1.25,'The folded civilian jacket retains full-size cloth area rather than a miniature flat silhouette',jacketArea);
  }
  const bindingBox=report.parts.Pack_Binding?.bounds;
  Check(!!bindingBox&&bindingBox.max[1]<=.158,'The main cloth binding has no floating fin above the blanket top (the separate mat loops are excluded)',bindingBox);
  const bundle=report.parts.Pack_Bundle,box=bundle?.bounds;
  if(box){
    Check(Near(box.size,[.38,.30,.13],.002),'Bundle actual X/Y/Z bounds are 0.38 / 0.30 / 0.13 m (2 mm tolerance)',box);
    Check(Math.abs(box.center[0])<=.001&&Math.abs(box.center[1])<=.001&&Math.abs(box.min[2])<=.001,'Root is centered on the actual back plane (1 mm tolerance)',{center:box.center,backZ:box.min[2]});
    let backArea=0,degenerate=0;const flatContactPoints=[];
    for(const [a,b,c] of bundle.triangles){
      const ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
      const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
      if(Math.hypot(...cross)<1e-12)degenerate++;
      if([a,b,c].every(point=>Math.abs(point[2])<=.001)&&cross[2]<0)backArea+=-cross[2]/2;
      if([a,b,c].every(point=>Math.abs(point[2])<=1e-6)&&cross[2]<0)flatContactPoints.push(a,b,c);
    }
    report.backPlane={areaM2:backArea,requiredM2:.38*.30*.55,degenerateBundleTriangles:degenerate};
    Check(backArea>=.38*.30*.55,'At least 55% of nominal back area is real flat z=0 surface facing -Z',report.backPlane);
    Check(degenerate===0,'Bundle has no zero-area triangles',degenerate);
    const contactBounds=Bounds(flatContactPoints);report.backPlane.actualBounds=contactBounds;
    Check(!!contactBounds&&Math.abs(contactBounds.center[0])<=.001&&Math.abs(contactBounds.center[1])<=.001,'The pivot is also centered on the actual flat contact leaf, within 1 mm',contactBounds);
  }
  const mat=report.parts.Pack_StrawMat;
  if(bundle&&mat?.bounds){
    const [sampleX,,sampleZ]=mat.bounds.center;
    function HeightsAt(triangles){
      const heights=[];
      for(const [a,b,c] of triangles){
        const bx=b[0]-a[0],bz=b[2]-a[2],cx=c[0]-a[0],cz=c[2]-a[2],det=bx*cz-bz*cx;
        if(Math.abs(det)<1e-12)continue;
        const px=sampleX-a[0],pz=sampleZ-a[2],u=(px*cz-pz*cx)/det,v=(bx*pz-bz*px)/det;
        if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)heights.push(a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]));
      }
      return heights;
    }
    const clothHeights=HeightsAt(bundle.triangles),matHeights=HeightsAt(mat.triangles);
    const clothTop=Math.max(...clothHeights),matBottom=Math.min(...matHeights),clearance=matBottom-clothTop;
    report.matContact={sampleXZ:[sampleX,sampleZ],clothTopY:clothTop,matBottomY:matBottom,clearanceM:clearance};
    Check(Number.isFinite(clearance)&&clearance>=-.0015&&clearance<=.0035,'The rolled mat is supported by the top fold, with at most 3.5 mm of textile clearance',report.matContact);
  }
  const neededImages=new Set(),imageChannels=new Map();
  function SourceOfTexture(index){const texture=g.textures?.[index];return texture?.extensions?.EXT_texture_webp?.source??texture?.source;}
  for(const id of usedMaterials){
    const material=g.materials[id],pbr=material.pbrMetallicRoughness??{};
    const slots={base:pbr.baseColorTexture?.index,normal:material.normalTexture?.index,orm:pbr.metallicRoughnessTexture?.index,ao:material.occlusionTexture?.index};
    const slotInfo={base:pbr.baseColorTexture,normal:material.normalTexture,orm:pbr.metallicRoughnessTexture,ao:material.occlusionTexture};
    report.materials.push({id,name:material.name,slots,metallicFactor:pbr.metallicFactor??1,roughnessFactor:pbr.roughnessFactor??1});
    for(const [slot,index] of Object.entries(slots)){Check(index!==undefined,`${material.name??id} has ${slot} texture`);if(index!==undefined){const source=SourceOfTexture(index);Check(source!==undefined,`${material.name??id} ${slot} source image exists`);if(source!==undefined)neededImages.add(source);}}
    for(const [slot,info] of Object.entries(slotInfo)){
      Check(!!info&&(info.texCoord??0)===runtimeTexCoord&&!info.extensions?.KHR_texture_transform,`${material.name??id} ${slot} actually samples the audited GameUV without a transform`);
      if(info){const source=SourceOfTexture(info.index),channel={base:'Base',normal:'Normal',orm:'Orm',ao:'Orm'}[slot];if(source!==undefined){if(!imageChannels.has(source))imageChannels.set(source,new Set());imageChannels.get(source).add(channel);}}
    }
    Check(slots.orm!==undefined&&SourceOfTexture(slots.orm)===SourceOfTexture(slots.ao),`${material.name??id} AO and metallic-roughness use one ORM image`);
  }
  for(const id of neededImages){
    const image=g.images[id];let bytes;
    if(image.bufferView!==undefined){const view=g.bufferViews[image.bufferView];bytes=glb.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);}
    else if(image.uri?.startsWith('data:')){const comma=image.uri.indexOf(',');bytes=Buffer.from(image.uri.slice(comma+1),image.uri.slice(0,comma).includes(';base64')?'base64':'utf8');}
    else if(image.uri&&!/^[a-z]+:/i.test(image.uri)){bytes=fs.readFileSync(path.resolve(path.dirname(modelFile),decodeURIComponent(image.uri)));}
    else throw Error(`Image ${id} has no locally readable payload`);
    const size=ImageSize(bytes),sha256=Hash(bytes),channels=[...(imageChannels.get(id)??[])];
    report.images.push({id,name:image.name,mimeType:image.mimeType,...size,bytes:bytes.length,sha256,channels});
    Check(size.width===1024&&size.height===1024,`Material image ${image.name??id} is exactly 1024 square`,size);
    Check(channels.length===1,`Image ${image.name??id} is not reused across incompatible PBR channel semantics`,channels);
    for(const channel of channels){const external=externalMaps.get(channel);Check(!!external&&sha256===external.sha256&&bytes.equals(external.data),`Entire embedded ${channel} image equals its delivered external WebP byte for byte`,{embedded:sha256,external:external?.sha256});}
    if(channels.includes('Orm'))Check(sha256===orm.sha256,'Embedded ORM is the same independently decoded all-nonmetal map',sha256);
  }
  report.bounds=Bounds(allTriangles.flat());
  // Keep audit JSON compact and independent of source geometry duplication.
  for(const part of Object.values(report.parts)){delete part.points;delete part.triangles;}
}catch(error){Check(false,'Audit completed without parsing/runtime errors',error.message);}
report.passed=report.checks.every(check=>check.ok);
report.failed=report.checks.filter(check=>!check.ok).length;
fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,'Data_Validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,failed:report.failed,totalTriangles:report.totalTriangles,report:path.join(outDir,'Data_Validation.json')}));
process.exitCode=report.passed?0:1;
