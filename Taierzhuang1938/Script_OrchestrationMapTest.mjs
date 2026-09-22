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
    const events = { select: [], hover: [], sketch: [], move: [], mention: [] };
    map.onSelect((s) => events.select.push(s));
    map.onHover((s) => events.hover.push(s));
    map.onSketch((s) => events.sketch.push(s));
    map.onMove((m) => events.move.push(m));
    map.onMention((s) => events.mention.push(s));
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
    window.__Mouse = (type, px, py, button = 0, extra = null) => {
      const rect = map.canvas.getBoundingClientRect();
      map.canvas.dispatchEvent(new MouseEvent(type, {
        clientX: rect.left + px, clientY: rect.top + py, button, bubbles: true, cancelable: true,
        ...(extra || {}),
      }));
    };
    // 键盘走 window：地图的监听就挂在那儿（画布本身不聚焦，按键根本到不了它）。
    window.__Key = (key, target = null) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      (target || window).dispatchEvent(event);
      return event.defaultPrevented;
    };
    // 玩家标记那一撮像素：上下左右各几个、以及每个像素相对中心的偏移。
    // 朝向断言靠它 —— 「箭头转了没有、转对方向没有」只能从像素分布上读出来。
    //
    // 这里用容差 24 不用精确色：图标转起来之后整张图都是插值出来的，25 px 见方的
    // 箭头连十几个精确像素都剩不下，拿十几个点去比分布纯属抛硬币。玩家那枚黄
    // （255,214,64）附近没有别的调色板颜色，容差在这一小块里不会数进别人。
    // 中心那颗 1.8 px 的芯是对称的，会把两侧各算一份，所以留一圈死区跳过它。
    window.__PlayerPixels = (cx, cy, r) => {
      const c = map.canvas;
      const d = map.dpr;
      const t = MAP_COLORS.player;
      const TOL_PX = 24;
      const x0 = Math.max(0, Math.floor((cx - r) * d)), x1 = Math.min(c.width, Math.ceil((cx + r) * d));
      const y0 = Math.max(0, Math.floor((cy - r) * d)), y1 = Math.min(c.height, Math.ceil((cy + r) * d));
      const data = c.getContext("2d").getImageData(x0, y0, x1 - x0, y1 - y0).data;
      const w = x1 - x0;
      const mx = cx * d, my = cy * d;
      const dead = Math.ceil(2 * d);
      const out = { n: 0, up: 0, down: 0, left: 0, right: 0, offsets: [] };
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - t[0]) > TOL_PX || Math.abs(data[i + 1] - t[1]) > TOL_PX
          || Math.abs(data[i + 2] - t[2]) > TOL_PX) continue;
        const px = x0 + (i / 4) % w, py = y0 + Math.floor((i / 4) / w);
        const dx = px - mx, dy = py - my;
        out.n += 1;
        out.offsets.push([Math.round(dx), Math.round(dy)]);
        if (dy < -dead) out.up += 1;
        if (dy > dead) out.down += 1;
        if (dx < -dead) out.left += 1;
        if (dx > dead) out.right += 1;
      }
      return out;
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
  // 人数照模型现算，不写死：前线那一组的编制改过一次（12 → 10），写死的数字
  // 会在别人调编排的那天翻红，红的却是「合并」这件跟它无关的事。
  Check("整关视野下前线那一组只画出一枚簇标记，人数就是这一组的人数",
    cluster.wideClusters === 1 && cluster.wideCount === cluster.frontSize
    && cluster.frontSize >= 6 && cluster.wideMembers === 0,
    `阶段 ${cluster.phase}：${cluster.wideClusters} 枚簇（count=${cluster.wideCount}，图标 ${cluster.wideIcon}），`
    + `另有 ${cluster.wideMembers} 枚单人`);
  Check("放大到彼此分开就散成一个个人，簇标记消失",
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
  Check("只有转运那两处威胁的框还留图标", zoneIcons.withIcon.length === 2
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
    const threat = map.HandlePoint("threat", "transferAlley");
    const groupSel = group ? map.PickAt(group.x, group.y) : null;
    const threatSel = threat ? map.PickAt(threat.x, threat.y) : null;
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
    window.__Mouse("mousemove", threat.x, threat.y);
    const hoveredThreat = map.hover;
    map.SetSelection({ kind: "threat", id: "transferAlley" });
    const threatSelectPx = window.__Count(["select"]).select;
    map.SetSelection(null);
    map.SetHover(null);
    // 已清除的组不给把手：第 12 阶段这样的组有十来个，遍布全关。
    const clearedIds = (layout.encounters || []).filter((entry) => entry.state === "cleared").map((entry) => entry.id);
    const clearedHandles = clearedIds.filter((id) => !!map.HandlePoint("encounter", id));
    // 用词：图上不许出现「拍」这种排程表里的内部叫法
    const threatLabel = (map.placedLabels || []).find((e) => e.kind === "threat" && e.id === "transferAlley")?.text || "";
    const jargon = (map.placedLabels || []).map((e) => e.text).filter((t) => /(^|\s)拍\s/.test(t));
    const threatTip = map.DescribeSel({ kind: "threat", id: "transferAlley" });
    const firstTip = map.DescribeSel({ kind: "threat", id: "transfer" });
    return {
      threatLabel, jargon, threatTip, firstTip,
      group, threat, groupSel, threatSel, members, withChips, noChips, hovered, hoverAdded, selectPx,
      hoveredThreat, threatSelectPx,
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
  Check("点第二处威胁标签拿到第二处威胁",
    chips.threatSel?.kind === "threat" && chips.threatSel?.id === "transferAlley",
    `把手 @ (${chips.threat?.x?.toFixed(0)}, ${chips.threat?.y?.toFixed(0)}) → ${JSON.stringify(chips.threatSel)}`);
  Check("组把手不遮住成员（每个成员仍点得中人）",
    chips.members.length > 0 && chips.members.every((row) => row.hit.startsWith("member:")),
    chips.members.map((row) => `${row.id}→${row.hit}`).join(" "));
  Check("把手芯片真的画在画布上（关掉敌军与触发区两层就归零）",
    chips.withChips > 0 && chips.noChips === 0, `${chips.withChips} px → ${chips.noChips} px`);
  Check("悬停到组把手给出 encounter sel（tooltip 走同一条路）",
    chips.hovered?.kind === "encounter" && chips.hovered?.id === "transfer" && chips.hoverAdded >= 1,
    JSON.stringify(chips.hovered));
  Check("选中一整组时整组成员被描亮", chips.selectPx > 0, `${chips.selectPx} px 高亮色`);
  Check("悬停 / 选中第二处威胁也走同一条路（tooltip + 描亮那一撮人）",
    chips.hoveredThreat?.kind === "threat" && chips.hoveredThreat?.id === "transferAlley" && chips.threatSelectPx > 0,
    `${JSON.stringify(chips.hoveredThreat)}，描亮 ${chips.threatSelectPx} px`);
  Check("已清除的组不长把手", chips.clearedCount > 0 && chips.clearedHandles.length === 0,
    `已清除 ${chips.clearedCount} 组，把手种类 ${chips.kinds.join("/")}`);
  Check("转运两处威胁在图上叫「第几处威胁」，不写内部叫法「拍」",
    /^第 2 处威胁 · transferAlley · loadingThreatResolved 之后$/.test(chips.threatLabel) && chips.jargon.length === 0,
    `${chips.threatLabel}${chips.jargon.length ? ` ｜ 还写着：${chips.jargon.join("、")}` : ""}`);
  Check("悬停提示同样说人话，第一处写「进转运即到」",
    chips.threatTip[0] === "转运威胁：transferAlley" && chips.threatTip[1] === "第 2 处威胁 · loadingThreatResolved 之后"
    && chips.threatTip[2] === "解除后记 alleyThreatResolved"
    && chips.firstTip[1] === "第 1 处威胁 · 进 Transfer 即到",
    `${chips.threatTip.join(" ｜ ")} ／ ${chips.firstTip.join(" ｜ ")}`);

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

    // 阶段 12 只画一条路线（cartRide），过滤到它自己自然不会少像素 ——
    // 换到阶段 18 量：那一段画三条（toBridge / bridgeWithdraw / nightMarch）。
    map.SetPhase(18);map.FitBounds();
    const allRoute18 = window.__CountMap(["route"]).route;
    map.SetFilter({ routes: new Set(["nightMarch"]) });
    const oneRoute = window.__CountMap(["route"]).route;
    map.SetFilter(null);map.SetPhase(12);map.FitBounds();
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
      backCount: back.length, allRoute, allRoute18, oneRoute, backRoute, truth,
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
    filter.oneRoute > 0 && filter.oneRoute < filter.allRoute18,
    `阶段 18 全部 ${filter.allRoute18} px → 只留 nightMarch ${filter.oneRoute} px`);
  Check("按人过滤（members）同样生效",
    filter.oneMember.length === 1 && filter.oneMember[0] === "TransferGunner",
    filter.oneMember.join("、") || "（一个都没剩）");
  Check("SetFilter(null) 恢复全画",
    filter.backCount === filter.allCount && filter.backRoute === filter.allRoute && filter.allCount > 4,
    `${filter.onlyIds.length} → ${filter.backCount} 人，路线 ${filter.backRoute} px`);

  // -------------------------------------------------------------------------
  // 9d) 折线：单击落点，双击 / 回车 / 右键都能收尾，Esc 整条丢、退格退一点
  //
  // 这一节守的是「进去了出得来」：先前只有双击能结束，切工具还把点全丢了，
  // 用户的原话是「开始了就停不下来」。
  // -------------------------------------------------------------------------
  const pathTool = await page.evaluate(() => {
    const map = window.__map;
    const events = window.__events;
    map.SetFilter(null);
    map.SetSketch([]);
    map.SetSelection(null);
    map.SetHover(null);
    map.SetLive(null);
    map.SetPhase(12);
    map.FitBounds();
    const Click = (p) => { window.__Mouse("mousedown", p.x, p.y); window.__Mouse("mouseup", p.x, p.y); };
    const Last = () => events.sketch[events.sketch.length - 1];
    const a = map.WorldToScreen(20, 0), b = map.WorldToScreen(60, 20), c = map.WorldToScreen(90, -10);
    const out = {};

    // --- 落点 + 橡皮筋 + 光标提示 ---
    map.SetTool("path");
    Click(a);
    out.afterOne = map.pathPoints.length;
    window.__Mouse("mousemove", b.x, b.y);
    out.hintText = map.cursorHint?.text || "";
    out.hintPx = map.cursorHint ? window.__CountRect("labelBack", map.cursorHint) : 0;
    Click(b); Click(c);
    out.afterThree = map.pathPoints.length;

    // --- 退格退一个点 ---
    out.backspaceAte = window.__Key("Backspace");
    out.afterBackspace = map.pathPoints.length;

    // --- 回车结束 ---
    let before = events.sketch.length;
    out.enterAte = window.__Key("Enter");
    out.enterAdded = events.sketch.length - before;
    out.enterShape = Last();
    out.afterEnter = map.pathPoints.length;

    // --- Esc 整条丢掉 ---
    before = events.sketch.length;
    Click(a); Click(b);
    out.escAte = window.__Key("Escape");
    out.afterEsc = map.pathPoints.length;
    out.escAdded = events.sketch.length - before;

    // --- 右键结束（而不是拖着平移） ---
    before = events.sketch.length;
    const cx = map.view.cx, cz = map.view.cz;
    Click(a); Click(c);
    window.__Mouse("mousedown", b.x, b.y, 2);
    window.__Mouse("mousemove", b.x + 60, b.y + 40, 2);
    window.__Mouse("mouseup", b.x + 60, b.y + 40, 2);
    out.rightAdded = events.sketch.length - before;
    out.rightShape = Last();
    out.panned = Math.hypot(map.view.cx - cx, map.view.cz - cz);

    // --- 双击结束（第一下已经落过点，末尾两个重合的只算一个） ---
    before = events.sketch.length;
    Click(a); Click(b); Click(b);
    window.__Mouse("dblclick", b.x, b.y);
    out.dblAdded = events.sketch.length - before;
    out.dblPoints = Last()?.points?.length ?? 0;

    // --- 切工具：两点以上先提交，只有一点就丢掉 ---
    before = events.sketch.length;
    map.SetTool("path"); Click(a); Click(c);
    map.SetTool("select");
    out.toolCommitted = events.sketch.length - before;
    out.toolShape = Last();
    before = events.sketch.length;
    map.SetTool("path"); Click(a);
    map.SetTool("select");
    out.toolDropped = events.sketch.length - before;
    out.afterTool = map.pathPoints.length;

    // --- 焦点在输入框里时一概不接（弹窗里有批注正文与标注输入框） ---
    const input = document.createElement("input");
    document.body.appendChild(input);
    map.SetTool("path"); Click(a); Click(b); Click(c);
    before = events.sketch.length;
    out.typingAte = window.__Key("Enter", input) || window.__Key("Backspace", input)
      || window.__Key("Escape", input);
    out.typingLeft = map.pathPoints.length;
    out.typingAdded = events.sketch.length - before;
    input.remove();
    map.CancelPath();
    map.SetTool("select");
    map.SetSketch([]);
    return out;
  });
  Check("折线单击落点，光标旁画着「怎么结束」那句话",
    pathTool.afterOne === 1 && pathTool.afterThree === 3
    && pathTool.hintText === "回车 / 双击结束 · Esc 取消" && pathTool.hintPx > 0,
    `落了 ${pathTool.afterThree} 个点；提示「${pathTool.hintText}」${pathTool.hintPx} px`);
  Check("退格退掉最后一个点（不是整条丢）",
    pathTool.afterBackspace === 2 && pathTool.backspaceAte === true,
    `3 → ${pathTool.afterBackspace} 个点`);
  Check("回车结束并产出折线",
    pathTool.enterAdded === 1 && pathTool.enterShape?.type === "path"
    && pathTool.enterShape.points.length === 2 && pathTool.afterEnter === 0 && pathTool.enterAte === true,
    `产出 ${pathTool.enterShape?.points?.length} 个点`);
  Check("Esc 取消整条（不产出任何形状）",
    pathTool.afterEsc === 0 && pathTool.escAdded === 0 && pathTool.escAte === true,
    `剩 ${pathTool.afterEsc} 个点，产出 ${pathTool.escAdded} 笔`);
  Check("右键结束折线，而不是拖着平移",
    pathTool.rightAdded === 1 && pathTool.rightShape?.type === "path" && pathTool.panned < 0.001,
    `产出 ${pathTool.rightAdded} 笔，视野挪了 ${pathTool.panned.toFixed(3)} m`);
  Check("双击结束，末尾两个重合的点只算一个",
    pathTool.dblAdded === 1 && pathTool.dblPoints === 2,
    `点了 3 下 + 双击 → ${pathTool.dblPoints} 个点`);
  Check("切工具时：两点以上先提交，只落了一点就丢掉",
    pathTool.toolCommitted === 1 && pathTool.toolShape?.type === "path"
    && pathTool.toolDropped === 0 && pathTool.afterTool === 0,
    `提交 ${pathTool.toolCommitted} 笔 / 丢弃那次产出 ${pathTool.toolDropped} 笔`);
  Check("焦点在输入框里时回车退格都不归地图管",
    pathTool.typingAte === false && pathTool.typingLeft === 3 && pathTool.typingAdded === 0,
    `按完还剩 ${pathTool.typingLeft} 个点，产出 ${pathTool.typingAdded} 笔`);

  // -------------------------------------------------------------------------
  // 9e) 圈选 / 箭头：手一抖的那一下不算一笔
  // -------------------------------------------------------------------------
  const tinyDrag = await page.evaluate(() => {
    const map = window.__map;
    const events = window.__events;
    map.SetPhase(12);
    map.FitBounds();
    const p = map.WorldToScreen(40, 20);
    const Drag = (tool, dx, dy) => {
      map.SetTool(tool);
      const before = events.sketch.length;
      window.__Mouse("mousedown", p.x, p.y);
      window.__Mouse("mousemove", p.x + dx, p.y + dy);
      window.__Mouse("mouseup", p.x + dx, p.y + dy);
      return { added: events.sketch.length - before, left: map.drag };
    };
    const tinyCircle = Drag("circle", 2, 1);
    const realCircle = Drag("circle", 34, 12);
    const tinyArrow = Drag("arrow", 1, 2);
    const realArrow = Drag("arrow", 40, -18);
    map.SetTool("select");
    map.SetSketch([]);
    return { tinyCircle, realCircle, tinyArrow, realArrow, last: events.sketch[events.sketch.length - 1] };
  });
  Check("误点一下不生成半径 1 m 的圈 / 零长的箭头",
    tinyDrag.tinyCircle.added === 0 && tinyDrag.tinyArrow.added === 0,
    `圈 ${tinyDrag.tinyCircle.added} 笔 / 箭头 ${tinyDrag.tinyArrow.added} 笔`);
  Check("真拖开一段还是照样产出，且拖完不留半拉状态",
    tinyDrag.realCircle.added === 1 && tinyDrag.realArrow.added === 1
    && tinyDrag.realCircle.left === null && tinyDrag.realArrow.left === null,
    `圈 ${tinyDrag.realCircle.added} 笔 / 箭头 ${tinyDrag.realArrow.added} 笔`);

  // -------------------------------------------------------------------------
  // 9f) 画上去的那几笔也点得中、选得中、看得出选中了哪一笔
  // -------------------------------------------------------------------------
  const sketchPick = await page.evaluate(() => {
    const map = window.__map;
    map.SetTool("select");
    map.SetLive(null);
    map.SetFilter(null);
    map.SetSelection(null);
    map.SetHover(null);
    map.SetPhase(12);
    map.SetClusterGap(0);                 // 逐个人画，免得点到的是一撮人
    map.ZoomTo({ x: 43, z: 8 }, 60);      // VillageGunner 就在 (43, 8)
    const shapes = [
      { type: "circle", x: 0, z: 0, r: 12 },
      { type: "arrow", from: { x: 20, z: -30 }, to: { x: 60, z: -30 } },
      { type: "path", points: [{ x: -20, z: 40 }, { x: 0, z: 50 }, { x: 20, z: 40 }] },
      { type: "label", x: 60, z: 20, text: "这里太早" },
      { type: "ghost", x: 43, z: 8, memberId: "TransferGunner" },       // 正压在一个人身上
      { type: "ghost", x: 95, z: -34, memberId: "TransferGunner" },     // 空地上的那一枚
    ];
    const emptySpot = map.WorldToScreen(95, -34);
    const beforeGhost = map.PickAt(emptySpot.x, emptySpot.y);
    map.SetSketch(shapes);
    const S = (x, z) => map.WorldToScreen(x, z);
    const centre = S(0, 0);
    const rim = { x: centre.x + 12 * map.view.scale, y: centre.y };
    const arrowA = S(20, -30), arrowB = S(60, -30);
    const pathMid = S(-10, 45);
    const label = S(60, 20);
    const onMan = S(43, 8);
    const picks = {
      circleCentre: map.PickAt(centre.x, centre.y),
      circleRim: map.PickAt(rim.x, rim.y),
      arrowEnd: map.PickAt(arrowA.x, arrowA.y),
      arrowMid: map.PickAt((arrowA.x + arrowB.x) / 2, arrowA.y),
      pathSeg: map.PickAt(pathMid.x, pathMid.y),
      labelBox: map.PickAt(label.x + 18, label.y),
      ghostEmpty: map.PickAt(emptySpot.x, emptySpot.y),
      onMan: map.PickAt(onMan.x, onMan.y),
    };
    const tips = {
      circle: map.DescribeSketch({ index: 0 }),
      ghost: map.DescribeSketch({ index: 4 }),
      path: map.DescribeSketch({ index: 2 }),
    };
    // 选中那一笔要描亮：旧金像素只可能来自它（这一屏没有别的选中）。
    const plain = window.__CountMap(["select"]).selectExact;
    map.SetSelection({ kind: "sketch", index: 0 });
    const lit = window.__CountMap(["select"]).selectExact;
    map.SetSelection(null);
    // 悬停在两笔之间挪动要认得出「换了一个」（草图没有 id，只有下标）
    window.__Mouse("mousemove", centre.x, centre.y);
    const hoverA = map.hover;
    window.__Mouse("mousemove", arrowA.x, arrowA.y);
    const hoverB = map.hover;
    map.SetHover(null);
    map.SetClusterGap(null);
    return { picks, tips, plain, lit, hoverA, hoverB, beforeGhost, png: map.ToPng({ scale: 1 }) };
  });
  SavePng("sketch_picks.png", sketchPick.png);
  delete sketchPick.png;
  const pk = sketchPick.picks;
  const Sketch = (sel, index) => sel?.kind === "sketch" && sel.index === index;
  Check("圈的圈心与圈周都点得中（拿到 {kind:sketch, index}）",
    Sketch(pk.circleCentre, 0) && Sketch(pk.circleRim, 0),
    `圈心 ${JSON.stringify(pk.circleCentre)}，圈周 ${JSON.stringify(pk.circleRim)}`);
  Check("箭头的端点与线身、折线的线段、标注的文字框都点得中",
    Sketch(pk.arrowEnd, 1) && Sketch(pk.arrowMid, 1) && Sketch(pk.pathSeg, 2) && Sketch(pk.labelBox, 3),
    `箭头端 ${JSON.stringify(pk.arrowEnd)} / 箭头身 ${JSON.stringify(pk.arrowMid)} / `
    + `折线 ${JSON.stringify(pk.pathSeg)} / 标注 ${JSON.stringify(pk.labelBox)}`);
  Check("空地上的候选位点得中；压在人身上的那一枚让位给人",
    Sketch(pk.ghostEmpty, 5) && pk.onMan?.kind === "member" && pk.onMan?.id === "VillageGunner",
    `空地 ${JSON.stringify(pk.ghostEmpty)}（没放之前那儿是 ${JSON.stringify(sketchPick.beforeGhost)}）；`
    + `压在人身上点到 ${JSON.stringify(pk.onMan)}`);
  Check("选中的那一笔描亮（旧金像素只可能来自它）",
    sketchPick.plain === 0 && sketchPick.lit > 40,
    `没选中 ${sketchPick.plain} px → 选中 ${sketchPick.lit} px`);
  Check("提示写人话，不写 type 与下标",
    sketchPick.tips.circle[0] === "圈选 · 半径 12 m"
    && sketchPick.tips.ghost[0] === "候选位 · TransferGunner"
    && /^折线 · 3 个点/.test(sketchPick.tips.path[0]),
    `${sketchPick.tips.circle[0]} ｜ ${sketchPick.tips.ghost[0]} ｜ ${sketchPick.tips.path[0]}`);
  Check("悬停在不同的两笔之间换得过来（草图靠下标区分）",
    Sketch(sketchPick.hoverA, 0) && Sketch(sketchPick.hoverB, 1),
    `${JSON.stringify(sketchPick.hoverA)} → ${JSON.stringify(sketchPick.hoverB)}`);

  // -------------------------------------------------------------------------
  // 9g) 候选位放歪了能重新放（从 ghost 上按下再拖）
  // -------------------------------------------------------------------------
  const ghostMove = await page.evaluate(() => {
    const map = window.__map;
    const events = window.__events;
    map.SetPhase(12);
    map.ZoomTo({ x: 43, z: 8 }, 60);
    map.SetSketch([{ type: "ghost", x: 95, z: -34, memberId: "TransferGunner" }]);
    map.SetTool("move");
    const from = map.WorldToScreen(95, -34);
    const before = events.move.length;
    window.__Mouse("mousedown", from.x, from.y);
    window.__Mouse("mousemove", from.x + 50, from.y + 30);
    window.__Mouse("mouseup", from.x + 50, from.y + 30);
    const payload = events.move[events.move.length - 1];
    const want = map.ScreenToWorld(from.x + 50, from.y + 30);
    map.SetTool("select");
    map.SetSketch([]);
    return { added: events.move.length - before, payload, want, left: map.drag };
  });
  Check("从候选位上按下再拖 = 重新放它（target 还是原来那个人）",
    ghostMove.added === 1 && ghostMove.payload?.target?.kind === "member"
    && ghostMove.payload?.target?.id === "TransferGunner"
    && Math.hypot(ghostMove.payload.to.x - ghostMove.want.x, ghostMove.payload.to.z - ghostMove.want.z) < 0.5
    && ghostMove.left === null,
    `target=${JSON.stringify(ghostMove.payload?.target)} → (${ghostMove.payload?.to?.x?.toFixed(1)}, ${ghostMove.payload?.to?.z?.toFixed(1)})`);

  // -------------------------------------------------------------------------
  // 9h) @ 提及：Ctrl+点发出去，不改选中；武装一次就只管一次
  // -------------------------------------------------------------------------
  const mention = await page.evaluate(() => {
    const map = window.__map;
    const events = window.__events;
    map.SetTool("select");
    map.SetSketch([]);
    map.SetSelection(null);
    map.SetHover(null);
    map.SetLive(null);
    map.SetClusterGap(0);
    map.SetPhase(12);
    map.ZoomTo({ x: 43, z: 8 }, 40);
    const on = map.WorldToScreen(43, 8);
    const empty = { x: on.x + 260, y: on.y + 240 };
    const out = {};
    const Counts = () => ({ mention: events.mention.length, select: events.select.length });

    // --- Ctrl+点：发 mention、不改选中 ---
    let base = Counts();
    window.__Mouse("mousedown", on.x, on.y, 0, { ctrlKey: true });
    window.__Mouse("mouseup", on.x, on.y, 0, { ctrlKey: true });
    out.ctrlAdded = events.mention.length - base.mention;
    out.ctrlSelectAdded = events.select.length - base.select;
    out.ctrlSel = events.mention[events.mention.length - 1];
    out.selectionAfterCtrl = map.selection;

    // --- 平移工具下也认（任何工具都认） ---
    map.SetTool("pan");
    base = Counts();
    const cx = map.view.cx;
    window.__Mouse("mousedown", on.x, on.y, 0, { ctrlKey: true });
    window.__Mouse("mousemove", on.x + 40, on.y + 40, 0, { ctrlKey: true });
    window.__Mouse("mouseup", on.x + 40, on.y + 40, 0, { ctrlKey: true });
    out.panToolAdded = events.mention.length - base.mention;
    out.panToolMoved = Math.abs(map.view.cx - cx);
    map.SetTool("select");

    // --- 武装：普通一下等同 Ctrl+点，点完就解除 ---
    map.ArmMention(true);
    out.armed = map.mentionArmed;
    out.cursor = map.canvas.style.cursor;
    window.__Mouse("mousemove", on.x, on.y);
    out.hint = map.cursorHint?.text || "";
    base = Counts();
    window.__Mouse("mousedown", on.x, on.y);
    window.__Mouse("mouseup", on.x, on.y);
    out.armedAdded = events.mention.length - base.mention;
    out.armedSelectAdded = events.select.length - base.select;
    out.disarmed = map.mentionArmed === false;
    out.cursorBack = map.canvas.style.cursor;
    // 再点一次：已经解除了，这一下就是普通选中
    base = Counts();
    window.__Mouse("mousedown", on.x, on.y);
    window.__Mouse("mouseup", on.x, on.y);
    out.afterDisarmMention = events.mention.length - base.mention;
    out.afterDisarmSelect = events.select.length - base.select;

    // --- 武装之后点空地：不发 mention，但照样解除 ---
    map.ArmMention(true);
    base = Counts();
    window.__Mouse("mousedown", empty.x, empty.y);
    window.__Mouse("mouseup", empty.x, empty.y);
    out.emptyAdded = events.mention.length - base.mention;
    out.emptyDisarmed = map.mentionArmed === false;

    map.SetSelection(null);
    map.SetClusterGap(null);
    return out;
  });
  Check("Ctrl+点发 @ 提及，载荷与 onSelect 同形，且不改选中",
    mention.ctrlAdded === 1 && mention.ctrlSel?.kind === "member" && mention.ctrlSel?.id === "VillageGunner"
    && Number.isFinite(mention.ctrlSel?.x) && mention.ctrlSelectAdded === 0
    && mention.selectionAfterCtrl === null,
    `${JSON.stringify(mention.ctrlSel)}；选中回调 +${mention.ctrlSelectAdded}，selection=${JSON.stringify(mention.selectionAfterCtrl)}`);
  Check("任何工具下都认（平移工具下 Ctrl+点不平移）",
    mention.panToolAdded === 1 && mention.panToolMoved < 0.001,
    `+${mention.panToolAdded} 条，视野挪了 ${mention.panToolMoved.toFixed(3)} m`);
  Check("ArmMention 之后普通一点就是 @，光标与提示都跟着变",
    mention.armed === true && mention.cursor === "crosshair"
    && mention.hint === "点一个对象 = @ 它" && mention.armedAdded === 1
    && mention.armedSelectAdded === 0 && mention.disarmed && mention.cursorBack !== "crosshair",
    `提示「${mention.hint}」，点完解除=${mention.disarmed}，光标还原为「${mention.cursorBack || "（默认）"}」`);
  Check("武装只管一次：再点就是普通选中",
    mention.afterDisarmMention === 0 && mention.afterDisarmSelect === 1,
    `mention +${mention.afterDisarmMention} / select +${mention.afterDisarmSelect}`);
  Check("武装之后点空地：不发 @，但那个模式也解除掉",
    mention.emptyAdded === 0 && mention.emptyDisarmed,
    `+${mention.emptyAdded} 条，已解除=${mention.emptyDisarmed}`);

  // -------------------------------------------------------------------------
  // 9i) 实时小队：跟着玩家走的那个班画在图上、点得中、名字写在旁边
  // -------------------------------------------------------------------------
  const squad = await page.evaluate(() => {
    const map = window.__map;
    map.SetTool("select");
    map.SetSketch([]);
    map.SetSelection(null);
    map.SetHover(null);
    map.SetFilter(null);
    map.SetLive(null);
    map.SetPhase(12);
    map.ZoomTo({ x: 100, z: 100 }, 60);
    const before = window.__CountMap(["friendly", "liveDead"]);
    map.SetLive({
      player: { x: 100, z: 100, yaw: 0 },
      enemies: [],
      squad: [
        { id: "luo", label: "罗班长", x: 112, z: 92, alive: true, yaw: Math.PI / 2 },
        { id: "zhou", label: "老周", x: 88, z: 108, alive: true, yaw: null },
        { id: "wang", label: "小王", x: 100, z: 118, alive: false, yaw: null },
      ],
    });
    const after = window.__CountMap(["friendly", "liveDead"]);
    const Marks = () => (map.drawnMarkers || []).filter((entry) => entry.kind === "liveFriendly");
    const marks = Marks().map((entry) => `${entry.id}:${entry.state}:${entry.icon || "无图标"}`).sort();
    const luo = map.WorldToScreen(112, 92);
    const pick = map.PickAt(luo.x, luo.y);
    const tip = map.DescribeSel(pick);
    const dead = map.WorldToScreen(100, 118);
    const deadTip = map.DescribeSel(map.PickAt(dead.x, dead.y));
    const names = (map.placedLabels || []).map((entry) => entry.text)
      .filter((text) => ["罗班长", "老周", "小王"].includes(text)).sort();
    // 「只看某一处设计友军点」不许把正跟着玩家走的班滤没了（两套 id 不是一个命名空间）
    map.SetFilter({ friendlies: new Set(["playerStart"]) });
    const filtered = Marks().length;
    map.SetFilter(null);
    map.SetLayers({ live: false });
    const layerOff = Marks().length;
    map.SetLayers({ live: true });
    const png = map.ToPng({ scale: 1 });
    map.SetLive(null);
    return { before, after, marks, pick, tip, deadTip, names, filtered, layerOff, png };
  });
  SavePng("live_squad.png", squad.png);
  delete squad.png;
  Check("实时小队三个人都画出来了，阵亡的那个是灰叉",
    squad.marks.join(" ") === "luo:alive:FriendlySquad wang:dead:无图标 zhou:alive:FriendlySquad"
    && squad.after.friendly > squad.before.friendly
    && squad.before.liveDeadExact === 0 && squad.after.liveDeadExact > 0,
    `${squad.marks.join("、")}；友军色 ${squad.before.friendly} → ${squad.after.friendly} px，`
    + `阵亡灰 ${squad.before.liveDeadExact} → ${squad.after.liveDeadExact} px`);
  Check("点得中实时小队成员，提示写中文名与死活",
    squad.pick?.kind === "friendly" && squad.pick?.id === "luo" && squad.pick?.live === true
    && squad.tip[0] === "实时 · 罗班长（活着）" && squad.deadTip[0] === "实时 · 小王（阵亡）",
    `${JSON.stringify(squad.pick)} ｜ ${squad.tip.join(" ｜ ")} ｜ ${squad.deadTip[0]}`);
  Check("名字画在旁边（走的是同一套避让排版）",
    squad.names.length === 3 && ["罗班长", "老周", "小王"].every((name) => squad.names.includes(name)),
    squad.names.join("、") || "（一个名字都没排上）");
  Check("按设计友军点过滤不会把实时小队误滤掉；关掉实机层才没有",
    squad.filtered === 3 && squad.layerOff === 0,
    `过滤后还剩 ${squad.filtered} 个，关掉实机层剩 ${squad.layerOff} 个`);

  // -------------------------------------------------------------------------
  // 9j) 打死一个人，设计层当场看得出来
  // -------------------------------------------------------------------------
  const killed = await page.evaluate(() => {
    const map = window.__map;
    map.SetTool("select");
    map.SetSelection(null);
    map.SetHover(null);
    map.SetFilter(null);
    map.SetLive(null);
    map.SetPhase(12);
    map.SetClusterGap(0);
    const transfer = (map.phaseLayout.encounters || []).find((entry) => entry.id === "transfer");
    const members = (transfer.members || []).map((member) => ({ id: member.id, x: member.x, z: member.z }));
    const victim = members[0];
    map.ZoomTo({ x: victim.x, z: victim.z }, 30);
    const p = map.WorldToScreen(victim.x, victim.z);
    const box = { x: p.x - 11, y: p.y - 11, w: 22, h: 22 };
    const Mark = () => (map.drawnMarkers || []).find((entry) => entry.kind === "member" && entry.id === victim.id);
    const beforeGray = window.__CountRect("liveDead", box);
    const beforeState = Mark()?.state;
    // 尸体本身画在三十米外（人是往前扑倒的）—— 量的是**设计层**那一枚变没变
    map.SetLive({ enemies: [{ id: victim.id, alive: false, encounter: "transfer", x: victim.x + 30, z: victim.z + 30 }] });
    const afterGray = window.__CountRect("liveDead", box);
    const afterState = Mark()?.state;
    const tip = map.DescribeSel({ kind: "member", id: victim.id });
    const others = (map.drawnMarkers || [])
      .filter((entry) => entry.kind === "member" && entry.state === "dead").map((entry) => entry.id);
    map.SetLayers({ live: false });
    const layerOffState = Mark()?.state;
    map.SetLayers({ live: true });

    // 并成一枚的时候人数芯片写「活着/总数」，全灭整撮转灰
    map.SetFilter({ encounters: new Set(["transfer"]) });
    map.SetClusterGap(200);
    map.FitPhase(12);
    const Cluster = () => (map.drawnMarkers || []).find((entry) => entry.kind === "cluster" && entry.encounter === "transfer");
    const partial = Cluster();
    map.SetLive({ enemies: members.map((m) => ({ id: m.id, alive: false, encounter: "transfer", x: m.x, z: m.z })) });
    const wiped = Cluster();
    map.SetLive(null);
    const clean = Cluster();
    map.SetFilter(null);
    map.SetClusterGap(null);
    map.FitBounds();
    return {
      victim: victim.id, total: members.length, beforeGray, afterGray, beforeState, afterState,
      tip, others, layerOffState,
      partial: partial ? { count: partial.count, alive: partial.alive, state: partial.state } : null,
      wiped: wiped ? { count: wiped.count, alive: wiped.alive, state: wiped.state } : null,
      clean: clean ? { count: clean.count, alive: clean.alive, state: clean.state } : null,
    };
  });
  Check("击毙的那个人在设计层变灰（drawnMarkers 里 state=dead）",
    killed.beforeState !== "dead" && killed.afterState === "dead"
    && killed.beforeGray === 0 && killed.afterGray > 0,
    `${killed.victim}：${killed.beforeState} → ${killed.afterState}，`
    + `他那一小块里的灰 ${killed.beforeGray} → ${killed.afterGray} px`);
  Check("只有被打死的那一个变（drawnMarkers 数得出击毙数）",
    killed.others.length === 1 && killed.others[0] === killed.victim,
    `state=dead 的有 ${killed.others.length} 个：${killed.others.join("、")}`);
  Check("提示里写「已击毙」；关掉实机层就回到纯设计",
    killed.tip.some((line) => line.includes("已击毙")) && killed.layerOffState !== "dead",
    `${killed.tip.join(" ｜ ")}；关掉实机层后 state=${killed.layerOffState}`);
  Check("并成一枚时人数芯片写「活着/总数」，全灭整撮转灰",
    killed.partial?.count === killed.total && killed.partial?.alive === killed.total - 1
    && killed.partial?.state !== "dead"
    && killed.wiped?.alive === 0 && killed.wiped?.state === "dead"
    && killed.clean?.alive === null,
    `打死一个 ${killed.partial?.alive}/${killed.partial?.count}，全灭 ${killed.wiped?.alive}/${killed.wiped?.count}`
    + `（state=${killed.wiped?.state}），没有实机数据时写总数 ${killed.clean?.count}`);

  // -------------------------------------------------------------------------
  // 9k) 玩家箭头真的按 yaw 转，而且转对了方向
  //
  // 玩家 forward = (−sin yaw, −cos yaw)：yaw 0 朝 −Z（屏幕上方），yaw = +π/2 朝 −X
  // （屏幕左方）。图标本身是一支宽底窄尖的箭头，所以「尖端朝哪儿」= 像素少的那一侧。
  // -------------------------------------------------------------------------
  const heading = await page.evaluate(() => {
    const map = window.__map;
    map.SetLive(null);
    map.SetFilter(null);
    map.SetSelection(null);
    map.SetHover(null);
    map.SetPhase(12);
    map.SetLayers({ legend: false });      // 图例里那一行「实时 · 玩家」用的是同一张图、同一种颜色
    map.ZoomTo({ x: 100, z: 100 }, 30);
    const p = map.WorldToScreen(100, 100);
    const Shot = (yaw) => {
      map.SetLive({ player: { x: 100, z: 100, yaw }, enemies: [] });
      return window.__PlayerPixels(p.x, p.y, 26);
    };
    const north = Shot(0);
    const west = Shot(Math.PI / 2);
    const east = Shot(-Math.PI / 2);
    map.SetLive(null);
    map.SetLayers({ legend: true });
    return { north, west, east };
  });
  // 绕图标中心转：yaw 0 的每个像素 (dx,dy) 转 −90° 之后应落在 yaw=+π/2 那一版的 (dy,−dx)。
  const westSet = new Set(heading.west.offsets.map(([x, y]) => `${x},${y}`));
  let mapped = 0;
  for (const [dx, dy] of heading.north.offsets) {
    let hit = false;
    for (let ox = -1; ox <= 1 && !hit; ox += 1) {
      for (let oy = -1; oy <= 1 && !hit; oy += 1) if (westSet.has(`${dy + ox},${-dx + oy}`)) hit = true;
    }
    if (hit) mapped += 1;
  }
  const overlap = heading.north.offsets.length ? mapped / heading.north.offsets.length : 0;
  // 数出来只有几十个像素是正常的：标记是**固定屏幕尺寸**的符号（封顶 22 px），
  // 再转个角度就全是重采样混出来的中间色。方向靠的是两侧的比例和整体的旋转对位，
  // 不是像素总量。
  Check("玩家箭头画得出来，两个朝向的像素分布不一样",
    heading.north.n >= 25 && heading.west.n >= 25
    && heading.north.offsets.map((o) => o.join(",")).join(";")
      !== heading.west.offsets.map((o) => o.join(",")).join(";"),
    `yaw 0：上 ${heading.north.up} / 下 ${heading.north.down} / 左 ${heading.north.left} / 右 ${heading.north.right}；`
    + `yaw +π/2：上 ${heading.west.up} / 下 ${heading.west.down} / 左 ${heading.west.left} / 右 ${heading.west.right}`);
  Check("yaw 0 尖端朝上、yaw = +π/2 尖端朝左（−π/2 朝右）",
    heading.north.down > heading.north.up * 1.3
    && heading.west.right > heading.west.left * 1.3
    && heading.east.left > heading.east.right * 1.3,
    `朝北 下/上 = ${(heading.north.down / Math.max(1, heading.north.up)).toFixed(2)}；`
    + `朝西 右/左 = ${(heading.west.right / Math.max(1, heading.west.left)).toFixed(2)}；`
    + `朝东 左/右 = ${(heading.east.left / Math.max(1, heading.east.right)).toFixed(2)}`);
  Check("是绕图标中心整体转的（把 yaw 0 那一版转 −90° 能对上 yaw = +π/2 那一版）",
    overlap >= 0.6,
    `${(overlap * 100).toFixed(0)}% 的像素对得上（${mapped}/${heading.north.offsets.length}）`);

  // -------------------------------------------------------------------------
  // 10) Dispose：再派发事件不再触发任何回调
  // -------------------------------------------------------------------------
  const disposed = await page.evaluate(() => {
    const map = window.__map;
    map.SetTool("circle");
    const Snapshot = () => ({
      select: window.__events.select.length,
      hover: window.__events.hover.length,
      sketch: window.__events.sketch.length,
      move: window.__events.move.length,
      mention: window.__events.mention.length,
    });
    const counts = Snapshot();
    map.Dispose();
    const a = map.WorldToScreen(40, 20);
    window.__Mouse("mousedown", a.x, a.y);
    window.__Mouse("mousemove", a.x + 30, a.y + 30);
    window.__Mouse("mouseup", a.x + 30, a.y + 30);
    map.SetTool("select");
    window.__Mouse("mousedown", a.x, a.y);
    window.__Mouse("mouseup", a.x, a.y);
    window.__Mouse("mousedown", a.x, a.y, 0, { ctrlKey: true });
    // 折线的键盘出口也得跟着 Dispose 一起摘掉
    map.SetTool("path");
    window.__Mouse("mousedown", a.x, a.y);
    window.__Key("Enter");
    map.canvas.dispatchEvent(new WheelEvent("wheel", { clientX: 10, clientY: 10, deltaY: -200, bubbles: true }));
    let threw = null;
    try { map.Redraw(); map.SetPhase(4); } catch (error) { threw = String(error); }
    return { after: Snapshot(), counts, threw, flag: map.disposed };
  });
  const quiet = ["select", "hover", "sketch", "move", "mention"].every((k) => disposed.after[k] === disposed.counts[k]);
  Check("Dispose 后再派发事件不再触发回调（键盘与 @ 提及也一起摘掉）", quiet,
    `select ${disposed.counts.select}→${disposed.after.select}, sketch ${disposed.counts.sketch}→${disposed.after.sketch}, `
    + `move ${disposed.counts.move}→${disposed.after.move}, hover ${disposed.counts.hover}→${disposed.after.hover}, `
    + `mention ${disposed.counts.mention}→${disposed.after.mention}`);
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
