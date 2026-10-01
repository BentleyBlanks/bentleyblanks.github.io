# 地面脚印与痕迹（2026-09-30）

人、战车走过地面留下脚印和履带印的基建。唯一现状文档。

| 层 | 文件 |
|---|---|
| 数值 | `Data_Tuning_TerrainTrails.mjs`（纯数据） |
| 规则（纯 Node） | `Script_TerrainTrailRules.mjs`：印章图集、环形窗口、历史、减淡、落脚判定 |
| 采集 + GPU + 着色 | `Script_TerrainTrails.mjs`：`TerrainTrailSystem`（单例）、`TerrainTrailsPass`（帧图）、`TerrainTrailGlsl` / `TerrainTrailUniforms` |
| 接入点 | `Script_TerrainMaterial`（地形表面补丁）、`Script_TrenchSurfaceMaterial`（壕沟湿泥）、`Script_TerrainDeformationView`（砸坑变体腾采样器）、`Script_Post`（帧图一行）、`Script_CharacterModel`（人物骨架登记）、`Script_FirstLevelMissionView`（八九式登记）、`Script_FirstLevelWhiteboxField`（挂地面）、`Script_Main`（每帧采集 + 取证口） |
| 门禁 | `Script_TerrainTrailRulesTest`（Node）、`Script_TerrainTrailsTest`（GPU 夹具）、`Script_TerrainTrailsBrowserTest`（第一关实机） |

## 1. 方案：3A 通行的「痕迹渲染靶」

RDR2 的雪地/泥地、God of War 的雪、Batman: Arkham Origins 的雪、Horizon 的沙地是同一族做法，这里逐项对应：

| 做法 | 这里 |
|---|---|
| 以相机为中心的世界空间俯视渲染靶 | 2048² RGBA8、2 cm/纹素、窗口 41 m（medium 1024² / 3 cm / 31 m；low 不建） |
| 环形（toroidal）寻址，窗口滑动不搬数据 | 世界 xz ÷ 窗口边长取模（`RepeatWrapping`）；窗口按整纹素挪，只清新露出来的条带（剪裁框清屏） |
| 落脚盖印章，印章之间 MAX 混合 | 同一处反复踩坑不会越挖越深；新的深印盖过旧的浅印 |
| 随时间恢复 | 整张一趟反向减法（dst − src），按通道线性减淡；8 位靶上不能做乘法衰减（0.99 × 50 仍舍入回 50） |
| 窗口滑回来时补回来 | CPU 印章历史（环形 8192 条）按「已退掉的量」重新盖回去，印章着色器算 `max(图集 × 强度 − 已退, 0)`，与靶上逐帧减出来的值逐色阶一致 |
| 地形着色采靶 | 视差（POM）找坑底 → 高度差分出法线 → 坑里压平碎石、压暗压光、坑底 AO → 坑深参与积水判据（泥里踩出的坑自己汪水） |
| 落点来自动画 | 人物按渲染后的真实脚骨判着地（不是按时间估）；第一人称按步距交替左右脚；战车按两条履带各自的轨迹 |

靶的通道：**R 坑深、G 泥边（被挤起的一圈）、B 踩乱（颜色与粗糙度那一圈）**，A 不用。

## 2. 数据流

```
主循环 TerrainTrailSystem.Update(dt, {focus: 相机, player, scene})
   ├─ 玩家：步距到 → 左右交替一只脚（趴着：身下拖痕 + 往前伸的手）；落地两只脚并排
   ├─ 人物：登记过的骨架，读上一帧渲染后的 footL/R、calfL/R、pelvis 世界位置 → FootContact → 鞋印 / 膝印 / 拖痕
   ├─ 车辆：登记过的车体，两条履带的着地段前后两个游标 → 每走一个图样周期一段履带印
   └─ Stamp() → 历史 + 待画队列
帧图 terrainTrails（atmosphere 之后、terrainBlend 之前）
   ├─ 窗口：相机离中心 > 0.6 m 挪一次（整纹素），露出的条带清掉 + 从历史回填
   ├─ 减淡：攒够 1/255 就整张减一次
   └─ 新印：实例化四边形一批画完
地形材质（main 与 terrainBlend 的捕获都用）：TerrainTrailApply(...)
```

## 3. 采集

### 3.1 人物（`LugouCharacterRig`）

构造时 `TerrainTrailSystem.Register(rig)`，`Dispose` 时注销。每帧对**离相机 32 m 内、挂在人身上、在主场景里、没死**的骨架：

- 脚踝离**地形**高度 h（按 `field.TerrainHeight`，不按可行走面：站在楼板、踏板、车上不出印）、脚的水平速度 → `FootContact`：
  踝高学一个参考高（跟着真实的最低踝高走，上下限 3–16 cm），低于参考高 +3.5 cm 且速度 < 0.7 m/s 且抬过脚（高于 +7.5 cm）→ 落一次；同一只脚两个印至少隔 14 cm。
