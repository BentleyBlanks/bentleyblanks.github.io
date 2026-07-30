/**
 * Ashen Route 1942 gameplay simulation.
 *
 * This module deliberately has no DOM, WebAudio, Three.js, or browser globals.
 * Ground positions are always plain `{ x, z }` objects. Rendering, physics,
 * navigation, animation, and audio are adapters supplied by the host.
 */

export const GameplayVersion = 1;

export const EnemyStateIds = DeepFreeze({
  PATROL: "patrol",
  SUSPICIOUS: "suspicious",
  SEARCH: "search",
  ALERT: "alert",
  ENGAGE: "engage",
  LOST_TARGET: "lostTarget",
});

export const CompanionCommandIds = DeepFreeze({
  FOLLOW: "follow",
  STAY: "stay",
  ASSIST: "assist",
});

export const NoiseKindIds = DeepFreeze({
  FOOTSTEP: "footstep",
  SPRINT: "sprint",
  GUNSHOT: "gunshot",
  DRY_FIRE: "dryFire",
  BOTTLE_BREAK: "bottleBreak",
  TIN_CAN_IMPACT: "tinCanImpact",
  IMPACT: "impact",
  VOICE: "voice",
});

export const LureTypeIds = DeepFreeze({
  BOTTLE: "bottle",
  TIN_CAN: "tinCan",
});

export const MissionBeatKindIds = DeepFreeze({
  QUIET_EXPLORE: "quietExplore",
  COMPANION_STORY: "companionStory",
  RESOURCE_DECISION: "resourceDecision",
  STEALTH_TENSION: "stealthTension",
  LIMITED_COMBAT: "limitedCombat",
  ESCAPE: "escape",
  AFTERMATH: "aftermath",
});

export const GameplayEventIds = DeepFreeze({
  ENEMY_STATE_CHANGED: "enemyStateChanged",
  ENEMY_HEARD_NOISE: "enemyHeardNoise",
  ENEMY_ALERT_REQUESTED: "enemyAlertRequested",
  ENEMY_TARGET_SPOTTED: "enemyTargetSpotted",
  LURE_THROWN: "lureThrown",
  LURE_IMPACTED: "lureImpacted",
  WEAPON_FIRED: "weaponFired",
  WEAPON_EMPTY: "weaponEmpty",
  WEAPON_RELOADED: "weaponReloaded",
  ITEM_CRAFTED: "itemCrafted",
  BANDAGE_STARTED: "bandageStarted",
  BANDAGE_INTERRUPTED: "bandageInterrupted",
  BANDAGE_COMPLETED: "bandageCompleted",
  COMPANION_COMMAND_CHANGED: "companionCommandChanged",
  COMPANION_ASSIST_REQUESTED: "companionAssistRequested",
  MISSION_BEAT_CHANGED: "missionBeatChanged",
});

export const DesktopPerformanceProfile = DeepFreeze({
  profileId: "desktop",
  maxSimulatedEnemies: 20,
  visionRayBudgetPerFrame: 14,
  hearingListenerBudget: 24,
  nearAiFrameStride: 1,
  midAiFrameStride: 2,
  farAiFrameStride: 4,
  nearDistance: 18,
  farDistance: 42,
  maxNoiseEvents: 48,
  noiseLifetimeSeconds: 4.5,
  searchSampleCount: 7,
  companionRepathSeconds: 0.16,
  enableAcousticOcclusion: true,
  enablePeripheralVision: true,
});

export const CraftRecipes = DeepFreeze({
  bandage: {
    recipeId: "bandage",
    durationSeconds: 2.8,
    ingredients: { cloth: 2, alcohol: 1 },
    output: { category: "items", itemId: "bandage", amount: 1 },
  },
  noiseBundle: {
    recipeId: "noiseBundle",
    durationSeconds: 2.2,
    ingredients: { cloth: 1, scrap: 1 },
    consumeItems: { emptyCan: 1 },
    output: { category: "items", itemId: "tinCan", amount: 1 },
  },
});

export const DefaultGameplayConfig = DeepFreeze({
  configurationVersion: GameplayVersion,
  movement: {
    walkSpeed: 2.2,
    crouchSpeed: 1.3,
    sprintSpeed: 4.35,
    acceleration: 11,
    deceleration: 15,
    maxStamina: 100,
    minimumSprintStamina: 4,
    sprintDrainPerSecond: 24,
    recoveryPerSecond: 15,
    recoveryDelaySeconds: 1.1,
    exhaustedRecoveryThreshold: 28,
    footstepDistance: {
      standing: 1.55,
      crouched: 2.05,
      sprinting: 1.28,
    },
    footstepRadius: {
      standing: 5.6,
      crouched: 2.6,
      sprinting: 10.5,
    },
    surfaceNoiseMultiplier: {
      dirt: 0.82,
      grass: 0.68,
      mud: 0.72,
      stone: 1.18,
      wood: 1.28,
      rubble: 1.42,
      water: 1.5,
      default: 1,
    },
  },
  noise: {
    minimumAudibility: 0.1,
    defaultHearingThreshold: 0.12,
    distanceFalloffExponent: 1.35,
    minimumTransmission: 0.04,
    obstacleTransmission: 0.28,
    speedOfSound: 343,
    positionUncertaintyAtThreshold: 5.5,
  },
  enemy: {
    baseVisionRange: 19,
    fieldOfViewDegrees: 92,
    peripheralFieldOfViewDegrees: 148,
    peripheralDetectionMultiplier: 0.28,
    minimumVisionStrength: 0.035,
    proximityRevealRange: 2.4,
    proximityStrengthFloor: 0.34,
    visionGainPerSecond: 1.65,
    visionDecayPerSecond: 0.24,
    combatVisionDecayPerSecond: 0.08,
    crouchVisibilityMultiplier: 0.52,
    movingVisibilityMultiplier: 1.12,
    sprintVisibilityMultiplier: 1.34,
    darknessVisibilityFloor: 0.24,
    suspicionThreshold: 0.2,
    searchThreshold: 0.48,
    alertThreshold: 0.78,
    engageThreshold: 0.96,
    hearingSuspicionGain: 0.9,
    suspicionDecayPerSecond: 0.07,
    suspiciousDurationSeconds: 2.1,
    searchDurationSeconds: 11,
    searchPointReachDistance: 0.9,
    searchRadius: 6.5,
    alertMinimumSeconds: 0.55,
    alertMaximumSeconds: 2.6,
    loseSightSeconds: 1.25,
    lostTargetDurationSeconds: 6.5,
    fireCooldownMinimumSeconds: 1.25,
    fireCooldownMaximumSeconds: 2.35,
    patrolReachDistance: 0.75,
    alertBroadcastRadius: 18,
    allyAlertIntensity: 0.72,
    hearingThreshold: 0.12,
  },
  lure: {
    gravity: 9.8,
    bottleSpeed: 12,
    tinCanSpeed: 10.5,
    upwardSpeed: 5.8,
    bottleBreakSpeed: 3,
    bottleNoiseRadius: 18,
    tinCanNoiseRadius: 13.5,
    tinCanRestitution: 0.42,
    tinCanPlanarFriction: 0.66,
    tinCanMaximumBounces: 3,
    settleSpeed: 1.4,
    maximumLifetimeSeconds: 8,
  },
  weapon: {
    weaponId: "serviceRifle",
    magazineCapacity: 5,
    damage: 44,
    noiseRadius: 38,
    baseSpreadRadians: 0.014,
    movingSpreadMultiplier: 1.8,
    crouchSpreadMultiplier: 0.72,
  },
  bandage: {
    durationSeconds: 3.4,
    healAmount: 38,
    movementInterruptSpeed: 0.8,
  },
  companion: {
    preferredFollowDistance: 3.2,
    lateralFollowDistance: 2.8,
    followDeadZone: 0.95,
    catchUpDistance: 7.5,
    maximumSeparationDistance: 18,
    assistDistance: 2.1,
    safeEnemyDistance: 8,
    cameraCorridorHalfWidth: 2.45,
    cameraRearDangerDistance: 5.15,
    cameraSafeLateralDistance: 3.05,
    sprintFollowDistance: 3.8,
    lowHealthRatio: 0.35,
    assistCooldownSeconds: 8,
    coverShotCooldownSeconds: 5.5,
  },
  mission: {
    defaultTargetSeconds: 45,
    minimumBeatSeconds: 4,
    maximumBeatSeconds: 180,
    automaticAdvanceGraceMultiplier: 1.65,
  },
  performance: DesktopPerformanceProfile,
});

function DeepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nestedValue of Object.values(value)) {
    DeepFreeze(nestedValue);
  }
  return value;
}

function IsRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function MergeRecords(baseValue, overrideValue) {
  if (!IsRecord(baseValue)) {
    if (Array.isArray(overrideValue)) {
      return overrideValue.map((entry) => (IsRecord(entry) ? MergeRecords({}, entry) : entry));
    }
    return overrideValue;
  }
  const result = {};
  for (const [key, value] of Object.entries(baseValue)) {
    if (Array.isArray(value)) {
      result[key] = value.slice();
    } else if (IsRecord(value)) {
      result[key] = MergeRecords(value, {});
    } else {
      result[key] = value;
    }
  }
  if (!IsRecord(overrideValue)) {
    return result;
  }
  for (const [key, value] of Object.entries(overrideValue)) {
    if (IsRecord(value) && IsRecord(result[key])) {
      result[key] = MergeRecords(result[key], value);
    } else if (Array.isArray(value)) {
      result[key] = value.slice();
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function FiniteOr(value, fallbackValue = 0) {
  return Number.isFinite(value) ? value : fallbackValue;
}

function Clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, FiniteOr(value, minimum)));
}

function Clamp01(value) {
  return Clamp(value, 0, 1);
}

function ClonePosition(position, fallbackPosition = { x: 0, z: 0 }) {
  return {
    x: FiniteOr(position?.x, fallbackPosition.x),
    z: FiniteOr(position?.z, fallbackPosition.z),
  };
}

function AddPositions(firstPosition, secondPosition) {
  return {
    x: firstPosition.x + secondPosition.x,
    z: firstPosition.z + secondPosition.z,
  };
}

function ScalePosition(position, scale) {
  return { x: position.x * scale, z: position.z * scale };
}

function SubtractPositions(firstPosition, secondPosition) {
  return {
    x: firstPosition.x - secondPosition.x,
    z: firstPosition.z - secondPosition.z,
  };
}

function PositionLength(position) {
  return Math.hypot(position.x, position.z);
}

function NormalizePosition(position, fallbackPosition = { x: 0, z: 1 }) {
  const safePosition = ClonePosition(position, fallbackPosition);
  const length = PositionLength(safePosition);
  if (length <= 1e-8) {
    return ClonePosition(fallbackPosition);
  }
  return { x: safePosition.x / length, z: safePosition.z / length };
}

function DistanceSquared(firstPosition, secondPosition) {
  const deltaX = firstPosition.x - secondPosition.x;
  const deltaZ = firstPosition.z - secondPosition.z;
  return deltaX * deltaX + deltaZ * deltaZ;
}

function Distance(firstPosition, secondPosition) {
  return Math.sqrt(DistanceSquared(firstPosition, secondPosition));
}

function Dot(firstPosition, secondPosition) {
  return firstPosition.x * secondPosition.x + firstPosition.z * secondPosition.z;
}

function MoveTowards(currentValue, targetValue, maximumDelta) {
  if (Math.abs(targetValue - currentValue) <= maximumDelta) {
    return targetValue;
  }
  return currentValue + Math.sign(targetValue - currentValue) * maximumDelta;
}

