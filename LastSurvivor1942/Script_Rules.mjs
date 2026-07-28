export const gameConfig = Object.freeze({
  title: "火种：1942",
  subtitle: "最后关门的人",
  durationSeconds: 660,
  worldHalfSize: 58,
  interactionRadius: 4.4,
  minimumCiviliansForSuccess: 4,
  saveKey: "LastSurvivor1942_Save_V2",
});

export const patrolVision = Object.freeze({
  distance: 13.5,
  angle: 0.82,
  suspicionThreshold: 0.72,
  pursuitThreshold: 1.55,
  captureDistance: 3.1,
});

export const siteDefinitions = Object.freeze([
  Object.freeze({ id: "ruinedStation", type: "memory", act: 1, name: "被毁交通站", x: -42, z: -38, radius: 5 }),
  Object.freeze({ id: "wujiaVillage", type: "village", act: 1, name: "吴家庄祠堂", x: -30, z: -4, radius: 6 }),
  Object.freeze({ id: "fieldClinic", type: "medicine", act: 1, name: "废弃诊所", x: 2, z: -25, radius: 4 }),
  Object.freeze({ id: "grainDepot", type: "grain", act: 2, name: "侵华日军征粮点", x: 29, z: -17, radius: 5 }),
  Object.freeze({ id: "westContact", type: "contact", act: 2, name: "西沟磨盘暗号", x: -22, z: 18, radius: 4 }),
  Object.freeze({ id: "eastContact", type: "contact", act: 2, name: "东堤枯柳暗号", x: 27, z: 27, radius: 4 }),
  Object.freeze({ id: "radioCache", type: "radioPart", act: 2, name: "河沟电子管暗格", x: 18, z: 13, radius: 4 }),
  Object.freeze({ id: "relayStation", type: "radio", act: 2, name: "北坡联络站", x: -7, z: 31, radius: 5.5 }),
  Object.freeze({ id: "rosterTable", type: "roster", act: 3, name: "名单副本", x: -4, z: 33, radius: 4.8 }),
  Object.freeze({ id: "stationDoor", type: "door", act: 3, name: "联络站木门", x: -7, z: 36, radius: 4.8 }),
  Object.freeze({ id: "reedExit", type: "exit", act: 3, name: "苇荡渡口", x: 44, z: 43, radius: 6 }),
  Object.freeze({ id: "haystackWest", type: "hide", act: 0, name: "西田草垛", x: -19, z: -22, radius: 3 }),
  Object.freeze({ id: "haystackEast", type: "hide", act: 0, name: "东田草垛", x: 20, z: -7, radius: 3 }),
  Object.freeze({ id: "dryWell", type: "hide", act: 0, name: "枯井隐蔽处", x: 5, z: 20, radius: 3 }),
]);

export const obstacleDefinitions = Object.freeze([
  Object.freeze({ id: "stationRuin", x: -42, z: -38, radius: 4.1 }),
  Object.freeze({ id: "villageWest", x: -34, z: -6, radius: 3.3 }),
  Object.freeze({ id: "villageSouth", x: -27.6, z: -7.8, radius: 2.9 }),
  Object.freeze({ id: "villageEast", x: -25.5, z: -1.7, radius: 2.9 }),
  Object.freeze({ id: "villageNorth", x: -32.4, z: -.3, radius: 2.9 }),
  Object.freeze({ id: "clinic", x: 2, z: -25, radius: 3.4 }),
  Object.freeze({ id: "grainShed", x: 29, z: -17, radius: 3.7 }),
  Object.freeze({ id: "relay", x: -7, z: 31, radius: 3.5 }),
]);

export const civilianDefinitions = Object.freeze([
  Object.freeze({ id: "wangShen", name: "王婶", role: "搀扶赵叔，认得各户孩子", age: "adult", wounded: false }),
  Object.freeze({ id: "zhaoManCang", name: "赵满仓", role: "认得苇荡旧路，身受重伤", age: "elder", wounded: true }),
  Object.freeze({ id: "xiaoMan", name: "小满", role: "听力敏锐，牵着妹妹", age: "child", wounded: false }),
  Object.freeze({ id: "xiaoHe", name: "小禾", role: "紧跟姐姐，不肯丢下布鞋", age: "child", wounded: false }),
  Object.freeze({ id: "baiXing", name: "白杏", role: "乡村卫生员，负责包扎", age: "adult", wounded: false }),
]);

const patrolDefinitions = Object.freeze([
  Object.freeze({ id: "roadPatrol", name: "公路巡逻队", speed: 2.45, path: Object.freeze([[-17, -32], [10, -29], [32, -18], [18, -5], [-8, -12]]) }),
  Object.freeze({ id: "villagePatrol", name: "进村搜索队", speed: 2.2, path: Object.freeze([[-3, 2], [-24, -3], [-31, -5], [-19, 8], [-3, 2]]) }),
  Object.freeze({ id: "blockadePatrol", name: "封锁线巡逻队", speed: 2.35, path: Object.freeze([[30, -10], [32, 18], [20, 31], [0, 34], [11, 16]]) }),
  Object.freeze({ id: "riverPatrol", name: "河堤巡逻队", speed: 2.25, path: Object.freeze([[38, 39], [24, 25], [7, 18], [-6, 7], [10, 17], [30, 31]]) }),
]);

