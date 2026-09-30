// Data_Tuning_HitReaction.mjs — 受击物理反应（枪击 / 刀砍 / 爆炸打在人身上，人怎么动）的全部数值。
//
// **纯数据**：不 import three、不含函数。规则在 `Script_HitReaction.mjs`（冲量分配 / 弹簧积分 /
// 方向死亡选择，纯 Node 可测），three 侧的骨骼弹簧层在 `Script_HitReactionLayer.mjs`。
// 口径与验收见 docs/Data_HitReaction.md；这里每个数都写了物理含义，调参前先读它。
//
// 坐标约定：演员局部系，+X 右手、+Y 上、−Z 正面（人物正面一律 −Z，AGENTS.md 契约 4）；
// 骨头 "L"/"R" 是人物自己的左右手，R 在 +X。所有长度米、角度弧度（limitDeg 除外，写度更好读）。
//
// 表在本地可编辑：与 Data_Tuning_Ai 同一个开关（TAIERZHUANG_TUNING_EDITABLE），线上与纯 Node 测试里照旧冻结。
const Freeze = (typeof globalThis === "object" && globalThis.TAIERZHUANG_TUNING_EDITABLE) ? (value) => value : Object.freeze;

/**
 * 「有效冲量」不是真实弹头动量：6.5 mm 弹头约 6–7 N·s，真打在人身上几乎看不出位移。
 * 看得见的受击是肌肉惊跳和失稳，所以按「看起来像」反推一个有效冲量 P，
 * 但**冲量怎么分给各段骨头（力臂 × 惯量）和怎么回复（弹簧 + 阻尼）是真物理**。
 * P = referenceNs × severity，severity = gain × clamp(伤害 / refDamage, minRatio, maxRatio)。
 * 伤害取**未乘部位倍率的原始伤害**（rawDamage）：动量是弹的事，不是打中哪一段的事；
 * 头 / 躯干 / 四肢的不同反应由几何（力臂、惯量、链）算出来。
 */
export const IMPULSE = Freeze({
  referenceNs: 46,
  // 「步枪档」= bullet：汉阳造 / 中正式 / 三八式（伤害 70–78）都在 refDamage 附近。
  kinds: Freeze({
    bullet: Freeze({ gain: 1.0, refDamage: 75, minRatio: 0.5, maxRatio: 1.6 }),
    // 机枪单发伤害比步枪低，但连射与弹重让每发都更「顶」人：按 1.4 档。
    hmg: Freeze({ gain: 1.3, refDamage: 45, minRatio: 0.6, maxRatio: 1.6 }),
    // 大刀重劈是 1.2–1.6 倍步枪档（重刃 1.3 kg 全臂抡出来）。
    blade: Freeze({ gain: 1.2, refDamage: 90, minRatio: 0.6, maxRatio: 1.5 }),
    // 刺刀 / 长枪捅：沿枪轴一记短促的顶。
    thrust: Freeze({ gain: 1.25, refDamage: 105, minRatio: 0.6, maxRatio: 1.4 }),
    // 枪托 / 拳砸。
    melee: Freeze({ gain: 1.0, refDamage: 60, minRatio: 0.6, maxRatio: 1.5 }),
    // 爆炸：伤害本身已按距离衰减，近爆的 dmg 可以很大 → 上限放宽，让胸部可以顶到限位。
    blast: Freeze({ gain: 2.2, refDamage: 100, minRatio: 0.25, maxRatio: 3.0 }),
  }),
  // 白刃：冲量方向 = 攻击方向 × (1−w) + 扫刀方向 × w（刀是横着扫过去的，力主要沿扫刀方向）。
  bladeSweepWeight: 0.3,
});