- 印章方向 = 踝 → 脚尖骨（`*Toe0`）的水平方向；实测与人物实际移动方向差 2–14°（`recent[].align` 取证）。骨架根节点本身朝 +Z，别拿它当朝向。
- 膝盖（calf 骨原点）离地 < 7.5 cm → 膝印（跪姿）。骨盆离地 < 0.32 m → 趴着，只每挪 0.36 m 盖一段拖痕。
- 这一帧骨头没重新摆（动画降频 / 剔除）就不判：矩阵是旧的，判了会重复落脚。
- 鞋：日军皮靴、百姓布鞋、川军七成草鞋三成布鞋（按 Actor seed 固定）。

### 3.2 第一人称玩家

`player.stepDistance` 每走一步距（走 0.72 / 跑 0.95 / 蹲 0.55 / 爬 0.36 m）落一只，横向 ±10 cm、落在重心前 12 cm，朝向 = 速度方向；跑步印子拉长 8%。落地（`jump.landSerial` 变了）两只并排、压得最重。过场与主菜单里不落。

### 3.3 直接盖印

`TerrainTrailSystem.Stamp({x, z, dirX, dirZ, kind, side, strength:[r,g,b], lengthScale, widthScale, recordWithinM})`，
`kind` ∈ `straw cloth boot knee hand drag scuff tread`（`Data_Tuning_TerrainTrails.TERRAIN_TRAIL_STAMPS`）。离相机超过 60 m（或 `recordWithinM`）不记。

### 3.4 履带车辆（用户 2026-09-30 追加「战车也应该有车辙痕迹」）

`TerrainTrailSystem.TrackVehicle(车体 Object3D, spec)`，八九式在 `Script_FirstLevelMissionView.BuildTank` 登记（`Dispose` 注销）。车体局部 −Z 车头、+X 右（契约 4）。

- 半轨距由车体局部包围盒量（半车宽 − 半履带宽；八九式量出 0.93 m），不写死。
- 第一次压到地形上：两条履带整段着地长（3.6 m）各盖一遍（停着的车也压着地）。
- 之后每条履带两个游标：往前开时着地段最前面每走一个图样周期（0.56 m = 4 块履带板 × 0.14 m）盖一段，倒车在最后面盖；另一头的游标只跟着走。每段的履齿以印章中心为相位原点，所以相邻两段落在同一套世界格子上，接起来是一条连续的履带印。原地转向两条履带各走各的。
- 车体不可见、离地形 > 0.6 m（桥上）不盖；跳了 12 m 以上当作瞬移，重新整段压一遍。
- 履带印记录半径 400 m（又大又持久：战车在远处开过去，玩家之后走到那条路上还要看得见）。

## 4. GPU 与预算

- 靶：`WebGLRenderTarget` 2048² RGBA8（16 MB）、线性过滤、无 mip、无深度；`pipeline.targets.terrainTrails`。
- 印章图集：程序生成（`BuildStampAtlas`，开机约 0.1 s），512 × 128 RGBA8，一格一种印章，**右脚**，左脚在四边形上镜像（宽取负）——所以印章材质必须双面，否则一只脚被背面剔掉（开发时踩过）。图集带 mip。
- 采样器：地形材质 +1（`uTrailMap`）。**砸坑变体原来已是 16/16**（ANGLE-D3D11 上限）：编进脚印时，坑土法线改采地形纹理数组的翻土层（`Script_TerrainDeformationView`，`#ifdef TERRAIN_TRAILS`），省下 `uCraterNormal`，仍是 16。石材变体（`TrenchStone`）不编脚印。low 档不编（地形材质少一个采样器）。
- 成本（第一关 07、1920×1080、high、RTX 4070 SUPER / ANGLE-D3D11，同页开 / 关交替 4 轮，剖析器 GPU 分段均值）：
  `terrainTrails` 一趟 0.02–0.04 ms（整张重建那一帧 0.13 ms）；主场景 pass 开 6.2–7.7 ms、关 6.7–7.8 ms，差别在轮间噪声里；
  CPU 采集（玩家 + 约 30 个人物 + 战车）每帧 0.16–0.22 ms。没有 pass 在画时（白盒默认、low）60 帧后停采。
- 分档：`Data_Tuning_Graphics` 的 `terrainTrails`（档位名 / false）；白盒登记为 `terrainTrails` 开关，**照白盒契约默认关**（「编辑白盒画质 → 地面脚印与痕迹」可开）。
- 预热（2026-10-01）：印章 / 减淡两只材质各在自己的小场景、对着靶画，程序键里灯光数是 0，不能并进 `WarmLevel` 的代理组走 `CompileAsRendered`（编出来是带关卡灯光的孪生）。`TerrainTrailsPass.Warm(renderer)` 照 `Render` 的状态各真画一次（尺寸 0 / 强度 0 的印章、0 减淡），靶内容、历史与统计都不动；`WarmLevel` 全场出画那一步调它，档位不开痕迹时什么都不做。不画的话第一枚脚印、第一次减淡那一帧现编（渲染管线 §18.8）。

## 5. 着色与观感

