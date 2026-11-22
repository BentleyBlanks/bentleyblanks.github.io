// Heightfield is deterministic. --seed-scene writes the first layout and environment.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  EncodeSceneHeights, FormatSceneJson, SCENE_HEIGHT_ENCODING, SCENE_SCHEMA, ValidateScene,
} from "../../Script_SceneDoc.mjs";
import { GridSampler, PrepareSceneTerrain } from "../../Script_SceneTrenches.mjs";
import { FormatEnvJson, ValidateEnvPreset, ValidateSceneEnv } from "../../Script_EnvPreset.mjs";
import { Rng } from "../../Script_FirstLevelPropDressingData.mjs";

const id = "TanketteAdvanceEastTrack";
const folder = new URL(`../../Scenes/${id}/`, import.meta.url);
const terrainFile = `Scene_${id}.height.bin`;
const terrainUrl = new URL(terrainFile, folder);
const bounds = { minX: -46, maxX: 56, minZ: -105, maxZ: 8 };
const terrain = { file: terrainFile, encoding: SCENE_HEIGHT_ENCODING,
  minX: bounds.minX, minZ: bounds.minZ, cellM: .20, cols: 510, rows: 565 };
const camera = { position: [0, 1.41, 0], yawDeg: 0, pitchDeg: -5.4, fovDeg: 38 };
const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const round = (x) => +x.toFixed(3);
const point = (x, z) => ({ x: round(x), z: round(z) });
const rng = Rng(19380612);
const rand = (a, b) => mix(a, b, rng());

const roadX = (depth) => 2.48 + .37 * Math.sin(depth * .123 + .5) + Math.max(0, depth - 24) * .045;
const eastLip = (depth) => .30 - .032 * depth + .123 * Math.sin(depth * .81)
  + .053 * Math.sin(depth * 3.8);
const spoil = [5.55, -10.3];
const lift = (x, z, cx, cz, sx, sz) => Math.exp(-(((x-cx)/sx)**2 + ((z-cz)/sz)**2));
const trenches = {
  seed: "TanketteAdvanceEastTrack", earthProfile: "compact",
  segments: [{
    id: "EastTrackDitch", preset: "evacuation", group: "近景/下层撤离沟", look: "bare",
    note: "东壁沿上层车道；深沟向镜头后延伸，前方壕口渐浅。",
    points: [-6,-1.8,.9,3.05,5.37,8.1,11.2,14.9,18,21.4].map(d => [round(eastLip(d)-1.37),-d]),
    depth: 1.43, floorW: 1.63, bankW: .60, bermH: .105, bermW: .48, bermSide: "plus",
    cornerRadiusM: .47, jitterScale: .71,
    depthAlong: [[0,.90],[7.1,.64],[9.1,.53],[10.6,.56],[11.5,.93],[14.5,1.43],[17,1.26],[20,.79],[23,.33],[25.2,.17],[27.45,0]],
    details: { cliffs:{on:false}, clods:{on:false}, lip:{on:false}, spoilClods:{on:false},
      roots:{chance:.37,strands:4}, grass:{chance:.075}, spoilSkin:{on:false} },
  }],
};

function GroundAt(x, z) {
  const d = -z;
  const shoulder = Math.abs(x-roadX(d));
  const hardpack = 1 - ease((shoulder - 1.62) / 1.25);
  const roughness = 1 - hardpack * .63;
  const fine = (.049 * Math.sin(x*8.1+z*4.7) + .037 * Math.cos(x*11.2-z*10.32)
    + .061 * Math.sin(z*2.59-x*1.41) + .034 * Math.cos(z*5.9+x*4.6)) * roughness;
  const churn = .085 * Math.sin(x*2.8+z*.31) * Math.sin(z*1.67+x*.79);
  const broad = .112 * Math.sin(x*.57+z*.31) + .092 * Math.cos(z*.61-x*.25);
  const rails = .049 * (1 - ease(Math.abs(shoulder-.69)/.31));
  const crest = .21 + .065 * Math.sin(z*.37) + .10 * ease((d-18)/27)
    + (1-hardpack)*(broad+churn) + fine - rails * hardpack;
  const bank = .09 * lift(x,z,eastLip(d)+.23,z,.35,1) * (1-ease((d-8)/13));
  const mounds = .33*lift(x,z,spoil[0]+.30,spoil[1]+.12,1.22,.86)
    + .21*lift(x,z,spoil[0]-.84,spoil[1]-.66,.80,.62)
    - .33*lift(x,z,spoil[0]-.14,spoil[1]+.11,.54,.46)
    + .22*lift(x,z,17,-27,2.42,1.33) - .20*lift(x,z,-7.2,-18,1.5,1.45);
  return crest + bank + mounds;
}

