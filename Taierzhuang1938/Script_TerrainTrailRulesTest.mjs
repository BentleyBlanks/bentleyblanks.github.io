// 地面脚印与痕迹的规则层门禁（纯 Node，零 three）。口径 docs/Data_TerrainTrails.md。
//   node Taierzhuang1938/Script_TerrainTrailRulesTest.mjs
import assert from "node:assert/strict";
import {
  BuildStampAtlas, MakeStamp, StampRadius, SoleForKind, WindowIndex, WindowRange, ExposedRanges, TexelRects,
  WorldRectOf, StampCopies, TrailHistory, DecayClock, FootContact, StrideEmitter, STAMP_PADS,
} from "./Script_TerrainTrailRules.mjs";
import {
  TERRAIN_TRAIL_STAMPS, TERRAIN_TRAIL_ATLAS, TERRAIN_TRAIL_CONTACT as C, TERRAIN_TRAIL_TIERS, TerrainTrailTierOf,
  TERRAIN_TRAIL_WINDOW,
} from "./Data_Tuning_TerrainTrails.mjs";

let passed = 0;
const Ok = (cond, msg) => { assert.ok(cond, msg); passed++; };

// --- 1. 印章图集 ------------------------------------------------------------
{
  const a = BuildStampAtlas(), b = BuildStampAtlas();
  Ok(a.width === TERRAIN_TRAIL_ATLAS.cellW * TERRAIN_TRAIL_ATLAS.cells && a.height === TERRAIN_TRAIL_ATLAS.cellH, "图集尺寸");
  Ok(Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0, "图集确定性（两次逐字节相同）");
  const cell = (k) => TERRAIN_TRAIL_STAMPS[k].cell;
  const Stat = (kind, ch) => {
    let sum = 0, max = 0, edge = 0;
    const c0 = cell(kind) * a.cellW;
    for (let y = 0; y < a.cellH; y++) for (let x = 0; x < a.cellW; x++) {
      const v = a.data[(y * a.width + c0 + x) * 4 + ch];
      sum += v; max = Math.max(max, v);
      if (x < 2 || y < 2 || x >= a.cellW - 2 || y >= a.cellH - 2) edge = Math.max(edge, v);
    }
    return { mean: sum / (a.cellW * a.cellH), max, edge };
  };
  for (const kind of Object.keys(TERRAIN_TRAIL_STAMPS)) {
    for (let ch = 0; ch < 3; ch++) {
      const s = Stat(kind, ch);
      Ok(s.max > 60, `${kind} 通道 ${"RGB"[ch]} 有内容（max ${s.max}）`);
      Ok(s.edge === 0, `${kind} 通道 ${"RGB"[ch]} 格子留白为 0（mip 不串格）`);
    }
  }
  // 履带：横向履齿沿长度方向周期起伏（节距 0.14 m），相邻两段的相位对齐
  {
    const [, padL] = STAMP_PADS.tread, L = TERRAIN_TRAIL_STAMPS.tread.lengthM, pitch = TERRAIN_TRAIL_STAMPS.tread.pitchM;
    const col = cell("tread") * a.cellW + Math.floor(a.cellW * 0.3);
    const at = (y) => a.data[(Math.floor(((y / L) / padL + 0.5) * a.cellH) * a.width + col) * 4];
    Ok(at(0) > at(pitch / 2) + 25 && at(pitch) > at(pitch * 1.5) + 25, `履齿（中心 ${at(0)} / 半节距 ${at(pitch / 2)}）`);
    Ok(Math.abs(at(-pitch) - at(pitch)) <= 12, "履齿以印章中心为相位原点、前后对称");
  }
  // 草鞋露趾：鞋底前沿之外（t > 1.0）还有坑
  const [padW, padL] = STAMP_PADS.straw;
  const rowOf = (t) => Math.floor(((t - 0.5) / padL + 0.5) * a.cellH);
  const RowMax = (kind, t) => {
    const y = rowOf(t); let m = 0;
    for (let x = 0; x < a.cellW; x++) m = Math.max(m, a.data[(y * a.width + cell(kind) * a.cellW + x) * 4]);
    return m;
  };
  Ok(RowMax("straw", 1.0) > 80 && RowMax("cloth", 1.03) < 10, `草鞋趾头探出鞋底前沿（草 ${RowMax("straw", 1.0)} / 布 ${RowMax("cloth", 1.03)}）`);
  Ok(RowMax("straw", 0.15) > 150 && RowMax("straw", -0.04) < 5, "脚跟有坑、脚跟后面没有");
  // 皮靴：前掌鞋钉让坑深的高频起伏比布鞋大（前掌中间一块的拉普拉斯均值，压力分布的缓坡不算）
  const Detail = (kind) => {
    const V = (x, y) => a.data[(y * a.width + cell(kind) * a.cellW + x) * 4];
    let sum = 0, n = 0;
    for (let y = rowOf(0.6); y <= rowOf(0.8); y++) {
      for (let x = Math.floor(a.cellW * 0.42); x <= Math.ceil(a.cellW * 0.58); x++) {
        sum += Math.abs(4 * V(x, y) - V(x - 1, y) - V(x + 1, y) - V(x, y - 1) - V(x, y + 1)); n++;
      }
    }
    return sum / n;
  };
  Ok(Detail("boot") > 1.5 * Detail("cloth"), `皮靴鞋钉（前掌细节 ${Detail("boot").toFixed(1)} > 1.5 × 布鞋 ${Detail("cloth").toFixed(1)}）`);
  void padW;
}

