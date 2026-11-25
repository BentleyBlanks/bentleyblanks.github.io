// 测试场景入口：双击桌面「测试场景.lnk」= 起本地预览服（已有就复用）并用默认浏览器打开 TestScenes.html。
//
//   node Taierzhuang1938/AdvancedTools/Script_TestScenesLaunch.mjs              起服 / 复用，打开测试场景页
//   node ... 8090                                                               从这个端口起找（默认 8080，PREVIEW_PORT 也认）
//   node ... --no-open                                                          只确保服务在，不开浏览器
//   node ... --dry-run                                                          只打印将要做的事（不起服、不开浏览器）
//   node ... --shortcut                                                         在桌面建「测试场景.lnk」（指向 node + 本脚本）
//   node ... --shortcut-dir=<dir>                                               把快捷方式建到 <dir>（测试 / 别处用）
//   node ... --shortcut-name=<name>                                             自定义快捷方式名（默认「测试场景」）

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PreviewRuntimeRevision } from "../../scripts/Script_LocalPreviewRuntime.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "..", "..");
export const PREVIEW_SCRIPT = path.join(REPO_ROOT, "scripts", "Script_LocalPreview.mjs");
export const TEST_SCENES_PATH = "/Taierzhuang1938/AdvancedTools/TestScenes.html";
export const SHORTCUT_NAME = "测试场景";
const PORT_SPAN = 60;
const APP_ID = "BlanksLocalPreview";

export function TestScenesUrl(port) {
  return `http://127.0.0.1:${port}${TEST_SCENES_PATH}`;
}

/** 端口上有没有服务本仓库的预览服。→ true / false */
export async function ServesThisRepo(port, root = REPO_ROOT) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/__preview/ping`, { signal: AbortSignal.timeout(800) });
    if (!response.ok) return false;
    const info = await response.json();
    return info.app === APP_ID && path.resolve(info.root) === path.resolve(root)
      && info.runtimeRevision === PreviewRuntimeRevision(root);
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

/** 桌面目录（同 Script_ControlCenterLaunch.DesktopDir）。 */
export function DesktopDir() {
  const home = os.homedir();
  return [path.join(home, "Desktop"), path.join(home, "桌面")].find((dir) => fs.existsSync(dir)) || home;
}

/** 在 dir 里建快捷方式：目标 node、参数 本脚本、工作目录仓库根。→ 创建的文件路径 */
export function CreateShortcut(dir = DesktopDir(), name = SHORTCUT_NAME) {
  const script = fileURLToPath(import.meta.url);
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform === "win32") {
    const ps1 = path.join(here, "Script_CreateTestScenesShortcut.ps1");
    const link = path.join(dir, `${name}.lnk`);
    const linkB64 = Buffer.from(link, "utf8").toString("base64");
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1,
      "-LinkPathBase64", linkB64, "-Target", process.execPath, "-Arguments", `"${script}"`, "-WorkDir", REPO_ROOT,
      "-Icon", path.join(REPO_ROOT, "scripts", "Icons", "Icon_LocalPreview.ico")], { encoding: "utf8" });
    return link;
  }
  if (process.platform === "darwin") {
    const file = path.join(dir, `${name}.command`);
    fs.writeFileSync(file, `#!/bin/sh\ncd "${REPO_ROOT}"\nexec "${process.execPath}" "${script}" "$@"\n`);
    fs.chmodSync(file, 0o755);
    return file;
  }
  const file = path.join(dir, `${name}.desktop`);
  fs.writeFileSync(file, ["[Desktop Entry]", "Type=Application", `Name=${name}`,
    `Exec="${process.execPath}" "${script}"`, `Path=${REPO_ROOT}`, `Icon=${path.join(REPO_ROOT, "scripts", "Icons", "Icon_LocalPreview.png")}`, "Terminal=true", ""].join("\n"));
  fs.chmodSync(file, 0o755);
  return file;
}

async function Main(args) {
  const dryRun = args.includes("--dry-run");
  const open = !args.includes("--no-open");
  const dirArg = args.find((arg) => arg.startsWith("--shortcut-dir="));
  const nameArg = args.find((arg) => arg.startsWith("--shortcut-name="));
  const name = nameArg ? nameArg.slice("--shortcut-name=".length) : SHORTCUT_NAME;
  if (dirArg || args.includes("--shortcut")) {
    const dir = dirArg ? path.resolve(dirArg.slice("--shortcut-dir=".length)) : DesktopDir();
    if (dryRun) {
      console.log(`[dry-run] 将在 ${dir} 建快捷方式「${name}」：${process.execPath} "${fileURLToPath(import.meta.url)}"（工作目录 ${REPO_ROOT}）`);
      return;
    }
    const file = CreateShortcut(dir, name);
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
    console.log(`[dry-run] ${open ? "将用系统默认浏览器打开" : "不打开浏览器（--no-open）"}：${TestScenesUrl(existing ?? basePort)}`);
    return;
  }
  if (existing) {
    console.log(`复用已有预览服 :${existing}（根：${REPO_ROOT}）`);
    console.log(`测试场景：${TestScenesUrl(existing)}`);
    if (open) OpenBrowser(TestScenesUrl(existing));
    return;
  }
  const { port, child } = await StartPreview(basePort);
  console.log(`测试场景：${TestScenesUrl(port)}`);
  console.log("  关掉本窗口即停服。");
  if (open) OpenBrowser(TestScenesUrl(port));
  child.once("exit", () => process.exit(0));
  const Stop = () => { child.kill(); process.exit(0); };
  process.on("SIGINT", Stop);
  process.on("SIGTERM", Stop);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Main(process.argv.slice(2)).catch((error) => {
    console.error("测试场景页起不来：", error.message);
    process.exitCode = 1;
  });
}
