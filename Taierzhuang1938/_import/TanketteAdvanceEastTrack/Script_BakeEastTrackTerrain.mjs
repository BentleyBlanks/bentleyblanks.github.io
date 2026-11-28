// Heightfield is deterministic. --seed-scene writes the first layout and environment.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  EncodeSceneHeights, FormatSceneJson, SCENE_HEIGHT_ENCODING, SCENE_SCHEMA, ValidateScene,
} from "../../Script_SceneDoc.mjs";
import { GridSampler, PrepareSceneTerrain } from "../../Script_SceneTrenches.mjs";
import { FormatEnvJson, ValidateEnvPreset, ValidateSceneEnv } from "../../Script_EnvPreset.mjs";
import { Rng } from "../../Script_FirstLevelPropDressingData.mjs";
import { ValueNoise2 } from "../../Script_Noise.mjs";

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

const roadX = (depth) => 1.96 + .63 * Math.sin(depth * .120 + .18) + Math.max(0, depth - 24) * .054;
const eastLip = (depth) => .30 - .032 * depth + .123 * Math.sin(depth * .81)
  + .053 * Math.sin(depth * 3.8);
const spoil = [3.69, -7.62];
const lift = (x, z, cx, cz, sx, sz) => Math.exp(-(((x-cx)/sx)**2 + ((z-cz)/sz)**2));
// Shallow, broken berms on the far side of the evacuation slot.
const fieldBanks = [
  [-5.1,-10.4,1.5,.57,.24], [-7.5,-13.2,1.43,.73,.25], [-5.8,-15.1,1.3,.62,.19],
  [-4.15,-19.6,1.8,1.18,.23], [-9.2,-21.1,3.6,1.06,.20], [9.98,-20.2,2.2,1.05,.18],
];
const trenches = {
  seed: "TanketteAdvanceEastTrack", earthProfile: "compact",
  segments: [{
    id: "EastTrackDitch", preset: "evacuation", group: "近景/下层撤离沟", look: "bare",
    note: "东壁沿上层车道；深沟向镜头后延伸，前方壕口渐浅。",
    points: [-6,-1.8,.9,3.05,5.37,8.1,11.2,14.9,18,21.4].map(d => [round(eastLip(d)-1.37),-d]),
    depth: 1.43, floorW: 1.70, bankW: .49, bermH: .147, bermW: .64, bermSide: "plus",
    cornerRadiusM: .42, jitterScale: .86,
    depthAlong: [[0,.90],[7.1,.64],[9.1,.53],[10.6,.56],[11.5,.93],[14.5,1.43],[17,1.26],[20,.79],[23,.33],[25.2,.17],[27.45,0]],
    details: { cliffs:{on:false}, spoilSkin:{on:false},
      clods:{chance:.48,count:2,radiusM:[.035,.068],reliefM:[.025,.042]},
      lip:{count:12,radiusM:[.039,.128],reliefM:[.035,.072]},
      spoilClods:{on:false},
      roots:{chance:.63,strands:6}, grass:{chance:.065} },
  }],
};

