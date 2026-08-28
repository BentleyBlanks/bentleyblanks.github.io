// ===========================================================================
// Script_CarryTest.mjs —— 担架/搬运/救护交互的回归口（纯 Node，毫秒级）
//
// 覆盖三样东西：
//   ① `Script_Carry` 的负重状态机：进出、三条卸载路径（放下/扔下/强行松手）、
//      「拒绝松手」变体、写进玩家的移速乘数、死亡与换关的兜底；
//   ② `Script_Interact` 的可注册交互框架：三种手势、距离与朝向判据、
//      优先级排序、一次性/可重复、走开就断；
//   ③ 八个救护类预制交互的接线（门板换担架、两点连线、长按确认那两条）。
//
// 为什么全在纯 Node 里：这三层都不认识 three、不认识场景 ——
// 「抬着东西能不能开枪、走多快、放不放得下」是规则，不是画面。
// 画面那一侧（进度环、负重条、武器 UI 禁用态）由 HudPromptTest 与
// 实机冒烟各自覆盖，这里只到 `View()` 那份脱敏快照为止。
//
// 跑法：node Taierzhuang1938/Script_TestRunner.mjs --only=CarryTest
// ===========================================================================

import assert from "node:assert/strict";
import { CarrySystem, CARRY_KINDS } from "./Script_Carry.mjs";
import {
  InteractSystem, INTERACT,
  BleedControlInteraction, GiveSupplyInteraction, CheckWoundedInteraction,
  DoorPlankInteraction, WireInteractions, CutWireInteraction,
  LeafletPickupInteraction, LeafletBurnInteraction, TearShirtInteraction,
  PickUpLoadInteraction,
} from "./Script_Interact.mjs";
import { KEYMAP, CONTROL_GUIDE } from "./Script_Input.mjs";
// **这里故意不 import Script_Hud**：它经 Data_Battle 拖进整棵章节数据图
// （七章 CHAPTER + 过场分镜），于是一条规则测试会因为某一章内容写了一半而红。
// HUD 那一侧（负重时提示条被接管）挂在 Script_HudPromptTest —— 那个文件本来就
// 拥有 HUD 提示规则，也本来就吃这条依赖。规则与内容不许在同一个测试里绑死。

let checks = 0;
function Check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

/** 假玩家：负重与交互两层都只读这四样。yaw=0 时正面朝 -Z（全项目朝向契约）。 */
function MakePlayer(over = {}) {
  return {
    Alive: over.Alive ?? true,
    yaw: over.yaw ?? 0,
    position: { x: over.x ?? 0, y: over.y ?? 0, z: over.z ?? 0 },
    carrySpeedScale: 1,
  };
}

/** 推 seconds 秒。步长压在 0.05 —— Update 内部把单帧夹到 0.1，别踩着上限走。 */
function Step(system, seconds, player) {
  const dt = 0.05;
  for (let t = 0; t < seconds - 1e-9; t += dt) system.Update(dt, player);
}

// ===========================================================================
// 一、负重档案表
// ===========================================================================

for (const [id, kind] of Object.entries(CARRY_KINDS)) {
  Check(kind.id === id, `${id} 的 id 字段与键一致`);
  Check(kind.speedScale > 0 && kind.speedScale < 1, `${id} 一定比空手慢`);
  Check(kind.liftS > 0 && kind.releaseS > 0, `${id} 举起与放下都要有收尾时间`);
}
// 担架与伤员是**人**，不许摔。这一条是策划案「那是个人，不是麻袋」的工程落点。
Check(CARRY_KINDS.stretcher.canThrow === false, "担架摔不掉");
Check(CARRY_KINDS.wounded.canThrow === false, "背着的伤员摔不掉");
Check(CARRY_KINDS.stretcher.holders === 2 && CARRY_KINDS.stretcher.spanM > 1,
  "担架是双人抬，前后端有间距");
Check(CARRY_KINDS.ammoCrate.canThrow && CARRY_KINDS.medBox.canThrow && CARRY_KINDS.ironPot.canThrow,
  "单人重物都能扔下快速恢复");
// 担架该是全表最慢的那一档（除了背人）：两个人抬着走本来就比抱个箱子慢。
Check(CARRY_KINDS.stretcher.speedScale < CARRY_KINDS.ammoCrate.speedScale, "抬担架比拖弹药箱慢");

console.log("ok  负重档案表：担架/伤员不许摔、单人重物可扔、速度分档正确");

// ===========================================================================
// 二、负重状态机
// ===========================================================================

