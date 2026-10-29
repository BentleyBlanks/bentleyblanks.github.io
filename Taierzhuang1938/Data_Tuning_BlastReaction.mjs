// Data_Tuning_BlastReaction.mjs — 近爆的人物反应与耳朵受损（2026-10-21，用户在「人物战场反应测试场」提的）。
//
// 纯数据、零 three（契约 2、12）。三张表：
//   · BLAST_EXPOSURE  一发爆炸到人头上有多「响」：按装药量与距离算峰值超压（Kinney–Graham 公式），换成峰值声压级 dB，
//                     遮挡、背对爆点那只耳朵（头影）再扣。各种反应在各自的 dB 窗里从 0 涨到 1。
//   · BLAST_FLINCH    第一人称的身体反应：眨眼 / 闭紧眼、扭头避开、低头缩身、歪头、手臂收枪缩肩、手抖、恍惚、喘、心跳。
//   · EAR_TRAUMA      耳朵受损的听感：左右耳分开的「外界变小变闷、耳鸣音高处听力掉一个坑」+ 一条稳定的高音耳鸣。
//
// 消费方：Script_BlastExposure（算暴露）、Script_BlastFlinch（身体反应的时间曲线）、Script_AudioEarTrauma（WebAudio）。
// 口径与验收：docs/Data_BattleReactionRange.md。数是本项目调的手感，出处只用来定量级，不是复刻某款游戏。

/**
 * 峰值超压 → 声压级。
 *
 * Kinney & Graham《Explosive Shocks in Air》(1985) 的自由场 TNT 拟合式：
 *   Ps / Pa = 808·[1 + (Z/4.5)²] / √([1 + (Z/0.048)²]·[1 + (Z/0.32)²]·[1 + (Z/1.35)²])，Z = R / W^(1/3)（m / kg^(1/3)）。
 * 地面爆炸的反射按工程上常用的 1.8 倍当量算（UFC 3-340-02 对地面爆炸取 1.8）；填药当 TNT（苦味酸、TNT 当量都在 1 上下）。
 * 换成 dB SPL：20·log10(Ps / 20 µPa)。量级参照：手榴弹 5 m 约 177 dB、12 m 约 168 dB；150 毫米榴弹 35 m 约 168 dB。
 *
 * 各反应的 dB 窗 [从, 满]：x = (dB − 从) / (满 − 从)，夹到 0..1 再取 curve 次方。
 * 窗口照「什么距离该有什么反应」定（手榴弹为例）。2026-10-22 用户实测改过一轮：「离得比较远的时候眨眼应该就一刹那、
 * 头也基本上不动，35 m 反应仍然很大」「除非是连续引爆，不然眼睛不可能一直闭着」—— 头的反应窗往近处挪、曲线更陡（远处几乎为 0），
 * 闭紧眼的窗也往近处挪，单发闭紧的时长收短（连续炮击才越闭越久，见 BLAST_FLINCH.load）：
 *   blink   150–170：远处的一声只是眨一下（一刹那，约 0.15 s；越近合得越满）
 *   flinch  160–186（^1.6）：十来米内才看得出缩头转开，五米很明显，三米满；35 m 的 75 野炮约 1°（等于不动）
 *   squeeze 170–190：八九米内眼睛才闭紧一下（单发最多约 0.25 s），三米内闭得最久
 *   tinnitus 163–185：二十米内开始耳鸣（与原来通用耳鸣十二三米出闸同一量级），三米满
 *   daze    174–194：四米内才会发懵、视线发糊
 *   tremor  168–188：手抖（肾上腺素）
 *   body    166–186：之后喘粗气、听得见自己心跳
 */
export const BLAST_EXPOSURE = Object.freeze({
  ambientKPa: 101.325,
  referencePa: 20e-6,
  surfaceBurstFactor: 1.8,
  tntEquivalence: 1.0,
  /** 装药量查不到时按杀伤半径反推（半径 ∝ 装药的立方根；手榴弹 6.5 m ↔ 0.165 kg）。 */
  fallbackRadiusM: 6.5, fallbackChargeKg: 0.165,
  minChargeKg: 0.02, maxChargeKg: 250,
  /** 离爆心再近也按这个距离算（爆心里的数没有意义，人早就没了）。 */
  minDistanceM: 0.8,
  /** 隔着墙 / 沟壁：峰值超压绕射过来大约掉一半（−6 dB 量级），高频掉得更多，这里取 −8 dB。 */
  occludedDb: -8,
  /** 头影：背对爆点那只耳朵少挨多少（高频为主的冲击，人头挡掉的量级是 6–10 dB）。 */
  headShadowDb: -7,
  windows: Object.freeze({
    blink: Object.freeze([150, 170, 1.0]),
    flinch: Object.freeze([160, 186, 1.6]),
    squeeze: Object.freeze([170, 190, 1.3]),
    tinnitus: Object.freeze([163, 185, 1.05]),
    daze: Object.freeze([174, 194, 1.2]),
    tremor: Object.freeze([168, 188, 1.0]),
    body: Object.freeze([166, 186, 1.0]),
  }),
  /** 声速（米 / 秒）：反应从冲击波到人那一刻算起（看见火光在先，挨那一下在后）。 */
  soundSpeedMps: 343,
});

