import { DecodeSceneHeights } from "../Script_SceneDoc.mjs";
import { GridSampler, DecodeTrenchDatum, CompileSceneTrenches } from "../Script_SceneTrenches.mjs";
import { Clamp, SegmentDistance, InsidePolygon } from "./Script_LevelFlowGeometry.mjs";
import { FLOW_RENDERING, FLOW_FIELD_COLORS } from "../Data_Tuning_LevelFlow.mjs";
import { SceneSurfaceSampler } from "../Script_SceneSurface.mjs";
import { BuildGroundPaint, RasterizeBackdropPaint } from "../Script_EditorBlockoutLevels.mjs";

function LowerBound(values,target) {
  let low=0,high=values.length;
  while(low<high) {const middle=(low+high)>>>1;if(values[middle]<target) low=middle+1;else high=middle;}
  return low;
}

export function BuildEncounterTerrain(scene,heightBytes,datumBytes,map) {
  const pre=DecodeSceneHeights(heightBytes,scene.terrain),preAt=GridSampler(scene.terrain,pre);
  const datum=scene.trenches?.datum&&datumBytes?DecodeTrenchDatum(scene.trenches.datum,datumBytes):[];
  const plan=CompileSceneTrenches(scene.trenches,{datum,pre:preAt});
  const bounds=scene.bounds,backdrop=scene.backdrop?.ground||{y:-2.74,blendM:160};
  const paintSettings={cellM:FLOW_RENDERING.terrainSurface.texelM,maxCells:FLOW_RENDERING.terrainSurface.maxPixels};
  const groundPaint = BuildGroundPaint(scene.paint, bounds, paintSettings);
  const backdropPaint = RasterizeBackdropPaint(scene.backdrop, FLOW_RENDERING.backdropPaint);
  const localBackdropPaint = RasterizeBackdropPaint(scene.backdrop, {
    maxPx:FLOW_RENDERING.terrainSurface.maxTexturePx, minTexelM:FLOW_RENDERING.terrainSurface.texelM,
    padM:FLOW_RENDERING.terrainSurface.paddingM, bounds,
  });
  const fieldColors = Object.fromEntries(Object.entries(FLOW_FIELD_COLORS).map(([kind, hex]) =>
    [kind, [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)]));
  const fields = (map.fields || []).map(field => ({...field,
    cosine:Math.cos(field.angleDeg * Math.PI / 180), sine:Math.sin(field.angleDeg * Math.PI / 180),
    polygon:map.fieldZones.find(zone => zone.id === field.zone).poly}));
  const routePaint = BuildGroundPaint([
    ...(map.roads || []).map(road => ({line:road.points.map(([x,z]) => ({x,z})), halfW:road.width / 2, feather:0.8, color:"#d8c8a7"})),
    ...(map.footpaths || []).map(points => ({line:points.map(([x,z]) => ({x,z})), halfW:0.35, feather:0.5, color:"#c4b792"})),
    ...(map.floors || []).map(floor => ({poly:floor.points.map(([x,z]) => ({x,z})), feather:0.5, color:"#d8c8a7"})),
  ], bounds, paintSettings);
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
      color.splice(0, 3, ...fieldColors[strip.kind]);
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
  const sampleCache=new Map();
  const Sample=(x,z)=>{
    const key=`${x},${z}`;
    if(!sampleCache.has(key)) sampleCache.set(key,HeightAt(x,z));
    return sampleCache.get(key);
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
  const radius=6144;
  const roots=[];
  for(let z=-radius;z<radius;z+=256) for(let x=-radius;x<radius;x+=256) roots.push(Refine(x,z,256));
  const BoundariesForCells = (selected) => {
    const rows=new Map(),columns=new Map();
    for(const cell of selected) for(const [x,z] of [[cell.x,cell.z],[cell.x+cell.size,cell.z],
      [cell.x+cell.size,cell.z+cell.size],[cell.x,cell.z+cell.size]]) {
      if(!rows.has(z)) rows.set(z,new Set()); rows.get(z).add(x);
      if(!columns.has(x)) columns.set(x,new Set()); columns.get(x).add(z);
    }
    for(const [key,values] of rows) rows.set(key,[...values].sort((a,b)=>a-b));
    for(const [key,values] of columns) columns.set(key,[...values].sort((a,b)=>a-b));
    return {rows,columns};
  };
  const fullBoundaries=BoundariesForCells(cells);
  const Between=(values,from,to)=>values.slice(LowerBound(values,from),LowerBound(values,to+1e-8));
  const OutlineForCell = ({x,z,size},{rows,columns}=fullBoundaries) => {
    const maxX=x+size,maxZ=z+size;
    return [
      ...Between(rows.get(z),x,maxX).map(value=>[value,z]),
      ...Between(columns.get(maxX),z,maxZ).slice(1).map(value=>[maxX,value]),
      ...Between(rows.get(maxZ),x,maxX).reverse().slice(1).map(value=>[value,maxZ]),
      ...Between(columns.get(x),z,maxZ).reverse().slice(1,-1).map(value=>[x,value]),
    ];
  };
  const heightErrorCache = new WeakMap();
  const HeightErrorForCell = (cell,limit=Infinity) => {
    if (!cell.children) return 0;
    if (!heightErrorCache.has(cell)) heightErrorCache.set(cell,{error:0,pending:[...cell.children]});
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
    return state.error;
  };
  const normalCache = new Map();
  const NormalAt = (x, z) => {
    const key = `${x},${z}`;
    if (!normalCache.has(key)) {
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
  let surfaceMaps;
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
  const colorCache = new Map();
  const sun=FLOW_RENDERING.sky.sunDirection, sunLength=Math.hypot(...sun);
  const ColorAt = (x, z) => {
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
  const colorBoundsCache=new WeakMap();
  const ColorBoundsForCell=(cell)=>{
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
  // Adjacent triangles and LOD cells share immutable vertices, so each view
  // can project a ground vertex once per camera frame without changing seams.
  const vertices=new Map();
  const VertexAt=(x,z)=>{
    const key=`${x},${z}`;
    if(!vertices.has(key)) vertices.set(key,[x,Sample(x,z),z]);
    return vertices.get(key);
  };
  const surfaceColor=[198,207,169];
  const MeshForCell=(cell,boundaries=fullBoundaries,textured=false)=>{
    const outline=OutlineForCell(cell,boundaries);
    const key=(textured?"T:":"S:")+outline.flat().join(",");
    if(!faceCache.has(cell)) faceCache.set(cell,new Map());
    const variants=faceCache.get(cell);
    if(variants.has(key)) return variants.get(key);
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
    for(const points of pointSets) {
      const vertexColors = points.map(point => textured?surfaceColor:ColorAt(point[0], point[2]));
      const vertexNormals = points.map(point => NormalAt(point[0], point[2]));
      const color = "#" + vertexColors[0].map((channel, axis) =>
        Math.round((channel + vertexColors[1][axis] + vertexColors[2][axis]) / 3).toString(16).padStart(2, "0")).join("");
      triangles.push({points,color,vertexColors,vertexNormals,minX:x,maxX,minZ:z,maxZ});
    }
    if(variants.size>=4) variants.delete(variants.keys().next().value);
    const record={faces:triangles,packed:null};
    variants.set(key,record);
    return record;
  };
  const PackedFacesForCell=(cell,textured=false,boundaries=fullBoundaries)=>{
    const record=MeshForCell(cell,boundaries,textured);
    if(record.packed) return record.packed;
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
  return {heightAt:HeightAt,sceneHeightAt:SceneHeightAt,preAt,surfaceColorAt:SurfaceColorAt,surfaceMaps:SurfaceMaps,colorAt:ColorAt,roots,
    heightErrorForCell:HeightErrorForCell,boundariesForCells:BoundariesForCells,colorRangeForCell:ColorRangeForCell,
    facesForCell:(cell,boundaries)=>MeshForCell(cell,boundaries).faces,packedFacesForCell:PackedFacesForCell,cells,plan,source:scene.terrain.file,bounds};
}

export async function LoadEncounterTerrain(scene,sceneUrl,map) {
  const urls=[new URL(scene.terrain.file,sceneUrl),...(scene.trenches?.datum?.file?[new URL(scene.trenches.datum.file,sceneUrl)]:[])];
  const responses=await Promise.all(urls.map((url)=>fetch(url,{cache:"no-store"})));
  for(const response of responses) if(!response.ok) throw new Error(`场景地形读取失败 ${response.status}`);
  const bytes=await Promise.all(responses.map((response)=>response.arrayBuffer()));
  return BuildEncounterTerrain(scene,bytes[0],bytes[1]||null,map);
}
