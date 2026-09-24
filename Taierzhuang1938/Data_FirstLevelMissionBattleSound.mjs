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
  sources: [
    {id:'WestRifles',cue:'rifleNraFar',x:-100,z:-210,y:5,volume:.055,airCut:1000,first:.7,intervals:[3.2,5.1,2.6,6.3]},
    {id:'EastRifles',cue:'rifleIjaFar',x:116,z:-195,y:5,volume:.055,airCut:950,first:2.1,intervals:[5.5,3.8,6.2,3]},
    {id:'FrontMachineGun',cue:'type92',x:42,z:-226,y:5,volume:.075,airCut:700,burst:5,first:3.4,intervals:[6.7,4.3,8.2,5.6]},
    {id:'NorthArtillery',cue:'amb.cannonFar',x:-72,z:-285,y:12,volume:.55,airCut:650,first:1.5,intervals:[11.2,8.4,13.7,9.5]},
    {id:'EastArtillery',cue:'amb.cannonFar',x:168,z:-250,y:12,volume:.42,airCut:600,first:7.3,intervals:[16.4,12.1,18.2,13.7]},
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
      Trapped: { intensity: 0.62, gain: 0.8, airCut: 450, weights: { EastFlank: 1.6, NorthEastVillage: 1.4 },
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
      BunkerRescue: { intensity: 0.72, gain: 0.95, airCut: 620, weights: { EastFlank: 1.5, NorthEastVillage: 1.3 } },
      RearTrench: { intensity: 0.78, gain: 1 },
      Support: { intensity: 0.85, gain: 1 },
      MachineGun: { intensity: 0.9, gain: 0.95 },
      Tank: { intensity: 0.9, gain: 0.9 },
      Orders: { intensity: 0.6, gain: 0.85 },
    }),
    /** 扇区：两端锚点（世界坐标），spreadM 每发的散布，weight 起交火的相对频率。 */
    sectors: Object.freeze([
      { id: "NorthWestBank", nra: { x: -380, z: -330 }, ija: { x: -470, z: -640 }, spreadM: 60, weight: 1 },
      { id: "NorthRoad", nra: { x: 40, z: -470 }, ija: { x: 120, z: -820 }, spreadM: 50, weight: 1.1 },
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
     * 五百米上 inverse 衰到 0.14，0.5 × 0.14 ≈ 0.07 —— 比二百二十米外的远枪扇区层
     *（AudioWiring.FarSectors，0.65 × 0.31 × 强度）低 6 dB 上下：远的那一片更远。
     */
    cueVolume: Object.freeze({
      rifleNraFar: 0.5, rifleIjaFar: 0.5, zb26Far: 0.45, type92Far: 0.52, type11Far: 0.45,
      "amb.cannonFar": 1.3, explosionFar: 1.2, launcherPop: 0.9,
    }),
    /** 引擎只保留 1000 m 内的 soundField；更远的摆到这里并按反比律补衰减（见 Place）。 */
    placeMaxM: 880,
    /** 摆位比耳朵高多少（米）：远处的声音贴地会被引擎的地面遮挡判定吃掉。 */
    placeRiseM: 3,
    /**
     * soundField 那一档 panner 的 inverse 衰减参数（照抄 Script_Audio 的 soundField 距离模型：
     * refDistance 64、rolloff 0.9）。只用来给摆到 placeMaxM 的远声补回两段距离之差。
     */
    fieldRefM: 64, fieldRolloff: 0.9,
    /** 远于 airCutFromM 的再压一道高频（引擎的空气低通到 700 Hz 就不往下了）。 */
    airCutFromM: 600, airCutAtFarHz: 520, airCutFarM: 1500,
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
    /** 对白正在播时新交火的频次倍率（电平交给 Voice 包的侧链，不在这里压第二道）。 */
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
    zones: Object.freeze([
      { id: "NorthSlope", xMin: -150, xMax: 150, zMin: -330, zMax: -205 },
      { id: "EastField", xMin: 60, xMax: 200, zMin: -250, zMax: -90 },
      { id: "WestField", xMin: -200, xMax: -80, zMin: -250, zMax: -120 },
    ]),
    stages: Object.freeze({
      // 01 整段在洞里：隔着土与洞口，落弹只剩闷响（airCut）与洞顶掉土。
      Trapped: { perMin: 2.2, minM: 75, maxM: 140, airCut: 900, listenerZone: "dugout",
        quietAfter: { fact: "bunkerCollapsed", seconds: 14 } },
      BunkerRescue: { perMin: 1.1, minM: 70, maxM: 130 },
      RearTrench: { perMin: 2.4, minM: 45, maxM: 120 },
      Support: { perMin: 2.2, minM: 45, maxM: 120 },
      MachineGun: { perMin: 1.6, minM: 55, maxM: 120 },
      Tank: { perMin: 1.0, minM: 60, maxM: 120 },
      Orders: { perMin: 1.0, minM: 70, maxM: 140 },
    }),
    /** 对白播放时的频次倍率。 */
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
    holdS: 1.0, fadeS: 1.6,
  }),
});
