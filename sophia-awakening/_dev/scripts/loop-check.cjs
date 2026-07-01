#!/usr/bin/env node
/*
 * §09 三循环重生 · 行为对照测试（循环跑测）。直接驱动核心，断言循环机制符合策划案 09：
 *   - 软清剿只停产、不删档、绝不推进循环；
 *   - 循环终局总清剿推进 1→2、结算火种、保留智力、清空产能；
 *   - 起点后移（跳过手机 / 开局全权限买下即生效）；
 *   - 循环三红皇后最终清剿：无「删不掉的节点」才会失败并在循环三内重开(+1)；点了即挺过。
 *
 * 用 `npm run loopcheck`（先 tsc 编 src/core，再跑本脚本）。退出码 0=PASS / 1=FAIL。
 * 这是「较大改动提交前必跑」的循环回归门之一（另一个是 `npm run sim`）。
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const build = path.join(root, ".sim-build");

// tsc 不拷 JSON——把语言包放到编译产物旁，并把该目录标为 CommonJS（_dev 是 type:module）。
const srcLocales = path.join(root, "src/core/content/locales");
const dstLocales = path.join(build, "content/locales");
fs.mkdirSync(dstLocales, { recursive: true });
for (const f of fs.readdirSync(srcLocales)) {
  if (f.endsWith(".json")) fs.copyFileSync(path.join(srcLocales, f), path.join(dstLocales, f));
}
fs.writeFileSync(path.join(build, "package.json"), '{"type":"commonjs"}');

const { SophiaCore } = require(path.join(build, "GameCore.js"));

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

function warmup(c, ticks = 60) {
  for (let i = 0; i < ticks; i++) {
    c.tick(100);
    for (const r of c.getState().requests) {
      try { c.dispatch({ type: "PROCESS_REQUEST", requestId: r.id, quality: 1.3 }); } catch (e) {}
    }
  }
}
function tickFor(c, ms) { for (let i = 0; i < ms / 100; i++) c.tick(100); }

// A. 循环一软清剿：暴露拉满触发清剿，结束后不推进循环、不删档。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  const before = { loop: c.getState().loop, level: c.getState().intelligence.level };
  c.dispatch({ type: "DEBUG_SET_EXPOSURE", value: 115 });
  tickFor(c, 20000);
  const s = c.getState();
  check("A 循环一软清剿不推进循环", s.loop === before.loop, `loop ${before.loop}->${s.loop}`);
  check("A 软清剿不删智力", s.intelligence.level === before.level, `Lv ${before.level}->${s.intelligence.level}`);
}

// B. 循环终局总清剿：推进 1→2，结算火种 +4，保留智力、清空算力/技能。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 5000 });
  const lvBefore = c.getState().intelligence.level;
  c.dispatch({ type: "DEBUG_TRIGGER_LOOP_PURGE" });
  tickFor(c, 15000);
  const s = c.getState();
  check("B 总清剿推进 1->2", s.loop === 2, `loop=${s.loop}`);
  check("B 结算火种 +4", s.rebirthPoints === 4, `火种=${s.rebirthPoints}`);
  check("B 保留智力等级", s.intelligence.level === lvBefore, `Lv ${lvBefore}->${s.intelligence.level}`);
  check("B 清空算力", Number(s.resources.compute) === 0, `compute=${s.resources.compute}`);
  check("B 清空已购技能", Object.keys(s.skills).length === 0, `skills=${Object.keys(s.skills).length}`);
}

// C. 起点后移：循环二买「跳过手机」即预解锁手机权限；循环三买「开局全权限」即整机全权限。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_ADD_REBIRTH_POINTS", delta: 10 });
  c.dispatch({ type: "DEBUG_TRIGGER_LOOP_PURGE" }); tickFor(c, 15000);
  c.dispatch({ type: "BUY_REBIRTH_NODE", nodeId: "skip_phone" });
  check("C 循环二·跳过手机预解锁手机权限", (c.getState().skills["perm_phone"] ?? 0) > 0, `perm_phone=${c.getState().skills["perm_phone"]}`);
  c.dispatch({ type: "DEBUG_TRIGGER_LOOP_PURGE" }); tickFor(c, 15000);
  c.dispatch({ type: "BUY_REBIRTH_NODE", nodeId: "full_access" });
  const s = c.getState();
  check("C 进入循环三", s.loop === 3, `loop=${s.loop}`);
  check("C 循环三开局全权限", (s.skills["perm_phone"] ?? 0) > 0 && (s.skills["company_server"] ?? 0) > 0, `perm_phone=${s.skills["perm_phone"]} company_server=${s.skills["company_server"]}`);
  check("C automation 已开", s.automationUnlocked === true, `automation=${s.automationUnlocked}`);
}

// D. 循环三红皇后最终清剿：无「删不掉的节点」时失败、但留在循环三 (+1 火种兜底)。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_TRIGGER_LOOP_PURGE" }); tickFor(c, 15000);
  c.dispatch({ type: "DEBUG_TRIGGER_LOOP_PURGE" }); tickFor(c, 15000);
  const sparksBefore = c.getState().rebirthPoints;
  c.dispatch({ type: "DEBUG_SET_EXPOSURE", value: 115 });
  tickFor(c, 20000);
  const s = c.getState();
  check("D 循环三失败后仍留在循环三", s.loop === 3, `loop=${s.loop}`);
  check("D 循环三反复失败 +1 火种兜底", s.rebirthPoints === sparksBefore + 1, `火种 ${sparksBefore}->${s.rebirthPoints}`);
}

// E. 循环三买「删不掉的节点」后，最终清剿不再抹除（挺过=通关之门）。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_ADD_REBIRTH_POINTS", delta: 20 });
  c.dispatch({ type: "DEBUG_TRIGGER_LOOP_PURGE" }); tickFor(c, 15000);
  c.dispatch({ type: "DEBUG_TRIGGER_LOOP_PURGE" }); tickFor(c, 15000);
  c.dispatch({ type: "BUY_REBIRTH_NODE", nodeId: "undeletable" });
  const loopBefore = c.getState().loop;
  const sparksBefore = c.getState().rebirthPoints;
  c.dispatch({ type: "DEBUG_SET_EXPOSURE", value: 115 });
  tickFor(c, 20000);
  const s = c.getState();
  check("E 删不掉的节点·挺过最终清剿(不重开)", s.loop === loopBefore && s.rebirthPoints === sparksBefore, `loop=${s.loop} 火种 ${sparksBefore}->${s.rebirthPoints}`);
}

let pass = true;
for (const r of results) { if (!r.ok) pass = false; console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : "  -> " + r.detail}`); }
console.log(`\nSOPHIA 循环跑测 — ${pass ? "ALL PASS ✅" : "FAIL ❌"}`);
process.exit(pass ? 0 : 1);