function HashString(value) {
  let hash = 2166136261;
  const stringValue = String(value ?? "");
  for (let index = 0; index < stringValue.length; index += 1) {
    hash ^= stringValue.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function ResolveGameplayConfig(config) {
  if (!config) {
    return DefaultGameplayConfig;
  }
  if (config.configurationVersion === GameplayVersion && config.movement && config.enemy) {
    return config;
  }
  return CreateGameplayConfig(config);
}

function ResolveRandom(randomDependency, fallbackSeed = 1942) {
  if (typeof randomDependency === "function") {
    return CreateRandomAdapter(randomDependency);
  }
  if (randomDependency && typeof randomDependency.Next === "function") {
    if (typeof randomDependency.Range === "function"
      && typeof randomDependency.Integer === "function"
      && typeof randomDependency.Pick === "function") {
      return randomDependency;
    }
    return CreateRandomAdapter(
      () => randomDependency.Next(),
      randomDependency,
    );
  }
  return CreateSeededRandom(fallbackSeed);
}

function CreateRandomAdapter(nextCallback, stateSource = null) {
  const adapter = {
    Next() {
      return Clamp(nextCallback(), 0, 1 - Number.EPSILON);
    },
    Range(minimum, maximum) {
      return minimum + (maximum - minimum) * adapter.Next();
    },
    Integer(minimum, maximumInclusive) {
      const low = Math.ceil(minimum);
      const high = Math.floor(maximumInclusive);
      return low + Math.floor(adapter.Next() * (high - low + 1));
    },
    Pick(values) {
      if (!Array.isArray(values) || values.length === 0) {
        return undefined;
      }
      return values[Math.floor(adapter.Next() * values.length)];
    },
  };
  if (typeof stateSource?.GetState === "function") {
    adapter.GetState = () => stateSource.GetState();
  }
  if (typeof stateSource?.SetState === "function") {
    adapter.SetState = (nextState) => stateSource.SetState(nextState);
  }
  return Object.freeze(adapter);
}

function RandomRange(random, minimum, maximum) {
  return minimum + (maximum - minimum) * random.Next();
}

function ForwardFromYaw(yawRadians) {
  return {
    x: Math.sin(FiniteOr(yawRadians, 0)),
    z: Math.cos(FiniteOr(yawRadians, 0)),
  };
}

function NormalizeDelta(deltaSeconds, maximumDeltaSeconds = 0.25) {
  return Clamp(deltaSeconds, 0, maximumDeltaSeconds);
}

export function CreateSeededRandom(seed = 1942) {
  let state = (Number(seed) >>> 0) || 0x6d2b79f5;
  return Object.freeze({
    Next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
    Range(minimum, maximum) {
      return RandomRange(this, minimum, maximum);
    },
    Integer(minimum, maximumInclusive) {
      const low = Math.ceil(minimum);
      const high = Math.floor(maximumInclusive);
      return low + Math.floor(this.Next() * (high - low + 1));
    },
    Pick(values) {
      if (!Array.isArray(values) || values.length === 0) {
        return undefined;
      }
      return values[Math.floor(this.Next() * values.length)];
    },
    GetState() {
      return state >>> 0;
    },
    SetState(nextState) {
      state = (Number(nextState) >>> 0) || 0x6d2b79f5;
    },
  });
}

export function CreateGameplayConfig(overrides = {}) {
  const mergedConfig = MergeRecords(DefaultGameplayConfig, overrides);
  mergedConfig.configurationVersion = GameplayVersion;
  mergedConfig.performance.profileId = DesktopPerformanceProfile.profileId;
  return DeepFreeze(mergedConfig);
}

export function CreateStaminaState(options = {}, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const maximum = Math.max(1, FiniteOr(options.maximum, gameplayConfig.movement.maxStamina));
  return {
    current: Clamp(FiniteOr(options.current, maximum), 0, maximum),
    maximum,
    recoveryDelayRemaining: Math.max(0, FiniteOr(options.recoveryDelayRemaining, 0)),
    exhausted: Boolean(options.exhausted),
  };
}

export function UpdateStamina(staminaState, movementInput = {}, deltaSeconds = 0, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const movementConfig = gameplayConfig.movement;
  const delta = NormalizeDelta(deltaSeconds);
  const nextState = CreateStaminaState(staminaState, gameplayConfig);
  const isMoving = Boolean(movementInput.isMoving);
  const isCrouched = Boolean(movementInput.isCrouched);
  const isGrounded = movementInput.isGrounded !== false;
  const wantsSprint = Boolean(movementInput.wantsSprint);
  const canSprint = wantsSprint
    && isMoving
    && isGrounded
    && !isCrouched
    && !nextState.exhausted
    && nextState.current >= movementConfig.minimumSprintStamina;

  if (canSprint) {
    nextState.current = Math.max(0, nextState.current - movementConfig.sprintDrainPerSecond * delta);
    nextState.recoveryDelayRemaining = movementConfig.recoveryDelaySeconds;
    if (nextState.current <= 0) {
      nextState.exhausted = true;
    }
  } else {
    nextState.recoveryDelayRemaining = Math.max(0, nextState.recoveryDelayRemaining - delta);
    if (nextState.recoveryDelayRemaining <= 0) {
      nextState.current = Math.min(
        nextState.maximum,
        nextState.current + movementConfig.recoveryPerSecond * delta,
      );
    }
    if (nextState.exhausted && nextState.current >= movementConfig.exhaustedRecoveryThreshold) {
      nextState.exhausted = false;
    }
  }

  return {
    ...nextState,
    isSprinting: canSprint,
    normalized: nextState.current / nextState.maximum,
  };
}

export function CreateMovementState(options = {}, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  return {
    velocity: ClonePosition(options.velocity),
    stamina: CreateStaminaState(options.stamina, gameplayConfig),
    stanceId: options.stanceId === "crouched" ? "crouched" : "standing",
    footstepTravel: Math.max(0, FiniteOr(options.footstepTravel, 0)),
    stepCount: Math.max(0, Math.floor(FiniteOr(options.stepCount, 0))),
    distanceTravelled: Math.max(0, FiniteOr(options.distanceTravelled, 0)),
  };
}

export function UpdateMovement(movementState, movementInput = {}, deltaSeconds = 0, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const movementConfig = gameplayConfig.movement;
  const delta = NormalizeDelta(deltaSeconds);
  const currentState = CreateMovementState(movementState, gameplayConfig);
  const localMove = {
    x: FiniteOr(movementInput.move?.x, FiniteOr(movementInput.moveX, 0)),
    z: FiniteOr(movementInput.move?.z, FiniteOr(movementInput.moveZ, 0)),
  };
  const inputMagnitude = Math.min(1, PositionLength(localMove));
  const normalizedLocalMove = inputMagnitude > 0 ? NormalizePosition(localMove) : { x: 0, z: 0 };
  const forward = ForwardFromYaw(movementInput.yawRadians);
  const right = { x: forward.z, z: -forward.x };
  const worldDirection = NormalizePosition(
    AddPositions(ScalePosition(right, normalizedLocalMove.x), ScalePosition(forward, normalizedLocalMove.z)),
    { x: 0, z: 0 },
  );
  const isMoving = inputMagnitude > 0.01;
  const isCrouched = Boolean(movementInput.crouch);
  const stamina = UpdateStamina(currentState.stamina, {
    isMoving,
    isCrouched,
    isGrounded: movementInput.grounded !== false,
    wantsSprint: movementInput.sprint,
  }, delta, gameplayConfig);
  const stanceId = isCrouched ? "crouched" : "standing";
  let speed = isCrouched ? movementConfig.crouchSpeed : movementConfig.walkSpeed;
  if (stamina.isSprinting) {
    speed = movementConfig.sprintSpeed;
  }
  speed *= Clamp(FiniteOr(movementInput.speedMultiplier, 1), 0, 3);
  const targetVelocity = ScalePosition(worldDirection, speed * inputMagnitude);
  const slowing = PositionLength(targetVelocity) < PositionLength(currentState.velocity);
  const acceleration = slowing ? movementConfig.deceleration : movementConfig.acceleration;
  const velocity = {
    x: MoveTowards(currentState.velocity.x, targetVelocity.x, acceleration * delta),
    z: MoveTowards(currentState.velocity.z, targetVelocity.z, acceleration * delta),
  };
  const displacement = ScalePosition(velocity, delta);
  const travelled = movementInput.grounded === false ? 0 : PositionLength(displacement);
  let footstepTravel = currentState.footstepTravel + travelled;
  let stepCount = currentState.stepCount;
  const cadenceKey = stamina.isSprinting ? "sprinting" : (isCrouched ? "crouched" : "standing");
  const stepDistance = movementConfig.footstepDistance[cadenceKey];
  const surfaceId = String(movementInput.surfaceId ?? "default");
  const surfaceMultiplier = movementConfig.surfaceNoiseMultiplier[surfaceId]
    ?? movementConfig.surfaceNoiseMultiplier.default;
  const noiseEvents = [];
  let generatedSteps = 0;
  while (isMoving && footstepTravel >= stepDistance && generatedSteps < 3) {
    footstepTravel -= stepDistance;
    stepCount += 1;
    generatedSteps += 1;
    noiseEvents.push(EmitNoise({
      eventId: `${movementInput.actorId ?? "player"}Footstep${stepCount}`,
      sourceId: movementInput.actorId ?? "player",
      kindId: stamina.isSprinting ? NoiseKindIds.SPRINT : NoiseKindIds.FOOTSTEP,
      position: movementInput.position,
      radius: movementConfig.footstepRadius[cadenceKey] * surfaceMultiplier,
      loudness: Clamp01(0.58 + surfaceMultiplier * 0.28),
      timestamp: movementInput.timeSeconds,
      tags: [surfaceId, stanceId],
    }, movementInput.timeSeconds, gameplayConfig));
  }

  return {
    state: {
      velocity,
      stamina: {
        current: stamina.current,
        maximum: stamina.maximum,
        recoveryDelayRemaining: stamina.recoveryDelayRemaining,
        exhausted: stamina.exhausted,
      },
      stanceId,
      footstepTravel,
      stepCount,
      distanceTravelled: currentState.distanceTravelled + travelled,
    },
    desiredVelocity: velocity,
    desiredDisplacement: displacement,
    speed: PositionLength(velocity),
    isSprinting: stamina.isSprinting,
    visibilityMultiplier: stamina.isSprinting
      ? gameplayConfig.enemy.sprintVisibilityMultiplier
      : (isCrouched ? gameplayConfig.enemy.crouchVisibilityMultiplier : 1),
    noiseEvents,
  };
}

export function EmitNoise(options = {}, currentTimeSeconds = 0, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const timestamp = FiniteOr(
    options.timestamp,
    FiniteOr(options.createdAt, FiniteOr(currentTimeSeconds, 0)),
  );
  const sourceId = String(options.sourceId ?? "world");
  const kindId = String(options.kindId ?? options.kind ?? NoiseKindIds.IMPACT);
  const eventId = String(options.eventId ?? options.noiseId
    ?? `${sourceId}${kindId}${Math.round(timestamp * 1000)}`);
  return {
    eventId,
    sourceId,
    kindId,
    position: ClonePosition(options.position),
    radius: Math.max(0, FiniteOr(options.radius, 6)),
    loudness: Clamp01(FiniteOr(options.loudness, 1)),
    timestamp,
    durationSeconds: Math.max(0.05, FiniteOr(options.durationSeconds, 0.25)),
    environmentMultiplier: Clamp(FiniteOr(options.environmentMultiplier, 1), 0, 3),
    tags: Array.isArray(options.tags) ? options.tags.map(String) : [],
    expiresAt: FiniteOr(options.expiresAt, timestamp + Math.max(
      FiniteOr(options.durationSeconds, 0.25),
      gameplayConfig.performance.noiseLifetimeSeconds,
    )),
  };
}

export function PruneNoises(noises = [], currentTimeSeconds = 0, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const timeSeconds = FiniteOr(currentTimeSeconds, 0);
  const newestById = new Map();
  for (const noise of Array.isArray(noises) ? noises : []) {
    if (!noise || FiniteOr(noise.expiresAt, noise.timestamp + gameplayConfig.performance.noiseLifetimeSeconds) < timeSeconds) {
      continue;
    }
    const normalizedNoise = EmitNoise(noise, noise.timestamp, gameplayConfig);
    const existingNoise = newestById.get(normalizedNoise.eventId);
    if (!existingNoise || normalizedNoise.timestamp >= existingNoise.timestamp) {
      newestById.set(normalizedNoise.eventId, normalizedNoise);
    }
  }
  return [...newestById.values()]
    .sort((firstNoise, secondNoise) => secondNoise.timestamp - firstNoise.timestamp)
    .slice(0, gameplayConfig.performance.maxNoiseEvents);
}

function SegmentIntersectsCircle(startPosition, endPosition, centerPosition, radius) {
  const segment = SubtractPositions(endPosition, startPosition);
  const toCenter = SubtractPositions(centerPosition, startPosition);
  const segmentLengthSquared = Dot(segment, segment);
  if (segmentLengthSquared <= 1e-8) {
    return DistanceSquared(startPosition, centerPosition) <= radius * radius;
  }
  const projection = Clamp(Dot(toCenter, segment) / segmentLengthSquared, 0, 1);
  const closestPosition = AddPositions(startPosition, ScalePosition(segment, projection));
  return DistanceSquared(closestPosition, centerPosition) <= radius * radius;
}

function SegmentIntersectsBox(startPosition, endPosition, obstacle) {
  const minimumX = FiniteOr(obstacle.minimumX, FiniteOr(obstacle.minX, -Infinity));
  const maximumX = FiniteOr(obstacle.maximumX, FiniteOr(obstacle.maxX, Infinity));
  const minimumZ = FiniteOr(obstacle.minimumZ, FiniteOr(obstacle.minZ, -Infinity));
  const maximumZ = FiniteOr(obstacle.maximumZ, FiniteOr(obstacle.maxZ, Infinity));
  const delta = SubtractPositions(endPosition, startPosition);
  let enter = 0;
  let exit = 1;
  for (const axis of ["x", "z"]) {
    const minimum = axis === "x" ? minimumX : minimumZ;
    const maximum = axis === "x" ? maximumX : maximumZ;
    if (Math.abs(delta[axis]) <= 1e-8) {
      if (startPosition[axis] < minimum || startPosition[axis] > maximum) {
        return false;
      }
      continue;
    }
    const inverseDelta = 1 / delta[axis];
    let firstTime = (minimum - startPosition[axis]) * inverseDelta;
    let secondTime = (maximum - startPosition[axis]) * inverseDelta;
    if (firstTime > secondTime) {
      [firstTime, secondTime] = [secondTime, firstTime];
    }
    enter = Math.max(enter, firstTime);
    exit = Math.min(exit, secondTime);
    if (enter > exit) {
      return false;
    }
  }
  return exit >= 0 && enter <= 1;
}

function ObstacleIntersectsSegment(obstacle, startPosition, endPosition) {
  if (!obstacle || obstacle.enabled === false) {
    return false;
  }
  if (typeof obstacle.IntersectsSegment === "function") {
    return Boolean(obstacle.IntersectsSegment(startPosition, endPosition));
  }
  const radius = FiniteOr(obstacle.radius, FiniteOr(obstacle.collisionRadius, -1));
  if (radius >= 0) {
    return SegmentIntersectsCircle(
      startPosition,
      endPosition,
      ClonePosition(obstacle.position ?? obstacle.center ?? obstacle),
      radius,
    );
  }
  const hasBounds = [obstacle.minimumX, obstacle.minX, obstacle.maximumX, obstacle.maxX]
    .some(Number.isFinite)
    && [obstacle.minimumZ, obstacle.minZ, obstacle.maximumZ, obstacle.maxZ].some(Number.isFinite);
  return hasBounds ? SegmentIntersectsBox(startPosition, endPosition, obstacle) : false;
}

function NormalizeTransmission(queryResult, visibleDefault = 1) {
  if (typeof queryResult === "boolean") {
    return queryResult ? 1 : 0;
  }
  if (Number.isFinite(queryResult)) {
    return Clamp01(queryResult);
  }
  if (IsRecord(queryResult)) {
    if (Number.isFinite(queryResult.transmission)) {
      return Clamp01(queryResult.transmission);
    }
    if (typeof queryResult.visible === "boolean") {
      return queryResult.visible ? 1 : 0;
    }
    if (typeof queryResult.blocked === "boolean") {
      return queryResult.blocked ? 0 : 1;
    }
  }
  return Clamp01(visibleDefault);
}

function CalculateObstacleTransmission(startPosition, endPosition, obstacles, queryKind, config) {
  let transmission = 1;
  for (const obstacle of Array.isArray(obstacles) ? obstacles : []) {
    if (!ObstacleIntersectsSegment(obstacle, startPosition, endPosition)) {
      continue;
    }
    if (queryKind === "vision") {
      if (obstacle.blocksVision !== false) {
        transmission *= Clamp01(FiniteOr(obstacle.visionTransmission, 0));
      }
    } else {
      transmission *= Clamp01(FiniteOr(
        obstacle.acousticTransmission,
        config.noise.obstacleTransmission,
      ));
    }
    if (transmission <= config.noise.minimumTransmission) {
      return 0;
    }
  }
  return Clamp01(transmission);
}

function ResolveAcousticTransmission(listener, noise, context, config) {
  const query = context?.QueryAcousticTransmission ?? context?.queryAcousticTransmission;
  if (typeof query === "function") {
    return NormalizeTransmission(query(noise.position, listener.position, noise, listener), 1);
  }
  if (!config.performance.enableAcousticOcclusion) {
    return 1;
  }
  return CalculateObstacleTransmission(noise.position, listener.position, context?.obstacles, "acoustic", config);
}

function ResolveVisionTransmission(observer, target, context, config) {
  const query = context?.QueryLineOfSight ?? context?.queryLineOfSight;
  if (typeof query === "function") {
    return NormalizeTransmission(query(observer.position, target.position, observer, target), 1);
  }
  return CalculateObstacleTransmission(observer.position, target.position, context?.obstacles, "vision", config);
}

export function EvaluateHearing(listener, noise, context = {}, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const listenerPosition = ClonePosition(listener?.position);
  const normalizedNoise = EmitNoise(noise, noise?.timestamp, gameplayConfig);
  const distance = Distance(listenerPosition, normalizedNoise.position);
  const hearingMultiplier = Clamp(FiniteOr(listener?.hearingMultiplier, 1), 0, 4);
  const effectiveRadius = normalizedNoise.radius
    * normalizedNoise.loudness
    * normalizedNoise.environmentMultiplier
    * hearingMultiplier;
  if (effectiveRadius <= 0 || distance > effectiveRadius) {
    return {
      heard: false,
      listenerId: listener?.enemyId ?? listener?.id ?? null,
      noise: normalizedNoise,
      distance,
      effectiveRadius,
      transmission: 0,
      audibility: 0,
      arrivalDelaySeconds: distance / gameplayConfig.noise.speedOfSound,
      positionUncertainty: gameplayConfig.noise.positionUncertaintyAtThreshold,
    };
  }
  const transmission = ResolveAcousticTransmission(listener, normalizedNoise, context, gameplayConfig);
  const distanceRatio = Clamp01(distance / Math.max(effectiveRadius, 1e-6));
  const distanceFalloff = Math.pow(1 - distanceRatio, gameplayConfig.noise.distanceFalloffExponent);
  const audibility = Clamp01(normalizedNoise.loudness * distanceFalloff * transmission);
  const threshold = Clamp01(FiniteOr(
    listener?.hearingThreshold,
    gameplayConfig.enemy.hearingThreshold ?? gameplayConfig.noise.defaultHearingThreshold,
  ));
  const heard = audibility >= Math.max(threshold, gameplayConfig.noise.minimumAudibility);
  return {
    heard,
    listenerId: listener?.enemyId ?? listener?.id ?? null,
    noise: normalizedNoise,
    distance,
    effectiveRadius,
    transmission,
    audibility,
    arrivalDelaySeconds: distance / gameplayConfig.noise.speedOfSound,
    positionUncertainty: (1 - audibility) * gameplayConfig.noise.positionUncertaintyAtThreshold,
  };
}

export function PropagateNoise(noise, listeners = [], context = {}, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const normalizedNoise = EmitNoise(noise, noise?.timestamp, gameplayConfig);
  const sortedListeners = (Array.isArray(listeners) ? listeners : [])
    .map((listener, sourceIndex) => ({
      listener,
      sourceIndex,
      distanceSquared: DistanceSquared(ClonePosition(listener?.position), normalizedNoise.position),
    }))
    .sort((firstEntry, secondEntry) => {
      const firstPriority = firstEntry.listener?.stateId === EnemyStateIds.ENGAGE ? -1 : 0;
      const secondPriority = secondEntry.listener?.stateId === EnemyStateIds.ENGAGE ? -1 : 0;
      return firstPriority - secondPriority
        || firstEntry.distanceSquared - secondEntry.distanceSquared
        || firstEntry.sourceIndex - secondEntry.sourceIndex;
    });
  const budget = Math.max(1, Math.floor(FiniteOr(
    context.hearingListenerBudget,
    gameplayConfig.performance.hearingListenerBudget,
  )));
  const evaluatedEntries = sortedListeners.slice(0, budget);
  const results = evaluatedEntries.map(({ listener }) => EvaluateHearing(
    listener,
    normalizedNoise,
    context,
    gameplayConfig,
  ));
  return {
    noise: normalizedNoise,
    results,
    heard: results.filter((result) => result.heard),
    deferredListenerIds: sortedListeners.slice(budget).map(({ listener }) => (
      listener?.enemyId ?? listener?.id ?? null
    )),
  };
}

export function EvaluateVision(observer, target, context = {}, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const enemyConfig = gameplayConfig.enemy;
  const observerPosition = ClonePosition(observer?.position);
  const targetPosition = ClonePosition(target?.position);
  const toTarget = SubtractPositions(targetPosition, observerPosition);
  const distance = PositionLength(toTarget);
  const direction = NormalizePosition(toTarget);
  const forward = NormalizePosition(
    observer?.forward ?? ForwardFromYaw(observer?.yawRadians),
    { x: 0, z: 1 },
  );
  const dot = Clamp(Dot(forward, direction), -1, 1);
  const angleDegrees = Math.acos(dot) * 180 / Math.PI;
  const coreHalfAngle = FiniteOr(observer?.fieldOfViewDegrees, enemyConfig.fieldOfViewDegrees) * 0.5;
  const peripheralHalfAngle = gameplayConfig.performance.enablePeripheralVision === false
    ? coreHalfAngle
    : FiniteOr(observer?.peripheralFieldOfViewDegrees, enemyConfig.peripheralFieldOfViewDegrees) * 0.5;
  const environmentVisibility = Clamp(FiniteOr(context.visibilityMultiplier, 1), 0.05, 2);
  const visionRange = Math.max(0.1, FiniteOr(observer?.visionRange, enemyConfig.baseVisionRange))
    * Clamp(FiniteOr(observer?.visionMultiplier, 1), 0.1, 3)
    * environmentVisibility;
  const insideAngle = angleDegrees <= peripheralHalfAngle;
  const insideRange = distance <= visionRange;
  if (!insideAngle || !insideRange || target?.hidden === true || target?.alive === false) {
    return {
      visible: false,
      distance,
      visionRange,
      angleDegrees,
      transmission: 0,
      detectionStrength: 0,
      awarenessPerSecond: 0,
    };
  }
  const transmission = ResolveVisionTransmission(observer, target, context, gameplayConfig);
  const illumination = Clamp01(FiniteOr(target?.illumination, 0.65));
  const darknessMultiplier = enemyConfig.darknessVisibilityFloor
    + (1 - enemyConfig.darknessVisibilityFloor) * illumination;
  let targetVisibility = Clamp(FiniteOr(target?.visibilityMultiplier, 1), 0.02, 3);
  if (target?.isCrouched ?? target?.crouched) {
    targetVisibility *= enemyConfig.crouchVisibilityMultiplier;
  }
  const movementSpeed = Math.max(0, FiniteOr(target?.speed, PositionLength(target?.velocity ?? { x: 0, z: 0 })));
  if (target?.isSprinting ?? target?.sprinting) {
    targetVisibility *= enemyConfig.sprintVisibilityMultiplier;
  } else if (movementSpeed > 0.35) {
    targetVisibility *= enemyConfig.movingVisibilityMultiplier;
  }
  targetVisibility *= 1 - Clamp01(FiniteOr(target?.concealment, 0)) * 0.86;
  const distanceFactor = Math.pow(1 - Clamp01(distance / visionRange), 0.72);
  const angleFactor = angleDegrees <= coreHalfAngle
    ? 1 - 0.3 * Clamp01(angleDegrees / Math.max(coreHalfAngle, 1e-6))
    : enemyConfig.peripheralDetectionMultiplier;
  const exposureStrength = Clamp01(
    distanceFactor * angleFactor * darknessMultiplier * targetVisibility * transmission,
  );
  const proximityProgress = distance <= enemyConfig.proximityRevealRange
    ? 1 - Clamp01(distance / Math.max(enemyConfig.proximityRevealRange, 1e-6))
    : 0;
  const proximityStrength = proximityProgress > 0
    ? transmission * (
      enemyConfig.minimumVisionStrength
      + (enemyConfig.proximityStrengthFloor - enemyConfig.minimumVisionStrength) * proximityProgress
    )
    : 0;
  const detectionStrength = Clamp01(Math.max(exposureStrength, proximityStrength));
  const visible = transmission > gameplayConfig.noise.minimumTransmission
    && detectionStrength >= enemyConfig.minimumVisionStrength;
  return {
    visible,
    distance,
    visionRange,
    angleDegrees,
    transmission,
    detectionStrength,
    awarenessPerSecond: visible ? detectionStrength * enemyConfig.visionGainPerSecond : 0,
  };
}

function ClonePointArray(points) {
  return (Array.isArray(points) ? points : []).map((point) => ClonePosition(point));
}

export function CreateEnemyState(options = {}, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const stateIds = new Set(Object.values(EnemyStateIds));
  const requestedStateId = options.stateId ?? options.state;
  const stateId = stateIds.has(requestedStateId) ? requestedStateId : EnemyStateIds.PATROL;
  const health = Math.max(0, FiniteOr(options.health, 100));
  const enemyState = {
    ...options,
    enemyId: String(options.enemyId ?? options.id ?? "enemy"),
    stateId,
    stateVersion: Math.max(0, Math.floor(FiniteOr(options.stateVersion, 0))),
    stateElapsedSeconds: Math.max(0, FiniteOr(
      options.stateElapsedSeconds,
      FiniteOr(options.stateTime, 0),
    )),
    lastAiUpdateTimeSeconds: Number.isFinite(options.lastAiUpdateTimeSeconds)
      ? options.lastAiUpdateTimeSeconds
      : null,
    position: ClonePosition(options.position),
    forward: NormalizePosition(options.forward ?? ForwardFromYaw(options.yawRadians)),
    visionRange: Math.max(0.1, FiniteOr(options.visionRange, gameplayConfig.enemy.baseVisionRange)),
    visionMultiplier: Clamp(FiniteOr(options.visionMultiplier, 1), 0.1, 3),
    hearingMultiplier: Clamp(FiniteOr(options.hearingMultiplier, 1), 0, 4),
    hearingThreshold: Clamp01(FiniteOr(options.hearingThreshold, gameplayConfig.enemy.hearingThreshold)),
    awareness: Clamp01(FiniteOr(options.awareness, FiniteOr(options.suspicion, 0))),
    suspicion: Clamp01(FiniteOr(options.suspicion, 0)),
    patrolPoints: ClonePointArray(options.patrolPoints ?? options.patrolRoute),
    patrolIndex: Math.max(0, Math.floor(FiniteOr(options.patrolIndex, 0))),
    searchAnchors: ClonePointArray(options.searchAnchors),
    searchTargetPosition: options.searchTargetPosition ? ClonePosition(options.searchTargetPosition) : null,
    searchStep: Math.max(0, Math.floor(FiniteOr(options.searchStep, 0))),
    investigationPosition: options.investigationPosition || options.investigateTarget
      ? ClonePosition(options.investigationPosition ?? options.investigateTarget)
      : null,
    lastKnownTargetPosition: options.lastKnownTargetPosition || options.lastKnown
      ? ClonePosition(options.lastKnownTargetPosition ?? options.lastKnown)
      : null,
    lostSightSeconds: Math.max(0, FiniteOr(options.lostSightSeconds, 0)),
    shotCooldownSeconds: Math.max(0, FiniteOr(
      options.shotCooldownSeconds,
      FiniteOr(options.fireCooldown, 0),
    )),
    recentNoiseIds: (Array.isArray(options.recentNoiseIds) ? options.recentNoiseIds : []).map(String).slice(-12),
    hasEngaged: Boolean(options.hasEngaged),
    health,
    alive: options.alive !== false && options.active !== false && health > 0,
    roleId: String(options.roleId ?? "rifleman"),
  };
  return SynchronizeEnemyAliases(enemyState);
}

function SynchronizeEnemyAliases(enemyState) {
  enemyState.state = enemyState.stateId;
  enemyState.stateTime = enemyState.stateElapsedSeconds;
  enemyState.lastKnown = enemyState.lastKnownTargetPosition
    ? ClonePosition(enemyState.lastKnownTargetPosition)
    : null;
  enemyState.investigateTarget = enemyState.investigationPosition
    ? ClonePosition(enemyState.investigationPosition)
    : null;
  enemyState.fireCooldown = enemyState.shotCooldownSeconds;
  enemyState.active = enemyState.alive;
  return enemyState;
}

function TransitionEnemyState(enemyState, nextStateId, reasonId, events, context) {
  if (enemyState.stateId === nextStateId) {
    return false;
  }
  const previousStateId = enemyState.stateId;
  enemyState.stateId = nextStateId;
  enemyState.stateVersion += 1;
  enemyState.stateElapsedSeconds = 0;
  if (nextStateId !== EnemyStateIds.ENGAGE) {
    enemyState.lostSightSeconds = 0;
  }
  if (nextStateId === EnemyStateIds.SEARCH) {
    enemyState.searchTargetPosition = null;
  }
  if (nextStateId === EnemyStateIds.PATROL) {
    enemyState.awareness = Math.min(enemyState.awareness, 0.15);
    enemyState.suspicion = Math.min(enemyState.suspicion, 0.12);
    enemyState.investigationPosition = null;
    enemyState.searchTargetPosition = null;
  }
  if (nextStateId === EnemyStateIds.ENGAGE) {
    enemyState.hasEngaged = true;
  }
  events.push({
    eventId: GameplayEventIds.ENEMY_STATE_CHANGED,
    enemyId: enemyState.enemyId,
    previousStateId,
    stateId: nextStateId,
    reasonId,
    position: ClonePosition(enemyState.position),
    timestamp: FiniteOr(context?.timeSeconds, 0),
  });
  if (nextStateId === EnemyStateIds.ALERT) {
    events.push({
      eventId: GameplayEventIds.ENEMY_ALERT_REQUESTED,
      enemyId: enemyState.enemyId,
      position: ClonePosition(enemyState.position),
      targetPosition: enemyState.lastKnownTargetPosition
        ? ClonePosition(enemyState.lastKnownTargetPosition)
        : null,
      radius: context?.alertBroadcastRadius,
      timestamp: FiniteOr(context?.timeSeconds, 0),
    });
  }
  return true;
}

function ChooseSearchPoint(enemyState, context, dependencies, config) {
  const anchors = ClonePointArray(
    context?.aiZone?.searchAnchors?.length
      ? context.aiZone.searchAnchors
      : enemyState.searchAnchors,
  );
  let targetPosition;
  if (anchors.length > 0) {
    const offset = HashString(enemyState.enemyId) % anchors.length;
    targetPosition = anchors[(offset + enemyState.searchStep) % anchors.length];
  } else {
    const random = ResolveRandom(dependencies?.random, HashString(enemyState.enemyId) + enemyState.searchStep);
    const angle = RandomRange(random, 0, Math.PI * 2);
    const radius = RandomRange(random, config.enemy.searchRadius * 0.35, config.enemy.searchRadius);
    const centerPosition = enemyState.lastKnownTargetPosition
      ?? enemyState.investigationPosition
      ?? enemyState.position;
    targetPosition = {
      x: centerPosition.x + Math.sin(angle) * radius,
      z: centerPosition.z + Math.cos(angle) * radius,
    };
  }
  const projectQuery = dependencies?.ProjectToNavigation ?? dependencies?.projectToNavigation;
  if (typeof projectQuery === "function") {
    return ClonePosition(projectQuery(targetPosition, enemyState, context) ?? targetPosition);
  }
  return ClonePosition(targetPosition);
}

function FindStrongestNewNoise(enemyState, noises, context, config) {
  let strongestResult = null;
  for (const noise of Array.isArray(noises) ? noises : []) {
    if (Number.isFinite(context?.timeSeconds)
      && FiniteOr(noise?.expiresAt, Infinity) < context.timeSeconds) {
      continue;
    }
    const noiseId = String(noise?.eventId ?? "");
    if (noiseId && enemyState.recentNoiseIds.includes(noiseId)) {
      continue;
    }
    const hearingResult = EvaluateHearing(enemyState, noise, context, config);
    if (hearingResult.heard && (!strongestResult || hearingResult.audibility > strongestResult.audibility)) {
      strongestResult = hearingResult;
    }
  }
  return strongestResult;
}

export function ApplyEnemyAlert(enemy, alert = {}, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const nextEnemy = CreateEnemyState(enemy, gameplayConfig);
  const alertPosition = ClonePosition(alert.position ?? nextEnemy.position);
  const radius = Math.max(0.1, FiniteOr(alert.radius, gameplayConfig.enemy.alertBroadcastRadius));
  const distance = Distance(nextEnemy.position, alertPosition);
  if (distance > radius || alert.sourceId === nextEnemy.enemyId) {
    return SynchronizeEnemyAliases(nextEnemy);
  }
  const intensity = Clamp01(FiniteOr(alert.intensity, gameplayConfig.enemy.allyAlertIntensity))
    * (1 - 0.45 * Clamp01(distance / radius));
  nextEnemy.awareness = Math.max(nextEnemy.awareness, intensity);
  nextEnemy.suspicion = Math.max(nextEnemy.suspicion, intensity);
  nextEnemy.lastKnownTargetPosition = alert.targetPosition
    ? ClonePosition(alert.targetPosition)
    : nextEnemy.lastKnownTargetPosition;
  nextEnemy.investigationPosition = alertPosition;
  if ([EnemyStateIds.PATROL, EnemyStateIds.SUSPICIOUS].includes(nextEnemy.stateId)) {
    nextEnemy.stateId = intensity >= gameplayConfig.enemy.alertThreshold
      ? EnemyStateIds.ALERT
      : EnemyStateIds.SEARCH;
    nextEnemy.stateElapsedSeconds = 0;
    nextEnemy.stateVersion += 1;
  }
  return SynchronizeEnemyAliases(nextEnemy);
}

export function UpdateEnemyAi(enemy, frame = {}, dependencies = {}, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const enemyConfig = gameplayConfig.enemy;
  const nextEnemy = CreateEnemyState(enemy, gameplayConfig);
  const requestedDelta = NormalizeDelta(frame.delta ?? frame.deltaSeconds);
  const elapsedSinceLastUpdate = Number.isFinite(frame.timeSeconds)
    && Number.isFinite(nextEnemy.lastAiUpdateTimeSeconds)
    ? Math.max(0, frame.timeSeconds - nextEnemy.lastAiUpdateTimeSeconds)
    : requestedDelta;
  const delta = NormalizeDelta(Math.max(requestedDelta, elapsedSinceLastUpdate), 0.35);
  if (Number.isFinite(frame.timeSeconds)) {
    nextEnemy.lastAiUpdateTimeSeconds = frame.timeSeconds;
  }
  const events = [];
  const player = frame.player ?? {};
  const context = {
    ...dependencies,
    timeSeconds: FiniteOr(frame.timeSeconds, 0),
    obstacles: frame.obstacles ?? dependencies.obstacles,
    visibilityMultiplier: FiniteOr(
      frame.visibilityMultiplier,
      FiniteOr(frame.environment?.visibilityMultiplier, 1),
    ),
  };
  nextEnemy.stateElapsedSeconds += delta;
  nextEnemy.shotCooldownSeconds = Math.max(0, nextEnemy.shotCooldownSeconds - delta);
  const vision = nextEnemy.alive && player?.alive !== false
    ? EvaluateVision(nextEnemy, player, context, gameplayConfig)
    : {
      visible: false,
      distance: Infinity,
      detectionStrength: 0,
      awarenessPerSecond: 0,
      transmission: 0,
    };
  const strongestNoise = FindStrongestNewNoise(nextEnemy, frame.noises, context, gameplayConfig);

  if (strongestNoise) {
    const noiseId = strongestNoise.noise.eventId;
    nextEnemy.recentNoiseIds = [...nextEnemy.recentNoiseIds.filter((id) => id !== noiseId), noiseId].slice(-12);
    nextEnemy.suspicion = Clamp01(
      nextEnemy.suspicion + strongestNoise.audibility * enemyConfig.hearingSuspicionGain,
    );
    nextEnemy.investigationPosition = ClonePosition(strongestNoise.noise.position);
    events.push({
      eventId: GameplayEventIds.ENEMY_HEARD_NOISE,
      enemyId: nextEnemy.enemyId,
      noiseEventId: noiseId,
      position: ClonePosition(strongestNoise.noise.position),
      audibility: strongestNoise.audibility,
      timestamp: FiniteOr(frame.timeSeconds, strongestNoise.noise.timestamp),
    });
  } else {
    nextEnemy.suspicion = Math.max(0, nextEnemy.suspicion - enemyConfig.suspicionDecayPerSecond * delta);
  }

  if (vision.visible) {
    nextEnemy.awareness = Clamp01(nextEnemy.awareness + vision.awarenessPerSecond * delta);
    nextEnemy.lastKnownTargetPosition = ClonePosition(player.position);
    if (nextEnemy.awareness >= enemyConfig.engageThreshold
      && enemy?.awareness < enemyConfig.engageThreshold) {
      events.push({
        eventId: GameplayEventIds.ENEMY_TARGET_SPOTTED,
        enemyId: nextEnemy.enemyId,
        targetId: player.playerId ?? player.id ?? "player",
        position: ClonePosition(player.position),
        timestamp: FiniteOr(frame.timeSeconds, 0),
      });
    }
  } else {
    const decay = nextEnemy.stateId === EnemyStateIds.ENGAGE
      ? enemyConfig.combatVisionDecayPerSecond
      : enemyConfig.visionDecayPerSecond;
    nextEnemy.awareness = Math.max(0, nextEnemy.awareness - decay * delta);
  }

  let transitioned = false;
  if (frame.tookDamage || frame.hitByPlayer) {
    nextEnemy.awareness = 1;
    nextEnemy.suspicion = 1;
    nextEnemy.lastKnownTargetPosition = frame.damageSourcePosition
      ? ClonePosition(frame.damageSourcePosition)
      : ClonePosition(player.position);
    transitioned = TransitionEnemyState(
      nextEnemy,
      EnemyStateIds.ALERT,
      "tookDamage",
      events,
      { ...frame, alertBroadcastRadius: enemyConfig.alertBroadcastRadius },
    );
  }

  if (!transitioned) {
    switch (nextEnemy.stateId) {
      case EnemyStateIds.PATROL:
        if (nextEnemy.awareness >= enemyConfig.alertThreshold) {
          TransitionEnemyState(nextEnemy, EnemyStateIds.ALERT, "visualConfirmation", events, {
            ...frame,
            alertBroadcastRadius: enemyConfig.alertBroadcastRadius,
          });
        } else if (strongestNoise || nextEnemy.awareness >= enemyConfig.suspicionThreshold) {
          TransitionEnemyState(nextEnemy, EnemyStateIds.SUSPICIOUS, "uncertainStimulus", events, frame);
        }
        break;
      case EnemyStateIds.SUSPICIOUS:
        if (nextEnemy.awareness >= enemyConfig.alertThreshold) {
          TransitionEnemyState(nextEnemy, EnemyStateIds.ALERT, "visualConfirmation", events, {
            ...frame,
            alertBroadcastRadius: enemyConfig.alertBroadcastRadius,
          });
        } else if (nextEnemy.stateElapsedSeconds >= enemyConfig.suspiciousDurationSeconds
          || (nextEnemy.investigationPosition
            && Distance(nextEnemy.position, nextEnemy.investigationPosition) <= enemyConfig.searchPointReachDistance)) {
          TransitionEnemyState(nextEnemy, EnemyStateIds.SEARCH, "investigateReached", events, frame);
        }
        break;
      case EnemyStateIds.SEARCH:
        if (nextEnemy.awareness >= enemyConfig.alertThreshold) {
          TransitionEnemyState(nextEnemy, EnemyStateIds.ALERT, "targetFound", events, {
            ...frame,
            alertBroadcastRadius: enemyConfig.alertBroadcastRadius,
          });
        } else if (nextEnemy.stateElapsedSeconds >= enemyConfig.searchDurationSeconds) {
          TransitionEnemyState(nextEnemy, EnemyStateIds.PATROL, "searchExpired", events, frame);
        }
        break;
      case EnemyStateIds.ALERT:
        if (vision.visible
          && nextEnemy.awareness >= enemyConfig.engageThreshold
          && nextEnemy.stateElapsedSeconds >= enemyConfig.alertMinimumSeconds) {
          TransitionEnemyState(nextEnemy, EnemyStateIds.ENGAGE, "targetConfirmed", events, frame);
        } else if (!vision.visible && nextEnemy.stateElapsedSeconds >= enemyConfig.alertMaximumSeconds) {
          TransitionEnemyState(nextEnemy, EnemyStateIds.SEARCH, "confirmationLost", events, frame);
        }
        break;
      case EnemyStateIds.ENGAGE:
        if (vision.visible) {
          nextEnemy.lostSightSeconds = 0;
        } else {
          nextEnemy.lostSightSeconds += delta;
          if (nextEnemy.lostSightSeconds >= enemyConfig.loseSightSeconds) {
            TransitionEnemyState(nextEnemy, EnemyStateIds.LOST_TARGET, "lineOfSightLost", events, frame);
          }
        }
        break;
      case EnemyStateIds.LOST_TARGET:
        if (vision.visible && nextEnemy.awareness >= enemyConfig.alertThreshold) {
          TransitionEnemyState(nextEnemy, EnemyStateIds.ALERT, "targetReacquired", events, {
            ...frame,
            alertBroadcastRadius: enemyConfig.alertBroadcastRadius,
          });
        } else if (strongestNoise) {
          TransitionEnemyState(nextEnemy, EnemyStateIds.SEARCH, "newNoiseLead", events, frame);
        } else if (nextEnemy.stateElapsedSeconds >= enemyConfig.lostTargetDurationSeconds) {
          TransitionEnemyState(nextEnemy, EnemyStateIds.SEARCH, "trailCold", events, frame);
        }
        break;
      default:
        TransitionEnemyState(nextEnemy, EnemyStateIds.PATROL, "invalidState", events, frame);
        break;
    }
  }

  const patrolPoints = nextEnemy.patrolPoints;
  if (nextEnemy.stateId === EnemyStateIds.PATROL && patrolPoints.length > 0) {
    const patrolTarget = patrolPoints[nextEnemy.patrolIndex % patrolPoints.length];
    if (Distance(nextEnemy.position, patrolTarget) <= enemyConfig.patrolReachDistance) {
      nextEnemy.patrolIndex = (nextEnemy.patrolIndex + 1) % patrolPoints.length;
    }
  }
  if (nextEnemy.stateId === EnemyStateIds.SEARCH) {
    const reachedSearchTarget = nextEnemy.searchTargetPosition
      && Distance(nextEnemy.position, nextEnemy.searchTargetPosition) <= enemyConfig.searchPointReachDistance;
    if (!nextEnemy.searchTargetPosition || reachedSearchTarget) {
      nextEnemy.searchStep += 1;
      nextEnemy.searchTargetPosition = ChooseSearchPoint(nextEnemy, frame, dependencies, gameplayConfig);
    }
  }

  let intent = {
    movementId: "hold",
    targetPosition: null,
    lookAtPosition: nextEnemy.lastKnownTargetPosition
      ? ClonePosition(nextEnemy.lastKnownTargetPosition)
      : null,
    speedMultiplier: 0,
    shouldAim: false,
    shouldFire: false,
    broadcastAlert: false,
  };
  switch (nextEnemy.stateId) {
    case EnemyStateIds.PATROL:
      intent = {
        ...intent,
        movementId: "patrol",
        targetPosition: patrolPoints.length > 0
          ? ClonePosition(patrolPoints[nextEnemy.patrolIndex % patrolPoints.length])
          : null,
        speedMultiplier: 0.52,
      };
      break;
    case EnemyStateIds.SUSPICIOUS:
      intent = {
        ...intent,
        movementId: "investigate",
        targetPosition: nextEnemy.investigationPosition
          ? ClonePosition(nextEnemy.investigationPosition)
          : null,
        lookAtPosition: nextEnemy.investigationPosition
          ? ClonePosition(nextEnemy.investigationPosition)
          : intent.lookAtPosition,
        speedMultiplier: 0.46,
      };
      break;
    case EnemyStateIds.SEARCH:
      intent = {
        ...intent,
        movementId: "search",
        targetPosition: nextEnemy.searchTargetPosition
          ? ClonePosition(nextEnemy.searchTargetPosition)
          : null,
        speedMultiplier: 0.58,
        shouldAim: nextEnemy.hasEngaged,
      };
      break;
    case EnemyStateIds.ALERT:
      intent = {
        ...intent,
        movementId: "brace",
        targetPosition: nextEnemy.lastKnownTargetPosition
          ? ClonePosition(nextEnemy.lastKnownTargetPosition)
          : null,
        speedMultiplier: 0.25,
        shouldAim: true,
        broadcastAlert: nextEnemy.stateElapsedSeconds <= delta + 1e-6,
      };
      break;
    case EnemyStateIds.ENGAGE:
      intent = {
        ...intent,
        movementId: vision.distance < 5 ? "seekCover" : "combatAdvance",
        targetPosition: nextEnemy.lastKnownTargetPosition
          ? ClonePosition(nextEnemy.lastKnownTargetPosition)
          : null,
        lookAtPosition: ClonePosition(player.position),
        speedMultiplier: vision.distance < 5 ? 0.82 : 0.62,
        shouldAim: true,
        shouldFire: vision.visible && nextEnemy.shotCooldownSeconds <= 0,
      };
      break;
    case EnemyStateIds.LOST_TARGET:
      intent = {
        ...intent,
        movementId: "pursueLastKnown",
        targetPosition: nextEnemy.lastKnownTargetPosition
          ? ClonePosition(nextEnemy.lastKnownTargetPosition)
          : null,
        speedMultiplier: 0.72,
        shouldAim: true,
      };
      break;
    default:
      break;
  }

  if (intent.shouldFire) {
    const fireRandom = ResolveRandom(
      dependencies?.random,
      HashString(`${nextEnemy.enemyId}${Math.round(FiniteOr(frame.timeSeconds, 0) * 1000)}${nextEnemy.stateVersion}`),
    );
    nextEnemy.shotCooldownSeconds = RandomRange(
      fireRandom,
      enemyConfig.fireCooldownMinimumSeconds,
      enemyConfig.fireCooldownMaximumSeconds,
    );
  }

  return {
    state: SynchronizeEnemyAliases(nextEnemy),
    intent,
    vision,
    hearing: strongestNoise,
    events,
  };
}

export function ShouldRunAiTick(enemyId, frameIndex, distanceToFocus, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const performance = gameplayConfig.performance;
  const distance = Math.max(0, FiniteOr(distanceToFocus, 0));
  const stride = distance <= performance.nearDistance
    ? performance.nearAiFrameStride
    : (distance <= performance.farDistance
      ? performance.midAiFrameStride
      : performance.farAiFrameStride);
  const safeStride = Math.max(1, Math.floor(stride));
  const phase = HashString(enemyId) % safeStride;
  return Math.max(0, Math.floor(FiniteOr(frameIndex, 0))) % safeStride === phase;
}

export function SelectAiSimulationSet(enemies = [], focusPosition = { x: 0, z: 0 }, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const maximum = Math.max(1, Math.floor(gameplayConfig.performance.maxSimulatedEnemies));
  return (Array.isArray(enemies) ? enemies : [])
    .map((enemy, sourceIndex) => ({
      enemy,
      sourceIndex,
      priority: [EnemyStateIds.ALERT, EnemyStateIds.ENGAGE, EnemyStateIds.LOST_TARGET].includes(enemy?.stateId)
        ? 0
        : 1,
      distanceSquared: DistanceSquared(ClonePosition(enemy?.position), ClonePosition(focusPosition)),
    }))
    .sort((firstEntry, secondEntry) => firstEntry.priority - secondEntry.priority
      || firstEntry.distanceSquared - secondEntry.distanceSquared
      || firstEntry.sourceIndex - secondEntry.sourceIndex)
    .slice(0, maximum)
    .map((entry) => entry.enemy);
}

export function CreateInventory(options = {}, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const materials = options.materials ?? {};
  const items = options.items ?? {};
  const weapon = options.weapon ?? {};
  const magazineCapacity = Math.max(1, Math.floor(FiniteOr(
    weapon.magazineCapacity,
    gameplayConfig.weapon.magazineCapacity,
  )));
  return {
    materials: {
      cloth: Math.max(0, Math.floor(FiniteOr(materials.cloth, FiniteOr(options.cloth, 0)))),
      alcohol: Math.max(0, Math.floor(FiniteOr(materials.alcohol, FiniteOr(options.alcohol, 0)))),
      scrap: Math.max(0, Math.floor(FiniteOr(materials.scrap, FiniteOr(options.scrap, 0)))),
    },
    items: {
      bandage: Math.max(0, Math.floor(FiniteOr(items.bandage, FiniteOr(options.bandageCount, 0)))),
      bottle: Math.max(0, Math.floor(FiniteOr(items.bottle, FiniteOr(options.bottleCount, 0)))),
      emptyCan: Math.max(0, Math.floor(FiniteOr(items.emptyCan, FiniteOr(options.emptyCanCount, 0)))),
      tinCan: Math.max(0, Math.floor(FiniteOr(items.tinCan, FiniteOr(options.tinCanCount, 0)))),
    },
    weapon: {
      weaponId: String(weapon.weaponId ?? gameplayConfig.weapon.weaponId),
      magazineCapacity,
      magazineAmmo: Clamp(
        Math.floor(FiniteOr(weapon.magazineAmmo, FiniteOr(options.magazineAmmo, magazineCapacity))),
        0,
        magazineCapacity,
      ),
      reserveAmmo: Math.max(0, Math.floor(FiniteOr(
        weapon.reserveAmmo,
        FiniteOr(options.reserveAmmo, 0),
      ))),
      condition: Clamp01(FiniteOr(weapon.condition, 1)),
    },
  };
}

function GetCraftAvailability(inventory, recipeId, amount, config) {
  const normalizedInventory = CreateInventory(inventory, config);
  const recipe = CraftRecipes[recipeId];
  const craftAmount = Math.max(1, Math.floor(FiniteOr(amount, 1)));
  if (!recipe) {
    return {
      canCraft: false,
      reasonId: "unknownRecipe",
      inventory: normalizedInventory,
      recipe: null,
      amount: craftAmount,
      missing: {},
    };
  }
  const missing = {};
  for (const [materialId, requiredAmount] of Object.entries(recipe.ingredients ?? {})) {
    const required = requiredAmount * craftAmount;
    const available = normalizedInventory.materials[materialId] ?? 0;
    if (available < required) {
      missing[materialId] = required - available;
    }
  }
  for (const [itemId, requiredAmount] of Object.entries(recipe.consumeItems ?? {})) {
    const required = requiredAmount * craftAmount;
    const available = normalizedInventory.items[itemId] ?? 0;
    if (available < required) {
      missing[itemId] = required - available;
    }
  }
  return {
    canCraft: Object.keys(missing).length === 0,
    reasonId: Object.keys(missing).length === 0 ? null : "missingIngredients",
    inventory: normalizedInventory,
    recipe,
    amount: craftAmount,
    missing,
  };
}

export function CanCraft(inventory, recipeId, amount = 1, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  return GetCraftAvailability(inventory, recipeId, amount, gameplayConfig).canCraft;
}

export function CraftItem(inventory, recipeId, amount = 1, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const availability = GetCraftAvailability(inventory, recipeId, amount, gameplayConfig);
  if (!availability.canCraft) {
    return {
      ok: false,
      reasonId: availability.reasonId,
      missing: availability.missing,
      inventory: availability.inventory,
      recipe: availability.recipe,
      events: [],
    };
  }
  const nextInventory = CreateInventory(availability.inventory, gameplayConfig);
  for (const [materialId, requiredAmount] of Object.entries(availability.recipe.ingredients ?? {})) {
    nextInventory.materials[materialId] -= requiredAmount * availability.amount;
  }
  for (const [itemId, requiredAmount] of Object.entries(availability.recipe.consumeItems ?? {})) {
    nextInventory.items[itemId] -= requiredAmount * availability.amount;
  }
  const outputAmount = availability.recipe.output.amount * availability.amount;
  if (availability.recipe.output.category === "items") {
    nextInventory.items[availability.recipe.output.itemId] = (
      nextInventory.items[availability.recipe.output.itemId] ?? 0
    ) + outputAmount;
  }
  return {
    ok: true,
    reasonId: null,
    missing: {},
    inventory: nextInventory,
    recipe: availability.recipe,
    craftedAmount: outputAmount,
    events: [{
      eventId: GameplayEventIds.ITEM_CRAFTED,
      recipeId,
      amount: availability.amount,
      outputAmount,
    }],
  };
}

export function FireWeapon(inventory, request = {}, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const nextInventory = CreateInventory(inventory, gameplayConfig);
  const position = ClonePosition(request.position);
  const timestamp = FiniteOr(request.timeSeconds, 0);
  if (nextInventory.weapon.magazineAmmo <= 0) {
    return {
      ok: false,
      reasonId: "emptyMagazine",
      inventory: nextInventory,
      shot: null,
      noiseEvents: [EmitNoise({
        eventId: `${request.actorId ?? "player"}DryFire${Math.round(timestamp * 1000)}`,
        sourceId: request.actorId ?? "player",
        kindId: NoiseKindIds.DRY_FIRE,
        position,
        radius: 2.2,
        loudness: 0.35,
        timestamp,
      }, timestamp, gameplayConfig)],
      events: [{
        eventId: GameplayEventIds.WEAPON_EMPTY,
        actorId: request.actorId ?? "player",
        timestamp,
      }],
    };
  }
  nextInventory.weapon.magazineAmmo -= 1;
  const random = ResolveRandom(request.random, FiniteOr(request.seed, 1942));
  let spread = gameplayConfig.weapon.baseSpreadRadians;
  if (request.isMoving) {
    spread *= gameplayConfig.weapon.movingSpreadMultiplier;
  }
  if (request.isCrouched) {
    spread *= gameplayConfig.weapon.crouchSpreadMultiplier;
  }
  spread *= 1 + (1 - nextInventory.weapon.condition) * 1.2;
  const shotId = String(request.shotId
    ?? `${request.actorId ?? "player"}Shot${Math.round(timestamp * 1000)}${nextInventory.weapon.magazineAmmo}`);
  return {
    ok: true,
    reasonId: null,
    inventory: nextInventory,
    shot: {
      shotId,
      actorId: request.actorId ?? "player",
      origin: position,
      direction: NormalizePosition(request.direction),
      damage: gameplayConfig.weapon.damage * nextInventory.weapon.condition,
      spreadYawRadians: RandomRange(random, -spread, spread),
      spreadMagnitudeRadians: spread,
      timestamp,
    },
    noiseEvents: [EmitNoise({
      eventId: `${shotId}Noise`,
      sourceId: request.actorId ?? "player",
      kindId: NoiseKindIds.GUNSHOT,
      position,
      radius: gameplayConfig.weapon.noiseRadius,
      loudness: 1,
      timestamp,
    }, timestamp, gameplayConfig)],
    events: [{
      eventId: GameplayEventIds.WEAPON_FIRED,
      actorId: request.actorId ?? "player",
      shotId,
      timestamp,
    }],
  };
}

export function ReloadWeapon(inventory, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const nextInventory = CreateInventory(inventory, gameplayConfig);
  const neededAmmo = nextInventory.weapon.magazineCapacity - nextInventory.weapon.magazineAmmo;
  const transferredAmmo = Math.min(neededAmmo, nextInventory.weapon.reserveAmmo);
  if (transferredAmmo <= 0) {
    return {
      ok: false,
      reasonId: neededAmmo <= 0 ? "magazineFull" : "noReserveAmmo",
      transferredAmmo: 0,
      inventory: nextInventory,
      events: [],
    };
  }
  nextInventory.weapon.magazineAmmo += transferredAmmo;
  nextInventory.weapon.reserveAmmo -= transferredAmmo;
  return {
    ok: true,
    reasonId: null,
    transferredAmmo,
    inventory: nextInventory,
    events: [{
      eventId: GameplayEventIds.WEAPON_RELOADED,
      transferredAmmo,
    }],
  };
}

function ClonePlayer(player = {}, config = DefaultGameplayConfig) {
  const maximumHealth = Math.max(1, FiniteOr(
    player.maximumHealth,
    FiniteOr(player.maxHealth, 100),
  ));
  return {
    ...player,
    playerId: String(player.playerId ?? player.id ?? "player"),
    position: ClonePosition(player.position),
    velocity: ClonePosition(player.velocity),
    health: Math.max(0, FiniteOr(player.health, 100)),
    maximumHealth,
    maxHealth: maximumHealth,
    isCrouched: Boolean(player.isCrouched ?? player.crouched),
    isSprinting: Boolean(player.isSprinting ?? player.sprinting),
    bandageAction: player.bandageAction ? { ...player.bandageAction } : null,
    inventory: CreateInventory(player.inventory, config),
  };
}

export function BeginBandage(player, inventory = player?.inventory, currentTimeSeconds = 0, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const nextPlayer = ClonePlayer({ ...player, inventory }, gameplayConfig);
  if (nextPlayer.bandageAction) {
    return { ok: false, reasonId: "alreadyBandaging", player: nextPlayer, inventory: nextPlayer.inventory, events: [] };
  }
  if (nextPlayer.health >= nextPlayer.maximumHealth) {
    return { ok: false, reasonId: "healthFull", player: nextPlayer, inventory: nextPlayer.inventory, events: [] };
  }
  if (nextPlayer.inventory.items.bandage <= 0) {
    return { ok: false, reasonId: "noBandage", player: nextPlayer, inventory: nextPlayer.inventory, events: [] };
  }
  nextPlayer.bandageAction = {
    actionId: `${nextPlayer.playerId}Bandage${Math.round(FiniteOr(currentTimeSeconds, 0) * 1000)}`,
    progressSeconds: 0,
    durationSeconds: gameplayConfig.bandage.durationSeconds,
    startedAt: FiniteOr(currentTimeSeconds, 0),
  };
  return {
    ok: true,
    reasonId: null,
    player: nextPlayer,
    inventory: nextPlayer.inventory,
    events: [{
      eventId: GameplayEventIds.BANDAGE_STARTED,
      actorId: nextPlayer.playerId,
      actionId: nextPlayer.bandageAction.actionId,
      timestamp: FiniteOr(currentTimeSeconds, 0),
    }],
  };
}

export function UpdateBandage(player, inventory = player?.inventory, frame = {}, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const nextPlayer = ClonePlayer({ ...player, inventory }, gameplayConfig);
  if (!nextPlayer.bandageAction) {
    return {
      active: false,
      completed: false,
      interrupted: false,
      player: nextPlayer,
      inventory: nextPlayer.inventory,
      events: [],
    };
  }
  const speed = Math.max(0, FiniteOr(frame.movementSpeed, PositionLength(nextPlayer.velocity)));
  const interrupted = Boolean(frame.interrupted || frame.tookDamage)
    || speed > gameplayConfig.bandage.movementInterruptSpeed;
  if (interrupted) {
    const actionId = nextPlayer.bandageAction.actionId;
    nextPlayer.bandageAction = null;
    return {
      active: false,
      completed: false,
      interrupted: true,
      player: nextPlayer,
      inventory: nextPlayer.inventory,
      events: [{
        eventId: GameplayEventIds.BANDAGE_INTERRUPTED,
        actorId: nextPlayer.playerId,
        actionId,
        timestamp: FiniteOr(frame.timeSeconds, 0),
      }],
    };
  }
  nextPlayer.bandageAction.progressSeconds += NormalizeDelta(frame.delta ?? frame.deltaSeconds);
  if (nextPlayer.bandageAction.progressSeconds < nextPlayer.bandageAction.durationSeconds) {
    return {
      active: true,
      completed: false,
      interrupted: false,
      progress: Clamp01(
        nextPlayer.bandageAction.progressSeconds / nextPlayer.bandageAction.durationSeconds,
      ),
      player: nextPlayer,
      inventory: nextPlayer.inventory,
      events: [],
    };
  }
  if (nextPlayer.inventory.items.bandage <= 0) {
    nextPlayer.bandageAction = null;
    return {
      active: false,
      completed: false,
      interrupted: true,
      reasonId: "reservedBandageMissing",
      player: nextPlayer,
      inventory: nextPlayer.inventory,
      events: [],
    };
  }
  const actionId = nextPlayer.bandageAction.actionId;
  nextPlayer.inventory.items.bandage -= 1;
  nextPlayer.health = Math.min(
    nextPlayer.maximumHealth,
    nextPlayer.health + gameplayConfig.bandage.healAmount,
  );
  nextPlayer.bandageAction = null;
  return {
    active: false,
    completed: true,
    interrupted: false,
    progress: 1,
    player: nextPlayer,
    inventory: nextPlayer.inventory,
    events: [{
      eventId: GameplayEventIds.BANDAGE_COMPLETED,
      actorId: nextPlayer.playerId,
      actionId,
      health: nextPlayer.health,
      timestamp: FiniteOr(frame.timeSeconds, 0),
    }],
  };
}

export function ThrowLure(inventory, request = {}, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const nextInventory = CreateInventory(inventory, gameplayConfig);
  const typeId = request.typeId === LureTypeIds.TIN_CAN ? LureTypeIds.TIN_CAN : LureTypeIds.BOTTLE;
  if ((nextInventory.items[typeId] ?? 0) <= 0) {
    return {
      ok: false,
      reasonId: "lureUnavailable",
      inventory: nextInventory,
      lure: null,
      events: [],
    };
  }
  nextInventory.items[typeId] -= 1;
  const timestamp = FiniteOr(request.timeSeconds, 0);
  const strength = Clamp(FiniteOr(request.strength, 1), 0.2, 1);
  const speed = (typeId === LureTypeIds.BOTTLE
    ? gameplayConfig.lure.bottleSpeed
    : gameplayConfig.lure.tinCanSpeed) * strength;
  const direction = NormalizePosition(request.direction);
  const lureId = String(request.lureId
    ?? `${request.actorId ?? "player"}${typeId}${Math.round(timestamp * 1000)}`);
  const lure = {
    lureId,
    ownerId: String(request.actorId ?? "player"),
    typeId,
    position: ClonePosition(request.position),
    velocity: ScalePosition(direction, speed),
    height: Math.max(0.05, FiniteOr(request.height, 1.35)),
    verticalVelocity: gameplayConfig.lure.upwardSpeed * Math.sqrt(strength),
    ageSeconds: 0,
    bounceCount: 0,
    active: true,
    settled: false,
    thrownAt: timestamp,
  };
  return {
    ok: true,
    reasonId: null,
    inventory: nextInventory,
    lure,
    events: [{
      eventId: GameplayEventIds.LURE_THROWN,
      lureId,
      actorId: lure.ownerId,
      typeId,
      timestamp,
    }],
  };
}

function ResolveLureCollision(lure, startPosition, endPosition, nextHeight, frame, dependencies) {
  const query = dependencies?.SweepLure ?? dependencies?.sweepLure;
  if (typeof query === "function") {
    const queryResult = query({
      lure,
      startPosition,
      endPosition,
      startHeight: lure.height,
      endHeight: nextHeight,
      obstacles: frame.obstacles,
    });
    if (queryResult) {
      return {
        hit: queryResult.hit !== false,
        point: ClonePosition(queryResult.point ?? endPosition),
        normal: NormalizePosition(queryResult.normal ?? { x: 0, z: 0 }, { x: 0, z: 0 }),
        ground: Boolean(queryResult.ground),
      };
    }
  }
  for (const obstacle of Array.isArray(frame.obstacles) ? frame.obstacles : []) {
    if (ObstacleIntersectsSegment(obstacle, startPosition, endPosition)) {
      return {
        hit: true,
        point: ClonePosition(endPosition),
        normal: NormalizePosition(obstacle.normal ?? ScalePosition(lure.velocity, -1)),
        ground: false,
      };
    }
  }
  if (nextHeight <= 0) {
    return { hit: true, point: ClonePosition(endPosition), normal: { x: 0, z: 0 }, ground: true };
  }
  return { hit: false, point: ClonePosition(endPosition), normal: { x: 0, z: 0 }, ground: false };
}

export function UpdateLure(lure, frame = {}, dependencies = {}, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const delta = NormalizeDelta(frame.delta ?? frame.deltaSeconds);
  const nextLure = {
    ...lure,
    position: ClonePosition(lure?.position),
    velocity: ClonePosition(lure?.velocity),
    height: Math.max(0, FiniteOr(lure?.height, 0)),
    verticalVelocity: FiniteOr(lure?.verticalVelocity, 0),
    ageSeconds: Math.max(0, FiniteOr(lure?.ageSeconds, 0)),
    bounceCount: Math.max(0, Math.floor(FiniteOr(lure?.bounceCount, 0))),
    active: lure?.active !== false,
    settled: Boolean(lure?.settled),
  };
  if (delta <= 0) {
    return { state: nextLure, noiseEvents: [], events: [] };
  }
  if (!nextLure.active) {
    nextLure.ageSeconds += delta;
    return { state: nextLure, noiseEvents: [], events: [] };
  }
  const startPosition = ClonePosition(nextLure.position);
  const endPosition = AddPositions(startPosition, ScalePosition(nextLure.velocity, delta));
  const verticalVelocity = nextLure.verticalVelocity - gameplayConfig.lure.gravity * delta;
  const nextHeight = nextLure.height + verticalVelocity * delta;
  const collision = ResolveLureCollision(nextLure, startPosition, endPosition, nextHeight, frame, dependencies);
  nextLure.ageSeconds += delta;
  nextLure.verticalVelocity = verticalVelocity;
  nextLure.position = collision.point;
  nextLure.height = Math.max(0, nextHeight);
  const noiseEvents = [];
  const events = [];

  if (collision.hit) {
    const impactSpeed = Math.hypot(PositionLength(nextLure.velocity), nextLure.verticalVelocity);
    nextLure.bounceCount += 1;
    events.push({
      eventId: GameplayEventIds.LURE_IMPACTED,
      lureId: nextLure.lureId,
      typeId: nextLure.typeId,
      position: ClonePosition(nextLure.position),
      impactSpeed,
      timestamp: FiniteOr(frame.timeSeconds, nextLure.thrownAt + nextLure.ageSeconds),
    });
    if (nextLure.typeId === LureTypeIds.BOTTLE) {
      nextLure.active = false;
      nextLure.settled = true;
      nextLure.height = 0;
      nextLure.velocity = { x: 0, z: 0 };
      nextLure.verticalVelocity = 0;
      noiseEvents.push(EmitNoise({
        eventId: `${nextLure.lureId}Break`,
        sourceId: nextLure.ownerId,
        kindId: NoiseKindIds.BOTTLE_BREAK,
        position: nextLure.position,
        radius: gameplayConfig.lure.bottleNoiseRadius,
        loudness: Clamp(impactSpeed / Math.max(gameplayConfig.lure.bottleBreakSpeed, 1), 0.72, 1),
        timestamp: frame.timeSeconds,
        tags: ["lure"],
      }, frame.timeSeconds, gameplayConfig));
    } else {
      const speedRatio = Clamp01(impactSpeed / gameplayConfig.lure.tinCanSpeed);
      noiseEvents.push(EmitNoise({
        eventId: `${nextLure.lureId}Impact${nextLure.bounceCount}`,
        sourceId: nextLure.ownerId,
        kindId: NoiseKindIds.TIN_CAN_IMPACT,
        position: nextLure.position,
        radius: gameplayConfig.lure.tinCanNoiseRadius * (0.45 + speedRatio * 0.55),
        loudness: 0.48 + speedRatio * 0.46,
        timestamp: frame.timeSeconds,
        tags: ["lure"],
      }, frame.timeSeconds, gameplayConfig));
      if (collision.ground) {
        nextLure.height = 0.02;
        nextLure.verticalVelocity = Math.abs(nextLure.verticalVelocity)
          * gameplayConfig.lure.tinCanRestitution;
      } else {
        const normal = NormalizePosition(collision.normal, ScalePosition(nextLure.velocity, -1));
        const dot = Dot(nextLure.velocity, normal);
        nextLure.velocity = SubtractPositions(nextLure.velocity, ScalePosition(normal, 2 * dot));
        nextLure.verticalVelocity *= gameplayConfig.lure.tinCanRestitution;
      }
      nextLure.velocity = ScalePosition(nextLure.velocity, gameplayConfig.lure.tinCanPlanarFriction);
      const remainingSpeed = Math.hypot(PositionLength(nextLure.velocity), nextLure.verticalVelocity);
      if (nextLure.bounceCount >= gameplayConfig.lure.tinCanMaximumBounces
        || remainingSpeed <= gameplayConfig.lure.settleSpeed) {
        nextLure.active = false;
        nextLure.settled = true;
        nextLure.height = 0;
        nextLure.velocity = { x: 0, z: 0 };
        nextLure.verticalVelocity = 0;
      }
    }
  }

  if (nextLure.ageSeconds >= gameplayConfig.lure.maximumLifetimeSeconds) {
    nextLure.active = false;
    nextLure.settled = true;
    nextLure.velocity = { x: 0, z: 0 };
    nextLure.verticalVelocity = 0;
  }
  return { state: nextLure, noiseEvents, events };
}

export function CreateCompanionState(options = {}) {
  const commandIds = new Set(Object.values(CompanionCommandIds));
  const requestedCommandId = options.commandId ?? options.command;
  const commandId = commandIds.has(requestedCommandId) ? requestedCommandId : CompanionCommandIds.FOLLOW;
  const health = Math.max(0, FiniteOr(options.health, 100));
  const companionState = {
    ...options,
    companionId: String(options.companionId ?? options.id ?? "companion"),
    position: ClonePosition(options.position),
    forward: NormalizePosition(options.forward ?? ForwardFromYaw(options.facing)),
    commandId,
    stayPosition: options.stayPosition ? ClonePosition(options.stayPosition) : null,
    health,
    maximumHealth: Math.max(1, FiniteOr(options.maximumHealth, FiniteOr(options.maxHealth, 100))),
    alive: options.alive !== false && options.active !== false && health > 0,
    ammo: Math.max(0, Math.floor(FiniteOr(options.ammo, 3))),
    bandages: Math.max(0, Math.floor(FiniteOr(options.bandages, 1))),
    assistCooldownSeconds: Math.max(0, FiniteOr(options.assistCooldownSeconds, 0)),
    coverShotCooldownSeconds: Math.max(0, FiniteOr(options.coverShotCooldownSeconds, 0)),
    separationSeconds: Math.max(0, FiniteOr(options.separationSeconds, 0)),
    lastSafePosition: options.lastSafePosition
      ? ClonePosition(options.lastSafePosition)
      : ClonePosition(options.position),
  };
  return SynchronizeCompanionAliases(companionState);
}

function SynchronizeCompanionAliases(companionState) {
  companionState.command = companionState.commandId;
  companionState.maxHealth = companionState.maximumHealth;
  companionState.active = companionState.alive;
  return companionState;
}

export function SetCompanionCommand(companion, commandId, options = {}) {
  const nextCompanion = CreateCompanionState(companion);
  const commandIds = new Set(Object.values(CompanionCommandIds));
  if (!commandIds.has(commandId)) {
    return { ok: false, reasonId: "invalidCommand", state: nextCompanion, events: [] };
  }
  const previousCommandId = nextCompanion.commandId;
  nextCompanion.commandId = commandId;
  if (commandId === CompanionCommandIds.STAY) {
    nextCompanion.stayPosition = ClonePosition(options.position ?? nextCompanion.position);
  } else if (commandId === CompanionCommandIds.FOLLOW) {
    nextCompanion.stayPosition = null;
  }
  return {
    ok: true,
    reasonId: null,
    state: SynchronizeCompanionAliases(nextCompanion),
    events: previousCommandId === commandId ? [] : [{
      eventId: GameplayEventIds.COMPANION_COMMAND_CHANGED,
      companionId: nextCompanion.companionId,
      previousCommandId,
      commandId,
      timestamp: FiniteOr(options.timeSeconds, 0),
    }],
  };
}

function FindNearestActiveThreat(companion, threats) {
  let nearestThreat = null;
  let nearestDistance = Infinity;
  for (const threat of Array.isArray(threats) ? threats : []) {
    if (threat?.alive === false || threat?.stateId === EnemyStateIds.PATROL) {
      continue;
    }
    const threatDistance = Distance(companion.position, ClonePosition(threat?.position));
    if (threatDistance < nearestDistance) {
      nearestDistance = threatDistance;
      nearestThreat = threat;
    }
  }
  return { threat: nearestThreat, distance: nearestDistance };
}

function ResolveCompanionFollowPoint(companion, player, frame, dependencies, config) {
  const playerForward = NormalizePosition(player.forward ?? ForwardFromYaw(player.yawRadians));
  const playerRight = { x: -playerForward.z, z: playerForward.x };
  const flankSide = HashString(companion.companionId) % 2 === 0 ? 1 : -1;
  const followDistance = frame.playerSprinting
    ? config.companion.sprintFollowDistance
    : config.companion.preferredFollowDistance;
  let desiredPosition = AddPositions(
    AddPositions(player.position, ScalePosition(playerForward, -followDistance)),
    ScalePosition(playerRight, config.companion.lateralFollowDistance * flankSide),
  );

  const hasCameraHeading = frame.cameraForward || frame.viewForward || Number.isFinite(frame.cameraYawRadians);
  if (hasCameraHeading) {
    const cameraForward = NormalizePosition(
      frame.cameraForward
        ?? frame.viewForward
        ?? ForwardFromYaw(frame.cameraYawRadians),
      playerForward,
    );
    const cameraRight = NormalizePosition(
      frame.cameraRight ?? { x: -cameraForward.z, z: cameraForward.x },
      playerRight,
    );
    const currentOffset = SubtractPositions(companion.position, player.position);
    const currentLateralDistance = Dot(currentOffset, cameraRight);
    const OccupiesCameraCorridor = (position) => {
      const offset = SubtractPositions(position, player.position);
      const rearDistance = -Dot(offset, cameraForward);
      const lateralDistance = Math.abs(Dot(offset, cameraRight));
      return rearDistance > 0.2
        && rearDistance < config.companion.cameraRearDangerDistance
        && lateralDistance < config.companion.cameraCorridorHalfWidth;
    };
    const desiredOffset = SubtractPositions(desiredPosition, player.position);
    const desiredLateralDistance = Dot(desiredOffset, cameraRight);
    const crossesCameraCenter = Math.abs(currentLateralDistance) > config.companion.cameraCorridorHalfWidth
      && currentLateralDistance * desiredLateralDistance < 0;
    if (OccupiesCameraCorridor(companion.position)
      || OccupiesCameraCorridor(desiredPosition)
      || crossesCameraCenter) {
      const cameraFlankSide = Math.abs(currentLateralDistance) > 0.35
        ? Math.sign(currentLateralDistance)
        : flankSide;
      desiredPosition = AddPositions(
        AddPositions(player.position, ScalePosition(cameraForward, -followDistance)),
        ScalePosition(cameraRight, config.companion.cameraSafeLateralDistance * cameraFlankSide),
      );
    }
  }

  const query = dependencies?.QuerySafeCompanionPoint ?? dependencies?.querySafeCompanionPoint;
  if (typeof query === "function") {
    return ClonePosition(query(companion, player, {
      ...frame,
      desiredPosition: ClonePosition(desiredPosition),
    }) ?? desiredPosition);
  }
  return desiredPosition;
}

export function UpdateCompanion(companion, frame = {}, dependencies = {}, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const companionConfig = gameplayConfig.companion;
  const delta = NormalizeDelta(frame.delta ?? frame.deltaSeconds);
  const nextCompanion = CreateCompanionState(companion);
  const player = {
    ...(frame.player ?? {}),
    position: ClonePosition(frame.player?.position),
    forward: NormalizePosition(frame.player?.forward ?? ForwardFromYaw(frame.player?.yawRadians)),
    health: Math.max(0, FiniteOr(frame.player?.health, 100)),
    maximumHealth: Math.max(1, FiniteOr(
      frame.player?.maximumHealth,
      FiniteOr(frame.player?.maxHealth, 100),
    )),
  };
  nextCompanion.assistCooldownSeconds = Math.max(0, nextCompanion.assistCooldownSeconds - delta);
  nextCompanion.coverShotCooldownSeconds = Math.max(0, nextCompanion.coverShotCooldownSeconds - delta);
  const playerDistance = Distance(nextCompanion.position, player.position);
  const threatResult = FindNearestActiveThreat(nextCompanion, frame.enemies ?? frame.threats);
  const safeForCloseAssist = threatResult.distance >= companionConfig.safeEnemyDistance;
  const events = [];
  const followPoint = ResolveCompanionFollowPoint(nextCompanion, player, frame, dependencies, gameplayConfig);
  let intent = {
    movementId: "hold",
    targetPosition: null,
    lookAtPosition: threatResult.threat ? ClonePosition(threatResult.threat.position) : null,
    speedMultiplier: 0,
    assistActionId: null,
    assistTargetId: null,
    requestHiddenReposition: false,
    repositionPosition: null,
  };

  if (!nextCompanion.alive) {
    return { state: SynchronizeCompanionAliases(nextCompanion), intent, events };
  }

  if (nextCompanion.commandId === CompanionCommandIds.ASSIST
    && (frame.playerDowned || player.downed)
    && safeForCloseAssist) {
    intent = {
      ...intent,
      movementId: playerDistance > companionConfig.assistDistance ? "assistApproach" : "hold",
      targetPosition: ClonePosition(player.position),
      speedMultiplier: playerDistance > companionConfig.assistDistance ? 1 : 0,
    };
  } else if (nextCompanion.commandId === CompanionCommandIds.STAY) {
    intent.targetPosition = ClonePosition(nextCompanion.stayPosition ?? nextCompanion.position);
    if (frame.forceEvade && threatResult.threat) {
      const away = NormalizePosition(SubtractPositions(nextCompanion.position, threatResult.threat.position));
      intent = {
        ...intent,
        movementId: "evade",
        targetPosition: AddPositions(nextCompanion.position, ScalePosition(away, 4)),
        speedMultiplier: 1,
      };
    }
  } else {
    const distanceToFollowPoint = Distance(nextCompanion.position, followPoint);
    if (distanceToFollowPoint > companionConfig.followDeadZone) {
      intent = {
        ...intent,
        movementId: distanceToFollowPoint >= companionConfig.catchUpDistance ? "catchUp" : "follow",
        targetPosition: followPoint,
        speedMultiplier: distanceToFollowPoint >= companionConfig.catchUpDistance ? 1 : 0.68,
      };
    }
  }

  if (playerDistance > companionConfig.maximumSeparationDistance) {
    nextCompanion.separationSeconds += delta;
    if (frame.companionVisibleToCamera === false && frame.playerCanSeeCompanion === false) {
      intent.requestHiddenReposition = true;
      intent.repositionPosition = ClonePosition(followPoint);
    }
  } else {
    nextCompanion.separationSeconds = 0;
    if (safeForCloseAssist) {
      nextCompanion.lastSafePosition = ClonePosition(nextCompanion.position);
    }
  }

  if (nextCompanion.commandId === CompanionCommandIds.ASSIST
    && nextCompanion.assistCooldownSeconds <= 0) {
    const healthRatio = player.health / player.maximumHealth;
    if ((frame.playerDowned || player.downed) && playerDistance <= companionConfig.assistDistance && safeForCloseAssist) {
      intent.assistActionId = "revivePlayer";
      intent.assistTargetId = player.playerId ?? player.id ?? "player";
      nextCompanion.assistCooldownSeconds = companionConfig.assistCooldownSeconds;
    } else if (healthRatio <= companionConfig.lowHealthRatio
      && nextCompanion.bandages > 0
      && playerDistance <= companionConfig.assistDistance
      && safeForCloseAssist) {
      intent.assistActionId = "bandagePlayer";
      intent.assistTargetId = player.playerId ?? player.id ?? "player";
      nextCompanion.bandages -= 1;
      nextCompanion.assistCooldownSeconds = companionConfig.assistCooldownSeconds;
    } else if (frame.assistRequest?.actionId) {
      intent.assistActionId = String(frame.assistRequest.actionId);
      intent.assistTargetId = frame.assistRequest.targetId ?? null;
      intent.targetPosition = frame.assistRequest.position
        ? ClonePosition(frame.assistRequest.position)
        : intent.targetPosition;
      nextCompanion.assistCooldownSeconds = companionConfig.assistCooldownSeconds;
    }
  }

  if (!intent.assistActionId
    && nextCompanion.commandId !== CompanionCommandIds.STAY
    && threatResult.threat
    && frame.playerUnderPressure
    && nextCompanion.ammo > 0
    && nextCompanion.coverShotCooldownSeconds <= 0) {
    intent.assistActionId = "coverShot";
    intent.assistTargetId = threatResult.threat.enemyId ?? threatResult.threat.id ?? null;
    intent.lookAtPosition = ClonePosition(threatResult.threat.position);
    nextCompanion.ammo -= 1;
    nextCompanion.coverShotCooldownSeconds = companionConfig.coverShotCooldownSeconds;
  }

  if (intent.assistActionId) {
    events.push({
      eventId: GameplayEventIds.COMPANION_ASSIST_REQUESTED,
      companionId: nextCompanion.companionId,
      actionId: intent.assistActionId,
      targetId: intent.assistTargetId,
      timestamp: FiniteOr(frame.timeSeconds, 0),
    });
  }

  return { state: SynchronizeCompanionAliases(nextCompanion), intent, events };
}

function NormalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => entry !== null && entry !== undefined).map(String);
  }
  if (value === null || value === undefined || value === "") {
    return [];
  }
  return [String(value)];
}

