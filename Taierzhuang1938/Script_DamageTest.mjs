// 《滕县 一九三八》挨打冒烟：**日军把玩家打死这条链**的运行时取证。
//
// 为什么单独一层：开机冒烟证明"画得出来"，通关冒烟证明"剧本没卡"，
// 而"玩家挨了多久死、挨打的时候屏幕上有没有事发生"这两件事，两边都测不到 ——
// 它们既不是画面事故也不是流程事故，只有真人玩过才会说一句「死得太快、
// 连红框都没有」。这一层就是把那句话变成断言。
//
// 修之前实跑出来的账（下面第 2 节会重跑一遍旧口径做对照）：
//   · 三八式命中躯干 72 × 0.55 = 39.6，爆头 ×3.4 = 134.6 → **满血一枪毙**，
//     而爆头占 8%：任何一次交火都可能在第一发结束，玩家来不及知道自己在挨打；
//   · 三个射手（COMBAT.maxShootersOnPlayer）在 25 m 上从满血打到死 ≈ 6 s；
//   · 那 6 秒里屏幕上几乎没有事：暗角是 health<70 才开始亮的，
//     70 到 0 只隔两发，而暗角那层红最深只有 0.52 alpha × 0.62 不透明度。
//   · 中弹**没有声音** —— Audio/Sfx 里 Hurt 与 Heartbeat 两个素材烘好了没人播。
//
// 用法：node Taierzhuang1938/Script_DamageTest.mjs
// 退出码即成败。
//
// ---------------------------------------------------------------------------
// 2026-08-29 集成批 INT3a：取样章从 `?phase=0` 换到 `?phase=1`
//
// **为什么必须换：`phase=0` 现在是零敌人的过场章。** 任务流程重制之后
// `Data_Battle.PHASES[0]` 是 `CH0_Chuchuan`（序章·出川，`cutsceneOnly: true`、
// `ijaPool: 0`、`ijaSpawn: []`、玩家手上连枪都没有）。靶场第一步就是
// 「从场上挑三个活着的日本兵」，在那一关挑到的是**零个** ——
// 于是射击周期 `cycle` 算出来是 NaN，`while (elapsed < seconds)` 一轮都不进，
// 整份 TTK 报告变成一串 −1，而且它不报错：这一层的十九条断言集体失去意义。
//
// **为什么挑第一关（CH1_NanLu）而不是别的：出生点附近的敌我态势与旧 L0 最像。**
// 靶场量的是「三个日本兵在 25 m 上打你」，所以要的是与旧 `L0_Jiehe` 同一种
// 战场：开阔地、日军从北面压过来、有炮兵与重机枪支援、压力系数同一档。
// 逐项对照（旧 L0_Jiehe → 新 CH1_NanLu）：
//   · ijaPressure   1.0        → 1.0        （完全相同）
//   · ijaSpawn      ["north"]  → ["north"]  （完全相同）
//   · ijaSupport    artillery+hmg → artillery+hmg（完全相同）
//   · ijaForce      lmgEvery 13 / hmgTeams 1 / armor 0（完全相同 —— 决定敌方枪械配比，
//                   而枪械配比直接决定 TTK：三八式 72 / 九二式 92）
//   · 地形          城北界河原野 → 城外津浦路路基与南向大车路（同为城外开阔地）
//   · 叙事位置      玩家的第一场仗 → 玩家的第一场仗（brief 原话「这是玩家的第一场仗」）
// 第二关（CH2_Shouliudan）不合适：ijaPressure 1.5、从东面压、多一支掷弹筒，
// 而且打的是东关的院落巷战 —— 那是另一种交火距离，TTK 基线不可比。
//
// **新基线从哪来：口径一个数都没动。** `COMBAT.player` 那十一个字段
//（docs/Data_PlayerDamage.md §二）、`aiAccuracyBase`、`Data_Weapons` 的伤害全部原样；
// 换章换掉的只是「场上那三个日本兵拿的是什么枪」，而 CH1 的 ijaForce 与旧 L0 逐字相同。
//
// ---------------------------------------------------------------------------
// 2026-08-29 合并 master：射手**焊死成持步枪的日军**（f200b906）
//
// 这一条同时**解释掉**了换章那一版里那个「立与卧各比旧账高一两秒、不知道确切原因」
// 的悬案 —— 原因就是射手是混编的。靶场原来只挑「前三个活着的日本兵」，谁排在
// 前面取决于撒兵顺序；混进一挺十一年式（周期 0.82 s 对三八式的 2.2 s）TTK 直接
// 塌半，于是每换一次章、每动一次撒兵，阈值就得跟着走一次。焊死成三八式之后
// 数字是确定的，换章不再动数 —— 这也是为什么下面这份账比换章那一版整体长三成：
// 纯步枪一轮 2.2 s，射速与单发伤害都低于混编，是口径换纯步枪的代价，不是回归。
//
// 合并后在 CH1_NanLu 上实跑的数（2026-08-29，24/24 全绿）：
//   · 场上 15 个日本兵（其中步枪兵 13），武器 Type38 / Type11 / Type92Hmg ——
//     与旧 L0 的 ijaForce（lmgEvery 13 / hmgTeams 1 / armor 0）算出来的配比一致，
//     **这是「换章没换掉被测对象」最直接的证据**；靶场从这 13 个里取前三个；
//   · 三人 25 m 站姿 TTK 中位数 **16.1 s**（旧口径同一台靶场 6.6 s，比值 2.44×），
//     落在闸门 8—24 s 里；靶场命中率新 19% / 旧 30%；
//   · 姿态梯度 立 16.9 s / 蹲 17.6 s / 卧 29.3 s。断言压的是「卧 > 立」这条**关系**
//     与那条宽带，不压绝对值 —— 姿态是最大的一根杠杆，它的方向比它的秒数更值得守；
//   · 单发最重 47.5，仍在 maxBulletDamage 62 之下。
// 这几个数已经回写进 docs/Data_PlayerDamage.md §五「落地的数」。
// **两边只许有一份真相**：以后改了这里的实跑账，同一趟改那张表。
// ---------------------------------------------------------------------------

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
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

