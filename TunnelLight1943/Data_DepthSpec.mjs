// 深度带的**数值定义**（规则清单见 TunnelLight1943/CLAUDE.md）。
//
// 画面全是不写深度缓冲的半透明贴图，前后完全由绘制顺序决定；绘制顺序又由
// 这里的层内深度 z 派发。所以摆任何东西，z 只能从 BAND 里挑——散落在代码里的
// 字面量 z 是历次「道具把人吞掉 / 桶被草垛挡住」事故的共同根源。
//
// 「哪一类物体用哪个带」不在这个文件：那是美术属性，和画笔、烘焙画布放在
// 一起，写在 Data_PropArt.json 的 band 字段。这里只回答「building 带有多深」。
//
// 层内深度带（play 层，世界单位，+ 为靠近镜头）：
export const BAND = {
  backdrop: -6.0,   // 村外田埂、远处院墙、炮楼
  building: -3.4,   // 房屋、牢房、围墙（大体量背景建筑）
  yard: -1.6,       // 院内器物、树、庄稼、灯杆
  nearBack: -0.9,   // 紧贴行走线之后的立牌（门板情报板）：玩家走到跟前不被挡
  walk: 0,          // 行走线：地面/地道剖面、固定在地上的道具（井台/磨盘/柴垛）
  loose: 0.3,       // 落地/待拾的活动道具（放下的桶、链上的待拾物、辘轳绳桶）：
                    // 永远压在行走线道具之前、演员（ACTOR_Z）之后——玩家放下的
                    // 东西必须看得见，但不能挡人
  facade: 0.4,      // 可进入屋子的立面：盖在室内家具之上、演员之下，进门淡出
  pushCart: 0.5,    // **玩家推着走的车**：夹在立面(0.4)与演员(0.6)中间的一档。
                    // 车是街面上的东西——推着它从自家屋前过，墙不许把它吃掉
                    // （loose 0.3 在立面之后，车会整辆消失在墙里）；可人还得
                    // 在车前面握着车把，所以又不能越过演员
  obstacle: 0.95,   // **横在路上的矮障碍**（可翻越物：塌墙、撞倒的柴垛）。
                    // 只比演员（0.6）近一点点：够挡住小腿——挡不住就读成"路边的景"，
                    // 玩家看不出它拦路；又不像 clutter(1.6) 那样被透视放大成一堵大墙
                    // （近景机位下 1.6 会把 0.8m 的墙撑到齐胸，把人吞掉半截）
  clutter: 1.6,     // 允许挡住演员的矮物件（硬性上限 1.2m 高）
};

export const ACTOR_Z = 0.6;          // 演员行走深度
export const ACTOR_SHADOW_Z = 0.55;  // 演员脚下的投影（紧贴在演员之后）
export const CARRY_Z = 0.8;          // 演员携带物（跟手走，压在人身前）

// ---------------------------------------------------------------------------
// 地平线规范（2026-08-09 用户定，起因：「车和人都不在一个水平线」）
//
// 镜头永远平视（lookAt 与机位等高），于是**每一档深度 z 都有自己的地平线**：
// 深度 z 处、世界 y=0 的那条线，在屏幕上的位置 ∝ −camY / (dist − z)。
// z 越负（越远）画得越高，z 越正（越近）画得越低。这是正确的透视，不是 bug——
// 但它意味着一条铁律：**两件东西只有 z 相同，才会踩在同一条线上。**
//
// 默认玩法机位（2026-08-14 按《勇敢的心》收了一档：hw 4.9 → dist 10.3m，
// 视平线离地 1.85m，1600×900），以行走线 walk(z=0) 的地平线为 0，正数＝画得更低：
//
//   backdrop −6.0 → −111px  building −3.4 → −75px   yard −1.6 → −41px
//   nearBack −0.9 → −24px   walk 0 → 0px            loose 0.3 → +9px
//   影子 0.55 → +17px       演员 0.6 → +19px         携带物 0.8 → +25px
//   obstacle 0.95 → +31px   clutter 1.6 → +56px
//
// **机位一收近，同一个 z 差就拉开**（上面这排比 hw 6.3 那版大了七成）——
// 所以「差一点点无所谓」比以前更不成立，摆位一律照 PlaceZ 走。
//
// **一推特写，同一个 z 差还要再放大几倍**：刨料那一拍（hw 2.9、视平线 0.95m）
// 演员的 0.6 变成 +29px，插入特写（hw 2.2、视平线 1.4m）更是 +76px——
// 人的脚整整沉进台面底下。所以「差一点点无所谓」在特写那一拍必定露馅，
// 这条不能靠眼力逐场去凑。
//
// 规范：
//  1. **行走线上的一切共用同一个位置 z＝0**：演员、演员的影子、手里拿的、
//     放下的、玩家推的车、钉在地上的道具（walk / loose / facade 带）。
//     深度带从此**只管绘制顺序**（renderOrder），不再兼职当位置。
//  2. z<0 的带（backdrop / building / yard / nearBack）是**真的站在更靠后的
//     地面上**，位置就用带的 z，各有各的地平线——但那条线必须由画面交代
//     （AddBandEdge 的路沿田埂、墙根、垄沟），否则它读出来就是「浮在半空」。
//  3. z>0 的前景带（obstacle / clutter / 掩体 NEAR_CLUTTER）同理保留自己的 z：
//     它们**有意**站在行走线之前，地平线更低正是「它挡在你前面」的唯一线索。
//  4. 摆位一律 `PlaceZ(band)`，排序一律 `SetPlayOrder/DepthOrder(band)`。
//     两者传同一个 band，谁也别再手写数字。
export const GROUND_PLANE_Z = 0;      // 行走线这条地面的深度
export const GROUND_PLANE_TOP = 0.85; // 0<z≤此值的带都算「站在行走线上」
/** 摆位用的 z：行走线上的带一律压回地平面，其余带保留自己的纵深 */
export function PlaceZ(z) {
  return z > 0 && z <= GROUND_PLANE_TOP ? GROUND_PLANE_Z : z;
}

