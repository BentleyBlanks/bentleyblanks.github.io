// 《台儿庄：血战滕县》局部光源（簇状前向光照）的数值与**纯几何规则层**。
//
// 契约 2：这个文件零 three 依赖。它同时是纯 Node 单测唯一能直接 import 的一层
// —— 仓库里的 three 是 `vendor/three/build/three.module.js`（`.js` 扩展名，
// 在没有 `"type": "module"` 的 package.json 下 Node 只会当 CJS 解析并当场报
// `Cannot use import statement outside a module`），所以任何 import 了 three 的
// 模块都进不了纯 Node 测试。**簇分配这套几何必须待在这一层**，否则
// 「与暴力法一致」那条断言只能上浏览器，慢一百倍还看不清是哪一步错。
//
// 分两块：
//   1. 档位与光源常量（纯数据）；
//   2. `ClusterGrid` —— 视锥切簇 + 球→簇分配（纯算术，零分配、可在 Node 里跑）。
//
// 参考实现：Olsson/Billeter/Assarsson《Clustered Deferred and Forward Shading》
// (HPG 2012) 的指数深度切片 + Emil Persson《Practical Clustered Shading》
// (SIGGRAPH 2013) 的「先按屏幕矩形收窄候选，再逐簇做精确球-AABB 判定」。
// UE 的 Forward+ 用的是同一套（`FLightGridInjection`，32×32 像素 tile ×
// 指数 Z 切片，逐簇 AABB 相交）。

// ---------------------------------------------------------------------------
// 1. 档位
// ---------------------------------------------------------------------------

/**
 * 光源类型编号。写进光源数据表的 t1.a，GLSL 侧按同一套数解释。
 * 不要重排：着色器里是 `> 0.5 / > 1.5` 的阈值比较。
 */
export const LIGHT_TYPE = { POINT: 0, SPOT: 1, TUBE: 2 };

/**
 * 逆平方衰减指数。全项目**只有这一个值**：`physicallyCorrectLights` 语义下
 * 点光的辐照度就是 1/d²，three 的 `getDistanceAttenuation(d, cutoff, decay)`
 * 里 decay 恒为 2。既然是常数就不占光源数据表的一个通道（那个位置留给类型）。
 */
export const LIGHT_DECAY = 2;

/**
 * 三方前向 PBR 里保留的物理点光槽位数（旧路径 / GI 注入 / 英雄光的上界）。
 *
 * 2026-09 之前这就是**全部**的动态光预算：逻辑火源可以有几十处，每帧按镜头
 * 贡献排序只有前 N 盏进 GPU。簇状光照落地后它退成两件事：
 *   · low 档仍走这条老路（簇表的每帧 CPU 开销对集显不划算）；
 *   · 其它档位它只剩「喂给探针体 GI 的那几盏」（`Script_Gi.MAX_FIRES` 与它对齐）
 *     和「英雄光那一盏」，不再决定画面上能亮几盏灯。
 */
export const EFFECT_LIGHT_COUNT = { low: 2, medium: 4, high: 6, ultra: 6 };

/**
 * 一档簇状光照 = 一张网格 + 一份光源预算。
 *
 * 字段：
 *   enabled     这一档走不走簇（false = 保持 2026-09 之前的固定灯池）
 *   maxLights   一帧最多送进 GPU 的局部光数（光源数据表的高度）
 *   tilesX/Y    屏幕切几格。16×9 是 16:9 屏上正方形 tile 的自然解
 *               （1440p 下一格 120×80 px，与 UE Forward+ 的 32 px tile 相比更粗，
 *               但我们的光比 UE 的场景少一个量级，粗 tile 换来的是每帧
 *               CPU 分配只有几千个簇要遍历）
 *   slices      指数深度切片数
 *   far         簇网格覆盖到多远（米）。再远的局部光对画面已经没有贡献
 *               （半径最大的火也就 30 m，逆平方到 150 m 只剩 0.4%）
 *   maxIndices  光索引表的容量（所有簇的引用数总和上限）
 *   spots       这一档给不给聚光（探照灯 / 车灯 / 门里透出的光）
 *   heroShadow  这一档**允许**留一盏投影的英雄光（是否真开由画质面板决定）
 *
 * 网格与预算的关系：簇数 = tilesX×tilesY×slices。high 是 3456 簇，
 * ultra 是 12288 簇。每帧 CPU 要做的事按「簇数 + 光覆盖的簇数」走，
 * 不按屏幕像素走 —— 这是簇状相对于 tile-based（forward+）延迟切片的核心好处。
 */
export const CLUSTER_TIERS = {
  // low 留在老路上：两盏三方点光。集显上每帧几千次球-AABB 判定 + 两张纹理上传
  // 换来的画面收益，抵不过它在 CPU 上的占用（low 档本来就卡在 CPU 提交）。
  low: {
    enabled: false, maxLights: 6, tilesX: 12, tilesY: 8, slices: 16,
    far: 90, maxIndices: 8192, spots: false, heroShadow: false,
  },
  medium: {
    enabled: true, maxLights: 32, tilesX: 16, tilesY: 9, slices: 24,
    far: 140, maxIndices: 32768, spots: true, heroShadow: false,
  },
  high: {
    enabled: true, maxLights: 64, tilesX: 16, tilesY: 9, slices: 24,
    far: 150, maxIndices: 65536, spots: true, heroShadow: true,
  },
  ultra: {
    enabled: true, maxLights: 128, tilesX: 24, tilesY: 16, slices: 32,
    far: 170, maxIndices: 196608, spots: true, heroShadow: true,
  },
};

