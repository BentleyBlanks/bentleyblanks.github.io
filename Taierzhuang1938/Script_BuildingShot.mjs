// 建筑构件台：把 Script_World 里的某一个建造器**单独**建一栋，用真材质拍
// 正视 / 侧视 / 俯视三张正交图，拼成一张纯白底的三视图 PNG。
//
// 用法：node Taierzhuang1938/Script_BuildingShot.mjs [--id=Courtyard] [--out=dir]
//       node Taierzhuang1938/Script_BuildingShot.mjs --list
//
// 为什么要有它：形制对不对，在满是布设、雾、日照和邻屋遮挡的实机截图里根本
// 判不了 —— 上一轮就是拿实机截图当验收，结果「山墙加了三件饰件」被当成
// 「照三视图改完了」，而体量比例、开间、屋顶收头一条都没对。参考资料是**正交
// 三视图**，那么我方也必须出正交三视图，两张并排才谈得上「像不像」。
//
// 与 Script_TzmShot 的关系：那一份拍的是 Model/ 里的 .tzm.json 静态模型，
// 这一份拍的是**程序化建造器**（没有模型文件，只有一段生成几何的函数）。
// 接线（真浏览器 + 真材质 + 渲染一帧 → PNG）是同一套。
//
// 三视图约定与参考图对齐：正视图在左上、侧视图在右上、俯视图在下方居中，
// 三个视图**共用同一个米/像素比例**（互相之间量得出高低宽窄），背景纯白。
// 正交相机，不是透视 —— 参考图是三视图，透视会让「比例差多少」无从判起。

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..");
const args = process.argv.slice(2);
const Arg = (k, d = null) => {
  const hit = args.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};

/**
 * 台上能摆的构件。`ry: Math.PI` 那几个是为了让「正面」朝正交相机 ——
 * 各建造器的局部朝向约定并不统一（见 Script_World 里 AddPierPorchHouse 的头注），
 * 这里按各自实际朝向把正面转向 +Z，三视图的「正视」才真的是正面。
 */
const SUBJECTS = {
  // 1 · 城内民居：参考图「城墙外侧紧贴的两栋民居」。三开间正房单体。
  Dwelling: {
    note: "城内民居（三开间正房单体）",
    // ry=π/2：把山墙转到正对正交相机。参考三视图的「正视图」画的就是山墙面
    // （照片里那两栋民居是山墙冲着城墙的），排布对不上就没法逐项比。
    // facing=-1 让门窗那一面朝 −X，于是落在「侧视图」里 —— 与参考图一致。
    build: `(W, sink) => {
      const eave = 2.75, depth = 5.4, width = 10.2;
      const ridge = eave + depth * 0.5 * Math.tan(27.5 * Math.PI / 180);
      W.AddRoomBlock(sink, {
        x: 0, z: 0, ry: Math.PI / 2, width, depth, eaveY: eave, ridgeY: ridge,
        seed: "bench:dwelling", damage: 0, burnt: false, facing: -1, bays: 3,
      });
    }`,
  },
  // 1b · 参考图那栋民居的**尺寸**：进深约 4 m、檐高约 3.2 m 的小高房。
  //      与上面那栋游戏里在用的三开间正房（进深 5.4 / 檐高 2.6 / 面阔 10.2）
  //      不是一个体量 —— 10 米长的正房再怎么调屋面也变不成 4 米见方的小屋。
  //      两个都摆在台上，形制对不对与尺寸对不对才分得开。
  DwellingSmall: {
    note: "城内民居（参考图尺寸：小高房）",
    build: `(W, sink) => {
      const eave = 3.15, depth = 4.2, width = 5.6;
      const ridge = eave + depth * 0.5 * Math.tan(34 * Math.PI / 180);
      W.AddRoomBlock(sink, {
        x: 0, z: 0, ry: Math.PI / 2, width, depth, eaveY: eave, ridgeY: ridge,
        seed: "bench:dwsmall", damage: 0, burnt: false, facing: -1, bays: 2,
      });
    }`,
  },
  // 2 · 城楼：参考图「日寇攻占的滕县城楼」。只拍城楼本体，不带城台与券洞
  //     （城台是 AddGateComplex 的事，混在一起就看不清楼身比例）。
  GateTower: {
    note: "城楼（重檐歇山亭阁式，不含城台）",
    build: `(W, sink) => {
      W.AddGateTower(sink, { x: 0, z: 0, ry: 0, baseY: 0, seed: "bench:tower" });
    }`,
  },
  // 3 · 砖墩门房：参考图「城墙上那栋」。
  PierPorch: {
    note: "砖墩敞口门房（铺房）",
    build: `(W, sink) => {
      W.AddPierPorchHouse(sink, {
        x: 0, z: 0, ry: 0, width: 4.4, depth: 3.4, porchDepth: 1.6,
        eaveY: 3.2, baseY: 0, seed: "bench:pph", damage: 0, doors: true,
      });
    }`,
  },
};

