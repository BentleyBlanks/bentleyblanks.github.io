// 局部黏聚撕取：只分开工具附近的体积单元，材料和运动场由两侧继承。
const Sub=(a,b)=>a.map((x,k)=>x-b[k]),Distance=(a,b)=>Math.hypot(...Sub(a,b));
const Faces=([a,b,c,d])=>[[a,c,b],[a,b,d],[b,c,d],[c,a,d]];
// Mesh indices are Uint16; three sorted indices fit exactly in a JS integer.
// Numeric face keys avoid thousands of sorting arrays/strings at the cut.
const Key=([a,b,c])=>{if(a>b)[a,b]=[b,a];if(b>c)[b,c]=[c,b];if(a>b)[a,b]=[b,a];return(a*65536+b)*65536+c;};
export const OILY_BITE_MASS=.32;
export function PlanSlimeBite(body){
 const s=body.gel,g=s.grip;if(!g||!s.cells?.length)return;
 const point=[0,0,0];g.ids.forEach((id,j)=>s.rest[id].forEach((x,k)=>point[k]+=x*g.weights[j]));
 const cells=s.cells.map((c,i)=>{const center=[0,0,0];c.ids.forEach(id=>s.rest[id].forEach((x,k)=>center[k]+=x/c.ids.length));return{i,c,d:Distance(center,point),volume:c.tetrahedra.reduce((v,id)=>v+s.tetrahedra[id].rest,0)};}).sort((a,b)=>a.d-b.d);
 const limit=s.volume*Math.min(1,OILY_BITE_MASS/(body.cleanMass||3)),chosen=[],keys=new Set();let volume=0;
 for(let pass=0;pass<cells.length;pass++){let added=false;for(const cell of cells){if(keys.has(cell.i)||cell.d>Math.max(cells[0].d+.12,1.15)||volume+cell.volume>limit+1e-9&&chosen.length)continue;if(chosen.length&&!chosen.some(j=>Math.abs(s.cells[j].u-cell.c.u)+Math.abs(s.cells[j].v-cell.c.v)===1))continue;chosen.push(cell.i);keys.add(cell.i);volume+=cell.volume;added=true;}if(!added)break;}
 const nodes=[...new Set(chosen.flatMap(i=>s.cells[i].ids))],start=g.ids.reduce((p,id,j)=>p.map((x,k)=>x+s.points[id][k]*g.weights[j]),g.offset.slice());
 const mask=new Uint8Array(s.points.length);nodes.forEach(id=>mask[id]=1);
 const releaseMask=mask.slice();s.cells.forEach((cell,i)=>{if(!keys.has(i))cell.ids.forEach(id=>releaseMask[id]=0);});
 const cleanMass=(body.cleanMass||3)*volume/s.volume,requiredWork=5*Math.min(1,Math.max(.08,(cleanMass/.12)**(2/3)));
 // 薄膜的断裂行程随厚度减小；小残余的断裂功按接触截面积缩放。
 const meanThickness=nodes.reduce((sum,id)=>sum+s.nodeThickness[id]/nodes.length,0),requiredExtension=Math.min(.22,.12+meanThickness*.12);
 s.bite={cells:chosen,nodes,mask,releaseMask,volume,requiredWork,requiredExtension,start,previous:start.slice(),work:0,extension:0,ready:false};
}
export function UpdateSlimeBite(body,target){
 const s=body.gel,b=s.bite;if(!b||!s.grip)return;
 const current=s.grip.ids.reduce((p,id,j)=>p.map((x,k)=>x+s.points[id][k]*s.grip.weights[j]),s.grip.offset.slice());
 b.extension=Distance(current,b.start);const advance=b.extension-Distance(b.previous,b.start);
 if(advance>0)b.work+=Math.min(advance,.25)*body.force;b.previous=current;
 // 先形成可见的黏软颈部；停在原地或朝向无效不会累加撕取功。
 b.ready=b.extension>b.requiredExtension&&b.work>b.requiredWork;
}
export function PartitionSlimeBite(body){
 const s=body.gel,b=s.bite;if(!b?.ready)return null;
 const selected=new Set(b.cells),bite=s.cells.filter((_,i)=>selected.has(i)),left=s.cells.filter((_,i)=>!selected.has(i));
 const anchorsByNode=new Map(body.anchors.map(a=>[a.node,a]));
 function Part(cells,held){
  if(!cells.length)return null;
  const oldTets=cells.flatMap(c=>c.tetrahedra),tetIds=new Map(oldTets.map((id,i)=>[id,i])),original=oldTets.map(id=>s.tetrahedra[id].ids),parent=Array.from({length:oldTets.length*4},(_,i)=>i),shared=new Map();
  const Find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  // 断口处只通过仍共享的四面体面焊接。对角接触的体积顶点分开，避免夹角处出现非流形黑刺。
  original.forEach((tet,i)=>{for(const face of Faces(tet)){const key=Key(face),other=shared.get(key);if(other===undefined)shared.set(key,i);else for(const n of face)parent[Find(i*4+tet.indexOf(n))]=Find(other*4+original[other].indexOf(n));}});
  const roots=new Map(),oldNodes=[],occurrence=parent.map((_,i)=>{const root=Find(i);if(!roots.has(root)){roots.set(root,oldNodes.length);oldNodes.push(original[Math.floor(i/4)][i%4]);}return roots.get(root);});
  const tetrahedra=original.map((tet,i)=>tet.map((_,j)=>occurrence[i*4+j])),faces=new Map();
  for(const tet of tetrahedra)for(const face of Faces(tet)){const key=Key(face);if(faces.has(key))faces.delete(key);else faces.set(key,face);}
  return{held,oldNodes,oldTets,volume:oldTets.reduce((v,id)=>v+s.tetrahedra[id].rest,0),positions:Float32Array.from(oldNodes.flatMap(id=>s.rest[id])),indices:Uint16Array.from([...faces.values()].flat()),tetrahedra,
   cells:held?null:cells.map(c=>({...c,ids:c.ids.map(id=>{const ti=tetIds.get(c.tetrahedra.find(ti=>s.tetrahedra[ti].ids.includes(id)));return occurrence[ti*4+original[ti].indexOf(id)];}),tetrahedra:c.tetrahedra.map(id=>tetIds.get(id))})),thickness:Float32Array.from(oldNodes.map(id=>s.nodeThickness[id])),anchors:held?[]:oldNodes.flatMap((id,node)=>{const a=anchorsByNode.get(id);return a?[{...a,node}]:[]})};
 }
 return{bite:Part(bite,true),remainder:Part(left,false)};
}
