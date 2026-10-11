# 接收院 M15 / M16 模型

2026-10-11，第一关资产盘点后的定向制作。只替换阶段 16–17 接收院的药柜、药架、药桌、凳子和医疗容器；不改任务、人物、灯具、床铺、碰撞或担架走廊。

## 资产与接入

`Model/Model_WardProps.glb` 内含 11 个可复用根节点：

| 节点 | 内容 |
| --- | --- |
| WardMedicineCabinet | 12 个抽屉、双柜门、框架、木板、铁环拉手与留白纸签 |
| WardStockedShelf | 三层药品、底层包扎用品、独立层板与背板 |
| WardTreatmentTable | 旧木药桌、抽屉、四腿和撑档 |
| WardWoodStool / WardWoodBench | 方凳、长凳 |
| WardAmberBottle / WardGreenBottle | 棕／绿色软木塞药瓶、曲面纸签 |
| WardCeramicJar | 带盖陶药罐、露胎足圈 |
| WardEnamelBasin | 蓝边搪瓷盆、真实盆腔、卷边和少量磕碰 |
| WardBandageRoll / WardDressingBundle | 有中心孔的卷纱布、折叠包扎布 |

总计 44,524 三角，GLB 约 2.20 MiB。精确尺寸、三角数、字节和 SHA256 在 `Model/Data_WardProps.json`。原点为脚底，米制，Y 向上、正面 -Z。

登记 `Data_ExternalAssets_WardProps` → `Script_ExternalProps`。第一关通过 `Data_FirstLevelPropDressing.WARD_PROP_DRESSING` 的 17 条规则替换 42 块旧占位；货架的旧层板和“药瓶长条”随主体一起隐藏。新模型沿用原盒的并集摆位、缩放限制和合批。`flipFacing` 只额外转 180°，北墙柜架及隔墙南面的药桌朝 +Z，隔墙北侧架子和南墙灯桌朝 -Z；不改变外观包围盒或碰撞数据。

其中六块是旧版 `WardShelf-28/-25/-22` 及 `WardMedicalRoll`，它们与后加的柜、架、箱堆重复；实景中会穿进药架下两层。`hideOverlaps` 在新模型成功布设后只隐藏这些重复外观，不把它们并进新柜架的尺寸、不删碰撞。此属性的条目同样接受存在性、重复占用及交互保护检查。

木构使用既有 `VillageTimber` Base / Normal / ORM，保留作者 UV。药瓶、陶器、搪瓷、软木、铁件、纸和布使用各自的 glTF 材质，不经过 Stone / Sandbag 替代。药瓶采用不透明有色表面以兼容静态合批和预通道，未使用玻璃透射；纸签留白，没有虚构药名。材质和标签可在源工程继续编辑。

## 重建

源工程：`C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\WardPropsM15M16\Scene_WardProps.blend`。

```powershell
node scripts/Script_BlenderMcp.mjs start --task WardPropsM15M16
node scripts/Script_BlenderMcp.mjs exec --code "import runpy; runpy.run_path(r'<本任务worktree>/Taierzhuang1938/_blender/Script_BuildWardProps.py', run_name='__main__')"
node scripts/Script_BlenderMcp.mjs stop --save
node scripts/Script_BlenderMcp.mjs status --scan
```

生成器按当前脚本路径定位仓库；`WARD_PROPS_SOURCE_DIR` 可覆盖源工程目录，`WARD_PROPS_RENDER=0` 可跳过两张审阅图。源工程保留分件，导出时复制、合并，不损坏可编辑组件。脚本拒绝覆盖其他已打开的 Blender 文件。截图在源目录 `Review/`，不进仓库。

Blender 5.2 会导出 MixRGB 乘色前的原 WebP，但漏掉乘色常数。生成器在导出后将相同线性颜色写入标准 `baseColorFactor`；不改变图片像素、分辨率或几何。门禁核对乘色，防止 Blender 内与游戏内木色不一致。

## 验收

- `Script_WardPropsTest`：11 个节点、作者 UV、尺寸和哈希、材质、真实盆腔／桌腿／药架空隙、17 条摆位、42 块占位隐藏、柜架朝向、碰撞数据不变。
- `Script_FirstLevelPropDressingTest`：全部道具模型读取、配盒误差、缩放和路线净空。
- `Script_ModuleGraphTest` / `Script_AssetStandardsTest` / `Script_TestRunnerTest`：登记、缓存戳和资产预算。
- `Script_WardPropsShots`：静音浏览器从本任务 LocalPreview 打开第一关 high 画质，检查实际材质及替换表，并拍柜、架、桌和全景；只输出 `_shots/WardProps/`。
- 新静态模型沿用 `BuildSink`，仍需采样器和 MotionVector 浏览器门禁。

本套不替换 M17 床铺、M18 布帘、M19 灯具，也不改接收院外围已正式化的桌、箱、筐与缸。

2026-10-11 本次检查：模型专项、道具配盒、外部资产、规范、模块图、MotionVector、发布资产检查及第一关 low / medium / ultra / whitebox 四档采样器检查通过；接收院 high 实景已核对柜、架、药桌和盆。按 firstLevelDressing 选择的 prepush 在 `CharacterSpeechTest` 遇到既有 `HAN_PINYIN` 缺“呃、啊”失败，已在干净的 master `0a576962` 复现；其余待执行的 57 项另行执行通过。未修改口型数据或削弱原断言。
