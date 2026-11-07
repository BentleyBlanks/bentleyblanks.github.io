# 老耿 V10 角色接入

## 输入与转换

采用用户下载的完整绑骨件 `角色/Tripo/07_老耿/Model_OldGeng_Merged_V10_Bones.glb`。
SHA-256 为 `6ac9a4be629898139ca797d0f6ad6c1e9023a47ed145fb13c5c681cc86756ac7`，含一套蒙皮、55根Mixamo骨骼和一个材质。

`Script_BuildOldGeng.mjs` 复用 `Script_BuildXBotRigCharacter.mjs`，恢复1.8092米头顶高度，统一为65根X Bot骨骼的名字、顺序、层级与初始朝向。胯高比为0.9478，动作通过共用 `ClipForCharacter` 换算，蹲伏、卧姿、倒地和坐姿采用老耿专用接触曲线。颈骨到头骨的权重渐变修复覆盖5,673个顶点。

仓库运行时模型为 `Model/Character/Model_OldGeng.glb`，约9.51 MB、44,485三角面、单网格单材质，内嵌一张8K WebP底色图。发布副本按路径贴图规则转换。输入、输出哈希和转换数值记录在同目录 `Data_OldGeng.json`。

## 消费入口

`Data_XBotCharacters.mjs` 登记 `oldGeng`，`XBOT_CAST_CHARACTERS.geng` 将已有老耿身份映射至此模型。场景单位使用 `castId: "geng"`，或使用现有单位编号 `Geng`。白盒预演、场景试玩和动作预览共用外观加载与动作换算。

动作预览入口为 `Tool_MixamoAnimationPreview.html?who=oldGeng`。第一关06–10配置中的原有老耿单位直接采用新外观。

## 验收与动作边界

`XBotCharactersTest` 检查骨架、逆绑定、归一化权重、胯高比例和上半头部刚性。`ModelFacingTest` 量测真实鞋尖顶点云，确认源朝向+Z，经共用桥接适配角色-Z。

`OldGengCharacterBrowserTest` 经真实动作预览检查待机、说话、指向、观察、行走、跑步、端枪、蹲伏、卧姿、倒地和坐姿，共12条片段、492帧。场景测试使用第一关06–10中的真实 `Geng` 单位，并在内存中加入一名 `geng` 身份的测试人物，核对两条识别路径。

第一关正式场景的摆位与实际试玩入口都确认老耿可见，高档场景分别检查189和201个着色程序，全部链接成功，最高14/16个采样器，GL错误、资源加载失败和控制台错误均为0。本地取证保存在忽略目录 `tmp/OldGeng/`。

`Script_BakeOldGengContacts.mjs` 沿用幺娃的接触烘焙方式，以60Hz逐顶点量测这四条动作，只调整胯部位移，保留其他身体旋转和关键帧。最大全帧修正量分别约3.9、8.3、10.8和7.0厘米，目标为实际蒙皮最低点高于平面2毫米。产物与哈希记录在 `Animation/OldGeng/Data_OldGengContacts.json`，重建入口自动更新这四条曲线。浏览器逐顶点复测最低点为地面上方1.88–2.00毫米，骨长误差为0。

独立发布副本通过当前贴图转换和结构校验，8K原始底色按路径规则转为2048×2048 BC7，发布模型约7.28MB。几何、骨架、权重和材质结构保持一致。发布模型经真实浏览器加载，65根骨骼、2048尺寸贴图与面部近景显示正常，着色链接成功，资源、控制台和GL错误均为0。

角色静态、朝向、模块图、数据、文本、史实标注、资产规范、测试登记、发布路径、贴图规则、打包启动、菜单和资料馆检查通过。运动矢量及共用发布资源回归通过。

线上复核发现动作预览工具的六张大刀、手榴弹贴图仍走原始文件名。工具改用现有 `ManagedTextureLoader` 并登记渲染器，动态路径通过发布资源表解析，同时启用模型贴图的GPU格式选择。`Script_PublishSiteTest.mjs` 增加老耿动作预览入口，等待资源加载结束并拦截404回归。

广域回归通过113项后停在既有 `OpeningSetTest`，其引用的旧文件 `Model/Model_HanYang.tzm.json` 在本轮远端基线也不存在，测试源码与远端一致。

## 重建

从独占worktree根目录执行

~~~powershell
node Taierzhuang1938/_import/Script_BuildOldGeng.mjs
node Taierzhuang1938/Script_TestRunner.mjs --only=XBotCharactersTest,OldGengCharacterBrowserTest,ModelFacingTest --fail-fast
~~~

输入保存在其他位置时，把完整GLB路径作为重建命令的第一个参数。

## 史实与创作

老耿的脸型、光头、灰色中式上衣、腰带、裤装、绑腿与草鞋按角色参考图设计，属于本作创作外观。手腕、领口、下肢衔接、骨架与动作适配属于游戏表现。标注同步至Notion对照表、上级说明页和游戏资料馆。
