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
      // 【2026-09-29】01 的 gain 10 → 7、airCut 显现之后不再钉在 450：见下面 swell / reveal。gain 10 是按 450 Hz 低通配的：低通打开到 2.2 kHz
      // 之后同一个音量多出一大截中频（实测近爆之后远声组 −21 dBFS，改前 −41…−31），压到 7（−3 dB），正好与 02（gain 7、airCut 620）接上，
      // 01 → 02 换步骤时新起的每一声不再突然轻 3 dB。
      // speechRate 0.8：开场两步台词占七成时间，全局 0.45 会让前线在过场里一直稀着；这两步远处只少起两成
      //（01 整段压在 450 Hz 以下，与台词的 1–4 kHz 不抢；电平另有对白侧链 −3 dB）。
      Trapped: { intensity: 0.75, gain: 7, airCut: 450, speechRate: 0.8, weights: { EastFlank: 1.6, NorthEastVillage: 1.4 }, roofDirt: true,
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
        //
        // 【2026-09-29】渐强不再是一条从进 01 起的计时曲线，改成跟着剧情走（用户：「传令兵说话的那一刻，外围的战场的声音就应该
        // 要显现了，现在战场声音的音效不够合理，没有沉浸感」）。u 分三段，形状（curve / intensityFrom / gainFrom / peakFact /
        // catchUpS）仍在这里，段与段的切换与「显现」的一切在下面 `reveal`：
        //   · 显现前（对白 Banter，洞里战斗间隙）：u 只从 0 慢爬到 reveal.lullU —— 稀、低、闷，但不是静音；
        //   · 传令兵开口（reveal.fact）：reveal.riseS 秒里 u → reveal.revealU，同时低通打开、交火翻倍、床拉开、加一段设计好的序列；
        //   · 之后 reveal.buildS 秒推到 1；近爆事实（peakFact）一到，剩下的 catchUpS 秒补完。
        // riseS 只在没有 reveal 块的步骤里才用（现在只有 01 有渐强，且它有 reveal —— 留着当数据表的完整形状）。
        // gainFrom 0.3 → 0.25、intensityFrom 0.4 → 0.25：显现前（u ≤ lullU 0.15）交火频次是顶的 0.29 倍、每一声 −11 dB，
        // 显现完成（u 0.8）是 0.78 倍、−3.6 dB —— 频次 ×2.7、单声 +7.5 dB，再加低通打开、更近的一圈、床拉开、序列，远声组整体 +12 dB 上下。
        // 旧曲线（0.4 / 0.3）显现前后只差 6 dB / ×1.3 且全程一个音色（450 Hz 以下），听起来是「越来越响」而不是「外面打起来了」。
        swell: { riseS: 50, curve: 1.6, intensityFrom: 0.25, gainFrom: 0.25, peakFact: "bunkerCollapsed", catchUpS: 2 },
        reveal: {
          // 触发：开场导演在传令兵远喊那句真正开始播放的那一刻记下的任务事实（A1 包）。跳阶段进 Orders 以后导演会补记，
          // 那种情况（进 01 时事实已经在）显现直接在「已显现」上，不再演一遍序列。
          fact: "runnerCallHeard",
          // 兜底（事实一直没来：A1 还没合入、调试入口、导演读不到），先到先算：
          //   phase 导演（host.frontShow.bunker）的相位进了 Orders 之后 afterS 秒 —— 现在的流程里这正是传令兵开口（Orders 第一句）；
          //   stageS 进 01 后这么多秒（夹具没有导演时只有这一条，比近爆早）；
          //   stuckS 有导演但相位一直没到 phase（卡住 / 节奏比 stageS 长）时的保险，比 stageS 长得多，正常流程里近爆事实先到。
          fallback: { phase: "Orders", afterS: 3, stageS: 52, stuckS: 100 },
          // 洞口「打开」的爬升：这么多秒里 open 由 0 → 1（平滑）。用户要「1–3 s 内明显起来」。
          riseS: 2.2,
          lullU: 0.15, lullRiseS: 34, revealU: 0.8, buildS: 26,
          // 每一声前线的低通（Hz）：显现前 = stages.Trapped.airCut（450，隔着土），显现后按 open 在对数上滑到 open；
          // 近爆之后（peakFact）afterBlastS 秒里滑回 afterBlast —— 耳鸣与闷耳是剧情档，02 起前线的 airCut 是 620，
          // 这里落在同一量级，免得 01 → 02 换步骤时新起的每一声突然换个音色。
          // 2200 = 三百米外的空气吸收（AIR_ABSORPTION：8 kHz × (78/300)^0.6 ≈ 3.6 kHz）再往下压一点：洞口还挡着一半，
          // 机枪的「哒哒」与步枪的「啪」能听出来，但不是站在洞口。
          cut: { open: 2200, afterBlast: 700, afterBlastS: 4 },
          // 中距离那一圈交火（sectors 里 ring: "mid"）open 过 fromOpen 才开始起。
          midRing: { fromOpen: 0.3 },
          // 远声组的床（bus: "far" 的层：洞里 shellingFar / battleFar）随 open 拉开：电平倍数、层自己低通截止的倍数。
          // 显现前 1（预设里原来的电平与 360 / 480 Hz），显现后 level × cut ×；近爆之后不收，02 换步骤时 releaseS 秒里收回。
          beds: { level: 2.6, cut: 3.2, releaseS: 4, speechScale: 0.55 },
          // 显现那一刻配乐让一下（Script_Audio.Duck：只压配乐与环境）：战场声要出得来。
          musicDuck: { seconds: 3.6, amount: 0.45 },
          // 序列期间（reveal 起 holdS 秒）随机交火先按住，声部让给序列。
          holdS: 4.6,
          // 序列（相对显现那一刻的秒数；位置是世界坐标，离 01 听者（−2, −126）约 175–285 m，门口朝东，正对着的一头最先响）。
          // kind：burst 一梭机枪；crackle 步枪噼啪连成一片（shots 发，落在 at..to 之间，spots 里轮着取）；
          // shell 场外近落弹一发（啸声在洞顶飞过、落在 100 m 上下，落土与木撑吱呀跟着，交给 BattleArtillery.Scripted）；
          // gunImpact 日军炮口闷响 + flightS 秒后落在 impact 处。gainDb 相对当前显现电平。
          beats: [
            { at: 0.10, id: "mg", kind: "burst", cue: "type92Far", side: "ija", pos: { x: 245, z: -150 }, spreadM: 20, burst: 9, gainDb: -1, yieldSpeech: true },
            { at: 0.35, to: 3.4, kind: "crackle", shots: 13, spreadM: 25, gainDb: -3, spots: [
              { side: "ija", x: 255, z: -145 }, { side: "nra", x: 172, z: -168 }, { side: "ija", x: 58, z: -372 }, { side: "nra", x: -12, z: -300 } ] },
            { at: 0.50, kind: "shell", yieldSpeech: true },
            { at: 1.45, after: "mg", gap: 1.35, kind: "burst", cue: "zb26Far", side: "nra", pos: { x: 160, z: -175 }, spreadM: 20, burst: 5, gainDb: -2 },
            { at: 3.00, kind: "gunImpact", flightS: 1.3, impact: { x: 190, z: -250 }, spreadM: 25, gainDb: -2 },
          ],
          // 说话时（传令兵那句、之后 BunkerOrders 的台词；话停后再算 holdS 秒，免得句间空隙里床一抽一抽）：
          //   · 序列里标了 yieldSpeech 的大件（机枪一梭、近落弹）最多等 deferS 秒等一句话过去再响，等不到就照响；
          //     标了 after 的（回击）跟在前一件（id）响过之后 gap 秒；
          //   · 显现之后每一条新起的前线声（序列的、随机交火的）压低 dipDb；远声组的床压到 beds.speechScale 倍（0.25 s 压、0.8 s 放）。
          // 为什么：改前台词块里「台词 RMS − 远声组 250 Hz–4 kHz RMS」的余量中位 25.9 dB，第一版显现后掉到 16 dB、7 % 的块不足 6 dB，
          // 这道让位把它拉回来（数字见 docs/Data_AudioWiring.md 3d）。侧链（dialogueFarDuck −3 dB）本来就在，这里是它之上的一层。
          speech: { deferS: 2.2, dipDb: -4, holdS: 0.9 },
        } },
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
      // 【2026-09-29】中距离两圈（远近层次）：原来五个扇区都在 300 m 外（最近 279 m），01 里只有「远」一层，
      // 场外近落弹（55–140 m）又比它们轻 25–40 dB，中间是空的。这两圈离 01 听者（−2, −126）175–285 m，只在传令兵开口之后
      // （stages.Trapped.reveal.midRing）才起，只打步枪与机枪（kinds）；门口朝东，MidEast 正对着。gainDb −5：同一个音量倍数下
      // 200 m 上的枪比 600 m 上的响 9 dB 上下（实测有效电平 +1…+5 dB，与身边台词一样响），压回比远处的「近一点」即可。其它步骤（02 起
      // 没有 reveal）一直不起。BattleSoundTest 里「远处前线 ≥ 280 m」的断言只管 ring 不是 mid 的扇区。
      { id: "MidEast", ring: "mid", minOpen: 0.3, gainDb: -5, kinds: ["rifleSkirmish", "mgDuel"], nra: { x: 170, z: -165 }, ija: { x: 280, z: -135 }, spreadM: 30, weight: 1 },
      { id: "MidNorth", ring: "mid", minOpen: 0.3, gainDb: -5, kinds: ["rifleSkirmish", "mgDuel"], nra: { x: -15, z: -300 }, ija: { x: 55, z: -375 }, spreadM: 30, weight: 0.8 },
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
     * 【2026-09-29】显现序列（stages[].reveal.beats）的声可以用到共享账的这么多条（其余随机交火仍按 maxVoices）。
     * 序列头几秒里要同时响：机枪一梭、步枪连成片、一发近落弹的三条（啸声 / 爆炸 / 低频层）、日军炮口。前线部分与随机交火同样封顶 5
     *（= maxVoices），共享账 8 里剩下的 3 条留给近落弹（BattleArtillery 起一发要留 3 条；第一版给到 7，序列把账占满，近落弹整发被跳过）。
     * 契约 §6 的合计上限不变。
     */
    scriptedMaxVoices: 5,
    /** 序列里的填充（步枪噼啪）为大件留几条声部：前线声部已经有 scriptedMaxVoices − 这个数 条在响时，噼啪的这一发不响（机枪一梭 + 回击 + 炮各占一条，留一条够了）。 */
    scriptedFillerReserve: 1,
    /**
     * 填充的这一发在本层账面上占多久（秒）。步枪一声本体 1.4 s（cueActiveS），噼啪要一秒四五发，按 1.4 s 记就是同时六七条，
     * 账根本放不下「连成片」；引擎里它照样响完自己的尾巴（yieldFirst：预算紧时最先让位），账面只按响头一段记。
     */
    scriptedFillerActiveS: 0.6,
    /**
     * 【2026-09-29】前线的爆炸落点带动洞顶落土（stages[].roofDirt 的步骤才有，现在只有 01 洞里）。原来洞顶掉土只跟场外近落弹走
     *（Script_BattleArtillery.wallDirt），而近落弹在洞里实测 10 条落土拒收 9 条、前线自己的远炮落地却没有任何洞里的反应 ——
     * 一发炮落下来洞里没有一点土掉下来，耳朵就把它算成「电视里的炮声」。chance 是每一发前线爆炸（explosionFar / impact）
     * 引起一次落土的概率，maxM 之外的爆炸不带；落土摆在听者头顶偏一点，比爆炸晚 delayS。
     * 声部：本层最多 maxVoices 条同时在响，并入 SharedBusy 那本账。
     */
    roofDirt: Object.freeze({ cue: "debrisFall", chance: 0.4, chanceOpen: 0.6, maxM: 520, volume: 0.2, airCut: 2600,
      offsetM: 0.6, riseM: 1.6, delayS: Object.freeze([0.06, 0.32]), activeS: 1.5, maxVoices: 2 }),
    /**
     * 【2026-09-29】远处枪炮的回声尾巴（只在带 reveal 的步骤里、open 过 fromOpen 之后；现在是 01 显现后）。实测远声组侧 / 中比（S/M）
     * −9…−18 dB：一场交火全是「一个点」发的声，方位靠 panner，尾巴靠一条全场混响；山坡与村子之间那一下「又弹回来」没有。
     * 一声机枪 / 炮响完 delayS 秒后从另一个方位（在听者周围转 turnDeg 度、距离 ×distanceScale）再来一条轻的、更闷的：
     * 声源同一条 cue、电平 gainDb、低通 ×cutFactor、机枪只回 burstShare 的发数。chance 是每条 cue 的概率；回声不再带回声，
     * 走前线同一本声部账（序列里的按填充算：大件挤不掉，账满了就不回）。
     */
    echo: Object.freeze({
      fromOpen: 0.5,
      chance: Object.freeze({ "amb.cannonFar": 0.7, explosionFar: 0.6, type92Far: 0.5, zb26Far: 0.35, type11Far: 0.35, launcherPop: 0.3 }),
      delayS: Object.freeze([0.45, 1.0]), gainDb: -9, cutFactor: 0.55, turnDeg: Object.freeze([40, 110]), distanceScale: 1.3, burstShare: 0.5,
    }),
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
        quietAfter: { fact: "bunkerCollapsed", seconds: 14 },
        // 【2026-09-29】洞里的近落弹听不见。改前实测（p012 实时，01 头 75 s）：落在 83–136 m 的 6 发，爆炸本体有效电平 −27…−34 dB、
        // 来袭啸声 −40 dB（同一段里前线的远炮在 385 m 外有效电平 +0 dB）—— 近的比远的轻 30 dB，分层是反的。三个原因：
        //   ① 70 m 以外走 explosionFar，它不在引擎的「爆炸封顶」表里（explosionNear / Mid / shellImpact 才封在 0.25），
        //      洞里射线被土挡死，判 1.0：−12 dB + 800 Hz；→ midM 150：55–140 m 一律走 explosionMid（封 0.25）；
        //   ② 音量没有随 01 的前线一起抬（stages.gain 10）；→ gain（下面 lull / open 两端，随 open 插值）；
        //   ③ 45–60 % 的落土与啸声被节点预算饿死（火场声叠了五层，见 docs/Data_AudioWiring.md 3d）—— 已在接线层修。
        // lull = 显现前（洞里战斗间隙：稀、低、闷）；open = 传令兵开口之后（低通打开、密度翻倍、更响）；按 stages.Trapped.reveal 的 open 插值。
        // incomingShare：啸声摆在「听者 → 落点」连线上这一比例处（原来摆在落点上空，100 m 外的啸声衰到 −40 dB；
        // 炮弹是从头顶飞过去的，飞过时最响）。
        midM: 150, incomingShare: 0.25, incomingGain: 2.4, incomingOcclusion: 0.15, thumpOcclusion: 0.15,
        lull: { perMin: 2.2, gain: 4, airCut: 900 },
        open: { perMin: 5.5, gain: 9, airCut: 2600 } },
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
    // 【2026-09-29】洞顶掉土与木撑吱呀原来没写 bus，走环境总线（×0.8 × 环境推子默认 10 %）：实测 01 洞里环境总线整体
    // −71 dBFS，这两样一次都听不见 —— 它们是「洞在挨炮」的反应，不是环境（鸟、风），不该归那个推子。改走 sfx（bus: "sfx"），
    // 电平按 sfx 上的量重配（0.2 / 0.18 是环境总线上、被推子压掉 22 dB 之前的量；场外近落弹自己的洞顶落土 debrisFall 在 sfx 上是 0.3）。
    events: Object.freeze([
      Object.freeze({ name: "amb.debris", perMin: 2.4, volume: 0.11, airCut: 2400, bus: "sfx" }),
      Object.freeze({ name: "amb.creak", perMin: 1.3, volume: 0.1, airCut: 1600, bus: "sfx" }),
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