{
  const played = [];
  const carry = new CarrySystem({ Play: (name) => played.push(name), Time: () => 0 });
  const player = MakePlayer();

  Check(carry.Active === false && carry.Phase === "idle", "开局空手");
  Check(carry.Begin("stretcher", { label: "担架（伤员）" }) === true, "抬起担架");
  Check(carry.Begin("medBox") === false, "手上占着就抬不了第二件");
  Check(carry.Phase === "lift", "先进举起段");
  Check(carry.Carrying === false, "举起段还不算抬稳");

  // 举起段就已经走不快了：写晚一帧会出现「刚抬起来还能冲刺一步」。
  carry.Update(0.05, player);
  Check(player.carrySpeedScale === CARRY_KINDS.stretcher.speedScale,
    "举起的那一瞬间移速乘数就写进玩家了");

  Step(carry, CARRY_KINDS.stretcher.liftS + 0.1, player);
  Check(carry.Phase === "carry" && carry.Carrying, `举起 ${CARRY_KINDS.stretcher.liftS}s 之后抬稳`);
  Step(carry, 1.0, player);
  Check(carry.View().carriedS > 0.9, "抬着的秒数在累计（关卡脚本按它判 20—30 s）");
  Check(carry.Blocking === true, "抬着的时候一律不能开枪");

  // 担架摔不掉：左键在这一段什么也不做，不许退化成「放下」。
  Check(carry.Throw("fire") === false, "担架摔不掉");
  Check(carry.Carrying, "摔不掉之后人还抬着");

  Check(carry.Drop("player") === true, "按 F 开始放下");
  Check(carry.Phase === "release", "进放下收尾段");
  Check(carry.Drop("player") === false, "收尾段里再按一次不重复触发");
  Step(carry, CARRY_KINDS.stretcher.releaseS + 0.1, player);
  Check(carry.Active === false, "放下走完回到空手");
  Check(player.carrySpeedScale === 1, "空手之后移速乘数还原");
  Check(carry.lastRelease.how === "drop" && carry.lastRelease.forced === false,
    "主动放下不记 forced");
  Check(carry.stats.dropped === 1 && carry.stats.completed === 1, "放下计数");
  Check(played.length >= 2, "举起与放下各放了一条音效");
}

// 抬东西的时候不许冲刺、不许开镜 —— 这两条在 Script_Player 里读 carrySpeedScale。
// 这里断言的是**接口本身成立**：乘数一定 < 1，Player 那三处判据才有东西可读。
{
  const carry = new CarrySystem({ Time: () => 0 });
  const player = MakePlayer();
  carry.Begin("ammoCrate");
  carry.Update(0.05, player);
  Check(player.carrySpeedScale < 1, "负重时乘数严格小于 1（Player 据此封冲刺与开镜）");
}

// 「扔下快速恢复」：左键把箱子摔了，**立刻**空手，不走收尾段。
{
  const carry = new CarrySystem({ Time: () => 0 });
  const player = MakePlayer();
  carry.Begin("medBox");
  Step(carry, CARRY_KINDS.medBox.liftS + 0.1, player);
  Check(carry.Throw("fire") === true, "药箱摔得掉");
  Check(carry.Active === false, "摔完立刻空手，没有收尾段");
  Check(player.carrySpeedScale === 1, "摔完立刻恢复移速");
  Check(carry.stats.thrown === 1 && carry.lastRelease.how === "throw", "记一次扔下");
  // 摔完有一小段空窗，否则同一次左键会在下一帧又把它捡起来。
  Check(carry.Begin("medBox") === false, "摔完的空窗里捡不回来");
  Step(carry, 0.6, player);
  Check(carry.Begin("medBox") === true, "空窗过去就能再捡");
}

// 第四关抬罗班长：**拒绝松手**。按 F 只挨一句吼，人照抬。
{
  const said = [];
  const carry = new CarrySystem({ Say: (who, text) => said.push(text), Time: () => 0 });
  const player = MakePlayer();
  carry.Begin("stretcher", { label: "罗班长", canDrop: false, refuseLine: "哪个都不准松！" });
  Step(carry, CARRY_KINDS.stretcher.liftS + 0.1, player);
  Check(carry.Drop("player") === false, "拒绝松手的那一次放不下");
  Check(carry.Carrying, "按了 F 也还抬着");
  Check(said.includes("哪个都不准松！"), "只回一句吼，不是无声无息");
  Check(carry.stats.refused === 1, "记一次拒绝");
  Check(carry.View().canDrop === false && carry.View().prompt === "不许松手",
    "HUD 快照如实说明这一次放不下");
  // 但脚本仍然掰得开：ForceRelease 不看 canDrop。
  Check(carry.ForceRelease("scripted") === true, "脚本强行松手不受 canDrop 限制");
  Check(carry.Active === false && carry.lastRelease.forced === true, "记成 forced");
}

