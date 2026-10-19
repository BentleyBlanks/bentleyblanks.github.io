// Local-only review page + actual GLTFLoader playback. No review HTML or PNG is published.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { LaunchBrowser } from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from '../Script_DevServer.mjs';
const projectDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repoDir=path.dirname(projectDir), reviewDir=path.join(repoDir,'tmp/SingleBlanket/Review');
fs.mkdirSync(reviewDir,{recursive:true});
const sourceDir='C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SingleBlanket';
const reference=path.join(sourceDir,'Reference/Image_SingleBlanketThreeViewPatchesV3_20261018.png');
fs.copyFileSync(reference,path.join(reviewDir,'Reference.png'));
const meta=JSON.parse(fs.readFileSync(path.join(projectDir,'Model/Data_SingleBlanket.json')));
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>单被模型对标</title>
<style>*{box-sizing:border-box}body{margin:0;background:#202427;color:#eee;font:15px system-ui}header{padding:14px 20px;background:#303639;display:flex;gap:16px;align-items:center}button,select,input{font:inherit}main{display:grid;grid-template-columns:68% 32%;height:calc(100vh - 58px)}canvas{display:block;width:100%;height:100%;touch-action:none}aside{padding:16px;overflow:auto;background:#e8e5df;color:#272727}img{width:100%;height:auto}p{line-height:1.6}small{color:#bbb}</style>
<script type="importmap">{"imports":{"three":"/Taierzhuang1938/vendor/three/build/three.module.js"}}</script>
<header><strong>五补丁薄土布单被</strong><select id="pose"></select><button id="play">播放展开</button><label>时间 <input id="time" type="range" min="0" max="1.466666667" step="0.001" value="0"></label><small>拖动旋转 · 滚轮缩放</small></header>
<main><canvas></canvas><aside><strong>已确认的参考图</strong><img src="Reference.png"><p>对照五块补丁、粗陋手缝、破旧程度和薄布质感。材质与褶皱已按后续要求修正柔软度。</p><p>600三角形 · 25骨 · 1024贴图</p></aside></main>
<script type="module">
import * as T from 'three';import {GLTFLoader} from '/Taierzhuang1938/vendor/three/examples/jsm/loaders/GLTFLoader.js';
const canvas=document.querySelector('canvas'),renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=0.82;
const scene=new T.Scene();scene.background=new T.Color(0x5a6063);scene.add(new T.HemisphereLight(0xe4eaf1,0x746b5a,2.0));const light=new T.DirectionalLight(0xffffff,2.0);light.position.set(-2,4,3);scene.add(light);
const ground=new T.Mesh(new T.PlaneGeometry(20,20),new T.MeshStandardMaterial({color:0x77746e,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-0.008;scene.add(ground);
const camera=new T.PerspectiveCamera(38,1,0.01,100);let yaw=0.9,pitch=0.78,distance=3.4;
function Camera(){camera.position.set(distance*Math.sin(yaw)*Math.cos(pitch),distance*Math.sin(pitch),distance*Math.cos(yaw)*Math.cos(pitch));camera.lookAt(0,0.16,0);}
function Draw(){renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);camera.aspect=canvas.clientWidth/canvas.clientHeight;camera.updateProjectionMatrix();Camera();renderer.render(scene,camera);}
let dragging=false,lastX=0,lastY=0;canvas.onpointerdown=e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)};canvas.onpointerup=()=>dragging=false;canvas.onpointermove=e=>{if(dragging){yaw-=(e.clientX-lastX)*0.006;pitch=Math.max(0.08,Math.min(1.5,pitch+(e.clientY-lastY)*0.006));lastX=e.clientX;lastY=e.clientY;Draw()}};canvas.onwheel=e=>{e.preventDefault();distance=Math.max(0.7,Math.min(7,distance*Math.exp(e.deltaY*0.001)));Draw()};window.onresize=Draw;
const gltf=await new GLTFLoader().loadAsync('/Taierzhuang1938/Model/Model_SingleBlanket.glb?v=${meta.sha256.slice(0,12)}');scene.add(gltf.scene);const mixer=new T.AnimationMixer(gltf.scene);let mesh;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o});let playing=false,currentTime=0,active;
const select=document.querySelector('#pose');for(const c of gltf.animations)select.add(new Option(c.name,c.name));
function SetPose(name,time=0){playing=false;mixer.stopAllAction();mesh.skeleton.pose();mesh.morphTargetInfluences.fill(0);const clip=gltf.animations.find(c=>c.name===name);active=mixer.clipAction(clip);active.reset().setLoop(T.LoopOnce,1);active.clampWhenFinished=true;active.play();mixer.setTime(time);scene.updateMatrixWorld(true);Draw();return Snapshot();}
function Snapshot(){scene.updateMatrixWorld(true);const points=[];for(let i=0;i<mesh.geometry.attributes.position.count;i++){const v=mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld);points.push(v.toArray())}return {points,size:[0,1,2].map(k=>Math.max(...points.map(p=>p[k]))-Math.min(...points.map(p=>p[k]))),morph:mesh.morphTargetInfluences[0],bones:mesh.skeleton.bones.length,triangles:mesh.geometry.index.count/3};}
select.onchange=()=>SetPose(select.value);document.querySelector('#time').oninput=e=>{select.value='Blanket_Unfold';SetPose('Blanket_Unfold',Number(e.target.value))};document.querySelector('#play').onclick=()=>{select.value='Blanket_Unfold';SetPose('Blanket_Unfold');playing=true;currentTime=0};let last=performance.now();function Tick(now){if(playing){currentTime=Math.min(44/30,currentTime+(now-last)/1000);mixer.setTime(currentTime);document.querySelector('#time').value=currentTime;Draw();if(currentTime>=44/30)playing=false}last=now;requestAnimationFrame(Tick)}requestAnimationFrame(Tick);
window.SingleBlanket={SetPose,Snapshot,clips:gltf.animations.map(c=>c.name)};SetPose('Blanket_Flat');window.SingleBlanketReady=true;
</script></html>`;
fs.writeFileSync(path.join(reviewDir,'index.html'),html);
const server=await ServeRoot(repoDir),browser=await LaunchBrowser();
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tmp/SingleBlanket/Review/index.html`);
  await page.waitForFunction(()=>window.SingleBlanketReady,null,{timeout:60000}).catch(error=>{console.error(errors);throw error;});
  const names=['Blanket_Flat','Blanket_DragPose','Blanket_Released','Blanket_Crumpled','Blanket_Unfold'];
  const snapshots={};for(const name of names)snapshots[name]=await page.evaluate(n=>window.SingleBlanket.SetPose(n),name);
  const end=await page.evaluate(()=>window.SingleBlanket.SetPose('Blanket_Unfold',44/30));
  const maxError=(a,b)=>Math.max(...a.points.map((p,i)=>Math.hypot(...p.map((v,k)=>v-b.points[i][k]))));
  assert.equal(snapshots.Blanket_Flat.bones,25);assert.equal(snapshots.Blanket_Flat.triangles,600);
  assert.ok(snapshots.Blanket_DragPose.size[1]>0.6);
  assert.ok(maxError(snapshots.Blanket_Crumpled,snapshots.Blanket_Unfold)<1e-5);
  assert.ok(maxError(snapshots.Blanket_Flat,end)<1e-5);
  assert.ok(Math.max(...snapshots.Blanket_Crumpled.size.map((v,k)=>Math.abs(v-[0.45,0.25,0.45][k])))<0.001);
  await page.evaluate(()=>window.SingleBlanket.SetPose('Blanket_DragPose'));
  await page.locator('canvas').screenshot({path:path.join(reviewDir,'Scene_BrowserDragPose.png')});
  const report={sha256:meta.sha256,errors,clips:names,bones:25,triangles:600,crumpledSizeM:snapshots.Blanket_Crumpled.size,
    unfoldStartMaxErrorM:maxError(snapshots.Blanket_Crumpled,snapshots.Blanket_Unfold),unfoldEndMaxErrorM:maxError(snapshots.Blanket_Flat,end)};
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(reviewDir,'Data_BrowserCheck.json'),JSON.stringify(report,null,2));
  fs.copyFileSync(path.join(reviewDir,'Data_BrowserCheck.json'),path.join(sourceDir,'Review/Data_BrowserCheck.json'));
  console.log(JSON.stringify(report,null,2));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