/**
 * 第一人称身体反应（Script_BlastFlinch）。角度一律弧度、位移一律米、时间一律秒。
 *
 * 时间线（以冲击到人的那一刻为 0）：
 *   眨眼     latency 后 closeS 合上，按强度停一下再睁开；强的还会再眨一次（睁眼时的余颤）。
 *   闭紧眼   squeeze 强时眼睛整个闭死 holdS，然后慢慢睁开；之后眯着眼 squintS 秒（灰、光、懵）。
 *   扭头     flinch 的主体：latency 后 attackS 内转开 + 低头 + 歪头 + 缩身 + 往背离爆点的一侧让一点，停 holdS，再 releaseS 回来。
 *            转开的方向 = 背离爆点；爆点几乎正前方时按一个确定的序列挑左右（不用 Math.random，出图可复现）。
 *   手臂     枪往下压、往胸口收、枪口下垂；头转开时手臂慢半拍、转得少（counterYaw），所以枪在画面里往爆点那一侧甩。
 *   手抖     之后几秒手在抖（8–11 Hz 生理震颤被肾上腺素放大）+ 一点慢晃，按强度衰减。
 *   恍惚     视线发糊、发灰、四周发暗（走后期合成里开场同一组通道），几秒内退掉。
 *   喘 / 心跳 强的那一下之后喘粗气、听得见心跳（Script_AudioWiring.BlastBody）。
 *
 * 连续近爆：每一发是一个事件，最多留 maxEvents 个；同一通道取各事件的「软最大」（不线性堆叠），并有单独的总上限。
 */
