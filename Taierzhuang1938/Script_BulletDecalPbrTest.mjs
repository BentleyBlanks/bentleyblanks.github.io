// 3× PBR bullet-impact atlas: source contract, selector contract, real GPU load/render.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const project = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(project, "_shots/BulletDecalPbr");
fs.mkdirSync(shots, { recursive: true });

for (const name of [
  "Texture_BulletImpactPbrAtlasBase.webp",
  "Texture_BulletImpactPbrAtlasNormal.webp",
  "Texture_BulletImpactPbrAtlasOrm.webp",
]) {
  const bytes = fs.readFileSync(path.join(project, "Texture", name));
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
  assert(bytes.length > 100_000, `${name} must retain detailed imagegen material data`);
}
const mainSource = fs.readFileSync(path.join(project, "Script_Main.mjs"), "utf8");
const aiSource = fs.readFileSync(path.join(project, "Script_Ai.mjs"), "utf8");
const aircraftSource = fs.readFileSync(path.join(project, "Script_Aircraft.mjs"), "utf8");
assert.match(mainSource, /Impact\(_hitPoint, n, surface, \{ weaponKind: weapon\.kind \}\)/);
assert.match(mainSource, /weaponKind: mountedWeapon\.kind/);
assert.match(mainSource, /weaponKind:weapon\.kind/);
assert.match(aiSource, /Impact\(p, normal, surface, \{ weaponKind: s\.weapon\.kind \}\)/);
assert.match(aircraftSource, /Impact\(at, normal, surface, \{ weaponKind: "hmg" \}\)/);

const importMap = fs.readFileSync(path.join(project, "index.html"), "utf8")
  .match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
const check = path.join(project, "_check_BulletDecalPbr.html");
fs.writeFileSync(check, `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#25282a}canvas{display:block}
</style><script type="importmap">${importMap}</script></head><body><script type="module">
import * as THREE from "three";
import {VfxSystem,VFX_PALETTE,SelectBulletDecalVariant} from "./Script_Vfx.mjs";
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(1280,720);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x25282a);
const camera=new THREE.PerspectiveCamera(42,1280/720,.1,40);camera.position.set(0,1.35,4.4);camera.lookAt(0,1.25,0);
const wall=new THREE.Mesh(new THREE.PlaneGeometry(5.4,2.8),new THREE.MeshStandardMaterial({color:0x74746b,roughness:.94,side:THREE.DoubleSide}));
wall.position.y=1.3;scene.add(wall);scene.add(new THREE.HemisphereLight(0xc7d3df,0x51483d,1.2));
const sun=new THREE.DirectionalLight(0xffe7c4,2.8);sun.position.set(-2.6,4.2,3.4);scene.add(sun);
const vfx=new VfxSystem(scene,null,{quality:"high",maxParticles:800});vfx.SetSun(sun.position,0xffe7c4,0xc7d3df,{sunIntensity:1.2,skyIntensity:.28});vfx.SetFog(null);
function draw(){renderer.render(scene,camera)}
window.B={THREE,renderer,scene,camera,vfx,draw,SelectBulletDecalVariant};
const wait=()=>new Promise((resolve,reject)=>{const started=performance.now();const poll=()=>{
  if(vfx.loadedBulletDecalMaps.size===3)return resolve();if(performance.now()-started>90000)return reject(new Error("PBR decal maps timed out"));setTimeout(poll,30)};poll()});
await wait();
const n=new THREE.Vector3(0,0,1),positions=[-1.45,0,1.45];
for(let variant=0;variant<3;variant++)vfx._SpawnDecal(new THREE.Vector3(positions[variant],1.3,.002),n,.55,VFX_PALETTE.brickCore,VFX_PALETTE.brickHole,.96,1,variant);
vfx.Update(1/60,camera,1);draw();window.ready=true;
</script></body></html>`);

const server = await ServeRoot(path.resolve(project, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/_check_BulletDecalPbr.html`);
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  await page.screenshot({ path: path.join(shots, "PbrVariants.png") });
  const evidence = await page.evaluate(() => {
    const { THREE, renderer, scene, camera, vfx, draw, SelectBulletDecalVariant } = B;
    function pixels() { draw(); const gl=renderer.getContext(),p=new Uint8Array(1280*720*4);gl.readPixels(0,0,1280,720,gl.RGBA,gl.UNSIGNED_BYTE,p);return p; }
    const withDecals=pixels();vfx.pools.decal.mesh.visible=false;const withoutDecals=pixels();vfx.pools.decal.mesh.visible=true;
    let changed=0;for(let i=0;i<withDecals.length;i+=4)if(Math.abs(withDecals[i]-withoutDecals[i])+Math.abs(withDecals[i+1]-withoutDecals[i+1])+Math.abs(withDecals[i+2]-withoutDecals[i+2])>15)changed++;
    vfx.ClearParticles();const point=new THREE.Vector3(0,1.3,.002),normal=new THREE.Vector3(0,0,1),rifle=new Set();
    for(let i=0;i<16;i++){vfx.Impact(point,normal,"brick",{weaponKind:"boltRifle"});rifle.add(vfx.lastBulletDecal.variant);}
    vfx.Impact(point,normal,"brick",{weaponKind:"lmg"});const lmg=vfx.lastBulletDecal;
    const gl=renderer.getContext(),samplerTypes=new Set([gl.SAMPLER_2D,gl.SAMPLER_2D_SHADOW,gl.SAMPLER_CUBE]);let decalSamplers=[];
    for(const entry of renderer.info.programs){const names=[];for(let i=0;i<gl.getProgramParameter(entry.program,gl.ACTIVE_UNIFORMS);i++){const u=gl.getActiveUniform(entry.program,i);if(samplerTypes.has(u.type))names.push(u.name);}if(names.includes("uDecalBaseMap"))decalSamplers=names;}
    const selector=[SelectBulletDecalVariant("lmg",0),SelectBulletDecalVariant("hmg",.99),
      SelectBulletDecalVariant("boltRifle",.49),SelectBulletDecalVariant("boltRifle",.5),SelectBulletDecalVariant("pistol",.1)];
    return {changed,rifle:[...rifle].sort(),lmg,selector,ready:vfx.pools.decal.material.uniforms.uDecalReady.value,
      maps:[...vfx.loadedBulletDecalMaps].sort(),decalSamplers,maxUnits:gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),glError:gl.getError()};
  });
  assert(evidence.changed > 3500, `all three atlas cells render: ${JSON.stringify(evidence)}`);
  assert.deepEqual(evidence.rifle, [0, 1]);
  assert.equal(evidence.lmg.variant, 2);
  assert.equal(evidence.lmg.weaponKind, "lmg");
  assert.equal(evidence.lmg.pbrReady, true);
  assert.deepEqual(evidence.selector, [2, 2, 0, 1, 0]);
  assert.equal(evidence.ready, 1);
  assert.deepEqual(evidence.maps, ["base", "normal", "orm"]);
  for (const uniform of ["uDecalBaseMap", "uDecalNormalMap", "uDecalOrmMap"]) assert(evidence.decalSamplers.includes(uniform));
  assert(evidence.decalSamplers.length <= evidence.maxUnits);
  assert.equal(evidence.glError, 0);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(shots, "Data_BulletDecalPbrResults.json"), JSON.stringify({ evidence, errors }, null, 2));
  console.log("PASS BulletDecalPbr: 2 rifle variants randomize, LMG/HMG use dedicated cell, Base/Normal/ORM render", JSON.stringify(evidence));
} finally {
  await page.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(check, { force: true });
}
