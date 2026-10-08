# 模块化粒子系统

燃烧效果使用贴着残骸的火根、受浮力上升的火舌和少量火星；原有体积烟柱仍接在真实燃烧出口。火焰复用已入库的火焰遮罩，着色器连续扭曲、侵蚀火尖。第一关残骸只启用视点附近最多四盏暖色反射光，远处保留自发光火焰与体积烟。

设计参考 [Unity Particle System 模块](https://docs.unity3d.com/6000.0/Documentation/Manual/ParticleSystemModules.html) 与 [Simulate](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/ParticleSystem.Simulate.html)。这是适合当前 WebGL 引擎的模块化实现，不是 Unity 组件或序列化格式的完整兼容层。

## 模块与数据

| 模块 | 已实现参数 |
| --- | --- |
| Main | duration、loop、prewarm、startDelay、lifetime/speed/size/rotation、startColor、gravityModifier、maxParticles、randomSeed、simulationSpeed、world/local |
| Emission | rateOverTime 曲线、rateOverDistance、bursts（time/count/cycles/repeatInterval） |
| Shape | point、circle、cone、sphere、box |
| Velocity / Force over Lifetime | 三轴速度曲线、恒定加速度、drag |
| Color / Size / Rotation over Lifetime | RGBA 渐变、尺寸曲线、角速度曲线 |
| Noise | 随年龄变化的摆动强度、频率和滚动速度 |
| Renderer | flame/smoke/ember 广告牌、aspect、softRange、深度遮挡与 HDR 目标 alpha 保留 |

`Tengxian.Particles.Modules()` 返回完整默认值、能力与不支持的模块，未知字段直接报错。当前不支持碰撞、拖尾、子发射器、序列帧、网格渲染和发射器局部旋转/缩放；local 模式支持平移。Noise 是可复现的解析摆动，不等同 Unity 的湍流噪声实现。大型战场烟柱继续使用原有的体积烟 renderer；`FireSmoke` 用于小型粒子烟。

长度为米、时间为秒、旋转为弧度（Shape.angle 为度），颜色为线性 HDR RGBA。曲线支持数字、`[[0,value],[1,value]]`、`{mode:"twoConstants",min,max}`、`{mode:"curve",curve,multiplier}` 和 `{mode:"twoCurves",min,max,multiplier}`。键按归一化时间严格递增。GPU 每条曲线采样 48 点；诊断样本用原始曲线求值，尖锐拐点可能存在采样误差。

## Agent 直接调用

生产页面暴露 `Tengxian.Particles`，不需要模拟点击编辑器。输入/输出均可序列化为 JSON。

```js
const fx = Tengxian.Particles;
fx.Presets(); // FireRoot / FireTongue / FireEmber / FireSmoke
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

另有 `Pause`、`Clear`、`Move`、`Inspect`。`Inspect()` 返回所有系统和共享池预算/丢弃计数，`Inspect(id)` 返回单个发射器。`Configure` 的发射参数影响新粒子，生命周期曲线作用于现存粒子；更换 renderer 或 simulationSpace 会清空当前粒子。`Clear` 清空存活粒子但不重置时钟；重放使用 `Simulate(...,{restart:true})` 或 `Play(...,{restart:true})`。

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
- `Script_ParticleRenderer`：GPU 解析运动，CPU 只写出生描述与发射器时钟，不逐帧更新粒子矩阵。flame/smoke/ember 各一个实例批，正常燃烧使用两次绘制；透明特效不进法线深度预通道。
- `Script_ParticleEffects`：生产与 agent 共用接口。Vfx 的烟源创建、移动、移除、清场、销毁与编辑器隔离统一管理。
- `Data_Tuning_Particles`：效果参数、画质池容量和近处灯光预算的唯一数据源。池满时丢弃新粒子并记录 dropped，不抢走其他存活发射器的槽；全场背景火焰与战斗爆炸池独立。
- `ParticleModulesTest` 检查时间线与参数；`ParticleBrowserTest` 检查真正 GPU 像素、动画、确定性、暂停、遮挡、alpha 与释放；`FirstLevelSmokeOriginsTest` 检查真实出口、通路、预算与生命周期。原体积烟另有 `FirstLevelDistantSmokeBrowserTest`。

本轮参考为用户选择的滕县战斗概念图，源图留在本机 `C:/Users/Bentl/.codex/artifacts/TengxianBattleConcept20261009/Reference_TengxianBattle.png`，不作为游戏贴图打包。