// phase=1 = CH1_NanLu（第一关 · 往南的路）。**不能用 phase=0**：任务流程重制把
// phase=0 换成了不撒兵的过场序章，靶场在那儿一个射手都收不到
//（见文件头「取样章」那一节）。第 1 章重制前后都是真战斗章。
await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=1&quality=low&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
await page.evaluate(() => {
  const T = window.Taierzhuang;
  // 第一关现在把完整交火推迟到 30 秒；伤害靶场测的是展开后的武器口径，
  // 首敌节拍由 FirstLevelWhiteboxBrowserTest 另行逐秒锁定。这里只推进阶段钟并触发
  // 下一次补兵拍，不让双方先空打 31 秒，也不能开无敌（后面正要测玩家受伤）。
  T.state.phaseTime = 31;
  T.state.spawnAccumulator = 3.1;
  T.StepFrames(1, 1 / 60, false);
});

// 取样章体检：**先点名，再开靶**。先证明这一关真撒了兵、且步枪兵够三个，
// 再谈 TTK。上一版把这件事默认成立，于是换到过场章之后整份报告静默变成
// 一串 −1 ——「靶场里一个人都没有」和「打了九十秒没打死」在输出上长得一模一样。
// 这条红了 = 判据不成立（本章没撒兵 / 步枪兵不够），**不是伤害口径回归**；
// 别顺着后面的 TypeError 去查 Range.Run。
const arena = await page.evaluate(async () => {
  const T = window.Taierzhuang;
  const battle = await import("./Data_Battle.mjs");
  const phase = battle.PHASES[T.state.phaseIndex] || {};
  const alive = T.ai.soldiers.filter((s) => s.side === "ija" && s.alive);
  return {
    id: phase.id,
    pressure: phase.ijaPressure,
    spawn: (phase.ijaSpawn || []).join("/"),
    ija: alive.length,
    rifles: alive.filter((s) => s.weapon?.kind === "boltRifle").length,
    weapons: [...new Set(alive.map((s) => s.weapon?.id || s.weapon?.name || "?"))].sort(),
  };
});
Check(`取样章 ${arena.id} 撒了兵，且至少三个活着的持步枪日军可当射手`,
  arena.rifles >= 3,
  `活日军 ${arena.ija}（步枪兵 ${arena.rifles}），压力 ${arena.pressure}／来向 ${arena.spawn}，`
  + `武器 ${arena.weapons.join("/") || "（无）"}`);
