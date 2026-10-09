// Particle renderer materials. Scheduling, modules and ownership live in ParticleSystem.
import {PARTICLE_GPU_MODULES} from './Script_ParticleGpuModules.mjs';
import {PARTICLE_DENSITY_GLSL} from './Script_ParticleDensity.mjs';
export const GLSL_NOISE = /* glsl */`
float Hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
// 一层 value noise 就够把"完美圆片"打碎；烟的填充率很高，别在这里堆八度。
float Vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = Hash21(i), b = Hash21(i + vec2(1.0, 0.0));
  float c = Hash21(i + vec2(0.0, 1.0)), d = Hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

export const VERT_PARTICLE = /* glsl */`
${PARTICLE_GPU_MODULES}
uniform float uParticleSlot;
uniform float uParticleAspect;
#ifdef VOLUME_SMOKE
varying vec3 vVolumeRight;
varying vec3 vVolumeUp;
varying vec3 vVolumeToward;
#endif
attribute vec2 iSpawnLife;   // x 生成时刻 y 寿命（0 = 空槽）
attribute vec3 iOrigin;
attribute vec3 iVelocity;
attribute vec3 iAccel;       // 重力 / 浮力 / 风
attribute vec2 iSize;        // 起始半径 -> 结束半径（米）
attribute vec2 iSpin;        // 起始角 / 角速度
attribute vec3 iColorA;
attribute vec3 iColorB;
attribute vec4 iEmitterColor;
attribute vec4 iParams;      // x 峰值不透明度 y 淡入占比 z 阻尼系数 w 种子
attribute vec4 iExtra;       // x 拉伸长度(米) y 闪烁频率 z 地面高度（光束池：像素上限半宽）
                             // w 序列帧起始帧（拉伸池：像素保底半宽）
#ifdef ORIENT_NORMAL
attribute vec3 iNormal;
#endif

uniform float uTime;
#if defined(SHAPE_STREAK) || defined(SHAPE_BEAM)
uniform vec2 uResolution;      // 渲染分辨率：拉伸池按它把「几个像素」换算成米
#endif
#ifdef SHAPE_BEAM
// 光束不走弹道积分，iSpin / iAccel 空着，借来递光束参数：
// x 飞行时间(秒) y 余辉时间常数(秒) z 全长(米) w 弹头亮段(米)
varying vec4 vBeam;
varying float vBeamTrail;      // 余辉相对弹头的亮度（iAccel.y）
varying float vBeamMuzzleFade; // 枪口端淡入长度（米，iAccel.z）
#endif
uniform float uGlobalFade;
uniform float uFadeOutStart;   // 淡出起点：普通池 0.45，序列帧火球 0.82（16 帧要播完）
#ifdef AERIAL
uniform vec3 uSunDirection;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform float uFogBase;
uniform float uFogMax;
uniform vec3 uFogColorSky;
uniform vec3 uFogColorGround;
uniform float uFogSunGain;
uniform vec3 uSunColorFog;
varying vec4 vAerial;        // rgb 雾色 / a 雾量。逐顶点算：片子只有四个角，逐片元纯浪费
#endif

varying vec2 vShape;
varying vec3 vColor;
varying vec3 vColorAlt;      // 生命末端色，弹孔那种"同一片上要两个颜色"的形状要用
varying float vAlpha;
varying float vSeed;
varying float vAge01;
varying float vAgeS;           // 已活秒数：预警准星的闪频与脉冲相位按真实秒走，不按寿命比例
varying vec4 vModuleTint;
varying float vFrame;          // 序列帧池的起始帧；其余池恒为 0
varying float vViewDepth;
#if defined(LIT) || defined(LIT_SURFACE)
varying vec3 vLitNormal;
#endif
#ifdef SHAPE_DECAL
varying float vRays;       // 放射断口线的强度：弹孔 1、爆炸焦痕 0
varying float vDecalSize;  // 深度裁边容差要随贴花尺寸增长；焦痕比弹孔跨过更多地表起伏
varying vec3 vDecalTangent;
varying vec3 vDecalBitangent;
varying vec3 vDecalWorldPosition;
#endif
#ifdef LIT
varying vec3 vViewDir;     // 世界空间视线（相机 -> 粒子），前向散射要用
#endif

