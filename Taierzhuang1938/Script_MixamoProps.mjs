// Mixamo 动作上挂枪 / 大刀的共用摆法（2026-11-02 全库审查后抽出来）：动作预览工具（Tool_MixamoAnimationPreview.html）
// 与白盒 X Bot（Script_EditorBlockoutXBot.mjs）用同一套，不各写一份。只放数学，不碰场景、mixer。
//
// 1. 枪管对准左手（AimAt）：枪按标定挂在右手上；左手在枪管前方时把枪管转过去对准左手掌心。原来是「够得着就整个转过去、
//    够不着就不转」的开关（0.2–0.75 m、偏角 < 100°），左手一跨线枪一帧拧过去最多 100°（审查量到 28 条，死亡、揉眼、
//    挡脸这类左手离开枪的最厉害，很多「枪穿腿穿胯」也是这一拧拧出来的）。现在按距离和偏角给一个 0–1 的权重，转的角度乘它。
//    全库量过左手相对标定枪管的偏角：普通端枪动作 0–30°；刺刀突刺、劈砍、横托格挡、枪托砸、枪身砸这 5 条左手一直握着、
//    握得比标定宽，20–100°；死亡、挡脸、取枪时甩开的左手 80–170°。所以默认 35° 内全转、55° 外不转（AIM_AT_LEFT），
//    清单标 rifleAim: "wide" 的那几条（还有「端枪受击·正面打偏向左」，左手握着、偏到 60°）用 100° / 120°（AIM_AT_LEFT_WIDE）。
// 2. 大刀不再转向左手（11-05 删除 AIM_AT_POMMEL：原来 70° 以内整个转过去，后来 45° / 75°、8° / 15°）：刀固定在右手里，
//    两手握刀的动作由 Script_MixamoClipFix.py 的 grip 把左手放到刀轴上。
// 3. 枪在动作里换地方（清单条目的 rifleTrack，PrepareRifleTrack + RifleTrackPose）：
//      grabAt  这之前枪背在背上，手伸到背后那一刻接过来；接过来先「握着枪身」拿 grabHoldS 秒，再用 settleS 秒换成标定的握把
//      stowAt  这一刻把枪放到背上，之后背着；放之前先用 stowS 秒从握把换成「握着枪身」，再这样拿 stowHoldS 秒
//    「握着枪身」= 枪还按背枪的样子贴着背竖着，枪身过此刻的掌心（每帧现算 SlungRifle，手转腕枪不跟着拧进身体）；
//    换握那一段在世界空间里从一种淡到另一种。
//      dropAt  这之后枪脱手掉地上（死亡）
//    背上的枪（SlungRifle）：枪口朝上竖背在右肩胛后面，枪身那条线过交接那一刻的掌心（手就握在枪身上，交接那一帧不跳），
//    之后跟着 Spine2 走。掉地：从脱手那一刻的位姿和速度落下，0.45 s 内转成枪身水平侧躺，落到地面停住。
import * as THREE from "three";

/**
 * A model's socket markers can retain an old lateral/vertical origin while its
 * imported solid geometry has moved. Measure the actual muzzle cross section
 * in weapon-local coordinates. Preserve the axial muzzle clearance and return
 * only the perpendicular correction; callers keep logical grip frames intact.
 * Points are supplied by the consumer, so this shared maths touches no scene.
 */
export function MeasureWeaponVisualOrigin(points, muzzle, settings) {
  const offset = new THREE.Vector3();
  if (!points.length || !muzzle || !settings) return offset;
  let minZ = Infinity;
  for (const p of points) minZ = Math.min(minZ,p.z);
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for (const p of points) if (p.z <= minZ+settings.muzzleSampleDepthM) {
    minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
  }
  offset.set((minX+maxX)*.5-muzzle.x,(minY+maxY)*.5-muzzle.y,0);
  const length=offset.length();
  return Number.isFinite(length)&&length>=settings.minCorrectionM&&length<=settings.maxCorrectionM ? offset : offset.set(0,0,0);
}

export const AIM_AT_LEFT = Object.freeze({
  near: 0.2, nearFull: 0.26,      // 左手离握把 0.2 m 以内不转（拉栓、压弹的手在机匣上），0.26 m 起全转
  farFull: 0.68, far: 0.75,       // 0.68 m 以外渐弱、0.75 m 不转（手伸出去干别的）
  fullDeg: 35, zeroDeg: 55,       // 左手偏离标定枪管方向 ≤ 35° 全转、≥ 55° 不转（放到 45° / 65° 试过：死亡、取枪几条一帧跳 30° 多）
});
export const AIM_AT_LEFT_WIDE = Object.freeze({ ...AIM_AT_LEFT, fullDeg: 100, zeroDeg: 120 });

