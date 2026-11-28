// Rebuild the terrain heightfield. --seed-scene also regenerates the initial layout and daylight.
import { writeFileSync } from "node:fs";
import { SCENE_HEIGHT_ENCODING, SCENE_SCHEMA, EncodeSceneHeights, FormatSceneJson, ValidateScene } from "../../Script_SceneDoc.mjs";
import { FormatEnvJson, ValidateEnvPreset, ValidateSceneEnv } from "../../Script_EnvPreset.mjs";
import { Rng } from "../../Script_FirstLevelPropDressingData.mjs";

const id = "GengjiazhuangFieldApproach";
const dir = new URL(`../../Scenes/${id}/`, import.meta.url);
const terrainFile = `Scene_${id}.height.bin`;
const bounds = { minX: -112, maxX: 112, minZ: -160.3, maxZ: 9.1 };
const terrain = { file: terrainFile, encoding: SCENE_HEIGHT_ENCODING,
  minX: bounds.minX, minZ: bounds.minZ, cellM: .35, cols: 640, rows: 484 };
const seed = Rng(0x193803);
const camera = { position: [0, 1.36, 0], yawDeg: 0, pitchDeg: -4.52, fovDeg: 42 };
const focusRoad = [
  [6.9, 3.4], [9.4, 2.32], [13, 1.70], [17, -.81], [20, -2.89], [24, -4.44],
  [30, -6.38], [36, -7.49], [43, -6.68], [50, -6.8], [65, -10.2], [82, -11.43],
  [94, -8.6], [108, -4.0], [129, 4.7], [159, 16],
];
const fields = [-8.5, -13.6, -21, -28, -41, -56, -74, -96, -123, -150];
const mix = (a, b, t) => a + (b - a) * t;
const cut = (t) => Math.max(0, Math.min(1, t));
const ease = (t) => { const u = cut(t); return u * u * (3 - 2 * u); };
const round = (x) => +x.toFixed(3);
const point = (x, z) => ({ x: round(x), z: round(z) });
const rand = (lo, hi) => mix(lo, hi, seed());

function RoadX(depth) {
  const index = focusRoad.findIndex(([d]) => d > depth);
  if (index === 0) return focusRoad[0][1];
  if (index < 0) return focusRoad.at(-1)[1];
  const [a, b] = focusRoad.slice(index - 1, index + 1);
  const before = focusRoad[Math.max(0, index - 2)], after = focusRoad[Math.min(focusRoad.length - 1, index + 1)];
  const t = (depth - a[0]) / (b[0] - a[0]);
  const s0 = (b[1] - before[1]) / (b[0] - before[0]) * (b[0] - a[0]);
  const s1 = (after[1] - a[1]) / (after[0] - a[0]) * (b[0] - a[0]);
  return a[1] + s0*t + (3*(b[1]-a[1]) - 2*s0 - s1)*t*t + (2*(a[1]-b[1])+s0+s1)*t*t*t;
}

const NearEdge = (x) => 2.32 + .13 * Math.sin(x * 1.21) + .07 * Math.sin(x * 3.59);
const FarEdge = (x) => 5.31 + .135 * Math.sin(x * .82) + .105 * Math.sin(x * 2.71) + .052 * Math.cos(x * 5.21);
const FieldEdge = (x, level) => level + .28 * Math.sin(x*.12 + level) + .17 * Math.cos(x*.42 + level*.21);

function GroundAt(x, z) {
  const depth = -z;
  const near = NearEdge(x), far = FarEdge(x);
  const subtle = .027 * Math.sin(x*6.9 + z*5.4) + .020*Math.cos(x*11.7 - z*7.12);
  if (depth < far) {
    const rightPocket = .88 * ease((x - 1.35)/1.74);
    const rim = .442 + .047 * Math.sin(x*1.53) + .033*Math.cos(x*2.7);
    const trenchBase = .018 - rightPocket + .065*Math.sin(x*.53) + subtle;
    const down = ease((depth - near) / .75);
    const up = ease((depth - (far -.88))/ .88);
    const close = mix(.34 + .071*Math.sin(x*.61) + subtle, rim, ease(depth / near));
    return mix(mix(close, trenchBase, down), .43 + subtle*.52, up);
  }
  const fieldH = .429 - .57*ease((depth - 7.2) / 15) - 1.62*ease((depth - 10) / 43);
  const broad = .085*Math.sin(x*.12+z*.155)*ease((depth-5.3)/8);
  const offset = Math.abs(x - RoadX(depth));
  const road = 1 - ease((offset - .65) / .87);
  let banks = 0;
  for (const edge of fields) {
    const distance = Math.abs(z - FieldEdge(x, edge));
    banks += .115 * (1 - ease(distance / .86));
  }
  const furrows = .031*Math.sin(z*8.1 + .31*Math.sin(x*.20));
  const ruts = .026*(1 - ease(Math.abs(offset-.39)/.19));
  return fieldH + broad + (1-road)*(banks + furrows + subtle) - road*(ruts + .021);
}

