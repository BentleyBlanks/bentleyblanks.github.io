# 生成工具操作参考

仅在需要 CLI 或回退供应商时查阅。供应商顺序、音频要求与密钥规则以 [根 AGENTS.md](../AGENTS.md) 为准；本文件的排障经验不额外授权付费或改变任务范围。

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