/**
 * 人体（Dempster 人体测量表，70 kg 成年男性）。关节位置取 Tengxian 共用骨架的站姿比例，
 * 参考身高 referenceHeightM，运行时按演员身高等比缩放（关节位置也会在命中时按活的骨骼位置覆盖，见 Script_HitReactionLayer）。
 * segments 每一行是一段质量：mass 占体重的比例、from→to 两个关节、ratio 是质心离 from 的比例（Dempster）、
 * bone 是「这段质量跟着哪根弹簧骨转」。惯量在绑定时算：I_b = Σ_{b 及其子孙骨上的段} m·(|d|²·E − d·dᵀ) + 段自身转动惯量。
 */
export const BODY = Freeze({
  massKg: 70,
  // 关节表按 Tengxian 模型自己的比例量（GLB 高 1.817，含头盔）；演员比它矮（1.68），按 演员身高/1.817 等比缩放。
  referenceHeightM: 1.817,
  // 站姿关节（参考身高）。x 右手为正；z 只放了脊柱微小的前后偏。
  joints: Freeze({
    pelvis: [0, 0.952, 0], spine: [0, 1.049, 0], spine1: [0, 1.195, 0], spine2: [0, 1.341, 0],
    neck: [0, 1.52, 0], head: [0, 1.548, 0], headTop: [0, 1.69, 0],
    upperArmR: [0.195, 1.485, 0], forearmR: [0.195, 1.20, 0], handR: [0.195, 0.95, 0], fingerR: [0.195, 0.83, 0],
    upperArmL: [-0.195, 1.485, 0], forearmL: [-0.195, 1.20, 0], handL: [-0.195, 0.95, 0], fingerL: [-0.195, 0.83, 0],
    thighR: [0.116, 0.952, 0], calfR: [0.10, 0.53, 0], footR: [0.084, 0.108, 0], toeR: [0.084, 0.04, -0.13],
    thighL: [-0.116, 0.952, 0], calfL: [-0.10, 0.53, 0], footL: [-0.084, 0.108, 0], toeL: [-0.084, 0.04, -0.13],
  }),
  // 骨盆段 14.2 + 腰段 13.9（脊柱一二节各半）+ 胸段 21.6 = 躯干 49.7；头颈 8.1；上臂 2.8 / 前臂 1.6 / 手 0.6；
  // 大腿 10 / 小腿 4.65 / 脚 1.45（每侧）。总和 = 100%。
  segments: Freeze([
    { id: "pelvis", bone: "pelvis", mass: 0.142, from: "pelvis", to: "spine", ratio: 0.3 },
    { id: "waistLow", bone: "spine", mass: 0.0695, from: "spine", to: "spine1", ratio: 0.5 },
    { id: "waistHigh", bone: "spine1", mass: 0.0695, from: "spine1", to: "spine2", ratio: 0.5 },
    { id: "chest", bone: "spine2", mass: 0.216, from: "spine2", to: "neck", ratio: 0.5 },
    { id: "head", bone: "head", mass: 0.081, from: "head", to: "headTop", ratio: 0.55 },
    ...["R", "L"].flatMap((s) => [
      { id: `upperArm${s}`, bone: `upperArm${s}`, mass: 0.028, from: `upperArm${s}`, to: `forearm${s}`, ratio: 0.436 },
      { id: `forearm${s}`, bone: `forearm${s}`, mass: 0.016, from: `forearm${s}`, to: `hand${s}`, ratio: 0.43 },
      { id: `hand${s}`, bone: `forearm${s}`, mass: 0.006, from: `hand${s}`, to: `finger${s}`, ratio: 0.5 },
      { id: `thigh${s}`, bone: `thigh${s}`, mass: 0.10, from: `thigh${s}`, to: `calf${s}`, ratio: 0.433 },
      { id: `calf${s}`, bone: `calf${s}`, mass: 0.0465, from: `calf${s}`, to: `foot${s}`, ratio: 0.433 },
      { id: `foot${s}`, bone: `calf${s}`, mass: 0.0145, from: `foot${s}`, to: `toe${s}`, ratio: 0.5 },
    ]),
  ]),
  // 段自身转动惯量 ≈ m·(len²/12)：把段当细杆（各向同性近似，只加在惯量张量对角线上）。
  ownInertiaLengthScale: 1.0,
});

