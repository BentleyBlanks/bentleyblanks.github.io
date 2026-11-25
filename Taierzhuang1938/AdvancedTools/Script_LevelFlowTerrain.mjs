import { DecodeSceneHeights } from "../Script_SceneDoc.mjs";
import { GridSampler, DecodeTrenchDatum, CompileSceneTrenches } from "../Script_SceneTrenches.mjs";
import { Clamp, SegmentDistance, InsidePolygon } from "./Script_LevelFlowGeometry.mjs";
import { FLOW_RENDERING, FLOW_FIELD_COLORS } from "../Data_Tuning_LevelFlow.mjs";
import { SceneSurfaceSampler } from "../Script_SceneSurface.mjs";
import { BuildGroundPaint, HydrateGroundPaint, RasterizeBackdropPaint } from "../Script_EditorBlockoutLevels.mjs";
import { MakeRoadPath, SampleRun } from "../Script_RoadPath.mjs";

const ROAD_TIER_ORDER = { footpath: 0, villageAlley: 1, villageStreet: 2, guandao: 3 };
const SmoothStep = (edge0, edge1, x) => {
  const t = Clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const MixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function InferRoadKind(road) {
  if (road.kind) return road.kind;
  const w = road.width || 3;
  if (w >= 4.0) return "guandao";
  if (w >= 2.4) return "villageStreet";
  return "villageAlley";
}

function BuildSplineRoadPaint(roads, footpaths, floors, bounds, { cellM: startCellM, maxCells }) {
  const minX = bounds.minX, maxX = bounds.maxX, minZ = bounds.minZ, maxZ = bounds.maxZ;
  if (!(maxX > minX && maxZ > minZ)) return null;
  let cellM = startCellM;
  while (((maxX - minX) / cellM + 1) * ((maxZ - minZ) / cellM + 1) > maxCells) cellM *= 2;
  const cols = Math.ceil((maxX - minX) / cellM) + 1;
  const rows = Math.ceil((maxZ - minZ) / cellM) + 1;
  const total = cols * rows;
  const C = new Float32Array(total * 3);
  const A = new Float32Array(total);
  // Floors (courtyard yards / threshing pockets) first so roads blend cleanly over edges
  if (floors && floors.length) {
    const floorPaint = BuildGroundPaint(
      floors.map((floor) => ({ poly: floor.points.map(([x, z]) => ({ x, z })), feather: 0.6, color: "#cfc1a1", strength: 0.92 })),
      bounds, { cellM, maxCells: total + 16 },
    );
    if (floorPaint) {
      const rgb = [0, 0, 0];
      for (let j = 0; j < rows; j++) {
        const z = minZ + j * cellM;
        for (let i = 0; i < cols; i++) {
          const x = minX + i * cellM;
          rgb[0] = 0; rgb[1] = 0; rgb[2] = 0;
          const a = floorPaint.Blend(x, z, rgb);
          if (a > 1e-4) {
            const at = j * cols + i;
            A[at] = a;
            C[at * 3] = rgb[0];
            C[at * 3 + 1] = rgb[1];
            C[at * 3 + 2] = rgb[2];
          }
        }
      }
    }
  }
  const entries = [
    ...(footpaths || []).map((pts, idx) => ({
      id: `Footpath_${idx}`,
      kind: "footpath",
      points: pts,
      width: 1.05,
      widthJitter: 0.14,
    })),
    ...(roads || []).map((road, idx) => ({
      id: road.id || `Road_${idx}`,
      kind: InferRoadKind(road),
      points: road.points,
      width: road.width || 3.2,
      widthJitter: road.widthJitter ?? (InferRoadKind(road) === "guandao" ? 0.06 : 0.05),
    })),
  ].filter((e) => Array.isArray(e.points) && e.points.length >= 2);
  entries.sort((a, b) => (ROAD_TIER_ORDER[a.kind] ?? 2) - (ROAD_TIER_ORDER[b.kind] ?? 2));

  const stamp = new Int32Array(total);
  const minDist = new Float32Array(total);
  const bestS = new Float32Array(total);
  const bestHalf = new Float32Array(total);
  const touched = [];

  // 1938 Lunan earth-road palette (sRGB 0–1)
  const COL_GUANDAO_CROWN = [0.77, 0.71, 0.57];
  const COL_GUANDAO_RURAL = [0.69, 0.67, 0.51];
  const COL_GUANDAO_RUT = [0.56, 0.49, 0.37];
  const COL_GUANDAO_EDGE = [0.72, 0.65, 0.51];
  const COL_GUANDAO_VERGE = [0.60, 0.59, 0.44];
  const COL_STREET_CORE = [0.62, 0.55, 0.43];
  const COL_STREET_BODY = [0.74, 0.68, 0.56];
  const COL_STREET_EDGE = [0.69, 0.63, 0.51];
  const COL_ALLEY_CORE = [0.62, 0.56, 0.44];
  const COL_ALLEY_EDGE = [0.70, 0.64, 0.53];
  const COL_PATH_CORE = [0.58, 0.50, 0.37];
  const COL_PATH_VERGE = [0.55, 0.58, 0.41];

  let roadId = 0;
  for (const entry of entries) {
    let path;
    try {
      path = MakeRoadPath(entry.points);
    } catch {
      continue;
    }
    const samples = SampleRun(path, 0, path.length, 1.4);
    if (samples.length < 2) continue;
    roadId += 1;
    touched.length = 0;
    const baseHalf = Math.max(0.35, entry.width * 0.5);
    const jitterAmp = entry.widthJitter || 0;
    const seed = [...String(entry.id)].reduce((acc, ch) => ((acc * 31 + ch.charCodeAt(0)) >>> 0), 17) * 0.001;
    const HalfAt = (s) => baseHalf * (1 + jitterAmp * (0.65 * Math.sin(s * 0.21 + seed) + 0.35 * Math.cos(s * 0.47 - seed * 1.7)));
    const reachScale = entry.kind === "footpath" ? 1.45 : 1.32;

    for (let k = 0; k < samples.length - 1; k++) {
      const a = samples[k], b = samples[k + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-6) continue;
      const segLen = Math.sqrt(len2);
      const midHalf = HalfAt((a.s + b.s) * 0.5);
      const pad = midHalf * reachScale + cellM;
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - pad - minX) / cellM));
      const i1 = Math.min(cols - 1, Math.ceil((Math.max(a.x, b.x) + pad - minX) / cellM));
      const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - pad - minZ) / cellM));
      const j1 = Math.min(rows - 1, Math.ceil((Math.max(a.z, b.z) + pad - minZ) / cellM));
      for (let j = j0; j <= j1; j++) {
        const z = minZ + j * cellM;
        const rowOff = j * cols;
        for (let i = i0; i <= i1; i++) {
          const x = minX + i * cellM;
          const u = Clamp(((x - a.x) * dx + (z - a.z) * dz) / len2, 0, 1);
          const px = a.x + dx * u, pz = a.z + dz * u;
          const dist = Math.hypot(x - px, z - pz);
          const s = a.s + segLen * u;
          const half = HalfAt(s);
          if (dist > half * reachScale) continue;
          const at = rowOff + i;
          if (stamp[at] !== roadId) {
            stamp[at] = roadId;
            minDist[at] = dist;
            bestS[at] = s;
            bestHalf[at] = half;
            touched.push(at);
          } else if (dist < minDist[at]) {
            minDist[at] = dist;
            bestS[at] = s;
            bestHalf[at] = half;
          }
        }
      }
    }

    for (let idx = 0; idx < touched.length; idx++) {
      const at = touched[idx];
      const dist = minDist[at];
      const half = bestHalf[at];
      const s = bestS[at];
      const t = dist / half;
      const j = Math.floor(at / cols);
      const i = at - j * cols;
      const z = minZ + j * cellM;
      const mottle = 0.035 * Math.sin(s * 0.85 + dist * 2.4 + seed) + 0.022 * Math.cos(s * 2.1 - dist * 3.8);

      let rgb, alpha;
      if (entry.kind === "guandao") {
        // Dual compacted wooden-cart wheel ruts around t ≈ 0.50 + slight rural grass crown + feathered verge
        const rural = (z < 474 || z > 735) ? 1 : 0;
        const centerCol = rural ? MixRgb(COL_GUANDAO_CROWN, COL_GUANDAO_RURAL, 0.42) : COL_GUANDAO_CROWN;
        const rutFactor = Math.exp(-Math.pow((t - 0.50) / 0.16, 2));
        const edgeMix = SmoothStep(0.70, 0.96, t);
        const vergeMix = SmoothStep(0.92, 1.24, t);
        rgb = MixRgb(centerCol, COL_GUANDAO_EDGE, edgeMix);
        rgb = MixRgb(rgb, COL_GUANDAO_RUT, rutFactor * 0.82);
        if (vergeMix > 0) rgb = MixRgb(rgb, COL_GUANDAO_VERGE, vergeMix * (rural ? 0.78 : 0.42));
        alpha = (1 - SmoothStep(0.88, 1.30, t)) * 0.95;
      } else if (entry.kind === "villageStreet") {
        const trackFactor = Math.exp(-Math.pow(t / 0.42, 2));
        const edgeMix = SmoothStep(0.75, 1.15, t);
        rgb = MixRgb(COL_STREET_BODY, COL_STREET_CORE, trackFactor * 0.58);
        rgb = MixRgb(rgb, COL_STREET_EDGE, edgeMix * 0.65);
        alpha = (1 - SmoothStep(0.84, 1.26, t)) * 0.90;
      } else if (entry.kind === "villageAlley") {
        const edgeMix = SmoothStep(0.50, 1.10, t);
        rgb = MixRgb(COL_ALLEY_CORE, COL_ALLEY_EDGE, edgeMix * 0.75);
        alpha = (1 - SmoothStep(0.78, 1.24, t)) * 0.86;
      } else {
        // Narrow trodden rural dirt footpath with trampled grass/earth verge and subtle organic break-up
        const vergeMix = SmoothStep(0.42, 1.05, t);
        rgb = MixRgb(COL_PATH_CORE, COL_PATH_VERGE, vergeMix);
        const organic = 0.84 + 0.16 * Math.sin(s * 0.65 + seed * 3.1);
        alpha = (1 - SmoothStep(0.55, 1.42, t)) * 0.84 * organic;
      }

      if (alpha <= 1e-3) continue;
      const r = Clamp(rgb[0] + mottle, 0, 1);
      const g = Clamp(rgb[1] + mottle * 0.92, 0, 1);
      const b = Clamp(rgb[2] + mottle * 0.78, 0, 1);
      A[at] = A[at] * (1 - alpha) + alpha;
      C[at * 3] = C[at * 3] * (1 - alpha) + r * alpha;
      C[at * 3 + 1] = C[at * 3 + 1] * (1 - alpha) + g * alpha;
      C[at * 3 + 2] = C[at * 3 + 2] * (1 - alpha) + b * alpha;
    }
  }
  return HydrateGroundPaint({ cellM, minX, minZ, cols, rows, C, A });
}

