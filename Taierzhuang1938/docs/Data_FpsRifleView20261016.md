# 三支栓动步枪的第一人称构图（本地审阅版）

本轮按用户提供的 COD14《二战》三八式画面调整三八式、中正式和汉阳造，完成后留在本地，未经用户试玩确认不推送。
参考为 Hectorlo 的全武器展示，Type 38 从 01:07:07 开始，主要构图标尺为用户的 01:07:54 帧：
<https://mag.moe/306872/>。

## 实现与范围

- `Data_FpsRifleView.mjs` 单独记录这三把枪的视图 FOV 与腰射目标姿态。世界米制模型仍分别为 1.276 / 1.110 / 1.250 m。
- `Script_Viewmodel` 的 `RifleViewFraming` 层位于 FOV 层之下、枪和完整双臂动作层之上。目标姿态乘以原持枪姿态的逆得到一个刚体变换，保留实际握点、扫描皮肤、逐指姿势和原 Blender Idle／装填片段。
- 腰射突出右下方机匣，枪口保留在接近画面中央的位置；抬枪和冲刺按既有状态弹簧连续退出构图偏移。其他装备及空手不采用该偏移。
- 换弹和拉栓沿原动作时钟平滑收枪，给装填口与操作手留出画面空间；动作末尾回到贴近镜头的腰射。检查真实装填口的逐帧投影和连续性，不能只验静态握姿。
- 三枪使用正确的 `zScale = tan(viewFov/2) / tan(worldFov/2)`，世界视野改变时腰射枪体投影保持稳定。其他装备保留其已有投影调校。
- 枪焰、握点、抛壳和弹道挂点继续经过同一层级。等比深度预算不会作为放大画面的手段。

## 验收

`Script_FpsRifleViewTest` 在正式 Viewmodel 上检查三枪的枪口／后机匣画面位置、40/55/75/90° 世界 FOV 的一致性、ADS／冲刺退出，以及换到捷克式后的隔离。

其他定向入口为 `FpsArmTest --only=ZhongZheng,HanYang,Type38`、`AdsSightTest --range --only=ZhongZheng,HanYang,Type38`、`FpsHandContactTest --only=ZhongZheng,HanYang,Type38`、`FpsReloadMechanicsTest`、`FpsAnimationTest` 和 `MotionVectorContractTest`。
数值检查之外，用 `Script_WeaponShot --fp --only=ZhongZheng,HanYang,Type38` 与 `--reload` 查看实际画面。
图片和本地审阅入口保留在忽略目录，不作为站点发布资源。

试玩可用 `?weapons=1` 的正式枪械测试场；只检查姿势和动作可用 `?weapons=1&editor=firstPerson&fpWeapon=Type38`，检查器中可切换三把枪。

## 汉阳造与三八式同向托枪

上一版包托掌框被用户否决，当前直接采用三八式的 YXZ 掌框 `[0.087127039,3.116151099,-2.174507012]`，不继续保留侧向包托候选。左肩和肘平面恢复为三八式相同的原步枪挂点。托点为枪局部约 `[-0.01475,0.00250,-0.40058]` m，只针对汉阳造前木托微调位置和手指闭合；汉阳造右手、其他武器、骨长及 65° 腕角限值保持。

三八式旧指姿不能原样视为解剖验收结果：将汉阳造 PIP/DIP 的反向屈曲与侧拧限制到现有铰链门禁内，再拟合实际掌侧远节皮肤。完整 15,152 片左手皮肤对木托、钢件和枪机的有限交叉均为 0，闭壳深度为 0；五指掌侧间隙约 3.72/3.79/0.37/1.63/0.36 mm，沿用原 4 mm 门禁。完整非邻面自交仍有 146 对，集中在混合掌褶和同指折叠；跨指交叉为 0。此计数少于直接复用三八式指姿时的 353 对，仍不构成整手无自交或自然度全面通过。记录位于本地 `tmp/CodType38Support/Data_RelaxedAudit.json`。

完整整臂检查还必须包含 Hand/Forearm 混合权重的 Wrist：较早同向候选虽然纯掌指面没有枪体交叉，腕部仍有有限木面交叉，不能采用其“左手零交叉”结论。托点最终向外移动 4.25 mm、无名指 PIP 再放松 6°；掌框、肩位和肘平面不变。只读生产蒙皮探针已复核腰射、瞄准、冲刺的完整左臂及衣袖，三者有限交叉和闭壳深度均为 0。

持枪呼吸通过原 `_blender/Script_FpsIdleLeftSupportBake.py` 同步 19 条左骨轨及 `handLeft` / `contactLeft` 两条控制，保留其他骨轨、状态、时序与 4 秒循环。肩位修正相对上一版实际烘焙肩位计算，避免累积偏移。可编辑 Action 与输入、基准及烘焙报告位于 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/FpsCodType38HanYangSupportRefined_20261016/`。扫描网格及其源工程未改动。

`Script_FpsWeaponGripExport --palm-candidates=<JSON> --only=HanYang` 可只读预览候选掌框与各状态的腕角；JSON 项为 `name`、`weapon`、`contact`，可附 `bodyByState` 的左肩／肘平面。这条诊断不会写回源姿势或资产。最终姿势仍需按正式代码及烘焙循环复测，不能以候选预览替代。

本轮最终持枪捕获覆盖 241 帧、19 条左骨轨，最大腕角 55.16°，选中链循环差与受保护骨轨变化均为 0。动画 SHA-256 为 `27a87f2ae18f0bb79b43f3e7b5d0d453854d97e5a0df1fbc7dfc7e1877a5f8b6`。正式回归以本轮新动画的测试记录为准，不沿用被否决候选的通过记录。仍只留在本地待试玩。

最终动画下重跑双臂 138 项、618 动作帧手部接触、瞄准、骨轨循环及实机持枪／换弹出图，均通过。四案完整双臂与衣袖共 674 个采样帧，左侧闭壳深度与有限表面交叉全程为 0。右侧既有开放表面交叉保留，最大闭壳深度约 1.901 mm，通过原显式 2 mm 门禁；不据此声明右手或整场完全无穿插。最终记录位于 `tmp/CodType38Support/`，自有 Blender 实例已退出，工作树保留用于本地试玩。
