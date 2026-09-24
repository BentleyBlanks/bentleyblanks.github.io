// 按需起、用完关的 Blender 控制口：把「BlenderMCP 那套能力」从常驻 MCP 服务器
// 改成一条本地命令行。
//
// 为什么不用 .mcp.json 里常驻注册 blender：
//   Claude Code 在会话启动时就把该项目所有 MCP 服务器全部拉起来，并且一直挂到
//   会话结束，没有空闲超时。这台机器上同时开着几十个会话，于是每个会话各挂一条
//   blender-mcp.exe → python.exe 的进程链，而 Blender 本体根本没开，全是空转。
//   实际干活的两轮（2026-09-15/16）也没用那个客户端：都是自己带窗口起 Blender、
//   往插件的回环端口发 execute_code。这个脚本把那条路固化下来。
//
// 用法（详见 --help）：
//   node scripts/Script_BlenderMcp.mjs start <可选 .blend> [--port N] [--task Name]
//   node scripts/Script_BlenderMcp.mjs status
//   node scripts/Script_BlenderMcp.mjs exec --code "import bpy; print(bpy.app.version)"
//   node scripts/Script_BlenderMcp.mjs stop
//
// 纪律：一轮 Blender 活做完必须 stop。`.claude/settings.json` 里的 Stop 与
// SessionEnd 钩子会兜底调用 stop，但钩子只是保险，不是免死金牌 —— 用户按 Esc
// 打断不触发 Stop，会话被强杀时 SessionEnd 也不一定跑得到。
//
// 只杀自己起的进程：每次 start 把 pid/端口/blend 记进本 worktree 的
// tmp/BlenderMcp/Instance_<port>.json，stop 只处理这个目录里的记录，并且在
// 动手前核对 pid 现在仍然是 blender.exe（防 pid 复用误杀）。别的 worktree、
// 别的会话、用户自己手开的 Blender 都不受影响。
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const STATE_DIR = path.join(REPO_ROOT, "tmp", "BlenderMcp");
const BOOTSTRAP_PATH = path.join(STATE_DIR, "Script_BlenderMcpBootstrap.py");
// 刻意从 9877 起，9876 永远不用：插件在用户偏好里是自动启用的，**任何一个** Blender
// 一启动就会先在 9876 上把服务开起来（早于 --python，拦不住），而 Windows 的
// SO_REUSEADDR 允许两个套接字绑同一个地址。只要我们不在 9876 上服务，新开的
// Blender 那几秒就抢不到任何一个在用的实例。多开时顺着往上找空位。
const PORT_MIN = 9877;
const PORT_MAX = 9896;
const DEFAULT_START_TIMEOUT_SEC = 180;
const DEFAULT_CALL_TIMEOUT_SEC = 600;
const DEFAULT_STOP_GRACE_SEC = 8;

