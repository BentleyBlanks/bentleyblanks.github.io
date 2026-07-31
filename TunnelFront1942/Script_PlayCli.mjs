#!/usr/bin/env node
// 《地下长城 · 冀中1942》 —— 审查 Agent 完整游玩接口（AGENTS.md §7.3）。
// 子命令：
//   new  --level A1 --seed 3 --save /tmp/g.json [--carry default|full|<存档/继承档>]   开局 + 简报 + ASCII
//   next --save /tmp/a1.json --save-to /tmp/a2.json [--seed 3]   带着上一幕的战果开下一幕（战役串联）
//   carry --save /tmp/a1.json [--out /tmp/carry.json]            查看/导出一份终局存档的继承档
//   show --save /tmp/g.json [--layer surface|under|both]
//   legal --save /tmp/g.json [--unit u1]
//   act  --save /tmp/g.json --json '{"type":"Move",...}'
//   end  --save /tmp/g.json                          敌阶段 + 结算全播报
//   run  --level A1 --seed 3 --bot Skilled           bot 整局 → 总结 JSON
//   fixture --level A1 --seed 3 --turns 6 --write [--out 路径]           （生成渲染夹具，会覆写文件）
// 仅本文件允许触碰 fs/process；引擎模块保持纯逻辑。

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { CreateGame, SerializeState, DeserializeState, GetBriefing, GrainTotal, PopTotal, WoundedTotal,
  ExtractCarry } from "./Script_State.mjs";
import { DeriveView } from "./Script_Visibility.mjs";
import { LegalActions, PerformAction } from "./Script_Actions.mjs";
import { EndTurn } from "./Script_Turn.mjs";
import {
  RenderAsciiMap, GrainLines, OpeningLines, LandmarkLines, IntentLines, ObjectiveLine,
  UnitLines, MedalLines, TelegraphText, ActionKind, actionKindNames, ActionHints, ActionNotes,
  CivLines, ActCardLines, ObjectiveProgressLines, DebriefLines, TunnelLinkLines,
  TunnelLinkReport, VentSummary, CarryLines, CarryReport,
  CivDropSummary, CivShelterLines, MoveCostNote, DigNote,
} from "./Script_AsciiMap.mjs";
import { RunBotGame, botNames } from "./Script_Bots.mjs";
import { campaignOrder, levelDefinitions, BuildFullCarry, CarryWeight, NextLevelId } from "./Data_Levels.mjs";
import { TEXT, CFG } from "./Data_Rules.mjs";

/**
 * 关卡 ID 校验：以前 `--level L1` 会静默回落到 A1（别名表里还留着 L1→A1、L2→A5），
 * 于是照着旧 README 打的人一路以为自己在打 L1。现在未知/停用的 ID 一律报错退出。
 */
function ResolveLevelId(raw) {
  const id = raw === undefined || raw === true ? "A1" : String(raw);
  if (campaignOrder.includes(id) && levelDefinitions[id]) return id;
  const names = campaignOrder.map((key) => `${key}《${levelDefinitions[key].name}》`).join("、");
  if (id === "L1" || id === "L2") {
    Die(`关卡 ID「${id}」已停用：本作是五幕战役 ${names}。`
      + `（旧 L1 相当于 ${id === "L1" ? "A1《单口洞》" : "A5《反扫荡》"}，但请直接写新 ID，别再用别名。）`);
  }
  Die(`未知关卡「${id}」。可用关卡：${names}`);
  return id;
}

function ParseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) { args[key] = next; i += 1; }
      else args[key] = true;
    } else args._.push(argv[i]);
  }
  return args;
}

/**
 * 每条子命令认哪些参数（R6 P0-1）。
 * 以前任何 `--乱写` 都被**静默吞掉**——`--from <A1终局存档>` 与 `--bogusflag` 一个待遇，
 * 于是「我明明接上了上一幕」这种误会没有任何一处会报错。现在未知参数一律报错退出。
 */
const commandFlags = {
  new: ["level", "seed", "save", "layer", "carry"],
  next: ["save", "save-to", "seed", "level", "layer", "carry"],
  carry: ["save", "out"],
  show: ["save", "layer"],
  legal: ["save", "unit", "json", "raw"],
  act: ["save", "json", "layer"],
  end: ["save", "layer"],
  run: ["level", "seed", "bot", "verbose", "carry", "save"],
  fixture: ["level", "seed", "turns", "out", "write", "bot"],
};