if (arena.rifles < 3) {
  await browser.close();
  server.close();
  console.log(`\n0/${results.length} 通过\n失败：\n  ` + results.map((r) => r.name).join("\n  "));
  process.exit(1);
}

// ===========================================================================
// 页面里的一台"靶场"。
//
// 不去等真实战场自己打起来 —— 那件事取决于撒兵点、院墙和通视，重跑一次就是
// 另一个数，测出来的方差比要测的效果还大。这里把三个日本兵搬到玩家正前方
// 25 m 上、把目标焊死成玩家，然后**走真的 TryFire**：命中率、部位掷骰、
// 伤害缩放、TakeHit、流血、红闪，一条都不绕过去。唯一被替换掉的是
// "多久开一枪"（用武器表算的周期直接推时间），因为那一段是计时器，不是规则。
//
// 骰盅是测试自己的：TryFire 的命中/部位掷骰全走 s.rnd，这里每局把它换成
// **固定种子**的 Mulberry32（种子 = opt.seed × 射手序号）。士兵的原生流
// 播种在出生那一刻，测到第几局取决于前面消耗了多少 —— 同一份代码 3 跑 2 红、
// 中位数在 8.4—11 s 之间漂，就是那么来的。换成按局播种之后，同一组参数
// 永远掷出同一串骰，新旧口径还共用同一组骰序（配对采样），比值量的只是
// 伤害表的差，不再混进骰运的差。
// ===========================================================================
await page.evaluate(() => {
  const T = window.Taierzhuang;
  const Mulberry32 = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  window.Range = {
    /**
     * 手工把玩家救活。**后面每一个要推帧取证的段落都必须走这一条，
     * 不能直接 `player.Spawn()`。**
     *
     * 事故（一次稳定红，症状是「濒死暗角进入搏动」在 90 帧末尾翻脸）：
     * `Run()` 是真的把玩家打死的（`player.Kill()`），而装配层要到**下一帧**
     * 才发现（Script_Main 的 `if (state.playerAliveLast && !player.Alive)
     * OnPlayerDown()` —— 死亡判定故意排在所有伤害系统之后）。OnPlayerDown
     * 会弹死亡卡、扣兵员池，并把 `state.deathTimer` 设成 2.6 s
     *（`REINFORCE.deathCardSeconds`），到点自动 `RespawnPlayer()` 换人。
     *
     * `player.Spawn()` 只改玩家自己 —— 那条倒计时还挂在 state 上继续走。
     * 于是这颗定时炸弹会在**后面某个取证段落的测量窗口中间**落地：换的人
     * 是满血的，血量被刷回 100、暗角 opacity 归零、`.hudDamage.low` 被摘掉。
     * 第 6 节量的正好是 90 帧（1.5 s），而残余倒计时约 1.5 s —— 前 89 帧
     * `low` 都在，最后一帧被换人擦掉，读到的就是「濒死没进搏动」。
     *
     * 这不是 HUD 回归也不是判据过期：`Hud.SetHurt` 的 `health < 40 && > 0`
     * 与 docs/Data_PlayerDamage.md §三 逐字一致，红的是靶场自己留下的状态。
     */
    Revive({ ry, grace } = {}) {
      const { player } = T;
      player.Spawn(player.position.x, player.position.z, ry ?? player.yaw);
      if (grace !== undefined) player.spawnGrace = grace;
      // 拆引信：把装配层排队的那次换人取消掉。
      T.state.deathTimer = 0;
      T.state.pendingRespawn = false;
    },

    /**
     * @param {object} opt { shooters, distance, stance, seconds, patch }
     * @returns {object} 打了多少枪、中了几枪、总伤害、几秒打死、单发最重多少
     */
    Run(opt) {
      const { player, ai } = T;
      const tables = T.Debug.Tables();
      const saved = { ...tables.COMBAT.player };
      if (opt.patch) Object.assign(tables.COMBAT.player, opt.patch);

      // 只收步枪兵：前 N 个活兵是什么枪由撒兵顺序决定，混进一挺十一年式
      // （周期 0.82 s 对 2.2 s）TTK 直接塌半，阈值就得跟着章走。焊死成
      // 三八式之后，口径与 docs/Data_PlayerDamage.md 的「三人 25 m」相同，换章不动数。
      const shooters = [];
      for (const s of ai.soldiers) {
        if (s.side !== "ija" || !s.alive || s.weapon?.kind !== "boltRifle") continue;
        shooters.push(s);
        if (shooters.length >= (opt.shooters ?? 3)) break;
      }
      // 人数不够就**明说**。原来这里不查：换到零敌人的过场章之后 cycle 算成
      // NaN、循环一轮都不进，报告变成一串 −1 却不报错 ——「靶场里没人」和
      // 「打了九十秒没打死」在输出上长得一模一样。
      if (shooters.length < (opt.shooters ?? 3)) {
        throw new Error(`靶场只收到 ${shooters.length} 个持步枪日军 —— 本章撒兵了吗？取样章选对了吗？`);
      }

      player.Spawn(player.position.x, player.position.z, player.yaw);
      player.spawnGrace = 0;                       // 出生保护另有断言，这里不测它
      player.stance = opt.stance ?? "stand";
      const d = opt.distance ?? 25;
      shooters.forEach((s, i) => {
        const a = (i / shooters.length) * Math.PI * 2;
        s.position.set(player.position.x + Math.cos(a) * d, player.position.y,
          player.position.z + Math.sin(a) * d);
        s.suppression = 0;
        s.ammo = 99999;
        s.coolUntil = -1;
        s.heat = 0;
        s.target = { position: player.position, isPlayer: true, ref: null };
        s.targetVisible = true;
        // TryFire 现在要求身体先转到枪口方向；靶场直接调用规则层，先把人摆正。
        s.yaw = Math.atan2(-(player.position.x - s.position.x),
          -(player.position.z - s.position.z));
        s.playerLockAt = opt.fresh ? ai.time : -999;   // fresh=首发必偏那一发
        // 按局播种（见上面"骰盅"那段）。同一个 opt.seed 永远掷同一串骰。
        s.rnd = Mulberry32((Math.imul((opt.seed ?? 1) + 1, 2654435761)
          ^ Math.imul(i + 1, 0x9E3779B1)) >>> 0);
      });

      // 一发的周期 = 拉栓/射速 + AI 的瞄准时间（TryFire 里那两条门槛）
      const cycle = shooters.reduce((acc, s) =>
        acc + (s.weapon.fireIntervalS ?? 1.2) + (s.weapon.aiAimTimeS ?? 0.8), 0) / shooters.length;

      // 三个人各打各的，平均下来场上每 step 秒响一枪 —— 时间轴按**每一发**推进，
      // 不是按"一轮三发"推进：按轮推的话分辨率就是一整个射击周期（2.2 s），
      // 旧口径两轮死、新口径两轮死，读出来是同一个数，效果整个被量化掉。
      const step = cycle / shooters.length;
      const seconds = opt.seconds ?? 60;
      let shots = 0, hits = 0, worst = 0, elapsed = 0, killedAt = -1, idx = 0;
      while (elapsed < seconds && player.alive) {
        const s = shooters[idx % shooters.length];
        idx += 1;
        s.fireTimer = 0; s.aimTime = 99; s.suppression = 0;
        const before = player.health;
        ai.TryFire(s, step, player);
        shots += 1;
        const drop = before - player.health;
        if (drop > 0.001) { hits += 1; if (drop > worst) worst = drop; }
        elapsed += step;
        // 流血照常走（Player.Update 里那一段），不然 TTK 会偏乐观
        if (player.alive) {
          const cap = tables.COMBAT.player.maxBleedPerS ?? 1e9;
          player.bleeding = Math.min(player.bleeding, cap);
          player.health -= player.bleeding * step;
          if (player.health <= 0) player.Kill();
        }
        if (!player.alive) killedAt = elapsed;
      }
      const lastHealth = player.health;
      Object.assign(tables.COMBAT.player, saved);
      return {
        shots, hits, worst: +worst.toFixed(1), cycle: +cycle.toFixed(2),
        ttk: killedAt < 0 ? -1 : +killedAt.toFixed(1),
        left: +Math.max(0, lastHealth).toFixed(1),
      };
    },
  };
});

