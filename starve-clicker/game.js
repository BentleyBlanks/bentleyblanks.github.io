/* ============================================================
   熬冬 · 荒野点击求生
   饥荒 × Cookie Clicker:点击挂机为骨架 + 三槽生存压力 + 死亡转生
   ============================================================ */
"use strict";

/* ===== 常量 ===== */
const DAY_LEN = 40;            // 1 游戏日 = 40 真实秒
const DAY_PHASE = 28;          // 前 28s 白昼,后 12s 黑夜
const SEASON_DAYS = 10;        // 每季 10 天
const SEASONS = [
  { id:"autumn", name:"秋", icon:"🍂" },
  { id:"winter", name:"冬", icon:"❄" },
  { id:"spring", name:"春", icon:"🌧" },
  { id:"summer", name:"夏", icon:"☀" },
];
const SAVE_KEY = "starve-clicker-save-v1";
const OFFLINE_CAP = 8 * 3600;  // 离线收益上限 8 小时

/* ===== 建筑表 ===== */
const BUILDINGS = [
  { id:"berry",   icon:"🫐", name:"浆果丛",   cost:{food:15},                 out:{food:0.6},  winterOff:true,
    desc:"移栽的浆果丛,自动结果。冬天休眠。" },
  { id:"trap",    icon:"🪤", name:"捕兔陷阱", cost:{wood:25},                 out:{food:0.9},
    desc:"兔子总会来的。全年供肉。" },
  { id:"lumber",  icon:"🪓", name:"伐木猪营", cost:{food:80, wood:30},        out:{wood:0.8},
    desc:"雇一头猪人替你砍树,工钱是肉。" },
  { id:"quarry",  icon:"⛏", name:"石矿场",   cost:{wood:100},                out:{stone:0.5}, needTech:"pickaxe",
    desc:"敲开大地的骨头。" },
  { id:"farm",    icon:"🌾", name:"农场",     cost:{wood:60, stone:40},       out:{food:2.2},  winterOff:true, needTech:"farming",
    desc:"土地慷慨,但冬天它也要睡觉。" },
  { id:"pighouse",icon:"🐷", name:"猪人房",   cost:{wood:120, stone:60},      out:{food:0.4},  def:2,
    desc:"猪人邻居:分你一点吃的,替你挡刀。" },
  { id:"icebox",  icon:"🧊", name:"冰箱",     cost:{wood:150, stone:100},     out:{},          needTech:"cooking", spoilMul:0.8,
    desc:"每台使食物腐烂速度 ×0.8。" },
  { id:"scimach", icon:"⚙", name:"科学机器", cost:{wood:40, stone:25},       out:{sci:0.25},
    desc:"用齿轮和执念研磨知识。解锁科学页签。" },
  { id:"alchemy", icon:"🔮", name:"炼金引擎", cost:{wood:250, stone:150, sci:40}, out:{sci:1.0}, needBuild:"scimach",
    desc:"更深的知识,更深的代价。解锁二阶科技。" },
  { id:"rod",     icon:"⚡", name:"避雷针",   cost:{stone:120},               out:{},          needBuild:"scimach", fireMul:0.7,
    desc:"每根使夏季自燃概率 ×0.7。" },
];
const COST_GROWTH = 1.18;

/* ===== 科技表 ===== */
const TECHS = [
  // —— 一阶:需要科学机器 ——
  { id:"pickaxe",   tier:1, icon:"⛏", name:"石镐",     cost:25,  desc:"解锁石料:点击可采石,可建石矿场。" },
  { id:"axe2",      tier:1, icon:"🪓", name:"精铁斧",   cost:45,  desc:"点击产出 ×2。" },
  { id:"farming",   tier:1, icon:"🌱", name:"农耕",     cost:60,  desc:"解锁农场。" },
  { id:"cooking",   tier:1, icon:"🍲", name:"烹饪锅",   cost:80,  desc:"进食效率提升:1 食物 = 1.6 饥饿。解锁冰箱。" },
  { id:"spear",     tier:1, icon:"🗡", name:"长矛",     cost:70,  desc:"战力 +3。" },
  { id:"wintercoat",tier:1, icon:"🧥", name:"冬衣",     cost:90,  desc:"寒冷伤害与冬季额外饥饿减半。" },
  // —— 二阶:需要炼金引擎 ——
  { id:"goldtools", tier:2, icon:"✨", name:"黄金工具", cost:160, desc:"点击产出再 ×3。" },
  { id:"hamblade",  tier:2, icon:"🍖", name:"火腿棒",   cost:200, desc:"战力 +6。别问,问就是能打。" },
  { id:"armor",     tier:2, icon:"🛡", name:"木甲",     cost:180, desc:"受到的一切伤害 -50%。" },
  { id:"furcoat",   tier:2, icon:"🐻", name:"熊皮大衣", cost:220, desc:"寒冷伤害 -85%(覆盖冬衣效果)。" },
  { id:"lantern",   tier:2, icon:"🏮", name:"永夜提灯", cost:260, desc:"夜间点击不再减半,黑暗理智流失减半。" },
  { id:"nightking", tier:2, icon:"👁", name:"暗影操控", cost:300, desc:"暗影生物不再伤害你;理智低于 25 时点击 +50%。" },
];

