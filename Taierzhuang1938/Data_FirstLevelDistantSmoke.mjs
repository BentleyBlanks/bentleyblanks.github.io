// Notion 游戏概念参考图 04–06: connected burning districts, not isolated wisps.
// Fixed random scatter keeps the same fires on the return trip and at checkpoints.
import { Mulberry32 } from "./Script_Noise.mjs";
import { MISSION_LAYOUT, MISSION_ROUTES } from "./Data_FirstLevelMissionLayout.mjs";
import { FRONT_SORTIE, FRONT_TANK_PATH } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_STAGE_ROUTES, MISSION_REAR_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";

export const DISTANT_SMOKE_SEED = 19380406;
export const DISTANT_SMOKE_REGIONS = Object.freeze([
  { id: "RoadBeyondBend", x: 112, z: -218, spread: 9, height: 44, reference: "04/04B road depth" },
  { id: "NorthRoofline", x: 5, z: -218, spread: 12, height: 39, reference: "04B/05 roofline" },
  { id: "NorthwestRidge", x: -64, z: -215, spread: 15, height: 49, reference: "05 left of tank" },
  { id: "WestFarSlope", x: -144, z: -153, spread: 14, height: 39, reference: "05B beyond withdrawal" },
  { id: "EastBurningDistrict", x: 127, z: -178, spread: 5, height: 43, reference: "04/05 eastern roofline" },
  { id: "CollectionWestRidge", x: -118, z: -28, spread: 14, height: 43, reference: "06 right ridge" },
  { id: "CollectionFarRoof", x: 48, z: -58, spread: 8, height: 39, dustHeight: 10, reference: "06B beyond collection ridge" },
  { id: "CollectionEastRidge", x: 129, z: -57, spread: 4, height: 46, dustHeight: 12, reference: "06 background haze" },
].map(Object.freeze));

export const DISTANT_SMOKE_TYPES = Object.freeze({
  sootColumn: Object.freeze({ frame: 0, height: 1, baseWidth: 4.5, crownWidth: 23, aspect: 1.02, opacity: 0.30, life: 27, drift: 25 }),
  billowColumn: Object.freeze({ frame: 1, height: 0.72, baseWidth: 5, crownWidth: 26, aspect: 0.92, opacity: 0.36, life: 19, drift: 31 }),
  dustBank: Object.freeze({ frame: 2, height: 0.16, baseWidth: 8, crownWidth: 24, aspect: 0.55, opacity: 0.22, life: 16, drift: 19 }),
  windShear: Object.freeze({ frame: 3, height: 0.42, baseWidth: 9, crownWidth: 31, aspect: 0.40, opacity: 0.21, life: 21, drift: 35 }),
});

const ROAD_STYLES = Object.freeze([
  { type:"sootColumn", frame:0, height:9, width:4.6, base:.9, aspect:1.08, opacity:.23, life:18 },
  { type:"billowColumn", frame:1, height:7, width:6.0, base:1.3, aspect:.95, opacity:.35, life:12 },
  { type:"dustBank", frame:2, height:2.8, width:6.0, base:2.2, aspect:.45, opacity:.25, life:10 },
  { type:"windShear", frame:3, height:3.6, width:7.0, base:2.0, aspect:.34, opacity:.25, life:11 },
  { type:"groundScreen", frame:4, height:2.6, width:6.0, base:1.4, aspect:.62, opacity:.38, life:10 },
  { type:"burstDust", frame:5, height:5.0, width:6.5, base:.8, aspect:.84, opacity:.43, life:11 },
].map(Object.freeze));
// These pockets give the opening/front views and each later road a readable
// non-black effect, instead of hiding all the alternatives behind distant soot.
const VARIETY_POCKETS = Object.freeze([
  {id:"FrontWhiteBillow",x:80,z:-182,frame:1},
  {id:"FrontDustPulse",x:19,z:-185,frame:5},
  {id:"WestDustPulse",x:-52,z:-174,frame:5},
  {id:"AmmoWhiteScreen",x:73,z:-126,frame:4},
  {id:"SouthWindRibbon",x:9,z:-62,frame:3},
  {id:"VillageWhiteScreen",x:106,z:22,frame:4},
  {id:"BridgeDustPulse",x:114,z:115,frame:5},
  {id:"RearWhiteBillow",x:-114,z:207,frame:1},
]);
function RoadProfile(style,scale,random,tier="near") {
  const size=tier==="middle"?1.5:1;
  return Object.freeze({type:style.type,frame:style.frame,seed:Math.floor(random()*0xffffffff),
    height:style.height*scale*size,baseWidth:style.base*scale,crownWidth:style.width*scale*size,
    aspect:style.aspect,opacity:style.opacity,life:style.life*(.85+random()*.3),spread:scale*.65,
    driftX:-(style.frame===3?3.5:2.4)*scale,driftZ:-.5*scale,nearFade:2.4});
}

