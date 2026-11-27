// Editor-side Playtest Guide UI: live 2D tactical minimap with player/ally/enemy
// positions & facing directions, current mission target markers & gate checklist,
// and scrollable in-game character dialogue history.
// Purely an editor assistant in AdvancedTools/ — never mutates game or authoring data.

import { CompileEncounters } from "./Script_LevelFlowEncounter.mjs";
import { Clamp, Distance } from "./Script_LevelFlowGeometry.mjs";
import { FlowMapView, Line, Circle, Label, FLOW_COLORS } from "./Script_LevelFlowView.mjs";
import { FLOW_DUSK } from "../Data_Tuning_LevelFlow.mjs";
import { ResolveEncounterMissionArea } from "../Script_EncounterPlayPlan.mjs";
import {
  BuildPlayObjectiveGuide,
  PlayDialogueHistory,
  FormatPlayClock,
  YawCompass,
} from "./Script_LevelFlowPlayGuideModel.mjs";

const Element = (id) => document.getElementById(id);

const MINIMAP_MIN_SCALE = 0.7;
const MINIMAP_MAX_SCALE = 24;
const MINIMAP_DEFAULT_SCALE = 3.4;
const LIVE_POLL_INTERVAL_MS = 66; // ~15 Hz smooth tracking with negligible overhead on 3D Play

const STANCE_LABELS = {
  stand: "站立",
  crouch: "蹲姿",
  kneel: "蹲姿",
  prone: "卧姿",
  wounded: "负伤",
  dead: "阵亡",
  burn: "燃烧",
};

const SIDE_LABELS = {
  player: "玩家",
  friend: "队友",
  enemy: "日军",
  civilian: "平民",
  system: "任务指引",
};

const PLAY_UNIT_COLORS = {
  player: "#f0b429",
  friend: "#2391b0",
  enemy: "#d94334",
  civilian: "#8b6fb8",
};

function DrawDirectionalTriangle(context, tipX, tipY, angle, size, fill, stroke) {
  context.save();
  context.translate(tipX, tipY);
  context.rotate(angle);
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(-size * 0.52, size);
  context.lineTo(size * 0.52, size);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 1.2;
    context.stroke();
  }
  context.restore();
}

function DrawPillLabel(context, text, x, y, {
  bg = "#121815e6",
  border = "#c9ae6888",
  color = "#f6eed8",
  fontSize = 11,
  align = "center",
} = {}) {
  context.save();
  context.font = `600 ${fontSize}px system-ui, "Microsoft YaHei", sans-serif`;
  const textWidth = context.measureText(text).width;
  const padX = 7, height = fontSize + 8, width = textWidth + padX * 2;
  const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  const top = y - height / 2;
  context.beginPath();
  context.roundRect(left, top, width, height, 4);
  context.fillStyle = bg;
  context.fill();
  if (border) {
    context.strokeStyle = border;
    context.lineWidth = 1.2;
    context.stroke();
  }
  context.fillStyle = color;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(text, left + padX, y + 0.5);
  context.restore();
  return [left, top, width, height];
}

class PlayGuideMapView extends FlowMapView {
  constructor(canvas, mapData) {
    super(canvas, mapData);
    this.scale = MINIMAP_DEFAULT_SCALE;
    this.playHits = [];
    this.lastDrawSummary = {
      width: 0,
      height: 0,
      hasPlayerCone: false,
      hasTargetMarker: false,
      entityCount: 0,
    };
  }

  SetMapData(mapData) {
    this.mapData = mapData;
    this.baseKey = "";
    this.baseView = null;
    this.terrainTiles.clear();
  }

  /** Render cached 2D spatial base map + live Play tactical overlay. */
  DrawPlayFrame(guide, baseFrame, options = {}, nowMs = performance.now()) {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width, height = rect.height;
    if (width < 4 || height < 4 || !this.mapData) return false;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }

    const context = this.canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineClip = [-32, -32, width + 32, height + 32];

    const nightStep = Math.round((baseFrame?.nightBlend || 0) * FLOW_DUSK.steps);
    const showAirWalls = options.showAirWalls !== false;
    const key = JSON.stringify([pixelWidth, pixelHeight, baseFrame?.beat?.id || "", baseFrame?.signals || [], nightStep, showAirWalls]);
    let source = key === this.baseKey ? this.BaseSource(width, height, ratio) : null;
    if (!source) {
      const marginX = Math.round(width * 0.25), marginY = Math.round(height * 0.25);
      const baseWidth = width + marginX * 2, baseHeight = height + marginY * 2;
      const basePixelWidth = Math.max(1, Math.round(baseWidth * ratio));
      const basePixelHeight = Math.max(1, Math.round(baseHeight * ratio));
      if (this.baseCanvas.width !== basePixelWidth || this.baseCanvas.height !== basePixelHeight) {
        this.baseCanvas.width = basePixelWidth;
        this.baseCanvas.height = basePixelHeight;
      }
      const bg = this.baseCanvas.getContext("2d");
      bg.setTransform(ratio, 0, 0, ratio, 0, 0);
      bg.lineClip = [-32, -32, baseWidth + 32, baseHeight + 32];
      bg.clearRect(0, 0, basePixelWidth / ratio, basePixelHeight / ratio);
      this.DrawBase(bg, baseWidth, baseHeight, baseFrame, { airWalls: showAirWalls });
      this.baseKey = key;
      this.baseView = { center: [...this.center], scale: this.scale, width: baseWidth, height: baseHeight, ratio };
      source = this.BaseSource(width, height, ratio);
    }

    if (source) context.drawImage(this.baseCanvas, ...source, 0, 0, width, height);
    else context.drawImage(this.baseCanvas, 0, 0, pixelWidth, pixelHeight, 0, 0, width, height);

    const Screen = (point) => [(point[0] - this.center[0]) * this.scale + width / 2, (point[1] - this.center[1]) * this.scale + height / 2];

    // Mainline landmarks (optional toggle)
    this.hits = [];
    this.playHits = [];
    if (options.showLandmarks) {
      this.DrawScreenMarks(context, width, height, { importantLandmarks: true, landmarks: false });
    }