/* ===== 余烬(转生)升级表 ===== */
const EMBER_UPS = [
  { id:"survivor",  icon:"🏕", name:"老练求生者", max:5, cost:l=>8*Math.pow(2,l),
    desc:"所有自动产出 +10%/级。" },
  { id:"clickpow",  icon:"👊", name:"噩梦之手",   max:5, cost:l=>6*Math.pow(2,l),
    desc:"点击产出 +25%/级。" },
  { id:"fat",       icon:"🥓", name:"厚实脂肪",   max:5, cost:l=>8*Math.pow(2,l),
    desc:"饥饿与理智流失 -8%/级。" },
  { id:"starter",   icon:"🎒", name:"火种包裹",   max:3, cost:l=>5*Math.pow(2,l),
    desc:"转生时携带 80 食物 / 60 木材 / 30 石料 ×级。" },
  { id:"wisdom",    icon:"📜", name:"先祖智慧",   max:2, cost:l=>[25,60][l],
    desc:"1 级:开局已研究「石镐」;2 级:再加「精铁斧」。" },
  { id:"pigking",   icon:"👑", name:"猪王之谊",   max:3, cost:l=>15*Math.pow(2,l),
    desc:"每座猪人房战力额外 +1/级。" },
  { id:"emberfuel", icon:"🔥", name:"不灭余烬",   max:3, cost:l=>10*Math.pow(2,l),
    desc:"篝火燃料消耗 -15%/级。" },
  { id:"autumn",    icon:"🍂", name:"秋日绵长",   max:2, cost:l=>[20,45][l],
    desc:"每年秋天延长 +3 天/级(只有秋天)。" },
  { id:"hourglass", icon:"⏳", name:"时光沙漏",   max:2, cost:l=>[15,40][l],
    desc:"离线收益 50% → 75% → 100%。" },
];

/* ===== 状态 ===== */
let meta = {
  embers: 0,
  ups: {},            // 余烬升级等级 {id:lv}
  rebirths: 0,
  bestDays: 0,
  totalEmbers: 0,
};
let run = null;       // 本轮状态
let lastTs = Date.now();

function defaultRun() {
  const r = {
    t: 0,                       // 本轮经过的游戏秒
    day: 1, phase: "day",       // 缓存的展示值
    res:  { food:0, wood:0, stone:0, sci:0 },
    life: { food:0, wood:0, stone:0, sci:0 },   // 本轮累计产出(算余烬)
    hunger:100, sanity:100, health:100,
    fuel: 40,
    counts: {},                 // 建筑数量 {id:n}
    techs: {},                  // 已研究 {id:true}
    autoStoke: true,
    nextHound: 6,               // 下次猎犬日
    bossYearDone: -1,           // 已处理过巨鹿的年份
    bossKills: 0,
    shadowCd: 0,                // 暗影袭击冷却
    dead: false,
    deathCause: "",
    seasonSeen: "",             // 用于季节横幅
  };
  // 余烬开局加成
  const st = lv("starter");
  if (st > 0) { r.res.food += 80*st; r.res.wood += 60*st; r.res.stone += 30*st; }
  if (lv("wisdom") >= 1) r.techs.pickaxe = true;
  if (lv("wisdom") >= 2) r.techs.axe2 = true;
  return r;
}

function lv(id) { return meta.ups[id] || 0; }
function cnt(id) { return run.counts[id] || 0; }
function has(id) { return !!run.techs[id]; }

/* ===== 时间与季节 ===== */
// 秋日绵长:只延长秋季。返回 {season, dayOfSeason, year, day, isNight}
function calcTime(t) {
  const day = Math.floor(t / DAY_LEN) + 1;          // 第几天(1 起)
  const tod = t % DAY_LEN;
  const isNight = tod >= DAY_PHASE;
  const autumnLen = SEASON_DAYS + 3 * lv("autumn");
  const yearLen = autumnLen + SEASON_DAYS * 3;
  const dY = (day - 1) % yearLen;                   // 年内第几天(0 起)
  const year = Math.floor((day - 1) / yearLen);
  let season, dayOfSeason;
  if (dY < autumnLen)                { season = 0; dayOfSeason = dY; }
  else if (dY < autumnLen + SEASON_DAYS)   { season = 1; dayOfSeason = dY - autumnLen; }
  else if (dY < autumnLen + SEASON_DAYS*2) { season = 2; dayOfSeason = dY - autumnLen - SEASON_DAYS; }
  else                               { season = 3; dayOfSeason = dY - autumnLen - SEASON_DAYS*2; }
  return { day, tod, isNight, season, dayOfSeason, year };
}

/* ===== 存档 ===== */
let noSave = false;   // 硬重置时阻止 beforeunload 写回
function save() {
  if (noSave) return;
  lastTs = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ meta, run, lastTs }));
  } catch (e) { /* 存储不可用时静默 */ }
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

/* ===== 数字格式化 ===== */
function fmt(n) {
  if (n >= 1e6) return (n/1e6).toFixed(2) + "M";
  if (n >= 1e4) return (n/1e3).toFixed(1) + "k";
  if (n >= 100) return Math.floor(n).toString();
  return (Math.floor(n*10)/10).toString();
}
function fmtRate(n) {
  if (Math.abs(n) < 0.005) return "";
  return (n>0?"+":"") + (Math.abs(n)>=100 ? Math.round(n) : n.toFixed(1)) + "/s";
}

/* ============================================================
   引擎:产出 / 点击 / 购买 / 模拟 / 事件
   ============================================================ */

function prodMul() { return 1 + 0.10 * lv("survivor"); }

