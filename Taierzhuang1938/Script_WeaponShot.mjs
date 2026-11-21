// 《台儿庄：血战滕县》枪械外观出图：把编辑器台架上的每一把枪按固定机位拍成一张四宫格。
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
//   --fp   拍第一人称那一份（腰射 / 开镜 / 开火 / 拉栓），走「第一人称持枪检查」的玩家视角。第一人称与台架是
//          **两套几何**（见 Script_Viewmodel），台架改好了不等于手里那把也对。
//   --reload 拍全枪械换弹：腰射/ADS起手两行，各四个机械关键帧；附同名JSON投影轨迹。
//   --reload-times=.285,.42,.50,.78 指定四个装填时刻；--base-url=http://127.0.0.1:8099 复用本地预览。
//   --reload-motion 另存正常时钟的连续原始帧；--reload-rounds=3 检查有余弹的装填。
// 默认输出到 Taierzhuang1938/_shots/（已 gitignore）。

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { WEAPONS as weaponDefinitions } from "./Data_Weapons.mjs";
import { WeaponShelved } from "./Script_Weapons.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(projectDir, "_shots"));
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice(7).split(",") : null;
const flat = args.includes("--flat");
const firstPerson = args.includes("--fp");
// Repeatable reload review: four mechanical keyframes, hip and ADS entry rows.
const reloadMotion = args.includes("--reload-motion");
const reloadSheet = args.includes("--reload") || reloadMotion;
const reloadRounds = Number(args.find(a => a.startsWith("--reload-rounds="))?.slice(16) || 0);
if (!Number.isInteger(reloadRounds) || reloadRounds < 0 || reloadRounds > 30) throw new Error("Invalid initial reload round count");
const reloadTimes = args.find(a => a.startsWith("--reload-times="))?.slice(15).split(",").map(Number)
  || [0.18, 0.40, 0.62, 0.90];
if (reloadTimes.length !== 4 || reloadTimes.some((t, i) => !Number.isFinite(t) || t <= 0 || t >= 1
  || (i && t <= reloadTimes[i - 1]))) throw new Error("--reload-times requires four increasing times between 0 and 1");
const debugArg = args.find((a) => a.startsWith("--debug="));
const debugView = debugArg ? debugArg.slice(8) : "final";
const DEBUG_MODES = { final: 0, normal: 0, baseColor: 6, roughness: 7, metalness: 8 };
if (!(debugView in DEBUG_MODES)) throw new Error(`未知 Debug Rendering 通道：${debugView}`);
fs.mkdirSync(outDir, { recursive: true });

// 台架把枪绕 Y 转了 90°，所以**枪管轴 = 世界 X、枪口在 -X**；
// 相机 yaw=π（站在 -Z）时枪口朝屏幕右。下面所有机位都按这个约定写。
const WEAPONS = [
  { id: "ZhongZheng" },
  { id: "HanYang" },
  { id: "Type38" },
  { id: "Zb26" },
  // 外购九毫米。**这一支曾经漏在名单外**，于是它在加载画面上碎成一堆尖片、
  // 枪口挂点长在握把底下，谁都没看见 —— 名单漏一把，等于那把枪没人验收。
  { id: "ServicePistol", closeAt: -0.02 },
  { id: "Grenade" },
  { id: "GrenadeBundle" },
  { id: "Dadao" },
  // 带三脚架的架设重机枪必须进入固定台架出图，避免被手持枪姿态托到半空。
  { id: "Type92Hmg" },
  // 用户提供的卢沟桥合集。识别未定的组件也进入固定台架出图，防止“加进表里但
  // 从来没人看过”再发生；它们不进入第一人称玩法时仍可在这里逐件验收贴图。
  { id: "OfficerSwordSet" },
  { id: "MediumMortar" },
  { id: "Type11" },
];

const VIEWPORT = { width: 1280, height: 720 };

const previewUrl = args.find(a => a.startsWith("--base-url="))?.slice(11).replace(/\/$/, "");
const server = previewUrl ? null : await ServeRoot(rootDir, 0);
const baseUrl = previewUrl || `http://127.0.0.1:${server.address().port}`;
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

