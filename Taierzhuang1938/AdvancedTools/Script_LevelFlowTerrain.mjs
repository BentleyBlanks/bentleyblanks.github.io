import { DecodeSceneHeights } from "../Script_SceneDoc.mjs";
import { GridSampler, DecodeTrenchDatum, CompileSceneTrenches } from "../Script_SceneTrenches.mjs";
import { Clamp, SegmentDistance } from "./Script_LevelFlowGeometry.mjs";

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
    for(let index=1;index<corridor.points.length;index++) interest.push({a:corridor.points[index-1],b:corridor.points[index],reach:corridor.width/2+3});
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
    const cell={x,z,size};
    if(split) cell.children=[Refine(x,z,half),Refine(cx,z,half),Refine(cx,cz,half),Refine(x,cz,half)];
    else cells.push(cell);
    cell.minHeight=cell.children?Math.min(...cell.children.map(child=>child.minHeight)):Math.min(center,Sample(x,z),Sample(x+size,z),Sample(x,z+size),Sample(x+size,z+size));
    cell.maxHeight=cell.children?Math.max(...cell.children.map(child=>child.maxHeight)):Math.max(center,Sample(x,z),Sample(x+size,z),Sample(x,z+size),Sample(x+size,z+size));
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
  const faceCache=new WeakMap();
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
    const center=[x+size/2,Sample(x+size/2,z+size/2),z+size/2];
    let soilMix=0;
    for(const segment of interest) soilMix=Math.max(soilMix,Clamp((segment.reach+1-SegmentDistance([center[0],center[2]],segment.a,segment.b))/3,0,1));
    const base=[198,207,169].map((channel,axis)=>channel+([184,164,128][axis]-channel)*soilMix);
    for(let index=0;index<outline.length;index++) {
      const a=outline[index],b=outline[(index+1)%outline.length];
      const points=[center,[a[0],Sample(...a),a[1]],[b[0],Sample(...b),b[1]]];
      const a3=points[1].map((value,axis)=>value-points[0][axis]),b3=points[2].map((value,axis)=>value-points[0][axis]);
      let normal=[a3[1]*b3[2]-a3[2]*b3[1],a3[2]*b3[0]-a3[0]*b3[2],a3[0]*b3[1]-a3[1]*b3[0]];
      if(normal[1]<0) normal=normal.map(value=>-value);
      const normalLength=Math.hypot(...normal)||1;
      const normalLight=0.84+(-normal[0]*0.35+normal[1]*0.88+normal[2]*0.3)/normalLength*0.16;
      const color="#"+base.map((channel)=>Math.round(Clamp(channel*normalLight,0,255)).toString(16).padStart(2,"0")).join("");
      triangles.push({points,color,minX:x,maxX,minZ:z,maxZ});
    }
    faceCache.set(cell,triangles);return triangles;
  };
  return {heightAt:HeightAt,sceneHeightAt:SceneHeightAt,preAt,roots,facesForCell:FacesForCell,cells,plan,source:scene.terrain.file,bounds};
}

export async function LoadEncounterTerrain(scene,sceneUrl,map) {
  const urls=[new URL(scene.terrain.file,sceneUrl),...(scene.trenches?.datum?.file?[new URL(scene.trenches.datum.file,sceneUrl)]:[])];
  const responses=await Promise.all(urls.map((url)=>fetch(url,{cache:"no-store"})));
  for(const response of responses) if(!response.ok) throw new Error(`场景地形读取失败 ${response.status}`);
  const bytes=await Promise.all(responses.map((response)=>response.arrayBuffer()));
  return BuildEncounterTerrain(scene,bytes[0],bytes[1]||null,map);
}