// Scatter alongside the actual walking/tank roads, including the village and
// bridge approach. The seed changes the shoulder, spacing, scale and recipe.
// Source rejection keeps solid buildings, river water and the walking corridor
// clear. These are atmospheric embers/dust, never gameplay smoke cover.
const ROAD_CORRIDORS = Object.freeze([
  ["FrontTankRoad", FRONT_TANK_PATH], ["SupportSap", FRONT_SORTIE.approach],
  ["AmmoReturn", FRONT_SORTIE.route], ["AttackBranch", FRONT_SORTIE.attackRoute],
  ["SouthRoad", MISSION_STAGE_ROUTES.southWalk],
  ["VillageBypass", MISSION_STAGE_ROUTES.courtyardBypass],
  ["VillageMainRoad", [{x:76,z:36},{x:76,z:75},{x:82,z:111}]],
  ["CartApproach", MISSION_STAGE_ROUTES.cartRide],
  ["Evacuation", MISSION_REAR_ROUTES.evacuation],
  ["RailBridgeApproach", MISSION_STAGE_ROUTES.toBridge],
]);
function DistanceToSegment(p, a, b) {
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}
const ALL_ROADS=[...Object.values(MISSION_ROUTES),FRONT_TANK_PATH];
export function SmokeRoadClearance(p) {
  return Math.min(...ALL_ROADS.flatMap(path=>path.slice(1).map((b,i)=>DistanceToSegment(p,path[i],b))));
}
function RoadsidePointClear(p, radius) {
  const b=MISSION_LAYOUT.bounds;
  if(p.x<b.minX+8||p.x>b.maxX-8||p.z<b.minZ+8||p.z>b.maxZ-8||Math.abs(p.z-153)<20) return false;
  if(SmokeRoadClearance(p)<radius+3) return false;
  // Preserve the intimate collection/dugout scenes; smoke starts outside them.
  if(Math.hypot(p.x+37,p.z+99)<13||Math.hypot(p.x,p.z+125)<17) return false;
  return !MISSION_LAYOUT.blocks.some(b=>b.h>1.2&&Math.abs(p.x-b.x)<b.w/2+radius*.3&&Math.abs(p.z-b.z)<b.d/2+radius*.3);
}
function BuildRoadsideSmoke(random) {
  const result=[];
  let corridorIndex=0;
  for(const [region,route] of ROAD_CORRIDORS) {
    let next=9+random()*11,walked=0,index=0;
    for(let j=1;j<route.length;j++) {
      const a=route[j-1],b=route[j],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
      while(next<walked+len) {
        const t=(next-walked)/len,at={x:a.x+dx*t,z:a.z+dz*t};
        const tier=index%3===2?"middle":"near",scale=.8+random()*.5;
        const style=ROAD_STYLES[[1,2,4,0,3,5][(index+corridorIndex)%6]];
        const width=style.width*scale*(tier==="middle"?1.5:1);
        for(let attempt=0;attempt<16;attempt++) {
          const side=random()<.5?-1:1,offset=(tier==="near"?10+random()*8:20+random()*13)*side;
          const p={x:at.x-dz/len*offset+(random()-.5)*4,z:at.z+dx/len*offset+(random()-.5)*4};
          if(!RoadsidePointClear(p,width*.85+4.5)||result.some(s=>Math.hypot(s.x-p.x,s.z-p.z)<10)) continue;
          const backdrop=RoadProfile(style,scale,random,tier);
          result.push(Object.freeze({id:region+"_"+index,region,reference:"roadside scatter",tier,...p,heightOffset:.2,
            options:Object.freeze({kind:"black",rate:0,fire:0,backdrop})}));
          break;
        }
        index++;next+=18+random()*15;
      }
      walked+=len;
    }
    corridorIndex++;
  }
  for(const pocket of VARIETY_POCKETS) for(let attempt=0;attempt<24;attempt++) {
    const style=ROAD_STYLES[pocket.frame],scale=1.15;
    const p={x:pocket.x+(random()-.5)*8,z:pocket.z+(random()-.5)*8};
    if(!RoadsidePointClear(p,style.width*scale*.85+4.5)) continue;
    result.push(Object.freeze({id:pocket.id,region:pocket.id,reference:"visible smoke variety pocket",tier:"middle",...p,
      heightOffset:.25,options:Object.freeze({kind:"black",rate:0,fire:0,backdrop:RoadProfile(style,scale,random)})}));
    break;
  }
  return result;
}

export function BuildDistantSmoke(seed = DISTANT_SMOKE_SEED) {
  const random = Mulberry32(seed);
  const Between = (a, b) => a + (b - a) * random();
  const distant = DISTANT_SMOKE_REGIONS.flatMap(region => Object.entries(DISTANT_SMOKE_TYPES).map(([type, profile], index) => {
    const scale = Between(0.72, 1.2), windAngle = Between(-0.28, 0.08);
    const backdrop = Object.freeze({
      type, frame: profile.frame, seed: Math.floor(random() * 0xffffffff),
      height: region.height * profile.height * scale,
      baseWidth: profile.baseWidth * scale, crownWidth: profile.crownWidth * scale,
      aspect: profile.aspect, opacity: profile.opacity * Between(0.93, 1.08),
      life: profile.life * Between(0.92, 1.12), spread: type === "dustBank" ? 4 : 3.4, nearFade: 9,
      driftX: -Math.cos(windAngle) * profile.drift, driftZ: Math.sin(windAngle) * profile.drift,
    });
    return Object.freeze({
      id: region.id + "_" + type, region: region.id, reference: region.reference, tier: "far",
      x: region.x + (index === 0 ? -0.85 : index === 1 ? 1.15 : 0) * region.spread + Between(-3, 3),
      z: region.z + Between(-5, 5),
      heightOffset: type === "windShear" ? 4 : type === "dustBank" ? region.dustHeight || 0.25 : 0.25,
      // Dedicated instances preserve low-quality density without taking combat slots.
      options: Object.freeze({ kind: "black", rate: 0, fire: 0, backdrop }),
    });
  }));
  return [...distant,...BuildRoadsideSmoke(random)];
}

export const FIRST_LEVEL_DISTANT_SMOKE = Object.freeze(BuildDistantSmoke());
