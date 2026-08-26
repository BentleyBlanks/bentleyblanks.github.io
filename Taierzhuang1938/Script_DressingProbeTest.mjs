// 布设件的「埋墙/叠桩」探针：七关各建一次，把外部道具的碰撞盒与该关**按自己
// LOD 档建出来的**全部程序化碰撞盒做 2D SAT 对撞，穿深 > 0.22 m 即失败。
//
// 用法：node Taierzhuang1938/Script_DressingProbeTest.mjs [--phases=4,5,6]
//
// 为什么必须走引擎真值（而不是几何推算或截图）：同一格院子在不同关是不同
// LOD 档，**中/远景合并体块比近景正房大一圈** —— 只按近景推算空位的摆件会在
// 另一关埋进中景墙体（城西北包 2026-08-25 一次埋了 8 件才发现）。碰撞不走流送、
// 建关即全量，所以这张表就是每关几何的真相。
//
// ALLOWED 是**改动前就存在的**旧摆位贴墙（如东门土袋堵门边上的石堆），
// 视觉上本来就是「堆在墙根」的表达 —— 按件坐标放行，新增件不许往里加：
// 加白名单之前先想想是不是该挪件。
//
// 【已知盲区，2026-08-25 密度轮取证】有三类程序化几何**只画不登记碰撞**，
// 本探针看不见它们，靠它们旁边摆件要自己算几何或截图核验：
//   · 中/远景档土墙院的内隔墙与影壁（sink.Add 无 Solid，东南包手算避让）；
//   · 弘道院 HongdaoAcademy 剪影群（北关包实算七只体块，西到 x=-121.6）；
//   · 城外坟头与侧柏（AddGraveMound 只给低盒/掩蔽，侧柏无盒；东关包整片绕开）。
// 另注意 z>200 的东关最南端：濠外原野降到 -1.4 m 而院台仍在 0 m，
// groundAt 落地的件会陷进台坎（东关包实测后把南界收到 z≤194）。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const phasesArg = process.argv.find((a) => a.startsWith("--phases="));
const phases = phasesArg
  ? phasesArg.slice(9).split(",").map(Number) : [0, 1, 2, 3, 4, 5, 6];

// 旧摆位的既有贴墙（键 = "x,z" 保留一位小数）。
// 其中的 house/housePair/houseRow 压院墙是「下载建筑与程序化院落打架」的
// 老问题（见 Script_ExternalProps 文件头最后一段），不归布设轮管。
const ALLOWED = new Set([
  "307,-67", "303,-65", "304,-64.7", "304.3,-64.4",   // 东门土袋堵与旁边的石堆
  "260,-89",                                          // L4 旧木箱贴院墙
  "84,-70",                                           // L5 旧排屋压院墙（美术尺度问题，另案）
  "-184,-127", "-176,-118",                           // L6 旧木箱/沙袋贴墙
  "128,-1352",                                        // L0 四合院压石墙村矮墙
  "462,-144", "428,-178", "518,-100", "485,-96",      // L2 旧房/排屋/车贴院墙
  "471,-52", "508,-30", "516,14",                     // L3 旧箱/双栋/砖堆贴墙
]);

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

