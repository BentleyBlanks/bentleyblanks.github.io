// Historical photographs 01/14: broad cut-earth faces, broken shoulders, sparse roots.
// Everything samples the host heightfield; no extra colliders or walkable floors.
import * as THREE from "three";
import { HashString, Mulberry32, ValueNoise2 } from "./Script_Noise.mjs";
import { TRENCH_APPEARANCE as DefaultStyle } from "./Data_TrenchAppearance.mjs";

export function BuildTrenchEarth(sink, plan, groundAt, { earth = "ground", roots = "TrenchRoots", clods = [], style: Style = DefaultStyle } = {}) {
  const stats = { clods: 0, spoilClods: 0, roots: 0, triangles: 0 };
  // IcosahedronGeometry(1, 0) splits every triangle for flat normals. Weld the
  // twelve corners before reshaping so small crumbs do not shade as rock facets.
  // Authored UV seams are irrelevant here: the soil material is world-projected.
  const primitive = new THREE.IcosahedronGeometry(1, 0),corners=new Map(),positions=[],indices=[];
  const primitivePositions=primitive.attributes.position;
  for(let i=0;i<primitivePositions.count;i++){
    const p=[primitivePositions.getX(i),primitivePositions.getY(i),primitivePositions.getZ(i)];
    const key=p.map(v=>v.toFixed(6)).join(',');
    if(!corners.has(key)){corners.set(key,positions.length/3);positions.push(...p);}
    indices.push(corners.get(key));
  }
  primitive.dispose();
  const shape=new THREE.BufferGeometry();
  shape.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));shape.setIndex(indices);
  shape.computeVertexNormals();
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(), middle = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const occupied = new Set();
  // Broad flakes represent detached crust, not granular spoil. At this scale
  // their planar faces read as dark rock sheets; use the compact aggregate kit.
  const aggregateClods=clods.filter(g=>!/Flake|CutShoulder/.test(g.userData.trenchClodShape||''));
  const highClods=aggregateClods.filter(g=>g.userData.trenchClodHigh),lowClods=aggregateClods.filter(g=>!g.userData.trenchClodHigh);
  const Range = (random, limits) => limits[0] + random() * (limits[1] - limits[0]);
  const Add = (key, geometry) => {
    stats.triangles += (geometry.index?.count || geometry.attributes.position.count) / 3;
    sink.Add(key, geometry);
  };
  // taper 0 sinks the skin just under the heightfield: a run of skin ends without a step.
  const CrustLift = (x,z,u,taper=1,along=0) => {
    if(u<=0||u>=1)return 0;
    // Low-frequency earthen masses instead of gravel-like bumps over the whole wall.
    // The shoulder stays inside the existing bank footprint; the walking floor is untouched.
    const mass=.45*ValueNoise2(x*.85,z*.85,71)+.55*ValueNoise2(x*4.8,z*4.8,173),grain=ValueNoise2(x*8,z*8,93);
    const shoulder=Style.cutShoulderM*Ease(u/.42)*(1-Ease((u-.68)/.32))*(.45+.55*ValueNoise2(x*2.3,z*2.3,218));
    // Short, irregular spade flutes run up the face, never across the walking lane.
    const phase=along/Style.spadeWidthM+ValueNoise2(x*1.2,z*1.2,417)*.65;
    const scrape=Style.spadeReliefM*(.5+.5*Math.cos(phase*Math.PI*2))*(.4+.6*mass)*ValueNoise2(x*3.1,z*3.1,149);
    return (shoulder+Math.sin(u*Math.PI)*(.014+Style.crustReliefM*mass+scrape+.006*grain))*taper-.008;
  };
  const Ease = t => { t=Math.max(0,Math.min(1,t)); return t*t*(3-2*t); };
  const CrustTaper = (v, ends) => (ends.start ? Ease(v/.5) : 1) * (ends.end ? Ease((1-v)/.5) : 1);
  const Clod = (center, radius, relief, random, crown=false, heightAt=groundAt) => {
    // Radius and height cannot be independent: a tiny crumb with a large height
    // became a pointed rock. Soil aggregates remain squat broken masses.
    relief=Math.min(relief,radius*.8);
    const variants=radius>=.27&&highClods.length?highClods:lowClods;
    const source=radius>=.12&&variants.length?variants[Math.floor(random()*variants.length)]:shape;
    const geometry = source.clone();
    const underside=Float32Array.from(geometry.attributes.position.array.filter((_,i)=>i%3===1),y=>Math.max(0,Math.min(1,(.18-y)/.4)));
    geometry.userData.trenchCrown=crown;
    geometry.rotateY(random() * Math.PI * 2);
    const e=.08,n=new THREE.Vector3(-(groundAt(center.x+e,center.z)-groundAt(center.x-e,center.z))/(2*e),
      1,-(groundAt(center.x,center.z+e)-groundAt(center.x,center.z-e))/(2*e)).normalize();
    // Large spoil clods belong on the crown. A crown sample can land on an
    // adjoining steep bank at junctions; keep only small embedded crumbs there.
    const cutClod=plan.Corridor(center.x,center.z)?.inCut&&n.y<.85;
    const slopeScale=cutClod?Math.min(1,.04/radius):Math.min(1,.065/radius+(1-.065/radius)*Ease((n.y-.45)/.35));
    radius*=slopeScale;relief*=slopeScale;
    geometry.scale(radius,relief,radius*(.7+random()*.65));
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up,n));
    const p = geometry.attributes.position;
    const embed=cutClod ? .65 : crown ? Style.clodEmbed : Math.max(.55,Style.clodEmbed);
    const anchor=new THREE.Vector3(center.x,heightAt(center.x,center.z),center.z).addScaledVector(n,-relief*embed);
    for (let v = 0; v < p.count; v++) {
      // Keep the exposed cap solid. Only the buried underside follows a falling
      // crown: otherwise a flat model base hangs in the air above the cut face.
      const x=anchor.x+p.getX(v),z=anchor.z+p.getZ(v),y=anchor.y+p.getY(v);
      p.setXYZ(v,x,y+Math.min(0,heightAt(x,z)-.018-y)*underside[v],z);
    }
    // World-projected material ignores authored UVs. Keep this marker through the
    // shared position/normal/UV merge, then convert it to the trench material flag.
    const marker=new Float32Array(p.count*2);
    for(let i=0;i<p.count;i++){marker[i*2]=-8;marker[i*2+1]=-9;}
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(marker,2));
    geometry.computeVertexNormals();
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
      const lift=CrustLift(x,z,u,CrustTaper(v,ends),st.s+(next.s-st.s)*v);
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
  const SpoilLift=(x,z,u,taper)=>Math.sin(Math.PI*Math.max(0,Math.min(1,u)))*taper*
    (.025+.10*ValueNoise2(x*4.2,z*4.2,712)+.035*ValueNoise2(x*9,z*9,337))-.004;
  const SpoilSkin=(st,next,side,ends)=>{
    if((side>0?st.bermPlus:st.bermMinus)<=0)return;
    const positions=[],uvs=[],indices=[],cols=8,rows=6;
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
  const RootPiece = (a, b, radius) => {
    dir.subVectors(b, a);
    const len = dir.length();
    if (len < 0.005) return;
    const geometry = new THREE.CylinderGeometry(radius * 0.5, radius, len, 3, 1, true);
    rotation.setFromUnitVectors(up, dir.divideScalar(len));
    geometry.applyQuaternion(rotation);
    middle.addVectors(a, b).multiplyScalar(0.5);
    geometry.translate(middle.x, middle.y, middle.z);
    geometry.userData.trenchRoots=true;
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(Array(geometry.attributes.position.count*2).fill(-16),2));
    Add(roots, geometry);
  };
  for (const segment of plan.segments) {
    const random = Mulberry32(HashString(`${plan.seed}:${segment.id}:Earth07`));
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
        Crust(st, segment.stations[i + Style.stationStride], side, SkinEnds(i, side));
        SpoilSkin(st, segment.stations[i + Style.stationStride], side, SkinEnds(i, side));
      }
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
        const ends=skin[side][i]?SkinEnds(i,side):null,span=ends?segment.stations[i+Style.stationStride].s-st.s:1;
        const dressAt=(x,z)=>{
          if(!ends)return groundAt(x,z);
          const lateral=((x-st.x)*st.nx+(z-st.z)*st.nz)*side;
          const u=(lateral-st.halfFloor-st.bank*.02)/(st.bank*.98);
          const v=Math.max(0,Math.min(1,((x-st.x)*st.tx+(z-st.z)*st.tz)/span));
          const looseU=(lateral-st.halfFloor-st.bank)/(corridor.bermWidth*.9);
          const loose=(side>0?st.bermPlus:st.bermMinus)>0&&looseU>=0&&looseU<=1?SpoilLift(x,z,looseU,CrustTaper(v,ends)):0;
          return groundAt(x,z)+Math.max(0,loose,CrustLift(x,z,u,CrustTaper(v,ends),st.s+span*v));
        };
        if (random() < Style.clodChance) {
          const radius = Range(random, Style.clodRadiusM), relief = Range(random, Style.clodReliefM);
          Clod(center, radius, relief, random,false,dressAt);
        }
        // Several sizes of embedded aggregates give the excavation real relief.
        // Jitter across the entire bank; small crumbs collect at its foot.
        for(let n=0;n<Style.bankClods;n++) {
          const at=Point(st.halfFloor+st.bank*(.08+random()*.92),(random()-.5)*1.35);
          Clod(at,Range(random,Style.clodRadiusM),Range(random,Style.clodReliefM),random,false,dressAt);
        }
        for(let n=0;n<Style.crumbs;n++) {
          const at=Point(st.halfFloor*(.55+random()*.5)+st.bank*random()*.35,(random()-.5)*1.5);
          Clod(at,.025+random()*.065,.015+random()*.045,random);
        }
        // A broken, root-bound crown interrupts the long straight heightfield edge.
        for (let n = 0; n < Style.lipClods; n++) {
          if(random()>.55+.45*ValueNoise2(cx*.7,cz*.7,602))continue;
          const lip = Point(st.halfFloor + st.bank * (0.90 + random() * 0.34), (random() - 0.5) * 1.6);
          // Many small crumbs connect the occasional large torn chunk. Uniform
          // radii produced a few boulders sitting on an otherwise smooth crown.
          const radius=Style.lipRadiusM[0]+(Style.lipRadiusM[1]-Style.lipRadiusM[0])*Math.pow(random(),2);
          if (lip.y - floor > 0.8) Clod(lip,radius,Range(random,Style.lipReliefM),random,true,dressAt);
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
            for(const point of [a,b,c])point.y=dressAt(point.x,point.z)+.012;
            RootPiece(a, b, Style.rootRadiusM * (0.6 + random() * 0.6));
            RootPiece(b, c, Style.rootRadiusM * 0.48);
            stats.roots++;
          }
        }
      }
    }
  }
  shape.dispose();
  return stats;
}
