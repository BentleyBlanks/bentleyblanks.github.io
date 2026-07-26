/* =====================================================================
   敌后·1939—1945 —— 无头冒烟回归
   node TaihangDemo/Dihou1939/Script_SmokeTest.mjs

   除规则正确性外，重点断言两件事：
   1) 玩家能操作：合成 pointer 事件走通 选中→移动→点敌进攻 全链路；
   2) 好玩的底线：第1回合就看得见敌人、够得着攻击目标；扫荡真的会来；
      蠢打/会玩/莽打三种 bot 打完 80 回合分数拉得开。
   ===================================================================== */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(HERE, "index.html"), "utf8");

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  <<< " + extra : "")); }
};
const section = (t) => console.log("\n── " + t + " " + "─".repeat(Math.max(0, 54 - t.length)));

/* ── 桩 DOM ─────────────────────────────────────────────────────── */
const CTX = ["save","restore","beginPath","closePath","moveTo","lineTo","arc","quadraticCurveTo",
  "fill","stroke","fillRect","strokeRect","clearRect","translate","rotate","scale","setTransform",
  "drawImage","fillText","strokeText","setLineDash","clip","rect","arcTo","bezierCurveTo"];
function makeCtx(){
  const c = {
    canvas:null, globalAlpha:1, lineWidth:1, lineCap:"butt", lineDashOffset:0,
    fillStyle:"", strokeStyle:"", font:"", textAlign:"", textBaseline:"", shadowColor:"", shadowBlur:0,
    createLinearGradient:()=>({addColorStop(){}}), createRadialGradient:()=>({addColorStop(){}}),
    measureText:()=>({width:10}), getImageData:()=>({data:new Uint8ClampedArray(4)})
  };
  for(const m of CTX) c[m]=()=>{};
  return c;
}
class El {
  constructor(tag,id){
    this.tagName=(tag||"div").toUpperCase(); this.id=id||"";
    this.style={}; this.children=[]; this._html=""; this.textContent="";
    this.className=""; this.title=""; this.disabled=false; this.onclick=null;
    this.width=0; this.height=0; this.offsetHeight=0; this.offsetWidth=0;
    this.dataset={}; this.childNodes=[{textContent:""}];
    this._listeners=new Map(); this._ctx=null;
    this.classList={
      add:(c)=>{ if(!this.className.split(/\s+/).includes(c)) this.className=(this.className+" "+c).trim(); },
      remove:(c)=>{ this.className=this.className.split(/\s+/).filter(x=>x&&x!==c).join(" "); },
      toggle:(c,on)=>{ const has=this.className.split(/\s+/).includes(c); const want=on===undefined?!has:!!on;
        if(want) this.classList.add(c); else this.classList.remove(c); },
      contains:(c)=>this.className.split(/\s+/).includes(c)
    };
  }
  get innerHTML(){ return this._html; }
  set innerHTML(v){ this._html=String(v); if(v==="") this.children=[]; }
  get firstChild(){ return this.children[0]||null; }
  appendChild(n){ this.children.push(n); return n; }
  removeChild(n){ this.children=this.children.filter(x=>x!==n); return n; }
  getContext(){ if(!this._ctx){ this._ctx=makeCtx(); this._ctx.canvas=this; } return this._ctx; }
  getBoundingClientRect(){ return { left:0, top:0, right:1360, bottom:860, width:1360, height:860, x:0, y:0 }; }
  addEventListener(t,f){ if(!this._listeners.has(t)) this._listeners.set(t,[]); this._listeners.get(t).push(f); }
  removeEventListener(t,f){ const a=this._listeners.get(t); if(a) this._listeners.set(t,a.filter(x=>x!==f)); }
  dispatch(t,ev){ const a=this._listeners.get(t)||[]; for(const f of a) f(ev); return a.length; }
  querySelector(){ return null; }
  querySelectorAll(){ return []; }
  setPointerCapture(){}
}
const IDS = ["cv","top","dateBox","dateNum","eraTag","rFood","dFood","rMan","dMan","rArms","rPol","rHeat",
  "heatFill","btnPolicy","btnMission","btnHelp","missionBar","roster","bottom","actWrap","actTitle","acts",
  "nextWrap","recruitBar","btnNext","nextSub","feed","banner","bannerT","bannerS","fcCard","tip","toast","hint","modalRoot"];