// 透视相机的垂直视角（Script_World 的 PerspectiveCamera 用同一个数）
export const CAM_FOV = 30;
/**
 * 深度 z 的地平线相对行走线差多少屏幕像素（正＝画得更低）。
 * 体检与写文档时用它算实数，别再靠截图上量。
 */
export function GroundRisePx(z, { camY, dist, viewH, fov = CAM_FOV }) {
  const tanHalf = Math.tan((fov * Math.PI / 180) / 2);
  return (viewH / 2) * (camY / tanHalf) * (1 / (dist - z) - 1 / dist);
}

// 队列的第几排退多远（人、影子、手里的家伙整体后移，所以给的是**偏移量**）。
// 横版里"并排"只能靠深度演：退一档，透视把他画小一圈、脚在画面上抬高一点。
//
// 但**光靠深度演不出并排**——车队镜的机位在 22m 开外，1.6m 只换来 5px 的抬高、
// 5% 的缩小，前后两个人当场重合成一个（2026-08-09 用户就是这么看出"一人一排
// 线性移动"的）。真正让一排人读得出来的是**队序表里那半个身位的 x 错开**，
// 深度只负责把后排画小一圈。两样缺一不可。
//
// 阶梯**不是等差**：第二排退 1.6m 已经读得出前后，第三排再退一米就压到
// 院里的树（yard −1.6）那一档去了，所以往后收着加。
export const RANK_DZ = [0, -1.6, -2.5];
export function RankDz(rank) {
  return RANK_DZ[Math.min(Math.max(0, rank | 0), RANK_DZ.length - 1)];
}
// 允许挡人的矮物件区间（掩体走这个区间；AddCover 在其中插值）
export const NEAR_CLUTTER = [1.25, 2.3];

// 合法 z 值集合（校验用）：带表 + 演员三档。掩体区间单独按范围判。
// **队列的每一排**也得在这儿展开：一排人 = 演员的那三档（人/影子/家伙）
// 整体按 RANK_DZ 平移。它们不是新的带，是**声明出来的派生值**——不登记进来，
// 三人一排刚做出来就会让 DepthViolations 冒出 SetPlayOrder@-1.90 这种告警
// （2026-08-09 加第三排时当场撞上）。
const ALLOWED = new Set([
  ...Object.values(BAND), ACTOR_Z, ACTOR_SHADOW_Z, CARRY_Z,
  ...RANK_DZ.flatMap((dz) => [ACTOR_Z + dz, ACTOR_SHADOW_Z + dz, CARRY_Z + dz]),
]);

// ---------------------------------------------------------------------------
// 翻越尺度规范（2026-08-07 用户定，以第一章那堵塌墙为基准）
//
// 「翻越」这个动作的定义是**一只手撑在顶沿上、身子绕着那只手转过去**。
// 撑得住的前提是顶沿不高过撑手的人的胯——高过胯就得先把身子拽上去，
// 那是"攀"不是"翻"，两套动作、两套动画，不许混用一个 vault。
//
// 基准：第一章巷口那堵塌墙 top = 0.82m。柱子这年 1.38m 高、站立胯高约 0.50m，
// 0.82m 落在他胸口下沿——单手撑住、腿从顶上扫过去，是这个动作的**上限**。
// 所以：
export const VAULT_MAX_TOP = 0.85;   // 可翻越物顶沿高度硬上限（世界米）
export const VAULT_MIN_TOP = 0.25;   // 低于这个就是"跨一步"，不值得占一个按键
// 站立胯高（第一章柱子：BONE.hipY 0.62 × bodyScale 0.80）。抬升按
// 「顶沿 + 余量 − 胯高」算绝对值，不按顶沿的百分比——百分比会让矮障碍
// 抬得过高、高障碍抬得不够，两头都不像撑手翻越。
export const VAULT_HIP_STAND = 0.50;
export const VAULT_HIP_CLEAR = 0.10;   // 胯骨压过顶沿的余量

/** 一件可翻越物该把人抬多高（米）。挡在 [MIN,MAX] 之外的高度由加载期校验拦掉 */
export function VaultLiftFor(top) {
  return Math.max(0.05, (top ?? 0) + VAULT_HIP_CLEAR - VAULT_HIP_STAND);
}

const warned = new Set();
/**
 * 放置校验：z 不在规范表里就告警（每个 tag+z 只报一次，不打断运行）。
 * 浏览器健康测试把 console.warn 收进报告，白盒期靠它抓「又另立数字了」。
 */
export function CheckBandZ(tag, z) {
  for (const v of ALLOWED) if (Math.abs(z - v) < 0.011) return true;
  if (z >= NEAR_CLUTTER[0] - 0.011 && z <= NEAR_CLUTTER[1] + 0.011) return true;
  const key = `${tag}@${z.toFixed(2)}`;
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(`[depth] ${tag} 用了规范表以外的 z=${z}——从 Data_DepthSpec 的 BAND 里挑一个带`);
  }
  return false;
}

export function DepthViolations() { return [...warned]; }
