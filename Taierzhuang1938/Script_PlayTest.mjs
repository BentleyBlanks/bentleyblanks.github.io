// 《滕县 一九三八》通关冒烟：真浏览器里**真的去玩**，断言玩法与剧本没被改坏。
//
// 为什么必须有这一层：开机冒烟（Script_BootTest.mjs）只证明"画得出来"。
// 而这个项目最容易坏、坏了最看不出来的恰恰是玩法与剧本：
//   · Data_Script.mjs 那 20 KB 台词曾经整本没被 import，而画面一切正常；
//   · 叙事链只要有一条卡住（等一个永远不会来的事件），后面整本剧本被静默吞掉；
//   · 弹药账、投弹、白刃这些动词，数据里定义好了但一行没接，读代码看不出来。
// 所以这里的断言一律**从运行时状态取证**，不许读源码推断。
//
// 用法：node Taierzhuang1938/Script_PlayTest.mjs
// 退出码即成败。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR ${String(e).slice(0, 240)}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const url = m.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  errors.push(`CONSOLE ${m.text().slice(0, 240)}`);
});

const results = [];
// 这一趟要跑十几分钟（六个阶段按出厂时长推 + 两次三百秒长跑）。
// 不打段落戳的话，卡住时只能看见"最后一条 ok 之后什么都没有"，定位不了。
const startedAt = Date.now();
function Stage(label) {
  console.log(`--- ${label}  (+${((Date.now() - startedAt) / 1000).toFixed(0)} s)`);
}
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

// **默认开机进第一章，不是序章。** 序章（CH0）是过场承载章：不撒兵、不发枪，
// 在那儿量「开枪消耗弹药」「阵亡换人」「AI 数量稳定」测到的都是空场。
async function Boot(phase = 1, scale = "small") {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=${phase}&quality=medium&scale=${scale}`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 180000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(30));
}

// ===========================================================================
// 1) 调试口齐不齐（后面所有断言都靠它）
// ===========================================================================
Stage("1 调试口");
await Boot(1);
const api = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const d = T.Debug || {};
  return {
    hasStory: !!T.story, hasCombat: !!T.combat, hasDebug: !!T.Debug,
    fns: ["Reload", "DoMelee", "Throw", "Fire", "Ammo", "Spoken", "StoryFired", "Outcome"]
      .filter((k) => typeof d[k] === "function"),
  };
});
Check("调试口齐全", api.hasStory && api.hasCombat && api.fns.length === 8,
  `story=${api.hasStory} combat=${api.hasCombat} fns=${api.fns.length}/8`);

// 滕县攻城的日军是合成火力，不是整队随机步枪兵；但战车、装甲车与反坦克集束弹
// 都不属于这一阶段。这个断言直接从已经建好的第一关取证，防止以后又把配置写回去。
const tengxianForce = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const soldiers = T.ai.soldiers || [];
  return {
    whitebox: T.Debug.Whitebox(),
    hmg: soldiers.filter((s) => s.side === "ija" && s.weaponId === "Type92Hmg").length,
    lmg: soldiers.filter((s) => s.side === "ija" && s.weaponId === "Type11").length,
    armor: soldiers.filter((s) => s.side === "ija" && /Tank|Tankette/.test(s.weaponId || "")).length,
    bundles: T.state?.bundles ?? -1,
    grenades: T.state?.grenades ?? -1,
  };
});
Check("正式第一关不挂测试白盒配置",
  tengxianForce.whitebox.phase === "CH1_NanLu"
    && tengxianForce.whitebox.contentId === "CH1_NanLu" && tengxianForce.whitebox.field === null,
  `phase=${tengxianForce.whitebox.phase} field=${tengxianForce.whitebox.field}`);
Check("滕县日军有固定重机枪组与分队轻机枪", tengxianForce.hmg >= 1 && tengxianForce.lmg >= 1,
  `重机=${tengxianForce.hmg} 轻机=${tengxianForce.lmg}`);
Check("滕县不误配战车或集束反坦克弹", tengxianForce.armor === 0
  && tengxianForce.bundles === 0 && tengxianForce.grenades === 6,
  `装甲=${tengxianForce.armor} 集束=${tengxianForce.bundles} 木柄弹=${tengxianForce.grenades}`);

// 默认入口回归：主页面不带 phase/preview 时，开机落在序章（CH0），
// 点「进 城」必须播新版车厢序章 CS_Chuchuan —— 重制之后它就是正片的关前过场，
// 不再只是一个预览页。旧版 CS_ChuchuanLegacy 从正片脱钩，只留在选章的测试场景组。
await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?quality=low&scale=small&menu=0`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang !== undefined
  && window.Taierzhuang.state.ready, null, { timeout: 240000 });
await page.click("#bootStart");
await page.waitForTimeout(250);
const defaultIntro = await page.evaluate(() => ({
  current: window.Taierzhuang.Debug.Cutscene().current,
  playing: window.Taierzhuang.Debug.Cutscene().playing,
  phase: window.Taierzhuang.Debug.Level().id,
}));
Check("默认开始游戏/序章播新版车厢出川", defaultIntro.current === "CS_Chuchuan"
  && defaultIntro.playing && defaultIntro.phase === "CH0_Chuchuan", JSON.stringify(defaultIntro));
await page.evaluate(() => {
  const T = window.Taierzhuang;
  T.Debug.SkipCutscene();
  T.StepFrames(500, 1 / 60, false);
});