const interactionDurations = Object.freeze({
  memory: 12,
  village: 38,
  medicine: 25,
  grain: 38,
  contact: 32,
  radioPart: 26,
  radioRepair: 70,
  radioConfirm: 28,
  roster: 24,
  door: 15,
  exit: 30,
});

const Clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const Distance = (left, right) => Math.hypot(left.x - right.x, left.z - right.z);

function AddEvent(state, title, body, tone = "info") {
  state.eventSequence += 1;
  state.events.push({ id: state.eventSequence, at: state.elapsed, title, body, tone });
  if (state.events.length > 30) state.events.shift();
}

function CreatePatrol(definition) {
  const [x, z] = definition.path[0];
  const [nextX, nextZ] = definition.path[1];
  return {
    id: definition.id,
    name: definition.name,
    x,
    z,
    yaw: Math.atan2(nextX - x, nextZ - z),
    speed: definition.speed,
    path: definition.path.map(([pathX, pathZ]) => ({ x: pathX, z: pathZ })),
    waypoint: 1,
    mode: "patrol",
    alerted: false,
    detection: 0,
    searchTimer: 0,
    attackDelay: 0,
    lastKnown: null,
    lure: null,
  };
}

function CreateCivilian(definition, index) {
  return {
    ...definition,
    x: -32 + index * .9,
    z: 1 + (index % 2) * .7,
    health: definition.wounded ? 48 : 100,
    fear: 48,
    state: "detained",
    hidden: false,
    formationIndex: index,
  };
}

export function CreateGameState(options = {}) {
  const difficulty = options.difficulty === "story" ? "story" : "standard";
  const state = {
    difficulty,
    elapsed: 0,
    remaining: gameConfig.durationSeconds,
    paused: false,
    ended: false,
    success: false,
    endingId: "",
    act: 1,
    narrativeBeat: "returnHome",
    eventSequence: 0,
    events: [],
    player: { x: -42, z: -34, yaw: 0, health: 100, stamina: 100, hidden: false, sprinting: false, caughtSeconds: 0 },
    civilians: civilianDefinitions.map(CreateCivilian),
    liaison: { id: "linYan", name: "林砚", x: -8.4, z: 31.4, health: 42, state: "repairing", visible: true },
    alert: 12,
    hope: 28,
    grain: 1,
    medicine: 0,
    medicineUsed: false,
    wounded: 2,
    rescued: 0,
    safe: 0,
    lost: 0,
    radioPart: false,
    radioRepaired: false,
    contactsPreserved: 0,
    signalsConfirmed: 0,
    rosterDestroyed: false,
    stationClosed: false,
    rosterDelivered: false,
    villageState: "occupied",
    homeBurned: true,
    villageDeadline: difficulty === "story" ? 190 : 155,
    villageBurnDeadline: difficulty === "story" ? 335 : 285,
    finalPressure: false,
    activeInteraction: null,
    distractionCooldown: 0,
    usedSites: {},
    patrols: patrolDefinitions.map(CreatePatrol),
    score: null,
  };
  AddEvent(state, "第一幕 · 灶火熄灭", "我叫秦桂枝，是吴家庄的农民。昨夜侵华日军突袭交通站，烧了我家的东屋；天亮前，我得回村把邻里带出来。", "loss");
  AddEvent(state, "半块窝头，两个伤员", "余粮只够一人一天。受伤的共产党员林砚把最后半块窝头塞给孩子，自己留下修电台。乡亲仍被扣在祠堂前。", "hardship");
  return state;
}

function SegmentIntersectsObstacle(from, to, obstacle) {
  const lineX = to.x - from.x;
  const lineZ = to.z - from.z;
  const lengthSquared = lineX * lineX + lineZ * lineZ;
  if (lengthSquared < .0001) return false;
  const ratio = Clamp(((obstacle.x - from.x) * lineX + (obstacle.z - from.z) * lineZ) / lengthSquared, 0, 1);
  const closestX = from.x + lineX * ratio;
  const closestZ = from.z + lineZ * ratio;
  return Math.hypot(closestX - obstacle.x, closestZ - obstacle.z) < obstacle.radius;
}

export function HasLineOfSight(from, to) {
  return !obstacleDefinitions.some((obstacle) => {
    if (Distance(from, obstacle) < obstacle.radius + .15 || Distance(to, obstacle) < obstacle.radius + .15) return false;
    return SegmentIntersectsObstacle(from, to, obstacle);
  });
}

function IsPositionWalkable(point) {
  if (Math.abs(point.x) > gameConfig.worldHalfSize || Math.abs(point.z) > gameConfig.worldHalfSize) return false;
  return !obstacleDefinitions.some((obstacle) => Distance(point, obstacle) < obstacle.radius + .58);
}

