// 《台儿庄：血战滕县》音频**接线**冒烟：这件事发生的时候，那一声到底请求了没有。
//
// 与 Script_AudioTest 分工：那一层测的是**资产与配方**（采样盖上了几条、每条能不能
// 发声、烘焙参数对不对）；这一层测的是**接线** —— 一颗子弹从头边过去有没有弹啸、
// 隔着墙的那一颗是不是不响、AI 开完枪有没有拉栓、脚踩在木板上播的是不是木头那条、
// 掷弹筒发射有没有声音、四十米外的爆炸走的是不是中距那条。
//
// 为什么必须单独测：这一类失败**全都是静默的**，而且开机冒烟、通关冒烟、
// 音频资产冒烟三条全绿的时候它们照样成立 —— 事实就是这样：
//   · `launcherPop` 的配方、素材、混音、说明全都在，**从来没有任何地方调用过**；
//   · `footstepDirt / footstepRubble` 按 `state.frame % 3` 轮着播，脚底下是什么
//     从来没有人问过；
//   · Script_Ai 里一条 foley 都没有（满场几十个兵，开枪只有枪声）；
//   · 近失弹只进压制账，不出声。
// 「配方能发声」与「该响的时候真的响了」是两件事，后者只有断言得出来。
//
// 判据用 `audio.RequestedCount(name)` 而不是听输出：请求数是**接线**的直接证据，
// 而实际发声还要过去重窗、节点预算、距离剔除三道闸 —— 那三道是引擎的账，
// 已经由 Script_AudioTest 与 NODE_COST 各自守着。这一层要是拿"响没响"当判据，
// 一旦某天预算紧了就会变成一条随机翻红的断言，而红的原因与接线无关。
//
// **不带 `?shot=1`**：出图模式根本不建 AudioContext，量到的会是另一条路。
//
// 用法：node Taierzhuang1938/Script_AudioWiringTest.mjs
// 退出码即成败。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
// 环境床的撒播表与弹啸的接线数：8.8 节最后那条「两套弹啸不许同时撒」在 node 侧判 ——
// 那是一张**静态表**，跑进浏览器里再问一遍只会把一条确定的断言变成一次采样。
import { AMBIENCE_PRESETS } from "./Script_Audio.mjs";
import { NEAR_MISS } from "./Data_Tuning_Audio.mjs";

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

