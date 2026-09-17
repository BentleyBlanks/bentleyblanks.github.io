// ===========================================================================
// Script_OrchestrationMapTest.mjs —— 关卡编排俯视图（Script_EditorOrchestrationMap）的浏览器闸门
//
// 跑法：node Taierzhuang1938/Script_OrchestrationMapTest.mjs
//
// 这一层守的是「画出来的东西真的在画布上」。**数像素，不看 visible** ——
// 这个仓库吃过「刺刀装上了却 1 px 都看不见、16 项全绿照样漏过」的亏
// （docs 旧账）。所以每一条断言都落在 getImageData 数出来的精确 RGB 像素数上，
// oracle 是模块自己导出的 MAP_COLORS，不是本文件里另抄一份颜色。
//
// 被测页面是现造的：在 _shots/OrchestrationMap/ 下写一张临时 html，
// 直接 import 纯模型模块 + 本渲染模块，不进游戏主程序 —— 俯视图是零 three 的
// canvas 2D 模块，用整个引擎去测它只会把失败原因埋在三百行加载日志下面。
// ===========================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "OrchestrationMap");
const pageFile = path.join(shotDir, "_harness.html");

fs.mkdirSync(shotDir, { recursive: true });

// P1 的纯模型模块还没落地时，先把话说清楚再退出，别让失败显示成一句
// "Failed to fetch dynamically imported module"。
const modelModule = path.join(projectDir, "Script_MissionOrchestration.mjs");
if (!fs.existsSync(modelModule)) {
  console.error("缺少 Taierzhuang1938/Script_MissionOrchestration.mjs（P1 交付）：俯视图测试需要它建模型。");
  console.error("等该模块落地后重跑：node Taierzhuang1938/Script_OrchestrationMapTest.mjs");
  process.exit(2);
}

const HARNESS = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>OrchestrationMap harness</title>
<style>
  html, body { margin: 0; background: #121412; }
  #map { display: block; width: 1100px; height: 760px; }
</style>
</head>
<body>
<canvas id="map"></canvas>
<script>
  window.__bootError = null;
  window.addEventListener("error", (e) => { window.__bootError = String(e.message || e); });
</script>
<script type="module">
  import { BuildOrchestrationModel, PhaseLayout } from "../../Script_MissionOrchestration.mjs";
  import { OrchestrationMap, MAP_COLORS } from "../../Script_EditorOrchestrationMap.mjs";
  try {
    const canvas = document.getElementById("map");
    const model = BuildOrchestrationModel();
    const map = new OrchestrationMap(canvas, { model });
    const events = { select: [], hover: [], sketch: [], move: [] };
    map.onSelect((s) => events.select.push(s));
    map.onHover((s) => events.hover.push(s));
    map.onSketch((s) => events.sketch.push(s));
    map.onMove((m) => events.move.push(m));
    window.__model = model;
    window.__PhaseLayout = PhaseLayout;
    window.__COLORS = MAP_COLORS;
    window.__events = events;
    window.__map = map;

    // 数像素：一次 getImageData，顺手把「非底色像素」也数出来 —— 那是「这张图
    // 到底有没有内容」的粗闸，防止调色板对上了但整张图其实是空的。
    window.__Count = (names) => {
      const c = map.canvas;
      const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      const targets = names.map((n) => MAP_COLORS[n]);
      const counts = names.map(() => 0);
      const back = MAP_COLORS.backdrop;
      let ink = 0, sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r !== back[0] || g !== back[1] || b !== back[2]) ink += 1;
        sum = (sum + r * 3 + g * 5 + b * 7) % 2147483647;
        for (let k = 0; k < targets.length; k += 1) {
          const t = targets[k];
          if (r === t[0] && g === t[1] && b === t[2]) counts[k] += 1;
        }
      }
      const out = { ink, sum };
      names.forEach((n, i) => { out[n] = counts[i]; });
      return out;
    };
    window.__Mouse = (type, px, py, button = 0) => {
      const rect = map.canvas.getBoundingClientRect();
      map.canvas.dispatchEvent(new MouseEvent(type, {
        clientX: rect.left + px, clientY: rect.top + py, button, bubbles: true, cancelable: true,
      }));
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

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR ${String(e).slice(0, 300)}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  errors.push(`CONSOLE ${m.text().slice(0, 240)} @ ${m.location()?.url || ""}`);
});

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
function Info(name, detail = "") {
  console.log(`note ${name}${detail ? "  — " + detail : ""}`);
}
function SavePng(file, dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("data:image/png")) return 0;
  const buffer = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  fs.writeFileSync(path.join(shotDir, file), buffer);
  return buffer.length;
}

