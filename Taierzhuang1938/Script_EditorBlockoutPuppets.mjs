// 白盒关卡编辑器的独立演员（docs/Data_EditorBlockout.md §5.6）。
//
// 只看布设：演员**不进 ai.soldiers**（不吃子弹、不挡人、不进 AI），位置、朝向、姿态
// 全由关键帧数据决定。人用 actorFactory 造的正式人物（动作库、步态照旧），战车 / 担架 /
// 车 / 牲口是简单体块。关键帧之间的移动按 PlanTransition 的计划走（SampleTransition 取样），
// 整段太长时按 playbackRate 快进，人物动画用同一个倍率。
//
// 距离分级：60 m 外每 3 帧才推一次动画（累计 dt），影子只在 25 m 内开；一关同时最多
// 120 个人物，超出时远处的只留地环与标签（标记层照画），并报一次警告。
//
// 2026-10-18：
//   · 单位带 castId（§3）时用定妆身体（Data_FirstLevelSpeakingCast.SpeakingCastOptions：固定模型号 + 面部蒙皮，
//     种子按 castId 定、不从对象池拿），同一个人每一帧一个样子；没有 castId 照旧按 id 出种子。
//   · 战车按车身脚印（中心、四角、四边中点）里**最高**的地面放：原来只取中心一点，停在沟口时整辆车掉进沟底。
//   · 预演（§14）的外部驱动：Drive(id, 状态) 每帧摆位 / 姿态 / 动作片段（开场动作库）/ 可见；Spawn(unit) 临时加人；
//     ReleaseDrive() 交还（临时加的人回收，其余等总控 Apply 关键帧布设）。
//   · 蹲姿：NRA 步枪兵「蹲着待着」原来被友军步态换成 AllyCrouchCarryStand（扛枪半蹲，骨盆 0.66 m，看着像站着），
//     蹲 / 卧的人一律当戒备（missionCombatAlert），落到原生 KneelHold / CrouchIdle。
//   · 只在要它的关卡才下载的定妆模型（翻译的 NRA06，manifest loadOnDemand）：PrepareCasts(units) 先下完再造人，
//     否则出来的是方块占位人；翻译不拿枪、走「空手」步态（同开场导演的 unarmed）。
//   · 倒地（state:"down"）的人放在身体投影范围（中心 ± 0.9 m）里最低的地面上：斜坡上不再斜着悬在半空（宁可略埋进坡里）。
//   · 倒地的人移动（关键帧过渡、预演里拖单被 / 抬担架）时**只平移**：保持躺姿，不播走路、不起身（原来一「走动」就不算倒地，
//     会站起来走）。单位 / 预演键可选 lie:"along"：身体顺着朝向躺、头朝 yawDeg 的前方、骨盆落在单位位置上
//     （倒地姿态是按种子抽的死亡片段，头朝哪边不固定：落定后量一次头相对骨盆在人物本地的方向，再把整个人转过去）。
//     不写 lie = 原来的样子（身子横在朝向两侧，已有数据不变）。
//   · 武器：预演键 weapon（阶跃）调 actor.SetWeapon 换手里的家伙（大刀 Dadao 同开场 01–02 罗班长的挂法：SetWeapon("Dadao")
//     挂在右手武器挂点上，片段 LuoDadaoChopRear 驱动手）；没写过 = 造人时那把，交还驱动时换回去。关键帧之间武器换了
//     （都不是空手）就地 SetWeapon，不再整个重造。手里是近战家伙（大刀）、站着不动、没在播片段时摆原生白刃戒备
//     （meleeCombat Guard，同开场导演的 meleeGuard），不再端着大刀摆步枪据枪姿势。
//   · 2026-10-18 第三轮：预演键 throw（Script_EditorBlockoutPrevizPlan.PREVIZ_THROW）→ 播步兵投弹片段 GrenadeThrow（「背枪投弹」，
//     游戏里 BeginGrenadeThrow / AI 齐投同一个片段）：ForceClip 定住片段，片段时间按 drive.throw.seconds 直接设（Seek 确定），
//     手里的手榴弹由 Actor._UpdateInfantryProps 照游戏原样挂在片段的 grenade 挂点上、脱手帧后藏掉；飞出去的那颗由预演自己画。
//     骨架上没有这个片段 → 记进 missingClips，照原生动画。
//   · Probe 多给头 / 骨盆的世界高度（headY / pelvisY）、两脚的世界坐标（feet）与倒地片段（deathVariant），量桥下净空、被子范围用。
//
// 2026-10-19（白盒预演补齐，运行时包）：
//   · 百姓 / 小孩（kind civilian / child、side civ）默认换成**能放动作库片段的骨骼身体**：用 NRA 士兵的骨架身体（TengxianNra02，
//     预演额外动作库都烘在它上面、五具骨架骨名一致所以哪具都能播）、不拿武器、走空手步态，外观改成能一眼认出是老百姓：
//     军装布换成百姓的深蓝 / 黑 / 土布色（Create 的 uniformPalette 直接给十六进制色，Script_UniformColors 认数字）、
//     帽徽 / 腰间枪套 / 胸前那条带子藏掉（CIVILIAN_RIG_LOOK.hideMaterials，按材质名）。军帽本身与军装是同一个网格、同一张图集，
//     摘不掉——占位接受。child 照旧整体缩到 0.62。只在白盒编辑器里当占位（不进 Data_CharacterSelection、不影响游戏正片）。
//     旧的程序化 tzm 身体留作开关：单位 / 预演 spawn 写 `body: "procedural"`（§3）；缺省 `body: "rig"`（BLOCKOUT_PUPPETS.civilianBody）。
//   · 军官（nraOfficer / ijaOfficer）本来就是骨骼身体（NRA05 / IJA01），片段并进它们的骨架后照样能播，运行时不拦。
//   · Probe 再多给 body（"rig" / "procedural"）、rigged、两手的世界坐标（handR / handL）、mixerTime（量慢动作里动画是不是真慢了）。
//   · lie:"along" 摆法改成「头、骨盆、两脚」的包围框中心落在单位位置上、身体轴取骨盆→头 ±8° 里最窄的方向，倒地片段固定用
//     腿蜷得最窄的 DeathCollapseC（LIE_DEATH_VARIANT）；倒着的人换成 lie:"along" 时重造一次。冬瓜在 0.7 m 宽的单被上不再伸出一只脚。

import * as THREE from "three";
import { SampleTransition } from "./Script_EditorBlockoutConfig.mjs";
import { InstallAllyGait } from "./Script_AllyGait.mjs";
import { SetRelaxedGait, EnsureRelaxedGait } from "./Script_RelaxedGait.mjs";
import { FIRST_LEVEL_SPEAKING_CAST, SpeakingCastOptions } from "./Data_FirstLevelSpeakingCast.mjs";
import { LoadLugouCastModels } from "./Script_CharacterModel.mjs";
import { PREVIZ_WEAPON_HIDDEN } from "./Data_BlockoutPrevizClips.mjs";

