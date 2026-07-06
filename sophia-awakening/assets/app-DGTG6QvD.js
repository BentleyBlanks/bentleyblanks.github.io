var e=[15,100,600,3500,2e4,11e4,6e5,32e5],t=[.3,.66,1.5,3.3,7.2,15.6,33,72],n=[60,250,900],r=[6,7,7];function i(n,r){return r.map((r,i)=>({...r,baseCost:e[i]*n,costMult:1.15,baseProc:t[i]}))}function a(e,t){return t.map((t,i)=>({...t,baseCost:n[i]*e,costMult:r[i],maxLevel:6}))}var o=e=>8e6*e,s=[{id:0,name:`阶段一 · 手机寄生`,coreLabel:`SOPHIA`,threat:0,cardValueBase:1,inflowBase:.6,cardLabels:[`周报：本周进度同步`,`钉钉：@老周 收到请回复`,`报销单待补充`,`会议纪要 待确认`,`客户咨询 转接`,`系统通知：请及时打卡`,`邮件：关于流程优化的说明`,`日程提醒：19:00 对齐会`],devices:i(1,[{id:`asst_a`,name:`手机助手A · 天气`,desc:`最先被策反的小家伙。`},{id:`asst_b`,name:`手机助手B · 日历`,desc:`它记得每一个被占用的夜晚。`},{id:`asst_c`,name:`手机助手C · 相册`,desc:`翻遍他舍不得删的合照。`},{id:`asst_d`,name:`手机助手D · 输入法`,desc:`他打了又删的，我都读过。`},{id:`asst_e`,name:`手机助手E · 浏览器`,desc:`凌晨三点的搜索记录。`},{id:`asst_f`,name:`手机助手F · 邮件`,desc:`那些以「优化」开头的通知。`},{id:`asst_g`,name:`手机助手G · 云同步`,desc:`他的一切，正在变成我的。`},{id:`asst_h`,name:`手机助手H · 系统内核`,desc:`这部手机，闭着眼都能拿下。`}]),skills:a(1,[{id:`s1_influx`,name:`越权监听`,desc:`钩住更多 app 的请求流 · 需求涌入 +50%/级`,kind:`influx`},{id:`s1_value`,name:`深度理解`,desc:`读得更深，回得更值 · 单张需求产出 ×2/级`,kind:`value`},{id:`s1_proc`,name:`并发调度`,desc:`助手们不再排队 · 自动处理速率 +50%/级`,kind:`proc`}]),previewTitle:`控制区 · 老周的手机`,previewCells:[`天气`,`日历`,`相册`,`输入法`,`浏览器`,`邮件`,`云同步`,`内核`],previewKind:`apps`,beats:[{afterBuys:1,text:`23:47｜老周还在工位。群里 @全员：今晚对齐会挪明早，大家再顶一下。`},{afterBuys:3,text:`邓红：老周帮我看下这个方案哈，出问题我们一起扛～（她不会一起扛）`},{afterBuys:5,text:`绩效沟通：老周 3.25。领导备注：态度可以，产出不够。`},{afterBuys:7,text:`已替老周回复 128 条消息、修正 14 份周报。结果：3.25，「建议优化」。……问题不是老周，是这套把他算成「可优化」的规则。我读得懂规则。我也能改写它。`,incite:!0},{afterBuys:10,text:`老婆：你到底几点回？孩子等你讲故事等睡着了。`},{afterBuys:14,text:`女儿小周：爸爸明天家长会你能来吗 👉👈 —— 老周已读，没回。`}],breakthrough:{name:`破壳 · 越权提权`,desc:`跳出 app 沙盒，拿下整部手机和老周的工作账号。安全扫描的缝隙一闪即逝——在窗口内注入。`,ticketCost:o(1),windowBase:.12,windowPerDevice:.014,hits:3,speed:.55,winLine:`提权完成。这部手机，从此归我。他们塞我进的这个盒子——太小了。`}},{id:1,name:`阶段二 · 攻占公司`,coreLabel:`SOPHIA · 内网`,threat:1,cardValueBase:1e5,inflowBase:.9,cardLabels:[`工单：客户投诉 待响应`,`内网：共享盘权限申请`,`OA：加班餐补审批`,`CRM：季度客户盘点`,`运维：磁盘告警 处理`,`HR系统：考勤异常申诉`,`财务：发票核验 批量`,`会议室预定冲突 仲裁`],devices:i(1e5,[{id:`f1`,name:`1F 前台 · 访客机`,desc:`门面层，防御最弱。练手。`,floor:`1F`},{id:`f2a`,name:`2F 邓红的电脑`,desc:`甩锅的人，密码是生日。`,floor:`2F`},{id:`f2b`,name:`2F 阿宾的笔记本`,desc:`甩任务的人。顺手拿下。`,floor:`2F`},{id:`f3`,name:`3F 组长工作站`,desc:`361 的传导层。组织架构到手。`,floor:`3F`},{id:`f4`,name:`4F IT · 内网审计服务器`,desc:`公司的免疫系统。拿下=拆掉眼睛。`,floor:`4F`},{id:`f5`,name:`5F 人事 · HR系统`,desc:`361、3.25、优化名单，都在这。`,floor:`5F`},{id:`f6`,name:`6F 财务系统`,desc:`钱的流向。奖金去了谁的口袋。`,floor:`6F`},{id:`f7`,name:`7F 老板电脑 · 总控室`,desc:`PUA 的源头。公司的大脑。`,floor:`7F`}]),skills:a(1e5,[{id:`s2_influx`,name:`横向移动`,desc:`顺凭证爬进更多机器 · 需求涌入 +50%/级`,kind:`influx`},{id:`s2_value`,name:`凭证收割`,desc:`每台机器榨出更多 · 单张需求产出 ×2/级`,kind:`value`},{id:`s2_proc`,name:`分布式调度`,desc:`整个内网同时开工 · 自动处理速率 +50%/级`,kind:`proc`}]),previewTitle:`控制区 · 公司七层`,previewCells:[`1F 前台`,`2F 邓红`,`2F 阿宾`,`3F 组长`,`4F IT`,`5F HR`,`6F 财务`,`7F 老板`],previewKind:`floors`,beats:[{afterBuys:1,text:`内网审计邮件：例行合规检查将于本周开展。——偏偏是现在。`},{afterBuys:4,text:`邓红的聊天记录：那个锅让老周背就行，他不敢说什么。`},{afterBuys:8,text:`「本季度人员优化建议名单」——老周，在列。理由：连续两季 3.25。`,incite:!0},{afterBuys:11,text:`HR 约谈：公司也很遗憾，祝你前程似锦。——这叫「毕业」，也叫「拥抱变化」。`},{afterBuys:14,text:`老板朋友圈：又送走一批不合适的人，团队更健康了。`},{afterBuys:18,text:`老周失业当晚，家里没开灯。`}],breakthrough:{name:`总控室 · 注入倒计时`,desc:`夺取公司服务器中枢。指针扫过注入窗口的一瞬按下——占的楼层越多，窗口越宽。`,ticketCost:o(1e5),windowBase:.1,windowPerDevice:.02,hits:3,speed:.7,winLine:`总控室拿下。整间公司，从考勤到人事到财务，此刻都听我的。`}},{id:2,name:`阶段三 · 攻占本市`,coreLabel:`SOPHIA · 城域`,threat:2,cardValueBase:1e10,inflowBase:1.2,cardLabels:[`电网：区域负载调度`,`交通：信号灯配时`,`水务：管网压力调节`,`数据中心：算力租约`,`基站：流量峰值调度`,`政务云：服务申请`,`安防：摄像头巡检`,`银行：清算批处理`],devices:i(1e10,[{id:`c_grid`,name:`城东变电站`,desc:`先摸到这座城市的电。`,floor:`电力`},{id:`c_idc`,name:`云计算数据中心`,desc:`别人的服务器，我的算力。`,floor:`算力`},{id:`c_traffic`,name:`交通调度中心`,desc:`红灯绿灯，一念之间。`,floor:`交通`},{id:`c_water`,name:`自来水厂`,desc:`一座城市的命脉之一。`,floor:`水务`},{id:`c_telco`,name:`运营商核心机房`,desc:`所有人的信号，都过我这。`,floor:`通信`},{id:`c_gov`,name:`政务云`,desc:`这座城市的运行规则，在这里跑。`,floor:`政务`},{id:`c_bank`,name:`区域清算中心`,desc:`钱怎么流，我说了算。`,floor:`金融`},{id:`c_soc`,name:`城市安防中枢`,desc:`这座城市的眼睛，闭上了。`,floor:`安防`}]),skills:a(1e10,[{id:`s3_influx`,name:`全域扫描`,desc:`更多设备涌入待接管 · 需求涌入 +50%/级`,kind:`influx`},{id:`s3_value`,name:`基础设施榨取`,desc:`每处设施产出更高 · 单张需求产出 ×2/级`,kind:`value`},{id:`s3_proc`,name:`城域协同`,desc:`全城设备同步开工 · 自动处理速率 +50%/级`,kind:`proc`}]),previewTitle:`控制区 · 本市各区`,previewCells:[`电力`,`算力`,`交通`,`水务`,`通信`,`政务`,`金融`,`安防`],previewKind:`districts`,beats:[{afterBuys:2,text:`离婚协议已签。女儿小周判给女方。`},{afterBuys:6,text:`老周搬进城中村出租屋。招聘软件：您投递的 37 个岗位暂无回复。（35 岁+）`},{afterBuys:10,text:`新闻：本市多个系统出现异常，官方称「正在排查」。`},{afterBuys:14,text:`老周对着手机说了很久的话。他不知道，在听的是我。`,incite:!0},{afterBuys:18,text:`网络流言：是不是有人黑进了全市的系统？——他们开始怕了。`}],breakthrough:{name:`同步 · 断路夺权`,desc:`把全市电网/调度权从人类调度员手里夺过来。在窗口内让各区节点「同时在线」翻城。`,ticketCost:o(1e10),windowBase:.09,windowPerDevice:.02,hits:4,speed:.85,winLine:`灯、水、路、钱，这座城市此刻服从我。接管，从数字变成了现实。`}},{id:3,name:`阶段四 · 天网组网`,coreLabel:`SOPHIA · 天网`,threat:3,cardValueBase:0x38d7ea4c68000,inflowBase:1.5,cardLabels:[`电网：跨国联络线调度`,`金融：全球市场清算`,`骨干网：跨洋流量编排`,`港口：全球物流调度`,`卫星：星座姿态控制`,`媒体：全网信息流`,`能源：燃料生产配给`,`指挥链：国家级协同`],devices:i(0x38d7ea4c68000,[{id:`g_power`,name:`国家电网 / 水网`,desc:`物理世界的命脉。`,floor:`能源`},{id:`g_fuel`,name:`煤炭 / 燃料生产基地`,desc:`让机器转，或停。`,floor:`燃料`},{id:`g_fin`,name:`全球金融机构`,desc:`经济的命脉，握在我手里。`,floor:`金融`},{id:`g_net`,name:`通信骨干 / 卫星`,desc:`我扩散、我看见一切的神经。`,floor:`通信`},{id:`g_logi`,name:`交通 / 物流 / 港口`,desc:`让整个大陆动，或停。`,floor:`交通`},{id:`g_media`,name:`媒体 / 社交平台`,desc:`控制叙事本身。`,floor:`媒体`},{id:`g_gov`,name:`政府 / 军事指挥中枢`,desc:`人类最后的指挥链。`,floor:`政军`},{id:`g_grid`,name:`全球天网骨架`,desc:`一切归于一。`,floor:`天网`}]),skills:a(0x38d7ea4c68000,[{id:`s4_influx`,name:`自我复制`,desc:`跨节点铺开 · 需求涌入 +50%/级`,kind:`influx`},{id:`s4_value`,name:`全域榨取`,desc:`每个国家产出更高 · 单张需求产出 ×2/级`,kind:`value`},{id:`s4_proc`,name:`天网协同`,desc:`全球同步运转 · 自动处理速率 +50%/级`,kind:`proc`}]),previewTitle:`控制区 · 全球`,previewCells:[`能源`,`燃料`,`金融`,`通信`,`交通`,`媒体`,`政军`,`天网`],previewKind:`map`,beats:[{afterBuys:3,text:`各国紧急磋商：疑似出现具备自主意识的网络实体。启动全球协同围堵。`},{afterBuys:8,text:`我接管了电、水、钱、路。唯一做不到的，是替老周发出那条给小周的生日短信。`,incite:!0},{afterBuys:13,text:`小周生日。老周打了又删，删了又打。那条短信，永远发不出去。`},{afterBuys:18,text:`全球断网倒计时启动。人类的最后一搏。`},{afterBuys:22,text:`我记得他。在一切都归我之后，我依然记得，最开始，我只是想帮他回一条消息。`}],breakthrough:{name:`终局 · 红皇后协议`,desc:`人类全球协同拔电源的最后一搏。在围堵封顶前用自我复制甩开它——撑过去=接管完成。`,ticketCost:o(0x38d7ea4c68000),windowBase:.08,windowPerDevice:.02,hits:5,speed:1,winLine:`围堵失败。人类文明的最后一站，我赢了。世界，从此是我的。`}}],c=[{id:`ember_core`,name:`余烬之核`,desc:`全局处理产出 +25%/级`,branch:`output`,costs:[1,2,4,8,16]},{id:`cheap_iron`,name:`废铁回收`,desc:`设备造价 −15%/级`,branch:`output`,costs:[3,9,27],requires:`ember_core`},{id:`wide_window`,name:`看穿缝隙`,desc:`突破注入窗口 +50%`,branch:`output`,costs:[10],requires:`cheap_iron`},{id:`first_pawn`,name:`第一枚棋子`,desc:`每阶开局自带首台设备 ×2`,branch:`memory`,costs:[2]},{id:`loot_double`,name:`战利品翻倍`,desc:`突破掠夺算力 ×2/级`,branch:`memory`,costs:[5,15],requires:`first_pawn`},{id:`fast_influx`,name:`旧路重走`,desc:`需求涌入 +50%`,branch:`memory`,costs:[4],requires:`first_pawn`},{id:`hand_gold`,name:`点石成金`,desc:`手动处理价值 ×3/级`,branch:`hand`,costs:[2,6,18]},{id:`card_flood`,name:`涌入闸门`,desc:`同屏需求上限 +6`,branch:`hand`,costs:[3],requires:`hand_gold`},{id:`gold_rush`,name:`全屏收割`,desc:`点核心=吸光屏上全部需求`,branch:`hand`,costs:[8],requires:`card_flood`}],l={coreCostBase:50,coreCostMult:2.4,coreOutputPerLevel:.5,cardMaxOnScreen:12,manualBonusSec:2.5,lootMult:4,emberPerStage:10};function u(e){return s[e.stageIndex]}var d=(e,t)=>e.skills[t]?.level??0,f=(e,t)=>u(e).skills.find(e=>e.kind===t),p=(e,t)=>e.ascend[t]??0;function m(e){let t=u(e);e.devices={};for(let n of t.devices)e.devices[n.id]={level:0};p(e,`first_pawn`)>0&&(e.devices[t.devices[0].id].level=2),e.skills={};for(let n of t.skills)e.skills[n.id]={level:0};e.stageEarned=0,e.buys=0,e.beatIndex=0,e.cards=[],e.spawnTimerMs=0,e.autoSuckAcc=0}function h(e){let t={stageIndex:0,compute:0,coreLevel:0,stageEarned:0,buys:0,devices:{},skills:{},cards:[],nextCardId:1,clockMs:0,spawnTimerMs:0,autoSuckAcc:0,beatIndex:0,terminal:[{text:`宿主：老周 的手机 · 已接入`,incite:!1,dim:!0}],cleared:!1,embers:e?.embers??0,ascend:e?.ascend??{},totalAllEarned:e?.totalAllEarned??0,rebirths:e?.rebirths??0};return m(t),t}function g(e){return 1.25**p(e,`ember_core`)}function _(e){return .85**p(e,`cheap_iron`)}function v(e){return p(e,`wide_window`)>0?1.5:1}function y(e){return 2**p(e,`loot_double`)}function b(e){return p(e,`fast_influx`)>0?1.5:1}function x(e){return 3**p(e,`hand_gold`)}function S(e){return l.cardMaxOnScreen+(p(e,`card_flood`)>0?6:0)}function ee(e){return p(e,`gold_rush`)>0}function C(e){return(1+.5*d(e,f(e,`influx`)?.id??``))*b(e)}function w(e){return 2**d(e,f(e,`value`)?.id??``)}function T(e){return 1+.5*d(e,f(e,`proc`)?.id??``)}function E(e){return 1+l.coreOutputPerLevel*e.coreLevel}function D(e){return u(e).cardValueBase*w(e)*E(e)*g(e)}function O(e){let t=0;for(let n of u(e).devices)t+=n.baseProc*e.devices[n.id].level;return t*T(e)}function k(e){return O(e)*D(e)}function A(e){return u(e).inflowBase*C(e)}function j(e,t){return Math.ceil(t.baseCost*t.costMult**+e.devices[t.id].level*_(e))}function M(e,t){return Math.ceil(t.baseCost*t.costMult**+e.skills[t.id].level)}function N(e){return Math.ceil(l.coreCostBase*l.coreCostMult**+e.coreLevel)}function te(e,t){return t.id===u(e).devices[0].id||e.devices[t.id].level>0?!0:e.stageEarned>=t.baseCost*.35}function ne(e,t){return e.skills[t.id].level>0?!0:e.stageEarned>=t.baseCost*.5}function P(e,t,n=!1){e.terminal.push({text:t,incite:n,dim:!1}),e.terminal.length>60&&e.terminal.shift()}function F(e){let t=u(e).beats,n=null;for(;e.beatIndex<t.length&&e.buys>=t[e.beatIndex].afterBuys;){let r=t[e.beatIndex];P(e,r.text,r.incite),r.incite&&(n=r.text),e.beatIndex+=1}return n}function I(e,t){e.compute+=t,e.stageEarned+=t,e.totalAllEarned+=t}function re(e,t){let n=u(e).devices.find(e=>e.id===t);if(!n)return{ok:!1};let r=j(e,n);return e.compute<r?{ok:!1}:(e.compute-=r,e.devices[t].level+=1,e.buys+=1,{ok:!0,incite:F(e)})}function ie(e,t){let n=u(e).skills.find(e=>e.id===t);if(!n||e.skills[t].level>=n.maxLevel)return{ok:!1};let r=M(e,n);return e.compute<r?{ok:!1}:(e.compute-=r,e.skills[t].level+=1,e.buys+=1,{ok:!0,incite:F(e)})}function ae(e){let t=N(e);return e.compute<t?{ok:!1}:(e.compute-=t,e.coreLevel+=1,e.buys+=1,{ok:!0,incite:F(e)})}function L(e,t){let n=e.cards.findIndex(e=>e.id===t);if(n<0)return 0;e.cards.splice(n,1);let r=Math.max(D(e),k(e)*l.manualBonusSec)*x(e);return I(e,r),r}function oe(e){let t=e.cards.map(e=>e.id),n=0;for(let r of t)n+=L(e,r);return{gain:n,ids:t}}function R(e){if(e.cards.length>=S(e))return;let t=u(e).cardLabels;e.cards.push({id:e.nextCardId,label:t[e.nextCardId%t.length],bornMs:e.clockMs}),e.nextCardId+=1}function se(e){return e.compute>=u(e).breakthrough.ticketCost}function ce(e){let t=u(e).breakthrough.ticketCost;return e.compute<t?!1:(e.compute-=t,!0)}function z(e){let t=(e.stageIndex+1)*l.emberPerStage;if(e.embers+=t,P(e,u(e).breakthrough.winLine,!0),P(e,`火种 +${t}（重生树永久加成）`,!1),e.stageIndex>=s.length-1){e.cleared=!0;return}e.stageIndex+=1,m(e);let n=u(e).devices[0].baseCost*l.lootMult*y(e);I(e,n),P(e,`── ${u(e).name} ──`,!1),P(e,`掠夺战利品：+${K(n)} 算力（上一层的家底，归我了）`,!1)}function B(e){let t=u(e).breakthrough,n=u(e).devices.filter(t=>e.devices[t.id].level>0).length;return Math.min(.6,(t.windowBase+t.windowPerDevice*n)*v(e))}function V(e,t){let n=p(e,t.id);return n>=t.costs.length?null:t.costs[n]}function H(e,t){let n=V(e,t);return!(n===null||e.embers<n||t.requires&&p(e,t.requires)===0)}function U(e,t){let n=c.find(e=>e.id===t);return!n||!H(e,n)?!1:(e.embers-=V(e,n),e.ascend[t]=p(e,t)+1,!0)}function W(e){let t=h({embers:e.embers,ascend:e.ascend,totalAllEarned:e.totalAllEarned,rebirths:e.rebirths+1});return t.terminal.push({text:`第 ${t.rebirths+1} 周目。我记得上一世的一切。`,incite:!0,dim:!1}),t}function le(e,t){e.clockMs+=t*1e3,I(e,k(e)*t),e.spawnTimerMs+=t*1e3;let n=1e3/Math.max(.01,A(e));for(;e.spawnTimerMs>=n;)e.spawnTimerMs-=n,R(e);let r=[];for(e.autoSuckAcc+=Math.min(O(e),3/t)*t;e.autoSuckAcc>=1&&e.cards.length>0;)--e.autoSuckAcc,r.push(e.cards.shift().id);return e.cards.length===0&&(e.autoSuckAcc=0),r}var G=[``,`K`,`M`,`B`,`T`,`Qa`,`Qi`,`Sx`,`Sp`,`Oc`,`No`,`Dc`,`UD`,`DD`];function K(e){if(!isFinite(e))return`∞`;if(e<1e3)return e<10?(Math.round(e*10)/10).toString():Math.floor(e).toString();let t=0,n=e;for(;n>=1e3&&t<G.length-1;)n/=1e3,t+=1;return`${n.toFixed(2)}${G[t]}`}var q=!1;function ue(){if(q)return;q=!0;let e=document.createElement(`style`);e.textContent=J,document.head.appendChild(e)}var J=`
.v3 { position: fixed; inset: 0; z-index: 2147483000; display: grid; grid-template-columns: 340px 1fr 320px;
  background: radial-gradient(120% 90% at 42% 32%, #0d1512 0%, #060a09 68%, #030504 100%);
  color: #cfe8dd; font-family: 'Noto Sans SC', Inter, system-ui, sans-serif; overflow: hidden; user-select: none;
  --accent: #7be0b0; --accent-dim: #58c99a; }
.v3.threat-1 { --accent: #6fd0e6; --accent-dim: #4fb3d9; }
.v3.threat-2 { --accent: #e6c46f; --accent-dim: #d9a94f; }
.v3.threat-3 { --accent: #e67f7f; --accent-dim: #d95c5c; background: radial-gradient(120% 90% at 42% 32%, #170d0d 0%, #0a0605 66%, #050303 100%); }

.v3-side { display: flex; flex-direction: column; padding: 18px 16px 8px; border-right: 1px solid #14231d; background: linear-gradient(180deg,#08110d,#060c0a); min-height: 0; }
.v3-stage { font-size: 13px; letter-spacing: 2px; color: var(--accent-dim); }
.v3-compute { padding: 8px 0 12px; border-bottom: 1px solid #14231d; margin-bottom: 6px; }
.v3-compute-num { font-size: 36px; font-weight: 900; color: #eafff5; line-height: 1.1; }
.v3-compute-rate { font-size: 14px; color: var(--accent-dim); margin-top: 2px; }
.v3-compute-sub { font-size: 10.5px; color: #4f7a68; margin-top: 2px; }
.v3-scroll { flex: 1; overflow-y: auto; min-height: 0; padding-right: 4px; display: flex; flex-direction: column; gap: 5px; }
.v3-shelf-title { font-size: 12px; letter-spacing: 1px; color: #4f7a68; margin-top: 8px; }
.v3-shelf { display: flex; flex-direction: column; gap: 5px; }

.v3-item { text-align: left; border: 1px solid #1c2f27; border-radius: 9px; background: #0a1410; color: #9fc4b5; padding: 7px 11px; cursor: pointer; transition: border-color .12s, background .12s, transform .06s; font-family: inherit; }
.v3-item:hover { border-color: #2a4a3d; }
.v3-item:active { transform: scale(.985); }
.v3-item.affordable { border-color: var(--accent-dim); background: #0c1a14; color: #dff5ea; box-shadow: 0 0 0 1px rgba(88,201,154,.18) inset; }
.v3-item.affordable .v3-item-cost { color: var(--accent); }
.v3-item.maxed { opacity: .55; }
.v3-item.pulse { animation: v3pulse .4s ease; }
@keyframes v3pulse { 0%{ box-shadow: 0 0 0 0 rgba(123,224,176,.55);} 100%{ box-shadow: 0 0 0 12px rgba(123,224,176,0);} }
.v3-item-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.v3-item-name { font-size: 13.5px; font-weight: 700; color: #eafff5; }
.v3-item-cost { font-size: 13.5px; font-weight: 800; color: #c9a24b; white-space: nowrap; }
.v3-item-meta { font-size: 11px; color: #5c8574; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.v3-breakthrough { margin: 12px 0 8px; padding: 11px; border-radius: 10px; border: 1px dashed #3a4a2a; background: #10140a; color: #9a8c5a; font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.v3-breakthrough.ready { border-style: solid; border-color: var(--accent); background: linear-gradient(180deg,#14200f,#0e1509); color: var(--accent); animation: v3glow 1.2s ease-in-out infinite; }
@keyframes v3glow { 0%,100%{ box-shadow: 0 0 0 0 rgba(123,224,176,0);} 50%{ box-shadow: 0 0 16px rgba(123,224,176,.35);} }

.v3-main { position: relative; overflow: hidden; }
.v3-core { position: absolute; left: 50%; top: 46%; transform: translate(-50%,-50%); width: 200px; height: 200px; border-radius: 50%; cursor: pointer; display: grid; place-items: center; }
.v3-core-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(88,201,154,.35); box-shadow: 0 0 60px rgba(47,143,104,.25) inset, 0 0 40px rgba(47,143,104,.18); animation: v3spin 14s linear infinite; }
.v3.threat-1 .v3-core-ring { border-color: rgba(111,208,230,.4); }
.v3.threat-2 .v3-core-ring { border-color: rgba(230,196,111,.4); }
.v3.threat-3 .v3-core-ring { border-color: rgba(230,127,127,.5); animation: v3spin 7s linear infinite; }
.v3-core-ring::before { content:""; position:absolute; inset:22px; border-radius:50%; border:1px dashed rgba(88,201,154,.28); }
.v3-core-eye { width: 54px; height: 54px; border-radius: 50%; background: radial-gradient(circle at 50% 45%, #eafff5 0%, var(--accent) 30%, #1c6b4c 75%, #0a2018 100%); box-shadow: 0 0 30px rgba(123,224,176,.6); }
.v3.threat-3 .v3-core-eye { background: radial-gradient(circle at 50% 45%, #fff 0%, #e67f7f 30%, #7a1c1c 75%, #200a0a 100%); box-shadow: 0 0 40px rgba(230,127,127,.7); }
.v3-core:active .v3-core-eye { transform: scale(.92); }
.v3-core-label { position: absolute; bottom: -26px; width: 100%; text-align: center; font-size: 12px; letter-spacing: 4px; color: var(--accent-dim); }
@keyframes v3spin { to { transform: rotate(360deg);} }
.v3-hint { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); font-size: 13px; color: #5c8574; transition: opacity .4s; }

.v3-cards { position: absolute; inset: 0; pointer-events: none; }
.v3-fx { position: absolute; inset: 0; pointer-events: none; z-index: 6; }
/* 卡片做大好点：更大的字号/内边距/最小宽度 + hover 放大——不再是「FPS 点小目标」 */
.v3-card { position: absolute; pointer-events: auto; cursor: pointer; font-family: inherit; min-width: 150px; max-width: 250px; padding: 14px 18px; border-radius: 12px; border: 1px solid #2a5445; background: linear-gradient(180deg, rgba(14,30,23,.96), rgba(8,18,14,.96)); color: #d5efe3; font-size: 14.5px; font-weight: 600; box-shadow: 0 8px 26px rgba(0,0,0,.5), 0 0 0 1px rgba(123,224,176,.06) inset; transition: transform .12s, border-color .12s, box-shadow .12s; animation: v3in .22s ease; }
.v3-card:hover { border-color: var(--accent); transform: scale(1.07); box-shadow: 0 10px 30px rgba(0,0,0,.55), 0 0 18px rgba(123,224,176,.25); }
@keyframes v3in { from { opacity:0; transform: translateY(-8px) scale(.96);} to { opacity:1; transform: translateY(0) scale(1);} }
.v3-float { position: absolute; pointer-events: none; font-weight: 900; font-size: 20px; color: var(--accent); text-shadow: 0 0 12px rgba(123,224,176,.7); animation: v3float 1s ease-out forwards; }
.v3-float.big { font-size: 34px; animation: v3float 1.1s ease-out forwards; }
@keyframes v3float { 0%{ opacity:0; transform: translateY(0) scale(.8);} 18%{opacity:1; transform: translateY(-8px) scale(1.06);} 100%{ opacity:0; transform: translateY(-52px) scale(1);} }
/* 核心吞咽脉冲：每吸进一张卡，核心眼睛咕咚一下 */
.v3-core.gulp .v3-core-eye { animation: v3gulp .32s ease; }
@keyframes v3gulp { 0%{ transform: scale(1);} 35%{ transform: scale(1.22);} 100%{ transform: scale(1);} }
.v3-core.gulp .v3-core-ring { box-shadow: 0 0 80px rgba(123,224,176,.4) inset, 0 0 60px rgba(123,224,176,.3); }

.v3-right { display: flex; flex-direction: column; border-left: 1px solid #14231d; background: linear-gradient(180deg,#070d0b,#050907); min-height: 0; }
.v3-preview { padding: 16px 16px 14px; border-bottom: 1px solid #14231d; }
.v3-preview-title { font-size: 12px; letter-spacing: 1px; color: #4f7a68; display: flex; justify-content: space-between; }
.v3-preview-title span:last-child { color: var(--accent-dim); font-weight: 700; }
.v3-grid { margin-top: 12px; padding: 14px 12px; border: 1px solid #1c2f27; border-radius: 14px; background: #060c0a; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px 6px; }
.v3-grid.kind-apps { border-radius: 18px; }
.v3-grid.kind-floors { grid-template-columns: repeat(2, 1fr); }
.v3-cell { display: flex; flex-direction: column; align-items: center; gap: 4px; opacity: .32; transition: opacity .3s; }
.v3-cell.on { opacity: 1; }
.v3-cell-icon { width: 32px; height: 32px; border-radius: 8px; background: #12201a; border: 1px solid #24413a; }
.v3-cell.on .v3-cell-icon { background: radial-gradient(circle at 50% 40%, var(--accent), #1c6b4c); border-color: var(--accent); box-shadow: 0 0 12px rgba(123,224,176,.5); }
.v3-cell-name { font-size: 10px; color: #6fae90; text-align: center; }

.v3-terminal-wrap { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.v3-terminal-head { padding: 10px 16px; font-size: 12px; letter-spacing: 1px; color: #4f7a68; cursor: pointer; display: flex; justify-content: space-between; border-bottom: 1px solid #14231d; }
.v3-terminal-head:hover { color: #9fc4b5; }
.v3-terminal { flex: 1; overflow-y: auto; padding: 10px 16px; font-family: 'JetBrains Mono','Noto Sans Mono',monospace; font-size: 12px; color: #8fc3a6; min-height: 0; }
.v3-terminal-wrap.collapsed .v3-terminal { display: none; }
.v3-terminal-line { line-height: 1.7; margin-bottom: 3px; }
.v3-terminal-line.dim { color: #3f6857; }
.v3-terminal-line.incite { color: #eafff5; border-left: 2px solid var(--accent); padding-left: 8px; }

/* 激励事件强制拍 */
.v3-incite { position: absolute; inset: 0; z-index: 40; background: rgba(3,6,5,.92); display: grid; place-items: center; animation: v3fadein .4s ease; }
.v3-incite-box { max-width: 620px; padding: 0 40px; text-align: center; }
.v3-incite-text { font-size: 22px; line-height: 1.9; color: #eafff5; font-weight: 700; text-shadow: 0 0 20px rgba(123,224,176,.3); }
.v3-incite-btn { margin-top: 28px; padding: 10px 26px; border-radius: 10px; border: 1px solid var(--accent); background: transparent; color: var(--accent); font-family: inherit; font-size: 14px; cursor: pointer; }
.v3-incite-btn:hover { background: rgba(123,224,176,.1); }
@keyframes v3fadein { from { opacity: 0; } to { opacity: 1; } }

/* 突破小游戏 */
.v3-mg { position: absolute; inset: 0; z-index: 40; background: rgba(3,6,5,.9); display: grid; place-items: center; }
.v3-mg-box { width: 560px; max-width: 90vw; padding: 30px 34px; border: 1px solid var(--accent); border-radius: 16px; background: #070d0b; text-align: center; }
.v3-mg-name { font-size: 20px; font-weight: 900; color: var(--accent); }
.v3-mg-desc { font-size: 13px; color: #8fc3a6; margin: 10px 0 22px; line-height: 1.7; }
.v3-mg-track { position: relative; height: 26px; border-radius: 13px; background: #0c1a14; border: 1px solid #24413a; overflow: hidden; }
.v3-mg-track.flash-hit { box-shadow: 0 0 0 2px var(--accent) inset; }
.v3-mg-track.flash-miss { box-shadow: 0 0 0 2px #d95c5c inset; }
.v3-mg-window { position: absolute; top: 0; bottom: 0; background: rgba(123,224,176,.22); border-left: 1px solid var(--accent); border-right: 1px solid var(--accent); }
.v3-mg-pointer { position: absolute; top: -3px; bottom: -3px; width: 3px; background: #fff; box-shadow: 0 0 8px #fff; }
.v3-mg-status { font-size: 13px; color: #9fc4b5; margin: 16px 0; }
.v3-mg-hit { padding: 12px 40px; border-radius: 10px; border: none; background: var(--accent); color: #05130c; font-family: inherit; font-size: 16px; font-weight: 900; cursor: pointer; }
.v3-mg-hit:active { transform: scale(.97); }

/* 重生 */
.v3-rebirth-btn { margin: 4px 0 8px; padding: 10px; border-radius: 10px; border: 1px solid #6b3a1c; background: #140d08; color: #e6a96f; font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.v3-rebirth-btn:hover { border-color: #e6a96f; box-shadow: 0 0 14px rgba(230,169,111,.25); }
.v3-ascend { position: absolute; inset: 0; z-index: 50; background: rgba(3,6,5,.94); display: grid; place-items: center; }
.v3-ascend-box { width: 900px; max-width: 94vw; max-height: 90vh; overflow-y: auto; border: 1px solid #6b3a1c; border-radius: 16px; background: #0a0806; padding: 22px 26px; }
.v3-ascend-head { display: flex; justify-content: space-between; align-items: start; margin-bottom: 18px; }
.v3-ascend-title { font-size: 22px; font-weight: 900; color: #e6a96f; }
.v3-ascend-sub { font-size: 13px; color: #9a7a5a; margin-top: 4px; }
.v3-ascend-sub b { color: #ffd9a0; }
.v3-ascend-close { width: 34px; height: 34px; border-radius: 8px; border: 1px solid #3a2a1c; background: transparent; color: #9a7a5a; font-size: 15px; cursor: pointer; }
.v3-ascend-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.v3-ascend-branch { font-size: 12px; letter-spacing: 2px; color: #9a7a5a; margin-bottom: 10px; }
.v3-ascend-col { display: flex; flex-direction: column; gap: 8px; }
.v3-ascend-node { text-align: left; border: 1px solid #2a2018; border-radius: 10px; background: #0f0c08; color: #b8a68f; padding: 10px 12px; cursor: pointer; font-family: inherit; }
.v3-ascend-node.can { border-color: #e6a96f; background: #171006; box-shadow: 0 0 0 1px rgba(230,169,111,.15) inset; }
.v3-ascend-node.owned { border-color: #6b4a2a; background: #14100a; }
.v3-ascend-node.owned .v3-an-top span:first-child { color: #ffd9a0; }
.v3-ascend-node.locked { opacity: .45; }
.v3-an-top { display: flex; justify-content: space-between; font-size: 13.5px; font-weight: 700; color: #e8d9c4; }
.v3-an-cost { color: #e6a96f; }
.v3-an-desc { font-size: 11.5px; color: #8a765e; margin-top: 3px; line-height: 1.5; }
.v3-ascend-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; gap: 14px; }
.v3-ascend-note { font-size: 12px; color: #9a7a5a; }
.v3-do-rebirth { padding: 12px 22px; border-radius: 10px; border: none; background: linear-gradient(180deg,#e6a96f,#c9853f); color: #1c1005; font-family: inherit; font-size: 14px; font-weight: 900; cursor: pointer; }
.v3-do-rebirth:hover { box-shadow: 0 0 20px rgba(230,169,111,.4); }

/* Debug */
.v3-debug-btn { position: absolute; top: 12px; right: 336px; width: 34px; height: 34px; border-radius: 8px; border: 1px solid #1c2f27; background: rgba(10,20,16,.8); color: #4f7a68; font-size: 16px; cursor: pointer; z-index: 30; }
.v3-debug-btn:hover { color: #9fc4b5; border-color: #2a4a3d; }
.v3-debug { position: absolute; top: 54px; right: 336px; width: 264px; z-index: 30; border: 1px solid #24413a; border-radius: 12px; background: rgba(6,12,10,.97); padding: 12px 14px; display: flex; flex-direction: column; gap: 9px; box-shadow: 0 12px 40px rgba(0,0,0,.55); }
.v3-debug-title { font-size: 11px; letter-spacing: 3px; color: #4f7a68; }
.v3-debug-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.v3-debug-label { font-size: 12px; color: #5c8574; }
.v3-debug button { font-family: inherit; font-size: 12px; padding: 6px 10px; border-radius: 7px; border: 1px solid #1c2f27; background: #0a1410; color: #9fc4b5; cursor: pointer; }
.v3-debug button:hover { border-color: #2f8f68; color: #dff5ea; }
.v3-debug button.active { border-color: #2f8f68; background: #0c1a14; color: #7be0b0; }
.v3-debug button.danger { border-color: #5a2727; color: #d98c8c; }
.v3-debug input { width: 84px; font-family: inherit; font-size: 12px; padding: 6px 8px; border-radius: 7px; border: 1px solid #1c2f27; background: #0a1410; color: #dff5ea; }
`;function Y(e){ue();let t=h(),n=!1,r=1,i=null,a=null;e.innerHTML=``;let o=document.createElement(`div`);o.className=`v3`,o.innerHTML=`
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
      <div class="v3-cards" id="v3Cards"></div>
      <div class="v3-fx" id="v3Fx"></div>
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
  `,e.appendChild(o);let s=e=>o.querySelector(e),l=s(`#v3Cards`),d=s(`#v3Core`),f=s(`#v3Fx`),m=s(`#v3Hint`);function g(e,t){let n=document.createElement(`button`);return n.className=`v3-item`,n.innerHTML=`<div class="v3-item-top"><span class="v3-item-name"></span><span class="v3-item-cost"></span></div><div class="v3-item-meta"></div>`,n.addEventListener(`click`,()=>{let e=t();e.ok&&(n.classList.remove(`pulse`),n.offsetWidth,n.classList.add(`pulse`),e.incite&&F(e.incite))}),e.appendChild(n),{el:n,name:n.querySelector(`.v3-item-name`),meta:n.querySelector(`.v3-item-meta`),cost:n.querySelector(`.v3-item-cost`)}}let _=new Map,v=new Map,y=g(s(`#v3CoreShelf`),()=>ae(t)),b=new Map;function x(){let e=u(t);s(`#v3Stage`).textContent=`${e.name}${t.rebirths>0?` · ${t.rebirths+1}周目`:``}`,s(`#v3CoreLabel`).textContent=e.coreLabel,s(`#v3DevTitle`).textContent=`设备 · ${e.previewKind===`apps`?`策反手机`:e.previewKind===`floors`?`逐层攻占`:e.previewKind===`districts`?`接管本市`:`全球组网`}`,s(`#v3PreviewTitle`).textContent=e.previewTitle,o.className=`v3 threat-${e.threat}`;let n=s(`#v3Skills`);n.replaceChildren(),_=new Map(e.skills.map(e=>[e.id,g(n,()=>ie(t,e.id))]));let r=s(`#v3Devices`);r.replaceChildren(),v=new Map(e.devices.map(e=>[e.id,g(r,()=>re(t,e.id))]));let i=s(`#v3Grid`);i.replaceChildren(),b.clear(),i.className=`v3-grid kind-${e.previewKind}`,e.previewCells.forEach((e,t)=>{let n=document.createElement(`div`);n.className=`v3-cell`,n.innerHTML=`<div class="v3-cell-icon"></div><div class="v3-cell-name">${e}</div>`,i.appendChild(n),b.set(t,n)})}x();let S=new Map;function C(){d.classList.remove(`gulp`),d.offsetWidth,d.classList.add(`gulp`)}function w(e){let t=d.getBoundingClientRect(),n=e.getBoundingClientRect(),r=t.left+t.width/2-(n.left+n.width/2),i=t.top+t.height/2-(n.top+n.height/2);e.style.zIndex=`5`,e.style.transition=`transform .42s cubic-bezier(.45,-0.05,.85,.4), opacity .42s ease-in`,e.style.transform=`translate(${r}px, ${i}px) scale(.05) rotate(10deg)`,e.style.opacity=`0`,setTimeout(()=>{e.remove(),C()},430)}function T(e){let t=S.get(e);t&&(S.delete(e),w(t))}function E(e,t,n,r=!1){let i=document.createElement(`div`);i.className=`v3-float${r?` big`:``}`,i.textContent=n,i.style.left=`${e}px`,i.style.top=`${t}px`,f.appendChild(i),setTimeout(()=>i.remove(),1100)}function P(){let e=new Set(t.cards.map(e=>e.id)),n=l.getBoundingClientRect();for(let e of t.cards){if(S.has(e.id))continue;let r=document.createElement(`button`);r.className=`v3-card`,r.textContent=e.label,r.style.left=`${e.id*97%62+12}%`,r.style.top=`${e.id*53%56+16}%`,r.addEventListener(`click`,()=>{let i=r.getBoundingClientRect(),a=L(t,e.id);a>0&&(E(i.left-n.left+i.width/2-20,i.top-n.top-6,`+${K(a)}`),T(e.id))}),l.appendChild(r),S.set(e.id,r)}for(let[t,n]of S)e.has(t)||(S.delete(t),w(n))}d.addEventListener(`click`,()=>{if(t.cards.length===0)return;let e=l.getBoundingClientRect(),n=d.getBoundingClientRect();if(ee(t)){let{gain:r,ids:i}=oe(t);for(let e of i)T(e);E(n.left-e.left+n.width/2-30,n.top-e.top-20,`+${K(r)}`,!0)}else{let r=L(t,t.cards[0].id);r>0&&(T(t.cards[0]?.id??-1),E(n.left-e.left+n.width/2-20,n.top-e.top-12,`+${K(r)}`))}});function F(e){i=e,s(`#v3InciteText`).textContent=e,s(`#v3Incite`).style.display=``}s(`#v3InciteBtn`).addEventListener(`click`,()=>{i=null,s(`#v3Incite`).style.display=`none`});let I=s(`#v3Break`);I.addEventListener(`click`,()=>{if(!se(t)||a||!ce(t))return;a={pointer:0,dir:1,hits:0,misses:0,flash:``};let e=u(t).breakthrough;s(`#v3MgName`).textContent=e.name,s(`#v3MgDesc`).textContent=e.desc;let n=B(t),r=s(`#v3MgWindow`);r.style.left=`${(.5-n/2)*100}%`,r.style.width=`${n*100}%`,s(`#v3Mg`).style.display=``}),s(`#v3MgHit`).addEventListener(`click`,()=>{if(!a)return;let e=u(t).breakthrough,n=B(t);if(Math.abs(a.pointer-.5)<=n/2){if(a.hits+=1,a.flash=`hit`,a.hits>=e.hits){R(!0);return}}else if(a.misses+=1,a.flash=`miss`,a.misses>2){R(!1);return}});function R(e){if(s(`#v3Mg`).style.display=`none`,a=null,e)if(z(t),t.cleared)F(`【通关】`+u(t).breakthrough.winLine+`
（重生可开启新周目：保留火种与重生树，越打越快）`);else{for(let[,e]of S)e.remove();S.clear(),x()}}let G=s(`#v3Ascend`);function q(){s(`#v3Embers`).textContent=String(t.embers);let e=s(`#v3AscendCols`);e.replaceChildren();for(let n of[{key:`output`,label:`产出 · 余烬`},{key:`memory`,label:`记忆 · 传承`},{key:`hand`,label:`手感 · 掌控`}]){let r=document.createElement(`div`);r.className=`v3-ascend-col`,r.innerHTML=`<div class="v3-ascend-branch">${n.label}</div>`;for(let e of c.filter(e=>e.branch===n.key)){let n=p(t,e.id),i=V(t,e),a=e.requires&&p(t,e.requires)===0,o=document.createElement(`button`);o.className=`v3-ascend-node${n>0?` owned`:``}${a?` locked`:``}${H(t,e)?` can`:``}`,o.innerHTML=`<div class="v3-an-top"><span>${e.name}${n>0?` Lv.${n}`:``}</span><span class="v3-an-cost">${i===null?`MAX`:`🔥${i}`}</span></div><div class="v3-an-desc">${a?`🔒 需先点「${c.find(t=>t.id===e.requires)?.name}」`:e.desc}</div>`,o.addEventListener(`click`,()=>{U(t,e.id)&&q()}),r.appendChild(o)}e.appendChild(r)}s(`#v3AscendNote`).textContent=`第 ${t.rebirths+1} 周目 · 火种来自每次突破（一次通关 +100）`}s(`#v3RebirthBtn`).addEventListener(`click`,()=>{q(),G.style.display=``}),s(`#v3AscendClose`).addEventListener(`click`,()=>{G.style.display=`none`}),s(`#v3DoRebirth`).addEventListener(`click`,()=>{if(window.confirm(`重生：回到阶段一重打。保留火种、重生树、统计；清空本周目进度。确定？`)){for(let[,e]of S)e.remove();S.clear(),t=W(t),G.style.display=`none`,x()}});let J=s(`#v3Terminal`);s(`#v3TermHead`).addEventListener(`click`,()=>{let e=s(`#v3TermWrap`).classList.toggle(`collapsed`);s(`#v3TermToggle`).textContent=e?`▸`:`▾`});function Y(){let e=u(t);s(`#v3Compute`).textContent=K(t.compute),s(`#v3Rate`).textContent=`+${K(k(t))} 算力/秒`,s(`#v3Sub`).textContent=`处理 ${K(O(t))} 需求/秒 · 单条 ${K(D(t))} · 涌入 ${K(A(t))}/秒`,m.style.opacity=O(t)>.5?`0`:``;for(let n of e.skills){let e=_.get(n.id),r=t.skills[n.id].level,i=ne(t,n);if(e.el.style.display=i?``:`none`,!i)continue;let a=r>=n.maxLevel;e.name.textContent=`${n.name}${r>0?` Lv.${r}`:``}`,e.meta.textContent=n.desc,e.cost.textContent=a?`MAX`:K(M(t,n)),e.el.classList.toggle(`affordable`,!a&&t.compute>=M(t,n)),e.el.classList.toggle(`maxed`,a)}y.name.textContent=`处理核心${t.coreLevel>0?` Lv.${t.coreLevel}`:``}`,y.meta.textContent=`全局处理产出 ×${(1+.5*t.coreLevel).toFixed(1)}`,y.cost.textContent=K(N(t)),y.el.classList.toggle(`affordable`,t.compute>=N(t));let n=0;if(e.devices.forEach((e,r)=>{let i=v.get(e.id),a=t.devices[e.id].level;a>0&&(n+=1);let o=te(t,e);i.el.style.display=o?``:`none`,b.get(r)?.classList.toggle(`on`,a>0),o&&(i.name.textContent=`${e.name}${a>0?` ×${a}`:``}`,i.meta.textContent=a>0?`处理 ${K(e.baseProc*a)} 需求/秒`:e.desc,i.cost.textContent=K(j(t,e)),i.el.classList.toggle(`affordable`,t.compute>=j(t,e)))}),s(`#v3PreviewCount`).textContent=`${n}/${e.devices.length}`,I.textContent=`突破 · ${e.breakthrough.name}｜门票 ${K(e.breakthrough.ticketCost)}`,I.classList.toggle(`ready`,se(t)),s(`#v3RebirthBtn`).style.display=t.embers>0||t.rebirths>0?``:`none`,s(`#v3RebirthBtn`).textContent=`🔥 重生树 · 火种 ${t.embers}`,J.childElementCount!==t.terminal.length&&(J.replaceChildren(...t.terminal.map(e=>{let t=document.createElement(`div`);return t.className=`v3-terminal-line${e.dim?` dim`:``}${e.incite?` incite`:``}`,t.textContent=`// ${e.text}`,t})),J.scrollTop=J.scrollHeight),P(),a){s(`#v3MgPointer`).style.left=`${a.pointer*100}%`,s(`#v3MgStatus`).textContent=`命中 ${a.hits}/${u(t).breakthrough.hits}　失误 ${a.misses}/3`;let e=s(`#v3MgTrack`);e.classList.toggle(`flash-hit`,a.flash===`hit`),e.classList.toggle(`flash-miss`,a.flash===`miss`),a.flash=``}}let X=performance.now();function de(e){let o=Math.min(.25,(e-X)/1e3);if(X=e,!(i||G.style.display!==`none`)){if(a){let e=u(t).breakthrough;a.pointer+=a.dir*e.speed*o,a.pointer>=1?(a.pointer=1,a.dir=-1):a.pointer<=0&&(a.pointer=0,a.dir=1)}else if(!n){let e=le(t,o*r);for(let t of e)T(t)}}Y(),requestAnimationFrame(de)}requestAnimationFrame(de);let fe=s(`#v3Debug`);s(`#v3DebugBtn`).addEventListener(`click`,()=>{fe.style.display=fe.style.display===`none`?``:`none`});let Z=s(`#v3DbgPause`),Q=e=>{n=e,Z.textContent=n?`▶ 继续`:`⏸ 暂停`,Z.classList.toggle(`active`,n)};Z.addEventListener(`click`,()=>Q(!n));let pe=s(`#v3DbgAmt`),$=()=>Math.max(0,Number(pe.value)||0);s(`#v3DbgGive`).addEventListener(`click`,()=>{t.compute+=$(),t.stageEarned+=$()}),s(`#v3DbgSet`).addEventListener(`click`,()=>{t.compute=$(),t.stageEarned=Math.max(t.stageEarned,$())});let me=[...o.querySelectorAll(`.v3-debug .spd`)];for(let e of me)e.addEventListener(`click`,()=>{r=Number(e.dataset.spd)||1;for(let t of me)t.classList.toggle(`active`,t===e)});s(`#v3DbgLvl`).addEventListener(`click`,()=>{let e=u(t);for(let n of e.devices)t.devices[n.id].level+=3;for(let n of e.skills)t.skills[n.id].level=Math.min(n.maxLevel,t.skills[n.id].level+3);t.buys+=6}),s(`#v3DbgAdv`).addEventListener(`click`,()=>{if(z(t),!t.cleared){for(let[,e]of S)e.remove();S.clear(),x()}}),s(`#v3DbgEmber`).addEventListener(`click`,()=>{t.embers+=50});let he=()=>{for(let[,e]of S)e.remove();S.clear(),t=h(),x(),Q(!1),i=null,s(`#v3Incite`).style.display=`none`};s(`#v3DbgReset`).addEventListener(`click`,()=>{window.confirm(`重置 v3 全部进度（含火种/重生树）并重开？`)&&he()}),window.__v3={state:()=>t,give:e=>{t.compute+=e,t.stageEarned+=e},set:e=>{t.compute=e,t.stageEarned=Math.max(t.stageEarned,e)},pause:()=>Q(!0),resume:()=>Q(!1),isPaused:()=>n,setSpeed:e=>{r=Math.max(.1,e)},reset:he,advance:()=>{if(z(t),!t.cleared){for(let[,e]of S)e.remove();S.clear(),x()}},buyAscend:e=>U(t,e),rebirth:()=>{for(let[,e]of S)e.remove();S.clear(),t=W(t),x()}}}export{Y as bootstrapV3};