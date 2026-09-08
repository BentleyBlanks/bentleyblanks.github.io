// Data_Tuning_Main.mjs — 装配层（Script_Main）自己的那几个数。纯数据，不 import three。
//
// **这里只放 Script_Main 自己拍板的数**。真正的玩法平衡在各自的系统表里：
//   · 换人倒计时 / 死亡卡时长 / 池子见底的那句话 → Data_Battle.REINFORCE
//   · 伤害、命中盒、AI          → Data_Battle.COMBAT / DIFFICULTY
//   · 翻越与跳跃                → Data_Traversal
//   · HUD 的暗角、字幕时长      → Data_Tuning_Hud
// 装配层不复制它们，只 import 读（口径见 docs/Data_TextAndTuning.md §4）。

/**
 * 近身班组的人数：**不是加出来的兵**，是把原本撒在两百米外、被雾墙吃掉的人挪到镜头前。
 *
 * 实测一个 Actor 是 37 个 draw call（身体部件没合批），14 个近身兵约 1400 calls，
 * 低于当前 5000 红线。5 + 4 是班组构成，不再是靠藏人的性能上限；
 * 全场开销由 Script_BootTest 按 5000 dc / 600 万三角面统一验。
 */
export const SQUAD = Object.freeze({ nra: 5, ija: 4 });

/** 相机。 */
export const CAMERA = Object.freeze({
  /**
   * 竖直视场（度）。Easy Red 2 那种「周围很远、人很小但看得清」的观感靠窄视场；
   * 70 度会把巷战拉成鱼眼，远处的人缩成一个点，尺度感全没了。
   * **准心几何按同一个数投影散布角**（Script_Hud.CrosshairGeometry 的 fovDeg）。
   */
  baseFovDeg: 55,
});

/** 关卡节奏。 */
export const PACING = Object.freeze({
  /**
   * 钉关保险丝（秒）。声明了 pinFinalZone 的章要等 CHAPTER_RELEASE_SIGNAL 才放行；
   * 信号一直不来的话，超过「配置时长 + 这个宽限」自动放行并告警。
   * 没有它，一条忘了接的信号就是「这一关永远打不完」，而画面上完全看不出为什么。
   */
  pinReleaseGraceS: 240,
});

/**
 * 加载条的分段权重。**每一段都是 { from, span }**，进度写成 `from + span * t`。
 *
 * 这张表和 Boot() 里那串 setStep 是一一对应的，改哪一段的耗时就调哪一段的 span ——
 * 它不是玩法数值，但它是「一处改、别处必须跟着改」的典型：分散在十几个调用点上
 * 拼字面量时，加一步就会把后面所有段的进度顶歪，而画面上只表现为进度条往回跳。
 *
 * 注意 field 那一段**故意与 bakeTextures 的末端重叠**（都到 0.24）：
 * 建切片是这条链上最长的一步，从烘贴图结束那一刻接上去，中间不留空档。
 */
export const BOOT = Object.freeze({
  progress: Object.freeze({
    bakeTextures: Object.freeze({ from: 0.02, span: 0.22 }),
    loadPbr: Object.freeze({ from: 0.242, span: 0.003 }),
    physics: 0.245,
    field: Object.freeze({ from: 0.24, to: 0.62 }),
    actors: 0.90,
    actorMeshes: 0.92,
    warmActors: Object.freeze({ from: 0.94, span: 0.02 }),
    // 关卡预热（Script_Main.WarmLevel）：人物对象池、第一人称各把枪、场上首见材质。
    actorPool: Object.freeze({ from: 0.96, span: 0.01 }),
    warmViewmodel: Object.freeze({ from: 0.97, span: 0.01 }),
    warmLevel: Object.freeze({ from: 0.98, span: 0.02 }),
    ready: 1.0,
  }),
  /**
   * 进过场时那条独立的预热条（WarmupShaders 的四步，见它的抬头账）。
   * 四段加起来正好铺满 0—1：提交 program、重编场景光照、逼出各 pass 的变体、放网格。
   */
  warm: Object.freeze({
    dressSet: 0.1,
    submitShaders: Object.freeze({ from: 0.05, span: 0.3 }),
    relightScene: Object.freeze({ from: 0.35, span: 0.2 }),
    warmMaterials: Object.freeze({ from: 0.55, span: 0.35 }),
    loadMeshes: Object.freeze({ from: 0.9, span: 0.1 }),
  }),
});
