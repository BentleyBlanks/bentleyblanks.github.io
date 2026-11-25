// 「北沙河单村合并版」分叉段（08–13）绝对时间采样与场面演出（纯函数，零 DOM、零 three）。
// 任意正向/反向拖动时间轴均可确定性还原同一帧人物、桥面、车辆、侧包与班排协同状态。

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

function SelectNearestTarget(shooter, candidates, maxRange, filter = null) {
  let best = null;
  let bestDist = maxRange;
  for (const enemy of candidates) {
    if (filter && !filter(enemy)) continue;
    const d = Distance(shooter.p, enemy.p);
    if (d < bestDist) {
      bestDist = d;
      best = enemy;
    }
  }
  return best;
}

const CART_MAIN_STREET = [
  [104, 486], [114, 520], [140, 560], [146, 564], [163, 586],
  [172, 600], [174, 638], [172, 680], [146, 687], [121, 693], [122.3, 719],
];

// 妮儿从救护所顺西胡同悄悄折回关帝庙南檐下的纯街巷路线（0 穿墙、抢在西翼搜兵到前缩入庙南墙后）
const NIER_SLIP_BACK = [
  [121, 719], [121, 693], [84, 688], [84, 636], [84, 608], [84, 561], [85.5, 538], [80.3, 529.6],
];

// 空袭单向冲进田嫂避难洞路线（沿东墙根转入南院门，0 穿墙）
const SHELTER_DASH = [
  [122.3, 719], [121, 722.5], [121, 744], [108, 744], [108, 739.6], [100, 739.6],
];