function CheckFlags(command, args) {
  const allowed = commandFlags[command] || [];
  const unknown = Object.keys(args).filter((key) => key !== "_" && !allowed.includes(key));
  if (!unknown.length) return;
  Die(`${command} 不认识这些参数：${unknown.map((key) => `--${key}`).join(" ")}\n`
    + `        ${command} 认的参数只有：${allowed.map((key) => `--${key}`).join(" ")}\n`
    + "        （以前未知参数被静默忽略，于是 `--from <上一幕存档>` 看着像生效了其实什么也没做；\n"
    + "          战役串联现在用 `next --save <上一幕存档> --save-to <新存档>`，或 `new --carry <存档>`。）");
}

function LoadSave(path) {
  if (!path) Die("缺少 --save 存档路径");
  return DeserializeState(readFileSync(path, "utf8"));
}

function WriteSave(path, state) {
  writeFileSync(path, SerializeState(state));
}

function Die(message) {
  console.error(`[错误] ${message}`);
  process.exit(1);
}

function PrintEvents(events) {
  const visible = (events || []).filter((event) => event.visible !== false);
  if (!visible.length) { console.log("（本步无可见事件）"); return; }
  for (const event of visible) {
    console.log(`  · T${event.turn} ${event.text}${event.hex ? `（${event.hex}${event.layer === "under" ? " 地下" : ""}）` : ""}`);
  }
}

function PrintStatus(state, view) {
  const derived = view || DeriveView(state);
  const wave = derived.wave;
  console.log(`【第${derived.act.act}幕《${derived.act.name}》】${derived.act.subtitle}`);
  const objective = ObjectiveLine(state);
  if (objective) console.log(`目标：${objective}`);
  console.log("幕目标进度：");
  for (const line of ObjectiveProgressLines(state, derived)) console.log(line);
  console.log(`回合 T${derived.turn}/${wave.hardEndTurn} ｜ 阶段：${derived.phase} ｜ 波次：${wave.statusText}`
    + (wave.status !== "quiet" ? ` ｜ 敌行动力池：${wave.pool}` : "")
    + (wave.smokeCharges ? ` ｜ 敌烟具：${wave.smokeCharges}` : "")
    + (wave.floodCharges ? ` ｜ 敌水车：${wave.floodCharges}` : ""));
  // 通气孔「需要几个」以前一处都没写（只显示「通气孔 3」），玩家无从知道自己扩网把比例扩坏了。
  const vents = VentSummary(state);
  const links = TunnelLinkReport(state);
  console.log(`弹药 ${derived.resources.ammo}/${CFG.ammoMax}`
    + ` ｜ 地道网 ${derived.network.cells} 格 / ${links.segments.length} 段（最大连通块 ${derived.network.largest}，串起 ${derived.network.villagesLinked} 村）`
    + ` ｜ 未被搜出的口 ${derived.network.liveEntrances}（伪装 ${derived.network.disguised}）`
    + ` ｜ 通气孔 ${vents.have}/需 ${vents.need}`
    + (vents.unknown !== vents.have ? `（未被搜出 ${vents.unknown} 处，勋记按此计）` : "")
    + (links.doors.length ? ` ｜ 隔断门 ${links.doors.length} 道（开 ${links.doorsOpen} / 关 ${links.doorsClosed}）` : " ｜ 隔断门 0 道"));
  // 战役串联的常显一行：这盘网是自己挣的还是系统送的，全程看得见（详版见开局横幅 / CarryLines）
  const carryInfo = CarryReport(state);
  console.log(`本局继承自：${carryInfo.carry ? carryInfo.label
    : carryInfo.act > 1 ? "未记录（续承接口之前的老存档）" : `无（第${carryInfo.act}幕，本幕的战果会带进下一幕）`}`
    + (carryInfo.carry && carryInfo.gaps.length ? ` ｜ 对照满配还欠：${carryInfo.gaps.join("；")}` : ""));
  for (const line of GrainLines(state)) console.log(line);
  for (const line of CivLines(state, derived)) console.log(line);
  const ledgerParts = Object.entries(derived.ledger).filter(([, v]) => v > 0)
    .map(([k, v]) => `${TEXT.ledgerNames[k]}：${v}`);
  console.log(`代价簿：${ledgerParts.length ? ledgerParts.join("；") : "（全空）"}`);
  if (derived.telegraphs.length) {
    console.log("电报预告：");
    for (const telegraph of derived.telegraphs) console.log(`  ! ${TelegraphText(telegraph)}`);
  }
  if (derived.guardrails.length) {
    console.log("待办护栏：");
    for (const guardrail of derived.guardrails) console.log(`  - ${guardrail.text}`);
  }
  if (derived.result) PrintResult(state, derived);
}

