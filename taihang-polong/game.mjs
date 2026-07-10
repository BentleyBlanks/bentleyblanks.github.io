import {
  CFG, TERRAIN, UNIT_TYPES, BUILDINGS, TRAITS, TECHS, POLICIES, OPERATIONS, CHAPTERS,
  createGame, serializeGame, deserializeGame, invariantChecks, dateLabel, chapterIndex, keyOf, hexDistance,
  tileAt, allVillages, playerVillages, enemyStructures, visibleKeys, unitAt, getUnit, suppressionAt, computeNetwork,
  villageYield, reachableTiles, shortestPath, moveUnit, combatPreview, structurePreview, attackUnit, attackStructure,
  stationWorkTeam, cancelRoute, startBuild, cancelBuild, recruitUnit, buyTech, changePolicy, sabotageRail, attemptDefection, reinforceUnit, fortifyUnit,
  countBrokenRails, goalProgress, objectiveStatus, endTurn, unitStrength,
} from "./rules.mjs";

const $ = id => document.getElementById(id);
const canvas = $("board"), ctx = canvas.getContext("2d");
const SAVE_KEY = "taihang_polong_v1";
const SQ3 = Math.sqrt(3);
let state = null;
let selection = null; // {kind:'unit',id} | {kind:'tile',q,r}
let pending = null;
let reach = new Map();
let camera = { x: 0, y: 0, zoom: 1 };
let dragging = null;
let soundOn = true;
let audio = null;
let lastChapter = 0;

function ensureAudio() {
  if (!soundOn) return null;
  if (!audio) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audio = new AC(); }
  if (audio?.state === "suspended") audio.resume();
  return audio;
}
function beep(freq = 320, duration = .055, volume = .025, type = "sine") {
  const ac = ensureAudio(); if (!ac) return;
  const osc = ac.createOscillator(), gain = ac.createGain();
  osc.type = type; osc.frequency.value = freq; gain.gain.setValueAtTime(volume, ac.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + duration);
  osc.connect(gain).connect(ac.destination); osc.start(); osc.stop(ac.currentTime + duration);
}

