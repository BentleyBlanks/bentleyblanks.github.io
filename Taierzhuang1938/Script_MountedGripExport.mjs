// 接管机枪握姿的取证包：第一关 04 真接管那挺枪，把此刻的双手蒙皮、手指骨链与枪面三角形
// 换算到枪局部坐标（three.js：Y 上、-Z 前、米）写成一个 JSON，交给
// `_blender/Script_MountedGripFit.py` 在 Blender 里量穿插、逐指拟合屈曲角、出近景图。
// 口径见 docs/Data_FirstPersonEmbodiment.md「架设机枪」。
//
// 用法：node Taierzhuang1938/Script_MountedGripExport.mjs
//   写 Taierzhuang1938/_shots/MountedGrip/Data_MountedGripPackage.json（忽略目录），
//   并打印十个指腹离枪面的距离（与 FpsHandContactTest 同一把尺）。
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { FRONT_SORTIE } from "./Data_FirstLevelFrontRoute.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "_shots", "MountedGrip");
await fs.mkdir(out, { recursive: true });
const server = await ServeRoot(path.resolve(here, ".."), 0);
const browser = await LaunchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&missionStage=4&quality=medium&scale=small`,
    { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
  await page.evaluate(({ seat }) => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
    g.StepFrames(60);
    g.player.Spawn(seat.x, seat.z, 0); g.StepFrames(20, 1 / 60, false); g.Debug.Emplacement.Occupy(r.gunId);
    g.player.yaw = 0; g.player.pitch = 0; g.StepFrames(60, 1 / 60, false); g.StepFrames(3, 1 / 60, true);
  }, { seat: FRONT_SORTIE.seat });
  const pkg = await page.evaluate(async () => {
    const THREE = await import("./vendor/three/build/three.module.js");
    const { FpsArmPose } = await import("./Data_FpsArmPoses.mjs");
    const g = window.Tengxian, vm = g.viewmodel, arms = vm.riggedArms;
    vm.root.updateMatrixWorld(true);
    arms.root.traverse((m) => { if (m.isSkinnedMesh) m.skeleton.update(); });
    const G = vm.rig.group, inv = G.matrixWorld.clone().invert();
    const R = (v) => +v.toFixed(5);
    const gun = [], tris = [];
    G.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      for (let q = o; q && q !== G.parent; q = q.parent) if (!q.visible) return;
      const p = o.geometry.attributes.position, index = o.geometry.index, m = inv.clone().multiply(o.matrixWorld);
      for (let i = 0; i < (index?.count || p.count); i += 3) {
        const t = new THREE.Triangle(...[0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i + j) : i + j).applyMatrix4(m)));
        tris.push(t); gun.push([...t.a.toArray(), ...t.b.toArray(), ...t.c.toArray()].map(R));
      }
    });
    const chain = {}, pads = {}, report = [];
    for (const side of ["r", "l"]) {
      chain[side] = {};
      for (const c of arms.anatomy[side].curls) {
        const b = c.bone;
        chain[side][b.name] = { world: inv.clone().multiply(b.matrixWorld).toArray(), parentWorld: inv.clone().multiply(b.parent.matrixWorld).toArray(),
          local: b.quaternion.toArray(), axis: c.axis.toArray(), position: b.position.toArray(), scale: b.scale.toArray() };
      }
      for (let digit = 0; digit < 5; digit++) {
        const bone = arms.anatomy[side].curls.find((c) => c.bone.name.toLowerCase().endsWith(`finger${digit}2`)).bone, pts = [];
        arms.root.traverse((mesh) => {
          if (!mesh.isSkinnedMesh) return;
          const geo = mesh.geometry, index = mesh.skeleton.bones.indexOf(bone);
          for (let i = 0; i < geo.attributes.position.count; i++) {
            let w = 0; for (let j = 0; j < 4; j++) if (geo.attributes.skinIndex.getComponent(i, j) === index) w += geo.attributes.skinWeight.getComponent(i, j);
            if (w > .95) pts.push(bone.worldToLocal(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)));
          }
        });
        const box = new THREE.Box3().setFromPoints(pts);
        const point = new THREE.Vector3(box.max.x * .78, box.max.y * (digit ? .9 : .75), (box.min.z + box.max.z) * .5);
        pads[`${side}${digit}2`] = { bone: bone.name, point: point.toArray() };
        const pad = bone.localToWorld(point.clone()).applyMatrix4(inv), c = new THREE.Vector3();
        let d = Infinity; for (const t of tris) { t.closestPointToPoint(pad, c); d = Math.min(d, pad.distanceTo(c)); }
        report.push(`${side}${digit}:${(d * 1000).toFixed(1)}mm`);
      }
    }
    const skin = [];
    arms.root.traverse((mesh) => {
      if (!mesh.isSkinnedMesh || !mesh.visible) return;
      const geo = mesh.geometry, n = geo.attributes.position.count, pos = [], v = new THREE.Vector3();
      for (let i = 0; i < n; i++) { mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv); pos.push(R(v.x), R(v.y), R(v.z)); }
      const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, infl = [], wts = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) { infl.push(si.getComponent(i, j)); wts.push(+sw.getComponent(i, j).toFixed(4)); }
      skin.push({ name: mesh.name, pos, idx: geo.index ? Array.from(geo.index.array) : null, bones: mesh.skeleton.bones.map((b) => b.name), infl, wts });
    });
    const pose = FpsArmPose(vm.armPoseKey);
    return { weapon: vm.weaponId, armPose: vm.armPoseKey, contacts: { right: pose.contacts.right, left: pose.contacts.left },
      gun, chain, pads, skin, padReport: report };
  });
  await fs.writeFile(path.join(out, "Data_MountedGripPackage.json"), JSON.stringify(pkg));
  console.log(`${pkg.armPose}  ${pkg.padReport.join("  ")}`);
  console.log(`写入 ${path.join(out, "Data_MountedGripPackage.json")}${errors.length ? "\n页面错误：" + errors.join("\n") : ""}`);
} finally { await browser.close(); await new Promise((r) => server.close(r)); }
