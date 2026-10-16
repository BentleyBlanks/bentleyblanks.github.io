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
