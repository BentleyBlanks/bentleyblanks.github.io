# 第一关剧情与战斗配乐

2026-09-09：用户批准的七首 SeedAudio 1.0 完整录音已接入《往南的路》。剧情依据为 [Notion 当前第一关及覆盖修订](https://app.notion.com/p/3d360335331c81ea86f6f637ab92327c)。这批音乐为新增的第一关专用 cue，旧关卡音乐仍沿用原清单。

2026-09-10：按用户试听批准，新增《交火前沿》《钢铁围攻》两首约 90 秒的 SeedAudio 1.0 战斗音乐，直接使用本次获批音频，不重新生成。当前版本为 `20260910-combat-duo`。曲库共九首，其中八首用于当前流程；《把路打开》保留为已有资产，村落战斗改用《交火前沿》。行军和剧情段仍用对应剧情曲，切入战斗时按下表选曲。

车厢曲采用用户试听确认的《车厢闲话》：年轻战友打趣的松弛、亲近和懵懂乐观为主，轻巧拨弦与单簧管短句呼应，未知感仅作很淡的底色。版本为 `20260909-carriage-banter`。保留完整约 120 秒的获批演奏，仅按现有标准统一电平和编码；来源及成品哈希、提示词均记录在音乐清单。运行时沿用 `LeavingHome` cue 与文件名，其他六首、阶段映射、对白避让和六秒循环淡化保持原有契约。提示词记录创作目标，技术验证不代替用户试听。

| 曲目 | 运行阶段 |
| --- | --- |
| 车厢闲话 | Train；Unloading 先降低，第一发炮弹实际落地后撤掉 |
| 钢铁围攻 | Support、MachineGun、Tank、Transfer、AirFirst、FinalDefense |
| 交火前沿 | Village、Melee、Courtyard、Rescue、RetreatFirst、RetreatWall、RetreatYard、Reception |
| 前线压来 | Orders，使用较低强度 |
| 往南的路 | South、TransferApproach，两次希望保持温暖 |
| 把路打开 | 保留曲库资产，当前阶段不自动选用 |
| 南路断了 | Carry、Dive |
| 别闭眼 | FinalCarry，使用较低强度 |
| 后头还有活人 | Exit |

Death 阶段快速撤掉配乐，保留对白和战场声；Complete、玩家倒下及任务销毁停止音乐。重试恢复当前阶段；调试跳转只请求目标阶段音乐。连续阶段使用同一首时不重播开头。

`Data_FirstLevelMissionMusic.mjs` 是阶段映射、曲目电平、淡化和对白增益的唯一配置。`Script_FirstLevelMissionMusic.mjs` 只选择曲目并调节音乐组音量，不改音效、环境总线或用户音量。对白实际处于 playing 时压低，等待与对白间隙恢复；未解码成功时保留字幕对应的让位。暂停/恢复由共享 AudioEngine 管理。

七首从本地用户批准文件经 `Script_FirstLevelMusicBake.mjs --source-dir=<LevelOne_SevenCues>` 打包，不重新生成。保留原始完整演奏，仅统一 RMS 到约 -27 dBFS，转为 44.1 kHz 双声道、112 kbps MP3。来源哈希、成品哈希、生成提示词和实测电平在 `Audio/Music/FirstLevel/Data_FirstLevelMusicManifest.json`，不记录本机绝对路径或凭据。

追加两首使用同一打包脚本的 `--source-dir=<approved-folder> --only=CloseQuartersPressure,IronSiege`，源目录包含获批音频及 `Data_Tracklist.json`（tracks 中记录 id/title/scene/destination/sha256/generatedAt/prompt）。`--only` 保留清单中其他曲目及其成品，不重编码原七首；整库重打包则需提供全部九首的来源清单。新曲沿用相同电平、编码、六秒循环交叉淡化与对白避让；Transfer 现在以正常战斗强度播放。

新 cue 按需 fetch/decode，复用正在进行的请求，最多保留三首新曲解码缓存。异步完成仅在仍为当前 cue、未暂停且引擎未销毁时起播；静默不能被晚到的旧请求打断。旧九首清单和预载行为保持原有兼容性。

循环沿用 `LoopLayer` 的双播放头调度，新曲使用六秒交叉淡化。完整曲目从头播放，接近尾部时下一轮从头淡入，避免硬接缝；这不是可独立组合的乐器分轨。跨曲切换及对白让位均在组增益上进行。

验证入口：`Script_FirstLevelMissionMusicTest.mjs` 检查全部阶段、源资产和电平；`Script_FirstLevelMissionMusicBrowserTest.mjs` 检查实际 WebAudio 输出、第一关阶段接线、对白、暂停恢复、三首缓存和异步竞态。该测试的阶段跳转是接线诊断，不作为正常通关证据。共享循环和旧音乐兼容由 `Script_AudioTest.mjs` 回归；正常任务行为继续走现有 `Script_FirstLevelMissionBrowserTest.mjs --campaign`。
