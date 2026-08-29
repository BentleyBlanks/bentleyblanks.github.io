# 卢沟桥武器合集拆分与识别

来源：用户提供的 `武器.max`。原集合按 12 个根节点拆分；每个拆分 Blend 都保留原 UV、材质槽和外部贴图引用。`Texture_Source/` 保存 16 个原始 DDS/TGA/JPEG 文件的逐文件副本，游戏使用的 JPG/PNG 是从这些原图生成的浏览器兼容版本。

| 源根节点 | 游戏模型 id | 识别结论 | 处理 |
|---|---|---|---|
| `2#` | `WaltherP38` | 套筒铭文可辨识为 Walther P38 | 新增 |
| `BROTRIPO009` | `BrowningTripodAssembly` | 勃朗宁式三脚架/机件组合，具体型号未明 | 截图标注后新增 |
| `Cylinder026` | `UnidentifiedMunition` | 弹体，具体型号未明 | 截图标注后新增 |
| `FQDQD` | `UnidentifiedBoltActionRifle` | 栓动步枪，具体型号未明 | 截图标注后新增 |
| `Group146` | `OfficerSwordSet` | 军刀与刀鞘，具体制式未明 | 截图标注后新增 |
| `Mesh_0300` | `RingPommelDagger` | 带环首短刃，具体制式未明 | 截图标注后新增 |
| `MK1` | `UnidentifiedAntiaircraftGun` | 高射炮形制（环形瞄具、三脚架），具体型号未明 | 截图标注后新增 |
| `PJP` | `LightMortar` | 轻型迫击/掷弹器，具体型号未明 | 截图标注后新增 |
| `QEDQD` | `Type11` | 十一年式轻机枪（侧置漏斗供弹、散热片与偏置枪托） | 替换同名游戏模型；旧源保留 |
| `Sphere001` | `Mauser96` | 毛瑟 C96 | 替换同名游戏模型；旧源保留 |
| `sphere3` | `MediumMortar` | 中型迫击炮，具体型号未明 | 截图标注后新增 |
| `Wp_Gun_Karabiner 98 Kurz` | `Karabiner98k` | 源节点直接给出 Karabiner 98 Kurz | 新增 |

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
