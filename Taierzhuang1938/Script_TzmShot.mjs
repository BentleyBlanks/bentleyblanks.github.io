// TZM 模型出图：把 Model/ 里指定的 .tzm.json 用真材质摆到台架拍三视图。
//
// 用法：node Taierzhuang1938/Script_TzmShot.mjs --id Type89Tank [--out dir]
//
// 与 _blender/Verify.mjs 同一套接线（真浏览器 + 真材质 + 渲染一帧），只是把
// 结果写成 PNG —— 换模后先用它肉眼验收，再跑 Verify 的数值断言。

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = here;
const rootDir = path.resolve(projectDir, "..");
const args = process.argv.slice(2);
const idArg = args.find((a) => a.startsWith("--id="));
const id = idArg ? idArg.slice(5) : null;
const outDir = path.resolve(args.find((a) => a.startsWith("--out="))?.slice(6)
  || path.join(projectDir, "_shots", "tzm"));
fs.mkdirSync(outDir, { recursive: true });

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on("pageerror", (error) => problems.push(String(error).slice(0, 200)));

const harness = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{
  "three":"/Taierzhuang1938/vendor/three/build/three.module.js",
  "./vendor/three/build/three.core.js":"/Taierzhuang1938/vendor/three/build/three.core.js"
}}</script></head><body><canvas id="c"></canvas></body></html>`;

const url = `http://127.0.0.1:${port}/Taierzhuang1938/_tzmshot.html`;
await page.route(url, (route) => route.fulfill({
  status: 200, contentType: "text/html; charset=utf-8", body: harness,
}));
await page.goto(url, { waitUntil: "load", timeout: 60000 });