/** 终局：三枚勋记逐条列出达成与否与原因（不再只丢一串 ●○ 让人猜）。 */
function PrintResult(state, view) {
  const result = view.result;
  console.log("");
  console.log(`【终局 · 战报归档】${result.won ? "胜" : "负"} ｜ 评定：${result.grade}`
    + ` ｜ 勋记 ${result.medals.filter(Boolean).length}/3 ${result.medals.map((m) => (m ? "●" : "○")).join("")}`);
  console.log("胜负判定：");
  for (const reason of result.reasons) console.log(`  · ${reason}`);
  console.log("勋记逐枚：");
  for (const line of MedalLines(state)) console.log(line);
  const ledgerParts = Object.keys(TEXT.ledgerNames)
    .map((key) => `${TEXT.ledgerNames[key]} ${state.ledger[key] || 0}`);
  console.log(`代价账本（只记损失，不折功劳）：${ledgerParts.join(" ｜ ")}`);
  console.log("");
  for (const line of DebriefLines(state, view)) console.log(line);
}

function PrintUnits(state, view) {
  const derived = view || DeriveView(state);
  console.log("我方单位（每单位每回合只有 1 个主动作）：");
  for (const line of UnitLines(state, derived)) console.log(line);
  if (derived.visibleEnemies.length) {
    console.log("可见敌单位：");
    for (const foe of derived.visibleEnemies) {
      console.log(`  ${foe.id} ${foe.name} ＠${foe.pos}` + (foe.hp !== null && foe.hp !== undefined ? ` HP${foe.hp}` : ""));
    }
  }
  if (derived.ghosts.length) {
    console.log("敌踪虚影（最后目击）：" + derived.ghosts.map((ghost) => `${ghost.type}＠${ghost.pos}(T${ghost.turn})`).join("、"));
  }
}

function ShowAll(state, layer) {
  const view = DeriveView(state);
  PrintStatus(state, view);
  console.log("");
  console.log(RenderAsciiMap(state, { layer: layer || "both", view }));
  console.log("");
  console.log("关键地点：");
  for (const line of LandmarkLines(state)) console.log(line);
  console.log("地道口一览（暴露豆全程明牌）：");
  for (const line of OpeningLines(state, view)) console.log(line);
  console.log("地道段一览（哪两格通着、哪道门开着——「地道未挖通或门已关闭」的答案都在这里）：");
  for (const line of TunnelLinkLines(state)) console.log(line);
  const intents = IntentLines(state, view);
  console.log("敌纵队意图（只列我方看得见的）：");
  if (intents.length) for (const line of intents) console.log(line);
  else console.log("  （当前没有可见的敌纵队）");
  console.log("");
  PrintUnits(state, view);
}

const rulesCard = [
  "—— 三条最要命的规则（先看这个再下令）——",
  "1. 每个单位每回合只能做 1 个「主动作」（挖/藏粮/转移群众/伏击/隐蔽/攻击/佯动/组织/掩土/破路/塌口/休整），",
  "   用掉后该单位本回合就结束了。移动（Move）与上下地道口（UseEntrance）只花 MP，不占主动作；开关隔断门免费。",
  "2. 动作 JSON 用轴向键 \"q,r\"；ASCII 图用偏移列/行，列号 = q，行号 y = r + floor(q/2)。",
  "3. 地道口不是白给的：要在地下用 DigEntrance 自己开。藏人室有容量上限、储粮洞有容量上限，",
  "   一格地道只能修一种设施，联络员挖掘力为 0（挖不了）。",
];

// ---------------------------------------------------------------------------
// 战役串联（R6 P0-1）
//
// 引擎侧接口早就齐了（ExtractCarry / CreateGame(..., { carry }) / BuildFullCarry / level.carryDefault），
// 但**没有任何一条 CLI 路径用得到它**：`new --level A3` 的盘面与你打没打过前两幕毫无关系，
// A1 的终局复盘却写着「你这一幕挖下的东西会跟着走」。下面三件事把那句话兑现：
//   ① `next --save <上一幕终局存档> --save-to <新存档>`：自动 ExtractCarry 并开下一幕
//   ② `new --carry <存档|继承档 json|full|default>`：显式指定继承源
//   ③ 开局横幅打印「继承自谁 / 继承了什么 / 欠了什么」（CarryLines，网页共用同一份）
// ---------------------------------------------------------------------------

/** 一份存档还是一份继承档？——两种都收，读错了当场报错，不再猜。 */
function ReadCarryFile(path) {
  let text;
  try { text = readFileSync(path, "utf8"); } catch (error) { Die(`读不到 --carry 指定的文件 ${path}：${error.message}`); }
  let doc;
  try { doc = JSON.parse(text); } catch (error) { Die(`--carry 文件不是合法 JSON（${path}）：${error.message}`); }
  if (doc && doc.meta && doc.tunnels && doc.units) {
    const prev = DeserializeState(text);
    if (!prev.result) {
      console.log(`[提示] ${path} 还没打完（没有终局 result），按**当前盘面**折成继承档。`);
    }
    return { carry: ExtractCarry(prev), from: prev };
  }
  if (doc && Array.isArray(doc.cells)) return { carry: doc, from: null };
  Die(`--carry 文件 ${path} 既不是存档（缺 meta/tunnels/units），也不是继承档（缺 cells 数组）。`);
  return null;
}

