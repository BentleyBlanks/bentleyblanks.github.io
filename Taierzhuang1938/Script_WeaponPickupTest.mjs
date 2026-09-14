// 拾枪（COD 式主 / 副武器）真浏览器回归：靶场（?range=1）里走真键位链。
//
// 口径（2026-09-15 用户定，对标 COD）：
//   · 数字键 1 主武器 / 2 副武器 / 3 大刀 / 4 投掷物；
//   · 地上的枪要**按住 F** 才拾起 / 换上（点一下不算）；提示「[F] 长按拾起 / 换上 …」带那把枪的剪影；
//   · 有空枪槽先填空槽，捡起来直接端在手上，主武器原封不动；
//   · 两个枪槽都满：换掉手里那支，换下的丢在原地、弹仓跟着走，走回去还能换回来；
//     手里是大刀时换掉最后端过的那支；
//   · 主 / 副武器各记各的弹仓和刺刀；同型的枪只补给对应那个槽的弹药（点按）。
//
// 输入全走 Debug.Key（键位表 → OnAction → InteractSystem），不直调 PickUpWeapon / SwitchSlot。
// 采样在同一个 page.evaluate 里同步跑完（rAF 不许插队）。
// --shot：把「长按换上」那一帧拍到系统临时目录，给人看提示与剪影。

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { INTERACT } from "./Data_Tuning_Interact.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url) || /ERR_BLOCKED_BY_CLIENT/.test(message.text())) return;
  errors.push(message.text());
});
await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort("blockedbyclient"));

