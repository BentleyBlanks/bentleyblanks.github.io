// 自动化测试场景实机封面采集器（Taierzhuang1938/AdvancedTools/Script_CaptureTestSceneCovers.mjs）
//
// 规范：
//   1. 每个功能测试场（Data_SandboxRanges.SANDBOX_RANGES 中 kind === "functional"）在
//      Taierzhuang1938/AdvancedTools/Covers/ 下对应一张 1600x900 实机 WebP 封面：
//      Texture_TestSceneCover_<PascalId>.webp（AdvancedTools/ 不进 GitHub Pages 发布包）。
//   2. 任何时候更新了测试场景 JSON、场地代码或视觉表现，运行下面任意一条即可自动刷新封面：
//        node Taierzhuang1938/AdvancedTools/Script_CaptureTestSceneCovers.mjs                  全量重拍 10 张
//        node Taierzhuang1938/AdvancedTools/Script_CaptureTestSceneCovers.mjs --only=gore,hair 只重拍指定项
//        node Taierzhuang1938/AdvancedTools/Script_CaptureTestSceneCovers.mjs --changed        按 git 改动自动选拍
//        node Taierzhuang1938/AdvancedTools/Script_CaptureTestSceneCovers.mjs --check          纯 Node 校验 10 张齐备
//   3. 浏览器全程静音（LaunchBrowser 自带 --mute-audio + audio=0）。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { SANDBOX_RANGES } from "../Data_SandboxRanges.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, "..");
const repoRoot = path.resolve(projectDir, "..");
export const COVERS_DIR = path.join(here, "Covers");
export const COVER_WIDTH = 1600;
export const COVER_HEIGHT = 900;

export const FUNCTIONAL_RANGES = Object.freeze(
  SANDBOX_RANGES.filter((entry) => entry.kind === "functional"),
);

export function CoverStemFor(id) {
  return `Texture_TestSceneCover_${id.charAt(0).toUpperCase()}${id.slice(1)}.webp`;
}

export function CoverUrlFor(id) {
  return `./Covers/${CoverStemFor(id)}`;
}

export function CoverPathFor(id) {
  return path.join(COVERS_DIR, CoverStemFor(id));
}

