// 《滕县 一九三八》物理与 IK 冒烟：真浏览器里**真的去撞墙**，断言碰撞没坏。
//
// 为什么必须有这一层：开机冒烟（Script_BootTest）只证明"画得出来"，
// 通关冒烟（Script_PlayTest）只证明"剧本推得动"。而这一批换掉的是**碰撞解算**，
// 它坏起来的样子是「贴着墙走会被吸上房顶」「AI 从墙里穿过去」「脚踩在地里」——
// 三样都不会抛异常，画面也照旧，只有真的走一趟才看得见。
//
// 断言一律从运行时状态取证（window.Taierzhuang.Debug.*），不许读源码推断。
//
// 用法：node Taierzhuang1938/Script_PhysicsTest.mjs
// 退出码即成败。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });

const problems = [];
page.on("pageerror", (e) => problems.push(`PAGEERROR ${String(e).slice(0, 240)}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const url = m.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${m.text().slice(0, 240)}`);
});

const results = [];
function Check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

// 十字街（L5）是最密的一关：院墙、马道、瓮城、街垒都在这一片。
const PHASE = 5;
const url = `http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=${PHASE}&quality=low&scale=small`;
await page.goto(url, { waitUntil: "load", timeout: 180000 });
await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
await page.evaluate(() => window.Taierzhuang.StepFrames(60));

// --- 1. 静态几何真的灌进物理世界了 -----------------------------------------
{
  const p = await page.evaluate(() => window.Taierzhuang.Debug.Physics());
  Check("物理世界建起来了", p && p.solids > 500 && p.playerBody,
    p ? `碰撞体=${p.solids}/${p.fieldColliders} 刚体=${p.bodies} 玩家胶囊=${p.playerBody}` : "没有");
  // 建关表里的盒子必须一条不落地进物理世界（退化盒会被丢掉，留 1% 余量）
  Check("碰撞盒没有漏灌", p && p.solids >= p.fieldColliders * 0.99,
    p ? `${p.solids} / ${p.fieldColliders}` : "");
}

// --- 2. 射线打的是真实朝向的长方体，不是套出来的包围盒 ---------------------
// 取证方式：在浏览器里另写一份**解析求交**（对每个盒子按 OBB 的 slab 法求最近交点），
// 与引擎给的结果逐条对。两者一致 = 引擎认的是 OBB；
// 若引擎仍按轴对齐盒算，斜置盒那几条射线会明显早命中。
{
  const r = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const boxes = T.battlefield.colliders;
    // 解析：射线 vs OBB（把射线转进盒子的局部坐标再走标准 slab）
    const RayObb = (o, d, b) => {
      const ry = b.ry || 0;
      const c = b.c || [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
      const h = b.h || [(b.max[0] - b.min[0]) / 2, (b.max[1] - b.min[1]) / 2, (b.max[2] - b.min[2]) / 2];
      const cos = Math.cos(ry), sin = Math.sin(ry);
      const rx = o.x - c[0], rz = o.z - c[2];
      const ox = rx * cos - rz * sin, oy = o.y - c[1], oz = rx * sin + rz * cos;
      const dx = d.x * cos - d.z * sin, dy = d.y, dz = d.x * sin + d.z * cos;
      const oo = [ox, oy, oz], dd = [dx, dy, dz];
      let tmin = 0, tmax = 1e9;
      for (let i = 0; i < 3; i += 1) {
        if (Math.abs(dd[i]) < 1e-9) {
          if (oo[i] < -h[i] || oo[i] > h[i]) return null;
          continue;
        }
        const inv = 1 / dd[i];
        let t1 = (-h[i] - oo[i]) * inv, t2 = (h[i] - oo[i]) * inv;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return null;
      }
      return tmin;
    };
    // 从玩家眼睛朝四面八方打，取每条射线上的解析最近交点
    const eye = { x: T.player.position.x, y: T.player.position.y + 1.6, z: T.player.position.z };
    let worst = 0, tested = 0, sample = null, engineMissed = 0;
    const MAX = 60;
    for (let i = 0; i < 96; i += 1) {
      const a = (i / 96) * Math.PI * 2;
      const pitch = ((i % 5) - 2) * 0.06;
      const d = { x: Math.cos(a) * Math.cos(pitch), y: Math.sin(pitch), z: Math.sin(a) * Math.cos(pitch) };
      let ref = null;
      for (const b of boxes) {
        // 粗筛：包围盒离射线太远的跳过（只为省时间，不影响正确性）
        const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
        if (Math.hypot(cx - eye.x, cz - eye.z) > MAX + 30) continue;
        const t = RayObb(eye, d, b);
        if (t !== null && t <= MAX && (ref === null || t < ref)) ref = t;
      }
      const hit = T.Debug.Ray(eye.x, eye.y, eye.z, d.x, d.y, d.z, MAX, false);
      if (ref === null && !hit) continue;
      tested += 1;
      if (ref === null || !hit) { engineMissed += 1; continue; }
      const err = Math.abs(hit.t - ref);
      if (err > worst) { worst = err; sample = { engine: hit.t, exact: ref, tag: hit.tag }; }
    }
    return { tested, worst, sample, engineMissed, boxes: boxes.length };
  });
  Check("射线与解析 OBB 求交一致",
    r.tested > 20 && r.engineMissed === 0 && r.worst < 0.05,
    `射线=${r.tested} 不一致=${r.engineMissed} 最大误差=${(r.worst ?? 0).toFixed(3)} m`);
}

