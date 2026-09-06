# 文本与数值的数据驱动口径

本文是《滕县 一九三八》把「台词 / 文案 / 数值 / 任务编排」从代码里抽成纯数据的**唯一口径**。
项目入口 [AGENTS.md](../AGENTS.md) 跨系统契约第 10 条指到这里；闸门是 `Script_TextTest.mjs`。

目标只有三个，取舍全按它们来：

1. **数据驱动不降低代码质量** —— 代码读表，不写魔法字符串 / 魔法数字；表有出处、有类型、有闸门。
2. **多语言可加** —— 加一种语言只加一份 `Data_Locale_<id>.mjs`，代码零改动。
3. **任务编排与代码解耦** —— 拍表、交互点、指引、名册、波次是数据；代码是解释器。

参考的是成熟商业引擎的做法：字符串表（String Table）+ 键引用、内容原稿留在资产里用 id 收集（Gather）、
调参表（Tuning / DataAsset）与规则代码分离、任务用数据描述而不是脚本硬编。

---

## 1. 分层：什么算「文本」，什么算「数值」，什么算「编排」

| 类别 | 例子 | 归宿 |
| --- | --- | --- |
| **界面文本**（玩家能看见、与剧情无关） | HUD 提示、目标行、菜单项、键位说明、交互标签、加载步骤、阵亡卡、系统字幕 | `Data_Text_<Domain>.mjs`，代码 `T("domain.key")` |
| **内容文本**（考据过的原稿） | 章节台词、过场分镜、史料注记卡、川军口令、菜单史实行、鸣谢 | 原稿留在 `Data_Mission*` / `Data_Cutscene*` / `Data_Voice` / `Data_History` / `Data_TengxianScript`，显示时经 `Localize(id, text)` |
| **调参数值**（手感 / 平衡 / 节奏 / 阈值） | 跳跃速度、AI 视距、台词最小间隔、字幕时长、HUD 暗角起点、换人倒计时 | `Data_Tuning_<System>.mjs`，代码 import 读 |
| **编排数据**（任务怎么走） | 拍表、波次、交互点规格、指引文案表、同伴名册、后送队编成、架设武器种类 | `Data_<Feature>*.mjs`（P012 的拍表在 `Data_FirstLevelP012Beats.mjs`，名册在 `Data_Companions.mjs` 等） |
| **不动的** | 几何尺寸（考据）、着色器常量、物理引擎参数、资产路径、开发者诊断文本、编辑器面板 | 留在原处 |

判断「这条要不要抽」的问题只有一个：**换一种语言 / 换一个策划改数 / 换一关，需要改这一行代码吗？** 需要就抽。

---

## 2. 界面文本：`Script_Text.T`

```js
import { T } from "./Script_Text.mjs";
hud.Hint(T("gameplay.emplacement.jammed"), 2.6);
hud.Hint(T("interact.pickup.withClips", { name: w.name, clips: drop.clips }), 3.2);
```

- 键形如 `domain.section.name`（小写域名开头、点分、驼峰或下划线），域名对应表文件：
  `hud.` → `Data_Text_Hud.mjs`，`menu.` / `input.` / `boot.` / `gameplay.` / `interact.` / `p012.` / `setpieces.` / `story.` / `range.` 同理。
  一个前缀只归一个文件；`Data_Locale_zhCN.mjs` 拼表时重复键直接抛。
- 占位符 `{name}`，参数走第二个实参；**不在调用点拼接中文**（`"拾起" + name` 这种在英文里语序不成立）。
  模板字符串里夹中文同样算硬编码。
- 同一句话只登记一次，多处复用同一键；相似但语义不同的句子各登记各的（翻译时语境不同）。
- 表文件导出三样：`TEXT`（键值）、`GATED_MODULES`（这张表覆盖的代码文件，登记后闸门就对它生效）、
  `DYNAMIC_PREFIXES`（运行时拼键的前缀，例如 `p012.beat.` 按拍 id 拼；闸门对它只查「前缀下至少有一条」）。
- 动态拼键的规矩：**键的可变部分必须来自数据表里的 id**（拍 id、姿态 id、武器 id），
  由那张数据表的测试保证每个 id 都有对应文本；不许用自由字符串拼键。
- 缺键不抛：`T` 返回键本身并记进 `Missing()`，画面上会直接看见 `hud.xxx` 这种键名 —— 这是故意的，
  比静默空白好查。`Script_TextTest` 静态查所有 `T("…")` 引用。
- 说话人名字（`hud.Say(who, …)`）也是文本：用 `CAST` / 名册里的 key 取，不写字面量。
- 语言切换：`SetLocale(id)`；未登记的语言不切。当前只有 `zh-CN`；加语言见 §5。

### 什么不走文本表

- `console.*` / `throw new Error(...)` / assert 消息：开发者诊断，闸门自动豁免所在行。
- `Script_Editor*.mjs` 的编辑器面板：开发工具，不本地化，不进闸门（与商业引擎「编辑器与游戏分开本地化」一致）。
- 烘焙 / 出图 / CLI 脚本的终端输出（`Script_*Bake` / `Script_*Shot` / `Script_HeightmapCli` 等）。
- 资产 id 恰好是汉字、或注释性质的 `note:` 字段：行尾加 `// @text-ok 原因`，闸门放过这一行。
  这个标记是**例外登记**，不是逃生门 —— 每一处都要写原因。

