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

// 沙箱是 SwiftShader，Main 会自动降到 low 把后处理整条链关掉。
// 那样等于永远测不到出货配置——强制 high，让色调分离/辉光/颗粒都真的跑起来。
await page.evaluate(() => window.TunnelBell.render.SetQuality("high"));
await page.waitForTimeout(300);

for (let levelIndex = 0; levelIndex < 3; levelIndex += 1) {
  const tag = `act${levelIndex + 1}`;
  await page.evaluate((i) => {
    window.TunnelBell.Begin(i);
    const go = document.getElementById("ChapterGoButton");
    if (go && !document.getElementById("ChapterScreen").hidden) go.click();
    // 过场期间镜头本来就该离开玩家（那是演出），所以取景类断言必须等它放完。
    // 早先这里只跳气泡不跳过场——那时过场根本没被启动过，所以看不出问题；
    // 接线修好之后就会在演出中途量玩家在不在画面里，量的是错的东西。
    window.TunnelBell.SkipCutscenes();
    window.TunnelBell.SkipPanels();
  }, levelIndex);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.TunnelBell.SkipCutscenes();
    window.TunnelBell.SkipPanels();
  });
  await page.waitForTimeout(300);

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
    return { ndcX: v.x, ndcY: v.y, inCutscene: !!s.cutscene };
  });
  Assert(!onScreen.inCutscene, `${tag}: 取景断言不是在过场里量的`);
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
  // 俯角是纵深感的主要来源，但它会让竖直线朝灭点收敛。8° 是硬上限，
  // 且画面上下缘的竖直边偏离铅垂线不许超过 2.5°——超了横版就穿帮了。
  const tilt = await page.evaluate(() => {
    const handle = window.TunnelBell.render;
    const s = window.TunnelBell.state;
    const cam = handle.camera;
    const a = new handle.three.Vector3();
    const b = new handle.three.Vector3();
    // 在画面上缘与下缘各立一根 2 米高的竖直杆，量它投影后偏离铅垂线多少度
    const lean = (worldY) => {
      a.set(s.camera.x, worldY, 0).project(cam);
      b.set(s.camera.x, worldY + 2, 0).project(cam);
      return Math.abs(Math.atan2(b.x - a.x, Math.abs(b.y - a.y)) * 180 / Math.PI);
    };
    const half = s.camera.viewHeight * 0.5;
    return {
      pitchDeg: Math.abs(cam.rotation.x * 180 / Math.PI),
      roll: Math.abs(cam.rotation.z * 180 / Math.PI),
      yaw: Math.abs(cam.rotation.y * 180 / Math.PI),
      topLean: lean(s.camera.y + half * 0.8),
      bottomLean: lean(s.camera.y - half * 0.8),
    };
  });
  Assert(tilt.pitchDeg <= 8.05, `${tag}: 俯角不超过 8 度（实际 ${tilt.pitchDeg.toFixed(1)}）`);
  // 震屏是用一点点 roll 做的（实测 shake 0.23 对应 0.20°），那是合理的。
  // 这里禁的是"持续的倾斜"：roll 只许小到看不出来，偏航永远不许有。
  Assert(tilt.roll <= 1.2, `${tag}: 没有持续的画面倾斜（roll ${tilt.roll.toFixed(2)}°）`);
  Assert(tilt.yaw < 0.01, `${tag}: 相机不偏航（yaw ${tilt.yaw.toFixed(3)}°）`);
  Assert(Math.max(tilt.topLean, tilt.bottomLean) <= 2.5,
    `${tag}: 竖直线仍然是竖直的（上缘 ${tilt.topLean.toFixed(2)}° / 下缘 ${tilt.bottomLean.toFixed(2)}°）`);

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
  // 「乡亲人呢？」——act2 的浅层支线曾经整层封在实心土里：几何在、栅格在、
  // draw call 正常、所有断言全绿，玩家看到的是一屏土。剖面自检会把这种情况
  // 打成 console.error，这里按幕认领它，别让它混在收尾那一堆匿名页面错误里。
  Assert(!errors.some((e) => /地道没挖开/.test(e)), `${tag}: 每条地道都真的挖开了`);
  Assert(after.geometries - after.before.geometries < 40, `${tag}: 几何没有逐帧泄漏（+${after.geometries - after.before.geometries}）`);
  Assert(after.textures - after.before.textures < 10, `${tag}: 纹理没有逐帧泄漏（+${after.textures - after.before.textures}）`);
}

