/* =====================================================================
   夜袭·正太路 —— 无头冒烟回归
   node TaihangDemo/NightRaid/Script_SmokeTest.mjs

   重点不是"规则函数对不对"，而是"玩家到底能不能操作"：
   用桩 DOM 捕获 canvas 的真实事件回调，派发合成 pointer/click 事件，
   断言 点部队→选中 / 点亮格→坐标真的变了 / 手抖仍算点击 / 拖动不误选。
   ===================================================================== */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(HERE, "index.html"), "utf8");

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  <<< " + extra : "")); }
};
const section = (t) => console.log("\n── " + t + " " + "─".repeat(Math.max(0, 56 - t.length)));

/* ── 桩 DOM ──────────────────────────────────────────────────────── */
const CTX2D_METHODS = [
  "save","restore","beginPath","closePath","moveTo","lineTo","arc","quadraticCurveTo",
  "fill","stroke","fillRect","strokeRect","clearRect","translate","rotate","scale",
  "setTransform","drawImage","fillText","strokeText","setLineDash","clip","rect","arcTo","bezierCurveTo"
];
function makeCtx() {
  const c = {
    canvas: null, globalAlpha: 1, lineWidth: 1, lineCap: "butt", lineDashOffset: 0,
    fillStyle: "", strokeStyle: "", font: "", textAlign: "", textBaseline: "",
    shadowColor: "", shadowBlur: 0,
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 10 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) })
  };
  for (const m of CTX2D_METHODS) c[m] = () => {};
  return c;
}
class El {
  constructor(tag, id) {
    this.tagName = (tag || "div").toUpperCase();
    this.id = id || "";
    this.style = {};
    this.children = [];
    this._html = "";
    this.textContent = "";
    this.className = "";
    this.title = "";
    this.disabled = false;
    this.onclick = null;
    this.width = 0; this.height = 0;
    this.offsetHeight = 0; this.offsetWidth = 0;
    this._listeners = new Map();
    this._ctx = null;
    this.classList = {
      add: (c) => { if (!this.className.split(/\s+/).includes(c)) this.className = (this.className + " " + c).trim(); },
      remove: (c) => { this.className = this.className.split(/\s+/).filter(x => x && x !== c).join(" "); },
      toggle: (c, on) => {
        const has = this.className.split(/\s+/).includes(c);
        const want = on === undefined ? !has : !!on;
        if (want) this.classList.add(c); else this.classList.remove(c);
      },
      contains: (c) => this.className.split(/\s+/).includes(c)
    };
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); if (v === "") this.children = []; }
  get firstChild() { return this.children[0] || null; }
  appendChild(n) { this.children.push(n); return n; }
  removeChild(n) { this.children = this.children.filter(x => x !== n); return n; }
  getContext() { if (!this._ctx) { this._ctx = makeCtx(); this._ctx.canvas = this; } return this._ctx; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800, x: 0, y: 0 }; }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const a = this._listeners.get(type); if (a) this._listeners.set(type, a.filter(x => x !== fn));
  }
  dispatch(type, ev) {
    const a = this._listeners.get(type) || [];
    for (const fn of a) fn(ev);
    return a.length;
  }
  querySelector() { return null; }
}

const IDS = ["cv","top","dayNum","phaseTag","railFill","railVal","expFill","expVal","ammoVal","heartVal",
             "btnCover","btnHelp","btnDawn","roster","bottom","actWrap","actTitle","acts","logBox",
             "banner","bannerT","bannerS","hint","tip","toast","modalRoot"];
const registry = new Map();
for (const id of IDS) registry.set(id, new El(id === "cv" ? "canvas" : "div", id));

const documentStub = {
  readyState: "complete",
  getElementById: (id) => registry.get(id) || null,
  createElement: (tag) => new El(tag),
  querySelector: (sel) => (sel && sel[0] === "#") ? (registry.get(sel.slice(1)) || null) : null,
  addEventListener: () => {},
  body: new El("body")
};