// --- 3. 撞墙不上房顶（老 bug：贴着墙站着被重力吸上墙顶）--------------------
{
  const r = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const p = T.player;
    // 找一堵近处 2 m 以上的墙，站到它前面 1.2 m 处，朝它直走 4 秒
    const near = T.battlefield.NearbyColliders(p.position.x, p.position.z, 60)
      .filter((b) => b.max[1] - b.min[1] > 2.0 && b.tag !== "bridge");
    if (!near.length) return { skipped: true };
    let best = null, bestD = 1e9;
    for (const b of near) {
      const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
      const d = Math.hypot(cx - p.position.x, cz - p.position.z);
      if (d > 6 && d < bestD) { bestD = d; best = { cx, cz, top: b.max[1] }; }
    }
    if (!best) return { skipped: true };
    const dirX = best.cx - p.position.x, dirZ = best.cz - p.position.z;
    const len = Math.hypot(dirX, dirZ);
    const startX = best.cx - dirX / len * 5, startZ = best.cz - dirZ / len * 5;
    p.Spawn(startX, startZ, Math.atan2(-dirX, -dirZ));
    T.StepFrames(6);
    const y0 = p.position.y;
    let maxY = y0;
    T.input.forward = 1;
    for (let i = 0; i < 240; i += 1) { T.StepFrames(1); maxY = Math.max(maxY, p.position.y); }
    T.input.forward = 0;
    return {
      rise: maxY - y0, wallTop: best.top,
      ground: T.battlefield.GroundHeight(p.position.x, p.position.z),
      y: p.position.y,
    };
  });
  if (r.skipped) Check("撞墙不上房顶", true, "（这一片没有够高的墙，跳过）");
  else Check("撞墙不上房顶", r.rise < 0.62,
    `直撞 4 s 抬升=${r.rise.toFixed(2)} m（墙顶 ${r.wallTop.toFixed(1)} m）`);
}

// --- 4. 出生就站在地上，不浮不陷 --------------------------------------------
{
  const r = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const p = T.player;
    let worst = 0, n = 0;
    for (let i = 0; i < 24; i += 1) {
      const a = i / 24 * Math.PI * 2;
      const x = p.position.x + Math.cos(a) * (12 + i), z = p.position.z + Math.sin(a) * (12 + i);
      const c = T.battlefield.ClampToBounds(x, z, 12);
      p.Spawn(c.x, c.z, 0);
      T.StepFrames(30);
      const stand = T.Debug.Probe(p.position.x, p.position.z, p.position.y);
      const gap = Math.abs(p.position.y - stand.y);
      if (gap > worst) worst = gap;
      n += 1;
    }
    return { worst, n };
  });
  Check("站得住（脚底与可站面之差 < 0.12 m）", r.worst < 0.12,
    `抽 ${r.n} 个落点，最大偏差 ${r.worst.toFixed(3)} m`);
}

// --- 3b. 台阶走得上去，**而且不依赖"整帧"** ---------------------------------
// 两件事一起验：
//   · 自动上台阶（autostep）在真场景里管用 —— 马道那一级一级的踏面靠它；
//   · **直接调 player.Update 也要走得动**。角色是运动学刚体，碰撞体的位置
//     原本要等 world.step() 才同步，于是"自己按 1/60 调 player.Update 跑几百次"
//     这种用法下人会原地不动（通关冒烟里「上城道走不上去」正是这一条）。
//     现在 Move/Teleport 会当场同步碰撞体，这里就用最苛刻的那种驱动方式来验。
//
// 先单独锁住解析坡面的贴地：解析地形不在 Rapier 里，控制器自带 snapToGround
// 看不见它。没有项目侧补偿时，角色会沿坡反复「离地一两帧—掉回地面」。
{
  const r = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const PhysicsWorld = T.physics.constructor;
    const Ground = (x) => 10 - x * 0.6;             // 约 31°，仍在可走坡范围内
    const testWorld = new PhysicsWorld({
      groundAt: (x) => Ground(x),
      bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    });
    const body = testWorld.MakeCharacter({ radius: 0.34, height: 1.78,
      position: { x: 0, y: Ground(0), z: 0 } });
    let grounded = true, velocityY = 0, airFrames = 0, maxGap = 0;
    for (let i = 0; i < 240; i += 1) {
      velocityY = grounded ? -0.6 : velocityY - 19.6 / 60;
      const moved = body.Move(0.045, velocityY / 60, 0);
      testWorld.Step(1 / 60);
      grounded = moved.grounded;
      if (grounded) velocityY = 0;
      else airFrames += 1;
      maxGap = Math.max(maxGap, Math.abs(moved.y - Ground(moved.x)));
    }
    const out = { airFrames, maxGap, x: body.position.x, y: body.position.y };
    testWorld.Dispose();
    return out;
  });
  Check("解析下坡保持贴地，不再一路小跳", r.airFrames === 0 && r.maxGap < 0.015,
    `离地帧=${r.airFrames}/240 最大脚底间隙=${r.maxGap.toFixed(3)} m`);
}

