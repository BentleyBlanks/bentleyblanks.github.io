# 第一关硝烟实体源头（2026-09-27）

64 处既有远近景烟源各配一个地面燃烧物：8 辆八九式毁伤坦克、15 辆烧毁货车、18 处油桶火堆、26 处焦木堆（另有 18 处油桶火堆共用矮木堆）。布设种类、朝向、比例按烟柱 seed 固定，过检查点和跳阶段不重新散布。

坦克复用 Type89Tank 与 Type89Damage 的断履带、掀开发动机甲板和落地碎件，取实际发动机出口世界坐标对齐烟根。货车为代码生成的短引擎盖、空驾驶室、扭曲车顶、露天木车斗、轮毂与焦黑薄板。四点采样共享地面高度；地上瓦砾逐件采样。每处底部有低矮实体碰撞，主路线外至少保留 1.2 米人行净空。

`Data_FirstLevelSmokeOrigins` 保存稳定布设，`Script_FirstLevelSmokeOrigins` 在 FirstLevelMissionView 生命周期建造 / 销毁。SeedSmokeColumns 从实例获取真实起火点，给已有烟柱加四个窄烟团；原有六种大烟形、颜色层次与风向保留。高处漂移烟从地面燃烧物以窄烟根相连。

静态残骸经 BuildSink 按 64 米区域与材质合批：全图约 106,200 三角面（09-30 焦木堆换 Blender 模型后；此前 93,084）、165 个可视锥剔除批次，走普通不透明深度、阴影和运动历史。坦克只用于生成静态批次，不增加战车 AI。

动态火焰复用 Vfx 的既有侵蚀火焰材质，独立 `battleFire` 容量 low 1024 / medium 1536 / high、ultra 2048；不占 combat/sourceFire 池，不额外创建 64 盏点光。燃烧源预填充、清空后重启、检查点时间归零与最后源头删除均有验证。火焰 HDR 色与预算在 Data_Tuning_BattleSmoke；透明批次保留目标 alpha，不进法线深度预通道。

验收入口：

- `Script_FirstLevelSmokeOriginsTest`：全 64 处出口对齐、道路净空、地形高度、面数、火焰容量隔离、重置、删除与碰撞清理。
- `Script_FirstLevelDistantSmokeTest` / `Script_FirstLevelDistantSmokeBrowserTest`：原六种烟形、道路、体积动态和遮挡。
- 实机白盒 stage 4：前方货车、取弹沟坦克、白烟火堆；GPU 错误为 0。截图与六秒动态证据仅留任务本地 outputs，未混入部署资产。

## 焦木堆（2026-09-30）

旧版焦木堆是 11 根等粗方条，每四根整根平涂 `0xce3708` 自发光，泛光一推就成了一条条纯红棒，旁边是纯黑棱块碎石。现改为：

- 模型：`_blender/Script_BuildBurntTimberPile.py`（BlenderMCP）建 A/B 全堆（约 540 三角）与 C 矮堆（约 250）。六棱梁木、两端参差、沿长微弯，另有斜靠大梁、外散断木、薄木板；`coals` 只有缝里 3–5 块炭核，`ash` 是堆底一层灰烬盘。导出成 `Data_BurntTimberPile.mjs`（毫米整数位置、×127 法线、×1000 UV，同步读取，构造函数不必异步）。源 `.blend` 在 OneDrive `AI/Models/Blender/Taierzhuang1938/BurntTimberPile_20260930/`。
- 贴图：Lovart 生成焦炭木（龟裂炭皮、缝里零星暗红余烬），`_import/Prompts/Texture_CharredTimber.txt` → `Script_BakePbrTexture.py --preset charredWood`（新增材质类），登记在 `Data_TextureManifest` 与 FirstLevel 按需集；没下到时回退 `WoodBeam`。
- 材质：木料不再发光；炭核 `emissiveIntensity 0.16`，火光由既有火焰 VFX 负责。灰烬盘与地面碎块改成灰、砖、焦三色小块。
- 三角预算断言从 100k 放宽到 110k（+约 1.3 万三角，全部按材质合批）。
