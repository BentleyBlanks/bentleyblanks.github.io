# 妮儿 V11 游戏接入

采用用户下载的 `Nier_Merged_V11_Bones.glb`，源文件 SHA-256 为 `3fb890c5bb826034d37a01538468ec10c653c246fcf42a92f7b61ede9dd77ce9`。输入包含54根参与蒙皮的 Mixamo 关节，Tripo 将模型最大尺寸归一化到1米附近。

`_import/Script_BuildNier.mjs` 复用共用转换器，恢复拼接件的1.288729米高度，生成65骨运行时骨架。骨名、层级和初始朝向对齐 X Bot，关节位置使用妮儿自身比例。动作转换去掉 Hips 以外的位移轨，Hips 位移按0.6397缩放。

头顶和手指的无权重末端骨按自身轮廓重新定位。头顶末端从约1.3465米移到1.2837米，落在头部表面内侧。脸部所在连通网格在1.08米以上收为 Head 权重，1.04至1.08米之间平滑过渡，修正自动权重中的颈部和肩部泄漏。

运行时资产为 `Model/Character/Model_Nier.glb`，约7.23 MB、36,611三角面、单网格、单材质，三张贴图均为4K WebP。输入输出哈希、末端骨位置和权重修复数值写在 `Model/Character/Data_Nier.json`。

## 加载与尺寸

`Data_XBotCharacters.mjs` 登记 `nier`，命名角色映射覆盖编辑器的 `Nier` 和旧布局的 `nier`。人物只分配给妮儿身份。

带 `heightM` 的角色通过现有 ActorFactory 尺寸选项设置实际身高，XBotSkin 按模型高度适配该 Actor，碰撞和显示使用同一尺寸。妮儿在第六段场景中的模型世界缩放为1，Actor 身高为1.288729米。

这类角色的原生行走、跑步播放速率按世界缩放与自身胯高比换算，适配缩短的步幅。

本地动作预览入口为 `Tool_MixamoAnimationPreview.html?who=nier`，实际角色检查入口为 `?editor=blockout&level=FirstLevel0610&kf=06-2`。

## 本次验证

`XBotCharactersTest` 检查共同骨架、逆绑定、源模型高度、权重和动作换算。`ModelFacingTest` 从布鞋顶点云复量源朝向为+Z，角色桥接转为-Z。

`NierCharacterBrowserTest` 逐帧检查八组现有动作，共264帧，覆盖空手待机、环顾、行走、跑步、跪姿、蹲行、跪地检查和坐姿。独立转动头骨至正负45度检查下颌刚性，并验证第六段实际妮儿的模型、身高和世界缩放。截图、资源错误和数值只留本地 `tmp/Nier/`。

接触检查发现蹲行最低点约下陷5.0厘米，跪地检查约3.0厘米，坐姿约7.0厘米。`_import/Script_BakeNierContacts.mjs` 以每秒60帧采样实际蒙皮最低点，通过Hips竖向位移校正跪姿、蹲行、跪地检查和坐姿，生成妮儿专用动作覆盖。其他关节角度和肢体长度沿用原动作。模型与动作输入输出哈希记录在 `Animation/Nier/Data_NierContacts.json`。

浏览器验收直接采样最终覆盖动作，检查最低点下陷小于1厘米。动态图及场景的原生步速另按世界尺寸与自身胯高比校验。

## 重建

~~~powershell
node Taierzhuang1938/_import/Script_BuildNier.mjs
node Taierzhuang1938/Script_TestRunner.mjs --only=XBotCharactersTest,NierCharacterBrowserTest,ModelFacingTest --fail-fast
~~~

输入放在其他位置时，把完整 GLB 路径作为重建命令的第一个参数。

## 创作标注

妮儿的脸型、光头、旧棉衣、补丁裤和布鞋按用户参考与生成部件设计，属于本作创作外观。身材、骨架、蒙皮和动作适配属于游戏表现。