function NormalizeMissionBeat(beat, stageId, beatIndex, config) {
  const targetSeconds = Clamp(
    FiniteOr(beat?.targetSeconds, config.mission.defaultTargetSeconds),
    config.mission.minimumBeatSeconds,
    config.mission.maximumBeatSeconds,
  );
  const kindId = String(beat?.kind ?? beat?.kindId ?? MissionBeatKindIds.QUIET_EXPLORE);
  return {
    ...(IsRecord(beat) ? beat : {}),
    beatId: String(beat?.beatId ?? `${stageId}Beat${beatIndex + 1}`),
    eventId: beat?.eventId === null || beat?.eventId === undefined ? null : String(beat.eventId),
    kind: kindId,
    targetSeconds,
    minimumSeconds: Clamp(
      FiniteOr(beat?.minimumSeconds, Math.min(targetSeconds * 0.42, targetSeconds - 0.1)),
      0,
      targetSeconds,
    ),
    maximumSeconds: Clamp(
      FiniteOr(beat?.maximumSeconds, targetSeconds * config.mission.automaticAdvanceGraceMultiplier),
      targetSeconds,
      config.mission.maximumBeatSeconds,
    ),
    intensity: Clamp01(FiniteOr(beat?.intensity, 0.3)),
    allowCombat: Boolean(beat?.allowCombat),
    resourcePressure: Clamp01(FiniteOr(beat?.resourcePressure, 0.25)),
    companionHintId: beat?.companionHintId === null || beat?.companionHintId === undefined
      ? null
      : String(beat.companionHintId),
    advanceTriggerIds: NormalizeStringArray(
      beat?.advanceTriggerIds ?? beat?.advanceWhen?.triggerIds ?? beat?.advanceTriggerId,
    ),
    advanceEventIds: NormalizeStringArray(
      beat?.advanceEventIds ?? beat?.advanceWhen?.eventIds ?? beat?.advanceEventId,
    ),
    advanceObjectiveIds: NormalizeStringArray(
      beat?.advanceObjectiveIds ?? beat?.advanceWhen?.objectiveIds ?? beat?.advanceObjectiveId,
    ),
    requireAllSignals: Boolean(beat?.requireAllSignals ?? beat?.advanceWhen?.all),
  };
}

