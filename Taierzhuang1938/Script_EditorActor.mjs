// 人物动作编辑器：十套蒙皮模型的 16 条源动作 + 保留的程序化驱动量摄影棚。
//
// 军人可见动作来自 GLB AnimationClip；Actor 的程序化 state 继续作为游戏状态机、
// 死亡根运动和手动动作试验层。编辑器必须同时把两者列出来，不能用配方名冒充资产。
// 程序化层的每一帧仍由 Actor.Update(dt, state) 里的 state 对象算出来 ——
//   moveSpeed / strafe / crouch / prone / aim / firing / throwing / melee /
//   hurt / dying / dead / lookYaw / lookPitch
// 十三个连续量的组合就是全部「动作」。
//
// 所以这个编辑器的「动作列表」不是资产清单，是**驱动量的配方表**（CLIPS）：
// 每条 clip 就是一个 t → state 的函数。这才是这套系统里可预览的真实单位；
// 列一堆并不存在的 .anim 名字才是骗人。
//
// ## 能读出什么
//   · 换模有没有真的生效（meshSource=model 还是 box —— 静默退回是最常见的事故）
//   · 步频与步幅对不对（1 m 米格 + 支撑相不打滑）
//   · 持枪挂点、贴腮、拉栓时右手的行程
//   · 五个 kind 站一排时的身高差（1.60—1.68 m）与装具差
//   · **子弹判定盒对不对得上这具身体**（见下面「判定」一节）

import * as THREE from "three";
import { Panel, Section, Slider, Chips, Select, Toggle, ButtonRow, Facts, Note, ListBox }
  from "./Script_EditorUi.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { COMBAT } from "./Data_Battle.mjs";
import { CAPSULE } from "./Script_Ai.mjs";
import { KIND_SPEC } from "./Script_Actor.mjs";
import { MarkNoPrepass } from "./Script_Post.mjs";
import {
  DefaultLugouAnimationId,
  GetLugouCharacterVariantEntries,
  GetLugouAnimationEntries,
  IsLugouAnimationAllowed,
} from "./Script_CharacterModel.mjs";

/** 人物 kind → 中文名。KIND_SPEC 的键在 Script_Actor 里，这里只做展示名。 */
const KINDS = [
  { id: "nra", name: "国军步兵", note: "卢沟桥来源国军模型；可逐个查看 4 名士兵" },
  { id: "nraDare", name: "国军敢死队", note: "4 名国军士兵模型 + 背刀骨骼挂点" },
  { id: "nraOfficer", name: "国军军官", note: "国军第 5 套军官模型；身份与手枪由剧情数据表达" },
  { id: "ija", name: "日军步兵", note: "卢沟桥来源日军模型；可逐个查看 4 名士兵" },
  { id: "ijaOfficer", name: "日军军官", note: "日军第 5 套军官模型；身份与手枪由剧情数据表达" },
  { id: "civilian", name: "百姓", note: "包头巾、布鞋、无武器" },
];

const DEFAULT_WEAPON_CHOICE = "__source_default__";

/** 默认配枪只读 Actor 的正式 kind 配置，编辑器不维护第二张会漂移的搭配表。 */
function DefaultWeaponForKind(kind) {
  return KIND_SPEC[kind]?.defaultWeapon ?? null;
}

/** 一个周期性的 0→1→0 脉冲（投弹 / 白刃 / 中弹这类一次性动作靠它循环演示）。 */
function Pulse(t, period, rise = 0.18, hold = 0.10) {
  const k = t % period;
  if (k < rise) return k / rise;
  if (k < rise + hold) return 1;
  const fall = Math.min(period - rise - hold, 0.45);
  if (k < rise + hold + fall) return 1 - (k - rise - hold) / fall;
  return 0;
}

/**
 * 动作配方表。make(t, ctx) 返回**要盖到基础 state 上的那几项**。
 * ctx = { weapon }，射击周期要按这把枪的 fireIntervalS 走。
 */
