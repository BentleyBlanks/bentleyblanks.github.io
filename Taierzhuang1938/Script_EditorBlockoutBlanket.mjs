// 白盒关卡编辑器里的单被（2026-10-21，用户：拖着冬瓜的被子用上传的正式资产）。
//
// 资产：Model/Model_SingleBlanket.glb（五补丁薄土布单被，docs/Data_SingleBlanket.md）：一只蒙皮网格 + 217 骨，
// 宽 1.4 m（±X）、长 1.9 m（头端 +Z、尾端 −Z），静止姿势平铺在 y = 0、面朝 +Y；贴图内嵌，双面、alpha 裁切。
// 每一副被子各克隆一份骨架（CloneSkinnedRig，几何与贴图共用）。
//
// 2026-10-21 第二轮（用户：接一个比较基础的布料模拟）：缺省走布料模拟（Script_BlanketCloth，216 根变形骨 = 216 个质点，
// 世界空间里推，写回骨头）。Simulate(dt, env) 每帧由演员层喂：两只拽被角的手（没人拽就放开，掉在地上）、躺在被子上的人
// 与拖的人的腿（身体胶囊）、地面高度。被子一帧跳太远（预演跳时间、关键帧切换）或要求确定性取样（Seek）时重新铺平再空推一会儿。
// BLOCKOUT_BLANKET.cloth = false 退回原来的两条静态姿势：Blanket_Flat（平铺）与 Blanket_DragPose（头端两角抬到 0.70 m）。
// 静态片段 glTF 时长 0，不交给 AnimationMixer（0 时长循环会除零），读每条轨道的第一帧按权重插值直接写骨头。
//
// 2026-10-31（用户：吸血的布弄到白盒里，看基本效果和位置）：被子挂上布料测试场那套双面吸血（Script_ClothBlood，docs/Data_ClothBlood.md）。
// 出血点 = 躺在被子上的伤员（_BlanketEnv 的 wounds，骨盆到胸口 0.6 处）此刻正下方是布上的哪一点（ClothUv：在布料质点格子
// 此刻的世界位置里找包住它的三角形，按静止位置插值回资产坐标）—— 拖着走时人身下那块布跟着人滑，不能按被子根的平铺坐标算。
// 正面渗、慢慢透到背面。
// 重新铺平（Apply / 关键帧跳转 / 预演 Seek）时出血点挪了 keepM 以上（或之前没血）就清掉重来：在出血点倒 soakMl、当场空推 soakS 秒
// 让它晕开（约 0.2 s，挪动不大就不重算，拖预演时间条不卡），之后按 feedMlS 往外渗，总量到 capMl 停。
// 白盒只看位置和大概的样子，不跟预演时间线逐帧对齐（同一处 Seek 回去不会把血擦掉重算）。

import * as THREE from "three";
import { ManagedGLTFLoader as GLTFLoader } from "./Script_ModelImports.mjs";
import { CloneSkinnedRig } from "./Script_SkinnedClone.mjs";
import { BlanketClothRig } from "./Script_BlanketCloth.mjs";
import { ClothBlood } from "./Script_ClothBlood.mjs";

export const BLOCKOUT_BLANKET = Object.freeze({
  url: "./Model/Model_SingleBlanket.glb?v=20261023SingleBlanketShell",
  flatClip: "Blanket_Flat",
  dragClip: "Blanket_DragPose",
  /** 平铺 ↔ 拖拽的过渡快慢（每秒趋近的比例，指数平滑；只在 cloth = false 时用）。 */
  blendRate: 5,
  /** 布料模拟（false = 两条静态姿势插值）。 */
  cloth: true,
  /** 吸血（文件头 2026-10-31）：资产宽长（米，被面坐标归一化用）、织物档、重铺时先铺的量与「已渗了多久」、之后每秒渗多少、总量封顶、出血点挪多远才换位置。 */
  blood: Object.freeze({ enabled: true, widthM: 1.4, lengthM: 1.9, profile: "thin", soakMl: 220, soakS: 50, feedMlS: 1, capMl: 300, moveM: 0.06, keepM: 0.15 }),
});

let pending = null;

