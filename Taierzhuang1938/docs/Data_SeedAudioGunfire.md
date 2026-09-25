# 日军枪声与远场可听度（2026-09-11）

用户要求生成几条日军开枪音效，本次仅生成三条：三八式近场单发、远场单发、十一式轻机枪单发。供应商 Volcengine，模型 `seed-audio-1.0`；提示词、烘焙和凭据读取规则见 `../Script_SeedAudioGunfireBake.mjs`。不扩展其他武器或变体。

运行 `node Taierzhuang1938/Script_SeedAudioGunfireBake.mjs --generate` 生成缺失原始 take；不带参数只从本地缓存重烘。原始文件和 QC 在忽略目录 `Audio/Sfx/_raw/SeedAudioGunfire20260911`，部署文件使用 `AudioSfx_SeedAudio*.mp3`，由 SFX manifest 接入现有 cue。音色属于生成式拟音，不宣称历史实枪录音。单声道 44.1 kHz MP3，有声段 RMS −25 dBFS，峰值上限 −3 dBFS。连射节奏仍由运行时逐发调度。

此前枪口与脚步同用 3.5 m 参考距离，100 m 干声衰减约 28.2 dB；枪声现用数据表 `GUN_AUDIBILITY.refDistanceM=14`，100 m 约 16.3 dB，150 m 约 19.8 dB。敌我两方共用，近场混音、160 m 逐发剔除、方向和传播延迟保留。更远交火仍走六扇区、有速率上限的汇总层，基础音量由 0.3 调至 0.65。

修复声部优先级估算：使用实际 Panner 参考距离，包括 64 m 远场和爆炸 sourceSizeM，移动后也保持一致。此前远场节点按 3.5 m 算，220 m 处被低估约 25 dB，容易被其他声音抢占。

验收：AudioTest 检查双方 100/150 m 电平、实际 Panner 与优先级一致性、远场移动前后估算；AudioWiringTest 检查真实枪声接线、远场扇区、方向、预算与子弹音配平。生成品质仍需玩家通过实际扬声器试听。

## 本次素材验收

三条生成文件有声段 RMS 分别为 −24.96 / −25.04 / −24.93 dBFS，峰值 −9.57 / −6.73 / −11.04 dBFS；时长 1.4 / 1.8 / 0.65 秒。统一 `Script_AudioNormalize.mjs` 只读验收的 SFX 部分通过（155 文件，散布 0.87 dB）。全库返回失败来自未修改的环境一次性音（最高 −18.07 dBFS），不作为本次枪声已全库归一化的声明，也不批量改动旧素材。

浏览器验收：`AudioTest` 全过（178 秒），包含双方 100/150 m 可听电平、远场移动前后抢占权重、玩家 12/12 枪零丢声；`AudioWiringTest` 60/60 通过（183.5 秒），200 m 真实剔除枪声进入对应扇区、角度误差不超过 30°，弹啸配平、限幅与远场预算通过。两项运行在合入火车音效更新 a11946450 之后。此前 prepush 基础与纯 Node 音乐检查 26 项通过；未重复运行无改动的剧情音乐浏览器套件。模块缓存图和 Pages 合并包构建通过。

## 2026-09-24：十一年式改成生成音与实录混播（用户拍板「枪声换」）

上面「不扩展其他武器或变体」是 09-11 那一轮的范围。09-24 用户看过「旧 BAR 近场两条 `AudioSfx_Type11_01/02` 的 <40 Hz 能量占 98 % 上下、没有低音炮的机器上等于不出声」这个结论后，决定换掉十一年式的枪声。**只动十一年式**：

| cue | 文件 |
| --- | --- |
| `type11` | FN MINIMI（L110A2）1 m 单发 2（`AudioSfx_Type11_01/02`，同文件名换了内容）。09-24 白天还带着本页那条 SeedAudio，09-25 用户定换掉、全用实录 |
| `type11Far` | BAR 300 m 1（原有）+ MINIMI 50 m 后方单发 2（新增 `AudioSfx_Type11Far_02/03`） |
| `rifleIja` / `rifleIjaFar` | **不动**，仍是本页的 SeedAudio 单条（09-24 夜起由表尾 `RifleIjaSeedAudio` 登记，全量 SfxBake 不再把它们改回实录） |

`type11` / `type11Far` 在 `Script_Audio.SAMPLE_CYCLE` 里：按表序轮播、不做逐发 ±3 % 变调（09-24 夜接力改定，理由见 `Data_AudioWiring.md`「二之三」第 8 节）。

`type11` 的 `license` 09-25 起写 `sonniss`（两条都是实录；09-24 带生成音时写的是 `mixed`，逐文件出处在 `credit`，顺序与 `files` 一致）；`type11Far` 全是 Sonniss 实录，仍写 `sonniss`。最终文件表登记在 `Data_SfxSources` 表尾的 `Type11Variants` 组（只登记、不切割），逐条客观数字见 `Data_AudioWiring.md`「二之三」第 8 节。

**重烘注意**：本页的 `Script_SeedAudioGunfireBake.mjs` 写清单时只登记它自己那条生成音，会把 `type11` 覆盖回生成音一条；全量 `Script_SfxBake.mjs` 则靠表尾 `Type11Variants` 保住 MINIMI 两条。重跑生成音之后必须再执行

```
node Taierzhuang1938/Script_SfxBake.mjs Type11Variants
```

把 MINIMI 两条的文件表登记回来（只登记、不下载、不重切）。要重切 MINIMI 那几条时三组一起点名：`Type11MinimiSingles Type11FarMinimi50m Type11Variants`（`Type11FarMinimi50m` 是 append，重跑前先把清单里的 `type11Far` 还原成只有 `_01`）。

仍需用户用扬声器试听：MINIMI 的 5.56 mm 当十一年式 6.5 mm 像不像；MINIMI 几条起音后约 0.33 s 的低频回声鼓包在单发时是否像第二下。
