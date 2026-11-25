import { FLOW_RENDERING } from "../Data_Tuning_LevelFlow.mjs";
import { VisibleEncounterObject } from "./Script_LevelFlowView.mjs";
import { MakeRailwayProfile, GapsToRuns, SampleRun } from "../Script_RoadPath.mjs";

const shadowGeometries=new WeakMap();
const railwayChunkCache=new WeakMap();

export function CachedEncounterShadows(map,signals,ground) {
  const key=JSON.stringify([...signals]);
  let cached=shadowGeometries.get(map);
  if(!cached||cached.key!==key||cached.objects!==map.objects||cached.farObjects!==map.farObjects||cached.terrain!==map.terrain) {
    cached={key,objects:map.objects,farObjects:map.farObjects,terrain:map.terrain,
      vertices:EncounterShadowGeometry([...map.objects,...map.farObjects],signals,ground)};
    shadowGeometries.set(map,cached);
  }
  return cached.vertices;
}

export function EncounterBoxGeometry(x,y,z,w,h,d,yaw=0) {
  const cosine=Math.cos(yaw),sine=Math.sin(yaw);
  const Point=(dx,dy,dz)=>[x+dx*cosine+dz*sine,y+dy,z-dx*sine+dz*cosine];
  const bottom=[Point(-w/2,0,-d/2),Point(w/2,0,-d/2),Point(w/2,0,d/2),Point(-w/2,0,d/2)];
  const top=bottom.map(point=>[point[0],point[1]+h,point[2]]);
  return {x,y,z,w,h,d,yaw,cosine,sine,bottom,top,points:[...bottom,...top],
    faces:[[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]],
    normals:[[0,0,-1],[1,0,0],[0,0,1],[-1,0,0],[0,1,0]].map(([nx,ny,nz])=>[nx*cosine+nz*sine,ny,-nx*sine+nz*cosine])};
}

export function ShadeEncounterFace(color,normal) {
  const sun=FLOW_RENDERING.sky.sunDirection,length=Math.hypot(...sun);
  const diffuse=Math.max(0,normal.reduce((sum,value,axis)=>sum+value*sun[axis]/length,0));
  const light=FLOW_RENDERING.lighting.ambient+FLOW_RENDERING.lighting.direct*diffuse;
  return [1,3,5].map(index=>parseInt(color.slice(index,index+2),16)*light);
}

// Include offscreen walls and roofs, so a doorway or an interior stays shaded
// when its occluder leaves the camera. Event visibility uses the drawing rules.
export function EncounterShadowGeometry(objects,signals,ground) {
  const vertices=[];
  for(const object of objects) {
    if(!VisibleEncounterObject(object,signals)||object.material==="Whitebox/Water"||object.meta?.obstacle==="barbedWire") continue;
    const [x,y,z]=object.pos,[w,h,d]=object.size||[1,1,1];
    if(h<0.15||Math.max(w,h,d)<0.4) continue;
    const base=(object.planning?ground([x,z]):Number.isFinite(y)?y:ground([x,z]))+(object.params?.lift||0);
    const yaw=(object.yawDeg||0)*Math.PI/180,tree=FLOW_RENDERING.tree;
    const boxes=[];
    if(object.material==="Whitebox/Foliage"&&h>=tree.minHeightM) {
      const crown=Math.min(tree.crownMaxM,h*tree.crownWidthRatio);
      boxes.push(EncounterBoxGeometry(x,base,z,Math.min(w,tree.trunkMaxM),h,Math.min(d,tree.trunkMaxM),yaw));
      boxes.push(EncounterBoxGeometry(x,base+h*tree.crownBaseRatio,z,Math.max(w,crown),h*(1-tree.crownBaseRatio),Math.max(d,crown),yaw));
    } else {
      const separation=object.material==="Whitebox/Roof"?FLOW_RENDERING.roofSurfaceSeparationM:0;
      boxes.push(EncounterBoxGeometry(x,base,z,w+separation*2,h+separation,d+separation*2,yaw));
    }
    for(const box of boxes) for(const [a,b,c,d] of box.faces) for(const index of [a,b,c,a,c,d]) vertices.push(...box.points[index]);
  }
  return new Float32Array(vertices);
}

// ---------------------------------------------------------------------------
// 3D PCG 铁路网格分块烘焙（WebGL2 常驻 WorldBatch，与 Three.js BuildRailwayFromSpec 共用 MakeRailwayProfile）
// ---------------------------------------------------------------------------

function HexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function UnitNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function PushQuad(out, a, b, c, d, hex, lit, expectedNormal = null) {
  let n = UnitNormal(a, b, c);
  if (expectedNormal && (n[0] * expectedNormal[0] + n[1] * expectedNormal[1] + n[2] * expectedNormal[2]) < 0) {
    n = [-n[0], -n[1], -n[2]];
  }
  const rgb = lit ? ShadeEncounterFace(hex, n) : HexToRgb(hex);
  const r = rgb[0], g = rgb[1], bl = rgb[2];
  out.push(
    a[0], a[1], a[2], r, g, bl, 0, 0, 0,
    b[0], b[1], b[2], r, g, bl, 0, 0, 0,
    c[0], c[1], c[2], r, g, bl, 0, 0, 0,
    a[0], a[1], a[2], r, g, bl, 0, 0, 0,
    c[0], c[1], c[2], r, g, bl, 0, 0, 0,
    d[0], d[1], d[2], r, g, bl, 0, 0, 0,
  );
}

function PushOrientedBox(out, cx, baseY, cz, along, height, across, tx, tz, pitch, hex, lit, topHex = null) {
  const nx = tz, nz = -tx;
  const ha = along * 0.5, hw = across * 0.5;
  const sp = Math.sin(pitch), cp = Math.cos(pitch);
  const Pt = (u, y, v) => [
    cx + tx * (u * cp) + nx * v,
    baseY + y + u * sp,
    cz + tz * (u * cp) + nz * v,
  ];
  const b0 = Pt(-ha, 0, -hw), b1 = Pt(ha, 0, -hw), b2 = Pt(ha, 0, hw), b3 = Pt(-ha, 0, hw);
  const t0 = Pt(-ha, height, -hw), t1 = Pt(ha, height, -hw), t2 = Pt(ha, height, hw), t3 = Pt(-ha, height, hw);
  PushQuad(out, t0, t1, t2, t3, topHex || hex, lit, [0, 1, 0]);
  PushQuad(out, b0, b1, t1, t0, hex, lit, [-nx, 0, -nz]);
  PushQuad(out, b2, b3, t3, t2, hex, lit, [nx, 0, nz]);
  PushQuad(out, b1, b2, t2, t1, hex, lit, [tx, 0, tz]);
  PushQuad(out, b3, b0, t0, t3, hex, lit, [-tx, 0, -tz]);
}

function PushBandQuads(out, rowsA, rowsB, hex, lit, expected) {
  for (let i = 0; i < rowsA.length - 1; i += 1) {
    PushQuad(out, rowsA[i], rowsA[i + 1], rowsB[i + 1], rowsB[i], hex, lit, expected);
  }
}

