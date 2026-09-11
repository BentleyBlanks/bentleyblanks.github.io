// 真实指针/触屏回归；固定步进只推进动画，不直接改块体状态或清洁度。
// node EarSpa3D/Script_ChunkPlayTest.mjs --url=http://127.0.0.1:8081/EarSpa3D/
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const common = path.resolve(root, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim());
const require = createRequire(path.join(path.dirname(common), 'package.json'));
const { chromium } = require('playwright-core');
const baseUrl = process.argv.find(v => v.startsWith('--url='))?.slice(6) || 'http://127.0.0.1:8081/EarSpa3D/';
const executablePath = process.env.EARSPA_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const out = path.join(here, '_dev');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const report = { url: baseUrl, at: new Date().toISOString(), profiles: [] };

async function Run(width, height, touch) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
  const cdp = await page.context().newCDPSession(page);
  if (touch) await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const profile = { width, height, touch, checks: [], errors };
  const Check = (ok, name) => { assert.ok(ok, `${width}x${height}: ${name}`); profile.checks.push(name); };
  const Probe = () => page.evaluate(() => window.__EarSpaProbe());
  const Step = n => page.evaluate(n => window.__EarSpaDebug.StepFrames(n), n);
  async function Input(type, x = 0, y = 0) {
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: { down: 'touchStart', move: 'touchMove', up: 'touchEnd', cancel: 'touchCancel' }[type], touchPoints: ['up', 'cancel'].includes(type) ? [] : [{ x, y }] });
    else {
      if (type === 'down') { await page.mouse.move(x, y); await page.mouse.down(); }
      if (type === 'move') await page.mouse.move(x, y, { steps: 4 });
      if (type === 'up' || type === 'cancel') await page.mouse.up();
    }
    // CDP 输入返回不代表主线程已派发 pointermove；先让事件进入，再固定步进。
    await page.waitForTimeout(45);
  }
  async function Grab(id) {
    const p = await Probe(), target = p.targets.find(t => t.id === id);
    const x = p.stage.x + target.screen.x, y = p.stage.y + target.screen.y;
    await Input('down', x, y); await Step(12);
    Check((await Probe()).active === id, `目标 ${id} 可直接点中`);
    return { x, y, original: target };
  }
  async function Extract(id,capture=false) {
    const {x,y,original}=await Grab(id);
    const initial=await Probe();
    const dx=original.pullScreen.x-original.screen.x,dy=original.pullScreen.y-original.screen.y;
    await Input('move',x+dx*.08,y+dy*.08);await Step(12);
    const partial=(await Probe()).targets.find(t=>t.id===id);
    Check(partial.physics.anchors>0&&partial.triangles===original.triangles,`目标 ${id} 受力时保持完整拓扑与粘附`);
    if(capture)await page.screenshot({path:path.join(out,`Shot_${width}x${height}_Peel.png`)});
    await Input('move',x+dx,y+dy);await Step(100);
    const held=(await Probe()).targets.find(t=>t.id===id);
    Check(held.state==='held'&&held.physics.detached&&held.physics.grip,`目标 ${id} 松脱后仍由工具持住`);
    Check(held.scale.every(v=>v===1)&&held.triangles===original.triangles,`目标 ${id} 尺寸和几何不变`);
    Check((await Probe()).harvest.length===initial.harvest.length,`目标 ${id} 持握时不提前收集`);
    await Step(90);
    Check((await Probe()).targets.find(t=>t.id===id).state==='held',`目标 ${id} 不会自动飞走`);
    if(capture)await page.screenshot({path:path.join(out,`Shot_${width}x${height}_Held.png`)});
    await Input('up');await Step(60);
    const carrying=await Probe();
    Check(carrying.transfer?.toolVisible&&carrying.targets.find(t=>t.id===id).state==='carrying',`目标 ${id} 由可见工具带出`);
    Check(carrying.targets.find(t=>t.id===id).scale.every(v=>v===1),`目标 ${id} 带出时保持毫米尺寸`);
    Check(carrying.stats.triangles<=180000&&carrying.stats.drawCalls<=120,'带出时渲染预算');
    if(capture)await page.screenshot({path:path.join(out,`Shot_${width}x${height}_Carry.png`)});
    await Step(140);
    const landed=await Probe();
    Check(landed.targets.find(t=>t.id===id).state==='collected',`目标 ${id} 已落盘`);
    Check(landed.harvest.filter(t=>t.id===id).length===1,`目标 ${id} 只收集一次`);
    await Step(15);
  }
  try {
    await page.goto(baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'debug=1');
    await page.waitForFunction(() => window.__EarSpaDebug);
    await page.screenshot({ path: path.join(out, `Shot_${width}x${height}_Welcome.png`) });
    await page.locator('#ear-start').click(); await Step(150);
    const initial = await Probe();
    Check(initial.phase === 'playing' && initial.targets.length === 9, '开始进入完整九块回合');
    Check(initial.viewReady && initial.model?.source==='BlenderMCP', 'Blender 模型已加载且镜头已进入耳道');
    Check(initial.stats.triangles <= 180000 && initial.stats.drawCalls <= 120, '渲染预算');
    const layout = await page.evaluate(() => {
      const ids = ['.spa-header', '.session-bar', '.instruction', '.play-stage', '.tool-dock', '.quiet-footer'];
      return { overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight, rects: ids.map(id => { const r = document.querySelector(id).getBoundingClientRect(); return { id, x: r.x, y: r.y, w: r.width, h: r.height }; }) };
    });
    Check(!layout.overflow, '页面无溢出');
    Check(layout.rects.every(r => r.x >= 0 && r.y >= 0 && r.x + r.w <= width + 1 && r.y + r.h <= height + 1), '全部界面区域在屏内');
    for (let i = 0; i < layout.rects.length; i++) for (let j = i + 1; j < layout.rects.length; j++) {
      const a = layout.rects[i], b = layout.rects[j];
      Check(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x) < 1 || Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y) < 1, `${a.id} 与 ${b.id} 无遮挡`);
    }
    await page.screenshot({ path: path.join(out, `Shot_${width}x${height}_Start.png`) });
    await Step(300); Check((await Probe()).cleanliness === 0, '待机不自动消除');
    const held = await Grab(0);
    await Step(240);Check((await Probe()).targets[0].physics.anchors===5,'抓住但静止不自动松脱');
    for(let i=0;i<10;i++){await Input('move',held.x+(i%2?1:-1),held.y);await Step(6);}
    Check((await Probe()).targets[0].physics.anchors===5,'重复微动不累积消除进度');
    const pull=held.original.pullScreen,screen=held.original.screen;
    await Input('move',held.x-(pull.x-screen.x)*.28,held.y-(pull.y-screen.y)*.28);await Step(90);
    Check(!(await Probe()).targets[0].physics.detached,'推向内壁不能清除');
    await Input('cancel'); await Step(180);
    Check((await Probe()).targets[0].state === 'attached' && (await Probe()).harvest.length === 0, '中途松手/取消会完整放回且无收益');
    await page.locator('[data-tool="drops"]').click();
    const hard = (await Probe()).targets.find(t => t.type === 'impacted');
    const pos = (await Probe()).stage;
    await Input('down', pos.x + hard.screen.x, pos.y + hard.screen.y); await Input('up');
    Check((await Probe()).targets.find(t => t.id === hard.id).softened > .7, '软化液实际降低块体阻力');
    Check((await Probe()).harvest.length === 0, '软化不会代替完整取出');
    await page.locator('[data-tool="scoop"]').click();
    await Extract(0, true);
    await page.locator('[data-tool="tweezers"]').click();
    await Extract(2);
    await page.locator('[data-tool="scoop"]').click();
    for (const id of [1, 3, 4, 5, 6, 7, 8]) await Extract(id);
    await Step(120);
    const final = await Probe();
    Check(final.phase === 'complete' && final.cleanliness === 1 && final.harvest.length === 9, '真实操作完成清洁与结算');
    Check(final.events.filter(e => e.type === 'release').length === 9 && final.events.filter(e => e.type === 'land').length === 9, '每块仅一次脱离和落盘');
    Check(final.shop.totalCustomers === 1 && final.shop.coins > 60, '报酬只结算一次');
    Check(final.audio.contextState === 'running' && final.audio.sfxMissing.length === 0, '触摸解锁音频且素材无缺失');
    Check(final.audio.recentPlayback.some(p => p.cue === 'chunkLand' && p.offset > .1), '落盘声按实际起音去掉前置静音');
    Check(final.audio.activeContacts.length === 0, '停止操作后无残留摩擦噪声');
    await page.screenshot({ path: path.join(out, `Shot_${width}x${height}_Complete.png`) });
    await Step(600); Check((await Probe()).phase === 'complete' && (await Probe()).shop.coins === final.shop.coins, '结算停留供欣赏且不重复收款');
    await page.locator('#settings-open').click();
    await page.screenshot({ path: path.join(out, `Shot_${width}x${height}_Settings.png`) });
    await page.locator('[data-upgrade="earPickBamboo"]').click();
    Check((await Probe()).shop.toolLevels.earPickBamboo === 2, '升级沿用旧存档工具 ID');
    await page.locator('#settings-close').click();
    await page.locator('#next-customer').click(); await Step(90);
    Check((await Probe()).phase === 'playing' && (await Probe()).cleanliness === 0 && (await Probe()).harvest.length === 0, '下一位完整重置');
    await page.locator('#sound-toggle').click();
    Check((await Probe()).settings.muted, '静音生效');
    await page.reload(); await page.waitForFunction(() => window.__EarSpaDebug);
    Check((await Probe()).settings.muted && (await Probe()).shop.toolLevels.earPickBamboo === 2, '声音设置与原经营存档保留');
    Check(errors.length === 0, '无未捕获错误或请求失败');
    profile.final = final; profile.layout = layout; profile.clean = true;
    console.log(`PASS ${width}x${height} ${touch ? 'touch' : 'mouse'}: ${profile.checks.length} checks`);
  } catch (error) {
    profile.clean = false; profile.failure = error.message; profile.probe = await Probe().catch(() => null);
    await page.screenshot({ path: path.join(out, `Shot_${width}x${height}_Failure.png`) });
    throw error;
  } finally { report.profiles.push(profile); await fs.writeFile(path.join(out, 'Data_RedesignAudit.json'), JSON.stringify(report, null, 2)); await page.close(); }
}
try {
  for (const profile of [[1000,900,false],[390,844,true],[320,568,true],[844,390,true]]) await Run(...profile);
} finally { await browser.close(); }