const HELP = `Script_BlenderMcp.mjs — 按需起、用完关的 Blender 控制口

  node scripts/Script_BlenderMcp.mjs <command> [options]

命令
  start [blendPath]   带窗口起 Blender 并在回环上启动 BlenderMCP 插件服务，
                      等到端口能应答 ping 才返回。本 worktree 已有活实例且
                      .blend 不冲突时直接复用（不重复起进程）。
  status              列出本 worktree 记录在案的实例：pid、端口、是否还活着、
                      打开的 .blend。带 --scan 时另列本机所有 blender.exe。
  exec                往实例发一段 Python（BlenderMCP 的 execute_code），
                      回显 Python 侧 print 出来的内容。
  call                发任意一条 BlenderMCP 命令（get_scene_info、
                      get_viewport_screenshot…），回显 JSON。
  stop                关掉本 worktree 起的实例：先请 Blender 自己退出
                      （会留下可恢复的 quit.blend），超时才强杀进程树。
  help                显示本说明。

start 选项
  --blend <path>      要打开的 .blend（也可以直接写成位置参数）。不给就开空场景。
  --port <n>          固定端口；默认在 ${PORT_MIN}..${PORT_MAX} 里挑第一个空闲的。
  --task <name>       任务名，写进 pid 文件和场景自定义属性 BlenderMcpTask，排查用。
  --blender <exe>     指定 blender.exe；默认按 BLENDER_EXE 环境变量、
                      C:\\Program Files\\Blender Foundation\\Blender *、PATH 依次找。
  --timeout <sec>     等端口就绪的上限，默认 ${DEFAULT_START_TIMEOUT_SEC}。
  --new               不复用现有实例，强制再起一个。
  --json              以 JSON 输出结果。

status 选项
  --scan              另列本机所有 blender.exe（含别的 worktree、用户手开的）。
  --json              以 JSON 输出。

exec / call 选项
  --port <n>          指定实例；不给就用本 worktree 唯一的活实例。
  --code <python>     exec：直接给一段 Python。
  --file <path>       exec：从文件读 Python。
  --stdin             exec：从标准输入读 Python。
  --type <name>       call：命令名，默认 ping。
  --params <json>     call：参数对象，默认 {}。
  --timeout <sec>     等应答的上限，默认 ${DEFAULT_CALL_TIMEOUT_SEC}。
  --json              以 JSON 输出整个应答。

stop 选项
  --port <n>          只关这一个实例；默认关本 worktree 记录在案的全部实例。
  --save              退出前先 bpy.ops.wm.save_mainfile()（只对已存过盘的工程有效）。
  --grace <sec>       等 Blender 自己退出的上限，默认 ${DEFAULT_STOP_GRACE_SEC}（钩子模式 3），超时强杀。
  --hook              钩子模式：从标准输入吞掉 Claude Code 的钩子 JSON，顺带按里面的
                      cwd 找到真正那棵 worktree；不打印无关内容，且无论如何都以 0
                      退出（不阻塞会话结束）。
  --skip-if-busy      钩子输入里还有 status=running 的后台任务时这一轮不收
                      （给 Stop 钩子用：别把后台子代理正在用的 Blender 关掉）。
  --quiet             没有实例时不出声。
  --json              以 JSON 输出结果。

例子
  node scripts/Script_BlenderMcp.mjs start "C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Foo/Scene_Foo.blend" --task Foo
  node scripts/Script_BlenderMcp.mjs exec --code "import bpy; print(bpy.app.version_string)"
  node scripts/Script_BlenderMcp.mjs exec --file scripts/tmp/Build.py
  node scripts/Script_BlenderMcp.mjs call --type get_scene_info
  node scripts/Script_BlenderMcp.mjs stop --save

真正需要 MCP 工具接口（而不是这条命令行）时，当次临时注册、用完就摘：
  claude mcp add blender -s local -- blender-mcp
  claude mcp remove blender -s local
别写进 .mcp.json，也别进 user scope —— 那会让本机每个会话都各挂一条空转进程链。
`;

// ---------------------------------------------------------------- 参数解析

function ParseArgs(argv) {
  const opts = { command: "", positional: [], flags: {} };
  const takesValue = new Set([
    "blend", "port", "task", "blender", "timeout", "code", "file",
    "type", "params", "grace",
  ]);
  let index = 0;
  if (argv[index] && !argv[index].startsWith("-")) opts.command = argv[index++];
  for (; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === "--help" || raw === "-h") { opts.flags.help = true; continue; }
    if (!raw.startsWith("--")) { opts.positional.push(raw); continue; }
    const body = raw.slice(2);
    const eq = body.indexOf("=");
    const name = eq >= 0 ? body.slice(0, eq) : body;
    if (takesValue.has(name)) {
      const value = eq >= 0 ? body.slice(eq + 1) : argv[++index];
      if (value === undefined) throw new Error(`--${name} 缺少取值`);
      opts.flags[name] = value;
    } else {
      if (eq >= 0) throw new Error(`--${name} 不接受取值`);
      opts.flags[name] = true;
    }
  }
  return opts;
}

function NumberFlag(flags, name, fallback) {
  if (flags[name] === undefined) return fallback;
  const value = Number(flags[name]);
  if (!Number.isFinite(value)) throw new Error(`--${name} 需要一个数字，收到 ${flags[name]}`);
  return value;
}

// ---------------------------------------------------------------- 实例记录

// 钩子有可能不是在本 worktree 里被调起来的：官方的 ${CLAUDE_PROJECT_DIR}
// 指的是「会话启动时的项目根」，worktree 场景下不跟着走，真正跟着走的是钩子
// 输入 JSON 里的 cwd。所以钩子模式下把 cwd 那棵树的记录目录也一起扫。
const extraStateDirs = [];
let hookPayload = {};

function AllStateDirs() {
  return [...new Set([STATE_DIR, ...extraStateDirs])].filter((dir) => fs.existsSync(dir));
}

function EnsureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function ReadInstances() {
  const records = [];
  for (const dir of AllStateDirs()) {
    for (const name of fs.readdirSync(dir)) {
      if (!/^Instance_\d+\.json$/.test(name)) continue;
      const file = path.join(dir, name);
      try {
        // 去 BOM：手工用 PowerShell 的 Set-Content 补过记录时会带 BOM，JSON.parse 认不了。
        const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
        records.push({ ...JSON.parse(text), stateFile: file });
      } catch {
        // 记录坏了就当没有：宁可漏杀也不要把 stop 整条卡住。
        fs.rmSync(file, { force: true });
      }
    }
  }
  return records.sort((left, right) => left.port - right.port);
}

