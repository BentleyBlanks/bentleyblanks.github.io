// Script_Geo 的快路等价性回归：MakeBox / PlaceGeometry 走的是手写的紧路，
// 必须与 three 的通用路（BoxGeometry / clone+applyMatrix4）**逐浮点相同**。
//
// 为什么要逐位比而不是"看起来一样"：这两个函数一次开机被调十几万次，是建城耗时
// 的头两名（PlaceGeometry 1.37 s、MakeBox 0.59 s，占建城的一半），所以它们绕开了
// three 的通用实现。绕开就必须有人盯着 —— 差一个 ulp 不会报错，只会让某面墙的
// 砖缝错半格、某个屋顶的法线偏一点，然后在实拍里被当成"美术手感变了"。
//
// 用法：node Taierzhuang1938/Script_GeoTest.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const results = [];
const Check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
};

let page;
try {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  // 只借 index.html 的 import map，不让游戏开机（建一座城要十几秒，这里用不着）。
  await ctx.route("**/Script_Main.mjs*", (route) => route.abort());
  page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/`,
    { waitUntil: "domcontentloaded", timeout: 120000 });

  const report = await page.evaluate(async () => {
    const THREE = await import("/Taierzhuang1938/vendor/three/build/three.module.js");
    const Geo = await import("/Taierzhuang1938/Script_Geo.mjs");
    const out = [];

    /** 两个几何体的四个属性逐浮点比。返回第一处不同的说明。 */
    const Diff = (a, b) => {
      const names = new Set([...Object.keys(a.attributes), ...Object.keys(b.attributes)]);
      for (const name of names) {
        const x = a.attributes[name], y = b.attributes[name];
        if (!x || !y) return `属性 ${name} 一边有一边没有`;
        if (x.itemSize !== y.itemSize) return `${name}.itemSize ${x.itemSize} ≠ ${y.itemSize}`;
        if (x.array.length !== y.array.length) return `${name} 长度 ${x.array.length} ≠ ${y.array.length}`;
        if (x.array.constructor !== y.array.constructor) {
          return `${name} 类型 ${x.array.constructor.name} ≠ ${y.array.constructor.name}`;
        }
        for (let i = 0; i < x.array.length; i += 1) {
          if (x.array[i] !== y.array[i]) return `${name}[${i}] ${x.array[i]} ≠ ${y.array[i]}`;
        }
      }
      const ai = a.index, bi = b.index;
      if (!!ai !== !!bi) return "index 一边有一边没有";
      if (ai) {
        if (ai.array.length !== bi.array.length) return `index 长度 ${ai.array.length} ≠ ${bi.array.length}`;
        for (let i = 0; i < ai.array.length; i += 1) {
          if (ai.array[i] !== bi.array[i]) return `index[${i}] ${ai.array[i]} ≠ ${bi.array[i]}`;
        }
      }
      if (a.groups.length !== b.groups.length) return `groups ${a.groups.length} ≠ ${b.groups.length}`;
      for (let i = 0; i < a.groups.length; i += 1) {
        const g = a.groups[i], h = b.groups[i];
        if (g.start !== h.start || g.count !== h.count || g.materialIndex !== h.materialIndex) {
          return `groups[${i}] 不同`;
        }
      }
      return null;
    };

    // --- 1. MakeBox ≡ BoxGeometry + ScaleBoxUv ------------------------------
    let boxBad = null, boxCount = 0;
    const grids = [null, { u: 1 / 6, v: 1 / 4, mirror: true }, { u: 0.25, v: 0, mirror: false }];
    for (let i = 0; i < 240 && !boxBad; i += 1) {
      const w = 0.05 + (i % 37) * 0.31, h = 0.07 + (i % 23) * 0.53, d = 0.11 + (i % 19) * 0.17;
      const tile = [1.2, 1.6, 0.35, 2.6][i % 4];
      const seed = `seed-${i}`;
      const grid = grids[i % grids.length];
      const fast = Geo.MakeBox(w, h, d, tile, seed, grid);
      const slow = Geo.ScaleBoxUv(new THREE.BoxGeometry(w, h, d), w, h, d, tile, seed, grid);
      boxBad = Diff(fast, slow);
      if (boxBad) boxBad = `第 ${i} 个（${w}×${h}×${d} tile=${tile} grid=${!!grid}）：${boxBad}`;
      boxCount += 1;
    }
    out.push(["MakeBox 与 BoxGeometry 逐浮点相同", !boxBad, boxBad || `${boxCount} 组随机尺寸`]);

    // --- 2. PlaceGeometry ≡ clone + applyMatrix4 ----------------------------
    const SlowPlace = (geometry, { x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, scale = 1 } = {}) => {
      const g = geometry.clone();
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ"));
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
      g.applyMatrix4(m);
      return g;
    };
    // 覆盖四种源几何：方料、旋转体（法线不轴对齐）、带 color 的、无 index 的。
    const withColor = new THREE.BoxGeometry(1, 2, 3);
    withColor.setAttribute("color", new THREE.Float32BufferAttribute(
      new Float32Array(withColor.attributes.position.count * 3).map((_, i) => (i % 7) / 7), 3));
    const sources = [
      Geo.MakeBox(1.3, 2.1, 0.7, 1.2, "place"),
      new THREE.CylinderGeometry(0.4, 0.6, 2.2, 9, 2),
      withColor,
      new THREE.PlaneGeometry(2, 3).toNonIndexed(),
    ];
    const poses = [
      {}, { x: 12.5, y: -3.25, z: 7.125 }, { ry: 0.7 }, { rx: -0.31, ry: 2.4, rz: 0.13 },
      { x: -4, y: 1, z: 9, ry: 1.1, scale: 0.37 }, { scale: 2.75, rx: 0.5, rz: -1.2 },
    ];
    let placeBad = null, placeCount = 0;
    for (const src of sources) {
      for (const pose of poses) {
        if (placeBad) break;
        placeBad = Diff(Geo.PlaceGeometry(src, pose), SlowPlace(src, pose));
        if (placeBad) placeBad = `${JSON.stringify(pose)}：${placeBad}`;
        placeCount += 1;
      }
    }
    out.push(["PlaceGeometry 与 clone+applyMatrix4 逐浮点相同", !placeBad,
      placeBad || `${sources.length} 种源几何 × ${poses.length} 个位姿`]);

    // --- 3. 源几何不许被改动（快路直接读源数组，写错就地污染） --------------
    const src = Geo.MakeBox(1, 1, 1, 1.2, "immutable");
    const before = Array.from(src.attributes.position.array);
    Geo.PlaceGeometry(src, { x: 5, ry: 1, scale: 3 });
    const after = Array.from(src.attributes.position.array);
    out.push(["PlaceGeometry 不改源几何", before.every((v, i) => v === after[i]), ""]);

    // --- 4. 合并后的三角形数不变（接上下游） --------------------------------
    const merged = Geo.MergeGeometries([
      Geo.PlaceGeometry(Geo.MakeBox(1, 1, 1, 1.2, "a"), { x: 0 }),
      Geo.PlaceGeometry(Geo.MakeBox(2, 1, 1, 1.2, "b"), { x: 3 }),
    ]);
    out.push(["合并两个方料 = 48 顶点 / 72 索引",
      merged.attributes.position.count === 48 && merged.index.count === 72,
      `${merged.attributes.position.count} 顶点 / ${merged.index.count} 索引`]);
    return out;
  });

  for (const [name, ok, detail] of report) Check(name, ok, detail);
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} 条不过。` : "\n几何快路等价性全过。");
process.exit(failed.length ? 1 : 0);
