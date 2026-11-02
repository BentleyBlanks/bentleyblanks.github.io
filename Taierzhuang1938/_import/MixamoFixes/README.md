# Mixamo 动作库调整记录

2026-11-02 全库审查（`_import/Script_MixamoLibraryAudit.mjs` + `Script_MixamoLibraryAuditReport.mjs`）之后，凡是改过的动作都在这里留一份记录，
方便以后回头对比 Mixamo 原件、知道改了哪几帧哪根骨。`Script_MixamoLibraryFetch.mjs --prune` 把记录并进清单
`Animation/Mixamo/Data_MixamoLibrary.json`（条目上的 `fixes` / `original`），预览工具显示「已修正」标签、逐条改动，并可切到原版对比。

## 记录文件

每条动作每个主题一份：`<动作文件名词干>.<主题>.fix.json`，例如 `Animation_Mixamo_SittingIdle_V3.Hands.fix.json`、
`Animation_Mixamo_RifleDeath_V1.Rifle.fix.json`。几个人分头改同一条动作时按主题分文件，不互相覆盖。

```json
{
  "file": "Animation_Mixamo_SittingIdle_V3.glb",
  "topic": "Hands",
  "kind": "anim",
  "date": "2026-11-02",
  "author": "Claude Opus 5.5",
  "summary": "坐着时两手手指陷进大腿 7 cm：手往外抬到贴着腿面",
  "changes": [
    "第 80–110 帧 右臂两节骨 IK：掌心沿大腿法线外推 5.5 cm（手腕朝向不变），前后各 6 帧渐入渐出",
    "第 85–100 帧 左手同上 6.0 cm"
  ],
  "before": { "handCm": { "Right": 6.5, "Left": 7.2 } },
  "after": { "handCm": { "Right": 0.8, "Left": 0.9 } },
  "original": "Original/Animation_Mixamo_SittingIdle_V3.glb",
  "sources": ["Taierzhuang1938/_import/MixamoFixes/Script_MixamoClipFix.py"]
}
```

| 字段 | 说明 |
| --- | --- |
| `file` | 动作文件，相对 `Animation/Mixamo`（派生的写 `Derived/…`） |
| `topic` | 主题，跟文件名里的一致 |
| `kind` | `anim` = 动作数据改过；`attach` = 动作数据没动，只改了挂法（清单里的 `rifleTrack`、挂件标定之类） |
| `summary` | 一句话：什么问题、怎么改的 |
| `changes` | 逐条：哪几帧、哪根骨、转了 / 推了多少 |
| `before` / `after` | 审查脚本量出来的数（同一套量法），改前改后 |
| `original` | 只有改过动作数据的 Mixamo 原件有：改之前那份 GLB（就是 Mixamo FBX 原样转出来的），放 `Animation/Mixamo/Original/` 下同名 |
| `sources` | 改它的脚本 / 工程 |

Mixamo 原 FBX 一直在 `_import/Mixamo/Raw/`；`Original/` 下的 GLB 是给预览工具直接对比用的同格式副本。
