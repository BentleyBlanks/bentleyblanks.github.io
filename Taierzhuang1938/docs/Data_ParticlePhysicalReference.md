# 粒子物理观感重做：对标与验收

本轮改善火焰、烟尘、爆炸及其在战场中的物理观感。系统统一和测试只是基础，验收同时使用公开模拟参考、游戏实拍、多视角与运动过程。

## 已核验的外部基准

- [Unity：六向光照烟雾](https://unity.com/blog/engine-platform/realistic-smoke-with-6-way-lighting-in-vfx-graph)：多方向烘焙光照支持内部遮光和逆光边缘，但官方明确指出它仍是平面贴图，近处转动视角会暴露局限。用作受光基准，不把它称为真正三维烟体。
- [Epic：流体模拟概览](https://dev.epicgames.com/documentation/en-us/unreal-engine/fluid-simulation-in-unreal-engine---overview)：烟形由密度场、速度输运和温度浮力形成；火与烟的运动需连续。
- [Epic：Sparse Volume Textures](https://dev.epicgames.com/documentation/en-us/unreal-engine/sparse-volume-textures-in-unreal-engine)：VDB 体积序列保存空间变化的密度/温度，三维光线积分保留多视角结构。这里参考其数据和渲染原则，不照搬 UE 的运行时。
- [JangaFX：免费 VDB 动画](https://jangafx.com/software/embergen/download/free-vdb-animations)：作者页面明确 CC0；本轮选取 Small Camp Fire 和 Industrial Chimney Smoke 对照持续火焰及浮升烟流。原始模拟留本地，游戏只交付必要的降采样数据及重建脚本。

## 现有画面中要消除的问题

1. 静态火焰遮罩被反复拉伸、上移，像数片发亮的纸，缺少细颈断裂、短火舌及相连的热羽流。
2. 烟柱由相似球形密度团堆叠，根部串珠、顶部膨成蘑菇，形态不是沿速度场被卷入和输运的连续介质。
3. 现有球面取样与单点遮光无法表达复杂烟体内部的光学厚度；近处轮廓和相机转动的观感尤其弱。
4. 颜色、密度、温度和亮度独立凭常数调节，火的热区与烟的冷却阶段衔接不足。

## 本轮验收要求

- 同一效果检查正面、侧面、斜上方，确认真实体积结构，而非面片始终朝向相机。
- 检查 0.1 / 0.35 / 1.2 / 3 秒及一段连续运动；火、烟、尘保持各自速度和消散节奏，不倒放运动或突然跳变。
- 顺光、侧光、逆光下核对烟的自遮光、薄边透光和火内发光，避免实心橡胶球和纯加性白团。
- 在第一关真实残骸 10 / 28 / 70 米机位核对源头接触、近远分层、墙体遮挡和画面预算。
- 粒子模块、编辑器时间轴、固定种子及 agent 接口继续驱动生产效果；保留预通道排除和 HDR 目标 alpha。
- 报告真实 GPU 耗时、显存/传输量和采样器预算；不能仅用 draw call 数量代表性能。
- 观察截图遵循 640 像素优先、常规不超过 1280×720 的用户偏好；保留本地原始证据，素材不因观察图尺寸而降质。

## 当前进度

### 白灰烟、扬尘与黑烟边界修正（2026-10-15）

用户的三张特效编辑器截图对应 `SmokeWhite`、`SmokeDust`、`SmokeBlack`。前两种烟的原模拟在出口面仍有密度，直接取样会留下平直的上边缘；黑烟的横向范围和风向范围被压窄，编辑器又一律按 7 m 烟高取景，而该源的实际体积高约 15.6 m。

共享体积着色器现在在上部和两侧按三维涡流逐渐稀释密度，保留底部源头；相机光线与光源遮光光线都使用同一场。第二阶散射近似补充烟体内部受光。常驻源同时扩大横向卷吸空间、保留风向轴厚度并降低消光倍率，改善近景实心感；这些参数统一在 `Data_Tuning_Particles`，没有增加体积资产、实例数量或现场流体求解。

“适配镜头”从当前活动烟体的三维范围、源点、朝向和资产 anchor 计算中心与距离；首次异步载入结束后重新适配。已清空的爆炸池不参与取景。原来的高度不再把黑烟顶部裁在屏幕外。

本地高画质实拍 `tmp/EffectReview/Game02_*` 检查三种效果的正面、侧面和背面；`Game_MotionReport` 检查 0.1 / 0.35 / 1.2 / 3 / 4 / 6 / 8 s。粒子暂停时生产时钟与状态不变；完整画面中的曝光适应、TAA 和背景变化不能用来判断烟体是否仍在移动，隔离 GPU 回归另检查粒子暂停像素逐字节相同。

`ParticleVolumeBrowserTest` 新增模拟开放出口的 GPU 消光剖面：上部平滑透光区从对照的 131 行增加到 174 行，下部光学不透明度仍约 0.98。`ParticleEditorControlsTest` 另用三方向完整体积投影检查黑烟不被上下视口裁切。已有五套序列的重放、暂停、动画、深度遮挡、HDR 目标 alpha 和释放回归继续适用。

初步固定场景对照是 1280×720、高档、每种烟 15 个有效 GPU 样本，仅包括单个生产烟体及显示转换，不是整关帧率：白灰烟 / 扬尘 / 黑烟约 0.71 / 0.57 / 0.35 ms，修正后约 1.06 / 0.87 / 0.64 ms。扩大范围与细节有开销；空密度区域提前跳过细节取样后，扬尘从第一版约 2.56 ms 回落到约 0.87 ms。数据不替代下文旧版整关 10 / 28 / 70 m 剖析，也不构成全场性能提高的结论。

本轮 quick / prepush 在 `SpeakerGestureTest` 的 `FrontObservation.02: luo gestured on his previous line too` 处停止；同一 `0ff3dddd` 提交的干净主检出也复现该失败。不得将它报告为全仓全绿，特效相关检查单独记录。

最终定向通过：ParticleModulesTest、ParticleVolumeTest、ParticleVolumeBrowserTest、ParticleBrowserTest、ParticleChannelsTest、FirstLevelSmokeOriginsTest、FirstLevelDistantSmokeTest、FirstLevelDistantSmokeBrowserTest、ParticleEditorControlsTest、ParticleEditorWhiteboxTest、ParticleEditorTest、MotionVectorContractTest、BootStallTest、ModuleGraphTest、TestRunnerTest。黑烟完整范围三方向的最大纵向 NDC 为 0.821 / 0.853 / 0.821，均在视口内；首次发射前也按已启用的发射器适配，不能等粒子出生后才恢复正确距离。

BootTest 在 240 s 时限内未完成，阶段 0 还报告旧四种爆炸图集未生成实例及点光包络断言失败，因此该门没有通过。对干净主检出 `4bf1f217` 的最小 Vfx 实验先载入全部爆炸图和遮罩，再强制四种图集变体并推进五帧，四种旧图集的实例与活粒子同样均为 0；这是旧图集断言的基线证据，不能用它冒充完整七关启动验收。

已接入五套 CC0 序列：营火、工业烟流、浓烟、土尘冲击与燃油爆炸。完整来源、格式和重建命令见 [体积资产](../Volume/README.md)。它们共用原 ParticleSystem 的时钟、曲线和固定种子，通过实例立方体进行真正三维取样；没有另建预览专用效果。

63 处残骸火焰和背景烟已替换；普通场景烟、破片爆炸、燃油爆炸和航空炸弹的冷却烟体已接入。枪口瞬光、弹道、碎屑、土柱抛射与痕迹继续沿用各自的物理／玩法规则。

已通过体积格式／来源／重建哈希、GPU 可见像素、动画、重放、暂停、模块改像素、深度遮挡、HDR alpha、释放、全部真实残骸出口与四档容量测试。真实游戏高画质图片位于本地 `_shots/Particles/PhysicalCombat04`；之前的 PhysicalCombat02 暴露热爆炸数据不适合早期土尘，已换用 DustImpact。

航空炸弹额外查看了 0.35 / 1.2 / 5 / 12 秒（PhysicalBombsFinal）：删除旧的巨大球状中心烟团、底涌烟团，保留缩小的抛射头和稀薄尾迹；主体与冷却烟使用三维场。VFX 编辑器按效果扩大相机距离，避免旧 40 m 限制把镜头卡在大爆炸里；退出恢复摄影棚原限制，API 选中效果同步列表高亮。

初版固定机位渲染剖析（1280×720、高画质、51 个有效 GPU 样本的中位数）为 10 / 28 / 70 米约 12.61 / 11.40 / 10.71 ms；关闭环境粒子绘制而保留场景与灯光后约 8.92 / 8.13 / 8.88 ms。原版同口径约 8.93 / 8.49 / 9.31 ms。此数据来自 PhysicalProfile02 / PhysicalBaselineProfile，早于浓烟和土尘分型的最终调整，不能宣称为最终性能，也不能当作实时 FPS。

最终分型后的同口径剖析（PhysicalFinalProfile）约为 **11.96 / 11.70 / 13.09 ms GPU**，关闭环境粒子后为 9.46 / 7.54 / 8.88 ms；每项 51–52 个有效样本。增加的体积质量有明确成本，不能称作免费升级或用瞬时 HUD FPS 宣称性能提高。五套数据传输约 18.4 MiB，全部加载的体积纹理约 170 MiB；材质和编辑器 Fork 共用纹理，不按 63 处场景实例复制。三轴分块最大纹理边 384。

已完成真实高画质近中远视图、多角度与顺光／侧光／逆光检查；光照对照先写 HDR 靶再经 ACES 输出，避免用夹断的 LDR 白块判断体积。Shader 的前向散射方向也已按 camera→sample、sample→sun 的约定校正。固定种子、延时爆发、风漂、暂停拒收、跨寿命周期不重抽循环相位都有实际 GPU 回归。

定向检查通过：ParticleModulesTest、ParticleVolumeTest、ParticleVolumeBrowserTest、ParticleBrowserTest、ParticleChannelsTest、FirstLevelSmokeOriginsTest、FirstLevelDistantSmokeTest、FirstLevelDistantSmokeBrowserTest、FirstLevelAirRaidTest、BombBallisticsTest、ExplosionRulesTest、BloodEffectsTest、MotionVectorContractTest、ParticleEditorControlsTest、ParticleEditorWhiteboxTest、ModuleGraphTest、TestRunnerTest、BrowserBundleTest、MenuStartupTest，以及第一关 ultra + GI 的 SamplerBudgetTest。完整 prepush 仍在已有 CharacterSpeechTest 音素缺字“呃啊”处停止，不能报告全仓全绿。
