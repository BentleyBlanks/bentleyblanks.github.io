# 组件式环境系统与环境编辑器（2026-11-02）

用户 2026-11-02：给工程做一套组件式、数据驱动的环境系统和配套编辑器——主光、环境光、天空、雾、反射等拆成独立组件，预设是组件容器，参数支持固定值与昼夜关键帧，按区域覆盖并平滑切换，编辑器按「总览 — 区域 — 预设 — 组件 — 参数」组织；先做少量代表组件打通「添加组件 — 编辑预设 — 配置区域 — 昼夜预览 — 覆盖过渡」。同日追加：白盒场景与正式场景各配一个兜底区域（fallback volume）+ 配套预设，预设里配好白天 / 黄昏 / 晚上三套表现，其他时段自然插值，方便后续编排；预设方便复用，区域管预设影响的范围。

同日第二轮（用户「还没做的123都做」）：角色光照组件；关键帧 / 预演 / Timeline 里写「这一拍几点」；正片关卡接区域文件。

本文是这套系统的唯一口径。现在接上的是白盒编辑器（`?editor=blockout`）里的两个场景：`FirstLevelWhitebox`（编辑 / 预演）与 `FirstLevel`（试玩，K），以及正片第一关《往南的路》（`?whitebox=p012`，区域文件 `Environment/Level_FirstLevelCampaign.json`，§4.1）。**没有区域文件的关卡一行不变**，照旧按 `phase.sky` 套 `Script_Sky.SKY_PRESETS`。

## 1. 职责划分

| 层 | 文件 | 管什么 |
| --- | --- | --- |
| 组件声明 | `Data_EnvComponents.mjs`（纯数据） | 每种组件的 type、名字、分类、图标、参数表（kind / 范围 / 默认值 / 能不能做关键帧 / 怎么插值 / 写进环境参数的哪一项）、关闭值 |
| 组件执行 | `Script_EnvComponents.mjs` | 每个 type 一份逻辑：`Compose` 把参数写进这一帧的环境参数；`FromLegacy` 从旧天空预设读回；可选 `Apply` 直接改灯 / 材质 |
| 参数求值 | `Script_EnvTrack.mjs` | 固定值 / 24 小时关键帧，跨午夜循环；各 kind 的插值；关键帧编辑 |
| 文件格式 | `Script_EnvPreset.mjs` | 预设与区域文件的格式、校验、写法、新建；旧天空预设转组件预设 |
| 框架 | `Script_EnvSystem.mjs`（零 three） | 昼夜时钟、区域与临时覆盖、按组件选来源、来源切换的过渡、每帧调度 |
| 接渲染 | `Script_EnvApply.mjs` | 把环境参数交给天穹 / 平行光 / 天光 / 反射 / GI；反射贴图限频重烘 |
| 读取 | `Script_EnvLoader.mjs`、`Data_EnvLevels.mjs`（纯数据） | 认出这一关读哪份区域文件（白盒场景按场景、正片关卡按登记表），读区域文件 + 引用的预设 |
| 人物光照 | `Script_CharacterLight.mjs` | 角色光照组件的材质补丁（人物衣服 / 皮肤、白盒 X Bot 替身共用一组 uniform） |
| 编辑器 | `Script_EditorEnvironment.mjs`、`…Views.mjs`、`…Timeline.mjs`、`Script_EnvVolumeGizmo.mjs`、`Style_EditorEnvironment.css` | 环境面板、预设 / 组件 / 参数视图、昼夜时间轴、场景里的区域框与手柄；面板只认宿主适配器（§8.7） |
| 游戏内面板 | `Script_EditorEnvironmentGame.mjs` | 正片关卡里的同一个面板（高级工具 → 场景 → 环境），「这一拍」是任务步骤 |
| 数值 | `Data_Tuning_Environment.mjs` | 反射重烘间隔、播放速度档、新建区域的缺省、编辑器轮询与撤销步数、区域框颜色 |
| 种子 | `Script_EnvPresetSeed.mjs` | 两个场景的预设与兜底区域（一次性生成，留着重放；生成完以后文件是唯一真相） |

