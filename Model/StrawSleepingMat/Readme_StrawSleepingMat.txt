Straw Sleeping Mat / 1930年代士兵草席 · KnotDetail4

两件独立 GLB：铺开 1992 三角；卷起 1192 三角。
米制，glTF +Y 向上，+X 长轴，完整物体包围盒的底面中心为轴心；根变换为单位矩阵。

铺开席面名义 1.8 × 0.9 × 0.005 米；翘边使总高超过 5 毫米。
卷体名义轴长 0.9 米、直径 0.135 米；含捆绳横向最大约 0.1492 米。
原席沿 1.8 米长度的中点对折，再沿原宽度为轴卷起；两道草绳、一个挎环。
散草使整体长宽略超名义值；挎环计入总高。

每个模型独立使用四张 1024 PNG：BaseColor / Normal / Roughness / AO。
BaseColor 是 sRGB RGBA；数据贴图为线性。法线采用 OpenGL +Y。
GLB 自带 BaseColor、Normal、ORM；ORM = R AO / G Roughness / B 0 Metallic。
GLB 的标准 MASK 阈值为 0.33，双面；草丝透明区仅存在于图集的草丝小块。
导入其他引擎时，请保留 Alpha Clip 与双面设置；DirectX 法线约定需翻转绿色通道。

席面细编织由法线表现；厚度、翘边、锁边和角部收结为网格。
卷端外圈为真实成对卷层，内圈结合端面法线与 AO；中心保留双层折返。
结头为略不规则的紧凑低模体块，草绳交织细节使用专门生成的 imagegen 材质、法线和 AO；保留低面数预算。
捆绳与挎环的双股绞纹由按弧长映射的 15 毫米节距法线表现。
铺开 28 张、卷起 26 张固定草丝透明贴片，避免逐根纤维占满面数。
卷体顶部与底部投射压缩的草纹以 imagegen 细编织来源补足，保留参考的大范围色泽和污迹，避免斜视时草条被拉宽。

历史资料支持士兵携小草席与南方传统草席工艺；具体尺寸、双绳与挎环按用户确认的复原方案制作。
Source/ 保存内置 imagegen 的材质来源和提示词；Data_Asset.json 列出资料链接与重建入口。

重建顺序：
1. python Model/StrawSleepingMat/Script_StrawSleepingMatTextures.py --scratch tmp/StrawSleepingMat
2. 通过 scripts/Script_BlenderMcp.mjs 启动本任务独立工程，设置 scene['StrawMatRoot'] 为本资产目录。
3. 通过同一入口执行 Script_StrawSleepingMatBake.py，生成两个 GLB；工程保存为 Scene_StrawSleepingMatKnotDetail.blend。
4. python Model/StrawSleepingMat/Script_StrawSleepingMatVerify.py --report tmp/StrawSleepingMat/Data_KnotDetailExportVerification.json

Blender 原工程位于 C:/Users/Bentl/OneDrive/AI/Models/Blender/HistoricalProps/StrawSleepingMat/。
预览、参考图对比与验收报告只在本地 DeliveryKnotDetail/ 包内；不属于游戏运行资源。
旧版、Refined 版、Detail 版与本次 KnotDetail 版工程和交付包分别保留。