// menu=0：跳过主菜单（它会盖住 #bootStart）。intro=0：不放开场过场。
// phase=1 = CH1_NanLu（第一关 · 往南的路）—— 与 Script_DamageTest 同一个取样章：
// 真撒兵、开阔地、日军持三八式，这一层要的"一个兵朝玩家开枪"才有原料。
await page.goto(
  `http://127.0.0.1:${port}/Taierzhuang1938/?phase=1&menu=0&intro=0&quality=low&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang && window.Taierzhuang.audio, null, { timeout: 240000 });
// 真点一下：AudioContext 要用户手势才 resume（page.evaluate 不算手势）。
await page.mouse.click(640, 400).catch(() => {});
await page.click("#bootStart").catch(() => {});
await page.evaluate(() => window.Taierzhuang.audio.Unlock());
await page.evaluate(() => window.Taierzhuang.StepFrames(20, 1 / 60, false));

// ---------------------------------------------------------------------------
// 0) 接线层装上了没有
// ---------------------------------------------------------------------------
const installed = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const zone = T.Debug.AudioZone();
  return {
    hasWiring: !!T.audioWiring,
    hasProbes: !!T.audioWiring?.Probes,
    probesInstalled: !!zone?.probesInstalled,
    zone: zone?.zone || null,
    soldiers: zone?.soldiers?.length ?? -1,
    hasSetProbes: typeof T.audio.SetProbes === "function",
    hasDuckAmbience: typeof T.audio.DuckAmbience === "function",
    hasPlayGunshot: typeof T.audio.PlayGunshot === "function",
  };
});
Check("接线层与 Debug.AudioZone 取证口都在", installed.hasWiring && installed.zone !== null,
  `zone=${installed.zone}，最近 ${installed.soldiers} 个兵`);
// 这三条是**引擎侧那批新 API 到位没有**的报告，不是断言 —— 判空是设计，缺了照样要能跑。
console.log(`     引擎 API：SetProbes=${installed.hasSetProbes} `
  + `DuckAmbience=${installed.hasDuckAmbience} PlayGunshot=${installed.hasPlayGunshot}`
  + `（缺任何一条都由接线侧判空兜住，不算失败）`);

// ---------------------------------------------------------------------------
// 1) 逐弹弹啸：从头边 0.5 m 过 → 响；隔着墙 → 不响
//
// 摆一个兵朝玩家开枪，走**真的 TryFire**（命中率、瞄准闸、朝向闸一条不绕）。
// 用 `playerLockAt` 把这一发压进"刚锁上目标必偏"的宽限期里 —— 那是 Script_Ai
// 自己的规则，acc 恒为 0，所以这一发必定是近失弹；再把 s.rnd 焊成 0.0714，
// 于是 miss = 0.4 + 0.0714 × 1.4 ≈ 0.5 m，正好是"从头边过去"。
//
// **遮挡这一项换的是世界，不是规则**：真地图上两点之间有没有墙取决于摆点与地形，
// 那是另一层的账（TengxianZoneTest / 布设层）。这里把 battlefield.Raycast 换成
// 「什么都没打到」与「半路打到一堵墙」两种回答，量的是接线层拿到这两种回答之后
// 的行为差别 —— 那才是这一层负责的东西。
// ---------------------------------------------------------------------------
const crack = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const player = T.player;
  const soldier = T.ai.soldiers.find((s) => s.side === "ija" && s.alive && !s.unarmed);
  if (!soldier) return { error: "这一关没有活着的日军可以拿来开枪" };
  const bf = T.state && T.ai.ctx.battlefield;
  const realRaycast = bf.Raycast.bind(bf);

  const Arm = () => {
    // 把人搬到玩家正前方 10 m，朝向玩家；把开火的四道闸全部打开。
    soldier.position.set(player.position.x, player.position.y, player.position.z - 10);
    soldier.target = { isPlayer: true, position: player.position };
    soldier.targetVisible = true;
    // 朝向闸照 Script_Ai 自己那条式子算：目标在 +Z 方向时 yaw 是 π 不是 0
    //（人物正面是局部 −Z）。算错就被那道 0.34 rad 的闸挡住，一枪都开不出来。
    soldier.yaw = Math.atan2(-(player.position.x - soldier.position.x),
      -(player.position.z - soldier.position.z));
    soldier.aimTime = 99;
    soldier.fireTimer = 0;
    soldier.ammo = 5;
    soldier.coolUntil = -1;
    soldier.suppression = 0;
    soldier.order = "hold";
    soldier.playerLockAt = T.ai.time;      // 宽限期内 acc = 0 → 这一发必偏
    // 【2026-09-09】近失点改读**真弹道**（shot.missDir）之后，这个焊死的 rnd
    // 决定的是 Box–Muller 那一对高斯：10 m 上落点离瞄点 1.3 m 上下，
    // 弹道到耳朵的最近距离在 crackWithinM = 6 m 以内 —— 仍然是「从身边过去」。
    soldier.rnd = () => 0.0714;
    T.audioWiring.occCache.clear();        // 1 m 网格缓存里存着上一次的答案
  };

  const Count = () => T.audio.RequestedCount("bulletCrack");

  // ① 通透
  bf.Raycast = () => null;
  Arm();
  const before1 = Count();
  T.ai.TryFire(soldier, 1 / 60, player);
  const clear = Count() - before1;

  // 两帧限速要错开：同帧最多 2 条、100 ms 最多 3 条。
  bf.Raycast = realRaycast;
  T.StepFrames(20, 1 / 60, false);

  // ② 隔墙（半路就撞上）
  bf.Raycast = (origin, dir, maxDist) => ({ t: Math.max(0.2, maxDist * 0.4),
    normal: [0, 1, 0], box: { tag: "wall", min: [0, 0, 0], max: [1, 3, 1] } });
  Arm();
  const before2 = Count();
  T.ai.TryFire(soldier, 1 / 60, player);
  const blocked = Count() - before2;

  bf.Raycast = realRaycast;

  // ③ 限速：同一帧连开五枪，**只许出 1 条**（2026-09-09：150 ms 一条）
  T.audioWiring.crackFrame = -1;
  T.audioWiring.crackTimes.length = 0;
  T.audioWiring.lastCrackAt = -99;
  T.audioWiring.lastCrackM = 99;
  bf.Raycast = () => null;
  const before3 = Count();
  for (let i = 0; i < 5; i += 1) {
    Arm();
    T.ai.TryFire(soldier, 1 / 60, player);
  }
  const burst = Count() - before3;
  bf.Raycast = realRaycast;
  return { clear, blocked, burst, weapon: soldier.weapon?.kind || "?" };
});
if (crack.error) Check("逐弹弹啸", false, crack.error);
else {
  Check("弹道从头边 0.5 m 过 → 请求 bulletCrack", crack.clear === 1, `请求 ${crack.clear} 条`);
  Check("同样一发隔着墙 → 一条都不请求", crack.blocked === 0, `请求 ${crack.blocked} 条`);
  Check("同帧连开五枪，弹啸只出 1 条（150 ms 一条）", crack.burst === 1, `出了 ${crack.burst} 条`);
}

// ---------------------------------------------------------------------------
// 2) AI foley：开完枪要拉栓
// ---------------------------------------------------------------------------
const foley = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const player = T.player;
  const soldier = T.ai.soldiers.find((s) => s.side === "ija" && s.alive && !s.unarmed
    && s.weapon?.kind === "boltRifle");
  if (!soldier) return { error: "这一关没有持栓动步枪的活日军" };
  const bf = T.ai.ctx.battlefield;
  const realRaycast = bf.Raycast.bind(bf);
  bf.Raycast = () => null;
  soldier.position.set(player.position.x, player.position.y, player.position.z - 8);
  soldier.target = { isPlayer: true, position: player.position };
  soldier.targetVisible = true;
  soldier.yaw = Math.atan2(0, -(player.position.z - soldier.position.z));
  soldier.aimTime = 99;
  soldier.fireTimer = 0;
  soldier.ammo = 5;
  soldier.coolUntil = -1;
  soldier.suppression = 0;
  soldier.order = "hold";
  const beforeBolt = T.audio.RequestedCount("bolt");
  const beforeGun = T.audio.RequestedCount("rifleIja") + T.audio.RequestedCount("rifleNra");
  T.ai.TryFire(soldier, 1 / 60, player);
  const out = {
    bolt: T.audio.RequestedCount("bolt") - beforeBolt,
    gun: T.audio.RequestedCount("rifleIja") + T.audio.RequestedCount("rifleNra") - beforeGun,
  };
  // 换弹：打空之后走 Think 的那条边沿
  soldier.ammo = 0;
  const beforeLoad = T.audio.RequestedCount("stripperLoad") + T.audio.RequestedCount("magIn");
  T.ai.ctx.audioWiring.AiReload(soldier, soldier.weapon.kind);
  out.reload = T.audio.RequestedCount("stripperLoad") + T.audio.RequestedCount("magIn") - beforeLoad;
  // 走一步：AI 的脚步按步距触发
  const beforeStep = ["footstepDirt", "footstepStone", "footstepWood", "footstepGrass",
    "footstepMud", "footstepRubble"].reduce((a, n) => a + T.audio.RequestedCount(n), 0);
  T.ai.ctx.audioWiring.AiStep(soldier, 2.5, 0);
  out.step = ["footstepDirt", "footstepStone", "footstepWood", "footstepGrass",
    "footstepMud", "footstepRubble"].reduce((a, n) => a + T.audio.RequestedCount(n), 0) - beforeStep;
  bf.Raycast = realRaycast;
  return out;
});
if (foley.error) Check("AI foley", false, foley.error);
else {
  Check("AI 开了枪", foley.gun >= 1, `枪声请求 ${foley.gun}`);
  Check("AI 开枪后请求 bolt（栓动才有）", foley.bolt === 1, `请求 ${foley.bolt} 条`);
  Check("AI 换弹请求压弹/弹匣音", foley.reload === 1, `请求 ${foley.reload} 条`);
  Check("AI 走够一个步距请求一记脚步", foley.step === 1, `请求 ${foley.step} 条`);
}

// ---------------------------------------------------------------------------
// 3) 玩家脚步按脚下材质：木地面 → footstepWood
//
// 同样是**换世界不换规则**：向下那条射线的回答换成"踩在 tag=floor 的盒子上"，
// 量的是接线层认不认得这个 tag。真地图上哪块地是木头由布设层负责。
// ---------------------------------------------------------------------------
const steps = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const bf = T.ai.ctx.battlefield;
  const realRaycast = bf.Raycast.bind(bf);
  const realWater = bf.WaterDepth.bind(bf);
  bf.WaterDepth = () => 0;
  const Walk = (tag) => {
    bf.Raycast = () => ({ t: 0.6, normal: [0, 1, 0],
      box: { tag, min: [-1, -1, -1], max: [1, 0, 1] } });
    T.player.grounded = true;
    T.player.stepDistance += 10;
    const before = ["footstepWood", "footstepStone", "footstepDirt", "footstepGrass",
      "footstepMud", "footstepRubble"].map((n) => [n, T.audio.RequestedCount(n)]);
    T.audioWiring.Update(1 / 60, T.state.frame);
    return before.filter(([n, c]) => T.audio.RequestedCount(n) > c).map(([n]) => n);
  };
  const out = { wood: Walk("floor"), rubble: Walk("rubble"), stone: Walk("villageCourtyard") };
  bf.WaterDepth = () => 0.5;
  out.mud = Walk("terrain");
  bf.Raycast = realRaycast;
  bf.WaterDepth = realWater;
  return out;
});
Check("玩家在木地面走 → footstepWood", steps.wood.join() === "footstepWood",
  `播的是 ${steps.wood.join("/") || "（没有）"}`);
Check("瓦砾 → footstepRubble", steps.rubble.join() === "footstepRubble",
  `播的是 ${steps.rubble.join("/") || "（没有）"}`);
Check("石板院 → footstepStone", steps.stone.join() === "footstepStone",
  `播的是 ${steps.stone.join("/") || "（没有）"}`);
Check("水里 → footstepMud", steps.mud.join() === "footstepMud",
  `播的是 ${steps.mud.join("/") || "（没有）"}`);

// ---------------------------------------------------------------------------
// 4) 空间档：屋里 / 院子 / 街 / 开阔地
// ---------------------------------------------------------------------------
const zones = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const bf = T.ai.ctx.battlefield;
  const realRaycast = bf.Raycast.bind(bf);
  const realNearby = bf.NearbyColliders.bind(bf);
  // 墙要摆在**听者身边**：高度与水平距离都是拿听者位置比出来的，
  // 摆在世界原点的话六米内一面都数不到（第一次写就是这么红的）。
  const L = T.audio.listenerPos;
  const Wall = (i) => ({ tag: "wall",
    min: [L.x + i * 1.5 - 0.2, L.y - 1, L.z - 2],
    max: [L.x + i * 1.5 + 0.2, L.y + 2, L.z + 2] });
  const Roof = () => ({ t: 3, normal: [0, -1, 0],
    box: { tag: "roof", min: [L.x - 4, L.y + 2, L.z - 4], max: [L.x + 4, L.y + 2.4, L.z + 4] } });
  const Ask = (up, walls) => {
    bf.Raycast = () => up;
    bf.NearbyColliders = () => walls;
    T.audioWiring.zoneCache.clear();
    return T.Debug.AudioZone().zone;
  };
  // 头顶一整片屋顶（2.5 m 见方以上）= 在屋里
  const interior = Ask(Roof(), []);
  // 头顶什么都没有、周围三面墙 = 院子
  const courtyard = Ask(null, [Wall(0), Wall(1), Wall(2)]);
  // 一面墙 = 街巷
  const street = Ask(null, [Wall(0)]);
  // 什么都没有 = 开阔地
  const open = Ask(null, []);
  // 一根电线杆不算屋顶（横向不到 2.5 m）—— 少了这一条，站在街心也会被判成在屋里
  const pole = Ask({ t: 3, normal: [0, -1, 0],
    box: { tag: "prop", min: [L.x - 0.2, L.y + 2, L.z - 0.2], max: [L.x + 0.2, L.y + 2.4, L.z + 0.2] } }, []);
  bf.Raycast = realRaycast;
  bf.NearbyColliders = realNearby;
  T.audioWiring.zoneCache.clear();
  return { interior, courtyard, street, open, pole, real: T.Debug.AudioZone().zone };
});
Check("头顶有屋顶 → interior", zones.interior === "interior", zones.interior);
Check("三面墙围着 → courtyard", zones.courtyard === "courtyard", zones.courtyard);
Check("一面墙 → street", zones.street === "street", zones.street);
Check("四下无遮 → open", zones.open === "open", zones.open);
Check("头顶只有一根杆子不算屋里", zones.pole === "open", zones.pole);
Check("真地图上的空间档取得到值", ["interior", "courtyard", "street", "open"].includes(zones.real),
  `第一关出生点：${zones.real}`);

// ---------------------------------------------------------------------------
// 5) 掷弹筒发射 → launcherPop（这条配方在这次接线之前从来没有被调用过）
// ---------------------------------------------------------------------------
const launcher = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const before = T.audio.RequestedCount("launcherPop");
  const beforeIncoming = T.audio.RequestedCount("shellIncoming");
  T.combat.CallIncoming("launcher", T.player.position.clone());
  return {
    pop: T.audio.RequestedCount("launcherPop") - before,
    incoming: T.audio.RequestedCount("shellIncoming") - beforeIncoming,
  };
});
Check("掷弹筒发射 → 请求 launcherPop", launcher.pop === 1, `请求 ${launcher.pop} 条`);
Check("落点啸声照旧", launcher.incoming === 1, `请求 ${launcher.incoming} 条`);

// ---------------------------------------------------------------------------
// 6) 爆炸三档 + 落屑
// ---------------------------------------------------------------------------
const blast = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const L = T.audio.listenerPos;
  // Blast 内部要 clone()：这条链上传的一律是 THREE.Vector3，不能拿字面量顶。
  const At = (m) => T.player.position.clone().set(L.x + m, L.y, L.z);
  const Count = () => ["explosionNear", "explosionMid", "explosionFar", "debrisFall"]
    .reduce((o, n) => (o[n] = T.audio.RequestedCount(n), o), {});
  const Delta = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, b[k] - a[k]]));
  const b0 = Count(); T.combat.Blast(At(15), 6, 120, "grenade"); const near = Delta(b0, Count());
  const b1 = Count(); T.combat.Blast(At(60), 6, 120, "shell"); const mid = Delta(b1, Count());
  const b2 = Count(); T.combat.Blast(At(200), 6, 120, "shell"); const far = Delta(b2, Count());
  return { near, mid, far };
});
Check("15 m 的爆炸走 explosionNear", blast.near.explosionNear === 1,
  JSON.stringify(blast.near));
Check("60 m 的爆炸走 explosionMid（原来这一档并入 explosionFar）",
  blast.mid.explosionMid === 1, JSON.stringify(blast.mid));
Check("200 m 的爆炸走 explosionFar", blast.far.explosionFar === 1, JSON.stringify(blast.far));
Check("近炸之后有落屑、远炸没有",
  blast.near.debrisFall >= 2 && blast.far.debrisFall === 0,
  `近 ${blast.near.debrisFall} / 远 ${blast.far.debrisFall}`);

// ---------------------------------------------------------------------------
// 7) 玩家开枪走分层 + 压环境；跳弹只在硬面上出
// ---------------------------------------------------------------------------
const player = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const audio = T.audio;
  const ducks = [];
  const realDuck = audio.DuckAmbience;
  audio.DuckAmbience = (...a) => { ducks.push(a); return realDuck?.apply(audio, a); };
  const gunshots = [];
  const realGunshot = audio.PlayGunshot;
  audio.PlayGunshot = function patched(name, opts) { gunshots.push({ name, opts }); return realGunshot.call(this, name, opts); };
  T.state.ammo = 5;
  T.Debug.Fire();
  audio.DuckAmbience = realDuck;
  audio.PlayGunshot = realGunshot;

  // 跳弹：硬面 25% 概率、软面一律不跳。种子固定 → 数是确定的。
  const w = T.audioWiring;
  const Count = () => audio.RequestedCount("ricochet");
  const b0 = Count();
  for (let i = 0; i < 200; i += 1) w.Ricochet({ x: 0, y: 0, z: 0 }, "brick", i);
  const brick = Count() - b0;
  const b1 = Count();
  for (let i = 0; i < 200; i += 1) w.Ricochet({ x: 0, y: 0, z: 0 }, "dirt", i);
  const dirt = Count() - b1;
  return {
    ducks: ducks.length, duckArgs: ducks[0] || null,
    gunshot: gunshots[0] ? { name: gunshots[0].name, firstPerson: !!gunshots[0].opts?.firstPerson,
      weaponClass: gunshots[0].opts?.weaponClass || null } : null,
    brick, dirt,
  };
});
Check("玩家开枪走 PlayGunshot 且带 firstPerson / weaponClass",
  !!player.gunshot && player.gunshot.firstPerson && !!player.gunshot.weaponClass,
  JSON.stringify(player.gunshot));
Check("玩家开枪后压了一次环境床", player.ducks === 1,
  `调了 ${player.ducks} 次，参数 ${JSON.stringify(player.duckArgs)}`);
Check("硬面跳弹约四分之一（200 次里 30—75 次）",
  player.brick >= 30 && player.brick <= 75, `${player.brick}/200`);
Check("土面一次都不跳", player.dirt === 0, `${player.dirt}/200`);

// ---------------------------------------------------------------------------
// 8) 身体 foley：姿态切换出布料声、冲刺出装具声与喘息
// ---------------------------------------------------------------------------
const body = await page.evaluate(() => {
  const T = window.Taierzhuang, w = T.audioWiring, a = T.audio;
  const p = T.player;
  p.grounded = true;
  const c0 = a.RequestedCount("clothMove");
  p.stance = p.stance === "crouch" ? "stand" : "crouch";
  w.Update(1 / 60, T.state.frame);
  const cloth = a.RequestedCount("clothMove") - c0;

  const g0 = a.RequestedCount("gearRattle");
  const b0 = a.RequestedCount("breathHeavy");
  p.sprint = 1;
  for (let i = 0; i < 300; i += 1) w.Update(1 / 60, T.state.frame + i);   // 5 秒冲刺
  p.sprint = 0;
  return {
    cloth,
    gear: a.RequestedCount("gearRattle") - g0,
    breath: a.RequestedCount("breathHeavy") - b0,
  };
});
Check("姿态切换 → clothMove", body.cloth === 1, `请求 ${body.cloth} 条`);
Check("冲刺五秒 → 装具声约每 0.9 s 一记（4—7 记）",
  body.gear >= 4 && body.gear <= 7, `请求 ${body.gear} 条`);
Check("冲刺过三秒 → 开始喘", body.breath >= 1, `请求 ${body.breath} 条`);

// ---------------------------------------------------------------------------
// 8.5) 火焰点声源：挂在 vfx 的火焰发射器上，同时最多四条（最近的优先）
// ---------------------------------------------------------------------------
const fire = await page.evaluate(async () => {
  const T = window.Taierzhuang, w = T.audioWiring, a = T.audio;
  const L = a.listenerPos;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 摆六个火头（上限是四条）：三个近的、三个远一点的，全在可听半径内。
  const handles = [];
  for (let i = 0; i < 6; i += 1) {
    handles.push(T.vfx.SceneEffect(
      { x: L.x + 4 + i * 3, y: L.y - 1, z: L.z + 4 }, "FireMedium", { scale: 1 }));
  }
  const before = a.RequestedCount("fireSpot");
  // 一帧只起一条（同名 cue 的 22 ms 去重窗），所以要推够帧数。
  for (let i = 0; i < 10; i += 1) { w.Update(1 / 60, T.state.frame + i); await sleep(16); }
  const started = a.RequestedCount("fireSpot") - before;
  const voices = w.fireVoices.size;
  // 摘掉火头之后声音要跟着停
  for (const h of handles) T.vfx.RemoveSceneEffect(h);
  w.fireRescanAt = 0;
  w.Update(1 / 60, T.state.frame + 99);
  const after = w.fireVoices.size;
  return { started, voices, after };
});
Check("火场挂上循环点声源，同时最多四条", fire.voices === 4 && fire.started >= 1,
  `起了 ${fire.started} 条、在挂 ${fire.voices} 条`);
Check("火头被摘掉之后声音跟着停", fire.after === 0, `还剩 ${fire.after} 条`);

// ---------------------------------------------------------------------------
// 8.6) 遮挡只算一层：起伏地面上的炮弹必须响，而且不许被压两遍
//
// 用户原话「有时候经常炮弹爆炸都没声音」。取证（2026-09-09，phase=1）：
//   · 宿主 Script_Combat 算一遍遮挡 → 接线层 ×0.5 + airCut 900；
//   · 引擎 Script_Audio.Play 拿**同一条探针**又算一遍 → −12 dB 干声 + 800 Hz。
//   两层叠起来 −18.0 dB + 一道 800 Hz 砖墙。32 发取样里 13 发吃了双份。
//   而且探针本身还在假报：射线终点就是爆心那个**贴地**的点，六十米的射线全程
//   只降 1.6 m，30 cm 厚的路基板都拦得住 —— 72 个采样点 29 个判成挡住，
//   把终点抬到 2 m 只剩 18 个。
//
// 这条断言盯三件事，缺一件都会让那个 bug 悄悄回来：
//   ① 出声率 100%（priority 的爆炸本来就不该被任何一道闸吃掉）；
//   ② 探针说通透的那些，干声与"强制 occlusion=0"的参考值**一模一样**（−3 dB 以内）；
//   ③ 任何一发的干声都不许低于参考值 −12.5 dB —— 那是引擎单层的上限，
//      低于它就说明又有人在别处加了第二层。
// ---------------------------------------------------------------------------
const shellOcc = await page.evaluate(async () => {
  const T = window.Taierzhuang, a = T.audio, w = T.audioWiring;
  const P = T.player.position;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  a.Ambience("silence"); a.Music(null);
  await sleep(200);
  const rows = [];
  const Dry = (v) => (v ? v.effectiveGain * (v.occGain ? v.occGain.gain.value : 1) : 0);
  for (const dist of [60, 120]) {
    for (let b = 0; b < 6; b += 1) {
      const ang = (b / 6) * Math.PI * 2 + 0.31;
      const x = P.x + Math.cos(ang) * dist, z = P.z + Math.sin(ang) * dist;
      const y = T.battlefield.GroundHeight(x, z);
      // 真实一发：走 Combat.Blast → AudioWiring.Blast → Play 的完整链路。
      w.occCache.clear(); a.occCache.clear();
      const seen = [];
      const origPlay = a.Play.bind(a);
      a.Play = (n, o = {}) => { const v = origPlay(n, o); if (n.startsWith("explosion")) seen.push({ n, o, v }); return v; };
      try { T.combat.Blast(P.clone().set(x, y, z), 6.5, 0, "shell", null, false, null, "Shell82"); }
      finally { a.Play = origPlay; }
      const got = seen[0] || null;
      const cue = got ? got.n : null;
      const eye = a.listenerPos;
      await sleep(150);
      // 参考：**同一条 cue**（三档分界由接线层挑，不在这儿重算一遍）、同一位置、
      // 同一音量、显式 occlusion=0（那一路不查探针）。
      w.occCache.clear(); a.occCache.clear();
      // 音量写死成接线层该给的那一份（Clamp(radius/8, .5, 1.2)，半径 6.5 → 0.8125），
      // **不许抄 got.o.volume** —— 双层遮挡回归时正是这个值被偷偷减半的，
      // 抄它等于拿被改过的值当基准，那条断言就永远绿。
      const ref = cue
        ? a.Play(cue, { position: { x, y, z }, volume: 0.8125, priority: true, occlusion: 0 })
        : null;
      const refDry = Dry(ref);
      if (ref) a.StopVoice(ref);
      w.occCache.clear();
      rows.push({
        dist, b, cue,
        played: !!(got && got.v),
        probe: w.Occlusion({ x: eye.x, y: eye.y, z: eye.z }, { x, y, z }),
        volIn: got ? (got.o.volume ?? 1) : null,
        airCutIn: got ? (got.o.airCut || 0) : null,
        occ: got && got.v ? got.v.occ : null,
        db: got && got.v && refDry > 0 ? 20 * Math.log10(Dry(got.v) / refDry) : null,
      });
      await sleep(150);
    }
  }
  return rows;
});
const blastSilent = shellOcc.filter((r) => !r.played);
Check("60/120 m 落在起伏地面上的炮弹，出声率 100%", blastSilent.length === 0,
  blastSilent.length ? `哑的：${blastSilent.map((r) => `${r.dist}m#${r.b}`).join(" ")}`
    : `${shellOcc.length} 发全响`);
const doubled = shellOcc.filter((r) => r.volIn !== null && (r.volIn < 0.8 || r.airCutIn > 0));
Check("接线层不再叠第二层遮挡（音量与 airCut 原样交给引擎）", doubled.length === 0,
  doubled.length ? doubled.map((r) => `${r.dist}m#${r.b} vol=${r.volIn} airCut=${r.airCutIn}`).join(" ")
    : `${shellOcc.length} 发都是原音量、airCut=0`);