/** 不拿枪的定妆角色（开场导演 Spawn 时给 unarmed:true 的那几个）。 */
const UNARMED_CASTS = new Set(["interpreter"]);
/** 倒地的人身体投影的半长（米）：放在这个范围里最低的地面上。 */
const DOWN_REACH_M = 0.9;
/** 倒地动作在这么多秒内落定（Actor.Ragdoll 的时长 ≤ 0.8 s）：lie:"along" 的人造出来就直接摆成落定后的样子。 */
const LIE_SETTLE_S = 2;
const _lieV = new THREE.Vector3(), _lieP = new THREE.Vector3(), _lieM = new THREE.Matrix4();
/**
 * lie:"along" 的人倒地用哪段倒地片段（2026-10-18 第三轮）：四段倒地片段（Script_CharacterModel DEATH_COLLAPSE_CLIP_IDS）
 * 都是侧身蜷腿，两脚离身体轴（骨盆→头）的横向距离实测：C 0.41–0.44 m、B 0.48–0.53、D 0.55–0.59、A 0.56–0.59。
 * 躺在单被 / 担架（宽 0.7 m）上的人用最窄的 C，按种子抽到 A / D 会有一只脚伸出被子外。
 */
const LIE_DEATH_VARIANT = "DeathCollapseC";
/** 量躺姿时身体轴最多偏离「骨盆→头」多少度去找最窄的方向（BrowserTest 要求头朝向与朝向差 ≤ 12°）。 */
const LIE_FIT_MAX_DEG = 8;

export const BLOCKOUT_PUPPETS = Object.freeze({
  maxActors: 120,
  farAnimM: 60,
  farAnimEvery: 3,
  shadowM: 25,
  childScale: 0.62,
  /** 百姓 / 小孩的身体缺省："rig" = NRA 骨架占位身体（能放片段）；"procedural" = 旧的程序化 tzm 身体。单位字段 body 可覆盖。 */
  civilianBody: "rig",
  tank: { w: 2.18, d: 5.75, h: 1.2, turretW: 1.5, turretD: 1.7, turretH: 0.75, barrel: 1.6 },
  litter: { w: 0.7, d: 2.1, y: 0.78, groundY: 0.12, bearerGapM: 0.55 },
  cart: { w: 1.5, d: 2.4, h: 0.55, y: 0.75, wheel: 0.62 },
  animal: { w: 0.6, d: 1.7, h: 0.75, y: 0.95, head: 0.55 },
});

const DEG = Math.PI / 180;

/**
 * 百姓的骨骼占位身体长什么样（2026-10-19）：NRA 士兵骨架（modelVariant 1 = TengxianNra02，预演动作库烘在它上面）、
 * 军装布换成百姓色（按种子抽一种）、帽徽 / 腰间枪套 / 胸前带子按材质名藏掉。
 */
export const CIVILIAN_RIG_LOOK = Object.freeze({
  bodyKind: "nra",
  modelVariant: 1,
  cloth: Object.freeze([0x2a3147, 0x232326, 0x5b4b36, 0x3a4a5e]),   // 深蓝、黑、土布、靛青
  hideMaterials: Object.freeze(["Material #1721585500", "Material #29", "Material #1721585343"]),
});
export const BLOCKOUT_BODY_MODES = Object.freeze(["rig", "procedural"]);

/** 这个单位的百姓身体用哪种：单位 / spawn 的 body 字段 → 缺省 BLOCKOUT_PUPPETS.civilianBody。 */
export function CivilianBodyMode(unit) {
  return BLOCKOUT_BODY_MODES.includes(unit?.body) ? unit.body : BLOCKOUT_PUPPETS.civilianBody;
}

function ActorKind(unit) {
  // 定妆角色按定妆表的人物种类（翻译官穿 NRA06，阵营却是 ija）
  const cast = unit.castId && Object.hasOwn(FIRST_LEVEL_SPEAKING_CAST, unit.castId) ? FIRST_LEVEL_SPEAKING_CAST[unit.castId] : null;
  if (cast && unit.kind !== "officer") return cast.actorKind;
  if (unit.kind === "officer") return unit.side === "ija" ? "ijaOfficer" : "nraOfficer";
  if (unit.kind === "civilian" || unit.kind === "child" || unit.side === "civ") return "civilian";
  return unit.side === "ija" ? "ija" : "nra";
}

/** 担架上有几个人抬、各站哪头（§3 bearers，缺省 2；只剩一人时留前头）。 */
export function LitterSlots(unit) {
  const n = Number.isInteger(unit?.bearers) ? Math.max(0, Math.min(2, unit.bearers)) : 2;
  return n >= 2 ? ["front", "rear"] : n === 1 ? ["front"] : [];
}

/**
 * 担架怎么摆：抬着 → 杆在手的高度、放平；只剩前头一人 → 前头在手上、后头着地（斜着）；
 * 没人抬或抬的人倒了（state:"down"）→ 平放在地上。→ { y, tilt }（y 是担架面中心离地高度，tilt 绕 X 的弧度，前高为正）
 */
export function LitterPose(unit, down = unit?.state === "down") {
  const l = BLOCKOUT_PUPPETS.litter;
  const slots = LitterSlots(unit);
  if (down || slots.length === 0) return { y: l.groundY, tilt: 0 };
  if (slots.length === 1) {
    const half = (l.d + 0.9) / 2;
    const tilt = Math.asin(Math.min(0.9, (l.y - l.groundY) / (2 * half)));
    return { y: (l.y + l.groundY) / 2, tilt };
  }
  return { y: l.y, tilt: 0 };
}

/** 战车脚印上取地面的几处（车身局部坐标，米）：中心、四角、四边中点。 */
export function TankFootprintPoints() {
  const t = BLOCKOUT_PUPPETS.tank, hw = t.w / 2 + 0.08, hd = t.d / 2;
  const out = [];
  for (const lx of [-hw, 0, hw]) for (const lz of [-hd, 0, hd]) out.push([lx, lz]);
  return out;
}

/** 战车放在脚印里最高的地面上（车身不陷进沟里）。groundAt(x,z) → y。 */
export function TankGroundY(groundAt, x, z, yawDeg) {
  const ry = yawDeg * DEG, c = Math.cos(ry), s = Math.sin(ry);
  let best = -Infinity;
  for (const [lx, lz] of TankFootprintPoints()) best = Math.max(best, groundAt(x + lx * c + lz * s, z - lx * s + lz * c));
  return best;
}

const litter0 = (unit) => unit.kind === "litter";

function HashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100000;
}

/** 体块用的一份材质（白盒画质下照例被换成灰网格；其它画质下是这几种颜色）。 */
function BlockMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
}