/** `--carry` 取值：default（关卡默认继承档，缺省）｜full（满配档）｜<存档路径>｜<继承档 json 路径>。 */
function ResolveCarry(raw, levelId) {
  if (raw === undefined) return { carry: null, how: "default" };
  if (raw === true) {
    Die("--carry 要带一个值：default（关卡默认继承档）｜full（满配档）｜<上一幕存档路径>｜<继承档 json 路径>");
  }
  const value = String(raw);
  if (value === "default") return { carry: null, how: "default" };
  if (value === "full") return { carry: BuildFullCarry(levelId), how: "full" };
  const loaded = ReadCarryFile(value);
  return { carry: loaded.carry, how: "file", from: loaded.from, path: value };
}

function PrintCarryBanner(state, extra) {
  console.log("");
  for (const line of CarryLines(state)) console.log(line);
  for (const line of extra || []) console.log(line);
}

function CmdNew(args) {
  const level = ResolveLevelId(args.level);
  const seed = Number(args.seed ?? 3);
  const picked = ResolveCarry(args.carry, level);
  const state = CreateGame(level, seed, { carry: picked.carry });
  console.log(`—— 开局：${state.meta.level} seed=${seed} ——`);
  for (const line of ActCardLines(state)) console.log(line);
  PrintCarryBanner(state, picked.how === "file" && picked.from
    ? [`  （继承源存档：${picked.path}，${picked.from.meta.level} 打到 T${picked.from.meta.turn}`
       + `${picked.from.result ? `，${picked.from.result.won ? "胜" : "负"}·${picked.from.result.grade}` : "，未终局"}）`]
    : picked.how === "full" ? ["  （--carry full：满配继承档，等于「上一幕该挖的都挖到了」的对照上界）"] : []);
  console.log("");
  for (const line of GetBriefing(state)) console.log(line);
  console.log("");
  for (const line of rulesCard) console.log(line);
  console.log("");
  ShowAll(state, args.layer);
  if (args.save) { WriteSave(args.save, state); console.log(`\n[存档] ${args.save}`); }
  else console.log("\n[提示] 没给 --save，本局没有落盘。");
}

/** 战役串联：拿上一幕的**终局存档**直接开下一幕，继承档由 ExtractCarry 自动折出。 */
function CmdNext(args) {
  if (!args.save) Die("next 缺少 --save <上一幕的终局存档>");
  const prev = LoadSave(args.save);
  const prevLevel = prev.meta.level;
  if (!prev.result) {
    Die(`${args.save} 还没打完（${prevLevel} 打到 T${prev.meta.turn}，没有终局 result）。\n`
      + "        先把这一幕打到终局（end 到出战报），或用 `new --carry <这份存档>` 强行按当前盘面开下一幕。");
  }
  const auto = prev.result.nextId || NextLevelId(prevLevel) || null;
  const levelId = args.level !== undefined ? ResolveLevelId(args.level) : auto;
  if (!levelId) {
    Die(`${prevLevel} 是最后一幕，没有下一幕了（战役顺序：${campaignOrder.join(" → ")}）。`);
  }
  if (args.carry !== undefined && args.carry !== true) {
    Die("next 的继承源就是 --save 那份存档；想显式换继承源请改用 `new --level <幕> --carry <...>`。");
  }
  // 落盘参数先校验再动手——不能先把整块报表打完，最后才说「路径不能同名」。
  const out = args["save-to"];
  if (out === true) Die("--save-to 要带一个路径");
  if (out !== undefined && out === args.save) {
    Die("--save-to 不能和 --save 同一个文件（那会把上一幕的战报覆盖掉）");
  }
  const carry = ExtractCarry(prev);
  const seed = args.seed !== undefined ? Number(args.seed) : prev.meta.seed;
  const state = CreateGame(levelId, seed, { carry });
  const weight = CarryWeight(carry);
  console.log(`—— 战役串联：${prevLevel}《${levelDefinitions[prevLevel].name}》`
    + `（${prev.result.won ? "胜" : "负"}·${prev.result.grade}，打到 T${prev.meta.turn}）`
    + ` → ${levelId}《${levelDefinitions[levelId].name}》 seed=${seed} ——`);
  for (const line of ActCardLines(state)) console.log(line);
  PrintCarryBanner(state, [
    `  （上一幕交出来的原始继承档：${weight.cells} 格 / 未封的口 ${weight.entrances} / 伪装 ${weight.disguises}`
    + ` / 洞存粮 ${weight.tunnelGrain} 担 / 弹药 ${weight.ammo} 发；`
    + "落地时按本幕地图过滤，洞存粮按本幕仓容一洞一洞地填，装不下的就是上一幕白藏了）",
  ]);
  console.log("");
  for (const line of GetBriefing(state)) console.log(line);
  console.log("");
  ShowAll(state, args.layer);
  if (out === undefined) {
    console.log("\n[提示] 没给 --save-to，本局没有落盘。加上 --save-to <新存档路径> 才能接着打。");
  } else {
    WriteSave(String(out), state);
    console.log(`\n[存档] ${out}`);
  }
}