const clearRows = shellOcc.filter((r) => r.probe === 0 && r.db !== null);
const clearBad = clearRows.filter((r) => r.db < -3);
Check(`探针说通透的 ${clearRows.length} 发，干声不低于无遮挡值 −3 dB`, clearBad.length === 0,
  clearBad.length ? clearBad.map((r) => `${r.dist}m#${r.b} ${r.db.toFixed(1)}dB`).join(" ")
    : `最差 ${clearRows.length ? Math.min(...clearRows.map((r) => r.db)).toFixed(2) : 0} dB`);
// 引擎单层的地板是 OCCLUSION_DRY_DB = −12 dB；比它还低就是又冒出来一层。
const overAtten = shellOcc.filter((r) => r.db !== null && r.db < -12.5);
Check("最凶的一发也只吃一层遮挡（≥ −12.5 dB）", overAtten.length === 0,
  overAtten.length ? overAtten.map((r) => `${r.dist}m#${r.b} ${r.db.toFixed(1)}dB occ=${r.occ}`).join(" ")
    : `最低 ${Math.min(...shellOcc.filter((r) => r.db !== null).map((r) => r.db)).toFixed(1)} dB`);

// ---------------------------------------------------------------------------
// 8.7) 三米外同伴的一句轻声台词：不许被空间链改味
//
// 用户原话「人物讲话那个轻的也非常奇怪」。取证：喊话与台词的坐标是**脚底**，
// 而 Zone 探针从脚底往上打的那条射线会撞在自己脚下那块路基板（`embankment`，
// 实测 9.3 × 15.2 m 却只有 0.34 m 厚）的上表面上 —— 开阔地 40 个采样点里
// 贴地那一档 12 个（30%）被判成 interior。后果是混响换成室内 IR，
// 而且听者在 open、声源在 interior 会叠一档 ZONE_BOUNDARY_OCC：
// −4.2 dB 干声 + 低通压到 6.5 kHz。三米外的一句耳语被这么一过，当然发闷发虚。
//
// **电平那一档不在这里测**：每条录音的有声段 RMS 与 Data_Voice.VOICE_DELIVERY
// 对不对得上由 Script_VoiceTest 守着（它离线解码全部 157 条）。这一层守的是
// 「运行时链路有没有把那个电平改掉」—— 干声不许被遮挡节点动，
// 也不许被扔进远声组（玩家一开枪整组 −6 dB）。
// ---------------------------------------------------------------------------
// 声库是异步解码的（157 条 MP3），开机 20 帧之后远没有载完。
// 连续几次采样 size 不变才算稳 —— 只等 `size > 0` 会拿到前几条战场口令，
// 里面一条章节台词都没有（delivery 字段只在 story 行上）。
await page.evaluate(async () => {
  const a = window.Taierzhuang.audio;
  let last = -1, same = 0;
  for (let i = 0; i < 120 && same < 4; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (a.voiceBank.size === last) same += 1; else { same = 0; last = a.voiceBank.size; }
  }
});
const speak = await page.evaluate(async () => {
  const T = window.Taierzhuang, a = T.audio, w = T.audioWiring;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = T.player.position;
  const rows = [];
  const bank = [...a.voiceBank.values()];
  for (const delivery of ["whisper", "weak", "normal", "shout"]) {
    const e = bank.find((q) => q.delivery === delivery && q.kind === "story");
    if (!e) { rows.push({ delivery, missing: true }); continue; }
    // 三米外的同伴。y 就是**脚底**（Script_Ai 的 Bark 与宿主给的坐标都是这个）。
    const x = P.x + 2.6, z = P.z + 1.5, y = T.battlefield.GroundHeight(x, z);
    w.occCache.clear(); w.zoneCache.clear(); a.occCache.clear(); a.listenerZone = null;
    a.StopStoryVoice();
    const r = a.PlayStoryVoice(e.key, { position: { x, y, z } });
    const v = r && r.voice;
    rows.push({
      delivery, key: e.key, played: !!v,
      occ: v ? v.occ : null,
      zone: v ? v.reverbZone : null,
      farGrouped: v ? !!v.farGrouped : null,
      // 干声有没有被遮挡节点动过：occ = 0 时 Play 根本不建这个节点。
      dryTouched: !!(v && v.occGain),
      // 运行时电平 = 调用方音量 × MIX_GAIN（声库条目的 gain，缺省 1）。
      // 四档 delivery 的差是**烘进录音**的，运行时不许再动。
      gain: v ? +v.baseGain.toFixed(4) : null,
      mix: e.gain ?? 1,
    });
    await sleep(150);
    a.StopStoryVoice();
  }
  return rows;
});
const speakGot = speak.filter((r) => !r.missing);
Check("四档 delivery 各取一条章节台词", speakGot.length === 4,
  speak.filter((r) => r.missing).map((r) => r.delivery).join(" ") || "四档齐");