function WriteInstance(record) {
  EnsureStateDir();
  const file = path.join(STATE_DIR, `Instance_${record.port}.json`);
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return file;
}

function DropInstance(record) {
  if (record && record.stateFile) fs.rmSync(record.stateFile, { force: true });
  else fs.rmSync(path.join(STATE_DIR, `Instance_${record.port}.json`), { force: true });
}

// ---------------------------------------------------------------- 进程查询

// pid 会被系统回收复用，所以判断「还活着」必须连映像名一起核对，
// 否则 stop 有机会把一个刚好捡到同号 pid 的无关进程打掉。
function ProcessImageName(pid) {
  const result = spawnSync(
    "tasklist",
    ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) return "";
  const line = (result.stdout || "").trim().split(/\r?\n/)[0] || "";
  const match = line.match(/^"([^"]+)"/);
  return match ? match[1] : "";
}

function IsLiveBlender(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  return ProcessImageName(pid).toLowerCase() === "blender.exe";
}

function ListMachineBlenders() {
  const result = spawnSync(
    "tasklist",
    ["/FI", "IMAGENAME eq blender.exe", "/FO", "CSV", "/NH"],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) return [];
  return (result.stdout || "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.match(/^"blender\.exe","(\d+)"/i))
    .filter(Boolean)
    .map((match) => Number(match[1]));
}

function KillTree(pid) {
  spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { encoding: "utf8", windowsHide: true });
}

// ---------------------------------------------------------------- 端口与协议

function PortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

async function PickPort(taken) {
  for (let port = PORT_MIN; port <= PORT_MAX; port += 1) {
    if (taken.has(port)) continue;
    if (await PortFree(port)) return port;
  }
  throw new Error(`${PORT_MIN}..${PORT_MAX} 全被占了；先 stop 掉旧实例，或用 --port 指定`);
}

// 旧插件直接收发 JSON；Blender 5.2 内置扩展以 NUL 结尾。
// 两者都在收包时攒块并解析完整 JSON。
function SendCommand(port, payload, timeoutMs, protocol = "legacy") {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    let buffer = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error); else resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => {
      if (protocol === "extension") {
        const code = payload.type === "ping" ? "result = {'pong': True}" : payload.params?.code;
        if (!code) { finish(new Error(`Blender 5.2 extension does not support ${payload.type}`)); return; }
        socket.write(JSON.stringify({ type: "execute", code, strict_json: false }) + "\0");
      } else socket.write(JSON.stringify(payload));
    });
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8").replace(/\0/g, "");
      try {
        finish(null, JSON.parse(buffer));
      } catch {
        // 还没收全，继续等。
      }
    });
    socket.on("timeout", () => finish(new Error(`等 ${port} 应答超时（${Math.round(timeoutMs / 1000)}s）`)));
    socket.on("error", (error) => finish(error));
    socket.on("close", () => {
      if (settled) return;
      if (!buffer) finish(new Error(`${port} 上的连接被对端关掉了（Blender 可能已退出）`));
      else finish(new Error(`${port} 的应答不是完整 JSON：${buffer.slice(0, 200)}`));
    });
  });
}

async function Ping(port, timeoutMs = 3000) {
  try {
    const reply = await SendCommand(port, { type: "ping" }, timeoutMs, "extension");
    if (reply?.status === "ok" && reply?.result?.pong) return true;
  } catch {
    // Older BlenderMCP uses newline-free JSON and supports a dedicated ping.
  }
  try { return (await SendCommand(port, { type: "ping" }, timeoutMs)).status === "success"; }
  catch { return false; }
}

async function SendCompatibleCommand(port, payload, timeoutMs) {
  try {
    const probe = await SendCommand(port, { type: "ping" }, Math.min(timeoutMs, 2000), "extension");
    if (probe?.status === "ok" && probe?.result?.pong) {
      const reply = await SendCommand(port, payload, timeoutMs, "extension");
      if (reply.status === "ok") return { status: "success", result: { result: reply.stdout || JSON.stringify(reply.result) } };
      return reply;
    }
  } catch { /* The legacy add-on uses a different socket protocol. */ }
  return SendCommand(port, payload, timeoutMs);
}

function Sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------- 找 blender.exe