try {
if (firstPerson || reloadSheet) {
  await page.goto(`${baseUrl}/Taierzhuang1938/?quality=high&scale=small&${reloadSheet ? "weapons=1&shot=1&manual=1" : "phase=0"}&menu=0&audio=0`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(30));
  await page.addStyleTag({ content: ".edPanel, .edGear, .edMenuBar, .edFpsMountHud, .edFpsLegend, .edCross, #hud, .hud { display: none !important; }" });
} else {
  await page.goto(`${baseUrl}/Taierzhuang1938/AdvancedTools/Tool_WeaponInspection.html`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.WeaponInspection !== undefined, null, { timeout: 60000 });
  await page.addStyleTag({ content: `
    .tool-header, .catalog, .details, .view-bar, .bench-footer { display: none !important; }
    .workspace { display: block; height: 100dvh; min-height: 0; padding: 0; }
    .bench { height: 100%; border: 0; }
  ` });
}

const Sheet = async (entry) => page.evaluate(async ({ w, flatMode, debug }) => {
  const THREE = await import("three");
  const { scene: stage, Select } = window.WeaponInspection;
  const model = await Select(w.id, w.variant || 0);
  if (!model) throw new Error(`检查台没有载入模型：${w.id}`);
  stage.Resize();

  // 给取证网格临时换材质引用，材质库继续持有原材质。
  const palette = {
    steel: [0x3b3e42, .55, .85], blade: [0x929aa2, .34, .95], grip: [0x8f7c61, .78, 0],
    wood: [0x6a472b, .8, 0], accessory: [0x7a6a52, .95, 0], red: [0x9e2b22, .92, 0],
  };
  const bucket = new Map(Object.entries(stage.materials).map(([key, material]) => [material, key]));
  const replacements = new Map();
  const temporary = [];
  const Diagnostic = (material) => {
    const { side, normalMap, normalScale } = material;
    if (debug === "normal") return new THREE.MeshNormalMaterial({ side, normalMap, normalScale, toneMapped: false });
    if (debug === "baseColor") return new THREE.MeshBasicMaterial({ side, color: material.color, map: material.map, toneMapped: false });
    const roughness = debug === "roughness";
    const factor = roughness ? material.roughness : material.metalness;
    const map = roughness || material.userData.ormUniforms?.metalness ? material.roughnessMap : material.metalnessMap;
    const preview = new THREE.MeshBasicMaterial({ side, color: new THREE.Color().setScalar(factor), map, toneMapped: false });
    if (map) {
      const channel = roughness ? "g" : "b";
      preview.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>",
          `diffuseColor.rgb *= texture2D(map, vMapUv).${channel};`);
      };
      preview.customProgramCacheKey = () => debug;
    }
    return preview;
  };
  if (flatMode || debug !== "final") {
    model.body.traverseVisible((mesh) => {
      if (!mesh.isMesh) return;
      let material = mesh.material;
      replacements.set(mesh, material);
      if (flatMode) {
        const key = mesh.userData.weaponSurface || bucket.get(material);
        const [color, roughness, metalness] = palette[key] || palette.steel;
        material = new THREE.MeshStandardMaterial({ color, roughness, metalness, side: material.side });
        temporary.push(material);
      }
      if (debug !== "final") {
        material = Diagnostic(material);
        temporary.push(material);
      }
      mesh.material = material;
    });
  }

  const src = stage.canvas;
  const cw = 640, ch = 360;
  const sheet = document.createElement("canvas");
  sheet.width = cw * 2;
  sheet.height = ch * 2;
  const ctx = sheet.getContext("2d");
  const views = [
    { name: "正侧", yaw: Math.PI, pitch: .05 },
    { name: "俯视", yaw: Math.PI, pitch: 1.20 },
    { name: "四分之三", yaw: Math.PI + .85, pitch: .32 },
    { name: "机匣特写", yaw: Math.PI + .45, pitch: .20, detail: true },
  ];
  ctx.fillStyle = "#d5dddf";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  try {
    for (const [i, view] of views.entries()) {
      stage.SetView(view.yaw, view.pitch);
      if (view.detail) {
        stage.zoom = 2.35;
        stage.center.x += w.closeAt ?? 0;
        stage.center.y += model.size.y * .18;
      }
      stage.Draw();
      const x = (i % 2) * cw, y = Math.floor(i / 2) * ch;
      ctx.drawImage(src, 0, 0, src.width, src.height, x, y, cw, ch);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x + 6, y + 6, 96, 24);
      ctx.fillStyle = "#fff";
      ctx.font = "15px sans-serif";
      ctx.fillText(view.name, x + 14, y + 23);
    }
  } finally {
    for (const [mesh, original] of replacements) mesh.material = original;
    for (const material of temporary) material.dispose();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.strokeRect(cw, 0, 0.5, ch * 2);
  ctx.strokeRect(0, ch, cw * 2, 0.5);
  return sheet.toDataURL("image/png");
}, { w: entry, flatMode: flat, debug: debugView });