const speakBad = speakGot.filter((r) => !r.played || r.occ !== 0 || r.zone === "interior"
  || r.farGrouped || r.dryTouched || Math.abs(r.gain - r.mix) > 1e-6);
Check("三米外同伴的台词：遮挡 0、不在室内档、不进远声组、干声未被改",
  speakBad.length === 0,
  speakBad.length ? speakBad.map((r) => `${r.delivery} occ=${r.occ} zone=${r.zone} `
    + `far=${r.farGrouped} dry=${r.dryTouched} gain=${r.gain}/${r.mix}`).join("；")
    : speakGot.map((r) => `${r.delivery}:${r.zone}`).join(" "));

// ---------------------------------------------------------------------------
// 8.8) 弹啸不许比开枪那个人还响，也不许连成一片
//
// 用户原话「子弹呼啸而过这声音也很难听」。取证（2026-09-09，phase=1，实拍峰值）：
//   · 干声有效电平**恒为 0.765**，与开枪的人在 30 / 80 / 150 m 完全无关，
//     而那三档的本体枪声分别只有 0.110 / 0.033 / 0.012 —— 高出 17 / 27 / 36 dB；
//     实拍峰值 0.338 对**玩家自己那一枪的 0.214**，耳边一发擦过去比自己扣扳机还响 4 dB。
//   · 近失点是照 `miss = 0.4 + rnd × 1.4` 摆的，与距离无关。真弹道到听者的最近距离
//     中位数：30 m 上 1.89 m、80 m 上 5.91 m、150 m 上 3.81 m ——
//     **80 / 150 m 两档一发都没进过 2.6 m**，那两档的弹啸从来就不该存在。
//   · 限速上限是 30 条/秒（同帧 2 + 100 ms 内 3），每条都带 priority 绕开两道闸。
//   · 环境床还在按 perMin 5 撒另一条 `amb.whizz`（非空间化、随机 pan、不吃空气低通，
//     实拍峰值 0.209），与逐弹那套同时在响。
//
// 这一节盯四件事，缺一件那个 bug 就能悄悄回来：
//   ① 150 m 上连续射击 20 s，弹啸 ≤ 7 条/秒（限速 150 ms 一条的上限是 6.7）；
//   ② 弹啸的实拍峰值 ≤ **同一发子弹的枪声本体**峰值（30 / 150 m 各量一遍）；
//   ③ 20 s 里末端限幅的 reduction 不到 −3 dB（弹啸不再把总线顶到限幅器里）；
//   ④ 30 m 外那一枪的**本体**比弹啸晚 d/340 到（priority 不再免传播延迟）。
// `amb.whizz` 那一条在 node 侧读 AMBIENCE_PRESETS 直接判（见文件末）。
//
// **量的是峰值不是请求数**：这一节与 8.6 / 8.7 同一类 —— 用户报的是「声音在，
// 但被链路改得难听」，请求数对这类事没有分辨力（改之前 37 条断言全绿）。
// ---------------------------------------------------------------------------
const whiz = await page.evaluate(async () => {
  const T = window.Taierzhuang, a = T.audio, w = T.audioWiring;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 素材包是异步 fetch 的：不等它，量到的是合成回落那条路（配平是另一张表）。
  for (let i = 0; i < 120; i += 1) {
    if (a.sampleCues?.has("bulletCrack") && a.sampleCues?.has("rifleIja")) break;
    await sleep(500);
  }
  // 让整场仗闭嘴：峰值这种判据经不起旁边有人开枪。三件事缺一不可 ——
  //   · **停掉 ai.Update**：只把 ammo 清零是不够的，没子弹的兵会喊「换弹」、
  //     会拼刺刀，实测底噪 0.341（voice.ija_ammo_reload / dadaoHit / stripperLoad）。
  //     停掉之后场上只剩这一节自己调的那几发 —— 开火照旧由本节直调 TryFire。
  //   · `w.Reset()`：上面 8.5 节点了一整场火、冲刺那一节把玩家喘了起来，
  //     那两样都是**一直在响**的循环，不停掉底噪就有 0.035（≈ 150 m 那一枪的量级）。
  //   · 环境床与音乐清掉。
  const origAiUpdate = T.ai.Update.bind(T.ai);
  T.ai.Update = () => {};
  for (const s of T.ai.soldiers) { s.ammo = 0; s.coolUntil = 1e9; }
  w.Reset();
  a.Ambience("silence"); a.Music(null); a.StopStoryVoice?.();
  const savedBudget = a.nodeBudget;
  a.nodeBudget = 4000;                 // 这一节量电平，不量预算闸
  await sleep(700);

  const ana = a.ctx.createAnalyser();
  ana.fftSize = 1024;
  a.outGain.connect(ana);
  const buf = new Float32Array(ana.fftSize);
  // **量峰值的那 400 ms 里只许这一条 cue 发声。** 停掉 ai.Update 还不够干净：
  // 白刃、剧情语音、上一节留下来的尾巴都还在总线上（实测底噪 0.26，
  // 已经超过 150 m 那一枪本身），拿被污染的窗口比两条 cue 的峰值等于抛硬币。
  // 白名单是最省事也最确定的做法：进窗前把还在响的全部淡掉，窗内挡住所有别的 cue。
  const realPlay = a.Play.bind(a);
  let allow = null;                    // null = 全放行（量完就还回去）
  a.Play = (n, o = {}) => (allow && !allow.test(n) ? null : realPlay(n, o));
  async function Peak(fn, ms = 420, only = /^$/) {
    allow = only;
    for (const v of [...a.activeVoices]) { try { a.StopVoice(v, 0.01); } catch (e) { /* ok */ } }
    await sleep(220);
    let pk = 0;
    if (fn) fn();
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      ana.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i += 1) { const x = Math.abs(buf[i]); if (x > pk) pk = x; }
      await new Promise((r) => setTimeout(r, 4));
    }
    allow = null;
    return pk;
  }
  const CRACK_ONLY = /^bullet(Crack|Whizz)$/;
  const GUN_ONLY = /^(rifleIja|rifleIjaFar|gunTail)/;
  // **八次的平均峰值**。白名单把窗口清干净之后（底噪 0.0015）污染没有了，
  // 剩下的抖动全部来自**变体**：弹啸四条、rifleIja 也是四条，逐条峰值本来就差几个 dB。
  //   · 取最小 / 中位数 = 在两组随机抽样之间比大小，同一份代码跑两遍差 4 dB；
  //   · 取最大值也不稳 —— 本体那四条是**随机挑**的（弹啸已经进 SAMPLE_CYCLE 轮播），
  //     六次里抽不到最响那条的概率 (3/4)^6 = 18%，抽不到就把基准量低了。
  // 八次取平均：弹啸那边正好轮满两圈（确定值），本体那边八次抽样的均值已经很稳。
  const Med = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;

  const L = a.listenerPos;
  const floor = Med([await Peak(null), await Peak(null), await Peak(null)]);
  // 底噪超标时要能一眼看出是谁在响，否则这条断言只会变成一句「不知道为什么红了」。
  const floorVoices = [...new Set([...a.activeVoices].map((v) => v.name))].join(" ");

  // ② 峰值对比：走**真的 BulletPass**（近场律 + 本体上限都在里面），
  //    对照同一把枪同一距离的 PlayGunshot。
  const levels = [];
  for (const [shooterM, passM] of [[30, 0.5], [30, 2.0], [150, 0.5], [150, 2.0]]) {
    const at = { x: L.x + passM, y: L.y, z: L.z };
    const crack = [], gun = [];
    for (let i = 0; i < 8; i += 1) {
      w.lastCrackAt = -99; w.lastCrackM = 99; w.crackFrame = -1; w.crackInFrame = 0;
      a.lastPlayAt.delete("bulletCrack"); a.lastPlayAt.delete("bulletWhizz");
      crack.push(await Peak(() => w.BulletPass(at, passM, false, "rifleIja", shooterM),
        420, CRACK_ONLY));
      a.lastPlayAt.delete("rifleIja"); a.lastPlayAt.delete("rifleIjaFar");
      gun.push(await Peak(() => a.PlayGunshot("rifleIja",
        { position: { x: L.x, y: L.y - 1.0, z: L.z - shooterM }, volume: 1 }), 900, GUN_ONLY));
    }
    levels.push({ shooterM, passM,
      crack: +Med(crack).toFixed(4), gun: +Med(gun).toFixed(4),
      db: +(20 * Math.log10((Med(crack) + 1e-9) / (Med(gun) + 1e-9))).toFixed(1) });
  }

  // 玩家自己那一枪：整局里玩家听得最多、也最响的一条参照。用户原话
  // 「子弹呼啸而过这声音也很难听」对应的正是这条比值 —— 改之前弹啸实拍峰值 0.338
  // 比自己扣扳机的 0.214 还高 4.0 dB。
  const own = Med(await Promise.all([]).then(async () => {
    const xs = [];
    for (let i = 0; i < 8; i += 1) {
      a.lastPlayAt.clear();
      xs.push(await Peak(() => a.PlayGunshot("rifleNra",
        { position: { x: L.x, y: L.y, z: L.z - 0.4 }, volume: 1,
          priority: true, firstPerson: true, weaponClass: "rifle" }), 900,
      /^(rifleNra|rifleNraFar|gunTail)/));
    }
    return xs;
  }));

  // ①③ 150 m 连续射击 20 s：密度与限幅。
  // **要一支栓动步枪**：第一个活着的日军实测抽到的是九二式重机枪手（weapon.kind
  // "hmg" → cue `type92`），拿它量「本体晚多少到」会去等一条根本没播的 rifleIja。
  const soldier = T.ai.soldiers.find((s) => s.side === "ija" && !s.unarmed
    && s.weapon?.kind === "boltRifle") || T.ai.soldiers.find((s) => s.side === "ija" && !s.unarmed);
  soldier.alive = true; soldier.hp = 100;
  const player = T.player;
  const Arm = (D) => {
    soldier.position.set(player.position.x, player.position.y, player.position.z - D);
    soldier.target = { isPlayer: true, position: player.position };
    soldier.targetVisible = true;
    soldier.yaw = Math.atan2(-(player.position.x - soldier.position.x),
      -(player.position.z - soldier.position.z));
    soldier.ammo = 99; soldier.coolUntil = -1; soldier.suppression = 0;
    soldier.order = "hold"; soldier.burstLeft = 0;
  };
  const before = a.RequestedCount("bulletCrack");
  let redMin = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 20000) {
    Arm(150); T.ai.time += 1 / 60;
    T.ai.TryFire(soldier, 1 / 60, player);
    if (a.limiter.reduction < redMin) redMin = a.limiter.reduction;
    await sleep(16);
  }
  const secs = (performance.now() - t0) / 1000;
  const far = { cracks: a.RequestedCount("bulletCrack") - before, secs: +secs.toFixed(1),
    perSec: +((a.RequestedCount("bulletCrack") - before) / secs).toFixed(2),
    redMinDb: +redMin.toFixed(2) };

  // ④ 30 m 外那一枪：弹啸先到、本体晚 d/340。34 m 是因为 PROPAGATION_MIN_M = 30
  //    （正好 30 m 上传播延迟按设计就是 0，量那个点等于量了个寂寞）。
  const seen = [];
  // 真地图上三十四米开外多半横着一堵墙 / 一道路基：那是布设层的账，
  // 这一条量的是「拿到通透这个回答之后，两声的先后差多少」。
  const bf = T.ai.ctx.battlefield;
  const realRaycast = bf.Raycast.bind(bf);
  bf.Raycast = () => null;
  // 「射击线上有自己人就不扣扳机」是队形的账。这一节量的是**两声的先后**，
  // 而三分钟仗打下来三十四米那条线上多半站着自己人（实测 200 次只扣出 1 发扳机，
  // 同一套摆法在 150 m 上一路开火）—— 把这道闸换成「路上没人」。
  const realFriendly = T.ai.FriendlyTorsos.bind(T.ai);
  T.ai.FriendlyTorsos = () => [];
  let fired = 0;
  a.Play = realPlay;                   // 白名单那一层用完了，还回去再钩自己的
  const origPlay = a.Play.bind(a);
  a.Play = (n, o = {}) => {
    const v = origPlay(n, o);
    if (v && /^(bulletCrack|rifleIja|rifleIjaFar|type92|type11|zb26)$/.test(n)) {
      seen.push({ n, startAt: v.startAt, distance: v.distance, prop: v.propagation });
    }
    return v;
  };
  soldier.aimTime = 99; soldier.fireTimer = 0;
  for (let i = 0; i < 200 && !seen.some((e) => e.n === "bulletCrack"); i += 1) {
    Arm(34);
    soldier.playerLockAt = T.ai.time;     // 宽限期内 acc = 0 → 必偏 → 必有近失
    soldier.aimTime = 99; soldier.fireTimer = 0;
    w.lastCrackAt = -99; w.crackFrame = -1; w.crackInFrame = 0;
    w.occCache.clear(); a.occCache.clear();
    a.lastPlayAt.delete("rifleIja"); a.lastPlayAt.delete("rifleIjaFar");
    seen.length = 0;
    const before34 = T.ai.fireCount;
    T.ai.time += 1 / 60;
    T.ai.TryFire(soldier, 1 / 60, player);
    fired += T.ai.fireCount - before34;
    await sleep(20);
  }
  a.Play = origPlay;
  bf.Raycast = realRaycast;
  T.ai.FriendlyTorsos = realFriendly;
  const c = seen.find((e) => e.n === "bulletCrack");
  const g = seen.find((e) => e.n !== "bulletCrack");
  const order = c && g ? { gap: +(g.startAt - c.startAt).toFixed(4),
    want: +(g.distance / 340).toFixed(4), crackProp: c.prop, gunProp: g.prop, fired } : { fired };

  try { a.outGain.disconnect(ana); } catch (e) { /* ok */ }
  a.nodeBudget = savedBudget;
  T.ai.Update = origAiUpdate;
  return { floor: +floor.toFixed(4), floorVoices, levels, far, order,
    own: +own.toFixed(4),
    cycled: !!a.sampleCues?.has("bulletCrack") };
});
Check("测峰值时总线是静的（底噪 < 0.02）", whiz.floor < 0.02,
  `底噪峰值 ${whiz.floor}${whiz.floorVoices ? "，还在响：" + whiz.floorVoices : ""}`);
