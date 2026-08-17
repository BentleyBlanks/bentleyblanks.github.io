// 《地道里的光》—— 爬梯的手脚规划：**手扒在哪道横档、脚踩在哪道横档**，全按真横档算。
//
// 2026-08-17 用户退回：「你爬楼梯怎么和楼梯一点关联没有啊 就像是个平移一样」。
// 老版的爬梯是 Rig 里一支正弦：两条胳膊按相位上下甩、两条腿按相位蹬，人整个按
// smoothstep 从井口滑到井底——手脚从来没落在任何一道横档上。这一版把爬梯拆成两层：
//
//   · 这儿（纯几何，node 可测）：给定这架梯子的落点表（Data_Ladder.LadderHolds）、
//     演员脚线的世界高度 base（Core 的 ground+lift，一路平滑）、爬的方向、体型，
//     算出**四肢各自该在哪道横档上、正在换手还是扒稳、胯该多高**。
//   · Rig 那边拿这张单子做两骨反解（ArmIK/LegIK），把手脚真的钉到那几个点上。
//
// 步态照真人爬梯：
//   · 大人是**跨档步**——每只脚每次跳过被另一只脚占着的那道，一步两档，两脚永远
//     踩在相邻两档上；两只手一样。小孩（体型 <0.75）是**并档步**——一次一档，
//     后脚跟到前脚那一档，两手也各挪一档。
//   · 四肢轮着动，同一时刻最多一只在空中（三点着梯），顺序：前脚→前手→后脚→后手。
//   · 身子随着**最低那只脚**起伏：往下够那一下腿要伸直、胯跟着沉一寸；跨上去之后
//     再站起来。这就是"一档一档"的那股劲，Core 的 lift 照旧平滑（镜头不跟着颠）。
//   · 落点/起点按方向给：往下时手从胸口高度接住下一档、伸直了才松；往上时手够到
//     头顶上再抓、拉到胸口才松。脚同理。
//
// 后续别的梯子/楼梯照抄：换一张落点表（feet/hands 两列世界 y）就是另一架梯子。
// 楼梯只有 feet 没有 hands（hands 传空表就不扒）。

const HIP_STAND = 0.66;     // 扒在梯上胯离脚线多高（未乘体型）。**故意给得比腿长（0.62）还高**：胯真正的
                            // 高度由 LEG_STAND 从最低那只脚往上量，这个数只是上限——于是撑着的那条腿几乎
                            // 一直是直的，只在够下一档那一下沉一寸。0.48 那版两条腿都折着、膝盖朝外支，
                            // 用户说「像青蛙」
const HIP_SMALL = 0.56;     // 并档步的小身量：两只脚常在同一档上，胯钉在腿长上会一档一顿
const HIP_CARRY = 0.66;     // 抱着孩子爬：腿几乎直着——她坐在他胯上（SEAT_LIFT 按脚线算），他一蹲她就骑到脸上
const LEG_STAND = 0.61;     // 胯离最低那只脚最多多远（腿 0.62 伸直前留一丝）
const KNEE_ROOM = 0.12;     // 抬着的那只脚至少在胯下多少（未乘体型）：再高大腿翻过水平线、膝盖顶到胸口，
                            // 反解只能把大腿翻到背后去（实拍就是「反关节的脚」）
const HAND_REF = 1.16;      // 手的参考高度（相对脚线，未乘体型）：肩上半拳（肩在 0.66+0.447）。低了两只手
                            // 折在脸前像捂脸；再高胳膊就绷直
const HAND_REF_SMALL = 0.68; // 并档步的手参考高度：两只手一先一后，隔着一档的那半个周期里高的那只要
                            // 够到参考上方一档——小身量的胳膊只有 0.29m，参考得压到肩下一拳才两头都够得着
