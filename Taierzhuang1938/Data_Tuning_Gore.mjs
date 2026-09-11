// 断肢系统的**全部数字**（契约 10：纯数据、零 three、带出处注释）。
// 口径文档：docs/Data_Dismemberment.md §3。规则读表的地方在 Script_Dismemberment.mjs，
// 视觉/物理读表的地方在 Script_CharacterGore.mjs；两边都不许再写第二个常数。
//
// 【骨名怎么写】十套卢沟桥 GLB 的关节名形如 `Bip001 L Forearm` / `Bip002 L Finger02`
// —— **有空格、没有点号**（GLTFLoader 会删点号，这批本来就没有，见
// `gltfloader-strips-dot-in-bone-names` 那条账）。所以 bones 正则按 `^Bip\d+ ` 开头写。
// 注意运行时读到的名字里空格已经被 GLTFLoader 换成了下划线（`Bip001_L_Forearm`），
// 归一化在 `Script_Dismemberment.LimbForBone` 里做，这张表按**源名**写。
//
// 【肢体 id 必须与 Data_CharacterHitbox.CHARACTER_HITBOX_PROFILE 的 shape id 同名】
// 子弹命中交出来的是 shape.id，规则层直接拿它当肢体名；对不上就等于「打中了小臂
// 却卸掉了大腿」。Script_DismembermentTest 有一条互核断言看着它。

/** 内容总闸。`?gore=0` 与 `Debug.Gore.SetEnabled` 在运行时覆盖它（见 Script_Dismemberment）。 */
export const ENABLED = true;

/**
 * 可卸掉的肢体。躯干不切（不做腰斩，见 §12 明确不做）。
 *
 *   bones       —— 这一段肢体**占有**的骨子树（按骨名正则匹配）。顶点按权重最大的
 *                  那根骨归属，命中最深的一段（forearm 比 upperArm 深）。
 *   joint       —— 断口所在的语义骨（boneRoles 的键）。断面盖挂在它身上。
 *   axisTo      —— 断口轴的另一端（joint→axisTo 就是肢体伸出去的方向）。
 *   capRadius   —— 断面半径（米，名义值，运行时乘 rig 世界缩放）。取自
 *                  CHARACTER_HITBOX_PROFILE 的同名 shape 半径，这样断面正好盖住
 *                  命中体的横截面，不会出现「盖子比胳膊细」。
 *   mass        —— 刚体质量（kg）。按 70 kg 成年男性的节段质量比估（Dempster 1955：
 *                  上臂 2.8% / 前臂+手 2.2% / 大腿 10% / 小腿+足 6.1% / 头 8.1%），
 *                  取整到便于手调的值。
 *   halfLength  —— 胶囊半长（米）。按同名命中体两端骨距的一半量。
 *   contains    —— 这一段被卸掉时一起飞走的下游段（整条胳膊/整条腿）。
 */
export const LIMBS = Object.freeze({
  upperArmL: Object.freeze({ bones: /^Bip\d+ L (UpperArm|Forearm|Hand|Finger)/, joint: "upperArmL", axisTo: "forearmL", capRadius: 0.075, mass: 3.5, halfLength: 0.28, contains: Object.freeze(["forearmL"]) }),
  forearmL: Object.freeze({ bones: /^Bip\d+ L (Forearm|Hand|Finger)/, joint: "forearmL", axisTo: "handL", capRadius: 0.060, mass: 1.8, halfLength: 0.24, contains: Object.freeze([]) }),
  upperArmR: Object.freeze({ bones: /^Bip\d+ R (UpperArm|Forearm|Hand|Finger)/, joint: "upperArmR", axisTo: "forearmR", capRadius: 0.075, mass: 3.5, halfLength: 0.28, contains: Object.freeze(["forearmR"]) }),
  forearmR: Object.freeze({ bones: /^Bip\d+ R (Forearm|Hand|Finger)/, joint: "forearmR", axisTo: "handR", capRadius: 0.060, mass: 1.8, halfLength: 0.24, contains: Object.freeze([]) }),
  thighL: Object.freeze({ bones: /^Bip\d+ L (Thigh|Calf|Foot|Toe)/, joint: "thighL", axisTo: "calfL", capRadius: 0.10, mass: 10, halfLength: 0.40, contains: Object.freeze(["calfL"]) }),
  calfL: Object.freeze({ bones: /^Bip\d+ L (Calf|Foot|Toe)/, joint: "calfL", axisTo: "footL", capRadius: 0.075, mass: 4.5, halfLength: 0.30, contains: Object.freeze([]) }),
  thighR: Object.freeze({ bones: /^Bip\d+ R (Thigh|Calf|Foot|Toe)/, joint: "thighR", axisTo: "calfR", capRadius: 0.10, mass: 10, halfLength: 0.40, contains: Object.freeze(["calfR"]) }),
  calfR: Object.freeze({ bones: /^Bip\d+ R (Calf|Foot|Toe)/, joint: "calfR", axisTo: "footR", capRadius: 0.075, mass: 4.5, halfLength: 0.30, contains: Object.freeze([]) }),
  // 头是球：没有第二个端点可以定轴，轴由 neck→head 现算（见 Script_CharacterGore）。
  head: Object.freeze({ bones: /^Bip\d+ Head$/, joint: "head", axisTo: null, capRadius: 0.06, mass: 4.5, halfLength: 0.11, sphere: true, contains: Object.freeze([]) }),
});

