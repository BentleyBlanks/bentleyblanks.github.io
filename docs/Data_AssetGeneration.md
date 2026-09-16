# 生成工具操作参考

仅在要动 Blender、需要 CLI 或需要回退供应商时查阅。Blender 进程纪律、供应商顺序、音频要求与密钥规则以 [根 AGENTS.md](../AGENTS.md) 为准；本文件的排障经验不额外授权付费或改变任务范围。

这里的 `codex exec` 是内置工具的宿主入口，不是 imagegen 技能的 `scripts/image_gen.py`。后者直接使用图片 API、需要对应密钥与付费授权，不因“CLI”同名就替代本仓供应商顺序；不能把其中一种路径的要求套到另一种路径。

## Blender：按需起、用完关

规则在[根 AGENTS.md](../AGENTS.md)「Blender 源工程」；这里是操作细节。入口只有一个：

```powershell
node scripts/Script_BlenderMcp.mjs start "C:/Users/Bentl/OneDrive/AI/Models/Blender/<Project>/<Scene>.blend" --task <TaskName>
node scripts/Script_BlenderMcp.mjs status
node scripts/Script_BlenderMcp.mjs exec --file <脚本.py>
node scripts/Script_BlenderMcp.mjs stop
```

- `start` 带窗口起 Blender（插件服务在后台模式下会拒绝启动，必须有窗口），把 BlenderMCP 插件服务拉到本 worktree 专用端口，等它应答 `ping` 才返回；本机实测冷启动约 5 秒。已有活实例且 `.blend` 不冲突时直接复用，不重复起进程；要再起一个用 `--new`。
- `exec` 走插件的 `execute_code`，回显的是 Python 侧 `print` 出来的内容 —— 想看什么就 `print` 什么。**多行 Python 用 `--file` 或 `--stdin`**，`--code` 留给单行。`call --type <名字>` 可以发 `get_scene_info`、`get_viewport_screenshot` 等原生命令。
- `stop` 先（可选 `--save`）存盘，再请 Blender 自己退出（正常退出会把 `quit.blend` 落到临时目录，File > Recover Last Session 还能捞回来），超时才 `taskkill /T /F`。
- 完整参数见 `node scripts/Script_BlenderMcp.mjs --help`。

### 状态与日志放在哪

本 worktree 的 `tmp/BlenderMcp/`（`.gitignore` 里的 `tmp/` 已挡住）：

| 文件 | 内容 |
| --- | --- |
| `Instance_<port>.json` | pid、端口、`.blend`、任务名、worktree、session id、启动时间 |
| `Log_<port>.txt` | Blender 的 stdout/stderr。插件全靠 print 汇报，排障先看这个 |
| `Script_BlenderMcpBootstrap.py` | 每次 `start` 重新生成的启动脚本，勿手改 |

`stop` 只处理这些记录里的实例，并且动手前核对该 pid 现在仍然是 `blender.exe`（防 pid 被系统回收复用后误杀无关进程）。别的 worktree、别的会话、用户自己手开的 Blender 都不受影响。

### 钩子怎么兜底

`.claude/settings.json` 挂了两处，都调同一条 `stop`：

- `Stop`（主代理结束一次回复）→ `stop --hook --quiet --save --skip-if-busy`。带 `--save`，所以跨轮成果不会丢；钩子输入里还有 `status=running` 的后台任务时这一轮跳过，免得把后台子代理正在用的 Blender 关掉。
- `SessionEnd`（会话终止）→ `stop --hook --quiet`，把本棵树剩下的全收掉。

刻意**不挂** `SubagentStop`：实测子代理与主代理共用同一个 `session_id`（只有 `agent_id` 不同），一个顺手派去查资料的子代理收尾会把主代理正在用的 Blender 关掉。

钩子是保险不是免死金牌：用户按 Esc 打断不触发 `Stop`，会话被强杀时 `SessionEnd` 也不一定跑得到；`SessionEnd` 官方默认只有 1.5 秒预算（我们把这一条的 `timeout` 抬到了 30 秒）。收尾该自己 `stop`。

改 `.claude/settings.json` 不用重启会话，文件监视器会热加载（2026-09-16 实测）。

### 残留排查

```powershell
Get-CimInstance Win32_Process -Filter "Name='blender.exe'" | Select-Object ProcessId, CreationDate, CommandLine | Format-List
```

命令行里带 `Script_BlenderMcpBootstrap.py` 的就是脚本起的；哪棵树起的看那条路径。`node scripts/Script_BlenderMcp.mjs status --scan` 会把本树记录与本机其它 `blender.exe` 分开列。

