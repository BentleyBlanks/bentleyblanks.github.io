// Authored off-map front: no voices, damage, suppression or mission facts.
// Direct fire still comes from actual AI. Positions remain fixed in world space.
//
// 两套并存（2026-09-23）：
//   · `front` / `artillery` / `dugout` —— 01–06（Trapped … Orders）的新声景：
//     扇区化的「一方开火、另一方还击」交火生成器 + 场外近落弹 + 防炮洞环境切换。
//     口径见 docs/Data_AudioWiring.md「二之三」。
//   · `profiles` / `sources` —— 07 以后仍走原来的五个固定声源循环，一个数都没动
//     （这一轮只验 01–06，07 以后的声景不许被新东西拖着变）。
//
// 坐标是世界系（X 东、Z 南，米）：前线在北（z 更小）与东。交火两端各有一个锚点，
// 每一发在锚点周围 spreadM 里另挑位置 —— 是一条战线上的许多人，不是一个点在循环。
export const MISSION_BATTLE_SOUND = Object.freeze({
  version: "20260923-sectors",
  profiles: {
    // 【2026-09-09】车厢那两档原来**不在表里**，而 Update 遇到没有档的 stage 直接
    // return —— 于是开场的一分钟里，外面那条前线一声都没有，然后第一发直接炸在
    // 车边上。用户问的「一开始进车厢怎么就有炮弹爆炸」就是这个：没有由远及近的
    // 铺垫，炮击是**凭空**开始的。
    // 【2026-09-23】01–06 已改走下面的 `front` 生成器（Trapped 那条「头 24 秒不出声」
    // 是沿用军列的旧数，正是用户说的「01 远处前线等 24 s 才出声」），这里只留 07 以后。
    South:{gain:.46,interval:1.7},
    Village:{gain:.7,interval:1.25}, Melee:{gain:.6,interval:1.3}, Courtyard:{gain:.75,interval:1.2},
    TransferApproach:{gain:.6,interval:1.3},
    Transfer:{gain:.8,interval:1.1}, CartRide:{gain:.46,interval:1.7},
    AirFirst:{gain:.4,interval:1.5}, Carry:{gain:.65,interval:1.2},
    Dive:{gain:.35,interval:1.6}, Rescue:{gain:.6,interval:1.25},
    Regroup:{gain:.7,interval:1.2}, WallPath:{gain:.5,interval:1.5},
    ReceptionGate:{gain:.55,interval:1.4}, Handover:{gain:.55,interval:1.3},
    Death:{gain:.28,interval:1.8},
    BridgeOrders:{gain:.6,interval:1.3}, BridgeCover:{gain:.85,interval:1.1},
    BridgeWithdraw:{gain:.6,interval:1.3}, NightMarch:{gain:.3,interval:2},
  },
  // 【2026-09-27】用户：「背景里的枪声、车声、飞机、敌军的喊声完全都听不见」。07 以后远处的仗就是这五条。
  //   · 总线 ambience → far（Script_FirstLevelMissionBattleSound.UpdateLegacy）：原来跟着环境推子默认 10 % 一起 −22 dB；
  //   · 三条枪的 airCut 1000/950/700 → 3200/3200/3000：原来照旧空气公式（两百米 950 Hz）配的，按 ISO 9613-1
  //     两百多米上还有 4 kHz 上下（Data_Tuning_Audio.AIR_ABSORPTION）。两门炮的 650/600 不动：炮口闷响本来就在低频；
  //   · volume 枪 .055/.075 → .2/.27（+11 dB）、炮 .55/.42 → .78/.6（+3 dB）：只换总线的话，实测 08/10 这五条峰值
  //     仍比身边台词低 30 dB 以上（一两百米外、多半隔着房子，遮挡封顶 0.5）。改后远声组峰值在台词下 12–15 dB。
  sources: [
    {id:'WestRifles',cue:'rifleNraFar',x:-100,z:-210,y:5,volume:.2,airCut:3200,first:.7,intervals:[3.2,5.1,2.6,6.3]},
    {id:'EastRifles',cue:'rifleIjaFar',x:116,z:-195,y:5,volume:.2,airCut:3200,first:2.1,intervals:[5.5,3.8,6.2,3]},
    {id:'FrontMachineGun',cue:'type92',x:42,z:-226,y:5,volume:.27,airCut:3000,burst:5,first:3.4,intervals:[6.7,4.3,8.2,5.6]},
    {id:'NorthArtillery',cue:'amb.cannonFar',x:-72,z:-285,y:12,volume:.78,airCut:650,first:1.5,intervals:[11.2,8.4,13.7,9.5]},
    {id:'EastArtillery',cue:'amb.cannonFar',x:168,z:-250,y:12,volume:.6,airCut:600,first:7.3,intervals:[16.4,12.1,18.2,13.7]},
  ],
  speechGain:.62,

  /**
   * 01–06 的远处前线：扇区化交火生成器（Script_FirstLevelMissionBattleSound.FrontExchange）。
   *
   * 每个扇区是一段「我方一线 ↔ 日方一线」，距前沿 300 m – 1.5 km、方位各不相同。
   * 扇区空闲一段（gapS，按强度缩放）之后起一场交火：由一方先开，另一方隔 replyS
   * 还击，来回 rounds 轮；机枪对射、步枪零星对射、日军炮与掷弹筒打我方一线
   *（炮口闷响在日方炮兵阵地，落点在我方一线）。
   *
   * 强度 = 阶段基线（stages[].intensity，01 另乘 swell 渐强）× 场上交火的让位：屏幕上打得越凶
   *（AudioWiring 的 BattleIntensity），远处这一层起得越稀、越轻 ——
   * 03–05 近处本来就吵，远处再满密度就糊成一片。对白播放时新交火也少起。
   *
   * 走 sfx 总线、全部摆在 45 m 以外 → 引擎自动归进**远声组 farGain**，
   * 玩家连射时让路，对白侧链（Voice 包的 dialogueDuck）也压这一组。
   */
  front: Object.freeze({
    stages: Object.freeze({
      // 01：洞里听外面，闷（airCut）；醒来之前前线已经在打。三百米外的东西引擎的空气低通
      // 本来就压到 700 Hz，这里再往下压一档才是「隔着土」。
      // intensity / gain 是渐强的**顶**：近爆那一刻到这里，之后整段 01 就停在这里。
      // 【2026-09-26 开场过场加密】用户：「过场动画里的背景音乐和爆炸枪声略少，没有什么战场嘈杂的氛围」。
      // 改前实测（p012 实时 260 s，拦 audio.Play + 各总线 RMS）：01 前线每分钟约 70 声，但远声组中位 −82 dBFS、
      // 两句台词之间整条混音中位只剩 −57 dBFS —— 声数不算少，是**听不见**：880 m 外的 soundField 衰到 0.08、
      // 再过 450 Hz 的「隔着土」，每声只剩一记闷点。单声实测（静场、880 m、airCut 450、volume 1）：
      // rifleIjaFar 峰值 −40 dBFS、explosionFar −36、amb.cannonFar −38 —— 比 01 的台词峰值低近 30 dB。
      // gain 0.8→10（+22 dB）：远处步枪峰值约 −28、远炮约 −17 dBFS，台词峰值 −11 上下，仍在台词下面。
      // intensity 0.62→0.75：只加一点密度。试过 0.95：前线声部顶满 5 条、账面常年顶在预算上，
      // 近处声音（脚步、身边的枪）被饿死从 30 % 涨到 57 %；密度不是病根，响度才是。
      // airCut 450 不动（01 整段在洞里，MissionTest 钉着）。渐强（swell）的形状不动，起点跟着顶一起抬。
      // speechRate 0.8：开场两步台词占七成时间，全局 0.45 会让前线在过场里一直稀着；这两步远处只少起两成
      //（01 整段压在 450 Hz 以下，与台词的 1–4 kHz 不抢；电平另有对白侧链 −3 dB）。
      Trapped: { intensity: 0.75, gain: 10, airCut: 450, speechRate: 0.8, weights: { EastFlank: 1.6, NorthEastVillage: 1.4 },
        // 【2026-09-24 恢复渐强（用户拍板「恢复」）】旧口径（f581ac7dd 的 profiles.Trapped：
        // startAfterS 24、rampFromGain .3、rampS 30，即头 24 s 一声没有、之后 30 s 里音量 ×0.3 → ×1，
        // 第 54 s 到顶；MissionTest 断言「后一段的远炮比前一段响」）在 09-23 换新声景时被删了，
        // 01 变成恒定 0.62。这里恢复「由远及近」，但不恢复那 24 s 静默（新口径：首声 ≤ firstWithinS）。
        //   · 时间从进 01 算起，riseS 秒到顶。50 s ≈ 新导演的近爆时刻（2026-09-24 浏览器实测：
        //     Banter 2.5–34.4 s → Orders 34.4–48.6 s → Incoming 48.6 s → 近爆 50.4 s，见
        //     docs/Data_AudioWiring.md 二之三 3a）；旧曲线 54 s 到顶，两者只差几秒。
        //   · 近爆事实（peakFact）一出现，剩下的在 catchUpS 秒里补完 —— 黑屏盖着，听不出台阶；
        //     导演走得快（或从 Wake 起的调试入口）也保证近爆时已在顶上。
        //   · 近爆之后不回落：耳鸣与闷耳是剧情档（Data_OpeningStoryboards.perception.hearing）的事，
        //     近落弹有 quietAfter 14 s 让路；前线再掉下去，等闷耳退掉又得爬一次，像第二次渐强。
        //   · gain 在分贝上线性（gainFrom .3 ≈ −10.5 dB，沿用旧 rampFromGain），intensity（起交火的
        //     频次）线性；两者都按 u^curve 走，curve > 1 = 对白那半分钟里涨得慢、传令到近爆涨得快。
        swell: { riseS: 50, curve: 1.6, intensityFrom: 0.4, gainFrom: 0.3, peakFact: "bunkerCollapsed", catchUpS: 2 } },
      // 【2026-09-26】02 开场过场（Found → Released）同一轮加密：0.72/0.95 → 0.85/7（airCut 620 比 01 少吃一点，
      // gain 少抬 3 dB），speechRate 见 01。
      BunkerRescue: { intensity: 0.85, gain: 7, airCut: 620, speechRate: 0.8, weights: { EastFlank: 1.5, NorthEastVillage: 1.3 } },
      RearTrench: { intensity: 0.78, gain: 1 },
      Support: { intensity: 0.85, gain: 1 },
      MachineGun: { intensity: 0.9, gain: 0.95 },
      Tank: { intensity: 0.9, gain: 0.9 },
      Orders: { intensity: 0.6, gain: 0.85 },
    }),
    /** 扇区：两端锚点（世界坐标），spreadM 每发的散布，weight 起交火的相对频率。 */
    sectors: Object.freeze([
      { id: "NorthWestBank", nra: { x: -380, z: -330 }, ija: { x: -470, z: -640 }, spreadM: 60, weight: 1 },
      // 【2026-09-26】nra z −470 → −485：原来离 01 听者（0, −150）322 m、散布 50 m，最近能落到 272 m，
      // 与「远处前线都在 280 m 以外」（BattleSoundTest）的口径对不上，只是固定种子碰巧没抽到；开场加密换了随机序列后抽到 279 m。
      { id: "NorthRoad", nra: { x: 40, z: -485 }, ija: { x: 120, z: -820 }, spreadM: 50, weight: 1.1 },
      { id: "NorthEastVillage", nra: { x: 420, z: -360 }, ija: { x: 700, z: -620 }, spreadM: 70, weight: 1 },
      { id: "EastFlank", nra: { x: 620, z: -60 }, ija: { x: 1050, z: -180 }, spreadM: 70, weight: 0.9 },
      { id: "FarWest", nra: { x: -900, z: -120 }, ija: { x: -1250, z: -520 }, spreadM: 90, weight: 0.6 },
    ]),
    /** 日军炮兵阵地（炮口闷响从这里来，落点在各扇区我方一线）。gunSpreadM：每一门在阵地里的散布。 */
    guns: Object.freeze([{ x: -220, z: -1480 }, { x: 980, z: -1180 }]),
    gunSpreadM: 80,
    /**
     * 交火的写法：选中的概率 weight；数字对是 [最小, 最大]。
     * ijaFirst：日方先开火的概率（进攻方多半先开）。
     * mgDuel 里点射时顺带几支步枪：rifleShots 支，落在点射开始后 rifleAfterS 到「点射时长 + rifleTailS」之间。
     * barrage 之后我方机枪回击：answerDelayS 秒后、answerBurst 发。
     */
    exchanges: Object.freeze({
      rifleSkirmish: { weight: 1.0, ijaFirst: 0.55, rounds: [2, 4], shots: [2, 5], shotGapS: [0.25, 1.3], replyS: [0.7, 2.2] },
      mgDuel: { weight: 0.75, ijaFirst: 0.6, rounds: [2, 3], ijaBurst: [8, 15], nraBurst: [3, 6], rifleChance: 0.55,
        rifleShots: [1, 3], rifleAfterS: 0.1, rifleTailS: 0.6, replyS: [0.9, 2.4] },
      barrage: { weight: 0.3, shells: [2, 4], shellGapS: [1.4, 3.2], flightS: [2.4, 4.2], answerChance: 0.6,
        answerDelayS: [1, 2.5], answerBurst: [3, 6] },
      mortar: { weight: 0.35, shells: [1, 3], shellGapS: [1.0, 2.2], flightS: [1.3, 2.3] },
    }),
    /** 两边用什么声音。机枪数组按次挑（九二式重机 / 十一年式轻机）。 */
    sides: Object.freeze({
      nra: { rifle: "rifleNraFar", mg: ["zb26Far"] },
      ija: { rifle: "rifleIjaFar", mg: ["type92Far", "type11Far"], gun: "amb.cannonFar", mortar: "launcherPop", impact: "explosionFar" },
    }),
    /**
     * 每条 cue 的基础音量（sfx 总线、soundField 64 m 参考距离下的量）。
     * 五百米上 inverse（rolloff 0.45）衰到 0.25，0.7 × 0.25 ≈ 0.17 —— 比二百二十米外的远枪扇区层
     *（AudioWiring.FarSectors，0.65 × 0.48 × 强度）低 5 dB 上下：远的那一片更远。
     */
    // 【2026-09-27】整张 ×1.4（+2.9 dB），与 fieldRolloff 0.9 → 0.45、ISO 空气吸收同一轮：实测 01/04 远声组峰值
    // 仍比身边台词低 16–18 dB，3A 的远处战场层在台词下 12–15 dB（说话时再让对白侧链 −3 dB）。
    // 原值 0.5 / 0.5 / 0.45 / 0.52 / 0.45 / 1.3 / 1.2 / 0.9。01/02 的 stages.gain（10 / 7）不动。
    cueVolume: Object.freeze({
      rifleNraFar: 0.7, rifleIjaFar: 0.7, zb26Far: 0.63, type92Far: 0.73, type11Far: 0.63,
      "amb.cannonFar": 1.8, explosionFar: 1.7, launcherPop: 1.25,
    }),
    /** 引擎只保留 1000 m 内的 soundField；更远的摆到这里并按反比律补衰减（见 Place）。 */
    placeMaxM: 880,
    /** 摆位比耳朵高多少（米）：远处的声音贴地会被引擎的地面遮挡判定吃掉。 */
    placeRiseM: 3,
    /**
     * soundField 那一档 panner 的 inverse 衰减参数（照抄 Script_Audio 的 soundField 距离模型：
     * refDistance 64、rolloff 0.45）。只用来给摆到 placeMaxM 的远声补回两段距离之差。
     */
    // 【2026-09-27】fieldRolloff 0.9 → 0.45，与引擎 SOUND_FIELD_ROLLOFF 同一个数（战线是线声源，翻倍掉 3 dB）。
    fieldRefM: 64, fieldRolloff: 0.45,
    // 【2026-09-27】原来这里还有一道「600 m 外再压到 700→520 Hz」的高频（airCutFromM / airCutAtFarHz / airCutFarM），
    // 叠在引擎旧的 700 Hz 空气低通上，一公里外的交火只剩一团闷点。现在引擎按 ISO 9613-1 算空气吸收
    //（Data_Tuning_Audio.AIR_ABSORPTION）；摆到 placeMaxM 的远声由 Place 按**真实距离**补上同一条曲线。
    /** 同时在响的前线声部上限。 */
    maxVoices: 5,
    /**
     * 【2026-09-24 审查后加】前线 + 场外炮击合计的上限（契约 §6「场外炮击/前线床 ≤ 8」）。
     * 炮击优先（近、稀、要一发不落地响完），前线只拿剩下的。
     */
    sharedMaxVoices: 8,
    /**
     * 屏幕上打得凶（引擎 battleIntensity 过 hotAbove）时前线声部再收到 maxVoicesHot：
     * 03–04 的节点峰值本来就贴着 NODE_BUDGET 120，远处这一层最该让。
     */
    hotAbove: 0.6, maxVoicesHot: 3,
    /**
     * 每一声「还在响」算多久（秒）：直达声本体的长度，不含引擎回收要等的混响尾巴与传播延迟。
     * 机枪另加 发数 × 每发间隔（九二式 200 rpm、其余 500 rpm）。
     */
    cueActiveS: Object.freeze({
      rifleNraFar: 1.4, rifleIjaFar: 1.4, zb26Far: 1.0, type92Far: 1.1, type11Far: 1.0,
      "amb.cannonFar": 2.2, explosionFar: 2.6, launcherPop: 0.9,
    }),
    mgShotS: Object.freeze({ type92Far: 0.3, default: 0.12 }),
    /** 扇区空闲间隔（秒），除以 stage intensity × 让位。 */
    gapS: [5, 13],
    /** 首场交火最迟多久起（进阶段就要听得见，不许再等二十四秒）。 */
    firstWithinS: 1.2,
    /** 场上交火让位：live 强度 1 时频次 × (1 − rateYield)、音量 × (1 − volumeYield)。 */
    rateYield: 0.5, volumeYield: 0.35,
    /** 对白正在播时新交火的频次倍率（电平交给 Voice 包的侧链，不在这里压第二道；stages[].speechRate 可按步骤覆盖）。 */
    speechRate: 0.45,
    jitterVolume: [0.8, 1.1],
  }),

  /**
   * 01–06 的场外近落弹（Script_BattleArtillery 调度；机制数在 Data_Tuning_Audio.BATTLE_ARTILLERY）。
   * 落点限定在 zones 的矩形里（无人地带与北侧斜坡，不是我方沟网），离听者 minM–maxM，
   * 离任何活人 ≥ avoidSoldierM。perMin 是平均每分钟几发。
   * quietAfter：某个事实发生后这么多秒内不落（01 近爆之后的黑屏与醒来，交给剧本那一发）。
   * airCut：这一步每一声再压一道高频（Hz），给「整段隔着土」的步骤用。
   * listenerZone：这一步听者**一定**在哪个空间档（洞顶掉土、洞里震得重按它算，不等接线层判）。
   *   01 整段躺在洞里：旧布设的小屋判不成 dugout（判 courtyard），新洞室合入前靠它保底。
   * 落区矩形避开的是「有人的地方」（活人 avoidSoldierM、在场的战车 avoidVehicleM，都在运行时查）；
   * 矩形本身按 2026-09-23 之前的布设画的，Space 包重排无人地带后要跟着改。
   */
  artillery: Object.freeze({
    // 2026-09-24 Front 包按 01–06 新空间重画（Data_FirstLevelSpace0106_20260923）：旧的 NorthSlope / EastField
    // 把战车整条路（东北台地路堑 → 路弯 → 坎线以北封口）和北侧出发壕都罩在里面。现在五块都离战车路线每一段
    // ≥ 12 m、离出发壕 ≥ 10 m、不碰我方沟网与旧院（Script_FirstLevelFrontPacingTest ⑥ 量）；「离活人 ≥ 10 m」
    // 仍由 Script_BattleArtillery 逐发判。矩形只画到 03–05 听者 140 m 上下：PickPoint 随机挑块再挑点、只试 8 次，
    // 大块里够不着的面积会让整发落空（第一版画到 x ±200，Support 档在缺口处一次命中率只有 16%，旧表 28%，
    // 这一版 62%；观察射台 12% → 49%、集结处 7% → 36%）。
    zones: Object.freeze([
      { id: "NorthSlopeWest", xMin: -100, xMax: 20, zMin: -275, zMax: -233 },   // 北侧出发壕（z −222）以北
      { id: "NorthSlopeEast", xMin: 20, xMax: 120, zMin: -275, zMax: -245 },    // 台地路堑起点（z −229）以北
      { id: "EastDepth", xMin: 78, xMax: 150, zMin: -165, zMax: -95 },          // 南路（x ≤ 63）、旧院与路弯出口以东
      { id: "WestField", xMin: -125, xMax: -80, zMin: -225, zMax: -110 },       // 老周左枪位（x −34）以西
      { id: "NoMansLandWest", xMin: -80, xMax: -50, zMin: -212, zMax: -172 },   // 土坎西端外的田：左枪位外 22 m 起
    ]),
    stages: Object.freeze({
      // 01 整段在洞里：隔着土与洞口，落弹只剩闷响（airCut）与洞顶掉土。
      // 【2026-09-26 开场过场加密】改前实测 01 的 130 s 里场外近落弹只响了 1 发啸声 + 几发闷响（2.2 发/分，
      // 对白期间 ×0.4 抽稀，近爆后 14 s 静默）；75 m 起落，碎土雨（dirtRainM 75 m 以内）一次都轮不到。
      // perMin 2.2→4.5、minM 75→55（偶尔落进 75 m 以内，土块砸回来）；对白期间只抽掉两成（speechRate 0.8）。
      // quietAfter 14 s 不动（黑屏与醒来留给剧本那一发与耳鸣）。
      // selfCapped：改前实测开场两步的炮弹一半以上被引擎饿死（9/19 层收下；加密后 6/38）—— 它们在 45 m 外，
      // 按低优先级套 NODE_BUDGET × 0.62 的天花板，而账面中位 75–83 早过了 74.4；能偷的前线比它远、却比它响。
      // 本层自己封顶（maxVoices 4、与前线合计 ≤ 8），与前线 DrainFront 同一个口径按整份预算进门。03 起不标、不变。
      Trapped: { perMin: 4.5, minM: 55, maxM: 140, airCut: 900, listenerZone: "dugout", speechRate: 0.8, selfCapped: true,
        quietAfter: { fact: "bunkerCollapsed", seconds: 14 } },
      BunkerRescue: { perMin: 3.5, minM: 55, maxM: 130, speechRate: 0.8, selfCapped: true },
      RearTrench: { perMin: 2.4, minM: 45, maxM: 120 },
      Support: { perMin: 2.2, minM: 45, maxM: 120 },
      MachineGun: { perMin: 1.6, minM: 55, maxM: 120 },
      Tank: { perMin: 1.0, minM: 60, maxM: 120 },
      Orders: { perMin: 1.0, minM: 70, maxM: 140 },
    }),
    /** 对白播放时的频次倍率（stages[].speechRate 可按步骤覆盖）。 */
    speechRate: 0.4,
    /** 头一发最早多久落（进阶段先让前线床铺开，再来近的）。 */
    firstAfterS: 4,
    /** 头一发在 firstAfterS 之后多少秒内随机落（进一步 4–9 s 先来一发，之后按本档频次）。 */
    firstSpreadS: 5,
  }),

  /**
   * 01–02 防炮洞环境床：forced = 这一步整段都在洞里；zone = 按听者所在空间档切
   *（dugout ↔ outside），holdS 滞回、fadeS 交叉淡。
   */
  dugout: Object.freeze({
    preset: "firstLevelDugout", outside: "firstLevelFront",
    stages: Object.freeze({ Trapped: "forced", BunkerRescue: "zone", RearTrench: "zone" }),
    /**
     * 【2026-09-26】按步骤换一对预设（没写的步骤用上面的 preset / outside）。开场两步用
     * OPENING_AMBIENCE_PRESETS 那两档（远处战场床走远声组），03 起回到原来两档、一个数不变。
     */
    presets: Object.freeze({
      Trapped: Object.freeze({ preset: "firstLevelOpeningDugout", outside: "firstLevelOpeningFront" }),
      BunkerRescue: Object.freeze({ preset: "firstLevelOpeningDugout", outside: "firstLevelOpeningFront" }),
    }),
    holdS: 1.0, fadeS: 1.6,
  }),
});

