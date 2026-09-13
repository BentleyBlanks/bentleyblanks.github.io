# 通用血液特效

## 实现与选型

2026-09-11 将枪击、断肢持续血源、普通死亡与第一关预布遗体接到同一条链。
旧实现的红色烟团、会弹跳的血块、复用弹孔的地渍和遗体脚下实心多边形已移除。

采用实例化 Planar／Volume 投影贴花：从本帧深度／法线预通道还原实际表面世界位置，变换到
贴花局部空间并裁切投影盒与法线夹角。地形起伏、墙边和消失的承载面由当前深度决定，
无需复制地面高度公式或抬起面片防闪烁。一个贴花层一次绘制，每实例 12 三角。
新增贴花按世界坐标登记，父节点仅管理可见性与生命周期。

2026-09-12 血迹默认改为 `planar`：以命中点及法线定义切平面，在薄层内接收表面，
深度边界平滑淡出。除预通道法线外，还用重建世界位置的屏幕导数检查几何斜率，
避免人物／台阶的平滑法线让陡边接收纹理并沿 Y 方向拉伸。该模式适用于任意法线，
墙面和斜面沿各自命中切平面投射，不是固定世界 XZ 贴片。

`SurfaceDecalLayer.Add(position, normal, radius, options)` 支持逐实例配置：

- `projection: "planar"`（默认）或 `"volume"`（保留较厚的体积接收方案）。
- `depth`：沿投影法线的接收半厚度，单位米；默认值见 `BLOOD_SURFACE`。
- `normalReject` / `normalFade`：法线点积从拒绝到全显的余弦区间，满足 `0 ≤ reject < fade ≤ 1`。

例如 `layer.Add(hit, normal, .4, {pool:true, projection:"planar", depth:.025})`。
两种模式在同一实例层混用，仍为一次绘制；不新增贴图采样器或帧图通道。
合并血池时同时核对模式、深度、法线阈值及平面距离，避免将相邻上下表面的血迹吞并。
Planar 会主动裁去离开切平面的起伏，弯曲表面需要更深接收时由调用方选择 Volume 或调整参数。

调查参考：[Unity URP 投影贴花](https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@17.0/manual/renderer-feature-decal.html)
说明投影、受光、网格表面贴合、透明表面限制与实例化合批。
本实现沿用这些成熟做法，在当前 Three 前向管线的主颜色阶段绘制，不新增 DBuffer 或全屏 pass。
使用 GGX 液膜高光、可变粗糙度及现有 CSM 阴影；湿血逐渐变暗、变粗糙。
这属于针对当前引擎的实时实现，不代表已实现完整 3A 流体模拟或通过跨 GPU 性能认证。

## 模块与接口

- `Data_Tuning_Blood`：画质容量、液滴解析弹道、颜色、干涸与寿命参数，纯 Node。
- `Script_BloodEffects`：有上限的血雾／液滴实例池、跟骨骼的血源、液滴碰撞与贴花登记。
- `Script_SurfaceDecals`：可复用的 `SurfaceDecalLayer`，静态遗体与动态碰撞使用同一着色器。
- `Script_Vfx` 保留 `Blood`、`BloodBurst`、`BloodSpurt`、`RemoveBloodSpurt` 调用兼容性。
  新增 `CorpseBlood(actor)`、`CreateBloodDecalLayer(parent,capacity)`、`SetBloodSurface(raycast)`。
- `Script_Main` 注入实时 `battlefield.Raycast(...,{terrain:true})`，查询默认静态世界碰撞组。
  屋顶、台面、墙体与解析／形变地表都参与；人物胶囊不参与液滴接收。
- `Soldier.Kill` 创建有限时长的普通尸体渗血源，优先使用实际人物骨架胸骨；保留死亡和伤害规则。
- `MissionAftermath` 在躯干侧方登记已干涸的血迹；血迹与尸体绘制不再各自使用不同材质。

血雾使用侵蚀噪声、不规则轮廓、柔性交界和受光；液滴沿受阻力／重力的轨迹拉伸。
CPU 只追踪有上限的可碰撞液滴，GPU 与 CPU 使用相同的解析解。接触前不生成地渍，
接触后立刻回收对应液滴，禁止假弹跳。持续血源的压力与发射量随时间衰减。

断口用动脉源（`BloodSpurt(node, offset, axis, {arterial:true, seconds, rate, speed, decals})`，
参数表 `Data_Tuning_Blood.BLOOD_ARTERIAL`，2026-09-13）：按心跳分收缩期与舒张期，收缩期射出一股
加宽、按速度拉长的亮红液滴，舒张期低速淌下、在断口下合并成池。压力指数衰减、心率变慢，
所以血柱越射越短。出口速度只在一拍的两头略降，同一帧多滴按帧内时间错开出生——速度若随整条
脉冲曲线走，后出的快滴会追上先出的慢滴，一拍缩成一团；同一帧的液滴同时出生则叠在出口。
轴向加一截向上偏置，倒地尸体朝地的残端仍能射出看得见的弧线。距离放宽液滴，远处保持约两像素。
液滴容量随之翻倍（high 96→192），一个残端空中约 15–25 滴。
近处多次渗血在同一贴花内累积面积；位置分开时自然留下滴落轨迹。

动态血迹拥有独立环形预算，不会淘汰弹孔；静态遗体拥有独立持久层。
`ClearParticles` 清掉动态血滴、血源和动态贴花，保留静态布景。
关卡拆除释放持久层与阴影 uniform 注册，纹理异步到达已销毁对象时立即释放。

## 资产与边界

仅下载一张实际使用的免费纹理，没有批量生成图片或动画。
[Blood Splatter，ExileGL](https://opengameart.org/content/blood-splatter)，页面声明 CC0。
原始 PNG 1600×1200 原样进入 `Texture/Texture_BloodSplatterCc0.png`，详见来源登记。
纹理控制飞溅细节，池边与扩散由着色器控制；下载失败仍有程序化轮廓兜底。

投影依赖实际不透明表面的深度；透明玻璃／水面不支持。薄投影体积内、法线方向合格的
不透明表面均可接收，没有新增人物材质 ID 缓冲。贴花保留原表面微观几何与法线，
当前没有单独写回 GBuffer 的法线、SSR 粗糙度或局部灯光簇，也不模拟黏性液体沿墙连续流动。
透明混合保留 HDR 目标 alpha，贴花和粒子均退出深度预通道，避免污染 AO／软粒子深度。

## 验收

`node Taierzhuang1938/Script_BloodEffectsTest.mjs` 使用真实 GPU 与项目后处理验证：
血雾／飞溅出画、实际碰撞后沉积、台面接住液滴、水平源零 Y 分量不变、独立容量、
源节点移除与清理、静态层保留、整层一次绘制、采样器上限和过载容量。台面用例使用
低速水平滴漏并断言落点精确等于台面高度；高速侧喷允许飞出台面，不能假定全被接住。
截图和结果落 `_shots/BloodEffects`；本地台架 HTML 被忽略。
同一 GPU 门禁另覆盖 Planar 的平地、墙面、斜坡、上下相邻面排除、平滑法线陡面排除、
深度边界淡出、背面排除、Volume 兼容性及混合模式不跨平面合并。

实际枪击、爆炸、大刀与断肢生命周期由 `Script_GoreRangeTest` 覆盖；第一关预布遗体
由 `Script_FirstLevelMissionAftermathTest` 检查真实模型、接地、距离层与重建，并保存实际游戏截图。
这些定向测试与项目发布前回归分别记账，不能用台架通过替代正式关卡视觉检查。
