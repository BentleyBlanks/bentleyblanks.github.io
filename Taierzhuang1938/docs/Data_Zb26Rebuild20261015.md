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

原始几何 26,065 三角；TZM 编译剔除 37 个不可见微小三角，交付 26,028 三角，未做减面，仍在 30,000 红线内。11 节点、6 网格块、零关节；世界实例按两种材质合为 2 次绘制。弹匣、拉机柄和前后瞄具保留独立节点，第一人称换弹不再靠空间切割这些作者零件。

全长 1.165 m，Y 向上、枪口沿 -Z；原有 muzzle / gripR / gripL / sight / magazine 插槽保留。瞄准线保持 x=-0.0234 m、y=0.095 m；前准星按馆藏轮廓移到 z=-0.836 m。携行模型折叠脚架，左手接触按实际导气管表面重新适配，不能用放宽接触门槛代替。

两套专属 1K Base / Normal / Orm 在 `Data_Meshes.pbrSets` 登记，随模型预载，用于游戏和编辑器，未加入菜单或 boot PBR_SETS。新增约 0.47 MiB，给 lazy 与全目录明确增加 512 KiB 配额；单张、单套、开机、场景和枪械面数红线保留。新增贴图均有缓存戳、清单及 SHA-256 烘焙记录。

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