// --- 2. 印章与鞋 --------------------------------------------------------------
{
  const r = MakeStamp({ x: 1, z: 2, dirX: 0, dirZ: -3, kind: "boot", side: 1, strength: [0.5, 2, -1] });
  const l = MakeStamp({ x: 1, z: 2, dirX: 0, dirZ: -1, kind: "boot", side: -1, strength: [0.5, 0.5, 0.5] });
  Ok(Math.abs(r.dirZ + 1) < 1e-9 && r.dirX === 0, "方向归一化");
  Ok(r.quadW > 0 && l.quadW < 0 && Math.abs(r.quadW + l.quadW) < 1e-12, "左脚镜像（宽取负）");
  Ok(r.g === 1 && r.b === 0, "强度钳到 0..1");
  Ok(Math.abs(r.quadL - TERRAIN_TRAIL_STAMPS.boot.lengthM * STAMP_PADS.boot[1]) < 1e-9, "四边形含留白");
  Ok(StampRadius(r) > 0.15 && StampRadius(r) < 0.3, "外接圆半径");
  Ok(SoleForKind("ijaRifle", "a") === "boot" && SoleForKind("civilian", "x") === "cloth", "日军皮靴、百姓布鞋");
  let straw = 0;
  for (let i = 0; i < 400; i++) if (SoleForKind("nra", `nra:${i}`) === "straw") straw++;
  Ok(straw > 240 && straw < 320, `川军约七成草鞋（${straw}/400）`);
  Ok(SoleForKind("nra", "nra:7") === SoleForKind("nra", "nra:7"), "同一个人一直穿同一双");
  Ok(TerrainTrailTierOf("low") === null && TerrainTrailTierOf("whitebox") === TERRAIN_TRAIL_TIERS.high, "分档：low 关、未登记按 high");
}

