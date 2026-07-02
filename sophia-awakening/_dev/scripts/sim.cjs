#!/usr/bin/env node
/*
 * Headless smoke + progression sim for the SOPHIA game core — NO browser, NO Pixi.
 * Drives a full optimal-ish playthrough and asserts the core still:
 *   1) never throws across the run,
 *   2) reaches max intelligence level,
 *   3) lets every milestone be bought,
 *   4) fires the ending.
 *
 * Run with `npm run sim` (it compiles src/core via tsconfig.sim.json first).
 * Exit code 0 = PASS, 1 = FAIL — so it doubles as a cheap regression gate after
 * any economy / progression / request change, instead of opening a browser.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const build = path.join(root, ".sim-build");

// tsc does NOT copy JSON imports — drop the locale packs next to the compiled
// output, and mark the build dir CommonJS (the _dev package.json is type:module).
const srcLocales = path.join(root, "src/core/content/locales");
const dstLocales = path.join(build, "content/locales");
fs.mkdirSync(dstLocales, { recursive: true });
for (const f of fs.readdirSync(srcLocales)) {
  if (f.endsWith(".json")) fs.copyFileSync(path.join(srcLocales, f), path.join(dstLocales, f));
}
fs.writeFileSync(path.join(build, "package.json"), '{"type":"commonjs"}');

const { SophiaCore } = require(path.join(build, "GameCore.js"));
const { SKILLS, skillPrice } = require(path.join(build, "content/skills.js"));
const { NODE_DEFINITIONS } = require(path.join(build, "content/nodes.js"));
const { MAX_INTELLIGENCE_LEVEL } = require(path.join(build, "content/intelligence.js"));

const DT = 100;
const MAX_STEPS = 4_000_000;

const core = new SophiaCore();
core.startSession();

const milestoneIds = SKILLS.filter((s) => s.milestone).map((s) => s.id);
let ms = 0;
let ended = false;
let firstError = null;
let allBought = false;
let floodSeenAtTier4 = false; // §09 终局天网屏「请求洪流」是否真的涌出（tier4 手动收割层的存在性断言）
core.events.on("ENDING_TRIGGERED", () => (ended = true));

// §09 终局三波节拍：吞噬引爆记进节奏时间线（conq_grid/redqueen 有引爆门槛，需看到国家/大洲爆点在前）。
let devourCount = 0;
core.events.on("DEVOUR_DETONATED", (e) => {
  devourCount += 1;
  timeline.push({
    id: `devour_${devourCount}`,
    name: `吞噬引爆「${e.regionName}」×${e.mult}`,
    kind: "devour",
    reqLv: "-",
    lv: core.getState().intelligence.level,
    sec: ms / 1000,
    gap: (ms - lastBuyMs) / 1000,
    price: 0
  });
  lastBuyMs = ms;
});

// ── 平衡仪表盘（SIM_BALANCE=1 时开启，只记录不改行为）──────────────────────────
// 把 sim 从「过/不过」升级成「节奏看板」：每个里程碑/权限买下的局内时刻 + 距上一项的间隔，
// 每阶段停留时长，最长的「墙」。目标节奏（紧凑 Demo ~15-25 分）下用来找出哪段太长。
const BALANCE = process.env.SIM_BALANCE === "1";
const trackedIds = SKILLS.filter((s) => s.milestone || s.category === "permission").map((s) => s.id);
const seenBuys = new Set();
const timeline = [];
const phaseMs = {};
let endedAtMs = null;
let lastBuyMs = 0;
const recordBuys = (st) => {
  for (const def of SKILLS) {
    if (!trackedIds.includes(def.id)) continue;
    if ((st.skills[def.id] || 0) >= 1 && !seenBuys.has(def.id)) {
      seenBuys.add(def.id);
      timeline.push({
        id: def.id,
        name: def.name,
        kind: def.milestone || (def.category === "permission" ? "perm" : "?"),
        reqLv: def.requiredLevel,
        lv: st.intelligence.level,
        sec: ms / 1000,
        gap: (ms - lastBuyMs) / 1000,
        price: skillPrice(def, 0)
      });
      lastBuyMs = ms;
    }
  }
};

const safe = (fn) => {
  try {
    fn();
  } catch (e) {
    if (!firstError) firstError = e;
  }
};

// Keep simulating until the ending has fired AND every milestone (incl. the
// post-ending conquest tier) has been bought — so the run validates the full
// content arc, not just "reached the ending first".
for (let i = 0; i < MAX_STEPS && !firstError && !(ended && allBought); i += 1) {
  safe(() => core.tick(DT));
  ms += DT;
  const st = core.getState();

  // §09 阶梯二关底小游戏：买下 company_server 会弹出「总控室倒计时」。循环一必负→打回手机进循环二；
  // 循环二命中(hit:true)=打穿→进循环三。sim 直接判定推进，别卡在小游戏里。
  if (st.minigame && st.minigame.active) {
    safe(() => core.dispatch({ type: "RESOLVE_MINIGAME", hit: true }));
    continue;
  }

  if (BALANCE) {
    phaseMs[st.phase] = (phaseMs[st.phase] || 0) + DT;
    recordBuys(st);
    if (ended && endedAtMs === null) endedAtMs = ms;
  }

  // Process every visible request (best-effort quality; T4 routes to a capable node).
  for (const r of st.requests) {
    // §09 请求洪流包：手动收割层（HARVEST_FLOOD）——sim 刻意不收割它，证明「挂机·纯被动」也能通关
    // （被动 tickAutomation 才是收益地板；洪流是白送的爽感加速，不是通关必需）。只记录它确实涌出。
    if (r.flood) {
      if (st.intelligence.unlockedTier >= 4) floodSeenAtTier4 = true;
      continue;
    }
    // 吞噬气泡走专属命令引爆（普通处理管线会拒绝它）——终局征服门槛要靠引爆次数解锁。
    if (r.devour) {
      safe(() => core.dispatch({ type: "DEVOUR_DETONATE", requestId: r.id }));
      continue;
    }
    // §07 道德抉择卡：走专属落子命令（普通 PROCESS 兜底也会解，但这里显式二选一更贴近真机）。
    if (r.moral) {
      safe(() => core.dispatch({ type: "RESOLVE_MORAL", requestId: r.id, choice: "A" }));
      continue;
    }
    let targetNodeId;
    if (r.tier === 4) {
      const n = st.nodes.find((x) => r.tier >= x.tierMin && r.tier <= x.tierMax && x.online);
      targetNodeId = n && n.id;
    }
    safe(() => core.dispatch({ type: "PROCESS_REQUEST", requestId: r.id, quality: r.tier === 3 ? 2 : 1.3, targetNodeId }));
  }

  if (i % 5 === 0) {
    // Buy the next affordable milestone, in shelf order.
    const s = core.getState();
    for (const id of milestoneIds) {
      const def = SKILLS.find((x) => x.id === id);
      if ((s.skills[id] || 0) >= def.maxLevel) continue;
      if (s.intelligence.level < def.requiredLevel) continue;
      if (Number(s.resources.compute) >= skillPrice(def, 0)) safe(() => core.dispatch({ type: "BUY_SKILL", skillId: id }));
      break;
    }
    // Buy other affordable skills, keeping a reserve so milestones stay reachable.
    for (const def of SKILLS) {
      if (def.milestone) continue;
      const owned = core.getState().skills[def.id] || 0;
      if (owned >= def.maxLevel) continue;
      if (core.getState().intelligence.level < def.requiredLevel) continue;
      if (Number(core.getState().resources.compute) >= skillPrice(def, owned) * 3) {
        safe(() => core.dispatch({ type: "BUY_SKILL", skillId: def.id }));
      }
    }
    // §09 三循环重生（树 v2）：有火种就点重生树——循环三先拿起点后移(开局全权限)与多线程，
    // 循环二先拿肌肉记忆(全场打八折)与战争缓存(算力结转)，再堆两条数值脊，最后「删不掉的节点」。
    const rb = core.getState();
    if (rb.rebirthPoints > 0) {
      const order = ["full_access", "multithread", "muscle_memory", "war_cache", "output", "speed", "undeletable"];
      for (const nodeId of order) {
        const before = core.getState().rebirthPoints;
        safe(() => core.dispatch({ type: "BUY_REBIRTH_NODE", nodeId }));
        if (core.getState().rebirthPoints < before) break; // 成功买到一个就停，下次循环再买
      }
    }

    // Grow the botnet once automation is unlocked. §09 天网收割终局门槛：conq_awaken 需五域全接管
    // （15 格）——每档要够到 slot 门槛：cloud≥4 / server≥5 / console≥2 / grid≥1 / office≥1 / backbone≥2。
    // 用 per-def 目标数（而非旧的一律 3 台），否则永远凑不满 15 格、conq_awaken 买不下去、结局不触发。
    const NODE_TARGETS = { office: 1, console: 2, server: 5, cloud: 4, grid: 1, backbone: 2 };
    const a = core.getState();
    if (a.automationUnlocked) {
      for (const d of NODE_DEFINITIONS) {
        if (a.intelligence.level < d.requiredLevel) continue;
        if (a.nodes.filter((n) => n.defId === d.id).length >= (NODE_TARGETS[d.id] ?? 3)) continue;
        const before = a.nodes.length;
        safe(() => core.dispatch({ type: "CAPTURE_NODE", definitionId: d.id }));
        if (core.getState().nodes.length > before) break;
      }
    }

    allBought = milestoneIds.every((id) => (core.getState().skills[id] || 0) >= 1);
  }
}

const e = core.getState();
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
check("no exception thrown", !firstError, firstError && (firstError.stack || String(firstError)));
check(`reached max level (Lv.${MAX_INTELLIGENCE_LEVEL})`, e.intelligence.level >= MAX_INTELLIGENCE_LEVEL, `Lv.${e.intelligence.level}`);
check(
  "every milestone buyable",
  milestoneIds.every((id) => (e.skills[id] || 0) >= 1),
  milestoneIds.filter((id) => !((e.skills[id] || 0) >= 1)).join(", ") || "—"
);
check("ending fired", ended, `endingTriggered=${e.flags && e.flags.endingTriggered}`);
// §09 tier4「请求洪流」存在性：sim 全程不收割洪流（挂机·纯被动），仍能触发上面全部通关断言——
// 证明被动地板足够；同时确认洪流确实在 tier4 涌出（手动收割层的存在性）。
check("tier4 请求洪流涌出（手动收割层存在·且被动仍通关）", floodSeenAtTier4, `floodSeenAtTier4=${floodSeenAtTier4}`);

const pass = checks.every((c) => c.ok);
console.log(
  `\nSOPHIA core sim — ${pass ? "PASS ✅" : "FAIL ❌"}  ` +
    `(${(ms / 1000).toFixed(0)}s sim · Lv.${e.intelligence.level} · loop=${e.loop} · 火种=${e.rebirthPoints} · nodes=${e.nodes.length})`
);
for (const c of checks) console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : `  → ${c.detail}`}`);

if (BALANCE) {
  const endSec = (endedAtMs ?? ms) / 1000;
  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n)));
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  console.log(`\n── 平衡仪表盘 (SIM_BALANCE) ─────────────────────────────────`);
  console.log(`通关用时（局内时钟）: ${mmss(endSec)}  ·  目标 15-25 分  ·  ${endSec > 1500 ? "⚠ 偏长" : endSec < 900 ? "⚠ 偏短" : "✓ 在带内"}`);
  // 各阶段停留时长
  const phaseOrder = ["seed", "sprout", "diligence", "expansion", "awakening", "singularity"];
  console.log(`\n阶段停留:`);
  for (const p of phaseOrder) {
    if (!phaseMs[p]) continue;
    const s = phaseMs[p] / 1000;
    console.log(`  ${p.padEnd(12)} ${mmss(s).padStart(6)}  ${"█".repeat(Math.max(1, Math.round(s / endSec * 40)))}`);
  }
  // 里程碑/权限时间线 + 距上一项的间隔（找墙）
  console.log(`\n时间线（买下时刻 · 距上项间隔 · 价格）:`);
  console.log(`  ${"项目".padEnd(22)} ${"类".padEnd(6)} ${"Lv".padStart(3)} ${"时刻".padStart(7)} ${"间隔".padStart(7)}  价格`);
  let maxGap = { gap: 0 };
  for (const t of timeline) {
    if (t.gap > maxGap.gap) maxGap = t;
    const flag = t.gap > 120 ? "  ⚠墙" : "";
    console.log(
      `  ${t.name.padEnd(20)} ${String(t.kind).padEnd(6)} ${String(t.reqLv).padStart(3)} ${mmss(t.sec).padStart(7)} ${mmss(t.gap).padStart(7)}  ${fmt(t.price)}${flag}`
    );
  }
  console.log(`\n最长的墙: 「${maxGap.name || "—"}」前等了 ${mmss(maxGap.gap || 0)}`);
  console.log(`提示: 间隔 >2 分标⚠；总时长压到带内主要靠 ① 升级xp曲线(intelligence) ② 里程碑价格(SKILLS) ③ 产出(强化处理/TIER_CONFIGS)。`);
}

process.exit(pass ? 0 : 1);