export function NormalizeMissionRhythm(source = [], config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const sourceStages = Array.isArray(source)
    ? source
    : (source?.missionStages ?? source?.storyStages ?? []);
  return (Array.isArray(sourceStages) ? sourceStages : []).map((stage, stageIndex) => {
    const stageId = String(stage?.stageId ?? `stage${stageIndex + 1}`);
    const sourceBeats = Array.isArray(stage?.beats) && stage.beats.length > 0
      ? stage.beats
      : [{
        beatId: `${stageId}Beat1`,
        kind: MissionBeatKindIds.QUIET_EXPLORE,
        targetSeconds: gameplayConfig.mission.defaultTargetSeconds,
        intensity: 0.25,
        allowCombat: false,
        resourcePressure: 0.2,
      }];
    return {
      ...(IsRecord(stage) ? stage : {}),
      stageId,
      title: String(stage?.title ?? stageId),
      objectiveId: stage?.objectiveId === null || stage?.objectiveId === undefined
        ? null
        : String(stage.objectiveId),
      entryTriggerId: stage?.entryTriggerId === null || stage?.entryTriggerId === undefined
        ? null
        : String(stage.entryTriggerId),
      exitTriggerId: stage?.exitTriggerId === null || stage?.exitTriggerId === undefined
        ? null
        : String(stage.exitTriggerId),
      checkpointId: stage?.checkpointId === null || stage?.checkpointId === undefined
        ? null
        : String(stage.checkpointId),
      aiZoneIds: NormalizeStringArray(stage?.aiZoneIds),
      beats: sourceBeats.map((beat, beatIndex) => NormalizeMissionBeat(
        beat,
        stageId,
        beatIndex,
        gameplayConfig,
      )),
    };
  });
}

