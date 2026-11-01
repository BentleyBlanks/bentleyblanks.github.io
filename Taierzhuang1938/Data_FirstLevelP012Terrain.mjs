// P012 soil heightfield. The same Float32 vertices define visible triangles and
// all ground queries; flattened foundations preserve the authored metre scale.
/**
 * 渲染分块的边长（米）。**按米不按格**：分块常数原来写死 32 **格**，
 * 而正片第一关的 `MISSION_TERRAIN.cellM` 是 0.75 m（旧 P012 夹具是 2 m），
 * 于是同一句代码在正片上切出的是 24 m 的小块 —— 342 × 732 m 的地块被切成
 * 465 只网格。车厢内那个机位顺着车厢往前看，**378 只地块同时进视锥**，
 * 预通道与主通道各提交一次 = 756 个 draw call，占整帧 1498 个的一半
 *（`Script_FirstLevelFrameProbe --strict` 的逐 pass draw 归账）。而这一帧是
 * CPU 提交受限的（docs/Data_TechRenderPipeline.md §13.2），所以这一半是纯亏。
 *
 * 48 m 一块：正片 465 → 128 只，视锥内 378 → 约 100；三角总数一个不变
 *（分块只改接缝处的顶点复制量），法线仍按全局邻居算，接缝照旧无缝。
 * 下限 32 格保证 2 m 格的旧夹具维持原来的 64 m 分块，行为不变。
 * 上限的取舍：块越大，`CutTerrainRectangles` 挖弹坑时要扫的三角越多
 *（一块 2048 → 8192）。
 *
 * 2026-09-15 再放粗一档到 **72 m**：正片 128 → 60 只，车厢机位视锥内
 * 87 → 约 40 只/趟。弹坑扫描一块 8192 → 18432 个三角，仍是**只在建关那一次**
 * 跑（`CutTerrainRectangles` 不进帧循环）；视锥剔除变粗换来的三角增量见
 * `Script_BootTest` 的 `SCENE_RENDER_LIMITS` 对照。再往上（96 m）就只剩
 * 三十来只，省的 draw 追不上多画的三角，停在这儿。
 */
export const CHUNK_METRES = 72;

