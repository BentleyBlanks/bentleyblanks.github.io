// 过场演员的作者动作层（Blender 烘的原骨架逐骨采样）。
//
// 契约（docs/Data_CutsceneRedo.md §1.3「perform」）：
//   · cast 轨道的关键帧 state 里写 `perform: "<ClipId>"`，从**该关键帧的 t0**起播这条
//     clip；loop 循环，once 播完保持末帧。采样按 `(过场时间 − t0)` 定位，不按累计 dt ——
//     拖时间轴、Esc 跳过、出图脚本从任意时刻抓帧，拿到的姿势逐比特相同。
//   · `perform: null`（或没写）→ 走原来的 POSE_CLIPS 路径。
//   · 未知 clip id / 这具骨架没有这条 clip → console.warn 一次并回退，不抛错卡死过场。
//   · 表演期间 pos / ry 仍由过场轨道决定：**这里只写骨头，从不写 Soldier / Actor 世界根**。
//     唯一动到 rig.root 的是抵掉 CharacterModel 自己加的 infantryFloorOffset（那是按
//     POSE_CLIPS 的脚底算的，对作者动作没有意义），退出时逐比特还原。
//   · `perform` 与 crouch / prone / dead 同时出现时以 perform 为准（它最后写骨头）。
//
// 贴地：每一帧在烘焙时已经被整体平移到「最低那个蒙皮顶点正好离地 floorClearanceM」，
// 所以运行时不需要脚底探针，也不会有「探针→抬根→再探针」的反馈回路。
import { Vector3, Quaternion } from "three";

const MANIFEST = "Data_MachineGunCaptivesAnimation.json";
const DEFAULT_BASE = "./Animation/MachineGunCaptives/";
const LIBRARY_VERSION = "20260915MachineGunCaptivesV1";

const Clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const Smooth = (value) => { const x = Clamp(value, 0, 1); return x * x * (3 - 2 * x); };
const Normalize = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, "");

const savedPool = [];
const warned = new Set();
function WarnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

let pending = null;
let library = null;

/** 已加载的动作库（没加载完是 null）。测试与诊断用。 */
export function MachineGunCaptivesLibrary() { return library; }

/** 预取动作库；重复调用共用同一个 promise，不阻塞开机。 */
export function LoadMachineGunCaptivesAnimation(base = DEFAULT_BASE) {
  return pending ||= (async () => {
    const response = await fetch(`${base}${MANIFEST}?v=${LIBRARY_VERSION}`);
    if (!response.ok) throw Error(`Captives animation manifest HTTP ${response.status}`);
    const config = await response.json();
    if (config.version !== LIBRARY_VERSION) {
      console.warn(`[CutscenePerformance] manifest version ${config.version} != ${LIBRARY_VERSION}`);
    }
    const records = await Promise.all((config.models || []).map(async (record) => {
      const file = await fetch(`${base}${record.file}?v=${record.sha256}`);
      if (!file.ok) throw Error(`Captives animation HTTP ${file.status} ${record.id}`);
      return [record.id, await file.json()];
    }));
    library = { config, models: new Map(records) };
    return library;
  })();
}

const PerformOf = (key) => {
  const value = key && key.state ? key.state.perform : null;
  return typeof value === "string" && value ? value : null;
};

/**
 * 在一条 cast 轨道上解出此刻该播哪条 clip、从哪个**过场全局秒**起播。
 * 返回 `{ clipId, t0, previous }`；previous 是上一段表演（给确定性交叉淡入用），
 * 上一段不是表演（perform:null / 第一段）时为 null。
 *
 * 纯函数：只读轨道与时间，不看上一帧。时间轴拖到哪儿都给同一个答案。
 */
export function ResolvePerform(track, time) {
  if (!Array.isArray(track) || !track.length) return null;
  if (!(time >= track[0].t)) return null;             // 第一帧之前一律没上场
  let index = 0;
  for (let k = 1; k < track.length; k += 1) {
    if (track[k].t <= time) index = k; else break;
  }
  const clipId = PerformOf(track[index]);
  if (!clipId) return null;
  let start = index;
  while (start > 0 && PerformOf(track[start - 1]) === clipId) start -= 1;
  const resolved = { clipId, t0: track[start].t, previous: null };
  if (start > 0) {
    const previousId = PerformOf(track[start - 1]);
    if (previousId) {
      let from = start - 1;
      while (from > 0 && PerformOf(track[from - 1]) === previousId) from -= 1;
      resolved.previous = { clipId: previousId, t0: track[from].t };
    }
  }
  return resolved;
}