每种组件分三部分：**配置数据**在预设文件里（美术编辑：参数与它随时间的规则）；**运行时状态**在 `EnvironmentSystem.states`（来源、过渡起点与进度、此刻的实际参数，不写回预设）；**执行逻辑**在 `Script_EnvComponents`。发现组件、时间求值、状态过渡、调度全在框架里，组件只管自己的参数与效果。

## 2. 组件

| type | 名字 | 分类 | 主要参数 → 环境参数 |
| --- | --- | --- | --- |
| `Sun` | 主光（日 / 月） | 光照 | 高度角 / 方位角 → `sunElevation/sunAzimuth`；光色 / 强度 → `lightColor/lightIntensity`；太阳盘色 / 亮度 / 大小 |
| `Ambient` | 环境光 | 光照 | 天光探针 → `shProbeIntensity`；底色 / 底色强度 → `ambientColor/ambientIntensity` |
| `Reflection` | 反射 | 反射 | 环境反射 → `envIntensity`（IBL 与探针体 GI 同乘） |
| `Sky` | 天空 | 天空 | 天顶 / 地平线 / 地面色、辉光、战场烟尘、星 |
| `Clouds` | 云层 | 天空 | 旧云项 `cloudShape` + 结构化层积云 `cloudDeck` |
| `Atmosphere` | 物理大气 | 天空 | `atmosphere.*`：霾、瑞利、臭氧、辐照度、色调、大气透视 |
| `Fog` | 雾 | 雾 | `fog.*`：浓度、高度衰减、最浓、雾色、朝阳增亮、去饱和 |
| `Grade` | 曝光与调色 | 后期 | 曝光、饱和、对比、泛光、光束、镜头光晕、分离调色 `fog.grade.*`；**后期档案**（`profile`）决定自动曝光锚点、体积雾参数、胶片颗粒、照明弹昼夜口径按哪一档 `SKY_PRESETS` 查 |
| `CharacterLight` | 角色光照 | 人物 | 补光强度 / 色（迎着镜头那面提亮，加在间接漫反射上）、轮廓光强度 / 色 / 收边（侧对镜头的边缘一圈，加在直接漫反射上）→ `characterLight.*`，由组件的 `Apply` 写进人物材质补丁 |

- **角色光照怎么生效**：不进天穹 / 灯，组件逻辑的 `Apply(decl, values, host)` 调 `host.characterLight.Set(values)`，写 `Script_CharacterLight` 的一组共享 uniform（`uCharLight` = 补光、轮廓、收边幂次；两种颜色）。补丁 `charLight1` 挂在 `#include <lights_fragment_end>` 后面：零采样器，两路都是 0 时整段跳过（白天的画面和以前逐像素一样）。挂了的材质：`Script_CharacterSurface` 的人物衣服 / 皮肤 / 装备（`CharacterClothPatches` 与 `CharacterSurfaceMaterial`，NPC 与第一人称看得见的自己身子都走它），白盒的 X Bot 替身。没有区域文件的关卡、或换到没有区域文件的关卡时 `Set(null)` 关掉。
- 补光按「法线对着镜头多少」乘，所以只提亮正对镜头的那面，不会把背光面也抬起来；轮廓光是 `(1 − 正对度)^收边`，收边越大边越细。都乘材质本身的漫反射色（黑衣服不会被描成白边）。

- 环境参数与 `SKY_PRESETS` 同形，所以天穹、灯、后期、粒子雾这些消费方一行没改（`Script_EnvApply` 文件头）。
- 参数 kind：`number`、`angle`（最短弧）、`color`（`#rrggbb`，按线性光插）、`rgb`（HDR 三通道倍率）、`enum`（就近取）、`bool`。
- **亮度类参数按对数插**（`lerp: "log"`：光强、天光、反射、天色、雾色、天光底、曝光、太阳盘、辐照度）。画面亮度 ≈ 光强 × 曝光，白天与夜里差两个数量级；线性插会让过渡中间比两头都亮（2026-11-02 实测 20:00 比 18:00 和 22:00 都亮，改对数后单调，门禁 `EnvSystemTest` 查 8 / 15 / 20 点）。
- 关闭值（`off`）：没有任何来源提供、或「完全覆盖」的区域里没有这个组件时取它（主光强度 0、雾浓度 0、云层撤结构化云……）。
- **特殊参数的控件**：通用控件按 kind 生成；某个参数要专门的控件（例如罗盘式的方位角），声明里写 `control: "<名字>"`，在 `Script_EditorEnvironmentViews.RegisterParamControl(名字, 工厂)` 登记，工厂签名同通用控件。
- **新加一种环境能力**：`Data_EnvComponents.ENV_COMPONENTS` 加一条声明 + `Script_EnvComponents.ENV_COMPONENT_LOGIC` 登记一行（参数都有 `out` 路径就用通用写法；不走环境参数的写 `Apply`，例子是角色光照）。编辑器的添加菜单、卡片、控件、时间轴、框架的求值与过渡自动接上。`CheckComponentRegistry` 查两张表对得上。