function GetHideSite(entity) {
  return siteDefinitions.find((site) => site.type === "hide" && Distance(entity, site) <= site.radius);
}

function MovePatrolToward(patrol, target, deltaSeconds, multiplier = 1) {
  const directionX = target.x - patrol.x;
  const directionZ = target.z - patrol.z;
  const length = Math.max(.001, Math.hypot(directionX, directionZ));
  if (length < .45) return true;
  const candidate = {
    x: patrol.x + directionX / length * patrol.speed * multiplier * deltaSeconds,
    z: patrol.z + directionZ / length * patrol.speed * multiplier * deltaSeconds,
  };
  if (IsPositionWalkable(candidate)) {
    patrol.x = candidate.x;
    patrol.z = candidate.z;
  } else {
    patrol.yaw += .8 * deltaSeconds;
    const sidestep = { x: patrol.x + Math.sin(patrol.yaw) * patrol.speed * deltaSeconds, z: patrol.z + Math.cos(patrol.yaw) * patrol.speed * deltaSeconds };
    if (IsPositionWalkable(sidestep)) {
      patrol.x = sidestep.x;
      patrol.z = sidestep.z;
    }
  }
  patrol.yaw = Math.atan2(directionX, directionZ);
  return false;
}

function MovePatrolOnRoute(patrol, deltaSeconds, multiplier) {
  const target = patrol.path[patrol.waypoint];
  if (MovePatrolToward(patrol, target, deltaSeconds, multiplier)) patrol.waypoint = (patrol.waypoint + 1) % patrol.path.length;
}

function TargetVisibleToPatrol(target, patrol) {
  const distance = Distance(target, patrol);
  if (distance > patrolVision.distance) return false;
  if (target.hidden && distance > 2.35) return false;
  const direction = Math.atan2(target.x - patrol.x, target.z - patrol.z);
  const angle = Math.atan2(Math.sin(direction - patrol.yaw), Math.cos(direction - patrol.yaw));
  return Math.abs(angle) < patrolVision.angle && HasLineOfSight(patrol, target);
}

function GetVisibleTarget(state, patrol) {
  const targets = [state.player, ...state.civilians.filter((civilian) => civilian.state === "following")];
  return targets.filter((target) => TargetVisibleToPatrol(target, patrol)).sort((left, right) => Distance(left, patrol) - Distance(right, patrol))[0] || null;
}

function UpdatePatrols(state, deltaSeconds) {
  let activelyPursuing = false;
  const alertMultiplier = 1 + state.alert / 250 + (state.finalPressure ? .2 : 0);
  state.patrols.forEach((patrol) => {
    const visibleTarget = GetVisibleTarget(state, patrol);
    if (visibleTarget) {
      patrol.lastKnown = { x: visibleTarget.x, z: visibleTarget.z };
      patrol.detection = Clamp(patrol.detection + deltaSeconds * (visibleTarget.sprinting ? 1.05 : .72), 0, 3);
      if (patrol.detection < patrolVision.suspicionThreshold) {
        patrol.mode = "suspicious";
        patrol.alerted = false;
      } else if (patrol.detection < patrolVision.pursuitThreshold) {
        patrol.mode = "investigate";
        patrol.alerted = false;
        MovePatrolToward(patrol, patrol.lastKnown, deltaSeconds, 1.02);
      } else {
        if (!patrol.alerted) AddEvent(state, "搜索队发现了动静", `${patrol.name}开始向最后看到的位置合围。先让乡亲进隐蔽处，不要跑上公路。`, "loss");
        patrol.mode = state.alert >= 72 ? "coordinate" : "search";
        patrol.alerted = true;
        patrol.searchTimer = 14 + state.alert * .12;
        patrol.attackDelay += deltaSeconds;
        activelyPursuing = true;
        state.alert = Clamp(state.alert + deltaSeconds * 5.2, 0, 100);
        MovePatrolToward(patrol, patrol.lastKnown, deltaSeconds, alertMultiplier);
        const distance = Distance(visibleTarget, patrol);
        if (distance <= patrolVision.captureDistance && patrol.attackDelay >= 1) {
          if (visibleTarget === state.player) {
            state.player.health = Clamp(state.player.health - deltaSeconds * (state.difficulty === "story" ? 8 : 12), 0, 100);
            state.player.caughtSeconds += deltaSeconds;
          } else {
            visibleTarget.fear = Clamp(visibleTarget.fear + deltaSeconds * 24, 0, 100);
            visibleTarget.health = Clamp(visibleTarget.health - deltaSeconds * 5, 10, 100);
          }
        }
      }
    } else {
      patrol.attackDelay = 0;
      patrol.detection = Clamp(patrol.detection - deltaSeconds * .5, 0, 3);
      if (patrol.lure) {
        patrol.mode = "investigate";
        if (MovePatrolToward(patrol, patrol.lure, deltaSeconds, 1.05)) {
          patrol.lure = null;
          patrol.searchTimer = 6;
        }
      } else if (["search", "coordinate", "investigate"].includes(patrol.mode) && patrol.lastKnown) {
        patrol.alerted = patrol.mode === "search" || patrol.mode === "coordinate";
        activelyPursuing ||= patrol.alerted;
        patrol.searchTimer -= deltaSeconds;
        MovePatrolToward(patrol, patrol.lastKnown, deltaSeconds, alertMultiplier);
        if (patrol.searchTimer <= 0) {
          patrol.mode = "patrol";
          patrol.alerted = false;
          patrol.lastKnown = null;
        }
      } else {
        patrol.mode = "patrol";
        patrol.alerted = false;
        MovePatrolOnRoute(patrol, deltaSeconds, alertMultiplier);
      }

      if (state.player.sprinting && Distance(state.player, patrol) < 9.5 && HasLineOfSight(patrol, state.player) && patrol.mode === "patrol") {
        patrol.lure = { x: state.player.x, z: state.player.z };
        patrol.mode = "investigate";
      }
    }
  });
  if (!activelyPursuing) state.alert = Clamp(state.alert - deltaSeconds * .32, 0, 100);
}

