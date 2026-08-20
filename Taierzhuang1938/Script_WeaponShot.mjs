// 《滕县 一九三八》枪械外观出图：把编辑器台架上的每一把枪按固定机位拍成一张四宫格。
//
// 为什么要单独一条出图路径（Script_ShotTest 已经有正片镜头了）：
//   正片截图里枪只占几十个像素，穿模、贴图密度、法线朝向这一类**近距离**问题
//   一张都看不出来。而枪恰恰是全场唯一一件玩家会怼到脸上看的资产。
//   台架四宫格（正侧 / 俯视 / 四分之三 / 机匣特写）是能同时暴露这四类问题的最小集合：
//     · 正侧看剪影与全长；
//     · 俯视看左右对称的零件有没有从枪身两侧穿出来；
//     · 四分之三看体积关系；
//     · 机匣特写看贴图密度与零件接缝（穿模最常发生在这里）。
//
// 用法：
//   node Taierzhuang1938/Script_WeaponShot.mjs [输出目录] [--only=Zb26,Type38] [--flat] [--fp]
//   --flat 换成无贴图纯色材质出一份对照 —— 「贴图到底有没有比纯色强」只能这么比。
//   --fp   拍第一人称那一份（腰射 / 开镜 / 开火 / 拉栓）。第一人称与台架是**两套
//          几何**（见 Script_EditorWeapon 抬头），台架改好了不等于手里那把也对。
// 默认输出到 Taierzhuang1938/_shots/（已 gitignore）。

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(projectDir, "_shots"));
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice(7).split(",") : null;
const flat = args.includes("--flat");
const firstPerson = args.includes("--fp");
fs.mkdirSync(outDir, { recursive: true });

// 台架把枪绕 Y 转了 90°，所以**枪管轴 = 世界 X、枪口在 -X**；
// 相机 yaw=π（站在 -Z）时枪口朝屏幕右。下面所有机位都按这个约定写。
const PI = Math.PI;
const WEAPONS = [
  { id: "ZhongZheng", len: 1.11 },
  { id: "HanYang", len: 1.25 },
  { id: "Type38", len: 1.276 },
  { id: "Zb26", len: 1.165 },
  { id: "Mauser96", len: 0.288, closeAt: -0.03 },
  { id: "Grenade", len: 0.22, upright: true },
  { id: "Dadao", len: 0.90, upright: true },
];

const VIEWPORT = { width: 1280, height: 720 };

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${message.text().slice(0, 300)}`);
});

// menu=0：跳过主菜单直接进关。菜单是一整层盖在 canvas 上的 DOM，
// 出图要的是台架那一帧，不是菜单的运镜。
await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?quality=high&scale=small&phase=0&menu=0`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 240000 });
await page.evaluate(() => window.Taierzhuang.StepFrames(30));
await page.evaluate(() => window.Taierzhuang.Debug.OpenEditor("weapon"));
await page.evaluate(() => window.Taierzhuang.StepFrames(10));

// 面板与 HUD 挡住展台就白拍了。出图期间整个 DOM 层收掉，只留 canvas。
await page.addStyleTag({ content: ".edPanel, .edGear, #hud, .hud { display: none !important; }" });

