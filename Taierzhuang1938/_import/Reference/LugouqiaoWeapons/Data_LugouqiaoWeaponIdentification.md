# 卢沟桥武器合集拆分与识别

来源：用户提供的 `武器.max`。原集合按 12 个根节点拆分；每个拆分 Blend 都保留原 UV、材质槽和外部贴图引用。`Texture_Source/` 保存 16 个原始 DDS/TGA/JPEG 文件的逐文件副本，游戏使用的 JPG/PNG 是从这些原图生成的浏览器兼容版本。

| 源根节点 | 游戏模型 id | 识别结论 | 处理 |
|---|---|---|---|
| `2#` | `WaltherP38` | 套筒铭文可辨识为 Walther P38 | 新增 → **2026-09-05 移除**（1939 年才交付德军） |
| `BROTRIPO009` | `BrowningTripodAssembly` | 勃朗宁式三脚架/机件组合，具体型号未明 | 截图标注后新增 |
| `Cylinder026` | `UnidentifiedMunition` | 弹体，具体型号未明 | 截图标注后新增 |
| `FQDQD` | `UnidentifiedBoltActionRifle` | K98 系栓动步枪（源节点 `MK98_*`），机匣带皮卡汀尼导轨 | 截图标注后新增 → **2026-09-05 移除** |
| `Group146` | `OfficerSwordSet` | 军刀与刀鞘，具体制式未明 | 截图标注后新增 |
| `Mesh_0300` | `RingPommelDagger` | 带环首短刃，具体制式未明 | 截图标注后新增 |
| `MK1` | `UnidentifiedAntiaircraftGun` | 复核为 Bren Mk I 式轻机枪（先前误读弯弹匣为环形瞄具） | 截图标注后新增 → **2026-09-05 移除** |
| `PJP` | `LightMortar` | 带两脚架的 50 mm 级轻迫击炮，1938 年 3 月中日双方均无此类 | 截图标注后新增 → **2026-09-05 移除** |
| `QEDQD` | `Type11` | 十一年式轻机枪（侧置漏斗供弹、散热片与偏置枪托） | 替换同名游戏模型；旧源保留 |
| `Sphere001` | `Mauser96` | 毛瑟 C96 | 2026-09-06 按用户要求移除游戏资产与生成入口；源文件仅作存档 |
| `sphere3` | `MediumMortar` | 中型迫击炮，具体型号未明 | 截图标注后新增 |
| `Wp_Gun_Karabiner 98 Kurz` | `Karabiner98k` | 源节点直接给出 Karabiner 98 Kurz；机匣带皮卡汀尼导轨 | 新增 → **2026-09-05 移除**（K98k 1938 年 4 月底才首批到华） |

## 无可靠型号信息的识别截图

- [勃朗宁三脚架组件](Texture_LugouqiaoIdentification_BrowningTripodAssembly.png)
- [未明弹体](Texture_LugouqiaoIdentification_UnidentifiedMunition.png)
- [未明栓动步枪](Texture_LugouqiaoIdentification_UnidentifiedBoltActionRifle.png)
- [军刀与刀鞘](Texture_LugouqiaoIdentification_OfficerSwordSet.png)
- [环首短刃](Texture_LugouqiaoIdentification_RingPommelDagger.png)
- [未明高射炮](Texture_LugouqiaoIdentification_UnidentifiedAntiaircraftGun.png)
- [轻型迫击器](Texture_LugouqiaoIdentification_LightMortar.png)
- [中型迫击炮](Texture_LugouqiaoIdentification_MediumMortar.png)

这些名称刻意只描述画面中能确认的类别或结构；没有把工作节点名、材质名或相似轮廓强行当成史实型号。

## 2026-09-05 按考据移除的五件

| 游戏模型 id | 移除理由 |
|---|---|
| `WaltherP38` | 德军 1938 年定型、1939 年 8 月才首批交付；1938 年 3 月无量产品。 |
| `Karabiner98k` | 中国 5 万支 K98k 合同 1938 年 3 月签，首批 4 月底到香港，晚于滕县与台儿庄；模型机匣带皮卡汀尼导轨，是现代游戏资产。 |
| `UnidentifiedBoltActionRifle` | 源节点 `MK98_*`，同为 K98 系并带导轨，理由同上。 |
| `UnidentifiedAntiaircraftGun` | 台架四宫格看清是 Bren Mk I 式轻机枪（弯弹匣上插、喇叭口消焰器、提把、托下单脚架），并非高射炮；Bren 1938 年才进英军，7.92 mm 版 1943 年才到华。 |
| `LightMortar` | 带两脚架的 50 mm 级轻迫击炮；中方 60 迫是 1942 年的民三十一式，日方 50 mm 曲射只有掷弹筒（项目已有八九式）。 |

运行时 TZM、浏览器贴图与拆分 Blend 已删除；`Texture_Source/` 的原始贴图逐文件保留，`TEXTURES` 映射不变。识别截图仍留作档案。依据见 `docs/Data_HistoryMaterial.md`「避坑清单」。