/** 看看一份存档折出来的继承档长什么样（也可以 --out 导出，喂给 `new --carry`）。 */
function CmdCarry(args) {
  const state = LoadSave(args.save);
  const carry = ExtractCarry(state);
  const weight = CarryWeight(carry);
  const nextId = (state.result && state.result.nextId) || NextLevelId(state.meta.level) || null;
  console.log(`—— ${state.meta.level}《${levelDefinitions[state.meta.level].name}》T${state.meta.turn} 折出的继承档 ——`);
  console.log(`厚薄：地道 ${weight.cells} 格 ｜ 未封的口 ${weight.entrances} ｜ 伪装 ${weight.disguises}`
    + ` ｜ 洞存粮 ${weight.tunnelGrain} 担 ｜ 弹药 ${weight.ammo} 发`);
  if (nextId) {
    const full = CarryWeight(BuildFullCarry(nextId));
    const def = CarryWeight(levelDefinitions[nextId].carryDefault);
    console.log(`对照下一幕 ${nextId}：默认继承档 ${def.cells} 格 / 口 ${def.entrances} / 伪装 ${def.disguises}`
      + ` / 粮 ${def.tunnelGrain} / 弹 ${def.ammo}　｜　满配档 ${full.cells} 格 / 口 ${full.entrances}`
      + ` / 伪装 ${full.disguises} / 弹 ${full.ammo}`);
    console.log(`接着打：node TunnelFront1942/Script_PlayCli.mjs next --save ${args.save} --save-to <新存档>`);
  } else {
    console.log(`${state.meta.level} 是最后一幕，没有下一幕。`);
  }
  console.log(JSON.stringify(carry, null, 1));
  if (args.out === true) Die("--out 要带一个路径");
  if (args.out) { writeFileSync(String(args.out), JSON.stringify(carry, null, 1)); console.log(`[继承档] 已写入 ${args.out}`); }
}

function CmdShow(args) {
  const state = LoadSave(args.save);
  ShowAll(state, args.layer);
}

/** 一条动作打印成「可以直接抄进 act --json 的那一行」，必要时右边补一句人话。 */
function ActionLine(state, action, links) {
  const json = JSON.stringify(action);
  const unit = action.unit ? state.units[action.unit] : null;
  // R6 P0-3③：Move 以前只报「几步」，不报「到那儿还剩几 MP」——
  // 于是「移动到村格 + UseEntrance 要 2MP 而民兵只有 2MP」这种边界只能靠撞。
  if (action.type === "Move") return `      ${json}   ← ${MoveCostNote(state, action)}`;
  if (action.type === "ToggleDoor") {
    const segment = links.segments.find((entry) => entry.edge === action.edge);
    const now = segment && segment.door === "open" ? "开着" : "关着";
    const next = now === "开着" ? "关上" : "打开";
    return `      ${json}   ← 这道门现在【${now}】，按下去就是【${next}】`
      + (next === "关上" ? "（挡烟、挡水、把气区切成两半）" : "（人和烟水都过得去）");
  }
  if (action.type === "UseEntrance" && action.dive) return `      ${json}   ← 「打了就钻」：该口暴露豆 +2`;
  if (action.type === "UseEntrance") {
    return `      ${json}   ← 上/下地道口，花 1 MP`
      + (unit ? `（现在 ${unit.mp} MP，用后剩 ${unit.mp - 1} MP）` : "");
  }
  // R6 P0-3②：挖掘完人**仍在原格**——审查员为此吃了 4 次「只能向相邻格挖段／只能在所在地道格修设施」。
  if (action.type === "Dig" || action.type === "DigEntrance"
      || action.type === "DigFacility" || action.type === "DigDoor") {
    return `      ${json}   ← ${DigNote(state, action)}`;
  }
  // R6 P0-3①：MoveCivs 以前不说人会进哪个窖——而简报要求「人分两个窖放」。
  if (action.type === "MoveCivs" && unit) {
    const summary = CivDropSummary(state, unit.pos, action);
    const head = action.ground === true ? `挪 ${action.count} 批` : `转 ${action.count} 批入洞`;
    return `      ${json}   ← ${head}${summary ? `：${summary}` : ""}`;
  }
  if (action.type === "GuideCivs") {
    return `      ${json}   ← 带 ${action.count} 批走到 ${action.to}（${action.path.length} 格，单位跟着一起走）`;
  }
  return `      ${json}`;
}

