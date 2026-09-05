# 八九式中战车外观恢复

2026-09-06 用户报告加载页模型与原始下载外观不符。

## 原因

旧 ImportVehicles 把 Hull/Turret/Track/Barrel 重映射成共享 armor/track/steel，并让 TzmCore 用按面平铺 UV 覆盖原 atlas UV；源 glTF 引用的四张图未随仓库保存。导入器也没有保留 glTF 的逐角法线。加载页的三个材质只有纯色，因此铆钉、面板接缝、履带纹理都丢失，UV 接缝处的重新计算法线进一步放大硬折面。

## 恢复结果

- 正式下载来源：[Type 89 I-Go (Chi-Ro)](https://sketchfab.com/3d-models/type-89-i-go-chi-ro-fe3f1f483bc043c6a0907eee444a1e43)，snrnsrk5，CC-BY-4.0。使用已有授权凭据调用 Sketchfab v3 download 获取完整 glTF 包；不要用查看器内部图片替代下载包。
- 正式下载的 scene.bin 与仓库存量逐字节相同。三角数 4,089、四个网格块、炮塔关节、既有外廓和挂点保持不变。
- 八九式单独启用 sourceAppearance：保留原 UV 和逐角法线，所有缩放/旋转用逆转置矩阵同步法线。
- type89Armor/type89Barrel 共用原装甲 atlas；type89Track 用原履带图。原履带 U 超过 1，必须 RepeatWrapping。
- 游戏、模型验收台和开机主线程/OffscreenCanvas 使用同一套专用底色及法线。底色为 sRGB，法线为线性；原图无 ORM，用均匀干燥非金属响应，避免套用其他模型锈斑。

## 重建

本机原包保存在 OneDrive/AI/Models/Blender/Taierzhuang1938/Type89Restore/OriginalDownload，原文件保持在仓库外。贴图压制：

```powershell
python Taierzhuang1938/_import/Script_Type89TextureBake.py <OriginalDownload目录>
```

网格用现有 _blender/ImportVehicles.BuildImported("Type89Tank") 和 TzmCore.WriteTzm 导出；BuildAll 的该资产入口同样会保留原外观。更新 Model/Index.json、Data_Meshes 登记和 import map 缓存戳。

验收入口：AssetStandardsTest 逐网格比较原 glTF 与 TZM 的三角角点 UV；ModelFacingTest 检查真实炮管质心；BootPropTest 在 worker 中实际加载原贴图；Script_TzmShot.mjs --id=Type89Tank 输出三视图。截图与模型验收网页只保留本地 _shots / _check 文件。
