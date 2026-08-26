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
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=0&quality=low&scale=small&menu=0`,
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
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error(`\n跳跃专项：${8 - failures.length}/8 过；失败：${failures.join("、")}`);
  process.exit(1);
}
console.log("\n跳跃专项全过。");