function UpdateCivilians(state, deltaSeconds) {
  const followers = state.civilians.filter((civilian) => civilian.state === "following");
  followers.forEach((civilian, index) => {
    const leader = index === 0 ? state.player : followers[index - 1];
    const column = index % 2 ? .55 : -.55;
    const row = 1.5 + Math.floor(index / 2) * 1.25;
    const target = {
      x: leader.x - Math.sin(state.player.yaw) * row + Math.cos(state.player.yaw) * column,
      z: leader.z - Math.cos(state.player.yaw) * row - Math.sin(state.player.yaw) * column,
    };
    const distance = Distance(civilian, target);
    const woundMultiplier = civilian.wounded && !state.medicineUsed ? .62 : 1;
    const fearMultiplier = Clamp(1.12 - civilian.fear / 220, .62, 1);
    const speed = 3.25 * woundMultiplier * fearMultiplier;
    if (distance > .12) {
      const candidate = {
        x: civilian.x + (target.x - civilian.x) / Math.max(distance, .001) * Math.min(distance, speed * deltaSeconds),
        z: civilian.z + (target.z - civilian.z) / Math.max(distance, .001) * Math.min(distance, speed * deltaSeconds),
      };
      if (IsPositionWalkable(candidate)) {
        civilian.x = candidate.x;
        civilian.z = candidate.z;
      }
    }
    civilian.hidden = Boolean(GetHideSite(civilian));
    civilian.fear = Clamp(civilian.fear - deltaSeconds * (state.grain >= 4 ? 1.1 : .45), 12, 100);
  });
}

function UpdateOccupation(state) {
  if (state.rescued > 0) return;
  if (state.villageState === "occupied" && state.elapsed >= state.villageDeadline) {
    state.villageState = "confiscated";
    state.hope = Clamp(state.hope - 9, 0, 100);
    AddEvent(state, "吴家庄被强征", "侵华日军与伪警挨户搜走种粮，把拒绝交代联络网的村民捆在祠堂前。灶里没米，地里也将没有下一季。", "loss");
  }
  if (state.villageState !== "burned" && state.elapsed >= state.villageBurnDeadline) {
    state.villageState = "burned";
    state.homeBurned = true;
    state.lost = 3;
    AddEvent(state, "纵火与押解", "侵华日军烧毁民房并押走未能转移的平民。这不是秦桂枝的“惩罚”，责任只属于实施集体暴力的侵略者。", "loss");
  }
}

function CalculateScore(state) {
  const safeRatio = state.safe / civilianDefinitions.length;
  const networkRatio = Clamp(state.contactsPreserved / 2, 0, 1);
  const discipline = Clamp(1 - state.player.caughtSeconds / 20 - Math.max(0, state.alert - 55) / 180, 0, 1);
  const mission = [state.radioRepaired, state.signalsConfirmed === 3, state.rosterDestroyed, state.stationClosed].filter(Boolean).length / 4;
  return {
    total: Math.round((safeRatio * .42 + networkRatio * .22 + mission * .22 + discipline * .14) * 100),
    civilian: Math.round(safeRatio * 100),
    mission: Math.round(mission * 100),
    discipline: Math.round(discipline * 100),
    survival: Math.round(Clamp((state.player.health + state.hope) / 2, 0, 100)),
  };
}

function Finish(state, success, endingId, title, body) {
  if (state.ended) return;
  state.ended = true;
  state.success = success;
  state.endingId = endingId;
  state.activeInteraction = null;
  state.score = CalculateScore(state);
  AddEvent(state, title, body, success ? "success" : "loss");
}

function GetInteractionDuration(state, kind) {
  const base = interactionDurations[kind] || 10;
  return base * (state.difficulty === "story" ? .76 : 1);
}

