// Script_FirstLevelWhitebox0518Shots.mjs - 第一关 05–18 白盒现状取证（docs/Data_FirstLevelWhitebox0518Gap.md）。
// 两类产物，都写进忽略目录 Taierzhuang1938/_shots/Whitebox0518/（或 --out=<dir>）：
//   1. <id>.png：Data_FirstLevelWhitebox0518Cameras 里每个机位一张实机图（1280×720、55° FOV、
//      ?whitebox=p012&shot=1&manual=1&missionStage=N&quality=medium&scale=small），与 Notion 概念图同名对照。
//      走采样点编辑器的 ApplyPose（与 Script_FirstLevelSpaceShots 同一条路），不碰指针锁。
//   2. Map_<region>.png：按 Data_FirstLevelWhiteboxTerrain 的分区，直接从数据表画的俯视图 ——
//      共享地面高度着色（相对 natural 的挖/填另画等值线）、实心体块轮廓（按顶高深浅）、冻结路线、
//      锚点、机位与视线方向。纯数据渲染，不开游戏。
//   另有 Top_<region>.png：游戏内高空俯拍（同一分区框，fov 自适应），看实际体块与地形。
// 用法（从 worktree 根）：
//   node Taierzhuang1938/Script_FirstLevelWhitebox0518Shots.mjs [--only=08_1,08_2] [--out=<dir>]
//        [--no-shots] [--no-maps] [--no-top] [--scale=0.5] [--quality=whitebox|low|medium|high|ultra]（默认 medium）
//   --quality=whitebox 就是用户进游戏默认看到的灰色米制网格画面（2026-09-29 起默认 quality=whitebox；URL 的 quality 优先于本地存档，
//   新开的无头浏览器没有 tengxian1938_whitebox_v1，所以取到的是 WHITEBOX_DEFAULTS）；美术效果对照请另出 --quality=high。
// 这是出图脚本不是门禁，不进 TestRunner；浏览器全局锁只在 TestRunner 里，单跑直接 node。
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL, fileURLToPath } from "node:url";
const WT = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const U = (p) => pathToFileURL(WT + "Taierzhuang1938/" + p).href;
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name) => process.argv.includes(`--${name}`);
const only = arg("only")?.split(",").filter(Boolean) || null;
const out = path.resolve(arg("out") || WT + "Taierzhuang1938/_shots/Whitebox0518");
const quality = ["whitebox", "low", "medium", "high", "ultra"].includes(arg("quality")) ? arg("quality") : "medium";
fs.mkdirSync(out, { recursive: true });
const { WHITEBOX_0518_CAMERAS: CAMERAS } = await import(U("Data_FirstLevelWhitebox0518Cameras.mjs"));
const { WHITEBOX_TERRAIN_REGIONS: REGIONS } = await import(U("Data_FirstLevelWhiteboxTerrain.mjs"));
const DEG = Math.PI / 180;
const log = [];