## 3. 参数：固定值与昼夜关键帧

```json
"elevation": 52
"elevation": { "keys": [ { "h": 4, "v": 34, "tag": "night" }, { "h": 12, "v": 52, "tag": "day" }, { "h": 18, "v": 12, "tag": "dusk" }, { "h": 22, "v": 34, "tag": "night" } ], "interp": "smooth" }
```

- `h` 是 0–24 的小时，关键帧绕一天循环（最后一帧到第一帧跨午夜插）；`interp` smooth（缺省，缓入缓出）/ linear / step。
- `tag` 标这一帧属于哪一套表现；**同一参数里 tag 相同的帧联动**：改晚上 22:00 那帧，04:00 那帧一起变（夜里那段就是一个平台，不会被插成半个白天）。
- 时钟一个：`EnvironmentSystem.clock { hour, speed（游戏小时 / 真实秒）, paused }`，所有组件在同一时刻求值。场景默认值写在区域文件的 `time`。
- **参数求值与区域过渡分开**：过渡按真实秒走、目标照常按时钟求值，所以昼夜在走的同时进出区域互不干扰。

## 4. 文件

```
Taierzhuang1938/Environment/EnvPreset_<Id>.json            预设（schema tengxian-env-preset/1）：组件容器，可复用
Taierzhuang1938/Scenes/<Scene>/Environment_<Scene>.json     场景的环境（schema tengxian-env-scene/1）：时钟默认值 + 区域列表
```

预设：

```json
{ "schema": "tengxian-env-preset/1", "id": "FirstLevel", "title": "…",
  "looks": [ {"id": "day", "label": "白天", "hour": 12}, {"id": "dusk", "label": "黄昏", "hour": 18}, {"id": "night", "label": "晚上", "hour": 22} ],
  "components": { "Sun": { "enabled": true, "params": { … } }, "Fog": { … } } }
```

- `components` 以 type 为键，**同一种组件在预设里只留一份**。可以完整描述环境（兜底用），也可以只放要覆盖的几种（局部区域用），一份预设可被多个区域、多个场景引用。
- `enabled: false` = 这个组件不参与，下层接手（编辑器卡片上的勾）。
- `looks` 是「这份预设有哪几套表现、各在几点」，编辑器的白天 / 黄昏 / 晚上按钮与 `Debug.Lighting.SetLook` 按兜底区域那份预设的 looks 拨时间。

区域文件：

```json
{ "schema": "tengxian-env-scene/1", "scene": "FirstLevel",
  "time": { "hour": 12, "speed": 0.1, "paused": true },
  "volumes": [
    {"id": "Fallback", "name": "兜底（全场）", "shape": "global", "priority": 0, "blendS": 0, "mode": "full", "preset": "FirstLevel"},
    {"id": "Volume1", "name": "灶屋", "shape": "box", "priority": 10, "blendS": 2, "mode": "partial", "preset": "FirstLevelKitchen", "center": [66, 0, 64], "size": [8, 4, 6], "yawDeg": 0}
  ] }
```

- `shape`：`global`（全场，兜底用）/ `box`（`center` 底面以上的盒子中心、`size` 宽高深、`yawDeg` 同 three rotation.y）/ `sphere`（`center`、`radius`）。
- `mode`：`partial` 只覆盖预设里有的组件，其余继承下层；`full` 完全覆盖，下层一概不看，预设里没有的组件取关闭值。
- `blendS`：观察点进出这个区域时的过渡秒数（进入取它的，离开也取它的——取两者里优先级高的那个）。
- 两份文件都由人 / agent 直接改，或环境编辑器存；`node Taierzhuang1938/Script_EnvSystemTest.mjs` 校验仓库里的全部文件。数据来源表登记在 `Data_DataSources`。

