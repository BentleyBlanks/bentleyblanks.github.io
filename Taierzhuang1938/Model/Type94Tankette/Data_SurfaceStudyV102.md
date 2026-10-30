# Type94 作者切线与严格重导 V102

V101 的十二张图、完整形态、UV 与机构保持不变。将其实际运行时的 Mikk 切线逐三角角点保存进 Blender 的 `Data_Type94AuthoredTangentFramesV102` 文本块，重导前核对材质及所有有向 POSITION／NORMAL／TEXCOORD_0 三角面，精确匹配后恢复作者基底。该基底就是现有 Normal 图对应的真实导出基底，不是新估算的替代法线。

不能用近邻或误差阈值匹配修改后的表面。几何、法线、UV 任一变化均拒绝旧切线，须重新建立作者基底和相应烘焙。源中仍保留可编辑多边形及全部 packed 图像；临时导出不覆盖作者网格。只在确有角点切线缝冲突时拆分运行时顶点，不改变任何有向三角面。

初次只固定三角面顺序仍有末位差异，已作为失败候选保留于外置 `Versions/RejectedFaceSort`。最终方法的源重开、另一输出目录独立重建，以及与 V101 真实参考比较，均通过严格逐角点属性／十二图／材质绑定／机构节点检查，没有调宽原检查。作者数据分短行打包，避免 Blender 巨型单行文本写入的耗时。

保存源另验 packed 图像、实际 GLB 导入，以及故意改变位置、法线和 UV 后是否拒绝旧作者切线。身份与完整结果见 [Data_SurfaceStudyV102.json](Data_SurfaceStudyV102.json)。完整源与图像仍位于外置 `Type94Tankette/SurfaceV102`。

```powershell
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_Type94StableHighV102.py --json
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_VerifyType94StableV102.py --json
node scripts/Script_BlenderMcp.mjs stop --json
```

`TYPE94_STABLE_ROOT` 指定新外置输出目录。独立重建以 V101 生产输入初始化作者数据，完成源自身包含全部切线数据和贴图，源重开不需要读取 V101 GLB。外置 `SurfaceV102/Rebuild` 保留脚本与依赖快照。此步骤只解决材质源的重导稳定性，未接受整车照片形态。
