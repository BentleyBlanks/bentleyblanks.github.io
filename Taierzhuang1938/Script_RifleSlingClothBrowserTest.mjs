// ===========================================================================
// Script_RifleSlingClothBrowserTest.mjs —— 背枪枪带布料模拟（Script_RifleSlingCloth，2026-11-04）的浏览器闸门
//
// 跑法：node Taierzhuang1938/Script_RifleSlingClothBrowserTest.mjs
// 口径：docs/Data_RifleSlingCloth.md。白盒编辑器 FirstLevel0105（X Bot 国军、日兵甲日军；纯求解器和真三角面穿模另见
// Script_RifleSlingClothTest）：
//   1. 关键帧 02-7 背枪的人（国军、日军都有）：每根原带子都换成了模拟的带子 —— 原带子 layers 全关、模拟的显示、挎上了、
//      挂在场景根的 RifleSlingCloth 组下（不在人物底下）；身体采样点取的是看得见的那层身体（X Bot / 日兵甲），不是藏着的原身体；
//   2. 站着：两头钉在背带环上、多数点贴着身体、不出 NaN、拉长有上限；每帧耗时；
//   3. 关掉退回原带子、再打开重新挎上；
//   4. 预演 03-1 连续播 2 s（有人背枪走）：不出 NaN、两头在背带环上、拉长有上限；
//   5. 全程没有未捕获错误。截图存 _shots/RifleSlingCloth/（不提交）。
// ===========================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { Vector3, Triangle } from "three";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "RifleSlingCloth");
await fs.mkdir(shotDir, { recursive: true });

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
const J = (v) => JSON.stringify(v);
function MeasureContact(snapshot) {
  const points=Array.from({length:10},(_,i)=>new Vector3().fromArray(snapshot.p,(i+8)*3));
  const distances=points.map(()=>Infinity),signed=points.map(()=>Infinity);
  const triangle=new Triangle(),closest=new Vector3(),normal=new Vector3(),delta=new Vector3();
  for(const surface of snapshot.surfaces) {
    const index=surface.index,count=index?index.length:surface.vertices.length/3;
    for(let j=0;j<count;j+=3) {
      triangle.a.fromArray(surface.vertices,(index?index[j]:j)*3);triangle.b.fromArray(surface.vertices,(index?index[j+1]:j+1)*3);triangle.c.fromArray(surface.vertices,(index?index[j+2]:j+2)*3);triangle.getNormal(normal);
      points.forEach((point,i)=>{triangle.closestPointToPoint(point,closest);const d=point.distanceToSquared(closest);if(d<distances[i]){distances[i]=d;signed[i]=(delta.subVectors(point,closest).dot(normal)>=0?1:-1)*Math.sqrt(d);}});
    }
  }
  return {body:snapshot.body,contact:signed.filter(d=>d>=-.008&&d<=.025).length/10,min:Math.min(...signed),max:Math.max(...signed),distances:signed};
}

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  const url = message.location()?.url || "";
  if (message.type() === "warning" && /sling/i.test(message.text())) errors.push(`WARN ${message.text().slice(0, 240)}`);
  if (message.type() !== "error") return;
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  if (/__(blockout|environment|scene)/.test(url) || /__(blockout|environment|scene)/.test(message.text())) return;   // 本机存盘口，测试服务器没有
  if (/\/Animation\/Previz\w+\/Data_Previz\w+Animation\.json/.test(url) && /404/.test(message.text())) return;
  if (/\/Audio\/BlockoutPreviz\//.test(url) && /404/.test(message.text())) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)} @ ${url}`);
});
const B = (fn, arg) => page.evaluate(fn, arg);
const Frames = (n) => B((n) => new Promise(async (resolve) => { for (let i = 0; i < n; i += 1) await new Promise(r => requestAnimationFrame(r)); resolve(); }), n);
/** 每根模拟带子此刻的状况（取证口 RifleSlingClothStats）。 */
const Probe = () => B(() => {
  const st = window.__sling.RifleSlingClothStats();
  const vis = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const scene = window.Tengxian.scene;
  return {
    count: st.count, simulated: st.simulated, ms: st.ms, enabled: st.enabled,
    cloths: st.cloths.map((c) => {
      const r = c.rope, out = { body: c.body?.name, slingShown: vis(c.sling), slingMask: c.sling.layers.mask, ready: c.ready, failed: c.failed };
      if (!c.mesh || !r) return out;
      let underActor = false; c.body?.traverse(o => { if (o === c.mesh) underActor = true; });
      let pin = 0, nan = false, contact = 0, upper = 0;
      for (const i of [0, r.count - 1]) pin = Math.max(pin, Math.hypot(r.p[i * 3] - r.rest[i * 3], r.p[i * 3 + 1] - r.rest[i * 3 + 1], r.p[i * 3 + 2] - r.rest[i * 3 + 2]));
      let gunPin=0;
      if(c.anchorRoot&&c.anchorLocal) {
        const matrix=c.anchorRoot.matrixWorld.clone().multiply(c.anchorLocal),point=c.sling.position.clone(),actual=point.clone();
        for(const i of [0,r.count-1]){point.fromArray(c.rest.points,i*3).applyMatrix4(matrix);actual.setFromMatrixPosition(c.bones[i].matrixWorld);gunPin=Math.max(gunPin,point.distanceTo(actual));}
      }
      for (let i = 0; i < r.p.length; i += 1) if (!Number.isFinite(r.p[i])) nan = true;
      // 贴身只量斜挎胸前那一段（第 8–17 个点）：背带环到肩、到胯那两段本来就悬空，X Bot 的枪被往后推了 25 cm，悬得更长
      for (let i = 8; i < 18; i += 1) if (r.plane[i] >= 0 && r.distance[i] < c.cfg.contactM) contact += 1;
      for (let i = 0; i < 18; i += 1) upper = Math.max(upper, r._SegmentLength(i) / r.segment);
      const meshes = c.samples.meshes.map(m => ({ name: m.name, shown: vis(m) }));
      return { ...out, meshShown: c.mesh.visible, group: c.mesh.parent?.name, groupInScene: c.mesh.parent?.parent === scene, underActor,
        samples: c.samples.count, meshes, pin, gunPin, nan, contact: contact / 10, upperStretch: upper, maxStretch: r.Stats().maxStretch,
        anchor: c.sling.matrixWorld.elements.slice(12,15), loosePoint: Array.from(r.p.slice(66,69)), ms:c.ms,
        denseVertices:c.triangleSamples.count,denseActive:c.triangleSamples.active?.length,
        triangleCandidates:c.triangleSamples.candidates.reduce((sum,list)=>sum+list.length,0) };
    }),
  };
});

