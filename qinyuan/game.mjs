import {
  CFG, TERRAIN, UNIT_TYPES, DOCTRINES, CHAPTERS, REFUGES,
  createGame, getVillage, getPost, getUnit, unitAt, tileAt, neighbors, hexDistance,
  dateLabel, chapterIndex, visibleKeys, isEnemyVisible, shortestPath, reachableTiles,
  moveUnit, hardenVillage, evacuateVillage, returnVillage, establishBlockade,
  layMine, cutRoad, gatherIntel, propaganda, computeSiege, postMetric,
  attackPreview, attackUnit, raidPost, fortifyUnit, changeDoctrine,
  objectiveStatus, endTurn, serializeGame, deserializeGame, invariantChecks,
} from "./rules.mjs";

const $ = id => document.getElementById(id);
const canvas = $("board"), ctx = canvas.getContext("2d");
const SAVE_KEY = "qinyuan_reverse_siege_v1";
const SQ3 = Math.sqrt(3), HEX = 43;

let state = createGame(194211);
let selection = null;
let pending = null;
let hoverTile = null;
let soundOn = true;
let audio = null;
let width = innerWidth, height = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
let camera = { x: 5 * HEX * 1.5, y: (4 + .5) * HEX * SQ3, zoom: 1 };
let pointerStart = null, dragged = false;
const activePointers = new Map();
let pinch = null;

function ensureAudio() {
  if (!soundOn) return null;
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === "suspended") audio.resume();
  return audio;
}

function beep(freq = 300, duration = .055, volume = .025, type = "triangle") {
  const ac = ensureAudio();
  if (!ac) return;
  const osc = ac.createOscillator(), gain = ac.createGain();
  osc.type = type; osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + duration);
  osc.connect(gain).connect(ac.destination); osc.start(); osc.stop(ac.currentTime + duration);
}

function resize() {
  width = innerWidth; height = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  draw();
}

function worldCenter(q, r) { return { x: q * HEX * 1.5, y: (r + (q & 1) * .5) * HEX * SQ3 }; }
function screenCenter(q, r) {
  const w = worldCenter(q, r);
  return { x: (w.x - camera.x) * camera.zoom + width / 2, y: (w.y - camera.y) * camera.zoom + height / 2 };
}
function screenToWorld(x, y) { return { x: (x - width / 2) / camera.zoom + camera.x, y: (y - height / 2) / camera.zoom + camera.y }; }
function centerCamera(q, r, zoom = camera.zoom) { const p = worldCenter(q,r); camera.x=p.x;camera.y=p.y;camera.zoom=zoom;draw(); }
function centerCampaignCamera(zoom = camera.zoom) {
  const p=worldCenter(5,4);camera.x=p.x;camera.zoom=zoom;camera.y=p.y+72/zoom;draw();
}