function seasonMulFor(b, season) {
  if (b.winterOff && season === 1) return 0;          // 冬眠
  if (season === 2 && (b.id === "berry" || b.id === "farm")) return 1.25; // 春雨滋润
  return 1;
}

// 当前每秒自动产出
function rates() {
  const tm = calcTime(run.t);
  const out = { food:0, wood:0, stone:0, sci:0 };
  for (const b of BUILDINGS) {
    const n = cnt(b.id); if (!n) continue;
    const sm = seasonMulFor(b, tm.season);
    for (const k in b.out) out[k] += b.out[k] * n * sm;
  }
  const m = prodMul();
  for (const k in out) out[k] *= m;
  return out;
}

// 食物腐烂(每秒损失量)
function spoilRate() {
  const mul = Math.max(Math.pow(0.8, cnt("icebox")), 0.15);
  return run.res.food * (0.04 / DAY_LEN) * mul;
}

/* ===== 点击采集 ===== */
function clickPower() {
  let mul = 1;
  if (has("axe2")) mul *= 2;
  if (has("goldtools")) mul *= 3;
  mul *= 1 + 0.25 * lv("clickpow");
  if (has("nightking") && run.sanity < 25) mul *= 1.5;
  const tm = calcTime(run.t);
  if (tm.isNight && !has("lantern")) mul *= 0.5;
  const p = { food: 2 * mul, wood: 1.2 * mul };
  if (has("pickaxe")) p.stone = 0.4 * mul;
  return p;
}
function gain(o) {
  for (const k in o) { if (!o[k]) continue; run.res[k] += o[k]; run.life[k] += o[k]; }
}

/* ===== 购买 ===== */
function buildCost(b) {
  const n = cnt(b.id), c = {};
  for (const k in b.cost) c[k] = Math.ceil(b.cost[k] * Math.pow(COST_GROWTH, n));
  return c;
}
function canAfford(c) { for (const k in c) if (run.res[k] < c[k]) return false; return true; }
function buildingAvailable(b) {
  if (b.needTech && !has(b.needTech)) return false;
  if (b.needBuild && !cnt(b.needBuild)) return false;
  return true;
}
function buyBuilding(id) {
  const b = BUILDINGS.find(x => x.id === id);
  const c = buildCost(b);
  if (!buildingAvailable(b) || !canAfford(c) || run.dead) return;
  for (const k in c) run.res[k] -= c[k];
  run.counts[id] = cnt(id) + 1;
  log(`建成了${b.name}(共 ${run.counts[id]} 座)`, "good");
  markShopDirty(); renderAll();
}
function techUnlocked(t) {
  return t.tier === 1 ? cnt("scimach") > 0 : cnt("alchemy") > 0;
}
function buyTech(id) {
  const t = TECHS.find(x => x.id === id);
  if (has(id) || !techUnlocked(t) || run.res.sci < t.cost || run.dead) return;
  run.res.sci -= t.cost;
  run.techs[id] = true;
  log(`研究完成:${t.icon}${t.name}`, "good");
  markShopDirty(); renderAll();
}
function buyEmber(id) {
  const u = EMBER_UPS.find(x => x.id === id);
  const l = lv(id);
  if (l >= u.max || meta.embers < u.cost(l)) return;
  meta.embers -= u.cost(l);
  meta.ups[id] = l + 1;
  save(); markShopDirty(); renderAll();
}

/* ===== 战斗数值 ===== */
function defense() {
  let d = cnt("pighouse") * (2 + lv("pigking"));
  if (has("spear")) d += 3;
  if (has("hamblade")) d += 6;
  return d;
}
function dmgTaken(x) { return has("armor") ? x * 0.5 : x; }

/* ===== 篝火 ===== */
function stoke() {
  if (run.res.wood >= 5 && run.fuel < 100) {
    run.res.wood -= 5;
    run.fuel = Math.min(100, run.fuel + 25);
  }
}

/* ===== 日界事件 ===== */
function onNewDay(day) {
  const tm = calcTime((day - 1) * DAY_LEN + 1);
  // 猎犬袭击
  if (day >= run.nextHound) {
    run.nextHound = day + 4 + Math.floor(Math.random() * 3);
    houndWave(day);
    if (run.dead) return;
  }
  // 巨鹿:每年冬季第 8 天
  if (tm.season === 1 && tm.dayOfSeason === 7 && run.bossYearDone !== tm.year) {
    run.bossYearDone = tm.year;
    deerclops(tm.year);
    if (run.dead) return;
  }
  // 夏季自燃
  if (tm.season === 3) wildfireRoll();
  // 猎犬预告
  if (day === run.nextHound - 1) log("远处传来猎犬的嚎叫……明天它们就到。", "omen");
}

function houndWave(day) {
  const totalB = Object.values(run.counts).reduce((a, b) => a + b, 0);
  const threat = Math.round(3 + day * 0.35 + totalB * 0.15);
  const d = defense();
  if (d >= threat) {
    const loot = 10 + day * 2;
    gain({ food: loot });
    log(`猎犬来袭(威胁 ${threat})!营地击退了狗群,捡到 ${loot} 份怪物肉。`, "good");
  } else {
    const dmg = dmgTaken((threat - d) * 4);
    run.health -= dmg;
    for (const k in run.res) run.res[k] *= 0.92;
    log(`猎犬来袭(威胁 ${threat} > 战力 ${d})!营地被撕咬:生命 -${Math.round(dmg)},物资损失 8%。`, "bad");
    if (run.health <= 0) die("被猎犬撕碎");
  }
}

