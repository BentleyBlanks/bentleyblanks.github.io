// Data_Emplacements.mjs — 架设武器档案表（可接管的固定机枪位）。
//
// **纯数据**：不 import three、不 import 规则代码、不含函数。
// 状态机在 `Script_Emplacement.mjs`（一张表 + 一台状态机）；玩家可见的名字与说明
// 存**文本键**，句子在 Data_Text_Gameplay.mjs 的 `gameplay.emplacement.*`。
//
// 数值只在这里，文档写常量名不抄数（AGENTS 硬规矩 12）。
//
// 射速 / 伤害 / 有效射程 / 换弹时间一律**不在这张表里重复**：
// 它们在 `Data_Weapons.WEAPONS[weaponId]` 上，这里只放「架起来之后才有的那些数」。
// 抄一遍的代价见 Data_Weapons 头注 —— 两处数字第二天就会分叉。
//
// arcYawDeg / arcUpDeg / arcDownDeg
//   三脚架的回旋与俯仰限位（度，相对 baseYaw / 水平）。九二式的三脚架是可以
//   松开回旋卡箍的，但架在射孔或街垒后头时真正限住射界的是工事本身 —— 30° 是
//   「封住一条街 + 两侧院门」够用、又明显是一挺**固定**武器的宽度。
// heatPerShot / coolPerS / overheatCoolPerS / resumeHeat / warnHeat
//   热量 0—1，**升温与散热一直同时在跑**，所以「能压多少发」不是 1/heatPerShot，
//   而是 1 / (heatPerShot/fireIntervalS − coolPerS)。两个数是照这两条目标解出来的：
//     ① 一直压着不放 → 差不多一条保弹板打完就顶到红线（教「莫一直压」）；
//     ② 可持续占空比 = coolPerS / (heatPerShot/fireIntervalS) ≈ 五成
//        —— 打一梭歇一梭就永远不会过热（教「短点射」）。
//   resumeHeat 是强制冷却之后放行的门槛（不是 0 —— 停火两秒就能接着压的话，
//   过热就不是代价了）。
// jamHeatFloor / jamChanceAtMax
//   概率性小卡只在**热枪**上发生：低于 floor 一次都不卡，到 1.0 时每发 jamChanceAtMax。
//   冷枪不卡是有意的 —— 「短点射」的玩家不该被随机数惩罚。
// clearS / clearHeatVent
//   小卡排障要按住多久；排完顺手放掉多少热（开盖排壳本来就在散热）。
// deadPulls
//   **必然失效**（ForceJam）之后要拉几次枪机才判定这挺枪彻底废了。
//   §6 阶段⑩②「顺子拉枪机『妈卖批！』『早不卡晚不卡！』」就是这几下。
// beltRounds / belts
//   一板多少发、身边有几板。九二式是 30 发金属保弹板横向供弹（reloadKind:"stripFeed"）。
// spreadDeg
//   架起来的枪比端着的稳得多：比中正式腰射的 spreadHipDeg 小一个量级。
// muzzleAheadM / sightRiseM / seatBackM
//   枪身相对 position 的几何：枪口往前多少、瞄准线离基座多高、射手站在后头多远。
// labelKey / noteKey
//   HUD 上的枪名与那一行说明（摆点时可以用 label / note 整条覆盖）。
export const EMPLACEMENT_KINDS = Object.freeze({
  Type92Hmg: Object.freeze({
    id: "Type92Hmg",
    weaponId: "Type92Hmg",
    labelKey: "gameplay.emplacement.kind.Type92Hmg",
    noteKey: "gameplay.emplacement.kindNote.Type92Hmg",
    arcYawDeg: 30, arcUpDeg: 12, arcDownDeg: 10,
    // 200 rpm（0.3 s 一发）：净升温 0.119/s → 一直压着约 8.4 s / 28 发顶红线，
    // 一条 30 发保弹板压到底正好过热；可持续占空比 0.125/0.2433 ≈ 51%。
    heatPerShot: 0.073, coolPerS: 0.125, overheatCoolPerS: 0.20,
    resumeHeat: 0.35, warnHeat: 0.70,
    jamHeatFloor: 0.65, jamChanceAtMax: 0.035,
    clearS: 1.2, clearHeatVent: 0.30,
    deadPulls: 3,
    beltRounds: 30, belts: 5, maxBelts: 8,
    spreadDeg: 0.30,
    recoil: { pitchDeg: .48, yawDeg: .20, recoverS: .16, kickM: .028, kickPitch: .012 },
    muzzleAheadM: 0.55, sightRiseM: 0.10, seatBackM: 0.85,
    heatSmoke: { kind:"smoke", rate:5, radius:.025, rise:.26, sizeStart:.035, sizeEnd:.2, life:1.5, opacity:.15 },
    stance: "crouch",
    sfxFire: "type92", sfxDry: "bolt", sfxBolt: "bolt",
    sfxReload: "stripperLoad", sfxMount: "magIn",
  }),
  Zb26Nest: Object.freeze({
    id: "Zb26Nest",
    weaponId: "Zb26",
    labelKey: "gameplay.emplacement.kind.Zb26Nest",
    noteKey: "gameplay.emplacement.kindNote.Zb26Nest",
    // 两脚架只能在垛口那一段扫，比三脚架窄；但抬得起来打屋顶。
    arcYawDeg: 22, arcUpDeg: 18, arcDownDeg: 12,
    // 500 rpm（0.12 s 一发）：净升温 0.139/s → 一直压着约 7.2 s / 60 发顶红线；
    // 一匣 20 发压到底只到七成热，换匣那 3 秒就把它散掉 —— 弹匣本身就是节奏器。
    heatPerShot: 0.0347, coolPerS: 0.15, overheatCoolPerS: 0.24,
    resumeHeat: 0.30, warnHeat: 0.68,
    // 捷克式可以快速换枪管，热到卡壳之前枪管就该换了 —— 卡壳概率比九二式低。
    jamHeatFloor: 0.72, jamChanceAtMax: 0.025,
    clearS: 1.0, clearHeatVent: 0.35,
    deadPulls: 3,
    beltRounds: 20, belts: 6, maxBelts: 10,
    spreadDeg: 0.42,
    recoil: { pitchDeg: .34, yawDeg: .16, recoverS: .13, kickM: .022, kickPitch: .009 },
    muzzleAheadM: 0.45, sightRiseM: 0.08, seatBackM: 0.70,
    heatSmoke: { kind:"smoke", rate:5, radius:.025, rise:.26, sizeStart:.035, sizeEnd:.2, life:1.5, opacity:.15 },
    stance: "prone",
    sfxFire: "zb26", sfxDry: "bolt", sfxBolt: "bolt",
    sfxReload: "magIn", sfxMount: "magIn",
  }),
});
