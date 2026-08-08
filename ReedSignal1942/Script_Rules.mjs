import { Chapters, GameMetadata, GetChapter } from "./Data_World.mjs?v=20260808z11";
import { GetCinematicCue } from "./Data_Scene3D.mjs?v=20260808z11";

export const RuleConstants = Object.freeze({
  walkSpeed: 178,
  crouchSpeed: 92,
  carrySpeed: 116,
  pushSpeed: 54,
  gravity: 920,
  jumpSpeed: 390,
  suspicionRise: 1.24,
  suspicionFall: 0.68,
  gustPeriod: 7.5,
  gustStart: 0.54,
  gustEnd: 0.82,
  actionDistance: 74,
  followerSpacing: 38,
});

export function CreateGameState(chapterIndex = 0) {
  const chapter = GetChapter(chapterIndex);
  const followerCount = chapter.id === "ferry" ? 6 : ["blockade", "tunnel"].includes(chapter.id) ? 1 : 0;
  const state = {
    version: 1,
    chapterIndex,
    mode: "playing",
    elapsed: 0,
    player: { x: chapter.startX, y: GetGroundY(chapter, chapter.startX, null, 0) ?? 0, vx: 0, vy: 0, facing: 1, crouching: false, grounded: true, carrying: null },
    completed: new Set(),
    checkpoint: { x: chapter.startX, completed: [] },
    suspicion: 0,
    detections: 0,
    actionProgress: 0,
    activeActionId: null,
    cartX: chapter.cart?.startX ?? null,
    waterLevel: 0,
    distractionUntil: 0,
    smokeFrontX: chapter.smoke?.startX ?? null,
    followersHolding: false,
    followers: [],
    eventQueue: [],
    cinematicCue: null,
    objectivePulse: 0,
    chapterComplete: false,
    endingReady: false,
  };
  SetFollowerCount(state, followerCount);
  return state;
}

export function SetFollowerCount(state, count) {
  const current = state.followers.length;
  if (count <= current) {
    state.followers.length = count;
    return;
  }
  for (let index = current; index < count; index += 1) {
    state.followers.push({
      x: Math.max(12, state.player.x - RuleConstants.followerSpacing * (index + 1)),
      y: state.player.y,
      vx: 0,
      facing: 1,
      nameIndex: index,
      responseDelay: 0.04 + index * 0.045,
    });
  }
}

export function GetGroundY(chapter, x, state = null, fallback = null) {
  const segment = chapter.terrain.find((item) => x >= item.x0 && x <= item.x1);
  if (!segment) return fallback;
  if (segment.dynamic === "sluiceBridge" && !state?.completed?.has("raiseSluice")) return fallback;
  return segment.y;
}

export function IsWindGust(elapsed) {
  const phase = (elapsed % RuleConstants.gustPeriod) / RuleConstants.gustPeriod;
  return phase >= RuleConstants.gustStart && phase <= RuleConstants.gustEnd;
}

export function GetWindStrength(elapsed) {
  const phase = (elapsed % RuleConstants.gustPeriod) / RuleConstants.gustPeriod;
  return 0.22 + Math.max(0, Math.sin(phase * Math.PI * 2 - Math.PI * 0.75)) * 0.78;
}

export function RequirementsMet(state, action) {
  return (action.requires || []).every((id) => state.completed.has(id));
}

