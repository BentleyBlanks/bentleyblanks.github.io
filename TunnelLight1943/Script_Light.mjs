// 《地道里的光》 —— 2D 遮挡光照。
//
// 画面是剖面：土是实心的，地道是掏出来的空腔。灯必须只照亮空腔，
// 照不穿土层，也不能从地面漏进地道。做法：
//   1) 按场景烘一张"遮挡掩码"（白=实心土/墙，黑=空气），
//   2) 每盏灯是一个覆盖其半径的四边形，片元着色器从当前像素沿直线
//      步进到光源，途中撞到实心就判为在阴影里。
// 等价于对遮挡场做可见性查询，比逐灯生成阴影网格简单，且天然支持
// "光从竖井口漏下去"这种剖面特有的效果。

import * as THREE from "three";

const MASK_PPM = 6;   // 掩码分辨率（像素/米）——只用于可见性，不需要很高

/**
 * 烘一张遮挡掩码。
 * solids: [{x0,y0,x1,y1}] 实心矩形（世界坐标，y 向上）
 * air:    [{x0,y0,x1,y1}] 从实心里挖回空气的矩形（后处理，优先级更高）
 */
export function BuildOccluder(bounds, solids, air) {
  const w = Math.max(8, Math.ceil((bounds.x1 - bounds.x0) * MASK_PPM));
  const h = Math.max(8, Math.ceil((bounds.y1 - bounds.y0) * MASK_PPM));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  // 掩码里 y 轴向下，世界 y 向上，作一次翻转
  const toPx = (x) => (x - bounds.x0) * MASK_PPM;
  const toPy = (y) => (bounds.y1 - y) * MASK_PPM;

  ctx.fillStyle = "#000";           // 默认空气
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";           // 实心
  for (const s of solids) {
    ctx.fillRect(toPx(s.x0), toPy(s.y1), (s.x1 - s.x0) * MASK_PPM, (s.y1 - s.y0) * MASK_PPM);
  }
  ctx.fillStyle = "#000";           // 掏回空气（地道、洞室、竖井）
  for (const a of air) {
    ctx.fillRect(toPx(a.x0), toPy(a.y1), (a.x1 - a.x0) * MASK_PPM, (a.y1 - a.y0) * MASK_PPM);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return {
    texture: tex,
    canvas,
    min: new THREE.Vector2(bounds.x0, bounds.y0),
    size: new THREE.Vector2(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0),
  };
}

const VERT = `
varying vec2 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xy;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// 动态遮挡体上限。人是站在灯前的，投出的影子比土墙的更会说话——
// 一盏马灯扫过院子，墙上先出现的是提灯那个人被拉长的影子。
export const MAX_BLOCKERS = 8;

const FRAG = `
precision highp float;
uniform sampler2D uMask;
uniform vec2 uMaskMin;
uniform vec2 uMaskSize;
uniform vec2 uLightPos;
uniform float uRadius;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uSoft;
uniform int uBlockerCount;
uniform vec4 uBlockers[${MAX_BLOCKERS}];   // xy=中心 zw=半宽半高
varying vec2 vWorld;

float SolidAt(vec2 w) {
  vec2 uv = (w - uMaskMin) / uMaskSize;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture2D(uMask, uv).r;
}

// 动态遮挡（人体）：软边一点，人的影子边缘本来就不该是刀切的
float BlockedAt(vec2 p) {
  float hit = 0.0;
  for (int i = 0; i < ${MAX_BLOCKERS}; i++) {
    if (i >= uBlockerCount) break;
    vec4 b = uBlockers[i];
    vec2 q = abs(p - b.xy) - b.zw;
    float inside = max(q.x, q.y);
    hit = max(hit, 1.0 - smoothstep(-0.06, 0.07, inside));
  }
  return hit;
}

void main() {
  vec2 d = vWorld - uLightPos;
  float dist = length(d);
  if (dist > uRadius) discard;

  // 距离衰减：近处不过曝，边缘干净收掉
  float fall = 1.0 - dist / uRadius;
  fall = fall * fall * (0.35 + 0.65 * fall);

  // 沿光线步进：撞到实心即被挡住。
  // 步长必须按**世界尺度**取，不能把固定步数摊到整段距离上——地道净高不到
  // 两米、洞顶到地表的土层也就两米出头，而暗适应那盏灯半径 17 米，等分 18 步
  // 时步长将近一米，斜着穿过土层的光线会整段跳过去，于是灯光糊到土里。
  const int STEPS = 48;
  float stepLen = max(dist / float(STEPS), 0.16);
  vec2 dir = d / max(dist, 1e-4);
  float lit = 1.0;
  for (int i = 1; i <= STEPS; i++) {
    float t = float(i) * stepLen;
    if (t >= dist) break;
    vec2 p = vWorld - dir * t;
    // 土墙挡死
    if (SolidAt(p) > 0.5) { lit = 0.0; break; }
    // 人挡光不挡死：半影里还留一点点，才不像贴了张黑纸
    lit = min(lit, 1.0 - BlockedAt(p) * 0.92);
  }
  // 着色点本身就在土里：只留一点点，让洞壁上下沿有受光感；
  // 再往土里深一点，上面的步进会判成全黑。光就此收在地道的上下边缘里。
  float selfSolid = SolidAt(vWorld);

  // 软化：贴着遮挡面的一圈不要硬切
  float edge = smoothstep(0.0, uSoft, dist);
  float v = fall * mix(1.0, lit, edge) * uIntensity * mix(1.0, 0.22, selfSolid);
  gl_FragColor = vec4(uColor * v, v);
}
`;

/** 造一盏带遮挡的灯 */
export function CreateOccludedLight(occluder, { radius = 5, color = 0xffc878, intensity = 1 } = {}) {
  const blockers = [];
  for (let i = 0; i < MAX_BLOCKERS; i += 1) blockers.push(new THREE.Vector4(0, 0, 0, 0));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMask: { value: occluder.texture },
      uMaskMin: { value: occluder.min },
      uMaskSize: { value: occluder.size },
      uLightPos: { value: new THREE.Vector2() },
      uRadius: { value: radius },
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uSoft: { value: 0.55 },
      uBlockerCount: { value: 0 },
      uBlockers: { value: blockers },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  mesh.renderOrder = 60;
  mesh.userData.SetLight = (x, y, z = 0.4) => {
    mesh.position.set(x, y, z);
    mat.uniforms.uLightPos.value.set(x, y);
  };
  mesh.userData.SetIntensity = (v) => { mat.uniforms.uIntensity.value = v; };
  // boxes: [{x, y, hw, hh}]，只取离本灯最近的前 MAX_BLOCKERS 个
  mesh.userData.SetBlockers = (boxes) => {
    const lx = mat.uniforms.uLightPos.value.x;
    const ly = mat.uniforms.uLightPos.value.y;
    const r = mat.uniforms.uRadius.value;
    const near = [];
    for (const b of boxes) {
      // 灯就在这个体积里（提灯的人自己）——照他自己不算被挡
      if (Math.abs(lx - b.x) < b.hw + 0.05 && Math.abs(ly - b.y) < b.hh + 0.05) continue;
      const d = Math.hypot(lx - b.x, ly - b.y);
      if (d > r) continue;
      near.push({ b, d });
    }
    near.sort((p, q) => p.d - q.d);
    const n = Math.min(near.length, MAX_BLOCKERS);
    for (let i = 0; i < n; i += 1) {
      const { b } = near[i];
      mat.uniforms.uBlockers.value[i].set(b.x, b.y, b.hw, b.hh);
    }
    mat.uniforms.uBlockerCount.value = n;
  };
  mesh.userData.SetRadius = (r) => {
    mat.uniforms.uRadius.value = r;
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(r * 2, r * 2);
  };
  return mesh;
}

// ────────────────────────────────────────────────────────────────────────
// 打进来的光（2026-08-13 用户定：「序章里的打进来的光要做出来」）
//
// 老版是**烘在井壁贴图上的几道渐变**：它被剪在井筒的剪影里，所以那几条光
// 只存在于洞顶以上那截土管子里，窖底那间屋子——正是两个孩子蹲着的地方——
// 一丝光都没有。而且它画的是"墙上有几道亮痕"，不是"空气里有一束光"。
//
// 现在按 SDF 现算：每条光是一条**从板缝射下来的楔形**，
//   · 到光轴的横向距离减去该处半宽 = 有符号距离，softstep 出柔边（这就是 SDF），
//   · 半宽随行程线性张开——板缝窄、落到地上摊开一块，
//   · 沿程按 mask 往回步进一次：撞到实心土就没有光（洞顶以上的土层自然吃掉，
//     光只在掏空的窖里存在），
//   · **人挡得住光**：躯干进了光柱，光柱在他身上断一截（uBlockers 与灯共用）
//     ——这是"打进来的光"和"墙上画了几道黄条"的分界线，
//   · 光柱里有浮尘、落点有一摊亮斑。
//
// 与灯不同，这里的遮挡步进只做**一次**（所有光柱共用一个源点方向），
// 而且**先算 SDF、光柱外的片元当场 discard**——不然满屏都在跑步进。
export const MAX_SHAFTS = 4;

const SHAFT_FRAG = `
precision highp float;
uniform sampler2D uMask;
uniform vec2 uMaskMin;
uniform vec2 uMaskSize;
uniform vec2 uOrigin;      // 板缝所在（窖口中心，地表高度）
uniform vec2 uDir;         // 光的方向（朝下，斜的时候往东偏）
uniform vec4 uShafts[${MAX_SHAFTS}];   // x=缝相对窖口的横向偏移 y=缝口半宽 z=每米张开 w=亮度
uniform vec4 uShaftEx[${MAX_SHAFTS}];  // x=每米偏多少（各缝不平行）y=噪声相位 z=落地亮斑 w=间接光
uniform int uCount;
uniform float uLen;        // 打得多远
uniform float uFloorY;     // 落到哪儿（窖底）
uniform float uIntensity;
uniform float uDust;
uniform float uTime;
uniform vec3 uColor;       // 直射：外头的天光
uniform vec3 uBounceColor; // 反射回来的：在土地上滚过一道，暖得多也脏得多
uniform int uBlockerCount;
uniform vec4 uBlockers[${MAX_BLOCKERS}];
varying vec2 vWorld;

float SolidAt(vec2 w) {
  vec2 uv = (w - uMaskMin) / uMaskSize;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture2D(uMask, uv).r;
}

// 人体挡光：**一整条线段一次解析算完，不许在步进里逐点去问**
//（2026-08-17 用户报「日军走过时地下的灯光效果有锯齿」）。
// 老版是在沿光轴的步进里每一步调一次 BlockedAt，而步长
// stepLen = max(dist/22, 0.12) 是按**每个片元自己的 dist** 算的：采样格子的
// 相位每往下挪一行就变一点，于是"这一路上撞没撞到人"成了 dist 的锯齿函数。
// 踩在板缝上的那个兵尤其致命——他的脚只跟光轴顶端那 16 厘米重叠，能不能被
// 采到全看余数落在哪，那道光当场被切成一节一节的横杠（实拍 solON/solOFF 对照，
// 兵一走横杠还跟着往下爬）。
// 挡光的本来就是几个轴对齐的方盒，线段到盒子的距离直接算得出来：连续、没有
// 格子、也比 22 次纹理取样便宜。
//   p0  线段起点（着色点 / 亮斑落点）
//   dir 单位方向（朝光源那头）
//   len 线段长度（到光源为止）
float BlockedSeg(vec2 p0, vec2 dir, float len) {
  float hit = 0.0;
  for (int i = 0; i < ${MAX_BLOCKERS}; i++) {
    if (i >= uBlockerCount) break;
    vec4 b = uBlockers[i];
    // 线段上离盒心最近的那一点（超出两端就夹回端点）
    float tc = clamp(dot(b.xy - p0, dir), 0.0, len);
    vec2 q = abs(p0 + dir * tc - b.xy) - b.zw;
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    // 半影给得**很省**：光源是一条几毫米的板缝，近乎点光源，影子本来就该是硬的。
    // 这点软只为两件事——抗锯齿，以及"方盒子只是人的粗胚"。越远的遮挡物越软
    float soft = 0.05 + 0.03 * tc;
    hit = max(hit, 1.0 - smoothstep(-soft, soft, sd));
  }
  return hit;
}

float Hash21(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}

void main() {
  vec2 perp = vec2(uDir.y, -uDir.x);
  vec2 rel = vWorld - uOrigin;
  float tAxis = dot(rel, uDir);
  // 间接光要泼到光柱以外去，所以纵向范围比光柱本身多留一段
  if (tAxis < -0.35 || tAxis > uLen + 2.0) discard;

  float core = 0.0;      // 亮芯：里头那根细亮线
  float glow = 0.0;      // 芯子外那一圈散射（"光柱"的形其实全在这一层上）
  float pool = 0.0;      // 落地那摊亮斑
  float bounce = 0.0;    // 间接光：亮斑当面光源往窖里泼的那一层
  vec2 bounceSrc = vWorld;
  vec2 poolSrc = vWorld;
  float bestPool = 0.0;
  for (int i = 0; i < ${MAX_SHAFTS}; i++) {
    if (i >= uCount) break;
    vec4 s = uShafts[i];
    vec4 e = uShaftEx[i];
    vec2 o = uOrigin + perp * s.x;
    vec2 d = vWorld - o;
    float t = dot(d, uDir);
    // 每条缝自己歪一点点（板是三块拼的，缝也就不会互相平行）——
    // 三根一模一样、一样粗、一样亮、还严格平行的柱子，人眼当场读成三根管子
    float lat = dot(d, perp) - e.x * t;

    // ── 落地那摊 + 它反射出来的间接光（光柱外的片元也要算）──
    if (uDir.y < -0.001) {
      float tf = (uFloorY - o.y) / uDir.y;
      if (tf > 0.0) {
        vec2 hit = o + uDir * tf + perp * (e.x * tf);
        float hwf = max(s.y + s.z * tf, 0.02);
        // 亮斑：一个很亮的芯 + 一圈拖得很开的裙边（硬边缘＝贴了张纸）
        vec2 q = (vWorld - hit) / vec2(hwf * 3.2, hwf * 1.1);
        float r2 = dot(q, q);
        // **不许漏到窖底以下**：掩码把地面往下 0.2m 也算成空气（走廊那条
        // air 矩形从 UNDER_Y−0.2 起），不夹住的话地面底下会亮出一个跟洞室
        // 一样宽的方块——边缘是刀切的，实拍第一眼就是"地上贴了张亮纸"
        float onFloor = smoothstep(uFloorY - 0.26, uFloorY - 0.04, vWorld.y);
        // 0.30 是**不许过曝**定的：三条缝的亮斑在窖底本来就叠在一处，而亮度按
        // 外头的天光给（窖里亮不亮不影响它），c2 那间没压暗的窖里一叠就是一摊死白
        float pw = (exp(-r2 * 1.7) + 0.34 * exp(-r2 * 0.20)) * s.w * e.z * 0.30 * onFloor;
        if (pw > bestPool) { bestPool = pw; poolSrc = hit; }
        pool += pw;
        // **间接光**（2026-08-17 用户："也没有什么间接光照出来"）：
        // 直射打在地上以后不会就此消失——那摊亮斑本身是一盏很软的面光源，
        // 把窖底、身上和四壁的下半截整个提起来一档。老版一点都没有，
        // 于是光"落地即止"，四周还是死黑，读出来就是几根发光的棍子插在黑屋里。
        vec2 bq = (vWorld - hit - vec2(0.0, 0.18)) / vec2(1.0, 0.80);
        float b2 = dot(bq, bq);
        // 从地上反上来的光**主要照下半截**：越往上越弱，窖顶该留着黑
        float up = mix(1.0, 0.30, clamp((vWorld.y - uFloorY) / 1.9, 0.0, 1.0));
        float w = exp(-b2 * 0.26) * s.w * e.w * 0.165 * up * onFloor;
        if (w > bounce) bounceSrc = hit + vec2(0.0, 0.05);
        bounce += w;
      }
    }

    if (t < -0.05 || t > uLen) continue;
    float hw = max(s.y + s.z * t, 0.004);
    // 亮芯**要按张开量变淡**（能量守恒）：一条宽度不变、亮度也不变的光带，
    // 不管柔边给得多软，读出来都是一根圆筒。张多宽就淡多少，它才是个楔形
    float sd = lat / hw;
    float k = exp(-sd * sd * 2.4) * (s.y / hw);
    // 外圈的散射**张得比芯子快得多**：一条真的光柱是"一根亮线裹在一团雾里"，
    // 越往下雾越开、越淡。老版只有芯子这一层，所以边缘是刀切的
    // 外圈**只张 2.2 倍**：张得太开三条就并成一团，画面上又剩"一根胖柱子"
    float gw = hw * (1.0 + 2.2 * t / uLen);
    float sg = lat / gw;
    // 指数取 0.55 不是 1.0：严格按 1/宽 收的话，外圈那层张到三倍就只剩三分之一，
    // 张开的那截自己先没了；而它正是"光柱"读出来的那个形
    glow += exp(-sg * sg * 0.85) * pow(s.y / gw, 0.55) * 0.17 * s.w * exp(-t * 0.24);
    // 沿程的浓淡：空气不是均质的，尘也不是均匀铺的。**这一条是"不像塑料棒"
    // 的正主**——一根亮度沿程不变的光带，形状再对也是发光体不是被照亮的空气
    float rip = 0.78 + 0.22 * sin(t * 4.7 + e.y) * cos(t * 2.3 - e.y * 1.6 + uTime * 0.22);
    // 芯子要压得过外圈那层雾：三条缝各自的那根亮线读不出来的话，画面上还是
    // 一团光晕——"板缝里漏下来几条光"这句话就没在画面上成立
    core += k * exp(-t * 0.20) * rip * s.w * 1.55;
  }
  float direct = core + glow;
  if (direct + pool + bounce < 0.0025) discard;

  // ── 挡住没有：土层挡死，人挡一截。**这一条只管空气里那段光柱**：
  // 从着色点顺着光轴往回走，问"这一路上有没有东西"。
  // 土层还是步进（掩码是一张贴图，只能采样；但它不动，采样格子再粗也不会闪）；
  // **人体那一路走解析式**（BlockedSeg，见上）——挂在这条步进上就是那道锯齿
  float lit = 1.0;
  if (direct > 0.002) {
    const int STEPS = 22;
    float dist = max(tAxis, 0.02);
    float stepLen = max(dist / float(STEPS), 0.12);
    for (int i = 1; i <= STEPS; i++) {
      float t = float(i) * stepLen;
      if (t >= dist) break;
      if (SolidAt(vWorld - uDir * t) > 0.5) { lit = 0.0; break; }
    }
    // 人挡光不挡死：半影里还留一点点，才不像贴了张黑纸
    lit = min(lit, 1.0 - BlockedSeg(vWorld, -uDir, dist) * 0.94);
  }
  float selfSolid = SolidAt(vWorld);
  // 着色点自己就在土里：一点点受光感，不然洞壁没有被照到的样子
  float directLit = lit * mix(1.0, 0.25, selfSolid);

  // 落地那摊亮斑的遮挡要**在光轴上算一次**，不许逐片元竖着回溯。
  // 它是地上的一块光，不是空气里的一段：拿裙边上每个像素各自往上打一条射线，
  // 等于给这摊光做了一次竖直可见性测试——于是它被洞室那个 6 像素/米的方盒子
  // 齐刷刷切掉两边，画面上是一块**边缘刀切的亮方块**（这一版实拍抓的）。
  float poolLit = 0.0;
  if (pool > 0.002) {
    float L2 = length(poolSrc - uOrigin);
    poolLit = 1.0;
    for (int i = 1; i <= 16; i++) {
      if (SolidAt(poolSrc - uDir * (L2 * float(i) / 17.0)) > 0.5) { poolLit = 0.0; break; }
    }
    // 人挡在光轴上时这摊亮斑跟着灭——但要**灭得像影子挪过去**，不是整摊一起
    // 跳闸：poolSrc 全屏只有三个点，逐点采样的话兵一跨进那格，整摊光当场消失
    poolLit = min(poolLit, 1.0 - BlockedSeg(poolSrc, -uDir, L2) * 0.94);
  }

  // 间接光自己的遮挡：从这一点连到亮斑，中间隔着土就照不到。
  // 走八步就够——间接光本来就软，边界糊一点反倒对
  float bLit = 0.0;
  if (bounce > 0.0012) {
    vec2 dd = bounceSrc - vWorld;
    float L = length(dd);
    bLit = 1.0;
    if (L > 0.05) {
      vec2 dn = dd / L;
      float acc = 0.0;
      for (int i = 1; i <= 8; i++) {
        acc += SolidAt(vWorld + dn * (L * float(i) / 9.0));
      }
      // **软透射**，不是"撞到土就归零"。掩码只有 6 像素/米、而且是一堆
      // 轴对齐的方盒子：一撞就断的话，窖底会浮出一个边缘刀切的亮方块
      //（第一版实拍抓到的就是这个）。按吃到的实心量指数衰减，边界自己糊开
      bLit = exp(-acc * 0.62);
      // 挡在中间的人也吃掉一截，但**只吃一截**：间接光的源是地上那一大摊，
      // 一个人挡不干净它。同样走解析式，不然人一动这层也跟着起横杠
      bLit *= mix(1.0, 0.33, BlockedSeg(vWorld, dn, L));
    }
    // 打在土墙上的间接光**要留下来**——照亮四壁正是它的活；
    // 只把埋在土里的那部分收掉一档
    bLit *= mix(1.0, 0.62, selfSolid);
  }

  // ── 浮尘：光柱里才看得见的那些小颗粒，慢慢往下飘 ──
  float dust = 0.0;
  if (uDust > 0.0 && core > 0.02) {
    vec2 cell = vec2(vWorld.x * 7.0, vWorld.y * 7.0 - uTime * 0.35);
    vec2 id = floor(cell);
    float rnd = Hash21(id);
    float d = length(fract(cell) - vec2(0.35 + 0.3 * rnd, 0.5));
    dust = smoothstep(0.30, 0.02, d) * step(0.86, rnd) * uDust * core;
  }

  float dv = (direct * directLit + pool * poolLit + dust) * uIntensity;
  float bv = bounce * bLit * uIntensity;
  // **不许再走 vec4(color*v, v) ＋ AdditiveBlending**：那一档的混合是
  // src.rgb × src.a + dst，于是屏幕上拿到的是 color·v²——很淡的那几层
  // （外圈散射、间接光、亮斑的裙边）被平方一压全没了，只剩下最亮的芯子，
  // 也就正好剩下"三根发光的棍子"。现在走 One/One 的真加法，写多少加多少。
  gl_FragColor = vec4(uColor * dv + uBounceColor * bv, 1.0);
}
`;

/**
 * 造一束"打进来的光"。所有几何参数都按世界米给，摆位由 SetShafts 决定。
 */
export function CreateLightShafts(occluder, {
  color = 0xe8dcb6, bounceColor = 0xc7a173, span = 12, height = 6,
} = {}) {
  const shafts = [];
  const shaftEx = [];
  for (let i = 0; i < MAX_SHAFTS; i += 1) {
    shafts.push(new THREE.Vector4(0, 0, 0, 0));
    shaftEx.push(new THREE.Vector4(0, 0, 0, 0));
  }
  const blockers = [];
  for (let i = 0; i < MAX_BLOCKERS; i += 1) blockers.push(new THREE.Vector4(0, 0, 0, 0));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMask: { value: occluder.texture },
      uMaskMin: { value: occluder.min },
      uMaskSize: { value: occluder.size },
      uOrigin: { value: new THREE.Vector2() },
      uDir: { value: new THREE.Vector2(0, -1) },
      uShafts: { value: shafts },
      uShaftEx: { value: shaftEx },
      uCount: { value: 0 },
      uLen: { value: height },
      uFloorY: { value: -3.6 },
      uIntensity: { value: 0 },
      uDust: { value: 1 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uBounceColor: { value: new THREE.Color(bounceColor) },
      uBlockerCount: { value: 0 },
      uBlockers: { value: blockers },
    },
    vertexShader: VERT,
    fragmentShader: SHAFT_FRAG,
    transparent: true,
    // 真加法（One/One）。THREE.AdditiveBlending 是 SrcAlpha/One，
    // 而这个着色器把浓度同时写进 rgb 与 a，乘起来就成了 v² —— 见片元末尾那段
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquation: THREE.AddEquation,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(span, height), mat);
  mesh.userData.uniforms = mat.uniforms;
  // 光柱平面挂在窖口正下方那块空气上（origin 在上沿中点）
  mesh.userData.SetOrigin = (x, y, z = 0.5) => {
    mesh.position.set(x, y - height / 2, z);
    mat.uniforms.uOrigin.value.set(x, y);
  };
  mesh.userData.SetSlant = (slant) => {
    const len = Math.hypot(slant, 1);
    mat.uniforms.uDir.value.set(slant / len, -1 / len);
  };
  // list: [{off, half, spread, gain, tilt, seed, pool, bounce}]
  //   tilt   每米往边上偏多少（各条缝不平行——三根严格平行的等宽柱子＝三根管子）
  //   seed   沿程浓淡噪声的相位（每条各走各的）
  //   pool   落地那摊亮斑的增益
  //   bounce 这摊亮斑往窖里泼的间接光增益
  mesh.userData.SetShafts = (list) => {
    const n = Math.min(list.length, MAX_SHAFTS);
    for (let i = 0; i < n; i += 1) {
      const s = list[i];
      shafts[i].set(s.off, s.half, s.spread, s.gain);
      shaftEx[i].set(s.tilt || 0, s.seed || 0, s.pool ?? 1, s.bounce ?? 1);
    }
    mat.uniforms.uCount.value = n;
  };
  mesh.userData.SetIntensity = (v) => { mat.uniforms.uIntensity.value = v; };
  mesh.userData.SetFloor = (y) => { mat.uniforms.uFloorY.value = y; };
  mesh.userData.SetDust = (v) => { mat.uniforms.uDust.value = v; };
  mesh.userData.SetTime = (t) => { mat.uniforms.uTime.value = t; };
  mesh.userData.SetBlockers = (boxes) => {
    const ox = mat.uniforms.uOrigin.value.x;
    const near = [];
    for (const b of boxes) {
      if (Math.abs(b.x - ox) > span * 0.75) continue;
      near.push({ b, d: Math.abs(b.x - ox) });
    }
    near.sort((p, q) => p.d - q.d);
    const n = Math.min(near.length, MAX_BLOCKERS);
    for (let i = 0; i < n; i += 1) {
      const { b } = near[i];
      blockers[i].set(b.x, b.y, b.hw, b.hh);
    }
    mat.uniforms.uBlockerCount.value = n;
  };
  return mesh;
}

/** 由场景数据推出遮挡矩形（土层实心，地道/洞室/竖井是空气） */
export function SceneOccluders(sceneDef, state, SURFACE_Y, UNDER_Y) {
  const L = sceneDef.length;
  const bounds = { x0: -40, y0: UNDER_Y - 6, x1: L + 40, y1: SURFACE_Y + 20 };
  const solids = [];
  const air = [];

  // 地面以下全部是土
  solids.push({ x0: bounds.x0, y0: bounds.y0, x1: bounds.x1, y1: SURFACE_Y });

  const range = sceneDef.walk.under;
  if (range) {
    // 地道走廊：掏成空气
    air.push({ x0: range[0] - 1.5, y0: UNDER_Y - 0.2, x1: range[1] + 1.5, y1: UNDER_Y + 1.55 });
    // 洞室与旁洞更高
    for (const p of sceneDef.props) {
      if (p.kind === "chamber") {
        air.push({ x0: p.x - p.w / 2, y0: UNDER_Y - 0.2, x1: p.x + p.w / 2, y1: UNDER_Y + 3.0 });
      } else if (p.kind === "pocket") {
        air.push({ x0: p.x - 2.8, y0: UNDER_Y - 0.2, x1: p.x + 2.8, y1: UNDER_Y + 2.5 });
      }
    }
    // 竖井：从地面通到地道顶，光可以顺着漏下去。
    // 下沿要**探进走廊里**（1.4 < 走廊顶 1.55）：接口处留一条 5 厘米的实心，
    // 掩码只有 6 像素/米，那条缝照样能把顺井打下来的光整束切断
    for (const shaft of sceneDef.shafts) {
      if (shaft.builtFlag && !state.flags[shaft.builtFlag]) continue;
      air.push({ x0: shaft.x - 0.85, y0: UNDER_Y + 1.4, x1: shaft.x + 0.85, y1: SURFACE_Y + 0.3 });
    }
  }

  // 地上的房子与高墙挡光
  for (const p of sceneDef.props) {
    if (p.kind === "house") {
      solids.push({ x0: p.x - p.w / 2, y0: SURFACE_Y, x1: p.x + p.w / 2, y1: SURFACE_Y + p.h });
    } else if (p.kind === "fortWall" || (p.kind === "wallSeg" && (p.h || 0) >= 1.6)) {
      solids.push({ x0: p.x - (p.w || 1) / 2, y0: SURFACE_Y, x1: p.x + (p.w || 1) / 2, y1: SURFACE_Y + (p.h || 2) });
    } else if (p.kind === "blockhouse") {
      solids.push({ x0: p.x - 2, y0: SURFACE_Y, x1: p.x + 2, y1: SURFACE_Y + 6 });
    }
  }

  return { bounds, solids, air };
}
