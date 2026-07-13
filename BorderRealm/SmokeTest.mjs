import assert from "node:assert/strict";
import {
  config, campaignDates, regionTemplates, advisorTemplates, actions, policies, turnEvents,
  CreateGame, GetRegion, GetAdvisor, GetAction, GetEvent, ConnectedRegions,
  CanPlanOrder, PlanOrder, CancelOrder, ChangePolicy, ChooseEvent, ResolveTurn,
  InvariantChecks, SerializeGame, DeserializeGame,
} from "./Rules.mjs";

let checks = 0;
function Check(condition, message) { assert.ok(condition, message); checks += 1; }

// 1. The campaign has one fixed event for every two-month turn.
Check(config.totalTurns === 18, "campaign is exactly 18 turns");
Check(campaignDates.length === config.totalTurns, "every turn has a date");
Check(turnEvents.length === config.totalTurns, "every turn has a briefing event");
Check(campaignDates[0] === "1940年1—2月" && campaignDates.at(-1) === "1942年11—12月", "campaign spans all of 1940 through 1942");
Check(new Set(turnEvents.map(event => event.id)).size === turnEvents.length, "event ids are unique");
Check(turnEvents.some(event => event.id === "BeforeAugust"), "Hundred Regiments campaign context is fixed");
Check(turnEvents.some(event => event.id === "MaySweep"), "May 1942 sweep context is fixed");
Check(turnEvents[11].id === "WinterBurden" && turnEvents[12].id === "Streamline", "streamlining follows the late 1941 winter burden");
Check(turnEvents[13].id === "LeavesOrder" && turnEvents[14].id === "MaySweep", "spring famine precedes the May 1942 sweep");

// 2. The map is a network, not a territorial paint layer.
{
  const state = CreateGame(1940);
  Check(InvariantChecks(state).length === 0, "initial state satisfies invariants");
  Check(state.regions.length === 7, "seven local network nodes");
  Check(state.advisors.length === 8, "eight fictional composite advisors");
  Check(ConnectedRegions(state).length === 6, "one peripheral node begins disconnected");
  for (const template of regionTemplates) {
    for (const targetId of template.connections) {
      const target = regionTemplates.find(region => region.id === targetId);
      Check(!!target, `${template.id} connection target exists`);
      Check(target.connections.includes(template.id), `${template.id}-${targetId} connection is reciprocal`);
    }
  }
}

// 3. A mandatory event is resolved before orders; choices change relationships and resources.
{
  const state = CreateGame(3);
  Check(GetEvent(state)?.id === "OpeningNetwork", "opening local council event is pending");
  Check(!CanPlanOrder(state, "Qinghe", "production", "ZhouYanshan").ok, "orders are blocked before the briefing choice");
  const supportBefore = state.resources.support;
  const trustBefore = GetAdvisor(state, "XuQiuhe").trust;
  const choice = ChooseEvent(state, "Villages");
  Check(choice.ok && !state.pendingEventId, "event choice clears the pending event");
  Check(state.resources.support > supportBefore, "event choice changes public support");
  Check(GetAdvisor(state, "XuQiuhe").trust > trustBefore, "event choice changes personal trust");
  Check(state.chronicle.length === 2, "event choice is recorded in the chronicle");
}

// 4. Planning enforces two orders, unique advisors, costs, and cancellation.
{
  const state = CreateGame(4);
  ChooseEvent(state, "Council");
  const first = PlanOrder(state, "Qinghe", "production", "ZhouYanshan");
  Check(first.ok, "first order can be planned");
  Check(!PlanOrder(state, "Longquan", "medical", "ZhouYanshan").ok, "same advisor cannot receive two orders");
  Check(!PlanOrder(state, "Qinghe", "intelligence", "MaChengyi").ok, "same region cannot receive two orders in one turn");
  const second = PlanOrder(state, "Ludang", "intelligence", "MaChengyi");
  Check(second.ok && state.orders.length === 2, "second unique advisor can receive an order");
  Check(!PlanOrder(state, "Baishi", "sabotage", "ZhaoTieshan").ok, "two-order cap is enforced");
  Check(CancelOrder(state, first.order.id).ok && state.orders.length === 1, "planned order can be cancelled");
  Check(PlanOrder(state, "Baishi", "militia", "ZhaoTieshan").ok, "cancelled slot can be reassigned");
  Check(InvariantChecks(state).length === 0, "planned orders preserve invariants");
}