    const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.005);

    // 0. Soft mission-area boundary (dashed amber outline; pulses red while out-of-area warning is active)
    if (showAirWalls && options.softBoundary?.authored && options.softBoundary.polygons?.length) {
      for (const poly of options.softBoundary.polygons) {
        if (!poly.points?.length) continue;
        const pts = poly.points.map((pt) => Screen([pt.x, pt.z]));
        pts.push(pts[0]);
        Line(context, pts, "#1a140958", 3.6, [8, 6]);
        Line(context, pts, options.areaWarning ? "#e44c32ee" : "#db9b24cc", options.areaWarning ? 2.2 : 1.7, [8, 6]);
      }
    }

    // 1. Authored planned route for current beat (high-contrast cased dashed trail)
    if (options.showRoutes && guide.plannedRoute?.length >= 2) {
      const routePts = guide.plannedRoute.map(Screen);
      Line(context, routePts, "#18140d52", 4.2, [7, 5]);
      Line(context, routePts, "#e4a220ee", 2.3, [7, 5]);
      // Draw small directional chevrons along the planned path
      for (let i = 1; i < routePts.length; i++) {
        const a = routePts[i - 1], b = routePts[i];
        const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (segLen < 22) continue;
        const midX = (a[0] + b[0]) * 0.5, midY = (a[1] + b[1]) * 0.5;
        const angle = Math.atan2(b[0] - a[0], -(b[1] - a[1]));
        DrawDirectionalTriangle(context, midX, midY, angle, 6.5, "#e6a728ee", "#1a170e99");
      }
    }

    // 2. Escort exit line (e.g. stretcher corridor exit)
    if (guide.escortExitZ != null) {
      const y = (guide.escortExitZ - this.center[1]) * this.scale + height / 2;
      if (y >= -10 && y <= height + 10) {
        Line(context, [[0, y], [width, y]], "#1f7e96bb", 1.8, [8, 5]);
        DrawPillLabel(context, "担架通过线", width - 48, Clamp(y - 12, 14, height - 14), {
          bg: "#12242be6", border: "#48a6bfaa", color: "#cdeef7", fontSize: 10,
        });
      }
    }

    // 3. Objective area shading & pending incoming combat group areas
    const target = guide.primaryTarget;
    if (target?.area) {
      const tp = Screen(target.area.center);
      const areaColor = target.canInteractNow ? "#22b871" : target.kind === "retreat" ? "#e09d26" : "#1d9c68";
      context.save();
      context.fillStyle = `${areaColor}24`;
      context.strokeStyle = areaColor;
      context.lineWidth = 2;
      context.setLineDash([6, 4]);
      context.beginPath();
      if (target.area.shape === "circle") {
        const radius = Math.max(8, (target.area.size[0] / 2) * this.scale);
        context.arc(tp[0], tp[1], radius, 0, Math.PI * 2);
      } else {
        const rw = Math.max(12, target.area.size[0] * this.scale);
        const rh = Math.max(12, target.area.size[1] * this.scale);
        context.rect(tp[0] - rw / 2, tp[1] - rh / 2, rw, rh);
      }
      context.fill();
      context.stroke();
      context.setLineDash([]);
      context.restore();
    }

    for (const group of guide.pendingGroups || []) {
      if (group.live > 0 || !group.remaining) continue;
      const anchor = group.route?.at(-1) || group.areaCenter;
      if (!anchor) continue;
      // Avoid stacking a duplicate callout directly on top of the primary combat beacon
      if (target?.kind === "combat" && target.point && Distance(anchor, target.point) < 8) continue;
      const gp = Screen(anchor);
      if (gp[0] < -20 || gp[0] > width + 20 || gp[1] < -20 || gp[1] > height + 20) continue;
      context.save();
      context.beginPath();
      context.arc(gp[0], gp[1], 11 + pulse * 4, 0, Math.PI * 2);
      context.strokeStyle = "#d9433499";
      context.lineWidth = 1.6;
      context.setLineDash([4, 3]);
      context.stroke();
      context.setLineDash([]);
      context.restore();
      DrawPillLabel(context, `⚔ ${group.label} (${group.remaining})`, Clamp(gp[0], 64, width - 64), Clamp(gp[1] - 18, 14, height - 14), {
        bg: "#2d1412e0", border: "#d9433499", color: "#ffd2cc", fontSize: 10,
      });
    }

    // 4. Direct guide line from live player to primary objective point
    const playerScreen = Screen([guide.player.x, guide.player.z]);
    if (options.showRoutes && target?.point) {
      const targetScreen = Screen(target.point);
      if (Math.hypot(targetScreen[0] - playerScreen[0], targetScreen[1] - playerScreen[1]) > 14) {
        const guideColor = target.kind === "combat" ? "#d9433499" : target.canInteractNow ? "#22b871cc" : "#d99b1fcc";
        Line(context, [playerScreen, targetScreen], guideColor, 1.6, [3, 4]);
      }
    }

    // 5. Entities: corpses, stealth sight cones, civilians/vehicles, allies, enemies, player
    const occupiedLabels = [];
    let hasPlayerCone = false;

    for (const entity of guide.entities || []) {
      const p = Screen([entity.x, entity.z]);
      const inView = p[0] >= -28 && p[0] <= width + 28 && p[1] >= -28 && p[1] <= height + 28;
      if (!inView) continue;

      const color = PLAY_UNIT_COLORS[entity.side] || FLOW_COLORS[entity.side] || "#888";
      const canvasRot = -(entity.yaw || 0); // maps (0, -1) North -> (-sin(yaw), -cos(yaw))

      // Corpse / Dead unit
      if (!entity.alive && entity.side !== "player") {
        context.save();
        context.strokeStyle = `${color}77`;
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(p[0] - 3.5, p[1] - 3.5); context.lineTo(p[0] + 3.5, p[1] + 3.5);
        context.moveTo(p[0] - 3.5, p[1] + 3.5); context.lineTo(p[0] + 3.5, p[1] - 3.5);
        context.stroke();
        context.restore();
        continue;
      }

      // Stealth vision cone for living enemies during stealth beats
      if (guide.stealthActive && entity.side === "enemy" && entity.alive && entity.kind === "person") {
        const coneR = Clamp(16 * this.scale, 22, 68);
        const halfRad = (55 * Math.PI) / 180;
        context.save();
        context.translate(p[0], p[1]);
        context.rotate(canvasRot);
        const grad = context.createRadialGradient(0, 0, 3, 0, 0, coneR);
        grad.addColorStop(0, "rgba(220, 56, 44, 0.28)");
        grad.addColorStop(1, "rgba(220, 56, 44, 0.02)");
        context.beginPath();
        context.moveTo(0, 0);
        context.arc(0, 0, coneR, -Math.PI / 2 - halfRad, -Math.PI / 2 + halfRad);
        context.closePath();
        context.fillStyle = grad;
        context.fill();
        context.strokeStyle = "rgba(220, 56, 44, 0.34)";
        context.lineWidth = 1;
        context.stroke();
        context.restore();
      }

      // Vehicles (Tank / Cart)
      if (entity.kind === "tank" || entity.kind === "cart") {
        context.save();
        context.translate(p[0], p[1]);
        context.rotate(canvasRot);
        const size = Clamp(this.scale * 1.1, 4.5, 9.5);
        context.fillStyle = entity.pose === "burn" ? "#74432c" : "#61684f";
        context.strokeStyle = entity.side === "enemy" ? "#d94334" : "#6e5c8e";
        context.lineWidth = 1.6;
        context.fillRect(-size, -size * 1.45, size * 2, size * 2.9);
        context.strokeRect(-size, -size * 1.45, size * 2, size * 2.9);
        // Front hull nose arrow
        DrawDirectionalTriangle(context, 0, -size * 1.85, 0, 5, "#f5e6bf", "#1a1f1b");
        if (entity.kind === "tank") {
          const turretRot = -(entity.turretYaw ?? entity.yaw ?? 0) - canvasRot;
          context.rotate(turretRot);
          Circle(context, [0, 0], size * 0.55, "#87856a", "#1e221e");
          Line(context, [[0, 0], [0, -size * 2.0]], "#d94334", 2.2);
        } else {
          Circle(context, [-size - 2, 0], 2.2, color);
          Circle(context, [size + 2, 0], 2.2, color);
        }
        context.restore();
      } else if (entity.kind === "donkey" || entity.kind === "quilt" || entity.kind === "litter") {
        context.save();
        context.translate(p[0], p[1]);
        context.rotate(canvasRot);
        context.fillStyle = color;
        context.strokeStyle = "#f4edd6";
        context.lineWidth = 1.2;
        context.fillRect(-3.2, -5.5, 6.4, 11);
        context.strokeRect(-3.2, -5.5, 6.4, 11);
        DrawDirectionalTriangle(context, 0, -8.5, 0, 4, "#f4edd6", null);
        context.restore();
      } else if (entity.side === "player") {
        // Player FOV vision cone (rotates smoothly with live camera/player yaw)
        const coneLen = Clamp(46, 36, 56);
        const halfFov = ((Clamp(entity.fovDeg || 72, 48, 100) * 0.5) * Math.PI) / 180;
        context.save();
        context.translate(p[0], p[1]);
        context.rotate(canvasRot);
        const grad = context.createRadialGradient(0, 0, 4, 0, 0, coneLen);
        grad.addColorStop(0, "rgba(240, 180, 41, 0.44)");
        grad.addColorStop(0.65, "rgba(240, 180, 41, 0.16)");
        grad.addColorStop(1, "rgba(240, 180, 41, 0.0)");
        context.beginPath();
        context.moveTo(0, 0);
        context.arc(0, 0, coneLen, -Math.PI / 2 - halfFov, -Math.PI / 2 + halfFov);
        context.closePath();
        context.fillStyle = grad;
        context.fill();
        context.strokeStyle = "rgba(240, 180, 41, 0.52)";
        context.lineWidth = 1;
        context.stroke();
        // Crisp directional player chevron
        context.beginPath();
        context.moveTo(0, -10.5);
        context.lineTo(7.5, 7.5);
        context.lineTo(0, 3.8);
        context.lineTo(-7.5, 7.5);
        context.closePath();
        context.fillStyle = entity.alive ? "#f2b629" : "#8b7250";
        context.fill();
        context.strokeStyle = "#111612";
        context.lineWidth = 1.8;
        context.stroke();
        Circle(context, [0, -1.5], 2, "#fff7df");
        context.restore();
        hasPlayerCone = true;
      } else {
        // Humanoid soldier or civilian: directional arrow + body dot + optional target ring
        if (entity.isTarget) {
          context.save();
          context.beginPath();
          context.arc(p[0], p[1], 10 + pulse * 3, 0, Math.PI * 2);
          context.strokeStyle = "#f24838";
          context.lineWidth = 1.8;
          context.stroke();
          context.restore();
        } else if (entity.isWatch) {
          context.save();
          context.beginPath();
          context.arc(p[0], p[1], 9.5, 0, Math.PI * 2);
          context.strokeStyle = "#e0a52c";
          context.lineWidth = 1.5;
          context.setLineDash([3, 2]);
          context.stroke();
          context.setLineDash([]);
          context.restore();
        }

        context.save();
        context.translate(p[0], p[1]);
        context.rotate(canvasRot);
        // Forward facing chevron/pointer extending from the unit disc
        const radius = entity.side === "friend" ? 5.2 : entity.side === "enemy" ? 5.0 : 4.2;
        const tipDist = radius + 8.0;
        context.beginPath();
        context.moveTo(0, -tipDist);
        context.lineTo(4.6, -radius + 1.4);
        context.lineTo(-4.6, -radius + 1.4);
        context.closePath();
        context.fillStyle = color;
        context.fill();
        context.strokeStyle = "#121714";
        context.lineWidth = 1.25;
        context.stroke();

        // Main unit body
        context.beginPath();
        context.arc(0, 0, radius, 0, Math.PI * 2);
        context.fillStyle = color;
        context.fill();
        context.strokeStyle = entity.side === "friend" ? "#f6f2e4" : "#121714";
        context.lineWidth = entity.side === "friend" ? 1.5 : 1.3;
        context.stroke();

        // Heavy / Machine gunner bar
        if (entity.heavy) {
          context.strokeStyle = "#fff3cf";
          context.lineWidth = 1.6;
          context.beginPath();
          context.moveTo(-4, 0); context.lineTo(4, 0);
          context.moveTo(0, -4); context.lineTo(0, 4);
          context.stroke();
        }
        context.restore();
      }

      // Hover hit entry
      const distFromPlayer = entity.side === "player"
        ? 0
        : Distance([guide.player.x, guide.player.z], [entity.x, entity.z]);
      const hoverParts = [
        entity.name,
        SIDE_LABELS[entity.side] || entity.side,
        entity.isTarget ? "任务目标" : null,
        STANCE_LABELS[entity.stance] || null,
        `朝向 ${YawCompass(entity.yaw)}`,
        entity.side !== "player" ? `距 ${Math.round(distFromPlayer)} m` : null,
      ].filter(Boolean);
      this.playHits.push({
        type: "entity",
        id: entity.id,
        screen: p,
        radius: entity.side === "player" ? 12 : 9,
        text: hoverParts.join(" · "),
      });

      // Unit name labels (prioritize named squadmates & civilians, avoid cluttering wave enemies)
      const showLabel = entity.side !== "player"
        && entity.shortName
        && (entity.side === "friend" || entity.side === "civilian" || entity.isTarget);
      if (showLabel) {
        const text = entity.shortName;
        const labelW = text.length * 10 + 8;
        for (const [ox, oy] of [[9, -9], [9, 11], [-labelW - 8, -9], [-labelW - 8, 11]]) {
          const box = [p[0] + ox, p[1] + oy - 7, labelW, 15];
          if (box[0] < 4 || box[0] + box[2] > width - 4 || box[1] < 4 || box[1] + box[3] > height - 4) continue;
          if (occupiedLabels.some((other) => box[0] < other[0] + other[2] && box[0] + box[2] > other[0] && box[1] < other[1] + other[3] && box[1] + box[3] > other[1])) continue;
          occupiedLabels.push(box);
          Label(context, text, box[0], box[1] + 7, entity.side === "friend" ? "#165c72" : entity.side === "enemy" ? "#9c281e" : "#564375", 10.5, true);
          break;
        }
      }
    }

    // 5b. Live incoming artillery warnings & blasts
    for (const strike of options.artillery || []) {
      const sp = Screen(strike.p);
      const outerR = Math.max(8, (strike.radius || 6) * this.scale);
      if (sp[0] + outerR + 40 < 0 || sp[0] - outerR - 40 > width
        || sp[1] + outerR + 40 < 0 || sp[1] - outerR - 40 > height) continue;
      const dodge = strike.role === "dodge";
      if (strike.phase === "blast") {
        const t = Clamp(strike.progress ?? 0, 0, 1);
        context.save();
        context.beginPath();
        context.arc(sp[0], sp[1], outerR * (0.5 + t * 0.8), 0, Math.PI * 2);
        context.strokeStyle = dodge ? `rgba(242, 76, 56, ${((1 - t) * 0.9).toFixed(3)})` : `rgba(240, 162, 62, ${((1 - t) * 0.85).toFixed(3)})`;
        context.lineWidth = 2.2;
        context.stroke();
        context.restore();
        continue;
      }
      const strokeCol = dodge ? "#f04638" : "#e59a2e";
      const fillCol = dodge ? "rgba(240, 70, 56, 0.22)" : "rgba(229, 154, 46, 0.16)";
      if (strike.from) {
        const tail = Screen([
          strike.from[0] + (strike.p[0] - strike.from[0]) * 0.6,
          strike.from[1] + (strike.p[1] - strike.from[1]) * 0.6,
        ]);
        Line(context, [tail, sp], `${strokeCol}99`, 1.4, [4, 3]);
      }
      context.save();
      context.beginPath();
      context.arc(sp[0], sp[1], outerR, 0, Math.PI * 2);
      context.fillStyle = fillCol;
      context.fill();
      context.strokeStyle = strokeCol;
      context.lineWidth = dodge ? 2 : 1.5;
      context.setLineDash([5, 3]);
      context.stroke();
      context.setLineDash([]);
      const innerR = Math.max(2.5, outerR * (1 - Clamp(strike.progress ?? 0, 0, 1)));
      context.beginPath();
      context.arc(sp[0], sp[1], innerR, 0, Math.PI * 2);
      context.strokeStyle = dodge ? "#ff8870" : "#ffd078";
      context.lineWidth = 2;
      context.stroke();
      context.restore();
      const rem = (strike.remainingS ?? 0).toFixed(1);
      DrawPillLabel(context, dodge ? `⚠ 炮弹躲避 ${rem}s` : `炮弹 ${rem}s`, Clamp(sp[0], 56, width - 56), Clamp(sp[1] - outerR - 10, 14, height - 14), {
        bg: dodge ? "#33120fec" : "#2b1c0de6",
        border: strokeCol,
        color: dodge ? "#ffe0d8" : "#ffe7bc",
        fontSize: 10,
      });
    }

    // 6. Primary Mission Objective Beacon (in-view OR edge-clamped off-screen indicator!)
    let hasTargetMarker = false;
    if (target?.point) {
      hasTargetMarker = true;
      const tp = Screen(target.point);
      const pad = 18;
      const inBounds = tp[0] >= pad && tp[0] <= width - pad && tp[1] >= pad && tp[1] <= height - pad;
      const accent = target.canInteractNow
        ? "#24cc7a"
        : target.kind === "combat"
          ? "#f04c3c"
          : target.kind === "retreat"
            ? "#f0a92b"
            : "#e8b434";
      const distText = target.canInteractNow ? "按 F" : `${Math.round(target.distanceM)}m`;
      const pillText = `★ ${target.label} · ${distText}`;

      if (inBounds) {
        // Pulsing beacon ring + diamond core
        context.save();
        context.beginPath();
        context.arc(tp[0], tp[1], 10 + pulse * 6, 0, Math.PI * 2);
        context.strokeStyle = `${accent}aa`;
        context.lineWidth = 2;
        context.stroke();

        context.translate(tp[0], tp[1]);
        context.rotate(Math.PI / 4);
        context.fillStyle = accent;
        context.strokeStyle = "#111612";
        context.lineWidth = 1.8;
        context.fillRect(-5.5, -5.5, 11, 11);
        context.strokeRect(-5.5, -5.5, 11, 11);
        context.restore();

        const labelY = tp[1] > 34 ? tp[1] - 20 : tp[1] + 22;
        DrawPillLabel(context, pillText, Clamp(tp[0], 68, width - 68), labelY, {
          bg: "#121814ec",
          border: accent,
          color: "#fff4d1",
          fontSize: 11,
        });
        this.playHits.push({
          type: "target",
          id: "primaryTarget",
          screen: tp,
          radius: 14,
          text: `${target.label} · 距 ${Math.round(target.distanceM)} m · ${target.relative}（${target.compass}）`,
        });
      } else {
        // Clamp indicator onto viewport border along ray from player (or center) to target
        const originX = Clamp(playerScreen[0], width * 0.25, width * 0.75);
        const originY = Clamp(playerScreen[1], height * 0.25, height * 0.75);
        const dx = tp[0] - originX, dy = tp[1] - originY;
        const maxDx = dx > 0 ? (width - pad - originX) / dx : dx < 0 ? (pad - originX) / dx : Infinity;
        const maxDy = dy > 0 ? (height - pad - originY) / dy : dy < 0 ? (pad - originY) / dy : Infinity;
        const t = Math.max(0, Math.min(maxDx, maxDy));
        const edgeX = Clamp(originX + dx * t, pad, width - pad);
        const edgeY = Clamp(originY + dy * t, pad, height - pad);
        const arrowAngle = Math.atan2(dx, -dy);

        DrawDirectionalTriangle(context, edgeX, edgeY, arrowAngle, 10, accent, "#111612");
        const pillX = Clamp(edgeX - Math.sin(arrowAngle) * 24, 62, width - 62);
        const pillY = Clamp(edgeY + Math.cos(arrowAngle) * 20, 16, height - 16);
        DrawPillLabel(context, `${target.label} ${distText}`, pillX, pillY, {
          bg: "#121814ec",
          border: accent,
          color: "#fff4d1",
          fontSize: 10.5,
        });
      }
    }

    // 7. Compact scale bar & North arrow
    this.DrawScale(context, width, height);
    this.DrawCompass(context, width, height);

    this.lastDrawSummary = {
      width: Math.round(width),
      height: Math.round(height),
      hasPlayerCone,
      hasTargetMarker,
      entityCount: (guide.entities || []).length,
    };
    return true;
  }
}

