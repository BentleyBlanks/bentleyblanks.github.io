// Shared, serializable falling-earth art/behaviour. Metres, seconds, radians,
// linear RGBA. These are authored visual presets, not measured 1938 events.
const Range=(min,max)=>({mode:'twoConstants',min,max});
export const FALLING_SOIL_LIMITS=Object.freeze({
  emitters:8,grains:6000,grainsPerEmitter:4096,clods:48,dust:384,raysPerStep:128,birthsPerStep:512,step:1/60,
  quality:{whitebox:.8,low:.45,medium:.7,high:1,ultra:1.2},
  // Numerical/engine limits; exposed in Inspect, not adjustable art controls.
  maxCatchup:120,maxProbeSegments:8,maxFragmentGeneration:1,contactEpsilon:.002,
});
export const FALLING_SOIL_DEFAULTS={
  emitter:{shape:'area',width:1.8,length:1.1,position:[0,3.2,0],rotation:[0,0,0],
    distribution:'streams',streams:5,streamWidth:.055,densityVariation:.65,edgeBias:.7,seed:1938},
  timing:{mode:'once',duration:2.8,delay:0,frequency:30,quantity:1,pulseOn:.23,pulseOff:.5,
    intensity:[[0,1],[.1,.85],[.4,.3],[1,0]]},
  motion:{gravity:9.81,wind:[.12,0,-.06],turbulence:.025,frequency:2.1},
  grains:{enabled:true,amount:24,size:Range(.0018,.0065),speed:Range(.08,.45),spread:.2,
    gravity:1,drag:.45,life:Range(1.5,2.7),color:[.34,.25,.15,.95],
    collision:true,impactDust:.035,aspect:1,spin:Range(-2,2),maxParticles:1400},
  clods:{enabled:true,amount:.24,size:Range(.028,.075),speed:Range(.05,.4),spread:.16,
    gravity:1,drag:.18,life:Range(3,5),color:[.24,.165,.095,1],
    spin:Range(-9,9),collision:true,response:'bounce',restitution:.18,friction:.72,
    stopSpeed:.32,maxBounces:3,settleTime:.35,fragmentChance:.18,fragmentCount:2,
    fragmentScale:.48,fragmentSpeed:.6,fragmentThreshold:3,impactDust:1.4,roughness:.97,
    aspect:[1,.95,1],fadeOutS:.35,maxParticles:24},
  dust:{enabled:true,amount:.7,size:Range(.075,.18),speed:Range(.08,.23),spread:.16,
    gravity:.08,drag:1.8,life:Range(1.7,2.8),color:[.52,.43,.31,.17],density:.9,
    diffusion:2.2,drift:1,fadeIn:.1,fadeOut:.65,impactAmount:2.5,impactSize:1.4,
    impactLift:.24,impactSpread:3,spin:.16,maxParticles:112},
  budget:{distance:42,fadeDistance:16,qualityScale:1,rayChecks:96,grainCollision:true,
    probeSegments:3,contactCacheS:.2,contactCell:.18},
};
export const FALLING_SOIL_PRESETS={
  SoilCeilingShake:{label:'落土 · 洞顶震落',note:'先密后疏 · 面发射 · 小土块与触地薄尘',config:{}},
  SoilPlankLeak:{label:'落土 · 板缝漏土',note:'逐段脉冲 · 线发射 · 随负重经过漏下',config:{
    emitter:{shape:'line',width:3,length:.035,distribution:'segments',streams:7,streamWidth:.024},
    timing:{mode:'pulse',duration:6.3,frequency:24,pulseOn:.19,pulseOff:.57,intensity:[[0,.8],[.5,1],[1,.65]]},
    grains:{amount:14,size:Range(.0012,.0048)},clods:{amount:.09,size:Range(.018,.045)},dust:{amount:.35,color:[.52,.43,.31,.13]},
  }},
  SoilBrokenEdge:{label:'落土 · 断口余土',note:'断口边缘 · 稀疏长尾 · 偶发较重土块',config:{
    emitter:{shape:'area',width:1.45,length:.7,distribution:'edge',streams:4,edgeBias:.88},
    timing:{mode:'once',duration:7.5,frequency:16,intensity:[[0,.9],[.16,.42],[.5,.17],[1,0]]},
    grains:{amount:8},clods:{amount:.28,size:Range(.045,.105),fragmentChance:.4},dust:{amount:.27},
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
    rotation:V('旋转 / 弧度',-6.2832,6.2832,.05),distribution:E('发射区域分布',{uniform:'均匀',streams:'成股',segments:'逐段',edge:'断口边缘'}),
    streams:N('股数 / 分段数',1,32,1),streamWidth:N('每股散布 / 米',0,1),densityVariation:N('各股疏密差异',0,1),edgeBias:N('边缘集中度',0,1),seed:N('固定随机种子',0,4294967295,1)}},
  timing:{label:'时序 · 震落、持续与脉冲',fields:{mode:E('播放方式',{once:'单次震落 / 自然收尾',continuous:'持续掉落',pulse:'间歇脉冲'}),
    duration:N('持续时间 / 曲线周期',.05,120,.05),delay:N('开始延迟 / 秒',0,120,.05),frequency:N('每秒发射次数',0,120,1),
    quantity:N('每次数量倍率',0,10,.05),pulseOn:N('脉冲开启 / 秒',.02,10,.02),pulseOff:N('脉冲间隔 / 秒',.02,30,.02),
    intensity:C('起止强度曲线',0,4)}},
  motion:{label:'环境 · 重力与风',fields:{gravity:N('重力 / 米每秒²',0,30,.1),wind:V('风速 / 米每秒',-10,10,.05),
    turbulence:N('横向扰动 / 米',0,.5),frequency:N('扰动频率',.1,15,.1)}},
  grains:{label:'细砂与土粒 · GPU 批量轨迹',fields:{...Common,collision:B('接触表面后结束'),impactDust:N('接触二次扬尘量',0,2),
    aspect:N('土粒纵横比',.2,4),spin:C('自转 / 弧度每秒',-30,30),maxParticles:N('细砂存活上限',0,4096,1)}},
  clods:{label:'实体小土块 · 翻滚与碰撞',fields:{...Common,spin:C('三轴翻滚 / 弧度每秒',-30,30),collision:B('表面碰撞'),
    response:E('碰撞响应',{bounce:'弹跳后停止',stop:'接触立即停止',fragment:'有限碎裂'}),
    restitution:N('弹性',0,.9),friction:N('摩擦',0,1),stopSpeed:N('停止速度 / 米每秒',0,3),
    maxBounces:N('最多弹跳次数',0,8,1),settleTime:N('低速停止等待 / 秒',0,2),
    fragmentChance:N('首次碰撞碎裂概率',0,1),fragmentCount:N('碎裂子块数',0,4,1),fragmentScale:N('碎块尺寸倍率',.1,.7),
    fragmentSpeed:N('碎块散射速度',0,4),fragmentThreshold:N('碎裂最低撞击速度',0,15),
    impactDust:N('碰撞二次扬尘强度',0,8),roughness:N('表面粗糙度',.05,1),aspect:V('形状 XYZ 比例',.2,2),fadeOutS:N('寿命末缩退 / 秒',.02,2),maxParticles:N('土块存活上限',0,48,1)}},
  dust:{label:'细尘 · 薄尘帘与触地扩散',fields:{...Common,density:N('密度 / 透明度倍率',0,4),diffusion:N('扩散末尺寸倍率',1,6),
    drift:N('随风漂移倍率',0,3),fadeIn:N('淡入寿命比例',0,.45),fadeOut:N('淡出起点寿命比例',.5,.99),
    impactAmount:N('每次撞击扬尘数量',0,12,.1),impactSize:N('撞击尘尺寸倍率',.2,3),impactLift:N('触地扬起速度 / 米每秒',0,1),
    impactSpread:N('触地横向散布倍率',0,6),spin:C('尘片旋转 / 弧度每秒',-5,5),maxParticles:N('细尘存活上限',0,384,1)}},
  budget:{label:'预算 · 距离与性能',fields:{distance:N('最远发射距离 / 米',1,200,1),fadeDistance:N('远距减量区间 / 米',0,100,1),
    qualityScale:N('当前画质数量倍率',0,2,.05),rayChecks:N('每步碰撞射线上限',1,128,1),grainCollision:B('细砂采样碰撞'),
    probeSegments:N('细砂轨迹碰撞分段',1,8,1),contactCacheS:N('细砂表面缓存 / 秒',0,1),contactCell:N('碰撞采样网格 / 米',.02,.6)}},
};
export const FALLING_SOIL_STAGE={groundY:0,beam:{enabled:true,y:1.35,x:.15,z:0,width:2.6,depth:.15,height:.16},
  sourceReference:true,backdrop:true,followMotion:false};