const heights = new Float32Array((terrain.cols + 1) * (terrain.rows + 1));
for (let row = 0; row <= terrain.rows; row++) {
  const z = terrain.minZ + row * terrain.cellM;
  for (let col = 0; col <= terrain.cols; col++) {
    heights[row * (terrain.cols + 1) + col] = GroundAt(terrain.minX + col * terrain.cellM, z);
  }
}
const bytes = Buffer.from(EncodeSceneHeights(heights));
if (process.argv.includes("--check")) {
  if (!readFileSync(terrainUrl).equals(bytes)) throw new Error("East Track heightfield differs from its bake");
  console.log(`${id}: ${terrain.cols + 1}×${terrain.rows + 1}, ${bytes.length} bytes`);
  process.exit(0);
}
mkdirSync(folder, { recursive: true });
writeFileSync(terrainUrl, bytes);
if (!process.argv.includes("--seed-scene")) process.exit(0);

const objects = [], paint = [];
const carved = GridSampler(terrain, PrepareSceneTerrain({ terrain, trenches }, heights).heights);
function Prop(id, model, x, z, size, yawDeg, group, y = carved(x, z)) {
  objects.push({ id, asset: `Prop/${model}`, pos: [round(x), round(y), round(z)],
    size: size.map(round), yawDeg: round(yawDeg), solid: false, group, params: { grounding: "authored" } });
}

function Line(id, color, tint, halfW, feather, from, to, at, strength = 1) {
  const count = Math.ceil((to - from)/.54);
  const line = Array.from({ length: count + 1 }, (_, index) => {
    const d = mix(from, to, index/count);
    return point(at(d), -d);
  });
  paint.push({ id, color, tint, halfW, feather, line, strength });
}

paint.push({ id: "ClearedShellStruckField", color: "#514943", tint: [.93,.875,.824], feather: 1.2,
  poly: [point(-45,-103.5),point(54.5,-103.5),point(54.5,6.5),point(-45,6.5)] });
Line("DitchSoilCut", "#493c34", [.82,.74,.69], .46, .39, -4, 22, (d) => eastLip(d)-.20);
Line("DitchSoilFloor", "#483e34", [.67,.61,.57], .55, .44, -4, 21, (d) => eastLip(d)-1.45);
Line("FieldPathEastRoad", "#726a61", [1.12,1.057,1.01], 2.19, 1.29, -4, 100, roadX, .93);
Line("FieldPathWestTrack", "#524a42", [.89,.825,.769], .24, .22, -4, 86, (d) => roadX(d)-.72, .62);
Line("FieldPathEastTrack", "#504941", [.90,.834,.779], .24, .22, -4, 86, (d) => roadX(d)+.69, .62);
Line("DitchSoilFreshSpoil", "#3b3028", [.61,.54,.49], .70, .65, 9.22, 11.7, (d) => spoil[0]+.38*Math.cos(d));