// ---------------------------------------------------------------------------
// 2. 数据俯视图
// ---------------------------------------------------------------------------
async function DataMaps(browser) {
  const L = await import(U("Data_FirstLevelMissionLayout.mjs"));
  const Ter = await import(U("Data_FirstLevelMissionTerrain.mjs"));
  const lay = L.MISSION_LAYOUT;
  const G = (x, z) => Ter.SampleMissionTerrain(x, z), N = (x, z) => Ter.SampleMissionNaturalHeight(x, z);
  const night = lay.scenario.states.find((s) => s.id === "NightGate").blocks;
  const solids = [...lay.blocks, ...lay.gates, ...night].filter((b) => b.solid !== false);
  const routes = Object.entries(L.MISSION_ROUTES).map(([id, pts]) => ({ id, pts: pts.map((p) => ({ x: p.x, z: p.z })) }));
  const anchors = Object.entries(L.MISSION_ANCHORS).map(([id, p]) => ({ id, x: p.x, z: p.z }));
  const cams = CAMERAS.map((c) => ({ id: c.id, x: c.camera.x, z: c.camera.z, lx: c.look.x, lz: c.look.z }));
  for (const region of REGIONS) {
    for (const box of region.boxes) {
      const key = region.boxes.length > 1 ? `${region.id}_${box.id}` : region.id;
      if (only && !only.includes(`Map_${key}`) && !only.includes("maps")) continue;
      const step = Math.max(.25, Math.min(.5, Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 360));
      const W = Math.round((box.maxX - box.minX) / step), H = Math.round((box.maxZ - box.minZ) / step);
      const hg = new Array(W * H), cut = new Array(W * H);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const x = box.minX + (i + .5) * step, z = box.minZ + (j + .5) * step, g = G(x, z);
        hg[j * W + i] = +g.toFixed(2); cut[j * W + i] = +(g - N(x, z)).toFixed(2);
      }
      const inBox = (b, m) => b.x > box.minX - m && b.x < box.maxX + m && b.z > box.minZ - m && b.z < box.maxZ + m;
      const blocks = solids.filter((b) => inBox(b, 6) && Math.max(b.w, b.d) >= .25)
        .map((b) => ({ id: b.id, x: b.x, z: b.z, w: b.w, d: b.d, ry: b.ry || 0, top: +(b.y + b.h / 2 - G(b.x, b.z)).toFixed(2),
          sem: b.semantic, night: night.includes(b) && !lay.blocks.includes(b) }));
      const data = { key, title: `${region.id} · ${box.id} · 阶段 ${region.stages.join("/")}`, box, step, W, H, hg, cut, blocks,
        routes: routes.map((r) => ({ id: r.id, pts: r.pts })).filter((r) => r.pts.some((p) => inBox(p, 10))),
        anchors: anchors.filter((a) => inBox(a, 0)), cams: cams.filter((c) => inBox(c, 0)) };
      const html = MapHtml(data);
      const htmlPath = path.join(out, `Map_${key}.html`); fs.writeFileSync(htmlPath, html);
      const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
      const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
      await page.goto(pathToFileURL(htmlPath).href); await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(out, `Map_${key}.png`), fullPage: true });
      await page.close();
      log.push({ map: key, box, blocks: blocks.length, errs }); console.log("map", key, blocks.length, "blocks", errs.length ? errs : "");
    }
  }
}
function MapHtml(data) {
  return `<!doctype html><meta charset="utf-8"><title>${data.key}</title>
<style>body{margin:0;background:#1d1f1e;color:#ddd;font:13px sans-serif}#t{padding:6px 10px}canvas{display:block}</style>
<div id="t"></div><canvas id="c"></canvas><script>
const D=${JSON.stringify(data)};
const b=D.box, span=Math.max(b.maxX-b.minX,b.maxZ-b.minZ), S=Math.min(1500/(b.maxX-b.minX),1100/(b.maxZ-b.minZ));
const cv=document.getElementById('c'); cv.width=Math.ceil((b.maxX-b.minX)*S)+220; cv.height=Math.ceil((b.maxZ-b.minZ)*S)+20;
const g=cv.getContext('2d'); const X=x=>(x-b.minX)*S, Z=z=>(z-b.minZ)*S;
let lo=Infinity,hi=-Infinity; for(const v of D.hg){if(v<lo)lo=v;if(v>hi)hi=v;} if(hi-lo<1){hi=lo+1;}
document.getElementById('t').textContent=D.title+'   地面 '+lo.toFixed(2)+' … '+hi.toFixed(2)+' m（蓝低→黄高；白线=相对 natural 每 0.5 m 挖/填等值线）  1 格 = 10 m';
const img=g.createImageData(D.W,D.H);
for(let j=0;j<D.H;j++)for(let i=0;i<D.W;i++){const v=(D.hg[j*D.W+i]-lo)/(hi-lo),k=(j*D.W+i)*4;
  img.data[k]=40+200*v; img.data[k+1]=70+150*v; img.data[k+2]=150-110*v; img.data[k+3]=255;}
const tmp=document.createElement('canvas'); tmp.width=D.W; tmp.height=D.H; tmp.getContext('2d').putImageData(img,0,0);
g.imageSmoothingEnabled=false; g.drawImage(tmp,0,0,D.W*D.step*S,D.H*D.step*S);
// cut/fill contours every 0.5 m
g.fillStyle='rgba(255,255,255,.55)';
for(let j=1;j<D.H;j++)for(let i=1;i<D.W;i++){const a=Math.floor(D.cut[j*D.W+i]*2),l=Math.floor(D.cut[j*D.W+i-1]*2),u=Math.floor(D.cut[(j-1)*D.W+i]*2);
  if(a!==l||a!==u)g.fillRect((i+.5)*D.step*S-.5,(j+.5)*D.step*S-.5,1.2,1.2);}
// grid 10 m
g.strokeStyle='rgba(0,0,0,.25)';g.lineWidth=1;g.font='10px sans-serif';g.fillStyle='rgba(255,255,255,.7)';
for(let x=Math.ceil(b.minX/10)*10;x<=b.maxX;x+=10){g.beginPath();g.moveTo(X(x),0);g.lineTo(X(x),Z(b.maxZ));g.stroke();g.fillText(x,X(x)+2,10);}
for(let z=Math.ceil(b.minZ/10)*10;z<=b.maxZ;z+=10){g.beginPath();g.moveTo(0,Z(z));g.lineTo(X(b.maxX),Z(z));g.stroke();g.fillText(z,2,Z(z)-2);}
// blocks (everything map-space is clipped to the box; the legend is drawn after restore)
g.save();g.beginPath();g.rect(0,0,X(b.maxX),Z(b.maxZ));g.clip();
for(const k of D.blocks){g.save();g.translate(X(k.x),Z(k.z));g.rotate(-k.ry);const t=Math.max(0,Math.min(1,k.top/4));
  g.fillStyle=k.night?'rgba(120,90,200,.35)':k.sem==='roof'||k.sem==='timber'&&k.top>2.4?'rgba(90,60,40,.35)':'rgba('+(230-150*t)+','+(230-150*t)+','+(225-150*t)+',.85)';
  g.strokeStyle=k.sem==='cover'?'#3cf':'#111';g.lineWidth=k.sem==='cover'?1.5:.8;g.fillRect(-k.w/2*S,-k.d/2*S,k.w*S,k.d*S);g.strokeRect(-k.w/2*S,-k.d/2*S,k.w*S,k.d*S);g.restore();}
// routes
const pal=['#ff5a5a','#ffd24a','#6cff6c','#ff8cf0','#7ad8ff','#ffa64a','#c0ff4a','#ffffff'];
D.routes.forEach((r,n)=>{g.strokeStyle=pal[n%pal.length];g.lineWidth=2;g.setLineDash([6,3]);g.beginPath();r.pts.forEach((p,i)=>i?g.lineTo(X(p.x),Z(p.z)):g.moveTo(X(p.x),Z(p.z)));g.stroke();g.setLineDash([]);});
// anchors
g.font='11px sans-serif';for(const a of D.anchors){g.fillStyle='#fff';g.beginPath();g.arc(X(a.x),Z(a.z),3,0,7);g.fill();g.fillStyle='#ffe';g.fillText(a.id,X(a.x)+4,Z(a.z)-4);}
// cameras
for(const c of D.cams){const dx=c.lx-c.x,dz=c.lz-c.z,l=Math.hypot(dx,dz)||1;g.strokeStyle='#ff3';g.lineWidth=2;g.beginPath();g.moveTo(X(c.x),Z(c.z));g.lineTo(X(c.x+dx/l*8),Z(c.z+dz/l*8));g.stroke();
  g.fillStyle='#ff3';g.beginPath();g.arc(X(c.x),Z(c.z),4,0,7);g.fill();g.font='bold 12px sans-serif';g.fillText(c.id,X(c.x)-12,Z(c.z)+15);}
g.restore();g.font='11px sans-serif';
D.routes.forEach((r,n)=>{g.fillStyle=pal[n%pal.length];g.fillRect(X(b.maxX)+10,14+n*15,14,4);g.fillText(r.id,X(b.maxX)+28,20+n*15);});
</script>`;
}