const CLIPS = [
  { id: "idle", name: "立正 · 待机", make: () => ({}) },
  { id: "look", name: "张望", make: (t) => ({ lookYaw: Math.sin(t * 0.7) * 1.0, lookPitch: Math.sin(t * 0.43) * 0.35 }) },
  { id: "walk", name: "行进", make: () => ({ moveSpeed: 0.34 }) },
  { id: "trot", name: "小跑", make: () => ({ moveSpeed: 0.62 }) },
  { id: "run", name: "冲锋", make: () => ({ moveSpeed: 1.0 }) },
  { id: "strafe", name: "横移", make: (t) => ({ moveSpeed: 0.42, strafe: Math.sin(t * 1.1) }) },
  { id: "crouch", name: "蹲姿", make: () => ({ crouch: 1 }) },
  { id: "crouchWalk", name: "猫腰前进", make: () => ({ crouch: 1, moveSpeed: 0.26 }) },
  { id: "kneelSequence", name: "跪下 → 警戒 → 起身", make: (t) => ({ kneel: t % 8 < 4.5 ? 1 : 0 }) },
  { id: "prone", name: "卧倒", make: () => ({ prone: 1 }) },
  { id: "crawl", name: "匍匐前进", make: () => ({ prone: 1, moveSpeed: 0.12 }) },
  { id: "aim", name: "据枪（贴腮）", make: () => ({ aim: 1 }) },
  {
    id: "fire", name: "据枪射击 + 拉栓",
    make: (t, ctx) => {
      const interval = (ctx.weapon && ctx.weapon.fireIntervalS) || 1.25;
      return { aim: 1, firing: (t % interval) < 0.05 };
    },
  },
  { id: "aimProne", name: "卧姿据枪", make: () => ({ prone: 1, aim: 0.9 }) },
  { id: "throw", name: "投弹", make: (t) => ({ throwing: Pulse(t, 6.0, 0.55, 0.12) }) },
  { id: "melee", name: "白刃突刺 / 劈砍", make: (t) => ({ melee: Pulse(t, 1.8, 0.22, 0.06) }) },
  { id: "hurt", name: "中弹踉跄", make: (t) => ({ hurt: Pulse(t, 2.2, 0.08, 0.16), moveSpeed: 0.1 }) },
  { id: "dying", name: "濒死下沉", make: (t) => ({ dying: Math.min(1, (t % 4) / 2.2) }) },
  { id: "dead", name: "倒地（0.8 s 姿态过渡）", dead: true, make: () => ({ dead: true }) },
];

// ---------------------------------------------------------------------------
// 判定盒的线框
//
// 这一节画的是**规则层真正用的那两个体**，不是"差不多这么大"的示意：
//
//   · 子弹判定球 —— `COMBAT.hitbox`。玩家开枪走 Script_Main.MarchBullet，
//     把弹道切成 0.02 s 一段，逐段量「人到线段的垂距 < radius」。所以人物的
//     命中体是**一个球**，球心从脚底往上量 centerY，**不随姿态、不随身高变**。
//     （AI 之间与 AI 打玩家是概率命中，压根不碰这个球 —— 别拿这里的球去
//     解释"日军怎么打中我的"。）
//   · 移动胶囊 —— `Script_Ai.CAPSULE[stance]`，交给 Rapier 的运动学角色控制器。
//     总高 = 2·halfHeight + 2·radius、球心在脚底往上 radius+halfHeight，
//     算式与 Script_Physics.CharacterBody._MakeCollider 逐字一致。
//
// 两个体都挂在**展台**上而不是挂在 actor.root 底下：root 带着 ±4% 的身高缩放，
// 挂进去的话线框会跟着一起缩，而判定用的是不缩的世界米数 —— 那样画出来的
// 是一个好看的谎。
// ---------------------------------------------------------------------------

/** 判定球：红橙。移动胶囊：靛蓝。两个颜色在土黄色的城里都不会被认成布景。 */
const HITBOX_COLOR = 0xff5a3c;
const CAPSULE_COLOR = 0x49a7ff;
/**
 * 线框一律**自己摆圈**，不走 `WireframeGeometry(SphereGeometry)`。
 *
 * 那条路画出来是一张三角网（连对角线一起画），叠在人身上就是一团红网 ——
 * 判定球到底多高、多宽、压住身上哪一段，一条都读不出来。判定盒的线框要的是
 * 几条能读出尺寸的圈，不是把三角形都描一遍。
 *
 * 下面三个函数都往同一个 out 数组里追加**线段对**（每两点一段），最后一次成几何。
 */

/** 一整圈。plane: "xz" | "xy" | "zy"；center 是这一圈在第三轴上的位置。 */
function PushCircle(out, radius, plane, offset = 0, segments = 40) {
  const At = (a) => {
    const c = Math.cos(a) * radius, s = Math.sin(a) * radius;
    if (plane === "xz") return [c, offset, s];
    if (plane === "xy") return [c, s + offset, 0];
    return [0, s + offset, c];             // "zy"
  };
  for (let i = 0; i < segments; i += 1) {
    out.push(...At((i / segments) * Math.PI * 2), ...At(((i + 1) / segments) * Math.PI * 2));
  }
}

/** 半圈（胶囊的两个帽）。plane "xy" | "zy"，up=true 画上半、false 画下半。 */
function PushCap(out, radius, plane, offset, up, segments = 20) {
  const At = (a) => {
    const c = Math.cos(a) * radius, s = Math.sin(a) * radius * (up ? 1 : -1);
    return plane === "xy" ? [c, s + offset, 0] : [0, s + offset, c];
  };
  for (let i = 0; i < segments; i += 1) {
    out.push(...At((i / segments) * Math.PI), ...At(((i + 1) / segments) * Math.PI));
  }
}

function LineGeometry(points) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(points), 3));
  return geometry;
}

function PushBoneCircle(out, center, axisU, axisV, radius, toLocal, segments = 20) {
  PushBoneEllipse(out, center, axisU, axisV, radius, radius, toLocal, segments);
}

