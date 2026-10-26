// Shared, serializable falling-earth art/behaviour. Metres, seconds, radians,
// linear RGBA. Visual target: FX Elements practical Falling Debris 008.
// Dense descending fines + soft falling dust + low contact dust, not sparks.
const Range=(min,max)=>({mode:'twoConstants',min,max});
export const FALLING_SOIL_LIMITS=Object.freeze({
  emitters:8,grains:6000,grainsPerEmitter:4096,clods:48,dust:384,raysPerStep:128,birthsPerStep:512,step:1/60,
  quality:{whitebox:.8,low:.45,medium:.7,high:1,ultra:1.2},
  // Numerical/engine limits; exposed in Inspect, not adjustable art controls.
  maxCatchup:120,maxProbeSegments:8,maxFragmentGeneration:1,contactEpsilon:.002,
});
export const FALLING_SOIL_DEFAULTS={
  emitter:{shape:'area',width:1.15,length:.48,position:[0,3.2,0],rotation:[0,0,0],clearance:.008,
    distribution:'streams',streams:9,streamWidth:.13,densityVariation:.5,edgeBias:.7,seed:1938},
  timing:{mode:'once',duration:2.8,delay:0,frequency:24,quantity:2,pulseOn:.23,pulseOff:.5,
    intensity:[[0,.9],[.08,1],[.35,.65],[.7,.22],[1,0]]},
  motion:{gravity:9.81,wind:[.09,0,-.035],turbulence:.045,frequency:1.6},
  grains:{enabled:true,amount:100,size:Range(.00065,.0035),speed:Range(.12,.55),spread:.26,
    gravity:1,drag:.38,life:Range(1.8,3),color:[.34,.25,.13,.95],
    collision:true,impactDust:.006,aspect:1,spin:Range(-5,5),noiseScale:.45,
    shutter:.008,minPixel:.25,lightGain:.9,trailOpacity:.7,colorVariation:.35,
    deposit:true,depositChance:.35,depositLifetime:5,depositSize:1.8,maxDeposits:768,maxParticles:4000},
  clods:{enabled:true,amount:.22,size:Range(.007,.032),speed:Range(.08,.4),spread:.6,
    gravity:1,drag:.18,life:Range(3.5,5.5),color:[.19,.125,.065,1],
    spin:Range(-12,12),collision:true,response:'bounce',restitution:.16,friction:.72,
    stopSpeed:.25,maxBounces:3,settleTime:.25,fragmentChance:.22,fragmentCount:2,
    fragmentScale:.48,fragmentSpeed:.4,fragmentThreshold:3,impactDust:2.2,roughness:.99,
    aspect:[1,.7,1.2],fadeOutS:.5,maxParticles:24},
  dust:{enabled:true,amount:2.4,size:Range(.18,.26),speed:Range(1,1.8),spread:.3,
    gravity:.55,drag:1.1,life:Range(2,2.7),color:[.34,.26,.16,.13],density:.9,
    diffusion:1.6,drift:1,fadeIn:.045,fadeOut:.66,aspect:1.8,noiseScale:1.2,sourceSpread:.22,
    veil:true,lightGain:.75,flowDetail:14,flowSoftness:.65,flowSpeed:1.3,
    volumetric:true,densityStyle:'soil',collision:true,nearFade:.2,
    impactAmount:3.5,impactSize:1.15,impactLift:.4,impactSpread:3.5,impactAspect:.55,
    impactGravity:.035,impactDrag:2.3,impactLife:Range(1.6,2.7),impactDiffusion:2.8,fallImpactDust:.2,
    spin:.16,maxParticles:256},
  budget:{distance:42,fadeDistance:16,qualityScale:1,rayChecks:96,grainCollision:true,
    probeSegments:3,contactCacheS:.2,contactCell:.18},
};
export const FALLING_SOIL_PRESETS={
  SoilCeilingShake:{label:'落土 · 洞顶震落',note:'先密后疏 · 面发射 · 小土块与触地薄尘',config:{}},
  SoilPlankLeak:{label:'落土 · 板缝漏土',note:'逐段脉冲 · 线发射 · 随负重经过漏下',config:{
    emitter:{shape:'line',width:2.5,length:.035,distribution:'segments',streams:7,streamWidth:.075},
    timing:{mode:'pulse',duration:6.3,frequency:24,quantity:1.5,pulseOn:.24,pulseOff:.55,intensity:[[0,.8],[.5,1],[1,.65]]},
    grains:{amount:90,size:Range(.0004,.0015)},clods:{amount:.12,size:Range(.007,.023)},
    dust:{amount:1.5,size:Range(.06,.11),aspect:3.4,color:[.34,.26,.16,.11]},
  }},
  SoilBrokenEdge:{label:'落土 · 断口余土',note:'断口边缘 · 稀疏长尾 · 偶发较重土块',config:{
    emitter:{shape:'area',width:1.45,length:.7,distribution:'edge',streams:4,edgeBias:.88},
    timing:{mode:'once',duration:7.5,frequency:16,quantity:1,intensity:[[0,.9],[.16,.5],[.5,.22],[1,0]]},
    grains:{amount:100},clods:{amount:.23,size:Range(.015,.05),fragmentChance:.4},
    dust:{amount:2,size:Range(.08,.15),aspect:2.5},
  }},
};