// ---------------------------------------------------------------------------
// 1 + 3. 实机机位与高空俯拍
// ---------------------------------------------------------------------------
async function EngineShots(browser, server) {
  const todo = CAMERAS.filter((c) => !only || only.includes(c.id));
  const tops = flag("no-top") ? [] : REGIONS.flatMap((r) => r.boxes.map((box) => ({ r, box, key: r.boxes.length > 1 ? `${r.id}_${box.id}` : r.id })))
    .filter((t) => !only || only.includes(`Top_${t.key}`) || only.includes("top"));
  const byStage = new Map();
  for (const c of todo) { if (!byStage.has(c.stage)) byStage.set(c.stage, { cams: [], tops: [] }); byStage.get(c.stage).cams.push(c); }
  for (const t of tops) { const s = t.r.stages[0]; if (!byStage.has(s)) byStage.set(s, { cams: [], tops: [] }); byStage.get(s).tops.push(t); }
  for (const [stage, { cams, tops: tlist }] of [...byStage].sort((a, b) => a[0] - b[0])) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
    const url = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&missionStage=${stage}&quality=${quality}&scale=small`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
    await page.evaluate(() => window.Tengxian.StepFrames(120));
    const opened = await page.evaluate(() => window.Tengxian.Debug.OpenEditor("samplePoints"));
    for (const c of cams) {
      if (c.scenario) await page.evaluate((id) => { const g = window.Tengxian, st = g.battlefield.layout.scenario.states.find((s) => s.id === id);
        g.battlefield.SetScenarioState(st); g.physics.RefreshStaticQueries?.(); }, c.scenario);
      const pose = { id: c.id, x: c.camera.x, z: c.camera.z, y: c.camera.y ?? null, h: c.camera.h,
        yaw: c.yawDeg * DEG, pitch: c.pitchDeg * DEG, fov: c.fov, phase: null, far: null };
      const res = await ApplyAndShoot(page, pose, path.join(out, `${c.id}.png`));
      log.push({ id: c.id, stage, opened, res }); console.log(c.id, "stage", stage, JSON.stringify(res));
    }
    for (const t of tlist) {
      const { box } = t, cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2;
      const halfZ = (box.maxZ - box.minZ) / 2, halfX = (box.maxX - box.minX) / 2, height = 110;
      // Vertical FOV that fits the box: aspect 16:9, looking straight down with yaw 0 (screen up = north).
      const fov = 2 * Math.atan(Math.max(halfZ, halfX / (1280 / 720)) * 1.04 / height) / DEG;
      const ground = await page.evaluate(([x, z]) => window.Tengxian.battlefield.TerrainHeight?.(x, z) ?? 0, [cx, cz]);
      const pose = { id: `Top_${t.key}`, x: cx, z: cz, y: ground + height, h: null, yaw: 0, pitch: -89.9 * DEG, fov, phase: null, far: 2000 };
      const res = await ApplyAndShoot(page, pose, path.join(out, `Top_${t.key}.png`));
      log.push({ id: pose.id, stage, res }); console.log(pose.id, "stage", stage, "fov", fov.toFixed(1));
    }
    log.push({ stage, errors }); if (errors.length) console.log("stage", stage, "page errors", errors.slice(0, 3));
    await page.close();
  }
}
async function ApplyAndShoot(page, pose, file) {
  const res = await page.evaluate((p) => { const ed = window.Tengxian.editor, tool = ed.active; tool.host.SetViewmodelVisible?.(false);
    const r = tool.ApplyPose(p); document.getElementById("edRoot")?.classList.add("off"); return r; }, pose);
  await page.evaluate(() => { window.Tengxian.editor.active.host.SetViewmodelVisible?.(false); window.Tengxian.StepFrames(30); });
  await page.screenshot({ path: file });
  return res && { x: +res.x.toFixed(2), y: +res.y.toFixed(2), z: +res.z.toFixed(2), ground: res.ground == null ? null : +res.ground.toFixed(2), fov: +res.fov.toFixed(1) };
}

const { LaunchBrowser } = await import(pathToFileURL(WT + "PrairieFire1937/Script_BrowserTestKit.mjs").href);
const browser = await LaunchBrowser();
let server = null;
try {
  if (!flag("no-maps")) await DataMaps(browser);
  if (!flag("no-shots")) {
    const { ServeRoot } = await import(U("Script_DevServer.mjs"));
    server = await ServeRoot(path.resolve(WT), 0);
    await EngineShots(browser, server);
  }
} finally {
  fs.writeFileSync(path.join(out, "shots_log.json"), JSON.stringify(log, null, 1));
  await browser.close(); if (server) await new Promise((r) => server.close(r));
  console.log("->", out);
}
