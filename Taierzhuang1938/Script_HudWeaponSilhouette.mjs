// 情境提示里「换上 / 拾起 某把枪」下面那条枪的剪影（对标 COD WWII 的拾枪提示）。
//
// 剪影不手画：拿编辑器台架上**真模型**的正侧面，正交相机、纯白无光照拍一张，
// 按 alpha 裁边后涂成提示文字同色的米白，存成透明 PNG。模型改了重跑一遍即可。
// 所有枪按同一个「米 / 像素」拍，HUD 按像素宽换算显示宽度 —— 长枪长、短枪短，
// 比例和真枪一致（见 Data_HudWeaponIcons.mjs）。
//
// 用法：node Taierzhuang1938/Script_HudWeaponSilhouette.mjs
// 产出：Texture/Hud/Texture_HudWeapon_<id>.png + Data_HudWeaponIcons.mjs

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const outDir = path.join(projectDir, "Texture", "Hud");

/** 能从地上 / 尸体上捡起来的那几把。 */
const IDS = ["ZhongZheng", "HanYang", "Type38", "Zb26", "Type11", "ServicePistol", "Dadao"];
/** 1 像素 = 2.5 毫米：一米二的步枪约 500 px 宽，HUD 上缩到 7em 左右仍然清楚。 */
const METERS_PER_PX = 0.0025;
const FILL = "#ece3cc";

const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const problems = [];
page.on("pageerror", (error) => problems.push(String(error)));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?quality=low&scale=small&phase=0&menu=0`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
  await page.evaluate(() => { const T = window.Taierzhuang; T.StepFrames(10); T.Debug.OpenEditor("weapon"); T.StepFrames(5); });

  const icons = {};
  for (const id of IDS) {
    const shot = await page.evaluate(async ({ id, metersPerPx, fill }) => {
      const T = window.Taierzhuang;
      const THREE = await import("./vendor/three/build/three.module.js");
      const editor = T.editor.active;
      editor.spin = false;
      editor.SetMode("bench");
      editor.SetWeapon(id, 0);
      T.StepFrames(2);
      if (!editor.benchGroup) return null;

      // 只要枪本体：挂点小方块（MeshBasicMaterial）与藏着的台架刺刀不进剪影。
      const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const scene = new THREE.Scene();
      scene.matrixWorldAutoUpdate = false;
      const parts = [];
      editor.benchGroup.updateWorldMatrix(true, true);
      editor.benchGroup.traverseVisible((child) => {
        if (!child.isMesh || child.material?.isMeshBasicMaterial) return;
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        parts.push({ geometry: child.geometry, matrix: child.matrixWorld.clone() });
      });
      const Bounds = () => {
        const box = new THREE.Box3();
        for (const part of parts) box.union(part.geometry.boundingBox.clone().applyMatrix4(part.matrix));
        return box;
      };
      let box = Bounds();
      // 竖放在台架上的（大刀）转平：剪影一律横躺。
      if (box.max.y - box.min.y > (box.max.x - box.min.x) * 1.2) {
        const turn = new THREE.Matrix4().makeRotationZ(Math.PI / 2);
        for (const part of parts) part.matrix.premultiply(turn);
        box = Bounds();
      }
      for (const part of parts) {
        const mesh = new THREE.Mesh(part.geometry, white);
        mesh.matrixAutoUpdate = false;
        mesh.matrixWorldAutoUpdate = false;
        mesh.matrix.copy(part.matrix);
        mesh.matrixWorld.copy(part.matrix);
        scene.add(mesh);
      }
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const pad = 0.02;
      const w = size.x + pad * 2, h = size.y + pad * 2;
      // 相机在 -Z 看 +Z：屏幕右 = 世界 -X = 枪口（台架约定），剪影枪口朝右。
      const camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.01, 20);
      camera.position.set(center.x, center.y, center.z - 5);
      camera.lookAt(center);
      const pw = Math.ceil(w / metersPerPx), ph = Math.ceil(h / metersPerPx);
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(pw, ph, false);
      renderer.setClearColor(0x000000, 0);
      renderer.render(scene, camera);

      const cv = document.createElement("canvas");
      cv.width = pw; cv.height = ph;
      const ctx = cv.getContext("2d");
      ctx.drawImage(renderer.domElement, 0, 0);
      renderer.dispose();
      const data = ctx.getImageData(0, 0, pw, ph).data;
      let x0 = pw, y0 = ph, x1 = -1, y1 = -1;
      for (let y = 0; y < ph; y += 1) for (let x = 0; x < pw; x += 1) {
        if (data[(y * pw + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 < 0) return null;
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
      const out = document.createElement("canvas");
      out.width = cw; out.height = ch;
      const octx = out.getContext("2d");
      octx.drawImage(cv, x0, y0, cw, ch, 0, 0, cw, ch);
      octx.globalCompositeOperation = "source-in";
      octx.fillStyle = fill;
      octx.fillRect(0, 0, cw, ch);
      return { w: cw, h: ch, png: out.toDataURL("image/png") };
    }, { id, metersPerPx: METERS_PER_PX, fill: FILL });
    if (!shot) { console.log(`skip ${id}: 台架上没有几何`); continue; }
    const file = `Texture_HudWeapon_${id}.png`;
    fs.writeFileSync(path.join(outDir, file), Buffer.from(shot.png.split(",")[1], "base64"));
    icons[id] = { src: `Texture/Hud/${file}`, w: shot.w, h: shot.h };
    console.log(`ok  ${id}: ${shot.w}×${shot.h}`);
  }

  const lines = Object.entries(icons).map(([id, v]) => `  ${id}: { src: "${v.src}", w: ${v.w}, h: ${v.h} },`);
  fs.writeFileSync(path.join(projectDir, "Data_HudWeaponIcons.mjs"),
    `// 拾枪提示下面那条枪的剪影。由 Script_HudWeaponSilhouette.mjs 从台架真模型生成，别手改。\n`
    + `// 所有剪影同一比例拍（METERS_PER_PX = ${METERS_PER_PX}），w/h 是像素。\n`
    + `export const HUD_WEAPON_ICONS = {\n${lines.join("\n")}\n};\n`);
  if (problems.length) console.log(problems.join("\n"));
} finally {
  await browser.close();
  server.close();
}
