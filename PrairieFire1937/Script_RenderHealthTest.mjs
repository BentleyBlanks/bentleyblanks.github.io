// 《燎原 · 敌后1937》 —— 渲染健康检查（一票否决级）。
//
// 真实启动页面，读取 GL 错误码、shader 编译报错与地形网格状态。
// 这个测试的由来：曾有一档画质的 CSM 宏组合让片元着色器编译失败
// （'[]' : array index out of range，GL 1282），three 会把这类失败静默吞掉——
// 地图整块不画，页面却"看起来在运行"，截图之外的一切验证全部照常通过。
// 结论：渲染必须读 gl.getError() 与材质编译状态验证，不能只看"有没有报异常"。
//
// 依赖：playwright-core（npm i -D playwright-core）+ 一个本机浏览器。
// 浏览器解析顺序见 Script_BrowserTestKit.mjs（PF_BROWSER_PATH → Edge/Chrome → 自带 Chromium）。
// 运行：node PrairieFire1937/Script_RenderHealthTest.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser, ServeProject } from "./Script_BrowserTestKit.mjs";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const server = await ServeProject(projectRoot);
const port = server.address().port;
const browser = await LaunchBrowser();

let failed = 0;
// 覆盖三档 PC 视口；单一渲染路径下画质入口只剩形式意义，验一档即验全部。
for (const [width, height] of [[1920, 1080], [1600, 900], [1366, 768]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 160)}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 160));
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.PrairieFire !== undefined, { timeout: 120000 });
  await page.evaluate(async () => {
    window.PrairieFire.SetAutoPlay(true);
    window.PrairieFire.handle.SetQuality("high");
    for (let i = 0; i < 3; i += 1) await window.PrairieFire.EndTurn();
  });
  await page.waitForTimeout(1200);

  const probe = await page.evaluate(() => {
    const handle = window.PrairieFire.handle;
    const gl = handle.renderer.getContext();
    let terrainVisible = false;
    let terrainTris = 0;
    handle.scene.traverse((object) => {
      if (object.isMesh && /Terrain/i.test(object.material?.name || "")) {
        terrainVisible = object.visible;
        const geometry = object.geometry;
        terrainTris = (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
      }
    });
    return {
      glError: gl.getError(),
      terrainVisible,
      terrainTris,
      programs: handle.renderer.info.programs.length,
      calls: handle.renderer.info.render.calls,
    };
  });

  const shaderErrors = errors.filter((entry) => /Shader Error|not compiled|VALIDATE_STATUS|array index/i.test(entry));
  const ok = probe.glError === 0 && shaderErrors.length === 0 && probe.terrainVisible && probe.terrainTris > 1000;
  if (!ok) failed += 1;
  console.log(
    `${ok ? "✓" : "✗"} ${width}x${height}  glError=${probe.glError} terrain=${probe.terrainVisible}/${Math.round(probe.terrainTris)}tri ` +
      `programs=${probe.programs} calls=${probe.calls}${shaderErrors.length ? `  SHADER-ERR: ${shaderErrors[0].slice(0, 90)}` : ""}`,
  );
  await page.close();
}

await browser.close();
server.close();
console.log(failed ? `\n失败 ${failed} 项` : "\n渲染健康检查全部通过：无 shader 编译失败、无 GL 错误、地形均已绘制");
process.exit(failed ? 1 : 0);