Prop("ElmAtCamera","eastTrackSplinteredElm",-1.16,-1.78,[2.56,4.61,2.02],-12,"近景/取景断榆");
Prop("ShoringCrossbeam","eastTrackGreyTimberShoring",-1.43,-4.27,[2.04,1.47,.41],-7,"近景/灰木护壁",-.45);
Prop("ShoringFlank","eastTrackGreyTimberShoring",-.77,-6.15,[1.82,1.40,.45],10,"中景/灰木护壁",-.89);
Prop("EvacuationStretcher","eastTrackBambooStretcher",-.82,-3.51,[.68,.21,2.12],-19,"近景/撤离物件");
Prop("EvacuationMat","strawSleepingMatFlat",-1.50,-3.49,[.74,.074,1.53],-9,"近景/撤离物件");
Prop("AidSatchel","marketRiceSack01",-1.43,-3.53,[.47,.58,.24],-23,"近景/撤离物件");
Prop("LeftSandbag","battlefieldSandbag02",-1.74,-4.13,[.65,.25,.37],7,"近景/沙袋");
Prop("ShoringSandbag","battlefieldSandbag02",-.32,-6.18,[.67,.18,.34],17,"中景/沙袋",.32);
Prop("ShoringSandbag2","battlefieldSandbag02",-.93,-6.24,[.65,.18,.37],-8,"中景/沙袋",.32);
Prop("RoadVergeTimber","battlefieldTimberBeam",1.10,-2.11,[.81,.06,.12],-29,"近景/路沿碎木");
Prop("RoadVergeSplinter","battlefieldTimberBeam",1.22,-2.23,[.69,.042,.065],-37,"近景/路沿碎木");
Prop("NearType94","type94Tankette",2.83,-11.39,[1.62,1.63,3.08],182,"上层车道/九四式");
Prop("RearType94","type94Tankette",2.48,-21.7,[1.62,1.63,3.08],173,"上层车道/九四式");
for (const [index, [x,z,yaw,size]] of [
  [.61,-8.22,-9,[.87,.43,.53]],[-1.93,-9.50,4,[1.03,.44,.61]],
  [-2.51,-12.38,1,[1.18,.50,.65]],[-3.33,-13.34,7,[.84,.38,.55]],
  [-7.15,-17.06,18,[.87,.39,.60]],[-5.14,-15.0,8,[.92,.49,.44]],
].entries()) Prop(`AmmoCrate${index+1}`,"militaryCrateClosed",x,z,size,yaw,"中景/弹药箱");
for (let index=0; index<12; index++) {
  const x = -2.67 - .52*index, z = -8.1 + .21*Math.sin(index * 1.13);
  Prop(`LeftCoverBag${index+1}`,"battlefieldSandbag02",x,z,[.62,.16,.38],
    rand(-12,14),"中景/矮沙袋");
}