export class CutscenePerformer {
  constructor(actor, record, config) {
    this.actor = actor;
    this.rig = actor.characterRig;
    this.record = record;
    this.config = config || {};
    this.saved = new Map();
    this.v = new Vector3(); this.v2 = new Vector3();
    this.q = new Quaternion(); this.q2 = new Quaternion();
    const nodes = new Map();
    this.rig.root.traverse((node) => nodes.set(Normalize(node.name), node));
    this.bones = record.bones.map((name) => {
      const node = nodes.get(Normalize(name));
      if (!node || !node.isBone) throw Error(`Captives bone binding ${record.modelId} ${name}`);
      return node;
    });
    if (record.stride !== 7 || !this.bones.length) throw Error("Captives animation schema");
    this.pose = new Float64Array(this.bones.length * 7);
    this.blendPose = new Float64Array(this.bones.length * 7);
    this.state = null;
  }

  Has(clipId) { return !!this.record.clips[clipId]; }

  ClipDuration(clipId) {
    const clip = this.record.clips[clipId];
    return clip ? clip.duration : 0;
  }

  Save(node) {
    if (this.saved.has(node)) return;
    const record = savedPool.pop() || { p: new Vector3(), q: new Quaternion(), s: new Vector3() };
    record.p.copy(node.position); record.q.copy(node.quaternion); record.s.copy(node.scale);
    this.saved.set(node, record);
  }

  /** 逐比特还原这一层碰过的每一个变换。mixer 采样之前调用。 */
  Restore() {
    for (const [node, pose] of this.saved) {
      node.position.copy(pose.p); node.quaternion.copy(pose.q); node.scale.copy(pose.s);
      savedPool.push(pose);
    }
    this.saved.clear();
    this.state = null;
  }

  _SampleInto(clip, seconds, out) {
    const duration = clip.duration || 1e-6;
    let at = Number.isFinite(seconds) ? seconds : 0;
    at = clip.loop ? ((at % duration) + duration) % duration : Clamp(at, 0, duration);
    const position = (at / duration) * (clip.frameCount - 1);
    const a = Math.min(Math.max(0, Math.floor(position)), clip.frameCount - 1);
    const b = Math.min(a + 1, clip.frameCount - 1);
    const blend = position - a;
    const stride = this.bones.length * 7;
    const values = clip.values;
    for (let i = 0; i < this.bones.length; i += 1) {
      const from = a * stride + i * 7;
      const to = b * stride + i * 7;
      this.v.fromArray(values, from).lerp(this.v2.fromArray(values, to), blend).toArray(out, i * 7);
      this.q.fromArray(values, from + 3).slerp(this.q2.fromArray(values, to + 3), blend).toArray(out, i * 7 + 3);
    }
  }

  /**
   * 把 `resolved` 这一段表演在 `time`（过场全局秒）上的姿势写到蒙皮上。
   * 换 clip 时与上一段做一次**确定性**交叉淡入：两段都按各自的 t0 取样，混合量只由
   * `time − t0` 决定，所以拖时间轴与逐帧推进得到同一张图。
   */
  Apply(resolved, time) {
    const clip = this.record.clips[resolved.clipId];
    if (!clip) {
      WarnOnce(`${this.record.modelId}|${resolved.clipId}`,
        `[CutscenePerformance] ${this.record.modelId} has no clip "${resolved.clipId}"; falling back to POSE_CLIPS`);
      return false;
    }
    const elapsed = time - resolved.t0;
    this._SampleInto(clip, elapsed, this.pose);
    const blendSeconds = Number(this.config.blendSeconds) || 0;
    const previous = resolved.previous;
    if (previous && blendSeconds > 0 && elapsed < blendSeconds) {
      const previousClip = this.record.clips[previous.clipId];
      if (previousClip) {
        this._SampleInto(previousClip, time - previous.t0, this.blendPose);
        const mix = Smooth(elapsed / blendSeconds);
        for (let i = 0; i < this.bones.length; i += 1) {
          const offset = i * 7;
          this.v.fromArray(this.blendPose, offset)
            .lerp(this.v2.fromArray(this.pose, offset), mix).toArray(this.pose, offset);
          this.q.fromArray(this.blendPose, offset + 3)
            .slerp(this.q2.fromArray(this.pose, offset + 3), mix).toArray(this.pose, offset + 3);
        }
      }
    }
    for (let i = 0; i < this.bones.length; i += 1) {
      const node = this.bones[i];
      const offset = i * 7;
      this.Save(node);
      node.position.fromArray(this.pose, offset);
      node.quaternion.fromArray(this.pose, offset + 3);
    }
    const rig = this.rig;
    this.Save(rig.root);
    // CharacterModel 按 POSE_CLIPS 的脚底给 rig.root 加过一段抬升，对作者动作不成立；
    // 抵掉它，演员的脚下平面就是过场轨道给的 pos[1]。
    rig.root.position.y -= rig.infantryFloorOffset || 0;
    // 先把父链更新上去，再用 **SkinnedMesh 重写过的** updateMatrixWorld 刷子树：
    // Object3D.updateWorldMatrix 绕过那个重写，bindMatrixInverse 会停在上一帧，
    // 同帧稍后按 CPU 蒙皮量顶点的人（挂点、探针、出图）就会读到错位的皮。
    if (rig.root.parent) rig.root.parent.updateWorldMatrix(true, false);
    rig.root.updateMatrixWorld(true);
    this._AimWeapon(clip.weaponHold);
    this.state = { clipId: resolved.clipId, t0: resolved.t0, seconds: elapsed, loop: !!clip.loop };
    return true;
  }