/**
 * 同一组参数跑 n 局取中位数，第 i 局发种子 i：一局一串固定骰序，
 * 中位数量的是 n 串**不同但认死**的骰序 —— 统计意义还在，数字却每次执行
 * 都一模一样。（此前用士兵出生时播的那条流，15 局也压不住：同一份代码
 * 3 跑 2 红，中位数在 8.4—11 s 之间漂，比值断言 1.31—1.72 跨着阈值摇。）
 */
async function Median(opt, n = 15) {
  const runs = [];
  for (let i = 0; i < n; i += 1) {
    runs.push(await page.evaluate((o) => window.Range.Run(o), { ...opt, seed: i }));
  }
  const ttks = runs.map((r) => r.ttk).filter((t) => t > 0).sort((a, b) => a - b);
  return {
    runs,
    ttk: ttks.length ? ttks[Math.floor(ttks.length / 2)] : -1,
    died: ttks.length,
    worst: Math.max(...runs.map((r) => r.worst)),
  };
}

// ===========================================================================
// 1) 单发不许打死一个满血的人
//
// 这是"直接就死"里最刺人的那一条：旧口径下 8% 的爆头 = 134.6 点，一发结束。
// 玩家不会觉得自己被压制了，只会觉得游戏在掷骰子决定他还能不能玩。
// ===========================================================================
const single = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const { player } = T;
  const P = T.Debug.Tables().COMBAT.player;
  const worst = [];
  // 场上最重的两支枪：九二式重机 92、三八式 72。都按爆头算。
  for (const dmg of [92, 72, 110]) {
    player.Spawn(player.position.x, player.position.z, player.yaw);
    player.spawnGrace = 0;
    player.TakeHit(dmg * P.bulletScale, "head", null, { bullet: true, from: player.position.clone() });
    worst.push({ dmg, left: +player.health.toFixed(1), alive: player.alive });
  }
  return { worst, cap: P.maxBulletDamage };
});
Check("小口径单发打不死满血的人",
  single.worst.every((w) => w.alive && w.left > 0),
  single.worst.map((w) => `${w.dmg}→剩 ${w.left}`).join(" / ") + `（上限 ${single.cap}）`);

