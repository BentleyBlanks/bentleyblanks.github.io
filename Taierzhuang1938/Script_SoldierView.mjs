// 士兵的画面那一半（docs/Data_EnemyAi.md §23）：把 AI 算好的「在哪、朝哪、什么姿态」交给 3D 人物 ——
// 摆位置朝向、出生时挂进场景、按镜头视锥剔除、近景完整人物 / 远景合批层切换、驱动人物动画。
//
// 以前这些写在 Script_Ai 的决策代码中间（AI 一边想事情一边亲手摆模型）。搬出来之后 Script_Ai 只管规则，
// 在原来那几处改调 `this.view.*`，所以同一帧里的先后一点没变（开火闸门读枪口方向要的是这一帧的姿势）。
// AiDirector 上的 ActorAnimate / CullActors / PrepareCrowd / _SetDetailedAttached 留着转发，外部调用照旧。
// 远景层（ActorCrowd）仍挂在 `ai.crowd` 上（测试与第一关驾驶脚本按它读）。
// 移植 UE 时这一层整个换成 Character 的骨骼网格、动画蓝图与 significance 剔除。

import * as THREE from "three";
import { ActorCrowd } from "./Script_ActorCrowd.mjs";
import { ACTOR_DETAIL } from "./Data_Tuning_Ai.mjs";

// 人物 LOD 的距离预算在 `Data_Tuning_Ai.ACTOR_DETAIL`。这三个是复用的临时对象，不是调参。
const _cullFrustum = new THREE.Frustum();
const _cullMatrix = new THREE.Matrix4();
const _cullSphere = new THREE.Sphere(new THREE.Vector3(), ACTOR_DETAIL.boundRadiusM);

export class SoldierView {
  /** @param {object} director 它服务的 AiDirector（读 soldiers / time / ctx，远景层挂在 director.crowd）。 */
  constructor(director) { this.ai = director; }

  /** 出生：人物摆到出生点并挂进场景。 */
  Attach(s) { s.actor.root.position.copy(s.position); this.ai.ctx.scene.add(s.actor.root); }

  /** 移除：人物摘下场景并回收。 */
  Detach(s) { this.ai.ctx.scene.remove(s.actor.root); s.actor.Dispose(); }

  /** 每帧：人物跟上 AI 的位置与朝向。 */
  Place(s) { s.actor.root.position.copy(s.position); s.actor.root.rotation.y = s.yaw; }

  /** 尸体：位置 + 贴地的俯仰 / 侧倾（StepCorpse 平滑过的那份）。 */
  PlaceCorpse(s) { s.actor.root.position.copy(s.position); s.actor.root.rotation.set(s.corpseTiltX, s.yaw, s.corpseTiltZ, "YXZ"); }

  /**
   * 枪口能不能从人物模型上读（UpdateMuzzle 用）：骨架这一帧在更新（没被剔除 / 远景层接手），
   * 且模型位置与 AI 的位置差在 syncM 以内（规则层直调 TryFire 时人被瞬移过、模型还停在原处）。
   */
  MuzzleReadable(s, syncM) {
    const root = s.actor?.root;
    if (!root || !root.visible) return false;
    const dx = root.position.x - s.position.x, dy = root.position.y - s.position.y, dz = root.position.z - s.position.z;
    return dx * dx + dy * dy + dz * dz <= syncM * syncM;
  }

  /** 完整人物这一帧在不在画面里（剔除 / 远景层接手时为 false）：动画分档按它跳帧。 */
  Shown(s) { return s.actor.root.visible; }

  /**
   * 人物动画与蒙皮解算的统一入口。
   *
   * Act 这条链上的六处 `s.actor.Update(` 全部走这里，为的是把它单独记成
   * `ai/act/anim` 子桶 —— 车厢机位实测「AI 16 ms」里的大头就是这一项，
   * 混在 ai 一个数字里谁也看不出来。除了计时这里什么都不做；剖析器关着时
   * 是一次布尔检查。尸体那一处不走这里：它归 `ai/corpse`（见 Update 的循环）。
   */
  Animate(s, dt, options) {
    const profiler = this.ai.ctx.profiler;
    // 剖析器关着（正式玩家路径）就是一次布尔检查 + 直调，连 try/finally 都不进。
    if (!profiler || !profiler.on) { s.actor.Update(dt, options); return; }
    profiler.B("ai/act/anim");
    try { s.actor.Update(dt, options); }
    finally { profiler.E("ai/act/anim"); }
  }