{
  const r = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const p = T.player;
    // 台阶跑道锚在街道中线上（L5 出生点在十字街，中线按规矩永远留空）：
    // 旧写法 z-6 落在街肩外的院落边缘带，FindFreeSpot 只保证落点无碰撞，
    // 不保证 +x 方向 5.4 m 跑道无墙 —— 街网照城防图重排后那里真的有院墙了。
    const spot = T.physics.FindFreeSpot(p.position.x - 40, p.position.z, 0.6, 1.9, 26);
    const g0 = T.battlefield.GroundHeight(spot.x, spot.z);
    const RISE = 0.4, RUN = 0.9, N = 6;
    const handles = [];
    for (let i = 0; i < N; i += 1) {
      const top = g0 + RISE * (i + 1);
      const cx = spot.x + RUN * (i + 0.5);
      handles.push(T.physics.AddSolid({
        c: [cx, (g0 - 1 + top) / 2, spot.z], h: [RUN / 2, (top - g0 + 1) / 2, 2.0], ry: 0, tag: "testStair",
        min: [cx - RUN / 2, g0 - 1, spot.z - 2.0], max: [cx + RUN / 2, top, spot.z + 2.0],
      }));
    }
    T.StepFrames(2);
    p.Spawn(spot.x - 1.2, spot.z, Math.atan2(-1, 0));      // 朝 +x
    T.StepFrames(4);
    const y0 = p.position.y;
    const idle = { forward: 1, strafe: 0, sprint: false, ads: false, lean: 0,
      lookX: 0, lookY: 0, crouchPressed: false, pronePressed: false, breathHold: false, sensitivity: 1 };
    let peak = y0;
    // **只调 player.Update，一次 StepFrames 都不调**
    for (let i = 0; i < 360; i += 1) {
      p.yaw = Math.atan2(-1, 0);
      p.Update(1 / 60, idle, null);
      if (p.position.y > peak) peak = p.position.y;
    }
    const out = { y0, peak, x: p.position.x, topY: g0 + RISE * N, startX: spot.x };
    for (const h of handles) T.physics.RemoveSolid(h);
    T.StepFrames(2);
    return out;
  });
  Check("六级 0.4 m 台阶走得上去（只驱动 player.Update，不走整帧）",
    r.peak > r.y0 + 1.6,
    `起点 y=${r.y0.toFixed(2)} 走到 y=${r.peak.toFixed(2)}（阶顶 ${r.topY.toFixed(2)}），前进 ${(r.x - r.startX).toFixed(1)} m`);
}

// --- 4b. AI 也吃碰撞了：不在墙里、也没被墙卡死 ------------------------------
// 换引擎之前 AI 完全没有碰撞（直接改 position），人从墙里穿过去是常态。
// 但反过来也有风险：墙真的挡住之后，这座对外不开窗的城可能把人全卡死 ——
// 所以「不穿墙」与「还在动」必须一起断言，缺一条就会掉进另一个坑。
{
  const r = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const before = T.ai.soldiers.filter((s) => s.alive).map((s) => ({ id: s.id, x: s.position.x, z: s.position.z }));
    for (let i = 0; i < 20 * 60; i += 1) T.StepFrames(1);
    const alive = T.ai.soldiers.filter((s) => s.alive);
    let inside = 0, bodies = 0;
    for (const s of alive) {
      if (s.body) bodies += 1;
      const cap = s.stance === 2 ? [0.42, 0.58] : s.stance === 1 ? [0.34, 1.21] : [0.34, 1.78];
      if (T.physics.Overlaps(s.position.x, s.position.y, s.position.z, cap[0], cap[1])) inside += 1;
    }
    const byId = new Map(before.map((b) => [b.id, b]));
    const moves = alive.filter((s) => byId.has(s.id))
      .map((s) => Math.hypot(s.position.x - byId.get(s.id).x, s.position.z - byId.get(s.id).z))
      .sort((a, b) => a - b);
    const median = moves.length ? moves[Math.floor(moves.length / 2)] : 0;
    const movedAtAll = moves.filter((m) => m > 1.0).length;
    return { alive: alive.length, bodies, inside, median, movedAtAll, total: moves.length };
  });
  Check("AI 都挂上了胶囊", r.bodies === r.alive, `${r.bodies}/${r.alive}`);
  Check("AI 不站在墙里", r.inside <= Math.max(1, r.alive * 0.05),
    `${r.inside}/${r.alive} 人与实体重叠`);
  Check("AI 没被墙卡死（20 s 后还在推进）", r.movedAtAll >= r.total * 0.5,
    `走过 1 m 以上的 ${r.movedAtAll}/${r.total} 人，位移中位数 ${r.median.toFixed(1)} m`);
}