let bad = 0;
for (const phase of phases) {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=${phase}&quality=high&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.battlefield?.externalProps, null,
    { timeout: 180000 });
  const report = await page.evaluate(() => {
    const b = window.Taierzhuang.battlefield;
    const externals = b.externalProps.colliders || [];
    const externalSet = new Set(externals);
    function corners(box) {
      const cos = Math.cos(box.ry || 0), sin = Math.sin(box.ry || 0);
      const [hx, , hz] = box.h;
      const pts = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        pts.push([box.c[0] + cos * sx * hx + sin * sz * hz,
          box.c[2] - sin * sx * hx + cos * sz * hz]);
      }
      return pts;
    }
    // 返回 { depth, ax, az, push }。
    //
    // **depth 的定义一个字都没动**（各分离轴上投影重叠的最小值）——
    // 0.22 m 那道闸和 ALLOWED 名单都是按这个数攒出来的，改了等于全部作废。
    //
    // 新加的是 push：把这件**真的挪开**要走多远。
    // 这两个数不是一回事，栽过一次所以写下来：depth 取的是 min(a1,c1) − max(a0,c0)，
    // 当 a 的投影**整个套在** c 的投影里面（细长件横跨一条田埂就是这样），
    // 这个值等于 a 自己的宽度 —— 沿那条轴挪这么远，a 仍然整个套在里面，没挪开。
    // 真正的最小平移量是 min(a1 − c0, c1 − a0)：把 a 推出 c 的**某一端**。
    // （实例：晾晒木架 0.30 m 宽横跨 8.8 m 长的田埂，depth 报 0.29，
    //   而横着挪 0.34 m 什么也没解决 —— 该挪的是 z，让它整个下田埂。）
    function penetration(a, c) {
      const axes = [
        [Math.cos(a.ry || 0), Math.sin(a.ry || 0)],
        [-Math.sin(a.ry || 0), Math.cos(a.ry || 0)],
        [Math.cos(c.ry || 0), Math.sin(c.ry || 0)],
        [-Math.sin(c.ry || 0), Math.cos(c.ry || 0)],
      ];
      const pa = corners(a), pc = corners(c);
      let depth = Infinity;
      let mtv = Infinity, best = [1, 0];
      for (const [ax, az] of axes) {
        let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity;
        for (const [px, pz] of pa) { const v = px * ax + pz * az; a0 = Math.min(a0, v); a1 = Math.max(a1, v); }
        for (const [px, pz] of pc) { const v = px * ax + pz * az; c0 = Math.min(c0, v); c1 = Math.max(c1, v); }
        const overlap = Math.min(a1, c1) - Math.max(a0, c0);
        if (overlap <= 0) return { depth: -1, ax: 0, az: 0, push: 0 };
        depth = Math.min(depth, overlap);
        // 两个方向各自要走多远才把 a 推出 c 的一端，取近的那一头。
        const back = a1 - c0;        // 往 −轴 推
        const forward = c1 - a0;     // 往 +轴 推
        const move = Math.min(back, forward);
        if (move < mtv) {
          mtv = move;
          best = back < forward ? [-ax, -az] : [ax, az];
        }
      }
      return { depth, ax: best[0], az: best[1], push: mtv };
    }
    const out = [];
    for (const e of externals) {
      for (const c of b.colliders) {
        if (externalSet.has(c)) continue;
        if (e.min[0] > c.max[0] + 0.5 || e.max[0] < c.min[0] - 0.5
          || e.min[2] > c.max[2] + 0.5 || e.max[2] < c.min[2] - 0.5) continue;
        if (Math.min(e.max[1], c.max[1]) - Math.max(e.min[1], c.min[1]) < 0.15) continue;
        const { depth, ax, az, push } = penetration(e, c);
        if (depth > 0.22) {
          out.push({
            key: `${+e.c[0].toFixed(1)},${+e.c[2].toFixed(1)}`,
            prop: {
              x: +e.c[0].toFixed(1), z: +e.c[2].toFixed(1), tag: e.tag,
              hx: +e.h[0].toFixed(2), hz: +e.h[2].toFixed(2), ry: +(e.ry || 0).toFixed(2),
            },
            hit: {
              x: +c.c[0].toFixed(1), z: +c.c[2].toFixed(1), tag: c.tag,
              hx: +c.h[0].toFixed(2), hz: +c.h[2].toFixed(2), ry: +(c.ry || 0).toFixed(2),
            },
            depth: +depth.toFixed(2),
            // 脱开这一件要往哪挪多少（留 0.05 m 富余，别正好贴着）
            move: { x: +(ax * (push + 0.05)).toFixed(2), z: +(az * (push + 0.05)).toFixed(2) },
          });
        }
      }
    }
    return { count: externals.length, overlaps: out };
  });
  const fresh = report.overlaps.filter((o) => !ALLOWED.has(o.key));
  console.log(`phase=${phase} external=${report.count}`
    + ` overlaps=${report.overlaps.length} fresh=${fresh.length}`);
  for (const o of fresh) {
    const Sign = (v) => `${v >= 0 ? "+" : ""}${v}`;
    console.log(`  FAIL prop(${o.prop.x},${o.prop.z},${o.prop.tag}`
      + ` 半宽 ${o.prop.hx}×${o.prop.hz})`
      + ` x hit(${o.hit.x},${o.hit.z},${o.hit.tag} 半宽 ${o.hit.hx}×${o.hit.hz} ry=${o.hit.ry})`
      + ` depth=${o.depth} → 挪 (${Sign(o.move.x)},${Sign(o.move.z)})`);
    bad += 1;
  }
}
await browser.close();
server.close();
console.log(bad ? `DRESSING_PROBE_FAIL fresh=${bad}` : "DRESSING_PROBE_OK");
process.exit(bad ? 1 : 0);
