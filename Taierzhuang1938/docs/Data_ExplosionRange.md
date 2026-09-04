# 爆炸测试场与通用地形形变

入口：主菜单或暂停菜单的「测试场景 → 爆炸测试场」，直达 `?explosions=1`。
独立关卡 `ExplosionRange`，不推进正片章节；几何在 `Script_ExplosionRangeField.mjs`，
工位、排列、炮击与空袭配置在 `Data_ExplosionRange.mjs`。

## 操作

| 工位 / 情况 | 操作与结果 |
| --- | --- |
| 手榴弹桌 | F 领取；种类从 `WEAPONS` 的 throwable 项自动列出，使用正式库存与模型 |
| 木柄 / 集束手榴弹 | 按住 G / H 蓄力，松开投出；走正式投掷物、引信、伤害与爆炸链 |
| 横排日军战车 | 到车尾按 F，每次交互仅发射一枚向前飞行的炮弹；目录跟随 `WEAPONS` 的日军 vehicle 项 |
| 绿色台 | 投来一枚活手榴弹，练习靠近后 F 拾起返掷 |
| 橙色台 | 呼叫远程炮击；每发发射时按玩家当前位置采样圆盘落点，范围读 `EXPLOSION_BARRAGE.radiusM` |
| 紫色台 | 召唤飞机进场，从机腹释放测试弹，然后爬升飞离；散布读 `EXPLOSION_AIRSTRIKE.radiusM` |
| 蓝色台 | 清除在途弹、炮坑与召唤中的飞机，恢复原地形 |

飞机默认不盘旋。只有紫色台呼叫后才出现一架已有轰炸机模型；飞离后重新允许呼叫。
测试弹从飞机的实际位置释放，继续走 `CombatSystem.FireShell`，不是定时在地面播放爆炸。
这里空投的是已有 `Shell75` 测试弹响应，不将其宣称为历史航空炸弹型号。
两类召唤均使用确定性圆盘散布，按每次释放时的玩家位置取样，落点留在场地内。

炮坑通行区有正式 Soldier/Actor 往返走动；`dummy` 只关闭自主交战决策，
寻路、运动学胶囊、重力和脚部 IK 仍运行。士兵死亡后会补回，便于反复实验。

## 共用入口与契约

- `CombatSystem.Blast` 是正式爆炸入口：伤害、建筑破坏、特效之后，将爆炸位置与
  `explosiveId` 交给当前场景的 `deformation.ApplyBlast`。木柄、集束、战车炮、掷弹筒、
  支援迫击炮和远程炮击均有独立目录映射；不要直接改坑深来冒充一次武器爆炸。
- `FireShell` 用连续弹道和分段扫掠命中实际地形 / 障碍物；亮芯与尾迹是表现层。
  撞墙会提前引爆；在高处爆炸对土地的作用随离地间距减弱，超出 `groundReachM` 不挖地。
- `Script_GrenadeReturn.mjs` 给各关注册高优先级交互。距离、垂直差、遮挡、离手宽限、
  剩余引信与拾取动作时长由 `GRENADE_RETURN` 管。F 拾起后按当前瞄准方向自动返掷，
  **沿用同一枚 Projectile 与原引信**，不补库存、不重置倒计时；已经来不及的弹不给交互。
- `TerrainDeformation` 只存稀疏高度差。基础高度仍由关卡提供；界河仍来自
  `SampleJieheHeight`，没有第二套地形公式。基础节点缓存随 Reset / 换关清除。
- 各场景的 `GroundHeight` 在已分配块内使用同一格点和三角对角线插值；渲染、
  Rapier、玩家、NPC、子弹与 IK 共用。`BaseGroundHeight` 只用于原始地形 / 建筑分类。
- `TerrainDeformationView` 只重建脏块，裁掉原地表覆盖部分，再提交局部网格与同顶点
  的 Rapier trimesh。洞在主画面、阴影和深度通道都存在。保留原地表几何以供复原。
- 土路、耕地与薄地表层按同一格网局部细分，保持原 UV 与边界，随坑底下降。
  识别名单在 `GROUND_OVERLAYS`；新增地表材质须登记并补可见表面 / 碰撞对账。
