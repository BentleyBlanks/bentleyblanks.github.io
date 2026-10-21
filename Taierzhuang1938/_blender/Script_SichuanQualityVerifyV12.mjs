// Independent QualityV12 GLB/PBR audit. Built-in Node modules only.
// node <this.mjs> <model.glb> [--bake=Data_QualityPbrBakeV12.json]
//   [--native=Data_QualityNativeV12.json] [--out=report.json]
// --probe explicitly permits the bake report's partial subset/resolution;
// a probe pass is never labelled a complete Quality delivery.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';

const folder=fileURLToPath(new URL('../../tmp/SichuanBlanketPack/QualityV12/',import.meta.url)),args=process.argv.slice(2);
const option=name=>args.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
if(args.includes('--help')){console.log('node Script_VerifyQualityGlbV12.mjs model.glb [--bake=file.json] [--native=file.json] [--out=file.json] [--probe]');process.exit(0);}
const model=path.resolve(args.find(a=>!a.startsWith('--'))??path.join(folder,'PbrFinal/Model_SichuanQualityPbrV12.glb'));
const bakeFile=path.resolve(option('bake')??path.join(path.dirname(model),'Data_QualityPbrBakeV12.json'));
const nativeFile=path.resolve(option('native')??path.join(folder,'Data_QualityNativeV12.json'));
const output=path.resolve(option('out')??path.join(folder,'Data_QualityGlbValidationV12.json'));
const probe=args.includes('--probe'),parts=['Pack_Bundle','Pack_Binding','Pack_Jacket','Pack_StrawMat','Pack_Sandals'];
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const report={model,bakeFile,nativeFile,probe,triangleBudget:null,checks:[],parts:{},images:[],objects:[],limitations:[
  'Structural hide/withdrawal proof is mathematical; browser controls and rendered fidelity require visual review.',
  'Unreduced geometry is checked by exact native and per-object triangle counts plus saved-source/hash provenance; no binary identity claim across glTF vertex splitting.',
  'No pixel-per-triangle, 3000-triangle, or legacy one-atlas gate is used.'
]};
const hash=data=>createHash('sha256').update(data).digest('hex');
const near=(a,b,epsilon=1e-6)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=epsilon);
function check(ok,label,detail){report.checks.push({ok:!!ok,label,...(detail===undefined?{}:{detail})});if(!ok)console.error('FAIL',label,detail??'');return !!ok;}
function require(ok,label,detail){if(!check(ok,label,detail))throw Error(label);}
function mul(a,b){const r=Array(16).fill(0);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[c*4+row]+=a[k*4+row]*b[c*4+k];return r;}
function matrix(n){
  if(n.matrix)return n.matrix;
  const [x,y,z,w]=n.rotation??[0,0,0,1],[a,b,c]=n.scale??[1,1,1],[tx,ty,tz]=n.translation??[0,0,0];
  return [(1-2*y*y-2*z*z)*a,(2*x*y+2*w*z)*a,(2*x*z-2*w*y)*a,0,(2*x*y-2*w*z)*b,(1-2*x*x-2*z*z)*b,(2*y*z+2*w*x)*b,0,(2*x*z+2*w*y)*c,(2*y*z-2*w*x)*c,(1-2*x*x-2*y*y)*c,0,tx,ty,tz,1];
}
function transform(m,x,y,z){return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];}
function bounds(){return {min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};}
function include(box,p){for(let i=0;i<3;i++){box.min[i]=Math.min(box.min[i],p[i]);box.max[i]=Math.max(box.max[i],p[i]);}}
function finish(box){return {...box,size:box.max.map((v,i)=>v-box.min[i]),center:box.max.map((v,i)=>(v+box.min[i])/2)};}
function evidence(entry,label){
  require(entry&&typeof entry.path==='string'&&fs.existsSync(entry.path),`${label} exists`,entry?.path);
  const data=fs.readFileSync(entry.path),actual={bytes:data.length,sha256:hash(data)};
  require(actual.bytes===entry.bytes&&actual.sha256===entry.sha256,`${label} bytes and SHA-256 match`,actual);return data;
}
function png(data){
  if(!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Expected an actual PNG payload');
  const width=data.readUInt32BE(16),height=data.readUInt32BE(20),depth=data[24],type=data[25];
  if(![8,16].includes(depth)||type!==6||data[26]||data[27]||data[28])throw Error('Expected non-interlaced 8/16-bit RGBA PNG');
  const chunks=[];let position=8,end=false;
  while(position+12<=data.length){const size=data.readUInt32BE(position),kind=data.toString('ascii',position+4,position+8);if(position+12+size>data.length)throw Error('Truncated PNG chunk');if(kind==='IDAT')chunks.push(data.subarray(position+8,position+8+size));position+=size+12;if(kind==='IEND'){end=true;break;}}
  if(!end||!chunks.length)throw Error('PNG lacks image data or end chunk');
  const bytes=depth/8,bpp=4*bytes,stride=width*bpp,raw=inflateSync(Buffer.concat(chunks));
  if(raw.length!==(stride+1)*height)throw Error('PNG decoded scanline size mismatch');
  let previous=Buffer.alloc(stride),current=Buffer.alloc(stride),offset=0,covered=0,nonBlackCovered=0;
  const min=Array(4).fill(Infinity),max=Array(4).fill(-Infinity),sum=Array(4).fill(0),coveredMin=Array(3).fill(Infinity),coveredMax=Array(3).fill(-Infinity),limit=depth===8?255:65535;
  const paeth=(a,b,c)=>{const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c;};
  for(let row=0;row<height;row++){
    const filter=raw[offset++];if(filter>4)throw Error('Invalid PNG scanline filter');
    for(let i=0;i<stride;i++){const a=i>=bpp?current[i-bpp]:0,b=previous[i],c=i>=bpp?previous[i-bpp]:0;current[i]=(raw[offset++]+(filter===0?0:filter===1?a:filter===2?b:filter===3?((a+b)>>>1):paeth(a,b,c)))&255;}
    for(let x=0;x<width;x++){
      const values=Array(4);for(let c=0;c<4;c++){const at=x*bpp+c*bytes,value=bytes===1?current[at]:current[at]*256+current[at+1];values[c]=value;min[c]=Math.min(min[c],value);max[c]=Math.max(max[c],value);sum[c]+=value;}
      if(values[3]>0){covered++;if(values[0]+values[1]+values[2]>0)nonBlackCovered++;for(let c=0;c<3;c++){coveredMin[c]=Math.min(coveredMin[c],values[c]);coveredMax[c]=Math.max(coveredMax[c],values[c]);}}
    }
    [previous,current]=[current,previous];
  }
  return {width,height,bitDepth:depth,channels:4,pixels:width*height,alphaMarkedPixels:covered,nonBlackAlphaMarkedPixels:nonBlackCovered,
    minimum:min.map(v=>v/limit),maximum:max.map(v=>v/limit),mean:sum.map(v=>v/(limit*width*height)),
    alphaMarkedRgbRange:[coveredMin.map(v=>v/limit),coveredMax.map(v=>v/limit)]};
}

try{
  const native=JSON.parse(fs.readFileSync(nativeFile,'utf8')),bake=JSON.parse(fs.readFileSync(bakeFile,'utf8'));
  require(bake.generator==='SichuanQualityPbrV12','Actual complete-PBR exporter report is supplied');
  const selected=probe?bake.partSubset:parts,resolution=probe?bake.resolutionPerPart?.[0]:4096;
  require(Array.isArray(selected)&&selected.length>0&&selected.every(p=>parts.includes(p)),'Requested Quality components are valid');
  require(probe||bake.partialProbe===false,'Final delivery is a complete five-part export');
  require(near(bake.resolutionPerPart??[],[resolution,resolution],0),'Bake resolution matches requested per-part maps',bake.resolutionPerPart);
  require(native.noDecimation===true&&native.triangleBudget===null,'Native Quality inventory explicitly has no reduction budget');
  require(bake.savedSourceFileUnchanged===true&&bake.nativeSceneSavedOrRewritten===false,'Exporter retained the native saved source');
  evidence(bake.sourceBlend,'Native source Blend');
  const buffer=fs.readFileSync(model);report.sha256=hash(buffer);report.bytes=buffer.length;
  require(bake.glb?.sha256===report.sha256&&bake.glb?.bytes===buffer.length,'Actual GLB matches final exporter evidence');
  require(buffer.toString('ascii',0,4)==='glTF'&&buffer.readUInt32LE(4)===2&&buffer.readUInt32LE(8)===buffer.length,'Actual GLB 2 header and total length are valid');
  let document,binary,at=12;
  while(at<buffer.length){const length=buffer.readUInt32LE(at),type=buffer.readUInt32LE(at+4);at+=8;require(at+length<=buffer.length,'GLB chunk stays within the file');if(type===0x4e4f534a)document=JSON.parse(buffer.toString('utf8',at,at+length).replace(/[\0 ]+$/,''));if(type===0x004e4942)binary=buffer.subarray(at,at+length);at+=length;}
  const g=document;require(g?.asset?.version==='2.0'&&binary,'GLB JSON and binary geometry are present');
  require(!g.extensionsRequired?.some(e=>['KHR_draco_mesh_compression','EXT_meshopt_compression'].includes(e)),'Geometry is available for independent binary inspection');
  const accessor=id=>{
    const a=g.accessors?.[id],v=g.bufferViews?.[a?.bufferView];if(!a||!v||a.sparse||v.buffer!==0)throw Error(`Unsupported or missing accessor ${id}`);
    const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},size=sizes[a.componentType],n=components[a.type];
    if(!size||!n)throw Error(`Unsupported accessor format ${id}`);
    const offset=(v.byteOffset??0)+(a.byteOffset??0),stride=v.byteStride??size*n;
    if(a.count&&(offset+(a.count-1)*stride+size*n>binary.length||stride<size*n))throw Error(`Accessor ${id} exceeds BIN`);
    const readers={5120:'readInt8',5121:'readUInt8',5122:'readInt16LE',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'},limits={5120:127,5121:255,5122:32767,5123:65535,5125:4294967295};
    return {count:a.count,components:n,get(i,c=0){let value=binary[readers[a.componentType]](offset+i*stride+c*size);return a.normalized?Math.max(-1,value/limits[a.componentType]):value;}};
  };
  require(g.scenes?.length===1,'One complete delivery scene');const roots=g.scenes[g.scene??0].nodes;
  require(roots.length===1&&g.nodes[roots[0]].name==='Pack_Root','One independent Pack_Root');
  require(near(matrix(g.nodes[roots[0]]),identity),'Pack_Root has the identity back-centre pivot');
  const partIds=Object.fromEntries(parts.map(p=>[p,g.nodes.flatMap((n,i)=>n.name===p?[i]:[])]));
  for(const p of selected)require(partIds[p].length===1&&g.nodes[roots[0]].children?.includes(partIds[p][0]),`${p} is a unique direct independent root child`);
  const expectedObjects=new Map(bake.objects.map(o=>[o.object,o])),seen=new Set(),usedMeshes=new Set(),usedMaterials=new Set(),imageUses=new Map();
  for(const p of parts)report.parts[p]={triangles:0,meshNodes:[],bounds:bounds(),flatBackAreaM2:0,zeroAreaTriangles:0,zeroUvTriangles:0};
  function imageUse(info,part,channel){
    if(!info||info.texCoord&&info.texCoord!==0||info.extensions?.KHR_texture_transform)throw Error(`${part} ${channel} does not directly use QualityUV/TEXCOORD_0`);
    const texture=g.textures?.[info.index],id=texture?.source,image=g.images?.[id],view=g.bufferViews?.[image?.bufferView];
    if(id===undefined||!view||view.buffer!==0)throw Error(`${part} ${channel} is not an embedded image`);
    const key=`${part}:${channel}`,old=imageUses.get(key);if(old!==undefined&&old!==id)throw Error(`${part} unexpectedly uses multiple ${channel} atlases`);imageUses.set(key,id);return id;
  }
  function walk(id,parentMatrix,owner){
    if(seen.has(id))throw Error('GLB contains repeated or cyclic node ancestry');seen.add(id);
    const n=g.nodes[id],world=mul(parentMatrix,matrix(n));if(parts.includes(n.name))owner=n.name;
    if(n.mesh!==undefined){
      require(selected.includes(owner),'All actual geometry belongs to a selected independent component',n.name);usedMeshes.add(n.mesh);
      const part=report.parts[owner];part.meshNodes.push(n.name);let triangles=0,badNormals=0,badTangents=0,nonfinite=0,uvOutside=0,minimumArea=Infinity,explicitTangentPrimitives=0,derivedTangentPrimitives=0;
      for(const primitive of g.meshes[n.mesh].primitives){
        const attrs=primitive.attributes;require((primitive.mode??4)===4&&['POSITION','NORMAL','TEXCOORD_0'].every(k=>attrs[k]!==undefined),`${n.name} has native triangles, normals and QualityUV`);
        const positions=accessor(attrs.POSITION),normals=accessor(attrs.NORMAL),tangents=attrs.TANGENT===undefined?null:accessor(attrs.TANGENT),uv=accessor(attrs.TEXCOORD_0),indices=primitive.indices===undefined?null:accessor(primitive.indices),count=indices?.count??positions.count;
        if(tangents)explicitTangentPrimitives++;else derivedTangentPrimitives++;
        require(count%3===0&&positions.components===3&&normals.count===positions.count&&(!tangents||tangents.count===positions.count)&&uv.count===positions.count,`${n.name} vertex/index streams agree`);
        const points=new Float64Array(positions.count*3);
        for(let i=0;i<positions.count;i++){
          const p=transform(world,positions.get(i,0),positions.get(i,1),positions.get(i,2));points.set(p,i*3);include(part.bounds,p);
          let n2=0,t2=0,dot=0;for(let c=0;c<3;c++){const a=normals.get(i,c),b=tangents?.get(i,c)??0;if(!Number.isFinite(p[c])||!Number.isFinite(a)||!Number.isFinite(b))nonfinite++;n2+=a*a;t2+=b*b;dot+=a*b;}
          if(Math.abs(n2-1)>.02)badNormals++;if(tangents&&(Math.abs(t2-1)>.02||Math.abs(dot)>.03||Math.abs(Math.abs(tangents.get(i,3))-1)>1e-5))badTangents++;
          for(let c=0;c<2;c++){const value=uv.get(i,c);if(!Number.isFinite(value))nonfinite++;if(value<-1e-5||value>1.00001)uvOutside++;}
        }
        const getIndex=i=>indices?indices.get(i):i;
        for(let i=0;i<count;i+=3){
          const ids=[getIndex(i),getIndex(i+1),getIndex(i+2)];if(ids.some(v=>!Number.isInteger(v)||v<0||v>=positions.count))throw Error(`${n.name} has an invalid vertex index`);
          const a=ids[0]*3,b=ids[1]*3,c=ids[2]*3,ab=[0,1,2].map(k=>points[b+k]-points[a+k]),ac=[0,1,2].map(k=>points[c+k]-points[a+k]);
          const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],area=Math.hypot(...cross)/2;minimumArea=Math.min(minimumArea,area);if(area<1e-16)part.zeroAreaTriangles++;
          const u0=uv.get(ids[0],0),v0=uv.get(ids[0],1),u1=uv.get(ids[1],0),v1=uv.get(ids[1],1),u2=uv.get(ids[2],0),v2=uv.get(ids[2],1);
          if(Math.abs((u1-u0)*(v2-v0)-(v1-v0)*(u2-u0))<1e-20)part.zeroUvTriangles++;
          if(owner==='Pack_Bundle'&&ids.every(v=>Math.abs(points[v*3+2])<=2e-5)&&cross[2]<0)part.flatBackAreaM2+=-cross[2]/2;
        }
        triangles+=count/3;
        const material=g.materials?.[primitive.material],pbr=material?.pbrMetallicRoughness;require(pbr,`${n.name} has a real standard PBR material`);usedMaterials.add(primitive.material);
        imageUse(pbr.baseColorTexture,owner,'Base');imageUse(material.normalTexture,owner,'Normal');const orm=imageUse(pbr.metallicRoughnessTexture,owner,'Orm'),ao=imageUse(material.occlusionTexture,owner,'Orm');require(orm===ao,`${n.name} shares ORM between roughness/metallic and AO`);
        check((pbr.roughnessFactor??1)===1&&(pbr.metallicFactor??1)>=0&&(pbr.metallicFactor??1)<=1,`${n.name} keeps valid untampered PBR factors`);
      }
      require(!nonfinite&&!badNormals&&!badTangents&&!uvOutside,`${n.name} actual binary attributes are finite and valid`,{nonfinite,badNormals,badTangents,uvOutside});
      const expected=expectedObjects.get(n.name);require(expected&&expected.part===owner&&expected.triangles===triangles,`${n.name} retains exact evaluated native triangle count`,{actual:triangles,expected:expected?.triangles});
      require(JSON.stringify(expected.sourceGeometryAndUvs)===JSON.stringify(expected.sourceGeometryAndUvsAfterBake),`${n.name} source geometry and UV hashes stayed unchanged`);
      part.triangles+=triangles;report.objects.push({name:n.name,part:owner,triangles,minimumTriangleAreaM2:minimumArea,explicitTangentPrimitives,derivedTangentPrimitives,
        tangentPolicy:derivedTangentPrimitives?'glTF permits runtime tangent derivation from non-degenerate POSITION/NORMAL/TEXCOORD_0; inspect the actual renderer for seam fidelity':'Explicit tangent basis checked for unit length, normal orthogonality and handedness'});
    }
    for(const child of n.children??[])walk(child,world,owner);
  }
  walk(roots[0],identity,null);
  require(!g.nodes.some((n,i)=>n.mesh!==undefined&&!seen.has(i))&&usedMeshes.size===g.meshes.length,'Every delivered mesh resource is included in actual counts');
  require(report.objects.length===bake.objects.length,'All recorded native objects are present exactly once');
  for(const p of selected){
    const part=report.parts[p];part.bounds=finish(part.bounds);require(part.triangles===native.parts[p].triangles&&part.triangles===bake.actualGlb.byPart[p],`${p} keeps full native geometry without reduction`,{actual:part.triangles,native:native.parts[p].triangles});
    check(!part.zeroAreaTriangles&&!part.zeroUvTriangles,`${p} has no zero-area geometry or exact zero-area active UV triangles`,{geometry:part.zeroAreaTriangles,uv:part.zeroUvTriangles});
    part.hideScope={removedTriangles:part.triangles,otherPartTrianglesUnaffected:true,method:'Every mesh has exactly this direct-root owner; removing this subtree removes only these descendants'};
  }
  if(!probe){
    const b=report.parts.Pack_Bundle;check(near(b.bounds.size,[.38,.30,.13],.015),'Actual meter-scale bounds establish glTF Y-up orientation',b.bounds);
    check(Math.abs(b.bounds.center[0])<.005&&Math.abs(b.bounds.center[1])<.005&&b.bounds.min[2]>=-.001,'Back-centre pivot and rear contact are preserved',b.bounds);
    check(b.flatBackAreaM2>=.38*.30*.55,'A substantial real contact surface is flat at glTF Z=0 facing -Z',b.flatBackAreaM2);
    const j=report.parts.Pack_Jacket,delta=[0,.36,.30];report.jacketWithdrawal={translationM:delta,allOwnedMeshNodes:j.meshNodes,triangles:j.triangles,oldBounds:j.bounds,newBounds:{min:j.bounds.min.map((v,i)=>v+delta[i]),max:j.bounds.max.map((v,i)=>v+delta[i])},sizeUnchanged:true,method:'One rigid translation on the independent Pack_Jacket root applies to every complete garment/button descendant'};
  }
  for(const p of selected)for(const channel of ['Base','Normal','Orm']){
    const id=imageUses.get(`${p}:${channel}`),image=g.images[id],view=g.bufferViews[image.bufferView],data=binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength),entry=bake.atlases?.[p]?.images?.[channel];
    require(entry,`${p} ${channel} has independent bake evidence`);const sha256=hash(data);require(sha256===entry.sha256&&data.length===entry.bytes,`${p} ${channel} embedded bytes match the actual bake`);
    const external=evidence(entry,`${p} ${channel} external map`);require(external.equals(data),`${p} ${channel} whole external and embedded PNGs are identical`);
    const facts=png(data);require(facts.width===resolution&&facts.height===resolution,`${p} ${channel} decodes at the actual requested resolution`,[facts.width,facts.height]);
    check(entry.colourSpace===(channel==='Base'?'sRGB':'Non-Color'),`${p} ${channel} bake has the right colour-space semantic`,entry.colourSpace);
    check(facts.alphaMarkedPixels>0&&facts.nonBlackAlphaMarkedPixels>0,`${p} ${channel} actually contains nonblack baked surface pixels`);
    if(channel==='Base')check(Math.max(...facts.maximum.slice(0,3))>.005&&facts.maximum.slice(0,3).some((v,i)=>v-facts.minimum[i]>.001),`${p} Base has actual surface colour variation`);
    if(channel==='Normal')check(facts.maximum[2]>.5,`${p} Normal contains tangent-space normal data`);
    if(channel==='Orm')check(facts.minimum[2]===0&&facts.maximum[2]===0&&facts.maximum[1]>.7,`${p} ORM is entirely nonmetal and contains dry roughness`,{metallicRange:[facts.minimum[2],facts.maximum[2]],roughnessRange:[facts.minimum[1],facts.maximum[1]]});
    report.images.push({part:p,channel,image:id,name:image.name,bytes:data.length,sha256,...facts});
  }
  report.totalTriangles=selected.reduce((n,p)=>n+report.parts[p].triangles,0);report.expectedNativeTriangles=selected.reduce((n,p)=>n+native.parts[p].triangles,0);
  check(report.totalTriangles===report.expectedNativeTriangles,'Actual total equals the unreduced native inventory',{actual:report.totalTriangles,native:report.expectedNativeTriangles});
  report.upAxis='+Y';report.units='metres, independently checked from physical bounds';report.textureResolutionPerPart=resolution;report.noDecimationEvidence='Exact five-part and per-object native triangle counts; source geometry+UV hashes unchanged';
}catch(error){check(false,'Independent audit completed without parsing/runtime errors',error.stack??String(error));}
report.passed=report.checks.every(c=>c.ok);report.finalDeliveryStructurallyVerified=report.passed&&!probe;report.failed=report.checks.filter(c=>!c.ok).length;
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,probe,finalDeliveryStructurallyVerified:report.finalDeliveryStructurallyVerified,checks:report.checks.length,failed:report.failed,totalTriangles:report.totalTriangles,report:output}));
process.exitCode=report.passed?0:1;
