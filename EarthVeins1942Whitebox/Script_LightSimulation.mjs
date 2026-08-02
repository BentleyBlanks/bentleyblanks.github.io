const Clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function TraceSdfRay(originX, originY, angle, radius, sdfAt) {
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  let distance = 2.5;
  for (let iteration = 0; iteration < 72 && distance < radius; iteration += 1) {
    const x = originX + directionX * distance;
    const y = originY + directionY * distance;
    const signedDistance = sdfAt(x, y);
    if (!Number.isFinite(signedDistance) || signedDistance <= 1.15) break;
    distance += Clamp(signedDistance * .72, 1.4, 12);
  }
  return Math.min(distance, radius);
}

export class SdfLightRenderer {
  constructor(options = {}) {
    this.resolutionScale = Clamp(options.resolutionScale || .52, .25, 1);
    this.rayCount = Math.max(96, Math.floor(options.rayCount || 176));
    this.canvas = null;
    this.context = null;
    this.lastWidth = 0;
    this.lastHeight = 0;
  }

  EnsureCanvas(width, height) {
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.context = this.canvas.getContext("2d");
    }
    const pixelWidth = Math.max(1, Math.round(width * this.resolutionScale));
    const pixelHeight = Math.max(1, Math.round(height * this.resolutionScale));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.lastWidth = width;
    this.lastHeight = height;
  }

  Draw(targetContext, width, height, lights, sdfAt, darkness = .72, time = 0) {
    this.EnsureCanvas(width, height);
    const lightContext = this.context;
    const scale = this.resolutionScale;
    lightContext.setTransform(scale, 0, 0, scale, 0, 0);
    lightContext.globalCompositeOperation = "source-over";
    lightContext.clearRect(0, 0, width, height);
    lightContext.fillStyle = `rgba(3,8,10,${Clamp(darkness, 0, .94)})`;
    lightContext.fillRect(0, 0, width, height);

    lightContext.globalCompositeOperation = "destination-out";
    for (const light of lights) {
      const flicker = 1 + Math.sin(time * (7.1 + light.seed * .7) + light.seed * 4.7) * .035
        + Math.sin(time * 13.7 + light.seed) * .018;
      const radius = light.radius * flicker;
      const polygon = this.BuildVisibilityPolygon(light.x, light.y, radius, sdfAt);
      if (polygon.length < 3) continue;
      lightContext.save();
      lightContext.beginPath();
      lightContext.moveTo(polygon[0].x, polygon[0].y);
      for (let index = 1; index < polygon.length; index += 1) lightContext.lineTo(polygon[index].x, polygon[index].y);
      lightContext.closePath();
      lightContext.clip();
      const gradient = lightContext.createRadialGradient(light.x, light.y, 2, light.x, light.y, radius);
      gradient.addColorStop(0, `rgba(0,0,0,${Clamp(light.intensity ?? .88, 0, 1)})`);
      gradient.addColorStop(.18, `rgba(0,0,0,${Clamp((light.intensity ?? .88) * .93, 0, 1)})`);
      gradient.addColorStop(.62, `rgba(0,0,0,${Clamp((light.intensity ?? .88) * .48, 0, 1)})`);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      lightContext.fillStyle = gradient;
      lightContext.fillRect(light.x - radius, light.y - radius, radius * 2, radius * 2);
      lightContext.restore();
    }

    lightContext.setTransform(1, 0, 0, 1, 0, 0);
    targetContext.save();
    targetContext.drawImage(this.canvas, 0, 0, width, height);
    targetContext.globalCompositeOperation = "screen";
    for (const light of lights) {
      const glowRadius = light.radius * .42;
      const glow = targetContext.createRadialGradient(light.x, light.y, 0, light.x, light.y, glowRadius);
      const color = light.color || "238,174,80";
      glow.addColorStop(0, `rgba(${color},${(light.glow ?? .22)})`);
      glow.addColorStop(.18, `rgba(${color},${(light.glow ?? .22) * .52})`);
      glow.addColorStop(1, `rgba(${color},0)`);
      targetContext.fillStyle = glow;
      targetContext.fillRect(light.x - glowRadius, light.y - glowRadius, glowRadius * 2, glowRadius * 2);
    }
    targetContext.restore();
  }

  BuildVisibilityPolygon(originX, originY, radius, sdfAt) {
    const points = [];
    for (let index = 0; index < this.rayCount; index += 1) {
      const angle = index / this.rayCount * Math.PI * 2;
      const distance = TraceSdfRay(originX, originY, angle, radius, sdfAt);
      points.push({ x: originX + Math.cos(angle) * distance, y: originY + Math.sin(angle) * distance });
    }
    return points;
  }
}

export function CreateSdfLightRenderer(options) { return new SdfLightRenderer(options); }