// This schema drives both validation and the existing editor's controls.
// Every behaviour/art leaf is represented here, including all quality knobs.
const N=(label,min,max,step=.01)=>({type:'number',label,min,max,step});
const C=(label,min,max)=>({type:'curve',label,min,max});
const E=(label,options)=>({type:'enum',label,options});
const B=label=>({type:'boolean',label});
const V=(label,min,max,step=.01)=>({type:'vector',label,min,max,step});
const Common={enabled:B('启用本层'),amount:N('每次发射数量（可小于 1）',0,100,.05),
  size:C('尺寸 / 米',.0001,1),speed:C('向下初速 / 米每秒',0,15),spread:N('初速散布',0,3),
  gravity:N('重力倍率',0,4),drag:N('空气阻力',.05,12),life:C('寿命 / 秒',.05,30),
  color:{type:'color',label:'颜色 / 透明度'},maxParticles:N('本层存活上限',0,6000,1)};
export const FALLING_SOIL_SCHEMA={
  emitter:{label:'来源 · 位置与分布',fields:{shape:E('发射形状',{point:'点',line:'线 / 板缝',area:'面 / 洞顶'}),
    width:N('宽度 / 米',.001,20),length:N('长度 / 米',.001,20),position:V('位置 / 米（Y 为高度）',-10000,10000,.05),
    rotation:V('旋转 / 弧度',-6.2832,6.2832,.05),clearance:N('离开顶面的间隙 / 米',0,.3,.001),distribution:E('发射区域分布',{uniform:'均匀',streams:'成股',segments:'逐段',edge:'断口边缘'}),
    streams:N('股数 / 分段数',1,32,1),streamWidth:N('每股散布 / 米',0,1),densityVariation:N('各股疏密差异',0,1),edgeBias:N('边缘集中度',0,1),seed:N('固定随机种子',0,4294967295,1)}},
  timing:{label:'时序 · 震落、持续与脉冲',fields:{mode:E('播放方式',{once:'单次震落 / 自然收尾',continuous:'持续掉落',pulse:'间歇脉冲'}),
    duration:N('持续时间 / 曲线周期',.05,120,.05),delay:N('开始延迟 / 秒',0,120,.05),frequency:N('每秒发射次数',0,120,1),
    quantity:N('每次数量倍率',0,10,.05),pulseOn:N('脉冲开启 / 秒',.02,10,.02),pulseOff:N('脉冲间隔 / 秒',.02,30,.02),
    intensity:C('起止强度曲线',0,4)}},
  motion:{label:'环境 · 重力与风',fields:{gravity:N('重力 / 米每秒²',0,30,.1),wind:V('风速 / 米每秒',-10,10,.05),
    turbulence:N('横向扰动 / 米',0,.5),frequency:N('扰动频率',.1,15,.1)}},
  grains:{label:'细砂与土粒 · GPU 批量轨迹',fields:{...Common,collision:B('接触表面后结束'),impactDust:N('接触二次扬尘量',0,2),
    aspect:N('土粒纵横比',.2,4),spin:C('自转 / 弧度每秒',-30,30),noiseScale:N('细粒扰动倍率',0,3),
    shutter:N('下落拖痕快门 / 秒',0,.04,.001),minPixel:N('亚像素覆盖宽度 / 像素',.05,.7,.01),lightGain:N('漫反射强度',.1,2),trailOpacity:N('拖痕透明度倍率',.05,1),colorVariation:N('颗粒明暗差异',0,.6),
    deposit:B('保留接触面的落土'),depositChance:N('落土留存比例',0,1),depositLifetime:N('留存时间 / 秒',.1,30,.1),depositSize:N('落土颗粒尺寸倍率',.5,4),maxDeposits:N('留存颗粒上限',0,2048,1),maxParticles:N('细砂存活上限',0,4096,1)}},
  clods:{label:'实体小土块 · 翻滚与碰撞',fields:{...Common,spin:C('三轴翻滚 / 弧度每秒',-30,30),collision:B('表面碰撞'),
    response:E('碰撞响应',{bounce:'弹跳后停止',stop:'接触立即停止',fragment:'有限碎裂'}),
    restitution:N('弹性',0,.9),friction:N('摩擦',0,1),stopSpeed:N('停止速度 / 米每秒',0,3),
    maxBounces:N('最多弹跳次数',0,8,1),settleTime:N('低速停止等待 / 秒',0,2),
    fragmentChance:N('首次碰撞碎裂概率',0,1),fragmentCount:N('碎裂子块数',0,4,1),fragmentScale:N('碎块尺寸倍率',.1,.7),
    fragmentSpeed:N('碎块散射速度',0,4),fragmentThreshold:N('碎裂最低撞击速度',0,15),
    impactDust:N('碰撞二次扬尘强度',0,8),roughness:N('表面粗糙度',.05,1),aspect:V('形状 XYZ 比例',.2,2),fadeOutS:N('寿命末缩退 / 秒',.02,2),maxParticles:N('土块存活上限',0,48,1)}},
  dust:{label:'细尘 · 薄尘帘与触地扩散',fields:{...Common,density:N('密度 / 透明度倍率',0,4),diffusion:N('扩散末尺寸倍率',1,6),
    drift:N('随风漂移倍率',0,3),fadeIn:N('淡入寿命比例',0,.45),fadeOut:N('淡出起点寿命比例',.5,.99),
    aspect:N('下落尘体长宽比',.3,6),noiseScale:N('尘体扰动倍率',0,4),sourceSpread:N('面 / 缝内尘粒散布',0,1),veil:B('连续下落尘帘'),lightGain:N('尘帘漫反射强度',.1,2),
    flowDetail:N('尘帘细节频率',2,32),flowSoftness:N('尘帘边缘柔度',.2,.95),flowSpeed:N('尘帘纹理下行速度',0,4),
    volumetric:B('触地尘体积积分（低档简化）'),densityStyle:E('体积密度场',{soil:'细土悬尘',smoke:'卷曲烟团'}),collision:B('下落尘触面收尾'),nearFade:N('近处淡化距离 / 米',.02,3),
    impactAmount:N('每次撞击扬尘数量',0,12,.1),impactSize:N('撞击尘尺寸倍率',.2,3),impactLift:N('触地扬起速度 / 米每秒',0,1),
    impactSpread:N('触地横向散布倍率',0,6),impactAspect:N('贴地尘体长宽比',.2,2),impactGravity:N('触地尘重力倍率',0,.5),impactDrag:N('触地尘阻力',.05,10),
    impactLife:C('触地尘寿命 / 秒',.05,30),impactDiffusion:N('触地尘扩散倍率',1,6),fallImpactDust:N('尘帘接触二次起尘',0,2),
    spin:C('触地尘旋转 / 弧度每秒',-5,5),maxParticles:N('细尘存活上限',0,384,1)}},
  budget:{label:'预算 · 距离与性能',fields:{distance:N('最远发射距离 / 米',1,200,1),fadeDistance:N('远距减量区间 / 米',0,100,1),
    qualityScale:N('当前画质数量倍率',0,2,.05),rayChecks:N('每步碰撞射线上限',1,128,1),grainCollision:B('细砂采样碰撞'),
    probeSegments:N('细砂轨迹碰撞分段',1,8,1),contactCacheS:N('细砂表面缓存 / 秒',0,1),contactCell:N('碰撞采样网格 / 米',.02,.6)}},
};
export const FALLING_SOIL_STAGE={groundY:0,beam:{enabled:false,y:1.15,x:.15,z:0,width:2.6,depth:.15,height:.16},
  sourceReference:true,backdrop:true,followMotion:false};
