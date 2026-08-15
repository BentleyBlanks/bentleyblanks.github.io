import {
  Collectibles,
  FindLocation,
  FindLocationAt,
  Ground,
  InteractionPoints,
  MovingHazards,
  Platforms,
  WorldBounds,
  WorldConfig,
  WorldData,
} from "./Data_World.mjs?v=20260815v";

const Epsilon = 1e-7;
const FixedStep = 1 / 60;

function ToNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function NormalizeMonth(month, fallback = 1) {
  const number = Math.floor(ToNumber(month, fallback));
  return Math.max(1, number);
}

function CloneIds(ids) {
  return Array.isArray(ids) ? [...new Set(ids.filter((id) => typeof id === "string"))] : [];
}

function IsIdInList(ids, id) {
  return ids.includes(id);
}

function GetPlayerPosition(state) {
  return {
    x: ToNumber(state?.x, ToNumber(state?.player?.x, WorldConfig.spawn.x)),
    y: ToNumber(state?.y, ToNumber(state?.player?.y, WorldConfig.spawn.y)),
  };
}

function GetHazardSnapshot(elapsed, disabledHazardIds = []) {
  const time = ToNumber(elapsed, 0);
  const disabled = new Set(disabledHazardIds);
  return MovingHazards.map((hazard) => {
    const offset = Math.sin(ToNumber(hazard.phase, 0) + time * ToNumber(hazard.speed, 0)) * ToNumber(hazard.amplitude, 0);
    const snapshot = {
      ...hazard,
      x: hazard.axis === "x" ? hazard.x + offset : hazard.x,
      y: hazard.axis === "y" ? hazard.y + offset : hazard.y,
      disabled: disabled.has(hazard.id),
    };
    return snapshot;
  });
}

function GetCollectibleSnapshot(collectedIds) {
  const collected = new Set(collectedIds);
  return Collectibles.map((item) => ({ ...item, collected: collected.has(item.id) }));
}

function MakePlayerSnapshot(state) {
  return {
    x: state.x,
    y: state.y,
    vx: state.vx,
    vy: state.vy,
    facing: state.facing,
    grounded: state.grounded,
    health: state.health,
    damageCooldown: state.damageCooldown,
  };
}

function UpdateCamera(state) {
  const viewportWidth = Math.min(WorldConfig.cameraViewportWidth, WorldConfig.width);
  const maximum = Math.max(0, WorldConfig.width - viewportWidth);
  const location = FindLocation(state.activeLocationId) || FindLocationAt(state.x);
  const target = Clamp(location?.startX || 0, 0, maximum);
  state.cameraTargetX = target;
  state.cameraX = target;
  state.cameraCenterX = location
    ? (location.startX + location.endX) / 2
    : target + viewportWidth / 2;
}

function AttachDerivedState(state) {
  state.hazards = GetHazardSnapshot(state.elapsed, state.disabledHazardIds);
  state.collectibles = GetCollectibleSnapshot(state.collectedIds);
  UpdateCamera(state);
  state.player = MakePlayerSnapshot(state);
  return state;
}

function BuildState(month) {
  const safeMonth = NormalizeMonth(month);
  const state = {
    version: 1,
    month: safeMonth,
    elapsed: 0,
    x: WorldConfig.spawn.x,
    y: WorldConfig.spawn.y,
    activeLocationId: WorldConfig.spawn.locationId,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: true,
    surfaceId: Ground.id,
    health: WorldConfig.maxHealth,
    maxHealth: WorldConfig.maxHealth,
    damageCooldown: 0,
    cameraX: 0,
    cameraTargetX: 0,
    paused: false,
    pauseHeld: false,
    jumpHeld: false,
    collectedIds: [],
    disabledHazardIds: [],
    worldWidth: WorldConfig.width,
    worldHeight: WorldConfig.height,
    world: WorldData,
  };
  return AttachDerivedState(state);
}

