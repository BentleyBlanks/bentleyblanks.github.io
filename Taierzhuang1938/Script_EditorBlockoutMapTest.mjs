// ===========================================================================
// Script_EditorBlockoutMapTest.mjs —— 白盒关卡编辑器的纸面俯视图 + 界面（docs/Data_EditorBlockout.md §4、§4.1、§10）
//
// 跑法：node Taierzhuang1938/Script_EditorBlockoutMapTest.mjs [--no-shots]
//
// 被测页面是现造的 harness（_shots/EditorBlockoutHarness/_harness.html，gitignored）：直接 import
// 纯数据（MISSION_LAYOUT、SampleMissionTerrain / SampleMissionNaturalHeight）+ Blockout/FirstLevel.json
// + 本包的 Script_EditorBlockoutUi / Script_EditorBlockoutMap，不进游戏主程序。
//
// **数像素，不看 visible**：颜色 oracle 是地图模块导出的 MAP_COLORS。
//   - 合成场景（100 × 100 m，坡 0.1 m/m，一段开挖沟）钉死：纸色底、墨色块、旋转块的朝向、
//     不画的块（airWall / 碎块 / 不挡人的 / 门楣）、等高线的位置、开挖水洗、水、各阵营标记色。
//   - 第一关真数据：分块烘静态层的耗时与烘时最长的一帧、小地图以玩家为中心并夹在边界内、
//     全关总图缩放 / 平移 / 关键帧拾取（含真鼠标事件）。
//   - 界面：导航栏刻度数 = 关键帧数、点 / 拖动松手跳转、上一个 / 下一个、SetInteractive(false) 挡住点击、
//     鼠标 / 滚轮 / 按键不漏到 document、快进标记、关卡下拉、图层开关、全程无控制台错误。
// 截图（1920×1080、1280×720）：整屏、小地图特写、全关总图看全图、放大到 03–05 前沿（约 6 px/m）。
// ===========================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const harnessDir = path.join(projectDir, "_shots", "EditorBlockoutHarness");
const shotDir = path.join(projectDir, "_shots", "EditorBlockoutMap");
const pageFile = path.join(harnessDir, "_harness.html");
const SHOTS = !process.argv.includes("--no-shots");
fs.mkdirSync(harnessDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

// §8 关键帧清单（id、阶段、站位）与阶段标题：只给 harness 的「整关」模式造导航栏用；
// 有真配置的关键帧（Blockout/FirstLevel.json）原样替换进来。
const STATIONS = [
  ["01-1", 1, "洞内开场"], ["01-2", 1, "压在塌木下"], ["02-1", 2, "还权位"], ["02-2", 2, "后交通壕折角"],
  ["03-1", 3, "集结处东北角"], ["03-2", 3, "观察射台"], ["03-3", 3, "夺下的机枪座"],
  ["04-1", 4, "机枪座看路弯"], ["04-2", 4, "阵位后墙"],
  ["05-1", 5, "支沟去程"], ["05-2", 5, "捡弹点"], ["05-3", 5, "攻击位"], ["05-4", 5, "缺口重开"],
  ["06-1", 6, "借火位"], ["06-2", 6, "坡顶"], ["07-1", 7, "沟中"], ["07-2", 7, "担架停点"], ["07-3", 7, "沟口土坎"],
  ["08-1", 8, "村北口巷子"], ["08-2", 8, "主街北口"], ["08-3", 8, "回头朝西"],
  ["09-1", 9, "灶屋过道"], ["09-2", 9, "西侧夹道"], ["09-3", 9, "后院"], ["10-1", 10, "院门东侧墙角"], ["10-2", 10, "出村"],
  ["11-1", 11, "出门楼"], ["12-1", 12, "低墙射位"], ["12-2", 12, "回头看装载区"], ["12-3", 12, "驴车车尾"],
  ["13-1", 13, "车上"], ["13-2", 13, "浅沟爬起"], ["14-1", 14, "抬担架走向沟口"], ["14-2", 14, "沟口"],
  ["15-1", 15, "沟内收拢"], ["15-2", 15, "沟尾坡顶"], ["15-3", 15, "夹道拐角"], ["15-4", 15, "院门"],
  ["16-1", 16, "厢房门槛"], ["17-1", 17, "厢房内"], ["18-1", 18, "接令"], ["18-2", 18, "南岸射位"], ["18-3", 18, "爆破安全区"], ["18-4", 18, "夜入北门"],
];
const STAGE_TITLES = {
  1: "炮火后的活人", 2: "枪到手里", 3: "夺取右侧阵位", 4: "战车压上来", 5: "支沟捡弹炸车", 6: "集结处接令",
  7: "沿沟南行", 8: "主街受阻", 9: "穿屋到后院", 10: "守巷口出村", 11: "桥头接运点", 12: "掩护装载",
  13: "空袭", 14: "转入西沟", 15: "降压步行", 16: "交接", 17: "老周死亡", 18: "毁桥回城",
};

const HARNESS = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blockout UI harness</title>
<link rel="stylesheet" href="../../Style_Interface.css">
<link rel="stylesheet" href="../../Style_EditorBlockout.css">
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #0d0f10; }
  /* 白盒画面的替身：浅灰天、灰地、透视网格 —— 面板压在亮天上看得清才算数 */
  #scene { position: fixed; inset: 0; background: linear-gradient(180deg, #b4bbbe 0%, #d0d3ce 47%, #8f8c84 47.2%, #6f6b64 100%); }
  #scene::after { content: ""; position: absolute; left: 0; right: 0; top: 47%; bottom: 0;
    background: repeating-linear-gradient(90deg, rgba(0,0,0,.07) 0 1px, transparent 1px 90px),
                repeating-linear-gradient(0deg, rgba(0,0,0,.07) 0 1px, transparent 1px 64px); }
  #scene i { position: absolute; background: #9d9a92; box-shadow: inset 0 0 0 1px rgba(0,0,0,.08); }
  .fakeGear { position: fixed; top: 14px; right: 14px; width: 40px; height: 34px; box-sizing: border-box; background: #030404; border: 1px solid rgba(214,217,209,.28); z-index: 41; }
  .fakeCross { position: fixed; left: 50%; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; z-index: 2; }
  .fakeCross::before, .fakeCross::after { content: ""; position: absolute; background: rgba(255,255,255,.9); box-shadow: 0 0 2px rgba(0,0,0,.5); }
  .fakeCross::before { left: 6px; top: 0; width: 2px; height: 14px; }
  .fakeCross::after { top: 6px; left: 0; height: 2px; width: 14px; }
  .fakeAmmo { position: fixed; right: 22px; bottom: 20px; font: 600 30px "TzUiLatin", sans-serif; color: #eee; text-shadow: 0 1px 3px #000; z-index: 2; }
</style>
</head>
<body>
<div id="scene"><i style="left:12%;top:36%;width:16%;height:16%"></i><i style="left:58%;top:30%;width:22%;height:22%"></i><i style="left:36%;top:41%;width:6%;height:9%"></i></div>
<div class="fakeCross"></div><div class="fakeAmmo">5 / 60</div><div class="fakeGear"></div>
<script>
  window.__bootError = null;
  window.addEventListener("error", (e) => { window.__bootError = String(e.message || e); });
  window.addEventListener("unhandledrejection", (e) => { window.__bootError = String(e.reason && e.reason.stack || e.reason); });
</script>
<script type="module">
  import { MISSION_LAYOUT } from "../../Data_FirstLevelMissionLayout.mjs";
  import { SampleMissionTerrain, SampleMissionNaturalHeight } from "../../Data_FirstLevelMissionTerrain.mjs";
  import { FIRST_LEVEL_STAGES } from "../../Data_FirstLevelMissionStages.mjs";
  import { NormalizeBlockout, ValidateBlockout, YawDegFromTo } from "../../Script_EditorBlockoutConfig.mjs";
  import { BlockoutUi } from "../../Script_EditorBlockoutUi.mjs";
  import { BlockoutMap, MAP_COLORS, MAP_PICK_EVENT, MINI_PX_PER_M, VECTOR_PX_PER_M } from "../../Script_EditorBlockoutMap.mjs";
  try {
    const params = new URLSearchParams(location.search);
    const STATIONS = ${JSON.stringify(STATIONS)};
    const STAGE_TITLES = ${JSON.stringify(STAGE_TITLES)};
    const Wrap = (d) => { let v = ((d + 180) % 360 + 360) % 360 - 180; return v === -180 ? 180 : v; };

    // ---- 第一关场景：MISSION_LAYOUT 的块（含 ry），树模型照 §2.1 换成树干块 ----
    const blocks = MISSION_LAYOUT.blocks.map((b) => b.treeModel
      ? { id: b.id, x: b.x, z: b.z, y: b.y, w: 0.5, d: 0.5, h: b.treeModel.heightM || b.h || 6, ry: 0, semantic: "foliage", solid: true }
      : b);
    const levelScene = {
      levelKey: "FirstLevel", bounds: MISSION_LAYOUT.bounds, blocks,
      sampleHeight: SampleMissionTerrain, naturalHeight: SampleMissionNaturalHeight,
      ways: { rails: [MISSION_LAYOUT.railway.points] },
    };

    // ---- 关键帧 ----
    const raw = await (await fetch("../../Blockout/FirstLevel.json", { cache: "no-store" })).json();
    const valid = ValidateBlockout(raw);
    const doc = NormalizeBlockout(raw);
    let kfs = doc.keyframes;
    if (params.get("kf") === "table") {
      const real = new Map(kfs.map((k) => [k.id, k]));
      const seen = {};
      kfs = STATIONS.map(([id, stage, name]) => {
        if (real.has(id)) return real.get(id);
        const k = (seen[stage] = (seen[stage] || 0) + 1) - 1;
        const sp = FIRST_LEVEL_STAGES[stage - 1].spawn;
        return {
          id, stage, stageTitle: STAGE_TITLES[stage], name,
          player: { x: sp.x + k * 6, z: sp.z + k * 5, yawDeg: 180, pitchDeg: 0, stance: "stand" },
          what: "（测试页占位：这一站的配置由生成器写）", next: null, how: [], notes: "", signals: [], units: [], pois: [],
        };
      });
    }
    kfs.forEach((k, i) => { k.index = i; });

    // ---- 界面与地图，照总控的接法 ----
    const events = [];
    const leaked = { mousedown: 0, pointerdown: 0, wheel: 0, keydown: 0 };
    for (const type of Object.keys(leaked)) document.addEventListener(type, () => { leaked[type] += 1; });
    let index = Math.max(0, kfs.findIndex((k) => k.id === (params.get("at") || "03-2")));
    let player = null;
    const map = new BlockoutMap();
    const ui = new BlockoutUi(document.body, {
      onPrev: () => { events.push(["prev"]); Go(index - 1); },
      onNext: () => { events.push(["next"]); Go(index + 1); },
      onSeek: (i) => { events.push(["seek", i]); Go(i); },
      onLevel: (key) => { events.push(["level", key]); },
      onLayer: (name, value) => { events.push(["layer", name, value]); ui.SetLayers({ [name]: value }); map.SetLayers({ [name]: value }); Refresh(); },
      onSavePose: () => { events.push(["savePose"]); ui.Toast("机位已保存", "ok"); },
      onReplay: () => { events.push(["replay"]); },
      onOpenMap: () => { events.push(["openMap"]); ui.SetMapOpen(true); Refresh(); },
      onCloseMap: () => { events.push(["closeMap"]); ui.SetMapOpen(false); },
      onMapPick: (i) => { events.push(["mapPick", i]); Go(i); },
    });
    function CardFor(kf, p) {
      let next = null;
      if (kf.next) {
        next = { text: kf.next.text, distanceM: null, relYawDeg: null };
        if (Number.isFinite(kf.next.x)) {
          next.distanceM = Math.hypot(kf.next.x - p.x, kf.next.z - p.z);
          next.relYawDeg = Wrap(YawDegFromTo(p, kf.next) - p.yawDeg);
        }
      }
      return { stage: kf.stage, stageTitle: kf.stageTitle, name: kf.name, what: kf.what, next, how: kf.how, notes: kf.notes,
        guessCount: kf.units.filter((u) => u.guess).length };
    }
    function Go(i) {
      if (!kfs.length) return;
      index = Math.max(0, Math.min(kfs.length - 1, i));
      const kf = kfs[index];
      player = { ...kf.player };
      ui.SetKeyframes(kfs, index);
      ui.SetCard(CardFor(kf, player));
      map.SetKeyframes(kfs, index);
      map.SetDynamic({ player, units: kf.units, pois: kf.pois, next: kf.next });
      Refresh();
    }
    function Refresh() {
      map.PaintMini(ui.miniCanvas, { pxPerM: MINI_PX_PER_M });
      if (ui.mapOpen) map.PaintFull(ui.fullCanvas);
    }
    ui.SetLevels([{ key: "FirstLevel", label: "第一关 · 往南的路" }, { key: "SecondLevel", label: "第二关 · 手榴弹雨（空间草稿）" }], "FirstLevel");
    ui.SetLayers({ arcs: "default", intents: true, labels: true, xray: true });
    ui.SetStatus({ state: valid.ok ? "ok" : "error",
      message: valid.ok ? "Blockout/FirstLevel.json · " + kfs.length + " 个关键帧" : valid.errors.join("\\n"),
      writable: false, saveReason: "测试页没有本机存档口" });
    const t0 = performance.now();
    map.SetScene(levelScene);
    const setSceneMs = performance.now() - t0;
    Go(index);

    // ---- 分块烘：同时用 rAF 量烘的过程中最长的一帧（看会不会卡画面） ----
    const frames = { max: 0, n: 0, last: performance.now(), slow: [] };
    let baking = true;
    const Tick = (t) => {
      const gap = t - frames.last; frames.last = t;
      if (frames.n++ > 0) {
        frames.max = Math.max(frames.max, gap);
        if (gap > 40 && frames.slow.length < 8) frames.slow.push(Math.round(gap) + "ms@" + (map.job ? map.job.phase + ":" + map.job.row : "idle"));
      }
      if (baking) requestAnimationFrame(Tick);
    };
    requestAnimationFrame(Tick);
    const bakeT0 = performance.now();
    map.Bake().then((stats) => {
      baking = false;
      window.__bake = { ...stats, resolvedMs: Math.round(performance.now() - bakeT0), maxFrameGapMs: Math.round(frames.max), frames: frames.n, slowFrames: frames.slow, setSceneMs: Math.round(setSceneMs) };
      Refresh();
    }).catch((e) => { window.__bootError = String(e && e.stack || e); });

    // ---- 合成场景：每个断言都能算出该在哪儿 ----
    function Synthetic() {
      const m = new BlockoutMap();
      const blocksS = [
        { id: "wallA", x: 20, z: 20, w: 10, d: 2, h: 3, semantic: "structure" },
        { id: "wallR", x: 60, z: 20, w: 14, d: 2, h: 3, ry: Math.PI / 4, semantic: "plaster" },
        { id: "cover", x: 20, z: 50, w: 6, d: 2, h: 1, semantic: "cover" },
        { id: "air", x: 60, z: 50, w: 10, d: 10, h: 3, semantic: "airWall" },
        { id: "tiny", x: 80, z: 50, w: 6, d: 6, h: 0.2, semantic: "structure" },
        { id: "ghost", x: 85, z: 20, w: 6, d: 6, h: 3, semantic: "timber", solid: false },
        { id: "lintel", x: 40, z: 65, w: 6, d: 1.2, h: 0.5, y: 4 + 2.6, semantic: "structure" },
        { id: "river", x: 50, z: 93, w: 60, d: 4, h: 0.1, semantic: "water", solid: false },
      ];
      m.SetScene({
        levelKey: "Synthetic", bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, blocks: blocksS,
        sampleHeight: (x) => x * 0.1,
        naturalHeight: (x, z) => x * 0.1 + (Math.abs(z - 80) < 2.5 ? 1.5 : 0),
      });
      return m;
    }

    // ---- 数像素 ----
    const TOL = 22;
    function Data(canvas) { return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height); }
    function Count(canvas, names, rect = null) {
      const img = Data(canvas);
      const d = canvas.width / canvas.clientWidth;
      const x0 = rect ? Math.max(0, Math.floor(rect.x * d)) : 0, y0 = rect ? Math.max(0, Math.floor(rect.y * d)) : 0;
      const x1 = rect ? Math.min(img.width, Math.ceil((rect.x + rect.w) * d)) : img.width, y1 = rect ? Math.min(img.height, Math.ceil((rect.y + rect.h) * d)) : img.height;
      const out = { total: (x1 - x0) * (y1 - y0) };
      for (const n of names) { out[n] = 0; out[n + "Exact"] = 0; }
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const o = (y * img.width + x) * 4, r = img.data[o], g = img.data[o + 1], b = img.data[o + 2];
        for (const n of names) {
          const t = MAP_COLORS[n];
          const dr = r - t[0], dg = g - t[1], db = b - t[2];
          if (!dr && !dg && !db) { out[n + "Exact"] += 1; out[n] += 1; }
          else if (Math.abs(dr) <= TOL && Math.abs(dg) <= TOL && Math.abs(db) <= TOL) out[n] += 1;
        }
      }
      return out;
    }
    function Pixel(canvas, x, y) {
      const d = canvas.width / canvas.clientWidth;
      const p = canvas.getContext("2d").getImageData(Math.floor(x * d), Math.floor(y * d), 1, 1).data;
      return [p[0], p[1], p[2]];
    }
    function Is(rgb, name, tol = 0) { const t = MAP_COLORS[name]; return Math.abs(rgb[0] - t[0]) <= tol && Math.abs(rgb[1] - t[1]) <= tol && Math.abs(rgb[2] - t[2]) <= tol; }
    function RowLum(canvas, y, x0, x1) {
      const d = canvas.width / canvas.clientWidth;
      const img = canvas.getContext("2d").getImageData(Math.floor(x0 * d), Math.floor(y * d), Math.ceil((x1 - x0) * d), 1).data;
      const out = [];
      for (let i = 0; i < img.length; i += 4) out.push(0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2]);
      return out;
    }
    /** 近似金色像素的质心（CSS 像素），玩家箭头 + 视锥的位置与朝向读它。 */
    function GoldCentroid(canvas, rect = null) {
      const img = Data(canvas);
      const d = canvas.width / canvas.clientWidth;
      const t = MAP_COLORS.gold;
      let n = 0, sx = 0, sy = 0;
      const x0 = rect ? Math.floor(rect.x * d) : 0, y0 = rect ? Math.floor(rect.y * d) : 0;
      const x1 = rect ? Math.ceil((rect.x + rect.w) * d) : img.width, y1 = rect ? Math.ceil((rect.y + rect.h) * d) : img.height;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const o = (y * img.width + x) * 4;
        if (Math.abs(img.data[o] - t[0]) <= 26 && Math.abs(img.data[o + 1] - t[1]) <= 26 && Math.abs(img.data[o + 2] - t[2]) <= 40) { n++; sx += x; sy += y; }
      }
      return n ? { n, x: sx / n / d, y: sy / n / d } : { n: 0, x: NaN, y: NaN };
    }
    /** 离 (cx, cy) 最远的近金色像素 —— 玩家箭头的尖。返回相对偏移（CSS 像素）。 */
    function GoldTip(canvas, cx, cy, r = 20) {
      const img = Data(canvas);
      const d = canvas.width / canvas.clientWidth;
      const t = MAP_COLORS.gold;
      let best = null, bestD = -1;
      for (let y = Math.max(0, Math.floor((cy - r) * d)); y < Math.min(img.height, Math.ceil((cy + r) * d)); y++) {
        for (let x = Math.max(0, Math.floor((cx - r) * d)); x < Math.min(img.width, Math.ceil((cx + r) * d)); x++) {
          const o = (y * img.width + x) * 4;
          if (Math.abs(img.data[o] - t[0]) > 26 || Math.abs(img.data[o + 1] - t[1]) > 26 || Math.abs(img.data[o + 2] - t[2]) > 40) continue;
          const dx = (x + 0.5) / d - cx, dy = (y + 0.5) / d - cy;
          const dd = dx * dx + dy * dy;
          if (dd > bestD) { bestD = dd; best = { dx: +dx.toFixed(1), dy: +dy.toFixed(1) }; }
        }
      }
      return best;
    }
    function TestCanvas(w, h) {
      const c = document.createElement("canvas");
      c.style.cssText = "position:fixed;left:-4000px;top:0;width:" + w + "px;height:" + h + "px";
      document.body.appendChild(c);
      return c;
    }

    /** 页面稳定之后再烘一遍第一关，量烘的过程中最长的一帧（开机那一帧的排版 / 字体不算进来）。 */
    async function RebakeProbe() {
      map.ClearCache("FirstLevel");
      const probe = { max: 0, n: 0, last: 0, slow: [] };
      let on = true;
      const T = (t) => {
        if (probe.n++ > 0) {
          const gap = t - probe.last;
          probe.max = Math.max(probe.max, gap);
          if (gap > 40 && probe.slow.length < 8) probe.slow.push(Math.round(gap) + "ms@" + (map.job ? map.job.phase + ":" + map.job.row : "idle"));
        }
        probe.last = t;
        if (on) requestAnimationFrame(T);
      };
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      requestAnimationFrame(T);
      const t0 = performance.now();
      const stats = await map.Bake();
      on = false;
      Refresh();
      return { ...stats, resolvedMs: Math.round(performance.now() - t0), maxFrameGapMs: Math.round(probe.max), frames: probe.n, slowFrames: probe.slow };
    }

    window.__h = {
      ui, map, events, leaked, kfs, valid, levelScene, MAP_COLORS, MAP_PICK_EVENT, MINI_PX_PER_M, VECTOR_PX_PER_M, RebakeProbe,
      Go, Refresh, Synthetic, Data, Count, Pixel, Is, RowLum, GoldCentroid, GoldTip, TestCanvas,
      get index() { return index; },
      OpenMap() { ui.SetMapOpen(true); map.PaintFull(ui.fullCanvas); },
    };
    window.__ready = true;
  } catch (error) {
    window.__bootError = String(error && error.stack || error);
  }
