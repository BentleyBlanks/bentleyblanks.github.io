# 车厢配乐与音效修订（2026-09-11）

本批范围为用户指定的 7 条音频，供应商统一为 Volcengine `seed-audio-1.0`。
生成入口为 `Script_SeedAudioCarriageReviewBake.mjs`，密钥仅在请求时读取环境变量
`VOLCENGINE_API_KEY`。每条一次连续生成，原始 take 按提示词哈希缓存；失败重试不扩展变体数量。

## 游戏接入

- `planeDrone` 换为 `AudioSfx_PlaneEngine.mp3`。从稳定巡航录音制作 350 ms 首尾交叉淡化，
  循环仍跟随飞机位置，保留 `MoveVoice` / `SetDoppler` / `StopVoice` 契约。
- `explosionNear` 换为一条 `AudioSfx_ExplosionNearReplacement.mp3`：短促冲击与碎土。
  中远距离保留既有素材；旧 `Script_SeedAudioExplosionBake.mjs` 只重建 Mid/Far，避免覆盖新版近距 cue。
- 两条实际资产、提示词、原始及成品 SHA-256 登记在 SFX manifest；`Data_SfxSources` 同步登记。
  重装本批两条文件使用 `--install-sfx`，不会生成新 take。

原持续引擎配方存活一小时，音频编辑器却丢弃播放句柄，因此换音效或退出仍会响。
现在编辑器持有自己的试听句柄，“停止音效”、换音效和退出均清理；延迟连播可取消，
连续声不会叠播五份，并在 10 秒后自动停止。不停止玩法自己持有的飞机声源。
列表改称“采样”，避免把 AI 生成音频误标成现场实录。

## 本地试听内容

试听页、4 首音乐、独立的“爆炸→闷听→耳鸣”、原始 take 和 QA 截图均在本任务
worktree 的 `tmp/AudioCarriageReview/`，不提交验收页或自动替换默认车厢配乐。

| 文件 ID | 方向 |
| --- | --- |
| CarriageMilitaryDryWit | COD4/5/14 安静叙事方向：低弦、轻军鼓、木管拨弦问答 |
| CarriageMilitaryWindow | COD4/5/14 战友间歇方向：低音吉他、木质打击、悠闲摇摆 |
| CarriageCinematicQuietSmile | 汉斯季默式克制电影方向：钢琴三音、暖低弦、轻电子底色 |
| CarriageCinematicCompanions | 汉斯季默式叙事方向：中提琴、巴松、圆号与弱拍马林巴 |
| ExplosionToTinnitus | 一次爆炸后连续转为闷听和较轻耳鸣，再逐渐消退 |

音乐提示词要求约 100 秒、轻微压迫和克制幽默、为对白留白、无战斗高潮、全新旋律。
生成意图与客观质检不能代替用户对风格和听感的试听判断。
音效有声段 RMS 目标 −25 dBFS，音乐整段 RMS 目标 −27 dBFS，容差 ±0.5 dB，峰值 ≤ −1 dBFS。

## 验证

`Script_AudioTest.mjs` 覆盖采样持续源、多普勒、停止按钮、切换、取消延迟连播、10 秒自动停止、
退出清理及不误停玩法声源。音频域 prepush 和 `Script_ModuleGraphTest.mjs` 验包与缓存版本。
本地试听页使用原生音频控件，同一时间只播一条，“全部停止”将所有播放头归零。

本次生成的 7 个文件均通过时长、解码与响度检查。引擎解码循环边界相邻样本差为 0.002895，
低于其正常相邻样本差的 99 分位 0.009863。
全库 `Script_AudioNormalize.mjs --report` 仍有 5 个既有失败：`AudioSfx_GoreSever_01/02`、
`AudioSfx_GoreLimbLand_01/02` 与 `AudioAmb_CarriageRearCheer`。已逐文件核对其 Git blob 与任务
起点完全一致；本次新增的 `PlaneEngine` 和 `ExplosionNearReplacement` 均显示 OK，不重写旧素材。

交付验证：音频域 prepush 的 26 项 Node 检查通过；后续 3 项整场景浏览器检查受共享测试槽
长期排队影响未执行，不报告为全套通过。改用无 WebGL 场景的真实 WebAudio/DOM 夹具，
直接执行 `Script_AudioTest` 新增的同一段生命周期回归，8 项全部通过；游戏实际编辑器的
采样标识、单实例循环和停止按钮，以及本地 7 条试听控件另已实测并查看截图。
