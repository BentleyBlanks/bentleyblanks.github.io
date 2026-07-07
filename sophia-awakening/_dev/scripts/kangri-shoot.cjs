// 《烽火敌后》(#kangri) 一次性视觉验证：起 headless Chrome 连 CDP，用 window.__kr 调试接口
// 把游戏推到各个关键画面（成长后的村子/兵团来袭/会战/转移+劫掠）逐张截图。本地验证用，不进 CI。
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CHROME = process.env.CHROME || "google-chrome";
const URL = process.env.SHOT_URL || "http://127.0.0.1:4174/#kangri";
const DIR = process.env.SHOT_DIR || "/tmp/kangri-shots";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const port = 9700 + Math.floor(Math.random() * 200);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kr-shoot-"));
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--window-size=1680,950", "--hide-scrollbars", "--no-sandbox", "--no-first-run", URL
  ], { stdio: "ignore" });
  let ws, id = 0; const pend = new Map();
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result.value;
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(DIR, name + ".png"), Buffer.from(r.data, "base64"));
    console.log("shot →", name);
  };
  try {
    await sleep(2500);
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws = new global.WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
    ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
    await new Promise((r) => ws.addEventListener("open", r));
    await send("Page.enable"); await send("Runtime.enable");
    await ev(`window.__err=null;window.addEventListener('error',e=>window.__err=String(e.error&&e.error.stack||e.message));window.addEventListener('unhandledrejection',e=>window.__err=String(e.reason));1`);
    await sleep(2000);

    console.log("sceneOk:", await ev(`window.__kr && window.__kr.sceneOk()`));
    await shot("01-fresh");

    // 成长后的根据地：设施+高兵员（村子长大、小人变多）
    await ev(`(()=>{const k=window.__kr;k.give(5e6,3000);for(let i=0;i<10;i++){for(let n=0;n<6;n++)k.buyBuilding(i)}return 1})()`);
    await sleep(2500);
    await shot("02-grown-base");

    // 收复几个区域（控制区染红）
    await ev(`(()=>{const k=window.__kr;k.give(5e7,5e5);['wutai','taihang','jinsui','jizhong'].forEach(id=>k.launch(id));return 1})()`);
    await sleep(1500);
    await shot("03-regions");

    // 扫荡来袭（兵团行军 + 决策条）
    await ev(`window.__kr.sweep();1`);
    await sleep(4500);
    await shot("04-incoming");

    // 组织抗击（会战：两军对垒、曳光弹）
    await ev(`window.__kr.fight(0.5);1`);
    await sleep(13000);
    await shot("05-battle");
    console.log("state:", JSON.stringify(await ev(`(()=>{const s=window.__kr.state();return {sweep:s.sweep&&{stage:s.sweep.stage,strength:Math.round(s.sweep.strength),committed:Math.round(s.sweep.committed)},bing:Math.round(s.bing)}})()`)));

    // 等扫荡结束 → 触发新扫荡，这次只转移不抗击（劫掠+转移队伍）
    await ev(`(()=>{const k=window.__kr;const w=()=>{if(!k.state().sweep){k.sweep();setTimeout(()=>{k.evac()},1500);}else setTimeout(w,800)};w();return 1})()`);
    await sleep(8000);
    await shot("06-evac");
    await sleep(14000);
    await shot("07-pillage-or-end");
    console.log("pageError:", await ev(`window.__err||null`));
  } finally {
    try { chrome.kill(); } catch {}
    try { ws && ws.close(); } catch {}
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error("ERR", e); process.exit(1); });