/**
 * 伤害来源 → 断肢判定。
 *
 *   chance        —— 「这一发已经致死」前提下卸掉一段的概率（limb / head 两档）。
 *   requiresKill  —— true 表示只在这一发本来就打死了人时才可能断。
 *   minDamage     —— 乘过部位倍率后的单发伤害下限；累计阈值另见 accumulatedDamage。
 *   modes         —— 只有这些白刃动作算数（劈砍才卸肢，捅刺不卸）。
 *   （没有 killOnSever：**断肢永远不改变生死** —— 六类来源全部 requiresKill，只有
 *     Debug.Gore 的 force 通道会把一发抬成致死，那是测试场的按钮不是玩法。）
 *
 * 概率是**推定值**，来源是写实向 3A 的共同口径（Sniper Elite 5 的步枪弹极少卸肢、
 * 近炸几乎必卸），实测微调记在 docs/Data_Dismemberment.md §11。
 */
export const SEVER_RULES = Object.freeze({
  // 2026-09-12 玩家反馈：部位倍率后的步枪伤害仅 40–47，旧 60 门槛永远到不了。
  // 同一命中段累计达到阈值时必断；不把左右肢或其它身体部位的伤害混在一起。
  bullet: Object.freeze({ chance: Object.freeze({ limb: 0.06, head: 0.0 }), requiresKill: true, minDamage: 20, accumulatedDamage: 100 }),
  hmg: Object.freeze({ chance: Object.freeze({ limb: 0.30, head: 0.12 }), requiresKill: true, minDamage: 20, accumulatedDamage: 90 }),
  // 爆炸按 falloff 分档（falloff = 1 − 距离 / (半径 × BLAST.radiusScale)；木柄手榴弹
  // 6.5 m × 1.9 = 12.35 m 有效半径，1 m ≈ 0.91、2 m ≈ 0.83、3 m ≈ 0.75、3.7 m ≈ 0.70）。
  // 没有这张分档表时 3 m 外的人与爆心旁的人一样能连卸四段（2026-09-10 测试场实测
  // ring1=[3,4] / ring3=[2,2]）；分档之后 1 m 圈四段、2 m 圈两段、3 m 圈只掉一段，
  // 再远一段都不掉。tiers 按 minFalloff 降序，取第一条满足的；都不满足 = 不断。
  blast: Object.freeze({
    // **只在本来就致死的那一发上卸肢**（requiresKill）。第一版写的是「未致死也卸、卸了抬成致死」，
    // 结果炮击近失弹把本来只是受伤的同班战友炸死 —— 第一关开场有「列车到机枪位之前同班一人阵亡
    // 即失败」的规则（Script_FirstLevelOpening.Update），断肢不许改任何一个人的生死。
    chance: Object.freeze({ limb: 0.95, head: 0.35 }), requiresKill: true,
    minFalloff: 0.70,
    tiers: Object.freeze([
      Object.freeze({ minFalloff: 0.88, minLimbs: 2, maxLimbs: 4, extraLimbChance: 0.85, chance: 1 }),
      Object.freeze({ minFalloff: 0.80, minLimbs: 1, maxLimbs: 2, extraLimbChance: 0.60, chance: 1 }),
      Object.freeze({ minFalloff: 0.70, maxLimbs: 1, extraLimbChance: 0 }),
    ]),
  }),
  // 大刀按实际瞄准方向与骨骼命中体选段；不再用两条胳膊的随机池兜底。
  blade: Object.freeze({ chance: Object.freeze({ limb: 0.80, head: 0.30 }), requiresKill: true, modes: Object.freeze(["slash", "cut"]), pool: "blade" }),
  thrust: Object.freeze({ chance: Object.freeze({ limb: 0, head: 0 }), requiresKill: true }),
  bash: Object.freeze({ chance: Object.freeze({ limb: 0, head: 0 }), requiresKill: true }),
});

