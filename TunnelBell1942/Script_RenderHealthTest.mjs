// 《地道战 · 钟声》—— 渲染健康检查（一票否决级）。
// 运行：node TunnelBell1942/Script_RenderHealthTest.mjs
//
// 为什么需要这个：three 会静默吞掉 shader 编译失败——地图整块不画，
// 页面却"看起来在运行"，纯逻辑测试全部照常通过。所以必须读 gl.getError()、
// 读 renderer.info、并对画面像素做实测，不能只看有没有抛异常。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser, OpenGame, SamplePixels, ServeProject } from "./Script_BrowserTestKit.mjs";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const server = await ServeProject(projectRoot);
const port = server.address().port;
const browser = await LaunchBrowser();

let failed = 0;
function Assert(cond, msg) {
  if (cond) { console.log("ok:", msg); return true; }
  failed += 1;
  console.error("FAIL:", msg);
  return false;
}

const { page, errors } = await OpenGame(browser, port, { width: 1600, height: 900 });
Assert(errors.length === 0, `启动无页面错误 ${errors.length ? `→ ${errors[0]}` : ""}`);

for (let levelIndex = 0; levelIndex < 3; levelIndex += 1) {
  const tag = `act${levelIndex + 1}`;
  await page.evaluate((i) => {
    window.TunnelBell.Begin(i);
    const go = document.getElementById("ChapterGoButton");
    if (go && !document.getElementById("ChapterScreen").hidden) go.click();
    window.TunnelBell.SkipPanels();
  }, levelIndex);
  await page.waitForTimeout(500);

  const probe = await page.evaluate(() => {
    const handle = window.TunnelBell.render;
    // info.render.calls 是"上一次 render 的计数"，不是累计值。
    // 探针如果赶在本幕第一个 rAF 之前跑，读到的就是 0——那是时序假象，不是没画。
    // 这里主动画一帧，让计数反映真实的提交量。
    handle.renderer.render(handle.scene, handle.camera);
    const gl = handle.renderer.getContext();
    let meshes = 0;
    let tris = 0;
    handle.scene.traverse((o) => {
      if (o.isMesh) {
        meshes += 1;
        const g = o.geometry;
        if (g && g.attributes && g.attributes.position) {
          tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
        }
      }
    });
    return {
      glError: gl.getError(),
      meshes,
      tris: Math.round(tris),
      calls: handle.renderer.info.render.calls,
      programs: handle.renderer.info.programs.length,
      stats: handle.stats ? { ...handle.stats } : null,
      err: window.TunnelBell.error,
    };
  });

  Assert(probe.glError === 0, `${tag}: gl.getError() 为 0（实际 ${probe.glError}）`);
  Assert(!probe.err, `${tag}: 无运行时异常`);
  Assert(probe.meshes > 20, `${tag}: 场景里有实体（mesh ${probe.meshes}）`);
  Assert(probe.tris > 500, `${tag}: 几何不是空的（tri ${probe.tris}）`);
  Assert(probe.calls > 0, `${tag}: 真的提交了绘制（calls ${probe.calls}）`);
  Assert(probe.calls < 400, `${tag}: draw calls 受控（${probe.calls}）`);

  // 像素实测：画面不能是一整块纯色（黑屏 / 只剩天空）
  const pixelSpread = await SamplePixels(page);
  Assert(pixelSpread.max - pixelSpread.min > 40, `${tag}: 画面有明暗层次（${pixelSpread.min}→${pixelSpread.max}）`);
  Assert(pixelSpread.tones >= 6, `${tag}: 色调不单一（${pixelSpread.tones} 档）`);
  Assert(pixelSpread.mean > 6, `${tag}: 不是全黑（均值 ${pixelSpread.mean.toFixed(1)}）`);
  Assert(pixelSpread.hues >= 8, `${tag}: 有色彩层次（${pixelSpread.hues} 种色块）`);

  // 角色必须在画面里看得见：玩家所在的那一竖条要比同高度的背景更有对比
  // 投影一律走相机矩阵。以前这里手算正交视锥，换成透视之后那套算法会静默算错，
  // 得到的截图裁剪框落在别处，"角色有没有对比"就变成了在量一块空地。
  const readable = await page.evaluate(() => {
    const s = window.TunnelBell.state;
    const handle = window.TunnelBell.render;
    const cv = document.getElementById("GameCanvas");
    const W = cv.clientWidth; const H = cv.clientHeight;
    const v = new handle.three.Vector3();
    const project = (wx, wy) => {
      v.set(wx, wy, 0).project(handle.camera);
      return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
    };
    const head = project(s.player.x, s.player.y + 1.9);
    const feet = project(s.player.x, s.player.y - 0.2);
    return { sx: head.x, syTop: head.y, h: feet.y - head.y, W, H };
  });
  if (readable.sx > 40 && readable.sx < readable.W - 40 && readable.h > 8) {
    const onPlayer = await SamplePixels(page, {
      x: Math.max(0, readable.sx - 26), y: Math.max(0, readable.syTop),
      width: 52, height: Math.min(readable.h, readable.H - readable.syTop),
    });
    Assert(onPlayer.max - onPlayer.min > 24,
      `${tag}: 角色所在处有对比，不是糊在背景里（${onPlayer.min}→${onPlayer.max}）`);
  }

  // 玩家必须在画面里（用真实投影判，不靠视锥假设）
  const onScreen = await page.evaluate(() => {
    const s = window.TunnelBell.state;
    const handle = window.TunnelBell.render;
    const v = new handle.three.Vector3(s.player.x, s.player.y + 0.85, 0).project(handle.camera);
    return { ndcX: v.x, ndcY: v.y };
  });
  Assert(Math.abs(onScreen.ndcX) < 1 && Math.abs(onScreen.ndcY) < 1,
    `${tag}: 玩家在画面内（ndc ${onScreen.ndcX.toFixed(2)}, ${onScreen.ndcY.toFixed(2)}）`);

  // 横版判据：长焦透视允许有景深，但不许出现广角畸变。
  // 同一根一米高的竖直杆，放在画面中心和放在左右边缘，屏幕高度差不能太大。
  const lens = await page.evaluate(() => {
    const s = window.TunnelBell.state;
    const handle = window.TunnelBell.render;
    const cam = handle.camera;
    const halfW = s.camera.viewHeight * 0.5 * (cam.aspect || 16 / 9);
    const a = new handle.three.Vector3();
    const b = new handle.three.Vector3();
    const barHeight = (wx) => {
      a.set(wx, s.player.y, 0).project(cam);
      b.set(wx, s.player.y + 1, 0).project(cam);
      return Math.abs(b.y - a.y);
    };
    const mid = barHeight(s.camera.x);
    const edge = barHeight(s.camera.x + halfW * 0.92);
    return { mid, edge, ratio: edge / Math.max(1e-6, mid), fov: cam.fov, isPerspective: !!cam.isPerspectiveCamera };
  });
  Assert(lens.isPerspective, `${tag}: 用的是透视相机（2.5D 的前提）`);
  Assert(lens.fov > 0 && lens.fov <= 26, `${tag}: 长焦，没有广角（fov ${lens.fov}）`);
  Assert(Math.abs(lens.ratio - 1) < 0.06,
    `${tag}: 画面边缘不畸变，横版成立（边缘/中心 ${lens.ratio.toFixed(3)}）`);

  // 新增一种敌人 kind 却忘了给它 rig 映射，是不会报错的：它会静默退化成 soldier。
  // 汤丙会就这么当了一整轮日军——伪军长得跟占领军一样，这个角色就白加了。
  const rigMap = await page.evaluate(() => {
    const handle = window.TunnelBell.render;
    if (typeof handle.RigKindFor !== "function") return null;
    const kinds = [...new Set((window.TunnelBell.state.level.enemies || []).map((e) => e.kind))];
    const out = {};
    for (const k of kinds) out[k] = handle.RigKindFor(k);
    return out;
  });
  if (rigMap) {
    for (const [enemyKind, rigKind] of Object.entries(rigMap)) {
      Assert(!!rigKind, `${tag}: 敌人 kind "${enemyKind}" 有 rig 映射`);
      // guard/search 共用 soldier 是有意的；puppet/officer/dog 必须各自独立
      if (["puppet", "officer", "dog"].includes(enemyKind)) {
        Assert(rigKind === enemyKind,
          `${tag}: "${enemyKind}" 用自己的 rig 而不是退化成 ${rigKind}`);
      }
    }
  }

  // 跑 3 秒真实帧，看有没有累积泄漏 / 崩溃
  const after = await page.evaluate(async () => {
    const handle = window.TunnelBell.render;
    const before = {
      geometries: handle.renderer.info.memory.geometries,
      textures: handle.renderer.info.memory.textures,
    };
    window.TunnelBell.Advance(3.0, { moveX: 1 });
    await new Promise((r) => setTimeout(r, 400));
    return {
      before,
      geometries: handle.renderer.info.memory.geometries,
      textures: handle.renderer.info.memory.textures,
      err: window.TunnelBell.error,
    };
  });
  Assert(!after.err, `${tag}: 推进 3 秒无异常`);
  Assert(after.geometries - after.before.geometries < 40, `${tag}: 几何没有逐帧泄漏（+${after.geometries - after.before.geometries}）`);
  Assert(after.textures - after.before.textures < 10, `${tag}: 纹理没有逐帧泄漏（+${after.textures - after.before.textures}）`);
}

// 重复 BuildLevel 不许泄漏
const leak = await page.evaluate(async () => {
  const handle = window.TunnelBell.render;
  const start = handle.renderer.info.memory.geometries;
  for (let i = 0; i < 4; i += 1) {
    window.TunnelBell.Begin(i % 3);
    const go = document.getElementById("ChapterGoButton");
    if (go && !document.getElementById("ChapterScreen").hidden) go.click();
    window.TunnelBell.SkipPanels();
    await new Promise((r) => setTimeout(r, 150));
  }
  return { start, end: handle.renderer.info.memory.geometries, err: window.TunnelBell.error };
});
Assert(!leak.err, "反复切幕无异常");
Assert(leak.end < leak.start * 3 + 60, `反复切幕不泄漏几何（${leak.start} → ${leak.end}）`);

if (errors.length) {
  console.error("\n页面错误：");
  for (const e of errors.slice(0, 10)) console.error("  -", e);
  failed += 1;
}

await browser.close();
server.close();
console.log(failed ? `\n渲染健康检查失败 ${failed} 项` : "\n渲染健康检查全部通过");
process.exit(failed ? 1 : 0);
