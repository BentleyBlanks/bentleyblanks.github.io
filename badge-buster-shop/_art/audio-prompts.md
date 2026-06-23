# 音效 / BGM 提示词（按游戏事件映射）

> 现状：音频 100% 由 `audioManager.ts` 用 Web Audio 实时合成（正弦/三角/方波），`asset-manifest.ts` 的 `audio: {}` 为空——**0 个音频文件**。
> 目标：一套**温暖、治愈、手作感**的"舒适小店"声音皮肤，与温暖手绘 2.5D 画风同源。统一后接入 manifest 替换/叠加合成音。
> 声音调色板（DO）：木质/纸质质感、原声小乐器（马林巴/卡林巴/木琴/尤克里里）、柔和铃铛、轻巧"啵/嗒"、温柔收银。
> 禁则（DON'T）：刺耳 8-bit、激进合成器、失真、过响、金属尖锐、赌场电子。
>
> 提示词用于 AI 音效生成（如 ElevenLabs SFX / 文本生成音效）。每条 = 「音色描述 + 时长 + 情绪 + 调色板约束」。

---

## 通用技术规格
- SFX：母带 `WAV 48kHz/24-bit`，另导出 `MP3 128–192kbps`；短音用 mono，空间感音可 stereo。
- 时长：点击/清理 0.08–0.25s；反馈/奖励 0.3–1.2s；失败/警告 0.4–1.5s。
- 响度：峰值归一 −1 dBFS；**整套响度统一**（同类音感知响度一致，避免某些音突兀）。
- 处理：首尾去静音、去爆音/削波；轻微暖色 EQ（削高频毛刺）。
- BGM：`stereo`，**无缝循环**，30–90s，目标 −16-18 LUFS，导出 `MP3` + `OGG`。
- 落点：`assets/audio/<id>.(mp3|wav)`；并在 `asset-manifest.ts` 的 `audio` 字段登记同名 key（当前为空 `{}`）。

---

## SFX 清单（ID ↔ 触发事件 ↔ 提示词）

| ID | 触发（events / audioManager） | 时长 | 提示词（EN） |
|---|---|---|---|
| `sfx_clear_pop` | `BADGE_CLEARED` 清角标（连击升调） | 0.12s | a soft satisfying wooden "pop/tick", warm marimba-like, gentle, cozy; clean short transient, no harshness |
| `sfx_swipe` | `SWIPE` 滑动连清 | 0.18s | a soft airy swipe whoosh, papery and gentle, warm, short |
| `sfx_level_up` | `LEVEL_UP` 升级 | 1.0s | a warm cozy level-up chime, a short ascending kalimba/marimba arpeggio, bright but soft, satisfying |
| `sfx_phone_return` | `PHONE_RETURNED` 归还手机 | 0.8s | a warm pleasant "task complete" chime with a soft tiny cash/coin tap, cozy and rewarding, acoustic |
| `sfx_phone_smash` | `PHONE_SMASHED` 砸机 | 0.5s | a chunky cartoon crunch/crack, woody and soft (not harsh glass), playful, with a tiny coin scatter tail |
| `sfx_popup_close_good` | `POPUP_CLOSED` defused=true | 0.25s | a clean soft "dismiss" pop with a gentle positive lift, cozy, reassuring |
| `sfx_popup_close` | `POPUP_CLOSED` defused=false | 0.2s | a soft neutral "close" tick, papery, low-key |
| `sfx_scam_installed` | `SCAM_INSTALLED` 中招 | 0.7s | a soft ominous low "uh-oh" thud with a gentle dissonant fall, warm and muffled (not scary/electronic), signals a mistake |
| `sfx_customer_arrive` | `CUSTOMER_ARRIVED` 到店 | 0.5s | a cozy shop door bell / soft chime, welcoming, warm acoustic |
| `sfx_customer_leave` | `CUSTOMER_LEFT` 离店（angry/overflow） | 0.6s | a gentle disappointed descending tone, soft and sad but cute, not harsh |
| `sfx_skill_use` | `SKILL_USED` 用技能 | 0.6s | a warm magical "power activate" whoosh-sparkle, cozy and uplifting, soft shimmer (no neon synth) |
| `sfx_upgrade_buy` | `UPGRADE_PURCHASED` 买升级 | 0.7s | a warm cozy "purchase confirmed" — a soft wooden cash register ding with a tiny coin, satisfying |
| `sfx_notif_clear` | `NOTIFICATION_CLEARED` 清通知 | 0.12s | a tiny soft paper "swipe-off" tick, very light |
| `sfx_malware_clear` | `MALWARE_CLEARED` 杀后台 | 0.2s | a soft cute "squish/zap" of clearing a bug, woody and gentle, a touch playful |
| `sfx_ui_tap` | UI 按钮点击（`drawControls`） | 0.08s | a soft cozy wooden button tap, very short, gentle |
| `sfx_ui_open` | 打开弹层（modal open） | 0.2s | a soft "slide-in / open drawer" whoosh, papery and warm |
| `sfx_ui_close` | 关闭弹层（modal close） | 0.18s | a soft "slide-out / close" whoosh, gentle |