const heights = new Float32Array((terrain.cols + 1) * (terrain.rows + 1));
for (let iz = 0; iz <= terrain.rows; iz++) {
  const z = terrain.minZ + iz * terrain.cellM;
  for (let ix = 0; ix <= terrain.cols; ix++) {
    const x = terrain.minX + ix * terrain.cellM;
    heights[iz * (terrain.cols + 1) + ix] = GroundAt(x, z);
  }
}
writeFileSync(new URL(terrainFile, dir), Buffer.from(EncodeSceneHeights(heights)));
if (!process.argv.includes("--seed-scene")) process.exit(0);

const objects = [], paint = [];
function Prop(name, asset, x, z, size, yawDeg, group, { y, solid = false } = {}) {
  const slope = asset === "DryGrass" ? .057 * size[1] / .267 : .013;
  objects.push({ id: name, asset: `Prop/fieldApproach${asset}`,
    pos: [round(x), round(y ?? GroundAt(x, z) - slope), round(z)],
    yawDeg: round(yawDeg), size: size.map(round), solid, group, params: { grounding: "authored" } });
}

function Strip(id, a, b, color, tint, min = bounds.minX, max = bounds.maxX, feather = .58) {
  const segments = Math.ceil((max-min)/4);
  const x = Array.from({ length: segments+1 }, (_, i) => min + (max-min)*i/segments);
  const poly = x.map(n => point(n, a(n))).concat(x.toReversed().map(n => point(n, b(n))));
  paint.push({ id, color, tint, poly, feather });
}

Strip("DitchSoilCut", x => -FarEdge(x) + .20, x => -NearEdge(x) + .22, "#876447", [1.05, .89, .71], -25, 25, .34);
Strip("FieldPathDitchFloor", x => -FarEdge(x) + .705, x => -NearEdge(x) - .61,
  "#94714e", [1.04,.94,.82], -8, 7, .28);
Strip("DitchSoilEye", x => -NearEdge(x) + .29, x => 3.6 + .41*Math.sin(x*.46), "#4f392a", "#827469", -20, 20, .38);
Strip("FieldStubbleVerge", x => -FarEdge(x)-2.32, x => -FarEdge(x)+.01, "#6c623e", "#c4b18b", -40, 42, .47);
for (let i=0; i<fields.length-1; i++) {
  const near=fields[i], far=fields[i+1];
  const spoil = i%3===1 || i===3 || i===7;
  const mask = spoil ? "DitchSoilPloughed" : "FieldWheat";
  const tint = spoil ? (i===1 ? "#a59585" : "#b9aa97") : ["#b1ca76","#bdd097","#a6c278"][i%3];
  for (const [j, min, max] of [[0,bounds.minX,-18+(i%3)*5],[1,-18+(i%3)*5,18-(i%4)*3],[2,18-(i%4)*3,bounds.maxX]]) {
    const offset = j===1 && i>2 ? 1.4 : .3*j;
    Strip(`${mask}${i}_${j}`, x=>FieldEdge(x,far)+.3+offset, x=>FieldEdge(x,near)-.39+offset,
      spoil ? "#624a37" : "#667045", tint, min + .38, max - .37, .62);
  }
}
const road = Array.from({ length: 170 }, (_, i) => { const d=6.85+i*.89; return point(RoadX(d),-d); });
paint.push({ id:"FieldPathRoadBed", color:"#a38258", tint:[1.10,1.00,.78], line:road, halfW:.66, feather:.29, strength:.70 });
for (const lateral of [-.39,.39]) {
  paint.push({ id: lateral<0 ? "FieldPathLeftRut" : "FieldPathRightRut",
    color: "#be9e68", tint: [1.36, 1.18, .89], line: road.map(p=>point(p.x+lateral,p.z)), halfW: .325, feather: .38 });
}

Prop("CroppedOldElm","OldElm",-2.53,-7.03,[5.92,5.67,4.63],2,"沟沿/大树",{ y:.31 });
Prop("CroppedLoadedCart","LoadedCart",3.91,-4.88,[1.88,1.77,3.74],-113,"沟沿/木车",{ y:-.805 });
Prop("PackDonkeyAtBend","PackDonkey",-2.31,-19.05,[.86,1.13,1.50],158,"田间小路/驮草小驴");