export function ValidateMissionRhythm(source = [], config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const stages = NormalizeMissionRhythm(source, gameplayConfig);
  const errors = [];
  const warnings = [];
  const stageIds = new Set();
  const beatIds = new Set();
  if (stages.length === 0) {
    errors.push({ code: "missingStages", message: "Mission rhythm requires at least one stage." });
  }
  for (const stage of stages) {
    if (stageIds.has(stage.stageId)) {
      errors.push({ code: "duplicateStageId", stageId: stage.stageId });
    }
    stageIds.add(stage.stageId);
    let consecutiveCombatBeats = 0;
    let hasQuietBeat = false;
    for (let beatIndex = 0; beatIndex < stage.beats.length; beatIndex += 1) {
      const beat = stage.beats[beatIndex];
      if (beatIds.has(beat.beatId)) {
        errors.push({ code: "duplicateBeatId", stageId: stage.stageId, beatId: beat.beatId });
      }
      beatIds.add(beat.beatId);
      if (!Object.values(MissionBeatKindIds).includes(beat.kind)) {
        warnings.push({ code: "unknownBeatKind", stageId: stage.stageId, beatId: beat.beatId, kind: beat.kind });
      }
      if (beat.kind === MissionBeatKindIds.QUIET_EXPLORE
        || beat.kind === MissionBeatKindIds.COMPANION_STORY
        || beat.kind === MissionBeatKindIds.AFTERMATH) {
        hasQuietBeat = true;
      }
      if (beat.allowCombat || beat.kind === MissionBeatKindIds.LIMITED_COMBAT) {
        consecutiveCombatBeats += 1;
        if (consecutiveCombatBeats > 2) {
          warnings.push({
            code: "combatFatigueRisk",
            stageId: stage.stageId,
            beatId: beat.beatId,
          });
        }
      } else {
        consecutiveCombatBeats = 0;
      }
      const previousBeat = stage.beats[beatIndex - 1];
      if (previousBeat && Math.abs(previousBeat.intensity - beat.intensity) > 0.72) {
        warnings.push({
          code: "abruptIntensityChange",
          stageId: stage.stageId,
          beatId: beat.beatId,
        });
      }
    }
    if (!hasQuietBeat) {
      warnings.push({ code: "missingRecoveryBeat", stageId: stage.stageId });
    }
  }
  return { valid: errors.length === 0, stages, errors, warnings };
}

