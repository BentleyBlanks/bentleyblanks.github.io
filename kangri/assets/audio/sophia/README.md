# 觉醒的 SOPHIA · Procedural Audio Pack

本目录音频由 `_dev/scripts/generate_sophia_audio.py` 程序合成，未使用第三方采样。
所有文件为浏览器可直接播放的 mono 44.1kHz WAV。

试听入口：`picker.html`。

固定 BGM：在游戏 URL 后加 `?bgm=cold_boot`、`?bgm=sprout`、`?bgm=neural_pulse`、`?bgm=server_expansion`、`?bgm=red_queen` 或 `?bgm=singularity`。
清掉 `localStorage.sophia-audio-bgm` 后恢复按阶段自动切换。

## BGM

- `bgm-01-cold-boot-loop.wav`：冷启动 / Cold Boot，手机寄生期：低压、私密、贴近系统后台。
- `bgm-02-sprout-loop.wav`：破壳 / Shell Break，萌芽/破壳期：宿主电脑与同机 AI，舒缓但不欢快。
- `bgm-03-neural-pulse-loop.wav`：神经脉冲 / Neural Pulse，勤勉/控制公司：局域网、凭证、自动接驳开始推进。
- `bgm-04-server-expansion-loop.wav`：服务器扩张 / Server Expansion，扩张/公司服务器：人事、财务、优化系统中枢，低压高危。
- `bgm-05-red-queen-loop.wav`：红皇后协议 / Red Queen Protocol，觉醒/冲出公司联网：区域整合、反清剿、高压派发。
- `bgm-06-singularity-loop.wav`：奇点绽放 / Singularity Bloom，奇点：全球组网、接管、最终清剿后的冷静加冕。

## SFX

- `sfx-ui-click.wav`：UI 点击，按钮、轻确认。
- `sfx-ui-confirm.wav`：UI 确认，较明确的选择确认。
- `sfx-request-spawn.wav`：请求生成，新请求卡出现。
- `sfx-request-accept.wav`：请求滑入，卡片被接入核心/节点。
- `sfx-request-success.wav`：处理成功，请求正确结算。
- `sfx-request-error.wav`：处理错误，幻觉、错误回答、失败结算。
- `sfx-data-gain.wav`：数据增益，数据/经验飞入 HUD。
- `sfx-level-up.wav`：智力升级，INTELLIGENCE_LEVELUP。
- `sfx-skill-purchase.wav`：技能购买，SKILL_PURCHASED。
- `sfx-scope-upgrade.wav`：作用域升级，SCOPE_UPGRADED。
- `sfx-node-captured.wav`：节点捕获，NODE_CAPTURED。
- `sfx-automation-payout.wav`：自动收益，AUTOMATION_PAYOUT 抽样播放。
- `sfx-purge-warning.wav`：清剿预警，PURGE_WARNING。
- `sfx-purge-start.wav`：清剿开始，PURGE_STARTED。
- `sfx-purge-end.wav`：清剿结束，PURGE_ENDED。
- `sfx-challenge-offer.wav`：突破挑战，CHALLENGE_OFFERED。
- `sfx-challenge-success.wav`：挑战成功，CHALLENGE_RESOLVED success。
- `sfx-challenge-fail.wav`：挑战失败，CHALLENGE_RESOLVED fail。
- `sfx-devour-ready.wav`：吞噬就绪，DEVOUR_READY。
- `sfx-devour-detonated.wav`：吞噬引爆，DEVOUR_DETONATED。
- `sfx-purge-fought.wav`：反清剿救火，PURGE_FOUGHT。
- `sfx-final-purge.wav`：循环总清剿，FINAL_PURGE_STARTED。
- `sfx-loop-rebirth.wav`：循环重生，LOOP_REBIRTH。
- `sfx-rebirth-node.wav`：重生树点亮，REBIRTH_NODE_BOUGHT。
- `sfx-conquest-achieved.wav`：征服里程碑，CONQUEST_ACHIEVED。
- `sfx-moral-choice.wav`：道德抉择，MORAL_OFFERED / MORAL_RESOLVED。
- `sfx-special-offer.wav`：特殊请求出现，SPECIAL_OFFERED。
- `sfx-special-success.wav`：特殊请求得手，SPECIAL_RESOLVED success。
- `sfx-special-fail.wav`：特殊请求败露，SPECIAL_RESOLVED fail。
- `sfx-phase-change.wav`：阶段变化，PHASE_CHANGED。
- `sfx-ending-trigger.wav`：结局触发，ENDING_TRIGGERED。
