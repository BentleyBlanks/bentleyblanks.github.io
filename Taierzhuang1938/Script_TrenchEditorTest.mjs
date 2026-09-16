// Script_TrenchEditorTest.mjs —— 「场景样条PCG」面板里那一路**壕沟**的浏览器闸门。
// 跑法（从仓库根）：node Taierzhuang1938/Script_TrenchEditorTest.mjs
//
// 这一层守的是四件会在很远的地方才发作的事：
//   1. 七条沟**列得出来** —— 白盒布局还没挂 trenchNetwork 时也要能退回源码常量，
//      否则集成包接好之前这个面板对壕沟一无所知，而报错点会落在"列表是空的"这种没线索的地方；
//   2. 预览是**编译出来的真断面**，不是示意线 —— 横断面带有三角、三岔口标出来了；
//   3. 滑杆改的是**规划层真正被读的那张表**：TrenchRevision() 要递增，
//      否则退出面板重建关卡时集成层的编译缓存不会失效，"改了没生效"；
//   4. 导出的 JSON 能誊回去，也能读回来 —— 段带 source、routeBound 的段带警告、
//      壕沟预设的键带 `trench:` 前缀（预设名 loop/fire 与墙那张表会撞）。
//
// 入口 ?shot=1：编辑器 DOM 是 display:none，但 API 全在、three 叠加物照画 ——
// 这个测试就是这么跑的（与 Script_AiEditorTest 同一条）。截图前把 .off 摘掉再盖回去。

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots/TrenchEditor");
await fs.mkdir(shotDir, { recursive: true });

// oracle：段数与出厂参数都不问被测面板，直接问数据/规划层的源码。
// **别把出厂值抄成字面量** —— 宽度表还在按史料调（2026-09-17 就动过一次 3.2→3.0），
// 抄下来的那一刻这个测试守的就不是"还原得掉"而是"当天那个数"。
const { MISSION_TRENCH_NETWORK } = await import("./Data_FirstLevelMissionTrenches.mjs");
const { TRENCH_PRESETS } = await import("./Script_TrenchPlan.mjs");
const EXPECTED_SEGMENTS = MISSION_TRENCH_NETWORK.segments.length;
const FACTORY = TRENCH_PRESETS.communication;

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  errors.push(`CONSOLE ${message.text().slice(0, 200)} @ ${url}`);
});

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