/** 读一次 GLB，把两条静态姿势拆成「骨名 → 位置 / 朝向」。→ Promise<{ scene, poses: { flat, drag } }> */
export function LoadBlockoutBlanket() {
  if (!pending) pending = new GLTFLoader().loadAsync(BLOCKOUT_BLANKET.url).then((gltf) => {
    const Pose = (name) => {
      const clip = gltf.animations.find(c => c.name === name);
      if (!clip) throw new Error(`单被缺动作 ${name}`);
      const pose = new Map();
      for (const track of clip.tracks) {
        const dot = track.name.lastIndexOf(".");
        const bone = track.name.slice(0, dot), prop = track.name.slice(dot + 1);
        if (prop !== "position" && prop !== "quaternion") continue;
        const entry = pose.get(bone) || {};
        entry[prop] = Array.from(track.values.slice(0, prop === "position" ? 3 : 4));
        pose.set(bone, entry);
      }
      return pose;
    };
    return { scene: gltf.scene, poses: { flat: Pose(BLOCKOUT_BLANKET.flatClip), drag: Pose(BLOCKOUT_BLANKET.dragClip) } };
  }).catch((error) => { pending = null; throw error; });
  return pending;
}

const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const _w = new THREE.Matrix4(), _center = new THREE.Vector3(), _gather = new THREE.Vector3();

/**
 * 两只手攥被角：角硬钉（k）在拳头上，沿侧边的 gatherSide 个点软钉到拳头下方一点点（攥成一把，2026-10-23）；没手就都放开。
 */
function Grip(rig, grips, k, groundAt) {
  const cloth = rig.cloth, cfg = cloth.cfg;
  for (const key of ["headL", "headR"]) {
    const grip = grips[key] || null;
    cloth.SetPin(rig.corners[key], grip, k);
    rig.gathers[key].forEach((i, m) => {
      if (!grip || m >= cfg.gatherSide) { cloth.SetPin(i, null); return; }
      _gather.copy(grip); _gather.y -= cfg.gatherDropM * (m + 1);
      const g = groundAt(_gather.x, _gather.z);
      if (Number.isFinite(g)) _gather.y = Math.max(_gather.y, g + cfg.groundOffsetM);
      cloth.SetPin(i, _gather, cfg.gatherK, true);
    });
  }
}

/**
 * 一副被子。root 原点 = 被子中心、平铺时贴在 y = 0，头端 +Z。
 * → { root, cloth, SetDrag(target, dt), Simulate(dt, env), drag, Probe(), Dispose() }
 *   SetDrag：静态姿势插值（cloth 关时用），target 0 = 平铺、1 = 拖拽，dt 秒（0 = 直接到位）。
 *   Simulate：见文件头；env = { groundAt(x, z), grips: { headL, headR }（世界坐标 Vector3 | null）, colliders, reset }。
 */
