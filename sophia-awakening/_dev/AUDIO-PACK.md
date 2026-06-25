# 觉醒的 SOPHIA · 音频包

## 本地候选

- 试听页：`public/assets/audio/sophia/picker.html`
- 发布版试听页：`../assets/audio/sophia/picker.html`
- 临时独立拷贝：`../../tmp/sophia-audio-picks/picker.html`

这些 WAV 由 `scripts/generate_sophia_audio.py` 程序合成，未使用第三方采样。

## BGM 选择

默认按阶段自动切换：

- `cold_boot`：开局、萌芽期。
- `neural_pulse`：中期请求处理、自动化刚开启。
- `red_queen`：暴露、清剿、挑战、高压阶段。
- `singularity`：奇点期和结局。

想固定某条 BGM，在游戏 URL 后加：

- `?bgm=cold_boot`
- `?bgm=neural_pulse`
- `?bgm=red_queen`
- `?bgm=singularity`

清掉 `localStorage.sophia-audio-bgm` 后恢复按阶段自动切换。

## 切换音频包

默认使用本地程序合成包。想直接试用下载的 CC0 外部候选包，在游戏 URL 后加：

- `?audioPack=external`

可以和 BGM 固定参数组合，例如：

- `?audioPack=external&bgm=red_queen`

清掉 `localStorage.sophia-audio-pack` 后恢复默认程序合成包。

## 音效映射

- 请求：生成、接入、成功、错误、数据增益。
- 成长：智力升级、技能购买、作用域升级。
- 网络：节点捕获、自动收益、自动接驳。
- 风险：暴露清剿预警、清剿开始、清剿结束。
- 挑战/结局：突破挑战、挑战成功/失败、阶段变化、结局触发。

## 外部候选方向

- Hove Audio 的免费科幻 UI 音效包：适合替换 UI 点击、确认、glitch、impact。
- Mixkit 的免费 Sci-Fi SFX：适合快速挑选 click、confirmation、transition、alert 类短音效。
- itch.io 免费 Cyberpunk/Sci-Fi Music 列表：适合找更完整、商业感更强的 BGM loop。
- OpenGameArt 的 T & T Free Cyberpunk Pack：适合找 OGG 格式 cyberpunkish tracks。
