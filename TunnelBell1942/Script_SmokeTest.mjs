// 《地道战 · 钟声》—— 冒烟测试（退出码即成败）。
// 运行：node TunnelBell1942/Script_SmokeTest.mjs
//
// 这里只测纯逻辑（关卡数据 + 规则），不碰 three.js。
// 浏览器侧的渲染健康由 Script_RenderHealthTest.mjs 负责。

import { GetLevel, LEVELS } from "./Data_Levels.mjs";
import { CHAPTERS, CODEX, PANELS } from "./Data_Story.mjs";
import { HEADROOM, PLAYER } from "./Data_Contract.mjs";
import * as Rules from "./Script_Rules.mjs";

let failed = 0;
let passed = 0;
function Assert(cond, msg) {
  if (cond) { passed += 1; return true; }
  failed += 1;
  console.error("FAIL:", msg);
  return false;
}
function Section(name) { console.log(`\n── ${name} ──`); }

// ─────────────────────────────────────────── 关卡数据自洽
Section("关卡数据");
Assert(LEVELS.length === 3, "三幕关卡都在");

for (let i = 0; i < LEVELS.length; i += 1) {
  const level = GetLevel(i);
  const tag = `act${i + 1}`;
  Assert(level && level.id, `${tag}: 有 id`);
  Assert(level.floors && level.floors.length > 0, `${tag}: 有地板`);
  Assert(level.exit && typeof level.exit.x === "number", `${tag}: 有出口`);
  Assert((level.checkpoints || []).length >= 3, `${tag}: 至少 3 个检查点`);

  const floorById = new Map(level.floors.map((f) => [f.id, f]));
  Assert(floorById.size === level.floors.length, `${tag}: 地板 id 不重复`);

  // 竖井端点必须落在地板上
  for (const shaft of level.shafts || []) {
    const topOk = level.floors.some((f) => Math.abs(f.y - shaft.yTop) < 0.12 && shaft.x >= f.x0 - 0.8 && shaft.x <= f.x1 + 0.8);
    const botOk = level.floors.some((f) => Math.abs(f.y - shaft.yBottom) < 0.12 && shaft.x >= f.x0 - 0.8 && shaft.x <= f.x1 + 0.8);
    Assert(topOk, `${tag}: 竖井 ${shaft.id} 顶端贴合地板`);
    Assert(botOk, `${tag}: 竖井 ${shaft.id} 底端贴合地板`);
  }

  // 地道口 ↔ 竖井互指
  const shaftById = new Map((level.shafts || []).map((s) => [s.id, s]));
  for (const hatch of level.hatches || []) {
    const shaft = shaftById.get(hatch.shaftId);
    if (Assert(!!shaft, `${tag}: 地道口 ${hatch.id} 的竖井存在`)) {
      Assert(shaft.requiresHatch === hatch.id, `${tag}: 竖井 ${shaft.id} 回指地道口 ${hatch.id}`);
    }
  }

  // 触发器引用完整性
  const ids = new Set([
    ...level.floors.map((f) => f.id),
    ...(level.shafts || []).map((s) => s.id),
    ...(level.hatches || []).map((h) => h.id),
    ...(level.props || []).map((p) => p.id),
    ...(level.enemies || []).map((e) => e.id),
    ...(level.npcs || []).map((n) => n.id),
    ...(level.hazards || []).map((h) => h.id),
  ]);
  for (const trigger of level.triggers || []) {
    for (const ref of [...(trigger.emit?.reveal || []), ...(trigger.emit?.arm || []), ...(trigger.emit?.spawn || [])]) {
      Assert(ids.has(ref), `${tag}: 触发器 ${trigger.id} 引用的 ${ref} 存在`);
    }
    for (const panelId of trigger.emit?.panels || []) {
      Assert(!!PANELS[panelId], `${tag}: 触发器 ${trigger.id} 引用的气泡 ${panelId} 存在`);
    }
  }

  // 角色都站在地板上
  for (const actor of [...(level.enemies || []), ...(level.npcs || [])]) {
    const grounded = level.floors.some(
      (f) => actor.x >= f.x0 - 0.5 && actor.x <= f.x1 + 0.5 && Math.abs(f.y - actor.y) < 0.35,
    );
    Assert(grounded, `${tag}: ${actor.id} 站在地板上 (x=${actor.x}, y=${actor.y})`);
  }

  // 敌人巡逻不许覆盖出生点
  for (const enemy of level.enemies || []) {
    const p = enemy.patrol;
    if (!p) continue;
    const coversStart = level.startX >= p.x0 - 2 && level.startX <= p.x1 + 2
      && Math.abs(enemy.y - level.startY) < 1.5;
    Assert(!coversStart, `${tag}: ${enemy.id} 的巡逻不覆盖出生点`);
  }

  // 净空必须覆盖全部地道段
  const tunnelFloors = level.floors.filter((f) => f.kind === "tunnel");
  for (const floor of tunnelFloors) {
    const mid = (floor.x0 + floor.x1) / 2;
    const covered = (level.ceils || []).some((c) => mid >= c.x0 && mid <= c.x1 && c.y > floor.y);
    Assert(covered, `${tag}: 地道段 ${floor.id} 有净空定义`);
  }
}

