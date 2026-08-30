// 第一人称骨骼双臂画面闸：**手要扣在枪上，胳膊不许糊屏。**
//
// 2026-08-29 的静态手资产没有 skin / animation，回归只量“手掌模型中心离目标
// 近不近”，因此冻住的手也能绿。这版改量真实指骨构造的 grip marker：位置误差
// ≤ 5 mm、渲染矩阵三轴误差 ≤ 6°；同时覆盖全部八种玩家武器和五类握姿。

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
  const red = new THREE.MeshBasicMaterial({ color: 0xff0000, skinning: true });

  const PaintedFraction = () => {
    const swapped = [];
    arms.root.traverse((node) => { if (node.isMesh) swapped.push([node, node.material]); });
    for (const [node] of swapped) node.material = red;
    T.StepFrames(4);
    ctx.drawImage(src, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let seen = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 60 && data[i] - data[i + 1] > 40 && data[i] - data[i + 2] > 40) seen += 1;
    }
    for (const [node, material] of swapped) node.material = material;
    T.StepFrames(2);
    return seen / (canvas.width * canvas.height);
  };

  const GripResidual = (side) => {
    const marker = arms.gripNodes[side];
    const target = side === "r" ? vm.handRight.group : vm.handLeft.group;
    const markerPosition = marker.getWorldPosition(new THREE.Vector3());
    const targetPosition = target.getWorldPosition(new THREE.Vector3());
    const Axis = (object, x, y, z) => {
      const origin = object.getWorldPosition(new THREE.Vector3());
      return object.localToWorld(new THREE.Vector3(x, y, z)).sub(origin).normalize();
    };
    const axisError = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].reduce((largest, axis) => {
      const markerAxis = Axis(marker, ...axis);
      const targetAxis = Axis(target, ...axis);
      return Math.max(largest, markerAxis.angleTo(targetAxis));
    }, 0);
    return {
      meters: +markerPosition.distanceTo(targetPosition).toFixed(5),
      degrees: +(THREE.MathUtils.radToDeg(axisError)).toFixed(3),
    };
  };

  const cases = [
    ["ZhongZheng", 0], ["ZhongZheng", 1],
    ["HanYang", 0], ["Type38", 0],
    ["Zb26", 0], ["Zb26", 1],
    ["Mauser96", 0], ["Mauser96", 1],
    ["ServicePistol", 0], ["Grenade", 0],
    ["Dadao", 0], ["Dadao", 1],
  ];
  const out = {
    cases: [],
    hasArms: !!arms,
    source: arms?.report?.source,
    chains: arms?.report?.chains,
    bones: arms?.report?.bones,
    skinnedMeshes: arms?.report?.skinnedMeshes,
    profiles: arms?.report?.profiles || [],
  };
  if (!arms) return out;
  for (const [weapon, ads] of cases) {
    vm.Equip(weapon);
    for (let frame = 0; frame < 60; frame += 1) {
      vm.Update(1 / 60, { ads, moveSpeed: 0, grounded: true, crouch: 0, sprint: 0 });
    }
    T.StepFrames(6);
    const grip = { r: GripResidual("r"), l: GripResidual("l") };
    out.cases.push({
      weapon,
      ads,
      profile: arms.profile,
      painted: +PaintedFraction().toFixed(4),
      grip,
      stretch: { ...arms.stretch },
    });
  }
  red.dispose();
  return out;
});

const checks = [];
checks.push(["国军 01 制服骨骼双臂接入默认路径",
  report.hasArms && report.source === "LugouNra01Skeletal" && report.chains === 2
    && report.skinnedMeshes === 1 && report.bones >= 45,
  `source=${report.source} / chains=${report.chains} / bones=${report.bones}`]);
checks.push(["五类武器握姿均从源骨骼动画提取",
  ["rifle", "lmg", "pistol", "throwable", "melee"].every((profile) => report.profiles.includes(profile)),
  report.profiles.join(", ")]);
for (const entry of report.cases) {
  const label = `${entry.weapon} ${entry.ads ? "开镜" : "腰射"}`;
  checks.push([`${label} 手臂在画面上读得出且没糊屏（0.3%—22%）`,
    entry.painted >= 0.003 && entry.painted <= 0.22,
    `${(entry.painted * 100).toFixed(1)}%`]);
  checks.push([`${label} 指骨握持坐标系锁定（≤ 5 mm / 6°）`,
    entry.grip.r.meters <= 0.005 && entry.grip.l.meters <= 0.005
      && entry.grip.r.degrees <= 6 && entry.grip.l.degrees <= 6,
    `右 ${entry.grip.r.meters} m/${entry.grip.r.degrees}°；左 ${entry.grip.l.meters} m/${entry.grip.l.degrees}°`]);
  checks.push([`${label} 双臂拉伸没有超过 1.22`,
    entry.stretch.r <= 1.22 && entry.stretch.l <= 1.22,
    `右 ${entry.stretch.r} / 左 ${entry.stretch.l}`]);
}
checks.push(["页面无运行时错误", errors.length === 0, errors.slice(0, 2).join(" | ")]);

let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
console.log(`\n第一人称骨骼双臂：${checks.length - failed}/${checks.length} 过`);

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
