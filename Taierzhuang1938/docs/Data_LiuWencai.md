# 刘文财 Dirty V1 角色接入

## 输入与转换

输入为用户下载的 `角色/Tripo/06_刘文财/Dirty/Model_LiuWencaiDirty_Merged_V1_Bones.glb`，包含一套 55 骨 Mixamo 蒙皮、一个网格和一个材质。输入 SHA-256 为 `8de49c79ae1115a1a934509ca95f7d8d8b7102a319dede04370dc8ec115bfe15`。

`_import/Script_BuildLiuWencai.mjs` 复用共用转换器，恢复合并模型约 1.830 米帽顶，统一骨名、层级、节点顺序和绑定朝向，并补齐为 65 骨 X Bot 骨架。胯高比例为 0.9495，动作通过共用 `ClipForCharacter` 适配。

运行模型为 `Model/Character/Model_LiuWencai.glb`，约 10.60 MB、52,863 三角面和 45,692 顶点。三张 4K 贴图转为内嵌 WebP。来源、尺寸、权重调整和输出哈希记录在 `Model/Character/Data_LiuWencai.json`。

帽沿最低处约为1.714米，转换时把颈骨渐变上限设为Head关节上方7.5厘米，约1.694米。帽子和贴合处头皮完整归Head，转头时沿同一骨骼运动。

面部修复复用妮儿转换器的连通曲面识别方法，在独立头颈曲面内，从1.53米到1.585米平滑转移至Head。1.585米以上的下颌和脸部完整随Head运动。实际权重与逐帧刚性由静态和浏览器检查验证。

游戏短发由 `Game_LiuWencai` 按新模型重烘。造型表显式设置 `beard: null`，采用新参考的净面外观。重建命令会依次完成骨架转换、面部权重、五条接触曲线和短发贴合。

## 角色配置

`Data_XBotCharacters.mjs` 登记 `liuWencai`，命名角色映射为 `XBOT_CAST_CHARACTERS.liuwencai`。场景已有刘文财单位通过 `castId: "liuwencai"` 使用该模型，单位编号 `LiuWencai` 也可识别。

本地动作预览入口为 `AdvancedTools/Tool_MixamoAnimationPreview.html?who=liuWencai`。场景摆放、预演、试玩和当前独立遭遇Play使用共用外观与动作适配。

## 重建与验收

~~~powershell
node Taierzhuang1938/_import/Script_BuildLiuWencai.mjs
node Taierzhuang1938/Script_TestRunner.mjs --only=XBotCharactersTest,HairGroomTest,LiuWencaiCharacterBrowserTest,LiuWencaiEncounterBrowserTest --fail-fast
node Taierzhuang1938/Script_ModelFacingTest.mjs
~~~

重建命令可用第一个参数指定其他位置的同一绑骨源文件。

静态检查核对共用骨架、绑定姿势、归一化权重、胯高比例和上半头部权重。朝向检查通过草鞋顶点云相对踝骨的伸出量，确认源 +Z，再由共用桥接适配角色 -Z。

浏览器验收覆盖 13 条代表动作、533 个采样帧，检查头帽刚性、蒙皮有限值、动作范围、实际场景角色和试玩加载。正常遭遇入口另行验证 `liu` 单位的角色映射、实际65骨网格、顶点和面数、高画质渲染。截图与数值报告保存在本地忽略目录 `tmp/LiuWencai/` 与 `tmp/LiuWencaiDirtyEncounter/`。

爬行、卧姿射击、坐地、倒地和蹲姿瞄准通过角色专用接触曲线适配。`Script_BakeLiuWencaiContacts.mjs` 按实际蒙皮表面调整骨盆高度，以双骨链IK保持手脚支撑，骨骼本地位置及肢体长度参与逐帧校验。共用动作通过 `clipOverrides` 选择这些派生件，输入和输出哈希记录于 `Animation/LiuWencai/Data_LiuWencaiContacts.json`。重建角色会一并重建这五条派生曲线。

## 创作来源

脸型、灰色旧军服、软军帽、绑腿与草鞋按角色参考图设计，属于本作创作外观。净面、烟灰、干泥和布料破损按本次参考图创作。身体比例、帽沿贴合、骨架、蒙皮和动作适配属于游戏表现。此标注同步至史实与创作对照表、上级说明页和游戏资料馆。
