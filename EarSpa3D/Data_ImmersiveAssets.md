# EarSpa3D 沉浸资产

当前游戏加载 Models/Model_ImmersiveEar.glb，1 世界单位 = 1 毫米。
本轮通过 BlenderMCP 在 Blender 5.1 中重建 NaturalEar；游戏资产不含下载的照片或第三方模型。

源工程：C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/NaturalEar/Model_NaturalEar.blend。
.blend、备份和原始贴图留 OneDrive；游戏 GLB 内嵌纹理，仓库保留重建脚本。

## 对照参考

- [人耳实拍](https://en.wikipedia.org/wiki/File:Human_right_ear_(cropped).jpg)，来自 Wikipedia Ear 页面。
- [Gray904 耳廓结构图](https://en.wikipedia.org/wiki/File:Gray904.png)，来自 Auricle (anatomy) 页面。

已实际查看参考：纵向不对称外轮廓、连续卷起的耳轮、Y 形对耳轮、耳甲凹窝、
耳屏与对耳屏、圆润耳垂。建模以连续曲面替代拼接椭球，入口方向与耳道首环一致；
没有把参考照片包装成游戏贴图。游戏模型是程序化重建与实时光照，不能声称与实拍无法区分。

## 重建

先在独立工程中加载原 ImmersiveEar 基础工程（包含工具、头部、枕垫与收集盘），
另存上述 NaturalEar 路径。用 __file__ 指向仓库 Script_BuildNaturalEar.py 后执行该脚本，
调用 BuildNatural()，依次重建 Canal、Wax、Outer、ExtraTools 并保存、导出 GLB。
首次重建基础工程的方法仍是 Script_BuildImmersiveEar.py：
BuildEar → SculptEar → BuildTools → BuildWax → BuildTray → Export。

Script_BuildNaturalEar.py 读取 Data_CanalProfile.json；管腔采样保证毫米坐标一致。
UV 接缝顶点焊接后保留朝内绕序，Solidify offset=-1 才会向皮肤外侧增厚。
皮肤与蜡质的颜色、法线、粗糙度由可重复的多尺度噪声生成，不是外部照片或 AI 生图。
58 根稀疏细毛合并一个网格；鼓膜为倾斜微凹膜；干片有闭合的薄层与卷边，
湿块和硬结有不规则蜡质轮廓，运行时每块还有轻微独立形变。

## 接触与收集

Script_PeelPhysics.mjs 提供五点粘附、偏心力矩与内壁支撑。
Script_FractureGeometry.js 切开并封住截面；碎片拥有独立网格与状态，质量总和保留。
耳勺托片、镊子夹持、滴液渗透、毛刷切向清屑、吸引管吸入滤芯有不同条件与路径。
工具托送有显式辅助动画；落盘用重力和低恢复系数，吸入用喷嘴遮挡，不缩小消除。

## 声音

新增 SeedAudio 干性撕开、黏性剥离、客人疼痛对白；保留适用的落盘、滴液、摩擦和吸引声。
来源与生成信息见 Data_AudioSources.mjs、Audio/Data_AudioManifest.json。
密钥只从 VOLCENGINE_API_KEY 读取。对白保留整句，播放上限 6 秒。
Script_TactilePlayTest.mjs 在真实鼠标/触屏采耳时分析最终输出，检查起音、可听电平、
削波与静音。电平检测不代表人的主观试听。
