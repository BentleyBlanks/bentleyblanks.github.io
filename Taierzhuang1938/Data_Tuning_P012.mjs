// Data_Tuning_P012.mjs — 第一关 P0/P1/P2 白盒的节奏与补给旋钮。
// 纯数据：不 import three、不 import 规则代码、不含函数。口径见 docs/Data_TextAndTuning.md §4。
//
// 这里放的是**换个策划改数就该改的数**：波次间隔、弹药账、缺省速度、到点半径。
// 不放这里的：坐标 / 路线 / 体块尺寸（在 Data_FirstLevelP012Layout / Space / Whitebox 里，
// 那是几何考据）、单个交互点按住几秒（在 Data_FirstLevelP012Beats 的交互点规格里，
// 那是"这个点长什么样"的一部分）。
//
// 代码一律 `import { PACING } from "./Data_Tuning_P012.mjs"` 直接读，不复制到本地常量 ——
// 复制过去的后果是改表不生效、测试读到两个真相。

/**
 * 波次释放的节奏闸。动作驱动阶段：**常态 40 秒**放下一种压力，
 * 上一组被清掉或被压住时可以缩到**最短 30 秒**。
 *
 * normalIntervalS   两波之间的常态间隔。到点就放，不看清没清干净。
 * fastClearS        上一组已清 / 已压制时的最短间隔。新战术压力（机枪、掷弹筒、
 *                   涵洞这三种）不许比它更快 —— 否则玩家还没换到枪眼，
 *                   下一种压力就压上来了。
 * frontlineWaveLast 阵地段最后一波的序号。到它为止按"上一波解锁了才轮到我"排队；
 *                   再往后（道路遭遇、伏兵、近战、南路）改为按拍号到了就排。
 * nearEnemyLimit    同屏活着的日军上限。超了的待生成敌人排队等，不硬塞。
 *                   侦察→同轴步枪增援是明确例外，不代表全部波次都这么快。
 */
export const PACING = Object.freeze({
  normalIntervalS: 40,
  fastClearS: 30,
  frontlineWaveLast: 4,
  nearEnemyLimit: 14,
});

/**
 * 补给账。三样都是**有限的**：发完就没有，死亡不返还。
 *
 * frontlineStockClips 前沿弹药箱里一共几个桥夹（config.activities.frontlineAmmo.stockClips
 *                     没写时的缺省值；原来这个 12 在代码里写了两处，改一处漏一处）。
 * frontlineCapClips   一次最多把玩家补到几个桥夹 —— 不是一次给几个，是"补到"。
 * frontlineTakeSeconds 在箱子上按住几秒。
 * southGrenadeStock   南路手榴弹补给点一共几枚。
 * woundedCheckBandages 查看伤员那一下补几包绷带。
 */
export const SUPPLY = Object.freeze({
  frontlineStockClips: 12,
  frontlineCapClips: 4,
  frontlineTakeSeconds: 2.4,
  southGrenadeStock: 2,
  woundedCheckBandages: 1,
});

/**
 * 引路与到点判定。
 *
 * guideSpeedMps      班长引路的缺省速度（本关按拍覆盖表在 config.activities.guideSpeedByBeat）。
 * routeRadiusM       路点到点半径的缺省值：宽松，路线不是走廊。
 * tightRadiusM       需要精确站位的拍（护送、搬担架、南路房）用的紧半径。
 * followGuideRadiusM B13 跟着班长走时对"跟上了"的判定半径 —— 比 tight 松，
 *                    因为目标是一个会动的人。
 */
export const GUIDE = Object.freeze({
  guideSpeedMps: 1.3,
  routeRadiusM: 3,
  tightRadiusM: 0.6,
  followGuideRadiusM: 2.4,
});