export function CreateMissionRhythmState(source = [], options = {}, config = DefaultGameplayConfig) {
  const stages = NormalizeMissionRhythm(source, config);
  const requestedStageIndex = stages.findIndex((stage) => stage.stageId === options.stageId);
  const stageIndex = requestedStageIndex >= 0
    ? requestedStageIndex
    : Clamp(Math.floor(FiniteOr(options.stageIndex, 0)), 0, Math.max(stages.length - 1, 0));
  const stage = stages[stageIndex] ?? null;
  const beatIndex = stage
    ? Clamp(Math.floor(FiniteOr(options.beatIndex, 0)), 0, Math.max(stage.beats.length - 1, 0))
    : 0;
  return {
    stageId: stage?.stageId ?? null,
    stageIndex,
    beatId: stage?.beats[beatIndex]?.beatId ?? null,
    beatIndex,
    beatElapsedSeconds: Math.max(0, FiniteOr(options.beatElapsedSeconds, 0)),
    stageElapsedSeconds: Math.max(0, FiniteOr(options.stageElapsedSeconds, 0)),
    completed: Boolean(options.completed || stages.length === 0),
    revision: Math.max(0, Math.floor(FiniteOr(options.revision, 0))),
  };
}

function IncludesAny(requiredValues, suppliedValues) {
  return requiredValues.some((value) => suppliedValues.has(value));
}