const rafQueue = [];
const windowStub = {
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
  requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
  cancelAnimationFrame: () => {},
  addEventListener: () => {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  performance: { now: () => Date.now() },
  localStorage: { _d: new Map(), getItem(k) { return this._d.has(k) ? this._d.get(k) : null; }, setItem(k, v) { this._d.set(k, String(v)); }, removeItem(k) { this._d.delete(k); } }
  // 故意不提供 AudioContext：音频缺失不得影响可玩性
};

const sandbox = {
  window: windowStub, document: documentStub,
  requestAnimationFrame: windowStub.requestAnimationFrame,
  cancelAnimationFrame: windowStub.cancelAnimationFrame,
  performance: windowStub.performance,
  setTimeout, clearTimeout, setInterval, clearInterval,
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, Error,
  Map, Set, Uint8ClampedArray, isNaN, parseInt, parseFloat, Infinity, NaN, undefined
};
sandbox.globalThis = sandbox;
sandbox.self = windowStub;

/* ── 抽出脚本 & 语法校验 ─────────────────────────────────────────── */
section("加载与语法");
const m = HTML.match(/<script>([\s\S]*?)<\/script>/);
ok(!!m, "index.html 内含 <script> 主体");
const CODE = m ? m[1] : "";
ok(CODE.length > 20000, "脚本主体长度合理", CODE.length + " chars");
let compiled = null;
try { compiled = new vm.Script(CODE, { filename: "NightRaid.js" }); ok(true, "脚本语法通过 (vm.Script 编译)"); }
catch (e) { ok(false, "脚本语法通过 (vm.Script 编译)", e.message); }

if (!compiled) { console.log("\n语法即失败，终止。"); process.exit(1); }

const ctxVm = vm.createContext(sandbox);
let bootErr = null;
try { compiled.runInContext(ctxVm); } catch (e) { bootErr = e; }
ok(!bootErr, "Boot() 无异常完成", bootErr && (bootErr.message + "\n" + bootErr.stack));
const NR = sandbox.window.NR;
ok(!!NR, "暴露 window.NR 测试钩子");
if (!NR) process.exit(1);
NR.setSkipAnim(true); NR.setMuted(true);

const cv = registry.get("cv");
const G = NR.G;

/* ── 布点健全性（历史翻车点 #1 / #2）────────────────────────────── */
section("开局布点健全性");
ok(G.units.length === 5, "五支队伍全部生成", "实际 " + G.units.length);
ok(G.units.every(u => !!NR.T(u.q, u.r)), "每支队伍都落在合法地块上");
ok(G.units.every(u => u.alive && u.str > 0), "每支队伍开局存活");
const spawnTiles = G.units.map(u => NR.K(u.q, u.r));
ok(new Set(spawnTiles).size >= 4, "队伍没有全部叠在同一格", "唯一格 " + new Set(spawnTiles).size);
ok(G.units.every(u => NR.T(u.q, u.r).terr !== "water"), "没有队伍生成在水里");

for (const u of G.units) {
  const rc = NR.Reachable(u);
  ok(rc.cost.size >= 8, `【${u.name}】开局可达格 >= 8`, "实际 " + rc.cost.size);
}
const hq = G.tiles.find(t => t.vill && t.vill.base);
ok(!!hq && hq.vill.side === "ours", "总部村存在且归我方");
ok(G.forts.length >= 6, "日军设施数量合理", "实际 " + G.forts.length);
ok(G.tiles.filter(t => t.rail).length === NR.CFG.mapW, "铁路贯通整幅地图");
ok(G.tiles.filter(t => t.vill).length >= 6, "村庄数量合理");

/* ── 坐标往返 ───────────────────────────────────────────────────── */
section("六边形坐标往返");
let rtBad = 0;
for (const t of G.tiles) {
  const p = NR.hexToPix(t.q, t.r, NR.view.s);
  const h = NR.pixToHex(p.x, p.y, NR.view.s);
  if (h.q !== t.q || h.r !== t.r) rtBad++;
}
ok(rtBad === 0, "所有地块 像素→六边形 反解正确", rtBad + " 个不一致");

/* ── 真实交互链路（历史翻车点 #3 / #4）──────────────────────────── */
section("交互链路：合成 pointer 事件");
ok((cv._listeners.get("pointerdown") || []).length > 0, "canvas 已挂 pointerdown");
ok((cv._listeners.get("pointerup") || []).length > 0, "canvas 已挂 pointerup");
ok((cv._listeners.get("click") || []).length > 0, "canvas 已挂 click 兜底");

const screenOf = (q, r) => {
  const p = NR.hexToPix(q, r, NR.view.s);
  return { x: p.x + NR.view.ox, y: p.y + NR.view.oy };
};
const ev = (x, y, id) => ({ clientX: x, clientY: y, pointerId: id === undefined ? 1 : id, preventDefault() {}, button: 0 });
function tap(x, y, jitter = 0) {
  cv.dispatch("pointerdown", ev(x, y));
  if (jitter) cv.dispatch("pointermove", ev(x + jitter, y + jitter));
  cv.dispatch("pointerup", ev(x + jitter, y + jitter));
}

// 1) 点部队 → 选中
const target = G.units[2];              // 特务连
NR.SEL = G.units[0];
const sp = screenOf(target.q, target.r);
tap(sp.x, sp.y);
ok(NR.SEL === target, "点地图上的部队 → 真的选中了它", "SEL=" + (NR.SEL && NR.SEL.name));

// 2) 5px 手抖仍算点击
NR.SEL = G.units[0];
tap(sp.x, sp.y, 5);
ok(NR.SEL === target, "5px 手抖仍判定为点击（不被拖拽吃掉）");

// 3) 30px 拖动不误选（应视作平移）
NR.SelectUnit(G.units[0]);
const oxBefore = NR.view.ox;
cv.dispatch("pointerdown", ev(sp.x, sp.y));
cv.dispatch("pointermove", ev(sp.x + 30, sp.y + 12));
cv.dispatch("pointerup", ev(sp.x + 30, sp.y + 12));
ok(NR.SEL === G.units[0], "30px 拖动不会误选部队");
ok(NR.view.ox !== oxBefore, "30px 拖动确实平移了视图");
NR.view.ox = oxBefore;

// 4) 点亮格 → 坐标真的变了（最关键的一条）
NR.SelectUnit(G.units[0]);
const mover = NR.SEL;
const before = { q: mover.q, r: mover.r, mp: mover.mp };
const reachKeys = [...NR.REACH.cost.keys()];
ok(reachKeys.length >= 8, "选中后 REACH 有足够多的可达格", reachKeys.length + " 格");
const [tq, tr] = reachKeys[Math.floor(reachKeys.length / 2)].split(",").map(Number);
const tp = screenOf(tq, tr);
tap(tp.x, tp.y);
ok(mover.q === tq && mover.r === tr,
   "点亮格 → 部队坐标真的变了",
   `期望 ${tq},${tr} 实得 ${mover.q},${mover.r}`);
ok(mover.mp < before.mp, "移动消耗了机动力", `${before.mp} → ${mover.mp}`);

// 5) click 兜底（无 pointer 事件的环境）
await new Promise(res => setTimeout(res, 400));
NR.SEL = G.units[1];
const sp2 = screenOf(target.q, target.r);
cv.dispatch("click", ev(sp2.x, sp2.y));
ok(NR.SEL === target, "仅 click（无 pointer 事件）也能选中部队");

// 6) 点不可达处不崩、给反馈
const far = G.tiles.find(t => NR.hexDist(t.q, t.r, NR.SEL.q, NR.SEL.r) > 6);
let tapErr = null;
try { const fp = screenOf(far.q, far.r); tap(fp.x, fp.y); } catch (e) { tapErr = e; }
ok(!tapErr, "点击远处不可达格不抛异常", tapErr && tapErr.message);
ok(registry.get("toast").textContent.length > 0, "点不可达格有明确文字反馈", registry.get("toast").textContent);

// 7) 点画布外不崩
let outErr = null;
try { tap(-9999, -9999); } catch (e) { outErr = e; }
ok(!outErr, "点击地图外不抛异常");

/* ── 隐蔽规则（本作的核心钩子）──────────────────────────────────── */
section("隐蔽规则：夜出昼归");
const mt = G.tiles.find(t => t.terr === "mountain" && !t.fort && !t.rail && !t.road);
const pl = G.tiles.find(t => t.terr === "plain" && !t.fort && !t.rail && !t.road &&
                             !NR.NB(t.q, t.r).some(([q, r]) => NR.T(q, r) && NR.T(q, r).fort));
const rl = G.tiles.find(t => t.rail && !t.fort);
ok(NR.IsConcealed(mt, null) === true, "山地：天亮可隐蔽");
ok(NR.IsConcealed(pl, null) === false, "平原：天亮会暴露");
ok(NR.IsConcealed(rl, null) === false, "铁路上：天亮会暴露");
ok(NR.IsConcealed(hq, null) === true, "我方村庄：天亮可隐蔽");
const wt = G.units.find(u => u.role === "workteam");
ok(NR.IsConcealed(pl, wt) === true, "武工队着便衣：平原也隐蔽");

/* ── 地图连通性：河不能把地图切成两半（"口袋"级翻车的老家）──────── */
section("地图连通性");
{
  const probe = { role: "main", q: hq.q, r: hq.r, mp: 0 };
  const seen = new Set([NR.K(hq.q, hq.r)]);
  const queue = [hq];
  while (queue.length) {
    const cur = queue.shift();
    for (const [q, r] of NR.NB(cur.q, cur.r)) {
      const t = NR.T(q, r);
      if (!t || seen.has(NR.K(q, r))) continue;
      if (t.terr === "water" || t.fort) continue;
      seen.add(NR.K(q, r)); queue.push(t);
    }
  }
  const walkable = G.tiles.filter(t => t.terr !== "water" && !t.fort);
  const ratio = seen.size / walkable.length;
  ok(ratio >= 0.85, "总部可达全图 85% 以上的可通行地块（河没把地图切断）",
     `${seen.size}/${walkable.length} = ${(ratio * 100).toFixed(0)}%`);

  const railReach = G.tiles.filter(t => t.rail && !t.fort).filter(t => seen.has(NR.K(t.q, t.r)));
  const railAll = G.tiles.filter(t => t.rail && !t.fort);
  ok(railReach.length === railAll.length, "每一段无设施的铁路都走得到",
     `${railReach.length}/${railAll.length}`);
  void probe;
}

/* ── 核心循环可行性：夜出昼归的往返预算（曾经被打破过，锁死它）──── */
section("核心循环：下山→动手→回山 的往返预算");
{
  // 跳板带必须真的存在：铁路旁 1 格之内要有藏得住人的地方
  const railTiles = G.tiles.filter(t => t.rail && !t.fort);
  const withCover = railTiles.filter(t =>
    NR.NB(t.q, t.r).some(([q, r]) => { const n = NR.T(q, r); return n && NR.IsConcealed(n, null); }));
  ok(withCover.length >= railTiles.length * 0.6,
     "多数铁路段旁 1 格内有隐蔽地形（跳板带存在）",
     `${withCover.length}/${railTiles.length}`);

  // 每个兵种：从跳板出发，破袭后必须还回得去
  for (const def of [["main", "主力营"], ["recon", "特务连"], ["sapper", "工兵排"]]) {
    const u = G.units.find(x => x.role === def[0]);
    let feasible = false, bestNeed = 99;
    for (const rt of withCover) {
      const cover = NR.NB(rt.q, rt.r)
        .map(([q, r]) => NR.T(q, r))
        .filter(n => n && NR.IsConcealed(n, null) && !n.fort && n.terr !== "water");
      if (!cover.length) continue;
      const start = cover[0];
      const saveQ = u.q, saveR = u.r, saveMp = u.mp;
      u.q = start.q; u.r = start.r; u.mp = u.maxMp;
      const out = NR.Reachable(u).cost.get(NR.K(rt.q, rt.r));
      if (out !== undefined) {
        u.q = rt.q; u.r = rt.r; u.mp = u.maxMp - out - 1;   // 破袭再花 1 点机动
        const back = NR.Reachable(u);
        let home = Infinity;
        for (const [k, c] of back.cost) {
          const [q, r] = k.split(",").map(Number);
          if (NR.IsConcealed(NR.T(q, r), u)) home = Math.min(home, c);
        }
        const need = out + 1 + home;
        bestNeed = Math.min(bestNeed, need);
        if (u.mp >= 0 && home !== Infinity) feasible = true;
      }
      u.q = saveQ; u.r = saveR; u.mp = saveMp;
      if (feasible) break;
    }
    ok(feasible, `【${def[1]}】能在一夜内完成 破袭→撤回隐蔽`,
       `最省需 ${bestNeed} 点，实有 ${u.maxMp} 点`);
  }
}

/* ── 多种子地图健全性：随机地图不许生成"打不了的局"─────────────── */
section("多种子地图健全性（24 个种子）");
{
  const seeds = Array.from({ length: 24 }, (_, i) => 1 + i * 7919);
  let badConn = [], badReach = [], badCover = [], badSpawn = [], badRail = [];
  for (const sd of seeds) {
    NR.NewGame(sd);
    const h = G.tiles.find(t => t.vill && t.vill.base);
    if (!h) { badSpawn.push(sd); continue; }
    if (G.units.length !== 5 || G.units.some(u => !NR.T(u.q, u.r) || NR.T(u.q, u.r).terr === "water")) badSpawn.push(sd);

    const seen = new Set([NR.K(h.q, h.r)]); const queue = [h];
    while (queue.length) {
      const cur = queue.shift();
      for (const [q, r] of NR.NB(cur.q, cur.r)) {
        const t = NR.T(q, r);
        if (!t || seen.has(NR.K(q, r)) || t.terr === "water" || t.fort) continue;
        seen.add(NR.K(q, r)); queue.push(t);
      }
    }
    const walk = G.tiles.filter(t => t.terr !== "water" && !t.fort);
    if (seen.size / walk.length < 0.85) badConn.push(sd);

    const railAll = G.tiles.filter(t => t.rail && !t.fort);
    if (railAll.some(t => !seen.has(NR.K(t.q, t.r)))) badRail.push(sd);

    if (G.units.some(u => NR.Reachable(u).cost.size < 8)) badReach.push(sd);

    const withCover = railAll.filter(t =>
      NR.NB(t.q, t.r).some(([q, r]) => { const n = NR.T(q, r); return n && NR.IsConcealed(n, null); }));
    if (withCover.length < railAll.length * 0.5) badCover.push(sd);
  }
  ok(badSpawn.length === 0, "所有种子：五支队伍都正常落地", badSpawn.join(","));
  ok(badConn.length === 0, "所有种子：地图连通（河不切断）", badConn.join(","));
  ok(badRail.length === 0, "所有种子：每段铁路都走得到", badRail.join(","));
  ok(badReach.length === 0, "所有种子：开局每支队伍可达格 >= 8", badReach.join(","));
  ok(badCover.length === 0, "所有种子：过半铁路段旁有隐蔽（往返打得成）", badCover.join(","));
}
NR.NewGame(12345);   // 复位到确定状态，供后续用例使用

/* ── 动作规则 ───────────────────────────────────────────────────── */
section("动作规则");
// 上一节重开过地图，这里一律从当前 G 重新取引用，不复用旧地块对象
const rail2 = G.tiles.find(t => t.rail && !t.fort);
const sapper = G.units.find(u => u.role === "sapper");
sapper.q = rail2.q; sapper.r = rail2.r; sapper.mp = sapper.maxMp;
G.ammo = 30;
const ammoBefore = G.ammo, brokeBefore = rail2.railBroken, expBefore = G.exposure;
NR.SelectUnit(sapper);
const sabOk = NR.DoSabotage(sapper);
ok(sabOk === true, "工兵在铁轨上可执行破袭");
ok(rail2.railBroken > brokeBefore, "破袭后该段铁路进入中断状态", `${brokeBefore} → ${rail2.railBroken}`);
ok(rail2.railBroken === 2, "工兵破袭威力加倍 (railBroken=2)", "实际 " + rail2.railBroken);
ok(G.ammo < ammoBefore, "破袭消耗弹药", `${ammoBefore} → ${G.ammo}`);
ok(G.exposure > expBefore, "破袭抬高暴露度", `${expBefore} → ${G.exposure}`);

const main = G.units.find(u => u.role === "main");
const fort = G.forts[0];
main.q = fort.q; main.r = fort.r + 1;
if (!NR.T(main.q, main.r)) { main.q = fort.q + 1; main.r = fort.r; }
main.mp = main.maxMp; main.str = main.maxStr;
const fc = NR.Forecast(main, fort);
ok(fc.p > 0 && fc.p < 1, "战斗预览给出合法概率", "p=" + fc.p.toFixed(3));
ok(fc.hiLoss >= fc.loLoss && fc.loLoss >= 0, "预计伤亡区间合法", `${fc.loLoss}~${fc.hiLoss}`);
ok(fc.ammoCost > 0, "进攻有弹药代价", "cost=" + fc.ammoCost);
ok(fc.mods.length >= 2 && fc.dmods.length >= 1, "预览把修正项摊开列出（无黑箱）");
let asErr = null;
try { NR.DoAssault(main, fort); } catch (e) { asErr = e; }
ok(!asErr, "夜袭结算不抛异常", asErr && asErr.stack);
ok(main.mp === 0, "夜袭耗尽该队本夜机动力");

/* ── 渲染 ───────────────────────────────────────────────────────── */
section("渲染");
let renderErr = null;
try {
  for (let i = 0; i < 3; i++) { const fn = rafQueue.pop(); if (fn) fn(); }
} catch (e) { renderErr = e; }
ok(!renderErr, "Render() 连续三帧不抛异常", renderErr && renderErr.stack);
let coverErr = null;
try { registry.get("btnCover").onclick({ currentTarget: registry.get("btnCover") }); const fn = rafQueue.pop(); if (fn) fn(); }
catch (e) { coverErr = e; }
ok(!coverErr, "隐蔽图叠加层渲染不抛异常", coverErr && coverErr.stack);

/* ── 全局仿真：一个"像样玩家"打完 16 天 ─────────────────────────── */
section("全局仿真（16 昼夜 × 3 局）");
async function playRun(seed) {
  NR.NewGame(seed);
  NR.setSkipAnim(true);
  let steps = 0;
  while (!G.over && steps < 400) {
    steps++;
    for (const u of G.units) {
      if (!u.alive || u.mp <= 0) continue;
      NR.SelectUnit(u);
      // 优先：站在铁轨上就破袭
      if (NR.T(u.q, u.r).rail && G.ammo >= 3) { NR.DoSabotage(u); continue; }
      // 否则朝最近的未破坏铁路走
      const rails = G.tiles.filter(t => t.rail && t.railBroken === 0 && !t.fort);
      if (!rails.length) { u.mp = 0; continue; }
      rails.sort((a, b) => NR.hexDist(a.q, a.r, u.q, u.r) - NR.hexDist(b.q, b.r, u.q, u.r));
      const goal = rails[0];
      NR.RefreshReach();
      const R = NR.REACH;
      if (!R || !R.cost.size) { u.mp = 0; continue; }
      let best = null, bestD = 1e9;
      for (const k of R.cost.keys()) {
        const [q, r] = k.split(",").map(Number);
        const d = NR.hexDist(q, r, goal.q, goal.r);
        if (d < bestD) { bestD = d; best = [q, r]; }
      }
      if (best) NR.DoMove(u, best[0], best[1]); else u.mp = 0;
    }
    // 撤回隐蔽：只在真的暴露时才撤，且撤到离铁路最近的隐蔽处（像个会玩的人，而不是来回蹭）
    for (const u of G.units) {
      if (!u.alive || u.mp <= 0) continue;
      if (NR.IsConcealed(NR.T(u.q, u.r), u)) continue;
      NR.SelectUnit(u); NR.RefreshReach();
      if (!NR.REACH) continue;
      let best = null, bestD = 1e9;
      for (const k of NR.REACH.cost.keys()) {
        const [q, r] = k.split(",").map(Number);
        if (!NR.IsConcealed(NR.T(q, r), u)) continue;
        const d = Math.min(...G.tiles.filter(t => t.rail).map(t => NR.hexDist(q, r, t.q, t.r)));
        if (d < bestD) { bestD = d; best = [q, r]; }
      }
      if (best) NR.DoMove(u, best[0], best[1]);
    }
    NR.Dawn._confirmed = true;
    await NR.Dawn();
  }
  return { steps, turn: G.turn, over: G.over, score: JSON.parse(JSON.stringify(G.score)),
           alive: G.units.filter(u => u.alive).length, martyrs: G.martyrs.length,
           heart: G.heart, ammo: G.ammo, exposure: G.exposure };
}
for (const seed of [1, 20260726, 777]) {
  let r = null, err = null;
  try { r = await playRun(seed); } catch (e) { err = e; }
  ok(!err, `seed ${seed}：完整跑完不抛异常`, err && err.stack);
  if (r) {
    ok(r.over === true, `seed ${seed}：战役正常结束`, `turn=${r.turn} steps=${r.steps}`);
    ok(r.steps <= NR.CFG.totalTurns + 2, `seed ${seed}：回合数没有失控`, "steps=" + r.steps);
    ok(r.score.railDays > 0, `seed ${seed}：确实打出了铁路中断`, "railDays=" + r.score.railDays);
    ok(r.score.sabCount >= 3, `seed ${seed}：破袭次数合理`, "sab=" + r.score.sabCount);
    ok(r.heart >= 0 && r.heart <= 100, `seed ${seed}：民心在合法区间`, "heart=" + r.heart);
    ok(r.ammo >= 0, `seed ${seed}：弹药不为负`, "ammo=" + r.ammo);
    console.log(`     ↳ 铁路 ${r.score.railDays} 段·日 / 拔点 ${r.score.forts} / 存活 ${r.alive} / 烈士 ${r.martyrs} / 民心 ${r.heart} / 暴露 ${Math.round(r.exposure)}`);
  }
}

/* ── 结算面板 ───────────────────────────────────────────────────── */
section("结算");
const modalRoot = registry.get("modalRoot");
ok(modalRoot.children.length > 0, "战役结束后弹出结算面板");

console.log("\n" + "=".repeat(64));
console.log(`  通过 ${pass}   失败 ${fail}`);
console.log("=".repeat(64));
process.exit(fail ? 1 : 0);