for (const [index,[x,z,h,w,yaw]] of [
  [-8.10,-22.5,5.25,1.86,-9],[-8.7,-35.1,4.8,2.05,54],[-13,-23.3,3.95,2.29,15],
  [16.6,-32,5.75,3.06,91],[12.2,-29,5.34,2.32,-24],[24.5,-38.7,5.9,3.39,32],
  [-11.8,-40,5.6,2.84,95],[-3.28,-35.5,3.5,1.62,83],[5.3,-45,3.75,1.87,7],
  [12.2,-42,4.6,2.2,72],[-10.4,-56,5.38,2.95,-30],[-25.9,-51,4.2,2.72,35],
].entries()) Prop(`TreeLine${index+1}`,"fieldApproachFieldElm",x,z,[w,h,w*.56],yaw,"远景/枯树");
for (let i=0; i<34; i++) {
  const d = rand(37,98), x = rand(-.67*d,.68*d), h = rand(2.11,5.36);
  if (Math.abs(x-roadX(d)) < 3.8 || x<bounds.minX+2 || x>bounds.maxX-2) continue;
  Prop(`ThinSnag${i+1}`,"fieldApproachFieldElm",x,-d,[.52*h,h,.40*h],rand(-180,180),"远景/枯树");
}
for (let i=0; i<410; i++) {
  const d = 1.3 + 26*rng()**1.92;
  const x = rand(-.69*d,.72*d);
  const packed = Math.abs(x-roadX(d)) < 1.5;
  if (packed && rng() < .79) continue;
  const size = rand(.062,.268) * (packed ? .81 : 1);
  Prop(`ScatteredClod${i+1}`,"fieldApproachSoilClod",x,-d,[size,size*rand(.31,.61),size*.79],
    rand(-180,180),"地表/土团",carved(x,-d)-size*.14);
}
for (let i=0; i<63; i++) {
  const d = rand(1.55,19.3), x = eastLip(d) + rand(-.06,.36), s = rand(.13,.29);
  Prop(`LipGrass${i+1}`,"fieldApproachDryGrass",x,-d,[s,s*.32,s*.78],rand(-180,180),"地表/碎根",
    carved(x,-d)-.015);
}
for (let i=0; i<31; i++) {
  const theta = rand(0,2*Math.PI), radius = rand(.14,1.36);
  const x = spoil[0]+Math.cos(theta)*radius, z = spoil[1]+Math.sin(theta)*radius*.77;
  const s = rand(.12,.44);
  Prop(`FreshSpoil${i+1}`,"fieldApproachSoilClod",x,z,[s,s*.49,s*.72],rand(-180,180),"地表/新翻土",
    carved(x,z)-s*.12);
}
for (const [i,[x,z,rx,rz,h]] of [[-93,-204,56,27,2.9],[-26,-246,74,55,3.7],
  [102,-240,68,53,3.8],[192,-315,102,68,5.2]].entries()) {
  objects.push({ id:`HorizonRidge${i+1}`, asset:"Backdrop/Hill", pos:[x,null,z], layer:"backdrop",
    group:"远景/低地平线", params:{ rx,rz,h,color:"#5c5552",topColor:"#777371" } });
}

