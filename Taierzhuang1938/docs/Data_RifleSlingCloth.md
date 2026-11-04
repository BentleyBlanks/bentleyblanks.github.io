# 枪带低回弹模拟与扁平外形

2026-11-05 用户澄清：“像麻绳”指低回弹的物理手感，外观仍是扁平枪带。圆麻绳 V2 是误解，已撤出运行时，源工程保留在 OneDrive 作为被否决的历史。

## 当前资产

`Model/RifleSlingV3/Model_RifleSlingFlatV3.glb`：棕色扁带，宽 25 mm、厚 2 mm，两端收至 16 mm；源长 1.6 m。主带 3,084 三角，折返环、14 mm 短收口、实际缝线与两款束带合计 6,584 三角。

内置 imagegen **一级**生成细皮纹，BlenderMCP 建模并烘焙细法线；1024px Base / OpenGL Normal 以 WebP 内嵌，非金属、粗糙度 0.86。纹理来源与提示词在 `_import/Reference/FlatRifleSlingV3/`。皮面、收口及缝线属美术复原，Notion 与资料馆同轮改正，不保留“用户要求麻绳外观”的错误说明。

源工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/FlatRifleSlingV3_20261105/Model_FlatRifleSlingV3.blend`。重建脚本 `_blender/Script_FlatRifleSlingBakeV3.py`，通过仓库 BlenderMCP 入口运行；任务名 FlatRifleSlingV3。用 runpy 执行脚本时由脚本路径推导仓库根，也可传 REPO_ROOT。源工程、截图与验收网页不提交。

## 物理与渲染

`Data_Tuning_RifleSlingCloth` 保留低回弹参数：32 个物理点，1/90 s 子步，20 轮约束，空气阻尼 14、惯性系数 0.15、惯性输入上限 3 mm。身体接触消除法向回弹、保留摩擦；接触半径只是中线求解器的余量，不定义带子外形。

装上时按当前可见身体收紧、定长、留 2% 余量并垂稳；胸前引导及均匀采样按当前身材更新。旧 BackRifleRun 带子只提供过肩绕腋路径与显隐。暂停、瞬移、换身体、远距重返、长期隐藏后重现与释放规则保留。

渲染使用 63 根蒙皮骨：32 根对应物理点，31 根补中间的空间曲线，偏离原线段中点最多 2 mm；物理点与两端位置不变，不加入时间回弹。宽度沿身体表面，端头宽度沿金属环横杆，避免扁带侧立穿环。接通生产 PBR、运动矢量和 PC 路径自动发布。

## 挂点与碰撞

`Data_RifleSlingMounts` 以实际枪模米制坐标记环孔，经当前背枪 matrixWorld 转换，包含演员缩放、背架旋转和白盒推枪。汉阳造用原 GLB 的 RearBand_ExternalAttachmentLoop、RearStock_ExternalAttachmentLoop；三八式用原 TZM 的两个 U 环；中正式源模型缺环，采用前护箍和枪托束带。

折返环接在原金属环上，主带接孔下方 7 mm 的折返收口。汉阳造两端环孔仍按真实原件独立核验。原枪几何不改。`Script_RifleSlingGunContacts` 缓存实际背枪截面，令末端带段沿枪身外侧绕行，避免从木托另一侧穿过去才到环上；另以原木托的 52,096 个三角面独立检查中线零穿越。

原接线 `Script_RelaxedGait` 与 `Script_FirstLevelP012BackRifle` 保留，帧末 `StepRifleSlings` 在场景矩阵更新后、渲染前写骨矩阵。新带与附件在场景根，避开角色换皮和伤口扫描；原带 layers 关闭。

## 验证

- 最新扁带 Node 专项 57 项通过：25×2 mm 轮廓、63 蒙皮骨、固定点、空间平滑上限、截面宽度不塌陷、身体和木托穿越、三枪挂点、暂停与释放；低回弹参数未改。停步末 0.25 s 残余运动约 0.98 mm，总长变化约 0.03%。
- 最新扁带浏览器专项 33/33：真实新 GLB 的 RT1、七人近景接触、前后挂点、连续走动、长度与 0.8 ms 中位数门禁通过；截图 1280×720。圆绳版的旧结果不能代替本版。
- 共用 MotionVector、CarriagePropVelocity、BackRifleRun 与 P012 接入此前已通过；本轮按新增渲染骨及扁带 GLB 重新执行相应门禁。
- 全库 prepush 既有 OpeningSetTest 引用已退役 Model_HanYang.tzm.json，仍单列基线，不称全仓全绿。模块图、资产、数据、字体与史实账本随最终提交核对。
- 两轮 BlenderMCP 实例均已保存并停止；status --scan 无本任务实例。