// --- 3. 环形窗口 --------------------------------------------------------------
{
  const texel = 0.5, size = 16;
  let w = WindowIndex(null, 3.2, -1.1, texel, 0.6);
  Ok(w.ix === 6 && w.iz === -3, "初始中心按纹素取整");
  Ok(WindowIndex(w, 3.5, -1.0, texel, 0.6) === w, "迟滞：没走出 recenterM 不挪");
  // 暴力核对：任意挪动后「新露出来的」恰好 = 新窗口 − 旧窗口，互不重叠，像素矩形取模后覆盖同样的格子
  let rng = 7;
  const Rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let trial = 0; trial < 300; trial++) {
    const prev = { ix: Math.floor(Rand() * 60 - 30), iz: Math.floor(Rand() * 60 - 30) };
    const next = trial % 7 === 0 ? { ix: prev.ix + 40, iz: prev.iz } : { ix: prev.ix + Math.floor(Rand() * 13 - 6), iz: prev.iz + Math.floor(Rand() * 13 - 6) };
    const A = WindowRange(prev, size), B = WindowRange(next, size);
    const expected = new Set();
    for (let x = B.x0; x < B.x1; x++) for (let z = B.z0; z < B.z1; z++) {
      if (!(x >= A.x0 && x < A.x1 && z >= A.z0 && z < A.z1)) expected.add(`${x},${z}`);
    }
    const bigJump = Math.abs(next.ix - prev.ix) >= size || Math.abs(next.iz - prev.iz) >= size;
    const got = new Map();
    const pixels = new Map();
    for (const range of ExposedRanges(prev, next, size)) {
      for (let x = range.x0; x < range.x1; x++) for (let z = range.z0; z < range.z1; z++) {
        const key = `${x},${z}`;
        got.set(key, (got.get(key) || 0) + 1);
        const pk = `${((x % size) + size) % size},${((z % size) + size) % size}`;
        pixels.set(pk, (pixels.get(pk) || 0) + 1);
      }
      let area = 0;
      for (const t of TexelRects(range, size)) {
        assert.ok(t.x >= 0 && t.y >= 0 && t.x + t.w <= size && t.y + t.h <= size, "像素矩形在靶内");
        area += t.w * t.h;
      }
      assert.equal(area, (range.x1 - range.x0) * (range.z1 - range.z0), "取模拆块面积不变");
    }
    if (bigJump) assert.equal(got.size, size * size, "跳太远 → 整张重建");
    else {
      assert.equal(got.size, expected.size, `露出面积（试 ${trial}）`);
      for (const key of expected) assert.equal(got.get(key), 1, `每格恰好一次（${key}）`);
    }
    for (const count of pixels.values()) assert.equal(count, 1, "同一像素不会被两块条带重复清");
  }
  passed++;
  const world = WorldRectOf({ x0: -2, x1: 3, z0: 4, z1: 6 }, texel);
  Ok(world.minX === -1 && world.maxX === 1.5 && world.minZ === 2 && world.maxZ === 3, "纹素范围 → 世界矩形");
  // 跨靶边的印章要在对边再画一份
  const tier = TERRAIN_TRAIL_TIERS.high, extent = tier.size * tier.texelM;
  const seam = MakeStamp({ x: extent - 0.02, z: 5, dirX: 1, dirZ: 0, kind: "straw", strength: [1, 1, 1] });
  const copies = StampCopies(seam, tier.texelM, tier.size);
  Ok(copies.length === 2 && copies.some(([x]) => x < 0) && copies.some(([x]) => x > tier.size - 2), "跨右边的印章在左边再画一份");
  const corner = MakeStamp({ x: 0.01, z: -0.01, dirX: 1, dirZ: 0, kind: "straw", strength: [1, 1, 1] });
  Ok(StampCopies(corner, tier.texelM, tier.size).length === 4, "角上的印章画四份");
  Ok(StampCopies(MakeStamp({ x: 7, z: 9, dirX: 1, dirZ: 0, kind: "knee" }), tier.texelM, tier.size).length === 1, "中间的只画一份");
}

// --- 4. 历史与衰减 ------------------------------------------------------------
{
  const life = TERRAIN_TRAIL_WINDOW.lifeS;
  const h = new TrailHistory(4);
  for (let i = 0; i < 6; i++) h.Add(MakeStamp({ x: i, z: 0, dirX: 1, dirZ: 0, kind: "knee", strength: [1, 1, 1] }), i);
  Ok(h.count === 4, "环形历史容量");
  const seen = [];
  h.Query(null, 6, life, (s) => seen.push(s.x));
  Ok(seen.join() === "2,3,4,5", `挤掉最老的、按先后回调（${seen.join()}）`);
  const inRect = [];
  h.Query({ minX: 3.9, maxX: 4.1, minZ: -1, maxZ: 1 }, 6, life, (s) => inRect.push(s.x));
  Ok(inRect.includes(4) && !inRect.includes(2), "按矩形筛（含印章半径）");
  let r = 0, fr = 0;
  h.Query({ minX: 4.9, maxX: 5.1, minZ: -1, maxZ: 1 }, 5 + life[0] / 2, life, (s) => { if (s.x === 5) { r = s.r; fr = s.fr; } });
  Ok(r === 1 && Math.abs(fr - 0.5) < 1e-6, `历史给原强度 + 已退量（${r} / ${fr}）`);
  let any = 0;
  h.Query(null, 1e6, life, () => any++);
  Ok(any === 0, "退干净的不回填");
  const clock = new DecayClock();
  let total = [0, 0, 0];
  for (let i = 0; i < 600; i++) { const s = clock.Advance(1 / 60, life); if (s) total = total.map((v, c) => v + s[c]); }
  const want = life.map((l) => Math.floor(10 * 255 / l));
  Ok(total.every((v, c) => Math.abs(v - want[c]) <= 1), `10 s 的减淡色阶 ${total} ≈ ${want}`);
}