// 每个测试场关联的文件匹配规则（供 --changed 自动判断哪些封面需要重拍）
const WATCH_PATTERNS = Object.freeze({
  movement: [/Scenes\/TestMovement\//i, /MovementRange/i, /Script_SandboxPlugin_Movement/i],
  weapons: [/Scenes\/TestWeapon\//i, /WeaponRange/i, /Script_SandboxPlugin_Weapons/i],
  range: [/Scenes\/TestRange\//i, /Script_Range(?:Field|Targets)/i, /Data_Range\.mjs/i, /Script_SandboxPlugin_Range/i],
  explosions: [/Scenes\/TestExplosion\//i, /ExplosionRange/i, /Script_SandboxPlugin_Explosions/i],
  melee: [/Scenes\/TestMelee\//i, /Melee(?:Lab|Qte)/i, /Script_SandboxPlugin_Melee/i],
  gore: [/Scenes\/TestGore\//i, /GoreRange/i, /Script_SandboxPlugin_Gore/i],
  impacts: [/Scenes\/TestShellImpact\//i, /ShellImpactRange/i, /Script_SandboxPlugin_Impacts/i],
  reactions: [/Scenes\/TestShellImpact\//i, /BattleReactionRange/i, /ShellImpactRange/i, /Script_SandboxPlugin_Reactions/i],
  cloth: [/Scenes\/TestCloth\//i, /ClothRange/i, /Script_SandboxPlugin_Cloth/i],
  hair: [/Scenes\/TestHair\//i, /HairRange/i, /Script_SandboxPlugin_Hair/i],
  tracks: [/Scenes\/TestVehicleTracks\//i, /VehicleTrack/i, /TerrainTrail/i, /Script_SandboxPlugin_Tracks/i],
});

// 各测试场的实机干净取景配置（全分辨率 quality=high，不带 scale=small，推帧让模型/阴影/风场/烟尘稳定后截取）
const SHOT_PRESETS = Object.freeze({
  movement: {
    query: "movement=1&shot=1&manual=1&quality=high&audio=0",
    frames: 30,
    Stage: () => {
      const T = window.Taierzhuang;
      T.Debug.MovementRange?.GoTo?.("Jump");
      T.StepFrames(20, 1 / 60, false);
      // 稍后退并略抬头，让前方彩色标尺体块与地面刻度完整入镜
      T.player.position.x -= 6;
      T.player.position.z += 12;
      T.player.yaw = -0.25;
      T.player.pitch = -0.1;
      T.StepFrames(6, 1 / 60, true);
    },
  },
  weapons: {
    query: "weapons=1&shot=1&manual=1&quality=high&audio=0",
    frames: 30,
    Stage: () => {
      const T = window.Taierzhuang;
      T.player.position.z += 3.2;
      T.player.position.x -= 2.2;
      T.player.yaw = -0.28;
      T.player.pitch = -0.09;
      T.StepFrames(12, 1 / 60, true);
    },
  },
  range: {
    query: "range=1&shot=1&manual=1&quality=high&audio=0",
    frames: 30,
    Stage: () => {
      const T = window.Taierzhuang;
      T.Debug.Range?.GoTo?.("RangeRifle");
      T.player.yaw = -0.08;
      T.player.pitch = -0.04;
      T.StepFrames(12, 1 / 60, true);
    },
  },
  explosions: {
    query: "explosions=1&shot=1&manual=1&quality=high&audio=0",
    frames: 40,
    Stage: () => {
      const T = window.Taierzhuang;
      T.Debug.Explosions?.SetVehicle?.("type89");
      T.Debug.Explosions?.SetCoverWall?.(true);
      T.StepFrames(20, 1 / 60, false);
      T.player.yaw = 0.06;
      T.player.pitch = -0.05;
      T.StepFrames(8, 1 / 60, true);
    },
  },
  melee: {
    query: "melee=1&shot=1&manual=1&quality=high&audio=0",
    frames: 45,
    Stage: () => {
      const T = window.Taierzhuang;
      T.StepFrames(20, 1 / 60, true);
    },
  },
  gore: {
    query: "gore=1&shot=1&manual=1&quality=high&audio=0",
    frames: 45,
    Stage: () => {
      const T = window.Taierzhuang;
      T.player.position.x -= 2.5;
      T.player.position.z += 2.0;
      T.player.yaw = -0.18;
      T.player.pitch = -0.06;
      T.StepFrames(12, 1 / 60, true);
    },
  },
  impacts: {
    query: "impacts=1&shot=1&manual=1&quality=high&audio=0",
    frames: 35,
    Stage: () => {
      const T = window.Taierzhuang;
      const api = T.Debug.ShellImpact;
      api?.Camera?.("trenchEdge") || api?.Camera?.("overview");
      T.StepFrames(10, 1 / 60, false);
      // 打一发 75mm 炮弹并推到落点扬尘升起瞬间
      const target = api?.State?.()?.target;
      if (target && api?.Fire) {
        api.Fire("Shell75", { x: target[0], z: target[2] });
        T.StepFrames(210, 1 / 60, false);
      }
      T.StepFrames(6, 1 / 60, true);
    },
  },
  reactions: {
    query: "reactions=1&shot=1&manual=1&quality=high&audio=0",
    frames: 35,
    Stage: () => {
      const T = window.Taierzhuang;
      T.Debug.BattleReaction?.Stand?.("trench");
      T.player.yaw = -0.22;
      T.player.pitch = 0.02;
      T.StepFrames(12, 1 / 60, true);
    },
  },
  cloth: {
    query: "cloth=1&shot=1&manual=1&quality=high&audio=0",
    frames: 90,
    Stage: () => {
      const T = window.Taierzhuang;
      T.StepFrames(40, 1 / 60, true);
    },
  },
  hair: {
    query: "hair=1&shot=1&manual=1&quality=high&audio=0",
    frames: 60,
    Ready: () => {
      const state = window.Taierzhuang?.Debug.HairRange?.State();
      if (state?.error) throw new Error(state.error);
      return state?.ready;
    },
    Stage: () => {
      const T = window.Taierzhuang;
      T.Debug.HairRange.ShowPanel(false);
      T.StepFrames(30, 1 / 60, true);
    },
  },
  tracks: {
    query: "tracks=1&shot=1&manual=1&quality=high&audio=0",
    frames: 30,
    Ready: () => {
      const state = window.Taierzhuang?.Debug.VehicleTracks?.State();
      if (state?.error) throw new Error(state.error);
      return state?.ready;
    },
    Stage: () => {
      const T = window.Taierzhuang;
      const api = T.Debug.VehicleTracks;
      api.ShowPanel(false);
      api.Pause(true);
      api.SetWetness(1.3);
      api.Camera("overview");
      T.StepFrames(8, 1 / 60, true);
    },
  },
});

/** 校验全部 10 张实机封面是否存在且格式、尺寸合规（纯 Node，供测试调用）。 */
export function CheckTestSceneCovers() {
  const missing = [];
  const invalid = [];
  const items = [];
  for (const entry of FUNCTIONAL_RANGES) {
    const file = CoverPathFor(entry.id);
    if (!fs.existsSync(file)) { missing.push(entry.id); continue; }
    const buf = fs.readFileSync(file);
    const isWebp = buf.length >= 16 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
    if (!isWebp || buf.length < 4096 || buf.length > 1024 * 1024) {
      invalid.push(`${entry.id} (${buf.length} B, webp=${isWebp})`);
    } else {
      items.push({ id: entry.id, file: CoverStemFor(entry.id), bytes: buf.length });
    }
  }
  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid, items };
}

function ChangedRangeIds(baseRef = "HEAD") {
  const diffFiles = new Set();
  const RunGit = (args) => {
    try {
      const out = execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
      for (const line of out.split(/\r?\n/)) {
        const s = line.trim();
        if (s) diffFiles.add(s.replace(/\\/g, "/"));
      }
    } catch { /* ignore */ }
  };
  RunGit(["diff", "--name-only", baseRef]);
  RunGit(["ls-files", "--others", "--exclude-standard"]);
  const matched = [];
  for (const entry of FUNCTIONAL_RANGES) {
    const patterns = WATCH_PATTERNS[entry.id] || [];
    const hit = [...diffFiles].some((f) => patterns.some((re) => re.test(f)));
    if (hit || !fs.existsSync(CoverPathFor(entry.id))) matched.push(entry.id);
  }
  return matched;
}

async function CaptureIds(ids) {
  if (!ids.length) {
    console.log("没有需要更新封面的测试场。");
    return;
  }
  fs.mkdirSync(COVERS_DIR, { recursive: true });
  const sharp = createRequire(import.meta.url)("sharp");
  const { LaunchBrowser } = await import("../../PrairieFire1937/Script_BrowserTestKit.mjs");
  const { ServeRoot } = await import("../Script_DevServer.mjs");
  const server = await ServeRoot(repoRoot, 0);
  const port = server.address().port;
  const browser = await LaunchBrowser();
  try {
    for (const id of ids) {
      const preset = SHOT_PRESETS[id];
      if (!preset) throw new Error(`未知测试场 ID：${id}`);
      const page = await browser.newPage({ viewport: { width: COVER_WIDTH, height: COVER_HEIGHT } });
      await page.addInitScript(() => {
        localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master: 0 }));
        localStorage.setItem("tengxian1938_tools_volume_v1", JSON.stringify({ volume: 0, muted: true }));
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      const url = `http://127.0.0.1:${port}/Taierzhuang1938/?${preset.query}`;
      console.log(`[cover] 打开 ${id} ...`);
      await page.goto(url, { waitUntil: "load", timeout: 120000 });
      await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });
      if (preset.Ready) await page.waitForFunction(preset.Ready, null, { timeout: 180000 });
      await page.evaluate((frames) => {
        const T = window.Taierzhuang;
        T.StepFrames(frames, 1 / 60, false);
      }, preset.frames);
      await page.evaluate(preset.Stage);
      // 隐藏调试面板 / 准星 / HUD / 菜单，保留纯净的三维实机场景画面
      await page.evaluate(() => {
        const hideSelectors = [
          "#boot", "#menu", "#hud", "#edRoot", "#settingsRoot",
          "#movementRangePanel", "#weaponRangeHud", ".weaponRangeHud",
          ".explosionLab", ".shellImpactLab", ".goreLab", ".clothLab", ".hairLab",
          ".meleeLab", ".rangePanel", ".uiProfiler", "[data-lab-panel]",
        ];
        for (const sel of hideSelectors) {
          for (const el of document.querySelectorAll(sel)) el.style.display = "none";
        }
        // 只保留主 WebGL 画布可见，其余覆盖 DOM 临时隐藏
        for (const el of document.body.children) {
          if (el.tagName !== "CANVAS" && el.id !== "view") el.style.visibility = "hidden";
        }
        window.Taierzhuang.StepFrames(2, 1 / 60, true);
      });
      await page.waitForTimeout(120);
      const pngBuffer = await page.screenshot({ type: "png" });
      const webpBuffer = await sharp(pngBuffer)
        .resize(COVER_WIDTH, COVER_HEIGHT, { fit: "cover" })
        .webp({ quality: 92, smartSubsample: false })
        .toBuffer();
      const dest = CoverPathFor(id);
      fs.writeFileSync(dest, webpBuffer);
      console.log(`[cover] 已生成 ${CoverStemFor(id)} (${(webpBuffer.length / 1024).toFixed(1)} KB)${errors.length ? ` [pageerror=${errors.length}]` : ""}`);
      if (errors.length) throw new Error(`${id} 截封面时出现页面错误：${errors.join(" | ")}`);
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    const check = CheckTestSceneCovers();
    if (!check.ok) {
      console.error("测试场景封面校验失败：", JSON.stringify(check));
      process.exit(1);
    }
    const totalKB = check.items.reduce((s, x) => s + x.bytes, 0) / 1024;
    console.log(`ok  测试场景实机封面齐备：${check.items.length}/${FUNCTIONAL_RANGES.length} 张（共 ${totalKB.toFixed(1)} KB）`);
    process.exit(0);
  }
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const changedArg = args.find((a) => a === "--changed" || a.startsWith("--changed="));
  let targets;
  if (onlyArg) {
    targets = onlyArg.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean);
  } else if (changedArg) {
    const ref = changedArg.includes("=") ? changedArg.slice("--changed=".length) : "HEAD";
    targets = ChangedRangeIds(ref);
  } else {
    targets = FUNCTIONAL_RANGES.map((e) => e.id);
  }
  await CaptureIds(targets);
}
