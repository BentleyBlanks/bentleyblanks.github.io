// 《滕县 一九三八》碰撞盒对账：**摸得着的东西必须看得见**。
//
// 为什么要单独一层：Script_PhysicsTest 证明的是「碰撞解算没坏」（撞墙撞得住、
// 射线打的是 OBB），而这一层问的是另一件事 —— 那只盒子摆的地方**有没有砖**。
// 两者都绿的时候仍然可能发生：
//
//   · 窗洞被堵死。门窗洞在本作里是真的不砌那一段（墙由若干条水平带叠成），
//     碰撞却按「整开间通高一只盒」登记。玩家看见一个洞，手榴弹却弹回脸上 ——
//     2026-08-26 玩家在滕县车站实测报的就是这一条，当时全城 456 扇格子窗都这样。
//   · 反过来：砖砌得好好的，一只盒子都没有。人直接从厂房外墙走进去。
//
// 这两种病都不抛异常、画面也照旧，只有拿射线去问「这只盒子背后有没有三角形」
// 才看得见。取证一律从运行时状态取（battlefield.colliders + battlefield.meshes），
// 不许读源码推断。
//
// 手法：对每一只**薄墙**碰撞盒，在墙面上打网格，逐点沿墙厚方向射一条短射线，
// 问静态几何有没有挡住。空的采样点连成块 = 一处隐形墙。再按块的位置分类：
//
//   内部空洞  四边都被砖围着          → 窗洞被堵死（本测试的红线）
//   落地空洞  落地、上面与两侧有砖    → 门洞/墙根被堵死（同样是红线）
//   贴顶/贴端 咬到墙头或墙角          → 多半是 AddWall 的 ruin 把墙头削低了，
//                                       而碰撞盒仍按整高登记。这是已认的简化，
//                                       只报数不判红（一律 0.5 m 上下的一条边）。
//
// 用法：node Taierzhuang1938/Script_ColliderTest.mjs
//   TZ_COLLIDER_PHASES=0,1,2,3,4,5,6 跑全部七关（默认只跑 1 与 5：
//   西关有车站与电灯厂，十字街是全城最密的一关）。
// 退出码即成败。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");

/** 判红门槛：比这更大的「洞」才算人或手榴弹过得去的口子。 */
const HOLE_MIN_H = 0.7;          // 洞高（米）
const HOLE_MIN_W = 0.4;          // 洞宽（米）
/** 只对房屋砌体判红。lattice 天线塔、供桌这类「盒子比构件大一圈」是有意为之。 */
const MASONRY_TAGS = ["wall", "door"];

const phases = (process.env.TZ_COLLIDER_PHASES || "1,5")
  .split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 0 && n <= 6);

/**
 * 页面内的扫描。**不要引用模块作用域的任何东西**（要被序列化进浏览器）。
 */
