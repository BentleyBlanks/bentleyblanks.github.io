// 「北沙河单村合并版」分叉段（08–13）绝对时间采样与场面演出（纯函数，零 DOM、零 three）。
// 任意正向/反向拖动时间轴均可确定性还原同一帧人物、桥面、车辆与空袭状态。

import {
  MERGED_SIGNALS, MERGED_SURFACES, MERGED_DIALOGUE,
} from "./Data_LevelFlowMerged.mjs";
import { Clamp, Distance, Lerp, SampleBeatRoute, SampleRoute } from "../FirstLevelEncounter/Script_LevelFlowGeometry.mjs";

function Actor(id, name, side, kind, p, pose = "stand", extra = {}) {
  return { id, name, side, kind, p: [...p], pose, ...extra };
}

function Track(keys, time, timeline) {
  const points = keys.map(([id, fraction, x, z]) => {
    const beat = timeline.find((entry) => entry.id === id);
    return [beat.start + beat.duration * fraction, x, z];
  });
  if (time <= points[0][0]) return points[0].slice(1);
  for (let index = 1; index < points.length; index++) {
    if (time > points[index][0]) continue;
    const a = points[index - 1], b = points[index];
    const fraction = Clamp((time - a[0]) / Math.max(0.001, b[0] - a[0]), 0, 1);
    return [Lerp(a[1], b[1], fraction), Lerp(a[2], b[2], fraction)];
  }
  return points.at(-1).slice(1);
}

function PlayerAt(time, timeline) {
  const beat = timeline.find((entry) => time < entry.end) ?? timeline.at(-1);
  return SampleBeatRoute(beat, Clamp((time - beat.start) / beat.duration, 0, 1));
}

function BehindPlayer(beat, progress, metres, timeline) {
  let remaining = metres;
  const beatIndex = timeline.indexOf(beat);
  for (let index = beatIndex; index >= 0; index--) {
    const route = timeline[index].p;
    const length = route.slice(1).reduce((total, point, slot) => total + Distance(route[slot], point), 0);
    const travelled = length * (index === beatIndex ? progress : 1);
    if (length > 0 && travelled >= remaining) return SampleRoute(route, (travelled - remaining) / length);
    remaining -= travelled;
    if (timeline[index].id === "11c") return [...route[0]];
  }
  return [...beat.p[0]];
}

const CART_MAIN_STREET = [
  [104, 486], [114, 520], [140, 560], [146, 564], [163, 586],
  [172, 600], [146, 607], [121, 613], [122.3, 639],
];

const NIER_SLIP_BACK = [
  [121, 639], [121, 613], [84, 613], [84, 561], [86, 533],
];

const SHELTER_DASH = [
  [122.3, 639], [121, 642.5], [121, 664], [108, 664], [108, 659.6], [100, 659.6],
];

const LEADER_KEYS = [
  ["08b", 0.5, 99, 475], ["08b", 1, 118, 478],
  ["08d", 1, 118, 478], ["09a", 0.6, 126, 520], ["09b", 1, 136, 556],
  ["09d", 0.4, 136, 556], ["09d", 1, 133, 563],
  ["10a", 0, 133, 563], ["10a", 1, 121, 613],
  ["10c", 0.8, 108, 664], ["11b", 0, 104, 661], ["11c", 1, 121, 675],
  ["13a", 0, 121, 675], ["13a", 0.35, 60, 710], ["13a", 0.7, -20, 727], ["13a", 1, -68, 742],
  ["13b", 0.6, -68, 742], ["13b", 1, -76, 745],
  ["13c", 0, -80, 746], ["13c", 0.45, -80, 772], ["13c", 0.85, -80, 794], ["13c", 1, -87, 798],
];

export function MergedSignals(time, timeline) {
  const signals = ["Stage0105Done", "DugoutCollapsed", "L1TrunkLoaded", "CartDeparted", "L1TrunkTossed", "L1SunkenRoadBlocked"];
  for (const signal of MERGED_SIGNALS) {
    const beat = timeline.find((entry) => entry.id === signal.beat);
    if (beat && time >= beat.start + beat.duration * signal.fraction) signals.push(signal.id);
  }
  return signals;
}

export function MergedSurfaceAt(point, signals = []) {
  const Inside = (bounds) => point[0] >= bounds[0] && point[0] <= bounds[1] && point[1] >= bounds[2] && point[1] <= bounds[3];
  const surface = MERGED_SURFACES.find((entry) => Inside(entry.bounds)
    && !(signals.includes(entry.hideOn) && Inside(entry.brokenBounds || entry.bounds)));
  return surface?.y ?? null;
}

