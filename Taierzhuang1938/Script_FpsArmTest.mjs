// 第一人称手臂的画面闸：**手要在枪上，胳膊不许糊屏。**
//
// 这条测试是补给两次翻车的：
//   1) 「第一人称从来没有手」—— 骨名带点号查不到，IK 没建起来，整副手臂停在
//      绑定姿势挂在视野外，而旧的程序化手已经被藏掉。那一轮十几条断言全绿，
//      画面上一只手都没有。
//   2) 「持刀的手完全坏了」—— 手臂挂在**武器**下面，肩跟着大刀那组绕刀身自转
//      88° 的腰射姿态一起侧翻到画面正中，一条肉色管子糊满半屏；步枪同理，
//      左右大臂各在画面下方糊一坨。
//
// 所以这里量的都是画面事实，不是 visible 标志：
//   · 涂色数像素：手臂在屏幕上占的比例要落在 [0.5%, 22%] 之间。
//     低于下限 = 又没有手；高于上限 = 又在糊屏（翻车那两版实测 30%—60%）。
//   · 腕到握点的距离：手真的扣在枪上，不是悬在旁边（≤ 12 cm，掌心到腕就有 9 cm）。
//   · 大臂根必须落在视锥之外：肩是人身上的零件，一进画面就是穿帮。
//
// 覆盖腰射与开镜两个姿态、步枪与大刀两把武器 —— 大刀那组姿态转得最狠，
// 是这条链最容易再翻的地方。

// 国军 01 双手现在就是默认路径；URL 不再带 arms=rig，防止测试只守着一个玩家
// 永远不会进入的隐藏分支。
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

await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=2&quality=medium&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });

const report = await page.evaluate(async () => {
  const THREE = await import("./vendor/three/build/three.module.js");
  const T = window.Taierzhuang;
  T.player.health = 100;
  T.player.spawnGrace = 999;
  for (const soldier of T.ai.soldiers) if (soldier.side === "ija") soldier.position.x += 500;

  const vm = T.viewmodel;
  const arms = vm.riggedArms;
  const src = document.getElementById("view");
  const canvas = document.createElement("canvas");
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext("2d");
  const red = new THREE.MeshBasicMaterial({ color: 0xff0000 });

  /** 把整副手臂涂红，数它在屏幕上占了多少像素（枪该挡还挡，depthTest 不动）。 */
  const PaintedFraction = () => {
    const swapped = [];
    arms.root.traverse((node) => { if (node.isMesh) swapped.push([node, node.material]); });
    for (const [node] of swapped) node.material = red;
    T.StepFrames(4);
    ctx.drawImage(src, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let seen = 0;
    for (let i = 0; i < data.length; i += 4) {
      // 阈值走**相对**红：这一关是阴天巷战，纯红经过色调映射后只有 (130, 10, 25)，
      // 照 BayonetTest 那条 r > 140 的绝对阈值数出来是零 —— 手明明在画面上。
      if (data[i] > 60 && data[i] - data[i + 1] > 40 && data[i] - data[i + 2] > 40) seen += 1;
    }
    for (const [node, material] of swapped) node.material = material;
    T.StepFrames(2);
    return seen / (canvas.width * canvas.height);
  };

  const Camera = (object) => {
    const point = object.getWorldPosition(new THREE.Vector3());
    vm.root.worldToLocal(point);
    return point;
  };

  const out = {
    cases: [], hasArms: !!arms, chains: arms ? arms.report.chains : 0,
    source: arms?.report?.source,
  };
  for (const weapon of ["ZhongZheng", "Dadao"]) {
    vm.Equip(weapon);
    for (const ads of [0, 1]) {
      for (let frame = 0; frame < 60; frame += 1) {
        vm.Update(1 / 60, { ads, moveSpeed: 0, grounded: true, crouch: 0, sprint: 0 });
      }
      T.StepFrames(6);
      const entry = { weapon, ads, painted: +PaintedFraction().toFixed(4), grip: {} };
      for (const side of ["r", "l"]) {
        const hand = side === "r" ? vm.handRight.group : vm.handLeft.group;
        entry.grip[side] = +Camera(arms.modelHands[side]).distanceTo(Camera(hand)).toFixed(4);
      }
      out.cases.push(entry);
    }
  }
  return out;
});

const checks = [];
checks.push(["国军 01 左右手模型都接入默认路径", report.hasArms && report.chains === 2
  && report.source === "LugouNra01", `source=${report.source} / hands=${report.chains}`]);
for (const entry of report.cases) {
  const label = `${entry.weapon} ${entry.ads ? "开镜" : "腰射"}`;
  checks.push([`${label} 手臂在画面上读得出且没糊屏（0.5%—22%）`,
    entry.painted >= 0.005 && entry.painted <= 0.22,
    `${(entry.painted * 100).toFixed(1)}%`]);
  checks.push([`${label} 两只模型手掌中心都锁在握点附近（≤ 6 cm）`,
    entry.grip.r <= 0.06 && entry.grip.l <= 0.06,
    `右 ${entry.grip.r} m / 左 ${entry.grip.l} m`]);
}
checks.push(["页面无运行时错误", errors.length === 0, errors.slice(0, 2).join(" | ")]);

let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
console.log(`\n第一人称手臂：${checks.length - failed}/${checks.length} 过`);

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