function CheckFirstActTransition(state) {
  if (state.act !== 1) return;
  if (state.usedSites.ruinedStation && state.rescued >= gameConfig.minimumCiviliansForSuccess && state.medicine > 0) {
    state.act = 2;
    state.narrativeBeat = "peopleBeforeStation";
    AddEvent(state, "第二幕 · 人比站重要", "现在不是我一个人赶路。王婶扶赵叔，小满牵小禾，白杏重新包扎。我们得取回种粮、接上两个暗号点，再把林砚守着的电台修起来。", "info");
  }
}

function CompleteInteraction(state, site) {
  state.activeInteraction = null;
  if (site.type === "memory") {
    state.usedSites[site.id] = true;
    AddEvent(state, "我家的东屋", "我认得焦梁下那双补了三次的布鞋。炕沿下压着林砚的字条：“站房可以丢，不能让乡亲替我们挡灾。桂枝，你熟沟路。”", "hardship");
  } else if (site.type === "village") {
    if (state.villageState === "burned") {
      state.civilians.slice(0, 2).forEach((civilian) => { civilian.state = "following"; });
      state.rescued = 2;
      Finish(state, false, "occupation", "转移被侵略暴力截断", "废墟里只找到王婶和小满。侵华日军已经押走其余乡亲，这条交通线无法靠两个人独自接续。");
      return;
    }
    state.civilians.forEach((civilian, index) => {
      civilian.state = "following";
      civilian.x = state.player.x - index * .55;
      civilian.z = state.player.z + 1 + index * .4;
    });
    state.rescued = state.civilians.length;
    state.hope = Clamp(state.hope + (state.villageState === "occupied" ? 22 : 13), 0, 100);
    AddEvent(state, "五个人，一个都不能漏", "我割开绳索。王婶扶赵叔，小满牵妹妹，白杏收紧绷带。赵叔说东沟没有岗哨——乡亲靠自己的土地知识组成了队伍。", "success");
  } else if (site.type === "medicine") {
    state.usedSites[site.id] = true;
    state.medicine = 1;
    AddEvent(state, "半包磺胺", "药只够一个重伤员。林砚按住自己的伤口说：“先给赵叔，他认得苇荡旧路。”药在我手上，等找到乡亲再决定。", "hardship");
  } else if (site.type === "grain") {
    state.usedSites[site.id] = true;
    state.grain = 4;
    state.hope = Clamp(state.hope + 12, 0, 100);
    state.villageState = "evacuatedBurned";
    state.homeBurned = true;
    AddEvent(state, "中点 · 种粮回来了，家没有", "三袋谷子原本就是乡亲的。我刚把它们分回背篓，远处东屋起了火——侵华日军正在烧已经撤空的村子。我们保住了人和下一季，却再也回不到原来的家。", "hardship");
  } else if (site.type === "contact") {
    state.usedSites[site.id] = true;
    state.contactsPreserved = Object.keys(state.usedSites).filter((id) => ["westContact", "eastContact"].includes(id)).length;
    if (site.id === "westContact") AddEvent(state, "磨盘下的草灰", "秦家的三短一长暗号还在。小满先听见靴声，大家伏进沟底；孩子不是负担，她替我们赢得了半分钟。", "success");
    else AddEvent(state, "枯柳上的布结", "王婶认出白杏娘留下的布结。两个村的报平安办法还活着，交通线不是一台机器，而是彼此记得的手势。", "success");
    if (state.contactsPreserved === 1) AddEvent(state, "低点 · 原来的水渠被封", "封锁沟新设了岗哨，林砚也搬不动电台。赵叔指向一条长满旧芦根的岔沟：“我年轻时挖过，那边能绕。”新路是乡亲共同想出来的。", "loss");
  } else if (site.type === "radioPart") {
    state.usedSites[site.id] = true;
    state.radioPart = true;
    AddEvent(state, "河沟里的电子管", "牺牲的交通员用油布把它埋在沟壁。林砚懂短码，我认沟路；少了哪一种知识，这条线都接不上。", "success");
  } else if (site.type === "radio" && state.act === 2) {
    state.radioRepaired = true;
    state.act = 3;
    state.narrativeBeat = "lastToLeave";
    state.finalPressure = true;
    state.alert = Math.max(state.alert, 48);
    AddEvent(state, "第三幕 · 最后关门的人", "三个短码发了出去，接应会在苇荡等。短波也暴露了方位。先听完三组报平安，再烧名单副本、关站门，让林砚和乡亲先走。", "success");
  } else if (site.type === "radio" && state.act === 3) {
    state.signalsConfirmed = 3;
    AddEvent(state, "三组信号都到了", "西沟一声鸟叫、东堤两下石响、苇荡一盏遮住的灯。王婶开始点名，林砚背起电台。现在只剩不能落进敌手的纸。", "success");
  } else if (site.type === "roster") {
    state.rosterDestroyed = true;
    state.rosterDelivered = true;
    AddEvent(state, "名字记在人心里", "我和白杏逐户核对，把必要的联络名单交给林砚，只烧掉无法带走的副本。纸成了灰，名字没有消失。", "hardship");
  } else if (site.type === "door") {
    state.stationClosed = true;
    state.liaison.state = "evacuating";
    AddEvent(state, "最后关门的人", "林砚和乡亲先下沟。我摸了摸木门上被烟熏黑的凹痕，亲手把门合上。王婶在沟口喊：“你不是最后一个人，你只是最后关门的。关上，跟我们走。”", "success");
  } else if (site.type === "exit") {
    state.civilians.filter((civilian) => civilian.state === "following").forEach((civilian) => { civilian.state = "evacuated"; });
    state.safe = state.civilians.filter((civilian) => civilian.state === "evacuated").length;
    if (state.safe < gameConfig.minimumCiviliansForSuccess) {
      Finish(state, false, "peopleMissing", "侵略封锁截断了转移", "苇荡接应点没有等到足够的乡亲。活着抵达的人继续呼喊失散者的名字，这不是完成。");
      return;
    }
    Finish(state, true, "network", "火种越过封锁线", "王婶、赵满仓、小满、小禾、白杏逐一报了平安。站房没能守住，普通人的互助与共产党员维系的组织却接到了下一村。");
  }
  CheckFirstActTransition(state);
}

