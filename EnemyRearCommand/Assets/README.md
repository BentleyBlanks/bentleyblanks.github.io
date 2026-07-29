# EnemyRearCommand / Assets —— 可选本地资产投放处

把文件按**精确文件名**放进本目录并提交仓库，游戏会自动加载使用；
文件缺失或加载失败时自动回退到程序化方案（合成配乐 / 程序化插画），不会报错。
**任何子集都可以单独投放**，不需要一次配齐。完整清单以 `../Data_Assets.mjs` 为准。

## 一、整轨背景音乐（5 首，找免费/可商用素材）

| 文件名 | 时期 | 情绪参考 |
|---|---|---|
| `AudioBgm_Opening.mp3` | 开辟期 1937-1938 | 清亮、疏朗，竹笛/民谣感，带出发感 |
| `AudioBgm_Growth.mp3` | 发展期 1939-1940 | 节奏渐紧、劳作与建设感，拨弦类 |
| `AudioBgm_Hardship.mp3` | 困难期 1941-1942 | 低沉、压抑、大量留白，弦乐长音 |
| `AudioBgm_Recovery.mp3` | 恢复期 1943-1944 | 回暖、规律律动，有盼头 |
| `AudioBgm_Counter.mp3` | 反攻期 1944-1945 | 激昂、推进感、厚低音 |

- 格式 mp3（128-192kbps），单曲 2-4 分钟、**首尾可无缝循环**为佳。
- 会与游戏内音量/静音设置联动；当前时期的整轨加载完成后自动淡入接管合成配乐。

## 二、音效逐条替换（16 条，可只换部分）

`AudioSfx_Click / Confirm / Cancel / March / Ambush / Blast / Rail / Alarm /
Build / Harvest / Wind / Snow / Turn / Unlock / Bad / Good` + `.mp3`

短促干声、每条尽量 < 2 秒；沿用游戏内的节流与并发限制。

## 三、事件卡插画（8 张，LoveArt 生成）

统一风格建议提示词（在 LoveArt 里配合各行场景描述使用）：
> 1940s Chinese wartime archival photograph, north China Taihang mountains,
> black and white with slight sepia, grainy film, documentary realism,
> restrained composition, no gore, 16:9

| 文件名 | 画面 |
|---|---|
| `Texture_EventRidge.jpg` | 太行山脊线，行军队伍远景剪影 |
| `Texture_EventVillage.jpg` | 华北土坯房村落，屋顶与院墙，炊烟 |
| `Texture_EventTunnel.jpg` | 地道口/窑洞内昏暗油灯 |
| `Texture_EventRail.jpg` | 铁路路基与铁轨透视，远处车站水塔 |
| `Texture_EventSnow.jpg` | 雪后山村，脚印与独轮车辙 |
| `Texture_EventAssembly.jpg` | 村口大槐树下开会的人群背影 |
| `Texture_EventNight.jpg` | 夜行军火把长队，山道 |
| `Texture_EventHarvest.jpg` | 秋收打谷场，连枷与石磙 |

- 建议 1280×720 jpg/webp，单张 ≤ 300KB。
- 游戏会在图上自动压一层暗角保持档案质感；**不要生成血腥画面**（项目红线）。

启动画面主视觉（可选）：`Texture_BootHero.jpg`，竖构图 800×1000 以内。

## 四、许可（必须做）

在本目录建 `CREDITS.md`，逐条记下每个文件的**来源链接与许可证**
（CC0/Pixabay License 可直接用；CC-BY 需在游戏"说明"页署名——写清楚署名文本，
集成时会加进去）。没有许可记录的文件不要提交。