const result = await page.evaluate(async ({ id, outDir }) => {
  const THREE = await import("./vendor/three/build/three.module.js");
  const { LoadModel } = await import("./Script_MeshLoad.mjs");
  const { MESHES, MODEL_BASE, MERGE_PROFILES } = await import("./Data_Meshes.mjs");
  const { MaterialLibrary } = await import("./Script_Materials.mjs");

  const canvas = document.getElementById("c");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setSize(1280, 720, false);
  renderer.shadowMap.enabled = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8b8b93);
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(45, 1280 / 720, 0.02, 200);

  const library = new MaterialLibrary(renderer, { textureSize: 128 });
  for (const _ of library.PrepareSteps(["ClothNra", "ClothIja", "Steel", "SteelHelmet",
    "WoodStock", "Stone", "WoodBeam", "WoodDoor", "RoofTile"])) { /* 逐配方烘 */ }
  for (const part of ["Armor", "Track"]) {
    await library.LoadExternalSet(`Type89${part}`, {
      albedo: `./Texture/Texture_Type89${part}Base.webp`,
      normal: `./Texture/Texture_Type89${part}Normal.webp`,
      orm: "./Texture/Texture_Type89Orm.png",
    });
  }
  const Plain = (name, color, roughness, doubleSide) => library.Plain(name, {
    color, roughness, metalness: 0, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  const MaterialsFor = (cloth, shoeColor = 0x2B2B2E) => ({
    uniform: library.Get(cloth, { roughness: 1 }),
    accessory: library.Get(cloth, { roughness: 1, repeat: 1.2 }),
    skin: Plain("skin", 0xB4906C, 0.78),
    shoe: Plain("shoe", shoeColor, 0.94),
    leather: Plain("leather", 0x3A2C22, 0.66),
    towel: Plain("towel", 0xEDE9DF, 0.95),
    red: Plain("red", 0x9E2B22, 0.92),
    accentA: Plain("accentA", 0x1F3A93, 0.8, true),
    accentB: Plain("accentB", 0xEDEFF2, 0.7, true),
    helmet: library.Get("SteelHelmet", { roughness: 0.72, metalness: 0.85 }),
    steel: Plain("steel", 0x6d7075, 0.62, true),
    blade: Plain("DadaoBlade", { color: 0x929aa2, roughness: 0.34, metalness: 0.95 }),
    grip: Plain("DadaoGrip", { color: 0x8f7c61, roughness: 0.78, metalness: 0 }),
    dadao: Plain("DadaoPbrFallback", { color: 0x77736f, roughness: 0.58, metalness: 0.72 }),
    type89Armor: library.Get("Type89Armor", { side: THREE.DoubleSide }),
    type89Barrel: library.Get("Type89Armor", { side: THREE.DoubleSide }),
    type89Track: library.Get("Type89Track", { side: THREE.DoubleSide }),
    wood: library.Get("WoodStock", { roughness: 0.86, metalness: 0 }),
    armor: Plain("armor", 0x555c4a, 1, true),
    track: Plain("track", 0x3b3d3c, 1, true),
    Stone: library.Get("Stone", { roughness: 0.92, metalness: 0 }),
    WoodBeam: library.Get("WoodBeam", { roughness: 0.9, metalness: 0 }),
    WoodDoor: library.Get("WoodDoor", { roughness: 0.88, metalness: 0 }),
    RoofTile: library.Get("RoofTile", { roughness: 0.85, metalness: 0 }),
  });

  const ids = id ? [id] : ["Type95HaGo", "Type97ChiHa", "Type89Tank"];
  const out = [];
  for (const modelId of ids) {
    const entry = MESHES[modelId];
    if (!entry) { out.push({ id: modelId, error: "no entry" }); continue; }
    const model = await LoadModel(MODEL_BASE + entry.file, {
      materials: MaterialsFor("ClothNra", modelId === "SoldierNra" ? 0x9E875A : 0x2B2B2E),
      mergeMap: MERGE_PROFILES.high,
    });
    if (!model) { out.push({ id: modelId, error: "load null" }); continue; }
    model.root.traverse((o) => { o.frustumCulled = false; });
    scene.add(model.root);
    model.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.root);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 0.75;

    const Shot = async (name, dirVec, target = center, distance = r * 2.0) => {
      camera.position.copy(target).add(new THREE.Vector3(...dirVec).normalize().multiplyScalar(distance));
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const data = renderer.domElement.toDataURL("image/png");
      out.push({ id: modelId, name, data });
    };
    await Shot("side", [0, 0.25, 1]);      // 站 -Z 看（侧面：车头朝左）
    await Shot("front34", [-1, 0.35, -1]); // 左前 3/4（看得到车头与炮塔）
    await Shot("top", [0.01, 1, 0.01]);    // 俯视
    if (entry.category === "soldier") {
      // 后上方看头。头饰与颅骨在后脑相切，穿模的样子是**头饰后半一条肉色折线**
      // （游戏里低头看脚边的尸体大致就是这个角度）——三视图那三张离得太远，
      // 2 mm 的折线在上面只有一个像素，看不出来。四个人物模型共用一套 HeadShape，
      // 所以这两张对四个都拍。
      const head = new THREE.Vector3(center.x, box.max.y - 0.13, 0);
      await Shot("headRearTop", [0.16, 0.9, 1], head, 0.30);
      await Shot("headRear34", [0.95, 0.45, 1], head, 0.30);
    }
    if (modelId === "SoldierNra") {
      const feet = new THREE.Vector3(center.x, box.min.y + 0.10, center.z - 0.05);
      await Shot("feetFront", [-1, 0.18, -1], feet, 0.42);
      await Shot("feetSide", [1, 0.14, 0.05], feet, 0.40);
    }
    scene.remove(model.root);
    for (const mesh of model.meshes) mesh.geometry.dispose();
  }
  return out;
}, { id, outDir });

if (result.length === 0) {
  console.log("no shots");
} else {
  for (const shot of result) {
    if (!shot.data) { console.log("FAIL " + shot.id + " " + (shot.error || "")); continue; }
    const file = path.join(outDir, `${shot.id}_${shot.name}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data.split(",")[1], "base64"));
    console.log("ok   " + file);
  }
}
for (const p of problems) console.log("PROBLEM " + p);

await browser.close();
server.close();
process.exit(0);