function deerclops(year) {
  const power = 12 + year * 10;
  const d = defense();
  if (d >= power) {
    run.bossKills++;
    gain({ food: 150 + year * 50, sci: 30 });
    log(`❄ 巨鹿(威胁 ${power})踏雪而来——你的长矛与猪人把它放倒了!战利品:大量鹿肉 + 30 科学。`, "good");
  } else {
    const dmg = dmgTaken(35);
    run.health -= dmg;
    const destroyed = [];
    for (let i = 0; i < 2; i++) {
      const owned = BUILDINGS.filter(b => cnt(b.id) > 0);
      if (!owned.length) break;
      const b = owned[Math.floor(Math.random() * owned.length)];
      run.counts[b.id]--;
      destroyed.push(b.name);
    }
    log(`❄ 巨鹿(威胁 ${power} > 战力 ${d})踩碎了你的营地!生命 -${Math.round(dmg)}` +
        (destroyed.length ? `,损毁:${destroyed.join("、")}` : "") + "。", "bad");
    if (run.health <= 0) die("被巨鹿踩扁");
  }
}

function wildfireRoll() {
  const p = 0.30 * Math.pow(0.7, cnt("rod"));
  if (Math.random() >= p) return;
  const owned = BUILDINGS.filter(b => cnt(b.id) > 0 && b.id !== "rod");
  if (!owned.length) return;
  const b = owned[Math.floor(Math.random() * owned.length)];
  run.counts[b.id]--;
  log(`☀ 酷暑自燃!一座${b.name}化为灰烬。(避雷针可降低概率)`, "bad");
  markShopDirty();
}

/* ===== 主模拟循环 ===== */
function tick(dt) {
  if (run.dead) return;
  run.t += dt;
  const tm = calcTime(run.t);
  run.day = tm.day;
  run.phase = tm.isNight ? "night" : "day";
  const winter = tm.season === 1, spring = tm.season === 2;

  // 季节横幅
  const sName = SEASONS[tm.season].name;
  if (run.seasonSeen !== sName) {
    run.seasonSeen = sName;
    seasonBanner(tm.season);
  }

  // 日界事件
  if (run.lastDay === undefined) run.lastDay = tm.day;
  while (run.lastDay < tm.day) {
    run.lastDay++;
    onNewDay(run.lastDay);
    if (run.dead) return;
  }

  // 自动产出
  const r = rates();
  for (const k in r) { run.res[k] += r[k] * dt; run.life[k] += r[k] * dt; }

  // 食物腐烂
  run.res.food = Math.max(0, run.res.food - spoilRate() * dt);

  // 篝火燃烧
  let burn = 0;
  if (tm.isNight) burn = 1.2;
  else if (winter) burn = 0.9;
  else if (run.fuel > 0) burn = 0.25;
  burn *= 1 - 0.15 * lv("emberfuel");
  run.fuel = Math.max(0, run.fuel - burn * dt);
  if (run.autoStoke && run.fuel < 40) stoke();
  const dark = tm.isNight && run.fuel <= 0;
  const cold = winter && run.fuel <= 0;

  // 饥饿与自动进食
  let hDrain = 100 / (3 * DAY_LEN);
  if (winter) hDrain *= (has("wintercoat") || has("furcoat")) ? 1.175 : 1.35;
  hDrain *= 1 - 0.08 * lv("fat");
  run.hunger = Math.max(0, run.hunger - hDrain * dt);
  if (run.hunger < 95 && run.res.food > 0) {
    const eff = has("cooking") ? 1.6 : 1;
    const eat = Math.min(run.res.food, (100 - run.hunger) / eff, 3 * dt);
    run.res.food -= eat;
    run.hunger = Math.min(100, run.hunger + eat * eff);
  }

  // 理智
  let sD = 0;
  if (dark) sD += has("lantern") ? 0.4 : 0.8;
  else if (tm.isNight) sD -= 0.3;      // 篝火边取暖
  else sD -= 0.1;                       // 白日恢复
  if (spring) sD += 0.2;                // 春雨绵绵
  if (winter) sD += 0.05;
  if (sD > 0) sD *= 1 - 0.08 * lv("fat");
  run.sanity = Math.max(0, Math.min(100, run.sanity - sD * dt));

  // 生命:环境伤害
  if (run.hunger <= 0) run.health -= 1.2 * dt;
  if (cold) {
    let f = 1.5;
    if (has("furcoat")) f *= 0.15;
    else if (has("wintercoat")) f *= 0.5;
    run.health -= f * dt;
  }
  // 查理:黑暗中的杀手
  if (dark) {
    run.charlieCd = (run.charlieCd || 0) - dt;
    if (run.charlieCd <= 0) {
      run.charlieCd = 6;
      run.health -= dmgTaken(10);
      log("黑暗中有什么东西抓伤了你!快生火!", "bad");
    }
  } else run.charlieCd = 2;
  // 暗影生物
  if (run.sanity < 25) {
    run.shadowCd -= dt;
    if (run.shadowCd <= 0) {
      run.shadowCd = 9;
      if (has("nightking")) log("暗影在你耳边低语,但已伤不了你。", "omen");
      else { run.health -= dmgTaken(6); log("理智崩坏:暗影生物袭击了你!", "bad"); }
    }
  } else run.shadowCd = 4;
  // 缓慢回复
  if (run.hunger > 60 && run.sanity > 60) run.health = Math.min(100, run.health + 0.08 * dt);

  if (run.health <= 0) {
    let cause = "伤重不治";
    if (run.hunger <= 0) cause = "饿死了";
    else if (cold) cause = "冻僵在冬夜里";
    else if (dark) cause = "被黑暗吞噬";
    else if (run.sanity < 25) cause = "被暗影撕碎";
    die(cause);
  }
}

