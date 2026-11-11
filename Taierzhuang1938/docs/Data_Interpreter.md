# 翻译 V6 角色接入

## 输入与转换

输入为用户下载的 `角色/Tripo/16_翻译/Model_Interpreter_Merged_V6_Bones.glb`，包含一个网格、一个材质和一套 55 骨 Mixamo 蒙皮。输入 SHA-256 为 `3e4c368dd64eef25ed3515b0a4376f222c2f44e2542672a7fc854a55ae8e7bac`。

`_import/Script_BuildInterpreter.mjs` 复用共用转换器，补齐为 65 骨 X Bot 骨架，统一骨名、层级和绑定朝向。Tripo 下载件归一到一米，转换时以单一等比缩放恢复用户采用的 V6 模型尺寸与比例。胯高比为 1.0036，动作通过共用 `ClipForCharacter` 适配。

运行模型为 `Model/Character/Model_Interpreter.glb`，36,874 三角面，约 7.18 MB。三张 4K 贴图转为内嵌 WebP。输入、输出哈希、骨架和头部权重记录在 `Model/Character/Data_Interpreter.json`。

## 角色配置

`Data_XBotCharacters.mjs` 登记 `interpreter`，`XBOT_CAST_CHARACTERS.interpreter` 指向这套模型。场景现有的 `castId: "interpreter"` 和单位编号 `Interpreter` 使用该外观。源模型继续保留剃净头部；运行时另挂 `Groom_Game_Interpreter.bin`，按本人三视图显示黑色凌乱短发和额前碎发，脸部保持净面。参考图与生成记录在角色 OneDrive 目录 `HairReference_20261112/`，配方和头部校准见[头发系统](Data_HairSystem.md)。

动作预览入口为 `Tool_MixamoAnimationPreview.html?who=interpreter`。第一关场景摆放、预演和试玩共用该模型与动画适配。

## 重建与验收

~~~powershell
node Taierzhuang1938/_import/Script_BuildInterpreter.mjs
node Taierzhuang1938/Script_TestRunner.mjs --only=XBotCharactersTest,InterpreterCharacterBrowserTest,ModelFacingTest --fail-fast
~~~

重建命令的第一个参数可指定同一绑骨源文件的其他本地路径。

静态检查核对共用骨架、绑定姿势、权重、头部刚性和胯高比。朝向检查用鞋子顶点云相对踝骨的伸出量确认源 +Z，并核对角色 -Z 桥接。

浏览器验收覆盖空手站立、说话、指向、张望、走、跑，以及翻译的蹲问、抓领、逃跑和中弹动作。逐帧检查蒙皮有限值、头部刚性与肢体骨长，检查左右手腕近景，并验证第一关 01–07 中的翻译单位和场景试玩。截图及数值报告保存于本地忽略目录 `tmp/Interpreter/`。

`Script_BakeInterpreterContacts.mjs` 为逃跑和中弹片段烘焙角色专用的骨盆高度曲线，按实际蒙皮鞋底修正穿地帧。动作预览与场景播放器通过 `clipOverrides` 使用这两条派生件，逐帧重采样保持肢体骨长。来源与输出哈希及贴地测量记录在 `Animation/Interpreter/Data_InterpreterContacts.json`，重建角色时一并生成。

## 创作来源

翻译的脸型、短发、灰黑便服、白色翻袖、裤腿和鞋子按用户采用的角色模型与参考图设计，属于本作创作外观。源模型的剃净头供头发构建使用；手腕轮廓、袖内衔接、骨架、蒙皮和动作适配属于游戏表现。