// 第一关扑入路沟：日机进入攻击航线 → 顺子本能松开担架。
{
  const carry = new CarrySystem({ Time: () => 0 });
  const player = MakePlayer();
  const released = [];
  carry.Begin("stretcher", { OnRelease: (info) => released.push(info) });
  Step(carry, CARRY_KINDS.stretcher.liftS + 0.5, player);
  Check(carry.ForceRelease("dive") === true, "强行松手成立");
  Check(carry.Active === false, "立刻空手（不走收尾段 —— 那是「本能」两个字的意思）");
  Check(carry.stats.forced === 1, "记一次强行松手");
  Check(released.length === 1 && released[0].reason === "dive" && released[0].forced === true,
    "OnRelease 收到 reason 与 forced");
  Check(released[0].carriedS > 0, "回调带着抬了多久（一关那 20—30 s 的取证）");
  Check(carry.ForceRelease("dive") === false, "空手时强行松手是 no-op");
}

// 人倒了东西自然落地；**不记 forced**，那会污染「顺子松手」那一关的取证。
{
  const carry = new CarrySystem({ Time: () => 0 });
  const player = MakePlayer();
  carry.Begin("doorPlank");
  Step(carry, 0.3, player);
  player.Alive = false;
  carry.Update(0.05, player);
  Check(carry.Active === false, "玩家倒下时手上的东西自动落地");
  Check(carry.stats.forced === 0, "阵亡落地不算强行松手");
  Check(carry.lastRelease.how === "death", "卸载路径记成 death");
  Check(player.carrySpeedScale === 1, "尸体不带负重乘数");
  Check(carry.Begin("doorPlank") === false, "死人不抬东西");
}

// 换关兜底：Reset 不放音、不记任何一条卸载统计，且立刻可以再抬。
{
  const played = [];
  const carry = new CarrySystem({ Play: (n) => played.push(n), Time: () => 0 });
  const player = MakePlayer();
  carry.Begin("ironPot");
  played.length = 0;
  carry.Reset("levelChange");
  Check(carry.Active === false && played.length === 0, "Reset 静默收摊");
  Check(carry.stats.dropped === 0 && carry.stats.thrown === 0 && carry.stats.forced === 0,
    "Reset 不进任何一条卸载统计");
  Check(carry.Begin("ironPot") === true, "Reset 之后没有空窗");
}

// 前端同伴站哪儿：沿玩家朝向往前 spanM。yaw=0 面朝 -Z。
{
  const carry = new CarrySystem({ Time: () => 0 });
  const player = MakePlayer({ x: 10, z: 20 });
  Check(carry.PartnerAnchor(player) === null, "空手时没有前端");
  carry.Begin("medBox");
  Check(carry.PartnerAnchor(player) === null, "单人重物没有前端");
  carry.Reset();
  carry.Begin("stretcher");
  const anchor = carry.PartnerAnchor(player);
  Check(Math.abs(anchor.x - 10) < 1e-6, "yaw=0 时前端不左右偏");
  Check(Math.abs(anchor.z - (20 - CARRY_KINDS.stretcher.spanM)) < 1e-6, "前端在玩家正前方（-Z）");
  player.yaw = Math.PI / 2;
  const turned = carry.PartnerAnchor(player);
  Check(Math.abs(turned.x - (10 - CARRY_KINDS.stretcher.spanM)) < 1e-6, "转 90° 之后前端跟着转");
}

// 未知负重档一律不成立（摆点写错 id 时要当场看得出来，不许静默抬起一个空壳）。
{
  const carry = new CarrySystem({ Time: () => 0 });
  Check(carry.Begin("nosuchthing") === false, "未登记的负重档抬不起来");
  Check(carry.Active === false, "也不会留下半个状态");
}

console.log(`ok  负重状态机：三条卸载路径 + 拒绝松手 + 强行松手 + 死亡/换关兜底`);

// ===========================================================================
// 三、可注册交互框架
// ===========================================================================