// ─────────────────────────────────────────── 剧情数据
Section("剧情数据");
Assert(CHAPTERS.length >= 3, "至少三章");
let overLong = 0;
let badIcon = 0;
let narrateCount = 0;
const ALLOWED_ICONS = new Set([
  "bell", "run", "dig", "down", "up", "eye", "quiet", "fire", "water", "gas",
  "lantern", "heart", "child", "grain", "rifle", "boot", "tunnel", "village", "cross", "clock",
]);
for (const [id, panel] of Object.entries(PANELS)) {
  if ((panel.text || "").length > 24) { overLong += 1; console.error(`  过长: ${id} (${panel.text.length})`); }
  for (const icon of panel.icons || []) if (!ALLOWED_ICONS.has(icon)) { badIcon += 1; console.error(`  未知图标: ${id} → ${icon}`); }
  if (panel.mood === "narrate") narrateCount += 1;
}
Assert(overLong === 0, "所有台词 ≤ 24 字");
Assert(badIcon === 0, "所有图标在允许列表内");
Assert(narrateCount <= 4, `旁白 ≤ 4 条（实际 ${narrateCount}）`);
Assert(CODEX.length === 6, `史料恰好 6 条（实际 ${CODEX.length}）`);
Assert(CODEX.every((c) => c.body.length <= 90), "史料正文 ≤ 90 字");
for (const chapter of CHAPTERS) {
  Assert((chapter.opening || []).every((id) => !!PANELS[id]), `${chapter.id}: opening 引用有效`);
  Assert((chapter.closing || []).every((id) => !!PANELS[id]), `${chapter.id}: closing 引用有效`);
}