function GroundAt(x, z) {
  const d = -z;
  const offset = x-roadX(d);
  const shoulder = Math.abs(offset);
  const hardpack = 1 - ease((shoulder - 1.43) / 1.44);
  const fine = (ValueNoise2(x*2.45,z*2.55,591)-.5) * mix(.144,.067,hardpack);
  const churn = (ValueNoise2(x*.87,z*1.62,710)-.5) * mix(.24,.086,hardpack);
  const broad = (ValueNoise2(x*.25,z*.37,812)-.5) * mix(.44,.17,hardpack);
  const tread = .58 + .21*ValueNoise2(z*.55,12,1031);
  const rails = (.052 + .028*ValueNoise2(z*.41,offset*.73,391)) * (1 - ease(Math.abs(shoulder-tread)/.33));
  const crest = .21 + .052 * Math.sin(z*.37) + .15 * ease((d-18)/27) + fine + churn + broad - rails * hardpack;
  // The raised side ends in broken shelves along the cut.
  const outerEdge = eastLip(d)+.19+.19*(ValueNoise2(z*1.39,18,742)-.5);
  const cap = 1-ease((Math.abs(x-outerEdge)-.12)/.35);
  const chunks = ValueNoise2(x*2.15,z*2.07,619);
  const bank = (.111 + .215*chunks) * cap * (1-ease((d-8)/13));
  const mounds = .26*lift(x,z,spoil[0]+.46,spoil[1]-.08,1.12,.86)
    + .16*lift(x,z,spoil[0]-.54,spoil[1]-.54,.71,.55)
    - .22*lift(x,z,spoil[0]-.04,spoil[1]+.05,.34,.33)
    + .22*lift(x,z,17,-27,2.42,1.33) - .20*lift(x,z,-7.2,-18,1.5,1.45);
  const farRelief = .53 * ease((d-27)/33)*(ValueNoise2(x*.068,z*.052,506)-.23);
  const fieldBerms = fieldBanks.reduce((sum,[cx,cz,rx,rz,h]) => sum + h*lift(x,z,cx,cz,rx,rz), 0);
  return crest + bank + mounds + farRelief + fieldBerms;
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

paint.push({ id: "ClearedShellStruckField", color: "#514943", tint: [.93,.88,.84], feather: 1.2, strength:.64,
  poly: [point(-45,-103.5),point(54.5,-103.5),point(54.5,6.5),point(-45,6.5)] });
Line("DitchSoilFloor", "#483e34", [.75,.71,.67], .56, .46, -4, 21, (d) => eastLip(d)-1.45);
Line("FieldPathEastRoad", "#726a61", [1.22,1.12,1.02], 1.96, .82, -4, 100, roadX, .84);
Line("FieldPathWestTrack", "#524a42", [.85,.80,.74], .20, .24, -4, 86, (d) => roadX(d)-.71, .50);
Line("FieldPathEastTrack", "#504941", [.87,.84,.79], .21, .24, -4, 86, (d) => roadX(d)+.69, .51);
Line("DitchSoilFreshSpoil", "#48392e", [.67,.60,.54], .37, .46, 6.92, 8.44,
  (d) => spoil[0]+.18*Math.cos(d), .79);
for (const [i,[from,to,x,halfW,strength]] of [
  [3.92,6.44,1.58,.37,.58], [5.56,8.40,4.06,.44,.62], [7.15,11.58,1.33,.39,.49],
  [9.72,14.52,4.88,.66,.45], [13.5,18.8,1.24,.70,.42],
].entries()) {
  Line(`DitchSoilLooseGround${i+1}`, "#51453d", [.74,.66,.59], halfW, .44, from, to,
    (d) => x + .17*Math.sin(d*.79+i) + .12*Math.sin(d*1.75+i*.37), strength);
}
Line("FieldPathCompactedCrest", "#776b60", [1.29,1.18,1.03], .25, .28, 3.85, 11.1,
  (d) => roadX(d)+.1-.14*Math.sin(d*.93), .49);
Line("FieldPathGravelSkim", "#827365", [1.57,1.44,1.25], .22, .30, 3.48, 7.24,
  (d) => 1.33+.12*d+.23*Math.sin(d*1.54), .58);
Line("FieldPathRaisedPatch", "#827365", [1.46,1.32,1.17], .34, .32, 4.68, 8.47,
  (d) => 3.97+.20*Math.cos(d*.73), .53);
// Keep the freshly cut shoulder above the track tint where they overlap.
Line("DitchSoilCut", "#493c34", [.70,.55,.47], .43, .43, -4, 22, (d) => eastLip(d)-.06, .86);

Prop("ElmAtCamera","eastTrackSplinteredElm",-1.49,-1.82,[2.46,4.61,2.10],23,"近景/取景断榆",-.548);
Prop("ShoringCrossbeam","eastTrackGreyTimberShoring",-2.11,-5.33,[2.42,1.45,.45],-4,"近景/灰木护壁",-.745);
Prop("ShoringFlank","eastTrackDrapedTimberShoring",-1.08,-7.41,[2.31,1.51,.68],9,"中景/灰木护壁",-.81);
const bedPosition = [-1.10,-3.70];
const bedYaw = -136;
const bedGround = carved(...bedPosition);
Prop("EvacuationStretcher","eastTrackBambooStretcher",...bedPosition,[.68,.20,2.12],bedYaw,"近景/撤离物件",bedGround+.06);
Prop("EvacuationMat","strawSleepingMatFlat",-1.53,-4.36,[.55,.064,1.36],-21,"近景/撤离物件");
Prop("DressingBlanket","eastTrackDressingBlanket",-.92,-3.13,[.70,.18,1.09],bedYaw,"近景/撤离物件",bedGround+.43);
Prop("AidSatchel","marketRiceSack01",-1.71,-3.31,[.40,.39,.23],-23,"近景/撤离物件");
Prop("LeftSandbag","battlefieldSandbag02",-1.74,-4.13,[.65,.25,.37],7,"近景/沙袋");
Prop("ShoringSandbag","battlefieldSandbag02",-.47,-7.39,[.56,.11,.31],17,"中景/沙袋",.60);
Prop("ShoringSandbag2","battlefieldSandbag02",-1.38,-7.62,[.54,.12,.30],-8,"中景/沙袋",.57);
Prop("RoadVergeTimber","battlefieldTimberBeam",1.71,-3.92,[.89,.062,.107],32,"近景/路沿碎木",carved(1.71,-3.92)-.015);
Prop("RoadVergeSplinter","battlefieldTimberBeam",1.76,-3.82,[.66,.044,.066],46,"近景/路沿碎木",carved(1.76,-3.82)-.011);
Prop("NearType94","type94Tankette",2.59,-11.37,[1.62,1.63,3.08],174,"上层车道/九四式");
Prop("RearType94","type94Tankette",2.48,-21.7,[1.62,1.63,3.08],169,"上层车道/九四式");
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
for (const [i,[x,z,w,h,yaw]] of [
  [-4.52,-9.5,.96,.10,23],[-3.88,-11.4,1.04,.13,-31],[-6.24,-11.8,.88,.12,22],
  [-7.08,-16.3,1.13,.14,-67],[-5.93,-17.9,.68,.10,18],[-3.72,-17.9,1.06,.12,-37],
  [8.62,-14.6,.97,.17,86], [10.5,-18.5,1.2,.12,-14],
].entries()) {
  Prop(`FieldSplitTimber${i+1}`,"battlefieldTimberBeam",x,z,[w,h,.20],yaw,"中景/碎木");
}
Prop("SplitTreeAcrossField","fieldApproachFieldElm",-6.39,-18.1,[1.64,5.75,.83],-47,"远景/断梢榆树");

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
for (let i=0; i<500; i++) {
  const d = 1.3 + 26*rng()**1.92;
  const x = rand(-.69*d,.72*d);
  const packed = Math.abs(x-roadX(d)) < 1.5;
  if (packed && rng() < .79) continue;
  const size = rand(.032,.155) * (packed ? .63 : 1);
  Prop(`ScatteredClod${i+1}`,"eastTrackBrokenEarth",x,-d,[size,size*rand(.26,.55),size*.79],
    rand(-180,180),"地表/土团",carved(x,-d)-size*.11);
}
for (let i=0; i<118; i++) {
  const d = rand(1.55,21.0), x = eastLip(d) + rand(-.11,.60), s = rand(.16,.43);
  // Most of the cut is bare. The exposed sod survives as flat, broken patches.
  if (ValueNoise2(d*.96,x*5.1,132) < .51) continue;
  Prop(`LipGrass${i+1}`,"eastTrackSettledStubble",x,-d,[s,s*rand(.054,.105),s*rand(.78,1.18)],
    rand(-180,180),"地表/沟沿枯根",carved(x,-d)-.014);
}
for (let i=0; i<760; i++) {
  const d = 2.6 + rng()**1.62 * 52, z = -d, x = rand(-.73*d,.79*d);
  const inRuts = Math.abs(Math.abs(x-roadX(d))-.72) < .34;
  const pocket = ValueNoise2(x*.71,z*.62,655) + .23 * ValueNoise2(x*1.91,z*2.14,709);
  const onRoad = Math.abs(x-roadX(d)) < 1.56;
  if (x < bounds.minX+1 || x > bounds.maxX-1 || inRuts || pocket < (onRoad ? .88 : .53)) continue;
  if (d<4.5 && x<eastLip(d)) continue;
  const s = rand(.11,.49) * (onRoad ? .68 : 1);
  Prop(`FieldStubble${i+1}`,"eastTrackSettledStubble",x,z,[s*1.16,s*rand(.055,.125),s*.94],
    rand(-180,180),"地表/成片残茬",carved(x,z)-.013);
}
for (const [cluster, [cx,cz,rx,rz]] of [[.82,-4.37,.51,.81],[1.26,-6.8,.69,.9],
  [-4.7,-10.7,1.28,1.01],[-3.81,-16.77,1.42,1.35],[5.63,-13.1,.94,1.3]].entries()) {
  for (let i=0; i<11; i++) {
    const angle = rand(0,Math.PI*2), r = rng()**.6;
    const x = cx+Math.cos(angle)*r*rx, z = cz+Math.sin(angle)*r*rz;
    const s = rand(.18,.52);
    Prop(`StubblePocket${cluster+1}_${i+1}`,"eastTrackSettledStubble",x,z,[s,s*rand(.065,.14),s*.91],
      rand(-180,180),"地表/零星草茬",carved(x,z)-.013);
  }
}
for (let i=0; i<55; i++) {
  const theta = rand(0,2*Math.PI), radius = rand(.14,1.05);
  const x = spoil[0]+Math.cos(theta)*radius, z = spoil[1]+Math.sin(theta)*radius*.77;
  const s = rand(.045,.218);
  Prop(`FreshSpoil${i+1}`,"eastTrackBrokenEarth",x,z,[s,s*.49,s*.72],rand(-180,180),"地表/新翻土",
    carved(x,z)-s*.14);
}
// Broken turf breaks into coarse groups with many lower chips between them.
for (let group=0; group<19; group++) {
  const depth = rand(2.75,11.0);
  const offset = rand(.12,1.81);
  const spread = rand(.12,.35);
  for (let chip=0; chip<8; chip++) {
    const d = depth+rand(-spread,spread);
    const x = eastLip(d)+offset+rand(-spread,spread);
    const s = chip === 0 ? rand(.094,.146) : rand(.025,.076);
    Prop(`ShoulderCrumb${group+1}_${chip+1}`,"eastTrackBrokenEarth",x,-d,[s,s*rand(.28,.51),s*rand(.59,.99)],
      rand(-180,180),"地表/沟沿碎土",carved(x,-d)-s*.11);
  }
}
for (const [i,[x,z,rx,rz,h]] of [[-93,-204,56,27,1.16],[-26,-246,74,55,1.63],
  [102,-240,68,53,1.34],[192,-315,102,68,1.71]].entries()) {
  objects.push({ id:`HorizonRidge${i+1}`, asset:"Backdrop/Hill", pos:[x,null,z], layer:"backdrop",
    group:"远景/低地平线", params:{ rx,rz,h,color:"#5c5552",topColor:"#777371" } });
}

const marker = (id, name, x, z, note) => ({ id, name, kind: "place", x, z, note });
const figure = (id, name, x, z, degrees, y, note) =>
  ({ ...marker(id,name,x,z,note), y:round(y), ry:round(degrees*Math.PI/180) });
const smokeColumns = [
  {x:15.12,z:-38.0,heightOffset:.17,options:{kind:"black",rate:0,fire:1.74,sizeStart:.60,
    radius:1.18,lightIntensity:4.8,lightRadius:10,backdrop:{
      seed:60823,life:7.2,ignition:[0,-.24,-62],
      volume:{asset:"EastTrackSoot",bounds:[116,31,86],density:.63,speed:.84}}}},
  {x:-8.43,z:-40.8,heightOffset:2.16,options:{kind:"black",rate:5.6,radius:1.53,rise:.96,sizeStart:2.38,
    sizeEnd:7.5,life:8.4,opacity:.055,turbulence:.58,prewarm:true,
    wind:{x:1.32,z:.12},colorA:[.069,.062,.060],colorB:[.112,.105,.103]}},
  {x:15.11,z:-41.2,heightOffset:1.62,options:{kind:"black",rate:6.2,radius:2.14,rise:1.36,sizeStart:2.93,
    sizeEnd:9.2,life:8.3,opacity:.062,turbulence:.66,prewarm:true,
    wind:{x:-.48,z:-.50},colorA:[.055,.049,.048],colorB:[.100,.093,.092]}},
  {x:2.71,z:-21.1,heightOffset:.17,options:{kind:"dust",rate:13,radius:2.07,rise:.15,sizeStart:.49,
    sizeEnd:2.27,life:5.14,opacity:.103,turbulence:.16,wind:{x:.43,z:.27},prewarm:true,
    colorA:[.194,.177,.158],colorB:[.289,.259,.237]}},
  {x:3.72,z:-10.88,heightOffset:.13,options:{kind:"dust",rate:14,radius:1.79,rise:.074,sizeStart:.42,
    sizeEnd:2.32,life:4.7,opacity:.135,turbulence:.13,wind:{x:.56,z:.18},prewarm:true,
    colorA:[.240,.218,.199],colorB:[.331,.298,.272]}},
  {x:-9.3,z:-33,heightOffset:.22,options:{kind:"dust",rate:11,radius:3.2,rise:.13,sizeStart:.91,
    sizeEnd:2.93,life:5.84,opacity:.081,turbulence:.15,wind:{x:.75,z:.20},prewarm:true,
    colorA:[.172,.157,.149],colorB:[.259,.241,.229]}},
];
const fogVolumes = [
  {shape:"sphere",position:[2.96,.59,-11.6],size:[7.78,1.27,8.02],density:.217,albedo:"#f0e7e1",falloff:1.29},
  {shape:"sphere",position:[2.19,.84,-21.8],size:[6.5,1.55,10.1],density:.074,albedo:"#d9d3d1",falloff:1.42},
  {shape:"sphere",position:[-14.3,1.64,-54.8],size:[38.1,3.26,30.9],density:.036,albedo:"#b6b2b1",falloff:1.68},
  {shape:"sphere",position:[19.4,1.39,-49.7],size:[28.4,2.29,22.2],density:.023,albedo:"#bcb2ad",falloff:1.69},
];
const scene = {
  schema: SCENE_SCHEMA, id, title:"从沟沿望向东侧战车道",
  source:{reference:"06A_坦克车_沟沿看东侧战车道.png",
    notes:"局部 -Z 指向取景方向。此独立场景的主要人物姿态取自项目救护动作库，九四式为可编辑静态布设。"},
  bounds, spawn:{x:0,z:0,yawDeg:0}, camera, terrain, trenches, smokeColumns, fogVolumes, paint, objects,
  look:{heightTint:{lo:-1.8,hi:1.3},proceduralDressing:false,groundPaintCellM:.22,terrainLayers:"EastTrack"},
  backdrop:{far:690,ground:{color:"#645c55",y:.13,radiusM:540,blendM:23},
    haze:{color:"#686264",fromM:21,toM:160,max:.85},siteBounds:bounds,paint:[]},
  ways:{roads:[],trenches:[]},
  markers:[
    figure("WoundedPosition","沟底伤员位",...bedPosition,bedYaw,bedGround+.24,
      "伤员躺在担架上，头侧靠近树根。"),
    figure("AidPosition","沟底照护位",-.51,-4.01,95,carved(-.51,-4.01)+.115,
      "取现有照护动作的一帧，静态贴近担架侧。"),
    figure("ForwardLookout","横梁外沿左位",-2.66,-7.74,11,carved(-2.66,-7.74)-.14,
      "沿下层沟西侧的未挖边落脚，静态低姿。"),
    figure("ForwardLookoutRight","横梁外沿右位",-2.43,-9.12,-24,carved(-2.43,-9.12)-.08,
      "沿下层沟西侧的未挖边落脚，静态低姿。"),
    figure("FieldSoldierLeft","中景左侧人物",-4.28,-15.63,113,carved(-4.28,-15.63),"静态步姿。"),
    figure("FieldSoldierCenter","中景中央人物",-2.87,-17.23,74,carved(-2.87,-17.23),"静态步姿。"),
    figure("FieldSoldierRight","中景沟口人物",-.17,-15.94,109,carved(-.17,-15.94),"静态低姿。"),
    marker("WithdrawalExit","撤离方向",-.96,.85,"向镜头后方沿沟撤。草席旁留出通行空间。"),
    marker("RoadsideSoilBurst","路右侧扬土",...spoil,"游戏机位循环调用既有落地扬尘。"),
  ],
};
const preset = {
  schema:"tengxian-env-preset/1",id,title:"东侧战车道 · 阴云与浮尘",
  looks:[{id:"overcast",label:"阴云",hour:12}],
  components:{
    Sun:{enabled:true,params:{elevation:34,azimuth:296,color:"#efe6dc",intensity:1.63,discIntensity:0}},
    Ambient:{enabled:true,params:{probe:.83,color:"#d1ccc9",intensity:.70}},
    Reflection:{enabled:true,params:{intensity:.23}},
    Sky:{enabled:true,params:{zenith:[.37,.352,.371],horizon:[.365,.345,.351],ground:[.27,.24,.22],glow:0,
      smoke:.88,smokeHeight:.059,smokeColor:[.375,.354,.368],hazeTint:[.46,.46,.46]}},
    Clouds:{enabled:true,params:{structure:.19,coverage:.77,scale:2.03,softness:.74,warp:.66,underside:.34,
      fadeHeight:.127,shade:[.359,.339,.357],gap:.96,silver:0,shapeScale:.96,shapeCover:.61}},
    Atmosphere:{enabled:true,params:{mie:6.4,mieG:.71,rayleigh:.32,ozone:.5,groundAlbedo:.16,sunIrradiance:1.18,
      skyTint:[.48,.46,.47],skyFloor:[.452,.431,.45],artGlow:0,aerialBlend:.09,aerialGain:.15}},
    Fog:{enabled:true,params:{profile:"firstLevelBattleDay",density:.0204,falloff:7.7,max:.86,skyScale:.51,skyColor:[.134,.121,.123],
      groundColor:[.245,.224,.217],sunGain:.015,desat:.43,flatten:.056}},
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