const FOOT_X = 0.06;        // 踩着的脚（踝）在身前多少（未乘体型）——脚掌前半搭在档上
const HAND_X = 0.17;        // 扒着的手在身前多少（未乘体型）——胸前一拃
const FOOT_LIFT_X = -0.05;  // 换脚时脚往身后收多少（抬膝）：收多了膝盖朝外支成青蛙腿
const HAND_LIFT_X = -0.07;  // 换手时手往身前收多少
const ANKLE_UP = 0.085;     // 踝在档上方多少（鞋帮 0.09 减去鞋底压进档的一线）
const ANKLE_BACK = -0.07;   // 踝在踩点之后多少（脚掌前半在档上，踝在后）
const SHOULDER_UP = 0.447;  // 肩点比胯高多少（BONE.torso × 0.86，躯干近乎竖直时）
const ARM_REACH = 0.475;    // 上臂＋前臂伸直 0.49，留一丝别绷成一根棍

function Clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
// 圆角的 min：两条约束交接处别出一个死折（胯的起伏走这条）
function SoftMin(a, b, k) { return -k * Math.log(Math.exp(-a / k) + Math.exp(-b / k)); }
function Smooth(k) { k = Clamp(k, 0, 1); return k * k * (3 - 2 * k); }

/** 一张沿行进方向排好的落点表里，y 落在第几号（连续，两头夹住） */
export function IndexOf(list, y) {
  const n = list.length;
  if (n < 2) return 0;
  const down = list[n - 1] < list[0];
  if (down ? y >= list[0] : y <= list[0]) return 0;
  if (down ? y <= list[n - 1] : y >= list[n - 1]) return n - 1;
  for (let i = 0; i < n - 1; i += 1) {
    const a = list[i], b = list[i + 1];
    if (down ? (y <= a && y >= b) : (y >= a && y <= b)) {
      const span = b - a;
      return i + (Math.abs(span) < 1e-9 ? 0 : (y - a) / span);
    }
  }
  return n - 1;
}

/** 第 i 号落点的 y（整数号取表值，越界夹住） */
export function YAt(list, i) {
  const n = list.length;
  if (!n) return 0;
  const c = Clamp(Math.round(i), 0, n - 1);
  return list[c];
}

/**
 * 一条肢体的周期：q 是它自己的相位（落点表号数），每 stride 号一个周期；
 * 周期开头 [0, w) 那一段在空中从 to−stride 挪到 to，其余时候扒在 to 上。
 */
function LimbCycle(q, par, stride, w, settle = 0) {
  const c = Math.floor((q - par) / stride);
  const to = par + c * stride;
  const fr = (q - to) / stride;
  let k = fr < w ? fr / w : 1;
  // 停下来（settle→1）：半空里的肢体就近落到档上——刚抬起来的收回去、过了一半的
  // 落到下一档。位置的连续性由 settle 自己的渐变保证，再动起来它又掉回 0
  if (settle > 0 && k < 1) k = k < 0.5 ? k * (1 - settle) : k + (1 - k) * settle;
  return { from: to - stride, to, k };
}

/**
 * 换档/扒稳时手脚的落点。**同一条肢体：换档从 from 到 to，路径带一个"收回来"的弧。**
 * 返回 { x（身前为正，米）, y（世界 y）, air（0 落稳 … 1 空中最高）, hold（落点号） }
 */
function LimbPoint(list, cyc, xPlant, xLift) {
  const yFrom = YAt(list, cyc.from), yTo = YAt(list, cyc.to);
  const s = Smooth(cyc.k);
  const air = Math.sin(Math.PI * Clamp(cyc.k, 0, 1));
  return { x: xPlant + xLift * air, y: yFrom + (yTo - yFrom) * s, air, hold: cyc.to };
}

/**
 * 换档的相位偏移：让肢体**落稳那一刻**相对脚线正好在 landRel（米）。
 * 表里号数每加一，y 变 sgn·pitch（往下爬 sgn=−1，往上 +1）。
 */
function ShiftFor(w, stride, landRel, sgn, pitch) {
  // 落稳时 q = to + w·stride，而 rel = sgn·pitch·(to − qi) = sgn·pitch·(shift − w·stride)
  return w * stride + (landRel / pitch) * sgn;
}