const loud = whiz.levels.filter((r) => r.crack > r.gun);
Check("弹啸峰值 ≤ 同一发子弹的枪声本体峰值（30 / 150 m × 掠过 0.5 / 2.0 m）",
  loud.length === 0,
  loud.length ? loud.map((r) => `${r.shooterM}m/掠${r.passM}m ${r.crack}>${r.gun}（+${r.db}dB）`).join("；")
    : whiz.levels.map((r) => `${r.shooterM}m/掠${r.passM}m ${r.db}dB`).join(" "));
// 用户原话对应的那条比值：耳边一发擦过去不许比自己扣扳机还响（改之前高 4.0 dB）。
const loudestCrack = Math.max(...whiz.levels.map((r) => r.crack));
const ownDb = 20 * Math.log10((loudestCrack + 1e-9) / (whiz.own + 1e-9));
Check("最响的一条弹啸比玩家自己那一枪低 6 dB 以上", ownDb <= -6,
  `弹啸 ${loudestCrack.toFixed(4)} / 自己那一枪 ${whiz.own}（${ownDb.toFixed(1)} dB）`);
Check(`150 m 连续射击 ${whiz.far.secs} s，弹啸 ≤ 7 条/秒`, whiz.far.perSec <= 7,
  `${whiz.far.cracks} 条 / ${whiz.far.perSec} 条每秒`);