export const BLAST_FLINCH = Object.freeze({
  maxEvents: 6,
  /** 反射潜伏期：惊跳眨眼 30–50 ms、颈部肌肉 60–100 ms（取中值）。 */
  blinkLatencyS: 0.035,
  bodyLatencyS: 0.07,
  // 惊跳眨眼本身就是一刹那：合 40 ms、几乎不停、110 ms 睁开（整个约 0.15 s）。
  blink: Object.freeze({ closeS: 0.04, holdMinS: 0, holdSpanS: 0.04, openS: 0.11,
    /** 眼皮合多少 = 强度 / fullAt（弱的那一下只是眼皮跳一下）；强度到 fullAt 才合满。 */
    fullAt: 0.5,
    /** 睁眼时的余颤：闭紧强度过 rebound 才有（近爆），第二下合到 reboundClosure。 */
    rebound: 0.35, reboundAtS: 0.5, reboundClosure: 0.45, reboundCloseS: 0.05, reboundOpenS: 0.14 }),
  // 单发闭紧：最多停 holdMinS + holdSpanS ≈ 0.25 s 再睁开；连续炮击按 load 拉长（见下）。
  squeeze: Object.freeze({ closeS: 0.05, holdMinS: 0.03, holdSpanS: 0.22, openS: 0.18,
    /** 睁开后还眯着（灰、光）：闭紧强度过 squintFrom 才有，眯到 squint × 强度，squintS 秒退完。 */
    squint: 0.18, squintFrom: 0.3, squintS: 1.2 }),
  /**
   * 连续炮击的累积（2026-10-22 用户：「除非是连续引爆，不然眼睛不可能一直闭着」）：每发按自己的缩身强度往 load 里加，
   * load 按 tauS 秒指数漏；闭紧的停留 ×(1 + holdGain·load)、眯眼 ×(1 + squintGain·load)，封顶 max。
   * 单发时 load 只有这一发自己，基本不变；隔一两秒一发、发发都近，才越闭越久、眯着睁不开。
   */
  load: Object.freeze({ tauS: 2.5, max: 2, holdGain: 1.4, squintGain: 1.2 }),
  head: Object.freeze({
    attackS: 0.14, holdMinS: 0.06, holdSpanS: 0.45, releaseMinS: 0.4, releaseSpanS: 0.7,
    yawRad: 0.62,           // 约 35°：脸转开
    pitchRad: -0.34,        // 约 −19°：下巴往胸口收
    rollRad: 0.2,           // 约 11°：头歪向背离爆点那边
    dropM: 0.2,             // 缩身：眼位下沉
    sideM: 0.06,            // 往背离爆点那侧让一点
    /** 正前方（|lateral| 小）也要转开：前方的转开权重。 */
    frontYawShare: 0.55, minLateralForSide: 0.18,
    /** 头顶上（空爆、高处）多低一点头。 */
    overheadPitchShare: 0.45,
    /** 回位时带一点过冲再落定（弹回来的那一下），按强度。 */
    settleOvershoot: 0.12,
  }),
  // 2026-10-21 实拍：枪口下垂 18° + 下压 7 cm + 反向转回 55% 时，5 m 手榴弹那一下枪整个出了画面（像穿帮），收到现在这档。
  arms: Object.freeze({
    dropM: -0.035,          // 枪往下压
    pullM: 0.04,            // 往胸口收（相机空间 +Z）
    pitchRad: -0.14,        // 枪口下垂
    counterYaw: 0.3,        // 头转开时手臂跟得少：反向转回头转角的这么多
    counterRoll: 0.35,
    /** 手臂比头慢一点到位（秒）。 */
    lagS: 0.05,
  }),
  tremor: Object.freeze({ hz: 9.5, slowHz: 0.55, m: 0.0042, rad: 0.012, slowM: 0.006, slowRad: 0.01,
    holdS: 1.2, decayS: 5.5,
    /** 镜头也跟着一点（人在抖、眼睛在找焦点），远小于枪。 */
    cameraRad: 0.0035 }),
  daze: Object.freeze({ attackS: 0.12, holdS: 0.5, decayMinS: 1.6, decaySpanS: 4.5,
    /** 恍惚 → 后期合成：amount 管发灰与四周发暗，focus 管发糊与重影。 */
    amountScale: 0.75, focusScale: 1.0,
    /** 不在恍惚时，近爆也有一下极短的发糊（冲击震得眼球一晃）。 */
    jolt: 0.35, joltS: 0.35 }),
  body: Object.freeze({ breathMinS: 4, breathSpanS: 10, heartMinS: 6, heartSpanS: 16,
    heartBpmMin: 96, heartBpmMax: 132 }),
  /** 多发叠加的上限（各通道合成后的总量不超过单发满量的这么多倍）。 */
  stackCap: 1.25,
  /**
   * 眼皮透光：白天闭紧眼看到的是一片暗红（血管透光），不是全黑。后期合成里眼皮合上的那部分换成这个颜色
   *（显示线性值，调色之后），夜里乘 nightScale。开场导演的闭眼不用它（仍是全黑）。
   */
  lidGlow: Object.freeze({ rgb: Object.freeze([0.052, 0.011, 0.006]), nightScale: 0.12 }),
  /**
   * 眼皮的边（Script_EyelidMask，2026-10-29 用户：「炸飞时眨眼的 mask 边缘过于锐利，应该模糊一点」）。
   * 眼皮贴着眼球、在瞳孔前面两三毫米，视网膜上成不了边：过渡宽度 ≈ 瞳孔直径 / 距离 ≈ 4 mm / 3 mm ≈ 75°，比竖直视野还宽，
   * 眨眼看到的是整片暗下去、上面先暗一点。
   *   feather   上下眼皮各自的过渡半宽（屏高的比例；开场剧情那套是 0.065，看到的是画出来的两片眼皮）
   *   pupilDim  眼皮盖住瞳孔、进眼的光整体少了多少（× 闭合程度）
   */
  lidEdge: Object.freeze({ feather: 0.36, pupilDim: 0.55 }),
});

