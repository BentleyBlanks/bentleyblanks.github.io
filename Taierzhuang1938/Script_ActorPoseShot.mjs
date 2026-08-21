// 车厢生活动作联系图：在真实 ActorFactory / Three.js 页面里固定六个动作并截图。
// 用法：node Taierzhuang1938/Script_ActorPoseShot.mjs [输出 PNG]
// 默认输出 Taierzhuang1938/_shots/actor_pose/ActorPoses.png（_shots 已 gitignore）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const outFile = path.resolve(process.argv[2] || path.join(projectDir, "_shots", "actor_pose", "ActorPoses.png"));
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
try {
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&poseShot=1&phase=0&quality=high`, {
    waitUntil: "load", timeout: 120000,
  });
  await page.waitForFunction(() => window.Taierzhuang?.actorFactory, { timeout: 300000 });
  await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const THREE = await import("/Taierzhuang1938/vendor/three/build/three.module.js");
    // 用独立小场景隔离战场雾/菜单后处理，让联系图只回答“姿态剪影是否读得出”。
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x17191d);
    scene.add(new THREE.HemisphereLight(0xd6d3c8, 0x24242a, 2.2));
    const key = new THREE.DirectionalLight(0xffe2b8, 3.5);
    key.position.set(-3, 6, 4); scene.add(key);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a342d, roughness: 1 }));
    floor.rotation.x = -Math.PI * 0.5; scene.add(floor);
    const benchMaterial = new THREE.MeshStandardMaterial({ color: 0x72533a, roughness: 0.95 });
    const addBench = (x, back = false) => {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.14, 0.42), benchMaterial);
      seat.position.set(x, 0.34, 0.14); scene.add(seat);
      if (back) {
        const rest = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.82, 0.12), benchMaterial);
        rest.position.set(x, 0.72, 0.31); scene.add(rest);
      }
    };
    // 车厢长凳只属于联系图测试场景；它给坐姿/靠墙睡一个明确的参照物。
    for (const index of [0, 1, 2, 3, 4, 5]) addBench((index - 2.5) * 0.92, index === 3);
    const camera = new THREE.PerspectiveCamera(32, 1600 / 900, 0.1, 100);
    camera.position.set(0, 1.0, -7.2); camera.lookAt(0, 0.78, 0);
    T.actorFactory.SetBatcher(null);
    const states = [
      ["坐姿", "nra", null, { sit: 1 }],
      ["补鞋", "civilian", null, { sit: 0.92, repairShoe: 1 }],
      ["擦枪", "nra", "ZhongZheng", { sit: 0.85, cleanRifle: 1 }],
      ["靠墙睡", "civilian", null, { sleep: 1 }],
      ["查弹药", "nra", "ZhongZheng", { sit: 0.75, checkAmmo: 1 }],
      ["炮后准备", "nra", "ZhongZheng", { sit: 0.65, prepare: 1 }],
    ];
    const actors = states.map(([label, kind, weapon, state], index) => {
      const actor = T.actorFactory.Create(kind, { seed: 8100 + index, weapon });
      actor.root.position.set((index - 2.5) * 0.92, 0, 0);
      actor.Update(0.016, { ...state, elapsed: 1.25 });
      actor.root.visible = true;
      actor.root.traverse((node) => { if (node.isMesh) node.visible = true; });
      scene.add(actor.root);
      return { actor, label };
    });
    T.state.menu = false;
    T.state.running = false;
    for (const id of ["hud", "menu", "boot"]) {
      document.getElementById(id)?.style.setProperty("display", "none", "important");
    }
    scene.updateMatrixWorld(true);
    T.renderer.render(scene, camera);
    const labels = document.createElement("div");
    labels.id = "actor-pose-shot-labels";
    labels.style.cssText = "position:fixed;left:0;right:0;top:18px;display:flex;justify-content:center;gap:35px;color:#fff;font:600 20px/1.2 sans-serif;text-shadow:0 2px 4px #000;pointer-events:none;z-index:9999";
    for (const [index, { label }] of actors.entries()) {
      const item = document.createElement("span");
      item.textContent = label;
      // 相机从人物正面（-Z）看，屏幕横轴与人物局部 X 反向。
      item.style.cssText = `position:absolute;left:${82 - index * 12.8}%;transform:translateX(-50%);`;
      labels.appendChild(item);
    }
    document.body.appendChild(labels);
  });
  await page.screenshot({ path: outFile });
  console.log(`ActorPoseShot: wrote ${outFile}`);
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}