// ===========================================================================
// 2) TTK：新口径 vs 旧口径，同一台靶场跑两遍
// ===========================================================================
const OLD = {
  accuracyScale: 1.0, bulletScale: 0.55, meleeScale: 0.5, blastScale: 0.7,
  headChance: 0.08, headMultiplier: 3.4, torsoMultiplier: 1.0, limbMultiplier: 0.62,
  maxBulletDamage: 9999, bleedScale: 1.0, maxBleedPerS: 9999, firstShotGraceS: 0,
};
const now = await Median({ shooters: 3, distance: 25, seconds: 90 });
const before = await Median({ shooters: 3, distance: 25, seconds: 90, patch: OLD });
const Shape = (m) => {
  const shots = m.runs.reduce((a, r) => a + r.shots, 0);
  const hits = m.runs.reduce((a, r) => a + r.hits, 0);
  return `${hits}/${shots} 命中 ${(hits / shots * 100).toFixed(0)}%`;
};
console.log(`     旧：${Shape(before)}  周期 ${before.runs[0].cycle}s`);
console.log(`     新：${Shape(now)}  周期 ${now.runs[0].cycle}s`);
Check("三人 25 m 对射的 TTK 拉长了", now.ttk > before.ttk * 1.5,
  `旧 ${before.ttk}s → 新 ${now.ttk}s（各 ${now.runs.length} 次取中位数）`);
