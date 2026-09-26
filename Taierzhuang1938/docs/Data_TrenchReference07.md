# 通用壕沟：概念图 07（2026-09-26）

美术来源：[游戏概念参考图 / 07「沿沟南行」](https://app.notion.com/p/3e460335331c80799ad5f4faf4f837a9)。本轮用户要求所有通用壕沟的材质与样式对齐这一张图。主图是裸露灰褐土壁、碎土沟沿、嵌石与细根、踩实的裸土沟底；没有连续木护板与成片踏板。人物、村屋和天空不属于本轮壕沟外观修改。

## 实现

- `Script_TrenchPlan.PlanTrenchDressing` 默认不再生成木护壁与踏板；`timber: true` 保留规划器的显式旧式护壁模式及其确定性/净空回归。射击位、沙袋碰撞、补给杂物随机序列不变。
- `Script_TrenchEarth` 只按编译站点与实际共享高度场布设碎土和草根；参数在 `Data_TrenchAppearance`。土块下半部埋入地面，草根沿沟沿向下贴坡；段端、三岔口、被相邻沟挖掉的坡面留空。48 米分区进入 `BuildSink`，没有逐件 Mesh。
- 新细节是厘米级表面装饰，不新增通行地面或碰撞。全网开挖断面、深度、宽度、路线和高度场完全不变。土块共用分层土壤材质；细根是高粗糙度土褐色。
- 细节网格标记 `deformableTerrain`，由现有弹坑适配器与原土一起裁掉，爆炸后不会保留悬空根层。关卡重建走同一销毁链。
- `SpoilEarth` 一层更新三张贴图；其余地形图层保持原图。Base 为 sRGB，Normal/Orh 为线性，保持原来的四层数组和采样器数。无缝、远近混合、侧投影和对比度淡出仍走现有材质。

## 生成与重建

供应商：直接内置 `image_gen__imagegen`，单张生成，没有使用付费 API 或回退。输入主图只作为材质参考；源图与截图仅存本地忽略目录。产物是 `Texture/Texture_TerrainSpoilEarth{Base,Normal,Orh}.webp`。

完整提示词：

```text
Use case: photorealistic-natural. Asset type: one production game seamless soil albedo texture, square 1536x1536. Reference image 1 is ONLY the style/material reference: its exposed trench earth on both sides and compacted floor. Create a new flat orthographic texture scan of a 2.1 by 2.1 metre patch of the same muted neutral grey umber brown excavated mineral earth. Coherent dense silty clay with irregular crumbly ridges, small firm clods 2-6 cm, gritty fines, a FEW embedded angular dull stones 3-9 cm and a few fine broken dry roots. Compact dusty areas between shallow clod crevices; no large open cracks. Natural multi-scale fine detail, subdued realistic rough dry earth, not volcanic rock, not cobblestone, not wet chocolate mud. Strictly unlit DELIT base color only, even diffuse illumination everywhere, no baked directional light or shadows, no highlights, no gradients, no perspective. Uniform density and brightness, seamless repeat on all four edges, no borders, text, UI, people, buildings, weapons, planks, grass carpet, footprints or composition from reference. Fill the entire image with the dirt material.
```

将生成源图命名为 `Gen_SpoilEarth.png` 放入本地源目录后，从仓库根运行：

```powershell
python Taierzhuang1938/_import/Script_BakeTerrainLayers.py --source <本地源目录> --only SpoilEarth
```

脚本依赖 Pillow 与 NumPy；只处理翻土层。最终色调与法线米制幅度由烘焙表保存，不手工修改生成图。纹理缓存戳在 `Data_Tuning_Terrain`，模块戳在 `index.html`。

## 后方冻结契约

旧 `Data_FirstLevelSpaceSouthFingerprint.json` 的 `blocks` 包含此次明确要求移除的通用护壁与踏板。因此保留原始完整指纹，并增加 `structuralBlocks`：从原基线等价布局排除严格匹配的 `Revetment<n>_<side>Post/Slat<n>` 和 `Duckboard<n>`。生成前核对原布局的四组完整指纹逐项等于原文件，再生成新字段。

`Script_FirstLevelSpaceTest` 检查其余 817 个结构体块的原基线摘要、2 个壕沟道具、191 个遗体及 56,048 个地面采样；另断言运行时已经没有通用木护壁与踏板。掩蔽部框架和手工木构不在排除范围。规划器回归独立核对去掉木构前后射击位、杂物逐项不变。

## 验收入口

`Script_TrenchPlanTest`、`Script_TerrainLayersTest`、`Script_FirstLevelSpaceTest`、`Script_FirstLevelMissionFortificationsTest`（新增土块/细根存在、合批预算、有限坐标与弹坑裁除接线检查），以及 TestRunner 的 changed/prepush。截图必须来自运行中的第一关，使用 07 阶段检查交通沟，再检查前沿与近壁；调试跳转仅作外观证据，不宣称完整战役通关。

实测：全网新增表面细节 120,948 三角、32 个分区合批网格；42 次胶囊双向实走，188/188 路径点到达。一次沟壁炮击使该点地面下陷 0.609 米，裁掉附近 4 个细节网格的相交部分；202 个 GPU 程序全部链接，最多 14 个采样器（设备上限 16），GL 错误为 0。翻土三图共 654,276 字节，边带对比度比 0.990、边带亮度摆幅 0.005。已查看 07 交通沟、近壁、前沿和炮击后的实际截图。

预推送历史失败核对：`MachineGunCutsceneAudioTest` 在本轮与未修改 c668bbd8 页面均未能建立对照对白采样源；`FirstLevelMissionFortificationsTest` 在两版均于 `TransferWireSouth` 桩位射线先命中 `whiteboxWall` 而失败。后者此前的土层、包围盒、碰撞净空、42 次双向实走及新增表面细节断言已通过。未改动这两处原断言，也不把整项报告为全绿。