### 4.1 正片关卡的区域文件

```
Taierzhuang1938/Environment/Level_<Id>.json      格式同场景的区域文件（schema tengxian-env-scene/1，scene = <Id>），多一节可选 stages
```

- 正片关卡没有场景文件，按 `Data_EnvLevels.ENV_LEVELS`（`phase.id → <Id>`）登记：现在只有第一关 `FirstLevelP012Whitebox → FirstLevelCampaign`。没登记的关卡照旧 `phase.sky`。
- `Level_FirstLevelCampaign.json` 的兜底区域**复用 `EnvPreset_FirstLevel`**（正式场景那份），默认时刻 12:00、暂停：12:00 拼出来的环境参数与第一关原来的 `firstLevelBattleDay` 逐项一样（门禁逐项比），后期档案也是它，逐关自动曝光锚点照用。
- `stages`：`{ "<任务步骤 id>": { "hour": 17 } | { "look": "dusk" }, … }`，键是第一关的内部步骤（`FIRST_LEVEL_STAGES[].steps`，`Debug.FirstLevelMission()` 里的 phase.id）。换步骤时按它拨钟（§8.6）；**现在是空的**——正片第一关的天还是从头到尾 12:00，要哪一步换天在游戏内面板里写（§8.7）。

## 5. 区域覆盖与平滑切换

- 来源三类：**基础**（兜底区域，全场）、**区域**（局部盒子 / 球）、**临时**（`PushOverride` 推进来的覆盖，过场换天、剧情事件、编辑器试看）。全部按 `priority` 排，同优先级后加的在前。
- 观察点（缺省 = 出画相机，可选玩家或钉在某点）在哪些区域里，就在那些来源里**按组件**挑：每种组件取最高的那个「提供了它」的来源；遇到 `full` 的区域就截断。
- 某种组件的来源（或来源引用的预设）变了：从**这一刻实际的表现**（含过渡到一半的值）过渡到新来源，时长 = 新旧两者里优先级高的那个的 `blendS`。中途再变，从当时的值重新起步。
- 临时覆盖：`const handle = env.PushOverride({ preset, priority, blendS, mode })`，`handle.Release(blendS?)` 撤掉后重新挑来源、按给的时长过渡回去。旧接口 `ApplySkyPreset(name)`（`Debug.ApplySky`、特效编辑器换天、关尾夜行军）在有场景环境时变成优先级 `ENV_RUNTIME.skyOverridePriority`、`full`、立刻切的临时覆盖，`RestoreLevelSky` 释放它。

## 6. 接进渲染

- 读：`Script_Main.BuildField` 里 `SyncPhaseEnvironment(phase)`——`Script_EnvLoader.EnvTargetForPhase(phase)` 认出读哪份：白盒场景按 `phase.blockout.SceneUrl()`（`{kind: "scene"}`），正片关卡按 `Data_EnvLevels`（`{kind: "level"}`）；读区域文件与预设；同一份换段（01–05 → 06–10）不重读、时钟不动；没有区域文件或读坏了 → `ClearEnvironment()`（`env.Clear()` + 角色光照关掉），照旧按 `phase.sky`（读坏了报警告，不挡建关）。`EnterLevel` 套完 `phase.sky` 之后立刻 `UpdateEnvironment(0, { force: true })`。
- 正片关卡每帧看任务步骤（`missionRuntime.flow.phase.id`），换了就 `ApplyStageTime(step)`：按区域文件的 `stages` 找这一步或之前最近写过的那一步，`env.ApplyTime(spec, { blendS })`（缺省 `ENV_RUNTIME.beatBlendS` 2 s 往前拨）；都没写过就不动时钟。
- 每帧：`RenderSceneContent` 里**排在阴影排班之前** `UpdateEnvironment(dt)`（太阳方向在变时，换了方向的级联在这一帧就重烘），出画用的 `preset` / `skyName` 换成环境系统拼的那份与它的后期档案。`ApplyGraphics` 给 GI 的那份同理。
- `Script_EnvApply` 按组看变化：天（美术层 uniform + 大气三张 LUT，< 0.1 ms）→ `sky.Apply`；太阳方向变了 → `lights.ApplyPreset`（级联重烘），只有色 / 强度变了 → `lights.ApplyLevels`（2026-11-02 从 ApplyPreset 拆出来，不重烘阴影）；反射强度 → `scene.environmentIntensity` + `gi.ApplyPreset`；**环境反射贴图（PMREM，10–20 ms）至少隔 `ENV_RUNTIME.pmremIntervalS`（0.5 s）才烘一次**，变化停下来以后最后一次照样烘。时钟暂停、没有过渡时一帧不做任何事（输出对象不变）。
- 白盒编辑器的补光（`BLOCKOUT_EDITOR_FILL`）照旧乘在天光与底色上。
- 角色光照组件不走上面这几组，`Script_EnvApply` 拼完参数后调各组件的 `Apply`（值没变不调），宿主给 `characterLight: CHARACTER_LIGHT_HOST`。