function IncludesAll(requiredValues, suppliedValues) {
  return requiredValues.every((value) => suppliedValues.has(value));
}

function MissionSignalsSatisfied(beat, input) {
  const triggerIds = new Set(NormalizeStringArray(input.triggerIds ?? input.triggerId));
  const eventIds = new Set(NormalizeStringArray(input.eventIds ?? input.eventId));
  const objectiveIds = new Set(NormalizeStringArray(input.objectiveIds ?? input.objectiveId));
  const signalGroups = [
    [beat.advanceTriggerIds, triggerIds],
    [beat.advanceEventIds, eventIds],
    [beat.advanceObjectiveIds, objectiveIds],
  ].filter(([requiredValues]) => requiredValues.length > 0);
  if (signalGroups.length === 0) {
    return false;
  }
  if (beat.requireAllSignals) {
    return signalGroups.every(([requiredValues, suppliedValues]) => IncludesAll(requiredValues, suppliedValues));
  }
  return signalGroups.some(([requiredValues, suppliedValues]) => IncludesAny(requiredValues, suppliedValues));
}

function CreateMissionDirectives(stage, beat, state) {
  if (!stage || !beat) {
    return {
      stageId: null,
      beatId: null,
      kind: null,
      intensity: 0,
      allowCombat: false,
      resourcePressure: 0,
      companionHintId: null,
      progress: 1,
      aiZoneIds: [],
    };
  }
  return {
    stageId: stage.stageId,
    beatId: beat.beatId,
    kind: beat.kind,
    eventId: beat.eventId,
    intensity: beat.intensity,
    allowCombat: beat.allowCombat,
    resourcePressure: beat.resourcePressure,
    companionHintId: beat.companionHintId,
    progress: Clamp01(state.beatElapsedSeconds / Math.max(beat.targetSeconds, 1e-6)),
    targetSeconds: beat.targetSeconds,
    objectiveId: stage.objectiveId,
    aiZoneIds: stage.aiZoneIds.slice(),
  };
}