/**
 * 耳朵受损的听感（Script_AudioEarTrauma；Script_Audio 在「耳朵模型 = trauma」时用它，否则仍是原来的耳鸣）。
 *
 * 真的被炸过的耳朵（暂时性阈移 + 耳鸣）听起来是这样的，所以照这几条做：
 *   1. 外界整个小下去、变闷 —— 不只是一道低通：听阈抬高，轻的声音直接没了（gain），高频掉得最多（lowpass）；
 *      而且在耳鸣那个音高附近听力掉出一个坑（notch，4 kHz 一带最容易伤）。恢复时低频先回、整体响度其次、那个坑最后回。
 *   2. 耳鸣是一条**稳定**的高音（不是两条音互相拍出「嗡嗡」，也不是一直往下滑），只带极细的音高与响度起伏（神经噪声），
 *      刚炸完是一片宽的「沙——」，一两秒内收窄成一条细音。它在脑袋里，不在外面：不进混响、不走空间化。
 *   3. 两只耳朵分开算：朝爆点那只耳朵挨得重、鸣得久，另一只被头挡掉一截；所以耳鸣偏在一边，慢慢回到中间再消失。
 *   4. 起音期（attackHoldS）照旧：炸的那一声先完整过去，耳鸣与闷是「之后」的事。
 *   5. 世界安静下去以后，自己的心跳和喘气更显（由 AudioWiring.BlastBody 播，音量按这里的衰减补回来一部分）。
 *
 * 强度 s（0..1）每只耳朵一份，来自 BLAST_EXPOSURE.windows.tinnitus；连续近爆按「残余 + 新的」取大再加一点累积。
 */
export const EAR_TRAUMA = Object.freeze({
  /** 耳鸣音高：每局固定一个（人的耳鸣音高是固定的），在这个范围里按种子挑；单位 Hz。 */
  pitchMinHz: 3900, pitchMaxHz: 5200,
  /** 刚炸完音高略高一点，很快落定（不是一路往下滑）。 */
  pitchSettle: 0.012, pitchSettleTauS: 0.35,
  /** 音高的细微起伏：± 这个比例；响度起伏 ± amDepth。慢噪声的速率（Hz）。 */
  fmDepth: 0.0035, amDepth: 0.07, wobbleHz: 2.6,
  /** 窄带噪声：刚炸完 Q 小（宽的「沙——」），收窄到 Q 大（细音）。 */
  noiseQStart: 1.6, noiseQEnd: 22, noiseNarrowS: 1.6,
  /** 正弦相对窄带噪声的幅度（噪声收窄后约低 18 dB）。 */
  toneLevel: 0.62,
  /** 鸣响音量：强度 1 时每只耳朵的峰值增益（接在用户音效音量之后）。 */
  ringGain: 0.05, ringCurve: 0.8,
  /** 起音期之后鸣响长出来要多久；先有一段较快的回落（到 fastShare），再是长尾。 */
  ringAttackS: 0.28, ringHoldMinS: 0.25, ringHoldSpanS: 1.5,
  ringFastShare: 0.5, ringFastTauS: 0.9,
  /** 长尾：s = 1 时鸣多久（秒，到几乎听不见）；弱的按 s^ringLengthCurve 缩短。 */
  ringMinS: 2.2, ringSpanS: 20, ringLengthCurve: 1.4,
  /** 外界变闷：强度 1 时低通落到多少 Hz；按 s^lowCurve 几何插值。 */
  clearHz: 20000, muffledHz: 650, lowCurve: 0.85,
  /** 听阈抬高：强度 1 时外界整体小多少 dB；炸完那一下还额外再压一点（镫骨肌反射 + 饱和），很快回到平台。 */
  attenDb: 18, stunDb: 9, stunS: 0.45,
  /** 耳鸣音高处的听力坑：强度 1 时深多少 dB、Q 多少。 */
  notchDb: 22, notchQ: 1.1,
  /** 恢复：总时长 ttsMinS + ttsSpanS·s；三样各自按这个时长的一个比例当时间常数（低通最快、坑最慢）。 */
  ttsMinS: 1.6, ttsSpanS: 13,
  lowTauShare: 0.22, gainTauShare: 0.26, notchTauShare: 0.45,
  /** 闷住之前停留多久（起音之后）。 */
  plateauMinS: 0.2, plateauSpanS: 1.6,
  /** 起音期过后关门用多久（太快会「咔」，太慢爆炸尾巴就不闷）。 */
  closeS: 0.09,
  /** 起音期：触发它的那一声先完整过去（与 BLAST_HEARING.attackHoldS 同一个数）。 */
  attackHoldS: 0.13,
  /** 连续近爆：残余与新的取大，再加上较小那份的这么多（累积），封顶 1。 */
  stackShare: 0.3,
  /** 小于它就不算（不建节点）。 */
  minStrength: 0.04,
  /** 一条鸣响（两只耳朵共用一个振荡器）建几个节点；账本用。 */
  ringNodes: 14,
  /** 自己的心跳 / 喘：外界被压掉多少，就给它们补回多少（上限），听得见「自己」。 */
  bodyCompensationMax: 2.2,
});
