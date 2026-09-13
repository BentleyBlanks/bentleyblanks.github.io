// Data_Text_Menu.mjs — 主菜单、暂停菜单、选章、史实注记与调试面板的文案（Script_Menu）。
// 纯数据，不 import three。键前缀 `menu.`，由 Data_Locale_zhCN.mjs 拼表；口径见 docs/Data_TextAndTuning.md。
// 占位符写 {name}，代码侧 T("menu.xxx", { name })。同一句话只登记一次，多处复用同一键。
//
// **不在这里的**：标题、副标题、四个主项的名字、标题下那几行史实小字与鸣谢 ——
// 那些是考据过的原稿，本体留在 Data_TengxianScript 的 MENU / CREDITS 里，
// 显示时经 `Localize("menu.<字段>" / "menu.lines.<n>" / "credits.<n>", 原稿)` 取译文（§3）。
export const TEXT = Object.freeze({
  // --- 通用 -----------------------------------------------------------------
  "menu.back": "返回",
  "menu.foot.main": "↑↓ 选择 · Enter 确定 · Esc 返回",
  "menu.foot.escBack": "Esc 返回",
  "menu.foot.campaign": "↑↓ 选择  /  Enter 进入  /  Esc 返回",
  "menu.title.paused": "游戏暂停",
  "menu.pause.objective": "当前任务目标",
  // Shared pause progress; condition IDs match the mission flow requirements.
  "menu.progress.title": "达成条件与当前进度",
  "menu.progress.summary": "已达成 {current} / {target} 项",
  "menu.progress.complete": "当前任务已完成",
  "menu.progress.unavailable": "当前场景未提供可追踪的任务条件",
  "menu.progress.done": "已完成",
  "menu.progress.pending": "未完成",
  "menu.progress.seconds": "{current} / {target} 秒",
  "menu.progress.rifle": "前沿计时 {current} / {target} 秒 · 抵达后{fired}",
  "menu.progress.fired": "已开枪",
  "menu.progress.notFired": "尚未开枪",
  "menu.progress.guards": "安全撤回 {safe} 人 · 阵亡 {lost} 人 / 共 {target} 人",
  "menu.condition.trainShelling": "随军列前行，等待遭遇炮击",
  "menu.condition.trainStopped": "等待军列停下",
  "menu.condition.trainDerailed": "等待脱轨冲击结束",
  "menu.condition.luoRescueComplete": "接受罗班长救援，脱离车厢险情",
  "menu.condition.unloadOrdersHeard": "听完下车命令",
  "menu.condition.unloaded": "离开车厢，抵达下车集合处",
  "menu.condition.trenchEntered": "进入交通壕",
  "menu.condition.trenchCleared": "清除交通壕折角的日军",
  "menu.condition.shelterReached": "到达掩蔽处",
  "menu.condition.escapeWhisperHeard": "听完同伴在掩蔽处的交谈",
  "menu.condition.woundedSeen": "看到撤入掩蔽处的伤兵",
  "menu.condition.supportOrdersHeard": "听完支援前沿的命令",
  "menu.condition.frontReached": "沿交通壕到达前沿阵地",
  "menu.condition.frontContact": "在前沿与日军交火",
  "menu.condition.frontRifleDefense": "抵达前沿后开枪掩护，经过 {seconds} 秒并处于前沿阵地",
  "menu.condition.rifleWithdrawalResolved": "掩护第一批守军撤离，直至无人滞留",
  "menu.condition.zhouGunWounded": "等待老周负伤后撤离机枪位，准备接手",
  "menu.condition.gunUsed": "接手机枪并开火",
  "menu.condition.guardWithdrawalResolved": "掩护其余守军撤离，直至无人滞留",
  "menu.condition.bundleTaken": "领取集束手榴弹",
  "menu.condition.tankImmobilized": "炸断战车履带，使其停止前进",
  "menu.condition.ordersReached": "撤回交通壕接令处",
  "menu.condition.volunteerHeard": "听完接令处的对话",
  "menu.condition.zhouOnLitter": "等待老周安置到担架上",
  "menu.condition.southTraversed": "沿南行道路到达村口",
  "menu.condition.southHopeHeard": "听完南行途中同伴的交谈",
  "menu.condition.innerCourtReached": "从右侧灶屋绕到内院",
  "menu.condition.meleeResolved": "清除伤员通道上的近身日军",
  "menu.condition.villageGunSilent": "清除窗口机枪手",
  "menu.condition.courtyardGateOpen": "打开院门",
  "menu.condition.courtyardPassed": "掩护担架队通过院门",
  "menu.condition.transferApproachReached": "到达转运点入口",
  "menu.condition.transferHopeHeard": "听完转运点前的交谈",
  "menu.condition.transferArrived": "到达转运点，开始伤员交接",
  "menu.condition.vehiclesDeparted": "掩护转运车辆分批离开",
  "menu.condition.transferAttacksResolved": "化解转运点各方向的进攻",
  "menu.condition.zhouNext": "等待轮到老周转运",
  "menu.condition.followVehicleHeard": "听完跟车离开的命令",
  "menu.condition.firstAirPassComplete": "在掩体中躲过日机第一轮袭击",
  "menu.condition.firstAirOrdersHeard": "听完空袭后的命令",
  "menu.condition.zhouCarried": "接替老周担架后端",
  "menu.condition.atDitchMouth": "将老周抬到西侧下沟口",
  "menu.condition.carryOrdersHeard": "听完抬运时的命令",
  "menu.condition.diveComplete": "完成下沟避险",
  "menu.condition.zhouRecovered": "掩护幺娃将老周拖回担架",
  "menu.condition.rescuePassageClear": "清除救援通道附近的追兵",
  "menu.condition.retreatFirstPassed": "掩护担架通过排水沟折角",
  "menu.condition.retreatWallPassed": "掩护担架通过院墙缺口",
  "menu.condition.retreatYardPassed": "掩护最后的担架穿过后院",
  "menu.condition.receptionPassed": "掩护最后一批伤员进入接收院",
  "menu.condition.zhouPlaced": "将老周的担架放到卫生兵旁",
  "menu.condition.deathSceneComplete": "留在老周身边，等待剧情结束",
  "menu.condition.rearLaneClear": "打开后门外的安全撤退通道",
  "menu.condition.medicsEscaped": "掩护医护人员和担架撤出接收院",
  "menu.condition.playerAtHandoff": "从后门到达城边联络巷",
  "menu.condition.finalExitHeard": "听完罗班长最后的交代",
  "menu.condition.minimumSeconds": "完成本段行进或坚守时间",
  "menu.panel.levels": "任务选择",
  "menu.toggle.on": "开",
  "menu.toggle.off": "关",

  // --- 主列表 ---------------------------------------------------------------
  "menu.item.resume": "继续 · {label}",
  "menu.item.settings": "设置",
  "menu.item.debug": "调试选项",
  "menu.hint.resume": "从上次通过的下一章接着打",
  "menu.hint.start": "从第一关开始",
  "menu.hint.levels": "正式章节与测试场景两组，任选一条直接进",
  "menu.hint.codex": "哪些数是史料、哪些是推定",
  "menu.hint.credits": "史料口径与虚构人物的交代",
  "menu.hint.settings": "操作、画面与声音",
  "menu.hint.debug": "碰撞、移动、伤害与补给的测试开关",

  // --- 暂停菜单 -------------------------------------------------------------
  "menu.item.resumeGame": "继续",
  "menu.item.title": "主菜单",
  "menu.hint.resumeLevel": "回到这一关",
  "menu.hint.resumeSandbox": "回到{where}",
  "menu.hint.levelsFromPause": "换一关打（这一局的进度会丢）",
  "menu.hint.title": "放弃这一局，回到主菜单",
  "menu.hint.exitSandbox": "重载回正片，回到主菜单",

  // --- 沙盒（key 与 Script_Main 的 ?range=1 / ?melee=1 / ?jiehe=1 一一对应） ---
  "menu.sandbox.movement.where": "操作交互测试场",
  "menu.sandbox.movement.exit": "退出操作测试场",
  "menu.sandbox.explosions.where": "爆炸测试场",
  "menu.sandbox.explosions.exit": "退出爆炸测试场",
  "menu.sandbox.weapons.where": "枪械射击白盒",
  "menu.sandbox.weapons.exit": "退出枪械靶场",
  "menu.sandbox.range.where": "靶场",
  "menu.sandbox.range.exit": "退出靶场",
  "menu.sandbox.melee.where": "白刃测试场",
  "menu.sandbox.melee.exit": "退出白刃测试场",
  "menu.sandbox.gore.where": "断肢测试场",
  "menu.sandbox.gore.exit": "退出断肢测试场",
  // 第一关现在就是 P0/P1/P2 白盒（Data_Menu.CAMPAIGN_ENTRIES），玩家面前只叫「第一关」。
  "menu.sandbox.firstLevelP012Whitebox.where": "第一关",
  "menu.sandbox.firstLevelP012Whitebox.exit": "退出第一关",
  "menu.sandbox.jiehe.where": "界河白盒",
  "menu.sandbox.jiehe.exit": "退出界河白盒",

  // --- 第一关（P0/P1/P2 白盒）的收场与失败面板 -------------------------------
  "menu.p012.completeTitle": "第一关完成",
  "menu.p012.failTitle": "{name} · 阵亡",
  "menu.death.title": "你已阵亡",
  "menu.death.missionFailed": "任务失败",
  "menu.death.checkpoint": "从检查点开始",
  "menu.death.checkpointHint": "返回最近的检查点，继续当前任务",
  "menu.death.restart": "重新开始本关",
  "menu.death.keys": "↑ ↓ 选择　 /　Enter 确认",
  "menu.death.retryFailed": "检查点恢复失败，请重试或重新开始本关",
  "menu.item.restartSandbox": "重新测试",
  "menu.item.exitToTitle": "返回主菜单",
  "menu.item.retryAtLoad": "在载物处继续",
  "menu.item.retryCheckpoint": "从检查点继续",
  "menu.hint.restartSandbox": "从车厢重新开始第一关",
  "menu.hint.exitSandboxComplete": "回到主菜单（第二关尚未完成）",
  "menu.hint.exitSandboxFail": "结束本次任务，返回主菜单",
  "menu.hint.retrySandbox": "保留现场进度与剩余补给；仅恢复{name}本人，不移动载物",

  // --- 选章 -----------------------------------------------------------------
  "menu.aria.levelList": "章节与测试场景",
  "menu.aria.brief": "所选任务简报",
  "menu.aria.missionArt": "{name}任务场景图",
  "menu.group.official.title": "正式章节",
  "menu.group.official.note": "滕县保卫战",
  "menu.group.sandbox.title": "测试场景",
  "menu.group.sandbox.note": "独立测试",
  "menu.level.sandboxGlyph": "靶",
  "menu.mark.sandbox": "沙盒",
  "menu.mark.todo": "未完成",
  "menu.mark.done": "已通过",
  "menu.mark.next": "下一关",
  "menu.brief.when": "{date} · {place}",
  "menu.brief.defaultObjective": "进入任务",
  // 占位章节（第二关到终章，Data_Menu.CAMPAIGN_ENTRIES 的 placeholder）：
  // 简报目标行与章节记录都写这一句；点了在简报上再亮一句 notice。
  "menu.brief.placeholder": "未完成 · 敬请期待",
  "menu.notice.placeholder": "这一关还没做完，敬请期待",
  "menu.record.chapter": "章节记录",
  "menu.record.sandbox": "独立测试",
  "menu.record.sandboxValue": "不计入战役进度",
  "menu.record.notCleared": "尚未通过",

  // --- 史实注记页 -----------------------------------------------------------
  "menu.codex.intro": "这一作把史料与推定分开记账。下面两张表里的数<b>全部是推定</b>，"
    + "游戏内任何文本都不许把它们说成史实；找到实测数据就改表，并把该条删掉。",
  "menu.codex.geometryHeading": "城的几何 · Data_Tengxian.PRESUMED",
  "menu.codex.stagingHeading": "演出与关卡 · Data_TengxianScript.PRESUMED_STAGING",

  // --- 调试面板（id 与 Script_DebugOptions.DEBUG_OPTIONS_DEFAULTS 同一套） ----
  // note 那一行**玩家看得见**（面板上开关名底下的小字），不是注释。
  "menu.debug.intro": "这些选项只用于测试，可在主菜单或暂停菜单中调整。",
  // 暂停菜单「跳到下一任务进度」（Script_FirstLevelP012Debug 驱动的那一行）
  "menu.debug.p012Progress.label": "跳到下一任务进度",
  "menu.debug.p012Progress.current": "{id} · {objective}",
  "menu.debug.p012Progress.next": " → {id} · {objective}。同步玩家、NPC 与剧情状态。",
  "menu.debug.p012Progress.done": " · 已完成",
  "menu.debug.p012Progress.advance": "下一进度",
  "menu.debug.p012Progress.finished": "已完成",
  "menu.debug.p012Progress.pauseHint": " 开始白盒后，在暂停菜单中使用。",
  "menu.debug.p012Progress.failed": "跳转未完成：{message}",
  // 暂停菜单「从当前检查点继续」（Script_Main.CheckpointStatus 提供 note）
  "menu.checkpoint.continue": "从当前检查点继续",
  "menu.checkpoint.cue": "继续 →",
  "menu.checkpoint.none": "当前没有可用的检查点",
  "menu.checkpoint.noteP012": "保留现场进度与剩余补给；手中载物会留在原地",
  "menu.checkpoint.noteLevel": "恢复到本关最近的检查点",
  "menu.debug.firstLevelStages.label": "第一关 · 18 阶段快速跳转",
  "menu.debug.firstLevelStages.note": "进入所选阶段起点，重建此前任务、队伍与场景进度；本轮现场将重置。",
  "menu.debug.firstLevelStages.option": "第 {number} 阶段 · {title}",
  "menu.debug.firstLevelStages.jump": "跳转并继续",
  "menu.debug.noCollision.label": "无碰撞",
  "menu.debug.noCollision.note": "穿过人物、墙体与掩体；地形与关卡边界仍然生效",
  "menu.debug.fastMove.label": "快速移动",
  "menu.debug.fastMove.note": "步行、冲刺与匍匐移动速度提高至三倍",
  "menu.debug.invincible.label": "无敌模式",
  "menu.debug.invincible.note": "免疫子弹、爆炸与流血伤害",
  "menu.debug.infiniteAmmo.label": "无限子弹",
  "menu.debug.infiniteAmmo.note": "已持有枪械无需装填，空弹仓会自动补满",
  "menu.debug.infiniteGrenades.label": "无限手榴弹",
  "menu.debug.infiniteGrenades.note": "普通手榴弹不会消耗；开启时会补给一枚",

  // --- 运镜时角上那行地名（Data_Menu.MENU_SHOTS 的 titleKey） ----------------
  // 键按地方取不按关号取：同一处地方在两关里架机位，写的是同一行字。
  "menu.shotNote": "{label}　{where}",
  "menu.shot.railbed": "津浦路 · 路基",
  "menu.shot.depot": "兵站月台",
  "menu.shot.powerPlant": "西关 · 电灯厂",
  "menu.shot.westGate": "西门 · 怀古门",
  "menu.shot.westGateInner": "西门 · 怀古门（城里）",
  "menu.shot.zhaiWall": "东关 · 东寨墙",
  "menu.shot.courtyard": "东关 · 关厢院落",
  "menu.shot.eastGate": "东门 · 宗鲁门",
  "menu.shot.lostBlock": "东关 · 失守街区",
  "menu.shot.lane": "东关 · 黑巷",
  "menu.shot.assemblyYard": "东关 · 集结院",
  "menu.shot.corridor": "西街长街 · 通视走廊",
  "menu.shot.yamen": "县衙",
  "menu.shot.southEastTower": "东南角望楼",
  "menu.shot.rampart": "东城墙 · 墙顶回廊",

  // --- 界河白盒切片（Data_Menu.JIEHE_SANDBOX_PHASE 的 *Key） -----------------
  "menu.slice.jiehe.glyph": "河",
  "menu.slice.jiehe.date": "白盒场地",
  "menu.slice.jiehe.label": "界河 · 白盒",
  "menu.slice.jiehe.place": "开发专用 · 不属于正片",

  // --- 旧序章（只剩 ?phase=0 开发入口）播完时的告示（Script_Main.EndOfficialCampaign） ---
  "menu.notice.prologue": "序章",
  "menu.notice.campaignEnd": "{label}已完 · 后续章节尚未完成，敬请期待",
  "menu.notice.campaignEndDetail": "第一关在选章里就是 P0/P1/P2 白盒；第二关到终章尚未完成。",
});

export const GATED_MODULES = Object.freeze([
  "Script_Menu.mjs",
]);

/**
 * 运行时拼出来的键前缀。
 *   menu.sandbox. —— 沙盒 id（Script_Menu.SANDBOX_MODES，与 Script_Main 的 URL 开关一一对应）
 *   menu.debug.   —— 调试开关 id（Script_DebugOptions.DEBUG_OPTION_KEYS）
 *   menu.shot.    —— 机位地名（Data_Menu.MENU_SHOTS[*].titleKey 里写死的整键）
 *   menu.slice.   —— 切片显示字段（Data_Menu 的 labelKey / dateKey / placeKey / sandboxGlyphKey）
 */
export const DYNAMIC_PREFIXES = Object.freeze([
  "menu.sandbox.",
  "menu.debug.",
  "menu.shot.",
  "menu.slice.",
  "menu.condition.",
  "menu.progress.",
]);