/** 动作按「单位 → 分类」分组打印：一次 143 条无从下手的问题在这里解决。 */
function CmdLegal(args) {
  const state = LoadSave(args.save);
  const unitId = typeof args.unit === "string" ? args.unit : null;
  const actions = LegalActions(state, unitId || undefined);
  if (args.json === true || args.raw === true) {
    console.log(JSON.stringify(actions, null, 1));
    console.log(`（共 ${actions.length} 个合法动作${unitId ? `，单位 ${unitId}` : ""}）`);
    return;
  }
  const links = TunnelLinkReport(state);
  const groups = new Map();
  for (const action of actions) {
    const owner = action.unit || "（全局）";
    if (!groups.has(owner)) groups.set(owner, []);
    groups.get(owner).push(action);
  }
  console.log("合法动作（每单位每回合只能用 1 个「主动作」；移动只花 MP，不占主动作）");
  console.log("下面每一行的 JSON 都是完整的，可以整段抄进 act --json —— Move 也带全 path。");
  console.log("");
  for (const [owner, list] of groups) {
    const unit = state.units[owner];
    const head = unit
      ? `【${owner} ${unit.type} ＠${unit.pos} ${unit.layer === "under" ? "地下" : "地面"} MP${unit.mp}${unit.acted ? " · 主动作已用掉" : ""}】`
      : `【${owner}】`;
    console.log(`${head} 共 ${list.length} 条`);
    for (const kind of ["main", "move", "free"]) {
      const subset = list.filter((action) => ActionKind(action) === kind);
      if (!subset.length) continue;
      console.log(`  · ${actionKindNames[kind]}`);
      if (kind === "move") {
        // R5 P0-1：Move 以前只报终点，act 却要求精确 path——两边对不上，地下层就只能靠试错。
        // 现在与 GuideCivs 一致，逐条吐完整路径。
        const moves = subset.filter((action) => action.type === "Move");
        if (moves.length) {
          console.log(`      （Move 共 ${moves.length} 条，每条都写全了 path，直接复制即可）`);
          for (const action of moves) console.log(ActionLine(state, action, links));
        }
        for (const action of subset.filter((action) => action.type !== "Move")) {
          console.log(ActionLine(state, action, links));
        }
      } else {
        for (const action of subset) console.log(ActionLine(state, action, links));
      }
    }
    if (unitId) {
      // R6 P0-3①：只要这个单位按得动 MoveCivs，就把「人会进哪个窖、各窖还剩几铺」摊开。
      if (unit && list.some((action) => action.type === "MoveCivs")) {
        const shelterLines = CivShelterLines(state, unit.pos, list);
        if (shelterLines.length) {
          console.log("  · 转移群众会把人放进哪个窖：");
          for (const line of shelterLines) console.log(`    ${line}`);
        }
      }
      const notes = ActionNotes(state, unitId, list);
      if (notes.length) {
        console.log("  · 这些动作到底有什么用（速查）：");
        for (const note of notes) console.log(`      ${note}`);
      }
      const hints = ActionHints(state, unitId, list);
      if (hints.length) {
        console.log("  · 为什么某些动作不在上面（按当前状态给出的原因，判定仍以本列表为准）：");
        for (const hint of hints) console.log(`      - ${hint}`);
      }
    }
    console.log("");
  }
  console.log(`（共 ${actions.length} 条${unitId ? `，单位 ${unitId}` : "；建议用 --unit u1 逐个单位看，或 --json 输出原始 JSON"}）`);
  if (!unitId) {
    console.log("用法提示：legal --save <存档> --unit u1     只看 u1 的动作（含用途速查与不可用原因）");
    console.log("          legal --save <存档> --unit u1 --json  输出可直接喂给 act --json 的原始 JSON");
  }
}