const registry = new Map();
for(const id of IDS) registry.set(id, new El(id==="cv"?"canvas":(id.startsWith("btn")?"button":"div"), id));

const documentStub = {
  readyState:"complete",
  getElementById:(id)=>registry.get(id)||null,
  createElement:(tag)=>new El(tag),
  querySelector:(sel)=>(sel&&sel[0]==="#")?(registry.get(sel.slice(1))||null):null,
  querySelectorAll:()=>[],
  addEventListener:()=>{},
  body:new El("body")
};
const rafQueue = [];
const lsData = new Map();
const windowStub = {
  innerWidth:1360, innerHeight:860, devicePixelRatio:1,
  requestAnimationFrame:(fn)=>{ rafQueue.push(fn); return rafQueue.length; },
  cancelAnimationFrame:()=>{},
  addEventListener:()=>{},
  setTimeout, clearTimeout, setInterval, clearInterval,
  performance:{ now:()=>Date.now() },
  localStorage:{ getItem:(k)=>lsData.has(k)?lsData.get(k):null, setItem:(k,v)=>lsData.set(k,String(v)), removeItem:(k)=>lsData.delete(k) }
};
const sandbox = {
  window:windowStub, document:documentStub, localStorage:windowStub.localStorage,
  requestAnimationFrame:windowStub.requestAnimationFrame, cancelAnimationFrame:windowStub.cancelAnimationFrame,
  performance:windowStub.performance,
  setTimeout, clearTimeout, setInterval, clearInterval,
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, Error,
  Map, Set, Uint8ClampedArray, isNaN, parseInt, parseFloat, Infinity, NaN, undefined
};
sandbox.globalThis = sandbox;
sandbox.self = windowStub;

/* ── 加载 ───────────────────────────────────────────────────────── */
section("加载与语法");
const m = HTML.match(/<script>([\s\S]*?)<\/script>/);
ok(!!m, "index.html 内含 <script> 主体");
const CODE = m ? m[1] : "";
ok(CODE.length > 60000, "脚本主体长度合理", CODE.length+" chars");
let compiled = null;
try{ compiled = new vm.Script(CODE, { filename:"Dihou1939.js" }); ok(true,"语法通过 (vm.Script)"); }
catch(e){ ok(false,"语法通过 (vm.Script)", e.message); }
if(!compiled) process.exit(1);
const ctxVm = vm.createContext(sandbox);
let bootErr = null;
try{ compiled.runInContext(ctxVm); }catch(e){ bootErr = e; }
ok(!bootErr, "Boot() 无异常", bootErr && (bootErr.message+"\n"+bootErr.stack));
const DH = sandbox.window.DH;
ok(!!DH, "暴露 window.DH 测试钩子");
if(!DH) process.exit(1);
DH.setSkipAnim(true); DH.setMuted(true);
registry.get("modalRoot").innerHTML = "";      // 关掉标题弹层
const G = DH.G;
const SEED = 20260727;
DH.NewGame(SEED); DH.FitView(); DH.Sync();
const cv = registry.get("cv");

/* ── 第一分钟：看得见敌人、够得着目标 ───────────────────────────── */
section("第一分钟：可见的敌人与可打的目标");
ok(G.eUnits.length >= 5, "开局地图上有 ≥5 支敌军部队在动", "实际 "+G.eUnits.length);
const visE = G.eUnits.filter(e=>DH.EnemyVisible(e));
ok(visE.length >= 1, "第1回合就有敌军部队在我视野内", "可见 "+visE.length+" 支");
const visF = G.tiles.filter(t=>t.fort && !t.fort.pOwned && t.fog>=1);
ok(visF.length >= 1, "第1回合就看得见敌据点/炮楼", "可见 "+visF.length+" 座");
let anyAtk = 0, atkUnit = null;
for(const u of G.units){
  DH.SEL = u; DH.RefreshOrders();
  const n = DH.ATK ? DH.ATK.size : 0;
  if(n>0 && !atkUnit) atkUnit = u;
  anyAtk += n;
}
ok(anyAtk >= 1, "第1回合就有部队能发起进攻（移动+攻击一体）", "可打目标合计 "+anyAtk);
ok(G.units.length === 5, "开局五支部队（主力/游击×2/工作队×2）", "实际 "+G.units.length);
ok(G.units.every(u=>DH.T(u.q,u.r) && DH.T(u.q,u.r).terr!=="water"), "无部队落水");
for(const u of G.units){
  const rc = DH.Reachable(u);
  ok(rc.cost.size >= 8, `【${u.name}】开局可达格 ≥8`, "实际 "+rc.cost.size);
}