function CloneState(source) {
  const original = source && typeof source === "object" ? source : BuildState(1);
  const position = GetPlayerPosition(original);
  const state = {
    ...original,
    month: NormalizeMonth(original.month),
    elapsed: Math.max(0, ToNumber(original.elapsed, 0)),
    x: position.x,
    y: position.y,
    activeLocationId: FindLocation(original.activeLocationId)?.id || FindLocationAt(position.x)?.id || WorldConfig.spawn.locationId,
    vx: ToNumber(original.vx, 0),
    vy: ToNumber(original.vy, 0),
    facing: ToNumber(original.facing, 1) < 0 ? -1 : 1,
    grounded: Boolean(original.grounded),
    surfaceId: typeof original.surfaceId === "string" ? original.surfaceId : null,
    health: Clamp(ToNumber(original.health, WorldConfig.maxHealth), 0, ToNumber(original.maxHealth, WorldConfig.maxHealth)),
    maxHealth: Math.max(1, ToNumber(original.maxHealth, WorldConfig.maxHealth)),
    damageCooldown: Math.max(0, ToNumber(original.damageCooldown, 0)),
    cameraX: ToNumber(original.cameraX, 0),
    cameraTargetX: ToNumber(original.cameraTargetX, 0),
    paused: Boolean(original.paused),
    pauseHeld: Boolean(original.pauseHeld),
    jumpHeld: Boolean(original.jumpHeld),
    collectedIds: CloneIds(original.collectedIds),
    disabledHazardIds: CloneIds(original.disabledHazardIds),
  };
  return state;
}

function IsHorizontalOverlap(x, width, rectangle) {
  const halfWidth = width / 2;
  return x + halfWidth >= rectangle.x - Epsilon
    && x - halfWidth <= rectangle.x + rectangle.width + Epsilon;
}

function HasSupportAt(x, y) {
  if (Math.abs(y - Ground.top) <= Epsilon && IsHorizontalOverlap(x, WorldConfig.playerWidth, Ground)) {
    return Ground;
  }
  for (const platform of Platforms) {
    if (Math.abs(y - platform.top) <= Epsilon && IsHorizontalOverlap(x, WorldConfig.playerWidth, platform)) {
      return platform;
    }
  }
  return null;
}

function FindDownwardSurface(previousY, candidateY, x) {
  const surfaces = [Ground, ...Platforms]
    .filter((surface) => IsHorizontalOverlap(x, WorldConfig.playerWidth, surface))
    .filter((surface) => previousY >= surface.top - Epsilon && candidateY <= surface.top + Epsilon)
    .sort((left, right) => right.top - left.top);
  return surfaces[0] || null;
}

function FindUpwardSurface(previousY, candidateY, x) {
  const previousTop = previousY + WorldConfig.playerHeight;
  const candidateTop = candidateY + WorldConfig.playerHeight;
  const surfaces = Platforms
    .filter((surface) => IsHorizontalOverlap(x, WorldConfig.playerWidth, surface))
    .filter((surface) => {
      const underside = surface.top - surface.height;
      return previousTop <= underside + Epsilon && candidateTop >= underside - Epsilon;
    })
    .sort((left, right) => left.top - right.top);
  return surfaces[0] || null;
}

function IsCollectibleTouching(state, collectible) {
  const playerLeft = state.x - WorldConfig.playerWidth / 2;
  const playerRight = state.x + WorldConfig.playerWidth / 2;
  const playerBottom = state.y;
  const playerTop = state.y + WorldConfig.playerHeight;
  const radius = ToNumber(collectible.radius, WorldConfig.collectibleRadius);
  return collectible.x + radius >= playerLeft - Epsilon
    && collectible.x - radius <= playerRight + Epsilon
    && collectible.y + radius >= playerBottom - Epsilon
    && collectible.y - radius <= playerTop + Epsilon;
}

function IsHazardTouching(state, hazard) {
  const playerLeft = state.x - WorldConfig.playerWidth / 2;
  const playerRight = state.x + WorldConfig.playerWidth / 2;
  const playerBottom = state.y;
  const playerTop = state.y + WorldConfig.playerHeight;
  const hazardLeft = hazard.x - hazard.width / 2;
  const hazardRight = hazard.x + hazard.width / 2;
  const hazardBottom = hazard.y;
  const hazardTop = hazard.y + hazard.height;
  return hazardRight >= playerLeft - Epsilon
    && hazardLeft <= playerRight + Epsilon
    && hazardTop >= playerBottom - Epsilon
    && hazardBottom <= playerTop + Epsilon;
}

function RecordCollectibles(state, events) {
  for (const collectible of Collectibles) {
    if (IsIdInList(state.collectedIds, collectible.id) || !IsCollectibleTouching(state, collectible)) {
      continue;
    }
    state.collectedIds.push(collectible.id);
    events.push({
      type: "collectible",
      id: collectible.id,
      kind: collectible.kind,
      value: collectible.value,
    });
  }
}