export function MergedActors(beat, time, player, progress, timeline) {
  const Beat = (id) => timeline.find((entry) => entry.id === id);
  const At = (id, fraction = 0) => Beat(id).start + Beat(id).duration * fraction;
  const Follow = (delay) => PlayerAt(Math.max(At("08a"), time - delay), timeline);
  const actors = [Actor("player", "顺子", "player", "person", player, beat.cover ? "kneel" : beat.pose, { lookAt: beat.lookAt })];

  // 老耿驴车：08a 抵沟口 → 08b 妮儿牵过板桥 → 08c 先行沿主街送冬瓜去西南救护所 → 10c 空袭焚毁
  const cartEnd = At("08c", 0.9);
  let cart = [122.3, 639];
  let nextCart = cart;
  if (beat.id === "08a") {
    const ct = Math.min(time + 1.5, At("08a", 1));
    cart = PlayerAt(ct, timeline);
    nextCart = PlayerAt(Math.min(ct + 0.1, At("08a", 1)), timeline);
  } else if (beat.id === "08b") {
    const bridgeT = Clamp((progress - 0.35) / 0.65, 0, 1);
    cart = SampleRoute([[99, 468], [99, 471], [99, 476], [104, 486]], bridgeT);
    nextCart = SampleRoute([[99, 468], [99, 471], [99, 476], [104, 486]], Clamp(bridgeT + 0.02, 0, 1));
  } else if (time < cartEnd) {
    const streetT = Clamp((time - At("08c")) / (cartEnd - At("08c")), 0, 1);
    cart = SampleRoute(CART_MAIN_STREET, streetT);
    nextCart = SampleRoute(CART_MAIN_STREET, Clamp(streetT + 0.02, 0, 1));
  }
  const heading = Distance(cart, nextCart) > 0.01 ? Math.atan2(nextCart[0] - cart[0], -(nextCart[1] - cart[1])) : Math.PI;
  const burned = time >= At("10c", 0.25);
  if (!burned) {
    actors.push(Actor("cart", "老耿的车", "civilian", "cart", cart, "stand", { heading }));
    const donkey = beat.id === "08b" && progress < 0.35 ? [99, 468]
      : [cart[0] + Math.sin(heading) * 2.3, cart[1] - Math.cos(heading) * 2.3];
    actors.push(Actor("donkey", "黑子", "civilian", "donkey", donkey, beat.id === "08b" && progress < 0.35 ? "stand" : "walk", { heading }));
  }

  // 冬瓜：08a-08c 乘车先行到救护所 → 08d-10a 在救护所院心等止血 → 10b 抬上车 → 10c 随顺子单向冲进田嫂避难洞 → 11c 起担架出村过桥
  let winter = cart, winterExtra = { parentId: "cart", elevation: 1.05, heading };
  if (time >= cartEnd && time < At("10b", 0.65)) {
    winter = Track([
      ["08c", 0.9, 122.3, 639], ["08d", 0.25, 108, 642.5], ["08d", 0.6, 101, 635],
      ["10b", 0.2, 101, 635], ["10b", 0.5, 108, 642.5], ["10b", 0.65, 122.3, 639],
    ], time, timeline);
    winterExtra = {};
  }
  if (time >= At("10c") && time < At("11c")) {
    winter = beat.id === "10c"
      ? SampleRoute(SHELTER_DASH, Clamp((progress - 0.2) / 0.8, 0, 1))
      : [100, 659.6];
    winterExtra = {};
  }
  if (time >= At("11c")) {
    const stopped = beat.id === "12b" && progress < 0.55;
    const carryP = beat.id === "12b" ? (stopped ? 0 : (progress - 0.55) / 0.45) : progress;
    winter = BehindPlayer(beat, carryP, 1.5, timeline);
    const front = stopped ? beat.p[0] : player, rear = BehindPlayer(beat, carryP, 2.9, timeline);
    const carryHeading = Math.atan2(front[0] - rear[0], -(front[1] - rear[1]));
    winterExtra = {
      carried: !stopped,
      elevation: stopped ? 0 : 0.75,
      heading: carryHeading,
      status: stopped ? "浅路沟内暂放担架" : "顺子与文财抬行",
    };
    if (time >= At("13a", 1) && time < At("13e")) {
      winter = [-90, 801];
      winterExtra = { status: "南岸河堤后，盖着老耿的棉袄" };
    }
  }
  actors.push(Actor("winter", "冬瓜", "friend", "quilt", winter, "wounded", winterExtra));

  // 罗班长、何有田、幺娃
  const carrying = time >= At("11c") && (beat.pose === "carry" || beat.id === "13e" || (beat.id === "12b" && progress >= 0.55));
  const leader = time < At("08b", 0.5) ? Follow(3) : beat.id === "13e" ? Follow(3) : Track(LEADER_KEYS, time, timeline);
  const leaderMoving = time >= At("08b", 0.5) && Distance(leader, Track(LEADER_KEYS, time + 0.05, timeline)) > 0.01;
  for (const [index, id, name] of [[0, "luo", "罗班长"], [1, "he", "何有田"], [2, "yao", "幺娃"]]) {
    const onBridge = leader[0] >= -82 && leader[0] <= -78 && leader[1] >= 745 && leader[1] <= 795;
    let p = leaderMoving || onBridge ? Track(LEADER_KEYS, time - index * 0.6, timeline)
      : [leader[0] + index * 0.8, leader[1] - index * 1.2];
    if (beat.id === "13e") p = Follow(3 + index * 0.6);
    if (beat.id === "11a") p = id === "yao" ? [101.1, 659.9] : [112 + index, 664];
    if (beat.id === "11b") p = id === "luo" ? [103.5, 661] : id === "yao" ? [101.1, 659.9] : [104.5, 662];
    const firing = ["08c", "09b", "09d", "12a", "12b", "13a", "13b"].includes(beat.id);
    const stuck = id === "yao" && beat.id === "13c" && progress >= 0.25 && progress < 0.55;
    actors.push(Actor(id, name, "friend", "person", p, stuck ? "down" : firing ? "shoot" : "stand", {
      heavy: id === "yao", firing,
      status: stuck ? "脚卡枕木缝，班长回身拽" : firing ? "正面吸引与殿后掩护" : "随队行动",
    }));
  }

  // 刘文财
  const liu = carrying || (beat.id === "12b" && progress < 0.55)
    ? BehindPlayer(beat, beat.id === "12b" ? (progress < 0.55 ? 0 : (progress - 0.55) / 0.45) : progress, 2.9, timeline)
    : ["11a", "11b"].includes(beat.id) ? [101, 660.4]
    : time >= At("13b") && time < At("13e") ? [-88.5, 798]
    : Follow(1.5);
  actors.push(Actor("liu", "刘文财", "friend", "person", liu,
    carrying ? "carry" : beat.cover ? "shoot" : ["09a", "09b", "09c"].includes(beat.id) ? "crouch" : "walk",
    { firing: beat.cover === true }));

  // 老耿：08a-08c 赶车送冬瓜到西南救护所 → 08d-10b 守在救护所 → 10c 进避难洞 → 11c 起跟队过桥
  let gengP = [cart[0] + 1.2, cart[1] + 0.6];
  if (time >= cartEnd && time < At("10b")) gengP = [104, 636];
  else if (beat.id === "10b") gengP = [122, 641];
  else if (beat.id === "10c") gengP = SampleRoute(SHELTER_DASH, Clamp(progress / 0.85, 0, 1));
  else if (time >= At("11a") && time < At("11c")) gengP = [99.2, 660.5];
  else if (time >= At("11c")) gengP = time >= At("13a", 1) && beat.id !== "13e" ? [-93, 801] : Follow(3.2);
  actors.push(Actor("geng", "老耿", "civilian", "person", gengP, beat.stage === "11" && beat.id !== "11c" ? "kneel" : "walk"));

  // 妮儿：08b 护黑子过板桥 → 08c 随车去救护所 → 08d-09a 顺西巷偷偷折回家拿灶锅 → 09b-09d 撞见顺子并钻洞开便门 → 10a-10c 随顺子返救护所并进洞
  let nierP = [cart[0] - 1.0, cart[1] + 1.4];
  if (beat.id === "08b") {
    nierP = [cart[0], cart[1] + 2.4];
  } else if (time >= cartEnd && time < At("09b")) {
    const slipT = Clamp((time - At("08d")) / Math.max(1, At("09b") - At("08d")), 0, 1);
    nierP = SampleRoute(NIER_SLIP_BACK, slipT);
  } else if (time >= At("09b") && time < At("10a")) {
    nierP = beat.id === "09c" && progress > 0.55 ? [125.6, 564.8] : [player[0] - 0.7, player[1] - 0.6];
  } else if (beat.id === "10a") {
    nierP = Follow(2.2);
  } else if (beat.id === "10b") {
    nierP = [120.5, 642];
  } else if (beat.id === "10c") {
    nierP = SampleRoute(SHELTER_DASH, Clamp(progress / 0.75, 0, 1));
  } else if (time >= At("11a") && time < At("11c")) {
    nierP = [100.6, 660.5];
  } else if (time >= At("11c")) {
    nierP = time >= At("13a", 1) && beat.id !== "13e" ? [-91, 801] : Follow(4.5);
  }
  actors.push(Actor("nier", "妮儿", "civilian", "child", nierP,
    ["09b", "09c"].includes(beat.id) ? "crouch" : beat.stage === "11" && beat.id !== "11c" ? "kneel" : "walk",
    { status: beat.id === "09b" && progress > 0.65 ? "误解顺子见死不救，咬手推开" : undefined }));

  // 救护所与田嫂、二丫（08d 起驴车抵达后激活，保证 10a-11b 人员齐全）
  if (time >= cartEnd) {
    let tian = beat.id === "10a" ? [113, 639.6]
      : beat.id === "10b" ? [110, 662]
      : beat.id === "10c" ? SampleRoute([[110, 662], [108, 659.6], [101, 659.6]], Clamp(progress / 0.7, 0, 1))
      : [101, 659.6];
    if (time >= At("11c")) tian = time >= At("13a", 1) && beat.id !== "13e" ? [-94, 802] : Follow(5.5);
    actors.push(Actor("tian", "田嫂", "civilian", "person", tian, beat.stage === "11" && beat.id !== "11c" ? "kneel" : "stand"));

    let girl = time < At("10c") ? [114, 663.5] : [114, 663.5];
    if (beat.id === "10c" && progress >= 0.48) girl = [player[0] + 0.3, player[1]];
    if (time >= At("11a")) girl = [100.7, 660.1];
    if (time >= At("11c")) girl = tian;
    actors.push(Actor("erya", "二丫", "civilian", "child", girl, time >= At("11c") ? "carry" : "kneel",
      { elevation: time >= At("11c") ? 0.8 : 0 }));

    const medicDead = time >= At("10c", 0.35);
    const medic = beat.id === "10a" ? [102, 635] : [105, 640];
    if (time < At("11c")) {
      actors.push(Actor("medic", "军医", "friend", "person", medic, medicDead ? "dead" : "kneel",
        { status: medicDead ? "扑回救护所挡伤号时被日机扫倒" : "抢救腹部重伤员" }));
      actors.push(Actor("orderly", "后送卫生兵", "friend", "person", [104, 637], "kneel"));
    }
    if (time >= At("10a") && time < At("10c")) {
      actors.push(Actor("batman", "营部勤务兵", "friend", "person", [123.5, 642.5], beat.id === "10b" ? "melee" : "stand"));
    }
    if (time < At("11c")) {
      for (let index = 0; index < 12; index++) {
        const p = [93.3 + (index % 4) * 3.3, 628.5 + Math.floor(index / 4) * 3.1];
        actors.push(Actor(`aidPatient${index}`, `救护所伤号 ${index + 1}`, "friend", "quilt", p,
          index === 11 && medicDead ? "dead" : "wounded"));
      }
    }
  }

  // 二营守军与扛门板本村汉子（军民同防）
  if (time < At("10a") || beat.id === "11b") {
    actors.push(Actor("sentry", "二营哨兵", "friend", "person", [101.8, 475.6], "stand"));
    actors.push(Actor("battalion", "二营连长", "friend", "person", beat.id === "11b" ? [105.5, 662] : [104, 478], "stand"));
    if (time < At("09a")) {
      actors.push(Actor("militiaHelper", "扛门板的本村汉子", "civilian", "person",
        beat.id === "08d" ? [100.2, 476.2] : [108, 480], beat.id === "08d" ? "carry" : "walk",
        { status: "主动协助二营拆门板守沟口" }));
    }
  }

  if (["08c", "08d"].includes(beat.id)) {
    for (let index = 0; index < 5; index++) {
      const start = At("08c") + index * 3.5;
      const p = SampleRoute([[106 + index, 435 - index * 2], [99, 459], [99, 471], [99, 476], [103, 486]], Clamp((time - start) / 24, 0, 1));
      actors.push(Actor(`ditchEvacuee${index}`, `过板桥的老乡与散兵 ${index + 1}`, index % 2 ? "friend" : "civilian", "person", p, "run"));
    }
  }

  if (time >= At("08b", 0.5) && time < At("10a")) {
    const tank = Track([
      ["08b", 0.5, 95, 420], ["08c", 0.35, 99, 464], ["08c", 0.75, 99, 466], ["09a", 1, 99, 464],
    ], time, timeline);
    actors.push(Actor("tank3", "九四式 · 沟北受阻车", "enemy", "tank", tank, "stand",
      { surface: "ground", heading: Math.PI, turret: Math.PI, status: "被防战车壕挡在沟北扫射" }));
  }

  if (beat.stage === "13") {
    actors.push(Actor("officer", "三营军官", "friend", "person", [-88, 800], "kneel"));
    actors.push(Actor("engineer", "工兵", "friend", "person", [-83, 795], time < At("13d", 0.6) ? "kneel" : "run"));
  }
  return actors;
}

