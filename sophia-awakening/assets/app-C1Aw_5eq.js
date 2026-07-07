var e=[{id:`militia`,name:`民兵队`,desc:`农民放下锄头拿起枪，村自卫队。`,costWuzi:15,costBing:0,costMult:1.15,bing:.2,wuzi:0,defense:.01,unlockPhase:0},{id:`farm`,name:`开荒生产队`,desc:`自己动手，丰衣足食——垦荒种粮。`,costWuzi:120,costBing:0,costMult:1.15,bing:0,wuzi:1.2,defense:0,unlockPhase:0},{id:`tunnel`,name:`地道网`,desc:`村村相连、户户相通，打了就钻。`,costWuzi:900,costBing:5,costMult:1.15,bing:0,wuzi:0,defense:.06,unlockPhase:0},{id:`arsenal`,name:`复装弹药所`,desc:`复装子弹、造手榴弹、拉地雷。`,costWuzi:6500,costBing:8,costMult:1.15,bing:0,wuzi:9,defense:0,unlockPhase:1},{id:`intel`,name:`情报站`,desc:`消息树、儿童团放哨——扫荡提前预警。`,costWuzi:42e3,costBing:20,costMult:1.15,bing:0,wuzi:4,defense:.03,unlockPhase:1},{id:`supply`,name:`被服医疗队`,desc:`被服厂、战地医院，留住有生力量。`,costWuzi:26e4,costBing:40,costMult:1.15,bing:1.6,wuzi:20,defense:0,unlockPhase:1},{id:`raid`,name:`破袭队`,desc:`破袭铁路公路，缴获敌军物资。`,costWuzi:12e5,costBing:120,costMult:1.15,bing:0,wuzi:260,defense:.01,unlockPhase:2},{id:`college`,name:`抗大分校`,desc:`抗日军政大学——整训干部、扩大骨干。`,costWuzi:5e6,costBing:300,costMult:1.15,bing:20,wuzi:120,defense:0,unlockPhase:2},{id:`mainforce`,name:`主力团`,desc:`脱产的正规主力，能打大仗。`,costWuzi:35e5,costBing:800,costMult:1.15,bing:45,wuzi:1200,defense:.02,unlockPhase:2},{id:`arsenal2`,name:`黄崖洞兵工厂`,desc:`自造步枪掷弹筒——根据地的军工心脏。`,costWuzi:11e6,costBing:2e3,costMult:1.15,bing:0,wuzi:9e3,defense:0,unlockPhase:3}],t=[{id:`rent`,name:`减租减息`,desc:`减轻农民负担，发动更广。`,cost:500,kind:`all`,mult:1.5,revealAt:200},{id:`produce`,name:`大生产运动`,desc:`南泥湾开荒——生产翻倍。`,cost:3e4,kind:`wuzi`,mult:2,revealAt:8e3},{id:`mine`,name:`地雷战`,desc:`家家户户造地雷，扫荡寸步难行。`,cost:12e4,kind:`defense`,mult:.12,revealAt:4e4},{id:`streamline`,name:`精兵简政`,desc:`缩小机关、充实连队，度过难关。`,cost:9e5,kind:`all`,mult:1.6,revealAt:3e5},{id:`sparrow`,name:`麻雀战`,desc:`分散袭扰、聚零为整——手更狠。`,cost:6e6,kind:`click`,mult:4,revealAt:2e6},{id:`counter`,name:`反攻练兵`,desc:`大练兵，为局部反攻蓄力。`,cost:5e7,kind:`bing`,mult:2.5,revealAt:2e7}],n=[{id:`wutai`,name:`晋察冀·五台山`,battle:`平型关大捷`,x:.44,y:.3,costBing:30,costWuzi:300,outputMult:1.25,requiresPhase:0,line:`平型关一战，打破『日军不可战胜』的神话。晋察冀，第一块敌后根据地立住了。`},{id:`taihang`,name:`晋冀鲁豫·太行`,battle:`长乐村急袭`,x:.4,y:.45,costBing:90,costWuzi:1200,outputMult:1.25,requiresPhase:0,line:`太行山成了华北的脊梁。八路军总部就扎在这里。`},{id:`jinsui`,name:`晋绥·大青山`,battle:`雁门关伏击`,x:.33,y:.24,costBing:240,costWuzi:5e3,outputMult:1.28,requiresPhase:1,line:`雁门关伏击、破袭同蒲路——晋绥连成一片，护住陕甘宁的东大门。`},{id:`jizhong`,name:`冀中平原`,battle:`地道战`,x:.55,y:.34,costBing:650,costWuzi:18e3,outputMult:1.3,requiresPhase:1,line:`无险可守的大平原，硬是用地道织成了地下长城。`},{id:`huangyai`,name:`黄土岭`,battle:`击毙阿部规秀`,x:.47,y:.26,costBing:1600,costWuzi:4e4,outputMult:1.32,requiresPhase:1,line:`黄土岭一炮，击毙『名将之花』阿部规秀中将——日军哀嚎。`},{id:`baituan`,name:`正太·同蒲铁路线`,battle:`百团大战`,x:.42,y:.38,costBing:5e3,costWuzi:9e4,outputMult:1.42,requiresPhase:1,line:`百团大战！一夜之间，华北的铁路公路被同时破袭——全国振奋，这是相持阶段最响亮的反击。`},{id:`shandong`,name:`山东·沂蒙`,battle:`梁山歼灭战`,x:.63,y:.42,costBing:14e3,costWuzi:2e5,outputMult:1.35,requiresPhase:2,line:`沂蒙山下，人民用小推车推出了根据地。山东连成一片。`},{id:`qinyuan`,name:`太岳·沁源`,battle:`沁源围困战`,x:.38,y:.52,costBing:4e4,costWuzi:5e5,outputMult:1.38,requiresPhase:2,line:`两年半围困，把占城的日军活活困走——一座不屈的空城。`},{id:`chejiao`,name:`苏中·车桥`,battle:`车桥战役`,x:.7,y:.55,costBing:11e4,costWuzi:12e5,outputMult:1.42,requiresPhase:3,line:`车桥战役，攻坚打援全歼——局部反攻的序幕拉开了。`},{id:`counter45`,name:`华北大反攻`,battle:`1945 大反攻`,x:.52,y:.44,costBing:35e4,costWuzi:5e6,outputMult:1.6,requiresPhase:3,line:`反攻的号角吹响！收复一座座县城——敌后的星火，终于燎原成燎天大火。`}],r=[{id:0,name:`战略防御`,year:`1937-38`,note:`敌强我弱。在敌后的缝隙里，一点点扎下根据地。`,atTotalWuzi:0},{id:1,name:`战略相持·发展`,year:`1939-40`,note:`站稳了。扩军、生产、破袭——直到打出百团大战。`,atTotalWuzi:5e3},{id:2,name:`最艰难的岁月`,year:`1941-42`,note:`日军疯狂大扫荡、三光政策、囚笼封锁。根据地缩水、人口锐减——这是黎明前最黑的夜。多建地道、搞地雷战，才能扛过去。`,atTotalWuzi:6e5},{id:3,name:`局部反攻`,year:`1943-45`,note:`熬过来了。生产恢复、主力壮大，开始一座座收复失地。`,atTotalWuzi:3e7}],i={clickBing:1,clickWuzi:2,sweepBaseMs:11e4,sweepMinMs:72e3,sweepLossFrac:.24,hardPhase:2,hardSweepMult:1.5,garrisonPerRegion:0};function a(){return{bing:0,wuzi:0,totalWuzi:0,clickN:0,buildings:e.map(()=>0),policies:{},regions:{},clockMs:0,sweepTimerMs:i.sweepBaseMs,lastSweepMs:0,terminal:[{text:`1937 · 卢沟桥的枪声响了。华北沦陷，但敌后的缝隙里——根据地要在这里扎根。`,kind:`era`}],phaseShown:0}}function o(e){let t=0;for(let n of r)e.totalWuzi>=n.atTotalWuzi&&(t=n.id);return t}function s(e){return Object.values(e.regions).filter(Boolean).length}function c(e,n){let r=1;for(let i of t)e.policies[i.id]&&i.kind===n&&(r*=i.mult);if(n===`wuzi`||n===`bing`)for(let n of t)e.policies[n.id]&&n.kind===`all`&&(r*=n.mult);return r}function l(e){let t=1;for(let r of n)e.regions[r.id]&&(t*=r.outputMult);return t}function u(e){return c(e,`click`)}function d(t){let n=0;for(let r=0;r<e.length;r++)n+=e[r].bing*t.buildings[r];return n*c(t,`bing`)*l(t)}function f(t){let n=0;for(let r=0;r<e.length;r++)n+=e[r].wuzi*t.buildings[r];return n*c(t,`wuzi`)*l(t)}function p(n){let r=0;for(let t=0;t<e.length;t++)r+=e[t].defense*n.buildings[t];for(let e of t)n.policies[e.id]&&e.kind===`defense`&&(r+=e.mult);return Math.min(.85,r)}function m(t,n){return Math.ceil(e[n].costWuzi*e[n].costMult**+t.buildings[n])}function h(t,n){return Math.ceil(e[n].costBing*e[n].costMult**+t.buildings[n])}function g(t,n){return t.buildings[n]>0||o(t)>=e[n].unlockPhase}function _(e,t){return e.policies[t.id]||e.totalWuzi>=t.revealAt}function v(e,t){return!e.regions[t.id]&&o(e)>=t.requiresPhase}function y(e,t,n){e.terminal.push({text:t,kind:n}),e.terminal.length>80&&e.terminal.shift()}function b(e){let t=i.clickBing*u(e)*l(e),n=i.clickWuzi*u(e)*l(e);return e.bing+=t,e.wuzi+=n,e.totalWuzi+=n,e.clickN+=1,{bing:t,wuzi:n}}function x(e,t){if(!g(e,t))return!1;let n=m(e,t),r=h(e,t);return e.wuzi<n||e.bing<r?!1:(e.wuzi-=n,e.bing-=r,e.buildings[t]+=1,!0)}function S(e,n){let r=t.find(e=>e.id===n);return!r||e.policies[n]||e.wuzi<r.cost?!1:(e.wuzi-=r.cost,e.policies[n]=!0,y(e,`【${r.name}】${r.desc}`,`info`),!0)}function C(e,t){let r=n.find(e=>e.id===t);return!r||e.regions[t]||o(e)<r.requiresPhase||e.bing<r.costBing||e.wuzi<r.costWuzi?!1:(e.bing-=r.costBing,e.wuzi-=r.costWuzi,e.regions[t]=!0,y(e,`★ ${r.battle}：${r.line}`,`win`),!0)}function w(e){let t=o(e)===i.hardPhase,n=i.sweepLossFrac*(t?i.hardSweepMult:1),r=Math.max(0,n*(1-p(e))),a=e.wuzi*r,s=e.bing*r;e.wuzi-=a,e.bing-=s;let c=0;for(let t=0;t<e.buildings.length;t++)if(e.buildings[t]>0&&Math.random()<r*.5){let n=Math.ceil(e.buildings[t]*r*.5);e.buildings[t]-=n,c+=n}t?y(e,`⚠ 日军大扫荡·三光政策！烧杀抢掠，根据地损失惨重（-${Math.round(r*100)}% 资源，毁设施 ${c}）。咬牙挺住。`,`loss`):y(e,`⚠ 日军扫荡来了！损失 ${Math.round(r*100)}% 资源、设施 ${c}。反扫荡，坚壁清野。`,`loss`),e.lastSweepMs=e.clockMs}function T(e,t){if(e.clockMs+=t*1e3,e.bing+=d(e)*t,e.wuzi+=f(e)*t,e.totalWuzi+=f(e)*t,(d(e)+f(e)>.5||e.wuzi>500)&&(e.sweepTimerMs-=t*1e3,e.sweepTimerMs<=0)){w(e);let t=o(e)===i.hardPhase?i.sweepBaseMs/i.hardSweepMult:i.sweepBaseMs;e.sweepTimerMs=Math.max(i.sweepMinMs,t)*(.8+Math.random()*.4)}let n=o(e);if(n>e.phaseShown){e.phaseShown=n;let t=r[n];y(e,`── ${t.year} · ${t.name} ──　${t.note}`,`era`)}}var E=[``,`万`,`亿`,`兆`];function D(e){if(!isFinite(e))return`∞`;if(e<1e4)return e<10?(Math.round(e*10)/10).toString():Math.floor(e).toLocaleString(`en-US`);let t=0,n=e;for(;n>=1e4&&t<E.length-1;)n/=1e4,t+=1;return`${n.toFixed(2)}${E[t]}`}var O=`attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`,k=`
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform int uCount;            // 区域数
uniform vec3 uReg[10];         // x,y(归一化0-1), reclaimed(1/0)
uniform float uSweep;          // 0..1 扫荡冲击强度(1=刚发生)
uniform vec2 uSweepPos;        // 扫荡中心(归一化)
uniform float uPhase;          // 0..3 阶段(越后越亮)
uniform float uControl;        // 0..1 已收复比例

float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
float fbm(vec2 p){ float v=0.,a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }

void main(){
  vec2 frag = gl_FragCoord.xy / uRes;             // 0..1
  vec2 sc = (gl_FragCoord.xy - .5*uRes)/uRes.y;   // 居中，等比

  // —— 伪3D倾斜地面：屏幕y映射到深度，近大远小 ——
  float horizon = 0.16;                            // 地平线以上是天
  float yy = frag.y - horizon;
  if(yy <= 0.001){ // 天空/远方战云
    vec3 sky = mix(vec3(.04,.05,.04), vec3(.10,.08,.05), frag.y);
    sky += vec3(.12,.03,.02)*uSweep*smoothstep(.4,0.,frag.y); // 战云泛红
    gl_FragColor = vec4(sky,1.); return;
  }
  float depth = horizon / max(yy, .0009);          // 远处 depth 大
  vec2 world = vec2((frag.x-.5)*depth*2.2, depth*1.1 - uTime*0.006);

  // 高度场 + 伪法线光照
  float h = fbm(world*1.3);
  float hx = fbm((world+vec2(.02,0))*1.3) - h;
  float hy = fbm((world+vec2(0,.02))*1.3) - h;
  vec3 nrm = normalize(vec3(-hx*6., -hy*6., 1.));
  float lig = clamp(dot(nrm, normalize(vec3(.5,.6,.8))), 0., 1.);
  lig = .35 + .75*lig;

  // 地形基色（黄土/山地）
  vec3 land = mix(vec3(.10,.11,.07), vec3(.20,.19,.12), h);
  land = mix(land, vec3(.16,.14,.09), smoothstep(.55,.85,h)); // 山脊

  // —— 控制场：区域影响。根据地(reclaimed)红，敌占灰暗 ——
  // 把归一化区域坐标转到 world 附近做距离场（近似，投影到俯视）
  float redField=0., grayField=0., glow=0.;
  vec2 mapp = vec2((frag.x-.5), (frag.y-horizon)/(1.-horizon)); // 地图归一化(0中心..)
  vec2 mp = vec2(frag.x, (frag.y-horizon)/(1.-horizon));
  for(int i=0;i<10;i++){
    if(i>=uCount) break;
    vec3 R = uReg[i];
    float d = distance(mp, R.xy);
    float infl = smoothstep(.26, 0., d);
    if(R.z>.5){ redField = max(redField, infl); glow += smoothstep(.10,0.,d)*(.6+.4*sin(uTime*2.+float(i))); }
    else grayField = max(grayField, infl*.7);
  }

  vec3 col = land*lig;
  // 敌占区：压暗+青灰(日占)
  col = mix(col, col*vec3(.5,.55,.6)*.7, grayField);
  // 根据地：染红+提亮(星火燎原)
  col = mix(col, mix(col, vec3(.55,.12,.08), .7)*1.15, redField);
  col += vec3(.9,.25,.15)*glow*.5;               // 根据地脉动红光

  // 连接线/网格微光(战图感)
  vec2 g = abs(fract(world*3.)-.5);
  float grid = smoothstep(.48,.5,max(g.x,g.y));
  col += vec3(.10,.14,.08)*grid*.25*(1.-depth*.06);

  // —— 扫荡冲击环：从 uSweepPos 扩散的红环 ——
  if(uSweep>0.01){
    float sd = distance(mp, uSweepPos);
    float ring = smoothstep(.03,0.,abs(sd - (1.-uSweep)*.6));
    col += vec3(1.,.15,.1)*ring*uSweep*1.4;
    col = mix(col, col*vec3(1.2,.7,.6), smoothstep(.5,0.,sd)*uSweep*.5); // 灼烧
  }

  // 距离雾 + 暗角
  col = mix(col, vec3(.05,.05,.045), smoothstep(.2,1.,depth*.5));
  col *= 1.0 - .5*smoothstep(.7,1.4,length(sc));
  // 整体随阶段回暖(黎明)
  col *= mix(.8, 1.15, uPhase/3.);
  col += vec3(.02,.02,.015);

  gl_FragColor = vec4(col, 1.);
}`;function A(e){let t=e.getContext(`webgl`,{antialias:!0,alpha:!1});if(!t)return N();let n=j(t,O,k);if(!n)return N();t.useProgram(n);let r=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,r),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW);let i=t.getAttribLocation(n,`p`);t.enableVertexAttribArray(i),t.vertexAttribPointer(i,2,t.FLOAT,!1,0,0);let a=e=>t.getUniformLocation(n,e),o=a(`uRes`),s=a(`uTime`),c=a(`uCount`),l=a(`uReg`),u=a(`uSweep`),d=a(`uSweepPos`),f=a(`uPhase`),p=a(`uControl`),m=new Float32Array(30),h=0,g=0,_=.5,v=.5,y=0,b=0;function x(){let n=Math.min(2,window.devicePixelRatio||1),r=e.clientWidth,i=e.clientHeight;e.width=Math.max(1,r*n),e.height=Math.max(1,i*n),t.viewport(0,0,e.width,e.height)}return x(),{ok:!0,resize:x,setRegions(e){h=Math.min(10,e.length),m=new Float32Array(30);for(let t=0;t<h;t++)m[t*3]=e[t].x,m[t*3+1]=1-e[t].y,m[t*3+2]=+!!e[t].reclaimed},pulseSweep(e,t){g=1,_=e,v=1-t},setPhase(e,t){y=e,b=t},render(n){g=Math.max(0,g-.012),t.uniform2f(o,e.width,e.height),t.uniform1f(s,n),t.uniform1i(c,h),t.uniform3fv(l,m),t.uniform1f(u,g),t.uniform2f(d,_,v),t.uniform1f(f,y),t.uniform1f(p,b),t.drawArrays(t.TRIANGLES,0,3)}}}function j(e,t,n){let r=M(e,e.VERTEX_SHADER,t),i=M(e,e.FRAGMENT_SHADER,n);if(!r||!i)return null;let a=e.createProgram();return e.attachShader(a,r),e.attachShader(a,i),e.linkProgram(a),e.getProgramParameter(a,e.LINK_STATUS)?a:(console.error(`link`,e.getProgramInfoLog(a)),null)}function M(e,t,n){let r=e.createShader(t);return e.shaderSource(r,n),e.compileShader(r),e.getShaderParameter(r,e.COMPILE_STATUS)?r:(console.error(`shader`,e.getShaderInfoLog(r)),null)}function N(){return{ok:!1,render:()=>{},setRegions:()=>{},pulseSweep:()=>{},setPhase:()=>{},resize:()=>{}}}var P=!1;function F(){if(P)return;P=!0;let e=document.createElement(`style`);e.textContent=I,document.head.appendChild(e)}var I=`
.kr { position: fixed; inset: 0; z-index: 2147483000; overflow: hidden; user-select: none; background: #0a0b07;
  --pap: #d8c9a0; --pap-dk: #b5a575; --khk: #3a3826; --ink: #2a2418; --red: #c8392e; --red-lt: #e2564d; --amb: #d8a441; --grn: #7a8f3a;
  color: var(--pap); font-family: 'Noto Serif SC', 'Songti SC', 'STSong', serif; }
.kr-map { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.kr-vig { position: absolute; inset: 0; pointer-events: none; z-index: 2;
  background: radial-gradient(120% 120% at 50% 45%, transparent 55%, rgba(0,0,0,.5) 100%);
  box-shadow: inset 0 0 120px rgba(0,0,0,.6); }

.kr-title { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); z-index: 8; font-size: 20px; font-weight: 700; letter-spacing: 4px; color: #f0e4c0; text-shadow: 0 2px 8px rgba(0,0,0,.8), 0 0 18px rgba(200,57,46,.3); }
.kr-phase { position: absolute; top: 46px; left: 50%; transform: translateX(-50%); z-index: 8; font-size: 12px; color: var(--pap-dk); letter-spacing: 1px; text-shadow: 0 1px 4px rgba(0,0,0,.9); }
.kr-sweep { position: absolute; top: 78px; left: 50%; transform: translateX(-50%); z-index: 9; font-size: 22px; font-weight: 800; color: var(--red-lt); opacity: 0; letter-spacing: 3px; text-shadow: 0 0 20px rgba(200,57,46,.8); transition: opacity .2s; }
.kr-sweep.on { opacity: 1; animation: krshake .3s ease 3; }
@keyframes krshake { 0%,100%{ transform: translateX(-50%);} 25%{ transform: translate(-52%,1px);} 75%{ transform: translate(-48%,-1px);} }

/* 地图区域标记 */
.kr-regions { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
.kr-region { position: absolute; transform: translate(-50%,-50%); pointer-events: auto; background: none; border: none; cursor: pointer; font-family: inherit; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.kr-region.hidden { display: none; }
.kr-region-dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--pap-dk); background: rgba(40,36,24,.7); box-shadow: 0 0 8px rgba(0,0,0,.6); }
.kr-region.ready .kr-region-dot { border-color: var(--amb); background: rgba(216,164,65,.4); box-shadow: 0 0 14px rgba(216,164,65,.7); animation: krpulse 1.2s ease-in-out infinite; }
.kr-region.reclaimed .kr-region-dot { border-color: var(--red-lt); background: radial-gradient(circle,#e2564d,#8a1c14); box-shadow: 0 0 16px rgba(226,86,77,.9); }
@keyframes krpulse { 0%,100%{ transform: scale(1);} 50%{ transform: scale(1.35);} }
.kr-region-name { font-size: 10.5px; color: var(--pap); text-shadow: 0 1px 3px #000, 0 0 6px #000; opacity: .55; white-space: nowrap; }
.kr-region.ready .kr-region-name, .kr-region.reclaimed .kr-region-name { opacity: 1; }
.kr-region.reclaimed .kr-region-name { color: #f2c0a0; }

/* 左栏 */
.kr-left { position: absolute; top: 96px; left: 18px; bottom: 18px; width: 300px; z-index: 8; display: flex; flex-direction: column; gap: 12px; }
.kr-res { display: flex; flex-direction: column; gap: 8px; }
.kr-res-row { display: flex; align-items: center; gap: 11px; padding: 9px 13px; border: 1px solid var(--khk); border-radius: 4px; background: linear-gradient(180deg, rgba(40,36,24,.82), rgba(24,22,14,.82)); box-shadow: 0 3px 10px rgba(0,0,0,.4); }
.kr-ic { font-size: 24px; filter: sepia(.5) brightness(1.05); }
.kr-res-num { font-size: 30px; font-weight: 700; color: #f0e4c0; line-height: 1; }
.kr-res-lab { font-size: 11px; color: var(--pap-dk); margin-top: 3px; }
.kr-res-lab span { color: var(--grn); }
.kr-rally { padding: 14px; border: 2px solid var(--red); border-radius: 6px; background: linear-gradient(180deg, #5a221c, #3a1610); color: #f0e0c0; cursor: pointer; font-family: inherit; display: flex; flex-direction: column; gap: 3px; box-shadow: 0 4px 14px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,200,150,.15); transition: transform .06s; }
.kr-rally:hover { border-color: var(--red-lt); background: linear-gradient(180deg, #6a271f, #431811); }
.kr-rally:active, .kr-rally.hit { transform: scale(.98); }
.kr-rally.hit { animation: krrally .3s ease; }
@keyframes krrally { 0%{ box-shadow: 0 0 0 0 rgba(226,86,77,.6);} 100%{ box-shadow: 0 0 0 16px rgba(226,86,77,0), 0 4px 14px rgba(0,0,0,.5);} }
.kr-rally b { font-size: 17px; letter-spacing: 2px; }
.kr-rally span { font-size: 10.5px; color: var(--pap-dk); }

.kr-terminal { flex: 1; overflow-y: auto; min-height: 0; padding: 10px 12px; border: 1px solid var(--khk); border-radius: 4px; background: rgba(18,16,10,.8); font-size: 12px; line-height: 1.7; }
.kr-terminal::-webkit-scrollbar { width: 6px; } .kr-terminal::-webkit-scrollbar-thumb { background: var(--khk); }
.kr-tline { margin-bottom: 5px; color: var(--pap-dk); }
.kr-tline.era { color: #e8d29a; border-left: 2px solid var(--amb); padding-left: 8px; font-weight: 600; }
.kr-tline.win { color: #f2c0a0; border-left: 2px solid var(--red-lt); padding-left: 8px; }
.kr-tline.loss { color: var(--red-lt); }
.kr-tline.info { color: #b6c48a; }

/* 右栏商店 */
.kr-right { position: absolute; top: 96px; right: 18px; bottom: 18px; width: 320px; z-index: 8; display: flex; flex-direction: column; }
.kr-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
.kr-tab { flex: 1; padding: 8px; border: 1px solid var(--khk); border-radius: 4px 4px 0 0; background: rgba(24,22,14,.7); color: var(--pap-dk); font-family: inherit; font-size: 13px; cursor: pointer; }
.kr-tab.active { border-color: var(--amb); color: #f0e4c0; background: rgba(40,36,24,.85); }
.kr-panel { flex: 1; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: 5px; padding-right: 3px; }
.kr-panel::-webkit-scrollbar { width: 6px; } .kr-panel::-webkit-scrollbar-thumb { background: var(--khk); }
.kr-item { text-align: left; width: 100%; padding: 8px 11px; border: 1px solid var(--khk); border-radius: 4px; background: linear-gradient(180deg, rgba(40,36,24,.7), rgba(24,22,14,.7)); color: var(--pap-dk); cursor: pointer; font-family: inherit; transition: border-color .1s, background .1s; }
.kr-item:hover { border-color: var(--pap-dk); }
.kr-item.affordable { border-color: var(--amb); background: linear-gradient(180deg, rgba(58,48,26,.8), rgba(34,28,16,.8)); }
.kr-item.affordable .kr-item-name { color: #f0e4c0; } .kr-item.affordable .kr-item-cost { color: var(--amb); }
.kr-item.maxed { opacity: .6; border-color: var(--red); }
.kr-item.maxed .kr-item-name { color: #f2c0a0; }
.kr-item.pulse { animation: krpul .35s ease; }
@keyframes krpul { 0%{ box-shadow: 0 0 0 0 rgba(216,164,65,.5);} 100%{ box-shadow: 0 0 0 10px transparent;} }
.kr-item-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.kr-item-name { font-size: 14px; font-weight: 700; color: #d8c9a0; }
.kr-item-cost { font-size: 12px; font-weight: 700; color: var(--pap-dk); white-space: nowrap; }
.kr-item-meta { font-size: 10.5px; color: #8a8058; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.kr-fx { position: absolute; inset: 0; pointer-events: none; z-index: 10; }
.kr-float { position: absolute; transform: translateX(-50%); font-weight: 800; font-size: 18px; color: #f0e0c0; text-shadow: 0 0 12px rgba(216,164,65,.7), 0 2px 4px #000; animation: krfloat .85s ease-out forwards; font-family: inherit; }
@keyframes krfloat { 0%{ opacity:0; transform: translate(-50%,0) scale(.85);} 18%{opacity:1;} 100%{ opacity:0; transform: translate(-50%,-40px) scale(1.05);} }
.kr-flash { position: absolute; transform: translate(-50%,-50%); width: 40px; height: 40px; border-radius: 50%; pointer-events: none; }
.kr-flash.win { border: 2px solid var(--red-lt); animation: krring .9s ease-out forwards; }
@keyframes krring { 0%{ opacity:.9; transform: translate(-50%,-50%) scale(.3);} 100%{ opacity:0; transform: translate(-50%,-50%) scale(4);} }

.kr-guide { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 11; max-width: 56%; padding: 9px 18px; border: 1px solid var(--amb); border-radius: 4px; background: rgba(24,20,12,.95); color: #f0e4c0; font-size: 13px; box-shadow: 0 0 18px rgba(216,164,65,.2); }

.kr-debug-btn { position: absolute; top: 12px; right: 346px; width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--khk); background: rgba(24,20,12,.9); color: var(--pap-dk); font-size: 14px; cursor: pointer; z-index: 12; }
.kr-debug { position: absolute; top: 46px; right: 346px; width: 240px; z-index: 12; border: 1px solid var(--pap-dk); border-radius: 8px; background: rgba(18,16,10,.98); padding: 11px 13px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 12px 40px rgba(0,0,0,.6); font-size: 11px; color: var(--pap-dk); }
.kr-dt { letter-spacing: 3px; }
.kr-dr { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
.kr-debug button { font-family: inherit; font-size: 11px; padding: 5px 9px; border-radius: 5px; border: 1px solid var(--khk); background: rgba(40,36,24,.6); color: var(--pap-dk); cursor: pointer; }
.kr-debug button:hover { border-color: var(--amb); color: #f0e4c0; }
.kr-debug button.active { border-color: var(--amb); color: #f0e4c0; }
.kr-debug button.danger { border-color: #6a2723; color: var(--red-lt); }
.kr-debug input { width: 74px; font-family: inherit; font-size: 11px; padding: 5px 7px; border-radius: 5px; border: 1px solid var(--khk); background: rgba(40,36,24,.6); color: #f0e4c0; }
`;function L(i){F();let c=a(),l=!1,u=1;i.innerHTML=``;let y=document.createElement(`div`);y.className=`kr`,y.innerHTML=`
    <canvas class="kr-map" id="krMap"></canvas>
    <div class="kr-vig"></div>
    <div class="kr-regions" id="krRegions"></div>

    <div class="kr-title">烽火敌后 · 华北抗日根据地</div>
    <div class="kr-phase" id="krPhase"></div>
    <div class="kr-sweep" id="krSweep"></div>

    <aside class="kr-left">
      <div class="kr-res">
        <div class="kr-res-row"><span class="kr-ic">👥</span><div><div class="kr-res-num" id="krBing">0</div><div class="kr-res-lab">兵员 <span id="krBingS"></span></div></div></div>
        <div class="kr-res-row"><span class="kr-ic">🌾</span><div><div class="kr-res-num" id="krWuzi">0</div><div class="kr-res-lab">物资 <span id="krWuziS"></span></div></div></div>
      </div>
      <button class="kr-rally" id="krRally"><b>发动群众抗争</b><span>[空格 / G] 点击 · 组织抵抗</span></button>
      <div class="kr-terminal" id="krTerm"></div>
    </aside>

    <aside class="kr-right">
      <div class="kr-tabs"><button class="kr-tab active" data-t="build">设施</button><button class="kr-tab" data-t="policy">政策</button><button class="kr-tab" data-t="op">战役·收复</button></div>
      <div class="kr-panel" id="krBuild"></div>
      <div class="kr-panel" id="krPolicy" style="display:none"></div>
      <div class="kr-panel" id="krOp" style="display:none"></div>
    </aside>

    <div class="kr-guide" id="krGuide" style="display:none"></div>
    <button class="kr-debug-btn" id="krDbgBtn">⚙</button>
    <div class="kr-debug" id="krDebug" style="display:none">
      <div class="kr-dt">DEBUG</div>
      <div class="kr-dr"><button id="krDbgPause">⏸暂停</button><button id="krDbgReset" class="danger">重置</button></div>
      <div class="kr-dr"><input id="krDbgAmt" type="number" value="100000"/><button id="krDbgGive">+物资</button><button id="krDbgBing">+兵员</button></div>
      <div class="kr-dr"><span>速度</span><button data-spd="1" class="spd active">×1</button><button data-spd="10" class="spd">×10</button><button data-spd="100" class="spd">×100</button></div>
      <div class="kr-dr"><button id="krDbgSweep">触发扫荡</button></div>
    </div>
  `,i.appendChild(y);let w=e=>y.querySelector(e),E=A(w(`#krMap`));new ResizeObserver(()=>E.resize()).observe(w(`#krMap`));let O=new Map,k=w(`#krRegions`);for(let e of n){let t=document.createElement(`button`);t.className=`kr-region`,t.style.left=`${e.x*100}%`,t.style.top=`${e.y*100}%`,t.innerHTML=`<span class="kr-region-dot"></span><span class="kr-region-name">${e.name}</span>`,t.addEventListener(`click`,()=>{C(c,e.id)&&(E.pulseSweep(e.x,e.y),M(e.x,e.y,`win`),j())}),k.appendChild(t),O.set(e.id,t)}function j(){E.setRegions(n.map(e=>({x:e.x,y:e.y,reclaimed:!!c.regions[e.id]}))),E.setPhase(o(c),s(c)/n.length)}j();function M(e,t,n){let r=document.createElement(`div`);r.className=`kr-flash ${n}`,r.style.left=`${e*100}%`,r.style.top=`${t*100}%`,k.appendChild(r),setTimeout(()=>r.remove(),900)}let N=w(`#krRally`);function P(){let e=b(c);N.classList.remove(`hit`),N.offsetWidth,N.classList.add(`hit`),L(`+${D(e.bing)}兵 +${D(e.wuzi)}资`)}N.addEventListener(`click`,P),window.addEventListener(`keydown`,e=>{e.repeat||(e.key===` `||e.key.toLowerCase()===`g`)&&(e.preventDefault(),P())});let I=document.createElement(`div`);I.className=`kr-fx`,y.appendChild(I);function L(e){let t=N.getBoundingClientRect(),n=y.getBoundingClientRect(),r=document.createElement(`div`);r.className=`kr-float`,r.textContent=e,r.style.left=`${t.left-n.left+t.width/2}px`,r.style.top=`${t.top-n.top-6}px`,I.appendChild(r),setTimeout(()=>r.remove(),850)}function R(e,t){let n=document.createElement(`button`);return n.className=`kr-item`,n.innerHTML=`<div class="kr-item-top"><span class="kr-item-name"></span><span class="kr-item-cost"></span></div><div class="kr-item-meta"></div>`,n.addEventListener(`click`,()=>{t()&&(n.classList.remove(`pulse`),n.offsetWidth,n.classList.add(`pulse`))}),e.appendChild(n),{el:n,name:n.querySelector(`.kr-item-name`),meta:n.querySelector(`.kr-item-meta`),cost:n.querySelector(`.kr-item-cost`)}}let z=e.map((e,t)=>R(w(`#krBuild`),()=>x(c,t))),B=new Map(t.map(e=>[e.id,R(w(`#krPolicy`),()=>S(c,e.id))])),V=new Map(n.map(e=>[e.id,R(w(`#krOp`),()=>{let t=C(c,e.id);return t&&(E.pulseSweep(e.x,e.y),M(e.x,e.y,`win`),j()),t})])),H={build:w(`#krBuild`),policy:w(`#krPolicy`),op:w(`#krOp`)};for(let e of y.querySelectorAll(`.kr-tab`))e.addEventListener(`click`,()=>{for(let e of y.querySelectorAll(`.kr-tab`))e.classList.remove(`active`);e.classList.add(`active`);for(let t in H)H[t].style.display=t===e.dataset.t?``:`none`});let U=0,W=0,G=[{t:`敌后一无所有。敲【空格】或点『发动群众抗争』——组织起来，是唯一的本钱`,d:e=>e.clickN>0},{t:`攒够物资，右侧买【民兵队】『开荒生产队』——让根据地自己产出`,d:e=>e.buildings.some(e=>e>0)},{t:`切到『战役·收复』，或点地图上发亮的据点，发动第一场战役收复失地`,d:e=>s(e)>0},{t:`日军会来扫荡、造成损失。多建『地道网』减损、搞政策加成——熬到反攻`,d:e=>Object.keys(e.policies).length>0||s(e)>=2}],K=0;function ee(){let e=w(`#krTerm`);e.childElementCount!==c.terminal.length&&(e.replaceChildren(...c.terminal.map(e=>{let t=document.createElement(`div`);return t.className=`kr-tline ${e.kind}`,t.textContent=e.text,t})),e.scrollTop=e.scrollHeight)}function te(){w(`#krBing`).textContent=D(c.bing),w(`#krWuzi`).textContent=D(c.wuzi),w(`#krBingS`).textContent=`+${D(d(c))}/秒`,w(`#krWuziS`).textContent=`+${D(f(c))}/秒`;let i=r[o(c)];if(w(`#krPhase`).textContent=`${i.year} · ${i.name}　│　收复 ${s(c)}/${n.length}　│　反扫荡减损 ${Math.round(p(c)*100)}%`,c.lastSweepMs!==U){U=c.lastSweepMs;let e=n[Math.floor(Math.random()*n.length)];E.pulseSweep(e.x,e.y);let t=w(`#krSweep`);t.textContent=`⚠ 日军扫荡！`,t.classList.add(`on`),setTimeout(()=>t.classList.remove(`on`),2200)}for(let t=0;t<e.length;t++){let n=z[t],r=e[t],i=g(c,t);if(n.el.style.display=i?``:`none`,!i)continue;let a=m(c,t),o=h(c,t);n.name.textContent=`${r.name}${c.buildings[t]>0?` ×${c.buildings[t]}`:``}`,n.meta.textContent=r.desc,n.cost.textContent=o>0?`${D(a)}资 ${D(o)}兵`:`${D(a)}资`,n.el.classList.toggle(`affordable`,c.wuzi>=a&&c.bing>=o)}for(let e of t){let t=B.get(e.id),n=_(c,e),r=!!c.policies[e.id];t.el.style.display=n?``:`none`,n&&(t.name.textContent=e.name,t.meta.textContent=e.desc,t.cost.textContent=r?`✓ 已推行`:`${D(e.cost)}资`,t.el.classList.toggle(`affordable`,!r&&c.wuzi>=e.cost),t.el.classList.toggle(`maxed`,r))}for(let e of n){let t=V.get(e.id),n=!!c.regions[e.id],r=v(c,e);t.el.style.display=n||r?``:`none`,t.name.textContent=`${e.name} · ${e.battle}`,t.meta.textContent=n?`★ 已收复 · 根据地`:`产出 ×${e.outputMult}`,t.cost.textContent=n?`✓`:`${D(e.costWuzi)}资 ${D(e.costBing)}兵`,t.el.classList.toggle(`affordable`,!n&&r&&c.wuzi>=e.costWuzi&&c.bing>=e.costBing),t.el.classList.toggle(`maxed`,n);let i=O.get(e.id);i.classList.toggle(`reclaimed`,n),i.classList.toggle(`ready`,!n&&r&&c.wuzi>=e.costWuzi&&c.bing>=e.costBing),i.classList.toggle(`hidden`,!n&&!r)}let a=w(`#krGuide`);for(;K<G.length&&G[K].d(c);)K+=1;if(K>=G.length)a.style.display=`none`;else{a.style.display=``;let e=`${K+1}/${G.length} · ${G[K].t}`;a.textContent!==e&&(a.textContent=e)}ee(),o(c)!==W&&(W=o(c),j())}let q=performance.now();function J(e){let t=Math.min(.05,(e-q)/1e3);q=e,l||T(c,t*u),E.render(e*.001),te(),requestAnimationFrame(J)}requestAnimationFrame(()=>{E.resize(),requestAnimationFrame(J)});let Y=w(`#krDebug`);w(`#krDbgBtn`).addEventListener(`click`,()=>{Y.style.display=Y.style.display===`none`?``:`none`});let X=w(`#krDbgPause`),Z=e=>{l=e,X.textContent=l?`▶继续`:`⏸暂停`};X.addEventListener(`click`,()=>Z(!l));let ne=w(`#krDbgAmt`),Q=()=>Math.max(0,Number(ne.value)||0);w(`#krDbgGive`).addEventListener(`click`,()=>{c.wuzi+=Q(),c.totalWuzi+=Q()}),w(`#krDbgBing`).addEventListener(`click`,()=>{c.bing+=Q()});let $=[...y.querySelectorAll(`.kr-debug .spd`)];for(let e of $)e.addEventListener(`click`,()=>{u=Number(e.dataset.spd)||1;for(let t of $)t.classList.toggle(`active`,t===e)});w(`#krDbgSweep`).addEventListener(`click`,()=>{c.sweepTimerMs=1}),w(`#krDbgReset`).addEventListener(`click`,()=>{window.confirm(`重置？`)&&(c=a(),K=0,W=0,j())}),window.__kr={state:()=>c,give:(e,t)=>{c.wuzi+=e,c.totalWuzi+=e,c.bing+=t||0},rally:P,buyBuilding:e=>x(c,e),launch:e=>C(c,e),pause:()=>Z(!0),resume:()=>Z(!1),setSpeed:e=>{u=e},phase:()=>o(c),regions:()=>s(c),mapOk:()=>E.ok}}export{L as bootstrapKangri};