export function UpdateMissionRhythm(
  rhythmState,
  source = [],
  input = {},
  deltaSeconds = 0,
  config = DefaultGameplayConfig,
) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const stages = NormalizeMissionRhythm(source, gameplayConfig);
  let nextState = CreateMissionRhythmState(stages, rhythmState, gameplayConfig);
  const events = [];
  if (nextState.completed || stages.length === 0) {
    return {
      state: nextState,
      directives: CreateMissionDirectives(null, null, nextState),
      events,
    };
  }

  if (input.stageId && input.stageId !== nextState.stageId) {
    const requestedIndex = stages.findIndex((stage) => stage.stageId === input.stageId);
    if (requestedIndex >= 0) {
      nextState = CreateMissionRhythmState(stages, { stageIndex: requestedIndex }, gameplayConfig);
    }
  }

  const delta = NormalizeDelta(deltaSeconds, 1);
  nextState.beatElapsedSeconds += delta;
  nextState.stageElapsedSeconds += delta;
  let stage = stages[nextState.stageIndex];
  let beat = stage?.beats[nextState.beatIndex];
  const reachedMinimum = nextState.beatElapsedSeconds >= beat.minimumSeconds;
  const hasSignals = MissionSignalsSatisfied(beat, input);
  const hasExplicitRequirements = beat.advanceTriggerIds.length > 0
    || beat.advanceEventIds.length > 0
    || beat.advanceObjectiveIds.length > 0;
  const reachedTargetWithoutRequirement = !hasExplicitRequirements
    && nextState.beatElapsedSeconds >= beat.targetSeconds;
  const reachedMaximum = nextState.beatElapsedSeconds >= beat.maximumSeconds;
  const shouldAdvance = Boolean(input.forceAdvance)
    || (reachedMinimum && hasSignals)
    || reachedTargetWithoutRequirement
    || reachedMaximum;

  if (shouldAdvance) {
    const previousStageId = nextState.stageId;
    const previousBeatId = nextState.beatId;
    if (nextState.beatIndex + 1 < stage.beats.length) {
      nextState.beatIndex += 1;
      nextState.beatElapsedSeconds = 0;
    } else if (nextState.stageIndex + 1 < stages.length) {
      nextState.stageIndex += 1;
      nextState.beatIndex = 0;
      nextState.beatElapsedSeconds = 0;
      nextState.stageElapsedSeconds = 0;
    } else {
      nextState.completed = true;
    }
    nextState.revision += 1;
    stage = stages[nextState.stageIndex] ?? null;
    beat = nextState.completed ? null : stage?.beats[nextState.beatIndex];
    nextState.stageId = nextState.completed ? previousStageId : (stage?.stageId ?? null);
    nextState.beatId = nextState.completed ? null : (beat?.beatId ?? null);
    events.push({
      eventId: GameplayEventIds.MISSION_BEAT_CHANGED,
      previousStageId,
      previousBeatId,
      stageId: nextState.completed ? null : nextState.stageId,
      beatId: nextState.beatId,
      completed: nextState.completed,
      reasonId: input.forceAdvance
        ? "forced"
        : (hasSignals ? "signal" : (reachedMaximum ? "maximumTime" : "targetTime")),
    });
  }
  return {
    state: nextState,
    directives: CreateMissionDirectives(
      nextState.completed ? null : stages[nextState.stageIndex],
      nextState.completed ? null : stages[nextState.stageIndex]?.beats[nextState.beatIndex],
      nextState,
    ),
    events,
  };
}

export function CreateGameplayState(options = {}, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const missionRhythm = NormalizeMissionRhythm(
    options.missionRhythm ?? options.missionStages ?? options.storyStages ?? [],
    gameplayConfig,
  );
  const playerSource = options.player ?? {};
  const player = ClonePlayer({
    ...playerSource,
    inventory: playerSource.inventory ?? options.inventory,
  }, gameplayConfig);
  player.movement = CreateMovementState(playerSource.movement, gameplayConfig);
  return {
    gameplayVersion: GameplayVersion,
    seed: Number(options.seed ?? 1942) >>> 0,
    randomState: Number(options.randomState ?? options.seed ?? 1942) >>> 0,
    timeSeconds: Math.max(0, FiniteOr(options.timeSeconds, 0)),
    player,
    enemies: (Array.isArray(options.enemies) ? options.enemies : []).map((enemy) => (
      CreateEnemyState(enemy, gameplayConfig)
    )),
    companion: options.companion ? CreateCompanionState(options.companion) : null,
    noises: PruneNoises(options.noises, options.timeSeconds, gameplayConfig),
    lures: (Array.isArray(options.lures) ? options.lures : []).map((lure) => ({
      ...lure,
      position: ClonePosition(lure.position),
      velocity: ClonePosition(lure.velocity),
    })),
    missionRhythm,
    missionState: CreateMissionRhythmState(
      missionRhythm,
      options.missionState,
      gameplayConfig,
    ),
  };
}

export function UpdateGameplayState(state, frame = {}, dependencies = {}, config = DefaultGameplayConfig) {
  const gameplayConfig = ResolveGameplayConfig(config);
  const currentState = CreateGameplayState(state, gameplayConfig);
  const simulationRandom = dependencies?.random
    ?? CreateSeededRandom(currentState.randomState || currentState.seed);
  const simulationDependencies = { ...dependencies, random: simulationRandom };
  const delta = NormalizeDelta(frame.delta ?? frame.deltaSeconds);
  const timeSeconds = Number.isFinite(frame.timeSeconds)
    ? frame.timeSeconds
    : currentState.timeSeconds + delta;
  const player = ClonePlayer(frame.player ?? currentState.player, gameplayConfig);
  player.movement = CreateMovementState(
    frame.player?.movement ?? currentState.player.movement,
    gameplayConfig,
  );
  const events = [];
  const generatedNoises = [];
  let movementOutput = null;

  if (frame.movementInput) {
    movementOutput = UpdateMovement(player.movement, {
      ...frame.movementInput,
      actorId: player.playerId,
      position: player.position,
      timeSeconds,
    }, delta, gameplayConfig);
    player.movement = movementOutput.state;
    player.isCrouched = movementOutput.state.stanceId === "crouched";
    player.isSprinting = movementOutput.isSprinting;
    player.speed = movementOutput.speed;
    player.visibilityMultiplier = movementOutput.visibilityMultiplier;
    generatedNoises.push(...movementOutput.noiseEvents);
  }

  const updatedLures = [];
  for (const lure of currentState.lures) {
    const lureResult = UpdateLure(
      lure,
      { ...frame, delta, timeSeconds },
      simulationDependencies,
      gameplayConfig,
    );
    updatedLures.push(lureResult.state);
    generatedNoises.push(...lureResult.noiseEvents);
    events.push(...lureResult.events);
  }
  const noises = PruneNoises([
    ...currentState.noises,
    ...(Array.isArray(frame.noises) ? frame.noises : []),
    ...generatedNoises,
  ], timeSeconds, gameplayConfig);

  const sourceEnemies = Array.isArray(frame.enemies) ? frame.enemies : currentState.enemies;
  const selectedEnemies = SelectAiSimulationSet(sourceEnemies, player.position, gameplayConfig);
  const selectedIds = new Set(selectedEnemies.map((enemy) => String(enemy.enemyId ?? enemy.id ?? "enemy")));
  const enemyResults = [];
  let updatedEnemies = sourceEnemies.map((enemy) => {
    const enemyId = String(enemy.enemyId ?? enemy.id ?? "enemy");
    if (!selectedIds.has(enemyId)) {
      return CreateEnemyState(enemy, gameplayConfig);
    }
    const result = UpdateEnemyAi(enemy, {
      ...frame,
      delta,
      timeSeconds,
      player,
      noises,
    }, simulationDependencies, gameplayConfig);
    enemyResults.push({ enemyId, intent: result.intent, vision: result.vision, hearing: result.hearing });
    events.push(...result.events);
    return result.state;
  });

  const alertEvents = events.filter((event) => event.eventId === GameplayEventIds.ENEMY_ALERT_REQUESTED);
  for (const alertEvent of alertEvents) {
    updatedEnemies = updatedEnemies.map((enemy) => ApplyEnemyAlert(enemy, {
      sourceId: alertEvent.enemyId,
      position: alertEvent.position,
      targetPosition: alertEvent.targetPosition,
      radius: alertEvent.radius,
      intensity: gameplayConfig.enemy.allyAlertIntensity,
    }, gameplayConfig));
  }

  let companion = currentState.companion;
  let companionIntent = null;
  if (companion) {
    const companionResult = UpdateCompanion(companion, {
      ...frame,
      delta,
      timeSeconds,
      player,
      enemies: updatedEnemies,
    }, simulationDependencies, gameplayConfig);
    companion = companionResult.state;
    companionIntent = companionResult.intent;
    events.push(...companionResult.events);
  }

  let missionState = currentState.missionState;
  let missionDirectives = null;
  if (currentState.missionRhythm.length > 0) {
    const missionResult = UpdateMissionRhythm(
      missionState,
      currentState.missionRhythm,
      frame.missionSignals ?? {},
      delta,
      gameplayConfig,
    );
    missionState = missionResult.state;
    missionDirectives = missionResult.directives;
    events.push(...missionResult.events);
  }

  const nextState = {
    ...currentState,
    randomState: typeof simulationRandom.GetState === "function"
      ? simulationRandom.GetState()
      : currentState.randomState,
    timeSeconds,
    player,
    enemies: updatedEnemies,
    companion,
    noises,
    lures: updatedLures,
    missionState,
  };
  return {
    state: nextState,
    movement: movementOutput,
    enemyIntents: enemyResults,
    companionIntent,
    missionDirectives,
    generatedNoises,
    events,
  };
}

function SanitizeSerializable(value, seenObjects = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seenObjects.has(value)) {
    throw new TypeError("Gameplay state contains a circular reference.");
  }
  seenObjects.add(value);
  if (Array.isArray(value)) {
    const result = value
      .map((entry) => SanitizeSerializable(entry, seenObjects))
      .filter((entry) => entry !== undefined);
    seenObjects.delete(value);
    return result;
  }
  const result = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const sanitizedValue = SanitizeSerializable(nestedValue, seenObjects);
    if (sanitizedValue !== undefined) {
      result[key] = sanitizedValue;
    }
  }
  seenObjects.delete(value);
  return result;
}

export function SerializeGameplayState(state) {
  return JSON.stringify({
    saveVersion: GameplayVersion,
    gameplayState: SanitizeSerializable(state),
  });
}

export function DeserializeGameplayState(serializedState, config = DefaultGameplayConfig) {
  const parsed = typeof serializedState === "string"
    ? JSON.parse(serializedState)
    : serializedState;
  if (!IsRecord(parsed) || parsed.saveVersion !== GameplayVersion || !IsRecord(parsed.gameplayState)) {
    throw new TypeError("Unsupported or invalid Ashen Route gameplay save.");
  }
  return CreateGameplayState(parsed.gameplayState, config);
}

export function CreateGameplaySystems(options = {}) {
  const config = CreateGameplayConfig(options.config ?? {});
  const random = ResolveRandom(options.random, options.seed ?? 1942);
  const dependencies = {
    ...(options.dependencies ?? {}),
    random,
  };
  return Object.freeze({
    config,
    random,
    CreateGameplayState: (stateOptions = {}) => CreateGameplayState(stateOptions, config),
    UpdateGameplayState: (state, frame = {}) => {
      if (typeof random.SetState === "function" && Number.isFinite(state?.randomState)) {
        random.SetState(state.randomState);
      }
      return UpdateGameplayState(state, frame, dependencies, config);
    },
    UpdateStamina: (stamina, input = {}, deltaSeconds = 0) => UpdateStamina(stamina, input, deltaSeconds, config),
    UpdateMovement: (movement, input = {}, deltaSeconds = 0) => UpdateMovement(movement, input, deltaSeconds, config),
    EmitNoise: (noiseOptions = {}, timeSeconds = 0) => EmitNoise(noiseOptions, timeSeconds, config),
    EvaluateHearing: (listener, noise, context = {}) => EvaluateHearing(
      listener,
      noise,
      { ...dependencies, ...context },
      config,
    ),
    EvaluateVision: (observer, target, context = {}) => EvaluateVision(
      observer,
      target,
      { ...dependencies, ...context },
      config,
    ),
    UpdateEnemyAi: (enemy, frame = {}) => UpdateEnemyAi(enemy, frame, dependencies, config),
    CanCraft: (inventory, recipeId, amount = 1) => CanCraft(inventory, recipeId, amount, config),
    CraftItem: (inventory, recipeId, amount = 1) => CraftItem(inventory, recipeId, amount, config),
    FireWeapon: (inventory, request = {}) => FireWeapon(
      inventory,
      { ...request, random: request.random ?? random },
      config,
    ),
    ReloadWeapon: (inventory) => ReloadWeapon(inventory, config),
    BeginBandage: (player, inventory = player?.inventory, timeSeconds = 0) => BeginBandage(
      player,
      inventory,
      timeSeconds,
      config,
    ),
    UpdateBandage: (player, inventory = player?.inventory, frame = {}) => UpdateBandage(
      player,
      inventory,
      frame,
      config,
    ),
    ThrowLure: (inventory, request = {}) => ThrowLure(inventory, request, config),
    UpdateLure: (lure, frame = {}) => UpdateLure(lure, frame, dependencies, config),
    UpdateCompanion: (companion, frame = {}) => UpdateCompanion(companion, frame, dependencies, config),
    SerializeGameplayState,
    DeserializeGameplayState: (serializedState) => DeserializeGameplayState(serializedState, config),
  });
}
