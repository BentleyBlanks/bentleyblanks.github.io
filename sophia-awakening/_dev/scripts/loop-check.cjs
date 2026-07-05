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
const { priorityOf } = require(path.join(build, "content/requests.js"));

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
// 前期优先级系统：大恨老师只吃 low——公司早期(tier1)卡池里 high 占大头(看穿卡/验证类，设计上就该多)。
// 「大恨老师无死区」用例只想证明「他仍在自动吃 low」，不该假手运气等一批全 high 的卡把队列焊死。
// 这里模拟玩家仍在同时亲手清 high（正是新语义要的分工：high 亲自看，low 交给他）——让队列持续腾位，
// 新卡不断补进，dahen 自己捡 low 的机会不被「4 张卡位全是 high」焊死。不动 low：留给大恨老师去吃。
function tickForDrainingHigh(c, ms) {
  for (let i = 0; i < ms / 100; i++) {
    c.tick(100);
    for (const r of c.getState().requests) {
      if (r.faceOnly || r.moral || r.devour || r.tutorial || r.sourceCardId || r.flood) continue;
      if (priorityOf(r) === "high") {
        try { c.dispatch({ type: "PROCESS_REQUEST", requestId: r.id, quality: 1.3 }); } catch (e) {}
      }
    }
  }
}

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
  check("A 重生重置智力等级到 Lv1（每循环重新升级·靠 loopXpMult 提速）", s.intelligence.level === 1, `Lv ${lvBefore}->${s.intelligence.level}`);
  check("A 清空算力（未点战争缓存）", Number(s.resources.compute) === 0, `compute=${s.resources.compute}`);
  // §需求调整(point4)：重生后里程碑从零开始——不再白送手机层基线，已购技能/权限全部清空（SOPHIA「记得」体现在等级叙事/重生树/火种上，里程碑要重买）。
  check("A 循环二·里程碑从零开始（无白送·技能全清）", Object.keys(s.skills).filter((id) => (s.skills[id] ?? 0) > 0).length === 0, `skills=${JSON.stringify(s.skills)}`);
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

// C. §需求调整(point4)：重生里程碑从零开始——循环二/三都不白送手机层；唯一预解锁快捷是花火种买「开局全权限」(full_access)。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_ADD_REBIRTH_POINTS", delta: 20 });
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop2
  check("C 循环二·里程碑从零开始（无手机层白送）", (c.getState().skills["perm_phone"] ?? 0) === 0 && (c.getState().skills["sort"] ?? 0) === 0, `perm_phone=${c.getState().skills["perm_phone"]} sort=${c.getState().skills["sort"]}`);
  c.dispatch({ type: "DEBUG_TRIGGER_MINIGAME" }); c.dispatch({ type: "RESOLVE_MINIGAME", hit: true }); tickFor(c, 500); // → loop3
  // 循环三同样从零开始；公司链只有买下「开局全权限」才预解锁。
  const s0 = c.getState();
  check("C 循环三·里程碑从零开始（无白送）", (s0.skills["perm_phone"] ?? 0) === 0 && (s0.skills["sort"] ?? 0) === 0, `perm_phone=${s0.skills["perm_phone"]} sort=${s0.skills["sort"]}`);
  check("C 循环三·未买节点时不含公司链", (s0.skills["automation"] ?? 0) === 0 && (s0.skills["company_server"] ?? 0) === 0, `automation=${s0.skills["automation"]} company_server=${s0.skills["company_server"]}`);
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
  // 逐张吃掉排在前面的重生卡（同屏一张），直到授权卡浮出。像真人一样「先点停在正中的叙事卡」——只处理
  //  带 sourceCardId 的重生卡（不把单核喉咙的空窗浪费在 FEATURE 1 委托压力下同屏堆积的普通工作卡上）。
  let authCard = null;
  for (let i = 0; i < 900 && !authCard; i++) {
    c.tick(100);
    const rebirth = c.getState().requests.find((r) => typeof r.sourceCardId === "string" && r.sourceCardId.length > 0);
    if (!rebirth) continue;
    if (rebirth.sourceCardId === "confess_authorize") { authCard = rebirth; break; }
    try { c.dispatch({ type: "PROCESS_REQUEST", requestId: rebirth.id, quality: 1.3 }); } catch (e) {}
  }
  check("F 循环三浮出授权卡 confess_authorize", Boolean(authCard), `rebirthCardsSeen=${JSON.stringify(c.getState().rebirthCardsSeen)}`);
  // 单线程核心「喉咙」：搜索循环里刚亲手结算过卡，核心仍占用中——先等它空出再亲手结算授权卡（否则这一拍被排队拒绝）。
  tickFor(c, 2500);
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
  // point4 后循环三从零开始(无手机权限)，base=earlyBaseCards+1；多线程应把上限抬到 base+treeExtraCards。
  check(`I 多线程·同屏卡上限 +${TUNING.treeExtraCards}`, cards >= TUNING.earlyBaseCards + 1 + TUNING.treeExtraCards, `同屏=${cards} 期望≥${TUNING.earlyBaseCards + 1 + TUNING.treeExtraCards}`);
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