// 简单几何判定的手感参数；距离按实际世界命中体计算，头不进爆炸随机池。
export const HIT_GEOMETRY = Object.freeze({
  blastLegWeight: 2, blastDistanceFloorM: 0.25,
  meleeToleranceM: 0.12, meleeReachM: 2.8,
});

/**
 * 来源别名：调用点交出来的 kind 不止上面六个。
 * vehicle（车载重机枪）与 emplaced（架设九二式）都按 hmg 判；debug 是 Debug.Gore.Sever
 * 那条直通路（一定断，概率表用不上，但仍要有一条 LAUNCH 给初速）。
 */
export const KIND_ALIASES = Object.freeze({
  vehicle: "hmg",
  emplaced: "hmg",
  grenade: "blast",
  shell: "blast",
  melee: "blade",
  slash: "blade",
  cut: "blade",
});

/**
 * 没有命中体 id 时的候选段。
 *   arm / leg —— AI 打 AI 那条链只抽到 "arm" / "leg" 这种粗部位（Script_Ai 3611 行那一掷），
 *                按部位限在对应的四段里，不再「打中胳膊掉大腿」；
 *   blade     —— 保留的显式候选池；正常大刀链必须给真实 shapeId，不走随机兜底。
 *                头单独走 head 那一档骰（要命中体报 head）。
 *   blast     —— 贴地炸先卸腿（爆心通常在脚边），权重在 Script_Dismemberment.BLAST_WEIGHT。
 * 每一项都必须是 LIMBS 的键；Script_DismembermentTest 互核。
 */
export const LIMB_POOLS = Object.freeze({
  arm: Object.freeze(["upperArmL", "forearmL", "upperArmR", "forearmR"]),
  leg: Object.freeze(["thighL", "calfL", "thighR", "calfR"]),
  blade: Object.freeze(["upperArmL", "forearmL", "upperArmR", "forearmR"]),
});

/**
 * 同屏肢块预算，按 `?quality=` 名取（Data_Tuning_Graphics 不加键，见 §10.3）。
 *   maxParts       —— 同屏肢块上限，FIFO 淘汰。每段 1 draw + 断面 1 draw。
 *   partLifeS      —— 肢块寿命（秒）。尸体保留到关底，肢块不：它们是动态件。
 *   spurtS         —— 断口喷血持续秒数（动脉喷射在现实里是十几秒，这里只取头几秒）。
 *   spurtRate      —— 每秒血粒子数（走 Vfx 的 spawnScale 再乘一次画质系数）。
 *   decalsPerSever —— 一次断肢在地上最多补几片血渍（贴花池是环形缓冲，血不许把
 *                     墙上的弹孔冲掉，见 Script_Vfx.Blood 末尾那段账）。
 *   restToStaticS  —— 肢块静止多久之后拆刚体只留网格（省物理）。
 */
export const BUDGET = Object.freeze({
  low: Object.freeze({ maxParts: 6, partLifeS: 12, spurtS: 1.6, spurtRate: 18, decalsPerSever: 1, restToStaticS: 2.5 }),
  medium: Object.freeze({ maxParts: 10, partLifeS: 20, spurtS: 2.4, spurtRate: 26, decalsPerSever: 2, restToStaticS: 2.5 }),
  high: Object.freeze({ maxParts: 16, partLifeS: 30, spurtS: 2.8, spurtRate: 32, decalsPerSever: 2, restToStaticS: 2.5 }),
  ultra: Object.freeze({ maxParts: 24, partLifeS: 45, spurtS: 3.0, spurtRate: 36, decalsPerSever: 3, restToStaticS: 2.5 }),
});

