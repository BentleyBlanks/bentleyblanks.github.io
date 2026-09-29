# 罗班长参考图模型

2026-09-29，按用户提供的罗茂才正面、左侧、背面三视图制作的独立角色资产。
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

- `Model_LuoReference.blend`：逐件可编辑模型、参考图投影与程序布料材质；骨骼分为 `Body53` / `Face13`。
- `Model_LuoReferenceBaked.blend`：合并后的三组蒙皮网格与三套材质，供导出复核。
- `Animation_LuoFacialReview`：一条面部验收动作，时间轴标记包含 Rest、Open、Wide、Round、Blink、Close、BrowUp、Snarl、DeadSlack、Shock、Pain、Shout、Grit。
  标记帧见本地 `Data_LuoBindingAudit.json`。游戏既有国军动作通过相同的骨骼名复用，GLB 仅内嵌这一条面部验收动作。
- 模型有三套内嵌 2048×2048 PBR 图集（皮肤、军服、装具），每套 Base / Normal / Roughness。
  最终 GLB 为 144,235 个三角面、3 个蒙皮网格、3 套材质，约 20.2 MB；未制作低模 LOD。
  原始三视图不进入仓库，外露部位按参考图投影，遮挡区和掠视角用连续布料材质补足。
  底色采用 emission 烘焙，避免源手部、眼球材质的金属/反射参数把 diffuse 底色烘黑。
  共用骨架的颈部轮廓与照片存在差异，颈后遮挡区使用连续皮肤材质，避免投影出衣领和背景白边。
- `Textures/`、`Review/` 和两份 `.blend` 均只保存在上述本地源工程目录。
  原始参考位于用户的 `OneDrive/Sync/饮河/FPS/角色/罗班长`，保留原样。

## 重建

在独占 worktree 中，从空白 BlenderMCP 场景执行。参考目录可通过 `LUO_CONFIG.references` 指定，输出目录通过 `LUO_CONFIG.output` 指定。

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

- `Script_ValidateLuoReference.py` 检查所有顶点归一化权重、13 根面骨的有效影响，以及各口型的真实顶点变形；保存近景实渲染。
- `Script_AuditLuoReference.py` 独立读取导出的 GLB，与原国军模型比较 53 根身体骨骼的父子关系和绑定 TRS，检查 66 根骨骼、蒙皮权重、内嵌贴图、三套材质及无 morph。
- 本地 Three.js 验收页实际重新加载 GLB，检查正面、侧面、背面、面部、张嘴、眨眼、喊话，以及源国军跑步动作。
  验收页、截图、逐顶点检查报告均在本地，不作为 Pages 页面发布。
- 本资产尚未进入游戏选模和关卡，因此这里的实测是独立模型及动作兼容性检查，不等同于整关性能或剧情接触验收。