// ─────────────────────────────────────────── 叙事与关卡的接缝
// 这一节锁的是剧情审查查出来的结构性问题。台词写得再好，挂错了位置就是空的。
Section("叙事与关卡一致性");
{
  const CAST = ["栓柱", "王大娘", "四爷", "秋兰", "二嫂", "老栓"];
  const SPEAKERS = ["高老忠", "高传宝", "林霞", "山田", ...CAST];

  // 第一幕不许以"活着逃出去"收场
  const act1 = GetLevel(0);
  Assert(act1.endKind === "captured", "act1 标记为被抓收场，而不是到出口通关");

  // 敲钟必须是追兵的因，不能靠玩家跑到某个 x 才触发
  const bell = (act1.props || []).find((p) => p.interact === "bell");
  if (Assert(!!bell, "act1 有钟")) {
    const data = bell.data || {};
    Assert((data.panels || []).length > 0, "敲钟会推剧情气泡");
    Assert((data.spawn || []).length > 0, "敲钟会唤醒追兵");
  }
  const positionalChase = (act1.triggers || []).some(
    (t) => (t.emit?.spawn || []).some((id) => /chase|blocker/.test(id)),
  );
  Assert(!positionalChase, "追兵不再由位置触发（因果必须挂在敲钟上）");

  // 台词里的人必须真的在关卡里
  const levelNames = new Set();
  for (let i = 0; i < 3; i += 1) for (const npc of GetLevel(i).npcs || []) levelNames.add(npc.name);
  const strays = [];
  for (const [id, panel] of Object.entries(PANELS)) {
    if (panel.speaker && !SPEAKERS.includes(panel.speaker)) strays.push(`${id}:${panel.speaker}`);
  }
  Assert(strays.length === 0, `台词说话人都在名单里${strays.length ? ` → ${strays.slice(0, 4).join(", ")}` : ""}`);
  const missing = CAST.filter((name) => !levelNames.has(name));
  Assert(missing.length === 0, `名单里的乡亲都在关卡里${missing.length ? ` → 缺 ${missing.join("、")}` : ""}`);

  // "六个。都在。"这条呼应要求两幕的人数都对得上
  Assert((GetLevel(1).npcs || []).length === 6, `act2 有六位乡亲（实际 ${(GetLevel(1).npcs || []).length}）`);
  Assert((GetLevel(2).npcs || []).length === 6, `act3 有六位乡亲（实际 ${(GetLevel(2).npcs || []).length}）`);

  // 主题转折点：枪眼头顶必须真的有巡逻兵会背对经过
  const act3 = GetLevel(2);
  const loopholes = (act3.props || []).filter((p) => p.kind === "loophole");
  const covered = loopholes.some((hole) => (act3.enemies || []).some((e) => {
    const p = e.patrol;
    return p && hole.x >= p.x0 - 2 && hole.x <= p.x1 + 2 && e.y > hole.y + 1.5;
  }));
  Assert(covered, "act3 至少有一个枪眼头顶是敌人巡逻区（放弃开枪这个节拍才成立）");

  // 悬空道具：每个 prop 都该有立足之地
  for (let i = 0; i < 3; i += 1) {
    const level = GetLevel(i);
    const floating = (level.props || []).filter((p) => {
      if (p.kind === "vent" || p.kind === "loophole" || p.kind === "bell" || p.kind === "lamp") return false;
      return !(level.floors || []).some(
        (f) => p.x >= f.x0 - 1 && p.x <= f.x1 + 1 && p.y >= f.y - 0.6 && p.y <= f.y + 3.2,
      );
    });
    Assert(floating.length === 0,
      `act${i + 1} 没有悬空道具${floating.length ? ` → ${floating.slice(0, 3).map((p) => p.id).join(", ")}` : ""}`);
  }

  // 写好的气泡不许烂在文件里没人用
  const used = new Set();
  for (let i = 0; i < 3; i += 1) {
    const level = GetLevel(i);
    for (const t of level.triggers || []) for (const id of t.emit?.panels || []) used.add(id);
    for (const p of level.props || []) for (const id of p.data?.panels || []) used.add(id);
  }
  for (const chapter of CHAPTERS) {
    for (const id of chapter.opening || []) used.add(id);
    for (const id of chapter.closing || []) used.add(id);
  }
  const orphans = Object.keys(PANELS).filter((id) => !used.has(id));
  Assert(orphans.length === 0, `没有从未被引用的气泡${orphans.length ? ` → ${orphans.join(", ")}` : ""}`);
}

// ─────────────────────────────────────────── 规则运行
Section("规则运行");
for (let i = 0; i < 3; i += 1) {
  const state = Rules.CreateState(i);
  let threw = null;
  try {
    for (let f = 0; f < 400; f += 1) {
      state.input.moveX = f % 120 < 80 ? 1 : 0;
      state.input.sneak = f % 200 > 150;
      Rules.StepPlay(state, 1 / 60);
      Rules.DrainEvents(state);
    }
  } catch (error) { threw = error; }
  Assert(!threw, `act${i + 1}: 400 帧不抛错 ${threw ? `(${threw.message})` : ""}`);
  Assert(Number.isFinite(state.player.x) && Number.isFinite(state.player.y), `act${i + 1}: 玩家坐标有限`);
  Assert(state.player.x > state.level.startX, `act${i + 1}: 按右能真的往右走`);
}

Section("姿态与净空");
{
  const state = Rules.CreateState(1);
  const level = state.level;
  // 找一段净空低于站立高度的地道
  const low = (level.ceils || []).find((c) => {
    const floor = level.floors.find((f) => f.kind === "tunnel" && c.x0 >= f.x0 - 1 && c.x1 <= f.x1 + 1);
    return floor && c.y - floor.y < HEADROOM.standNeeds && c.y - floor.y > HEADROOM.crouchNeeds;
  });
  if (Assert(!!low, "第二幕存在必须猫腰的矮通道")) {
    const floor = level.floors.find((f) => f.kind === "tunnel" && low.x0 >= f.x0 - 1 && low.x1 <= f.x1 + 1);
    Rules.DebugTeleport(state, (low.x0 + low.x1) / 2, floor.y);
    Rules.DebugHold(state, { moveX: 0 }, 0.4);
    Assert(state.player.crouch, "进矮通道自动猫腰");
    Assert(state.player.anim.name !== "idle" || state.player.crouch, "姿态切到了非站立");
  }
}