/* ===== 死亡与转生 ===== */
function emberGain() {
  const total = run.life.food + run.life.wood + run.life.stone + run.life.sci;
  return Math.max(1, Math.floor(run.day * 1.5 + run.bossKills * 25 + Math.sqrt(total) * 0.8));
}
function die(cause) {
  if (run.dead) return;
  run.dead = true;
  run.health = 0;
  run.deathCause = cause;
  save();
  showDeath(cause);
}
function rebirth() {
  const g = emberGain();
  meta.embers += g;
  meta.totalEmbers += g;
  meta.rebirths++;
  meta.bestDays = Math.max(meta.bestDays, run.day);
  run = defaultRun();
  save();
  document.getElementById("deathOverlay").classList.add("hidden");
  log(`✦ 第 ${meta.rebirths} 次转生:余烬在灰里重新亮起。这一次,走得更远。`, "omen");
  markShopDirty(); renderAll();
}

/* ===== 离线收益 ===== */
function applyOffline(dtReal) {
  if (dtReal < 60 || run.dead) return null;
  const dt = Math.min(dtReal, OFFLINE_CAP);
  const rate = [0.5, 0.75, 1][lv("hourglass")];
  const r = rates();
  const g = {};
  let any = false;
  for (const k in r) {
    g[k] = r[k] * dt * rate;
    if (g[k] > 0.5) any = true;
    run.res[k] += g[k];
    run.life[k] += g[k];
  }
  return any ? { dt, g, rate } : null;
}

/* ============================================================
   UI:渲染 / 场景 / 交互
   ============================================================ */
const $ = id => document.getElementById(id);
const RES_NAMES = { food:"食物", wood:"木", stone:"石", sci:"科学" };
let shopDirty = true;
function markShopDirty() { shopDirty = true; }

/* ===== 日志 ===== */
function log(msg, cls) {
  const ul = $("log");
  const li = document.createElement("li");
  if (cls) li.className = cls;
  li.innerHTML = `<span class="d">第${run ? run.day : 1}天</span><b>${msg}</b>`;
  ul.insertBefore(li, ul.firstChild);
  while (ul.children.length > 50) ul.removeChild(ul.lastChild);
}

/* ===== 场景 ===== */
function buildScene() {
  let stars = "";
  for (let i = 0; i < 26; i++) {
    stars += `<circle cx="${(Math.random()*450+5).toFixed(0)}" cy="${(Math.random()*150+8).toFixed(0)}" r="${(Math.random()*0.9+0.5).toFixed(1)}" fill="#cdd3e0"/>`;
  }
  let snow = "";
  for (let i = 0; i < 34; i++) {
    snow += `<circle cx="${(Math.random()*456+2).toFixed(0)}" cy="${(Math.random()*270+5).toFixed(0)}" r="${(Math.random()*1.1+0.9).toFixed(1)}" fill="#dfe6f0"/>`;
  }
  const pine = (x, y, s, fill) =>
    `<g fill="${fill}"><rect x="${x-3*s}" y="${y-14*s}" width="${6*s}" height="${16*s}" fill="#241a14"/>` +
    `<polygon points="${x},${y-78*s} ${x-26*s},${y-30*s} ${x+26*s},${y-30*s}"/>` +
    `<polygon points="${x},${y-58*s} ${x-32*s},${y-10*s} ${x+32*s},${y-10*s}"/></g>`;
  $("sceneSvg").innerHTML = `
    <style>
      #svgFlame{transform-box:fill-box;transform-origin:50% 100%;transition:transform .18s ease-out}
      #svgSky{transition:fill 2s}
      .snowa{animation:snowdrift 2.6s ease-in-out infinite alternate}
      .snowb{animation:snowdrift 3.8s ease-in-out infinite alternate-reverse}
      @keyframes snowdrift{from{transform:translateY(-9px)}to{transform:translateY(11px)}}
    </style>
    <defs>
      <radialGradient id="fireGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#e08830" stop-opacity=".5"/>
        <stop offset="100%" stop-color="#e08830" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect id="svgSky" x="0" y="0" width="460" height="234" fill="#3a3046"/>
    <g id="svgStars" opacity="0">${stars}</g>
    <circle id="svgSun" cx="80" cy="70" r="20" fill="#e8c15a"/>
    <circle id="svgMoon" cx="380" cy="60" r="14" fill="#cdd3e0" opacity="0"/>
    <path d="M0 234 Q 120 200 240 226 T 460 218 L 460 234 Z" fill="#151020"/>
    <rect y="232" width="460" height="68" fill="#191320"/>
    ${pine(58, 232, 1.05, "#171221")}${pine(110, 232, 0.7, "#1b1526")}
    ${pine(392, 232, 1.15, "#171221")}${pine(345, 232, 0.6, "#1b1526")}
    <circle id="svgGlow" cx="230" cy="238" r="58" fill="url(#fireGlow)" opacity="0"/>
    <g>
      <circle cx="206" cy="252" r="4" fill="#3c3a40"/><circle cx="254" cy="252" r="4" fill="#3c3a40"/>
      <circle cx="214" cy="256" r="4" fill="#34323a"/><circle cx="246" cy="256" r="4" fill="#34323a"/>
      <rect x="212" y="245" width="36" height="6" rx="3" transform="rotate(16 230 248)" fill="#4a3320"/>
      <rect x="212" y="245" width="36" height="6" rx="3" transform="rotate(-14 230 248)" fill="#553b25"/>
    </g>
    <g id="svgFlame" opacity="0">
      <path d="M230 250 C 217 236 221 219 230 204 C 239 219 243 236 230 250" fill="#e08830"/>
      <path d="M230 248 C 223 238 225 227 230 217 C 235 227 237 238 230 248" fill="#f2c14e"/>
    </g>
    <g id="svgSnow" opacity="0"><g class="snowa">${snow}</g><g class="snowb">${snow}</g></g>`;
}