  /** 尸体的倒地 / 下垂姿势（不进 ai/act/anim 子桶：它归 ai/corpse，见 AiDirector.Update 的尸体循环）。 */
  AnimateCorpse(s, dt, options) { s.actor.Update(dt, options); }

  /**
   * 只剔除真正落在镜头视锥外的人。视锥内不分阵营、不分生死、不设数量名额；
   * 只按投影尺寸近似值（距离）选完整 Actor / 合批远景层。
   */
  Cull(camera) {
    if (!camera) return;
    // 视图矩阵自己从 matrixWorld 求，**不要用 camera.matrixWorldInverse** ——
    // 那个只在 renderer.render() 里更新，剔除跑在逻辑帧里，读到的是上一帧的机位。
    // 平时差一帧看不出来，换关/过场刚把相机瞬移过去的那一帧就是整批人闪一下。
    // 只要相机自己的矩阵：`updateMatrixWorld()` 会连相机底下那棵第一人称树
    // （枪、双臂、袖子，一百来个节点）一起重算，这里一个都用不上。
    camera.updateWorldMatrix(true, false);
    _cullMatrix.copy(camera.matrixWorld).invert().premultiply(camera.projectionMatrix);
    _cullFrustum.setFromProjectionMatrix(_cullMatrix);
    const crowd = this.Crowd();
    if (crowd) crowd.Begin();
    for (const s of this.ai.soldiers) {
      if (!s.actor) continue;
      // 包围球取胸口高度：脚下那个点在贴地俯视时会掉出视锥，人整个闪掉
      _cullSphere.center.set(s.position.x, s.position.y + 0.9, s.position.z);
      if (!_cullFrustum.intersectsSphere(_cullSphere)) {
        this.ai._SetDetailedAttached(s.actor, false);
        s.actor.SetCrowdHitboxes?.(null);
        s.actor.allowFootIk = false;
        s.renderLod = "culled";
        continue;
      }
      const distanceSq = s.position.distanceToSquared(camera.position);
      s.actor.renderDistanceSq = distanceSq;
      s.actor.allowFootIk = distanceSq <= ACTOR_DETAIL.footIkM ** 2 || s.stance === 2 || s.proneBlend > .45;
      s.actor.SetShadowEnabled(distanceSq <= ACTOR_DETAIL.shadowM ** 2);
      const settledCorpse = !s.alive && s.deadTime >= 0.9;
      // 远景层里的尸体有距离上限（ACTOR_DETAIL.corpseCrowdMaxM 那段账）；活人没有。
      if (settledCorpse && distanceSq > ACTOR_DETAIL.corpseCrowdMaxM * ACTOR_DETAIL.corpseCrowdMaxM) {
        this.ai._SetDetailedAttached(s.actor, false);
        s.actor.SetCrowdHitboxes?.(null);
        s.actor.allowFootIk = false;
        s.renderLod = "culled";
        continue;
      }
      const detailLimit = settledCorpse
        ? (s.renderLod === "detail" ? ACTOR_DETAIL.corpseExitM : ACTOR_DETAIL.corpseEnterM)
        : (s.renderLod === "detail" ? ACTOR_DETAIL.exitM : ACTOR_DETAIL.enterM);
      // 纯逻辑测试没有 scene/factory，没有远景层可以接手时必须回退完整 Actor。
      // **断过肢的人不进远景层**：远景层是按姿势桶烘的整人（见 ActorCrowd 的头注），
      // 换过去等于把卸掉的胳膊长回来 —— 四十米外的尸体会突然肢体齐全。
      // 距离更远时仍按 corpseCrowdMaxM 整个剔除，那一条不受影响。
      const detailed = !crowd || !!s.gore || distanceSq <= detailLimit * detailLimit;
      this.ai._SetDetailedAttached(s.actor, detailed);
      s.renderLod = detailed ? "detail" : "crowd";
      if (detailed) s.actor.SetCrowdHitboxes?.(null);
      if (!detailed) {
        const prone = Math.max(s.proneBlend ?? 0, s.stance === 2 ? 1 : 0);
        // 姿态与移动信号一并交给远景层，让它挑姿势桶（站 / 跪 / 真卧 / 跑步翻页）。
        // 【为什么补这一条】2026-09-09 实拍：前沿开战 20 s，46—74 m 那一档 31 个日军
        // 里 20 个其实在跪射，画面上却全是站着的 —— 远景层收到的只有「卧不卧」，
        // 蹲和跑一个字都没往下传。玩家说的「远处的敌人干站着」有一半是这一行的账。
        //
        // The shared distance clock advances even while the skeleton is culled;
        // wall-clock time must not make a blocked or slowing crowd keep running.
        const bucket = crowd.Push(s.actor.kind, s.position, s.yaw ?? 0, s.actor.sizeScale ?? 1, prone, !s.alive,
          { stance: s.stance | 0, moveSpeed: s.moveSpeed ?? 0, crouch: s.crouchBlend ?? 0,
            phase: s.actor.characterRig?.locomotion.crowdPhase,
            pronePhase: s.actor.characterRig?.locomotion.crowdPronePhase,
            moveSpeedMps: s.actor.characterRig?.locomotion.crowdSpeedMps,
            elapsed: this.ai.time, jitter: s.id * 0.37 });
        // 命中体跟着画出来的姿势桶走（骨架此刻是冻住的，见 Actor.SetCrowdHitboxes）。
        s.actor.SetCrowdHitboxes?.(bucket?.hitboxes, crowd.LastTransform);
      }
    }
    if (crowd) crowd.End();
  }