// ===========================================================================
// 2) 真键盘走完整路径 —— 这一节是补票
//
// 事故：A/D 反了（按 D 往左横移），而且压制会偷偷把玩家按成蹲姿、速度砍一半。
// 两个都是用户第一时间就感觉到的问题，而通关冒烟一路是绿的 ——
// 因为下面第 3 节那种测法是**直接推 player.Update 喂合成的 input 对象**，
// 把「键盘事件 -> InputRouter -> input」整段完全绕开了。
// 键位一重构（Script_Input.mjs），那一段就成了没有任何测试保护的裸奔区。
//
// 所以这一节必须走真键盘：正常模式进页面 -> 点「进城」拿指针锁 -> page.keyboard.down。
// ===========================================================================
{
  // menu=0：跳过主菜单，进页面就是这一关（菜单会盖住 #bootStart，而这一节要点它）
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?phase=1&quality=low&scale=small&menu=0`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
  await page.click("#bootStart");
  await page.waitForTimeout(400);

  // 找一块 9 m 内没有齐胸障碍的空地，免得把撞墙当成移动 bug
  const spot = await page.evaluate(() => {
    const T = window.Taierzhuang;
    // 首关现在是“宽视野、窄走廊”。优先拿涵洞前的大车路中心做四向移动靶场：
    // 旧版向出生点四周盲搜会挑到空气墙边沿，随后把“被边界裁回”误报成 W/A/D 失灵。
    const culvert = T.battlefield.objectives.find((o) => o.id === "C1_Culvert");
    if (culvert) {
      const blockers = T.battlefield.NearbyColliders(culvert.x, culvert.z, 9)
        .filter((b) => b.max[1] - T.battlefield.GroundHeight(culvert.x, culvert.z) >= 0.6);
      if (!blockers.length) return { x: culvert.x, z: culvert.z };
    }
    for (let r = 6; r < 90; r += 3) {
      for (let a = 0; a < 12; a += 1) {
        const th = (a / 12) * Math.PI * 2;
        const x = T.player.position.x + Math.cos(th) * r;
        const z = T.player.position.z + Math.sin(th) * r;
        let blocked = false;
        for (const b of T.battlefield.NearbyColliders(x, z, 9)) {
          if (b.max[1] - T.battlefield.GroundHeight(x, z) < 0.6) continue;
          blocked = true; break;
        }
        if (!blocked) return { x, z };
      }
    }
    return null;
  });

  const Walk = async (code, seconds = 1.6) => {
    await page.evaluate((sp) => {
      const T = window.Taierzhuang;
      T.player.position.set(sp.x, T.battlefield.GroundHeight(sp.x, sp.z), sp.z);
      T.player.velocity.set(0, 0, 0);
      T.player.yaw = 0;                 // 固定朝向 -Z，方向符号才有意义
      T.player.stance = "stand";
      T.player.suppression = 0;
      T.player.health = 100;
    }, spot);
    await page.waitForTimeout(120);
    const p0 = await page.evaluate(() => [window.Taierzhuang.player.position.x,
      window.Taierzhuang.player.position.z]);
    await page.keyboard.down(code);
    await page.waitForTimeout(seconds * 1000);
    const snap = await page.evaluate(() => {
      const T = window.Taierzhuang;
      return { x: T.player.position.x, z: T.player.position.z,
        v: Math.hypot(T.player.velocity.x, T.player.velocity.z) };
    });
    await page.keyboard.up(code);
    await page.waitForTimeout(200);
    return { dx: snap.x - p0[0], dz: snap.z - p0[1], v: snap.v };
  };

  const w = await Walk("KeyW");
  const sBack = await Walk("KeyS");
  const a = await Walk("KeyA");
  const d = await Walk("KeyD");

  Check("键盘 W 往前（-Z）", w.dz < -1.5 && Math.abs(w.dx) < 0.6,
    `dx=${w.dx.toFixed(2)} dz=${w.dz.toFixed(2)} v=${w.v.toFixed(2)}`);
  Check("键盘 S 往后（+Z）且比前进慢", sBack.dz > 1.0 && sBack.v < w.v * 0.9,
    `dz=${sBack.dz.toFixed(2)} v=${sBack.v.toFixed(2)} vs 前进 ${w.v.toFixed(2)}`);
  // 这两条就是那次事故的正主：A/D 的符号
  Check("键盘 A 往左（-X）", a.dx < -1.5 && Math.abs(a.dz) < 0.6,
    `dx=${a.dx.toFixed(2)} dz=${a.dz.toFixed(2)}`);
  Check("键盘 D 往右（+X）", d.dx > 1.5 && Math.abs(d.dz) < 0.6,
    `dx=${d.dx.toFixed(2)} dz=${d.dz.toFixed(2)}`);
  Check("横移不比前进慢一大截", a.v > w.v * 0.85 && d.v > w.v * 0.85,
    `左 ${a.v.toFixed(2)} 右 ${d.v.toFixed(2)} 前 ${w.v.toFixed(2)}`);

  // 压制不许替玩家改姿态：站着挨打只该慢一点，不该自己蹲下
  const supp = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    T.player.stance = "stand";
    T.player.suppression = 1.0;
    T.StepFrames(30);
    return { stance: T.player.stance, upright: !!T.player.suppressedUpright };
  });
  Check("压制不替玩家改姿态", supp.stance === "stand",
    `压满之后 stance=${supp.stance}，提示位 ${supp.upright}`);

  // 姿态键与探头走的也是真键盘
  const stance = await page.evaluate(() => window.Taierzhuang.player.stance);
  await page.keyboard.press("KeyC");
  await page.waitForTimeout(350);
  const crouched = await page.evaluate(() => window.Taierzhuang.player.stance);
  await page.keyboard.press("KeyZ");
  await page.waitForTimeout(350);
  const proned = await page.evaluate(() => window.Taierzhuang.player.stance);
  Check("键盘 C 蹲 / Z 卧", crouched === "crouch" && proned === "prone",
    `${stance} -> ${crouched} -> ${proned}`);

  await page.keyboard.down("KeyE");
  await page.waitForTimeout(320);
  const leaned = await page.evaluate(() => window.Taierzhuang.player.lean);
  await page.keyboard.up("KeyE");
  Check("键盘 E 探头", leaned > 0.15, `lean=${leaned.toFixed(3)}`);
}

// ===========================================================================
// 3) 能走（直接推控制器，与上一节互为对照）
// ===========================================================================
Stage("2 走动");
const moved = await page.evaluate(() => {
  const T = window.Taierzhuang;
  // 上一节按过 C/Z，人还趴着；不复位的话这里量到的是卧姿速度 0.72 m/s，
  // 会被误读成"移动坏了"。测试之间必须自己把状态收干净。
  T.player.stance = "stand";
  T.player.suppression = 0;
  T.player.health = 100;
  T.StepFrames(20);
  const p0 = T.player.position.clone();
  // 直接推玩家控制器，不去合成键盘事件：出图模式下没有指针锁，
  // 键盘路径本来就走不通，而我们要测的是移动本身。
  for (let i = 0; i < 90; i += 1) {
    T.player.Update(1 / 60, {
      forward: 1, strafe: 0, sprint: false, ads: false, lean: 0,
      lookX: 0, lookY: 0, crouchPressed: false, pronePressed: false,
      breathHold: false, sensitivity: 1,
    }, null);
  }
  return { dist: T.player.position.distanceTo(p0) };
});
Check("玩家能走动", moved.dist > 1.5, `1.5 秒走了 ${moved.dist.toFixed(2)} m`);

// ===========================================================================
// 3) 开枪吃弹药 / 能装填 / 空仓打不出去
// ===========================================================================
// **这两节要换到有长枪的一关。** 第一关（界河）的携行是没有步枪的 ——
// 日方记川军三分之一以上没有步枪、各自带手榴弹约六发，所以 L0 的 primary 就是 null。
// 在那一关测「开枪消耗弹药」，测到的是「空着手当然打不出子弹」，不是回归保护。
await Boot(2, "small");
Stage("3 弹药");
const gun = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  // 第 2 批之后开局就是热的（导航网格一接上，两军三十秒内就绞在一起），
  // 玩家在这一段里被打死是常态，而 Reload / Throw / DoMelee 对死人一律 return false ——
  // 量到的"装不上弹"是测试自己没站稳，不是装填坏了。所以第 3—5 段先冻场：
  // 把日军挪到三百米外，再等到人真的活过来（只写 health = 100 是复活不了的）。
  for (const s2 of T.ai.soldiers) {
    if (s2.side === "ija") s2.position.set(s2.position.x + 300, s2.position.y, s2.position.z + 300);
  }
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  const before = D.Ammo();
  for (let i = 0; i < 8; i += 1) { D.Fire(); T.StepFrames(6); }
  const afterFire = D.Ammo();
  // 打空之后再开火不许再掉（不许出现负数弹药）
  for (let i = 0; i < 10; i += 1) { D.Fire(); T.StepFrames(4); }
  const emptied = D.Ammo();
  // 等抢壳/拉栓动作播完再压弹：viewmodel.IsBusy() 期间 Reload 会被挡下来。
  // 这是对的行为（手都离开握把了还能压桥夹才是穿帮），测试得自己等。
  T.StepFrames(150);
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  // 重生会把弹仓填满、桥夹补齐 —— 那样 Reload 会因为"弹仓已满"直接 return false，
  // 量到的就不是装填了。所以读数一律紧贴 Reload 那一刻取。
  T.state.ammo = 0;
  const clipsBefore = T.state.clips;
  const reloaded = D.Reload();
  T.StepFrames(30);
  const afterReload = D.Ammo();
  return { before, afterFire, emptied, reloaded, afterReload, clipsBefore };
});
Check("开枪消耗弹药", gun.afterFire.ammo < gun.before.ammo,
  `${gun.before.ammo} -> ${gun.afterFire.ammo}`);
Check("弹药不会变负", gun.emptied.ammo >= 0, `空仓后 ammo=${gun.emptied.ammo}`);
Check("能装填", gun.reloaded && gun.afterReload.ammo > 0
  && gun.afterReload.clips === gun.clipsBefore - 1,
  `ammo 0->${gun.afterReload.ammo}, 桥夹 ${gun.clipsBefore}->${gun.afterReload.clips}`);

// ===========================================================================
// 4) 投弹：真的飞出去、真的炸、真的减库存
// ===========================================================================
Stage("4 投弹");
const nade = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  // 同上：ReleaseCook 对死人直接吞掉，先把人等活过来
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  const before = D.Ammo().grenades;
  D.Throw("Grenade", 0.9);
  const inFlight = T.combat.projectiles.length;
  const after = D.Ammo().grenades;
  // 引信 4.2 s，推 6 秒确保炸掉
  T.StepFrames(380);
  return { before, after, inFlight, left: T.combat.projectiles.length };
});
Check("投弹飞出去", nade.inFlight >= 1, `在飞 ${nade.inFlight} 枚`);
Check("投弹减库存", nade.after === nade.before - 1, `${nade.before} -> ${nade.after}`);
Check("手榴弹会炸（引信到了就消失）", nade.left === 0, `残留 ${nade.left} 枚`);

// ===========================================================================
// 5) 白刃：够得着就砍得到
// ===========================================================================
Stage("5 白刃");
const melee = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  // 把一个日军挪到玩家正前方 1.2 m
  // 等上一段测试的装填动画播完 —— IsBusy() 期间 DoMelee 会被挡下来（这是对的行为）
  T.StepFrames(180);
  // 第 1 批之后战场是真在打的，玩家会在前面几段里被打死。
  // DoMelee 对死人直接 return false，那样量到的"砍不到人"是测试自己没站稳，
  // 不是白刃坏了。先把人等活过来。
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  const enemy = T.ai.soldiers.find((s) => s.alive && s.side === "ija");
  if (!enemy) return { noEnemy: true };
  const busy = T.viewmodel.IsBusy();
  const fwd = { x: -Math.sin(T.player.yaw), z: -Math.cos(T.player.yaw) };
  enemy.position.set(T.player.position.x + fwd.x * 1.2, T.player.position.y,
    T.player.position.z + fwd.z * 1.2);
  const hpBefore = enemy.health;
  D.DoMelee();
  return { hpBefore, hpAfter: enemy.health, alive: enemy.alive, busy, playerAlive: T.player.Alive };
});
Check("白刃能砍到人", !melee.noEnemy && melee.hpAfter < melee.hpBefore,
  melee.noEnemy ? "场上没有日军"
    : `${melee.hpBefore} -> ${melee.hpAfter}（挥刀时 busy=${melee.busy} 玩家活=${melee.playerAlive}）`);

// ===========================================================================
// 6) 目标链：走到路标就推进，走完这一关就换关
//
// 台儿庄那两条（占领进度会涨 / 能把点夺回来）随占领点一起作废：
// 线性关卡里路标不会被反夺，"走到就算到"。要验的换成三条 ——
// 走进圈里会推进、圈里还有敌人时不推进（不然会在挨打时莫名其妙过关）、
// 目标链走完能真的进下一关。
// ===========================================================================
Stage("6 目标链");
// 必须重开一次：前面几节把玩家瞬移得满地图都是，目标链早被推过几格了
await Boot(1);
const chain = await page.evaluate(async () => {
  const T = window.Taierzhuang, D = T.Debug;
  const before = D.Level();
  const target = T.battlefield.objectives[before.objectiveIndex];
  // 先把**全部**日军挪到四百米外 —— 这一节验的是目标链本身，
  // 不是能不能在交火中央站住。留一个在圈里当对照。
  for (const s2 of T.ai.soldiers) {
    if (s2.side === "ija") s2.position.set(s2.position.x + 400, s2.position.y, s2.position.z + 400);
  }
  const enemy = T.ai.soldiers.find((s2) => s2.alive && s2.side === "ija");
  if (enemy) enemy.position.set(target.x + 2, T.battlefield.GroundHeight(target.x + 2, target.z), target.z);
  // 隔离**两侧**，不只是日方。
  //
  // 事故（城外内容那一轮抓到的）：留在圈里当对照的那个日军，站在玩家两米外、
  // 站在自己班中间 —— 一秒之内被中方两枪打死（实测 78 + 74 伤害，torso），
  // 圈里于是没有敌人了，目标链照常推进。断言挂掉，但挂掉的原因是**友军枪法**，
  // 不是「圈里有敌人时不推进」这条规则坏了。
  //
  // 为什么以前没挂：撒兵位置来自 FindOpenSpot + HasLineOfSight，
  // 而这两个查询的结果一变，外层 rnd 的调用次数就变，整场撒兵重排。
  // 也就是说**任何关卡内容改动都能把这条断言掷成另一面** —— 它测的是运气。
  // 把对照的那个人钉成打不死的，断言就只剩它本来要验的那一条。
  if (enemy) enemy.health = 1e9;
  T.player.Spawn(target.x, target.z, 0);
  // 补兵会把人又撒回来，这一节里先关掉（它是每 3 秒一次的定时器）
  T.state.spawnAccumulator = -1e6;
  T.StepFrames(60, 1 / 60, false);
  const blocked = D.Level().objectiveIndex;
  // 把他挪走，这时候该推进
  if (enemy) enemy.position.set(target.x + 400, enemy.position.y, target.z + 400);
  T.player.Spawn(target.x, target.z, 0);
  T.StepFrames(60, 1 / 60, false);
  const advanced = D.Level().objectiveIndex;
  return { start: before.objectiveIndex, count: before.objectiveCount, blocked, advanced,
    id: before.id, zones: before.zones.map((z) => z.id) };
});
Check("敌人还贴在路标里时不推进目标链", chain.blocked === chain.start,
  `${chain.id} 路标 ${chain.zones.join(">")}，index ${chain.start} -> ${chain.blocked}`);
Check("走进路标圈里目标链会推进", chain.advanced === chain.blocked + 1,
  `index ${chain.blocked} -> ${chain.advanced} / ${chain.count}`);

// 七关能依次推进：一关一关点完目标链再换关。
// 不真走两公里 —— CompleteLevel 把目标链一路点完，AdvanceLevel 建下一片切片。
// 建切片是异步的（分帧走完），所以这里必须 await，不能只 StepFrames。
Stage("6.2 七章依次推进（每章都要重建一片切片，约两分钟）");
const ladder = await page.evaluate(async () => {
  const T = window.Taierzhuang, D = T.Debug;
  // **显式回到序章起跑**：别靠「上一节正好开机在第 0 章」蹭 —— 默认开机章是
  // 会变的（现在是第一章，因为序章不撒兵、量不了别的东西）。
  await T.JumpToPhase(0);
  const seen = [];
  for (let i = 0; i < 7; i += 1) {
    const lv = D.Level();
    // pool 读**本关的配置值**（state.phasePoolNra），不是运行时的 nraPool ——
    // 后者从进关那一刻起就被战损扣着走，量到的是"这几十帧死了几个人"
    seen.push({ index: lv.index, id: lv.id, zones: lv.zones.length, pool: T.state.phasePoolNra });
    if (i === 6) break;
    D.CompleteLevel();
    await D.AdvanceLevel({ cutscenes: false });
  }
  return { seen, outcome: D.Outcome() };
}, undefined);
const ladderIds = ladder.seen.map((r) => r.id);
Check("七章能依次推进", ladderIds.length === 7 && new Set(ladderIds).size === 7,
  ladderIds.join(" -> "));
// 序章只有三个路标（它不建切片、不走路，路标只当 HUD 去向）；战斗章至少五个。
Check("每章都有自己的目标链与兵员池",
  ladder.seen.every((r) => r.zones >= (r.id === "CH0_Chuchuan" ? 3 : 5) && r.pool > 0),
  ladder.seen.map((r) => `${r.id}:${r.zones}标/${r.pool}人`).join(" "));
// 「城里还站着的人」**只会往下走**：序章不耗（240→240），一章起逐章递减。
// 判据不抄具体数（数在 Data_MissionChX 里，抄进测试第二天就过期），只验形状：
// 序章与第一章同数、其后严格递减、终章仍有人。
const poolCurve = ladder.seen.map((r) => r.pool);
Check("兵员池序章不耗、其后逐章递减",
  poolCurve[0] === poolCurve[1]
    && poolCurve.slice(1).every((v, i, arr) => i === 0 || v < arr[i - 1])
    && poolCurve[6] > 0,
  poolCurve.join(" -> "));

// ===========================================================================
// 7) 阵亡换人：卡片 + 换一个有名有姓的人 + 兵员池 -1
// ===========================================================================
Stage("7 阵亡换人");
const death = await page.evaluate(async () => {
  const T = window.Taierzhuang;
  // 把日军挪到两百米外：这一段测的是「阵亡 -> 换人」这条链路本身，
  // 不是能不能在交火中央活四秒。上一次没冻场，玩家重生后 4 秒内又被打死一次，
  // 兵员池掉了 2 而不是 1，断言就误报了。
  for (const s2 of T.ai.soldiers) {
    if (s2.side === "ija") s2.position.set(s2.position.x + 300, s2.position.y, s2.position.z + 300);
  }
  // 人得先活着才谈得上"这条命扣一张票"：Kill() 对死人直接 return，
  // OnPlayerDown 也就不会触发，读数会是"一票没动"，看起来像票池坏了。
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  T.player.stance = "stand";
  T.player.eyeHeight = 1.62;
  T.StepFrames(2);
  const idBefore = T.state.identity.name;
  const poolBefore = T.state.nraPool;
  const cameraYBefore = T.camera.position.y;
  T.player.Kill();
  T.StepFrames(3);          // 让 Frame 自己发现"上一帧还活着，这一帧死了"
  // 紧贴死亡那一刻读票池。第 1 批之后 AI 阵亡也扣票（那是对的：票池 = 兵力池），
  // 所以再往后推 260 帧去读，量到的是"这段时间全场死了几个人"，不是"玩家这条命"。
  const poolAtDeath = T.state.nraPool;
  const card = document.querySelector(".hudDeathCard");
  const cardStyle = getComputedStyle(card);
  const cardOn = card.classList.contains("on");
  const cardBackground = cardStyle.backgroundColor;
  const cardBackdrop = cardStyle.backdropFilter || cardStyle.webkitBackdropFilter;
  const biography = card.querySelector(".dcBiography")?.textContent || "";
  const fallen = T.state.fallen.length;
  // 倒地约一秒：机位必须贴地并滚向一侧，第一人称枪模不能悬在画面里。
  T.StepFrames(55);
  const cameraDrop = cameraYBefore - T.camera.position.y;
  const deathRoll = Math.abs(T.camera.rotation.z);
  const weaponHidden = !T.viewmodel.root.visible;
  const deathDof = {
    strength: T.post.uniformsComposite.uDofStrength.value,
    focus: T.post.uniformsComposite.uDofFocus.value,
    range: T.post.uniformsComposite.uDofRange.value,
    maxPx: T.post.uniformsComposite.uDofMaxPx.value,
  };
  // 阵亡卡片 2.6 s + 重生（总推进帧数与旧用例一致）
  T.StepFrames(205);
  return {
    idBefore, idAfter: T.state.identity.name,
    poolBefore, poolAfter: poolAtDeath,
    cardOn, fallen, alive: T.player.Alive,
    origin: T.state.identity.origin,
    cardBackground, cardBackdrop, biography,
    cameraDrop, deathRoll, weaponHidden,
    deathDof,
    weaponRestored: T.viewmodel.root.visible,
    dofAfterRespawn: T.post.uniformsComposite.uDofStrength.value,
  };
});
Check("阵亡弹卡片", death.cardOn, `阵亡名单 ${death.fallen} 人`);
Check("阵亡层半透明且保留战场",
  /^rgba\(/.test(death.cardBackground) && death.cardBackdrop !== "none",
  `${death.cardBackground} / ${death.cardBackdrop}`);
Check("阵亡卡显示动态生平",
  !death.biography.includes("籍贯") && death.biography.includes("1938")
    && death.biography.includes("第三十一师"), death.biography);
Check("第一人称镜头倒到贴地侧卧",
  death.cameraDrop > 0.8 && death.deathRoll > 0.8,
  `下降 ${death.cameraDrop.toFixed(2)}m / 滚转 ${death.deathRoll.toFixed(2)}rad`);
Check("阵亡景深聚焦前景并重度虚化背景",
  death.deathDof.strength > 0.95 && death.deathDof.focus <= 1.5
    && death.deathDof.range <= 3.0 && death.deathDof.maxPx >= 10,
  JSON.stringify(death.deathDof));
Check("接管后关闭阵亡景深", death.dofAfterRespawn === 0,
  `dof=${death.dofAfterRespawn}`);
Check("倒地收枪且接管后恢复", death.weaponHidden && death.weaponRestored,
  `倒地 hidden=${death.weaponHidden} / 重生 visible=${death.weaponRestored}`);
Check("玩家这条命扣一张票", death.poolAfter === death.poolBefore - 1,
  `${death.poolBefore} -> ${death.poolAfter}`);
Check("换成另一个有名有姓有籍贯的人", death.alive && !!death.origin,
  `${death.idBefore} -> ${death.idAfter}（${death.origin}）`);

// ===========================================================================
// 8) 剧本真的在播 —— 这一条是整份测试存在的主要理由
//
// 任务流程重制之后这一节又改了一次判据：**不再挑具体台词**。
// 上一轮挑的是六句有史料出处的对白，而现在七章的 beats 是基建批留的骨架，
// 台词由各章内容批填 —— 挑一句写死在测试里，等于让内容批每改一句都来改测试。
// 改成认**章名 title 卡**：那是每一章第一条 beat，与章节 id 一起由数据层写死，
// 派发不出来就说明这一章的剧本根本没装载（正是这一节要防的那件事）。
// ===========================================================================
Stage("8 剧本长跑（七章按出厂时长的九成推，约七分钟）");
const storySeen = [];
// 分块推帧，一块 1800 帧（三十秒）。
// **不许一次 evaluate 里同步跑一万三千帧**：那是把渲染进程主线程一口气占住
// 五十到九十秒，浏览器会当它没响应，实跑里这一段十次有六七次就卡死在这儿。
for (let phase = 0; phase < 7; phase += 1) {
  const t0 = Date.now();
  const total = await page.evaluate(async (ph) => {
    const T = window.Taierzhuang;
    await T.JumpToPhase(ph);
    // **钉住这一关**：不钉的话玩家在十几分钟里会死上几次，而换人是在当前路标
    // 附近重生的 —— 目标链会自己往前跳，跳完就自动换关，剧本队列被重置，
    // 于是"这一关的剧本剩几条"量到的是下一关的。实测这一段的关名整体错了一格。
    T.Debug.PinLevel(true);
    // 只推到本章时长的九成：推满会触发自动换关，那时 story 的队列已经换成
    // 下一章的了，Remaining 量到的是新队列
    return Math.round(T.state.levelSeconds * 60 * 0.9);
  }, phase);
  for (let done = 0; done < total; done += 1800) {
    // 长跑不渲染：断言一帧画面都不需要，而软件光栅连推几万帧会把渲染进程卡死。
    await page.evaluate((n) => window.Taierzhuang.StepFrames(n, 1 / 60, false), Math.min(1800, total - done));
  }
  const row = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const out = { id: T.Debug.Level().id, fired: T.story.fired.length, remaining: T.story.Remaining };
    T.Debug.PinLevel(false);
    return out;
  });
  storySeen.push({ phase, ...row });
  console.log(`    ${row.id.padEnd(14)} 剧本已播 ${row.fired} 条，本关剩 ${row.remaining} 条`
    + `（${((Date.now() - t0) / 1000).toFixed(0)} s）`);
}
const storyRun = await page.evaluate((seen) => {
  const T = window.Taierzhuang, D = T.Debug;
  const fired = D.StoryFired();
  // 判据用 **StoryFired**（叙事层自己的流水账，不封顶），不用 Spoken ——
  // hud.spoken 是一条 400 条的环形缓冲，七关一路跑下来早溢出了，
  // 靠它判断"这句有没有出现过"会**随机地**漏掉最早的几关（实测就漏过一次，
  // 同一份代码上一轮还是绿的）。这类假红比真红更费时间。
  const has = (t) => fired.some((f) => (f.text || "").includes(t));
  return {
    seen,
    totalFired: fired.length,
    byTimeout: fired.filter((f) => f.byTimeout).length,
    levels: [...new Set(fired.map((f) => f.level))],
    // 七张章名卡，一章一条（各章 beats 的第一条 title）
    titles: ["出川", "往南的路", "手榴弹雨", "救护所", "东关之夜", "城墙没有了", "最后一封"]
      .filter((t) => fired.some((f) => f.type === "title" && (f.text || "") === t)),
    sample: fired.slice(-4).map((f) => `${f.level}:${f.text}`),
  };
}, storySeen);
Check("剧本 beats 真的派发出来了", storyRun.totalFired >= 45,
  `播了 ${storyRun.totalFired} 条，其中 ${storyRun.byTimeout} 条靠超时兜底`);
Check("七章的剧本都派发过", storyRun.levels.length === 7, storyRun.levels.join(" "));
Check("七张章名卡都打过", storyRun.titles.length === 7, storyRun.titles.join(" / "));
// 每一关都该基本播完，剩太多说明链子卡住了
const stuck = storyRun.seen.filter((x) => x.remaining > 6);
Check("没有哪一章的剧本被卡住", stuck.length === 0,
  stuck.length ? stuck.map((x) => `${x.id}(剩${x.remaining})`).join(" ") : "七章都跑完了");

// ===========================================================================
// 8.5) 过场：正片七章那八场 + 脱钩的旧五场，都能播、都能跳过；
//      关卡边界上真的会自动接（拿第五章那一场验）
// ===========================================================================
Stage("8.5 过场");
await Boot(1);
const cuts = await page.evaluate(async () => {
  const T = window.Taierzhuang, D = T.Debug;
  // 全表从数据层现取，不在测试里手抄一份会过期的名单。
  const { CUTSCENE_ORDER } = await import("./Data_TengxianScript.mjs");
  const ids = CUTSCENE_ORDER;
  const rows = [];
  for (const id of ids) {
    const p = D.PlayCutscene(id);
    // 起播那一下：应当接管控制权、相机被换掉
    T.StepFrames(6);
    const mid = D.Cutscene();
    const camY = T.camera.position.y;
    // 跳过之后卡片要读完才 resolve —— 再推几秒把卡片推过去
    D.SkipCutscene();
    for (let k = 0; k < 40; k += 1) T.StepFrames(30);
    const done = await p;
    rows.push({ id, playing: mid.playing, current: mid.current, camY: +camY.toFixed(1),
      skipped: !!done.skipped, captured: !!mid.current });
  }
  return { rows, played: D.Cutscene().played.map((c) => c.id) };
});
Check("全部过场都能播起来", cuts.rows.length >= 13 && cuts.rows.every((r) => r.playing && r.current === r.id),
  cuts.rows.map((r) => `${r.id}:${r.playing ? "播" : "没播"}`).join(" "));
Check("全部过场都能 Esc 跳过（跳过后卡片仍把史实补出来）",
  cuts.rows.every((r) => r.skipped), cuts.rows.map((r) => `${r.id}:${r.skipped}`).join(" "));
Check("从正片脱钩的旧五场仍然播得动（文件与注册都保留）",
  ["CS_ChuchuanLegacy", "CS_LiZongrenTang", "CS_LastWire", "CS_WangMingzhang", "CS_BeimenBreakout"]
    .every((id) => cuts.played.includes(id)),
  `播过：${cuts.played.join(" ")}`);
// 章节边界上真的会自动播：第五章（城墙没有了）打完接 **CS_Ch5_PovChain**。
//
// 2026-08-28 集成批 INT1 改的期望值（Data_MissionCh5.mjs 的 ENGINE_REQUEST 11 点名要求）：
// 按策划案 §6 的过场规格，关末播的是**视角接替**（顺子倒下不切黑 → 担架离开街道 →
// 124 师伤兵 → 电话兵中弹、听筒落地，声音直接接进终章）；**转身那一场改成关中播**
// （CHAPTER.cutsceneMid = CS_Ch5_TurnBack，由 story 的关中过场通道派发）。
// 章节数据的 cutsceneOut 已经是 CS_Ch5_PovChain，这一行原来钉的是改之前那个值。
const cutTrigger = await page.evaluate(async () => {
  const T = window.Taierzhuang, D = T.Debug;
  await T.JumpToPhase(5);
  D.CompleteLevel();
  const p = D.AdvanceLevel({ cutscenes: true });
  T.StepFrames(6);
  const at = D.Cutscene();
  D.SkipCutscene();
  for (let k = 0; k < 60; k += 1) T.StepFrames(30);
  await p;
  return { fired: at.current, after: D.Level().id };
});
Check("第五章打完自动接本章的关末过场", cutTrigger.fired === "CS_Ch5_PovChain",
  `触发的是 ${cutTrigger.fired}，之后进 ${cutTrigger.after}`);

// ===========================================================================
// 9) 结束条件可达
//
// **没有"守住了"这个结局** —— 滕县三月十七日陷落是信史。
// 两种收场：七关走完从北门出去（breakout），或者池子空了（defeat）。
// ===========================================================================
Stage("9 结束条件");
await Boot(1);
const outcome = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.state.outcome = null;
  T.state.nraPool = 0;
  T.player.Kill();
  T.StepFrames(6);
  const defeat = D.Outcome();
  T.state.outcome = null;
  D.EndBattle("breakout");
  const breakout = D.Outcome();
  const epilogueOn = document.querySelector(".hudEpilogue").classList.contains("on");
  const text = D.Spoken().slice(-9).join(" | ");
  return { defeat, breakout, epilogueOn, text };
});
Check("兵员池归零会判败", outcome.defeat === "defeat", `outcome=${outcome.defeat}`);
Check("突围收场会放尾声，且尾声说的是史实（不打歼敌数）",
  outcome.breakout === "breakout" && outcome.epilogueOn
  && outcome.text.includes("侯子平") && !outcome.text.includes("歼敌"),
  outcome.text.slice(0, 80));

// ===========================================================================
// 10) 长跑不崩、AI 数量稳定
// ===========================================================================
Stage("10 长跑");
await Boot(2, "medium");
const soak = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const samples = [];
  for (let i = 0; i < 8; i += 1) {
    T.StepFrames(600, 1 / 60, false);         // 10 s
    samples.push(T.ai.aliveCount);
  }
  return {
    samples,
    geometries: T.renderer.info.memory.geometries,
    programs: T.renderer.info.programs.length,
    projectiles: T.combat.projectiles.length,
  };
});
const minAlive = Math.min(...soak.samples);
const maxAlive = Math.max(...soak.samples);
Check("两分钟长跑 AI 数量稳定", minAlive >= 8 && maxAlive <= 120,
  `活人 ${minAlive}—${maxAlive}，几何 ${soak.geometries}，程序 ${soak.programs}`);
Check("投掷物不泄漏", soak.projectiles < 40, `残留 ${soak.projectiles}`);
Check("长跑无报错", errors.length === 0, errors.slice(0, 3).join(" | "));

// ===========================================================================
// 11) ER2 对齐第 1 批：仗真的在打 / 票池是兵力池 / 出生点看得出去
//
// 这一组每一条都从**运行时状态**取证。第 1 批修的全是"读代码看不出来"的东西：
// 全场七十个人站着不动、票池方向反了、出生点在封闭院落里 —— 页面照跑、画面照出，
// 只有把开火计数、状态分布、占领点归属、两个池子的增减读出来才看得见。
// ===========================================================================

// 11.1 出生点：不但站得下，还得看得出去
Stage("11 第 1 批：出生点 / 票池 / 交战");
await Boot(1, "small");
const spawnSmall = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  return {
    // **口径要跟代码一致**：FindOpenSpot 自己测的是 8 方位里通 3 条（37.5%），
    // 而上一版断言写的是 72 方位里通 3 条（4.2%）—— 宽了近十倍，
    // 读起来像在验一条硬条件，实际上什么都没验。独立复核指出的，这里对齐。
    open: D.OpenDirections(T.player.position.x, T.player.position.z, 8, 20),
    open72: D.OpenDirections(T.player.position.x, T.player.position.z, 72, 20),
    nraPool: T.state.nraPool,
    poolMax: T.state.phasePoolNra,
  };
});
Check("玩家出生点向 8 个方位射 20 m 至少三条通（与 FindOpenSpot 同口径）",
  spawnSmall.open >= 3, `${spawnSmall.open}/8 条通（72 方位口径 ${spawnSmall.open72}/72）`);

// 11.2 票池**不**随战场规模缩放。
// 台儿庄那一版按 SCALE.maxAlive 缩过（开放战场的票池是个平衡旋钮）；
// 滕县的「城里还站着的人」是剧本给死的一条曲线（登记在 PRESUMED_STAGING.poolCurve），
// 跟同屏人数没有关系 ——
// 缩了它就不再是那条曲线，屏幕上那个数字也就不再对应剧本里的任何东西。
await Boot(1, "large");
const poolLarge = await page.evaluate(() => window.Taierzhuang.state.phasePoolNra);
Check("兵员池照剧本给的数，不随战场规模缩放（small === large）",
  spawnSmall.poolMax > 0 && spawnSmall.poolMax === poolLarge,
  `small=${spawnSmall.poolMax} large=${poolLarge}`);

// 11.3 六十秒开火计数 / 状态分布 / 占领点易主 —— 玩家全程不动手
await Boot(2, "medium");
const battle = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  const fire0 = D.FireCount();
  const states = {};
  let contestedSeen = false;
  // 每秒采一次。只在十秒边界采会漏掉整段交火。
  // 开火计数只数**头六十秒**；占领点易主给到一百五十秒 —— 守军会往吃紧的点增援，
  // 一个点真正翻过去要打上一两分钟，这正是我们想要的（一分钟就翻旗说明没人守）。
  let fired60 = 0;
  for (let i = 0; i < 150; i += 1) {
    T.StepFrames(60, 1 / 60, false);
    if (i === 59) fired60 = D.FireCount() - fire0;
    const snapshot = D.AiStates();
    for (const key of Object.keys(snapshot)) states[key] = (states[key] || 0) + snapshot[key];
    // 线性关卡里路标不会易主（不存在占领条）。能取证的是**压力**：
    // 目标链上的路标有没有被日军贴进圈里过。一百五十秒里一次都没有，
    // 说明敌人根本没压上来 —— 那才是"仗没在打"的另一副面孔。
    if (T.battlefield.objectives.some((o) => o.contested)) contestedSeen = true;
  }
  return {
    fired: fired60,
    states,
    contestedSeen,
    reached: D.Level().objectiveIndex,
    deaths: D.Deaths(),
  };
});
Check("六十秒内全场开火计数 > 200", battle.fired > 200, `开了 ${battle.fired} 枪`);
Check("AI 状态分布不再恒为 advance", Object.keys(battle.states).length >= 3,
  JSON.stringify(battle.states));
Check("交火与装填两种状态都出现过", !!battle.states.fire && !!battle.states.reload,
  `fire=${battle.states.fire || 0} reload=${battle.states.reload || 0}`);
Check("日军真的压到目标链上（路标被贴住过）", battle.contestedSeen,
  `目标链走到 ${battle.reached}，阵亡 ${JSON.stringify(battle.deaths)}`);
Check("两侧都在真的死人", battle.deaths.nra > 0 && battle.deaths.ija > 0,
  `nra ${battle.deaths.nra} / ija ${battle.deaths.ija}`);

// 11.4 票池方向：日军炮弹炸死中国兵，扣的必须是**中方**的票
// 旧 bug 的反向断言。Blast 是同步结算，所以前后两次读数中间不推帧，
// 不会有别的死亡混进来。
const blastPool = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const victim = T.ai.soldiers.find((s) => s.alive && s.side === "nra");
  if (!victim) return { noVictim: true };
  // 挪到空地上单独炸，免得连坐炸到日军
  victim.position.set(T.battlefield.bounds.maxX - 30, victim.position.y, T.battlefield.bounds.maxZ - 30);
  victim.position.y = T.battlefield.GroundHeight(victim.position.x, victim.position.z);
  const at = victim.position.clone(); at.y += 0.4;
  const nra0 = T.state.nraPool, ija0 = T.state.ijaPool;
  T.combat.Blast(at, 6, 400, "shell");
  return { nra0, ija0, nra1: T.state.nraPool, ija1: T.state.ijaPool, dead: !victim.alive };
});
Check("日军炮弹炸死中国兵：扣中方票、日方票不动",
  !blastPool.noVictim && blastPool.dead
  && blastPool.nra1 === blastPool.nra0 - 1 && blastPool.ija1 === blastPool.ija0,
  `nra ${blastPool.nra0}->${blastPool.nra1}, ija ${blastPool.ija0}->${blastPool.ija1}`);

// 11.5 玩家亲手打死一个日军：日方票恰好 -1（不是 -2，防行内扣减与事件双扣）
const shotPool = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.StepFrames(200);                       // 等上一段的动作播完，IsBusy 会挡下开火
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  const target = T.ai.soldiers.find((s) => s.alive && s.side === "ija");
  if (!target) return { noTarget: true };
  // **先给自己找一条打得出去的射界。** 滕县城内是一进一进的四合院，
  // 玩家十有八九正贴着一堵墙站着 —— 实测八枪弹着全是 wall，
  // 量到的"票池没动"是子弹打在砖上，不是双扣没修好。
  // 做法：原地转一圈，找一条 6 m 内没有东西的方位，把 yaw 转过去。
  const V0 = T.player.position.constructor;
  const probe = new V0();
  let bestYaw = null;
  for (let k = 0; k < 24; k += 1) {
    const y = (k / 24) * Math.PI * 2;
    probe.set(-Math.sin(y), 0, -Math.cos(y));
    if (!T.battlefield.Raycast(T.player.EyePosition, probe, 6)) { bestYaw = y; break; }
  }
  if (bestYaw === null) return { boxedIn: true };
  T.player.yaw = bestYaw;
  T.player.aimYaw = 0; T.player.pitch = 0; T.player.aimPitch = 0;
  // **转完向必须推两帧**：子弹从枪口出发，而枪口世界坐标是逐帧跟随的 ——
  // 不推帧它还停在旧朝向前方 0.8 m 处，从那里沿新方向打出去，与摆在
  // 视线上的靶子错开 0.8·sin(Δ夹角)；Δ夹角 >~34° 时八发全从靶边掠过
  //（东关雕出空地后 bestYaw 恰好落到远离旧朝向的方位，双跑复现 none×8）。
  T.StepFrames(2);
  T.player.yaw = bestYaw;
  T.player.aimYaw = 0; T.player.pitch = 0; T.player.aimPitch = 0;
  // 靶子摆在**真正的瞄准射线**上，别拿 player.yaw 现推一条水平前向：
  // TryFire 的命中判定是「到射线的垂距 < 0.45 m」，而胸口在 position.y + 0.95。
  // 拿水平前向摆在 3 m 处，胸口比眼位低 0.65 m，垂距 0.65 > 0.45 —— 八枪全从头顶过去。
  const V = T.player.position.constructor;
  const dir = T.player.AimDirection(new V());
  const eye = T.player.EyePosition.clone();
  // 1.8 m 而不是 4 m：滕县城内是一进一进的四合院，四米外十有八九先撞墙，
  // 量到的"没打死"是子弹打在砖上，不是票池算错。
  // 枪口本身就在眼前约 0.8 m，所以 1.8 m 等于枪口前一米，中间不可能夹一堵墙。
  const spot = eye.clone().addScaledVector(dir, 1.8);
  target.position.set(spot.x, spot.y - 0.95, spot.z);
  target.health = 1;                        // 一枪必死，把"打了几枪"这个变量消掉
  const ija0 = T.state.ijaPool;
  // Debug.Fire 是同步的：中间不推帧，就不会有别的日军死掉混进读数
  let shots = 0;
  const hits = [];
  while (target.alive && shots < 8) {
    D.Fire(); shots += 1;
    const ls = D.LastShot();
    if (ls) hits.push(ls.hitKind);
  }
  return { ija0, ija1: T.state.ijaPool, dead: !target.alive, shots, hits,
    ammo: T.state.ammo, yaw: +bestYaw.toFixed(2) };
});
Check("玩家亲手击杀：日方票恰好 -1（没有双扣）",
  !shotPool.noTarget && shotPool.dead && shotPool.ija1 === shotPool.ija0 - 1,
  shotPool.boxedIn ? "四周六米内没有一条打得出去的方位"
    : `ijaPool ${shotPool.ija0}->${shotPool.ija1}，打了 ${shotPool.shots} 枪，`
      + `弹着 ${(shotPool.hits || []).join("/") || "一发都没出去"}，余弹 ${shotPool.ammo}`);

// 11.6 命中/击杀回执（2026-08-20 补）。
//
// 守的是一件读代码看不出来的事：本作当时**没有准星、不显示弹药数、不打歼敌数**，
// 三条减法各自都对，叠起来就把「我这一枪打没打中」的所有出口一起堵死了 ——
// 血雾在一百米上是两三个像素，impactFlesh 走 inverse 衰减到八十米只剩 4.8%。
//（2026-08-25 后准心回来了，但它只画散布锥、一个字的命中信息都不给，
// 所以这条回执仍然是「打没打中」的唯一出口，这一组断言照旧。）
// 同时验两件事：打中了给 hit、打死了给 kill，而且**两者不许混** ——
// 一枪没打死却报了击杀，比没有回执更糟。
const hitFeedback = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.StepFrames(200);                        // 等上一段的动作播完，IsBusy 会挡下开火
  for (const s2 of T.ai.soldiers) {
    if (s2.side === "ija") s2.position.set(s2.position.x + 400, s2.position.y, s2.position.z + 400);
  }
  T.state.spawnAccumulator = -1e6;
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  const target = T.ai.soldiers.find((s2) => s2.alive && s2.side === "ija");
  if (!target) return { noTarget: true };
  // 与上一节同一套摆位：先找一条六米内打得出去的方位（城里十有八九正贴着一堵墙）
  const V = T.player.position.constructor;
  const probe = new V();
  let bestYaw = null;
  for (let k = 0; k < 24; k += 1) {
    const y = (k / 24) * Math.PI * 2;
    probe.set(-Math.sin(y), 0, -Math.cos(y));
    if (!T.battlefield.Raycast(T.player.EyePosition, probe, 6)) { bestYaw = y; break; }
  }
  if (bestYaw === null) return { boxedIn: true };

  // 每一枪前重置：血、朝向、槽位、弹仓、靶位。
  //   · 槽位要按回长枪 —— 第一关开局手上根本没枪，activeSlot 是大刀，D.Fire() 会走白刃；
  //   · 弹仓要压满 —— 空仓那一下 TryFire 直接 return，lastShot 会停在上一节的读数上；
  //   · 靶子要按回**瞄准射线**上 —— 中弹会把人往后推，推出射线就成了"打空"。
  const Ready = () => {
    T.player.health = 100;
    T.player.yaw = bestYaw; T.player.aimYaw = 0; T.player.pitch = 0; T.player.aimPitch = 0;
    T.state.activeSlot = "primary";
    T.state.ammo = 5; T.state.clips = 4;
    const dir = T.player.AimDirection(new V());
    const spot = T.player.EyePosition.clone().addScaledVector(dir, 1.8);
    target.position.set(spot.x, spot.y - 0.95, spot.z);
    target.suppression = 1;                 // 贴脸站着的日兵，别让它把测试员打死
  };

  const before = D.Hits();
  target.health = 400;                      // 打得中、打不死
  Ready(); D.Fire();
  const afterHit = D.Hits();
  const hitShot = D.LastShot();
  // 【2026-08-26】等拉栓的这两秒里，靶子是站在空地上、suppression=1 不还手的独兵，
  // 自家 NRA 会把它当真靶打 —— 实测 120 帧里友军能磨掉两三百血（首枪后余 326）。
  // 磨死了的话第二枪打的是尸体：TryFire 的 _marchTargets 只收活人，子弹直接穿过去，
  // ConfirmHit 根本不会被调用 —— 断言红的却是「击杀没回执」。这就是 08-25 转绿后
  // 又被场景/布设类提交（改了友军站位与射界）反复翻红的原因：它是条零余量的竞态。
  // 所以等待期把血垫到打不死，第二枪前再压回 1。友军命中不走 ConfirmHit，不会多发 cue。
  target.health = 1e9;
  T.StepFrames(120);                        // 拉栓那一下过去，IsBusy 才放行下一枪
  target.health = 1;                        // 一枪必死
  Ready(); D.Fire();
  const afterKill = D.Hits();
  T.StepFrames(90);
  return { before, afterHit, afterKill, hitShot, dead: !target.alive,
    // 记号会自己消失，不是永久挂在屏幕正中 —— 本作没有准星，挂住就等于偷发了一个
    cleared: document.querySelector(".hudHitmark").className === "hudHitmark" };
});
const hf = hitFeedback;
const hfWhy = hf.noTarget ? "场上没有日军" : hf.boxedIn ? "四周六米内没有一条打得出去的方位" : "";
Check("打中了有回执：屏幕记号 hit + 听觉 hitConfirm，且不误报击杀",
  !hfWhy && hf.hitShot && hf.hitShot.hitKind === "soldier"
    && hf.afterHit.marks.length === hf.before.marks.length + 1
    && hf.afterHit.marks[hf.afterHit.marks.length - 1] === "hit"
    && hf.afterHit.visual.active && hf.afterHit.visual.opacity > 0.95
    && hf.afterHit.visual.strokes === 4 && hf.afterHit.visual.visibleStrokes === 4
    && hf.afterHit.visual.zIndex >= 4
    && hf.afterHit.cues.hit === hf.before.cues.hit + 1
    && hf.afterHit.cues.kill === hf.before.cues.kill,
  hfWhy || `弹着 ${hf.hitShot ? hf.hitShot.hitKind : "一发都没出去"}，`
    + `记号 ${JSON.stringify(hf.afterHit.marks.slice(-3))}，`
    + `画面 ${JSON.stringify(hf.afterHit.visual)}，`
    + `cue hit ${hf.before.cues.hit}->${hf.afterHit.cues.hit} / `
    + `kill ${hf.before.cues.kill}->${hf.afterHit.cues.kill}`);
Check("打死了给的是击杀回执：记号 kill + 听觉 killConfirm，之后自己消失",
  !hfWhy && hf.dead && hf.cleared
    && hf.afterKill.marks[hf.afterKill.marks.length - 1] === "kill"
    && hf.afterKill.cues.kill === hf.afterHit.cues.kill + 1,
  hfWhy || `死了=${hf.dead}，记号 ${JSON.stringify(hf.afterKill.marks.slice(-3))}，`
    + `cue kill ${hf.afterHit.cues.kill}->${hf.afterKill.cues.kill}，记号已收 ${hf.cleared}`);

// 11.7 一次爆炸只回一条。手榴弹放倒四个人就"哒哒哒哒"响四声的话，
// 那是连杀播报，不是命中确认（Data_DesignFirstPass §385 明写不做连杀播报）。
const blastFeedback = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  const V = T.player.position.constructor;
  const dir = T.player.AimDirection(new V());
  const at = T.player.position.clone().addScaledVector(dir, 9);
  at.y = T.battlefield.GroundHeight(at.x, at.z) + 0.2;
  // **只挑还活着的。** Soldier.alive 是个只读 getter（state !== DEAD），
  // 而 page.evaluate 里的代码跑在非严格模式下 —— `s.alive = true` 既不报错也不生效，
  // 于是"复活四具尸体来炸"会静默地变成"炸四具尸体"，量到的 +0 是测试自己摆错了摊。
  const staged = T.ai.soldiers.filter((s2) => s2.alive && s2.side === "ija").slice(0, 4);
  if (staged.length < 2) return { tooFew: true };
  for (const s2 of staged) { s2.health = 3; s2.position.set(at.x, at.y, at.z); }
  const before = D.Hits();
  T.combat.Blast(at, 6, 120, "grenade", "ija", true);
  const after = D.Hits();
  return { before, after, staged: staged.length, aliveAfter: staged.filter((s2) => s2.alive).length };
});
Check("一枚手榴弹放倒一堆人：回执只出一条（不是连杀播报）",
  !blastFeedback.tooFew
    && blastFeedback.after.marks.length === blastFeedback.before.marks.length + 1
    && blastFeedback.after.marks[blastFeedback.after.marks.length - 1] === "kill"
    && blastFeedback.after.cues.kill === blastFeedback.before.cues.kill + 1,
  blastFeedback.tooFew ? "场上没有四个活着的日军可摆"
    : `摆了 ${blastFeedback.staged} 个、剩 ${blastFeedback.aliveAfter} 个活的，`
      + `记号 +${blastFeedback.after.marks.length - blastFeedback.before.marks.length}`);


// ===========================================================================
// 12) ER2 对齐第 2 批：键位表 / 携行 / 枪的手感三件套 / flank·charge / 两脚架 / 过热
//
// 同样一律从运行时取证。这一批改的大半是"读代码看不出来"的东西：
// 键位是散在装配层还是走 KEYMAP、LOADOUTS 到底有没有被读、子弹是不是还在走直线、
// 后坐有没有真的顶视角 —— 页面照跑、画面照出，只有把运行时状态读出来才看得见。
// ===========================================================================

// 12.1 键位表真的接上了：1/2/3/4 与滚轮走的是合成键盘事件，不是直接调函数
Stage("12 第 2 批：键位 / 携行 / 手感");
// 夜袭那一章（东关之夜）现在是第四章，它的携行走 LOADOUTS.L3_WhiteTowel。
await Boot(4, "small");
const slots = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  // 冻场：日军挪到四百米外，补兵的钟拨到负一百万秒（SeedSoldiers 每三秒补一批
  // 新的到玩家跟前，只挪走现有的没用）。不冻场的话玩家会在这一组里反复阵亡，
  // 而 SwitchSlot / TryFire / Reload 对死人一律 return false ——
  // 量到的"切不了枪""打不出去"就全是测试自己没站稳。
  for (const s2 of T.ai.soldiers) {
    if (s2.side === "ija") s2.position.set(s2.position.x + 400, s2.position.y, s2.position.z + 400);
  }
  T.state.spawnAccumulator = -1e6;
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  const seen = [D.Slots()];
  for (const code of ["Digit2", "Digit3", "Digit4", "Digit1"]) {
    D.Key(code); T.StepFrames(40); seen.push(D.Slots());
  }
  D.Wheel(-120); T.StepFrames(40);
  return { seen, wheeled: D.Slots() };
});
const slotIds = slots.seen.map((s2) => s2.active);
Check("按 1/2/3/4 能切到四个不同槽位，viewmodel 跟着换枪",
  new Set(slotIds).size === 4 && slots.seen.every((s2) => s2.viewmodel === s2.weapon),
  `槽位 ${slotIds.join("->")}，viewmodel ${slots.seen.map((s2) => s2.viewmodel).join("->")}`);
Check("滚轮也能循环切槽",
  slots.wheeled.active !== slots.seen[slots.seen.length - 1].active,
  `${slots.seen[slots.seen.length - 1].active} -> ${slots.wheeled.active}`);

// 12.2 LOADOUTS 真的被读了：phase=4（东关之夜）是 L3_WhiteTowel
Check("P4 夜袭的携行是 L3_WhiteTowel：一支长枪、一支短枪、肩背大刀",
  slots.seen[0].loadout === "L3_WhiteTowel"
  && slots.seen[0].slots.secondary === "Mauser96"
  && slots.seen[0].slots.melee === "Dadao",
  `${slots.seen[0].loadout} primary=${slots.seen[0].slots.primary} `
  + `secondary=${slots.seen[0].slots.secondary} melee=${slots.seen[0].slots.melee}`);

// 12.3 / 12.4 弹道下坠与枪口视差。
// 站到城上空往斜下打，让子弹跑满三百米不撞墙 —— 城里随便哪一条射线四十米就到头了。
Stage("12.3 弹道");
const ballistics = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.state.spawnAccumulator = -1e6;
  for (const s2 of T.ai.soldiers) {
    if (s2.side === "ija") s2.position.set(s2.position.x + 400, s2.position.y, s2.position.z + 400);
  }
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  D.Key("Digit1"); T.StepFrames(60);
  // 站到城上空平射：城里找不出一条三百米不撞墙的射线（随便哪一条四十米就到头）。
  T.player.position.set(0, 90, 40);
  T.player.yaw = 0; T.player.pitch = 0;
  T.player.aimYaw = 0; T.player.aimPitch = 0;
  T.player.ads = 1;                        // 收散布，免得随机偏角把落差淹掉
  T.player.SyncCamera(1 / 60);             // 相机不同步的话枪口还留在原地
  // 把有效射程临时压到 300 m，让弹道正好在三百米处收住 —— 不然它会一直飞到
  // 汉阳造的 400 m 射程尽头，量到的是四百米的落差。viewmodel.weapon 跟
  // WEAPONS[currentWeapon] 是同一个对象，改完立刻还回去。
  const w = T.viewmodel.weapon;
  const savedRange = w.effectiveRangeM;
  w.effectiveRangeM = 300;
  T.state.ammo = 5;
  D.Fire();
  w.effectiveRangeM = savedRange;
  const shot = D.LastShot();
  if (shot) { shot.slot = D.Slots().active; shot.weapon = D.Slots().weapon; }
  return shot || { none: true, slot: D.Slots().active, alive: T.player.Alive };
});
// 验收带 2026-08-19 从 0.4—0.9 m 上调到 1.1—1.7 m：加了二次阻力之后 300 m 的
// 飞行时间从 0.370 s 变成 0.571 s，下坠自然从 0.71 m 涨到 1.32 m。
// 对照战地的 datamine（Gewehr 98 300 m 下坠 1.40 m、存速 45%）—— 我们的存速也是 45%，
// 但重力仍是真实的 9.8（战地那个 12 是街机化处理，见 docs/Data_BattlefieldNumbers.md）。
Check("平射三百米有可感知的下坠（1.1—1.7 m，战地是 1.40 m）",
  !ballistics.none && ballistics.horizDist > 280 && ballistics.horizDist < 320
  && ballistics.dropM > 1.1 && ballistics.dropM < 1.7,
  ballistics.none
    ? `没打出去（槽位 ${ballistics.slot}，人活着=${ballistics.alive}）`
    : `${ballistics.weapon} 水平 ${ballistics.horizDist.toFixed(1)} m，`
      + `落差 ${ballistics.dropM.toFixed(3)} m，落点 ${ballistics.hitKind}`);
Check("射线起点是枪口不是眼睛（视差生效）",
  !ballistics.none && ballistics.muzzleOffsetM > 0.02 && ballistics.muzzleOffsetM < 0.6,
  ballistics.none ? "没打出去" : `枪口离瞄准轴 ${ballistics.muzzleOffsetM.toFixed(3)} m`);

// 12.5 后坐：连开三枪 pitch 单调上升，然后照战地的曲线回到**精确的零**
const recoil = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.player.position.set(0, 90, 40);
  T.player.pitch = 0; T.player.ads = 0;
  // 上一段（弹道）已经打过一发，回落账上还欠着它。
  // 不清零的话这里量到的是两段加在一起的曲线。
  T.player.recoilPending.pitch = 0;
  T.player.recoilPending.yaw = 0;
  T.player.recoilPeak = 0;
  T.player.recoilSince = 999;
  const pitches = [T.player.pitch];
  for (let i = 0; i < 3; i += 1) {
    // Debug.Fire 走的是 TryFire(dt=1)，而栓动枪的射击间隔是 1.25—1.40 s ——
    // "调一次就等于打一发"是不成立的，得打到枪口真的动了为止。
    // 中间**不推帧**：一推 player.Update 就开始回落，"单调上升"这条就测不出来了。
    const before = T.player.pitch;
    for (let k = 0; k < 6 && T.player.pitch === before; k += 1) { T.state.ammo = 5; D.Fire(); }
    pitches.push(T.player.pitch);
  }
  const peak = T.player.pitch;
  const idle = { forward: 0, strafe: 0, sprint: false, ads: false, lean: 0,
    lookX: 0, lookY: 0, crouchPressed: false, pronePressed: false, breathHold: false, sensitivity: 1 };
  // 逐帧采样回落曲线 —— 只看首尾读不出"悬住再加速"这个形状。
  const curve = [];
  for (let i = 0; i < 90; i += 1) {
    T.player.Update(1 / 60, idle, null);
    curve.push({ t: (i + 1) / 60, done: 1 - T.player.pitch / (peak || 1) });
  }
  const At = (tt) => (curve.find((c) => c.t >= tt) || { done: 1 }).done;
  return {
    pitches, peak, after: T.player.pitch, residual: T.player.pitch / (peak || 1),
    exactZero: T.player.pitch === 0,
    d05: At(0.05), d20: At(0.20), d45: At(0.45),
  };
});
Check("连开三枪枪口单调上抬",
  recoil.pitches.every((v, i) => i === 0 || v > recoil.pitches[i - 1]) && recoil.peak > 0.02,
  recoil.pitches.map((v) => v.toFixed(4)).join(" -> "));
// 这三条一起验战地那条回落曲线。**旧版这里断言的是「只回七成、留三成残留」，那是错的** ——
// datamine 显示 BF1/BFV 栓动步枪残留为零（docs/Data_BattlefieldNumbers.md）。
Check("后坐回到**精确的零**，没有残留（战地是回到原瞄准点的）",
  recoil.exactZero,
  `峰值 ${recoil.peak.toFixed(4)} -> ${recoil.after.toFixed(4)}（残留 ${(recoil.residual * 100).toFixed(3)}%）`
  + `，精确零=${recoil.exactZero}`);
Check("回落**从零速率起步**（枪先「悬」一下）：50 ms 内回落 <16%",
  recoil.d05 < 0.16,
  `50 ms 回落 ${(recoil.d05 * 100).toFixed(1)}%（同样收干净时间的指数回落是 18.8%，`
  + `而且它起步最快、尾巴最长 —— 那是「画面在往下淌」的手感）`);
Check("悬完之后**加速归位**：200 ms 已回落 >55%，450 ms 收干净",
  recoil.d20 > 0.55 && recoil.d45 > 0.999,
  `200 ms ${(recoil.d20 * 100).toFixed(1)}% -> 450 ms ${(recoil.d45 * 100).toFixed(1)}%`);

// 12.5b 开镜 FOV：固定 150 ms、不随枪变；拉栓期间强制退出
// 对标战地（docs/Data_BattlefieldNumbers.md）：BFV 全部 82 支枪的
// AimingFovTransitionTime 都是 0.15 s，枪的轻重差异全在动画里、不在相机上。
const adsFov = await page.evaluate(async () => {
  const T = window.Taierzhuang;
  // 必须走**真鼠标右键**。开镜量每帧都会被 router.Read 从真实输入覆写回去，
  // 直接往那个字段上赋值当场就被冲掉 —— 上一版这个用例就是这么假过的：
  // 量到髋射与开镜的 FOV 一模一样 55.0°，等于什么都没测。
  const Mouse = (down) => document.dispatchEvent(new MouseEvent(
    down ? "mousedown" : "mouseup", { button: 2, bubbles: true }));
  const Settle = () => { Mouse(false); T.StepFrames(40); };
  // 量一支枪从髋射到开镜、相机 FOV 走完 98% 用了多少毫秒
  const Measure = (id) => {
    T.viewmodel.Equip(id);
    T.state.slots.primary = id;
    Settle();
    const hip = T.camera.fov;
    Mouse(true);
    T.StepFrames(60);                       // 先跑到底拿终值
    const aim = T.camera.fov;
    Settle();
    Mouse(true);
    let frames = 0;
    for (let i = 0; i < 60; i += 1) {
      T.StepFrames(1);
      frames += 1;
      if (Math.abs(T.camera.fov - aim) <= Math.abs(hip - aim) * 0.02) break;
    }
    Mouse(false);
    return { id, hip, aim, ms: frames * (1000 / 60) };
  };
  const zz = Measure("ZhongZheng");         // adsTimeS 0.28
  const mp = Measure("Mauser96");           // adsTimeS 0.18（最轻）
  const hy = Measure("HanYang");            // adsTimeS 0.32（最重）

  // 拉栓期间相机要退出瞄准：开镜稳住 -> 打一发 -> 拉栓动画里读 FOV
  T.viewmodel.Equip("ZhongZheng");
  T.state.slots.primary = "ZhongZheng";
  Mouse(false); T.StepFrames(40);
  const hip2 = T.camera.fov;
  Mouse(true); T.StepFrames(60);
  const aimed = T.camera.fov;
  T.state.ammo = 5;
  T.Debug.Fire();
  let busySeen = false, worst = aimed;
  for (let i = 0; i < 24; i += 1) {
    T.StepFrames(1);
    if (T.viewmodel.IsBusy()) { busySeen = true; worst = Math.max(worst, T.camera.fov); }
  }
  Mouse(false);
  // 0 = 一直贴着瞄准 FOV（没退出），1 = 完全退回髋射
  const backOut = (worst - aimed) / Math.max(1e-6, hip2 - aimed);
  return { zz, mp, hy, busySeen, backOut, aimed, worst, hip2 };
});
Check("开镜 FOV 过渡是 150 ms（±30 ms）",
  [adsFov.zz, adsFov.mp, adsFov.hy].every((w) => w.ms > 120 && w.ms < 180),
  [adsFov.zz, adsFov.mp, adsFov.hy].map((w) => `${w.id} ${w.ms.toFixed(0)} ms`).join(" · ")
    + `（战地是全局固定 0.15 s）`);
Check("开镜 FOV 过渡**不随枪变**（轻重差异归动画管，不归相机管）",
  Math.max(adsFov.zz.ms, adsFov.mp.ms, adsFov.hy.ms)
    - Math.min(adsFov.zz.ms, adsFov.mp.ms, adsFov.hy.ms) <= 34,
  `最轻的驳壳枪 ${adsFov.mp.ms.toFixed(0)} ms vs 最重的汉阳造 ${adsFov.hy.ms.toFixed(0)} ms`
    + `，差 ${Math.abs(adsFov.hy.ms - adsFov.mp.ms).toFixed(0)} ms（adsTimeS 差了 78%）`);
Check("拉栓强制退出瞄准：那一下「丢失瞄准画面」才是栓动枪的分量",
  adsFov.busySeen && adsFov.backOut > 0.5,
  `拉栓中 FOV 从 ${adsFov.aimed.toFixed(1)}° 退到 ${adsFov.worst.toFixed(1)}°`
    + `（髋射是 ${adsFov.hip2.toFixed(1)}°），退出了 ${(adsFov.backOut * 100).toFixed(0)}%`);

// 12.6 标准 FPS 铁瞄：所有枪的照门都必须零偏心，不能让模型与屏幕中心说两套话。
const sights = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.viewmodel.Equip("ZhongZheng");
  const zz = D.AdsOffset();
  T.viewmodel.Equip("HanYang");
  const hy = D.AdsOffset();
  return { zz, hy };
});
Check("铁瞄零偏心：中正式与汉阳造都对齐屏幕中心",
  Math.hypot(sights.zz.x, sights.zz.y) < 1e-7
  && Math.hypot(sights.hy.x, sights.hy.y) < 1e-7,
  `中正式 ${(sights.zz.x * 1000).toFixed(2)} mm，汉阳造 ${(sights.hy.x * 1000).toFixed(2)} mm`);

// 12.7 屏息挪到 Shift（按开镜量分流），Space 腾空
const breath = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.player.Spawn(T.player.position.x, T.player.position.z, 0);
  T.player.stamina = 1;
  const Sample = () => { T.player.ads = 1.0; T.StepFrames(2); return T.player.breathHold; };
  D.Key("ShiftLeft", true);          // 按住，不是点按
  const withShift = Sample();
  D.Key("ShiftLeft", false);
  D.Key("Space", true);
  const withSpace = Sample();
  D.Key("Space", false);
  return { withShift, withSpace };
});
Check("开镜时按住 Shift 是屏息", breath.withShift === true, `breathHold=${breath.withShift}`);
Check("按 Space 不再触发屏息（腾给翻越 / 跳跃）", breath.withSpace === false,
  `breathHold=${breath.withSpace}`);

// 12.8 / 12.9 flank 与 charge 从"只写了个字符串"变成真的会动
Stage("12.8 命令");
const orders = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const V = T.player.position.constructor;
  // 把日军挪走：这一段验的是命令本身，不是能不能在交火中活十秒
  for (const s2 of T.ai.soldiers) {
    if (s2.side === "ija") s2.position.set(s2.position.x + 400, s2.position.y, s2.position.z + 400);
  }
  const zone = T.battlefield.objectives[0];
  // 起点不能直接用占领点圆心：中正门那个圆心落在门楼里，人一步都挪不动，
  // 量到的"没冲出去"是站位问题不是命令问题。用导航网格吸到最近能走的地方。
  const spot = { x: zone.x, z: zone.z };
  T.nav.SnapToMain(zone.x, zone.z, spot);
  const gy = T.battlefield.GroundHeight(spot.x, spot.z);
  T.player.position.set(spot.x, gy, spot.z);
  const near = T.ai.soldiers.filter((s2) => s2.alive && s2.side === "nra").slice(0, 5);
  const Reset = () => {
    for (const s2 of near) {
      s2.holdZone = zone; s2.position.set(spot.x, gy, spot.z); s2.order = "hold"; s2.target = null;
    }
  };
  Reset();
  const aim = new V(spot.x + 60, gy, spot.z + 60);
  const g0 = near.map((s2) => `${s2.goal.x.toFixed(1)},${s2.goal.z.toFixed(1)}`);
  const nFlank = T.ai.IssueOrder("flank", T.player.position, aim);
  const g1 = near.map((s2) => `${s2.goal.x.toFixed(1)},${s2.goal.z.toFixed(1)}`);
  Reset();
  const nCharge = T.ai.IssueOrder("charge", T.player.position, aim);
  const state0 = near.map((s2) => s2.state);
  T.StepFrames(900);          // 15 s，命令有效期是 18 s
  return {
    nFlank, goalChanged: g0.join("|") !== g1.join("|"),
    bothSides: new Set(g1).size >= 2, g1,
    nCharge, state0, bayonet: near.map((s2) => s2.bayonetFixed),
    away: near.map((s2) => +Math.hypot(s2.position.x - spot.x, s2.position.z - spot.z).toFixed(1)),
    radius: zone.radius,
  };
});
Check("IssueOrder('flank') 让受令者的 goal 真的变了，而且分左右两路",
  orders.nFlank > 0 && orders.goalChanged && orders.bothSides,
  `受令 ${orders.nFlank} 人，绕行点 ${orders.g1.slice(0, 2).join(" / ")}`);
Check("IssueOrder('charge') 让守点单位也上刺刀、冲出守区",
  orders.nCharge > 0 && orders.state0.every((v) => v === "charge")
  && orders.bayonet.every(Boolean)
  && orders.away.some((v) => v > orders.radius),
  `状态 ${orders.state0.join(",")}；离点心 ${orders.away.join(" / ")} m（守区半径 ${orders.radius}）`);

// 12.10 两脚架：不架不许开镜
Stage("12.10 两脚架");
const bipod = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.state.spawnAccumulator = -1e6;
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  T.state.slots.secondary = "Zb26";
  D.Key("Digit1"); T.StepFrames(30);      // 先回长枪，免得已经在 secondary 上按 2 无效
  D.Key("Digit2"); T.StepFrames(60);
  const equipped = D.Slots();
  const zb = { bipod: true, adsTimeS: 0.40, spreadAdsDeg: 0.55, spreadHipDeg: 4.2 };
  const Drive = (n) => {
    for (let i = 0; i < n; i += 1) {
      T.player.Update(1 / 60, { forward: 0, strafe: 0, sprint: false, ads: true, lean: 0,
        lookX: 0, lookY: 0, crouchPressed: false, pronePressed: false, breathHold: false, sensitivity: 1 }, zb);
    }
  };
  T.player.stance = "prone";
  Drive(180);
  const adsNoBipod = T.player.ads;
  const spreadNoBipod = T.player.SpreadDeg(zb);
  D.Key("KeyT"); T.StepFrames(2);
  const deployed = T.player.bipod;
  Drive(240);
  // 散布要在**同一个开镜量**下比，不然量到的是"开镜 + 架枪"两件事叠在一起
  const spreadWithBipod = T.player.SpreadDeg(zb);
  T.player.bipod = false;
  const spreadSameAds = T.player.SpreadDeg(zb);
  T.player.bipod = deployed;
  return { weapon: equipped.weapon, adsNoBipod, deployed, adsWithBipod: T.player.ads,
    spreadNoBipod, spreadWithBipod, spreadSameAds };
});
Check("捷克式不架两脚架右键不进开镜，架起后能到 1.0",
  bipod.weapon === "Zb26" && bipod.adsNoBipod < 0.05 && bipod.deployed && bipod.adsWithBipod > 0.95,
  `未架 ads=${bipod.adsNoBipod.toFixed(2)}，架起 ads=${bipod.adsWithBipod.toFixed(2)}`);
Check("架起两脚架散布明显收窄（同一开镜量下对比）",
  bipod.spreadWithBipod < bipod.spreadSameAds * 0.5,
  `未架 ${bipod.spreadSameAds.toFixed(3)}° -> 架起 ${bipod.spreadWithBipod.toFixed(3)}°`
  + `（腰射未架时是 ${bipod.spreadNoBipod.toFixed(3)}°）`);

// 12.11 单发模式（仅捷克式）
const fireMode = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  const before = D.Slots();
  D.Key("Digit0"); T.StepFrames(2);
  return { weapon: before.weapon, before: before.fireMode, after: D.Slots().fireMode };
});
Check("按 0 能把捷克式切成单发",
  fireMode.weapon === "Zb26" && fireMode.before === "auto" && fireMode.after === "semi",
  `${fireMode.weapon}：${fireMode.before} -> ${fireMode.after}`);

// 12.12 过热：十一年式打满 overheatShots 强制冷却
const overheat = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const s2 = T.ai.soldiers.find((x) => x.alive && x.side === "ija");
  if (!s2) return { none: true };
  s2.weaponId = "Type11";
  s2.weapon = { magazine: 30, fireIntervalS: 0.12, reloadTimeS: 5.2,
    overheatShots: 200, coolDownS: 8.0, aiAccuracy: 0.5, aiAimTimeS: 0,
    effectiveRangeM: 600, damage: 66, kind: "lmg" };
  s2.target = { position: { x: s2.position.x + 30, y: s2.position.y, z: s2.position.z },
    isPlayer: false, ref: null };
  s2.targetVisible = true;
  // TryFire 现在有枪口方向闸门；规则层直调靶场先把身体转向目标。
  s2.yaw = -Math.PI * 0.5;
  s2.heat = 0; s2.coolUntil = -99;     // 从干净的枪管开始数，"两百发"才是确定的
  const Drive = () => {
    const before = T.ai.fireCount;
    s2.ammo = 30; s2.fireTimer = 0; s2.aimTime = 9; s2.suppression = 0;
    T.ai.TryFire(s2, 0.05, T.player);
    return T.ai.fireCount - before;
  };
  let shots = 0, iterations = 0;
  while (iterations < 500 && s2.coolUntil <= T.ai.time) { shots += Drive(); iterations += 1; }
  const coolFor = s2.coolUntil - T.ai.time;
  let duringCool = 0;
  for (let i = 0; i < 300; i += 1) duringCool += Drive();
  return { shots, coolFor, duringCool };
});
Check("十一年式打满两百发强制冷却，冷却期间一发也打不出去",
  !overheat.none && overheat.shots === 200 && overheat.coolFor > 7.5 && overheat.duringCool === 0,
  `打了 ${overheat.shots} 发，冷却 ${overheat.coolFor?.toFixed(1)} s，冷却期间 ${overheat.duringCool} 发`);

// 12.13 标准 FPS 瞄准：默认自由瞄准为 0，鼠标直接转相机与弹道。
const freeAim = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.player.aimYaw = 0; T.player.yaw = 0; T.player.ads = 0;
  for (let i = 0; i < 10; i += 1) {
    T.player.Update(1 / 60, { forward: 0, strafe: 0, sprint: false, ads: false, lean: 0,
      lookX: 12, lookY: 0, crouchPressed: false, pronePressed: false, breathHold: false, sensitivity: 1 }, null);
  }
  return {
    deg: D.Difficulty().freeAimDeg,
    autoSurrender: D.Difficulty().autoSurrender,
    aimYaw: Math.abs(T.player.aimYaw), yaw: Math.abs(T.player.yaw),
  };
});
Check("默认自由瞄准为 0°，鼠标直接转相机",
  freeAim.deg === 0 && freeAim.aimYaw < 1e-6 && freeAim.yaw > 1e-4,
  `freeAimDeg=${freeAim.deg}，aimYaw=${freeAim.aimYaw.toFixed(4)} rad / yaw=${freeAim.yaw.toFixed(4)} rad`);
Check("玩家永不自动投降：difficulty.autoSurrender 恒 false",
  freeAim.autoSurrender === false, `autoSurrender=${freeAim.autoSurrender}`);

// 12.13b 微动必须直接转视线，不能先让枪和 HUD 准心在画面里游动。
// 测三件事：枪体不积累自由瞄准偏移、鼠标到视线是 1:1、停手后瞄准点不漂。
const micro = await page.evaluate(() => {
  const T = window.Taierzhuang, P = T.player, DEG = 180 / Math.PI;
  // 这一段要推四秒的真帧，中途挨死了 Update 会整帧早退（aimYaw 冻住）——
  // 那样测的就不是瞄准了。出生保护期正是为这种情况留的：吃压制不吃伤。
  // 两脚架架着时转向只剩三成（12.10 把它架起来了就没收），开镜也压 55% ——
  // 那两条都是**故意**的转向代价，量在这里会把它们当成 bug。先收干净。
  const Keep = () => {
    P.health = 100; P.spawnGrace = 9; P.suppression = 0;
    P.bipod = false; P.ads = 0; T.input.ads = false;
  };
  const Push = (counts, frames) => {
    Keep();
    P.yaw = 0; P.pitch = 0; P.aimYaw = 0; P.aimPitch = 0; P.lookIdle = 0;
    T.StepFrames(2);
    P.yaw = 0; P.aimYaw = 0;
    for (let i = 0; i < frames; i += 1) { T.input.lookX += counts; T.StepFrames(1); }
    return {
      mouseDeg: counts * frames * 0.0022 * DEG,
      aimedDeg: Math.abs(P.yaw + P.aimYaw) * DEG,
      gunDeg: Math.abs(P.aimYaw) * DEG,
      vmDeg: Math.abs(T.viewmodel.root.rotation.y) * DEG,
    };
  };
  const tiny = Push(1, 8);            // 八个鼠标计数 ≈ 1°，全在自由瞄准锥里
  const slow = Push(1, 120);          // 60 count/s 推两秒：锥顶满，其余交给视线
  // 手停之后：枪回到画面中间，但瞄准点一步都不许漂
  const aimed0 = P.yaw + P.aimYaw;
  Keep();
  T.StepFrames(90);
  return { tiny, slow, parkedDeg: slow.gunDeg,
    settledGunDeg: Math.abs(P.aimYaw) * DEG,
    driftDeg: Math.abs((P.yaw + P.aimYaw) - aimed0) * DEG };
});
Check("微动 1° 直接转相机，枪体不偏离屏幕中心",
  micro.tiny.vmDeg < 0.01 && micro.tiny.gunDeg < 0.01,
  `枪口偏 ${micro.tiny.gunDeg.toFixed(3)}°，视图模型转了 ${micro.tiny.vmDeg.toFixed(3)}°`);
Check("鼠标到枪口 1:1：锥内锥外都不打折",
  Math.abs(micro.tiny.aimedDeg - micro.tiny.mouseDeg) < micro.tiny.mouseDeg * 0.02
  && Math.abs(micro.slow.aimedDeg - micro.slow.mouseDeg) < micro.slow.mouseDeg * 0.02,
  `微动 ${micro.tiny.mouseDeg.toFixed(2)}°→${micro.tiny.aimedDeg.toFixed(2)}°；`
  + `慢推 ${micro.slow.mouseDeg.toFixed(2)}°→${micro.slow.aimedDeg.toFixed(2)}°`);
Check("停手后枪体仍在中心，瞄准点不自己漂",
  micro.parkedDeg < 0.01 && micro.settledGunDeg < 0.01 && micro.driftDeg < 0.01,
  `枪 ${micro.parkedDeg.toFixed(2)}°→${micro.settledGunDeg.toFixed(2)}°，瞄准点漂 ${micro.driftDeg.toFixed(4)}°`);

// 12.13c 走路观察不能再经过自由瞄准死区（2026-08-20，用户报「持枪走路移动镜头有粘滞感」）
// 静止时 2° 自由瞄准仍保留；只要 WASD 有移动输入，鼠标的第一帧就必须直接转相机。
const walkingLook = await page.evaluate(() => {
  const P = window.Taierzhuang.player;
  const input = { forward: 1, strafe: 0, sprint: false, ads: false, lean: 0,
    lookX: 8, lookY: -4, crouchPressed: false, pronePressed: false,
    breathHold: false, sensitivity: 1 };
  P.health = 100; P.spawnGrace = 9; P.suppression = 0; P.bipod = false; P.ads = 0;
  P.yaw = 0; P.pitch = 0; P.aimYaw = 0; P.aimPitch = 0; P.lookIdle = 0;
  P.Update(1 / 60, input, null);
  return {
    expectedYaw: -input.lookX * 0.0022,
    expectedPitch: -input.lookY * 0.0022,
    yaw: P.yaw, pitch: P.pitch, aimYaw: P.aimYaw, aimPitch: P.aimPitch,
  };
});
Check("持枪走路时鼠标第一帧直接转相机，不再卡在自由瞄准锥里",
  Math.abs(walkingLook.yaw - walkingLook.expectedYaw) < 1e-6
  && Math.abs(walkingLook.pitch - walkingLook.expectedPitch) < 1e-6
  && Math.abs(walkingLook.aimYaw) < 1e-6 && Math.abs(walkingLook.aimPitch) < 1e-6,
  `yaw ${walkingLook.yaw.toFixed(5)} / ${walkingLook.expectedYaw.toFixed(5)}，`
  + `pitch ${walkingLook.pitch.toFixed(5)} / ${walkingLook.expectedPitch.toFixed(5)}，`
  + `freeAim=(${walkingLook.aimYaw.toFixed(5)}, ${walkingLook.aimPitch.toFixed(5)})`);

// 12.14 停摆检查：三百秒分段看开火，后一半必须还有仗打。
// 这一条是独立复核逼出来的：上一批的断言只数头六十秒，而实跑里仗打到九十秒就停，
// 之后 AI 状态精确回到 {advance: 70}，胜负改由占点消耗的时钟单方面决定 ——
// 断言全过而停摆完全看不见。窗口必须盖满三百秒。
Stage("12.14 三百秒停摆检查（约四分钟）");
await Boot(2, "medium");
const soak300 = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  const spawnZ = [];
  const realSpawn = T.ai.Spawn.bind(T.ai);
  const lb = T.ai.insideWalls;
  let outsideCount = 0;
  T.ai.Spawn = (side, x, z, o) => {
    if (side === "ija") {
      spawnZ.push(z);
      if (x < lb.minX || x > lb.maxX || z < lb.minZ || z > lb.maxZ) outsideCount += 1;
    }
    return realSpawn(side, x, z, o);
  };
  const seg = [];
  let prev = D.FireCount();
  // 目标链有没有在动：停摆的另一个面相是"仗还在打但玩家永远推不动"
  const reached0 = D.Level().objectiveIndex;
  for (let i = 0; i < 15; i += 1) {
    T.StepFrames(20 * 60, 1 / 60, false);
    const now = D.FireCount();
    seg.push(now - prev);
    prev = now;
  }
  const reached1 = D.Level().objectiveIndex;
  T.ai.Spawn = realSpawn;
  return {
    seg, reached0, reached1,
    first60: seg[0] + seg[1] + seg[2],
    back150: seg.slice(7).reduce((a, b) => a + b, 0),
    backSegments: seg.slice(7).filter((v) => v > 0).length,
    spawns: spawnZ.length,
    // 撒兵有没有跑出本关切片。台儿庄那一版查的是「北寨墙外」（z < -190），
    // 滕县七关各有各的切片，所以判据换成通用的：落在 levelBounds 之外就算错。
    outside: outsideCount,
  };
});
Check("头六十秒全场开火 > 200", soak300.first60 > 200, `开了 ${soak300.first60} 枪`);
Check("后一百五十秒仗还在打（不是打两分钟就停摆）",
  soak300.backSegments >= 2 && soak300.back150 > 20,
  `每 20 s：${soak300.seg.join("/")}；后半段 ${soak300.back150} 枪、${soak300.backSegments}/8 段有火力`);
Check("日方补兵不会落在本关切片外面", soak300.outside === 0,
  `${soak300.spawns} 次生成，界外 ${soak300.outside} 次`);

// 12.15 导航网格：本关的路标都走得到。
// 鲁南民居对外不开窗、四面围墙，路标圆心完全可能落在一个封闭院落里 ——
// 那时圆心直接做 BFS 起点只能淹到零点几个百分点的可走面积，
// 必须被吸附到主连通分量上，否则这一关拿不到任何导航信息，AI 全线撞墙。
const navStats = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const stats = T.nav.Stats();
  const rows = [];
  for (const o of T.battlefield.objectives) {
    // BFS 现在是跨帧摊的（Script_Navigation 头注）：不带 force 的话每张场要好几个
    // BeginFrame 才算完，量到的 0% 是没摊完，不是走不到。连通率要同步算满。
    T.nav.BeginFrame();
    const field = T.nav.FieldFor(o.x, o.z, true);
    let reach = 0;
    if (field) for (let i = 0; i < field.dist.length; i += 1) if (field.dist[i] >= 0) reach += 1;
    rows.push({ id: o.id, pct: +(reach / stats.open * 100).toFixed(1) });
  }
  return { stats, rows, worst: Math.min(...rows.map((r) => r.pct)) };
});
Check("每个路标都能从本关大部分地方走到（导航场连通）",
  navStats.worst > 40,
  `最差 ${navStats.worst}%；` + navStats.rows.map((r) => `${r.id} ${r.pct}%`).join(" "));


// ===========================================================================
// 13) ER2 对齐第 3 批：翻越 / 上墙 / 下水软墙 / 拾枪拾弹 / 径向轮盘 / 姿态传染
//
// 这一批加的是**动词**，而动词最容易做成"按下去有动画但世界没变"。所以每一条都
// 从运行时状态取证：翻越要看人真的到了墙的另一面，上墙要看脚下高程真的到了 4 m，
// 下水要拿同一秒的位移跟岸上对照，捡枪要看槽位里的枪 id 真的换了，
// 轮盘要走真的键盘事件与真的 mousemove 事件，潜行要看受令者的姿态跟着班长变。
// ===========================================================================
Stage("13 第 3 批：翻越 / 上墙 / 下水 / 拾取 / 轮盘 / 潜行");
// **必须在城里那一章测。** 第一章是城外原野 —— 没有院墙可翻、没有上城道可爬、
// 没有护城河可下。在那儿跑这一组，四条会一起报「没找到马道/没找到可翻的墙/淹 0 m」，
// 而那不是回归，是选错了章。
// 第三章（救护所）同时有这三样：东门旁的上城道、城内的四合院、东濠。
await Boot(3, "small");

// 13.1 马道：从坡脚一路走到墙顶（4 m），中途不许被卡住
const ramp = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const bf = T.battlefield;
  const all = bf.colliders.filter((b) => b.tag === "ramp");
  if (!all.length) return { none: true };
  // 切片里可能同时有两条上城道（东门旁与南门旁）。**必须先聚类**，
  // 否则"最低的一级"和"最高的一级"会取自两条不同的坡，推出来的方向指向斜刺里。
  const Center = (b) => [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2];
  // **只挑坡脚落在关卡可行走边界内的那条**。切片里会有边界外的马道，
  // 而 MoveWithCollision 结尾会把玩家钳回 bounds 内 —— 选中界外那条的话，
  // 玩家一辈子够不着它，用例测的是钳位不是台阶。
  // （这条是实测出来的：选中的坡脚 footInBounds=false，玩家被钉在 13 m 外。）
  const b0 = bf.bounds;
  const inB = (bx, bz) => !b0 || (bx > b0.minX + 1 && bx < b0.maxX - 1
    && bz > b0.minZ + 1 && bz < b0.maxZ - 1);
  const reachable = all.filter((b) => { const [cx, cz] = Center(b); return inB(cx, cz); });
  const pool = reachable.length ? reachable : all;
  const lowest = pool.reduce((a, b) => (a.max[1] < b.max[1] ? a : b));
  const [lx, lz] = Center(lowest);
  const steps = pool.filter((b) => {
    const [cx, cz] = Center(b);
    return Math.hypot(cx - lx, cz - lz) < 45;
  });
  const top = steps.reduce((a, b) => (a.max[1] > b.max[1] ? a : b));
  const [tx, tz] = Center(top);
  let dx = tx - lx, dz = tz - lz;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len; dz /= len;
  T.player.Spawn(lx - dx * 2.5, lz - dz * 2.5, Math.atan2(-dx, -dz));
  const y0 = T.player.position.y;
  const idle = { forward: 1, strafe: 0, sprint: false, ads: false, lean: 0,
    lookX: 0, lookY: 0, crouchPressed: false, pronePressed: false, breathHold: false, sensitivity: 1 };
  let peak = -99;
  // **每帧重新对准坡顶**，不是设一次 yaw 就一路直走。
  // 原来那个写法测不到东西：实测玩家一路在**远离**马道（离最低一级 10.5 m 走到 29.4 m），
  // 全程 y=0，中间被当时碰撞解算的一个 bug 弹上墙一帧（5.30 m），
  // peak>4 就这么"过"了 —— 它从来没真的走上过马道。
  // 修掉那个 bug 之后这条立刻红了，红得对。
  for (let i = 0; i < 420; i += 1) {
    const ax = tx - T.player.position.x, az = tz - T.player.position.z;
    if (Math.hypot(ax, az) > 0.8) T.player.yaw = Math.atan2(-ax, -az);
    T.player.Update(1 / 60, idle, null);
    if (T.player.position.y > peak) peak = T.player.position.y;
  }
  // 城自己的连通性自检：从城里起洪，看有几段能淌到 11.5 m 的墙顶，
  // 以及**把上城道全摘掉之后还剩几段**（剩下的就是第五条上墙的路 = 事故）。
  const corridor = bf.CheckWallCorridor();
  return { steps: steps.length, y0: +y0.toFixed(2), peak: +peak.toFixed(2),
    topY: +top.max[1].toFixed(2), corridor };
});
// 两条断言，分工不同：
//  · 台阶走得上去 —— 直着走只能上到转折平台（上城道中段有一个折返平台，
//    见 Data_Tengxian.RAMP.landingAt），所以判据是"离地四米以上"而不是"到墙顶"。
//    要一路走到顶得在平台上转向，那是玩家的事，不是这条回归要验的。
//  · **全城只有四条上城道** —— 这条空间规则是第四、五关的关卡前提，
//    用城自己的泛洪自检验：摘掉马道之后一段都不许能淌到墙顶。
Check("上城道是能走上去的台阶（直着走上到转折平台）",
  !ramp.none && ramp.steps >= 8 && ramp.peak > 4.0,
  ramp.none ? "没找到上城道台阶"
    : `${ramp.steps} 级台阶，${ramp.y0} m -> 最高 ${ramp.peak} m（坡顶 ${ramp.topY} m）`);
Check("没有第五条上墙的路（摘掉马道之后墙顶一段都淌不到）",
  !ramp.none && ramp.corridor.leakSpan === 0 && ramp.corridor.topReachableSpan > 0,
  ramp.none ? "没找到上城道台阶"
    : `可达墙顶 ${ramp.corridor.topReachableSpan} m / ${ramp.corridor.topSegments} 段，`
      + `漏洞 ${ramp.corridor.leakSpan} m`);


// 13.2 翻越：真的翻到墙的另一面去了。
// 一次成功可能是运气，所以扫四十堵真墙统计成功率。
const vault = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  const bf = T.battlefield;
  const TR = D.Traversal();
  const cands = [];
  for (const b of bf.colliders) {
    const w = b.max[0] - b.min[0], d = b.max[2] - b.min[2];
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const h = b.max[1] - bf.GroundHeight(cx, cz);
    // 院墙那一档：自动抬腿到不了，但还在通行阶梯的硬顶之下（Data_Traversal）。
    // 高过 mantleMax 的墙**本来就该翻不过去**，拿它算成功率是在给规范挑刺。
    if (h < 1.0 || h > TR.mantleMax) continue;
    const thinX = w < 0.6 && d > 2, thinZ = d < 0.6 && w > 2;
    if (!thinX && !thinZ) continue;
    cands.push({ cx, cz, thinX, h, tag: b.tag });
  }
  const tries = [];
  for (const c of cands.slice(0, 40)) {
    const nx = c.thinX ? 1 : 0, nz = c.thinX ? 0 : 1;
    T.player.Spawn(c.cx - nx * 0.75, c.cz - nz * 0.75, 0);
    T.player.yaw = Math.atan2(-nx, -nz);              // 正对着墙
    const before = D.Vault().count;
    D.Key("Space");                                    // 走完整条键位链路，不直接调 TryVault
    T.StepFrames(80);
    const v = D.Vault();
    // 起跳前在墙的负侧，落地必须在正侧 —— 这是"真的过去了"唯一算数的证据
    const crossed = (v.x - c.cx) * nx + (v.z - c.cz) * nz;
    tries.push({ tag: c.tag, h: +c.h.toFixed(2), fired: v.count > before, crossed: +crossed.toFixed(2) });
  }
  // 空地上按 Space 走跳跃分支，不能误触发翻越。
  T.player.Spawn(0, 60, 0);
  for (let k = 0; k < 40 && !T.player.Alive; k += 1) T.StepFrames(60);
  const openBefore = D.Vault().count;
  const jumpBefore = D.Jump().count;
  const staminaBefore = T.player.stamina;
  const y0 = T.player.position.y;
  D.Key("Space");
  let peak = y0, sawAir = false, viewMin = Infinity, viewMax = -Infinity;
  let staminaAfterTakeoff = staminaBefore;
  for (let k = 0; k < 70; k += 1) {
    T.StepFrames(1);
    const j = D.Jump();
    if (k === 0) staminaAfterTakeoff = T.player.stamina;
    peak = Math.max(peak, j.y);
    sawAir ||= !j.grounded;
    viewMin = Math.min(viewMin, j.viewPitch);
    viewMax = Math.max(viewMax, j.viewPitch);
  }
  const jump = D.Jump();
  return {
    tried: tries.length, good: tries.filter((t) => t.fired && t.crossed > 0.2).length,
    sample: tries.filter((t) => t.fired && t.crossed > 0.2).slice(0, 2),
    openGround: D.Vault().count - openBefore,
    jumpCount: jump.count - jumpBefore,
    rise: +(peak - y0).toFixed(3), sawAir, landed: jump.grounded,
    staminaCost: +(staminaBefore - staminaAfterTakeoff).toFixed(3),
    viewTravel: +(viewMax - viewMin).toFixed(3), landSerial: jump.landSerial,
  };
});
Check("翻越：对着院墙按 Space 真的翻到墙那一面（四十堵墙的成功率）",
  vault.good >= vault.tried * 0.6 && vault.tried >= 20,
  `${vault.good}/${vault.tried} 堵翻过去了，例：`
  + vault.sample.map((t) => `${t.tag} 高 ${t.h} m 越过 ${t.crossed} m`).join(" / "));
Check("空地 Space 是受限跳跃，不会误触翻越",
  vault.openGround === 0 && vault.jumpCount === 1 && vault.sawAir && vault.landed
  && vault.rise > 0.42 && vault.rise < 0.68,
  `翻越 +${vault.openGround} / 跳跃 +${vault.jumpCount} / 抬高 ${vault.rise} m / 落地 ${vault.landed}`);
Check("跳跃有体力成本，并驱动起跳—下落视图动作",
  vault.staminaCost > 0.02 && vault.viewTravel > 0.08 && vault.landSerial > 0,
  `净体力 ${vault.staminaCost} / 枪身俯仰行程 ${vault.viewTravel} rad / 落地边沿 ${vault.landSerial}`);

// 13.3 翻越途中不许开火
const vaultFire = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  const bf = T.battlefield;
  // 不能拿"第一堵符合条件的墙"就开测：四十堵里有三堵因为墙那边没地方落脚翻不过去
  // （那是对的行为），碰上那种就变成在测"没起跳时能不能开枪"。所以找到**真的起跳了**
  // 的那一堵为止。
  const cands = bf.colliders.filter((c) => {
    const w = c.max[0] - c.min[0], d = c.max[2] - c.min[2];
    const h = c.max[1] - bf.GroundHeight((c.min[0] + c.max[0]) / 2, (c.min[2] + c.max[2]) / 2);
    return h > 1.2 && h < 2.2 && ((w < 0.6 && d > 2) || (d < 0.6 && w > 2));
  });
  let busy = false, tried = 0;
  for (const b of cands.slice(0, 25)) {
    const thinX = (b.max[0] - b.min[0]) < 0.6;
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const nx = thinX ? 1 : 0, nz = thinX ? 0 : 1;
    T.player.Spawn(cx - nx * 0.75, cz - nz * 0.75, 0);
    T.player.yaw = Math.atan2(-nx, -nz);
    tried += 1;
    D.Key("Space");
    T.StepFrames(4);
    busy = D.Vault().active;
    if (busy) break;
  }
  if (!busy) return { none: true, tried };
  T.state.ammo = 5;
  const ammo0 = T.state.ammo;
  D.Fire();                                   // 半空中扣扳机
  const ammo1 = T.state.ammo;
  T.StepFrames(90);                           // 落地之后再来一发，证明只是被翻越挡住
  T.state.ammo = 5;
  const ammo2 = T.state.ammo;
  D.Fire();
  return { busy, tried, ammo0, ammo1, landed: !D.Vault().active, ammo2, ammo3: T.state.ammo };
});
Check("翻越途中打不出枪，落地就能打",
  !vaultFire.none && vaultFire.busy && vaultFire.ammo1 === vaultFire.ammo0
  && vaultFire.landed && vaultFire.ammo3 < vaultFire.ammo2,
  vaultFire.none ? "没找到可翻的墙"
    : `半空 ${vaultFire.ammo0}->${vaultFire.ammo1}，落地 ${vaultFire.ammo2}->${vaultFire.ammo3}`);

// 13.4 下水软墙：慢四倍、打不了枪。
// 换城之后水从运河变成**护城河**：宽 10.5 m、深 4.8 m、水面 −1.6 m，
// 志载「1 丈 5 尺」与日方实测 5 m 双源吻合。濠底到墙顶总落差 16.3 m ——
// 这条濠是滕县城防的第一层，不是装饰。
const water = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  const M = 318 + 10.5 / 2;                     // 濠心：内岸 318 + 半宽
  const idle = (f) => ({ forward: f, strafe: 0, sprint: false, ads: false, lean: 0,
    lookX: 0, lookY: 0, crouchPressed: false, pronePressed: false, breathHold: false, sensitivity: 1 });
  T.player.Spawn(150, M, 0);                    // 南濠正中（x 取在本关切片里）
  T.player.health = 100;
  T.player.Update(1 / 60, idle(0), null);
  const w = D.Water();
  const p0 = { x: T.player.position.x, z: T.player.position.z };
  for (let i = 0; i < 60; i += 1) T.player.Update(1 / 60, idle(1), null);
  const wet = Math.hypot(T.player.position.x - p0.x, T.player.position.z - p0.z);
  T.state.ammo = 5;
  const ammo0 = T.state.ammo;
  D.Fire();
  const ammo1 = T.state.ammo;
  // 对照组：同样一秒的岸上位移（城内顺城街上）
  T.player.Spawn(150, 260, 0);
  const p1 = { x: T.player.position.x, z: T.player.position.z };
  for (let i = 0; i < 60; i += 1) T.player.Update(1 / 60, idle(1), null);
  const dry = Math.hypot(T.player.position.x - p1.x, T.player.position.z - p1.z);
  // 城里的地坪上不许判成水（判错的话玩家在街上走不动，而且完全看不出为什么）
  const street = T.battlefield.WaterDepth(150, 260, T.battlefield.GroundHeight(150, 260));
  return { depth: +w.depth.toFixed(2), inWater: w.inWater, wet: +wet.toFixed(2),
    dry: +dry.toFixed(2), ammo0, ammo1, street };
});
Check("下护城河：速度掉到岸上的四分之一上下，且开不了枪",
  water.inWater && water.depth > 0.35 && water.wet < water.dry * 0.35
  && water.ammo1 === water.ammo0,
  `淹 ${water.depth} m，一秒走 ${water.wet} m（岸上 ${water.dry} m），弹药 ${water.ammo0}->${water.ammo1}`);
Check("城内地坪不算下水", water.street === 0, `顺城街淹没深度 ${water.street}`);

// 13.5 F 拾枪：从尸体上捡三八式，且缴获日械没有备弹
const pickup = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  T.state.spawnAccumulator = -1e6;
  for (const s2 of T.ai.soldiers) {
    if (s2.side === "ija") s2.position.set(s2.position.x + 400, s2.position.y, s2.position.z + 400);
  }
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  const victim = T.ai.soldiers.find((s2) => s2.alive && s2.side === "ija");
  if (!victim) return { none: true };
  victim.weaponId = "Type38";
  victim.position.set(T.player.position.x + 1.0, T.player.position.y, T.player.position.z);
  victim.Kill();
  T.StepFrames(2);
  const before = D.Interact();
  D.Key("KeyF");                       // 走键位表，不直接调 interact.Perform
  T.StepFrames(4);
  const after = D.Interact();
  return { before, after, ammo: D.Ammo(), slots: D.Slots() };
});
Check("按 F 能从尸体上捡起那支枪（槽位与手上的枪都换了）",
  !pickup.none && pickup.before.kind === "pickup" && pickup.after.pickups === 1
  && pickup.after.weapon === "Type38" && pickup.slots.slots.primary === "Type38",
  pickup.none ? "场上没有日军"
    : `${pickup.before.label} -> 手上是 ${pickup.after.weapon}，1 号槽 ${pickup.slots.slots.primary}`);
Check("缴获日械只有枪里那五发（六五口径我们没有补给）",
  !pickup.none && pickup.ammo.ammo === 5 && pickup.ammo.clips === 0,
  `ammo=${pickup.ammo.ammo} 桥夹=${pickup.ammo.clips}`);

// 13.5b F 拾刀：大刀也必须是尸体上的真实装备，并且带走同一外观变体。
const dadaoPickup = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  const victim = T.ai.soldiers.find((s2) => s2.alive && s2.side === "nra");
  if (!victim) return { none: true };
  victim.weaponId = "Dadao";
  victim.actor?.SetWeapon("Dadao");
  victim.position.set(T.player.position.x + 1.0, T.player.position.y, T.player.position.z);
  T.state.slots.melee = null;
  T.state.weaponVariants.melee = 0;
  victim.Kill();
  // 明确选第二式样，验证掉落数据而不是哈希刚好抽到哪一把。
  victim.drop.weaponVariant = 1;
  T.StepFrames(2);
  const before = D.Interact();
  D.Key("KeyF");
  T.StepFrames(4);
  return { before, after: D.Interact(), slots: D.Slots() };
});
Check("按 F 能从尸体上拾起大刀，并保留第二式样",
  !dadaoPickup.none && dadaoPickup.before.kind === "pickup"
  && dadaoPickup.after.pickedUp === "Dadao" && dadaoPickup.after.pickedUpVariant === 1
  && dadaoPickup.slots.active === "melee" && dadaoPickup.slots.slots.melee === "Dadao"
  && dadaoPickup.slots.variants.melee === 1 && dadaoPickup.slots.viewmodel === "Dadao"
  && dadaoPickup.slots.viewmodelVariant === 1,
  dadaoPickup.none ? "场上没有可用于掉落的大刀兵"
    : `${dadaoPickup.before.label} -> 3号槽 ${dadaoPickup.slots.slots.melee} 式样 ${dadaoPickup.slots.variants.melee}`);

// 13.6 F 分弹药给打光了的弟兄
const handout = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  const mate = T.ai.soldiers.find((s2) => s2.alive && s2.side === "nra");
  if (!mate) return { none: true };
  // 让尸体那条分支让开：把刚才那具尸体挪远
  for (const s2 of T.ai.soldiers) {
    if (!s2.alive) s2.position.set(s2.position.x + 300, s2.position.y, s2.position.z + 300);
  }
  mate.position.set(T.player.position.x + 1.2, T.player.position.y, T.player.position.z);
  mate.ammo = 0;
  T.state.clips = 4;
  const before = D.Interact();
  const clips0 = T.state.clips;
  D.Key("KeyF");
  T.StepFrames(2);
  return { before, after: D.Interact(), clips0, clips1: T.state.clips, mateAmmo: mate.ammo };
});
Check("按 F 能把一个桥夹分给弹尽的弟兄（自己少一个，他满上）",
  !handout.none && handout.before.kind === "ammo" && handout.after.handouts === 1
  && handout.clips1 === handout.clips0 - 1 && handout.mateAmmo > 0,
  handout.none ? "身边没有弟兄"
    : `桥夹 ${handout.clips0}->${handout.clips1}，他的弹仓 0->${handout.mateAmmo}`);

// 13.7 Tab 径向轮盘：按住出盘、推鼠标指格、松手下令。
// 键走 KEYMAP，鼠标走真的 mousemove 事件 —— 指针锁下拿不到 clientX/Y 但 movementX/Y 照常送达，
// 所以轮盘只认位移增量，这一条正是它能在指针锁里工作的原因。
const wheelRun = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  const Move = (dx, dy) => document.dispatchEvent(
    new MouseEvent("mousemove", { movementX: dx, movementY: dy, bubbles: true }));
  D.Key("Tab", true);
  const opened = D.Orders();
  Move(0, -90);                       // 正上方 = 第 1 格
  const up = D.Orders();
  Move(0, 180);                       // 推到正下方 = 另一格
  const down = D.Orders();
  D.Key("Tab", false);                // 松手：把指着的那一格下出去
  const after = D.Orders();
  return { opened, up, down, after };
});
Check("按住 Tab 出径向轮盘，推鼠标能指到不同的格",
  wheelRun.opened.open && wheelRun.opened.index === -1
  && wheelRun.up.index === 0 && wheelRun.down.index !== wheelRun.up.index,
  `打开时 index=${wheelRun.opened.index}，上=${wheelRun.up.label}，下=${wheelRun.down.label}`);
Check("松开 Tab 把指着的那条命令真的下出去了",
  !wheelRun.after.open && wheelRun.after.order === wheelRun.down.label,
  `当前命令：${wheelRun.after.order}（松手时指着 ${wheelRun.down.label}）`);

// 13.8 F 不再是叫炮：叫炮进了轮盘第 8 格
const mortar = await page.evaluate(() => {
  const T = window.Taierzhuang, D = T.Debug;
  const Move = (dx, dy) => document.dispatchEvent(
    new MouseEvent("mousemove", { movementX: dx, movementY: dy, bubbles: true }));
  for (let k = 0; k < 8 && !T.player.Alive; k += 1) T.StepFrames(200);
  T.player.health = 100;
  const left0 = T.combat.MortarLeft;
  D.Key("KeyF"); T.StepFrames(2);
  const afterF = T.combat.MortarLeft;
  // 轮盘第 8 格「要炮」：数字键直选是轮盘的兜底通道，一样走 KEYMAP
  D.Key("Tab", true);
  Move(0, -90);
  D.Key("Digit8");
  T.StepFrames(2);
  const afterWheel = T.combat.MortarLeft;
  D.Key("Tab", false);
  T.StepFrames(2);
  return { left0, afterF, afterWheel, afterRelease: T.combat.MortarLeft };
});
Check("F 不再是叫炮（迫击炮挪进 Tab 轮盘的「要炮」格）",
  mortar.afterF === mortar.left0 && mortar.afterWheel === mortar.left0 - 1
  && mortar.afterRelease === mortar.afterWheel,
  `按 F 剩 ${mortar.afterF} 发（原 ${mortar.left0}），轮盘要炮后剩 ${mortar.afterWheel}`);

// 13.9 姿态传染（Covert Movements）：跟着班长的姿态走，而且不开枪
const covert = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const near = T.ai.soldiers.filter((s2) => s2.alive && s2.side === "nra").slice(0, 5);
  if (near.length < 3) return { none: true };
  for (const s2 of near) {
    s2.position.copy(T.player.position);
    s2.holdZone = null; s2.stance = 0; s2.order = "advance";
    // 【2026-08-26】血垫到打不死：五个人被摆在玩家脚下的开阔地上趴八秒，敌火照打
    //（实测干净开局八秒后五人余血只剩 6~29）。死在起立窗口里的兵 stance 永远停在 2，
    // 断言红的却是「姿态传染坏了」。与 11.6 击杀回执同一类零余量竞态，同一个修法 ——
    // 传染逻辑本身照测不误，只把「谁被流弹打死」这个环境变量拿掉。
    s2.health = 1e9;
  }
  T.player.stance = "prone";
  const n = T.ai.IssueOrder("covert", T.player.position, null);
  T.StepFrames(240);                         // 4 s，Think 每 0.1 s 轮到一次
  const prone = near.filter((s2) => s2.stance === 2).length;
  const t = T.ai.time;
  const fired = near.filter((s2) => t - s2.lastFire < 4).length;
  // 班长站起来，全班跟着站起来 —— 这才叫传染，不是"一次性趴下"
  T.player.stance = "stand";
  T.StepFrames(240);
  const stood = near.filter((s2) => s2.stance === 0).length;
  return { n, prone, stood, fired, count: near.length };
});
Check("潜行：全班跟着班长的姿态（趴下/起立都跟）",
  !covert.none && covert.prone === covert.count && covert.stood === covert.count,
  covert.none ? "身边人不够"
    : `受令 ${covert.n} 人；班长趴下时 ${covert.prone}/${covert.count} 卧倒，起立后 ${covert.stood}/${covert.count} 站起`);
Check("潜行期间受令者一枪不开", !covert.none && covert.fired === 0,
  `四秒内开过枪的 ${covert.fired}/${covert.count} 人`);

// 13.10 姿态决定被发现的距离：站 120 / 蹲 80 / 卧 45 m
const sight = await page.evaluate(() => {
  const T = window.Taierzhuang;
  // 城外空地上摆一对：城里随便哪条 60 m 射线都会撞墙，量到的会是通视不是视距
  const observer = T.ai.soldiers.find((s2) => s2.alive && s2.side === "nra");
  const enemy = T.ai.soldiers.find((s2) => s2.alive && s2.side === "ija");
  if (!observer || !enemy) return { none: true };
  // 其余日军挪走：留一个人在场上，量到的才是"这一个目标看不看得见"，
  // 而不是"这一带还有没有别的目标"
  for (const s2 of T.ai.soldiers) {
    if (s2.side === "ija" && s2 !== enemy) s2.position.set(s2.position.x + 600, s2.position.y, s2.position.z + 600);
  }
  observer.state = "idle";
  const ox = 0, oz = -215;
  observer.position.set(ox, T.battlefield.GroundHeight(ox, oz), oz);
  observer.stance = 0;
  const Probe = (stance, gap) => {
    enemy.position.set(ox + gap, T.battlefield.GroundHeight(ox + gap, oz), oz);
    enemy.stance = stance;
    observer.target = null;
    observer.targetLostTime = 99;
    for (const e of observer.losCache) { e.id = 0; e.time = -99; }
    T.ai.Think(observer, 3, T.player);
    return !!observer.target;
  };
  return {
    standAt60: Probe(0, 60), proneAt60: Probe(2, 60),
    proneAt30: Probe(2, 30), standAt110: Probe(0, 110),
  };
});
Check("姿态决定被发现的距离：60 m 上站着的看得见、趴着的看不见，30 m 上趴着的照样看得见",
  !sight.none && sight.standAt60 && !sight.proneAt60 && sight.proneAt30,
  sight.none ? "场上人不够"
    : `站@60=${sight.standAt60} 卧@60=${sight.proneAt60} 卧@30=${sight.proneAt30} 站@110=${sight.standAt110}`);

// 13.11 AI 也会翻墙：不给它开这一条，玩家翻墙抄后路就是单方面作弊
Stage("13.11 AI 翻越（一分钟）");
await Boot(2, "medium");
const aiVault = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const v0 = T.ai.vaultCount;
  T.StepFrames(60 * 60, 1 / 60, false);
  return { v0, v1: T.ai.vaultCount, alive: T.ai.aliveCount };
});
Check("AI 一分钟里真的翻过墙（这个动词不是玩家专属）",
  aiVault.v1 - aiVault.v0 > 0,
  `六十秒翻了 ${aiVault.v1 - aiVault.v0} 次（活人 ${aiVault.alive}）`);


// ===========================================================================
// 14) 换模：卢沟桥资产烘焙出的蒙皮 GLB 有没有真的顶上来
//
// 为什么这一节必须存在：换模最舒服的失败方式是**静默降级** —— 模型 404、
// 关节名对不上、材质桶认错，加载器一律 warn + 返回 null，页面照跑、画面照出，
// 只是人还是原来那堆方块。光看截图分不出"模型糙"和"根本没换"，所以这里一律
// 从运行时取证：源头是不是 Lugou GLB、骨骼挂点在不在、单人 draw call 多少。
// ===========================================================================
Stage("14 换模");
await Boot(1, "small");
const mesh = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const f = T.actorFactory;
  const status = f.MeshStatus();
  // 场上随便抓一个活人，看他身上到底挂的是哪一套几何
  // 优先抓一个**没被可见预算藏起来**的人：名额收到 13 之后场上二十几个人里
  // 大半是 visible=false 的，抓到那种人下面一块网格都数不出来。
  const s = T.ai.soldiers.find((x) => x.alive && x.actor && x.actor.root.visible)
    || T.ai.soldiers.find((x) => x.alive && x.actor);
  const a = s ? s.actor : null;
  let draws = 0;
  let tris = 0;
  if (a) {
    a.root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      // 祖先里只要有一个 visible=false（没戴毛巾的人身上那两块）就不进管线。
      // **只查到 actor.root 为止**：root 自己的 visible 是「此刻在不在画面上」
      // （AI 的可见预算每帧在改），与「这个人身上有几块网格」是两回事。
      for (let p = o; p && p !== a.root; p = p.parent) if (!p.visible) return;
      draws += 1;
      tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    });
  }
  // 关节与挂点：姿态代码逐帧写的就是这些对象，缺一个就是断手断脚
  const joints = !!a && !!a.hips && !!a.chest && !!a.neck
    && ["L", "R"].every((t) => a.arms[t] && a.arms[t].shoulder && a.arms[t].elbow
      && a.legs[t] && a.legs[t].thigh && a.legs[t].knee && a.legs[t].ankle);
  return {
    status,
    kind: a ? a.kind : null,
    source: a ? a.meshSource : null,
    modelId: a ? a.modelId : null,
    importedClips: a?.characterRig?.clipById?.size || 0,
    boneHitboxes: a?.GetBoneHitboxes?.().length || 0,
    joints,
    hasEyes: !!(a && a.eyes),
    eyesAhead: a ? a.eyes.position.z < 0 : false,      // 视线挂点必须在脸那一侧（-Z）
    hasMount: !!(a && a.weaponMount),
    weapon: a ? a.weaponId : null,
    // 走工厂的 WeaponSource，不自己拼缓存键 —— 键的格式变过一次（加了外观变体），
    // 自己拼的那版当场把模型枪误报成"退回方块"。
    weaponSource: a && a.weaponId
      ? f.WeaponSource(a.weaponId, a.weaponVariant | 0) || "box" : null,
    muzzleZ: a && a.weaponGroup ? a.weaponMuzzle.z : null,
    draws,
    tris,
    vmSource: T.viewmodel.rigSource,
  };
});
Check("人与枪的模型全部读到（一个都不许静默丢）",
  mesh.status.ready && mesh.status.loaded === mesh.status.requested && mesh.status.missing.length === 0,
  `读到 ${mesh.status.loaded}/${mesh.status.requested}${mesh.status.missing.length ? "，缺：" + mesh.status.missing.join(",") : ""}`);
Check("场上的军人用的是卢沟桥蒙皮 GLB，不是旧程序化方块",
  /^glb:Lugou(?:Nra|Ija)0[1-5]$/.test(mesh.source || "")
    && mesh.importedClips === 19 && mesh.boneHitboxes === 11,
  `${mesh.kind} 用的是 ${mesh.source} / ${mesh.importedClips} 动作 / ${mesh.boneHitboxes} 命中体`);
Check("模型接上了现有骨架：13 根骨头一根不少",
  mesh.joints, mesh.joints ? "hips/chest/neck + 双臂双腿齐全" : "有骨头没接上");
Check("挂点在：eyes 在脸那一侧、weaponMount 在",
  mesh.hasEyes && mesh.eyesAhead && mesh.hasMount,
  `eyes=${mesh.hasEyes} 朝前=${mesh.eyesAhead} weaponMount=${mesh.hasMount}`);
Check("手里的枪也是模型，枪口挂点在枪管前端（-Z 一侧）",
  mesh.weaponSource === "model" && mesh.muzzleZ !== null && mesh.muzzleZ < -0.15,
  `${mesh.weapon} 用的是 ${mesh.weaponSource}，muzzle.z=${mesh.muzzleZ}`);
// 预算：单人 21 块左右（模型 19 + 枪 2）。给到 26 是留给敢死队的背刀与手榴弹带，
// 再多就说明合批漏了 —— 24 人同屏时每人多一块就是全场多 24 个 draw call。
Check("单人 draw call 在预算内（≤26）", mesh.draws > 0 && mesh.draws <= 26,
  `${mesh.draws} 块可见网格 / ${Math.round(mesh.tris)} 三角`);

// 14.6 加载失败要退回方块，**不许抛**。造一个没预读过模型的工厂即可复现"模型 404"。
const fallback = await page.evaluate(() => {
  const T = window.Taierzhuang;
  try {
    const Factory = T.actorFactory.constructor;
    const bare = new Factory(T.library, { quality: "medium" });   // 故意不 await PreloadMeshes
    const a = bare.Create("nra", { seed: 4242, weapon: "ZhongZheng" });
    const out = {
      source: a.meshSource,
      hasBones: !!(a.chest && a.legs.L.ankle && a.arms.R.elbow),
      hasWeapon: !!a.weaponGroup,
      hasEyes: !!a.eyes,
    };
    // 摆几个姿势确认动画代码在方块路上照样跑
    a.Update(0.016, { moveSpeed: 0.7, aim: 0.5, elapsed: 1 });
    a.Update(0.016, { prone: 1, elapsed: 2 });
    a.Update(0.016, { dead: true, elapsed: 3 });
    a.Dispose();
    bare.Dispose();
    return out;
  } catch (error) {
    return { threw: String(error).slice(0, 200) };
  }
});
Check("模型读不到时退回程序化方块几何，且不抛",
  !fallback.threw && fallback.source === "box" && fallback.hasBones
    && fallback.hasWeapon && fallback.hasEyes,
  fallback.threw ? `抛了：${fallback.threw}`
    : `source=${fallback.source} 骨架=${fallback.hasBones} 枪=${fallback.hasWeapon} 视线=${fallback.hasEyes}`);

// 14.7 开镜：照门必须落在画面正中。这条是之前专门解出来的（_MakeAdsPose 是解方程
// 不是手调），换模/改手位最容易把它碰掉，而静态截图上"差二十个像素"看不出来。
{
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&ads=1&phase=1&quality=medium&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 180000 });
  const ads = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const out = [];
    for (const id of ["ZhongZheng", "HanYang", "Type38", "Zb26", "Mauser96"]) {
      T.viewmodel.Equip(id);
      T.StepFrames(150);
      const vm = T.viewmodel;
      if (!vm.rig || !vm.rig.sight) { out.push({ id, none: true }); continue; }
      vm.rig.group.updateWorldMatrix(true, false);
      const p = vm.rig.sight.clone().applyMatrix4(vm.rig.group.matrixWorld);
      T.camera.updateMatrixWorld(true);
      const v = p.project(T.camera);
      out.push({
        id,
        dx: Math.round((v.x * 0.5 + 0.5) * 1280 - 640),
        dy: Math.round((-v.y * 0.5 + 0.5) * 720 - 360),
        ads: +T.player.ads.toFixed(2),
      });
    }
    return out;
  });
  // ±14 px：铁瞄偏心是**故意的**（4—8 px，见 IRON_SIGHT_OFFSET_PX），
  // 留一点余量给弹簧的残余摆动，但偏到二十几 px 就是姿态解错了。
  const worst = ads.reduce((m, r) => Math.max(m, r.none ? 999 : Math.hypot(r.dx, r.dy)), 0);
  Check("开镜时照门落在画面正中（每把枪偏心 ≤14 px）", worst <= 14,
    ads.map((r) => (r.none ? `${r.id}:没照门` : `${r.id}:${r.dx},${r.dy}`)).join(" · "));
}

// ===========================================================================
// 14) 指针锁能释放
//
// 积压条目：关掉页面 / 切走标签页 / 退出游戏之后鼠标还是不可见，用户以为浏览器死了。
// 这一节走正常模式进页面、点「进城」抢锁，然后分别用 Esc、blur、pagehide、
// visibilitychange 四条通道各解一次。
// 不用 shot=1：那个模式根本不进指针锁，测了等于没测（跟 ads 那个坑是同一条路径）。
//
// **这里拿到的是游戏自己的假指针锁，不是浏览器的**：Chromium on Windows 的指针锁
// 是全系统的 ::ClipCursor，无头 Edge 一抢锁，开发机上真人的鼠标就被夹在屏幕左上角
// (27,95)-(1297,805) 那一块动不了，而且无头下 exit 也不松夹，要等进程退出。
// 所以游戏在 navigator.webdriver 下走页内假后端（见 Script_Main FAKE_POINTER_LOCK），
// 这一节断言的是游戏逻辑「抢 / 放」两头都接上了，并且真指针锁一次都没碰。
// ===========================================================================
Stage("14 指针锁");
{
  // menu=0：跳过主菜单，进页面就是这一关（菜单会盖住 #bootStart，而这一节要点它）
  // intro=0：这一节测的是「点进城拿指针锁」，不是开场过场（正常入口点进城会先播出川）
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?quality=medium&scale=small&menu=0&intro=0`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined && window.Taierzhuang.state.ready,
    null, { timeout: 180000 });
  const ReadLock = () => page.evaluate(() => window.Taierzhuang.Debug.PointerLock());
  const rows = [];
  for (const how of ["escape", "blur", "pagehide", "hidden"]) {
    // 第一轮点「进城」抢锁；「进城」页一收掉这颗按钮就点不着了，之后几轮靠
    // 「没拿到锁的第一次点击只用来抢锁」那条 Guard：点一下画面中央。
    // 原先每轮都点 #bootStart，第二轮起根本没抢到锁，后面的「已释放」是空话。
    await page.click("#bootStart", { force: true }).catch(() => {});
    await page.waitForTimeout(300);
    if (!(await ReadLock()).locked) { await page.mouse.click(640, 360); await page.waitForTimeout(300); }
    const before = await ReadLock();
    if (how === "escape") await page.keyboard.press("Escape");
    else if (how === "hidden") {
      // 标签切到后台：Playwright 没有直接的 API，改写 document.hidden 再派事件
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
        delete document.hidden;
      });
    } else await page.evaluate((k) => window.dispatchEvent(new Event(k)), how);
    await page.waitForTimeout(300);
    const after = await ReadLock();
    rows.push({ how, locked: before.locked, after: after.locked, touchedBrowser: before.browserLocked || after.browserLocked, fake: before.fake });
  }
  Check("点「进城」/ 点画面 每一轮都真的拿得到指针锁", rows.every((r) => r.locked),
    rows.map((r) => `${r.how}:${r.locked ? "锁上" : "没锁上"}`).join(" "));
  Check("Esc / 切走 / 关页 / 切后台 四条通道都会把鼠标还给用户",
    rows.every((r) => !r.after), rows.map((r) => `${r.how}:${r.after ? "仍锁着" : "已释放"}`).join(" "));
  // 无头浏览器抢到真指针锁 = 开发机的真鼠标被 ClipCursor 夹在屏幕左上角。这条红了就是那事故回来了。
  Check("自动化下走的是假指针锁，浏览器的真锁一次没碰（否则开发机鼠标会被夹住）",
    rows.every((r) => r.fake && !r.touchedBrowser),
    rows.map((r) => `${r.how}:fake=${r.fake} browser=${r.touchedBrowser}`).join(" "));
  // 解锁之后连续输入要清零，否则松锁那一瞬间按着的键会一直"按着"
  const sticky = await page.evaluate(() => {
    const T = window.Taierzhuang;
    return { fire: T.input.fire, forward: T.input.forward, sprint: T.input.sprint };
  });
  Check("解锁时把连续输入清零（不会一直往前走）",
    !sticky.fire && sticky.forward === 0 && !sticky.sprint, JSON.stringify(sticky));
}