---

## 3. 内容文本：原稿留在数据文件里，`Localize(id, text)` 收集

章节台词、过场分镜、史料卡是**考据过的原稿**，带 tier / source，本体不搬家。多语言走「按 id 覆盖」：

```js
import { Localize } from "./Script_Text.mjs";
this.hud.Say(speaker, Localize(beat.voice ?? beat.id, beat.text), shown, variant);
```

- id 口径（稳定、全局唯一，翻译表按它对齐）：
  - 章节 beat：`beat.voice`（有语音的行本来就有 key），否则 `<chapterId>.beat.<index>`；
  - 过场：`<cutId>.<shotN>.<lineN>`；标题 / 卡片行同理带 `title` / `card` 段；
  - 史料卡：`history.<cardId>.<field>`；口令：`voice.<key>`；菜单史实行：`menu.lines.<n>`，鸣谢 `credits.<n>`。
- 译文放在语言表的 `content.<id>` 键下。基准语言（zh-CN）**不登记** `content.*` —— 原稿就是基准。
- `node Script_TextGather.mjs` 把所有内容文本按 id 导出成一份清单（JSON + Markdown，落 `_shots/` 或指定路径），
  交给翻译；翻译回来的表生成 `Data_Locale_<id>.mjs` 的 `content.*` 部分。
- 章节数据文件本身**不改格式**：不给每条 beat 加 `textKey`，那会把 30 份内容文件改一遍而没有收益。

---

## 4. 数值：`Data_Tuning_<System>.mjs`

```js
// Data_Tuning_Player.mjs
export const JUMP = Object.freeze({
  speedMps: 4.65,
  runMinMps: 1.80,     // 助跑加成的起算速度：慢步以下当站着跳
  ...
});
```

- 一个系统一张表，导出**分组的冻结对象**（`JUMP` / `STANCE` / `SIGHT` …），不是一个大杂烩。
- **注释跟着数走**：原来写在代码常量旁的「为什么是这个数」整段搬进表文件，代码里不留孤儿注释。
- 表是纯数据：不 import three、不 import 规则代码、不含函数（派生量由代码算，或表里写公式的输入而不是输出）。
- 代码 `import { JUMP } from "./Data_Tuning_Player.mjs"`，读 `JUMP.speedMps`；**不复制到本地常量再用**
  （否则热改表不生效、测试读到两个真相）。
- 测试断言从表里读期望值，不抄数（JumpTest 那条「判据取 `Debug.Traversal()`、断言里不抄数」的规矩推广到所有表）。
- 什么不算调参：几何 / 考据尺寸（`Data_Tengxian` 已有）、渲染内部（采样数、纹理尺寸）、物理引擎步长、
  与其他数值有硬几何依赖的派生值。拿不准就问 §1 那个问题。

---

## 5. 加一种语言

1. 新建 `Data_Locale_en.mjs`，导出 `LOCALE = { id: "en", name: "English", strings }`；
   `strings` 用 `MergeTables` 拼自己的 `Data_Text_*_en.mjs`，或直接一份平表。
2. 只需覆盖翻译过的键；缺的自动回落 zh-CN。多出基准没有的键、占位符集合不一致，`Script_TextTest` 直接红。
3. 内容文本从 `Script_TextGather.mjs` 的清单翻译，回填成 `content.<id>` 键。
4. 在 `Script_Text.mjs` 里 `RegisterLocale`，并登记进 index.html import map。
5. 菜单「设置」里的语言项读 `Locales()`，选中后 `SetLocale`；HUD 与菜单在下一次刷新时自然换文（都走 `T`）。

---

## 6. 任务编排是数据

以第一关 P0/P1/P2 白盒为准：

- 拍表（id / 目标文本键 / 区 / 目标时刻 / 动作）、波次、交互点规格（id / kind / 标签键 / 手势 / 秒数 / 锚点名）、
  指引文案表（按拍与事实条件选键）全部在 `Data_FirstLevelP012Beats.mjs`；
  `Script_FirstLevelP012Flow.mjs` 是解释器：按表登记交互点、按表选目标行，**不再逐拍写 if**。
- 条件用**数据可表达的谓词**（`facts: ["issuedAmmo"]` / `notFacts: [...]` / `carry: "stretcher"` / `signal: "..."`），
  解释器统一求值；复杂到数据写不下的，才留一个显式的钩子名（`hook: "mortarStatus"`）由代码实现，表里点名。
- 同伴名册 `Data_Companions.mjs`、后送队编成、架设武器种类、负重种类：同样是「一张表 + 一台状态机」，
  文本字段存键不存句子。

---

## 7. 验收

```powershell
node Taierzhuang1938/Script_TextTest.mjs            # 闸门（tier0Fast，quick 档必跑）
node Taierzhuang1938/Script_TextTest.mjs --report   # 看未闸门化模块里还剩多少中文字面量
```

- 一个模块迁完：把它加进对应 `Data_Text_*.mjs` 的 `GATED_MODULES`，从此不许回退。
- 改文本表 / 调参表 / 编排表要连着消费方的测试跑（`--changed` 会按域映射）。
- 浏览器验收照旧：文案在画面上要真的显示成句子，不是键名（`Missing()` 为空是判据之一）。