  /**
   * 完整人物进远景 LOD / 屏外时，不只设 invisible，还从场景树摘下整棵分件子树。
   * three 的 updateMatrixWorld 与 projectObject 都会递归 invisible 子树：69 个人约四千
   * 节点，即使画面里只有几个人也曾经每帧全走一遍。远景画面由 ActorCrowd 接手，
   * 逻辑位姿仍写 actor.root；回到近景时挂回同一 scene，本帧统一更新世界矩阵。
   */
  SetDetailedAttached(actor, detailed) {
    const root = actor?.root;
    if (!root) return;
    const scene = this.ai.ctx.scene;
    // 回到近景的上升沿：屏外那几帧动画层跳过了脚底求解与整棵世界矩阵更新
    // （见 Script_FirstLevelCarriageAnimation.Sample），下一次采样要补做一次完整的。
    if (detailed && (!root.visible || !root.parent)) actor.poseDirty = true;
    root.visible = !!detailed;
    if (!scene) return;
    if (detailed) {
      if (!root.parent) scene.add(root);
    } else if (root.parent === scene) {
      scene.remove(root);
    }
  }

  /**
   * 进关时先把这些 kind 的远景层烘出来（见 ActorCrowd.Prepare）。
   * 装配层的人物着色器预热调它；纯逻辑环境（没有 scene / factory）是空操作。
   */
  PrepareCrowd(kinds = [], cellM = 0) {
    if((this.ai.crowd?.cellM||0)!==cellM){this.ai.crowd?.Dispose();this.ai.crowd=undefined;}
    this.ai.crowdCellM=cellM;
    const crowd = this.Crowd();
    if (crowd) crowd.Prepare(kinds);
    return crowd;
  }

  Crowd() {
    if (this.ai.crowd !== undefined) return this.ai.crowd;
    const { scene, actorFactory } = this.ai.ctx;
    this.ai.crowd = (scene && actorFactory) ? new ActorCrowd(scene, actorFactory,{cellM:this.ai.crowdCellM||0}) : null;
    return this.ai.crowd;
  }

  /** 换关：远景层整个丢掉，下一关按需重建。 */
  DisposeCrowd() { if (this.ai.crowd) this.ai.crowd.Dispose(); this.ai.crowd = undefined; }
}