function FindBlenderExe(explicit) {
  const candidates = [];
  if (explicit) candidates.push(explicit);
  if (process.env.BLENDER_EXE) candidates.push(process.env.BLENDER_EXE);
  for (const base of ["C:/Program Files/Blender Foundation", "C:/Program Files (x86)/Blender Foundation"]) {
    if (!fs.existsSync(base)) continue;
    const versions = fs.readdirSync(base)
      .filter((name) => /^Blender /.test(name))
      // 新版本在前：5.1 排在 4.2 前面。
      .sort((left, right) => CompareVersion(right, left));
    for (const name of versions) candidates.push(path.join(base, name, "blender.exe"));
  }
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  const probe = spawnSync("where", ["blender"], { encoding: "utf8", windowsHide: true });
  if (probe.status === 0) {
    const first = (probe.stdout || "").trim().split(/\r?\n/)[0];
    if (first && fs.existsSync(first)) return first;
  }
  throw new Error("没找到 blender.exe；用 --blender 指定，或设 BLENDER_EXE 环境变量");
}

function CompareVersion(left, right) {
  const parse = (text) => (text.match(/(\d+)/g) || []).map(Number);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff) return diff;
  }
  return 0;
}

// ---------------------------------------------------------------- bootstrap

// 每次 start 重新写一遍：脚本改了之后不会有一份陈年 bootstrap 还在用。
function WriteBootstrap() {
  EnsureStateDir();
  const lines = [
    "# 由 scripts/Script_BlenderMcp.mjs 生成，勿手改（每次 start 覆盖）。",
    "# 职责：启用 blender_mcp 插件、把服务拉到本会话指定的端口，并挂一个常驻",
    "# 看门狗定时器 —— read_homefile / read_factory_settings 会换掉 scene，",
    "# 把端口打回默认值甚至把服务打掉，看门狗负责再拉起来。",
    "#",
    "# 坑（2026-09-16 实测）：addon_utils.enable() 对一个**已经启用**的插件",
    "# 会先 unregister() 再 register()（Blender 自己的源码注释写着 caller",
    "# should 'check()' first）。照着每 2 秒 enable 一次，等于每 2 秒把 MCP",
    "# 服务拆了重搭：客户端连上去随机 ECONNREFUSED，症状是「刚才还能用，",
    "# 连着发几条就断」。所以这里必须先 addon_utils.check() 再决定要不要 enable。",
    "import os",
    "import traceback",
    "",
    "import bpy",
    "import addon_utils",
    "",
    "PORT = int(os.environ.get('BLENDER_MCP_PORT', '9876'))",
    "TASK = os.environ.get('BLENDER_MCP_TASK', '')",
    "ADDON = 'blender_mcp'",
    "",
    "",
    "def ServerObject():",
    "    return getattr(bpy.types, 'blendermcp_server', None)",
    "",
    "",
    "def AddonEnabled():",
    "    try:",
    "        return bool(addon_utils.check(ADDON)[1])",
    "    except Exception:",
    "        return False",
    "",
    "def EnsureExtensionServer():",
    "    # Blender 5.2 ships MCP as the bl_ext.user_default.mcp extension.",
    "    try:",
    "        from bl_ext.user_default.mcp import mcp_to_blender_server as server, execute_interactive",
    "    except ImportError:",
    "        return None",
    "    addon_name = 'bl_ext.user_default.mcp'",
    "    if not addon_utils.check(addon_name)[1]:",
    "        addon_utils.enable(addon_name, default_set=False, persistent=True)",
    "    if server.is_running():",
    "        sock = getattr(server._state, 'sock', None)",
    "        if sock and sock.getsockname()[1] == PORT:",
    "            return True",
    "        # A user preference may have autostarted the default 9876 port.",
    "        server.stop()",
    "    server.start('127.0.0.1', PORT)",
    "    if not bpy.app.timers.is_registered(execute_interactive.run):",
    "        bpy.app.timers.register(execute_interactive.run, first_interval=0.25, persistent=True)",
    "    return True",
    "",
    "",
    "def PreclaimServer():",
    "    # 插件的 register() 会照 scene 里的端口（默认 9876）自动起一遍服务。",
    "    # 先按本会话端口把服务对象建好并起起来，register() 看见「已经在跑」就不会",
    "    # 再去碰 9876。注意：插件在用户偏好里是自动启用的，那种情况下 register()",
    "    # 早在 Blender 启动时就跑完了（早于 --python），这一步会直接返回 —— 真正",
    "    # 让我们躲开 9876 的是端口范围从 9877 起（见 PORT_MIN 那里的说明）。",
    "    if ServerObject() is not None:",
    "        return",
    "    try:",
    "        import blender_mcp as addon_module",
    "        server = addon_module.BlenderMCPServer(port=PORT)",
    "        server.start()",
    "        if getattr(server, 'running', False):",
    "            bpy.types.blendermcp_server = server",
    "    except Exception:",
    "        traceback.print_exc()",
    "",
    "",
    "def EnsureServer():",
    "    if EnsureExtensionServer() is not None:",
    "        return True",
    "    PreclaimServer()",
    "    if not AddonEnabled():",
    "        try:",
    "            addon_utils.enable(ADDON, default_set=False, persistent=True)",
    "        except Exception:",
    "            traceback.print_exc()",
    "            return False",
    "    server = ServerObject()",
    "    if server is not None and getattr(server, 'running', False) and getattr(server, 'port', None) == PORT:",
    "        return True",
    "    # 插件 register() 自己会按 scene 里的端口自动起服，未必是我们要的那个；",
    "    # 统一先停掉，再按本会话端口重起。",
    "    if server is not None:",
    "        try:",
    "            server.stop()",
    "        except Exception:",
    "            pass",
    "        try:",
    "            del bpy.types.blendermcp_server",
    "        except Exception:",
    "            pass",
    "    for scene in bpy.data.scenes:",
    "        try:",
    "            scene.blendermcp_port = PORT",
    "        except Exception:",
    "            pass",
    "    try:",
    "        bpy.ops.blendermcp.start_server()",
    "    except Exception:",
    "        traceback.print_exc()",
    "        return False",
    "    server = ServerObject()",
    "    return bool(server is not None and getattr(server, 'running', False))",
    "",
    "",
    "def StampTask():",
    "    if not TASK:",
    "        return",
    "    for scene in bpy.data.scenes:",
    "        try:",
    "            scene['BlenderMcpTask'] = TASK",
    "        except Exception:",
    "            pass",
    "",
    "",
    "def Watchdog():",
    "    try:",
    "        EnsureServer()",
    "    except Exception:",
    "        traceback.print_exc()",
    "    return 2.0",
    "",
    "",
    "try:",
    "    EnsureServer()",
    "    StampTask()",
    "except Exception:",
    "    traceback.print_exc()",
    "",
    "bpy.app.timers.register(Watchdog, first_interval=1.0, persistent=True)",
    "print('BlenderMcp bootstrap armed on port %d' % PORT)",
    "",
  ];
  fs.writeFileSync(BOOTSTRAP_PATH, lines.join("\n"), "utf8");
  return BOOTSTRAP_PATH;
}