function AuditInPage(options) {
  const o = Object.assign({ step: 0.26, maxThinHalf: 0.9, minWallHalf: 0.45, margin: 0.30,
    minClusterArea: 0.35 }, options || {});
  const bf = window.Taierzhuang.battlefield;
  const meshes = (bf.meshes || []).filter((m) => m && m.isMesh && m.geometry
    && m.geometry.attributes && m.geometry.attributes.position);

  // --- 1. 静态几何摊成世界坐标的三角形汤 ----------------------------------
  let total = 0;
  for (const m of meshes) {
    const g = m.geometry;
    total += (g.index ? g.index.count : g.attributes.position.count) / 3;
  }
  const tri = new Float32Array(total * 9);
  let n = 0;
  for (const m of meshes) {
    m.updateMatrixWorld(true);
    const e = m.matrixWorld.elements;
    const pos = m.geometry.attributes.position;
    const pa = pos.array;
    const idx = m.geometry.index;
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        const vi = (idx ? idx.getX(i + k) : (i + k)) * 3;
        const vx = pa[vi], vy = pa[vi + 1], vz = pa[vi + 2];
        const base = n * 9 + k * 3;
        tri[base] = e[0] * vx + e[4] * vy + e[8] * vz + e[12];
        tri[base + 1] = e[1] * vx + e[5] * vy + e[9] * vz + e[13];
        tri[base + 2] = e[2] * vx + e[6] * vy + e[10] * vz + e[14];
      }
      n += 1;
    }
  }

  // --- 2. XZ 均匀格索引（计数排序，两趟；不建 BVH，够用且省内存） ---------
  const CELL = 2.0;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let t = 0; t < n; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const x = tri[t * 9 + k * 3], z = tri[t * 9 + k * 3 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  const gw = Math.max(1, Math.ceil((maxX - minX) / CELL) + 1);
  const gh = Math.max(1, Math.ceil((maxZ - minZ) / CELL) + 1);
  const Cx = (x) => Math.min(gw - 1, Math.max(0, Math.floor((x - minX) / CELL)));
  const Cz = (z) => Math.min(gh - 1, Math.max(0, Math.floor((z - minZ) / CELL)));
  const counts = new Int32Array(gw * gh + 1);
  const TriCells = (t, fn) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k += 1) {
      const x = tri[t * 9 + k * 3], z = tri[t * 9 + k * 3 + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    const a = Cx(x0), b = Cx(x1), c = Cz(z0), d = Cz(z1);
    if ((b - a + 1) * (d - c + 1) > 400) return;   // 地形那种横跨半张图的巨三角，不进索引
    for (let gz = c; gz <= d; gz += 1) for (let gx = a; gx <= b; gx += 1) fn(gz * gw + gx);
  };
  for (let t = 0; t < n; t += 1) TriCells(t, (cell) => { counts[cell + 1] += 1; });
  for (let i = 0; i < gw * gh; i += 1) counts[i + 1] += counts[i];
  const items = new Int32Array(counts[gw * gh]);
  const cursor = counts.slice(0, gw * gh);
  for (let t = 0; t < n; t += 1) TriCells(t, (cell) => { items[cursor[cell]++] = t; });

  // --- 3. 线段 vs 三角形（Moller-Trumbore，只问有没有） --------------------
  function SegmentHits(ox, oy, oz, dx, dy, dz, len) {
    const gx0 = Cx(Math.min(ox, ox + dx * len)), gx1 = Cx(Math.max(ox, ox + dx * len));
    const gz0 = Cz(Math.min(oz, oz + dz * len)), gz1 = Cz(Math.max(oz, oz + dz * len));
    for (let gz = gz0; gz <= gz1; gz += 1) {
      for (let gx = gx0; gx <= gx1; gx += 1) {
        const cell = gz * gw + gx;
        for (let i = counts[cell]; i < counts[cell + 1]; i += 1) {
          const t = items[i] * 9;
          const ax = tri[t], ay = tri[t + 1], az = tri[t + 2];
          const e1x = tri[t + 3] - ax, e1y = tri[t + 4] - ay, e1z = tri[t + 5] - az;
          const e2x = tri[t + 6] - ax, e2y = tri[t + 7] - ay, e2z = tri[t + 8] - az;
          const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          if (det > -1e-9 && det < 1e-9) continue;
          const inv = 1 / det;
          const tx = ox - ax, ty = oy - ay, tz = oz - az;
          const u = (tx * px + ty * py + tz * pz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
          const vv = (dx * qx + dy * qy + dz * qz) * inv;
          if (vv < 0 || u + vv > 1) continue;
          const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (dist >= 0 && dist <= len) return true;
        }
      }
    }
    return false;
  }

  // --- 4. 逐只薄墙盒扫墙面 ------------------------------------------------
  const out = [];
  let scanned = 0;
  for (const box of bf.colliders) {
    if (!box || box.destroyed) continue;
    const h = box.h || [(box.max[0] - box.min[0]) / 2, (box.max[1] - box.min[1]) / 2, (box.max[2] - box.min[2]) / 2];
    const c = box.c || [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
    const ry = box.ry || 0;
    const thin = h[0] <= h[2] ? 0 : 2;
    const long = thin === 0 ? 2 : 0;
    if (h[thin] > o.maxThinHalf) continue;        // 不是薄墙（墩子、台基、路基）
    if (h[1] < o.minWallHalf) continue;           // 太矮，不是墙
    if (h[long] < 0.3) continue;
    scanned += 1;
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const W = (lx, ly, lz) => [c[0] + cos * lx + sin * lz, c[1] + ly, c[2] - sin * lx + cos * lz];
    const nu = Math.max(2, Math.ceil(2 * h[long] / o.step));
    const nv = Math.max(2, Math.ceil(2 * h[1] / o.step));
    const du = 2 * h[long] / nu, dv = 2 * h[1] / nv;
    const empty = new Uint8Array(nu * nv);
    let emptyCount = 0;
    const len = 2 * (h[thin] + o.margin);
    const dir = thin === 0 ? [cos, 0, -sin] : [sin, 0, cos];
    for (let j = 0; j < nv; j += 1) {
      const lv = -h[1] + dv * (j + 0.5);
      for (let i = 0; i < nu; i += 1) {
        const lu = -h[long] + du * (i + 0.5);
        const start = thin === 0 ? W(-(h[0] + o.margin), lv, lu) : W(lu, lv, -(h[2] + o.margin));
        // 埋在地里的那一截不算空：碰撞盒本来就要往下扎进地表
        if (start[1] < bf.GroundHeight(start[0], start[2]) + 0.12) continue;
        if (!SegmentHits(start[0], start[1], start[2], dir[0], dir[1], dir[2], len)) {
          empty[j * nu + i] = 1; emptyCount += 1;
        }
      }
    }
    if (!emptyCount) continue;
    const seen = new Uint8Array(nu * nv);
    const stack = [];
    for (let s = 0; s < nu * nv; s += 1) {
      if (!empty[s] || seen[s]) continue;
      let i0 = s % nu, i1 = i0, j0 = (s / nu) | 0, j1 = j0, size = 0;
      stack.length = 0; stack.push(s); seen[s] = 1;
      while (stack.length) {
        const q = stack.pop(); size += 1;
        const qi = q % nu, qj = (q / nu) | 0;
        if (qi < i0) i0 = qi; if (qi > i1) i1 = qi;
        if (qj < j0) j0 = qj; if (qj > j1) j1 = qj;
        const nb = [qi > 0 ? q - 1 : -1, qi < nu - 1 ? q + 1 : -1,
          qj > 0 ? q - nu : -1, qj < nv - 1 ? q + nu : -1];
        for (const r of nb) if (r >= 0 && empty[r] && !seen[r]) { seen[r] = 1; stack.push(r); }
      }
      if (size * du * dv < o.minClusterArea) continue;
      // 只有一列/一行宽的「洞」是采样打在缝上（排门板之间 2 cm 的缝），不是口子
      if (i1 === i0 || j1 === j0) continue;
      const mid = -h[long] + du * (i0 + i1 + 1) / 2;
      out.push({
        tag: box.tag,
        w: +((i1 - i0 + 1) * du).toFixed(2),
        hgt: +((j1 - j0 + 1) * dv).toFixed(2),
        y: [+(c[1] - h[1] + dv * j0).toFixed(2), +(c[1] - h[1] + dv * (j1 + 1)).toFixed(2)],
        at: (thin === 0 ? W(0, 0, mid) : W(mid, 0, 0)).map((q) => +q.toFixed(1)),
        touchesTop: j1 === nv - 1,
        touchesBottom: j0 === 0,
        touchesEnd: i0 === 0 || i1 === nu - 1,
        from: box.__from || null,
      });
    }
  }
  out.sort((a, b) => b.w * b.hgt - a.w * a.hgt);
  return { triangles: n, scanned, findings: out };
}

/** 给 BuildSink.Solid 挂一层记堆栈的钩子：红了的时候能指回是哪一行登记的。 */
function HookSolidInPage() {
  const bf = window.Taierzhuang.battlefield;
  const sink = (bf.city && bf.city.sink) || (bf.outfield && bf.outfield.sink);
  if (!sink) return false;
  const proto = Object.getPrototypeOf(sink);
  if (proto.__solidHooked) return true;
  proto.__solidHooked = true;
  const original = proto.Solid;
  proto.Solid = function (...args) {
    const before = this.colliders.length;
    const r = original.apply(this, args);
    const stack = (new Error().stack || "").split("\n").slice(2, 5)
      .map((s) => s.trim().replace(/^at\s+/, "").replace(/http:\/\/127\.0\.0\.1:\d+\/Taierzhuang1938\//, ""))
      .join(" <- ");
    for (let i = before; i < this.colliders.length; i += 1) this.colliders[i].__from = stack;
    return r;
  };
  return true;
}

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();

const problems = [];
const results = [];
function Check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

/** 洞大到人或手榴弹过得去，而且这只盒子是房屋砌体 —— 那就是红。 */
// 咬到墙头（touchesTop）或墙角（touchesEnd）的不算：那是 ruin 削墙头与相邻墙段
// 交界的差，不是洞。四周被砖围着、或落地但上方两侧都有砖的，才是被堵死的洞口。
const Blocking = (f) => MASONRY_TAGS.includes(f.tag)
  && f.hgt >= HOLE_MIN_H && f.w >= HOLE_MIN_W
  && !f.touchesTop && !f.touchesEnd;

for (const phase of phases) {
  console.log(`\n--- 阶段 ${phase} ---`);
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  page.on("pageerror", (e) => problems.push(`PAGEERROR ${String(e).slice(0, 240)}`));
  const url = `http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=${phase}&quality=low&scale=small`;
  await page.goto(url, { waitUntil: "load", timeout: 300000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 300000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(20));

  let res = await page.evaluate(AuditInPage, {});
  Check(`关 ${phase} 静态几何与碰撞都建起来了`, res.triangles > 100000 && res.scanned > 200,
    `三角=${res.triangles} 薄墙盒=${res.scanned}`);

  let bad = res.findings.filter(Blocking);
  // 有红才回炉：挂上堆栈钩子重建一次本关，把每一处指回登记它的那一行。
  if (bad.length) {
    await page.evaluate(HookSolidInPage);
    await page.evaluate((p) => window.Taierzhuang.JumpToPhase(p), phase);
    await page.evaluate(() => window.Taierzhuang.StepFrames(20));
    res = await page.evaluate(AuditInPage, {});
    bad = res.findings.filter(Blocking);
  }
  Check(`关 ${phase} 没有「看得见的洞、摸得着的墙」`, bad.length === 0,
    `砌体空洞=${bad.length} / 全部空洞=${res.findings.length}`);
  for (const f of bad.slice(0, 12)) {
    console.log(`     洞 ${f.w}×${f.hgt} m  tag=${f.tag}  at=[${f.at}]  y=${f.y[0]}..${f.y[1]}`);
    if (f.from) console.log(`         ${f.from}`);
  }
  // 贴顶/贴端那一类只报数：AddWall 的 ruin 把墙头削低而碰撞按整高登记，已认的简化
  const ruinish = res.findings.filter((f) => !Blocking(f));
  console.log(`     （另有 ${ruinish.length} 处已认的边角差：破损墙头、桁架塔与供桌一类）`);
  await page.close();
}

await browser.close();
server.close();

if (problems.length) {
  console.log("\n运行时报错：");
  for (const p of problems.slice(0, 10)) console.log(`  ${p}`);
}
const failed = results.filter((r) => !r.ok).length + problems.length;
console.log(`\n合计 ${results.length} 条断言，${failed ? `${failed} 条红` : "全绿"}`);
process.exit(failed ? 1 : 0);