/**
 * 参与的骨头（每根一个三维角位移 θ 和角速度 ω，叠在动画姿势上）。
 * parent 决定「谁是谁的子孙」（惯量与 FK 施加顺序都靠它）；freqHz / zeta 是活人肌张力下的弹簧；
 * limitDeg 是关节限位（超过就截到锥面，并去掉向外的角速度）。
 * 脊柱三节：转得最多的是上面那节（胸），下面两节各出一部分；颈与头比躯干更软更快。
 * isotropic：惯量按「垂直于骨长轴」的那一档各向同性取。手臂 / 颈 / 头的姿势千变万化（端枪时上臂指向侧前方，不是垂着），
 *   站姿张量里绕骨长轴的那一档极小（上臂 0.02 vs 0.37 kg·m²），照它算，端枪的手臂会被侧向力绕竖轴抡出去；躯干仍按张量（它始终大致直立）。
 * twistFreqScale：绕竖轴（Y，扭腰）的固有频率倍率——躯干的扭转比前后俯仰硬得多（肋骨与腹肌），不乘的话打肩会把胸拧得像麻花。
 */
export const BONES = Freeze({
  spine: Freeze({ parent: "pelvis", freqHz: 2.3, zeta: 0.6, limitDeg: 22, twistFreqScale: 2.6 }),
  spine1: Freeze({ parent: "spine", freqHz: 2.3, zeta: 0.6, limitDeg: 22, twistFreqScale: 2.6 }),
  spine2: Freeze({ parent: "spine1", freqHz: 2.6, zeta: 0.55, limitDeg: 28, twistFreqScale: 2.6 }),
  neck: Freeze({ parent: "spine2", freqHz: 3.4, zeta: 0.5, limitDeg: 32, isotropic: true }),
  head: Freeze({ parent: "neck", freqHz: 3.8, zeta: 0.45, limitDeg: 40, isotropic: true }),
  upperArm: Freeze({ parent: "spine2", freqHz: 3.2, zeta: 0.5, limitDeg: 75, isotropic: true }),
  forearm: Freeze({ parent: "upperArm", freqHz: 3.6, zeta: 0.5, limitDeg: 70, isotropic: true }),
});

/**
 * 受力段的链：命中落在哪一段，冲量分给哪几根骨头、每级留多少（share，受力段本身 1，往下逐级衰减）。
 * Δω_b = share × I_b⁻¹ · (r_b × J)；r_b = 受力点 − 该骨关节。
 * 前臂那一档 share 只有 0.12：前臂只有 ~1.5 kg，「有效冲量」按躯干反推的，原样套上去肘关节会被打到限位；
 * 这一档实际上是「小段质量对有效冲量的耦合系数」，不是力学上的份额。
 * {S} 是命中一侧（L/R）。腿部不走这张表（脚在地上，见 LEG_BUCKLE）。
 */
export const CHAINS = Freeze({
  head: Freeze([["head", 1], ["neck", 0.7], ["spine2", 0.35], ["spine1", 0.15]]),
  chestUpper: Freeze([["spine2", 1], ["spine1", 0.7], ["spine", 0.4]]),
  chestLower: Freeze([["spine", 1], ["spine1", 0.8], ["spine2", 0.45]]),
  upperArm: Freeze([["upperArm{S}", 1], ["spine2", 0.35], ["spine1", 0.15]]),
  forearm: Freeze([["forearm{S}", 0.12], ["upperArm{S}", 0.35], ["spine2", 0.2]]),
});

/**
 * 颈头「传递」：脖子把冲量的一部分传给头，等效于力作用在头的质心上（杠杆 = 头质心 − 颈关节）。
 * 所以打胸口，头相对胸会顺冲量方向甩一下（正面中弹头往后甩）。zone 没列的不传。
 */
