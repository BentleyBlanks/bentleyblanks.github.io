// ===========================================================================
// Script_WaterTest.mjs —— 3A 物理水面与编辑器/试玩画质门禁的自动化验收
//
// 跑法：
//   node Taierzhuang1938/Script_WaterTest.mjs           # 完整验收（纯数据 + 真 GPU 浏览器）
//   node Taierzhuang1938/Script_WaterTest.mjs --quick   # 仅纯 Node 契约检查
//
// 守六件事：
//   1. 纯数据契约：四档水面（low/medium/high/ultra）与 QUALITY_PRESETS[*].water 对齐，
//      四套物理预设（muddyRiver/pond/moat/river）完备且可纯 JSON 序列化。
//   2. 正式试玩（?whitebox=p012）：默认 mode="play"、effectiveQuality="high"，单层折射拷贝
//      （hasOpaqueCopy / opaqueCopyCount > 0）、物理大气、Hi-Z SSR、CSM 阴影全接通。
//   3. 采样器预算硬闸门（ANGLE-D3D11 上限 16）：实测 WebGLProgram 活跃采样器数在
//      low / medium / high / ultra 四档全部 ≤ 16，全程零 GL 错误、零控制台报错。
//   4. 真实画面与交互响应：low vs high 像素均值存在明显差异；AddWaterRipple 注入交互波纹后
//      activeRipples > 0 且水面像素发生真实变化；FirstLevelWhiteboxField.WaterDepth 在河床/水塘 > 0、
//      干地与桥面 = 0。
//   5. 编辑器最低画质门禁（用户 2026-11-27）：
//      · 白盒编辑器（?editor=blockout）默认 mode="editor"、effectiveQuality="low"、零折射拷贝；
//      · 切入试玩场景（UseScene("play")）自动解锁 mode="play"、effectiveQuality="high"、正式 3A 水面；
//      · 退回编辑（UseScene("edit")）立即回落 mode="editor"、effectiveQuality="low"、释放折射靶。
//   6. 运行时热切 SetMode / SetQuality 无报错、无材质泄漏。
// ===========================================================================

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QUALITY_PRESETS } from "./Data_Tuning_Graphics.mjs";
import {
  WATER_QUALITY_KEYS,
  WATER_EDITOR_DEFAULT_QUALITY,
  WATER_QUALITY_TIERS,
  WATER_PRESETS,
  WATER_RIPPLES,
} from "./Data_Tuning_Water.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..");
const QUICK = process.argv.includes("--quick");

let passed = 0;
let failed = 0;
function Check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// 1. 纯 Node 契约检查
// ---------------------------------------------------------------------------
Check(
  "四档水面键与 QUALITY_PRESETS[*].water 一致",
  WATER_QUALITY_KEYS.join(",") === "low,medium,high,ultra"
    && WATER_QUALITY_KEYS.every((k) => QUALITY_PRESETS[k]?.water === k && !!WATER_QUALITY_TIERS[k]),
  WATER_QUALITY_KEYS.map((k) => `${k}:${QUALITY_PRESETS[k]?.water}`).join(" "),
);
Check(
  "编辑器默认档位锁定最低档 low（关折射/SSR/阴影/焦散/交互波纹）",
  WATER_EDITOR_DEFAULT_QUALITY === "low"
    && WATER_QUALITY_TIERS.low.refraction === false
    && WATER_QUALITY_TIERS.low.ssr === false
    && WATER_QUALITY_TIERS.low.shadows === false
    && WATER_QUALITY_TIERS.low.caustics === false
    && WATER_QUALITY_TIERS.low.maxRipples === 0,
);
Check(
  "high / ultra 启用完整 3A 特性（折射、色散、双层焦散、4 级 Hi-Z SSR、物理天空、CSM 投影）",
  ["high", "ultra"].every((k) => {
    const t = WATER_QUALITY_TIERS[k];
    return t.refraction && t.chromaticDispersion && t.caustics && t.causticsLayers === 2
      && t.ssr && t.ssrHizSlots === 4 && t.physicalSky && t.shadows && t.subsurface && t.maxRipples >= 16;
  }) && WATER_QUALITY_TIERS.ultra.refractionScale === 1.0,
);
Check(
  "四套水体预设完备且纯 JSON 可序列化（含新增 pond 预设）",
  ["muddyRiver", "pond", "moat", "river"].every((p) => {
    const s = WATER_PRESETS[p];
    return s && Array.isArray(s.extinctionRgb) && s.extinctionRgb.length === 3
      && Array.isArray(s.waves) && s.waves.length >= 6 && s.edgeFadeDepth > 0;
  }) && JSON.stringify({ WATER_QUALITY_TIERS, WATER_PRESETS, WATER_RIPPLES }).length > 500,
);

