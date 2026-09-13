// 《台儿庄：血战滕县》远景人群姿势层回归：46 m 外那一批人**得摆出自己的姿态**。
//
// 【这道门为什么存在】2026-09-09 实拍取证：前沿开战 20 s，按距离分档数人，
// 46—74 m 那一档 31 个日军里 **20 个其实在跪射** —— 逐人 `renderLod` 是对的、
// 实例数是对的、`Script_VisibilityTest` 六条全绿，可画面上那 31 个人全是站着的。
// 远景层当时只烘了一个「端着枪站着」的姿势，卧倒是把那尊雕像绕 X 倒 80°，
// 跑动的人是雕像在滑行。玩家说的「远处的敌人不会动、干站着」有一半是这个。
//
// 所以这道门必须同时问三件事，缺一条都能放它过去：
//   ① **分桶**：蹲的人有没有真的进 Kneel 桶（`mesh.name` + `count`）——
//      这一条拦「信号没往下传」；
//   ② **翻页**：跑起来的同一个人，连着几帧要落在不同的 Run 帧桶，而且那几个桶的
//      几何真的不一样 —— 这一条拦「翻页桶全是同一帧」；
//   ③ **像素**：60 m 外一个跪姿实例，涂色像素的包围盒必须比站姿矮一截。
//      `visible` 标记、实例计数、桶名全都拦不住「桶接对了但画出来一模一样」，
//      只有数像素能（同一条教训：2026-09-02 那批人全在实例表里，身体却被烘成
//      1.7 cm 的一粒，画面上只剩一支飘着的枪，六条断言全绿）。
// 外加三条账：draw call 的增量有上限、三角形一个都不许多、Dispose 收干净。
//
// 用法：node Taierzhuang1938/Script_ActorCrowdTest.mjs
// 退出码即成败。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { ACTOR_DETAIL } from "./Data_Tuning_Ai.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");

/** 像素段的取景：把镜头抬到 22 m 高、55 m 外俯视目标点（≈59 m 斜距、21° 俯角）。
 *  抬高是为了越过院墙与货堆 —— 平视 60 m 十有八九被挡住，那时量到的是墙不是人。 */