// 罗班长、何有田、幺娃（捷克式 ZB-26）全链路沿真实街道与掩体行动轨迹（0 穿墙）：
// 08b-08c 守沟口东段 → 08d-09c 抢占村心打麦场北口正面压制老耿家并甩雷调走西翼搜兵 → 09d 合围汇合
// → 10a-11a 穿过南中街守南街口断后抵御轰炸与追兵 → 11b 洞口领命 → 11c-12b 村南口断后 → 13a-13c 奔桥抢过钢梁
const LEADER_KEYS = [
  ["08b", 0.0, 99, 466], ["08b", 0.35, 99, 471], ["08b", 0.65, 99, 476], ["08b", 0.85, 104, 478], ["08b", 1.0, 114, 478],
  ["08d", 0.45, 114, 478], ["08d", 0.65, 104, 486], ["08d", 0.85, 114, 520], ["08d", 1.0, 124, 535],
  ["09a", 0.35, 130, 545], ["09a", 0.6, 133.5, 549.5],
  ["09d", 0.62, 133.5, 549.5], ["09d", 0.82, 136, 558], ["09d", 1.0, 131.5, 560],
  ["10a", 0.0, 131.5, 560], ["10a", 0.10, 140, 560], ["10a", 0.18, 146, 564], ["10a", 0.34, 163, 586],
  ["10a", 0.44, 172, 600], ["10a", 0.60, 174, 638], ["10a", 0.74, 172, 680], ["10a", 0.88, 146, 687], ["10a", 1.0, 121, 693],
  ["11a", 0.35, 121, 693], ["11a", 0.60, 121, 722.5], ["11a", 0.80, 121, 744], ["11a", 0.92, 108, 744], ["11a", 1.0, 104, 741],
  ["11b", 1.0, 104, 741],
  ["11c", 0.22, 108, 744], ["11c", 0.45, 121, 744], ["11c", 0.70, 121, 755],
  ["13a", 0.0, 121, 755], ["13a", 0.12, 114, 770], ["13a", 0.22, 100, 778], ["13a", 0.42, 60, 790],
  ["13a", 0.62, 20, 800], ["13a", 0.78, -20, 807], ["13a", 0.90, -55, 815], ["13a", 1.0, -68, 822],
  ["13b", 0.62, -68, 822], ["13b", 1.0, -78, 825],
  ["13c", 0.0, -80, 826], ["13c", 0.45, -80, 852], ["13c", 0.85, -80, 874], ["13c", 1.0, -87, 878],
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

  // 老耿驴车：08a 抵沟口 → 08b 妮儿牵过板桥 → 08c 前 62% 沿主街抢先抵达西南救护所（远早于东翼日军抵中街）→ 10c 空袭焚毁
  const cartEnd = At("08c", 0.62);
  let cart = [122.3, 719];
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
      : [cart[0] + Math.sin(heading) * 2.1, cart[1] - Math.cos(heading) * 2.1];
    actors.push(Actor("donkey", "黑子", "civilian", "donkey", donkey, beat.id === "08b" && progress < 0.35 ? "stand" : "walk", { heading }));
  }

  // 冬瓜：08a-08c 乘车先到救护所 → 08d-10a 在院心止血 → 10b 抬上车 → 10c 随顺子单向冲进田嫂避难洞 → 11c 担架出村过桥
  let winter = cart, winterExtra = { parentId: "cart", elevation: 1.05, heading };
  if (time >= cartEnd && time < At("10b", 0.65)) {
    winter = Track([
      ["08c", 0.62, 122.3, 719], ["08c", 0.82, 114, 722.5], ["08d", 0.2, 108, 722.5], ["08d", 0.55, 101, 716],
      ["10b", 0.2, 101, 716], ["10b", 0.5, 108, 722.5], ["10b", 0.65, 122.3, 719],
    ], time, timeline);
    winterExtra = {};
  }
  if (time >= At("10c") && time < At("11c")) {
    winter = beat.id === "10c"
      ? SampleRoute(SHELTER_DASH, Clamp((progress - 0.2) / 0.8, 0, 1))
      : [100, 739.6];
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
      winter = [-90, 881];
      winterExtra = { status: "南岸河堤后，盖着老耿的棉袄" };
    }
  }
  actors.push(Actor("winter", "冬瓜", "friend", "quilt", winter, "wounded", winterExtra));

  // 罗班长、何有田、幺娃（全队按街道轨迹编队，0 穿墙；正面吸火/甩雷/殿后清晰可见）
  const carrying = time >= At("11c") && (beat.pose === "carry" || beat.id === "13e" || (beat.id === "12b" && progress >= 0.55));
  const leader = time < At("08b") ? Follow(2.8) : beat.id === "13e" ? Follow(3) : Track(LEADER_KEYS, time, timeline);
  const leaderNext = time < At("08b") ? Follow(2.7) : Track(LEADER_KEYS, time + 0.08, timeline);
  const leaderMoving = time >= At("08b") && Distance(leader, leaderNext) > 0.01;
  const pinningMainStreet = ["09a", "09b", "09c"].includes(beat.id) || (beat.id === "09d" && progress < 0.62);
  const rearguardHolding = ["10b", "10c", "11c", "12a", "12b"].includes(beat.id) || (beat.id === "11a" && progress < 0.35);
  const ditchHolding = beat.id === "08c" || (beat.id === "08d" && progress < 0.45);
  const leaderCovering = ditchHolding || pinningMainStreet || rearguardHolding;

  for (const [index, id, name] of [[0, "luo", "罗班长"], [1, "he", "何有田"], [2, "yao", "幺娃"]]) {
    let p;
    if (time < At("08b")) {
      p = Follow(2.6 + index * 0.9);
    } else if (beat.id === "13e") {
      p = Follow(3 + index * 0.7);
    } else if (ditchHolding) {
      // 沟南东段战壕内并排占领火力位
      p = [113 + index * 2.2, 478];
    } else if (pinningMainStreet) {
      // 打麦场东南/主街掩体后一线展开，正对 24m 外老耿家正面压制
      p = [[133.5, 549.5], [135.2, 548.2], [131.8, 547.5]][index];
    } else if (beat.id === "11b") {
      p = [[103.5, 741.0], [104.8, 741.5], [102.2, 740.2]][index];
    } else if (leaderMoving) {
      p = Track(LEADER_KEYS, Math.max(At("08b"), time - index * 0.7), timeline);
    } else if (rearguardHolding && beat.stage === "10") {
      p = [[121, 693], [122.4, 692.2], [119.8, 693.5]][index];
    } else if (rearguardHolding && (beat.id === "11c" || beat.stage === "12")) {
      p = [[121, 755], [122.2, 754], [119.8, 756]][index];
    } else if (time >= At("13c", 1) && beat.id !== "13e") {
      p = [[-87, 878], [-85.5, 878.5], [-84, 879]][index];
    } else {
      p = Track(LEADER_KEYS, Math.max(At("08b"), time - index * 0.65), timeline);
    }

    const firing = ditchHolding || pinningMainStreet || rearguardHolding || ["13a", "13b"].includes(beat.id);
    const stuck = id === "yao" && beat.id === "13c" && progress >= 0.25 && progress < 0.55;
    const status = stuck ? "脚卡枕木缝，班长回身死拽"
      : ditchHolding ? (id === "yao" ? "捷克式压制沟北基准火力" : "沟口指挥控弹阻击")
      : pinningMainStreet ? (id === "yao" ? "捷克式正面死咬老耿家机枪" : id === "he" ? "主街掷手榴弹吸引并震撼敌阵" : "正面牵制掩护顺子西翼绕后")
      : rearguardHolding ? "死守街口断后，挡住村内追兵"
      : beat.id === "13a" ? "摆脱村内追兵，全速奔向铁桥北坎"
      : beat.id === "13b" || beat.id === "13c" ? "借顺子掩护抢渡四孔钢梁桥"
      : "随队行动";
    actors.push(Actor(id, name, "friend", "person", p, stuck ? "down" : firing ? "shoot" : "walk", {
      heavy: id === "yao",
      firing,
      coveringEvacuation: leaderCovering,
      status,
    }));
  }

  // 刘文财：始终严格沿顺子行进轨迹跟随（0 侧移穿墙）
  const liu = carrying || (beat.id === "12b" && progress < 0.55)
    ? BehindPlayer(beat, beat.id === "12b" ? (progress < 0.55 ? 0 : (progress - 0.55) / 0.45) : progress, 2.9, timeline)
    : ["11a", "11b"].includes(beat.id) ? [101, 740.4]
    : time >= At("13b") && time < At("13e") ? [-88.5, 878]
    : Follow(0.95);
  actors.push(Actor("liu", "刘文财", "friend", "person", liu,
    carrying ? "carry" : beat.cover ? "shoot" : ["09a", "09b", "09c"].includes(beat.id) ? "crouch" : "walk",
    { firing: beat.cover === true || beat.id === "09d" }));

  // 老耿：08a-08c 沿官道/主街护车到救护所（略错后 0.5m 不穿墙）→ 08d-10b 守在救护所 → 10c 冲进避难洞 → 11c 跟队过桥
  let gengP;
  if (beat.id === "08a") gengP = PlayerAt(Math.min(time + 0.8, At("08a", 1)), timeline);
  else if (beat.id === "08b") {
    const t = Clamp((progress - 0.35) / 0.65, 0, 1);
    gengP = SampleRoute([[99, 468], [99, 471], [99, 476], [104, 486]], Clamp(t - 0.08, 0, 1));
  } else if (time < cartEnd) {
    const t = Clamp((time - At("08c")) / (cartEnd - At("08c")), 0, 1);
    gengP = SampleRoute(CART_MAIN_STREET, Clamp(t - 0.02, 0, 1));
  } else if (time < At("10b")) {
    gengP = [104, 716];
  } else if (beat.id === "10b") {
    gengP = [121.2, 721];
  } else if (beat.id === "10c") {
    gengP = SampleRoute(SHELTER_DASH, Clamp(progress / 0.82, 0, 1));
  } else if (time < At("11c")) {
    gengP = [99.2, 740.5];
  } else {
    gengP = time >= At("13a", 1) && beat.id !== "13e" ? [-93, 886] : Follow(3.2);
  }
  actors.push(Actor("geng", "老耿", "civilian", "person", gengP,
    (beat.stage === "11" && beat.id !== "11c") || (time >= At("13a", 1) && beat.id !== "13e") ? "kneel" : "walk"));

  // 妮儿：08b 牵黑子过板桥 → 08c 随车去救护所 → 08d-09a 顺西巷抢在西翼搜兵到前缩进关帝庙南墙后 → 09b-09d 钻洞开便门 → 10a-10c 返救护所进洞
  let nierP;
  if (beat.id === "08a") nierP = PlayerAt(Math.min(time + 2.0, At("08a", 1)), timeline);
  else if (beat.id === "08b") {
    const t = Clamp((progress - 0.35) / 0.65, 0, 1);
    nierP = SampleRoute([[99, 468], [99, 471], [99, 476], [104, 486]], Clamp(t + 0.08, 0, 1));
  } else if (time < cartEnd) {
    const t = Clamp((time - At("08c")) / (cartEnd - At("08c")), 0, 1);
    nierP = SampleRoute(CART_MAIN_STREET, Clamp(t + 0.02, 0, 1));
  } else if (time < At("09b")) {
    const slipEnd = At("09a") + 20;
    const slipT = Clamp((time - At("08d")) / Math.max(1, slipEnd - At("08d")), 0, 1);
    nierP = SampleRoute(NIER_SLIP_BACK, slipT);
  } else if (beat.id === "09c") {
    nierP = progress < 0.85
      ? SampleRoute([[118, 558], [119.1, 562.8], [122.5, 564.8], [124.2, 564.8]], Clamp(progress / 0.8, 0, 1))
      : SampleRoute([[124.2, 564.8], [125.6, 564.8]], Clamp((progress - 0.85) / 0.15, 0, 1));
  } else if (time < At("10a")) {
    nierP = Follow(1.4);
  } else if (beat.id === "10a") {
    nierP = Follow(2.2);
  } else if (beat.id === "10b") {
    nierP = [120.5, 722];
  } else if (beat.id === "10c") {
    nierP = SampleRoute(SHELTER_DASH, Clamp(progress / 0.72, 0, 1));
  } else if (time < At("11c")) {
    nierP = [100.6, 740.5];
  } else {
    nierP = time >= At("13a", 1) && beat.id !== "13e" ? [-91, 886] : Follow(4.5);
  }
  actors.push(Actor("nier", "妮儿", "civilian", "child", nierP,
    ["09b", "09c"].includes(beat.id) ? "crouch"
      : (beat.stage === "11" && beat.id !== "11c") || (time >= At("13a", 1) && beat.id !== "13e") ? "kneel" : "walk",
    { status: beat.id === "09b" && progress > 0.68 ? "误解顺子见死不救，狠咬手背" : undefined }));

  // 救护所与田嫂、二丫
  if (time >= cartEnd) {
    let tian = beat.id === "10a" ? [113, 719.6]
      : beat.id === "10b" ? [109, 743.5]
      : beat.id === "10c" ? SampleRoute([[109, 743.5], [108, 739.6], [101, 739.6]], Clamp(progress / 0.7, 0, 1))
      : [101, 739.6];
    if (time >= At("11c")) tian = time >= At("13a", 1) && beat.id !== "13e" ? [-94, 886] : Follow(5.5);
    actors.push(Actor("tian", "田嫂", "civilian", "person", tian,
      (beat.stage === "11" && beat.id !== "11c") || (time >= At("13a", 1) && beat.id !== "13e") ? "kneel" : "stand"));

    let girl = [114, 744];
    if (beat.id === "10c" && progress >= 0.45) girl = [player[0], player[1]];
    if (time >= At("11a")) girl = [100.7, 740.1];
    if (time >= At("11c")) girl = tian;
    const eryaShelteringSouth = time >= At("13a", 1) && beat.id !== "13e";
    actors.push(Actor("erya", "二丫", "civilian", "child", girl,
      eryaShelteringSouth ? "kneel" : time >= At("11c") ? "carry" : "kneel",
      { elevation: !eryaShelteringSouth && time >= At("11c") ? 0.8 : 0 }));

    const medicDead = time >= At("10c", 0.35);
    const medic = beat.id === "10a" ? [102, 715] : [105, 720];
    if (time < At("11c")) {
      actors.push(Actor("medic", "军医", "friend", "person", medic, medicDead ? "dead" : "kneel",
        { status: medicDead ? "扑回救护所挡伤号时被日机扫倒" : "抢救腹部重伤员" }));
      actors.push(Actor("orderly", "后送卫生兵", "friend", "person", [104, 717], "kneel"));
    }
    if (time >= At("10a") && time < At("10c")) {
      actors.push(Actor("batman", "营部勤务兵", "friend", "person", [123.5, 722.5], beat.id === "10b" ? "melee" : "stand"));
    }
    if (time < At("11c")) {
      for (let index = 0; index < 12; index++) {
        const p = [93.3 + (index % 4) * 3.3, 708.5 + Math.floor(index / 4) * 3.1];
        actors.push(Actor(`aidPatient${index}`, `救护所伤号 ${index + 1}`, "friend", "quilt", p,
          index === 11 && medicDead ? "dead" : "wounded"));
      }
    }
  }

  // 七二七团二营环形守备兵力与扛门板本村汉子（正面战壕 + 东西侧翼折回阵地 + 炮楼哨 + 村心预备班 + 东南桥头警戒）
  if (time < At("10a") || beat.id === "11b") {
    actors.push(Actor("sentry", "二营哨兵", "friend", "person", [101.8, 475.6], "stand"));
    actors.push(Actor("battalion", "二营连长", "friend", "person", beat.id === "11b" ? [105.5, 742] : [104, 478], "stand"));
    if (time < At("09a")) {
      actors.push(Actor("militiaHelper", "扛门板的本村汉子", "civilian", "person",
        beat.id === "08d" ? [100.2, 476.2] : [108, 480], beat.id === "08d" ? "carry" : "walk",
        { status: "主动协助二营拆门板守沟口" }));
    }
  }
  if (time < At("11c")) {
    const eastBreached = time >= At("08c", 0.45);
    const northUnderFire = beat.id === "08c" || beat.id === "08d";
    actors.push(
      Actor("bn2_mgWest", "二营西翼机枪组", "friend", "person", [36.0, 482.5], northUnderFire ? "shoot" : "kneel", { heavy: true, status: "沿防战车壕西段交叉侧射" }),
      Actor("bn2_west1", "二营北西壕兵", "friend", "person", [64.0, 485.4], northUnderFire ? "shoot" : "kneel"),
      Actor("bn2_westFlank", "二营西翼守兵", "friend", "person", [40.5, 526.0], "kneel", { status: "守西翼折回战壕防铁路侧包" }),
      Actor("bn2_mgEast", "二营东翼机枪组", "friend", "person", [183.5, 474.2], northUnderFire ? "shoot" : "kneel", { heavy: true, status: "沿防战车壕东段交叉侧射" }),
      Actor("bn2_east1", "二营北东壕兵", "friend", "person", [142.0, 478.2], northUnderFire ? "shoot" : "kneel"),
      Actor("bn2_towerObs", "二营炮楼警戒哨", "friend", "person", [217.5, 496.5], "kneel", { status: "东北角炮楼监视麦田" }),
      Actor("bn2_eastFlank1", "二营东翼守兵", "friend", "person", [223.8, 526.0], eastBreached ? "shoot" : "kneel", { status: "守东翼折回战壕" }),
      Actor("bn2_eastFlankFallen", "二营东翼中街哨", "friend", "person", [221.8, 565.5], eastBreached ? "dead" : "kneel",
        { status: eastBreached ? "遭日军东翼侧包尖兵突破阵亡" : "守中街东口未合拢缺口" }),
      Actor("bn2_reserve1", "二营村心预备班长", "friend", "person", [156.0, 522.0], "kneel", { status: "二线预备队待命堵口" }),
      Actor("bn2_reserve2", "二营村心预备兵", "friend", "person", [166.0, 594.0], "kneel"),
      Actor("bn2_seGuard", "二营东南桥头警戒", "friend", "person", [212.0, 718.0], "kneel", { status: "监视已炸断的官道桥" }),
    );
  }

  // 过板桥的老乡与散兵：严格沿官道中心线南行（0 穿掩体/篱笆）
  if (["08c", "08d"].includes(beat.id)) {
    for (let index = 0; index < 5; index++) {
      const start = At("08c") + index * 4.0;
      const p = SampleRoute([[102.5, 434], [101, 452], [99, 466], [99, 476], [103.5, 486]], Clamp((time - start) / 22, 0, 1));
      actors.push(Actor(`ditchEvacuee${index}`, `过板桥的老乡与散兵 ${index + 1}`, index % 2 ? "friend" : "civilian", "person", p, "run"));
    }
  }

  // 九四式轻装甲车：过土地庙后离开官道，从架桥组（x≤108.5）与沟北基准火力组（x≥121）之间的空地南下，
  // 碾过板桥以东的铁丝网（BshWire_15），停在反坦克沟北沿（上口 z≈468.3）扫射；不占板桥北头与老乡、架桥组的路线
  if (time >= At("08b", 0.5) && time < At("10a")) {
    const keys = [
      ["08b", 0.5, 102, 420], ["08b", 0.62, 103, 424], ["08b", 0.84, 113, 432], ["08c", 0.02, 115, 440],
      ["08c", 0.35, 115, 465.8], ["09a", 1, 115, 465.8],
    ];
    const tank = Track(keys, time, timeline), ahead = Track(keys, time + 0.2, timeline);
    const moving = Distance(tank, ahead) > 0.01;
    const heading = moving ? Math.atan2(ahead[0] - tank[0], -(ahead[1] - tank[1])) : Math.PI;
    const turret = moving ? heading : Math.atan2(108 - tank[0], -(478 - tank[1]));
    actors.push(Actor("tank3", "九四式 · 沟北受阻车", "enemy", "tank", tank, "stand",
      { surface: "ground", heading, turret, status: moving ? "离开官道碾过铁丝网" : "被防战车壕挡在沟北交叉扫射" }));
  }

  if (beat.stage === "13") {
    actors.push(
      Actor("officer", "三营军官", "friend", "person", [-88, 880], "kneel"),
      Actor("engineer", "工兵", "friend", "person", [-83, 875], time < At("13d", 0.6) ? "kneel" : "run"),
      Actor("bn3_mgEast", "三营东翼机枪组", "friend", "person", [-69.2, 878.0], beat.id === "13c" ? "shoot" : "kneel", { heavy: true, status: "南岸东翼交叉火力掩护铁桥" }),
      Actor("bn3_rifle1", "三营桥头守兵", "friend", "person", [-74.5, 879.0], "kneel"),
      Actor("bn3_rifle2", "三营南坡收容哨", "friend", "person", [-59.5, 886.0], "kneel"),
    );
  }
  return actors;
}