if (QUICK) {
  console.log(`\nWaterTest (quick): ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

// ---------------------------------------------------------------------------
// 2. 真 GPU 浏览器验收
// ---------------------------------------------------------------------------
const { LaunchBrowser } = await import("../PrairieFire1937/Script_BrowserTestKit.mjs");
const { ServeRoot } = await import("./Script_DevServer.mjs");

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
for (const route of ["**/__blockout/status", "**/__scene/status", "**/__environment/status"]) {
  await page.route(route, (request) => request.fulfill({ json: { writable: false } }));
}

const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${String(e).slice(0, 260)}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const url = m.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)/.test(url)) return;
  if (/__blockout|__scene|__environment/.test(url)) return;
  if (/Data_Previz\w+Animation\.json/.test(url) && /404/.test(m.text())) return;
  if (/AdvancedTools\/Library\/Data_Cast\.json/.test(url) && /404/.test(m.text())) return;
  errors.push(`CONSOLE: ${m.text().slice(0, 240)} @ ${url}`);
});

try {
  // --- A) 正式试玩场景（第一关北沙河 + 村中水塘） ---
  console.log("--- playtest scene (FirstLevel p012)");
  await page.goto(
    `http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&whitebox=p012&manual=1&quality=high&audio=0&skipOpening=1&missionStage=12`,
    { waitUntil: "load", timeout: 180000 },
  );
  await page.waitForFunction(
    () => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.EncounterPlay?.State?.().ready,
    null,
    { timeout: 240000 },
  );

  const playAudit = await page.evaluate(() => {
    const T = window.Tengxian;
    if (T.viewmodel?.root) T.viewmodel.root.visible = false;
    if (T.player?.SetDebugOptions) T.player.SetDebugOptions({ invincible: true });
    if (T.ai) for (const s of T.ai.soldiers) { s.coolUntil = 1e9; s.fireTimer = 0; }

    // 站到北沙河北岸近看河面与岸线
    const x = -24, z = 832, tx = -62, ty = -2.8, tz = 850;
    const gy = T.battlefield.GroundHeight(x, z);
    const dx = tx - x, dy = ty - (gy + 1.65), dz = tz - z;
    T.player.Spawn(x, z, Math.atan2(-dx, -dz));
    T.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    T.player.position.y = gy;
    T.player.body?.Teleport?.(x, gy, z);
    T.post.NotifyCameraCut();
    T.StepFrames(12, 1 / 60);

    const gl = T.renderer.getContext();
    const ReadCenterPatch = () => {
      const w = 160, h = 90;
      const sx = Math.floor((gl.drawingBufferWidth - w) / 2);
      const sy = Math.floor((gl.drawingBufferHeight - h) / 2);
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(sx, sy, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return buf;
    };
    const MeanDiff = (a, b) => {
      let sum = 0, n = a.length / 4;
      for (let i = 0; i < a.length; i += 4) {
        sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      }
      return sum / (n * 3);
    };
    const CountActiveSamplers = (mesh) => {
      if (!mesh?.material) return -1;
      const props = T.renderer.properties.get(mesh.material);
      const prog = props?.currentProgram?.program;
      if (!prog) return -1;
      const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      let samplers = 0;
      for (let i = 0; i < count; i += 1) {
        const u = gl.getActiveUniform(prog, i);
        if (!u) continue;
        if (u.type === gl.SAMPLER_2D || u.type === gl.SAMPLER_2D_SHADOW || u.type === gl.SAMPLER_3D
          || u.type === gl.SAMPLER_2D_ARRAY || u.type === gl.SAMPLER_CUBE) {
          samplers += u.size || 1;
        }
      }
      return samplers;
    };

    const river = T.scene.getObjectByName("SandRiverSurface");
    const pond = T.scene.getObjectByName("Pond_Mid_Water");
    const initState = T.Debug.WaterSurface.State();
    const initGlErr = gl.getError();

    // 逐档测量活跃片段采样器数 + 像素差异
    const tierStats = {};
    const patches = {};
    for (const tier of ["low", "medium", "high", "ultra"]) {
      T.Debug.WaterSurface.SetQuality(tier);
      T.StepFrames(8, 1 / 60);
      const st = T.Debug.WaterSurface.State();
      tierStats[tier] = {
        eff: st.effectiveQuality,
        samplers: CountActiveSamplers(river),
        hasOpaqueCopy: st.hasOpaqueCopy,
        opaqueSize: st.opaqueCopySize,
        glErr: gl.getError(),
        matTier: river?.material?.userData?.waterTier || null,
      };
      patches[tier] = ReadCenterPatch();
    }

    // 恢复 high 并测试交互波纹注入
    T.Debug.WaterSurface.SetQuality("high");
    T.StepFrames(4, 1 / 60);
    const beforeRipple = ReadCenterPatch();
    const added = T.Debug.WaterSurface.AddRipple(-34, 839, {
      strength: 1.4, radius: 7.0, speed: 3.0, freq: 8.5, foam: 0.9,
    });
    T.StepFrames(12, 1 / 60);
    const afterRippleState = T.Debug.WaterSurface.State();
    const afterRipple = ReadCenterPatch();
    const rippleDiff = MeanDiff(beforeRipple, afterRipple);

    // 测试 editor 模式热切锁 low、再切回 play 恢复 high
    const edMode = T.Debug.WaterSurface.SetMode("editor");
    T.StepFrames(4, 1 / 60);
    const edSnap = T.Debug.WaterSurface.State();
    const playBack = T.Debug.WaterSurface.SetMode("play");
    T.StepFrames(4, 1 / 60);
    const playBackSnap = T.Debug.WaterSurface.State();

    // WaterDepth 核对：取实际水带中段验证河床 > 0、桥面高处 = 0、远岸干地 = 0
    const mainRibbon = T.battlefield.waterRibbons?.find((r) => r.id === "SandRiverSurface") || T.battlefield.waterRibbons?.[0];
    const midStrip = mainRibbon?.strips?.[Math.floor((mainRibbon.strips.length || 1) * 0.5)] || [-40, 840, 850];
    const rx = midStrip[0];
    const rz = (midStrip[1] + midStrip[2]) * 0.5;
    const riverSurfaceY = mainRibbon?.surfaceY ?? -2.7;
    const riverDepth = T.battlefield.WaterDepth(rx, rz, T.battlefield.TerrainHeight(rx, rz));
    const bridgeDeckDepth = T.battlefield.WaterDepth(rx, rz, riverSurfaceY + 2.0);
    const dryDepth = T.battlefield.WaterDepth(0, 200, T.battlefield.TerrainHeight(0, 200));

    return {
      initState,
      initGlErr,
      pondPreset: pond?.userData?.waterPreset || null,
      tierStats,
      lowVsHighDiff: MeanDiff(patches.low, patches.high),
      mediumVsHighDiff: MeanDiff(patches.medium, patches.high),
      added,
      activeRipples: afterRippleState.activeRipples,
      rippleDiff,
      edMode,
      edSnap,
      playBack,
      playBackSnap,
      riverDepth,
      bridgeDeckDepth,
      dryDepth,
    };
  });

  Check(
    "正式试玩启动默认 mode=play、effectiveQuality=high，且折射/SSR/阴影/大气全接通",
    playAudit.initState.mode === "play"
      && playAudit.initState.effectiveQuality === "high"
      && playAudit.initState.hasOpaqueCopy
      && playAudit.initState.opaqueCopyCount > 0
      && playAudit.initState.hasSsr
      && playAudit.initState.hasShadows
      && playAudit.initState.hasAtmosphere,
    JSON.stringify({
      mode: playAudit.initState.mode,
      eff: playAudit.initState.effectiveQuality,
      copy: playAudit.initState.hasOpaqueCopy,
      copySz: playAudit.initState.opaqueCopySize,
      ssr: playAudit.initState.hasSsr,
      shadows: playAudit.initState.hasShadows,
    }),
  );
  Check(
    "村中水塘自动切换为静水 pond 预设",
    playAudit.pondPreset === "pond",
    `Pond_Mid_Water=${playAudit.pondPreset}`,
  );
  for (const tier of ["low", "medium", "high", "ultra"]) {
    const s = playAudit.tierStats[tier];
    const limit = tier === "low" ? 4 : tier === "medium" ? 12 : 16;
    Check(
      `${tier} 档编译无 GL 错误且活跃采样器 ≤ ${limit}（硬红线 16）`,
      s.glErr === 0 && s.samplers > 0 && s.samplers <= limit && s.matTier === tier,
      `samplers=${s.samplers}, opaque=${s.hasOpaqueCopy}(${s.opaqueSize}), glErr=${s.glErr}`,
    );
  }
  Check(
    "low 与 high 档真实水面像素存在显著视觉差异",
    playAudit.lowVsHighDiff > 1.5,
    `meanRgbDiff(low, high) = ${playAudit.lowVsHighDiff.toFixed(2)} / 255`,
  );
  Check(
    "交互波纹 AddWaterRipple 生效且产生真实水面扰动",
    playAudit.added && playAudit.activeRipples >= 1 && playAudit.rippleDiff > 0.05,
    `activeRipples=${playAudit.activeRipples}, meanRgbDiff=${playAudit.rippleDiff.toFixed(2)}`,
  );
  Check(
    "热切 editor 模式强制锁定 low 且停折射拷贝；切回 play 立即恢复 high",
    playAudit.edSnap.mode === "editor" && playAudit.edSnap.effectiveQuality === "low" && !playAudit.edSnap.hasOpaqueCopy
      && playAudit.playBackSnap.mode === "play" && playAudit.playBackSnap.effectiveQuality === "high" && playAudit.playBackSnap.hasOpaqueCopy,
    `editor=${playAudit.edSnap.effectiveQuality}/copy=${playAudit.edSnap.hasOpaqueCopy} -> play=${playAudit.playBackSnap.effectiveQuality}/copy=${playAudit.playBackSnap.hasOpaqueCopy}`,
  );
  Check(
    "FirstLevelWhiteboxField.WaterDepth：河床 > 0、桥面 = 0、干地 = 0",
    playAudit.riverDepth > 0.05 && playAudit.bridgeDeckDepth === 0 && playAudit.dryDepth === 0,
    `river=${playAudit.riverDepth.toFixed(2)}m, deck=${playAudit.bridgeDeckDepth}, dry=${playAudit.dryDepth}`,
  );

  // --- B) 白盒编辑器门禁（编辑态默认最低档，试玩态开启正式 3A 画质） ---
  console.log("--- blockout editor gating (FirstLevel1218)");
  await page.goto(
    `http://127.0.0.1:${port}/Taierzhuang1938/?editor=blockout&level=FirstLevel1218&scale=small&audio=0`,
    { waitUntil: "load", timeout: 180000 },
  );
  await page.waitForFunction(
    () => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready,
    null,
    { timeout: 240000 },
  );

  const editStart = await page.evaluate(() => {
    window.Tengxian.StepFrames(6, 1 / 60, false);
    const bf = window.Tengxian.editor.editorHost.game.battlefield;
    return {
      water: window.Tengxian.Debug.WaterSurface.State(),
      meshName: bf.waterMesh?.name || null,
      matName: bf.waterMesh?.material?.name || null,
    };
  });
  Check(
    "白盒编辑器进关默认锁定最低水面画质（mode=editor, effectiveQuality=low, 零折射拷贝）",
    editStart.water.mode === "editor"
      && editStart.water.effectiveQuality === "low"
      && !editStart.water.hasOpaqueCopy
      && editStart.matName === "BlockoutCreekWater",
    JSON.stringify({ mode: editStart.water.mode, eff: editStart.water.effectiveQuality, copy: editStart.water.hasOpaqueCopy, mat: editStart.matName }),
  );

  // 切入试玩正式场景
  const playSwitched = await page.evaluate(async () => {
    const ok = await window.Tengxian.Debug.Blockout.Play.UseScene("play");
    window.Tengxian.StepFrames(8, 1 / 60, false);
    const bf = window.Tengxian.editor.editorHost.game.battlefield;
    return {
      ok,
      water: window.Tengxian.Debug.WaterSurface.State(),
      meshName: bf.waterMesh?.name || null,
      matTier: bf.waterMesh?.material?.userData?.waterTier || null,
    };
  });
  Check(
    "白盒编辑器切入试玩（UseScene play）自动开启正式 3A 水面画质（effectiveQuality=high, BlockoutWater 升级）",
    playSwitched.ok
      && playSwitched.water.mode === "play"
      && playSwitched.water.effectiveQuality === "high"
      && playSwitched.meshName === "BlockoutWater"
      && playSwitched.matTier === "high",
    JSON.stringify({ mode: playSwitched.water.mode, eff: playSwitched.water.effectiveQuality, mesh: playSwitched.meshName, tier: playSwitched.matTier }),
  );

  // 退回编辑态
  const editReturned = await page.evaluate(async () => {
    const ok = await window.Tengxian.Debug.Blockout.Play.UseScene("edit");
    window.Tengxian.StepFrames(6, 1 / 60, false);
    const bf = window.Tengxian.editor.editorHost.game.battlefield;
    return {
      ok,
      water: window.Tengxian.Debug.WaterSurface.State(),
      matName: bf.waterMesh?.material?.name || null,
    };
  });
  Check(
    "白盒编辑器退回编辑（UseScene edit）立即回落最低水面画质（mode=editor, effectiveQuality=low）",
    editReturned.ok
      && editReturned.water.mode === "editor"
      && editReturned.water.effectiveQuality === "low"
      && !editReturned.water.hasOpaqueCopy
      && editReturned.matName === "BlockoutCreekWater",
    JSON.stringify({ mode: editReturned.water.mode, eff: editReturned.water.effectiveQuality, copy: editReturned.water.hasOpaqueCopy, mat: editReturned.matName }),
  );

  Check("全程零未捕获页面错误与控制台报错", errors.length === 0, errors.slice(0, 4).join(" | "));
} finally {
  await browser.close();
  server.close();
}

console.log(`\nWaterTest: ${passed} passed, ${failed} failed`);
assert.equal(failed, 0, `WaterTest: ${failed} checks failed`);