// ===========================================================================
// 15) 枪感第 1 轮那四条方子有没有真的接上
//
// 全部走运行时取证，不读源码 —— 上一轮四条缺口里有三条是
// 「系统建好了但没接线」，而没接线的代码看起来跟接了线的一模一样。
// ===========================================================================
Stage("15 枪感四条");
await Boot(2, "small");
const feel = await page.evaluate(async () => {
  const T = window.Taierzhuang, D = T.Debug;
  T.player.health = 100;
  for (const s2 of T.ai.soldiers) {
    if (s2.side === "ija") s2.position.set(s2.position.x + 400, s2.position.y, s2.position.z + 400);
  }
  // --- 方子 2：开火画面顿挫 ---
  T.StepFrames(30);
  const fovIdle = T.camera.fov;
  T.state.ammo = 5;
  D.Fire();
  T.StepFrames(1, 1 / 240);
  const fovAfter = T.camera.fov;
  const punchPeak = D.GunFeel().firePunch;
  // 85 ms 之后应当基本收干净
  T.StepFrames(24, 1 / 240);
  const fovSettled = T.camera.fov;

  // --- 方子 1：拉栓声与停栓 ---
  // 声音本身在无头里量不到波形，能量到的是"有没有被排进调度"。
  // AudioEngine.Play 会返回一个句柄（被去重/预算挡掉时返回 null），拦它就够了。
  const played = [];
  const realPlay = T.audio.Play.bind(T.audio);
  T.audio.Play = (name, opts) => { played.push({ name, delay: (opts && opts.delay) || 0 }); return realPlay(name, opts); };
  // 上一发的 fireCooldown 还压着（汉阳造两发间隔 1.35 s，而 D.Fire 只推 1 s），
  // 不等它过去的话这一发根本没打出去，拦到的自然是空的 —— 那是测试的时序错，
  // 不是拉栓声没接上。推 90 帧（1.5 s）让它彻底过去。
  T.StepFrames(90);
  T.state.ammo = 5;
  D.Fire();
  T.audio.Play = realPlay;
  const bolt = played.find((e) => e.name === "bolt");
  // 抛壳走 shellDrop —— 2026-08-20 之前这里是 `shellImpact`（野外迫击炮爆炸实录，
  // 2.8 s），也就是每开一枪跟一记迫击炮。顺带断言那条**不再**被请求。
  const shell = played.find((e) => e.name === "shellDrop");
  const mortar = played.find((e) => e.name === "shellImpact");
  // 最后一发：lowAmmo 要传下去，栓停在后面
  T.state.ammo = 1;
  D.Fire();
  T.StepFrames(90);
  const low = D.GunFeel();

  // --- 方子 3：sway 输入 ---
  // **只推一帧就读。** lookDeltaYaw 是帧间增量，推两帧的话第二帧的增量已经是 0，
  // 读出来永远是「没接上」—— 而弹簧其实已经被推动了。
  const sway0 = D.GunFeel().swayYaw;
  T.player.yaw += 0.6;                       // 一帧转 34°
  T.StepFrames(1);
  const g3 = D.GunFeel();
  T.StepFrames(60);

  // --- 方子 4：冲刺 -> 开火延迟 ---
  // **必须从键盘那一头驱动**：直接写 T.player.sprint 会被 player.Update 用
  // input.sprint 覆写回去，而 Frame 里"松开冲刺的那一刻"也就永远记不到 ——
  // 那样量到的是"冲刺根本没发生"，测试全绿而闸门其实没接。
  T.state.ammo = 5;
  D.Key("ShiftLeft", true); D.Key("KeyW", true);
  T.StepFrames(45);                           // 0.75 s：冲刺量涨到 1
  const sprintUp = T.player.sprint;
  const ammoSprint0 = T.state.ammo;
  D.Fire();
  const ammoSprint1 = T.state.ammo;           // 冲刺中：打不出去
  D.Key("ShiftLeft", false); D.Key("KeyW", false);
  T.StepFrames(2);                            // 让 Frame 记下松开冲刺的时刻
  D.Fire();
  const ammoJustAfter = T.state.ammo;         // 松开 0.03 s：还在闸门里
  T.StepFrames(30);                           // 0.5 s
  D.Fire();
  const ammoLater = T.state.ammo;             // 闸门过了：打得出去

  return {
    fovIdle: +fovIdle.toFixed(3), fovAfter: +fovAfter.toFixed(3),
    fovSettled: +fovSettled.toFixed(3), punchPeak: +punchPeak.toFixed(3),
    boltDelay: bolt ? bolt.delay : null, shellDelay: shell ? shell.delay : null,
    mortar: !!mortar,
    lowAmmo: low.lowAmmo, boltOpen: low.boltOpen,
    sway0, swayYaw: g3.swayYaw, lookDelta: +(g3.lastLookDeltaYaw || 0).toFixed(3),
    sprintUp: +sprintUp.toFixed(2),
    ammoSprint0, ammoSprint1, ammoJustAfter, ammoLater,
  };
});
Check("开火有画面顿挫（FOV 冲击 ≈1.9°，85 ms 收干净）",
  feel.fovAfter - feel.fovIdle > 1.2 && Math.abs(feel.fovSettled - feel.fovIdle) < 0.4,
  `${feel.fovIdle}° -> ${feel.fovAfter}° -> ${feel.fovSettled}°（峰值 punch=${feel.punchPeak}）`);