/** 画质名不在表里时用哪一档（与 Script_Vfx 的 QUALITY_PRESETS 同一条兜底口径）。 */
export const DEFAULT_QUALITY = "high";

/**
 * 肢块**到寿命之后什么时候真收**（§5.2）。
 *
 * `partLifeS` 一到就删，玩家正盯着看的那一段胳膊会在眼前凭空消失。3A 的做法是
 * 「过了寿命只是取得回收资格，真收要等玩家看不见」，这里两个数就是那道闸：
 *
 *   despawnDistanceM —— 离相机超过这么远就不必再做视锥判定，直接收。30 m 是本作
 *                       步兵交战距离的下半段，一段前臂在这以外只有几个像素，
 *                       收掉看不出来。
 *   hardLifeScale    —— 硬上限倍数。玩家一直盯着不放时的兜底：`partLifeS × 2` 到点
 *                       必收，否则被盯住的那一片能永远占着预算与一次 draw。
 *
 * 预算挤出（`GoreBudget` 的 FIFO 淘汰）**不受这两条影响**，仍然立即回收 ——
 * 那条路是「同屏上限」，让位比连续性重要。
 */
export const PART_RETIRE = Object.freeze({
  despawnDistanceM: 30,
  hardLifeScale: 2,
});

/**
 * 肢块初速。speed 是 [下限, 上限] 的米/秒，up 是额外的抬升，spin 是角速度上限（rad/s）。
 * 步枪弹只把肢体「掀开」半步；近炸真的抛得出去；大刀劈下来的那一段基本是落地。
 */
export const LAUNCH = Object.freeze({
  bullet: Object.freeze({ speed: Object.freeze([3.5, 5.5]), up: 1.2, spin: 9 }),
  hmg: Object.freeze({ speed: Object.freeze([4.5, 7.0]), up: 1.6, spin: 11 }),
  blast: Object.freeze({ speed: Object.freeze([6, 12]), up: 3.5, spin: 14 }),
  blade: Object.freeze({ speed: Object.freeze([2.5, 4]), up: 1.0, spin: 6 }),
  thrust: Object.freeze({ speed: Object.freeze([2.0, 3.0]), up: 0.8, spin: 5 }),
  bash: Object.freeze({ speed: Object.freeze([2.0, 3.0]), up: 0.8, spin: 5 }),
  debug: Object.freeze({ speed: Object.freeze([3.0, 5.0]), up: 1.4, spin: 8 }),
});

/**
 * 刚体参数（交给 Script_Physics.MakeLimbBody）。
 * 摩擦给高：肢体落地不该滑冰（与 MakeCorpse 的 1.1 同一条理由，这里略低一点，
 * 因为肢块比整具尸体轻，太高会「一落地就钉死」）。
 */
export const LIMB_BODY = Object.freeze({
  friction: 0.9,
  restitution: 0.15,
  linearDamping: 0.25,
  angularDamping: 0.6,
  /** 静止判据：线速度与角速度都低于这两个门槛才开始计时。 */
  restLinear: 0.28,
  restAngular: 0.9,
  /**
   * 贴地时的**角速度**阻力（1/s）。
   *
   * 解析地形不在 Rapier 世界里，肢块落地是靠 `ClampToGround` 手写的，那一条只
   * 管平动；不补这一项的话，一段躺在地上的胳膊会一直原地转，全靠 angularDamping
   * 0.6 慢慢磨（实测 13 rad/s 要转四秒半才降到静止门槛以下，肉眼就是「地上有个
   * 陀螺」）。6/s 相当于摩擦一挡就停，约 0.45 s 收住。
   */
  groundSpinDrag: 6,
  /**
   * 贴地时把竖着的胶囊**放倒**的角速度（rad/s，乘 |轴的竖直分量|）。
   *
   * 解析地形没有接触力，一段竖着落地的大腿在 Rapier 眼里悬在空中、没有任何力矩
   * 让它倒下；再配上 ClampToGround 按姿态把最低点顶到地面，它就会像根木桩一样
   * 立在地上（2026-09-10 炸坑实拍：一截大腿竖在牌子旁边）。这里补的就是那一记
   * 重力力矩：轴离水平越远推得越狠，躺平了自然归零。
   */
  groundTipRate: 8,
  /** 轴的竖直分量小于这个数就算「躺平了」，不再推（免得贴地的胳膊微微抖）。 */
  groundTipDeadzone: 0.12,
});

