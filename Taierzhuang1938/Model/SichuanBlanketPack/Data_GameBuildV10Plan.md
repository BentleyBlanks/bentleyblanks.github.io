# Game Build From V10

当前稳定烘焙基准为 `HighV10/Scene_SichuanPackSoftWearV10.blend`，保留该源与原图。最终必须 ≤3000 三角（含所有可隐藏部件），见[需求核对](Data_RequirementsAudit.md)。当前 V6 的 9870 三角不是最终输出。

已在独立 `GameV10/Scene_SichuanPackGameV10.blend` 中从 V10 evaluated 形体取低模；不重建旧箱体、旧圆柱席卷或旧鞋。高模和棉布/草纤维材质保留。鞋沿取实际高模的 72% 位置并稍收薄，卷口保留窄缝。

2026-10-21 实测几何为 **2937 三角**：Bundle 974、Binding 620、Jacket 319、StrawMat 376、Sandals 648，全部可隐藏部件均计入。短褂仍保留完整衣身、衣角与布扣；衣身表面误差 0.90 mm，露出衣角 1.71 mm。游戏背面按真实朝向和位置投平，最大调整 2.38 mm，接触面积 0.09759 m²；高模源不改。

`Script_SichuanGameUvV10.py` 实际检查 2937 个三角：精确重叠为零、越界为零、退化为零，且各三角均含 1024 像素中心。低模首层 SurfaceUV 保留，运行时使用第二层 GameUV。

五部件真实 Base/Normal/Roughness/AO 首轮投射已执行，但 encoder 正确拒绝了主带的 1726 个内部漏烘像素，法线也发现反向投射。当前在独立临时场景中测试折层与窄带的法线/射线对应，**尚未通过游戏资产验收，也未替换旧 V6 GLB**。不能引用几何与 UV 通过证明贴图或最终视觉完成。

初始总额以 2950 留 50 余量：Bundle 1020、Binding 630、Jacket 320、StrawMat 520、Sandals 460。实际可在五者间重新分配，尤其不要因鞋边、鞋口带和悬绳而削掉双鞋结构；总额必须按导出的全部索引验证，不能只看 Blender 的一部分。

## Required construction

- 五根节点直接归属 `Pack_Root`。短褂保持完整衣片与原纽扣，可整体抽出；草席的绑带、切端和内折叶随草席隐藏。两鞋、细悬绳、两肩环和连续井字布带保留。
- 去除不可见的重叠填充面后再分配低模预算，不能把高模整套盲目按同一比例 collapse。保留当前软轮廓、主要侧折层与衣角折口；细纤维、编织和手缝线转法线/AO。
- 贴背接触叶保护为原生 Blender **Y=0**，轴心在其实际中心，米制与单位 1。只做必要数值清理，不能用旧 clamp 重新塑形。glTF 导出 `export_yup=True` 后验证 **Z=0、接触面朝 -Z**。
- 高模材质有部件坐标锚点。烘焙源复制/临时合并时保留原 UV、材质和锚点关系；不要未经补偿移动高模做 exploded bake。五部件分别隔离投射，避免席/鞋捕获其他物件的材质。
- 五部件均从 V10 真正投射 Base、Normal、Roughness、AO；只给主体投射 Normal、其他自烘是不够的。所有低模共用最终单套 1024 Base/Normal/ORM，法线缩采样后归一化，ORM 不得把 roughness 固定为 242。
- 从实际 GLB 检查三角数、GameUV、1024 图像、法线和纹理内容、轴心与平背，再以实际导出资产检查正/侧/背、隐藏席、隐藏衣服、抽出原衣服及肩带，不能沿用旧 147 项通过记录。

## Existing code boundaries

可参考 `_blender/Script_SichuanPackSurfaceBake.py` 的 GameUV、可见度分配、island packing、`BindBakedMaterial`；`_blender/Script_SichuanUvRepair.py` 的 overlap 检查；`_import/Script_SichuanPackSurfaceMaps.py` 的边界扩展、正常化与编码。需重写全部五部件高到低投射及真实 roughness 读取。

最终验证器 `_blender/Script_SichuanBlanketPackVerify.mjs` 必须以 `--max-triangles=3000` 严格运行；其旧 “user-authorized 10000” 描述与固定 roughness 断言需要按真实最终输出修正。

**禁止在 V10 上直接运行旧 `Script_SichuanBlanketPackBake.py` 或 V6 study/bake 入口。** 它会清空场景、调用旧 `SoftBundleV6`/Binding/Attachments 重建旧外形，并回写旧 10000 阈值。旧 SurfaceBake 的 `BakeSurfaces` 也不能不改即用：它仅对主体法线做高到低投射。