// 5. Strategy changes are made before orders and at most once per turn.
{
  const state = CreateGame(5);
  ChooseEvent(state, "LocalForces");
  Check(ChangePolicy(state, "mobilize").ok, "policy can change before planning");
  Check(!ChangePolicy(state, "disrupt").ok, "policy changes only once per turn");
  PlanOrder(state, "Qinghe", "production", "ZhouYanshan");
  Check(!ChangePolicy(state, "conceal").ok, "policy cannot change after an order is planned");
}

// 6. A complete turn resolves two orders, enemy pressure, upkeep, fatigue, and the next briefing.
{
  const state = CreateGame(6);
  ChooseEvent(state, "Council");
  PlanOrder(state, "Qinghe", "production", "ZhouYanshan");
  PlanOrder(state, "Ludang", "intelligence", "MaChengyi");
  const result = ResolveTurn(state);
  Check(result.ok && result.report.length >= 3, "turn resolution reports two orders and enemy phase");
  Check(state.turn === 1 && state.pendingEventId === turnEvents[1].id, "turn advances to the next fixed briefing");
  Check(state.orders.length === 0, "orders clear after resolution");
  Check(GetAdvisor(state, "ZhouYanshan").fatigue >= 1, "assigned advisor gains fatigue");
  Check(state.stats.orders === 2, "resolved orders are counted");
  Check(state.reportPending && state.lastResolvedDate === "1940年1—2月", "turn report can be resumed after a reload");
  Check(InvariantChecks(state).length === 0, "resolved turn preserves invariants");
}

// 7. Identical seeds and decisions resolve identically.
{
  const Make = () => {
    const state = CreateGame(777);
    ChooseEvent(state, "Council");
    PlanOrder(state, "Qinghe", "production", "ZhouYanshan");
    PlanOrder(state, "Ludang", "intelligence", "MaChengyi");
    ResolveTurn(state);
    return state;
  };
  const first = Make(), second = Make();
  Check(JSON.stringify(first.resources) === JSON.stringify(second.resources), "seeded resource outcomes are deterministic");
  Check(JSON.stringify(first.regions) === JSON.stringify(second.regions), "seeded region outcomes are deterministic");
  Check(JSON.stringify(first.lastReport) === JSON.stringify(second.lastReport), "seeded narrative outcomes are deterministic");
}

// 8. Preparation materially protects a threatened node.
{
  const Make = prepared => {
    const state = CreateGame(808);
    ChooseEvent(state, "Council");
    const region = GetRegion(state, "Qinghe");
    region.prepared = prepared;
    state.activeThreat = { name: "测试合围", target: "Qinghe", strength: 6 };
    PlanOrder(state, "Dongguan", "unitedFront", "ZhouYanshan");
    PlanOrder(state, "Longquan", "unitedFront", "DongBoan");
    ResolveTurn(state);
    return state;
  };
  const exposed = Make(0), prepared = Make(4);
  Check(GetRegion(prepared, "Qinghe").support > GetRegion(exposed, "Qinghe").support, "prepared node loses less local support");
  Check(GetRegion(prepared, "Qinghe").network >= GetRegion(exposed, "Qinghe").network, "prepared node preserves its network");
  Check(prepared.stats.peopleProtected > exposed.stats.peopleProtected, "preparation protects people rather than granting kill points");
}

// 9. A zero-organization state is recoverable and cannot soft-lock the player.
{
  const state = CreateGame(9);
  ChooseEvent(state, "Council");
  state.resources.organization = 0;
  Check(CanPlanOrder(state, "Dongguan", "unitedFront", "ZhouYanshan").ok, "united-front work remains available at zero organization");
  Check(PlanOrder(state, "Dongguan", "unitedFront", "ZhouYanshan").ok, "first recovery order can be planned");
  Check(PlanOrder(state, "Qinghe", "unitedFront", "DongBoan").ok, "second recovery order can be planned");
  Check(ResolveTurn(state).ok, "zero-organization turn can resolve");
  Check(state.resources.organization > 0 || !state.over, "recovery turn does not hard-lock the campaign");
}