function RecordHazardDamage(state, events) {
  if (state.damageCooldown > Epsilon || state.health <= Epsilon) {
    return;
  }
  for (const hazard of state.hazards) {
    if (hazard.disabled || !IsHazardTouching(state, hazard)) {
      continue;
    }
    const damage = Math.max(0, ToNumber(hazard.damage, WorldConfig.hazardDamage));
    state.health = Math.max(0, state.health - damage);
    state.damageCooldown = WorldConfig.hazardDamageCooldown;
    events.push({
      type: "hazardHit",
      id: hazard.id,
      hazardId: hazard.id,
      damage,
      health: state.health,
      damageCooldown: state.damageCooldown,
    });
    if (state.health <= Epsilon) {
      events.push({ type: "playerDown", id: hazard.id, health: state.health });
    }
    break;
  }
}

function ApplyDisableRequest(state, controls, events) {
  const requestedId = controls.disableHazardId || controls.disarmHazardId;
  if (typeof requestedId !== "string" || !MovingHazards.some((hazard) => hazard.id === requestedId)) {
    return;
  }
  if (IsIdInList(state.disabledHazardIds, requestedId)) {
    return;
  }
  state.disabledHazardIds.push(requestedId);
  events.push({ type: "hazardDisabled", id: requestedId });
}

function UpdatePausedState(state, controls, events) {
  const pausePressed = Boolean(controls.pause) && !state.pauseHeld;
  if (pausePressed) {
    state.paused = !state.paused;
    events.push({ type: "pauseChanged", id: state.paused ? "paused" : "resumed", paused: state.paused });
  }
  if (Object.prototype.hasOwnProperty.call(controls, "paused")) {
    const requestedPaused = Boolean(controls.paused);
    if (requestedPaused !== state.paused) {
      state.paused = requestedPaused;
      events.push({ type: "pauseChanged", id: state.paused ? "paused" : "resumed", paused: state.paused });
    }
  }
  state.pauseHeld = Boolean(controls.pause);
}

function ApplyPhysicsStep(state, controls, step, jumpPressed, events) {
  const moveAxis = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  const wasGrounded = state.grounded;
  if (state.grounded && !HasSupportAt(state.x, state.y)) {
    state.grounded = false;
    state.surfaceId = null;
  }

  state.vx = moveAxis * WorldConfig.moveSpeed;
  if (moveAxis !== 0) {
    state.facing = moveAxis < 0 ? -1 : 1;
  }

  if (jumpPressed && state.grounded) {
    state.vy = WorldConfig.jumpSpeed;
    state.grounded = false;
    state.surfaceId = null;
    events.push({ type: "jump", id: "player" });
  }

  const previousY = state.y;
  const previousVy = state.vy;
  const activeLocation = FindLocation(state.activeLocationId) || FindLocationAt(state.x);
  const roomMinimum = (activeLocation?.startX ?? WorldBounds.minX) + WorldConfig.playerWidth / 2;
  const roomMaximum = (activeLocation?.endX ?? WorldBounds.maxX) - WorldConfig.playerWidth / 2;
  const nextX = Clamp(
    state.x + state.vx * step,
    roomMinimum,
    roomMaximum,
  );
  // Walking past a platform edge should start a fall during this step rather
  // than leaving the player hovering until the following input frame.
  if (state.grounded && !HasSupportAt(nextX, state.y)) {
    state.grounded = false;
    state.surfaceId = null;
  }
  let nextY = state.y;
  let nextVy = state.vy;
  if (!state.grounded) {
    nextVy += WorldConfig.gravity * step;
    nextY += nextVy * step;
  }

  const downwardSurface = nextVy <= Epsilon ? FindDownwardSurface(previousY, nextY, nextX) : null;
  if (downwardSurface) {
    nextY = downwardSurface.top;
    nextVy = 0;
    state.grounded = true;
    state.surfaceId = downwardSurface.id;
    if (!wasGrounded) {
      events.push({ type: "landed", id: downwardSurface.id, surfaceId: downwardSurface.id });
    }
  } else {
    const upwardSurface = nextVy > Epsilon ? FindUpwardSurface(previousY, nextY, nextX) : null;
    if (upwardSurface) {
      nextY = upwardSurface.top - upwardSurface.height - WorldConfig.playerHeight;
      nextVy = 0;
      state.grounded = false;
      state.surfaceId = null;
    } else if (nextY <= Ground.top + Epsilon && previousY <= Ground.top + Epsilon) {
      nextY = Ground.top;
      nextVy = 0;
      state.grounded = true;
      state.surfaceId = Ground.id;
      if (!wasGrounded && previousVy < 0) {
        events.push({ type: "landed", id: Ground.id, surfaceId: Ground.id });
      }
    } else {
      state.grounded = false;
      state.surfaceId = null;
    }
  }

  state.x = nextX;
  state.y = nextY;
  state.vy = nextVy;
}