Check("TTK 落在 8—24 s", now.ttk >= 8 && now.ttk <= 24, `${now.ttk}s`);
// 「旧口径一枪毙」不能拿靶场里的 worst 去断言 —— worst 是单发掉血的最大值，
// 而只有**这一局的第一发**打在满血上，后面的掉血天然被剩余血量截住。
// 15 局 × 8% 爆头 ≈ 1.2 次，断言会随机变红（实跑遇到过一次）。
// 改成直接拿旧倍率打一发爆头，确定性的。
const oneShot = await page.evaluate((oldTable) => {
  const T = window.Taierzhuang;
  const { player } = T;
  const table = T.Debug.Tables().COMBAT.player;
  const saved = { ...table };
  const Probe = () => {
    player.Spawn(player.position.x, player.position.z, player.yaw);
    player.spawnGrace = 0;
    // 三八式（Data_Weapons.Type38.damage = 72）爆头一发
    player.TakeHit(72 * table.bulletScale, "head", null,
      { bullet: true, from: player.position.clone() });
    return { left: +Math.max(0, player.health).toFixed(1), alive: player.alive };
  };
  Object.assign(table, oldTable);
  const before = Probe();
  Object.assign(table, saved);
  const after = Probe();
  player.Spawn(player.position.x, player.position.z, player.yaw);
  return { before, after };
}, OLD);
Check("旧口径三八式爆头一发就毙（这条是「直接就死」的主因）",
  !oneShot.before.alive, `剩 ${oneShot.before.left}`);
Check("新口径同一发打不死", oneShot.after.alive,
  `剩 ${oneShot.after.left}`);
Check("靶场里新口径的单发最重也没到满血", now.worst < 100, `${now.worst}`);

// ===========================================================================
// 3) 刚锁上玩家的那一发必偏 —— 这一发买的是"子弹先从耳边过"的预警
// ===========================================================================
const fresh = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const { player, ai } = T;
  let damaged = 0, shots = 0;
  for (let i = 0; i < 40; i += 1) {
    const s = ai.soldiers.find((x) => x.side === "ija" && x.alive);
    if (!s) break;
    player.Spawn(player.position.x, player.position.z, player.yaw);
    player.spawnGrace = 0;
    s.position.set(player.position.x + 12, player.position.y, player.position.z);
    s.target = { position: player.position, isPlayer: true, ref: null };
    s.targetVisible = true;
    s.yaw = Math.atan2(-(player.position.x - s.position.x),
      -(player.position.z - s.position.z));
    s.playerLockAt = ai.time;                 // 就在这一刻锁上
    s.fireTimer = 0; s.aimTime = 99; s.suppression = 0; s.ammo = 99; s.coolUntil = -1;
    const before = player.health;
    ai.TryFire(s, 0.016, player);
    shots += 1;
    if (player.health < before - 0.001) damaged += 1;
  }
  return { shots, damaged, suppression: player.suppression };
});
Check("首发必偏：新锁定的第一发不掉血", fresh.damaged === 0,
  `${fresh.shots} 发里 ${fresh.damaged} 发造成了伤害`);
