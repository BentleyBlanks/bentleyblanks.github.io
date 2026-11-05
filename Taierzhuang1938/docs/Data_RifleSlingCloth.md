# 尼龙枪带与贴身模拟

2026-11-05 用户指定扁平枪带采用尼龙织物质感，并修复贴身时持续的细小抖动。

## 当前资产

`Model/RifleSlingV3/Model_RifleSlingFlatV3.glb` 当前版本 `20261105NylonV4`。卡其橄榄色尼龙扁带，宽 25 mm、厚 2 mm，两端收至 16 mm，源长 1.6 m。主带 3,084 三角，折返环、14 mm 短收口、实际缝线与两款束带合计 6,584 三角。

内置 imagegen 生成细密尼龙织纹，仓库 Blender 管理入口重建并烘焙细法线。1024px Base / OpenGL Normal 以 WebP 内嵌，非金属、粗糙度 0.84，纹理以 16 mm 正方形周期重复，凹凸高度尺度 25 μm。纹理来源与完整提示词在 `_import/Reference/FlatRifleSlingV3/`。织纹、配色、收口及缝线按本作美术设计，Notion 与资料馆同轮同步。

源工程在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NylonRifleSlingV4_20261105/Model_NylonRifleSlingV4.blend`。重建脚本 `_blender/Script_FlatRifleSlingBakeV3.py` 从仓库读取尼龙源贴图。通过 `Script_BlenderMcp start` 运行，任务名 `NylonRifleSlingV4`，也支持该入口的 `--batch` 模式。使用 runpy 时由脚本路径推导仓库根，也可传 `REPO_ROOT`。源工程与完整生成 PNG 留在 OneDrive，验收图留在本地忽略目录。

## 物理与渲染

`Data_Tuning_RifleSlingCloth` 使用 32 个物理点，固定 1/90 s 子步，18 轮约束，空气阻尼 14、惯性系数 0.15、惯性输入上限 3 mm。帧时间余量累计至下次物理步，避免渲染帧率改变 Verlet 历史和接触平衡。身体接触消除法向回弹，并施加摩擦。

身体、挂点、重力与惯性输入持续静止 0.35 s 后，保持最后一次完成碰撞解算的贴合状态，消除长度、弯曲与碰撞约束反复交换修正造成的自抖。身体姿态、挂点、重力或惯性变化立即唤醒。身体采样的姿态版本单独跟踪，候选缓存刷新继续使用同一姿态版本。

装上时按当前可见身体收紧、定长、留 2% 余量并垂稳；胸前引导及均匀采样按当前身材更新。旧 BackRifleRun 带子只提供过肩绕腋路径与显隐。暂停、瞬移、换身体、远距重返、长期隐藏后重现与释放规则保留。

渲染使用 63 根蒙皮骨：32 根对应物理点，31 根补中间的空间曲线，偏离原线段中点最多 2 mm；物理点与两端位置不变，不加入时间回弹。宽度沿身体表面，端头宽度沿金属环横杆，避免扁带侧立穿环。接通生产 PBR、运动矢量和 PC 路径自动发布。

## 挂点与碰撞

`Data_RifleSlingMounts` 以实际枪模米制坐标记环孔，经当前背枪 matrixWorld 转换，包含演员缩放、背架旋转和白盒推枪。汉阳造用原 GLB 的 RearBand_ExternalAttachmentLoop、RearStock_ExternalAttachmentLoop；三八式用原 TZM 的两个 U 环；中正式源模型缺环，采用前护箍和枪托束带。

折返环接在原金属环上，主带接孔下方 7 mm 的折返收口。汉阳造两端环孔仍按真实原件独立核验。原枪几何不改。`Script_RifleSlingGunContacts` 缓存实际背枪截面，令末端带段沿枪身外侧绕行，避免从木托另一侧穿过去才到环上；另以原木托的 52,096 个三角面独立检查中线零穿越。

原接线 `Script_RelaxedGait` 与 `Script_FirstLevelP012BackRifle` 保留，帧末 `StepRifleSlings` 在场景矩阵更新后、渲染前写骨矩阵。新带与附件在场景根，避开角色换皮和伤口扫描；原带 layers 关闭。

## 验证

- 本轮 Node 专项 65/65、浏览器专项 35/35。七名角色的固定姿态自抖为数值误差级，连续行走时每根中位数约 0.656 ms，原有 0.8 ms 预算通过。共用 MotionVector 的 49 个 GPU 场景通过。
- Node 专项包含真实 GLB 的尼龙材质、16 mm 纹理密度、25×2 mm 轮廓、63 蒙皮骨、固定点、空间平滑、身体和木托穿越、三枪挂点、暂停与释放。
- 新增 60 fps、144 fps 与波动帧率的静止回归，检查固定物理步长、末 1 s 自抖低于 0.1 mm，以及身体恢复动作、挂点移动和重力变化时唤醒。
- 浏览器专项沿用真实新 GLB 的 RT1、人物近景接触、前后挂点、连续走动、长度与 0.8 ms 中位数门禁。验收图存本地 `_shots/RifleSlingCloth/`，供模型观察时缩至长边 640px。
- 本轮重建使用仓库管理的 Blender 无界面模式，源工程已保存。收尾运行 `Script_BlenderMcp status --scan` 核对实例状态。