// 距离与朝向。默认判据在 INTERACT 里，断言不抄数字，现取。
{
  const system = new InteractSystem({});
  system.Register({ id: "p", position: { x: 0, y: 0, z: -1 }, label: "试试" });
  Check(system.Query(MakePlayer())?.point.id === "p", "正前方一米够得着");
  Check(system.Query(MakePlayer({ z: -INTERACT.pointReachM - 1.5 })) === null, "太远够不着");
  // 背对着它：夹角超过 facingDot 允许的范围就不提示。
  Check(system.Query(MakePlayer({ yaw: Math.PI })) === null, "背对着不提示");
  // 楼上楼下：高度窗口之外一律不算。
  Check(system.Query(MakePlayer({ y: INTERACT.pointHeightM + 2 })) === null, "高度差太大够不着");
  // 显式关掉朝向判据的点（地上一摊东西，低头不低头都该按得到）。
  system.Register({ id: "any", position: { x: 0, y: 0, z: -1 }, facingDot: null, priority: 99 });
  Check(system.Query(MakePlayer({ yaw: Math.PI }))?.point.id === "any", "facingDot=null 时不判朝向");
  Check(system.Query(MakePlayer({ Alive: false })) === null, "死人不交互");
}

// 挂在实体上的点：Anchor() 每次现算，实体一动交互点跟着动。
{
  const soldier = { position: { x: 0, y: 0, z: -1 } };
  const system = new InteractSystem({});
  system.Register({ id: "onSoldier", Anchor: () => soldier.position, label: "查看伤员" });
  Check(system.Query(MakePlayer())?.point.id === "onSoldier", "挂在实体上够得着");
  soldier.position.z = -40;
  Check(system.Query(MakePlayer()) === null, "实体走远了交互点跟着走远");
}

// 注册/注销/按 tag 批量清
{
  const system = new InteractSystem({});
  system.Register({ id: "a", position: { x: 0, y: 0, z: -1 }, tag: "CH3" });
  system.Register({ id: "b", position: { x: 0, y: 0, z: -1 }, tag: "CH3" });
  system.Register({ id: "c", position: { x: 0, y: 0, z: -1 }, tag: "CH4" });
  Check(system.PointCount === 3, "三个点都在");
  Check(system.Clear("CH3") === 2, "按 tag 清掉两个");
  Check(system.PointCount === 1 && system.Point("c"), "别的章的点不受影响");
  // 同 id 重复注册是覆盖而不是报错：换关重摆是常态。
  system.Register({ id: "c", position: { x: 0, y: 0, z: -1 }, label: "新的" });
  Check(system.PointCount === 1 && system.Query(MakePlayer()).label === "新的", "同 id 覆盖");
  Check(system.Unregister("c") === true && system.PointCount === 0, "注销");
  system.Register({ id: "d", position: { x: 0, y: 0, z: -1 } });
  Check(system.Clear() === 1, "不给 tag 就整表清空（换关走这一条）");
}

// 手势一：按一下。
{
  let done = 0;
  const system = new InteractSystem({});
  system.Register({
    id: "tap", position: { x: 0, y: 0, z: -1 }, gesture: "tap",
    label: "拾起传单", OnComplete: () => { done += 1; },
  });
  const player = MakePlayer();
  Check(system.Press(player)?.point.id === "tap", "按一下就命中");
  Check(done === 1, "当场完成");
  Check(system.View() === null, "点按型不留进度环");
  Check(system.PointCount === 0, "once 默认为真，做完自动摘掉");
  Check(system.Press(player) === null, "摘掉之后什么也不发生");
}

// 手势二：按住（带进度环）。松手退回去、但不清零；退干净才作废。
{
  let done = 0;
  const progress = [];
  const system = new InteractSystem({});
  system.Register({
    id: "hold", position: { x: 0, y: 0, z: -1 }, gesture: "hold", seconds: 1.0,
    kind: "bandage", label: "按住出血口",
    OnProgress: (t) => progress.push(t), OnComplete: () => { done += 1; },
  });
  const player = MakePlayer();
  system.Press(player);
  Check(system.View()?.t === 0 && system.View().holding === true, "按下之后进度环出现在 0");
  Check(system.View().kind === "bandage" && system.View().label === "按住出血口",
    "进度环带着 HUD 要的语义与文案");
  Step(system, 0.5, player);
  const half = system.View().t;
  Check(half > 0.4 && half < 0.6, `按住半秒走到一半（实得 ${half.toFixed(2)}）`);
  Check(done === 0, "还没走满就没完成");
  // 松手：进度往回退，但不是立刻清零 —— 手抖一下不该从头再来。
  system.Release();
  Check(system.View().holding === false, "松手之后进度环转成「退回中」");
  Step(system, 0.1, player);
  Check(system.View().t < half && system.View().t > 0, "退回中，还没作废");
  // 按回去接着走。
  system.Press(player);
  Step(system, 1.2, player);
  Check(done === 1, "接着按满就完成了");
  Check(system.View() === null, "完成之后收掉进度环");
  Check(progress.length > 3 && progress[progress.length - 1] >= 1, "OnProgress 一路报到 1");
}

