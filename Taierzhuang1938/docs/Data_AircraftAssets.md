# 日军航空器资产来源

本页记录 `Script_Aircraft.mjs` 使用的远距飞行器模型。它们只作为天空中的视觉编队，
不提供碰撞、伤害、索敌或剧情结算。

| 游戏内资产 | 原始模型 | 作者 / 来源 | 许可与署名 |
| --- | --- | --- | --- |
| `Model_MitsubishiKi30.glb` | [Mitsubishi Ki-30](https://sketchfab.com/3d-models/mitsubishi-ki-30-4d7838f0a8134995a6bc3d9d341f78be) | Burak Mescioglu / Sketchfab | CC BY 4.0；署名 Burak Mescioglu。 |
| `Model_MitsubishiKi21Ia.glb` | [Ki-21 Japanese Type 97 Heavy Bomber](https://www.cadnav.com/3d-models/model-40943.html) | CadNav | 按随下载附带的 `readme.txt`：可作为 artwork / project 的组成使用及修改；不得单独转售或再分发；署名 cadnav.com。 |
| `Model_NakajimaKi43.glb` | [Ki43](https://sketchfab.com/3d-models/ki43-abdc04cc7afb4aeba0eaac6c5079d6e6) | manilov.ap / Sketchfab | CC BY 4.0；署名 manilov.ap。 |

## 机型说明

Ki-30 与 Ki-21 分别保留为九七式轻轰炸机与九七式重轰炸机。九七式战斗机 Ki-27
没有找到适合公开站点使用的可下载许可，因此以同属日本陆军航空队的中岛 Ki-43
“隼”作临时战斗机替代；它在游戏与代码中明确标为替代品，避免误称为 Ki-27。

Ki-43 1939 年才首飞，放在 1938 年 3 月是错的，而且它只有一个纯色远景材质，拉到近处就是一块绿。
正片第一关（完整任务运行时）的两轮空袭因此统一用 Ki-30，机型只在
`Data_FirstLevelMission.MISSION_AIRCRAFT_ID` 一处；速度与航线数值在 `Data_Tuning_FirstLevel` 的 `air*`。
按日方档案，滕县一带实际出动的是内田中队的八八式侦察机（双翼），见 `Data_TengxianCity.md`；
仓库里还没有这个模型，Ki-30 是现有模型里时间上最接近的（1938 年春开始在中国参战）。

## 朝向

三件源 GLB 没有一件把机首放在局部 -Z：Ki-30 与 Ki-21 机首朝 +Z，Ki-43 的机身主轴在
XZ 面上斜着（机首指向约 (-0.851, 0.525)）。`Data_AircraftAssets.mjs` 每条记录用
`noseDir` 写明源模型机首在局部 XZ 面的方向，`Script_Aircraft.mjs` 的 `PrepareAircraft`
按它把模型套在一层 `NoseAlign` 节点里转到 -Z 机首，此后绕圈、扫射与召唤投弹的
yaw/climb/bank 换算只认 -Z 一个约定。这些方向是用顶点云量出来的（螺旋桨盘一端、
尾翼一端），换模型时重量，不要凭肉眼猜。2026-09-05 前三架都在倒着飞。
闸门：`node Taierzhuang1938/Script_ModelFacingTest.mjs`（快速 Tier 0，纯 Node）用顶点云
复量每架的机首方向，与 `noseDir` 对不上或对齐后不在 -Z 就红；新增机型必须先过它。

## 转换

下载授权由 BlenderMCP 的 Sketchfab 连接取得。运行时 GLB 由
`_import/Script_ImportAirAssets.py` 用 Blender 导出；Ki-30 进行了减面和贴图尺寸优化，
Ki-43 合并为单一远景材质。原始下载文件不随站点发布。

## Ki-30 运行时尺寸与朝向

2026-09-05 真实 GLB 顶视检查发现 Ki-30 机首朝局部 +Z，源翼展仅 4.933 米。
`Script_Aircraft.mjs` 在独立适配组内转向 -Z，并按 `wingspanM: 14.55` 等比缩放、重新居中。
该数值是当前白盒的尺寸校准参数，不作为已由原厂图纸核实的精确机型尺寸；网格原比例保留，
2026-10-09 对保留源 GLB 与减面后 GLB 复量，实际包围盒均为 14.550 × 2.662 × 10.140 米。
此前本页 3.303 米高度记录与当前源资产不符，此处只纠正文档；源包围盒没有改变。其余机型保持原缩放。
模型变换不修改航迹、速度、扫射阶段或伤害。螺旋桨实际位置另与带爬升、滚转的航向核对，
避免只检查根节点旋转就把尾部向前的模型算作通过。

`Script_FirstLevelP012BrowserTest.mjs --air-model --air-route=open` 提供明确局部检查：
模型近景只用于尺度／朝向，B16 初始化后的实际输入和玩家相机用于转弯画面；两者都不是整关验收。


## Ki-21 / Ki-30 几何优化（2026-10-09）

本次只改两机几何、离线重建与资产校验，不改玩法。基于 `5e26010` 的源 GLB；原始高模与
Blender 工程保留在本次云端交付工程包，未放入站点仓库。Source .blend 是从这两份原始
GLB 导入并打包贴图形成的可编辑工程，不是另行取得的作者原始 DCC 工程。重建输入可从该提交提取，
不应把已减面的运行时 GLB 再当输入。源、输出 SHA-256、逐 primitive bbox、保护部件与
每张原图哈希见 [`Model/Data_AircraftGeometryAudit.json`](../Model/Data_AircraftGeometryAudit.json)。

### 最终预算与实测

| 指标 | Ki-21 原始 → 本次 | Ki-30 原始 → 本次 |
| --- | --- | --- |
| 三角面 | 102,831 → **86,944**（−15.45%） | 37,797 → **14,457**（−61.75%） |
| GLB 导出顶点 | 272,798 → **95,796**（−64.88%） | 25,208 → **12,040**（−52.24%） |
| primitive / 材质 | 8 / 8 → 8 / 8 | 4 / 1 → 4 / 1 |
| 源 GLB 字节 | 12,082,196 → **6,255,588** | 8,173,484 → **7,612,044** |
| 几何缓冲字节 | 9,867,442 → **4,040,538** | 1,033,438 → **472,022** |
| 内嵌原图字节 | 2,204,531 → 2,204,531 | 7,134,434 → 7,134,434 |
| 相同 KTX2 发布流水线字节 | 12,080,604 → **6,254,004**（−48.23%） | 5,678,228 → **5,116,792**（−9.89%） |
| 场景包围盒尺寸，适配前 | 22.510000 × 4.248002 × 15.900002 m，精确不变 | 4.933041 × 0.902463 × 3.437829 m，精确不变 |

大小统一为 bytes（十进制 MB 请除以 1,000,000），几何字节是 accessor 对应的唯一 bufferView 之和。
Ki-21 场景 AABB 为 `[-11.255000,0.001000,-7.950001]` 到 `[11.255000,4.249002,7.950001]`；
Ki-30 为 `[-2.466520,-0.244979,-1.658658]` 到 `[2.466521,0.657484,1.779171]`。
各 primitive 的全部精度边界与节点变换保持一致。两机源机首仍为 +Z，游戏的 `NoseAlign`
仍适配到 -Z，Ki-30 的 `wingspanM:14.55` 不变。

Ki-21 的 20–30k 初始试验预算不能保住原外观。全局 collapse、planar dissolve 与跨整壳
简化均被近景复核拒绝（蒙皮破口、UV 三角斑、窗缘黑缝）。按用户允许提高 budget 的要求，
最终采用 86,944 三角的部件保护方案；不是只清法线，也没有为了达到数字接受破损。
Ki-30 选预算高端的 14,457 三角，放弃 11,203 三角试验版较生硬的座舱框。

### 几何处理与保留项

- Ki-21 原资产全部 102,831 个三角的三个角法线相同，造成大量平滑曲面的导出拆点。
  仅在一个 primitive 内、同位置且两面方向相反的唯一相邻边端点重建连续拓扑，不作距离焊点。
  UV 仍按 corner 保留；35° 显式硬边与 UV seam 保留，不做全机无条件平滑。
- 先删 638 个同绕序、POSITION/NORMAL/UV 全相同的不透明重复三角，反面壳与薄片不删。
  再由 meshoptimizer 1.3.0 对同 primitive 的独立小组件逐件简化，使用 UV/法线误差权重、
  每件非零尺寸轴的极值锁定、PreserveFolds。只选择原顶点，不搬动位置。
- ≥500 三角或长边 >2m 的大组件完整保护，因此主机身、翼/尾翼蒙皮及主要发动机外壳不被全局压缩。
  黑色玻璃、透明 primitive 4/6、≤12 三角小薄片、前方桨毂及机顶环天线另行保护。
  最终每个源连通组件仍存在，无跨组件新三角、退化面或非有限值；候选的每个 POSITION+UV
  二元组均来自源资产。有限射线可见性审查没有证明大量内部件可安全删除，本次删除内部部件 **0**。
- Ki-30 主体与座舱框分开处理，玻璃和螺旋桨的所有 attribute / index 数组逐值保留。
  四个 primitive 均在，材质、纹理、sampler、节点、单位与 UV 布局不变。
- 12 张 Ki-21 原图与 3 张 Ki-30 2048² WebP 逐字节保留。源图转发布图仍由既有
  `Script_BuildPublishAssets.mjs` 执行，不通过重烘纹理掩盖 UV 错误。

### 贴图与显存口径

Ki-21 的 4096² 颜色 JPEG（1,573,224 bytes）按原 compact-source 策略保留；发布阶段仍仅把
64² 的 image 9 转 ETC1S KTX2。Ki-30 仍把 2048² normal 转 UASTC、baseColor 转 ETC1S，
ORM 的原 WebP 保留。前后采用图、分辨率、mip 与编码哈希相同。
**减面没有降低贴图显存。** 按 RGBA8 和完整 mip 链估算，Ki-21 那张 4096² JPEG 解码占
89,478,484 bytes（85.33 MiB）；12 张图合计 124,103,328 bytes（118.35 MiB），
发布阶段 64² KTX2 仅另省约 19,100 bytes。此为格式估算，不是 GPU 驻留实测；实际设备压缩格式另受能力选择影响。

### 重建

先在仓库根执行 `npm install`（meshoptimizer 固定 1.3.0），将以下两个原始文件从 Git
基线取到仓库外的独立 Source 目录：

```sh
ARTIFACTS="$(cd .. && pwd)/AircraftRebuild" # 必须在仓库外
mkdir -p "$ARTIFACTS/Source" "$ARTIFACTS/Output" "$ARTIFACTS/Blender"
git show 5e26010:Taierzhuang1938/Model/Model_MitsubishiKi21Ia.glb > "$ARTIFACTS/Source/Model_MitsubishiKi21Ia.glb"
git show 5e26010:Taierzhuang1938/Model/Model_MitsubishiKi30.glb > "$ARTIFACTS/Source/Model_MitsubishiKi30.glb"
blender -b --python Taierzhuang1938/_import/Script_OptimizeKi21.py -- --source "$ARTIFACTS/Source/Model_MitsubishiKi21Ia.glb" --output "$ARTIFACTS/Output/Model_MitsubishiKi21Ia.glb" --blend "$ARTIFACTS/Blender/Optimized_MitsubishiKi21Ia.blend" --source-blend "$ARTIFACTS/Blender/Source_MitsubishiKi21Ia.blend" --report "$ARTIFACTS/Output/Ki21Report.json"
blender -b --python Taierzhuang1938/_import/Script_OptimizeKi30.py -- --source "$ARTIFACTS/Source/Model_MitsubishiKi30.glb" --output "$ARTIFACTS/Output/Model_MitsubishiKi30.glb" --blend "$ARTIFACTS/Blender/Optimized_MitsubishiKi30.blend" --report "$ARTIFACTS/Output/Ki30Report.json"
```

Ki-30 的完整参数以 `--help` 为准（工程包附实际命令）。两个入口都拒绝错误的源 SHA-256，
也拒绝输入/输出同文件。正式 Ki-21 默认参数的第二次重建与候选 SHA 完全一致；Ki-30 从
保留源 GLB 或源 .blend 重建也逐字节一致。Ki-21 的 companion `Script_OptimizeKi21Parts.mjs`
不是另一个可随意重复减面的入口。

本次使用云端 Linux Blender 4.3.2；仓库 Windows BlenderMCP `status --scan` 已实跑并明确
报告只支持 Windows，因此本机 OneDrive 工程路径不适用于本次。Windows 后续重建仍遵循根
AGENTS 的 start / exec / stop 独占工作流。云端各次 headless Blender 完成后退出，未接入用户本机游戏。

### 验收边界

- 双机原始/最终同镜头八方向 1280×720 渲染，含机腹、座舱、发动机近景及远景；独立复核通过。
  查看使用独立的等比长边 ≤640 预览，原图不改布局，不上传也不提交验收截图。
- `AircraftGeometryTest` 新增纯 Node 门禁：源图片/节点/材质/保护 geometry 哈希、逐 primitive
  原始 bbox、合法索引、单位法线、无退化面、实际三角降幅及朝向/翼展配置。
  同时运行 ModelFacing、AircraftStrafe、FirstLevelAirRaid、EmbeddedTexture、AssetStandards、
  PublishAssets、ModuleGraph 与 TestRunnerTest；结果及实际发布数字记录于交付报告。
- 云端 `MotionVectorContractTest` 的 `attached:bone deformation/attachment` 断言失败，
  在未修改的 `5e26010` 原始 master、原两机资产上逐项复现同一结果：预期 8 px，
  minX 约 0.00011444、maxX 7.998046875、maxDepth 2。这一 fixture 不加载飞机；
  记录为本环境既有 GPU 基线失败，没有放宽断言，也不宣称全绿。
- quick 自动选测在 CharacterSpeechTest 的既有汉字拼音覆盖断言失败（“呃啊”）；
  原始 5e26010 基线同样复现，未修改该人物系统，未宣称 quick 全绿。
- 实际第一关 high 空袭：延长云端软件 GPU 启动等待后，Ki-21 六机编队在阶段 04 /
  heavySquadron 的前六段完成（进场、投弹、下落、初次落地、18 枚全部落地、烟柱）。
  首轮第 5 张截图 API 失败；补验去掉无关的连续性能采样并加截图重试后越过该处，
  第 7 段在未修改的 AI 曳光粒子路径（TryFire → Tracer → ParticleChannel → EmitRecord）
  抛 `particle.life: expected finite number in [0.001, 100000]`。原代码已独立复现同类
  近距寿命边界缺陷，但浏览器该次没有记录 dist/life，也没有完成原版整航线 A/B；
  不能据此完全排除飞机变化的间接因果，**整条 high 探针未通过**。没有修改粒子代码或关闭 AI。
  Ki-30 high 冷启动在浏览器 Target crashed 后终止，尚无最终路线实拍；不以离线八视图代替。
  不再同配置反复预热，后续可用工程包内的同画质验收脚本继续复核。

### 本机接回与补验（2026-10-10）

上述云端失败为历史交付边界。本机接回时对交付 ZIP 及 71 个文件完成 SHA256 校验，
独立复量两架 GLB 的面数、顶点、材质、图片字节、节点和逐 primitive 包围盒，
并重新渲染四个近景方向和远景对照，未见明显破面或轮廓损失。候选 GLB 的哈希未改。
Ki30 可编辑工程存于约定的 OneDrive Blender 目录下
`Taierzhuang1938/MitsubishiKi30/Dot20261009/`；Blender 工程与验收截图不进入仓库。

在 `00d646e7` 运行时上接入候选并修复极短曳光寿命后，Ki30 原版与候选均跑完 stage 04 /
lightPair 的七阶段 high 探针。空袭层单独固定种子 20261010，双方航线计划及逐阶段空袭状态
完全相同，12 枚炸弹全部落地，零页面错误；仅固定全局 Math.random 不足以保证异步加载后的
空袭种子一致。Ki21 候选的 heavySquadron 七阶段也完成，六机 / 18 枚落弹，零页面错误。
这是受控阶段探针，不是整关正常通关证明；实际截图保留烟云遮挡，不用它冒充模型近景验收。

本机 MotionVector 49 项 GPU 场景、ParticleChannels、VehicleTracer、TracerLifetime、
AircraftGeometry、ModelFacing、EmbeddedTexture、AircraftStrafe、FirstLevelAirRaid、
ParticleModules、AssetStandards、ModuleGraph、TestRunner 和 PublishAssets 均通过。
完整 prepush 仍在既有 CharacterSpeechTest 的“呃啊”音素覆盖失败处停止，未声明全仓全绿。
GPU 发布浏览器回归同时覆盖 Ki21 和 Ki30，继续保留原分辨率和自动发布压缩策略。
本机完整发布构建和产物校验通过（45 张独立 GPU 贴图、11 个 GLB）；浏览器实际解码两机的
GPU 图、RGBA 回退和原逻辑路径映射均通过，包围盒一致、无 WebGL 错误。Windows 编码产物
Ki21 为 6,254,004 bytes、Ki30 为 5,116,992 bytes；Linux CI 编码的最终字节数以线上报告为准。