Check("首发仍然把人压住（不是白开一枪）", fresh.suppression > 0,
  `suppression=${fresh.suppression.toFixed(2)}`);

// ===========================================================================
// 4) 挨枪那一下屏幕上真的有事发生
//
// 用户原话是「连红框的晕角提醒好像都没有」。旧版满血挨一发三八式之后
// 暗角不透明度是 (1 − 60.4/70) × 0.62 ≈ 0.085，乘边缘那层 0.52 alpha
// ≈ 0.044 —— 数学上不是零，视觉上就是没有。这里从 DOM 上取证。
// ===========================================================================
const feedback = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const { player } = T;
  window.Range.Revive({ grace: 0 });                 // 见 Range.Revive：不能直接 Spawn
  player.yaw = 0;                                   // 朝 -Z
  // 从**正右方**（+X）打来的一枪
  const from = player.position.clone(); from.x += 20;
  player.TakeHit(72 * T.Debug.Tables().COMBAT.player.bulletScale, "torso", null,
    { bullet: true, from });
  T.StepFrames(1);
  const dmg = document.querySelector(".hudDamage");
  const dirs = [...document.querySelectorAll(".hudHitDir")];
  const lit = dirs.filter((d) => Number(d.style.opacity) > 0.3);
  const angle = lit.length ? (lit[0].getAttribute("transform") || "").match(/-?\d+(\.\d+)?/) : null;
  return {
    health: +player.health.toFixed(1),
    flash: +player.hitFlash.toFixed(2),
    vignette: Number(dmg.style.opacity),
    marks: player.hitMarks.length,
    litDirs: lit.length,
    angle: angle ? Number(angle[0]) : null,
    // 旧版在同一血量下的暗角不透明度，拿来做对照
    oldVignette: +(Math.max(0, 1 - player.health / 70) * 0.62).toFixed(3),
  };
});
Check("中弹当帧红闪起来了", feedback.flash > 0.5, `hitFlash=${feedback.flash}`);
Check("暗角在满血挨一发之后就看得见", feedback.vignette > 0.35,
  `新 ${feedback.vignette}（血 ${feedback.health}）／旧 ${feedback.oldVignette}`);
Check("来弹指示亮了一段弧", feedback.litDirs === 1 && feedback.marks === 1,
  `弧 ${feedback.litDirs} 段、方位 ${feedback.marks} 条`);
// 朝 -Z 站着、弹从 +X 来 → 指示应该指向屏幕右手边，即 +90°
Check("弧指向来弹方位（右侧 +90°）",
  feedback.angle !== null && Math.abs(feedback.angle - 90) < 8, `${feedback.angle}°`);

// ===========================================================================
// 5) 活手榴弹进入真实杀伤范围后有方向提示，离开/爆炸后收掉
// ===========================================================================
const grenadeWarning = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const { player, combat } = T;
  combat.ClearProjectiles();
  window.Range.Revive({ ry: 0 });                     // 朝 -Z；见 Range.Revive
  const start = player.EyePosition.clone();
  start.x += 5;                                      // 正右方五米
  const still = player.position.clone().set(0, 0, 0);
  const grenade = combat.Throw("Grenade", 0, start, still, 0);
  T.StepFrames(24);                                  // 越过己方离手宽限 0.35 s
  const el = document.querySelector(".hudGrenadeWarning");
  const shown = getComputedStyle(el).display !== "none";
  const x = Number.parseFloat(el.style.left || "0");
  const text = el.textContent.trim();
  grenade.fuse = 1.0;
  T.StepFrames(1);
  const urgent = el.classList.contains("urgent");
  combat.ClearProjectiles();
  T.StepFrames(1);
  const hidden = getComputedStyle(el).display === "none";
  return { shown, x, text, urgent, hidden };
});
Check("附近活手榴弹会亮警告", grenadeWarning.shown && /手榴弹/.test(grenadeWarning.text),
  `${grenadeWarning.text || "没有文字"}`);