Check("这 20 s 里末端限幅没被顶到 −3 dB", whiz.far.redMinDb > -3,
  `最深 ${whiz.far.redMinDb} dB`);
// `amb.whizz`：环境床按概率撒的那条弹啸。逐弹那套按每一发结算，两套同时在响的话
// 玩家听到的一半弹啸没有位置、没有空气低通、pan 是随机数 —— 那正是「凭空一记」。
// 判据：要么整张表里没人撒它，要么撒播电平比逐弹弹啸低 12 dB 以上。
const ambMix = await page.evaluate(() => {
  const a = window.Taierzhuang.audio;
  return typeof a.LevelAt === "function"
    ? { whizz: a.LevelAt("amb.whizz", 0), crack: a.LevelAt("bulletCrack", 0.5) } : null;
});
const sprinkled = [];
for (const [preset, cfg] of Object.entries(AMBIENCE_PRESETS)) {
  for (const ev of cfg.events || []) {
    if (ev.name !== "amb.whizz") continue;
    const level = (ev.volume || 0) * (ambMix ? ambMix.whizz : 1);
    const ref = NEAR_MISS.crackVolume * (ambMix ? ambMix.crack : 1);
    const db = 20 * Math.log10((level + 1e-9) / (ref + 1e-9));
    if (db > -12) sprinkled.push(`${preset} ${db.toFixed(1)}dB`);
  }
}
Check("环境床不再与逐弹弹啸同时撒 amb.whizz（或低 12 dB 以上）", sprinkled.length === 0,
  sprinkled.length ? sprinkled.join(" ") : `${Object.keys(AMBIENCE_PRESETS).length} 档预设都干净`);