async function VerifySlingVelocity() {
  const html = await fs.readFile(path.join(projectDir, 'index.html'), 'utf8');
  const importMap = html.match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
  await page.route('**/__SlingVelocity', route => route.fulfill({ contentType:'text/html', body:`<!doctype html>${importMap}<canvas></canvas>` }));
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/__SlingVelocity`);
  const result = await B(async () => {
    const T = await import('three');
    const { BuildStrapGeometry } = await import('./Script_RifleSlingCloth.mjs');
    const { PrepassPass } = await import('./Script_PostPrepass.mjs');
    const { MakeRenderTarget, MakeFullscreenMaterial } = await import('./Script_PostCommon.mjs');
    const renderer = new T.WebGLRenderer({canvas:document.querySelector('canvas')}); renderer.setSize(320,240);
    const pass = new PrepassPass({preset:{velocity:true,hzb:false},hdrCapable:true,hdrType:T.HalfFloatType,targets:{}}); pass.Resize(320,240);
    const scene = new T.Scene(), bones = Array.from({length:32}, () => new T.Bone());
    for (const bone of bones) bone.matrixAutoUpdate = false;
    const material = new T.MeshStandardMaterial({side:T.DoubleSide});
    const strap = new T.SkinnedMesh(BuildStrapGeometry(32,.027,.0045), material);
    strap.add(...bones); strap.bind(new T.Skeleton(bones, bones.map(() => new T.Matrix4())),new T.Matrix4());
    strap.frustumCulled = false; scene.add(strap);
    const camera = new T.OrthographicCamera(-8/15,8/15,.4,-.4,.01,100); camera.position.z=2; camera.updateMatrixWorld(true);
    const vp = new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const target = MakeRenderTarget(320,240,{type:T.HalfFloatType});
    const copy = MakeFullscreenMaterial('uniform sampler2D v; uniform sampler2D d; varying vec2 vUv; void main(){gl_FragColor=vec4(texture2D(v,vUv).xy,texture2D(d,vUv).w,1.0);}', {v:{value:null},d:{value:null}});
    const readScene=new T.Scene(), quad=new T.Mesh(new T.PlaneGeometry(2,2),copy); readScene.add(quad);
    const pixels=new Uint16Array(320*240*4), samples=[];
    for (const [name,offset,bend] of [['first',0,0],['translate',.02,0],['stop',.02,0],['deform',.02,.01],['deformStop',.02,.01],['return',.02,0]]) {
      scene.updateMatrixWorld(true);
      // Exactly like the production rig: write the 32 bone matrices after the scene update.
      bones.forEach((bone,i) => {
        bone.matrix.makeRotationX(-Math.PI/2).setPosition(offset+bend*Math.sin(i/31*Math.PI),-.31+i*.02,0);
        bone.matrixWorld.copy(bone.matrix);
      });
      pass.Render({renderer,scene,camera,viewProjection:vp,prevViewProjection:vp,hasPrev:name!=='first'});
      copy.uniforms.v.value=pass.velocityTexture; copy.uniforms.d.value=pass.normalDepthTexture;
      renderer.setRenderTarget(target); renderer.render(readScene,new T.Camera()); renderer.readRenderTargetPixels(target,0,0,320,240,pixels);
      let count=0,min=Infinity,max=-Infinity,sum=0,other=0;
      for(let i=0;i<pixels.length;i+=4) if(T.DataUtils.fromHalfFloat(pixels[i+2])>0) {
        const x=T.DataUtils.fromHalfFloat(pixels[i])*320;
        count++;min=Math.min(min,x);max=Math.max(max,x);sum+=x;other=Math.max(other,Math.abs(T.DataUtils.fromHalfFloat(pixels[i+1])*240));
      }
      samples.push({name,count,min,max,mean:sum/count,other}); pass._SnapshotSkeletons();
    }
    const glError=renderer.getContext().getError();
    pass.Dispose();target.dispose();copy.dispose();quad.geometry.dispose();strap.geometry.dispose();strap.skeleton.dispose();material.dispose();renderer.dispose();
    return {samples,glError};
  });
  await fs.writeFile(path.join(shotDir,'Data_SlingVelocity.json'),JSON.stringify(result,null,2));
  const get=name=>result.samples.find(s=>s.name===name), zero=name=>Math.max(Math.abs(get(name).min),Math.abs(get(name).max))<.08;
  Check('枪带真实 32 骨网格写入 RT1：首帧、停止均为零速度',result.glError===0&&result.samples.every(s=>s.count>500&&s.other<.08)&&zero('first')&&zero('stop')&&zero('deformStop'),J(result.samples));
  Check('枪带真实网格平移 2 cm = 6 px 速度',Math.abs(get('translate').min-6)<.08&&Math.abs(get('translate').max-6)<.08);
  Check('枪带非刚性弯曲与回摆写出方向正确的逐骨速度',get('deform').min>-.08&&get('deform').max>2.8&&get('deform').max<3.08&&get('deform').mean>1
    &&get('return').min< -2.8&&get('return').min> -3.08&&get('return').max<.08&&get('return').mean< -1);
}

try {
  await VerifySlingVelocity();
  console.log("--- boot");
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?editor=blockout&level=FirstLevel0105&kf=02-7&audio=0`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready, null, { timeout: 300000, polling: 200 });
  await B(async () => { window.__sling = await import("./Script_RifleSlingCloth.mjs"); });
  // 背枪层、X Bot / 日兵甲那层身体都是异步到的；装上每帧限量排队
  await page.waitForFunction(() => {
    const st = window.__sling.RifleSlingClothStats();
    return st.count >= 2 && st.cloths.every(c => !c.mesh || c.ready);
  }, null, { timeout: 180000, polling: 250 });
  await Frames(60);

  // 1. 换上了
  console.log("--- 1. 02-7 换上了");
  {
    const p = await Probe();
    const shown = p.cloths.filter(c => c.slingShown);
    Check("关键帧 02-7 有背枪的人、国军日军都有", shown.length >= 2 && shown.some(c => /nra/.test(c.body)) && shown.some(c => /ija/.test(c.body)), J(shown.map(c => c.body)));
    Check("每根原带子都换成了模拟的带子：原带子不画、模拟的显示且挎上了", shown.every(c => c.slingMask === 0 && c.meshShown && c.ready && !c.failed), J(shown.map(c => ({ b: c.body, mask: c.slingMask, shown: c.meshShown, ready: c.ready }))));
    Check("模拟的带子挂在场景根的 RifleSlingCloth 组下（不在人物底下）", shown.every(c => c.group === "RifleSlingCloth" && c.groupInScene && !c.underActor));
    Check("身体采样点取的是看得见的那层身体（X Bot / 日兵甲），不是藏着的原身体", shown.every(c => c.samples > 100 && c.meshes.length && c.meshes.every(m => m.shown)),
      J(shown.map(c => ({ b: c.body, samples: c.samples, meshes: c.meshes.map(m => m.name) }))));
  }

  // 2. 站着
  console.log("--- 2. 站着");
  {
    const p = await Probe();
    const shown = p.cloths.filter(c => c.slingShown && c.ready);
    Check("两头钉在背带环上（< 1 mm）、不出 NaN", shown.every(c => c.pin < 0.001 && !c.nan), J(shown.map(c => +c.pin.toFixed(5))));
    Check('端点对齐实际背枪架的锚点（< 1 mm）',shown.every(c=>c.gunPin<.001),J(shown.map(c=>+c.gunPin.toFixed(5))));
    console.log('远景局部平面接触诊断（近景门禁使用下方独立真三角面）',J(shown.map(c=>({body:c.body,contact:c.contact}))));
    Check("整条带子单节拉长 < 25%（包括胯边）", shown.every(c => c.maxStretch < 1.25), J(shown.map(c => +c.maxStretch.toFixed(3))));
    const ms = await B(async () => {
      const out = [];
      for (let i = 0; i < 60; i += 1) { await new Promise(r => requestAnimationFrame(r)); const st = window.__sling.RifleSlingClothStats(); out.push(st.ms / Math.max(1,st.cloths.filter(c=>c.mesh?.visible&&c.ready).length)); }
      return out.sort((a, b) => a - b)[30];
    });
    Check("每帧耗时：每根带子中位数 < 0.8 ms（无头浏览器）", ms < 0.8, `${ms.toFixed(3)} ms / 根`);
    console.log('cloth profile',J((await Probe()).cloths.filter(c=>c.slingShown).map(c=>({body:c.body,ms:c.ms,dense:c.denseVertices,active:c.denseActive,candidates:c.triangleCandidates}))));
    await page.screenshot({ path: path.join(shotDir, "kf_02-7.png") });
    {
      const snapshots = await B(() => {
        const V = window.Tengxian.camera.position.constructor;
        window.__slingSnapshot = c => {
          const matrix = c.sling.matrixWorld.clone(), pos = new V(), scale = new V(), q = window.Tengxian.camera.quaternion.clone();
          matrix.decompose(pos, q, scale); matrix.compose(pos, q, new V(1, 1, 1)).invert();
          c.samples.Update(matrix);
          const surfaces = c.samples.meshes.map(mesh => {
            const p = new V(), vertices = [], index = mesh.geometry.index;
            for (let i = 0; i < mesh.geometry.attributes.position.count; i++) mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld).applyMatrix4(matrix).toArray(vertices, i * 3);
            return { name: mesh.name, vertices, index: index ? Array.from(index.array) : null };
          });
          return { body: c.body.name, rest: Array.from(c.rope.rest), p: Array.from(c.rope.p), guide:c.rope.guide?Array.from(c.rope.guide):null, segment: c.rope.segment,
            bodyBones:c.samples.meshes[0]?.skeleton.bones.map(b=>({name:b.name,position:new V().setFromMatrixPosition(b.matrixWorld).applyMatrix4(matrix).toArray()})),
            frame:c.prevFrame.toArray(),sourceFrameInverse:matrix.toArray(),lastDt:c.lastDt,pendingDt:c.pendingDt,
            planes:{ids:Array.from(c.rope.plane),position:Array.from(c.rope.planeP),normal:Array.from(c.rope.planeN),distance:Array.from(c.rope.distance)},
            samples: { count: c.samples.count, position: Array.from(c.samples.position), normal: Array.from(c.samples.normal), push: Array.from(c.samples.push) }, surfaces };
        };
        return window.__sling.RifleSlingClothStats().cloths.filter(c=>c.mesh?.visible&&c.ready).map(window.__slingSnapshot);
      });
      await fs.writeFile(path.join(shotDir, "Snapshots.json"), JSON.stringify(snapshots));
      const realContacts = snapshots.map(snapshot => {
        const points = Array.from({length:10},(_,i)=>new Vector3().fromArray(snapshot.p,(i+8)*3));
        const distances=points.map(()=>Infinity), signed=points.map(()=>Infinity);
        const triangle=new Triangle(), closest=new Vector3(), normal=new Vector3(), delta=new Vector3();
        for (const surface of snapshot.surfaces) {
          const index=surface.index, count=index?index.length:surface.vertices.length/3;
          for (let j=0;j<count;j+=3) {
            triangle.a.fromArray(surface.vertices,(index?index[j]:j)*3);
            triangle.b.fromArray(surface.vertices,(index?index[j+1]:j+1)*3);
            triangle.c.fromArray(surface.vertices,(index?index[j+2]:j+2)*3); triangle.getNormal(normal);
            points.forEach((point,i) => {
              triangle.closestPointToPoint(point,closest); const d=point.distanceToSquared(closest);
              if(d<distances[i]) { distances[i]=d; signed[i]=(delta.subVectors(point,closest).dot(normal)>=0?1:-1)*Math.sqrt(d); }
            });
          }
        }
        return {body:snapshot.body,contact:signed.filter(d=>d>=-.008&&d<=.025).length/10,min:Math.min(...signed),max:Math.max(...signed),distances:signed};
      });
      await fs.writeFile(path.join(shotDir,'Data_BodyContacts.json'),JSON.stringify(realContacts,null,2));
      console.log('远景真实表面诊断；逐人物接近后执行贴合门禁',J(realContacts.map(c=>({body:c.body,contact:c.contact,minMm:+(c.min*1000).toFixed(1),maxMm:+(c.max*1000).toFixed(1)}))));
      const subjects = await B(() => {
        const T = window.Tengxian, camera = T.camera;
        const cloths = window.__sling.RifleSlingClothStats().cloths.filter(c => c.mesh?.visible && c.ready);
        const chosen = [];
        for (const cloth of cloths) {
          const names = cloth.samples.meshes.map(m => m.name).join('_');
          chosen.push(cloth);
        }
        const saved = { update: camera.updateMatrixWorld, position: camera.position.clone(), quaternion: camera.quaternion.clone(),
          viewmodel: T.viewmodel?.root?.visible, markers: T.scene.getObjectByName('BlockoutMarkers')?.visible };
        window.__slingReview = { saved, chosen, index: 0, angle: 0 };
        camera.updateMatrixWorld = function(force) {
          const review = window.__slingReview;
          const cloth = review.chosen[review.index], V = camera.position.constructor;
          const center = cloth.sling.parent.parent.getWorldPosition(new V()); center.y -= 0.12;
          const forward = new V(0,0,-1).applyQuaternion(cloth.body.getWorldQuaternion(camera.quaternion.clone()));
          const angle = Math.atan2(forward.x, forward.z) + review.angle;
          camera.position.set(center.x + Math.sin(angle) * 1.4, center.y + 0.12, center.z + Math.cos(angle) * 1.4);
          camera.lookAt(center);
          if (T.viewmodel?.root) T.viewmodel.root.visible = false;
          const markers = T.scene.getObjectByName('BlockoutMarkers'); if (markers) markers.visible = false;
          return saved.update.call(camera, force);
        };
        const style = document.createElement('style'); style.id = 'SlingReviewHideUi'; style.textContent = 'body *:not(canvas){visibility:hidden} canvas{visibility:visible}'; document.head.append(style);
        return chosen.map(c => c.body.name+'_'+c.samples.meshes.map(m => m.name).join('_').replace(/[^A-Za-z0-9_]/g, ''));
      });
      const nearSnapshots=[],nearContacts=[];
      for (let index = 0; index < subjects.length; index++) for (const [view, angle] of [['Front',0],['Oblique',0.7],['Side',Math.PI/2],['Back',Math.PI]]) {
        await B(({index, angle}) => { Object.assign(window.__slingReview,{index,angle}); }, {index,angle});
        await Frames(view==='Front'?30:4);
        if(view==='Front') {
          const costs=await B(async()=>{
            const costs=[];for(let i=0;i<30;i++){await new Promise(r=>requestAnimationFrame(r));costs.push(window.__slingReview.chosen[window.__slingReview.index].ms);}return costs.sort((a,b)=>a-b);
          });
          const snapshot=await B(()=>window.__slingSnapshot(window.__slingReview.chosen[window.__slingReview.index]));
          const contact=MeasureContact(snapshot); nearSnapshots.push(snapshot);nearContacts.push(contact);
          Check(`近景 ${subjects[index]}：胸前真实贴合 ≥ 70%，最深不超过 8 mm`,contact.contact>=.7&&contact.min>-.008,J({contact:contact.contact,minMm:+(contact.min*1000).toFixed(1),maxMm:+(contact.max*1000).toFixed(1)}));
          Check(`近景 ${subjects[index]}：每根中位数 < 0.8 ms`,costs[15]<.8,`${costs[15]?.toFixed(3)} ms`);
        }
        await page.screenshot({path:path.join(shotDir, `Scene_${subjects[index]}_${view}.png`)});
      }
      await fs.writeFile(path.join(shotDir,'NearSnapshots.json'),JSON.stringify(nearSnapshots));
      await fs.writeFile(path.join(shotDir,'Data_NearBodyContacts.json'),JSON.stringify(nearContacts,null,2));
      await B(() => {
        const T = window.Tengxian, camera = T.camera, saved = window.__slingReview.saved;
        camera.updateMatrixWorld = saved.update; camera.position.copy(saved.position); camera.quaternion.copy(saved.quaternion);
        if (T.viewmodel?.root) T.viewmodel.root.visible = saved.viewmodel;
        const markers = T.scene.getObjectByName('BlockoutMarkers'); if (markers) markers.visible = saved.markers;
        document.getElementById('SlingReviewHideUi')?.remove(); delete window.__slingReview;
      });
    }
  }

  // 3. 关掉 / 打开
  console.log("--- 3. 关掉 / 打开");
  {
    await B(() => window.__sling.SetRifleSlingClothEnabled(false));
    await Frames(3);
    const off = await Probe();
    const shownOff = off.cloths.filter(c => c.slingShown);
    Check("关掉：原带子还原、模拟的不画", shownOff.every(c => c.slingMask === 1 && !c.meshShown));
    await B(() => window.__sling.SetRifleSlingClothEnabled(true));
    await Frames(30);
    const on = await Probe();
    Check("再打开：重新挎上", on.cloths.filter(c => c.slingShown).every(c => c.slingMask === 0 && c.meshShown && c.ready));
  }

  // 4. 预演里走
  console.log("--- 4. 预演 03-1 连续播");
  {
    await B(() => window.Tengxian.Debug.Blockout.Previz.Stop());
    await B(() => { window.Tengxian.Debug.Blockout.Previz.Play("03-1"); });
    await page.waitForFunction(() => window.Tengxian.Debug.Blockout.Previz.State().playing, null, { timeout: 180000, polling: 100 });
    await B(async () => { await window.Tengxian.Debug.Blockout.Previz.Seek(3); window.Tengxian.Debug.Blockout.Previz.Resume(); });
    let worst = { pin: 0, nan: false, upper: 0, max: 0, sim: 0 };
    const motion = new Map(), costs = [];
    for (let k = 0; k < 8; k += 1) {
      await Frames(15);
      const p = await Probe();
      if (p.simulated > 0) costs.push(p.ms / Math.max(1,p.cloths.filter(c=>c.meshShown&&c.ready).length));
      for (const c of p.cloths.filter(c => c.slingShown && c.ready && c.pin !== undefined)) {
        worst = { pin: Math.max(worst.pin, c.pin,c.gunPin), nan: worst.nan || c.nan, upper: Math.max(worst.upper, c.upperStretch), max: Math.max(worst.max, c.maxStretch), sim: Math.max(worst.sim, p.simulated) };
        const last = motion.get(c.body);
        if (!last) motion.set(c.body,{anchor:c.anchor,point:c.loosePoint,travel:0,deformation:0});
        else {
          last.travel=Math.max(last.travel,Math.hypot(...c.anchor.map((v,i)=>v-last.anchor[i])));
          last.deformation=Math.max(last.deformation,Math.hypot(...c.loosePoint.map((v,i)=>v-last.point[i])));
        }
      }
    }
    Check("预演里走：模拟着、不出 NaN、两头在背带环上", worst.sim > 0 && !worst.nan && worst.pin < 0.001, J(worst));
    Check("预演里走：整条带子单节拉长 < 25%（包括胯边）", worst.max < 1.25, J({ upper: +worst.upper.toFixed(3), max: +worst.max.toFixed(3) }));
    const median=costs.sort((a,b)=>a-b)[Math.floor(costs.length/2)];
    Check('走动时整组平均每根中位数 < 0.8 ms',median<.8,`${median?.toFixed(3)} ms / 根`);
    const movement=[...motion.values()];
    Check('人物实际移动，枪带相对挂点也有形变',movement.some(m=>m.travel>.03&&m.deformation>.004),J(movement.map(m=>({travel:+m.travel.toFixed(3),deformation:+m.deformation.toFixed(3)}))));
    await page.screenshot({ path: path.join(shotDir, "previz_03-1.png") });
    await B(() => window.Tengxian.Debug.Blockout.Previz.Stop());
  }

  Check("全程没有未捕获错误", errors.length === 0, errors.slice(0, 5).join(" | "));
} catch (error) {
  Check("跑完", false, String(error?.stack || error).slice(0, 500));
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
