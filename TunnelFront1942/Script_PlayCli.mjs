#!/usr/bin/env node
// 《地下长城 · 冀中1942》 —— 审查 Agent 完整游玩接口（AGENTS.md §7.3）。
// 子命令：
//   new  --level L1 --seed 3 --save /tmp/g.json     开局 + 简报 + ASCII
//   show --save /tmp/g.json [--layer surface|under|both]
//   legal --save /tmp/g.json [--unit u1]
//   act  --save /tmp/g.json --json '{"type":"Move",...}'
//   end  --save /tmp/g.json                          敌阶段 + 结算全播报
//   run  --level L1 --seed 3 --bot Skilled           bot 整局 → 总结 JSON
//   fixture --level L1 --seed 3 --turns 6 --out Data_FixtureState.mjs   （生成渲染夹具）
// 仅本文件允许触碰 fs/process；引擎模块保持纯逻辑。

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { CreateGame, SerializeState, DeserializeState, GetBriefing, GrainTotal, PopTotal, WoundedTotal } from "./Script_State.mjs";
import { DeriveView } from "./Script_Visibility.mjs";
import { LegalActions, PerformAction } from "./Script_Actions.mjs";
import { EndTurn } from "./Script_Turn.mjs";
import {
  RenderAsciiMap, GrainLines, OpeningLines, LandmarkLines, IntentLines, ObjectiveLine,
  UnitLines, MedalLines, TelegraphText, ActionKind, actionKindNames, ActionHints,
} from "./Script_AsciiMap.mjs";
import { RunBotGame, botNames } from "./Script_Bots.mjs";
import { TEXT, CFG } from "./Data_Rules.mjs";

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
  const objective = ObjectiveLine(state);
  if (objective) console.log(`目标：${objective}`);
  console.log(`回合 T${derived.turn}/${wave.hardEndTurn} ｜ 阶段：${derived.phase} ｜ 波次：${wave.statusText}`
    + (wave.status !== "quiet" ? ` ｜ 敌行动力池：${wave.pool}` : "")
    + (wave.smokeCharges ? ` ｜ 敌烟具：${wave.smokeCharges}` : ""));
  console.log(`弹药 ${derived.resources.ammo}/${CFG.ammoMax} ｜ 人口 ${derived.resources.popTotal} 批`
    + (derived.resources.woundedTotal ? ` ｜ 伤员 ${derived.resources.woundedTotal} 批` : ""));
  for (const line of GrainLines(state)) console.log(line);
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

function CmdNew(args) {
  const level = args.level || "L1";
  const seed = Number(args.seed ?? 3);
  const state = CreateGame(level, seed);
  console.log(`—— 开局：${level} seed=${seed} ——`);
  for (const line of GetBriefing(state)) console.log(line);
  console.log("");
  for (const line of rulesCard) console.log(line);
  console.log("");
  ShowAll(state, args.layer);
  if (args.save) { WriteSave(args.save, state); console.log(`\n[存档] ${args.save}`); }
}

function CmdShow(args) {
  const state = LoadSave(args.save);
  ShowAll(state, args.layer);
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
  const groups = new Map();
  for (const action of actions) {
    const owner = action.unit || "（全局）";
    if (!groups.has(owner)) groups.set(owner, []);
    groups.get(owner).push(action);
  }
  console.log("合法动作（每单位每回合只能用 1 个「主动作」；移动只花 MP，不占主动作）");
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
        // 移动条目太多：只报可达终点，完整 JSON 用 --json
        const dests = subset.filter((action) => action.type === "Move")
          .map((action) => action.path[action.path.length - 1]);
        if (dests.length) console.log(`      Move 可达 ${dests.length} 格：${dests.join(" ")}`);
        for (const action of subset.filter((action) => action.type !== "Move")) {
          console.log(`      ${JSON.stringify(action)}`);
        }
      } else {
        for (const action of subset) console.log(`      ${JSON.stringify(action)}`);
      }
    }
    if (unitId) {
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
    console.log("用法提示：legal --save <存档> --unit u1     只看 u1 的动作（含不可用原因）");
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
    console.log(`[非法动作] ${outcome.illegal}`);
    if (action.unit && state.units[action.unit]) {
      const all = ActionHints(state, action.unit, LegalActions(state, action.unit));
      const focused = all.filter((hint) => hint.startsWith(`${action.type} `));
      const shown = focused.length ? focused : all.slice(0, 2);
      for (const hint of shown) console.log(`  提示：${hint}`);
      console.log(`  想知道 ${action.unit} 现在到底能做什么：legal --save <存档> --unit ${action.unit}`);
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
  return {
    level: state.meta.level,
    seed: state.meta.seed,
    endTurn: state.meta.turn,
    steps,
    result: state.result,
    ledger: state.ledger,
    kills: state.score.kills,
    alliesLost: state.score.alliesLost,
    grainTotal: GrainTotal(state),
    popTotal: PopTotal(state),
    woundedTotal: WoundedTotal(state),
    ammo: state.resources.ammo,
    pool: state.wave.pool,
    waveStatus: state.wave.status,
    doneTurn: state.wave.doneTurn,
  };
}

function CmdRun(args) {
  const level = args.level || "L1";
  const seed = Number(args.seed ?? 3);
  const botName = args.bot || "Skilled";
  if (!botNames.includes(botName)) Die(`未知 bot：${botName}（可选：${botNames.join("/")}）`);
  const verbose = !!args.verbose;
  const { state, steps } = RunBotGame({
    level, seed, bot: botName,
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
}

function CmdFixture(args) {
  const level = args.level || "L1";
  const seed = Number(args.seed ?? 3);
  const turns = Number(args.turns ?? 6);
  const out = args.out || new URL("./Data_FixtureState.mjs", import.meta.url).pathname;
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

const commands = { new: CmdNew, show: CmdShow, legal: CmdLegal, act: CmdAct, end: CmdEnd, run: CmdRun, fixture: CmdFixture };

const args = ParseArgs(process.argv.slice(2));
const command = args._[0];
if (!command || !commands[command]) {
  console.log("用法：node TunnelFront1942/Script_PlayCli.mjs <new|show|legal|act|end|run|fixture> [--参数 值]");
  console.log("  new  --level L1 --seed 3 --save /tmp/g.json          开局简报 + 规则要点 + 战场报表");
  console.log("  show --save /tmp/g.json [--layer surface|under|both] 战场报表（地图/地道口/存粮分账/敌意图）");
  console.log("  legal --save /tmp/g.json --unit u1                   某单位合法动作（按主动作/移动/免费分组 + 不可用原因）");
  console.log("  legal --save /tmp/g.json --unit u1 --json            原始 JSON，可直接喂给 act");
  console.log('  act  --save /tmp/g.json --json \'{"type":"Move","unit":"u1","path":["4,1"]}\'');
  console.log("  end  --save /tmp/g.json                              敌军阶段 + 结算全播报");
  console.log("  run  --level L1 --seed 3 --bot Skilled [--verbose]   bot 整局 → 总结 JSON");
  console.log("");
  for (const line of rulesCard) console.log(line);
  process.exit(command ? 1 : 0);
}
commands[command](args);
