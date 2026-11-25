// Pure editor-side model for Encounter Designer Playtest Guide (2D tactical map,
// objective resolution, live entity merging, and in-game dialogue history).
// Zero DOM, zero Three.js, zero mutation of game or authoring data.

import { Distance, InsideArea } from "./Script_LevelFlowGeometry.mjs";

const COMPASS_8 = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
const RELATIVE_8 = ["正前方", "右前方", "右侧", "右后方", "正后方", "左后方", "左侧", "左前方"];
const CORE_NAMED_IDS = new Set([
  "player", "luo", "liu", "he", "yao", "winter",
  "geng", "nier", "tian", "erya", "battalion", "medic", "officer", "engineer", "interpreter",
]);

const FACT_LABELS = {
  grenadeReturned: "等待反掷手榴弹引爆",
  tank1Destroyed: "等待第一捆手榴弹炸毁头车",
  tank2Destroyed: "等待第二捆手榴弹炸毁后车",
};

const EVENT_LABELS = {
  partyArrived: "与文财、妮儿在出口汇合",
};

const ACTION_LABELS = {
  findWinter: "靠近冬瓜按 F 查看伤势",
  bandageWinter: "靠近冬瓜按 F 止血包扎",
  returnGrenade: "靠近手榴弹按 F 反掷出去",
  loadTrunk: "按 F 把箱子抬上驴车",
  locateBundle: "靠近凹口按 F 确认手榴弹位置",
  chockCart: "按 F 把皮箱塞到车轮下并找弹药",
  plantFirst: "贴近头车后轮按 F 放置第一捆手榴弹",
  plantSecond: "贴近后车车头按 F 放置第二捆手榴弹",
  rollCall: "跟紧队伍按 F 报数",
  concealConvoy: "按 F 协助隐蔽车队与担架",
  observeGun: "低姿观察枪眼后按 F 确认",
  observeRunner: "观察逃兵动向后按 F 确认",
  openGate: "在便门前按 F 推开便门",
  confirmWithdrawal: "确认日军回撤后按 F 推进",
  letCartPass: "护送驴车过桥并按 F 接防",
  removePlanks: "到板桥南头按 F 撤掉门板桥",
  muffleNier: "在庙南墙角按 F 捂住妮儿",
  holdWinter: "在救护所按 F 替冬瓜止血",
  unloadCases: "到院门口按 F 搬下车上箱子",
  pushBatman: "到院门口按 F 推开勤务兵让冬瓜上车",
  loadWinter: "按 F 把冬瓜抬上驴车",
  shelterEscape: "冲到田嫂家避难洞口按 F 进洞",
  shelterWinter: "按 F 把冬瓜送进避难洞",
  rescueErya: "冲到院门口按 F 抱起二丫",
  returnToShelter: "按 F 返回避难洞",
  checkSurvivors: "按 F 查看洞外幸存者",
  enterShelter: "按 F 进入避难洞",
  watchDrawing: "看妮儿画黑子摆弹壳，按 F 继续",
  waitForOrders: "等待回城命令，按 F 继续",
  receiveBridgeOrders: "接领回城令，按 F 继续",
  liftWinter: "按 F 抬起冬瓜出发",
  reportWounded: "按 F 交接伤员与防务",
  confirmDitchEvacuees: "掩护老乡过桥后按 F 确认",
  confirmRoadBridge: "按 F 确认官道桥被炸断",
  takeCover: "按 F 趴倒躲避空袭",
  coverPole: "按 F 掩护同伴通过桥面",
  confirmSquadCrossed: "确认全班过桥后按 F 确认",
  detonateRailBridge: "按 F 掩护工兵引爆铁路桥",
};

/**
 * Convert engine yaw (radians, where forward = (-sin(yaw), -cos(yaw)) in world XZ)
 * to a unit 2D vector [fx, fz].
 */
export function YawForwardXZ(yaw) {
  const angle = Number.isFinite(yaw) ? yaw : 0;
  return [-Math.sin(angle) + 0, -Math.cos(angle) + 0];
}

