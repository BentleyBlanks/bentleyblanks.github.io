// 站立待机的程序化叠加层。数值在 Data_Tuning_ActorIdle.mjs。
//
// 【为什么需要这一层】中性站姿待机 clip 还没做（见 docs/Data_FirstLevelP012AnimationNeeds.md
// 首批清单第一条：UnarmedIdleA/B 尚未交付）。现有素材里能当站姿用的只有 AdvanceFire
// （站姿据枪/上前射击）和 AttackCommand（站姿挥臂下令）—— 两条都是**带动作的**，在原地
// 循环会变成「所有人一起原地踏步据枪」。所以 Script_FirstLevelP012CastAppearance 把站住
// 的人的 timeScale 设成 0，定格在一帧上。定格解决了踏步，代价是整关的人站住就变雕像。
//
// 这一层不推翻那个决定：clip 仍然定格，由这里在定格姿势上叠**呼吸、重心倒换、扫视**。
// 三条纪律：
//   1. 脚不许滑。骨盆挪之前先记下 clip 摆好的两只脚的世界位置与朝向，挪完用两骨 IK
//      解回去 —— 与 Script_FirstLevelMissionPeople 停下来的担架员是同一套做法。
//   2. FK 不许累积。每帧在 mixer 采样之前 Restore()，这一层写过的骨头一根不留。
//   3. 位移是厘米级。这是待机不是表演；动大了膝盖会打弯、枪会离开握点。
//
// 与既有两层的关系：Script_FirstLevelMissionPeople.InstallMissionSentry 只叠头/胸的观察
// 摆动，装在少数任务演员身上；两层同时在时这里让出头部，避免张望角度翻倍。
import * as THREE from "three";
import { MissionTrainLifePose } from "./Script_FirstLevelMissionTrainLife.mjs";
import { STAND_IDLE as C } from "./Data_Tuning_ActorIdle.mjs";
import { SQUAD_MARCH } from "./Data_Tuning_SquadMarch.mjs";

const TAU = Math.PI * 2;
const REQUIRED_BONES = ["pelvis", "chest", "head", "thighL", "calfL", "footL", "thighR", "calfR", "footR"];

export class StandIdleLayer {
  constructor(soldier) {
    this.soldier = soldier;
    this.actor = soldier.actor;
    this.rig = this.actor.characterRig;
    this.pose = new MissionTrainLifePose(soldier);
    this.time = 0;
    // 每人一个固定相位：一排人同时站住时不许整齐划一地一起呼吸。
    this.phase = (((Number(soldier.id) || 1) * 0.61803398875) % 1) * 60;
    this.ready = !!this.rig?.bones && REQUIRED_BONES.every((name) => this.rig.bones[name]);
    this.feet = ["L", "R"].map((side) => ({ side, point: new THREE.Vector3(), rotation: new THREE.Quaternion() }));
    this._pelvis = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this._offset = new THREE.Vector3();
    this._pole = new THREE.Vector3();
    this._quaternion = new THREE.Quaternion();
  }

  /** mixer 采样之前调用：把上一帧叠上去的骨头全部还原。 */
  Restore() { if (this.ready) this.pose.Restore(); }

  /** mixer 采样之后调用。返回是否真的叠了。 */
  Apply(dt, state = {}) {
    if (!this.ready) return false;
    const rig = this.rig, bones = rig.bones, actor = this.actor, pose = this.pose;
    pose.basis = actor.root;
    this.time += Math.max(0, dt);
    actor.root.updateWorldMatrix(true, false);
    const t = this.time + this.phase;
    const march = this.soldier.squadMarchCommand;
    const recovering = march?.breath > 0;
    const breath = Math.sin(t * TAU * (recovering ? SQUAD_MARCH.breathRateHz : C.breathRateHz))
      * (recovering ? SQUAD_MARCH.breathScale : 1);
    const shift = Math.sin(t * TAU * C.shiftRateHz) * 0.75 + Math.sin(t * TAU * C.shiftJitterHz) * 0.25;
    const scan = Math.sin(t * TAU * C.scanRateHz) * 0.7 + Math.sin(t * TAU * C.scanJitterHz + 1.7) * 0.3;
    // clip 摆好的落脚点就是这一帧的接地事实：先记住，骨盆动完再解回来。
    for (const foot of this.feet) {
      const bone = bones["foot" + foot.side];
      bone.getWorldPosition(foot.point);
      bone.getWorldQuaternion(foot.rotation);
    }
    const pelvis = bones.pelvis;
    pose.Save(pelvis);
    pelvis.getWorldPosition(this._pelvis);
    this._origin.set(0, 0, 0); actor.root.localToWorld(this._origin);
    this._offset.set(shift * C.shiftM, breath * C.breathRiseM, 0);
    actor.root.localToWorld(this._offset).sub(this._origin);
    pelvis.position.copy(pelvis.parent.worldToLocal(this._pelvis.add(this._offset)));
    pelvis.updateWorldMatrix(false, false);
    for (const foot of this.feet) {
      const sign = foot.side === "L" ? -1 : 1;
      this._pole.set(sign * C.kneePole.x, C.kneePole.y, C.kneePole.z);
      actor.root.localToWorld(this._pole);
      pose.Chain(bones["thigh" + foot.side], bones["calf" + foot.side], bones["foot" + foot.side], foot.point, this._pole);
      const bone = bones["foot" + foot.side];
      pose.Save(bone);
      bone.quaternion.copy(bone.parent.getWorldQuaternion(this._quaternion).invert().multiply(foot.rotation));
    }
    pose.Tilt(bones.chest, -breath * C.breathChestRad, scan * C.chestYawRad, -shift * C.shiftLeanRad);
    // 头让给哨兵层（它装在任务演员身上，摆幅更大）；没有它的人由这里张望。
    if (!rig.missionSentryPose || recovering) {
      pose.Tilt(bones.head, Math.sin(t * TAU * C.headPitchRateHz) * C.headPitchRad,
        recovering ? march.lookYaw : scan * C.headYawRad, 0);
    }
    // 这里**不做**整棵子树的 updateWorldMatrix：那是一趟约 137 个节点的递归，几十个站着的人
    // 同时走就是整帧最大的单项（账在 Script_CharacterModel._GroundInfantryBlend 的头注里）。
    // 本帧还要读骨头的只有 Actor 的枪械挂点与道具挂点，它们走 getWorldPosition（自己往上更新父链）；
    // 渲染前 scene.updateMatrixWorld 会把整棵骨架重算一遍，与 mixer 自己改的骨头同一条路。
    return true;
  }
}

/**
 * 这一帧是不是「站着不动、可以叠待机」。
 * 定格本身由调用方判断（timeScale 为 0），这里只排除姿态被别的系统占着的情况。
 */
export function StandIdleAllowed(soldier, state = {}) {
  const rig = soldier?.actor?.characterRig;
  if (!rig || rig.forcedClip || rig.missionTrainLifeActive) return false;
  if (soldier.alive === false || state.dead || soldier.actor.ragdollState) return false;
  return !state.carryRole && !state.meleeCombat && !state.firing
    && !((state.prone || 0) > 0.35 || (state.crouch || 0) > 0.35)
    && state.grounded !== false;
}
