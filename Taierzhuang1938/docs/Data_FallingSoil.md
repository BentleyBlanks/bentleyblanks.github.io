# 共用落土：不同程度的漏灰、漏土与崩落

入口：高级工具 → 特效与声音 → 特效预览，效果库选择以 **落土** 开头的七种预设。推荐直达 `/Taierzhuang1938/?editor=tools&tool=vfx&effect=SoilCeilingShake&quality=high&audio=0`：沿用现有工具首页的 `tool=vfx` 路由，不先构建整关；`audio=0` 只关闭此视觉预览的声音。白盒模式也临时保留特效原材质，退出恢复；完整光照按 high 验收。需要挂着第一关宿主检查时仍可用 `?whitebox=p012&editor=vfx`。

本轮只交付共享效果与现有编辑器接入，不改第一关 01/05 剧情，不自动替换其历史落土实现。程度与情境共用同一实现，没有按关卡号分叉。按实拍特征调整的外观、粒径、阻力和时序均是美术近似，未按真实土质、质量流量或空气动力学进行物理标定，也不作为历史测量。

2026-10-26 首轮按用户否决意见重做美术，并修复尘层继承烟预热而提前过期的问题；续调增加轻漏灰、少量细土、明显落灰、较重崩落四档，保留原三种预设 ID。实拍来源、形态口径、前后对照与复查脚本见[落土视觉对照](Data_FallingSoilReference.md)。

## 七种预设

| 预设 ID / 标签 | 程度与用途 | 区分方式 |
| --- | --- | --- |
| `SoilDustSift` / 轻微漏灰 | 极轻；窄缝筛下浮灰 | 4.5 秒柔弱起落，薄体积尘为主；少量 0.12–0.65 mm 微粒，无土块，缓慢漂散，不产生二次触地尘。 |
| `SoilFineTrickle` / 少量细土 | 轻；局部缝口间断漏细砂 | 4.8 秒不规则疏密变化，0.3–1.8 mm 细粒、稀薄下落尘，无土块，小量地面留存。 |
| `SoilDustFall` / 明显落灰 | 中灰；顶部浮灰松动 | 3.8 秒柔散下行，灰多土少；少量 0.18–0.9 mm 微粒、无土块，较宽薄体积尘缓慢消散，仅有极弱触地响应。 |
| `SoilPlankLeak` / 板缝漏土 | 中轻；负重经过木板 | 逐段间歇脉冲；0.4–2.1 mm 细粒、少量 6–18 mm 土块，薄尘与低触地响应。持续播放到停发，6.3 秒为强度曲线周期。 |
| `SoilCeilingShake` / 洞顶震落 | 中；震动后面状落土 | 2.8 秒先密后疏，0.65–3.5 mm 细粒混合 7–32 mm 土块，短促下落尘和低薄触地尘。 |
| `SoilHeavyCrumble` / 较重崩落 | 重；局部松土短暂崩散 | 2 秒集中释放，0.6–5 mm 细粒混合更多 10–60 mm 土块；有限碎裂、更多留存，碰地后横向低扩散，无持续上升烟柱。 |
| `SoilBrokenEdge` / 断口余土 | 余落；崩口逐渐停歇 | 7.5 秒稀疏长尾，边缘发射；0.5–3 mm 细粒和偶发 12–50 mm 土块，弱尘、散落后停稳。 |

粒径范围为配置中的渲染尺度，不表示严格球形直径或质量。中重档允许少量较粗颗粒，但尺寸采样偏向细粒；预设差别同时来自粒径分布、通断节奏、初速/阻力、尘土比例、碰地响应和留存时间，不能按发射总数直接解释为物理重量。每档的尾部仍由已有粒子的运动、接触与寿命自然结束。

## 参数与编辑

`Data_Tuning_FallingSoil.mjs` 是预设、参数、字段范围与预算的纯数据源。`FALLING_SOIL_SCHEMA` 同时驱动界面与输入校验，字段和默认值逐项对应；拒绝未知字段、错误类型、非法曲线或越界值。

- 来源：点、线/板缝、面/洞顶；宽长、位置（Y 即高度）、XYZ 旋转；均匀、成股、逐段、边缘分布；股数、股宽、边缘集中度和种子。`flowVariation` / `flowFrequency` 控制各股通断强弱与频率，避免固定等距土线一直贯穿。
- 时序：单次衰减、持续、间歇脉冲；延迟、时长/曲线周期、频率、每次数量倍率、脉冲开关间隔与强度曲线。`variation` / `variationFrequency` 控制整源疏密波动，与每股通断分别调节；固定种子仍可复现。各层每次量可小于 1，以固定步长累积出稀疏土块。
- 三层：独立开关、尺寸/初速/寿命随机区间或曲线、散布、重力倍率、阻力、颜色/透明度、存活上限；环境控制重力、世界风速和扰动。`sizeBias > 1` 使随机尺寸区间偏向小粒；`sizeDrag` 使较小颗粒受更多阻力、较大颗粒更快落下，作用倍率有界，属于艺术近似。
- 土块：翻滚、碰撞开关、停止/弹跳/有限碎裂；弹性、摩擦、低速门槛、停止等待、弹跳次数；碎裂概率、撞击门槛、子块数/尺寸/散射速度及起尘强度。
- 尘：密度、扩散、漂移、淡入/淡出；接触扬尘数量、尺寸和短暂扬起速度；默认没有持续浮力。
- 预算：数量、距离/减量距离、画质倍率、每步射线数、细砂碰撞分段、表面缓存时间/网格及关闭细砂碰撞的选项。

「落土参数」沿用现有滑杆、曲线与颜色控件。修改后按相同种子重建当前时间，立即可见；播放栏沿用播放、暂停、单帧、时间轴回放、归零与循环。自动循环等自然尾巴结束再重播；「停发 · 自然收尾」保留已出生粒子的运动与寿命。

