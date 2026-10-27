// Local acceptance viewer and real-loader/library integration smoke test.
// Screenshots stay ignored under tmp; headless audio policy uses the shared kit.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import sharp from "sharp";

const repo=path.resolve(import.meta.dirname,".."),folder=path.join(repo,"tmp/NakajimaKi4/ReferenceV48_GameRelease");
fs.mkdirSync(folder,{recursive:true});
const html=String.raw`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><base href="/Taierzhuang1938/"><title>九四式侦察机 · 141 · 游戏接入检查</title>
<style>body{margin:0;background:#263039;color:#e7eceb;font:14px system-ui}header{padding:16px 22px;display:flex;gap:20px;align-items:center}h1{font-size:19px;margin:0}#stage{width:100%;height:calc(100vh - 150px);min-height:350px}canvas{display:block;width:100%;height:100%}footer{display:flex;gap:15px;flex-wrap:wrap;padding:12px 22px}label{display:flex;gap:7px;align-items:center}select,button{padding:6px;background:#354550;color:#fff;border:1px solid #69818d}small{color:#b4c1c5}input{width:105px}</style>
<script type="importmap">{"imports":{"three":"/Taierzhuang1938/vendor/three/build/three.module.js","three/addons/":"/Taierzhuang1938/vendor/three/examples/jsm/"}}</script>
<header><h1>九四式侦察机 · 141（参考复原）</h1><small id="status">加载实际游戏模型</small><select id="view"><option value="Perspective">全机</option><option value="Side">侧面</option><option value="Front">正面</option><option value="Tail">尾翼</option><option value="Engine">发动机与桨叶</option></select><button id="reset">动作归零</button></header>
<div id="stage"></div><footer>
<label>桨叶<input data-pose="propellerRadians" type="range" min="0" max="360" value="0"></label>
<label>方向舵<input data-pose="rudderRadians" type="range" min="-25" max="25" value="0"></label>
<label>升降舵<input data-pose="elevatorRadians" type="range" min="-25" max="25" value="0"></label>
<label>副翼<input data-pose="aileronRadians" type="range" min="-18" max="18" value="0"></label>
<label>车轮<input id="wheels" type="range" min="0" max="360" value="0"></label>
<label>后座回转<input data-pose="observerYawRadians" type="range" min="-15" max="15" value="0"></label>
<label>托架俯仰<input data-pose="observerElevationRadians" type="range" min="-10" max="10" value="0"></label></footer>
<script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {NAKAJIMA_KI4_ASSET as Asset} from '/Taierzhuang1938/Data_NakajimaKi4.mjs';
import {BindNakajimaKi4} from '/Taierzhuang1938/Script_NakajimaKi4Motion.mjs';
document.querySelectorAll('audio,video').forEach(m=>m.muted=true);
const scene=new T.Scene();scene.background=new T.Color(0xd5d9d8);
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
document.querySelector('#stage').appendChild(renderer.domElement);
const studio=new T.Scene();studio.background=new T.Color(0xbcc7cb);
studio.add(new T.Mesh(new T.BoxGeometry(20,12,20),new T.MeshBasicMaterial({color:0x9ba5a7,side:T.BackSide})));
for(const [position,size] of [[[0,5,0],[8,6]],[[0,2,-7],[7,5]],[[8,3,0],[5,5]]]){
 const panel=new T.Mesh(new T.PlaneGeometry(...size),new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide}));panel.position.set(...position);panel.lookAt(0,1,0);studio.add(panel);
}
const pmrem=new T.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(studio,.04).texture;scene.environmentIntensity=.65;
const hemi=new T.HemisphereLight(0xdde9ef,0x797268,1.2);scene.add(hemi);
const light=new T.DirectionalLight(0xfff4e5,3.2);light.position.set(4,10,-6);light.castShadow=true;light.shadow.mapSize.set(2048,2048);
Object.assign(light.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:.5,far:30});light.shadow.normalBias=.015;scene.add(light);
const floor=new T.Mesh(new T.PlaneGeometry(40,40),new T.MeshStandardMaterial({color:0xb4b8b3,roughness:.94}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;floor.receiveShadow=true;scene.add(floor);
const camera=new T.PerspectiveCamera(40,1,.02,100);const query=new URLSearchParams(location.search);
let model;
if(query.get('source')==='library'){
 const {InstantiateExternalProp}=await import('/Taierzhuang1938/Script_ExternalProps.mjs');model=await InstantiateExternalProp(Asset.catalogId,null);
}else model=(await new GLTFLoader().loadAsync('/tmp/NakajimaKi4/ReferenceV48_GameRelease/Model_NakajimaKi4.glb')).scene;
if(!model)throw Error('Missing library model');scene.add(model);
model.traverse(o=>{if(o.isMesh){o.castShadow=!String(o.material?.name).includes('Windscreen');o.receiveShadow=true;}});
const rig=BindNakajimaKi4(model),root=model.getObjectByName('NakajimaKi4');if(root.userData.version!==Asset.version)throw Error('Runtime configuration/export version mismatch');
const views={Perspective:[[10,5.8,-11],[0,1.4,0]],Side:[[15,2.2,.3],[0,1.6,0]],Front:[[0,2.3,-20],[0,1.6,0]],Tail:[[4.8,3.8,8],[0,1.9,3.1]],Engine:[[3.1,2.8,-5.3],[0,1.9,-2.9]]};
function Render(){renderer.render(scene,camera);}
function Resize(){const e=document.querySelector('#stage');renderer.setSize(e.clientWidth,e.clientHeight,false);camera.aspect=e.clientWidth/e.clientHeight;camera.updateProjectionMatrix();Render();}
function SetView(name){const[p,t]=views[name]??views.Perspective;camera.position.set(...p);camera.lookAt(...t);Resize();document.querySelector('#view').value=name;}
document.querySelector('#view').onchange=e=>SetView(e.target.value);
for(const input of document.querySelectorAll('[data-pose]'))input.oninput=()=>{rig.SetPose({[input.dataset.pose]:Number(input.value)*Math.PI/180});Render();};
document.querySelector('#wheels').oninput=e=>{const radians=Number(e.target.value)*Math.PI/180;rig.SetPose({wheelLeftRadians:radians,wheelRightRadians:radians});Render();};
document.querySelector('#reset').onclick=()=>{rig.Reset();for(const e of document.querySelectorAll('input'))e.value=0;Render();};
window.addEventListener('resize',Resize);SetView('Perspective');
function Inspect(){let triangles=0,meshes=0,tangentMeshes=0;const textures=new Set();model.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;if(o.geometry.attributes.tangent)tangentMeshes++;for(const m of Array.isArray(o.material)?o.material:[o.material])for(const value of Object.values(m))if(value?.isTexture)textures.add(value);});const box=new T.Box3().setFromObject(model,true);return{version:root.userData.version,triangles,meshes,tangentMeshes,textures:textures.size,dimensionsM:box.getSize(new T.Vector3()).toArray(),groundMinimumM:box.min.y,pivots:Object.keys(rig.controls).length,source:query.get('source')??'actualGame',glError:renderer.getContext().getError(),calls:renderer.info.render.calls};}
window.Ki4Release={ready:true,Inspect,SetView,rig,Render,renderer,model,scene,camera};
document.querySelector('#status').textContent=Asset.version+' · '+Inspect().triangles.toLocaleString()+' 三角 · 10个枢轴';
</script></html>`;
fs.writeFileSync(path.join(folder,"index.html"),html);
const base=process.env.KI4_PREVIEW_ORIGIN??"http://127.0.0.1:8115";
const ping=await(await fetch(base+"/__preview/ping")).json();
assert.equal(path.resolve(ping.root).toLowerCase(),path.resolve(repo).toLowerCase(),"preview serves this worktree");
const browser=await LaunchBrowser();const failures=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on("pageerror",e=>failures.push(e.message));
 page.on("response",response=>{if(response.status()>=400&&!response.url().endsWith('/favicon.ico'))failures.push(response.status()+" "+response.url());});
 page.on("console",m=>{if(m.type()==="error")failures.push(m.text());});
 const source=process.argv.includes("--library")?"?source=library":"";
 await page.goto(base+"/tmp/NakajimaKi4/ReferenceV48_GameRelease/index.html"+source,{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>window.Ki4Release?.ready,undefined,{timeout:120000});
 const metrics=await page.evaluate(()=>window.Ki4Release.Inspect());
 assert.equal(metrics.version,"20261028ReferenceV48GameRelease");assert.ok(metrics.triangles<=180000);assert.equal(metrics.pivots,10);assert.equal(metrics.glError,0);
 assert.ok(Math.abs(metrics.dimensionsM[0]-12)<.002&&Math.abs(metrics.dimensionsM[1]-3.31)<.04&&Math.abs(metrics.dimensionsM[2]-8.25)<.05);
 if(source)assert.ok(Math.abs(metrics.groundMinimumM)<.0001,"library uses the actual grounded vertex envelope");
 const screenshots=[];
 for(const view of ["Perspective","Side","Engine","Tail"]){
  await page.evaluate(view=>window.Ki4Release.SetView(view),view);
  const bytes=await page.screenshot({type:"png"});
  const file=path.join(folder,"Evidence",`Image_${source?"Library":"Game"}${view}.jpg`);
  fs.mkdirSync(path.dirname(file),{recursive:true});await sharp(bytes).resize({width:640,height:640,fit:"inside",withoutEnlargement:true}).jpeg({quality:82}).toFile(file);
  const stats=await sharp(bytes).stats();assert.ok(stats.channels.slice(0,3).some(c=>c.stdev>15),"nonempty rendered scene");screenshots.push(file);
 }
 const before=await page.evaluate(()=>window.Ki4Release.rig.controls.rudder.quaternion.toArray());
 await page.locator('[data-pose="rudderRadians"]').fill("22");await page.locator('[data-pose="rudderRadians"]').dispatchEvent("input");
 const after=await page.evaluate(()=>window.Ki4Release.rig.controls.rudder.quaternion.toArray());assert.notDeepEqual(before,after);
 await page.locator('#reset').click();assert.deepEqual(await page.evaluate(()=>window.Ki4Release.rig.controls.rudder.quaternion.toArray()),before);
 assert.deepEqual(failures,[]);
 const record={ok:true,metrics,screenshots,pageErrors:failures,audioMuted:true,viewport:[1280,800],observationPreviewLongEdgeMax:640};
 fs.writeFileSync(path.join(folder,"Evidence",source?"Data_LibraryBrowser.json":"Data_GameBrowser.json"),JSON.stringify(record,null,2));
 console.log(JSON.stringify(record));
}catch(error){console.error(JSON.stringify({pageErrors:failures,error:error.message}));throw error;}
finally{await browser.close();}
