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

// 注意 URL 上的 **arms=rig**：导入整臂不是默认（默认是旧的程序化手模，理由写在
// Script_Main 的 RIGGED_ARMS 抬头），这条测试守的就是那条可选路径。
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

await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=2&quality=medium&scale=small&arms=rig`,
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

  const out = { cases: [], hasArms: !!arms, chains: arms ? arms.report.chains : 0 };
  for (const weapon of ["ZhongZheng", "Dadao"]) {
    vm.Equip(weapon);
    for (const ads of [0, 1]) {
      for (let frame = 0; frame < 60; frame += 1) {
        vm.Update(1 / 60, { ads, moveSpeed: 0, grounded: true, crouch: 0, sprint: 0 });
      }
      T.StepFrames(6);
      const entry = { weapon, ads, painted: +PaintedFraction().toFixed(4), wrist: {}, bicep: {} };
      for (const side of ["r", "l"]) {
        const bones = arms.bones[side];
        const hand = side === "r" ? vm.handRight.group : vm.handLeft.group;
        const wrist = Camera(bones.wrist);
        const grip = Camera(hand);
        entry.wrist[side] = +wrist.distanceTo(grip).toFixed(3);
        // 大臂根在视锥里吗：−Z 前方、按半视场折算的画面边界
        const bicep = Camera(bones.bicep);
        const half = Math.tan((52 / 2) * Math.PI / 180);
        entry.bicep[side] = bicep.z < -0.02
          && Math.abs(bicep.y) < half * -bicep.z
          && Math.abs(bicep.x) < half * -bicep.z * (canvas.width / canvas.height);
        entry.stretch = { ...arms.stretch };
      }
      out.cases.push(entry);
    }
  }
  return out;
});

const checks = [];
checks.push(["导入手臂两条 IK 链都建起来了", report.hasArms && report.chains === 2, `chains=${report.chains}`]);
for (const entry of report.cases) {
  const label = `${entry.weapon} ${entry.ads ? "开镜" : "腰射"}`;
  checks.push([`${label} 手臂在画面上读得出且没糊屏（0.5%—22%）`,
    entry.painted >= 0.005 && entry.painted <= 0.22,
    `${(entry.painted * 100).toFixed(1)}%`]);
  checks.push([`${label} 两只手都扣在握点上（≤ 12 cm）`,
    entry.wrist.r <= 0.12 && entry.wrist.l <= 0.12,
    `右 ${entry.wrist.r} m / 左 ${entry.wrist.l} m`]);
  checks.push([`${label} 大臂根落在视锥之外`,
    !entry.bicep.r && !entry.bicep.l,
    `右 ${entry.bicep.r ? "进画面" : "画外"} / 左 ${entry.bicep.l ? "进画面" : "画外"}`]);
  checks.push([`${label} 骨头没被拉过头（≤ 1.35）`,
    entry.stretch.r <= 1.351 && entry.stretch.l <= 1.351,
    `右 ${entry.stretch.r} / 左 ${entry.stretch.l}`]);
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