function UpdateInteraction(state, deltaSeconds) {
  if (!state.activeInteraction) return false;
  const interaction = state.activeInteraction;
  const site = siteDefinitions.find((candidate) => candidate.id === interaction.siteId);
  if (!site || Distance(state.player, site) > Math.max(site.radius, gameConfig.interactionRadius) + 1.2) {
    state.activeInteraction = null;
    return false;
  }
  const threat = state.patrols.some((patrol) => patrol.alerted && Distance(patrol, state.player) < 7);
  if (threat) {
    state.activeInteraction = null;
    AddEvent(state, "动作被搜索打断", "靴声已经逼近，先带大家脱离视线，等安全后再继续。", "loss");
    return false;
  }
  interaction.progress += deltaSeconds;
  if (interaction.progress >= interaction.duration) CompleteInteraction(state, site);
  return true;
}

export function StepGame(state, deltaSeconds, input = {}) {
  if (state.ended || state.paused) return state;
  const delta = Clamp(deltaSeconds, 0, .05);
  state.elapsed += delta;
  state.remaining = Math.max(0, gameConfig.durationSeconds - state.elapsed);
  state.distractionCooldown = Math.max(0, state.distractionCooldown - delta);

  const interacting = UpdateInteraction(state, delta);
  const moveX = Clamp(Number(input.moveX) || 0, -1, 1);
  const moveZ = Clamp(Number(input.moveZ) || 0, -1, 1);
  const movementLength = Math.hypot(moveX, moveZ);
  const followers = state.civilians.filter((civilian) => civilian.state === "following");
  const untreatedWounded = followers.some((civilian) => civilian.wounded && !state.medicineUsed);
  const groupMultiplier = followers.length ? (untreatedWounded ? .72 : .88) : 1;
  const touchSprint = Boolean(input.sprint) || movementLength > .92 && Boolean(input.touch);
  const wantsSprint = !interacting && touchSprint && state.player.stamina > 2 && movementLength > .1;
  const speed = (wantsSprint ? 5.1 : 3.35) * groupMultiplier;
  state.player.sprinting = wantsSprint;
  if (!interacting && movementLength > .05) {
    const candidate = {
      x: state.player.x + moveX / movementLength * speed * delta,
      z: state.player.z + moveZ / movementLength * speed * delta,
    };
    if (IsPositionWalkable(candidate)) {
      state.player.x = candidate.x;
      state.player.z = candidate.z;
    }
    state.player.yaw = Math.atan2(moveX, moveZ);
  }
  state.player.stamina = Clamp(state.player.stamina + (wantsSprint ? -22 : 13) * delta, 0, 100);
  state.player.hidden = Boolean(GetHideSite(state.player));

  UpdateCivilians(state, delta);
  UpdatePatrols(state, delta);
  UpdateOccupation(state);

  if (state.player.health <= 0) Finish(state, false, "captured", "侵略封锁截断了消息", "秦桂枝在封锁线上失去行动能力。仍有人困在村中，下一名交通员还不知道这些名字。");
  else if (state.remaining <= 0) Finish(state, false, "sweep", "合围封闭", "侵华日军的搜索封住了苇荡出口。留下的人和未送出的名单再次落入危险。 ");
  return state;
}