### 风险事件（`RISK_EVENT.kind`）
| ID | kind | 时长 | 提示词（EN） |
|---|---|---|---|
| `sfx_risk_offer_win` | `offer_win` | 1.0s | a cozy "small jackpot" win — warm ascending sparkle + a few soft coins, happy acoustic, not casino-electronic |
| `sfx_risk_offer_fail` | `offer_fail` | 0.6s | a gentle "aw, miss" descending wood-block tumble, cute and soft |
| `sfx_risk_golden_break` | `golden_break` | 0.8s | a soft golden shimmer + a pleasant chime burst with light coin scatter, warm and rewarding |
| `sfx_risk_transformer` | `transformer` | 0.8s | a friendly soft mechanical transform whir-click, woody/cozy, playful (not sci-fi metallic) |
| `sfx_risk_soul_skill` | `soul_skill` | 1.0s | a warm mystical soft bloom — gentle bell + airy pad swell, cozy and special |
| `sfx_risk_bait_fail` | `bait_fail` | 0.6s | a soft "trap snap / oops" with a gentle comedic falter, cute, not harsh |

---

## BGM
| ID | 用途（audioManager 按队列切换） | 长度 | 提示词（EN） |
|---|---|---|---|
| `bgm_calm` | 平时（队列不满） | 60–90s loop | a cozy lo-fi shop background loop: soft ukulele/marimba, warm mellow keys, light brushed percussion, relaxed and pleasant, seamless loop, no vocals |
| `bgm_busy` | 队列将满（`queue >= cap-1`） | 60–90s loop | the same cozy theme but a touch busier/faster: slightly more rhythmic percussion and energy, still warm and non-stressful, seamless loop, no vocals |

> 两条 BGM 需**同调同器**（同主题变体），便于按忙碌度平滑切换，呼应 `audioManager.update()` 当前的变频逻辑。

---

## 音频自我验收（沿用 QA-PROTOCOL 思路）
评审 Agent（与生成不同 Agent）按下表打分（0–5），每条出 4 候选，未过用 `fix_deltas` 改词重生成：
- `palette_match`（关键）：是否落在"温暖治愈手作"声音调色板，无刺耳/电子/赌场感。
- `fits_event`（关键）：与触发事件语义匹配（清理=爽快短促、失败=柔和下行…）。
- `loudness_consistent`（关键）：与同类已定稿音感知响度一致，无突兀。
- `clean`：无削波/爆音/底噪；首尾静音已修。
- `length_ok`：时长在规格内。
- `family_consistency`：整套像同一套音效皮肤。
- BGM 额外：`loop_seamless`（循环点无缝）、`non_intrusive`（久听不烦）。

通过阈值同 `QA-PROTOCOL.md`：关键维度全 ≥4、加权 ≥0.90、对抗评审不否决；整套再过"连播一致性"门禁（把全套依次播放，听是否像一家人）。
