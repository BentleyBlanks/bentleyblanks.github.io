import { WORLD_SIZE, WEAPON_DATA } from "./Script_Simulation.mjs";

const terrainColors = ["#21342b", "#24382e", "#1e3028", "#293b31"];
const roofColors = ["#6d7466", "#776d5f", "#58645c", "#7a7d6e"];
const treeColors = ["#334a37", "#294033", "#3c513a", "#243a2e"];
const lootColors = {
  weapon: "#d8ff72",
  ammo: "#ffc064",
  armor: "#72c4ff",
  medkit: "#ff766d",
};

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function Lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function SmoothStep(value) {
  const clampedValue = Clamp(value, 0, 1);
  return clampedValue * clampedValue * (3 - 2 * clampedValue);
}

function Distance(firstX, firstY, secondX, secondY) {
  return Math.hypot(firstX - secondX, firstY - secondY);
}

function HashCell(first, second, seed = 0) {
  let value = Math.imul((first + 41) | 0, 374761393) ^ Math.imul((second + 71) | 0, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function FormatWeaponName(weaponId) {
  return WEAPON_DATA[weaponId]?.displayName ?? "Unarmed";
}

function RoundRect(context, pointX, pointY, width, height, radius) {
  const cornerRadius = Math.min(radius, width * 0.5, height * 0.5);
  context.beginPath();
  context.roundRect(pointX, pointY, width, height, cornerRadius);
}

export class BattleRenderer {
  constructor(options) {
    this.canvas = options.canvas;
    this.minimapCanvas = options.minimapCanvas;
    this.fullMapCanvas = options.fullMapCanvas;
    this.context = this.canvas.getContext("2d", { alpha: false });
    this.minimapContext = this.minimapCanvas?.getContext("2d") ?? null;
    this.fullMapContext = this.fullMapCanvas?.getContext("2d") ?? null;
    this.view = null;
    this.camera = { x: WORLD_SIZE * 0.5, y: WORLD_SIZE * 0.5, zoom: 2.5, shakeX: 0, shakeY: 0 };
    this.pointer = { x: 0, y: 0, worldX: WORLD_SIZE * 0.5, worldY: WORLD_SIZE * 0.5, active: false };
    this.viewportWidth = 1;
    this.viewportHeight = 1;
    this.pixelRatio = 1;
    this.mapSignature = "";
    this.lastMinimapTime = -Infinity;
    this.lastEventId = 0;
    this.tracers = [];
    this.particles = [];
    this.lastPlayerHealth = 100;
    this.damageFlash = 0;
    this.cameraShake = 0;
    this.shakeEnabled = true;
    this.reducedMotion = false;
    this.Resize();
  }

  SetPreferences(preferences = {}) {
    this.shakeEnabled = preferences.shake !== false;
    this.reducedMotion = preferences.reducedMotion === true;
  }

  SetView(view) {
    if (!view) return;
    const previousView = this.view;
    this.view = view;
    if (!previousView || previousView.seed !== view.seed) {
      this.mapSignature = "";
      this.lastEventId = 0;
      this.tracers.length = 0;
      this.particles.length = 0;
      this.lastPlayerHealth = view.player?.health ?? 100;
      this.camera.x = view.player?.x ?? WORLD_SIZE * 0.5;
      this.camera.y = view.player?.y ?? WORLD_SIZE * 0.5;
    }
    this.ConsumeEvents();
    if (view.player && view.player.health < this.lastPlayerHealth - 0.1) {
      this.damageFlash = Math.min(1, this.damageFlash + (this.lastPlayerHealth - view.player.health) / 35 + .18);
      if (this.shakeEnabled && !this.reducedMotion) {
        this.cameraShake = Math.min(14, this.cameraShake + 5.5);
      }
    }
    this.lastPlayerHealth = view.player?.health ?? this.lastPlayerHealth;
  }

  Resize() {
    const bounds = this.canvas.getBoundingClientRect();
    this.viewportWidth = Math.max(1, bounds.width);
    this.viewportHeight = Math.max(1, bounds.height);
    this.pixelRatio = Clamp(globalThis.devicePixelRatio || 1, 1, 2);
    const targetWidth = Math.round(this.viewportWidth * this.pixelRatio);
    const targetHeight = Math.round(this.viewportHeight * this.pixelRatio);
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.context.imageSmoothingEnabled = true;
  }

  SetPointer(clientX, clientY, active = true) {
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.x = clientX - bounds.left;
    this.pointer.y = clientY - bounds.top;
    this.pointer.active = active;
    const worldPoint = this.ScreenToWorld(this.pointer.x, this.pointer.y);
    this.pointer.worldX = worldPoint.x;
    this.pointer.worldY = worldPoint.y;
  }

  ScreenToWorld(screenX, screenY) {
    return {
      x: this.camera.x + (screenX - this.viewportWidth * .5 - this.camera.shakeX) / this.camera.zoom,
      y: this.camera.y + (screenY - this.viewportHeight * .5 - this.camera.shakeY) / this.camera.zoom,
    };
  }

  WorldToScreen(worldX, worldY) {
    return {
      x: (worldX - this.camera.x) * this.camera.zoom + this.viewportWidth * .5 + this.camera.shakeX,
      y: (worldY - this.camera.y) * this.camera.zoom + this.viewportHeight * .5 + this.camera.shakeY,
    };
  }

  IsVisible(worldX, worldY, padding = 20) {
    const point = this.WorldToScreen(worldX, worldY);
    return point.x >= -padding && point.x <= this.viewportWidth + padding && point.y >= -padding && point.y <= this.viewportHeight + padding;
  }

  UpdateCamera(deltaTime) {
    const player = this.view?.player;
    let targetX = player?.x ?? WORLD_SIZE * .5;
    let targetY = player?.y ?? WORLD_SIZE * .5;
    let altitude = player?.z ?? 0;
    if (player?.status === "plane" && this.view?.plane) {
      targetX = this.view.plane.x;
      targetY = this.view.plane.y;
      altitude = this.view.plane.altitude;
    }
    if (!player && this.view?.plane) {
      targetX = this.view.plane.x;
      targetY = this.view.plane.y;
    }
    const minimumDimension = Math.min(this.viewportWidth, this.viewportHeight);
    const groundZoom = Clamp(minimumDimension / 175, 2.4, 5.1);
    const altitudeRatio = SmoothStep(altitude / 310);
    const targetZoom = Lerp(groundZoom, .58, altitudeRatio);
    const tracking = 1 - Math.exp(-deltaTime * (altitude > 1 ? 3.2 : 8));
    this.camera.x = Lerp(this.camera.x, targetX, tracking);
    this.camera.y = Lerp(this.camera.y, targetY, tracking);
    this.camera.zoom = Lerp(this.camera.zoom, targetZoom, 1 - Math.exp(-deltaTime * 3.6));
    this.camera.x = Clamp(this.camera.x, -180, WORLD_SIZE + 180);
    this.camera.y = Clamp(this.camera.y, -180, WORLD_SIZE + 180);

    if (this.cameraShake > .01 && this.shakeEnabled && !this.reducedMotion) {
      this.camera.shakeX = (Math.random() - .5) * this.cameraShake;
      this.camera.shakeY = (Math.random() - .5) * this.cameraShake;
      this.cameraShake *= Math.exp(-deltaTime * 9);
    } else {
      this.camera.shakeX = 0;
      this.camera.shakeY = 0;
      this.cameraShake = 0;
    }
    if (this.pointer.active) {
      const worldPoint = this.ScreenToWorld(this.pointer.x, this.pointer.y);
      this.pointer.worldX = worldPoint.x;
      this.pointer.worldY = worldPoint.y;
    }
  }

  ConsumeEvents() {
    if (!this.view?.recentEvents) return;
    const actorById = new Map(this.view.actors.map((actor) => [actor.id, actor]));
    for (const event of this.view.recentEvents) {
      if (event.id <= this.lastEventId) continue;
      this.lastEventId = Math.max(this.lastEventId, event.id);
      if (event.type === "shotHit") {
        const source = actorById.get(event.actorId);
        const target = actorById.get(event.targetId);
        if (source && target) {
          this.tracers.push({ x1: source.x, y1: source.y, x2: target.x, y2: target.y, life: .16, hit: true });
          for (let index = 0; index < 7; index += 1) {
            const angle = HashCell(event.id, index) * Math.PI * 2;
            const speed = 4 + HashCell(index, event.id, 19) * 10;
            this.particles.push({
              x: target.x,
              y: target.y,
              velocityX: Math.cos(angle) * speed,
              velocityY: Math.sin(angle) * speed,
              life: .34 + HashCell(index, event.id, 81) * .18,
              maximumLife: .52,
              color: "#ffb45f",
              size: .55,
            });
          }
          if (event.actorId === this.view.player?.id && this.shakeEnabled && !this.reducedMotion) {
            this.cameraShake = Math.min(9, this.cameraShake + 2.3);
          }
        }
      }
      if (event.type === "actorEliminated") {
        const victim = actorById.get(event.victimId);
        if (victim) {
          for (let index = 0; index < 13; index += 1) {
            const angle = HashCell(event.id, index, 33) * Math.PI * 2;
            const speed = 6 + HashCell(index, event.id, 43) * 15;
            this.particles.push({
              x: victim.x,
              y: victim.y,
              velocityX: Math.cos(angle) * speed,
              velocityY: Math.sin(angle) * speed,
              life: .5 + HashCell(index, event.id, 71) * .35,
              maximumLife: .85,
              color: "#ff655c",
              size: .72,
            });
          }
        }
      }
      if (event.type === "lootPickedUp" && event.actorId === this.view.player?.id) {
        const player = this.view.player;
        if (player) {
          for (let index = 0; index < 8; index += 1) {
            const angle = index / 8 * Math.PI * 2;
            this.particles.push({
              x: player.x,
              y: player.y,
              velocityX: Math.cos(angle) * 5,
              velocityY: Math.sin(angle) * 5,
              life: .35,
              maximumLife: .35,
              color: "#d8ff72",
              size: .42,
            });
          }
        }
      }
    }
    if (this.tracers.length > 80) this.tracers.splice(0, this.tracers.length - 80);
    if (this.particles.length > 240) this.particles.splice(0, this.particles.length - 240);
  }

  UpdateEffects(deltaTime) {
    for (const tracer of this.tracers) tracer.life -= deltaTime;
    this.tracers = this.tracers.filter((tracer) => tracer.life > 0);
    for (const particle of this.particles) {
      particle.life -= deltaTime;
      particle.x += particle.velocityX * deltaTime;
      particle.y += particle.velocityY * deltaTime;
      particle.velocityX *= Math.exp(-deltaTime * 4);
      particle.velocityY *= Math.exp(-deltaTime * 4);
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    this.damageFlash = Math.max(0, this.damageFlash - deltaTime * 1.9);
  }

  Render(timestamp = performance.now(), deltaTime = 1 / 60) {
    this.Resize();
    this.UpdateCamera(deltaTime);
    this.UpdateEffects(deltaTime);
    const context = this.context;
    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    context.clearRect(0, 0, this.viewportWidth, this.viewportHeight);
    context.fillStyle = "#0c1815";
    context.fillRect(0, 0, this.viewportWidth, this.viewportHeight);
    if (!this.view) {
      this.RenderLoadingBackground(timestamp);
      return;
    }
    this.RenderGround(timestamp);
    this.RenderWorldBounds();
    this.RenderRoads();
    this.RenderZoneMask();
    this.RenderLoot(timestamp);
    this.RenderWorldObjects();
    this.RenderPlane(timestamp);
    this.RenderActors(timestamp);
    this.RenderEffects();
    this.RenderZoneLines(timestamp);
    this.RenderAimReticle();
    this.RenderScreenEffects();
    if (timestamp - this.lastMinimapTime >= 90) {
      this.RenderMinimap();
      this.lastMinimapTime = timestamp;
    }
  }

  RenderLoadingBackground(timestamp) {
    const context = this.context;
    context.fillStyle = "#14241f";
    context.fillRect(0, 0, this.viewportWidth, this.viewportHeight);
    context.strokeStyle = "rgba(216,255,114,.05)";
    context.lineWidth = 1;
    const spacing = 56;
    const offset = (timestamp * .006) % spacing;
    for (let pointX = -spacing + offset; pointX < this.viewportWidth + spacing; pointX += spacing) {
      context.beginPath();
      context.moveTo(pointX, 0);
      context.lineTo(pointX, this.viewportHeight);
      context.stroke();
    }
    for (let pointY = -spacing + offset; pointY < this.viewportHeight + spacing; pointY += spacing) {
      context.beginPath();
      context.moveTo(0, pointY);
      context.lineTo(this.viewportWidth, pointY);
      context.stroke();
    }
  }

  RenderGround(timestamp) {
    const context = this.context;
    const topLeft = this.ScreenToWorld(0, 0);
    const bottomRight = this.ScreenToWorld(this.viewportWidth, this.viewportHeight);
    const cellSize = 40;
    const minimumCellX = Math.floor(topLeft.x / cellSize) - 1;
    const maximumCellX = Math.ceil(bottomRight.x / cellSize) + 1;
    const minimumCellY = Math.floor(topLeft.y / cellSize) - 1;
    const maximumCellY = Math.ceil(bottomRight.y / cellSize) + 1;
    for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
        const point = this.WorldToScreen(cellX * cellSize, cellY * cellSize);
        const shade = Math.floor(HashCell(cellX, cellY, 17) * terrainColors.length);
        context.fillStyle = terrainColors[shade];
        context.fillRect(point.x, point.y, cellSize * this.camera.zoom + 1, cellSize * this.camera.zoom + 1);
        const contour = HashCell(cellX, cellY, 62);
        if (contour > .64 && this.camera.zoom > 1.1) {
          context.strokeStyle = `rgba(188,208,180,${.018 + contour * .025})`;
          context.lineWidth = 1;
          context.beginPath();
          const middleY = point.y + cellSize * this.camera.zoom * (.25 + contour * .48);
          context.moveTo(point.x, middleY);
          context.bezierCurveTo(
            point.x + cellSize * this.camera.zoom * .33,
            middleY - 4,
            point.x + cellSize * this.camera.zoom * .68,
            middleY + 5,
            point.x + cellSize * this.camera.zoom,
            middleY,
          );
          context.stroke();
        }
      }
    }
    const sunStrength = .025 + Math.sin(timestamp * .00008) * .004;
    const gradient = context.createRadialGradient(this.viewportWidth * .78, this.viewportHeight * .12, 0, this.viewportWidth * .78, this.viewportHeight * .12, this.viewportWidth * .75);
    gradient.addColorStop(0, `rgba(242,220,155,${sunStrength})`);
    gradient.addColorStop(1, "rgba(2,9,8,.12)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, this.viewportWidth, this.viewportHeight);
  }

  RenderWorldBounds() {
    const context = this.context;
    const topLeft = this.WorldToScreen(0, 0);
    const bottomRight = this.WorldToScreen(WORLD_SIZE, WORLD_SIZE);
    context.save();
    context.fillStyle = "rgba(2,8,8,.72)";
    context.beginPath();
    context.rect(0, 0, this.viewportWidth, this.viewportHeight);
    context.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    context.fill("evenodd");
    context.strokeStyle = "rgba(216,255,114,.32)";
    context.lineWidth = 1;
    context.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    context.restore();
  }

  RenderRoads() {
    const context = this.context;
    context.save();
    context.lineCap = "round";
    for (const road of this.view.map.roads) {
      const start = this.WorldToScreen(road.x1, road.y1);
      const end = this.WorldToScreen(road.x2, road.y2);
      context.strokeStyle = "rgba(15,24,22,.72)";
      context.lineWidth = road.width * this.camera.zoom + 3;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
      context.strokeStyle = "rgba(114,118,103,.45)";
      context.lineWidth = road.width * this.camera.zoom;
      context.stroke();
      if (this.camera.zoom > 1.5) {
        context.strokeStyle = "rgba(226,213,167,.16)";
        context.lineWidth = Math.max(1, this.camera.zoom * .22);
        context.setLineDash([4 * this.camera.zoom, 7 * this.camera.zoom]);
        context.stroke();
        context.setLineDash([]);
      }
    }
    context.restore();
  }

  RenderZoneMask() {
    const zone = this.view.safeZone;
    if (!zone || zone.phaseIndex < 0) return;
    const context = this.context;
    const center = this.WorldToScreen(zone.center.x, zone.center.y);
    const radius = zone.radius * this.camera.zoom;
    context.save();
    context.fillStyle = "rgba(37,92,130,.11)";
    context.beginPath();
    context.rect(0, 0, this.viewportWidth, this.viewportHeight);
    context.arc(center.x, center.y, radius, 0, Math.PI * 2, true);
    context.fill("evenodd");
    context.restore();
  }

  RenderLoot(timestamp) {
    if (this.camera.zoom < .92) return;
    const context = this.context;
    for (const item of this.view.map.loot) {
      if (!item.available || !this.IsVisible(item.x, item.y, 18)) continue;
      const point = this.WorldToScreen(item.x, item.y);
      const color = lootColors[item.type] ?? "#e9eee3";
      const pulse = 1 + Math.sin(timestamp * .005 + item.x * .1) * .12;
      const size = Clamp(this.camera.zoom * 1.25, 3.4, 8) * pulse;
      context.save();
      context.shadowColor = color;
      context.shadowBlur = 10;
      context.fillStyle = color;
      context.translate(point.x, point.y);
      context.rotate(Math.PI * .25);
      context.fillRect(-size * .5, -size * .5, size, size);
      context.restore();
      if (this.camera.zoom > 3.3) {
        context.fillStyle = "rgba(3,9,8,.78)";
        RoundRect(context, point.x - 13, point.y + size, 26, 9, 2);
        context.fill();
        context.fillStyle = color;
        context.font = "600 6px system-ui";
        context.textAlign = "center";
        const label = item.type === "weapon" ? FormatWeaponName(item.weaponId).split(" ")[0] : item.type.toUpperCase();
        context.fillText(label, point.x, point.y + size + 6.5);
      }
    }
  }

  RenderWorldObjects() {
    const context = this.context;
    const zoom = this.camera.zoom;
    for (const building of this.view.map.buildings) {
      if (!this.IsVisible(building.x, building.y, Math.max(building.width, building.height) * zoom)) continue;
      const point = this.WorldToScreen(building.x, building.y);
      const width = building.width * zoom;
      const height = building.height * zoom;
      const shadowOffset = Clamp(zoom * 2.1, 2, 10);
      context.fillStyle = "rgba(0,0,0,.28)";
      context.fillRect(point.x - width * .5 + shadowOffset, point.y - height * .5 + shadowOffset, width, height);
      context.fillStyle = roofColors[building.roofTone % roofColors.length];
      context.fillRect(point.x - width * .5, point.y - height * .5, width, height);
      context.strokeStyle = "rgba(228,235,215,.22)";
      context.lineWidth = 1;
      context.strokeRect(point.x - width * .5, point.y - height * .5, width, height);
      if (zoom > 2) {
        context.strokeStyle = "rgba(24,31,27,.45)";
        context.beginPath();
        context.moveTo(point.x - width * .45, point.y);
        context.lineTo(point.x + width * .45, point.y);
        context.stroke();
        const doorWidth = Math.max(3, zoom * 1.4);
        context.fillStyle = "#27312c";
        context.fillRect(point.x - doorWidth * .5, point.y + height * .5 - 2, doorWidth, 3);
      }
    }
    for (const rock of this.view.map.rocks) {
      if (!this.IsVisible(rock.x, rock.y, 15)) continue;
      const point = this.WorldToScreen(rock.x, rock.y);
      const radius = Clamp(rock.radius * zoom, 2, 24);
      context.save();
      context.translate(point.x, point.y);
      context.rotate(rock.rotation);
      context.fillStyle = "rgba(0,0,0,.26)";
      context.beginPath();
      context.ellipse(radius * .25, radius * .3, radius, radius * .7, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#59635a";
      context.beginPath();
      context.moveTo(-radius, radius * .25);
      context.lineTo(-radius * .55, -radius * .65);
      context.lineTo(radius * .25, -radius);
      context.lineTo(radius, -radius * .1);
      context.lineTo(radius * .55, radius * .72);
      context.closePath();
      context.fill();
      context.restore();
    }
    for (const tree of this.view.map.trees) {
      if (!this.IsVisible(tree.x, tree.y, 18)) continue;
      const point = this.WorldToScreen(tree.x, tree.y);
      const radius = Clamp(tree.radius * zoom * 1.8, 2, 27);
      context.fillStyle = "rgba(0,0,0,.24)";
      context.beginPath();
      context.ellipse(point.x + radius * .35, point.y + radius * .45, radius, radius * .68, .2, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = treeColors[tree.crownTone % treeColors.length];
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      if (zoom > 2.6) {
        context.fillStyle = "rgba(146,170,117,.2)";
        context.beginPath();
        context.arc(point.x - radius * .28, point.y - radius * .3, radius * .45, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#3a2d20";
        context.beginPath();
        context.arc(point.x, point.y, Math.max(1, zoom * .42), 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  RenderPlane(timestamp) {
    const plane = this.view.plane;
    if (!plane || (this.view.phase !== "flight" && this.view.phase !== "drop")) return;
    const point = this.WorldToScreen(plane.x, plane.y);
    if (point.x < -100 || point.x > this.viewportWidth + 100 || point.y < -100 || point.y > this.viewportHeight + 100) return;
    const angle = Math.atan2(plane.direction.y, plane.direction.x);
    const scale = Clamp(this.camera.zoom * 4.2, 12, 34);
    const context = this.context;
    context.save();
    context.translate(point.x, point.y + 7);
    context.rotate(angle);
    context.fillStyle = "rgba(0,0,0,.25)";
    context.beginPath();
    context.moveTo(scale * 1.25, 0);
    context.lineTo(-scale, scale * .28);
    context.lineTo(-scale * .72, 0);
    context.lineTo(-scale, -scale * .28);
    context.closePath();
    context.fill();
    context.translate(0, -7);
    context.fillStyle = "#c7d0c5";
    context.strokeStyle = "rgba(15,25,21,.8)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(scale * 1.25, 0);
    context.lineTo(scale * .18, scale * .14);
    context.lineTo(-scale * .24, scale * .72);
    context.lineTo(-scale * .53, scale * .69);
    context.lineTo(-scale * .38, scale * .12);
    context.lineTo(-scale * 1.05, scale * .2);
    context.lineTo(-scale * 1.2, 0);
    context.lineTo(-scale * 1.05, -scale * .2);
    context.lineTo(-scale * .38, -scale * .12);
    context.lineTo(-scale * .53, -scale * .69);
    context.lineTo(-scale * .24, -scale * .72);
    context.lineTo(scale * .18, -scale * .14);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = "#d8ff72";
    context.fillRect(scale * .55, -1, scale * .28, 2);
    context.restore();
    if (!this.reducedMotion) {
      context.strokeStyle = `rgba(232,238,226,${.08 + Math.sin(timestamp * .01) * .02})`;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(point.x - plane.direction.x * scale * 1.4, point.y - plane.direction.y * scale * 1.4);
      context.lineTo(point.x - plane.direction.x * scale * 3.6, point.y - plane.direction.y * scale * 3.6);
      context.stroke();
    }
  }

  RenderActors(timestamp) {
    const context = this.context;
    const sortedActors = [...this.view.actors].sort((first, second) => first.z - second.z || first.y - second.y);
    for (const actor of sortedActors) {
      if (!this.IsVisible(actor.x, actor.y, 50)) continue;
      const groundPoint = this.WorldToScreen(actor.x, actor.y);
      const altitudeOffset = actor.z * this.camera.zoom * .13;
      const point = { x: groundPoint.x, y: groundPoint.y - altitudeOffset };
      const isPlayer = actor.id === this.view.player?.id;
      const bodyColor = isPlayer ? "#d8ff72" : actor.alive ? (actor.isHuman ? "#72c4ff" : "#f0a15c") : "#59615c";
      const radius = Clamp(this.camera.zoom * 1.45, 3, 10);
      if (actor.z > 2) {
        context.save();
        context.globalAlpha = .16;
        context.fillStyle = "#000";
        context.beginPath();
        context.ellipse(groundPoint.x, groundPoint.y, radius * 1.4, radius * .7, 0, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
      if (actor.status === "parachute") {
        const canopyY = point.y - Clamp(14 + actor.z * .03, 14, 28);
        context.strokeStyle = "rgba(220,230,218,.66)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(point.x - radius * .65, point.y);
        context.lineTo(point.x - radius * 2.1, canopyY);
        context.moveTo(point.x + radius * .65, point.y);
        context.lineTo(point.x + radius * 2.1, canopyY);
        context.stroke();
        context.fillStyle = isPlayer ? "#d8ff72" : "#b7c1b7";
        context.beginPath();
        context.arc(point.x, canopyY, radius * 2.35, Math.PI, Math.PI * 2);
        context.lineTo(point.x + radius * 2.35, canopyY + 2);
        context.lineTo(point.x - radius * 2.35, canopyY + 2);
        context.closePath();
        context.fill();
      }
      if (!actor.alive || actor.status === "dead") {
        context.save();
        context.translate(point.x, point.y);
        context.rotate(actor.angle);
        context.fillStyle = "rgba(57,64,60,.8)";
        RoundRect(context, -radius * 1.8, -radius * .55, radius * 3.6, radius * 1.1, radius * .5);
        context.fill();
        context.restore();
        continue;
      }
      context.save();
      context.translate(point.x, point.y);
      context.rotate(actor.angle);
      context.fillStyle = "rgba(0,0,0,.3)";
      context.beginPath();
      context.ellipse(radius * .28, radius * .45, radius * 1.25, radius * .8, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = bodyColor;
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#18211d";
      context.beginPath();
      context.arc(radius * .18, 0, radius * .45, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = actor.inventory.weaponId ? "#d6d5c9" : "rgba(220,225,215,.4)";
      context.fillRect(radius * .25, -Math.max(1, radius * .16), radius * 1.65, Math.max(2, radius * .32));
      context.restore();
      if (isPlayer) {
        context.strokeStyle = "rgba(216,255,114,.45)";
        context.lineWidth = 1;
        context.beginPath();
        context.arc(point.x, point.y, radius + 4 + Math.sin(timestamp * .006) * .7, 0, Math.PI * 2);
        context.stroke();
      } else if (this.camera.zoom > 3 && Distance(actor.x, actor.y, this.view.player?.x ?? -999, this.view.player?.y ?? -999) < 105) {
        const barWidth = 18;
        context.fillStyle = "rgba(3,8,7,.68)";
        context.fillRect(point.x - barWidth * .5, point.y - radius - 7, barWidth, 2);
        context.fillStyle = actor.isHuman ? "#72c4ff" : "#ff9060";
        context.fillRect(point.x - barWidth * .5, point.y - radius - 7, barWidth * Clamp(actor.health / 100, 0, 1), 2);
      }
    }
  }

  RenderEffects() {
    const context = this.context;
    context.save();
    context.lineCap = "round";
    for (const tracer of this.tracers) {
      const start = this.WorldToScreen(tracer.x1, tracer.y1);
      const end = this.WorldToScreen(tracer.x2, tracer.y2);
      context.strokeStyle = `rgba(255,216,122,${Clamp(tracer.life / .16, 0, 1) * .9})`;
      context.lineWidth = 1.4;
      context.shadowColor = "#ffc76b";
      context.shadowBlur = 7;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }
    context.shadowBlur = 0;
    for (const particle of this.particles) {
      const point = this.WorldToScreen(particle.x, particle.y);
      const opacity = Clamp(particle.life / particle.maximumLife, 0, 1);
      context.globalAlpha = opacity;
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(point.x, point.y, Clamp(particle.size * this.camera.zoom, 1, 4), 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  RenderZoneLines(timestamp) {
    const zone = this.view.safeZone;
    if (!zone || zone.phaseIndex < 0) return;
    const context = this.context;
    const center = this.WorldToScreen(zone.center.x, zone.center.y);
    const radius = zone.radius * this.camera.zoom;
    context.save();
    context.strokeStyle = `rgba(105,197,255,${.62 + Math.sin(timestamp * .004) * .08})`;
    context.lineWidth = 2;
    context.shadowColor = "#72c4ff";
    context.shadowBlur = 9;
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.stroke();
    context.shadowBlur = 0;
    if (zone.stage === "waiting") {
      const target = this.WorldToScreen(zone.targetCenter.x, zone.targetCenter.y);
      context.strokeStyle = "rgba(233,238,227,.56)";
      context.lineWidth = 1;
      context.setLineDash([7, 7]);
      context.beginPath();
      context.arc(target.x, target.y, zone.targetRadius * this.camera.zoom, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
    }
    context.restore();
  }

  RenderAimReticle() {
    if (!this.pointer.active || this.view?.player?.status !== "ground" || !this.view.player.alive) return;
    const context = this.context;
    const pointX = this.pointer.x;
    const pointY = this.pointer.y;
    context.save();
    context.strokeStyle = "rgba(233,238,227,.82)";
    context.lineWidth = 1;
    const gap = 4;
    const length = 5;
    context.beginPath();
    context.moveTo(pointX - gap - length, pointY);
    context.lineTo(pointX - gap, pointY);
    context.moveTo(pointX + gap, pointY);
    context.lineTo(pointX + gap + length, pointY);
    context.moveTo(pointX, pointY - gap - length);
    context.lineTo(pointX, pointY - gap);
    context.moveTo(pointX, pointY + gap);
    context.lineTo(pointX, pointY + gap + length);
    context.stroke();
    context.fillStyle = "#d8ff72";
    context.beginPath();
    context.arc(pointX, pointY, 1.25, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  RenderScreenEffects() {
    const context = this.context;
    if (this.damageFlash > .001) {
      const gradient = context.createRadialGradient(this.viewportWidth * .5, this.viewportHeight * .5, this.viewportHeight * .18, this.viewportWidth * .5, this.viewportHeight * .5, this.viewportWidth * .7);
      gradient.addColorStop(0, "rgba(255,30,20,0)");
      gradient.addColorStop(1, `rgba(255,45,35,${this.damageFlash * .34})`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, this.viewportWidth, this.viewportHeight);
    }
    const vignette = context.createRadialGradient(this.viewportWidth * .5, this.viewportHeight * .47, this.viewportHeight * .28, this.viewportWidth * .5, this.viewportHeight * .47, this.viewportWidth * .72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,7,7,.28)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, this.viewportWidth, this.viewportHeight);
  }

  RenderMapToContext(context, width, height, includeActors = true) {
    if (!context || !this.view?.map) return;
    const scaleX = width / WORLD_SIZE;
    const scaleY = height / WORLD_SIZE;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#14271f";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "rgba(164,188,143,.055)";
    for (let pointY = 0; pointY < height; pointY += height / 10) context.fillRect(0, pointY, width, 1);
    for (let pointX = 0; pointX < width; pointX += width / 10) context.fillRect(pointX, 0, 1, height);
    context.lineCap = "round";
    for (const road of this.view.map.roads) {
      context.strokeStyle = "rgba(143,150,133,.5)";
      context.lineWidth = Math.max(1, road.width * (scaleX + scaleY) * .5);
      context.beginPath();
      context.moveTo(road.x1 * scaleX, road.y1 * scaleY);
      context.lineTo(road.x2 * scaleX, road.y2 * scaleY);
      context.stroke();
    }
    context.fillStyle = "rgba(114,124,110,.8)";
    for (const building of this.view.map.buildings) {
      context.fillRect(
        (building.x - building.width * .5) * scaleX,
        (building.y - building.height * .5) * scaleY,
        Math.max(1, building.width * scaleX),
        Math.max(1, building.height * scaleY),
      );
    }
    context.fillStyle = "rgba(52,81,57,.8)";
    for (const tree of this.view.map.trees) {
      context.beginPath();
      context.arc(tree.x * scaleX, tree.y * scaleY, Math.max(.5, tree.radius * scaleX), 0, Math.PI * 2);
      context.fill();
    }
    const plane = this.view.plane;
    if (plane) {
      context.strokeStyle = "rgba(255,157,77,.66)";
      context.lineWidth = 1;
      context.setLineDash([5, 4]);
      context.beginPath();
      context.moveTo(plane.start.x * scaleX, plane.start.y * scaleY);
      context.lineTo(plane.end.x * scaleX, plane.end.y * scaleY);
      context.stroke();
      context.setLineDash([]);
    }
    const zone = this.view.safeZone;
    if (zone?.phaseIndex >= 0) {
      context.strokeStyle = "rgba(114,196,255,.88)";
      context.lineWidth = Math.max(1, width / 330);
      context.beginPath();
      context.ellipse(zone.center.x * scaleX, zone.center.y * scaleY, zone.radius * scaleX, zone.radius * scaleY, 0, 0, Math.PI * 2);
      context.stroke();
      if (zone.stage === "waiting") {
        context.strokeStyle = "rgba(233,238,227,.64)";
        context.setLineDash([4, 4]);
        context.beginPath();
        context.ellipse(zone.targetCenter.x * scaleX, zone.targetCenter.y * scaleY, zone.targetRadius * scaleX, zone.targetRadius * scaleY, 0, 0, Math.PI * 2);
        context.stroke();
        context.setLineDash([]);
      }
    }
    if (includeActors) {
      for (const actor of this.view.actors) {
        if (!actor.alive) continue;
        const isPlayer = actor.id === this.view.player?.id;
        context.fillStyle = isPlayer ? "#d8ff72" : actor.isHuman ? "#72c4ff" : "rgba(255,144,96,.5)";
        const radius = isPlayer ? Math.max(2.5, width / 170) : Math.max(1, width / 520);
        context.beginPath();
        context.arc(actor.x * scaleX, actor.y * scaleY, radius, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.strokeStyle = "rgba(216,255,114,.32)";
    context.lineWidth = 1;
    context.strokeRect(.5, .5, width - 1, height - 1);
  }

  RenderMinimap() {
    if (!this.minimapContext || !this.view) return;
    const width = this.minimapCanvas.width;
    const height = this.minimapCanvas.height;
    this.RenderMapToContext(this.minimapContext, width, height, true);
  }

  RenderFullMap() {
    if (!this.fullMapContext || !this.view) return;
    const width = this.fullMapCanvas.width;
    const height = this.fullMapCanvas.height;
    this.RenderMapToContext(this.fullMapContext, width, height, true);
  }
}

export function CreateBattleRenderer(options) {
  return new BattleRenderer(options);
}

export default BattleRenderer;