// ---------------------------------------------------------------- start

async function LiveInstances() {
  const live = [];
  for (const record of ReadInstances()) {
    if (!IsLiveBlender(record.pid)) { DropInstance(record); continue; }
    live.push(record);
  }
  return live;
}

async function CommandStart(opts) {
  const blendArg = opts.flags.blend || opts.positional[0] || "";
  const blendPath = blendArg ? path.resolve(blendArg) : "";
  if (blendPath && !fs.existsSync(blendPath)) throw new Error(`.blend 不存在：${blendPath}`);

  const live = await LiveInstances();
  if (!opts.flags.new) {
    for (const record of live) {
      const sameBlend = !blendPath || path.resolve(record.blend || "") === blendPath;
      const samePort = opts.flags.port === undefined || Number(opts.flags.port) === record.port;
      if (!sameBlend || !samePort) continue;
      if (!(await Ping(record.port))) continue;
      return Report(opts, { action: "reused", ...record });
    }
  }

  const taken = new Set(live.map((record) => record.port));
  const port = opts.flags.port === undefined
    ? await PickPort(taken)
    : NumberFlag(opts.flags, "port", PORT_MIN);
  if (taken.has(port)) throw new Error(`端口 ${port} 已经被本 worktree 的另一个实例占着`);

  const exe = FindBlenderExe(opts.flags.blender);
  const bootstrap = WriteBootstrap();
  const args = [];
  if (blendPath) args.push(blendPath);
  args.push("--python", bootstrap);

  // Blender 的插件全靠 print 汇报（"Server thread stopped"、"Failed to start
  // server: ..."），带窗口起的时候这些话没人看得到。接到文件里，排障时有据可查。
  const logPath = path.join(STATE_DIR, `Log_${port}.txt`);
  const logFd = fs.openSync(logPath, "w");
  const child = spawn(exe, args, {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    windowsHide: false,
    env: {
      ...process.env,
      BLENDER_MCP_PORT: String(port),
      BLENDER_MCP_TASK: String(opts.flags.task || ""),
    },
  });
  child.unref();
  fs.closeSync(logFd);

  const record = {
    port,
    pid: child.pid,
    blend: blendPath,
    task: String(opts.flags.task || ""),
    exe,
    log: logPath,
    worktree: REPO_ROOT,
    sessionId: process.env.CLAUDE_CODE_SESSION_ID || "",
    startedAt: new Date().toISOString(),
  };
  record.stateFile = WriteInstance(record);

  const timeoutMs = NumberFlag(opts.flags, "timeout", DEFAULT_START_TIMEOUT_SEC) * 1000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!IsLiveBlender(record.pid)) {
      DropInstance(record);
      throw new Error(`Blender（pid ${record.pid}）起来后又退出了；手动跑一次 "${exe}" --python "${bootstrap}" 看报错`);
    }
    if (await Ping(port, 2000)) {
      return Report(opts, { action: "started", ...record, readyMs: Date.now() - Date.parse(record.startedAt) });
    }
    await Sleep(1000);
  }
  throw new Error(`Blender（pid ${record.pid}）起来了但 ${port} 在 ${timeoutMs / 1000}s 内没有应答 ping；实例记录已留下，可以 stop 掉重来`);
}