// --- 5. 落脚判定 --------------------------------------------------------------
{
  const dt = 1 / 60;
  // 走路：踝高在 0.09（着地）与 0.22（摆动）之间，一步 0.55 s；着地时脚不动、摆动时脚往前 2.5 m/s
  const Walk = (seconds, base = 0.09, lift = 0.13, swingSpeed = 2.5) => {
    const f = new FootContact();
    let plants = 0, x = 0;
    for (let t = 0; t < seconds; t += dt) {
      const phase = (t / 1.1) % 1;               // 一只脚一个周期 1.1 s：前 55% 着地
      const swing = phase > 0.55 ? Math.sin(((phase - 0.55) / 0.45) * Math.PI) : 0;
      const speed = phase > 0.55 ? swingSpeed : 0;
      x += speed * dt;
      if (f.Step(base + lift * swing, speed, dt, x, 0)) plants++;
    }
    return plants;
  };
  const steps = Walk(11);
  Ok(steps === 10 || steps === 11, `走 11 s 一只脚落 ${steps} 次（每周期一次）`);
  Ok(Walk(11, 0.4) === 0, "脚下 30 cm 高的楼板：踝离地形太高，不出印");
  Ok(Walk(11, 0.09, 0.03) <= 1, "抬脚不够高（拖着走）：不重复落");
  // 站着不动：只落一次
  const still = new FootContact();
  let n = 0;
  for (let i = 0; i < 300; i++) if (still.Step(0.09, 0, dt, 0, 0)) n++;
  Ok(n === 1, "站着只落一次");
  // 脚着地却在滑（被拖着走、打滑）：不算落脚
  const slide = new FootContact();
  n = 0;
  for (let i = 0; i < 300; i++) if (slide.Step(0.09, 2.0, dt, i * 0.03, 0)) n++;
  Ok(n === 0, "滑动的脚不出印");
  // 膝盖：绝对阈值
  const knee = new FootContact({ absolute: true });
  Ok(!knee.Step(0.45, 0, dt, 0, 0, C, C.kneeEnterM, C.kneeExitM), "站着膝盖离地不算");
  Ok(knee.Step(0.05, 0, dt, 0, 0, C, C.kneeEnterM, C.kneeExitM), "跪下落一次");
  Ok(!knee.Step(0.05, 0, dt, 0, 0, C, C.kneeEnterM, C.kneeExitM), "跪着不重复");
  // 原地微调：两次着地离得太近不重复盖
  const shuffle = new FootContact();
  shuffle.Step(0.09, 0, dt, 0, 0); shuffle.Step(0.3, 0, dt, 0, 0);
  Ok(!shuffle.Step(0.09, 0, dt, 0.05, 0), "离上一个印不到 minSpacingM 不盖");
  // 第一人称步距交替
  const stride = new StrideEmitter();
  const sides = [];
  for (let d = 0; d <= 3.01; d += 0.05) { const s = stride.Step(d, 0.72); if (s) sides.push(s); }
  Ok(sides.length === 4 && sides.join() === "-1,1,-1,1", `步距 0.72 m 走 3 m 落 4 步、左右交替（${sides}）`);
}

console.log(`TerrainTrailRulesTest: ${passed} 项通过`);
