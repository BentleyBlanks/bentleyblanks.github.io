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
  "menu.panel.levels": "任务选择",
  "menu.toggle.on": "开",
  "menu.toggle.off": "关",

  // --- 主列表 ---------------------------------------------------------------
  "menu.item.resume": "继续 · {label}",
  "menu.item.settings": "设置",
  "menu.item.debug": "调试选项",
  "menu.hint.resume": "从上次通过的下一章接着打",
  "menu.hint.start": "从序章 · 出川开始，先播车厢那一场过场",
  "menu.hint.levels": "正式章节、暂时废弃场景与测试场景三组，任选一条直接进（不播过场）",
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
  "menu.sandbox.firstLevelP012Whitebox.where": "第一关 P0/P1/P2 场景白盒",
  "menu.sandbox.firstLevelP012Whitebox.exit": "退出 P0/P1/P2 白盒",
  "menu.sandbox.jiehe.where": "界河白盒",
  "menu.sandbox.jiehe.exit": "退出界河白盒",

  // --- 第一关 P0/P1/P2 白盒的收场与失败面板 ---------------------------------
  "menu.p012.completeTitle": "第一关 P0/P1/P2 测试关卡完成",
  "menu.p012.failTitle": "{name} · 测试失败",
  "menu.item.restartSandbox": "重新测试",
  "menu.item.exitToTitle": "返回主菜单",
  "menu.item.retryAtLoad": "在载物处继续",
  "menu.item.retryCheckpoint": "从检查点继续",
  "menu.hint.restartSandbox": "从车厢重新开始这一版白盒",
  "menu.hint.exitSandboxComplete": "退出独立测试，不进入第二章",
  "menu.hint.exitSandboxFail": "退出独立测试",
  "menu.hint.retrySandbox": "保留现场进度与剩余补给；仅恢复{name}本人，不移动载物",

  // --- 选章 -----------------------------------------------------------------
  "menu.aria.levelList": "章节与测试场景",
  "menu.aria.brief": "所选任务简报",
  "menu.aria.missionArt": "{name}任务场景图",
  "menu.group.official.title": "正式章节",
  "menu.group.official.note": "滕县保卫战",
  "menu.group.shelved.title": "暂时废弃场景",
  "menu.group.shelved.note": "只建场景 · 未完成",
  "menu.group.sandbox.title": "测试场景",
  "menu.group.sandbox.note": "独立测试",
  "menu.level.sandboxGlyph": "靶",
  "menu.mark.sandbox": "沙盒",
  "menu.mark.todo": "未完成",
  "menu.mark.done": "已通过",
  "menu.mark.next": "下一关",
  "menu.brief.when": "{date} · {place}",
  "menu.brief.defaultObjective": "进入任务",
  "menu.record.chapter": "章节记录",
  "menu.record.sandbox": "独立测试",
  "menu.record.shelved": "暂时废弃场景",
  "menu.record.sandboxValue": "不计入战役进度",
  "menu.record.shelvedValue": "未完成 · 只建场景，没有任务内容",
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

  // --- 正片打到序章为止时的告示（Script_Main.EndOfficialCampaign） -----------
  "menu.notice.prologue": "序章",
  "menu.notice.campaignEnd": "{label}已完 · 后续章节暂时废弃，正按新稿重做",
  "menu.notice.campaignEndDetail": "第一关到终章归入选章「暂时废弃场景」组：只建场景，没有任务内容。",
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
]);
