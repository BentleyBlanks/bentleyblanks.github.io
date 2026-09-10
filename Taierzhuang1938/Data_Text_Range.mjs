// Data_Text_Range.mjs — 测试场景（Range / WeaponRange / MovementRange / ExplosionRange / MeleeLab）的玩家可见文案。
// 纯数据，不 import three。键前缀 `range.`，由 Data_Locale_zhCN.mjs 拼表；口径见 docs/Data_TextAndTuning.md。
// 占位符写 {name}，代码侧 T("range.xxx", { name })。同一句话只登记一次，多处复用同一键。
//
// 为什么测试场也进表：它们是**玩家真的会进去的场景**（?range=1 / ?weapons=1 / ?movement=1 /
// ?explosion=1 / ?melee=1），面板、路牌、交互提示全在屏幕上，与正片同一套渲染。
// 不本地化的是**编辑器面板**（Script_Editor*），不是测试场。
//
// 还没进表的两处（消费方不在本包，见提交说明的「集成请求」）：
//   · 各测试场 Data_ 表里的 phase.label / place / brief / objectives 与工位 name ——
//     它们由 Script_Hud / Script_Main 渲染；
//   · Data_Weapons.name、Data_MeleeCombat 的 scenario name/tip、Script_Player 的 STANCE.label ——
//     这里只把它们当参数带进模板。
export const TEXT = Object.freeze({
  // ── 分帧建场的步骤条（开机画面上那一行）────────────────────────────────
  "range.build.ground": "{name}：地皮",
  "range.build.structures": "{name}：工事与标识",
  "range.build.collision": "{name}：碰撞格",
  "range.build.ready": "就绪",
  "range.build.weaponWhitebox": "枪械白盒：长桌与测距靶道",
  "range.build.weaponCollision": "枪械白盒：碰撞与标识",
  "range.build.movementFixtures": "操作白盒：五区工位与标尺",
  "range.build.movementReady": "操作白盒：物理与测量就绪",
  "range.build.goreStations": "断肢白盒：四工位与木桩",
  "range.build.goreReady": "断肢白盒：就绪",
  "range.field.melee": "白刃测试场",
  "range.field.rifle": "靶场",

  // ── 白刃工位的场内标牌（?range=1 的白刃格）────────────────────────────
  "range.melee.signVersus": "1 对 {enemies}",
  "range.melee.signAuto": "靠近白线开始",
  "range.melee.signManual": "白线前按 F 开始",

  // ── 枪械白盒（?weapons=1）：路牌 ───────────────────────────────────────
  "range.weapon.signWelcome": "枪械白盒靶场",
  "range.weapon.signWelcomeSub": "长桌 F 领取 · 无限弹药",
  "range.weapon.signMeasure": "蓝点测距 / METRES",
  "range.weapon.signMeasureSub": "静靶左 · 动靶右 · 10—200 米",
  "range.weapon.signSlotSub": "F 领取  /  无限弹药",
  "range.weapon.signTargetMoving": "{id}  移动靶",
  "range.weapon.signTargetStatic": "{id}  静止靶",

  // ── 枪械白盒：交互与准星下的读数 ──────────────────────────────────────
  "range.weapon.pickupLabel": "换上 {name}",
  "range.weapon.pickupHint": "已领取 {name}",
  "range.weapon.kindMoving": "移动靶",
  "range.weapon.kindStatic": "静止靶",
  "range.weapon.aimInfo": "{id} · {kind}  标尺 {ruler} m · 当前 {current} m",
  // 靶倒下之后到复位之前的那几秒：读数照给，但要说清楚它正在回去。
  "range.weapon.aimInfoRespawning": "{id} · {kind}  标尺 {ruler} m · 当前 {current} m · 复位中",
  "range.weapon.aimAria": "当前瞄准目标与距离",

  // ── 枪械白盒：左上角面板 ──────────────────────────────────────────────
  "range.weapon.panelTitle": "枪械射击白盒",
  "range.weapon.panelKeys": "桌前 F 换枪 · 右键机瞄 · 左键射击 · R 换弹",
  "range.weapon.panelDesc": "蓝点为测距原点；左侧静止靶、右侧移动靶。离开蓝点后，以当前距离为准。",
  "range.weapon.panelHotkeys": "F6 移动靶 · F7 弹药模式 · F8 重置",
  "range.weapon.panelAltHint": "按住 Alt 可用鼠标点击面板",
  "range.weapon.panelAutoHint": "目标倒地后自动复位；开镜时自动收起面板",
  "range.weapon.btnMotionPause": "暂停移动靶",
  "range.weapon.btnMotionResume": "恢复移动靶",
  "range.weapon.btnAmmoReload": "切换换弹测试",
  "range.weapon.btnAmmoInfinite": "恢复无限弹匣",
  "range.weapon.btnReset": "重置靶场",
  "range.weapon.noWeapon": "未持枪",
  "range.weapon.ammoInfinite": "弹药 ∞",
  "range.weapon.ammoCounted": "弹匣 {mag} / 备弹 ∞",
  "range.weapon.statusWeapon": "{weapon} · {ammo}",
  "range.weapon.statusShots": "射击 {shots} · 命中 {hits}",
  "range.weapon.statusLast": "上一发：{target} · {dist}m",
  "range.weapon.lastTargetMoving": "{n}m 移动靶",
  "range.weapon.lastTargetStatic": "{n}m 静止靶",
  "range.weapon.lastTargetMiss": "未命中人体",

  // ── 操作测试场（?movement=1）：右侧记录面板 ──────────────────────────
  "range.movement.kind.jump": "原地 / 慢步跳",
  "range.movement.kind.runJump": "助跑跳",
  "range.movement.kind.vault": "翻越",
  "range.movement.kind.mantle": "攀爬",
  "range.movement.panelTitle": "操作测试 · 实测记录",
  "range.movement.helpMove": "Space 跳跃 / 翻越 · Shift 冲刺",
  "range.movement.helpStance": "C 蹲起 · Z 趴下 · 低姿态 Space 先站起",
  "range.movement.helpReset": "Home 复位补满体力 · PgUp / PgDn 切区",
  "range.movement.helpAlt": "按住 Alt 可点击面板",
  "range.movement.btnReset": "复位本区",
  "range.movement.btnClear": "清空成绩",
  "range.movement.panelNote": "高度从起跳脚底量到脚底峰值；距离为起落点水平直线。跑跳最佳只计平地跑道。蓝线起跳，黄线落地；记录仅保留本次会话。",
  "range.movement.debugOn": "调试加速 / 穿墙开启：不计最佳成绩",
  "range.movement.live": "{stance} · 速度 {speed} m/s · 体力 {stamina}%",
  "range.movement.eye": "眼高 {eye} · 脚底 {foot}",
  "range.movement.last": "上次 {kind}：↑ {rise} / → {distance}",
  "range.movement.prompt": "按 Space 完成一次动作以记录",
  "range.movement.obstacle": "本次障碍净高 {height}",
  "range.movement.bestRise": "最佳跃起：原地 {standing} / 助跑 {running}",
  "range.movement.bestRun": "跑道最远跑跳：{distance}",
  "range.movement.bestVault": "最高翻越 {vault} / 攀爬 {mantle}",
  "range.movement.crossed": "跳过障碍：{height}",
  "range.movement.limits": "参数上限：翻越 {vault} / 攀爬 {mantle}",
  "range.movement.theory": "跳高理论：{standing} / {running}",

  // ── 操作测试场：场内路牌与标尺 ────────────────────────────────────────
  "range.movement.signWelcome": "操作交互测试场",
  "range.movement.signWelcomeSub": "单位 m · Home 复位 · PgUp / PgDn 切区",
  "range.movement.signRunJump": "Shift + W 助跑 → Space 起跳",
  "range.movement.signVault": "贴近后 Space · 橙翻越 / 紫攀爬 / 红超限",
  "range.movement.signJump": "提前起跳测障碍 · 贴近 Space 会优先翻越",
  "range.movement.signCrouch": "C 蹲起 · W / A / S / D · 低顶下切姿态",
  "range.movement.signProne": "Z 趴下 · W / A / S / D · Shift 快速匍匐",
  "range.movement.signClearance": "净空 {value}",
  "range.movement.signHeight": "高度 {value}",
  "range.movement.signTunnel": "长 7 m · 入内 / 起身 / 退回",
  "range.movement.signOverLimit": "超过攀爬上限 · 阻挡对照",
  "range.movement.signMantleTop": "攀爬最高档",
  "range.movement.signVaultTop": "翻越最高档",
  "range.movement.signStep": "可自动跨步 · 不能当跳跃成绩",
  "range.movement.signMeasured": "以实测动作类型判定",
  "range.movement.signJumpRef": "空地跃起理论参考",
  "range.movement.signJumpRefSub": "原地 {standing} / 满助跑 {running}",
  "range.movement.signJumpLimit": "跳跃设计上限 {value}",
  "range.movement.signJumpLimitSub": "红线为参数限值 · 实际峰值看记录",
  "range.movement.signVaultRef": "翻越 {vault} / 攀爬 {mantle}",
  "range.movement.signVaultRefSub": "水平位移：翻越 {vault} / 攀爬 {mantle}",
  "range.movement.signRunZero": "0 m · 起跳参考线",
  "range.movement.signRunZeroSub": "成绩按真实起跳 → 落地点计算",
  "range.movement.signRunBest": "会话最远跑跳",
  "range.movement.signRunBestSub": "黄线 = 从 0 m 投影的实测最佳距离",
  "range.movement.signHeightSub": "脚底基准 0 m",

  // ── 爆炸测试场（?explosion=1）：交互与提示 ────────────────────────────
  "range.explosion.pickupLabel": "领取{name} · {key} 投掷",
  "range.explosion.pickupHint": "已领取{name}，按住 {key}，松开投出",
  "range.explosion.vehicleLabel": "{name} · 向前开一炮",
  "range.explosion.barrageBusy": "炮击进行中",
  "range.explosion.barrageCall": "呼叫炮击 · 落点在玩家周围16m",
  "range.explosion.barrageHint": "炮弹来袭！抬头观察亮光轨迹，移动避开落点",
  "range.explosion.returnLabel": "投来一枚活手雷 · 靠近按F掷回",
  "range.explosion.returnHint": "活手雷落到附近后，按 F 拾起并掷回。原引信继续计时",
  "range.explosion.airstrikeBusy": "飞机投弹中，等待飞离",
  "range.explosion.airstrikeCall": "召唤飞机 · 玩家周围16m随机投弹",
  "range.explosion.airstrikeHint": "飞机正在进场，向你附近随机投弹。抬头观察，移动避开弹着！",
  "range.explosion.resetLabel": "恢复平地 · 清除在途弹",
  "range.explosion.resetHint": "地形已恢复，可以继续测试",

  // ── 爆炸测试场：场内路牌 ──────────────────────────────────────────────
  "range.explosion.signPickup": "{name} · F 领取",
  "range.explosion.signBarrageRadius": "F · 玩家周围 16m",
  "range.explosion.signAirstrikeRadius": "F · 召唤后才有飞机",
  "range.explosion.signVehicle": "{name} · F 单发",
  "range.explosion.signTitle": "爆 炸 测 试 场",
  "range.explosion.signRoute": "通行验证 · 士兵往返穿越炮坑",

  // ── 白刃实验场（?melee=1）：面板 ──────────────────────────────────────
  "range.melee.aria": "白刃战独立实验",
  "range.melee.title": "白刃战实验场",
  "range.melee.subtitle": "大刀与刺刀",
  "range.melee.scenarioLabel": "独立战斗",
  "range.melee.scenarioAria": "独立战斗项目",
  "range.melee.btnStart": "开始／重开",
  "range.melee.btnPause": "暂停对手",
  "range.melee.btnResume": "恢复对手",
  "range.melee.controlAttack": "左键：轻击／蓄力重击",
  "range.melee.controlParry": "右键：拨枪 · WASD：移动避刺",
  "range.melee.controlPress": "F：贴身压枪／顶架 · 抵抗时连按 F",
  "range.melee.controlWeapon": "1／3：步枪／大刀 · V：射击／白刃架势",
  "range.melee.controlAlt": "按住 Alt 操作面板 · 松开继续战斗",
  "range.melee.animSummary": "动作检查",
  "range.melee.animLabel": "动作",
  "range.melee.btnPreview": "播放敌我动作",
  "range.melee.btnResumeFight": "恢复战斗",
  "range.melee.animTimeLabel": "动作进度",
  "range.melee.animTimeAria": "动作逐帧进度",
  "range.melee.animNote": "播放时暂停对手；拖动进度条定格。开始／重开恢复战斗。",
  "range.melee.assistLabel": "QTE 输入",
  "range.melee.assistTap": "标准 · 连按 F",
  "range.melee.assistHold": "辅助 · 长按 F",
  "range.melee.assistAuto": "辅助 · 自动抵抗",
  "range.melee.logSummary": "最近交锋",

  // ── 白刃实验场：状态读数 ──────────────────────────────────────────────
  "range.melee.statusDead": "本轮阵亡 · 可重开",
  "range.melee.statusField": "已完成 {done}／{total} 组 · {state}",
  "range.melee.statusEncounter": "正在交锋",
  "range.melee.statusApproach": "走近场内标牌选择对手",
  "range.melee.statusCleared": "本轮完成 · 可重开",
  "range.melee.statusRemain": "{name}　剩余 {living}",
  "range.melee.weaponDadao": "大刀",
  "range.melee.weaponBayonet": "刺刀 · 白刃架势",
  "range.melee.weaponRifle": "步枪 · 射击架势",
  "range.melee.phaseReady": "准备",
  "range.melee.parryWindow": "（窗口有效）",
  "range.melee.meters": "{weapon} · {phase}{parry}\n生命 {health} · 体力 {stamina} · 平衡 {poise}",
  "range.melee.sideNra": "友军",
  "range.melee.sideIja": "日军",
  "range.melee.targetLine": "{side} {id} · {body}",
  "range.melee.targetAlive": "{distance}m · {health}生命 · {phase}",
  "range.melee.targetAliveRole": "{distance}m · {health}生命 · {phase} · {role}",
  "range.melee.targetDown": "已倒下",
  "range.melee.targetsIdle": "{living} 名对手待命 · 可前往下一组",

  // 交锋状态机的相位名与多打一的分工名（Data_MeleeCombat 的 phase / role 是 ASCII id，
  // 这里是它们的显示名）。
  "range.melee.role.front": "正面牵制",
  "range.melee.role.flank": "侧翼",
  "range.melee.state.idle": "警戒",
  "range.melee.state.charge": "蓄力",
  "range.melee.state.windup": "起手",
  "range.melee.state.active": "接触有效",
  "range.melee.state.recovery": "收招",
  "range.melee.state.parry": "拨挡",
  "range.melee.state.push": "推架",
  "range.melee.state.stagger": "失衡",
  "range.melee.state.fall": "倒地",
  "range.melee.state.down": "倒地",
  "range.melee.state.rise": "起身",
  "range.melee.state.qte": "抵抗",

  // ── 断肢测试场（?gore=1）：路牌 ────────────────────────────────────────
  "range.gore.signWelcome": "断肢测试场",
  "range.gore.signWelcomeSub": "枪线 · 炸坑 · 刀桩 · 观察台",
  "range.gore.signLineSub": "两排木桩 · 十米与二十五米",
  "range.gore.signCraterSub": "六个木桩 · 一二三米环",
  "range.gore.signBladeSub": "三个木桩 · 台上齐胸",
  "range.gore.signDeckSub": "退后看全场 · 白板背景",
  "range.gore.signDistance": "{value} 米",
  "range.gore.signRing": "{value} 米环",
  "range.gore.signBladePost": "台上木桩",
  "range.gore.signCentre": "爆心",

  // ── 断肢测试场：左上角面板 ────────────────────────────────────────────
  "range.gore.title": "断肢测试场",
  "range.gore.subtitle": "四工位 · 木桩兵",
  "range.gore.aria": "断肢测试面板",
  "range.gore.btnForceOn": "下一发必断：开",
  "range.gore.btnForceOff": "下一发必断：关",
  "range.gore.btnReset": "重置木桩",
  "range.gore.btnDetonate": "引爆炸坑",
  "range.gore.btnSlowOn": "恢复速度",
  "range.gore.btnSlowOff": "慢动作 {scale}×",
  "range.gore.btnRandom": "随机卸一段",
  "range.gore.limbsLabel": "对准星目标卸一段",
  "range.gore.controls": "按住 Alt 用鼠标点面板",

  // ── 断肢测试场：实时读数 ──────────────────────────────────────────────
  "range.gore.readWaiting": "断肢系统未就绪",
  "range.gore.readQuality": "画质 {quality} · 断肢 {enabled}",
  "range.gore.readParts": "肢块 {live} / {max} · 断面 {caps} · 血源 {spurts}",
  "range.gore.readCalls": "断肢批次 +{delta} · 上一帧 {ms} 毫秒",
  "range.gore.readTarget": "准星目标：{target}",
  "range.gore.readNone": "无",
  "range.gore.readSevered": "{id} 已卸：{list}",
  "range.gore.readIntact": "{count} 个木桩完好",
  "range.gore.on": "开",
  "range.gore.off": "关",

  // ── 断肢测试场：肢体名（键的后半段是 CHARACTER_HITBOX_PROFILE 的 shape id）──
  "range.gore.limb.upperArmL": "左上臂",
  "range.gore.limb.forearmL": "左前臂",
  "range.gore.limb.upperArmR": "右上臂",
  "range.gore.limb.forearmR": "右前臂",
  "range.gore.limb.thighL": "左大腿",
  "range.gore.limb.calfL": "左小腿",
  "range.gore.limb.thighR": "右大腿",
  "range.gore.limb.calfR": "右小腿",
  "range.gore.limb.head": "头",
});

