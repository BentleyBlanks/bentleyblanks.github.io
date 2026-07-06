// 可复用的无头截图工具——封装每次都重写的 CDP 样板（起 Chrome / 连 CDP / 清档 / 跳教学 / 冻结 / 截图）。
// 配合 window.__sophia 调试接口用：setup 里直接 __s.jump('hack_finance')、__s.setCompute(6e5)、__s.processFirst() 等把游戏推到想要的状态。
//
// 用法一（命令行·适合简单场景）：
//   node scripts/shoot.cjs --out 名字 --setup "__s.jump('入侵财务电脑'); __s.setCompute(6e5)" --wait 3000 --pause
//     --out    输出文件名（存到 scratchpad/shots 或 --dir 指定处），必填
//     --setup  跳过教学后要跑的 JS（__s = window.__sophia；jump 支持里程碑 skillId 或按钮文字包含匹配），可选
//     --wait   setup 后等待 ms 再截（让动画/出卡跑起来），默认 2500
//     --pause  截图前 __s.pause() 冻结（连 gsap 一起定格，抓转瞬浮字/过场），可选
//     --url    默认 http://127.0.0.1:4174/    --port CDP 端口默认随机   --dir 输出目录
// 用法二（脚本·适合复杂场景）：const { shoot } = require('./shoot'); await shoot({ out, setup, waitMs, pause });
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DEFAULT_DIR = "C:/Users/Bentl/AppData/Local/Temp/claude/C--Users-Bentl-Documents-Program-bentleyblanks-github-io/9f0989ec-e9ab-4a08-bc92-8002063c465f/scratchpad/shots";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot({ out, setup = "", waitMs = 2500, pause = false, url = "http://127.0.0.1:4174/", port, dir = DEFAULT_DIR, reloadWaitMs = 6000 } = {}) {
  if (!out) throw new Error("shoot: 需要 out（输出文件名）");
  port = port || 9800 + Math.floor(Math.random() * 190);
  fs.mkdirSync(dir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sophia-shoot-"));
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1680,950", "--hide-scrollbars", "--disable-features=WebGPU,Vulkan", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--no-first-run", url], { stdio: "ignore" });
  let ws, id = 0; const pend = new Map();
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result.value;
  try {
    await sleep(2500);
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws = new global.WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
    ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
    await new Promise((r) => ws.addEventListener("open", r));
    await send("Page.enable"); await send("Runtime.enable");
    await ev(`window.__err=null;window.addEventListener('error',e=>window.__err=String(e.error&&e.error.stack||e.message));window.addEventListener('unhandledrejection',e=>window.__err=String(e.reason))`);
    await ev(`(()=>{try{Object.keys(localStorage).forEach(k=>{if(k.startsWith('sophia'))localStorage.removeItem(k)})}catch(e){}return 1})()`);
    await send("Page.reload"); await sleep(reloadWaitMs);
    // 跳过教学 + 运行 setup（__s = window.__sophia；jump 兼容里程碑按钮文字匹配）
    await ev(`(()=>{const s=window.__sophia;if(!s)return;s.skipTutorial&&s.skipTutorial();
      window.__jumpByText=(t)=>{const b=[...document.querySelectorAll('#debugMilestones button')].find(e=>e.textContent.includes(t));if(b)b.click();};
      return 1})()`);
    if (setup) {
      await ev(`(()=>{const __s=window.__sophia; ${setup}; return 1})()`);
    }
    await sleep(waitMs);
    if (pause) { await ev(`window.__sophia.pause()`); await sleep(200); }
    const r = await send("Page.captureScreenshot", { format: "png" });
    const file = path.join(dir, out.endsWith(".png") ? out : out + ".png");
    fs.writeFileSync(file, Buffer.from(r.data, "base64"));
    const err = await ev(`window.__err||null`);
    if (pause) await ev(`window.__sophia.resume()`);
    console.log(`shot → ${file}${err ? `  ⚠ pageError: ${err}` : ""}`);
    return { file, err };
  } finally {
    try { chrome.kill(); } catch {}
    try { ws && ws.close(); } catch {}
  }
}

module.exports = { shoot };

// CLI
if (require.main === module) {
  const a = process.argv.slice(2);
  const get = (k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : d; };
  const has = (k) => a.includes(`--${k}`);
  shoot({ out: get("out"), setup: get("setup", ""), waitMs: Number(get("wait", 2500)), pause: has("pause"), url: get("url", "http://127.0.0.1:4174/"), port: get("port") ? Number(get("port")) : undefined, dir: get("dir", DEFAULT_DIR) })
    .then(() => process.exit(0))
    .catch((e) => { console.error("ERR", e.message); process.exit(1); });
}