// --- 4c. 帧耗：几十具胶囊 + 几千个静态盒不能把帧率吃掉 ----------------------
{
  const ms = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.StepFrames(30);
    const t0 = performance.now();
    T.StepFrames(120);
    return (performance.now() - t0) / 120;
  });
  Check("单帧耗时还在预算内", ms < 26, `${ms.toFixed(2)} ms/帧（含渲染）`);
}

// --- 4d. 脚部 IK：踝关节落在真实地面上，不是落在"平地假设"上 ---------------
// 取证方式：直接读每个人两只脚踝的**世界坐标**，与那一点朝下探到的地面比。
// 差值应该恰好是一只鞋的高度（ankleY），而不是随地形起伏乱飘。
{
  const r = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    // 可见性由 CullActors 按视锥判断，出图机位下样本仍可能只剩一两个 ——
    // 样本太薄会让这条断言时灵时不灵。这里把离玩家最近的一批强制显示，
    // 再跑几帧让脚部 IK 收敛（它是按 14/s 平滑过去的，一帧到不了位）。
    const near = T.ai.soldiers.filter((s) => s.alive && s.actor)
      .sort((a, b) => a.position.distanceTo(T.player.position) - b.position.distanceTo(T.player.position))
      .slice(0, 10);
    for (const s of near) T.ai._SetDetailedAttached(s.actor, true);
    for (let i = 0; i < 40; i += 1) {
      for (const s of near) T.ai._SetDetailedAttached(s.actor, true);
      T.StepFrames(1);
    }
    for (const s of near) T.ai._SetDetailedAttached(s.actor, true);
    const v = new (Object.getPrototypeOf(T.player.position).constructor)();
    const rows = [];
    const why = { total: 0, dead: 0, noActor: 0, hidden: 0, prone: 0, ok: 0 };
    const Sample = () => {
      for (const s of T.ai.soldiers) {
        why.total += 1;
        if (!s.alive) { why.dead += 1; continue; }
        if (!s.actor) { why.noActor += 1; continue; }
        if (!s.actor.root.visible) { why.hidden += 1; continue; }
        if (s.stance === 2) { why.prone += 1; continue; }   // 趴着的人不做脚贴地
        why.ok += 1;
        const a = s.actor;
        a.root.updateWorldMatrix(true, true);
        for (const tag of ["L", "R"]) {
          const ankle = a.legs[tag].ankle;
          v.setFromMatrixPosition(ankle.matrixWorld);
          const g = T.Debug.Probe(v.x, v.z, s.position.y);
          rows.push({ err: v.y - g.y, moving: s.moveSpeed > 0.05 });
        }
      }
    };
    // 「站着的人」取决于采样那一瞬有几个人恰好站定 —— 城图重排后 AI 走动更多，
    // 单瞬采样会薄到 n<4（批次B 集成时抓到 n=2 的假红）。多采几个瞬间累积到够。
    Sample();
    for (let round = 0; round < 6 && rows.filter((q) => !q.moving).length < 4; round += 1) {
      for (let i = 0; i < 24; i += 1) {
        for (const s of near) T.ai._SetDetailedAttached(s.actor, true);
        T.StepFrames(1);
      }
      Sample();
    }
    const still = rows.filter((q) => !q.moving).map((q) => q.err);
    const all = rows.map((q) => q.err);
    const stat = (xs) => {
      if (!xs.length) return null;
      const sorted = [...xs].sort((a, b) => a - b);
      return { n: xs.length, med: sorted[Math.floor(sorted.length / 2)], min: sorted[0], max: sorted[sorted.length - 1] };
    };
    return { still: stat(still), all: stat(all), why };
  });
  const st = r.still || r.all;
  // 踝关节应当稳定地高出地面一只鞋的高度（约 0.06—0.16 m），
  // 而且**不许有脚埋进地里**（负值）。
  Check("脚踝落在真实地面之上（站着的人）",
    st && st.n >= 4 && st.min > -0.06 && st.med > 0.02 && st.med < 0.30,
st ? `n=${st.n} 中位=${st.med.toFixed(3)} m 最低=${st.min.toFixed(3)} 最高=${st.max.toFixed(3)}` : "没取到样本");
  Check("走动中的脚也没穿进地里",
    r.all && r.all.min > -0.14,
    r.all ? `n=${r.all.n} 最低=${r.all.min.toFixed(3)} m` : "");
}