## 7. 第一关两个场景的配置（2026-11-02）

`Script_EnvPresetSeed.mjs --write` 生成；之后改文件本身，别重跑。

| 套 | 时刻 | 取自 | 说明 |
| --- | --- | --- | --- |
| 白天 | 12:00 | `firstLevelBattleDay` | 白盒编辑器原来的天；默认时刻 12:00，打开就和以前逐项一样（门禁逐项比） |
| 黄昏 | 18:00 | `dusk` | 城里几关标定过的黄昏，补一层暖色层积云（免得 12→18 点云凭空消失） |
| 晚上 | 22:00、04:00 | `firstLevelNight` | 第一关关尾的阴云夜；两帧 tag 联动，夜里是平台 |

角色光照（第二轮加进两份预设，`Script_EnvPresetSeed` 同步改）：白天两路 0（画面不变）；黄昏补光 0、暖色轮廓光 0.35（`#ffb072`，收边 3，太阳低、人物背光时边上一圈暖色）；晚上冷色补光 0.12 + 轮廓光 0.3（都是 `#9fb4e8`，收边 2.6，夜里人脸不至于糊成一团黑）。中间时段对数插（0 那头按线性）。

- `Environment/EnvPreset_FirstLevelWhitebox.json` ← `Scenes/FirstLevelWhitebox/Environment_FirstLevelWhitebox.json` 的兜底区域；`Environment/EnvPreset_FirstLevel.json` ← `Scenes/FirstLevel/Environment_FirstLevel.json`。两份预设一开始一样，之后各自打磨（白盒是体块灰面，正式场景有正式地表与道具）。
- 中间时段：4→12 点是拂晓（夜 → 白天），12→18 点是下午（太阳从正午往西走、渐暖），18→22 点是暮色（黄昏 → 夜）。亮度类参数按对数插，过渡中间不会比两头亮。
- 编排怎么用：某一拍要黄昏就在那一拍写时间（§8.6：关键帧的 `time`、预演 / Timeline 的 `time` 事件、正片关卡的 `stages`），手上试看用 `Debug.Lighting.SetLook("dusk")` 或 `SetHour(18)`；局部（屋里、地道口）要不一样，加一个盒子区域引用另一份只含几种组件的预设，优先级高于 0。
- 第一关 11–18（`FirstLevel1218`）按剧本写了三拍：`16-1` 傍晚 `{hour: 17}`、`18-3` 黄昏 `{look: "dusk"}`（太阳落到铁路那头）、`18-8` 晚上 `{look: "night"}`（「1938年3月14日 夜」）；其余沿用，`12-1` 之前没写 = 区域文件默认 12:00。01–05、06–10 一拍没写（白天）。

## 8. 编辑器

入口：白盒编辑器顶栏「环境」按钮；地址带 `?env=1` 开机就打开；高级工具 → 场景 → 「环境」：在白盒编辑器里开它自己的面板，在登记了区域文件的正片关卡里开游戏内面板（§8.7），别的关卡跳到白盒编辑器。界面状态（开没开、哪一页、筛选、搜索、折叠、选中的区域 / 预设、各页滚动位置、时间轴）记在本机 `localStorage`（`tengxian1938_env_editor_v1`）。

### 8.1 面板

