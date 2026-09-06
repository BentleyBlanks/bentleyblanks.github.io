// Data_Text_P012.mjs — 第一关 P0/P1/P2 白盒（Script_FirstLevelP012*）的目标、指引、交互与字幕文案。
// 纯数据，不 import three。键前缀 `p012.`，由 Data_Locale_zhCN.mjs 拼表；口径见 docs/Data_TextAndTuning.md。
// 占位符写 {name}，代码侧 T("p012.xxx", { name })。同一句话只登记一次，多处复用同一键。
//
// 分段（键的第二段就是段名）：
//   beat.*        拍表目标行。键由 Data_FirstLevelP012Beats.P012_BEATS 的 id 拼出（p012.beat.<id>.objective）。
//   objective.*   HUD 当前目标行。由 P012_OBJECTIVE_LINES 谓词表按 textKey 引用，代码不写字面键。
//   guide.*       屏幕上那枚导航牌的名字。由 P012_GUIDANCE_NAMES 谓词表引用。
//   point.*       交互点标签。由 P012_INTERACTION_SPECS 的 labelKey 引用。
//   hint.*        一次性提示（hud.Hint）。
//   whitebox.*    白盒场景自己的加载步骤、说明牌与色标图例。
//   shellShot.*   远处炮击那段观察演出的字幕。
// 后四段是静态 T("…") 引用；前三段是表驱动的动态键，登记在 DYNAMIC_PREFIXES 里，
// 由 Script_FirstLevelP012FlowTest 保证「表里每个 textKey 都有文案」。
export const TEXT = Object.freeze({
  // --- 拍表目标（Data_FirstLevelP012Beats.P012_BEATS）-----------------------
  "p012.beat.B00.objective": "跟随罗班长下车",
  "p012.beat.B01.objective": "领取步枪和子弹",
  "p012.beat.B02.objective": "跟随小队穿过集结村路",
  "p012.beat.B03.objective": "在村口跟上班长，继续北上接防",
  "p012.beat.B04.objective": "跟随班长北上",
  "p012.beat.B05.objective": "把弹药送到机枪阵位",
  "p012.beat.B06.objective": "观察前方田地",
  "p012.beat.B07.objective": "阻止正面步兵接近阵地",
  "p012.beat.B08.objective": "压制敌方机枪，恢复阵地火力",
  "p012.beat.B09.objective": "听掷弹筒发射声，离开旧枪眼",
  "p012.beat.B10.objective": "封锁西侧铁路涵洞",
  "p012.beat.B11.objective": "救助伤员，送回掩蔽部",
  "p012.beat.B12.objective": "到交通壕后送队集合点",
  "p012.beat.B13.objective": "沿交通壕、村口原路向南护送",
  "p012.beat.B14.objective": "侧绕残屋，压制道路机枪再回担架队",
  "p012.beat.B15.objective": "检查担架伤员，随班长到墙后收队",
  "p012.beat.B16.objective": "从墙后观察航迹，选择护送路线",
  "p012.beat.B17.objective": "处理扫射造成的道路阻碍",
  "p012.beat.B18.objective": "接住同一副担架后端，沿沟边搬运",
  "p012.beat.B19.objective": "避开扫射，准备还击",
  "p012.beat.B20.objective": "守住沟边，阻止日军接近伤员",
  "p012.beat.B21.objective": "清除近处敌人，尝试打开南路",
  "p012.beat.B22.objective": "观察南侧截断线",
  "p012.beat.B23.objective": "掩护后送队沿回撤沟道退回阵地",
  "p012.beat.B24.objective": "把伤员抬入掩蔽部",
  "p012.beat.B25.objective": "第一关结束",

  // --- 当前目标行（P012_OBJECTIVE_LINES）-----------------------------------
  // B01 领枪弹与集结
  "p012.objective.b01.crossVillage": "跟随小队穿过村路",
  "p012.objective.b01.takeAmmo": "到弹药桌领取子弹",
  "p012.objective.b01.briefing": "听罗班长交代接防任务",
  "p012.objective.b01.assemble": "随班长集结，准备前往北面阵地",
  // B03/B04 北上与炮击
  "p012.objective.b03.crossGate": "跟班长穿过村口，继续北上",
  "p012.objective.b04.follow": "跟随班长北上",
  "p012.objective.b04.covered": "已避开炮击，跟班长继续北上",
  "p012.objective.b04.shelling": "炮击逼近！跟班长继续北上；可借蓝色矮墙避炮，也可加速通过",
  // B05 送弹药
  "p012.objective.b05.delivered": "弹药已送达！到机枪旁的观察位，看向前方田地",
  "p012.objective.b05.pickup": "① 找到标记的弹药箱，靠近后按住 F 搬起",
  "p012.objective.b05.atDrop": "③ 已到机枪收弹处：面向收弹处，按住 F 交付弹药",
  "p012.objective.b05.carrying": "② 已搬起弹药箱：沿标记拐进交通壕，送往机枪收弹处",
  // B06—B10 阵地：机枪、掷弹筒、涵洞
  "p012.objective.b08.suppress": "压制村墙边的机枪；东侧枪眼可提供射击角度",
  "p012.objective.b09.mortarResolved": "掷弹筒组已{mortar}；转移到远离旧弹着点的安全枪眼",
  "p012.objective.mortar.stateCleared": "清除",
  "p012.objective.mortar.stateSuppressed": "受压制",
  "p012.objective.b09.mortarActive": "转到远离旧弹着点的安全枪眼，继续压制掷弹筒组",
  "p012.objective.b09.centerPort": "{mg}；沿胸墙低姿调整到中央枪眼，必要时装填并留意东侧动静",
  "p012.objective.b10.culvert": "转向西侧枪眼，封锁铁路涵洞",
  "p012.objective.port.traverse": "沿连续胸墙横移，前往{side}枪眼",
  "p012.objective.port.sideEast": "东侧",
  "p012.objective.port.sideWest": "西侧",
  // 掷弹筒实时预警压过当前拍的标称动作；机枪状态是可选前缀，所以各留一条整句。
  "p012.objective.mortar.flee": "掷弹筒来袭！可离开落点或利用实体掩体避炮",
  "p012.objective.mortar.fleeWithStatus": "{mg}；掷弹筒来袭！可离开落点或利用实体掩体避炮",
  "p012.objective.mortar.moved": "已离开落点；可沿胸墙转移，继续压制敌人",
  "p012.objective.mortar.movedWithStatus": "{mg}；已离开落点；可沿胸墙转移，继续压制敌人",
  "p012.objective.mg.cleared": "机枪威胁已清除",
  "p012.objective.mg.restored": "友军机枪已恢复射击",
  // B11—B13 伤员、报名、道路遭遇
  "p012.objective.b11.find": "找到地上的伤员，靠近后按住 F 查看伤势",
  "p012.objective.b11.dragging": "沿交通壕把伤员拖到标记的掩蔽部接收处",
  "p012.objective.b11.pickUp": "靠近伤员按 F 拖起，再沿交通壕送回掩蔽部",
  "p012.objective.b11.delivered": "伤员已安置，跟班长集合",
  "p012.objective.b12.volunteered": "已报名护送；听清罗班长的接应地点，准备随担架出发",
  "p012.objective.b13.hold": "敌人已暴露；到院墙后命令担架队停下",
  "p012.objective.b13.clear": "沿实体侧墙到射位，清除道路上的四名日军",
  "p012.objective.b13.release": "道路敌人已清除；照应担架队，班长正在组织继续前进",
  // B14 残屋侧绕（含三个火力点的战术提示）
  "p012.objective.ambush.g0": "从蓝色胸墙后起身观察道路，压制拦路火力",
  "p012.objective.ambush.g1": "注意屋内侧窗，清除室内射手再继续侧绕",
  "p012.objective.ambush.g2": "观察屋南出口，清除阻断回队道路的日军",
  "p012.objective.b14.proneApproach": "前方是低胸墙，卧倒可减少暴露；也可直接推进",
  "p012.objective.b14.covered": "可借胸墙隐蔽接近射击位",
  "p012.objective.b14.sprintGap": "掩体之间有空档，短冲刺到下一个射击角",
  "p012.objective.b14.threatReload": "{label}；可借掩体装填，再择机还击",
  "p012.objective.b14.roadCovered": "；前副担架已移入掩蔽",
  "p012.objective.b14.roadCleared": "；道路火力已清，前副担架正从院墙后移出",
  "p012.objective.b14.entry": "清除残屋伏兵；蓝色胸墙提供侧绕掩护",
  "p012.objective.b14.bandage": "压制道路火力；流血时可借胸墙掩护，按 B 包扎",
  "p012.objective.b14.clearBoth": "清除道路和残屋的敌人；可借胸墙掩护或侧绕",
  "p012.objective.b14.resolved": "伏兵已清除，回到担架队继续护送",
  "p012.objective.b14.rejoin": "沿原入口重新接回残屋侧翼，不要穿越院墙；现场敌情和剩余补给保持不变",
  // B15—B19 航迹、阻碍、担架、扫射
  "p012.objective.b15.inspect": "检查这副真实担架上的伤员",
  "p012.objective.b15.follow": "随担架到墙边停靠处，留意伤员状况",
  "p012.objective.b15.regroup": "跟班长收到矮墙后；他会面向铁路交代下一步",
  "p012.objective.b16.observe": "铁路方向有飞机！照应担架，可选择道路或沟边通过",
  "p012.objective.b16.choose": "自己判断：向右走开放路更快，向左贴沟边更稳",
  "p012.objective.b16.open": "沿选定的开放路接应担架，保持队伍展开",
  "p012.objective.b16.ditch": "沿选定的沟边路接应担架，利用蓝色沟岸遮蔽",
  "p012.objective.b16.tail": "接到担架队尾附近，照应伤员一起通过",
  "p012.objective.b17.afterFire": "扫射刚落下，确认路上伤员和翻倒小车的位置",
  "p012.objective.b17.turning": "飞机正在转向这条路，留意担架队，寻找路沟",
  "p012.objective.b17.carryCivilian": "从蓝色沟岸南端开口绕入，把受伤百姓送到墙后",
  "p012.objective.b17.choose": "选择：靠左背起伤员送到蓝墙后，或靠右推开小车转沟边",
  "p012.objective.b17.rescued": "伤员已入掩体；沿沟边回接同一副担架",
  "p012.objective.b17.cartCleared": "小车已推开；从沟边绕过扫射路面",
  "p012.objective.b18.carry": "接牢同一副担架后端，和前面的担架员沿沟边走",
  "p012.objective.b19.strafe": "飞机正在扫射！可利用路沟，也可冲出弹线；准备还击",
  // B20—B22 沟边固守、南路、封锁
  "p012.objective.closeFight.g0": "残屋方向有两人逼近，保护沟边的伤员",
  "p012.objective.closeFight.g1": "东侧缺口又有敌人逼近；可借蓝色沟岸接近射击",
  "p012.objective.closeFight.g2": "南端折角出现最后两人，阻止他们接近担架",
  "p012.objective.southFight.g0": "从路沟掩体清除南路道路火力",
  "p012.objective.southFight.g1": "绕过院墙，在胸墙后清除屋外射手",
  "p012.objective.southFight.g2": "从门口掩护位置观察室内，清除残敌再进屋",
  "p012.objective.b20.hold": "守住沟边伤员，确认接近的敌人已被清除",
  "p012.objective.b21.advance": "掩护担架沿已清路沟向南推进",
  "p012.objective.b21.house": "沿沟口绕进南路民房，清除近处日军",
  "p012.objective.b21.grenade": "；可向当前火力点投掷手榴弹",
  "p012.objective.b22.reenter": "沿原来的安全入口回到路沟，接应两副担架",
  "p012.objective.b22.assemble": "掩护两副担架到南路沟内集合，确认无人掉队",
  "p012.objective.b22.verify": "跟班长到南路实体掩体后，确认阻滞线是否仍在交火",
  "p012.objective.b22.blockade": "南路正遭到封锁；跟班长和担架会合，准备改道",
  "p012.objective.threat": "{label}",
  "p012.objective.movingShooter": "；敌人正转移到另一射击位，注意移动射手",
  "p012.objective.southApproach": "沿已清路沟的转角接近民房入口，绕开沟岸",
  // B23 撤回
  "p012.objective.b23.arrived": "担架已到阵地入口，沿沟道过去接稳后端，送伤员进入掩蔽部",
  "p012.objective.b23.smokeCover": "掩护担架改走西沟；班长将在撤退线施放烟幕",
  "p012.objective.b23.blockade": "南路断障无法通行；护送伤员改走西沟，班长负责烟幕",
  "p012.objective.b23.followWest": "跟班长和担架沿已清路沟改走西沟",
  "p012.objective.b23.recovery": "沿回撤沟接应实际担架队，到站后照应伤员",
  "p012.objective.b23.cover": "在路沟接应担架，跟上队伍，留意追兵",
  "p012.objective.b23.rejoin": "担架队落在后面，沿原路拐点回接，再一起撤退",
  "p012.objective.b23.lead": "在担架前方近距离引路，保持队伍一起移动",
  // 全局兜底：补给、缴获、回枪眼
  "p012.objective.resupply": "退到弹药箱补充桥夹 · 箱内剩 {clips}",
  "p012.objective.scavenge.weapon": "步枪打空，附近有可用枪械：靠近按 F 缴获（替换当前枪弹）；也可继续用手榴弹或白刃战",
  "p012.objective.scavenge.weaponLabel": "地上枪械 · 靠近按 F 缴获",
  "p012.objective.scavenge.grenades": "；步枪打空，尚有{grenades}枚手榴弹：按住 G 准备，松开投出",
  "p012.objective.scavenge.none": "；步枪打空：留意倒下士兵的枪械，靠近按 F 缴获（替换当前枪弹）",
  "p012.objective.frontlineApproach": "沿反斜面中间交通壕回到枪眼，绕开两侧实体壕墙",

  // --- 导航牌名字（P012_GUIDANCE_NAMES）------------------------------------
  "p012.guide.ammoBoxSign": "弹药箱 · 按住 F 搬起",
  "p012.guide.ammoDropSign": "机枪收弹处 · 按住 F 交付",
  "p012.guide.observePost": "观察位",
  "p012.guide.ammoBox": "弹药箱",
  "p012.guide.ammoDrop": "机枪收弹处",
  "p012.guide.ammoDropTurn": "沿交通壕向这里拐弯 → 机枪收弹处",
  "p012.guide.luoNorth": "罗班长 · 北上接防",
  "p012.guide.luoAssemble": "罗班长 · 集合",
  "p012.guide.ammoIssue": "子弹领取处",
  "p012.guide.weaponIssue": "步枪领取处",
  "p012.guide.b06": "前方田地 · 观察敌情",
  "p012.guide.b07": "正面阵地 · 阻止敌人接近",
  "p012.guide.b08": "敌方机枪方向 · 可借枪眼还击",
  "p012.guide.b09": "掷弹筒方向 · 注意炮击预警",
  "p012.guide.b10": "西侧铁路涵洞",
  "p012.guide.b11.delivered": "伤员已安置 · 跟班长集合",
  "p012.guide.b11.carrying": "沿交通壕 → 掩蔽部接收处",
  "p012.guide.b11.wounded": "伤员",
  "p012.guide.b12": "罗班长 · 接应后送队",
  "p012.guide.b13.escort": "担架队 · 继续护送",
  "p012.guide.b13.contact": "道路遭遇敌人 · 掩护担架",
  "p012.guide.columnRejoin": "担架队 · 回来接应",
  "p012.guide.b14.ambush": "残屋火力点 · 清除伏兵",
  "p012.guide.b15.regroup": "罗班长 · 墙后集合",
  "p012.guide.b15.wounded": "担架伤员 · 查看伤势",
  "p012.guide.b16.choose": "两条护送路 · 左沟边 / 右道路",
  "p012.guide.b16.follow": "跟上担架队",
  "p012.guide.b17.cover": "墙后伤员安置处",
  "p012.guide.b17.obstacle": "受伤百姓 / 翻倒小车",
  "p012.guide.b18.carry": "担架前进方向 · 沿沟搬运",
  "p012.guide.b18.grab": "担架后端 · 靠近按 F 接手",
  "p012.guide.b19": "扫射逼近 · 可借路沟避弹",
  "p012.guide.b20": "接近伤员的敌人",
  "p012.guide.b21": "南路敌人 · 清除阻碍",
  "p012.guide.b22": "罗班长和担架队 · 南路集合",
  "p012.guide.b23": "担架队 · 一起撤回掩蔽部",
  "p012.guide.b24.shelter": "掩蔽部 · 抬入伤员",
  "p012.guide.b24.grab": "原担架后端 · 按 F 接手",
  "p012.guide.frontlineAmmo": "前沿弹药箱 · 按住 F 补充桥夹",

  // --- 交互点标签（P012_INTERACTION_SPECS 的 labelKey）----------------------
  "p012.point.weaponCheck": "领取步枪，前往弹药分发点",
  "p012.point.ammoIssue": "领取子弹，随后跟队出发",
  "p012.point.woundedCheck": "查看伤员，整理弹药并补充1包绷带",
  "p012.point.volunteer": "向罗班长主动申请护送伤员",
  "p012.point.roadContactHold": "命令担架队停在院墙后",
  "p012.point.roadContactRelease": "从队尾放行担架队",
  "p012.point.frontlineAmmo": "领取桥夹 · 箱内剩 {clips}/{stock}",
  "p012.point.frontlineAmmoEmpty": "弹药箱已空",
  "p012.point.roadWounded": "检查前方担架伤员",
  "p012.point.airRescue": "背起扫射中受伤的百姓",
  "p012.point.airRescueLoad": "受伤百姓",
  "p012.point.airRescueCover": "把伤员放到蓝色硬掩体后",
  "p012.point.airCartClear": "推开翻倒小车，转入沟边",
  "p012.point.southGrenades": "领取手榴弹 · 备用{grenades}枚",
  "p012.point.retreatSmoke": "点燃烟幕，遮断南路火线",
  "p012.point.ammoPickup": "搬起弹药箱",
  "p012.point.ammoCrateLoad": "机枪弹药箱",
  "p012.point.ammoCrateItem": "弹药箱",
  "p012.point.ammoDrop": "交付弹药给机枪组",

  // --- 一次性提示 -----------------------------------------------------------
  "p012.hint.ammoDelivered": "弹药已送达，去机枪旁观察前方田地",

  // --- 白盒场景自身（Script_FirstLevelWhiteboxField）-------------------------
  "p012.whitebox.build.ground": "策划白盒：纯白地皮",
  "p012.whitebox.build.blocks": "策划白盒：空间体块",
  "p012.whitebox.build.collision": "策划白盒：碰撞与掩体",
  "p012.whitebox.build.ready": "策划白盒就绪",
  "p012.whitebox.label.weapon": "领取步枪",
  "p012.whitebox.label.ammo": "领取弹药",
  "p012.whitebox.label.shelter": "避炮处 C / Z",
  "p012.whitebox.legend.title": "白盒色标",
  "p012.whitebox.legend.direction": "北：阵地｜南：兵站｜西：铁路",
  "p012.whitebox.legend.coordinates": "坐标约定",
  "p012.whitebox.legend.coordinatesBody": "世界坐标：北 −Z，南 +Z，东 +X；不随镜头转动。",
  "p012.whitebox.legend.ground": "通行/奔跑",
  "p012.whitebox.legend.structure": "车体/建筑结构",
  "p012.whitebox.legend.step": "跨步/台阶",
  "p012.whitebox.legend.vault": "翻越",
  "p012.whitebox.legend.mantle": "攀爬",
  "p012.whitebox.legend.cover": "掩体",
  "p012.whitebox.legend.boundary": "不可通行",
  "p012.whitebox.legend.danger": "危险区域",
  "p012.whitebox.legend.missionRoute": "任务路线",
  "p012.whitebox.legend.stretcherRoute": "担架通道",

  // --- 远处炮击观察段（Script_FirstLevelP012ShellShot）----------------------
  "p012.shellShot.title": "北方阵地 · 铁路侧翼持续遭到炮击",
  "p012.shellShot.line": "{speaker}：看北边，阵地沿线还在挨炮！乡亲们往后撤！跟紧我，沿沟赶去接防！",
});