/**
 * 簇网格的近平面（米）。**不用相机的 near（0.08 m）**：指数切片的
 * `log(d/near)` 在 near 太小时把一半的切片都花在「贴着鼻子的 10 cm」上，
 * 街道那一段反而只剩几片。0.5 m 之内没有任何几何会被局部光照亮到有意义。
 */
export const CLUSTER_NEAR = 0.5;

/** 一个簇最多记多少盏灯。簇表把 offset 与 count 打进一个 uint32（count 占低 8 位）。 */
export const CLUSTER_MAX_PER_CLUSTER = 255;

/**
 * 簇数据表纹理的宽度（纹素）。簇表 / 光索引 / 光源数据三段都是一维的，
 * 而纹理是二维的，所以按 1024 个纹素折行（`ivec2(i & 1023, i >> 10)`，GLSL 侧同一条式子）。
 * 1024 是 2 的幂，位运算取模；也远小于任何 WebGL2 实现的最大纹理宽度。
 *
 * 2026-09 集成期三张表合并成一张 RGBA32F（采样器预算，见 Script_ClusteredLights
 * 构造器里的布局注释），所以一行是 1024 纹素 = 4096 个 32 位分量。
 */
export const CLUSTER_DATA_TEX_WIDTH = 1024;

/** 旧名（合并前只给光索引表用）。外部调用点已经没了，保留一行免得旧测试断 import。 */
export const CLUSTER_INDEX_TEX_WIDTH = CLUSTER_DATA_TEX_WIDTH;

// ---------------------------------------------------------------------------
// 2. 簇网格（纯几何）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 3. 室内天光遮蔽（2026-09-28，第一关；Script_InteriorSkyOcclusion + Data_FirstLevelInteriors）
// ---------------------------------------------------------------------------

/**
 * 「屋里比屋外暗」的数。屏幕空间一趟：按 AO 图里的视深还原世界坐标，落在某间屋子
 * 内框里就把 AO 可见度再乘一个室内天光可见度（**只压间接光**，契约 6；直射光由阴影管）。
 *
 * 可见度模型（每间屋子）：vis = clamp(dark + Σ 口子, dark, 1)，每个口子贡献
 *   gain · A · (cosθ·(1−cosFloor) + cosFloor) / (π · (d² + A · soften))
 * 即「从该点看过去这个口子占了多大的投影立体角」—— 离 2×2.35 m 的门三米约 0.13，贴着门 ≈ 1。
 * `dark` 是屋子最深处的底（逐屋写在 Data_FirstLevelInteriors）。
 *
 *   strength     总强度（0 = 关；mix(1, vis, strength)）
 *   gain         口子贡献倍率
 *   cosFloor     背对口子的点也分一点（口子两侧的墙根不至于死黑）
 *   soften       分母软化：口子面积 × 它 —— 贴着口子时不发散
 *   featherH     内框之外水平方向的过渡带（米）。墙外皮在内框外一个墙厚（0.6），
 *                过渡带必须比它短，外墙面才一点不暗
 *   featherTop   顶棚之上的过渡带（米）。屋面板最低也在顶棚上 0.32 m
 *
 * 为什么乘进 AO 而不是写材质补丁：补丁要给每份材质挂几十个 vec4 的 uniform 数组，
 * three 对数组 uniform 不做缓存，每次换材质都整组重传（第一关本来就是 CPU 提交瓶颈）；
 * 乘进 AO 图是半分辨率一趟 blit，所有吃 AO 的材质（地形、人物、道具、库材质）自动生效，
 * 零采样器、零材质改动。代价：没挂 AO 补丁的材质（白盒纯色体块）不吃它，low 档没有 AO 也没有它。
 */
export const INTERIOR_SKY = Object.freeze({
  strength: 1.0,
  gain: 1.0,
  // 0.2 → 0.3：洞口 / 门框两侧朝里的面（与口子几乎平行）在 0.2 时只分到一成，SB01 的门柱内侧压成死黑
  cosFloor: 0.3,
  soften: 0.35,
  featherH: 0.5,
  featherTop: 0.25,
  // 室内暖反弹（2026-09-28 第二轮）。被屋顶挡掉的天光由门口晒着的土地面 / 墙面弹进来的暖光补回一截：
  // 辐照度 = color·strength·Σ inside·(1 − roomVis)·逐屋 bounce，再乘 GTAO 自己的可见度，
  // 写进 SSIL 那一路（材质 ×反照率/π×SSIL 强度 0.70 加进 indirectDiffuse）。只在屋子内框里、只动间接光、零采样器。
  // 为什么需要：只压不补时屋里剩下的间接光全是天（中性偏冷），再叠上出厂分级的蓝紫 lift，
  // 灶屋暗部读成品红（实测暗像素 28/23/30，参考 39/35/32 的暖棕）。color = 晒土的反弹色（R > G > B），
  // 饱和度压着给：B1 的土坯 / 砖反照率本身就是暖的 —— [1, .80, .58] 暗部 R/B 1.7、[1, .90, .78] 1.6，
  // 参考四张室内暗部 R/B 1.22–1.50（均 1.38），取 [1, .94, .86]。
  // strength 扫过 0.45 / 0.8 / 1.4 / 2.2 / 3.2（灶屋 09_2 整幅 L 17 / 20 / 26 / 33 / 41，参考 35–52），取 2.4。
  bounce: Object.freeze({ color: Object.freeze([1.0, 0.94, 0.86]), strength: 2.4 }),
});
