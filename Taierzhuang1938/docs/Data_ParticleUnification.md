# 全粒子统一与视觉重做

本轮把原有分散的粒子时钟、存活记录与 GPU 提交统一到模块化 ParticleSystem，直接用生产效果完成编辑器和逐类审阅。美术目标是滕县概念图中的近处燃烧残骸、远处烟柱和战斗扬尘。

## 覆盖清单

| 范围 | 入口 | 本轮实现与验证 |
| --- | --- | --- |
| 火根、火舌、火星 | Vfx.SmokeSource → Burning | 遮罩扰动、透明火尖、短寿命火舌；加性发光保留目标 alpha；高画质近中远取证 |
| 烟尘、持续烟、爆炸烟、炸弹土柱 | smoke/sourceSmoke/bombSmoke | 3D 密度、光路吸收与自遮光；公共时钟与存活记录 |
| 爆炸亮核与序列帧 | Explosion/BombBlast | 破片爆炸缩短热相和火球，燃油爆炸保留较长燃烧；序列帧插值及边缘渐隐 |
| 枪口焰、曳光、火星、尘环、水花 | MuzzleFlash/Tracer/TracerBeam/Impact | 公共 profile、生命周期与软深度；枪口与光束像素回归 |
| 血雾、血滴、持续出血 | BloodEffects | 同一粒子时钟、Kill 释放；保留落地碰撞和表面血迹，生产链测试通过 |
| 弹孔与预警标记 | decal/marker | 统一控制与生命周期；保留表面定位、玩法提示 |
| 碎砖、弹壳、土块、木片 | debris/casing/clod/splinter | 同一力、曲线与时钟；不规则碎块、真实口径圆柱弹壳和金属反光 |
| 远景与路边体积烟 | BattleSmoke / SootRoot | 移除独立循环 shader；模块连续发射和预热；六种烟场、静默间隔、遮挡与四档预算通过 |
| 环境飘尘 | Motes / DustMote | 世界坐标循环采样；暂停、相机视差与释放通过 |
| 指挥部窗光飘尘 | CommandRoomAtmosphere / WindowDust | beam 形状与公共 renderer；像素运动、相机深度/窗框遮挡、暂停和性能通过 |

后处理体积雾、天空云层、相机震动、地形坑、持久表面血迹属于其他系统；保留它们及粒子触发的碰撞、痕迹和照明契约。

## 结构与调用

- `Script_ParticleModules` 管理配置、固定步长时钟、存活记录、显式出生参数与释放。
- `Script_ParticleRenderer` 管理公共 LUT、发射器状态纹理与实例批。`Script_ParticleBatch` 只持有材质/几何缓冲，没有另一套模拟时钟。
- `Script_ParticleChannel` 把游戏出生参数交给 ParticleSystem；19 个贴片通道和 4 个网格通道可统一检查、暂停、调参。
- `Script_ParticleGpuModules` 提供公共生命周期曲线；`Script_ParticleShaders` 保留各材质形态；`Script_ParticleDensity` 共用近远烟 3D 密度纹理。
- `Profiles()` 列出生产材质，`Create({profile:"smoke",modules:{...}})` 创建独立发射器。现有通道不能超出创建时分配的容量；更大容量需新建发射器。
- 模块曲线、时间轴、整套预设及 agent 接口见 [编辑器](Data_ParticleEditor.md)。能力与 Unity 对标边界见 [粒子系统](Data_ParticleSystem.md)。

## 验收与取证

定向通过：ParticleModulesTest、ParticleBrowserTest、ParticleChannelsTest、ParticleEditorTest、ParticleEditorControlsTest、BloodEffectsTest、MuzzleFlashTest、VehicleTracerTest、ExplosionRulesTest、FirstLevelSmokeOriginsTest、FirstLevelDistantSmokeTest、FirstLevelDistantSmokeBrowserTest、CommandRoomBrowserTest、ModuleGraphTest、TestRunnerTest，以及第一关 ultra + GI 的 SamplerBudgetTest。

预通道与真实担架资产的 MotionVectorContractTest、CarriagePropVelocityTest 亦通过。

发布版 BrowserBundleTest 通过；合入新的独立菜单入口后，重新通过 ParticleEditorControlsTest、MenuStartupTest（源码和发布包均验证 MenuParticles 接口）、CommandRoomBrowserTest，以及模块图和构建。

通道测试检查所有生产通道 GPU 像素、播放控制、重放、模块改像素、目标 alpha、删除后安全调用、容量降低与释放。编辑器测试使用真实按钮、曲线拖动、时间轴、JSON 与本机保存，验证预览灯光暂停和退出恢复正片状态。

完整 `--changed=origin/master --profile=prepush --fail-fast` 通过前五项后，在已有 CharacterSpeechTest 音素缺字“呃啊”处停止，不能声称全仓全绿。该失败也已在未改动主检出复现。

高画质证据留在忽略目录 `_shots/Particles/` 下的 UnifiedBefore、UnifiedIteration01、UnifiedPortfolio、UnifiedDetails、UnifiedBattle03。组合截图检查各类效果；第一关真实残骸包含 10 / 28 / 70 米机位。UnifiedPortfolio 最初的 SmokeDust 是无效 ID 空白帧，已补预设并在 UnifiedDetails 重拍，CLI 现会拒绝未知 ID。短促效果按 17 / 100 / 350 / 1200 / 3000 ms 检查，寿命结束的空白帧不算生成失败。

```powershell
node Taierzhuang1938/Script_ParticleCli.mjs --effects=FireMedium,SmokeBlack,ExplosionMortar,ImpactBrick,MuzzleRifle,Blood,TracerBeam --times=0.016667,0.1,0.35,1.2,3 --quality=high --label=Review
node Taierzhuang1938/Script_ParticleCli.mjs --source=0 --distances=10,28,70 --quality=high --label=BattleReview
```

`--baseline=<git-ref>` 读取指定修订的改动文件作对照，不重置共享工作区。本轮比较基线为 `5c00c55e`。截图、浏览器报告和构建产物仅留本地。