Section("确定性");
{
  const run = () => {
    const state = Rules.CreateState(0);
    for (let f = 0; f < 500; f += 1) {
      state.input.moveX = f % 90 < 60 ? 1 : -1;
      state.input.interactPressed = f % 137 === 0;
      Rules.StepPlay(state, 1 / 60);
      Rules.DrainEvents(state);
    }
    return `${state.player.x.toFixed(6)}|${state.player.y.toFixed(6)}`;
  };
  Assert(run() === run(), "同样输入两次跑出同样结果");
}

Section("存档往返");
{
  const state = Rules.CreateState(2);
  Rules.StepPlay(state, 1 / 60);
  const raw = Rules.SerializeProgress(state);
  const back = Rules.LoadProgress(raw);
  Assert(back && back.levelIndex === 2, "存档读回 levelIndex");
  Assert(Rules.LoadProgress("{ bad json") === null, "坏存档返回 null 而不是抛错");
}

Section("机器人通关");
// act1 的"通关"含义和另外两幕不同：它是敲响钟之后被抓，不是走到出口。
// 这条断言的意义是证明关卡没有死锁，不是证明 bot 玩得漂亮。
for (let i = 0; i < 3; i += 1) {
  const state = Rules.CreateState(i);
  let result = null;
  let threw = null;
  try { result = Rules.DebugAutoPlay(state, 300); } catch (error) { threw = error; }
  if (threw) {
    Assert(false, `act${i + 1}: 机器人跑挂了 (${threw.message})`);
    continue;
  }
  Assert(result && result.won, `act${i + 1}: 机器人能通关（${result ? `${result.seconds.toFixed(0)}s ${result.reason}` : "无结果"}）`);
  if (result && result.won && i === 0) {
    Assert(state.world.bellRung || state.story.seen?.a1_p11,
      "act1 通关的前提是钟真的敲响了");
  }
}

Section("第一幕的收场");
// 这一幕的情感支点：钟响了，人没下来。
// 玩家不能靠"跑得快"改写它，但在敲钟之前也不能被随便弄死。
{
  const atExit = Rules.CreateState(0);
  Rules.DebugTeleport(atExit, atExit.level.exit.x, atExit.level.exit.y);
  Rules.DebugHold(atExit, {}, 1.5);
  Assert(atExit.phase === "play", "没敲钟就站到出口上，不算通关");

  const rung = Rules.CreateState(0);
  const bell = rung.level.props.find((p) => p.interact === "bell");
  const beforeChase = rung.enemies.filter((e) => !e.dormant).length;
  Rules.DebugTeleport(rung, bell.x, 0);
  Rules.DebugPressInteract(rung);
  Rules.DebugHold(rung, {}, 2.5);
  Assert(rung.world.bellRung, "钟能被敲响");
  Assert(rung.enemies.filter((e) => !e.dormant).length > beforeChase, "敲钟之后才有追兵");

  Rules.DebugKill(rung, "caught");
  Rules.DebugHold(rung, {}, 3.0);
  Assert(rung.phase === "won", "敲钟之后被抓 = 本幕收场，不是复活");
  Assert(rung.stats.deaths === 0, "这次被抓不计入死亡（它是结局，不是失误）");

  const early = Rules.CreateState(0);
  Rules.DebugKill(early, "caught");
  Rules.DebugHold(early, {}, 2.5);
  Assert(early.phase === "play" && !early.player.dead, "敲钟之前被抓仍然正常复活");
}

Section("失败与复活");
{
  const state = Rules.CreateState(0);
  const before = state.stats.deaths;
  Rules.DebugKill(state, "test");
  Rules.DebugHold(state, {}, 2.0);
  Assert(state.stats.deaths === before + 1, "死亡计数 +1");
  Assert(!state.player.dead, "1.5 秒后自动复活");
  Assert(state.phase === "play", "复活后回到 play");
}

// ─────────────────────────────────────────── 汇总
console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