function CmdAct(args) {
  const state = LoadSave(args.save);
  if (!args.json) Die("缺少 --json 动作");
  let action;
  try { action = JSON.parse(args.json); } catch (error) { Die(`动作 JSON 解析失败：${error.message}`); }
  const outcome = PerformAction(state, action);
  if (outcome.illegal) {
    console.log(`[非法动作] ${outcome.illegal}`
      + (outcome.illegalAction && outcome.illegalAction !== action.type ? `（被拒的是 ${outcome.illegalAction}）` : ""));
    if (action.unit && state.units[action.unit]) {
      // 引擎给的补救提示优先（它知道到底是哪一条判定拦下的）；缺席时自己按动作类型筛。
      // 以前没有对口提示就退回 all.slice(0,2)，于是 DigEntrance 失败还附赠
      // 「Ambush 不可用」「Attack 不可用」，纯属噪音。
      let hints = Array.isArray(outcome.hints) ? outcome.hints.filter(Boolean) : [];
      if (!hints.length) {
        const all = ActionHints(state, action.unit, LegalActions(state, action.unit));
        const family = { Dig: "挖掘类", DigEntrance: "挖掘类", DigFacility: "挖掘类" };
        hints = all.filter((hint) => hint.startsWith(`${action.type} `)
          || (family[action.type] && hint.startsWith(family[action.type])));
      }
      for (const hint of hints) console.log(`  提示：${hint}`);
      if (!hints.length) console.log("  提示：本次失败的原因就是上面那一行；本单位的其它动作不受影响。");
      if (!hints.some((hint) => hint.includes("legal"))) {
        console.log(`  想知道 ${action.unit} 现在到底能做什么：legal --save <存档> --unit ${action.unit}`);
      }
    }
    process.exit(2);
  }
  console.log("可见事件：");
  PrintEvents(outcome.events);
  console.log("");
  ShowAll(outcome.state, args.layer);
  WriteSave(args.save, outcome.state);
}

function CmdEnd(args) {
  const state = LoadSave(args.save);
  const outcome = EndTurn(state);
  if (outcome.illegal) { console.log(`[不可结束] ${outcome.illegal}`); process.exit(2); }
  console.log("敌军阶段与结算（可见事件播报）：");
  PrintEvents(outcome.events);
  console.log("");
  ShowAll(outcome.state, args.layer);
  WriteSave(args.save, outcome.state);
}

function Summary(state, steps) {
  const view = DeriveView(state);
  return {
    level: state.meta.level,
    act: state.meta.act,
    seed: state.meta.seed,
    endTurn: state.meta.turn,
    steps,
    result: state.result,
    ledger: state.ledger,
    kills: state.score.kills,
    alliesLost: state.score.alliesLost,
    grainTotal: GrainTotal(state),
    civ: view.civSummary,
    network: view.network,
    woundedTotal: WoundedTotal(state),
    ammo: state.resources.ammo,
    pool: state.wave.pool,
    waveStatus: state.wave.status,
    doneTurn: state.wave.doneTurn,
  };
}

function CmdRun(args) {
  const level = ResolveLevelId(args.level);
  const seed = Number(args.seed ?? 3);
  const botName = args.bot === undefined ? "Skilled" : String(args.bot);
  if (!botNames.includes(botName)) Die(`未知 bot：${botName}（可选：${botNames.join(" / ")}）`);
  const verbose = !!args.verbose;
  const picked = ResolveCarry(args.carry, level);
  const { state, steps } = RunBotGame({
    level, seed, bot: botName, carry: picked.carry,
    onStep: verbose ? (st, action, events) => {
      if (action.type === "EndTurn") {
        console.log(`—— T${st.meta.turn} ——`);
        PrintEvents(events);
      }
    } : null,
  });
  if (verbose) { console.log(""); ShowAll(state); console.log(""); }
  else if (state.result) {
    console.log(`【终局】${state.result.won ? "胜" : "负"} ｜ 评定：${state.result.grade}`);
    for (const line of MedalLines(state)) console.log(line);
  }
  console.log(JSON.stringify(Summary(state, steps), null, 1));
  // 落盘后就能接着 `next --save … --save-to …` 把战役串下去（bot 打完一幕，人接着打下一幕）。
  if (args.save === true) Die("--save 要带一个路径");
  if (args.save) { WriteSave(String(args.save), state); console.log(`[存档] ${args.save}`); }
}

/**
 * 渲染夹具生成器。**会覆写仓库里的 Data_FixtureState.mjs**，所以默认只做空跑并把要写的目标打出来，
 * 真要落盘必须显式加 --write（R5 P1：以前它一声不吭地改仓库文件，还不在用法行与 README 里）。
 */
