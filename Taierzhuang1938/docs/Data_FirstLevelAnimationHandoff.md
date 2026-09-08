# 第一关人物动画跨电脑接力点

更新：2026-09-08。此文件描述实际交付边界，不表示 48 项已经制作完成。当前用户要求：**只复用现有视频／缓存，不再生成视频；候选独立交付，不以整关回归或游戏采用为上传前提。**

## 另一台电脑可以继续

1. 拉取最新 `origin/master`，按根与项目 AGENTS 创建自己的独占 worktree。不要在共享主检出编辑，也不要复用本机其他任务的目录。
2. 同步完整私有库：本机为 `C:/Users/Bentl/OneDrive/Sync/饮河/FPS/视频转骨骼`，包含 `Video`、`Models`（尤其 `_Cache`、`RecoveryPreview`、各版本 `Pipeline`）、`Blender`、`Preview`，以及根目录说明／清单。另一台允许不同绝对路径，脚本使用 `--root` 指向它。
3. **GitHub 只有制作脚本、文档、状态及已接游戏资产。候选 GLB、原视频、缓存、Blender 工程、验收网页和截图均不在 GitHub。** 本机文件存在不证明 OneDrive 已同步到另一台；须等目标机文件实际可读，不能只看云端占位文件。
4. 先读本文件、[逐项状态](Data_FirstLevelMissionAnimationStatus.json)、[完整需求](Data_FirstLevelMissionAnimationRequirements.md)、[制作进度](Data_FirstLevelMissionAnimationProgress.md)及[视频转骨骼标准](Data_VideoToSkeletonStandard.md)。状态中的本机路径／127.0.0.1 地址须换为接手机的库路径／预览服务地址。
5. 复用原片、NPZ／PT 和已恢复 raw。已冻结批次不得覆写；新修正使用新 revision。不要再次调用首轮视频生成，也不要为了接力重新跑整关回归。

## 已有成果

| 范围 | 最新私有库目录 | 当前边界 |
| --- | --- | --- |
| 侧凳身体支撑／扶腿起身 | FirstLevelTrainSupportV2、FirstLevelTrainGameV2 | 四套原人物，32 个侧凳子集已接；不能算全部车厢生活或专用逐阶下车完成。 |
| 身体动作恢复 | FirstLevelLifePatientV1、FirstLevelRescueLocomotionV1、FirstLevelRemainingBodyV1、FirstLevelSourceLimitedV1 | 四批共 33 条新身体候选；首轮累计 43 条 raw 恢复。道具、协作、接触和演员绑定未全部完成。 |
| 数弹 | FirstLevelAmmoAuthorV3 | 四个模型与工程，袋体、五个弹药道具和点数／找弹／抬头回应；手指自然度、真实道具与事件装配待做。 |
| 侧身让路／踢包 | FirstLevelAisleAuthorV2 | 八个模型、八个工程、两个三栏入口；实景净空、背包碰撞、职责装配待做。 |
| 前后抬担架／持稳 | FirstLevelCarryV17、FirstLevelCarryHoldV2 | 原骨架成对候选；掌指、肩部、患者与转场待完成，试制尺寸未替换游戏。 |
| 四级车梯下车 | **FirstLevelStairAuthorV2** | 本轮四个 12 秒 GLB、四个可编辑工程、48 张三栏截图已生成；实际查看五张。V1 冻结工作稿保留。V2 没有运行导出密集检查或整关回归。 |

四级下车入口为 `/Preview/index.html?action=TrainStairDescentAuthored`。原片和 raw 固定在已恢复站姿 7.9666667 秒，模型独立播放后期逐级落脚；不是从两级台阶原片直接恢复出的四级动作。V2 当前落地轮廓以第 0 车地形为基准，另两车地面高度已记录但尚未制作独立适配。`Data_EditableProjects.json` 记录工程真实保存并重新打开；`Data_PreviewCaptures.json` 是出图记录，不是整关通过报告。

## 还没完成的主体工作

| 优先工作 | 需求范围 | 下一步 |
| --- | --- | --- |
| 完整车厢生活 | FL13–22 | 切食／递食／接食的单次交接和手指道具，完整数弹与背景变体，捂臂检查配对、炮击反应和让门装配；下车补上肢与重心过渡、另两车落点。 |
| 担架全套 | FL24–27、31、33、35–36、40、43 | 完整掌指与肩袖，患者／前后抬手同一刚性担架；抬起、放下、起停、转弯、坡道、门槛、装卸、失握、扑沟与补位。第一人称双手另做。 |
| 老周救护与死亡 | FL23–24、37–39、43–46 | 伤腿靠坐与起身失败、抬上／拖回、递布持续按压、渐弱到死亡保持、医生检查、幺娃起身转救；演员职责和同一患者连续性。 |
| 其他单人与协作动作 | FL01–12、28–30、32、34、41–42、47–48 | 在已有身体／战斗动作上补枪械、车辆、包裹、箱体、搀扶等接触和出入过渡。受限视频的缺失姿态由后期补做，不再补拍。 |
| 可选游戏采用 | 全部未接候选 | 按实际采用范围再做动作库导出与运行时装配。当前用户未要求必须采用，不能拿候选覆盖已确定的剧情／人数／事件。 |

**不能宣称“48 项最终动画全部完成”或“所有候选已接游戏”。** 来源覆盖 47/48 是原视频口径；FL16 已有后期作者候选。每项最终完成须覆盖该行列出的子动作和配对职责，仅有一条身体来源不足以完成整行。

## 必须保留的最新游戏契约

25 阶段；41 列车 NPC（40 新兵加罗班长，三车 8／24／8）、20 副担架、36 轻伤、14 医护、8 百姓、8 守军；老周固定为同一 `Litter11`。对白以当前 VoiceAlignment、VoiceTiming 和运行时 VoiceEvent 为准，保留整段源录音；不要按作者片段秒数触发任务事实或改库存。玩家松手扑沟仍为 2 秒、3.8 m，不能用作者根位移替换真实路径。

本机已经合入 `81dcb2624`／`77be2bd96` 渲染更新。旧 `FirstLevelTrainR13Campaign` 是此前构建完整通过的历史；新渲染 `FirstLevelTrainRenderCampaignV1` 在近战段玩家倒地失败，V2 重试按用户要求停止。`FirstLevelTrainRenderV1` 的原骨架采样器通过，**不等于当前整关通过**。继续候选制作不需要再跑这段回归。

## 本轮复现入口

后续改动使用新版本（例如 revision 3），不要覆盖 V1／V2：

```powershell
node Taierzhuang1938/_import/Script_FirstLevelStairAuthor.mjs --root <私有库> --revision 3
& <Blender路径> --background --python-exit-code 1 --python Taierzhuang1938/_import/Script_FirstLevelStairProject.py -- --root <私有库> --revision 3
python <私有库>/Preview/Script_IndexLibrary.py --root <私有库>
node Taierzhuang1938/_import/Script_FirstLevelStairPreview.mjs --root <私有库> --revision 3
```

Preview 命令当前使用本机 8136 服务；接手机按实际地址调整脚本或复用该端口。预览中的四套模型通过“效果历史”切换。同源未修改资产可以直接复用，无须为了执行以上命令再生成一遍。