/**
 * 断面盖的几何与配色。
 *   ringOuter/ringInner —— 断面外径与骨茬内径（相对 capRadius 的比例）。
 *   boneLength          —— 骨茬伸出断面的长度（相对 capRadius）。
 *   segments            —— 圆周分段。12 段：盘 12 + 环 24 + 骨茬 36 ≈ 72 三角，
 *                          在 §7 的「≤120 三角」以内。
 *   fleshColor/boneColor —— sRGB 十六进制。断面不是鲜红，是暗红发褐（Data_HistoryMaterial）。
 */
export const CAP = Object.freeze({
  ringOuter: 1.0,
  ringInner: 0.34,
  boneLength: 0.55,
  segments: 12,
  // 0x6b1410（方案稿那档暗红）转线性之后只剩 0.15 亮度，实拍是一枚**近乎全黑**的
  // 圆片，读起来像一个洞不像断面（`_shots/Gore/11b_stump_closeup.png`）。抬到这一档
  // 才看得出是肉；再亮就变成番茄酱了。
  fleshColor: 0x8a231c,
  boneColor: 0xd8cbb0,
  fleshRoughness: 0.62,
  boneRoughness: 0.78,
});

/**
 * 一次断肢的血量：一次性血雾的强度、断口持续源的锥角、肢块自带的弱血源秒数。
 *
 * burstAmount 从方案稿的 1.6 降到 1.1：`Script_Vfx.Blood` 的雾体片按 amount 线性
 * 放大（`sizeEnd = 0.5 × amount × far`），1.6 在两米内实拍是**一整面红墙**，
 * 把断面和肢块全糊住了（`_shots/Gore/11_standing_cut.png` 那一张）。
 * 远处不吃亏：距离补偿那一档（far 最高 4 倍）本来就在管七十米上的可读性。
 */
export const BLOOD = Object.freeze({
  burstAmount: 1.1,
  spurtSpread: 0.45,
  spurtSpeed: Object.freeze([2.2, 5.2]),
  partSpurtSeconds: 0.8,
  partSpurtRate: 12,
});

/** 断肢时把死亡推力乘一下（被炸飞的人多退半步，见 §8.1）。 */
export const DEATH_PUSH_SCALE = 1.6;

/**
 * 断肢的**声音**（接线在 Script_CharacterGore，配方与混音在 Script_Audio）。
 *
 * 两条 cue，理由分别是：
 *   · `goreSever` —— 断的那一瞬间。没有它的时候，一条胳膊在画面上飞出去是**无声**的，
 *     而同一发子弹的入肉声（impactFlesh）照旧在响 —— 玩家听到的是「普通一枪」，
 *     看到的是「断了一条胳膊」，两件事对不上。播在断口（options.point，没有就取关节）。
 *   · `goreLimbLand` —— 那一段落地的一记。肢块是真刚体、会飞两三米，落点常常在
 *     玩家视野边缘；一记湿闷响是「它落在哪」的唯一线索（与 grenadeBounce 同一条理由）。
 *
 * 一次卸多段（近炸）**只播一条 sever**：四条同时响就是一团糊，而且 Play 的同帧
 * 去重窗（22 ms）本来也会把后面几条丢掉 —— 与其让引擎随机丢，不如在这里只发一条，
 * 音量按段数抬一点点（多卸一段抬 volumePerLimb，封顶 volumeMax）。
 *
 *   landSpeedMinMs —— 落地那一帧的**竖直速度**下限（m/s）。低于它不发声：
 *                     贴着地滑出去的那种「落地」在现实里没有声音，
 *                     而 ClampToGround 每一帧都可能返回 true（肢块沿坡滑行时）。
 *   landCooldownS  —— 同一段肢块两次落地声之间的最短间隔（秒）。刚体在坡上会连着
 *                     几帧被顶回地面，不设这道闸就是一串连响。
 *   landMaxCount   —— 同一段肢块最多响几次（第一次是落地，之后是弹跳）。
 */
export const GORE_AUDIO = Object.freeze({
  severVolume: 0.95,
  volumePerLimb: 0.12,
  volumeMax: 1.3,
  landVolume: 0.6,
  landSpeedMinMs: 2.2,
  landCooldownS: 0.35,
  landMaxCount: 2,
});