// ---------------------------------------------------------------- status

async function CommandStatus(opts) {
  const records = ReadInstances();
  const rows = [];
  for (const record of records) {
    const alive = IsLiveBlender(record.pid);
    const responsive = alive ? await Ping(record.port) : false;
    rows.push({ ...record, alive, responsive });
  }
  const payload = { worktree: REPO_ROOT, stateDir: STATE_DIR, instances: rows };
  if (opts.flags.scan) {
    const mine = new Set(rows.filter((row) => row.alive).map((row) => row.pid));
    payload.otherBlenderPids = ListMachineBlenders().filter((pid) => !mine.has(pid));
  }
  if (opts.flags.json) { console.log(JSON.stringify(payload, null, 2)); return 0; }

  console.log(`worktree  ${REPO_ROOT}`);
  console.log(`记录目录  ${STATE_DIR}`);
  if (!rows.length) console.log("实例      （无）本 worktree 当前没有起过 Blender");
  for (const row of rows) {
    const state = row.alive ? (row.responsive ? "活着·端口就绪" : "活着·端口不应答") : "已退出（记录待清）";
    console.log(`实例      端口 ${row.port}  pid ${row.pid}  ${state}`);
    console.log(`          任务 ${row.task || "(未标注)"}  起于 ${row.startedAt}`);
    console.log(`          blend ${row.blend || "(空场景)"}`);
    if (row.log) console.log(`          日志  ${row.log}`);
  }
  if (payload.otherBlenderPids) {
    console.log(`本机其它 blender.exe  ${payload.otherBlenderPids.length ? payload.otherBlenderPids.join(", ") : "（无）"}`);
  }
  return 0;
}

// ---------------------------------------------------------------- exec / call

async function ResolveTargetPort(opts) {
  if (opts.flags.port !== undefined) return NumberFlag(opts.flags, "port", PORT_MIN);
  const live = await LiveInstances();
  if (!live.length) throw new Error("本 worktree 没有活着的实例；先 start");
  if (live.length > 1) throw new Error(`本 worktree 有 ${live.length} 个实例（端口 ${live.map((r) => r.port).join(", ")}），用 --port 指定`);
  return live[0].port;
}

function ReadStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

// 钩子模式：把 Claude Code 写进标准输入的那条 JSON 吞掉（不吞的话对面可能写阻塞），
// 顺手从里面取 cwd —— 这是 worktree 场景下唯一可靠的「当前这棵树」信息。
function AbsorbHookPayload() {
  const raw = ReadStdin();
  if (!raw.trim()) return {};
  let payload = {};
  try { payload = JSON.parse(raw); } catch { return {}; }
  hookPayload = payload;
  for (const candidate of [payload.cwd, process.env.CLAUDE_PROJECT_DIR]) {
    const root = TreeRootOf(candidate);
    if (!root) continue;
    const dir = path.join(root, "tmp", "BlenderMcp");
    if (dir !== STATE_DIR) extraStateDirs.push(dir);
  }
  return payload;
}

