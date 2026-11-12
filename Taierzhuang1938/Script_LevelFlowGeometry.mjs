export const Clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const Lerp = (a, b, amount) => a + (b - a) * amount;
export const Distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function SegmentDistance(point,a,b) {
  const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
  const t=length?Clamp(((point[0]-a[0])*dx+(point[1]-a[1])*dz)/length,0,1):0;
  return Distance(point,[a[0]+dx*t,a[1]+dz*t]);
}

export function InsidePolygon(point,polygon) {
  let inside=false;
  for(let index=0,previous=polygon.length-1;index<polygon.length;previous=index++) {
    const a=polygon[previous],b=polygon[index];
    if(SegmentDistance(point,a,b)<1e-6) return true;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}

export function SampleRoute(points, progress) {
  if (points.length === 1) return [...points[0]];
  const lengths = points.slice(1).map((point, index) => Distance(points[index], point));
  let remaining = Clamp(progress, 0, 1) * lengths.reduce((sum, length) => sum + length, 0);
  for (let index = 0; index < lengths.length; index++) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const t = lengths[index] ? Clamp(remaining / lengths[index], 0, 1) : 0;
      return points[index].map((coordinate, axis) => Lerp(coordinate, points[index + 1][axis], t));
    }
    remaining -= lengths[index];
  }
  return [...points.at(-1)];
}

export function InsideArea(point, area) {
  const dx = point[0] - area.center[0], dz = point[1] - area.center[1];
  if (area.shape === "circle") return Math.hypot(dx, dz) <= area.size[0] / 2 + 1e-7;
  return Math.abs(dx) <= area.size[0] / 2 + 1e-7 && Math.abs(dz) <= area.size[1] / 2 + 1e-7;
}

export function SampleBeatRoute(beat, progress) {
  if (!beat.pace) return SampleRoute(beat.p, progress);
  const time = Clamp(progress, 0, 1);
  for (let index = 1; index < beat.pace.length; index++) {
    if (time > beat.pace[index]) continue;
    const fraction = (time - beat.pace[index - 1]) / (beat.pace[index] - beat.pace[index - 1]);
    return beat.p[index - 1].map((value, axis) => Lerp(value, beat.p[index][axis], fraction));
  }
  return [...beat.p.at(-1)];
}

export function EnterArea(a, b, area) {
  if (InsideArea(a, area)) return 0;
  const delta = [b[0] - a[0], b[1] - a[1]];
  if (area.shape === "circle") {
    const offset = [a[0] - area.center[0], a[1] - area.center[1]];
    const aa = delta[0] ** 2 + delta[1] ** 2;
    const bb = 2 * (offset[0] * delta[0] + offset[1] * delta[1]);
    const cc = offset[0] ** 2 + offset[1] ** 2 - (area.size[0] / 2) ** 2;
    const discriminant = bb * bb - 4 * aa * cc;
    if (aa === 0 || discriminant < 0) return null;
    const t = (-bb - Math.sqrt(discriminant)) / (2 * aa);
    return t >= 0 && t <= 1 ? t : null;
  }
  let entry = 0, exit = 1;
  for (let axis = 0; axis < 2; axis++) {
    const min = area.center[axis] - area.size[axis] / 2;
    const max = area.center[axis] + area.size[axis] / 2;
    if (Math.abs(delta[axis]) < 1e-9) {
      if (a[axis] < min || a[axis] > max) return null;
    } else {
      const first = (min - a[axis]) / delta[axis], last = (max - a[axis]) / delta[axis];
      entry = Math.max(entry, Math.min(first, last));
      exit = Math.min(exit, Math.max(first, last));
      if (entry > exit) return null;
    }
  }
  return entry <= 1 && exit >= 0 ? Clamp(entry, 0, 1) : null;
}
