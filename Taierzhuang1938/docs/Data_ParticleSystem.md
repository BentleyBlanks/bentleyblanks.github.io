# 模块化粒子系统

燃烧、常驻烟柱、土尘冲击和燃油爆炸使用 JangaFX CC0 流体序列，GPU 直接积分三维密度和燃烧场；火星、碎屑、弹道等继续走解析运动。第一关残骸保留真实燃烧出口与附近最多四盏暖色反射光。形态对标和验收见 [物理观感重做](Data_ParticlePhysicalReference.md)，来源与重建见 [体积资产](../Volume/README.md)。

设计参考 [Unity Particle System 模块](https://docs.unity3d.com/6000.0/Documentation/Manual/ParticleSystemModules.html) 与 [Simulate](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/ParticleSystem.Simulate.html)。这是适合当前 WebGL 引擎的模块化实现，不是 Unity 组件或序列化格式的完整兼容层。

## 模块与数据

| 模块 | 已实现参数 |
| --- | --- |
| Main | duration、loop、prewarm、startDelay、lifetime/speed/size/rotation、startColor、gravityModifier、maxParticles、randomSeed、simulationSpeed、world/local |
| Emission | rateOverTime 曲线、rateOverDistance、bursts（time/count/cycles/repeatInterval） |
| Shape | point、circle、cone、sphere、box、beam（窗光斜柱） |
| Velocity / Force over Lifetime | 三轴速度曲线、恒定加速度、drag |
| Color / Size / Rotation over Lifetime | RGBA 渐变、尺寸曲线、角速度曲线 |
| Noise | 随年龄变化的摆动强度、频率和滚动速度 |
| Renderer | flame/smoke/ember/mote/windowMote/volume/bakedVolume 与生产材质 profile；enabled、aspect、density、bounds、nearFade、softRange、深度遮挡与 HDR 目标 alpha 保留；体积资产、播放速度、循环、朝向、发光和热区消光 |

`Tengxian.Particles.Modules()` 返回完整默认值、能力与不支持的模块，未知字段直接报错。生产材质 profile 支持已有序列帧与碎砖、土块、木片、弹壳网格；仍不支持通用碰撞模块、拖尾、子发射器、自定义序列帧模块、任意网格资产和发射器局部旋转/缩放。现有血滴落地和碎屑弹跳保留专用逻辑；local 模式支持平移。Noise 是可复现的解析摆动，不等同 Unity 的湍流噪声实现。战场体积烟、近处烟尘、战斗粒子和菜单飘尘均由同一 ParticleSystem 管理时钟和存活记录。

长度为米、时间为秒、旋转为弧度（Shape.angle 为度），颜色为线性 HDR RGBA。曲线支持数字、`[[0,value],[1,value]]`、`{mode:"twoConstants",min,max}`、`{mode:"curve",curve,multiplier}` 和 `{mode:"twoCurves",min,max,multiplier}`。键按归一化时间严格递增。GPU 每条曲线采样 48 点；诊断样本用原始曲线求值，尖锐拐点可能存在采样误差。

`bakedVolume` 的 `bounds` 是米制范围，`main.startSize` 是该范围的倍率。`volumeSpeed` 驱动内部模拟播放，`volumeYaw` 是可实时调整的 Y 轴朝向；每个粒子仍接受 Main、速度、力、尺寸、颜色与旋转模块。`volumeLoop` 循环使用顺向重叠；单发持续源跨寿命周期不重抽动画相位。`emissionStrength` 和 `flameExtinction` 为相对辐亮度、消光调节，并非绝对热功率。

这是一套预计算流体的实时三维播放，不是现场流体求解器；风向可以旋转静态烟体，内部流场不会因风滑杆而重新求解。窄烟流和浓烟使用不同资产，土尘与燃油爆炸也分开。

## Agent 直接调用

生产页面暴露 `Tengxian.Particles`，不需要模拟点击编辑器。输入/输出均可序列化为 JSON。

```js
const fx = Tengxian.Particles;
fx.Presets(); // 燃烧、体积烟、环境飘尘与窗光飘尘
fx.Profiles(); // smoke / beam / debris / casing 等生产材质
const {id} = fx.Create({preset:"FireTongue", position:[10,1,20],
  modules:{main:{randomSeed:1938}, emission:{rateOverTime:18}}});
fx.Configure(id,{noise:{strength:[[0,.02],[1,.3]]}});
fx.Simulate(id,2,{restart:true}); // 固定种子重放到指定时间，结束时暂停
fx.GetParticles(id,{limit:8});   // 位置、尺寸、颜色与剩余寿命的诊断样本
fx.Play(id);                    // 暂停后继续；播放完的一次性效果从头开始
fx.Stop(id);                    // 停止发射，存活粒子自然消退
fx.Stop(id,{clear:true});       // 立即清空
fx.Emit(id,12);                 // 手动发射；原先停止时会继续消退
const saved = fx.Export(id);
fx.Remove(id);
const restored = fx.Import(saved); // 导入配置并播放，不是运行状态快照
```

三维体积可直接创建并等待资源就绪：

```js
const field = fx.Create({preset:"VolumeDensePlume",position:[10,0,20]});
await fx.Ready();
fx.Simulate(field.id,1.2);
fx.Configure(field.id,{renderer:{density:4,volumeYaw:0.8}});
fx.Inspect().volumes; // 实例数、活粒子数、GPU 数据量、就绪和错误
fx.VolumeBurst([15,0,20],{asset:"DustImpact",size:0.7,life:4,speed:1.7,density:9});
```

`VolumeBurst` 使用可复用的事件发射层；可设置 delay、fadeIn、velocity 和 bounds。发射层 Main 初始参数按倍率作用于后续出生记录，暂停该层后不接受新事件。资源首次加载时编辑器显示状态；离线数据或网络错误会进入 Inspect 的错误字段。

另有 `Pause`、`Clear`、`Move`、`Inspect`。`Inspect()` 返回所有系统和共享池预算/丢弃计数，`Inspect(id)` 返回单个发射器。`Configure` 的发射参数影响新粒子，生命周期曲线作用于现存粒子；更换 renderer 或 simulationSpace 会清空当前粒子。`Clear` 清空存活粒子但不重置时钟；重放使用 `Simulate(...,{restart:true})` 或 `Play(...,{restart:true})`。

`Create({profile:"smoke",...})` 使用生产材质，`Fork(id)` 克隆配置与材质绑定。profile 的 Main 初始尺寸/速度/寿命是出生参数倍率。网格和烟的专用生长、材质侵蚀、弹跳由 GPU 完成；`GetParticles` 是轨迹与模块参数诊断，不是最终着色的网格/像素快照。菜单管理器通过 `Tengxian.MenuParticles` 调用。整套编辑与预设见 [粒子编辑器](Data_ParticleEditor.md)。

需要整套烟、火、火星和灯光时，沿用场景特效的一次调用，再取得它的粒子层调参：

```js
const handle = Tengxian.vfx.SceneEffect({x:10,y:1,z:20},"BurningWreck");
const layers = Tengxian.vfx.smokeSources.get(handle).particleHandles;
Tengxian.Particles.Configure(layers[1],{noise:{strength:.3}});
// 整套移除时调用 Tengxian.vfx.RemoveSceneEffect(handle)。
```

## 命令行取证

```powershell
node Taierzhuang1938/Script_ParticleCli.mjs --source=0 --distance=10 --label=Near
node Taierzhuang1938/Script_ParticleCli.mjs --source=0 --distance=28 --label=Middle
node Taierzhuang1938/Script_ParticleCli.mjs --source=0 --distance=70 --label=Far
node Taierzhuang1938/Script_ParticleCli.mjs --source=0 --distances=10,28,70 --label=AllViews
node Taierzhuang1938/Script_ParticleCli.mjs --quality=low --editor-check --label=Editor
node Taierzhuang1938/Script_ParticleCli.mjs --actions=tmp/ParticleActions.json --label=Tuning
```

支持 `--base=http://127.0.0.1:8100` 复用本地预览。默认 high，运行实际第一关和生产渲染器，输出 `_shots/Particles/<label>/Frame.png`、`Report.json`、`Presets.json`。`--source` 是报告 sources 中的索引。截图和报告均留在已忽略目录。

动作文件示例：

```json
[
  {"method":"Create","args":[{"preset":"FireTongue","position":[106,2,-218],"play":false}],"as":"fire"},
  {"method":"Configure","args":["$fire",{"main":{"randomSeed":1938},"emission":{"rateOverTime":20}}]},
  {"method":"Simulate","args":["$fire",2,{"restart":true}]},
  {"method":"GetParticles","args":["$fire",{"limit":8}]},
  {"method":"Export","args":["$fire"]}
]
```

## 结构、预算与验证

- `Script_ParticleModules`：纯规则层、参数验证、固定 1/60 秒发射调度与种子随机数。
- `Script_ParticleRenderer`：GPU 解析运动，CPU 只写出生描述与发射器时钟，不逐帧更新粒子矩阵。每个基础模式一个实例批，火焰与火星共两次绘制，体积烟一个共享批；生产材质由 ParticleBatch 合批。透明特效不进法线深度预通道。
- `Script_ParticleEffects`：生产与 agent 共用接口。Vfx 的烟源创建、移动、移除、清场、销毁与编辑器隔离统一管理。
- `Data_Tuning_Particles`：效果参数、画质池容量和近处灯光预算的唯一数据源。池满时丢弃新粒子并记录 dropped，不抢走其他存活发射器的槽；全场背景火焰与战斗爆炸池独立。
- `ParticleModulesTest` 检查时间线与参数；`ParticleBrowserTest` / `ParticleChannelsTest` 检查 GPU 像素、动画、确定性、暂停、遮挡、alpha 与释放；`FirstLevelSmokeOriginsTest` 检查真实出口、通路、预算与生命周期。体积烟另有 `FirstLevelDistantSmokeBrowserTest`，菜单飘尘走 `CommandRoomBrowserTest`。

本轮参考为用户选择的滕县战斗概念图，源图留在本机 `C:/Users/Bentl/.codex/artifacts/TengxianBattleConcept20261009/Reference_TengxianBattle.png`，不作为游戏贴图打包。