// --- 4e. 脚部 IK 真的在"适应"：跨在台阶沿上时两只脚不一样高 ----------------
// 上一条只证明平地上脚不埋进土里。这一条才是 IK 的本分。
//
// 用一具**自己造的 Actor**，不借战场上的兵：AI 每帧都在推进，钉不住 ——
// 上一版就是这么被"人已经走下台子了"骗过去的（量到的是平地上的两只脚）。
// 台子也临时摆一块（AddSolid），量完就拆，断言与场景内容无关。
{
  const r = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const p = T.player;
    const spot = T.physics.FindFreeSpot(p.position.x + 8, p.position.z + 8, 0.6, 1.9, 24);
    const RISE = 0.3;
    const g0 = T.battlefield.GroundHeight(spot.x, spot.z);
    // 台子占 x ∈ [spot.x-2, spot.x]，人正好站在 +x 那条边上
    const handle = T.physics.AddSolid({
      c: [spot.x - 1.0, g0 + RISE / 2, spot.z], h: [1.0, RISE / 2, 1.2], ry: 0, tag: "testStep",
      min: [spot.x - 2.0, g0, spot.z - 1.2], max: [spot.x, g0 + RISE, spot.z + 1.2],
    });
    T.StepFrames(2);

    const actor = T.actorFactory.Create("nra", { seed: 4242, weapon: "HanYang" });
    T.scene.add(actor.root);
    actor.root.position.set(spot.x - 0.02, g0 + RISE, spot.z);
    actor.root.rotation.y = 0;                     // 面朝 -Z，两只脚沿 ±X 分开
    actor.root.visible = true;
    for (let i = 0; i < 90; i += 1) {
      actor.Update(1 / 60, { moveSpeed: 0, aim: 0, crouch: 0, prone: 0, firing: false, elapsed: i / 60, lookYaw: 0, lookPitch: 0 });
    }
    actor.root.updateWorldMatrix(true, true);
    const v = new (Object.getPrototypeOf(p.position).constructor)();
    const out = {};
    for (const tag of ["L", "R"]) {
      v.setFromMatrixPosition(actor.legs[tag].ankle.matrixWorld);
      const g = T.physics.GroundProbe(v.x, v.z, actor.root.position.y, 0.6, 2.4);
      out[tag] = { y: v.y, x: v.x, ground: g.y, above: v.y - g.y, tag: g.tag };
    }
    // 对照组：把台子拆掉再解一次，两只脚应当回到同一高度
    T.scene.remove(actor.root);
    actor.Dispose();
    T.physics.RemoveSolid(handle);
    T.StepFrames(2);
    return { rise: RISE, out };
  });
  const L = r.out.L, R = r.out.R;
  const onStep = L.x < R.x ? L : R;               // -x 那只脚在台面上
  const offStep = L.x < R.x ? R : L;
  const drop = onStep.ground - offStep.ground;    // 台面比台外高多少
  Check("跨台阶时两只脚各贴各的面",
    drop > 0.2 && onStep.above > 0.02 && onStep.above < 0.16
      && offStep.above > 0.02 && offStep.above < 0.16,
    `台面高 ${drop.toFixed(2)} m｜台上那只脚踝高出台面 ${onStep.above.toFixed(3)} m(${onStep.tag})，`
    + `台外那只高出地面 ${offStep.above.toFixed(3)} m(${offStep.tag})，两踝高差 ${Math.abs(L.y - R.y).toFixed(3)} m`);
}

// --- 4f. 尸体会掉下来：在高处中弹的人不再悬在半空 --------------------------
// 死人不再走 Act，也就不再问脚下有没有东西 —— 换引擎之前他会钉死在断气那一帧的
// 坐标上。把人摆到一块 3 m 高的临时平台边上打死，尸体应当落到平台下面的地上。
{
  const r = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const p = T.player;
    const s = T.ai.soldiers.find((q) => q.alive && q.actor);
    if (!s) return { skipped: true };
    const spot = T.physics.FindFreeSpot(p.position.x - 10, p.position.z + 4, 0.6, 1.9, 24);
    const g0 = T.battlefield.GroundHeight(spot.x, spot.z);
    const TOP = g0 + 3.0;
    const handle = T.physics.AddSolid({
      c: [spot.x, g0 + 1.5, spot.z], h: [1.5, 1.5, 1.5], ry: 0, tag: "testTower",
      min: [spot.x - 1.5, g0, spot.z - 1.5], max: [spot.x + 1.5, g0 + 3.0, spot.z + 1.5],
    });
    T.StepFrames(2);
    s.body.Teleport(spot.x, TOP, spot.z);
    s.position.set(spot.x, TOP, spot.z);
    T.StepFrames(2);
    const yBefore = s.position.y;
    s.Kill(null);
    T.StepFrames(2);
    // 断气之后把脚下那块台子抽掉：尸体要是真刚体，它会掉下去；
    // 要是还钉在断气那一帧的坐标上（换引擎之前的行为），它会留在半空。
    T.physics.RemoveSolid(handle);
    for (let i = 0; i < 300; i += 1) T.StepFrames(1);
    const after = { x: s.position.x, y: s.position.y, z: s.position.z };
    const groundBelow = T.battlefield.GroundHeight(after.x, after.z);
    return { yBefore, after, groundBelow, top: TOP, g0, hasCorpse: !!s.corpse };
  });
  if (r.skipped) Check("高处中弹的尸体会掉下来", true, "（场上没有活人，跳过）");
  else {
    // 掉下来 = 最终高度贴近"落点脚下的地面"，而不是留在 3 m 的半空
    const rest = r.after.y - r.groundBelow;
    Check("高处中弹的尸体会掉下来",
      r.after.y < r.yBefore - 1.5 && Math.abs(rest) < 0.1,
      `断气时 y=${r.yBefore.toFixed(2)}（台面 ${r.top.toFixed(2)}），停在 y=${r.after.y.toFixed(2)}，`
      + `离脚下地面 ${rest.toFixed(2)} m`);
  }
}