export function CreateBlockoutBlanket(asset) {
  const root = CloneSkinnedRig(asset.scene);
  root.name = "BlockoutSingleBlanket";
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true; object.receiveShadow = true;
    // 蒙皮网格的剔除球按第一次剔除时的姿势算、之后不更新（拖拽时头角抬高、整床被子在世界里挪）：被子就几副，不剔
    object.frustumCulled = false;
  });
  // 某条姿势里没写的骨头取它的静止变换（导出时去掉了与静止相同的常量轨道也不怕）
  const bones = [];
  for (const name of new Set([...asset.poses.flat.keys(), ...asset.poses.drag.keys()])) {
    const bone = root.getObjectByName(name);
    if (!bone) continue;
    const rest = { position: bone.position.toArray(), quaternion: bone.quaternion.toArray() };
    const flat = { ...rest, ...asset.poses.flat.get(name) }, drag = { ...rest, ...asset.poses.drag.get(name) };
    bones.push({ bone, flat, drag });
  }
  let rig = null;
  if (BLOCKOUT_BLANKET.cloth) {
    try { rig = new BlanketClothRig(root); }
    catch (error) { console.warn("[BlockoutBlanket] cloth rig failed; static poses", error); }
  }
  let blood = null;
  const W = BLOCKOUT_BLANKET.blood;
  if (rig && W.enabled) {
    // 和布料测试场一样：骨架 / 布料先建，再复制几何、挂血迹材质补丁（几何与材质都是这副被子私有的克隆）
    try { blood = new ClothBlood(root, { width: W.widthM, length: W.lengthM, profile: W.profile }); }
    catch (error) { console.warn("[BlockoutBlanket] cloth blood failed; plain blanket", error); }
  }
  const inst = {
    root, cloth: rig, blood, drag: -1, last: null, steps: 0, resets: 0,
    SetDrag(target, dt = 0) {
      const t = Math.min(1, Math.max(0, target));
      const next = this.drag < 0 || dt <= 0 ? t : this.drag + (t - this.drag) * (1 - Math.exp(-dt * BLOCKOUT_BLANKET.blendRate));
      if (Math.abs(next - this.drag) < 1e-4 && this.drag >= 0) return;
      this.drag = Math.abs(next - t) < 1e-3 ? t : next;
      const w = this.drag;
      for (const { bone, flat, drag } of bones) {
        if (flat.position && drag.position) bone.position.copy(_pa.fromArray(flat.position).lerp(_pb.fromArray(drag.position), w));
        if (flat.quaternion && drag.quaternion) bone.quaternion.copy(_qa.fromArray(flat.quaternion).slerp(_qb.fromArray(drag.quaternion), w));
      }
    },
    /** 资产空间的点 → 世界（默认被角、取证用）。 */
    AssetPoint(x, y, z, out = new THREE.Vector3()) { return rig ? rig.AssetPoint(x, y, z, out) : out.set(x, y, z).applyMatrix4(root.matrixWorld); },
    /** 世界 → 资产空间。 */
    ToAsset(point, out = new THREE.Vector3()) { return out.copy(point).applyMatrix4(_w.copy(rig.AssetToWorld(_w)).invert()); },
    Simulate(dt, env = {}) {
      if (!rig) return;
      const t0 = performance.now();
      const cloth = rig.cloth;
      const world = rig.AssetToWorld(_w);
      _center.setFromMatrixPosition(world);
      const jumped = !this.last || this.last.distanceTo(_center) > cloth.cfg.resetJumpM;
      (this.last ||= new THREE.Vector3()).copy(_center);
      const grips = env.grips || {};
      cloth.SetColliders(env.colliders || []);
      const groundAt = env.groundAt || (() => 0), k = cloth.cfg.pinK;
      // 手伸进沟壁 / 地下（片段的拳头不管地形）：被角最低贴着手底下的地面
      for (const grip of [grips.headL, grips.headR]) {
        if (!grip) continue;
        const g = groundAt(grip.x, grip.z);
        if (Number.isFinite(g)) grip.y = Math.max(grip.y, g + cloth.cfg.groundOffsetM);
      }
      const reset = !cloth.ready || jumped || env.reset;
      if (reset) {
        // 重新铺平：静止平铺放在被子此刻的位姿上，再按此刻的手和身体空推 settleS（被角挪到手上、布落定）
        cloth.Reset(world);
        cloth.SampleGround(groundAt, true);
        this.resets += 1;
        this.lastReset = { root: _center.toArray().map(v => +v.toFixed(3)), headL: grips.headL?.toArray().map(v => +v.toFixed(3)) || null };
        cloth.Settle(cloth.cfg.settleS, () => {
          Grip(rig, grips, k, groundAt);
          cloth.SampleGround(groundAt);
        });
      }
      Grip(rig, grips, k, groundAt);
      if (dt > 0) {
        cloth.SampleGround(groundAt);
        this.steps += cloth.Step(dt);
      }
      rig.Apply();
      this.drag = cloth.pins.size ? 1 : 0;
      this.Bleed(dt, env.wounds, reset);
      this.lastMs = performance.now() - t0;
    },
    /**
     * 世界里一点正下方（XZ）是布上的哪一点：质点格子每格拆两个三角形，按此刻世界位置找包住它的（叠了几层取高度最接近的），
     * 用重心坐标插值静止位置 → 被面 u/v。不在布上 → null。
     */
    ClothUv(point) {
      const cloth = rig.cloth, x = cloth.x, rest = cloth.rest, cols = rig.cols;
      let best = null, bestDy = Infinity;
      for (let r = 0; r + 1 < rig.rows; r++) for (let c = 0; c + 1 < cols; c++) {
        const i00 = r * cols + c, i01 = i00 + 1, i10 = i00 + cols, i11 = i10 + 1;
        for (const [a, b, d] of [[i00, i01, i11], [i00, i11, i10]]) {
          const ax = x[a * 3], az = x[a * 3 + 2], bx = x[b * 3] - ax, bz = x[b * 3 + 2] - az, dx = x[d * 3] - ax, dz = x[d * 3 + 2] - az;
          const det = bx * dz - bz * dx;
          if (Math.abs(det) < 1e-9) continue;
          const px = point.x - ax, pz = point.z - az;
          const wb = (px * dz - pz * dx) / det, wd = (bx * pz - bz * px) / det, wa = 1 - wb - wd;
          if (wa < -1e-6 || wb < -1e-6 || wd < -1e-6) continue;
          const y = wa * x[a * 3 + 1] + wb * x[b * 3 + 1] + wd * x[d * 3 + 1], dy = Math.abs(point.y - y);
          if (dy >= bestDy) continue;
          bestDy = dy;
          best = { u: (wa * rest[a * 3] + wb * rest[b * 3] + wd * rest[d * 3]) / W.widthM + 0.5,
            v: (wa * rest[a * 3 + 2] + wb * rest[b * 3 + 2] + wd * rest[d * 3 + 2]) / W.lengthM + 0.5 };
        }
      }
      return best && blood.Point({ ...best, side: 1 });
    },
    /** 吸血：wounds = 伤员出血处（世界坐标），取第一处、落在布上的那点（ClothUv），正面。reset = 刚重新铺平（文件头）。 */
    Bleed(dt, wounds, reset) {
      if (!blood) return;
      const src = wounds?.length ? this.ClothUv(wounds[0]) : null;
      const Gap = (a, b) => Math.hypot((a.u - b.u) * W.widthM, (a.v - b.v) * W.lengthM);
      if (reset && !(src && this.soakAt && Gap(src, this.soakAt) <= W.keepM)) {
        blood.Clear(); this.bleedAt = null; this.soakAt = null;
        if (src) { blood.Inject({ ...src, amountMl: W.soakMl, ageS: 0 }); blood.Advance(W.soakS); this.soakAt = src; }
      }
      if (!src || blood.injectedMl >= W.capMl) { if (blood.feed) blood.StopFeed(); }
      else if (!blood.feed || !this.bleedAt || Gap(src, this.bleedAt) > W.moveM) {
        blood.StartFeed({ ...src, rateMlS: W.feedMlS }); this.bleedAt = src;
      }
      if (dt > 0) blood.Advance(dt);
    },
    /** 取证：模拟开没开、两角有没有人拽、离手多远、最高点、拉长、贴地 / 被压住的点数、重铺次数。 */
    Probe() {
      if (!rig) return { cloth: false, drag: this.drag };
      const cloth = rig.cloth, s = cloth.Stats();
      const corner = (key) => {
        const i = rig.corners[key], pin = cloth.pins.get(i);
        const p = new THREE.Vector3().fromArray(cloth.x, i * 3);
        return { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), aboveGround: +(p.y - cloth.groundY[i] + cloth.cfg.groundOffsetM).toFixed(3),
          held: !!pin, gapM: pin ? +p.distanceTo(pin.target).toFixed(3) : null, target: pin ? pin.target.toArray().map(v => +v.toFixed(3)) : null };
      };
      const at = new THREE.Vector3().setFromMatrixPosition(rig.AssetToWorld(_w));
      return { cloth: true, drag: this.drag, steps: this.steps, resets: this.resets, lastMs: +(this.lastMs || 0).toFixed(3),
        root: at.toArray().map(v => +v.toFixed(3)), lastReset: this.lastReset || null,
        headL: corner("headL"), headR: corner("headR"), tailL: corner("tailL"), tailR: corner("tailR"),
        topM: +s.topM.toFixed(3), lowM: +s.lowM.toFixed(3), maxStretch: +s.maxStretch.toFixed(3), minRatio: +s.minRatio.toFixed(3),
        contact: s.contact, pressed: s.pressed, colliders: cloth.colliders.length,
        blood: blood ? (() => { const b = blood.State(); return { feeding: b.feeding, at: this.bleedAt ? { u: +this.bleedAt.u.toFixed(3), v: +this.bleedAt.v.toFixed(3) } : null,
          injectedMl: +b.injectedMl.toFixed(1), frontM2: +b.front.areaM2.toFixed(3), backM2: +b.back.areaM2.toFixed(3), timeS: +b.timeS.toFixed(1) }; })() : null };
    },
    Dispose() { blood?.Dispose(); root.removeFromParent(); },
  };
  if (!rig) inst.SetDrag(0);
  return inst;
}