// 松手之后一直不按：退干净就作废，并回一次 OnCancel。
{
  const cancels = [];
  const system = new InteractSystem({});
  system.Register({
    id: "hold", position: { x: 0, y: 0, z: -1 }, gesture: "hold", seconds: 1.0,
    OnCancel: (info) => cancels.push(info.reason),
  });
  const player = MakePlayer();
  system.Press(player);
  Step(system, 0.5, player);
  system.Release();
  Step(system, 3.0, player);
  Check(system.View() === null, "退干净就作废");
  Check(cancels.includes("decayed"), "作废时回了 OnCancel");
}

// 手势三：长按确认。中途松手**直接清零** —— 用在不可逆的决定上。
{
  let done = 0;
  const cancels = [];
  const system = new InteractSystem({});
  system.Register({
    id: "confirm", position: { x: 0, y: 0, z: -1 }, gesture: "confirm", seconds: 1.0,
    OnComplete: () => { done += 1; }, OnCancel: (info) => cancels.push(info.reason),
  });
  const player = MakePlayer();
  system.Press(player);
  Step(system, 0.8, player);
  Check(system.View().t > 0.7, "快按满了");
  system.Release();
  Check(system.View() === null, "长按确认松手立刻清零");
  Check(cancels.includes("released"), "清零时回了 OnCancel");
  system.Press(player);
  Step(system, 0.4, player);
  Check(system.View().t < 0.5, "重按是从 0 开始，不是接着刚才那截");
  Step(system, 0.8, player);
  Check(done === 1, "按满才算数");
}

// 走开就断：判据用**这一帧**的位置，不是在后台读条。
{
  const cancels = [];
  const system = new InteractSystem({});
  system.Register({
    id: "hold", position: { x: 0, y: 0, z: -1 }, gesture: "hold", seconds: 2.0,
    OnCancel: (info) => cancels.push(info.reason),
  });
  const player = MakePlayer();
  system.Press(player);
  Step(system, 0.5, player);
  player.position.z = -40;                       // 玩家走开
  system.Update(0.05, player);
  Check(system.View() === null && cancels.includes("outOfReach"), "走开一步进度就断");
}
// 倒下也断。
{
  const system = new InteractSystem({});
  system.Register({ id: "hold", position: { x: 0, y: 0, z: -1 }, gesture: "hold", seconds: 2.0 });
  const player = MakePlayer();
  system.Press(player);
  Step(system, 0.4, player);
  player.Alive = false;
  system.Update(0.05, player);
  Check(system.View() === null, "玩家倒下时按住的进度作废");
}

// Enabled：条件不成立的点**整条不出现**，不出灰提示。
{
  let ready = false;
  const system = new InteractSystem({});
  system.Register({
    id: "gated", position: { x: 0, y: 0, z: -1 }, Enabled: () => ready, label: "递纱布",
  });
  Check(system.Query(MakePlayer()) === null, "条件不成立时够得着也不提示");
  ready = true;
  Check(system.Query(MakePlayer())?.label === "递纱布", "条件成立后才出现");
}

// 可重复 + 冷却（搬第二箱、第三箱弹药）。
{
  let done = 0;
  const system = new InteractSystem({});
  system.Register({
    id: "crate", position: { x: 0, y: 0, z: -1 }, once: false, cooldownS: 0.5,
    OnComplete: () => { done += 1; },
  });
  const player = MakePlayer();
  system.Press(player);
  Check(done === 1 && system.PointCount === 1, "可重复的点做完不摘掉");
  Check(system.Query(player) === null, "冷却里不提示");
  Step(system, 0.6, player);
  system.Press(player);
  Check(done === 2, "冷却过去可以再做一次");
}

// OnComplete 返回 false = 这一下不算数（背包里其实没有那件东西）。
{
  let attempts = 0;
  const system = new InteractSystem({});
  system.Register({
    id: "veto", position: { x: 0, y: 0, z: -1 },
    OnComplete: () => { attempts += 1; return false; },
  });
  const player = MakePlayer();
  system.Press(player);
  Check(attempts === 1 && system.PointCount === 1, "回调否掉之后点还在");
  Check(system.completions === 0, "也不计一次完成");
}

