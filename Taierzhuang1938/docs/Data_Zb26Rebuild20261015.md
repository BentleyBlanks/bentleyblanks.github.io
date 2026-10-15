# ZB-26 历史参考与 C 旧化重建（2026-10-15）

用户要求先检索历史照片，用内置 imagegen 制作样式参考并确认，再通过 BlenderMCP 重建、替换当前模型；用户选定 C（较重旧化）。本次只替换 ZB-26。

## 参考与样式

- [布里斯托大学中国历史影像：1937 年 7 月卢沟桥，ML04-d008](https://www.hpcbristol.sjtu.edu.cn/visual/ML04-d008)，James D. White 摄影，核对中国部队战时使用的外形。
- [斯洛伐克军事历史研究所：Spoľahlivý guľomet z Brna](https://www.vhu.sk/spolahlivy-gulomet-z-brna/)，馆藏两侧照片 `/data/images/13622.jpg`、`13621.jpg`，核对直弹匣、散热环、导气管、木托、握把、提把与脚架。该资料记载全长 1,165 mm。
- 内置 imagegen 用上述实拍制作 A / B / C 对照板；用户选择 C。原图、完整提示词、来源记录保存在 Blender 工程目录的 `References/`，只作本地参考，不随站点发布。

材质为 Blender 作者材质烘焙：发蓝钢磨损、细划痕、积尘与木纹、木托凹痕。Base 用 emission 烘焙，不混入灯光；切线法线、逐位置粗糙度及金属度分别烘焙。没有把历史照片直接贴到枪上。

## 资产与接口

- 游戏资产：[Model_Zb26.tzm.json](../Model/Model_Zb26.tzm.json)，沿用本项目 TZM 管线，世界角色与第一人称共用。
- 重建入口：[_blender/Script_Zb26Rebuild.py](../_blender/Script_Zb26Rebuild.py)；`BuildAll.py --only Zb26` 同样选取该构建器，不再选旧 Sketchfab 导入器。
- 编码与审计：[_import/Script_Zb26TextureBake.py](../_import/Script_Zb26TextureBake.py)，保留 Blender 烘的原 UV 法线和空间 ORM，再用 `Script_BakePbrTexture.py --audit` 记录实际产物。
- 可编辑工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Zb26/Scene_Zb26Veteran20261015.blend`。全分辨率源图在相邻 `SourceMaps/`，贴图已打包进 blend；参考与验收图片留在相邻目录。

原始几何 25,663 三角；TZM 编译剔除 37 个不可见微小三角，交付 25,626 三角，未做减面，仍在 30,000 红线内。11 节点、6 网格块、零关节；世界实例按两种材质合为 2 次绘制。弹匣、拉机柄和前后瞄具保留独立节点，第一人称换弹不再靠空间切割这些作者零件。

全长 1.165 m，Y 向上、枪口沿 -Z；原有 muzzle / gripR / gripL / sight / magazine 插槽保留。瞄准线保持 x=-0.0234 m、y=0.095 m；前准星按馆藏轮廓移到 z=-0.836 m。携行模型折叠脚架，左手接触按实际导气管表面重新适配，不能用放宽接触门槛代替。

钢件 Base 为 2K，Normal / Orm 及整套木材图集为 1K，在 `Data_Meshes.pbrSets` 登记，随模型预载，用于游戏和编辑器，未加入菜单或 boot PBR_SETS。钢件单独为机匣预留 UV 面积，避免散热环占满图集；2K 理由在贴图清单登记。沿用初次交付给 lazy 与全目录增加的 512 KiB 配额及原有余量；单张、单套、开机、场景和枪械面数红线保留。贴图均有缓存戳、清单及 SHA-256 烘焙记录。

## 实感优化迭代

最新可编辑工程另存于 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Zb26/Iterations/Realism20261015/Scene_Zb26Veteran20261015.blend`，避免覆盖初次交付源工程。重建时设置 `ZB26_SOURCE_DIR` 为该迭代目录。

馆藏两侧照片用于修正机匣顶盖、侧板凹槽、右侧外观窗口、左侧调节轮、双加强筋弹匣及圆弧扳机护圈；仅制作外部游戏道具。钢件螺钉有实体槽，机匣为圆角放样，冷却环环向分段重新分配为 20 段，保留原始拓扑预算。TZM 保留 Blender 作者逐角法线。

钢材旧化改为面域属性 `Zb26EdgeWear`：实际倒角与环缘接受磨损，平面不再被曲率误判而整面花斑。定点短划伤与稀疏纵向擦痕独立于微米级表面法线，缝隙积尘与 ORM 使用实际 AO。木材以内置 imagegen 生成的无光照胡桃木素材作为基色，分部件局部坐标保持顺纹，微孔和 ORM 另行烘焙。重建输入为 `_import/Source/Zb26/Texture_WalnutAuthor.webp`，完整提示词在 `_import/Prompts/Texture_Zb26WalnutAuthor.txt`；原始生成图保存在工程的 `References/Texture_WalnutAuthorOriginal.png`。来源图不作为运行时贴图单独加载。

`Data_Tuning_Materials` 为两套作者图集明确设置 `detailWeight: 0`，避免再叠一层通用颗粒法线。对照使用同机位、同光照的 1280×720 中性工作室图，以及实际 high 画质腰射和开镜；这些检查证明本次具体改进，不等于宣称整个游戏或该资产已达到 3A 制作质量。

第一人称探针光照下原始钢材反射偏暗，沿用 `VIEWMODEL_FIREARM_SURFACES` 的 0.65 金属度标量，单独为 ZB-26 登记 2 倍线性反射校准及 1.45 环境强度；不更改其他枪材质。腰射和开镜各绘制 32 帧后取图，避免仅两帧的时域噪点影响判断。该预览的运行时回读确认 `color=[2,2,2]`、`metalness=0.65` 与新版贴图 URL。

本轮通过模型管线、4,100 项贴图规范、面数预算、模块图、3 姿态手部接触（初测 181 帧；合并主线加速换弹与扫描手后 160 帧）、626 项骨骼双臂、准心校准、49 个 GPU 运动向量场景、材质升级、采样器预算、ADS 瞄具和枪械动作检查。GPU 发布资产在完整 staging 构建、校验、合包，浏览器核对压缩格式、回退与实际像素。全仓 quick 为 100 过、3 失败，失败仍为此前的 SpeakerGestureTest / IjaAlertGaitTest / MissionOrchestrationFilterTest；没有宣称完整 prepush 的 204 项全部执行或全仓全绿。

## 复现与验收

在任务独占 worktree 起 BlenderMCP，任务名使用 `Zb26Veteran20261015`，打开上述独立工程。通过 `runpy.run_path(<本 worktree 内 Script_Zb26Rebuild.py 的绝对路径>, run_name='__main__')` 执行源脚本；它重建、烘图、保存工程、写 TZM，并仅更新 Zb26 的模型索引条目。然后执行：

```powershell
python Taierzhuang1938/_import/Script_Zb26TextureBake.py
node Taierzhuang1938/Script_TextureStandardsTest.mjs
node Taierzhuang1938/Script_AssetStandardsTest.mjs
node Taierzhuang1938/_blender/Verify.mjs
node Taierzhuang1938/Script_FpsHandContactTest.mjs --only=Zb26
node Taierzhuang1938/Script_TzmShot.mjs --id=Zb26
node scripts/Script_BlenderMcp.mjs stop --save
node scripts/Script_BlenderMcp.mjs status --scan
```

贴图脚本需 numpy / Pillow；Blender 自带 numpy。本机可使用 Codex workspace dependencies 的 Python。进程清理只操作当前 worktree 记录的 Blender 实例。

验收使用真实材质、实体前后瞄具、真实指腹与扳机/弹匣几何；截图包括侧面、斜视、腰射、开镜和换弹。模型编译期零悬空、零共面；自动验收包含贴图/面数规范、模型管线、手部接触、准心校准、枪械交互、角色姿势、运动向量、菜单启动和 GPU 发布加载器。全仓快检的既有剧本/手势等失败单独记录，不能称为全绿。