/**
 * 【2026-09-26】第一关开场（01 Trapped、02 BunkerRescue，过场为主）的两档环境床。
 * 由 Script_Audio 并进 AMBIENCE_PRESETS，形状与那里的注释一致（layers / events / space）。
 *
 * 为什么另起两档、不改 firstLevelDugout / firstLevelFront：那两档 03–06 的实战还在用，这一轮只改开场。
 *
 * 与原两档的区别只有「远处战场」那两层（shellingFar 连绵闷炮、battleFar 远处交火人群）：
 *   · `bus: "far"`：进远声组（→ 对白侧链 −3 dB → sfx 总线），不再走环境总线。环境推子默认 10 %
 *     （2026-09-11 用户要求「环境床默认 10%」），改前实测这两层在 01 里整体 −70 dBFS 上下，等于没有；
 *     它们是「远处在打仗」的声音，与前线生成器同一组让路。风与洞里的吱呀/掉土仍走环境总线、仍归那个推子。
 *   · 不带 `battle`：过场里身边没人开火，战场强度常年在 0–0.1，带 battle 的层会被压到 ×0.34；
 *     开场要的是「外面一直在打」，与近处打不打无关。
 *   · 低通（cut）：洞里 360 / 480 Hz 与原档相同；洞外 900 / 1500 Hz —— 让出台词的 1–4 kHz，
 *     床只占低频与中低频，对白侧链之外再靠频段避让。
 * gain 是 sfx 总线上的量（原档的 0.2–0.34 是环境总线 ×0.8 × 推子 0.1 之前的量，不能直接比）。
 * 实测（p012 实时）：两层合起来 RMS 约 −44 dBFS（洞里）/ −46（洞外），台词 RMS 约 −26 —— 低 18 dB 上下。
 * 第一版给到 0.9 / 0.7，远声组整片 −31 dBFS，只比台词低 7 dB，压回了四分之一。
 * 节点：与原两档同样三层（每层 5–6 个常驻节点），不多一层。
 */