/** 第一人称四格：腰射 / 开镜 / 开火那一帧 / 拉栓中。 */
const FpSheet = async (entry) => page.evaluate(async ({ w }) => {
  const T = window.Taierzhuang;
  const editor = (() => {
    // 第一人称那一份在「第一人称持枪检查」：玩家视角、收起挂点/骨骼标记与校准红十字，只拍正片画面
    const fp = T.editor.ActiveId === "firstPerson" ? T.editor.active : T.editor.Open("firstPerson");
    fp.SetView("player"); fp.SetAnimationClean(true); fp.calibration = false; fp.UpdateCalibrationView();
    return fp;
  })();
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
    // Return fully from ADS before measuring hip fire; otherwise the two-frame
    // capture is still showing the preceding ADS pose and misleadingly tiny gun.
    ["开火", () => { editor.ads = 0; T.StepFrames(50); editor.Trigger("fire"); }, 2],
    ["拉栓", () => { T.StepFrames(100); editor.Trigger("bolt"); }, 14],
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

const ReloadSheet = async (entry) => page.evaluate(async ({ w, times, motionCapture, remainingRounds }) => {
  const T = window.Taierzhuang, editor = (() => {
    // 第一人称那一份在「第一人称持枪检查」：玩家视角、收起挂点/骨骼标记与校准红十字，只拍正片画面
    const fp = T.editor.ActiveId === "firstPerson" ? T.editor.active : T.editor.Open("firstPerson");
    fp.SetView("player"); fp.SetAnimationClean(true); fp.calibration = false; fp.UpdateCalibrationView();
    return fp;
  })();
  const src = document.getElementById("view");
  const cw = 640, ch = 360;
  const sheet = document.createElement("canvas");
  sheet.width = cw * 4; sheet.height = ch * 2;
  const ctx = sheet.getContext("2d");
  const samples = [];
  for (let row = 0; row < 2; row += 1) {
    editor.SetWeapon(w.id, w.variant || 0);
    editor.ads = row;
    T.StepFrames(90);
    editor.Trigger("reload", { remainingRounds });
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
  const motion = [];
  if (motionCapture) {
    editor.SetWeapon(w.id, w.variant || 0); editor.ads = 0; T.StepFrames(90);
    editor.Trigger("reload", {remainingRounds});
    const frame = document.createElement("canvas"); frame.width=src.width; frame.height=src.height;
    const draw = frame.getContext("2d");
    for(let i=0;i<400&&T.viewmodel.action;i+=3) {
      T.StepFrames(i ? 3 : 1);
      draw.drawImage(src,0,0);
      motion.push({frame:i,normalized:T.viewmodel.action?.t??1,image:frame.toDataURL("image/jpeg",.84)});
    }
  }
  return { image: sheet.toDataURL("image/png"), samples, motion };
}, { w: entry, times: reloadTimes, motionCapture:reloadMotion, remainingRounds:reloadRounds });

let list = only
  ? WEAPONS.filter((w) => only.includes(w.id) || only.includes(w.shotId))
  : WEAPONS;
if (reloadSheet) list = list.filter(entry => weaponDefinitions[entry.id]?.ammo && weaponDefinitions[entry.id]?.magazine);
// 手枪暂时停用：台架上照样出模型图，第一人称持握和换弹图不出。
if (firstPerson || reloadSheet) list = list.filter(entry => !WeaponShelved(entry.id));
for (const entry of list) {
  if (firstPerson || reloadSheet) await page.evaluate(({ view, materialMode }) => {
    const T = window.Taierzhuang;
    if (T.library?.gi) T.library.gi.debugView.value = materialMode;
    T.post.SetDebugView(view, T.gi, !!T.library?.gi);
  }, { view: debugView, materialMode: DEBUG_MODES[debugView] });
  const reload = reloadSheet ? await ReloadSheet(entry) : null;
  const dataUrl = reload ? reload.image : firstPerson ? await FpSheet(entry) : await Sheet(entry);
  const file = path.join(outDir,
    `Weapon_${entry.shotId || entry.id}${reloadSheet ? "_Reload" : firstPerson ? "_Fp" : ""}${reloadRounds?`_Partial${reloadRounds}`:""}${flat ? "_Flat" : ""}`
    + `${debugView === "final" ? "" : `_Debug${debugView[0].toUpperCase()}${debugView.slice(1)}`}.png`);
  fs.writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
  if (reload) fs.writeFileSync(file.replace(/\.png$/, ".json"), JSON.stringify(reload.samples, null, 2));
  if (reload?.motion.length) {
    const folder=path.join(outDir,`Motion_${entry.id}_${reloadRounds?`Partial${reloadRounds}`:"Empty"}`);
    fs.mkdirSync(folder,{recursive:true});
    reload.motion.forEach((frame,index)=>fs.writeFileSync(path.join(folder,`Frame_${String(index).padStart(3,"0")}.jpg`),Buffer.from(frame.image.split(",")[1],"base64")));
    fs.writeFileSync(path.join(folder,"Data_Timeline.json"),JSON.stringify(reload.motion.map(({image,...frame})=>frame),null,2));
    console.log(`motion ${entry.id}: ${reload.motion.length} frames at 20 fps → ${folder}`);
  }
  console.log(`ok   ${path.basename(file)}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}

if (problems.length) {
  for (const p of problems) console.log(`FAIL ${p}`);
  process.exitCode=1;
}
console.log(`\n出图完成：${list.length} 张 → ${outDir}`);
} finally {
  await browser.close();
  if (server) await new Promise(resolve=>server.close(resolve));
}