function PushBoneEllipse(out, center, axisU, axisV, radiusU, radiusV, toLocal, segments = 20) {
  const At = (angle) => toLocal(new THREE.Vector3().copy(center)
    .addScaledVector(axisU, Math.cos(angle) * radiusU)
    .addScaledVector(axisV, Math.sin(angle) * radiusV));
  for (let i = 0; i < segments; i += 1) {
    const a = At((i / segments) * Math.PI * 2);
    const b = At(((i + 1) / segments) * Math.PI * 2);
    out.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
}

function PushBoneSphere(out, center, radius, toLocal) {
  PushBoneCircle(out, center, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), radius, toLocal);
  PushBoneCircle(out, center, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), radius, toLocal);
  PushBoneCircle(out, center, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), radius, toLocal);
}

function PushBoneEllipsoid(out, center, axes, radii, toLocal) {
  PushBoneEllipse(out, center, axes.x, axes.y, radii.x, radii.y, toLocal);
  PushBoneEllipse(out, center, axes.x, axes.z, radii.x, radii.z, toLocal);
  PushBoneEllipse(out, center, axes.y, axes.z, radii.y, radii.z, toLocal);
}

function PushBoneCapsule(out, start, end, radius, toLocal) {
  const axis = new THREE.Vector3().subVectors(end, start);
  if (axis.lengthSq() < 1e-8) { PushBoneSphere(out, start, radius, toLocal); return; }
  axis.normalize();
  const reference = Math.abs(axis.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const axisU = new THREE.Vector3().crossVectors(axis, reference).normalize();
  const axisV = new THREE.Vector3().crossVectors(axis, axisU).normalize();
  PushBoneCircle(out, start, axisU, axisV, radius, toLocal);
  PushBoneCircle(out, end, axisU, axisV, radius, toLocal);
  for (let i = 0; i < 4; i += 1) {
    const angle = i * Math.PI * 0.5;
    const offset = new THREE.Vector3().copy(axisU).multiplyScalar(Math.cos(angle) * radius)
      .addScaledVector(axisV, Math.sin(angle) * radius);
    const a = toLocal(new THREE.Vector3().copy(start).add(offset));
    const b = toLocal(new THREE.Vector3().copy(end).add(offset));
    out.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
}

/**
 * 一套判定线框。一个人一套，跟着那个人的落点走。
 *
 * xray（默认开）把 depthTest 关掉：球整个埋在胸腔里，不穿透显示的话
 * 一条线都看不见 —— 而"看不见"和"没画出来"在截图里是同一件事。
 */
class HitboxGizmo {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = "ActorHitboxGizmo";
    this.owned = [];
    this.stance = -1;

    this.hitMaterial = MarkNoPrepass(new THREE.LineBasicMaterial({
      color: HITBOX_COLOR, transparent: true, opacity: 0.9, depthWrite: false,
    }));
    this.capMaterial = MarkNoPrepass(new THREE.LineBasicMaterial({
      color: CAPSULE_COLOR, transparent: true, opacity: 0.75, depthWrite: false,
    }));

    // --- 子弹判定球 ---
    // 三条大圈（三个正交面）+ 上下两条纬圈：五条线就读得出球心与半径，
    // 而且从任何一个机位看过去都有一条圈是正对着的。
    const { radius, centerY } = COMBAT.hitbox;
    const points = [];
    PushCircle(points, radius, "xz", centerY);
    PushCircle(points, radius, "xy", centerY);
    PushCircle(points, radius, "zy", centerY);
    const lat = radius * 0.62;
    const latR = Math.sqrt(Math.max(0, radius * radius - lat * lat));
    PushCircle(points, latR, "xz", centerY + lat, 28);
    PushCircle(points, latR, "xz", centerY - lat, 28);
    // 球心到脚底的那根竖线：centerY 是从脚底往上量的，这根线画的就是那个数
    points.push(0, 0, 0, 0, centerY, 0);
    // 贴地那一圈：球悬在半空，光看球读不出它在地面上压住多大一块
    PushCircle(points, radius, "xz", 0.006);
    this.sphereGroup = new THREE.Group();
    const sphere = new THREE.LineSegments(LineGeometry(points), this.hitMaterial);
    // renderOrder 要写在**网格**上：three 排的是渲染项，Group 上写了不传给孩子。
    // 排到最后画，线框才不会被同样关了深度测试的别的半透明东西盖住。
    sphere.renderOrder = 12;
    this.sphereGroup.add(sphere);
    this.owned.push(sphere.geometry);
    this.root.add(this.sphereGroup);

    // 正式判定体每帧从 Actor 的骨骼世界坐标重建。只在编辑器里做这份线框，
    // 游戏弹道直接读同一批 shape，不依赖可视化几何。
    this.boneGeometry = LineGeometry([]);
    this.boneLines = new THREE.LineSegments(this.boneGeometry, this.hitMaterial);
    this.boneLines.renderOrder = 12;
    this.boneGroup = new THREE.Group();
    this.boneGroup.add(this.boneLines);
    this.root.add(this.boneGroup);
    this.hasBoneHitboxes = false;
    this.hitboxVisible = true;

    // --- 移动胶囊（姿态一换就重建，见 SetStance） ---
    this.capsuleGroup = new THREE.Group();
    this.capsuleGroup.visible = false;
    this.root.add(this.capsuleGroup);
    this.capsule = null;

    this.SetXray(true);
  }

  /** stance: 0 站 / 1 蹲 / 2 卧。尺寸与摆位算式与 CharacterBody._MakeCollider 一致。 */
  SetStance(stance) {
    const index = Math.max(0, Math.min(CAPSULE.length - 1, stance | 0));
    if (index === this.stance) return this;
    this.stance = index;
    if (this.capsule) {
      this.capsuleGroup.remove(this.capsule);
      this.capsule.geometry.dispose();
      this.capsule = null;
    }
    const { radius, height } = CAPSULE[index];
    const halfHeight = Math.max(0.02, height * 0.5 - radius);
    const mid = radius + halfHeight;            // 胶囊中心离脚底的高（刚体原点在脚底）
    const top = mid + halfHeight;
    const bottom = mid - halfHeight;
    const points = [];
    PushCircle(points, radius, "xz", top);
    PushCircle(points, radius, "xz", bottom);
    PushCircle(points, radius, "xz", mid, 28);
    for (const [dx, dz] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]]) {
      points.push(dx, bottom, dz, dx, top, dz);
    }
    PushCap(points, radius, "xy", top, true);
    PushCap(points, radius, "zy", top, true);
    PushCap(points, radius, "xy", bottom, false);
    PushCap(points, radius, "zy", bottom, false);
    const mesh = new THREE.LineSegments(LineGeometry(points), this.capMaterial);
    mesh.renderOrder = 11;
    this.capsuleGroup.add(mesh);
    this.capsule = mesh;
    return this;
  }

  SetHitboxVisible(on) {
    this.hitboxVisible = !!on;
    this.sphereGroup.visible = this.hitboxVisible && !this.hasBoneHitboxes;
    this.boneGroup.visible = this.hitboxVisible && this.hasBoneHitboxes;
    return this;
  }
  SetCapsuleVisible(on) { this.capsuleGroup.visible = !!on; return this; }

  SetXray(on) {
    for (const material of [this.hitMaterial, this.capMaterial]) {
      material.depthTest = !on;
      material.needsUpdate = true;
    }
    return this;
  }

  UpdateFromActor(actor) {
    const shapes = actor?.GetBoneHitboxes?.() || [];
    this.hasBoneHitboxes = shapes.length > 0;
    this.sphereGroup.visible = this.hitboxVisible && !this.hasBoneHitboxes;
    this.boneGroup.visible = this.hitboxVisible && this.hasBoneHitboxes;
    if (!this.hasBoneHitboxes) return this;
    this.root.updateWorldMatrix(true, false);
    const points = [];
    const ToLocal = (point) => this.root.worldToLocal(new THREE.Vector3().copy(point));
    for (const shape of shapes) {
      if (shape.type === "ellipsoid") {
        PushBoneEllipsoid(points, shape.center, shape.worldAxes, shape.worldRadii, ToLocal);
      } else if (shape.type === "sphere") PushBoneSphere(points, shape.center, shape.worldRadius, ToLocal);
      else PushBoneCapsule(points, shape.start, shape.end, shape.worldRadius, ToLocal);
    }
    this.boneGeometry.setAttribute("position",
      new THREE.BufferAttribute(new Float32Array(points), 3));
    this.boneGeometry.computeBoundingSphere();
    return this;
  }

  Dispose() {
    if (this.capsule) this.capsule.geometry.dispose();
    this.boneGeometry.dispose();
    for (const geometry of this.owned) geometry.dispose();
    this.hitMaterial.dispose();
    this.capMaterial.dispose();
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}

