# 车厢群体对白 · 2026-09-10

## 当前开局修正

下文为此前长对白与声场的历史记录。当前版本按用户要求采用短暂分食后遭炮击的开局，`TrainMeal` 使用保留的短录音；播放期间声源每帧跟随幺娃的实际位置并抬至口部。轮轨与人群分别按 `Data_FirstLevelCarriageSound` 配平，`TrainMeal` 播放时环境和音乐经独立 `storyDuck` 降至 28%，对白结束、暂停或切场时恢复。其他对白默认不改变该总线；爆炸自己的短时 duck 不会提前解除对白压低。

40 名新兵按 12 / 16 / 12 分布，另有班长与玩家。玩家车厢留中央过道，幺娃沿过道递食、转向邻座分食再回来，班长短距巡看。大部分坐着的士兵保留既有扶膝姿态；所有日常走动仍通过现有 AI 与实体碰撞。

本轮只重录 `TrainShelling` 一个连续 Seed Audio cue（18.65 秒），将错误的“前头车厢”改为“车厢翻了！抓牢！”。玩家所在第二节车厢真正侧翻，同步车体碰撞、短黑幕与眩晕，班长近身拖出。该 cue 使用本地 faster-whisper small CPU int8 对齐；其他已保留 cue 的对齐来源未变。完整录音仍为一个文件，未拼接逐句生成结果。

最新实玩、截图与回归结论见 [第一关重构验收](Data_FirstLevelRebuildAcceptance.md)。没有制作新角色、动画库或逐角色口型；救援手部、低姿和生活动作仍属复用骨架的白盒编排。

## 历史：长对白第一版

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

## 第一版验收

- 47 项 quick 检查通过；`Script_FirstLevelMissionTest.mjs --audio` 核对全部 cue 的源稿、文件哈希、字幕区间，新增回归确认群戏只启动一次播放、30 句字幕完整出现、长对白之后列车仍实际移动。
- 对齐脚本复算所得 30 个区间全部一致；字体补齐并通过 TextTest，335 模块的 Pages 预览包构建成功。
- 浏览器车厢阶段实测：97.867 秒对白结束触发炮击阶段，99.283 秒首弹落地，101.433 秒卧倒命令，104.233 秒第二次命中导致伤员，116.717 秒停稳，123.783 秒下车对白结束。`TrainMeal` 与 `TrainShelling` 均在 finished 中，语音错误为空；本地截图与事件记录位于 `_shots/FirstLevelMission`。
- `FirstLevelMissionBrowserTest --campaign --audio` 完整真实输入通关通过，耗时 759.6 秒，零历史基线、零失败，最终截图为 `Scene_Complete.png`。

## 第二版：完整车厢声场

根据试听反馈，增加持续的多人交谈底声及后排集体反应。主对白仍使用上面的完整录音，30 句字幕、递食物事件与列车时间不变。第一版导出的试听文件只有对白；第二版另行导出约 98 秒的完整混音，包含开场五秒、轮轨声、车内人群、主对白、两次后排起哄及结尾四秒。

声音配置集中在 [Data_FirstLevelCarriageSound.mjs](../Data_FirstLevelCarriageSound.mjs)：

- `AudioAmb_CarriageCrowd.mp3`：40.046 秒立体声、多人交谈和零散笑声，由运行时交叉淡化循环；不把人群声加入其他战场环境预设。
- `AudioAmb_CarriageRearCheer.mp3`：7.027 秒单声道集体反应，接在“尝咸淡”和“数子弹”的笑点后；场景约 24.04、46.02 秒触发，声源跟随同车后排的实际乘客，而非固定在世界坐标。
- 轮轨底声沿用已有 `AudioAmb_TrainInterior.mp3`，并提高车厢晃动、装备与衣料碰触的随机播放频率。
- 场景约 55.52 秒听到异响时，人群层用 1.3 秒收至 38%；首弹命中后停止闲聊和起哄，保留行车声，实际停车时切到前线环境。暂停恢复和同预设重载保留人群收声状态。

两个新增素材分别经 Volcengine `seed-audio-1.0` 一次连续生成，没有逐句生成拼接；模型、提示词哈希、成品哈希和声道处理版本记录在 `Audio/Amb/Data_AmbManifest.json` 的 `carriageSources`。主对白、轮轨声和人群底声分轨播放；整段主对白仍没有逐角色三维定位。后排两次反应复用同一完整素材，由不同座位发声。

```powershell
# 默认验证并复用已有成品；不要为重新混音加 --force。
node Taierzhuang1938/Script_SeedAudioCarriageBake.mjs
# 全环境烘焙也保留独立生成的车厢资产与来源；此命令仅处理车厢组。
node Taierzhuang1938/Script_AmbBake.mjs CarriageCrowdSeedAudio
# 本地试听文件不提交进游戏仓库。
node Taierzhuang1938/Script_CarriageSoundscapeRender.mjs --output=C:/Users/Bentl/Downloads/CodexCarriageDialogue_20260910/AudioVoice_CarriageFullSoundscapeV2.mp3
```

完整试听通过 FFmpeg 混音，对两次后排反应加左右位置、低通与短反射；游戏中则经实时总线和真实乘客声源播放，转头、音量设置及环境随机声会影响听感。完整混音测得均方平均 -23.7 dBFS、样本峰值 -3.2 dBFS。技术检查验证文件、播放与时序，不代表人工听审通过。

第二版验证：46 项 quick 检查、`Script_FirstLevelMissionTest.mjs --audio`、AudioTest 及模块登记检查通过；新增断言覆盖双层环境、反应跟随、异常收声、首弹清理、停车切换和重新开始。定向 AmbBake 复跑保留全部床、cue 和生成来源，未发起新生成请求。338 模块 Pages 预览包构建成功。

`FirstLevelMissionBrowserTest --campaign --audio` 完整真实输入通关通过（1055.1 秒，零历史基线、零失败）。浏览器解码得到轮轨床 30 秒、RMS 0.03996；人群床 40.0457 秒、RMS 0.04255，两个实际循环均在播放。车厢段两次后排反应都触发，物理停稳后环境已切到 `firstLevelFront`。本地记录为 `_shots/FirstLevelMission/Data_CarriageAudio.json` 与 `Scene_Complete.png`。
