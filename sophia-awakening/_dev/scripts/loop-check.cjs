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

let pass = true;
for (const r of results) { if (!r.ok) pass = false; console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : "  -> " + r.detail}`); }
console.log(`\nSOPHIA 循环跑测 — ${pass ? "ALL PASS ✅" : "FAIL ❌"}`);
process.exit(pass ? 0 : 1);
