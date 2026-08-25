// 目标识别（准心指着谁）的真浏览器回归。走真实的 Frame → IdentifySystem → HUD 一条链。
//
// 纯几何那一半由 Script_HudPromptTest 在 Node 里守（锥宽、姿态、尸体、hold）。
// 这里守的是**接线**：卡片真的画出来了、颜色对、距离随人动、被墙挡住不认、
// 写实档整条链关掉 —— 这几条只有把真场景跑起来才证得了。
//
// 用法：node Taierzhuang1938/Script_TargetInfoTest.mjs

import os from "node:os";
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
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

let failed = 0;
function Check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=2&quality=medium&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, { timeout: 180000 });

  const report = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const V = T.player.position.constructor;
    T.player.health = 100;
    T.player.spawnGrace = 99;

    // 全场的人先挪到九百米外：这一组断言要能说清"卡片上的是我们摆的那一个"。
    for (const s of T.ai.soldiers) {
      s.position.x += 900;
      s.body?.Teleport(s.position.x, s.position.y, s.position.z);
    }

    const Read = () => {
      const e = document.querySelector(".hudTarget");
      const style = getComputedStyle(e);
      const evidence = T.Debug.Target();
      return {
        on: e.classList.contains("on"),
        opacity: Number.parseFloat(style.opacity),
        cls: e.className,
        title: e.querySelector(".tTitle").textContent,
        meta: e.querySelector(".tMeta").textContent,
        aria: e.getAttribute("aria-label"),
        bar: getComputedStyle(e.querySelector(".tBar")).display !== "none",
        // 底板撤了：卡片自己不许再画任何背景（见 Style_Game.css .hudTarget 的账）。
        plate: `${style.backgroundImage} ${style.backgroundColor}`,
        entityId: evidence.entityId,
        detail: evidence.detail,
        rays: evidence.stats.rays,
        friendlyReticle: document.querySelector(".hudCrosshair").classList.contains("friendly"),
      };
    };

    // 把某个人摆到玩家正前方 metres 处，再把准心真的压到他躯干上。
    // 摆位一律沿**水平**方位角走（clearYaw 是按水平射线验的）：
    // 拿带俯仰的 AimDirection 去摆，人会被摆到地底下，随后整组断言都读成"被挡住"。
    const Put = (soldier, metres, yawOffset = 0) => {
      const eye = T.player.EyePosition.clone();
      const yaw = T.player.yaw + yawOffset;
      const x = eye.x - Math.sin(yaw) * metres;
      const z = eye.z - Math.cos(yaw) * metres;
      const y = T.battlefield.GroundHeight(x, z);
      soldier.position.set(x, y, z);
      soldier.body?.Teleport(x, y, z);
      soldier.stance = 0;
      soldier.crouchBlend = 0;
      soldier.proneBlend = 0;
      T.player.yaw = yaw;
      T.player.pitch = Math.atan2((y + 0.95) - eye.y, metres);
      T.player.aimYaw = 0;
      T.player.aimPitch = 0;
      T.StepFrames(3);
    };

    // 先找一条 40 m 内没有遮挡的射界（滕县城内多半正贴着一堵墙站着）。
    const probe = new V();
    let clearYaw = null;
    for (let k = 0; k < 48 && clearYaw === null; k += 1) {
      const y = (k / 48) * Math.PI * 2;
      probe.set(-Math.sin(y), 0, -Math.cos(y));
      if (!T.battlefield.Raycast(T.player.EyePosition, probe, 40)) clearYaw = y;
    }
    // 每一组断言开始前都回到这条验过的射界：中途转过身之后再摆人，
    // 人会被摆进墙里，整组读数都会退化成"被挡住"。
    const Face = () => {
      T.player.yaw = clearYaw ?? 0;
      T.player.pitch = 0;
      T.player.aimYaw = 0;
      T.player.aimPitch = 0;
      T.StepFrames(2);
    };
    Face();

    const enemy = T.ai.soldiers.find((s) => s.alive && s.side === "ija");
    const mate = T.ai.soldiers.find((s) => s.alive && s.side === "nra");
    if (!enemy || !mate) return { noTarget: true, clearYaw };

    enemy.weaponId = "Type38";
    enemy.weapon = T.Debug.Weapons ? T.Debug.Weapons().Type38 : enemy.weapon;
    Put(enemy, 22);
    const onEnemy = { ...Read(), id: enemy.id };

    // 出了 detailRangeM（30 m）只报阵营与距离，军衔与番号都收掉。
    Put(enemy, 45);
    const distant = Read();

    // 距离随人动：同一个人挪到 12 m，卡片上的米数必须跟着变。
    Put(enemy, 12);
    const closer = Read();

    // 转开一点点（30 m 上 12° 早就出锥了），hold 之后卡片必须收掉。
    T.player.yaw += 0.21;
    T.StepFrames(3);
    const justLost = Read();
    T.StepFrames(45);
    const lost = Read();

    // 自己人：给姓名、蓝色、准心也转蓝（巷战里不误伤全靠这一条）。
    Face();
    Put(enemy, 200);                       // 敌人挪到识别范围外，别来抢锥
    Put(mate, 14);
    const eyeNow = T.player.EyePosition;
    const onMate = {
      ...Read(), id: mate.id, name: mate.identity.name, age: mate.identity.age, alive: mate.alive,
      dist: Math.hypot(mate.position.x - eyeNow.x, mate.position.z - eyeNow.z),
      candidates: T.Debug.Target().stats.candidates,
      rays: T.Debug.Target().stats.rays,
      soldiersNear: T.ai.soldiers.filter((s) => s.alive
        && Math.hypot(s.position.x - eyeNow.x, s.position.z - eyeNow.z) < 60).length,
    };

    // 体验档给血条，标准档不给。
    const difficulty = T.Debug.Tables().DIFFICULTY;
    mate.health = 44;
    T.StepFrames(3);
    const basicWounded = Read();
    difficulty.targetInfo = "full";
    T.StepFrames(3);
    const fullBar = Read();
    difficulty.targetInfo = "basic";
    mate.health = 100;

    // 太远不认：60 m 上限（IDENTIFY.rangeM）。用户实拍到的 95 m 就落在这一档。
    Face();
    Put(mate, 95);
    T.StepFrames(45);
    const tooFar = Read();

    // 被墙挡死不认：找一堵 4—18 m 的墙，把人摆到墙后面。
    Face();
    let walled = null;
    const eye = T.player.EyePosition.clone();
    for (let k = 0; k < 48 && !walled; k += 1) {
      const y = (k / 48) * Math.PI * 2;
      probe.set(-Math.sin(y), 0, -Math.cos(y));
      const hit = T.battlefield.Raycast(eye, probe, 18);
      if (!hit || hit.t < 4) continue;
      T.player.yaw = y;
      T.player.pitch = 0;
      T.StepFrames(2);
      const spot = eye.clone().addScaledVector(probe, hit.t + 2.5);
      const gy = T.battlefield.GroundHeight(spot.x, spot.z);
      mate.position.set(spot.x, gy, spot.z);
      mate.body?.Teleport(spot.x, gy, spot.z);
      T.player.pitch = Math.atan2((gy + 0.95) - eye.y, hit.t + 2.5);
      T.StepFrames(45);
      walled = { ...Read(), wallAt: hit.t };
    }

    // 地形挡得住吗：把人埋到地表下面 3 m，再瞄他的躯干。
    // 这条射线上**没有任何碰撞盒**，只有解析地表 —— 不带 TERRAIN_RAY 的射线会
    // 一路穿过去，卡片照出。用户实拍到的「隔着一道土坎也报出日军」就是这个漏洞。
    Face();
    let buried = null;
    {
      const eye2 = T.player.EyePosition.clone();
      const yaw = clearYaw ?? 0;
      const x = eye2.x - Math.sin(yaw) * 20;
      const z = eye2.z - Math.cos(yaw) * 20;
      const gy = T.battlefield.GroundHeight(x, z);
      mate.position.set(x, gy - 3, z);
      mate.body?.Teleport(x, gy - 3, z);
      T.player.pitch = Math.atan2((gy - 3 + 0.95) - eye2.y, 20);
      T.player.aimYaw = 0;
      T.player.aimPitch = 0;
      T.StepFrames(45);
      const V2 = T.player.position.constructor;
      const dir = T.player.AimDirection(new V2());
      const withTerrain = T.battlefield.Raycast(T.player.EyePosition, dir, 20, { terrain: true });
      const boxesOnly = T.battlefield.Raycast(T.player.EyePosition, dir, 20);
      buried = {
        ...Read(),
        terrainBlocks: !!withTerrain && withTerrain.t < 19.4,
        boxesBlock: !!boxesOnly && boxesOnly.t < 19.4,
      };
    }

    // 写实档：整条链短路（不投射线、没有卡片）。
    Face();
    Put(mate, 12);
    difficulty.targetInfo = false;
    T.StepFrames(45);
    const realistic = Read();
    difficulty.targetInfo = "basic";
    T.StepFrames(3);
    const restored = Read();

    return {
      clearYaw, onEnemy, distant, closer, justLost, lost, onMate,
      basicWounded, fullBar, tooFar, walled, buried, realistic, restored,
    };
  });

  const screenshotPath = path.join(os.tmpdir(), "TaierzhuangTargetInfo.png");
  await page.screenshot({ path: screenshotPath });
  console.log(JSON.stringify({ ...report, screenshotPath, errors }, null, 2));

  Check("准心指着日军：军衔 + 部队番号 + 距离，不报枪",
    !!report.onEnemy?.on && /^日军 (二等兵|一等兵|上等兵|伍长|军曹)$/.test(report.onEnemy.title)
    && /^(步兵第(63|10)联队|机关枪中队|掷弹筒分队) · 22m$/.test(report.onEnemy.meta)
    && !/三八式|十一年式|九二式/.test(report.onEnemy.meta)
    && report.onEnemy.entityId === report.onEnemy.id,
    `${report.onEnemy?.title} / ${report.onEnemy?.meta}`);
  Check("出了三十米只报阵营与距离（军衔番号都读不出来了）",
    report.distant?.on === true && report.distant.title === "日军"
    && /^45m$/.test(report.distant.meta),
    `${report.distant?.title} / ${report.distant?.meta}`);
  Check("敌方用敌色、不带血条（标准档）",
    /theirs/.test(report.onEnemy?.cls || "") && report.onEnemy?.bar === false
    && report.onEnemy?.friendlyReticle === false, report.onEnemy?.cls);
  Check("距离随目标移动刷新", /· 12m/.test(report.closer?.meta || ""), report.closer?.meta);
  Check("目标出锥后先留一小会儿再收",
    report.justLost?.on === true && report.lost?.on === false,
    `justLost=${report.justLost?.on} lost=${report.lost?.on}`);
  Check("准心指着自己人：给姓名、卡片与准心一起转蓝",
    report.onMate?.on && report.onMate.title === report.onMate.name
    && /ours/.test(report.onMate.cls) && report.onMate.friendlyReticle === true,
    `${report.onMate?.title} / ${report.onMate?.cls}`);
  Check("自己人那一行是岁数 + 距离，不报枪",
    new RegExp(`^${report.onMate?.age} 岁 · [0-9]+m$`).test(report.onMate?.meta || ""),
    `${report.onMate?.meta}（${report.onMate?.age} 岁）`);
  Check("识别卡没有底板（不画背景，只靠描边扛读性）",
    /^none rgba\(0, 0, 0, 0\)$/.test(report.onMate?.plate || ""), report.onMate?.plate);
  Check("标准档只给「负伤」两个字，体验档才给血条",
    report.basicWounded?.bar === false && /负伤/.test(report.basicWounded?.meta || "")
    && report.fullBar?.bar === true && report.fullBar?.detail === "full",
    `${report.basicWounded?.meta} / bar=${report.fullBar?.bar}`);
  Check("九十五米外一律不认（>60 m）", report.tooFar?.on === false, report.tooFar?.meta);
  Check("地形挡得住：埋在土里的人不认（名牌不穿土坡）",
    report.buried?.on === false && report.buried?.terrainBlocks === true
    && report.buried?.boxesBlock === false,
    `卡片=${report.buried?.on} 地表挡=${report.buried?.terrainBlocks} 碰撞盒挡=${report.buried?.boxesBlock}`);
  Check("墙后的人不认（名牌不穿墙）",
    report.walled ? report.walled.on === false : false,
    report.walled ? `墙在 ${report.walled.wallAt?.toFixed?.(1)} m` : "没找到合适的墙");
  Check("写实档整条链关掉：不投射线、没有卡片",
    report.realistic?.on === false && report.realistic?.rays === 0
    && report.restored?.on === true,
    `realistic rays=${report.realistic?.rays}`);
  Check("页面无运行时错误", errors.length === 0, errors.slice(0, 2).join(" | "));
} finally {
  await browser.close();
  server.close();
}

if (failed) {
  console.error(`\n目标识别回归失败：${failed} 项。`);
  process.exit(1);
}
console.log("\n目标识别回归全过。");
