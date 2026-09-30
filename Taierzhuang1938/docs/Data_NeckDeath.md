# 敌军喉咙窒息哽咽（neckDeath）

2026-09-30。日军**被刀砍/刺死**、或**脖子中弹致死**，又死在玩家近处时，部分会发出喉咙被割开/打穿的窒息哽咽，
顶替他倒下时原本那一声日语痛呼。

## 1. 什么时候放

规则在 `Script_NeckDeath.mjs`（纯函数，零 three），数值在 `Data_NeckDeath.mjs`；接线在 `Script_Ai.mjs` 的 `Soldier.TakeHit → NeckDeathCause → Kill`。

| 闸 | 规则 |
| --- | --- |
| 阵营 | 只有 `ija`（玩家的对手） |
| 致死类型 | 刀：`blade / slash / cut / thrust / stab`，**不看部位**；枪：`bullet / hmg` 且弹着点在脖子上。枪托（`butt`）、爆炸、火不算 |
| 脖子 | 命中体 `upperTorso` 胶囊沿胸→颈轴投影 t ≥ 0.72；或命中体 `head` 弹着点比球心低 ≥ 0.55 个半径（下巴/喉结那一圈）。**必须带命中体 id**——AI 打 AI 那条链不做几何，判不了，不算 |
| 距离 | 死者离玩家 ≤ 14 m（`nearM`） |
| 概率 | 脖子中弹 0.6、刀伤 0.45（`chance`）——「部分敌军」 |
| 间隔 | 两次之间至少 0.9 s（导演时钟，`minGapS`）；没抢到档的照旧喊日语 |
| 排除 | `openingDoomed`（开场分镜里被安排的刀杀）与 `scriptEssential`；脚本直接 `Kill()` 的不走这条 |

抽签值是 `NeckDeathRoll(soldier.id, damageSequence)` 的确定性哈希，**不占用士兵自己的 `rnd()` 序列**，别的随机结果不会因此挪位。

## 2. 声音

cue `neckDeath`，两个变体（`AudioSfx_NeckDeath_01/02.mp3`），随机挑一条 ±3 % 变调（不在 `SAMPLE_CYCLE`）。
来源 Volcengine SeedAudio 1.0，`Script_SeedAudioNeckDeathBake.mjs` 生成八条候选、量后选两条；
默认只重烘已选 take、不调接口（`--generate` 补缺的候选，`--force` 全部重掷，`--report` 只量）。
成品有声段对齐 −25 dBFS（与库同档），峰值 −12.5 / −9.8 dBFS。

`SAMPLE_MIX 0.75`、`SAMPLE_WET 0.15`（近处一声细节：不盖枪声、几乎全干）。盖不上采样时走合成回落（`RECIPES.neckDeath`：低基频过共振峰 + 两口气的包络）。
音效编辑器「身体 → 喉咙窒息哽咽」可单独试听。

## 3. 选 take 的依据（我听不见，只能按数）

八条候选量 时长 / 有声段电平 / 峰值 / 四个频段占比 / 有声段结构，再看频谱图：

- 选 **02**：四记分开的喉头「咯」（0.28 / 0.68 / 1.34 / 2.08 s），93 % 能量在 100 Hz–2.5 kHz，频谱有共振峰；
- 选 **07**：两口较长的哽咽（0.22–1.04、1.24–2.36 s），同样 93 %。
- 落选：01 峰值 −0.1 dBFS、电平高出其余 7–17 dB（是喊叫）；03 / 05 / 08 连续 2–3 s 不断、>2.5 kHz 占 17–36 %（漏气嘶声）；04 / 06 太轻且偏闷。

**尚需人工试听**：是「克制的窒息」还是「猎奇/像在说话」，机器判不了。不满意就 `--force` 重掷（会换掉已选 take 的候选原片，但成品 mp3 不动，直到改 `NECK_DEATH_PICKS` 后重烘），
或直接在 `NECK_DEATH_PICKS` 里换 take / 切点。

## 4. 验收

- `node Taierzhuang1938/Script_NeckDeathTest.mjs`：脖子几何、刀/枪/阵营/距离/概率闸、抽签确定性与分布、清单与接线（纯 Node）。
- `node Taierzhuang1938/Script_NeckDeathBrowserTest.mjs`：真引擎里走 `TakeHit → Kill`，10 项：刀杀/脖子中弹放、胸口中弹/太远/没抽中/同钟让位/脚本 Kill/国军不放、无页面错误。
- `Script_AudioTest`：食谱数 105，清单每条 cue 都有对应食谱与文件。
- 戳：`SFX_PACK_VERSION 20260930neckdeath`；`Script_Ai / Script_Audio / Script_EditorAudio` 与两个新模块在 index.html 的 `?v=20261003000000`。
