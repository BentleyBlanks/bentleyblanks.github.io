# 国军眼睛与肩线修复（2026-09-06）

当前游戏角色是 `Model/Character/Model_LugouNra01–05.glb`，不是旧 `Model_NraSoldier.glb`。

- Nra04 眼球的 `Material #57` 只有纯灰色，Nra02 的眼球槽只有纯黑色。两者改用 Nra01 已有的 VITOH 眼球图块，UV 对齐瞳孔；不生成新贴图，不改脸型和皮肤贴图。
- 五款军装的肩顶作平滑下移，空手参考姿态最大 4 cm。位移先通过真实蒙皮矩阵求逆再写回绑定网格，避免直接沿绑定姿态的竖轴移动把放下来的袖子推向外侧。法线与切线同步变换。
- 保留 GLB 原始节点、皮肤权重、逆绑定矩阵、索引、挂点、全部 19 条动画及所有采样字节。Nra03 单独挂在头部的帽子不参与身体修改。

独立工程由 BlenderMCP 启动隔离 Blender 构建，保存于：
`C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\NraEyesShoulders_20260906\Scene_NraEyesShoulders.blend`。
内含五个角色场景；同目录 `Source` 保全修复前 GLB，工程与备份均不入仓库。

重建入口 [Script_RepairNraEyesShoulders.py](../_blender/Script_RepairNraEyesShoulders.py)：

```powershell
blender --background --factory-startup --python Taierzhuang1938/_blender/Script_RepairNraEyesShoulders.py -- --source-dir <OriginalGlbDirectory> --output-dir Taierzhuang1938/Model/Character --blend-file <OneDriveBlenderDirectory>/Scene_NraEyesShoulders.blend
```

[肩部参考](../_blender/Data_NraRelaxedShoulderReference.json) 来自实际 `InstallP012ActorMotion` 的空手站姿（AttackCommand 四分之一帧段），记录按骨骼顺序的线性蒙皮矩阵、源 SHA-256 和双肩测量点。源模型或姿态契约改变时应重新测量，不能绕过源哈希检查。

导出器同步更新 manifest 的文件大小与修复记录。改资产后更新 `Script_CharacterModel.mjs` 的 `ASSET_VERSION` 和 index.html 对应 import-map 版本。

验收：`Script_CharacterModelTest.mjs` 直接读取 GLB，检查眼球正面 UV 指向瞳孔、贴图确实内嵌、双肩下降且无侧向鼓包，并继续运行原来的动画、骨盆高度、朝向、命中体与挂点契约。实际空手、持枪姿态和兵站近景截图只保留本地。