/** 这张表覆盖的代码文件：闸门从此不许它们再出现玩家可见的中文字面量。 */
export const GATED_MODULES = Object.freeze([
  "Script_RangeField.mjs",
  "Script_WeaponRangeField.mjs",
  "Script_WeaponRangeRuntime.mjs",
  "Script_MovementRange.mjs",
  "Script_MovementRangeField.mjs",
  "Script_ExplosionRange.mjs",
  "Script_ExplosionRangeField.mjs",
  "Script_MeleeLab.mjs",
  "Script_GoreRangeField.mjs",
  "Script_GoreRange.mjs",
  "Script_GoreLab.mjs",
]);

/**
 * 运行时拼出来的键前缀。可变部分**只来自代码/数据里的 id**，不是自由字符串：
 *   · `range.melee.state.<phase>`  —— phase 是 Data_MeleeCombat 的状态机相位 id；
 *   · `range.melee.role.<role>`    —— role 是多打一的分工 id（front / flank）；
 *   · `range.movement.kind.<kind>` —— kind 是 Script_Player 记的动作类型
 *     （jump / runJump / vault / mantle）。
 * 前两处查不到时退回相位/分工的原 id（画面上看得见是哪一个没登记），不静默空白。
 *
 * 其余的键**一律写成紧跟 `T(` 的字面量**（`cond ? T("a") : T("b")`，不是
 * `T(cond ? "a" : "b")`）—— 闸门的静态引用检查只认前者，写成后者等于把这些键
 * 从「引用了基准语言没有的键」那道闸里摘出去，打错一个字要到画面上才看得见。
 */
export const DYNAMIC_PREFIXES = Object.freeze([
  "range.melee.state.",
  "range.melee.role.",
  "range.movement.kind.",
  // `range.gore.limb.<id>` —— id 是 CHARACTER_HITBOX_PROFILE 的 shape id
  //（upperArmL / forearmL / thighL / calfL / head 与右侧同名），查不到时退回原 id。
  "range.gore.limb.",
]);
