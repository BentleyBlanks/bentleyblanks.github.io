# 罗班长参考图模型

2026-09-29，按用户提供的罗茂才正面、左侧、背面三视图制作的独立角色资产。2026-09-30 第二版重做军服和装具，修复第一版领口、口袋、帽形及肩臂结构问题。
文件为 `Model/Character/Model_TengxianLuoReference.glb`，可编辑工程保存在
`C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\LuoReference_20260929\`。
本次交付模型文件；游戏选角表仍按现有角色清单工作。

## 内容与骨架

- 灰蓝软帽、帽徽、旧布军服、胸袋与下摆口袋、肘部及膝部补丁和缝线、布绑腿、黑布鞋。
- 前胸两只布弹袋及背带，后背小行囊、薄毯卷及绳结，网绳水壶，斜背大刀鞘、缠柄、护手和环首。
- 身体直接继承 `Model_TengxianNra05Facial.glb` 的 53 根 `TengxianHumanoidV1` 骨骼。
  身体绑定位置、父子关系和朝向保持一致；制作时在自然垂臂姿势中定位衣服，再以逆蒙皮变换返回共同 T 绑定。
- 13 根 `Face_*` 骨骼：下颌、上下唇、左右嘴角、左右眉、上下眼睑及左右眼球。口腔、牙齿和舌头继承已有面部工程。
  新脸部轮廓及贴图使用参考图重新校准，保留口型拓扑与蒙皮。
- 米制，glTF Y 向上、人物正面 +Z；Blender Z 向上、人物正面 -Y。沿用项目 Actor 桥接层的朝向约定。
- 没有 morph target。GLB 限制为每顶点最多 4 根骨骼并重新归一化；源工程保留可编辑权重。

## 工程与材质

- `Model_LuoReference.blend`：逐件可编辑模型、面部参考投影与独立布料材质；骨骼分为 `Body53` / `Face13`。
- `Model_LuoReferenceBaked.blend`：合并后的三组蒙皮网格与三套材质，供导出复核。
- `Animation_LuoFacialReview`：一条面部验收动作，时间轴标记包含 Rest、Open、Wide、Round、Blink、Close、BrowUp、Snarl、DeadSlack、Shock、Pain、Shout、Grit。
  标记帧见本地 `Data_LuoBindingAudit.json`。游戏既有国军动作通过相同的骨骼名复用，GLB 仅内嵌这一条面部验收动作。
- 模型有三套内嵌 PBR 图集，每套 Base / Normal / Roughness；源烘焙图为皮肤 2048×2048，军服和装具 4096×4096。
  GLB 保留 4K 军服/装具底色，用标准 JPEG 品质 95 编码；法线下采样为 2K PNG，皮肤底色和其余通道仍为无损 PNG。原始无损烘焙图保存在本地工程目录。
  最终 GLB 为 3 个蒙皮网格、3 套材质；当前三角面数、文件大小和哈希以 `Data_LuoReference.json` 为准。未制作低模 LOD。
  原始三视图不进入仓库，仅头部使用参考图投影。服装与装具全部使用独立的棉布、帆布、毛毯、皮革/金属材质，不采样穿戴装具的人物照片，防止把弹袋、背带和配件重复印在衣服上。
  底色采用 emission 烘焙，避免源手部、眼球材质的金属/反射参数把 diffuse 底色烘黑。
  导出先在验收姿势冻结完整修改器结果并烘焙，再按最终四骨权重逆蒙皮返回共同 T 绑定，顶点和表面法线一起转换；避免在 T 绑定中应用/移除平滑修改器，或重算绑定法线造成腋下折痕和黑斑。逐顶点回算误差写入本地导出报告。
  共用骨架的颈部轮廓与照片存在差异，颈后遮挡区使用连续皮肤材质；头顶用短发蒙版去除原图帽子残影。
- `Script_LuoTailoring.py` 是服装和装具的构建实现，由主构建脚本加载。肩部与袖身在自然垂臂姿势中焊接，腋下保留真实间隙；袖口不能受到骨盆或脊柱权重影响。
  衣领、四只衣袋、袋盖、补丁、缝线、弹袋、毯卷、行囊、水壶绳网及刀鞘均为几何；帽顶缝线按整针投射，保留线的厚度。
- 本轮使用内置 Imagegen 生成素衣三视图、独立装具视图和四类纺织材料图集，位于本地 `References/`。
  前两张仅辅助形体核对；材料图集参与布料材质。完整提示词与实际供应商记录为 `References/Data_ImagegenPrompts.json`，源图哈希登记在模型清单。
- `Textures/`、`Review/` 和两份 `.blend` 均只保存在上述本地源工程目录。
  原始参考位于用户的 `OneDrive/Sync/饮河/FPS/角色/罗班长`，保留原样。

## 重建

在独占 worktree 中，从空白 BlenderMCP 场景执行。参考目录可通过 `LUO_CONFIG.references` 指定，输出目录通过 `LUO_CONFIG.output` 指定。复现本版材质须保留本地 `References/Texture_LuoTextileAtlas.png`；该图未进入公开仓库。
导出最后调用普通 Python/Pillow 的 `Script_PackLuoTextures.py`，只压缩内嵌纹理，不改变网格、骨架与动画；可用 `LUO_CONFIG.python` 指定该 Python 可执行文件。

```powershell
node scripts/Script_BlenderMcp.mjs start --task LuoReferenceModel
$luoRepo = (Get-Location).Path.Replace('\', '/')
foreach ($luoStep in 'Build', 'Validate', 'Export') {
    $luoScript = "$luoRepo/Taierzhuang1938/_blender/Script_${luoStep}LuoReference.py"
    node scripts/Script_BlenderMcp.mjs exec --code "p=r'$luoScript'; exec(compile(open(p,encoding='utf8').read(),p,'exec'),{'__file__':p})"
}
python Taierzhuang1938/_blender/Script_AuditLuoReference.py
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

每条 MCP 命令必须完成后才发下一条。构建脚本拒绝清理其他任务路径下的已打开工程。
模型、原骨架和参考图哈希，以及最终导出统计，见 `Model/Character/Data_LuoReference.json`。

## 验收

- `Script_ValidateLuoReference.py` 检查所有顶点归一化权重、13 根面骨的有效影响，以及各口型的真实顶点变形；另断言服装未引用穿戴照片、下段袖身没有躯干权重。可保存近景实渲染。
- `Script_AuditLuoReference.py` 独立读取导出的 GLB，与原国军模型比较 53 根身体骨骼的父子关系和绑定 TRS，检查 66 根骨骼、蒙皮权重、内嵌贴图、三套材质及无 morph。
- 本地 Three.js 验收页实际重新加载 GLB，检查正面、侧面、背面、面部、领口衣袋、帽子侧面和背包装具；隐藏装具检查素衣，并检查张嘴、眨眼、喊话及源国军跑步动作。
  验收页、截图、逐顶点检查报告均在本地，不作为 Pages 页面发布。
- 本资产尚未进入游戏选模和关卡，因此这里的实测是独立模型及动作兼容性检查，不等同于整关性能或剧情接触验收。
