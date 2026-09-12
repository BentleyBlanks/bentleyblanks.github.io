# TunnelLight1943 验证与工具入口

按改动影响读取本文件，协作与发布遵循 [根规范](../../AGENTS.md)。浏览器证据使用本任务检出，画面变化先本地查看实际结果，验收媒体留在忽略目录。

## 验证

自动通关的驱动器要走进判定区才按得响：`GetBeatTarget` 交出 `reach`（＝zone 半宽），走位与按键用同一个数；新加窄判定区不用迁就常量，但 zone 半宽别小到人挤不进去。

命令从本任务 worktree 根执行。运行时变化执行冒烟与场景体检；改章节入口或跳幕追加 DebugJump，改声音追加 BgmTest，改渲染追加 RenderHealth，改场景摆位追加深度体检。共享底座变化覆盖全部受影响的检查。

```powershell
node TunnelLight1943/Script_SmokeTest.mjs
node TunnelLight1943/Script_SceneAudit.mjs --quiet
# 以下按影响追加
node TunnelLight1943/Script_DebugJumpTest.mjs
node TunnelLight1943/Script_BgmTest.mjs
node TunnelLight1943/Script_RenderHealthTest.mjs
node TunnelLight1943/Script_DepthAudit.mjs
```

纯说明整理检查内容、引用与 diff，不触发全八章回归；文档中的可执行示例有变化时核对相关脚本及参数。`Script_Cli.mjs doctor` 用于需要核查工作区、缓存或端口的任务。

使用 npm scripts 前用 `npm prefix` 核对实际项目根；它按目录查找 package.json，并不会因为使用 worktree 或进入子目录就自动切到共享主检出。依赖按当前 Node 模块解析和安装位置检查，不假定兄弟 worktree 能继承主检出的 node_modules。

改完某一拍，最快的自检是把它单独跑一遍再看一眼：

```bash
node TunnelLight1943/Script_Cli.mjs state c1_well --x 43.0 --input "e,d*300"
```

## 定位与状态

已知位置时可直接查源码；需要定位可用 `Script_Cli.mjs where <片段>`，查节拍用 `beat <id>`，查状态用 `state <id>`。改动画先用 `anims/anim` 或 F4 工作台确定目标。缺少证据时允许定向诊断；复用能力才补入 CLI，一次性探针留本地。完整子命令和执行次序见 [Cli.md](Cli.md)。

## 维护指令

入口只留共同契约、当前状态及路由。专项规则放对应分册，写清适用范围、约束原因与测试／截图判据；事故过程、日期、旧决定与当时实测数留 `Data_DesignHistory.md`。数值引用代码常量，避免多份说明维护同一预算。
