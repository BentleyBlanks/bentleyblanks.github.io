// 采样点的解析与校验 —— **不许 import three**：出图脚本与自检都在 node 下 import 它，
// 编辑器在浏览器里 import 的是同一份。位姿口径只有这一处，两边不许各算一遍。
//
// 对外三件事：
//   ResolvePoint(point)    把 aim / 缺省值摊平成一份完整位姿
//   ValidatePoints(list)   入表纪律（id 唯一、ASCII、落在本关 bounds 里…）
//   SampleRunPlan(list)    按关卡分组的出图计划 —— 一关只建一次城，拍完再换关
//
// 位姿字段的含义见 Data_SamplePoints.mjs 顶部那段。

import { PHASES } from "./Data_Battle.mjs";
import { OVERVIEW_PHASE } from "./Data_Menu.mjs";
import { SAMPLE_POINTS, SAMPLE_GROUPS, EYE_HEIGHT } from "./Data_SamplePoints.mjs";

/**
 * `point.phase` 认两种值：**七章的序号**，或者字符串 `"overview"`。
 *
 * 后者是任务流程重制之后补的那片全城俯瞰切片（Data_Menu.OVERVIEW_PHASE，
 * bounds 就是 Data_Battle.OVERVIEW_BOUNDS）。城里那八十来个机位当年挂在
 * 「城墙关」上，重制之后没有哪一章会建整座城 —— 硬摊回某一章的话，
 * 一批图要拆成四次建城、四种天光，两批之间就不可比了。
 *
 * URL 侧一一对应：序号 → `?phase=3`，`"overview"` → `?phase=overview`。
 */
export const OVERVIEW_KEY = "overview";
export function PhaseFor(phase) {
  return phase === OVERVIEW_KEY ? OVERVIEW_PHASE : (PHASES[phase] || null);
}

/**
 * 「站在 (fromX,fromZ) 看 (toX,toZ)」的 yaw。
 * 与相机口径一致：0 朝北(-Z)、π/2 朝西(-X)、π 朝南(+Z)、-π/2 朝东(+X)。
 */
