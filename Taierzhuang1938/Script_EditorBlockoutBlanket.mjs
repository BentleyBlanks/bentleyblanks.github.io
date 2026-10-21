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

import * as THREE from "three";
import { ManagedGLTFLoader as GLTFLoader } from "./Script_ModelImports.mjs";
import { CloneSkinnedRig } from "./Script_SkinnedClone.mjs";
import { BlanketClothRig } from "./Script_BlanketCloth.mjs";

export const BLOCKOUT_BLANKET = Object.freeze({
  url: "./Model/Model_SingleBlanket.glb?v=20261020SingleBlanketRig217",
  flatClip: "Blanket_Flat",
  dragClip: "Blanket_DragPose",
  /** 平铺 ↔ 拖拽的过渡快慢（每秒趋近的比例，指数平滑；只在 cloth = false 时用）。 */
  blendRate: 5,
  /** 布料模拟（false = 两条静态姿势插值）。 */
  cloth: true,
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
const _w = new THREE.Matrix4(), _center = new THREE.Vector3();

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
  const inst = {
    root, cloth: rig, drag: -1, last: null, steps: 0, resets: 0,
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
      if (!cloth.ready || jumped || env.reset) {
        // 重新铺平：静止平铺放在被子此刻的位姿上，再按此刻的手和身体空推 settleS（被角挪到手上、布落定）
        cloth.Reset(world);
        cloth.SampleGround(groundAt, true);
        this.resets += 1;
        this.lastReset = { root: _center.toArray().map(v => +v.toFixed(3)), headL: grips.headL?.toArray().map(v => +v.toFixed(3)) || null };
        cloth.Settle(cloth.cfg.settleS, () => {
          cloth.SetPin(rig.corners.headL, grips.headL || null, k);
          cloth.SetPin(rig.corners.headR, grips.headR || null, k);
          cloth.SampleGround(groundAt);
        });
      }
      cloth.SetPin(rig.corners.headL, grips.headL || null, k);
      cloth.SetPin(rig.corners.headR, grips.headR || null, k);
      if (dt > 0) {
        cloth.SampleGround(groundAt);
        this.steps += cloth.Step(dt);
      }
      rig.Apply();
      this.drag = cloth.pins.size ? 1 : 0;
      this.lastMs = performance.now() - t0;
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
        contact: s.contact, pressed: s.pressed, colliders: cloth.colliders.length };
    },
    Dispose() { root.removeFromParent(); },
  };
  if (!rig) inst.SetDrag(0);
  return inst;
}
