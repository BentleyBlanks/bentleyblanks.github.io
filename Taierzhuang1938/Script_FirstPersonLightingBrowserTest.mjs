// ===========================================================================
// Script_FirstPersonLightingBrowserTest.mjs —— 第一人称取光（2026-11-02，背光枪发黑）的浏览器闸门
//
// 跑法：node Taierzhuang1938/Script_FirstPersonLightingBrowserTest.mjs
// 口径：Data_Tuning_FirstPersonLighting 头注、docs/Data_TechRenderPipeline.md「第一人称取光」。
// 场地：白盒编辑器 FirstLevel0105，关键帧 02 · 4/7（交通沟，头顶开阔）与 01 · 1/4（防炮洞里）。
//
//   1. 开机：自阴影那份视模材质在用「眼睛处取阳光」，本地反射图几帧内拍好并换到视模材质上，GL 无错；
//   2. 沟里头顶开阔：眼睛处太阳可见度 ≥ 2/3（靠沟壁的取样点可能落在壁影里）；
//   3. 背光同一镜头 A/B：新做法（两项都开）的枪身平均亮度比两项都关（改之前）亮，且不比只关反射暗；
//   4. 关掉本地反射：视模材质的 envMap 还回换上之前那张（多数是 null = 天空 IBL）；再开又换上；
//   5. 防炮洞里：太阳被挡，可见度落到 0 附近（不是逐像素采世界阴影图也照样暗）；
//   6. 全程没有未捕获错误。截图存 _shots/FirstPersonLighting/（不提交）。
// ===========================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "FirstPersonLighting");
await fs.mkdir(shotDir, { recursive: true });

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
const J = (v) => JSON.stringify(v);
const LEVEL = "FirstLevel0105";
const TRENCH_KEYFRAME = 7;   // 02 · 4/7
const DUGOUT_KEYFRAME = 0;   // 01 · 1/4
// 太阳（中午 12:00）在这一关的水平方位上背对：相机朝 yaw 0.6 时前向与指向太阳的水平分量点积 ≈ −0.6
const BACKLIT_YAW = 0.6;

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  if (/__blockout|__scene|__environment/.test(url) || /__blockout|__scene|__environment/.test(message.text())) return;
  if (/\.previz\.json(\?|$)/.test(url) && /404/.test(message.text())) return;
  if (/\/Animation\/Previz\w+\/Data_Previz\w+Animation\.json/.test(url) && /404/.test(message.text())) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)} @ ${url}`);
});
const B = (fn, arg) => page.evaluate(fn, arg);
const Step = (n, dt = 1 / 60) => B(({ n, dt }) => window.Tengxian.StepFrames(n, dt, true), { n, dt });
const Status = () => B(() => {
  const T = window.Tengxian, fs = T.firstPersonSelfShadow.Status(), probe = T.firstPersonReflection.Status();
  const texture = T.firstPersonReflection.pmremTarget?.texture || null;
  let owned = 0, onProbe = 0, nullEnv = 0;
  for (const m of T.firstPersonSelfShadow.ownedMaterials) {
    if (!m.isMeshStandardMaterial) continue;
    owned += 1;
    if (texture && m.envMap === texture) onProbe += 1;
    if (m.envMap === null) nullEnv += 1;
  }
  return { fs: { enabled: fs.enabled, eyeSun: fs.eyeSun, sun: fs.sunVisibility, sunRaw: fs.sunVisibilityRaw },
    probe, owned, onProbe, nullEnv, gl: T.renderer.getContext().getError() };
});

/** 同一帧（dt=0）枪显示 / 藏起各截一张，差异大的像素当枪掩码，量右下枪身（剔肤色手）的 sRGB 亮度。 */
async function GunLuma(label) {
  await Step(1, 0);
  const on = (await page.screenshot()).toString("base64");
  await B(() => { window.Tengxian.viewmodel.root.visible = false; window.Tengxian.StepFrames(1, 0, true); });
  const off = (await page.screenshot()).toString("base64");
  await B(() => { window.Tengxian.viewmodel.root.visible = true; window.Tengxian.StepFrames(1, 0, true); });
  await fs.writeFile(path.join(shotDir, `${label}.png`), Buffer.from(on, "base64"));
  return B(async ({ on, off }) => {
    const Load = async (b64) => {
      const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data;
    };
    const a = await Load(on), b = await Load(off), W = 1280;
    let n = 0, sum = 0;
    for (let i = 0; i < a.length; i += 4) {
      const px = (i / 4) % W, py = Math.floor(i / 4 / W);
      if (px < 760 || py < 400 || py > 640) continue;
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      if (d < 24) continue;
      if (a[i] - a[i + 2] > 45 && a[i] > 120) continue;   // 肤色手
      n += 1; sum += 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2];
    }
    return { px: n, mean: n ? +(sum / n).toFixed(2) : 0 };
  }, { on, off });
}
const SetLighting = (eye, reflection) => B(({ eye, reflection }) => {
  const T = window.Tengxian;
  T.firstPersonSelfShadow.SetEyeSun(eye);
  T.firstPersonReflection.SetEnabled(reflection);
  T.StepFrames(16, 1 / 60, true);
}, { eye, reflection });
const Face = (yaw, pitch = 0) => B(({ yaw, pitch }) => {
  const p = window.Tengxian.player; p.yaw = yaw; p.pitch = pitch; window.Tengxian.StepFrames(20, 1 / 60, true);
}, { yaw, pitch });

try {
  console.log("--- boot");
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?editor=blockout&level=${LEVEL}&audio=0`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready, null, { timeout: 300000 });
  await B((k) => window.Tengxian.Debug.Blockout.GoTo(k).then(() => 0), TRENCH_KEYFRAME);
  await Step(30);

  // 1) 开机
  const s1 = await Status();
  Check("开机：自阴影开着、视模材质用眼睛处取阳光", s1.fs.enabled && s1.fs.eyeSun, J(s1.fs));
  Check("开机：本地反射图拍好了并换到全部视模材质上", s1.probe.enabled && s1.probe.ready && s1.probe.captures >= 1
    && s1.owned > 0 && s1.onProbe === s1.owned, J({ probe: s1.probe, owned: s1.owned, onProbe: s1.onProbe }));
  Check("开机：GL 无错", s1.gl === 0, `glError=${s1.gl}`);

  // 2) 沟里头顶开阔
  // 三个取样点（眼睛 / 枪身 / 枪口）里靠沟壁那一两个可能正落在壁影里（太阳 52°、沟深近 2 m），所以只要求多数照到
  Check("交通沟里头顶开阔：眼睛处太阳可见度 ≥ 2/3（防炮洞里是 0）", s1.fs.sunRaw >= 0.66 && s1.fs.sun > 0.6, J(s1.fs));

  // 3) 背光 A/B
  console.log("--- backlit A/B");
  await Face(BACKLIT_YAW, 0);
  await SetLighting(true, true); const lumaNew = await GunLuma("Backlit_New");
  await SetLighting(true, false); const lumaNoReflection = await GunLuma("Backlit_EyeSunOnly");
  await SetLighting(false, false); const lumaOld = await GunLuma("Backlit_Old");
  await SetLighting(true, true);
  Check("背光：掩码量到了枪身（三张都 > 20000 像素）", [lumaNew, lumaNoReflection, lumaOld].every((r) => r.px > 20000),
    J({ lumaNew, lumaNoReflection, lumaOld }));
  Check("背光：新做法比改之前亮（平均亮度 ≥ 1.08 倍）", lumaNew.mean >= lumaOld.mean * 1.08,
    `新 ${lumaNew.mean} / 改之前 ${lumaOld.mean} = ${(lumaNew.mean / Math.max(lumaOld.mean, 1e-3)).toFixed(3)}`);
  Check("背光：本地反射是变亮的那一项（开反射 ≥ 只开眼睛取光 × 1.05）", lumaNew.mean >= lumaNoReflection.mean * 1.05,
    `开反射 ${lumaNew.mean} / 关反射 ${lumaNoReflection.mean}`);

  // 4) 关反射还原 envMap
  await SetLighting(true, false);
  const s4off = await Status();
  await SetLighting(true, true);
  const s4on = await Status();
  // 还回换上之前的那张：绝大多数是 null（= 天空 IBL），材质库里自带 envMap 的几只还回它自己那张
  Check("关掉本地反射：视模材质的 envMap 全部还回原样（不再挂本地反射图）", s4off.onProbe === 0 && s4off.nullEnv > 0,
    J({ owned: s4off.owned, nullEnv: s4off.nullEnv, onProbe: s4off.onProbe }));
  Check("再打开：又全部换上本地反射图", s4on.onProbe === s4on.owned && s4on.owned > 0, J({ owned: s4on.owned, onProbe: s4on.onProbe }));

  // 5) 防炮洞里
  console.log("--- dugout");
  await B((k) => window.Tengxian.Debug.Blockout.GoTo(k).then(() => 0), DUGOUT_KEYFRAME);
  await Step(40);
  const s5 = await Status();
  await page.screenshot({ path: path.join(shotDir, "Dugout.png") });
  Check("防炮洞里：眼睛处太阳被挡，可见度落到 0 附近", s5.fs.sunRaw <= 0.34 && s5.fs.sun < 0.4, J(s5.fs));
  Check("全程 GL 无错", s5.gl === 0, `glError=${s5.gl}`);
} catch (error) {
  Check("脚本跑完", false, String(error?.stack || error).slice(0, 600));
} finally {
  await browser.close();
  server.close();
}

Check("没有未捕获错误", errors.length === 0, errors.slice(0, 5).join(" | "));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