### 两个踩过的坑

- **别在看门狗里反复 `addon_utils.enable`。** Blender 的 `addon_utils.enable()` 对一个已经启用的插件会先 `unregister()` 再 `register()`（源码注释写着 caller should `check()` first），等于把 MCP 服务拆了重搭。症状是连着发十几条命令就开始随机 `ECONNREFUSED`，而 `blender.exe` 明明还在。先 `addon_utils.check()` 再决定要不要 enable。
- **端口从 9877 起，9876 永远不用。** 插件在用户偏好里是自动启用的，**任何一个** Blender 一启动就先在 9876 上把服务开起来（早于 `--python`，拦不住），而 Windows 的 `SO_REUSEADDR` 允许两个套接字绑同一个地址 —— 新开的 Blender 那几秒会把 9876 抢过去。只要我们不在 9876 上服务，实例之间就不会互相串线。用户自己在 9876 上手开的那个仍可能被抢几秒，会自愈。

### 需要真正的 MCP 工具接口时

上面那条命令行覆盖 BlenderMCP 的全部命令，正常不需要 MCP 客户端。确实要工具形态时当次临时注册、用完就摘：

```powershell
claude mcp add blender -s local -- blender-mcp
claude mcp remove blender -s local
```

`-s local` 只写进本机的 `~/.claude.json` 且只对当前项目生效。**不要**写进仓库的 `.mcp.json`，也不要进 user scope：Claude Code 会在会话启动时把该项目所有 MCP 服务器全部拉起来并挂到会话结束，本地 stdio 服务器既没有空闲自动关闭、也没有按需拉起，官方文档还明说这类子进程「outlive the session that spawned them」。本机同时开着几十个会话，那样每个会话都会各挂一条 `blender-mcp.exe → python.exe` 的空转进程链（2026-09-16 清掉过 11 条；2026-08-18 清过 138 个）。会话中途 `claude mcp add` 是否对当前会话生效官方未承诺，按下次会话生效预期。

## 内置 imagegen 的 CLI 入口

当前宿主已有内置 imagegen 时直接调用。需要 CLI 入口时，先检查当前 `codex exec --help` 和可用配置，再替换下面的占位符：

```text
codex exec -m <availableModel> --skip-git-repo-check -s workspace-write -C "<absoluteOutputDirectory>" -o "<absoluteLogPath>" "<task>"
```

- 输出目录使用本任务独占目录。提示词给出绝对目标路径，限定只用内置 `image_gen__imagegen`，不调用 Lovart skill 或 `generate_image_gpt_image_2`，并要求报告实际输出路径。
- CLI 的模型配置控制执行任务的 agent，不是图片供应商选择。旧记录中的 Sol + low 只是当时绕过容量问题的配置；以当前可用性和用户配置为准。
- 非 Git 目录可能需要 `--skip-git-repo-check`；沙箱参数须与宿主许可匹配。宿主按命令前缀审批时，单独执行 codex 命令。
- 结合工具结果、错误、文件和图片检查判断成功。历史上的缓存/MCP stderr 噪声可能无关，实际鉴权或生成错误不能一概忽略。
- `pending_confirmation` 不是成功；不以进程退出码 0 代替产物检查，也不绕过确认。

## Lovart 回退

仅在内置入口确实失败或不可用、且该付费路径已获所需授权时使用。检查本机技能是否存在，再读取它的使用说明；常见 Windows 安装位置如下：

```powershell
$env:PYTHONUTF8 = '1'
python "C:/Users/Bentl/.claude/skills/lovart/scripts/agent_skill.py" <subcommand>
```

Windows 的 `python3` 可能指向 Store 别名；使用已确认可用的解释器。旧环境使用 UTF-8 读取本地中文状态。若返回项目不存在，先核对项目状态；需要时创建新的项目，不把该错误当作鉴权失败反复重试。按张计费。

## 即梦 / Seedream 回退

前两级确实失败或不可用时使用。下面是已记录的 Seedream 5.0 Pro 命令形状，执行前以当前 CLI 帮助核对参数：

```text
dreamina text2image --prompt="<prompt>" --model_version=5.0Pro --resolution_type=2k --ratio=16:9 --poll=180
```

模型参数拼写为 `5.0Pro`；`--resolution_type` 必填。宽高成对指定时不再传比例。未在首轮等待内完成时，用返回的 submit id 查询同一任务（`query_result` / `list_task`），避免重复提交计费；余额入口为 `user_credit`。