  /**
   * 枪跟着这一帧的手走。Actor 的挂点重定向发生在 rig.Update 里、也就是我们改骨头**之前**，
   * 不补这一趟枪就停在上一套姿势的朝向上。单手持枪那条 clip 临时按单手规则解（枪口沿
   * 前臂延长线），解完立刻把标志还原。
   */
  _AimWeapon(hold) {
    const actor = this.actor;
    if (!hold || hold === "free") return;
    if (typeof actor?._UpdateRiggedWeaponMount !== "function") return;
    const twoHanded = actor.weaponTwoHanded;
    if (hold === "oneHandRight") actor.weaponTwoHanded = false;
    try { actor._UpdateRiggedWeaponMount(); } finally { actor.weaponTwoHanded = twoHanded; }
  }
}

/**
 * 过场逐帧更新的唯一挂点。调用方式（Script_Cutscene._ApplyActors）：
 *
 *   PerformCutsceneActor(item, dt, now, () => item.actor.Update(dt, state));
 *
 * 顺序是「还原上一帧的表演 → 跑正常的 Actor.Update（mixer 在里面）→ 写这一帧的表演」。
 * 没有 perform 时只做前两步，与接这层之前完全一致。
 */
export function PerformCutsceneActor(entry, dt, time, Update) {
  const actor = entry && entry.actor;
  const rig = actor && actor.characterRig;
  const performer = rig && rig.cutscenePerformance ? rig.cutscenePerformance : null;
  if (performer) performer.Restore();
  if (typeof Update === "function") Update();
  const resolved = ResolvePerform(entry && entry.spec ? entry.spec.track : null, time);
  if (!resolved) return false;
  if (!rig || rig.disposed) return false;
  if (!library) {
    // 正片在进第一关时就预取了；其它入口（过场预览、出图脚本）在这里补一次，
    // 库到位之前这几帧照常走 POSE_CLIPS，不卡住过场。
    LoadMachineGunCaptivesAnimation().catch((error) => {
      WarnOnce("load", `[CutscenePerformance] library unavailable: ${String(error).slice(0, 160)}`);
    });
    return false;
  }
  const record = library.models.get(rig.modelId);
  if (!record) {
    WarnOnce(`${rig.modelId}|rig`,
      `[CutscenePerformance] no authored clips for rig ${rig.modelId}; falling back to POSE_CLIPS`);
    return false;
  }
  let active = performer;
  if (!active || active.record !== record) {
    try {
      active = rig.cutscenePerformance = new CutscenePerformer(actor, record, library.config);
    } catch (error) {
      WarnOnce(`${rig.modelId}|bind`,
        `[CutscenePerformance] cannot bind ${rig.modelId}: ${String(error).slice(0, 160)}`);
      return false;
    }
  }
  return active.Apply(resolved, time);
}

/** 测试与拆场用：还原并丢掉这个演员的表演层。 */
export function ReleaseCutscenePerformer(actor) {
  const rig = actor && actor.characterRig;
  if (!rig || !rig.cutscenePerformance) return false;
  rig.cutscenePerformance.Restore();
  rig.cutscenePerformance = null;
  return true;
}