Check("34 m 外：弹啸先到，本体枪声晚 d/340",
  !!whiz.order && whiz.order.gap > 0 && Math.abs(whiz.order.gap - whiz.order.want) < 0.02,
  whiz.order && whiz.order.gap !== undefined
    ? `间隔 ${whiz.order.gap} s（应为 ${whiz.order.want} s，弹啸延迟 ${whiz.order.crackProp}）`
    : `这一轮没抓到成对的弹啸与枪声（开了 ${whiz.order?.fired ?? "?"} 枪）`);

// ---------------------------------------------------------------------------
// 8.9) 战场密度（2026-09-09）
//
// 用户原话「打起来整个战场安安静静的」。这一节量的是那条控制器与它驱动的三层：
// 环境床、远枪扇区、压制弹着，外加 HDR-lite 那条收敛。
//
// **换的是输入不是规则**（与本文件其余几节同一条口径）：AI 的开火节奏、
// 谁在打谁，那是 Script_Ai 与关卡摆兵的账，各有各的闸。这一层量的是
// 「拿到这些输入之后，强度怎么走、床跟不跟、扇区播在哪个方位」。
//
// 时间**按帧推**（`w.Update(1/60, …)`），不等墙钟：二十秒的衰减用真实时间等
// 是二十秒，而且会被这一关自己的 AI 插队 —— 那样的断言是抛硬币不是闸。
// 只有 farGain 那一项必须等真时间（AudioParam 的斜坡在时间轴上跑）。
// ---------------------------------------------------------------------------
const density = await page.evaluate(async () => {
  const T = window.Taierzhuang, a = T.audio, w = T.audioWiring;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 60; i += 1) { if (a.ambBuffers?.size) break; await sleep(300); }
  // 整场仗停掉：这一节量的是控制器，不是这一关此刻的战况。
  const origAiUpdate = T.ai.Update.bind(T.ai);
  T.ai.Update = () => {};
  for (const s of T.ai.soldiers) { s.ammo = 0; s.coolUntil = 1e9; s.target = null; s.lastFire = -999; }
  a.Ambience("smokyDay");                 // 有 battle 床的一档
  a.Music(null);
  await sleep(400);
  const battleLayers = a.ambLayers.filter((l) => l.battle).length;
  const P = T.player;
  let frame = 100000;
  const Step = (seconds) => { for (let i = 0; i < seconds * 60; i += 1) w.Update(1 / 60, frame += 1); };

  // ① 无人开火 20 s。**从满强度起**：要量的是「落得下来没有」。
  w.gunLog.length = 0;
  w.battleIntensity = 1;
  w.lastBlastAt = -99;
  Step(20);
  const quiet = {
    intensity: +w.battleIntensity.toFixed(3),
    bed: +(a.stats.battleBedScale ?? 0).toFixed(3),
    layers: a.ambLayers.filter((l) => l.battle).map((l) => +(l.levelScale ?? 0).toFixed(3)),
    sectorPlays: w.sectorPlays,
  };

  // ② 20 人交火 10 s。喂的是**真的 NoteGunshot**（引擎观察者走的同一条），
  //    8 条/秒、70 m —— 与实机取证里量到的加权速率同一量级。
  const roster = T.ai.soldiers.slice(0, 20);
  const L = a.listenerPos;
  const shotAt = { x: L.x + 40, y: L.y, z: L.z + 57 };     // 70 m 外
  let acc = 0;
  for (let i = 0; i < 10 * 60; i += 1) {
    for (const s of roster) { s.alive = true; s.lastFire = T.ai.time; }
    acc += 8 / 60;
    while (acc >= 1) { acc -= 1; w.NoteGunshot("rifleIja", 70, shotAt, false); }
    w.Update(1 / 60, frame += 1);
  }
  const fight = {
    intensity: +w.battleIntensity.toFixed(3),
    bed: +(a.stats.battleBedScale ?? 0).toFixed(3),
    layers: a.ambLayers.filter((l) => l.battle).map((l) => +(l.levelScale ?? 0).toFixed(3)),
    gunPerS: w.BattleReport().gunPerS,
  };
  // 停火 15 s
  for (const s of roster) s.lastFire = -999;
  Step(15);
  const after = {
    intensity: +w.battleIntensity.toFixed(3),
    bed: +(a.stats.battleBedScale ?? 0).toFixed(3),
  };

  // ③ 200 m 外的枪：被 GUN_CULL_M 剔掉之后，对应扇区要有远场播放，方位要对。
  //    走**引擎的真闸**（PlayGunshot 自己判距离、自己调观察者），不直接喂扇区。
  for (const s of w.sectors) { s.times.length = 0; s.cue = null; s.lastPlayAt = -99; }
  w.sectorBudget.length = 0;
  const realPlay = a.Play.bind(a);
  const fieldPlays = [];
  a.Play = (n, o = {}) => {
    if (o.soundField && o.position) fieldPlays.push({ n, x: o.position.x, z: o.position.z });
    return realPlay(n, o);
  };
  const BEARINGS = [0.35, 2.1, -1.25, -2.9];      // 20° / 120° / −72° / −166°
  const bearingRows = [];
  for (const bearing of BEARINGS) {
    fieldPlays.length = 0;
    for (const s of w.sectors) { s.times.length = 0; s.lastPlayAt = -99; }
    w.sectorBudget.length = 0;
    const far = { x: L.x + Math.sin(bearing) * 200, y: L.y, z: L.z + Math.cos(bearing) * 200 };
    const culledBefore = a.drops.distance;
    for (let i = 0; i < 4; i += 1) a.PlayGunshot("rifleIja", { position: far, volume: 0.02 });
    w.Update(1 / 60, frame += 1);
    const play = fieldPlays[0] || null;
    const deg = (r) => r * 180 / Math.PI;
    // 两个方位角的最小夹角（跨 ±180° 那条缝要绕过去）。
    const AngDiff = (p, q) => Math.abs(((p - q + 540) % 360) - 180);
    const gotDeg = play ? deg(Math.atan2(play.x - L.x, play.z - L.z)) : null;
    bearingRows.push({
      want: Math.round(deg(bearing)),
      got: gotDeg === null ? null : Math.round(gotDeg),
      err: gotDeg === null ? null : +AngDiff(gotDeg, deg(bearing)).toFixed(1),
      cue: play ? play.n : null,
      culled: a.drops.distance - culledBefore,
    });
  }
  a.Play = realPlay;

  // ④ 压制弹着：无人开火时**一记都不许有**；有人在打时每秒 ≥ 1 记。
  w.firedAtPlayerAt = -99; w.lastDirtAt = -99; w.dirtDebt = 0;
  const dirt0 = w.dirtCount;
  for (let i = 0; i < 3 * 60; i += 1) { P.suppression = 0.7; w.Update(1 / 60, frame += 1); }
  const dirtQuiet = w.dirtCount - dirt0;
  const shooter = { x: P.position.x, y: P.position.y, z: P.position.z - 30 };
  const dirt1 = w.dirtCount;
  for (let i = 0; i < 4 * 60; i += 1) {
    P.suppression = 0.7;
    w.NoteFiredAtPlayer(shooter);
    w.Update(1 / 60, frame += 1);
  }
  const dirtFiring = w.dirtCount - dirt1;
  P.suppression = 0;

  // ⑥ farGain：玩家栓动单发不许压远声组。**这一项要等真时间** ——
  //    AudioParam 的斜坡在时间轴上跑，按帧推是推不动它的。
  const keep = [a.farGain].map((dst) => {
    const cs = a.ctx.createConstantSource(); cs.offset.value = 1e-6; cs.connect(dst); cs.start(); return cs;
  });
  const FarProbe = async (cue, wc, intervalMs, shots) => {
    a.farGain.gain.cancelScheduledValues(a.ctx.currentTime);
    a.farGain.gain.value = 1;
    a.lastSelfShotAt = -99;
    await sleep(150);
    let lo = 1;
    for (let i = 0; i < shots; i += 1) {
      a.lastPlayAt.delete(cue);
      a.PlayGunshot(cue, { position: { x: a.listenerPos.x, y: a.listenerPos.y, z: a.listenerPos.z - 0.4 },
        volume: 0.02, priority: true, firstPerson: true, weaponClass: wc });
      for (let k = 0; k * 20 < intervalMs; k += 1) {
        lo = Math.min(lo, a.farGain.gain.value);
        await sleep(20);
      }
    }
    return +lo.toFixed(3);
  };
  const farBolt = await FarProbe("rifleNra", "rifle", 1400, 4);
  const farMg = await FarProbe("zb26", "mg", 130, 12);
  for (const cs of keep) { try { cs.stop(); cs.disconnect(); } catch (e) { /* ok */ } }

  // 还原：后面还有一节要跑。
  T.ai.Update = origAiUpdate;
  w.Reset();
  a.Ambience("silence");
  await sleep(200);
  return { battleLayers, quiet, fight, after, bearingRows, dirtQuiet, dirtFiring, farBolt, farMg };
});