</script>
</body>
</html>
`;
fs.writeFileSync(pageFile, HARNESS, "utf8");

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
function Info(name, detail = "") { console.log(`note ${name}${detail ? "  — " + detail : ""}`); }

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const base = `http://127.0.0.1:${port}/Taierzhuang1938/_shots/EditorBlockoutHarness/_harness.html`;
const browser = await LaunchBrowser();
const errors = [];
function Watch(page) {
  page.on("pageerror", (e) => errors.push(`PAGEERROR ${String(e).slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`CONSOLE ${m.text().slice(0, 240)} @ ${m.location()?.url || ""}`); });
}
async function Open(page, query) {
  await page.goto(`${base}?${query}`);
  await page.waitForFunction(() => window.__ready === true || !!window.__bootError, null, { timeout: 60000 });
  const boot = await page.evaluate(() => window.__bootError);
  if (boot) throw new Error(`harness 启动失败：${boot}`);
  await page.waitForFunction(() => !!window.__bake || !!window.__bootError, null, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready.then(() => window.__h.Refresh()));
}

try {
  // =========================================================================
  // 1. 合成场景：纸面图的每一种画法
  // =========================================================================
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  Watch(page);
  await Open(page, "kf=table&at=03-2");

  const syn = await page.evaluate(async () => {
    const h = window.__h;
    const m = h.Synthetic();
    await m.BakeNow();
    const out = {};
    // a) 烘好的图（比例 < 矢量阈值）：500 × 500 画布，看全图（约 4.7 px/m 会走矢量，先拉到 3 px/m）
    const c = h.TestCanvas(500, 500);
    m.PaintFull(c);
    m.FocusOn(50, 50, 3);
    m.PaintFull(c);
    const W = (x, z) => m.WorldToScreen(x, z);
    const P = (x, z) => { const p = W(x, z); return h.Pixel(c, p.x, p.y); };
    out.bakedScale = m.view.pxPerM;
    const area = h.Count(c, ["paper", "wall", "low", "water"], { x: W(0, 0).x, y: W(0, 0).y, w: 300, h: 300 });
    out.bakedCounts = area;
    out.wallA = P(20, 20);
    out.wallR_center = P(60, 20);
    out.wallR_axisNE = P(60 + 0.7071 * 5, 20 - 0.7071 * 5);   // 局部 +X 在 ry = +45° 时朝东北
    out.wallR_axisSE = P(60 + 0.7071 * 5, 20 + 0.7071 * 5);   // 镜像点：朝向反了才会是墙
    out.wallR_unrotated = P(66, 20);                          // 不转的话这里是墙
    out.cover = P(20, 50);
    out.air = P(60, 50);
    out.tiny = P(80, 50);
    out.ghost = P(85, 20);
    out.lintel = P(40, 65);
    out.river = P(50, 93);
    // 等高线：z = 35 这一行，h = 0.1x → 每 10 m 一条，x = 50 是 5 m 粗线
    const row = W(0, 35);
    const lum = h.RowLum(c, row.y, row.x, row.x + 300);
    const base = lum.slice().sort((a, b) => a - b)[Math.floor(lum.length * 0.6)];
    const dips = [];
    for (let i = 2; i < lum.length - 2; i++) {
      if (lum[i] < base - 6 && lum[i] <= lum[i - 1] && lum[i] <= lum[i + 1] && (!dips.length || i - dips[dips.length - 1].i > 6)) dips.push({ i, x: +(i / 3).toFixed(1), depth: +(base - lum[i]).toFixed(1) });
    }
    out.contours = dips;
    // 开挖：z = 80 的沟比 z = 70 更偏褐（r − b 更大）
    const cutIn = P(25, 80), cutOut = P(25, 70);
    out.cutIn = cutIn; out.cutOut = cutOut;
    // b) 矢量块（≥ 4 px/m）
    m.FocusOn(40, 30, 8);
    m.PaintFull(c);
    out.vectorScale = m.view.pxPerM;
    out.vWallA = P(20, 20);
    out.vWallR_axisNE = P(60 + 0.7071 * 5, 20 - 0.7071 * 5);
    out.vWallR_axisSE = P(60 + 0.7071 * 5, 20 + 0.7071 * 5);
    out.vAir = P(60, 50);
    out.vCounts = h.Count(c, ["wall"]);
    // c) 标记色：小地图里各阵营一枚，然后清空
    const mini = h.TestCanvas(220, 220);
    m.SetDynamic({
      player: { x: 50, z: 50, yawDeg: 0 },
      units: [
        { id: "e", side: "ija", kind: "soldier", x: 30, z: 40, yawDeg: 0 },
        { id: "f", side: "nra", kind: "soldier", x: 50, z: 30, yawDeg: 90 },
        { id: "c", side: "civ", kind: "civilian", x: 70, z: 40, yawDeg: 0 },
        { id: "t", side: "ija", kind: "tank", x: 30, z: 65, yawDeg: -90 },
        { id: "g", side: "nra", kind: "soldier", x: 65, z: 60, yawDeg: 0, guess: true },
      ],
      pois: [{ id: "p", name: "缺口", kind: "poi", x: 40, z: 55 }],
      next: { x: 60, z: 45, text: "去那儿", radiusM: 3 },
    });
    m.PaintMini(mini, { pxPerM: 2 });
    out.markers = h.Count(mini, ["enemy", "friend", "civ", "gold"]);
    m.SetDynamic({ player: null, units: [], pois: [], next: null });
    m.PaintMini(mini, { pxPerM: 2 });
    out.markersCleared = h.Count(mini, ["enemy", "friend", "civ", "gold"]);
    // d) 射界三档：机枪手（朝北）默认有扇，步枪手（朝南）只在「全部」里有。扇是半透明的，
    //    数不到精确色，所以比两次出图的差：哪些像素变了、变了的那批偏红还是偏蓝。
    m.SetDynamic({ player: null, pois: [], next: null, units: [
      { id: "mg", side: "ija", kind: "soldier", weapon: "Type11", aim: true, x: 50, z: 60, yawDeg: 0, arc: { halfDeg: 25, rangeM: 70, yawDeg: 0, source: "default" } },
      { id: "rf", side: "nra", kind: "soldier", weapon: "HanYang", aim: true, x: 50, z: 40, yawDeg: 180, arc: null },
    ] });
    const Snap = (mode) => { m.SetLayers({ arcs: mode }); m.PaintMini(mini, { pxPerM: 2 }); return h.Data(mini).data.slice(); };
    const Diff = (a, b) => {
      let n = 0, redShift = 0, blueShift = 0, north = 0, south = 0;
      const w = mini.width;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) <= 6) continue;
        n++;
        redShift += (b[i] - b[i + 1]) - (a[i] - a[i + 1]);
        blueShift += (b[i + 2] - b[i]) - (a[i + 2] - a[i]);
        const y = Math.floor(i / 4 / w);
        if (y < mini.height / 2 - 4) north++; else if (y > mini.height / 2 + 4) south++;
      }
      return { n, red: n ? +(redShift / n).toFixed(1) : 0, blue: n ? +(blueShift / n).toFixed(1) : 0, north, south };
    };
    const off = Snap("off"), def = Snap("default"), all = Snap("all");
    out.arcDefault = Diff(off, def);
    out.arcAll = Diff(def, all);
    m.SetLayers({ arcs: "default" });
    c.remove(); mini.remove(); m.Dispose();
    return out;
  });
  const near = (p, t, tol) => p && Math.abs(p[0] - t[0]) <= tol && Math.abs(p[1] - t[1]) <= tol && Math.abs(p[2] - t[2]) <= tol;
  const isWall = (p) => near(p, [52, 48, 43], 6);
  const isLow = (p) => near(p, [142, 135, 122], 6);
  const nearWater = (p) => near(p, [152, 187, 207], 6);
  const notInk = (p) => p && !near(p, [52, 48, 43], 40) && !near(p, [142, 135, 122], 10);
  Check("纸色底：合成图上近纸色像素占多数", syn.bakedCounts.paper > syn.bakedCounts.total * 0.5, JSON.stringify(syn.bakedCounts));
  Check("墨色块：axis-aligned 墙心是墨色（烘图）", isWall(syn.wallA), JSON.stringify(syn.wallA));
  Check("旋转块：ry = +45° 的墙沿东北轴有墨、镜像（东南）没有、不转的位置没有", isWall(syn.wallR_center) && isWall(syn.wallR_axisNE) && notInk(syn.wallR_axisSE) && notInk(syn.wallR_unrotated),
    `NE ${syn.wallR_axisNE} SE ${syn.wallR_axisSE} unrot ${syn.wallR_unrotated}`);
  Check("矮掩体（cover，高 1 m）是中灰", isLow(syn.cover), JSON.stringify(syn.cover));
  Check("不画：airWall、0.2 m 碎块、不挡人的装饰件、门楣", notInk(syn.air) && notInk(syn.tiny) && notInk(syn.ghost) && notInk(syn.lintel),
    `air ${syn.air} tiny ${syn.tiny} ghost ${syn.ghost} lintel ${syn.lintel}`);
  Check("水是淡蓝", nearWater(syn.river), JSON.stringify(syn.river));
  const cx = syn.contours.map((d) => d.x);
  const expect = [10, 20, 30, 40, 50, 60, 70, 80, 90];
  const matched = expect.filter((x) => cx.some((v) => Math.abs(v - x) <= 1.2)).length;
  Check("等高线：坡 0.1 m/m 上每 10 m 一条（9 条全在 ±1.2 m 内）", matched === 9 && cx.length <= 11, `found ${JSON.stringify(cx)}`);
  const major = syn.contours.find((d) => Math.abs(d.x - 50) <= 1.2);
  const minors = syn.contours.filter((d) => Math.abs(d.x - 50) > 1.2).map((d) => d.depth);
  Check("5 m 等高线比 1 m 的粗 / 深", major && minors.length && major.depth > Math.max(...minors), `major ${major?.depth} minors max ${Math.max(...minors)}`);
  const brown = (p) => p[0] - p[2];
  Check("开挖水洗：沟里比沟外偏褐、偏暗", brown(syn.cutIn) > brown(syn.cutOut) + 12 && syn.cutIn[1] < syn.cutOut[1], `in ${syn.cutIn} out ${syn.cutOut}`);
  Check("矢量块（≥ 4 px/m）同样画墨、旋转方向一致、airWall 不画", syn.vectorScale >= 4 && isWall(syn.vWallA) && isWall(syn.vWallR_axisNE) && notInk(syn.vWallR_axisSE) && notInk(syn.vAir),
    `scale ${syn.vectorScale} NE ${syn.vWallR_axisNE} SE ${syn.vWallR_axisSE}`);
  Check("标记色：红 / 蓝 / 绿 / 金都有实心像素", syn.markers.enemyExact > 20 && syn.markers.friendExact > 20 && syn.markers.civExact > 8 && syn.markers.goldExact > 20, JSON.stringify(syn.markers));
  Check("清空动态层后红 / 蓝 / 绿 / 金实心像素归零", !syn.markersCleared.enemyExact && !syn.markersCleared.friendExact && !syn.markersCleared.civExact && !syn.markersCleared.goldExact, JSON.stringify(syn.markersCleared));
  Check("射界三档：关→缺省多出机枪手朝北的红扇；缺省→全部再多出步枪手朝南的蓝扇",
    syn.arcDefault.n > 1500 && syn.arcDefault.red > 10 && syn.arcDefault.north > syn.arcDefault.south * 3
      && syn.arcAll.n > 800 && syn.arcAll.blue > 5 && syn.arcAll.south > syn.arcAll.north * 3,
    `off→default ${JSON.stringify(syn.arcDefault)} default→all ${JSON.stringify(syn.arcAll)}`);

  // =========================================================================
  // 2. 第一关：烘焙耗时、小地图、全关总图
  // =========================================================================
  const bootBake = await page.evaluate(() => window.__bake);
  Info("第一关静态层（开机时烘，含开机首帧）", JSON.stringify(bootBake));
  const bake = await page.evaluate(() => window.__h.RebakeProbe());
  Info("第一关静态层（页面稳定后重烘）", JSON.stringify(bake));
  Check("第一关静态层烘好（≤ 4 px/m、块数 > 1000）", bake && bake.width > 500 && bake.blocks > 1000 && bake.pxPerM <= 4, `${bake?.width}×${bake?.height} @ ${bake?.pxPerM?.toFixed?.(2)} px/m, ${bake?.blocks} blocks`);
  Check("烘焙分块：每一片 ≤ 12 ms，烘的过程中最长一帧 < 50 ms", bake && bake.maxStepMs <= 12 && bake.maxFrameGapMs < 50, `max step ${bake?.maxStepMs} ms (${bake?.maxStepPhase}), max frame gap ${bake?.maxFrameGapMs} ms over ${bake?.frames} frames ${JSON.stringify(bake?.slowFrames)}`);
  const cached = await page.evaluate(async () => { const h = window.__h; const t0 = performance.now(); h.map.SetScene(h.levelScene); const s = await h.map.Bake(); return { ms: performance.now() - t0, same: !!s && !h.map.baking }; });
  Check("同一关再 SetScene + Bake 直接用缓存（不重烘）", cached.same && cached.ms < 40, `${cached.ms.toFixed(1)} ms`);

  const level = await page.evaluate(() => {
    const h = window.__h;
    const { map, ui } = h;
    const out = {};
    const b = h.levelScene.bounds;
    const mini = ui.miniCanvas;
    const cssW = mini.clientWidth, cssH = mini.clientHeight;
    out.miniSize = [cssW, cssH, mini.width, mini.height];
    const mcx = cssW / 2, mcy = cssH / 2;
    out.miniCenter = [mcx, mcy];
    // 小地图以玩家为中心（关卡中部）
    map.SetDynamic({ player: { x: 0, z: 60, yawDeg: 0 }, units: [], pois: [], next: null });
    map.PaintMini(mini, { pxPerM: h.MINI_PX_PER_M });
    out.centerView = { ...map.miniView };
    out.centerGold = h.GoldCentroid(mini);
    out.miniInk = h.Count(mini, ["paper", "wall"]);
    // 夹在边界内：贴西北角
    map.SetDynamic({ player: { x: b.minX + 6, z: b.minZ + 6, yawDeg: 0 }, units: [], pois: [], next: null });
    map.PaintMini(mini, { pxPerM: h.MINI_PX_PER_M });
    out.cornerView = { ...map.miniView };
    out.cornerGold = h.GoldCentroid(mini);
    // 朝向：箭头尖（离玩家最远的金色像素）朝北在上、朝南在下、朝西（+90）在左、朝东（−90）在右
    for (const [key, yawDeg] of [["north", 0], ["south", 180], ["west", 90], ["east", -90]]) {
      map.SetDynamic({ player: { x: 0, z: 60, yawDeg }, units: [], pois: [], next: null });
      map.PaintMini(mini, { pxPerM: h.MINI_PX_PER_M });
      out[key + "Tip"] = h.GoldTip(mini, mcx, mcy);
    }
    // 每帧开销：小地图 60 次取平均（当前关键帧的动态层）
    h.Go(h.index);
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) map.PaintMini(mini, { pxPerM: h.MINI_PX_PER_M });
    out.miniMs = (performance.now() - t0) / 60;
    return out;
  });
  const mc = level.centerGold;
  const [mcx, mcy] = level.miniCenter;
  Check("小地图 220 CSS px、按 DPR 出图", level.miniSize[0] === 220 && level.miniSize[1] === 220 && level.miniSize[2] >= 220, JSON.stringify(level.miniSize));
  Check("小地图以玩家为中心：金色质心在画布中心 ±8 px", Math.abs(mc.x - mcx) < 8 && Math.abs(mc.y - mcy) < 8, `centroid ${mc.x?.toFixed(1)},${mc.y?.toFixed(1)} vs ${mcx},${mcy} n=${mc.n}`);
  Check("小地图上有纸色底与墨色块", level.miniInk.paper > 5000 && level.miniInk.wallExact > 20, JSON.stringify(level.miniInk));
  Check("小地图夹在边界内：玩家贴西北角时视图不出界、玩家标记偏到左上",
    Math.abs(level.cornerView.cx - (-205 + mcx / 1.6)) < 0.01 && Math.abs(level.cornerView.cz - (-232 + mcy / 1.6)) < 0.01 && level.cornerGold.x < 40 && level.cornerGold.y < 40,
    `view ${level.cornerView.cx.toFixed(1)},${level.cornerView.cz.toFixed(1)} gold ${level.cornerGold.x?.toFixed(1)},${level.cornerGold.y?.toFixed(1)}`);
  const tipOk = (t, ex, ey) => t && Math.hypot(t.dx - ex, t.dy - ey) < 3.5;
  Check("玩家朝向（yawDeg 0 = 北、+90 = 西）：箭头尖朝北在上、朝南在下、朝西在左、朝东在右",
    tipOk(level.northTip, 0, -11) && tipOk(level.southTip, 0, 11) && tipOk(level.westTip, -11, 0) && tipOk(level.eastTip, 11, 0),
    `N ${JSON.stringify(level.northTip)} S ${JSON.stringify(level.southTip)} W ${JSON.stringify(level.westTip)} E ${JSON.stringify(level.eastTip)}`);
  Info("小地图每次刷新", `${level.miniMs.toFixed(3)} ms（drawImage + 动态层，60 次平均）`);

  // 全关总图：缩放 / 平移 / 拾取（API）
  const full = await page.evaluate(() => {
    const h = window.__h;
    const { map, ui } = h;
    h.OpenMap();
    const c = ui.fullCanvas;
    const out = { size: [c.clientWidth, c.clientHeight] };
    map.FitBounds();
    map.PaintFull(c);
    out.fit = { ...map.view };
    const kf = h.kfs[h.index];
    const p = map.WorldToScreen(kf.player.x, kf.player.z);
    const back = map.ScreenToWorld(p.x, p.y);
    out.roundTrip = Math.hypot(back.x - kf.player.x, back.z - kf.player.z);
    const before = map.ScreenToWorld(300, 200);
    map.ZoomAt(300, 200, 2.5);
    const after = map.ScreenToWorld(300, 200);
    out.zoomScale = map.view.pxPerM / out.fit.pxPerM;
    out.zoomDrift = Math.hypot(after.x - before.x, after.z - before.z);
    map.FocusOn(-30, 60, map.view.pxPerM);
    const cx0 = map.view.cx, cz0 = map.view.cz;
    map.PanBy(100, -40);
    out.panDx = cx0 - map.view.cx;
    out.panDz = cz0 - map.view.cz;
    out.panExpect = 100 / map.view.pxPerM;
    out.panExpectZ = -40 / map.view.pxPerM;
    map.FitBounds();
    map.PaintFull(c);
    out.pick = h.kfs.map((k, i) => { const s = map.WorldToScreen(k.player.x, k.player.z); return map.PickKeyframe(s.x + 3, s.y - 2) === i; });
    // 同点的关键帧（合成站位落在同一出生点附近）只要求拾到「同位置」的那几个之一
    out.pickOk = h.kfs.filter((k, i) => {
      const s = map.WorldToScreen(k.player.x, k.player.z);
      const got = map.PickKeyframe(s.x + 3, s.y - 2);
      if (got < 0) return false;
      const g = h.kfs[got].player;
      return Math.hypot(g.x - k.player.x, g.z - k.player.z) * map.view.pxPerM < 11;
    }).length;
    out.pickMiss = map.PickKeyframe(4, 4);
    out.fullInk = h.Count(c, ["paper", "wall", "desk", "gold"]);
    // 放大到 03–05 前沿（≥ 4 px/m 走矢量块）
    map.FocusOn(5, -150, 6);
    const t0 = performance.now();
    map.PaintFull(c);
    out.vectorMs = performance.now() - t0;
    out.vectorInk = h.Count(c, ["wall", "enemy", "friend", "gold"]);
    map.FitBounds();
    const t1 = performance.now();
    map.PaintFull(c);
    out.fitMs = performance.now() - t1;
    return out;
  });
  Check("全关总图看全图后比例 > 0、坐标往返误差 < 1 cm", full.fit.pxPerM > 0.5 && full.roundTrip < 0.01, `fit ${full.fit.pxPerM.toFixed(2)} px/m, size ${full.size}`);
  Check("滚轮缩放以光标为中心（光标下的世界点不动）", Math.abs(full.zoomScale - 2.5) < 0.01 && full.zoomDrift < 0.01, `scale×${full.zoomScale.toFixed(2)} drift ${full.zoomDrift.toFixed(4)} m`);
  Check("平移 (100, −40) px = 位移 / 比例 米", Math.abs(full.panDx - full.panExpect) < 0.01 && Math.abs(full.panDz - full.panExpectZ) < 0.01, `${full.panDx.toFixed(2)},${full.panDz.toFixed(2)} vs ${full.panExpect.toFixed(2)},${full.panExpectZ.toFixed(2)}`);
  Check("关键帧拾取：每个关键帧点都拾得到（同位置的算对）、空白处 −1", full.pickOk === full.pick.length && full.pickMiss === -1, `${full.pickOk}/${full.pick.length}, miss ${full.pickMiss}`);
  Check("全关总图有纸、墨、桌面底与金色（当前关键帧 / 玩家）", full.fullInk.paper > 20000 && full.fullInk.wallExact > 50 && full.fullInk.deskExact > 1000 && full.fullInk.goldExact > 20, JSON.stringify(full.fullInk));
  Check("放大到前沿（6 px/m，矢量块）有墨色块与红 / 蓝单位", full.vectorInk.wallExact > 500 && full.vectorInk.enemyExact > 10 && full.vectorInk.friendExact > 10, JSON.stringify(full.vectorInk));
  Info("全关总图重画", `看全图 ${full.fitMs.toFixed(1)} ms，6 px/m 矢量 ${full.vectorMs.toFixed(1)} ms`);

  // 全关总图：真鼠标
  const canvasBox = await page.locator(".boMapCanvas").boundingBox();
  const s0 = await page.evaluate(() => window.__h.map.view.pxPerM);
  await page.mouse.move(canvasBox.x + 400, canvasBox.y + 300);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(50);
  const s1 = await page.evaluate(() => window.__h.map.view.pxPerM);
  Check("真滚轮在全关总图上放大", s1 > s0 * 1.2, `${s0.toFixed(2)} → ${s1.toFixed(2)}`);
  const c0 = await page.evaluate(() => ({ ...window.__h.map.view }));
  await page.mouse.move(canvasBox.x + 400, canvasBox.y + 300);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 460, canvasBox.y + 340, { steps: 5 });
  await page.mouse.up();
  const c1 = await page.evaluate(() => ({ ...window.__h.map.view }));
  Check("真拖动平移全关总图", Math.abs((c0.cx - c1.cx) - 60 / c1.pxPerM) < 0.05 && Math.abs((c0.cz - c1.cz) - 40 / c1.pxPerM) < 0.05, `dx ${(c0.cx - c1.cx).toFixed(2)} dz ${(c0.cz - c1.cz).toFixed(2)}`);
  await page.mouse.dblclick(canvasBox.x + 300, canvasBox.y + 300);
  const fitAgain = await page.evaluate(() => window.__h.map.view.pxPerM);
  Check("双击回到全图", Math.abs(fitAgain - full.fit.pxPerM) < 0.001, `${fitAgain.toFixed(3)} vs ${full.fit.pxPerM.toFixed(3)}`);
  // 点关键帧点 → onMapPick → 跳转（图保持打开）
  const target = await page.evaluate(() => {
    const h = window.__h;
    h.map.PaintFull(h.ui.fullCanvas);
    const i = h.kfs.findIndex((k) => k.id === "03-3");
    const s = h.map.WorldToScreen(h.kfs[i].player.x, h.kfs[i].player.z);
    h.events.length = 0;
    return { i, x: s.x, y: s.y };
  });
  await page.mouse.click(canvasBox.x + target.x, canvasBox.y + target.y);
  await page.waitForTimeout(30);
  const pickEv = await page.evaluate(() => ({ events: window.__h.events.slice(), index: window.__h.index, open: window.__h.ui.mapOpen }));
  Check("点全关总图上的关键帧点 → onMapPick 跳过去，图保持打开", pickEv.events.some((e) => e[0] === "mapPick" && e[1] === target.i) && pickEv.index === target.i && pickEv.open, JSON.stringify(pickEv));
  const leakMap = await page.evaluate(() => ({ ...window.__h.leaked }));
  Check("全关总图上的滚轮 / 按下不漏到 document", leakMap.wheel === 0 && leakMap.mousedown === 0 && leakMap.pointerdown === 0, JSON.stringify(leakMap));
  // Esc / M 关闭（焦点在界面里）
  await page.evaluate(() => window.__h.ui.btnCloseMap.focus());
  await page.keyboard.press("Escape");
  const closed = await page.evaluate(() => ({ open: window.__h.ui.mapOpen, leaked: window.__h.leaked.keydown }));
  Check("焦点在界面里按 Esc 关闭全关总图，按键不漏到 document", !closed.open && closed.leaked === 0, JSON.stringify(closed));

  // =========================================================================
  // 3. 界面
  // =========================================================================
  const ticks = await page.evaluate(() => ({ ticks: document.querySelectorAll(".boTick").length, kfs: window.__h.kfs.length, segs: document.querySelectorAll(".boSeg").length, nums: [...document.querySelectorAll(".boStageNum")].map((e) => e.textContent).join(" ") }));
  Check("导航栏刻度数 = 关键帧数，按阶段分段", ticks.ticks === ticks.kfs && ticks.segs === 18, `${ticks.ticks} ticks / ${ticks.kfs} kfs, ${ticks.segs} segs: ${ticks.nums}`);
  // 点刻度跳转
  const tickPos = async (i) => page.evaluate((i) => { const t = document.querySelectorAll(".boTick")[i].getBoundingClientRect(); return { x: t.left + t.width / 2, y: t.top + t.height / 2 }; }, i);
  await page.evaluate(() => { window.__h.events.length = 0; });
  let tp = await tickPos(10);
  await page.mouse.click(tp.x, tp.y);
  let ev = await page.evaluate(() => ({ events: window.__h.events.slice(), index: window.__h.index }));
  Check("点刻度 → onSeek(第 11 个)", ev.events.some((e) => e[0] === "seek" && e[1] === 10) && ev.index === 10, JSON.stringify(ev));
  // 悬停提示
  tp = await tickPos(5);
  await page.mouse.move(tp.x, tp.y);
  const tip = await page.evaluate(() => ({ on: document.querySelector(".boNavTip").classList.contains("on"), text: document.querySelector(".boNavTip").textContent }));
  Check("悬停刻度弹出「03 · 观察射台」", tip.on && tip.text === "03 · 观察射台", JSON.stringify(tip));
  // 拖动松手跳转
  await page.evaluate(() => { window.__h.events.length = 0; });
  const a = await tickPos(12), b2 = await tickPos(20);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b2.x, b2.y, { steps: 6 });
  const midDrag = await page.evaluate(() => window.__h.events.length);
  await page.mouse.up();
  ev = await page.evaluate(() => ({ events: window.__h.events.slice(), index: window.__h.index }));
  Check("拖动中不跳、松手才跳到第 21 个", midDrag === 0 && ev.events.length === 1 && ev.events[0][0] === "seek" && ev.events[0][1] === 20, JSON.stringify(ev));
  // 上一个 / 下一个
  await page.evaluate(() => { window.__h.events.length = 0; });
  await page.click(".boNextBtn");
  await page.click(".boPrev");
  ev = await page.evaluate(() => window.__h.events.map((e) => e[0]).join(","));
  Check("左右箭头 → onNext / onPrev", ev === "next,prev", ev);
  // 计数
  await page.evaluate(() => window.__h.Go(5));
  const count = await page.evaluate(() => document.querySelector(".boCount").textContent);
  Check("计数「03 · 2/3」", count === "03 · 2/3", count);
  // 快进
  await page.evaluate(() => window.__h.ui.SetTransition({ active: true, rate: 2.4 }));
  const fast = await page.evaluate(() => ({ text: document.querySelector(".boFast").textContent, hidden: document.querySelector(".boFast").hidden, playing: document.querySelector(".boNav").classList.contains("playing") }));
  await page.evaluate(() => window.__h.ui.SetTransition({ active: false }));
  const fastOff = await page.evaluate(() => document.querySelector(".boFast").hidden);
  Check("过渡中显示「快进 ×2.4」，结束后收起", fast.text === "快进 ×2.4" && !fast.hidden && fast.playing && fastOff, JSON.stringify(fast));
  // 卡片：箭头随相对角转、距离
  const card = await page.evaluate(() => {
    const ui = window.__h.ui;
    ui.SetCard({ stage: 3, stageTitle: "夺取右侧阵位", name: "观察射台", what: "班长停下来依次指", next: { text: "打掉机枪", distanceM: 52.4, relYawDeg: 90 }, how: ["班长三指", "任务字"], notes: "样例", guessCount: 2 });
    return {
      stage: document.querySelector(".boStageNo").textContent, arrow: document.querySelector(".boArrow").style.transform,
      dist: document.querySelector(".boDist").textContent, chips: document.querySelectorAll(".boChip").length,
      guess: document.querySelector(".boGuess").textContent, guessHidden: document.querySelector(".boGuess").hidden,
    };
  });
  const arrowDeg = Number((card.arrow.match(/rotate\((-?[\d.]+)deg\)/) || [])[1]);
  Check("卡片：阶段号 03、箭头 rotate(−90°)（目标在左）、距离 52 m、2 个标签、推测计数", card.stage === "03" && arrowDeg === -90 && card.dist === "52 m" && card.chips === 2 && card.guess.includes("2 个位置是推测的") && !card.guessHidden, JSON.stringify(card));
  // 关卡下拉
  await page.evaluate(() => { window.__h.events.length = 0; });
  await page.click(".boLevelBtn");
  const menuOpen = await page.evaluate(() => document.querySelector(".boLevel").classList.contains("open"));
  await page.click(".boLevelItem:not(.on)");
  ev = await page.evaluate(() => ({ events: window.__h.events.slice(), open: document.querySelector(".boLevel").classList.contains("open") }));
  Check("关卡下拉：打开、选第二关 → onLevel(\"SecondLevel\")、收起", menuOpen && ev.events.some((e) => e[0] === "level" && e[1] === "SecondLevel") && !ev.open, JSON.stringify(ev));
  // 图层开关：射界三档循环
  await page.evaluate(() => { window.__h.events.length = 0; });
  await page.click('.boLayer[data-layer="arcs"]');
  await page.click('.boLayer[data-layer="arcs"]');
  await page.click('.boLayer[data-layer="arcs"]');
  await page.click('.boLayer[data-layer="xray"]');
  ev = await page.evaluate(() => window.__h.events.map((e) => e.slice(1).join("=")).join(","));
  Check("图层：射界 默认→全部→关→默认，穿墙显示开关", ev === "arcs=all,arcs=off,arcs=default,xray=false", ev);
  // SetInteractive(false) 挡住点击
  await page.evaluate(() => { window.__h.events.length = 0; window.__h.ui.SetInteractive(false); });
  const nb = await page.locator(".boNextBtn").boundingBox();
  await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
  tp = await tickPos(30);
  await page.mouse.click(tp.x, tp.y);
  const blocked = await page.evaluate(() => ({ events: window.__h.events.length, docDown: window.__h.leaked.mousedown, visible: getComputedStyle(document.querySelector(".boNav")).visibility, opacity: getComputedStyle(document.querySelector(".boNav")).opacity }));
  await page.evaluate(() => window.__h.ui.SetInteractive(true));
  await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
  const unblocked = await page.evaluate(() => window.__h.events.map((e) => e[0]).join(","));
  Check("SetInteractive(false)：仍然可见，点击穿过界面到底下（不触发回调）；恢复后能点", blocked.events === 0 && blocked.docDown > 0 && blocked.visible === "visible" && blocked.opacity === "1" && unblocked === "next", `${JSON.stringify(blocked)} then ${unblocked}`);
  // 界面上的按下 / 按键不漏到 document
  const leakBefore = await page.evaluate(() => ({ ...window.__h.leaked }));
  await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
  const cardBox = await page.locator(".boCard").boundingBox();
  await page.mouse.move(cardBox.x + 100, cardBox.y + 40);
  await page.mouse.wheel(0, 120);
  await page.evaluate(() => { window.__h.events.length = 0; window.__h.ui.btnPrev.focus(); });
  await page.keyboard.press("Period");
  await page.keyboard.press("KeyY");
  const leakAfter = await page.evaluate(() => ({ leaked: { ...window.__h.leaked }, events: window.__h.events.map((e) => e[0]).join(","), focus: document.activeElement?.className || "" }));
  Check("界面上的 mousedown / pointerdown / wheel / keydown 都不漏到 document；焦点在界面里时 . Y 照样转给总控",
    leakAfter.leaked.mousedown === leakBefore.mousedown && leakAfter.leaked.pointerdown === leakBefore.pointerdown && leakAfter.leaked.wheel === leakBefore.wheel && leakAfter.leaked.keydown === leakBefore.keydown && leakAfter.events === "next,replay",
    JSON.stringify({ leakBefore, leakAfter }));
  const focusAfterClick = await page.evaluate(() => document.activeElement === document.body || !document.querySelector(".boRoot").contains(document.activeElement));
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
  const focusAfter = await page.evaluate(() => !document.querySelector(".boRoot").contains(document.activeElement));
  Check("点按钮不留焦点（回到游戏按空格不会再「点」它）", focusAfter, `before-blur ${focusAfterClick}`);
  // 小地图点击 → 打开全关总图
  await page.evaluate(() => { window.__h.events.length = 0; });
  await page.click(".boMini");
  const miniOpen = await page.evaluate(() => ({ events: window.__h.events.map((e) => e[0]).join(","), open: window.__h.ui.mapOpen }));
  Check("点小地图 → onOpenMap", miniOpen.events === "openMap" && miniOpen.open, JSON.stringify(miniOpen));
  await page.click(".boClose");
  // 提示条
  await page.evaluate(() => window.__h.ui.Toast("配置有 2 处错误", "error"));
  await page.waitForTimeout(60);
  const toast = await page.evaluate(() => ({ n: document.querySelectorAll(".boToast").length, text: document.querySelector(".boToast:last-child")?.textContent }));
  Check("提示条出现", toast.n >= 1 && toast.text === "配置有 2 处错误", JSON.stringify(toast));
  // 状态点
  const status = await page.evaluate(() => {
    const ui = window.__h.ui;
    ui.SetStatus({ state: "error", message: "keyframes[3].units[2].x 要是有限数字\nkeyframes[4].id 重复：05-1", writable: false, saveReason: "线上页面" });
    const r = { state: document.querySelector(".boDot").dataset.state, lines: document.querySelectorAll(".boStatusTip .boTipLine").length };
    ui.SetStatus({ state: "synced", message: "", writable: true });
    r.synced = document.querySelector(".boDot").classList.contains("flash");
    return r;
  });
  Check("状态点：红 = 有错（悬停列出原因）、蓝闪 = 已同步", status.state === "error" && status.lines === 3 && status.synced, JSON.stringify(status));
  // 只有 3 个关键帧的真配置
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  Watch(page2);
  await Open(page2, "at=03-1");
  const small = await page2.evaluate(() => ({ ticks: document.querySelectorAll(".boTick").length, kfs: window.__h.kfs.length, valid: window.__h.valid.ok, count: document.querySelector(".boCount").textContent, prevDisabled: window.__h.ui.btnPrev.disabled }));
  Check("真配置（Blockout/FirstLevel.json）：刻度数 = 关键帧数、第一个时「上一个」不可点", small.valid && small.ticks === small.kfs && small.kfs >= 3 && small.prevDisabled && small.count === "03 · 1/3", JSON.stringify(small));
  await page2.close();

  // =========================================================================
  // 4. 截图
  // =========================================================================
  if (SHOTS) {
    for (const [w, h] of [[1920, 1080], [1280, 720]]) {
      const p = await browser.newPage({ viewport: { width: w, height: h } });
      Watch(p);
      await Open(p, "kf=table&at=03-2");
      const tag = `${w}x${h}`;
      await p.screenshot({ path: path.join(shotDir, `${tag}_ui.png`) });
      const mb = await p.locator(".boMini").boundingBox();
      await p.screenshot({ path: path.join(shotDir, `${tag}_mini.png`), clip: { x: mb.x - 6, y: mb.y - 6, width: mb.width + 12, height: mb.height + 12 } });
      const cb = await p.locator(".boCard").boundingBox();
      await p.screenshot({ path: path.join(shotDir, `${tag}_card.png`), clip: { x: 0, y: 0, width: Math.min(w, cb.x + cb.width + 16), height: cb.y + cb.height + 16 } });
      const nvb = await p.locator(".boNav").boundingBox();
      // 导航栏：悬停提示 + 快进标记
      const t5 = await p.evaluate(() => { const t = document.querySelectorAll(".boTick")[9].getBoundingClientRect(); return { x: t.left, y: t.top + 4 }; });
      await p.evaluate(() => window.__h.ui.SetTransition({ active: true, rate: 2.4 }));
      await p.mouse.move(t5.x, t5.y);
      await p.waitForTimeout(200);
      await p.screenshot({ path: path.join(shotDir, `${tag}_nav.png`), clip: { x: nvb.x - 10, y: nvb.y - 44, width: nvb.width + 20, height: nvb.height + 54 } });
      await p.evaluate(() => window.__h.ui.SetTransition({ active: false }));
      // 右上：关卡下拉打开 + 状态
      await p.click(".boLevelBtn");
      await p.evaluate(() => window.__h.ui.Toast("配置已在外部修改，已同步", "info"));
      await p.waitForTimeout(250);
      await p.screenshot({ path: path.join(shotDir, `${tag}_top.png`), clip: { x: Math.max(0, w - 640), y: 0, width: Math.min(640, w), height: 150 } });
      await p.click(".boLevelBtn");
      await p.mouse.move(w / 2, h / 2);
      await p.evaluate(() => window.__h.OpenMap());
      await p.evaluate(() => { const h = window.__h; h.map.FitBounds(); h.map.PaintFull(h.ui.fullCanvas); });
      await p.screenshot({ path: path.join(shotDir, `${tag}_fullmap_fit.png`) });
      await p.evaluate(() => { const h = window.__h; h.map.FocusOn(8, -146, 6); h.map.PaintFull(h.ui.fullCanvas); });
      // 光标停在图上：右下读出坐标
      const fb = await p.locator(".boMapCanvas").boundingBox();
      await p.mouse.move(fb.x + fb.width * 0.62, fb.y + fb.height * 0.4);
      await p.waitForTimeout(80);
      await p.screenshot({ path: path.join(shotDir, `${tag}_fullmap_front6.png`) });
      await p.close();
    }
    // 高 DPR 的小地图（2×）
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    const p2 = await ctx2.newPage();
    Watch(p2);
    await Open(p2, "kf=table&at=03-2");
    const mb2 = await p2.locator(".boMini").boundingBox();
    await p2.screenshot({ path: path.join(shotDir, `1280x720@2x_mini.png`), clip: { x: mb2.x - 6, y: mb2.y - 6, width: mb2.width + 12, height: mb2.height + 12 } });
    await ctx2.close();
    Info("截图", shotDir);
  }

  Check("全程无控制台错误 / 页面异常", errors.length === 0, errors.slice(0, 5).join(" | "));
  await page.close();
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log("FAILED:\n  " + failed.map((f) => f.name).join("\n  "));
  process.exit(1);
}
