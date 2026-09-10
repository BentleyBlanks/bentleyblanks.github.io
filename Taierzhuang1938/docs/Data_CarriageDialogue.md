# 车厢群体对白 · 2026-09-10

本次只替换第一关 `TrainMeal`：Volcengine `seed-audio-1.0` 一次请求生成一条完整录音，88.842 秒、30 句、七个角色。台词与表演要求的唯一来源是 [Data_FirstLevelMissionDialogue.mjs](../Data_FirstLevelMissionDialogue.mjs)，成品为 [AudioVoice_FirstLevelTrainMeal.mp3](../Audio/FirstLevel/AudioVoice_FirstLevelTrainMeal.mp3)。炮击后的 `TrainShelling` 沿用现有录音。

后排与靠窗士兵先自己讨水、留水，听到前排分肉才插话；前排把肉传过去后，靠窗的人接着帮忙找滚落的子弹。远处闷响引出猜测和追问，班长并不知道敌情，只让大家坐好。短暂停顿后继续递水、收脚和吃东西，保留人在不确定中维持日常的反应。两名新增说话身份来自现有乘客，不新增人物模型或动画资产。

`TrainMeal` 从三次播放改为整条连续播放，保留开头五秒与结尾四秒；递食物解除事件绑定顺子第二句结束的 4.56 秒源时钟。字幕采用录音源时间，30 句全部重新对齐。整条音轨仍是单声道，距离层次依靠生成表演；没有实现逐角色三维声源或精确对口型。

巡航仍为 6 m/s，初始行驶距离从 390 m 改为 648 m，轨道与地面随既有参数延伸；最终停车、下车与集合坐标不变。约 97.842 秒对白阶段结束，此后首发炮弹飞行 1.4 秒，列车仍有约 52.5 m 的制动距离，避免长对白使旧路段提前耗尽。

## 生成与对齐复现

生成只读 `VOLCENGINE_API_KEY` 环境变量：

```powershell
node Taierzhuang1938/Script_SeedAudioFirstLevelBake.mjs --only=TrainMeal
```

音频 SHA-256 为 `4f6bc3015cca6417c864d423c2c44fff86291300e2d5828b7df7dd1d6e811d4c`。使用 faster-whisper 1.2.1 medium CPU int8，先无提示词转写核对内容，再按下面的源录音窗口做强制对齐。四川口音的转写存在同音误识，自动对齐不等同于人工听审或声线辨识验收。

将以下内容写入忽略目录下的 `Data_TrainMealAlignmentGroups.json`；每组为 `[起秒,止秒,首句索引,末句索引不含]`，这是模型的分析窗口，不会剪切或拼接交付音频：

```json
{"TrainMeal":[[0,27.18,0,11],[27.18,53.34,11,18],[53.34,78.48,18,27],[78.48,88.842,27,30]]}
```

```powershell
python Taierzhuang1938/Script_FirstLevelVoiceAlign.py --model <本地medium模型目录> --only TrainMeal --groups <上述JSON路径> --output <忽略的验收目录>
node Taierzhuang1938/Script_FirstLevelMissionTest.mjs --audio
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --audio
```

对齐脚本按音频及台词哈希判断缓存，超过 30 秒的录音必须提供分析窗口，防止继续使用旧版本 11 句的硬编码时间点。录音响度检查：均方平均 -23.0 dBFS、样本峰值 -3.1 dBFS。试听判断重点是其他乘客是否自然接话、七个声音能否区分、后半段疑虑是否克制。

## 本次验收

- 47 项 quick 检查通过；`Script_FirstLevelMissionTest.mjs --audio` 核对全部 cue 的源稿、文件哈希、字幕区间，新增回归确认群戏只启动一次播放、30 句字幕完整出现、长对白之后列车仍实际移动。
- 对齐脚本复算所得 30 个区间全部一致；字体补齐并通过 TextTest，335 模块的 Pages 预览包构建成功。
- 浏览器车厢阶段实测：97.867 秒对白结束触发炮击阶段，99.283 秒首弹落地，101.433 秒卧倒命令，104.233 秒第二次命中导致伤员，116.717 秒停稳，123.783 秒下车对白结束。`TrainMeal` 与 `TrainShelling` 均在 finished 中，语音错误为空；本地截图与事件记录位于 `_shots/FirstLevelMission`。
- `FirstLevelMissionBrowserTest --campaign --audio` 完整真实输入通关通过，耗时 759.6 秒，零历史基线、零失败，最终截图为 `Scene_Complete.png`。
