# 近中远爆炸与掠耳子弹音（2026-09-09 / 10）

本批按用户要求，经火山引擎 `seed-audio-1.0` 重新生成当前游戏的五组战斗音效。
三档爆炸仍由 `Script_AudioWiring` 根据听者距离选取；子弹音爆、呼啸保留原有弹道触发、遮挡、左右定位和轮播机制。

| Cue | 变体数 | 成品时长 |
| --- | ---: | --- |
| `explosionNear` | 3 | 1.98–2.60 s |
| `explosionMid` | 2 | 2.40 s |
| `explosionFar` | 3 | 2.80 s |
| `bulletCrack` | 4 | 0.32 s |
| `bulletWhizz` | 4 | 0.316–0.65 s |

16 条均为独立生成的 take，非旧素材变调。提示词要求单次户外爆炸或单颗子弹擦耳掠过，排除音乐、人声、背景战场及连发。提示词和后期处理见 [生成脚本](../Script_SeedAudioCombatBake.mjs)。主观音色仍以实际试听为准，自动检查不代表人工听审。

成品为 44.1 kHz、单声道、112 kbps MP3，由游戏负责空间化。按 20 ms 有声帧 RMS 对齐至 −25 dBFS（允许 ±0.5 dB），成品峰值不高于 −3 dBFS。远爆第二变体为保留瞬态轻降整条增益，实测有声 RMS −25.26、峰值 −3.10 dBFS；本批其余素材有声 RMS −25.06 至 −24.96 dBFS。没有用硬削波将峰值截平。

原始 take、请求提示词、时间戳和逐文件 QC 保留在被忽略的 `Audio/Sfx/_raw/SeedAudioCombat20260909/`，不发布。仓库只交付 16 条 MP3、素材清单、生成脚本和本说明。`Data_SfxSources` 已撤掉这五组的旧素材配方，改为 SeedAudio 登记，避免全量 `Script_SfxBake` 把新成品覆盖回旧录音。

```powershell
# 配置 FFMPEG 为本机 ffmpeg 可执行文件路径；密钥仅从 VOLCENGINE_API_KEY 读取。
node Taierzhuang1938/Script_SeedAudioCombatBake.mjs --dry
# 默认只从已有 take 重新烘焙，不请求 API。
node Taierzhuang1938/Script_SeedAudioCombatBake.mjs
# 明确请求生成缺失 take；可用 --only=bulletWhizz 限定一组。
node Taierzhuang1938/Script_SeedAudioCombatBake.mjs --generate
# --force 会重新生成选中的 take；--generate-only 只保存原始素材。
node Taierzhuang1938/Script_TestRunner.mjs --only=ModuleGraphTest,AudioTest,AudioWiringTest,BootTest --fail-fast
```

重新选片后须核对 manifest 与 `Data_SfxSources` 的变体文件及最长时长，并更新 `SFX_PACK_VERSION` 和 `index.html` 的 `Script_Audio.mjs` 数字版本戳。本批音效包版本为 `11`。

本批同时修正 `AudioWiringTest` 的连续远射测量隔离：剧情推进可能在听者约 2.7 m 处触发近爆，原测试将该爆炸、碎屑及上一轮玩家近射余音一起计入 150 m 步枪的限幅窗口。现在先清除余音并等待压缩器释放，20 s 窗口仅允许被测步枪、弹啸及随枪机械声；保留原来的 −3 dB 限幅断言与全部玩法数值。

本次实测：`AudioNormalize --report`、`ModuleGraphTest`、`AudioTest` 通过，修正隔离后的 `AudioWiringTest` 60/60 通过。`BootTest` 首次在前五片全部通过后触及 240 s 总时限，按原断言单独补完第 5、6 片，两片均通过；这是分批覆盖七片，不是单次全跑通过。LocalPreview 确認本任务服务根目录，16 条 HTTP 音频响应与生成成品逐条哈希一致。自动结果未替代主观试听。
