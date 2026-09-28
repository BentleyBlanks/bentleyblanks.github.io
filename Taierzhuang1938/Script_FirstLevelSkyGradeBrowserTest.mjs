// 第一关天空 / 室内明暗 / 曝光锚点（2026-09-28 B4）的真浏览器门禁。
// 口径：docs/Data_TechRenderPipeline.md §2.10、§5.11。
//   node Taierzhuang1938/Script_FirstLevelSkyGradeBrowserTest.mjs [--root=<另一份检出>]
// 读回像素，不看开关位：
//   1. 结构化云层真的在天上（天空探针同仰角一圈的相对起伏 ≥ 旧云项的 1.2 倍，均值不塌）；
//   2. 室内天光遮蔽 + 暖反弹真的接进了材质的 AO / SSIL：灶屋 09_2 下半幅跟着屋子表变（> 5%）、
//      暗部 R > G > B（2026-09-28 第二轮：此前暗部品红），室外 08_1 机位差 < 1.5%（屋外逐像素不该动）；
//   3. 曝光锚点：11 个室外对照机位实测 avgLog 的中位数与 EXPOSURE_ANCHORS 登记值差 < 0.3 EV
//      （白盒换材质、改天光之后这一条会红 —— 照打印的中位数重标）；
//   4. 夜档能套上、页面无报错、无 GL 错误。
import path from "node:path";
import { pathToFileURL } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = path.resolve(arg("root") || path.resolve(import.meta.dirname, ".."));
const { WHITEBOX_0518_CAMERA_BY_ID: CAMS } = await import(pathToFileURL(path.join(root, "Taierzhuang1938/Data_FirstLevelWhitebox0518Cameras.mjs")).href);
const OUTDOOR = ["05_1", "05_2", "06_1", "06_2", "07_2", "08_1", "11_1", "12_1", "13_2", "15_1", "18_1"];
const DEG = Math.PI / 180;
const Pose = (id) => { const c = CAMS[id]; return { id, x: c.camera.x, z: c.camera.z, y: c.camera.y ?? null, h: c.camera.h,
  yaw: c.yawDeg * DEG, pitch: c.pitchDeg * DEG, fov: c.fov, phase: null, far: null }; };