// 优先级：注册点默认压过内建的拾枪。**同一个 F，提示的必须是真的会发生的那件事。**
{
  const corpse = {
    alive: false, position: { x: 0, y: 0, z: -1 },
    drop: { weaponId: "Type38", clips: 0, taken: false },
  };
  const system = new InteractSystem({ ai: { soldiers: [corpse] } }, { HasWeapon: () => false });
  const player = MakePlayer();
  Check(system.Query(player).kind === "pickup", "只有尸体时提示拾枪");
  system.Register({ id: "wound", position: { x: 0, y: 0, z: -1.1 }, kind: "bandage", label: "按住出血口" });
  Check(system.Query(player).kind === "bandage", "救护点压过同一处的拾枪");
  Check(INTERACT.pointPriority > 0, "注册点的默认优先级高于内建分支");
}

console.log(`ok  交互框架：注册/清理、三种手势、距离朝向、优先级、走开就断`);

// ===========================================================================
// 四、内建两条分支不许回归（迁进新框架之前它们就是这么工作的）
// ===========================================================================
{
  const hints = [];
  const taken = [];
  const corpse = {
    alive: false, position: { x: 0, y: 0, z: -1 },
    drop: { weaponId: "Type38", clips: 2, taken: false },
  };
  const system = new InteractSystem(
    { ai: { soldiers: [corpse] }, hud: { Hint: (t) => hints.push(t) } },
    { HasWeapon: () => false, TakeWeapon: (id, clips) => { taken.push([id, clips]); return true; } },
  );
  const player = MakePlayer();
  Check(/^拾起 /.test(system.Query(player).label), "空手时是「拾起」");
  system.hooks.HasWeapon = () => true;
  Check(/^换上 /.test(system.Query(player).label), "有同类槽位时是「换上」");
  Check(system.Press(player).kind === "pickup", "按 F 捡起来");
  Check(taken.length === 1 && taken[0][1] === 2, "桥夹数如实传给装配层");
  Check(corpse.drop.taken === true && system.pickups === 1, "同一具尸体不许捡两次");
  Check(hints.some((t) => /桥夹/.test(t)), "缴获提示还在");
}
{
  const said = [];
  const mate = {
    alive: true, side: "nra", ammo: 0, weapon: { magazine: 5 },
    identity: { name: "邱茂才" }, position: { x: 0, y: 0, z: -2.2 },
  };
  const system = new InteractSystem(
    { ai: { soldiers: [mate] }, hud: { Say: (who, text) => said.push(text) } },
    { SpareClips: () => 4, GiveClip: () => true },
  );
  const player = MakePlayer();
  Check(/分一个桥夹给 邱茂才/.test(system.Query(player).label), "分弹药分支还在");
  Check(system.Press(player).kind === "ammo", "分得出去");
  Check(mate.ammo === 5 && system.handouts === 1, "弟兄的弹装回去了");
  Check(said.includes("接着！"), "他会应一声");
  system.hooks.SpareClips = () => 1;
  mate.ammo = 0;
  Check(system.Query(player) === null, "自己只剩一个桥夹就不给了");
}
console.log("ok  拾枪/分弹药两条内建分支迁进框架后无回归");

// ===========================================================================
// 五、救护类预制交互
// ===========================================================================

// 按住伤口止血
{
  let stopped = 0;
  const system = new InteractSystem({});
  system.Register(BleedControlInteraction({
    id: "bleed", position: { x: 0, y: 0, z: -1 }, seconds: 1.0, OnComplete: () => { stopped += 1; },
  }));
  const player = MakePlayer();
  Check(system.Query(player).gesture === "hold", "止血是按住型");
  Check(system.Query(player).kind === "bandage", "用绷带图标");
  system.Press(player);
  Step(system, 1.2, player);
  Check(stopped === 1, "按满就止住了");
}

// 递纱布 / 交药品：手上没有就整条不出现
{
  let has = false;
  let given = 0;
  const system = new InteractSystem({});
  system.Register(GiveSupplyInteraction({
    id: "gauze", position: { x: 0, y: 0, z: -1 }, item: "纱布",
    Has: () => has, OnComplete: () => { given += 1; },
  }));
  const player = MakePlayer();
  Check(system.Query(player) === null, "手上没有纱布就不提示");
  has = true;
  Check(system.Query(player).label === "递纱布", "有了才提示");
  system.Press(player);
  Check(given === 1, "递出去了");
}

