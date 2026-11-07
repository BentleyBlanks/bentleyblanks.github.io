# 幺娃 V6 角色接入

## 输入与重建

输入为用户下载的完整绑骨件 `角色/Tripo/04_幺娃/Yaowa_Merged_V6_Bones.glb`，SHA-256 为 `ba4ac8b1cc1ea9cc5ce0903fa197e0df605e515358095e45d937200b33a32867`。输入包含55根Mixamo骨骼、一个蒙皮网格和一个材质。

`_import/Script_BuildYaowa.mjs` 复用共用角色转换器，恢复V6的1.615米帽顶高度，统一到65根X Bot骨骼的名字、层级、顺序和初始朝向。原关节位置及身体比例保留，胯高比为0.8394。头帽权重使用共用修复逻辑。原头部、完整颈部皮肤、手指及脚踝的V6修复沿用下载件。

运行时为 `Model/Character/Model_Yaowa.glb`，5,968,980字节、26,544三角面、单网格单材质。三张4096×4096贴图按共用管线转换为WebP，法线使用更高编码品质。详细来源、哈希、权重修复和贴图记录在 `Data_Yaowa.json`。

~~~powershell
node Taierzhuang1938/_import/Script_BuildYaowa.mjs
node Taierzhuang1938/Script_TestRunner.mjs --only=XBotCharactersTest,ModelFacingTest,YaowaCharacterBrowserTest --fail-fast
~~~

重建命令的第一个参数可指定其他位置的完整绑骨GLB。原始Blender工程位于 `C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\YaowaPartsMerge_20261106\Scene_YaowaPartsMerge_V6.blend`。

## 消费入口

沿用现有罗班长、何有田、顺子与冬瓜的X Bot角色管线。`Data_XBotCharacters.mjs` 登记 `yaowa` 及同名cast映射，单位编号 `Yaowa` 也识别为幺娃。动作预览、白盒预演和正式场景试玩共用角色加载及动作转换。

动作适配通过 `ClipForCharacter` 去除Hips以外的位移轨，保持本角色的颈部、手指和脚踝骨长。Hips位移按胯高比转换。场景实例沿用原演员头高做整体等比缩放。

原共用卧姿、倒地动作在本角色上有约6.2厘米、10厘米的局部入地。`Script_BakeYaowaContacts.mjs` 按实际蒙皮表面以60Hz求解最低点，只校正这两条动作的Hips高度，保持原旋转、肢体长度和时长。校正结果登记在角色的 `clipOverrides`，动作预览与场景试玩共用。来源、模型哈希、曲线哈希和采样记录在 `Animation/Yaowa/Data_YaowaContacts.json`。主重建命令会自动重烘这两条曲线。

角色预览入口为 `Tool_MixamoAnimationPreview.html?who=yaowa`。场景入口为 `?editor=blockout&level=FirstLevel0105`，其试玩使用正式场景 `Scenes/FirstLevel/`。

## 验收口径

`XBotCharactersTest` 检查骨架、逆绑定、权重归一化、登记映射及头帽刚性。头关节使用身体比例检查，支持幺娃等较矮角色，并核对报告与真实骨架。

`ModelFacingTest` 从真实脚趾和草鞋顶点云确认源朝向+Z，由共用桥接转换到角色-Z，同时检查1.615米帽顶。

`YaowaCharacterBrowserTest` 通过真实动作预览采样12条代表动作、492帧，检查蒙皮有限值、动作范围、头帽刚性及非Hips骨长。保存颈部、手部、脚踝近景，检查既有场景幺娃实例和实际正式场景试玩入口，并检查着色程序及控制台错误。

静态测试服务器使用编辑器只读能力响应。模型、动作、场景及材质全部经真实资源加载入口。卧姿和倒地增加实际蒙皮最低点检查。

本地取证保存在忽略目录 `tmp/Yaowa/`。恢复尺度并对齐Tripo的中心偏移后，运行时绑定网格与V6静态原件的最大最近顶点距离为0.093毫米。

实测12条片段492帧通过，颈部、手指和脚踝骨长误差为0。卧姿和倒地的实际蒙皮最低点约为地面上方2毫米。03-2场景和实际开打后各有一个幺娃实例，正式场景高档197个着色程序均链接成功，GL错误、资源失败和控制台错误均为0。

运动矢量、浏览器打包、标题菜单、模块图、数据登记、资产规范、文本、史实标注、发布路径及内嵌贴图检查通过。真实幺娃模型还经隔离发布副本转换并校验，三张贴图按当前路径规则生成2048×2048 BC7，几何、骨架与材质结构一致。发布GLB经浏览器真实加载，三张贴图均以GPU压缩纹理显示，骨骼65根，GL与控制台错误为0。

广泛quick通过113项，随后在 `OpeningSetTest` 的旧路径 `Model/Model_HanYang.tzm.json` 缺失处失败。已核对该文件在本轮远端基线中也不存在，相关测试源码与远端一致。

本轮提交前的最近两次Pages部署已失败，发布包约1.7GiB，超过1GiB限制。幺娃资产的转换与验收通过，整站发布状态需以对应部署运行记录为准。

## 创作标注

幺娃的脸型、无发无须头部、软军帽、灰色旧军服、草鞋和身体比例属于本作角色外观设计。骨架、蒙皮和动作适配属于游戏表现。