/* ── 交互链路（合成 pointer 事件）───────────────────────────────── */
section("交互链路：合成 pointer 事件");
ok((cv._listeners.get("pointerdown")||[]).length>0, "canvas 挂了 pointerdown");
ok((cv._listeners.get("click")||[]).length>0, "canvas 挂了 click 兜底");
const screenOf = (q,r)=>{ const p=DH.hexToPix(q,r,DH.view.s); return { x:p.x+DH.view.ox, y:p.y+DH.view.oy }; };
const ev = (x,y,extra)=>Object.assign({ clientX:x, clientY:y, pointerId:1, pointerType:"mouse", preventDefault(){}, button:0 }, extra||{});
function tap(x,y,jit){ cv.dispatch("pointerdown",ev(x,y)); if(jit) cv.dispatch("pointermove",ev(x+jit,y+jit)); cv.dispatch("pointerup",ev(x+(jit||0),y+(jit||0))); }

// 点部队 → 选中
DH.SEL = null; DH.RefreshOrders();
const u0 = G.units[0];
tap(screenOf(u0.q,u0.r).x, screenOf(u0.q,u0.r).y);
ok(DH.SEL === u0, "点地图部队 → 选中", "SEL="+(DH.SEL&&DH.SEL.name));
// 5px 手抖
DH.SEL = null;
tap(screenOf(u0.q,u0.r).x, screenOf(u0.q,u0.r).y, 5);
ok(DH.SEL === u0, "5px 手抖仍算点击");
// 30px 拖动 = 平移不选中
DH.SEL = null;
const ox0 = DH.view.ox;
cv.dispatch("pointerdown",ev(400,400));
cv.dispatch("pointermove",ev(430,412));
cv.dispatch("pointerup",ev(430,412));
ok(DH.SEL === null, "30px 拖动不误选");
ok(DH.view.ox !== ox0, "30px 拖动确实平移了视图");
DH.view.ox = ox0;
// 点亮格 → 坐标真的变了
DH.SelectUnit(u0);
const before = { q:u0.q, r:u0.r, mp:u0.mp };
const keys = [...DH.REACH.cost.keys()];
const [tq,tr] = keys[Math.floor(keys.length/2)].split(",").map(Number);
tap(screenOf(tq,tr).x, screenOf(tq,tr).y);
ok(u0.q===tq && u0.r===tr, "点亮格 → 部队坐标真的变了", `期望${tq},${tr} 实得${u0.q},${u0.r}`);
ok(u0.mp < before.mp, "移动消耗机动力", `${before.mp}→${u0.mp}`);
// 点敌人 → 战斗真的发生
DH.SelectUnit(atkUnit);
const tgtKey = [...DH.ATK.keys()][0];
const tgt = DH.ATK.get(tgtKey);
const ti0 = DH.Forecast(atkUnit, tgt).ti;
const hpBefore = ti0.kind==="unit" ? ti0.e.hp : ti0.fort.g;
tap(screenOf(tgt.q,tgt.r).x, screenOf(tgt.q,tgt.r).y);
const hpAfter = ti0.kind==="unit" ? (ti0.e.alive?ti0.e.hp:-1) : (ti0.tile.fort?ti0.tile.fort.g:-1);
ok(atkUnit.acted === true, "点击红圈敌人 → 攻击执行（acted=true）");
ok(hpAfter < hpBefore, "敌人真的掉血/掉守备", `${hpBefore}→${hpAfter}`);
// 点不可达处有反馈
DH.SelectUnit(G.units[1]);
const far = G.tiles.find(t=>DH.hexDist(t.q,t.r,G.units[1].q,G.units[1].r)>9) || G.tiles[G.tiles.length-1];
let tapErr = null;
try{ tap(screenOf(far.q,far.r).x, screenOf(far.q,far.r).y); }catch(e){ tapErr=e; }
ok(!tapErr, "点远处不可达不抛异常", tapErr&&tapErr.message);
ok(registry.get("toast").textContent.length>0, "点不可达有文字反馈", registry.get("toast").textContent);
let outErr = null;
try{ tap(-9999,-9999); }catch(e){ outErr=e; }
ok(!outErr, "点地图外不抛异常");