- **头**：场景名 · 没保存的点 · 撤销 / 重做 · 时间轴 · 保存（线上是「下载」）· 关闭。
- **时间条**（一直在最上面）：拖动拨时间、白天 / 黄昏 / 晚上一键跳、播放 / 暂停、速度（时 / 秒）、⚑ 把现在的时间与速度设为场景默认值。第三行是「这一拍」（§8.6）：`关键帧 03-1：写在这一拍 · 晚上（22:00）` / `沿用 02-1` / `没写 · 区域文件默认 12:00`，「写进这一拍」把现在的钟点写进去（正好是某套表现的时刻写它的名字，否则写钟点），「去掉」删掉这一拍自己的。
- **总览**：「当前生效」每种组件此刻由谁提供（基础 / 区域 / 临时 / 关闭）+ 过渡进度条；「区域与覆盖」按优先级从高到低，带来源标签、观察点在不在里面、提供了几种组件，单击选中、双击飞过去看，预设名点一下打开那份预设，临时覆盖可以「撤掉」；观察点（相机 / 玩家 / 钉在此处）；下面直接编辑选中区域的预设。
- **区域**：区域列表（新建盒子 / 球、复制、删除）+ 检查器：名称、启用、形状、中心 / 尺寸 / 朝向（放到相机前、底面落地、飞过去看）、优先级、过渡时长、覆盖模式、引用的预设（新建空预设、复制一份再引用、在预设页打开；被几个区域引用会提示）；下面是同一套预设视图。
- **预设**：独立的预设资源检查器——选哪份（本机列出 `Environment/` 里全部预设）、新建、复制、改名、被哪些区域引用、几套表现（点一下跳时间）；下面是同一套预设视图。

### 8.2 预设视图（三处共用）

- 分类图标筛选（全部 / 光照 / 天空 / 雾 / 反射 / 后期）+ 搜索（组件名、参数名）。
- 组件卡片：头部是折叠、图标、名字、分类、复制 / 粘贴 / 重置 / 删除、启用勾；金色左边 = 这个组件此刻正由这份预设提供。展开后按声明的小标题分组列参数。
- 参数行：名字（金色 = 关键帧、灰色 = 没写用默认值）· ◇ / ⏱ 固定值与关键帧切换（切成关键帧时，预设有几套表现就在每套的时刻各放一帧同值并带 tag）· 控件 · ◆ 在时间指针处打 / 删关键帧 · ⌁ 在时间轴里看这一项。关键帧模式下改值 = 改时间指针那一帧（指针不在帧上就在那一刻插一帧）。
- 「＋ 添加组件」：按分类列出这份预设还没有的组件，可搜索；加进来时以**此刻实际的表现**为初值。

### 8.3 场景里的区域

环境面板开着时，非全场区域画成框（盒子 12 条边 + 淡填充，球三个大圆）：选中的金色、观察点在里面的青色、其余灰色。选中的区域有手柄（被墙挡着也点得到）：盒子六个面各一个（只挪那一面）+ 中心（水平拖，Shift 上下拖），球是中心 + 半径。只在鼠标没被锁住时可拖（Esc 放开鼠标）；点中手柄那一下不抢指针锁。拖动在撤销栈里算一步。

### 8.4 昼夜时间轴

面板「⏱」打开，白盒编辑器底部。左边按组件列参数（缺省只列有关键帧的），右边同一根 24 小时轴：数值画曲线（纵轴按关键帧值的范围）、颜色画渐变条（rgb 展开后多一条亮度曲线）、枚举画分段，关键帧是菱形（金色 = 带 tag 的联动帧），轴上标出几套表现的时刻。拖空处拨时间（场景跟着变）；点一行展开：拖菱形挪时刻（5 分钟一格，数值参数还能上下拖值）、双击空处插帧、Delete 删帧；选中帧时时间指针跳过去，右侧面板改值就是改这一帧。「复制此刻整列 / 粘贴为关键帧」把一刻的整套表现抄到另一刻。头部的下拉改选中那一行的插值（缓入缓出 / 线性 / 保持）。

### 8.5 存盘与同步