export function GetAvailableAction(state) {
  const chapter = GetChapter(state.chapterIndex);
  let nearest = null;
  let nearestDistance = Infinity;
  for (const action of chapter.actions) {
    if (state.completed.has(action.id) || action.special === "cart" || !RequirementsMet(state, action)) continue;
    const distance = Math.abs(state.player.x - action.x);
    if (distance <= RuleConstants.actionDistance && distance < nearestDistance) {
      nearest = action;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function GetBlockedActionReason(state, action) {
  if (!action) return "";
  if (action.condition === "followersWaiting") {
    if (!state.followersHolding) return "先按 F，让孩子们留在上一处遮蔽后。";
    const chapter = GetChapter(state.chapterIndex);
    if (state.followers.some((follower) => !IsPositionCovered(chapter, state, follower.x, true))) return "孩子们还没有全进遮蔽。先带队退到草垛或芦苇后。";
  }
  if (action.condition === "followersTogether") {
    if (state.followersHolding) return "按 F，让孩子们重新跟上。";
    const farthest = Math.max(0, ...state.followers.map((follower) => Math.abs(follower.x - state.player.x)));
    if (farthest > 310) return "还有孩子没有跟到渡口。";
  }
  return "";
}

export function IsPositionCovered(chapter, state, x, crouching = true) {
  if (!crouching && chapter.id !== "tunnel") return false;
  const authoredCover = chapter.covers.some((cover) => {
    if (cover.requires && !state.completed.has(cover.requires)) return false;
    return x >= cover.x0 && x <= cover.x1;
  });
  if (authoredCover) return true;
  if (chapter.cart && state.cartX !== null && Math.abs(x - state.cartX) <= 120) return true;
  return false;
}

export function GetLightTarget(hazard, state) {
  if (hazard.distractBy === "motherSignal" && state.completed.has("motherSignal")) return hazard.x1 + 260;
  if (hazard.distractBy && state.completed.has(hazard.distractBy) && state.elapsed < state.distractionUntil) {
    return hazard.x0 - 180;
  }
  const normalized = (Math.sin((state.elapsed / hazard.period) * Math.PI * 2 + hazard.phase) + 1) * 0.5;
  return hazard.x0 + normalized * (hazard.x1 - hazard.x0);
}

export function MeasureExposure(state) {
  const chapter = GetChapter(state.chapterIndex);
  let exposure = 0;
  const bodies = [{ x: state.player.x, crouching: state.player.crouching }];
  for (const follower of state.followers) bodies.push({ x: follower.x, crouching: true });
  for (const hazard of chapter.hazards || []) {
    if (hazard.kind !== "searchlight") continue;
    const target = GetLightTarget(hazard, state);
    for (const body of bodies) {
      if (body.x < hazard.x0 - 30 || body.x > hazard.x1 + 30) continue;
      if (Math.abs(body.x - target) > hazard.width) continue;
      if (IsPositionCovered(chapter, state, body.x, body.crouching)) continue;
      exposure = Math.max(exposure, 1 - Math.abs(body.x - target) / hazard.width);
    }
  }
  return exposure;
}

export function MeasureNoise(state) {
  const chapter = GetChapter(state.chapterIndex);
  const moving = Math.abs(state.player.vx) > 8;
  if (!moving) return 0;
  let noise = state.player.crouching ? 0.12 : 0.46;
  if (state.player.carrying === "shuan") noise += 0.12;
  if (!state.followersHolding) noise += state.followers.length * 0.035;
  const soundZone = (chapter.soundZones || []).find((zone) => state.player.x >= zone.x0 && state.player.x <= zone.x1);
  if (soundZone) {
    noise += soundZone.kind === "dryReeds" ? 0.72 : 0.38;
    if (IsWindGust(state.elapsed)) noise *= 0.18;
  }
  return Math.min(1, noise);
}

function GetGateBlock(chapter, state, fromX, toX) {
  for (const gate of chapter.gates || []) {
    if (state.completed.has(gate.requires)) continue;
    if ((fromX < gate.x && toX >= gate.x) || (fromX > gate.x && toX <= gate.x)) return gate;
  }
  return null;
}

function IsUnderLowCeiling(chapter, x) {
  return (chapter.lowCeilings || []).some((zone) => x >= zone.x0 && x <= zone.x1);
}

function UpdateFollowers(state, chapter, deltaTime) {
  let leaderX = state.player.x - state.player.facing * 28;
  for (let index = 0; index < state.followers.length; index += 1) {
    const follower = state.followers[index];
    const spacing = RuleConstants.followerSpacing + (index % 2) * 3;
    const desiredX = leaderX - state.player.facing * spacing;
    const deltaX = desiredX - follower.x;
    follower.responseDelay = Math.max(0, (follower.responseDelay || 0) - deltaTime);
    const response = Math.max(2.15, 3.65 - index * 0.16);
    const maxSpeed = Math.max(116, 146 - index * 3.5);
    let desiredVelocity = state.followersHolding || follower.responseDelay > 0
      ? 0
      : Math.max(-maxSpeed, Math.min(maxSpeed, deltaX * response));
    if (Math.abs(deltaX) < 5.5) desiredVelocity = 0;
    const acceleration = (state.followersHolding ? 420 : 335) * deltaTime;
    const velocityDelta = Math.max(-acceleration, Math.min(acceleration, desiredVelocity - (follower.vx || 0)));
    follower.vx = (follower.vx || 0) + velocityDelta;
    follower.x += follower.vx * deltaTime;
    if (Math.abs(follower.vx) > 7) follower.facing = Math.sign(follower.vx);
    follower.y = GetGroundY(chapter, follower.x, state, state.player.y) ?? state.player.y;
    leaderX = follower.x;
  }
}

function RestoreCheckpoint(state) {
  const chapterIndex = state.chapterIndex;
  const detections = state.detections + 1;
  const saved = state.checkpoint;
  const replacement = CreateGameState(chapterIndex);
  replacement.completed = new Set(saved.completed);
  replacement.player.x = saved.x;
  replacement.player.y = GetGroundY(GetChapter(chapterIndex), saved.x, replacement, 0) ?? 0;
  replacement.checkpoint = { x: saved.x, completed: [...saved.completed] };
  replacement.detections = detections;
  replacement.cartX = state.cartX;
  replacement.waterLevel = state.waterLevel;
  replacement.distractionUntil = state.distractionUntil;
  replacement.smokeFrontX = state.smokeFrontX;
  replacement.followersHolding = false;
  if (replacement.completed.has("findMizi") && replacement.followers.length === 0) SetFollowerCount(replacement, 1);
  if (replacement.completed.has("findChildren")) SetFollowerCount(replacement, replacement.completed.has("liftShuan") ? 6 : 5);
  Object.assign(state, replacement);
  state.eventQueue.push({ type: "detected", text: "巡逻逼近。阿苇把大家带回上一处遮蔽。" });
}

function UpdateSmoke(state, chapter, deltaTime) {
  if (!chapter.smoke || state.completed.has("sealEastCrack")) return;
  if (state.elapsed < chapter.smoke.safeUntil) return;
  state.smokeFrontX -= chapter.smoke.speed * deltaTime;
  if (state.player.x > state.smokeFrontX - 90) {
    state.eventQueue.push({ type: "warning", text: "烟压了下来。先让枯井通风，再封住东侧裂缝。" });
    RestoreCheckpoint(state);
  }
}

function UpdatePushCart(state, chapter, input, deltaTime) {
  if (!chapter.cart || state.completed.has("cartPlaced") || !input.interact) return false;
  const cartAction = chapter.actions.find((action) => action.id === "cartPlaced");
  if (!RequirementsMet(state, cartAction)) return false;
  if (Math.abs(state.player.x - state.cartX) > 86) return false;
  const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (direction === 0) return true;
  const nextCartX = Math.max(chapter.cart.minX, Math.min(chapter.cart.maxX, state.cartX + direction * RuleConstants.pushSpeed * deltaTime));
  state.cartX = nextCartX;
  state.player.x = nextCartX - direction * 56;
  state.player.facing = direction;
  if (state.cartX >= chapter.cart.targetX) CompleteAction(state, cartAction);
  return true;
}

function UpdateAction(state, input, deltaTime) {
  const action = GetAvailableAction(state);
  if (!action || !input.interact) {
    state.activeActionId = null;
    state.actionProgress = Math.max(0, state.actionProgress - deltaTime * 1.8);
    return;
  }
  const reason = GetBlockedActionReason(state, action);
  if (reason) {
    if (input.interactPressed) state.eventQueue.push({ type: "hint", text: reason });
    state.activeActionId = null;
    state.actionProgress = 0;
    return;
  }
  if (state.activeActionId !== action.id) {
    state.activeActionId = action.id;
    state.actionProgress = 0;
  }
  state.actionProgress += deltaTime;
  if (state.actionProgress >= action.seconds) CompleteAction(state, action);
}

export function CompleteAction(state, action) {
  if (!action || state.completed.has(action.id)) return false;
  state.completed.add(action.id);
  state.actionProgress = 0;
  state.activeActionId = null;
  state.objectivePulse = 1;
  const cinematicCue = GetCinematicCue(action.id);
  state.cinematicCue = cinematicCue
    ? { actionId: action.id, startedAt: state.elapsed, duration: cinematicCue.duration, pose: cinematicCue.pose, followerPose: cinematicCue.followerPose || null, camera: cinematicCue.camera }
    : null;
  if (action.effect === "addMizi") SetFollowerCount(state, 1);
  if (action.effect === "distractLight") state.distractionUntil = state.elapsed + 12;
  if (action.effect === "raiseWater") state.waterLevel = 1;
  if (action.effect === "ventSmoke") state.smokeFrontX += 380;
  if (action.effect === "stopSmoke") state.smokeFrontX = 99999;
  if (action.effect === "addChildren") SetFollowerCount(state, 5);
  if (action.effect === "carryShuan") {
    SetFollowerCount(state, 6);
    state.player.carrying = "shuan";
  }
  if (action.effect === "releaseShuan") state.player.carrying = null;
  if (action.effect === "distractFinal") state.distractionUntil = Number.POSITIVE_INFINITY;
  if (action.story) state.eventQueue.push({
    type: "story",
    text: action.story,
    cue: cinematicCue ? action.id : null,
    cameraCue: cinematicCue?.camera || null,
    poseCue: cinematicCue?.pose || null,
    duration: cinematicCue?.duration || 0,
  });
  if (action.checkpoint) {
    state.checkpoint = { x: action.x, completed: [...state.completed] };
  }
  if (action.effect === "finishStory") {
    state.endingReady = true;
    // Let the final boarding cue breathe for a couple of seconds before the
    // roll-call panel appears.  The rules layer remains deterministic: this
    // mode simply freezes gameplay while the renderer plays the authored cue.
    state.mode = "endingCinematic";
  }
  return true;
}

export function ToggleFollowers(state) {
  if (state.followers.length < 2) return false;
  state.followersHolding = !state.followersHolding;
  state.eventQueue.push({ type: "command", text: state.followersHolding ? "阿苇抬起手：留在这里。" : "阿苇放低手：跟紧我。" });
  return true;
}

export function StepGameState(state, input, deltaTime) {
  if (state.mode !== "playing") return state;
  const chapter = GetChapter(state.chapterIndex);
  const delta = Math.max(0, Math.min(0.05, deltaTime));
  state.elapsed += delta;
  state.objectivePulse = Math.max(0, state.objectivePulse - delta * 1.6);
  if (input.commandPressed) ToggleFollowers(state);

  state.player.crouching = Boolean(input.crouch || IsUnderLowCeiling(chapter, state.player.x));
  const pushing = UpdatePushCart(state, chapter, input, delta);
  if (!pushing) {
    const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let speed = state.player.crouching ? RuleConstants.crouchSpeed : RuleConstants.walkSpeed;
    if (state.player.carrying) speed = Math.min(speed, RuleConstants.carrySpeed);
    state.player.vx = direction * speed;
    if (direction) state.player.facing = direction;
    const previousX = state.player.x;
    let nextX = Math.max(18, Math.min(chapter.width - 18, previousX + state.player.vx * delta));
    const gate = GetGateBlock(chapter, state, previousX, nextX);
    if (gate) {
      nextX = gate.x - Math.sign(state.player.vx || 1) * 22;
      if (input.right || input.left) state.eventQueue.push({ type: "gate", text: gate.hint, onceKey: `gate:${gate.x}` });
    }
    const previousGround = GetGroundY(chapter, previousX, state, state.player.y);
    const nextGround = GetGroundY(chapter, nextX, state, null);
    if (nextGround !== null && previousGround !== null && nextGround - previousGround > 58 && state.player.y < nextGround - 18) nextX = previousX;
    state.player.x = nextX;

    if (input.jumpPressed && state.player.grounded && !state.player.crouching && !state.player.carrying) {
      state.player.vy = RuleConstants.jumpSpeed;
      state.player.grounded = false;
    }
    state.player.vy -= RuleConstants.gravity * delta;
    state.player.y += state.player.vy * delta;
    const ground = GetGroundY(chapter, state.player.x, state, null);
    if (ground !== null && state.player.y <= ground) {
      state.player.y = ground;
      state.player.vy = 0;
      state.player.grounded = true;
    } else if (ground === null) {
      state.player.grounded = false;
    }
    if (state.player.y < -280) {
      state.eventQueue.push({ type: "warning", text: "水太深。浮桥升起来以前不能过。" });
      RestoreCheckpoint(state);
      return state;
    }
  }

  UpdateFollowers(state, chapter, delta);
  UpdateAction(state, input, delta);
  UpdateSmoke(state, chapter, delta);

  const exposure = MeasureExposure(state);
  const noise = MeasureNoise(state);
  const danger = Math.max(exposure, noise > 0.72 ? noise * 0.7 : 0);
  if (danger > 0.08) state.suspicion = Math.min(1, state.suspicion + danger * RuleConstants.suspicionRise * delta);
  else state.suspicion = Math.max(0, state.suspicion - RuleConstants.suspicionFall * delta);
  if (state.suspicion >= 1) RestoreCheckpoint(state);
  return state;
}

export function GetObjective(state) {
  const chapter = GetChapter(state.chapterIndex);
  for (const group of chapter.objectiveGroups) {
    const done = group.ids.filter((id) => state.completed.has(id)).length;
    if (done < group.ids.length) return { label: group.label, done, total: group.ids.length };
  }
  return { label: "向右抵达下一处遮蔽", done: 1, total: 1 };
}

export function IsChapterReady(state) {
  const chapter = GetChapter(state.chapterIndex);
  const lastAction = chapter.actions[chapter.actions.length - 1];
  return state.completed.has(lastAction.id) && !state.endingReady;
}

export function AdvanceChapter(state) {
  if (state.chapterIndex >= Chapters.length - 1) return state;
  return CreateGameState(state.chapterIndex + 1);
}

export function SerializeGameState(state) {
  return JSON.stringify({
    version: 1,
    gameId: GameMetadata.id,
    chapterIndex: state.chapterIndex,
    playerX: Math.round(state.player.x),
    completed: [...state.completed],
    checkpoint: state.checkpoint,
    detections: state.detections,
    cartX: state.cartX,
    waterLevel: state.waterLevel,
    followersHolding: state.followersHolding,
  });
}

export function RestoreGameState(serialized) {
  const data = JSON.parse(serialized);
  if (data.version !== 1 || data.gameId !== GameMetadata.id) throw new Error("Unsupported ReedSignal1942 save data");
  const state = CreateGameState(data.chapterIndex);
  state.completed = new Set(data.completed || []);
  state.player.x = Number.isFinite(data.playerX) ? data.playerX : state.player.x;
  state.player.y = GetGroundY(GetChapter(state.chapterIndex), state.player.x, state, 0) ?? 0;
  state.checkpoint = data.checkpoint || { x: state.player.x, completed: [...state.completed] };
  state.detections = data.detections || 0;
  state.cartX = data.cartX ?? state.cartX;
  state.waterLevel = data.waterLevel || 0;
  state.followersHolding = Boolean(data.followersHolding);
  if (state.completed.has("releaseBoat") && !state.completed.has("raiseSluice")) state.distractionUntil = 12;
  if (state.completed.has("raiseSluice")) state.waterLevel = 1;
  if (state.completed.has("openWellVent") && !state.completed.has("sealEastCrack")) state.smokeFrontX = (GetChapter(state.chapterIndex).smoke?.startX ?? 0) + 380;
  if (state.completed.has("sealEastCrack")) state.smokeFrontX = 99999;
  if (state.completed.has("findMizi")) SetFollowerCount(state, 1);
  if (state.completed.has("findChildren")) SetFollowerCount(state, state.completed.has("liftShuan") ? 6 : 5);
  if (state.completed.has("liftShuan") && !state.completed.has("handShuanUp")) state.player.carrying = "shuan";
  return state;
}

export function ValidateCampaign() {
  const allIds = new Set();
  const errors = [];
  for (const chapter of Chapters) {
    const chapterIds = new Set(chapter.actions.map((action) => action.id));
    for (const action of chapter.actions) {
      if (allIds.has(action.id)) errors.push(`duplicate action id: ${action.id}`);
      allIds.add(action.id);
      for (const requiredId of action.requires || []) {
        if (!chapterIds.has(requiredId)) errors.push(`${chapter.id}:${action.id} requires missing ${requiredId}`);
      }
    }
    for (const group of chapter.objectiveGroups) {
      for (const id of group.ids) if (!chapterIds.has(id)) errors.push(`${chapter.id} objective references missing ${id}`);
    }
    for (const gate of chapter.gates || []) if (!chapterIds.has(gate.requires)) errors.push(`${chapter.id} gate requires missing ${gate.requires}`);
    if (chapter.exitX > chapter.width) errors.push(`${chapter.id} exit is outside the chapter`);
  }
  return { valid: errors.length === 0, errors, actionCount: allIds.size };
}
