# 日军枪声与远场可听度（2026-09-11）

用户要求生成几条日军开枪音效，本次仅生成三条：三八式近场单发、远场单发、十一式轻机枪单发。供应商 Volcengine，模型 `seed-audio-1.0`；提示词、烘焙和凭据读取规则见 `../Script_SeedAudioGunfireBake.mjs`。不扩展其他武器或变体。

运行 `node Taierzhuang1938/Script_SeedAudioGunfireBake.mjs --generate` 生成缺失原始 take；不带参数只从本地缓存重烘。原始文件和 QC 在忽略目录 `Audio/Sfx/_raw/SeedAudioGunfire20260911`，部署文件使用 `AudioSfx_SeedAudio*.mp3`，由 SFX manifest 接入现有 cue。音色属于生成式拟音，不宣称历史实枪录音。单声道 44.1 kHz MP3，有声段 RMS −25 dBFS，峰值上限 −3 dBFS。连射节奏仍由运行时逐发调度。

此前枪口与脚步同用 3.5 m 参考距离，100 m 干声衰减约 28.2 dB；枪声现用数据表 `GUN_AUDIBILITY.refDistanceM=14`，100 m 约 16.3 dB，150 m 约 19.8 dB。敌我两方共用，近场混音、160 m 逐发剔除、方向和传播延迟保留。更远交火仍走六扇区、有速率上限的汇总层，基础音量由 0.3 调至 0.65。

修复声部优先级估算：使用实际 Panner 参考距离，包括 64 m 远场和爆炸 sourceSizeM，移动后也保持一致。此前远场节点按 3.5 m 算，220 m 处被低估约 25 dB，容易被其他声音抢占。

验收：AudioTest 检查双方 100/150 m 电平、实际 Panner 与优先级一致性、远场移动前后估算；AudioWiringTest 检查真实枪声接线、远场扇区、方向、预算与子弹音配平。生成品质仍需玩家通过实际扬声器试听。

## 本次素材验收

三条生成文件有声段 RMS 分别为 −24.96 / −25.04 / −24.93 dBFS，峰值 −9.57 / −6.73 / −11.04 dBFS；时长 1.4 / 1.8 / 0.65 秒。统一 `Script_AudioNormalize.mjs` 只读验收的 SFX 部分通过（155 文件，散布 0.87 dB）。全库返回失败来自未修改的环境一次性音（最高 −18.07 dBFS），不作为本次枪声已全库归一化的声明，也不批量改动旧素材。

浏览器验收：`AudioTest` 全过（178 秒），包含双方 100/150 m 可听电平、远场移动前后抢占权重、玩家 12/12 枪零丢声；`AudioWiringTest` 60/60 通过（183.5 秒），200 m 真实剔除枪声进入对应扇区、角度误差不超过 30°，弹啸配平、限幅与远场预算通过。两项运行在合入火车音效更新 a11946450 之后。此前 prepush 基础与纯 Node 音乐检查 26 项通过；未重复运行无改动的剧情音乐浏览器套件。模块缓存图和 Pages 合并包构建通过。

## 2026-09-23 起：生成音与实录混排（第一关 01–05 声景）

上面「不扩展其他武器或变体」是 09-11 那一轮的范围。09-23 的 01–05 声景任务要求日军步枪与轻机枪各有 3–5 条变体、实录优先，所以现在三条 cue 是**生成音 + Sonniss 实录**混在一起轮播（逐条见 `Data_AudioWiring.md`「二之三」第 8 节）：

| cue | 文件 |
| --- | --- |
| `rifleIja` | SeedAudio 1 + M1 Garand 1 + M1903A3 3 |
| `rifleIjaFar` | SeedAudio 1 + BAR 300 m 1 + 50 m 建筑反射 2 |
| `type11` | SeedAudio 1 + FN MINIMI 1 m 单发 2 |

清单里这三条的 `license` 写 `mixed`（`SFX_LICENSES.mixed`：逐文件出处在 `credit`，顺序与 `files` 一致）。登记在 `Data_SfxSources` 表尾的 `JapaneseGunfireVariants` 组。

**重烘注意**：`Script_SeedAudioGunfireBake.mjs` 写清单时只登记它自己那三条生成音，会把上表覆盖回一条。重跑它之后必须再执行

```
node Taierzhuang1938/Script_SfxBake.mjs JapaneseGunfireVariants
```

把混排清单登记回来（只登记、不下载、不重切）。

`type11` 原来的 `AudioSfx_Type11_01/02.mp3` 是 BAR 0.1 m 的两条（G09 试听时选定），从 09-11 起就不在轮播里；实测 40 Hz 以下能量占 98.7 %、可听部分比同组低 19 dB，09-23 同名换成 MINIMI。要不要恢复 G09 的选定由用户定。
