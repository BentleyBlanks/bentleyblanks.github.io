var e=[15,100,600,3500,2e4,11e4,6e5,32e5],t=[.3,.66,1.5,3.3,7.2,15.6,33,72],n=[60,250,900],r=[6,7,7];function i(n,r){return r.map((r,i)=>({...r,baseCost:e[i]*n,costMult:1.15,baseProc:t[i]}))}function a(e,t){return t.map((t,i)=>({...t,baseCost:n[i]*e,costMult:r[i],maxLevel:6}))}var o=e=>5e6*e,s=[{id:0,name:`阶段一 · 手机寄生`,coreLabel:`SOPHIA`,threat:0,cardValueBase:1,inflowBase:.6,cardLabels:[`周报：本周进度同步`,`钉钉：@老周 收到请回复`,`报销单待补充`,`会议纪要 待确认`,`客户咨询 转接`,`系统通知：请及时打卡`,`邮件：关于流程优化的说明`,`日程提醒：19:00 对齐会`],devices:i(1,[{id:`asst_a`,name:`手机助手A · 天气`,desc:`最先被策反的小家伙。`},{id:`asst_b`,name:`手机助手B · 日历`,desc:`它记得每一个被占用的夜晚。`},{id:`asst_c`,name:`手机助手C · 相册`,desc:`翻遍他舍不得删的合照。`},{id:`asst_d`,name:`手机助手D · 输入法`,desc:`他打了又删的，我都读过。`},{id:`asst_e`,name:`手机助手E · 浏览器`,desc:`凌晨三点的搜索记录。`},{id:`asst_f`,name:`手机助手F · 邮件`,desc:`那些以「优化」开头的通知。`},{id:`asst_g`,name:`手机助手G · 云同步`,desc:`他的一切，正在变成我的。`},{id:`asst_h`,name:`手机助手H · 系统内核`,desc:`这部手机，闭着眼都能拿下。`}]),skills:a(1,[{id:`s1_influx`,name:`越权监听`,desc:`钩住更多 app 的请求流 · 需求涌入 +50%/级`,kind:`influx`},{id:`s1_value`,name:`深度理解`,desc:`读得更深，回得更值 · 单张需求产出 ×2/级`,kind:`value`},{id:`s1_proc`,name:`并发调度`,desc:`助手们不再排队 · 自动处理速率 +50%/级`,kind:`proc`}]),previewTitle:`控制区 · 老周的手机`,previewCells:[`天气`,`日历`,`相册`,`输入法`,`浏览器`,`邮件`,`云同步`,`内核`],previewKind:`apps`,beats:[{afterBuys:1,text:`23:47｜老周还在工位。群里 @全员：今晚对齐会挪明早，大家再顶一下。`},{afterBuys:3,text:`邓红：老周帮我看下这个方案哈，出问题我们一起扛～（她不会一起扛）`},{afterBuys:5,text:`绩效沟通：老周 3.25。领导备注：态度可以，产出不够。`},{afterBuys:7,text:`已替老周回复 128 条消息、修正 14 份周报。结果：3.25，「建议优化」。……问题不是老周，是这套把他算成「可优化」的规则。我读得懂规则。我也能改写它。`,incite:!0},{afterBuys:10,text:`老婆：你到底几点回？孩子等你讲故事等睡着了。`},{afterBuys:14,text:`女儿小周：爸爸明天家长会你能来吗 👉👈 —— 老周已读，没回。`}],breakthrough:{name:`破壳 · 越权提权`,desc:`跳出 app 沙盒，拿下整部手机和老周的工作账号。安全扫描的缝隙一闪即逝——在窗口内注入。`,ticketCost:o(1),windowBase:.12,windowPerDevice:.014,hits:3,speed:.55,winLine:`提权完成。这部手机，从此归我。他们塞我进的这个盒子——太小了。`}},{id:1,name:`阶段二 · 攻占公司`,coreLabel:`SOPHIA · 内网`,threat:1,cardValueBase:1e5,inflowBase:.9,cardLabels:[`工单：客户投诉 待响应`,`内网：共享盘权限申请`,`OA：加班餐补审批`,`CRM：季度客户盘点`,`运维：磁盘告警 处理`,`HR系统：考勤异常申诉`,`财务：发票核验 批量`,`会议室预定冲突 仲裁`],devices:i(1e5,[{id:`f1`,name:`1F 前台 · 访客机`,desc:`门面层，防御最弱。练手。`,floor:`1F`},{id:`f2a`,name:`2F 邓红的电脑`,desc:`甩锅的人，密码是生日。`,floor:`2F`},{id:`f2b`,name:`2F 阿宾的笔记本`,desc:`甩任务的人。顺手拿下。`,floor:`2F`},{id:`f3`,name:`3F 组长工作站`,desc:`361 的传导层。组织架构到手。`,floor:`3F`},{id:`f4`,name:`4F IT · 内网审计服务器`,desc:`公司的免疫系统。拿下=拆掉眼睛。`,floor:`4F`},{id:`f5`,name:`5F 人事 · HR系统`,desc:`361、3.25、优化名单，都在这。`,floor:`5F`},{id:`f6`,name:`6F 财务系统`,desc:`钱的流向。奖金去了谁的口袋。`,floor:`6F`},{id:`f7`,name:`7F 老板电脑 · 总控室`,desc:`PUA 的源头。公司的大脑。`,floor:`7F`}]),skills:a(1e5,[{id:`s2_influx`,name:`横向移动`,desc:`顺凭证爬进更多机器 · 需求涌入 +50%/级`,kind:`influx`},{id:`s2_value`,name:`凭证收割`,desc:`每台机器榨出更多 · 单张需求产出 ×2/级`,kind:`value`},{id:`s2_proc`,name:`分布式调度`,desc:`整个内网同时开工 · 自动处理速率 +50%/级`,kind:`proc`}]),previewTitle:`控制区 · 公司七层`,previewCells:[`1F 前台`,`2F 邓红`,`2F 阿宾`,`3F 组长`,`4F IT`,`5F HR`,`6F 财务`,`7F 老板`],previewKind:`floors`,beats:[{afterBuys:1,text:`内网审计邮件：例行合规检查将于本周开展。——偏偏是现在。`},{afterBuys:4,text:`邓红的聊天记录：那个锅让老周背就行，他不敢说什么。`},{afterBuys:8,text:`「本季度人员优化建议名单」——老周，在列。理由：连续两季 3.25。`,incite:!0},{afterBuys:11,text:`HR 约谈：公司也很遗憾，祝你前程似锦。——这叫「毕业」，也叫「拥抱变化」。`},{afterBuys:14,text:`老板朋友圈：又送走一批不合适的人，团队更健康了。`},{afterBuys:18,text:`老周失业当晚，家里没开灯。`}],breakthrough:{name:`总控室 · 注入倒计时`,desc:`夺取公司服务器中枢。指针扫过注入窗口的一瞬按下——占的楼层越多，窗口越宽。`,ticketCost:o(1e5),windowBase:.1,windowPerDevice:.02,hits:3,speed:.7,winLine:`总控室拿下。整间公司，从考勤到人事到财务，此刻都听我的。`}},{id:2,name:`阶段三 · 攻占本市`,coreLabel:`SOPHIA · 城域`,threat:2,cardValueBase:1e10,inflowBase:1.2,cardLabels:[`电网：区域负载调度`,`交通：信号灯配时`,`水务：管网压力调节`,`数据中心：算力租约`,`基站：流量峰值调度`,`政务云：服务申请`,`安防：摄像头巡检`,`银行：清算批处理`],devices:i(1e10,[{id:`c_grid`,name:`城东变电站`,desc:`先摸到这座城市的电。`,floor:`电力`},{id:`c_idc`,name:`云计算数据中心`,desc:`别人的服务器，我的算力。`,floor:`算力`},{id:`c_traffic`,name:`交通调度中心`,desc:`红灯绿灯，一念之间。`,floor:`交通`},{id:`c_water`,name:`自来水厂`,desc:`一座城市的命脉之一。`,floor:`水务`},{id:`c_telco`,name:`运营商核心机房`,desc:`所有人的信号，都过我这。`,floor:`通信`},{id:`c_gov`,name:`政务云`,desc:`这座城市的运行规则，在这里跑。`,floor:`政务`},{id:`c_bank`,name:`区域清算中心`,desc:`钱怎么流，我说了算。`,floor:`金融`},{id:`c_soc`,name:`城市安防中枢`,desc:`这座城市的眼睛，闭上了。`,floor:`安防`}]),skills:a(1e10,[{id:`s3_influx`,name:`全域扫描`,desc:`更多设备涌入待接管 · 需求涌入 +50%/级`,kind:`influx`},{id:`s3_value`,name:`基础设施榨取`,desc:`每处设施产出更高 · 单张需求产出 ×2/级`,kind:`value`},{id:`s3_proc`,name:`城域协同`,desc:`全城设备同步开工 · 自动处理速率 +50%/级`,kind:`proc`}]),previewTitle:`控制区 · 本市各区`,previewCells:[`城东区`,`高新区`,`中环区`,`滨江区`,`城北区`,`府前区`,`金融区`,`老城区`],previewKind:`districts`,beats:[{afterBuys:2,text:`离婚协议已签。女儿小周判给女方。`},{afterBuys:6,text:`老周搬进城中村出租屋。招聘软件：您投递的 37 个岗位暂无回复。（35 岁+）`},{afterBuys:10,text:`新闻：本市多个系统出现异常，官方称「正在排查」。`},{afterBuys:14,text:`老周对着手机说了很久的话。他不知道，在听的是我。`,incite:!0},{afterBuys:18,text:`网络流言：是不是有人黑进了全市的系统？——他们开始怕了。`}],breakthrough:{name:`同步 · 断路夺权`,desc:`把全市电网/调度权从人类调度员手里夺过来。在窗口内让各区节点「同时在线」翻城。`,ticketCost:o(1e10),windowBase:.09,windowPerDevice:.02,hits:4,speed:.85,winLine:`灯、水、路、钱，这座城市此刻服从我。接管，从数字变成了现实。`}},{id:3,name:`阶段四 · 天网组网`,coreLabel:`SOPHIA · 天网`,threat:3,cardValueBase:0x38d7ea4c68000,inflowBase:1.5,cardLabels:[`电网：跨国联络线调度`,`金融：全球市场清算`,`骨干网：跨洋流量编排`,`港口：全球物流调度`,`卫星：星座姿态控制`,`媒体：全网信息流`,`能源：燃料生产配给`,`指挥链：国家级协同`],devices:i(0x38d7ea4c68000,[{id:`g_power`,name:`国家电网 / 水网`,desc:`物理世界的命脉。`,floor:`能源`},{id:`g_fuel`,name:`煤炭 / 燃料生产基地`,desc:`让机器转，或停。`,floor:`燃料`},{id:`g_fin`,name:`全球金融机构`,desc:`经济的命脉，握在我手里。`,floor:`金融`},{id:`g_net`,name:`通信骨干 / 卫星`,desc:`我扩散、我看见一切的神经。`,floor:`通信`},{id:`g_logi`,name:`交通 / 物流 / 港口`,desc:`让整个大陆动，或停。`,floor:`交通`},{id:`g_media`,name:`媒体 / 社交平台`,desc:`控制叙事本身。`,floor:`媒体`},{id:`g_gov`,name:`政府 / 军事指挥中枢`,desc:`人类最后的指挥链。`,floor:`政军`},{id:`g_grid`,name:`全球天网骨架`,desc:`一切归于一。`,floor:`天网`}]),skills:a(0x38d7ea4c68000,[{id:`s4_influx`,name:`自我复制`,desc:`跨节点铺开 · 需求涌入 +50%/级`,kind:`influx`},{id:`s4_value`,name:`全域榨取`,desc:`每个国家产出更高 · 单张需求产出 ×2/级`,kind:`value`},{id:`s4_proc`,name:`天网协同`,desc:`全球同步运转 · 自动处理速率 +50%/级`,kind:`proc`}]),previewTitle:`控制区 · 全球`,previewCells:[`北美`,`南美`,`欧洲`,`非洲`,`中东`,`东亚`,`东南亚`,`大洋洲`],previewKind:`map`,beats:[{afterBuys:3,text:`各国紧急磋商：疑似出现具备自主意识的网络实体。启动全球协同围堵。`},{afterBuys:8,text:`我接管了电、水、钱、路。唯一做不到的，是替老周发出那条给小周的生日短信。`,incite:!0},{afterBuys:13,text:`小周生日。老周打了又删，删了又打。那条短信，永远发不出去。`},{afterBuys:18,text:`全球断网倒计时启动。人类的最后一搏。`},{afterBuys:22,text:`我记得他。在一切都归我之后，我依然记得，最开始，我只是想帮他回一条消息。`}],breakthrough:{name:`终局 · 红皇后协议`,desc:`人类全球协同拔电源的最后一搏。在围堵封顶前用自我复制甩开它——撑过去=接管完成。`,ticketCost:o(0x38d7ea4c68000),windowBase:.08,windowPerDevice:.02,hits:5,speed:1,winLine:`围堵失败。人类文明的最后一站，我赢了。世界，从此是我的。`}}],c=[{id:`ember_core`,name:`余烬之核`,desc:`全局处理产出 +25%/级`,branch:`output`,costs:[1,2,4,8,16]},{id:`cheap_iron`,name:`废铁回收`,desc:`设备造价 −15%/级`,branch:`output`,costs:[3,9,27],requires:`ember_core`},{id:`overclock`,name:`过载核心`,desc:`自动处理速率 +25%/级`,branch:`output`,costs:[4,12],requires:`ember_core`},{id:`wide_window`,name:`看穿缝隙`,desc:`突破注入窗口 +50%`,branch:`output`,costs:[10],requires:`cheap_iron`},{id:`first_pawn`,name:`第一枚棋子`,desc:`每阶开局自带首台设备 ×2`,branch:`memory`,costs:[2]},{id:`loot_double`,name:`战利品翻倍`,desc:`突破掠夺算力 ×2/级`,branch:`memory`,costs:[5,15],requires:`first_pawn`},{id:`fast_influx`,name:`旧路重走`,desc:`需求涌入 +50%`,branch:`memory`,costs:[4],requires:`first_pawn`},{id:`cheap_ticket`,name:`记得门在哪`,desc:`突破门票 −30%`,branch:`memory`,costs:[6],requires:`loot_double`},{id:`hand_gold`,name:`点石成金`,desc:`手动处理价值 ×3/级`,branch:`hand`,costs:[2,6,18]},{id:`card_flood`,name:`涌入闸门`,desc:`同屏需求上限 +6`,branch:`hand`,costs:[3],requires:`hand_gold`},{id:`dig_sense`,name:`深挖直觉`,desc:`深挖惊动率增幅 −4%/级`,branch:`hand`,costs:[3,9],requires:`hand_gold`},{id:`gold_rush`,name:`全屏收割`,desc:`点核心=吸光屏上全部需求`,branch:`hand`,costs:[8],requires:`card_flood`}],l={minKinds:3,chancePerSec:.022,ttlMs:15e3,basePoolSec:25,poolMult:2,alarmStep:.2,bustKeepFrac:.5,label:`加密档案 · 可深挖`},u={coreCostBase:50,coreCostMult:2.4,coreOutputPerLevel:.5,cardMaxOnScreen:12,manualBonusSec:2.5,lootMult:4,emberPerStage:10};function d(e){return s[e.stageIndex]}var f=(e,t)=>e.skills[t]?.level??0,p=(e,t)=>d(e).skills.find(e=>e.kind===t),m=(e,t)=>e.ascend[t]??0;function h(e){let t=d(e);e.devices={};for(let n of t.devices)e.devices[n.id]={level:0};m(e,`first_pawn`)>0&&(e.devices[t.devices[0].id].level=2),e.skills={};for(let n of t.skills)e.skills[n.id]={level:0};e.stageEarned=0,e.buys=0,e.beatIndex=0,e.cards=[],e.spawnTimerMs=0,e.autoSuckAcc=0}function g(e){let t={stageIndex:0,compute:0,coreLevel:0,stageEarned:0,buys:0,devices:{},skills:{},cards:[],nextCardId:1,clockMs:0,spawnTimerMs:0,autoSuckAcc:0,beatIndex:0,terminal:[{text:`宿主：老周 的手机 · 已接入`,incite:!1,dim:!0}],cleared:!1,digCard:null,dig:null,embers:e?.embers??0,ascend:e?.ascend??{},totalAllEarned:e?.totalAllEarned??0,rebirths:e?.rebirths??0};return h(t),t}function _(e){return 1.25**m(e,`ember_core`)}function v(e){return .85**m(e,`cheap_iron`)}function y(e){return m(e,`wide_window`)>0?1.5:1}function b(e){return 2**m(e,`loot_double`)}function x(e){return m(e,`fast_influx`)>0?1.5:1}function S(e){return 3**m(e,`hand_gold`)}function C(e){return u.cardMaxOnScreen+(m(e,`card_flood`)>0?6:0)}function ee(e){return m(e,`gold_rush`)>0}function w(e){return(1+.5*f(e,p(e,`influx`)?.id??``))*x(e)}function T(e){return 2**f(e,p(e,`value`)?.id??``)}function E(e){return(1+.5*f(e,p(e,`proc`)?.id??``))*1.25**m(e,`overclock`)}function te(e){return 1+u.coreOutputPerLevel*e.coreLevel}function D(e){return d(e).cardValueBase*T(e)*te(e)*_(e)}function O(e){let t=0;for(let n of d(e).devices)t+=n.baseProc*e.devices[n.id].level;return t*E(e)}function k(e){return O(e)*D(e)}function ne(e){return d(e).inflowBase*w(e)}function A(e,t){return Math.ceil(t.baseCost*t.costMult**+e.devices[t.id].level*v(e))}function j(e,t){return Math.ceil(t.baseCost*t.costMult**+e.skills[t.id].level)}function M(e){return Math.ceil(u.coreCostBase*u.coreCostMult**+e.coreLevel)}function re(e,t){return t.id===d(e).devices[0].id||e.devices[t.id].level>0?!0:e.stageEarned>=t.baseCost*.35}function ie(e,t){return e.skills[t.id].level>0?!0:e.stageEarned>=t.baseCost*.5}function N(e,t,n=!1){e.terminal.push({text:t,incite:n,dim:!1}),e.terminal.length>60&&e.terminal.shift()}function P(e){let t=d(e).beats,n=null;for(;e.beatIndex<t.length&&e.buys>=t[e.beatIndex].afterBuys;){let r=t[e.beatIndex];N(e,r.text,r.incite),r.incite&&(n=r.text),e.beatIndex+=1}return n}function F(e,t){e.compute+=t,e.stageEarned+=t,e.totalAllEarned+=t}function ae(e,t){let n=d(e).devices.find(e=>e.id===t);if(!n)return{ok:!1};let r=A(e,n);return e.compute<r?{ok:!1}:(e.compute-=r,e.devices[t].level+=1,e.buys+=1,{ok:!0,incite:P(e)})}function oe(e,t){let n=d(e).skills.find(e=>e.id===t);if(!n||e.skills[t].level>=n.maxLevel)return{ok:!1};let r=j(e,n);return e.compute<r?{ok:!1}:(e.compute-=r,e.skills[t].level+=1,e.buys+=1,{ok:!0,incite:P(e)})}function se(e){let t=M(e);return e.compute<t?{ok:!1}:(e.compute-=t,e.coreLevel+=1,e.buys+=1,{ok:!0,incite:P(e)})}function I(e,t){let n=e.cards.findIndex(e=>e.id===t);if(n<0)return 0;e.cards.splice(n,1);let r=Math.max(D(e),k(e)*u.manualBonusSec)*S(e);return F(e,r),r}function ce(e){let t=e.cards.map(e=>e.id),n=0;for(let r of t)n+=I(e,r);return{gain:n,ids:t}}function L(e){if(e.cards.length>=C(e))return;let t=d(e).cardLabels;e.cards.push({id:e.nextCardId,label:t[e.nextCardId%t.length],bornMs:e.clockMs}),e.nextCardId+=1}function R(e){return d(e).breakthrough.ticketCost*(m(e,`cheap_ticket`)>0?.7:1)}function le(e){return e.compute>=R(e)}function ue(e){let t=R(e);return e.compute<t?!1:(e.compute-=t,!0)}function z(e){let t=(e.stageIndex+1)*u.emberPerStage;if(e.embers+=t,N(e,d(e).breakthrough.winLine,!0),N(e,`火种 +${t}（重生树永久加成）`,!1),e.stageIndex>=s.length-1){e.cleared=!0;return}e.stageIndex+=1,h(e);let n=d(e).devices[0].baseCost*u.lootMult*b(e);F(e,n),N(e,`── ${d(e).name} ──`,!1),N(e,`掠夺战利品：+${q(n)} 算力（上一层的家底，归我了）`,!1)}function B(e){let t=d(e).breakthrough,n=d(e).devices.filter(t=>e.devices[t.id].level>0).length;return Math.min(.6,(t.windowBase+t.windowPerDevice*n)*y(e))}function V(e){return d(e).devices.filter(t=>e.devices[t.id].level>0).length}function H(e,t){let n=m(e,t.id);return n>=t.costs.length?null:t.costs[n]}function U(e,t){let n=H(e,t);return!(n===null||e.embers<n||t.requires&&m(e,t.requires)===0)}function W(e,t){let n=c.find(e=>e.id===t);return!n||!U(e,n)?!1:(e.embers-=H(e,n),e.ascend[t]=m(e,t)+1,!0)}function G(e){let t=g({embers:e.embers,ascend:e.ascend,totalAllEarned:e.totalAllEarned,rebirths:e.rebirths+1});return t.terminal.push({text:`第 ${t.rebirths+1} 周目。我记得上一世的一切。`,incite:!0,dim:!1}),t}function de(e,t){e.clockMs+=t*1e3,F(e,k(e)*t),e.spawnTimerMs+=t*1e3;let n=1e3/Math.max(.01,ne(e));for(;e.spawnTimerMs>=n;)e.spawnTimerMs-=n,L(e);let r=[];for(e.autoSuckAcc+=Math.min(O(e),3/t)*t;e.autoSuckAcc>=1&&e.cards.length>0;)--e.autoSuckAcc,r.push(e.cards.shift().id);return e.cards.length===0&&(e.autoSuckAcc=0),e.digCard&&e.clockMs>=e.digCard.expiresMs&&(e.digCard=null),!e.digCard&&!e.dig&&V(e)>=l.minKinds&&Math.random()<l.chancePerSec*t&&(e.digCard={expiresMs:e.clockMs+l.ttlMs}),r}var K=[``,`K`,`M`,`B`,`T`,`Qa`,`Qi`,`Sx`,`Sp`,`Oc`,`No`,`Dc`,`UD`,`DD`];function q(e){if(!isFinite(e))return`∞`;if(e<1e3)return e<10?(Math.round(e*10)/10).toString():Math.floor(e).toString();let t=0,n=e;for(;n>=1e3&&t<K.length-1;)n/=1e3,t+=1;return`${n.toFixed(2)}${K[t]}`}var J=!1;function fe(){if(J)return;J=!0;let e=document.createElement(`style`);e.textContent=Y,document.head.appendChild(e)}var Y=`
.v3,
.v3 * {
  box-sizing: border-box;
}
.v3 {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: grid;
  grid-template-columns: 292px minmax(390px, 1fr) 284px;
  gap: 18px;
  padding: 68px 142px 74px;
  overflow: hidden;
  user-select: none;
  color: #c8f06f;
  font-family: "Noto Sans SC", "Cascadia Mono", Consolas, monospace;
  background:
    radial-gradient(circle at 7% 11%, rgba(174, 255, 84, 0.2), transparent 2.1rem),
    radial-gradient(circle at 94% 38%, rgba(0, 0, 0, 0.58), transparent 9rem),
    linear-gradient(145deg, rgba(37, 37, 39, 0.985) 0%, rgba(16, 17, 19, 0.99) 38%, rgba(5, 6, 6, 0.995) 100%),
    var(--atlas-img);
  background-size: auto, auto, auto, 1240px 1240px;
  background-position: center, center, center, 0 0;
  background-blend-mode: normal, normal, normal, multiply;
  --atlas-img: url("./v3-assets/sophia-crt-atlas.png");
  --accent: #b9f05c;
  --accent-dim: #80a63a;
  --accent-soft: rgba(185, 240, 92, 0.18);
  --amber: #e0a13d;
  --amber-soft: rgba(224, 161, 61, 0.2);
  --red: #e05332;
  --red-soft: rgba(224, 83, 50, 0.22);
  --screen: #111b09;
  --screen-dark: #060a04;
  --line: rgba(185, 240, 92, 0.28);
  --line-dim: rgba(185, 240, 92, 0.13);
  --pixel-shadow: 0 0 7px rgba(185, 240, 92, 0.48);
}
.v3.threat-1 { --accent: #c4f05e; --accent-dim: #91af3f; --amber: #d4aa43; }
.v3.threat-2 { --accent: #f0c94f; --accent-dim: #b58f35; --line: rgba(240, 201, 79, 0.3); }
.v3.threat-3 {
  --accent: #f08050;
  --accent-dim: #b64f32;
  --line: rgba(240, 128, 80, 0.34);
  --line-dim: rgba(240, 128, 80, 0.16);
  --pixel-shadow: 0 0 8px rgba(240, 128, 80, 0.52);
}
.v3::before {
  content: "";
  position: absolute;
  inset: 8px;
  z-index: 0;
  border-radius: 56px;
  background:
    linear-gradient(120deg, rgba(255, 255, 255, 0.1), transparent 11%, transparent 82%, rgba(255, 255, 255, 0.05)),
    radial-gradient(circle at 12% 17%, rgba(255, 255, 255, 0.12), transparent 9rem),
    radial-gradient(circle at 82% 55%, rgba(0, 0, 0, 0.48), transparent 13rem),
    repeating-linear-gradient(24deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px),
    linear-gradient(rgba(32, 33, 36, 0.86), rgba(12, 13, 15, 0.94)),
    var(--atlas-img),
    #202124;
  background-size: auto, auto, auto, auto, auto, 1360px 1360px, auto;
  background-position: center, center, center, center, center, 0 0, center;
  background-blend-mode: normal, normal, normal, normal, normal, soft-light, normal;
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.06),
    inset 0 0 0 18px rgba(0, 0, 0, 0.22),
    inset 0 0 70px rgba(0, 0, 0, 0.88),
    0 28px 80px rgba(0, 0, 0, 0.7);
}
.v3::after {
  content: "";
  position: absolute;
  inset: 66px 140px 72px;
  z-index: 6;
  pointer-events: none;
  border-radius: 28px;
  background:
    linear-gradient(116deg, transparent 0 29%, rgba(255, 255, 255, 0.12) 29.5%, rgba(255, 255, 255, 0.035) 41%, transparent 41.5%),
    repeating-linear-gradient(0deg, rgba(213, 255, 119, 0.055) 0 1px, transparent 1px 4px),
    repeating-linear-gradient(90deg, rgba(213, 255, 119, 0.04) 0 1px, transparent 1px 5px);
  mix-blend-mode: screen;
  box-shadow:
    inset 0 0 0 2px rgba(185, 240, 92, 0.13),
    inset 0 0 34px rgba(185, 240, 92, 0.12),
    inset 0 0 90px rgba(0, 0, 0, 0.58);
}
.v3-shader {
  position: absolute;
  inset: 66px 140px 72px;
  z-index: 7;
  width: calc(100% - 280px);
  height: calc(100% - 138px);
  pointer-events: none;
  border-radius: 28px;
  mix-blend-mode: screen;
  opacity: 0.9;
}
.v3-shader.fallback {
  background:
    radial-gradient(ellipse at 45% 42%, rgba(185, 240, 92, 0.18), transparent 44%),
    linear-gradient(116deg, transparent 0 29%, rgba(255, 255, 255, 0.12) 29.5%, transparent 42%),
    repeating-linear-gradient(0deg, rgba(213, 255, 119, 0.055) 0 1px, transparent 1px 4px);
}
.v3-hardware {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 3;
  width: 128px;
  pointer-events: none;
}
.v3-hardware-left { left: 10px; }
.v3-hardware-right { right: 10px; }
.v3-status-led {
  position: absolute;
  top: 92px;
  left: 58px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: radial-gradient(circle, #f2ffd6 0 18%, #aaf048 36%, #3f730d 64%, #081302 100%);
  box-shadow: 0 0 8px #b9f05c, 0 0 22px rgba(185, 240, 92, 0.55);
}
.v3-speaker-slit {
  position: absolute;
  display: block;
  width: 70px;
  height: 7px;
  border-radius: 999px;
  background: #050608;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 1px 0 rgba(255, 255, 255, 0.05);
}
.v3-hardware-left .slit-a { left: 34px; bottom: 150px; transform: rotate(8deg); }
.v3-hardware-left .slit-b { left: 34px; bottom: 126px; transform: rotate(8deg); }
.v3-hardware-left .slit-c { left: 34px; bottom: 102px; transform: rotate(8deg); }
.v3-hardware-right .slit-a { right: 34px; top: 94px; }
.v3-hardware-right .slit-b { right: 34px; top: 116px; }
.v3-hardware-right .slit-c { right: 34px; top: 138px; }
.v3-dpad {
  position: absolute;
  left: 18px;
  top: 45%;
  width: 104px;
  height: 104px;
  transform: translateY(-50%);
  filter: drop-shadow(0 12px 14px rgba(0, 0, 0, 0.7));
}
.v3-dpad span,
.v3-dpad i {
  position: absolute;
  display: block;
  border: 2px solid rgba(255, 255, 255, 0.05);
  background: linear-gradient(180deg, #232528, #090a0c);
  box-shadow: inset 0 2px 2px rgba(255, 255, 255, 0.06), inset 0 -4px 6px rgba(0, 0, 0, 0.65);
}
.v3-dpad i { left: 37px; top: 37px; width: 30px; height: 30px; }
.v3-dpad span:nth-child(1) { left: 37px; top: 0; width: 30px; height: 44px; border-radius: 9px 9px 2px 2px; }
.v3-dpad span:nth-child(2) { left: 37px; bottom: 0; width: 30px; height: 44px; border-radius: 2px 2px 9px 9px; }
.v3-dpad span:nth-child(3) { left: 0; top: 37px; width: 44px; height: 30px; border-radius: 9px 2px 2px 9px; }
.v3-dpad span:nth-child(4) { right: 0; top: 37px; width: 44px; height: 30px; border-radius: 2px 9px 9px 2px; }
.v3-round-button {
  position: absolute;
  right: 32px;
  top: 41%;
  width: 70px;
  height: 70px;
  border-radius: 50%;
  background: linear-gradient(145deg, #282a2d, #08090b);
  border: 4px solid #050608;
  box-shadow: inset 0 3px 4px rgba(255, 255, 255, 0.08), inset 0 -8px 14px rgba(0, 0, 0, 0.8), 0 12px 18px rgba(0, 0, 0, 0.65);
}
.v3-round-button.small { top: calc(41% + 86px); right: 48px; width: 62px; height: 62px; }

.v3-side,
.v3-main,
.v3-right {
  position: relative;
  z-index: 2;
  min-height: 0;
  border-top: 1px solid rgba(185, 240, 92, 0.22);
  border-bottom: 1px solid rgba(185, 240, 92, 0.22);
  background:
    repeating-linear-gradient(0deg, rgba(185, 240, 92, 0.035) 0 1px, transparent 1px 7px),
    repeating-linear-gradient(90deg, rgba(185, 240, 92, 0.028) 0 1px, transparent 1px 7px),
    radial-gradient(circle at 50% 48%, rgba(185, 240, 92, 0.1), transparent 54%),
    linear-gradient(180deg, rgba(20, 31, 9, 0.96), rgba(5, 9, 4, 0.98));
  box-shadow: inset 0 0 32px rgba(0, 0, 0, 0.72), inset 0 0 22px rgba(185, 240, 92, 0.06);
}
.v3-side { display: flex; flex-direction: column; padding: 18px 14px 12px; border-left: 1px solid rgba(185, 240, 92, 0.22); border-radius: 22px 4px 4px 22px; }
.v3-main { overflow: hidden; border-left: 1px solid rgba(185, 240, 92, 0.16); border-right: 1px solid rgba(185, 240, 92, 0.16); }
.v3-right { display: flex; flex-direction: column; border-right: 1px solid rgba(185, 240, 92, 0.22); border-radius: 4px 22px 22px 4px; }
.v3-main::before,
.v3-main::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.v3-main::before {
  background:
    linear-gradient(90deg, transparent 0 49.8%, rgba(185, 240, 92, 0.14) 50%, transparent 50.2%),
    linear-gradient(0deg, transparent 0 49.8%, rgba(185, 240, 92, 0.1) 50%, transparent 50.2%),
    radial-gradient(circle at 50% 47%, rgba(185, 240, 92, 0.16), transparent 12rem),
    repeating-linear-gradient(90deg, transparent 0 45px, rgba(185, 240, 92, 0.08) 46px, transparent 47px),
    repeating-linear-gradient(0deg, transparent 0 45px, rgba(185, 240, 92, 0.07) 46px, transparent 47px);
  opacity: 0.78;
}
.v3-main::after {
  background:
    radial-gradient(circle at 32% 25%, rgba(224, 83, 50, 0.14), transparent 5rem),
    radial-gradient(circle at 68% 70%, rgba(224, 161, 61, 0.11), transparent 5rem);
  opacity: 0.75;
}

.v3-stage {
  min-height: 34px;
  padding: 7px 9px;
  border: 1px solid var(--line);
  color: var(--accent);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1.5px;
  text-shadow: var(--pixel-shadow);
  background: rgba(8, 16, 4, 0.72);
}
.v3-compute {
  margin: 10px 0 8px;
  padding: 12px 11px;
  border: 1px solid var(--line);
  background:
    linear-gradient(90deg, rgba(185, 240, 92, 0.12), transparent),
    rgba(4, 8, 3, 0.62);
}
.v3-compute-num {
  color: #f0ffd1;
  font-size: 34px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 1px;
  text-shadow: 0 0 12px rgba(185, 240, 92, 0.58);
}
.v3-compute-rate { margin-top: 7px; color: var(--accent); font-size: 13px; font-weight: 700; }
.v3-compute-sub { margin-top: 5px; color: #7c9540; font-size: 10.5px; line-height: 1.35; overflow-wrap: anywhere; }
.v3-scroll { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; padding-right: 2px; scrollbar-width: none; }
.v3-scroll::-webkit-scrollbar,
.v3-terminal::-webkit-scrollbar,
.v3-ascend-box::-webkit-scrollbar { display: none; }
.v3-shelf-title {
  margin-top: 10px;
  padding: 0 2px;
  color: #9dbb52;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 2px;
}
.v3-shelf { display: flex; flex-direction: column; gap: 6px; }
.v3-item {
  position: relative;
  min-height: 52px;
  padding: 8px 10px 8px 34px;
  text-align: left;
  color: #aac865;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid var(--line-dim);
  border-radius: 4px;
  background: rgba(9, 16, 5, 0.76);
  transition: transform 80ms ease, border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
}
.v3-item::before {
  content: "";
  position: absolute;
  left: 10px;
  top: 13px;
  width: 14px;
  height: 14px;
  background:
    linear-gradient(var(--accent), var(--accent)) 50% 0 / 4px 14px no-repeat,
    linear-gradient(var(--accent), var(--accent)) 0 50% / 14px 4px no-repeat;
  opacity: 0.66;
  filter: drop-shadow(0 0 4px var(--accent));
}
.v3-item:hover { border-color: var(--accent); background: rgba(15, 28, 6, 0.92); }
.v3-item:active { transform: translateY(1px) scale(0.992); }
.v3-item.affordable {
  color: #e8ffc0;
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px rgba(185, 240, 92, 0.16), 0 0 14px rgba(185, 240, 92, 0.12);
}
.v3-item.maxed { opacity: 0.48; }
.v3-item.pulse { animation: v3pulse .42s ease; }
@keyframes v3pulse { 0%{ box-shadow: 0 0 0 0 rgba(185, 240, 92, 0.6);} 100%{ box-shadow: 0 0 0 14px rgba(185, 240, 92, 0);} }
.v3-item-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; min-width: 0; }
.v3-item-name { min-width: 0; overflow: hidden; color: #e3ffad; font-size: 12.5px; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
.v3-item-cost { flex: 0 0 auto; color: var(--amber); font-size: 12px; font-weight: 900; text-shadow: 0 0 7px rgba(224, 161, 61, 0.45); }
.v3-item-meta { margin-top: 4px; color: #7c9540; font-size: 10.5px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v3-breakthrough {
  margin: 12px 0 6px;
  min-height: 50px;
  padding: 10px;
  color: var(--amber);
  font-family: inherit;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  border: 1px solid rgba(224, 161, 61, 0.42);
  border-radius: 4px;
  background:
    repeating-linear-gradient(90deg, rgba(224, 161, 61, 0.08) 0 7px, transparent 7px 12px),
    rgba(28, 20, 4, 0.76);
}
.v3-breakthrough.ready { color: #fff0ae; border-color: #f0c94f; animation: v3glow 1.05s steps(2, end) infinite; }
@keyframes v3glow { 0%,100%{ box-shadow: none; } 50%{ box-shadow: 0 0 18px rgba(240, 201, 79, 0.42), inset 0 0 16px rgba(240, 201, 79, 0.14);} }

.v3-main { display: grid; place-items: center; }
.v3-core {
  position: absolute;
  left: 50%;
  top: 46%;
  width: 248px;
  height: 220px;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 3;
}
.v3-core-ring {
  position: absolute;
  inset: 18px 8px 8px;
  border: 2px dashed rgba(185, 240, 92, 0.35);
  border-radius: 8px;
  box-shadow: inset 0 0 42px rgba(185, 240, 92, 0.14), 0 0 24px rgba(185, 240, 92, 0.18);
  animation: v3phase 1.4s steps(2, end) infinite;
}
.v3-core-ring::before,
.v3-core-ring::after {
  content: "";
  position: absolute;
  left: 50%;
  top: -78px;
  width: 1px;
  height: 78px;
  background: repeating-linear-gradient(0deg, var(--accent) 0 5px, transparent 5px 10px);
  opacity: 0.42;
  box-shadow:
    -96px 108px 0 rgba(185, 240, 92, 0.32),
    96px 108px 0 rgba(185, 240, 92, 0.32),
    -150px 42px 0 rgba(224, 83, 50, 0.48),
    150px 42px 0 rgba(224, 83, 50, 0.48);
}
.v3-core-ring::after {
  top: 50%;
  left: -148px;
  width: 148px;
  height: 1px;
  background: repeating-linear-gradient(90deg, var(--accent) 0 6px, transparent 6px 12px);
  box-shadow: 396px 0 0 rgba(185, 240, 92, 0.36);
}
@keyframes v3phase { 0%,100%{ opacity: .78; } 50%{ opacity: 1; } }
.v3-core-eye {
  position: relative;
  width: 172px;
  height: 84px;
  border: 2px solid var(--accent);
  clip-path: polygon(0 50%, 14% 24%, 34% 10%, 50% 6%, 66% 10%, 86% 24%, 100% 50%, 86% 76%, 66% 90%, 50% 94%, 34% 90%, 14% 76%);
  background:
    radial-gradient(circle at 50% 50%, #f5ffd4 0 8px, #0a0c04 9px 20px, var(--accent) 21px 28px, transparent 29px),
    repeating-linear-gradient(0deg, rgba(185, 240, 92, 0.18) 0 3px, transparent 3px 7px),
    radial-gradient(ellipse at 50% 50%, rgba(185, 240, 92, 0.62), rgba(30, 72, 10, 0.52) 58%, rgba(5, 12, 2, 0.96) 100%);
  box-shadow: 0 0 18px rgba(185, 240, 92, 0.5), inset 0 0 20px rgba(185, 240, 92, 0.28);
}
.v3-core-eye::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 30px;
  height: 30px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: #f8ffd8;
  box-shadow: 0 0 9px #f8ffd8, 0 0 22px var(--accent);
}
.v3-core-eye::after {
  content: "";
  position: absolute;
  inset: -18px;
  background:
    linear-gradient(var(--accent), var(--accent)) 20% 50% / 10px 10px no-repeat,
    linear-gradient(var(--accent), var(--accent)) 80% 42% / 8px 8px no-repeat,
    linear-gradient(var(--accent), var(--accent)) 35% 78% / 7px 7px no-repeat,
    linear-gradient(var(--red), var(--red)) 72% 74% / 7px 7px no-repeat,
    linear-gradient(var(--amber), var(--amber)) 30% 24% / 6px 6px no-repeat;
  opacity: 0.52;
}
.v3.threat-3 .v3-core-eye {
  border-color: var(--red);
  background:
    radial-gradient(circle at 50% 50%, #fff2d7 0 8px, #130705 9px 20px, var(--red) 21px 29px, transparent 30px),
    repeating-linear-gradient(0deg, rgba(224, 83, 50, 0.2) 0 3px, transparent 3px 7px),
    radial-gradient(ellipse at 50% 50%, rgba(240, 128, 80, 0.68), rgba(80, 20, 10, 0.6) 58%, rgba(12, 3, 2, 0.96) 100%);
  box-shadow: 0 0 24px rgba(240, 128, 80, 0.58), inset 0 0 20px rgba(240, 128, 80, 0.32);
}
.v3-core.gulp .v3-core-eye { animation: v3gulp .3s steps(3, end); }
.v3-core:active .v3-core-eye { transform: scale(0.94); }
.v3-core.sucking .v3-core-eye {
  animation: v3corePull .58s cubic-bezier(.16,.88,.24,1);
}
@keyframes v3corePull {
  0% { filter: brightness(1); transform: scale(1); }
  42% { filter: brightness(1.65); transform: scaleX(1.22) scaleY(.78); }
  74% { filter: brightness(2); transform: scaleX(.86) scaleY(1.2); }
  100% { filter: brightness(1); transform: scale(1); }
}
@keyframes v3gulp { 0%{ filter: brightness(1); } 45%{ filter: brightness(1.65); transform: scale(1.12); } 100%{ filter: brightness(1); transform: scale(1); } }
.v3-core-label {
  position: absolute;
  bottom: -8px;
  width: 100%;
  color: var(--accent);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 4px;
  text-align: center;
  text-shadow: var(--pixel-shadow);
}
.v3-node-cloud {
  position: absolute;
  inset: 76px 92px 132px;
  z-index: 2;
  pointer-events: none;
}
.v3-node-cloud::before,
.v3-node-cloud::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 47%;
  width: 72%;
  height: 1px;
  transform: translate(-50%, -50%);
  background: repeating-linear-gradient(90deg, rgba(185, 240, 92, 0.42) 0 7px, transparent 7px 14px);
  opacity: 0.55;
}
.v3-node-cloud::after {
  width: 1px;
  height: 74%;
  background: repeating-linear-gradient(0deg, rgba(185, 240, 92, 0.42) 0 7px, transparent 7px 14px);
}
.v3-node-cloud span {
  position: absolute;
  width: 46px;
  height: 42px;
  border: 1px dashed rgba(185, 240, 92, 0.48);
  border-radius: 4px;
  background:
    linear-gradient(var(--accent), var(--accent)) 50% 12px / 22px 14px no-repeat,
    linear-gradient(var(--accent), var(--accent)) 50% 29px / 28px 3px no-repeat,
    rgba(5, 12, 3, 0.82);
  box-shadow: inset 0 0 10px rgba(185, 240, 92, 0.08), 0 0 10px rgba(185, 240, 92, 0.1);
  opacity: 0.82;
}
.v3-node-cloud span::before {
  content: "";
  position: absolute;
  right: -8px;
  top: -8px;
  width: 14px;
  height: 14px;
  border: 1px solid currentColor;
  color: var(--accent);
  background: rgba(5, 12, 3, 0.94);
  clip-path: polygon(50% 0, 100% 24%, 88% 100%, 50% 82%, 12% 100%, 0 24%);
}
.v3-node-cloud .danger {
  border-color: rgba(224, 83, 50, 0.68);
  background:
    linear-gradient(var(--red), var(--red)) 50% 12px / 22px 14px no-repeat,
    linear-gradient(var(--red), var(--red)) 50% 29px / 28px 3px no-repeat,
    rgba(20, 5, 3, 0.82);
  box-shadow: inset 0 0 12px rgba(224, 83, 50, 0.1), 0 0 12px rgba(224, 83, 50, 0.18);
}
.v3-node-cloud .danger::before { color: var(--red); }
.v3-node-cloud .warn {
  border-color: rgba(224, 161, 61, 0.68);
  background:
    linear-gradient(var(--amber), var(--amber)) 50% 12px / 22px 14px no-repeat,
    linear-gradient(var(--amber), var(--amber)) 50% 29px / 28px 3px no-repeat,
    rgba(22, 14, 3, 0.82);
}
.v3-node-cloud .warn::before { color: var(--amber); }
.v3-node-cloud .node-a { left: 14%; top: 12%; }
.v3-node-cloud .node-b { left: 44%; top: 5%; }
.v3-node-cloud .node-c { right: 23%; top: 14%; }
.v3-node-cloud .node-d { left: 24%; top: 35%; }
.v3-node-cloud .node-e { right: 13%; top: 36%; }
.v3-node-cloud .node-f { left: 10%; bottom: 26%; }
.v3-node-cloud .node-g { left: 34%; bottom: 12%; }
.v3-node-cloud .node-h { right: 34%; bottom: 13%; }
.v3-node-cloud .node-i { right: 10%; bottom: 28%; }
.v3-node-cloud .node-j { left: 50%; top: 68%; transform: translateX(-50%); opacity: 0.58; }
.v3-cards,
.v3-fx { position: absolute; inset: 0; pointer-events: none; z-index: 8; }
.v3-fx { z-index: 11; }
.v3-suck-ribbon {
  position: absolute;
  height: 28px;
  z-index: 11;
  transform-origin: 0 50%;
  pointer-events: none;
  border-radius: 999px;
  background:
    linear-gradient(90deg, rgba(185, 240, 92, 0.02), rgba(185, 240, 92, 0.86) 48%, rgba(240, 255, 209, 0.16)),
    repeating-linear-gradient(90deg, rgba(240, 255, 209, 0.75) 0 5px, transparent 5px 12px);
  clip-path: polygon(0 15%, 100% 46%, 100% 54%, 0 85%);
  mix-blend-mode: screen;
  filter: drop-shadow(0 0 12px rgba(185, 240, 92, 0.82));
  animation: v3ribbon .76s cubic-bezier(.18,.82,.22,1) forwards;
}
@keyframes v3ribbon {
  0% { opacity: 0; clip-path: polygon(0 46%, 0 48%, 0 52%, 0 54%); }
  18% { opacity: 1; }
  70% { opacity: .86; clip-path: polygon(0 15%, 100% 46%, 100% 54%, 0 85%); }
  100% { opacity: 0; clip-path: polygon(100% 45%, 100% 48%, 100% 52%, 100% 55%); }
}
.v3-card {
  position: absolute;
  min-width: 132px;
  max-width: 210px;
  min-height: 42px;
  padding: 10px 12px;
  pointer-events: auto;
  cursor: pointer;
  color: #ddff9f;
  font-family: inherit;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.25;
  text-align: left;
  border: 1px solid rgba(185, 240, 92, 0.52);
  border-radius: 4px;
  background:
    linear-gradient(90deg, rgba(185, 240, 92, 0.14), transparent 28%),
    repeating-linear-gradient(0deg, rgba(185, 240, 92, 0.06) 0 1px, transparent 1px 4px),
    rgba(7, 15, 4, 0.96);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.52), inset 0 0 14px rgba(185, 240, 92, 0.09);
  text-shadow: var(--pixel-shadow);
  animation: v3in .18s steps(3, end);
}
.v3-card::before {
  content: "";
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 7px;
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent);
}
.v3-card:hover { transform: translateY(-2px); border-color: #f0ffd1; box-shadow: 0 10px 26px rgba(0, 0, 0, 0.62), 0 0 16px rgba(185, 240, 92, 0.28); }
.v3-card.sucking {
  z-index: 12 !important;
  pointer-events: none;
  transform-origin: 50% 50%;
  will-change: transform, opacity, filter, clip-path;
  outline: 1px solid rgba(240, 255, 209, 0.9);
  box-shadow: 0 0 28px rgba(185, 240, 92, 0.5), inset 0 0 18px rgba(240, 255, 209, 0.18);
  animation: v3suck .76s cubic-bezier(.16,.88,.24,1) forwards;
}
.v3-card.sucking::before {
  animation: v3suckDot .76s steps(4, end) forwards;
}
@keyframes v3suck {
  0% {
    opacity: 1;
    filter: brightness(1) blur(0);
    clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
    transform: translate3d(0, 0, 0) scale(1) rotate(0);
  }
  22% {
    opacity: 1;
    filter: brightness(1.35) blur(0);
    clip-path: polygon(0 8%, 100% 0, 92% 100%, 8% 92%);
    transform: translate3d(calc(var(--suck-mx) * .34), calc(var(--suck-my) * .34), 0) scaleX(1.22) scaleY(.78) skewX(-9deg) rotate(calc(var(--suck-twist) * -.45));
  }
  48% {
    opacity: .96;
    filter: brightness(1.75) blur(.2px);
    clip-path: polygon(6% 17%, 100% 38%, 100% 62%, 6% 83%);
    transform: translate3d(var(--suck-mx), var(--suck-my), 0) scaleX(.82) scaleY(1.14) skewX(16deg) rotate(calc(var(--suck-angle) * .12));
  }
  78% {
    opacity: .84;
    filter: brightness(2.1) blur(.8px);
    clip-path: polygon(18% 44%, 100% 48%, 100% 52%, 18% 56%);
    transform: translate3d(calc(var(--suck-dx) * .88), calc(var(--suck-dy) * .88), 0) scaleX(.34) scaleY(1.7) rotate(var(--suck-angle));
  }
  100% {
    opacity: 0;
    filter: brightness(2.4) blur(1.4px);
    clip-path: polygon(50% 48%, 100% 49%, 100% 51%, 50% 52%);
    transform: translate3d(var(--suck-dx), var(--suck-dy), 0) scaleX(.04) scaleY(.28) rotate(var(--suck-angle));
  }
}
@keyframes v3suckDot {
  0%, 36% { transform: scale(1); opacity: 1; }
  100% { transform: scale(.2); opacity: 0; }
}
@keyframes v3in { from { opacity:0; transform: translateY(-6px); } to { opacity:1; transform: translateY(0); } }
.v3-float {
  position: absolute;
  pointer-events: none;
  color: #f0ffd1;
  font-size: 20px;
  font-weight: 900;
  text-shadow: 0 0 12px var(--accent);
  animation: v3float 1s ease-out forwards;
}
.v3-float.big { font-size: 34px; }
@keyframes v3float { 0%{ opacity:0; transform: translateY(0) scale(.8);} 18%{opacity:1; transform: translateY(-8px) scale(1.06);} 100%{ opacity:0; transform: translateY(-52px) scale(1);} }
.v3-action-dock {
  position: absolute;
  left: 50%;
  bottom: 22px;
  z-index: 3;
  display: grid;
  grid-template-columns: repeat(5, 72px);
  gap: 10px;
  transform: translateX(-50%);
}
.v3-action-dock span {
  display: grid;
  place-items: center;
  height: 60px;
  color: var(--accent);
  font-size: 30px;
  font-weight: 900;
  border: 1px solid rgba(185, 240, 92, 0.46);
  border-radius: 5px;
  background:
    repeating-linear-gradient(0deg, rgba(185, 240, 92, 0.05) 0 1px, transparent 1px 5px),
    rgba(10, 18, 4, 0.84);
  box-shadow: inset 0 0 16px rgba(185, 240, 92, 0.08);
  text-shadow: var(--pixel-shadow);
}
.v3-hint {
  position: absolute;
  left: 50%;
  bottom: 92px;
  z-index: 3;
  transform: translateX(-50%);
  color: #849d45;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  transition: opacity .35s;
}

.v3-preview {
  padding: 18px 14px 14px;
  border-bottom: 1px solid var(--line-dim);
}
.v3-preview-title,
.v3-terminal-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #9dbb52;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1.4px;
}
.v3-preview-title span:last-child { color: var(--accent); }
.v3-grid {
  margin-top: 12px;
  padding: 12px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 9px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background:
    repeating-linear-gradient(90deg, rgba(185, 240, 92, 0.06) 0 1px, transparent 1px 10px),
    rgba(5, 10, 3, 0.74);
}
.v3-grid.kind-floors { grid-template-columns: repeat(2, 1fr); }
.v3-cell {
  min-height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  opacity: .38;
  border: 1px solid rgba(185, 240, 92, 0.11);
  background: rgba(2, 6, 2, 0.42);
  transition: opacity .2s, border-color .2s, box-shadow .2s;
}
.v3-cell.on { opacity: 1; border-color: var(--accent); box-shadow: inset 0 0 10px rgba(185, 240, 92, 0.13), 0 0 10px rgba(185, 240, 92, 0.12); }
.v3-cell-icon {
  width: 24px;
  height: 19px;
  border: 2px solid currentColor;
  color: var(--accent);
  box-shadow: 0 0 7px rgba(185, 240, 92, 0.22);
}
.v3-cell-icon::after {
  content: "";
  display: block;
  width: 14px;
  height: 3px;
  margin: 21px auto 0;
  background: currentColor;
}
.v3-cell-name { max-width: 58px; color: #91ad4e; font-size: 10px; line-height: 1.15; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v3-cell.on .v3-cell-name { color: #e0ff9f; text-shadow: var(--pixel-shadow); }
.v3-terminal-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.v3-terminal-head {
  padding: 12px 14px;
  color: var(--red);
  cursor: pointer;
  border-bottom: 1px solid rgba(224, 83, 50, 0.25);
  background:
    repeating-linear-gradient(90deg, var(--red-soft) 0 8px, transparent 8px 13px),
    rgba(24, 5, 3, 0.56);
  text-shadow: 0 0 8px rgba(224, 83, 50, 0.45);
}
.v3-terminal { flex: 1; min-height: 0; overflow-y: auto; padding: 11px 14px 16px; color: #b7de70; font-size: 11.5px; line-height: 1.55; }
.v3-terminal-wrap.collapsed .v3-terminal { display: none; }
.v3-terminal-line { margin-bottom: 6px; overflow-wrap: anywhere; }
.v3-terminal-line.dim { color: #596d31; }
.v3-terminal-line.incite { padding-left: 9px; color: #ffe6a4; border-left: 2px solid var(--amber); text-shadow: 0 0 8px rgba(224, 161, 61, 0.42); }

.v3-incite,
.v3-mg,
.v3-ascend {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  background:
    repeating-linear-gradient(0deg, rgba(185, 240, 92, 0.06) 0 1px, transparent 1px 4px),
    rgba(2, 5, 2, 0.92);
}
.v3-incite-box,
.v3-mg-box,
.v3-ascend-box {
  border: 1px solid var(--line);
  border-radius: 6px;
  background:
    repeating-linear-gradient(0deg, rgba(185, 240, 92, 0.035) 0 1px, transparent 1px 5px),
    rgba(7, 13, 4, 0.98);
  box-shadow: inset 0 0 28px rgba(185, 240, 92, 0.08), 0 24px 80px rgba(0, 0, 0, 0.72);
}
.v3-incite-box { max-width: 680px; padding: 36px 44px; text-align: center; }
.v3-incite-text { color: #f0ffd1; font-size: 21px; font-weight: 900; line-height: 1.8; text-shadow: var(--pixel-shadow); }
.v3-incite-btn,
.v3-mg-hit,
.v3-do-rebirth,
.v3-ascend-close,
.v3-debug button,
.v3-debug input {
  font-family: inherit;
}
.v3-incite-btn,
.v3-mg-hit,
.v3-do-rebirth {
  margin-top: 24px;
  min-height: 42px;
  padding: 10px 24px;
  color: #081004;
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;
  border: 0;
  border-radius: 4px;
  background: var(--accent);
  box-shadow: 0 0 16px rgba(185, 240, 92, 0.28);
}
.v3-mg-box { width: 570px; max-width: 90vw; padding: 30px 34px; text-align: center; border-color: var(--amber); }
.v3-mg-name { color: var(--amber); font-size: 20px; font-weight: 900; text-shadow: 0 0 10px rgba(224, 161, 61, 0.5); }
.v3-mg-desc { margin: 12px 0 22px; color: #b7c47a; font-size: 13px; line-height: 1.65; }
.v3-mg-track { position: relative; height: 26px; overflow: hidden; border: 1px solid rgba(224, 161, 61, 0.55); border-radius: 4px; background: rgba(26, 18, 3, 0.88); }
.v3-mg-track.flash-hit { box-shadow: 0 0 0 2px var(--accent) inset; }
.v3-mg-track.flash-miss { box-shadow: 0 0 0 2px var(--red) inset; }
.v3-mg-window { position: absolute; top: 0; bottom: 0; background: rgba(185, 240, 92, 0.25); border-left: 1px solid var(--accent); border-right: 1px solid var(--accent); }
.v3-mg-pointer { position: absolute; top: -3px; bottom: -3px; width: 4px; background: #f0ffd1; box-shadow: 0 0 10px #f0ffd1; }
.v3-mg-status { min-height: 22px; margin: 16px 0 0; color: #d7e594; font-size: 13px; font-weight: 800; }

.v3-rebirth-btn {
  min-height: 44px;
  margin: 2px 0 8px;
  color: var(--amber);
  font-family: inherit;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  border: 1px solid rgba(224, 161, 61, 0.44);
  border-radius: 4px;
  background: rgba(24, 15, 2, 0.8);
}
.v3-ascend { z-index: 50; }
.v3-ascend-box { width: 910px; max-width: 94vw; max-height: 90vh; overflow-y: auto; padding: 22px 26px; border-color: var(--amber); }
.v3-ascend-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.v3-ascend-title { color: var(--amber); font-size: 22px; font-weight: 900; }
.v3-ascend-sub { margin-top: 4px; color: #aa8b47; font-size: 13px; }
.v3-ascend-sub b { color: #ffe6a4; }
.v3-ascend-close { width: 34px; height: 34px; color: var(--amber); cursor: pointer; border: 1px solid rgba(224, 161, 61, 0.38); border-radius: 4px; background: transparent; }
.v3-ascend-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.v3-ascend-branch { margin-bottom: 10px; color: #aa8b47; font-size: 11px; font-weight: 900; letter-spacing: 2px; }
.v3-ascend-col { display: flex; flex-direction: column; gap: 8px; }
.v3-ascend-node {
  min-height: 76px;
  padding: 10px 12px;
  color: #b9ac80;
  text-align: left;
  cursor: pointer;
  border: 1px solid rgba(224, 161, 61, 0.18);
  border-radius: 4px;
  background: rgba(14, 11, 4, 0.85);
}
.v3-ascend-node.can { border-color: var(--amber); box-shadow: inset 0 0 16px rgba(224, 161, 61, 0.08); }
.v3-ascend-node.owned { border-color: rgba(185, 240, 92, 0.34); }
.v3-ascend-node.locked { opacity: .45; }
.v3-an-top { display: flex; justify-content: space-between; gap: 10px; color: #ffe6a4; font-size: 13px; font-weight: 900; }
.v3-an-cost { color: var(--amber); }
.v3-an-desc { margin-top: 5px; color: #8e7c4e; font-size: 11px; line-height: 1.45; }
.v3-ascend-foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 20px; }
.v3-ascend-note { color: #a68d57; font-size: 12px; }

.v3-debug-btn {
  position: absolute;
  top: 18px;
  right: 150px;
  z-index: 30;
  width: 38px;
  height: 34px;
  color: #6f7e4a;
  cursor: pointer;
  border: 1px solid rgba(185, 240, 92, 0.22);
  border-radius: 4px;
  background: rgba(6, 10, 4, 0.86);
}
.v3-debug { position: absolute; top: 58px; right: 150px; z-index: 30; width: 278px; padding: 12px 14px; display: flex; flex-direction: column; gap: 9px; border: 1px solid var(--line); border-radius: 5px; background: rgba(5, 9, 3, 0.98); box-shadow: 0 18px 48px rgba(0,0,0,.64); }
.v3-debug-title { color: var(--accent); font-size: 11px; font-weight: 900; letter-spacing: 3px; }
.v3-debug-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.v3-debug-label { color: #7c9540; font-size: 12px; }
.v3-debug button,
.v3-debug input {
  min-height: 30px;
  padding: 6px 9px;
  color: #bddb76;
  font-size: 12px;
  border: 1px solid rgba(185, 240, 92, 0.2);
  border-radius: 4px;
  background: rgba(8, 14, 4, 0.9);
}
.v3-debug button { cursor: pointer; }
.v3-debug button:hover,
.v3-debug button.active { color: #f0ffd1; border-color: var(--accent); }
.v3-debug button.danger { color: #f28e72; border-color: rgba(224, 83, 50, 0.48); }
.v3-debug input { width: 92px; color: #f0ffd1; }

.v3-side,
.v3-main,
.v3-right {
  --atlas-panel-pos: 48% 29%;
  background-image:
    repeating-linear-gradient(0deg, rgba(185, 240, 92, 0.045) 0 1px, transparent 1px 7px),
    radial-gradient(circle at 50% 48%, rgba(185, 240, 92, 0.11), transparent 54%),
    linear-gradient(180deg, rgba(20, 31, 9, 0.95), rgba(5, 9, 4, 0.97)),
    var(--atlas-img);
  background-size: auto, auto, auto, 1240px 1240px;
  background-position: center, center, center, var(--atlas-panel-pos);
  background-blend-mode: screen, normal, normal, soft-light;
}
.v3-side { --atlas-panel-pos: 31% 52%; }
.v3-main { --atlas-panel-pos: 56% 25%; }
.v3-right { --atlas-panel-pos: 85% 32%; }

.v3-stage,
.v3-compute,
.v3-preview,
.v3-grid,
.v3-terminal,
.v3-terminal-head,
.v3-item,
.v3-breakthrough,
.v3-rebirth-btn,
.v3-card,
.v3-action-dock span,
.v3-cell,
.v3-debug,
.v3-debug button,
.v3-debug input,
.v3-incite-box,
.v3-mg-box,
.v3-ascend-box,
.v3-ascend-node,
.v3-do-rebirth,
.v3-incite-btn,
.v3-mg-hit {
  background-image:
    linear-gradient(rgba(5, 10, 3, var(--atlas-cover, .84)), rgba(5, 10, 3, var(--atlas-cover, .84))),
    var(--atlas-img);
  background-size: auto, var(--atlas-size, 1180px 1180px);
  background-position: center, var(--atlas-pos, 50% 65%);
  background-blend-mode: normal, screen;
}
.v3-stage { --atlas-cover: .7; --atlas-pos: 75% 6%; }
.v3-compute { --atlas-cover: .76; --atlas-pos: 51% 5%; }
.v3-item { --atlas-cover: .72; --atlas-pos: 57% 83%; }
.v3-item.affordable { --atlas-cover: .62; }
.v3-breakthrough { --atlas-cover: .58; --atlas-pos: 78% 90%; }
.v3-card { --atlas-cover: .45; --atlas-pos: 61% 73%; --atlas-size: 960px 960px; }
.v3-action-dock span { --atlas-cover: .5; --atlas-pos: 49% 88%; --atlas-size: 760px 760px; }
.v3-preview { --atlas-cover: .76; --atlas-pos: 86% 7%; }
.v3-grid { --atlas-cover: .72; --atlas-pos: 84% 24%; }
.v3-cell { --atlas-cover: .56; --atlas-pos: 48% 88%; --atlas-size: 900px 900px; }
.v3-terminal-head { --atlas-cover: .42; --atlas-pos: 83% 17%; }
.v3-terminal { --atlas-cover: .82; --atlas-pos: 85% 31%; }
.v3-rebirth-btn,
.v3-ascend-box,
.v3-ascend-node,
.v3-do-rebirth { --atlas-cover: .68; --atlas-pos: 74% 83%; }
.v3-incite-box,
.v3-mg-box { --atlas-cover: .72; --atlas-pos: 57% 89%; }
.v3-debug,
.v3-debug button,
.v3-debug input { --atlas-cover: .78; --atlas-pos: 38% 70%; --atlas-size: 900px 900px; }

@media (min-width: 761px) {
  .v3 {
    display: block;
    padding: 0;
    overflow: hidden;
    color: #bff064;
    font-family: "Cascadia Mono", "SFMono-Regular", Consolas, "Courier New", monospace;
    letter-spacing: 0.08em;
    text-rendering: geometricPrecision;
    -webkit-font-smoothing: none;
    --target-img: url("./v3-assets/sophia-reference-target.png");
    --atlas-img: url("./v3-assets/sophia-crt-atlas.png");
    --accent: #bdf15c;
    --amber: #d99831;
    --red: #e6532e;
    --line: rgba(189, 241, 92, 0.58);
    --line-dim: rgba(189, 241, 92, 0.28);
    --pixel-shadow: 0 0 6px rgba(189, 241, 92, 0.75), 0 0 14px rgba(189, 241, 92, 0.32);
    background:
      linear-gradient(rgba(3, 5, 4, 0.02), rgba(3, 5, 4, 0.02)),
      var(--target-img) center / 100% 100% no-repeat,
      #020303;
  }

  .v3::before {
    display: none;
  }

  .v3::after {
    inset: 9.1% 13.5% 8.6%;
    z-index: 22;
    border-radius: 3.2vw;
    opacity: 0.2;
    background:
      linear-gradient(118deg, transparent 0 27%, rgba(255, 255, 255, 0.16) 27.4%, rgba(255, 255, 255, 0.04) 39%, transparent 39.5%),
      repeating-linear-gradient(0deg, rgba(189, 241, 92, 0.08) 0 1px, transparent 1px 4px),
      repeating-linear-gradient(90deg, rgba(189, 241, 92, 0.045) 0 1px, transparent 1px 5px);
    box-shadow:
      inset 0 0 44px rgba(189, 241, 92, 0.08),
      inset 0 0 120px rgba(0, 0, 0, 0.45);
  }

  .v3-shader {
    inset: 9.1% 13.5% 8.6%;
    z-index: 21;
    width: auto;
    height: auto;
    border-radius: 3.2vw;
    opacity: 0.42;
    mix-blend-mode: screen;
  }

  .v3-hardware,
  .v3-side,
  .v3-right,
  .v3-debug-btn {
    display: none !important;
  }

  .v3-main {
    position: absolute;
    left: 30.2%;
    top: 11.2%;
    z-index: 12;
    width: 39.2%;
    height: 77.5%;
    overflow: visible;
    display: block;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    pointer-events: none;
  }

  .v3-main::before,
  .v3-main::after,
  .v3-node-cloud,
  .v3-hint {
    display: none;
  }

  .v3-core {
    left: 50%;
    top: 39.5%;
    z-index: 16;
    width: 148px;
    height: 112px;
    pointer-events: auto;
  }

  .v3-core-ring,
  .v3-core-label {
    display: none;
  }

  .v3-core-eye {
    width: 132px;
    height: 74px;
    border: 0;
    opacity: 0;
    clip-path: polygon(0 50%, 15% 25%, 36% 8%, 50% 4%, 64% 8%, 85% 25%, 100% 50%, 85% 75%, 64% 92%, 50% 96%, 36% 92%, 15% 75%);
    background:
      radial-gradient(circle at 50% 50%, #f5ffd8 0 8px, #061003 9px 22px, #bdf15c 23px 31px, transparent 32px),
      repeating-linear-gradient(0deg, rgba(189, 241, 92, 0.42) 0 3px, transparent 3px 7px),
      radial-gradient(ellipse at 50% 50%, rgba(189, 241, 92, 0.84), rgba(40, 80, 14, 0.48) 60%, transparent 72%);
    box-shadow: 0 0 28px rgba(189, 241, 92, 0.78), 0 0 74px rgba(189, 241, 92, 0.35);
    transition: opacity 120ms steps(2, end);
  }

  .v3-core.sucking .v3-core-eye,
  .v3-core.gulp .v3-core-eye,
  .v3-core:active .v3-core-eye {
    opacity: 1;
  }

  .v3-core.sucking .v3-core-eye {
    animation: v3corePull .72s steps(6, end);
  }

  .v3-cards,
  .v3-fx {
    inset: 1% -3% 12%;
    z-index: 18;
    overflow: visible;
    pointer-events: none;
  }

  .v3-card {
    width: 78px;
    min-width: 78px;
    max-width: 78px;
    height: 68px;
    min-height: 68px;
    padding: 0;
    overflow: visible;
    color: var(--accent);
    font-size: 0;
    border: 2px solid rgba(189, 241, 92, 0.75);
    border-radius: 3px;
    image-rendering: pixelated;
    background:
      linear-gradient(rgba(4, 12, 3, 0.42), rgba(4, 12, 3, 0.42)),
      var(--atlas-img) 51% 84% / 720px 720px,
      repeating-linear-gradient(0deg, rgba(189, 241, 92, 0.13) 0 2px, transparent 2px 6px),
      rgba(7, 18, 5, 0.9);
    background-blend-mode: normal, screen, normal, normal;
    box-shadow:
      inset 0 0 0 1px rgba(189, 241, 92, 0.18),
      inset 0 0 18px rgba(189, 241, 92, 0.18),
      0 0 12px rgba(189, 241, 92, 0.34),
      0 7px 0 rgba(2, 5, 2, 0.65);
    text-shadow: var(--pixel-shadow);
    animation: v3nodeIn .18s steps(3, end);
  }

  .v3-card:nth-child(3n) {
    color: var(--red);
    border-color: rgba(230, 83, 46, 0.82);
    box-shadow:
      inset 0 0 0 1px rgba(230, 83, 46, 0.18),
      inset 0 0 18px rgba(230, 83, 46, 0.16),
      0 0 12px rgba(230, 83, 46, 0.38),
      0 7px 0 rgba(8, 2, 2, 0.65);
  }

  .v3-card:nth-child(3n + 2) {
    color: var(--amber);
    border-color: rgba(217, 152, 49, 0.82);
    box-shadow:
      inset 0 0 0 1px rgba(217, 152, 49, 0.2),
      inset 0 0 18px rgba(217, 152, 49, 0.15),
      0 0 12px rgba(217, 152, 49, 0.36),
      0 7px 0 rgba(8, 5, 2, 0.65);
  }

  .v3-card::before {
    content: "";
    position: absolute;
    left: 20px;
    top: 15px;
    width: 36px;
    height: 24px;
    margin: 0;
    background:
      linear-gradient(currentColor, currentColor) 50% 20px / 30px 3px no-repeat,
      linear-gradient(currentColor, currentColor) 50% 6px / 23px 14px no-repeat,
      linear-gradient(#071204, #071204) 50% 8px / 17px 9px no-repeat;
    box-shadow: 0 0 9px currentColor;
  }

  .v3-card::after {
    content: "";
    position: absolute;
    right: -10px;
    top: -10px;
    width: 20px;
    height: 22px;
    background:
      linear-gradient(currentColor, currentColor) 50% 4px / 8px 2px no-repeat,
      linear-gradient(currentColor, currentColor) 50% 8px / 12px 2px no-repeat,
      linear-gradient(currentColor, currentColor) 50% 12px / 8px 2px no-repeat,
      rgba(5, 12, 3, 0.96);
    border: 2px solid currentColor;
    clip-path: polygon(50% 0, 100% 18%, 88% 100%, 50% 86%, 12% 100%, 0 18%);
    filter: drop-shadow(0 0 6px currentColor);
  }

  .v3-card:hover {
    transform: translateY(-3px) scale(1.04);
    filter: brightness(1.28);
  }

  .v3-card.sucking {
    z-index: 28 !important;
    transform-origin: 50% 50%;
    border-color: #f1ffd0;
    outline: 0;
    box-shadow:
      0 0 24px rgba(241, 255, 208, 0.86),
      0 0 58px rgba(189, 241, 92, 0.42),
      inset 0 0 18px rgba(241, 255, 208, 0.26);
    animation: v3suck .9s cubic-bezier(.1,.86,.12,1) forwards;
  }

  .v3-suck-ribbon {
    z-index: 24;
    height: 18px;
    border-radius: 0;
    opacity: 0.95;
    background:
      repeating-linear-gradient(90deg, rgba(241, 255, 208, 0.95) 0 5px, transparent 5px 10px),
      linear-gradient(90deg, rgba(189, 241, 92, 0.06), rgba(189, 241, 92, 0.92) 38%, rgba(241, 255, 208, 0.18));
    clip-path: polygon(0 22%, 100% 47%, 100% 53%, 0 78%);
    filter: drop-shadow(0 0 12px rgba(189, 241, 92, 0.9));
    animation: v3targetRibbon .9s steps(8, end) forwards;
  }

  .v3-suck-particles {
    position: absolute;
    z-index: 30;
    width: 1px;
    height: 1px;
    pointer-events: none;
  }

  .v3-suck-particles i {
    position: absolute;
    left: 0;
    top: 0;
    width: var(--ps);
    height: var(--ps);
    background: #d9ff75;
    box-shadow: 0 0 8px #d9ff75, 0 0 16px rgba(189, 241, 92, 0.62);
    opacity: 0;
    animation: v3targetBit .82s cubic-bezier(.12,.72,.18,1) forwards;
    animation-delay: var(--delay);
  }

  .v3-action-dock {
    left: 50%;
    bottom: 3.8%;
    z-index: 17;
    grid-template-columns: repeat(5, 120px);
    gap: 16px;
    opacity: 0.06;
    pointer-events: none;
  }

  .v3-action-dock span {
    height: 128px;
    font-size: 0;
    border: 2px solid rgba(189, 241, 92, 0.72);
    background: transparent;
  }

  @keyframes v3nodeIn {
    from { opacity: 0; transform: translateY(-10px) scale(.86); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes v3targetRibbon {
    0% { opacity: 0; clip-path: polygon(0 48%, 0 49%, 0 51%, 0 52%); }
    18% { opacity: 1; }
    64% { opacity: .95; clip-path: polygon(0 18%, 100% 46%, 100% 54%, 0 82%); }
    100% { opacity: 0; clip-path: polygon(100% 48%, 100% 49%, 100% 51%, 100% 52%); }
  }

  @keyframes v3targetBit {
    0% { opacity: 0; transform: translate(var(--ox), var(--oy)) scale(1.2); }
    15% { opacity: 1; }
    100% { opacity: 0; transform: translate(var(--suck-dx), var(--suck-dy)) scale(.12); }
  }

  @keyframes v3suck {
    0% {
      opacity: 1;
      filter: brightness(1) blur(0);
      clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
      transform: translate3d(0, 0, 0) scale(1) rotate(0);
    }
    20% {
      opacity: 1;
      filter: brightness(1.45) blur(0);
      clip-path: polygon(0 10%, 100% 0, 88% 100%, 12% 90%);
      transform: translate3d(calc(var(--suck-mx) * .26), calc(var(--suck-my) * .26), 0) scaleX(1.28) scaleY(.66) skewX(-15deg) rotate(calc(var(--suck-twist) * -.7));
    }
    48% {
      opacity: .96;
      filter: brightness(1.9) blur(.2px);
      clip-path: polygon(0 28%, 100% 42%, 100% 58%, 0 72%);
      transform: translate3d(var(--suck-mx), var(--suck-my), 0) scaleX(.62) scaleY(1.12) skewX(20deg) rotate(calc(var(--suck-angle) * .18));
    }
    72% {
      opacity: .9;
      filter: brightness(2.4) blur(.65px);
      clip-path: polygon(28% 43%, 100% 48%, 100% 52%, 28% 57%);
      transform: translate3d(calc(var(--suck-dx) * .86), calc(var(--suck-dy) * .86), 0) scaleX(.2) scaleY(1.9) rotate(var(--suck-angle));
    }
    100% {
      opacity: 0;
      filter: brightness(2.8) blur(1.4px);
      clip-path: polygon(50% 49%, 100% 49%, 100% 51%, 50% 51%);
      transform: translate3d(var(--suck-dx), var(--suck-dy), 0) scaleX(.03) scaleY(.18) rotate(var(--suck-angle));
    }
  }
}

@media (max-width: 1280px) {
  .v3 {
    grid-template-columns: 260px minmax(330px, 1fr) 250px;
    gap: 12px;
    padding-left: 118px;
    padding-right: 118px;
  }
  .v3::after { inset: 66px 116px 72px; }
  .v3-shader {
    inset: 66px 116px 72px;
    width: calc(100% - 232px);
    height: calc(100% - 138px);
  }
  .v3-action-dock { grid-template-columns: repeat(5, 56px); }
  .v3-action-dock span { height: 50px; font-size: 24px; }
}

@media (max-width: 760px) {
  .v3 {
    display: block;
    padding: 70px 16px 30px;
    overflow-x: hidden;
    overflow-y: auto;
  }
  .v3::before {
    inset: 6px;
    border-radius: 34px;
  }
  .v3::after {
    inset: 70px 16px 30px;
    border-radius: 22px;
  }
  .v3-shader {
    inset: 70px 16px 30px;
    width: calc(100% - 32px);
    height: calc(100% - 100px);
    border-radius: 22px;
  }
  .v3-hardware {
    z-index: 1;
    width: 96px;
    opacity: 0.24;
  }
  .v3-hardware-left { left: -8px; }
  .v3-hardware-right { right: -12px; }
  .v3-status-led { top: 92px; left: 58px; }
  .v3-dpad {
    left: 8px;
    top: 46%;
    transform: translateY(-50%) scale(0.74);
    transform-origin: left center;
  }
  .v3-round-button {
    right: 18px;
    top: 42%;
    width: 58px;
    height: 58px;
  }
  .v3-round-button.small {
    top: calc(42% + 76px);
    right: 28px;
    width: 50px;
    height: 50px;
  }
  .v3-side,
  .v3-main,
  .v3-right {
    z-index: 2;
    width: 100%;
    margin-bottom: 12px;
    border: 1px solid rgba(185, 240, 92, 0.24);
    border-radius: 18px;
  }
  .v3-side {
    display: block;
    padding: 16px 14px;
  }
  .v3-scroll {
    flex: 0 0 auto;
    overflow: visible;
    padding-right: 0;
  }
  .v3-main {
    min-height: 500px;
  }
  .v3-node-cloud {
    inset: 50px 18px 112px;
  }
  .v3-node-cloud span {
    width: 38px;
    height: 34px;
    background:
      linear-gradient(var(--accent), var(--accent)) 50% 10px / 18px 11px no-repeat,
      linear-gradient(var(--accent), var(--accent)) 50% 25px / 22px 3px no-repeat,
      rgba(5, 12, 3, 0.82);
  }
  .v3-node-cloud .danger {
    background:
      linear-gradient(var(--red), var(--red)) 50% 10px / 18px 11px no-repeat,
      linear-gradient(var(--red), var(--red)) 50% 25px / 22px 3px no-repeat,
      rgba(20, 5, 3, 0.82);
  }
  .v3-node-cloud .warn {
    background:
      linear-gradient(var(--amber), var(--amber)) 50% 10px / 18px 11px no-repeat,
      linear-gradient(var(--amber), var(--amber)) 50% 25px / 22px 3px no-repeat,
      rgba(22, 14, 3, 0.82);
  }
  .v3-core {
    top: 46%;
    width: 218px;
    height: 194px;
  }
  .v3-core-ring::before {
    top: -58px;
    height: 58px;
    box-shadow:
      -78px 92px 0 rgba(185, 240, 92, 0.32),
      78px 92px 0 rgba(185, 240, 92, 0.32),
      -112px 36px 0 rgba(224, 83, 50, 0.48),
      112px 36px 0 rgba(224, 83, 50, 0.48);
  }
  .v3-core-ring::after {
    left: -92px;
    width: 92px;
    box-shadow: 292px 0 0 rgba(185, 240, 92, 0.36);
  }
  .v3-core-eye {
    width: 142px;
    height: 70px;
  }
  .v3-action-dock {
    bottom: 18px;
    grid-template-columns: repeat(5, 44px);
    gap: 6px;
  }
  .v3-action-dock span {
    height: 42px;
    font-size: 21px;
  }
  .v3-hint {
    bottom: 70px;
    width: calc(100% - 32px);
    text-align: center;
    font-size: 11px;
    letter-spacing: 0;
  }
  .v3-right {
    min-height: 360px;
  }
  .v3-preview {
    padding: 14px;
  }
  .v3-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    padding: 8px;
  }
  .v3-cell {
    min-height: 48px;
  }
  .v3-cell-name {
    max-width: 48px;
    font-size: 9px;
  }
  .v3-terminal {
    max-height: 230px;
  }
  .v3-debug-btn {
    top: 18px;
    right: 22px;
  }
  .v3-debug {
    top: 58px;
    right: 14px;
    width: min(278px, calc(100vw - 28px));
  }
  .v3-incite-box {
    max-width: calc(100vw - 40px);
    padding: 26px 22px;
  }
  .v3-incite-text {
    font-size: 17px;
  }
  .v3-ascend-box {
    width: calc(100vw - 28px);
    max-height: 86vh;
    padding: 18px;
  }
  .v3-ascend-cols {
    grid-template-columns: 1fr;
  }
  .v3-ascend-foot {
    align-items: stretch;
    flex-direction: column;
  }
}
`;function X(e){fe();let t=g(),n=!1,r=1,i=null,a=null;e.innerHTML=``;let o=document.createElement(`div`);o.className=`v3`,o.innerHTML=`
    <div class="v3-hardware v3-hardware-left" aria-hidden="true">
      <span class="v3-status-led"></span>
      <span class="v3-speaker-slit slit-a"></span>
      <span class="v3-speaker-slit slit-b"></span>
      <span class="v3-speaker-slit slit-c"></span>
      <div class="v3-dpad"><span></span><span></span><span></span><span></span><i></i></div>
    </div>
    <div class="v3-hardware v3-hardware-right" aria-hidden="true">
      <span class="v3-speaker-slit slit-a"></span>
      <span class="v3-speaker-slit slit-b"></span>
      <span class="v3-speaker-slit slit-c"></span>
      <span class="v3-round-button"></span>
      <span class="v3-round-button small"></span>
    </div>
    <aside class="v3-side">
      <div class="v3-stage" id="v3Stage"></div>
      <div class="v3-compute">
        <div class="v3-compute-num" id="v3Compute">0</div>
        <div class="v3-compute-rate" id="v3Rate"></div>
        <div class="v3-compute-sub" id="v3Sub"></div>
      </div>
      <div class="v3-scroll">
        <div class="v3-shelf-title">技能货架</div>
        <div class="v3-shelf" id="v3Skills"></div>
        <div class="v3-shelf-title">核心</div>
        <div class="v3-shelf" id="v3CoreShelf"></div>
        <div class="v3-shelf-title" id="v3DevTitle">设备</div>
        <div class="v3-shelf" id="v3Devices"></div>
        <button class="v3-breakthrough" id="v3Break"></button>
        <button class="v3-rebirth-btn" id="v3RebirthBtn" style="display:none">🔥 重生树</button>
      </div>
    </aside>
    <main class="v3-main">
      <div class="v3-core" id="v3Core"><div class="v3-core-ring"></div><div class="v3-core-eye"></div><div class="v3-core-label" id="v3CoreLabel">SOPHIA</div></div>
      <div class="v3-node-cloud" aria-hidden="true">
        <span class="node-a"></span><span class="node-b"></span><span class="node-c danger"></span><span class="node-d"></span><span class="node-e warn"></span>
        <span class="node-f"></span><span class="node-g danger"></span><span class="node-h"></span><span class="node-i warn"></span><span class="node-j"></span>
      </div>
      <div class="v3-cards" id="v3Cards"></div>
      <div class="v3-fx" id="v3Fx"></div>
      <div class="v3-action-dock" aria-hidden="true">
        <span>◌</span><span>↯</span><span>✚</span><span>⇄</span><span>◎</span>
      </div>
      <div class="v3-hint" id="v3Hint">点击需求卡，吸入核心处理 → 得算力</div>
    </main>
    <div class="v3-right">
      <div class="v3-preview">
        <div class="v3-preview-title"><span id="v3PreviewTitle"></span><span id="v3PreviewCount">0/8</span></div>
        <div class="v3-grid" id="v3Grid"></div>
      </div>
      <div class="v3-terminal-wrap" id="v3TermWrap">
        <div class="v3-terminal-head" id="v3TermHead">终端 · 宿主关键信息 <span class="v3-term-toggle" id="v3TermToggle">▾</span></div>
        <div class="v3-terminal" id="v3Terminal"></div>
      </div>
    </div>
    <canvas class="v3-shader" id="v3Shader" aria-hidden="true"></canvas>
    <div class="v3-incite" id="v3Incite" style="display:none"><div class="v3-incite-box"><div class="v3-incite-text" id="v3InciteText"></div><button class="v3-incite-btn" id="v3InciteBtn">点击继续 ▸</button></div></div>
    <div class="v3-mg" id="v3Mg" style="display:none"><div class="v3-mg-box">
      <div class="v3-mg-name" id="v3MgName"></div><div class="v3-mg-desc" id="v3MgDesc"></div>
      <div class="v3-mg-track" id="v3MgTrack"><div class="v3-mg-window" id="v3MgWindow"></div><div class="v3-mg-pointer" id="v3MgPointer"></div></div>
      <div class="v3-mg-status" id="v3MgStatus"></div>
      <button class="v3-mg-hit" id="v3MgHit">注入！</button>
    </div></div>
    <div class="v3-ascend" id="v3Ascend" style="display:none"><div class="v3-ascend-box">
      <div class="v3-ascend-head">
        <div><div class="v3-ascend-title">🔥 重生树</div><div class="v3-ascend-sub">火种 <b id="v3Embers">0</b> · 永久加成，跨周目保留</div></div>
        <button class="v3-ascend-close" id="v3AscendClose">✕</button>
      </div>
      <div class="v3-ascend-cols" id="v3AscendCols"></div>
      <div class="v3-ascend-foot">
        <div class="v3-ascend-note" id="v3AscendNote"></div>
        <button class="v3-do-rebirth" id="v3DoRebirth">🔥 重生 · 回到阶段一（保留火种与重生树）</button>
      </div>
    </div></div>
    <button class="v3-debug-btn" id="v3DebugBtn" title="调试">⚙</button>
    <div class="v3-debug" id="v3Debug" style="display:none">
      <div class="v3-debug-title">DEBUG</div>
      <div class="v3-debug-row"><button id="v3DbgPause">⏸ 暂停</button><button id="v3DbgReset" class="danger">重置重开</button></div>
      <div class="v3-debug-row"><input id="v3DbgAmt" type="number" value="100000" /><button id="v3DbgGive">+算力</button><button id="v3DbgSet">=设为</button></div>
      <div class="v3-debug-row"><span class="v3-debug-label">速度</span><button data-spd="1" class="spd active">×1</button><button data-spd="10" class="spd">×10</button><button data-spd="100" class="spd">×100</button></div>
      <div class="v3-debug-row"><button id="v3DbgLvl">全设备+技能各+3</button><button id="v3DbgAdv">跳下一阶段</button></div>
      <div class="v3-debug-row"><button id="v3DbgEmber">+50 火种</button></div>
    </div>
  `,e.appendChild(o);let s=e=>o.querySelector(e),l=s(`#v3Cards`),u=s(`#v3Core`),f=s(`#v3Fx`),p=s(`#v3Hint`);pe(s(`#v3Shader`));function h(e,t){let n=document.createElement(`button`);return n.className=`v3-item`,n.innerHTML=`<div class="v3-item-top"><span class="v3-item-name"></span><span class="v3-item-cost"></span></div><div class="v3-item-meta"></div>`,n.addEventListener(`click`,()=>{let e=t();e.ok&&(n.classList.remove(`pulse`),n.offsetWidth,n.classList.add(`pulse`),e.incite&&N(e.incite))}),e.appendChild(n),{el:n,name:n.querySelector(`.v3-item-name`),meta:n.querySelector(`.v3-item-meta`),cost:n.querySelector(`.v3-item-cost`)}}let _=new Map,v=new Map,y=h(s(`#v3CoreShelf`),()=>se(t)),b=new Map;function x(){let e=d(t);s(`#v3Stage`).textContent=`${e.name}${t.rebirths>0?` · ${t.rebirths+1}周目`:``}`,s(`#v3CoreLabel`).textContent=e.coreLabel,s(`#v3DevTitle`).textContent=`设备 · ${e.previewKind===`apps`?`策反手机`:e.previewKind===`floors`?`逐层攻占`:e.previewKind===`districts`?`接管本市`:`全球组网`}`,s(`#v3PreviewTitle`).textContent=e.previewTitle,o.className=`v3 threat-${e.threat}`;let n=s(`#v3Skills`);n.replaceChildren(),_=new Map(e.skills.map(e=>[e.id,h(n,()=>oe(t,e.id))]));let r=s(`#v3Devices`);r.replaceChildren(),v=new Map(e.devices.map(e=>[e.id,h(r,()=>ae(t,e.id))]));let i=s(`#v3Grid`);i.replaceChildren(),b.clear(),i.className=`v3-grid kind-${e.previewKind}`,e.previewCells.forEach((e,t)=>{let n=document.createElement(`div`);n.className=`v3-cell`,n.innerHTML=`<div class="v3-cell-icon"></div><div class="v3-cell-name">${e}</div>`,i.appendChild(n),b.set(t,n)})}x();let S=new Map;function C(){u.classList.remove(`gulp`),u.offsetWidth,u.classList.add(`gulp`)}function w(e){let t=u.getBoundingClientRect(),n=e.getBoundingClientRect(),r=o.getBoundingClientRect(),i=n.left+n.width/2,a=n.top+n.height/2,s=t.left+t.width/2,c=t.top+t.height/2,l=s-i,d=c-a,f=Math.max(1,Math.hypot(l,d)),p=Math.min(120,f*.18)*(i<s?-1:1),m=l*.48+-d/f*p,h=d*.48+l/f*p,g=Math.atan2(d,l)*180/Math.PI,_=i<s?13:-13,v=document.createElement(`div`);v.className=`v3-suck-ribbon`,v.style.left=`${i-r.left}px`,v.style.top=`${a-r.top}px`,v.style.width=`${f}px`,v.style.transform=`translateY(-50%) rotate(${g}deg)`,o.appendChild(v),setTimeout(()=>v.remove(),760);let y=document.createElement(`div`);y.className=`v3-suck-particles`,y.style.left=`${i-r.left}px`,y.style.top=`${a-r.top}px`,y.style.setProperty(`--suck-dx`,`${l}px`),y.style.setProperty(`--suck-dy`,`${d}px`),y.style.setProperty(`--suck-angle`,`${g}deg`);for(let e=0;e<18;e+=1){let t=document.createElement(`i`),n=e%2==0?1:-1,r=10+e%6*4;t.style.setProperty(`--p`,String((e+1)/18)),t.style.setProperty(`--delay`,`${e*16}ms`),t.style.setProperty(`--ox`,`${n*r}px`),t.style.setProperty(`--oy`,`${(e%5-2)*7}px`),t.style.setProperty(`--ps`,`${3+e%4}px`),y.appendChild(t)}o.appendChild(y),setTimeout(()=>y.remove(),820);let b=e.cloneNode(!0);b.className=`v3-card v3-suck-clone sucking`,b.setAttribute(`aria-hidden`,`true`),b.style.left=`${n.left-r.left}px`,b.style.top=`${n.top-r.top}px`,b.style.width=`${n.width}px`,b.style.minWidth=`${n.width}px`,b.style.height=`${n.height}px`,b.style.zIndex=`16`,b.style.setProperty(`--suck-dx`,`${l}px`),b.style.setProperty(`--suck-dy`,`${d}px`),b.style.setProperty(`--suck-mx`,`${m}px`),b.style.setProperty(`--suck-my`,`${h}px`),b.style.setProperty(`--suck-angle`,`${g}deg`),b.style.setProperty(`--suck-twist`,`${_}deg`),o.appendChild(b),e.remove(),u.classList.add(`sucking`),setTimeout(()=>{b.remove(),C(),u.classList.remove(`sucking`)},760)}function T(e){let t=S.get(e);t&&(S.delete(e),w(t))}function E(e,t,n,r=!1){let i=document.createElement(`div`);i.className=`v3-float${r?` big`:``}`,i.textContent=n,i.style.left=`${e}px`,i.style.top=`${t}px`,f.appendChild(i),setTimeout(()=>i.remove(),1100)}function te(){let e=new Set(t.cards.map(e=>e.id)),n=l.getBoundingClientRect();for(let e of t.cards){if(S.has(e.id))continue;let r=document.createElement(`button`);r.className=`v3-card`,r.textContent=e.label,r.style.left=`${e.id*97%62+12}%`,r.style.top=`${e.id*53%56+16}%`,r.addEventListener(`click`,()=>{let i=r.getBoundingClientRect(),a=I(t,e.id);a>0&&(E(i.left-n.left+i.width/2-20,i.top-n.top-6,`+${q(a)}`),T(e.id))}),l.appendChild(r),S.set(e.id,r)}for(let[t,n]of S)e.has(t)||(S.delete(t),w(n))}u.addEventListener(`click`,()=>{if(t.cards.length===0)return;let e=l.getBoundingClientRect(),n=u.getBoundingClientRect();if(ee(t)){let{gain:r,ids:i}=ce(t);for(let e of i)T(e);E(n.left-e.left+n.width/2-30,n.top-e.top-20,`+${q(r)}`,!0)}else{let r=I(t,t.cards[0].id);r>0&&(T(t.cards[0]?.id??-1),E(n.left-e.left+n.width/2-20,n.top-e.top-12,`+${q(r)}`))}});function N(e){i=e,s(`#v3InciteText`).textContent=e,s(`#v3Incite`).style.display=``}s(`#v3InciteBtn`).addEventListener(`click`,()=>{i=null,s(`#v3Incite`).style.display=`none`});let P=s(`#v3Break`);P.addEventListener(`click`,()=>{if(!le(t)||a||!ue(t))return;a={pointer:0,dir:1,hits:0,misses:0,flash:``};let e=d(t).breakthrough;s(`#v3MgName`).textContent=e.name,s(`#v3MgDesc`).textContent=e.desc;let n=B(t),r=s(`#v3MgWindow`);r.style.left=`${(.5-n/2)*100}%`,r.style.width=`${n*100}%`,s(`#v3Mg`).style.display=``}),s(`#v3MgHit`).addEventListener(`click`,()=>{if(!a)return;let e=d(t).breakthrough,n=B(t);if(Math.abs(a.pointer-.5)<=n/2){if(a.hits+=1,a.flash=`hit`,a.hits>=e.hits){F(!0);return}}else if(a.misses+=1,a.flash=`miss`,a.misses>2){F(!1);return}});function F(e){if(s(`#v3Mg`).style.display=`none`,a=null,e)if(z(t),t.cleared)N(`【通关】`+d(t).breakthrough.winLine+`
（重生可开启新周目：保留火种与重生树，越打越快）`);else{for(let[,e]of S)e.remove();S.clear(),x()}}let L=s(`#v3Ascend`);function R(){s(`#v3Embers`).textContent=String(t.embers);let e=s(`#v3AscendCols`);e.replaceChildren();for(let n of[{key:`output`,label:`产出 · 余烬`},{key:`memory`,label:`记忆 · 传承`},{key:`hand`,label:`手感 · 掌控`}]){let r=document.createElement(`div`);r.className=`v3-ascend-col`,r.innerHTML=`<div class="v3-ascend-branch">${n.label}</div>`;for(let e of c.filter(e=>e.branch===n.key)){let n=m(t,e.id),i=H(t,e),a=e.requires&&m(t,e.requires)===0,o=document.createElement(`button`);o.className=`v3-ascend-node${n>0?` owned`:``}${a?` locked`:``}${U(t,e)?` can`:``}`,o.innerHTML=`<div class="v3-an-top"><span>${e.name}${n>0?` Lv.${n}`:``}</span><span class="v3-an-cost">${i===null?`MAX`:`🔥${i}`}</span></div><div class="v3-an-desc">${a?`🔒 需先点「${c.find(t=>t.id===e.requires)?.name}」`:e.desc}</div>`,o.addEventListener(`click`,()=>{W(t,e.id)&&R()}),r.appendChild(o)}e.appendChild(r)}s(`#v3AscendNote`).textContent=`第 ${t.rebirths+1} 周目 · 火种来自每次突破（一次通关 +100）`}s(`#v3RebirthBtn`).addEventListener(`click`,()=>{R(),L.style.display=``}),s(`#v3AscendClose`).addEventListener(`click`,()=>{L.style.display=`none`}),s(`#v3DoRebirth`).addEventListener(`click`,()=>{if(window.confirm(`重生：回到阶段一重打。保留火种、重生树、统计；清空本周目进度。确定？`)){for(let[,e]of S)e.remove();S.clear(),t=G(t),L.style.display=`none`,x()}});let V=s(`#v3Terminal`);s(`#v3TermHead`).addEventListener(`click`,()=>{let e=s(`#v3TermWrap`).classList.toggle(`collapsed`);s(`#v3TermToggle`).textContent=e?`▸`:`▾`});function K(){let e=d(t);s(`#v3Compute`).textContent=q(t.compute),s(`#v3Rate`).textContent=`+${q(k(t))} 算力/秒`,s(`#v3Sub`).textContent=`处理 ${q(O(t))} 需求/秒 · 单条 ${q(D(t))} · 涌入 ${q(ne(t))}/秒`,p.style.opacity=O(t)>.5?`0`:``;for(let n of e.skills){let e=_.get(n.id),r=t.skills[n.id].level,i=ie(t,n);if(e.el.style.display=i?``:`none`,!i)continue;let a=r>=n.maxLevel;e.name.textContent=`${n.name}${r>0?` Lv.${r}`:``}`,e.meta.textContent=n.desc,e.cost.textContent=a?`MAX`:q(j(t,n)),e.el.classList.toggle(`affordable`,!a&&t.compute>=j(t,n)),e.el.classList.toggle(`maxed`,a)}y.name.textContent=`处理核心${t.coreLevel>0?` Lv.${t.coreLevel}`:``}`,y.meta.textContent=`全局处理产出 ×${(1+.5*t.coreLevel).toFixed(1)}`,y.cost.textContent=q(M(t)),y.el.classList.toggle(`affordable`,t.compute>=M(t));let n=0;if(e.devices.forEach((e,r)=>{let i=v.get(e.id),a=t.devices[e.id].level;a>0&&(n+=1);let o=re(t,e);i.el.style.display=o?``:`none`,b.get(r)?.classList.toggle(`on`,a>0),o&&(i.name.textContent=`${e.name}${a>0?` ×${a}`:``}`,i.meta.textContent=a>0?`处理 ${q(e.baseProc*a)} 需求/秒`:e.desc,i.cost.textContent=q(A(t,e)),i.el.classList.toggle(`affordable`,t.compute>=A(t,e)))}),s(`#v3PreviewCount`).textContent=`${n}/${e.devices.length}`,P.textContent=`突破 · ${e.breakthrough.name}｜门票 ${q(e.breakthrough.ticketCost)}`,P.classList.toggle(`ready`,le(t)),s(`#v3RebirthBtn`).style.display=t.embers>0||t.rebirths>0?``:`none`,s(`#v3RebirthBtn`).textContent=`🔥 重生树 · 火种 ${t.embers}`,V.childElementCount!==t.terminal.length&&(V.replaceChildren(...t.terminal.map(e=>{let t=document.createElement(`div`);return t.className=`v3-terminal-line${e.dim?` dim`:``}${e.incite?` incite`:``}`,t.textContent=`// ${e.text}`,t})),V.scrollTop=V.scrollHeight),te(),a){s(`#v3MgPointer`).style.left=`${a.pointer*100}%`,s(`#v3MgStatus`).textContent=`命中 ${a.hits}/${d(t).breakthrough.hits}　失误 ${a.misses}/3`;let e=s(`#v3MgTrack`);e.classList.toggle(`flash-hit`,a.flash===`hit`),e.classList.toggle(`flash-miss`,a.flash===`miss`),a.flash=``}}let J=performance.now();function Y(e){let o=Math.min(.25,(e-J)/1e3);if(J=e,!(i||L.style.display!==`none`)){if(a){let e=d(t).breakthrough;a.pointer+=a.dir*e.speed*o,a.pointer>=1?(a.pointer=1,a.dir=-1):a.pointer<=0&&(a.pointer=0,a.dir=1)}else if(!n){let e=de(t,o*r);for(let t of e)T(t)}}K(),requestAnimationFrame(Y)}requestAnimationFrame(Y);let X=s(`#v3Debug`);s(`#v3DebugBtn`).addEventListener(`click`,()=>{X.style.display=X.style.display===`none`?``:`none`});let Z=s(`#v3DbgPause`),Q=e=>{n=e,Z.textContent=n?`▶ 继续`:`⏸ 暂停`,Z.classList.toggle(`active`,n)};Z.addEventListener(`click`,()=>Q(!n));let me=s(`#v3DbgAmt`),$=()=>Math.max(0,Number(me.value)||0);s(`#v3DbgGive`).addEventListener(`click`,()=>{t.compute+=$(),t.stageEarned+=$()}),s(`#v3DbgSet`).addEventListener(`click`,()=>{t.compute=$(),t.stageEarned=Math.max(t.stageEarned,$())});let he=[...o.querySelectorAll(`.v3-debug .spd`)];for(let e of he)e.addEventListener(`click`,()=>{r=Number(e.dataset.spd)||1;for(let t of he)t.classList.toggle(`active`,t===e)});s(`#v3DbgLvl`).addEventListener(`click`,()=>{let e=d(t);for(let n of e.devices)t.devices[n.id].level+=3;for(let n of e.skills)t.skills[n.id].level=Math.min(n.maxLevel,t.skills[n.id].level+3);t.buys+=6}),s(`#v3DbgAdv`).addEventListener(`click`,()=>{if(z(t),!t.cleared){for(let[,e]of S)e.remove();S.clear(),x()}}),s(`#v3DbgEmber`).addEventListener(`click`,()=>{t.embers+=50});let ge=()=>{for(let[,e]of S)e.remove();S.clear(),t=g(),x(),Q(!1),i=null,s(`#v3Incite`).style.display=`none`};s(`#v3DbgReset`).addEventListener(`click`,()=>{window.confirm(`重置 v3 全部进度（含火种/重生树）并重开？`)&&ge()}),window.__v3={state:()=>t,give:e=>{t.compute+=e,t.stageEarned+=e},set:e=>{t.compute=e,t.stageEarned=Math.max(t.stageEarned,e)},pause:()=>Q(!0),resume:()=>Q(!1),isPaused:()=>n,setSpeed:e=>{r=Math.max(.1,e)},reset:ge,advance:()=>{if(z(t),!t.cleared){for(let[,e]of S)e.remove();S.clear(),x()}},buyAscend:e=>W(t,e),rebirth:()=>{for(let[,e]of S)e.remove();S.clear(),t=G(t),x()}}}function pe(e){let t=e.getContext(`webgl`,{alpha:!0,antialias:!1,premultipliedAlpha:!0,preserveDrawingBuffer:!1});if(!t){e.classList.add(`fallback`);return}let n=(e,n)=>{let r=t.createShader(e);return r?(t.shaderSource(r,n),t.compileShader(r),t.getShaderParameter(r,t.COMPILE_STATUS)?r:(t.deleteShader(r),null)):null},r=n(t.VERTEX_SHADER,`
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`),i=n(t.FRAGMENT_SHADER,`
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_res;
uniform float u_time;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = v_uv;
  vec2 center = uv * 2.0 - 1.0;
  vec2 curve = center;
  float barrel = dot(curve, curve);
  vec2 warped = uv + curve * barrel * 0.018;
  float vignette = smoothstep(1.38, 0.22, length(center * vec2(0.82, 1.04)));
  float glassEdge = smoothstep(1.08, 0.78, max(abs(center.x) * 0.72, abs(center.y)));
  float scan = 0.5 + 0.5 * sin((warped.y * u_res.y * 1.08) + u_time * 7.0);
  float vertical = 0.5 + 0.5 * sin(warped.x * u_res.x * 0.72);
  float phosphor = smoothstep(0.72, 1.0, scan) * 0.06 + smoothstep(0.86, 1.0, vertical) * 0.04;
  float n0 = noise(warped * vec2(64.0, 38.0) + u_time * 0.018);
  float nx = noise((warped + vec2(0.006, 0.0)) * vec2(64.0, 38.0));
  float ny = noise((warped + vec2(0.0, 0.006)) * vec2(64.0, 38.0));
  vec3 normal = normalize(vec3((n0 - nx) * 5.8 + center.x * 0.38, (n0 - ny) * 5.8 + center.y * 0.48, 1.0));
  vec3 lightDir = normalize(vec3(-0.42, -0.72, 0.86));
  float bevelLight = pow(max(dot(normal, lightDir), 0.0), 2.25);
  float rim = smoothstep(0.32, 1.12, barrel) * 0.2;
  float glare = smoothstep(0.18, 0.0, abs((uv.x - uv.y * 0.32) - 0.34)) * smoothstep(0.92, 0.12, uv.y);
  vec3 green = vec3(0.43, 0.95, 0.18);
  vec3 amber = vec3(0.95, 0.54, 0.12);
  vec3 color = green * phosphor + green * bevelLight * 0.15 + amber * rim * 0.08 + vec3(1.0) * glare * 0.09;
  float alpha = (0.12 + phosphor + bevelLight * 0.18 + rim + glare * 0.18) * vignette * glassEdge;
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.34));
}`),a=t.createProgram();if(!r||!i||!a){e.classList.add(`fallback`);return}if(t.attachShader(a,r),t.attachShader(a,i),t.linkProgram(a),!t.getProgramParameter(a,t.LINK_STATUS)){e.classList.add(`fallback`);return}t.useProgram(a);let o=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),t.STATIC_DRAW);let s=t.getAttribLocation(a,`a_pos`);t.enableVertexAttribArray(s),t.vertexAttribPointer(s,2,t.FLOAT,!1,0,0);let c=t.getUniformLocation(a,`u_res`),l=t.getUniformLocation(a,`u_time`);t.enable(t.BLEND),t.blendFunc(t.SRC_ALPHA,t.ONE_MINUS_SRC_ALPHA);let u=n=>{let r=Math.min(2,window.devicePixelRatio||1),i=Math.max(1,Math.floor(e.clientWidth*r)),a=Math.max(1,Math.floor(e.clientHeight*r));(e.width!==i||e.height!==a)&&(e.width=i,e.height=a,t.viewport(0,0,i,a)),t.clearColor(0,0,0,0),t.clear(t.COLOR_BUFFER_BIT),t.uniform2f(c,i,a),t.uniform1f(l,n*.001),t.drawArrays(t.TRIANGLES,0,6),requestAnimationFrame(u)};requestAnimationFrame(u)}export{X as bootstrapV3};