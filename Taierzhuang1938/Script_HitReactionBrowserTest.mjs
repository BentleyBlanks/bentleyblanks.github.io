// 受击物理反应的真引擎验收（真实 GLB 人物：NRA + IJA；口径 docs/Data_HitReaction.md §4 / §5 / §7）。
//
// 用法：node Taierzhuang1938/Script_HitReactionBrowserTest.mjs [--report] [--require-library]
//   --report           打印每一项实测值（调参 / 写报告用）
//   --require-library  方向死亡断言（16 个方向 × 部位，倒向与期望夹角 ≤ 45°）在动作库缺失时也强制；
//                      不加这个开关，库缺失时只断言「退路不断档 + 转向机制正确」，夹角只记录不断言。
//
// 量法：同一个 seed 造两个演员 A / B，逐帧同步推进（动画完全相同），只给 A 一记命中；
// 骨骼世界旋转 / 位置的差就是受击层叠上去的量，换算到演员局部系（+X 右手、−Z 正面）读角度与位移。
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const args = new Set(process.argv.slice(2));
const REPORT = args.has("--report");
const REQUIRE_LIBRARY = args.has("--require-library");
const projectDir = path.dirname(fileURLToPath(import.meta.url));
const server = await ServeRoot(path.resolve(projectDir, ".."), 0);
const browser = await LaunchBrowser();
let page;
try {
  page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?poseTest=1`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.actorFactory, null, { timeout: 300000 });

  const data = await page.evaluate(async (options) => {
    const THREE = await import("/Taierzhuang1938/vendor/three/build/three.module.js");
    const { Actor } = await import("/Taierzhuang1938/Script_Actor.mjs");
    const Layer = await import("/Taierzhuang1938/Script_HitReactionLayer.mjs");
    const factory = window.Taierzhuang.actorFactory;
    const DEG = 180 / Math.PI, DT = 1 / 60, YAW = 0.6;

    const scene = new THREE.Group();
    let serial = 0;
    function Spawn(kind, seed, variant, x = 0, z = 0) {
      const actor = new Actor(factory, kind, { seed, modelVariant: variant, weapon: "HanYang" });
      actor.root.position.set(x, 0, z);
      actor.root.rotation.y = YAW;
      scene.add(actor.root);
      return actor;
    }
    const st = (t, extra = {}) => ({ moveSpeed: 0, aim: 0.7, elapsed: t, grounded: true, lookYaw: 0, lookPitch: 0, ...extra });
    const Pair = (kind, seed, variant, aim = 0.7) => {
      const a = Spawn(kind, seed, variant), b = Spawn(kind, seed, variant, 0, 0);
      // b 放在同一个位置：两人叠在一起无所谓（不渲染），要的是同一个世界系。
      let t = 0;
      const Frame = (extra = {}) => { t += DT; a.Update(DT, st(t, { aim, ...extra })); b.Update(DT, st(t, { aim, ...extra })); scene.updateMatrixWorld(true); };
      for (let i = 0; i < 30; i += 1) Frame();
      return { a, b, Frame, get t() { return t; } };
    };
    const rootQ = (actor) => actor.root.getWorldQuaternion(new THREE.Quaternion());
    const WorldQ = (node) => node.getWorldQuaternion(new THREE.Quaternion());
    const Wrap = (q) => { const r = q.clone(); if (r.w < 0) { r.x = -r.x; r.y = -r.y; r.z = -r.z; r.w = -r.w; } return r; };
    const RotVec = (q) => { // 四元数 → 旋转向量（弧度）
      const r = Wrap(q); const s = Math.hypot(r.x, r.y, r.z); if (s < 1e-9) return new THREE.Vector3();
      const angle = 2 * Math.atan2(s, r.w); return new THREE.Vector3(r.x / s, r.y / s, r.z / s).multiplyScalar(angle);
    };
    const ToLocal = (actor, worldDelta) => {
      const rq = rootQ(actor);
      return RotVec(rq.clone().invert().multiply(worldDelta).multiply(rq)).multiplyScalar(DEG);
    };
    const DeltaWorld = (pair, role) => {
      const qa = WorldQ(pair.a.characterRig.bones[role]), qb = WorldQ(pair.b.characterRig.bones[role]);
      return ToLocal(pair.a, qa.multiply(qb.invert()));
    };
    // 子骨相对父骨的额外旋转：先取子骨局部系里的差 (rel_B⁻¹·rel_A，与父骨怎么转无关)，再按未受击一侧子骨的朝向转到世界、换算到演员系。
    const DeltaRel = (pair, child, parent) => {
      const rel = (actor) => WorldQ(actor.characterRig.bones[parent]).invert().multiply(WorldQ(actor.characterRig.bones[child]));
      const d = rel(pair.b).invert().multiply(rel(pair.a));
      const world = RotVec(d).applyQuaternion(WorldQ(pair.b.characterRig.bones[child]));
      return world.applyQuaternion(rootQ(pair.a).invert()).multiplyScalar(DEG);
    };
    const PelvisDelta = (pair) => {
      const pa = pair.a.characterRig.bones.pelvis.getWorldPosition(new THREE.Vector3());
      const pb = pair.b.characterRig.bones.pelvis.getWorldPosition(new THREE.Vector3());
      return pair.a.root.worldToLocal(pa).sub(pair.a.root.worldToLocal(pb));
    };
    const GunToHand = (actor) => {
      const gun = actor.weaponGroup.getWorldPosition(new THREE.Vector3());
      const hand = actor.characterRig.bones.handR.getWorldPosition(new THREE.Vector3());
      return actor.root.worldToLocal(gun).sub(actor.root.worldToLocal(hand));
    };
    const Vec3 = (v) => [v.x, v.y, v.z];
    const WorldDir = (actor, local) => new THREE.Vector3(...local).normalize().applyQuaternion(rootQ(actor));
    const Descriptor = (actor, o, lethal) => ({
      kind: o.kind || "bullet", part: o.part || "torso", shapeId: o.shapeId || null, point: null, pointExact: false,
      direction: WorldDir(actor, o.dir || [0, 0, 1]), sweep: o.sweep ? WorldDir(actor, o.sweep) : null, blastOrigin: null,
      damage: (o.damage ?? 75) * (o.part === "head" ? 3.2 : o.part === "torso" || !o.part ? 1 : 0.6), rawDamage: o.damage ?? 75,
      weaponId: "HanYang", lethal, seed: actor.seed,
    });

    // ---- 1. 活人受击：同一 seed 双胞胎逐帧对拍 ------------------------------------------------
    const FRAMES = 96;
    async function Case(kind, variant, spec) {
      const pair = Pair(kind, spec.seed ?? 4000 + serial++, variant, spec.aim ?? 0.7);
      const g0 = GunToHand(pair.a);
      const layerBefore = pair.a.characterRig.hitReaction || null;
      const result = pair.a.ReceiveHit(Descriptor(pair.a, spec, false));
      const peak = { chest: new THREE.Vector3(), chestMag: 0, headRel: new THREE.Vector3(), headRelMag: 0, arm: 0, armSide: null, knee: 0,
        pelvisBack: 0, pelvisSink: 0, gunShift: 0, forearm: 0 };
      let settleChest = 0, settleLeg = 0;
      for (let i = 1; i <= FRAMES; i += 1) {
        pair.Frame();
        const time = i * DT;
        const chest = DeltaWorld(pair, "chest"); const cm = chest.length();
        if (cm > peak.chestMag) { peak.chestMag = cm; peak.chest = chest; }
        const headRel = DeltaRel(pair, "head", "chest"); const hm = headRel.length();
        if (hm > peak.headRelMag) { peak.headRelMag = hm; peak.headRel = headRel; }
        for (const side of ["L", "R"]) {
          const arm = DeltaWorld(pair, `upperArm${side}`).length();
          if (arm > peak.arm) { peak.arm = arm; peak.armSide = side; }
          const fa = DeltaRel(pair, `forearm${side}`, `upperArm${side}`).length();
          if (fa > peak.forearm) peak.forearm = fa;
          const kn = DeltaRel(pair, `calf${side}`, `thigh${side}`).length();
          if (kn > peak.knee) peak.knee = kn;
        }
        const pd = PelvisDelta(pair);
        peak.pelvisBack = Math.max(peak.pelvisBack, pd.z);           // +Z = 演员背后
        peak.pelvisSink = Math.max(peak.pelvisSink, -pd.y);
        const gs = GunToHand(pair.a).sub(g0).length();
        peak.gunShift = Math.max(peak.gunShift, gs);
        if (cm > 1 || hm > 1) settleChest = time;
        if (-pd.y > 0.004 || DeltaRel(pair, "calfR", "thighR").length() > 1 || DeltaRel(pair, "calfL", "thighL").length() > 1) settleLeg = time;
      }
      // 全身残留：所有骨头世界旋转与双胞胎的最大差（度）
      let residual = 0;
      pair.a.characterRig.root.traverse((node) => {
        if (!node.isBone) return;
        const other = pair.b.characterRig.root.getObjectByName(node.name);
        if (!other) return;
        residual = Math.max(residual, RotVec(WorldQ(node).multiply(WorldQ(other).invert())).length() * DEG);
      });
      const layer = pair.a.characterRig.hitReaction;
      return {
        kind, spec: spec.name, severity: result?.severity ?? null, zone: result?.zone ?? null, layerCreated: !layerBefore && !!layer,
        chest: Vec3(peak.chest), chestMag: peak.chestMag, headRel: Vec3(peak.headRel), headRelMag: peak.headRelMag,
        arm: peak.arm, armSide: peak.armSide, forearm: peak.forearm, knee: peak.knee,
        pelvisBackCm: peak.pelvisBack * 100, pelvisSinkCm: peak.pelvisSink * 100, gunShiftCm: peak.gunShift * 100,
        settleChestS: settleChest, settleLegS: settleLeg, residualDeg: residual, active: !!layer?.active,
        records: layer?.recordCount ?? null,
      };
    }
    const cases = [
      // seed 相同 = 站姿相同：kind 之间的倍率对比（机枪 / 大刀 ÷ 步枪）要在同一个人身上量。
      { name: "rifleChestFront", part: "torso", shapeId: "upperTorso", dir: [0, 0, 1], seed: 4100 },
      { name: "rifleChestBack", part: "torso", shapeId: "upperTorso", dir: [0, 0, -1] },
      { name: "rifleChestLeft", part: "torso", shapeId: "upperTorso", dir: [1, 0, 0] },
      { name: "rifleLowerFront", part: "torso", shapeId: "lowerTorso", dir: [0, 0, 1] },
      { name: "rifleRightShoulderFront", part: "arm", shapeId: "upperArmR", dir: [0, 0, 1] },
      { name: "rifleLeftShoulderFront", part: "arm", shapeId: "upperArmL", dir: [0, 0, 1] },
      { name: "rifleRightShoulderRelaxed", part: "arm", shapeId: "upperArmR", dir: [0, 0, 1], aim: 0 },
      { name: "rifleRightArmSide", part: "arm", shapeId: "upperArmR", dir: [-1, 0, 0.2], aim: 0 },
      { name: "rifleThighRFront", part: "leg", shapeId: "thighR", dir: [0, 0, 1] },
      { name: "rifleArmFront", part: "arm", shapeId: "forearmR", dir: [0, 0, 1] },
      { name: "hmgChestFront", kind: "hmg", damage: 45, part: "torso", shapeId: "upperTorso", dir: [0, 0, 1], seed: 4100 },
      { name: "bladeChest", kind: "blade", damage: 90, part: "torso", shapeId: "upperTorso", dir: [0, 0, 1], sweep: [-1, 0, 0.15], seed: 4100 },
      { name: "blastChest", kind: "blast", damage: 200, part: "torso", shapeId: "upperTorso", dir: [0, 0, 1], seed: 4100 },
      { name: "aiRifleTorsoNoShape", part: "torso", dir: [0, 0, 1] },
      { name: "aiRifleLegNoShape", part: "leg", dir: [0.6, 0, 0.8] },
    ];
    const live = [];
    for (const [kind, variant] of [["nra", 1], ["ija", 0]]) for (const spec of cases) live.push(await Case(kind, variant, spec));

    // ---- 2. 死亡：16 个方向 × 部位 -----------------------------------------------------------
    await Layer.PreloadDeathLibrary();
    const library = Layer.DeathLibrary();
    async function Death(kind, variant, part, angleDeg, spec = {}) {
      const actor = Spawn(kind, 9000 + serial++, variant);
      let t = 0;
      const Frame = () => { t += DT; actor.Update(DT, st(t)); scene.updateMatrixWorld(true); };
      for (let i = 0; i < 30; i += 1) Frame();
      const pelvis0 = actor.root.worldToLocal(actor.characterRig.bones.pelvis.getWorldPosition(new THREE.Vector3()));
      // 飞行方向（演员局部）：angle 0 = 正面打（朝背后 +Z），逆时针（绕 Y）转。
      const a = angleDeg * Math.PI / 180, dir = [Math.sin(a), 0, Math.cos(a)];
      const o = { part, kind: "bullet", dir, damage: 200, ...spec };
      const hit = Descriptor(actor, o, true);
      const rig = actor.characterRig;
      actor.Ragdoll(hit.direction, hit);
      const duration = actor.ragdollState.duration;
      let maxT = 0, residualAfterFade = 0, recordsAfterFade = 0, layerActiveAfterFade = false;
      const frames = Math.ceil(duration / DT) + 45;
      for (let i = 0; i < frames; i += 1) {
        Frame();
        const rt = actor.ragdollState.t;
        maxT = Math.max(maxT, rt);
        const layer = rig.hitReaction;
        if (layer && rt >= 0.55) { recordsAfterFade = Math.max(recordsAfterFade, layer.recordCount); layerActiveAfterFade ||= layer.active; }
      }
      const head = actor.root.worldToLocal(rig.bones.head.getWorldPosition(new THREE.Vector3()));
      const fallLocal = [head.x - pelvis0.x, head.z - pelvis0.z];
      const fallDeg = Math.atan2(fallLocal[1], fallLocal[0]) * DEG;
      // 蒙皮最低点
      let skinFloor = Infinity;
      rig.root.updateMatrixWorld(true);
      const p = new THREE.Vector3();
      rig.root.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.visible || !mesh.userData.characterPbrSurface) return;
        mesh.skeleton?.update();
        const idx = mesh.geometry.index, n = idx?.count ?? mesh.geometry.attributes.position.count;
        for (let k = 0; k < n; k += 1) { mesh.getVertexPosition(idx ? idx.getX(k) : k, p).applyMatrix4(mesh.matrixWorld); skinFloor = Math.min(skinFloor, p.y); }
      });
      const info = rig.hitReaction?.Describe();
      const out = {
        kind, part, angleDeg, clip: rig.deathVariantId, choice: info?.death ?? null, fallDeg, fallLocal, skinFloor,
        recordsAfterFade, layerActiveAfterFade, maxT, bodyYawDeg: 2 * Math.atan2(actor.body.quaternion.y, actor.body.quaternion.w) * DEG,
      };
      actor.Dispose();
      return out;
    }
    const deaths = [];
    for (const [kind, variant] of [["nra", 1], ["ija", 0]]) {
      for (const part of ["torso", "arm"]) for (let k = 0; k < 16; k += 1) deaths.push(await Death(kind, variant, part, k * 22.5));
      for (let k = 0; k < 16; k += 4) deaths.push(await Death(kind, variant, "leg", k * 22.5 + 11));
    }
    // 特殊：爆头（crumple 抽签）、刺刀捅、大刀、爆炸
    const specials = [];
    for (const [name, spec] of [["headFront", { part: "head", shapeId: "head" }], ["thrustFront", { kind: "thrust", part: "torso", shapeId: "upperTorso", damage: 105 }],
      ["bladeSweepRight", { kind: "blade", part: "torso", shapeId: "upperTorso", damage: 210, sweep: [1, 0, 0] }],
      ["blastBack", { kind: "blast", part: "torso", damage: 400, dir: [0, 0, -1] }]]) {
      specials.push({ name, ...(await Death("nra", 1, spec.part, 0, spec)) });
    }
    // 没有 hit 的 Kill：行为不变（按 seed 抽 A–D，不转向，不加冲量）
    const legacy = [];
    for (const [kind, variant] of [["nra", 1], ["ija", 0]]) {
      const actor = Spawn(kind, 777, variant);
      for (let i = 0; i < 20; i += 1) actor.Update(DT, st(i * DT));
      const before = actor.characterRig.deathVariantId;
      actor.Ragdoll(new THREE.Vector3(0, 0, 1));
      let t = 0;
      for (let i = 0; i < 130; i += 1) { t += DT; actor.Update(DT, st(t)); }
      const bq = actor.body.quaternion;
      legacy.push({ kind, before, after: actor.characterRig.deathVariantId,
        layer: !!actor.characterRig.hitReaction, twistDeg: 2 * Math.atan2(bq.y, bq.w) * DEG });
      actor.Dispose();
    }

    // ---- 3. 复用 / 关闭开关 --------------------------------------------------------------------
    let reset;
    {
      const pair = Pair("nra", 5151, 1);
      pair.a.ReceiveHit(Descriptor(pair.a, cases[0], false));
      for (let i = 0; i < 6; i += 1) pair.Frame();
      const mid = DeltaWorld(pair, "chest").length();
      pair.a.ResetHitReaction();
      pair.Frame();
      reset = { mid, after: DeltaWorld(pair, "chest").length(), active: pair.a.characterRig.hitReaction.active };
    }
    let disabled;
    {
      Layer.SetHitReactionEnabled(false);
      const pair = Pair("nra", 5252, 1);
      const r = pair.a.ReceiveHit(Descriptor(pair.a, cases[0], false));
      pair.a.Update(DT, st(2, { hurt: 0.8 })); pair.b.Update(DT, st(2, { hurt: 0 }));
      scene.updateMatrixWorld(true);
      const hurtDelta = DeltaWorld(pair, "chest").length();
      const d = Death("nra", 1, "torso", 0);
      const death = await d;
      Layer.SetHitReactionEnabled(true);
      disabled = { receive: r, layer: !!pair.a.characterRig.hitReaction, hurtDelta, deathLayer: death.choice, deathClip: death.clip, bodyYawDeg: death.bodyYawDeg };
    }

    // ---- 4. 每帧耗时：30 个同时受击，同页 A/B 交替 -----------------------------------------------
    const perf = { withMs: [], withoutMs: [] };
    {
      const mk = () => Array.from({ length: 30 }, (_, i) => { const a = Spawn(i % 2 ? "ija" : "nra", 6000 + i + serial++, i % 2 ? 0 : 1, (i % 6) * 2, Math.floor(i / 6) * 2); return a; });
      const setA = mk(), setB = mk();
      let t = 0;
      for (let i = 0; i < 20; i += 1) { t += DT; for (const a of [...setA, ...setB]) a.Update(DT, st(t)); scene.updateMatrixWorld(true); }
      const zones = [["torso", "upperTorso"], ["arm", "upperArmR"], ["leg", "thighL"], ["torso", "lowerTorso"], ["head", "head"]];
      setA.forEach((a, i) => { const [part, shapeId] = zones[i % zones.length]; a.ReceiveHit(Descriptor(a, { part, shapeId, dir: [0.3, 0, 1], damage: 60 }, false)); });
      for (let f = 0; f < 36; f += 1) {
        t += DT;
        const order = f % 2 ? [[setA, perf.withMs], [setB, perf.withoutMs]] : [[setB, perf.withoutMs], [setA, perf.withMs]];
        for (const [set, sink] of order) {
          const t0 = performance.now();
          for (const a of set) a.Update(DT, st(t));
          sink.push(performance.now() - t0);
        }
        scene.updateMatrixWorld(true);
      }
    }
    // 只取前 24 帧（0.4 s 内层是活的），逐帧配对
    const withAvg = perf.withMs.slice(0, 24).reduce((s, v) => s + v, 0) / 24, withoutAvg = perf.withoutMs.slice(0, 24).reduce((s, v) => s + v, 0) / 24;

    // ---- 5. 真士兵链：Soldier.TakeHit → 弹簧层 / Kill(hit) → 方向死亡；AI 推迟开火 --------------------
    let soldierChain = null;
    try {
      const ai = window.Taierzhuang.ai;
      const dbg = window.Taierzhuang.Debug.HitReaction;
      const s = ai.Spawn("ija", 400, 400, {});
      if (s) {
        s.fireTimer = 0;
        const r1 = dbg.Hit(s.id, { dir: [0, 0, 1], part: "torso", kind: "bullet", damage: 30 });
        const stateAfter = dbg.State(s.id);
        const holdAfter = s.fireTimer;
        const r2 = dbg.Hit(s.id, { dir: [0, 0, -1], part: "torso", kind: "bullet", damage: 400 });
        const stateDead = dbg.State(s.id);
        soldierChain = { r1, active: stateAfter.active, holdAfter, r2, dead: !s.alive, death: stateDead.death, mode: stateDead.mode };
        // 走真的 AI 循环把倒地放完：AiDirector 对尸体的 Actor.Update 曾只放 0.9 s（旧程序化倒地的账），
        // 尸体刚体一拆，人就定在半跪的中间帧、枪悬在半空（2026-09-30 验收实拍抓到的）。
        const rag = s.actor?.ragdollState;
        window.Taierzhuang.StepFrames(Math.ceil(((rag?.duration || 2) + 1.5) * 60), 1 / 60, false);
        let gunLift = null;
        const gun = s.actor?.weaponGroup;
        if (gun && !s.actor.goreWeaponHold) {
          gun.updateWorldMatrix(true, true);
          let minY = Infinity;
          gun.traverse((m) => {
            if (!m.isMesh) return;
            m.geometry.computeBoundingBox();
            minY = Math.min(minY, m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).min.y);
          });
          gunLift = minY - s.position.y;
        }
        Object.assign(soldierChain, { finalT: s.actor?.ragdollState?.t ?? null, duration: rag?.duration ?? null, gunLift });
      }
    } catch (error) { soldierChain = { error: String(error?.stack || error) }; }

    return { live, deaths, specials, legacy, reset, disabled, perf: { withAvg, withoutAvg }, soldierChain,
      library: library ? { revision: library.revision, clips: [...library.clips.keys()], families: [...new Set(Object.values(library.profiles).map((p) => p.family))] } : null };
  }, {});

  const R = (v, d = 1) => (typeof v === "number" ? +v.toFixed(d) : v);
  if (REPORT) console.log(JSON.stringify(data, null, 1));

  // ---- 断言 ---------------------------------------------------------------------------------
  const by = (kind, name) => data.live.find((row) => row.kind === kind && row.spec === name);
  const inRange = (label, value, lo, hi) => assert.ok(value >= lo && value <= hi, `${label} = ${R(value, 2)} 不在 [${lo}, ${hi}]`);
  const errors = [];
  const check = (fn) => { try { fn(); } catch (error) { errors.push(error.message); } };
  for (const kind of ["nra", "ija"]) {
    const rifle = by(kind, "rifleChestFront");
    check(() => inRange(`${kind} 步枪正面胸后仰(°)`, rifle.chest[0], 10, 20));
    check(() => assert.ok(rifle.settleChestS < 0.8, `${kind} 胸/头 ${rifle.settleChestS}s 才回到 <1°`));
    check(() => inRange(`${kind} 头相对胸后甩(°)`, rifle.headRel[0], 12, 28));
    check(() => inRange(`${kind} 骨盆后移(cm)`, rifle.pelvisBackCm, 3, 8));
    const back = by(kind, "rifleChestBack");
    check(() => assert.ok(back.chest[0] < -8 && Math.abs(Math.abs(back.chest[0]) - rifle.chest[0]) < 4, `${kind} 背后中弹胸前扑符号/幅度 ${R(back.chest[0])} vs ${R(rifle.chest[0])}`));
    check(() => assert.ok(back.headRel[0] < 0, `${kind} 背后中弹头前甩`));
    const shoulder = by(kind, "rifleRightShoulderFront");
    check(() => inRange(`${kind} 右肩正面：胸绕竖轴(°)（右肩向后 = 负）`, shoulder.chest[1], -15, -5));
    // 端枪的上臂沿冲量方向（力臂小）摆得少，上臂的摆开量按放松站姿与侧向来量。
    check(() => inRange(`${kind} 右肩（放松）：上臂摆开(°)`, by(kind, "rifleRightShoulderRelaxed").arm, 12, 30));
    check(() => inRange(`${kind} 右臂侧面中弹：上臂顺冲量摆开(°)`, by(kind, "rifleRightArmSide").arm, 12, 30));
    const left = by(kind, "rifleLeftShoulderFront");
    check(() => inRange(`${kind} 左肩正面：胸绕竖轴(°)（左肩向后 = 正）`, left.chest[1], 5, 15));
    const thigh = by(kind, "rifleThighRFront");
    check(() => inRange(`${kind} 大腿：骨盆下沉(cm)`, thigh.pelvisSinkCm, 3, 8));
    check(() => inRange(`${kind} 大腿：受力侧膝屈(°)`, thigh.knee, 20, 50));
    check(() => assert.ok(thigh.settleLegS < 0.9, `${kind} 大腿恢复 ${thigh.settleLegS}s`));
    check(() => assert.ok(thigh.chestMag < 3, `${kind} 打腿不该动胸 ${R(thigh.chestMag)}`));
    const arm = by(kind, "rifleArmFront");
    check(() => inRange(`${kind} 打前臂：上臂随动(°)`, arm.arm, 8, 30));
    check(() => assert.ok(arm.forearm < 45, `${kind} 打前臂：肘不该被打到限位 ${R(arm.forearm)}°`));
    for (const name of ["hmgChestFront", "bladeChest"]) {
      const row = by(kind, name);
      check(() => inRange(`${kind} ${name} 胸 / 步枪档`, Math.hypot(...row.chest) / Math.hypot(...rifle.chest), 1.2, 1.6));
    }
    check(() => assert.ok(by(kind, "blastChest").chestMag >= 40, `${kind} 近爆胸应顶到限位 ${R(by(kind, "blastChest").chestMag)}`));
    const side = by(kind, "rifleChestLeft");
    check(() => assert.ok(Math.abs(side.chest[2]) > 4 && Math.abs(side.chest[0]) < 3, `${kind} 侧面中弹应绕前后轴倾 ${side.chest.map((v) => R(v))}`));
    const ai = by(kind, "aiRifleTorsoNoShape"), aiLeg = by(kind, "aiRifleLegNoShape");
    check(() => assert.ok(ai.chest[0] > 6, `${kind} AI 无命中体躯干也后仰 ${R(ai.chest[0])}`));
    check(() => assert.ok(aiLeg.pelvisSinkCm > 2 && aiLeg.chestMag < 3, `${kind} AI 打腿按部位取腿 ${R(aiLeg.pelvisSinkCm)}cm`));
    for (const row of data.live.filter((r) => r.kind === kind)) {
      check(() => assert.ok(row.residualDeg < 0.5 && !row.active && row.records === 0, `${kind} ${row.spec} 1.6 s 后残留 ${R(row.residualDeg, 3)}° active=${row.active} records=${row.records}`));
      check(() => assert.ok(row.layerCreated, `${kind} ${row.spec} 第一次命中才建层`));
    }
    check(() => assert.ok(rifle.gunShiftCm > 0.8, `${kind} 枪跟着上身被打偏（枪-手相对位移 ${R(rifle.gunShiftCm, 2)}cm 不该为 0）`));
    check(() => assert.ok(rifle.gunShiftCm < 8, `${kind} 枪不该飞离手 ${R(rifle.gunShiftCm, 2)}cm`));
  }

  // 死亡
  const clipsOf = new Set(data.deaths.map((row) => row.clip));
  const deg = (v) => ((v % 360) + 540) % 360 - 180;
  // 动作库四个方向族（back / forward / left / right）齐了才强制 ≤ 45°；还在补的库只断言转向机制。
  const libraryComplete = !!data.library && ["back", "forward", "left", "right"].every((f) => data.library.families.includes(f));
  for (const row of data.deaths) {
    const tag = `${row.kind}/${row.part}/${row.angleDeg}°`;
    check(() => assert.ok(row.choice, `${tag} 没有选择记录`));
    if (!row.choice) continue;
    check(() => assert.equal(row.clip, row.choice.id, `${tag} 播放的 clip 与选择不一致`));
    check(() => assert.ok(row.recordsAfterFade === 0 && !row.layerActiveAfterFade, `${tag} 死亡进度 ≥ fadeEnd 后偏移必须严格为 0（records=${row.recordsAfterFade}）`));
    check(() => assert.ok(row.skinFloor > -0.012 && row.skinFloor < 0.03, `${tag} 终帧接地 ${R(row.skinFloor, 4)}`));
    // 转向机制：实际倒向 ≈ 选中 clip 的倒向转 yaw 之后（库缺失时用 Kimodo 实测，容差 25°）
    if (row.choice.desiredDeg !== null) {
      const off = Math.abs(deg(row.fallDeg - row.choice.desiredDeg));
      const budget = row.choice.residualDeg + 25;
      if (libraryComplete || REQUIRE_LIBRARY) check(() => assert.ok(off <= 45, `${tag} 终帧倒向 ${R(row.fallDeg)}° 与期望 ${R(row.choice.desiredDeg)}° 夹角 ${R(off)}° > 45°`));
      else check(() => assert.ok(off <= budget, `${tag} 库缺失退路：倒向偏差 ${R(off)}° 超过 残余偏角 ${R(row.choice.residualDeg)}° + 25°（转向机制方向可能反了）`));
    }
  }
  check(() => assert.ok(clipsOf.size >= 2, `方向死亡应选出多种 clip：${[...clipsOf]}`));
  if (REQUIRE_LIBRARY) {
    check(() => assert.ok(data.library, "--require-library：动作库没有加载到"));
    for (const family of ["back", "forward", "left", "right"]) {
      check(() => assert.ok(data.deaths.some((row) => row.choice?.family === family), `--require-library：16 个方向里没选出 ${family} 类动作`));
    }
  }
  for (const row of data.specials) {
    check(() => assert.ok(row.skinFloor > -0.012 && row.skinFloor < 0.03 && row.recordsAfterFade === 0, `${row.name} 接地 ${R(row.skinFloor, 4)} / 残留 ${row.recordsAfterFade}`));
  }
  for (const row of data.legacy) {
    check(() => assert.equal(row.after, row.before, `${row.kind} 没有 hit 的 Ragdoll 必须仍按 seed 抽（${row.before} → ${row.after}）`));
    // body 四元数里只该有接地拟合的俯仰 / 侧倾（很小），不该有绕竖轴的转向。
    check(() => assert.ok(!row.layer && Math.abs(row.twistDeg) < 6, `${row.kind} 没有 hit 的 Kill 不转向（绕竖轴 ${R(row.twistDeg)}°）、不建层`));
  }
  check(() => assert.ok(data.reset.mid > 2 && data.reset.after < 0.01 && !data.reset.active, `复用重置 mid=${R(data.reset.mid)} after=${R(data.reset.after, 3)}`));
  check(() => assert.ok(data.disabled.receive === null && !data.disabled.layer && data.disabled.hurtDelta > 2 && data.disabled.deathLayer === null && Math.abs(data.disabled.bodyYawDeg) < 6,
    `?hitreact=0 应退回老路：${JSON.stringify(data.disabled)}`));
  const perfDelta = data.perf.withAvg - data.perf.withoutAvg;
  check(() => assert.ok(perfDelta < 3, `30 人同时受击每帧多 ${R(perfDelta, 2)} ms`));
  if (data.soldierChain) {
    check(() => assert.ok(!data.soldierChain.error, `士兵链报错：${data.soldierChain.error}`));
    if (!data.soldierChain.error) {
      check(() => assert.ok(data.soldierChain.active && data.soldierChain.holdAfter > 0, `Soldier.TakeHit 应触发弹簧层并推迟开火：${JSON.stringify(data.soldierChain)}`));
      check(() => assert.ok(data.soldierChain.dead && data.soldierChain.death, `致死命中应带方向死亡选择：${JSON.stringify(data.soldierChain)}`));
      check(() => assert.ok(data.soldierChain.finalT === 1, `AI 循环里倒地动作必须放完（t=${data.soldierChain.finalT}，时长 ${R(data.soldierChain.duration, 2)} s）`));
      check(() => assert.ok(data.soldierChain.gunLift === null || (data.soldierChain.gunLift > -0.02 && data.soldierChain.gunLift < 0.05),
        `倒地后枪应落在地上（最低点离地 ${R(data.soldierChain.gunLift, 3)} m）`));
    }
  }

  if (REPORT || process.env.HITREACT_SUMMARY) {
    const line = (label, v) => console.log(label.padEnd(34), v);
    for (const kind of ["nra", "ija"]) {
      const r = by(kind, "rifleChestFront");
      line(`${kind} chest/head/pelvis`, `${R(r.chest[0])}° / ${R(r.headRel[0])}° / ${R(r.pelvisBackCm)}cm settle ${R(r.settleChestS, 2)}s`);
    }
    console.log(`perf: with ${R(data.perf.withAvg, 2)} ms / without ${R(data.perf.withoutAvg, 2)} ms (30 actors, per frame)`);
  }
  assert.equal(pageErrors.length, 0, "页面脚本错误：" + pageErrors.join(" | "));
  assert.equal(errors.length, 0, `\n${errors.join("\n")}`);
  console.log(`HitReactionBrowserTest OK — NRA+IJA 活人 ${data.live.length} 例、方向死亡 ${data.deaths.length + data.specials.length} 例、无 hit 老路、开关、复用、30 人每帧 +${R(perfDelta, 2)} ms；动作库 ${data.library ? data.library.revision : "未加载（退路 Kimodo A–D）"}`);
} finally {
  if (page) await page.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