// 10. Save data round-trips without losing pending events, relationships, or local history.
{
  const state = CreateGame(10);
  ChooseEvent(state, "Villages");
  PlanOrder(state, "Qinghe", "organize", "XuQiuhe");
  const restored = DeserializeGame(SerializeGame(state));
  Check(!!restored, "valid save restores");
  Check(JSON.stringify(restored.resources) === JSON.stringify(state.resources), "resources survive save round-trip");
  Check(JSON.stringify(restored.advisors) === JSON.stringify(state.advisors), "relationships survive save round-trip");
  Check(JSON.stringify(restored.chronicle) === JSON.stringify(state.chronicle), "chronicle survives save round-trip");
  Check(DeserializeGame("not json") === null, "malformed save is rejected");
  Check(DeserializeGame(JSON.stringify({ version: 999, state })) === null, "unknown save version is rejected");
}

function ChooseDefaultEvent(state) {
  const event = GetEvent(state);
  return event ? ChooseEvent(state, event.choices[0].id).ok : true;
}

function BestAdvisor(state, action, used) {
  return state.advisors
    .filter(advisor => !used.has(advisor.id) && advisor.fatigue < config.fatigueMax)
    .sort((left, right) => (right.stats[action.skill] * 8 + right.trust - right.fatigue * 10) - (left.stats[action.skill] * 8 + left.trust - left.fatigue * 10))[0];
}

function PlanSafeTurn(state) {
  const used = new Set();
  const weakest = state.regions.slice().sort((left, right) => (left.network * 20 + left.support) - (right.network * 20 + right.support));
  const priorities = state.resources.organization <= 2
    ? ["unitedFront", "unitedFront", "production", "intelligence"]
    : state.resources.grain <= 2
      ? ["production", "unitedFront", "intelligence", "organize"]
      : ["intelligence", "production", "organize", "unitedFront", "medical", "militia"];
  for (let slot = 0; slot < config.ordersPerTurn; slot++) {
    let planned = false;
    for (const actionId of priorities) {
      const action = GetAction(actionId);
      const advisor = BestAdvisor(state, action, used);
      if (!advisor) continue;
      for (const region of weakest) {
        const result = PlanOrder(state, region.id, actionId, advisor.id);
        if (result.ok) { used.add(advisor.id); planned = true; break; }
      }
      if (planned) break;
    }
    if (!planned) return false;
  }
  return true;
}

// 11. Many complete automated campaigns remain finite, valid, and reach a historical endpoint.
let completedCampaigns = 0;
let survivedCampaigns = 0;
for (let seed = 100; seed < 160; seed++) {
  const state = CreateGame(seed);
  let guard = 0;
  while (!state.over && guard++ < config.totalTurns + 2) {
    Check(ChooseDefaultEvent(state), `seed ${seed} turn ${state.turn}: event resolves`);
    Check(PlanSafeTurn(state), `seed ${seed} turn ${state.turn}: two orders remain plan-able`);
    const result = ResolveTurn(state);
    Check(result.ok, `seed ${seed} turn ${state.turn}: turn resolves`);
    Check(InvariantChecks(state).length === 0, `seed ${seed} turn ${state.turn}: invariants hold`);
  }
  Check(state.over && !!state.result, `seed ${seed}: campaign reaches a terminal local outcome`);
  Check(state.turn <= config.totalTurns - 1, `seed ${seed}: campaign never overruns historical schedule`);
  completedCampaigns += 1;
  if (state.result.type === "survived") survivedCampaigns += 1;
}
Check(completedCampaigns === 60, "all automated campaigns completed");
Check(survivedCampaigns >= 20, "default-safe play survives often enough to validate campaign balance");

// 12. Public data has complete player-facing descriptions.
for (const action of Object.values(actions)) {
  Check(action.name && action.description && action.preview && action.skill, `${action.id}: action text is complete`);
}
for (const policy of Object.values(policies)) {
  Check(policy.name && policy.description && policy.detail && GetAdvisor(CreateGame(1), policy.advocate), `${policy.id}: policy text and advocate are complete`);
}
for (const advisor of advisorTemplates) {
  Check(advisor.name && advisor.role && advisor.concern && advisor.traits.length === 2, `${advisor.id}: advisor text is complete`);
}

console.log(`PASS ${checks} checks · ${survivedCampaigns}/${completedCampaigns} safe-play campaigns survived`);