- 连续爆炸只加深或扩大已有坑，不会把旧坑填平。深度上限、格距和坡度约束都读
  `TERRAIN_DEFORMATION`。坡度松弛通过扩大坡面维持通行，不把坑作为导航障碍盒。
- 建筑地基、实体路基、桥、工位与水面受保护；土层方案不负责掏空建筑基础或开挖洞穴。
  静态导航分类读基础地面，避免地面下降把矮物重新认成堵路高墙。
- 换关或重新载入会清除炮坑。当前没有跨会话炮坑存档；蓝色台提供本关即时复原。

## 考据与调参边界

`Data_Explosives.mjs` 的 `fillingKg` / `evidence` 记录参照弹药；
`craterRadiusM`、`craterDepthM` 和 `groundReachM` 是干土表面爆炸的游戏调参，
不冒充实测弹坑，也不把破片杀伤半径当成坑径。落地炮弹比手投弹有更强的地面耦合；
集束、较大口径通常挖出更大土体。各弹种的地形响应与原有人员伤害数值分开维护。

| 游戏目录 | 依据与可信度 |
| --- | --- |
| `Grenade` | [斯洛伐克军事历史研究所 M24 藏品](https://ebadatelnavhm.vhu.sk/item/9/31)；用作木柄弹能量参照，不声称中国各兵工厂装药完全相同 |
| `GrenadeBundle` | 按已有游戏模型的弹头数与木柄弹参照量组合，属于游戏估计 |
| `Shell37` | [美军《Japanese ammunition data》，1945，印刷页 22](https://www.bulletpicker.com/pdf/Japanese-Ammunition-Part-4.pdf)：九四式榴弹装药 |
| `Shell57` | [TM 9-1985-5，印刷页 300](https://www.bulletpicker.com/pdf/TM-9-1985-5.pdf)：九〇式高爆弹 |
| `Shell50` | [同册，印刷页 372–373](https://www.bulletpicker.com/pdf/TM-9-1985-5.pdf)：八九式掷弹筒榴弹；扫描文本标题口径有 OCR 错误，正文口径与武器对应 |
| `Shell75` | [同册，印刷页 321](https://www.bulletpicker.com/pdf/TM-9-1985-5.pdf)：九四式野炮榴弹参照 |
| `Shell82` | [美军《Catalog of Standard Ordnance Items》，1944，Vol. 3，M43A1 条目](https://www.bulletpicker.com/pdf/Catalog-of-Standard-Ordnance-Items-Vol-3.pdf)：邻近口径迫击炮弹量级参照；未取得游戏中方弹药的具体批次装药记录 |

技术路线参考 [DICE / Frostbite 的 SIGGRAPH 地形渲染资料](https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/chapter5-andersson-terrain-rendering-in-frostbite.pdf)
中的局部高度场破坏和脏区域更新。本实现是适合浏览器与现有关卡的稀疏 CPU 高度场，
没有宣称复刻商用引擎的完整 GPU 管线、体素破坏或真实土壤力学。
返掷的交互参考 [Call of Duty 官方手册](https://cdn2.callofduty.com/assets/codbo/pdf/COD_NDS_OMAN_US_v4.pdf)
中的附近手雷提示与返掷动作；具体时间窗与持续引信规则以本项目配置为准。

## 验收与取证

```powershell
node Taierzhuang1938/Script_ExplosionRulesTest.mjs
node Taierzhuang1938/Script_ExplosionRangeTest.mjs
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master --profile=prepush --fail-fast
```

纯规则测试覆盖目录完整性、威力层次、叠加、上限、坡度、分块接缝、地基与返掷窗口。
浏览器测试通过正式 F / G / H 输入验证库存、单发战车、持续引信、两种召唤、飞机退场、
真实网格 / Rapier 射线、玩家和 NPC 穿坑，并在正片道路与界河高程上再做表面对账。
截图和 JSON 报告落在 `_shots/ExplosionRange/`；JSON 同时保留形变耗时供性能复查。

调试入口：`Debug.Explosions.State()` / `GoTo(id)` / `Reset()`，通用查询为
`Debug.TerrainDeformation.State()` / `Height(x,z)` / `BaseHeight(x,z)` / `Reset()`。