- 改动全进撤销栈（Ctrl+Z / Ctrl+Y，拖滑条 / 拖手柄 / 拖关键帧各算一步），改完立刻交给环境系统，存盘前文件不动。Ctrl+S 存。
- 本机预览：`POST /__environment/save { kind: "preset" | "scene" | "level", id, doc, revision }`（`scripts/Script_LocalPreview.mjs`；`level` 写 `Environment/Level_<Id>.json`），闸同场景存盘口：本机 Host、同源、JSON、revision = 读文件时原始字节的 sha1（新文件 `null`），对不上 409，校验不过 400，任何拒绝都不落盘；预设先存、区域文件后存（区域文件校验要认得新预设）。`GET /__environment/status` 报能不能写、盘上全部预设、各场景区域文件与正片关卡区域文件（`levels`）的版本号。线上（Pages）没有存盘口，「保存」下载改过的 JSON。
- 每 2 s 查一次版本号：外面（人 / agent）改了文件，这边没改过就重读（时钟不动），改过就挂横幅（重新读取 / 先不管）。
- **切场景前先保存**：切到正式场景试玩（K）或换到别的场景时，环境系统整个换成新场景的区域与预设，手上没存的改动会丢（状态条红字列出丢了哪些）。

### 8.6 这一拍几点

一拍的时间统一写成 `{ "hour": 0–24 }` 或 `{ "look": "<预设 looks 里的 id>" }`（二选一），可加 `blendS`（顺着走到这一拍时拨钟用几秒，缺省 `ENV_RUNTIME.beatBlendS` 2 s）。`look` 按兜底区域那份预设的 looks 查钟点，所以预设把黄昏挪到 17:30，写 `look: "dusk"` 的拍子跟着走。校验 `Script_EnvPreset.TimeSpecErrors`。

| 在哪写 | 字段 | 怎么生效 |
| --- | --- | --- |
| 白盒关键帧 | 关键帧的 `time`（`Blockout/<Level>.json`，校验在 `ValidateBlockout`） | `GoTo` 跳到这一帧：这一帧或之前最近写过的那一帧的时间（`BeatTime`），一帧都没写过 = 区域文件默认时刻；**顺着往下一帧走**（`.`、导航栏下一个，带过渡）按 `blendS` 往前拨（`EnvironmentSystem.TweenHour`，只往前走、跨午夜不倒拨），其余跳转直接到位。关卡里一拍都没写时完全不碰时钟（01–05 / 06–10 照旧）。 |
| 预演 / Timeline | 事件 `{ t, type: "time", hour \| look, dur? }`（`Script_EditorBlockoutPrevizPlan.PREVIZ_EVENT_TYPES`） | 播到 `t` 拨到那个钟点，写了 `dur` 在 `dur` 秒里往前走过去（缓入缓出）。确定性：`PrevizHourAt(seq, t, 这一段开头的钟点)`，Seek 到哪就是几点；第一个 time 事件之前是这一段开头的钟点；一段里没有 time 事件不碰时钟。Timeline 面板里显示成「时间」轨。 |
| 正片关卡 | 区域文件的 `stages`（§4.1） | 换任务步骤时按 `BeatTime(stages, 步骤先后, 当前步骤)` 拨钟（`ApplyStageTime`，按 `blendS` 往前拨）。 |

- 面板里写：白盒编辑器「写进这一拍」= `SaveKeyframeTime(spec)`，写进当前关键帧并走白盒的配置存盘口（线上存成本地草稿，同白盒的别的改动）；游戏内面板写进区域文件的 `stages`（进撤销栈，点保存落盘）。
- agent 直接改：关键帧在生成器 `Script_EditorBlockout<Level>Keyframes.mjs` 里写 `time` 再导出（`KF_KEY_ORDER` 已含 `time`），或直接改 `Blockout/<Level>.json`；正片关卡改 `Environment/Level_<Id>.json` 的 `stages`。

### 8.7 正片关卡里的面板

`Script_EditorEnvironmentGame.EnvironmentGameOverlay`：高级工具 → 场景 → 「环境」在登记了区域文件的正片关卡里打开（`Debug.OpenEditor("environment")` 同）。就是 `EnvironmentEditor` 那一个面板，只换宿主适配器（`post / camera / renderer / uiRoot / setRootClass / groundAt / isLocked / target / fallbackSky / flyTo? / beat`）：区域文件是 `Level_<Id>.json`（kind `level`），「这一拍」是当前任务步骤，没有飞行观察所以不显示「飞过去看」；面板放左边、时间轴让开左边，不压高级工具右侧的 Inspector；不暂停玩法、不接管相机；退出高级工具菜单栏后面板还在（keepOnClose），边打边调。只在高级工具里有，Debug工具菜单里没有。

