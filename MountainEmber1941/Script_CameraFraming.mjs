import { GetTerrainElevation } from "./Script_Rules.mjs";

export const tacticalFramingContract = Object.freeze({
  targetSurfaceClearance: 2.4,
  cameraSurfaceClearance: 10,
  minimumVerticalViewingClearance: 8,
  portraitTopInsetRatio: 0.19,
  portraitBottomInsetRatio: 0.224,
  portraitMinimumTopInset: 160,
  portraitMinimumBottomInset: 189,
  portraitHorizontalInset: 12,
  actorWorldHeight: 1.8,
  minimumActorPixels: 30,
  portraitThreatWeight: 0.12,
});

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function Normalize(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function Dot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function Subtract(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function Cross(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function GetActorPosition(actor, definition) {
  return {
    x: actor.x,
    y: GetTerrainElevation(actor, definition) + (actor.elevated ? 6.7 : 0),
    z: actor.z,
  };
}

export function GetSafeTacticalViewport({
  viewportWidth,
  viewportHeight,
  aspect = viewportWidth / viewportHeight,
  safeInsets,
}) {
  const width = Math.max(1, viewportWidth ?? viewportHeight * aspect);
  const height = Math.max(1, viewportHeight);
  const portrait = aspect < 0.78;
  const defaultInsets = portrait
    ? {
        top: Math.max(
          tacticalFramingContract.portraitMinimumTopInset,
          height * tacticalFramingContract.portraitTopInsetRatio,
        ),
        bottom: Math.max(
          tacticalFramingContract.portraitMinimumBottomInset,
          height * tacticalFramingContract.portraitBottomInsetRatio,
        ),
        left: tacticalFramingContract.portraitHorizontalInset,
        right: tacticalFramingContract.portraitHorizontalInset,
      }
    : { top: 0, bottom: 0, left: 0, right: 0 };
  const insets = { ...defaultInsets, ...(safeInsets ?? {}) };
  return {
    top: Clamp(insets.top, 0, height - 1),
    bottom: Clamp(height - insets.bottom, 1, height),
    left: Clamp(insets.left, 0, width - 1),
    right: Clamp(width - insets.right, 1, width),
    width,
    height,
    portrait,
    insets,
  };
}

/** Projects an authored world point through the same perspective basis used by Three.js. */
export function ProjectTacticalPoint({
  point,
  target,
  direction,
  distance,
  aspect,
  fieldOfView,
  viewportWidth,
  viewportHeight,
}) {
  const height = Math.max(1, viewportHeight);
  const width = Math.max(1, viewportWidth ?? height * aspect);
  const verticalTangent = Math.tan((fieldOfView * Math.PI) / 360);
  const horizontalTangent = verticalTangent * Math.max(0.25, aspect);
  const cameraRight = Normalize(Cross({ x: 0, y: 1, z: 0 }, direction));
  const cameraUp = Normalize(Cross(direction, cameraRight));
  const relative = Subtract(point, target);
  const depth = distance - Dot(relative, direction);
  const ndcX = Dot(relative, cameraRight) / (Math.max(0.001, depth) * horizontalTangent);
  const ndcY = Dot(relative, cameraUp) / (Math.max(0.001, depth) * verticalTangent);
  return {
    screenX: ((ndcX + 1) * width) / 2,
    screenY: ((1 - ndcY) * height) / 2,
    ndcX,
    ndcY,
    depth,
    inViewport: depth > 0 && Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1,
  };
}

function ProjectTacticalActor(actor, target, direction, distance, projection, actorWorldHeight) {
  const foot = ProjectTacticalPoint({ point: actor, target, direction, distance, ...projection });
  const head = ProjectTacticalPoint({
    point: { ...actor, y: actor.y + actorWorldHeight },
    target,
    direction,
    distance,
    ...projection,
  });
  return {
    screenX: (foot.screenX + head.screenX) * 0.5,
    screenY: (foot.screenY + head.screenY) * 0.5,
    top: Math.min(foot.screenY, head.screenY),
    bottom: Math.max(foot.screenY, head.screenY),
    pixelHeight: Math.abs(foot.screenY - head.screenY),
    depth: (foot.depth + head.depth) * 0.5,
    inViewport: foot.inViewport || head.inViewport,
  };
}

function IsActorInsideSafeViewport(actor, safeViewport, minimumActorPixels) {
  return (
    actor.screenX >= safeViewport.left &&
    actor.screenX <= safeViewport.right &&
    actor.top >= safeViewport.top &&
    actor.bottom <= safeViewport.bottom &&
    actor.pixelHeight >= minimumActorPixels
  );
}

/**
 * Computes the first tactical composition without depending on Three.js. Portrait framing rotates
 * around the local encounter so the squad-to-threat axis recedes into screen depth instead of
 * consuming the narrow horizontal field of view.
 */
export function CalculateStartupTacticalFrame({
  definition,
  squadPositions = [],
  fallbackPosition,
  requestedDistance = 60,
  aspect = 1,
  fieldOfView = 44,
  viewportHeight = 844,
  viewportWidth = viewportHeight * aspect,
  safeInsets,
  overviewDirection,
  actorWorldHeight = tacticalFramingContract.actorWorldHeight,
  minimumActorPixels = tacticalFramingContract.minimumActorPixels,
}) {
  const safeFallback = fallbackPosition ?? definition?.playerSpawns?.[0] ?? { x: 0, z: 0 };
  const fallback = GetActorPosition(safeFallback, definition);
  if (squadPositions.length === 0) {
    return {
      target: fallback,
      direction: Normalize(overviewDirection ?? { x: -0.6, y: 0.55, z: -0.58 }),
      distance: requestedDistance,
      actorSpan: 0,
      projectedActorPixels: Number.POSITIVE_INFINITY,
      minimumActorPixels,
      portrait: aspect < 0.78,
      threatIncluded: false,
      safeViewport: GetSafeTacticalViewport({ viewportWidth, viewportHeight, aspect, safeInsets }),
      squadProjections: [],
    };
  }

  const squad = squadPositions.map((actor) => GetActorPosition(actor, definition));
  const squadCenter = squad.reduce(
    (center, point) => ({
      x: center.x + point.x / squad.length,
      y: center.y + point.y / squad.length,
      z: center.z + point.z / squad.length,
    }),
    { x: 0, y: 0, z: 0 },
  );
  const nearestEnemy = (definition?.enemies ?? []).reduce((nearest, enemy) => {
    const distance = Math.hypot(enemy.x - squadCenter.x, enemy.z - squadCenter.z);
    return !nearest || distance < nearest.distance ? { actor: enemy, distance } : nearest;
  }, null);
  const threat = nearestEnemy ? GetActorPosition(nearestEnemy.actor, definition) : squadCenter;
  const portrait = aspect < 0.78;
  const baseDirection = Normalize(overviewDirection ?? { x: -0.6, y: 0.55, z: -0.58 });
  let direction = baseDirection;

  if (portrait && nearestEnemy?.distance > 0.001) {
    const encounterX = threat.x - squadCenter.x;
    const encounterZ = threat.z - squadCenter.z;
    const encounterLength = Math.hypot(encounterX, encounterZ);
    const horizontalMagnitude = Math.hypot(baseDirection.x, baseDirection.z);
    direction = Normalize({
      x: (-encounterX / encounterLength) * horizontalMagnitude,
      y: Math.abs(baseDirection.y),
      z: (-encounterZ / encounterLength) * horizontalMagnitude,
    });
  }

  let threatWeight = portrait ? tacticalFramingContract.portraitThreatWeight : 0.48;
  let target;
  const BuildTarget = (weight) => {
    const candidate = {
      x: squadCenter.x + (threat.x - squadCenter.x) * weight,
      y: squadCenter.y + (threat.y - squadCenter.y) * weight,
      z: squadCenter.z + (threat.z - squadCenter.z) * weight,
    };
    if (!portrait) {
      candidate.x += (fallback.x - candidate.x) * 0.08;
      candidate.y += (fallback.y - candidate.y) * 0.08;
      candidate.z += (fallback.z - candidate.z) * 0.08;
    }
    const surfaceElevation = GetTerrainElevation(candidate, definition);
    candidate.y = Math.max(
      candidate.y,
      surfaceElevation + tacticalFramingContract.targetSurfaceClearance,
    );
    return candidate;
  };
  target = BuildTarget(threatWeight);
  if (!portrait) {
    target = BuildTarget(threatWeight);
  }
  const verticalTangent = Math.tan((fieldOfView * Math.PI) / 360);
  const horizontalTangent = verticalTangent * Math.max(0.25, aspect);
  const worldUp = { x: 0, y: 1, z: 0 };
  const cameraRight = Normalize(Cross(worldUp, direction));
  const cameraUp = Normalize(Cross(direction, cameraRight));
  const horizontalPadding = 3.8;
  const verticalPadding = 3.8;
  let requiredDistance = requestedDistance;
  if (!portrait) {
    for (const point of [...squad, threat]) {
      const relative = Subtract(point, target);
      const depthOffset = Dot(relative, direction);
      requiredDistance = Math.max(
        requiredDistance,
        depthOffset + (Math.abs(Dot(relative, cameraRight)) + horizontalPadding) / horizontalTangent,
        depthOffset + (Math.abs(Dot(relative, cameraUp)) + verticalPadding) / verticalTangent,
      );
    }
  }

  const scale = 1.08;
  const maximumDistance = portrait ? 72 : 136;
  let distance = portrait ? requestedDistance : Clamp(requiredDistance * scale, requestedDistance, maximumDistance);
  const projection = { aspect, fieldOfView, viewportWidth, viewportHeight };
  const safeViewport = GetSafeTacticalViewport({
    viewportWidth,
    viewportHeight,
    aspect,
    safeInsets,
  });
  let squadProjections = squad.map((actor) =>
    ProjectTacticalActor(actor, target, direction, distance, projection, actorWorldHeight),
  );

  // Portrait HUD chrome occupies almost half the canvas. Bias the look target back toward the squad
  // until all four complete 1.8m silhouettes, rather than just their world-space feet, fit between it.
  if (portrait) {
    let best = { target, distance, threatWeight, squadProjections, overflow: Number.POSITIVE_INFINITY };
    for (let weight = tacticalFramingContract.portraitThreatWeight; weight >= -0.001; weight -= 0.01) {
      const candidateTarget = BuildTarget(Math.max(0, weight));
      for (let candidateDistance = requestedDistance; candidateDistance <= maximumDistance; candidateDistance += 0.5) {
        const candidateProjections = squad.map((actor) =>
          ProjectTacticalActor(
            actor,
            candidateTarget,
            direction,
            candidateDistance,
            projection,
            actorWorldHeight,
          ),
        );
        const overflow = candidateProjections.reduce(
          (total, actor) =>
            total +
            Math.max(0, safeViewport.top - actor.top) +
            Math.max(0, actor.bottom - safeViewport.bottom) +
            Math.max(0, safeViewport.left - actor.screenX) +
            Math.max(0, actor.screenX - safeViewport.right) +
            Math.max(0, minimumActorPixels - actor.pixelHeight) * 4,
          0,
        );
        if (overflow < best.overflow) {
          best = {
            target: candidateTarget,
            distance: candidateDistance,
            threatWeight: Math.max(0, weight),
            squadProjections: candidateProjections,
            overflow,
          };
        }
        if (
          candidateProjections.every((actor) =>
            IsActorInsideSafeViewport(actor, safeViewport, minimumActorPixels),
          )
        ) {
          best = {
            target: candidateTarget,
            distance: candidateDistance,
            threatWeight: Math.max(0, weight),
            squadProjections: candidateProjections,
            overflow: 0,
          };
          break;
        }
      }
      if (best.overflow === 0) break;
    }
    ({ target, distance, threatWeight, squadProjections } = best);
  }

  const threatProjection = ProjectTacticalActor(
    threat,
    target,
    direction,
    distance,
    projection,
    actorWorldHeight,
  );
  const projectedActorPixels = Math.min(...squadProjections.map((actor) => actor.pixelHeight));
  const targetSurfaceElevation = GetTerrainElevation(target, definition);
  const threatIncluded = threatProjection.inViewport;
  const threatDirection = threatIncluded
    ? null
    : {
        x: Clamp(threatProjection.screenX, safeViewport.left, safeViewport.right),
        y: Clamp(threatProjection.screenY, safeViewport.top, safeViewport.bottom),
      };

  return {
    target,
    direction,
    distance,
    actorSpan: nearestEnemy?.distance ?? 0,
    projectedActorPixels,
    minimumActorPixels,
    portrait,
    threatIncluded,
    threatId: nearestEnemy?.actor.id ?? null,
    threatWeight,
    threatProjection,
    threatDirection,
    safeViewport,
    squadProjections,
    squadWithinSafeViewport: squadProjections.every((actor) =>
      IsActorInsideSafeViewport(actor, safeViewport, minimumActorPixels),
    ),
    targetSurfaceElevation,
    targetSurfaceClearance: target.y - targetSurfaceElevation,
  };
}