function hexPath(cx, cy, radius = HEX * camera.zoom) {
  ctx.beginPath();
  for (let i=0;i<6;i++) {
    const angle = i * Math.PI / 3;
    const x = cx + Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius;
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath();
}

function roundedRect(x,y,w,h,r) {
  const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.roundRect(x,y,w,h,rr);
}

function drawTerrain(tile, cx, cy, radius, visible) {
  const terrain=TERRAIN[tile.terrain];
  hexPath(cx,cy,radius);ctx.fillStyle=terrain.color;ctx.fill();
  ctx.strokeStyle="rgba(38,42,33,.26)";ctx.lineWidth=Math.max(.7,camera.zoom*.75);ctx.stroke();
  ctx.save();hexPath(cx,cy,radius*.9);ctx.clip();
  const s=camera.zoom;
  if(tile.terrain==='ridge'){
    ctx.strokeStyle="rgba(53,52,42,.26)";ctx.lineWidth=Math.max(.5,s);
    for(let k=0;k<3;k++){ctx.beginPath();ctx.ellipse(cx-5*s,cy+6*s,(15+k*7)*s,(7+k*4)*s,-.35,Math.PI*1.05,Math.PI*1.94);ctx.stroke();}
  } else if(tile.terrain==='forest'){
    ctx.strokeStyle="rgba(35,60,43,.35)";ctx.lineWidth=Math.max(.5,s);
    for(const [ox,oy] of [[-15,-7],[7,-12],[17,9],[-2,13]]){ctx.beginPath();ctx.moveTo(cx+ox*s,cy+(oy+8)*s);ctx.lineTo(cx+ox*s,cy+(oy-7)*s);ctx.moveTo(cx+(ox-5)*s,cy+oy*s);ctx.lineTo(cx+ox*s,cy+(oy-7)*s);ctx.lineTo(cx+(ox+5)*s,cy+oy*s);ctx.stroke();}
  } else if(tile.terrain==='field'){
    ctx.strokeStyle="rgba(111,91,48,.19)";ctx.lineWidth=Math.max(.5,s);
    for(let k=-2;k<=2;k++){ctx.beginPath();ctx.moveTo(cx-26*s,cy+(k*8-4)*s);ctx.lineTo(cx+26*s,cy+(k*8+5)*s);ctx.stroke();}
  } else if(tile.terrain==='ravine'){
    ctx.strokeStyle="rgba(89,61,42,.28)";ctx.lineWidth=Math.max(.7,s);
    ctx.beginPath();ctx.moveTo(cx-26*s,cy-14*s);ctx.bezierCurveTo(cx-7*s,cy-4*s,cx-12*s,cy+9*s,cx+24*s,cy+17*s);ctx.stroke();
  } else if(tile.terrain==='river'){
    ctx.strokeStyle="rgba(219,225,205,.25)";ctx.lineWidth=2*s;ctx.beginPath();ctx.moveTo(cx-26*s,cy+14*s);ctx.bezierCurveTo(cx-7*s,cy-15*s,cx+7*s,cy+18*s,cx+27*s,cy-10*s);ctx.stroke();
  }
  if(!visible){ctx.fillStyle="rgba(30,35,29,.57)";ctx.fillRect(cx-radius,cy-radius,radius*2,radius*2);}
  ctx.restore();
}

function drawConnections(kind, under, over, underWidth, overWidth) {
  const done=new Set();
  for(const tile of state.tiles.flat().filter(t=>t[kind])){
    for(const [q,r] of neighbors(tile.q,tile.r)){
      const other=tileAt(state,q,r);if(!other?.[kind])continue;
      const pair=[`${tile.q},${tile.r}`,`${q},${r}`].sort().join('|');if(done.has(pair))continue;done.add(pair);
      const a=screenCenter(tile.q,tile.r),b=screenCenter(q,r);
      ctx.strokeStyle=under;ctx.lineWidth=underWidth*camera.zoom;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      ctx.strokeStyle=over;ctx.lineWidth=overWidth*camera.zoom;ctx.setLineDash(kind==='road'?[6*camera.zoom,3*camera.zoom]:[]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);
    }
  }
}

function drawVillage(village,cx,cy,s,visible) {
  const empty=village.mode==='evacuated';
  ctx.save();ctx.globalAlpha=visible?1:.55;
  ctx.fillStyle=empty?'#6b6b5f':'#e4d7b2';ctx.strokeStyle='#3f3f35';ctx.lineWidth=1.1*s;
  for(const [ox,oy] of [[-9,2],[5,-3],[12,8]]){
    ctx.fillRect(cx+(ox-5)*s,cy+(oy-4)*s,10*s,8*s);ctx.strokeRect(cx+(ox-5)*s,cy+(oy-4)*s,10*s,8*s);
    ctx.beginPath();ctx.moveTo(cx+(ox-7)*s,cy+(oy-4)*s);ctx.lineTo(cx+ox*s,cy+(oy-10)*s);ctx.lineTo(cx+(ox+7)*s,cy+(oy-4)*s);ctx.stroke();
  }
  if(village.mode==='hidden'){
    ctx.fillStyle='#71502e';ctx.beginPath();ctx.arc(cx-14*s,cy+13*s,5*s,0,Math.PI*2);ctx.fill();
  }
  if(empty){ctx.strokeStyle='#8b2926';ctx.lineWidth=2*s;ctx.beginPath();ctx.moveTo(cx-19*s,cy-17*s);ctx.lineTo(cx+20*s,cy+17*s);ctx.moveTo(cx+20*s,cy-17*s);ctx.lineTo(cx-19*s,cy+17*s);ctx.stroke();}
  ctx.font=`700 ${Math.max(8,10*s)}px "Songti SC",serif`;ctx.textAlign='center';ctx.fillStyle=visible?'#22271f':'#4d5148';ctx.fillText(`${village.name}${empty?'·空':''}`,cx,cy+29*s);
  ctx.restore();
}

function drawRefuge(refuge,cx,cy,s) {
  ctx.save();ctx.fillStyle='rgba(35,62,45,.82)';ctx.strokeStyle='#d8c99e';ctx.lineWidth=1*s;
  ctx.beginPath();ctx.moveTo(cx,cy-14*s);ctx.lineTo(cx+17*s,cy+12*s);ctx.lineTo(cx-17*s,cy+12*s);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#eee3c4';ctx.font=`700 ${10*s}px serif`;ctx.textAlign='center';ctx.fillText('隐',cx,cy+4*s);ctx.fillStyle='#253228';ctx.font=`${9*s}px serif`;ctx.fillText(refuge.name,cx,cy+27*s);ctx.restore();
}

function drawPost(post,cx,cy,s) {
  ctx.save();
  if(post.withdrawn){ctx.globalAlpha=.5;ctx.strokeStyle='#54574e';ctx.lineWidth=2*s;ctx.beginPath();ctx.arc(cx,cy,19*s,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(cx-13*s,cy-13*s);ctx.lineTo(cx+13*s,cy+13*s);ctx.stroke();}
  else{
    const metric=postMetric(state,post);
    ctx.fillStyle=post.type==='town'?'#5d1d1b':'#792b27';ctx.strokeStyle='#e2c69d';ctx.lineWidth=1.2*s;
    const size=post.type==='town'?22:17;ctx.fillRect(cx-size*s,cy-size*s,size*2*s,size*2*s);ctx.strokeRect(cx-size*s,cy-size*s,size*2*s,size*2*s);
    ctx.fillStyle='#f1debc';ctx.font=`700 ${(post.type==='town'?13:11)*s}px serif`;ctx.textAlign='center';ctx.fillText(post.type==='town'?'城':'点',cx,cy+4*s);
    ctx.strokeStyle=metric.isolation>=3?'#d2a13d':'rgba(88,26,23,.7)';ctx.lineWidth=3*s;ctx.beginPath();ctx.arc(cx,cy,27*s,-Math.PI/2,-Math.PI/2+Math.PI*2*(post.supply/post.initialSupply));ctx.stroke();
    for(let i=0;i<metric.isolation;i++){const a=Math.PI*2*i/6-Math.PI/2;ctx.fillStyle='#d5ac4d';ctx.beginPath();ctx.arc(cx+32*s*Math.cos(a),cy+32*s*Math.sin(a),2.3*s,0,Math.PI*2);ctx.fill();}
  }
  ctx.fillStyle='#3c231e';ctx.font=`700 ${Math.max(8,10*s)}px serif`;ctx.textAlign='center';ctx.fillText(`${post.name}${post.withdrawn?'·撤':''}`,cx,cy+34*s);ctx.restore();
}

function drawTileMarks(tile,cx,cy,s) {
  if(tile.roadCut>0){ctx.save();ctx.strokeStyle='#a02e27';ctx.lineWidth=3*s;ctx.beginPath();ctx.moveTo(cx-16*s,cy-10*s);ctx.lineTo(cx+16*s,cy+10*s);ctx.moveTo(cx+16*s,cy-10*s);ctx.lineTo(cx-16*s,cy+10*s);ctx.stroke();ctx.fillStyle='#70231f';ctx.font=`700 ${9*s}px ui-monospace`;ctx.textAlign='center';ctx.fillText(`断${tile.roadCut}`,cx,cy-15*s);ctx.restore();}
  if(tile.mine>0){ctx.save();ctx.translate(cx+18*s,cy-18*s);ctx.fillStyle='#282e27';ctx.strokeStyle='#e3c871';ctx.lineWidth=1*s;ctx.beginPath();for(let i=0;i<12;i++){const a=i*Math.PI/6,r=i%2?5*s:9*s;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#f0dfad';ctx.font=`700 ${7*s}px sans-serif`;ctx.textAlign='center';ctx.fillText(tile.mine,0,2.5*s);ctx.restore();}
  if(tile.blockade){ctx.save();ctx.fillStyle='#2e4a39';ctx.strokeStyle='#ddcfaa';ctx.lineWidth=1*s;ctx.beginPath();ctx.moveTo(cx-11*s,cy+11*s);ctx.lineTo(cx,cy-12*s);ctx.lineTo(cx+11*s,cy+11*s);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#e4d7b5';ctx.font=`700 ${8*s}px serif`;ctx.textAlign='center';ctx.fillText('封',cx,cy+5*s);ctx.restore();}
}

function drawUnit(unit,cx,cy,s) {
  const type=UNIT_TYPES[unit.type],enemy=unit.side==='enemy';
  ctx.save();
  ctx.shadowColor='rgba(12,14,11,.35)';ctx.shadowBlur=5*s;ctx.shadowOffsetY=2*s;
  ctx.fillStyle=enemy?'#6c2522':unit.acted?'#4d594d':'#2e5140';ctx.strokeStyle=enemy?'#e0b08e':'#e5dab9';ctx.lineWidth=1.5*s;
  ctx.beginPath();ctx.arc(cx,cy,17*s,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowColor='transparent';
  ctx.fillStyle='#f2e3c3';ctx.font=`700 ${type.mark.length>1?9:14} ${s}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(type.mark,cx,cy+.5*s);
  ctx.strokeStyle=unit.hp<45?'#d44b40':'#d8b957';ctx.lineWidth=2.2*s;ctx.beginPath();ctx.arc(cx,cy,20*s,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.max(0,unit.hp)/100);ctx.stroke();
  if(unit.fortified){ctx.fillStyle='#e8d29a';ctx.font=`700 ${8*s}px serif`;ctx.fillText('伏',cx+18*s,cy-15*s);}
  ctx.restore();
}

function drawPath() {
  if(pending?.kind!=='move'||!pending.path)return;
  ctx.save();ctx.strokeStyle='#f0cf70';ctx.lineWidth=3*camera.zoom;ctx.setLineDash([8*camera.zoom,5*camera.zoom]);ctx.beginPath();
  pending.path.forEach(([q,r],i)=>{const p=screenCenter(q,r);if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.stroke();ctx.setLineDash([]);
  const last=pending.path.at(-1),p=screenCenter(last[0],last[1]);ctx.fillStyle='#f0cf70';ctx.beginPath();ctx.arc(p.x,p.y,5*camera.zoom,0,Math.PI*2);ctx.fill();ctx.restore();
}

function draw() {
  if(!ctx)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  ctx.fillStyle='#343a32';ctx.fillRect(0,0,width,height);
  const visible=visibleKeys(state),radius=HEX*camera.zoom;
  for(const tile of state.tiles.flat()){
    const p=screenCenter(tile.q,tile.r);if(p.x<-radius*2||p.x>width+radius*2||p.y<-radius*2||p.y>height+radius*2)continue;
    drawTerrain(tile,p.x,p.y,radius,visible.has(`${tile.q},${tile.r}`));
  }
  drawConnections('road','#4c3b2a','#b9a06b',7,2.2);
  const selected=selection?.kind==='unit'?getUnit(state,selection.id):null;
  if(selected){
    const reachable=reachableTiles(state,selected.id);ctx.save();
    for(const key of reachable.keys()){const [q,r]=key.split(',').map(Number),p=screenCenter(q,r);hexPath(p.x,p.y,radius*.82);ctx.fillStyle='rgba(215,190,102,.13)';ctx.fill();ctx.strokeStyle='rgba(235,210,121,.32)';ctx.lineWidth=1;ctx.stroke();}
    ctx.restore();
  }
  for(const tile of state.tiles.flat()){
    const p=screenCenter(tile.q,tile.r),s=camera.zoom;if(p.x<-radius*2||p.x>width+radius*2||p.y<-radius*2||p.y>height+radius*2)continue;
    const visibleTile=visible.has(`${tile.q},${tile.r}`);
    if(tile.refugeId)drawRefuge(REFUGES.find(r=>r.id===tile.refugeId),p.x,p.y,s);
    if(tile.villageId)drawVillage(getVillage(state,tile.villageId),p.x,p.y,s,visibleTile);
    if(tile.postId)drawPost(getPost(state,tile.postId),p.x,p.y,s);
    drawTileMarks(tile,p.x,p.y,s);
  }
  for(const unit of state.units){
    if(unit.side==='enemy'&&!isEnemyVisible(state,unit))continue;
    const p=screenCenter(unit.q,unit.r);let ox=0,oy=0;
    if(tileAt(state,unit.q,unit.r).postId){ox=20*camera.zoom;oy=-18*camera.zoom;}
    drawUnit(unit,p.x+ox,p.y+oy,camera.zoom);
  }
  if(selection?.kind==='unit'){
    const unit=getUnit(state,selection.id);if(unit){const p=screenCenter(unit.q,unit.r);ctx.strokeStyle='#f4d57a';ctx.lineWidth=2.5*camera.zoom;ctx.setLineDash([5*camera.zoom,4*camera.zoom]);ctx.beginPath();ctx.arc(p.x,p.y,25*camera.zoom,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
  }else if(selection?.kind==='tile'){
    const p=screenCenter(selection.q,selection.r);hexPath(p.x,p.y,radius*.91);ctx.strokeStyle='#f2d175';ctx.lineWidth=2.2*camera.zoom;ctx.stroke();
  }
  if(hoverTile){const p=screenCenter(hoverTile.q,hoverTile.r);hexPath(p.x,p.y,radius*.94);ctx.strokeStyle='rgba(246,231,186,.45)';ctx.lineWidth=1;ctx.stroke();}
  drawPath();
}

function tileFromPoint(x,y) {
  let best=null,bestD=Infinity;
  for(const tile of state.tiles.flat()){
    const p=screenCenter(tile.q,tile.r),d=Math.hypot(x-p.x,y-p.y);
    if(d<bestD){bestD=d;best=tile;}
  }
  return bestD<=HEX*camera.zoom*.97?best:null;
}

function selectedUnit() { return selection?.kind==='unit'?getUnit(state,selection.id):null; }
function villageMode(v){return v.mode==='home'?'尚未坚壁':v.mode==='hidden'?'坚壁藏粮':'空室转移';}
function terrainLabel(tile){return tile.villageId?getVillage(state,tile.villageId).name:tile.postId?getPost(state,tile.postId).name:tile.refugeId?REFUGES.find(r=>r.id===tile.refugeId).name:TERRAIN[tile.terrain].name;}

function selectUnit(unit){selection={kind:'unit',id:unit.id};pending=null;hideConfirm();beep(430,.04,.02);updateUI();}
function selectTile(tile){selection={kind:'tile',q:tile.q,r:tile.r};pending=null;hideConfirm();updateUI();}

function handleTileClick(tile) {
  const own=unitAt(state,tile.q,tile.r,'player'),enemy=unitAt(state,tile.q,tile.r,'enemy'),unit=selectedUnit();
  if(own){selectUnit(own);return;}
  if(enemy&&isEnemyVisible(state,enemy)&&unit){
    if(hexDistance(unit.q,unit.r,enemy.q,enemy.r)===1){planAttack(unit,enemy);return;}
    toast('先移动到敌军相邻格才能伏击');return;
  }
  if(unit&&!tile.postId){planMove(unit,tile);return;}
  selectTile(tile);
}

function planMove(unit,tile){
  const route=shortestPath(state,unit,tile.q,tile.r,99);
  if(!route||route.path.length<2){toast('无法从当前位置到达');return;}
  let spent=0,steps=0;
  for(let i=1;i<route.path.length;i++){const [q,r]=route.path[i],cost=TERRAIN[tileAt(state,q,r).terrain].move;if(spent+cost>unit.mp)break;spent+=cost;steps=i;}
  if(!steps){toast('剩余移动力不足');return;}
  const stop=route.path[steps];pending={kind:'move',unitId:unit.id,q:tile.q,r:tile.r,path:route.path};
  showConfirm(`<strong>${unit.name}</strong>向${terrainLabel(tile)}行军。${steps<route.path.length-1?`本半月先抵达${terrainLabel(tileAt(state,stop[0],stop[1]))}，保留远程目的地。`:'可在本半月抵达。'}`);draw();
}

function planAttack(attacker,defender){
  const preview=attackPreview(state,attacker.id,defender.id);if(!preview){toast('无法判断战斗');return;}
  pending={kind:'attack',attackerId:attacker.id,defenderId:defender.id};
  showConfirm(`<strong>伏击${defender.name}</strong>：预计敌-${preview.damage}，我-${preview.retaliation}。战斗会显著增加暴露。`);draw();
}

function actionDescription(action,unit){
  const tile=tileAt(state,unit.q,unit.r),village=tile.villageId?getVillage(state,tile.villageId):null,post=state.posts.find(p=>!p.withdrawn&&hexDistance(unit.q,unit.r,p.q,p.r)===1);
  const map={
    harden:`在${village?.name||'村庄'}封井、藏粮、埋好农具。消耗2组织。`,
    evacuate:`将${village?.name||'村庄'}群众转移进山。空村不再生产，但敌人也征不到粮。`,
    return:`组织${village?.name||'村庄'}群众回迁复耕。仅在附近安全时可行。`,
    blockade:`在${post?.name||'据点'}外围建立封锁哨。消耗2组织、1粮。`,
    mine:`把此地布成雷区。敌巡逻队和补给队进入时自动触发。`,
    cut:`破坏脚下公路，阻断补给数个半月。消耗1材料、1组织。`,
    intel:`启用消息树和交通线，未来两回合看清所有敌军。`,
    propaganda:`向${post?.name||'据点'}送信喊话、争取伪军，直接削弱守备意志。`,
    raid:`趁${post?.name||'据点'}补给匮乏实施近袭；完整据点不能强攻。`,
    fortify:`就地隐蔽休整，恢复6体力并降低3暴露。`,
  };
  return map[action]||'执行行动。';
}

function planAction(action){
  const unit=selectedUnit();if(!unit)return;
  pending={kind:'action',action,unitId:unit.id};showConfirm(actionDescription(action,unit));
}

function showConfirm(html){$("confirmText").innerHTML=html;$("confirmBar").classList.remove('hidden');}
function hideConfirm(){pending=null;$("confirmBar").classList.add('hidden');draw();}

function executePending(){
  if(!pending)return;
  let result={ok:false,reason:'无效命令'},unit;
  if(pending.kind==='move')result=moveUnit(state,pending.unitId,pending.q,pending.r);
  else if(pending.kind==='attack')result=attackUnit(state,pending.attackerId,pending.defenderId);
  else if(pending.kind==='action'){
    unit=getUnit(state,pending.unitId);const tile=unit&&tileAt(state,unit.q,unit.r),village=tile?.villageId&&getVillage(state,tile.villageId),post=unit&&state.posts.find(p=>!p.withdrawn&&hexDistance(unit.q,unit.r,p.q,p.r)===1);
    const calls={
      harden:()=>hardenVillage(state,village?.id,unit.id),evacuate:()=>evacuateVillage(state,village?.id,unit.id),return:()=>returnVillage(state,village?.id,unit.id),
      blockade:()=>establishBlockade(state,unit.id,post?.id),mine:()=>layMine(state,unit.id),cut:()=>cutRoad(state,unit.id),intel:()=>gatherIntel(state,unit.id),
      propaganda:()=>propaganda(state,unit.id,post?.id),raid:()=>raidPost(state,unit.id,post?.id),fortify:()=>fortifyUnit(state,unit.id),
    };
    result=calls[pending.action]?.()||result;
  }
  pending=null;$("confirmBar").classList.add('hidden');
  if(!result.ok){toast(result.reason||'行动失败');beep(145,.1,.025,'sawtooth');}
  else{beep(560,.06,.025);saveGame();if(selection?.kind==='unit'&&!getUnit(state,selection.id))selection=null;updateUI();}
}

function resourceHtml(name,value,delta=''){return `<div class="resource"><span>${name}</span><b>${Math.round(value)}</b>${delta?`<small class="${delta<0?'neg':''}">${delta>0?'+':''}${delta}</small>`:''}</div>`;}

function updateUI(){
  const chapter=CHAPTERS[chapterIndex(state.turn)],siege=computeSiege(state);
  $("dateBox").innerHTML=`<strong>${dateLabel(state.turn)}</strong><small>第 ${state.turn} / ${CFG.totalTurns} 半月</small>`;
  $("resourceBar").innerHTML=resourceHtml('粮食',state.grain)+resourceHtml('组织',state.org)+resourceHtml('情报',state.intel)+resourceHtml('材料',state.material)+resourceHtml('山中人口',state.refugePop);
  $("willValue").textContent=Math.round(state.will);$("willFill").style.width=`${state.will}%`;
  $("occupationValue").textContent=siege.occupation;$("occupationFill").style.width=`${siege.occupation}%`;
  $("chapterTitle").textContent=chapter.title;$("chapterStory").textContent=chapter.story;
  $("objectives").innerHTML=objectiveStatus(state,chapter).map(o=>`<div class="objective ${o.done?'done':''}"><i>✓</i><span>${o.label}</span><em>${Math.min(o.progress,o.target)}/${o.target}</em></div>`).join('');
  $("doctrineStamp").textContent=`当前方略 · ${DOCTRINES[state.doctrine].name}${state.doctrineCooldown?`（${state.doctrineCooldown}回合锁定）`:''}`;
  $("enemyIntent").innerHTML=`<strong>${state.enemyIntent.name}</strong> · ${state.enemyIntent.detail} <small>预计持续${state.enemyIntent.turns}回合｜短期暴露 ${state.exposure}</small>`;
  $("siegeScore").textContent=`${siege.score}%`;
  $("siegeSteps").innerHTML=`<div class="siege-step ${siege.denial>=50?'hot':''}"><span>乡野拒止</span><b>${siege.denial}%</b></div><div class="siege-step ${siege.roads>=3?'hot':''}"><span>险路</span><b>${siege.roads}处</b></div><div class="siege-step ${siege.totalIsolation>=8?'hot':''}"><span>困点</span><b>${siege.totalIsolation}级</b></div><div class="siege-step ${siege.withdrawn>=2?'hot':''}"><span>撤据</span><b>${siege.withdrawn}/4</b></div>`;
  $("logEntries").innerHTML=state.logs.slice(0,4).map(log=>`<div class="log-line"><time>${log.turn}</time>${log.text}</div>`).join('');
  $("endTurnButton").disabled=state.over;
  renderSelectionCard();renderActionBar();renderInspector();draw();
}

function renderSelectionCard(){
  const unit=selectedUnit();
  if(unit){const type=UNIT_TYPES[unit.type],tile=tileAt(state,unit.q,unit.r);$("selectionCard").innerHTML=`<span class="selection-mark">${type.mark}</span><div><strong>${unit.name}</strong><small>${terrainLabel(tile)} · 体力${Math.max(0,unit.hp)} · 移动力${unit.mp} ${unit.acted?'· 已行动':''}</small></div>`;}
  else $("selectionCard").innerHTML=`<span class="selection-mark">令</span><div><strong>选择一支队伍</strong><small>点击棋子，再点击目标六边格</small></div>`;
}

function actionButton(action,mark,label,cost,disabled=false,title=''){return `<button data-action="${action}" ${disabled?'disabled':''} title="${title}"><span>${mark}</span>${label}<small>${cost}</small></button>`;}

function renderActionBar(){
  const unit=selectedUnit();
  if(!unit){$("actionBar").innerHTML=actionButton('locateTown','城','定位县城','核心据点')+actionButton('locateGate','路','定位二沁口','补给入口')+actionButton('deselect','图','查看全图','双击地图复位');return;}
  const tile=tileAt(state,unit.q,unit.r),village=tile.villageId?getVillage(state,tile.villageId):null,post=state.posts.find(p=>!p.withdrawn&&hexDistance(unit.q,unit.r,p.q,p.r)===1),disabled=unit.acted;
  const buttons=[];
  if(unit.route)buttons.push(actionButton('continue','行','继续行军',`${unit.route.q},${unit.route.r}`,unit.mp<=0));
  if(village&&['work','courier'].includes(unit.type)){
    if(village.mode==='home')buttons.push(actionButton('harden','藏','坚壁藏粮','2组织',disabled));
    if(['home','hidden'].includes(village.mode))buttons.push(actionButton('evacuate','空','空室转移',`${state.doctrine==='clear'?2:3}组织·2粮`,disabled));
    if(village.mode==='evacuated')buttons.push(actionButton('return','归','组织回迁','3粮',disabled));
  }
  if(post&&['militia','work'].includes(unit.type)&&!tile.blockade)buttons.push(actionButton('blockade','封','建立封锁','2组织·1粮',disabled));
  if(post&&['work','courier'].includes(unit.type))buttons.push(actionButton('propaganda','瓦','政治瓦解','2情报·1组织',disabled));
  if(post&&unit.type==='militia')buttons.push(actionButton('raid','袭','袭扰据点','需先困弱',disabled,'完整据点不可强攻'));
  if(unit.type==='mine'&&(tile.road||post))buttons.push(actionButton('mine','雷','布设雷区',`${state.doctrine==='mines'?1:2}材料`,disabled));
  if(['mine','work'].includes(unit.type)&&tile.road)buttons.push(actionButton('cut','断','爆破断路','1材料·1组织',disabled));
  if(unit.type==='courier')buttons.push(actionButton('intel','信','侦察敌情','全图2回合',disabled));
  buttons.push(actionButton('fortify','伏','隐蔽休整','体力+6',disabled));
  $("actionBar").innerHTML=buttons.join('');
}

function renderInspector(){
  const panel=$("inspector"),body=$("inspectorBody"),unit=selectedUnit();
  if(!selection){panel.classList.add('closed');return;}
  panel.classList.remove('closed');
  if(unit){
    const type=UNIT_TYPES[unit.type],tile=tileAt(state,unit.q,unit.r);
    body.innerHTML=`<div class="inspector-kicker">我方行动单位</div><h2 class="inspector-title">${unit.name}</h2><p class="inspector-subtitle">${type.name} · ${terrainLabel(tile)}</p><p class="inspector-copy">${type.role}${unit.route?`<br>远程目的地：${terrainLabel(tileAt(state,unit.route.q,unit.route.r))}`:''}</p><div class="stat-grid"><div><span>体力</span><b>${Math.max(0,unit.hp)}/100</b></div><div><span>移动</span><b>${unit.mp}/${type.mp}</b></div><div><span>经验</span><b>${unit.xp}</b></div><div><span>暴露影响</span><b>${unit.type==='militia'?'较高':'较低'}</b></div></div><div class="tag-row"><span class="tag">${TERRAIN[tile.terrain].name}</span>${tile.road?'<span class="tag red">二沁公路</span>':''}${tile.mine?`<span class="tag">雷区×${tile.mine}</span>`:''}</div>`;
    return;
  }
  const tile=tileAt(state,selection.q,selection.r);
  if(tile.postId){
    const post=getPost(state,tile.postId),m=postMetric(state,post),vulnerable=post.supply<=35||m.isolation>=3;
    body.innerHTML=`<div class="inspector-kicker">${post.withdrawn?'已撤离':'敌军据点'}</div><h2 class="inspector-title">${post.name}</h2><p class="inspector-subtitle">${post.type==='town'?'县城核心据点':'外围支撑点'} · 围困强度 ${m.isolation}/6</p><p class="inspector-copy">${post.withdrawn?'守军已经撤出，这条占领链被永久截断。':vulnerable?'补给或外围控制已经松动，民兵可以考虑近袭，但政治瓦解仍更稳妥。':'火力与补给尚完整。此时强攻正中敌军下怀，应先让路断、村空、哨密。'}</p><div class="stat-grid"><div><span>军需</span><b>${post.supply}/${post.initialSupply}</b></div><div><span>守备意志</span><b>${post.resolve}/${post.initialResolve}</b></div><div><span>守备兵力</span><b>${post.garrison}</b></div><div><span>封锁哨</span><b>${m.blockades}</b></div></div><span>军需</span><div class="mini-meter red"><b style="width:${post.supply/post.initialSupply*100}%"></b></div><span>意志</span><div class="mini-meter"><b style="width:${post.resolve/post.initialResolve*100}%"></b></div><div class="tag-row"><span class="tag ${m.roadConnected?'red':''}">${m.roadConnected?'公路仍通':'公路已断'}</span><span class="tag">周边拒止 ${m.nearDenial}</span></div>`;
  } else if(tile.villageId){
    const v=getVillage(state,tile.villageId),refuge=REFUGES.find(r=>r.id===v.refugeId);
    body.innerHTML=`<div class="inspector-kicker">群众与乡野</div><h2 class="inspector-title">${v.name}</h2><p class="inspector-subtitle">${villageMode(v)} · ${v.pop}户</p><p class="inspector-copy">${v.mode==='home'?'仍可稳定生产，但会成为敌军征粮和威逼的目标。工作队到达后可先藏粮再转移。':v.mode==='hidden'?'粮食、农具和水源已经隐蔽；生产降低，敌人搜查也未必有所得。':'群众已进入'+refuge.name+'。这里不再产粮，却会让敌军的搜查和占领变成纯消耗。'}</p><div class="stat-grid"><div><span>群众户数</span><b>${v.pop}</b></div><div><span>藏粮</span><b>${v.cache}</b></div><div><span>组织认同</span><b>${v.loyalty}</b></div><div><span>安置方向</span><b>${refuge.name.slice(0,2)}</b></div></div>`;
  } else if(tile.refugeId){
    const refuge=REFUGES.find(r=>r.id===tile.refugeId),pop=state.villages.filter(v=>v.mode==='evacuated'&&v.refugeId===refuge.id).reduce((s,v)=>s+v.pop,0);
    body.innerHTML=`<div class="inspector-kicker">山中安置点</div><h2 class="inspector-title">${refuge.name}</h2><p class="inspector-copy">空室清野不是让群众凭空消失。转移人口需要持续粮食，安置状况会直接影响全县民心。</p><div class="stat-grid"><div><span>安置户数</span><b>${pop}</b></div><div><span>全县状况</span><b>${state.refugeCondition}</b></div></div>`;
  } else {
    body.innerHTML=`<div class="inspector-kicker">地图地块</div><h2 class="inspector-title">${TERRAIN[tile.terrain].name}</h2><p class="inspector-subtitle">坐标 ${tile.q}, ${tile.r}</p><p class="inspector-copy">移动消耗 ${TERRAIN[tile.terrain].move}，防御修正 ${TERRAIN[tile.terrain].defense}。${tile.road?'这里属于敌军补给公路，可由爆破组或工作队断路。':''}</p><div class="tag-row">${tile.road?'<span class="tag red">公路</span>':''}${tile.roadCut?`<span class="tag red">断路${tile.roadCut}回合</span>`:''}${tile.mine?`<span class="tag">雷区×${tile.mine}</span>`:''}${tile.blockade?'<span class="tag">封锁哨</span>':''}</div>`;
  }
}

function renderLogs(){updateUI();}
function actionableUnits(){return state.units.filter(u=>u.side==='player'&&!u.acted&&(u.mp>0||u.route));}
function nextUnit(){const list=actionableUnits();if(!list.length){toast('所有队伍都已行动，可以结束半月');return;}const current=selectedUnit(),i=current?list.findIndex(u=>u.id===current.id):-1;selectUnit(list[(i+1+list.length)%list.length]);}

function performEndTurn(){
  if(state.over){showEnding();return;}
  const idle=state.units.filter(u=>u.side==='player'&&!u.acted).length;
  if(idle>0&&!pending){pending={kind:'end'};showConfirm(`仍有 <strong>${idle}</strong> 支队伍没有执行行动。仍然结束这个半月？`);return;}
  doEndTurn();
}

function doEndTurn(){
  pending=null;$("confirmBar").classList.add('hidden');const before=state.stats.withdrawn;endTurn(state);selection=null;saveGame();
  beep(state.stats.withdrawn>before?680:250,.09,.03,state.stats.withdrawn>before?'triangle':'sine');updateUI();if(state.over)showEnding();
}

function toast(text){const el=$("toast");el.textContent=text;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');}
function openModal(html){$("modal").innerHTML=html;$("modalWrap").classList.remove('hidden');}
function closeModal(){if(!state) return;$("modalWrap").classList.add('hidden');}

function introHtml(){
  const hasSave=!!localStorage.getItem(SAVE_KEY);
  return `<div class="modal-kicker">一个不以攻城为目标的围城游戏</div><h2>沁源：反向围城</h2><p class="lead">敌军占着县城，你控制的却是县城之外的一切。不要抢着替守军结束战斗；让每一次出门、每一袋补给、每一天占领都变得更昂贵。</p><div class="verb-grid"><div class="verb"><b>搬空</b><span>转移受威胁村庄，保住群众，也不给敌军留下统治对象。</span></div><div class="verb"><b>藏尽</b><span>先坚壁藏粮，失败的搜查会反过来消磨守军。</span></div><div class="verb"><b>断路</b><span>盯住真正流动的补给队，地雷和断路会产生地图后果。</span></div><div class="verb"><b>磨退</b><span>封锁与政治攻势让据点撤离；完整据点拒绝无意义强攻。</span></div></div><p class="historical-note">创作原型：1942年末至1945年春的沁源围困战。页面采用史实机制与代表性地名，但地图经过策略游戏化重构，并非地理复刻。</p><div class="modal-actions"><button class="primary" data-modal-action="new">开始围困</button>${hasSave?'<button data-modal-action="continue">继续存档</button>':''}<button class="ghost" data-modal-action="rules">先看战法</button></div>`;
}

function showIntro(){openModal(introHtml());}

function showDoctrines(){
  openModal(`<div class="modal-kicker">一次只能执行一项 · 调整消耗5组织并锁定4回合</div><h2>全县围困方略</h2><p>方略改变同一张地图上的成本结构，不是永久叠加的战斗加成。请根据眼前瓶颈切换。</p><div class="doctrine-grid">${Object.entries(DOCTRINES).map(([key,d])=>`<div class="doctrine-card ${state.doctrine===key?'active':''}"><h3>${d.name}</h3><small>${d.motto}</small><p><b>利：</b>${d.benefit}<br><b>代价：</b>${d.cost}</p><button data-doctrine="${key}" ${state.doctrine===key||state.doctrineCooldown>0?'disabled':''}>${state.doctrine===key?'正在执行':'转入此方略'}</button></div>`).join('')}</div><div class="modal-actions"><button class="ghost" data-modal-action="close">返回地图</button></div>`);
}

function showLedger(){
  const siege=computeSiege(state);
  openModal(`<div class="modal-kicker">胜负不看占了多少格，而看占领还能否续命</div><h2>围困账</h2><p>每个据点同时计算军需、守备意志、守备兵力和外围孤立。封锁越严，半月消耗越高；但敌军补给抵达会真实地把成果补回来。</p><div class="ledger-grid">${siege.metrics.map(m=>`<div class="ledger-card"><h3>${m.post.name}${m.post.withdrawn?' · 已撤':''}</h3><p>军需 <b>${m.post.supply}</b> / ${m.post.initialSupply}<br>意志 <b>${m.post.resolve}</b> / ${m.post.initialResolve}<br>围困 <b>${m.isolation}</b> / 6<br>${m.roadConnected?'公路仍通':'补给线已断'}</p></div>`).join('')}</div><p>全县占领续命：<b>${siege.occupation}%</b>　乡野拒止：<b>${siege.denial}%</b>　已撤据点：<b>${siege.withdrawn}/4</b></p><div class="modal-actions"><button class="ghost" data-modal-action="close">返回地图</button></div>`);
}

function showRules(){
  openModal(`<div class="modal-kicker">操作对标文明式回合棋盘</div><h2>战法与操作</h2><div class="help-list"><div><b>选择与行军</b><span>点击我方圆形棋子，再点击目标六边格。远距离目标会保留为后续行军目的地。</span></div><div><b>地图镜头</b><span>拖动平移，滚轮缩放；双击地图回到县城。移动端可拖动与双指缩放。</span></div><div><b>坚壁再转移</b><span>工作队或交通员进入村庄后行动。先藏粮再转移，空村搜查对敌军打击更大。</span></div><div><b>断二沁大道</b><span>补给队沿可见公路真实移动。断路能阻滞，雷区会在敌军进入时自动引爆。</span></div><div><b>围而不打</b><span>封锁哨、断路和周边空村共同提高据点孤立。军需充足且孤立不足3级时，规则拒绝强攻。</span></div><div><b>暴露不是敌军开关</b><span>低暴露只降低搜山命中率；敌军仍会补给、征粮、清障并根据你的打法改变行为。</span></div><div><b>山中也是战场</b><span>转移人口每月消耗粮食。若只顾“空室”而不管生产，安置恶化会击穿民心。</span></div><div><b>快捷键</b><span>空格切换队伍，Enter结束半月，D方略，L围困账，H战法，Esc取消。</span></div></div><div class="modal-actions"><button class="primary" data-modal-action="close">明白，返回战局</button></div>`);
}

function showEnding(){
  const r=state.result,s=state.stats,siege=computeSiege(state);
  openModal(`<div class="modal-kicker">${r.kind==='victory'?'围困完成':'战役复盘'}</div><h2>${r.title}</h2><p class="lead">${r.detail}</p><div class="ledger-grid"><div class="ledger-card"><h3>${r.turn}个半月</h3><p>坚持时间</p></div><div class="ledger-card"><h3>${s.convoysStopped}</h3><p>补给队被截停</p></div><div class="ledger-card"><h3>${s.emptySearches}</h3><p>敌军空手搜查</p></div><div class="ledger-card"><h3>${siege.withdrawn}/4</h3><p>据点被迫撤离</p></div></div><div class="modal-actions"><button class="primary" data-modal-action="new">重新部署</button><button class="ghost" data-modal-action="ledger">查看围困账</button></div>`);
}

function saveGame(){if(state&&!state.over)localStorage.setItem(SAVE_KEY,serializeGame(state));else if(state?.over)localStorage.removeItem(SAVE_KEY);}
function seedFromUrl(){const p=new URLSearchParams(location.search),value=Number(p.get('seed'));return Number.isFinite(value)&&value>0?value:194211;}
function newGame(seed=seedFromUrl()){state=createGame(seed);selection=null;pending=null;centerCampaignCamera(Math.min(1,innerWidth<600?.72:.95));saveGame();closeModal();updateUI();toast('先让群众工作队进入村庄：藏粮，然后转移。');}
function continueGame(){try{state=deserializeGame(localStorage.getItem(SAVE_KEY));selection=null;pending=null;centerCampaignCamera(Math.min(1,innerWidth<600?.72:.95));closeModal();updateUI();toast('存档已恢复');}catch(error){localStorage.removeItem(SAVE_KEY);toast(error.message);newGame();}}

function handleActionButton(action){
  if(['harden','evacuate','return','blockade','mine','cut','intel','propaganda','raid','fortify'].includes(action)){planAction(action);return;}
  if(action==='continue'){const u=selectedUnit();if(u?.route)planMove(u,tileAt(state,u.route.q,u.route.r));return;}
  if(action==='locateTown'){centerCamera(5,4,.95);selectTile(tileAt(state,5,4));return;}
  if(action==='locateGate'){centerCamera(CFG.gate.q,CFG.gate.r,.95);selectTile(tileAt(state,CFG.gate.q,CFG.gate.r));return;}
  if(action==='deselect'){selection=null;centerCampaignCamera(innerWidth<600?.72:.9);updateUI();}
}

$("actionBar").addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button&&!button.disabled)handleActionButton(button.dataset.action);});
$("confirmYes").addEventListener('click',()=>{if(pending?.kind==='end')doEndTurn();else executePending();});
$("confirmNo").addEventListener('click',hideConfirm);
$("nextButton").addEventListener('click',nextUnit);
$("endTurnButton").addEventListener('click',performEndTurn);
$("closeInspector").addEventListener('click',()=>{selection=null;updateUI();});
$("doctrineBtn").addEventListener('click',showDoctrines);
$("ledgerBtn").addEventListener('click',showLedger);
$("helpBtn").addEventListener('click',showRules);
$("soundBtn").addEventListener('click',()=>{soundOn=!soundOn;$("soundBtn").setAttribute('aria-pressed',String(soundOn));$("soundBtn").textContent=soundOn?'声':'静';if(soundOn)beep();});

$("modal").addEventListener('click',event=>{
  const doctrine=event.target.closest('[data-doctrine]');
  if(doctrine&&!doctrine.disabled){const result=changeDoctrine(state,doctrine.dataset.doctrine);if(result.ok){saveGame();beep(520);showDoctrines();updateUI();}else toast(result.reason);return;}
  const button=event.target.closest('[data-modal-action]');if(!button)return;
  const action=button.dataset.modalAction;
  if(action==='new')newGame();else if(action==='continue')continueGame();else if(action==='rules')showRules();else if(action==='ledger')showLedger();else if(action==='close')closeModal();
});

canvas.addEventListener('pointerdown',event=>{
  ensureAudio();canvas.setPointerCapture(event.pointerId);activePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(activePointers.size===1){pointerStart={x:event.clientX,y:event.clientY,cx:camera.x,cy:camera.y};dragged=false;}
  if(activePointers.size===2){const pts=[...activePointers.values()];pinch={distance:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),zoom:camera.zoom};}
});

canvas.addEventListener('pointermove',event=>{
  if(activePointers.has(event.pointerId))activePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(activePointers.size===2&&pinch){const pts=[...activePointers.values()],distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);camera.zoom=Math.max(.55,Math.min(1.7,pinch.zoom*distance/pinch.distance));dragged=true;draw();return;}
  if(pointerStart&&activePointers.size===1){const dx=event.clientX-pointerStart.x,dy=event.clientY-pointerStart.y;if(Math.hypot(dx,dy)>5){dragged=true;canvas.classList.add('dragging');camera.x=pointerStart.cx-dx/camera.zoom;camera.y=pointerStart.cy-dy/camera.zoom;draw();}return;}
  hoverTile=tileFromPoint(event.clientX,event.clientY);draw();
});

function endPointer(event){
  activePointers.delete(event.pointerId);canvas.classList.remove('dragging');
  if(pointerStart&&!dragged&&event.type==='pointerup'){const tile=tileFromPoint(event.clientX,event.clientY);if(tile)handleTileClick(tile);}
  if(activePointers.size===0){pointerStart=null;pinch=null;dragged=false;}
}
canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);
canvas.addEventListener('pointerleave',()=>{hoverTile=null;if(!activePointers.size)draw();});
canvas.addEventListener('dblclick',()=>centerCampaignCamera(innerWidth<600?.72:.95));
canvas.addEventListener('wheel',event=>{
  event.preventDefault();const before=screenToWorld(event.clientX,event.clientY),old=camera.zoom;camera.zoom=Math.max(.55,Math.min(1.75,camera.zoom*Math.exp(-event.deltaY*.001)));const after=screenToWorld(event.clientX,event.clientY);camera.x+=before.x-after.x;camera.y+=before.y-after.y;if(old!==camera.zoom)draw();
},{passive:false});

window.addEventListener('keydown',event=>{
  if(event.key==='Escape'){if(!$("modalWrap").classList.contains('hidden'))closeModal();else if(pending)hideConfirm();else{selection=null;updateUI();}return;}
  if(!$("modalWrap").classList.contains('hidden'))return;
  if(event.code==='Space'){event.preventDefault();nextUnit();}
  else if(event.key==='Enter')performEndTurn();
  else if(event.key.toLowerCase()==='d')showDoctrines();
  else if(event.key.toLowerCase()==='l')showLedger();
  else if(event.key.toLowerCase()==='h')showRules();
});

window.addEventListener('resize',resize);

window.__QINYUAN_QA__ = {
  getState:()=>state,
  newGame:(seed=194211)=>{newGame(seed);return state;},
  selectUnit:id=>{const u=getUnit(state,id);if(u)selectUnit(u);return !!u;},
  endTurn:()=>{doEndTurn();return state;},
  selfTest:()=>({ready:document.documentElement.dataset.appReady==='true',errors:invariantChecks(state),canvas:[canvas.width,canvas.height],buttons:document.querySelectorAll('button').length}),
};

document.documentElement.dataset.appReady='true';
resize();updateUI();showIntro();
