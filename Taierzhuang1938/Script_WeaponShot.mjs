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
//        [--debug=normal|baseColor|roughness|metalness]
//   --flat 换成无贴图纯色材质出一份对照 —— 「贴图到底有没有比纯色强」只能这么比。
//   --fp   拍第一人称那一份（腰射 / 开镜 / 开火 / 拉栓）。第一人称与台架是**两套
//          几何**（见 Script_EditorWeapon 抬头），台架改好了不等于手里那把也对。
//   --reload 拍全枪械换弹：腰射/ADS起手两行，各四个机械关键帧；附同名JSON投影轨迹。
// 默认输出到 Taierzhuang1938/_shots/（已 gitignore）。

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { WEAPONS as weaponDefinitions } from "./Data_Weapons.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(projectDir, "_shots"));
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice(7).split(",") : null;
const flat = args.includes("--flat");
const firstPerson = args.includes("--fp");
// Repeatable reload review: four mechanical keyframes, hip and ADS entry rows.
const reloadSheet = args.includes("--reload");
const debugArg = args.find((a) => a.startsWith("--debug="));
const debugView = debugArg ? debugArg.slice(8) : "final";
const DEBUG_MODES = { final: 0, normal: 0, baseColor: 6, roughness: 7, metalness: 8 };
if (!(debugView in DEBUG_MODES)) throw new Error(`未知 Debug Rendering 通道：${debugView}`);
fs.mkdirSync(outDir, { recursive: true });