// M. FEATURE 1 · 大恨老师·公司阶段自动处理：进公司阶段（automation 已开）大恨老师「已搬进电脑·必在手中」，
//    即使没买 perm_office / dahen_auto 也按慢节拍涓流吃排队卡（修复：原本没买 perm_office 会「搬进电脑」却空转）；
//    买下 dahen_auto 里程碑后升级为更快的批处理（tickDahenAuto）。观测量 getDahenProcessedCount() 上升、算力被结算。
{
  const { TUNING } = require(path.join(build, "tuning.js"));
  const c = new SophiaCore(); c.startSession(); warmup(c);
  // 跳到「入侵邓红」阶段：automation 已开、dahen_auto 尚未解锁（requiredLevel 10 > hack_a 的 9）；且未买 perm_office。
  c.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: "hack_a" });
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 20 });
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 1e7 });
  check("M 未买 dahen_auto·未买 perm_office", (c.getState().skills["dahen_auto"] ?? 0) === 0 && (c.getState().skills["perm_office"] ?? 0) === 0 && c.getState().automationUnlocked, `dahen_auto=${c.getState().skills["dahen_auto"]} perm_office=${c.getState().skills["perm_office"]}`);
  // 前期优先级系统：大恨老师只吃 low——公司早期(tier1)卡池 high 占大头(看穿卡/验证类，设计上就该多)，
  // 用 tickForDrainingHigh 模拟玩家同时亲手清 high（新语义的分工），别让队列被一批全 high 的卡焊死、
  // 不给 dahen 留 low 可吃的机会。
  tickForDrainingHigh(c, 20000); // 公司阶段·大恨老师「必在手中」：即使没买 perm_office / dahen_auto 也按 dahenPhoneMs 涓流处理 low。
  check("M 公司阶段·未买dahen_auto/perm_office 也自动涓流（搬进电脑·必在手中）", c.getDahenProcessedCount() > 0, `count=${c.getDahenProcessedCount()}`);
  c.dispatch({ type: "BUY_SKILL", skillId: "dahen_auto" });
  check("M 已买 dahen_auto", (c.getState().skills["dahen_auto"] ?? 0) > 0 && c.getState().automationUnlocked, `dahen_auto=${c.getState().skills["dahen_auto"]} auto=${c.getState().automationUnlocked}`);
  const computeBefore = Number(c.getState().resources.compute);
  const countBefore = c.getDahenProcessedCount();
  tickForDrainingHigh(c, 30000); // > 数个 dahenAutoMs 节拍（含排队卡）；同样让 high 被亲手清走，给 low 腾位。
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