if (args.includes("--list")) {
  for (const [id, s] of Object.entries(SUBJECTS)) console.log(`${id.padEnd(12)} ${s.note}`);
  process.exit(0);
}

const only = Arg("id");
const ids = only ? [only] : Object.keys(SUBJECTS);
for (const id of ids) {
  if (!SUBJECTS[id]) { console.log(`unknown --id=${id}（--list 看全部）`); process.exit(1); }
}
const outDir = path.resolve(Arg("out") || path.join(here, "_shots", "building"));
fs.mkdirSync(outDir, { recursive: true });

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const problems = [];
page.on("pageerror", (e) => problems.push(String(e).slice(0, 240)));
page.on("console", (m) => { if (m.type() === "error") problems.push(m.text().slice(0, 240)); });

const harness = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{
  "three":"/Taierzhuang1938/vendor/three/build/three.module.js",
  "./vendor/three/build/three.core.js":"/Taierzhuang1938/vendor/three/build/three.core.js"
}}</script></head><body style="margin:0"><canvas id="c"></canvas></body></html>`;
const url = `http://127.0.0.1:${port}/Taierzhuang1938/_buildingshot.html`;
await page.route(url, (r) => r.fulfill({
  status: 200, contentType: "text/html; charset=utf-8", body: harness,
}));
await page.goto(url, { waitUntil: "load", timeout: 60000 });

const shots = await page.evaluate(async ({ subjects, ids }) => {
  const THREE = await import("./vendor/three/build/three.module.js");
  const W = await import("./Script_World.mjs");
  const { MaterialLibrary } = await import("./Script_Materials.mjs");
  const { ResolveTengxianMaterial } = await import("./Script_TengxianCity.mjs");

  const CELL = 760;                       // 单视图边长（像素）
  const canvas = document.getElementById("c");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(CELL, CELL, false);
  renderer.setClearColor(0xffffff, 1);

  // 纯白背景 + 偏软的打光：正交三视图看的是**轮廓与构件关系**，硬阴影会把
  // 屋檐下压成一团黑，反而看不出出檐多少、椽头有没有。
  const library = new MaterialLibrary(renderer, { textureSize: 256 });
  const RECIPES = ["Adobe", "BrickWall", "BrickWallSooty", "CityWallCorePbr",
    "CityWallStonePbr", "GateBrick", "GatePaintedWood", "GateRoofTile", "Ground",
    "GroundRubble", "RoofTile", "Sandbag", "Stone", "TemplePlaster", "WoodBeam", "WoodDoor"];
  for (const _ of library.PrepareSteps(RECIPES)) { /* 逐配方烘 */ }

  const out = [];
  for (const id of ids) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    scene.add(new THREE.AmbientLight(0xffffff, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(3, 6, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.8);
    fill.position.set(-4, 3, -3);
    scene.add(fill);

    const sink = new W.BuildSink();
    // eslint-disable-next-line no-new-func
    (new Function(`return ${subjects[id].build}`))()(W, sink);
    const meshes = sink.Flush(scene, library, {
      castShadow: false, receiveShadow: false,
      resolve: (name, lib) => ResolveTengxianMaterial(name, lib),
    });
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const m of meshes) box.expandByObject(m);
    if (box.isEmpty()) { out.push({ id, error: "空几何" }); continue; }
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // 三视图共用同一比例：取三个视图里最大的那一维当半幅，四周留 8% 余量。
    const half = Math.max(size.x, size.y, size.z) * 0.5 * 1.08;
    const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 400);

    const Render = (dir, up) => {
      camera.position.copy(center).add(new THREE.Vector3(...dir).normalize().multiplyScalar(120));
      camera.up.set(...up);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL("image/png");
    };
    const front = Render([0, 0, 1], [0, 1, 0]);   // 正视：站 +Z 朝 -Z 看
    const side = Render([1, 0, 0], [0, 1, 0]);    // 侧视：站 +X 朝 -X 看
    const top = Render([0, 1, 0.0001], [0, 0, -1]); // 俯视：正上方，画面上方是 -Z

    out.push({
      id, front, side, top, cell: CELL,
      dims: { w: size.x, h: size.y, d: size.z },
    });
    for (const m of meshes) { scene.remove(m); m.geometry.dispose(); }
  }
  return out;
}, { subjects: SUBJECTS, ids });