// --- 4g. 尸体不定格在坟尖上：小件方台顶上的尸体会滑到地上 -------------------
// 坟头/街垒的碰撞是「视觉圆包、碰撞方台」：尸体胶囊架在台顶时，人平摊在坟尖
// 高度的空中，四肢戳在空气里（2026-08-27 那张截图）。改法是 StepCorpse 里认出
// 「支撑面是个比人还小的高台」就朝台缘推着滑，滑到地上再落定、贴合地表。
{
  const r = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const p = T.player;
    const s = T.ai.soldiers.find((q) => q.alive && q.actor);
    if (!s) return { skipped: true };
    const spot = T.physics.FindFreeSpot(p.position.x + 8, p.position.z - 6, 0.6, 1.9, 24);
    const g0 = T.battlefield.GroundHeight(spot.x, spot.z);
    // 一座假坟头。物理与战场网格两边都要塞：胶囊靠物理托着，
    // 而 StepCorpse 的采样走 battlefield.StandHeight（读的是战场网格）。
    // 0.8 m 半宽仍包住最远 0.75 m 的五点取样（留 5 cm 余量），能稳定走到
    // “小台面”分支；同时保证滑出约 1.2 m 时，0.3 m 尸体胶囊也真正越过台缘，
    // 而不是中心已出台、胶囊外沿仍搭着，最后把夹具尺寸误判成滑动失败。
    const box = { c: [spot.x, g0 + 0.7, spot.z], h: [0.8, 0.7, 0.8], ry: 0, tag: "testGrave",
      min: [spot.x - 0.8, g0, spot.z - 0.8], max: [spot.x + 0.8, g0 + 1.4, spot.z + 0.8] };
    const handle = T.physics.AddSolid(box);
    const bf = T.battlefield;
    const key = Math.floor(spot.x / bf.gridSize) * 100003 + Math.floor(spot.z / bf.gridSize);
    if (!bf.grid.has(key)) bf.grid.set(key, []);
    bf.grid.get(key).push(box);
    T.StepFrames(2);
    s.body.Teleport(spot.x, g0 + 1.4, spot.z);
    s.position.set(spot.x, g0 + 1.4, spot.z);
    T.StepFrames(2);
    s.Kill(null);
    let maxDroop = 0;
    for (let i = 0; i < 420; i += 1) {
      T.StepFrames(1);
      if (s.actor.ragdollState) maxDroop = Math.max(maxDroop, s.actor.ragdollState.droopArms || 0);
    }
    T.physics.RemoveSolid(handle);
    const cell = bf.grid.get(key); const at = cell.indexOf(box); if (at >= 0) cell.splice(at, 1);
    const ground = bf.GroundHeight(s.position.x, s.position.z);
    return {
      off: Math.hypot(s.position.x - spot.x, s.position.z - spot.z),
      rest: s.position.y - ground, top: g0 + 1.4, maxDroop, settled: s.corpseSettled,
      tiltX: s.actor.root.rotation.x, tiltZ: s.actor.root.rotation.z,
    };
  });
  if (r.skipped) Check("台顶的尸体滑到地上", true, "（场上没有活人，跳过）");
  else {
    Check("台顶的尸体滑到地上并落定",
      r.off > 1.0 && Math.abs(r.rest) < 0.2 && r.settled,
      `滑出 ${r.off.toFixed(2)} m，离地 ${r.rest.toFixed(2)} m（台顶原高 1.4 m），落定=${r.settled}`);
    Check("滑越台缘途中悬空的手脚垂过",
      r.maxDroop > 0.1, `下垂量峰值 ${r.maxDroop.toFixed(2)}`);
    Check("落到平地后躯干放平",
      Math.abs(r.tiltX) < 0.3 && Math.abs(r.tiltZ) < 0.3,
      `tiltX=${r.tiltX.toFixed(2)} tiltZ=${r.tiltZ.toFixed(2)}`);
  }
}

