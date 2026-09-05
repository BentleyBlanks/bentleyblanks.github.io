// 刺刀装卸和正式战场接线：点按短刺、蓄力长刺、接触才伤害、弹药不改变白刃规则。
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
page.on("console", (message) => { if (message.type() === "error" && !/fonts|ERR_BLOCKED_BY_CLIENT/.test(message.text())) errors.push(message.text()); });

await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r=>r.abort("blockedbyclient"));
await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=2&quality=medium&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });

const result = await page.evaluate(async () => {
  const T = window.Taierzhuang;
  const out = {};
  T.player.health = 100;
  T.player.spawnGrace = 999;
  // 日军推远：先测装配与蓄力，不许被打断
  for (const s of T.ai.soldiers) if (s.side === "ija") s.position.x += 500;
  T.Debug.Key("Digit1");
  T.StepFrames(30,1/60,false);
  out.weapon = T.state.slots.primary;

  // --- 1) X 装刺刀：bayonet 件从无/隐着变成常显 -----------------------------
  out.fixedBefore = { state: T.state.bayonetFixed,
    visible: !!T.viewmodel.rig?.parts?.bayonet?.visible };
  T.Debug.Key("KeyX");
  T.StepFrames(70,1/60,false);                        // 0.95 s 动画播完
  out.fixedAfter = { state: T.state.bayonetFixed,
    hasPart: !!T.viewmodel.rig?.parts?.bayonet,
    visible: !!T.viewmodel.rig?.parts?.bayonet?.visible,
    source: T.viewmodel.rigSource };

  // --- 2) V 切白刃架势，左键点按 = 短刺，不耗子弹 ------------------------------------
  T.Debug.Key("KeyV");T.StepFrames(2,1/60,false);
  const ammoBefore = T.state.ammo;
  T.Debug.Mouse(0, true);
  T.StepFrames(3);                         // 50 ms —— 远小于 0.30 s 的蓄力线
  T.Debug.Mouse(0, false);
  T.StepFrames(2);
  out.tapMode = T.meleeCombat.State().player?.action;
  out.tapKind = T.meleeCombat.State().player?.state;
  out.tapAmmoKept = T.state.ammo === ammoBefore;
  T.StepFrames(60,1/60,false);                        // 收招

  // --- 3) 左键按住 ≥ 0.38 s = 长刺，一刀放倒满血兵 --------------------
  // 页面没暴露全局 THREE：借一个现成 Vector3 的克隆当出参
  const dir = T.player.AimDirection(T.player.velocity.clone());
  const {WEAPONS}=await import('./Data_Weapons.mjs');
  const PlantTarget = () => {
    const enemy = T.ai.soldiers.find((s) => s.side === "ija");
    enemy.alive = true; enemy.health = 100; enemy.dummy = true; enemy.bayonetFixed = true;
    enemy.unarmed=false;enemy.scriptDefensive=false;enemy.scriptedNoncombatant=false;enemy.meleeTraining = {passive:true};
    enemy.weaponId='Type38';enemy.weapon=WEAPONS.Type38;enemy.holdZone=null;
    enemy.position.copy(T.player.position).addScaledVector(dir, 1.5);
    enemy.position.y = T.player.position.y; enemy.body?.Teleport(enemy.position.x,enemy.position.y,enemy.position.z);
    T.StepFrames(3,1/60,false);
    T.player.yaw = Math.atan2(T.player.position.x-enemy.position.x,T.player.position.z-enemy.position.z);
    T.player.pitch=0;T.player.aimYaw=0;T.player.aimPitch=0;
    return enemy;
  };
  T.Debug.Mouse(0, true);
  T.StepFrames(30,1/60,false);                        // 0.5 s > chargeMinS
  out.windKind = T.meleeCombat.State().player?.state;
  // 靶要在**松手前一刻**才埋：蓄力那 30 帧里 AI 与物理照跑，早埋的靶会被
  // 自己的刚体/寻路拽回原位（直调 Melee 验证过判定本身是对的）。
  const first = PlantTarget();
  T.Debug.Mouse(0, false);              // keyup 同步出招，中间不隔帧
  out.thrustMode = T.meleeCombat.State().player?.action;
  out.beforeContact = first.health; T.StepFrames(30,1/60,false);
  out.thrustKilled = !first.alive;
  T.StepFrames(80,1/60,false);

  // --- 4) 空枪左键 = 白刃蓄力，松手出招；干壳提示不再吞掉这一下 --------------
  T.state.ammo = 0;
  T.Debug.Mouse(0, true);
  T.StepFrames(30,1/60,false);                        // 按住蓄力 0.5 s
  out.mouseCharge = T.meleeCombat.State().player?.state === "charge";
  const second = PlantTarget();            // 同上：松手前一刻才埋靶
  T.Debug.Mouse(0, false);
  T.StepFrames(30,1/60,false);                        // 鼠标那条的松手判在 Frame 里，得走一帧
  out.mouseMode = T.meleeCombat.State().player?.action;
  out.mouseKilled = !second.alive;
  T.StepFrames(80,1/60,false);

  // --- 4.5) 画面闸：上了刺刀，刀在腰射姿态下必须真的看得见 -------------------
  //
  // 为什么要量像素而不是量 visible：这条链上"visible = true"曾经全绿了很久，
  // 而玩家在画面上一个刺刀都看不到 —— 刀顺着枪管指出去，整条藏在枪管剪影后面
  // （实测腰射 1 px、开镜 0、冲刺 0、长刺 0）。口径与取证见 docs/Data_Bayonet.md
  // 「上了刺刀就换持枪法」。量法：把刀件涂成纯色、depthTest 照常（枪该挡还挡），
  // 数屏幕上刀真正占住的面积。
  //
  // 【2026-08-27 换量法】原来是绝对色键：涂纯红，数 r>140 且 g<70 且 b<70 的像素。
  // 那个阈值是**照着当时的背景标的** —— 二关出生点那阵子正贴着一堵砖墙，
  // 画面全暗，纯红出画就是纯红。出生点挪回街上（Data_Battle 的 L2 spawn，同日）
  // 之后背景是亮天与土路，泛光往刀上糊了一层，最红的像素变成 (171,74,89)：
  // 刀清清楚楚在画面里，色键却一个都不认，报 0 px。**色键量的是调色，不是刀。**
  // 现在改成两拍作差：同一姿态先涂绿拍一张、再涂红拍一张，数"红绿优势翻过来"
  // 的像素。背景两拍完全一样，作差自动消掉；曝光、泛光、色调、TAA 一并消掉。
  {
    const THREE = await import("./vendor/three/build/three.module.js");
    const src = document.getElementById("view");
    const bay = T.viewmodel.rig.parts.bayonet;
    const swapped = [];
    bay.traverse((n) => { if (n.isMesh) swapped.push([n, n.material]); });
    const c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext("2d");
    // 红优势 = r − g。刀占住的像素两拍之间会从"绿压红"翻成"红压绿"，
    // 摆幅接近满量程；背景像素两拍一模一样，差值恒为 0。
    const Shot = (hex) => {
      const paint = new THREE.MeshBasicMaterial({ color: hex });
      for (const [n] of swapped) n.material = paint;
      T.StepFrames(6);                     // TAA 收敛（相机与姿态都不动）
      ctx.drawImage(src, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const green = Shot(0x00ff00);
    const red = Shot(0xff0000);
    let seen = 0;
    for (let i = 0; i < red.length; i += 4) {
      const swing = (red[i] - red[i + 1]) - (green[i] - green[i + 1]);
      if (swing > 60) seen += 1;
    }
    for (const [n, m] of swapped) n.material = m;
    T.StepFrames(2);
    out.bladePixels = seen;
  }

  // --- 5) 换到短枪再换回来：刺刀还装着；X 对不可装刺刀的枪不生效 -------------
  T.Debug.Key("Digit4");                   // 投掷物槽（第二关没有短枪）
  T.StepFrames(20,1/60,false);
  const throwableBayonet = T.state.bayonetFixed;   // 状态保留，但视图模型无刀件
  T.Debug.Key("Digit1");
  T.StepFrames(20,1/60,false);
  out.backVisible = !!T.viewmodel.rig?.parts?.bayonet?.visible;
  out.keptAcrossSwitch = throwableBayonet && T.state.bayonetFixed;

  // --- 6) X 再按一次卸下 ----------------------------------------------------
  T.Debug.Key("KeyX");
  T.StepFrames(70,1/60,false);
  out.unfixed = { state: T.state.bayonetFixed,
    visible: !!T.viewmodel.rig?.parts?.bayonet?.visible };
  return out;
});

const checks = [
  ["长枪在手（第二关携行）", !!result.weapon],
  ["初始未上刺刀且刀不可见", !result.fixedBefore.state && !result.fixedBefore.visible],
  ["X 上刺刀：状态翻转", result.fixedAfter.state === true],
  ["上刺刀后视图模型有刀件且常显", result.fixedAfter.hasPart && result.fixedAfter.visible],
  ["白刃架势左键点按是短刺", result.tapKind === "attack" && ["Light","LightAlt"].includes(result.tapMode)],
  ["短刺不耗子弹", result.tapAmmoKept === true],
  ["按住时进入蓄力", result.windKind === "charge"],
  ["按住 0.5 s 松手是长刺", result.thrustMode === "Heavy"],
  ["松手时尚未接触，敌人不提前扣血", result.beforeContact === 100],
  ["长刺一刀放倒满血兵", result.thrustKilled === true],
  ["空枪左键按住进入蓄力", result.mouseCharge === true],
  ["空枪松手出招且是长刺", result.mouseMode === "Heavy"],
  ["空枪白刃也放得倒人", result.mouseKilled === true],
  [`上刺刀后刀身在画面上读得出（腰射 ${result.bladePixels} px ≥ 60）`,
    result.bladePixels >= 60],
  ["换枪往返后刺刀还装着", result.keptAcrossSwitch === true && result.backVisible === true],
  ["X 再按一次卸下且刀收起", !result.unfixed.state && !result.unfixed.visible],
  ["无控制台报错", errors.length === 0],
];

console.log(JSON.stringify({ ...result, errors: errors.slice(0, 5) }, null, 2));
let passed = true;
for (const [label, ok] of checks) {
  if (!ok) passed = false;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
}

await browser.close();
server.close();
process.exit(passed ? 0 : 1);
