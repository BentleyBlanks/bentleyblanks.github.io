import { FLOW_GROUND } from "./Data_LevelFlow.mjs";
import * as front from "../Data_EditorBlockoutFirstLevel0105Space.mjs";
import * as village from "../Data_EditorBlockoutFirstLevel0610Space.mjs";
import { SegmentDistance, InsidePolygon } from "./Script_LevelFlowGeometry.mjs";

const Point = (point) => Array.isArray(point) ? point.slice(0, 2) : [point.x, point.z];

export function EncounterFloorConnections(point,map,ignore=null) {
  const connections=[];
  for(const floor of map.floors) if(floor.name!==ignore&&InsidePolygon(point,floor.points)) connections.push(floor.name);
  for(const corridor of [...map.roads,...map.trenches]) {
    const id=corridor.id||corridor.name;
    if(ignore&&id===ignore) continue;
    if(corridor.points.slice(1).some((end,index)=>SegmentDistance(point,corridor.points[index],end)<=corridor.width/2+0.05)) connections.push(id||"road");
  }
  return connections;
}

export function EncounterHeightAt(point,map) {
  const [minX,maxX,minZ,maxZ]=FLOW_GROUND.bounds;
  if(point[0]<minX||point[0]>maxX||point[1]<minZ||point[1]>maxZ) return 0;
  for(const ramp of map.ramps) {
    let traveled=0;
    const total=ramp.points.slice(1).reduce((sum,end,index)=>sum+Math.hypot(end[0]-ramp.points[index][0],end[1]-ramp.points[index][1]),0);
    for(let index=1;index<ramp.points.length;index++) {
      const a=ramp.points[index-1],b=ramp.points[index],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(SegmentDistance(point,a,b)<=ramp.width/2) {
        const t=Math.max(0,Math.min(1,((point[0]-a[0])*(b[0]-a[0])+(point[1]-a[1])*(b[1]-a[1]))/(length*length)));
        return FLOW_GROUND.height*(traveled+t*length)/total;
      }
      traveled+=length;
    }
  }
  if(map.floors.some((floor)=>InsidePolygon(point,floor.points))) return 0;
  for(const trench of map.trenches) {
    if(trench.points.slice(1).some((end,index)=>SegmentDistance(point,trench.points[index],end)<=trench.width/2)) return 0;
  }
  return FLOW_GROUND.height;
}

// The same seed and strip construction used by Devin's L1Map0107/Base.mjs.
function FrontPaperFields() {
  let seed=1938031;
  const Random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const fields=[],kinds=["wheat","wheat","wheat","plowed","fallow"];
  for(let z=-42;z<216;z+=60+Random()*45) {
    for(let x=-190;x<340;x+=45+Random()*40) {
      const width=50+Random()*60,depth=70+Random()*70,angle=4+(Random()-0.5)*28+(Random()<0.25?90:0);
      const whole=Random()<0.2,strips=[];
      for(let offset=-width/2;offset<width/2;) {
        const stripWidth=whole?width:10+Random()*22;
        strips.push({from:offset,to:Math.min(width/2,offset+stripWidth),kind:kinds[Math.floor(Random()*kinds.length)]});offset+=stripWidth;
      }
      fields.push({zone:"FrontPaper",x:x+width/2,z:z+depth/2,w:width,d:depth,angleDeg:angle,strips});
    }
  }
  return fields;
}

