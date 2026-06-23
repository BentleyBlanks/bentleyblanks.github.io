# 04 · 顾客半身像（6 人 × 3 情绪 · 重绘+扩展 · P1）

> 现状：6 张日系动漫亮面立绘，仅 `_neutral`。问题：动漫 cel 亮面 + 正面平贴 + 偏高饱和，与手绘哑光场景不一致。
> 任务：**重绘为温暖手绘半身肖像**（降光泽、对齐左上 40° 光、降饱和入调色板、柔和painterly 边），并为每人补 `happy` / `angry` 两种情绪。
> ⚠️ **身份不变**：只改画法/光照/情绪，发型/服装/特征/年龄/气质必须与原图一致。
> 拼装：`{{STYLE}}` + `{{PORTRAIT_TEMPLATE}}` + 每人「身份」 + 情绪行 + `{{NEG}}`。
> 尺寸：render @768²，导出 `512²`，透明 PNG。落点 `assets/art/cust_<x>_<mood>.png`（neutral 覆盖原图；新增 happy/angry）。
> 命名：`cust_a_neutral.png` / `cust_a_happy.png` / `cust_a_angry.png` …（代码已按 mood 取图）。

## `{{PORTRAIT_TEMPLATE}}`（6 人共用，保证一套）

```
a cozy hand-painted character portrait bust, head and shoulders, facing slightly
toward the viewer's right (toward the shop counter); soft painterly skin with
gentle volume and NO sharp anime highlights, NO glossy cel shading; warm key
light from the upper-left at ~40 degrees with soft warm ambient fill; muted warm
palette consistent with a cozy shop-sim; lineless soft painterly edges; a soft
shadow under the chin and shoulders; identical framing and crop across the whole
cast; transparent background, centered, generous headroom.
```

> 套内不变量：**同一裁切、同一朝向、同一光向、同一画法层级**。6 人并排应像同一画师同一天画的。

---

## 身份锁定（必须保留）+ 情绪表

每人提示词 = `{{STYLE}}` + `{{PORTRAIT_TEMPLATE}}` + `Identity:` + `Expression:` + `{{NEG}}`。
`Expression` 三选一：
- **neutral**：calm friendly closed-mouth slight smile
- **happy**：warm open bright smile, eyes slightly crinkled, cheerful
- **angry**：impatient frown, brows drawn together, lips tight (annoyed, not cartoon-rage)

| ID | 名 | `Identity:`（EN，逐字保留特征） |
|---|---|---|
| `cust_a` | 小敏 | a young woman with dark-brown hair in a high ponytail, wearing a blue hoodie over a cream hood drawstring; friendly approachable vibe |
| `cust_b` | 老欧 | an older man around 60, short greying hair, black-framed glasses, beige collared shirt under a navy apron with an orange button; kindly experienced vibe |
| `cust_c` | 阿甜 | a teenage girl with a black chin-length bob and an orange hair clip, wearing a cream hoodie under teal-green overall straps with orange drawstrings; cute cheerful vibe |
| `cust_d` | 朱姐 | a middle-aged woman with short wavy brown hair and pearl stud earrings, wearing a navy apron over a cream top; warm motherly vibe |
| `cust_e` | 尼克 | a young man with messy brown hair and a short beard, blue eyes, wearing a blue denim shirt over a white tee; relaxed easygoing vibe |
| `cust_f` | 小冉 | a young woman with long wavy purple-to-teal gradient hair, hoop earrings and a necklace, wearing a black leather jacket with an orange collar lining over a white top; trendy edgy vibe |

### 复制即用示例（`cust_a` · happy）

```
{{STYLE}}
{{PORTRAIT_TEMPLATE}}
Identity: a young woman with dark-brown hair in a high ponytail, wearing a blue
hoodie over a cream hood drawstring; friendly approachable vibe.
Expression: warm open bright smile, eyes slightly crinkled, cheerful.
Negative: {{NEG}}
```

## 验收要点
- `identity_preserved`（关键）：与原 `*_neutral` 比对，人物可识别为同一人；改了发型/服装/年龄即否决。
- `finish_match`：必须褪去动漫亮面高光，转柔和手绘皮肤。
- `family_consistency`：6 人同裁切/同朝向/同光向；happy/angry 与本人 neutral 同一人。
- `saturation_match`：服装鲜色（如小冉发色、阿甜青绿）需降饱和入调色板，但保留可识别色相。
- 圆形裁切适配：代码会把立绘裁进圆形（`drawCustomerBust`），主体居中、肩部信息别太靠边。
