// 深度体检：把每个玩法层元素的"实际渲染底边"跟它该踩的地平线比一比。
//
// 规范（见 Script_World.js 顶部 Z 轴分配规范）：
//   落地物件的贴图底边，世界 y 必须等于所在层的地平线——地面 SURFACE_Y=0、
//   地道 UNDER_Y=-3.6——**与它的 z 无关**。屏幕上远处物件底边看起来更高，
//   那是地面透视收缩的正确结果，由真实地面几何体负责表现，不该靠挪 y 去凑。
//   凡是底边不等于地平线的，就是悬空（>0）或陷进地里（<0）。
//
// 运行：node TunnelLight1943/Script_DepthAudit.mjs [章节...]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const chapters = process.argv.slice(2).length
  ? process.argv.slice(2).map(Number) : [1, 2, 3, 4, 5, 6, 7, 8];

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

let bad = 0;
for (const ch of chapters) {
  await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/?chapter=${ch}&fast=1`,
    { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.TunnelLight?.world?.debugLayers, { timeout: 60000 });
  const report = await page.evaluate(() => {
    const { layers, SURFACE_Y, UNDER_Y, THREE } = window.TunnelLight.world.debugLayers();
    const out = [];
    const box = new THREE.Box3();
    layers.play.updateMatrixWorld(true);
    for (const o of layers.play.children) {
      if (!o.isMesh || !o.geometry?.parameters?.height) continue;
      // 躺平的地面/投影不参与（它们本来就贴着地）
      if (Math.abs(o.rotation.x) > 0.1) continue;
      box.setFromObject(o);
      const bottom = box.min.y;
      // 地平线取"作者标注的锚点"，不要靠底边去猜——猜会把地表带、地道剖面
      // 这类本来就该往下长的东西误判成悬空
      if (!o.userData.anchor) continue;
      const line = o.userData.anchor.y;
      const err = bottom - line;
      // 只报"悬空"：底边高于地平线。陷到地平线以下多半是本来就该如此
      // （地道剖面、地窖口、壕沟、房子的地基），不算问题。
      if (err > 0.06) {
        out.push({ kind: o.userData.kind || ("?" + [o.geometry.parameters.width.toFixed(1), o.geometry.parameters.height.toFixed(1)].join("x")), z: +o.position.z.toFixed(2), err: +err.toFixed(3) });
      }
    }
    return out;
  });
  if (report.length) {
    bad += report.length;
    const worst = report.slice().sort((a, b) => b.err - a.err).slice(0, 8);
    console.log(`第${ch}章  悬空 ${report.length} 个`);
    console.log(`        ${worst.map((w) => `${w.kind}(z=${w.z}) 离地${w.err}m`).join("  ")}`);
  } else {
    console.log(`第${ch}章  ✓ 全部贴地`);
  }
}

await browser.close();
server.close();
if (errors.length) { console.error("页面异常：", errors.slice(0, 3).join(" | ")); process.exit(1); }
if (bad) { console.error(`\n共 ${bad} 个元素没落在地平线上`); process.exit(1); }
console.log("\n深度体检通过 ✓");