try {
  console.log(`Data_FirstLevelMissionTrenches 有 ${EXPECTED_SEGMENTS} 条段`);
  await page.goto(
    `http://127.0.0.1:${port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=low&scale=small`,
    { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready && window.Taierzhuang?.editor,
    null, { timeout: 300000 });

  // -------------------------------------------------------------------------
  // 1) 列表：七条壕沟、键/标签/来源/角色都对
  // -------------------------------------------------------------------------
  const listed = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const ok = T.Debug.OpenEditor("splines");
    const tool = T.editor.active;
    const trenches = tool.routes.filter((r) => r.kind === "trench");
    return {
      ok,
      id: T.editor.ActiveId,
      total: tool.routes.length,
      count: trenches.length,
      ids: trenches.map((r) => r.id),
      keys: trenches.map((r) => r.key),
      labels: trenches.map((r) => r.label),
      sources: trenches.map((r) => r.source || ""),
      routeBound: trenches.filter((r) => r.trench?.routeBound).map((r) => r.id),
      roles: trenches.filter((r) => r.trench?.role).map((r) => `${r.id}:${r.trench.role}`),
      points: trenches.map((r) => r.points.length),
      chips: [...tool.kindChips.root.querySelectorAll("button")].map((b) => b.textContent),
      fromLayout: !!T.battlefield?.layout?.terrainSpec?.trenchNetwork,
    };
  });
  Check("打开「场景样条PCG」面板", listed.ok && listed.id === "splines");
  Check(`列出 ${EXPECTED_SEGMENTS} 条壕沟路线`, listed.count === EXPECTED_SEGMENTS,
    `${listed.count}/${EXPECTED_SEGMENTS}（全表 ${listed.total} 条）· 网络来自${listed.fromLayout ? "布局 terrainSpec" : "源码常量（C 包尚未接线）"}`);
  Check("路线键按 whitebox:<layout>:trench:<segId>",
    listed.keys.every((k) => /^whitebox:[^:]+:trench:[A-Za-z]+$/.test(k)), listed.keys[0]);
  Check("标签带「壕沟 ·」并标出回环/敌军坑道",
    listed.labels.every((l) => l.startsWith("壕沟 · "))
    && listed.labels.some((l) => l.includes("回环")) && listed.labels.some((l) => l.includes("敌军坑道")),
    listed.labels.join(" / "));
  Check("每条都带 source（誊回哪个文件）", listed.sources.every((s) => s.length > 4),
    listed.sources[0].slice(0, 60));
  Check("routeBound 的段被认出来了", listed.routeBound.length >= 3, listed.routeBound.join("、"));
  Check("过滤 chips 里有「壕沟」", listed.chips.includes("壕沟"), listed.chips.join("/"));

  // -------------------------------------------------------------------------
  // 2) 预览：横断面带 + 三岔口标记（两条段各来一次）
  // -------------------------------------------------------------------------
  const Preview = (segmentId) => page.evaluate((id) => {
    const T = window.Taierzhuang;
    const tool = T.editor.active;
    const route = tool.routes.find((r) => r.kind === "trench" && r.id === id);
    tool.Select(route.key);
    T.StepFrames(4, 1 / 60, true);
    let triangles = 0;
    let bandMeshes = 0;
    let markers = 0;
    let boxes = 0;
    for (const child of tool.group.children) {
      if (!child.geometry || !child.isMesh) continue;
      const index = child.geometry.getIndex();
      const tris = index ? index.count / 3 : child.geometry.attributes.position.count / 3;
      const type = child.geometry.type;
      if (type === "BufferGeometry" && index && index.count > 60) { bandMeshes += 1; triangles += tris; }
      else if (type === "CylinderGeometry" || type === "SphereGeometry") markers += 1;
      else if (type === "BoxGeometry") boxes += 1;
    }
    return {
      selected: tool.selectedKey === route.key,
      stats: tool.trenchStats,
      bandMeshes, triangles, markers, boxes,
      children: tool.group.children.length,
      previewMaterialColor: tool.group.children.find((c) => c.isMesh && c.material)?.material?.color?.getHex(),
    };
  }, segmentId);

  const front = await Preview("FrontCommunication");
  Check("FrontCommunication：overlay 里有横断面带网格",
    front.bandMeshes >= 1 && front.triangles > 500,
    `${front.bandMeshes} 片带 / ${front.triangles} 三角 / ${front.stats?.stations} 站`);
  Check("FrontCommunication：三岔口标记 ≥ 1",
    (front.stats?.junctions ?? 0) >= 1 && front.markers >= 2,
    `${front.stats?.junctions} 个接口（全网 ${front.stats?.networkJunctions}）→ ${front.markers} 只标记几何`);
  Check("FrontCommunication：布设件画出来了",
    front.boxes > 10 && (front.stats?.blocks ?? 0) > 10,
    `${front.stats?.blocks} 块 + ${front.stats?.placements} 件模型位`);
  Check("实测沟深落在设计值附近（1.83 m 下限之上）",
    (front.stats?.minDepth ?? 0) >= 1.83 && (front.stats?.maxDepth ?? 9) <= 2.6,
    `${front.stats?.minDepth?.toFixed(3)} — ${front.stats?.maxDepth?.toFixed(3)} m`);

  const bundle = await Preview("BundleApproach");
  Check("切到 BundleApproach 也能预览",
    bundle.selected && bundle.bandMeshes >= 1 && bundle.triangles > 300,
    `${bundle.triangles} 三角 / ${bundle.stats?.stations} 站 / ${bundle.stats?.junctions} 接口`);

  // -------------------------------------------------------------------------
  // 3) 段级滑杆：改的是规划层那张表（TrenchRevision 递增），导出带得上
  // -------------------------------------------------------------------------
  const segmentEdit = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const tool = T.editor.active;
    const { TrenchRevision, CompileTrenchNetwork } = await import("./Script_TrenchPlan.mjs");
    const { SampleMissionNaturalHeight } = await import("./Data_FirstLevelMissionTerrain.mjs");
    const route = tool.routes.find((r) => r.id === "FrontCommunication" && r.kind === "trench");
    tool.Select(route.key, { fly: false });
    const before = TrenchRevision();
    const widthBefore = CompileTrenchNetwork(tool.TrenchNetwork(), { natural: SampleMissionNaturalHeight })
      .segments.find((s) => s.id === "FrontCommunication").nominal.floorW;
    tool.trenchWidthSlider.Set(1.35);
    tool.PatchTrench("widthScale", 1.35);
    tool.PatchTrench("depth", 2.35);
    const after = TrenchRevision();
    const widthAfter = CompileTrenchNetwork(tool.TrenchNetwork(), { natural: SampleMissionNaturalHeight })
      .segments.find((s) => s.id === "FrontCommunication");
    tool.Export();
    const json = JSON.parse(tool.io.value);
    const entry = json.routes.find((r) => r.id === "FrontCommunication");
    return {
      before, after,
      widthBefore, widthAfter: widthAfter.nominal.floorW, depthAfter: widthAfter.nominal.depth,
      hasEntry: !!entry,
      entry,
      stats: tool.trenchStats,
    };
  });
  Check("改 widthScale/深度后 TrenchRevision() 递增", segmentEdit.after > segmentEdit.before,
    `rev ${segmentEdit.before} → ${segmentEdit.after}`);
  Check("覆盖真的进了编译结果（沟底宽 ×1.35、深 2.35）",
    Math.abs(segmentEdit.widthAfter - segmentEdit.widthBefore * 1.35) < 1e-6
    && Math.abs(segmentEdit.depthAfter - 2.35) < 1e-6,
    `floorW ${segmentEdit.widthBefore.toFixed(3)} → ${segmentEdit.widthAfter.toFixed(3)}，depth ${segmentEdit.depthAfter}`);
  Check("导出 JSON 含该段、带 trench 读数与 source",
    segmentEdit.hasEntry && segmentEdit.entry.trench?.widthScale === 1.35
    && segmentEdit.entry.trench?.depth === 2.35
    && (segmentEdit.entry.source || "").length > 4,
    JSON.stringify(segmentEdit.entry?.trench));
  Check("routeBound 的段导出时带誊回警告",
    /路线数据/.test(segmentEdit.entry?.warning || ""), segmentEdit.entry?.warning || "（无）");

  // -------------------------------------------------------------------------
  // 4) 壕沟预设：滑杆表换成 TRENCH_PARAMS，改动进 TRENCH_PRESETS 覆盖
  // -------------------------------------------------------------------------
  const presetEdit = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const tool = T.editor.active;
    const { TrenchPreset, TrenchRevision } = await import("./Script_TrenchPlan.mjs");
    tool.SelectPreset("trench:communication");
    const wallBoxHidden = tool.wallParamBox.style.display === "none";
    const trenchBoxShown = tool.trenchParamBox.style.display !== "none";
    const sliderKeys = Object.keys(tool.trenchParamSliders);
    const before = TrenchRevision();
    const factory = TrenchPreset("communication").revetment.spacingM;
    tool.PatchTrenchPreset("revetment.spacingM", 6.5);
    tool.PatchTrenchPreset("bermH", 0.4);
    const applied = TrenchPreset("communication");
    // 资产台对壕沟预设：给一行说明，不许抛错
    tool.showAssets = true;
    tool.BuildAssets();
    const assetNote = tool.assetNote.textContent;
    const assetGroup = !!tool.assetGroup;
    tool.showAssets = false;
    tool.BuildAssets();
    tool.Export();
    const json = JSON.parse(tool.io.value);
    const trenchKeys = Object.keys(json.presets?.edits || {}).filter((k) => k.startsWith("trench:"));
    return {
      wallBoxHidden, trenchBoxShown, sliderKeys,
      before, after: TrenchRevision(),
      factory, spacing: applied.revetment.spacingM, bermH: applied.bermH,
      // 嵌套那一层整只带过去了吗（别把 revetment 的别的字段抹掉）
      keptSiblings: applied.revetment.skipChance != null && applied.revetment.slatLenM != null,
      assetNote, assetGroup,
      trenchKeys,
      presetSource: json.presets?.source || "",
      trenchSource: json.presets?.trenchSource || "",
      exported: json.presets?.edits?.["trench:communication"],
    };
  });
  Check("选中壕沟预设后滑杆表换成 TRENCH_PARAMS",
    presetEdit.wallBoxHidden && presetEdit.trenchBoxShown && presetEdit.sliderKeys.length === 13,
    `${presetEdit.sliderKeys.length} 根：${presetEdit.sliderKeys.join(", ")}`);
  Check("改壕沟预设进了 TRENCH_PRESETS 覆盖并 +revision",
    presetEdit.spacing === 6.5 && presetEdit.bermH === 0.4 && presetEdit.after > presetEdit.before,
    `spacingM ${presetEdit.factory} → ${presetEdit.spacing}，rev ${presetEdit.before} → ${presetEdit.after}`);
  Check("嵌套字段整只带过去（revetment 的兄弟字段没被抹掉）", presetEdit.keptSiblings);
  Check("资产台对壕沟预设只给一行说明，不摆件也不报错",
    !presetEdit.assetGroup && /壕沟预设没有拼接资产台/.test(presetEdit.assetNote || ""),
    (presetEdit.assetNote || "").slice(0, 40));
  Check("导出 presets 节含 trench: 前缀键",
    presetEdit.trenchKeys.length === 1
    && Object.keys(presetEdit.exported || {}).includes("revetment.spacingM"),
    `${presetEdit.trenchKeys.join(",")} → ${Object.keys(presetEdit.exported || {}).join("、")}`);
  Check("presets 节写明壕沟改动誊回 Script_TrenchPlan.mjs → TRENCH_PRESETS",
    /Script_TrenchPlan\.mjs → TRENCH_PRESETS/.test(presetEdit.trenchSource),
    presetEdit.trenchSource);

  // -------------------------------------------------------------------------
  // 4b) 回归：加了壕沟这一路之后，墙/路那两路还是原样
  //     （「布设参数」被拆成两只盒子、预设键加了前缀，这一刀最容易伤到隔壁）
  // -------------------------------------------------------------------------
  const stillWall = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const tool = T.editor.active;
    const { WallPreset } = await import("./Script_WallSpline.mjs");
    const wall = tool.routes.find((r) => r.kind === "wall");
    tool.Select(wall.key, { fly: false });
    const wallBoxShown = tool.wallParamBox.style.display !== "none";
    const trenchBoxHidden = tool.trenchParamBox.style.display === "none";
    const presetKey = tool.presetKey;
    const moduleLenBefore = WallPreset(presetKey).moduleLen;
    tool.PatchPreset("moduleLen", 3.7);
    const moduleLenAfter = WallPreset(presetKey).moduleLen;
    tool.showAssets = true;
    tool.BuildAssets();
    const assets = tool.assetGroup ? tool.assetGroup.children.length : 0;
    const assetNoteHidden = tool.assetNote.style.display === "none";
    tool.showAssets = false;
    tool.BuildAssets();
    tool.RevertPreset();
    const road = tool.routes.find((r) => r.kind === "railway" || r.kind === "road");
    tool.Select(road.key, { fly: false });
    const roadMeshes = tool.group.children.filter((c) => c.isMesh).length;
    const widthShown = tool.widthSlider.root.style.display !== "none";
    const trenchSliderHidden = tool.trenchWidthSlider.root.style.display === "none";
    return {
      wallBoxShown, trenchBoxHidden, presetKey,
      moduleLenBefore, moduleLenAfter,
      restored: WallPreset(presetKey).moduleLen,
      assets, assetNoteHidden,
      roadMeshes, widthShown, trenchSliderHidden,
    };
  });
  Check("选中围墙：滑杆表切回 WALL_PARAMS，预设键不带前缀",
    stillWall.wallBoxShown && stillWall.trenchBoxHidden && !stillWall.presetKey.startsWith("trench:"),
    stillWall.presetKey);
  Check("围墙预设滑杆/还原照旧走 SetWallPresetOverride",
    stillWall.moduleLenAfter === 3.7 && stillWall.restored === stillWall.moduleLenBefore,
    `moduleLen ${stillWall.moduleLenBefore} → 3.7 → ${stillWall.restored}`);
  Check("围墙的拼接资产台照旧摆得出来（说明行收起）",
    stillWall.assets > 6 && stillWall.assetNoteHidden, `${stillWall.assets} 件`);
  Check("切回路/铁路：真几何预览还在，壕沟滑杆收起",
    stillWall.roadMeshes > 0 && stillWall.widthShown && stillWall.trenchSliderHidden,
    `${stillWall.roadMeshes} 只网格`);

  // -------------------------------------------------------------------------
  // 5) 导入往返：导出的那串能读回来
  // -------------------------------------------------------------------------
  const roundTrip = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.active;
    tool.Export();
    const text = tool.io.value;
    tool.overrides = {};
    tool.presetEdits = {};
    tool.ApplyPresetEdits();
    tool.routes = tool.Collect();
    tool.io.value = text;
    tool.Import();
    const route = tool.routes.find((r) => r.id === "FrontCommunication" && r.kind === "trench");
    tool.Export();
    return {
      same: tool.io.value === text,
      widthScale: route?.trench?.widthScale,
      depth: route?.trench?.depth,
      presetBack: tool.presetEdits["trench:communication"]?.["revetment.spacingM"],
    };
  });
  Check("导出 → 清空 → 导入 → 再导出，逐字一致", roundTrip.same,
    `widthScale=${roundTrip.widthScale} depth=${roundTrip.depth} spacingM=${roundTrip.presetBack}`);

  // -------------------------------------------------------------------------
  // 6) 截图（1280×720）：3D 叠加 + 面板 DOM 各一张
  // -------------------------------------------------------------------------
  // 「飞到该路线」是 42 m 高的俯视 —— 断面、护壁、接口标记在那个高度全糊成一条线。
  // 出图压到三岔口边上 8.5 m 高斜着看，朝向按真的 look-at 反解（YXZ 下直接写 yaw 会看反，
  // 面板里那条注释就是这么来的）。
  const framed = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.active;
    const route = tool.routes.find((r) => r.id === "FrontCommunication" && r.kind === "trench");
    tool.Select(route.key, { fly: false });
    const plan = tool.TrenchPlan();
    const segment = plan.segments.find((s) => s.id === "FrontCommunication");
    const junction = plan.junctions.find((j) => j.members.some((m) => m.id === "FrontCommunication"));
    const Near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const station = segment.stations.reduce(
      (best, s) => (Near(s, junction) < Near(best, junction) ? s : best), segment.stations[0]);
    const eyeX = station.x + 13;
    const eyeZ = station.z + 13;
    const eyeY = tool.GroundAt(eyeX, eyeZ) + 8.5;
    const lookY = tool.GroundAt(station.x, station.z);
    const dx = station.x - eyeX;
    const dy = lookY - eyeY;
    const dz = station.z - eyeZ;
    const len = Math.hypot(dx, dy, dz) || 1;
    const fx = dx / len, fy = dy / len, fz = dz / len;
    const yaw = Math.atan2(-fx, -fz);
    const pitch = Math.asin(Math.max(-1, Math.min(1, fy)));
    T.camera.position.set(eyeX, eyeY, eyeZ);
    T.editor.flycam.yaw = yaw;
    T.editor.flycam.pitch = pitch;
    T.camera.rotation.set(pitch, yaw, 0, "YXZ");
    T.StepFrames(6, 1 / 60, true);

    // 「画出来了」不等于「看得见」：叠加层开/关各拍一次，数变了多少像素。
    // 再拍一次「开」当噪声底（TAA 每帧都在动），差值要比噪声底高一个数量级才算数。
    const source = T.renderer.domElement;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    const Shot = (visible) => {
      tool.group.visible = visible;
      T.StepFrames(5, 1 / 60, true);
      ctx.drawImage(source, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const on = Shot(true);
    const off = Shot(false);
    const again = Shot(true);
    const Differing = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 45) n += 1;
      }
      return n;
    };
    const overlayPixels = Differing(on, off);
    const noise = Differing(on, again);
    T.StepFrames(4, 1 / 60, true);
    return {
      overlayPixels, noise, total: canvas.width * canvas.height,
      at: { x: +station.x.toFixed(1), z: +station.z.toFixed(1) },
    };
  });
  Check("壕沟预览真的盖在屏幕上（叠加层开/关的像素差远高于噪声底）",
    framed.overlayPixels > 8000 && framed.overlayPixels > framed.noise * 10,
    `${framed.overlayPixels} px（噪声底 ${framed.noise} px，画面 ${framed.total} px）@ ${framed.at.x},${framed.at.z}`);
  await page.screenshot({ path: path.join(shotDir, "TrenchPreview.png") });
  await page.evaluate(() => document.getElementById("edRoot")?.classList.remove("off"));
  await page.evaluate(() => window.Taierzhuang.StepFrames(2, 1 / 60, true));
  await page.screenshot({ path: path.join(shotDir, "TrenchPanel.png") });
  await page.evaluate(() => document.getElementById("edRoot")?.classList.add("off"));
  for (const name of ["TrenchPreview.png", "TrenchPanel.png"]) {
    const stat = await fs.stat(path.join(shotDir, name));
    Check(`截图 ${name} 落盘`, stat.size > 20000, `${(stat.size / 1024).toFixed(0)} KB`);
  }

  // -------------------------------------------------------------------------
  // 7) 退出：overlay 摘干净；覆盖按现有纪律留着（建关读的是同一份）
  // -------------------------------------------------------------------------
  const closed = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const tool = T.editor.active;
    const group = tool.group;
    const geometries = group.children.filter((c) => c.geometry).length;
    const geoBefore = T.renderer.info.memory.geometries;
    T.editor.Close();
    T.StepFrames(4, 1 / 60, true);
    const { TrenchPreset } = await import("./Script_TrenchPlan.mjs");
    return {
      active: T.editor.ActiveId,
      inScene: !!group.parent,
      children: group.children.length,
      hadGeometries: geometries,
      geoBefore, geoAfter: T.renderer.info.memory.geometries,
      byName: !!T.scene.getObjectByName("SplineEditorOverlay"),
      assets: !!T.scene.getObjectByName("SplineEditorAssets"),
      // 与围墙 SetWallPresetOverride 同一条：退出不清覆盖，
      // 「重建关卡」才是覆盖生效的那一刻 —— 清掉就永远看不到自己调的数进了游戏。
      stillOverridden: TrenchPreset("communication").revetment.spacingM,
    };
  });
  Check("退出后 overlay 组从场景里摘掉且清空",
    !closed.active && !closed.inScene && closed.children === 0 && !closed.byName,
    `退出前挂着 ${closed.hadGeometries} 只几何`);
  Check("退出不泄漏几何", closed.geoAfter <= closed.geoBefore,
    `${closed.geoBefore} → ${closed.geoAfter}`);
  Check("退出保留覆盖（与围墙同一条纪律：建关读同一份）",
    closed.stillOverridden === 6.5, `spacingM=${closed.stillOverridden}`);

  // -------------------------------------------------------------------------
  // 8) 再开 + 「全部还原出厂」：规划层里不许留残渣
  // -------------------------------------------------------------------------
  const reverted = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const tool = T.editor.Open("splines");
    const { TrenchPreset, TrenchRevision, CompileTrenchNetwork } = await import("./Script_TrenchPlan.mjs");
    const { SampleMissionNaturalHeight } = await import("./Data_FirstLevelMissionTerrain.mjs");
    const restored = TrenchPreset("communication").revetment.spacingM;
    const restoredSeg = tool.routes.find((r) => r.id === "FrontCommunication" && r.kind === "trench")
      ?.trench?.widthScale;
    tool.RevertAll();
    const preset = TrenchPreset("communication");
    const plan = CompileTrenchNetwork(tool.TrenchNetwork(), { natural: SampleMissionNaturalHeight });
    const segment = plan.segments.find((s) => s.id === "FrontCommunication");
    const trenches = tool.routes.filter((r) => r.kind === "trench");
    T.editor.Close();
    return {
      restored, restoredSeg,
      spacing: preset.revetment.spacingM, bermH: preset.bermH,
      floorW: segment.nominal.floorW, depth: segment.nominal.depth,
      pushed: tool.trenchPushed.size,
      overrides: Object.keys(tool.overrides).length,
      presetEdits: Object.keys(tool.presetEdits).length,
      count: trenches.length,
      widthScale: trenches.find((r) => r.id === "FrontCommunication")?.trench?.widthScale,
      revision: TrenchRevision(),
    };
  });

  Check("刷新/重开后 localStorage 里的改动还在", reverted.restored === 6.5 && reverted.restoredSeg === 1.35,
    `spacingM=${reverted.restored} widthScale=${reverted.restoredSeg}`);
  Check("「全部还原出厂」把预设覆盖清回出厂值",
    reverted.spacing === FACTORY.revetment.spacingM && Math.abs(reverted.bermH - FACTORY.bermH) < 1e-9,
    `spacingM=${reverted.spacing}/${FACTORY.revetment.spacingM} bermH=${reverted.bermH}/${FACTORY.bermH}`);
  Check("「全部还原出厂」把段覆盖也清掉（规划层里不留残渣）",
    reverted.pushed === 0 && reverted.overrides === 0 && reverted.presetEdits === 0
    && Math.abs(reverted.floorW - FACTORY.floorW) < 1e-9
    && Math.abs(reverted.depth - FACTORY.depth) < 1e-9
    && reverted.widthScale === 1,
    `floorW=${reverted.floorW}/${FACTORY.floorW} depth=${reverted.depth}/${FACTORY.depth}`
    + ` 推给规划层的段覆盖 ${reverted.pushed} 个`);
  Check("还原之后仍然列得出七条沟", reverted.count === EXPECTED_SEGMENTS,
    `${reverted.count}/${EXPECTED_SEGMENTS}`);

  Check("没有脚本错误", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 条通过`);
if (failed.length) {
  for (const r of failed) console.log(`  FAIL ${r.name}${r.detail ? "  — " + r.detail : ""}`);
}
console.log(failed.length ? `TRENCH_EDITOR_TEST_FAIL count=${failed.length}`
  : `TRENCH_EDITOR_TEST_OK checks=${results.length}`);
process.exit(failed.length ? 1 : 0);