## 9. 给 agent / 测试

- `window.Tengxian.Debug.Lighting`（游戏侧，任何关卡都在；上面那个 `Debug.Environment` 是城镇细节计数，名字不动）：`State()`（含 `kind` scene / level、`tween`）、`SetHour(h)`、`SetLook(id)`、`Play(speed?)`、`Pause()`、`Sources()`、`Values(type)`、`Output()`、`PushOverride(spec) → id`、`ReleaseOverride(id, blendS?)`、`Observer(mode, at?)`、`CharacterLight()`（角色光照此刻的值 + 挂了补丁的材质数）。
- `window.Tengxian.Debug.Blockout.Environment`（编辑器侧）：`Open(tab?)`、`Close()`、`State()`（含 `kind`、`beat`）、`SetTab`、`Reload`、`Save`、`Undo`、`Redo`、`SelectVolume(id, fly?)`、`SelectPreset`、`AddVolume(shape, opts)`、`SetVolume(id, patch)`、`RemoveVolume`、`FlyTo`、`CreatePreset(id, title, fromId?)`、`AddComponent(presetId, type)`、`RemoveComponent`、`SetParam(presetId, type, key, value)`、`ToggleParamMode`、`ToggleKey`、`Preset(id)`、`Scene()`、`SetHour`、`SetDefaultTime`、`Filter(filter, search)`、`Collapse(type, on)`、`CreateSceneEnvironment()`、`Beat()`（这一拍：`{id, kind, from, spec, hour}`）、`WriteBeat({hour} | {look} | null)`、`ApplyBeat()`、`Timeline.{Open, Close, State, Select, CopyColumn, PasteColumn, OnlyAnimated, SetInterp}`、`Gizmo.{State, HandleScreen}`。游戏内面板的同一套在 `Tengxian.editor` 的叠加层 `environmentGame` 的 `api` 上。
- `window.Tengxian.Debug.Blockout.SaveKeyframeTime(spec | null)`：当前关键帧写 / 去掉 `time` 并存盘（同 `SavePose` 的存盘口与失败提示）。
- 门禁：`Script_EnvSystemTest`（纯 Node：组件注册、求值与插值、关键帧编辑、校验与写法、旧预设逐项拼回、按组件选来源 / 完全覆盖 / 过渡 / 临时覆盖、仓库两个场景的兜底与三套表现、过渡中间亮度单调；角色光照的三套值；时间写法、`BeatTime` 沿用、`TweenHour` 往前拨与跨午夜、`PrevizHourAt`、11–18 关键帧的三拍；正片第一关区域文件合规且 12:00 = `firstLevelBattleDay`）；`Script_EnvironmentBrowserTest`（真浏览器：白盒编辑器里开面板、加区域、加组件改参数、昼夜拨时间画面变、进出区域过渡、撤销、存盘口写盘与 409；注入三拍时间跳关键帧拨钟 / 沿用 / 顺走往前拨 / 写进这一拍；角色光照夜开昼关、X Bot 挂着补丁；正片第一关读关卡区域文件、游戏内面板写任务步骤时间并以 kind `level` 存盘。`--no-formal` / `--no-campaign` 跳过后两段）。

## 10. 还没做的

- 区域按距离渐变（Unity 那种 blend distance）没做，进出区域按时间过渡。
- 正片第一关的 `stages` 还没写（全程 12:00）；关尾夜行军仍走旧的 `ApplySkyPreset("firstLevelNight")`（自动变成临时覆盖），要改成写 `stages` 得先在游戏里对一遍那几步的画面。
- 别的正片关卡（城里各关）没登记区域文件，照旧 `phase.sky`；要接就在 `Data_EnvLevels` 加一行 + 写 `Environment/Level_<Id>.json`。
- 角色光照只挂在人物衣服 / 皮肤 / 装备（走 `ApplyNraUniform` / `CharacterSurfaceMaterial` 的：NPC、第一人称低头看得见的自己身子）与 X Bot 上；第一人称的手臂视图模型与武器没挂。