/* ── 动作规则 ───────────────────────────────────────────────────── */
section("动作：组织 / 破袭 / 招兵 / 政策");
const wt = G.units.find(u=>u.type==="wt");
const v0 = G.tiles.find(t=>t.vill && t.vill.org===0 && !t.vill.burn);
wt.q=v0.q; wt.r=v0.r; wt.acted=false; wt.mp=4;
DH.SelectUnit(wt);
ok(DH.CanOrganize(wt), "工作队在未组织村可发动群众");
DH.DoOrganize(wt);
wt.acted=false; wt.mp=4;
DH.DoOrganize(wt);
ok(v0.vill.org===1, "两次发动 → 组织度1（无减租减息时）", "org="+v0.vill.org);

const guer = G.units.find(u=>u.type==="guer");
const rail = G.tiles.find(t=>t.rail && !t.fort);
guer.q=rail.q; guer.r=rail.r; guer.acted=false; guer.mp=5;
DH.SelectUnit(guer);
ok(DH.CanSabotage(guer), "战斗部队在铁轨上可破袭");
const saboBefore = G.score.sabo;
DH.DoSabotage(guer);
ok(rail.railCut===true && G.score.sabo===saboBefore+1, "破袭后铁路中断且计分");

G.res.man=60; G.res.arms=60;
DH.StartRecruit("reg");
ok(DH.recruitMode==="reg", "进入招兵放置模式");
const spot = DH.RecruitSpots()[0];
ok(!!spot, "存在合法成军点（堡垒村）");
const cntBefore = G.units.length;
tap(screenOf(spot.q,spot.r).x, screenOf(spot.q,spot.r).y);
ok(G.units.length===cntBefore+1, "点高亮格成军 → 新部队入列");

G.res.pol=40; G.polOffer=null;
DH.MaybeOffer();
ok(Array.isArray(G.polOffer) && G.polOffer.length>=1, "政治点够时给出政策三选一");
const polPick = G.polOffer.find(k=>DH.POLICIES[k].cost<=G.res.pol);
DH.PickPolicy(polPick);
ok(G.policies.includes(polPick), "选定政策立即生效", polPick);

/* ── 敌军回合：真的会动、真的会打 ───────────────────────────────── */
section("敌军回合");
const posBefore = G.eUnits.map(e=>DH.K(e.q,e.r)).join("|");
let etErr = null;
try{ await DH.EndTurn(); }catch(e){ etErr=e; }
ok(!etErr, "EndTurn 完整跑通（敌相 + 结算）", etErr&&(etErr.message+"\n"+etErr.stack));
ok(G.turn===2, "回合推进到第2月", "turn="+G.turn);
const posAfter = G.eUnits.map(e=>DH.K(e.q,e.r)).join("|");
ok(posBefore!==posAfter, "敌军巡逻队真的移动了");

/* ── 扫荡：压力系统必须触发 ─────────────────────────────────────── */
section("扫荡系统（强制触发）");
G.heat = 100;
let sawWarn=false, sawActive=false, sawCols=0;
for(let i=0;i<12 && !G.over;i++){
  await DH.EndTurn();
  if(G.sweep.state==="warn") sawWarn=true;
  if(G.sweep.state==="active"){ sawActive=true; sawCols=Math.max(sawCols, G.eUnits.filter(e=>e.task.kind==="sweep").length); }
  if(sawActive && G.sweep.state==="none") break;
}
ok(sawWarn, "扫荡先有两个月预警（红箭头窗口）");
ok(sawActive, "扫荡真的打响");
ok(sawCols>=2, "≥2路讨伐纵队进山（可见可打）", "纵队 "+sawCols);
ok(!G.over || G.units.length>0, "测试局未被直接团灭");

/* ── 存读档 ─────────────────────────────────────────────────────── */
section("存读档");
DH.SaveGame();
ok(DH.HasSave(), "SaveGame 落盘");
const snap = { turn:G.turn, food:Math.round(G.res.food), units:G.units.length, org:DH.OrgVills().length,
               sabo:G.score.sabo, heat:Math.round(G.heat) };
G.res.food = 999; G.turn = 79;
ok(DH.LoadGame(), "LoadGame 成功");
const snap2 = { turn:G.turn, food:Math.round(G.res.food), units:G.units.length, org:DH.OrgVills().length,
                sabo:G.score.sabo, heat:Math.round(G.heat) };
