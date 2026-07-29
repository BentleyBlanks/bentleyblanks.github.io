export const missionPhaseOrder = Object.freeze([
  "Breakfast",
  "Choice",
  "Cellar",
  "Rescue",
  "Battle",
  "Reeds",
  "Epilogue",
]);

const breakfastTasks = Object.freeze(["Mill", "Bowl", "Shoe"]);
const rescueGroups = Object.freeze(["Family", "AuntSun", "Zhou"]);
const battleTasks = Object.freeze(["Message", "Cart", "Gate"]);
const itemIds = Object.freeze(["Medicine", "Seed", "Register"]);

function UniqueList(values) {
  return [...new Set(values)];
}

export function CreateMissionState() {
  return {
    phase: "Breakfast",
    breakfastTasks: [],
    chosenItems: [],
    cellarComplete: false,
    rescuedGroups: [],
    activeRescueGroup: null,
    battleTasks: [],
    ferryCrossings: 0,
    loweredDistress: false,
    elapsedSeconds: 0,
    checkpoint: "Breakfast",
  };
}

export function CurrentObjective(state) {
  if (state.phase === "Breakfast") {
    const nextTask = breakfastTasks.find((task) => !state.breakfastTasks.includes(task));
    return nextTask
      ? { target: nextTask, text: `完成晨间小事 · ${state.breakfastTasks.length}/3` }
      : { target: null, text: "听见远处的铜锣" };
  }
  if (state.phase === "Choice") {
    if (state.chosenItems.length < 2) {
      return { target: "ChoiceItems", text: `只能带走两样 · ${state.chosenItems.length}/2` };
    }
    return { target: "Cellar", text: "带小栓进入磨盘下的地窖" };
  }
  if (state.phase === "Cellar") {
    return { target: "CellarHold", text: "压住松动木板，别让小栓出声" };
  }
  if (state.phase === "Rescue") {
    if (state.activeRescueGroup) {
      return { target: "Canal", text: `带${RescueName(state.activeRescueGroup)}到水渠口` };
    }
    const nextGroup = rescueGroups.find((group) => !state.rescuedGroups.includes(group));
    return nextGroup
      ? { target: nextGroup, text: `寻找幸存者 · ${state.rescuedGroups.length}/3` }
      : { target: null, text: "所有人已到水渠口" };
  }
  if (state.phase === "Battle") {
    const nextTask = battleTasks.find((task) => !state.battleTasks.includes(task));
    const labels = {
      Message: "穿过火线，把口信送到东沟小组",
      Cart: "沿土墙推动伤员板车",
      Gate: "打开渠门，为渡船争取时间",
    };
    return nextTask
      ? { target: nextTask, text: labels[nextTask] }
      : { target: "Ferry", text: "去苇荡渡口" };
  }
  if (state.phase === "Reeds") {
    return { target: "Ferry", text: `拉渡绳 · ${state.ferryCrossings}/3 船` };
  }
  return { target: null, text: "点名" };
}

function RescueName(groupId) {
  return ({
    Family: "母亲和小栓",
    AuntSun: "孙婶一家",
    Zhou: "周文嫂",
  })[groupId] || "这一组人";
}

export function CanChooseItem(state, itemId) {
  return state.phase === "Choice"
    && itemIds.includes(itemId)
    && !state.chosenItems.includes(itemId)
    && state.chosenItems.length < 2;
}

export function ApplyMissionEvent(state, event) {
  const next = {
    ...state,
    breakfastTasks: [...state.breakfastTasks],
    chosenItems: [...state.chosenItems],
    rescuedGroups: [...state.rescuedGroups],
    battleTasks: [...state.battleTasks],
  };
  const type = event?.type;

  if (type === "Tick") {
    next.elapsedSeconds = Math.max(0, next.elapsedSeconds + Math.max(0, Number(event.seconds) || 0));
    return next;
  }

  if (type === "LowerDistress") {
    next.loweredDistress = true;
    return next;
  }

  if (next.phase === "Breakfast" && type === "CompleteBreakfastTask") {
    if (breakfastTasks.includes(event.task)) next.breakfastTasks = UniqueList([...next.breakfastTasks, event.task]);
    if (breakfastTasks.every((task) => next.breakfastTasks.includes(task))) {
      next.phase = "Choice";
      next.checkpoint = "Choice";
    }
    return next;
  }

  if (next.phase === "Choice" && type === "ChooseItem") {
    if (CanChooseItem(next, event.item)) next.chosenItems = [...next.chosenItems, event.item];
    return next;
  }

  if (next.phase === "Choice" && type === "EnterCellar" && next.chosenItems.length === 2) {
    next.phase = "Cellar";
    next.checkpoint = "Cellar";
    return next;
  }

  if (next.phase === "Cellar" && type === "CompleteCellar") {
    next.phase = "Rescue";
    next.cellarComplete = true;
    next.checkpoint = "Rescue";
    return next;
  }

  if (next.phase === "Rescue" && type === "FindRescueGroup") {
    if (!next.activeRescueGroup && rescueGroups.includes(event.group) && !next.rescuedGroups.includes(event.group)) {
      next.activeRescueGroup = event.group;
    }
    return next;
  }

  if (next.phase === "Rescue" && type === "DeliverRescueGroup" && next.activeRescueGroup) {
    next.rescuedGroups = UniqueList([...next.rescuedGroups, next.activeRescueGroup]);
    next.activeRescueGroup = null;
    if (rescueGroups.every((group) => next.rescuedGroups.includes(group))) {
      next.phase = "Battle";
      next.checkpoint = "Battle";
    }
    return next;
  }

  if (next.phase === "Battle" && type === "CompleteBattleTask") {
    const expected = battleTasks[next.battleTasks.length];
    if (event.task === expected) next.battleTasks = [...next.battleTasks, event.task];
    if (battleTasks.every((task) => next.battleTasks.includes(task))) {
      next.phase = "Reeds";
      next.checkpoint = "Reeds";
    }
    return next;
  }

  if (next.phase === "Reeds" && type === "CompleteFerryCrossing") {
    next.ferryCrossings = Math.min(3, next.ferryCrossings + 1);
    if (next.ferryCrossings >= 3) {
      next.phase = "Epilogue";
      next.checkpoint = "Epilogue";
    }
    return next;
  }

  return next;
}

export function BuildEpilogueSummary(state) {
  const saved = new Set(state.chosenItems);
  const itemOutcomes = itemIds.map((item) => ({
    item,
    saved: saved.has(item),
  }));
  return {
    title: "青槐庄没有守住，人走出来了",
    people: "三组共二十七人进入苇荡，另有村民从北沟自行转移。陈守义未归。",
    itemOutcomes,
    crossings: state.ferryCrossings,
    hasScore: false,
    hasKillCount: false,
    durationSeconds: Math.round(state.elapsedSeconds),
  };
}

export function IsMissionComplete(state) {
  return state.phase === "Epilogue" && state.ferryCrossings === 3;
}