function renderScene(tm) {
  const sun = $("svgSun"), moon = $("svgMoon");
  if (!tm.isNight) {
    const p = Math.min(tm.tod / DAY_PHASE, 1);
    sun.setAttribute("cx", 40 + 380 * p);
    sun.setAttribute("cy", 120 - Math.sin(p * Math.PI) * 75);
    sun.setAttribute("opacity", "1"); moon.setAttribute("opacity", "0");
  } else {
    const p = (tm.tod - DAY_PHASE) / (DAY_LEN - DAY_PHASE);
    moon.setAttribute("cx", 40 + 380 * p);
    moon.setAttribute("cy", 95 - Math.sin(p * Math.PI) * 45);
    moon.setAttribute("opacity", "1"); sun.setAttribute("opacity", "0");
  }
  $("svgStars").setAttribute("opacity", tm.isNight ? "0.9" : "0");
  const skies = ["#3a3046", "#3d4657", "#34424c", "#4a3a2c"];
  $("svgSky").setAttribute("fill", tm.isNight ? "#0b0918" : skies[tm.season]);
  $("svgSnow").setAttribute("opacity", tm.season === 1 ? "1" : "0");
  const flame = $("svgFlame");
  if (run.fuel > 0) {
    const s = 0.45 + (run.fuel / 100) * 0.75 + Math.random() * 0.08;
    flame.style.transform = `scale(${s.toFixed(3)})`;
    flame.setAttribute("opacity", "1");
    $("svgGlow").setAttribute("opacity", (0.45 + (run.fuel / 100) * 0.3 + Math.random() * 0.15).toFixed(2));
  } else {
    flame.setAttribute("opacity", "0");
    $("svgGlow").setAttribute("opacity", "0");
  }
  let tint = "transparent";
  if (tm.isNight) tint = "rgba(16,12,40,.45)";
  else if (tm.season === 1) tint = "rgba(200,215,240,.18)";
  else if (tm.season === 3) tint = "rgba(235,170,110,.14)";
  $("sceneTint").style.background = tint;
}

function seasonBanner(s) {
  const lines = ["🍂 秋 · 丰饶而短暂", "❄ 冬 · 熬过去", "🌧 春 · 雨水与新芽", "☀ 夏 · 烈日灼心"];
  const warns = [
    "秋天是准备的季节。囤木头,建营地。",
    "冬天来了:浆果与农场休眠,寒冷啃噬无火之人。第 8 个冬日,巨鹿会来。",
    "春雨绵绵,产出加成,但理智被雨声一点点泡软。",
    "酷暑降临:营地随时可能自燃,避雷针能救命。",
  ];
  const b = $("seasonBanner");
  b.textContent = lines[s];
  b.classList.add("show");
  setTimeout(() => b.classList.remove("show"), 3200);
  log(warns[s], "omen");
}

