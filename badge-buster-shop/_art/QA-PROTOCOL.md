# 自我验收协议 · QA-PROTOCOL（多 Agent 协作 + 自动循环）

> 让"多个 Agent 一起工作并自我验收，直到达标"落地的核心。所有生成型 Agent 与评审型 Agent 都按本协议运转。
> 评审输出**必须是规定 JSON**，便于编排器机器判定并自动循环。

---

## 1. 角色

| 角色 | 职责 |
|---|---|
| **Art Director（编排器）** | 持有 `ART_BIBLE.md`；派发任务、收集 JSON、判定通过/打回、控制循环与升级人工 |
| **Generator（生成 Agent）** | 读规范，按某素材提示词出 **4 个候选**；收到 `fix_deltas` 后改词重生成 |
| **Consistency Reviewer（一致性评审）** | 按评分表给每候选打分，对照**锚点 + 同套已定稿件**，输出 JSON |
| **Adversarial Reviewer（对抗评审）** | 默认"挑刺/倾向否决"，专找最刺眼的违和点，给 `blocking` 结论 |
| **Integrator（合成评审）** | 把候选合成进真实店铺场景 / 手机屏，检查"在上下文里是否漂浮/冲突"（非孤立评审） |

> 评审与生成必须是**不同 Agent**（避免自评放水）。一致性评审建议跑 2–3 个独立实例取多数。

---

## 2. 评分表（每维 0–5）

| 维度 | 关键? | 说明 |
|---|---|---|
| `finish_match` | ✅ | 哑光手绘质感；无玻璃/塑料/镜面高光 |
| `saturation_match` | ✅ | 饱和度与暖调匹配锚点，克制不刺眼 |
| `palette_match` | ✅ | 取色落在 ART_BIBLE 调色板内 |
| `in_context` | ✅ | 合成进真实场景/手机屏后不违和（Integrator 评） |
| `lighting_dir` |  | 主光=左上~40°，与全场一致 |
| `perspective_match` |  | 透视/朝向与同类一致 |
| `linework` |  | 无硬黑描边，柔和 painterly 边 |
| `grounding` |  | 有柔和接地阴影，不漂浮 |
| `edge_clean` |  | 透明边干净，无白边/彩边/光晕 |
| `readability` |  | 目标尺寸（如 48–96px）下仍可识别 |
| `family_consistency` |  | 与同套其它件像"一家人"（套内门禁阶段评） |
| `identity_preserved` |  | 仅顾客：重绘不改人（发型/服装/年龄/气质） |

> 不适用的维度记 `null`（如非套件不评 `family_consistency`）。

## 3. 通过阈值（编排器判定逻辑）

一个候选 **通过** 当且仅当同时满足：

1. **关键维度无短板**：4 个 `✅ 关键维度` 全部 ≥ **4**。
2. **加权总分** ≥ **0.90**：`weighted_total = (Σ 有效维度得分) / (有效维度数 × 5)`。
3. **对抗评审不否决**：Adversarial 的 `blocking == false`。

> 一套全部成员各自通过后，进入 **套内门禁**（§5）；代表素材再过 **全局门禁**（§6）。

## 4. 评审 JSON（每个候选一份，机器可解析）

```json
{
  "asset_id": "icon_chat",
  "candidate_id": "c2",
  "reviewer": "consistency-1",
  "target_px": 96,
  "scores": {
    "finish_match": 5, "saturation_match": 4, "palette_match": 5, "in_context": 4,
    "lighting_dir": 5, "perspective_match": 5, "linework": 5, "grounding": 4,
    "edge_clean": 5, "readability": 5, "family_consistency": null, "identity_preserved": null
  },
  "weighted_total": 0.94,
  "critical_min": 4,
  "blocking": false,
  "blocking_issues": [],
  "fix_deltas": [
    "稍降瓷砖饱和，向 #3E8E7E 暖灰再靠一档",
    "接地阴影再柔化、透明度降到 ~24%"
  ],
  "verdict": "pass"
}
```

字段：
- `critical_min`：4 个关键维度里的最小值（< 4 即 §3.1 不满足）。
- `blocking`：对抗评审专用；`true` 表示存在"一眼违和"的硬伤。
- `fix_deltas`：**具体、可执行的提示词增量**（给 Generator 改词用），不要写"再好看点"这类空话。
- `verdict`：`pass` / `fail`（由评审按 §3 自评；编排器复核为准）。

## 5. 套内门禁（contact sheet）

同套全部成员各自 pass 后：
1. 把它们排成网格生成一张"合影图"。
2. 一致性评审对**整套**评 `family_consistency` 与一致性方差（底板/光向/饱和/符号粗细是否齐整）。
3. 任一明显离群 → 该件回 §3 重做，并把"向 XX 看齐"写进 `fix_deltas`。

## 6. 全局门禁（上下文复核）

从各套各取代表素材，由 Integrator 合成两张图：
- **A**：图标/弹窗/UI 叠到 `realistic-shop-counter.png` 实景上。
- **B**：弹窗/壁纸/手机皮叠到手机屏 mock 上。

对 A/B 评 `in_context`；准绳："看不出是后加的"。任一处违和 → 定位到具体素材打回。

## 7. 循环与终止

```
for each asset:
    round = 0
    while round < 4:
        candidates = Generator.generate(prompt)          # 4 个
        reviews    = [ConsistencyReviewer.score(c) for c in candidates]   # 2~3 个评审实例
        adv        = AdversarialReviewer.judge(candidates)
        passed     = [c for c in candidates if meets_threshold(c, reviews, adv)]   # §3
        if passed:
            pin(best_by_weighted_total(passed)); break
        else:
            prompt = apply(prompt, merge_fix_deltas(reviews))    # 用增量改词
            round += 1
    if not pinned: escalate_to_human(asset, last_reviews)        # 4 轮未过上报
# 全部 pin 后：
run_set_gate()      # §5
run_global_gate()   # §6
```

终止条件（"目标达成"）：
- 每个素材都 `pinned`；**且**
- 每套通过套内门禁；**且**
- 全局门禁 A/B 两图 `in_context` ≥ 4。

任意素材 4 轮未过 → 暂停该素材、产出对比说明给人工，其余继续（不阻塞整体）。

## 8. 反作弊 / 防放水

- 生成与评审必须不同 Agent；一致性评审多实例取多数，分歧 > 1 分的维度复评。
- 对抗评审**默认倾向否决**：不确定时 `blocking=true`，宁可多一轮。
- 评审必须**对照锚点与已定稿同套件**，不能孤立打分。
- `fix_deltas` 必须具体到"调什么、往哪个方向、到什么程度"，否则视为无效评审、重评。
