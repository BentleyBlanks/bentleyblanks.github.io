// Kimodo 预演片段的真模型联系图（docs/Data_EditorBlockout.md §14.5）：TengxianNra02 真骨骼身体，逐帧把清单里的骨骼局部变换
// 直接写到骨头上（不经 mixer），一行一个版本：第一行旧的手 K 片段，往下是 Kimodo 的各个样本 / 定稿；枪按道具轨画一根棕色杆。
//
//   node Taierzhuang1938/_import/Script_KimodoPrevizShot.mjs <Clip>[,<Clip>…] [--lib tmp/KimodoPreviz/lib/Animation_TengxianNra02PrevizKimodoSamples.json] [--side]
// 输出 Taierzhuang1938/tmp/KimodoPreviz/shots/<Clip>.png（不提交）。--side 改成纯侧面机位。

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "../Script_DevServer.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(projectDir, "..");
const argv = process.argv.slice(2);
const clips = (argv.find((a) => !a.startsWith("--")) || "").split(",").filter(Boolean);
const libArg = argv.includes("--lib") ? argv[argv.indexOf("--lib") + 1] : "tmp/KimodoPreviz/lib/Animation_TengxianNra02PrevizKimodoSamples.json";
const side = argv.includes("--side");
const outDir = path.join(projectDir, "tmp", "KimodoPreviz", "shots");
fs.mkdirSync(outDir, { recursive: true });
const spec = JSON.parse(fs.readFileSync(path.join(projectDir, "_import", "Data_KimodoPrevizPrompts.json"), "utf8"));

