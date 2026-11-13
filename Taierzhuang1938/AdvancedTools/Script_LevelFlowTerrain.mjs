import { DecodeSceneHeights } from "../Script_SceneDoc.mjs";
import { GridSampler, DecodeTrenchDatum, CompileSceneTrenches } from "../Script_SceneTrenches.mjs";
import { Clamp, SegmentDistance } from "./Script_LevelFlowGeometry.mjs";
import { FLOW_RENDERING } from "../Data_Tuning_LevelFlow.mjs";

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
  const HeightAt=(x,z)=>{
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
  const Refine=(x,z,size)=>{
    const half=size/2,cx=x+half,cz=z+half;
    const near=interest.some((segment)=>{
      if(cx<Math.min(segment.a[0],segment.b[0])-half-segment.reach||cx>Math.max(segment.a[0],segment.b[0])+half+segment.reach
        ||cz<Math.min(segment.a[1],segment.b[1])-half-segment.reach||cz>Math.max(segment.a[1],segment.b[1])+half+segment.reach) return false;
      return SegmentDistance([cx,cz],segment.a,segment.b)<size*0.71+segment.reach;
    });
    const inScene=x+size>=bounds.minX&&x<=bounds.maxX&&z+size>=bounds.minZ&&z<=bounds.maxZ;
    const center=Sample(cx,cz),average=(Sample(x,z)+Sample(x+size,z)+Sample(x,z+size)+Sample(x+size,z+size))/4;
    const split=size>1&&near||size>16&&inScene||size>2&&Math.abs(center-average)>0.18;
    const cell={x,z,size,near};
    if(split) cell.children=[Refine(x,z,half),Refine(cx,z,half),Refine(cx,cz,half),Refine(x,cz,half)];
    else cells.push(cell);
    cell.minHeight=cell.children?Math.min(...cell.children.map(child=>child.minHeight)):Math.min(center,Sample(x,z),Sample(x+size,z),Sample(x,z+size),Sample(x+size,z+size));
    cell.maxHeight=cell.children?Math.max(...cell.children.map(child=>child.maxHeight)):Math.max(center,Sample(x,z),Sample(x+size,z),Sample(x,z+size),Sample(x+size,z+size));
    cell.center=[cx,(cell.minHeight+cell.maxHeight)/2,cz];
    cell.radius=Math.hypot(size/Math.SQRT2,(cell.maxHeight-cell.minHeight)/2);
    return cell;
  };
  const radius=6144;
  const roots=[];
  for(let z=-radius;z<radius;z+=256) for(let x=-radius;x<radius;x+=256) roots.push(Refine(x,z,256));
  const rows=new Map(),columns=new Map();
  const Register=(x,z)=>{
    if(!rows.has(z)) rows.set(z,new Set());rows.get(z).add(x);
    if(!columns.has(x)) columns.set(x,new Set());columns.get(x).add(z);
  };
  for(const cell of cells) for(const [x,z] of [[cell.x,cell.z],[cell.x+cell.size,cell.z],[cell.x+cell.size,cell.z+cell.size],[cell.x,cell.z+cell.size]]) Register(x,z);
  for(const [key,values] of rows) rows.set(key,[...values].sort((a,b)=>a-b));
  for(const [key,values] of columns) columns.set(key,[...values].sort((a,b)=>a-b));
  const Between=(values,from,to)=>values.slice(LowerBound(values,from),LowerBound(values,to+1e-8));
  const colorCache = new Map();
  const ColorAt = (x, z) => {
    const key = `${x},${z}`;
    if (colorCache.has(key)) return colorCache.get(key);
    let soilMix = 0;
    const point = [x, z];
    for (const segment of interest) {
      const [minX, maxX, minZ, maxZ] = segment.colorBounds;
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      soilMix = Math.max(soilMix, Clamp((segment.reach + 1 - SegmentDistance(point, segment.a, segment.b)) / 3, 0, 1));
    }
    const step = FLOW_RENDERING.terrainNormalSampleM;
    const normal = [Sample(x - step, z) - Sample(x + step, z), 2 * step, Sample(x, z - step) - Sample(x, z + step)];
    const light = 0.84 + (-normal[0] * 0.35 + normal[1] * 0.88 + normal[2] * 0.3) / Math.hypot(...normal) * 0.16;
    const color = [198, 207, 169].map((channel, axis) =>
      Clamp((channel + ([184, 164, 128][axis] - channel) * soilMix) * light, 0, 255));
    colorCache.set(key, color);
    return color;
  };
  const faceCache=new WeakMap();
  const packedFaceCache=new WeakMap();
  // Adjacent triangles and LOD cells share immutable vertices, so each view
  // can project a ground vertex once per camera frame without changing seams.
  const vertices=new Map();
  const VertexAt=(x,z)=>{
    const key=`${x},${z}`;
    if(!vertices.has(key)) vertices.set(key,[x,Sample(x,z),z]);
    return vertices.get(key);
  };
  const FacesForCell=(cell)=>{
    if(faceCache.has(cell)) return faceCache.get(cell);
    const triangles=[];
    const {x,z,size}=cell,maxX=x+size,maxZ=z+size;
    const outline=[
      ...Between(rows.get(z),x,maxX).map((value)=>[value,z]),
      ...Between(columns.get(maxX),z,maxZ).slice(1).map((value)=>[maxX,value]),
      ...Between(rows.get(maxZ),x,maxX).reverse().slice(1).map((value)=>[value,maxZ]),
      ...Between(columns.get(x),z,maxZ).reverse().slice(1,-1).map((value)=>[x,value]),
    ];
    const center=VertexAt(x+size/2,z+size/2);
    for(let index=0;index<outline.length;index++) {
      const a=outline[index],b=outline[(index+1)%outline.length];
      const points=[center,VertexAt(...a),VertexAt(...b)];
      const vertexColors = points.map(point => ColorAt(point[0], point[2]));
      const color = "#" + vertexColors[0].map((channel, axis) =>
        Math.round((channel + vertexColors[1][axis] + vertexColors[2][axis]) / 3).toString(16).padStart(2, "0")).join("");
      triangles.push({points,color,vertexColors,minX:x,maxX,minZ:z,maxZ});
    }
    faceCache.set(cell,triangles);return triangles;
  };
  const PackedFacesForCell=(cell)=>{
    if(packedFaceCache.has(cell)) return packedFaceCache.get(cell);
    const faces=FacesForCell(cell),packed=new Float32Array(faces.length*18);
    let offset=0;
    for(const face of faces) for(let index=0;index<3;index++) {
      packed.set(face.points[index],offset);packed.set(face.vertexColors[index],offset+3);offset+=6;
    }
    packedFaceCache.set(cell,packed);return packed;
  };
  return {heightAt:HeightAt,sceneHeightAt:SceneHeightAt,preAt,roots,facesForCell:FacesForCell,packedFacesForCell:PackedFacesForCell,cells,plan,source:scene.terrain.file,bounds};
}

export async function LoadEncounterTerrain(scene,sceneUrl,map) {
  const urls=[new URL(scene.terrain.file,sceneUrl),...(scene.trenches?.datum?.file?[new URL(scene.trenches.datum.file,sceneUrl)]:[])];
  const responses=await Promise.all(urls.map((url)=>fetch(url,{cache:"no-store"})));
  for(const response of responses) if(!response.ok) throw new Error(`场景地形读取失败 ${response.status}`);
  const bytes=await Promise.all(responses.map((response)=>response.arrayBuffer()));
  return BuildEncounterTerrain(scene,bytes[0],bytes[1]||null,map);
}