export function BuildEncounterMap(scene) {
  const objects = scene.objects.filter((object) => object.pos && object.pos[2] < 558
    && object.layer !== "backdrop" && !/空气墙|^11–18|^远景/.test(object.group || ""));
  const ramps=structuredClone(FLOW_GROUND.ramps);
  const roads = [
    {id:"TankGroundRoad",points:FLOW_GROUND.road,width:5},
    ...ramps,
    { points: front.L0105_ROAD.map(Point), width: front.L0105_ROAD_WIDTH_M },
    { points: [...front.L0105_NORTH_ROAD].reverse().map(Point), width: 5 },
    { points: front.L0105_POST_ROAD_SOUTH.map(Point), width: 5 },
    ...village.L0610_ROADS.map((road) => ({ points: road.line.map(Point), width: 4 })),
    { points: village.L0610_EAST_ROAD.line.map(Point), width: 5 },
    ...village.L0610_LANES.map((lane) => ({ id:lane.id, points: lane.line.map(Point), width: lane.halfW * 2,caps:village.L0610_STREETS[lane.id]?.caps||[] })),
    ...Object.values(village.L0610_LANE_PATHS).map((lane)=>({id:lane.id,points:lane.line.map(Point),width:Math.min(...lane.halfW)*2,widths:lane.halfW.map((half)=>half*2),caps:lane.caps||[]})),
    {id:"VillageEntryRamp",points:[[100,380],[100,385]],width:village.L0610_DITCH.rampHalfW*2},
    {id:"VillageAlleyRamp",points:[[80,380],[80,384]],width:2},
  ];
  const trenches = scene.trenches.segments.filter((segment) => !/^11–18/.test(segment.group || ""))
    .map((segment) => ({ id: segment.id, points: segment.points.map(Point), width: segment.floorW || 3.8 }));
  trenches.push({ id: "Gully", points: front.L0105_GULLY.line.map(Point), width: 8 });
  trenches.push({ id: "GullyBranch", points: front.L0105_GULLY.branch.map(Point), width: 6 });
  trenches.push({ id: "SunkenLane", points: village.L0610_LANE.line.map(Point), width: 5.5 });
  trenches.push({ id: "VillageDitch", points: [[36,380],[125,380]], width: 3 });
  trenches.push({id:"PitEntry",points:[[0,-7],[0,0]],width:2.6});
  const Rectangle=(name,box)=>({name,points:[[box.minX,box.minZ],[box.maxX,box.minZ],[box.maxX,box.maxZ],[box.minX,box.maxZ]]});
  const floors=[
    ...FLOW_GROUND.pockets.map(({name,box:[minX,maxX,minZ,maxZ]})=>Rectangle(name,{minX,maxX,minZ,maxZ})),
    Rectangle("丁字路口",village.L0610_STREETS.square.box),
    Rectangle("路口东北角",village.L0610_STREETS.pocket.box),
    Rectangle("老耿家院子",village.L0610_GENG.compound),
    Rectangle("本家院",village.L0610_BENJIA.box),
    Rectangle("街坊家",village.L0610_JIEFANG.box),
  ];
  for(const place of [front.L0105_PLACES.pit,front.L0105_PLACES.dugout,front.L0105_PLACES.platoonShelter]) {
    floors.push(Rectangle(place.name,{minX:place.x-place.w/2,maxX:place.x+place.w/2,minZ:place.z-place.d/2,maxZ:place.z+place.d/2}));
  }
  for(const [id,x,z,w,h,d,material] of FLOW_GROUND.cover) objects.push({
    id:`Encounter_${id}`,pos:[x,0,z],size:[w,h,d],material:`Whitebox/${material}`,group:"遭遇设计/地面工事",planning:true,
  });
  const labels = [
    ["东侧地面车道",109,174], ["地面车道收窄口",101,280], ["集结处机枪阵地",72,139],
    ["旧阵地（已弃）",0,-203], ["旧警戒阵地",-22,-440], ["西邻班后撤沟",-48,90],
    ["防炮洞",68,64.5], ["西边机枪坑",0,-7], ["支沟口",21.9,67.1], ["拐角",30,86],
    ["坡顶",35,131], ["干沟集结处",56,152], ["凹路",88,238], ["收窄的弯",91,280],
    ["耿家庄",154,373], ["村口路沟",69,380], ["主街",100,429], ["老耿家",101,480],
    ["街坊家",74,456], ["本家院",84,482], ["石碾",113.2,465.7], ["关帝庙",84.5,425],
    ["土地庙",181,481], ["土炮楼",229.5,390.5], ["村南口",117,545], ["河汊子",38,407],
  ].map(([name,x,z]) => ({name,p:[x,z]}));
  return {
    bounds: [-160, 320, -480, 558], objects, roads, trenches, labels, floors, ramps,
    paint: scene.paint.filter((paint) => paint.poly && paint.poly.some((point) => point.z < 558)),
    fields: [...FrontPaperFields(),...village.L0610_FIELDS], fieldZones: [{id:"FrontPaper",poly:[[-160,-12],[330,-12],[330,206],[-160,206]]},...village.L0610_FIELD_ZONES],
    footpaths: [...front.L0105_FIELD_LANES, ...village.L0610_FOOTPATHS.map((path) => path.line)].map((line) => line.map(Point)),
    river: village.L0610_RIVER.line.map(Point),
    groves: village.L0610_GROVES, wells: village.L0610_WELLS,
    markers: [
      {name:"狗洞",p:[92,473],kind:"opening"}, {name:"便门",p:[92,484.6],kind:"opening"},
      {name:"院门",p:[108,483.5],kind:"opening"}, {name:"枪眼",p:[100,470],kind:"window"},
      ...Object.values(village.L0610_ALLEY_WINDOWS).map((window) => ({name:window.id,p:[window.x,window.z],kind:"window"})),
    ],
  };
}

export async function LoadEncounterMap() {
  const response = await fetch(new URL("../Scenes/FirstLevelWhitebox/Scene_FirstLevelWhitebox.json", import.meta.url), {cache:"no-store"});
  if (!response.ok) throw new Error(`空间底图读取失败 ${response.status}`);
  const map=BuildEncounterMap(await response.json());
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(map)));
  map.source={scene:"Scenes/FirstLevelWhitebox/Scene_FirstLevelWhitebox.json",sha256:[...new Uint8Array(digest)].map((byte)=>byte.toString(16).padStart(2,"0")).join("")};
  return map;
}
