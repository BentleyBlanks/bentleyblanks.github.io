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
  sootColumn: Object.freeze({ frame: 0, height: 1, baseWidth: 4.5, crownWidth: 23, aspect: 1.02, opacity: 0.34, life: 39, drift: 25 }),
  billowColumn: Object.freeze({ frame: 1, height: 0.72, baseWidth: 5, crownWidth: 26, aspect: 0.92, opacity: 0.23, life: 45, drift: 31 }),
  dustBank: Object.freeze({ frame: 2, height: 0.16, baseWidth: 8, crownWidth: 24, aspect: 0.55, opacity: 0.09, life: 38, drift: 19 }),
  windShear: Object.freeze({ frame: 3, height: 0.42, baseWidth: 9, crownWidth: 31, aspect: 0.55, opacity: 0.085, life: 48, drift: 35 }),
});

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
  for(const [region,route] of ROAD_CORRIDORS) {
    let next=9+random()*11,walked=0,index=0;
    for(let j=1;j<route.length;j++) {
      const a=route[j-1],b=route[j],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
      while(next<walked+len) {
        const t=(next-walked)/len,at={x:a.x+dx*t,z:a.z+dz*t};
        const tier=index%3===2?"middle":"near",scale=.8+random()*.5;
        const width=(tier==="near"?4.6:10)*scale;
        for(let attempt=0;attempt<16;attempt++) {
          const side=random()<.5?-1:1,offset=(tier==="near"?7+random()*8:20+random()*13)*side;
          const p={x:at.x-dz/len*offset+(random()-.5)*4,z:at.z+dx/len*offset+(random()-.5)*4};
          if(!RoadsidePointClear(p,width*.65+2)||result.some(s=>Math.hypot(s.x-p.x,s.z-p.z)<10)) continue;
          const frame=index%3===0?0:index%3===1?2:1;
          const backdrop=Object.freeze({type:frame===0?"sootColumn":frame===2?"dustBank":"billowColumn",frame,
            seed:Math.floor(random()*0xffffffff),height:(tier==="near"?(frame===2?2.8:9):19)*scale,
            baseWidth:(frame===2?2.8:.9)*scale,crownWidth:width,aspect:frame===2?.66:1.08,
            opacity:frame===0?.20:frame===1?.16:.065,life:22+random()*12,spread:scale*.65,
            driftX:-(tier==="near"?2.4:6)*scale,driftZ:-.5*scale,nearFade:2.4});
          result.push(Object.freeze({id:region+"_"+index,region,reference:"roadside scatter",tier,...p,heightOffset:.2,
            options:Object.freeze({kind:"black",rate:0,fire:0,backdrop})}));
          break;
        }
        index++;next+=18+random()*15;
      }
      walked+=len;
    }
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