const Sheet = async (entry) => page.evaluate(async ({ w, flatMode }) => {
  const T = window.Taierzhuang;
  const editor = T.editor.active;
  editor.spin = false;
  editor.SetMode("bench");
  editor.SetWeapon(w.id);
  T.StepFrames(2);

  // 纯色对照：把台架上每块网格的材质换成同色系的无贴图 PBR。
  // 换的是 mesh.material 引用，不动材质库里的那一份（那是全场共用的）。
  //
  // 认桶靠**引用相等**，不是 material.name —— MaterialLibrary 出的材质根本没设
  // name（设 name 的只有 Script_Actor 里那组一次性的 SentinelMaterials）。
  // 照着 name 分桶的话每一块都落进 else 分支，整支枪会被刷成同一种材质，
  // 对照图看起来"和有贴图的一模一样"，得出的结论是反的。
  if (flatMode && editor.benchGroup) {
    // 页面已经加载过 three，这次 import 拿到的是同一个模块实例（不是第二份库）
    const THREE = await import("./vendor/three/build/three.module.js");
    const plain = {
      steel: new THREE.MeshStandardMaterial({ color: 0x3B3E42, roughness: 0.55, metalness: 0.85 }),
      blade: new THREE.MeshStandardMaterial({ color: 0x929aa2, roughness: 0.34, metalness: 0.95 }),
      grip: new THREE.MeshStandardMaterial({ color: 0x8f7c61, roughness: 0.78, metalness: 0 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x6A472B, roughness: 0.8, metalness: 0 }),
      accessory: new THREE.MeshStandardMaterial({ color: 0x7A6A52, roughness: 0.95, metalness: 0 }),
      red: new THREE.MeshStandardMaterial({ color: 0x9E2B22, roughness: 0.92, metalness: 0 }),
    };
    const byRef = new Map();
    for (const key of Object.keys(plain)) {
      if (editor.materials && editor.materials[key]) byRef.set(editor.materials[key], plain[key]);
    }
    for (const child of editor.benchGroup.children) {
      if (!child.isMesh || !child.material || child.material.isMeshBasicMaterial) continue;
      child.material = byRef.get(child.material) || plain.steel;
    }
  }

  const src = document.getElementById("view");
  const cw = 640, ch = 360;
  const sheet = document.createElement("canvas");
  sheet.width = cw * 2; sheet.height = ch * 2;
  const ctx = sheet.getContext("2d");
  const half = w.len * 0.5;
  const centerY = w.upright ? 1.10 + half * 0.55 : 1.10;
  const wide = Math.max(0.45, w.len * 1.25);
  const views = [
    { name: "正侧", yaw: Math.PI, pitch: 0.05, dist: wide, tx: 0, ty: centerY },
    { name: "俯视", yaw: Math.PI, pitch: 1.20, dist: wide, tx: 0, ty: centerY },
    { name: "四分之三", yaw: Math.PI + 0.85, pitch: 0.32, dist: wide * 0.9, tx: 0, ty: centerY },
    {
      name: "机匣特写", yaw: Math.PI + 0.45, pitch: 0.20,
      dist: Math.max(0.26, w.len * 0.30),
      tx: w.closeAt != null ? w.closeAt : (w.upright ? 0 : -0.04),
      ty: w.upright ? 1.10 + half * 0.9 : 1.10,
    },
  ];
  for (let i = 0; i < views.length; i += 1) {
    const v = views[i];
    const orbit = editor.studio.orbit;
    orbit.yaw = v.yaw; orbit.pitch = v.pitch; orbit.dist = v.dist;
    orbit.target.set(v.tx, v.ty, 0);
    editor.studio.ApplyCamera();
    T.StepFrames(2);
    const x = (i % 2) * cw, y = Math.floor(i / 2) * ch;
    ctx.drawImage(src, 0, 0, src.width, src.height, x, y, cw, ch);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x + 6, y + 6, 96, 24);
    ctx.fillStyle = "#fff";
    ctx.font = "15px sans-serif";
    ctx.fillText(v.name, x + 14, y + 23);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.strokeRect(cw, 0, 0.5, ch * 2);
  ctx.strokeRect(0, ch, cw * 2, 0.5);
  return sheet.toDataURL("image/png");
}, { w: entry, flatMode: flat });

/** 第一人称四格：腰射 / 开镜 / 开火那一帧 / 拉栓中。 */
const FpSheet = async (entry) => page.evaluate(async ({ w }) => {
  const T = window.Taierzhuang;
  const editor = T.editor.active;
  editor.SetMode("fp");
  editor.SetWeapon(w.id);
  T.StepFrames(30);                     // 让开镜/换枪的弹簧稳下来

  const src = document.getElementById("view");
  const cw = 640, ch = 360;
  const sheet = document.createElement("canvas");
  sheet.width = cw * 2; sheet.height = ch * 2;
  const ctx = sheet.getContext("2d");
  const shots = [
    ["腰射", () => { editor.ads = 0; }, 26],
    ["开镜", () => { editor.ads = 1; }, 40],
    ["开火", () => { editor.ads = 0; editor.Trigger("fire"); }, 2],
    ["拉栓", () => { editor.Trigger("bolt"); }, 14],
  ];
  for (let i = 0; i < shots.length; i += 1) {
    shots[i][1]();
    T.StepFrames(shots[i][2]);
    const x = (i % 2) * cw, y = Math.floor(i / 2) * ch;
    ctx.drawImage(src, 0, 0, src.width, src.height, x, y, cw, ch);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x + 6, y + 6, 96, 24);
    ctx.fillStyle = "#fff";
    ctx.font = "15px sans-serif";
    ctx.fillText(shots[i][0], x + 14, y + 23);
  }
  return sheet.toDataURL("image/png");
}, { w: entry });

const list = only ? WEAPONS.filter((w) => only.includes(w.id)) : WEAPONS;
for (const entry of list) {
  const dataUrl = firstPerson ? await FpSheet(entry) : await Sheet(entry);
  const file = path.join(outDir,
    `Weapon_${entry.id}${firstPerson ? "_Fp" : ""}${flat ? "_Flat" : ""}.png`);
  fs.writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log(`ok   ${path.basename(file)}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}

await browser.close();
server.close();
if (problems.length) {
  for (const p of problems) console.log(`FAIL ${p}`);
  process.exit(1);
}
console.log(`\n出图完成：${list.length} 张 → ${outDir}`);
