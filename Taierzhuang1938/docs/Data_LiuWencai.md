# 刘文财 V9 角色接入

## 输入与转换

输入为用户下载的 `角色/Tripo/06_刘文财/LiuWencai_Merged_V9_Bones.glb`，包含一套 54 骨 Mixamo 蒙皮、一个网格和一个材质。输入 SHA-256 为 `86f476ef313014dc10d6f0375c3ec40103a5b931aec7909a3d4a99d5bceae2cf`。

`_import/Script_BuildLiuWencai.mjs` 复用共用转换器，恢复合并模型约 1.830 米帽顶，统一骨名、层级、节点顺序和绑定朝向，并补齐为 65 骨 X Bot 骨架。胯高比例为 0.9153，动作通过共用 `ClipForCharacter` 适配。

运行模型为 `Model/Character/Model_LiuWencai.glb`，约 8.99 MB、47,400 三角面。三张 4K 贴图转为内嵌 WebP。来源、尺寸、权重调整和输出哈希记录在 `Model/Character/Data_LiuWencai.json`。

帽沿最低处约为1.692米，转换时把颈骨渐变上限设为Head关节上方7.5厘米，约1.682米。帽子和贴合处头皮完整归Head，转头时沿同一骨骼运动。

## 角色配置

`Data_XBotCharacters.mjs` 登记 `liuWencai`，命名角色映射为 `XBOT_CAST_CHARACTERS.liuwencai`。场景已有刘文财单位通过 `castId: "liuwencai"` 使用该模型，单位编号 `LiuWencai` 也可识别。

动作预览入口为 `Tool_MixamoAnimationPreview.html?who=liuWencai`。场景摆放、预演和试玩使用共用外观与动作适配。

## 重建与验收

~~~powershell
node Taierzhuang1938/_import/Script_BuildLiuWencai.mjs
node Taierzhuang1938/Script_TestRunner.mjs --only=XBotCharactersTest,LiuWencaiCharacterBrowserTest --fail-fast
node Taierzhuang1938/Script_ModelFacingTest.mjs
~~~

重建命令可用第一个参数指定其他位置的同一绑骨源文件。

静态检查核对共用骨架、绑定姿势、归一化权重、胯高比例和上半头部权重。朝向检查通过草鞋顶点云相对踝骨的伸出量，确认源 +Z，再由共用桥接适配角色 -Z。

浏览器验收覆盖 13 条代表动作、533 个采样帧，检查头帽刚性、蒙皮有限值、动作范围、实际场景角色和试玩加载。截图与数值报告保存在本地忽略目录 `tmp/LiuWencai/`。

爬行、卧姿射击、坐地、倒地和蹲姿瞄准通过角色专用接触曲线适配。`Script_BakeLiuWencaiContacts.mjs` 按实际蒙皮表面调整骨盆高度，以双骨链IK保持手脚支撑，骨骼本地位置及肢体长度参与逐帧校验。共用动作通过 `clipOverrides` 选择这些派生件，输入和输出哈希记录于 `Animation/LiuWencai/Data_LiuWencaiContacts.json`。重建角色会一并重建这五条派生曲线。

## 创作来源

脸型、灰色旧军服、软军帽、绑腿与草鞋按角色参考图设计，属于本作创作外观。身体比例、帽沿贴合、骨架、蒙皮和动作适配属于游戏表现。此标注同步至史实与创作对照表、上级说明页和游戏资料馆。
