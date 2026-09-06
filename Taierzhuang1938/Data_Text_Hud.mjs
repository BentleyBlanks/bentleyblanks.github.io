// Data_Text_Hud.mjs — Script_Hud / Script_Wheel / Script_DebugOptions / Script_Identify 的 HUD 文案。
// 纯数据，不 import three。键前缀 `hud.`，由 Data_Locale_zhCN.mjs 拼表；口径见 docs/Data_TextAndTuning.md。
// 占位符写 {name}，代码侧 T("hud.xxx", { name })。同一句话只登记一次，多处复用同一键。
//
// Script_Main 是装配层，它自己不是一个「系统」：它经 hud.Hint / hud.Say / SetActionPrompts
// 打到 HUD 上的那些句子也登记在这里（`hud.hint.` / `hud.prompt.` / `hud.say.` 三段），
// 免得再开一张只服务一个文件的表。开机加载与菜单相关的那部分在 Data_Text_Boot / Data_Text_Menu。
export const TEXT = Object.freeze({
  "hud.hint.checkpointResumed": "已从当前检查点继续",
  // --- 姿态 -----------------------------------------------------------------
  "hud.stance.stand": "站立",
  "hud.stance.crouch": "下蹲",
  "hud.stance.prone": "趴下",

  // --- 键名（提示条上的按键框；「左键」这类是文本，不是 code） ---------------
  "hud.key.mouseLeft": "左键",
  "hud.key.mouseRight": "右键",
  "hud.key.space": "空格",
  "hud.key.holdF": "按住 F",

  // --- 顶部目标与兵员池 -----------------------------------------------------
  "hud.objective.updated": "目标已更新",
  "hud.force.holding": "城中仍在坚守者：{ours} 人{enemyIntel}",
  "hud.force.enemyIntel": " · 对面 {theirs}",

  // --- 右下战斗区 -----------------------------------------------------------
  "hud.aria.ammo": "弹药",
  "hud.aria.stanceGroup": "切换姿态",
  "hud.aria.stanceHint": "按住 Alt 后点击，或使用对应键位",
  "hud.equipment.grenade": "手榴弹",
  "hud.equipment.bundle": "集束手榴弹",
  "hud.equipment.mortar": "迫击炮支援",
  "hud.state.bleeding": "流血",
  "hud.state.wounded": "带伤",
  "hud.state.bandages": "绷带 {n}",
  "hud.state.breath": "屏息",

  // --- 情境操作提示 ---------------------------------------------------------
  "hud.action.aria": "{keys}：{label}",
  "hud.prompt.carryDrop": "放下",
  "hud.prompt.carryThrow": "扔下，立刻还手",
  "hud.prompt.bandage": "包扎止血",
  "hud.prompt.meleeCharge": "白刃（按住蓄力劈刺）",
  "hud.prompt.switchWeapon": "切换{slots}",
  "hud.weaponSlot.primary": "长枪",
  "hud.weaponSlot.secondary": "短枪",

  // --- 准心 -----------------------------------------------------------------
  "hud.crosshair.hip": "腰射准心",
  "hud.crosshair.sprint": "冲刺扩散准心",
  "hud.crosshair.hipSpread": "腰射准心 散布 {deg} 度",

  // --- 目标识别卡（Script_Identify 生成，Script_Hud 画） ---------------------
  "hud.target.aria": "{title}，{meta}",
  "hud.faction.nra": "川军",
  "hud.faction.ija": "日军",
  "hud.target.vehicle": "载具",
  "hud.target.corpse": "阵亡 {name}",
  "hud.target.wounded": "负伤",
  "hud.target.stormTeam": "敢死队",
  "hud.target.age": "{age} 岁",
  // 日军军衔。1938 年没有「兵长」——那一级是 1940 年才加的（见 Script_Identify.IjaRank）。
  "hud.rank.ija.sergeant": "军曹",
  "hud.rank.ija.corporal": "伍长",
  "hud.rank.ija.superiorPrivate": "上等兵",
  "hud.rank.ija.privateFirst": "一等兵",
  "hud.rank.ija.privateSecond": "二等兵",
  "hud.rank.ija.title": "{faction} {rank}",
  // 番号：第 10 师团濑谷支队的步兵骨干（docs/Data_HistoryMaterial.md 第二节）。
  "hud.unit.ija.regiment63": "步兵第63联队",
  "hud.unit.ija.regiment10": "步兵第10联队",
  "hud.unit.ija.mgCompany": "机关枪中队",
  "hud.unit.ija.grenadierSquad": "掷弹筒分队",

  // --- 白刃 QTE -------------------------------------------------------------
  "hud.melee.scale": "武器控制 · 我方 ← ● → 敌方",
  "hud.melee.progressAria": "我方武器控制",
  "hud.melee.aria": "{label}，{prompt}",
  "hud.melee.resolveWon": "推开了！准备恢复自由战斗",
  "hud.melee.resolveLost": "失势 · 抵抗失败",
  "hud.melee.resultWin": "成功",
  "hud.melee.resultLose": "失败",
  "hud.melee.timeLeft": "{seconds} 秒",
  "hud.melee.assistAuto": "辅助：自动完成",
  "hud.melee.assistHold": "辅助：长按代替连按",
  "hud.melee.assistMash": "有效连按最多每秒 7 次",

  // --- 按住型交互的进度环 / 负重条 ------------------------------------------
  "hud.interact.generic": "交互",
  "hud.interact.aria": "{label} {percent}%",
  "hud.carry.aria": "负重：{label}，{prompt}",

  // --- 架设机枪 -------------------------------------------------------------
  "hud.emplacement.ready": "可射击",
  "hud.emplacement.aria": "{label}：热量 {heat}%，{prompt}",
  "hud.emplacement.ammo": "{rounds} / {belts} 板",

  // --- 报码纸 ---------------------------------------------------------------
  "hud.telegraph.aria": "{label}：已发 {sent} 组，共 {total} 组。{prompt}",

  // --- 近弹提示 -------------------------------------------------------------
  "hud.grenade.single": "手榴弹",
  "hud.grenade.bundle": "集束",
  "hud.grenade.warning": "{kind} {metres}m",
  "hud.grenade.aria": "{warning}，附近爆炸物",

  // --- 阵亡卡 ---------------------------------------------------------------
  "hud.death.kicker": "阵亡",

  // --- 命令轮盘（Script_Wheel） ---------------------------------------------
  "hud.wheel.idle": "推鼠标选，松开下令",

  // =========================================================================
  // 以下是装配层（Script_Main）打到 HUD 上的句子。
  // =========================================================================

  // --- 一次性提示（hud.Hint） -----------------------------------------------
  "hud.hint.deprecatedScene": "暂时废弃场景 · 未完成：只建场景，没有任务内容",
  "hud.hint.p012Retry": "保留现场进度与剩余补给",
  "hud.hint.ammoIssued": "已领子弹，按 R 装弹；可以边走边装",
  "hud.hint.bandagesGiven": "补充{n}包绷带；受伤流血时按 B 包扎",
  "hud.hint.meleeEncounter": "{name} · 自由移动、转向与攻击",
  "hud.hint.meleeEncounterDone": "交锋结束 · 可继续前往另一组",
  "hud.hint.meleeTestDown": "本轮阵亡 · 在白刃实验面板开始／重开",
  "hud.hint.noBipod": "这支枪没有两脚架",
  "hud.hint.bipodNeedsRest": "得先趴下，或者靠着能搭枪的东西",
  "hud.hint.bipodOn": "两脚架架好了",
  "hud.hint.bipodOff": "收了两脚架",
  "hud.hint.singleFireMode": "这支枪只有一种发射方式",
  "hud.hint.fireModeAuto": "连发",
  "hud.hint.fireModeSemi": "单发",
  "hud.hint.meleeStanceMelee": "白刃架势 · 左键攻击 / 右键拨枪 / F 顶架",
  "hud.hint.meleeStanceFire": "射击架势 · 左键射击 / 右键瞄准",
  "hud.hint.dadaoIsMelee": "大刀本身就是白刃",
  "hud.hint.noBayonet": "这支枪装不了刺刀",
  "hud.hint.bayonetOn": "上刺刀",
  "hud.hint.bayonetOff": "收刺刀",
  "hud.hint.noGrenades": "没有手榴弹了",
  "hud.hint.noBundles": "没有集束了",
  "hud.hint.reloadClip": "按 R 压弹",
  "hud.hint.mortarOnTheWay": "炮弹在路上（还剩 {left} 发）",
  "hud.hint.fireBlocks": "火里过不去。",
  "hud.hint.pointerLock": "点一下画面，接管镜头",

  // --- 字幕（hud.Say）。说话人也是文本：具名的人取 CAST id 经 Localize，
  //     玩家自己没有 CAST 条目（他每一关演的都是别人），所以单列一条。
  "hud.say.self": "你",
  "hud.say.order": "{label}！",
  "hud.say.mortarCall": "迫击炮，坐标——",
  "hud.say.povSwitch": "视角接替：{label}",
  "hud.say.noOneLeft": "没有人可以填上去了。",

  // --- 装配层追加的提示条 ---------------------------------------------------
  "hud.prompt.push": "近身推架",
  "hud.prompt.meleeToFire": "白刃架势 → 射击",
  "hud.prompt.fireToMelee": "射击架势 → 白刃",
  "hud.prompt.pullBolt": "拉枪机",
  "hud.prompt.clearJam": "按住排障",
  "hud.prompt.changeBelt": "换弹板",
  "hud.prompt.binocular": "按住举起望远镜",
  "hud.prompt.ammoDeliver": "交付弹药给机枪组",
  "hud.prompt.ammoDrop": "放下弹药箱（之后可再搬起）",
  "hud.prompt.ammoPickup": "搬起弹药箱",

  // --- 武器名与负重的兜底名 -------------------------------------------------
  "hud.weapon.rifle": "步枪",
  "hud.weapon.barehand": "赤手",
  "hud.carry.stretcherWounded": "担架（伤员）",

  // --- 临时演员的显示名（识别卡上就是这一行） -------------------------------
  "hud.actor.escort": "后送队",
  "hud.actor.trainRecruit": "下车集结的士兵",
  "hud.actor.walkingWounded": "向后方转移的伤兵",
  "hud.actor.civilianRefugee": "向后方转移的乡亲",

  // --- 阵亡卡上玩家所属的番号 -----------------------------------------------
  "hud.death.unit": "第三十一师 一八六团",
});

/** 这张表覆盖的代码模块。登记后 Script_TextTest 就不许它们再出现玩家可见中文字面量。 */
export const GATED_MODULES = Object.freeze([
  "Script_Hud.mjs",
  "Script_Wheel.mjs",
  "Script_DebugOptions.mjs",
  "Script_Identify.mjs",
  // 装配层：它同时用 hud. / boot. / menu. 三段键，由这张表统一登记为闸门模块。
  "Script_Main.mjs",
]);

/**
 * 运行时拼出来的键前缀。
 *   hud.stance.   —— 姿态 id（stand/crouch/prone，与 Script_Player.STANCE 同一套）
 *   hud.faction.  —— 阵营 id（nra/ija，与 Script_Ai 的 side 同一套）
 *   hud.unit.ija. —— 番号按 Script_Identify.IJA_REGIMENTS 这张表的下标取
 */
export const DYNAMIC_PREFIXES = Object.freeze([
  "hud.stance.",
  "hud.faction.",
  "hud.unit.ija.",
]);
