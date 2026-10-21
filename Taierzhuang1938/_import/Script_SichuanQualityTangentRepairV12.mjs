// Post-export tangent-only validation/repair. No Blender or texture operations.
// Read-only: node <this> Raw.glb --scan
// New sibling only: node <this> Raw.glb --output=Checked.glb --report=Repair.json
// The source GLB and bake report are never modified. Future rebuilds must run
// this same post-process after export and retain its original/new evidence.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const args=process.argv.slice(2),option=name=>args.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const input=args.find(value=>!value.startsWith('--'));
if(!input||args.includes('--help')){console.log('node Script_SichuanQualityTangentRepairV12.mjs Raw.glb --scan | --output=Checked.glb --report=Repair.json');process.exit(input?0:1);}
const source=path.resolve(input),output=option('output')?path.resolve(option('output')):null,reportFile=option('report')?path.resolve(option('report')):null;
const plan=args.includes('--plan'),scanTriangles=args.includes('--triangles');
const require=(ok,message)=>{if(!ok)throw Error(message);};
require(args.includes('--scan')||output,'Pass --scan for read-only diagnosis or an explicit different --output');
require(!output||output.toLowerCase()!==source.toLowerCase(),'The original raw GLB must remain untouched');
require(!output||!fs.existsSync(output),'Checked output already exists; choose a fresh sibling');
require(!reportFile||!fs.existsSync(reportFile),'Repair report already exists; choose a fresh report');
const shaFile=file=>{const fd=fs.openSync(file,'r'),h=createHash('sha256'),buffer=Buffer.allocUnsafe(4*1024*1024);try{for(let at=0;at<fs.fstatSync(fd).size;){const n=fs.readSync(fd,buffer,0,buffer.length,at);require(n>0,'Unexpected EOF');h.update(buffer.subarray(0,n));at+=n;}}finally{fs.closeSync(fd);}return h.digest('hex');};
const evidence=file=>({path:file,bytes:fs.statSync(file).size,sha256:shaFile(file)});
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a),normalise=a=>{const length=norm(a);return length>1e-20?a.map(value=>value/length):null;};
const f32=value=>Math.fround(value);
function facts(n,t){const n2=dot(n,n),t2=dot(t,t),nt=dot(n,t),w=t[3],finite=[...n,...t].every(Number.isFinite);return {normalLengthSquared:n2,tangentLengthSquared:t2,normalDotTangent:nt,handedness:w,finite,valid:finite&&Math.abs(n2-1)<=.02&&Math.abs(t2-1)<=.02&&Math.abs(nt)<=.03&&Math.abs(Math.abs(w)-1)<=1e-5};}
function openGlb(file){
  const fd=fs.openSync(file,'r'),size=fs.fstatSync(fd).size,header=Buffer.alloc(12);fs.readSync(fd,header,0,12,0);
  require(header.toString('ascii',0,4)==='glTF'&&header.readUInt32LE(4)===2&&header.readUInt32LE(8)===size,'Expected valid GLB 2 header');
  let document,binaryOffset,binaryBytes;
  for(let at=12;at<size;){const chunk=Buffer.alloc(8);fs.readSync(fd,chunk,0,8,at);const bytes=chunk.readUInt32LE(0),type=chunk.toString('ascii',4,8);at+=8;require(at+bytes<=size,'Truncated GLB chunk');if(type==='JSON'){const data=Buffer.allocUnsafe(bytes);fs.readSync(fd,data,0,bytes,at);document=JSON.parse(data.toString('utf8').replace(/[\0 ]+$/,''));}else if(type==='BIN\0'){binaryOffset=at;binaryBytes=bytes;}at+=bytes;}
  require(document&&binaryOffset!==undefined,'GLB has no document or embedded BIN');
  function accessor(id,cache){
    const a=document.accessors[id],v=document.bufferViews[a?.bufferView];require(a&&v&&!a.sparse&&(v.buffer??0)===0,'Unsupported tangent repair accessor '+id);
    const types={5121:['readUInt8',1,255],5123:['readUInt16LE',2,65535],5125:['readUInt32LE',4,4294967295],5126:['readFloatLE',4,1]},count={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
    require(types[a.componentType]&&count[a.type],'Unsupported numeric accessor '+id);const [reader,size,limit]=types[a.componentType],components=count[a.type],stride=v.byteStride??size*components,offset=a.byteOffset??0;
    require(stride>=size*components&&offset+(a.count-1)*stride+size*components<=v.byteLength&&(v.byteOffset??0)+v.byteLength<=binaryBytes,'Accessor exceeds its actual BIN view');
    if(!cache.has(a.bufferView)){const data=Buffer.allocUnsafe(v.byteLength);require(fs.readSync(fd,data,0,data.length,binaryOffset+(v.byteOffset??0))===data.length,'Could not read complete geometry view');cache.set(a.bufferView,data);}
    const data=cache.get(a.bufferView);
    return {id,count:a.count,components,definition:a,view:a.bufferView,stride,offset,fileOffset:binaryOffset+(v.byteOffset??0)+offset,
      get(i,c=0){const value=data[reader](offset+i*stride+c*size);return a.normalized?value/limit:value;},vector(i){return Array.from({length:components},(_,c)=>this.get(i,c));}};
  }
  return {fd,size,document,accessor,close(){fs.closeSync(fd);}};
}
function triangleFallback(primitive,bad,read,cache){
  const a=primitive.attributes,positions=read(a.POSITION,cache),uv=read(a.TEXCOORD_0,cache),indices=primitive.indices===undefined?null:read(primitive.indices,cache),count=indices?.count??positions.count;
  const wanted=new Map(bad.map(value=>[value.vertex,{t:[0,0,0],b:[0,0,0],triangles:0,best:null}]));
  const idx=i=>indices?indices.get(i):i;
  for(let at=0;at<count;at+=3){const ids=[idx(at),idx(at+1),idx(at+2)];if(!ids.some(id=>wanted.has(id)))continue;
    const p=ids.map(id=>positions.vector(id)),q=ids.map(id=>uv.vector(id)),e1=p[1].map((v,c)=>v-p[0][c]),e2=p[2].map((v,c)=>v-p[0][c]),u1=q[1][0]-q[0][0],v1=q[1][1]-q[0][1],u2=q[2][0]-q[0][0],v2=q[2][1]-q[0][1],det=u1*v2-v1*u2,area=norm(cross(e1,e2))*.5;
    if(!Number.isFinite(det)||Math.abs(det)<=1e-20||!Number.isFinite(area)||area<=1e-20)continue;
    const tangent=e1.map((v,c)=>(v*v2-e2[c]*v1)/det),bitangent=e2.map((v,c)=>(v*u1-e1[c]*u2)/det);
    if(![...tangent,...bitangent].every(Number.isFinite))continue;
    for(const id of ids){const entry=wanted.get(id);if(!entry)continue;entry.triangles++;for(let c=0;c<3;c++){entry.t[c]+=tangent[c]*area;entry.b[c]+=bitangent[c]*area;}if(!entry.best||area>entry.best.area)entry.best={triangle:at/3,ids,area,det,t:tangent,b:bitangent};}
  }
  return wanted;
}
function triangleFacts(primitive,read,cache){
  const a=primitive.attributes,p=read(a.POSITION,cache),uv=read(a.TEXCOORD_0,cache),indices=primitive.indices===undefined?null:read(primitive.indices,cache),count=indices?.count??p.count,idx=i=>indices?indices.get(i):i;
  let zeroGeometry=0,zeroUv=0,minimumGeometryArea=Infinity,minimumAbsUvDeterminant=Infinity;const examples=[];
  for(let at=0;at<count;at+=3){const ids=[idx(at),idx(at+1),idx(at+2)],points=ids.map(id=>p.vector(id)),u=ids.map(id=>uv.vector(id)),e1=points[1].map((v,c)=>v-points[0][c]),e2=points[2].map((v,c)=>v-points[0][c]),area=norm(cross(e1,e2))*.5,det=Math.abs((u[1][0]-u[0][0])*(u[2][1]-u[0][1])-(u[1][1]-u[0][1])*(u[2][0]-u[0][0]));
    require(Number.isFinite(area)&&Number.isFinite(det),'Nonfinite actual triangle basis');minimumGeometryArea=Math.min(minimumGeometryArea,area);minimumAbsUvDeterminant=Math.min(minimumAbsUvDeterminant,det);
    if(area<1e-16)zeroGeometry++;if(det<1e-20)zeroUv++;
    if((area<1e-16||det<1e-20)&&examples.length<12)examples.push({triangle:at/3,ids,area,uvDeterminant:det});
  }
  return {triangles:count/3,zeroGeometry,zeroUv,minimumGeometryArea,minimumAbsUvDeterminant,examples,space:'glTF mesh local; current asset nodes have unit scale; root verifier independently checks world-space geometry'};
}
function scan(file,prepareRepair=false){
  const glb=openGlb(file),summaries=[],patches=new Map();let totalVertices=0,totalBad=0,totalBadNormals=0,totalTriangles=0,totalZeroGeometry=0,totalZeroUv=0;
  try{
    const owners=new Map();for(const node of glb.document.nodes??[]){if(node.mesh===undefined)continue;const list=owners.get(node.mesh)??[];list.push(node.name);owners.set(node.mesh,list);}
    for(let mi=0;mi<glb.document.meshes.length;mi++)for(let pi=0;pi<glb.document.meshes[mi].primitives.length;pi++){
      const primitive=glb.document.meshes[mi].primitives[pi],a=primitive.attributes,cache=new Map();
      const triangleStats=scanTriangles?triangleFacts(primitive,glb.accessor,cache):null;
      if(triangleStats){totalTriangles+=triangleStats.triangles;totalZeroGeometry+=triangleStats.zeroGeometry;totalZeroUv+=triangleStats.zeroUv;}
      if(a.TANGENT===undefined){summaries.push({mesh:mi,primitive:pi,objects:owners.get(mi),explicitTangent:false,triangleStats});continue;}
      const normals=glb.accessor(a.NORMAL,cache),tangents=glb.accessor(a.TANGENT,cache);
      require(normals.count===tangents.count&&normals.components===3&&tangents.components===4,'Normal/tangent streams disagree');
      require(tangents.definition.componentType===5126&&!tangents.definition.normalized,'Repair requires actual Float32 TANGENT data');
      let badNormals=0;const bad=[];
      for(let i=0;i<tangents.count;i++){const n=normals.vector(i),t=tangents.vector(i),f=facts(n,t);if(!n.every(Number.isFinite)||Math.abs(f.normalLengthSquared-1)>.02)badNormals++;if(!f.valid)bad.push({vertex:i,normal:n,tangent:t,facts:f,fileOffset:tangents.fileOffset+i*tangents.stride});}
      totalVertices+=tangents.count;totalBad+=bad.length;totalBadNormals+=badNormals;
      const summary={mesh:mi,primitive:pi,objects:owners.get(mi),material:glb.document.materials?.[primitive.material]?.name,normalAccessor:a.NORMAL,tangentAccessor:a.TANGENT,vertices:tangents.count,badNormals,badTangents:bad.length,badVertices:bad,triangleStats};summaries.push(summary);
      if(prepareRepair&&bad.length){
        require(!badNormals,'This tool cannot repair normal data');require(!tangents.definition.min&&!tangents.definition.max,'Tangent min/max metadata would require a separately reviewed document rewrite');
        const incident=triangleFallback(primitive,bad,glb.accessor,cache);
        for(const entry of bad){const n=normalise(entry.normal);require(n,'No valid normal basis for tangent repair');
          const original=entry.tangent.slice(0,3),projection=dot(original,n);let candidate=original.map((value,c)=>value-projection*n[c]),unit=normalise(candidate),method='Gram-Schmidt reorthogonalization of the actual exported tangent';
          const uv=incident.get(entry.vertex);let useUv=false;
          if(!original.every(Number.isFinite)||!unit||norm(candidate)<Math.max(1e-12,norm(original)*1e-8)){
            require(uv?.best,'No nondegenerate actual incident UV triangle can define the tangent');
            const projected=uv.t.map((value,c)=>value-dot(uv.t,n)*n[c]);unit=normalise(projected);
            if(!unit){candidate=uv.best.t.map((value,c)=>value-dot(uv.best.t,n)*n[c]);unit=normalise(candidate);}
            require(unit,'Actual incident UV tangents are parallel to the normal');method='Area-weighted actual incident triangle POSITION/UV basis, orthogonalized to the unchanged NORMAL';useUv=true;
          }
          let handedness=Math.sign(entry.tangent[3]);
          if(!Number.isFinite(entry.tangent[3])||Math.abs(Math.abs(entry.tangent[3])-1)>1e-5||useUv){require(uv?.best,'No actual UV bitangent defines handedness');handedness=dot(cross(n,unit),uv.b)<0?-1:1;}
          const fixed=[...unit.map(f32),handedness],after=facts(entry.normal,fixed);require(after.valid,'Float32 tangent repair does not meet the unchanged production gate');
          const patch={...entry,mesh:mi,primitive:pi,objects:owners.get(mi),tangentAccessor:a.TANGENT,bufferView:tangents.view,newTangent:fixed,after,method,
            incidentUvTriangles:uv?.triangles??0,incidentTriangleExample:uv?.best?{triangle:uv.best.triangle,ids:uv.best.ids,areaM2:uv.best.area,uvDeterminant:uv.best.det}:null};
          const prior=patches.get(entry.fileOffset);require(!prior||prior.newTangent.every((v,c)=>v===fixed[c]),'A shared tangent would require conflicting repairs');patches.set(entry.fileOffset,patch);
        }
      }
    }
    return {totalExplicitTangentVertices:totalVertices,totalBadTangents:totalBad,totalBadNormals,...(scanTriangles?{totalTriangles,totalZeroGeometry,totalZeroUv}:{}),primitives:summaries,patches:[...patches.values()].sort((a,b)=>a.fileOffset-b.fileOffset)};
  }finally{glb.close();}
}
function hashOutside(file,patches){const fd=fs.openSync(file,'r'),size=fs.fstatSync(fd).size,h=createHash('sha256'),buffer=Buffer.allocUnsafe(4*1024*1024);let at=0;const consume=end=>{while(at<end){const bytes=Math.min(buffer.length,end-at);require(fs.readSync(fd,buffer,0,bytes,at)===bytes,'Truncated comparison span');h.update(buffer.subarray(0,bytes));at+=bytes;}};try{for(const patch of patches){consume(patch.fileOffset);at=patch.fileOffset+16;}consume(size);}finally{fs.closeSync(fd);}return h.digest('hex');}

const before=evidence(source),diagnosis=scan(source,!!output||plan);
const result={generator:'SichuanQualityTangentRepairV12',mode:output?'Checked sibling repair':plan?'Read-only mathematical repair plan':'Read-only complete tangent scan',originalExportGlb:before,diagnosis,
  thresholds:{normalLengthSquaredError:.02,tangentLengthSquaredError:.02,normalTangentDot:.03,handednessError:1e-5},geometryOrTextureOperations:false,sourceBlendOrBakeReportModified:false};
if(output){
  require(diagnosis.patches.length>0,'No invalid tangents need repair; do not manufacture a new output');
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.copyFileSync(source,output,fs.constants.COPYFILE_EXCL);
  const fd=fs.openSync(output,'r+');try{for(const patch of diagnosis.patches){const data=Buffer.alloc(16);patch.newTangent.forEach((value,index)=>data.writeFloatLE(value,index*4));require(fs.writeSync(fd,data,0,16,patch.fileOffset)===16,'Could not write the complete tangent patch');}}finally{fs.closeSync(fd);}
  const afterScan=scan(output,false);require(!afterScan.totalBadTangents&&!afterScan.totalBadNormals,'Checked output still has invalid attributes under the unchanged production thresholds');
  const unchangedBefore=hashOutside(source,diagnosis.patches),unchangedAfter=hashOutside(output,diagnosis.patches);require(unchangedBefore===unchangedAfter,'Bytes outside the exact TANGENT patches changed');
  result.checkedGlb=evidence(output);require(result.checkedGlb.bytes===before.bytes,'Tangent-only output changed GLB size');
  require(shaFile(source)===before.sha256,'The immutable original changed during repair');
  result.verification={...afterScan,allTangentsPassUnchangedGate:true,bytesOutsidePatchesSha256Before:unchangedBefore,bytesOutsidePatchesSha256After:unchangedAfter,
    onlyFloat32TangentValuesChanged:true,positionsNormalsUvsIndicesImagesJsonUntouched:true,patches:diagnosis.patches.length,bytesInPatchRanges:diagnosis.patches.length*16};
}
if(reportFile){fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify(result,null,2));