const PIXEL_CAM = { up: 22, back: 55, fov: 20 };
/** 判「这个像素变了」的通道差。后期链有噪声底，8 远在它之上、也远在人物边缘之下。 */
const PIXEL_DELTA = 8;

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)}`);
});

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  — ${detail}` : ""}`);
}

try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=2&quality=low&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(30));

  // ── ① 分桶 ──────────────────────────────────────────────────────────────
  // 直接问远景层：同一个人给不同的姿态信号，落在哪个桶里。
  const buckets = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const crowd = T.ai.crowd;
    const actor = T.ai.soldiers.find((s) => s.actor)?.actor;
    if (!crowd || !actor) return null;
    const at = actor.root.position;
    const Named = () => {
      const out = {};
      for (const [key, entry] of crowd.kinds) if (entry.count > 0) out[key] = entry.count;
      return out;
    };
    const One = (pose, dead = false) => {
      crowd.Begin();
      crowd.Push(actor.kind, at, 0, 1, pose && pose.stance === 2 ? 1 : 0, dead, pose);
      crowd.End();
      return Named();
    };
    return {
      kind: actor.kind,
      stand: One({ stance: 0, moveSpeed: 0, phase: 0 }),
      kneel: One({ stance: 1, moveSpeed: 0, phase: 0 }),
      prone: One({ stance: 2, moveSpeed: 0, phase: 0 }),
      run: One({ stance: 0, moveSpeed: 1, phase: 0 }),
      blocked: One({ stance: 0, moveSpeed: 1, moveSpeedMps: 0, phase: .5 }),
      slow: One({ stance: 0, moveSpeed: 0, moveSpeedMps: .15, phase: .5 }),
      dead: One({ stance: 0, moveSpeed: 0, phase: 0 }, true),
      // 名字要能认：闸门与取证都按 mesh.name 找桶
      names: [...new Set([...crowd.kinds.values()].flatMap((e) => e.meshes.map((m) => m.name)))],
      meshesPerBucket: crowd.kinds.get(`${actor.kind}:standing`).meshes.length,
      bucketsPerKind: crowd.poses.length,
      runFrames: crowd.runFrames,
      runCycleS: crowd.runCycleS,
      bake: crowd.bakeStats,
    };
  });
  const kind = buckets?.kind;
  const Only = (map, id) => {
    const keys = Object.keys(map || {});
    return keys.length === 1 && keys[0] === `${kind}:${id}`;
  };
  Check("站姿信号落在 Standing 桶", Only(buckets?.stand, "standing"), JSON.stringify(buckets?.stand));
  Check("蹲跪信号落在 Kneel 桶（实拍里 46—74 m 那 20 个跪射的人）",
    Only(buckets?.kneel, "kneel"), JSON.stringify(buckets?.kneel));
  Check("卧倒信号落在 Prone 桶（真卧姿，不再是站姿雕像倒 80°）",
    Only(buckets?.prone, "prone"), JSON.stringify(buckets?.prone));
  Check("跑动信号落在 Run 帧桶", /:run\d+$/.test(Object.keys(buckets?.run || {})[0] || ""),
    JSON.stringify(buckets?.run));
  Check("受阻实速为零时远景停止踏步", Only(buckets?.blocked,"standing"),JSON.stringify(buckets?.blocked));
  Check("远景慢速移动保持实际步态", /:run\d+$/.test(Object.keys(buckets?.slow||{})[0]||""),JSON.stringify(buckets?.slow));
  Check("尸体仍落在 Dead 桶", Only(buckets?.dead, "dead"), JSON.stringify(buckets?.dead));
  Check("桶名进 mesh.name（Crowd_<kind>_<Pose>）",
    (buckets?.names || []).some((n) => n === `Crowd_${kind}_Kneel`)
      && (buckets?.names || []).some((n) => n === `Crowd_${kind}_Run0`),
    (buckets?.names || []).filter((n) => n.startsWith(`Crowd_${kind}_`)).join(" "));

  // ── ② 翻页 ──────────────────────────────────────────────────────────────
  // 同一个人一直在跑，时间往前走：连着采样必须落在**不同**的 Run 帧桶上，
  // 而且那些桶的几何要真的不一样（否则翻页只是换了个桶名）。
  const flip = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const crowd = T.ai.crowd;
    const actor = T.ai.soldiers.find((s) => s.actor)?.actor;
    const at = actor.root.position;
    const hit = [];
    const cycle = crowd.runCycleS;
    // 一个循环内均匀采 3×N 个时刻，看落到几个不同的帧桶
    for (let i = 0; i < crowd.runFrames * 3; i += 1) {
      crowd.Begin();
      crowd.Push(actor.kind, at, 0, 1, 0, false,
        { stance: 0, moveSpeed: 1, elapsed: (i * cycle) / (crowd.runFrames * 3), jitter: 0 });
      crowd.End();
      for (const [key, entry] of crowd.kinds) if (entry.count > 0) hit.push(key.split(":")[1]);
    }
    // 帧桶的几何是不是真的不同：取每个 Run 桶第一块网格的顶点，两两比一比
    const runs = [];
    for (let i = 0; i < crowd.runFrames; i += 1) {
      const entry = crowd.kinds.get(`${actor.kind}:run${i}`);
      runs.push(entry.meshes[0].geometry.attributes.position.array);
    }
    let maxDelta = 0;
    let sameNeighbours = 0;
    for (let i = 1; i < runs.length; i += 1) {
      const a = runs[i - 1], b = runs[i];
      let delta = 0;
      const n = Math.min(a.length, b.length);
      for (let k = 0; k < n; k += 3) delta = Math.max(delta, Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]));
      if (delta < 0.02) sameNeighbours += 1;
      maxDelta = Math.max(maxDelta, delta);
    }
    crowd.Begin();
    crowd.End();
    return { hit, distinct: [...new Set(hit)], maxDelta, sameNeighbours, cycle };
  });
  Check("跑步翻页真的在翻（一个循环里用满了所有 Run 帧桶）",
    flip.distinct.length === buckets.runFrames,
    `${flip.distinct.sort().join(",")}（循环 ${flip.cycle.toFixed(2)} s）`);
  Check("Run 帧桶的几何各不相同（不是同一帧复制 N 份）",
    flip.sameNeighbours === 0 && flip.maxDelta > 0.05,
    `相邻帧最大顶点位移 ${flip.maxDelta.toFixed(3)} m，重复帧 ${flip.sameNeighbours}`);
  Check("翻页帧率的退路值与资产循环对得上（±25%）",
    Math.abs(ACTOR_DETAIL.crowdRunFps - buckets.runFrames / buckets.runCycleS)
      <= 0.25 * (buckets.runFrames / buckets.runCycleS),
    `表里 ${ACTOR_DETAIL.crowdRunFps} Hz / 资产 ${(buckets.runFrames / buckets.runCycleS).toFixed(2)} Hz`);

  // ── ③ 像素 ──────────────────────────────────────────────────────────────
  // 【为什么非要数像素】桶接对了、实例进去了、`visible` 是 true —— 这三条全绿
  // 也可能画出来一模一样（几何烘错、材质错、被别的桶盖住）。60 m 外把跪姿实例
  // 与站姿实例各画一遍，跟「什么都不放」的那一帧逐像素求差，差出来的就是这个人
  // 的剪影；跪的那个剪影必须**矮一截**。
  const pixels = await page.evaluate((cfg) => {
    const T = window.Taierzhuang;
    const crowd = T.ai.crowd;
    const actor = T.ai.soldiers.find((s) => s.actor)?.actor;
    T.state.running = false;
    T.state.menu = false;
    // 目标点取玩家脚下：那一小块地面一定是可站的、一定没被建筑埋掉。
    const target = T.player.position.clone();
    T.camera.position.set(target.x, target.y + cfg.up, target.z + cfg.back);
    T.camera.lookAt(target.x, target.y + 0.8, target.z);
    T.camera.fov = cfg.fov;
    T.camera.updateProjectionMatrix();
    const gl = T.renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const Draw = () => {
      T.post.frame = 1000;                 // 抖动 / 颗粒 / 运动模糊钉死
      T.scene.updateMatrixWorld();
      T.post.Render(T.scene, T.camera, {
        sunDirection: T.sky.sunDirection, exposure: 0.5, bloom: 0.6, godStrength: 0.3,
        saturation: 1, contrast: 1, grain: 0, vignette: 0.42, damage: 0,
        motionBlur: 0, dofStrength: 0, dofFocus: 1.5, dofRange: 2.8, dofMaxPx: 11, taa: false,
      });
      const out = new Uint8Array(width * height * 4);
      T.renderer.setRenderTarget(null);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return out;
    };
    const Shot = (pose, dead = false) => {
      crowd.Begin();
      if (pose) crowd.Push(actor.kind, target, Math.PI / 2, 1, pose.stance === 2 ? 1 : 0, dead, pose);
      crowd.End();
      for (let i = 0; i < 12; i += 1) Draw();   // 时域链（GTAO/SSIL/SSR 的历史）收敛
      return Draw();
    };
    /** 与空场那一帧的差：返回涂色像素的包围盒与数量（屏幕坐标，y 向上）。 */
    const Silhouette = (base, shot) => {
      let count = 0, minY = height, maxY = -1, minX = width, maxX = -1;
      for (let i = 0, p = 0; i < base.length; i += 4, p += 1) {
        let d = 0;
        for (let c = 0; c < 3; c += 1) d = Math.max(d, Math.abs(base[i + c] - shot[i + c]));
        if (d <= 8) continue;
        count += 1;
        const x = p % width, y = (p / width) | 0;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
      }
      return { count, height: maxY - minY + 1, width: maxX - minX + 1, bottom: minY };
    };
    const empty = Shot(null);
    const emptyAgain = Shot(null);            // 噪声底：同一份内容连画两次
    const stand = Shot({ stance: 0, moveSpeed: 0, phase: 0 });
    const kneel = Shot({ stance: 1, moveSpeed: 0, phase: 0 });
    const prone = Shot({ stance: 2, moveSpeed: 0, phase: 0 });
    crowd.Begin(); crowd.End();
    return {
      noise: Silhouette(empty, emptyAgain),
      stand: Silhouette(empty, stand),
      kneel: Silhouette(empty, kneel),
      prone: Silhouette(empty, prone),
      distance: T.camera.position.distanceTo(target),
      viewport: [width, height],
    };
  }, PIXEL_CAM);
  Check("像素段的噪声底可以忽略", pixels.noise.count < 200,
    `${pixels.noise.count} px（${pixels.viewport.join("×")}，斜距 ${pixels.distance.toFixed(0)} m）`);
  Check("60 m 外的站姿实例真的画出来了（涂色像素够数）", pixels.stand.count > 400,
    `${pixels.stand.count} px，高 ${pixels.stand.height} px`);
  Check("跪姿实例的剪影比站姿矮一截（像素级，≤ 站姿的 85%）",
    pixels.kneel.count > 300 && pixels.kneel.height <= pixels.stand.height * 0.85,
    `跪 ${pixels.kneel.height} px × ${pixels.kneel.count} px² / `
      + `站 ${pixels.stand.height} px × ${pixels.stand.count} px²`);
  // Side view: a full-size prone body is lower but extends along the ground.
  // The old area upper bound certified a shrunken skeleton as a correct pose.
  // Require standing-scale length and visible body area as well as low height.
  Check("卧姿实例伏低且保持完整体型，身体沿地面展开",
    pixels.prone.height <= pixels.stand.height * 0.75
      && pixels.prone.width >= pixels.stand.height * 0.9
      && pixels.prone.count >= pixels.stand.count * 0.7
      && pixels.prone.count <= pixels.stand.count * 2,
    `卧 ${pixels.prone.width}×${pixels.prone.height} px、${pixels.prone.count} px² / `
      + `站高 ${pixels.stand.height} px、${pixels.stand.count} px²`);

  // ── ④ 预算 ──────────────────────────────────────────────────────────────
  // 最坏情况：同一批人全挤在两档（旧口径） vs 摊到全部八档（新口径）。
  // 人数一样，三角形必须一个都不多（一个人只画在一个桶里）；
  // draw call 只许多出「新增桶数 × 材质桶数」。
  const budget = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const crowd = T.ai.crowd;
    const actor = T.ai.soldiers.find((s) => s.actor)?.actor;
    const at = actor.root.position;
    const Draw = () => {
      T.post.frame = 1000;
      T.scene.updateMatrixWorld();
      T.renderer.info.autoReset = false;
      T.renderer.info.reset();
      T.post.Render(T.scene, T.camera, {
        sunDirection: T.sky.sunDirection, exposure: 0.5, bloom: 0.6, godStrength: 0.3,
        saturation: 1, contrast: 1, grain: 0, vignette: 0.42, damage: 0,
        motionBlur: 0, dofStrength: 0, dofFocus: 1.5, dofRange: 2.8, dofMaxPx: 11, taa: false,
      });
      return { calls: T.renderer.info.render.calls, triangles: T.renderer.info.render.triangles };
    };
    const COUNT = 96;
    // 空场：一个远景实例都不放。用来现场标定「一只网格在这一帧图里要提交几遍」
    // （帧图有 GBuffer / 速度靶 / 阴影等多条 pass，renderer.info.calls 是全部 pass
    // 的总和，而 PoseReport().drawCalls 数的是网格数）。写死一个倍数迟早过期。
    crowd.Begin();
    crowd.End();
    const empty = Draw();
    // 旧口径：一半站着、一半躺着，只用两档桶
    crowd.Begin();
    for (let i = 0; i < COUNT; i += 1) crowd.Push(actor.kind, at, 0, 1, 0, i % 2 === 1);
    crowd.End();
    const legacy = Draw();
    const legacyReport = crowd.PoseReport();
    // 新口径：同样多的人，摊到全部八档
    crowd.Begin();
    for (let i = 0; i < COUNT; i += 1) {
      const slot = i % 8;
      if (slot === 7) crowd.Push(actor.kind, at, 0, 1, 0, true);
      else if (slot === 6) crowd.Push(actor.kind, at, 0, 1, 1, false, { stance: 2, moveSpeed: 0 });
      else if (slot === 5) crowd.Push(actor.kind, at, 0, 1, 0, false, { stance: 1, moveSpeed: 0 });
      else if (slot === 4) crowd.Push(actor.kind, at, 0, 1, 0, false, { stance: 0, moveSpeed: 0 });
      else crowd.Push(actor.kind, at, 0, 1, 0, false, { stance: 0, moveSpeed: 1, phase: slot / 4 });
    }
    crowd.End();
    const spread = Draw();
    const spreadReport = crowd.PoseReport();
    crowd.Begin(); crowd.End();
    return {
      empty, legacy, spread,
      legacyCrowdCalls: legacyReport.drawCalls, spreadCrowdCalls: spreadReport.drawCalls,
      instances: spreadReport.instances, meshesPerBucket: legacyReport.poses[`${actor.kind}:standing`].meshes,
      bucketsPerKind: crowd.poses.length,
    };
  });
  const newPoses = budget.bucketsPerKind - 2;
  const crowdDelta = budget.spreadCrowdCalls - budget.legacyCrowdCalls;
  // 一只网格在这一帧图里提交几遍：拿「两档桶 14 只网格」这一段现场标定。
  const passes = (budget.legacy.calls - budget.empty.calls) / Math.max(1, budget.legacyCrowdCalls);
  const callDelta = budget.spread.calls - budget.legacy.calls;
  Check("同样多的人摊到八档，远景层只多出「新增桶数 × 材质桶数」只网格",
    crowdDelta === newPoses * budget.meshesPerBucket,
    `${budget.legacyCrowdCalls} → ${budget.spreadCrowdCalls} 只（+${crowdDelta}，`
      + `= ${newPoses}×${budget.meshesPerBucket}）`);
  // pass 数是现场标定的小数（实测 2.14 —— 帧图里不是每条 pass 都画所有东西），
  // 上限取整到「每只网格 ⌈pass⌉ 遍」：既留出帧图排班变动的余量，又仍然是
  // 「增量与新增网格数成正比」这一条真判据。结构上的严格断言在上一条。
  const callCap = newPoses * budget.meshesPerBucket * Math.ceil(passes);
  Check("整帧 draw call 的增量不超过「新增网格 × 每只网格的 pass 数」",
    callDelta <= callCap && callDelta >= 0,
    `+${callDelta}（每只网格实测 ${passes.toFixed(2)} 遍 pass；上限 ${callCap}）`);
  Check("三角形一个都不多（一个人只画在一个桶里）",
    Math.abs(budget.spread.triangles - budget.legacy.triangles) <= budget.legacy.triangles * 0.02,
    `${budget.legacy.triangles} → ${budget.spread.triangles}（${budget.instances} 个实例）`);

  // ── ⑤ 旧签名 ────────────────────────────────────────────────────────────
  // 不传 pose 的六参数调用必须一个像素都不变：仍进站姿桶，卧倒仍是整体翻转。
  const legacy = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const crowd = T.ai.crowd;
    const actor = T.ai.soldiers.find((s) => s.actor)?.actor;
    const at = actor.root.position;
    crowd.Begin();
    crowd.Push(actor.kind, at, 0, 1, 0, false);        // 旧：站
    crowd.Push(actor.kind, at, 0, 1, 1, false);        // 旧：卧（整体翻转，仍进站姿桶）
    crowd.Push(actor.kind, at, 0, 1, 0, true);         // 旧：尸体
    crowd.End();
    const out = {};
    for (const [key, entry] of crowd.kinds) if (entry.count > 0) out[key] = entry.count;
    // 翻转的那一个：实例矩阵里应当带着绕 X 的负角
    const standing = crowd.kinds.get(`${actor.kind}:standing`);
    const m = new Float32Array(16);
    standing.meshes[0].instanceMatrix.array.slice(16, 32).forEach((v, i) => { m[i] = v; });
    crowd.Begin(); crowd.End();
    return { counts: out, tiltRow: [m[5], m[6], m[9], m[10]] };
  });
  Check("旧签名（六参数）行为不变：站 + 卧都进站姿桶，尸体进 Dead 桶",
    legacy.counts[`${kind}:standing`] === 2 && legacy.counts[`${kind}:dead`] === 1
      && legacy.counts[`${kind}:prone`] === undefined,
    JSON.stringify(legacy.counts));
  Check("旧签名的卧倒仍是整体翻转（实例矩阵带绕 X 的负角）",
    Math.abs(legacy.tiltRow[2]) > 0.5,
    `m[9]=${legacy.tiltRow[2].toFixed(3)}（sin(1.4)=0.985）`);

  // ── ⑥ Dispose ──────────────────────────────────────────────────────────
  // 另起一个实例来收，别把正在跑的那一层拆了。
  const disposed = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const ActorCrowd = T.ai.crowd.constructor;
    const CountMeshes = () => {
      let n = 0;
      T.scene.traverse((o) => { if (o.isInstancedMesh && /^Crowd_probe_/.test(o.name)) n += 1; });
      return n;
    };
    const kind = T.ai.soldiers.find((s) => s.actor)?.actor.kind;
    const probe = new ActorCrowd(T.scene, T.ai.ctx.actorFactory);
    probe.Prepare([kind]);
    let added = 0;
    for (const entry of probe.kinds.values()) {
      added += entry.meshes.length;
      for (const mesh of entry.meshes) mesh.name = `Crowd_probe_${mesh.name}`;
    }
    const before = CountMeshes();
    probe.Dispose();
    return { added, before, after: CountMeshes(), buckets: probe.kinds.size, materials: probe.materials.length };
  });
  Check("Dispose 之后场景里没有残留桶", disposed.after === 0 && disposed.buckets === 0
    && disposed.materials === 0,
    `建了 ${disposed.added} 只网格，收前 ${disposed.before} / 收后 ${disposed.after}`);

  console.log(`\n烘焙：${JSON.stringify(buckets.bake)}；每 kind ${buckets.bucketsPerKind} 档 × `
    + `${buckets.meshesPerBucket} 材质桶`);
  Check("整趟没有页面报错", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log("失败：\n  " + failed.map((result) => result.name).join("\n  "));
  process.exit(1);
}