「预设」中的浏览器保存、JSON 生成/下载/导入保存完整 `soil` 数据；切换情境保留各自编辑结果。只有明确按「应用参数到当前关卡同名层」才更新关卡中同预设的现有落土源。永久配置仍需把导出 JSON 写入项目数据。

摄影棚包含地面、可调高度/位置/尺寸的横木、随来源变换的洞顶框/板缝以及移动宿主演示。来源参考物不参与碰撞，横木与地面参与；参照物仅属于摄影棚，不进入正片。

## 游戏与 Agent 接口

```js
const soil = Tengxian.Particles.FallingSoil;
soil.Presets();
const {id} = Tengxian.vfx.FallingSoil({preset:'SoilPlankLeak',config:{
  emitter:{position:[12,3.1,-8],width:2.4,rotation:[0,.7,0],seed:1938},
  timing:{delay:.25,pulseOn:.18,pulseOff:.6},clods:{maxParticles:12},
}});
// Default game host: shared GroundHeight + Battlefield.Raycast(terrain:true).
// A moving source can provide a deterministic local-to-world pose track:
const moving = soil.Create({preset:'SoilCeilingShake',config:{emitter:{position:[0,0,0]}}},{
  transformAt:t=>({position:TrackPosition(t),rotation:TrackEulerXYZ(t)}),
  groundAt:(x,z)=>level.GroundHeight(x,z),
  raycast:(from,dir,distance)=>level.Raycast(from,dir,distance,{terrain:true}),
});
soil.Configure(id,{motion:{wind:[.25,0,-.1]},dust:{density:.6}});
soil.Move(id,[13,3.1,-8],[0,.9,0]);
soil.Pause(id);
soil.Seek(id,1.2); // reset all layers, reconstruct, pause
soil.Play(id);    // resume; {restart:true} starts again
soil.Stop(id);    // natural tail; {clear:true} removes all live particles
const json=soil.Export(id); // TengxianFallingSoil v1
soil.Remove(id);
const restored=soil.Import(json);
soil.Inspect(restored.id);
soil.Samples(restored.id,'clods',16);
```

`transformAt(t)` 返回宿主世界平移与 XYZ Euler 弧度旋转；配置的来源变换是宿主局部偏移。仅出生时应用宿主变换，重力/风和脱离后的运动均在世界坐标。精确回放运动源需要可按时间求值的轨迹，当前物体位置不代表过去/未来。宿主回调不写入 JSON，导入时重新注入。

`Configure` 只重建该源的当前时间，不动其它源。`Move` 只改变后续出生位置，已脱离粒子留在世界；同一实例回放会使用已记录的 Move 历史。导出配置保留最终位置，不是运行状态快照；跨实例的运动轨迹仍由宿主注入。预览归现有 `VfxSystem.Update` 推进；`ParticleEffects.Fork` 隔离原场景粒子与落土源。退出销毁样品几何/材质/流并恢复原实例。

## 碰撞与真实限制

细砂使用现有 `ParticleSystem` / `ParticleBatch` 的非发光短拖痕。混合砂土流的细尘使用有疏密断续的下落尘帘，灰为主的「轻微漏灰 / 明显落灰」则关闭尘帘，使用 `densityStyle:'soil'` 的薄体积尘云，避免纵向纤维带把悬尘读成砂流；接触尘也使用贴地体积形态，低画质可简化。所有显式子层使用零预热的同一时钟。GPU 按出生记录解析带阻力轨迹，不逐帧回写矩阵。细砂和下落尘以有限分段射线和地面采样预测首碰，安排唯一的接触扬尘；细砂可在接触面有上限地留存。接触起尘量按档控制，轻漏灰关闭二次扬尘，中重档保留短寿命的低薄扩散。邻近轨迹复用短时表面缓存，因此它是可调精度的采样碰撞，不是逐粒刚体。

土块复用现有不规则 clod 几何，以少量普通 `MeshStandardMaterial` Mesh 逐步扫掠阻挡并采样地形；统一预通道自动记录真实 MotionVector。碎裂最多一代，不做土块互碰、自碰撞或连续土壤求解。射线耗尽记录 `probeFallbacks/skippedClodChecks`；缺少宿主表面时继续下落，不补虚构零高度地面。

只读引擎上限取 `FALLING_SOIL_LIMITS` / `soil.Inspect()`：60 Hz、8 个源、合计 6000 细砂（单源 4096）/48 土块/384 细尘、每步总射线 128、新生粒子 512。配置在上限内分配；池满或触及出生预算时跳过新生记录并记账，避免极端参数仍逐个构造和探测已无槽的粒子。远距离或低画质减发射量，已有粒子继续收尾。网格轮廓沿用现有游戏资产；没有新增通用 Unity 碰撞模块、任意模型或任意图集导入。

## 验证入口

`FallingSoilTest` 覆盖字段完整性/输入校验、固定步长与种子、回放无重复起尘、三种形状/旋转、世界空间运动源、分层开关、时序、停发、斜地形/抬高阻挡、有限碎裂与预算。

`FallingSoilBrowserTest` 检查真实预览中七预设像素/近景、原生输入、层开关、暂停/单步、JSON 与本机保存、循环/自然尾巴、反复回放资源、正片隔离、显式白盒可见/退出恢复。可用 `--base=http://127.0.0.1:8108` 复用预览；`--online --base=https://bentleyblanks.github.io` 检查发布包。原始截图和长边 640 JPEG 观察图仅留 `_shots/FallingSoil/`。像素可见、数量受控与回放通过不等于真实感验收；仍须同机位复查起始、下落、触地和尾段，轻档尤其不能以加亮或放大微粒满足像素门槛。