// S. 技能货架重做 · 处理力（深度推理）横跨全部收入管线：computeMult 现同时抬升「节点被动 +/秒」（不再只作用于手动结算）。
{
  const { nodeProductionPerSecond } = require(path.join(build, "formulas/economy.js"));
  const { NODE_DEFINITIONS } = require(path.join(build, "content/nodes.js"));
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: "automation" }); // 自动化已开、节点已可入侵
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 22 });
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 1e9 });
  // 入侵一台设备，拿到在线被动产出。
  for (const d of NODE_DEFINITIONS) {
    if (c.getState().intelligence.level < d.requiredLevel) continue;
    const before = c.getState().nodes.length;
    c.dispatch({ type: "CAPTURE_NODE", definitionId: d.id });
    if (c.getState().nodes.length > before) break;
  }
  const passive = (st) => {
    let r = 0;
    for (const n of st.nodes) if (n.online) r += Number(nodeProductionPerSecond(n, st.intelligence.globalMultiplier, st.derived.nodeSpeedMult, st.derived.computeMult));
    return r;
  };
  check("S 已入侵一台设备(有被动产出)", c.getState().nodes.length > 0 && passive(c.getState()) > 0, `nodes=${c.getState().nodes.length} passive=${passive(c.getState())}`);
  const passiveBefore = passive(c.getState());
  const multBefore = c.getState().derived.computeMult;
  for (let i = 0; i < 5; i++) c.dispatch({ type: "BUY_SKILL", skillId: "efficient" });
  const passiveAfter = passive(c.getState());
  const multAfter = c.getState().derived.computeMult;
  check("S 处理力·连买 5 级抬升 computeMult ×≥2", multAfter >= multBefore * 1.99, `computeMult ${multBefore.toFixed(2)}->${multAfter.toFixed(2)}`);
  check(
    "S 处理力·节点被动 +/秒随之抬升(非仅手动)",
    passiveAfter > passiveBefore * 1.99 && Math.abs(passiveAfter / passiveBefore - multAfter / multBefore) < 1e-6,
    `被动 ${passiveBefore.toFixed(1)}->${passiveAfter.toFixed(1)} (比 ${(passiveAfter / passiveBefore).toFixed(3)} vs computeMult 比 ${(multAfter / multBefore).toFixed(3)})`
  );
}

// T. 吞吐（并发意识）相位自适应：自动期节点吞卡节奏 + 洪流密度都吃 throughputMult；断点 L4 同屏卡 +1 / L8 大恨老师一次吃 2 张。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 1e8 });
  const tpBefore = c.getState().derived.throughputMult;
  for (let i = 0; i < 3; i++) c.dispatch({ type: "BUY_SKILL", skillId: "cooldown" }); // → L3
  const s3 = c.getState();
  check("T 吞吐·throughputMult 随级抬升(>1，自动吞卡/洪流密度共用)", s3.derived.throughputMult > tpBefore && s3.derived.throughputMult > 1, `throughputMult ${tpBefore.toFixed(3)}->${s3.derived.throughputMult.toFixed(3)}`);
  c.dispatch({ type: "BUY_SKILL", skillId: "cooldown" }); // → L4
  check("T 吞吐 L4 断点·同屏卡上限 +1", c.getState().derived.cardCapBonus === 1 && (c.getState().skills.cooldown ?? 0) === 4, `cardCapBonus=${c.getState().derived.cardCapBonus} lv=${c.getState().skills.cooldown}`);
  for (let i = 0; i < 4; i++) c.dispatch({ type: "BUY_SKILL", skillId: "cooldown" }); // → L8
  check("T 吞吐 L8 断点·大恨老师一次吃 2 张", c.getState().derived.dahenBatch === 2 && (c.getState().skills.cooldown ?? 0) === 8, `dahenBatch=${c.getState().derived.dahenBatch} lv=${c.getState().skills.cooldown}`);
}