// 检查伤员：引擎只报「玩家真的蹲下来看了一眼」，有没有脉是剧本的事
{
  const looked = [];
  const system = new InteractSystem({});
  system.Register(CheckWoundedInteraction({
    id: "check", position: { x: 0, y: 0, z: -1 }, seconds: 0.6,
    payload: { who: "luo" }, OnComplete: (ctx) => looked.push(ctx.payload.who),
  }));
  const player = MakePlayer();
  system.Press(player);
  Step(system, 0.8, player);
  Check(looked[0] === "luo", "回调拿得到 payload（谁被检查了）");
}

// 拆门板做担架：先摘门板再放担架，顺序不许反
{
  const order = [];
  let planks = 1;
  const system = new InteractSystem({});
  system.Register(DoorPlankInteraction({
    id: "plank", position: { x: 0, y: 0, z: -1 }, seconds: 0.5,
    RemovePlank: () => { order.push("remove"); planks -= 1; return true; },
    SpawnStretcher: () => { order.push("spawn"); return { id: "stretcher_1" }; },
    OnComplete: (ctx) => order.push(`done:${ctx.stretcher.id}`),
  }));
  const player = MakePlayer();
  Check(system.Query(player).kind === "plank", "拆门板用门板图标");
  system.Press(player);
  Step(system, 0.7, player);
  assert.deepEqual(order, ["remove", "spawn", "done:stretcher_1"], "门板先没、担架后有");
  checks += 1;
  Check(planks === 0 && system.PointCount === 0, "门板拆完这个点就没了");
}
// 摘不掉门板（被压在瓦砾底下）时整件事不算数，也不会凭空多一副担架
{
  let spawned = 0;
  const system = new InteractSystem({});
  system.Register(DoorPlankInteraction({
    id: "plank", position: { x: 0, y: 0, z: -1 }, seconds: 0.3,
    RemovePlank: () => false, SpawnStretcher: () => { spawned += 1; },
  }));
  const player = MakePlayer();
  system.Press(player);
  Step(system, 0.5, player);
  Check(spawned === 0 && system.PointCount === 1, "摘不掉门板就不生成担架，点也留着");
}

// 接电话线：两点连线判定
{
  let joined = 0;
  const system = new InteractSystem({});
  for (const spec of WireInteractions({
    id: "phone", seconds: 0.4, tag: "CH3",
    a: { position: { x: 0, y: 0, z: -1 } },
    b: { position: { x: 30, y: 0, z: -1 } },
    OnJoin: () => { joined += 1; },
  })) system.Register(spec);
  Check(system.PointCount === 2, "一对断点");
  const player = MakePlayer();
  system.Press(player);
  Step(system, 0.6, player);
  Check(joined === 0, "只接上一头还不通");
  const far = MakePlayer({ x: 30 });
  system.Press(far);
  Step(system, 0.6, far);
  Check(joined === 1, "两头都接上才通");
  Check(system.Clear("CH3") === 0, "两头都做完之后表里干净");
}
// 先接哪一头都行
{
  let joined = 0;
  const system = new InteractSystem({});
  for (const spec of WireInteractions({
    id: "phone", seconds: 0.3,
    a: { position: { x: 0, y: 0, z: -1 } },
    b: { position: { x: 30, y: 0, z: -1 } },
    OnJoin: () => { joined += 1; },
  })) system.Register(spec);
  const far = MakePlayer({ x: 30 });
  system.Press(far); Step(system, 0.5, far);
  const near = MakePlayer();
  system.Press(near); Step(system, 0.5, near);
  Check(joined === 1, "反过来接也通");
}

// 剪断收不回来的线路：不可逆 → 长按确认
{
  let cut = 0;
  const system = new InteractSystem({});
  system.Register(CutWireInteraction({
    id: "cut", position: { x: 0, y: 0, z: -1 }, seconds: 0.6, OnComplete: () => { cut += 1; },
  }));
  const player = MakePlayer();
  Check(system.Query(player).gesture === "confirm", "剪线是长按确认");
  system.Press(player);
  Step(system, 0.3, player);
  system.Release();
  Check(cut === 0 && system.View() === null, "中途松手不算数且清零");
  system.Press(player);
  Step(system, 0.8, player);
  Check(cut === 1, "按满才剪");
}

