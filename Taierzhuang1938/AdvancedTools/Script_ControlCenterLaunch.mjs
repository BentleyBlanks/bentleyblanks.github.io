// AdvancedTool ControlCenter 启动器：双击桌面快捷方式 = 起本地预览服（已有就复用）并用默认浏览器打开控制中心。
//
//   node Taierzhuang1938/AdvancedTools/Script_ControlCenterLaunch.mjs              起服 / 复用，打开控制中心
//   node ... 8090                                                                  从这个端口起找（默认 8080，PREVIEW_PORT 也认）
//   node ... --no-open                                                             只确保服务在，不开浏览器
//   node ... --dry-run                                                             只打印将要做的事（不起服、不开浏览器）
//   node ... --shortcut                                                            在桌面建「AdvancedTool ControlCenter.lnk」（指向 node + 本脚本）
//   node ... --shortcut-dir=<dir>                                                  把快捷方式建到 <dir>（测试 / 别处用）
//
// 复用规则同 scripts/Script_LocalPreview.mjs：端口上 /__preview/ping 报的根目录必须就是本脚本所在的仓库 / worktree，
// 否则不算（8080 常被别的树占着，指到别人的代码上最难发现）。没有就后台起 Script_LocalPreview.mjs --no-open，端口以它的输出为准。
// 由本脚本起的服务跟着本窗口走：关掉窗口即停服；复用已有服务时本脚本打开浏览器就退出。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "..", "..");
export const PREVIEW_SCRIPT = path.join(REPO_ROOT, "scripts", "Script_LocalPreview.mjs");
export const CONTROL_CENTER_PATH = "/Taierzhuang1938/AdvancedTools/ControlCenter.html";
export const SHORTCUT_NAME = "AdvancedTool ControlCenter";
const PORT_SPAN = 60;
const APP_ID = "BlanksLocalPreview";

export function ControlCenterUrl(port) {
  return `http://127.0.0.1:${port}${CONTROL_CENTER_PATH}`;
}

/** 端口上有没有服务本仓库的预览服。→ true / false */
export async function ServesThisRepo(port, root = REPO_ROOT) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/__preview/ping`, { signal: AbortSignal.timeout(800) });
    if (!response.ok) return false;
    const info = await response.json();
    return info.app === APP_ID && path.resolve(info.root) === path.resolve(root);
  } catch { return false; }
}

/** 从 basePort 往上找一个服务本仓库的预览服。→ 端口 / null */
export async function FindExisting(basePort, span = PORT_SPAN) {
  for (let port = basePort; port <= basePort + span; port += 1) {
    if (await ServesThisRepo(port)) return port;
  }
  return null;
}

function OpenBrowser(url) {
  try {
    if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    else spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  } catch { /* 开不起来就算了，命令行里有 URL */ }
}

/** 起预览服，等它报出端口。→ { port, child } */
function StartPreview(basePort) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PREVIEW_SCRIPT, String(basePort), "--no-open"],
      { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
    let buffer = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("预览服 20 秒没就绪")); }, 20000);
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      buffer += chunk;
      const match = /http:\/\/127\.0\.0\.1:(\d+)\/__preview\//.exec(buffer);
      if (match && timer) { clearTimeout(timer); resolve({ port: Number(match[1]), child }); buffer = ""; }
    });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`预览服退出了（${code}）`)); });
  });
}

/** 桌面目录（同 Script_LocalPreview.CreateShortcut 的找法）。 */
export function DesktopDir() {
  const home = os.homedir();
  return [path.join(home, "Desktop"), path.join(home, "桌面")].find((dir) => fs.existsSync(dir)) || home;
}

/** 在 dir 里建快捷方式：目标 node、参数 本脚本、工作目录仓库根。→ 创建的文件路径 */
export function CreateShortcut(dir = DesktopDir()) {
  const script = fileURLToPath(import.meta.url);
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform === "win32") {
    const ps1 = path.join(here, "Script_CreateControlCenterShortcut.ps1");
    const link = path.join(dir, `${SHORTCUT_NAME}.lnk`);
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1,
      "-LinkPath", link, "-Target", process.execPath, "-Arguments", `"${script}"`, "-WorkDir", REPO_ROOT,
      "-Icon", path.join(REPO_ROOT, "favicon.ico")], { encoding: "utf8" });
    return link;
  }
  if (process.platform === "darwin") {
    const file = path.join(dir, `${SHORTCUT_NAME}.command`);
    fs.writeFileSync(file, `#!/bin/sh\ncd "${REPO_ROOT}"\nexec "${process.execPath}" "${script}" "$@"\n`);
    fs.chmodSync(file, 0o755);
    return file;
  }
  const file = path.join(dir, `${SHORTCUT_NAME}.desktop`);
  fs.writeFileSync(file, ["[Desktop Entry]", "Type=Application", `Name=${SHORTCUT_NAME}`,
    `Exec="${process.execPath}" "${script}"`, `Path=${REPO_ROOT}`, `Icon=${path.join(REPO_ROOT, "favicon.ico")}`, "Terminal=true", ""].join("\n"));
  fs.chmodSync(file, 0o755);
  return file;
}

async function Main(args) {
  const dryRun = args.includes("--dry-run");
  const open = !args.includes("--no-open");
  const dirArg = args.find((arg) => arg.startsWith("--shortcut-dir="));
  if (dirArg || args.includes("--shortcut")) {
    const dir = dirArg ? path.resolve(dirArg.slice("--shortcut-dir=".length)) : DesktopDir();
    if (dryRun) { console.log(`[dry-run] 将在 ${dir} 建快捷方式「${SHORTCUT_NAME}」：${process.execPath} "${fileURLToPath(import.meta.url)}"（工作目录 ${REPO_ROOT}）`); return; }
    const file = CreateShortcut(dir);
    console.log(`快捷方式已创建：${file}`);
    console.log(`  服务的树：${REPO_ROOT}`);
    return;
  }
  const portArg = args.find((arg) => /^\d+$/.test(arg));
  const basePort = Number(portArg || process.env.PREVIEW_PORT || 8080);
  const existing = await FindExisting(basePort);
  if (dryRun) {
    if (existing) console.log(`[dry-run] 复用 :${existing} 上服务本仓库（${REPO_ROOT}）的预览服`);
    else console.log(`[dry-run] 没有服务本仓库的预览服：将后台起 ${process.execPath} ${PREVIEW_SCRIPT} ${basePort} --no-open（端口以其输出为准）`);
    console.log(`[dry-run] ${open ? "将用系统默认浏览器打开" : "不打开浏览器（--no-open）"}：${ControlCenterUrl(existing ?? basePort)}`);
    return;
  }
  if (existing) {
    console.log(`复用已有预览服 :${existing}（根：${REPO_ROOT}）`);
    console.log(`控制中心：${ControlCenterUrl(existing)}`);
    if (open) OpenBrowser(ControlCenterUrl(existing));
    return;
  }
  const { port, child } = await StartPreview(basePort);
  console.log(`控制中心：${ControlCenterUrl(port)}`);
  console.log("  关掉本窗口即停服。");
  if (open) OpenBrowser(ControlCenterUrl(port));
  child.once("exit", () => process.exit(0));
  const Stop = () => { child.kill(); process.exit(0); };
  process.on("SIGINT", Stop);
  process.on("SIGTERM", Stop);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Main(process.argv.slice(2)).catch((error) => {
    console.error("控制中心起不来：", error.message);
    process.exitCode = 1;
  });
}