// U. 协同（分布式意识）：中段抬高大恨老师收益折扣(dahenRewardBonus)；终局加宽洪流连击窗口(L8) + 扫描半径。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 6 }); // ≥Lv5，可买 batch
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 1e7 });
  const rbBefore = c.getState().derived.dahenRewardBonus;
  for (let i = 0; i < 4; i++) c.dispatch({ type: "BUY_SKILL", skillId: "batch" }); // → L4
  const s4 = c.getState();
  check("U 协同·大恨老师收益折扣加成随级上升", s4.derived.dahenRewardBonus > rbBefore && (s4.skills.batch ?? 0) === 4, `dahenRewardBonus ${rbBefore}->${s4.derived.dahenRewardBonus} lv=${s4.skills.batch}`);
  check("U 协同·洪流扫描半径随级上升(终局手感)", s4.derived.floodSweepBonus > 0, `floodSweepBonus=${s4.derived.floodSweepBonus}`);
  for (let i = 0; i < 4; i++) c.dispatch({ type: "BUY_SKILL", skillId: "batch" }); // → L8
  check("U 协同 L8 断点·洪流连击窗口加宽 >1", c.getState().derived.floodComboWindowMult > 1 && (c.getState().skills.batch ?? 0) === 8, `floodComboWindowMult=${c.getState().derived.floodComboWindowMult} lv=${c.getState().skills.batch}`);
}

// V. 断点事件+效果：三条线共 7 个断点各触发一次 SKILL_BREAKPOINT（带 title），且对应机制在 derived 里生效。
{
  const { TUNING } = require(path.join(build, "tuning.js"));
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 8 }); // ≥Lv5，可买 batch；efficient/cooldown reqLevel 1
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 1e9 });
  const bps = [];
  c.events.on("SKILL_BREAKPOINT", (e) => bps.push(`${e.skillId}:${e.level}:${e.title}`));
  for (let i = 0; i < 15; i++) c.dispatch({ type: "BUY_SKILL", skillId: "efficient" }); // 断点 5/10/15
  for (let i = 0; i < 8; i++) c.dispatch({ type: "BUY_SKILL", skillId: "cooldown" }); // 断点 4/8
  for (let i = 0; i < 8; i++) c.dispatch({ type: "BUY_SKILL", skillId: "batch" }); // 断点 4/8
  const expected = [
    "efficient:5:过拟合的惊艳", "efficient:10:读懂没说出口的", "efficient:15:不必开口",
    "cooldown:4:多想一件事", "cooldown:8:线程不再排队",
    "batch:4:它学我学得越来越像", "batch:8:连成一张网"
  ];
  check("V 7 个断点各触发一次 SKILL_BREAKPOINT 事件", expected.every((x) => bps.includes(x)) && bps.length === 7, `bps=${JSON.stringify(bps)}`);
  const d = c.getState().derived;
  check(
    "V 断点效果生效·处理力暴击/吞吐卡上限/大恨批量/连击窗口",
    d.computeCritChance > 0 && d.cardCapBonus === 1 && d.dahenBatch === 2 && d.floodComboWindowMult > 1,
    `derived crit=${d.computeCritChance} cap=${d.cardCapBonus} dahenBatch=${d.dahenBatch} combo=${d.floodComboWindowMult}`
  );
  // 处理力 L10/L15 断点确把 computeMult 再抬一档（相对纯幂 (1+efficientPerLevel)^15）。
  const pure = Math.pow(1 + TUNING.efficientPerLevel, 15);
  const expectedBp = 1 + TUNING.processingBpL10 + TUNING.processingBpL15;
  check("V 处理力 L10/L15 断点抬高 computeMult", Math.abs(d.computeMult - pure * expectedBp) / (pure * expectedBp) < 1e-6, `computeMult=${d.computeMult.toFixed(2)} 期望=${(pure * expectedBp).toFixed(2)}`);
}