const checks = [];
const Check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "ok  " : "FAIL"} ${name}  ${detail}`); };
const errors = [];
const server = await ServeRoot(root, 0);
const browser = await LaunchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(m.location()?.url || "")) errors.push(m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&missionStage=9&quality=high&scale=small`,
    { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.Tengxian; g.StepFrames(90); g.Debug.OpenEditor("samplePoints"); });

  // --- 1. 天 ------------------------------------------------------------------
  const sky = await page.evaluate(async () => {
    const g = window.Tengxian;
    const { MakeSkyProbe } = await import("./Script_Sky.mjs");
    const probe = MakeSkyProbe(g.renderer, g.sky.uniforms, { width: 128, height: 64 });
    // 起伏按「同一仰角一圈里的相对标准差」量：天顶→地平线的渐变不算结构，云团才算。
    const Stats = () => {
      const buffer = probe.Render(0);
      let all = 0, count = 0, relStd = 0, rows = 0;
      for (let y = 0; y < probe.height; y += 1) {
        const lat = ((y + 0.5) / probe.height - 0.5) * 180;
        if (lat < 15 || lat > 75) continue;
        const row = [];
        for (let x = 0; x < probe.width; x += 1) {
          const i = (y * probe.width + x) * 3;
          row.push(0.2126 * buffer[i] + 0.7152 * buffer[i + 1] + 0.0722 * buffer[i + 2]);
        }
        const m = row.reduce((s, v) => s + v, 0) / row.length;
        relStd += Math.sqrt(row.reduce((s, v) => s + (v - m) ** 2, 0) / row.length) / Math.max(m, 1e-6);
        rows += 1; all += m * row.length; count += row.length;
      }
      return { mean: all / count, std: relStd / rows };
    };
    const deck = g.sky.uniforms.uCloudDeck.value;
    const on = Stats();
    const was = deck.x; deck.x = 0;
    const off = Stats();
    deck.x = was;
    probe.Dispose();
    return { on, off, structure: was };
  });
  // 旧云项的「起伏」大半是太阳一侧的前向散射（方位向的亮度差），不是云；实测 0.28 → 0.36。
  Check("结构化云层开着且天上有团块（同仰角一圈的相对起伏 ≥ 旧云项 1.2 倍）",
    sky.structure > 0 && sky.on.std >= sky.off.std * 1.2,
    `std ${sky.on.std.toFixed(3)} vs ${sky.off.std.toFixed(3)}`);
  Check("天不整体塌暗（上半球均值为旧云项的 0.7–1.3 倍）",
    sky.on.mean > sky.off.mean * 0.7 && sky.on.mean < sky.off.mean * 1.3,
    `mean ${sky.on.mean.toFixed(3)} vs ${sky.off.mean.toFixed(3)}`);

  // --- 2. 室内天光遮蔽 ---------------------------------------------------------
  const Shoot = (pose, withRooms) => page.evaluate(async ({ pose, withRooms }) => {
    const g = window.Tengxian;
    const occ = await import("./Script_InteriorSkyOcclusion.mjs");
    const data = await import("./Data_FirstLevelInteriors.mjs");
    occ.SetInteriorVolumes(withRooms ? data.BuildInteriorVolumes(g.battlefield.layout, (x, z) => g.battlefield.TerrainHeight(x, z)) : null);
    const tool = g.editor.active; tool.host.SetViewmodelVisible?.(false); tool.ApplyPose(pose);
    g.StepFrames(40);
    const target = g.post.targets.ldr, w = target.width, h = target.height;
    const pixels = new Uint8Array(w * h * 4);
    g.renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels);
    let sum = 0, n = 0;
    const dark = [0, 0, 0]; let nd = 0;
    for (let y = 0; y < h / 2; y += 1) for (let x = 0; x < w; x += 1) {   // 读回是自下而上：前 h/2 行 = 画面下半幅
      const i = (y * w + x) * 4; sum += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]; n += 1;
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] < 150) { dark[0] += pixels[i]; dark[1] += pixels[i + 1]; dark[2] += pixels[i + 2]; nd += 1; }
    }
    // 合成图本身：AO′ 的 R 与 SSIL′ 的 rgb，对比 GTAO 原图（屋里天光压下去、暖反弹加上来）
    const { HalfToFloat } = await import("./Script_Sky.mjs");
    const MeanOf = (rt, index) => {
      if (!rt) return null;
      const tw = rt.width, th = rt.height, buf = new Uint16Array(tw * th * 4);
      g.renderer.readRenderTargetPixels(rt, 0, 0, tw, th, buf, undefined, index);
      const m = [0, 0, 0, 0];
      for (let i = 0; i < buf.length; i += 4) for (let c = 0; c < 4; c += 1) m[c] += HalfToFloat(buf[i + c]);
      return m.map((v) => v / (tw * th));
    };
    const pass = g.post.interiorSkyPass;
    const maps = withRooms ? { ao: MeanOf(g.post.targets.aoBlur, 0), aoOut: MeanOf(pass.combined, 0), ilOut: MeanOf(pass.combined, 1) } : null;
    return { maps, mean: sum / n, dark: dark.map((v) => v / Math.max(nd, 1)), stats: occ.InteriorVolumeStats(),
      bound: g.post.AoTexture === g.post.interiorSkyPass.combined?.texture,
      ssilBound: g.post.contactShadowsPass.uniformsCompose?.uSsil.value === g.post.interiorSkyPass.SsilTexture };
  }, { pose, withRooms });
  await page.evaluate(() => { const g = window.Tengxian; g.graphics.autoExposure = false; g.ApplyGraphics(); });
  const kitchenOn = await Shoot(Pose("09_2"), true);
  Check("第一关装上了室内遮蔽体，材质 AO 与 SSIL 都改采合成图", kitchenOn.stats.rooms >= 6 && kitchenOn.bound && kitchenOn.ssilBound,
    `${kitchenOn.stats.rooms} rooms / ${kitchenOn.stats.portals} portals: ${kitchenOn.stats.ids.join(",")} ssil=${kitchenOn.ssilBound}`);
  const kitchenOff = await Shoot(Pose("09_2"), false);
  // 第二轮（2026-09-28）：屋里压天光 + 补暖反弹，两者在整幅亮度上接近相抵（实测 25.6 vs 26.0），
  // 所以直接读合成图：灶屋画面里 AO′ 的 R 明显低于 GTAO 原图、SSIL′ 多出一份 R ≥ G ≥ B 的暖反弹。
  const m = kitchenOn.maps;
  Check("灶屋 09_2 合成图：天光压下去（AO′ R < 原图 × 0.8）、暖反弹加上来（SSIL′ R > G > B > 0）",
    m && m.aoOut[0] < m.ao[0] * 0.8 && m.ilOut[0] > m.ilOut[1] && m.ilOut[1] > m.ilOut[2] && m.ilOut[2] > 0,
    m ? `AO ${m.ao[0].toFixed(3)} → ${m.aoOut[0].toFixed(3)}  SSIL′ ${m.ilOut.slice(0, 3).map((v) => v.toFixed(3)).join("/")}` : "no maps");
  console.log(`   09_2 下半幅 L ${kitchenOn.mean.toFixed(1)}（拆掉屋子表 ${kitchenOff.mean.toFixed(1)}）`);
  const [dr, dg, db] = kitchenOn.dark;
  Check("灶屋 09_2 暗部是暖棕（R > G > B，不偏品红 / 蓝）", dr > dg && dg > db && db > 5,
    `dark ${dr.toFixed(1)}/${dg.toFixed(1)}/${db.toFixed(1)}`);
  const streetOff = await Shoot(Pose("08_1"), false);
  const streetOn = await Shoot(Pose("08_1"), true);
  Check("室外 08_1 不受影响（< 1.5%）", Math.abs(streetOn.mean - streetOff.mean) < streetOff.mean * 0.015,
    `${streetOn.mean.toFixed(1)} vs ${streetOff.mean.toFixed(1)}`);

  // --- 3. 曝光锚点 --------------------------------------------------------------
  const ev = await page.evaluate(async (poses) => {
    const g = window.Tengxian;
    const { SkyExposureFor } = await import("./Data_Tuning_Camera.mjs");
    g.graphics.autoExposure = true; g.ApplyGraphics();
    const pass = g.post.exposurePass;
    pass.SetAnchorOverride({ logLum: null, evUp: 0, evDown: 0 });   // 只测不调
    const tool = g.editor.active, values = [];
    for (const pose of poses) {
      tool.ApplyPose(pose); pass.RequestReset(); g.StepFrames(20);
      values.push(pass.ReadState(g.renderer).avgLog);
    }
    pass.SetAnchorOverride(null);
    const sorted = [...values].sort((a, b) => a - b);
    return { values, median: sorted[sorted.length >> 1],
      anchor: SkyExposureFor("firstLevelBattleDay", "FirstLevelP012Whitebox").logLum, active: pass.active };
  }, OUTDOOR.map(Pose));
  console.log("   avgLog", OUTDOOR.map((id, i) => `${id}=${ev.values[i].toFixed(2)}`).join(" "));
  Check("曝光锚点与 11 个室外机位实测中位数差 < 0.3 EV（红了就照这个中位数重标 EXPOSURE_ANCHORS）",
    Math.abs(ev.median - ev.anchor) < 0.3, `median ${ev.median.toFixed(2)} anchor ${ev.anchor}`);

  // --- 4. 夜档 ------------------------------------------------------------------
  const nightOk = await page.evaluate(() => {
    const g = window.Tengxian; const ok = g.Debug.ApplySky("firstLevelNight"); g.StepFrames(20);
    return ok && g.sky.presetName === "firstLevelNight" && g.sky.uniforms.uCloudDeck.value.x > 0;
  });
  Check("关尾夜档 firstLevelNight 套得上（阴云夜）", nightOk);
  const glError = await page.evaluate(() => window.Tengxian.renderer.getContext().getError());
  Check("无 GL 错误", glError === 0, `glError=${glError}`);
} catch (error) {
  errors.push(`THROW ${String(error).slice(0, 500)}`);
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
Check("页面无报错", errors.length === 0, errors.slice(0, 4).join(" | "));
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `FAILED ${failed.length}/${checks.length}` : `ok first-level sky / grade / interiors (${checks.length} checks)`);
process.exit(failed.length ? 1 : 0);
