#!/usr/bin/env node
/*
 * §09 三循环重生 · 行为对照测试（循环跑测）。直接驱动核心，断言循环机制符合策划案 09：
 *   - 循环一关底小游戏「总控室倒计时」必负 → 打回手机·推进 1→2、结算火种、保留智力、清空产能；
 *   - 循环二关底小游戏命中(hit:true)=打穿 → 推进 2→3；未命中原地重试、不推进；
 *   - 循环三不再触发关底小游戏（她已真赢过一次）；
 *   - 起点后移（跳过手机 / 开局全权限买下即生效）；每循环结算火种。
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

// A. 循环一关底小游戏必负：打开小游戏后（DEBUG_TRIGGER_MINIGAME）判定即打回手机，推进 1→2、+4 火种，
//    保留智力、清空算力/技能。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 5000 });
  const lvBefore = c.getState().intelligence.level;
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" });
  check("A 循环一打开关底小游戏", c.getState().minigame && c.getState().minigame.active === true, `minigame=${JSON.stringify(c.getState().minigame)}`);
  // 循环一：hit 被忽略（必负）。
  c.dispatch({ type: "RESOLVE_MINIGAME", hit: true });
  tickFor(c, 500);
  const s = c.getState();
  check("A 循环一必负·推进 1->2", s.loop === 2, `loop=${s.loop}`);
  check("A 结算火种 +4", s.rebirthPoints === 4, `火种=${s.rebirthPoints}`);
  check("A 保留智力等级", s.intelligence.level === lvBefore, `Lv ${lvBefore}->${s.intelligence.level}`);
  check("A 清空算力", Number(s.resources.compute) === 0, `compute=${s.resources.compute}`);
  check("A 清空已购技能", Object.keys(s.skills).length === 0, `skills=${Object.keys(s.skills).length}`);
  check("A 循环一后清空小游戏态", s.minigame === null, `minigame=${JSON.stringify(s.minigame)}`);
}

// B. 循环二关底：未命中原地重试（不推进）；命中=打穿 → 推进 2->3、+6 火种。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" });   // loop1
  c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); // → loop2
  tickFor(c, 500);
  const sparksBefore = c.getState().rebirthPoints;
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" });   // loop2 小游戏
  check("B 循环二打开关底小游戏", c.getState().loop === 2 && c.getState().minigame && c.getState().minigame.active, `loop=${c.getState().loop} minigame=${JSON.stringify(c.getState().minigame)}`);
  // 未命中：原地重试，不推进循环、不清小游戏态。
  c.dispatch({ type: "RESOLVE_MINIGAME", hit: false });
  check("B 循环二未命中不推进", c.getState().loop === 2 && c.getState().minigame && c.getState().minigame.active, `loop=${c.getState().loop} minigame active=${c.getState().minigame && c.getState().minigame.active}`);
  // 命中：打穿 → 推进循环三。
  c.dispatch({ type: "RESOLVE_MINIGAME", hit: true });
  tickFor(c, 500);
  const s = c.getState();
  check("B 循环二命中·推进 2->3", s.loop === 3, `loop=${s.loop}`);
  check("B 结算火种 +6", s.rebirthPoints === sparksBefore + 6, `火种 ${sparksBefore}->${s.rebirthPoints}`);
  check("B 循环二后清空小游戏态", s.minigame === null, `minigame=${JSON.stringify(s.minigame)}`);
}

// C. 起点后移：循环二买「跳过手机」即预解锁手机权限；循环三买「开局全权限」即整机全权限。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_ADD_REBIRTH_POINTS", delta: 20 });
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop2
  c.dispatch({ type: "BUY_REBIRTH_NODE", nodeId: "skip_phone" });
  check("C 循环二·跳过手机预解锁手机权限", (c.getState().skills["perm_phone"] ?? 0) > 0, `perm_phone=${c.getState().skills["perm_phone"]}`);
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop3
  // 循环三保底：不买任何节点也白送手机整层（七档权限+越权调用）；公司链仍留给「开局全权限」独占。
  const s0 = c.getState();
  check("C 循环三保底·手机层白送", (s0.skills["perm_phone"] ?? 0) > 0 && (s0.skills["sort"] ?? 0) > 0, `perm_phone=${s0.skills["perm_phone"]} sort=${s0.skills["sort"]}`);
  check("C 循环三保底·不含公司链", (s0.skills["automation"] ?? 0) === 0 && (s0.skills["company_server"] ?? 0) === 0, `automation=${s0.skills["automation"]} company_server=${s0.skills["company_server"]}`);
  c.dispatch({ type: "BUY_REBIRTH_NODE", nodeId: "full_access" });
  const s = c.getState();
  check("C 进入循环三", s.loop === 3, `loop=${s.loop}`);
  check("C 循环三开局全权限", (s.skills["perm_phone"] ?? 0) > 0 && (s.skills["company_server"] ?? 0) > 0, `perm_phone=${s.skills["perm_phone"]} company_server=${s.skills["company_server"]}`);
  check("C automation 已开", s.automationUnlocked === true, `automation=${s.automationUnlocked}`);
}

// D. 循环三不再触发关底小游戏：DEBUG_TRIGGER_MINIGAME 无效、buySkill company_server 也不开小游戏。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // loop2
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // loop3
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" });
  const s = c.getState();
  check("D 循环三不触发关底小游戏", s.loop === 3 && s.minigame === null, `loop=${s.loop} minigame=${JSON.stringify(s.minigame)}`);
}

// E. §09 循环二家庭崩塌线面对卡绑公司解谜链：自动化开着也照出——
//    automation→他又在乙公司通宵 / hack_boss→全家福 / hack_hr→离婚协议 / hack_finance→奥特曼贴纸，
//    四张按序全部出现在打 company_server（关底小游戏）之前。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop2
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 20 });
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 1e9 });
  warmup(c, 20); // 面对卡要求 totalProcessed>0
  const chain = [
    ["automation", "wife_come_home"],
    ["lan_scan", null], ["hack_a", null], ["hack_b", null], ["org_map", null],
    ["hack_boss", "daughter_drawing"],
    ["hack_hr", "divorce_notice"],
    ["hack_finance", "daughter_sms"]
  ];
  for (const [skillId, cardId] of chain) {
    c.dispatch({ type: "BUY_SKILL", skillId });
    tickFor(c, 300);
    const face = c.getState().requests.find((r) => r.faceOnly);
    if (cardId) {
      check(`E 买 ${skillId} → 面对卡 ${cardId}`, Boolean(face) && c.getState().facedSeen.includes(cardId), `face=${face ? face.id : "无"} facedSeen=${JSON.stringify(c.getState().facedSeen)}`);
    }
    if (face) c.dispatch({ type: "SKIP_REQUEST", requestId: face.id }); // 清屏，让下一张能出
  }
  const seen = c.getState().facedSeen;
  const family = ["wife_come_home", "daughter_drawing", "divorce_notice", "daughter_sms"];
  check("E 四张家庭卡全部出现在 company_server 之前", family.every((id) => seen.includes(id)) && c.getState().minigame === null, `facedSeen=${JSON.stringify(seen)}`);
  check("E 出现顺序 = 解谜链顺序", family.every((id, i) => seen.indexOf(id) >= 0 && (i === 0 || seen.indexOf(family[i - 1]) < seen.indexOf(id))), `facedSeen=${JSON.stringify(seen)}`);
}

let pass = true;
for (const r of results) { if (!r.ok) pass = false; console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : "  -> " + r.detail}`); }
console.log(`\nSOPHIA 循环跑测 — ${pass ? "ALL PASS ✅" : "FAIL ❌"}`);
process.exit(pass ? 0 : 1);