/**
 * 这些模块已迁完，闸门从此不许它们再出现玩家可见中文字面量。
 * 本来就没有中文的那几个也一并登记 —— 闸门的作用一半是"迁完"，一半是"不许回退"。
 */
export const GATED_MODULES = Object.freeze([
  "Script_FirstLevelP012Arrival.mjs",
  "Script_FirstLevelP012ArrivalView.mjs",
  "Script_FirstLevelP012BackRifle.mjs",
  "Script_FirstLevelP012Binoculars.mjs",
  "Script_FirstLevelP012CarryView.mjs",
  "Script_FirstLevelP012CastAppearance.mjs",
  "Script_FirstLevelP012Flow.mjs",
  "Script_FirstLevelP012Guidance.mjs",
  "Script_FirstLevelP012March.mjs",
  "Script_FirstLevelP012Opening.mjs",
  "Script_FirstLevelP012Resting.mjs",
  "Script_FirstLevelP012Runtime.mjs",
  "Script_FirstLevelP012ShellShot.mjs",
  "Script_FirstLevelP012StageZero.mjs",
  "Script_FirstLevelP012TrainColumn.mjs",
  "Script_FirstLevelP012VillageLife.mjs",
  "Script_FirstLevelP012VillageLifeView.mjs",
  "Script_FirstLevelP012VillagePose.mjs",
  "Script_FirstLevelWhiteboxField.mjs",
  "Script_FirstLevelWhiteboxFlow.mjs",
]);

/** 运行时按数据表里的 id / textKey 拼出来的键前缀；闸门只查「前缀下至少有一条」。 */
export const DYNAMIC_PREFIXES = Object.freeze([
  "p012.beat.",       // 按 P012_BEATS 的拍 id
  "p012.objective.",  // 按 P012_OBJECTIVE_LINES 的 textKey
  "p012.guide.",      // 按 P012_GUIDANCE_NAMES 的 textKey
  "p012.point.",      // 按 P012_INTERACTION_SPECS 的 labelKey
  "p012.whitebox.legend.", // 按体块语义 id（Script_FirstLevelWhiteboxField 的色标表）
]);
