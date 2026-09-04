// 《滕县 一九三八》跳跃专项回归：真浏览器、真键位、真 Rapier 角色控制器。
// 用法：node Taierzhuang1938/Script_JumpTest.mjs；退出码即成败。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const failures = [];

function Check(name, ok, detail) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name} — ${detail}`);
  if (!ok) failures.push(name);
}

try {
  const port = server.address().port;
  // The planning whitebox now contains large solid blocks, not thin walls.
  // Exercise traversal against the ordinary city courtyard walls in chapter 5.
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?phase=5&shot=1&quality=low&scale=small&menu=0`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(30));

  const jump = await page.evaluate(() => {
    const T = window.Taierzhuang, D = T.Debug;
    // Spawn 之后必须先落定再取基准高度：FindFreeSpot 只保证"站得下"，胶囊仍可能被
    // 物理世界往上顶几米（实测这一点会把 y0 记成腾空中的高度，抬高读出 8.4 m）。
    T.player.Spawn(0, 60, 0);
    T.StepFrames(20);
    T.player.stamina = 1;
    const y0 = T.player.position.y;
    const count0 = D.Jump().count;
    const vault0 = D.Vault().count;
    const stamina0 = T.player.stamina;
    D.Key("Space");
    let peak = y0, sawAir = false, viewMin = Infinity, viewMax = -Infinity;
    let takeoffStamina = stamina0;
    for (let i = 0; i < 70; i += 1) {
      T.StepFrames(1);
      const j = D.Jump();
      if (i === 0) takeoffStamina = T.player.stamina;
      peak = Math.max(peak, j.y);
      sawAir ||= !j.grounded;
      viewMin = Math.min(viewMin, j.viewPitch);
      viewMax = Math.max(viewMax, j.viewPitch);
    }
    const end = D.Jump();
    return {
      count: end.count - count0,
      vaults: D.Vault().count - vault0,
      rise: peak - y0,
      sawAir,
      landed: end.grounded,
      staminaCost: stamina0 - takeoffStamina,
      viewTravel: viewMax - viewMin,
      landImpact: end.landImpact,
    };
  });
  Check("空地 Space 完成一次受限跳跃",
    jump.count === 1 && jump.vaults === 0 && jump.sawAir && jump.landed
      && jump.rise > 0.42 && jump.rise < 0.68,
    `跳跃 +${jump.count} / 翻越 +${jump.vaults} / 抬高 ${jump.rise.toFixed(3)} m / 落地 ${jump.landed}`);
  Check("跳跃有体力、动作与落地反馈",
    jump.staminaCost > 0.06 && jump.viewTravel > 0.08 && jump.landImpact > 0.1,
    `体力 ${jump.staminaCost.toFixed(3)} / 枪身俯仰 ${jump.viewTravel.toFixed(3)} rad / 落地 ${jump.landImpact.toFixed(3)}`);

  const prone = await page.evaluate(() => {
    const T = window.Taierzhuang, D = T.Debug;
    T.player.Spawn(0, 60, 0);
    T.StepFrames(20);
    T.player.stance = "prone";
    const count0 = D.Jump().count;
    const y0 = T.player.position.y;
    D.Key("Space"); T.StepFrames(4);
    return { added: D.Jump().count - count0, rise: T.player.position.y - y0 };
  });
  Check("卧姿不能原地弹起", prone.added === 0 && prone.rise < 0.02,
    `跳跃 +${prone.added} / 抬高 ${prone.rise.toFixed(3)} m`);

  // 助跑加成：跑起来跳必须**明显**比走着跳远、比走着跳高。
  // 加成之前空中水平位移只是"速度 × 固定滞空"，冲刺跳与走路跳之比恒等于速度比
  // （1.72），弧线一模一样 —— 玩家的原话是"跑快了跳也没区别"。
  const run = await page.evaluate(() => {
    const T = window.Taierzhuang, D = T.Debug;
    const Once = (sprint) => {
      T.player.Spawn(0, 60, 0);
      T.StepFrames(20);
      T.player.stamina = 1;
      T.player.yaw = 0;
      D.Key("KeyW", true);
      if (sprint) D.Key("ShiftLeft", true);
      T.StepFrames(90);                                  // 跑到匀速
      const speed = Math.hypot(T.player.velocity.x, T.player.velocity.z);
      const y0 = T.player.position.y;
      let prev = { x: T.player.position.x, z: T.player.position.z };
      D.Key("Space");
      let dist = 0, rise = 0, air = 0, started = false;
      for (let i = 0; i < 90; i += 1) {
        T.StepFrames(1);
        const p = T.player.position;
        if (!D.Jump().grounded) {
          started = true;
          air += 1 / 60;
          dist += Math.hypot(p.x - prev.x, p.z - prev.z);
          rise = Math.max(rise, p.y - y0);
        } else if (started) break;
        prev = { x: p.x, z: p.z };
      }
      D.Key("KeyW", false);
      if (sprint) D.Key("ShiftLeft", false);
      T.StepFrames(30);
      return { speed, dist, rise, air, runK: D.Jump().runK };
    };
    return { walk: Once(false), sprint: Once(true) };
  });
  Check("助跑跳明显比走着跳远",
    run.sprint.dist > run.walk.dist * 1.85 && run.sprint.rise > run.walk.rise + 0.04
      && run.sprint.runK > 0.9,
    `走 ${run.walk.dist.toFixed(2)} m / 冲刺 ${run.sprint.dist.toFixed(2)} m`
      + `（${(run.sprint.dist / run.walk.dist).toFixed(2)}×，速度比 ${(run.sprint.speed / run.walk.speed).toFixed(2)}×）`
      + ` / 抬高 ${run.walk.rise.toFixed(2)}→${run.sprint.rise.toFixed(2)} m`
      + ` / 滞空 ${run.walk.air.toFixed(2)}→${run.sprint.air.toFixed(2)} s`);
  Check("助跑加成压在自动翻越判据附近，不许变成跑酷",
    run.sprint.rise < 0.75 && run.sprint.air < 0.62,
    `冲刺跳抬高 ${run.sprint.rise.toFixed(3)} m / 滞空 ${run.sprint.air.toFixed(3)} s`);
  // 腾空时鼠标必须能转视线，而且要全额落在视线上（枪口偏移不许把它吃掉）。
  // 当前三档难度的 freeAimDeg 都是 0，自由瞄准锥事实上是关的；这条用例守的是
  // "锥重新打开时腾空不许退回枪先动"——Script_Player 里那条 !grounded 直跟。
  const airLook = await page.evaluate(() => {
    const T = window.Taierzhuang, D = T.Debug;
    const Sweep = () => {
      const y0 = T.player.yaw;
      for (let i = 0; i < 3; i += 1) { D.Look(4, 0); T.StepFrames(1); }
      return Math.abs(T.player.yaw - y0);
    };
    T.player.Spawn(0, 60, 0);
    T.StepFrames(20);
    T.player.stamina = 1;
    D.Key("Space");
    T.StepFrames(6);
    const airborne = !D.Jump().grounded;
    const air = Sweep();
    return { air, airborne, aimYaw: Math.abs(T.player.aimYaw) };
  });
  Check("腾空时鼠标照样转视线",
    airLook.airborne && airLook.air > 0.015 && airLook.aimYaw < 1e-3,
    `空中视线 ${airLook.air.toFixed(4)} rad / 枪口残留 ${airLook.aimYaw.toFixed(5)} rad / 在空中=${airLook.airborne}`);

  const vault = await page.evaluate(() => {
    const T = window.Taierzhuang, D = T.Debug, bf = T.battlefield;
    const candidates = bf.colliders.filter((b) => {
      const w = b.max[0] - b.min[0], d = b.max[2] - b.min[2];
      const h = b.max[1] - bf.GroundHeight((b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2);
      return h > 1.0 && h < 2.2 && ((w < 0.6 && d > 2) || (d < 0.6 && w > 2));
    });
    for (const b of candidates.slice(0, 30)) {
      const thinX = b.max[0] - b.min[0] < 0.6;
      const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
      const nx = thinX ? 1 : 0, nz = thinX ? 0 : 1;
      T.player.Spawn(cx - nx * 0.75, cz - nz * 0.75, Math.atan2(-nx, -nz));
      const jump0 = D.Jump().count, vault0 = D.Vault().count;
      D.Key("Space"); T.StepFrames(4);
      if (D.Vault().active) {
        // 翻越途中推鼠标：身体走曲线，脖子照转。原来整帧 return 掉，这半秒画面是僵的。
        const y0 = T.player.yaw;
        let stillVaulting = false;
        for (let i = 0; i < 3; i += 1) { D.Look(4, 0); T.StepFrames(1); stillVaulting ||= D.Vault().active; }
        return {
          found: true, jumps: D.Jump().count - jump0, vaults: D.Vault().count - vault0,
          lookTravel: Math.abs(T.player.yaw - y0), stillVaulting,
        };
      }
    }
    return { found: false, jumps: 0, vaults: 0, lookTravel: 0, stillVaulting: false };
  });
  Check("墙前 Space 保持翻越优先", vault.found && vault.vaults === 1 && vault.jumps === 0,
    `找到=${vault.found} / 翻越 +${vault.vaults} / 跳跃 +${vault.jumps}`);
  Check("翻越途中照样能转视线", vault.stillVaulting && vault.lookTravel > 0.015,
    `翻越中=${vault.stillVaulting} / 视线 ${vault.lookTravel.toFixed(4)} rad`);

  // --- 通行高度阶梯（Data_Traversal）---------------------------------------
  // 这一组守的是用户报的那条：「靠近墙壁跳跃的高度非常高，像是没有重力」。
  // 判据一律从 D.Traversal() 取，测试里不抄数 —— 改表就该连着改行为，不是连着改断言。
  const ladder = await page.evaluate(() => {
    const T = window.Taierzhuang, D = T.Debug, bf = T.battlefield;
    const boundaryConstraint = T.player.world.ConstrainPosition;
    const TR = D.Traversal();
    const Kind = (rise) => (rise < TR.vaultMin ? "step"
      : rise <= TR.vaultMax ? "vault" : rise <= TR.mantleMax ? "mantle" : "blocked");
    // 一堵一堵地摆：长条形、正对着站，才能保证"前面就是它"。
    const Walls = (lo, hi, limit) => {
      const out = [];
      for (const b of bf.colliders) {
        const w = b.max[0] - b.min[0], d = b.max[2] - b.min[2];
        const thinX = w < 0.8 && d > 3, thinZ = d < 0.8 && w > 3;
        if (!thinX && !thinZ) continue;
        const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
        const h = b.max[1] - bf.GroundHeight(cx, cz);
        if (h < lo || h > hi) continue;
        out.push({ cx, cz, thinX, half: (thinX ? w : d) / 2, h });
        if (out.length >= limit) break;
      }
      return out;
    };
    const Approach = (c, gap) => {
      const nx = c.thinX ? 1 : 0, nz = c.thinX ? 0 : 1;
      T.player.Spawn(c.cx - nx * (c.half + gap), c.cz - nz * (c.half + gap), Math.atan2(-nx, -nz));
      T.StepFrames(25);
      T.player.stamina = 1;
    };

    // 1) 空地基准：同一次起跳，空地能抬多高
    T.player.Spawn(0, 60, 0);
    T.StepFrames(20);
    T.player.stamina = 1;
    const openY = T.player.position.y;
    D.Key("Space");
    let openRise = 0;
    for (let i = 0; i < 60; i += 1) { T.StepFrames(1); openRise = Math.max(openRise, T.player.position.y - openY); }

    // 2) 顶着"高过硬顶"的墙：不许爬升、不许触发翻越、连按空格也只能跳那么高
    const wallRows = [];
    for (const c of Walls(TR.mantleMax + 0.4, 9, 14)) {
      Approach(c, 0.45);
      const p0 = { x: T.player.position.x, y: T.player.position.y, z: T.player.position.z };
      const v0 = D.Vault().count;
      D.Key("KeyW", true);
      T.StepFrames(600);                                  // 顶着墙走十秒
      const p1 = { x: T.player.position.x, y: T.player.position.y, z: T.player.position.z };
      const pushPlanar = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      const vPush = D.Vault().count - v0;
      let peak = p1.y;
      for (let k = 0; k < 8; k += 1) {                    // 再连按八次空格
        T.player.stamina = 1;
        D.Key("Space");
        for (let i = 0; i < 40; i += 1) { T.StepFrames(1); peak = Math.max(peak, T.player.position.y); }
      }
      const p2 = T.player.position;
      D.Key("KeyW", false); T.StepFrames(10);
      wallRows.push({
        h: +c.h.toFixed(2),
        pushPlanar: +pushPlanar.toFixed(2), pushRise: +(p1.y - p0.y).toFixed(3),
        spamPlanar: +Math.hypot(p2.x - p1.x, p2.z - p1.z).toFixed(2),
        spamRise: +(peak - p1.y).toFixed(3),
        vaults: D.Vault().count - v0, vaultsWhilePushing: vPush,
      });
    }

    // 3) 分档：真的翻/爬起来之后，动作档位必须与高度对得上，而且 rise 不许越过硬顶
    // 这一节会把玩家摆到全切片几十堵墙前逐堵量高度；测试章的窄走廊空气墙会把
    // 测试机位裁回路线中心，量到的就不再是那堵墙。边界已有自己的真浏览器专项，
    // 只在这一小段暂时断开章节回调，结束后原样接回。
    delete T.player.world.ConstrainPosition;
    const actions = [];
    for (const c of Walls(0.7, TR.mantleMax, 40)) {
      if (actions.length >= 12) break;
      Approach(c, 0.5);
      const y0 = T.player.position.y;
      const before = D.Vault().count;
      D.Key("Space");
      // 采样整段动作：顶点在什么时候到、水平什么时候才开始动
      let peak = y0, peakAt = 0, frames = 0, movedEarly = 0;
      const x0 = T.player.position.x, z0 = T.player.position.z;
      let kind = null, rise = 0;
      for (let i = 0; i < 140; i += 1) {
        T.StepFrames(1);
        const v = D.Vault();
        if (v.active) {
          if (!kind) { kind = v.kind; rise = v.rise; }
          frames += 1;
          if (T.player.position.y > peak) { peak = T.player.position.y; peakAt = frames; }
          if (frames <= 6) {
            movedEarly = Math.max(movedEarly,
              Math.hypot(T.player.position.x - x0, T.player.position.z - z0));
          }
        } else if (kind) break;
      }
      if (!kind || D.Vault().count === before) continue;
      actions.push({
        kind, rise: +rise.toFixed(2), expect: Kind(rise),
        durS: +(frames / 60).toFixed(2), peakRise: +(peak - y0).toFixed(2),
        peakAtK: frames ? +(peakAt / frames).toFixed(2) : 0,
        movedEarly: +movedEarly.toFixed(2),
      });
    }
    if (boundaryConstraint) T.player.world.ConstrainPosition = boundaryConstraint;
    return { TR, openRise: +openRise.toFixed(3), wallRows, actions };
  });

  const wedged = ladder.wallRows.filter((r) => r.pushPlanar < 0.35 && r.spamPlanar < 0.6);
  // 0.12 m 是噪声闸：原地顶墙的样本身下仍有几度的地形起伏与一次贴地吸附，
  // 而这一条要抓的是"顶着墙走十秒白拿半米"那个量级。
  const climbers = wedged.filter((r) => r.pushRise > 0.12);
  Check("顶着高墙走十秒不许被墙「吸」上去",
    wedged.length >= 3 && climbers.length === 0,
    `原地顶墙样本 ${wedged.length} 堵，最大爬升 `
      + `${wedged.length ? Math.max(...wedged.map((r) => r.pushRise)).toFixed(3) : "-"} m`);
  Check("贴墙跳不许超过配置最大跳升（没有重力那条的直接判据）",
    wedged.length >= 3 && wedged.every((r) => r.spamRise <= ladder.TR.jumpRiseMax),
    `空地 ${ladder.openRise.toFixed(3)} m / 贴墙最高 `
      + `${wedged.length ? Math.max(...wedged.map((r) => r.spamRise)).toFixed(3) : "-"} m`
      + ` / 红线 ${ladder.TR.jumpRiseMax} m`);
  // 走开的样本不算数：顶着墙推十秒，人会沿墙滑出去几米，那时正前方早就不是这堵墙了
  //（实测有样本滑了 30 m 走上了土坡）。只有**原地顶着**的那些能证明"墙没让路"。
  Check("高过硬顶的墙一个通行动词都不给",
    wedged.length >= 3 && wedged.every((r) => r.vaults === 0),
    `原地顶墙 ${wedged.length} 堵（${ladder.TR.mantleMax} m 以上），触发翻越/攀爬 `
      + `${wedged.reduce((n, r) => n + r.vaults, 0)} 次；`
      + `沿墙滑走的 ${ladder.wallRows.length - wedged.length} 堵不计`);

  const acts = ladder.actions;
  const misfiled = acts.filter((a) => a.kind !== a.expect);
  Check("翻越/攀爬按高度分档，且从不越过硬顶",
    acts.length >= 4 && misfiled.length === 0
      && acts.every((a) => a.rise <= ladder.TR.mantleMax + 1e-6),
    `${acts.length} 次动作，分档错 ${misfiled.length} 次，最高 `
      + `${acts.length ? Math.max(...acts.map((a) => a.rise)).toFixed(2) : "-"} m`
      + `（硬顶 ${ladder.TR.mantleMax} m）`);
  const mantles = acts.filter((a) => a.kind === "mantle");
  const vaults = acts.filter((a) => a.kind === "vault");
  Check("攀爬是「撑上去」不是「飘上去」：慢、先长身子再迈过去",
    mantles.length === 0
      || (mantles.every((a) => a.durS >= ladder.TR.mantleBaseS - 0.03)
        && mantles.every((a) => a.movedEarly < 0.2)
        && mantles.every((a) => a.peakAtK <= 0.75)),
    mantles.length
      ? `${mantles.length} 次攀爬：时长 ${Math.min(...mantles.map((a) => a.durS)).toFixed(2)}—`
        + `${Math.max(...mantles.map((a) => a.durS)).toFixed(2)} s / 前六帧水平位移 `
        + `≤ ${Math.max(...mantles.map((a) => a.movedEarly)).toFixed(2)} m`
      : "这一批样本里没有肩高档（不算失败）");
  Check("腰高那一档仍然是「一步跨过去」的快动作",
    vaults.length === 0 || vaults.every((a) => a.durS <= ladder.TR.vaultBaseS + 0.25),
    vaults.length
      ? `${vaults.length} 次翻越：最长 ${Math.max(...vaults.map((a) => a.durS)).toFixed(2)} s`
      : "这一批样本里没有腰高档（不算失败）");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error(`\n跳跃专项：${14 - failures.length}/14 过；失败：${failures.join("、")}`);
  process.exit(1);
}
console.log("\n跳跃专项全过。");
