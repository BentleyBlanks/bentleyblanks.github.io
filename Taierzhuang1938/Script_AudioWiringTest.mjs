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
    soldier.rnd = () => 0.0714;            // miss = 0.4 + 0.0714×1.4 ≈ 0.5 m
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

  // ③ 限速：同一帧连开五枪，最多只许出 2 条
  T.audioWiring.crackFrame = -1;
  T.audioWiring.crackTimes.length = 0;
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
  Check("同帧连开五枪，弹啸最多出 2 条（限速生效）", crack.burst === 2, `出了 ${crack.burst} 条`);
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
