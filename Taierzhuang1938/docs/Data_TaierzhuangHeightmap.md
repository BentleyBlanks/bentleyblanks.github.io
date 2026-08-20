# 台儿庄序章真实高度图

## 运行时契约

「序 · 界河」的大尺度地面不再由程序噪声生成。高度合成只有一条入口：

```text
台儿庄 SRTM DEM → 宽缓土岗 / 排水沟 → 界河下切河槽
                      ↓
               SampleJieheHeight(x, z)
```

`Script_JieheField` 的可见网格、角色站立、AI、弹道地形求交，以及
`Script_TengxianOutfield` 的河堤、胸墙、坟头、田埂、道路、铁路、村屋和树木，
全部读取同一 `groundAt(x,z)`。布设数据只保存 `x/z` 和离地偏移，不另存一份会过期的
绝对 `y`。

## 数据源与裁切

- 数据集：Mapzen Terrain Tiles，AWS Open Data Registry。
- 原始瓦片：`skadi/N34/N34E117.hgt.gz`，3601×3601，SRTM 约 30 米裸地高程。
- 中心：台儿庄古城，`34.5582572, 117.7396218`（OpenStreetMap Nominatim）。
- 场景范围：东西 2500 米、南北 1820 米；北在图像首行，世界 `x` 向东、`z` 向南。
- 处理：3×3 中值去除孤立尖峰，双线性重采样为 257×193；米制高差保持 1:1，
  没有纵向夸张。
- 产物：`Heightmap/Texture_TaierzhuangHeightmap.png`（16-bit 灰度）和
  `Heightmap/Data_TaierzhuangHeightmap.mjs`（浏览器同步采样缓存）。
- 原始压缩瓦片 SHA-256：
  `523a4a08112104af514db0bcc35e2811dc207f995a56075c6b65f12c5195ac78`。
- 署名：SRTM terrain data courtesy of the U.S. Geological Survey；瓦片由 Mapzen
  通过 AWS Open Data 托管。

原始 6.3 MB HGT 只用于再生成，放在 `Heightmap/_raw/` 且不进 Git。PNG 内含来源、
中心坐标和高程范围的 `tEXt` 元数据。

## Agent CLI

重新下载和生成：

```powershell
node Taierzhuang1938/Script_HeightmapCli.mjs download
node Taierzhuang1938/Script_HeightmapCli.mjs verify
```

查询某个世界坐标。输出原始海拔、场景相对高度和最终战术地面高度：

```powershell
node Taierzhuang1938/Script_HeightmapCli.mjs sample --x=205 --z=-1523
```

给 JSON 布设批量贴地：

```powershell
node Taierzhuang1938/Script_HeightmapCli.mjs match `
  --input=Data_NewPlacements.json --output=Data_NewPlacementsMatched.json
```

CLI 会递归查找带数值 `x/z` 的对象，写入或更新 `y`。若对象还带
`groundOffset`，最终 `y = 地面 + groundOffset`。模式：

- `--mode=final`：默认，真实 DEM + 土岗/沟槽 + 河床；场景布设应使用这一档。
- `--mode=base`：只取换算到场景坐标的真实 DEM。
- `--mode=dem`：返回海拔米，用于 GIS 对照，不可直接作为游戏 `y`。

示例输入：

```json
[
  { "id": "NewFoxhole", "x": 84, "z": -1320 },
  { "id": "NewTree", "x": -210, "z": -1180, "groundOffset": 0.15 }
]
```

## 修改守则

1. 不要在序章新布设中手写绝对 `y`；运行时走 `groundAt`，离线数据走 CLI。
2. 换中心或裁切范围时必须用 CLI 同时重建 PNG 与 Data，不得只替换其中一个。
3. 战术沟槽/土岗只在 `Script_JieheHeight.mjs` 定义；渲染、碰撞和 CLI 不得复制公式。
4. 改完至少运行：

```powershell
node Taierzhuang1938/Script_HeightmapCli.mjs verify
node Taierzhuang1938/Script_JieheTerrainTest.mjs
node Taierzhuang1938/Script_BootTest.mjs
```