export const NECK_TRANSFER = Freeze({
  zones: Freeze({ chestUpper: 1, chestLower: 0.7, upperArm: 0.8, forearm: 0.6 }),
  ratio: 0.16,          // 传给头的冲量占 J 的比例
  neckShare: 0.35,      // 颈那根骨头分到的份额（其余给头）
});

/**
 * 骨盆：被顶一下往冲量方向踉跄半步。骨盆没有转动（转了腿会跟着歪、脚会滑），只有平移。
 * Δv = J × velocityPerNs × zoneScale（水平分量）。弹簧把它拉回动画给的位置。
 */
export const STAGGER = Freeze({
  velocityPerNs: 0.027,
  zoneScale: Freeze({ head: 0.5, chestUpper: 1, chestLower: 1.1, upperArm: 0.55, forearm: 0.35, thigh: 0.7, calf: 0.5 }),
  freqHz: 1.5, zeta: 0.62,
  maxM: 0.16,
});

/**
 * 腿软：打腿膝盖一软、骨盆往下掉。脚在地上，所以「掉多少」和「腿怎么弯」是一个几何关系：
 * 大腿与小腿等长 L，髋前屈 α、膝屈 2α 时脚正好留在原地，髋降 d = 2L(1 − cos α) ⇒ α = acos(1 − d/2L)，膝角 β = 2α。
 * sink 是每条腿一个竖直弹簧（速度冲量 sinkMpsPerNs 给受力那条腿，另一条按 otherLegShare）。
 * 骨盆下沉 = 两腿 sink 的平均；每条腿按自己的 sink 算 α、β 施加到大腿 / 小腿骨上。
 * （契约表原先写「膝屈 12–30° 与下沉 5–12 cm」：脚不离地时 β=30° 只对应约 3 cm，两者互相矛盾，
 *  这里以几何为准，见 docs/Data_HitReaction.md §4。）
 */
export const LEG_BUCKLE = Freeze({
  sinkMpsPerNs: 0.036,
  otherLegShare: 0.8,
  // 打上身也有一点腿软（受惊的脚下一虚）：占受力腿量的比例。
  bodyHitShare: 0.03,
  freqHz: 1.9, zeta: 0.7,
  maxSinkM: 0.13,
});

/**
 * 积分器。半隐式欧拉，固定子步；掉帧时一帧最多 maxSubsteps 步（不追赶，纯确定性）。
 * 所有骨的 |θ|、|ω| 与骨盆偏移、腿软量都低于 sleep 阈值 → 休眠（清零、零开销）。
 */
export const SOLVER = Freeze({
  stepS: 1 / 240,
  maxSubsteps: 16,
  sleep: Freeze({ angleRad: 0.0012, omegaRadS: 0.04, offsetM: 0.0004, velocityMps: 0.01 }),
  // 这么久没被 Update 推进过（人被剔除 / 隐藏了）→ 醒来时直接清零，不带着陈旧的抖动出现。
  staleS: 1.0,
  // 超过这个距离（米）的人不叠反应：几十米外的受击肉眼分不出，省下每帧那点骨骼运算。
  maxDistanceM: 60,
});

/**
 * 死亡：肌张力丢失——弹簧变软、阻尼变大、不回弹；冲击动量只带进倒地动作的前段。
 * 死亡进度 t（0..1，PoseRagdoll 的归一化时间）：t ≤ fadeStartT 全幅，fadeEndT 线性→平滑降到 0，
 * **t ≥ fadeEndT 偏移严格为 0**（DEATH_CONTACT.poseEnd = 0.85 起按可见蒙皮做接地拟合，偏移没归零会把人拟合歪）。
 * 另有一层按**秒**的包络（fadeStartS → fadeEndS），两者取小：物理仿真库的倒地长 1.6–3.2 s，只按归一化进度的话
 * 长 clip 上冲击会拖到一秒半以后，人都躺平了胸口还在晃。
 */