function CmdFixture(args) {
  const level = ResolveLevelId(args.level);
  const seed = Number(args.seed ?? 3);
  const turns = Number(args.turns ?? 6);
  const out = typeof args.out === "string" ? args.out : new URL("./Data_FixtureState.mjs", import.meta.url).pathname;
  if (args.write !== true && args.write !== "true") {
    console.log("[夹具·空跑] 本命令会**覆写**下面这个仓库文件，因此默认不写盘：");
    console.log(`  目标文件：${out}`);
    console.log(`  将写入：${level} seed=${seed}，${args.bot || "Skilled"} bot 跑至 T${turns} 的状态`);
    console.log("  确认无误再加 --write 真正落盘：");
    console.log(`    node TunnelFront1942/Script_PlayCli.mjs fixture --level ${level} --seed ${seed} --turns ${turns} --write`);
    console.log("  （想写到别处就再加 --out <路径>，仓库文件即可保持不动）");
    return;
  }
  const { state } = RunBotGame({ level, seed, bot: args.bot || "Skilled", untilTurn: turns });
  const body = [
    "// 渲染开发用固定状态夹具（与 AGENTS.md §三 状态契约同构）。",
    `// 由 Script_PlayCli.mjs fixture 生成：${level} seed=${seed}，Skilled bot 跑至 T${state.meta.turn} 的真实中盘状态。`,
    "// 用途：`index.html?fixture=1` 与表现层自测在引擎缺席时渲染本状态。重新生成请再跑同命令。",
    "",
    `export const fixtureState = ${JSON.stringify(state, null, 1)};`,
    "",
  ].join("\n");
  writeFileSync(out, body);
  console.log(`[夹具] 已写入 ${out}（T${state.meta.turn}，${Object.keys(state.units).length} 个单位）`);
}

const commands = { new: CmdNew, next: CmdNext, carry: CmdCarry, show: CmdShow, legal: CmdLegal,
  act: CmdAct, end: CmdEnd, run: CmdRun, fixture: CmdFixture };

function PrintUsage() {
  console.log("用法：node TunnelFront1942/Script_PlayCli.mjs <new|next|carry|show|legal|act|end|run|fixture> [--参数 值]");
  console.log(`  关卡（--level）只有五幕：${campaignOrder.map((id) => `${id}《${levelDefinitions[id].name}》`).join("、")}`);
  console.log("  未知参数一律报错退出——写错的 flag 不会再被静默吞掉。");
  console.log("");
  console.log("  new  --level A1 --seed 3 --save /tmp/a1.json          开局简报 + 规则要点 + 战场报表");
  console.log("       [--carry default|full|<存档路径>|<继承档 json>]  本局的地道网从哪儿继承（缺省 default）");
  console.log("  next --save /tmp/a1.json --save-to /tmp/a2.json [--seed 3] [--level A3]");
  console.log("                                                       **战役串联**：拿上一幕的终局存档直接开下一幕，");
  console.log("                                                       地道网/口/伪装/洞存粮/弹药自动带过去。");
  console.log("  carry --save /tmp/a1.json [--out /tmp/carry.json]    看/导出这份存档折出来的继承档");
  console.log("  show --save /tmp/a1.json [--layer surface|under|both] 战场报表（地图/地道口/地道段与门/存粮分账/敌意图）");
  console.log("  legal --save /tmp/a1.json --unit u1                   某单位合法动作（分组 + 用途速查 + 不可用原因；");
  console.log("                                                       Move 带全 path 与「到那儿剩几 MP」，");
  console.log("                                                       MoveCivs 带「人落进哪个窖、各窖剩几铺」）");
  console.log("  legal --save /tmp/a1.json --unit u1 --json            原始 JSON，可直接喂给 act");
  console.log('  act  --save /tmp/a1.json --json \'{"type":"Move","unit":"u1","path":["4,-1","4,0"]}\'');
  console.log("  end  --save /tmp/a1.json                             敌军阶段 + 结算全播报");
  console.log("  run  --level A1 --seed 3 --bot Skilled [--verbose] [--carry ...] [--save /tmp/a1.json]");
  console.log(`                                                       bot 整局 → 总结 JSON；--bot 只认：${botNames.join(" / ")}`);
  console.log("  fixture --level A1 --seed 3 --turns 6 [--out 路径] --write");
  console.log("                                                       生成渲染夹具。**会覆写 Data_FixtureState.mjs**，");
  console.log("                                                       不加 --write 只空跑并打印将要写入的目标。");
  console.log("");
  console.log("  打完一幕接着打下一幕（战役五幕连打）：");
  console.log("    node TunnelFront1942/Script_PlayCli.mjs new  --level A1 --seed 3 --save /tmp/a1.json");
  console.log("    …… 打到终局 ……");
  console.log("    node TunnelFront1942/Script_PlayCli.mjs next --save /tmp/a1.json --save-to /tmp/a2.json");
  console.log("");
  for (const line of rulesCard) console.log(line);
}

const args = ParseArgs(process.argv.slice(2));
const command = args._[0];
if (!command || !commands[command]) {
  if (command) console.error(`[错误] 未知子命令「${command}」。`);
  PrintUsage();
  process.exit(command ? 1 : 0);
}
if (args._.length > 1) {
  Die(`多余的参数：${args._.slice(1).join(" ")}（子命令只有一个，其余一律用 --参数 值）`);
}
CheckFlags(command, args);
commands[command](args);