try {
  const url = `http://127.0.0.1:${port}/Taierzhuang1938/_shots/OrchestrationMap/_harness.html`;
  await page.goto(url, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.__ready || window.__bootError, null, { timeout: 120000 });
  const boot = await page.evaluate(() => window.__bootError);
  if (boot) throw new Error(`测试页没起来：${boot}`);

  // -------------------------------------------------------------------------
  // 0) 模型与画布：先确认拿到的是真模型、画布按 devicePixelRatio 铺开了
  // -------------------------------------------------------------------------
  const setup = await page.evaluate(() => {
    const map = window.__map;
    const model = window.__model;
    return {
      phases: model.phases?.length ?? 0,
      steps: model.steps?.length ?? 0,
      encounters: model.encounters?.length ?? 0,
      routes: Object.keys(model.routes || {}).length,
      anchors: Object.keys(model.anchors || {}).length,
      hasSampler: typeof model.layout?.SampleGroundColor === "function",
      blocks: model.layout?.blocks?.length ?? 0,
      dpr: map.dpr,
      cssW: map.cssWidth, cssH: map.cssHeight,
      pxW: map.canvas.width, pxH: map.canvas.height,
      ground: !!map.ground,
    };
  });
  Check("模型建起来了（18 阶段 / 27 步 / 有遭遇组）",
    setup.phases >= 18 && setup.steps >= 27 && setup.encounters > 0,
    `phases=${setup.phases} steps=${setup.steps} encounters=${setup.encounters} routes=${setup.routes} anchors=${setup.anchors}`);
  Check("画布按 devicePixelRatio 适配",
    setup.pxW === Math.round(setup.cssW * setup.dpr) && setup.pxH === Math.round(setup.cssH * setup.dpr),
    `${setup.cssW}x${setup.cssH} css → ${setup.pxW}x${setup.pxH} px @dpr ${setup.dpr}`);
  Check("地表色离屏缓存烘好了（SampleGroundColor 2 m 一格）",
    setup.hasSampler ? setup.ground === true : true,
    setup.hasSampler ? "已烘" : "模型没带采样器：按容错口径不画这一层");

  // -------------------------------------------------------------------------
  // 1) 各阶段数像素：敌人色随阶段变、路线色不为 0、整张图不是空的
  // -------------------------------------------------------------------------
  const phaseNumbers = (await page.evaluate(() => window.__model.phases.map((p) => p.number)));
  const perPhase = [];
  for (const number of phaseNumbers) {
    const row = await page.evaluate((n) => {
      const map = window.__map;
      map.SetPhase(n);
      // 数像素统一在「整关」视野下做，各阶段同一把尺子 —— 换了缩放再比计数，
      // 那是在比镜头，不是在比这一阶段场上有多少人。
      map.FitBounds();
      const counts = window.__Count(["enemyStaged", "enemyActive", "enemyDormant", "enemyPending", "route", "tactic", "friendly"]);
      // oracle 从模型来，不从画面来：这一阶段「在场」的人有几个、「还没出现」的
      // 有几个。像素数要跟着这两个数走，否则就是画了一层看不见的东西。
      let onField = 0, pending = 0;
      for (const encounter of map.phaseLayout.encounters || []) {
        const size = (encounter.members || []).length;
        if (encounter.state === "pending") pending += size;
        else if (encounter.state !== "cleared") onField += size;
      }
      map.FitPhase(n);                       // 出图用本阶段视野，看得清谁在哪
      return { n, onField, pending, ...counts, png: map.ToPng({ scale: 1 }) };
    }, number);
    const bytes = SavePng(`phase_${String(row.n).padStart(2, "0")}.png`, row.png);
    delete row.png;
    row.enemy = row.enemyStaged + row.enemyActive + row.enemyDormant;
    row.bytes = bytes;
    perPhase.push(row);
  }
  const blank = perPhase.filter((r) => r.ink < 20000);
  Check("每个阶段都画出了内容（非底色像素 > 20000）", blank.length === 0,
    blank.length ? `空的：${blank.map((r) => r.n).join(",")}` : `最少 ${Math.min(...perPhase.map((r) => r.ink))} px`);

  // 模型说这一阶段场上有人，画面上就必须数得出对应颜色的像素；模型说一个都没有，
  // 就一个像素都不许有。这一条比「> 0」硬得多 —— 它咬住的是「模型 ↔ 画面」。
  const enemyMismatch = perPhase.filter((r) => (r.onField > 0) !== (r.enemy > 0));
  Check("敌人像素与模型「场上有几个人」一一对上", enemyMismatch.length === 0,
    enemyMismatch.length
      ? enemyMismatch.map((r) => `阶段${r.n} 在场${r.onField}人 但 ${r.enemy}px`).join("；")
      : perPhase.map((r) => `${r.n}:${r.onField}人/${r.enemy}px`).join(" "));
  const pendingMismatch = perPhase.filter((r) => (r.pending > 0) !== (r.enemyPending > 0));
  Check("未出现的组画成空心灰，且与模型的 pending 人数对得上", pendingMismatch.length === 0,
    pendingMismatch.length
      ? pendingMismatch.map((r) => `阶段${r.n} pending${r.pending}人 但 ${r.enemyPending}px`).join("；")
      : `最多 ${Math.max(...perPhase.map((r) => r.enemyPending))} px`);
  const distinctEnemy = new Set(perPhase.map((r) => r.enemy));
  Check("敌人色像素随阶段变化", distinctEnemy.size >= 6,
    `${distinctEnemy.size} 种不同的计数`);

  const withRoute = perPhase.filter((r) => r.route > 0);
  Check("路线色像素不为 0", withRoute.length === perPhase.length,
    `最少 ${Math.min(...perPhase.map((r) => r.route))} px`);
  Info("tactic/friendly 像素",
    `tactic 最多 ${Math.max(...perPhase.map((r) => r.tactic))}，friendly 最多 ${Math.max(...perPhase.map((r) => r.friendly))}`);

  // -------------------------------------------------------------------------
  // 2) 阶段 12 有 transfer 组、阶段 3 没有 —— 结构与像素两头对
  // -------------------------------------------------------------------------
  const transfer = await page.evaluate(() => {
    const PhaseLayout = window.__PhaseLayout;
    const model = window.__model;
    const At = (n) => {
      const layout = PhaseLayout(model, n);
      const found = (layout.encounters || []).find((e) => e.id === "transfer");
      return found ? found.state : null;
    };
    let firstLive = null;
    for (const p of model.phases) {
      const state = At(p.number);
      if (state && state !== "pending" && firstLive === null) firstLive = p.number;
    }
    return { at3: At(3), at12: At(12), firstLive };
  });
  const p3 = perPhase.find((r) => r.n === 3);
  const p12 = perPhase.find((r) => r.n === 12);
  Check("阶段 3 的 transfer 组还没出现", transfer.at3 === "pending",
    `state=${transfer.at3}，首次非 pending 在阶段 ${transfer.firstLive}`);
  Check("阶段 12 的 transfer 组已经在场", !!transfer.at12 && transfer.at12 !== "pending",
    `state=${transfer.at12}`);
  Check("两个阶段的敌人像素数不一样（画面真的跟着变）",
    !!p3 && !!p12 && p3.enemy !== p12.enemy,
    `阶段3 ${p3?.enemy} px vs 阶段12 ${p12?.enemy} px`);

  // -------------------------------------------------------------------------
  // 3) PickAt：点得中 VillageGunner (43, 8)
  // -------------------------------------------------------------------------
  const pick = await page.evaluate(() => {
    const map = window.__map;
    const model = window.__model;
    let truth = null;
    for (const encounter of model.encounters || []) {
      for (const member of encounter.members || []) {
        if (member.id === "VillageGunner") truth = { x: member.x, z: member.z, encounter: encounter.id };
      }
    }
    const hits = [];
    for (const phase of model.phases) {
      map.SetPhase(phase.number);
      map.ZoomTo({ x: 43, z: 8 }, 40);
      const screen = map.WorldToScreen(43, 8);
      const sel = map.PickAt(screen.x, screen.y);
      if (sel && sel.id === "VillageGunner") hits.push({ phase: phase.number, sel, screen });
      // 空地上点一下必须什么也点不到 —— 否则 PickAt 就是个「永远返回最近的东西」
      const far = map.PickAt(screen.x + 260, screen.y + 240);
      if (hits.length && far && far.id === "VillageGunner") hits[hits.length - 1].leaky = true;
    }
    return { truth, hits: hits.slice(0, 4), count: hits.length, leaky: hits.some((h) => h.leaky) };
  });
  Check("模型里 VillageGunner 就在 (43, 8)",
    !!pick.truth && pick.truth.x === 43 && pick.truth.z === 8,
    pick.truth ? `${pick.truth.encounter} 组 @ (${pick.truth.x}, ${pick.truth.z})` : "没找到这个人");
  Check("PickAt 点得中 VillageGunner", pick.count > 0 && pick.hits[0]?.sel?.kind === "member",
    `${pick.count} 个阶段命中；首个 = 阶段 ${pick.hits[0]?.phase}，encounterId=${pick.hits[0]?.sel?.encounterId}`);
  Check("点空地点不到人（不是「永远返回最近的」）", !pick.leaky);

  // -------------------------------------------------------------------------
  // 3b) 组把手与拍把手：点得到「一整组」和「一拍」，且不许挡住人
  // -------------------------------------------------------------------------
  const chips = await page.evaluate(() => {
    const map = window.__map;
    map.SetTool("select");
    map.SetSelection(null);
    map.SetHover(null);
    map.SetPhase(12);
    map.FitPhase(12);
    const layout = map.phaseLayout;
    const transfer = (layout.encounters || []).find((entry) => entry.id === "transfer");
    const group = map.HandlePoint("encounter", "transfer");
    const beat = map.HandlePoint("beat", "transferFlank");
    const groupSel = group ? map.PickAt(group.x, group.y) : null;
    const beatSel = beat ? map.PickAt(beat.x, beat.y) : null;
    // 把手不许遮住人：这一组每个成员在自己的屏幕位置上仍然点得中「人」。
    const members = (transfer?.members || []).map((member) => {
      const screen = map.WorldToScreen(member.x, member.z);
      const hit = map.PickAt(screen.x, screen.y);
      return { id: member.id, hit: hit ? `${hit.kind}:${hit.id}` : "null" };
    });
    const withChips = window.__Count(["handle"]).handle;
    map.SetLayers({ encounters: false, zones: false });
    const noChips = window.__Count(["handle"]).handle;
    map.SetLayers({ encounters: true, zones: true });
    const hoverBefore = window.__events.hover.length;
    window.__Mouse("mousemove", group.x, group.y);
    const hovered = map.hover;
    const hoverAdded = window.__events.hover.length - hoverBefore;
    map.SetSelection({ kind: "encounter", id: "transfer" });
    const selectPx = window.__Count(["select"]).select;
    map.SetSelection(null);
    window.__Mouse("mousemove", beat.x, beat.y);
    const hoveredBeat = map.hover;
    map.SetSelection({ kind: "beat", id: "transferFlank" });
    const beatSelectPx = window.__Count(["select"]).select;
    map.SetSelection(null);
    map.SetHover(null);
    // 已清除的组不给把手：第 12 阶段这样的组有十来个，遍布全关。
    const clearedIds = (layout.encounters || []).filter((entry) => entry.state === "cleared").map((entry) => entry.id);
    const clearedHandles = clearedIds.filter((id) => !!map.HandlePoint("encounter", id));
    return {
      group, beat, groupSel, beatSel, members, withChips, noChips, hovered, hoverAdded, selectPx,
      hoveredBeat, beatSelectPx,
      clearedCount: clearedIds.length, clearedHandles,
      kinds: [...new Set(map.handles.map((entry) => entry.kind))],
      png: map.ToPng({ scale: 1 }),
    };
  });
  SavePng("handles_phase12.png", chips.png);
  delete chips.png;
  Check("点组把手拿到整组（kind=encounter）",
    chips.groupSel?.kind === "encounter" && chips.groupSel?.id === "transfer",
    `把手 @ (${chips.group?.x?.toFixed(0)}, ${chips.group?.y?.toFixed(0)}) → ${JSON.stringify(chips.groupSel)}`);
  Check("点转运拍的标签拿到那一拍（kind=beat）",
    chips.beatSel?.kind === "beat" && chips.beatSel?.id === "transferFlank",
    `把手 @ (${chips.beat?.x?.toFixed(0)}, ${chips.beat?.y?.toFixed(0)}) → ${JSON.stringify(chips.beatSel)}`);
  Check("组把手不遮住成员（每个成员仍点得中人）",
    chips.members.length > 0 && chips.members.every((row) => row.hit.startsWith("member:")),
    chips.members.map((row) => `${row.id}→${row.hit}`).join(" "));
  Check("把手芯片真的画在画布上（关掉敌军与触发区两层就归零）",
    chips.withChips > 0 && chips.noChips === 0, `${chips.withChips} px → ${chips.noChips} px`);
  Check("悬停到组把手给出 encounter sel（tooltip 走同一条路）",
    chips.hovered?.kind === "encounter" && chips.hovered?.id === "transfer" && chips.hoverAdded >= 1,
    JSON.stringify(chips.hovered));
  Check("选中一整组时整组成员被描亮", chips.selectPx > 0, `${chips.selectPx} px 高亮色`);
  Check("悬停 / 选中一拍也走同一条路（tooltip + 描亮那一撮人）",
    chips.hoveredBeat?.kind === "beat" && chips.hoveredBeat?.id === "transferFlank" && chips.beatSelectPx > 0,
    `${JSON.stringify(chips.hoveredBeat)}，描亮 ${chips.beatSelectPx} px`);
  Check("已清除的组不长把手", chips.clearedCount > 0 && chips.clearedHandles.length === 0,
    `已清除 ${chips.clearedCount} 组，把手种类 ${chips.kinds.join("/")}`);

  // -------------------------------------------------------------------------
  // 4) ToPng：PNG dataURL 且 > 10 KB
  // -------------------------------------------------------------------------
  const png = await page.evaluate(() => {
    const map = window.__map;
    map.SetPhase(12);
    map.FitBounds();
    const full = map.ToPng({ scale: 1 });
    const region = map.ToPng({ scale: 1, region: { minX: 20, maxX: 120, minZ: -20, maxZ: 60 } });
    return { full, region, fullLen: full.length, regionLen: region.length };
  });
  SavePng("topng_full.png", png.full);
  SavePng("topng_region.png", png.region);
  Check("ToPng 返回 PNG dataURL 且 > 10 KB",
    png.full.startsWith("data:image/png") && png.fullLen > 10 * 1024,
    `${(png.fullLen / 1024).toFixed(0)} KB（dataURL 长度）`);
  Check("ToPng 带 region 也出图",
    png.region.startsWith("data:image/png") && png.regionLen > 10 * 1024 && png.regionLen !== png.fullLen,
    `${(png.regionLen / 1024).toFixed(0)} KB`);

  // -------------------------------------------------------------------------
  // 5) 工具：circle 拖出圆 → onSketch；move 拖成员 → onMove（且不改模型）
  // -------------------------------------------------------------------------
  const circle = await page.evaluate(() => {
    const map = window.__map;
    map.SetPhase(12);
    map.FitBounds();
    map.SetTool("circle");
    const a = map.WorldToScreen(40, 20);
    const before = window.__events.sketch.length;
    window.__Mouse("mousedown", a.x, a.y);
    window.__Mouse("mousemove", a.x + 36, a.y + 12);
    const mid = window.__Count(["sketch"]).sketch;    // 拖的过程中就该看得见预览
    window.__Mouse("mouseup", a.x + 36, a.y + 12);
    const shape = window.__events.sketch[window.__events.sketch.length - 1];
    return { added: window.__events.sketch.length - before, shape, previewPx: mid };
  });
  Check("circle 工具拖一下 → onSketch 收到 circle",
    circle.added === 1 && circle.shape?.type === "circle" && circle.shape.r > 0,
    `r=${circle.shape?.r?.toFixed(1)} m @ (${circle.shape?.x?.toFixed(1)}, ${circle.shape?.z?.toFixed(1)})`);
  Check("拖动过程中画布上真的有草图像素", circle.previewPx > 0, `${circle.previewPx} px`);

  const sketchDrawn = await page.evaluate(() => {
    const map = window.__map;
    const shape = window.__events.sketch[window.__events.sketch.length - 1];
    map.SetSketch([shape, { type: "arrow", from: { x: 0, z: 0 }, to: { x: 60, z: 40 } },
      { type: "label", x: -20, z: 10, text: "这里太早" },
      { type: "ghost", x: 50, z: 25, memberId: "VillageGunner" }]);
    return window.__Count(["sketch"]).sketch;
  });
  Check("SetSketch 的四种草图都画在画布上", sketchDrawn > 0, `${sketchDrawn} px`);

  const move = await page.evaluate(() => {
    const map = window.__map;
    const model = window.__model;
    const Truth = () => {
      for (const encounter of model.encounters || []) {
        for (const member of encounter.members || []) {
          if (member.id === "VillageGunner") return { x: member.x, z: member.z };
        }
      }
      return null;
    };
    const before = Truth();
    // 先选中，再换 move 工具拖出候选位。
    let phase = null;
    for (const p of model.phases) {
      map.SetPhase(p.number);
      map.ZoomTo({ x: 43, z: 8 }, 40);
      const screen = map.WorldToScreen(43, 8);
      if (map.PickAt(screen.x, screen.y)?.id === "VillageGunner") { phase = p.number; break; }
    }
    map.SetTool("select");
    const screen = map.WorldToScreen(43, 8);
    window.__Mouse("mousedown", screen.x, screen.y);
    window.__Mouse("mouseup", screen.x, screen.y);
    const selected = map.selection;
    map.SetTool("move");
    const moves = window.__events.move.length;
    window.__Mouse("mousedown", screen.x, screen.y);
    window.__Mouse("mousemove", screen.x + 40, screen.y - 25);
    window.__Mouse("mouseup", screen.x + 40, screen.y - 25);
    const payload = window.__events.move[window.__events.move.length - 1];
    return { phase, selected, added: window.__events.move.length - moves, payload, before, after: Truth() };
  });
  Check("select 工具点中成员并回调 onSelect",
    move.selected?.kind === "member" && move.selected?.id === "VillageGunner",
    `sel=${JSON.stringify(move.selected)}`);
  Check("move 工具拖成员 → onMove 带出候选位",
    move.added === 1 && move.payload?.target?.id === "VillageGunner"
    && Number.isFinite(move.payload?.to?.x) && Number.isFinite(move.payload?.to?.z),
    `to=(${move.payload?.to?.x?.toFixed(1)}, ${move.payload?.to?.z?.toFixed(1)})`);
  Check("move 只回调、不改模型",
    move.before && move.after && move.before.x === move.after.x && move.before.z === move.after.z,
    `模型里仍是 (${move.after?.x}, ${move.after?.z})`);

  // -------------------------------------------------------------------------
  // 6) 悬停与选中：画面真的变了（不是只改了内部字段）
  // -------------------------------------------------------------------------
  const hover = await page.evaluate(() => {
    const map = window.__map;
    map.SetTool("select");
    map.SetSelection(null);
    map.SetHover(null);
    map.ZoomTo({ x: 43, z: 8 }, 40);
    const base = window.__Count([]).sum;
    const screen = map.WorldToScreen(43, 8);
    const before = window.__events.hover.length;
    window.__Mouse("mousemove", screen.x, screen.y);
    const hovered = window.__Count([]).sum;
    const sel = map.hover;
    map.SetSelection({ kind: "member", id: "VillageGunner", x: 43, z: 8 });
    const selected = window.__Count(["select"]);
    return {
      sel, added: window.__events.hover.length - before,
      changedOnHover: base !== hovered, selectPx: selected.select, changedOnSelect: hovered !== selected.sum,
    };
  });
  Check("悬停回调给出成员 sel", hover.sel?.id === "VillageGunner" && hover.added >= 1,
    `hover=${JSON.stringify(hover.sel)}`);
  Check("悬停 tooltip 画在画布上（像素变了）", hover.changedOnHover);
  Check("选中描亮画在画布上", hover.selectPx > 0 && hover.changedOnSelect, `${hover.selectPx} px 高亮色`);

  // -------------------------------------------------------------------------
  // 7) 缩放与平移：滚轮以鼠标为中心，右键拖动平移
  // -------------------------------------------------------------------------
  const nav = await page.evaluate(() => {
    const map = window.__map;
    map.FitBounds();
    const at = { x: 260, y: 200 };
    const anchorBefore = map.ScreenToWorld(at.x, at.y);
    const scaleBefore = map.view.scale;
    const rect = map.canvas.getBoundingClientRect();
    map.canvas.dispatchEvent(new WheelEvent("wheel", {
      clientX: rect.left + at.x, clientY: rect.top + at.y, deltaY: -300, bubbles: true, cancelable: true,
    }));
    const anchorAfter = map.ScreenToWorld(at.x, at.y);
    const scaleAfter = map.view.scale;

    const touchedByWheel = map.viewTouched;

    const cx = map.view.cx, cz = map.view.cz;
    window.__Mouse("mousedown", 400, 400, 2);
    window.__Mouse("mousemove", 460, 430, 2);
    window.__Mouse("mouseup", 460, 430, 2);
    const touchedByPan = map.viewTouched;
    map.FitBounds();
    return {
      zoomed: scaleAfter > scaleBefore * 1.2,
      drift: Math.hypot(anchorAfter.x - anchorBefore.x, anchorAfter.z - anchorBefore.z),
      panned: Math.hypot(map.view.cx - cx, map.view.cz - cz),
      touchedByWheel, touchedByPan, autoAfterFit: map.viewTouched,
    };
  });
  Check("滚轮放大", nav.zoomed);
  Check("滚轮以鼠标为中心（光标下那一点不动）", nav.drift < 0.05, `漂移 ${nav.drift.toFixed(4)} m`);
  Check("右键拖动平移", nav.panned > 1, `平移 ${nav.panned.toFixed(1)} m`);
  // 手动动过的视野要能被认出来 —— 跟随实时就是靠这个标记决定抢不抢镜头。
  Check("滚轮/拖动把视野标记成「手动」，Fit* 复位成「自动」",
    nav.touchedByWheel === true && nav.touchedByPan === true && nav.autoAfterFit === false,
    `wheel=${nav.touchedByWheel} pan=${nav.touchedByPan} fit=${nav.autoAfterFit}`);

  // -------------------------------------------------------------------------
  // 8) 图层开关：关掉一层，对应颜色的像素就得归零
  // -------------------------------------------------------------------------
  const layers = await page.evaluate(() => {
    const map = window.__map;
    map.SetPhase(12);
    map.FitBounds();
    const on = window.__Count(["route", "enemyStaged", "enemyActive"]);
    map.SetLayers({ routes: false });
    const noRoutes = window.__Count(["route", "enemyStaged", "enemyActive"]);
    map.SetLayers({ encounters: false });
    const noEnemies = window.__Count(["route", "enemyStaged", "enemyActive"]);
    map.SetLayers({ routes: true, encounters: true });
    const back = window.__Count(["route", "enemyStaged", "enemyActive"]);
    return { on, noRoutes, noEnemies, back };
  });
  Check("关掉 routes 层后路线像素归零",
    layers.on.route > 0 && layers.noRoutes.route === 0,
    `${layers.on.route} → 0`);
  Check("关掉 encounters 层后敌人像素归零",
    layers.noEnemies.enemyStaged + layers.noEnemies.enemyActive === 0,
    `${layers.on.enemyStaged + layers.on.enemyActive} → 0`);
  Check("开回来还是原样", layers.back.route === layers.on.route
    && layers.back.enemyStaged === layers.on.enemyStaged);

  // -------------------------------------------------------------------------
  // 9) live 层：玩家黄三角、死者灰叉
  // -------------------------------------------------------------------------
  const live = await page.evaluate(() => {
    const map = window.__map;
    map.SetPhase(12);
    map.ZoomTo({ x: 100, z: 100 }, 60);
    const before = window.__Count(["player", "liveEnemy", "liveDead"]);
    map.SetLive({
      player: { x: 100, z: 100, yaw: 0.6 },
      enemies: [
        { id: "TransferRifleA", alive: true, encounter: "transfer", x: 106, z: 96 },
        { id: "TransferRifleB", alive: false, encounter: "transfer", x: 110, z: 108 },
      ],
      guideRoute: [{ x: 90, z: 120 }, { x: 100, z: 104 }, { x: 116, z: 92 }],
    });
    const after = window.__Count(["player", "liveEnemy", "guide"]);
    map.SetLive(null);
    const cleared = window.__Count(["player"]);
    return { before, after, cleared };
  });
  Check("live 层画出玩家三角", live.before.player === 0 && live.after.player > 0, `${live.after.player} px`);
  Check("live 层画出实际敌人位置与 guideRoute",
    live.after.liveEnemy > 0 && live.after.guide > 0,
    `敌人 ${live.after.liveEnemy} px / 指引 ${live.after.guide} px`);
  Check("SetLive(null) 之后 live 层收干净", live.cleared.player === 0);

  // -------------------------------------------------------------------------
  // 10) Dispose：再派发事件不再触发任何回调
  // -------------------------------------------------------------------------
  const disposed = await page.evaluate(() => {
    const map = window.__map;
    map.SetTool("circle");
    const counts = {
      select: window.__events.select.length,
      hover: window.__events.hover.length,
      sketch: window.__events.sketch.length,
      move: window.__events.move.length,
    };
    map.Dispose();
    const a = map.WorldToScreen(40, 20);
    window.__Mouse("mousedown", a.x, a.y);
    window.__Mouse("mousemove", a.x + 30, a.y + 30);
    window.__Mouse("mouseup", a.x + 30, a.y + 30);
    map.SetTool("select");
    window.__Mouse("mousedown", a.x, a.y);
    window.__Mouse("mouseup", a.x, a.y);
    map.canvas.dispatchEvent(new WheelEvent("wheel", { clientX: 10, clientY: 10, deltaY: -200, bubbles: true }));
    let threw = null;
    try { map.Redraw(); map.SetPhase(4); } catch (error) { threw = String(error); }
    return {
      after: {
        select: window.__events.select.length,
        hover: window.__events.hover.length,
        sketch: window.__events.sketch.length,
        move: window.__events.move.length,
      },
      counts, threw, flag: map.disposed,
    };
  });
  const quiet = ["select", "hover", "sketch", "move"].every((k) => disposed.after[k] === disposed.counts[k]);
  Check("Dispose 后再派发事件不再触发回调", quiet,
    `select ${disposed.counts.select}→${disposed.after.select}, sketch ${disposed.counts.sketch}→${disposed.after.sketch}, `
    + `move ${disposed.counts.move}→${disposed.after.move}, hover ${disposed.counts.hover}→${disposed.after.hover}`);
  Check("Dispose 后调 Redraw/SetPhase 不抛错", disposed.threw === null && disposed.flag === true, disposed.threw || "");

  Check("没有脚本错误", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  try { fs.unlinkSync(pageFile); } catch (error) { /* 临时页留不留都行 */ }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n截图：${path.relative(rootDir, shotDir)}`);
console.log(`${results.length - failed.length}/${results.length} 条通过`);
if (failed.length) {
  for (const r of failed) console.log(`  FAIL ${r.name}${r.detail ? "  — " + r.detail : ""}`);
  process.exitCode = 1;
}
