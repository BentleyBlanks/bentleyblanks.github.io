// 战车机枪的弹道光束与硬面火星（Data_Tuning_BulletVisual）：真 GPU 上数像素。
//
// 2026-09-22 用户要「看到清晰的一条子弹的光束」与「子弹在墙上飞溅的火花」。
// 「visible 不等于看得见」：这里不看粒子池有没有写进去，只看画面上多了几个像素 ——
//   · 同一条 30 m 弹道，光束点亮的像素要远多于旧的 Tracer 短曳光；
//   · 远端一列至少两像素宽（像素保底），贴着脸飞过去不超过像素上限；
//   · 砖墙溅火星、沙袋/土不溅、步枪不传 hardSparks 也不溅；
//   · 第一关白盒按体块分弹着表面：墙体按 tag 落砖、沙袋墙 sandbag、木料 wood。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const project = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(project, "_shots/VehicleTracer");
fs.mkdirSync(shots, { recursive: true });

// 接线：战车机枪这一条链真的走光束与火星，三条弹着链都认碰撞盒自带的 surface。
const mainSource = fs.readFileSync(path.join(project, "Script_Main.mjs"), "utf8");
const vehicle = mainSource.slice(mainSource.indexOf("function FireVehicleBullet("),
  mainSource.indexOf("function FireEmplacedShot("));