Check("每发之后补拉栓声（delay 0.24 s）与抛壳落地（shellDrop，delay 0.62 s，不是迫击炮）",
  feel.boltDelay === 0.24 && feel.shellDelay === 0.62 && !feel.mortar,
  `bolt delay=${feel.boltDelay} shellDrop delay=${feel.shellDelay} 迫击炮=${feel.mortar}`);
Check("最后一发把 lowAmmo 传下去，栓停在后面",
  feel.lowAmmo && feel.boltOpen, `lowAmmo=${feel.lowAmmo} boltOpen=${feel.boltOpen}`);
Check("sway 输入接上了（视线一动，弹簧就不再恒等于 0）",
  Math.abs(feel.lookDelta) > 0.1 && Math.abs(feel.swayYaw) > 1e-4,
  `lookDeltaYaw=${feel.lookDelta} rad，swayYaw ${feel.sway0} -> ${feel.swayYaw}`);
Check("冲刺中打不出枪，松开后 0.22 s 才恢复",
  feel.sprintUp > 0.5 && feel.ammoSprint1 === feel.ammoSprint0
  && feel.ammoJustAfter === feel.ammoSprint1 && feel.ammoLater < feel.ammoJustAfter,
  `冲刺量 ${feel.sprintUp}；冲刺中 ${feel.ammoSprint0}->${feel.ammoSprint1}，`
  + `松开 0.03s ${feel.ammoJustAfter}，0.5s 后 ${feel.ammoLater}`);

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n通关冒烟：${results.length - failed.length}/${results.length} 过`);
if (failed.length) {
  console.log("没过的：");
  for (const f of failed) console.log(`  · ${f.name}${f.detail ? "  — " + f.detail : ""}`);
}
process.exit(failed.length === 0 ? 0 : 1);
