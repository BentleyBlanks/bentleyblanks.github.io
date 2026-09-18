// ===========================================================================
// Script_OrchestrationMapTest.mjs —— 关卡编排俯视图（Script_EditorOrchestrationMap）的浏览器闸门
//
// 跑法：node Taierzhuang1938/Script_OrchestrationMapTest.mjs
//
// 这一层守的是「画出来的东西真的在画布上」。**数像素，不看 visible** ——
// 这个仓库吃过「刺刀装上了却 1 px 都看不见、16 项全绿照样漏过」的亏
// （docs 旧账）。所以每一条断言都落在 getImageData 数出来的像素数上，
// oracle 是模块自己导出的 MAP_COLORS，不是本文件里另抄一份颜色。
//
// 标记改成图标以后，`__Count` 一次数两种：
//   `X`      —— 与目标色**每个通道差 ≤ 24** 的像素。图标缩到 14 px 又带抗锯齿，
//                细线图标的边缘全是混出来的中间色，只认精确 RGB 会抖。
//   `XExact` —— 精确等于目标色的像素。
// 「画出来了吗」用前者（宽容地找墨），「关掉之后归零了吗」必须用后者 ——
// 因为容差 24 会把好些颜色糊到一起：handle #1e2227 与底色 #101314 差 (14,15,19)、
// legendBack #0d1011 与底色差 (3,3,3)，拿容差去问「是不是 0」，整片底色都会算进去，
// 那不是放宽是失效。两侧各用各的尺子，没有一条老断言因此变松。
//
// 图标一定要 `await map.ready` 再量：加载完成前画的是兜底几何标记，
// 那时候数出来的是另一套画法的像素。
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
  import { OrchestrationMap, MAP_COLORS, LoadedIconNames, MapIconForMember } from "../../Script_EditorOrchestrationMap.mjs";
  import { ORCHESTRATION_ICONS, ICON_ORDER } from "../../Data_OrchestrationIcons.mjs";
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
    window.__LoadedIcons = () => LoadedIconNames();
    window.__ICON_ORDER = ICON_ORDER;
    window.__ICON_FILES = Object.fromEntries(ICON_ORDER.map((n) => [n, ORCHESTRATION_ICONS[n].file]));
    // 图上用哪张图标的口径就问地图这一层 —— 它在登记表的规则上还拧了一处
    // （上刺刀那张细长的枪在 14 px 下认不出，图上画步枪兵 + 刺刀角标）。
    window.__MapIcon = MapIconForMember;

    // 数像素：一次 getImageData，顺手把「非底色像素」也数出来 —— 那是「这张图
    // 到底有没有内容」的粗闸，防止调色板对上了但整张图其实是空的。
    // 每个颜色同时给「容差 24 的墨量」与「精确 RGB 的墨量」，用法见文件头。
    const TOL = 24;
    window.__Count = (names) => {
      const c = map.canvas;
      const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      const targets = names.map((n) => MAP_COLORS[n]);
      const near = names.map(() => 0);
      const exact = names.map(() => 0);
      const back = MAP_COLORS.backdrop;
      let ink = 0, sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r !== back[0] || g !== back[1] || b !== back[2]) ink += 1;
        sum = (sum + r * 3 + g * 5 + b * 7) % 2147483647;
        for (let k = 0; k < targets.length; k += 1) {
          const t = targets[k];
          const dr = r - t[0], dg = g - t[1], db = b - t[2];
          if (dr === 0 && dg === 0 && db === 0) { exact[k] += 1; near[k] += 1; continue; }
          if (dr <= TOL && dr >= -TOL && dg <= TOL && dg >= -TOL && db <= TOL && db >= -TOL) near[k] += 1;
        }
      }
      const out = { ink, sum };
      names.forEach((n, i) => { out[n] = near[i]; out[n + "Exact"] = exact[i]; });
      return out;
    };
    // 只数画布上某一块里的精确像素。
    //
    // 由头：图标的深色描边压在暗地表上，抗锯齿会混出一枚正好等于图例底色
    // #0d1011 的像素（实测三枚，全在地图中间，离图例十万八千里）。拿全画布去问
    // 「图例关掉之后是不是 0」，答案就被这种噪点左右。图例画在哪儿是定死的，
    // 那就去那块地方数 —— 问的还是同一件事，而且问得更准。
    window.__CountRect = (name, rect) => {
      const c = map.canvas;
      const w = c.width;
      const d = map.dpr;
      const x0 = Math.max(0, Math.floor(rect.x * d)), x1 = Math.min(w, Math.ceil((rect.x + rect.w) * d));
      const y0 = Math.max(0, Math.floor(rect.y * d)), y1 = Math.min(c.height, Math.ceil((rect.y + rect.h) * d));
      if (x1 <= x0 || y1 <= y0) return 0;
      const data = c.getContext("2d").getImageData(x0, y0, x1 - x0, y1 - y0).data;
      const t = MAP_COLORS[name];
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === t[0] && data[i + 1] === t[1] && data[i + 2] === t[2]) n += 1;
      }
      return n;
    };
    // 图例占的那条竖带（css 像素）。图例永远贴着画布左下角画。
    window.__LegendRect = () => ({ x: 24, y: 0, w: 200, h: map.cssHeight });
    // 「这几个像素到底在哪儿」。数像素的断言一旦红了，光知道「多了 3 个」没法查，
    // 得能指着画布说出坐标 —— 抗锯齿混出来的假阳性和真漏画，位置一看就分得开。
    window.__Where = (name, limit = 8) => {
      const c = map.canvas;
      const w = c.width;
      const data = c.getContext("2d").getImageData(0, 0, w, c.height).data;
      const t = MAP_COLORS[name];
      const out = [];
      for (let i = 0; i < data.length && out.length < limit; i += 4) {
        if (data[i] === t[0] && data[i + 1] === t[1] && data[i + 2] === t[2]) {
          const px = (i / 4) % w, py = Math.floor((i / 4) / w);
          out.push(Math.round(px / map.dpr) + "," + Math.round(py / map.dpr));
        }
      }
      return out;
    };
    // 图例里每一行都用真颜色画（它就是干这个的），于是「关掉某层，那个颜色就得
    // 归零」这类断言必须先把图例收起来数，否则数到的是图例自己那几个像素。
    window.__CountMap = (names) => {
      const was = map.layers.legend;
      if (was) map.SetLayers({ legend: false });
      const out = window.__Count(names);
      if (was) map.SetLayers({ legend: true });
      return out;
    };
    // 标签矩形两两不许相交 —— 「文字互相压」是这一版要治的头号毛病。
    window.__LabelOverlap = () => {
      const list = map.placedLabels || [];
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i], b = list[j];
          if (!(a.x > b.x + b.w || a.x + a.w < b.x || a.y > b.y + b.h || a.y + a.h < b.y)) {
            return { a: a.text, b: b.text, ax: a.x, ay: a.y, bx: b.x, by: b.y };
          }
        }
      }
      return null;
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
  // 图标到齐再开始量。没有这一步，前几节量到的是「图还没加载好」的兜底画法。
  await page.evaluate(async () => { await window.__map.ready; return true; });

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
  // 0b) 图标：二十三张 PNG 都到位了，而且真的画到了每个敌人身上
  // -------------------------------------------------------------------------
  const icons = await page.evaluate(() => {
    const map = window.__map;
    map.SetFilter(null);
    map.SetLayers({
      terrain: true, blocks: true, trenches: true, roads: true, anchors: true,
      routes: true, zones: true, friendlies: true, encounters: true, tactics: true,
      live: true, notes: true, labels: true, legend: true,
    });
    map.SetPhase(12);
    map.FitBounds();
    // 这一节查的是「每一个人画对没有」，所以先把合并关掉逐个看 ——
    // 开着合并的话整关视野下大半的人会并进簇标记里，等于只抽查了几个。
    map.SetClusterGap(0);
    const loaded = window.__LoadedIcons();
    const marks = map.drawnMarkers || [];
    const members = marks.filter((entry) => entry.kind === "member");
    // 每个敌人都得有图标名，而且那张名字对应的 PNG 真的加载上了。
    const broken = members.filter((entry) => !entry.icon || !loaded.includes(entry.icon));
    // 图标要跟着「他是干什么的」走：机枪手画机枪、飞机画飞机；
    // 上刺刀的画步枪兵（刺刀走角标，那张细长的枪在 14 px 下认不出）。
    const wrong = [];
    let bayonetMen = 0;
    for (const encounter of map.phaseLayout.encounters || []) {
      for (const member of encounter.members || []) {
        const drawn = members.find((entry) => entry.id === member.id);
        if (!drawn) continue;
        if (member.bayonet) bayonetMen += 1;
        const want = window.__MapIcon(member, encounter.state, encounter.id);
        if (drawn.icon !== want) wrong.push(`${member.id} 画成 ${drawn.icon}，该是 ${want}`);
      }
    }
    const totalMembers = (map.phaseLayout.encounters || [])
      .reduce((n, e) => n + (e.members || []).length, 0);
    map.SetClusterGap(null);
    return {
      loaded: loaded.length, all: window.__ICON_ORDER.length,
      missing: window.__ICON_ORDER.filter((n) => !loaded.includes(n)),
      marks: marks.length, members: members.length, broken: broken.slice(0, 4),
      kinds: [...new Set(marks.map((entry) => entry.kind))].sort(),
      used: [...new Set(members.map((entry) => entry.icon))].sort(),
      wrong: wrong.slice(0, 4), bayonetMen, totalMembers,
      sheet: map.IconSheetPng({}),
    };
  });
  const sheetBytes = SavePng("icons_sheet.png", icons.sheet);
  delete icons.sheet;
  Check("二十三张图标 PNG 全部加载成功", icons.loaded === icons.all && icons.missing.length === 0,
    icons.missing.length ? `没加载上：${icons.missing.join(",")}` : `${icons.loaded} 张`);
  Check("drawnMarkers 报得出本帧画了什么", icons.marks > 0 && icons.members > 0,
    `${icons.marks} 个标记，其中敌人 ${icons.members} 个；种类 ${icons.kinds.join("/")}`);
  Check("每个敌人都带一个已加载的图标名", icons.broken.length === 0,
    icons.broken.length ? icons.broken.map((b) => `${b.id}:${b.icon}`).join("；") : `用到 ${icons.used.join("、")}`);
  Check("关掉合并时每个敌人都单画一枚", icons.members === icons.totalMembers,
    `${icons.members} / ${icons.totalMembers} 人`);
  Check("图标按「他是干什么的」选（机枪 / 守点 / 飞机）", icons.wrong.length === 0,
    icons.wrong.join("；") || "全部与地图口径一致");
  Check("上刺刀的兵画步枪兵图标（刺刀退成放大后才出现的角标）",
    icons.bayonetMen > 0 && !icons.used.includes("Bayonet"),
    `${icons.bayonetMen} 个上了刺刀的兵，图上用到的图标：${icons.used.join("、")}`);
  Info("图标总表", `_shots/OrchestrationMap/icons_sheet.png，${(sheetBytes / 1024).toFixed(0)} KB`);

  // 图例里那一列示意图就是地图上的同一张图标 —— 把所有标记层关掉，只留图例，
  // 敌人色/友军色的像素必须还在；再把图例也关掉，就该一个都不剩。
  const legendIcons = await page.evaluate(() => {
    const map = window.__map;
    map.SetHover(null);
    const markerLayers = {
      encounters: false, friendlies: false, anchors: false, zones: false,
      routes: false, notes: false, live: false, tactics: false,
    };
    map.SetLayers({ ...markerLayers, legend: true });
    map.SetLegendOpen(true);
    const open = window.__Count(["enemyStaged", "enemyActive", "friendly", "note", "anchor"]);
    map.SetLayers({ legend: false });
    const off = window.__Count(["enemyStaged", "enemyActive", "friendly", "note", "anchor"]);
    map.SetLegendOpen(false);
    map.SetLayers({
      encounters: true, friendlies: true, anchors: true, zones: true,
      routes: true, notes: true, live: true, tactics: true, legend: true,
    });
    return { open, off };
  });
  Check("图例里的图标真的画出来了（关掉全部标记层，图例那一列还有像素）",
    legendIcons.open.enemyStagedExact > 0 && legendIcons.open.enemyActiveExact > 0
    && legendIcons.open.friendlyExact > 0 && legendIcons.open.noteExact > 0,
    `已生成 ${legendIcons.open.enemyStagedExact} / 活跃 ${legendIcons.open.enemyActiveExact} / `
    + `友军 ${legendIcons.open.friendlyExact} / 批注 ${legendIcons.open.noteExact} px`);
  Check("这些像素确实来自图例（把图例也关掉就归零）",
    legendIcons.off.enemyStagedExact === 0 && legendIcons.off.friendlyExact === 0
    && legendIcons.off.noteExact === 0,
    `${legendIcons.off.enemyStagedExact}/${legendIcons.off.friendlyExact}/${legendIcons.off.noteExact} px`);

  // -------------------------------------------------------------------------
  // 0c) 挤在一起就合并：整关视野下前线那十二个人是一枚，放大就散开
  // -------------------------------------------------------------------------
  const cluster = await page.evaluate(() => {
    const map = window.__map;
    map.SetFilter(null);
    map.SetClusterGap(null);
    map.SetSelection(null);
    map.SetHover(null);
    map.SetLive(null);
    map.SetLayers({
      terrain: true, blocks: true, trenches: true, roads: true, anchors: true,
      routes: true, zones: true, friendlies: true, encounters: true, tactics: true,
      live: true, notes: true, labels: true, legend: true,
    });
    // front 组在哪一阶段真的在场（不是「还没出现」也不是「已清除」）
    let phase = null;
    for (const entry of map.model.phases) {
      map.SetPhase(entry.number);
      const found = (map.phaseLayout.encounters || []).find((e) => e.id === "front");
      if (found && found.state !== "pending" && found.state !== "cleared") { phase = entry.number; break; }
    }
    map.SetPhase(phase);
    const front = (map.phaseLayout.encounters || []).find((e) => e.id === "front");
    const frontSize = (front?.members || []).length;
    let cx = 0, cz = 0;
    for (const member of front?.members || []) { cx += member.x; cz += member.z; }
    cx /= frontSize; cz /= frontSize;

    const Marks = (kind, id) => (map.drawnMarkers || [])
      .filter((e) => e.kind === kind && (!id || e.encounter === id));

    map.FitBounds();
    const wideClusters = Marks("cluster", "front");
    const wideMembers = Marks("member", "front");
    const chip = wideClusters[0] || null;
    const pick = chip ? map.PickAt(chip.x, chip.y) : null;
    const tip = pick ? map.DescribeSel(pick) : [];
    // 不同组之间不合并：每一枚簇里的人数不能超过它所属那一组自己的人数
    const crossGroup = Marks("cluster").filter((entry) => {
      const owner = (map.phaseLayout.encounters || []).find((e) => e.id === entry.encounter);
      return !owner || entry.count > (owner.members || []).length;
    }).map((entry) => `${entry.encounter}:${entry.count}`);
    // 人数芯片真的画在画布上：把名字层关掉（组把手也是名字层画的），
    // 剩下还用芯片底色的就只有簇标记那枚人数了。
    map.SetLayers({ labels: false });
    const clusterPx = window.__CountMap(["handle"]).handleExact;
    map.SetLayers({ labels: true });

    // 放大到彼此分得开
    map.ZoomTo({ x: cx, z: cz }, 45);
    const nearClusters = Marks("cluster", "front");
    const nearMembers = Marks("member", "front");

    map.FitBounds();
    return {
      phase, frontSize, cx, cz, crossGroup, clusterPx,
      wideClusters: wideClusters.length, wideCount: chip?.count ?? 0, wideIcon: chip?.icon || "",
      wideMembers: wideMembers.length, pick, tip,
      nearClusters: nearClusters.length, nearMembers: nearMembers.length,
      png: map.ToPng({ scale: 1 }),
    };
  });
  SavePng("cluster_front.png", cluster.png);
  delete cluster.png;
  Check("整关视野下前线那一组只画出一枚簇标记，人数写着 12",
    cluster.wideClusters === 1 && cluster.wideCount === cluster.frontSize
    && cluster.frontSize === 12 && cluster.wideMembers === 0,
    `阶段 ${cluster.phase}：${cluster.wideClusters} 枚簇（count=${cluster.wideCount}，图标 ${cluster.wideIcon}），`
    + `另有 ${cluster.wideMembers} 枚单人`);
  Check("放大到彼此分开就散成 12 枚单人，簇标记消失",
    cluster.nearMembers === cluster.frontSize && cluster.nearClusters === 0,
    `${cluster.nearMembers} 枚单人 / ${cluster.nearClusters} 枚簇`);
  Check("点簇标记拿到整组（kind=encounter），提示里报得出这一撮几个人",
    cluster.pick?.kind === "encounter" && cluster.pick?.id === "front"
    && cluster.pick?.cluster === cluster.frontSize
    && cluster.tip.some((line) => line.includes(`${cluster.frontSize} 人`)),
    `${JSON.stringify(cluster.pick)} ｜ ${cluster.tip.join(" ｜ ")}`);
  Check("不同组之间不合并（每枚簇的人数都不超过它那一组）",
    cluster.crossGroup.length === 0 && cluster.clusterPx > 0,
    cluster.crossGroup.join("、") || `人数芯片 ${cluster.clusterPx} px`);

  // -------------------------------------------------------------------------
  // 0d) 触发区中心不再摆图标：虚线圈本身就是它的图标
  // -------------------------------------------------------------------------
  const zoneIcons = await page.evaluate(() => {
    const map = window.__map;
    map.SetPhase(12);
    map.SetHover(null);
    // 只留触发区这一层：别的层的金色（把手描边、图例顶条）会混进来
    map.SetLayers({
      encounters: false, friendlies: false, anchors: false, routes: false,
      notes: false, live: false, tactics: false, legend: false, labels: false, zones: true,
    });
    // 挑这一阶段**真的画着**的那个圈：整份模型里四十五个触发区，第 12 阶段只画五个，
    // 拿别的阶段的圈去量，量到的是一片没人画的空地。
    const zone = (map.phaseLayout?.zones || map.model.zones || [])
      .find((z) => Number.isFinite(z.radiusM) && Number.isFinite(z.x));
    map.ZoomTo({ x: zone.x, z: zone.z }, 30);
    const p = map.WorldToScreen(zone.x, zone.z);
    const gold = window.__CountRect("zone", { x: p.x - 16, y: p.y - 16, w: 32, h: 32 });
    // 虚线圈是半透明画的（0.42），混出来的颜色离纯金差着一百多档，数「金色像素」
    // 是数不到它的。所以换个问法：把触发区这一层关掉，画面必须变 —— 变了就说明
    // 这一层还在画东西，没被「去掉圈心图标」一起砍掉。
    const on = window.__Count([]);
    map.SetLayers({ zones: false });
    const off = window.__Count([]);
    map.SetLayers({ zones: true });
    const withZones = on.sum, withoutZones = off.sum;
    const marks = (map.drawnMarkers || []).filter((e) => e.kind === "zone");
    const withIcon = marks.filter((e) => e.icon).map((e) => `${e.id}:${e.icon}`);
    map.SetLayers({
      encounters: true, friendlies: true, anchors: true, routes: true,
      notes: true, live: true, tactics: true, legend: true, labels: true, zones: true,
    });
    map.FitBounds();
    return { id: zone.id, gold, withZones, withoutZones, zones: marks.length, withIcon };
  });
  Check("触发区中心不再有金色图标像素（圈心只剩一颗淡点）", zoneIcons.gold === 0,
    `${zoneIcons.id} 圈心 32×32 里精确金色 ${zoneIcons.gold} px`);
  Check("虚线圈本身还画着（关掉这一层画面就变）",
    zoneIcons.withZones !== zoneIcons.withoutZones && zoneIcons.zones > 0,
    `${zoneIcons.zones} 个触发区在这一屏里（关掉这一层画面指纹 ${zoneIcons.withZones} → ${zoneIcons.withoutZones}）`);
  Check("只有转运那四个攻击波的框还留图标", zoneIcons.withIcon.length === 4
    && zoneIcons.withIcon.every((entry) => entry.endsWith(":Wave")),
    zoneIcons.withIcon.join("、") || "一个图标都没留");

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
      const counts = window.__CountMap(["enemyStaged", "enemyActive", "enemyDormant", "enemyPending", "route", "tactic", "friendly"]);
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
    row.enemyExact = row.enemyStagedExact + row.enemyActiveExact + row.enemyDormantExact;
    row.bytes = bytes;
    perPhase.push(row);
  }
  const blank = perPhase.filter((r) => r.ink < 20000);
  Check("每个阶段都画出了内容（非底色像素 > 20000）", blank.length === 0,
    blank.length ? `空的：${blank.map((r) => r.n).join(",")}` : `最少 ${Math.min(...perPhase.map((r) => r.ink))} px`);

  // 模型说这一阶段场上有人，画面上就必须数得出对应颜色的像素；模型说一个都没有，
  // 画面上也不该有。这一条咬住的是「模型 ↔ 画面」。
  //
  // 「一个都没有」这一侧留三个像素的余量：整张图上还有图廓（北向箭头、边缘刻度、
  // 比例尺）和一堆文字，它们的抗锯齿边缘是连续的中间色，偶尔会有一枚正好等于某个
  // 标记色。实测就抓到过一次：北向箭头那个「北」字的边缘等于「未出现」的灰，于是
  // 同一份代码在这台机器上 50/50、在另一台上 49/50。标记色已经挑得离那些中性灰远
  // 一点了（未出现改成冷灰蓝），余量是第二道保险 —— 真把一层画丢了是成百上千个
  // 像素的事，不会只差三个。
  //
  // 「有人」那一侧用容差墨量（图标有抗锯齿，细线图标的精确像素会抖），
  // 「没人」那一侧用精确像素 —— 容差 24 在暗底上会把一大片中间色算进来，
  // 拿它问「是不是 0」等于没问。两侧各用各的尺子。
  const NOISE_PX = 3;
  const Mismatch = (people, near, exact) => (people > 0 ? near <= 0 : exact > NOISE_PX);
  const enemyMismatch = perPhase.filter((r) => Mismatch(r.onField, r.enemy, r.enemyExact));
  Check("敌人像素与模型「场上有几个人」一一对上", enemyMismatch.length === 0,
    enemyMismatch.length
      ? enemyMismatch.map((r) => `阶段${r.n} 在场${r.onField}人 但 ${r.enemy}px`).join("；")
      : perPhase.map((r) => `${r.n}:${r.onField}人/${r.enemy}px`).join(" "));
  const pendingMismatch = perPhase.filter((r) => Mismatch(r.pending, r.enemyPending, r.enemyPendingExact));
  Check("未出现的组画成半透明的冷灰蓝，且与模型的 pending 人数对得上", pendingMismatch.length === 0,
    pendingMismatch.length
      ? pendingMismatch.map((r) => `阶段${r.n} pending${r.pending}人 但 ${r.enemyPending}px`).join("；")
      : `有人时最多 ${Math.max(...perPhase.map((r) => r.enemyPending))} px，`
        + `没人时最多 ${Math.max(0, ...perPhase.filter((r) => r.pending === 0).map((r) => r.enemyPendingExact))} px（精确）`);
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
    // 把手芯片的底色跟画布底色只差十几档，容差 24 会把整片底色算成芯片 ——
    // 这一条必须用精确像素。
    const withChips = window.__Count(["handle"]).handleExact;
    map.SetLayers({ encounters: false, zones: false });
    const noChips = window.__Count(["handle"]).handleExact;
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
    // 用词：图上不许出现「拍」这种排程表里的内部叫法
    const beatLabel = (map.placedLabels || []).find((e) => e.kind === "beat" && e.id === "transferFlank")?.text || "";
    const jargon = (map.placedLabels || []).map((e) => e.text).filter((t) => /(^|\s)拍\s/.test(t));
    const beatTip = map.DescribeSel({ kind: "beat", id: "transferFlank" });
    const firstTip = map.DescribeSel({ kind: "beat", id: "transfer" });
    return {
      beatLabel, jargon, beatTip, firstTip,
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
  Check("转运四拍在图上叫「第几波攻击」，不写内部叫法「拍」",
    /^第 2 波攻击 · transferFlank · 35–60 秒$/.test(chips.beatLabel) && chips.jargon.length === 0,
    `${chips.beatLabel}${chips.jargon.length ? ` ｜ 还写着：${chips.jargon.join("、")}` : ""}`);
  Check("悬停提示同样说人话，0–0 秒那一拍写「开场即到」",
    chips.beatTip[0] === "转运攻击波：transferFlank" && chips.beatTip[1] === "第 2 波攻击 · 35–60 秒"
    && chips.firstTip[1] === "第 1 波攻击 · 开场即到",
    `${chips.beatTip.join(" ｜ ")} ／ ${chips.firstTip.join(" ｜ ")}`);

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
    const on = window.__CountMap(["route", "enemyStaged", "enemyActive"]);
    map.SetLayers({ routes: false });
    const noRoutes = window.__CountMap(["route", "enemyStaged", "enemyActive"]);
    map.SetLayers({ encounters: false });
    const noEnemies = window.__CountMap(["route", "enemyStaged", "enemyActive"]);
    map.SetLayers({ routes: true, encounters: true });
    const back = window.__CountMap(["route", "enemyStaged", "enemyActive"]);
    // 图例：默认收成一枚芯片，点一下摊开，再点收起；图层关掉连芯片都没。
    // 先把悬停清掉 —— 上一节留下的 tooltip 会跟着鼠标压在图例上，白白吃掉一百多个像素。
    map.SetHover(null);
    const defaultOpen = map.legendOpen;
    // 图例底色 #0d1011 与画布底色 #101314 只差三档，同样只能用精确像素。
    const band = window.__LegendRect();
    const chip = window.__CountRect("legendBack", band);
    const hit = map.legendHit ? { ...map.legendHit } : null;
    window.__Mouse("mousedown", hit.x + 10, hit.y + 8);
    window.__Mouse("mouseup", hit.x + 10, hit.y + 8);
    const openedByClick = map.legendOpen;
    const opened = window.__CountRect("legendBack", band);
    // 摊开以后面板往上长，标题栏跟着挪：再点一下要点在新的标题栏上
    const head = map.legendHit ? { ...map.legendHit } : null;
    window.__Mouse("mousedown", head.x + 10, head.y + 8);
    window.__Mouse("mouseup", head.x + 10, head.y + 8);
    const closedByClick = map.legendOpen;
    map.SetLegendOpen(true);
    const openedByApi = window.__CountRect("legendBack", band);
    const legendPng = map.ToPng({ scale: 1 });
    map.SetLegendOpen(false);
    map.SetLayers({ legend: false });
    const legendOff = window.__Count(["legendBack", "scaleBar"]);
    legendOff.inBand = window.__CountRect("legendBack", band);
    const strays = window.__Where("legendBack");
    map.SetLayers({ legend: true });
    return {
      on, noRoutes, noEnemies, back, legendOff, strays, bar: map.scaleBar,
      defaultOpen, chip, hit, head, openedByClick, opened, closedByClick, openedByApi, legendPng,
    };
  });
  const legendBytes = SavePng("legend_open.png", layers.legendPng);
  delete layers.legendPng;
  Info("摊开的图例出图", `_shots/OrchestrationMap/legend_open.png，${(legendBytes / 1024).toFixed(0)} KB`);
  Check("关掉 routes 层后路线像素归零",
    layers.on.route > 0 && layers.noRoutes.routeExact === 0,
    `${layers.on.route} → 0`);
  Check("关掉 encounters 层后敌人像素归零",
    layers.noEnemies.enemyStagedExact + layers.noEnemies.enemyActiveExact === 0,
    `${layers.on.enemyStaged + layers.on.enemyActive} → 0`);
  Check("开回来还是原样", layers.back.route === layers.on.route
    && layers.back.enemyStaged === layers.on.enemyStaged);
  Check("图例默认收成一枚小芯片（不挡地图）",
    layers.defaultOpen === false && layers.chip > 0 && !!layers.hit,
    `芯片 ${layers.chip} px @ (${layers.hit?.x}, ${layers.hit?.y}) ${layers.hit?.w}×${layers.hit?.h}`);
  Check("点芯片摊开、再点收起（SetLegendOpen 也一样）",
    layers.openedByClick === true && layers.closedByClick === false
    && layers.opened > layers.chip * 3 && layers.openedByApi === layers.opened,
    `收起 ${layers.chip} px @ (${layers.hit?.x}, ${layers.hit?.y}) → 展开 ${layers.opened} px，`
    + `标题栏挪到 (${layers.head?.x}, ${layers.head?.y})（API 展开 ${layers.openedByApi} px）`);
  Check("关掉 legend 层连芯片都不画", layers.legendOff.inBand === 0,
    `图例那条竖带里 ${layers.chip} px → ${layers.legendOff.inBand} px`
    + (layers.strays?.length ? `；全画布还剩 ${layers.legendOff.legendBackExact} px（图标描边抗锯齿混出来的，在 ${layers.strays.join(" / ")}）` : ""));
  Check("比例尺在（关掉图例也还在），并报得出整数米长度",
    layers.legendOff.scaleBar > 0 && Number.isFinite(layers.bar?.meters) && layers.bar.meters > 0
    && /^\d+ m$/.test(layers.bar?.text || ""),
    `${layers.bar?.text}（${layers.legendOff.scaleBar} px）`);

  // -------------------------------------------------------------------------
  // 9) live 层：玩家黄三角、死者灰叉
  // -------------------------------------------------------------------------
  const live = await page.evaluate(() => {
    const map = window.__map;
    map.SetPhase(12);
    map.ZoomTo({ x: 100, z: 100 }, 60);
    const before = window.__CountMap(["player", "liveEnemy", "liveDead"]);
    map.SetLive({
      player: { x: 100, z: 100, yaw: 0.6 },
      enemies: [
        { id: "TransferRifleA", alive: true, encounter: "transfer", x: 106, z: 96 },
        { id: "TransferRifleB", alive: false, encounter: "transfer", x: 110, z: 108 },
      ],
      guideRoute: [{ x: 90, z: 120 }, { x: 100, z: 104 }, { x: 116, z: 92 }],
    });
    const after = window.__CountMap(["player", "liveEnemy", "guide"]);
    map.SetLive(null);
    const cleared = window.__CountMap(["player"]);
    return { before, after, cleared };
  });
  Check("live 层画出玩家图标（带朝向）", live.before.playerExact === 0 && live.after.player > 0,
    `${live.after.player} px`);
  Check("live 层画出实际敌人位置与 guideRoute",
    live.after.liveEnemy > 0 && live.after.guide > 0,
    `敌人 ${live.after.liveEnemy} px / 指引 ${live.after.guide} px`);
  Check("SetLive(null) 之后 live 层收干净", live.cleared.playerExact === 0);

  // -------------------------------------------------------------------------
  // 9b) 整关视野：文字互不相交、图廓齐全、一次 Redraw 的耗时
  // -------------------------------------------------------------------------
  // 面板里这张图就是 1380×900（工作台弹窗的默认尺寸），所以耗时要在这个尺寸上量。
  // 地表烘焙是一次性的（换模型才重烘），先 Redraw 一次把它烘完再计时。
  for (const [w, h, file] of [[1380, 900, "overview_after.png"], [1920, 1080, "overview_after_1920.png"]]) {
    const shot = await page.evaluate(async (size) => {
      const map = window.__map;
      map.canvas.style.width = `${size[0]}px`;
      map.canvas.style.height = `${size[1]}px`;
      map.Resize();
      map.SetPhase(12);
      map.FitBounds();
      map.Redraw();
      const samples = [];
      for (let i = 0; i < 24; i += 1) {
        const t0 = performance.now();
        map.Redraw();
        samples.push(performance.now() - t0);
      }
      samples.sort((a, b) => a - b);
      // 排版缓存打掉，量一次「视野真的变了」的最坏情况
      map.labelCache = null;
      const t1 = performance.now();
      map.Redraw();
      const cold = performance.now() - t1;
      return {
        png: map.ToPng({ scale: 1 }),
        median: samples[Math.floor(samples.length / 2)], max: samples[samples.length - 1], cold,
        labels: (map.placedLabels || []).length,
        overlap: window.__LabelOverlap(),
        chips: (map.handles || []).length,
        css: [map.cssWidth, map.cssHeight],
      };
    }, [w, h]);
    const bytes = SavePng(file, shot.png);
    delete shot.png;
    if (w === 1380) {
      Check("整关视野下没有两个标签互相压",
        shot.overlap === null && shot.labels > 0,
        shot.overlap ? `「${shot.overlap.a}」压住「${shot.overlap.b}」` : `排了 ${shot.labels} 个标签（其中 ${shot.chips} 个组/拍把手）`);
      Check(`整关视野 ${w}×${h} 一次 Redraw ≤ 8 ms`, shot.median <= 8,
        `中位 ${shot.median.toFixed(2)} ms / 最慢 ${shot.max.toFixed(2)} ms / 重排标签那一帧 ${shot.cold.toFixed(2)} ms`);
    }
    Info(`整关视野出图 ${file}`, `${shot.css[0]}×${shot.css[1]}，${(bytes / 1024).toFixed(0)} KB，`
      + `标签 ${shot.labels} 个，Redraw 中位 ${shot.median.toFixed(2)} ms`);
  }
  await page.evaluate(() => {
    const map = window.__map;
    map.canvas.style.width = "1100px";
    map.canvas.style.height = "760px";
    map.Resize();
  });

  // -------------------------------------------------------------------------
  // 9c) SetFilter：只看这一组。过滤掉的东西不画、不拾取、也不占标签位置
  // -------------------------------------------------------------------------
  const filter = await page.evaluate(() => {
    const map = window.__map;
    map.SetTool("select");
    map.SetSelection(null);
    map.SetHover(null);
    map.SetLive(null);
    map.SetFilter(null);
    // 这一节问的是「过滤留下了谁」，所以先把合并关掉逐个数 ——
    // 开着合并的话 transfer 那四个人在整关视野下会并成一枚，数出来是 0 个人，
    // 那量的是合并不是过滤。
    map.SetClusterGap(0);
    map.SetPhase(12);
    map.FitBounds();
    const Members = () => (map.drawnMarkers || []).filter((entry) => entry.kind === "member");
    const all = Members();
    const allRoute = window.__CountMap(["route"]).route;

    map.SetFilter({ encounters: new Set(["transfer"]) });
    const only = Members();
    const onlyIds = only.map((entry) => entry.id).sort();
    const onlyEnc = [...new Set(only.map((entry) => entry.encounter))];
    const chipsAfter = (map.handles || []).filter((entry) => entry.kind === "encounter").map((entry) => entry.id);
    const stored = map.filter?.encounters instanceof Set ? [...map.filter.encounters] : null;
    const storedNulls = map.filter
      ? ["members", "routes", "zones", "friendlies", "anchors", "notes"].every((k) => map.filter[k] === null)
      : false;
    // 被过滤掉的人也不该再点得中。
    map.ZoomTo({ x: 43, z: 8 }, 40);
    const gunner = map.WorldToScreen(43, 8);
    const pickFiltered = map.PickAt(gunner.x, gunner.y);
    map.SetFilter(null);
    const pickBack = map.PickAt(gunner.x, gunner.y);

    map.FitBounds();
    map.SetFilter({ routes: new Set(["south"]) });
    const oneRoute = window.__CountMap(["route"]).route;
    map.SetFilter({ members: new Set(["TransferGunner"]) });
    const oneMember = Members().map((entry) => entry.id);

    map.SetFilter(null);
    map.FitBounds();
    const back = Members();
    const backRoute = window.__CountMap(["route"]).route;
    const truth = (map.model.encounters.find((entry) => entry.id === "transfer")?.members || [])
      .map((entry) => entry.id).sort();
    map.SetClusterGap(null);
    return {
      allCount: all.length, onlyIds, onlyEnc, chipsAfter, stored, storedNulls,
      pickFiltered, pickBack, oneMember,
      backCount: back.length, allRoute, oneRoute, backRoute, truth,
      png: map.ToPng({ scale: 1 }),
    };
  });
  SavePng("filter_transfer.png", filter.png);
  delete filter.png;
  Check("SetFilter({encounters:transfer}) 之后地图上只剩 transfer 组那四个人",
    filter.onlyIds.length === 4 && filter.onlyIds.join(",") === filter.truth.join(",")
    && filter.onlyEnc.length === 1 && filter.onlyEnc[0] === "transfer",
    `${filter.allCount} 人 → ${filter.onlyIds.length} 人（${filter.onlyIds.join("、")}）`);
  Check("过滤后组把手也只剩这一个，当前过滤记在 map.filter 上",
    filter.chipsAfter.length === 1 && filter.chipsAfter[0] === "transfer"
    && Array.isArray(filter.stored) && filter.stored.join(",") === "transfer" && filter.storedNulls,
    `把手 ${filter.chipsAfter.join("/") || "（无）"}；map.filter.encounters=${JSON.stringify(filter.stored)}`);
  Check("过滤掉的人也点不中了，取消过滤又点得中",
    filter.pickFiltered?.kind !== "member" && filter.pickBack?.id === "VillageGunner",
    `过滤中点到 ${JSON.stringify(filter.pickFiltered)}，取消后点到 ${JSON.stringify(filter.pickBack)}`);
  Check("路线也能只留一条（像素跟着少）",
    filter.oneRoute > 0 && filter.oneRoute < filter.allRoute,
    `全部 ${filter.allRoute} px → 只留 south ${filter.oneRoute} px`);
  Check("按人过滤（members）同样生效",
    filter.oneMember.length === 1 && filter.oneMember[0] === "TransferGunner",
    filter.oneMember.join("、") || "（一个都没剩）");
  Check("SetFilter(null) 恢复全画",
    filter.backCount === filter.allCount && filter.backRoute === filter.allRoute && filter.allCount > 4,
    `${filter.onlyIds.length} → ${filter.backCount} 人，路线 ${filter.backRoute} px`);

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
