// 视频转骨骼 clip 联系图：真实 ActorFactory 里逐相位定格三条 mocap clip 并截图。
// 走循环的问题（滑步/僵直/关节反折）静帧联系图看不全，但姿势对不对、
// 手有没有跟着担架杆、跛行的重心塌不塌，一张图就能裁。动图另看
// _import/_mocap 里的 overlay 序列（源视频 + 骨架叠帧）。
//
// 用法：node Taierzhuang1938/Script_MocapClipShot.mjs [输出 PNG]
// 默认输出 Taierzhuang1938/_shots/actor_pose/MocapClips.png（_shots 已 gitignore）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const outFile = path.resolve(process.argv[2] || path.join(projectDir, "_shots", "actor_pose", "MocapClips.png"));
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
try {
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&poseShot=1&phase=0&quality=high`, {
    waitUntil: "load", timeout: 120000,
  });
  await page.waitForFunction(() => window.Taierzhuang?.actorFactory, null, { timeout: 300000 });
  const probe = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const THREE = await import("/Taierzhuang1938/vendor/three/build/three.module.js");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x17191d);
    scene.add(new THREE.HemisphereLight(0xd6d3c8, 0x24242a, 2.2));
    const key = new THREE.DirectionalLight(0xffe2b8, 3.5);
    key.position.set(4, 6, 3); scene.add(key);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a342d, roughness: 1 }));
    floor.rotation.x = -Math.PI * 0.5; scene.add(floor);
    T.actorFactory.SetBatcher(null);
    // 三条 clip × 三个相位；人面朝 -Z，机位摆在 +X 侧看纯侧面。
    const clips = ["CarryStretcherFront", "CarryStretcherRear", "WoundedLimp"];
    const phases = [0.0, 0.33, 0.66];
    const shots = [];
    for (const [c, clipId] of clips.entries()) {
      for (const [p, phase] of phases.entries()) {
        shots.push({ clipId, phase, z: (c * 3 + p - 4) * 1.15, label: p === 1 ? clipId : "" });
      }
    }
    for (const [index, shot] of shots.entries()) {
      // 担架员/伤员在任务数据里都是 weapon:null 的空手位——联系图照实拍
      const actor = T.actorFactory.Create("nra", { seed: 8200 + index, weapon: null });
      actor.root.position.set(0, 0, shot.z);
      actor.Update(0.016, { elapsed: 1 });
      const rig = actor.characterRig;
      if (rig) {
        rig.ForceClip(shot.clipId);
        // ForceClip 走的是 0.08 s crossfade；联系图用 setTime 定格时淡入没走完，
        // 权重为 0 会把**上一条** clip 拍进图里（第一版联系图的假姿势就是它）。
        // 硬切：停掉别的动作、满权重、再钉相位。
        rig.mixer.stopAllAction();
        rig.currentAction.reset().setLoop(THREE.LoopRepeat, Infinity).stopFading().setEffectiveWeight(1).play();
        const duration = rig.currentAction.getClip().duration || 1;
        rig.mixer.setTime(shot.phase * duration);
      }
      actor.root.visible = true;
      actor.root.traverse((node) => { if (node.isMesh) node.visible = true; });
      scene.add(actor.root);
      shot.actor = actor;
    }
    T.state.menu = false;
    T.state.running = false;
    for (const id of ["hud", "menu", "boot"]) {
      document.getElementById(id)?.style.setProperty("display", "none", "important");
    }
    const camera = new THREE.PerspectiveCamera(34, 1600 / 900, 0.1, 100);
    camera.position.set(9.5, 1.35, 0); camera.lookAt(0, 0.85, 0);
    scene.updateMatrixWorld(true);
    T.renderer.render(scene, camera);
    const labels = document.createElement("div");
    labels.style.cssText = "position:fixed;left:0;right:0;top:16px;display:flex;justify-content:space-around;color:#fff;font:600 20px/1.2 sans-serif;text-shadow:0 2px 4px #000;pointer-events:none;z-index:9999";
    for (const clipId of clips) {
      const item = document.createElement("span");
      item.textContent = clipId;
      labels.appendChild(item);
    }
    document.body.appendChild(labels);
    // 回读取证：每个演员正在播哪条 clip、前臂世界方向（visible≠看得见的老账，
    // 联系图之外再留一份可断言的数）。
    return shots.map((shot) => {
      const rig = shot.actor.characterRig;
      const bones = rig?.bones || {};
      const dirOf = (a, b) => {
        if (!a || !b) return null;
        const pa = new THREE.Vector3();
        const pb = new THREE.Vector3();
        a.getWorldPosition(pa); b.getWorldPosition(pb);
        return pb.sub(pa).normalize().toArray().map((v) => +v.toFixed(2));
      };
      const foreL = bones.forearmL || null;
      const handL = bones.handL || null;
      return {
        clip: shot.clipId, phase: shot.phase,
        playing: rig?.currentPlaybackId, forced: rig?.forcedClip,
        weight: rig?.currentAction?.getEffectiveWeight?.(),
        time: +(rig?.currentAction?.time ?? -1).toFixed(2),
        foreLDir: dirOf(foreL, handL),
      };
    });
  });
  for (const row of probe) console.log(JSON.stringify(row));
  await page.screenshot({ path: outFile });
  console.log(`MocapClipShot: wrote ${outFile}`);
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}