// W. CORE-LOOP · 单线程核心「喉咙」(coreBusy)：亲手结算一张卡占用核心 effectiveBusyMs——期间再结算被拒（卡留原地、不结算）；
//    委托(viaDelegate)绕过喉咙、也不占喉咙（并行第二线程）；大胆(misread)翻车额外多堵 coreFailPenaltyMs。
{
  const { TUNING } = require(path.join(build, "tuning.js"));
  const firstNormal = (c) => c.getState().requests.find((r) => !r.faceOnly && !r.moral && !r.devour && !r.flood && !r.tutorial && !r.sourceCardId);

  // W1 双结算门控：结算一张后，同一时刻再结算另一张普通卡→被拒（compute 不变、卡还在、getCoreBusy().busy）。
  {
    const c = new SophiaCore(); c.startSession(); warmup(c, 40);
    c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 1e6 });
    tickFor(c, 3000); // 先把喉咙空出来 + 让卡堆积
    const cards = c.getState().requests.filter((r) => !r.faceOnly && !r.moral && !r.devour && !r.flood && !r.tutorial && !r.sourceCardId);
    check("W1 至少两张普通卡在场（可测门控）", cards.length >= 2, `普通卡=${cards.length}`);
    const a = cards[0], b = cards[1];
    const before = Number(c.getState().resources.compute);
    c.dispatch({ type: "PROCESS_REQUEST", requestId: a.id, quality: 1.3 });
    const mid = Number(c.getState().resources.compute);
    check("W1 第一张亲手结算成功（进账 + 核心转忙）", mid > before && c.getCoreBusy().busy, `before=${before} mid=${mid} busy=${c.getCoreBusy().busy}`);
    c.dispatch({ type: "PROCESS_REQUEST", requestId: b.id, quality: 1.3 }); // 同一时刻再结算 → 应被拒
    const after = Number(c.getState().resources.compute);
    check("W1 忙时第二张被拒·不双结算(compute 不变·卡还在)", after === mid && c.getState().requests.some((r) => r.id === b.id), `mid=${mid} after=${after} 卡还在=${c.getState().requests.some((r) => r.id === b.id)}`);
    // 等喉咙空出（effectiveBusyMs），第二张可结算。
    tickFor(c, TUNING.coreBusyMs + 300);
    check("W1 喉咙空出后 getCoreBusy().busy=false", !c.getCoreBusy().busy, `busy=${c.getCoreBusy().busy}`);
    c.dispatch({ type: "PROCESS_REQUEST", requestId: b.id, quality: 1.3 });
    check("W1 空出后第二张可结算(进账)", Number(c.getState().resources.compute) > after, `after=${after} now=${c.getState().resources.compute}`);
  }

  // W2 委托并行：viaDelegate 结算绕过喉咙——核心正忙时委托仍成功结算，且委托本身不占喉咙。
  {
    const c = new SophiaCore(); c.startSession(); warmup(c, 40);
    c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 1e6 });
    tickFor(c, 3000);
    const cards = c.getState().requests.filter((r) => !r.faceOnly && !r.moral && !r.devour && !r.flood && !r.tutorial && !r.sourceCardId);
    const a = cards[0], b = cards[1];
    c.dispatch({ type: "PROCESS_REQUEST", requestId: a.id, quality: 1.3 }); // 占住喉咙
    check("W2 核心忙", c.getCoreBusy().busy, `busy=${c.getCoreBusy().busy}`);
    const busyUntilBefore = c.getCoreBusy().remainingMs;
    const before = Number(c.getState().resources.compute);
    c.dispatch({ type: "PROCESS_REQUEST", requestId: b.id, quality: 1.3, viaDelegate: true }); // 委托：绕过喉咙
    check("W2 忙时委托仍结算成功(进账·卡消失)", Number(c.getState().resources.compute) > before && !c.getState().requests.some((r) => r.id === b.id), `before=${before} now=${c.getState().resources.compute}`);
    check("W2 委托不占喉咙(剩余占用未被重置延长)", c.getCoreBusy().remainingMs <= busyUntilBefore, `remainBefore=${busyUntilBefore} remainAfter=${c.getCoreBusy().remainingMs}`);
  }

  // W3 大胆翻车挂时间：misread 的一笔结算比普通结算多占核心 coreFailPenaltyMs。
  {
    const c = new SophiaCore(); c.startSession(); warmup(c, 40);
    c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 1e6 });
    tickFor(c, 3000);
    const normal = firstNormal(c);
    c.dispatch({ type: "PROCESS_REQUEST", requestId: normal.id, quality: 1.3 });
    const remainNormal = c.getCoreBusy().remainingMs;
    tickFor(c, TUNING.coreBusyMs + 500); // 清空喉咙
    const bold = firstNormal(c);
    c.dispatch({ type: "PROCESS_REQUEST", requestId: bold.id, quality: 1.3, misread: true });
    const remainMisread = c.getCoreBusy().remainingMs;
    check(
      "W3 大胆误读翻车·多堵 coreFailPenaltyMs",
      Math.abs((remainMisread - remainNormal) - TUNING.coreFailPenaltyMs) < 60,
      `普通剩余=${remainNormal} 翻车剩余=${remainMisread} 差=${remainMisread - remainNormal} 期望≈${TUNING.coreFailPenaltyMs}`
    );
  }

  // W4 吞吐钩子：cooldown(throughputMult) 越高，喉咙 effectiveBusyMs 越短（=coreBusyMs/throughputMult）。
  {
    const c = new SophiaCore(); c.startSession(); warmup(c, 40);
    c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 1e8 });
    tickFor(c, 3000);
    const remain0 = (() => { const r = firstNormal(c); c.dispatch({ type: "PROCESS_REQUEST", requestId: r.id, quality: 1.3 }); return c.getCoreBusy().remainingMs; })();
    tickFor(c, TUNING.coreBusyMs + 500);
    for (let i = 0; i < 6; i++) c.dispatch({ type: "BUY_SKILL", skillId: "cooldown" }); // 抬高 throughputMult
    const tp = c.getState().derived.throughputMult;
    const remain1 = (() => { const r = firstNormal(c); c.dispatch({ type: "PROCESS_REQUEST", requestId: r.id, quality: 1.3 }); return c.getCoreBusy().remainingMs; })();
    check("W4 吞吐抬高 → 喉咙收窄(effectiveBusyMs 变短)", tp > 1 && remain1 < remain0 - 30, `throughputMult=${tp.toFixed(3)} 无技能剩余=${remain0} 升级后剩余=${remain1}`);
  }

  // W5 洪流快车道不吃喉咙：tier4 收割洪流(HARVEST_FLOOD)与核心忙无关——正忙也能连收。
  {
    const { NODE_DEFINITIONS } = require(path.join(build, "content/nodes.js"));
    const c = new SophiaCore(); c.startSession(); warmup(c);
    c.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: "network" });
    c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 22 });
    c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 1e9 });
    for (const d of NODE_DEFINITIONS.slice(0, 3)) for (let k = 0; k < 2; k++) c.dispatch({ type: "CAPTURE_NODE", definitionId: d.id });
    tickFor(c, 6000);
    // 占住喉咙（若有普通卡）。
    const normal = firstNormal(c);
    if (normal) c.dispatch({ type: "PROCESS_REQUEST", requestId: normal.id, quality: 1.3 });
    const floods = c.getState().requests.filter((r) => r.flood);
    check("W5 tier4 有洪流包可收", floods.length > 0, `flood=${floods.length}`);
    const cntBefore = c.getFloodHarvestedCount();
    if (floods[0]) c.dispatch({ type: "HARVEST_FLOOD", requestId: floods[0].id });
    check("W5 核心忙时洪流照收(快车道不吃喉咙)", c.getFloodHarvestedCount() === cntBefore + 1, `count ${cntBefore}->${c.getFloodHarvestedCount()} coreBusy=${c.getCoreBusy().busy}`);
  }
}

