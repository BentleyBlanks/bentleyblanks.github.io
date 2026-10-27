// Independently re-evaluate enclosure from current GLB triangles, including
// packed/fine-material files whose BIN layout changed after export cleanup.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {LoadGlb,ReadAccessor} from '../_import/Script_LugouGlbPose.mjs';
const Sub=(a,b)=>a.map((v,i)=>v-b[i]),Dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),Cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],Add=(a,b,t=1)=>a.map((v,i)=>v+t*b[i]);
function RayTriangle(origin,direction,[a,b,c]){
 const ab=Sub(b,a),ac=Sub(c,a),h=Cross(direction,ac),det=Dot(ab,h);if(Math.abs(det)<1e-12)return null;
 const s=Sub(origin,a),u=Dot(s,h)/det;if(u< -1e-9||u>1+1e-9)return null;
 const q=Cross(s,ab),v=Dot(direction,q)/det;if(v< -1e-9||u+v>1+1e-9)return null;
 return Dot(ac,q)/det;
}
function ClosestTriangle(p,[a,b,c]){
 const ab=Sub(b,a),ac=Sub(c,a),ap=Sub(p,a),d1=Dot(ab,ap),d2=Dot(ac,ap);if(d1<=0&&d2<=0)return a;
 const bp=Sub(p,b),d3=Dot(ab,bp),d4=Dot(ac,bp);if(d3>=0&&d4<=d3)return b;
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return Add(a,ab,d1/(d1-d3));
 const cp=Sub(p,c),d5=Dot(ab,cp),d6=Dot(ac,cp);if(d6>=0&&d5<=d6)return c;
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return Add(a,ac,d2/(d2-d6));
 const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0)return Add(b,Sub(c,b),(d4-d3)/(d4-d3+d5-d6));
 const denominator=va+vb+vc;assert(Math.abs(denominator)>1e-24,'Collapsed enclosing face');return Add(Add(a,ab,vb/denominator),ac,vc/denominator);
}
const Bounds=t=>[0,1,2].map(i=>[Math.min(...t.map(p=>p[i])),Math.max(...t.map(p=>p[i]))]);
const Overlap=(a,b)=>a.every((r,i)=>r[0]<=b[i][1]+1e-9&&b[i][0]<=r[1]+1e-9);
function CoplanarOverlap(a,b,normal){
 const drop=normal.reduce((best,v,i)=>Math.abs(v)>Math.abs(normal[best])?i:best,0),project=p=>p.filter((_,i)=>i!==drop),cross=(u,v)=>u[0]*v[1]-u[1]*v[0];a=a.map(project);b=b.map(project);
 const orient=(p,q,r)=>cross(Sub(q,p),Sub(r,p));
 const inside=(p,t)=>{const s=[0,1,2].map(i=>orient(t[i],t[(i+1)%3],p));return s.every(v=>v>=-1e-10)||s.every(v=>v<=1e-10);};
 if(a.some(p=>inside(p,b))||b.some(p=>inside(p,a)))return true;
 for(let i=0;i<3;i++)for(let j=0;j<3;j++){
  const p=a[i],q=a[(i+1)%3],r=b[j],s=b[(j+1)%3];if(![0,1].every(k=>Math.min(p[k],q[k])<=Math.max(r[k],s[k])+1e-10&&Math.min(r[k],s[k])<=Math.max(p[k],q[k])+1e-10))continue;
  if(orient(p,q,r)*orient(p,q,s)<=1e-20&&orient(r,s,p)*orient(r,s,q)<=1e-20)return true;
 }
 return false;
}
function TrianglesCross(a,b){
 if(!Overlap(Bounds(a),Bounds(b)))return false;
 const normal=Cross(Sub(a[1],a[0]),Sub(a[2],a[0])),length=Math.hypot(...normal);
 if(b.every(p=>Math.abs(Dot(Sub(p,a[0]),normal))<length*1e-9))return CoplanarOverlap(a,b,normal);
 for(const[x,y]of[[a,b],[b,a]])for(let i=0;i<3;i++){const t=RayTriangle(x[i],Sub(x[(i+1)%3],x[i]),y);if(t!==null&&t>=-1e-9&&t<=1+1e-9)return true;}
 return false;
}
export function AuditEnclosedShoeCleanup(glb,{verifyBinaryPrefix=false}={}){
 const g=glb.json,certificate=g.asset.extras?.Type89EnclosedShoeCleanup;if(!certificate)return{pass:true,removedRenderedTriangles:0,rows:[]};
 assert.equal(certificate.method,'StrictInsideWatertightSameShoePlate_NoSurfaceIntersection');
 if(verifyBinaryPrefix){assert.equal(createHash('sha256').update(glb.bin.subarray(0,certificate.originalBinaryByteLength)).digest('hex'),certificate.originalBinarySha256);}
 const results=[];let total=0;
 for(const row of certificate.rows){
  const nodes=g.nodes.filter(n=>n.mesh===row.meshIndex);assert.equal(nodes.length,row.instances);assert(nodes.every(n=>n.name.startsWith('Mesh_TrackLink')));
  const mesh=g.meshes[row.meshIndex],vertices=[],lookup=new Map(),all=[],removed=[];let storage=0;
  for(const [pi,p]of mesh.primitives.entries()){
   const proof=row.primitives.find(r=>r.primitive===pi),positions=ReadAccessor(glb,p.attributes.POSITION),actual=ReadAccessor(glb,p.indices).data,original=proof?ReadAccessor(glb,proof.sourceIndicesAccessor).data:actual,weld=[];
   for(let i=0;i<positions.count;i++){const point=Array.from(positions.data.slice(i*3,i*3+3)),key=JSON.stringify(point);if(!lookup.has(key)){lookup.set(key,vertices.length);vertices.push(point);}weld.push(lookup.get(key));}
   const deleted=new Set(proof?.removedSourceTriangles??[]);if(proof){assert.equal(p.indices,proof.newIndicesAccessor);assert.equal(deleted.size,proof.removedStorageTriangles);}
   const keep=[];
   for(let i=0;i<original.length;i+=3){const indices=Array.from(original.slice(i,i+3)),triangle=indices.map(j=>weld[j]);all.push(triangle);if(deleted.has(i/3)){removed.push(triangle);storage++;}else keep.push(...indices);}
   assert.deepEqual(Array.from(actual),keep,'Every retained triangle/index remains exact');
  }
  const neighbours=vertices.map(()=>new Set());for(const t of all)for(let i=0;i<3;i++){neighbours[t[i]].add(t[(i+1)%3]);neighbours[t[(i+1)%3]].add(t[i]);}
  const unseen=new Set(vertices.map((_,i)=>i)),components=[];while(unseen.size){const first=unseen.values().next().value,component=new Set([first]),todo=[first];unseen.delete(first);for(const i of todo)for(const j of neighbours[i])if(unseen.delete(j)){component.add(j);todo.push(j);}components.push(component);}
  components.sort((a,b)=>b.size-a.size);assert.equal(components.length,5,'Independent casting/pin/horn structure');const plateIds=components[0],plateIndices=all.filter(t=>plateIds.has(t[0])),plate=plateIndices.map(t=>t.map(i=>vertices[i])),edges=new Map();
  for(const t of plateIndices)for(let i=0;i<3;i++){const key=[t[i],t[(i+1)%3]].sort((a,b)=>a-b).join(',');edges.set(key,(edges.get(key)??0)+1);}assert([...edges.values()].every(n=>n===2),'Current enclosing plate is closed/two-manifold');
  const directions=[[1,.217,.381],[.313,1,.173],[.239,.411,1]].map(v=>v.map(x=>x/Math.hypot(...v)));let minimum=Infinity;
  for(const vertex of new Set(removed.flat())){
   assert(!plateIds.has(vertex),'An enclosing casting vertex cannot be removed as an enclosed pin surface');const point=vertices[vertex];let distance=Infinity;for(const triangle of plate)distance=Math.min(distance,Math.hypot(...Sub(point,ClosestTriangle(point,triangle))));assert(distance>.0001,'Removed vertex must be strictly inside, clear of the current casting surface');minimum=Math.min(minimum,distance);
   for(const direction of directions){const hits=plate.map(t=>RayTriangle(point,direction,t)).filter(t=>t!==null&&t>1e-7).sort((a,b)=>a-b),distinct=hits.filter((t,i)=>i===0||Math.abs(t-hits[i-1])>1e-7);assert.equal(distinct.length%2,1,'Independent ray parity must be inside');}
  }
  for(const indices of removed){const triangle=indices.map(i=>vertices[i]);for(const surface of plate)assert(!TrianglesCross(triangle,surface),'No removed triangle may cross any actual enclosing surface');}
  assert.equal(storage,row.removedStorageTriangles);assert.equal(storage*nodes.length,row.removedRenderedTriangles);total+=storage*nodes.length;results.push({mesh:mesh.name,instances:nodes.length,removedStorageTriangles:storage,minimumRemovedVertexClearanceM:minimum,plateTriangles:plate.length,pass:true});
 }
 assert.equal(total,certificate.removedRenderedTriangles);return{pass:true,removedRenderedTriangles:total,rows:results,scope:'Current accessor/index geometry, independently welded closure, point-to-triangle clearance, three ray parities and complete triangle/surface crossing tests. Binary-prefix identity optionally checked only at the cleanup boundary.'};
}
export function VerifyRejectsExternalRemoval(glb){
 const candidate=LoadGlb(Buffer.from(glb.buffer)),certificate=candidate.json.asset.extras?.Type89EnclosedShoeCleanup;assert(certificate?.rows.length);
 const row=certificate.rows[0],proof=row.primitives[0],primitive=candidate.json.meshes[row.meshIndex].primitives[proof.primitive];
 const removed=new Set(proof.removedSourceTriangles);assert(!removed.has(0));removed.delete(proof.removedSourceTriangles[0]);removed.add(0);proof.removedSourceTriangles=[...removed].sort((a,b)=>a-b);
 const original=ReadAccessor(candidate,proof.sourceIndicesAccessor).data,accessor=candidate.json.accessors[primitive.indices],view=candidate.json.bufferViews[accessor.bufferView],width={5121:1,5123:2,5125:4}[accessor.componentType];assert(width);
 const kept=[];for(let at=0;at<original.length;at+=3)if(!removed.has(at/3))kept.push(...original.slice(at,at+3));assert.equal(kept.length,accessor.count);
 const base=(view.byteOffset??0)+(accessor.byteOffset??0),stride=view.byteStride??width;
 for(let i=0;i<kept.length;i++)candidate.bin.writeUIntLE(kept[i],base+i*stride,width);
 let rejected;try{AuditEnclosedShoeCleanup(candidate);}catch(error){rejected=String(error);}
 assert(rejected?.includes('An enclosing casting vertex cannot be removed'),'Identical-count external-face removal must be rejected by actual geometric membership');
 return{pass:true,rejectedExternalFaceWithUnchangedCounts:true,rejection:rejected,sourceFileUnchanged:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const file=process.argv.find(a=>a.startsWith('--file='))?.slice(7);assert(file,'Supply --file');const glb=LoadGlb(file),report=AuditEnclosedShoeCleanup(glb,{verifyBinaryPrefix:process.argv.includes('--verify-prefix')});if(process.argv.includes('--negative-probe'))report.negativeProbe=VerifyRejectsExternalRemoval(glb);console.log(JSON.stringify(report));
}