/** 这条动作用哪一档（清单条目 rifleAim: "wide" = 刺刀白刃那几条宽握）。 */
export function AimBandFor(entry) { return entry?.rifleAim === "wide" ? AIM_AT_LEFT_WIDE : AIM_AT_LEFT; }

const Smooth = (e0, e1, x) => { const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/** 枪管该转多少（0–1）：reach = 左手掌心离握点（米，按人物原尺寸），angle = 标定枪管方向与「握点 → 左手」的夹角（弧度）。 */
export function AimWeight(reach, angle, band = AIM_AT_LEFT) {
  const deg = THREE.MathUtils.radToDeg(angle);
  return Smooth(band.near, band.nearFull, reach) * (1 - Smooth(band.farFull, band.far, reach)) * (1 - Smooth(band.fullDeg, band.zeroDeg, deg));
}

/**
 * 把 quaternion 的 axis 方向（世界）往 to 方向转过去，按权重：quaternion 原地改，返回用的权重。
 * axis = 这一刻挂件的「枪口 / 刀尾」方向（单位向量），to = 「握点 → 左手掌心」（不必单位化），reach 按人物原尺寸的米。
 */
const _turn = new THREE.Quaternion(), _id = new THREE.Quaternion(), _to = new THREE.Vector3();
export function AimAt(quaternion, axis, to, reach, band = AIM_AT_LEFT) {
  _to.copy(to).normalize();
  const w = AimWeight(reach, axis.angleTo(_to), band);
  if (w > 1e-4) quaternion.premultiply(_turn.setFromUnitVectors(axis, _to).slerp(_id.identity(), 1 - w));
  return w;
}

// ---------------------------------------------------------------- 枪在动作里换地方

export const RIFLE_SLING = Object.freeze({
  behind: 0.2,      // 枪身中段在 Spine2 后面多远（X Bot 胸厚约 0.22 m，再加枪厚和背带余量；0.16 时扬手取枪那几帧枪托扎进臀部 5 cm）
  side: 0.1,         // 偏右多少（右肩胛）
  centerZ: -0.22,    // 枪的中段在枪坐标里的位置（握把 = 0，枪口朝 -Z，枪托到 +0.35）
  maxTiltDeg: 35,    // 枪身最多偏离竖直多少度
  minSpan: [0.1, 0.3],   // 掌心离背上那一点 0.1 m 以内枪身竖直，0.3 m 起照「背上那一点 → 掌心」，中间渐变（不一帧翻过去）
  palmBack: 0.035,   // 手握的是枪身表面：枪的轴线在掌心外侧（离身体更远）这么多
});
// kick：脱手时再给枪一个往身体外侧（胸口 → 枪、偏右，水平）的初速度，免得掉在倒下的身体底下（审查量到穿腿 6 cm、扑倒压枪 8 cm）
export const RIFLE_DROP = Object.freeze({ gravity: 9.8, settleS: 0.45, restY: 0.035, carry: 0.6, kick: 1.2 });
const DEFAULT_SETTLE_S = 0.6, DEFAULT_STOW_S = 0.5;

/**
 * 背在背上的枪（世界矩阵，缩放 1）：body = { right, up, spine }（世界：人物右方、Spine2 → Neck 方向、Spine2 位置），
 * palm = 交接那一刻的掌心。枪口朝上，枪身那条线过掌心和右肩胛后面那一点，准星朝后。
 */
export function SlungRifle(body, palm) {
  const { behind, side, centerZ, maxTiltDeg, minSpan } = RIFLE_SLING;
  const up = body.up.clone().normalize(), right = body.right.clone().normalize();
  const fwd = new THREE.Vector3().crossVectors(up, right).normalize();
  const anchor = body.spine.clone().addScaledVector(right, side).addScaledVector(fwd, -behind);
  const grip = palm.clone().addScaledVector(fwd, -RIFLE_SLING.palmBack);
  // 枪身方向：「背上那一点 → 掌心」（朝上那头当枪口），掌心太近或几乎水平时渐变回竖直，免得方向一帧翻过去
  const d = grip.clone().sub(anchor), span = d.length();
  if (span > 1e-6) d.divideScalar(span);
  const c = d.dot(up), w = Smooth(minSpan[0], minSpan[1], span) * Smooth(0.15, 0.4, Math.abs(c));
  const m = up.clone().multiplyScalar(1 - w).addScaledVector(d, Math.sign(c) * w).normalize();
  const maxTilt = THREE.MathUtils.degToRad(maxTiltDeg), tilt = m.angleTo(up);
  if (tilt > maxTilt) m.copy(up).lerp(m, maxTilt / tilt).normalize();
  // 线过掌心：中段取掌心沿枪身投到背上那一点的高度
  const center = grip.clone().addScaledVector(m, anchor.clone().sub(grip).dot(m));
  const z = m.clone().negate(), y = fwd.clone().negate().addScaledVector(z, fwd.dot(z)).normalize(), x = new THREE.Vector3().crossVectors(y, z);
  const origin = center.addScaledVector(m, centerZ);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(origin);
}

/**
 * 选中 / 开始播一条带 rifleTrack 的动作时调一次：sample(t) 把动作摆到 t 秒，返回这一刻
 * { rifle: 枪在手里的世界矩阵（照标定）, hand: 握枪那只手骨的世界矩阵, spine: Spine2 世界矩阵, body: { right, up, spine }, palm: 掌心世界位置 }。
 * 返回之后每帧给 RifleTrackPose 用的数据（背上的位姿存成相对 Spine2，交接时的握法存成相对手骨）。
 */
export function PrepareRifleTrack(track, sample, fps = 30) {
  if (!track) return null;
  const info = { track, settleS: track.settleS ?? DEFAULT_SETTLE_S, stowS: track.stowS ?? DEFAULT_STOW_S,
    grabHoldS: track.grabHoldS ?? 0, stowHoldS: track.stowHoldS ?? 0 };
  const Anchor = (t) => {
    const s = sample(t), slung = SlungRifle(s.body, s.palm);
    return { back: new THREE.Matrix4().copy(s.spine).invert().multiply(slung) };
  };
  // 换握开始那一刻「胸口 → 掌心」的水平方向（存成相对 Spine2），换握时枪口从这一侧绕
  const Outward = (t) => {
    const s = sample(t), d = s.palm.clone().sub(s.body.spine).projectOnPlane(s.body.up);
    if (d.lengthSq() < 1e-4) d.crossVectors(s.body.up, s.body.right);
    return d.normalize().transformDirection(new THREE.Matrix4().copy(s.spine).invert());
  };
  if (Number.isFinite(track.grabAt)) info.grab = { ...Anchor(track.grabAt), outward: Outward(track.grabAt + info.grabHoldS) };
  if (Number.isFinite(track.stowAt)) info.stow = { ...Anchor(track.stowAt), outward: Outward(track.stowAt - info.stowHoldS - info.stowS) };
  if (Number.isFinite(track.dropAt)) {
    const a = sample(track.dropAt - 1 / fps), b = sample(track.dropAt);
    const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion(), s0 = new THREE.Vector3(), p1 = new THREE.Vector3();
    b.rifle.decompose(p0, q0, s0); a.rifle.decompose(p1, new THREE.Quaternion(), new THREE.Vector3());
    // 往外 = 胸口 → 枪的水平方向再偏向人的右侧（枪在右手；往前扑倒的人不会压在枪上）
    const away = p0.clone().sub(b.body.spine).projectOnPlane(b.body.up);
    if (away.lengthSq() > 1e-6) away.normalize();
    away.add(b.body.right.clone().projectOnPlane(b.body.up).normalize()).setY(0);
    if (away.lengthSq() > 1e-6) away.normalize();
    // DropPose 把速度乘 carry，往外的那份先除回去
    info.release = { position: p0, quaternion: q0, velocity: p0.clone().sub(p1).multiplyScalar(fps).addScaledVector(away, RIFLE_DROP.kick / RIFLE_DROP.carry) };
  }
  return info;
}

const _m = new THREE.Matrix4(), _a = new THREE.Matrix4(), _pA = new THREE.Vector3(), _qA = new THREE.Quaternion(), _sA = new THREE.Vector3();
const _pB = new THREE.Vector3(), _qB = new THREE.Quaternion(), _sB = new THREE.Vector3();
const Ease = (k) => { const t = THREE.MathUtils.clamp(k, 0, 1); return t * t * (3 - 2 * t); };

// 方向的球面插值（a、b 单位向量，夹角要小于 180°）
function SlerpDir(a, b, t, out) {
  const ang = a.angleTo(b);
  if (ang < 1e-5) return out.copy(a);
  const s = Math.sin(ang);
  return out.copy(a).multiplyScalar(Math.sin((1 - t) * ang) / s).addScaledVector(b, Math.sin(t * ang) / s);
}
// 经过 via 的两段弧：起止几乎反向时四元数插值走哪边说不准（取枪换握量到一帧翻 90°），指定从身体外侧绕
function SlerpVia(a, b, bias, t, out) {
  const via = a.clone().add(b).addScaledVector(bias, 0.8).normalize();
  return t < 0.5 ? SlerpDir(a, via, t * 2, out) : SlerpDir(via, b, t * 2 - 1, out);
}
/** 两个枪位姿之间淡：位置线性，枪口（-Z）从 outward 那一侧绕（换握开始那一刻「胸口 → 掌心」的水平方向，离开躯干，跟着 Spine2 转；
 *  每帧现算的话手绕过胯边时这个方向会一下翻过去）、准星（+Y）从上面绕，再正交化。 */
const _mA = new THREE.Vector3(), _mB = new THREE.Vector3(), _yA = new THREE.Vector3(), _yB = new THREE.Vector3();
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _bm = new THREE.Matrix4();
function BlendRifle(from, to, e, body, outward, out) {
  from.decompose(_pA, _qA, _sA); to.decompose(_pB, _qB, _sB);
  SlerpVia(_mA.set(0, 0, -1).applyQuaternion(_qA), _mB.set(0, 0, -1).applyQuaternion(_qB), outward, e, _bz).normalize().negate();
  SlerpVia(_yA.set(0, 1, 0).applyQuaternion(_qA), _yB.set(0, 1, 0).applyQuaternion(_qB), body.up, e, _by);
  _bx.crossVectors(_by, _bz).normalize(); _by.crossVectors(_bz, _bx);
  return out.makeBasis(_bx, _by, _bz).setPosition(_pA.lerp(_pB, e));
}

/**
 * 这一刻枪在哪：info = PrepareRifleTrack 的结果，t = 动作时间，now = { rifle, hand, spine, body, palm }（这一刻的，同 sample），
 * groundY = 地面高度。位置朝向写进 out（{ position, quaternion }），返回 "hand" | "back" | "regrip" | "drop"。
 * 返回 "hand" 时 out 就是 now.rifle（照标定在手里），宿主照常做左手 IK 等。
 */
export function RifleTrackPose(info, t, now, groundY, out) {
  const track = info?.track;
  let mode = "hand";
  if (!track) mode = "hand";
  else if (info.release && t >= track.dropAt) {
    DropPose(info.release, t - track.dropAt, groundY, out);
    return "drop";
  } else if (info.grab && t < track.grabAt) {
    _m.multiplyMatrices(now.spine, info.grab.back); mode = "back";
  } else if (info.stow && t >= track.stowAt) {
    _m.multiplyMatrices(now.spine, info.stow.back); mode = "back";
  } else if (info.grab && t < track.grabAt + info.grabHoldS + info.settleS) {
    BlendRifle(SlungRifle(now.body, now.palm), now.rifle, Ease((t - track.grabAt - info.grabHoldS) / info.settleS), now.body, info.grab.outward.clone().transformDirection(now.spine), _m);
    mode = "regrip";
  } else if (info.stow && t >= track.stowAt - info.stowHoldS - info.stowS) {
    BlendRifle(now.rifle, SlungRifle(now.body, now.palm), Ease((t - track.stowAt + info.stowHoldS + info.stowS) / info.stowS), now.body, info.stow.outward.clone().transformDirection(now.spine), _m);
    mode = "regrip";
  }
  (mode === "hand" ? now.rifle : _m).decompose(out.position, out.quaternion, _sA);
  return mode;
}

/**
 * 掉地的枪：release = { position, quaternion, velocity }（脱手那一刻，世界），since = 脱手后秒数，groundY = 地面高度。
 * 按初速度的 carry 倍抛出去、重力落下；朝向 settleS 秒内转成「枪身水平、侧躺」（保留枪口的水平朝向）。结果写进 out。
 */
const _flat = new THREE.Quaternion(), _fwd = new THREE.Vector3(), _mm = new THREE.Matrix4();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
export function DropPose(release, since, groundY, out) {
  const { gravity, settleS, restY, carry } = RIFLE_DROP;
  const v = release.velocity, p0 = release.position, rest = groundY + restY;
  const vy = v.y * carry, fall = Math.max(0, p0.y - rest);
  const land = (vy + Math.sqrt(vy * vy + 2 * gravity * fall)) / gravity;
  const s = Math.min(since, land);
  out.position.set(p0.x + v.x * carry * s, Math.max(rest, p0.y + vy * s - 0.5 * gravity * s * s), p0.z + v.z * carry * s);
  _fwd.set(0, 0, -1).applyQuaternion(release.quaternion).setY(0);
  if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
  _fwd.normalize();
  _z.copy(_fwd).negate();
  _y.set(0, 1, 0).cross(_z).normalize();         // 侧躺：准星朝侧面
  _x.crossVectors(_y, _z);
  _flat.setFromRotationMatrix(_mm.makeBasis(_x, _y, _z));
  const k = Math.min(1, since / Math.min(settleS, Math.max(land, 0.15)));
  out.quaternion.copy(release.quaternion).slerp(_flat, k * k * (3 - 2 * k));
  return out;
}
