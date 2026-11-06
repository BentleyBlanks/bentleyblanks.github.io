# 冬瓜 V3 角色接入

## 输入与转换

采用用户重新下载的完整绑骨文件 `角色/Tripo/03_冬瓜/Donggua_Merged_V3_Local_Bones.glb`。SHA-256 为 `c1a62de50316288d5b7baec3b94e74892108bcc010651e6594bc9d0f9257d011`。该文件包含一套蒙皮、关节编号和顶点权重。

`Script_BuildDonggua.mjs` 调用已有 `Script_BuildXBotRigCharacter.mjs`，恢复1.835米帽顶，转换为 X Bot 的骨名、顺序、层级和初始朝向，并补齐末端骨。运行时包含65根骨骼，胯高比为0.8833。底色、法线和粗糙度贴图保持4K分辨率，转换为 WebP。

运行时为 `Model/Character/Model_Donggua.glb`，约8.48 MB、43,628三角面、一个网格和一个材质。输入、输出哈希及转换数值记录在同目录 `Data_Donggua.json`。

## 消费入口

`Data_XBotCharacters.mjs` 登记 `donggua`，`XBOT_CAST_CHARACTERS.comrade` 将现有冬瓜身份映射至此模型。动作预览、白盒预演和场景试玩沿用共同角色加载与动作换算。

动作预览地址为 `Tool_MixamoAnimationPreview.html?who=donggua`。

## 验收

`XBotCharactersTest` 检查骨架、逆绑定、权重归一化、头帽刚性及胯高比例。

`DongguaCharacterBrowserTest` 通过真实动作预览检查空手待机、端枪、行走、跑步、蹲伏、卧姿射击、倒地和坐姿，共328帧，并检查场景中的冬瓜实例。代表动作及场景截图保存在本地忽略目录 `tmp/Donggua/`。

角色静态、模块图、数据登记、史实标注、文字和资产规范共7项检查通过。运动矢量、发布资源、浏览器打包和菜单启动4项检查通过。白盒高档采样器检查的252个程序全部链接成功，最高14/16，20帧无GL错误。

广泛 quick 回归在本机保留端口的 `EACCES` 处中断。原保存口测试重试通过190条断言，其余检查按本次角色的消费入口选测。

## 重建

从独占 worktree 根目录执行

~~~powershell
node Taierzhuang1938/_import/Script_BuildDonggua.mjs
node Taierzhuang1938/Script_TestRunner.mjs --only=XBotCharactersTest,DongguaCharacterBrowserTest --fail-fast
~~~

输入保存在其他位置时，将完整 GLB 路径作为重建命令的第一个参数。

## 史实与创作

冬瓜的脸型、灰色旧军服、补丁、软军帽、绑腿与草鞋按参考图设计，属于本作创作外观。骨架和动作适配属于游戏表现。此标注已同步至 Notion 对照表、上级说明页和游戏资料馆。
