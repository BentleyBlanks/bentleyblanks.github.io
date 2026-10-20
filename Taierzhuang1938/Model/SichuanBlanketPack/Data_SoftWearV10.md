# Sichuan Blanket Pack — V10 Soft Wear

V10 从保存的 V9 高模继续修正久用旧布的软感、带子浅皱及草席卷口。V9 基准保留，游戏 GLB 未覆盖，当前仍未进行减面与最终游戏 PBR 转移。

## Source

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/HighV10/Scene_SichuanPackSoftWearV10.blend`

米制、居中的贴背轴心、平背与独立草席/草鞋/短褂组件继续沿用。Blender 原生 Z-up，后续 glTF 导出转换 Y-up。图像与对应重建脚本文本均打包进工程。

## Reference corrections

- 内置 imagegen 以 V9 棉布原图和用户确认的 V02 参考为输入，校正贴伏浮毛、卷曲断纱与洗淡层次，减轻连续深泥底边。原图保存在 `Source/MaterialAtlasV10/Image_SichuanSoftOldCottonV10.png`；[提示词](Data_SoftOldCottonV10Prompt.txt)与[1024 PBR 来源](Data_SichuanCottonReliefV10.json)随资产保留。
- 贴图准备仅把生成源 RGB/Lanczos 缩至 1024。法线从 1–8 px 的中频纤维导出，排除细砂点和宽范围污渍梯度。材质保留软旧棉布的哑光与轻微绒面。
- `SoftCottonWearV10` 形态键提供八处稀疏弧形浅褶，以及四个带子交叉处、上翻处的浅皱和局部卷边。Basis、UV、父子关系与背平面不变，补丁区域排除；重复运行不累计。
- 草席内圈真实压紧与向内增厚，外面的一整圈、外织及席带原位保留。卷口旧宽草束及附属细筋的面被移除，沿整条压紧后的卷边重建三股轴向有起伏的扁交编草束；换位相位由全局弧长连续驱动，只保留少数短断头，没有逐段重置为碎片。没有用圆盘遮盖或把暗缝涂浅。
- 草席起卷边延伸为贯穿全宽的窄折入叶，压向内核的小裂口；它与原片起边相连，并非独立端盖。鞋底只压磨短横草束的截面，保留各截面中心形成的杯弧，鞋边和鞋口带排除。
- 草编使用独立的纵向旧草纤维源，突出植物筋脉、细裂纹与磨白断纤维；交织由几何承担，材质没有预烘编绳。加入不连续灰褐积尘，磨损坐标随各独立部件移动。来源见[草纤维提示](Data_WornStrawV10Prompt.txt)与[1024 PBR 记录](Data_SichuanWornStrawV10.json)。

## Rebuild

```powershell
py Taierzhuang1938/_import/Script_SichuanCottonReliefV10.py
py Taierzhuang1938/_import/Script_SichuanWornStrawV10.py
node scripts/Script_BlenderMcp.mjs start C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/HighV9/Scene_SichuanPackReferenceWearV9.blend --task SichuanBlanketPack
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_SichuanReferenceRefinementV10.py
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

构建过程按软褶、材质、真实压紧、切端分束、内折叶、鞋底压磨及附着纤维的顺序执行。新纤维从带形态键的 evaluated 网格取表面，随后恢复可编辑源网格。卷口模块保留原网格顶点索引、坐标及完整假用户基线，便于重复修改；新草束为草席组件的子物件。

实际渲染与检查报告在本地忽略目录 `tmp/SichuanBlanketPack/Review/`。本轮技术与视觉验收分开记录，未将面数或来源哈希当作参考一致的证据。尚未标记用户最终视觉确认或游戏输出完成。
