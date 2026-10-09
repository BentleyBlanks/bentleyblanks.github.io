// Historical photographs 01/14: broad cut-earth faces, broken shoulders, sparse roots.
// Everything samples the host heightfield; no extra colliders or walkable floors.
import * as THREE from "three";
import { HashString, Mulberry32, ValueNoise2 } from "./Script_Noise.mjs";
import { TRENCH_APPEARANCE as DefaultStyle } from "./Data_TrenchAppearance.mjs";
import { CreateTrenchDressingHeightSampler } from "./Script_TrenchSurface.mjs";

export function BuildTrenchEarth(sink, plan, groundAt, { earth = "ground", roots = "TrenchRoots", clods = [], cliffs = [], style: Style = DefaultStyle } = {}) {
  const stats = { clods: 0, spoilClods: 0, roots: 0, cliffPanels: 0, triangles: 0 };
  const skinGeometries=[];
  // IcosahedronGeometry(1, 0) splits every triangle for flat normals. Weld the
  // twelve corners before reshaping so small crumbs do not shade as rock facets.
  // Authored UV seams are irrelevant here: the soil material is world-projected.
  const Weld=primitive=>{
    const corners=new Map(),positions=[],indices=[],p=primitive.attributes.position;
    for(let i=0;i<p.count;i++){
      const point=[p.getX(i),p.getY(i),p.getZ(i)],key=point.map(v=>v.toFixed(6)).join(',');
      if(!corners.has(key)){corners.set(key,positions.length/3);positions.push(...point);}
      indices.push(corners.get(key));
    }
    primitive.dispose();
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
    geometry.computeVertexNormals();return geometry;
  };
  const shape=Weld(new THREE.IcosahedronGeometry(1,0));
  const tinyShape=Weld(new THREE.OctahedronGeometry(1,0));tinyShape.scale(1,.78,1);
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(), middle = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const occupied = new Set();
  // Broad flakes represent detached crust, not granular spoil. At this scale
  // their planar faces read as dark rock sheets; use the compact aggregate kit.
  const aggregateClods=clods.filter(g=>!/Flake|CutShoulder/.test(g.userData.trenchClodShape||''));
  const highClods=aggregateClods.filter(g=>g.userData.trenchClodHigh),lowClods=aggregateClods.filter(g=>!g.userData.trenchClodHigh);
  const Range = (random, limits) => limits[0] + random() * (limits[1] - limits[0]);
  const Add = (key, geometry) => {
    if(geometry.userData.trenchCrust||geometry.userData.trenchSpoilSkin)skinGeometries.push(geometry);
    stats.triangles += (geometry.index?.count || geometry.attributes.position.count) / 3;
    sink.Add(key, geometry);
  };
  const CrownLift=(x,z)=>Style.crownReliefM*(.12+.88*Math.pow(ValueNoise2(x*2.15,z*2.15,751),1.5));
  const CrownInset=(x,z)=>Style.cliffCrownInsetM*Ease((ValueNoise2(x*1.7,z*1.7,953)-.28)/.44);
  // Both sides of the crest share the same edge. Taper 0 sinks a skin run
  // just under the heightfield, including its broken crown, without a step.
  const CrustLift = (x,z,u,taper=1,along=0,crown=true) => {
    if(u<=0||u>1)return 0;
    // Low-frequency earthen masses instead of gravel-like bumps over the whole wall.
    // The shoulder stays inside the existing bank footprint; the walking floor is untouched.
    const fracture=Ease((ValueNoise2(along*1.65,groundAt(x,z)*2.4,173)-.3)/.45);
    const mass=.35*ValueNoise2(x*.85,z*.85,71)+.65*fracture,grain=ValueNoise2(x*8,z*8,93);
    const shoulder=Style.cutShoulderM*Ease(u/.42)*(1-Ease((u-.68)/.32))*(.45+.55*ValueNoise2(x*2.3,z*2.3,218));
    // Short, irregular spade flutes run up the face, never across the walking lane.
    const phase=along/Style.spadeWidthM+ValueNoise2(x*1.2,z*1.2,417)*.65;
    const scrape=Style.spadeReliefM*(.5+.5*Math.cos(phase*Math.PI*2))*(.4+.6*mass)*ValueNoise2(x*3.1,z*3.1,149);
    const wall=Math.min(.195,shoulder+Math.sin(u*Math.PI)*(.014+Style.crustReliefM*mass+scrape+.006*grain));
    const crownBlend=crown?Ease((u-.68)/.32):0;
    return (wall*(1-crownBlend)+CrownLift(x,z)*crownBlend)*Ease(u/.1)*taper-.004;
  };
  const Ease = t => { t=Math.max(0,Math.min(1,t)); return t*t*(3-2*t); };
  const CrustTaper = (v, ends) => (ends.start ? Ease(v/.5) : 1) * (ends.end ? Ease((1-v)/.5) : 1);
  const Clod = (center, radius, relief, random, crown=false, heightAt=groundAt) => {
    // Radius and height cannot be independent: a tiny crumb with a large height
    // became a pointed rock. Soil aggregates remain squat broken masses.
    relief=Math.min(relief,radius*.8);
    // Preserve random placement draws while choosing detail after slope shrink.
    // A large source clod reduced to a bank crumb needs only the small cap.
    const modelChoice=radius>=Style.clodModelRadiusM&&lowClods.length?random():0;
    const angle=random()*Math.PI*2;
    const e=.08,HostNormal=sample=>new THREE.Vector3(-(sample(center.x+e,center.z)-sample(center.x-e,center.z))/(2*e),
      1,-(sample(center.x,center.z+e)-sample(center.x,center.z-e))/(2*e)).normalize();
    const physicalN=HostNormal(groundAt),n=heightAt===groundAt?physicalN:HostNormal(heightAt);
    // Large spoil clods belong on the crown. A crown sample can land on an
    // adjoining steep bank at junctions; keep only small embedded crumbs there.
    const supportN=crown?n:physicalN;
    const cutClod=plan.Corridor(center.x,center.z)?.inCut&&supportN.y<.85;
    const slopeScale=cutClod?Math.min(1,.065/radius):Math.min(1,.065/radius+(1-.065/radius)*Ease((supportN.y-.45)/.35));
    radius*=slopeScale;relief*=slopeScale;
    const variants=radius>=Style.clodHighRadiusM&&highClods.length?highClods:lowClods;
    const source=radius>=Style.clodModelRadiusM&&variants.length?variants[Math.floor(modelChoice*variants.length)]
      :radius<Style.clodTinyRadiusM?tinyShape:shape;
    const geometry=source.clone();
    const underside=Float32Array.from(geometry.attributes.position.array.filter((_,i)=>i%3===1),y=>Math.max(0,Math.min(1,(.18-y)/.4)));
    geometry.userData.trenchCrown=crown;
    geometry.rotateY(angle);
    geometry.scale(radius,relief,radius*(.7+random()*.65));
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up,n));
    const p = geometry.attributes.position,contactWeights=new Float32Array(p.count),buried=new Float32Array(p.count);
    const embed=cutClod ? .65 : crown ? Style.clodEmbed : physicalN.y>.85?Style.floorClodEmbed:Math.max(.55,Style.clodEmbed);
    const anchor=new THREE.Vector3(center.x,heightAt(center.x,center.z),center.z).addScaledVector(n,-relief*embed);
    for (let v = 0; v < p.count; v++) {
      // Keep the exposed cap solid. Only the buried underside follows a falling
      // crown: otherwise a flat model base hangs in the air above the cut face.
      const x=anchor.x+p.getX(v),z=anchor.z+p.getZ(v),y=anchor.y+p.getY(v);
      const hostHeight=heightAt(x,z),seatedY=y+Math.min(0,hostHeight-.018-y)*underside[v];
      p.setXYZ(v,x,seatedY,z);
      buried[v]=groundAt(x,z)-seatedY;
      contactWeights[v]=1-Ease(Math.max(0,(seatedY-hostHeight)*n.y)/Math.min(Style.clodContactM,radius*.5));
    }
    // World-projected material ignores authored UVs. Keep this marker through the
    // shared position/normal/UV merge, then convert it to the trench material flag.
    const marker=new Float32Array(p.count*2);
    // Embedded cut-face aggregates share the compact matrix. Loose spoil on a
    // steep bank otherwise looks like a separate pale stone stuck onto the wall.
    for(let i=0;i<p.count;i++){marker[i*2]=cutClod?-6:-8;marker[i*2+1]=-9;}
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(marker,2));
    geometry.computeVertexNormals();
    // At the embedded foot, aggregate and soil form one surface. Blend only the
    // shallow contact band; the exposed cap keeps its sculpted normal/relief.
    const normals=geometry.attributes.normal;
    for(let i=0;i<normals.count;i++){
      const w=contactWeights[i],x=normals.getX(i)*(1-w)+n.x*w,y=normals.getY(i)*(1-w)+n.y*w,z=normals.getZ(i)*(1-w)+n.z*w;
      const length=Math.hypot(x,y,z)||1;normals.setXYZ(i,x/length,y/length,z/length);
    }
    // Cull only faces fully inside the physical ground, keeping a safety margin
    // and checking the centre on curved terrain. The visible skin's highest Y
    // would incorrectly discard geometry visible beneath an overhanging lip.
    // Compute normals first, so removing hidden faces cannot change the cap.
    const triangles=geometry.index,keep=[];
    for(let i=0;i<triangles.count;i+=3){
      const a=triangles.getX(i),b=triangles.getX(i+1),c=triangles.getX(i+2);
      let hidden=buried[a]>.018&&buried[b]>.018&&buried[c]>.018;
      if(hidden){
        const x=(p.getX(a)+p.getX(b)+p.getX(c))/3,z=(p.getZ(a)+p.getZ(b)+p.getZ(c))/3;
        hidden=groundAt(x,z)-(p.getY(a)+p.getY(b)+p.getY(c))/3>.025;
      }
      if(!hidden)keep.push(a,b,c);
    }
    geometry.setIndex(keep);
    Add(earth, geometry); stats.clods++;
  };
  const Crust = (st, next, side, ends) => {
    const positions=[],uvs=[],indices=[],cols=8,rows=8;
    for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++) {
      const u=col/cols,v=row/rows;
      const half=st.halfFloor+(next.halfFloor-st.halfFloor)*v,bank=st.bank+(next.bank-st.bank)*v;
      const lateral=half+bank*(.02+u*.98);
      const nx=st.nx+(next.nx-st.nx)*v,nz=st.nz+(next.nz-st.nz)*v;
      const x=st.x+(next.x-st.x)*v+nx*side*lateral,z=st.z+(next.z-st.z)*v+nz*side*lateral;
      const lift=CrustLift(x,z,u,CrustTaper(v,ends),st.s+(next.s-st.s)*v,(side>0?st.bermPlus:st.bermMinus)>0);
      positions.push(x,groundAt(x,z)+lift,z);uvs.push(u,v);
    }
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++) {
      const a=row*(cols+1)+col,b=a+cols+1;
      if(side>0)indices.push(a,a+1,b,a+1,b+1,b);else indices.push(a,b,a+1,a+1,b,b+1);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    geometry.userData.trenchCrust=true;
    Add(earth,geometry);
  };
  const CliffPanel = (st,next,side,ends,variant) => {
    const geometry=cliffs[variant%cliffs.length].clone(),mirror=(variant&4)!==0;
    if(mirror)geometry.scale(-1,1,1);
    const p=geometry.attributes.position;
    const hasCrown=(side>0?st.bermPlus:st.bermMinus)>0;
    const marker=new Float32Array(p.count*2);
    for(let i=0;i<p.count;i++){
      // Kit coordinates: 1.5 m along X, 2 m up Y, +Z points into the trench.
      // Fit by height rather than stretching a heightfield grid over the face:
      // the module keeps its pockets, recessed skirt and overhanging crown.
      const v=Math.max(0,Math.min(1,(p.getX(i)+.75)/1.5)),u=hasCrown?p.getY(i)/2:Math.min(1,p.getY(i)/2);
      const cx=st.x+(next.x-st.x)*v,cz=st.z+(next.z-st.z)*v;
      const nx=st.nx+(next.nx-st.nx)*v,nz=st.nz+(next.nz-st.nz)*v;
      const half=st.halfFloor+(next.halfFloor-st.halfFloor)*v,bank=st.bank+(next.bank-st.bank)*v;
      const foot=half+bank*.02,crest=half+bank;
      const At=offset=>groundAt(cx+nx*side*offset,cz+nz*side*offset);
      const floor=At(foot),top=At(crest),height=floor+(top-floor)*u;
      let lo=foot,hi=crest;
      for(let step=0;step<10;step++){
        const mid=(lo+hi)*.5;if(At(mid)<height)lo=mid;else hi=mid;
      }
      const base=u<=0?foot:u>=1?crest:(lo+hi)*.5,taper=CrustTaper(v,ends);
      // The physical shoulder rounds away from the trench near the crest.
      // Keep the exposed crown forward of that curve; the recessed top skirt
      // still reaches the original crest so the spoil cap remains connected.
      const crownInset=hasCrown&&p.getZ(i)>0?CrownInset(cx+nx*side*crest,cz+nz*side*crest)*Ease((u-.76)/.24):0;
      const inset=(p.getZ(i)*Style.cliffDepthScale+crownInset)*taper*Ease(u/.10);
      const lateral=Math.max(foot,base-inset),x=cx+nx*side*lateral,z=cz+nz*side*lateral;
      const crown=hasCrown?CrownLift(cx+nx*side*crest,cz+nz*side*crest)*Ease((u-.75)/.25)*taper:0;
      p.setXYZ(i,x,height+crown-.004,z);marker[i*2]=u;marker[i*2+1]=v;
    }
    const index=geometry.index;
    if(((st.tz*st.nx-st.tx*st.nz)*side<0)!==mirror)
      for(let i=0;i<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b);}
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(marker,2));
    geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    geometry.userData.trenchCrust=true;geometry.userData.trenchCliff=true;geometry.userData.trenchCliffMirrored=mirror;
    Add(earth,geometry);stats.cliffPanels++;
  };
  const SpoilLift=(x,z,u,taper)=>{
    const crownBlend=1-Ease(u/.4),loose=Math.sin(Math.PI*Math.max(0,Math.min(1,u)))*
      (.025+.10*ValueNoise2(x*4.2,z*4.2,712)+.035*ValueNoise2(x*9,z*9,337));
    return (CrownLift(x,z)*crownBlend+loose*(1-crownBlend))*taper-.004;
  };
  const SpoilSkin=(st,next,side,ends)=>{
    if((side>0?st.bermPlus:st.bermMinus)<=0)return;
    // Match the cut face's eight rows at their shared crest. Six columns keep
    // the same triangle budget while avoiding cracks between different edge meshes.
    const positions=[],uvs=[],indices=[],cols=6,rows=8;
    for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
      const u=col/cols,v=row/rows,cx=st.x+(next.x-st.x)*v,cz=st.z+(next.z-st.z)*v;
      const nx=st.nx+(next.nx-st.nx)*v,nz=st.nz+(next.nz-st.nz)*v;
      const half=st.halfFloor+(next.halfFloor-st.halfFloor)*v,bank=st.bank+(next.bank-st.bank)*v;
      const hit=plan.Corridor(cx+nx*side*(half+bank),cz+nz*side*(half+bank));
      const offset=half+bank+(hit?.bermWidth||0)*u*.90;
      const x=cx+nx*side*offset,z=cz+nz*side*offset;
      positions.push(x,groundAt(x,z)+SpoilLift(x,z,u,CrustTaper(v,ends)),z);uvs.push(-8,-8);
    }
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const a=row*(cols+1)+col,b=a+cols+1;
      if(side>0)indices.push(a,a+1,b,a+1,b+1,b);else indices.push(a,b,a+1,a+1,b,b+1);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    geometry.userData.trenchCrown=true;geometry.userData.trenchSpoilSkin=true;Add(earth,geometry);
  };
  const RootPiece = (a, b, radius, endRadius=radius*.5, depth=0, attach=null) => {
    // Bend only where a straight fibre would enter the visible skin or bridge
    // too far above it. Sampling the actual triangles also works at junctions.
    let bend=null,bendError=.012;
    if(depth<2)for(const t of [.25,.5,.75]){
      const point=a.clone().lerp(b,t),target=attach?attach(point):new THREE.Vector3(point.x,skinAt(point.x,point.z)+.012,point.z);
      if(!target)continue;
      const error=point.distanceTo(target);
      if(error>bendError){bend={point:target,t};bendError=error;}
    }
    if(bend){
      const midRadius=radius+(endRadius-radius)*bend.t;
      RootPiece(a,bend.point,radius,midRadius,depth+1,attach);RootPiece(bend.point,b,midRadius,endRadius,depth+1,attach);return;
    }
    dir.subVectors(b, a);
    const len = dir.length();
    if (len < 0.005) return;
    const geometry = new THREE.CylinderGeometry(endRadius, radius, len, 3, 1, true);
    rotation.setFromUnitVectors(up, dir.divideScalar(len));
    geometry.applyQuaternion(rotation);
    middle.addVectors(a, b).multiplyScalar(0.5);
    geometry.translate(middle.x, middle.y, middle.z);
    geometry.userData.trenchRoots=true;
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(Array(geometry.attributes.position.count*2).fill(-16),2));
    Add(roots, geometry);
  };
  for (const segment of plan.segments) {
    // The skin follows the bank itself, not whichever clods won their random draw: a patch
    // skipped between two neighbours used to leave a 20 cm step running down the whole wall.
    const skin = { [-1]: new Uint8Array(segment.stations.length), [1]: new Uint8Array(segment.stations.length) };
    for (let i = 0; i < segment.stations.length; i += Style.stationStride) {
      const st = segment.stations[i], next = segment.stations[i + Style.stationStride];
      if (!next || st.junctionClear || next.junctionClear || st.s < Style.endClearM || next.s > segment.path.length - Style.endClearM) continue;
      const floor = groundAt(st.x, st.z);
      for (const side of [-1, 1]) {
        const offset = st.halfFloor + st.bank * .6, x = st.x + st.nx * side * offset, z = st.z + st.nz * side * offset;
        if (plan.Corridor(x, z) && groundAt(x, z) - floor >= Style.minRiseM && plan.Depth(x, z) <= st.depth - Style.minRiseM) skin[side][i] = 1;
      }
    }
    const SkinEnds = (i, side) => ({ start: !skin[side][i - Style.stationStride], end: !skin[side][i + Style.stationStride] });
    for (let i = 0; i < segment.stations.length; i += Style.stationStride)
      for (const side of [-1, 1]) if (skin[side][i]) {
        const st = segment.stations[i];
        sink.SetSector(`TrenchEarth_${Math.floor(st.x / Style.sectorM)}_${Math.floor(st.z / Style.sectorM)}`);
        if(cliffs.length)CliffPanel(st,segment.stations[i+Style.stationStride],side,SkinEnds(i,side),
          HashString(segment.id+':'+i+':'+side));
        else Crust(st, segment.stations[i + Style.stationStride], side, SkinEnds(i, side));
        SpoilSkin(st, segment.stations[i + Style.stationStride], side, SkinEnds(i, side));
      }
  }
  // Neighbouring modules share the border positions but were deformed and
  // shaded separately. Join only those border normals before static batching;
  // pockets inside each module keep their own sculpted shading.
  const cliffBorders=new Map();
  for(const geometry of skinGeometries)if(geometry.userData.trenchCliff){
    const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
    for(let i=0;i<p.count;i++)if(uv.getY(i)<1e-6||uv.getY(i)>1-1e-6){
      const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e5)).join(':');
      if(!cliffBorders.has(key))cliffBorders.set(key,[]);
      cliffBorders.get(key).push({geometry,n,i});
    }
  }
  for(const members of cliffBorders.values())if(new Set(members.map(m=>m.geometry)).size>1){
    const normal=new THREE.Vector3();
    for(const {n,i} of members)normal.add(new THREE.Vector3().fromBufferAttribute(n,i));
    normal.normalize();for(const {n,i} of members)n.setXYZ(i,normal.x,normal.y,normal.z);
  }
  const skinAt=CreateTrenchDressingHeightSampler(skinGeometries,groundAt);
  // A cliff can overhang itself: a vertical height query would attach roots to
  // the lip above their actual face. Use a small spatial index and horizontal
  // rays for these surface attachments; no per-frame meshes or physics bodies.
  const cliffCells=new Map(),cliffCellM=2,cliffMaterial=cliffs.length?new THREE.MeshBasicMaterial({side:THREE.DoubleSide}):null;
  const cliffRay=new THREE.Raycaster();
  for(const geometry of skinGeometries)if(geometry.userData.trenchCliff){
    geometry.computeBoundingBox();const bounds=geometry.boundingBox,mesh=new THREE.Mesh(geometry,cliffMaterial);
    for(let z=Math.floor(bounds.min.z/cliffCellM);z<=Math.floor(bounds.max.z/cliffCellM);z++)
      for(let x=Math.floor(bounds.min.x/cliffCellM);x<=Math.floor(bounds.max.x/cliffCellM);x++){
        const key=x+':'+z;if(!cliffCells.has(key))cliffCells.set(key,[]);cliffCells.get(key).push(mesh);
      }
  }
  const AttachCliff=(point,nx,nz)=>{
    const meshes=new Set(),cellX=Math.floor(point.x/cliffCellM),cellZ=Math.floor(point.z/cliffCellM);
    for(let z=cellZ-1;z<=cellZ+1;z++)for(let x=cellX-1;x<=cellX+1;x++)
      for(const mesh of cliffCells.get(x+':'+z)||[])meshes.add(mesh);
    const normal=new THREE.Vector3(nx,0,nz).normalize();
    cliffRay.set(point.clone().addScaledVector(normal,-.8),normal);cliffRay.far=1.6;
    const hit=cliffRay.intersectObjects([...meshes],false)[0];
    return hit?hit.point.addScaledVector(hit.face.normal,.004):null;
  };
  for (const segment of plan.segments) {
    const random = Mulberry32(HashString(`${plan.seed}:${segment.id}:Earth07`));
    for (let i = 0; i < segment.stations.length; i += Style.stationStride) {
      const st = segment.stations[i];
      if (st.junctionClear || st.s < Style.endClearM || st.s > segment.path.length - Style.endClearM) continue;
      const floor = groundAt(st.x, st.z);
      for (const side of [-1, 1]) {
        const along = (random() - 0.5) * 0.7;
        const cx = st.x + st.tx * along, cz = st.z + st.tz * along;
        sink.SetSector(`TrenchEarth_${Math.floor(cx / Style.sectorM)}_${Math.floor(cz / Style.sectorM)}`);
        const Point = (offset, tangent = 0, lift = 0) => {
          const x = cx + st.nx * side * offset + st.tx * tangent;
          const z = cz + st.nz * side * offset + st.tz * tangent;
          return new THREE.Vector3(x, groundAt(x, z) + lift, z);
        };
        const offset = st.halfFloor + st.bank * (Style.bankStart + random() * (Style.bankEnd - Style.bankStart));
        const center = Point(offset);
        // A neighbouring excavation or a levelled crossing can remove this bank.
        const corridor = plan.Corridor(center.x, center.z);
        if (!corridor || center.y - floor < Style.minRiseM || plan.Depth(center.x, center.z) > st.depth - Style.minRiseM) continue;
        const cell = `${Math.round(center.x * 2)}:${Math.round(center.z * 2)}`;
        if (occupied.has(cell)) continue;
        occupied.add(cell);
        const dressAt=skinAt;
        if (random() < Style.clodChance) {
          const radius = Range(random, Style.clodRadiusM), relief = Range(random, Style.clodReliefM);
          Clod(center, radius, relief, random,false,dressAt);
        }
        // Several sizes of embedded aggregates give the excavation real relief.
        // Jitter across the entire bank; small crumbs collect at its foot.
        for(let n=0;n<(cliffs.length?0:Style.bankClods);n++) {
          const at=Point(st.halfFloor+st.bank*(.08+random()*.92),(random()-.5)*1.35);
          Clod(at,Range(random,Style.clodRadiusM),Range(random,Style.clodReliefM),random,false,dressAt);
        }
        for(let n=0;n<Style.crumbs;n++) {
          const at=Point(st.halfFloor*(.1+.9*Math.pow(random(),.6))+st.bank*random()*.18,(random()-.5)*1.5);
          const radius=Style.crumbRadiusM[0]+(Style.crumbRadiusM[1]-Style.crumbRadiusM[0])*Math.pow(random(),1.5);
          Clod(at,radius,radius*Range(random,Style.crumbReliefRatio),random);
        }
        // A broken, root-bound crown interrupts the long straight heightfield edge.
        for (let n = 0; n < Style.lipClods; n++) {
          if(random()>.55+.45*ValueNoise2(cx*.7,cz*.7,602))continue;
          const lateral=st.halfFloor+st.bank*(.90+random()*.34),tangent=(random()-.5)*1.6;
          const crest=Point(st.halfFloor+st.bank,tangent);
          const inset=cliffs.length&&(side>0?st.bermPlus:st.bermMinus)>0?CrownInset(crest.x,crest.z):0;
          const lip=Point(lateral-inset*.85,tangent);
          // Many small crumbs connect the occasional large torn chunk. Uniform
          // radii produced a few boulders sitting on an otherwise smooth crown.
          const radius=Style.lipRadiusM[0]+(Style.lipRadiusM[1]-Style.lipRadiusM[0])*Math.pow(random(),Style.lipRadiusBias);
          if (dressAt(lip.x,lip.z) - floor > 0.8) Clod(lip,radius,Range(random,Style.lipReliefM),random,true,dressAt);
        }
        // The excavated material continues over the raised spoil ridge and skirt;
        // its footprint is checked against the shared corridor at junctions.
        for(let n=0;n<Style.spoilClods;n++){
          const lateral=st.halfFloor+st.bank+corridor.bermWidth*(.06+random()*.70);
          const at=Point(lateral,(random()-.5)*1.5),hit=plan.Corridor(at.x,at.z);
          if(!hit||hit.inFloor||at.y-floor<Style.minRiseM||hit.id!==segment.id)continue;
          const radius=Style.spoilRadiusM[0]+(Style.spoilRadiusM[1]-Style.spoilRadiusM[0])*Math.pow(random(),1.7);
          Clod(at,radius,Range(random,Style.spoilReliefM),random,true,dressAt);
          stats.spoilClods++;
        }
        if (roots && random() < Style.rootChance) {
          const crest = st.halfFloor + st.bank * 0.92;
          const top = Point(crest);
          if (top.y - floor < 0.75) continue;
          for (let strand = 0; strand < Style.rootStrands; strand++) {
            const spread = (random() - 0.5) * 0.5;
            const length = Range(random, Style.rootLengthM);
            const a = Point(crest + 0.08, spread, 0.035);
            const b = Point(crest - length * 0.4, spread + (random() - 0.5) * 0.16, 0.045);
            const c = Point(crest - length * 0.85, spread + (random() - 0.5) * 0.28, 0.02);
            // Follow the rendered cut skin as the soil clods do. Using only the
            // collision field buried these fine roots inside the raised skin.
            let attach=null;
            if(cliffs.length){
              a.y=dressAt(a.x,a.z)+.008;b.y=a.y-length*.5;c.y=a.y-length;
              attach=point=>AttachCliff(point,st.nx*side,st.nz*side);
              const surfaceB=attach(b),surfaceC=attach(c);
              if(!surfaceB||!surfaceC)continue;
              b.copy(surfaceB);c.copy(surfaceC);
            }else for(const point of [a,b,c])point.y=dressAt(point.x,point.z)+.012;
            const radius=Style.rootRadiusM*(.6+random()*.6);
            RootPiece(a,b,radius,radius*.5,0,attach);
            RootPiece(b,c,Style.rootRadiusM*.48,Style.rootRadiusM*.24,0,attach);
            stats.roots++;
          }
        }
      }
    }
  }
  shape.dispose();tinyShape.dispose();cliffMaterial?.dispose();
  return stats;
}