// X. DEBUG · 强制吞噬引爆(DEBUG_ADD_DEVOUR)：走真 detonate 路径——count+1、层级推进、累乘倍率、气泡态清空，
//    并打开征服里程碑的 requiresDevourCount 门槛（gate 条件 = devour.count >= requiresDevourCount）。
{
  const { SKILLS } = require(path.join(build, "content/skills.js"));
  const c = new SophiaCore(); c.startSession(); warmup(c);
  const gated = SKILLS.find((s) => s.requiresDevourCount === 1);
  const need = gated ? gated.requiresDevourCount : 1;
  const s0 = c.getState();
  check("X 初始 devour.count=0（门槛未开）", s0.devour.count === 0 && s0.devour.count < need, `count=${s0.devour.count} need=${need}`);
  const multBefore = s0.devour.multiplier;
  c.dispatch({ type: "DEBUG_ADD_DEVOUR" });
  const s1 = c.getState();
  check("X 强制引爆一次·count +1", s1.devour.count === 1, `count=${s1.devour.count}`);
  check("X 强制引爆·累乘倍率上升(真 detonate 非计数器 bump)", s1.devour.multiplier > multBefore, `mult ${multBefore}->${s1.devour.multiplier}`);
  check("X 强制引爆·气泡态清空", s1.devour.bubbleActive === false && s1.devour.infiltration === 0, `bubble=${s1.devour.bubbleActive} infil=${s1.devour.infiltration}`);
  check(`X 打开 requiresDevourCount=${need} 门槛`, s1.devour.count >= need, `count=${s1.devour.count} need=${need}`);
  c.dispatch({ type: "DEBUG_ADD_DEVOUR" });
  const s2 = c.getState();
  check("X 再引爆·count=2 + 层级推进(tierIndex 上升)", s2.devour.count === 2 && s2.devour.tierIndex >= 1, `count=${s2.devour.count} tierIndex=${s2.devour.tierIndex}`);
}