const village = [
  [-13.12,-109,5.77,2.78,3.9,-29], [-9.11,-102,5.8,2.89,3.7,11],
  [-6.60,-108,7.5,3.29,4.2,-30], [-2.76,-89,6.6,3.54,4.54,-22],
  [3.04,-105,8.12,2.95,4.15,28], [5.31,-83,7.43,3.26,4.45,16],
  [12.56,-87,7.26,3.02,4.33,-13], [17.21,-105,5.98,2.51,3.96,29],
  [-1.9,-118,7.37,3.25,4.7,10], [8.83,-95,6.21,3.26,4.4,-10],
];
for (const [i, [x,z,w,h,d,yaw]] of village.entries())
  Prop(`Farmhouse${i+1}`,"TileFarmhouse",x,z,[w,h,d],yaw,"耿家庄/灰瓦院落",{ solid:true });
for (const [i,[x,z]] of [[-80,-145],[-73,-139],[-63,-134],[-55,-143],[-49,-149],[54,-145],
  [62,-138],[69,-145],[75,-133],[85,-147],[92,-152]].entries())
  Prop(`HorizonFarmhouse${i+1}`,"TileFarmhouse",x,z,[rand(4.6,7),rand(1.6,2.38),rand(3.4,4.55)],
    rand(-33,32),"地平线/村落");

const elmAnchors = [
  [-15.7,-45,3.20,4.0,-31], [-19.2,-67,3.93,5.23,17],
  [-4.4,-63,2.2,3.65,-46], [4.6,-42,3.22,4.89,5],
  [7.37,-28.8,4.35,4.84,-29], [11.38,-32.9,4.05,4.71,33],
  [26.4,-57,3.07,4.67,-9], [52,-97,5.7,5.9,16],
  [63,-105,4.04,5.42,-52], [-42,-106,3.67,4.8,30], [-39,-91,4.01,5.13,-18],
];
for (const [i,[x,z,w,h,yaw]] of elmAnchors.entries())
  Prop(`FieldElm${i+1}`,"FieldElm",x,z,[w,h,w*.65],yaw,"田间/裸树");
for (let i=0;i<37;i++) {
  const x=rand(-103,103), z=rand(-157,-96), height=rand(2.5,5.1);
  Prop(`DistantElm${i+1}`,"FieldElm",x,z,[height*rand(.62,.90),height,height*.49],
    rand(-180,180),"地平线/裸树");
}
for (let n=0; n<10; n++) {
  if (n===2 || n===7) continue;
  const x=-2.73+n*3.38, z=-28.2-.25*n-1.47*Math.sin(n*.45);
  Prop(`FenceBay${n+1}`,"SplitRailFence",x,z,[3.53,rand(.72,.91),rand(.19,.27)],rand(-11,5),"田间/枝条栅栏");
}
Prop("RoadsideStrawRick","StrawRick",11.35,-28.15,[2.83,1.29,1.81],13,"田间/草垛");
Prop("SmallDistantRick","StrawRick",-32,-77,[2.19,.81,1.27],-11,"田间/草垛");

for (let i=0;i<1080;i++) {
  const t=seed(), d=mix(8.2,57,t*t), x=rand(-d*.77,d*.77);
  if (Math.abs(x-RoadX(d))<1.15 || (d>13.8 && d<20.7) || (d>28.2 && d<40.7)) continue;
  const size=rand(.78,1.43);
  Prop(`Wheat${i+1}`,"WheatTuft",x,-d,[.226*size,.154*size,.187*size],rand(-180,180),"田间/矮麦苗");
}
for (let i=0;i<780;i++) {
  const x=rand(-6.8,6.9), near=i<238;
  const edge=near ? NearEdge(x) : FarEdge(x);
  const d=edge + (near ? rand(-.51,.20) : rand(-.24,1.89));
  const s=rand(.65,1.32);
  const h=(near ? .09 : .128)*s;
  Prop(`DitchGrass${i+1}`,"DryGrass",x,-d,[.35*s,h,.31*s],rand(-180,180),"沟沿/干草与裸根");
}
for (let i=0;i<780;i++) {
  const d=2.0 + 19.4 * seed()**1.67, x=rand(-Math.max(2.3,d*.69),Math.max(2.3,d*.69));
  if (d>6 && d<13.4 && seed()<.72) continue;
  if (d>6.85 && Math.abs(x-RoadX(d))<.8) continue;
  const s=rand(.40,1.34) * (d>11.5 ? 1.17 : .64);
  Prop(`Clod${i+1}`,"SoilClod",x,-d,[.139*s,.070*s,.115*s],rand(-180,180),d<9 ? "沟沿/土块" : "田间/翻土");
}
for (const [i,[x,z,rx,rz,h,topColor]] of [
  [-193,-588,103,61,4.4,"#8997a0"],[-128,-490,58,57,9.2,"#8597aa"],
  [-69,-489,71,54,3.6,"#8c98a6"],[52,-589,91,56,2.8,"#909ba3"],
  [201,-508,102,62,4.3,"#9099a0"],[393,-669,182,87,5.3,"#91a0ac"],
].entries()) objects.push({ id:`FarRidge${i+1}`, asset:"Backdrop/Hill", pos:[x,null,z],
  layer:"backdrop", group:"地平线/远岗", params:{ rx,rz,h,color:"#797f77",topColor } });