export const OPENING_AMBIENCE_PRESETS = Object.freeze({
  firstLevelOpeningDugout: Object.freeze({
    space: "dugout", fallbackWind: 0.03, fallbackCut: 220,
    layers: Object.freeze([
      Object.freeze({ bed: "shellingFar", gain: 0.17, seg: 9, cut: 360, bus: "far" }),
      Object.freeze({ bed: "battleFar", gain: 0.14, seg: 11, cut: 480, bus: "far" }),
      Object.freeze({ bed: "windPlain", gain: 0.08, seg: 13, cut: 260 }),
    ]),
    events: Object.freeze([
      Object.freeze({ name: "amb.debris", perMin: 2.4, volume: 0.2, airCut: 2400 }),
      Object.freeze({ name: "amb.creak", perMin: 1.3, volume: 0.18, airCut: 1600 }),
      Object.freeze({ name: "amb.cannonFar", perMin: 2.6, volume: 0.5, airCut: 260, battle: true }),
    ]),
  }),
  firstLevelOpeningFront: Object.freeze({
    space: "open", fallbackWind: 0.045, fallbackCut: 480,
    layers: Object.freeze([
      Object.freeze({ bed: "windPlain", gain: 0.30, seg: 13 }),
      Object.freeze({ bed: "battleFar", gain: 0.1, seg: 11, cut: 1500, bus: "far" }),
      Object.freeze({ bed: "shellingFar", gain: 0.12, seg: 9, cut: 900, bus: "far" }),
    ]),
    events: Object.freeze([
      Object.freeze({ name: "amb.cannonFar", perMin: 3.2, volume: 0.55, battle: true }),
      Object.freeze({ name: "rifleNraFar", perMin: 5.5, volume: 0.10, battle: true }),
      Object.freeze({ name: "rifleIjaFar", perMin: 5.0, volume: 0.10, battle: true }),
      Object.freeze({ name: "zb26Far", perMin: 2.0, volume: 0.08, burst: 5, battle: true }),
      Object.freeze({ name: "type92Far", perMin: 1.6, volume: 0.08, burst: 4, battle: true }),
      Object.freeze({ name: "amb.crow", perMin: 0.7, volume: 0.3 }),
    ]),
  }),
});