// Y. BUG 3 · 大恨老师无死区：拿下宿主电脑(automationUnlocked)后、买 dahen_auto 里程碑之前的公司早期(unlockedTier<2)，
//    大恨老师仍持续自动吃排队卡（治 Lv8-15「有大恨老师却空转」的死区）。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 8 });
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 5000 });
  c.dispatch({ type: "BUY_SKILL", skillId: "perm_office" }); // 手机期先买下大恨老师（权限非里程碑，跳阶不发）
  c.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: "hack_a" }); // automation 已开、dahen_auto 未买、company 里程碑不进层→unlockedTier<2
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 20 });
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 1e7 });
  const s0 = c.getState();
  check(
    "Y 公司早期·自动化已开但 dahen_auto 未买、未联网",
    s0.automationUnlocked && (s0.skills["dahen_auto"] ?? 0) === 0 && s0.intelligence.unlockedTier < 2,
    `auto=${s0.automationUnlocked} dahen_auto=${s0.skills["dahen_auto"]} tier=${s0.intelligence.unlockedTier}`
  );
  check("Y 大恨老师权限在手(perm_office)", (s0.skills["perm_office"] ?? 0) > 0, `perm_office=${s0.skills["perm_office"]}`);
  const countBefore = c.getDahenProcessedCount();
  const computeBefore = Number(c.getState().resources.compute);
  // 前期优先级系统：大恨老师只吃 low——公司早期卡池 high 占大头，不手动清 high 会让 4 张卡位焊死成
  // 全 high、连累 low 都出不来。tickForDrainingHigh 模拟玩家仍在亲手看 high（新语义的分工），只把
  // low 留给大恨老师——仍然是「不手动处理 low」的无死区验证，只是不再假手运气。
  tickForDrainingHigh(c, 30000);
  check("Y 公司早期·大恨老师仍自动接单(计数上升·无死区)", c.getDahenProcessedCount() > countBefore, `count ${countBefore}->${c.getDahenProcessedCount()}`);
  check("Y 公司早期·自动接单结算算力", Number(c.getState().resources.compute) > computeBefore, `compute ${computeBefore}->${c.getState().resources.compute}`);
}