/**
 * Create a fresh month-scoped world state. The state is deliberately plain
 * data so it can be copied into another game's state machine or serialized.
 */
export function CreateWorldState(month = 1) {
  return BuildState(month);
}

/**
 * Reset all spatial progress for a new month without mutating the old state.
 */
export function ResetWorldMonth(currentState, month = null) {
  const currentMonth = NormalizeMonth(currentState?.month, 1);
  const nextMonth = month === null || month === undefined ? currentMonth + 1 : month;
  return BuildState(nextMonth);
}

/**
 * Move through a room exit to another named destination. Walking never calls
 * this function; only an explicit exit choice can change activeLocationId.
 */
export function TravelWorld(currentState, locationId) {
  const destination = FindLocation(locationId);
  if (!destination) {
    return { state: AttachDerivedState(CloneState(currentState)), ok: false, message: "这个目的地不存在。" };
  }
  const state = CloneState(currentState);
  state.activeLocationId = destination.id;
  state.x = Clamp(
    ToNumber(destination.entryX, (destination.startX + destination.endX) / 2),
    destination.startX + WorldConfig.playerWidth / 2,
    destination.endX - WorldConfig.playerWidth / 2,
  );
  state.y = WorldConfig.groundY;
  state.vx = 0;
  state.vy = 0;
  state.grounded = true;
  state.surfaceId = Ground.id;
  return { state: AttachDerivedState(state), ok: true, location: destination };
}

/**
 * Advance the world by delta seconds. Input is a small, renderer-independent
 * control object: { left, right, jump, pause }. A new state and event list are
 * returned on every call; the input state is never mutated.
 */
export function TickWorld(currentState, input = {}, delta = FixedStep) {
  const state = CloneState(currentState);
  const controls = input && typeof input === "object" ? input : {};
  const events = [];
  const safeDelta = Math.max(0, ToNumber(delta, FixedStep));

  UpdatePausedState(state, controls, events);
  ApplyDisableRequest(state, controls, events);
  state.hazards = GetHazardSnapshot(state.elapsed, state.disabledHazardIds);
  state.collectibles = GetCollectibleSnapshot(state.collectedIds);

  const jumpPressed = Boolean(controls.jump) && !state.jumpHeld;
  state.jumpHeld = Boolean(controls.jump);

  if (!state.paused) {
    const stepCount = Math.max(1, Math.ceil(safeDelta / FixedStep));
    const step = stepCount > 0 ? safeDelta / stepCount : 0;
    for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
      state.damageCooldown = Math.max(0, state.damageCooldown - step);
      ApplyPhysicsStep(state, controls, step, stepIndex === 0 && jumpPressed, events);
      state.elapsed += step;
      state.hazards = GetHazardSnapshot(state.elapsed, state.disabledHazardIds);
      RecordCollectibles(state, events);
      RecordHazardDamage(state, events);
    }
  }

  return {
    state: AttachDerivedState(state),
    events,
  };
}

/**
 * Return the closest interaction point when the player's feet are in range.
 */
export function NearestInteraction(state) {
  const position = GetPlayerPosition(state || {});
  const activeLocationId = FindLocation(state?.activeLocationId)?.id || FindLocationAt(position.x)?.id;
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const interaction of InteractionPoints) {
    if (interaction.locationId && interaction.locationId !== activeLocationId) continue;
    const distance = Math.hypot(position.x - interaction.x, position.y - interaction.y);
    const range = ToNumber(interaction.radius, WorldConfig.interactionRange);
    if (distance > range + Epsilon || distance >= nearestDistance) {
      continue;
    }
    nearest = interaction;
    nearestDistance = distance;
  }
  return nearest;
}