export function ApplyMergedSurfaces(actors, time, timeline) {
  const signals = MergedSignals(time, timeline);
  for (const actor of actors) {
    const surface = MergedSurfaceAt(actor.p, signals);
    if (surface !== null) actor.surfaceY = surface;
    if (signals.includes("BridgeBlown") && actor.side === "enemy"
      && actor.p[0] > -82 && actor.p[0] < -78 && actor.p[1] > 828 && actor.p[1] < 850) {
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
  const enemies = actors.filter((actor) => actor.side === "enemy" && actor.pose !== "dead" && actor.kind !== "tank");

  // 严格按“最近可见战术扇区目标”生成我方火线，绝不隔着半个村子无视眼前敌人乱射远方
  const EmitFriendlyFire = (ids, maxRange, filter = null) => {
    for (const id of ids) {
      const shooter = actors.find((entry) => entry.id === id);
      if (!shooter || shooter.pose === "dead") continue;
      const target = SelectNearestTarget(shooter, enemies, maxRange, filter);
      if (!target) continue;
      effects.push({
        kind: "fire", a: shooter.p, b: target.p, side: shooter.side,
        sourceId: shooter.id, targetId: target.id, heavy: shooter.heavy,
        phase: (time * 3.1 + id.length) % 1,
      });
    }
  };

  if (beat.id === "08c") {
    // 沟口及东西翼二营守军对沟北正面与侧翼可见敌军交叉射击（严守各自射界扇区，不隔村穿射）
    EmitFriendlyFire(["player", "liu", "luo", "he", "yao", "bn2_mgWest", "bn2_west1", "bn2_mgEast", "bn2_east1"], 85, (e) => e.p[1] < 475);
    EmitFriendlyFire(["bn2_eastFlank1"], 65, (e) => e.p[0] > 195 && e.p[1] > 540);
  } else if (beat.id === "08d" && progress >= 0.35) {
    // 08d 后半拍：东翼侧包进老耿家的机枪沿主街朝大槐树石碾口扫射封路（24m 直视），班长三人压上主街正面交火
    effects.push({ kind: "fire", a: [131.6, 573.1], b: [133.5, 549.5], side: "enemy", heavy: true, phase: (time * 5.2) % 1 });
    if (progress >= 0.65) EmitFriendlyFire(["luo", "he", "yao"], 48, (e) => e.groupId === "MergedHouseGun" && e.p[0] < 145);
  } else if (["09a", "09b", "09c"].includes(beat.id)) {
    // 顺子与刘文财处于潜行禁火态绝不开火；只有班长三人在主街掩体后正面死咬老耿家封街机枪组！
    EmitFriendlyFire(["luo", "he", "yao"], 38, (e) => e.groupId === "MergedHouseGun" && e.p[0] < 145);
  } else if (beat.id === "09d") {
    // 顺子与刘文财突入老耿家后院，严格优先打眼前最近的敌人（先灶屋守卫，后正房机枪组），最大 18m
    EmitFriendlyFire(["player", "liu"], 18, (e) => e.p[0] >= 124 && e.p[0] <= 140 && e.p[1] >= 563 && e.p[1] <= 579);
    if (progress < 0.65) {
      EmitFriendlyFire(["luo", "he", "yao"], 34, (e) => e.groupId === "MergedHouseGun");
    }
  } else if (beat.id === "12b") {
    EmitFriendlyFire(["player", "liu"], 78, (e) => e.groupId === "MergedRailAmbush");
  } else if (["13b", "13c", "13d"].includes(beat.id)) {
    EmitFriendlyFire(["player", "liu", "bn3_mgEast", "bn3_rifle1"], 115, (e) => e.p[0] < -55);
  }

  // 九四式在沟北沿交叉扫射沟南战壕
  if (beat.id === "08c" || beat.id === "08d") {
    const tank = actors.find((actor) => actor.id === "tank3");
    if (tank) effects.push({ kind: "fire", a: tank.p, b: [108, 478], side: "enemy", heavy: true, phase: (time * 6) % 1 });
  }

  // 罗班长与何有田在主街投掷真实手榴弹：
  // 09b +15s（连扔两雷调走西翼搜兵）、09c 末/09d 初（正面震撼老耿家窗口掩护顺子突入）
  const EmitLuoGrenade = (beatId, localAt, targetPoint) => {
    const b = Beat(beatId);
    if (!b) return;
    const age = time - (b.start + localAt);
    if (age < 0 || age > 4.2) return;
    const he = actors.find((a) => a.id === "he") || actors.find((a) => a.id === "luo");
    if (!he) return;
    if (age < 2.2) effects.push({ kind: "grenade", a: he.p, b: targetPoint, phase: age / 2.2, side: "friend" });
    else effects.push({ kind: "blast", p: targetPoint, age: age - 2.2, side: "friend" });
  };
  EmitLuoGrenade("09b", 5.5, [132.5, 567.0]);
  EmitLuoGrenade("09b", 7.8, [130.5, 569.0]);
  EmitLuoGrenade("09d", 0.5, [131.6, 571.2]);
  EmitLuoGrenade("09d", 13.5, [132.4, 571.5]);

  // 10c 空袭三机低空俯冲扫射救护所（随村南扩 +80m）
  if (beat.id === "10c") {
    const cycle = (time - Beat("10c").start) % 16;
    const target = [108, 722];
    for (let index = 0; index < 3; index++) {
      effects.push({ kind: "plane", p: [target[0] + 170 - cycle * 21, target[1] + index * 12], elevation: 44 + index * 6 });
    }
    if (cycle > 4.5 && cycle < 11) {
      effects.push({ kind: "blast", p: [target[0] + 22 - (cycle - 4.5) * 7, target[1]], age: cycle % 0.6 });
    }
  }
  if (beat.id === "08d" && progress >= 0.85) effects.push({ kind: "blast", p: [257, 778], age: (progress - 0.85) * beat.duration });
  if (beat.id === "13d" && progress >= 0.6) {
    for (const z of [833.5, 844.5]) effects.push({ kind: "blast", p: [-80, z], age: (progress - 0.6) * beat.duration });
  }
  return effects;
}