// --- 4h. 对照：平地上的尸体不滑、不歪、不垂 ---------------------------------
// 贴合与滑落只该对「落点不平」起反应。平地上死的人要是也出溜半米、
// 或者躯干带着俯仰，那 4g 修的就不是坟头而是把全场尸体都改了。
{
  const r = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const p = T.player;
    const s = T.ai.soldiers.find((q) => q.alive && q.actor);
    if (!s) return { skipped: true };
    const spot = T.physics.FindFreeSpot(p.position.x - 6, p.position.z - 8, 0.6, 1.9, 24);
    const g0 = T.battlefield.GroundHeight(spot.x, spot.z);
    s.body.Teleport(spot.x, g0, spot.z);
    s.position.set(spot.x, g0, spot.z);
    T.StepFrames(2);
    const x0 = s.position.x, z0 = s.position.z;
    s.Kill(null);
    for (let i = 0; i < 240; i += 1) T.StepFrames(1);
    return {
      drift: Math.hypot(s.position.x - x0, s.position.z - z0),
      tiltX: s.actor.root.rotation.x, tiltZ: s.actor.root.rotation.z,
      droop: (s.actor.ragdollState && s.actor.ragdollState.droopArms) || 0,
      settled: s.corpseSettled,
    };
  });
  if (r.skipped) Check("平地上的尸体不滑不歪", true, "（场上没有活人，跳过）");
  else Check("平地上的尸体不滑不歪",
    r.drift < 0.5 && Math.abs(r.tiltX) < 0.12 && Math.abs(r.tiltZ) < 0.12 && r.droop < 0.15 && r.settled,
    `出溜 ${r.drift.toFixed(2)} m，tiltX=${r.tiltX.toFixed(2)} tiltZ=${r.tiltZ.toFixed(2)}，`
    + `下垂 ${r.droop.toFixed(2)}，落定=${r.settled}`);
}

// --- 5. 手雷是刚体：会撞墙弹回，也会在地上滚 --------------------------------
{
  const r = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const p = T.player;
    // 前面几节让玩家在战场上站了二十多秒，他很可能已经被打死了 ——
    // 而 ReleaseCook 的唯一一道闸就是 player.Alive，死人扔不出弹。
    // 先原地复活再扔，这条断言测的是手雷不是死亡判定。
    p.Spawn(p.position.x, p.position.z, p.yaw);
    T.state.grenades = 4;
    T.StepFrames(4);
    T.combat.ClearProjectiles();
    T.Debug.Throw("Grenade", 1.0);
    const g = T.combat.projectiles[0];
    if (!g) return { thrown: false };
    const start = { x: g.position.x, y: g.position.y, z: g.position.z };
    let landed = null, path = 0, prev = { ...start };
    for (let i = 0; i < 90 && T.combat.projectiles.length; i += 1) {
      T.StepFrames(1);
      if (!g.alive && landed === null) break;
      const q = g.position;
      path += Math.hypot(q.x - prev.x, q.y - prev.y, q.z - prev.z);
      prev = { x: q.x, y: q.y, z: q.z };
      const ground = T.battlefield.GroundHeight(q.x, q.z);
      if (landed === null && q.y - ground < 0.12) landed = { ...prev };
      // 不许穿到地面以下
      if (q.y < ground - 0.3) return { sank: true, y: q.y, ground };
    }
    return { thrown: true, path, landed, dist: Math.hypot(prev.x - start.x, prev.z - start.z) };
  });
  Check("手雷飞出去且不陷进地里", r.thrown && !r.sank && r.dist > 3,
    r.thrown ? `飞了 ${r.dist.toFixed(1)} m，轨迹长 ${r.path.toFixed(1)} m` : "没扔出去（玩家活着吗？）");
}

// --- 6. 换关之后物理世界跟着换（旧世界不许留着）-----------------------------
{
  const r = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const before = T.Debug.Physics();
    await T.JumpToPhase(2);
    T.StepFrames(30);
    const after = T.Debug.Physics();
    return { before, after };
  });
  Check("换关重建物理世界",
    r.after && r.after.solids > 500 && r.after.solids === r.after.solids
      && r.after.solids !== r.before.solids && r.after.playerBody,
    `L5 ${r.before?.solids} 个碰撞体 -> L2 ${r.after?.solids} 个`);
  Check("换关之后碰撞盒仍然一条不落", r.after && r.after.solids >= r.after.fieldColliders * 0.99,
    r.after ? `${r.after.solids} / ${r.after.fieldColliders}` : "");
}