ok(JSON.stringify(snap)===JSON.stringify(snap2), "读档后关键状态一致", JSON.stringify(snap)+" vs "+JSON.stringify(snap2));

/* ── 团灭路径 ───────────────────────────────────────────────────── */
section("败局");
DH.NewGame(7);
G.units.length = 0;
await DH.EnemyPhase();
ok(G.over===true, "全军覆没触发败局结算");
registry.get("modalRoot").innerHTML="";

/* ── 三种 bot 全程仿真 ──────────────────────────────────────────── */
section("全程仿真：80回合 × 3种打法 × 2种子");
function nearestReach(u, pred){
  DH.SelectUnit(u);
  if(!DH.REACH) return null;
  let best=null, bd=1e9;
  for(const k of DH.REACH.cost.keys()){
    const [q,r]=k.split(",").map(Number);
    const d = pred(DH.T(q,r), q, r);
    if(d!=null && d<bd){ bd=d; best=[q,r]; }
  }
  return best;
}
async function runBot(seed, style){
  DH.NewGame(seed);
  registry.get("modalRoot").innerHTML="";
  let sweeps=0, guard=0;
  while(!G.over && G.turn<=DH.CFG.endTurn && guard++<95){
    // 政策：能选就选第一张
    if(G.polOffer){ const k=G.polOffer.find(x=>DH.POLICIES[x].cost<=G.res.pol); if(k) DH.PickPolicy(k); else G.polOffer=null; }
    registry.get("modalRoot").innerHTML="";
    // 招兵：根据地不足先补工作队，然后按枪招兵
    if(style!=="dumb"){
      const wtCount = G.units.filter(u=>u.type==="wt").length;
      const wish = (DH.OrgVills().length<10 && wtCount<3) ? ["wt"] : ["guer","reg","main"];
      for(const t of wish){
        if(DH.CanAfford(t) && G.res.food>10 && G.units.length<13){
          const sp = DH.RecruitSpots()[0];
          if(sp){ DH.StartRecruit(t); DH.PlaceRecruit(sp); }
          break;
        }
      }
    }
    for(const u of G.units.slice()){
      if(!u.alive || u.acted) continue;
      DH.SelectUnit(u);
      if(u.type==="wt"){
        if(DH.CanOrganize(u)){ DH.DoOrganize(u); continue; }
        const b = nearestReach(u, t=>(t.vill&&!t.vill.burn&&t.vill.org<3&&!DH.UnitAt(t.q,t.r))?DH.hexDist(t.q,t.r,u.q,u.r):null);
        if(b){ DH.DoMove(u,b[0],b[1]); if(DH.CanOrganize(u)){ u.acted=false; DH.DoOrganize(u); } }
        else { u.acted=true; }
        continue;
      }
      if(style!=="dumb" && u.hp<40){
        const b = nearestReach(u, t=>(t.vill&&t.vill.org>=1&&!t.vill.burn)?DH.hexDist(t.q,t.r,u.q,u.r):null);
        if(b){ DH.DoMove(u,b[0],b[1]); DH.DoRest(u); continue; }
      }
      // 攻击：greedy 无脑打；smart 只打有利仗
      if(DH.ATK && DH.ATK.size){
        let bestT=null, bestV=-1e9;
        for(const [,tg] of DH.ATK){
          const fc = DH.Forecast(u,tg);
          let v = fc.dmg[0]-fc.ret[1] + (fc.kill?30:0) + (fc.ti.kind==="fort"?8:0);
          if(v>bestV){ bestV=v; bestT=tg; }
        }
        const goodEnough = style==="greedy" ? true : bestV > -5;
        if(bestT && goodEnough && !DH.UNITS[u.type].civ){ DH.DoAttack(u,bestT); continue; }
      }
      // 破袭
      const here = DH.T(u.q,u.r);
      if(here.rail && DH.CanSabotage(u)){ DH.DoSabotage(u); continue; }
      if(u.type==="guer" || style==="dumb"){
        const b = nearestReach(u, t=>(t.rail&&!t.railCut&&!t.fort)?DH.hexDist(t.q,t.r,u.q,u.r):null);
        if(b){ DH.DoMove(u,b[0],b[1]); if(DH.CanSabotage(u)) DH.DoSabotage(u); else u.acted=true; continue; }
      }
      // 主力/地方 → 逼近最弱敌据点
      const b = nearestReach(u, t=>{
        if(!t.fort || t.fort.pOwned) return null;
        return t.fort.g*2 + DH.hexDist(t.q,t.r,u.q,u.r);
      });
      if(b) DH.DoMove(u,b[0],b[1]);
      u.acted = true;
    }
    await DH.EndTurn();
    registry.get("modalRoot").innerHTML="";
    if(G.sweep.state==="active") sweeps=Math.max(sweeps,1);
  }
  const s=G.score;
  return { turn:G.turn, over:G.over, org:DH.OrgVills().length, kills:s.kJ+s.kP, razed:s.razed,
           towns:s.towns, rail:s.railDays, lost:s.lost, units:G.units.length, sweeps, burned:s.burned,
           pts:DH.ScorePts() };
}
const results = {};
for(const style of ["dumb","smart","greedy"]){
  for(const seed of [11, 20260727]){
    let r=null, err=null;
    try{ r = await runBot(seed, style); }catch(e){ err=e; }
    ok(!err, `${style}/seed${seed}: 全程无异常`, err&&(err.message+"\n"+(err.stack||"").split("\n").slice(0,4).join("\n")));
    if(r){
      ok(r.turn>DH.CFG.endTurn || r.over, `${style}/seed${seed}: 战局正常终结`, `turn=${r.turn}`);
      results[style+seed]=r;
      console.log(`     ↳ ${r.pts}分 · 根据地村${r.org} 歼敌${r.kills} 拔点${r.razed} 县城${r.towns} 破交${r.rail} 损失${r.lost} 扫荡${r.sweeps?"有":"无"} 烧村${r.burned}`);
    }
  }
}
const smart = results["smart20260727"], dumb = results["dumb20260727"];
if(smart && dumb){
  ok(smart.kills >= 5, "会玩的 bot 歼敌 ≥5（缴获循环转得起来）", "kills="+smart.kills);
  ok(smart.org >= 5, "会玩的 bot 根据地村 ≥5", "org="+smart.org);
  ok(smart.kills+smart.org > dumb.kills+dumb.org, "会玩明显强于乱打（分数拉得开）",
     `smart=${smart.kills+smart.org} dumb=${dumb.kills+dumb.org}`);
}
const anySweep = Object.values(results).some(r=>r.sweeps>0);
ok(anySweep, "至少一局自然触发了大扫荡（压力系统活着）");
const g2 = results["greedy20260727"];
if(smart && dumb && g2){
  ok(smart.pts > g2.pts && g2.pts > dumb.pts,
     "分数排序：会玩 > 莽撞 > 乱打（拼消耗被定价，缩头拿不到分）",
     `smart=${smart.pts} greedy=${g2.pts} dumb=${dumb.pts}`);
}