function resize() {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1), w = innerWidth, h = innerHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.width = `${w}px`; canvas.style.height = `${h}px`; }
  draw();
}
function worldCenter(q, r) {
  const s = CFG.hexSize;
  return [1.5 * s * q + s * 1.3, SQ3 * s * (r + .5 * (q & 1)) + s * 1.3];
}
function screenCenter(q, r) {
  const [x, y] = worldCenter(q, r); return [x * camera.zoom - camera.x, y * camera.zoom - camera.y];
}
function centerCamera(q, r) {
  const [x, y] = worldCenter(q, r); camera.x = x * camera.zoom - innerWidth * .5; camera.y = y * camera.zoom - innerHeight * .52; draw();
}
function hexPath(cx, cy, radius) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i, x = cx + radius * Math.cos(a), y = cy + radius * Math.sin(a); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath();
}
function roundedRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawTerrainIcon(t, cx, cy, s) {
  ctx.save(); ctx.translate(cx, cy + s * .08); ctx.globalAlpha = .78;
  if (t === "mountain") {
    ctx.fillStyle = "#aaa597"; ctx.beginPath(); ctx.moveTo(-s * .45, s * .3); ctx.lineTo(-s * .08, -s * .45); ctx.lineTo(s * .18, s * .3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e3e0d6"; ctx.beginPath(); ctx.moveTo(-s * .2, -s * .18); ctx.lineTo(-s * .08, -s * .45); ctx.lineTo(s * .02, -s * .16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#817c72"; ctx.beginPath(); ctx.moveTo(-s * .05, s * .3); ctx.lineTo(s * .28, -s * .27); ctx.lineTo(s * .5, s * .3); ctx.closePath(); ctx.fill();
  } else if (t === "forest") {
    ctx.fillStyle = "#8dbb63";
    for (const [x, y, z] of [[-.25,.08,.8],[.14,-.04,1],[.34,.16,.65]]) { ctx.beginPath(); ctx.moveTo(s * (x - .18 * z), s * (y + .25 * z)); ctx.lineTo(s * x, s * (y - .35 * z)); ctx.lineTo(s * (x + .18 * z), s * (y + .25 * z)); ctx.closePath(); ctx.fill(); }
  } else if (t === "hills") {
    ctx.fillStyle = "#c29d66"; ctx.beginPath(); ctx.moveTo(-s * .45, s * .25); ctx.quadraticCurveTo(-s * .22, -s * .25, s * .02, s * .25); ctx.quadraticCurveTo(s * .25, -.1 * s, s * .48, s * .25); ctx.closePath(); ctx.fill();
  } else {
    ctx.strokeStyle = "rgba(235,216,130,.62)"; ctx.lineWidth = 2; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-s * .34, i * s * .14); ctx.quadraticCurveTo(0, i * s * .14 - 4, s * .34, i * s * .14); ctx.stroke(); }
  }
  ctx.restore();
}
function drawRail(q, r, cx, cy, s, broken) {
  const railNeighbors = [];
  for (const [nq, nr] of [[q-1,r-1],[q-1,r],[q,r-1],[q,r+1],[q+1,r-1],[q+1,r],[q-1,r+1],[q+1,r+1]]) {
    const nt = tileAt(state, nq, nr); if (nt?.rail || nt?.structure?.kind === "town") railNeighbors.push([nq, nr]);
  }
  ctx.save(); ctx.strokeStyle = broken ? "#a34f3c" : "#bbb39b"; ctx.lineWidth = 4.5 * camera.zoom; ctx.setLineDash(broken ? [5 * camera.zoom, 5 * camera.zoom] : []);
  for (const [nq, nr] of railNeighbors) { const [nx, ny] = screenCenter(nq, nr); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo((cx + nx) / 2, (cy + ny) / 2); ctx.stroke(); }
  ctx.strokeStyle = broken ? "#3f211b" : "#403b30"; ctx.lineWidth = 1.5 * camera.zoom;
  for (const [nq, nr] of railNeighbors) { const [nx, ny] = screenCenter(nq, nr); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo((cx + nx) / 2, (cy + ny) / 2); ctx.stroke(); }
  ctx.restore();
}
function drawVillage(x, cx, cy, s, visible) {
  const v = x.village, own = v.owner === "player";
  ctx.save();
  ctx.fillStyle = own ? "#b9844b" : "#827b65"; ctx.strokeStyle = own ? "#e1b475" : "#aaa28b"; ctx.lineWidth = 1.2 * camera.zoom;
  for (const [dx, dy, z] of [[-.25,.05,.8],[.18,.14,.7],[.02,-.18,.65]]) {
    const w = s * .38 * z, h = s * .28 * z, x0 = cx + s * dx - w / 2, y0 = cy + s * dy - h / 2;
    ctx.fillRect(x0, y0, w, h); ctx.strokeRect(x0, y0, w, h); ctx.fillStyle = own ? "#8e392c" : "#5d5547";
    ctx.beginPath(); ctx.moveTo(x0 - 2, y0); ctx.lineTo(x0 + w / 2, y0 - h * .65); ctx.lineTo(x0 + w + 2, y0); ctx.closePath(); ctx.fill(); ctx.fillStyle = own ? "#b9844b" : "#827b65";
  }
  if (own) { ctx.strokeStyle = "#e9d9a4"; ctx.lineWidth = 2 * camera.zoom; ctx.beginPath(); ctx.moveTo(cx + s * .36, cy - s * .3); ctx.lineTo(cx + s * .36, cy - s * .84); ctx.stroke(); ctx.fillStyle = "#c54337"; ctx.beginPath(); ctx.moveTo(cx + s * .36, cy - s * .82); ctx.lineTo(cx + s * .72, cy - s * .68); ctx.lineTo(cx + s * .36, cy - s * .53); ctx.closePath(); ctx.fill(); }
  if (visible || own) {
    const label = v.name.replace("（总部）", ""), w = Math.max(48, ctx.measureText(label).width + 18);
    roundedRect(cx - w / 2, cy + s * .58, w, 18, 5); ctx.fillStyle = own ? "rgba(92,42,31,.95)" : "rgba(45,42,34,.93)"; ctx.fill(); ctx.strokeStyle = own ? "#d17856" : "#77705d"; ctx.stroke();
    ctx.fillStyle = "#f2e7c8"; ctx.font = `${Math.max(9, 10 * camera.zoom)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, cx, cy + s * .58 + 9);
  }
  if (own) {
    const bw = s * .72; ctx.fillStyle = "#2a2518"; ctx.fillRect(cx - bw / 2, cy + s * .45, bw, 4 * camera.zoom); ctx.fillStyle = v.connected ? "#68a9ad" : "#b35d45"; ctx.fillRect(cx - bw / 2, cy + s * .45, bw * v.support / 100, 4 * camera.zoom);
  }
  ctx.restore();
}
function drawStructure(sobj, cx, cy, s) {
  ctx.save();
  if (sobj.kind === "town") {
    ctx.fillStyle = "#6e5e50"; ctx.fillRect(cx - s * .5, cy - s * .28, s, s * .58); ctx.fillStyle = "#8e7a62";
    for (const dx of [-.42,-.14,.14,.42]) ctx.fillRect(cx + s * dx - s * .09, cy - s * .45, s * .18, s * .25);
    ctx.fillStyle = "#d9c8a3"; ctx.font = `bold ${11 * camera.zoom}px sans-serif`; ctx.textAlign = "center"; ctx.fillText("县城", cx, cy + s * .53);
  } else {
    ctx.fillStyle = sobj.kind === "site" ? "#84673f" : "#6b6860"; ctx.strokeStyle = sobj.kind === "site" ? "#c69a4b" : "#aaa49a"; ctx.lineWidth = 1.4 * camera.zoom;
    ctx.fillRect(cx - s * .28, cy - s * .28, s * .56, s * .54); ctx.strokeRect(cx - s * .28, cy - s * .28, s * .56, s * .54);
    ctx.fillStyle = "#2c2922"; ctx.fillRect(cx - s * .09, cy - s * .1, s * .18, s * .2);
    ctx.fillStyle = sobj.kind === "site" ? "#edc36d" : "#f0d8bc"; ctx.font = `bold ${10 * camera.zoom}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(sobj.kind === "site" ? "工" : "楼", cx, cy + 2);
  }
  const ratio = Math.max(0, sobj.hp / sobj.maxHp); ctx.fillStyle = "rgba(25,18,14,.9)"; ctx.fillRect(cx - s * .35, cy + s * .37, s * .7, 4 * camera.zoom); ctx.fillStyle = "#c94e41"; ctx.fillRect(cx - s * .35, cy + s * .37, s * .7 * ratio, 4 * camera.zoom);
  ctx.restore();
}
function drawUnit(u, cx, cy, s) {
  const ut = UNIT_TYPES[u.type], player = u.side === "player";
  ctx.save();
  if (selection?.kind === "unit" && selection.id === u.id) { ctx.strokeStyle = "#fff0a8"; ctx.lineWidth = 3 * camera.zoom; ctx.beginPath(); ctx.arc(cx, cy, s * .52, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = player ? "#a43f32" : "#e8dfc9"; ctx.strokeStyle = player ? "#f0b08a" : "#b34b3d"; ctx.lineWidth = 1.5 * camera.zoom;
  roundedRect(cx - s * .3, cy - s * .43, s * .6, s * .65, 5 * camera.zoom); ctx.fill(); ctx.stroke();
  ctx.fillStyle = player ? "#fff2d2" : "#a63830"; ctx.font = `bold ${Math.max(12, 17 * camera.zoom)}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(ut.glyph, cx, cy - s * .12);
  const bw = s * .72; ctx.fillStyle = "#2a2018"; ctx.fillRect(cx - bw / 2, cy + s * .26, bw, 5 * camera.zoom); ctx.fillStyle = u.hp > 55 ? "#8db657" : u.hp > 28 ? "#d2a447" : "#d24f43"; ctx.fillRect(cx - bw / 2, cy + s * .26, bw * Math.max(0, u.hp) / 100, 5 * camera.zoom);
  if (u.level) { ctx.fillStyle = "#f1cf65"; ctx.font = `${10 * camera.zoom}px sans-serif`; ctx.fillText("★".repeat(u.level), cx, cy - s * .54); }
  if (u.type === "puppet" && u.defection > 0) { ctx.fillStyle = "#d9b45d"; ctx.font = `bold ${9 * camera.zoom}px sans-serif`; ctx.fillText(`${u.defection}%`, cx, cy + s * .48); }
  ctx.restore();
}

function drawNetwork() {
  if (!state?.network) return;
  const byId = new Map(playerVillages(state).map(x => [x.village.id, x]));
  ctx.save(); ctx.lineCap = "round";
  for (const e of state.network.edges) {
    const a = byId.get(e.a), b = byId.get(e.b); if (!a || !b) continue;
    const [ax, ay] = screenCenter(a.q, a.r), [bx, by] = screenCenter(b.q, b.r);
    ctx.strokeStyle = e.active ? "rgba(90,174,181,.74)" : "rgba(190,84,61,.55)"; ctx.lineWidth = e.active ? 4 * camera.zoom : 3 * camera.zoom; ctx.setLineDash(e.active ? [] : [7 * camera.zoom, 6 * camera.zoom]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  ctx.restore();
}
function drawPathPreview() {
  const u = selectedUnit(), queued = !pending?.path && u?.route ? shortestPath(state, u, u.route.q, u.route.r, 99) : null;
  const path = pending?.path || queued?.path; if (!path) return;
  ctx.save(); ctx.strokeStyle = pending?.path ? "#ffe5a0" : "#71bdc5"; ctx.lineWidth = 3 * camera.zoom; ctx.setLineDash([3 * camera.zoom, 5 * camera.zoom]); ctx.beginPath();
  path.forEach(([q, r], i) => { const [x, y] = screenCenter(q, r); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  if (pending?.stopIndex > 0 && pending.stopIndex < path.length - 1) { const [q,r] = path[pending.stopIndex], [x,y] = screenCenter(q,r); ctx.setLineDash([]); ctx.fillStyle = "#ffe5a0"; ctx.beginPath(); ctx.arc(x,y,5*camera.zoom,0,Math.PI*2); ctx.fill(); }
  ctx.restore();
}
function draw() {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1), w = canvas.width / dpr, h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#0d0c08"; ctx.fillRect(0, 0, w, h);
  if (!state) return;
  const vis = visibleKeys(state), s = CFG.hexSize * camera.zoom;
  for (let q = 0; q < CFG.mapW; q++) for (let r = 0; r < CFG.mapH; r++) {
    const t = tileAt(state, q, r), [cx, cy] = screenCenter(q, r); if (cx < -s * 2 || cy < -s * 2 || cx > w + s * 2 || cy > h + s * 2) continue;
    hexPath(cx, cy, s - .6); ctx.fillStyle = t.disc ? TERRAIN[t.terrain].color : "#17150e"; ctx.fill(); ctx.strokeStyle = t.disc ? "rgba(167,149,91,.4)" : "#292619"; ctx.lineWidth = 1; ctx.stroke();
    if (!t.disc) continue;
    drawTerrainIcon(t.terrain, cx, cy, s * .72);
    if (t.rail) drawRail(q, r, cx, cy, s, t.railBroken > 0);
  }
  drawNetwork();
  if (reach.size && selection?.kind === "unit") for (const k of reach.keys()) {
    const [q, r] = k.split(",").map(Number), [cx, cy] = screenCenter(q, r); hexPath(cx, cy, s - 4); ctx.fillStyle = "rgba(142,197,85,.26)"; ctx.fill(); ctx.strokeStyle = "rgba(187,230,111,.75)"; ctx.lineWidth = 2; ctx.stroke();
  }
  for (let q = 0; q < CFG.mapW; q++) for (let r = 0; r < CFG.mapH; r++) {
    const t = tileAt(state, q, r); if (!t.disc) continue; const [cx, cy] = screenCenter(q, r), visible = vis.has(keyOf(q, r));
    if (t.village) drawVillage({ tile: t, village: t.village }, cx, cy, s, visible);
    if (t.structure) drawStructure(t.structure, cx, cy, s);
    if (!visible) { hexPath(cx, cy, s - 1); ctx.fillStyle = "rgba(7,7,5,.48)"; ctx.fill(); }
  }
  if (state.operation?.targets && (state.operation.revealed || state.techs.network)) for (const tg of state.operation.targets) {
    const [cx, cy] = screenCenter(tg.q, tg.r); ctx.save(); ctx.strokeStyle = "rgba(229,91,70,.86)"; ctx.lineWidth = 2.5; ctx.setLineDash([7,5]); hexPath(cx, cy, s + 5); ctx.stroke(); ctx.restore();
  }
  for (const u of state.units) {
    if (u.side === "enemy" && !vis.has(keyOf(u.q, u.r))) continue;
    const [cx, cy] = screenCenter(u.q, u.r), offset = u.layer === "civ" ? -s * .2 : s * .12; drawUnit(u, cx + offset, cy, s * .8);
  }
  if (selection?.kind === "tile") { const [cx, cy] = screenCenter(selection.q, selection.r); ctx.strokeStyle = "#f7e7b3"; ctx.lineWidth = 2.5; hexPath(cx, cy, s - 2); ctx.stroke(); }
  drawPathPreview();
}

function tileFromPoint(x, y) {
  let best = null, bestD = Infinity;
  for (let q = 0; q < CFG.mapW; q++) for (let r = 0; r < CFG.mapH; r++) {
    const [cx, cy] = screenCenter(q, r), d = (cx - x) ** 2 + (cy - y) ** 2; if (d < bestD) { bestD = d; best = { q, r }; }
  }
  return bestD <= (CFG.hexSize * camera.zoom * 1.05) ** 2 ? best : null;
}
function selectedUnit() { return selection?.kind === "unit" ? getUnit(state, selection.id) : null; }
function selectUnit(u) {
  selection = { kind: "unit", id: u.id }; reach = u.side === "player" ? reachableTiles(state, u.id) : new Map(); pending = null; hideConfirm(); renderPanel(); draw();
}
function handleTileClick(q, r) {
  if (!state || state.over || !tileAt(state, q, r).disc) return;
  const u = selectedUnit(), enemy = unitAt(state, q, r, "enemy", "mil"), t = tileAt(state, q, r);
  if (u?.side === "player" && !u.acted) {
    if (enemy && hexDistance(u.q, u.r, q, r) === 1 && UNIT_TYPES[u.type].str > 0) { planUnitAttack(u, enemy); return; }
    if (t.structure && hexDistance(u.q, u.r, q, r) === 1 && UNIT_TYPES[u.type].str > 0) { planStructureAttack(u, q, r); return; }
    if (!enemy && !t.structure) {
      const route = shortestPath(state, u, q, r, 99); if (route?.cost > 0) { planMove(u, q, r); return; }
    }
  }
  const ownUnits = state.units.filter(x => x.q === q && x.r === r && x.side === "player");
  if (ownUnits.length) {
    const current = u && u.q === q && u.r === r ? ownUnits.findIndex(x => x.id === u.id) : -1; selectUnit(ownUnits[(current + 1) % ownUnits.length]); return;
  }
  selection = { kind: "tile", q, r }; reach = new Map(); pending = null; hideConfirm(); renderPanel(); draw();
}
function planMove(u, q, r) {
  const found = shortestPath(state, u, q, r, 99); if (!found) return;
  let budget = u.mp, turns = 1, stopIndex = 0;
  for (let i = 1; i < found.path.length; i++) {
    const [nq, nr] = found.path[i], step = TERRAIN[tileAt(state, nq, nr).terrain].move;
    if (step > budget) { turns++; budget = UNIT_TYPES[u.type].mp; }
    budget -= step;
    if (turns === 1) stopIndex = i;
  }
  pending = { type: "move", unitId: u.id, q, r, path: found.path, stopIndex };
  const stop = found.path[stopIndex] || found.path[0], multi = stopIndex < found.path.length - 1;
  showConfirm(`<strong>移动 ${u.name}</strong> → ${tileLabel(q, r)}<br><small>${multi ? `本回合先到${tileLabel(stop[0], stop[1])} · 预计${turns}回合 · 将自动续行` : `本回合抵达 · 消耗移动力 ${found.cost}`}</small>`); draw();
}
function planUnitAttack(a, d) {
  const p = combatPreview(state, a.id, d.id); pending = { type: "attack", unitId: a.id, targetId: d.id, q: d.q, r: d.r };
  showConfirm(`<strong>${a.name}</strong> → ${UNIT_TYPES[d.type].name}<br>预计造成 <b>-${p.expected}</b>，${p.counter ? `预计反击 <b>-${p.counter}</b>` : "预计可歼灭"}`); draw();
}
function planStructureAttack(a, q, r) {
  const s = tileAt(state, q, r).structure, p = structurePreview(state, a.id, q, r); pending = { type: "structure", unitId: a.id, q, r };
  showConfirm(`<strong>${a.name}</strong> → ${s.name}<br>预计造成 <b>-${p.expected}</b>，守敌反击约 <b>-${p.counter}</b>`); draw();
}
function showConfirm(html) { $("confirmText").innerHTML = html; $("confirmBar").classList.remove("hidden"); }
function hideConfirm() { $("confirmBar").classList.add("hidden"); }
function executePending() {
  if (!pending) return;
  let result;
  if (pending.type === "move") result = moveUnit(state, pending.unitId, pending.q, pending.r);
  else if (pending.type === "attack") result = attackUnit(state, pending.unitId, pending.targetId);
  else result = attackStructure(state, pending.unitId, pending.q, pending.r);
  pending = null; hideConfirm();
  if (!result.ok) toast(result.error); else { beep(result.damage ? 145 : 340, result.damage ? .11 : .045, result.damage ? .045 : .02, result.damage ? "sawtooth" : "sine"); }
  afterAction();
}

function tileLabel(q, r) { const t = tileAt(state, q, r); return t.village?.name || t.structure?.name || `${TERRAIN[t.terrain].name}（${q},${r}）`; }
function costHtml(cost = {}) {
  const labels = { grain: "粮", man: "人", arms: "火", org: "组" };
  return Object.entries(cost).filter(([,v]) => v).map(([k,v]) => `${labels[k]}${v}`).join(" · ");
}
function renderUnitPanel(u) {
  const t = tileAt(state, u.q, u.r), ut = UNIT_TYPES[u.type], def = unitStrength(state, u, "defense"), atk = unitStrength(state, u, "attack");
  const status = u.stationedVillageId ? "已驻村 · 不可移动" : u.acted ? "本回合已行动" : `移动 ${u.mp}/${ut.mp}`;
  let html = `<h3>${u.name}<small>${tileLabel(u.q, u.r)} · ${status}</small></h3>`;
  html += `<div class="statline"><span>HP <b>${Math.round(u.hp)}</b>/100</span>${ut.str ? `<span>战力 <b>${atk.toFixed(1)}</b>/<b>${def.toFixed(1)}</b></span>` : ""}<span>经验 <b>${u.xp}</b>${u.level ? ` · ${"★".repeat(u.level)}` : ""}</span></div>`;
  html += `<div class="bar"><b style="width:${Math.max(0,u.hp)}%"></b></div><p class="hint">${ut.desc}</p>`;
  if (u.route) html += `<div class="warning">多回合行军目标：${tileLabel(u.route.q,u.route.r)}。每个新回合会自动沿安全路径续行。</div>`;
  if (u.stationedVillageId) html += `<div class="warning good">工作队已转入长期驻村状态；村庄并入根据地后，单位会转化为基层组织并从棋盘移除。</div>`;
  if (u.side === "player") {
    const actions = [];
    if (t.village) actions.push(`<button data-action="selectTile"><strong>查看驻地</strong><small>建设、招募与村庄产出</small></button>`);
    if (!u.acted && u.type === "work" && t.village?.owner === "neutral" && !u.stationedVillageId) actions.push(`<button data-action="station"><strong>驻村发动群众</strong><small>确认后不能离村 · 并入时消耗</small></button>`);
    if (u.route) actions.push(`<button data-action="cancelRoute"><strong>取消行军计划</strong><small>保留当前位置与剩余移动力</small></button>`);
    if (!u.acted && ut.str > 0) actions.push(`<button data-action="fortify"><strong>驻扎设防</strong><small>防御+4，月末缓慢恢复</small></button>`);
    if (!u.acted && u.hp < 100 && t.village?.owner === "player" && t.village.connected) actions.push(`<button data-action="reinforce"><strong>补充兵员</strong><small>消耗人力与粮，保留经验</small></button>`);
    if (!u.acted && t.rail && !t.railBroken && ["militia","commando"].includes(u.type)) actions.push(`<button data-action="sabotage"><strong>破袭铁路</strong><small>缴获物资并延迟增援</small></button>`);
    const puppets = state.units.filter(x => x.type === "puppet" && hexDistance(u.q,u.r,x.q,x.r) === 1);
    if (!u.acted && state.techs.enemywork && ["work","commando"].includes(u.type) && puppets.length) actions.push(`<button data-action="defect" data-target="${puppets[0].id}"><strong>秘密策反伪军</strong><small>组织8 · 当前进度${puppets[0].defection || 0}%</small></button>`);
    if (!u.acted && !u.stationedVillageId) actions.push(`<button data-action="skip"><strong>跳过本回合</strong><small>保留当前位置</small></button>`);
    html += `<div class="panel-section"><b>单位行动</b><div class="action-grid">${actions.join("") || "<span class='hint'>本回合没有可用行动。</span>"}</div></div>`;
  } else {
    html += `<div class="warning">敌军正在执行${u.opId ? `【${OPERATIONS[state.operation?.type]?.name || "敌军行动"}】` : "巡逻与清乡"}。</div>`;
    if (u.type === "puppet" && u.defection) html += `<div class="panel-section"><b>敌工关系 ${u.defection}%</b><div class="bar influence"><b style="width:${u.defection}%"></b></div></div>`;
  }
  return html;
}
function renderVillagePanel(q, r, t) {
  const v = t.village, own = v.owner === "player", tr = TRAITS[v.trait], suppressed = suppressionAt(state, q, r);
  const stationed = state.units.find(u => u.type === "work" && u.stationedVillageId === v.id);
  let html = `<h3>${v.name}<small>${TERRAIN[t.terrain].name} · ${tr.name}</small></h3>`;
  html += `<div class="statline"><span>${own ? "根据地村庄" : "中立村庄"}</span><span>民心 <b>${Math.round(v.support)}</b>/100</span>${own ? `<span class="${v.connected ? "good" : ""}">${v.connected ? "交通畅通" : "交通中断"}</span>` : ""}</div><div class="bar support"><b style="width:${v.support}%"></b></div>`;
  html += `<p class="hint">${tr.desc}</p>`;
  if (suppressed) html += `<div class="warning">附近有敌军据点压制${v.buildings.includes("tunnel") ? "，地道网正在抵消封锁" : `，中立民心最高只能到${CFG.suppressSupportCap}`}</div>`;
  if (!own) html += `<div class="panel-section"><b>群众工作${stationed ? ` · ${stationed.name}驻村中` : ""}</b><p class="hint">${stationed ? `工作队已经转为驻村状态，每回合自动提升民心；达到${CFG.joinSupport}且解除压制后，工作队转化为基层组织并从棋盘移除。` : "工作队进入村庄后需执行【驻村发动群众】；确认后不能再次出发。"}</p></div>`;
  else {
    const x = { q, r, tile: t, village: v }, y = villageYield(state, x), slots = v.hq ? 3 : 2;
    html += `<div class="statline"><span>月产 🌾<b>${y[0]}</b></span><span>人 <b>${y[1]}</b></span><span>组 <b>${y[2]}</b></span><span>火 <b>${y[3]}</b></span></div>`;
    html += `<div>${v.buildings.map(k => `<span class="tag">${BUILDINGS[k].name}</span>`).join("") || "<span class='hint'>尚无主要设施</span>"}</div>`;
    v.buildProgress ||= {}; const pausedKeys = Object.keys(v.buildProgress);
    html += `<div class="panel-section"><b>建设 · ${v.buildings.length}/${slots}槽${v.build ? ` · ${BUILDINGS[v.build.key].name}余${v.build.monthsLeft}月` : pausedKeys.length ? ` · ${pausedKeys.length}项进度保留` : ""}</b>`;
    if (v.build) {
      const b = BUILDINGS[v.build.key], done = b.months - v.build.monthsLeft, percent = Math.round(done / b.months * 100);
      html += `<div class="build-progress" title="已完成${done}/${b.months}个月"><b style="width:${percent}%"></b></div><p class="hint">【${b.name}】施工中：已完成${done}个月，尚余${v.build.monthsLeft}个月。取消后不退款，但工程进度会保留。</p><div class="action-grid"><button class="cancel-build" data-action="cancelBuild"><strong>取消当前建设</strong><small>保留投入与剩余${v.build.monthsLeft}月进度</small></button></div>`;
    } else {
      if (pausedKeys.length) html += `<div class="paused-builds">已保留：${pausedKeys.map(k => `${BUILDINGS[k].name}（余${v.buildProgress[k]}月）`).join("、")}</div>`;
      html += `<div class="action-grid">`;
      if (v.buildings.length < slots) for (const [k,b] of Object.entries(BUILDINGS)) {
        if (v.buildings.includes(k)) continue;
        const paused = Number.isFinite(v.buildProgress[k]), locked = b.tech && !state.techs[b.tech], affordable = paused || (state.grain >= (b.cost.grain||0) && state.org >= (b.cost.org||0));
        html += `<button data-action="build" data-key="${k}" ${locked || !affordable || !v.connected ? "disabled" : ""}><strong>${paused ? "续建 · " : ""}${b.name}</strong><small>${locked ? `需${TECHS[b.tech].name}` : paused ? `无需再次付费 · 余${v.buildProgress[k]}月` : `${costHtml(b.cost)} · ${b.months}月`}</small></button>`;
      }
      html += `</div>`;
    }
    html += `</div><div class="panel-section"><b>组建队伍</b><div class="action-grid">`;
    for (const k of ["scout","work","militia","regular","commando"]) {
      const u = UNIT_TYPES[k], locked = u.tech && !state.techs[u.tech], affordable = Object.entries(u.cost).every(([rk,rv]) => state[rk] >= rv);
      html += `<button data-action="recruit" data-key="${k}" ${locked || !affordable || !v.connected ? "disabled" : ""}><strong>${u.name}${u.str ? ` · 战${u.str}` : ""}</strong><small>${locked ? `需${TECHS[u.tech].name}` : costHtml(u.cost)}</small></button>`;
    }
    html += `</div></div>`;
  }
  return html;
}
function renderTilePanel(q, r) {
  const t = tileAt(state, q, r), enemy = unitAt(state, q, r, "enemy"); if (enemy) return renderUnitPanel(enemy);
  if (t.village) return renderVillagePanel(q, r, t);
  if (t.structure) return `<h3>${t.structure.name}<small>${t.structure.kind === "town" ? "县级据点" : t.structure.kind === "site" ? "修建中的炮楼" : "封锁据点"}</small></h3><div class="statline"><span>耐久 <b>${Math.max(0,Math.round(t.structure.hp))}</b>/${t.structure.maxHp}</span><span>火力 <b>${t.structure.str}</b></span></div><div class="bar"><b style="width:${Math.max(0,t.structure.hp/t.structure.maxHp*100)}%"></b></div><p class="hint">${t.structure.kind === "town" ? "完成局部反攻、削弱外围炮楼并同时切断铁路后才能攻克。" : "压制周围村庄并切断交通，是囚笼政策的支点。"}</p>`;
  return `<h3>${TERRAIN[t.terrain].name}<small>${q},${r}${t.rail ? " · 正太铁路支线" : ""}</small></h3><p class="hint">防御+${TERRAIN[t.terrain].defense}，移动消耗${TERRAIN[t.terrain].move}。${t.rail ? (t.railBroken ? `铁路已破坏，${t.railBroken}回合后修复。` : "民兵或武工队可在此破袭。") : ""}</p>`;
}
function renderPanel() {
  const panel = $("sidePanel"); if (!state || !selection) { panel.classList.add("hidden"); return; }
  panel.classList.remove("hidden");
  if (selection.kind === "unit") { const u = getUnit(state, selection.id); panel.innerHTML = u ? renderUnitPanel(u) : ""; if (!u) selection = null; }
  else panel.innerHTML = renderTilePanel(selection.q, selection.r);
}

const RESOURCE_INFO = {
  grain: { icon:"🌾", name:"粮食", desc:"建设设施、组建队伍和维持部队的基础物资。每月下半月结束时统一结算；归零会造成部队减员与村庄民心下降。" },
  man: { icon:"👥", name:"人力", desc:"组建部队和补充伤亡所需的人口基础。主要来自交通畅通的村庄，兵源村和高民心会提高产出。" },
  arms: { icon:"🔫", name:"军火", desc:"主力部队、武工队和补员所需的稀缺装备。铁匠村、兵工坊与破袭缴获是主要来源。" },
  org: { icon:"✊", name:"组织力", desc:"用于整训、政策调整、工作队和地下设施。夜校与文化村可以提供稳定月产。" },
};
function resourceItem(key, label, value, income, cap = null) {
  const info=RESOURCE_INFO[key], inc = income ? `<small class="${income < 0 ? "neg" : ""}">${income > 0 ? "+" : ""}${income}</small>` : "";
  return `<span class="resource" tabindex="0" data-resource="${key}" aria-label="${info.name} ${Math.round(value)}${cap ? `，上限${cap}` : ""}">${info.icon} ${label} <b>${Math.round(value)}</b>${cap ? `/${cap}` : ""} ${inc}</span>`;
}
function updateUI() {
  if (!state) return;
  hideResourceTooltip();
  const ch = CHAPTERS[chapterIndex(state.turn)], inc = state.lastIncome || {};
  $("dateBox").innerHTML = `<b>${dateLabel(Math.min(state.turn,CFG.totalTurns))}</b><small>${state.turn}/${CFG.totalTurns}</small>`;
  $("resourceBar").innerHTML = resourceItem("grain","粮",state.grain,inc.grain,CFG.grainCap)+resourceItem("man","人",state.man,inc.man,CFG.manCap)+resourceItem("arms","火",state.arms,inc.arms,CFG.armsCap)+resourceItem("org","组",state.org,inc.org,CFG.orgCap);
  $("exposureValue").textContent = Math.round(state.exposure); $("exposureFill").style.width = `${state.exposure}%`;
  $("pressureValue").textContent = Math.round(state.pressure); $("pressureFill").style.width = `${state.pressure}%`;
  $("chapterTitle").textContent = ch.title; $("chapterStory").textContent = ch.story;
  $("objectives").innerHTML = objectiveStatus(state,ch).map(o => `<div class="objective ${o.done ? "done" : ""}"><i>${o.done ? "✓" : "○"}</i><b>${o.text}</b><span>${Math.min(o.progress,o.target)}/${o.target}</span></div>`).join("");
  $("seedLine").textContent = `战区种子 ${state.seed} · 当前方针【${POLICIES[state.policy].name}】`;
  const op = state.operation, banner = $("operationBanner");
  if (!op) banner.classList.add("hidden"); else {
    banner.classList.remove("hidden"); banner.classList.toggle("intel", op.phase === "telegraph");
    const info = OPERATIONS[op.type], targetText = (op.revealed || state.techs.network) && op.targets.length ? ` · 目标：${op.targets.map(t => tileLabel(t.q,t.r)).join("、")}` : " · 目标尚不明确";
    banner.textContent = op.phase === "telegraph" ? `${info.icon} 敌军正在准备【${info.name}】——${op.countdown}回合后行动${targetText}` : `${info.icon}【${info.name}】进行中——${op.ttl}回合后撤退${targetText}`;
  }
  renderLogs(); refreshMainButton(); renderPanel(); draw();
}
function renderLogs() {
  $("logEntries").innerHTML = state.logs.slice(-18).map(l => `<p class="${l.kind}"><time>${dateLabel(l.turn)}</time>${l.text}</p>`).join("");
  $("logPanel").scrollTop = $("logPanel").scrollHeight;
}
function actionableUnits() { return state.units.filter(u => u.side === "player" && !u.stationedVillageId && !u.acted && u.mp > 0); }
function refreshMainButton() {
  const b = $("mainButton"), count = actionableUnits().length;
  if (count) { b.innerHTML = `下一单位 <small>[空格] · ${count}</small>`; b.classList.remove("ready"); }
  else { b.innerHTML = `结束回合 <small>[空格]</small>`; b.classList.add("ready"); }
}
function nextUnit() {
  const units = actionableUnits().sort((a,b) => a.id-b.id); if (!units.length) return;
  const current = selectedUnit(), idx = current ? units.findIndex(u => u.id === current.id) : -1, next = units[(idx + 1) % units.length];
  selectUnit(next); centerCamera(next.q,next.r); beep(420,.035,.015);
}
function mainAction() {
  if (!state || state.over || modalOpen()) return;
  if (actionableUnits().length) nextUnit(); else performEndTurn();
}
function performEndTurn() {
  const oldChapter = chapterIndex(state.turn), oldOp = state.operation?.id;
  selection = null; pending = null; hideConfirm(); const result = endTurn(state); saveGame();
  if (!result.ok) toast(result.error);
  const newChapter = chapterIndex(state.turn); if (newChapter !== oldChapter) toast(CHAPTERS[newChapter].title);
  else if (state.operation?.id !== oldOp && state.operation) toast(`敌军行动：${OPERATIONS[state.operation.type].name}`);
  beep(220,.08,.026,"triangle"); updateUI(); if (state.over) showEnding();
}
function afterAction() {
  computeNetwork(state); saveGame(); reach = selectedUnit()?.side === "player" ? reachableTiles(state, selectedUnit().id) : new Map(); updateUI(); if (state.over) showEnding();
}

function modalOpen() { return !$("modalWrap").classList.contains("hidden"); }
function openModal(html) { $("modal").innerHTML = html; $("modalWrap").classList.remove("hidden"); }
function closeModal() { $("modalWrap").classList.add("hidden"); }
function toast(text) { const el = $("toast"); el.textContent = text; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); }
function placeResourceTooltip(x, y) {
  const tip=$("resourceTooltip"), rect=tip.getBoundingClientRect();
  let left=Math.max(10,Math.min(innerWidth-rect.width-10,x+12)), top=y+14;
  if(top+rect.height>innerHeight-10)top=Math.max(10,y-rect.height-14);
  tip.style.left=`${left}px`;tip.style.top=`${top}px`;
}
function showResourceTooltip(el, x, y) {
  const key=el?.dataset.resource, info=RESOURCE_INFO[key];if(!info||!state)return;
  const caps={grain:CFG.grainCap,man:CFG.manCap,arms:CFG.armsCap,org:CFG.orgCap},income=state.lastIncome?.[key]||0;
  const change=`${income>0?"+":""}${income}`;
  const tip=$("resourceTooltip");tip.innerHTML=`<strong>${info.icon} ${info.name}　${Math.round(state[key])}/${caps[key]}</strong><em class="${income<0?"neg":""}">最近一次月结净变化 ${change}</em><span>${info.desc}</span>`;tip.classList.remove("hidden");placeResourceTooltip(x,y);
}
function hideResourceTooltip() { $("resourceTooltip")?.classList.add("hidden"); }
function introHtml() {
  const hasSave = !!localStorage.getItem(SAVE_KEY);
  return `<h1>太行·1941：破笼<small>百团大战之后 · 敌后根据地4X Lite · 纯2D六边棋盘</small></h1>
    <p class="lead">你每争取一个村，下一次扫荡就更凶。</p>
    <p>正太路上的铁轨刚被掀翻，日军的铁路、炮楼与扫荡正重新收紧。你负责太行山区一块县级根据地：联结村庄、保存群众、发展武装，在“发展越快、暴露越高”的矛盾中活下来，最终再次撕开囚笼。</p>
    <div class="cards">
      <div class="card"><h3>探索</h3><p>侦察战区、铁路、村庄与敌军行动意图。</p></div>
      <div class="card"><h3>联结</h3><p>通过地下交通站把村庄接入根据地网络。</p></div>
      <div class="card"><h3>建设</h3><p>每村只有2个设施槽，必须选择专业化方向。</p></div>
      <div class="card"><h3>破笼</h3><p>破袭铁路、拔炮楼、策反伪军并保存群众。</p></div>
    </div>
    <p class="hint">操作：拖拽平移、滚轮缩放；点单位后可点击已侦明的远方格，系统会规划并自动续行；点己方村建设与招募。鼠标悬停顶部资源可查看用途和最近月结。</p>
    <div class="modal-actions"><button data-modal="new">开始新战役</button>${hasSave ? `<button class="ghost" data-modal="continue">继续进度</button>` : ""}<button class="ghost" data-modal="rules">查看完整规则</button></div>`;
}
function showIntro() { openModal(introHtml()); }
function showRules() {
  const rows = CHAPTERS.map((c,i) => `<div class="chapter-row ${state && i===chapterIndex(state.turn)?"current":""}"><b>${c.start}—${c.deadline}回合</b><span><strong>${c.title}</strong><br>${c.story}</span></div>`).join("");
  openModal(`<h2>战役设定与规则<small>不是占地涂色，而是两个网络争夺同一片乡村</small></h2>
    <p><strong>根据地网络</strong>由村庄和地下交通站组成。交通畅通的村庄全额产出、可以建设与补员；被炮楼或敌军切断后只保留一半产出。</p>
    <p><strong>工作队</strong>对标一次性开拓单位：进入中立村后需确认“驻村发动群众”；此后不能离村，村庄并入时转化为基层组织并从棋盘移除。</p>
    <p><strong>多回合行军</strong>可以直接点击已侦明的远方空格，单位会逐回合自动续行；新命令或主动行动会取消旧路线。村庄工程可以取消，已投入资源与剩余工期保留，下次无需再次付费即可续建。</p>
    <p><strong>暴露</strong>是短期情报：行动越激烈，敌人越容易锁定准确目标；可以衰减。<strong>压力</strong>是长期形势：根据地、兵工和时间都会让敌军升级，不能靠隐蔽永久退出战争。</p>
    <p><strong>胜利</strong>有两条：完成局部反攻、切断铁路并攻克县城；或以7座畅通村庄和较高民心坚持到1945年8月。</p>
    <div class="chapter-list">${rows}</div>
    <div class="modal-actions"><button data-modal="back">返回</button></div>`);
}
function showTechs() {
  const cards = Object.entries(TECHS).map(([k,t]) => {
    const done = !!state.techs[k], ready = !done && (t.need||[]).every(n => state.techs[n]) && state.org >= t.cost;
    return `<div class="card ${done?"done":""}"><h3>${["一","二","三"][t.tier-1]}阶 · ${t.name}</h3><p>${t.desc}</p><div class="cost">✊ ${t.cost}${t.need?.length?` · 前置：${t.need.map(n=>TECHS[n].name).join("、")}`:""}</div>${done?"<button disabled>已完成</button>":`<button data-tech="${k}" ${ready?"":"disabled"}>整训</button>`}</div>`;
  }).join("");
  openModal(`<h2>整训<small>组织力 ${Math.round(state.org)} · 永久解锁战役能力</small></h2><div class="cards">${cards}</div><div class="modal-actions"><button data-modal="close">返回</button></div>`);
}
function showPolicies() {
  const cooldown = Math.max(0,6-(state.turn-state.lastPolicyTurn));
  const cards = Object.entries(POLICIES).map(([k,p]) => `<div class="card ${state.policy===k?"active":""}"><h3>${p.name}</h3><p>${p.desc}</p><div class="cost">${state.policy===k?"当前执行中":"切换：✊12 · 至少执行6回合"}</div><button data-policy="${k}" ${state.policy===k||cooldown||state.org<12?"disabled":""}>${state.policy===k?"执行中":cooldown?`冷却${cooldown}回合`:"调整方针"}</button></div>`).join("");
  openModal(`<h2>作战方针<small>一个方针槽 · 规则改变而非单纯叠加战力</small></h2><div class="cards">${cards}</div><div class="modal-actions"><button data-modal="close">返回</button></div>`);
}
function showEnding() {
  const titles = { military:"解放县城 · 囚笼尽破", network:"人民的根据地保存到了胜利", survival:"守住了太行的火种", pyrrhic:"惨胜 · 根据地元气大伤", defeat:"总部失守" };
  const connected = state.network?.connectedIds?.length||0, avg = playerVillages(state).length ? Math.round(playerVillages(state).reduce((s,x)=>s+x.village.support,0)/playerVillages(state).length):0;
  openModal(`<h2>${titles[state.result]||"战役结束"}<small>${dateLabel(Math.min(state.turn,CFG.totalTurns))} · 战区种子 ${state.seed}</small></h2>
    <p class="lead">最终评分 <strong>${state.score}</strong></p>
    <div class="cards"><div class="card"><h3>根据地</h3><p>${playerVillages(state).length}村 · ${connected}村畅通 · 平均民心${avg}</p></div><div class="card"><h3>破笼</h3><p>破袭${state.stats.sabotages}次 · 拔点${state.stats.structuresDestroyed}处</p></div><div class="card"><h3>敌工</h3><p>策反成果${state.stats.defections}次 · 歼敌${state.stats.kills}队</p></div><div class="card"><h3>反扫荡</h3><p>熬过${state.stats.operationsSurvived}次敌军行动</p></div></div>
    <div class="modal-actions"><button data-modal="new">再来一局</button></div>`);
}

function saveGame() { if (state && !state.over) localStorage.setItem(SAVE_KEY, serializeGame(state)); else if (state?.over) localStorage.removeItem(SAVE_KEY); }
function newGame(seed = null) {
  const urlSeed = new URLSearchParams(location.search).get("seed"), chosen = seed ?? (urlSeed ? Number(urlSeed) : Date.now() % 1000000000);
  state = createGame(chosen); lastChapter = 0; selection = null; pending = null; reach = new Map(); camera = {x:0,y:0,zoom: innerWidth<700?.72:.92}; localStorage.removeItem(SAVE_KEY); closeModal(); centerCamera(state.hq.q,state.hq.r); updateUI(); saveGame(); toast("序章 · 百团余波");
}
function continueGame() {
  try { state = deserializeGame(localStorage.getItem(SAVE_KEY)); selection = null; pending = null; reach = new Map(); camera.zoom = innerWidth<700?.72:.92; closeModal(); centerCamera(state.hq.q,state.hq.r); updateUI(); }
  catch { localStorage.removeItem(SAVE_KEY); toast("存档损坏，已准备新战役"); newGame(); }
}

$("confirmYes").addEventListener("click", executePending);
$("confirmNo").addEventListener("click", () => { pending=null; hideConfirm(); draw(); });
$("mainButton").addEventListener("click", mainAction);
$("techBtn").addEventListener("click", () => state && !state.over && showTechs());
$("policyBtn").addEventListener("click", () => state && !state.over && showPolicies());
$("helpBtn").addEventListener("click", showRules);
$("soundBtn").addEventListener("click", () => { soundOn=!soundOn; $("soundBtn").setAttribute("aria-pressed", String(soundOn)); $("soundBtn").textContent=soundOn?"声":"静"; if(soundOn) beep(); });
$("resourceBar").addEventListener("pointerover", e => { const el=e.target.closest(".resource");if(el)showResourceTooltip(el,e.clientX,e.clientY); });
$("resourceBar").addEventListener("pointermove", e => { const el=e.target.closest(".resource");if(el&&!$("resourceTooltip").classList.contains("hidden"))placeResourceTooltip(e.clientX,e.clientY); });
$("resourceBar").addEventListener("pointerout", e => { const el=e.target.closest(".resource");if(el&&!el.contains(e.relatedTarget))hideResourceTooltip(); });
$("resourceBar").addEventListener("focusin", e => { const el=e.target.closest(".resource");if(el){const r=el.getBoundingClientRect();showResourceTooltip(el,r.left+r.width/2,r.bottom);} });
$("resourceBar").addEventListener("focusout", hideResourceTooltip);
$("modalWrap").addEventListener("click", e => { if(e.target===$("modalWrap") && state && !state.over) closeModal(); });
$("modal").addEventListener("click", e => {
  const b=e.target.closest("button"); if(!b) return;
  if(b.dataset.modal==="new") newGame(); else if(b.dataset.modal==="continue") continueGame(); else if(b.dataset.modal==="rules") showRules(); else if(b.dataset.modal==="back") showIntro(); else if(b.dataset.modal==="close") closeModal();
  else if(b.dataset.tech){ const r=buyTech(state,b.dataset.tech); if(!r.ok) toast(r.error); else { beep(520,.08,.03); saveGame(); } showTechs(); updateUI(); }
  else if(b.dataset.policy){ const r=changePolicy(state,b.dataset.policy); if(!r.ok) toast(r.error); else { beep(420,.08,.03); saveGame(); } showPolicies(); updateUI(); }
});
$("sidePanel").addEventListener("click", e => {
  const b=e.target.closest("button[data-action]"); if(!b) return; const action=b.dataset.action, u=selectedUnit(); let r={ok:false,error:"无效行动"};
  if(action==="build" && selection?.kind==="tile") r=startBuild(state,tileAt(state,selection.q,selection.r).village.id,b.dataset.key);
  else if(action==="cancelBuild" && selection?.kind==="tile") r=cancelBuild(state,tileAt(state,selection.q,selection.r).village.id);
  else if(action==="recruit" && selection?.kind==="tile") r=recruitUnit(state,tileAt(state,selection.q,selection.r).village.id,b.dataset.key);
  else if(action==="selectTile" && u){selection={kind:"tile",q:u.q,r:u.r};reach=new Map();r={ok:true};}
  else if(action==="station" && u) r=stationWorkTeam(state,u.id);
  else if(action==="cancelRoute" && u) r=cancelRoute(state,u.id);
  else if(action==="fortify" && u) r=fortifyUnit(state,u.id);
  else if(action==="reinforce" && u) r=reinforceUnit(state,u.id);
  else if(action==="sabotage" && u) r=sabotageRail(state,u.id);
  else if(action==="defect" && u) r=attemptDefection(state,u.id,Number(b.dataset.target));
  else if(action==="skip" && u){u.acted=true;u.mp=0;r={ok:true};}
  if(!r.ok) toast(r.error); else beep(360,.05,.02); afterAction();
});

canvas.addEventListener("pointerdown", e => { ensureAudio(); canvas.setPointerCapture(e.pointerId); dragging={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,camX:camera.x,camY:camera.y}; canvas.classList.add("dragging"); });
canvas.addEventListener("pointermove", e => { if(!dragging||e.pointerId!==dragging.id)return; camera.x=dragging.camX-(e.clientX-dragging.startX);camera.y=dragging.camY-(e.clientY-dragging.startY);draw(); });
canvas.addEventListener("pointerup", e => { if(!dragging||e.pointerId!==dragging.id)return; const moved=Math.hypot(e.clientX-dragging.startX,e.clientY-dragging.startY);dragging=null;canvas.classList.remove("dragging");if(moved<7){const h=tileFromPoint(e.clientX,e.clientY);if(h)handleTileClick(h.q,h.r);} });
canvas.addEventListener("wheel", e => { e.preventDefault();const old=camera.zoom,next=Math.max(.55,Math.min(1.7,old*(e.deltaY<0?1.1:.9)));const wx=(e.clientX+camera.x)/old,wy=(e.clientY+camera.y)/old;camera.zoom=next;camera.x=wx*next-e.clientX;camera.y=wy*next-e.clientY;draw();},{passive:false});
addEventListener("resize",resize);
addEventListener("keydown",e=>{if(e.code==="Space"&&!modalOpen()){e.preventDefault();mainAction();}else if((e.key==="t"||e.key==="T")&&state&&!modalOpen())showTechs();else if((e.key==="p"||e.key==="P")&&state&&!modalOpen())showPolicies();else if(e.key==="h"||e.key==="H")showRules();else if(e.key==="Escape"){if(modalOpen()&&state&&!state.over)closeModal();else{selection=null;pending=null;hideConfirm();renderPanel();draw();}}});

resize();
if(new URLSearchParams(location.search).get("test")==="1"){
  state=createGame(1941);const errors=invariantChecks(state);document.body.dataset.selftest=errors.length?"fail":"pass";const el=document.createElement("output");el.id="selfTest";el.hidden=true;el.textContent=errors.length?errors.join(" | "):"PASS";document.body.appendChild(el);centerCamera(state.hq.q,state.hq.r);updateUI();
}else showIntro();