export const DEATH = Freeze({
  frequencyScale: 0.55,
  dampingRatio: 0.85,
  impulseScale: 1.2,
  fadeStartT: 0.14,
  fadeEndT: 0.55,
  fadeStartS: 0.2,
  fadeEndS: 0.75,
  // 转向：剩余偏角在倒地开始后 yawBlendS 秒内平滑绕骨盆下方竖轴转过去——人还站着的时候拧完。
  // 按秒不按归一化进度：3 s 的 clip 若在进度 0–0.5 里转，尸体会在地上慢慢打转一秒半（验收时抓到的）。
  // yawBlendEndT 仍是硬上限（进度），保证转向在接地拟合（poseEnd）之前完成。
  yawBlendS: 0.35,
  yawBlendEndT: 0.5,
});

/**
 * 方向死亡选择（docs/Data_HitReaction.md §5）。
 * maxYawResidualDeg：所选动作的倒向与期望倒向的夹角超过这个数，就在倒地前段把可见朝向转过去，
 *   但最多转这么多（转太多整个人像被拧断）；库缺失退回 Kimodo A–D 时它们都往右倒，也吃这一条。
 * tieDeg：夹角差小于这个数的候选并列，按 seed 稳定抽（同一个人回放一致）。
 * crumpleChance：爆头时「原地瘫」与「顺冲量倒」各占的概率（按 seed 稳定抽）。
 * thrustFoldChance：刺刀捅中「捂着伤口折下去（朝攻击者）」占的概率，其余原地瘫。
 * 原地瘫的候选按仿真时打的部位（profile.impact.part）配对：爆头只取打头烘的那条，其余取打躯干烘的——
 *   爆头之后先站半秒再捂肚子弯下去（Crumple2 的前段）不像话。没有配对的才退回整个 crumple 池。
 */
export const DEATH_SELECT = Freeze({
  maxYawResidualDeg: 50,
  tieDeg: 15,
  crumpleChance: 0.5,
  thrustFoldChance: 0.5,
  // 打腿：往受力侧前方塌，前 / 侧的比例（unit = 侧向权重，其余给前向）。
  legSideWeight: 0.75,
});

/**
 * 库不在（或还没加载好）时退回的四条 Kimodo：实测倒向（演员局部 XZ，+X 右手、+Z 背后，
 * 取终帧头相对起点骨盆地面投影的方向，见 docs/Data_HitReaction.md §0 表）。四条全往右倒。
 */
export const FALLBACK_DEATH = Freeze({
  playbackRate: 1.6,
  clips: Freeze({
    DeathCollapseA: Freeze({ family: "right", fallLocal: [0.984, 0.180] }),
    DeathCollapseB: Freeze({ family: "right", fallLocal: [0.973, 0.231] }),
    DeathCollapseC: Freeze({ family: "right", fallLocal: [0.717, 0.697] }),
    DeathCollapseD: Freeze({ family: "right", fallLocal: [0.943, 0.332] }),
  }),
});

/** BlenderMCP 物理仿真的方向死亡动作库（契约 §6）。懒加载：开机不下载，第一次有人挨打时才 fetch。 */
export const DEATH_LIBRARY = Freeze({
  url: "./Animation/HitReaction/Animation_TengxianDeathImpact.json?v=deathImpact20260930",
  skeleton: "TengxianHumanoidV1",
});

/**
 * AI 被打之后的失稳：受击强度（severity）超过 minSeverity，下一发推迟 holdS × severity（≤ maxS）。
 * 人被打得后仰时不该还在稳稳开枪；数值小，只影响挨打那一瞬。
 */
export const AI_HOLD = Freeze({ minSeverity: 0.45, holdS: 0.32, maxS: 0.6 });