// 台架把枪绕 Y 转了 90°，所以**枪管轴 = 世界 X、枪口在 -X**；
// 相机 yaw=π（站在 -Z）时枪口朝屏幕右。下面所有机位都按这个约定写。
const PI = Math.PI;
const WEAPONS = [
  { id: "ZhongZheng", len: 1.11 },
  { id: "HanYang", len: 1.25 },
  { id: "Type38", len: 1.276 },
  { id: "Zb26", len: 1.165 },
  // 外购九毫米。**这一支曾经漏在名单外**，于是它在加载画面上碎成一堆尖片、
  // 枪口挂点长在握把底下，谁都没看见 —— 名单漏一把，等于那把枪没人验收。
  { id: "ServicePistol", len: 0.222, closeAt: -0.02 },
  { id: "Grenade", len: 0.22, upright: true },
  // 集束不是普通木柄弹的缩放版；单列出图，保证七枚与捆扎绳的剪影有人验收。
  { id: "GrenadeBundle", len: 0.26, upright: true },
  { id: "Dadao", len: 0.90, upright: true },
  // 带三脚架的架设重机枪必须进入固定台架出图，避免被手持枪姿态托到半空。
  { id: "Type92Hmg", len: 1.156, upright: true },
  // 用户提供的卢沟桥合集。识别未定的组件也进入固定台架出图，防止“加进表里但
  // 从来没人看过”再发生；它们不进入第一人称玩法时仍可在这里逐件验收贴图。
  { id: "OfficerSwordSet", len: 1.000 },
  { id: "RingPommelDagger", len: 0.450, upright: true },
  { id: "BrowningTripodAssembly", len: 2.273, upright: true },
  { id: "UnidentifiedMunition", len: 0.253, upright: true },
  { id: "MediumMortar", len: 1.444, upright: true },
  { id: "Type11", len: 1.100 },
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
await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?quality=high&scale=small&${reloadSheet ? "range=1&shot=1" : "phase=0"}&menu=0`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
await page.evaluate(() => window.Taierzhuang.StepFrames(30));
await page.evaluate(() => window.Taierzhuang.Debug.OpenEditor("weapon"));
await page.evaluate(() => window.Taierzhuang.StepFrames(10));

// 面板与 HUD 挡住展台就白拍了。出图期间整个 DOM 层收掉，只留 canvas。
await page.addStyleTag({ content: ".edPanel, .edGear, #hud, .hud { display: none !important; }" });

const Sheet = async (entry) => page.evaluate(async ({ w, flatMode }) => {
  const T = window.Taierzhuang;
  const THREE = await import("./vendor/three/build/three.module.js");
  const editor = T.editor.active;
  editor.spin = false;
  editor.SetMode("bench");
  editor.SetWeapon(w.id, w.variant || 0);
  T.StepFrames(2);

  // 纯色对照：把台架上每块网格的材质换成同色系的无贴图 PBR。
  // 换的是 mesh.material 引用，不动材质库里的那一份（那是全场共用的）。
  //
  // 认桶靠**引用相等**，不是 material.name —— MaterialLibrary 出的材质根本没设
  // name（设 name 的只有 Script_Actor 里那组一次性的 SentinelMaterials）。
  // 照着 name 分桶的话每一块都落进 else 分支，整支枪会被刷成同一种材质，
  // 对照图看起来"和有贴图的一模一样"，得出的结论是反的。
  if (flatMode && editor.benchGroup) {
    // 页面已经加载过 three，上面的 import 拿到的是同一个模块实例（不是第二份库）
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
    editor.benchGroup.traverse((child) => {
      if (!child.isMesh || !child.material || child.material.isMeshBasicMaterial) return;
      child.material = byRef.get(child.material) || plain.steel;
    });
  }

  const src = document.getElementById("view");
  const cw = 640, ch = 360;
  const sheet = document.createElement("canvas");
  sheet.width = cw * 2; sheet.height = ch * 2;
  const ctx = sheet.getContext("2d");
  // 不再猜“平举 1.1 m / 竖放半个枪长”：架设武器现在按真实包围盒落地，刀具
  // 也可能在 ActorGeometry 中转过轴。直接从最终台架组取中心与跨度，截图才能
  // 与编辑器所见严格一致，不会把高射炮或三脚架的上半截裁掉。
  const bounds = new THREE.Box3().setFromObject(editor.benchGroup);
  const center = bounds.getCenter(new THREE.Vector3());
  const span = bounds.getSize(new THREE.Vector3());
  const centerY = center.y;
  const wide = Math.max(0.75, w.len * 1.8, span.x * 2.0, span.y * 2.0);
  const views = [
    { name: "正侧", yaw: Math.PI, pitch: 0.05, dist: wide, tx: 0, ty: centerY },
    { name: "俯视", yaw: Math.PI, pitch: 1.20, dist: wide, tx: 0, ty: centerY },
    { name: "四分之三", yaw: Math.PI + 0.85, pitch: 0.32, dist: wide * 0.9, tx: 0, ty: centerY },
    {
      name: "机匣特写", yaw: Math.PI + 0.45, pitch: 0.20,
      dist: Math.max(0.26, Math.min(wide * 0.65, Math.max(span.x, span.y, span.z) * 0.65)),
      tx: w.closeAt != null ? w.closeAt : center.x,
      ty: centerY + span.y * 0.18,
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
  editor.SetWeapon(w.id, w.variant || 0);
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

const ReloadSheet = async (entry) => page.evaluate(async ({ w }) => {
  const T = window.Taierzhuang, editor = T.editor.active;
  editor.SetMode("fp");
  const src = document.getElementById("view");
  const cw = 640, ch = 360;
  const sheet = document.createElement("canvas");
  sheet.width = cw * 4; sheet.height = ch * 2;
  const ctx = sheet.getContext("2d");
  const times = [0.18, 0.40, 0.62, 0.90];
  const samples = [];
  for (let row = 0; row < 2; row += 1) {
    editor.SetWeapon(w.id, w.variant || 0);
    editor.ads = row;
    T.StepFrames(90);
    editor.Trigger("reload");
    // Exercise leaving ADS before reload. The editor pins its calibration FOV
    // to this switch, unlike runtime's action-aware FOV suppression.
    editor.ads = 0;
    if (T.viewmodel.weaponId !== w.id || T.viewmodel.action?.kind !== "reload") {
      throw new Error(`Reload preview did not equip and start ${w.id}`);
    }
    for (let col = 0; col < times.length; col += 1) {
      let guard = 0;
      while (T.viewmodel.action && T.viewmodel.action.t < times[col] && guard++ < 300) T.StepFrames(1);
      const vm = T.viewmodel;
      const origin = vm.rig.group.getWorldPosition(new (vm.handBase.right.constructor)()).project(T.camera);
      samples.push({ entry: row ? "ads" : "hip", t: vm.action?.t, originNdc: origin.toArray(),
        actionRotation: vm.actionPivot.rotation.toArray(), reloadRotation: vm.reloadPivot?.rotation.toArray(),
        contactWeight: vm.riggedArms ? { ...vm.riggedArms.contactWeight } : null });
      const x = col * cw, y = row * ch;
      ctx.drawImage(src, 0, 0, src.width, src.height, x, y, cw, ch);
      ctx.fillStyle = "rgba(0,0,0,.8)"; ctx.fillRect(x + 5, y + 5, 285, 25);
      ctx.fillStyle = "#fff"; ctx.font = "15px sans-serif";
      ctx.fillText(`${w.id} / ${row ? "ADS entry" : "Hip entry"} / ${times[col]}`, x + 12, y + 23);
    }
  }
  return { image: sheet.toDataURL("image/png"), samples };
}, { w: entry });

let list = only
  ? WEAPONS.filter((w) => only.includes(w.id) || only.includes(w.shotId))
  : WEAPONS;
if (reloadSheet) list = list.filter(entry => weaponDefinitions[entry.id]?.ammo && weaponDefinitions[entry.id]?.magazine);
for (const entry of list) {
  await page.evaluate(({ view, materialMode }) => {
    const T = window.Taierzhuang;
    if (T.library?.gi) T.library.gi.debugView.value = materialMode;
    T.post.SetDebugView(view, T.gi, !!T.library?.gi);
  }, { view: debugView, materialMode: DEBUG_MODES[debugView] });
  const reload = reloadSheet ? await ReloadSheet(entry) : null;
  const dataUrl = reload ? reload.image : firstPerson ? await FpSheet(entry) : await Sheet(entry);
  const file = path.join(outDir,
    `Weapon_${entry.shotId || entry.id}${reloadSheet ? "_Reload" : firstPerson ? "_Fp" : ""}${flat ? "_Flat" : ""}`
    + `${debugView === "final" ? "" : `_Debug${debugView[0].toUpperCase()}${debugView.slice(1)}`}.png`);
  fs.writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
  if (reload) fs.writeFileSync(file.replace(/\.png$/, ".json"), JSON.stringify(reload.samples, null, 2));
  console.log(`ok   ${path.basename(file)}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}

await browser.close();
server.close();
if (problems.length) {
  for (const p of problems) console.log(`FAIL ${p}`);
  process.exit(1);
}
console.log(`\n出图完成：${list.length} 张 → ${outDir}`);
