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
  obstacle: 0.95,   // **横在路上的矮障碍**（可翻越物：塌墙、撞倒的柴垛）。
                    // 只比演员（0.6）近一点点：够挡住小腿——挡不住就读成"路边的景"，
                    // 玩家看不出它拦路；又不像 clutter(1.6) 那样被透视放大成一堵大墙
                    // （近景机位下 1.6 会把 0.8m 的墙撑到齐胸，把人吞掉半截）
  clutter: 1.6,     // 允许挡住演员的矮物件（硬性上限 1.2m 高）
};

export const ACTOR_Z = 0.6;          // 演员行走深度
export const ACTOR_SHADOW_Z = 0.55;  // 演员脚下的投影（紧贴在演员之后）
export const CARRY_Z = 0.8;          // 演员携带物（跟手走，压在人身前）
// 允许挡人的矮物件区间（掩体走这个区间；AddCover 在其中插值）
export const NEAR_CLUTTER = [1.25, 2.3];

// 合法 z 值集合（校验用）：带表 + 演员三档。掩体区间单独按范围判。
const ALLOWED = new Set([
  ...Object.values(BAND), ACTOR_Z, ACTOR_SHADOW_Z, CARRY_Z,
]);

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