export function CachedEncounterRailways(map, groundAt, lit = true) {
  const railways = map.railways;
  if (!railways?.length) return [];
  const sky = FLOW_RENDERING.skyBlend || 0;
  let cached = railwayChunkCache.get(map);
  if (cached && cached.railways === railways && cached.terrain === map.terrain && cached.lit === !!lit && cached.sky === sky) {
    return cached.chunks;
  }
  const chunks = [];
  const [bMinX, bMaxX, bMinZ, bMaxZ] = map.bounds || [-160, 320, -480, 990];
  const tiePalette = ["#6d543e", "#604935", "#765c45", "#584330"];
  const ChunkPush = (verts, xs, ys, zs) => {
    if (!verts.length) return;
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5, cz = (minZ + maxZ) * 0.5;
    const radius = Math.hypot(maxX - cx, maxY - cy, maxZ - cz) + 1.5;
    chunks.push({ center: [cx, cy, cz], radius, vertices: new Float32Array(verts) });
  };

  const groundXY = (x, z) => groundAt([x, z]);
  for (const spec of railways) {
    if (!Array.isArray(spec.points) || spec.points.length < 2) continue;
    const profile = MakeRailwayProfile(spec, groundXY);
    const path = profile.path;
    const gauge = spec.gauge ?? 1.50;
    const bed = { topHalf: 1.9, slope: 1.55, embed: 0.35, step: 4, chunkLen: 44, ...(spec.bed || {}) };
    const sleeper = { along: 0.23, h: 0.16, length: 2.54, lift: 0.0, spacing: 0.68, ...(spec.sleeper || {}) };
    const rail = { h: 0.14, lift: 0.16, footLift: 0.09, jointSpacing: 10, ...(spec.rail || {}) };
    const footLift = rail.footLift != null ? rail.footLift : (rail.lift - rail.h * 0.5);
    const sub = bed.subBallast || { ballastThick: 0.30, ballastSlope: 1.5, slope: 1.55 };

    // 1) 道砟棱体 + 高堤土质边坡（按 chunkLen 分块）
    if (spec.bed !== false) {
      for (const [a, b] of GapsToRuns(path.length, profile.bedGaps)) {
        const samples = SampleRun(path, a, b, bed.step || 4);
        const rows = samples.map((sm) => {
          const nx = sm.tz, nz = -sm.tx;
          const crownY = profile.CrownAt(sm.s);
          const thick = sub.ballastThick ?? 0.30;
          const bSlope = sub.ballastSlope ?? bed.slope;
          const eSlope = sub.slope ?? 1.55;
          const toeY = crownY - thick;
          const shHalf = bed.topHalf + thick * bSlope;
          const lsx = sm.x + nx * shHalf, lsz = sm.z + nz * shHalf;
          const rsx = sm.x - nx * shHalf, rsz = sm.z - nz * shHalf;
          const lGnd = groundAt([lsx, lsz]), rGnd = groundAt([rsx, rsz]);
          const lBallastDrop = Math.min(thick, Math.max(0.08, crownY - lGnd + 0.06));
          const rBallastDrop = Math.min(thick, Math.max(0.08, crownY - rGnd + 0.06));
          const lMidHalf = bed.topHalf + lBallastDrop * bSlope;
          const rMidHalf = bed.topHalf + rBallastDrop * bSlope;
          const lmx = sm.x + nx * lMidHalf, lmz = sm.z + nz * lMidHalf;
          const rmx = sm.x - nx * rMidHalf, rmz = sm.z - nz * rMidHalf;
          const BTL = [lmx, Math.max(groundAt([lmx, lmz]) - 0.08, crownY - lBallastDrop), lmz];
          const BTR = [rmx, Math.max(groundAt([rmx, rmz]) - 0.08, crownY - rBallastDrop), rmz];
          const lRem = Math.max(0, toeY - lGnd + bed.embed);
          const rRem = Math.max(0, toeY - rGnd + bed.embed);
          const lFullHalf = shHalf + lRem * eSlope;
          const rFullHalf = shHalf + rRem * eSlope;
          const lfx = sm.x + nx * lFullHalf, lfz = sm.z + nz * lFullHalf;
          const rfx = sm.x - nx * rFullHalf, rfz = sm.z - nz * rFullHalf;
          return {
            x: sm.x, z: sm.z, nx, nz, crownY,
            TL: [sm.x + nx * bed.topHalf, crownY, sm.z + nz * bed.topHalf],
            TR: [sm.x - nx * bed.topHalf, crownY, sm.z - nz * bed.topHalf],
            BTL, BTR,
            ETL: [lmx, BTL[1] + 0.03, lmz],
            ETR: [rmx, BTR[1] + 0.03, rmz],
            EBL: [lfx, groundAt([lfx, lfz]) - bed.embed, lfz],
            EBR: [rfx, groundAt([rfx, rfz]) - bed.embed, rfz],
            needEarth: Math.max(toeY - lGnd, toeY - rGnd) > -0.05,
          };
        });
        const per = Math.max(1, Math.round((bed.chunkLen || 44) / (bed.step || 4)));
        for (let i0 = 0; i0 < rows.length - 1; i0 += per) {
          const i1 = Math.min(i0 + per, rows.length - 1);
          const slice = rows.slice(i0, i1 + 1);
          const mid = slice[Math.floor(slice.length / 2)];
          const verts = [];
          const xs = [], ys = [], zs = [];
          const Record = (pt) => { xs.push(pt[0]); ys.push(pt[1]); zs.push(pt[2]); };
          for (const r of slice) { Record(r.TL); Record(r.TR); Record(r.BTL); Record(r.BTR); }
          PushBandQuads(verts, slice.map((r) => r.TL), slice.map((r) => r.TR), "#746f66", lit, [0, 1, 0]);
          PushBandQuads(verts, slice.map((r) => r.BTL), slice.map((r) => r.TL), "#615c53", lit, [mid.nx, 0.45, mid.nz]);
          PushBandQuads(verts, slice.map((r) => r.TR), slice.map((r) => r.BTR), "#615c53", lit, [-mid.nx, 0.45, -mid.nz]);
          if (slice.some((r) => r.needEarth)) {
            for (const r of slice) { Record(r.EBL); Record(r.EBR); }
            PushBandQuads(verts, slice.map((r) => r.EBL), slice.map((r) => r.ETL), "#988769", lit, [mid.nx, 0.4, mid.nz]);
            PushBandQuads(verts, slice.map((r) => r.ETR), slice.map((r) => r.EBR), "#988769", lit, [-mid.nx, 0.4, -mid.nz]);
          }
          ChunkPush(verts, xs, ys, zs);
        }
      }
    }

    // 2) 枕木 + 垫板 + 双钢轨（按 44 m 分块）
    const InGap = (gaps, s) => gaps.some(([g0, g1]) => s > g0 && s < g1);
    const chunkSpan = 44;
    for (let c0 = 0; c0 < path.length; c0 += chunkSpan) {
      const c1 = Math.min(path.length, c0 + chunkSpan);
      const verts = [], xs = [], ys = [], zs = [];
      const pm = path.At((c0 + c1) * 0.5);
      const inPlay = pm.x >= bMinX - 20 && pm.x <= bMaxX + 20 && pm.z >= bMinZ - 20 && pm.z <= bMaxZ + 20;
      // 远景段适度拉宽枕木步距，保视觉节律又省面数
      const tiePitch = inPlay ? (sleeper.spacing || 0.68) : Math.max(1.35, (sleeper.spacing || 0.68) * 2);
      const tieAlong = inPlay ? (sleeper.along || 0.23) : 0.34;
      const firstIdx = Math.ceil(c0 / tiePitch);
      for (let idx = firstIdx; ; idx += 1) {
        const s = idx * tiePitch;
        if (s >= c1 || s >= path.length) break;
        if (InGap(profile.sleeperGaps, s)) continue;
        const p = path.At(s);
        const cy = profile.CrownAt(s);
        const pitch = Math.atan(profile.SlopeAt(s));
        const tieBase = cy + (sleeper.lift ?? 0) - (sleeper.h || 0.16) * 0.5;
        const tieH = sleeper.h || 0.16;
        const col = tiePalette[idx & 3];
        PushOrientedBox(verts, p.x, tieBase, p.z, tieAlong, tieH, sleeper.length || 2.54, p.tx, p.tz, pitch, col, lit);
        xs.push(p.x - 1.5, p.x + 1.5); ys.push(tieBase, tieBase + tieH + 0.25); zs.push(p.z - 1.5, p.z + 1.5);
        if (inPlay) {
          const nx = p.tz, nz = -p.tx;
          const plateY = tieBase + tieH;
          for (const side of [-1, 1]) {
            const off = side * gauge * 0.5;
            PushOrientedBox(verts, p.x + nx * off, plateY, p.z + nz * off, 0.21, 0.016, 0.24, p.tx, p.tz, pitch, "#35312d", lit);
          }
        }
      }
      // 钢轨（在当前分块内裁出连续段：轨底/轨腰暗钢 + 轨顶亮钢反光带）
      for (const [ra, rb] of GapsToRuns(path.length, profile.railGaps)) {
        const s0 = Math.max(c0, ra), s1 = Math.min(c1, rb);
        if (s1 - s0 < 0.2) continue;
        const samples = SampleRun(path, s0, s1, inPlay ? 4 : 8);
        for (const side of [-1, 1]) {
          const off = side * gauge * 0.5;
          const fl = [], fr = [], hl = [], hr = [], tl = [], tr = [];
          for (const sm of samples) {
            const nx = sm.tz, nz = -sm.tx;
            const yFoot = profile.CrownAt(sm.s) + footLift;
            const yHead = yFoot + rail.h;
            const yTop = yHead + 0.004;
            fl.push([sm.x + nx * (off - 0.062), yFoot, sm.z + nz * (off - 0.062)]);
            fr.push([sm.x + nx * (off + 0.062), yFoot, sm.z + nz * (off + 0.062)]);
            hl.push([sm.x + nx * (off - 0.038), yHead, sm.z + nz * (off - 0.038)]);
            hr.push([sm.x + nx * (off + 0.038), yHead, sm.z + nz * (off + 0.038)]);
            tl.push([sm.x + nx * (off - 0.036), yTop, sm.z + nz * (off - 0.036)]);
            tr.push([sm.x + nx * (off + 0.036), yTop, sm.z + nz * (off + 0.036)]);
            xs.push(sm.x + nx * off); ys.push(yFoot, yTop); zs.push(sm.z + nz * off);
          }
          const midSm = samples[Math.floor(samples.length / 2)];
          const mnx = midSm.tz, mnz = -midSm.tx;
          // 轨底/轨腹两侧（暗油锈钢）
          PushBandQuads(verts, fl, hl, "#4a4540", lit, [-mnx, 0.25, -mnz]);
          PushBandQuads(verts, hr, fr, "#4a4540", lit, [mnx, 0.25, mnz]);
          // 轨顶磨耗亮钢面（高空俯视也能一眼读出清晰双轨反光！）
          PushBandQuads(verts, tl, tr, "#dce3e8", lit, [0, 1, 0]);
        }
      }
      ChunkPush(verts, xs, ys, zs);
    }
  }
  railwayChunkCache.set(map, { railways, terrain: map.terrain, lit: !!lit, sky, chunks });
  return chunks;
}
