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
import { RenderAsciiMap } from "./Script_AsciiMap.mjs";
import { RunBotGame, botNames } from "./Script_Bots.mjs";
import { TEXT } from "./Data_Rules.mjs";

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

function PrintStatus(state) {
  const view = DeriveView(state);
  const wave = view.wave;
  console.log(`回合 T${view.turn}/${wave.hardEndTurn} ｜ 阶段：${view.phase} ｜ 波次：${wave.statusText}`
    + (wave.status !== "quiet" ? ` ｜ 敌行动力池：${wave.pool}` : "")
    + (wave.smokeCharges ? ` ｜ 敌烟具：${wave.smokeCharges}` : ""));
  console.log(`弹药 ${view.resources.ammo}/12 ｜ 总粮 ${view.resources.grainTotal} ｜ 人口 ${view.resources.popTotal} 批`
    + (view.resources.woundedTotal ? ` ｜ 伤员 ${view.resources.woundedTotal} 批` : ""));
  const ledgerParts = Object.entries(view.ledger).filter(([, v]) => v > 0)
    .map(([k, v]) => `${TEXT.ledgerNames[k]}：${v}`);
  console.log(`代价簿：${ledgerParts.length ? ledgerParts.join("；") : "（全空）"}`);
  if (view.telegraphs.length) {
    console.log("电报预告：");
    for (const telegraph of view.telegraphs) console.log(`  ! ${telegraph.text}`);
  }
  if (view.guardrails.length) {
    console.log("待办护栏：");
    for (const guardrail of view.guardrails) console.log(`  - ${guardrail.text}`);
  }
  if (view.result) {
    console.log(`【终局】${view.result.won ? "胜" : "负"} ｜ 评定：${view.result.grade} ｜ 勋记：${view.result.medals.map((m) => (m ? "●" : "○")).join("")}`);
    for (const reason of view.result.reasons) console.log(`  · ${reason}`);
  }
}

function PrintUnits(state) {
  const view = DeriveView(state);
  console.log("我方单位：");
  for (const unit of view.allies) {
    console.log(`  ${unit.id} ${unit.name} ＠${unit.pos}（${unit.layer === "under" ? "地下" : "地面"}）`
      + ` HP${unit.hp} MP${unit.mp} ${unit.acted ? "已行动" : "未行动"} ${TEXT.stance[unit.stance] || unit.stance}`
      + (unit.breath ? ` 憋闷${unit.breath}` : ""));
  }
  if (view.visibleEnemies.length) {
    console.log("可见敌单位：");
    for (const foe of view.visibleEnemies) {
      console.log(`  ${foe.id} ${foe.name} ＠${foe.pos}` + (foe.hp !== null && foe.hp !== undefined ? ` HP${foe.hp}` : ""));
    }
  }
  if (view.ghosts.length) {
    console.log("敌踪虚影（最后目击）：" + view.ghosts.map((ghost) => `${ghost.type}＠${ghost.pos}(T${ghost.turn})`).join("、"));
  }
}

function ShowAll(state, layer) {
  PrintStatus(state);
  console.log("");
  console.log(RenderAsciiMap(state, { layer: layer || "both" }));
  console.log("");
  PrintUnits(state);
}

function CmdNew(args) {
  const level = args.level || "L1";
  const seed = Number(args.seed ?? 3);
  const state = CreateGame(level, seed);
  console.log(`—— 开局：${level} seed=${seed} ——`);
  for (const line of GetBriefing(state)) console.log(line);
  console.log("");
  ShowAll(state, args.layer);
  if (args.save) { WriteSave(args.save, state); console.log(`\n[存档] ${args.save}`); }
}

function CmdShow(args) {
  const state = LoadSave(args.save);
  ShowAll(state, args.layer);
}

function CmdLegal(args) {
  const state = LoadSave(args.save);
  const actions = LegalActions(state, args.unit);
  console.log(JSON.stringify(actions, null, 1));
  console.log(`（共 ${actions.length} 个合法动作${args.unit ? `，单位 ${args.unit}` : ""}）`);
}

function CmdAct(args) {
  const state = LoadSave(args.save);
  if (!args.json) Die("缺少 --json 动作");
  let action;
  try { action = JSON.parse(args.json); } catch (error) { Die(`动作 JSON 解析失败：${error.message}`); }
  const outcome = PerformAction(state, action);
  if (outcome.illegal) { console.log(`[非法动作] ${outcome.illegal}`); process.exit(2); }
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
  console.log("  new  --level L1 --seed 3 --save /tmp/g.json");
  console.log("  show --save /tmp/g.json [--layer surface|under|both]");
  console.log("  legal --save /tmp/g.json [--unit u1]");
  console.log('  act  --save /tmp/g.json --json \'{"type":"Move","unit":"u1","path":["4,1"]}\'');
  console.log("  end  --save /tmp/g.json");
  console.log("  run  --level L1 --seed 3 --bot Skilled [--verbose]");
  process.exit(command ? 1 : 0);
}
commands[command](args);