let failed = 0;
function Check(label, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${!ok && detail ? `\n     ${detail}` : ""}`);
}

try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&manual=1&range=1&quality=low&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });

  const holdFrames = Math.ceil((INTERACT.weaponPickupHoldS + 0.15) * 60);
  const result = await page.evaluate(({ holdFrames }) => {
    const T = window.Taierzhuang;
    const D = T.Debug;
    const out = {};
    T.StepFrames(20);
    T.player.debug.invincible = true;
    // 就站在靶场出生点（开阔地）；木桩兵不还手，留在各自靶道上不碍事。
    const spot = { x: T.player.position.x, z: T.player.position.z };
    T.player.yaw = 0;                            // yaw 0 = 面朝 -Z
    T.player.pitch = -0.6;
    T.StepFrames(10);
    const Snap = () => ({ ...D.Slots(), viewmodel: T.viewmodel.weaponId, ground: D.Interact().groundWeapons });
    const Prompts = () => D.Prompts();
    const HoldF = () => { D.Key("KeyF", true); T.StepFrames(holdFrames); D.Key("KeyF", false); T.StepFrames(2); };
    const TapF = () => { D.Key("KeyF", true); T.StepFrames(1); D.Key("KeyF", false); T.StepFrames(40); };
    const Idle = (frames = 90) => T.StepFrames(frames);   // 刺刀 / 拉栓播完，SwitchSlot 才放行
    const Ahead = (m) => ({ x: spot.x, z: spot.z - m });

    // --- 0) 开局：1 汉阳造 / 2 空 / 3 大刀 ------------------------------------
    T.state.ammo = 3; T.state.clips = 4;
    out.start = Snap();

    // --- 1) 空副武器槽：「长按拾起」+ 剪影；点按不算，按住才拾 ------------------
    const typeA = D.DropWeapon("Type38", { ...Ahead(1.1), yaw: Math.PI / 2, ammo: 4 });
    T.StepFrames(8);
    out.takePrompt = Prompts().find((p) => p.kind === "pickup") || null;
    out.takeQuery = D.Interact();
    TapF();
    out.afterTap = Snap();
    HoldF();
    out.afterTake = Snap();

    // --- 2) 1 / 2 / 3 / 4 真键位切换，弹仓各记各的 ------------------------------
    D.Key(D.SlotKey("primary")); T.StepFrames(4);
    out.key1 = Snap();
    D.Key(D.SlotKey("secondary")); T.StepFrames(4);
    out.key2 = Snap();
    D.Key(D.SlotKey("melee")); T.StepFrames(4);
    out.key3 = Snap();
    D.Key(D.SlotKey("throwable")); T.StepFrames(4);
    out.key4 = Snap();

    // --- 3) 刺刀跟着枪走：汉阳造装上，切到三八式是收着的，切回来还在 --------------
    D.Key(D.SlotKey("primary")); T.StepFrames(4);
    D.Key("KeyX"); Idle(90);
    out.bayonetOnPrimary = Snap().bayonetFixed;
    D.Key(D.SlotKey("secondary")); T.StepFrames(4);
    out.bayonetOnSecondary = Snap().bayonetFixed;
    D.Key(D.SlotKey("primary")); T.StepFrames(4);
    out.bayonetBackOnPrimary = Snap().bayonetFixed;

    // --- 4) 两个枪槽都满、手里是副武器：「长按换上」换掉手里那支，丢在原地 --------
    D.Key(D.SlotKey("secondary")); T.StepFrames(4);
    T.state.ammo = 2;                              // 三八式打掉两发，换下时要带着这个数
    const lmg = D.DropWeapon("Type11", { ...Ahead(1.0), yaw: Math.PI / 2, ammo: 30 });
    T.StepFrames(8);
    out.swapPrompt = Prompts().find((p) => p.kind === "pickup") || null;
    out.swapPromptRow = (() => {
      const row = document.querySelector(".hudAction.pickup");
      return row && { key: row.querySelector("kbd")?.textContent, text: row.querySelector(".actionText")?.textContent,
        icon: row.querySelector("img.actionWeapon")?.getAttribute("src") || null };
    })();
    out.lmgId = lmg;
    // 按住到一半：进度环亮着、还没换
    D.Key("KeyF", true); T.StepFrames(Math.floor(holdFrames / 3));
    out.midHold = { ring: document.querySelector(".hudInteractRing")?.classList.contains("on") || false,
      view: T.interact.View(), slots: Snap().slots };
    window.__pickupShotReady = true;
    return out;
  }, { holdFrames });

  if (process.argv.includes("--shot")) {
    await page.evaluate(() => window.Taierzhuang.StepFrames(1, 1 / 60, true));
    const shot = path.join(os.tmpdir(), "TaierzhuangWeaponPickupHold.png");
    await page.screenshot({ path: shot, timeout: 90000 });
    console.log(`shot: ${shot}`);
  }

  const rest = await page.evaluate(({ holdFrames }) => {
    const T = window.Taierzhuang;
    const D = T.Debug;
    const out = {};
    const Snap = () => ({ ...D.Slots(), viewmodel: T.viewmodel.weaponId, ground: D.Interact().groundWeapons });
    const HoldF = () => { D.Key("KeyF", true); T.StepFrames(holdFrames); D.Key("KeyF", false); T.StepFrames(2); };
    // 接着第 4 步没松开的 F 按满
    T.StepFrames(holdFrames);
    D.Key("KeyF", false); T.StepFrames(2);
    out.afterSwap = Snap();

    // --- 5) 手里是大刀、两个枪槽都满：换掉最后端过的那支（副武器） ----------------
    D.Key(D.SlotKey("melee")); T.StepFrames(4);
    out.meleeBeforeSwapBack = Snap();
    out.swapBackPrompt = D.Prompts().find((p) => p.kind === "pickup") || null;
    HoldF();
    out.afterSwapBack = Snap();

    // --- 6) 同型的枪只补弹药（点按），补到对应的槽上：手里是三八式，补的是背着的汉阳造 --
    for (const item of [...T.interact.groundWeapons]) T.interact.RemoveGroundWeapon(item);
    const mags = D.Slots().mags;
    out.primaryMagBefore = mags.primary;
    D.DropWeapon("HanYang", { x: T.player.position.x, z: T.player.position.z - 1.1, yaw: Math.PI / 2, ammo: 5, clips: 2 });
    T.StepFrames(8);
    out.ammoPrompt = D.Prompts().find((p) => p.kind === "pickup") || null;
    D.Key("KeyF", true); T.StepFrames(1); D.Key("KeyF", false); T.StepFrames(4);
    out.afterAmmo = Snap();
    return out;
  }, { holdFrames });

  const r = { ...result, ...rest };
  const typeName = WEAPONS.Type38.name;
  const lmgName = WEAPONS.Type11.name;
  const hanName = WEAPONS.HanYang.name;

  Check("开局：1 汉阳造 / 2 空 / 3 大刀，数字键顺序是 主 / 副 / 大刀 / 投掷物",
    r.start.slots.primary === "HanYang" && !r.start.slots.secondary && r.start.slots.melee === "Dadao"
      && r.start.order.join() === "primary,secondary,melee,throwable", JSON.stringify(r.start));
  Check("空副武器槽：提示「按住 F · 拾起 三八式」并带剪影 id",
    r.takePrompt?.keys === "按住 F" && r.takePrompt.label === `拾起 ${typeName}` && r.takePrompt.weaponId === "Type38",
    JSON.stringify(r.takePrompt));
  Check("点按 F 不拾枪", r.afterTap.slots.secondary == null && r.afterTap.active === "primary", JSON.stringify(r.afterTap));
  Check("按住 F：三八式进 2 号副武器并直接端在手上",
    r.afterTake.slots.secondary === "Type38" && r.afterTake.active === "secondary"
      && r.afterTake.weapon === "Type38" && r.afterTake.viewmodel === "Type38" && r.afterTake.ammo === 4,
    JSON.stringify(r.afterTake));
  Check("有空槽时不丢枪：主武器汉阳造原封不动（弹仓 3 + 4 个桥夹），地上没多出枪",
    r.afterTake.slots.primary === "HanYang" && r.afterTake.mags.primary.ammo === 3 && r.afterTake.mags.primary.clips === 4
      && r.afterTake.ground.length === 0, JSON.stringify(r.afterTake));
  Check("按 1 切回汉阳造，弹仓是切走前的 3 发",
    r.key1.active === "primary" && r.key1.weapon === "HanYang" && r.key1.ammo === 3 && r.key1.clips === 4, JSON.stringify(r.key1));
  Check("按 2 是三八式（4 发）", r.key2.active === "secondary" && r.key2.weapon === "Type38" && r.key2.ammo === 4, JSON.stringify(r.key2));
  Check("按 3 是大刀", r.key3.active === "melee" && r.key3.weapon === "Dadao", JSON.stringify(r.key3));
  Check("按 4 是投掷物", r.key4.active === "throwable", JSON.stringify(r.key4));
  Check("刺刀跟着枪走：汉阳造装上、三八式收着、切回汉阳造还在",
    r.bayonetOnPrimary === true && r.bayonetOnSecondary === false && r.bayonetBackOnPrimary === true,
    JSON.stringify({ a: r.bayonetOnPrimary, b: r.bayonetOnSecondary, c: r.bayonetBackOnPrimary }));
  Check("两个枪槽都满：提示变成「长按换上 十一年式轻机枪」，下面画剪影",
    r.swapPrompt?.keys === "按住 F" && r.swapPrompt.label === `换上 ${lmgName}`
      && r.swapPromptRow?.key === "F" && r.swapPromptRow.text === `长按换上 ${lmgName}`
      && r.swapPromptRow.icon === "Texture/Hud/Texture_HudWeapon_Type11.png", JSON.stringify({ p: r.swapPrompt, row: r.swapPromptRow }));
  Check("按住到一半：进度环亮着、还没换",
    r.midHold.ring && r.midHold.view?.kind === "pickup" && r.midHold.view.t > 0 && r.midHold.view.t < 1
      && r.midHold.slots.secondary === "Type38", JSON.stringify(r.midHold));
  Check("按满：换掉手里的三八式，主武器不动，三八式带着剩下 2 发丢在原地",
    r.afterSwap.slots.secondary === "Type11" && r.afterSwap.active === "secondary" && r.afterSwap.weapon === "Type11"
      && r.afterSwap.slots.primary === "HanYang"
      && r.afterSwap.ground.length === 1 && r.afterSwap.ground[0].weaponId === "Type38" && r.afterSwap.ground[0].ammo === 2,
    JSON.stringify(r.afterSwap));
  Check("手里是大刀时仍提示换上三八式（记得最后端的是副武器）",
    r.meleeBeforeSwapBack.active === "melee" && r.meleeBeforeSwapBack.lastGunSlot === "secondary"
      && r.swapBackPrompt?.label === `换上 ${typeName}`, JSON.stringify({ s: r.meleeBeforeSwapBack, p: r.swapBackPrompt }));
  Check("拿着大刀换枪：换掉的是副武器十一年式，三八式回到手上还是 2 发",
    r.afterSwapBack.slots.secondary === "Type38" && r.afterSwapBack.slots.primary === "HanYang"
      && r.afterSwapBack.active === "secondary" && r.afterSwapBack.ammo === 2
      && r.afterSwapBack.ground.length === 1 && r.afterSwapBack.ground[0].weaponId === "Type11",
    JSON.stringify(r.afterSwapBack));
  Check("同型的枪是点按「补充弹药」，不画剪影",
    r.ammoPrompt?.keys === "F" && new RegExp(`补充 ${hanName} 弹药`).test(r.ammoPrompt.label) && !r.ammoPrompt.weaponId,
    JSON.stringify(r.ammoPrompt));
  Check("补的是背着的汉阳造：主武器备弹 +3 个桥夹，手里的三八式不变",
    r.afterAmmo.mags.primary.clips === r.primaryMagBefore.clips + 3 && r.afterAmmo.active === "secondary"
      && r.afterAmmo.weapon === "Type38" && r.afterAmmo.ammo === 2, JSON.stringify({ before: r.primaryMagBefore, after: r.afterAmmo }));
  Check("无浏览器错误", errors.length === 0, errors.slice(0, 5).join("\n"));
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `FAIL  拾枪 ${failed} 条未过` : "ok  拾枪：COD 式主副武器、按住拾取、换下留地、各槽弹仓与刺刀");
process.exit(failed ? 1 : 0);
