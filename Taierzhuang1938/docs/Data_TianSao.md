# 田嫂角色接入

## 输入与外观

输入为用户下载的 `角色/Tripo/24_田嫂/Model_TianSao_TripoReady_V6_Bones.glb`，包含一套 55 骨 Mixamo 蒙皮。下载件对应 V6 网格。`_import/Script_PrepareTianSaoRig.mjs` 根据原始 V6 与用户采用的 V7 鞋型的 UV、顶点和解剖侧建立对应，将两脚几何、法线和三角绕序更新为 V7，并同步拟合踝骨和脚趾关节。

准备阶段逐字节核对鞋子以外的顶点与下载件的蒙皮权重，转换报告保存实际输入哈希和映射误差。转换器随后采用共用 65 骨架，并为下颌到头颅整理 Head 权重及颈根过渡，浏览器通过独立转头检查实际蒙皮。

游戏模型为 `Model/Character/Model_TianSao.glb`，38,256 三角面，三张 4K 内嵌 WebP 贴图。游戏成年女性身高默认取 1.65 米，采用整体等比换算。胯高比为 0.8499。模型外观为光头。

## 角色入口

`Data_XBotCharacters.mjs` 中的模型键为 `tianSao`，白盒命名角色使用 `castId: "tiansao"` 或单位编号 `TianSao`。正常角色创建、身高换算和共用动作均沿用 `Script_EditorBlockoutPuppets` 与 `Script_EditorBlockoutXBot`。

本地动作预览入口为 `AdvancedTools/Tool_MixamoAnimationPreview.html?who=tianSao`。场景具体摆位由对应关卡的关键帧单位配置决定。浏览器门禁在隔离响应中加入田嫂测试单位，覆盖正常创建、空手步态速率和场景试玩，截图保存在本地忽略目录 `tmp/TianSaoIntegration/Browser/`。

## 重建与验收

~~~powershell
node Taierzhuang1938/_import/Script_BuildTianSao.mjs
node Taierzhuang1938/Script_TestRunner.mjs --profile=prepush --domain-only=tianSaoCharacter --fail-fast
~~~

重建命令的前三个参数依次接受绑骨下载件、V6 静态件、V7 静态件路径。共用转换入口为 `_import/Script_BuildXBotRigCharacter.mjs`。来源、输出哈希、脚部修正、头部蒙皮与默认身高记录在 `Model/Character/Data_TianSao.json`。

`Script_BakeTianSaoContacts.mjs` 重采样站立待机、张望和坐姿的骨盆高度，按实际蒙皮最低点修正贴地。派生件由 `clipOverrides` 供动作预览和场景共用，记录见 `Animation/TianSao/Data_TianSaoContacts.json`。

`XBotCharactersTest` 核对完整骨架、绑定姿势、权重、下颌刚性与动作来源哈希。`ModelFacingTest` 用鞋子顶点云核对源 +Z 和角色 -Z 桥接。`TianSaoCharacterBrowserTest` 覆盖六条动作、左右独立转头、光头外观、场景加载与试玩。

## 创作来源

光头、脸型、深色棉衣、绑腿和布鞋采用用户确认的模型与参考。1.65 米身高为游戏默认表现值，鞋型修正、衣内接口、蒙皮和动作适配属于建模与游戏表现。
