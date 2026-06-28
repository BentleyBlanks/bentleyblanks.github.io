const fs = require("fs");
const path = require("path");
const pty = require(path.join(process.env.TEMP, "claude-mcp-pty", "node_modules", "node-pty"));

const baseDir = process.argv[2] || path.join(process.env.TEMP, "claude-mcp-login");
fs.mkdirSync(baseDir, { recursive: true });

const logPath = path.join(baseDir, "session.log");
const inputPath = path.join(baseDir, "input.txt");
const statusPath = path.join(baseDir, "status.json");

fs.writeFileSync(logPath, "");
fs.writeFileSync(inputPath, "");
fs.writeFileSync(
  statusPath,
  JSON.stringify({ status: "starting", startedAt: new Date().toISOString() }, null, 2),
);

const claudeCmd = path.join(process.env.APPDATA, "npm", "claude.cmd");
const cwd = String.raw`C:\Users\Bentl\Documents\Program\bentleyblanks.github.io`;

const child = pty.spawn(claudeCmd, ["mcp", "login", "notion"], {
  name: "xterm-256color",
  cols: 140,
  rows: 40,
  cwd,
  env: process.env,
});

function appendLog(data) {
  fs.appendFileSync(logPath, data);
}

child.onData((data) => {
  appendLog(data);
});

child.onExit(({ exitCode, signal }) => {
  fs.writeFileSync(
    statusPath,
    JSON.stringify(
      {
        status: "exited",
        exitCode,
        signal,
        exitedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  process.exit(exitCode ?? 0);
});

fs.writeFileSync(
  statusPath,
  JSON.stringify(
    {
      status: "running",
      pid: process.pid,
      childPid: child.pid,
      logPath,
      inputPath,
      startedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);

let lastSize = 0;
setInterval(() => {
  try {
    const stat = fs.statSync(inputPath);
    if (stat.size <= lastSize) return;
    const fd = fs.openSync(inputPath, "r");
    const buffer = Buffer.alloc(stat.size - lastSize);
    fs.readSync(fd, buffer, 0, buffer.length, lastSize);
    fs.closeSync(fd);
    lastSize = stat.size;
    child.write(buffer.toString("utf8"));
  } catch (error) {
    appendLog(`\n[bridge input error] ${error.message}\n`);
  }
}, 500);