旋钮全在 `TERRAIN_TRAIL_SURFACE`，开机抄进共享 uniform；`ApplyTrailSurface({...})` 或直接改 `TerrainTrailUniforms.*.value` 即时生效（不重编译）。视差步数按画质编译期定（6 / 8 / 10）。

| 旋钮 | 值 | 作用 |
|---|---|---|
| `depthM` / `rimM` | 0.04 / 0.012 | 靶满值对应的坑深 / 泥边高（再乘软硬） |
| `soft` | 底土 0.8、车道 0.45、草茬 0.6、翻土 1.0 | 逐地形层软硬；前沿湿泥区再 ×1.3 |
| `albedoFlatten` | 0.85 | 坑里反照率往该处地层平均色收（鞋底把碎石土粒压平）——碎石土路上读出脚印形状主要靠这一条 |
| `printDarken` / `disturbDarken` | 0.42 / 0.18 | 坑底压实更潮 / 踩乱一圈 |
| `hardFloor` | 0.9 | 颜色类效果按 max(软硬, 0.9)：硬地坑只有几毫米，颜色照样读得出 |
| `wallLight` | 1.6 | 越硬坑越浅，法线的坡按 1 + 1.6 × (1 − 软硬) 放大（只影响光） |
| `waterPerM` | 6 | 坑深折进积水判据：湿泥 / 沟底 / 车道积水处的坑会汪水 |

实机观感（第一关 high，截图只留本地 `_shots/TerrainTrails/`）：

- 集结处这类压实碎石硬地：一串淡而可辨的压实鞋印（开 / 关痕迹，自己脚印附近像素均差约 9/255，全屏约 3.5）。这是有意的——真实干硬土路上的脚印本来就淡；想更显眼先调 `soft[1]`、`printDarken`。
- 01–05 前沿湿泥区沟底：坑、泥边、坑底反光都读得出。
- 战车履带：压实的深色宽带、横向履齿纹、两侧挤出的泥，远处也清楚。

调试：`?terrainView=8` 红坑深 / 绿泥边 / 蓝踩乱（已乘淡出）；`?trails=0` 关采集；
`Debug.TerrainTrails.Describe()`（统计、最近的印 `recent` / `recentPlayer` / `recentVehicle`、pass 状态）、`.Read(x, z)`（同步读回靶上一点）、`.Stamp(o)`、`.SetEnabled(b)`、`.Reset()`。

## 6. 验收入口

```powershell
node Taierzhuang1938/Script_TerrainTrailRulesTest.mjs
node Taierzhuang1938/Script_TerrainTrailsTest.mjs [--shot]
node Taierzhuang1938/Script_TerrainTrailsBrowserTest.mjs [--quality=high] [--stage=7]
node Taierzhuang1938/Script_SamplerBudgetTest.mjs --only=firstLevel
node Taierzhuang1938/Script_CraterSurfaceTest.mjs
node Taierzhuang1938/Script_TerrainBlendTest.mjs
node Taierzhuang1938/Script_WhiteboxQualityTest.mjs
```

- 规则：图集确定性 / 留白 / 露趾 / 鞋钉 / 履齿相位；环形窗口露出条带 300 次随机暴力核对（恰好 = 新窗口 − 旧窗口、同一像素不重复清）；历史挤旧、按矩形筛、已退量；减淡色阶；落脚判定（走路每周期一次、楼板上不出、拖脚不重复、站着一次、滑动不出、膝盖、原地微调）；步距交替。
- GPU 夹具：写靶三通道、左右镜像对称、30 s 减淡 18 阶、滑窗 0.75 窗口后别名纹素清空、滑回逐色阶补回、跨靶边两边都有、地形材质印处变暗而无印处逐像素不变、调试视图、Idle 后重建、石材不编、履带（停车 12 段、8 m 两条各 14 段、间距 0.56 m、±0.93 m、原地转向留印）、程序链接、采样器 ≤ 16。
- 实机：07 真按 W 走、班组真实脚骨落脚、八九式已登记、开 / 关痕迹印处像素差 ≥ 全屏两倍、程序链接、采样器 ≤ 16、无 GL 错误、无页面报错。

## 7. 已知边界

- 只接了第一关的分层地形（`Script_TerrainMaterial` / 壕沟湿泥）。别的地面材质要接：挂 `TerrainTrailUniforms`、在积水之前调 `TerrainTrailApply`，关卡 `AttachGround`。
- 不改几何与碰撞：坑的深度靠视差和法线，掠射角下坑壁不会真的挡住后面的东西。
- 远景合批人群（`ActorCrowd` 远 LOD）不判脚：32 m 外本来也在淡出范围外。人物落在楼板、踏板、车上的脚不出印（按地形高度判）。
- 牛马车（12/13 `DraftCartModels`）的轮子还没登记：接口现成（`Stamp` 一条窄带，或给车轮做一种印章），另开任务。
- 死人、倒地的身体不留压痕；雨、积水不会让旧脚印变淡。
- 历史 8192 条：一个班十几人一直走约几分钟就会挤掉最老的——窗口里靶上的内容不受影响，只是走远再回来时最老的补不回来。
