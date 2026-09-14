# 第一关配音同步 · 2026-09-14

来源：[第一关｜往南的路](https://app.notion.com/p/3d360335331c81ea86f6f637ab92327c)，读取于 2026-09-14；空间和公开阶段沿用 [空间重构](Data_FirstLevelTopologySeptember14.md)。Notion 只作为本次需求来源，未写回。

本次 57 个完整 cue、209 句，共 583.76 秒。全部经 Volcengine `seed-audio-1.0` 按一个连续交流一次请求生成；人声、呼吸和对应环境声在同一条录音内。所有人物统一要求地道四川话，包括两段敌军喊话：依据用户本次“所有人物”要求，将 Notion 原日语命令按原意转为四川话，保留不显示字幕的配置。清单保存文件哈希、提示词哈希、请求数和生成语速。

## 第一、第二阶段

- 分食采用新稿八句；新增 `TrainPack` 十四句收包私语，靠近幺娃才开始。玩家保留转头和车厢内移动；幺娃回到过道靠近顺子，不插衣物特写。
- `TrainBanter` 是刘文财和何有田数子弹的五句旁侧交流。靠近时与收包私语并行，距离较远时不启动，也不作为炮击推进条件。两轨字幕分别标出说话者，暂停分别恢复源时钟。
- 关键私语结束后，罗班长说“把东西拢起，要到了”，随后真实炮弹触发倾覆。旧版长安抚和出车部署已移除。
- 惊呼 `WreckImpact` 等实际命中；两句 `TrainShelling` 救援等班长站稳。完整救援录音约 3.81 秒，实际说话 0—3.38 秒，起身动作跟随词语时间点；还权后才播放 `WreckExit`。
- 入沟时播放 `TrenchContact`；清沟、进入保护区且幺娃靠近后先包扎再播放九句炮后私语。看到退下来的伤兵后衔接 `WoundedArrival` 与支援命令。沿用当前 18 个公开阶段，清沟和掩蔽处在公开阶段 03 内，未重新编号。
- 列车初始行程随约 94 秒主对白延长；测试等待预算从当前录音时长计算，保留真实刹车、倾覆、近身救援和离车条件。

## 后续同步

前沿新增指认友军、提醒、破墙机枪、实际撤回与接应喊话。机枪被提前消灭时取消未播放的失效阻路命令，不能用取消冒充已听完。转运区补“前头一个”，按真实排队人数触发。其余后半关对白逐项核对 Notion 末尾的覆盖修订后重录。

老周牺牲采用完整七句连续录音，8.46 秒；生成端语速参数为 50，音高保持 0。曾出现时长达标但遗漏末尾喊话的候选，未采用；当前候选的无提示转写包含“鬼子上来了”和班长最后的持枪命令，所有七句有源录音时序。不是逐句生成、裁剪或拼接。

## 维护和核验

唯一台词源为 `Data_FirstLevelMissionDialogue.mjs`；播放编排在 `Data_FirstLevelMissionVoiceTiming.mjs`，源时序在 `Data_FirstLevelMissionVoiceAlignment.mjs`。后续对话改变时，同步角色、整段提示词、录音、字幕、事件时点和缓存版本。生成脚本默认复用哈希及生成参数相同的录音，避免重复生成。

```powershell
node Taierzhuang1938/Script_SeedAudioFirstLevelBake.mjs --dry
node Taierzhuang1938/Script_SeedAudioFirstLevelBake.mjs --only=<ChangedCueIds>
node Taierzhuang1938/Script_FirstLevelMissionTest.mjs --audio
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --audio --allow-checkpoint-retry
```

`--audio` 验证录音存在、完整请求、文件与提示词哈希、语速参数、当前文本的对齐哈希和字幕区间。无提示转写和逐词强制对齐分别执行；四川话有明显同音误识，自动转写不能代替逐句人工试听及声线、口音验收。完整取证、候选和测试日志只放本任务本地 `_shots/VoiceSync`，不提交。

字幕新增字已重新生成字体子集，并同步 preload 和 CSS 版本。已通过录音严格检查；完整浏览器回归与部署核验仍在进行，未作为完成证据。
