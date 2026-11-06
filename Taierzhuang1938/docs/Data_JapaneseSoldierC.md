# 日军士兵C V4 游戏接入

## 输入与绑定

输入为用户角色目录12_日军士兵C中的 JapaneseSoldierC_Merged_V4_Bones.glb。实测为静态网格，skins为0，包含位置、法线和UV。输入SHA-256为 b94d27968061058bd9abb5aec72f1dda28a4293ab31f88969aa07c8bfc4fd6d9。

Script_BindJapaneseSoldierC.py沿用项目日兵乙的本地绑定方法，以已验证日兵甲骨架和表面权重为参照，按C的肩、腕、胯、膝、踝及手指拟合65根骨骼。每点最多4项归一化权重，未绑定顶点为0。

输入文件被整体归一化到1米并转了90度。导入器恢复1.836773米帽顶和原朝向，与V4原始装配部件的最大对齐误差约0.088毫米。头部和军帽单独赋权，领口、手腕及靴口采用连续权重场。

本地中间件为角色目录中的 JapaneseSoldierC_Merged_V4_Local_Bones.glb。工程及绑定记录位于 OneDrive/AI/Models/Blender/Taierzhuang1938/JapaneseSoldierCIntegration_20261106。

随后由既有 Script_BuildXBotRigCharacter.mjs 转为X Bot的骨名、顺序、层级及初始朝向，关节位置沿用C的身材，hipsScale为0.9417。运行时 Model/Character/Model_JapaneseSoldierC.glb 约7.35MB、36,419三角面、一网格、一材质，三张4K贴图转为WebP。

## 消费入口与动作

Data_XBotCharacters.mjs登记ijaC，普通日军按单位id固定抽取甲、A、乙、C四款外观。动作预览提供日军士兵C选项，网址参数为who=ijaC。白盒预演和场景试玩共用人物登记及ClipForCharacter骨长、胯高换算。

Script_BakeJapaneseSoldierCContacts.mjs按C的实际手掌、靴底和肢体长度适配一份爬行动作，由clipOverrides选择。修正后靴底和手掌最低点均约2毫米，身体最低点约负5毫米，骨长误差为0。

## 验收

XBotCharactersTest检查65骨的名字、顺序、层级、初始朝向、逆绑定矩阵、权重和及实际头帽Head权重，覆盖本地绑定时已具备刚性头部的输入。

JapaneseSoldierCBrowserTest覆盖17条代表动作共1,450帧，包括端枪、走跑冲刺、蹲跪趴爬、射击拉栓、投弹、倒地、坐、拿取、爬梯、挥手和观察。取证包含正侧背、头帽、耳后、腕部及持枪近景，保存在本地忽略目录 _shots/JapaneseSoldierC。

白盒05-1实测甲2、A1、乙2、C2。C使用三八式，右手握点偏差约7毫米，左手实际护木接触检查通过。浏览器无脚本及绑定错误。

广泛快速回归通过113项后，在既有OpeningSetTest引用的 Model_HanYang.tzm.json 缺失处停止。该测试与 origin/master 的 dc0c1f37 相同，缺失文件在该基线也不存在。角色专用动作检查通过；乙与顺子回归、资料馆、运动矢量、采样器预算、浏览器打包、发布资源与菜单启动共11项专项检查通过。记录与截图保存在本地忽略目录。

日兵乙的机枪接触回归采用受控关键帧武器设置，按当前外观池选取乙作为Type11测试单位。

## 重建

从任务独占worktree根目录执行

~~~powershell
node Taierzhuang1938/_import/Script_BuildJapaneseSoldierC.mjs
node Taierzhuang1938/Script_TestRunner.mjs --only=XBotCharactersTest,JapaneseSoldierCBrowserTest --fail-fast
node scripts/Script_BlenderMcp.mjs status --scan
~~~

重建入口按输入的实际skin数据选择绑定路径，随后完成规范化、WebP转换和接触曲线生成。Model/Character/Data_JapaneseSoldierC.json记录输入、输出哈希、绑定方法及规范化矩阵。

## 史实与创作

脸型、肤色、军服配色与旧化、军帽、绑腿和皮靴按参考图设计，标注为创作。骨架、持枪及动作适配属于游戏表现。已同步Notion史实与创作对照表、上级说明页及资料馆创作条目。