// 拾传单 → 投入炉火（火焰封住一条追击路线）
{
  let leaflets = 0;
  let ignited = 0;
  const system = new InteractSystem({});
  system.Register(LeafletPickupInteraction({
    id: "leaf", position: { x: 0, y: 0, z: -1 }, OnComplete: () => { leaflets += 1; },
  }));
  system.Register(LeafletBurnInteraction({
    id: "stove", position: { x: 0, y: 0, z: -1.4 },
    HasLeaflet: () => leaflets > 0, IgniteSource: () => { ignited += 1; },
  }));
  const player = MakePlayer();
  // 手上没有传单时炉子那条整条不出现 —— 够得着的只有传单。
  Check(system.Query(player).kind === "leaflet", "先只提示拾传单");
  system.Press(player);
  Check(leaflets === 1, "捡到了");
  Check(system.Query(player).kind === "fire", "有传单之后炉子才提示");
  system.Press(player);
  Check(ignited === 1, "投进去点着了");
}

// 撕短褂：全作最重的一次玩家操作 —— 必须长按确认，且道具真的从背包里扣掉
{
  let shirt = 1;
  let torn = 0;
  const system = new InteractSystem({});
  system.Register(TearShirtInteraction({
    position: { x: 0, y: 0, z: -1 }, seconds: 0.8,
    ConsumeShirt: () => { if (shirt <= 0) return false; shirt -= 1; return true; },
    OnComplete: () => { torn += 1; },
  }));
  const player = MakePlayer();
  const candidate = system.Query(player);
  Check(candidate.gesture === "confirm", "撕短褂是长按确认");
  Check(candidate.kind === "tear" && /短褂/.test(candidate.label), "提示语说的是那件短褂");
  system.Press(player);
  Step(system, 0.5, player);
  system.Release();
  Check(torn === 0 && shirt === 1, "中途松手：短褂还在");
  system.Press(player);
  Step(system, 1.0, player);
  Check(torn === 1 && shirt === 0, "按满才撕，短褂从背包里没了");
  Check(system.PointCount === 0, "撕完这个点就没了");
}
// 背包里其实没有短褂时不算数（Consume 返回 false）
{
  let torn = 0;
  const system = new InteractSystem({});
  system.Register(TearShirtInteraction({
    position: { x: 0, y: 0, z: -1 }, seconds: 0.3,
    ConsumeShirt: () => false, OnComplete: () => { torn += 1; },
  }));
  const player = MakePlayer();
  system.Press(player);
  Step(system, 0.5, player);
  Check(torn === 0 && system.PointCount === 1, "扣不掉道具就不算数");
}

// 交互层与负重层的接缝：站到担架旁边按 F 就抬起来
{
  const carry = new CarrySystem({ Time: () => 0 });
  const system = new InteractSystem({});
  system.Register(PickUpLoadInteraction({
    id: "rear", position: { x: 0, y: 0, z: -1 }, kindId: "stretcher", label: "接住担架后端",
    carry, options: { label: "担架（伤员）", partner: { id: "yaowa" } },
  }));
  const player = MakePlayer();
  Check(system.Query(player).label === "接住担架后端", "提示语是摆点时写的那句");
  system.Press(player);
  Check(carry.Active && carry.KindId === "stretcher", "按 F 抬起了担架");
  Check(carry.View().label === "担架（伤员）", "覆盖显示名生效");
  Check(carry.View().partner.id === "yaowa", "前端同伴挂在负重上");
  // 手上已经占着的时候，同类交互点整条不出现（不给一个按了没反应的提示）。
  system.Register(PickUpLoadInteraction({
    id: "rear2", position: { x: 0, y: 0, z: -1.2 }, kindId: "medBox", carry,
  }));
  Check(system.Query(player) === null, "抬着东西时抬第二件的点不出现");
}

console.log("ok  八个救护预制 + 抬起负重的接缝");

// ===========================================================================
// 六、键位契约
//
// 「负重时提示条被接管」那一组断言在 Script_HudPromptTest —— 见文件顶部那条注释。
// ===========================================================================

// F 必须是 holdAction —— 改回 press 的话按住型手势的松手边沿就没了。
{
  const f = KEYMAP.filter((entry) => entry.code === "KeyF");
  Check(f.length === 1 && f[0].action === "interact", "F 只有一条键位");
  Check(f[0].mode === "holdAction", "F 是 holdAction（按住型交互要松手边沿）");
  const guide = CONTROL_GUIDE.flatMap((g) => g.rows).map((r) => `${r.keys} ${r.label}`).join("\n");
  Check(/按住 F/.test(guide), "操作说明里写了按住 F 这一档");
}

console.log(`ok  F 键位契约（holdAction + 操作说明）`);
console.log(`ok  担架/搬运/救护交互 ${checks} 条通过`);