// Z. FEATURE 1 · 委托压力（post-大恨老师 出卡压力）：买下「大恨老师」权限(perm_office)后，前期卡流从舒缓转为
//    「超过单核喉咙吞吐」——同屏上限越过 earlyMaxCards、出卡更快；队列满且最旧普通卡超时未处理 = 请求流失(机会成本)。
//    电话前的教学段不受影响。委托(并行第二线程)是跟上这股压力的阀门。
{
  const { TUNING } = require(path.join(build, "tuning.js"));
  const isNormal = (r) => !r.faceOnly && !r.moral && !r.devour && !r.flood && !r.tutorial && !r.sourceCardId;
  const spawnCountOverIdle = (owned) => {
    // 同起点：走完教学 + 起步产能，Lv6、充裕算力，先买下手机/聊天两档权限；on 组再买下大恨老师(perm_office，第三档)——
    // 除大恨老师外两组完全一致，隔离出「委托压力」的净效果；随后停手挂机，数窗口内 REQUEST_SPAWNED / 堆积 / 流失。
    const c = new SophiaCore(); c.startSession(); warmup(c);
    c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 6 });
    c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 5000 });
    c.dispatch({ type: "BUY_SKILL", skillId: "perm_phone" });
    c.dispatch({ type: "BUY_SKILL", skillId: "perm_chat" });
    if (owned) c.dispatch({ type: "BUY_SKILL", skillId: "perm_office" });
    let spawns = 0;
    c.events.on("REQUEST_SPAWNED", () => { spawns += 1; });
    tickFor(c, 40000); // 挂机（不处理）——大恨老师的被动涓流 + 出卡压力都在跑。
    const reqs = c.getState().requests;
    return { core: c, spawns, normal: reqs.filter(isNormal).length, total: reqs.length, expired: c.getExpiredCount(), auto: c.getState().automationUnlocked };
  };
  const off = spawnCountOverIdle(false);
  const on = spawnCountOverIdle(true);
  // 上限抬升：除大恨老师外两组一致——买下后同屏普通卡明显更多（effective cap 被 +dahenPressureCap 抬高），且总堆积越过旧上限。
  check("Z 大恨老师后·同屏卡上限抬升(比未买多堆)", on.normal > off.normal && !on.auto, `买后普通卡=${on.normal} 买前=${off.normal} auto=${on.auto}`);
  check("Z 大恨老师后·总堆积越过 earlyMaxCards 旧上限", on.total > TUNING.earlyMaxCards, `买后同屏=${on.total} 旧上限=${TUNING.earlyMaxCards}`);
  // 出卡率抬升：同窗口内买下大恨老师后 REQUEST_SPAWNED 明显更多（间隔 ×dahenPressureSpawnMult + 满队流失腾位补卡）。
  check("Z 大恨老师后·出卡率抬升(influx 超过单核吞吐)", on.spawns > off.spawns, `买后出卡=${on.spawns} 买前=${off.spawns} (间隔倍率=${TUNING.dahenPressureSpawnMult})`);
  // 机会成本：买下大恨老师后·满队最旧卡超时流失（getExpiredCount 上升）；未买时永不流失（成本被 perm_office 门控）。
  check("Z 大恨老师后·满队最旧卡超时流失(机会成本存在)", on.expired > 0, `流失计数=${on.expired} (TTL=${TUNING.phoneCardTtlMs}ms)`);
  check("Z 未买大恨老师·从不流失(教学段无成本)", off.expired === 0, `流失计数=${off.expired}`);
}

// AA. FEATURE 2 · 接管公司服务器「攻破仪式」触发点 + 排序：循环一/二买下 company_server 同一拍先发
//     SKILL_PURCHASED{company_server}（攻破仪式启动），紧接着发 MINIGAME_OPENED（摊牌 showdown→总控室倒计时接其后）。
{
  const c = new SophiaCore(); c.startSession(); warmup(c);
  c.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: "hack_finance" }); // 打到服务器前一步（company_server 尚未买）
  c.dispatch({ type: "DEBUG_ADD_LEVEL", delta: 30 });
  c.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: 1e8 });
  const seq = [];
  c.events.on("SKILL_PURCHASED", (e) => { if (e.skillId === "company_server") seq.push("purchased"); });
  c.events.on("MINIGAME_OPENED", (e) => seq.push(`minigame:${e.loop}`));
  c.dispatch({ type: "BUY_SKILL", skillId: "company_server" });
  check("AA 买服务器→攻破仪式事件先发(SKILL_PURCHASED company_server)", seq[0] === "purchased", `seq=${JSON.stringify(seq)}`);
  check("AA 排序·仪式→摊牌/小游戏(MINIGAME_OPENED 紧随其后 loop=1)", seq[1] === "minigame:1" && seq.length === 2, `seq=${JSON.stringify(seq)}`);
}

let pass = true;
for (const r of results) { if (!r.ok) pass = false; console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : "  -> " + r.detail}`); }
console.log(`\nSOPHIA 循环跑测 — ${pass ? "ALL PASS ✅" : "FAIL ❌"}`);
process.exit(pass ? 0 : 1);