export function FindNearbySite(state) {
  let nearest = null;
  let nearestDistance = Infinity;
  siteDefinitions.forEach((site) => {
    const distance = Distance(state.player, site);
    if (distance <= Math.max(gameConfig.interactionRadius, site.radius) && distance < nearestDistance) {
      nearest = site;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function DisabledAction(label, reason) {
  return { label, disabled: true, reason, duration: 0 };
}

export function GetSiteAction(state, site) {
  if (!site) return null;
  if (state.activeInteraction?.siteId === site.id) {
    const ratio = Clamp(state.activeInteraction.progress / state.activeInteraction.duration, 0, 1);
    return { label: `${state.activeInteraction.label} ${Math.round(ratio * 100)}%`, disabled: true, duration: state.activeInteraction.duration, progress: ratio };
  }
  if (site.type === "hide") return DisabledAction(state.player.hidden ? "保持隐蔽" : "进入隐蔽处", "进入范围会自动隐蔽");
  if (site.type === "memory") return state.usedSites[site.id] ? DisabledAction("东屋遗物已确认", "已经完成") : { label: "辨认东屋遗物和林砚字条", disabled: false, duration: GetInteractionDuration(state, "memory") };
  if (site.type === "village") {
    if (state.act !== 1) return DisabledAction("祠堂已经撤空", "第一幕已结束");
    if (!state.usedSites.ruinedStation) return DisabledAction("先回东屋确认家人与名单", "尚未完成第一幕激励事件");
    return { label: state.villageState === "burned" ? "在废墟寻找幸存者" : "数清五户，解开绳索", disabled: state.rescued > 0, duration: GetInteractionDuration(state, "village") };
  }
  if (site.type === "medicine") {
    if (state.act !== 1) return DisabledAction("诊所已经搜过", "第一幕已结束");
    return state.usedSites[site.id] ? DisabledAction("半包磺胺已取走", "已经完成") : { label: "在空药箱里找止血药", disabled: false, duration: GetInteractionDuration(state, "medicine") };
  }
  if (site.type === "radio" && state.act === 3) return state.signalsConfirmed === 3 ? DisabledAction("三组信号已经确认", "已经完成") : { label: "静听三组报平安短码", disabled: false, duration: GetInteractionDuration(state, "radioConfirm") };
  if (site.act !== state.act) return DisabledAction("这一步还不能做", `当前是第${state.act}幕`);
  if (site.type === "grain") return state.usedSites[site.id] ? DisabledAction("种粮已分回各户", "已经完成") : { label: "辨认并分装三袋种粮", disabled: false, duration: GetInteractionDuration(state, "grain") };
  if (site.type === "contact") {
    if (state.grain < 4) return DisabledAction("先把被强征的种粮取回来", "第二幕中点尚未发生");
    return state.usedSites[site.id] ? DisabledAction("暗号点已经确认", "已经完成") : { label: site.id === "westContact" ? "检查磨盘下的草灰暗号" : "检查枯柳上的布结暗号", disabled: false, duration: GetInteractionDuration(state, "contact") };
  }
  if (site.type === "radioPart") return state.radioPart ? DisabledAction("电子管已取出", "已经完成") : { label: "从沟壁取出备用电子管", disabled: false, duration: GetInteractionDuration(state, "radioPart") };
  if (site.type === "radio" && state.act === 2) {
    if (!state.radioPart) return DisabledAction("缺少备用电子管", "先去河沟暗格");
    if (state.grain < 4) return DisabledAction("乡亲还没有下一季种粮", "先去征粮点");
    if (state.contactsPreserved < 2) return DisabledAction(`还差 ${2 - state.contactsPreserved} 个报平安暗号`, "两个联络点都必须确认");
    return { label: "与林砚共同修复电台", disabled: false, duration: GetInteractionDuration(state, "radioRepair") };
  }
  if (site.type === "roster") {
    if (state.signalsConfirmed !== 3) return DisabledAction("先确认三组乡亲都已上路", "报平安尚未齐全");
    return state.rosterDestroyed ? DisabledAction("副本已焚毁，必要名单已交接", "已经完成") : { label: "逐户核名，焚毁无法带走的副本", disabled: false, duration: GetInteractionDuration(state, "roster") };
  }
  if (site.type === "door") {
    if (!state.rosterDestroyed) return DisabledAction("名单副本仍在站内", "先完成核名与交接");
    return state.stationClosed ? DisabledAction("木门已经关上", "已经完成") : { label: "让乡亲先走，亲手关上站门", disabled: false, duration: GetInteractionDuration(state, "door") };
  }
  if (site.type === "exit") {
    if (!state.stationClosed) return DisabledAction("还不能走：站门没有关", "完成最后关门动作");
    if (state.rescued < gameConfig.minimumCiviliansForSuccess) return DisabledAction("人数不足，不能宣告转移完成", "至少四名乡亲必须同行");
    return { label: "逐个点名，带乡亲进入苇荡", disabled: false, duration: GetInteractionDuration(state, "exit") };
  }
  return null;
}

export function InteractWithSite(state, siteId) {
  if (state.ended || state.activeInteraction) return false;
  const site = siteDefinitions.find((candidate) => candidate.id === siteId);
  if (!site || Distance(state.player, site) > Math.max(gameConfig.interactionRadius, site.radius) + .6) return false;
  const action = GetSiteAction(state, site);
  if (!action || action.disabled) return false;
  state.activeInteraction = { siteId, label: action.label, progress: 0, duration: action.duration };
  return true;
}

export function UseMedicine(state) {
  if (state.medicine <= 0 || state.rescued <= 0 || state.medicineUsed || state.ended) return false;
  const zhao = state.civilians.find((civilian) => civilian.id === "zhaoManCang");
  state.medicine = 0;
  state.medicineUsed = true;
  state.wounded = Math.max(1, state.wounded - 1);
  zhao.wounded = false;
  zhao.health = 82;
  zhao.fear = Math.max(20, zhao.fear - 20);
  state.hope = Clamp(state.hope + 12, 0, 100);
  AddEvent(state, "药给了认路的人", "唯一的一剂药留给赵叔。林砚重新扎紧自己的布条，王婶腾出手扶他；队伍走得快了一些，但没有谁因此变成“可牺牲的资源”。", "success");
  return true;
}

export function ThrowDistraction(state) {
  if (state.distractionCooldown > 0 || state.ended) return false;
  const target = {
    x: Clamp(state.player.x + Math.sin(state.player.yaw) * 10, -gameConfig.worldHalfSize, gameConfig.worldHalfSize),
    z: Clamp(state.player.z + Math.cos(state.player.yaw) * 10, -gameConfig.worldHalfSize, gameConfig.worldHalfSize),
  };
  let nearest = null;
  let nearestDistance = Infinity;
  state.patrols.forEach((patrol) => {
    const distance = Distance(patrol, target);
    if (distance < 18 && distance < nearestDistance) {
      nearest = patrol;
      nearestDistance = distance;
    }
  });
  if (!nearest) return false;
  state.distractionCooldown = 7;
  nearest.lure = target;
  nearest.mode = "investigate";
  nearest.detection = Math.max(0, nearest.detection - .3);
  state.alert = Clamp(state.alert + 2, 0, 100);
  return true;
}

export function GetObjectives(state) {
  if (state.act === 1) return [
    { id: "memory", label: "回东屋辨认遗物与字条", detail: state.usedSites.ruinedStation ? "我认出了自家的布鞋和林砚字条" : "先知道谁还没回来", complete: Boolean(state.usedSites.ruinedStation), urgent: true },
    { id: "civilians", label: "去祠堂数清并带出五户邻里", detail: state.rescued ? `${state.rescued} 人跟上了，还没有人抵达苇荡` : "侵华日军的征粮与搜索正在推进", complete: state.rescued >= 4, urgent: true },
    { id: "medicine", label: "去废弃诊所找止血药", detail: state.medicine > 0 ? "半包磺胺在我手上" : "赵叔与林砚都在失血", complete: state.medicine > 0, urgent: false },
  ];
  if (state.act === 2) return [
    { id: "grain", label: "取回被强征的种粮", detail: state.grain >= 4 ? "三袋种粮已分回各户背篓" : "这不是战利品，是明年的庄稼", complete: state.grain >= 4, urgent: false },
    { id: "contacts", label: "确认西沟、东堤两个暗号点", detail: `${state.contactsPreserved}/2 个村际联络仍在`, complete: state.contactsPreserved >= 2, urgent: false },
    { id: "radio", label: "取得电子管，与林砚修复电台", detail: state.radioPart ? "电子管在身上" : "先去河沟暗格", complete: state.radioRepaired, urgent: false },
  ];
  return [
    { id: "signals", label: "在电台旁确认三组报平安", detail: `${state.signalsConfirmed}/3 组信号`, complete: state.signalsConfirmed === 3, urgent: true },
    { id: "roster", label: "核对名字，焚毁名单副本", detail: state.rosterDestroyed ? "必要名单已交林砚，副本已焚毁" : "纸不能落进侵略军手中", complete: state.rosterDestroyed, urgent: false },
    { id: "door", label: "让大家先走，最后关上站门", detail: state.stationClosed ? "门已关，跟上乡亲" : "这一次，由我来最后关门", complete: state.stationClosed, urgent: false },
    { id: "exit", label: "逐个点名，穿过苇荡", detail: state.safe ? `${state.safe} 人抵达` : "解绳不等于安全，必须走到接应点", complete: state.success, urgent: state.stationClosed },
  ];
}

export function GetActLabel(state) {
  if (state.act === 1) return "第一幕 · 灶火熄灭";
  if (state.act === 2) return "第二幕 · 人比站重要";
  return "第三幕 · 最后关门的人";
}

export function GetEvaluation(state) {
  return state.score || CalculateScore(state);
}

export function GetDistance(left, right) {
  return Distance(left, right);
}

export function GetMinimumInteractionSeconds(difficulty = "standard") {
  const multiplier = difficulty === "story" ? .76 : 1;
  return (Object.values(interactionDurations).reduce((total, duration) => total + duration, 0) + interactionDurations.contact) * multiplier;
}