Check("手榴弹在右侧，警告也指向右侧", grenadeWarning.x > 640, `x=${grenadeWarning.x}`);
Check("引信将尽时警告变红脉冲", grenadeWarning.urgent);
Check("手榴弹清除后警告同帧消失", grenadeWarning.hidden);

// ===========================================================================
// 6) 低血搏动与濒死心跳（两个素材烘好了一直没人播）
// ===========================================================================
const pulse = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const { player } = T;
  const played = [];
  const real = T.audio.Play.bind(T.audio);
  T.audio.Play = (name, opt) => { played.push(name); return real(name, opt); };
  window.Range.Revive({ grace: 0 });                  // 见 Range.Revive：不能直接 Spawn
  player.TakeHit(30, "torso", null, { bullet: true, from: player.position.clone() });
  T.StepFrames(2);
  const grunted = played.includes("hurt");
  player.health = 22;                                // 濒死
  // 这一段只测 HUD/心跳。完整首遇已经展开，若不重新给保护窗，场上的真人 AI
  // 会在 1.5 s 采样期内补枪把玩家打到 0；死亡态理应移除 low class，却会让
  // “濒死是否搏动”随随机弹道偶发变红。
  player.spawnGrace = 99;
  T.StepFrames(90);                                  // 1.5 s：至少一跳
  const dmg = document.querySelector(".hudDamage");
  const out = {
    grunted, beat: played.filter((n) => n === "heartbeat").length,
    low: dmg.classList.contains("low"),
  };
  T.audio.Play = real;
  return out;
});
Check("中弹有闷哼（AudioSfx_Hurt 第一次被播）", pulse.grunted);
Check("濒死有心跳（AudioSfx_Heartbeat 第一次被播）", pulse.beat > 0, `${pulse.beat} 跳`);
Check("濒死暗角进入搏动", pulse.low);

// ===========================================================================
// 7) 站姿/蹲/卧仍然分得出来，爆炸与白刃仍然重
// ===========================================================================
const stances = {};
for (const st of ["stand", "crouch", "prone"]) {
  stances[st] = (await Median({ shooters: 3, distance: 25, seconds: 120, stance: st }, 11)).ttk;
}
Check("趴下比站着活得久", stances.prone > stances.stand,
  `立 ${stances.stand}s / 蹲 ${stances.crouch}s / 卧 ${stances.prone}s`);

const heavy = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const { player } = T;
  const out = {};
  player.Spawn(player.position.x, player.position.z, player.yaw);
  player.spawnGrace = 0;
  // 掷弹筒正中：110 × blastScale，不吃单发上限（它有啸声、有落点标记、有 1.6 s 预警）
  player.TakeHit(110 * T.Debug.Tables().COMBAT.player.blastScale, "torso", null,
    { blast: true, from: player.position.clone() });
  out.blast = +(100 - player.health).toFixed(1);
  player.Spawn(player.position.x, player.position.z, player.yaw);
  player.spawnGrace = 0;
  player.TakeHit(110 * T.Debug.Tables().COMBAT.player.meleeScale, "torso", null,
    { melee: true, from: player.position.clone() });
  out.melee = +(100 - player.health).toFixed(1);
  return out;
});
Check("间接火力仍然是重伤（一发去掉半条命以上）", heavy.blast > 50, `${heavy.blast} 点`);
Check("刺刀仍然是重伤但捅不死满血的人", heavy.melee > 35 && heavy.melee < 100, `${heavy.melee} 点`);

Check("整趟没有页面报错", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log("失败：\n  " + failed.map((r) => r.name).join("\n  "));
  process.exit(1);
}
