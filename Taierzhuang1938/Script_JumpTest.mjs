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
  await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 240000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(30));

  const jump = await page.evaluate(() => {
    const T = window.Taierzhuang, D = T.Debug;
    T.player.Spawn(0, 60, 0);
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
    T.player.stance = "prone";
    const count0 = D.Jump().count;
    const y0 = T.player.position.y;
    D.Key("Space"); T.StepFrames(4);
    return { added: D.Jump().count - count0, rise: T.player.position.y - y0 };
  });
  Check("卧姿不能原地弹起", prone.added === 0 && prone.rise < 0.02,
    `跳跃 +${prone.added} / 抬高 ${prone.rise.toFixed(3)} m`);

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
      if (D.Vault().active) return {
        found: true, jumps: D.Jump().count - jump0, vaults: D.Vault().count - vault0,
      };
    }
    return { found: false, jumps: 0, vaults: 0 };
  });
  Check("墙前 Space 保持翻越优先", vault.found && vault.vaults === 1 && vault.jumps === 0,
    `找到=${vault.found} / 翻越 +${vault.vaults} / 跳跃 +${vault.jumps}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error(`\n跳跃专项：${4 - failures.length}/4 过；失败：${failures.join("、")}`);
  process.exit(1);
}
console.log("\n跳跃专项全过。");