/* ── 渲染 ───────────────────────────────────────────────────────── */
section("渲染");
DH.NewGame(SEED); registry.get("modalRoot").innerHTML="";
DH.FitView();
// 全图揭雾 + 布满状态，逼所有绘制分支都走一遍
for(const t of G.tiles){ t.fog=2; if(t.rail&&!t.fort&&!t.railCut){ t.railCut=true; break; } }
const cvEl = registry.get("cv"), cctx = cvEl.getContext();
const tally = { fillText:0, arc:0, fill:0 };
for(const k of Object.keys(tally)){
  const orig = cctx[k];
  cctx[k] = function(...a){ tally[k]++; return orig.apply(this,a); };
}
let rErr=null;
try{ for(let i=0;i<3;i++){ const f=rafQueue.pop(); if(f) f(); } }catch(e){ rErr=e; }
ok(!rErr, "Render 连续三帧不抛异常（全图揭雾）", rErr&&(rErr.message+"\n"+(rErr.stack||"").split("\n").slice(0,4).join("\n")));
ok(tally.fillText > 60, "文字标签真的上屏（村名/守备/番号）", "fillText="+tally.fillText);
ok(tally.arc >= G.eUnits.filter(e=>DH.EUNITS[e.type].jp).length*2, "日军太阳旗徽记真的画了（敌人看得见）", "arc="+tally.arc);

console.log("\n"+"=".repeat(62));
console.log(`  通过 ${pass}   失败 ${fail}`);
console.log("=".repeat(62));
process.exit(fail?1:0);