/**
 * @param {object} o
 *   holds  {top, bot, hands:[y], feet:[y]} 世界 y（Data_Ladder.LadderHolds）
 *   base   演员脚线的世界 y（ground + lift）
 *   dir    −1 往下 / +1 往上
 *   bs     体型（BODY_SCALE）
 *   oneHand 一只手兜着孩子：只剩后手扒
 *   settle 0 在爬 … 1 停稳了（World 按有没有在挪给）：半空的手脚就近落到档上
 * @returns {{hip:{x,y}, feet:{F,B}, hands:{F,B}|{B}, look:number, stride:number}}
 *   x 是身前为正的世界米（未除体型）；**y 一律是世界 y**（不是相对 base）。
 *   Rig 拿到之后换算成骨架局部坐标：local = (world − base) / bs
 */
export function PlanClimb(o) {
  const { holds, base, dir, bs = 1, oneHand = false, settle = 0 } = o;
  const down = dir < 0;
  const sgn = down ? -1 : 1;
  const feetList = down ? holds.feet : [...holds.feet].reverse();
  const handList = down ? holds.hands : [...holds.hands].reverse();
  const pitch = holds.rungs.length > 1
    ? Math.abs(holds.rungs[0] - holds.rungs[holds.rungs.length - 1]) / (holds.rungs.length - 1)
    : 0.32;

  // 跨档步 / 并档步：半大孩子（0.80）也跨得动，只有妹妹那种矮一头多的才并档
  const big = bs >= 0.75;
  const strideF = big ? 2 : 1;
  // 空中那一段占周期几成。**这个数越小，扒着的那只脚跟着身子挪的距离越长**（=stride·pitch·(1−w)），
  // 抬到最后膝盖就顶到胯——0.28 那版实拍是青蛙腿；0.42 一步只挪 0.46m，膝盖最高到胯下一拳
  const wF = big ? 0.42 : 0.40;
  // 落稳那一刻脚在哪：往下是**伸直了够下去**（脚线下 0.19·bs），往上是**跨上去**
  // （膝抬到脚线上 0.29·bs）；两只脚扒稳时的范围就夹在这两个数之间
  const sweepF = pitch * strideF * (1 - wF);
  // 抱着人够不了那么远（腿直着，胯没有余量往下沉）
  const reachF = (oneHand ? -0.08 : -0.16) * bs;
  const landF = down ? reachF : (reachF + sweepF);
  const shiftF = ShiftFor(wF, strideF, landF, sgn, pitch);
  const qF = IndexOf(feetList, base) + shiftF;

  const cF = LimbCycle(qF, 0, strideF, wF, settle);
  // 并档步：后脚**跟着前脚去同一档**（落后半个周期），不是错开一档
  const cB = big ? LimbCycle(qF, 1, strideF, wF, settle) : LimbCycle(qF - 0.5, 0, 1, wF, settle);
  const footF = LimbPoint(feetList, cF, FOOT_X * bs, FOOT_LIFT_X * bs);
  const footB = LimbPoint(feetList, cB, FOOT_X * bs, FOOT_LIFT_X * bs);
  // 踝不是踩点：脚掌前半搭在档上，踝在后上方
  footF.x += ANKLE_BACK * bs; footF.y += ANKLE_UP * bs;
  footB.x += ANKLE_BACK * bs; footB.y += ANKLE_UP * bs;

  // 胯：平时挂在脚线上 HIP_STAND 处；够下去那一下腿伸直、胯跟着**最低那只脚**沉；
  // 跨上来又站起来。空中那只脚也算——它的 y 是连续插出来的，胯才不会在它落地那一刻
  // 跳一下。（这一条最初写成 min(0.5·bs, 脚 + 腿) 忘了脚是世界坐标——上限从来
  // 没生效，胯整段钉在最低那只脚上，一半时间是停的，画面读成一顿一顿地掉）
  const lowFoot = Math.min(footF.y, footB.y) - ANKLE_UP * bs;
  const hipStand = oneHand ? HIP_CARRY : big ? HIP_STAND : HIP_SMALL;
  let hipY = SoftMin(base + hipStand * bs, lowFoot + LEG_STAND * bs, 0.03);

  // 手：自己按参考高度找档，跟脚各走各的表；换手窗口错开半档（前脚→前手→后脚→后手）
  const strideH = oneHand ? 1 : (big ? 2 : 1);
  const wH = oneHand ? 0.40 : (big ? 0.42 : 0.40);
  const sweepH = pitch * strideH * (1 - wH);
  // 往下：胸口接住（比参考低）、伸直了松；往上：够到头顶抓、拉到胸口松
  const landH = down ? -0.5 * sweepH : 0.5 * sweepH;
  const shiftH = ShiftFor(wH, strideH, landH, sgn, pitch);
  const handRef = (big ? HAND_REF : HAND_REF_SMALL) * bs;
  const qHraw = IndexOf(handList, base + handRef) + shiftH;
  // 手的相位钉到脚的相位上（错开半档：前脚→前手→后脚→后手）。**修正量按梯子中段
  // 算一次**，不许每帧按当前位置取整——取整会在两头夹住/抖动过界的那一帧翻一号，
  // 手当场跳一档。代价是手的平均高度只能按整档挑（qH 与参考高度无关，只差整数），
  // 最多偏出半档：大人的胳膊够得住；妹妹那种 0.6 的小身量胳膊才 0.29m，半档就是
  // 一臂——并档步**不钉相位**，手就按参考高度找档，谁先谁后由几何定（同一张表算
  // 出来的，相位关系是稳的，不会跳）
  // 两种错法都成立：错半档（脚→手→脚→手）或对齐（对角的手脚一起动，也是真人的爬法）——
  // 挑修正量小的那个，手的平均高度就只偏参考 ±¼ 档，胳膊够得着
  const wrap = (v) => v - Math.round(v);
  const yMid = (holds.top + holds.bot) * 0.5;
  let corr = 0;
  if (big) {
    const c1 = wrap((IndexOf(feetList, yMid) + shiftF + 0.5) - (IndexOf(handList, yMid + handRef) + shiftH));
    const c2 = wrap(c1 + 0.5);
    corr = Math.abs(c2) < Math.abs(c1) ? c2 : c1;
  }
  const qH = qHraw + corr;
  const hands = {};
  if (!oneHand) {
    const hF = LimbCycle(qH, 0, strideH, wH, settle);
    const hB = big ? LimbCycle(qH, 1, strideH, wH, settle) : LimbCycle(qH - 0.5, 0, 1, wH, settle);
    hands.F = LimbPoint(handList, hF, HAND_X * bs, HAND_LIFT_X * bs);
    hands.B = LimbPoint(handList, hB, HAND_X * bs, HAND_LIFT_X * bs);
    hands.B.x -= 0.03 * bs;                       // 后手略靠里，别跟前手叠成一只
  } else {
    hands.B = LimbPoint(handList, LimbCycle(qH, 0, 1, wH, settle), HAND_X * bs, HAND_LIFT_X * bs);
  }

  // 手也得够得着：井口那几档手还扒在梯头上、人却站直了往下够，胳膊要伸到 0.6m——
  // 反解只会把手悬在梯头上方。人在洞口是**蹲下去**扒住梯头再往下探脚的，所以胯
  // 再压到"胳膊伸直正好够到最低那只手"以下
  for (const h of Object.values(hands)) {
    const vert = Math.sqrt(Math.max(0.01, (ARM_REACH * bs) ** 2 - (h.x - (-0.04 * bs)) ** 2));
    hipY = Math.min(hipY, h.y - SHOULDER_UP * bs + vert);
  }

  // 抬着的那只脚不许顶到胯：两脚在相邻两档上时上面那只离胯只有「腿长 − 一档」，档给高了
  // 或者胯被下面那只脚拽得太低，大腿就翻过水平线。宁可下面那条腿/胳膊伸直了差一两厘米
  // 够不到（反解夹住，手脚悬在档上一线），也不让膝盖翻上去——所以放在最后压轴
  const highFoot = Math.max(footF.y, footB.y) - ANKLE_UP * bs;
  hipY = Math.max(hipY, highFoot + KNEE_ROOM * bs);

  return {
    hip: { x: -0.04 * bs, y: hipY },
    feet: { F: footF, B: footB },
    hands,
    look: down ? 1 : -1,          // 往下看 / 往上看
    stride: strideF,
    qF, qH,
  };
}