assert.match(vehicle, /vfx\.TracerBeam\(from,end,\{kind:"ija"\}\)/, "vehicle MG draws one beam per round");
assert.doesNotMatch(vehicle, /vfx\.Tracer\(/, "vehicle MG no longer uses the short streak tracer");
assert.match(vehicle, /hardSparks:true,incoming:direction/, "vehicle MG wall hits request hard-surface sparks");
assert.match(vehicle, /ImpactSurface\(result\.wall\.box,"dirt"\)/);
assert.match(mainSource, /const surface = ImpactSurface\(shot\.wall\.box, "brick"\);/, "player rifle honours box.surface");
assert.match(mainSource, /const surface = ImpactSurface\(result\.wall\.box, "brick"\);/, "emplaced MG honours box.surface");
assert.match(mainSource, /whiteboxWall: "brick"/, "whitebox walls are masonry by tag");
assert.match(mainSource, /vfx\.TracerBeam\(eye\.clone\(\)/, "level warm-up compiles the beam pool");

const importMap = fs.readFileSync(path.join(project, "index.html"), "utf8")
  .match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
const check = path.join(project, "_check_VehicleTracer.html");
fs.writeFileSync(check, `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#8aa4c8}canvas{display:block}
</style><script type="importmap">${importMap}</script>
<script>addEventListener("error",()=>{window.R=null;});addEventListener("unhandledrejection",()=>{window.R=null;});</script>
</head><body><script type="module">
import * as THREE from "three";
import {VfxSystem} from "./Script_Vfx.mjs";
import {VEHICLE_TRACER,HARD_SURFACE_SPARKS} from "./Data_Tuning_BulletVisual.mjs";
import {BuildSink} from "./Script_World.mjs";
import {WhiteboxSurface} from "./Script_FirstLevelWhiteboxField.mjs";
import {MISSION_LAYOUT} from "./Data_FirstLevelMissionLayout.mjs";
const W=1280,H=720;
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
renderer.setSize(W,H);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x8aa4c8);   // 白天的天空：加性光束最难读的底
const camera=new THREE.PerspectiveCamera(60,W/H,.1,400);camera.position.set(0,1.6,0);camera.lookAt(0,1.3,-30);camera.updateMatrixWorld(true);
scene.add(new THREE.HemisphereLight(0xc7d3df,0x51483d,1.2));
const vfx=new VfxSystem(scene,null,{quality:"high",maxParticles:4000});vfx.SetFog(null);
vfx.shared.uResolution.value.set(W,H);
let clock=1;
function Advance(dt){clock+=dt;vfx.Update(dt,camera,clock);}
Advance(0);   // 粒子时钟先对上：生成时刻取 vfx.time，之后按同一条时钟推寿命
function Pixels(){renderer.render(scene,camera);const gl=renderer.getContext(),p=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
// 同一帧、同一时刻，把指定池藏掉再画一遍：差出来的像素就是那几个池画上去的。
function Changed(pools){const on=Pixels();for(const p of pools)vfx.pools[p].mesh.visible=false;const off=Pixels();for(const p of pools)vfx.pools[p].mesh.visible=true;
  const mask=new Uint8Array(W*H);let count=0;
  for(let i=0,j=0;i<on.length;i+=4,j++){const d=Math.abs(on[i]-off[i])+Math.abs(on[i+1]-off[i+1])+Math.abs(on[i+2]-off[i+2]);if(d>18){mask[j]=1;count++;}}
  return {count,mask};}
// 屏幕上投影点所在那一列里，沿竖直方向数被点亮的像素（光束近乎水平时这就是线宽）
function ColumnWidth(mask,world,span=40){const v=world.clone().project(camera),x=Math.round((v.x*.5+.5)*W),y=Math.round((v.y*.5+.5)*H);
  let n=0;for(let dy=-span;dy<=span;dy++){const yy=y+dy;if(yy<0||yy>=H||x<0||x>=W)continue;n+=mask[yy*W+x];}return {x,y,n};}
const r={};
// 1) 30 m 横穿画面的一条弹道：光束 vs 旧曳光
{const from=new THREE.Vector3(-14,1.2,-44),to=new THREE.Vector3(12,1.5,-30);
 vfx.ClearParticles();vfx.TracerBeam(from,to,{kind:"ija"});const flight=vfx.lastTracerBeam.flight;
 Advance(flight+1/60);const beam=Changed(["beam"]);
 r.beam={count:beam.count,flight,life:vfx.lastTracerBeam.life,
   far:ColumnWidth(beam.mask,from.clone().lerp(to,.12)),mid:ColumnWidth(beam.mask,from.clone().lerp(to,.5))};
 Advance(vfx.lastTracerBeam.life);r.beamGone=Changed(["beam"]).count;
 vfx.ClearParticles();vfx.Tracer(from,to,{kind:"ija"});Advance(from.distanceTo(to)/480*.5);r.tracer=Changed(["streak"]).count;}
// 2) 贴着脸飞过去：离相机 2 m 处的线宽不超过像素上限
{const from=new THREE.Vector3(-18,1.2,-40),to=new THREE.Vector3(3.5,1.45,6);
 vfx.ClearParticles();vfx.TracerBeam(from,to,{kind:"ija"});Advance(vfx.lastTracerBeam.flight+1/60);
 const near=Changed(["beam"]);const dir=to.clone().sub(from).normalize();
 // 光束上离相机约 2.5 m 的那一点（取线上与相机最近点往回退 2 m）
 const t=camera.position.clone().sub(from).dot(dir),closest=from.clone().addScaledVector(dir,t-2);
 r.near={count:near.count,at:closest.toArray(),width:ColumnWidth(near.mask,closest,80),distance:closest.distanceTo(camera.position)};}
// 3) 砖墙溅火星；沙袋、土、以及不传 hardSparks 的步枪都不溅
{const wall=new THREE.Mesh(new THREE.PlaneGeometry(8,4),new THREE.MeshStandardMaterial({color:0x5a6d80,roughness:.9}));
 wall.position.set(0,1.5,-10);scene.add(wall);
 const point=new THREE.Vector3(0,1.4,-9.99),normal=new THREE.Vector3(0,0,1),incoming=new THREE.Vector3(.5,-.1,-1).normalize();
 const streak=()=>vfx.pools.streak.cursor,star=()=>vfx.pools.star.cursor;
 vfx.ClearParticles();vfx.lastHardSurfaceSparks=null;
 let s0=streak(),f0=star();vfx.Impact(point,normal,"brick",{weaponKind:"lmg",hardSparks:true,incoming});
 r.brick={streaks:(streak()-s0+vfx.pools.streak.capacity)%vfx.pools.streak.capacity,flash:(star()-f0+vfx.pools.star.capacity)%vfx.pools.star.capacity,
   last:vfx.lastHardSurfaceSparks};
 Advance(.05);r.brick.pixels=Changed(["streak","star"]).count;
 const quiet={};
 for(const [id,surface,opts] of [["sandbag","sandbag",{hardSparks:true,incoming}],["dirt","dirt",{hardSparks:true,incoming}],["rifleBrick","brick",{weaponKind:"boltRifle"}]]){
   vfx.ClearParticles();vfx.lastHardSurfaceSparks=null;const a=streak(),b=star();vfx.Impact(point,normal,surface,opts);
   quiet[id]={streaks:streak()-a,flash:star()-b,last:vfx.lastHardSurfaceSparks};}
 r.quiet=quiet;scene.remove(wall);}
// 4) 白盒体块的弹着表面
{const byId=id=>MISSION_LAYOUT.blocks.find(b=>b.id===id);
 r.surfaces=Object.fromEntries(["BundleTankScreen2","FrontTraverseBlastScreen","GuardWaitingCover6","FrontParapet15","BundleCrawlFirstRoof","FieldRuin1"]
   .map(id=>[id,byId(id)?WhiteboxSurface(byId(id),MISSION_LAYOUT):"(missing)"]));
 const sink=new BuildSink();sink.Solid(0,1,0,1,1,1,"whiteboxWall",0,"sandbag");sink.Solid(0,1,0,1,1,1,"whiteboxWall",0);
 r.sink=sink.colliders.map(c=>c.surface??null);}
r.tuning={VEHICLE_TRACER,HARD_SURFACE_SPARKS};
const gl=renderer.getContext();r.glError=gl.getError();
window.R=r;window.ready=true;
</script></body></html>`);

const server = await ServeRoot(path.resolve(project, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/_check_VehicleTracer.html`);
  await page.waitForFunction(() => window.ready || window.R === null, null, { timeout: 120000 });
  const r = await page.evaluate(() => window.R);
  assert.ok(r, `check page failed: ${errors.join(" | ")}`);
  fs.writeFileSync(path.join(shots, "Data_VehicleTracerResults.json"), JSON.stringify({ r, errors }, null, 2));
  const T = r.tuning.VEHICLE_TRACER;

  // 1) 光束读得出来，而且是一整条线
  assert(r.beam.count >= 1200, `beam lights a whole line across the frame: ${JSON.stringify(r.beam)}`);
  assert(r.beam.count >= 6 * Math.max(1, r.tracer), `beam is far more visible than the old streak tracer: beam ${r.beam.count} vs tracer ${r.tracer}`);
  assert(r.beam.far.n >= 2, `far end keeps a pixel floor: ${JSON.stringify(r.beam.far)}`);
  assert(r.beam.mid.n >= 2, `mid span keeps a pixel floor: ${JSON.stringify(r.beam.mid)}`);
  assert.equal(r.beamGone, 0, "beam fully fades by the end of its life");
  // 2) 贴脸：像素上限（全宽 = 2 × 半宽，留 2 px 给光栅化取整）
  assert(r.near.count > 0, "near pass is drawn");
  assert(r.near.width.n <= 2 * T.maxHalfWidthPx + 2, `near pass is capped, not a light bar: ${JSON.stringify(r.near)}`);
  // 3) 火星
  assert(r.brick.streaks >= 8, `brick hit sprays sparks: ${JSON.stringify(r.brick)}`);
  assert.equal(r.brick.flash, 1, "brick hit flashes once");
  assert.ok(r.brick.last && r.brick.last.count === r.brick.streaks, "spark receipt matches the pool");
  assert(r.brick.last.axis[2] > 0.2, `sparks spray back off the wall face: ${JSON.stringify(r.brick.last.axis)}`);
  assert(r.brick.pixels >= 60, `sparks are visible on screen: ${r.brick.pixels}`);
  for (const [id, q] of Object.entries(r.quiet)) {
    assert.equal(q.streaks, 0, `${id} does not spark`);
    assert.equal(q.flash, 0, `${id} does not flash`);
    assert.equal(q.last, null, `${id} leaves no spark receipt`);
  }
  // 4) 白盒弹着表面
  assert.deepEqual(r.surfaces, {
    BundleTankScreen2: null, FrontTraverseBlastScreen: null,   // null = 按 tag（whiteboxWall）落砖墙
    GuardWaitingCover6: "sandbag", FrontParapet15: "sandbag",
    BundleCrawlFirstRoof: "wood", FieldRuin1: null,
  });
  assert.deepEqual(r.sink, ["sandbag", null]);
  assert.equal(r.glError, 0);
  assert.deepEqual(errors, []);
  console.log(`PASS VehicleTracer: beam ${r.beam.count}px vs tracer ${r.tracer}px, far ${r.beam.far.n}px, near ${r.near.width.n}px, ` +
    `brick ${r.brick.streaks} sparks/${r.brick.pixels}px, sandbag/dirt/rifle quiet, whitebox surfaces resolved`);
} finally {
  await page.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(check, { force: true });
}