// cwd 未必就是树根（Claude 可能 cd 进了子目录），往上找到带 scripts/Script_BlenderMcp.mjs
// 的那一层才算数。
function TreeRootOf(start) {
  if (typeof start !== "string" || !start.trim()) return "";
  let dir = path.resolve(start);
  for (let depth = 0; depth < 12; depth += 1) {
    if (fs.existsSync(path.join(dir, "scripts", "Script_BlenderMcp.mjs"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "";
}

async function CommandExec(opts) {
  let code = "";
  if (opts.flags.code !== undefined) code = String(opts.flags.code);
  else if (opts.flags.file !== undefined) code = fs.readFileSync(path.resolve(String(opts.flags.file)), "utf8");
  else if (opts.flags.stdin) code = ReadStdin();
  else throw new Error("exec 需要 --code、--file 或 --stdin 之一");
  if (!code.trim()) throw new Error("给过来的 Python 是空的");

  const port = await ResolveTargetPort(opts);
  const timeoutMs = NumberFlag(opts.flags, "timeout", DEFAULT_CALL_TIMEOUT_SEC) * 1000;
  const reply = await SendCompatibleCommand(port, { type: "execute_code", params: { code } }, timeoutMs);
  if (opts.flags.json) { console.log(JSON.stringify(reply, null, 2)); return reply.status === "success" ? 0 : 1; }
  if (reply.status !== "success") {
    console.error(`Blender 那头报错：${reply.message || JSON.stringify(reply)}`);
    return 1;
  }
  const inner = reply.result || {};
  // execute_code 把 Python 侧的 stdout 原样带回来，所以想看什么就 print 什么。
  process.stdout.write(typeof inner.result === "string" ? inner.result : `${JSON.stringify(inner, null, 2)}\n`);
  return 0;
}

async function CommandCall(opts) {
  const type = String(opts.flags.type || "ping");
  let params = {};
  if (opts.flags.params !== undefined) {
    try { params = JSON.parse(String(opts.flags.params)); }
    catch (error) { throw new Error(`--params 不是合法 JSON：${error.message}`); }
  }
  const port = await ResolveTargetPort(opts);
  const extension = await SendCommand(port, { type: "ping" }, 2000, "extension")
    .then((reply) => reply?.status === "ok" && reply?.result?.pong).catch(() => false);
  if (extension) {
    if (type !== "ping") throw new Error(`Blender 5.2 extension exposes code execution only; use exec for ${type}`);
    console.log(JSON.stringify({ status: "success", result: { port, pong: true } }, null, 2));
    return 0;
  }
  const timeoutMs = NumberFlag(opts.flags, "timeout", DEFAULT_CALL_TIMEOUT_SEC) * 1000;
  const reply = await SendCommand(port, { type, params }, timeoutMs);
  console.log(JSON.stringify(reply, null, 2));
  return reply.status === "success" ? 0 : 1;
}

// ---------------------------------------------------------------- stop

const QUIT_CODE = [
  "import bpy",
  "wins = list(getattr(bpy.context.window_manager, 'windows', []))",
  "try:",
  "    if wins:",
  "        with bpy.context.temp_override(window=wins[0]):",
  "            bpy.ops.wm.quit_blender()",
  "    else:",
  "        bpy.ops.wm.quit_blender()",
  "except Exception:",
  "    bpy.ops.wm.quit_blender()",
  "print('quit requested')",
  "",
].join("\n");

const SAVE_CODE = [
  "import bpy",
  "if bpy.data.filepath:",
  "    bpy.ops.wm.save_mainfile()",
  "    print('saved ' + bpy.data.filepath)",
  "else:",
  "    print('unsaved scratch file, nothing to save')",
  "",
].join("\n");

async function StopOne(record, opts) {
  // 钩子是兜底，不是主路径：SessionEnd 的默认预算只有 1.5 秒（单 hook 的 timeout
  // 最多抬到 60），所以钩子模式把等待压到 3 秒，超时直接强杀。
  const defaultGrace = opts.flags.hook ? 3 : DEFAULT_STOP_GRACE_SEC;
  const graceMs = NumberFlag(opts.flags, "grace", defaultGrace) * 1000;
  const outcome = { port: record.port, pid: record.pid, task: record.task || "", steps: [] };

  if (!IsLiveBlender(record.pid)) {
    DropInstance(record);
    outcome.steps.push("进程早就不在了，只清了记录");
    outcome.result = "already-gone";
    return outcome;
  }

  if (opts.flags.save) {
    try {
      await SendCompatibleCommand(record.port, { type: "execute_code", params: { code: SAVE_CODE } }, 120000);
      outcome.steps.push("已保存");
    } catch (error) {
      outcome.steps.push(`保存失败：${error.message}`);
    }
  }

  // 请 Blender 自己退出。正常退出会把 quit.blend 落到临时目录（File > Recover
  // Last Session 还能捞回来），强杀就没有这一层，所以优先走这条。
  // 注意必须带窗口 temp_override：wm.quit_blender 的 exec 路径要在一个真实窗口上
  // 排退出事件，插件的定时器上下文里直接调有时候不落地（实测过一次 8s 没退）。
  try {
    await SendCompatibleCommand(record.port, { type: "execute_code", params: { code: QUIT_CODE } }, 5000);
    outcome.steps.push("已请求退出");
  } catch {
    outcome.steps.push("已请求退出（无应答，符合预期）");
  }

  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!IsLiveBlender(record.pid)) {
      DropInstance(record);
      outcome.result = "quit";
      return outcome;
    }
    await Sleep(300);
  }

  KillTree(record.pid);
  await Sleep(500);
  const stillThere = IsLiveBlender(record.pid);
  DropInstance(record);
  outcome.steps.push(stillThere ? "强杀后仍在（需人工确认）" : "强杀进程树");
  outcome.result = stillThere ? "stubborn" : "killed";
  return outcome;
}

// 一个会话里的子代理跟主代理共用同一个 session_id（2026-09-16 实测：SubagentStop
// 的 session_id 是父会话的，子代理只靠 agent_id 区分），所以「这条记录是不是我起的」
// 没法用 session id 判。主代理结束一次回复时，后台可能还有子代理正在 Blender 里干活，
// 于是改用钩子输入里的 background_tasks：还有在跑的后台任务就这一轮先不收。
function BackgroundBusy() {
  const tasks = hookPayload && Array.isArray(hookPayload.background_tasks) ? hookPayload.background_tasks : [];
  return tasks.some((task) => task && task.status === "running");
}

async function CommandStop(opts) {
  if (opts.flags.hook) AbsorbHookPayload();
  if (opts.flags["skip-if-busy"] && BackgroundBusy()) {
    if (!opts.flags.quiet) console.log("还有后台任务在跑，这一轮不收 Blender（会话结束时再收）");
    return 0;
  }
  let records = ReadInstances();
  if (opts.flags.port !== undefined) {
    const port = NumberFlag(opts.flags, "port", PORT_MIN);
    records = records.filter((record) => record.port === port);
    if (!records.length) throw new Error(`本 worktree 没有端口 ${port} 的实例记录`);
  }

  const outcomes = [];
  for (const record of records) outcomes.push(await StopOne(record, opts));

  if (opts.flags.json) { console.log(JSON.stringify({ worktree: REPO_ROOT, stopped: outcomes }, null, 2)); return 0; }
  if (!outcomes.length) {
    if (!opts.flags.quiet && !opts.flags.hook) console.log("本 worktree 没有需要关闭的 Blender 实例");
    return 0;
  }
  for (const outcome of outcomes) {
    console.log(`已关闭  端口 ${outcome.port}  pid ${outcome.pid}  ${outcome.task || "(未标注)"}  ${outcome.steps.join("；")}`);
  }
  return 0;
}

// ---------------------------------------------------------------- 输出与入口

function Report(opts, payload) {
  if (opts.flags.json) { console.log(JSON.stringify(payload, null, 2)); return 0; }
  const verb = payload.action === "reused" ? "复用已有实例" : "已启动";
  console.log(`${verb}  端口 ${payload.port}  pid ${payload.pid}  ${payload.task || "(未标注)"}`);
  console.log(`          blend ${payload.blend || "(空场景)"}`);
  if (payload.readyMs !== undefined) console.log(`          就绪耗时 ${(payload.readyMs / 1000).toFixed(1)}s`);
  console.log(`          干完这轮活记得：node scripts/Script_BlenderMcp.mjs stop`);
  return 0;
}

async function Main() {
  const opts = ParseArgs(process.argv.slice(2));
  if (opts.flags.help || opts.command === "help" || !opts.command) { process.stdout.write(HELP); return 0; }
  if (os.platform() !== "win32") throw new Error("这个脚本只在 Windows 上验证过（tasklist / taskkill）");
  switch (opts.command) {
    case "start": return CommandStart(opts);
    case "status": return CommandStatus(opts);
    case "exec": return CommandExec(opts);
    case "call": return CommandCall(opts);
    case "stop": return CommandStop(opts);
    default: throw new Error(`未知命令：${opts.command}（看 --help）`);
  }
}

const isHookMode = process.argv.includes("--hook");
Main()
  .then((code) => { process.exitCode = code || 0; })
  .catch((error) => {
    // 钩子模式绝不把会话结束搞成一个错误：报一声就完事。
    if (isHookMode) { console.error(`Script_BlenderMcp stop --hook：${error.message}`); process.exitCode = 0; return; }
    console.error(`Script_BlenderMcp：${error.message}`);
    process.exitCode = 1;
  });
