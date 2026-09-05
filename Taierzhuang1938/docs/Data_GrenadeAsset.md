# 滕县木柄手榴弹外观资产

2026-09-06：用户要求 imagegen 三视图、BlenderMCP 细化并替换线上加载画面中的简模。

## 历史范围

采用战前国产巩式木柄弹的外观解释，表现深色铸造金属弹体、收颈、木柄和封闭尾盖。没有制作内部结构，也没有添加未经证实的厂号、日期或德军标记。

- [抗日战争纪念网：徐州会战（一）——川军死守滕县](https://m.krzzjn.com/show-355-89383.html)记述战前补给的巩县手榴弹。该文属于后出的战史叙述，不能用来确定单件实物的生产批次。
- [中国军网：蟠龙山峡响惊雷](https://www.81.cn/js_208592/16269819.html)记述1938年起的柳沟兵工厂及其仿制巩县小型木柄弹的背景。
- [黑水博物馆：巩造木柄弹模型藏品](https://www.blackwater.tw/blog/tags/%E6%89%8B%E6%A6%B4%E5%BD%88)用于比较黑色金属与木柄的外观搭配；该馆明确标注为模型，不当作滕县战场出土物证。

这些材料支持时代与外观家族，不能证明三视图就是滕县守军某一确切批次。三视图为 imagegen 创作的美术参考，不是实物测绘图。游戏原有的0.22米包络为动画兼容保留，不宣称是这批历史实物的精确尺寸。删除旧展示文案中属于台儿庄第31师的用弹数字。

## 资产与坐标

- `Model/Grenade.tzm.json`：加载展示、角色持握用；4,480三角、1材质，右手握点为原点。
- `Model/Model_Type24Grenade.glb`：第一人称与投掷用；同一份网格，包围盒中心为原点。Type24仅为兼容保留的旧文件名。
- `Texture/Texture_Grenade{Base,Normal,Orm}.webp`：共用UV图集，左半木柄、右半金属。底色使用内置 imagegen，法线与粗糙度/金属度由 Blender 侧程序场生成。网页编码保留在1536×768以内。
- Blender编辑坐标中弹头朝+Z；GLB导出前转到Blender+Y，经glTF坐标转换后为游戏-Z。TZM直接旋转到游戏-Z，并沿Z平移-0.035米保持握点。`Script_ModelFacingTest.mjs`实际解码两份顶点云，验证宽弹体在-Z、木柄在+Z和全长包络。
- `_blender/Script_GrenadeDetail.py`保留可重建几何、UV、程序表面生成函数、GLB/TZM导出和本地摄影棚设置；`BuildWeapons.BuildGrenade`复用相同几何入口。重建使用已交付的贴图，不重新调用生成服务。

## 本地源工程

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/GrenadeDetail_20260906/`

其中保留 `Model_GongxianGrenade.blend`（贴图打包）、`Reference_GrenadeThreeView.png`、生成提示词、原始PNG材质及渲染预览。源工程、三视图及验收网页/截图不提交到Pages仓库。

BlenderMCP在本任务独立空场景执行建模脚本，再导出两种游戏格式。模型无悬空零件和共面接缝；发布验收包括开机载荷预算、模块缓存图、资产规范、两路真实顶点朝向以及浏览器展示/战斗检查。