const scene = {
  schema: SCENE_SCHEMA, id, title:"从沟沿望向耿家庄",
  source:{ reference:"Reference_GengjiazhuangFieldApproach.png",
    notes:"按原画制作的独立环境场景。沟、田路、村屋和农具的布设为创作性复原。" },
  bounds, spawn:{ x:0,z:0,yawDeg:0 }, camera, terrain,
  smokeColumns:[{ x:-4.72,z:-86.7,heightOffset:3.08,options:{
    kind:"black", rate:4.8, radius:.19, rise:1.39, sizeStart:.29, sizeEnd:2.75, life:5.4,
    opacity:.135, turbulence:.18, wind:{x:.82,z:.19}, prewarm:true, fire:0,
  }}],
  look:{ heightTint:{ lo:-2.4,hi:1.5 }, proceduralDressing:false, groundPaintCellM:.28 },
  backdrop:{
    far:1150, ground:{color:"#777c63",y:-1.87,radiusM:950,blendM:28},
    haze:{color:"#9caab8",fromM:135,toM:740,max:.52}, siteBounds:bounds, paint:[],
  },
  paint, ways:{roads:[],trenches:[]}, objects,
};

const preset = {
  schema:"tengxian-env-preset/1", id, title:"耿家庄田间 · 薄云日光",
  looks:[{id:"day",label:"白天",hour:12}],
  components:{
    Sun:{enabled:true,params:{elevation:43,azimuth:315,color:"#fff1dd",intensity:3.03,discIntensity:.25}},
    Ambient:{enabled:true,params:{probe:.81,color:"#d8deea",intensity:.49}},
    Reflection:{enabled:true,params:{intensity:.24}},
    Sky:{enabled:true,params:{zenith:[.74,.89,1.13],horizon:[.76,.83,.96],ground:[.29,.276,.264],glow:.03,smoke:0}},
    Clouds:{enabled:true,params:{structure:.80,coverage:.82,scale:2.17,softness:.75,warp:.81,underside:.18,
      shade:[.70,.79,.93],gap:.82,silver:.12}},
    Atmosphere:{enabled:true,params:{mie:3.7,mieG:.75,rayleigh:.67,ozone:1,groundAlbedo:.20,sunIrradiance:8.9,
      skyTint:[.86,.96,1.13],skyFloor:[.75,.83,.95],artGlow:.045,aerialBlend:.51,aerialGain:.31}},
    Fog:{enabled:true,params:{profile:"firstLevelBattleDay",density:.00158,falloff:21,max:.59,skyColor:[.57,.62,.71],
      groundColor:[.53,.565,.62],sunGain:.03,desat:.23,flatten:.027}},
  },
};
const zones = {
  schema:"tengxian-env-scene/1", scene:id, time:{hour:12,speed:0,paused:true},
  volumes:[{id:"Fallback",name:"田间薄云日光",shape:"global",priority:0,blendS:0,mode:"full",preset:id}],
};

for (const check of [ValidateScene(scene), ValidateEnvPreset(preset), ValidateSceneEnv(zones, {presetIds:new Set([id])})]) {
  if (!check.ok) throw new Error(check.errors.join("\n"));
}
writeFileSync(new URL(`Scene_${id}.json`,dir),FormatSceneJson(scene));
writeFileSync(new URL(`Environment_${id}.json`,dir),FormatEnvJson(zones));
writeFileSync(new URL(`../../Environment/EnvPreset_${id}.json`,import.meta.url),FormatEnvJson(preset));