/** 8-direction Chinese compass bearing from delta (dx = East, dz = South). */
export function CompassDirection(dx, dz) {
  if (Math.hypot(dx, dz) < 1e-4) return "原地";
  const deg = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
  return COMPASS_8[Math.round(deg / 45) % 8];
}

/** 8-direction compass label for a unit's facing yaw. */
export function YawCompass(yaw) {
  const [fx, fz] = YawForwardXZ(yaw);
  return CompassDirection(fx, fz);
}

/**
 * Relative direction from player's facing yaw to target delta (dx, dz).
 * World XZ: forward = (-sin(yaw), -cos(yaw)), right = (cos(yaw), -sin(yaw)).
 */
export function RelativeDirection(playerYaw, dx, dz) {
  if (Math.hypot(dx, dz) < 0.75) return "脚下";
  const yaw = Number.isFinite(playerYaw) ? playerYaw : 0;
  const fwd = dx * (-Math.sin(yaw)) + dz * (-Math.cos(yaw));
  const rgt = dx * Math.cos(yaw) + dz * (-Math.sin(yaw));
  const deg = (Math.atan2(rgt, fwd) * 180 / Math.PI + 360) % 360;
  return RELATIVE_8[Math.round(deg / 45) % 8];
}

/** Format elapsed seconds as MM:SS for dialogue history and HUD. */
export function FormatPlayClock(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Strip the transient "F · 完成当前交互" prompt suffix from persistent order lines
 * so stepping in and out of an interact trigger does not duplicate dialogue log entries.
 */
export function NormalizeDialogueText(line, interactPrompt = "F · 完成当前交互") {
  const raw = String(line?.text || "").trim();
  if (!raw || !line?.order) return raw;
  const suffix = `\n${interactPrompt}`;
  return raw.endsWith(suffix) ? raw.slice(0, -suffix.length).trim() : raw;
}

/**
 * Compute the arrival/interaction area for a beat using the exact same rule as
 * EncounterPlayPlan.Area(), purely read-only on the editor side.
 */
export function ResolveBeatArea(beat, gate, compiled, playConfig) {
  const trigger = gate?.target !== "end"
    ? compiled?.triggers?.find((item) => item.id === `Arrival_${beat.id}`)
    : null;
  if (trigger?.area) return trigger.area;
  const radius = playConfig?.reachByBeat?.[beat.id] ?? playConfig?.reachM ?? 3;
  return { shape: "circle", center: beat.p.at(-1), size: [radius * 2, radius * 2] };
}

/**
 * Merge live Play iframe actors (player, AI soldiers, puppets) with authored metadata
 * into a unified read-only list of 2D map entities with exact positions and yaw facings.
 */
export function MergePlayEntities({
  authoredFrame,
  compiled,
  liveActors = [],
  soldiersById = null,
  puppets = [],
  player = null,
  targetEntityIds = new Set(),
  watchEntityIds = new Set(),
  deadIds = new Set(),
} = {}) {
  const authoredById = new Map((authoredFrame?.actors || []).map((actor) => [actor.id, actor]));
  const groupsById = new Map((compiled?.groups || []).map((group) => [group.id, group]));
  const result = [];
  const seenIds = new Set();

  // 1. Live AI soldiers (allies + enemies)
  for (const entry of liveActors || []) {
    const soldier = soldiersById?.get?.(entry.soldierId) || null;
    const authored = authoredById.get(entry.id) || null;
    const group = entry.group ? groupsById.get(entry.group) : null;
    const pos = soldier?.position
      ? [soldier.position.x, soldier.position.z]
      : Array.isArray(entry.position) ? [entry.position[0], entry.position[2]] : authored?.p;
    if (!pos || !Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) continue;
    const alive = soldier ? !!soldier.alive : !!entry.alive;
    const rawYaw = Number.isFinite(soldier?.yaw)
      ? soldier.yaw
      : Number.isFinite(soldier?.actor?.root?.rotation?.y)
        ? soldier.actor.root.rotation.y
        : authored?.heading !== undefined ? -authored.heading : 0;
    const side = soldier?.kind === "ija"
      ? "enemy"
      : soldier?.kind === "nra"
        ? "friend"
        : authored?.side || group?.side || "enemy";
    const heavy = !!authored?.heavy
      || ["Zb26", "Type11", "Type92", "Maxim"].includes(soldier?.weapon)
      || (group?.weapon === "machineGun" && entry.id.endsWith("_0"));
    const name = authored?.name || group?.label || entry.id;
    const isCore = CORE_NAMED_IDS.has(entry.id);
    result.push({
      id: entry.id,
      name,
      shortName: isCore ? (authored?.name || name) : "",
      side,
      kind: "person",
      x: pos[0],
      z: pos[1],
      yaw: rawYaw,
      alive,
      stance: soldier?.stance || "stand",
      heavy,
      group: entry.group || null,
      groupLabel: group?.label || null,
      alert: !!(soldier?.targetVisible && alive),
      isTarget: alive && targetEntityIds.has(entry.id),
      isWatch: alive && watchEntityIds.has(entry.id),
      source: "soldier",
    });
    seenIds.add(entry.id);
  }

  // 2. Live Puppets (civilians, vehicles, wounded, non-AI companions/officers)
  for (const puppet of puppets || []) {
    if (!puppet?.id || puppet.id === "player" || seenIds.has(puppet.id)) continue;
    if (!Number.isFinite(puppet.x) || !Number.isFinite(puppet.z)) continue;
    const authored = authoredById.get(puppet.id) || null;
    const yaw = Number.isFinite(puppet.yawDeg)
      ? puppet.yawDeg * Math.PI / 180
      : authored?.heading !== undefined ? -authored.heading : 0;
    const side = authored?.side || (puppet.kind === "tank" ? "enemy" : "civilian");
    const kind = authored?.kind || (puppet.kind === "animal" ? "donkey" : puppet.kind || "person");
    const pose = authored?.pose || (puppet.stance === "prone" ? "wounded" : "stand");
    const alive = pose !== "dead" && !deadIds.has(puppet.id);
    const turretYaw = authored?.turret !== undefined ? -authored.turret : yaw;
    const isCore = CORE_NAMED_IDS.has(puppet.id);
    result.push({
      id: puppet.id,
      name: authored?.name || puppet.id,
      shortName: isCore ? (authored?.name || "") : "",
      side,
      kind,
      x: puppet.x,
      z: puppet.z,
      yaw,
      turretYaw,
      alive,
      stance: puppet.stance || "stand",
      pose,
      heavy: !!authored?.heavy,
      group: authored?.groupId || null,
      groupLabel: null,
      alert: false,
      isTarget: alive && targetEntityIds.has(puppet.id),
      isWatch: alive && watchEntityIds.has(puppet.id),
      source: "puppet",
    });
    seenIds.add(puppet.id);
  }

  // 3. Fallback when Play is still loading (preview starting frame actors)
  if (!liveActors.length && !puppets.length && authoredFrame?.actors) {
    for (const actor of authoredFrame.actors) {
      if (actor.id === "player" || seenIds.has(actor.id)) continue;
      const alive = actor.pose !== "dead" && !deadIds.has(actor.id);
      const yaw = actor.heading !== undefined ? -actor.heading : 0;
      const isCore = CORE_NAMED_IDS.has(actor.id);
      result.push({
        id: actor.id,
        name: actor.name || actor.id,
        shortName: isCore ? (actor.name || "") : "",
        side: actor.side || "civilian",
        kind: actor.kind || "person",
        x: actor.p[0],
        z: actor.p[1],
        yaw,
        turretYaw: actor.turret !== undefined ? -actor.turret : yaw,
        alive,
        stance: actor.pose || "stand",
        pose: actor.pose || "stand",
        heavy: !!actor.heavy,
        group: actor.groupId || null,
        groupLabel: null,
        alert: false,
        isTarget: alive && targetEntityIds.has(actor.id),
        isWatch: alive && watchEntityIds.has(actor.id),
        source: "preview",
      });
      seenIds.add(actor.id);
    }
  }

  // 4. Live Player (always last so it renders on top)
  const fallbackPlayer = authoredFrame?.player || [0, 0];
  const px = Number.isFinite(player?.x) ? player.x : fallbackPlayer[0];
  const pz = Number.isFinite(player?.z) ? player.z : fallbackPlayer[1];
  const pyaw = Number.isFinite(player?.yaw) ? player.yaw : 0;
  const playerEntity = {
    id: "player",
    name: "顺子",
    shortName: "顺子",
    side: "player",
    kind: "person",
    x: px,
    z: pz,
    yaw: pyaw,
    fovDeg: Number.isFinite(player?.fovDeg) ? player.fovDeg : 72,
    alive: player?.alive !== false,
    stance: player?.stance || "stand",
    heavy: false,
    group: null,
    groupLabel: null,
    alert: false,
    isTarget: false,
    isWatch: false,
    source: player ? "live" : "preview",
  };
  result.push(playerEntity);

  // Stable visual stacking: corpses -> vehicles/civilians -> allies -> enemies -> targets -> player
  const LayerRank = (entity) => {
    if (entity.side === "player") return 6;
    if (!entity.alive) return 0;
    if (entity.isTarget) return 5;
    if (entity.side === "enemy") return 4;
    if (entity.side === "friend") return 3;
    if (entity.kind === "tank" || entity.kind === "cart") return 2;
    return 1;
  };
  result.sort((a, b) => LayerRank(a) - LayerRank(b));
  return { entities: result, player: playerEntity };
}

/**
 * Compute current Playtest Objective Guide: target points/zones, required enemy IDs,
 * remaining wave counts, planned path, relative bearing/distance, and live gate checklist.
 */
export function BuildPlayObjectiveGuide({
  variant,
  compiled,
  state,
  player = null,
  liveActors = [],
  soldiersById = null,
  puppets = [],
  authoredFrame = null,
} = {}) {
  const beatId = state?.beat || authoredFrame?.beat?.id || variant.timeline[0].id;
  const beat = variant.BeatById(beatId) || variant.timeline[0];
  const stage = variant.stages.find((item) => item.id === beat.stage) || variant.stages[0];
  const playConfig = variant.playConfig;
  const gate = playConfig.gates?.[beat.id] || {};
  const deadSet = new Set(state?.dead || []);
  const conditions = new Set(state?.conditions || (state?.waiting ? [state.waiting] : []));
  const ready = !!state?.ready;

  // Identify required target & watched entity IDs first so MergePlayEntities tags them.
  const targetEntityIds = new Set();
  const watchEntityIds = new Set();
  const compiledGroupsById = new Map((compiled?.groups || []).map((group) => [group.id, group]));

  for (const id of gate.kill || []) {
    if (!deadSet.has(id)) targetEntityIds.add(id);
  }
  const clearGroupIds = (gate.clear || []).filter((id) => compiledGroupsById.get(id)?.enabled);
  const killsGroupIds = (gate.kills?.groups || []).filter((id) => compiledGroupsById.get(id)?.enabled);
  const requiredGroupSet = new Set([...clearGroupIds, ...killsGroupIds]);
  const departedGroupIds = (gate.departed || []).filter((id) => compiledGroupsById.get(id)?.enabled);

  for (const entry of liveActors || []) {
    const soldier = soldiersById?.get?.(entry.soldierId) || null;
    const alive = soldier ? !!soldier.alive : !!entry.alive;
    if (!alive) continue;
    if (entry.group && requiredGroupSet.has(entry.group)) targetEntityIds.add(entry.id);
    if (entry.group && departedGroupIds.includes(entry.group)) watchEntityIds.add(entry.id);
    if (entry.group === "TempleSearch" && beat.id === "09b") watchEntityIds.add(entry.id);
  }

  const merged = MergePlayEntities({
    authoredFrame,
    compiled,
    liveActors,
    soldiersById,
    puppets,
    player,
    targetEntityIds,
    watchEntityIds,
    deadIds: deadSet,
  });
  const livePlayer = merged.player;
  const playerPos = [livePlayer.x, livePlayer.z];

  const area = ResolveBeatArea(beat, gate, compiled, playConfig);
  const retreatPoint = beat.p.at(-1);
  const reachM = playConfig.reachByBeat?.[beat.id] ?? playConfig.reachM ?? 3;
  const insideArea = InsideArea(playerPos, area);

  // Build pending combat groups summary (including not-yet-spawned enemies)
  const pendingGroups = [];
  const checklist = [];

  // Stealth / no-fire indicator
  const stealthActive = !!(state?.stealth?.active || state?.stealth?.noFire);
  if (stealthActive && !state?.failed && !state?.completed) {
    const alarm = !!state?.stealth?.alarm;
    const suspicion = Number(state?.stealth?.suspicion || 0);
    checklist.push({
      id: "stealth",
      kind: "stealth",
      done: false,
      urgent: alarm || suspicion > 0,
      label: alarm ? "潜行暴露 · 警报拉响" : suspicion > 0 ? "敌军起疑 · 立即缩回掩体" : "潜行规则：禁止开火与投弹",
      detail: alarm ? "后送通道已暴露，准备重来" : suspicion > 0 ? "不要暴露在红锥视野内" : "贴墙隐蔽绕行，勿响枪",
    });
  }

  // 1. Reach area condition
  const reachDone = !gate.area || (ready && !conditions.has("reach") && insideArea);
  if (gate.area) {
    const dist = Distance(playerPos, area.center);
    const dx = area.center[0] - playerPos[0], dz = area.center[1] - playerPos[1];
    checklist.push({
      id: "reach",
      kind: "reach",
      done: ready && !conditions.has("reach"),
      urgent: false,
      label: "抵达目标区域",
      detail: ready && !conditions.has("reach")
        ? "已进入目标区"
        : `距 ${Math.round(dist)} m · ${RelativeDirection(livePlayer.yaw, dx, dz)}（${CompassDirection(dx, dz)}）`,
    });
  }

  // 2. Action / F-interact condition
  const interactPending = !!gate.action && (!ready || conditions.has("interact"));
  if (gate.action) {
    const dist = Distance(playerPos, area.center);
    const dx = area.center[0] - playerPos[0], dz = area.center[1] - playerPos[1];
    const actionLabel = ACTION_LABELS[gate.action] || "前往交互点并按 F";
    checklist.push({
      id: "interact",
      kind: "interact",
      done: !interactPending,
      urgent: interactPending && insideArea && ready && !state?.failed,
      label: interactPending && insideArea ? "已就位：立即按 F 完成交互" : actionLabel,
      detail: !interactPending
        ? "已完成交互"
        : insideArea
          ? "当前位于交互范围内，按键盘 F"
          : `距交互点 ${Math.round(dist)} m · ${RelativeDirection(livePlayer.yaw, dx, dz)}（${CompassDirection(dx, dz)}）`,
    });
  }

  // 3. Retreat condition (after planting explosives)
  const retreatPending = !!gate.retreat && (!ready || conditions.has("retreat"));
  if (gate.retreat) {
    const dist = Distance(playerPos, retreatPoint);
    const dx = retreatPoint[0] - playerPos[0], dz = retreatPoint[1] - playerPos[1];
    checklist.push({
      id: "retreat",
      kind: "retreat",
      done: !retreatPending,
      urgent: !interactPending && retreatPending,
      label: "撤回安全掩蔽点",
      detail: !retreatPending
        ? "已撤回安全位置"
        : `距安全点 ${Math.round(dist)} m · ${RelativeDirection(livePlayer.yaw, dx, dz)}（${CompassDirection(dx, dz)}）`,
    });
  }

  // 4. Specific named kills
  if (gate.kill?.length) {
    const remaining = gate.kill.filter((id) => !deadSet.has(id));
    checklist.push({
      id: "kill",
      kind: "combat",
      done: remaining.length === 0,
      urgent: false,
      label: "击毙指定目标敌军",
      detail: remaining.length === 0 ? "目标已击毙" : `剩余 ${remaining.length} / ${gate.kill.length} 人（红圈标记）`,
    });
  }

  // 5. Clear enemy groups
  for (const groupId of clearGroupIds) {
    const group = compiledGroupsById.get(groupId);
    let deadCount = 0;
    for (let index = 0; index < group.count; index++) {
      if (deadSet.has(`${groupId}_${index}`)) deadCount++;
    }
    const remaining = Math.max(0, group.count - deadCount);
    const liveMembers = merged.entities.filter((entity) => entity.group === groupId && entity.alive);
    if (remaining > 0) {
      pendingGroups.push({
        id: groupId,
        label: group.label,
        remaining,
        total: group.count,
        live: liveMembers.length,
        areaCenter: group.area.center,
        route: group.route || [group.area.center],
      });
    }
    checklist.push({
      id: `clear_${groupId}`,
      kind: "combat",
      done: remaining === 0,
      urgent: false,
      label: `清除：${group.label}`,
      detail: remaining === 0
        ? "已全部清除"
        : `剩余 ${remaining} / ${group.count}${liveMembers.length ? `（在场 ${liveMembers.length}）` : "（接近中）"}`,
    });
  }

  // 6. Kill count across groups
  if (gate.kills) {
    const available = killsGroupIds.reduce((sum, id) => sum + (compiledGroupsById.get(id)?.count || 0), 0);
    const needed = Math.min(gate.kills.count, available);
    let killed = 0;
    for (const deadId of deadSet) {
      if (killsGroupIds.some((groupId) => deadId.startsWith(`${groupId}_`))) killed++;
    }
    const remaining = Math.max(0, needed - killed);
    if (remaining > 0) {
      for (const groupId of killsGroupIds) {
        const group = compiledGroupsById.get(groupId);
        const liveMembers = merged.entities.filter((entity) => entity.group === groupId && entity.alive);
        pendingGroups.push({
          id: groupId,
          label: group.label,
          remaining,
          total: needed,
          live: liveMembers.length,
          areaCenter: group.area.center,
          route: group.route || [group.area.center],
        });
      }
    }
    checklist.push({
      id: "kills",
      kind: "combat",
      done: remaining === 0,
      urgent: false,
      label: "压制并击杀敌军",
      detail: remaining === 0 ? `已击杀 ${needed}/${needed}` : `已击杀 ${Math.min(killed, needed)} / ${needed}（红圈标记）`,
    });
  }

  // 7. Escort stretchers
  let escortExitZ = null;
  if (gate.escort) {
    escortExitZ = playConfig.escortExitZ;
    const passed = (puppets || []).filter((p) => /^stretcher\d+$/.test(p.id) && p.z >= escortExitZ).length;
    const done = ready && !conditions.has("escort");
    checklist.push({
      id: "escort",
      kind: "escort",
      done,
      urgent: false,
      label: "掩护担架通过通道",
      detail: done ? `已全部通过（${gate.escort}/${gate.escort}）` : `已通过 ${Math.min(passed, gate.escort)} / ${gate.escort}`,
    });
  }

  // 8. Enemy departure wait
  if (departedGroupIds.length) {
    const done = ready && !conditions.has("departure");
    checklist.push({
      id: "departure",
      kind: "departure",
      done,
      urgent: false,
      label: "隐蔽等待敌军撤离",
      detail: done ? "敌军已离开" : "等待黄圈搜兵走远，切勿暴露",
    });
  }

  // 9. Fact / Event wait
  if (gate.fact) {
    const done = ready && !conditions.has("event");
    checklist.push({
      id: `fact_${gate.fact}`,
      kind: "event",
      done,
      urgent: !interactPending && !done,
      label: FACT_LABELS[gate.fact] || "等待交互结果生效",
      detail: done ? "已完成" : interactPending ? "完成交互后等待触发" : "保持隐蔽，等待生效",
    });
  }
  if (gate.event) {
    const done = ready && !conditions.has("event");
    checklist.push({
      id: `event_${gate.event}`,
      kind: "event",
      done,
      urgent: false,
      label: EVENT_LABELS[gate.event] || "等待当前事件完成",
      detail: done ? "已完成" : "留意同伴与搜查兵动向",
    });
  }

  // Pick Primary Objective Target for 2D map beacon, guide line & compass chip
  let primaryTarget = null;
  const MakeTarget = (kind, label, point, zoneArea = null, canInteractNow = false) => {
    if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
    const dx = point[0] - playerPos[0], dz = point[1] - playerPos[1];
    const dist = Math.hypot(dx, dz);
    return {
      kind,
      label,
      point: [point[0], point[1]],
      area: zoneArea,
      distanceM: dist,
      compass: CompassDirection(dx, dz),
      relative: RelativeDirection(livePlayer.yaw, dx, dz),
      insideArea: zoneArea ? InsideArea(playerPos, zoneArea) : dist <= reachM,
      canInteractNow,
    };
  };

  if (interactPending) {
    primaryTarget = MakeTarget("interact", insideArea ? "按 F 交互" : "F 交互点", area.center, area, insideArea);
  } else if (retreatPending && !interactPending) {
    const retreatZone = { shape: "circle", center: retreatPoint, size: [reachM * 2, reachM * 2] };
    primaryTarget = MakeTarget("retreat", "安全撤离点", retreatPoint, retreatZone, false);
  } else if (gate.area && (!ready || conditions.has("reach") || !reachDone)) {
    primaryTarget = MakeTarget("area", "任务目标点", area.center, area, false);
  } else {
    const liveTargets = merged.entities.filter((entity) => entity.isTarget && entity.alive);
    if (liveTargets.length) {
      liveTargets.sort((a, b) => Distance(playerPos, [a.x, a.z]) - Distance(playerPos, [b.x, b.z]));
      const nearest = liveTargets[0];
      primaryTarget = MakeTarget("combat", `清除敌军（剩 ${liveTargets.length}）`, [nearest.x, nearest.z], null, false);
    } else if (pendingGroups.length) {
      const group = pendingGroups[0];
      const anchor = group.route?.at(-1) || group.areaCenter;
      primaryTarget = MakeTarget("combat", `${group.label}（剩 ${group.remaining}）`, anchor, null, false);
    } else {
      const watched = merged.entities.filter((entity) => entity.isWatch && entity.alive);
      if (watched.length) {
        watched.sort((a, b) => Distance(playerPos, [a.x, a.z]) - Distance(playerPos, [b.x, b.z]));
        primaryTarget = MakeTarget("depart", "等待敌军离开", [watched[0].x, watched[0].z], null, false);
      } else if (gate.event === "partyArrived" && retreatPoint) {
        const exitZone = { shape: "circle", center: retreatPoint, size: [reachM * 2, reachM * 2] };
        primaryTarget = MakeTarget("area", "出庙汇合点", retreatPoint, exitZone, false);
      } else if (beat.p?.length) {
        primaryTarget = MakeTarget("area", "节拍点位", beat.p.at(-1), null, false);
      }
    }
  }

  // Determine overall status badge
  let statusKind = "running";
  let statusBadge = "运行中";
  if (!ready && !state?.error) { statusKind = "loading"; statusBadge = "载入中"; }
  else if (state?.error) { statusKind = "failed"; statusBadge = "加载失败"; }
  else if (state?.completed) { statusKind = "completed"; statusBadge = "试玩完成"; }
  else if (state?.failed) { statusKind = "failed"; statusBadge = state?.stealth?.active ? "潜行失败" : "顺子阵亡"; }
  else if (state?.paused) { statusKind = "paused"; statusBadge = "已暂停"; }
  else if (state?.stealth?.alarm) { statusKind = "alarm"; statusBadge = "暴露警报"; }
  else if (stealthActive) { statusKind = "stealth"; statusBadge = "潜行禁火"; }

  const liveAllies = merged.entities.filter((entity) => entity.side === "friend" && entity.alive).length;
  const liveEnemies = merged.entities.filter((entity) => entity.side === "enemy" && entity.alive).length;
  const liveTargetsCount = merged.entities.filter((entity) => entity.isTarget && entity.alive).length;

  return {
    beatId: beat.id,
    beatTitle: beat.title,
    stageId: stage.id,
    stageTitle: stage.title,
    statusKind,
    statusBadge,
    primaryTarget,
    plannedRoute: beat.p || [],
    targetEntityIds,
    watchEntityIds,
    pendingGroups,
    escortExitZ,
    checklist,
    entities: merged.entities,
    player: livePlayer,
    counts: { allies: liveAllies, enemies: liveEnemies, targets: liveTargetsCount },
    stealthActive,
  };
}

/**
 * Pure editor-side dialogue history recorder for Play mode.
 * Captures both story dialogue and tactical orders, groups by beat, deduplicates
 * active frames, and marks checkpoint retries without touching any game data.
 */
export class PlayDialogueHistory {
  constructor({ maxEntries = 400, interactPrompt = "F · 完成当前交互" } = {}) {
    this.maxEntries = maxEntries;
    this.interactPrompt = interactPrompt;
    this.Reset();
  }

  Reset() {
    this.entries = [];
    this.seen = new Set();
    this.activeKeys = new Set();
    this.segment = 0;
    this.seq = 0;
    this.lastBeatId = null;
    this.version = 0;
  }

  MarkRetry(beatId, beatTitle, elapsed = 0) {
    this.segment++;
    this.lastBeatId = null;
    this.activeKeys.clear();
    if (!this.entries.length) return false;
    this.entries.push({
      seq: ++this.seq,
      kind: "divider",
      beatId,
      elapsed,
      text: `检查点重来 · ${String(beatId || "").toUpperCase()}${beatTitle ? ` ${beatTitle}` : ""}`,
    });
    this.Trim();
    this.version++;
    return true;
  }

  Ingest({ beatId, beatTitle = "", elapsed = 0, lines = [], sideByActorId = null } = {}) {
    let changed = false;
    const nextActive = new Set();

    if (beatId && beatId !== this.lastBeatId && lines.length > 0) {
      this.lastBeatId = beatId;
      this.entries.push({
        seq: ++this.seq,
        kind: "beat",
        beatId,
        elapsed,
        text: `${beatId.toUpperCase()}${beatTitle ? ` · ${beatTitle}` : ""}`,
      });
      changed = true;
    }

    for (const line of lines || []) {
      const text = NormalizeDialogueText(line, this.interactPrompt);
      if (!text) continue;
      const key = `${this.segment}:${beatId || ""}:${line.id || ""}:${text}`;
      nextActive.add(key);
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      if (beatId && beatId !== this.lastBeatId) {
        this.lastBeatId = beatId;
        this.entries.push({
          seq: ++this.seq,
          kind: "beat",
          beatId,
          elapsed,
          text: `${beatId.toUpperCase()}${beatTitle ? ` · ${beatTitle}` : ""}`,
        });
      }
      const side = line.actorId === "player"
        ? "player"
        : (sideByActorId?.get?.(line.actorId) || (line.actorId ? "friend" : "system"));
      this.entries.push({
        seq: ++this.seq,
        kind: "line",
        key,
        id: line.id || `line_${this.seq}`,
        beatId: beatId || "",
        elapsed,
        actorId: line.actorId || null,
        name: line.name || (line.order ? "任务指引" : "旁白"),
        side,
        text,
        order: !!line.order,
      });
      changed = true;
    }

    const activeChanged = nextActive.size !== this.activeKeys.size
      || [...nextActive].some((key) => !this.activeKeys.has(key));
    this.activeKeys = nextActive;
    if (changed) this.Trim();
    if (changed || activeChanged) this.version++;
    return changed || activeChanged;
  }

  Trim() {
    while (this.entries.length > this.maxEntries) this.entries.shift();
  }

  Filtered(filter = "all") {
    if (filter === "all") return this.entries;
    const wantOrder = filter === "order";
    const lines = this.entries.filter((entry) => entry.kind !== "line" || entry.order === wantOrder);
    // Drop trailing/empty beat headers when filtering
    const cleaned = [];
    for (let i = 0; i < lines.length; i++) {
      const entry = lines[i];
      if (entry.kind === "beat") {
        const next = lines[i + 1];
        if (!next || next.kind === "beat" || next.kind === "divider") continue;
      }
      cleaned.push(entry);
    }
    return cleaned;
  }

  LineCount() {
    let count = 0;
    for (const entry of this.entries) if (entry.kind === "line") count++;
    return count;
  }

  Snapshot() {
    return {
      totalLines: this.LineCount(),
      activeCount: this.activeKeys.size,
      entries: this.entries.map((entry) => ({
        ...entry,
        active: entry.kind === "line" && this.activeKeys.has(entry.key),
      })),
    };
  }
}