export function ApplyMergedSurfaces(actors, time, timeline) {
  const signals = MergedSignals(time, timeline);
  for (const actor of actors) {
    const surface = MergedSurfaceAt(actor.p, signals);
    if (surface !== null) actor.surfaceY = surface;
    if (signals.includes("BridgeBlown") && actor.side === "enemy"
      && actor.p[0] > -82 && actor.p[0] < -78 && actor.p[1] > 748 && actor.p[1] < 770) {
      actor.pose = "dead";
    }
  }
}

export function MergedDialogue(beat, time, actors) {
  const specs = MERGED_DIALOGUE[beat.id] || [];
  const local = time - beat.start;
  return specs
    .filter((entry) => local >= entry.at && local <= entry.at + entry.duration)
    .map((entry) => {
      const speaker = actors.find((a) => a.id === entry.actor);
      if (!speaker || speaker.pose === "dead") return null;
      return { actorId: speaker.id, speaker: speaker.name, text: entry.text, p: [...speaker.p] };
    })
    .filter(Boolean);
}

export function MergedEffects(beat, time, progress, actors, timeline) {
  if (Number(beat.stage) < 8) return [];
  const effects = [];
  const Beat = (id) => timeline.find((entry) => entry.id === id);
  if (["08c", "09d", "12b", "13b", "13c", "13d"].includes(beat.id)) {
    const enemies = actors.filter((actor) => actor.side === "enemy" && actor.pose !== "dead" && actor.kind !== "tank");
    for (const id of ["player", "liu", "luo", "he", "yao"]) {
      const actor = actors.find((entry) => entry.id === id);
      const target = enemies[0];
      if (actor && target && (beat.cover || actor.firing || beat.id === "09d")) {
        effects.push({ kind: "fire", a: actor.p, b: target.p, side: actor.side, sourceId: actor.id, targetId: target.id, phase: (time * 3 + id.length) % 1 });
      }
    }
  }
  if (beat.id === "08c" || beat.id === "08d") {
    const tank = actors.find((actor) => actor.id === "tank3");
    if (tank) effects.push({ kind: "fire", a: tank.p, b: [108, 478], side: "enemy", heavy: true, phase: (time * 6) % 1 });
  }
  // 08d 后半拍及 09a-09c：老耿家正房机枪朝村心大槐树与主街倾泻压制火力，纯视觉提示主街不可通行
  if ((beat.id === "08d" && progress >= 0.4) || ["09a", "09b", "09c"].includes(beat.id)) {
    effects.push({ kind: "fire", a: [131.6, 573.1], b: [134, 550], side: "enemy", heavy: true, phase: (time * 5.2) % 1 });
  }
  if (beat.id === "10c") {
    const cycle = (time - Beat("10c").start) % 16;
    const target = [108, 642];
    for (let index = 0; index < 3; index++) {
      effects.push({ kind: "plane", p: [target[0] + 170 - cycle * 21, target[1] + index * 12], elevation: 44 + index * 6 });
    }
    if (cycle > 4.5 && cycle < 11) {
      effects.push({ kind: "blast", p: [target[0] + 22 - (cycle - 4.5) * 7, target[1]], age: cycle % 0.6 });
    }
  }
  if (beat.id === "08d" && progress >= 0.85) effects.push({ kind: "blast", p: [257, 698], age: (progress - 0.85) * beat.duration });
  if (beat.id === "13d" && progress >= 0.6) {
    for (const z of [753.5, 764.5]) effects.push({ kind: "blast", p: [-80, z], age: (progress - 0.6) * beat.duration });
  }
  return effects;
}