const marker = (id, name, x, z, note) => ({ id, name, kind: "place", x, z, note });
const smokeColumns = [
  {x:-7.7,z:-40.8,heightOffset:.61,options:{kind:"black",rate:5.9,radius:1.02,rise:1.63,sizeStart:1.26,
    sizeEnd:7.9,life:8.0,opacity:.17,turbulence:.83,wind:{x:1.65,z:-.23},prewarm:true}},
  {x:15.7,z:-39.5,heightOffset:.57,options:{kind:"black",rate:6.9,radius:1.03,rise:1.88,sizeStart:.53,
    sizeEnd:8.7,life:8.0,opacity:.20,turbulence:.65,wind:{x:-1.05,z:-.19},prewarm:true,fire:1.81}},
  {x:3.18,z:-20.9,heightOffset:.14,options:{kind:"dust",rate:12,radius:1.20,rise:.13,sizeStart:.63,
    sizeEnd:2.42,life:4.72,opacity:.132,turbulence:.09,wind:{x:.17,z:.34},prewarm:true,
    colorA:[.25,.216,.197],colorB:[.338,.309,.28]}},
  {x:3.50,z:-12.8,heightOffset:.06,options:{kind:"dust",rate:8,radius:1.18,rise:.10,sizeStart:.37,
    sizeEnd:1.51,life:4.0,opacity:.115,turbulence:.06,wind:{x:.53,z:.18},prewarm:true,
    colorA:[.212,.181,.164],colorB:[.30,.266,.235]}},
  {x:3.0,z:-8.75,heightOffset:.06,options:{kind:"dust",rate:4,radius:.86,rise:.07,sizeStart:.32,
    sizeEnd:1.01,life:2.7,opacity:.083,turbulence:.09,wind:{x:.20,z:-.15},prewarm:true,
    colorA:[.212,.181,.164],colorB:[.30,.266,.235]}},
];
const scene = {
  schema: SCENE_SCHEMA, id, title:"从沟沿望向东侧战车道",
  source:{reference:"06A_坦克车_沟沿看东侧战车道.png",
    notes:"局部 -Z 指向取景方向。依照原画创作独立场景，人物留位，九四式为可编辑静态布设。"},
  bounds, spawn:{x:0,z:0,yawDeg:0}, camera, terrain, trenches, smokeColumns, paint, objects,
  look:{heightTint:{lo:-1.8,hi:1.3},proceduralDressing:false,groundPaintCellM:.22},
  backdrop:{far:690,ground:{color:"#675e57",y:.19,radiusM:540,blendM:19},
    haze:{color:"#686462",fromM:25,toM:180,max:.68},siteBounds:bounds,paint:[]},
  ways:{roads:[],trenches:[]},
  markers:[
    marker("WoundedPosition","沟底伤员位",-.82,-3.51,"伤员沿沟躺靠，靠近断树，担架和草席已就位。"),
    marker("AidPosition","沟底照护位",-.51,-3.50,"在伤员右侧蹲跪，低于路面。"),
    marker("ForwardLookout","横梁外沿留位",-1.55,-4.19,"两处低姿人物均放在沟内侧，保持右侧车道轮廓。"),
    marker("WithdrawalExit","撤离方向",-.96,.85,"向镜头后方沿沟撤。草席旁留出通行空间。"),
    marker("RoadsideSoilBurst","路右侧扬土",...spoil,"游戏机位循环调用既有落地扬尘。"),
  ],
};
const preset = {
  schema:"tengxian-env-preset/1",id,title:"东侧战车道 · 阴云与浮尘",
  looks:[{id:"overcast",label:"阴云",hour:12}],
  components:{
    Sun:{enabled:true,params:{elevation:50,azimuth:217,color:"#eee2d7",intensity:1.49,discIntensity:0}},
    Ambient:{enabled:true,params:{probe:.83,color:"#c9c5c3",intensity:.72}},
    Reflection:{enabled:true,params:{intensity:.23}},
    Sky:{enabled:true,params:{zenith:[.37,.36,.37],horizon:[.43,.413,.41],ground:[.27,.24,.22],glow:0,
      smoke:.22,smokeHeight:.16,smokeColor:[.39,.372,.371]}},
    Clouds:{enabled:true,params:{structure:1,coverage:.98,scale:.88,softness:1.52,warp:.51,underside:.61,
      shade:[.164,.159,.164],gap:.62,silver:0,shapeScale:1.45,shapeCover:.81}},
    Atmosphere:{enabled:true,params:{mie:6.4,mieG:.71,rayleigh:.32,ozone:.5,groundAlbedo:.16,sunIrradiance:2.5,
      skyTint:[.60,.59,.58],skyFloor:[.34,.327,.326],artGlow:0,aerialBlend:.19,aerialGain:.16}},
    Fog:{enabled:true,params:{density:.0135,falloff:13,max:.68,skyColor:[.317,.306,.300],
      groundColor:[.279,.263,.252],sunGain:0,desat:.47,flatten:.068}},
    Grade:{enabled:true,params:{profile:"firstLevelBattleDay",exposure:1.12,saturation:.60,contrast:.95,
      contrastCurve:"soft",gain:[1.02,1,.98],lift:[.009,.008,.008],shadowTint:[.98,1,1.035],
      highlightTint:[1.036,1,.97],splitShadow:.24,splitHighlight:.17,bloom:.06,
      bloomThreshold:1.25,godStrength:0,lensFlare:0}},
  },
};
const zones = {schema:"tengxian-env-scene/1",scene:id,time:{hour:12,speed:0,paused:true},
  volumes:[{id:"Fallback",name:"低云与浮尘",shape:"global",priority:0,blendS:0,mode:"full",preset:id}]};
for (const validation of [ValidateScene(scene),ValidateEnvPreset(preset),ValidateSceneEnv(zones,{presetIds:new Set([id])})]) {
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
}
writeFileSync(new URL(`Scene_${id}.json`,folder),FormatSceneJson(scene));
writeFileSync(new URL(`Environment_${id}.json`,folder),FormatEnvJson(zones));
writeFileSync(new URL(`../../Environment/EnvPreset_${id}.json`,import.meta.url),FormatEnvJson(preset));