const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 1 });
try {
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&poseShot=1&phase=0&quality=high`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.actorFactory, null, { timeout: 300000 });
  // 骨骼身体是异步下载的：先造一个 NRA02 等它有 characterRig 再开拍
  await page.waitForFunction(() => {
    const T = window.Taierzhuang;
    try {
      const a = T.actorFactory.Create("nra", { seed: 1, weapon: null, modelVariant: 1, noPool: true });
      const ok = !!(a?.root && a.characterRig);
      a?.Dispose?.();
      return ok;
    } catch { return false; }
  }, null, { timeout: 300000, polling: 2000 });
  for (const clip of clips) {
    const row = spec.clips.find((c) => c.clip === clip);
    const oldLib = `Animation/${row.library}/Animation_TengxianNra02${row.library}.json`;
    const files = [];
    for (let rowIndex = 0; rowIndex < 12; rowIndex++) {
    const probe = await page.evaluate(async ({ clip, oldLib, newLib, side, rowIndex }) => {
      const T = window.Taierzhuang;
      const THREE = await import("/Taierzhuang1938/vendor/three/build/three.module.js");
      const load = async (url) => (await fetch(`/Taierzhuang1938/${url}?t=${Date.now()}`)).json();
      const [oldRec, newRec] = await Promise.all([load(oldLib), load(newLib)]);
      const versions = [["OLD", oldRec.clips[clip]]];
      for (const [k, v] of Object.entries(newRec.clips)) if (k === clip || k.startsWith(clip + "__")) versions.push([k.replace(clip, "") || "NEW", v]);
      if (rowIndex >= versions.length) return null;
      const all = versions.length;
      versions.splice(0, versions.length, versions[rowIndex]);
      const stale = []; window.__kpScene?.traverse((o) => { if (o.userData.actor) stale.push(o.userData.actor); }); for (const a of stale) a.Dispose?.();
      const scene = new THREE.Scene();
      window.__kpScene = scene;
      scene.background = new THREE.Color(0x1d1f24);
      scene.add(new THREE.HemisphereLight(0xd6d3c8, 0x2a2a30, 2.0));
      const key = new THREE.DirectionalLight(0xffe2b8, 3.2); key.position.set(3, 6, 5); scene.add(key);
      const COLS = 6, DX = 1.1, DZ = 0;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(COLS * DX + 4, versions.length * DZ + 4), new THREE.MeshStandardMaterial({ color: 0x3a342d, roughness: 1 }));
      floor.rotation.x = -Math.PI / 2; scene.add(floor);
      T.actorFactory.SetBatcher?.(null);
      const names = oldRec.bones;
      const out = [];
      for (const [r, [label, c]] of versions.entries()) {
        for (let k = 0; k < COLS; k++) {
          const f = Math.round(k * (c.frameCount - 1) / (COLS - 1));
          const actor = T.actorFactory.Create("nra", { seed: 4100 + r * 10 + k, weapon: null, modelVariant: 1, noPool: true });
          actor.Update(0.016, { elapsed: 1 });
          const rig = actor.characterRig;
          rig?.mixer?.stopAllAction();
          const byName = {};
          actor.root.traverse((o) => { byName[o.name] = o; });
          let set = 0;
          names.forEach((n, i) => {
            const b = byName[n] || byName[n.replace(/ /g, "_")];
            if (!b) return;
            const o = (f * names.length + i) * 7, v = c.values;
            b.position.set(v[o], v[o + 1], v[o + 2]); b.quaternion.set(v[o + 3], v[o + 4], v[o + 5], v[o + 6]); set++;
          });
          const sceneRoot = (byName.Character_TengxianNra02 || byName.GroundRoot).parent;
          const w = c.props?.weapon;
          if (w && w.values[f * w.stride + 9] > 0.5) {
            const o = f * w.stride, v = w.values;
            const org = new THREE.Vector3(v[o], v[o + 1], v[o + 2]), ax = new THREE.Vector3(v[o + 3], v[o + 4], v[o + 5]).normalize();
            const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x8a5a2b }));
            rod.position.copy(org).addScaledVector(ax, 0.25); rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax);
            sceneRoot.add(rod);
          }
          actor.root.position.set((k - (COLS - 1) / 2) * DX, 0, (r - (versions.length - 1) / 2) * DZ);
          actor.root.rotation.y = side ? Math.PI / 2 : Math.PI * 0.85;
          actor.root.visible = true; actor.root.traverse((n) => { if (n.isMesh) n.visible = true; });
          actor.root.userData.actor = actor;
          scene.add(actor.root);
          out.push({ label, f, set });
        }
      }
      T.state.menu = false; T.state.running = false;
      for (const id of ["hud", "menu", "boot"]) document.getElementById(id)?.style.setProperty("display", "none", "important");
      const camera = new THREE.PerspectiveCamera(30, 1800 / 1000, 0.1, 200);
      if (side) { camera.position.set(0, 1.6, 9.2); camera.lookAt(0, 0.75, 0); }
      else { camera.position.set(0, 2.2, 8.6); camera.lookAt(0, 0.7, 0); }
      scene.updateMatrixWorld(true);
      T.renderer.setSize(1800, 1000, false);
      T.renderer.render(scene, camera);
      document.getElementById("kpLabels")?.remove();
      const labels = document.createElement("div"); labels.id = "kpLabels";
      labels.style.cssText = "position:fixed;left:8px;top:8px;color:#fff;font:600 18px/1.4 sans-serif;text-shadow:0 2px 4px #000;z-index:9999;white-space:pre";
      labels.textContent = `${clip}  ${versions[0][0]}  ${versions[0][1].duration}s  (frames ${out.map((o) => o.f).join(", ")})`;
      document.body.appendChild(labels);
      return { rows: all, bonesSet: out[0]?.set };
    }, { clip, oldLib, newLib: libArg.replace(/^Taierzhuang1938\//, ""), side, rowIndex });
    if (!probe) break;
    const file = path.join(outDir, `${clip}${side ? "_side" : ""}_${rowIndex}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 150, width: 1800, height: 700 } });
    files.push(file);
    }
    const sheet = path.join(outDir, `${clip}${side ? "_side" : ""}.png`);
    execFileSync("python", ["-c", `import sys
from PIL import Image
ims=[Image.open(f) for f in sys.argv[2:]]
W=max(i.width for i in ims);H=sum(i.height for i in ims)
out=Image.new('RGB',(W,H))
y=0
for i in ims:
  out.paste(i,(0,y));y+=i.height
out.resize((W*2//3,H*2//3)).save(sys.argv[1])`, sheet, ...files]);
    for (const f of files) fs.unlinkSync(f);
    console.log(clip, files.length, "rows", sheet);
  }
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}