// ---- 乡亲必须看得见 ----
//
// 「乡亲人呢？」这句抱怨有两个原因，挖洞 bug 只是其中一个。另一个是：
// 人画出来了、rig 在、visible 为 true，但他比他挡住的那块土还暗——
// A/B 实测过一次，那一竖条在她在与不在之间只差 −0.80/255，对比度 0.3%。
// 「有没有画」是查不出这种 bug 的，只有「拿走再量一次」能。
// 第二幕的 216 米地道里挂着「乡亲 0/6」的 HUD，那六个人是这一幕的情绪主体，
// 不是背景板；照明可以暗，暗的必须是空间，不是人。
{
  const NEED_MEAN = 6;                    // 均值差绝对值下限（/255）
  const NEED_MAX = 20;                    // 或者最亮点差
  await page.evaluate(async () => {
    const T = window.TunnelBell;
    T.Begin(1);
    const go = document.getElementById("ChapterGoButton");
    if (go && !document.getElementById("ChapterScreen").hidden) go.click();
    T.SkipCutscenes(); T.SkipPanels();
    await new Promise((r) => setTimeout(r, 400));
    T.SkipCutscenes(); T.SkipPanels();
  });

  const target = await page.evaluate(() => {
    const T = window.TunnelBell;
    const n = (T.state.npcs || []).find((a) => a.role === "villager" && a.y < -1);
    if (!n) return null;
    // 站到她旁边，等镜头收敛到地道取景（viewHeight 会从 11.5 降到 7.2）
    T.Rules.DebugTeleport(T.state, n.x - 1.5, n.y);
    T.Advance(2.5, {});
    const h = T.render;
    const cv = document.getElementById("GameCanvas");
    const W = cv.clientWidth; const H = cv.clientHeight;
    const V = h.three.Vector3;
    const proj = (x, y) => {
      const v = new V(x, y, 0).project(h.camera);
      return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
    };
    const head = proj(n.x, n.y + 1.75);
    const feet = proj(n.x, n.y - 0.05);
    return {
      id: n.id, name: n.name,
      box: {
        x: Math.max(0, Math.round(head.x - 30)), y: Math.max(0, Math.round(head.y)),
        width: 60, height: Math.round(Math.min(feet.y - head.y, H - head.y)),
      },
    };
  });

  if (!target || target.box.width < 8 || target.box.height < 20) {
    Assert(false, `乡亲可读性：找不到可量的地道乡亲（${target ? JSON.stringify(target.box) : "无"}）`);
  } else {
    await page.waitForTimeout(300);
    const withNpc = await SamplePixels(page, target.box);
    // 只把人挪走，光照、土体、道具、镜头一律不动——差值就只可能来自她本人
    await page.evaluate((id) => {
      const T = window.TunnelBell;
      const n = T.state.npcs.find((a) => a.id === id);
      n.x = 4000;
      T.Advance(0.2, {});
    }, target.id);
    await page.waitForTimeout(300);
    const without = await SamplePixels(page, target.box);
    const dMean = Math.abs(withNpc.mean - without.mean);
    const dMax = Math.abs(withNpc.max - without.max);
    Assert(dMean >= NEED_MEAN || dMax >= NEED_MAX,
      `乡亲在画面里看得见（${target.name}：Δmean ${dMean.toFixed(2)} / Δmax ${dMax}，` +
      `需要 Δmean≥${NEED_MEAN} 或 Δmax≥${NEED_MAX}）`);
  }
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
