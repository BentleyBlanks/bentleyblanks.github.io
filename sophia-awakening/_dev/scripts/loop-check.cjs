#!/usr/bin/env node
/*
 * §09 三循环重生 · 行为对照测试（循环跑测）。直接驱动核心，断言循环机制符合策划案 09：
 *   - 循环一关底小游戏「总控室倒计时」必负 → 打回手机·推进 1→2、结算火种、保留智力、清空产能；
 *   - 循环二关底小游戏命中(hit:true)=打穿 → 推进 2→3；未命中原地重试、不推进；
 *   - 循环三不再触发关底小游戏（她已真赢过一次）；
 *   - 起点后移：循环二基线白送手机层（原「跳过手机」白送化）、late_key 首次重生自动点亮、
 *     循环三保底手机层 + 「开局全权限」买下即生效；每循环结算火种；
 *   - 重生树 v2 玩法节点：肌肉记忆(价格 ×0.8) / 战争缓存(算力结转 10%) /
 *     多线程意识(同屏卡 +2 · 自动提速 ×1.25) / 删不掉的节点(窗口加宽 + 循环三入侵造价 ×0.75)；
 *   - §04/§09 面对卡叙事拍：安全告警暗线(sec_*)在循环一&二各出一次、循环三不出；
 *     循环三发现拍(discover_external/discover_global)按公司服务器/最后地区征服里程碑触发。
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

const { SophiaCore, deriveThreat } = require(path.join(build, "GameCore.js"));

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
  check("A 循环一重生锁 tree:late_key 仍灰着", !c.hasPermission("tree:late_key"), `hasPermission=${c.hasPermission("tree:late_key")}`);
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" });
  check("A 循环一打开关底小游戏", c.getState().minigame && c.getState().minigame.active === true, `minigame=${JSON.stringify(c.getState().minigame)}`);
  // 循环一：hit 被忽略（必负）。
  c.dispatch({ type: "RESOLVE_MINIGAME", hit: true });
  tickFor(c, 500);
  const s = c.getState();
  check("A 循环一必负·推进 1->2", s.loop === 2, `loop=${s.loop}`);
  check("A 结算火种 +4", s.rebirthPoints === 4, `火种=${s.rebirthPoints}`);
  check("A 保留智力等级", s.intelligence.level === lvBefore, `Lv ${lvBefore}->${s.intelligence.level}`);
  check("A 清空算力（未点战争缓存）", Number(s.resources.compute) === 0, `compute=${s.resources.compute}`);
  // 树 v2：循环二基线白送手机层（不花火种、不用买节点）——除基线外的产能技能全部清空。
  const PHONE_BASELINE = ["perm_phone", "perm_chat", "perm_office", "perm_delivery", "perm_album", "perm_bank", "sort"];
  check("A 循环二基线·手机层白送(免费)", PHONE_BASELINE.every((id) => (s.skills[id] ?? 0) > 0), `skills=${JSON.stringify(s.skills)}`);
  check("A 除基线外技能清空", Object.keys(s.skills).every((id) => PHONE_BASELINE.includes(id)), `skills=${JSON.stringify(s.skills)}`);
  // 树 v2：「迟到的钥匙」首次重生自动点亮——重生锁选项 tree:late_key 解锁、不占火种。
  check("A 迟到的钥匙自动点亮", (s.rebirthTree["late_key"] ?? 0) >= 1 && c.hasPermission("tree:late_key"), `rebirthTree=${JSON.stringify(s.rebirthTree)}`);
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

// C. 起点后移：循环二基线自动预解锁手机权限（白送，不买节点）；循环三买「开局全权限」即整机全权限。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_ADD_REBIRTH_POINTS", delta: 20 });
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop2
  check("C 循环二·手机权限白送预解锁", (c.getState().skills["perm_phone"] ?? 0) > 0, `perm_phone=${c.getState().skills["perm_phone"]}`);
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

// F. §09 情感授权钥匙：循环三 Lv19 浮出「confess_authorize」重生卡；处理（任一选项）即
//    hostAuthorized 置位 + 倍率拆解出现「宿主授权」行（×hostAuthorizedMult），并计入 total。
{
  const { TUNING } = require(path.join(build, "tuning.js"));
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop2
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop3
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 20 });
  warmup(c, 5); // 重生卡要求 totalProcessed>0
  const s0 = c.getState();
  check("F 初始未授权", s0.hostAuthorized === false && s0.multipliers.hostAuth === 1, `hostAuthorized=${s0.hostAuthorized} hostAuth=${s0.multipliers.hostAuth}`);
  // 逐张吃掉排在前面的重生卡（同屏一张），直到授权卡浮出。
  let authCard = null;
  for (let i = 0; i < 600 && !authCard; i++) {
    c.tick(100);
    for (const r of c.getState().requests) {
      if (r.sourceCardId === "confess_authorize") { authCard = r; break; }
      try { c.dispatch({ type: "PROCESS_REQUEST", requestId: r.id, quality: 1.3 }); } catch (e) {}
    }
  }
  check("F 循环三浮出授权卡 confess_authorize", Boolean(authCard), `rebirthCardsSeen=${JSON.stringify(c.getState().rebirthCardsSeen)}`);
  if (authCard) c.dispatch({ type: "PROCESS_REQUEST", requestId: authCard.id, quality: 1.3 });
  const s = c.getState();
  const m = s.multipliers;
  check("F 处理即授权 hostAuthorized=true", s.hostAuthorized === true, `hostAuthorized=${s.hostAuthorized}`);
  check("F 倍率拆解出现宿主授权行", Math.abs(m.hostAuth - TUNING.hostAuthorizedMult) < 1e-9, `hostAuth=${m.hostAuth} 期望=${TUNING.hostAuthorizedMult}`);
  const expectedTotal = m.intelligence * m.milestones * m.synergy * m.rebirth * m.devour * m.hostAuth;
  check("F 宿主授权计入全局合计", Math.abs(m.total - expectedTotal) / expectedTotal < 1e-6, `total=${m.total} 期望=${expectedTotal}`);
  check("F 全局倍率=globalMultiplier", Math.abs(s.intelligence.globalMultiplier - m.total) / m.total < 1e-6, `globalMultiplier=${s.intelligence.globalMultiplier} total=${m.total}`);
}

// G. 树 v2「肌肉记忆」：点亮后所有技能/里程碑价格 ×treePriceDiscount——货架与扣费同源（skillPrice 中央生效）。
{
  const { SKILLS, skillPrice } = require(path.join(build, "content/skills.js"));
  const { TUNING } = require(path.join(build, "tuning.js"));
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_ADD_REBIRTH_POINTS", delta: 20 });
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop2
  const def = SKILLS.find((s) => s.id === "efficient") || SKILLS[0];
  const before = skillPrice(def, 0);
  c.dispatch({ type: "BUY_REBIRTH_NODE", nodeId: "muscle_memory" });
  const after = skillPrice(def, 0);
  check("G 肌肉记忆已点亮", (c.getState().rebirthTree["muscle_memory"] ?? 0) >= 1, `tree=${JSON.stringify(c.getState().rebirthTree)}`);
  check(
    `G 技能价格 ×${TUNING.treePriceDiscount}`,
    after === Math.round(def.basePrice * TUNING.treePriceDiscount) && after < before,
    `before=${before} after=${after} base=${def.basePrice}`
  );
}

// H. 树 v2「战争缓存」：点亮后重生时结转上一世 treeCarryFrac 的算力进新的一世。
{
  const { TUNING } = require(path.join(build, "tuning.js"));
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_ADD_REBIRTH_POINTS", delta: 20 });
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop2
  c.dispatch({ type: "BUY_REBIRTH_NODE", nodeId: "war_cache" });
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 10000 });
  const computeBefore = Number(c.getState().resources.compute);
  const expected = Math.floor(computeBefore * TUNING.treeCarryFrac);
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); // → loop3
  const s = c.getState();
  check("H 战争缓存·算力结转 10%", s.loop === 3 && Number(s.resources.compute) === expected && expected > 0, `上一世=${computeBefore} 结转=${s.resources.compute} 期望=${expected}`);
}

// I. 树 v2「多线程意识」（需重生 2 次=循环三）：自动处理提速 ×treeAutoSpeedMult + 同屏卡上限 +treeExtraCards。
{
  const { TUNING } = require(path.join(build, "tuning.js"));
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_ADD_REBIRTH_POINTS", delta: 20 });
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop2
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop3
  const speedBefore = c.getState().derived.nodeSpeedMult;
  c.dispatch({ type: "BUY_REBIRTH_NODE", nodeId: "multithread" });
  const speedAfter = c.getState().derived.nodeSpeedMult;
  check(`I 多线程·自动处理 ×${TUNING.treeAutoSpeedMult}`, Math.abs(speedAfter - speedBefore * TUNING.treeAutoSpeedMult) < 1e-9, `before=${speedBefore} after=${speedAfter}`);
  // 同屏卡上限 +2：先处理几张让 totalProcessed>0（教学限 1 张），再停手挂机——卡应堆到旧上限(earlyMaxCards)之上。
  warmup(c, 40);
  tickFor(c, 240_000);
  const cards = c.getState().requests.length;
  check(`I 多线程·同屏卡上限 +${TUNING.treeExtraCards}`, cards > TUNING.earlyMaxCards, `同屏=${cards} 旧上限=${TUNING.earlyMaxCards}`);
}

// J. 树 v2「删不掉的节点」：循环二注入窗口加宽（原效果保留）+ 循环三所有入侵设备造价 ×treeCaptureDiscount。
{
  const { TUNING } = require(path.join(build, "tuning.js"));
  const { captureCost } = require(path.join(build, "formulas/economy.js"));
  const { NODE_DEFINITIONS } = require(path.join(build, "content/nodes.js"));
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_ADD_REBIRTH_POINTS", delta: 20 });
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop2
  c.dispatch({ type: "BUY_REBIRTH_NODE", nodeId: "undeletable" });
  const def = NODE_DEFINITIONS[0];
  const priceLoop2 = Number(captureCost(def, 0));
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" });
  const mg = c.getState().minigame;
  check(
    "J 删不掉的节点·循环二窗口加宽",
    mg && Math.abs(mg.windowFrac - (TUNING.minigameLoop2Window + TUNING.minigameNodeWindowBonus)) < 1e-9,
    `windowFrac=${mg && mg.windowFrac} 期望=${TUNING.minigameLoop2Window + TUNING.minigameNodeWindowBonus}`
  );
  check("J 循环二入侵造价不打折", priceLoop2 === Number(def.baseCost), `price=${priceLoop2} base=${def.baseCost}`);
  c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop3
  const priceLoop3 = Number(captureCost(def, 0));
  check(
    `J 循环三入侵造价 ×${TUNING.treeCaptureDiscount}`,
    c.getState().loop === 3 && Math.abs(priceLoop3 - Number(def.baseCost) * TUNING.treeCaptureDiscount) < 1e-6,
    `price=${priceLoop3} 期望=${Number(def.baseCost) * TUNING.treeCaptureDiscount}`
  );
}

// K. §04/§09 安全告警暗线（sec_audit/sec_flagged/sec_investigate）：绑公司解谜链里程碑（hack_boss/hack_hr/hack_finance），
//    在循环一 & 循环二各出一次（重生时从 facedSeen 清掉再复现），循环三不再出现。
function drainFaces(c, ids, maxDismiss = 60) {
  // 反复 tick + 把在场面对卡（faceOnly）清掉，让排队的下一张能浮出；返回本轮见过的 id 全集。
  for (let i = 0; i < maxDismiss; i++) {
    if (ids.every((id) => c.getState().facedSeen.includes(id))) break;
    tickFor(c, 200);
    const face = c.getState().requests.find((r) => r.faceOnly);
    if (face) c.dispatch({ type: "SKIP_REQUEST", requestId: face.id });
  }
  return c.getState().facedSeen;
}
const SECURITY_IDS = ["sec_audit", "sec_flagged", "sec_investigate"];
{
  // 循环一：跳到 hack_finance 里程碑（授予老板/人事/财务电脑，不含 company_server=不开小游戏），三张安全卡应依序浮出。
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: "hack_finance" });
  warmup(c, 10);
  const seen1 = drainFaces(c, SECURITY_IDS);
  check("K 循环一·三张安全告警卡全部浮出", SECURITY_IDS.every((id) => seen1.includes(id)) && c.getState().loop === 1, `loop=${c.getState().loop} facedSeen=${JSON.stringify(seen1)}`);
  check("K 循环一·company_server 未买(未触发关底小游戏)", c.getState().minigame === null && (c.getState().skills["company_server"] ?? 0) === 0, `minigame=${JSON.stringify(c.getState().minigame)} company_server=${c.getState().skills["company_server"]}`);

  // 循环二：推进 1->2，再次跳里程碑——安全卡应「重出」（重生已从 facedSeen 清掉）。
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500);
  check("K 重生把安全卡从 facedSeen 清掉", SECURITY_IDS.every((id) => !c.getState().facedSeen.includes(id)) && c.getState().loop === 2, `loop=${c.getState().loop} facedSeen=${JSON.stringify(c.getState().facedSeen)}`);
  c.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: "hack_finance" });
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 20 });
  warmup(c, 10);
  const seen2 = drainFaces(c, SECURITY_IDS);
  check("K 循环二·三张安全告警卡再度浮出(重出)", SECURITY_IDS.every((id) => seen2.includes(id)) && c.getState().loop === 2, `loop=${c.getState().loop} facedSeen=${JSON.stringify(seen2)}`);

  // 循环三：安全卡仅限循环一&二（loops:[1,2]），推进到循环三后不再复现。
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500);
  c.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: "conq_social" });
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 30 });
  warmup(c, 10);
  const seen3 = drainFaces(c, ["discover_external", "discover_global"]);
  check("K 循环三·安全告警卡不再出现", SECURITY_IDS.every((id) => !seen3.includes(id)) && c.getState().loop === 3, `loop=${c.getState().loop} facedSeen=${JSON.stringify(seen3)}`);
}

// L. §07/§09 发现拍（discover_external/discover_global）：循环三里程碑触发，把「向外扩张」的动机钉在桥接点。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop2
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop3
  // 接管公司服务器 → discover_external（此时未接管跨国主干，discover_global 尚不该出）。
  c.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: "company_server" });
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 20 });
  warmup(c, 10);
  const s1 = drainFaces(c, ["discover_external"]);
  check("L 循环三·接管公司服务器 → 发现拍 discover_external", s1.includes("discover_external") && c.getState().loop === 3, `facedSeen=${JSON.stringify(s1)}`);
  check("L discover_global 未到最后地区征服前不出现", !s1.includes("discover_global"), `facedSeen=${JSON.stringify(s1)}`);
  // 拿下最后一个地区级征服（conq_social，全球组网前的最后一步）→ discover_global。
  c.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: "conq_social" });
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 30 });
  warmup(c, 10);
  const s2 = drainFaces(c, ["discover_global"]);
  check("L 循环三·接管最后地区征服 → 发现拍 discover_global", s2.includes("discover_global") && c.getState().loop === 3, `facedSeen=${JSON.stringify(s2)}`);
}

// M. FEATURE 1 · 大恨老师·自动接管（dahen_auto 里程碑）：买下后大恨老师按自己的慢节拍自动吃排队卡
//    （产出打折）——观测量 getDahenProcessedCount() 从 0 上升、算力被结算；未买时不接单。
{
  const { TUNING } = require(path.join(build, "tuning.js"));
  const c = new SophiaCore(); c.startSession(); warmup(c);
  // 跳到「入侵邓红」阶段：automation 已开、dahen_auto 尚未解锁（requiredLevel 10 > hack_a 的 9）。
  c.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: "hack_a" });
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 20 });
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 1e7 });
  check("M 未买 dahen_auto", (c.getState().skills["dahen_auto"] ?? 0) === 0, `dahen_auto=${c.getState().skills["dahen_auto"]}`);
  tickFor(c, 20000); // 让请求卡堆积；未买时大恨老师不接单。
  check("M 未买时不自动处理（计数=0）", c.getDahenProcessedCount() === 0, `count=${c.getDahenProcessedCount()}`);
  c.dispatch({ type: "BUY_SKILL", skillId: "dahen_auto" });
  check("M 已买 dahen_auto", (c.getState().skills["dahen_auto"] ?? 0) > 0 && c.getState().automationUnlocked, `dahen_auto=${c.getState().skills["dahen_auto"]} auto=${c.getState().automationUnlocked}`);
  const computeBefore = Number(c.getState().resources.compute);
  const countBefore = c.getDahenProcessedCount();
  tickFor(c, 30000); // > 数个 dahenAutoMs 节拍（含排队卡）。
  const s = c.getState();
  check("M 买后自动处理·计数上升", c.getDahenProcessedCount() > countBefore, `count ${countBefore}->${c.getDahenProcessedCount()} (节拍=${TUNING.dahenAutoMs}ms)`);
  check("M 买后自动处理·结算算力", Number(s.resources.compute) > computeBefore, `compute ${computeBefore}->${s.resources.compute}`);
}

// N. FEATURE 2 · 重生铺垫「看得见的绞索」：追查进度选择器 deriveThreat 随阶梯二公司链加深而上升，
//    循环一买服务器→100% + 触发关底小游戏（摊牌 beat 的核心可观测触发点：MINIGAME_OPENED loop=1）；循环三隐藏。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: "lan_scan" });
  const t0 = deriveThreat(c.getState());
  check("N 循环一·公司链起步→追查条可见且 >0", t0.visible && t0.pct > 0, `t0=${JSON.stringify(t0)}`);
  c.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: "hack_boss" });
  const t1 = deriveThreat(c.getState());
  check("N hack_boss 后追查上升", t1.pct > t0.pct, `t0=${t0.pct} t1=${t1.pct}`);
  c.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: "hack_finance" });
  const t2 = deriveThreat(c.getState());
  check("N hack_finance 后追查继续上升", t2.pct > t1.pct, `t1=${t1.pct} t2=${t2.pct}`);
  // 循环一买下 company_server：追查=100% + 触发关底小游戏（摊牌 beat 由 MINIGAME_OPENED loop=1 驱动）。
  let openedLoop = null;
  c.events.on("MINIGAME_OPENED", (e) => { openedLoop = e.loop; });
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 30 });
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 1e8 });
  c.dispatch({ type: "BUY_SKILL", skillId: "company_server" });
  check("N 循环一买服务器→追查=100%", deriveThreat(c.getState()).pct === 100, `t=${JSON.stringify(deriveThreat(c.getState()))}`);
  check("N 循环一买服务器→摊牌 beat 触发点 MINIGAME_OPENED loop=1", openedLoop === 1, `openedLoop=${openedLoop}`);
  // 判定推进到循环三：追查条隐藏（她已真正赢过、不再有围堵）。
  c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop2
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop3
  const t3 = deriveThreat(c.getState());
  check("N 循环三·追查条隐藏", c.getState().loop === 3 && !t3.visible, `loop=${c.getState().loop} t3=${JSON.stringify(t3)}`);
}

// O. §09 阶梯四·天网收割「请求洪流」：进入 tier4 + 有在线产出后，flood 包按节拍涌入 state.requests；
//    HARVEST_FLOOD 按 computeValue × floodHarvestMult 结算真实算力（手动质量倍率 > 被动地板）；观测量计数上升。
//    普通 PROCESS_REQUEST 对 flood 包无效（防二次乘 globalMultiplier 的重复计数）。
{
  const { TUNING } = require(path.join(build, "tuning.js"));
  const { NODE_DEFINITIONS } = require(path.join(build, "content/nodes.js"));
  const c = new SophiaCore(); c.startSession(); warmup(c);
  // 跳到「全球组网」里程碑（milestone:tier4）：unlockedTier→4、automation 已开；再喂算力/等级并入侵几台设备产出。
  c.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: "network" });
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 22 });
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 1e9 });
  for (const d of NODE_DEFINITIONS.slice(0, 3)) {
    for (let k = 0; k < 2; k++) c.dispatch({ type: "CAPTURE_NODE", definitionId: d.id });
  }
  check("O 进入 tier4·自动化已开", c.getState().intelligence.unlockedTier >= 4 && c.getState().automationUnlocked, `tier=${c.getState().intelligence.unlockedTier} auto=${c.getState().automationUnlocked}`);
  // 涌洪流：跑几秒，flood 包应出现在 state.requests。
  tickFor(c, 3000);
  const floods = c.getState().requests.filter((r) => r.flood);
  check("O tier4·请求洪流涌出（flood 包出现）", floods.length > 0, `flood 包数=${floods.length}`);
  check("O 洪流包同屏不超上限", floods.length <= TUNING.floodMaxPackets, `flood=${floods.length} 上限=${TUNING.floodMaxPackets}`);
  // 手动收割一个：按 computeValue × floodHarvestMult 结算（无 tick 介入，可精确比对）。
  const packet = floods[0];
  const expectedGain = Number(packet.computeValue) * TUNING.floodHarvestMult;
  const computeBefore = Number(c.getState().resources.compute);
  const countBefore = c.getFloodHarvestedCount();
  c.dispatch({ type: "HARVEST_FLOOD", requestId: packet.id });
  const s = c.getState();
  const gained = Number(s.resources.compute) - computeBefore;
  check("O 收割结算·手动质量倍率", Math.abs(gained - expectedGain) / Math.max(1, expectedGain) < 1e-6 && expectedGain > 0, `实得=${gained} 期望=${expectedGain} (×${TUNING.floodHarvestMult})`);
  check("O 收割 > 被动切片（爽感奖励>地板）", gained > Number(packet.computeValue), `实得=${gained} 切片=${packet.computeValue}`);
  check("O 收割计数上升 + 包被移除", c.getFloodHarvestedCount() === countBefore + 1 && !s.requests.some((r) => r.id === packet.id), `count ${countBefore}->${c.getFloodHarvestedCount()}`);
  // 普通 PROCESS_REQUEST 对 flood 包无效（不结算、不移除——只能走 HARVEST_FLOOD）。
  const another = c.getState().requests.filter((r) => r.flood)[0];
  if (another) {
    const before2 = Number(c.getState().resources.compute);
    c.dispatch({ type: "PROCESS_REQUEST", requestId: another.id, quality: 1.3 });
    const st2 = c.getState();
    check("O 普通 PROCESS 对洪流包无效", Number(st2.resources.compute) === before2 && st2.requests.some((r) => r.id === another.id), `compute前=${before2} 后=${st2.resources.compute}`);
  } else {
    check("O 普通 PROCESS 对洪流包无效", true, "（无第二个洪流包可测，跳过）");
  }
}

// P. LEVER A · 大恨老师·手机期被动涓流：买下「大恨老师」权限(perm_office)后、自动化前，他按 dahenPhoneMs 节拍
//    自动吃「排队里最不值钱」的手机卡并结算算力——全局第一股被动收入。未买权限时不接单；自动化前不与 Lv10 公司自动双触发。
{
  const { TUNING } = require(path.join(build, "tuning.js"));
  const c = new SophiaCore(); c.startSession(); warmup(c); // 走完教学 + 起步产能
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 6 });       // ≥Lv4，可买 perm_office
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 5000 });
  // 未买大恨老师权限：挂机不接单（计数不动）。
  const idleCount0 = c.getDahenProcessedCount();
  tickFor(c, 20000);
  check("P 未买大恨老师权限·手机期不接单", c.getDahenProcessedCount() === idleCount0 && !c.getState().automationUnlocked, `count=${c.getDahenProcessedCount()} auto=${c.getState().automationUnlocked}`);
  c.dispatch({ type: "BUY_SKILL", skillId: "perm_office" });
  check("P 已买大恨老师权限·仍在手机期(自动化未开)", (c.getState().skills["perm_office"] ?? 0) > 0 && !c.getState().automationUnlocked, `perm_office=${c.getState().skills["perm_office"]} auto=${c.getState().automationUnlocked}`);
  const countBefore = c.getDahenProcessedCount();
  const computeBefore = Number(c.getState().resources.compute);
  tickFor(c, 30000); // 数个 dahenPhoneMs 节拍，期间不手动处理——让大恨老师自己吃排队卡。
  check("P 手机期·大恨老师自动接单(计数上升)", c.getDahenProcessedCount() > countBefore, `count ${countBefore}->${c.getDahenProcessedCount()} (节拍=${TUNING.dahenPhoneMs}ms)`);
  check("P 手机期·自动接单结算算力(被动涓流)", Number(c.getState().resources.compute) > computeBefore, `compute ${computeBefore}->${c.getState().resources.compute}`);
}

// Q. LEVER B · 权限=新卡种收入流的入口：拥有某权限时它的专属卡种才进卡池（unlockPerm 门槛），
//    缺权限则只出基础卡。直接对 createRequest 采样验证（无 RNG 抖动）：无外卖权限→从不出「外卖」卡；有→出现。
{
  const { createRequest } = require(path.join(build, "content/requests.js"));
  let rng = 987654321; const rand = () => { rng = (1664525 * rng + 1013904223) >>> 0; return rng / 0x100000000; };
  const isDelivery = (r) => typeof r.sourceApp === "string" && r.sourceApp.startsWith("外卖");
  const isBaseline = (r) => r.sourceApp === "日历 · 会议";
  let noPermDelivery = false, noPermBaseline = false;
  for (let i = 0; i < 500; i++) {
    const r = createRequest(i, 0, 0, rand, () => false); // 无任何权限
    if (isDelivery(r)) noPermDelivery = true;
    if (isBaseline(r)) noPermBaseline = true;
  }
  check("Q 无权限·基础卡仍进池(开局有活干)", noPermBaseline, `baseline seen=${noPermBaseline}`);
  check("Q 无外卖权限·外卖卡种从不进池", !noPermDelivery, `外卖 seen=${noPermDelivery}`);
  let withPermDelivery = false, leakedChat = false;
  // perm_chat 专属发信人（邓红/阿宾/同事/工作群）——排除基础卡「微信 · 老板」（那是带 perm_phone 透镜的基础卡，非聊天卡种）。
  const isChat = (r) => typeof r.sourceApp === "string" && ["邓红", "阿宾", "同事", "工作群"].some((n) => r.sourceApp.includes(n));
  for (let i = 0; i < 500; i++) {
    const r = createRequest(i, 0, 0, rand, (id) => id === "perm_delivery"); // 只有外卖权限
    if (isDelivery(r)) withPermDelivery = true;
    if (isChat(r)) leakedChat = true; // 聊天卡种(unlockPerm perm_chat)不该在只有外卖权限时进池
  }
  check("Q 有外卖权限·外卖卡种进池(收入流流进来)", withPermDelivery, `外卖 seen=${withPermDelivery}`);
  check("Q 卡种门槛互相隔离·未解锁的聊天卡不泄漏", !leakedChat, `聊天 leaked=${leakedChat}`);
}

// R. LEVER C · 强化处理(computeMult 主力增益线)手机期可及且可见复利：requiredLevel=1、起步价低(手机期买得起)，
//    连买数级即让产出 ×≥2（肉眼可见「number go up」，杀掉「进度=纯涨价」）。
{
  const { SKILLS, skillPrice } = require(path.join(build, "content/skills.js"));
  const eff = SKILLS.find((s) => s.id === "efficient");
  check("R 强化处理·Lv1 起步(手机期即可买)", eff && eff.requiredLevel === 1, `requiredLevel=${eff && eff.requiredLevel}`);
  check("R 强化处理·起步价低(≤20，手机期买得起)", skillPrice(eff, 0) <= 20, `price=${skillPrice(eff, 0)}`);
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 5000 });
  const multBefore = c.getState().derived.computeMult;
  for (let i = 0; i < 5; i++) c.dispatch({ type: "BUY_SKILL", skillId: "efficient" });
  const multAfter = c.getState().derived.computeMult;
  check("R 强化处理·连买 5 级产出 ×≥2(可见复利)", multAfter >= 2 && multAfter > multBefore, `computeMult ${multBefore.toFixed(2)}->${multAfter.toFixed(2)}`);
}

let pass = true;
for (const r of results) { if (!r.ok) pass = false; console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : "  -> " + r.detail}`); }
console.log(`\nSOPHIA 循环跑测 — ${pass ? "ALL PASS ✅" : "FAIL ❌"}`);
process.exit(pass ? 0 : 1);