export function YawTo(fromX, fromZ, toX, toZ) {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

/** 摊平成完整位姿。**这是唯一一处默认值**，编辑器与出图都读它。 */
export function ResolvePoint(point) {
  const yaw = point.yaw != null ? point.yaw
    : (point.aim ? YawTo(point.x, point.z, point.aim[0], point.aim[1]) : 0);
  return {
    id: point.id,
    label: point.label || point.id,
    group: point.group || "Landmark",
    // 缺省是全城俯瞰那一片 —— 城里的机位绝大多数属于它，而七章里没有一章能兜住。
    phase: point.phase ?? OVERVIEW_KEY,
    x: point.x,
    z: point.z,
    // y 是绝对高度（城墙顶、空中）；h 是离地高度（地面机位）。两者只许有一个。
    y: point.y ?? null,
    h: point.y != null ? null : (point.h ?? EYE_HEIGHT),
    yaw,
    pitch: point.pitch ?? 0,
    fov: point.fov ?? null,
    far: point.far ?? null,
    sky: point.sky ?? null,
    // 空中机位可以站在切片外面往里看 —— 机位本身不需要有地。
    outsideBounds: !!point.outsideBounds,
    aim: point.aim ? [...point.aim] : null,
    note: point.note || "",
  };
}

export function ResolveAll(list = SAMPLE_POINTS) {
  return list.map(ResolvePoint);
}

/** 分组顺序里的名次；表外的分组排到最后（但仍会出图）。 */
function GroupOrder(groupId) {
  const index = SAMPLE_GROUPS.findIndex((g) => g.id === groupId);
  return index < 0 ? SAMPLE_GROUPS.length : index;
}

export function GroupLabel(groupId) {
  return SAMPLE_GROUPS.find((g) => g.id === groupId)?.label || groupId;
}

/**
 * 出图/记录里的稳定序号与文件名。
 * 文件名带两段序号是为了**目录按名字排出来就是文档的章节顺序** ——
 * 靠人对着表排 80 张图是排不对的。
 */
export function OrderedPoints(list = SAMPLE_POINTS) {
  const resolved = ResolveAll(list);
  const sorted = resolved
    .map((point, index) => ({ point, index }))
    .sort((a, b) => (GroupOrder(a.point.group) - GroupOrder(b.point.group)) || (a.index - b.index))
    .map((entry) => entry.point);
  const seen = new Map();
  return sorted.map((point) => {
    const groupIndex = GroupOrder(point.group) + 1;
    const withinGroup = (seen.get(point.group) || 0) + 1;
    seen.set(point.group, withinGroup);
    const name = `${String(groupIndex).padStart(2, "0")}${String(withinGroup).padStart(2, "0")}_${point.id}`;
    return { ...point, order: name, fileName: name };
  });
}

/**
 * 出图计划：按关卡切片聚成一批批。
 * 一关建一次城要十几秒，八十个点位挨个重开页面就是二十分钟的纯等待 ——
 * 所以计划的单位是「关」，不是「点」。关内顺序仍按 OrderedPoints，
 * 这样同一关里的点是连着拍的，天光/破损档不会在一组里跳来跳去。
 *
 * **入参必须是 OrderedPoints 的产物**（带 fileName），本函数只分组、不重编号：
 * 重编号会让 `--only` 补拍的那一张换个文件名落进目录，与整批对不上号。
 */
export function SampleRunPlan(ordered = OrderedPoints()) {
  const byPhase = new Map();
  for (const point of ordered) {
    if (!byPhase.has(point.phase)) byPhase.set(point.phase, []);
    byPhase.get(point.phase).push(point);
  }
  // 排序键：全城俯瞰排在七章之前（它是本表的主场，一次建城拍掉八成的点）。
  const Order = (phase) => (phase === OVERVIEW_KEY ? -1 : Number(phase));
  return [...byPhase.entries()]
    .sort((a, b) => Order(a[0]) - Order(b[0]))
    .map(([phase, points]) => ({
      phase,
      phaseId: PhaseFor(phase)?.id || `phase${phase}`,
      phaseLabel: PhaseFor(phase)?.label || `phase ${phase}`,
      sky: PhaseFor(phase)?.sky || null,
      points,
    }));
}

/** 点位在本关 bounds 里吗。bounds 之外那一片根本不生成，拍出来是空地。 */
export function InPhaseBounds(point) {
  const bounds = PhaseFor(point.phase)?.bounds;
  if (!bounds) return false;
  return point.x >= bounds.minX && point.x <= bounds.maxX
    && point.z >= bounds.minZ && point.z <= bounds.maxZ;
}

/**
 * 入表纪律。返回问题列表（空数组 = 全过）。
 * 自检脚本按它卡红，编辑器按它在面板上标黄。
 */
export function ValidatePoints(list = SAMPLE_POINTS) {
  const problems = [];
  const seen = new Set();
  for (const raw of list) {
    const point = ResolvePoint(raw);
    const where = point.id || "(无 id)";
    if (!point.id) problems.push("有一条点位没有 id");
    else if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(point.id)) {
      problems.push(`${where}：id 只许 ASCII 字母/数字/下划线（它同时是文件名）`);
    }
    if (seen.has(point.id)) problems.push(`${where}：id 重复`);
    seen.add(point.id);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
      problems.push(`${where}：x/z 不是有限数`);
    }
    if (raw.y != null && raw.h != null) problems.push(`${where}：y 与 h 只许写一个`);
    if (!PhaseFor(point.phase)) problems.push(`${where}：phase ${point.phase} 不存在`);
    else if (!InPhaseBounds(point)) {
      const b = PhaseFor(point.phase).bounds;
      // 空中机位往回看城是合法的：机位站在切片外，画面里的东西仍在切片内。
      // 但也不能站到天边去 —— 超出 250 m 就是真的拍不到了。
      const out = Math.max(b.minX - point.x, point.x - b.maxX, b.minZ - point.z, point.z - b.maxZ);
      if (!point.outsideBounds) {
        problems.push(`${where}：(${point.x}, ${point.z}) 落在 ${PhaseFor(point.phase).id} 的 bounds 外`
          + `（x ${b.minX}—${b.maxX} / z ${b.minZ}—${b.maxZ}），那一片不会生成`
          + "；空中机位往回看城的话写 outsideBounds: true");
      } else if (out > 250) {
        problems.push(`${where}：出切片 ${out.toFixed(0)} m，outsideBounds 也救不回来`);
      }
    }
    if (Math.abs(point.pitch) > 1.5) problems.push(`${where}：pitch 超出 ±1.5`);
    if (point.fov != null && (point.fov < 15 || point.fov > 110)) {
      problems.push(`${where}：fov ${point.fov} 不在 15—110`);
    }
    if (!SAMPLE_GROUPS.some((g) => g.id === point.group)) {
      problems.push(`${where}：分组 ${point.group} 不在 SAMPLE_GROUPS 里`);
    }
  }
  return problems;
}

/**
 * 导出成 Data_SamplePoints.mjs 能直接吃的字面量片段。
 * 编辑器改完点位后按这个把结果誊回源码 —— 面板里改的是运行时，
 * **不落盘就不是基线**，所以导出这一步不能省。
 */
export function SerializePoints(points) {
  const Num = (value) => (Number.isInteger(value) ? String(value) : String(+value.toFixed(3)));
  const lines = points.map((raw) => {
    const point = ResolvePoint(raw);
    const parts = [
      `id: ${JSON.stringify(point.id)}`,
      `label: ${JSON.stringify(point.label)}`,
      `group: ${JSON.stringify(point.group)}`,
      // phase 可以是序号，也可以是 "overview" —— 后者必须带引号才是合法字面量。
      `phase: ${typeof point.phase === "string" ? JSON.stringify(point.phase) : point.phase}`,
      `x: ${Num(point.x)}`, `z: ${Num(point.z)}`,
    ];
    if (point.y != null) parts.push(`y: ${Num(point.y)}`);
    else if (point.h !== EYE_HEIGHT) parts.push(`h: ${Num(point.h)}`);
    if (point.aim) parts.push(`aim: [${Num(point.aim[0])}, ${Num(point.aim[1])}]`);
    else parts.push(`yaw: ${Num(point.yaw)}`);
    if (point.pitch) parts.push(`pitch: ${Num(point.pitch)}`);
    if (point.fov != null) parts.push(`fov: ${Num(point.fov)}`);
    if (point.far != null) parts.push(`far: ${Num(point.far)}`);
    if (point.sky) parts.push(`sky: ${JSON.stringify(point.sky)}`);
    if (point.outsideBounds) parts.push("outsideBounds: true");
    if (point.note) parts.push(`note: ${JSON.stringify(point.note)}`);
    return `  { ${parts.join(", ")} },`;
  });
  return `export const SAMPLE_POINTS = [\n${lines.join("\n")}\n];\n`;
}

export { SAMPLE_POINTS, SAMPLE_GROUPS, EYE_HEIGHT };