void main() {
  float life = iSpawnLife.y;
  float age = uTime - iSpawnLife.x;
  if (life <= 0.0 || age < 0.0 || age > life || ParticleNoise(uParticleSlot).w<.5) {
    // 死槽推出裁剪体：四个角落在同一点，光栅化直接丢掉，比每帧压缩缓冲区便宜得多
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float t01 = clamp(age / life, 0.0, 1.0);
  vec4 moduleParameters=mix(ParticleCurve(uParticleSlot,2.,t01),ParticleCurve(uParticleSlot,3.,t01),iParams.w);
  vec4 moduleColor=mix(ParticleCurve(uParticleSlot,0.,t01),ParticleCurve(uParticleSlot,1.,t01),iParams.w);
  moduleColor*=iEmitterColor;vModuleTint=moduleColor;
  vec3 moduleMotion=mix(ParticleCurve(uParticleSlot,4.,t01),ParticleCurve(uParticleSlot,5.,t01),iParams.w).xyz*life;
  vec4 emitter=ParticleState(uParticleSlot),moduleNoise=ParticleNoise(uParticleSlot);
  vAge01 = t01;
  vAgeS = age;
  vSeed = iParams.w;
  vFrame = iExtra.w;

  // 带线性阻尼的弹道闭式解：v' = a - k·v
  //   v(t) = a/k + (v0 - a/k)e^(-kt)
  //   p(t) = p0 + (a/k)t + (v0 - a/k)(1 - e^(-kt))/k
  // k 下限卡在 0.05：再小两项就开始严重相消，float 精度撑不住（会看到粒子抽搐）。
  float k = max(iParams.z, 0.05);
  vec3 world = iOrigin
    + (iVelocity - iAccel / k) * ((1.0 - exp(-k * age)) / k)
    + iAccel * (age / k);
#ifdef SHAPE_BEAM
  // 光束钉在弹着点上不动：弹头的飞行在片元里按寿命揭开，iVelocity 只给方向。
  world = iOrigin;
  vBeam = vec4(iSpin.x, iSpin.y, iExtra.x, iAccel.x);
  vBeamTrail = iAccel.y;
  vBeamMuzzleFade = iAccel.z;
#endif

#ifdef SHAPE_PUFF
  // 常驻烟源把 iExtra.z 写成很小的上升流摆幅；没有写时仍是 -9999，
  // max 后完全等价于旧弹道。两条不同频率的横向卷动不改变烟的总体风向，
  // 只让同一根烟柱的团絮不再像一串对齐的圆片。
  float plumeWobble = max(iExtra.z, 0.0);
  if (plumeWobble > 0.0) {
    float phase = iParams.w * 31.0;
    float swell = plumeWobble * (0.20 + t01 * 0.95);
    world.x += (sin(age * 0.77 + phase) - sin(phase)) * swell;
    world.z += (sin(age * 1.13 + phase * 1.7) - sin(phase * 1.7)) * swell * 0.72;
  }
#endif

#ifdef GROUND_BOUNCE
  // 假弹跳：陷得越深回弹越低，一定会停在地面上。真解算多次弹跳要迭代，
  // 而火星/碎块只需要"跳一下然后趴下"这个观感。
  float below = max(0.0, iExtra.z - world.y);
  if (below > 0.0) world.y = iExtra.z + below * 0.34 * exp(-below * 2.2);
#endif

  // iExtra.x 对普通烟团是“扩散曲线”：0 用默认的 2.0；小于 1 会慢慢
  // 展开。常驻火灾烟如果沿用爆炸烟的急速膨胀，会在柱顶堆成一颗遮天黑球。
  // stretch / decal 池各自复用这条属性，受自己的预处理分支约束，不受影响。
  float growthPower = iExtra.x > 0.0 ? iExtra.x : 2.0;
#ifdef SHAPE_MUD
  growthPower = 1.6;             // 泥浆池的 iExtra.x 是快门时长，不是扩散曲线
#endif
  float grow = 1.0 - pow(1.0 - t01, growthPower);
  float size = mix(iSize.x, iSize.y, grow);
  size *= moduleParameters.x;
  world += moduleMotion + emitter.yzw*moduleNoise.x;
  float phase=iParams.w*31.,flowClock=age*moduleNoise.y*moduleNoise.z;
  world.x+=(sin(flowClock+phase)-sin(phase))*moduleParameters.z;
  world.z+=(sin(flowClock*1.37+phase*1.9)-sin(phase*1.9))*moduleParameters.z*.7;
  vec2 corner = position.xy*vec2(1.,uParticleAspect);
  vShape = position.xy;

  vec3 offset;
#if defined(ORIENT_NORMAL)
  // 贴面：弹孔贴花、贴地尘环
  vec3 n = normalize(iNormal);
  vec3 guide = abs(n.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 tx = normalize(cross(guide, n));
  vec3 ty = cross(n, tx);
  float ang = iSpin.x + iSpin.y * age + moduleParameters.y*life;
  float ca = cos(ang), sa = sin(ang);
  offset = (tx * (corner.x * ca - corner.y * sa) + ty * (corner.x * sa + corner.y * ca)) * size;
  #ifdef LIT_SURFACE
    vLitNormal = n;
  #endif
  #ifdef SHAPE_DECAL
    vDecalTangent = tx * ca + ty * sa;
    vDecalBitangent = -tx * sa + ty * ca;
  #endif
#elif defined(ORIENT_STRETCH)
  // 沿飞行方向拉长：曳光弹与火星。头在 corner.x = +1 处。
  vec3 toCam = cameraPosition - world;
#if !defined(SHAPE_BEAM)
  vec3 instant=iVelocity*exp(-k*age)+iAccel*((1.0-exp(-k*age))/k);
  vec3 dir=normalize(instant+vec3(0.0,1e-5,0.0));
#else
  vec3 dir = normalize(iVelocity + vec3(0.0, 1e-5, 0.0));
#endif
  vec3 side = normalize(cross(dir, normalize(toCam + vec3(1e-5))));
#ifdef SHAPE_MUD
  // 泥浆：拖尾 = 瞬时速度 × 快门（iExtra.x 秒），越飞越慢拖尾越短；下限是一颗泥团自己的长度
  float streakLen = max(size * 1.5, length(instant) * iExtra.x);
  vec3 along = dir * ((corner.x - 1.0) * 0.5 * streakLen);
#else
  vec3 along = dir * ((corner.x - 1.0) * 0.5 * iExtra.x);
#endif
  float halfWidth = size;
#if defined(SHAPE_STREAK) || defined(SHAPE_BEAM)
  // 像素保底（iExtra.w > 0 才开；旧的曳光/火星写 0，行为不变）。按**这个顶点自己**
  // 离相机的距离换算：一条四十米的光束两端远近差得多，只按头部算的话尾巴会细成头发。
  // side 对整条线是同一个方向（线与相机张成的平面的法线），所以逐顶点改宽度不会扭。
  if (iExtra.w > 0.0) {
    float camDist = length(cameraPosition - (world + along));
    float metresPerPixel = camDist * 2.0 / (projectionMatrix[1][1] * uResolution.y);
    halfWidth = max(halfWidth, metresPerPixel * iExtra.w);
#ifdef SHAPE_BEAM
    // 上限（iExtra.z，光束池没有 GROUND_BOUNCE，这一格空着）：子弹贴着脸飞过去时
    // 3 cm 的物理宽度能占三四十个像素，读起来是一根光棍，不是一发弹。
    if (iExtra.z > 0.0) halfWidth = min(halfWidth, metresPerPixel * iExtra.z);
#endif
  }
#endif
  offset = along + side * (corner.y * halfWidth);
  #ifdef LIT
    // 受光的拉伸片（泥浆池）：假圆柱法线 —— 横向两侧往外、中间朝相机，略朝上
    vec3 camDir = normalize(toCamOrZ(world));
    vLitNormal = normalize(side * corner.y * 0.8 + camDir * 0.7 + vec3(0.0, 0.25, 0.0));
    vViewDir = -camDir;
  #endif
#else
  // 面向相机：从 viewMatrix 取相机的右/上轴（比 modelViewMatrix 稳，
  // 因为整个池挂在 root 上、模型矩阵是单位阵）
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 upv   = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float ang = iSpin.x + iSpin.y * age + moduleParameters.y*life;
  float ca = cos(ang), sa = sin(ang);
  vec2 c = vec2(corner.x * ca - corner.y * sa, corner.x * sa + corner.y * ca);
  offset = (right * c.x + upv * c.y) * size;
  #ifdef LIT
    // 假球面法线：把片子当成一个球来打光，烟才有明暗面
    vLitNormal = normalize(right * c.x * 0.85 + upv * c.y * 0.85 + normalize(toCamOrZ(world)) * 0.75);
    vViewDir = normalize(-toCamOrZ(world));
  #endif
#endif

  vec3 finalPos = world + offset;
#ifdef VOLUME_SMOKE
  vec3 vx=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
  vec3 vy=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
  vec3 vz=normalize(toCamOrZ(world));
  float spin=iSpin.x+iSpin.y*age+moduleParameters.y*life;
  vVolumeRight=vx*cos(spin)+vy*sin(spin);vVolumeUp=-vx*sin(spin)+vy*cos(spin);vVolumeToward=vz;
#endif
  vec4 viewPos = viewMatrix * modelMatrix * vec4(finalPos, 1.0);
  vViewDepth = -viewPos.z;
  gl_Position = projectionMatrix * viewPos;

  vColor = mix(iColorA, iColorB, smoothstep(0.0, 0.8, t01));
  vColorAlt = iColorB;
  vColor *= moduleColor.rgb;
#ifdef SHAPE_BEAM
  vColor = iColorA;        // 弹头色；余辉色是 vColorAlt。两段按位置分，不按寿命渐变
#endif
#ifdef SHAPE_DECAL
  vRays = iExtra.x;        // iExtra 是顶点属性，片元拿不到，得靠 varying 递过去
  vDecalSize = size;
  vDecalWorldPosition = finalPos;
#endif

  // fadeIn 是"占寿命的比例"。贴花寿命是 1e5 秒，任何非零比例都会变成几十秒才浮现，
  // 所以 0 必须当"立刻出现"处理，不能靠 max() 兜一个极小值。
  float fadeIn = iParams.y <= 0.0 ? 1.0 : smoothstep(0.0, iParams.y, t01);
  float fadeOut = 1.0 - smoothstep(uFadeOutStart, 1.0, t01);
  float flicker = 1.0;
  if (iExtra.y > 0.0) {
    flicker = 0.5 + 0.5 * sin(age * iExtra.y * 6.2831853 + iParams.w * 17.0);
  }
  vAlpha = iParams.x * fadeIn * fadeOut * flicker * uGlobalFade * moduleColor.a;

#ifdef AERIAL
  // 大气透视，公式与 Script_Post 的雾逐项对齐（密度/高度衰减/上限/雾色/朝阳增益）。
  // 对不齐的话，一根烟柱跨过屋脊线时会在天空与实体的交界上裂出一条硬边。
  vAerial = vec4(0.0);
  if (uFogDensity > 0.0) {
    vec3 rayDir = normalize(finalPos - cameraPosition);
    float fd = 1.0 - exp(-max(vViewDepth, 0.0) * uFogDensity);
    float hFall = exp(-max(finalPos.y - uFogBase, 0.0) / max(uFogFalloff, 0.5));
    vec3 col = mix(uFogColorGround, uFogColorSky, clamp(rayDir.y * 2.0 + 0.35, 0.0, 1.0));
    col += uSunColorFog * pow(max(dot(rayDir, normalize(uSunDirection)), 0.0), 8.0) * uFogSunGain;
    vAerial = vec4(col, clamp(fd * hFall, 0.0, uFogMax));
  }
#endif
}
`;

export const GLSL_VERT_HELPERS = /* glsl */`
vec3 toCamOrZ(vec3 world) {
  vec3 d = cameraPosition - world;
  return dot(d, d) > 1e-8 ? d : vec3(0.0, 0.0, 1.0);
}
`;

export const FRAG_PARTICLE = /* glsl */`
#ifdef VOLUME_SMOKE
${PARTICLE_DENSITY_GLSL}
uniform vec2 uParticleVolume;
varying vec3 vVolumeRight;
varying vec3 vVolumeUp;
varying vec3 vVolumeToward;
#endif
uniform sampler2D uNormalDepth;
uniform float uDepthValid;   // 1 = uNormalDepth 是真的预通道靶，不是 1x1 兜底
uniform vec2 uResolution;
uniform float uSoftEnabled;
uniform float uSoftRange;
uniform float uNearFade;
uniform sampler2D uSpriteMap;    // 序列帧贴图；非 SHAPE_SPRITE 池挂共享的 1×1 白图
uniform vec2 uSpriteGrid;        // 帧网格（列×行）
uniform float uSpriteFrames;     // 帧总数
uniform float uSpriteEmission;   // 自带颜色的 CC0 flipbook：只把高亮火焰抬进 HDR，烟仍保留暗部
uniform sampler2D uMaskMap;      // Vefects 火/烟轮廓；只给常驻场景源使用
uniform sampler2D uMaskNoiseMap; // Vefects 流动噪声；UV 平移与侵蚀共用
uniform sampler2D uMaskNoiseDetailMap;
uniform float uMaskEmission;
#ifdef SHAPE_DECAL
uniform sampler2D uDecalBaseMap;
uniform sampler2D uDecalNormalMap;
uniform sampler2D uDecalOrmMap;
uniform float uDecalReady;
#endif
uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
#ifdef AERIAL
varying vec4 vAerial;
#endif

varying vec2 vShape;
varying vec3 vColor;
varying vec3 vColorAlt;
varying float vAlpha;
varying float vSeed;
varying float vAge01;
varying float vAgeS;
varying vec4 vModuleTint;
varying float vFrame;          // 序列帧池的起始帧；其余池恒为 0
varying float vViewDepth;
#if defined(LIT) || defined(LIT_SURFACE)
varying vec3 vLitNormal;
#endif
#ifdef SHAPE_DECAL
varying float vRays;       // 放射断口线的强度：弹孔 1、爆炸焦痕 0
varying float vDecalSize;
varying vec3 vDecalTangent;
varying vec3 vDecalBitangent;
varying vec3 vDecalWorldPosition;
#endif
#ifdef SHAPE_BEAM
varying vec4 vBeam;        // x 飞行时间 y 余辉时间常数 z 全长 w 弹头亮段
varying float vBeamTrail;
varying float vBeamMuzzleFade;
#endif
#ifdef SHAPE_MARKER
uniform vec3 uMarkerSoil;  // 焦土颗粒色（受光）
uniform vec3 uMarkerDust;  // 掀起的尘团色（受光）
uniform vec3 uMarkerHot;   // 中心亮核的 HDR 色（自发光）
#endif
#ifdef LIT
varying vec3 vViewDir;     // 世界空间视线（相机 -> 粒子），前向散射要用
#endif

void main() {
  vec2 p = vShape;
  float d = length(p);
  float mask = 0.0;
  vec3 color = vColor;
#ifdef SHAPE_DECAL
  vec3 decalSurfaceNormal = normalize(vLitNormal);
  float decalAo = 1.0;
  float decalRoughness = 0.92;
  float decalMetalness = 0.0;
#endif

#if defined(VOLUME_SMOKE)
  if(d>=1.)discard;
  float span=sqrt(max(0.,1.-dot(p,p)));vec4 volume=vec4(0.);
  vec3 lightDir=normalize(uSunDirection+vec3(0.,.1,0.));
  for(int j=0;j<PARTICLE_VOLUME_STEPS;j++){
    float z=span*(1.-2.*(float(j)+.5)/float(PARTICLE_VOLUME_STEPS));
    vec3 q=vVolumeRight*p.x+vVolumeUp*p.y+vVolumeToward*z;
    float density=ParticleDensity(q,vSeed,vAgeS);
    float toward=dot(q,lightDir),path=max(0.,sqrt(max(0.,toward*toward+1.-dot(q,q)))-toward);
    float absorption=ParticleDensity(q+lightDir*path*.45,vSeed,vAgeS);
    float transmission=exp(-absorption*path*uParticleVolume.y);
    vec3 illumination=uSkyColor*.85+uSunColor*(.16+.84*transmission);
    float a=1.-exp(-density*span*uParticleVolume.x*2./float(PARTICLE_VOLUME_STEPS));
    volume.rgb+=(1.-volume.a)*a*illumination;volume.a+=(1.-volume.a)*a;
  }
  color*=volume.rgb/max(volume.a,.001);mask=volume.a;
#elif defined(SHAPE_BLOODMIST)
  vec2 flow=vec2(vSeed*37.0,vSeed*19.0);
  vec2 q=p+vec2(Vnoise(p*3.1+flow),Vnoise(p*3.9+flow.yx))*.32-.16;
  float n=Vnoise(q*5.5+flow+vAge01*.7);
  float fine=Vnoise(q*17.0+flow.yx);
  float edge=1.0-smoothstep(.3,.97,length(q*vec2(1.0,1.2)));
  float erosion=smoothstep(.19+vAge01*.15,.65,n+fine*.3);
  mask=edge*erosion*(.38+.62*fine);
#elif defined(SHAPE_BLOODDROP)
  float head=1.0-smoothstep(.14,.95,length(vec2((p.x-.48)*1.3,p.y)));
  float tail=(1.0-smoothstep(.08,.38,abs(p.y)))*smoothstep(-1.0,.55,p.x);
  mask=max(head,tail*.6)*(1.0-smoothstep(.8,1.0,abs(p.x)));
  color*=uSkyColor+uSunColor*.5;
#elif defined(SHAPE_MUD)
  // 近爆甩出来的湿泥（开场 SB02）：头是一团不规则的泥，身后一条被运动拉开的涂抹拖尾。
  // vShape.x：-1 拖尾末端，+1 泥团前沿；y 横向。两层噪声啃边，边是软的但团是实的。
  vec2 flow = vec2(vSeed * 41.0, vSeed * 17.0);
  float lump = Vnoise(p * vec2(2.3, 4.1) + flow);
  float grit = Vnoise(p * vec2(6.0, 11.0) + flow.yx);
  float headR = length(vec2((p.x - 0.5) * 1.7, p.y * (1.0 + lump * 0.35)));
  float head = 1.0 - smoothstep(0.30 + lump * 0.28, 0.92, headR);
  float taper = mix(0.18, 0.78, smoothstep(-1.0, 0.55, p.x));
  float tail = (1.0 - smoothstep(taper * (0.45 + lump * 0.35), taper, abs(p.y)))
    * smoothstep(-1.0, -0.15, p.x) * (0.35 + 0.4 * grit);
  mask = max(head, tail) * (0.78 + 0.22 * grit);
  color = mix(vColor, vColorAlt, grit * 0.55);
#elif defined(SHAPE_PUFF)
  // 烟/尘：两层不同尺度的噪声让每一片都是一团卷起来的絮，而不是一张
  // 单调的柔边圆盘。只啃外轮廓仍会读成“半透明云”；要让中心密度也有起伏，
  // 多片叠起来才会出现烟羽的深浅团块。
  float coarse = Vnoise(p * 1.9 + vec2(vSeed * 37.0, vSeed * 11.0));
  float fine = Vnoise(p * 5.4 + vec2(vSeed * 19.0 + vAge01 * 1.7, vSeed * 29.0));
  float edge = 0.76 + coarse * 0.26 - fine * 0.12;
  float outer = smoothstep(edge, edge * 0.16, d);
  float core = smoothstep(1.02, 0.08, d);
  mask = outer * mix(0.46 + fine * 0.16, 1.0, core * core);
  mask *= mask;                                  // 中心厚、边缘薄，叠层才有体积
#elif defined(SHAPE_STAR)
  // 枪口焰：不规则星芒 + 白核。两帧就灭，所以形状比动画重要。
  float a = atan(p.y, p.x);
  float spikes = 0.34 + 0.66 * pow(abs(sin(a * 2.5 + vSeed * 19.0)), 0.55);
  float arm = smoothstep(spikes, spikes * 0.06, d);
  float core = smoothstep(0.42, 0.0, d);
  mask = arm * 0.62 + core;
  color = mix(color, vec3(1.0), core * 0.5);
#elif defined(SHAPE_STREAK)
  // 曳光/火星：横向高斯 + 头亮尾暗
  float across = exp(-p.y * p.y * 5.5);
  float head = clamp(p.x * 0.5 + 0.5, 0.0, 1.0);
  mask = across * mix(0.03, 1.0, pow(head, 2.2));
#elif defined(SHAPE_BEAM)
  // 一发子弹的光束（TracerBeam）。整条线从枪口铺到弹着点，但不是一下子全亮：
  // 弹头按「已活秒数 / 飞行时间」从枪口飞过去，掠过的那一段按余辉常数暗下去。
  // vShape.x：-1 是枪口，+1 是弹着点。
  float flight = max(vBeam.x, 1e-4);
  float along = p.x * 0.5 + 0.5;
  float since = vAgeS - along * flight;            // 弹头掠过这一点多久了；负 = 还没飞到
  float reached = step(0.0, since);
  float behind = since / flight * vBeam.z;         // 这一点落后弹头几米
  // 弹头到了弹着点就没了 —— 它打进墙里了，只剩余辉。
  float headAlive = 1.0 - smoothstep(flight, flight + 0.012, vAgeS);
  float head = reached * headAlive * (1.0 - smoothstep(0.0, max(vBeam.w, 0.01), behind));
  float trail = reached * exp(-max(since, 0.0) / max(vBeam.y, 1e-3)) * vBeamTrail;
  float muzzle = smoothstep(0.0, max(vBeamMuzzleFade, 1e-3), along * vBeam.z);
  // 弹头胖一点、余辉细一点：线宽由顶点给的是像素保底，这里只分配亮度的横向分布。
  float across = exp(-p.y * p.y * mix(3.2, 1.8, head));
  mask = across * max(head, trail) * muzzle;
  color = mix(vColorAlt, vColor, clamp(head * 1.5, 0.0, 1.0));
#elif defined(SHAPE_RING)
  // 贴地扩散的尘环 —— 爆炸"有当量"的关键一笔
  float n = Vnoise(p * 3.4 + vec2(vSeed * 23.0, 7.0));
  float radius = 0.72 + 0.12 * n;
  float band = 0.30 - 0.16 * vAge01;             // 环随时间变薄
  // 外圈只做很轻的收边：卡在 1.0 会把环的外半边直接切掉，看着像半个碗
  mask = smoothstep(band, 0.0, abs(d - radius)) * smoothstep(1.38, 1.10, d);
#elif defined(SHAPE_MARKER)
  // 炮弹落点预警：一枚会收拢的准星，不再复用爆炸尘环那个软胖的圈。
  // 贴图三通道：R 线稿（外圈 / 16 段虚线 / 四刻度 / 中心点），G 线稿间的焦土颗粒，
  // B 被下压气流掀起的尘团。贴图没到位时 tex 全 0，只剩程序化收缩环与亮核。
  // 寿命 = 落地倒计时，所以 vAge01 越接近 1 越急。
  float t = vAge01;
  float urgency = t * t;
  // 准星整体从 0.86 收拢到 0.55：虚线环向落点靠，玩家看得出它在合围这一点。
  // 起点留在 1.0 以内，这样程序化收缩环出生时不会和线稿外圈叠成一道双线。
  float reticleScale = mix(0.86, 0.55, smoothstep(0.0, 1.0, t));
  vec2 ruv = p / reticleScale * 0.5 + 0.5;
  float inside = step(abs(ruv.x - 0.5), 0.5) * step(abs(ruv.y - 0.5), 0.5);
  vec4 tex = texture2D(uSpriteMap, clamp(ruv, 0.0, 1.0)) * inside;
  // 尘团不跟准星收缩：它是地面上的事，贴地铺开，随倒计时慢慢变浓。
  float dustTex = texture2D(uSpriteMap, p * 0.5 + 0.5).b;
  float aa = fwidth(d) * 1.2;
  float lineW = 0.014;
  // 1) 主收缩环：从外圈一路收到中心亮核，先慢后快。
  float rc = mix(1.0, 0.13, pow(t, 1.7));
  float ring = 1.0 - smoothstep(lineW, lineW + aa, abs(d - rc));
  // 2) 追赶脉冲：相位错开的细环反复从外向内收，越接近落地越密。
  float f = fract(4.0 * pow(t, 1.8) + vSeed);
  float rp = mix(1.0, 0.13, f);
  float pulse = (1.0 - smoothstep(lineW * 0.7, lineW * 0.7 + aa, abs(d - rp))) * pow(1.0 - f, 1.5) * 0.45;
  // 3) 线稿：随倒计时整体变亮，按越来越快的频率闪（2 Hz → 8 Hz）。
  float blink = 0.72 + 0.28 * sin(vAgeS * (2.0 + 6.0 * t) * 6.2831853);
  float lines = tex.r * (0.70 + 0.30 * urgency) * blink;
  // 4) 中心亮核：平时只是一个点，最后 15% 猛然亮成一小片。
  float core = smoothstep(0.075, 0.0, d) * (0.35 + 0.65 * urgency)
    + smoothstep(0.30, 0.0, d) * smoothstep(0.85, 1.0, t) * 0.9;
  float hot = clamp(ring + pulse + lines + core, 0.0, 1.0);
  // 5) 焦土颗粒与尘团贴面受光，和真地面一起明暗；亮线是自发光，不吃光照
  //   （下面 LIT_SURFACE 那段对准星池不生效）。
  vec3 lit = uSkyColor + uSunColor * max(dot(normalize(vLitNormal), uSunDirection), 0.0);
  float aGrit = tex.g * 0.38 * (0.30 + 0.70 * urgency);
  float aDust = dustTex * 0.30 * smoothstep(0.0, 0.60, t);
  // 三层按"尘 → 焦土 → 亮线"叠，只有一次混合输出，所以先在这里做 over 合成。
  float alphaAll = 1.0 - (1.0 - aDust) * (1.0 - aGrit) * (1.0 - hot);
  vec3 hotColor = mix(vColor, uMarkerHot, clamp(core, 0.0, 1.0));
  vec3 stack = uMarkerDust * lit * aDust * (1.0 - aGrit) * (1.0 - hot)
    + uMarkerSoil * lit * aGrit * (1.0 - hot)
    + hotColor * hot;
  color = stack / max(alphaAll, 1e-4);
  mask = alphaAll;
#elif defined(SHAPE_DECAL)
  if (uDecalReady > 0.5) {
    // 三格图集由 iExtra.w / vFrame 选格；普通枪只会落 0/1，机枪固定 2。
    vec2 atlasUv = vec2((p.x * 0.5 + 0.5 + clamp(floor(vFrame + 0.5), 0.0, 2.0)) / 3.0,
      p.y * 0.5 + 0.5);
    vec4 base = texture2D(uDecalBaseMap, atlasUv);
    vec3 tangentNormal = texture2D(uDecalNormalMap, atlasUv).xyz * 2.0 - 1.0;
    vec3 orm = texture2D(uDecalOrmMap, atlasUv).rgb;
    float fracture = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));
    mask = base.a;
    color = mix(vColorAlt * 0.72, vColor * 1.55, smoothstep(0.08, 0.86, fracture));
    decalSurfaceNormal = normalize(vDecalTangent * tangentNormal.x
      + vDecalBitangent * tangentNormal.y + normalize(vLitNormal) * tangentNormal.z);
    decalAo = orm.r;
    decalRoughness = orm.g;
    decalMetalness = orm.b;
  } else {
    // 贴图尚未到位时保留原程序化弹孔；异步加载不能造成第一发无痕。
    float a = atan(p.y, p.x);
    float n = Vnoise(p * 4.0 + vec2(vSeed * 13.0, 3.0));
    float hole = smoothstep(0.46 + 0.06 * n, 0.16, d);
    float rim = smoothstep(0.26, 0.5, d) * smoothstep(0.86, 0.5, d);
    float rays = pow(abs(sin(a * 6.0 + vSeed * 31.0)), 9.0)
      * smoothstep(0.95, 0.3, d) * vRays;
    mask = hole * 0.95 + rim * 0.5 + rays * 0.35;
    color = mix(vColor, vColorAlt, hole);
  }
#elif defined(SHAPE_SPRITE)
  // 序列帧火球。旧的 16 帧 CC0 图只提供形状，仍由台儿庄色板着色；Unity Labs
  // 三套 CC0 flipbook 自带火与烟的颜色，保留原色，并只把亮焰抬进 HDR 泛光。
  float cursor = min(uSpriteFrames - 1.0, vFrame + vAge01 * (uSpriteFrames-1.));
  float f=floor(cursor),nextFrame=min(f+1.,uSpriteFrames-1.);
  vec2 cell = vec2(mod(f, uSpriteGrid.x), floor(f / max(uSpriteGrid.x, 1.0)));
  vec2 nextCell=vec2(mod(nextFrame,uSpriteGrid.x),floor(nextFrame/max(uSpriteGrid.x,1.)));
  vec2 localUv=p*.5+.5;
  vec4 tex=mix(texture2D(uSpriteMap,(localUv+cell)/uSpriteGrid),texture2D(uSpriteMap,(localUv+nextCell)/uSpriteGrid),fract(cursor));
  float border=smoothstep(0.,.07,localUv.x)*smoothstep(0.,.07,localUv.y)*smoothstep(0.,.07,1.-localUv.x)*smoothstep(0.,.07,1.-localUv.y);
  mask = tex.a*border;
#ifdef SPRITE_AUTHORED_COLOR
  float authoredLuma = max(tex.r, max(tex.g, tex.b));
  float flame = smoothstep(0.18, 0.82, authoredLuma);
  color = tex.rgb * mix(0.78, uSpriteEmission, flame) * vModuleTint.rgb;
#else
  color = vColor * tex.rgb;
#endif
#elif defined(SHAPE_MASKED)
  // Vefects 的火/烟包不是 flipbook，而是轮廓贴图 + 两层流动噪声。把相同的
  // 组合搬进实例粒子池：贴图负责真实的卷边，实例弹道负责上升、风与寿命。
  vec2 uv = p * 0.5 + 0.5;
  vec2 drift = vec2(vSeed * 7.31, vSeed * 3.17);
  float flow = texture2D(uMaskNoiseMap,
    uv * 1.85 + drift + vec2(uTime * 0.09, -uTime * 0.16)).r;
  vec2 warpedUv = uv + vec2(flow - 0.5, 0.5 - flow) * 0.10;
  float authored = texture2D(uMaskMap, warpedUv).r;
  float erosion = texture2D(uMaskNoiseDetailMap,
    warpedUv * 2.7 + drift.yx + vec2(-uTime * 0.12, uTime * 0.21)).r;
  mask = authored * smoothstep(0.08, 0.58, authored + erosion * 0.46 - vAge01 * 0.22);
#ifdef MASKED_FIRE
  float heat = smoothstep(0.14, 0.82, authored * (0.72 + erosion * 0.58));
  color = mix(vColorAlt, vColor, heat) * mix(0.72, uMaskEmission, heat);
#endif
#else
  mask = smoothstep(1.0, 0.1, d);
#endif

  if (mask <= 0.004) discard;
  float alpha = vAlpha * mask;

#if defined(LIT) && !defined(VOLUME_SMOKE)
  // 半兰伯特用于表面粒子；体积烟在上方积分吸收与入射光。
  // 之前用 max(dot,0) 的版本把发烟筒的白灰烟压成了近黑色 —— 那是最典型的
  // "把烟当固体打光"的错。
  float wrapped = dot(normalize(vLitNormal), uSunDirection) * 0.5 + 0.5;
  vec3 lit = uSkyColor + uSunColor * (0.34 + 0.66 * wrapped);
  // 前向散射：视线越接近太阳方向，边缘越透亮（逆光的烟会"发光"）
  float forward = pow(max(dot(vViewDir, uSunDirection), 0.0), 4.0);
#ifndef SHAPE_MUD
  // 湿泥是实的，不透光：前向散射只给烟尘
  lit += uSunColor * forward * 0.55 * (1.0 - mask * 0.75);
#endif
  color *= lit;
#endif
#ifdef SHAPE_DECAL
  // 与 MeshStandardMaterial 同口径的介质响应：AO 压环境光，粗糙度控制窄高光，
  // 贴图法线只扰动断口微表面，不改变贴花几何或深度裁边。
  float decalNdl = max(dot(decalSurfaceNormal, uSunDirection), 0.0);
  vec3 decalView = normalize(cameraPosition - vDecalWorldPosition);
  vec3 decalHalf = normalize(uSunDirection + decalView);
  float decalSpecPower = mix(110.0, 7.0, decalRoughness);
  float decalSpec = pow(max(dot(decalSurfaceNormal, decalHalf), 0.0), decalSpecPower)
    * (1.0 - decalRoughness) * 0.24;
  vec3 decalLit = uSkyColor * mix(0.48, 1.0, decalAo) + uSunColor * decalNdl;
  color = color * decalLit * mix(0.58, 1.0, decalAo)
    + uSunColor * decalSpec * mix(0.04, 1.0, decalMetalness);
#elif defined(LIT_SURFACE) && !defined(SHAPE_MARKER)
  // 贴面的东西（弹孔、贴地尘环）必须跟它趴着的那个面一起明暗。一张恒定色的贴片
  // 在太阳底下永远比墙暗 —— 考据要的"新弹痕断口比墙面亮 1—2 档"就永远做不出来。
  // 预警准星自己分层打光（尘/焦土受光、亮线自发光），不走这一乘。
  color *= uSkyColor + uSunColor * max(dot(normalize(vLitNormal), uSunDirection), 0.0);
#endif

  // rtNormalDepth 的 w 是线性视深度；清成 0 的像素代表"这一路没打到东西"（= 天空）。
  // 软粒子与大气透视都要这个值，所以只取一次。
  float sceneDepth = uDepthValid > 0.5
    ? texture2D(uNormalDepth, gl_FragCoord.xy / uResolution).w
    : 0.0;

#ifdef SHAPE_DECAL
  // 贴花只是命中点切平面上的 quad，不是真正投影到承载几何上的网格。过去它靠 12 mm
  // 物理抬升躲 z-fighting：贴到墙沿会探出去，墙被打穿后还会整片留在空中。现在几何
  // 就放回命中面，polygonOffset 只改深度比较；同时拿预通道逐像素确认后面仍是原表面。
  // 小弹孔容差约 1—2 cm，大焦痕按尺寸放宽，允许它顺着轻微起伏的地面铺开。
  if (uDepthValid > 0.5) {
    float surfaceTolerance = max(0.006 + vDecalSize * 0.08, vViewDepth * 0.00008);
    if (sceneDepth <= 0.001 || abs(sceneDepth - vViewDepth) > surfaceTolerance) discard;
  }
#endif
#ifdef SHAPE_MARKER
  // 准星是落点切平面上的一张几米宽的 quad。坑沿、土沿或坡面会让它局部埋没 / 悬空：
  // 埋没的由深度测试处理，悬空的按预通道深度差淡掉，别让一段亮线飘在坑口上方。
  if (uDepthValid > 0.5 && sceneDepth > 0.001) {
    float tolerance = 0.30 + vViewDepth * 0.02;
    alpha *= 1.0 - smoothstep(tolerance, tolerance * 2.5, abs(sceneDepth - vViewDepth));
  }
#endif

#ifdef AERIAL
  // 补雾，且**只补背景是天空的那一半**（见文件头）。背景有实体时合成 pass 已经
  // 按背景深度上过雾了 —— 那个深度比粒子稍远，雾略微过量，但连续、无缝，
  // 而这里再叠一次就成了双份，烟柱会在屋脊线上被切成深浅两截。
  // 兜底深度图（uDepthValid = 0）时按天空处理：宁可略过量，也不要天上留个黑洞。
  if (vAerial.a > 0.0 && sceneDepth <= 0.001) {
    color = mix(color, vAerial.rgb, vAerial.a);
  }
#endif

  // 软粒子：与背景深度差小的地方淡出。没这一步，烟会像一把刀切进地面。
  // 天空（sceneDepth = 0）必须按"无穷远"处理，否则天空前的粒子会整片消失。
  //
  // uSoftRange = 0 表示这个池**贴着面**存在（弹孔贴花、贴地尘环）：它们与背景的
  // 深度差本来就只有那点法线偏移，一做软化就整体淡到看不见 —— 弹孔一度完全不显形
  // 就是栽在这儿。贴面的池靠 polygonOffset 防 z-fighting，不靠软粒子。
  if (uSoftEnabled > 0.5 && uSoftRange > 0.0 && sceneDepth > 0.001) {
    alpha *= clamp((sceneDepth - vViewDepth) / uSoftRange, 0.0, 1.0);
  }
  // 贴脸淡出：拿不到深度图时这是唯一的保险，也防止一片烟糊满屏幕
  alpha *= clamp((vViewDepth - uNearFade * 0.4) / max(uNearFade, 0.001), 0.0, 1.0);
  if (alpha <= 0.002) discard;

  gl_FragColor = vec4(color, alpha);
}
`;

export const VERT_DEBRIS = /* glsl */`
${PARTICLE_GPU_MODULES}
uniform float uParticleSlot;
uniform float uParticleAspect;
uniform vec2 uMeshSurface;
attribute vec2 iSpawnLife;
attribute vec3 iOrigin;
attribute vec3 iVelocity;
attribute vec3 iScale;
attribute vec3 iAcceleration;
attribute float iInitialRotation;
attribute float iOpacity;
attribute vec3 iSpin;        // 角速度向量（轴 = 归一化方向，模 = 速率）
attribute vec3 iColor;
attribute vec4 iParams;      // x 阻尼 y 地面高度 z 回弹系数 w 种子

uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;

varying vec3 vColor;
varying float vMeshAlpha;

void main() {
  float life = iSpawnLife.y;
  float age = uTime - iSpawnLife.x;
  if (life <= 0.0 || age < 0.0 || age > life || ParticleNoise(uParticleSlot).w<.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float t01 = age / life;
  vec3 acc = iAcceleration;
  vec4 modules=mix(ParticleCurve(uParticleSlot,2.,t01),ParticleCurve(uParticleSlot,3.,t01),iParams.w);
  vec4 tint=mix(ParticleCurve(uParticleSlot,0.,t01),ParticleCurve(uParticleSlot,1.,t01),iParams.w);
  vec3 motion=mix(ParticleCurve(uParticleSlot,4.,t01),ParticleCurve(uParticleSlot,5.,t01),iParams.w).xyz*life;
  vec4 emitter=ParticleState(uParticleSlot),noise=ParticleNoise(uParticleSlot);
  float k = max(iParams.x, 0.05);
  vec3 world = iOrigin
    + (iVelocity - acc / k) * ((1.0 - exp(-k * age)) / k)
    + acc * (age / k);
  world+=motion+emitter.yzw*noise.x;
  float phase=iParams.w*31.,clock=age*noise.y*noise.z;
  world.x+=(sin(clock+phase)-sin(phase))*modules.z;
  world.z+=(sin(clock*1.37+phase*1.9)-sin(phase*1.9))*modules.z*.7;

  float below = max(0.0, iParams.y - world.y);
  if (below > 0.0) world.y = iParams.y + below * iParams.z * exp(-below * 2.2);

  // 转速渐停：角度取指数收敛式，落地后碎块自己停下来，不用记落地时刻
  float angle = iInitialRotation + length(iSpin) * (1.0 - exp(-age * 1.6)) / 1.6 + modules.y*life;
  vec3 axis = normalize(iSpin + vec3(0.0013, 1.0, 0.0007));
  float c = cos(angle), s = sin(angle);
  float shrink = 1.0 - smoothstep(0.80, 1.0, t01);   // 末尾缩没，避免硬弹出
  vec3 v = position * iScale * shrink * modules.x * vec3(1.,uParticleAspect,1.);
  vec3 rp = v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
  vec3 rn = normal * c + cross(axis, normal) * s + axis * dot(axis, normal) * (1.0 - c);

  // 半兰伯特：碎块很小、翻滚很快，硬兰伯特会让一半的块变成纯黑色方片，
  // 在青砖墙那种亮背景前特别假。
  float wrapped = dot(normalize(rn), uSunDirection) * 0.5 + 0.5;
  vColor = iColor * tint.rgb * (uSkyColor + uSunColor * (0.18 + 0.82 * wrapped));vMeshAlpha=tint.a*iOpacity;
  vec3 viewDirection=normalize(cameraPosition-world-rp+vec3(1e-6));
  float specular=pow(max(dot(reflect(-uSunDirection,normalize(rn)),viewDirection),0.),max(2.,(1.-uMeshSurface.y)*64.));
  vColor=vColor*(1.-uMeshSurface.x*.2)+iColor*tint.rgb*uSunColor*specular*uMeshSurface.x*.7;

  vec4 viewPos = viewMatrix * modelMatrix * vec4(world + rp, 1.0);
  gl_Position = projectionMatrix * viewPos;
}
`;

export const FRAG_DEBRIS = /* glsl */`
varying vec3 vColor;
varying float vMeshAlpha;
void main() {
 float coverage=fract(dot(gl_FragCoord.xy,vec2(.754877666,.569840296)));
 if(vMeshAlpha<=coverage)discard;
 gl_FragColor=vec4(vColor,1.);
}
`;