// 三张单视图拼成一张：正视左上、侧视右上、俯视下方居中，标题与尺寸写在图上。
// 拼图在 Node 侧用一张离屏 canvas 做不了（没有 canvas 依赖），所以拼在浏览器里。
for (const shot of shots) {
  if (shot.error) { console.log(`FAIL ${shot.id} ${shot.error}`); continue; }
  const sheet = await page.evaluate(async ({ shot, note }) => {
    const CELL = shot.cell;
    const PAD = 26, LABEL = 46;
    const cv = document.createElement("canvas");
    cv.width = CELL * 2 + PAD * 3;
    cv.height = CELL * 2 + PAD * 3 + LABEL * 2 + 40;
    const g = cv.getContext("2d");
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, cv.width, cv.height);
    const Load = (src) => new Promise((res) => {
      const im = new Image(); im.onload = () => res(im); im.src = src;
    });
    const [f, s, t] = await Promise.all([Load(shot.front), Load(shot.side), Load(shot.top)]);
    g.fillStyle = "#111";
    g.font = "600 30px sans-serif";
    g.fillText(`${shot.id} — ${note}`, PAD, 34);
    g.font = "400 22px sans-serif";
    g.fillStyle = "#555";
    g.fillText(`外接盒 宽 ${shot.dims.w.toFixed(2)} m × 高 ${shot.dims.h.toFixed(2)} m`
      + ` × 进深 ${shot.dims.d.toFixed(2)} m　（三视图同比例）`, PAD, 64);
    const Put = (img, x, y, label) => {
      g.drawImage(img, x, y, CELL, CELL);
      g.fillStyle = "#111";
      g.font = "500 26px sans-serif";
      g.textAlign = "center";
      g.fillText(label, x + CELL / 2, y + CELL + 32);
      g.textAlign = "left";
    };
    const top0 = 84;
    Put(f, PAD, top0, "正视图");
    Put(s, PAD * 2 + CELL, top0, "侧视图");
    Put(t, PAD + CELL / 2 + PAD / 2, top0 + CELL + LABEL, "俯视图");
    return cv.toDataURL("image/png");
  }, { shot, note: SUBJECTS[shot.id].note });
  const file = path.join(outDir, `${shot.id}_views.png`);
  fs.writeFileSync(file, Buffer.from(sheet.split(",")[1], "base64"));
  console.log(`ok   ${file}`
    + `  (${shot.dims.w.toFixed(2)}×${shot.dims.h.toFixed(2)}×${shot.dims.d.toFixed(2)} m)`);
}
for (const p of problems.slice(0, 6)) console.log(`PROBLEM ${p}`);

await browser.close();
server.close();
process.exit(shots.some((s) => s.error) || problems.length ? 1 : 0);