// --- 7. 下载来的 .glb 布景：落地、且碰撞归属正确 -----------------------------
//
// 这一条是补 2026-08-25 那个洞的。原来 Script_ExternalProps 只把模型摆进场景，
// 既不按模型自己的包围盒落地、也不登记碰撞：手推车悬在 59.6 m 的天上、
// 乡村房屋悬空 7.4 m，而所有人都能从一栋六米四的房子里穿过去。
// 两条都从运行时取证，不读源码：
//   · 每件摆件的可见包围盒底面必须贴着它脚下的地面（容差 0.15 m）；
//   · 普通摆件必须在 field.colliders 里有一只**自己的**盒子（按中心点认领，
//     不能靠"附近有别的盒子"蒙混过去 —— 旁边有院墙是常态）；
//   · Script_World 拼出来的沙袋是例外：每只 GLB 只是整段工事的视觉分件，上层
//     本来就不落地，也不各建一只碎碰撞盒；它们必须由 barricade / sandbagPlug /
//     sandbagEmplacement 的整段盒认领。
//   · PCG 明确标为不阻挡移动的小摆件只验落地；不得给这些装饰补隐形障碍。
{
  const r = await page.evaluate(async () => {
    const THREE = await import("./vendor/three/build/three.module.js?v=1");
    const T = window.Taierzhuang, f = T.battlefield;
    const own = f.externalProps?.colliders || [];
    const box = new THREE.Box3();
    // 2026-08-26 实例化改造后，live 件不再是 externalProps 根下的克隆 Group，
    // 从流送器的取证口拿：克隆件给 Object3D（照旧量包围盒），实例化件给
    // 登记时按「合并几何包围盒 × 摆位矩阵」算好的世界底面 —— 合并时局部变换
    // 烘错了这里照样红。
    const props = f.externalStreamer ? f.externalStreamer.LiveProps() : [];
    const bad = [];
    for (const p of props) {
      let name, x, z, minY, expectedMinY, generatedSandbag, generatedTree,
        requiresOwnCollider;
      if (p.object) {
        box.setFromObject(p.object);
        name = p.object.name; x = p.object.position.x; z = p.object.position.z;
        minY = box.min.y;
        expectedMinY = p.object.userData.expectedMinY;
        generatedSandbag = Boolean(p.object.userData.generatedSandbag);
        generatedTree = Boolean(p.object.userData.generatedTree);
        requiresOwnCollider = p.object.userData.requiresOwnCollider !== false;
      } else {
        name = p.name; x = p.x; z = p.z; minY = p.minY;
        expectedMinY = p.y;
        generatedSandbag = Boolean(p.generatedSandbag);
        generatedTree = Boolean(p.generatedTree);
        requiresOwnCollider = p.requiresOwnCollider !== false;
      }
      const ground = f.GroundHeight(x, z);
      const lift = minY - (generatedSandbag ? expectedMinY : ground);
      // 认领：中心点落在这只盒子的水平投影里、且高度重合
      const mine = own.find((b) => Math.abs(b.c[0] - x) < 2.5
        && Math.abs(b.c[2] - z) < 2.5 && f.colliders.includes(b));
      const aggregate = generatedSandbag && f.colliders.find((b) => (
        ["barricade", "sandbagPlug", "sandbagEmplacement"].includes(b.tag)
        && x >= b.min[0] - 0.8 && x <= b.max[0] + 0.8
        && z >= b.min[2] - 0.8 && z <= b.max[2] + 0.8
      ));
      // 生成树保留的是 AddTree 的细树干盒，不把整片树冠的 GLB 包围盒变成
      // 隐形墙；它和组合沙袋一样由生成器拥有碰撞，只是认领范围仍按树心。
      const generatedTreeTrunk = generatedTree && f.colliders.find((b) => (
        b.tag === "prop" && Math.abs(b.c[0] - x) < 0.05 && Math.abs(b.c[2] - z) < 0.05
        && (b.max[0] - b.min[0]) < 1.5 && (b.max[2] - b.min[2]) < 1.5
      ));
      // PCG clutter explicitly opts out of collision. Aggregated sandbags and
      // tree trunks still have to prove their generator-owned collision.
      const claimed = generatedTree ? generatedTreeTrunk
        : generatedSandbag ? aggregate : requiresOwnCollider ? mine : true;
      if (Math.abs(lift) > 0.15 || !claimed) {
        bad.push(`${name} ${generatedSandbag ? "层位" : "离地"}${lift.toFixed(2)}m`
          + `${claimed ? "" : (generatedSandbag ? " 无整段碰撞" : " 无碰撞体")}`);
      }
    }
    return { n: props.length, own: own.length, bad };
  });
  Check("下载布景逐件落地；组合沙袋层位正确且由整段工事碰撞认领",
    r.n > 0 && r.bad.length === 0,
    `${r.n} 件摆件 / ${r.own} 只盒子${r.bad.length ? "；出问题的：" + r.bad.join("、") : ""}`);
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
if (problems.length) {
  console.log(`\n运行时报错 ${problems.length} 条：`);
  for (const p of problems.slice(0, 10)) console.log("  " + p);
}
if (failed.length || problems.length) {
  console.log(`\n物理冒烟没过：${failed.length} 条断言 + ${problems.length} 条报错`);
  process.exit(1);
}
console.log("\n物理冒烟全过。");