function Box(group, material, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export class BlockoutPuppets {
  constructor({ scene, actorFactory, groundAt }) {
    this.scene = scene;
    this.actorFactory = actorFactory;
    this.groundAt = groundAt;
    this.root = new THREE.Group();
    this.root.name = "BlockoutPuppets";
    scene.add(this.root);
    this.materials = {
      ija: BlockMaterial(0x6b4a3e), nra: BlockMaterial(0x4a5a66), civ: BlockMaterial(0x6d6a52),
      wood: BlockMaterial(0x7a6448), cloth: BlockMaterial(0xb7ad94), dark: BlockMaterial(0x333638),
    };
    this.puppets = new Map();
    this.plan = null;
    this.planTime = 0;
    this.frame = 0;
    this.elapsed = 0;
    this.warning = null;
    this.actorCount = 0;
    this.missingClips = new Set();
  }

  get transitioning() { return !!this.plan; }

  // -------------------------------------------------------------------------
  // 造 / 拆

  _MakeHuman(unit, slot, kind = ActorKind(unit), weapon = unit.weapon ?? null) {
    let actor = null;
    if (slot === "main" && UNARMED_CASTS.has(unit.castId)) weapon = null;
    // 定妆角色：固定模型号与面部蒙皮，种子也按 castId 定（同一个人每一帧一个样子）；不从对象池拿（池里的人身高脸型是预建时抽的）
    const cast = slot === "main" && unit.castId ? SpeakingCastOptions(unit.castId) : {};
    const seed = cast.castId ? HashSeed(`cast:${cast.castId}`) : HashSeed(`${unit.id}:${slot}`);
    // 百姓的骨骼占位身体（2026-10-19，文件头）：造一个空手的 NRA02，布换百姓色；body:"procedural" 还是旧的 tzm 身体
    const civilianRig = kind === "civilian" && CivilianBodyMode(unit) === "rig";
    const bodyKind = civilianRig ? CIVILIAN_RIG_LOOK.bodyKind : kind;
    const look = civilianRig ? { modelVariant: CIVILIAN_RIG_LOOK.modelVariant, noPool: true, weapon: null,
      uniformPalette: CIVILIAN_RIG_LOOK.cloth[seed % CIVILIAN_RIG_LOOK.cloth.length] } : {};
    if (civilianRig) weapon = null;
    try {
      actor = this.actorFactory.Create(bodyKind, { seed, weapon, ...cast, ...(cast.castId ? { noPool: true } : {}), ...look });
    } catch (error) {
      console.warn("[BlockoutPuppets] actor create failed", unit.id, error);
      return null;
    }
    if (civilianRig) this._DressCivilian(actor);
    if (unit.kind === "child") actor.root.scale.setScalar(BLOCKOUT_PUPPETS.childScale);
    this.root.add(actor.root);
    // 步态安装器吃一个「假士兵」：只要 id / actor / position / yaw 与几个开关。
    const soldier = { id: `blockout:${unit.id}:${slot}`, actor, position: actor.root.position, yaw: 0, alive: true,
      side: unit.side, missionCombatAlert: !!unit.aim, castId: cast.castId || null };
    try {
      // 步态库是异步下载的：下不来就用缺省动作，不能留一条未处理的 rejection。
      if (!weapon && bodyKind !== "civilian") SetRelaxedGait(soldier, "unarmed");
      else if (bodyKind === "nra" || bodyKind === "nraOfficer") InstallAllyGait(soldier)?.catch?.(() => {});
      else if (bodyKind === "ija") SetRelaxedGait(soldier, unit.aim ? null : "alert");
    } catch (error) { /* 同上 */ }
    return { actor, soldier, kind, bodyKind, slot, animDt: 0, castId: cast.castId || null, baseWeapon: actor.weaponId ?? weapon ?? null, lieLocal: null,
      body: actor.characterRig ? "rig" : "procedural" };
  }

  /** 百姓占位身体的外观：按材质名藏掉帽徽 / 枪套 / 胸前带子（军帽与军装同一网格，摘不掉）。布色在 Create 时就换了。 */
  _DressCivilian(actor) {
    const rig = actor.characterRig;
    if (!rig?.root) return;
    const hide = new Set(CIVILIAN_RIG_LOOK.hideMaterials);
    rig.root.traverse((object) => {
      if (!object.isMesh) return;
      const names = (Array.isArray(object.material) ? object.material : [object.material]).map(m => m?.name);
      if (names.length && names.every(n => hide.has(n))) { object.visible = false; object.userData.blockoutCivilianHidden = true; }
    });
  }

  _MakeBody(unit) {
    const m = this.materials, P = BLOCKOUT_PUPPETS;
    const group = new THREE.Group();
    group.name = `BlockoutPuppet_${unit.id}`;
    const side = unit.side === "ija" ? m.ija : unit.side === "civ" ? m.civ : m.nra;
    if (unit.kind === "tank") {
      const t = P.tank;
      Box(group, side, t.w, t.h, t.d, 0, 0.35 + t.h / 2, 0);
      Box(group, m.dark, t.w + 0.16, 0.7, t.d * 0.96, 0, 0.35, 0);
      Box(group, side, t.turretW, t.turretH, t.turretD, 0, 0.35 + t.h + t.turretH / 2, 0.35);
      Box(group, m.dark, 0.14, 0.14, t.barrel, 0, 0.35 + t.h + t.turretH / 2, 0.35 - t.turretD / 2 - t.barrel / 2);
    } else if (unit.kind === "litter") {
      // 担架单独一个组：抬着 / 一头着地 / 放在地上 由 _Pose 摆高度与倾角（LitterPose）
      const l = P.litter;
      const bed = new THREE.Group();
      bed.name = "BlockoutStretcher";
      Box(bed, m.cloth, l.w, 0.1, l.d, 0, 0, 0);
      Box(bed, m.wood, 0.05, 0.05, l.d + 0.9, -l.w / 2, 0.03, 0);
      Box(bed, m.wood, 0.05, 0.05, l.d + 0.9, l.w / 2, 0.03, 0);
      group.add(bed);
      group.userData.stretcher = bed;
    } else if (unit.kind === "cart" || unit.kind === "animal") {
      if (unit.kind === "cart") {
        const c = P.cart;
        Box(group, m.wood, c.w, c.h, c.d, 0, c.y, 0);
        for (const sx of [-1, 1]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(c.wheel / 2, c.wheel / 2, 0.08, 14), m.dark);
          wheel.rotation.z = Math.PI / 2; wheel.position.set(sx * (c.w / 2 + 0.06), c.wheel / 2, 0.2);
          wheel.castShadow = true; group.add(wheel);
        }
        Box(group, m.wood, 0.06, 0.06, 1.6, -0.35, c.y - 0.1, -c.d / 2 - 0.8);
        Box(group, m.wood, 0.06, 0.06, 1.6, 0.35, c.y - 0.1, -c.d / 2 - 0.8);
      }
      if (unit.kind === "animal" || unit.animal !== false) {
        const a = P.animal, z = unit.kind === "cart" ? -P.cart.d / 2 - 1.35 : 0;
        Box(group, m.civ, a.w, a.h, a.d, 0, a.y, z);
        Box(group, m.civ, 0.3, 0.45, a.head, 0, a.y + 0.35, z - a.d / 2 - 0.15);
        for (const [lx, lz] of [[-0.2, -0.6], [0.2, -0.6], [-0.2, 0.6], [0.2, 0.6]]) Box(group, m.civ, 0.12, a.y - a.h / 2, 0.12, lx, (a.y - a.h / 2) / 2, z + lz);
      }
    }
    this.root.add(group);
    return group;
  }

  _Create(unit, allowActors) {
    const puppet = { id: unit.id, unit, body: null, humans: [], x: unit.x, z: unit.z, yawDeg: unit.yawDeg, stance: unit.stance,
      moving: false, speedMps: 0, visible: true, down: unit.state === "down", noActor: false, stagger: HashSeed(unit.id) };
    const bodyKinds = ["tank", "litter", "cart", "animal"];
    if (bodyKinds.includes(unit.kind)) puppet.body = this._MakeBody(unit);
    if (unit.kind === "litter") {
      // §3 bearers：2 = 前后两人抬；1 = 只剩前头一人（后端着地）；0 = 担架放在地上，没人抬
      const slots = LitterSlots(unit);
      if (slots.length && allowActors >= slots.length) {
        for (const slot of slots) {
          const human = this._MakeHuman({ ...unit, kind: "soldier", side: unit.side === "civ" ? "civ" : "nra", aim: false }, slot, unit.side === "civ" ? "civilian" : "nra", null);
          if (human) puppet.humans.push(human);
        }
      } else if (slots.length) puppet.noActor = true;
    } else if (!bodyKinds.includes(unit.kind)) {
      if (allowActors >= 1) {
        const human = this._MakeHuman(unit, "main");
        if (human) puppet.humans.push(human);
      } else puppet.noActor = true;
    }
    this.actorCount += puppet.humans.length;
    return puppet;
  }

  _Destroy(puppet) {
    for (const human of puppet.humans) {
      try { human.actor.Dispose(); } catch (error) { /* already gone */ }
    }
    this.actorCount -= puppet.humans.length;
    puppet.humans.length = 0;
    if (puppet.body) {
      puppet.body.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      puppet.body.removeFromParent();
      puppet.body = null;
    }
  }

  /** 演员名额：按到相机的距离分，近的先给（超出上限的只留地环与标签）。 */
  _Budget(units, cameraPosition) {
    const need = u => (u.kind === "litter" ? LitterSlots(u).length : ["tank", "cart", "animal"].includes(u.kind) ? 0 : 1);
    const total = units.reduce((n, u) => n + need(u), 0);
    const allow = new Map();
    if (total <= BLOCKOUT_PUPPETS.maxActors) { for (const u of units) allow.set(u.id, need(u)); this.warning = null; return allow; }
    const cx = cameraPosition?.x ?? 0, cz = cameraPosition?.z ?? 0;
    let left = BLOCKOUT_PUPPETS.maxActors;
    for (const u of [...units].sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))) {
      const n = need(u);
      allow.set(u.id, n <= left ? n : 0);
      if (n <= left) left -= n;
    }
    this.warning = `这一帧有 ${total} 个人物，超过上限 ${BLOCKOUT_PUPPETS.maxActors}，远处的只画地环与标签`;
    console.warn(`[BlockoutPuppets] ${total} actors > ${BLOCKOUT_PUPPETS.maxActors}; far units keep markers only`);
    return allow;
  }

  /** 让场上的演员与 units 一一对应：同 id 复用；种类 / 阵营变了或从倒地站起来就重造。 */
  _Sync(units, cameraPosition) {
    const allow = this._Budget(units, cameraPosition);
    const keep = new Set();
    for (const unit of units) {
      keep.add(unit.id);
      let puppet = this.puppets.get(unit.id);
      const wantActors = allow.get(unit.id) ?? 0;
      const oldWeapon = puppet?.unit.weapon ?? null, newWeapon = unit.weapon ?? null;
      // 两把都不是空手：就地换（SetWeapon），不重造人；空手 ↔ 拿武器要换步态，照旧重造
      const swapInPlace = !!(oldWeapon && newWeapon && oldWeapon !== newWeapon);
      const stale = puppet && (puppet.unit.kind !== unit.kind || puppet.unit.side !== unit.side
        || (oldWeapon !== newWeapon && !swapInPlace) || (puppet.unit.castId ?? null) !== (unit.castId ?? null)
        || (unit.kind === "litter" && LitterSlots(puppet.unit).length !== LitterSlots(unit).length)
        || (puppet.down && unit.state !== "down")
        // 倒着的人换成 lie:"along"（02-2 → 02-3 冬瓜挪上被子）：重造，好按 LIE_DEATH_VARIANT 重新倒一次
        || (puppet.down && unit.state === "down" && unit.lie === "along" && (puppet.unit.lie ?? null) !== "along")
        // 百姓身体种类变了（rig ↔ procedural，2026-10-19）
        || CivilianBodyMode(puppet.unit) !== CivilianBodyMode(unit)
        || (puppet.noActor && wantActors > 0) || (!puppet.noActor && wantActors === 0 && puppet.humans.length > 0));
      if (stale) { this._Destroy(puppet); this.puppets.delete(unit.id); puppet = null; }
      if (!puppet) { puppet = this._Create(unit, wantActors); this.puppets.set(unit.id, puppet); }
      puppet.unit = unit;
      for (const human of puppet.humans) {
        if (human.slot === "main" && newWeapon && !UNARMED_CASTS.has(unit.castId)) human.baseWeapon = newWeapon;
        human.soldier.missionCombatAlert = !!unit.aim;
        if (human.kind === "ija") SetRelaxedGait(human.soldier, unit.aim ? null : "alert");
      }
    }
    for (const [id, puppet] of this.puppets) if (!keep.has(id) && !puppet.temp) { this._Destroy(puppet); this.puppets.delete(id); }
  }

  // -------------------------------------------------------------------------
  // 关键帧

  /** 直接到位（后退、跨多个、切关、首次载入）。 */
  Apply(units, cameraPosition = null) {
    this.plan = null;
    this.planTime = 0;
    this._Sync(units, cameraPosition);
    for (const unit of units) {
      const puppet = this.puppets.get(unit.id);
      Object.assign(puppet, { x: unit.x, z: unit.z, yawDeg: unit.yawDeg, stance: unit.stance, moving: false, speedMps: 0, visible: true,
        down: unit.state === "down" });
      this._Pose(puppet, 0, true);
    }
  }

  /**
   * 从 fromUnits 过渡到 toUnits（plan 来自 PlanTransition(fromKf, toKf)）。
   * 先把两边出现过的单位都摆出来：只在新关键帧有的先藏着（appear 起步时才出现），
   * 只在旧关键帧有的照旧站在原处（vanish 结束时藏掉，过渡收尾再回收）。
   */
  Transition(plan, fromUnits, toUnits, cameraPosition = null) {
    const byId = new Map();
    for (const unit of fromUnits || []) byId.set(unit.id, unit);
    for (const unit of toUnits || []) byId.set(unit.id, unit);   // 新关键帧的数据优先（种类、名字、武器）
    this.toUnits = toUnits || [];
    this._Sync([...byId.values()], cameraPosition);
    this.plan = plan;
    this.planTime = 0;
    this._SamplePlan(true);
  }

  _SamplePlan(snap = false) {
    const states = SampleTransition(this.plan, this.planTime);
    for (const s of states) {
      const puppet = this.puppets.get(s.id);
      if (!puppet) continue;
      puppet.x = s.x; puppet.z = s.z; puppet.yawDeg = s.yawDeg; puppet.stance = s.stance;
      puppet.moving = s.moving; puppet.speedMps = s.speedMps; puppet.visible = s.visible;
      if (snap) this._Pose(puppet, 0, true);
    }
  }

  _Finish() {
    const units = this.toUnits || [];
    this.plan = null;
    this.planTime = 0;
    this.toUnits = null;
    const keep = new Set(units.map(u => u.id));
    for (const [id, puppet] of this.puppets) if (!keep.has(id)) { this._Destroy(puppet); this.puppets.delete(id); }
    for (const unit of units) {
      const puppet = this.puppets.get(unit.id);
      if (!puppet) continue;
      puppet.unit = unit;
      Object.assign(puppet, { x: unit.x, z: unit.z, yawDeg: unit.yawDeg, stance: unit.stance, moving: false, speedMps: 0, visible: true,
        down: unit.state === "down" });
    }
  }

  // -------------------------------------------------------------------------
  // 每帧

  /** 把 puppet 的位姿写进体块与人物，并推动画（dt 已含 playbackRate）。 */
  _Pose(puppet, dt, force = false, cameraPosition = null) {
    const drive = puppet.drive;
    if (drive) {
      puppet.x = drive.x; puppet.z = drive.z; puppet.yawDeg = drive.yawDeg; puppet.stance = drive.stance;
      puppet.moving = !!drive.moving; puppet.speedMps = drive.speedMps || 0; puppet.visible = drive.visible !== false;
      puppet.down = drive.state === "down";
    }
    const y = puppet.unit.kind === "tank" ? TankGroundY(this.groundAt, puppet.x, puppet.z, puppet.yawDeg) : this.groundAt(puppet.x, puppet.z);
    const ry = puppet.yawDeg * DEG;
    if (puppet.body) {
      puppet.body.visible = puppet.visible;
      puppet.body.position.set(puppet.x, y, puppet.z);
      puppet.body.rotation.y = ry;
      const bed = puppet.body.userData.stretcher;
      if (bed) {
        const pose = LitterPose(puppet.unit, !!puppet.down);
        bed.position.y = pose.y;
        bed.rotation.x = pose.tilt;
      }
    }
    const unit = puppet.unit;
    const fx = -Math.sin(ry), fz = -Math.cos(ry);
    const distance = cameraPosition ? Math.hypot(puppet.x - cameraPosition.x, puppet.z - cameraPosition.z) : 0;
    for (const human of puppet.humans) {
      const actor = human.actor;
      let x = puppet.x, z = puppet.z;
      if (unit.kind === "litter") {
        const offset = BLOCKOUT_PUPPETS.litter.d / 2 + BLOCKOUT_PUPPETS.litter.bearerGapM;
        const sign = human.slot === "front" ? 1 : -1;
        x += fx * offset * sign; z += fz * offset * sign;
      }
      actor.root.visible = puppet.visible;
      const lieAlong = this._LieAlong(puppet, human, drive);
      actor.root.position.set(x, puppet.down && !litter0(unit) ? this.DownGround(x, z) : this.groundAt(x, z), z);
      actor.root.rotation.y = ry;
      human.soldier.yaw = ry;
      if (lieAlong && human.lieLocal) this._PlaceLying(human, x, z, ry);
      // 2026-10-19：顺着躺的人播躺姿片段（PvLieGrabSleeve）照样按头的方向摆；片段带 rootPath（PvClimbOutTrench）按它挪根
      const lieClip = this._LieClip(puppet, human, drive);
      if (lieClip && human.lieClip?.clip === drive.clip && human.lieClip.L) this._PlaceLying(human, x, z, ry, human.lieClip.L);
      this._ApplyRootPath(human, drive, ry);
      this._SyncWeapon(human, drive);
      if (human.kind === "ija" || human.soldier.relaxedGait) EnsureRelaxedGait(human.soldier);
      human.animDt += dt;
      const far = distance > BLOCKOUT_PUPPETS.farAnimM;
      if (!force && far && (this.frame + puppet.stagger) % BLOCKOUT_PUPPETS.farAnimEvery !== 0) continue;
      const step = force ? Math.max(human.animDt, 1 / 60) : human.animDt;
      human.animDt = 0;
      if (!puppet.visible) continue;
      // 倒地的人被拖 / 被抬着走：只平移，不播走路（moveSpeed 0、dead 照旧）
      const mps = puppet.moving && !(puppet.down && !litter0(unit)) ? puppet.speedMps : 0;
      const litter = unit.kind === "litter";
      const aim = drive ? !!drive.aim : !!unit.aim;
      const carryRole = litter ? human.slot : drive?.carryRole || null;
      // 要顺着躺的人还没倒下：倒地片段换成腿蜷得最窄的那段（LIE_DEATH_VARIANT），躺在被子 / 担架上不伸出去
      if (puppet.down && human.slot === "main" && !actor.ragdollState && (drive ? drive.lie : unit.lie) === "along") {
        const rig = actor.characterRig;
        if (rig?.deathClipById?.has?.(LIE_DEATH_VARIANT)) rig.deathVariantId = LIE_DEATH_VARIANT;
      }
      const throwing = this._ApplyThrow(human, drive, step);
      const clipState = throwing ? null : this._ApplyClip(human, drive, mps, step);
      // 友军步态（AllyGait）把「不戒备」的蹲着待着换成 AllyCrouchCarryStand（扛枪半蹲，骨盆离地 0.66 m，
      // 看着是站着的）：蹲 / 卧的人也当戒备，落到原生 KneelHold / CrouchIdle（骨盆 0.36–0.45 m）。
      human.soldier.missionCombatAlert = aim || (!carryRole && puppet.stance !== "stand");
      const state = {
        moveSpeed: mps / 3.6, moveSpeedMps: mps, locomotionTracked: true, elapsed: this.elapsed,
        aim: aim && !carryRole && !throwing ? 1 : 0,
        crouch: !carryRole && puppet.stance === "crouch" ? 1 : 0,
        prone: !carryRole && puppet.stance === "prone" ? 1 : 0,
        grounded: true, lookYaw: 0, lookPitch: 0, firing: false,
        dead: !!puppet.down && !drive?.clip,
        ...(carryRole ? { carryRole } : {}),
        ...(drive?.woundedWalk ? { woundedWalk: 1 } : {}),
        ...(drive?.talking ? { talking: 1 } : {}),
        ...(clipState?.bayonetFixed ? { bayonetFixed: true } : {}),
      };
      // 手里是大刀这类近战家伙、站着不动、没在播片段：摆原生白刃戒备（同开场导演的 meleeGuard），不按步枪据枪
      if (actor.weaponData?.kind === "melee" && !clipState && !throwing && !puppet.down && mps < 0.05 && !carryRole) {
        state.aim = 0;
        state.meleeCombat = { weapon: actor.weaponId, state: "idle", action: "Guard", clip: "DadaoGuard", normalized: this.elapsed % 1, t: this.elapsed, weight: 1 };
      }
      actor.Update(step, state);
      // 2026-10-19：趴着 / 躺着播的空手片段（抱捆爬、躺着攥袖子）手里、背上都不挂枪（背枪那把是竖着挂的，趴下会戳上天）
      if (drive?.clip && PREVIZ_WEAPON_HIDDEN.includes(drive.clip) && human.openingInstalled === true) {
        if (actor.weaponGroup) actor.weaponGroup.visible = false;
        const rig = actor.characterRig;
        if (rig?.openingSlungRifle) rig.openingSlungRifle.visible = false;
        if (rig?.relaxedGaitRifle) rig.relaxedGaitRifle.visible = false;
      }
      if (lieClip &&!(human.lieClip?.clip === drive.clip && human.lieClip.done)) {
        // 片段淡入期间每帧量一次头 / 骨盆 / 两脚，淡入完了缓存（同一片段之后不再量）
        const L = this._MeasureLie(human);
        const done = (actor.characterRig?.openingBlendState?.mix ?? 1) >= 0.99;
        human.lieClip = { clip: drive.clip, L, done };
        if (L) this._PlaceLying(human, x, z, ry, L);
      }
      if (lieAlong) {
        if (!actor.ragdollState) human.lieLocal = null;
        else if (!human.lieLocal) {
          // 造出来 / 刚倒下：直接落定，量一次头的方向，再按 lie 摆（以后每帧用缓存，不再量）
          if (actor.ragdollState.t < 1) actor.Update(LIE_SETTLE_S, state);
          human.lieLocal = this._MeasureLie(human);
          if (human.lieLocal) this._PlaceLying(human, x, z, ry);
        }
      }
      if (cameraPosition) actor.SetShadowEnabled(distance < BLOCKOUT_PUPPETS.shadowM);
    }
  }

  Update(dt, cameraPosition) {
    this.frame += 1;
    let rate = 1;
    if (this.plan) {
      rate = this.plan.playbackRate || 1;
      this.planTime += dt * rate;
      this._SamplePlan(false);
      if (this.planTime >= this.plan.durationS) this._Finish();
    }
    this.elapsed += dt * rate;
    for (const puppet of this.puppets.values()) this._Pose(puppet, dt * rate, false, cameraPosition);
  }

  // -------------------------------------------------------------------------
  // 预演的外部驱动（§14.2）

  /** 开场动作库的片段（clip / clipSeconds）：第一次要片段时才给这个人装那一层（库没下完前照原生动画）。 */
  _ApplyClip(human, drive, mps, dt = 0) {
    const soldier = human.soldier;
    const clip = drive?.clip || null;
    if (clip && !human.openingInstalled && this.opening?.library) {
      try { this.opening.api.InstallOpeningStoryboardAnimation(soldier); human.openingInstalled = true; }
      catch (error) { console.warn("[BlockoutPuppets] opening layer install failed", error); human.openingInstalled = "failed"; }
    }
    if (human.openingInstalled !== true) return null;
    if (!clip) {
      soldier.openingStoryboardPose = null;
      soldier.openingStoryboardTravel = null;
      human.clipSeconds = null;
      return null;
    }
    const seconds = Math.max(0, drive.clipSeconds || 0);
    const meta = this.opening.api.OpeningClipMeta(clip) || {};
    const pose = { clip, seconds };
    // 预演键 clipRelease（片段秒数）：带停住段的片段到这一秒放开、接着放出口（撒尿系裤子、被咬甩手后仰）
    if (Number.isFinite(drive.clipRelease)) pose.holdUntil = drive.clipRelease;
    // 走着放的片段（manifest referenceSpeedMps，如 IjaWalkStabProne）：开场动作层按「走了多远」推它的身体时钟，
    // 而枪道具按 pose.seconds 取 —— 原地放时身体停在第一帧、枪跑到后面的帧，枪就脱手悬空。
    // 照开场导演的握法：身体时钟按片段秒数的增量喂（openingStoryboardTravel），枪交给双手（weaponHold）。
    let travel = mps > 0.05 ? mps : null;
    if (meta.referenceSpeedMps > 0) {
      const last = human.clipName === clip && Number.isFinite(human.clipSeconds) ? human.clipSeconds : seconds;
      const advance = Math.max(0, seconds - last);
      travel = dt > 1e-4 ? meta.referenceSpeedMps * advance / dt : 0;
      // 2026-10-19：原地循环的走 / 爬片段（拖被子、架伤员、抱捆爬、猫腰拽人）跟着人走：身体时钟按实际速度推
      // （播放速率 = 实际速度 / referenceSpeedMps，开场动作层自己换算），站住就停在那一帧，脚不滑。
      if (meta.loop === true) travel = mps > 0.05 ? mps : 0;
      pose.weaponHold = meta.weaponHold || "twoHand";
    }
    human.clipName = clip; human.clipSeconds = seconds;
    soldier.openingStoryboardPose = pose;
    // 走着放站姿片段：腿交给原生步态
    soldier.openingStoryboardTravel = travel;
    // 拿刺刀扎人的片段（contacts 里有 blade / stab）要上刺刀，开场导演造这个人时就给 bayonetFixed
    const bayonetFixed = (meta.contacts || []).some(c => c.limb === "blade" && c.action === "stab");
    return { bayonetFixed };
  }

  /**
   * 投弹（预演键 throw）：GrenadeThrow 片段按 drive.throw.seconds 定时间（这一步 mixer 再推 step 正好到那一秒）。
   * → 这一帧是不是在抡。只管主角本人。
   */
  _ApplyThrow(human, drive, step) {
    const th = human.slot === "main" ? drive?.throw : null;
    const actor = human.actor, rig = actor.characterRig;
    if (th && rig) {
      const clip = rig.clipById?.get?.("GrenadeThrow");
      if (!clip) { this.missingClips.add("GrenadeThrow"); return false; }
      if (rig.forcedClip !== "GrenadeThrow") {
        if (human.openingInstalled === true) { human.soldier.openingStoryboardPose = null; human.soldier.openingStoryboardTravel = null; }
        actor.PlayImportedAnimation("GrenadeThrow");
        human.throwing = true;
      }
      if (rig.currentAction && rig.currentId === "GrenadeThrow") {
        rig.currentAction.time = Math.max(0, Math.min(clip.duration, th.seconds - Math.max(0, step)));
      }
      return true;
    }
    if (human.throwing) { try { actor.ClearImportedAnimation(); } catch (error) { /* 已回收 */ } human.throwing = false; }
    return false;
  }

  /** 这个人此刻要不要按 lie:"along" 摆：倒地、不是担架上的抬杆人、没在播片段。 */
  _LieAlong(puppet, human, drive) {
    if (!puppet.down || puppet.unit.kind === "litter" || human.slot !== "main" || drive?.clip) return false;
    return (drive ? drive.lie : puppet.unit.lie) === "along";
  }

  /**
   * 量倒地姿态：头与骨盆在人物本地（root 系）的位置 → { a: 头相对骨盆的本地朝向（弧度，同 yaw 口径），px, pz: 骨盆本地 xz }。
   * 只在落定后量一次（之后姿态不变）。量不出来（没有骨骼）→ null，照原样摆。
   */
  _MeasureLie(human) {
    const actor = human.actor, rig = actor.characterRig;
    const head = rig?.bones?.head || actor.head, pelvis = rig?.bones?.pelvis || actor.hips;
    if (!head || !pelvis) return null;
    const points = [];
    try {
      actor.root.updateWorldMatrix(true, true);
      _lieM.copy(actor.root.matrixWorld).invert();
      head.getWorldPosition(_lieV).applyMatrix4(_lieM);
      pelvis.getWorldPosition(_lieP).applyMatrix4(_lieM);
      points.push([_lieV.x, _lieV.z], [_lieP.x, _lieP.z]);
      for (const name of ["footL", "footR"]) {
        const bone = rig?.bones?.[name];
        if (bone) { const v = bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(_lieM); points.push([v.x, v.z]); }
      }
    } catch (error) { return null; }
    const vx = _lieV.x - _lieP.x, vz = _lieV.z - _lieP.z;
    if (Math.hypot(vx, vz) < 0.15) return null;
    // 2026-10-18 第三轮：不再把骨盆放在单位位置上，而是把「头、骨盆、两脚」的包围框中心放上去，
    // 身体轴在「骨盆→头」±LIE_FIT_MAX_DEG 里取横向最窄的方向（倒地片段都是侧身蜷腿，骨盆居中时脚伸出 0.7 m 宽的被子）。
    const a0 = Math.atan2(-vx, -vz);
    let best = null;
    for (let deg = -LIE_FIT_MAX_DEG; deg <= LIE_FIT_MAX_DEG; deg += 1) {
      const a = a0 + deg * DEG, fx = -Math.sin(a), fz = -Math.cos(a), sx = -fz, sz = fx;   // 前（头）与横向
      let fMin = Infinity, fMax = -Infinity, sMin = Infinity, sMax = -Infinity;
      for (const [x, z] of points) {
        const f = x * fx + z * fz, l = x * sx + z * sz;
        fMin = Math.min(fMin, f); fMax = Math.max(fMax, f); sMin = Math.min(sMin, l); sMax = Math.max(sMax, l);
      }
      const width = sMax - sMin + Math.abs(deg) * 1e-4;   // 一样窄时取偏得少的
      if (!best || width < best.width) {
        const f = (fMin + fMax) / 2, l = (sMin + sMax) / 2;
        best = { width, a, px: f * fx + l * sx, pz: f * fz + l * sz };
      }
    }
    return { a: best.a, px: best.px, pz: best.pz };
  }

  /** 2026-10-19：顺着躺（lie:"along"）的倒地的人正在播片段（躺姿片段，如 PvLieGrabSleeve）：按片段里身体的方向摆。 */
  _LieClip(puppet, human, drive) {
    if (!puppet.down || puppet.unit.kind === "litter" || human.slot !== "main" || !drive?.clip) return false;
    return drive.lie === "along" || (drive.lie === undefined && puppet.unit.lie === "along");
  }

  /**
   * 2026-10-19：原地播的翻沟片段（清单 rootPath.keys = [[t, 往前, 往上], …]，运行时米）：根顺着朝向往前、往上挪。
   * 片段按 1.4 m 深的沟写；往上的量按「片段末尾那一点的地面 − 起点地面」等比放大 / 缩小（沟深 2 m 就放大到 2 m）。
   * 预演在片段播完时把人用位置键挪到末尾那一点（Script_EditorBlockoutFirstLevel0105Previz ClimbOut）。
   */
  _ApplyRootPath(human, drive, ry) {
    const clip = drive?.clip;
    const keys = clip && this.opening?.api.OpeningClipMeta(clip)?.rootPath?.keys;
    if (!Array.isArray(keys) || keys.length < 2 || human.slot !== "main") return;
    const t = Math.max(0, drive.clipSeconds || 0);
    let i = 1;
    while (i < keys.length - 1 && keys[i][0] < t) i++;
    const a = keys[i - 1], b = keys[i], span = b[0] - a[0];
    const w = span > 1e-6 ? Math.max(0, Math.min(1, (t - a[0]) / span)) : 1, s = w * w * (3 - 2 * w);
    const fwd = a[1] + (b[1] - a[1]) * s, up = a[2] + (b[2] - a[2]) * s;
    const end = keys[keys.length - 1], fx = -Math.sin(ry), fz = -Math.cos(ry);
    const root = human.actor.root, x0 = root.position.x, z0 = root.position.z, y0 = root.position.y;
    const rise = this.groundAt(x0 + fx * end[1], z0 + fz * end[1]) - y0;
    const k = end[2] > 1e-3 && rise > 0.2 ? Math.max(0.5, Math.min(2.5, rise / end[2])) : 1;
    root.position.set(x0 + fx * fwd, y0 + up * k, z0 + fz * fwd);
  }

  /** lie:"along"：把人转到「头朝 ry 的前方」，身体（头、骨盆、两脚）的包围框中心落在 (x, z)。 */
  _PlaceLying(human, x, z, ry, L = human.lieLocal) {
    const actor = human.actor, k = actor.root.scale.x || 1;
    const r = ry - L.a, c = Math.cos(r), s = Math.sin(r);
    const ox = (L.px * c + L.pz * s) * k, oz = (-L.px * s + L.pz * c) * k;
    actor.root.position.x = x - ox;
    actor.root.position.z = z - oz;
    actor.root.rotation.y = r;
    human.soldier.yaw = r;
  }

  /** 手里的武器：预演键写过 weapon 用它，否则用造人时 / 关键帧给的那把（交还驱动后换回去）。只管主角本人，不管抬担架的。 */
  _SyncWeapon(human, drive) {
    if (human.slot !== "main") return;
    const want = drive && drive.weapon !== undefined ? drive.weapon : human.baseWeapon;
    if ((human.actor.weaponId ?? null) === (want ?? null)) return;
    try { human.actor.SetWeapon(want || null); }
    catch (error) { console.warn("[BlockoutPuppets] SetWeapon failed", want, error); human.baseWeapon = human.actor.weaponId ?? null; }
  }

  /** 倒地的人：身体投影范围（中心与前后左右 0.9 m）里最低的地面。 */
  DownGround(x, z) {
    const r = DOWN_REACH_M;
    return Math.min(this.groundAt(x, z), this.groundAt(x + r, z), this.groundAt(x - r, z), this.groundAt(x, z + r), this.groundAt(x, z - r));
  }

  /**
   * 要在本关下载的定妆模型（loadOnDemand：翻译的 NRA06）先下完：units 里带 castId 的人都算上。
   * 没下完就造人出来的是方块占位人。→ Promise（失败也 resolve，造出来照旧是占位）。
   */
  async PrepareCasts(units) {
    const library = this.actorFactory?.characterAssets;
    const specs = [...new Set((units || []).map(u => u?.castId).filter(id => id && Object.hasOwn(FIRST_LEVEL_SPEAKING_CAST, id)))]
      .map(id => FIRST_LEVEL_SPEAKING_CAST[id]);
    if (!library || !specs.length) return [];
    try { return await LoadLugouCastModels(library, specs); }
    catch (error) { console.warn("[BlockoutPuppets] cast model load failed", error); return []; }
  }

  /** 开场动作库（Script_OpeningStoryboardAnimation）：预演用到片段时由预演交进来 { api, library }。 */
  SetOpeningLibrary(opening) { this.opening = opening || null; }

  /** 按 id 取演员（预演找嘴、找头、找枪口用）。 */
  Get(id) { return this.puppets.get(id) || null; }

  /** 临时加一个人（预演 spawn，只活在这段预演里；ReleaseDrive 时回收）。 */
  Spawn(unit, cameraPosition = null) {
    let puppet = this.puppets.get(unit.id);
    if (puppet && !puppet.temp) return puppet;
    if (puppet) { this._Destroy(puppet); this.puppets.delete(unit.id); }
    const need = unit.kind === "litter" ? LitterSlots(unit).length : ["tank", "cart", "animal"].includes(unit.kind) ? 0 : 1;
    puppet = this._Create(unit, this.actorCount + need <= BLOCKOUT_PUPPETS.maxActors ? need : 0);
    puppet.temp = true;
    this.puppets.set(unit.id, puppet);
    this._Pose(puppet, 0, true, cameraPosition);
    return puppet;
  }

  /** 外部驱动这一帧的状态（SamplePrevizActor 的结果）；null = 不再驱动。 */
  Drive(id, state) {
    const puppet = this.puppets.get(id);
    if (!puppet) return false;
    puppet.drive = state || null;
    return true;
  }

  /** 预演结束：临时加的人回收，被驱动的人交还（位置由随后的 Apply 摆回关键帧布设）。 */
  ReleaseDrive() {
    for (const [id, puppet] of this.puppets) {
      if (puppet.temp) { this._Destroy(puppet); this.puppets.delete(id); continue; }
      puppet.drive = null;
      for (const human of puppet.humans) {
        if (human.openingInstalled === true) { human.soldier.openingStoryboardPose = null; human.soldier.openingStoryboardTravel = null; }
        if (human.throwing) { try { human.actor.ClearImportedAnimation(); } catch (error) { /* */ } human.throwing = false; }
        const facial = human.actor.characterRig?.facial;
        if (facial && human.facialBound) { facial.source = null; human.facialBound = false; }
      }
    }
  }

  /** 确定性取样（预演 Seek）：按当前驱动状态连推几步小 dt，让动作层 / 片段混合收敛到同一个姿态。 */
  Settle(steps = 10, dt = 0.05, cameraPosition = null) {
    for (let i = 0; i < steps; i++) for (const puppet of this.puppets.values()) {
      for (const human of puppet.humans) human.animDt = 0;
      this._Pose(puppet, dt, true, cameraPosition);
    }
  }

  /** 取证：某个演员此刻的样子（播的动作、姿态、脚下高度、定妆身体、骨盆 / 头离地）。 */
  Probe(id) {
    const puppet = this.puppets.get(id);
    if (!puppet) return null;
    const human = puppet.humans[0];
    const rig = human?.actor.characterRig;
    const ground = puppet.unit.kind === "tank" ? TankGroundY(this.groundAt, puppet.x, puppet.z, puppet.yawDeg) : this.groundAt(puppet.x, puppet.z);
    let pelvisY = null, headY = null, pelvisXZ = null, headXZ = null, handR = null, handL = null;
    const feet = [];
    try {
      human?.actor.root.updateWorldMatrix(true, true);
      if (rig?.bones?.pelvis) { const v = rig.bones.pelvis.getWorldPosition(new THREE.Vector3()); pelvisY = v.y; pelvisXZ = { x: v.x, z: v.z }; }
      if (rig?.bones?.head) { const v = rig.bones.head.getWorldPosition(new THREE.Vector3()); headY = v.y; headXZ = { x: v.x, z: v.z }; }
      for (const name of ["footL", "footR"]) {
        const bone = rig?.bones?.[name];
        if (bone) { const v = bone.getWorldPosition(new THREE.Vector3()); feet.push({ x: v.x, y: v.y, z: v.z }); }
      }
      // 两手的世界坐标（2026-10-19：量片段是不是真把手举起来 / 放下去了）
      if (rig?.bones?.handR) { const v = rig.bones.handR.getWorldPosition(new THREE.Vector3()); handR = { x: v.x, y: v.y, z: v.z }; }
      if (rig?.bones?.handL) { const v = rig.bones.handL.getWorldPosition(new THREE.Vector3()); handL = { x: v.x, y: v.y, z: v.z }; }
    } catch (error) { /* 取证不影响运行 */ }
    // 头相对骨盆的世界朝向（yaw 口径）：lie:"along" 时应当 ≈ yawDeg
    const headYawDeg = pelvisXZ && headXZ ? Math.atan2(-(headXZ.x - pelvisXZ.x), -(headXZ.z - pelvisXZ.z)) / DEG : null;
    return {
      id, kind: puppet.unit.kind, x: puppet.x, z: puppet.z, yawDeg: puppet.yawDeg, stance: puppet.stance, visible: puppet.visible,
      driven: !!puppet.drive, temp: !!puppet.temp, ground, centerGround: this.groundAt(puppet.x, puppet.z),
      bodyY: puppet.body ? puppet.body.position.y : null, actors: puppet.humans.length,
      clip: human?.soldier.openingStoryboardPose?.clip || null, currentId: rig?.currentId || null, modelId: rig?.modelId || null,
      castId: human?.castId || null, facial: !!rig?.facial, modelVariant: human?.actor.modelVariant ?? null,
      pelvisAboveGround: pelvisY !== null ? pelvisY - ground : null, headAboveGround: headY !== null ? headY - ground : null,
      down: !!puppet.down, lie: (puppet.drive ? puppet.drive.lie : puppet.unit.lie) || null, moving: !!puppet.moving,
      pelvis: pelvisXZ, head: headXZ, headYawDeg, rootYawDeg: human ? human.actor.root.rotation.y / DEG : null,
      weapon: human?.actor.weaponId ?? null, dead: !!human?.actor.ragdollState,
      headY, pelvisY, feet, throwing: !!human?.throwing, deathVariant: rig?.deathVariantId ?? null,
      grenadeVisible: !!human?.actor.grenadeGroup?.visible,
      throwClipS: rig?.clipById?.get?.("GrenadeThrow")?.duration ?? null,
      // 2026-10-19：身体种类、两手、动画时钟（慢动作取证）、开场动作层正在播的片段与进度
      body: human?.body ?? null, bodyKind: human?.bodyKind ?? null, rigged: !!rig, handR, handL,
      mixerTime: rig?.mixer?.time ?? null,
      shownClip: rig?.openingStoryboardState?.clipId ?? null, shownClipSeconds: rig?.openingStoryboardState?.seconds ?? null,
      hiddenParts: rig ? (() => { let n = 0; rig.root.traverse(o => { if (o.userData?.blockoutCivilianHidden) n++; }); return n; })() : 0,
    };
  }

  /** 演员现场位置（标记层与俯视图读）。 */
  Live() {
    const out = [];
    for (const puppet of this.puppets.values()) {
      out.push({ id: puppet.id, x: puppet.x, z: puppet.z, yawDeg: puppet.yawDeg, moving: puppet.moving, visible: puppet.visible,
        stance: puppet.stance, actors: puppet.humans.length, noActor: puppet.noActor });
    }
    return out;
  }

  Dispose() {
    for (const puppet of this.puppets.values()) this._Destroy(puppet);
    this.puppets.clear();
    this.plan = null;
    this.root.removeFromParent();
    for (const material of Object.values(this.materials)) material.dispose();
  }
}
