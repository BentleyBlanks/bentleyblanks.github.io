// Reference 07: broken earth banks with embedded clods and sparse hanging roots.
// Everything samples the host heightfield; no extra colliders or walkable floors.
import * as THREE from "three";
import { HashString, Mulberry32, ValueNoise2 } from "./Script_Noise.mjs";
import { TRENCH_APPEARANCE as Style } from "./Data_TrenchAppearance.mjs";

export function BuildTrenchEarth(sink, plan, groundAt, { earth = "ground", roots = "TrenchRoots" } = {}) {
  const stats = { clods: 0, roots: 0, triangles: 0 };
  const shape = new THREE.IcosahedronGeometry(1, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(), middle = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const occupied = new Set();
  const Range = (random, limits) => limits[0] + random() * (limits[1] - limits[0]);
  const Add = (key, geometry) => {
    stats.triangles += (geometry.index?.count || geometry.attributes.position.count) / 3;
    sink.Add(key, geometry);
  };
  const Clod = (center, radius, relief, random) => {
    const geometry = shape.clone();
    geometry.rotateY(random() * Math.PI * 2);
    const p = geometry.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const x = center.x + p.getX(v) * radius;
      const z = center.z + p.getZ(v) * radius * 1.45;
      p.setXYZ(v, x, groundAt(x, z) + p.getY(v) * relief - relief * 0.25, z);
    }
    geometry.computeVertexNormals();
    Add(earth, geometry); stats.clods++;
  };
  const Crust = (st, side, along) => {
    const positions=[],uvs=[],indices=[],cols=6,rows=6;
    for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++) {
      const u=col/cols,v=row/rows;
      const lateral=st.halfFloor+st.bank*(.03+u*.58),tangent=along+(v-.5)*1.3;
      const x=st.x+st.nx*side*lateral+st.tx*tangent,z=st.z+st.nz*side*lateral+st.tz*tangent;
      const edge=Math.sin(u*Math.PI)*Math.sin(v*Math.PI);
      const ridge=ValueNoise2(x*3.7,z*3.7,71),grain=ValueNoise2(x*13.1,z*13.1,93);
      const lift=edge*(.04+Style.crustReliefM*ridge+.04*grain)-.008;
      positions.push(x,groundAt(x,z)+lift,z);uvs.push(u,v);
    }
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++) {
      const a=row*(cols+1)+col,b=a+cols+1;
      if(side>0)indices.push(a,a+1,b,a+1,b+1,b);else indices.push(a,b,a+1,a+1,b,b+1);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    Add(earth,geometry);
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
    Add(roots, geometry);
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
        Crust(st,side,along);
        if (random() < Style.clodChance) {
          const radius = Range(random, Style.clodRadiusM), relief = Range(random, Style.clodReliefM);
          Clod(center, radius, relief, random);
        }
        // Several sizes of embedded aggregates give the excavation real relief.
        // Jitter across the entire bank; small crumbs collect at its foot.
        for(let n=0;n<Style.bankClods;n++) {
          const at=Point(st.halfFloor+st.bank*(.08+random()*.92),(random()-.5)*1.35);
          Clod(at,Range(random,Style.clodRadiusM),Range(random,Style.clodReliefM),random);
        }
        for(let n=0;n<Style.crumbs;n++) {
          const at=Point(st.halfFloor*(.55+random()*.5)+st.bank*random()*.35,(random()-.5)*1.5);
          Clod(at,.025+random()*.065,.015+random()*.045,random);
        }
        // A broken, root-bound crown interrupts the long straight heightfield edge.
        for (let n = 0; n < Style.lipClods; n++) {
          const lip = Point(st.halfFloor + st.bank * (0.85 + random() * 0.28), (random() - 0.5) * 0.9);
          if (lip.y - floor > 0.8) Clod(lip, Range(random, Style.lipRadiusM), Range(random, Style.lipReliefM), random);
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