export class LevelFlowPlayGuide {
  constructor({ getGameFrame, getVariant, refocusGame, onTabChange }) {
    this.getGameFrame = getGameFrame;
    this.getVariant = getVariant;
    this.refocusGame = refocusGame;
    this.onTabChange = onTabChange;

    this.active = false;
    this.playTab = "guide";
    this.dialogueFilter = "all";
    this.follow = true;
    this.showRoutes = true;
    this.showLandmarks = true;
    this.showAirWalls = false;

    this.mapData = null;
    this.mapView = null;
    this.playDocument = null;
    this.compiled = null;
    this.lastState = null;
    this.lastGuide = null;
    this.lastPollAt = 0;
    this.lastElapsed = 0;
    this.wasFailed = false;
    this.renderedDialogueVersion = -1;
    this.renderedFilter = "";
    this.drag = null;

    this.history = new PlayDialogueHistory();

    this.canvas = Element("playGuideMap");
    this.mapWrap = Element("playGuideMapWrap");
    this.tooltip = Element("playMapTooltip");
    this.fullLog = Element("playDialogueFullLog");
    this.badgeEl = Element("playDialogueBadge");
    this.countEl = Element("playDialogueCount");

    this.BindUi();
    this.resizeRaf = 0;
    if (typeof ResizeObserver !== "undefined" && this.mapWrap) {
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.active || this.playTab !== "guide" || this.resizeRaf) return;
        this.resizeRaf = requestAnimationFrame(() => {
          this.resizeRaf = 0;
          if (this.active && this.playTab === "guide") this.Refresh(true);
        });
      });
      this.resizeObserver.observe(this.mapWrap);
    }
  }

  SetMapData(mapData) {
    this.mapData = mapData;
    if (this.mapView) this.mapView.SetMapData(mapData);
    else if (this.canvas && mapData) this.mapView = new PlayGuideMapView(this.canvas, mapData);
  }

  BindUi() {
    const FollowButton = Element("playMapFollow");
    const FitButton = Element("playMapFit");
    const RoutesButton = Element("playMapRoutes");
    const LandmarksButton = Element("playMapLandmarks");
    const AirWallsButton = Element("playMapAirWalls");
    const ZoomInButton = Element("playMapZoomIn");
    const ZoomOutButton = Element("playMapZoomOut");

    if (FollowButton) {
      FollowButton.onclick = () => {
        this.follow = !this.follow;
        this.SyncMapButtons();
        if (this.follow && this.lastGuide?.player && this.mapView) {
          this.mapView.center = [this.lastGuide.player.x, this.lastGuide.player.z];
        }
        this.Refresh(true);
        this.refocusGame?.();
      };
    }
    if (FitButton) {
      FitButton.onclick = () => {
        this.FitObjective();
        this.Refresh(true);
        this.refocusGame?.();
      };
    }
    if (RoutesButton) {
      RoutesButton.onclick = () => {
        this.showRoutes = !this.showRoutes;
        this.SyncMapButtons();
        this.Refresh(true);
        this.refocusGame?.();
      };
    }
    if (LandmarksButton) {
      LandmarksButton.onclick = () => {
        this.showLandmarks = !this.showLandmarks;
        this.SyncMapButtons();
        this.Refresh(true);
        this.refocusGame?.();
      };
    }
    if (AirWallsButton) {
      AirWallsButton.onclick = () => {
        this.showAirWalls = !this.showAirWalls;
        this.SyncMapButtons();
        this.Refresh(true);
        this.refocusGame?.();
      };
    }
    if (ZoomInButton) {
      ZoomInButton.onclick = () => {
        this.ZoomBy(1.35);
        this.refocusGame?.();
      };
    }
    if (ZoomOutButton) {
      ZoomOutButton.onclick = () => {
        this.ZoomBy(1 / 1.35);
        this.refocusGame?.();
      };
    }

    for (const button of document.querySelectorAll("[data-dialogue-filter]")) {
      button.onclick = () => {
        this.dialogueFilter = button.dataset.dialogueFilter || "all";
        for (const item of document.querySelectorAll("[data-dialogue-filter]")) {
          item.setAttribute("aria-pressed", String(item.dataset.dialogueFilter === this.dialogueFilter));
        }
        this.RenderDialogueLogs(true);
      };
    }

    if (this.canvas) {
      this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
      this.canvas.addEventListener("wheel", (event) => {
        if (!this.active || !this.mapView) return;
        event.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const local = [event.clientX - rect.left, event.clientY - rect.top];
        const factor = Math.exp(-event.deltaY * 0.0014);
        const previousScale = this.mapView.scale;
        this.mapView.scale = Clamp(previousScale * factor, MINIMAP_MIN_SCALE, MINIMAP_MAX_SCALE);
        if (!this.follow) {
          const scaleRatio = this.mapView.scale / previousScale;
          const dx = (local[0] - rect.width / 2) / this.mapView.scale;
          const dz = (local[1] - rect.height / 2) / this.mapView.scale;
          this.mapView.center[0] += dx * (scaleRatio - 1);
          this.mapView.center[1] += dz * (scaleRatio - 1);
        }
        this.Refresh(true);
      }, { passive: false });

      this.canvas.addEventListener("pointerdown", (event) => {
        if (!this.active || !this.mapView || event.button !== 0) return;
        const rect = this.canvas.getBoundingClientRect();
        const screen = [event.clientX - rect.left, event.clientY - rect.top];
        this.drag = {
          pointerId: event.pointerId,
          startScreen: screen,
          startCenter: [...this.mapView.center],
          moved: false,
        };
        this.canvas.setPointerCapture(event.pointerId);
        this.canvas.dataset.panning = "true";
        if (this.tooltip) this.tooltip.hidden = true;
      });

      this.canvas.addEventListener("pointermove", (event) => {
        if (!this.active || !this.mapView) return;
        const rect = this.canvas.getBoundingClientRect();
        const screen = [event.clientX - rect.left, event.clientY - rect.top];
        if (this.drag && this.drag.pointerId === event.pointerId) {
          const dx = screen[0] - this.drag.startScreen[0];
          const dy = screen[1] - this.drag.startScreen[1];
          if (Math.hypot(dx, dy) > 3) {
            this.drag.moved = true;
            if (this.follow) {
              this.follow = false;
              this.SyncMapButtons();
            }
            this.mapView.center = [
              this.drag.startCenter[0] - dx / this.mapView.scale,
              this.drag.startCenter[1] - dy / this.mapView.scale,
            ];
            this.Refresh(true);
          }
          return;
        }
        this.UpdateTooltip(screen, rect);
      });

      const EndDrag = (event) => {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        this.drag = null;
        delete this.canvas.dataset.panning;
        this.refocusGame?.();
      };
      this.canvas.addEventListener("pointerup", EndDrag);
      this.canvas.addEventListener("pointercancel", EndDrag);
      this.canvas.addEventListener("pointerleave", () => {
        if (this.tooltip) this.tooltip.hidden = true;
      });
    }
  }

  UpdateTooltip(screen, rect) {
    if (!this.tooltip || !this.mapView) return;
    let best = null, bestDist = Infinity;
    for (const hit of this.mapView.playHits) {
      const d = Math.hypot(hit.screen[0] - screen[0], hit.screen[1] - screen[1]);
      if (d <= hit.radius && d < bestDist) {
        best = hit;
        bestDist = d;
      }
    }
    this.tooltip.hidden = !best;
    if (!best) return;
    this.tooltip.textContent = best.text;
    const tipWidth = Math.min(240, rect.width - 12);
    this.tooltip.style.left = `${Clamp(screen[0] + 12, 6, Math.max(6, rect.width - tipWidth - 6))}px`;
    this.tooltip.style.top = `${Clamp(screen[1] - 32, 6, Math.max(6, rect.height - 34))}px`;
  }

  ZoomBy(factor) {
    if (!this.mapView) return;
    this.mapView.scale = Clamp(this.mapView.scale * factor, MINIMAP_MIN_SCALE, MINIMAP_MAX_SCALE);
    this.Refresh(true);
  }

  FitObjective() {
    if (!this.mapView || !this.lastGuide) return;
    const points = [[this.lastGuide.player.x, this.lastGuide.player.z]];
    if (this.lastGuide.primaryTarget?.point) points.push(this.lastGuide.primaryTarget.point);
    for (const pt of this.lastGuide.plannedRoute || []) points.push(pt);
    for (const entity of this.lastGuide.entities || []) {
      if (entity.isTarget && entity.alive) points.push([entity.x, entity.z]);
    }
    const xs = points.map((p) => p[0]), zs = points.map((p) => p[1]);
    const rect = this.canvas.getBoundingClientRect();
    const minX = Math.min(...xs) - 14, maxX = Math.max(...xs) + 14;
    const minZ = Math.min(...zs) - 14, maxZ = Math.max(...zs) + 14;
    this.mapView.center = [(minX + maxX) / 2, (minZ + maxZ) / 2];
    const spanX = Math.max(24, maxX - minX), spanZ = Math.max(24, maxZ - minZ);
    const fitScale = Math.min((rect.width - 40) / spanX, (rect.height - 40) / spanZ);
    this.mapView.scale = Clamp(fitScale, MINIMAP_MIN_SCALE, 10);
    this.follow = false;
    this.SyncMapButtons();
  }

  SyncMapButtons() {
    const setPressed = (id, value) => {
      const btn = Element(id);
      if (btn) btn.setAttribute("aria-pressed", String(!!value));
    };
    setPressed("playMapFollow", this.follow);
    setPressed("playMapRoutes", this.showRoutes);
    setPressed("playMapLandmarks", this.showLandmarks);
    setPressed("playMapAirWalls", this.showAirWalls);
  }

  Start({ variant, document: playDoc, mapData, startTime = 0 }) {
    this.active = true;
    this.playTab = "guide";
    this.follow = true;
    this.playDocument = structuredClone(playDoc);
    this.compiled = CompileEncounters(this.playDocument, variant.timeline);
    this.lastState = {
      ready: false,
      paused: false,
      failed: false,
      completed: false,
      beat: variant.evaluate(startTime, this.playDocument).beat.id,
      time: startTime,
      timelineTime: startTime,
      elapsed: 0,
      dead: [],
      conditions: [],
      hints: { title: "准备试玩", task: "正在载入战斗场景与人物资源…", hint: "" },
    };
    this.lastElapsed = 0;
    this.wasFailed = false;
    this.lastPollAt = 0;
    this.history = new PlayDialogueHistory({ interactPrompt: variant.playConfig?.ui?.interact || "F · 完成当前交互" });
    this.renderedDialogueVersion = -1;
    if (mapData) this.SetMapData(mapData);
    if (this.mapView) this.mapView.scale = MINIMAP_DEFAULT_SCALE;
    this.SyncMapButtons();
    this.Refresh(true);
  }

  Stop() {
    this.active = false;
    this.playDocument = null;
    this.compiled = null;
    this.lastState = null;
    this.lastGuide = null;
    this.drag = null;
    this.history.Reset();
    this.renderedDialogueVersion = -1;
    if (this.tooltip) this.tooltip.hidden = true;
    if (this.badgeEl) { this.badgeEl.textContent = "0"; this.badgeEl.hidden = true; }
    if (this.countEl) this.countEl.textContent = "0 条";
    this.fullLog?.replaceChildren();
    Element("playChecklist")?.replaceChildren();
    const meta = Element("playObjectiveMeta");
    if (meta) meta.hidden = true;
  }

  SetTab(tab) {
    this.playTab = tab;
    if (this.active && tab === "guide") this.Refresh(true);
    if (this.active && tab === "dialogue") this.RenderDialogueLogs(true);
  }

  OnState(state) {
    if (!this.active) return;
    // Detect checkpoint retry (elapsed jumped backward or recovered from failed state)
    const retried = this.lastState?.ready && state?.ready
      && ((this.wasFailed && !state.failed) || (Number.isFinite(state.elapsed) && state.elapsed + 0.5 < this.lastElapsed));
    if (retried) {
      const variant = this.getVariant?.();
      const beat = variant?.BeatById?.(state.beat);
      this.history.MarkRetry(state.beat, beat?.title || "", state.elapsed || 0);
    }
    this.wasFailed = !!state?.failed;
    if (Number.isFinite(state?.elapsed)) this.lastElapsed = state.elapsed;
    this.lastState = state;
    this.Refresh(true);
  }

  Tick(timestamp) {
    if (!this.active) return;
    if (timestamp - this.lastPollAt < LIVE_POLL_INTERVAL_MS) return;
    this.lastPollAt = timestamp;
    // Avoid 15 Hz Canvas2D minimap redraws on the shared main thread while Play is still booting.
    if (!this.lastState?.ready && !this.ReadLiveRuntime()?.state?.ready) return;
    this.Refresh(false, timestamp);
  }

  ReadLiveRuntime() {
    const frame = this.getGameFrame?.();
    let game = null;
    try { game = frame?.contentWindow?.Tengxian || null; } catch { game = null; }
    const api = game?.Debug?.EncounterPlay || null;
    if (!api) return null;
    const state = api.State();
    if (!state?.ready) return { state, player: null, liveActors: [], soldiersById: null, puppets: [] };
    const p = game.player;
    const cam = game.camera;
    let fovDeg = 72;
    if (cam && Number.isFinite(cam.fov) && Number.isFinite(cam.aspect)) {
      const vRad = (cam.fov * Math.PI) / 180;
      fovDeg = (2 * Math.atan(Math.tan(vRad * 0.5) * cam.aspect) * 180) / Math.PI;
    }
    const player = p ? {
      x: p.position.x,
      z: p.position.z,
      yaw: p.yaw,
      stance: p.stance,
      alive: p.Alive,
      fovDeg,
    } : null;
    const soldiersById = new Map((game.ai?.soldiers || []).map((soldier) => [soldier.id, soldier]));
    const liveActors = api.Actors?.() || state.actors || [];
    const puppets = api.Presentation?.() || [];
    return { state, player, liveActors, soldiersById, puppets };
  }

  Refresh(force = false, nowMs = performance.now()) {
    if (!this.active) return;
    const variant = this.getVariant?.();
    if (!variant || !this.playDocument) return;

    const live = this.ReadLiveRuntime();
    const state = live?.state || this.lastState;
    if (!state) return;

    // Detect retry even between postMessage updates
    if (live?.state?.ready && this.lastState?.ready) {
      const retried = (this.wasFailed && !live.state.failed)
        || (Number.isFinite(live.state.elapsed) && live.state.elapsed + 0.5 < this.lastElapsed);
      if (retried) {
        const beat = variant.BeatById(live.state.beat);
        this.history.MarkRetry(live.state.beat, beat?.title || "", live.state.elapsed || 0);
      }
      this.wasFailed = !!live.state.failed;
      if (Number.isFinite(live.state.elapsed)) this.lastElapsed = live.state.elapsed;
      this.lastState = live.state;
    }

    const authoredFrame = variant.evaluate(state.time ?? state.timelineTime ?? 0, this.playDocument);
    const guide = BuildPlayObjectiveGuide({
      variant,
      compiled: this.compiled,
      state,
      player: live?.player || null,
      liveActors: live?.liveActors || [],
      soldiersById: live?.soldiersById || null,
      puppets: live?.puppets || [],
      authoredFrame,
    });
    this.lastGuide = guide;

    // Ingest dialogue lines into editor-side history
    const lines = state.dialogue?.lines || [];
    const sideByActorId = new Map(guide.entities.map((entity) => [entity.id, entity.side]));
    for (const actor of authoredFrame.actors || []) {
      if (!sideByActorId.has(actor.id)) sideByActorId.set(actor.id, actor.side);
    }
    this.history.Ingest({
      beatId: guide.beatId,
      beatTitle: guide.beatTitle,
      elapsed: state.elapsed || 0,
      lines,
      sideByActorId,
    });

    this.RenderStatusCard(state, guide);
    this.RenderDialogueLogs(force);

    // Draw 2D tactical map when visible
    const paneVisible = !Element("playGuidePane")?.hidden;
    if (paneVisible && this.mapView) {
      if (this.follow) {
        this.mapView.center = [guide.player.x, guide.player.z];
      }
      const baseFrame = {
        beat: authoredFrame.beat,
        signals: state.signals?.length ? state.signals : authoredFrame.signals,
        customSignals: true,
        nightBlend: authoredFrame.nightBlend,
      };
      const softBoundary = ResolveEncounterMissionArea(authoredFrame.beat, variant, this.compiled);
      this.mapView.DrawPlayFrame(guide, baseFrame, {
        showRoutes: this.showRoutes,
        showLandmarks: this.showLandmarks,
        showAirWalls: this.showAirWalls,
        softBoundary,
        areaWarning: !!state.missionArea?.warning,
        artillery: state.artillery || [],
      }, nowMs);
    }
  }

  RenderStatusCard(state, guide) {
    const statusBox = Element("playStatus");
    if (!statusBox) return;
    statusBox.hidden = false;
    statusBox.dataset.kind = guide.statusKind;

    const titleEl = Element("playStatusTitle");
    const badgeEl = Element("playStatusBadge");
    const taskEl = Element("playStatusTask");
    const hintEl = Element("playStatusHint");
    const metaEl = Element("playObjectiveMeta");
    const bearingEl = Element("playTargetBearing");
    const distEl = Element("playTargetDistance");
    const summaryEl = Element("playMapUnitSummary");
    const listEl = Element("playChecklist");

    const titleText = (state.paused ? "已暂停 · " : "") + (state.hints?.title || `${guide.beatId.toUpperCase()} · ${guide.beatTitle}`);
    if (titleEl && titleEl.textContent !== titleText) titleEl.textContent = titleText;
    if (badgeEl) {
      if (badgeEl.textContent !== guide.statusBadge) badgeEl.textContent = guide.statusBadge;
      if (badgeEl.dataset.kind !== guide.statusKind) badgeEl.dataset.kind = guide.statusKind;
    }
    const taskText = state.hints?.task || "";
    if (taskEl && taskEl.textContent !== taskText) taskEl.textContent = taskText;
    const hintText = state.hints?.hint || "";
    const redundantReachHint = !!guide.primaryTarget && !state.failed && !state.completed && !state.paused
      && /^前往目标\s+\d+\s*m$/.test(hintText.trim());
    if (hintEl) {
      if (hintEl.textContent !== hintText) hintEl.textContent = hintText;
      hintEl.hidden = !hintText || redundantReachHint;
    }

    if (metaEl && bearingEl && distEl) {
      const target = guide.primaryTarget;
      const showMeta = !!target && !state.failed && !state.completed && state.ready;
      metaEl.hidden = !showMeta;
      if (showMeta) {
        const bearingText = target.canInteractNow
          ? `${target.label} · 已就位`
          : `${target.compass} · ${target.relative}`;
        const distText = target.canInteractNow ? "按 F" : `${Math.round(target.distanceM)} m`;
        if (bearingEl.textContent !== bearingText) bearingEl.textContent = bearingText;
        if (distEl.textContent !== distText) distEl.textContent = distText;
        metaEl.dataset.urgent = String(!!target.canInteractNow);
      }
    }

    if (summaryEl) {
      const summary = `友 ${guide.counts.allies} · 敌 ${guide.counts.enemies}`;
      if (summaryEl.textContent !== summary) summaryEl.textContent = summary;
    }

    if (listEl) {
      const checkKey = JSON.stringify(guide.checklist);
      if (checkKey !== this.lastChecklistKey) {
        this.lastChecklistKey = checkKey;
        listEl.replaceChildren();
        for (const item of guide.checklist) {
          const li = document.createElement("li");
          li.className = "lfPlayCheckItem";
          li.dataset.done = String(!!item.done);
          li.dataset.urgent = String(!!item.urgent);
          li.dataset.kind = item.kind;
          const icon = document.createElement("span");
          icon.className = "lfPlayCheckIcon";
          icon.textContent = item.done ? "✓" : item.kind === "stealth" ? "!" : item.urgent ? "▶" : "○";
          const body = document.createElement("div");
          const label = document.createElement("strong");
          label.textContent = item.label;
          const detail = document.createElement("small");
          detail.textContent = item.detail;
          body.append(label, detail);
          li.append(icon, body);
          listEl.append(li);
        }
      }
    }
  }

  RenderDialogueLogs(force = false) {
    if (!force && this.history.version === this.renderedDialogueVersion && this.dialogueFilter === this.renderedFilter) {
      return;
    }
    this.renderedDialogueVersion = this.history.version;
    this.renderedFilter = this.dialogueFilter;

    const total = this.history.LineCount();
    const filteredEntries = this.history.Filtered(this.dialogueFilter);
    const filteredCount = filteredEntries.filter((entry) => entry.kind === "line").length;
    if (this.badgeEl) {
      this.badgeEl.textContent = String(total);
      this.badgeEl.hidden = total === 0;
    }
    if (this.countEl) {
      this.countEl.textContent = this.dialogueFilter === "all" ? `${total} 条` : `${filteredCount} / ${total} 条`;
    }

    const RenderInto = (container, entries, emptyText) => {
      if (!container) return;
      const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 32;
      container.replaceChildren();
      if (!entries.length) {
        const empty = document.createElement("p");
        empty.className = "lfDialogueEmpty";
        empty.textContent = emptyText;
        container.append(empty);
        return;
      }
      for (const entry of entries) {
        if (entry.kind === "beat" || entry.kind === "divider") {
          const divider = document.createElement("div");
          divider.className = entry.kind === "divider" ? "lfDialogueDivider lfDialogueRetry" : "lfDialogueDivider";
          divider.textContent = entry.text;
          container.append(divider);
          continue;
        }
        const row = document.createElement("article");
        row.className = "lfDialogueEntry";
        row.dataset.side = entry.side;
        row.dataset.order = String(!!entry.order);
        row.dataset.active = String(this.history.activeKeys.has(entry.key));
        const head = document.createElement("div");
        head.className = "lfDialogueEntryHead";
        const speaker = document.createElement("strong");
        speaker.className = "lfDialogueSpeaker";
        speaker.textContent = entry.name;
        const tag = document.createElement("span");
        tag.className = "lfDialogueTag";
        tag.textContent = entry.order ? "· 指引" : "· 对白";
        const meta = document.createElement("time");
        meta.textContent = `${entry.beatId.toUpperCase()} · ${FormatPlayClock(entry.elapsed)}`;
        head.append(speaker, tag, meta);
        const body = document.createElement("p");
        body.className = "lfDialogueText";
        body.textContent = entry.text;
        row.append(head, body);
        container.append(row);
      }
      if (wasNearBottom) container.scrollTop = container.scrollHeight;
    };

    RenderInto(this.fullLog, filteredEntries, "进入战斗后，人物对白与任务指引会实时记录在这里。");
  }

  Inspect() {
    const guide = this.lastGuide;
    return {
      active: this.active,
      tab: this.playTab,
      follow: this.follow,
      showRoutes: this.showRoutes,
      showLandmarks: this.showLandmarks,
      showAirWalls: this.showAirWalls,
      scale: this.mapView?.scale ?? null,
      center: this.mapView?.center ? [...this.mapView.center] : null,
      beatId: guide?.beatId ?? null,
      statusKind: guide?.statusKind ?? null,
      statusBadge: guide?.statusBadge ?? null,
      player: guide?.player ?? null,
      primaryTarget: guide?.primaryTarget ?? null,
      counts: guide?.counts ?? null,
      checklist: guide?.checklist ?? [],
      entities: (guide?.entities || []).map((e) => ({
        id: e.id, name: e.name, side: e.side, kind: e.kind, x: e.x, z: e.z, yaw: e.yaw, alive: e.alive, isTarget: e.isTarget,
      })),
      dialogue: this.history.Snapshot(),
      mapDraw: this.mapView?.lastDrawSummary ?? null,
    };
  }
}