/** 当前驱动量对应的姿态档。AI 那边是 s.stance，摄影棚里只有 crouch/prone 两个连续量。 */
function StanceOf(state) {
  if ((state.prone ?? 0) >= 0.5) return 2;
  if ((state.crouch ?? 0) >= 0.5) return 1;
  return 0;
}

/** 导入 clip 没有程序化 crouch/prone 量，姿态档必须按动作语义补上。 */
function ImportedClipStance(clipId, action = null) {
  if (clipId === "StandFireCrouch") return 2;
  const progress = action ? action.time / action.getClip().duration : 0;
  if (clipId === "StandToKneel") return progress > .45 ? 1 : 0;
  if (clipId === "KneelToStand") return progress < .55 ? 1 : 0;
  if ([
    "RifleIdle", "RifleIdleAlt", "CrouchFire", "CrouchFireAlt", "CrouchIdle",
    "MachineGunFire", "EmplacementIdle", "AdvanceKneelFire",
    "RifleCrouchAdvance", "KneelHold",
  ].includes(clipId)) return 1;
  return 0;
}

export class ActorEditor {
  static id = "actor";
  static label = "人物动作";
  static hint = "预览十套原模型、骨骼动作与连续姿态切换";

  constructor(host) {
    this.host = host;
    this.studio = host.studio;
    this.panel = null;
    this.cameraMode = "studio";

    this.kind = "nra";
    // undefined = 按每个人物 kind 的正式默认；null = 用户明确选择空手。
    // 分开记这两种状态，本阵营对比才能逐身份配枪，又允许一键换成同一把枪。
    this.weaponOverride = undefined;
    this.weaponId = DefaultWeaponForKind(this.kind);
    this.animationMode = "imported";
    // 默认预览动作走 DefaultLugouAnimationId：它既过角色适用性这道闸，又按
    // LUGOU_POSE_CLIPS 的**语义**挑站姿（不是按 clip 名字硬写 —— RifleIdle 实为跪姿）。
    this.clipId = DefaultLugouAnimationId(this.kind);
    this.modelVariant = GetLugouCharacterVariantEntries(this.kind)[0]?.modelVariant ?? null;
    this.seed = 3;
    this.speed = 1;
    this.playing = true;
    this.lineup = false;      // 当前阵营四名士兵 + 一名军官
    this.towel = null;        // null = 按 kind 的默认
    this.manual = false;
    this.time = 0;

    this.actors = [];
    this.gizmos = [];
    this.showHitbox = true;   // 判定球出厂就开：这一栏存在的理由就是它
    this.showCapsule = false;
    this.xray = true;
    this.stance = 0;
    this.manualState = {
      moveSpeed: 0, strafe: 0, crouch: 0, prone: 0, aim: 0,
      throwing: 0, melee: 0, hurt: 0, dying: 0, lookYaw: 0, lookPitch: 0, firing: false,
    };
    this.sliders = {};
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  Enter(root) {
    this.studio.Open(this.host.hideInStudio);
    this.studio.Frame(1.7, 3.4);
    this.panel = Panel({
      title: "人物动作编辑器", sub: "Script_Actor",
      variant: "work", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.Rebuild();
    return this;
  }

  Exit() {
    this.DisposeActors();
    if (this.panel) this.panel.root.remove();
    this.panel = null;
    this.studio.Close();
  }

  // -------------------------------------------------------------------------
  // 界面
  // -------------------------------------------------------------------------

  BuildUi(body) {
    // --- 人物 ---
    const who = Section(body, "人物");
    this.kindList = ListBox(who, {
      height: 136,
      onPick: (id) => {
        this.kind = id;
        this.modelVariant = GetLugouCharacterVariantEntries(id)[0]?.modelVariant ?? null;
        this.SyncResolvedWeapon();
        this.FillModelList();
        this.NormalizeImportedClip();
        this.FillActionList();
        this.Rebuild();
      },
    });
    this.kindList.Fill(KINDS.map((k) => ({ id: k.id, name: k.name, tail: k.id, title: k.note })));
    this.kindList.Select(this.kind);
    this.kindNote = Note(who, KINDS[0].note);

    this.weaponSelect = Select(who, "武器",
      [{ value: DEFAULT_WEAPON_CHOICE, label: "（按人物源配置）" },
        { value: "", label: "（空手）" },
        ...Object.keys(WEAPONS).map((id) => ({ value: id, label: `${WEAPONS[id].name}  ${id}` }))],
      DEFAULT_WEAPON_CHOICE, (v) => this.SetWeaponChoice(v));
    Note(who, "默认按 Script_Actor 的人物配置配枪；选择具体武器后会立即替换当前人物，本阵营对比时会替换五人。", true);

    this.modelSelect = Select(who, "源模型", [], "", (value) => {
      this.modelVariant = Number(value);
      this.Rebuild();
    });
    this.FillModelList();

    Slider(who, {
      label: "个体种子", min: 0, max: 40, step: 1, value: this.seed,
      format: (v) => v.toFixed(0),
      onInput: (v) => { this.seed = v; this.Rebuild(); },
    });
    const opts = document.createElement("div");
    opts.className = "edBtns";
    who.appendChild(opts);
    Toggle(opts, "白毛巾", false, (on) => { this.towel = on; this.ApplyTowel(); });
    Toggle(opts, "本阵营 4兵+1官对比", false, (on) => { this.lineup = on; this.Rebuild(); });
    Toggle(opts, "米格", true, (on) => this.studio.SetGridVisible(on));

    // --- 判定盒 ---
    const box = Section(body, "判定（碰撞盒）");
    const boxBtns = document.createElement("div");
    boxBtns.className = "edBtns";
    box.appendChild(boxBtns);
    Toggle(boxBtns, "子弹判定盒", this.showHitbox, (on) => {
      this.showHitbox = on;
      for (const gizmo of this.gizmos) gizmo.SetHitboxVisible(on);
    });
    Toggle(boxBtns, "移动胶囊", this.showCapsule, (on) => {
      this.showCapsule = on;
      for (const gizmo of this.gizmos) gizmo.SetCapsuleVisible(on);
    });
    Toggle(boxBtns, "穿透显示", this.xray, (on) => {
      this.xray = on;
      for (const gizmo of this.gizmos) gizmo.SetXray(on);
    });
    Note(box, "红色 = 头、躯干、双臂、双腿的随骨骼命中体；"
      + "蓝胶囊 = Rapier 移动碰撞。两套职责互不相干。");
    Note(box, "GLB 加载失败时红色命中体才回退为 COMBAT.hitbox 固定球。", true);

    // --- 动作 ---
    const act = Section(body, "动作（资产与程序化）");
    Chips(act, [
      { value: "imported", label: "导入动作（按角色过滤）" },
      { value: "programmatic", label: "程序化配方" },
    ], this.animationMode, (value) => {
      this.animationMode = value;
      this.manual = false;
      this.clipId = value === "imported" ? DefaultLugouAnimationId(this.kind) : "idle";
      this.FillActionList();
      this.Rebuild();
    });
    this.clipList = ListBox(act, {
      height: 168,
      onPick: (id) => this.SetClip(id),
    });
    this.importedClipNote = Note(act, "导入动作仅列出当前角色可用的阵营与身份；不会跨阵营或把士兵动作套给军官。", true);
    this.FillActionList();

    ButtonRow(act, [
      { label: "▶ / ⏸", onClick: () => { this.playing = !this.playing; } },
      { label: "重演", onClick: () => this.Rebuild() },
      { label: "单帧", onClick: () => { this.playing = false; this.Step(1 / 30); } },
    ]);
    Slider(act, {
      label: "播放速度", min: 0.05, max: 2, step: 0.05, value: 1,
      onInput: (v) => { this.speed = v; },
    });

    // --- 手动调参 ---
    const man = Section(body, "手动调参");
    Chips(man, [{ value: "clip", label: "按配方" }, { value: "manual", label: "手动" }],
      "clip", (v) => {
        this.manual = v === "manual";
        if (this.manual) this.animationMode = "programmatic";
      });
    const S = (key, label, min, max) => {
      this.sliders[key] = Slider(man, {
        label, min, max, step: 0.01, value: this.manualState[key],
        onInput: (v) => { this.manualState[key] = v; },
      });
    };
    S("moveSpeed", "移动", 0, 1);
    S("strafe", "横移", -1, 1);
    S("crouch", "下蹲", 0, 1);
    S("prone", "卧倒", 0, 1);
    S("aim", "据枪", 0, 1);
    S("throwing", "投弹", 0, 1);
    S("melee", "白刃", 0, 1);
    S("hurt", "中弹", 0, 1);
    S("dying", "濒死", 0, 1);
    S("lookYaw", "看 · 偏航", -1.4, 1.4);
    S("lookPitch", "看 · 俯仰", -1.0, 0.9);
    Toggle(man, "扣扳机", false, (on) => { this.manualState.firing = on; });

    // --- 读数 ---
    const info = Section(body, "取证");
    this.facts = Facts(info);
    Note(info, "meshSource 应为 glb:Lugou…；出现 box/model 表示角色 GLB 没有接入。", true);
  }

  FillActionList() {
    if (!this.clipList) return;
    const entries = this.animationMode === "imported"
      ? GetLugouAnimationEntries(this.kind).map((clip) => ({
        id: clip.id,
        name: `${clip.name} · ${clip.id}`,
        tail: clip.targetLabel,
        title: clip.corrected
          ? `仅适用于${clip.targetLabel}；原 ${clip.id} 姿态异常，校正为同骨架 ${clip.playbackClipId} 曲线`
          : `仅适用于${clip.targetLabel}；使用${clip.faction === "nra" ? "国军" : "日军"}原始骨架烘焙的曲线`,
      }))
      : CLIPS.map((clip) => ({ id: clip.id, name: clip.name }));
    if (this.animationMode === "imported") {
      this.NormalizeImportedClip();
      const profile = GetLugouAnimationEntries(this.kind)[0];
      if (this.importedClipNote) {
        this.importedClipNote.textContent = profile
          ? `当前：${profile.targetLabel}。只显示该角色的 ${GetLugouAnimationEntries(this.kind).length} 条动作；曲线只从本阵营模型播放。`
          : "百姓没有导入军人动作；请切换到程序化配方预览。";
      }
    }
    this.clipList.Fill(entries);
    this.clipList.Select(this.clipId);
  }

  FillModelList() {
    if (!this.modelSelect) return;
    const variants = GetLugouCharacterVariantEntries(this.kind);
    this.modelSelect.Fill(variants.map((entry) => ({
      value: String(entry.modelVariant),
      label: entry.role === "officer"
        ? `军官 · ${entry.modelId}`
        : `士兵 ${entry.modelNumber} · ${entry.modelId}`,
    })));
    if (!variants.some((entry) => entry.modelVariant === this.modelVariant)) {
      this.modelVariant = variants[0]?.modelVariant ?? null;
    }
    this.modelSelect.Set(String(this.modelVariant ?? ""));
  }

  NormalizeImportedClip() {
    if (this.animationMode !== "imported") return;
    if (!IsLugouAnimationAllowed(this.kind, this.clipId)) {
      this.clipId = DefaultLugouAnimationId(this.kind);
    }
  }

  SetClip(id) {
    if (this.animationMode === "imported" && !IsLugouAnimationAllowed(this.kind, id)) {
      this.NormalizeImportedClip();
      this.FillActionList();
      return;
    }
    this.clipId = id;
    this.time = 0;
    if (this.animationMode === "imported") {
      this.PlayImportedClipForCompatibleActors();
      return;
    }
    const clip = CLIPS.find((c) => c.id === id);
    // 倒地是一次性状态机（Actor 内部有 ragdollState），换到它要重建才能从头演
    if (clip && clip.dead) this.Rebuild();
  }

  /** 一排对比时也逐人复核，杜绝把当前角色的曲线送给另一阵营/身份。 */
  PlayImportedClipForCompatibleActors() {
    for (const actor of this.actors) {
      if (IsLugouAnimationAllowed(actor.kind, this.clipId)) actor.PlayImportedAnimation(this.clipId);
      else actor.ClearImportedAnimation();
    }
  }

  ApplyTowel() {
    if (this.towel == null) return;
    for (const actor of this.actors) actor.SetTowel(this.towel);
  }

  WeaponForKind(kind) {
    return this.weaponOverride === undefined
      ? DefaultWeaponForKind(kind)
      : this.weaponOverride;
  }

  SyncResolvedWeapon() {
    this.weaponId = this.WeaponForKind(this.kind);
    if (this.weaponSelect) {
      const value = this.weaponOverride === undefined
        ? DEFAULT_WEAPON_CHOICE
        : (this.weaponOverride || "");
      this.weaponSelect.Set(value);
    }
  }

  SetWeaponChoice(value) {
    this.weaponOverride = value === DEFAULT_WEAPON_CHOICE ? undefined : (value || null);
    this.SyncResolvedWeapon();
    this.Rebuild();
  }

  // -------------------------------------------------------------------------
  // 展台
  // -------------------------------------------------------------------------

  DisposeActors() {
    for (const actor of this.actors) {
      if (actor.root.parent) actor.root.parent.remove(actor.root);
      actor.Dispose();
    }
    this.actors.length = 0;
    for (const gizmo of this.gizmos) gizmo.Dispose();
    this.gizmos.length = 0;
    this.stance = 0;
  }

  Rebuild() {
    this.DisposeActors();
    this.studio.ClearStand();
    this.time = 0;
    const factory = this.host.actorFactory;
    if (!factory) return;
    const faction = this.kind.startsWith("ija") ? "ija" : "nra";
    const soldierKind = faction === "ija" ? "ija" : "nra";
    const officerKind = faction === "ija" ? "ijaOfficer" : "nraOfficer";
    const list = this.lineup
      ? [
        ...GetLugouCharacterVariantEntries(soldierKind).map(({ modelVariant }) => ({ kind: soldierKind, modelVariant })),
        ...GetLugouCharacterVariantEntries(officerKind).map(({ modelVariant }) => ({ kind: officerKind, modelVariant })),
      ]
      : [{ kind: this.kind, modelVariant: this.modelVariant }];
    const span = 1.15;
    list.forEach((entrySpec, i) => {
      const kind = entrySpec.kind;
      const weapon = this.WeaponForKind(kind);
      const actor = factory.Create(kind, {
        seed: this.seed + i * 7,
        weapon,
        modelVariant: entrySpec.modelVariant,
      });
      actor.root.position.x = (i - (list.length - 1) / 2) * span;
      this.studio.stand.add(actor.root);
      this.actors.push(actor);
      // 判定线框与人是兄弟，不是儿子 —— root 带 ±4% 身高缩放，挂进去就跟着缩了
      const gizmo = new HitboxGizmo();
      gizmo.root.position.x = actor.root.position.x;
      gizmo.SetHitboxVisible(this.showHitbox);
      gizmo.SetCapsuleVisible(this.showCapsule);
      gizmo.SetXray(this.xray);
      gizmo.SetStance(this.stance);
      this.studio.stand.add(gizmo.root);
      this.gizmos.push(gizmo);
    });
    if (this.towel != null) this.ApplyTowel();
    const entry = KINDS.find((k) => k.id === this.kind);
    if (this.kindNote && entry) this.kindNote.textContent = entry.note;
    this.studio.Frame(1.75, this.lineup ? 6.4 : 3.4);
    this.Step(0);
  }

  /** 推一帧姿态。playing=false 时 Update(dt) 里只走这一条（供单帧按钮用）。 */
  Step(dt) {
    this.time += dt;
    const clip = CLIPS.find((c) => c.id === this.clipId) || CLIPS[0];
    const activeWeaponId = this.actors[0]?.weaponId ?? this.weaponId;
    const ctx = { weapon: activeWeaponId ? WEAPONS[activeWeaponId] : null };
    for (let i = 0; i < this.actors.length; i += 1) {
      const actor = this.actors[i];
      const base = {
        moveSpeed: 0, strafe: 0, crouch: 0, prone: 0, aim: 0,
        throwing: 0, melee: 0, hurt: 0, dying: 0, firing: false,
        lookYaw: 0, lookPitch: 0, elapsed: this.time,
      };
      // 一排人时给每个人一点相位差，不然五个人像广播体操
      const local = this.time + (this.lineup ? i * 0.37 : 0);
      const state = this.manual
        ? { ...base, ...this.manualState, elapsed: local }
        : this.animationMode === "imported"
          ? base
          : { ...base, ...clip.make(local, ctx), elapsed: local };
      if (this.animationMode === "imported" && !this.manual
        && IsLugouAnimationAllowed(actor.kind, this.clipId)) actor.PlayImportedAnimation(this.clipId);
      else actor.ClearImportedAnimation();
      actor.Update(dt, state);
      // 判定线框跟着这个人的落点；胶囊还要跟着姿态换尺寸（AI 那边是 s.stance）
      const gizmo = this.gizmos[i];
      if (gizmo) {
        gizmo.root.position.copy(actor.root.position);
        gizmo.SetStance(this.animationMode === "imported" && !this.manual
          ? ImportedClipStance(this.clipId, actor.characterRig?.currentAction)
          : StanceOf(state));
        gizmo.UpdateFromActor(actor);
        if (i === 0) this.stance = gizmo.stance;
      }
    }
  }

  Update(dt) {
    const step = this.playing ? dt * this.speed : 0;
    this.Step(step);
    // 阴影框跟着展台走：不挪的话太阳的正交框还钉在玩家上一次站的地方，
    // 摄影棚里一个影子都没有（而这恰恰是判断姿态对不对最有用的一条线索）
    if (this.host.lights) {
      this.host.lights.UpdateShadowFrustum(
        new THREE.Vector3(0, 0.9, 0),
        new THREE.Vector3(0, 0, -1));
    }
    this.RefreshFacts();
  }

  RefreshFacts() {
    const actor = this.actors[0];
    if (!actor || !this.facts) return;
    let meshes = 0;
    let triangles = 0;
    actor.root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      meshes += 1;
      const index = o.geometry.index;
      const position = o.geometry.attributes.position;
      triangles += (index ? index.count : (position ? position.count : 0)) / 3;
    });
    const activeWeaponId = actor.weaponId || null;
    const weapon = activeWeaponId ? WEAPONS[activeWeaponId] : null;
    const built = activeWeaponId && this.host.actorFactory
      ? this.host.actorFactory.WeaponGeometry(activeWeaponId, actor.weaponVariant) : null;
    this.facts.Set("kind", actor.kind);
    this.facts.Set("身高", `${actor.height.toFixed(3)} m`);
    this.facts.Set("meshSource", actor.meshSource,
      actor.usingRiggedCharacter ? "good" : "bad");
    this.facts.Set("角色模型", actor.modelId || "未载入",
      actor.modelId ? "good" : "bad");
    this.facts.Set("源模型", actor.modelVariant == null ? "—" : `${actor.modelId || `外观 ${actor.modelVariant + 1}`} · ${actor.kind.includes("Officer") ? "军官" : "士兵"}`);
    this.facts.Set("网格 / 三角", `${meshes} / ${Math.round(triangles)}`);
    const weaponMode = this.weaponOverride === undefined ? "源配置" : "手动替换";
    this.facts.Set("武器", weapon ? `${weapon.name}（${weapon.kind} · ${weaponMode}）` : `空手（${weaponMode}）`);
    if (built) this.facts.Set("武器几何", built.source, built.source === "model" ? "good" : "bad");
    const importedEntry = this.animationMode === "imported"
      ? GetLugouAnimationEntries(this.kind).find((entry) => entry.id === this.clipId) : null;
    this.facts.Set("动作", this.manual ? "程序化手动"
      : importedEntry ? `${importedEntry.targetLabel} · ${importedEntry.name}` : `${this.animationMode} · ${this.clipId}`);
    if (importedEntry) this.facts.Set("动作适用对象", `${importedEntry.targetLabel} · ${importedEntry.faction === "nra" ? "国军源骨架" : "日军源骨架"}`, "good");
    this.facts.Set("姿态校正", importedEntry?.corrected
      ? `${importedEntry.id} → ${importedEntry.playbackClipId} · 去除 59° 异常前倾`
      : "无", importedEntry?.corrected ? "good" : "");
    const boneHitboxes = actor.GetBoneHitboxes?.() || [];
    this.facts.Set("骨骼命中体", boneHitboxes.length ? `${boneHitboxes.length} 个 · 实时随骨骼` : "保底固定球",
      boneHitboxes.length ? "good" : "warn");
    const cap = CAPSULE[this.stance] || CAPSULE[0];
    const stanceName = this.stance === 2 ? "卧" : this.stance === 1 ? "蹲" : "站";
    this.facts.Set("移动胶囊",
      `${stanceName} · r ${cap.radius.toFixed(2)} m · 高 ${cap.height.toFixed(2)} m`);
    this.facts.Set("命中部位", boneHitboxes.length ? "头 / 躯干 / 四肢" : "躯干保底");
    this.facts.Set("时间", `${this.time.toFixed(2)} s`);
  }
}

export default ActorEditor;