Check("有 battle 床的环境档真的起了 battle 层", density.battleLayers >= 1,
  `smokyDay 起了 ${density.battleLayers} 条随强度涨落的床`);
// 床倍率的判据是 **0.5**，不是 floor 那个 0.34：BattleBedScale 是
// `0.34 + 0.66 × x^0.7`，强度 0.082 上折出来就是 0.455 —— 0.42 那道线是算错的，
// 它要求的是强度严格为 0，而慢落（tau 8 s）按设计二十秒也只落到 0.08。
// 0.5 与交火段的 0.96 之间差 6 dB，「只剩基线」这件事分得清清楚楚。
Check("无人开火 20 s：强度 ≤ 0.1，远层落到基线", density.quiet.intensity <= 0.1 && density.quiet.bed < 0.5,
  `强度 ${density.quiet.intensity}，床倍率 ${density.quiet.bed}（层 ${JSON.stringify(density.quiet.layers)}，floor 0.34）`);
Check("无人开火时远枪扇区一条都不播", density.quiet.sectorPlays === 0,
  `${density.quiet.sectorPlays} 条`);
Check("20 人交火 10 s：强度 ≥ 0.6", density.fight.intensity >= 0.6,
  `强度 ${density.fight.intensity}，加权枪声 ${density.fight.gunPerS} 条/秒`);
Check("battleFar 的增益跟着强度升", density.fight.bed > density.quiet.bed + 0.2
  && density.fight.layers.every((v) => Math.abs(v - density.fight.bed) < 0.02),
  `床倍率 ${density.quiet.bed} → ${density.fight.bed}（层 ${JSON.stringify(density.fight.layers)}）`);
Check("停火 15 s 之后强度与床一起回落", density.after.intensity < density.fight.intensity - 0.2
  && density.after.bed < density.fight.bed - 0.1,
  `强度 ${density.fight.intensity} → ${density.after.intensity}，床 ${density.fight.bed} → ${density.after.bed}`);
const badBearing = density.bearingRows.filter((r) => r.got === null || r.err > 30);
Check("200 m 外被剔除的枪 → 对应扇区有远场播放，方位误差 ≤ 30°", badBearing.length === 0,
  badBearing.length
    ? badBearing.map((r) => `${r.want}° → ${r.got === null ? "没播" : r.got + "°"}`).join("；")
    : density.bearingRows.map((r) => `${r.want}°→${r.got}°(误差${r.err}°,${r.cue})`).join(" "));
Check("没人朝玩家开火时不冒尘土（suppression 0.7 空跑 3 s）", density.dirtQuiet === 0,
  `${density.dirtQuiet} 条`);
Check("suppression 0.7 且有人在打：每秒 ≥ 1 记弹着", density.dirtFiring / 4 >= 1,
  `4 s ${density.dirtFiring} 条（${(density.dirtFiring / 4).toFixed(2)} 条/秒）`);
Check("玩家栓动单发不压远声组（farGain ≥ 0.7）", density.farBolt >= 0.7,
  `单发最低 ${density.farBolt}；自动连发 ${density.farMg}（该压，约 −3 dB）`);
Check("自动连发仍然压远声组，但只压 −3 dB 一档", density.farMg < 0.9 && density.farMg > 0.55,
  `最低 ${density.farMg}`);
// firstLevelFront / South 的 events：node 侧的静态判。这两档原来是空的 ——
// 「第一关整场只有一条风」是用户报的那句话的头号成因，而空表在浏览器里
// 量不出任何异常（没有报错、没有掉音，就是没有声音）。
const frontEmpty = ["firstLevelFront", "firstLevelSouth"].filter(
  (k) => !(AMBIENCE_PRESETS[k]?.events || []).length);
Check("firstLevelFront / firstLevelSouth 的 events 非空", frontEmpty.length === 0,
  frontEmpty.length ? `空的：${frontEmpty.join(" ")}`
    : `${(AMBIENCE_PRESETS.firstLevelFront.events || []).length} / `
      + `${(AMBIENCE_PRESETS.firstLevelSouth.events || []).length} 条`);

// ---------------------------------------------------------------------------
// 9) 每个新 cue 都真的能发声（合成回落这条路）
//
// 素材还没到，所以现在走的就是回落配方。这条与 Script_AudioTest 的"逐条播一遍"
// 重复一半，但那一层跑的是全表 56 条、判据是"有没有 voice"；这里只盯这一批，
// 而且**素材落地之后仍然要绿** —— 那时它测的就变成了采样层。
// ---------------------------------------------------------------------------
const cues = await page.evaluate(async () => {
  const T = window.Taierzhuang, a = T.audio;
  const names = ["bulletCrack", "bulletWhizz", "ricochet", "impactStone",
    "footstepWood", "footstepStone", "footstepGrass", "footstepMud",
    "clothMove", "gearRattle", "breathHeavy", "bodyLand",
    "grenadeBounce", "grenadeRoll", "explosionMid", "debrisFall", "fireSpot",
    "zb26Far", "type11Far", "type92Far",
    "gunTailOpenRifle", "gunTailOpenMg", "gunTailStreetRifle", "gunTailStreetMg",
    "gunTailInteriorRifle", "gunTailInteriorMg"];
  a.Ambience("silence");
  a.Music(null);
  await new Promise((r) => setTimeout(r, 300));
  // 逐条之间要**等够**：这一批里有几条活得很久（fireSpot 4.2 s、三条机枪远场
  // 各 14 个节点、屋内枪尾 20 个），催着播的话节点预算会被前面几条占满，
  // 于是最后两条返回 null —— 那不是「配方哑了」，是「预算没还回来」。
  // 上一版 40 ms 一条正是这么红的（哑的永远是排在最后的 gunTailInterior*）。
  const silent = [];
  const budgetAt = {};
  for (const name of names) {
    let voice = null;
    for (let i = 0; i < 3 && !voice; i += 1) {
      a.lastPlayAt.delete(name);
      voice = a.Play(name, { priority: true, volume: 0.02 });
      if (!voice) await new Promise((r) => setTimeout(r, 400));
    }
    if (!voice) { silent.push(name); budgetAt[name] = a.liveNodes; }
    await new Promise((r) => setTimeout(r, 180));
  }
  return { total: names.length, silent, budgetAt, errorCount: a.errorCount, lastError: a.lastError };
});
Check(`接线批 ${cues.total} 条 cue 全部发得出声`, cues.silent.length === 0,
  cues.silent.length ? `哑的：${cues.silent.join(" ")}（当时 liveNodes ${JSON.stringify(cues.budgetAt)}）`
    : `${cues.total} 条`);
Check("这一批配方零异常", !cues.errorCount, JSON.stringify(cues.lastError));

// ---------------------------------------------------------------------------
if (errors.length) for (const e of errors.slice(0, 8)) Check(e, false);

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) console.log("失败：\n  " + failed.map((r) => r.name).join("\n  "));
process.exit(failed.length ? 1 : 0);