function LowerBound(values,target) {
  let low=0,high=values.length;
  while(low<high) {const middle=(low+high)>>>1;if(values[middle]<target) low=middle+1;else high=middle;}
  return low;
}

export function BuildEncounterTerrain(scene,heightBytes,datumBytes,map,prepared=null) {
  const pre=DecodeSceneHeights(heightBytes,scene.terrain),preAt=GridSampler(scene.terrain,pre);
  const datum=scene.trenches?.datum&&datumBytes?DecodeTrenchDatum(scene.trenches.datum,datumBytes):[];
  const plan=CompileSceneTrenches(scene.trenches,{datum,pre:preAt});
  const bounds=scene.bounds,backdrop=scene.backdrop?.ground||{y:-2.74,blendM:160};
  const paintSettings={cellM:FLOW_RENDERING.terrainSurface.texelM,maxCells:FLOW_RENDERING.terrainSurface.maxPixels};
  const groundPaint = prepared?HydrateGroundPaint(prepared.groundPaint):BuildGroundPaint(scene.paint, bounds, paintSettings);
  const backdropPaint = prepared?prepared.backdropPaint:RasterizeBackdropPaint(scene.backdrop, FLOW_RENDERING.backdropPaint);
  const localBackdropPaint = prepared?prepared.localBackdropPaint:RasterizeBackdropPaint(scene.backdrop, {
    maxPx:FLOW_RENDERING.terrainSurface.maxTexturePx, minTexelM:FLOW_RENDERING.terrainSurface.texelM,
    padM:FLOW_RENDERING.terrainSurface.paddingM, bounds,
  });
  const fieldColors = Object.fromEntries(Object.entries(FLOW_FIELD_COLORS).map(([kind, hex]) =>
    [kind, [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)]));
  const fields = (map.fields || []).map(field => ({...field,
    cosine:Math.cos(field.angleDeg * Math.PI / 180), sine:Math.sin(field.angleDeg * Math.PI / 180),
    polygon:map.fieldZones.find(zone => zone.id === field.zone).poly}));
  const routePaint = prepared
    ? HydrateGroundPaint(prepared.routePaint)
    : BuildSplineRoadPaint(map.roads, map.footpaths, map.floors, bounds, paintSettings);
  const SurfaceColorAt = (x, z) => {
    const color = [198 / 255, 207 / 255, 169 / 255];
    const paint = localBackdropPaint && x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ
      ? localBackdropPaint : backdropPaint;
    if (paint) {
      const { minX, minZ, texelM, width, height, data } = paint;
      const gx = (x - minX) / texelM - 0.5, gz = (z - minZ) / texelM - 0.5;
      const column = Math.floor(gx), row = Math.floor(gz);
      if (column >= 0 && column < width - 1 && row >= 0 && row < height - 1) {
        const u = gx - column, v = gz - row;
        let alpha = 0;
        const premultiplied = [0, 0, 0];
        for (const [dx, dz, weight] of [[0,0,(1-u)*(1-v)],[1,0,u*(1-v)],[0,1,(1-u)*v],[1,1,u*v]]) {
          const offset = ((row + dz) * width + column + dx) * 4, coverage = data[offset + 3] / 255 * weight;
          alpha += coverage;
          for (let axis = 0; axis < 3; axis++) premultiplied[axis] += data[offset + axis] / 255 * coverage;
        }
        for (let axis = 0; axis < 3; axis++) color[axis] = color[axis] * (1 - alpha) + premultiplied[axis];
      }
    }
    for (const field of fields) {
      const dx = x - field.x, dz = z - field.z;
      const u = dx * field.cosine - dz * field.sine, v = dx * field.sine + dz * field.cosine;
      if (Math.abs(u) > field.w / 2 || Math.abs(v) > field.d / 2 || !InsidePolygon([x,z], field.polygon)) continue;
      const strip = field.strips.find(strip => u >= strip.from && u < strip.to) || field.strips.at(-1);
      const base = fieldColors[strip.kind] || fieldColors.fallow;
      if (field.zone.startsWith("Merged")) {
        const edgeDist = Math.min(u - strip.from, strip.to - u, field.w / 2 - Math.abs(u), field.d / 2 - Math.abs(v));
        if (edgeDist < 0.28) {
          // Narrow warm-earth field bund (田埂) separating Lunan strip plots
          color.splice(0, 3, 0.63, 0.56, 0.44);
        } else {
          let shade = 1;
          if (strip.kind === "wheatRich" || strip.kind === "wheatSparse") {
            const bedPos = ((u - strip.from) % 2.0 + 2.0) % 2.0;
            shade = bedPos < 0.28 ? 1.055 : (0.97 + 0.03 * Math.sin(u * 3.1));
          } else if (strip.kind === "plowedFresh") {
            shade = 0.945 + 0.055 * Math.sin(u * 4.2);
          } else if (strip.kind === "garden") {
            const gx = ((u - strip.from) % 2.2 + 2.2) % 2.2;
            const gz = ((v + field.d / 2) % 4.5 + 4.5) % 4.5;
            shade = (gx < 0.28 || gz < 0.28) ? 1.09 : 0.985;
          } else if (strip.kind === "stubble") {
            shade = 0.975 + 0.025 * Math.sin(u * 2.5 + v * 0.35);
          }
          color.splice(0, 3, Math.min(1, base[0] * shade), Math.min(1, base[1] * shade), Math.min(1, base[2] * shade));
        }
      } else {
        color.splice(0, 3, ...base);
      }
      break;
    }
    groundPaint?.Blend(x, z, color);
    routePaint?.Blend(x, z, color);
    return color.map(channel => channel * 255);
  };
  const SceneHeightAt=(x,z)=>{
    const edgeX=Clamp(x,bounds.minX,bounds.maxX),edgeZ=Clamp(z,bounds.minZ,bounds.maxZ);
    const distance=Math.hypot(x-edgeX,z-edgeZ);
    const height=preAt(edgeX,edgeZ);
    if(distance>0) {
      const blend=Clamp(distance/(backdrop.blendM||160),0,1),smooth=blend*blend*(3-2*blend);
      return height+(backdrop.y-height)*smooth;
    }
    return plan?plan.Apply(x,z,height,plan.natural?plan.natural(x,z):height):height;
  };
  const lane=map.trenches.find(trench=>trench.id==="SunkenLane");
  const PocketHeight=(z)=>{
    const points=lane.points;
    for(let index=1;index<points.length;index++) if(points[index][1]>=z) {
      const a=points[index-1],b=points[index],t=Clamp((z-a[1])/Math.max(0.001,b[1]-a[1]),0,1);
      return SceneHeightAt(a[0]+(b[0]-a[0])*t,z);
    }
    return SceneHeightAt(...points.at(-1));
  };
  const PocketsAt=(x,z)=>{
    let height=SceneHeightAt(x,z);
    for(const pocket of map.planningPockets||[]) {
      const [minX,maxX,minZ,maxZ]=pocket.box;
      const distance=Math.hypot(x-Clamp(x,minX,maxX),z-Clamp(z,minZ,maxZ));
      if(distance>=1.5) continue;
      const blend=Clamp(distance/1.5,0,1),target=PocketHeight(Clamp(z,minZ,maxZ));
      height=Math.min(height,target+(height-target)*blend*blend*(3-2*blend));
    }
    return height;
  };
  const ramps=(map.ramps||[]).map(ramp=>{
    const lengths=[0];
    for(let index=1;index<ramp.points.length;index++) lengths.push(lengths.at(-1)+Math.hypot(ramp.points[index][0]-ramp.points[index-1][0],ramp.points[index][1]-ramp.points[index-1][1]));
    return {...ramp,lengths,from:PocketsAt(...ramp.points[0]),to:PocketsAt(...ramp.points.at(-1))};
  });
  const LegacyHeightAt=(x,z)=>{
    let height=PocketsAt(x,z),nearest=Infinity;
    for(const ramp of ramps) for(let index=1;index<ramp.points.length;index++) {
      const a=ramp.points[index-1],b=ramp.points[index],length=ramp.lengths[index]-ramp.lengths[index-1];
      const t=Clamp(((x-a[0])*(b[0]-a[0])+(z-a[1])*(b[1]-a[1]))/(length*length),0,1);
      const distance=Math.hypot(x-a[0]-(b[0]-a[0])*t,z-a[1]-(b[1]-a[1])*t);
      if(distance>=ramp.width/2+1||distance>=nearest) continue;
      nearest=distance;
      const progress=(ramp.lengths[index-1]+t*length)/ramp.lengths.at(-1),target=ramp.from+(ramp.to-ramp.from)*progress;
      const blend=Clamp(distance-ramp.width/2,0,1);
      height=target+(PocketsAt(x,z)-target)*blend*blend*(3-2*blend);
    }
    return height;
  };
  const HeightAt=scene.surface?SceneSurfaceSampler(scene.surface,SceneHeightAt):LegacyHeightAt;
  const interest=[];
  for(const corridor of [...map.trenches,...ramps,...(map.planningPockets||[]).map(pocket=>{
    const [minX,maxX,minZ,maxZ]=pocket.box;return {width:3,points:[[minX,minZ],[maxX,minZ],[maxX,maxZ],[minX,maxZ],[minX,minZ]]};
  }),...(scene.trenches?.segments||[]).map((segment)=>({points:segment.points,width:segment.floorW||4}))]) {
    for (let index = 1; index < corridor.points.length; index++) {
      const a = corridor.points[index - 1], b = corridor.points[index], reach = corridor.width / 2 + 3;
      interest.push({a, b, reach, colorBounds:[
        Math.min(a[0], b[0]) - reach - 1, Math.max(a[0], b[0]) + reach + 1,
        Math.min(a[1], b[1]) - reach - 1, Math.max(a[1], b[1]) + reach + 1,
      ]});
    }
  }
  // Native mesh positions and normal probes lie on an eighth-metre grid.
  // Numeric keys avoid allocating coordinate strings on each cold camera turn.
  const GridKey=(x,z)=>{
    const ix=x*8,iz=z*8;
    return Number.isInteger(ix)&&Number.isInteger(iz)&&Math.abs(ix)<65536&&Math.abs(iz)<65536
      ?ix*131072+iz:`${x},${z}`;
  };
  const radius=6144,rootSize=256,rootColumns=2*radius/rootSize;
  const PreparedHeight=(x,z)=>{
    if(!prepared||x< -radius||z< -radius||x>=radius||z>=radius) return undefined;
    const data=prepared.nodes;
    let node=Math.floor((z+radius)/rootSize)*rootColumns+Math.floor((x+radius)/rootSize);
    while(node>=0) {
      const at=node*15,left=data[at],top=data[at+1],half=data[at+2]/2;
      const dx=x-left,dz=z-top;
      if(dx===half&&dz===half) return data[at+13];
      if((dx===0||dx===half*2)&&(dz===0||dz===half*2)) return data[at+9+(dz===0?(dx===0?0:1):(dx===0?3:2))];
      const first=data[at+8];
      if(first<0) return undefined;
      node=first+(dz<half?(dx<half?0:1):(dx<half?3:2));
    }
  };
  const sampleCache=new Map();
  const Sample=(x,z)=>{
    const key=GridKey(x,z),cached=sampleCache.get(key);
    if(cached!==undefined) return cached;
    const value=PreparedHeight(x,z)??HeightAt(x,z);
    sampleCache.set(key,value);return value;
  };
  const cells=[];
  const NeedsReliefDetail = (x, z, size) => {
    const grid = scene.terrain;
    const firstColumn = Math.max(0, Math.ceil((x - grid.minX) / grid.cellM));
    const lastColumn = Math.min(grid.cols, Math.floor((x + size - grid.minX) / grid.cellM));
    const firstRow = Math.max(0, Math.ceil((z - grid.minZ) / grid.cellM));
    const lastRow = Math.min(grid.rows, Math.floor((z + size - grid.minZ) / grid.cellM));
    const a = preAt(x,z), b = preAt(x+size,z), c = preAt(x,z+size), d = preAt(x+size,z+size);
    for (let row = firstRow; row <= lastRow; row++) {
      const v = (grid.minZ + row * grid.cellM - z) / size;
      for (let column = firstColumn; column <= lastColumn; column++) {
        const u = (grid.minX + column * grid.cellM - x) / size;
        const expected = (a + (b-a) * u) * (1-v) + (c + (d-c) * u) * v;
        if (Math.abs(pre[row * (grid.cols + 1) + column] - expected) > FLOW_RENDERING.terrainHeightErrorM) return true;
      }
    }
    return false;
  };
  const Refine=(x,z,size)=>{
    const half=size/2,cx=x+half,cz=z+half;
    const near=interest.some((segment)=>{
      if(cx<Math.min(segment.a[0],segment.b[0])-half-segment.reach||cx>Math.max(segment.a[0],segment.b[0])+half+segment.reach
        ||cz<Math.min(segment.a[1],segment.b[1])-half-segment.reach||cz>Math.max(segment.a[1],segment.b[1])+half+segment.reach) return false;
      return SegmentDistance([cx,cz],segment.a,segment.b)<size*0.71+segment.reach;
    });
    const inScene=x+size>=bounds.minX&&x<=bounds.maxX&&z+size>=bounds.minZ&&z<=bounds.maxZ;
    const center=Sample(cx,cz);
    const corners=[Sample(x,z),Sample(x+size,z),Sample(x+size,z+size),Sample(x,z+size)];
    const average=corners.reduce((sum,height)=>sum+height,0)/4;
    // A metre-wide fan cuts across a curved bank and leaves alternating ridges.
    // Check its edge midpoints and twist before adding sub-metre slope detail.
    const slopeDetail=size>FLOW_RENDERING.terrainDetailCellM&&size<=1&&(near||inScene)
      &&Math.max(Math.abs(center-average),Math.abs(corners[0]-corners[1]+corners[2]-corners[3])/4,
        Math.abs(Sample(cx,z)-(corners[0]+corners[1])/2),
        Math.abs(Sample(x+size,cz)-(corners[1]+corners[2])/2),
        Math.abs(Sample(cx,z+size)-(corners[2]+corners[3])/2),
        Math.abs(Sample(x,cz)-(corners[3]+corners[0])/2))>FLOW_RENDERING.terrainDetailHeightErrorM;
    const painted = inScene || !!backdropPaint && x + size >= backdropPaint.minX && z + size >= backdropPaint.minZ
      && x <= backdropPaint.minX + backdropPaint.width * backdropPaint.texelM
      && z <= backdropPaint.minZ + backdropPaint.height * backdropPaint.texelM;
    // Sample the original relief throughout the scene, including features away
    // from the trench network that a coarse cell's center can miss entirely.
    const split = size > 1 && near || size > FLOW_RENDERING.terrainSceneCellM && inScene
      || size > FLOW_RENDERING.terrainBackdropCellM && painted || size > 2 && Math.abs(center-average) > 0.18
      || size > 1 && size <= FLOW_RENDERING.terrainSceneCellM && inScene && NeedsReliefDetail(x,z,size)
      || slopeDetail;
    const cell={x,z,size,near,painted,corners,centerHeight:center};
    if(split) cell.children=[Refine(x,z,half),Refine(cx,z,half),Refine(cx,cz,half),Refine(x,cz,half)];
    else cells.push(cell);
    cell.minHeight=cell.children?Math.min(...cell.children.map(child=>child.minHeight)):Math.min(center,Sample(x,z),Sample(x+size,z),Sample(x,z+size),Sample(x+size,z+size));
    cell.maxHeight=cell.children?Math.max(...cell.children.map(child=>child.maxHeight)):Math.max(center,Sample(x,z),Sample(x+size,z),Sample(x,z+size),Sample(x+size,z+size));
    cell.heightError = 0;
    if (cell.children) {
      const CoarseHeightAt = (px, pz) => {
        const dx = (px-cx)/half, dz = (pz-cz)/half, extent = Math.max(Math.abs(dx),Math.abs(dz));
        if (extent === 0) return center;
        let from, to, progress;
        if (Math.abs(dx) >= Math.abs(dz)) {
          [from,to] = dx < 0 ? [corners[0],corners[3]] : [corners[1],corners[2]];
          progress = (dz/extent+1)/2;
        } else {
          [from,to] = dz < 0 ? [corners[0],corners[1]] : [corners[3],corners[2]];
          progress = (dx/extent+1)/2;
        }
        return center + (from + (to-from)*progress - center)*extent;
      };
      for (const child of cell.children) {
        const points = [[child.x,child.z], [child.x+child.size,child.z],
          [child.x+child.size,child.z+child.size], [child.x,child.z+child.size],
          [child.x+child.size/2,child.z+child.size/2]];
        const deviation = Math.max(...points.map(([px,pz]) => Math.abs(Sample(px,pz)-CoarseHeightAt(px,pz))));
        cell.heightError = Math.max(cell.heightError,child.heightError+deviation);
      }
    }
    cell.center=[cx,(cell.minHeight+cell.maxHeight)/2,cz];
    cell.radius=Math.hypot(size/Math.SQRT2,(cell.maxHeight-cell.minHeight)/2);
    return cell;
  };
  const restoredNodes=prepared?new Array(prepared.nodes.length/15):null;
  class SnapshotCell {
    constructor(index) {
      const data=prepared.nodes,at=index*15;
      this.nodeIndex=index;this.x=data[at];this.z=data[at+1];this.size=data[at+2];
      this.minHeight=data[at+3];this.maxHeight=data[at+4];this.heightError=data[at+5];
      this.near=!!data[at+6];this.painted=!!data[at+7];this.firstChild=data[at+8];
      this.corners=[data[at+9],data[at+10],data[at+11],data[at+12]];this.centerHeight=data[at+13];
      this.exactHeightError=data[at+14]>=0?data[at+14]:undefined;
      this.center=[this.x+this.size/2,(this.minHeight+this.maxHeight)/2,this.z+this.size/2];
      this.radius=Math.hypot(this.size/Math.SQRT2,(this.maxHeight-this.minHeight)/2);
      this.childNodes=null;
    }
    get children() {
      const first=this.firstChild;
      if(first<0) return undefined;
      return this.childNodes??=[RestoreNode(first),RestoreNode(first+1),RestoreNode(first+2),RestoreNode(first+3)];
    }
  }
  const RestoreNode=index=>restoredNodes[index]??=new SnapshotCell(index);
  const roots=prepared?Array.from({length:prepared.rootCount},(_,index)=>RestoreNode(index)):[];
  if(!prepared) for(let z=-radius;z<radius;z+=256) for(let x=-radius;x<radius;x+=256) roots.push(Refine(x,z,256));
  // Group consecutive roots without changing their traversal order. Bounds enclose
  // the *spheres* accepted by the original culler, including their overhang.
  const rootGroups=[];
  for(let start=0;start<roots.length;start+=8) {
    const end=Math.min(roots.length,start+8),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(let i=start;i<end;i++) for(let axis=0;axis<3;axis++) {
      const c=roots[i];lo[axis]=Math.min(lo[axis],c.center[axis]-c.radius);hi[axis]=Math.max(hi[axis],c.center[axis]+c.radius);
    }
    rootGroups.push({start,end,center:lo.map((v,i)=>(v+hi[i])/2),extent:lo.map((v,i)=>(hi[i]-v)/2)});
  }
  const gridStep=prepared?prepared.leafIds.reduce((step,id)=>Math.min(step,prepared.nodes[id*15+2]),Infinity):
    cells.reduce((step,c)=>Math.min(step,c.size),Infinity);
  const VisitBoundaryPoints=(cell,visit,delta)=>{
    if(cell.perimeter) {
      for(const [x,z] of cell.perimeter) visit(x,z,delta);
      return;
    }
    const {x,z,size}=cell;
    visit(x,z,delta);visit(x+size,z,delta);visit(x+size,z+size,delta);visit(x,z+size,delta);
  };
  const BoundariesForCells=(selected,state=null)=>{
    if(state) {
      if(!state.selected) Object.assign(state,{selected:new Set(),rowCounts:new Map(),columnCounts:new Map(),rows:new Map(),columns:new Map()});
      const dirtyRows=new Set(),dirtyColumns=new Set(),next=new Set(selected);
      const UpdateLine=(lines,dirty,key,value,delta)=>{
        let counts=lines.get(key);
        if(!counts) {counts=new Map();lines.set(key,counts);}
        const before=counts.get(value)||0,count=before+delta;
        if(count) counts.set(value,count);else counts.delete(value);
        if(!counts.size) lines.delete(key);
        if(!before||!count) dirty.add(key);
      };
      const UpdatePoint=(x,z,delta)=>{
        UpdateLine(state.rowCounts,dirtyRows,z,x,delta);UpdateLine(state.columnCounts,dirtyColumns,x,z,delta);
      };
      for(const cell of state.selected) if(!next.has(cell)) VisitBoundaryPoints(cell,UpdatePoint,-1);
      for(const cell of next) if(!state.selected.has(cell)) VisitBoundaryPoints(cell,UpdatePoint,1);
      for(const [lines,counts,dirty] of [[state.rows,state.rowCounts,dirtyRows],[state.columns,state.columnCounts,dirtyColumns]]) {
        for(const key of dirty) {
          const values=counts.get(key);
          if(!values) {lines.delete(key);continue;}
          const previous=lines.get(key);
          if(previous?.length===values.size&&previous.every(value=>values.has(value))) continue;
          lines.set(key,Float64Array.from(values.keys()).sort());
        }
      }
      state.selected=next;return state;
    }
    const rows=new Map(),columns=new Map();
    const Register=(x,z)=>{
      let row=rows.get(z);if(!row) {row=new Set();rows.set(z,row);}row.add(x);
      let column=columns.get(x);if(!column) {column=new Set();columns.set(x,column);}column.add(z);
    };
    for(const cell of selected) VisitBoundaryPoints(cell,Register);
    for(const lines of [rows,columns]) for(const [key,values] of lines) lines.set(key,Float64Array.from(values).sort());
    return {rows,columns};
  };
  const RestoreLines=lines=>new Map(Array.from(lines.keys,(key,index)=>[key,lines.values.subarray(lines.offsets[index],lines.offsets[index+1])]));
  const fullBoundaries=prepared?{rows:RestoreLines(prepared.rows),columns:RestoreLines(prepared.columns)}:BoundariesForCells(cells);
  // All LOD corners lie on the baked grid. Give each coordinate a stable bit
  // in both its row and its column; each pane owns just its active bitsets.
  let edgeGrid;
  const cellBits=new WeakMap();
  const VisibleBoundariesForCells=(selected,state={})=>{
    if(!edgeGrid) {
      const lines=[],rows=new Map(),columns=new Map();
      let words=0;
      for(const [source,index] of [[fullBoundaries.rows,rows],[fullBoundaries.columns,columns]]) {
        for(const [at,values] of source) {
          const blocks=new Map(),coordinates=[],first=words;
          for(const value of values) {
            const block=Math.floor(value/(32*gridStep));
            if(block!==coordinates.at(-1)) {blocks.set(block,words++);coordinates.push(block);}
          }
          const line={at,blocks,coordinates,first,end:words,row:index===rows};
          index.set(at,line);lines.push(line);
        }
      }
      edgeGrid={rows,columns,lines,words};
    }
    if(state.grid!==edgeGrid||state.selected) {
      state={grid:edgeGrid,rows:new Map(),columns:new Map(),active:new Uint32Array(edgeGrid.words),next:new Uint32Array(edgeGrid.words)};
    }
    const {active,next}=state;
    next.fill(0);
    for(const cell of selected) {
      let bits=cellBits.get(cell);
      if(!bits) {
        bits=new Uint32Array((cell.perimeter?.length??4)*2);
        let at=0;
        VisitBoundaryPoints(cell,(x,z)=>{
          const row=edgeGrid.rows.get(z),column=edgeGrid.columns.get(x);
          const u=x/gridStep,v=z/gridStep;
          bits[at++]=row.blocks.get(Math.floor(u/32))*32+(u&31);
          bits[at++]=column.blocks.get(Math.floor(v/32))*32+(v&31);
        });
        cellBits.set(cell,bits);
      }
      for(let i=0;i<bits.length;i++) {const bit=bits[i];next[bit>>>5]|=1<<(bit&31);}
    }
    for(const line of edgeGrid.lines) {
      let word=line.first;
      while(word<line.end&&active[word]===next[word]) word++;
      if(word===line.end) continue;
      const points=[];
      for(word=line.first;word<line.end;word++) {
        let mask=next[word];
        while(mask) {
          const bit=31-Math.clz32(mask&-mask);
          points.push((line.coordinates[word-line.first]*32+bit)*gridStep);mask&=mask-1;
        }
      }
      const target=line.row?state.rows:state.columns;
      if(points.length) target.set(line.at,points);else target.delete(line.at);
    }
    state.active=next;state.next=active;
    return state;
  };
  const Between=(values,from,to)=>values.slice(LowerBound(values,from),LowerBound(values,to+1e-8));
  const OutlineForCell = ({x,z,size},{rows,columns}=fullBoundaries) => {
    const maxX=x+size,maxZ=z+size;
    return [
      ...Array.from(Between(rows.get(z),x,maxX),value=>[value,z]),
      ...Array.from(Between(columns.get(maxX),z,maxZ).slice(1),value=>[maxX,value]),
      ...Array.from(Between(rows.get(maxZ),x,maxX).reverse().slice(1),value=>[value,maxZ]),
      ...Array.from(Between(columns.get(x),z,maxZ).reverse().slice(1,-1),value=>[x,value]),
    ];
  };
  const heightErrorCache = new WeakMap();
  const preparedErrors=new Map(prepared?Array.from(prepared.errorIds,(id,index)=>[id,index]):[]);
  const HeightErrorForCell = (cell,limit=Infinity) => {
    if(cell.exactHeightError!==undefined) return cell.exactHeightError;
    if (!cell.children) return 0;
    if (!heightErrorCache.has(cell)) {
      const index=preparedErrors.get(cell.nodeIndex);
      const state=index===undefined?{error:0,pending:[...cell.children]}:{error:prepared.errorValues[index],
        pending:Array.from(prepared.errorPending.subarray(prepared.errorOffsets[index],prepared.errorOffsets[index+1]),RestoreNode)};
      heightErrorCache.set(cell,state);
    }
    const state=heightErrorCache.get(cell);
    if (!state.pending.length || state.error>limit) return state.error;
    const {x,z,size} = cell, half = size / 2, cx = x + half, cz = z + half;
    const center = cell.centerHeight, corners = cell.corners;
    const CoarseHeightAt = (px,pz) => {
      const dx = (px-cx)/half, dz = (pz-cz)/half, extent = Math.max(Math.abs(dx),Math.abs(dz));
      if (extent === 0) return center;
      const vertical = Math.abs(dx) >= Math.abs(dz);
      const [from,to] = vertical ? (dx < 0 ? [corners[0],corners[3]] : [corners[1],corners[2]])
        : (dz < 0 ? [corners[0],corners[1]] : [corners[3],corners[2]]);
      const progress = ((vertical ? dz : dx)/extent+1)/2;
      const outer = from + (to-from)*progress;
      return center + (outer-center)*extent;
    };
    // Measure the corner fan against its finest source samples.
    // Summing errors between successive LODs overestimates this deviation.
    // Retain unfinished work so a later closer camera can resume the query.
    const Check = (px,pz,height) => { state.error = Math.max(state.error,Math.abs(height-CoarseHeightAt(px,pz))); };
    while (state.pending.length && state.error<=limit) {
      const child = state.pending.pop();
      if (child.children) { state.pending.push(...child.children); continue; }
      Check(child.x,child.z,child.corners[0]); Check(child.x+child.size,child.z,child.corners[1]);
      Check(child.x+child.size,child.z+child.size,child.corners[2]); Check(child.x,child.z+child.size,child.corners[3]);
      Check(child.x+child.size/2,child.z+child.size/2,child.centerHeight);
    }
    if(!state.pending.length) {cell.exactHeightError=state.error;heightErrorCache.delete(cell);}
    return state.error;
  };
  const normalCache = new Map();
  const preparedNormals=new Map();
  if(prepared) prepared.normalKeys.forEach((key,index)=>{
    // Older snapshot files stored coordinates as strings.
    preparedNormals.set(typeof key==="number"?key:GridKey(...key.split(",").map(Number)),index);
  });
  const NormalAt = (x, z) => {
    const key = GridKey(x,z);
    if (!normalCache.has(key)) {
      const cached=preparedNormals.get(key);
      if(cached!==undefined) {
        const normal=Array.from(prepared.normalValues.subarray(cached*3,cached*3+3));normalCache.set(key,normal);return normal;
      }
      const step = FLOW_RENDERING.terrainNormalSampleM;
      const normal = [Sample(x - step, z) - Sample(x + step, z), 2 * step,
        Sample(x, z - step) - Sample(x, z + step)];
      const length = Math.hypot(...normal);
      normalCache.set(key, normal.map(value => value / length));
    }
    return normalCache.get(key);
  };
  const soilCellM = 16, soilBuckets = new Map();
  for (const segment of interest) {
    const [minX, maxX, minZ, maxZ] = segment.colorBounds;
    for (let row = Math.floor(minZ / soilCellM); row <= Math.floor(maxZ / soilCellM); row++) {
      for (let column = Math.floor(minX / soilCellM); column <= Math.floor(maxX / soilCellM); column++) {
        const key = `${column},${row}`;
        if (!soilBuckets.has(key)) soilBuckets.set(key, []);
        soilBuckets.get(key).push(segment);
      }
    }
  }
  const SoilMixAt = (x, z) => {
    let mix = 0;
    const point = [x, z];
    const segments = soilBuckets.get(`${Math.floor(x / soilCellM)},${Math.floor(z / soilCellM)}`) || [];
    for (const segment of segments) {
      const [minX, maxX, minZ, maxZ] = segment.colorBounds;
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      mix = Math.max(mix, Clamp((segment.reach + 1 - SegmentDistance(point, segment.a, segment.b)) / 3, 0, 1));
    }
    return mix;
  };
  // Bake color independently of relief tessellation. Pixel centers correspond
  // to world grid samples, so adjacent LOD cells use exactly the same paint.
  let surfaceMaps=prepared?.surfaceMaps;
  const SurfaceMaps = () => {
    if (surfaceMaps) return surfaceMaps;
    const settings = FLOW_RENDERING.terrainSurface;
    let texelM = settings.texelM;
    while (Math.ceil((bounds.maxX - bounds.minX) / texelM) + 1 > settings.maxTexturePx
      || Math.ceil((bounds.maxZ - bounds.minZ) / texelM) + 1 > settings.maxTexturePx
      || (Math.ceil((bounds.maxX - bounds.minX) / texelM) + 1)
        * (Math.ceil((bounds.maxZ - bounds.minZ) / texelM) + 1) > settings.maxPixels) texelM *= 2;
    const width = Math.ceil((bounds.maxX - bounds.minX) / texelM) + 1;
    const height = Math.ceil((bounds.maxZ - bounds.minZ) / texelM) + 1;
    const data = new Uint8Array(width * height * 4);
    for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
      const x = bounds.minX + column * texelM, z = bounds.minZ + row * texelM;
      const color = SurfaceColorAt(x, z), soilMix = SoilMixAt(x, z);
      const offset = (row * width + column) * 4;
      for (let axis = 0; axis < 3; axis++) data[offset + axis] = Math.round(color[axis] + ([184, 164, 128][axis] - color[axis]) * soilMix);
      data[offset + 3] = 255;
    }
    surfaceMaps = {scene:{minX:bounds.minX, minZ:bounds.minZ, texelM, width, height, data}, backdrop:backdropPaint};
    return surfaceMaps;
  };
  // One colour cache per light setting, so viewports with different skies (day and dusk) keep their own colours.
  const colorCaches = new Map();
  let activeCache = null, activeSun = null, activeAmbient = NaN, activeDirect = NaN;
  const SyncLight = () => {
    const sun=FLOW_RENDERING.sky.sunDirection;
    const {ambient, direct}=FLOW_RENDERING.lighting;
    if (!activeCache || sun!==activeSun || ambient!==activeAmbient || direct!==activeDirect) {
      const currentLight=`${sun}|${ambient}|${direct}`;
      activeCache=colorCaches.get(currentLight);
      if (!activeCache) {
        if (colorCaches.size>=6) colorCaches.delete(colorCaches.keys().next().value);
        activeCache=new Map();colorCaches.set(currentLight,activeCache);
      }
      activeSun=sun;activeAmbient=ambient;activeDirect=direct;
    }
    return activeCache;
  };
  const ColorAt = (x, z) => {
    const colorCache=SyncLight(), sun=activeSun, sunLength=Math.hypot(...sun);
    const key = `${x},${z}`;
    if (colorCache.has(key)) return colorCache.get(key);
    const soilMix = SoilMixAt(x, z);
    const normal = NormalAt(x, z);
    const diffuse=Math.max(0,normal.reduce((sum,value,axis)=>sum+value*sun[axis]/sunLength,0));
    const light=FLOW_RENDERING.lighting.ambient+FLOW_RENDERING.lighting.direct*diffuse;
    const color = SurfaceColorAt(x, z).map((channel, axis) =>
      Clamp((channel + ([184, 164, 128][axis] - channel) * soilMix) * light, 0, 255));
    colorCache.set(key, color);
    return color;
  };
  const colorBoundsCaches=new WeakMap();
  const ColorBoundsForCell=(cell)=>{
    const lightCache=SyncLight();
    let colorBoundsCache=colorBoundsCaches.get(lightCache);
    if(!colorBoundsCache) {colorBoundsCache=new WeakMap();colorBoundsCaches.set(lightCache,colorBoundsCache);}
    if(colorBoundsCache.has(cell)) return colorBoundsCache.get(cell);
    const samples=cell.children?cell.children.flatMap(ColorBoundsForCell):[
      ...OutlineForCell(cell).map(point=>ColorAt(...point)),
      ColorAt(cell.x+cell.size/2,cell.z+cell.size/2),
    ];
    const bounds=[0,1,2].map(axis=>Math.min(...samples.map(color=>color[axis])));
    const maxima=[0,1,2].map(axis=>Math.max(...samples.map(color=>color[axis])));
    const result=[bounds,maxima];colorBoundsCache.set(cell,result);return result;
  };
  const ColorRangeForCell=(cell)=>{
    const [minimum,maximum]=ColorBoundsForCell(cell);
    return Math.max(...maximum.map((channel,axis)=>channel-minimum[axis]));
  };
  const faceCache=new WeakMap();
  const preparedMeshes=new Map(prepared?Array.from(prepared.packedIds,(id,index)=>[id,index]):[]);
  // Adjacent triangles and LOD cells share immutable vertices, so each view
  // can project a ground vertex once per camera frame without changing seams.
  const vertices=new Map();
  const VertexAt=(x,z)=>{
    const key=GridKey(x,z);
    if(!vertices.has(key)) vertices.set(key,[x,Sample(x,z),z]);
    return vertices.get(key);
  };
  const surfaceColor=[198,207,169];
  // The common four-corner case already has every height in its quadtree
  // node. Build its native fan directly, including the exact diagonal merge.
  // Textured LODs share world-grid positions and normals. Retain each vertex
  // once, and change only triangle indices when a camera or neighbour changes.
  const cornerCount=[...fullBoundaries.rows.values()].reduce((sum,line)=>sum+line.length,0);
  const nodeCount=prepared?prepared.nodes.length/15:(4*cells.length-roots.length)/3;
  const bakedCount=prepared?.nativeHeights?.length||0;
  const nativePool={capacity:cornerCount+nodeCount,data:new Float32Array(Math.max(9216,bakedCount*9)),count:bakedCount};
  const nativeIds=new Map();
  for(let i=0;i<bakedCount;i++) {
    const n=prepared.nativeNormalIds[i],key=prepared.normalKeys[n],at=i*9,data=nativePool.data;
    if(typeof key==="number") {
      const ix=Math.round(key/131072);
      data[at]=ix/8;data[at+2]=(key-ix*131072)/8;
    } else {
      const [x,z]=key.split(",").map(Number);data[at]=x;data[at+2]=z;
    }
    data[at+1]=prepared.nativeHeights[i];
    data.set(surfaceColor,at+3);
    data[at+6]=prepared.normalValues[n*3];data[at+7]=prepared.normalValues[n*3+1];data[at+8]=prepared.normalValues[n*3+2];
    nativeIds.set(key,i);
  }
  const NativeVertex=(x,y,z,normal)=>{
    const key=GridKey(x,z),known=nativeIds.get(key);
    if(known!==undefined) return known;
    const index=nativePool.count++,at=index*9;
    if(at+9>nativePool.data.length) {
      const grown=new Float32Array(Math.max(9216,at+9,nativePool.data.length*2));grown.set(nativePool.data);nativePool.data=grown;
    }
    const data=nativePool.data;
    data[at]=x;data[at+1]=y;data[at+2]=z;data.set(surfaceColor,at+3);data.set(normal??NormalAt(x,z),at+6);
    nativeIds.set(key,index);return index;
  };
  const ExpandNative=indices=>{
    const out=new Float32Array(indices.length*9),data=nativePool.data;
    for(let i=0;i<indices.length;i++) {
      const at=indices[i]*9;
      for(let c=0;c<9;c++) out[i*9+c]=data[at+c];
    }
    return out;
  };
  const quadIndices=[[4,0,1,4,1,2,4,2,3,4,3,0],[0,1,2,0,2,3],[0,1,3,1,2,3]];
  const QuadNormals=cell=>{
    const {x,z,size}=cell;
    return [NormalAt(x,z),NormalAt(x+size,z),NormalAt(x+size,z+size),NormalAt(x,z+size),NormalAt(x+size/2,z+size/2)];
  };
  const QuadTopology=(cell,normals)=>{
    for(const from of [0,1]) {
      const to=from+2;
      if(Math.abs(cell.centerHeight-(cell.corners[from]+cell.corners[to])/2)>=1e-7) continue;
      if(normals[4].every((value,axis)=>Math.abs(value-(normals[from][axis]+normals[to][axis])/2)<1e-7)) return from+1;
    }
    return 0;
  };
  const QuadIds=(cell,normals)=>{
    const {x,z,size,corners,centerHeight}=cell;
    return [NativeVertex(x,corners[0],z,normals[0]),NativeVertex(x+size,corners[1],z,normals[1]),
      NativeVertex(x+size,corners[2],z+size,normals[2]),NativeVertex(x,corners[3],z+size,normals[3]),
      NativeVertex(x+size/2,centerHeight,z+size/2,normals[4])];
  };
  const QuadMesh=(cell,work)=>{
    if(work) work.cellIndexBuilds++;
    const index=preparedMeshes.get(cell.nodeIndex);
    if(index!==undefined&&prepared.packedVertices) {
      const packed=prepared.packedVertices.subarray(prepared.packedOffsets[index],prepared.packedOffsets[index+1]);
      const indices=new Uint32Array(packed.length/9);
      for(let i=0;i<indices.length;i++) {
        const at=i*9;indices[i]=NativeVertex(packed[at],packed[at+1],packed[at+2],packed.subarray(at+6,at+9));
      }
      return {faces:null,packed,indices};
    }
    const baked=index!==undefined&&prepared.quadVertexIds;
    const normals=baked?null:QuadNormals(cell);
    const vertices=baked?prepared.quadVertexIds:QuadIds(cell,normals),start=baked?index*5:0;
    const order=quadIndices[baked?prepared.quadTopology[index]:QuadTopology(cell,normals)];
    const indices=new Uint32Array(order.length);
    for(let i=0;i<order.length;i++) indices[i]=vertices[start+order[i]];
    return {faces:null,indices};
  };
  const BuildMesh=(cell,outline,textured,work)=>{
    const triangles=[];
    const {x,z,size}=cell,maxX=x+size,maxZ=z+size;
    const center=VertexAt(x+size/2,z+size/2);
    const boundary=outline.map(point=>VertexAt(...point));
    // Texture sampling carries paint detail independently. Preserve the
    // existing exact height/normal test when removing collinear edge points.
    const rim=textured?boundary.filter((point,index)=>{
      const previous=boundary[(index+boundary.length-1)%boundary.length];
      const next=boundary[(index+1)%boundary.length];
      if(previous[0]!==next[0]&&previous[2]!==next[2]) return true;
      const length=Math.hypot(next[0]-previous[0],next[2]-previous[2]);
      const progress=Math.hypot(point[0]-previous[0],point[2]-previous[2])/length;
      if(Math.abs(point[1]-previous[1]-(next[1]-previous[1])*progress)>1e-6) return true;
      const normal=NormalAt(point[0],point[2]),before=NormalAt(previous[0],previous[2]),after=NormalAt(next[0],next[2]);
      return normal.some((value,axis)=>Math.abs(value-before[axis]-(after[axis]-before[axis])*progress)>1e-5);
    }):boundary;
    let pointSets=rim.map((point,index)=>[center,point,rim[(index+1)%rim.length]]);
    // Merge a fan across an exact diagonal when height, color and normals
    // interpolate identically. Flat floors and slopes then need two faces.
    if(rim.length===4) {
      const centerValues=[center[1],...(textured?surfaceColor:ColorAt(center[0],center[2])),...NormalAt(center[0],center[2])];
      for(const [from,to] of [[0,2],[1,3]]) {
        const a=rim[from],b=rim[to];
        const first=[a[1],...(textured?surfaceColor:ColorAt(a[0],a[2])),...NormalAt(a[0],a[2])];
        const second=[b[1],...(textured?surfaceColor:ColorAt(b[0],b[2])),...NormalAt(b[0],b[2])];
        if(!centerValues.every((value,index)=>Math.abs(value-(first[index]+second[index])/2)<1e-7)) continue;
        pointSets=from===0?[[rim[0],rim[1],rim[2]],[rim[0],rim[2],rim[3]]]
          :[[rim[0],rim[1],rim[3]],[rim[1],rim[2],rim[3]]];
        break;
      }
    }
    let meshIndices=null;
    if(textured) {
      if(work) work.cellIndexBuilds++;
      meshIndices=new Uint32Array(pointSets.length*3);
      let offset=0;
      for(const points of pointSets) for(const point of points) meshIndices[offset++]=NativeVertex(...point);
    } else for(const points of pointSets) {
      const vertexColors = points.map(point => textured?surfaceColor:ColorAt(point[0], point[2]));
      const vertexNormals = points.map(point => NormalAt(point[0], point[2]));
      const color = "#" + vertexColors[0].map((channel, axis) =>
        Math.round((channel + vertexColors[1][axis] + vertexColors[2][axis]) / 3).toString(16).padStart(2, "0")).join("");
      triangles.push({points,color,vertexColors,vertexNormals,minX:x,maxX,minZ:z,maxZ});
    }
    return {faces:triangles,indices:meshIndices};
  };
  const MeshForCell=(cell,boundaries=fullBoundaries,textured=false,work=null)=>{
    let cached=faceCache.get(cell);
    if(!cached) {cached={};faceCache.set(cell,cached);}
    // The finest source grid has no possible intermediate edge vertices.
    if(textured&&cell.size===FLOW_RENDERING.terrainDetailCellM) return cached.quad??=QuadMesh(cell,work);
    const previous=textured?cached.textured:cached.shaded;
    if(previous&&previous.segments[0].line===boundaries.rows.get(cell.z)
      &&previous.segments[1].line===boundaries.columns.get(cell.x+cell.size)
      &&previous.segments[2].line===boundaries.rows.get(cell.z+cell.size)
      &&previous.segments[3].line===boundaries.columns.get(cell.x)) return previous.record;
    const edges=[boundaries.rows.get(cell.z),boundaries.columns.get(cell.x+cell.size),
      boundaries.rows.get(cell.z+cell.size),boundaries.columns.get(cell.x)];
    if(previous) {
      let unchanged=true;
      for(let side=0;side<4;side++) {
        const old=previous.segments[side],line=edges[side];
        if(old.line===line) continue;
        const from=side%2?cell.z:cell.x,start=LowerBound(line,from),end=LowerBound(line,from+cell.size+1e-8);
        if(end-start!==old.end-old.start) {unchanged=false;break;}
        for(let index=0;index<end-start;index++) if(line[start+index]!==old.line[old.start+index]) {unchanged=false;break;}
        if(!unchanged) break;
        old.line=line;old.start=start;old.end=end;
      }
      if(unchanged) return previous.record;
    }
    const segments=edges.map((line,side)=>{
      const from=side%2?cell.z:cell.x;
      return {line,start:LowerBound(line,from),end:LowerBound(line,from+cell.size+1e-8)};
    });
    if(textured&&segments.every(segment=>segment.end-segment.start===2)) {
      const record=cached.quad??=QuadMesh(cell,work);
      cached.textured={segments,record};return record;
    }
    const outline=OutlineForCell(cell,boundaries);
    const key=(textured?"T:":"S:")+outline.flat().join(",");
    const variants=cached.variants??=new Map();
    if(variants.has(key)) {
      const record=variants.get(key);
      cached[textured?"textured":"shaded"]={segments,record};return record;
    }
    const record=BuildMesh(cell,outline,textured,work);
    if(variants.size>=4) variants.delete(variants.keys().next().value);
    variants.set(key,record);
    cached[textured?"textured":"shaded"]={segments,record};
    return record;
  };
  const PackedFacesForCell=(cell,textured=false,boundaries=fullBoundaries)=>{
    const record=MeshForCell(cell,boundaries,textured);
    if(record.packed) return record.packed;
    if(record.indices) return record.packed=ExpandNative(record.indices);
    const faces=record.faces,packed=new Float32Array(faces.length*27);
    let offset=0;
    for(const face of faces) for(let index=0;index<3;index++) {
      packed.set(face.points[index],offset);
      packed.set(face.vertexColors[index],offset+3);
      packed.set(face.vertexNormals[index],offset+6);
      offset+=9;
    }
    record.packed=packed;
    return packed;
  };
  // Cache the selection within a small patch. Publish only its perimeter to
  // neighbouring patches; interior vertices never participate in their seams.
  const patchCache=new WeakMap(),subtreeCuts=new WeakMap();
  const SelectTerrainPatch=(root,heightLimit,work)=>{
    if(work) work.patchSelections++;
    if((root.exactHeightError??root.heightError)<=heightLimit||HeightErrorForCell(root,heightLimit)<=heightLimit) return root;
    const band=Math.floor(Math.log2(heightLimit)*4),limit=2**(band/4);
    let variants=patchCache.get(root);
    if(!variants) {variants=[];patchCache.set(root,variants);}
    // Every accepted parent remains valid above its measured error, and every
    // split remains necessary below its witnessed error. Adjacent LOD bands
    // often have exactly the same cells; reuse their geometry and boundaries.
    for(const patch of variants) if(limit>=patch.minLimit&&limit<patch.maxLimit) return patch;
    let minLimit=0,maxLimit=Infinity;
    const cells=[];
    const Select=cell=>{
      if(work) work.patchNodes++;
      const error=cell.exactHeightError??(cell.heightError<=limit?cell.heightError:HeightErrorForCell(cell,limit));
      if(error>limit) {
        maxLimit=Math.min(maxLimit,error);
        // This sub-cut is shared by multiple enclosing patch bands. Keep only
        // the last cut at this size; the certified interval gives identical cells.
        if(cell.size===FLOW_RENDERING.terrainPatchSizeM/4) {
          const cut=subtreeCuts.get(cell);
          if(cut&&limit>=cut.min&&limit<cut.max) {
            if(work) work.reusedSubtrees++;
            minLimit=Math.max(minLimit,cut.min);maxLimit=Math.min(maxLimit,cut.max);
            for(const leaf of cut.cells) cells.push(leaf);
          } else {
            const lo=minLimit,hi=maxLimit,start=cells.length;
            minLimit=0;maxLimit=error;
            for(const child of cell.children) Select(child);
            subtreeCuts.set(cell,{min:minLimit,max:maxLimit,cells:cells.slice(start)});
            minLimit=Math.max(lo,minLimit);maxLimit=Math.min(hi,maxLimit);
          }
        } else for(const child of cell.children) Select(child);
        return;
      }
      minLimit=Math.max(minLimit,error);
      cells.push(cell);
    };
    Select(root);
    const {x,z,size}=root,step=gridStep,span=size/step;
    const patch={x,z,size,cells,minLimit,maxLimit,perimeter:[],edgeLines:[],packed:null};
    if(Number.isInteger(span)&&span<=32) {
      // The two endpoints are implicit. All interior grid points on an 8 m
      // edge (25 cm source detail) fit in one word.
      const rows=new Uint32Array(span+1),columns=new Uint32Array(span+1);
      const Mark=(u,v)=>{
        if(u>0&&u<span) rows[v]|=1<<(u-1);
        if(v>0&&v<span) columns[u]|=1<<(v-1);
      };
      const sides=new Uint8Array(cells.length);
      for(let i=0;i<cells.length;i++) {
        const c=cells[i],u=(c.x-x)/step,v=(c.z-z)/step,n=c.size/step;
        Mark(u,v);Mark(u+n,v);Mark(u,v+n);Mark(u+n,v+n);
        sides[i]=(v===0?1:0)|(v+n===span?2:0)|(u===0?4:0)|(u+n===span?8:0);
      }
      patch.grid={step,span,rows,columns,sides};
      patch.perimeter.push([x,z],[x+size,z],[x,z+size],[x+size,z+size]);
      for(let i=1;i<span;i++) {
        const bit=1<<(i-1);
        if(rows[0]&bit) patch.perimeter.push([x+i*step,z]);
        if(rows[span]&bit) patch.perimeter.push([x+i*step,z+size]);
        if(columns[0]&bit) patch.perimeter.push([x,z+i*step]);
        if(columns[span]&bit) patch.perimeter.push([x+size,z+i*step]);
      }
    } else {
      const boundaries=BoundariesForCells(cells);patch.boundaries=boundaries;
      for(const edgeZ of [z,z+size]) for(const edgeX of boundaries.rows.get(edgeZ)) patch.perimeter.push([edgeX,edgeZ]);
      for(const edgeX of [x,x+size]) for(const edgeZ of boundaries.columns.get(edgeX))
        if(edgeZ!==z&&edgeZ!==z+size) patch.perimeter.push([edgeX,edgeZ]);
    }
    if(variants.length>=3) variants.shift();
    variants.push(patch);
    return patch;
  };
  const GridCellIndices=(cell,patch,work)=>{
    const {rows,columns,step}=patch.grid,u=(cell.x-patch.x)/step,v=(cell.z-patch.z)/step,n=cell.size/step;
    const mask=2**(n-1)-1;
    return CellMaskIndices(cell,step,n,(rows[v]>>>u)&mask,(columns[u+n]>>>v)&mask,
      (rows[v+n]>>>u)&mask,(columns[u]>>>v)&mask,work);
  };
  const CellMaskIndices=(cell,step,n,top,right,bottom,left,work)=>{
    let cached=faceCache.get(cell);
    if(!cached) {cached={};faceCache.set(cell,cached);}
    if(!(top|right|bottom|left)) return (cached.quad??=QuadMesh(cell,work)).indices;
    const last=cached.gridMesh;
    if(last&&last.top===top&&last.right===right&&last.bottom===bottom&&last.left===left) return last.indices;
    const key=`G:${top}:${right}:${bottom}:${left}`;
    const variants=cached.variants??=new Map();
    let record=variants.get(key);
    if(!record) {
      const {x,z,size}=cell,outline=[[x,z]];
      for(let i=1;i<n;i++) if(top&(1<<(i-1))) outline.push([x+i*step,z]);
      outline.push([x+size,z]);
      for(let i=1;i<n;i++) if(right&(1<<(i-1))) outline.push([x+size,z+i*step]);
      outline.push([x+size,z+size]);
      for(let i=n-1;i>0;i--) if(bottom&(1<<(i-1))) outline.push([x+i*step,z+size]);
      outline.push([x,z+size]);
      for(let i=n-1;i>0;i--) if(left&(1<<(i-1))) outline.push([x,z+i*step]);
      record=BuildMesh(cell,outline,true,work);
      if(cached.variants.size>=4) cached.variants.delete(cached.variants.keys().next().value);
      cached.variants.set(key,record);
    }
    cached.gridMesh={top,right,bottom,left,indices:record.indices};return record.indices;
  };
  // Aligned quadtree cells up to 32 native steps have all their interior edge
  // coordinates in a single word, even when the far endpoint is in the next block.
  const EdgeMask=(visible,line,from,mask)=>{
    const u=from/gridStep,word=line.blocks.get(Math.floor(u/32));
    return word===undefined?0:(visible.active[word]>>>((u&31)+1))&mask;
  };
  const IndicesForCell=(cell,boundaries,work)=>{
    const n=cell.size/gridStep;
    if(!boundaries?.grid||n>32||!Number.isInteger(n)) return MeshForCell(cell,boundaries,true,work).indices;
    if(n===1) return CellMaskIndices(cell,gridStep,n,0,0,0,0,work);
    const {x,z,size}=cell,{rows,columns}=boundaries.grid,mask=2**(n-1)-1;
    return CellMaskIndices(cell,gridStep,n,EdgeMask(boundaries,rows.get(z),x,mask),EdgeMask(boundaries,columns.get(x+size),z,mask),
      EdgeMask(boundaries,rows.get(z+size),x,mask),EdgeMask(boundaries,columns.get(x),z,mask),work);
  };
  const TerrainPatchBatches=(patch,visible,work)=>{
    const {x,z,size,boundaries}=patch;
    let changed=0;
    // Match the visible neighbour's actual edge. A change elsewhere on the
    // same grid line must not invalidate this patch's resident vertex buffer.
    for(let side=0;side<4;side++) {
      const horizontal=side<2,axis=horizontal?"rows":"columns";
      const at=(horizontal?z:x)+(side%2)*size,from=horizontal?x:z;
      const line=visible[axis].get(at);
      if(patch.edgeLines[side]===line) continue;
      patch.edgeLines[side]=line;
      if(patch.grid) {
        const grid=patch.grid,edge=grid[axis],index=(side%2)*grid.span;
        let bits=0;
        if(visible.grid) bits=EdgeMask(visible,visible.grid[axis].get(at),from,2**(grid.span-1)-1);
        else for(let i=LowerBound(line,from)+1;i<line.length&&line[i]<from+size;i++) bits|=1<<((line[i]-from)/grid.step-1);
        if(bits!==edge[index]) {edge[index]=bits;changed|=1<<side;}
        continue;
      }
      const current=boundaries[axis].get(at);
      const first=LowerBound(line,from),last=LowerBound(line,from+size+1e-8);
      if(current.length===last-first&&current.every((v,i)=>v===line[first+i])) continue;
      boundaries[axis].set(at,line.slice(first,last));
      changed|=1<<side;
    }
    const fresh=!patch.batches;
    if(fresh||changed) {
      const meshes=patch.meshes??=new Array(patch.cells.length),batches=patch.batches??=[];
      let rebuilt=false;
      // Keep draw order while replacing short runs. A changed border does
      // not require copying the entire patch back into a new index array.
      const run=32;
      for(let start=0;start<meshes.length;start+=run) {
        const end=Math.min(start+run,meshes.length);
        let dirty=fresh;
        for(let i=start;i<end;i++) {
          if(!fresh&&patch.grid&&!(patch.grid.sides[i]&changed)) continue;
          const mesh=patch.grid?GridCellIndices(patch.cells[i],patch,work):IndicesForCell(patch.cells[i],boundaries,work);
          if(work) work.patchCellLookups++;
          if(mesh!==meshes[i]) {meshes[i]=mesh;dirty=true;}
        }
        if(!dirty) continue;
        rebuilt=true;
        if(end===start+1) {batches[start/run]=meshes[start];continue;}
        let length=0;
        for(let i=start;i<end;i++) length+=meshes[i].length;
        const batch=new Uint32Array(length);
        for(let i=start,offset=0;i<end;i++) {batch.set(meshes[i],offset);offset+=meshes[i].length;}
        batches[start/run]=batch;
        if(work) work.patchIndicesWritten+=length;
      }
      if(rebuilt) {patch.indices=null;patch.packed=null;if(work) work.patchBuilds++;}
    }
    return patch.batches;
  };
  const IndexedTerrainPatch=(patch,visible,work)=>{
    const batches=TerrainPatchBatches(patch,visible,work);
    if(batches.length===1) return batches[0];
    if(!patch.indices) {
      patch.indices=new Uint32Array(batches.reduce((sum,v)=>sum+v.length,0));
      let offset=0;for(const batch of batches) {patch.indices.set(batch,offset);offset+=batch.length;}
    }
    return patch.indices;
  };
  const PackedTerrainPatch=(patch,visible)=>{
    const indices=IndexedTerrainPatch(patch,visible);
    return patch.packed??=ExpandNative(indices);
  };
  const PrepareSnapshot=(focus=[0,0])=>{
    if(prepared) return prepared;
    const all=[...roots],rootCount=roots.length,childIndices=[],indices=new WeakMap();
    for(let index=0;index<all.length;index++) {
      const cell=all[index];indices.set(cell,index);
      if(cell.children) {childIndices.push(all.length);all.push(...cell.children);} else childIndices.push(-1);
    }
    // Close-range LOD queries revisit these same source samples at many camera
    // angles. Store their exact deviations in the existing snapshot node field.
    for(const cell of all) if(cell.children&&cell.size<=FLOW_RENDERING.terrainPatchSizeM) HeightErrorForCell(cell);
    const settings=FLOW_RENDERING.terrainBuild;
    // Store topology and five shared normal references instead of repeating
    // position, colour and normal for each triangle corner. Spend the existing
    // prewarm budget near the start camera, including the fine trench cells.
    const candidates=all.filter(cell=>Math.abs(cell.center[0]-focus[0])<=settings.prewarmRadiusM
      &&Math.abs(cell.center[2]-focus[1])<=settings.prewarmRadiusM);
    const distance2=cell=>(cell.center[0]-focus[0])**2+(cell.center[2]-focus[1])**2;
    candidates.sort((a,b)=>distance2(a)-distance2(b)||b.size-a.size);
    const packedIds=[],quadVertexIds=[],quadTopology=[];
    for(const cell of candidates) {
      // Each node needs five vertex ids and its topology. Shared positions,
      // colours and normals occupy nine floats per distinct source vertex.
      if((packedIds.length+1)*25+(nativePool.count+5)*40>settings.prewarmBytes) break;
      const normals=QuadNormals(cell);
      quadVertexIds.push(...QuadIds(cell,normals));packedIds.push(indices.get(cell));
      quadTopology.push(QuadTopology(cell,normals));HeightErrorForCell(cell,FLOW_RENDERING.terrainDetailHeightErrorM);
    }
    const nodes=new Float64Array(all.length*15);
    for(const [index,cell] of all.entries()) nodes.set([cell.x,cell.z,cell.size,cell.minHeight,cell.maxHeight,cell.heightError,
      Number(cell.near),Number(cell.painted),childIndices[index],...cell.corners,cell.centerHeight,cell.exactHeightError??-1],index*15);
    const SerializeLines=lines=>{
      const keys=new Float64Array(lines.size),offsets=new Uint32Array(lines.size+1);
      const values=new Float64Array([...lines.values()].reduce((count,row)=>count+row.length,0));
      let index=0,offset=0;
      for(const [key,row] of lines) {keys[index]=key;offsets[index++]=offset;values.set(row,offset);offset+=row.length;}
      offsets[index]=offset;return {keys,offsets,values};
    };
    const Raster=raster=>{if(!raster) return null;const {Blend,...data}=raster;return data;};
    const keys=[...normalCache.keys()];
    const normalKeys=keys.every(key=>typeof key==="number")?Float64Array.from(keys):keys;
    const normalValues=new Float64Array(keys.length*3);
    const nativeHeights=new Float32Array(nativePool.count),nativeNormalIds=new Uint32Array(nativePool.count);
    normalKeys.forEach((key,index)=>{
      normalValues.set(normalCache.get(key),index*3);
      const vertex=nativeIds.get(key);
      if(vertex!==undefined) {nativeHeights[vertex]=nativePool.data[vertex*9+1];nativeNormalIds[vertex]=index;}
    });
    const errorIds=[],errorValues=[],errorOffsets=[0],errorPending=[];
    for(const cell of all) {
      const state=heightErrorCache.get(cell);
      if(!state) continue;
      errorIds.push(indices.get(cell));errorValues.push(state.error);
      for(const child of state.pending) errorPending.push(indices.get(child));
      errorOffsets.push(errorPending.length);
    }
    return {format:2,rootCount,nodes,leafIds:new Uint32Array(cells.map(cell=>indices.get(cell))),
      rows:SerializeLines(fullBoundaries.rows),columns:SerializeLines(fullBoundaries.columns),
      groundPaint:Raster(groundPaint),routePaint:Raster(routePaint),backdropPaint,localBackdropPaint,surfaceMaps:SurfaceMaps(),normalKeys,normalValues,
      errorIds:new Uint32Array(errorIds),errorValues:new Float64Array(errorValues),errorOffsets:new Uint32Array(errorOffsets),errorPending:new Uint32Array(errorPending),
      packedIds:new Uint32Array(packedIds),quadVertexIds:new Uint32Array(quadVertexIds),nativeHeights,nativeNormalIds,quadTopology:new Uint8Array(quadTopology)};
  };
  let restoredCells;
  return {heightAt:HeightAt,sceneHeightAt:SceneHeightAt,preAt,surfaceColorAt:SurfaceColorAt,surfaceMaps:SurfaceMaps,colorAt:ColorAt,roots,rootIndex:{roots,groups:rootGroups},
    heightErrorForCell:HeightErrorForCell,boundariesForCells:BoundariesForCells,visibleBoundariesForCells:VisibleBoundariesForCells,colorRangeForCell:ColorRangeForCell,
    selectTerrainPatch:SelectTerrainPatch,packedTerrainPatch:PackedTerrainPatch,
    nativePool,indicesForCell:IndicesForCell,indexedTerrainPatch:IndexedTerrainPatch,terrainPatchBatches:TerrainPatchBatches,expandNative:ExpandNative,
    facesForCell:(cell,boundaries)=>MeshForCell(cell,boundaries).faces,packedFacesForCell:PackedFacesForCell,prepareSnapshot:PrepareSnapshot,
    get cells(){return prepared?(restoredCells||=(Array.from(prepared.leafIds,RestoreNode))):cells;},
    leafCount:prepared?prepared.leafIds.length:cells.length,plan,source:scene.terrain.file,bounds};
}

export async function LoadEncounterTerrain(scene,sceneUrl,map,options) {
  let bytes=options?.resolvedBytes;
  if(!bytes) {
    const urls=[new URL(scene.terrain.file,sceneUrl),...(scene.trenches?.datum?.file?[new URL(scene.trenches.datum.file,sceneUrl)]:[])];
    const responses=await Promise.all(urls.map((url)=>fetch(url,{cache:"no-store"})));
    for(const response of responses) if(!response.ok) throw new Error(`场景地形读取失败 ${response.status}`);
    bytes=await Promise.all(responses.map((response)=>response.arrayBuffer()));
  }
  const {PrepareEncounterTerrain}=await import("./Script_LevelFlowTerrainLoader.mjs");
  return PrepareEncounterTerrain(scene,bytes,map,options);
}