/* ===== 点击浮字 ===== */
function spawnFloater(x, y, p) {
  const el = document.createElement("div");
  el.className = "floater";
  const parts = [];
  if (p.food) parts.push(`+${fmt(p.food)}🥩`);
  if (p.wood) parts.push(`+${fmt(p.wood)}🪵`);
  if (p.stone) parts.push(`+${fmt(p.stone)}🪨`);
  el.textContent = parts.join(" ");
  el.style.left = Math.max(4, x - 34 + Math.random() * 28) + "px";
  el.style.top = Math.max(4, y - 24) + "px";
  $("floaters").appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

/* ===== 商店(建筑/科技/余烬) ===== */
function costHtml(c) {
  return Object.entries(c)
    .map(([k, v]) => `<span data-res="${k}" data-need="${v}">${fmt(v)} ${RES_NAMES[k]}</span>`)
    .join(" · ");
}
function buildShopDOM() {
  // 建筑
  $("buildList").innerHTML = "";
  for (const b of BUILDINGS) {
    if (!buildingAvailable(b) && !cnt(b.id)) continue;
    const li = document.createElement("li");
    li.className = "card";
    li.dataset.id = b.id;
    const extra = b.def ? `(战力 +${b.def})` : "";
    li.innerHTML = `<div class="c-head"><span class="c-icon">${b.icon}</span>` +
      `<span class="c-name">${b.name}</span><span class="c-count num">×${cnt(b.id)}</span></div>` +
      `<div class="c-desc">${b.desc}${extra}</div>` +
      `<div class="c-cost">${costHtml(buildCost(b))}</div>`;
    li.addEventListener("click", () => buyBuilding(b.id));
    $("buildList").appendChild(li);
  }
  // 科技
  const tl = $("techList");
  tl.innerHTML = "";
  if (!cnt("scimach")) {
    tl.innerHTML = `<li class="footnote">先在「营地建设」里造一台 ⚙ 科学机器,才谈得上科学。</li>`;
  } else {
    for (const t of TECHS) {
      if (t.tier === 2 && !cnt("alchemy")) continue;
      const li = document.createElement("li");
      li.className = "card" + (has(t.id) ? " bought" : "");
      li.dataset.id = t.id;
      li.innerHTML = `<div class="c-head"><span class="c-icon">${t.icon}</span>` +
        `<span class="c-name">${t.name}</span>` +
        `<span class="c-count num">${has(t.id) ? "✓ 已研究" : ""}</span></div>` +
        `<div class="c-desc">${t.desc}</div>` +
        (has(t.id) ? "" : `<div class="c-cost"><span data-res="sci" data-need="${t.cost}">${t.cost} 科学</span></div>`);
      if (!has(t.id)) li.addEventListener("click", () => buyTech(t.id));
      tl.appendChild(li);
    }
    if (!cnt("alchemy")) tl.insertAdjacentHTML("beforeend",
      `<li class="footnote">建一台 🔮 炼金引擎可解锁二阶科技。</li>`);
  }
  // 余烬
  $("emberList").innerHTML = "";
  for (const u of EMBER_UPS) {
    const l = lv(u.id), maxed = l >= u.max;
    const li = document.createElement("li");
    li.className = "card" + (maxed ? " owned-max" : "");
    li.dataset.id = u.id;
    li.innerHTML = `<div class="c-head"><span class="c-icon">${u.icon}</span>` +
      `<span class="c-name">${u.name}</span><span class="c-count lv num">Lv ${l}/${u.max}</span></div>` +
      `<div class="c-desc">${u.desc}</div>` +
      (maxed ? "" : `<div class="c-cost"><span data-res="ember" data-need="${u.cost(l)}">✦ ${u.cost(l)} 余烬</span></div>`);
    if (!maxed) li.addEventListener("click", () => buyEmber(u.id));
    $("emberList").appendChild(li);
  }
}
function updateShopState() {
  for (const li of $("buildList").children) {
    const b = BUILDINGS.find(x => x.id === li.dataset.id);
    if (!b) continue;
    const c = buildCost(b);
    li.classList.toggle("cant", !canAfford(c));
    li.classList.toggle("seasonal-off", !!b.winterOff && calcTime(run.t).season === 1);
    for (const sp of li.querySelectorAll(".c-cost span")) {
      sp.classList.toggle("no", run.res[sp.dataset.res] < +sp.dataset.need);
    }
  }
  for (const li of $("techList").querySelectorAll(".card:not(.bought)")) {
    const t = TECHS.find(x => x.id === li.dataset.id);
    if (!t) continue;
    li.classList.toggle("cant", run.res.sci < t.cost);
    const sp = li.querySelector(".c-cost span");
    if (sp) sp.classList.toggle("no", run.res.sci < t.cost);
  }
  for (const li of $("emberList").querySelectorAll(".card:not(.owned-max)")) {
    const u = EMBER_UPS.find(x => x.id === li.dataset.id);
    if (!u) continue;
    li.classList.toggle("cant", meta.embers < u.cost(lv(u.id)));
  }
}

/* ===== 常规刷新 ===== */
function setMeter(id, val) {
  const m = $(id);
  m.querySelector(".m-fill").style.width = Math.max(0, Math.min(100, val)) + "%";
  m.querySelector(".m-val").textContent = Math.ceil(val);
  m.classList.toggle("low", val < 25 && val > 0 || (id === "meterFire" && val <= 0));
}
function setRes(id, val, rate) {
  const li = $(id);
  li.querySelector(".r-val").textContent = fmt(val);
  li.querySelector(".r-rate").textContent = fmtRate(rate);
}
function foodUpkeep() {
  const tm = calcTime(run.t);
  let h = 100 / (3 * DAY_LEN);
  if (tm.season === 1) h *= (has("wintercoat") || has("furcoat")) ? 1.175 : 1.35;
  h *= 1 - 0.08 * lv("fat");
  return h / (has("cooking") ? 1.6 : 1);
}
function renderFast() {
  const tm = calcTime(run.t);
  // 顶栏
  $("seasonIcon").textContent = SEASONS[tm.season].icon;
  $("dayLabel").textContent = `第 ${tm.day} 天`;
  $("phaseLabel").textContent = tm.isNight ? "黑夜" : "白昼";
  $("phaseLabel").classList.toggle("night", tm.isNight);
  setMeter("meterHunger", run.hunger);
  setMeter("meterSanity", run.sanity);
  setMeter("meterHealth", run.health);
  setMeter("meterFire", run.fuel);
  // 资源
  const r = rates();
  const wUpkeep = run.autoStoke ? (tm.isNight ? 1.2 : tm.season === 1 ? 0.9 : 0.25) * (1 - 0.15 * lv("emberfuel")) * 0.2 : 0;
  setRes("resFood", run.res.food, r.food - foodUpkeep() - spoilRate());
  setRes("resWood", run.res.wood, r.wood - wUpkeep);
  setRes("resStone", run.res.stone, r.stone);
  setRes("resSci", run.res.sci, r.sci);
  $("resStone").classList.toggle("locked", !has("pickaxe") && run.res.stone <= 0);
  $("resSci").classList.toggle("locked", !cnt("scimach") && run.res.sci <= 0);
  $("spoilNote").textContent = run.res.food > 5
    ? `食物正在腐烂:-${spoilRate().toFixed(1)}/s${cnt("icebox") ? "(冰箱运转中)" : "(冰箱可减缓)"}` : "";
  // 篝火 / 防御
  $("btnStoke").disabled = run.res.wood < 5 || run.fuel >= 100;
  $("defVal").textContent = defense();
  const hd = run.nextHound - tm.day;
  $("houndNote").textContent = hd <= 0 ? "猎犬就在今天!" :
    hd === 1 ? "猎犬的嚎叫近在咫尺——明天!" : `猎犬约 ${hd} 天后来袭。战力足够即可反杀得利。`;
  // 余烬页签
  $("emberCount").textContent = meta.embers;
  $("emberIntro").textContent =
    `第 ${meta.rebirths + 1} 次人生 · 历史最佳 ${meta.bestDays} 天 · 死亡不是终点,余烬会留存。`;
  $("btnDark").classList.toggle("hidden", run.day < 10 || run.dead);
  renderScene(tm);
  if (shopDirty) { buildShopDOM(); shopDirty = false; }
  updateShopState();
}
function renderAll() {
  $("autoStoke").checked = run.autoStoke;
  renderFast();
}

/* ===== 覆盖层 ===== */
function showDeath(cause) {
  $("deathCause").textContent = cause ? `死因:${cause}。` : "";
  const totalB = Object.values(run.counts).reduce((a, b) => a + b, 0);
  $("deathStats").innerHTML =
    `<li><span>存活天数</span><b>${run.day} 天</b></li>` +
    `<li><span>建筑总数</span><b>${totalB}</b></li>` +
    `<li><span>已研究科技</span><b>${Object.keys(run.techs).length}</b></li>` +
    `<li><span>击杀巨鹿</span><b>${run.bossKills}</b></li>` +
    `<li><span>历史最佳</span><b>${Math.max(meta.bestDays, run.day)} 天</b></li>`;
  $("deathEmbers").textContent = emberGain();
  $("deathOverlay").classList.remove("hidden");
}
function showOffline(off) {
  const h = Math.floor(off.dt / 3600), m = Math.floor((off.dt % 3600) / 60);
  const names = { food:"食物", wood:"木材", stone:"石料", sci:"科学" };
  const parts = [];
  for (const k in off.g) if (off.g[k] >= 1) parts.push(`${names[k]} +${fmt(off.g[k])}`);
  $("offlineDetail").innerHTML =
    `营地在你沉睡的 ${h ? h + " 小时 " : ""}${m} 分钟里以 ${Math.round(off.rate * 100)}% 效率运转(时间与三槽冻结):<br>` +
    (parts.join(" · ") || "几乎一无所获。");
  $("offlineOverlay").classList.remove("hidden");
}

/* ===== 绑定 ===== */
function bindUI() {
  $("clickArea").addEventListener("click", e => {
    if (run.dead) return;
    const p = clickPower();
    gain(p);
    const rect = $("scene").getBoundingClientRect();
    spawnFloater(e.clientX - rect.left, e.clientY - rect.top, p);
  });
  $("btnStoke").addEventListener("click", stoke);
  $("autoStoke").addEventListener("change", e => { run.autoStoke = e.target.checked; });
  document.querySelectorAll("#tabs .tab").forEach(t => t.addEventListener("click", () => {
    document.querySelectorAll("#tabs .tab").forEach(x => x.classList.toggle("active", x === t));
    $("paneBuild").classList.toggle("hidden", t.dataset.tab !== "build");
    $("paneTech").classList.toggle("hidden", t.dataset.tab !== "tech");
    $("paneEmber").classList.toggle("hidden", t.dataset.tab !== "ember");
  }));
  $("btnDark").addEventListener("click", () => {
    if (confirm("确定走入黑暗?本轮立刻结束,按当前进度结算余烬。")) die("走入了黑暗,义无反顾");
  });
  $("btnRebirth").addEventListener("click", rebirth);
  $("btnOfflineOk").addEventListener("click", () => $("offlineOverlay").classList.add("hidden"));
}

/* ===== 启动 ===== */
let tickTs = Date.now();
function boot() {
  const s = load();
  if (s && s.run) {
    meta = Object.assign(meta, s.meta || {});
    run = s.run;
    const off = applyOffline((Date.now() - (s.lastTs || Date.now())) / 1000);
    if (off) showOffline(off);
  } else {
    run = defaultRun();
  }
  buildScene();
  bindUI();
  if (!s) log("你在陌生的荒野中醒来。夜幕将至——采集,生火,活下去。", "omen");
  renderAll();
  if (run.dead) showDeath(run.deathCause);
  tickTs = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min((now - tickTs) / 1000, 2);
    tickTs = now;
    tick(dt);
    renderFast();
  }, 200);
  setInterval(save, 10000);
  window.addEventListener("beforeunload", save);
}
boot();

// 调试句柄(控制台可用)
window._sc = {
  get run() { return run; },
  get meta() { return meta; },
  buyBuilding, buyTech, buyEmber, die, rebirth, save, applyOffline, showOffline,
  hardReset() { noSave = true; localStorage.removeItem(SAVE_KEY); location.reload(); },
};
