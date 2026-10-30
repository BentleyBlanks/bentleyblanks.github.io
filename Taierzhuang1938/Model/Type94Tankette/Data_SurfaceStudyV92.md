# Type94 V92 金属磨损

用户要求金属磨损继续优化。本版以 [V91 当前结构 PBR](Data_SurfaceStudyV91.md) 为基准，保持 238 网格、293 节点、622112 三角、UV、几何法线和运动控制，完善掉漆区域的材质分层。

漆面擦亮、暗色氧化底层和新鲜裸钢分别控制 Base、Roughness 与 Metallic。裸钢压平原有漆层颗粒，粗糙度范围 0.16–0.29，完全露钢处 Metallic 0.99；旧磨损以暗底为主，局部接触才露出反光钢面。新增舱盖与侧罩划痕、断续凸棱缺口按实际米制面与 UV 裁切；没有整圈描白、三角网格描线或顶点位移。薄漆层高度参数为 20 微米。

首遍接触磨损太轻，保存在外置 `Versions/InitialSubtle`；第二遍突破斑块在中性光下偏白，保存在 `Versions/PaleBreakthrough`。保留版把氧化底层与小片擦亮钢面分开。损伤程度及分布为创作复原，不是博物馆实物损伤的测量结论。

实际保存源重开、GLB 导入、导出位置／法线／UV／节点和十二张 PBR 贴图验证保留。Paint 的 AO 全图不变，其他三类材质全图不变；未触及纹素精确保留。切线按本机导出器精度核对并保留方向符号，不把容器哈希差异隐藏成完全一致。验证数量、身份及外置路径以 [Data_SurfaceStudyV92.json](Data_SurfaceStudyV92.json) 为准。

本地对照页可在相同机位、灯光下切换 V91／V92，移动灯位查看实际表面反光；实测两侧反向履带、炮塔、机枪俯仰和小幅横摆。磨损预览通过不代表整车参考或最终游戏派生版完成。canonical 游戏模型与线上版本保留。

重建：`node Taierzhuang1938/_blender/Script_BuildType94WearFinishV92.mjs`；阶段为 Prepare → Raster → Apply → Verify。`TYPE94_FINISH_ROOT` 指定独立外置目录。需要保留已记录的 V91 源工程与 V77 原始磨损遮罩／密度；实际运行输入路径与哈希保存在 Acceptance 中。独立验证：`python Taierzhuang1938/_import/Script_VerifyType94WearFinishV92.py`。重建脚本、依赖哈希和本地验收页脚本快照在外置 `SurfaceV92/Rebuild`。
