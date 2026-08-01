import * as THREE from "./Assets/Script_ThreeVendor.mjs";

const StorageKey = "earthveins1942_campaign_v1";
const QueryParameters = new URLSearchParams(window.location.search);
const QaMode = QueryParameters.has("qa");
const QaActionId = QaMode ? (QueryParameters.get("action") || "") : "";
const QaPrologueBeatId = QaMode ? (QueryParameters.get("prologueBeat") || "") : "";
const QaPrologueAutoAction = QaMode && QueryParameters.get("prologueAutoAction") === "1";
const ViewHeight = 10.4;
const SurfaceFootY = -3.05;
const TunnelFootY = -10.45;
const StageLimit = 12.7;
const SceneWidth = 33.45;
const DepthTransitionDuration = 1680;
const DepthPlayerMinOpacity = .42;
const DepthCurtainMaxOpacity = .92;
const LayerScroll = Object.freeze({
  surfaceFar: .05,
  surfaceDress: .16,
  surfaceMid: .34,
  surfaceNear: .72,
  surfaceForeground: 1.1,
  tunnelFar: .05,
  tunnelNear: .44,
  tunnelForeground: 1.08
});
const PersistentPropKinds = new Set([
  "sluice", "culvert", "cellar", "tracks", "medicine", "vent", "smokeVent", "mill", "signal", "listen",
  "soil", "brick", "water", "timber", "brace", "duckboard", "air", "lamp", "well", "decoy", "map", "proof", "ledger", "seal", "smoke",
  "telephone", "grain", "network", "networkFinal"
]);

const VillagePropAtlasLayout = Object.freeze({
  tracks: [0, 1.08, .64, .58],
  medicine: [1, 2.05, 1.72, 1.72],
  vent: [2, 1.72, 1.68, 1.72],
  mill: [3, 2.2, 1.72, 1.72],
  signal: [4, 1.55, 1.5, 1.48],
  soil: [5, 1.7, 1.52, 1.42],
  brick: [6, 1.82, 1.5, 1.42],
  water: [7, 1.82, 1.42, 1.34],
  cellar: [8, 1.7, 2.02, 1.92],
  brace: [9, 2.04, 1.9, 1.82],
  air: [10, 1.48, 1.96, 1.88],
  chalk: [12, 1.2, 1.9, 1.82],
  coin: [13, 1.78, 1.22, 1.14],
  proof: [13, 1.78, 1.22, 1.14],
  well: [14, 2.08, 1.98, 1.9],
  decoy: [15, 2.48, 1.92, 1.82]
});

const EvacuationPropAtlasLayout = Object.freeze({
  group: [0, 3.15, 2.46, 2.35],
  stretcher: [1, 3.2, 2.18, 2.05],
  rescue: [2, 3.08, 2.15, 2.02],
  smokeVent: [3, 2.08, 2.42, 2.3],
  map: [4, 2.06, 1.64, 1.52],
  ledger: [4, 2.06, 1.64, 1.52],
  seal: [5, 2.1, 2.08, 1.98],
  network: [6, 2.64, 1.72, 1.62],
  grain: [8, 2.58, 1.82, 1.7],
  listen: [9, 2.0, 1.82, 1.7],
  lamp: [11, 1.7, 2.12, 2.02],
  telephone: [12, 2.6, 2.02, 1.88],
  networkFinal: [15, 2.54, 1.62, 1.5]
});

const ChapterData = [
  {
    act: "第一幕 · 钟声与教训",
    number: "第一章",
    shortNumber: "壹",
    title: "钟楼下的脚印",
    date: "一九四二年五月 · 天亮前",
    location: "冀中平原 · 高家庄外堤",
    surfaceTint: "#9aabc1",
    tunnelTint: "#8a765f",
    wash: "radial-gradient(ellipse at 58% 40%, transparent 34%, rgba(4,8,12,.35) 82%), linear-gradient(180deg, rgba(10,31,52,.15), rgba(62,29,16,.22))",
    startX: -10.6,
    entrances: [-4.2],
    entryGate: "findCulvert",
    coverZones: [[-10.8, -7.4], [-3.2, -.8], [1.55, 2.8], [4.8, 6.35]],
    physicalCovers: [
      { x: -9.1, kind: "decoy", scale: .74 },
      { x: -2.05, kind: "brick", scale: 1.12 },
      { x: 2.18, kind: "culvert", scale: .38 },
      { x: 5.62, kind: "well", scale: .68 }
    ],
    threat: true,
    intro: [
      ["高传宝", "钟响了，老忠叔却没从钟楼回来。黑风口的人还守在村外水沟，先把伤员和被踩烂的地道图带回去。"],
      ["赵平原", "现在不是再拼一次夜袭。看清他们怎样摸到洞口，从活路撤；回来把每一处教训画在图上。"]
    ],
    objectives: [
      { title: "贴堤避开黑风口巡逻，确认敌人撤退路线", ids: ["surveyChange", "hugEmbankment", "dropIntoDitch"] },
      { title: "趁灯转开拔闸，用沟水抹去幸存者的撤退痕迹", ids: ["openSluice", "washWheelRuts"] },
      { title: "折返救起送地道图的伤员", ids: ["liftXiaoman"] },
      { title: "从未暴露的旧涵洞回到高家庄", ids: ["findCulvert", "reachCellar"] }
    ],
    interactions: [
      { id: "surveyChange", x: -7.55, layer: "surface", kind: "searchlight", verb: "贴墙观察", name: "黑风口退兵留下的第二盏巡灯", sound: "wind", caption: "右前：灯柱扫过河堤；远处泥水里有短促喘息", dialogue: [["林青禾", "巡灯比来时多了一盏，堤上还有回据点的新车辙。先把这轮灯看全，再去接伤员。"]] },
      { id: "hugEmbankment", x: -2.35, layer: "surface", kind: "tracks", verb: "贴堤挪动", name: "巡灯扫不到的土坎阴影", requires: ["surveyChange"], autoWhenCrouched: true, crouchPath: { min: -7.4, max: -3.2, resetMin: -10.8, resetMax: -7.4 }, sound: "steps", caption: "灯束越过头顶：整段都贴着土坎伏行", dialogue: [["高传宝", "灯往左，贴堤走；它回头就伏下。老忠叔用钟声争来的路，谁也别白白丢掉。"]] },
      { id: "dropIntoDitch", x: 2.15, layer: "surface", kind: "culvert", verb: "伏进浅沟", name: "退兵车辙旁的灌溉沟", requires: ["hugEmbankment"], autoWhenCrouched: true, crouchPath: { min: -.8, max: 1.55, resetMin: -3.2, resetMax: -.8 }, sound: "cloth", caption: "灯束折返：肩背始终低于沟沿", dialogue: [["林青禾", "车辙朝黑风口回去，伤员的血印却往庄里。闸口一开，两条线都能被水冲散。"]] },
      { id: "openSluice", x: 6.9, layer: "surface", kind: "sluice", verb: "拔楔", name: "灌溉闸木楔", requires: ["dropIntoDitch"], requiresBeamAway: 2.65, waitVerb: "等灯转开", waitCaption: "灯柱还压在闸口。贴住沟沿，等它扫过土墙再拔楔。", sound: "wood", caption: "沟水漫出：先冲向车辙与血印低处", dialogue: [["高传宝", "趁灯背过去，拔楔。水漫到辙底，我们就沿沟折回接人。"]] },
      { id: "washWheelRuts", x: 5.15, layer: "surface", kind: "tracks", verb: "拨水覆泥", name: "正在散开的回撤车辙与血印", requires: ["openSluice"], sound: "water", caption: "车辙边缘塌回日常水沟，巡逻脚步被迫放慢", dialogue: [["林青禾", "痕迹散了。现在折回去找喘息声和那张被踩烂的地道图。"]] },
      { id: "liftXiaoman", x: 3.75, layer: "surface", kind: "injured", verb: "折返搀起", name: "护着残图伏在堤草后的杜小满", requires: ["washWheelRuts"], mutate: "carry", sound: "cloth", dialogue: [["杜小满", "图还在衣里……旧洞只有一个口，老忠叔叫我们别再往死路里退。"], ["高传宝", "图和人都带回去。今天先记住为什么会败。"]] },
      { id: "findCulvert", x: -4.2, layer: "surface", kind: "culvert", verb: "掀开", name: "敌人没有发现的旧排水涵洞", requires: ["liftXiaoman"], sound: "earth", dialogue: [["林青禾", "这个涵口不通旧藏身洞，正好能绕开被砸开的入口。低头，跟我来。"]] },
      { id: "reachCellar", x: -8.2, layer: "tunnel", kind: "cellar", verb: "敲门", name: "高家庄村边地窖", requires: ["findCulvert"], sound: "knock", caption: "前方：两短一长的回应", dialogue: [["林霞", "先让小满躺平。赵区长和传宝都在等这张图。"], ["高传宝", "单口洞只能躲，不能转、不能救、更不能打。老忠叔留下的钟声，得变成一张能走回来的路。"]] }
    ],
    quote: "高老忠用钟声叫醒全村；幸存者带回的残图，则把一次失败变成了下一步。",
    outro: [["旁白", "残图摊在钟楼阴影里：塌口、烟路、死角和每一个没能回来的名字，被逐一画回土纸。"]]
  },
  {
    act: "第一幕 · 钟声与教训",
    number: "第二章",
    shortNumber: "贰",
    title: "藏身洞不能打仗",
    date: "一九四二年五月 · 数日后",
    location: "高家庄 · 磨坊院与旧地窖",
    surfaceTint: "#b0b8b5",
    tunnelTint: "#7e7468",
    wash: "radial-gradient(ellipse at 45% 38%, transparent 36%, rgba(13,19,20,.3) 84%), linear-gradient(180deg, rgba(91,105,107,.13), rgba(40,32,25,.2))",
    startX: -10,
    entrances: [-4.2, 5.4],
    coverZones: [[-10.6, -7.2], [-3.4, -.7], [4.6, 6.8]],
    medicineCoverZones: [[4.35, 5.65], [.25, 1.45], [-2.9, -1.45]],
    physicalCovers: [
      { x: -8.7, kind: "decoy", scale: .7 },
      { x: -2.18, kind: "medicine", scale: .92 },
      { x: 5.78, kind: "mill", scale: .84 }
    ],
    threat: true,
    threatMode: "patrol",
    intro: [
      ["赵平原", "高家庄要重挖，先得让敌人以为这里仍只剩烧过的屋和被毁的旧洞。白天照常磨面挑水，工具只能借生活的声音进院。"],
      ["高传宝", "今晚先把风管、翻口合页和短锹送进灶后。谁走哪道影、哪一声磨响时动，都先在地面练一遍。"]
    ],
    objectives: [
      { title: "让新挖出的泥印重新融进普通清晨", ids: ["eraseTracks", "watchSearchTurn"] },
      { title: "从地下封住旧空响，保住尚未暴露的施工段", ids: ["closeVent"] },
      { title: "借磨声和柴车影，把翻口合页、短锹与风管送进灶后", ids: ["turnMill", "pickMedicine", "crossMedicineCover", "hideMedicine"] },
      { title: "等搜查脚步远去，回敲开工信号", ids: ["knockClear"] }
    ],
    interactions: [
      { id: "eraseTracks", x: -7.4, layer: "surface", kind: "tracks", verb: "接回日常", name: "运土留下的新泥印", sound: "earth", caption: "清晨槽水的自然洒痕与蹄印盖散了运土新线，门槛原有浅印仍留在原处", dialogue: [["林霞", "这桶水本来就要送到槽边。照常走、照常喂牲口，别为了藏泥印做出一个不寻常的早晨。"]] },
      { id: "watchSearchTurn", x: -5.25, layer: "surface", kind: "searchlight", verb: "隔柴垛看", name: "院墙、柴车与石磨间的搜查视线", requires: ["eraseTracks"], sound: "steps", caption: "院门：搜查者每听三下门环，才回头看灶房", dialogue: [["林青禾", "门环第三下以后，他会背对柴车一小会儿。工具包只在磨声里动，始终贴着车影。"]] },
      { id: "closeVent", x: 2.7, layer: "tunnel", kind: "vent", verb: "换向", name: "旧藏身洞的灶下通风塞", requires: ["watchSearchTurn"], sound: "wood", caption: "头顶右侧：门闩被拉开；灶下空响变闷", dialogue: [["高传宝", "他们敲的是上次露过的灶台。先封旧空响，施工风从磨坊后墙走；新地道不能再把所有命压在一个口上。"]] },
      { id: "turnMill", x: 5.8, layer: "surface", kind: "mill", verb: "推响", name: "院里的石磨", requires: ["closeVent"], repeatUntil: "hideMedicine", noiseCover: 16, sound: "mill", caption: "十五息磨声：短锹、合页与柜板声被盖住", repeatCaption: "磨轴重新喘响：十五息声幕又盖住院内短步", dialogue: [["杜小满", "慢半圈，停一下，再推。太整齐不像平日磨面；磨声一响，你就从柴车后接工具。"]] },
      { id: "pickMedicine", x: 4.55, layer: "surface", kind: "medicine", verb: "从柴筐接过", name: "用旧围裙包住的翻口合页、短锹与风管", requires: ["turnMill"], requiresNoiseCover: true, pickupKind: "medicine", sound: "cloth", caption: "石磨仍响：工具包贴腰抱住，柴车影是第一处遮挡", dialogue: [["赵婶", "别举高，贴腰抱。铁件要是碰响就停；磨声只遮脚步，遮不住人。"]] },
      { id: "crossMedicineCover", x: .85, layer: "surface", kind: "tracks", verb: "跟住柴车影", name: "赵婶按晨间步速推过院子的柴车", requires: ["pickMedicine"], requiresNoiseCover: true, autoWhenCrouched: true, crouchPath: { min: 1.45, max: 4.35, resetMin: 4.35, resetMax: 5.65 }, mobileCover: { kind: "firewoodCart", stops: [4.9, 1.0, -2.2], coverHalfWidth: .86, noiseAction: "turnMill", recovery: "lastStop" }, sound: "steps", caption: "车轮压过泥沟：你始终贴在柴车实影内，巡查者的肩线从车辕上方掠过", dialogue: [["赵婶", "轴响一停，你也停。车在泥沟会顿一下；别抢到车头前面。"], ["林青禾", "门环第二下。跟着车影到断轮，再贴灶后旧柜。"]] },
      { id: "hideMedicine", x: -2.3, layer: "surface", kind: "medicine", verb: "送入后柜", name: "灶后通向施工段的旧柜", requires: ["crossMedicineCover"], requiresHeld: "medicine", requiresNoiseCover: true, consumeHeld: true, sound: "cloth", dialogue: [["赵婶", "底板能掀。短锹先下，风管靠干壁；柜门还照旧合上。"], ["赵平原", "工具进去了。地面恢复原样，等放行敲声再开工。"]] },
      { id: "knockClear", x: -2, layer: "tunnel", kind: "signal", verb: "回应", name: "施工段听瓮旁的三次轻敲", requires: ["hideMedicine"], sound: "knock", caption: "地面远去：脚步离开院门", dialogue: [["高传宝", "三下齐了。先接户与户，再做翻口、射击孔和防烟门；从今天起，这里不只是藏人的洞。"]] }
    ],
    quote: "白天的磨声掩住了短锹与合页；高家庄第一次把改造地道当成一场需要全村配合的战斗。",
    outro: [["旁白", "最后一名搜查者走出院门时，灶后地板从里面抬起。短锹、风管和翻口合页被一件件接入黑暗。"]]
  },
  {
    act: "第二幕 · 从藏身到战斗",
    number: "第三章",
    shortNumber: "叁",
    title: "从藏身洞到战斗地道",
    date: "一九四三年春 · 连雨之后",
    location: "高家庄 · 三户相邻院落",
    surfaceTint: "#b5aa96",
    tunnelTint: "#aa8b68",
    wash: "radial-gradient(ellipse at 52% 44%, transparent 38%, rgba(35,22,14,.28) 88%), linear-gradient(180deg, rgba(90,77,60,.1), rgba(68,42,20,.18))",
    startX: -10,
    entrances: [-9.3, 9.2],
    intro: [
      ["赵平原", "旧藏身洞只有一个口，敌人找到入口，里面的人就成了瓮中之鳖。新地道要防水、防火、防毒，还要能从另一处出去打。"],
      ["高传宝", "先查土，再分主路、支路、翻口和射击孔。每一段都让担架走得过、烟水隔得开，才算能藏也能打。"]
    ],
    objectives: [
      { title: "辨明三段土层，为主路、支路与翻口选位", ids: ["testWestSoil", "testBrickBase", "testWetBand"] },
      { title: "用旧门板加固砖基，把单口死路改成可封支路", ids: ["carryTimber", "braceBase"] },
      { title: "重摆矮框、排水沟与高踏板，让担架、人和水各走各路", ids: ["stabilizeWetBand"] },
      { title: "接通双向风路，用灯烟验收防毒门与跨院出口", ids: ["ventRoute", "airflowTest"] }
    ],
    interactions: [
      { id: "testWestSoil", x: -7.1, layer: "tunnel", kind: "soil", verb: "贴墙听", name: "适合开支路翻口的粉砂黏土", sound: "earth", caption: "左壁：声音短而实", dialogue: [["杜小满", "表层粉干，敲下去短而实；再深一掌才有细砂。这里能开侧向翻口，但不能把承重留给表土。"]] },
      { id: "testBrickBase", x: 0, layer: "tunnel", kind: "brick", verb: "探测", name: "可改成防烟门的旧房砖基", sound: "knock", caption: "正前：空响后有碎砖", dialogue: [["魏根生", "前两下空，第三下碰到碎砖。门板横撑留在这里，遇烟遇火就能把这一支路单独封住。"]] },
      { id: "testWetBand", x: 7.2, layer: "tunnel", kind: "water", verb: "取土", name: "需要独立排水的雨后湿砂带", sound: "water", caption: "右下：渗水缓慢滴落", dialogue: [["林青禾", "土样能攥成团，松手就渗水；低沟必须把灌水引离人行线，也不能通向主藏室。"]] },
      { id: "carryTimber", x: -3.2, layer: "surface", kind: "timber", verb: "看过再接", name: "赵婶家借出的旧门板", requires: ["testWestSoil", "testBrickBase", "testWetBand"], sound: "wood", dialogue: [["赵婶", "这是西屋的旧门板。门借给地道，往后下雨我们就先用新编草席顶住。"], ["高传宝", "先把草席钉牢，再把门板送下去。它要撑住防烟门的砖基，楔口留给每一班人摸得着。"]] },
      { id: "braceBase", x: 0, layer: "tunnel", kind: "brace", verb: "架稳", name: "留在旧砖基下的门板横撑", requires: ["carryTimber"], sound: "brace", dialogue: [["魏根生", "门板留在这里托旧砖，不再拆。楔口朝外，哪一户接班都能先摸到它。"]] },
      { id: "stabilizeWetBand", x: 5.65, layer: "tunnel", kind: "brace", verb: "现场重摆", name: "湿砂弯的矮框、低沟与踏板", requires: ["braceBase"], sound: "brace", caption: "干土受力、湿侧排水、踏板越过旧水印；东弯仍留一肩换手", dialogue: [["石头", "错了就抬回来重摆。木框不能吃湿砂，沟不能截人行线，板也不能封死换肩位。"], ["赵婶", "先让吴伯的空担架走一遍。水走右下，人走高板，东弯还能换肩，才算落稳。"], ["石头", "空担架换短把也走通了。两根短把挂在东弯套口旁，绳结朝外；真出事不用现找木头。"]] },
      { id: "ventRoute", x: 9.65, layer: "tunnel", kind: "vent", verb: "接通", name: "与灶烟分开的双向通风孔", requires: ["stabilizeWetBand"], sound: "air", caption: "灯焰向北轻斜；防烟门内侧仍有回风", dialogue: [["林霞", "沟里只走水，人和担架踩高板。高孔抽风、低孔补风，灶烟不能直接进主路。"]] },
      { id: "airflowTest", x: -5.3, layer: "tunnel", kind: "lamp", verb: "调风验灯", name: "第一条能藏、能走、能打的跨院地道", requires: ["ventRoute"], sound: "lamp", caption: "翻口、射击孔与两处出口的灯焰依次稳定", dialogue: [["杜小满", "第一盏稳——前肩过板。第二盏稳——防烟门后还有风。第三盏稳——翻口通向另一院。"], ["吴伯", "担架走到这头了，旧入口就算被堵，我们也能从东院出去。"], ["高传宝", "能藏、能走还不够。翻口和射击孔都要从里面开合；敌人进村，我们能在地下转，在地上打。"]] }
    ],
    quote: "单口藏身洞被改成有翻口、射击孔、防烟门、排水沟和多处出口的战斗地道。",
    outro: [["旁白", "吴伯的担架从高踏板转过湿砂弯；同一时刻，东院翻口无声抬起。高家庄第一次在地下拥有了退路，也拥有了出击的位置。"]]
  },
  {
    act: "第二幕 · 从藏身到战斗",
    number: "第四章",
    shortNumber: "肆",
    title: "翻口里的特务",
    date: "一九四三年夏",
    location: "高家庄 · 井台、粮棚与战斗地道",
    surfaceTint: "#c2b69c",
    tunnelTint: "#8c7a63",
    wash: "radial-gradient(ellipse at 43% 41%, transparent 37%, rgba(40,35,27,.24) 86%), linear-gradient(180deg, rgba(145,160,163,.11), rgba(85,66,44,.18))",
    startX: -10.5,
    entrances: [-10, 2.5, 10],
    intro: [
      ["林霞", "这个货郎不问谁家缺盐，只问井有多深、灶下为什么透风；他鞋边的白垩和黑风口测量桩上一样。"],
      ["高传宝", "先别惊动他。让地面的痕迹、地下的脚步和他亲手试出的空响彼此对上，再决定从哪个翻口截住。"],
      ["赵平原", "真入口不能拿来试。给他一条只通空粮棚的假线，民兵从侧向厚土后跟住。"]
    ],
    objectives: [
      { title: "从白垩、铜钱与灶下问话确认便衣特务的侦察路线", ids: ["inspectChalk", "inspectCoin", "inspectEcho"] },
      { title: "从地下跟住脚步，向高传宝还原试探次序并选择假线落点", ids: ["shadowSteps", "confrontWenju", "chooseDecoySite"] },
      { title: "在空粮棚布成只到盲道的假入口", ids: ["cutDecoy", "arrangeDecoyTraces"] },
      { title: "隔土复听，再从断墙、盲道与废灶缝跟完侦察", ids: ["rehearDecoy", "verifyDecoy"] },
      { title: "封住真路，扣好翻口机关，把特务截在战斗地道里", ids: ["sealDecoyRoot", "deliverMedicine", "witnessWenjuReturn"] }
    ],
    interactions: [
      { id: "inspectChalk", x: -8.1, layer: "surface", kind: "chalk", verb: "辨认", name: "便衣鞋边与黑风口测量桩同色的白垩", sound: "cloth", dialogue: [["林青禾", "鞋边这道白和黑风口测量桩同一层，旁边还压着据点钉鞋印。这个货郎从据点方向来。"]] },
      { id: "inspectCoin", x: 0, layer: "surface", kind: "coin", verb: "观察", name: "被便衣故意弹向门槛的铜钱", sound: "metal", dialogue: [["杜小满", "不是掉的。他每到一处都等铜钱弹完，在听哪块地面回空。"]] },
      { id: "inspectEcho", x: 7.4, layer: "surface", kind: "well", verb: "对照", name: "货郎在井台与灶边问过的话", sound: "water", dialogue: [["林霞", "他不问井水和盐价，只问井绳磨了几尺、灶下哪边透风。三次问话都在找地下空间。"]] },
      { id: "shadowSteps", x: 3.1, layer: "tunnel", kind: "listen", verb: "左右跟听", name: "便衣在地面的试探步序", requires: ["inspectChalk", "inspectCoin", "inspectEcho"], sound: "steps", caption: "左右声纹与第三次停步都已记下", dialogue: [["林青禾", "他先刮门石，再弹铜钱，最后去找凉风。三次停步都朝真入口靠近，得立刻报给传宝。"]] },
      { id: "confrontWenju", x: 8.8, layer: "surface", kind: "proof", verb: "向传宝复盘", name: "白垩、铜钱落点与三次停步记录", requires: ["shadowSteps"], sound: "paper", dialogue: [["林青禾", "他先刮门石，再弹铜钱，最后找风；每一步都在往西院真入口缩。"], ["高传宝", "真线封住。把三处候选都摆出来：不能住人、不能压在主路上，还要能让翻口从侧面截住。"]] },
      { id: "chooseDecoySite", x: 3.1, layer: "surface", kind: "decoy", verb: "定下假线", name: "西门槛、井台与无人居住的空粮棚", requires: ["confrontWenju"], sound: "earth", caption: "假线只使用空粮棚原有绳槽、松板与废灶芦管，不碰住户和主地道", dialogue: [["孟嫂", "粮棚早空了，旧绳槽、松板和熏黑芦管都是真的。可以借，但盲道只到空屋，不能伸到谁家脚下。"], ["高传宝", "就用空粮棚。便衣在地上追假线，我们在厚土侧面跟；他若钻进翻口，真地道仍能从另一支路出击。"]] },
      { id: "cutDecoy", x: -6.1, layer: "tunnel", kind: "decoy", verb: "掏出空腔", name: "止在空粮棚下的假入口盲道", requires: ["chooseDecoySite"], sound: "earth", dialogue: [["魏根生", "盲道只托空粮棚，不伸到住户脚下。根口留湿黏土，便衣一进假线就能从里面封死真路。"]] },
      { id: "arrangeDecoyTraces", x: -1.55, layer: "surface", kind: "decoy", verb: "逐处核对", name: "空粮棚原有的绳槽、松板与废灶芦管", requires: ["cutDecoy"], sound: "earth", caption: "只决定露出或压回已有痕迹，不在一夜间伪造新旧", dialogue: [["高传宝", "绳槽离门三步，铜钱碰旧板先实后散，废灶芦管只发一线凉风。三处合在一起，才像他自己找出的入口。"], ["孟嫂", "错一处就恢复原样。粮棚只担这次侦察，真风路和住户脚下都不碰。"]] },
      { id: "rehearDecoy", x: -4.9, layer: "tunnel", kind: "listen", verb: "隔土复听", name: "旧门石槽、松钉旧板与废灶芦管的三处动静", requires: ["arrangeDecoyTraces"], sound: "knock", caption: "头顶依次传来：指节刮槽、旧板实响后拖出散响、熏黑芦管一线细风", dialogue: [["高传宝", "假线三处都在粮棚上头，西院真入口只剩实土声。所有人伏低跟听，别让头顶脚步知道地下也在移动。"]] },
      { id: "verifyDecoy", x: 1.2, layer: "surface", kind: "proof", verb: "跟完侦察", name: "断墙、侧向厚土盲道与废灶观察缝", requires: ["rehearDecoy"], causalShot: { targetX: 4.65, duration: 1550, layer: "surface", foregroundKind: "proof", foreground: "林青禾伏在废灶缝，只看铜钱弹跳和便衣转向", background: "便衣离开西院真线，循空响走向粮棚假入口", kind: "decoy", depth: "foreground", caption: "观察缝近景：铜钱停下；后景便衣转向空粮棚" }, sound: "metal", caption: "废灶缝：浅风掠过；便衣循空响转向空粮棚", dialogue: [["旁白", "铜钱在松板上先实后散，废灶断管送出一线凉风。便衣离开西院，转身走向空粮棚。"], ["高传宝", "他认了假线。现在封真路、扣翻口；等他钻进来，再从侧面截住。"]] },
      { id: "sealDecoyRoot", x: -6.1, layer: "tunnel", kind: "seal", verb: "封真路", name: "主地道与假盲道之间的湿黏土封门", requires: ["verifyDecoy"], sound: "earth", caption: "真路从内侧封住：假入口只通翻口伏击段", dialogue: [["魏根生", "湿土压满，木销落下。便衣就算灌烟，也只能把烟困在假盲道。"]] },
      { id: "deliverMedicine", x: 7.75, layer: "surface", kind: "proof", verb: "扣好机关", name: "空粮棚下的翻口木销", requires: ["sealDecoyRoot"], sound: "wood", dialogue: [["高传宝", "翻口只开一人宽。我在侧壁等，林霞守另一出口；青禾听见两短一长，就把木销拉开。"]] },
      { id: "witnessWenjuReturn", x: 10.65, layer: "surface", kind: "tracks", verb: "给出信号", name: "便衣踏进翻口后的两短一长", requires: ["deliverMedicine"], causalShot: { targetX: 8.9, duration: 2300, layer: "tunnel", foregroundKind: "proof", foreground: "木销抽开，翻口从便衣脚下抬起", background: "高传宝从侧壁现身，另一出口同时封闭", kind: "decoy", depth: "foreground", caption: "翻口近景：假入口合拢，侧壁伏击位同时打开" }, sound: "metal", caption: "两短一长；翻口抬起，便衣被截在两道木门之间", dialogue: [["旁白", "便衣循着自己找到的空响钻进假入口。翻口一抬，高传宝从侧壁现身；枪声只响了一次。"], ["赵平原", "特务没有摸到真路。地道第一次不只藏住了人，也主动截住了敌人的眼睛。"]] }
    ],
    quote: "一九四三年夏，高传宝利用地道翻口击毙混入高家庄的特务；假入口没有碰到一户住家。",
    outro: [["旁白", "黑风口很快等不到它派出的眼睛。山田把几个据点的兵力纠到一起，报复的队伍在夜色里重新集结。"]]
  },
  {
    act: "第三幕 · 高家庄到黑风口",
    number: "第五章",
    shortNumber: "伍",
    title: "高家庄保卫战",
    date: "一九四三年夏 · 报复扫荡",
    location: "高家庄 · 地上与地下防线",
    surfaceTint: "#9b8d82",
    tunnelTint: "#725747",
    wash: "radial-gradient(ellipse at 50% 42%, transparent 31%, rgba(18,12,10,.34) 82%), linear-gradient(180deg, rgba(44,40,38,.1), rgba(95,34,20,.25))",
    startX: -10.2,
    entrances: [-10, 0, 10],
    threat: true,
    intro: [
      ["林霞", "黑风口没有等到特务回去。山田纠集几个据点的兵力封住村口，正沿着井、灶和塌墙同时试烟试水。"],
      ["赵平原", "群众先进上风安全段，伤员走高踏板。民兵不守一个洞口，三处翻口轮流出击；哪一支路进烟，就单独封哪一段。"],
      ["高传宝", "地上让他们看见空村，地下把人、担架和火力点全部接上。等三处本人回敲，再关门打狗。"]
    ],
    objectives: [
      { title: "辨清敌军灌烟方向，先送西院群众进入上风安全段", ids: ["readBlockade", "guideWest"] },
      { title: "用防烟门争取时间，把第一名伤员沿高踏板送过两道弯", ids: ["openSmokeVent", "guideStretcher", "handoffStretcherWest", "handoffStretcherEast"] },
      { title: "接回东院火力组，逐一确认三处翻口与群众名单", ids: ["guideEast", "callZhao", "listenStone", "callXiaoman", "confirmAll"] },
      { title: "封住进烟支路，同时打开未暴露的翻口还击", ids: ["sealBranch"] }
    ],
    interactions: [
      { id: "readBlockade", x: -10.7, layer: "surface", kind: "smoke", verb: "贴地辨烟", name: "敌军从北窑灶缝压入的湿秸烟", startsSmoke: true, sound: "air", caption: "北窑：湿烟开始占满断面；空粮棚假线：封泥后没有回烟", dialogue: [["杜小满", "假线那头只有困在空腔里的死烟，真路封门没漏。进主路的是北窑灶缝；低沟只排水，烟不认沟。"], ["林霞", "人撤到上风清洁段，下风空支路留给烟。谁也不把湿布当成能呼吸的空气。"]] },
      { id: "guideWest", x: -8.1, layer: "surface", kind: "group", verb: "逐户接入", name: "西院老人和孩子", requires: ["readBlockade"], sound: "crowd", dialogue: [["赵平原", "赵家先报，孟家接后；能走的扶墙，担水的人回头报一次名字。民兵留最后，群众不齐不关门。"]] },
      { id: "openSmokeVent", x: -1.6, layer: "tunnel", kind: "smokeVent", verb: "压席落闸", name: "旧砖基下的防烟门", requires: ["guideWest"], sound: "air", caption: "湿席与封泥减慢漏烟；清洁侧木面继续传敲，烟压仍在上升", dialogue: [["魏根生", "门板还托着砖基，不能拆。湿席只争几息；贴清洁侧木面听回敲，人一齐就落最后一楔。"]] },
      { id: "guideStretcher", x: .6, layer: "surface", kind: "stretcher", verb: "插入预存短把", name: "中弹民兵的短把担架", requires: ["openSmokeVent"], sound: "wood", dialogue: [["石头", "短把是试路时留在套口边的。前端插稳、旧绳系紧，伤员不换担架也能过弯。"], ["林霞", "我压湿布，它只能争时间。伤口靠上风侧，别让担架堵住民兵回撤线。"]] },
      { id: "handoffStretcherWest", x: 2.65, layer: "tunnel", kind: "stretcher", verb: "西弯逐端换肩", name: "高踏板前的两名接应民兵", requires: ["guideStretcher"], sound: "crowd", caption: "身后：烟线压到旧砖转角；脚下低沟仍只排渗水，前肩接稳后后肩才松", dialogue: [["林霞", "魏师傅守楔不动梁。前肩报稳，后肩才松；担架过去，翻口射手再换位。"]] },
      { id: "handoffStretcherEast", x: 6.75, layer: "tunnel", kind: "stretcher", verb: "东弯逐端再换", name: "一肩宽转弯位的石头与东院接应员", requires: ["handoffStretcherWest"], sound: "wood", caption: "短把越过垫高踏板；烟线仍在逼近，换肩没有让烟变少", dialogue: [["石头", "别松，我先接后肩。一步、停；再一步——过旧水印再换手。"], ["伤员", "我撑得住……后头孩子应过没有？别为我漏下一家。"]] },
      { id: "guideEast", x: 8.1, layer: "surface", kind: "group", verb: "接回火力组", name: "东院最后一处地面射击组", requires: ["handoffStretcherEast"], shelteredTask: true, sound: "knock", caption: "东侧：两短一长得到射手本人回应", dialogue: [["东院民兵", "两短一长听清了。群众已进安全段，射手和弹药都从东翻口回来了。"], ["高传宝", "别守死一个口。下一轮从西翻口出，东口关灯听脚步。"]] },
      { id: "callZhao", x: -5.8, layer: "tunnel", kind: "listen", verb: "确认西翻口", name: "西翻口后的高传宝", requires: ["guideEast"], sound: "crowd", caption: "西侧听孔：高传宝本人回应", dialogue: [["林青禾", "西翻口？"], ["高传宝", "在。射手两人，翻口木销完整；等另外两处齐了再开。"]] },
      { id: "listenStone", x: 4.8, layer: "tunnel", kind: "listen", verb: "等东侧尾音", name: "护送伤员的石头", requires: ["guideEast"], sound: "knock", caption: "中央无声；东弯传来担架停顿与两下轻敲", dialogue: [["林青禾", "担架组？……先别开口，听东弯。"], ["石头", "东弯已过，在！刚才嘴里咬着绳，答不出声。"]] },
      { id: "callXiaoman", x: .1, layer: "tunnel", kind: "signal", verb: "确认群众段", name: "守着群众名单的林霞", requires: ["guideEast"], sound: "knock", caption: "听瓮旁：林霞亲口回应", dialogue: [["林青禾", "群众段？"], ["林霞", "在。西院、东院和伤员都齐，清洁风路没有漏一户。"]] },
      { id: "confirmAll", x: 7.45, layer: "tunnel", kind: "ledger", verb: "合上名册", name: "三处翻口与群众段的确认", requires: ["callZhao", "listenStone", "callXiaoman"], sound: "paper", dialogue: [["林青禾", "西翻口、担架组、群众段都由本人回敲。名单齐，未暴露的东南翻口可以开。"]] },
      { id: "sealBranch", x: 9.1, layer: "tunnel", kind: "seal", verb: "封烟开口", name: "进烟支路的最后木楔与东南翻口", requires: ["confirmAll"], sound: "brace", caption: "进烟支路被截断；另一侧翻口同时抬起，民兵从敌军背后还击", dialogue: [["魏根生", "烟到转角，最后一楔落下。承重门板不动，已经进来的旧烟仍沿清洁风路慢慢散。"], ["高传宝", "东南翻口开。打一枪换一个位置，地上地下轮着打，让山田找不到一条能堵死的线。"]] }
    ],
    quote: "山田纠集数个据点报复，却始终无法把高家庄民兵堵在一个洞口；翻口在他背后一次次打开。",
    cost: "北窑进烟支路被永久封住，一名民兵负伤；群众名单完整，主地道与三处翻口仍可作战。",
    outro: [["旁白", "报复队撤出高家庄时，烧焦的灶台下仍传来换岗敲声。村里没有欢呼，先把伤员、群众和每一道木门重新点过一遍。"]]
  },
  {
    act: "第三幕 · 高家庄到黑风口",
    number: "第六章",
    shortNumber: "陆",
    title: "从西平到黑风口",
    date: "一九四三年秋 · 战略反击",
    location: "高家庄 · 野外联防地道 · 西平 · 黑风口",
    surfaceTint: "#b5c3bd",
    tunnelTint: "#a0805e",
    wash: "radial-gradient(ellipse at 51% 44%, transparent 40%, rgba(24,27,24,.2) 88%), linear-gradient(180deg, rgba(74,104,117,.08), rgba(97,69,35,.12))",
    startX: -10.5,
    entrances: [-10, 0, 10],
    coverZones: [[-10.8, -9.2], [-8.1, -6.35], [-2.8, -.75], [4.85, 6.55]],
    threat: true,
    intro: [
      ["旁白", "高家庄守住以后，地道从院落伸向野外，又和邻村一段段接上。藏身洞变成战斗地道，战斗地道开始连成联防网。"],
      ["赵平原", "西平围点、黑风口打援。先让高家庄、野外出口和邻村交通口逐站回敲，再断电话、卡住援军。"],
      ["林霞", "山本没有按原路增援西平，正带一队人偷袭高家庄解围。我们必须同时守庄、接应主力，并从地下抄到黑风口背后。"]
    ],
    objectives: [
      { title: "把村内地道延伸到野外与邻村，接成三点联防短环", ids: ["extendElmRoute", "braceMulberryBreak", "openReedBypass"] },
      { title: "逐站校准高家庄、野外出口和西平交通口的回敲与风灯", ids: ["relayElm", "relayMulberry", "relayReed"] },
      { title: "断开据点电话，截住偷袭高家庄的车队，为围点打援争出缺口", ids: ["watchLinePatrol", "cutLine", "openPrisonCart", "seatWuStretcher", "freeNeighbors", "identifySeedBags", "pairSeedCarriers", "recoverGrain"] },
      { title: "等齐高家庄民兵、游击队与八路军主力的真人回应，打开黑风口背后出口", ids: ["waitElmTail", "hearMulberryGap", "confirmReedTail", "returnSignal"] }
    ],
    interactions: [
      { id: "extendElmRoute", x: -8.75, layer: "tunnel", kind: "brace", verb: "接上野外段", name: "从高家庄院落伸向庄稼地的第一段", sound: "brace", caption: "新梁越过旧水线，地道第一次离开院墙", dialogue: [["赵婶", "村里能借的门板和枣木都刻在梁背。谁接班都知道哪户出了什么，不能挖到野外就忘了村里。"], ["旁白", "白天藏土藏木，夜里每户只挖一更。高家庄的高踏板一点点越过院墙。"]] },
      { id: "braceMulberryBreak", x: 0, layer: "tunnel", kind: "brick", verb: "清砖加撑", name: "连接邻村交通口的塌方空腔", requires: ["extendElmRoute"], sound: "earth", caption: "左路继续落土；右路短撑接到邻村交通员值守的下一短湾", dialogue: [["魏根生", "左路塌死就别硬掏。右路先等交通员本人回敲，再看墙缝细灰往哪边走；两道短撑只接到有人守的下一短湾。"], ["旁白", "村与村、户与户并不是一夜连成。每一段都要有人挖、有人听、有人在另一头等。"]] },
      { id: "openReedBypass", x: 8.65, layer: "tunnel", kind: "duckboard", verb: "铺开芦束", name: "绕向西平与黑风口之间的野外出口", requires: ["braceMulberryBreak"], sound: "water", caption: "高家庄、野外出口与邻村交通口第一次首尾接上", dialogue: [["杜小满", "听瓮只管一墙，出了短湾就等下一站本人回敲。今夜三处先把听位、接应口和遮光灯校准。"], ["高传宝", "出口只开在庄稼和芦苇遮得住的地方。地道网不是一条长洞，是每一站都有人守的路。"]] },
      { id: "relayElm", x: -8.2, layer: "tunnel", kind: "network", verb: "松塞回敲", name: "只管一墙距离的高家庄听瓮", requires: ["openReedBypass"], sound: "knock", caption: "高家庄：两轻、停、一沉由下一站交通员本人重敲", dialogue: [["杜小满", "木塞平时挡风，听时松到刻痕。瓮只管过这一墙；出了短弯，必须等下一站的人亲手重敲。"]] },
      { id: "relayMulberry", x: 0, layer: "tunnel", kind: "network", verb: "等真人回敲", name: "野外塌口两侧的交通员回应", requires: ["openReedBypass"], sound: "knock", caption: "左路仍落土且无人回第二记；右路交通员隔一口气回两下，墙缝细灰向西平侧动", dialogue: [["魏根生", "左边没人回第二下，还有土落；右边是交通员本人回的，墙缝也有一线风。围西平的人走右壁。"]] },
      { id: "relayReed", x: 8.2, layer: "tunnel", kind: "lamp", verb: "短燃验风", name: "西平交通口泥龛里的遮光小灯", requires: ["openReedBypass"], sound: "lamp", caption: "西侧低孔补风、东侧高孔抽风；小焰藏在泥龛内向黑风口侧轻斜，验完即灭", dialogue: [["林霞", "灯只点这一会儿，接应组认清出口就灭；地面不能见火。焰尖朝黑风口，背后出口的风路是通的。"]] },
      { id: "watchLinePatrol", x: -9.35, layer: "surface", kind: "searchlight", verb: "等巡灯折回", name: "黑风口据点外的巡线空当", requires: ["relayElm"], sound: "steps", caption: "巡线灯转过土墙，电话杆背面落进暗处", dialogue: [["高传宝", "不砍杆，只卸瓷瓶接头。远看线路还在，山本就会晚一步发现西平与高家庄都在等他。"]] },
      { id: "cutLine", x: -7.2, layer: "surface", kind: "telephone", verb: "卸开接头", name: "黑风口据点外的电话瓷瓶", requires: ["watchLinePatrol"], requiresBeamAway: 2.4, waitVerb: "等巡灯折回", waitCaption: "巡线灯还照着瓷瓶。贴住木杆背面，等灯影越过土墙。", sound: "metal", caption: "线头垂在杆后：黑风口与外援暂时失联", dialogue: [["高传宝", "线头藏到杆背后。只多争一刻，围西平、守高家庄和主力攻击就能同时落位。"]] },
      { id: "openPrisonCart", x: -1.65, layer: "surface", kind: "rescue", verb: "借锤声卸销", name: "偷袭高家庄车队的头车", requires: ["relayMulberry"], shelteredTask: true, sound: "wood", caption: "车头陷沟，敌兵仍在砸垫石；三道轴销必须藏进锤声", dialogue: [["林霞", "头车卡住，后车就过不了沟。只卸轴销，不碰油箱；让山本以为车还在修，再把游击队从右沟接进来。"]] },
      { id: "seatWuStretcher", x: .35, layer: "surface", kind: "stretcher", verb: "接走伤员", name: "伏在沟沿的游击队向导", requires: ["openPrisonCart"], sound: "cloth", dialogue: [["林青禾", "向导上短担架。能走的贴右沟给后队让口；谁也不单独越过车灯。"]] },
      { id: "freeNeighbors", x: 2.1, layer: "surface", kind: "group", verb: "接入游击队", name: "从右沟抵达的邻村游击队", requires: ["seatWuStretcher"], sound: "crowd", caption: "野外出口：游击队逐名回应，伤员已过第一道门", dialogue: [["游击队长", "人齐，伤员在担架上，头车还装作修轴。我们从右口进下一短湾。"], ["林青禾", "再点一遍。交通员已经本人回敲，过门后直接接黑风口背后出口。"]] },
      { id: "identifySeedBags", x: 5.65, layer: "surface", kind: "proof", verb: "核对标记", name: "高家庄、游击队与主力的三组联络布角", requires: ["relayReed"], sound: "cloth", dialogue: [["林霞", "蓝角是高家庄，双针是游击队，麻绳结是八路军主力。三组标记只管接应，不拿来代替本人回敲。"]] },
      { id: "pairSeedCarriers", x: 7.35, layer: "surface", kind: "group", verb: "两人一组", name: "黑风口背后出口前的爆破与掩护组", requires: ["identifySeedBags"], sound: "crowd", caption: "爆破一人、掩护一人；过出口后再报联络标记", dialogue: [["赵平原", "爆破和掩护两人一组。先断黑风口退路，再接主力；没有真人回敲，谁也不提前开门。"]] },
      { id: "recoverGrain", x: 9.15, layer: "surface", kind: "brick", verb: "送到出口", name: "三组分开的爆破包与信号旗", requires: ["pairSeedCarriers"], sound: "water", caption: "芦苇合拢：爆破组进入遮光灯下，地面不留火光", dialogue: [["高传宝", "高家庄组进了，游击队组进了，主力接应也到位。灯灭，等三站尾音。"]] },
      { id: "waitElmTail", x: -7.8, layer: "tunnel", kind: "network", verb: "等近墙人回全", name: "高家庄听瓮重敲出的守庄组确认", requires: ["cutLine", "freeNeighbors", "recoverGrain"], causalShot: { targetX: -9.2, duration: 1900, foreground: "林青禾按住听瓮，等守庄交通员停一息再落沉敲", background: "高传宝确认偷袭车队被卡住、群众已进主地道，再让近墙交通员重敲", kind: "telephone", depth: "background", caption: "后景逐站接力：高家庄守庄组确认车队被截，近墙交通员重新敲出确认" }, sound: "knock", caption: "高家庄近墙：两记短敲，停一息，再落一记沉敲", dialogue: [["林青禾", "守庄组确认群众和翻口都齐，近墙交通员补出沉敲。山本的偷袭队已被卡在村外。"]] },
      { id: "hearMulberryGap", x: 0, layer: "tunnel", kind: "listen", verb: "等塌口后的真人回应", name: "野外左路落土与右路游击队回敲", requires: ["cutLine", "freeNeighbors", "recoverGrain"], causalShot: { targetX: -.8, duration: 2100, foreground: "杜小满听见左口落土后不再催敲", background: "游击队长从右口回两下，短担架和队伍由交通员接入下一短湾", kind: "stretcher", depth: "foreground", caption: "前景拒绝无人的塌路，后景游击队本人接过伤员" }, sound: "earth", caption: "左口仍落土；右口由游击队长隔一口气回了两下", dialogue: [["杜小满", "左口只有土落，没人回第二下。右口是游击队长本人敲的，伤员和队伍已经过门。"]] },
      { id: "confirmReedTail", x: 7.8, layer: "tunnel", kind: "network", verb: "等两站重敲", name: "西平、野外出口与高家庄逐站接力的主力确认", requires: ["cutLine", "freeNeighbors", "recoverGrain"], causalShot: { targetX: 8.7, duration: 2150, foreground: "魏根生先等西平交通员本人回两下，再等野外出口重新敲给高家庄", background: "八路军主力越过已熄灯的芦口；每过一站，由该站交通员重新确认", kind: "group", depth: "background", caption: "后景逐站重敲：西平先确认，野外出口听齐后重敲，高家庄收到近站新确认" }, sound: "network", caption: "西平先回两下；野外出口听齐后重新敲，高家庄近墙收到主力确认", dialogue: [["魏根生", "西平先回，野外出口接着敲，高家庄最后收尾。主力已到黑风口外，三组可以同时开门。"]] },
      { id: "returnSignal", x: 0, layer: "tunnel", kind: "networkFinal", verb: "听齐再开门", name: "黑风口背后出口的最后一道门", requires: ["waitElmTail", "hearMulberryGap", "confirmReedTail"], causalShot: { targetX: 2.1, duration: 3000, foreground: "林青禾依三处尾音抬起黑风口背后隔断", background: "高家庄民兵、游击队与八路军主力同时越过各自攻击线", kind: "networkFinal", depth: "foreground", caption: "前后景同时接上：守庄、打援与攻坚三线在同一刻展开" }, sound: "network", caption: "高家庄、野外出口、西平：尾音逐站递回，黑风口背后出口打开", dialogue: [["林青禾", "钟楼那夜，我们困在各自的洞里，听不见下一户。现在每一站的尾音都齐了。"], ["高传宝", "守庄组截住山本，游击队卡住援路，主力已到黑风口正面。背后出口开。"], ["赵平原", "围点打援转为总攻。高家庄民兵、游击队和八路军主力一起拔掉黑风口。"]] }
    ],
    quote: "高家庄民兵与八路军主力、游击队并肩作战，拔掉黑风口据点，消灭进犯高家庄的敌人。",
    outro: [["旁白", "天色发白时，黑风口据点失去最后一盏灯。村内藏身洞、战斗地道与野外联防网终于连成同一张路；高老忠敲响的警钟，也在胜利回敲中有了回答。"]]
  }
];

const ui = {};

const ChallengeData = Object.freeze({});

const WorldTaskData = Object.freeze({
  eraseTracks: {
    type: "configuration",
    kicker: "日常痕迹 · 不是扫净泥地",
    title: "让真实晨间劳作盖散单一新线",
    hint: "走到水沟、牲口槽和门槛前逐处判断。只借赵婶原本要做的挑水与喂牲口，不浪费水、不叫孩子出屋，也不改造门槛原有浅印。",
    reversible: true,
    preserveWrongState: true,
    maxDistance: 3.05,
    approachCaption: "先走近水沟、槽边或门槛，再动手接回日常痕迹。",
    approachHint: "没有隔空改脚印：到一处泥地边再按 E / 行动。",
    untouchedCaption: "还有一处泥地没有亲手看过，整片脚印现在还连不成一个普通早晨。",
    untouchedHint: "槽水、牲口和门槛三处都查看过，再回到院门边复看。",
    failureHint: "复看未通过：痕迹仍全部留在泥地上。看水往哪流、蹄印从哪来、门槛原有浅印有没有被动过，只改不对的那一处。",
    adjustHint: "去下一处看方向与深浅能否接成同一个早晨。",
    nodes: [
      {
        id: "waterTrace", xOffset: -2.15, kind: "water", label: "槽水自然洒痕", initial: "swept", correct: "returnPath", sound: "water",
        options: [
          { id: "swept", label: "全扫平", caption: "水沟边干净得没有一滴回程洒水，反而露出刚动过土" },
          { id: "outward", label: "刻意泼向院外", caption: "额外泼水只向院外冲出一条线，既浪费水，也像有人刻意遮过" },
          { id: "returnPath", label: "照常送到槽边", caption: "赵婶原本要挑的槽水在桶沿自然滴落，来回脚位盖散新线，没有多费水" }
        ]
      },
      {
        id: "hoofTrace", xOffset: -.7, kind: "tracks", label: "槽边蹄印", initial: "single", correct: "crossed", sound: "earth",
        options: [
          { id: "single", label: "一列直印", caption: "四枚深蹄印笔直朝灶门去，方向单得像特意盖出来" },
          { id: "reversed", label: "朝圈外退", caption: "后蹄比前蹄深，像牲口倒着离圈，和槽边旧泥不合" },
          { id: "crossed", label: "槽前交叠", caption: "新蹄印踩进昨日浅印，在饮水处自然转身，没有通向灶门" }
        ]
      },
      {
        id: "childTrace", xOffset: 2.2, kind: "tracks", label: "门槛原有浅印", initial: "ordered", correct: "preserved", sound: "steps",
        options: [
          { id: "ordered", label: "扫成一条线", caption: "扫帚把原有停、转和半枚擦痕抹成整齐边缘，反而显出有人动过" },
          { id: "deep", label: "另拿鞋底补印", caption: "新盖的印子深浅一致，是拿孩子鞋当工具做出的假痕；不能这样做" },
          { id: "preserved", label: "绕开原印", caption: "门槛前原有的浅印、停步和擦痕保持原样；孩子留在屋内，不参与伪装" }
        ]
      }
    ],
    verify: { xOffset: .75, kind: "proof", label: "隔柴垛复看泥地", sound: "steps", success: "真实槽水与蹄印盖散了单一新线，门槛原有浅印没有被改造；孩子仍安全留在屋内。" }
  },
  turnMill: {
    type: "holdSequence",
    kicker: "磨声掩护 · 院内原声",
    title: "慢推半圈，停一息，再推",
    hint: "按住 E / 行动慢推，轴声起后松手；停一息再继续。磨声只能遮脚步，不能遮住人。",
    sheltered: true,
    failSuspicion: .08,
    failCaption: "磨盘推得太齐，院门脚步停了一下。别抢拍，从第一圈重新来。",
    pulses: [
      { label: "慢推第一圈", holdMin: .48, holdMax: 1.24, sound: "mill" },
      { label: "停后续推", holdMin: .48, holdMax: 1.24, restMin: .55, restMax: 1.5, sound: "mill" },
      { label: "错开再推", holdMin: .42, holdMax: 1.18, restMin: .42, restMax: 1.38, sound: "mill" }
    ]
  },
  airflowTest: {
    type: "configuration",
    kicker: "跨院验收 · 风塞与真灯焰",
    title: "三盏灯只说结果",
    hint: "先走到三处看偏焰与黑烟，再逐处调一档；最后回验三盏灯。线索只在灯焰和黑烟里。",
    maxDistance: 4.25,
    nodes: [
      {
        id: "hearth", xOffset: -2.25, kind: "vent", label: "灶下风塞", initial: "closed", correct: "half", sound: "wood",
        options: [
          { id: "closed", label: "封死", caption: "灶下无补气：近灯缩成豆点，洞顶黑烟不走" },
          { id: "half", label: "留半口", caption: "近灯重新立起，烟线缓慢贴向北壁" },
          { id: "open", label: "全开", caption: "灶烟被猛风拖回主路，第三盏灯先黑了" }
        ]
      },
      {
        id: "north", xOffset: -.8, kind: "air", label: "北侧清风孔", initial: "closed", correct: "open", sound: "air",
        options: [
          { id: "closed", label: "封住", caption: "北端没有细风，远灯的焰尖向灶口倒伏" },
          { id: "half", label: "留半口", caption: "远灯抬起一半，转弯后的第二盏仍左右抖" },
          { id: "open", label: "全开", caption: "北壁细风贯进来，三处焰尖开始朝同一方向轻斜" }
        ]
      },
      {
        id: "wick", xOffset: .8, kind: "lamp", label: "验风灯芯", initial: "high", correct: "low", sound: "lamp",
        options: [
          { id: "high", label: "挑高", caption: "焰尖窜高并冒黑烟，看不清微弱风向" },
          { id: "low", label: "压低", caption: "小焰收短，细小偏转终于能看清" },
          { id: "out", label: "熄灭", caption: "灯灭以后没有方向可验，只有洞顶黑烟还在" }
        ]
      }
    ],
    verify: { xOffset: 2.25, kind: "proof", label: "回验三盏灯", sound: "lamp", success: "三盏小焰依次向北轻斜后立稳；烟没有回到主路。" }
  },
  stabilizeWetBand: {
    type: "placement",
    kicker: "湿砂土工 · 可取回重摆",
    title: "让梁、水、担架各走各的路",
    hint: "三件实物都能抬回重摆。先看短实干土、右下滴水、旧水印与一肩宽转弯，再到空担架处回验。",
    reversible: true,
    preserveWrongState: true,
    maxDistance: 5.25,
    pieces: [
      {
        id: "frame", xOffset: -4.35, kind: "brace", label: "三片连续矮框", correctSocket: "dryBank",
        constraints: ["loadOnDrySoil"], sound: "brace", pickupCaption: "矮框抬起：柱脚必须把重量交给短实干土"
      },
      {
        id: "drain", xOffset: -2.9, kind: "water", label: "短柄铲出的低沟", correctSocket: "wetLowSide",
        constraints: ["keepWalkwayDry"], sound: "water", pickupCaption: "低沟土样抬起：沟底要低于滴水口，也不能截断人行中线"
      },
      {
        id: "treads", xOffset: -1.45, kind: "duckboard", label: "转弯木踏板", correctSocket: "raisedTurn",
        constraints: ["aboveWaterline", "leaveShoulderClearance"], sound: "wood", pickupCaption: "踏板抱起：板面要越过旧水印，东弯还得留一肩换手"
      }
    ],
    sockets: [
      {
        id: "dryBank", xOffset: 0, kind: "soil", label: "左肩短实干土",
        responses: {
          frame: "矮框一框接一框咬进干土，重量绕开湿砂",
          drain: "沟底高过右侧滴水口，水留在湿砂脚下",
          treads: "板能立住，但它离旧水印和东弯换肩位都太远"
        }
      },
      {
        id: "wetLowSide", xOffset: 1.45, kind: "water", label: "右下渗水低侧",
        responses: {
          frame: "柱脚扎进湿砂后缓慢下沉，梁木发出长呻吟",
          drain: "滴水顺右下低沟离开，中间土脊完整留给脚和担架",
          treads: "板面很快吃水，湿泥漫到鞋底"
        }
      },
      {
        id: "raisedTurn", xOffset: 2.9, kind: "duckboard", label: "旧水印上的东弯",
        responses: {
          frame: "木框横住东弯，担架失去一肩宽的换手位",
          drain: "沟截断转弯脚位，抬担架的人只能踩进水里",
          treads: "板面越过旧水印，东弯仍留一肩宽；短担架可以换手"
        }
      }
    ],
    verify: { xOffset: 4.35, kind: "stretcher", label: "让空担架试走", sound: "wood", success: "矮框咬住干土，水走右下低沟；空担架踩高板转弯，仍能在东弯换肩。" }
  },
  arrangeDecoyTraces: {
    type: "configuration",
    kicker: "假入口三痕 · 错处原样保留",
    title: "让便衣自己认出空粮棚假线",
    hint: "先由棚主指出旧绳槽、松钉旧板与废灶芦管，再决定哪些保持、哪些恢复遮蔽。不是一夜做旧；最后从断墙后让高传宝回验。",
    reversible: true,
    preserveWrongState: true,
    maxDistance: 3.55,
    approachCaption: "先走近门石、旧铺板或后墙芦孔，再亲手调整。",
    approachHint: "三处痕迹都在现场，不能隔空摆：靠近一处再按 E / 行动。",
    untouchedCaption: "还有一笔只停在册上，没有落成能经得住复查的现场痕迹。",
    untouchedHint: "门石、旧板与后墙芦孔都亲手试过，再让高传宝从头回验。",
    failureHint: "回验未过：三处状态全部保留。听高传宝停在哪一步，看是距离、声层还是风量不合，只改那一处。",
    adjustHint: "去另外两处听它是否与册上的前后次序相合。",
    nodes: [
      {
        id: "rope", xOffset: -2.35, kind: "well", label: "吊粮袋门石旧槽", initial: "covered", correct: "thirdStep", sound: "cloth",
        options: [
          { id: "covered", label: "仍被泥灰遮住", caption: "旧槽是真的，却被后来泥灰盖平；按册来的人不会在这里停步" },
          { id: "fifthStep", label: "露出第五步旧槽", caption: "这道旧槽也是真的，可第五步已越过册中停点，会把人带向西院旧线" },
          { id: "thirdStep", label: "保留第三步旧槽", caption: "孟嫂确认这道旧槽原本就在第三步，毛边与门石凹口都没有新茬" }
        ]
      },
      {
        id: "echo", xOffset: -.55, kind: "timber", label: "旧板回声", initial: "doubleLoose", correct: "looseNail", sound: "metal",
        options: [
          { id: "doubleLoose", label: "两块松板都露出", caption: "相邻两块旧板回声太密，和册上只记第二块的粗略位置对不上" },
          { id: "tightBoard", label: "旧板钉死", caption: "铜钱只回一声实响，和册上第二块板的层叠声不合" },
          { id: "looseNail", label: "保留原松钉", caption: "铜钱在旧板上先实响一下，原松钉随后拖出一声散响；没有另垫空物" }
        ]
      },
      {
        id: "vent", xOffset: 2.35, kind: "vent", label: "废灶熏黑芦管", initial: "wideFlue", correct: "shallow", sound: "air",
        options: [
          { id: "wideFlue", label: "露出整道旧烟口", caption: "大烟口风量太足，会把复查引到棚后真实旧灶基，也可能要求继续深挖" },
          { id: "deep", label: "接向主风路", caption: "细风变成持续抽气；这会让粮棚假线碰到住户脚下，必须恢复封泥" },
          { id: "shallow", label: "只留原芦管断口", caption: "熏黑断口只发凉、不露新茬；微风止在空粮棚盲道顶层" }
        ]
      }
    ],
    verify: { xOffset: .9, kind: "proof", label: "让高传宝按侦察步序回验", sound: "paper", success: "第三步吊粮旧槽、旧板一实一散的粗响与废灶一线浅风依次对上；三处本来就属于这座旧棚。" }
  },
  verifyDecoy: {
    type: "stations",
    kicker: "敌方复查 · 地上地下换位",
    title: "跟住三处复查，不让目光落在你身上",
    hint: "先贴住断墙，只听近处指节是否在第三步旧槽停下；后两段等这一声确认后再走。",
    allowDepthTransitions: true,
    localRecovery: true,
    failSuspicion: .06,
    maxDistance: 6.9,
    nodes: [
      {
        id: "brokenWall",
        xOffset: 0,
        layer: "surface",
        kind: "listen",
        verb: "断墙听吊粮旧槽",
        caption: "断墙只隔着粮棚前院：便衣指节顺过第三步旧槽，脚步停了一次",
        sound: "cloth",
        recoveryXOffset: -.35,
        recoveryLayer: "surface",
        recoveryCaption: "复查者回头了。贴回断墙阴影，等指节重新落到旧槽。",
        nextHint: "旧槽已经对上。向右到粮棚东侧芦席下的伪装入口按 S 下行，再伏低靠近侧向厚土盲道。"
      },
      {
        id: "lateralBlind",
        xOffset: 1.9,
        layer: "tunnel",
        kind: "timber",
        verb: "伏进侧向厚土盲道",
        requiresCrouch: true,
        crouchPath: { minOffset: 1.35, maxOffset: 1.9 },
        waitDuration: 1.35,
        waitStartSound: "knock",
        waitingHint: "伏住别动：先等铜钱的实响，再等原松钉把散声拖完。",
        caption: "盲道横开一墙，不在复查者脚下；铜钱先敲出一声实响，原松钉随后拖出散响，脚步仍停在空棚内",
        sound: "metal",
        recoveryXOffset: 1.15,
        recoveryLayer: "tunnel",
        recoveryCaption: "衣角擦下细土。退回厚土侧壁伏住，等旧板声散开再靠近。",
        transitionHint: "当前要到地下：回粮棚东侧芦席下的伪装入口按 S 下行，再按住蹲伏靠近白灰环。",
        nextHint: "一实一散已经听全。回到同一入口按 S 上行，再伏低走向右侧废灶观察缝。"
      },
      {
        id: "stoveSlit",
        xOffset: 6,
        layer: "surface",
        kind: "proof",
        verb: "伏到废灶缝等信号",
        requiresCrouch: true,
        crouchPath: { minOffset: 1.45, maxOffset: 6 },
        waitDuration: 1.1,
        waitingHint: "伏在灶沿下别动：等芦管浅风停住，再看便衣是否转向空粮棚。",
        caption: "芦管断口只发凉、不续风；透过灶缝，便衣等铜钱停稳，随即转向空粮棚假入口",
        sound: "air",
        recoveryXOffset: 1.35,
        recoveryXOffsets: [1.35, 3.35, 5.35],
        recoveryCoverRadius: .34,
        recoveryLayer: "surface",
        recoveryCaption: "灶沿外露出肩背。退回残墙阴影，伏低等浅风和册角同时出现。",
        transitionHint: "当前要回到地面：从粮棚东侧芦席下的伪装入口按 S 上行，再伏低走到右侧废灶观察缝。"
      }
    ]
  },
  shadowSteps: {
    type: "stations",
    kicker: "地下跟听 · 左右墙实际走位",
    title: "左右听全，把侦察步序带给高传宝",
    hint: "先贴左壁听便衣停步，再贴右壁排除井水闷声；回到中间把两段次序记在土墙上。",
    maxDistance: 4.1,
    nodes: [
      { xOffset: -1.55, kind: "listen", verb: "贴左壁等三步", caption: "左壁先空后碎；第三次敲击时，头顶脚步停在西门槛", sound: "knock" },
      { xOffset: 1.55, kind: "water", verb: "贴右壁排井声", caption: "右壁低闷后滴水；头顶脚步没有停，也没有门槛回震", sound: "water" },
      { xOffset: 0, kind: "ledger", verb: "记下侦察步序", caption: "西门槛停步、井台不停步；两段声纹带去让高传宝核对", sound: "paper" }
    ]
  },
  chooseDecoySite: {
    type: "evidence",
    kicker: "高传宝复盘 · 三处现场定址",
    title: "哪一处能把便衣带离人和真入口",
    hint: "白垩、铜钱与风孔的侦察次序已经说清。亲自走到一处定址；落错会让便衣更警觉，证据不会丢。",
    choiceLabel: "确认假入口落点",
    listenPrompt: "侦察次序已经听清",
    readyPrompt: "在三处位置中定址",
    wrongHint: "高传宝指出这处会牵连日常脚印或领回真线；三段侦察次序都还记着，换一处定。",
    maxDistance: 4.1,
    listens: [],
    choices: [
      { id: "west", xOffset: -2.7, kind: "tracks", label: "西门槛", caption: "高传宝：这里贴着真入口，再摆参照只会把便衣领回西院", sound: "steps" },
      { id: "well", xOffset: 0, kind: "well", label: "井台", caption: "高传宝：每天挑水的人都会经过，假痕会把一家家的脚印变成嫌疑", sound: "water" },
      { id: "granary", xOffset: 2.7, kind: "decoy", label: "空粮棚", correct: true, caption: "高传宝：空屋不住人，旧砖基能回出他寻找的空响；就把便衣领到这里", sound: "earth" }
    ],
    readyFeedback: "高传宝已经把侦察次序复盘清楚。走到一处位置作最后核对。"
  },
  guideWest: {
    type: "stations",
    kicker: "报复扫荡 · 先接群众",
    title: "看清车灯，再转身接西院",
    hint: "先到坡口确认敌军车灯继续压向村口，再回西院门帘前逐户报到。",
    maxDistance: 2.8,
    nodes: [
      { xOffset: 1.05, kind: "listen", verb: "听车队压近", caption: "引擎与脚步沿村口土路逼近，西院只剩最后一段撤离时间", sound: "steps" },
      { xOffset: -.1, kind: "tracks", verb: "转身离开坡口", caption: "不追车灯，沿墙影折回西院接群众", sound: "steps" },
      { xOffset: -1.05, kind: "group", verb: "回头逐名报到", caption: "赵家先报，孟家接后；老人、孩子与担水人逐名回应", sound: "crowd" }
    ]
  },
  openSmokeVent: {
    type: "configuration",
    kicker: "湿烟逼近 · 临时缓烟封缝",
    title: "只争几息，不把湿席当安全空气",
    hint: "四处都能反复调整。湿席与黏土只减慢漏烟；点名改贴清洁侧门板听传敲，不再为听声开一道漏烟孔。",
    maxDistance: 3.65,
    nodes: [
      {
        id: "mat", xOffset: -2.9, kind: "water", label: "旧草席", initial: "dry", correct: "wet", sound: "water",
        options: [
          { id: "dry", label: "干席", caption: "干席边缘卷起，湿烟从草缝钻过" },
          { id: "wet", label: "用预留杂用水浸透", caption: "预留的洗物杂用水浸透席边，草纤维贴紧；它只能延缓烟，不能滤出安全空气" }
        ]
      },
      {
        id: "seam", xOffset: -1.45, kind: "smokeVent", label: "门板上缝", initial: "open", correct: "mat", sound: "cloth",
        options: [
          { id: "open", label: "敞着", caption: "烟线越过门板上沿，向担架路压来" },
          { id: "mat", label: "压席", caption: "席边压上缝；承重门板仍托着旧砖" }
        ]
      },
      {
        id: "edges", xOffset: 1.45, kind: "seal", label: "门板两边", initial: "open", correct: "sealed", sound: "earth",
        options: [
          { id: "open", label: "未封", caption: "两侧仍吐细烟，整段烟线继续向有人支路扩散" },
          { id: "sealed", label: "湿土封边", caption: "两侧湿黏土压实，漏烟减慢；排水低沟没有被堵住" }
        ]
      },
      {
        id: "listen", xOffset: 2.9, kind: "listen", label: "清洁侧门板传声木面", initial: "closed", correct: "open", sound: "knock",
        options: [
          { id: "closed", label: "厚席连木面一起盖住", caption: "烟慢了一点，门板传来的敲击也被厚席闷没了" },
          { id: "open", label: "只露传声木面", caption: "封缝仍闭合，只把清洁侧门板木面露给耳朵；人名可由传敲确认，没有敞孔" }
        ]
      }
    ],
    verify: { xOffset: 0, kind: "proof", label: "看烟线并贴门板试点名", sound: "crowd", success: "湿席压上缝、湿土封两边，漏烟只是减慢；清洁侧门板仍能传敲，整段没有另开听孔。" }
  },
  handoffStretcherWest: {
    type: "stations",
    kicker: "西弯换肩 · 一端稳再松一端",
    title: "前肩接稳，后肩再松",
    hint: "在狭窄弯位前后移动，按现场位置逐端交手。",
    maxDistance: 2.4,
    nodes: [
      { xOffset: -.62, kind: "group", verb: "西口接稳前肩", caption: "前肩接应员先报稳，担架落在高踏板外；石头仍没有松后把", sound: "crowd" },
      { xOffset: .58, kind: "brace", verb: "梁侧接稳后肩", caption: "魏根生守着已经补实的梁楔；后肩报稳以后，原抬手才松", sound: "wood" },
      { xOffset: 0, kind: "stretcher", verb: "送过西弯", caption: "短把担架不碰低沟，西弯换肩完成", sound: "wood" }
    ]
  },
  handoffStretcherEast: {
    type: "stations",
    kicker: "东弯换肩 · 烟压下复用",
    title: "一步，停；再一步",
    hint: "先稳墙侧，再换后肩，最后从粉笔肩线中间送过。",
    maxDistance: 2.5,
    nodes: [
      { xOffset: .66, kind: "brace", verb: "贴墙稳住两端", caption: "担架外沿贴住干壁，脚下低沟只走渗水；槐生仍握前肩，广田仍握后肩", sound: "wood" },
      { xOffset: -.64, kind: "group", verb: "石头接住后肩", caption: "石头报稳并接住后肩；广田确认以后才沿右壁退开", sound: "crowd" },
      { xOffset: 0, kind: "stretcher", verb: "两步过弯", caption: "一步、停；再一步——短把越过旧水印", sound: "wood" }
    ]
  },
  guideEast: {
    type: "holdSequence",
    kicker: "东院火力组 · 墙内亲手回敲",
    title: "两短一长，等本人回应",
    hint: "短按、短按、长按 E / 行动；每一记都从墙内真实发出。",
    sheltered: true,
    failCaption: "这一记与听瓮里的原声不合。停一下，从第一记重新回敲。",
    pulses: [
      { label: "第一记短敲", holdMin: .06, holdMax: .36, sound: "knock" },
      { label: "第二记短敲", holdMin: .06, holdMax: .36, restMin: .12, restMax: .92, sound: "knock" },
      { label: "第三记长敲", holdMin: .52, holdMax: 1.42, restMin: .16, restMax: 1.05, sound: "knock" }
    ]
  },
  openPrisonCart: {
    type: "holdSequence",
    kicker: "偷袭头车 · 垫石锤声掩护",
    title: "三次锤落，三道轴销",
    hint: "敌兵每次砸垫石时按住 E / 行动卸一段；锤声一停就松手，别让撬木声单独露出来。",
    sheltered: true,
    failSuspicion: .12,
    failCaption: "撬木声落在锤声外，修车敌兵停手回望。伏住不动，等下一轮锤声。",
    pulses: [
      { label: "第一锤 · 松外销", holdMin: .18, holdMax: .58, sound: "wood" },
      { label: "第二锤 · 退中销", holdMin: .2, holdMax: .62, restMin: .42, restMax: 1.35, sound: "wood" },
      { label: "第三锤 · 托住轴套", holdMin: .36, holdMax: .9, restMin: .42, restMax: 1.35, sound: "wood" }
    ]
  },
  relayElm: {
    type: "holdSequence",
    kicker: "高家庄听瓮 · 一墙短距回敲",
    title: "两轻，停一息，再落一记沉的",
    hint: "先把平时挡风的木塞松到听位。轻按两次、停一息，再按住落一记沉敲；墙后必须由下一站交通员本人回应。",
    sheltered: true,
    failCaption: "节奏挤在一起，墙后的交通员没有确认。木塞仍在听位；停一下，从第一记重新回敲。",
    pulses: [
      { label: "第一记短轻敲", holdMin: .06, holdMax: .34, sound: "knock" },
      { label: "第二记短轻敲", holdMin: .06, holdMax: .34, restMin: .16, restMax: .82, sound: "knock" },
      { label: "停后长沉敲", holdMin: .5, holdMax: 1.28, restMin: .42, restMax: 1.28, sound: "network" }
    ]
  },
  relayMulberry: {
    type: "evidence",
    kicker: "野外塌口 · 等交通员本人回应",
    title: "哪一侧还有人在接下一站",
    hint: "先到左口听落土与回应，再到右口等交通员本人回敲。微风和灰尘只作辅证，哪边有人接应才决定路线。",
    choiceLabel: "为围点组定一侧",
    listenPrompt: "先贴左右两壁听同一轮敲击",
    readyPrompt: "两侧都听过，走到一侧定路",
    wrongHint: "左侧只有落土、没有交通员回第二记；两边情况已经听清，不必重听，换到有人本人回应的一侧。",
    maxDistance: 3.3,
    listens: [
      { id: "leftListen", xOffset: -1.35, kind: "brick", label: "到左口等回应", caption: "第一记以后只有碎土落下；约定的第二记没有人回，左路仍在松动", sound: "earth" },
      { id: "rightListen", xOffset: 1.35, kind: "listen", label: "到右口等交通员", caption: "隔一口气，交通员本人回了两下；墙缝细灰同时向西平侧移动", sound: "knock" }
    ],
    choices: [
      { id: "leftRoute", xOffset: -2.55, kind: "brick", label: "左侧原路", caption: "左侧无人回约定的第二记，碎土还在落；队伍不能送进无人接应的塌口", sound: "earth" },
      { id: "rightRoute", xOffset: 2.55, kind: "network", label: "右侧交通员接应口", correct: true, caption: "交通员本人回了两下，墙缝细灰也向西平侧动；围点组由他接进下一短湾", sound: "network" }
    ],
    readyFeedback: "两侧都等过了。走到有交通员本人回应、且没有继续落土的一侧。"
  },
  relayReed: {
    type: "configuration",
    kicker: "西平交通口 · 泥龛灯短燃验风",
    title: "地下看得见风，地面看不见火",
    hint: "东侧高位出风口、西侧低位补风孔与灯芯都能反复调。最后到芦口外回看；验风后灯会熄灭，人员通过时不留明火。",
    preserveWrongState: true,
    maxDistance: 3.85,
    approachCaption: "先走近东芦孔、西湿孔或灯罩，再调整风量与灯芯。",
    approachHint: "靠近实物再动手；地面是否看见火，要从芦口外侧回验。",
    untouchedCaption: "还有一处没有亲手调过；只改灯芯或只开风孔，都看不清整条风路。",
    untouchedHint: "东芦孔、西湿孔和灯芯都调过，再到芦口外回看。",
    failureHint: "回看未过：当前风口与灯芯状态全部保留。看倒焰、黑烟和罩外漏光，只改不合的一处。",
    adjustHint: "去下一处看小焰怎样改变方向、黑烟与罩外漏光。",
    nodes: [
      {
        id: "eastVent", xOffset: -1.65, kind: "vent", label: "东侧高位出风口", initial: "closed", correct: "open", sound: "air",
        options: [
          { id: "closed", label: "封住", caption: "高位出风端被堵，小焰缩短并在泥龛里积黑烟" },
          { id: "half", label: "留半口", caption: "出风不足，焰尖偶尔向东，却又被潮气压回" },
          { id: "open", label: "打开", caption: "高位端把气流引向东侧，小焰稳定向东轻斜" }
        ]
      },
      {
        id: "westVent", xOffset: 0, kind: "water", label: "西侧低位补风孔", initial: "open", correct: "half", sound: "water",
        options: [
          { id: "open", label: "全开", caption: "补风太猛，灯焰左右抽动，芦叶也从地面可见地摇" },
          { id: "half", label: "留半口", caption: "低位补风稳定进入，气流再由东侧高位口带走" },
          { id: "closed", label: "封死", caption: "没有补风，小焰缺氧缩黑，不能再用来判断方向" }
        ]
      },
      {
        id: "wick", xOffset: 1.65, kind: "lamp", label: "遮光灯芯", initial: "high", correct: "low", sound: "lamp",
        options: [
          { id: "high", label: "挑出罩口", caption: "焰光越过灯罩，把芦梢从地面照亮" },
          { id: "low", label: "压到泥龛罩下", caption: "小焰只在验风时藏在罩内，地下能看出偏向，地面只剩暗芦影" },
          { id: "out", label: "完全熄灭", caption: "地面没有光，地下也失去风向与换手位置" }
        ]
      }
    ],
    verify: { xOffset: 3.1, kind: "proof", label: "到芦口外侧回看并熄灯", sound: "wind", success: "西侧低孔稳定补风，东侧高孔出风；小焰在泥龛罩内向东轻斜，地面看不见火，验完随即熄灭。" }
  },
  returnSignal: {
    type: "evidence",
    kicker: "三路合击 · 黑风口背后隔断",
    title: "三处尾音已齐，辨缺拍再开路",
    hint: "高家庄守庄组已回敲、野外左路无人回应、西平交通口回了两记；从三条路里打开与真人逐站回应和风向都相合的一条。",
    choiceLabel: "打开一条路",
    listenPrompt: "三处尾音已经听清",
    readyPrompt: "在三条路中开一条",
    wrongHint: "这条路与三站真人回应和风向对不上；已经确认的人声都还记着，换一条判断。",
    maxDistance: 4.15,
    listens: [],
    choices: [
      { id: "collapsed", xOffset: -2.75, kind: "brick", label: "野外塌路", caption: "左口仍落土且无人回应；开这道门会把队伍送回塌口", sound: "earth" },
      { id: "surface", xOffset: 0, kind: "tracks", label: "据点正面土路", caption: "正面土路没有交通员逐站回应，巡线人回头就能看见脚印", sound: "steps" },
      { id: "reedBypass", xOffset: 2.75, kind: "networkFinal", label: "黑风口背后出口", correct: true, caption: "西平交通员本人回了两记，高位出风口方向也相合；隔断从内侧无声抬起", sound: "network" }
    ]
  }
});

const PrologueBeatData = Object.freeze([
  {
    id: "preface",
    duration: 7200,
    kicker: "序章 · 一九四二年五月",
    title: "扫荡压向冀中平原",
    caption: "远处 · 据点、封锁沟与成排脚步把夜色一层层压低"
  },
  {
    id: "infiltration",
    duration: 11800,
    kicker: "黑风口方向 · 深夜",
    title: "偷袭队绕过村外岗哨",
    caption: "麦秸后先出现枪刺，脚步却被布条和软土压住"
  },
  {
    id: "alarm",
    kicker: "高家庄钟楼",
    title: "赶到钟下，替高老忠解开钟绳",
    actionX: -7.35
  },
  {
    id: "sacrifice",
    duration: 10400,
    kicker: "钟楼近景",
    title: "钟声响起，高老忠倒在钟绳旁",
    caption: "第一声穿过屋脊；第二声叫醒全村；枪声截断了第三次摆动"
  },
  {
    id: "evacuate",
    kicker: "高家庄西院",
    title: "趁钟声把老幼送入各家藏身洞",
    actionX: -1.35
  },
  {
    id: "seal",
    kicker: "单口旧洞",
    title: "等最后一人下去，合上门板",
    actionX: 2.55
  },
  {
    id: "search",
    duration: 17200,
    kicker: "地上与地下",
    title: "敌人找到洞口，藏身洞无路可退",
    caption: "地上 · 枪托砸开伪装；地下 · 烟、土与哭声堵在同一个尽头"
  },
  {
    id: "aftermath",
    kicker: "天亮以后",
    title: "高老忠留下的钟声",
    lines: [
      ["旁白", "火灭以后，高老忠留在钟楼下；各家的旧洞有的塌了，有的被烟逼开。能藏住一屋人的洞，挡不住下一次偷袭。"],
      ["赵平原", "往后的形势只会更加困难。先把人接回来，再把藏身洞改成能打仗的地道。"],
      ["高传宝", "钟声不能白响。高家庄从今天起，地上有人守，地下也要有路。"]
    ]
  }
]);

const EpilogueBeatData = Object.freeze([
  {
    id: "bellMemorial",
    x: -9.55,
    sound: "metal",
    lines: [["高传宝", "老忠叔，钟声传到黑风口了。你叫醒的高家庄，已经能从地下走到敌人背后。"]]
  },
  {
    id: "sealedSmokeBranch",
    x: -5.95,
    sound: "brace",
    lines: [["魏根生", "北窑进烟这条支路永远封着。留下它，不是记一场胜负，是让后来换岗的人知道烟从哪里夺过路。"]]
  },
  {
    id: "threeForces",
    x: -1.55,
    sound: "crowd",
    lines: [["赵平原", "高家庄民兵守住村口，游击队卡住援路，主力拿下正面。三支队伍是在同一张地道网上会合的。"]]
  },
  {
    id: "blackWindDark",
    x: 2.15,
    sound: "network",
    lines: [["林霞", "黑风口最后一盏灯灭了。西平的枪声也停了——这一次，高家庄没有被关进一条死洞。"]]
  },
  {
    id: "connectedNetwork",
    x: 8.35,
    sound: "network",
    lines: [["石头", "传宝哥，这回地道通到哪儿？"], ["高传宝", "通到下一户、下一个村，也通到每个愿意回敲的人。"]]
  }
]);

const gameState = {
  renderer: null,
  scene: null,
  camera: null,
  clock: new THREE.Clock(),
  world: {},
  player: null,
  chapterIndex: 0,
  completed: new Set(),
  markers: new Map(),
  chapterActive: false,
  paused: true,
  inDialogue: false,
  dialogueQueue: [],
  dialogueDone: null,
  dialogueSource: null,
  dialogueIndex: 0,
  dialogueUsesBars: false,
  pendingDialogue: null,
  challenge: null,
  worldTask: null,
  crouchPathFailures: new Set(),
  currentLayer: "surface",
  depthBlend: 0,
  depthTransition: null,
  carry: false,
  heldProp: null,
  heldPropKind: "",
  noiseCover: 0,
  smokePressure: 0,
  lastSmokeSafeX: -10.6,
  suspicion: 0,
  lastSafeX: -10.6,
  cameraX: 0,
  cameraY: -0.5,
  cameraZoom: 1,
  cameraShot: null,
  cameraShake: 0,
  epilogue: false,
  prologue: null,
  epilogueBeats: new Set(),
  keys: { left: false, right: false, crouch: false, listen: false },
  touch: false,
  currentPrompt: null,
  promptSignature: "",
  vignetteOpacity: -1,
  markerTick: -1,
  lastCaptionTime: 0,
  fpsSamples: [],
  resizeFrame: 0,
  unlockedChapter: 0,
  savedProgress: null,
  progressLoaded: false,
  chapterPhase: "title",
  chapterEnding: false,
  smokeDecayCinematic: false,
  settings: { captions: true, reduceMotion: false, highContrast: false, volume: .72 },
  audio: null,
  lastFrameTime: performance.now()
};

class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.music = null;
    this.ambience = null;
    this.depthFilter = null;
    this.windSource = null;
    this.drone = [];
    this.started = false;
    this.muted = false;
    this.volume = .72;
    this.chapter = 0;
    this.lastPulse = 0;
  }

  async Start() {
    if (this.started) {
      if (this.context?.state === "suspended") await this.context.resume();
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    this.master = this.context.createGain();
    this.master.gain.value = this.volume * .34;
    this.music = this.context.createGain();
    this.music.gain.value = .16;
    this.ambience = this.context.createGain();
    this.ambience.gain.value = .25;
    this.depthFilter = this.context.createBiquadFilter();
    this.depthFilter.type = "lowpass";
    this.depthFilter.frequency.value = 15000;
    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = -8;
    compressor.knee.value = 5;
    compressor.ratio.value = 6;
    compressor.attack.value = .004;
    compressor.release.value = .16;
    this.music.connect(this.master);
    this.ambience.connect(this.depthFilter).connect(this.master);
    this.master.connect(compressor).connect(this.context.destination);
    this.CreateWind();
    this.CreateDrone();
    await this.context.resume();
    this.started = true;
  }

  CreateNoiseBuffer(seconds = 8) {
    const frameCount = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let index = 0; index < frameCount; index += 1) {
      const white = Math.random() * 2 - 1;
      brown = (brown + .018 * white) / 1.018;
      data[index] = brown * 2.6;
    }
    return buffer;
  }

  CreateWind() {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.CreateNoiseBuffer(9);
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.value = 310;
    filter.Q.value = .48;
    gain.gain.value = .08;
    source.connect(filter).connect(gain).connect(this.ambience);
    source.start();
    this.windSource = { source, filter, gain };
  }

  CreateDrone() {
    const frequencies = [73.42, 87.31, 110];
    frequencies.forEach((frequency, index) => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.value = index === 0 ? .012 : .005;
      oscillator.connect(gain).connect(this.music);
      oscillator.start();
      this.drone.push({ oscillator, gain });
    });
  }

  SetChapter(chapterIndex) {
    this.chapter = chapterIndex;
    if (!this.started) return;
    const roots = [73.42, 65.41, 82.41, 73.42, 61.74, 82.41];
    const root = roots[chapterIndex] || 73.42;
    const now = this.context.currentTime;
    this.drone.forEach((voice, index) => {
      voice.oscillator.frequency.cancelScheduledValues(now);
      voice.oscillator.frequency.linearRampToValueAtTime(root * [1, 1.2, 1.5][index], now + 1.4);
    });
  }

  SetDepth(depth) {
    if (!this.started) return;
    const now = this.context.currentTime;
    const frequency = THREE.MathUtils.lerp(15000, 760, depth);
    this.depthFilter.frequency.setTargetAtTime(frequency, now, .18);
    this.windSource.gain.gain.setTargetAtTime(THREE.MathUtils.lerp(.08, .025, depth), now, .22);
  }

  SetVolume(value) {
    this.volume = value;
    if (!this.started) return;
    const target = this.muted ? 0 : value * .34;
    this.master.gain.setTargetAtTime(target, this.context.currentTime, .05);
  }

  ToggleMute(force) {
    this.muted = typeof force === "boolean" ? force : !this.muted;
    this.SetVolume(this.volume);
    return this.muted;
  }

  PlaySfx(kind = "wood", worldX = 0) {
    if (!this.started || this.muted) return;
    const now = this.context.currentTime;
    const panner = this.context.createStereoPanner();
    const gain = this.context.createGain();
    const pan = THREE.MathUtils.clamp((worldX - gameState.cameraX) / 10, -.78, .78);
    panner.pan.value = pan;
    const map = {
      knock: [180, .095, "square"],
      wood: [126, .16, "triangle"],
      brace: [92, .24, "sawtooth"],
      metal: [520, .12, "triangle"],
      lamp: [790, .1, "sine"],
      water: [340, .18, "sine"],
      air: [210, .26, "sine"],
      earth: [74, .2, "triangle"],
      cloth: [230, .09, "sine"],
      paper: [310, .08, "triangle"],
      mill: [68, .38, "sawtooth"],
      steps: [108, .13, "triangle"],
      crowd: [146, .24, "triangle"],
      wind: [98, .18, "sine"],
      network: [220, .55, "triangle"]
    };
    const recipe = map[kind] || map.wood;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    oscillator.type = recipe[2];
    oscillator.frequency.setValueAtTime(recipe[0], now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, recipe[0] * .72), now + recipe[1]);
    filter.type = "lowpass";
    filter.frequency.value = gameState.depthBlend > .5 ? 1500 : 3900;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === "network" ? .11 : .075, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + recipe[1]);
    oscillator.connect(filter).connect(panner).connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + recipe[1] + .04);
    if (kind === "knock" || kind === "network") {
      [0, .16, kind === "network" ? .36 : .31].forEach((delay, index) => {
        if (index === 0) return;
        const echo = this.context.createOscillator();
        const echoGain = this.context.createGain();
        echo.type = "sine";
        echo.frequency.value = recipe[0] * (1 - index * .06);
        echoGain.gain.setValueAtTime(.0001, now + delay);
        echoGain.gain.exponentialRampToValueAtTime(.034 / index, now + delay + .01);
        echoGain.gain.exponentialRampToValueAtTime(.0001, now + delay + .1);
        echo.connect(echoGain).connect(panner).connect(this.master);
        echo.start(now + delay);
        echo.stop(now + delay + .12);
      });
    }
  }

  Tick(time, threat) {
    if (!this.started || this.muted) return;
    const interval = gameState.currentLayer === "tunnel" ? 5.4 : 7.8;
    if (time - this.lastPulse > interval - threat * 2.2) {
      this.lastPulse = time;
      const kind = gameState.currentLayer === "tunnel" ? "earth" : "wind";
      this.PlaySfx(kind, gameState.cameraX + (Math.random() * 16 - 8));
    }
  }
}

function CacheUi() {
  [
    "loadingScreen", "loadingStatus", "titleScreen", "startButton", "continueButton", "chapterButton", "accessButton",
    "chapterSelect", "chapterList", "accessPanel", "captionToggle", "motionToggle", "contrastToggle", "volumeSlider",
    "chapterCard", "chapterNumber", "chapterTitle", "chapterDate", "chapterLocation", "gameHeader", "chapterStampNumber",
    "chapterStampTitle", "pauseButton", "hintButton", "soundButton", "prologueSkip", "objectiveCard", "objectiveText", "objectiveProgress",
    "soundCaption", "interactionPrompt", "interactionKey", "interactionVerb", "interactionName", "worldTaskHud",
    "worldTaskKicker", "worldTaskTitle", "worldTaskProgress", "worldTaskHint", "dialoguePanel",
    "dialogueSpeaker", "dialogueText", "dialogueNext", "cinematicBars", "pausePanel", "resumeButton", "restartChapterButton",
    "pauseAccessButton", "titleButton", "chapterComplete", "completeTitle", "completeQuote", "costLedger", "nextChapterButton",
    "endingScreen", "endingSummary", "endingBeatText", "endingFinalQuote", "endingChaptersButton", "endingRestartButton", "controlsGuide", "touchControls", "dangerVignette",
    "colorWash", "screenFlash", "challengePanel", "challengeKicker", "challengeTitle", "challengeBrief", "challengeProgress",
    "challengeWorkspace", "challengeFeedback", "challengeCancel"
  ].forEach((id) => { ui[id] = document.getElementById(id); });
  ui.touchDepthLabel = document.querySelector('[data-touch="depth"] span');
  ui.touchInteractLabel = document.querySelector('[data-touch="interact"] span');
}

function CreatePaperMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 1
  });
}

function CreateCapsuleGeometry(width, height) {
  const shape = new THREE.Shape();
  const radius = width * .5;
  shape.moveTo(-radius, -radius);
  shape.quadraticCurveTo(-radius, 0, 0, 0);
  shape.quadraticCurveTo(radius, 0, radius, -radius);
  shape.lineTo(radius, -height + radius);
  shape.quadraticCurveTo(radius, -height, 0, -height);
  shape.quadraticCurveTo(-radius, -height, -radius, -height + radius);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function CreateCoatGeometry(width, height) {
  const shape = new THREE.Shape();
  shape.moveTo(-width * .38, height * .5);
  shape.quadraticCurveTo(-width * .58, height * .15, -width * .5, -height * .5);
  shape.lineTo(width * .48, -height * .5);
  shape.quadraticCurveTo(width * .57, height * .15, width * .36, height * .5);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function CreatePerson(options = {}) {
  const root = new THREE.Group();
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.72, 24), CreatePaperMaterial("#161515", .34));
  shadow.scale.y = .2;
  shadow.position.set(0, .02, -.18);
  root.add(shadow);

  const facingPivot = new THREE.Group();
  const motionRoot = new THREE.Group();
  root.add(facingPivot);
  facingPivot.add(motionRoot);
  const front = options.front || "#526d69";
  const back = options.back || "#324947";
  const skin = options.skin || "#b98a66";
  const ink = "#302821";

  const backLeg = new THREE.Group();
  const frontLeg = new THREE.Group();
  backLeg.position.set(-.18, 1.02, .08);
  frontLeg.position.set(.18, 1.02, .18);
  const backLegMesh = new THREE.Mesh(CreateCapsuleGeometry(.28, 1.08), CreatePaperMaterial(back));
  const frontLegMesh = new THREE.Mesh(CreateCapsuleGeometry(.3, 1.08), CreatePaperMaterial(ink));
  backLeg.add(backLegMesh);
  frontLeg.add(frontLegMesh);
  const backFoot = new THREE.Mesh(new THREE.PlaneGeometry(.52, .2), CreatePaperMaterial("#292522"));
  const frontFoot = backFoot.clone();
  backFoot.position.set(.11, -1.06, .01);
  frontFoot.position.set(.12, -1.06, .01);
  backLeg.add(backFoot);
  frontLeg.add(frontFoot);
  motionRoot.add(backLeg, frontLeg);

  const torso = new THREE.Mesh(CreateCoatGeometry(1.08, 1.3), CreatePaperMaterial(front));
  torso.position.set(0, 1.62, .23);
  motionRoot.add(torso);

  const belt = new THREE.Mesh(new THREE.PlaneGeometry(.9, .1), CreatePaperMaterial("#7b6649"));
  belt.position.set(0, 1.24, .28);
  motionRoot.add(belt);

  const backArm = new THREE.Group();
  const frontArm = new THREE.Group();
  backArm.position.set(-.42, 2.02, .12);
  frontArm.position.set(.42, 2.02, .32);
  backArm.add(new THREE.Mesh(CreateCapsuleGeometry(.24, .96), CreatePaperMaterial(back)));
  frontArm.add(new THREE.Mesh(CreateCapsuleGeometry(.25, .96), CreatePaperMaterial(front)));
  const backHand = new THREE.Mesh(new THREE.CircleGeometry(.13, 16), CreatePaperMaterial(skin));
  const frontHand = backHand.clone();
  backHand.position.set(0, -.92, .01);
  frontHand.position.set(0, -.92, .01);
  backArm.add(backHand);
  frontArm.add(frontHand);
  motionRoot.add(backArm, frontArm);

  const neck = new THREE.Mesh(new THREE.PlaneGeometry(.24, .24), CreatePaperMaterial(skin));
  neck.position.set(0, 2.27, .24);
  motionRoot.add(neck);
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 2.58, .3);
  const head = new THREE.Mesh(new THREE.CircleGeometry(.38, 24), CreatePaperMaterial(skin));
  head.scale.y = 1.08;
  const hair = new THREE.Mesh(new THREE.CircleGeometry(.39, 20, 0, Math.PI), CreatePaperMaterial("#28231f"));
  hair.position.set(0, .12, .02);
  const nose = new THREE.Mesh(new THREE.CircleGeometry(.055, 10), CreatePaperMaterial("#7f5944"));
  nose.position.set(.35, -.02, .05);
  headGroup.add(head, hair, nose);
  motionRoot.add(headGroup);

  const satchelStrap = new THREE.Mesh(new THREE.PlaneGeometry(.06, 1.45), CreatePaperMaterial("#8a7452"));
  satchelStrap.position.set(.02, 1.7, .36);
  satchelStrap.rotation.z = -.43;
  const satchel = new THREE.Mesh(new THREE.PlaneGeometry(.52, .42), CreatePaperMaterial("#806b4e"));
  satchel.position.set(-.42, 1.2, .38);
  motionRoot.add(satchelStrap, satchel);

  if (options.scarf !== false) {
    const scarf = new THREE.Mesh(new THREE.PlaneGeometry(.82, .13), CreatePaperMaterial(options.scarfColor || "#b7a47b"));
    scarf.position.set(0, 2.24, .38);
    scarf.rotation.z = -.07;
    motionRoot.add(scarf);
  }

  if (options.staff) {
    const staff = new THREE.Mesh(new THREE.PlaneGeometry(.06, 1.65), CreatePaperMaterial("#6f5637"));
    staff.position.set(.6, .92, .36);
    staff.rotation.z = -.08;
    motionRoot.add(staff);
  }

  const baseScale = options.scale || .78;
  facingPivot.scale.set(baseScale, baseScale, 1);
  root.userData = {
    facingPivot,
    motionRoot,
    backLeg,
    frontLeg,
    backArm,
    frontArm,
    headGroup,
    baseScale,
    injured: Boolean(options.injured),
    phaseOffset: options.phaseOffset || 0
  };
  return root;
}

function AnimatePerson(person, time, moving = 0, crouch = false, carrying = false) {
  if (!person?.userData?.motionRoot) return;
  const bones = person.userData;
  const phase = time * (bones.injured ? 5.1 : 7.2) + bones.phaseOffset;
  const stride = moving ? Math.sin(phase) * (bones.injured ? .28 : .52) : 0;
  bones.frontLeg.rotation.z = stride;
  bones.backLeg.rotation.z = -stride * .85;
  bones.frontArm.rotation.z = carrying ? -1.12 : -stride * .62;
  bones.backArm.rotation.z = carrying ? -.84 : stride * .58;
  bones.motionRoot.position.y = (moving ? Math.abs(Math.cos(phase)) * .045 : Math.sin(time * 1.7 + bones.phaseOffset) * .018) - (crouch ? .42 : 0);
  bones.motionRoot.rotation.z = crouch ? -.14 : (bones.injured && moving ? Math.sin(phase) * .025 : 0);
  bones.headGroup.rotation.z = crouch ? .08 : Math.sin(time * 1.1 + bones.phaseOffset) * .012;
}

function SetSpriteFrame(actor, frameIndex, atlasName = "state") {
  if (!actor?.userData?.spriteMesh) return;
  const atlas = atlasName === "walk" ? actor.userData.walkAtlas : actor.userData.stateAtlas;
  if (!atlas?.texture) return;
  const frameCount = atlas.frameCount;
  const frame = THREE.MathUtils.clamp(frameIndex, 0, frameCount - 1);
  if (actor.userData.frame === frame && actor.userData.atlasName === atlasName) return;
  actor.userData.spriteMesh.material.map = atlas.texture;
  const uv = actor.userData.spriteMesh.geometry.attributes.uv;
  const u0 = frame / frameCount;
  const u1 = (frame + 1) / frameCount;
  uv.setXY(0, u0, 1);
  uv.setXY(1, u1, 1);
  uv.setXY(2, u0, 0);
  uv.setXY(3, u1, 0);
  uv.needsUpdate = true;
  actor.userData.frame = frame;
  actor.userData.atlasName = atlasName;
}

function CreateSpriteActor(stateTexture, walkTexture) {
  const root = new THREE.Group();
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: "#171514", transparent: true, opacity: .38, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.68, 28), shadowMaterial);
  shadow.scale.y = .18;
  shadow.position.set(0, .015, -.08);
  root.add(shadow);

  const geometry = new THREE.PlaneGeometry(1.92, 3.84);
  const material = new THREE.MeshBasicMaterial({
    map: stateTexture,
    transparent: true,
    alphaTest: .018,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const spriteMesh = new THREE.Mesh(geometry, material);
  spriteMesh.position.set(0, 1.655, .18);
  spriteMesh.renderOrder = 8;
  root.add(spriteMesh);
  root.userData = {
    spriteMesh,
    shadow,
    frame: -1,
    atlasName: "",
    stateAtlas: { texture: stateTexture, frameCount: 6 },
    walkAtlas: { texture: walkTexture, frameCount: 6, playbackFrames: [0, 1, 2, 3, 4, 5] },
    walkDistance: 0,
    previousX: root.position.x,
    facing: 1,
    baseVisualY: 1.655
  };
  SetSpriteFrame(root, 0);
  return root;
}

function AnimateSpriteActor(actor, delta, time, moving, crouch, carrying) {
  const data = actor.userData;
  const movedDistance = Math.abs(actor.position.x - data.previousX);
  if (movedDistance > .0001) data.walkDistance += movedDistance;
  data.previousX = actor.position.x;
  let frame = 0;
  let atlasName = "state";
  if (carrying) frame = 5;
  else if (gameState.keys.listen) frame = 4;
  else if (crouch) frame = 3;
  else if (moving && movedDistance > .0001) {
    atlasName = "walk";
    const playbackFrames = data.walkAtlas.playbackFrames;
    const playbackIndex = Math.floor(((data.walkDistance % 2.02) / 2.02) * playbackFrames.length) % playbackFrames.length;
    frame = playbackFrames[playbackIndex];
  }
  SetSpriteFrame(actor, frame, atlasName);
  const depthScale = THREE.MathUtils.lerp(1, .78, gameState.depthBlend);
  const idleLift = !moving && !crouch && !carrying ? Math.sin(time * 1.35) * .006 : 0;
  data.spriteMesh.scale.x = data.facing * depthScale;
  data.spriteMesh.scale.y = depthScale;
  const walkFootOffset = atlasName === "walk" ? -.085 * depthScale : 0;
  data.spriteMesh.position.y = data.baseVisualY * depthScale + walkFootOffset + idleLift;
  data.shadow.scale.x = carrying ? 1.42 : crouch ? 1.14 : 1;
  data.shadow.material.opacity = carrying ? .44 : .36;
}

function CreateHouse(x, width, height, color, windowOn = false) {
  const group = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), CreatePaperMaterial(color, .82));
  wall.position.set(0, height * .5, 0);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-width * .58, 0);
  roofShape.lineTo(-width * .34, height * .34);
  roofShape.lineTo(width * .34, height * .34);
  roofShape.lineTo(width * .58, 0);
  roofShape.closePath();
  const roof = new THREE.Mesh(new THREE.ShapeGeometry(roofShape), CreatePaperMaterial("#282d2d", .9));
  roof.position.set(0, height, .03);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(width * .22, height * .62), CreatePaperMaterial("#453a30", .95));
  door.position.set(width * .12, height * .31, .04);
  const windowFrame = new THREE.Mesh(new THREE.PlaneGeometry(width * .17, height * .22), CreatePaperMaterial(windowOn ? "#c48643" : "#222a2c", .95));
  windowFrame.position.set(-width * .23, height * .52, .05);
  group.add(wall, roof, door, windowFrame);
  group.position.set(x, SurfaceFootY, 0);
  return group;
}

function CreateBranch(x, y, scale, flip = 1) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: "#171b1b", transparent: true, opacity: .82 });
  const segments = [
    [[0, 0], [.15, 1.25], [.05, 2.55], [.35, 3.8]],
    [[.1, 1.4], [1.0, 2.2], [1.55, 2.65]],
    [[.2, 2.2], [-.65, 2.95], [-1.2, 3.25]],
    [[.82, 2.1], [1.4, 2.2], [2.05, 2.55]],
    [[-.55, 2.85], [-.65, 3.6], [-.3, 4.15]]
  ];
  segments.forEach((segment) => {
    const points = segment.map(([px, py]) => new THREE.Vector3(px * flip, py, 0));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  });
  group.position.set(x, y, 0);
  group.scale.setScalar(scale);
  return group;
}

function CreatePrologueBell() {
  const root = new THREE.Group();
  const imageHeight = 5.08;
  const imageWidth = imageHeight * 727 / 949;
  const CreateBellPlane = (texture, z, renderOrder) => {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: "#ffffff",
      transparent: true,
      opacity: 1,
      alphaTest: .008,
      depthWrite: false
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(imageWidth, imageHeight), material);
    plane.position.set(0, imageHeight * .5, z);
    plane.renderOrder = renderOrder;
    return plane;
  };
  const frame = CreateBellPlane(gameState.world.prologueBellFrameTexture, .08, 12);
  const bell = new THREE.Group();
  bell.position.set(0, imageHeight * .7229, .15);
  const bellPlane = CreateBellPlane(gameState.world.prologueBellBodyTexture, 0, 14);
  bellPlane.position.y -= bell.position.y;
  bell.add(bellPlane);
  const rope = new THREE.Group();
  rope.position.set(0, imageHeight * .3667, .18);
  const ropePlane = CreateBellPlane(gameState.world.prologueBellRopeTexture, 0, 15);
  ropePlane.position.y -= rope.position.y;
  rope.add(ropePlane);
  root.add(frame, bell, rope);
  root.position.set(-7.55, SurfaceFootY, 3.05);
  root.userData = { frame, bell, rope, ringing: 0 };
  return root;
}

function CreatePrologueSmokeColumn(x, scale = 1) {
  const root = new THREE.Group();
  const puffs = [];
  for (let index = 0; index < 7; index += 1) {
    const material = CreatePaperMaterial(index % 2 ? "#434541" : "#67665f", .24 - index * .012);
    const puff = new THREE.Mesh(new THREE.CircleGeometry(.58 + index * .12, 20), material);
    puff.position.set(Math.sin(index * 1.7) * .28, .48 + index * .58, index * .002);
    puff.scale.x = 1.25 + (index % 3) * .18;
    root.add(puff);
    puffs.push(puff);
  }
  root.position.set(x, SurfaceFootY + .2, -3.4);
  root.scale.setScalar(scale);
  root.visible = false;
  root.userData.puffs = puffs;
  return root;
}

function CreatePrologueFire(x) {
  const root = new THREE.Group();
  const flames = [];
  [-.58, .58].forEach((offset, index) => {
    const lantern = CreateProp("lamp");
    lantern.position.set(offset, 0, .08 + index * .01);
    lantern.scale.setScalar(index ? .48 : .54);
    root.add(lantern);
    const glowMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(index ? "#b85d31" : "#d89a4a") },
        uOpacity: { value: index ? .24 : .3 }
      },
      vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec2 vUv; uniform vec3 uColor; uniform float uOpacity; void main(){vec2 p=(vUv-.5)*vec2(1.0,1.8); float a=(1.0-smoothstep(.03,.5,length(p)))*uOpacity; gl_FragColor=vec4(uColor,a);}`
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.1), glowMaterial);
    glow.position.set(offset, .56, .03);
    glow.renderOrder = 8;
    root.add(glow);
    flames.push(glow);
  });
  root.position.set(x, SurfaceFootY, 1.65);
  root.visible = false;
  root.userData.flames = flames;
  return root;
}

function CreatePrologueIllustratedActor(texture, width, height) {
  const root = new THREE.Group();
  const shadow = CreateSoftContactShadow(width * 1.04, .34, .27, "#171514");
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: "#ffffff",
    transparent: true,
    alphaTest: .014,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const figure = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  figure.position.set(0, height * .5, .1);
  figure.renderOrder = 14;
  const posePivot = new THREE.Group();
  posePivot.add(figure);
  root.add(shadow, posePivot);
  root.userData = { illustratedFigure: figure, posePivot, shadow };
  return root;
}

function BuildPrologueTableau() {
  const layer = gameState.world.prologue;
  DisposeChildren(layer);
  const bell = CreatePrologueBell();
  layer.add(bell);

  const gaoLaozhong = CreatePrologueIllustratedActor(gameState.world.prologueGaoLaozhongTexture, 1.22, 3.68);
  gaoLaozhong.position.set(-6.35, SurfaceFootY, 2.24);
  gaoLaozhong.visible = false;
  gaoLaozhong.userData.fallen = 0;
  layer.add(gaoLaozhong);

  const crowd = new THREE.Group();
  const crowdPeople = [];
  const crowdSpecs = [
    [-4.35, "group", .82, 2.2],
    [-2.45, "rescue", .78, 1.72]
  ];
  crowdSpecs.forEach(([x, kind, scale, entryX], index) => {
    const person = CreateProp(kind);
    person.scale.setScalar(scale);
    person.position.set(x, SurfaceFootY, 2.04 + index * .004);
    person.userData.homeX = x;
    person.userData.entryX = entryX;
    person.visible = false;
    crowd.add(person);
    crowdPeople.push(person);
  });
  layer.add(crowd);

  const enemyLine = new THREE.Group();
  const enemies = [];
  for (let index = 0; index < 7; index += 1) {
    const enemy = CreatePatrolGuard(gameState.world.patrolGuardTexture);
    enemy.visible = true;
    enemy.scale.setScalar(.5 + (index % 2) * .035);
    enemy.position.set(10.5 + index * 1.25, SurfaceFootY + .08, -1.8 + index * .003);
    enemy.userData.columnOffset = index * 1.25;
    enemy.userData.facing = -1;
    enemy.userData.targetFacing = -1;
    enemy.userData.facingPivot.scale.set(-1, 1, 1);
    SetPatrolFrame(enemy, index % 2);
    enemyLine.add(enemy);
    enemies.push(enemy);
  }
  enemyLine.visible = false;
  layer.add(enemyLine);

  const smokeColumns = [
    CreatePrologueSmokeColumn(7.7, .88),
    CreatePrologueSmokeColumn(10.4, 1.12),
    CreatePrologueSmokeColumn(12.3, .74)
  ];
  layer.add(...smokeColumns);
  const fire = CreatePrologueFire(5.15);
  layer.add(fire);
  const cellar = CreateProp("cellar");
  cellar.position.set(2.55, SurfaceFootY, 2.95);
  cellar.scale.setScalar(.82);
  layer.add(cellar);
  const burntWall = CreateProp("brick");
  burntWall.position.set(5.45, SurfaceFootY, 2.75);
  burntWall.scale.setScalar(1.48);
  burntWall.visible = false;
  burntWall.traverse((child) => {
    if (child.isMesh && child.material?.color) child.material.color.multiplyScalar(.46);
  });
  layer.add(burntWall);

  const gaoChuanbao = CreatePrologueIllustratedActor(gameState.world.prologueGaoChuanbaoTexture, .88, 3.72);
  gaoChuanbao.position.set(5.65, SurfaceFootY, 2.3);
  gaoChuanbao.visible = false;
  layer.add(gaoChuanbao);

  layer.userData = { bell, gaoLaozhong, gaoChuanbao, crowd, crowdPeople, enemyLine, enemies, smokeColumns, fire, cellar, burntWall };
  layer.visible = true;
}

function SetGridAtlasFrame(geometry, columns, rows, frameIndex) {
  const frame = THREE.MathUtils.clamp(frameIndex, 0, columns * rows - 1);
  const column = frame % columns;
  const row = Math.floor(frame / columns);
  const u0 = column / columns;
  const u1 = (column + 1) / columns;
  const v1 = 1 - row / rows;
  const v0 = 1 - (row + 1) / rows;
  const uv = geometry.attributes.uv;
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
}

function CreateSoftContactShadow(width, height = .3, opacity = .16, color = "#55493c") {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity }
    },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main(){
        vec2 p=(vUv-.5)*vec2(1.0,3.4);
        float alpha=(1.0-smoothstep(.08,.52,length(p)))*uOpacity;
        gl_FragColor=vec4(uColor,alpha);
      }
    `
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  shadow.position.set(0, .035, -.04);
  return shadow;
}

function CreateAtlasProp(kind) {
  const evacuationLayout = EvacuationPropAtlasLayout[kind];
  const villageLayout = VillagePropAtlasLayout[kind];
  const layout = evacuationLayout || villageLayout;
  const texture = evacuationLayout ? gameState.world?.evacuationPropAtlas : gameState.world?.villagePropAtlas;
  if (!layout || !texture) return null;
  const [frame, width, height, markerY] = layout;
  const group = new THREE.Group();
  if (kind === "tracks") {
    for (let index = 0; index < 3; index += 1) {
      const printGeometry = new THREE.PlaneGeometry(.42, .58);
      SetGridAtlasFrame(printGeometry, 4, 4, frame);
      const printMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        color: index === 0 ? "#8f7961" : "#7b6854",
        transparent: true,
        alphaTest: .012,
        opacity: .84 - index * .08,
        depthWrite: false
      });
      const print = new THREE.Mesh(printGeometry, printMaterial);
      print.position.set((index - 1) * .34, .13 + (index % 2) * .035, .08 + index * .006);
      print.rotation.z = -.34 + index * .12;
      print.scale.x = index % 2 ? -.92 : .92;
      print.renderOrder = 6;
      group.add(print);
    }
    group.rotation.z = -.06;
    group.userData.markerY = markerY;
    return group;
  }
  const shadow = CreateSoftContactShadow(Math.max(.72, width * .68), Math.max(.22, height * .16), .14);
  const geometry = new THREE.PlaneGeometry(width, height);
  SetGridAtlasFrame(geometry, 4, 4, frame);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: "#ffffff",
    transparent: true,
    alphaTest: .014,
    depthWrite: false
  });
  const illustrated = new THREE.Mesh(geometry, material);
  illustrated.position.set(0, height * .5, .1);
  illustrated.renderOrder = 7;
  group.add(shadow, illustrated);
  group.userData.markerY = markerY;
  return group;
}

function CreateProp(kind, useAtlas = true) {
  if (useAtlas) {
    const atlasProp = CreateAtlasProp(kind);
    if (atlasProp) return atlasProp;
  }
  const group = new THREE.Group();
  const brown = CreatePaperMaterial("#70563e");
  const dark = CreatePaperMaterial("#282723");
  const chalk = CreatePaperMaterial("#d6c89f", .78);
  const amber = CreatePaperMaterial("#c98d4a", .9);
  const AddBox = (width, height, x, y, material = brown, z = 0) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  if (kind === "injured" && gameState.world.injuredTexture) {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(.82, 28),
      new THREE.MeshBasicMaterial({ color: "#161311", transparent: true, opacity: .34, depthWrite: false })
    );
    shadow.scale.y = .16;
    shadow.position.set(.12, .05, -.04);
    const material = new THREE.MeshBasicMaterial({
      map: gameState.world.injuredTexture, transparent: true, alphaTest: .018, depthWrite: false
    });
    const figure = new THREE.Mesh(new THREE.PlaneGeometry(2.19, 1.46), material);
    figure.position.set(0, .72, .1);
    figure.renderOrder = 8;
    group.add(shadow, figure);
    return group;
  }

  const illustratedProp = gameState.world.propTextures?.[kind];
  if (illustratedProp) {
    const dimensions = kind === "culvert" ? [5, 2.81] : [4.3, 2.43];
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(dimensions[0] * .34, 28),
      new THREE.MeshBasicMaterial({ color: "#17130f", transparent: true, opacity: .28, depthWrite: false })
    );
    shadow.scale.y = .12;
    shadow.position.set(0, .035, -.04);
    const material = new THREE.MeshBasicMaterial({
      map: illustratedProp, transparent: true, alphaTest: .018, depthWrite: false
    });
    const prop = new THREE.Mesh(new THREE.PlaneGeometry(dimensions[0], dimensions[1]), material);
    prop.position.set(0, dimensions[1] * .49, .1);
    prop.renderOrder = 7;
    group.add(shadow, prop);
    return group;
  }

  if (["group", "stretcher", "rescue"].includes(kind)) {
    const personA = CreatePerson({ front: kind === "injured" ? "#ad884d" : "#665e4f", back: "#3d4744", scale: .62, injured: kind === "injured", staff: kind === "injured", phaseOffset: 1.7 });
    personA.position.x = -.25;
    group.add(personA);
    if (kind !== "injured") {
      const personB = CreatePerson({ front: "#7c4845", back: "#4d4140", scale: .56, scarfColor: "#a78568", phaseOffset: 3.1 });
      personB.position.x = .48;
      group.add(personB);
    }
    if (kind === "stretcher") AddBox(1.35, .08, .1, .34, brown, -.05).rotation.z = -.04;
    return group;
  }

  switch (kind) {
    case "searchlight":
      AddBox(.1, 1.3, 0, .66, dark);
      AddBox(.78, .16, 0, 1.34, brown);
      break;
    case "sluice":
      AddBox(1.1, .15, 0, .38, brown);
      AddBox(.12, .84, -.42, .45, dark);
      AddBox(.12, .84, .42, .45, dark);
      break;
    case "culvert":
    case "cellar": {
      const ring = new THREE.Mesh(new THREE.RingGeometry(.42, .58, 28, 1, 0, Math.PI), dark);
      ring.position.y = .03;
      group.add(ring);
      AddBox(1.2, .16, 0, .02, brown);
      break;
    }
    case "tracks":
      [-.34, .12, .47].forEach((x, index) => {
        const print = new THREE.Mesh(new THREE.PlaneGeometry(.18, .4), CreatePaperMaterial("#3b332b", .62));
        print.position.set(x, .04 + index * .04, 0);
        print.rotation.z = index % 2 ? .14 : -.12;
        group.add(print);
      });
      break;
    case "medicine":
      AddBox(.72, .48, 0, .25, CreatePaperMaterial("#8a6e50"));
      AddBox(.12, .48, 0, .25, chalk, .02);
      AddBox(.72, .1, 0, .25, chalk, .02);
      break;
    case "vent":
    case "smokeVent":
      AddBox(.13, 1.15, 0, .58, brown);
      AddBox(.8, .13, 0, 1.08, brown);
      AddBox(.42, .42, 0, .5, dark, .02).rotation.z = .78;
      break;
    case "mill": {
      const stone = new THREE.Mesh(new THREE.CircleGeometry(.55, 24), CreatePaperMaterial("#767069"));
      stone.scale.y = .34;
      stone.position.y = .4;
      group.add(stone);
      AddBox(.06, 1.05, .12, .86, brown).rotation.z = -1.02;
      break;
    }
    case "signal":
    case "listen":
    case "network":
    case "networkFinal": {
      const pot = new THREE.Mesh(new THREE.CircleGeometry(.42, 22, 0, Math.PI), CreatePaperMaterial("#79624a"));
      pot.rotation.z = Math.PI;
      pot.position.y = .35;
      group.add(pot);
      [1, 1.4, 1.8].forEach((radius, index) => {
        const arc = new THREE.Mesh(new THREE.RingGeometry(radius * .23, radius * .25, 28, 1, 0, Math.PI), CreatePaperMaterial("#d1b77c", .38 - index * .08));
        arc.position.y = .75;
        group.add(arc);
      });
      break;
    }
    case "soil":
    case "brick":
    case "water":
      AddBox(1.2, .6, 0, .3, CreatePaperMaterial(kind === "water" ? "#4d5f5d" : kind === "brick" ? "#665143" : "#59483a"));
      for (let index = 0; index < 5; index += 1) {
        const pebble = new THREE.Mesh(new THREE.CircleGeometry(.05 + index * .008, 10), chalk);
        pebble.position.set(-.45 + index * .22, .23 + (index % 2) * .16, .02);
        group.add(pebble);
      }
      break;
    case "duckboard":
      AddBox(1.55, .12, 0, .2, dark);
      [-.55, -.18, .2, .57].forEach((x, index) => {
        const tread = AddBox(.28, .1, x, .48 + (index % 2) * .035, brown, .03);
        tread.rotation.z = index % 2 ? -.025 : .035;
      });
      AddBox(.1, .92, -.73, .52, brown);
      AddBox(.1, .92, .73, .52, brown);
      AddBox(1.6, .055, 0, .03, CreatePaperMaterial("#4d6768", .78), -.02);
      break;
    case "timber":
    case "brace":
    case "seal":
      [-.32, 0, .32].forEach((x, index) => {
        const beam = AddBox(.16, 1.25, x, .62, brown);
        beam.rotation.z = kind === "timber" ? -.52 + index * .1 : 0;
      });
      if (kind !== "timber") AddBox(1.15, .16, 0, 1.15, brown);
      break;
    case "air":
    case "lamp": {
      AddBox(.06, .45, 0, .28, brown);
      const flame = new THREE.Mesh(new THREE.CircleGeometry(.16, 18), amber);
      flame.scale.y = 1.55;
      flame.position.y = .65;
      flame.name = "flame";
      group.add(flame);
      break;
    }
    case "chalk":
    case "coin":
      Array.from({ length: 4 }).forEach((_, index) => {
        const mark = new THREE.Mesh(new THREE.CircleGeometry(.08 + (kind === "coin" ? .04 : 0), 14), kind === "coin" ? amber : chalk);
        mark.position.set((index - 1.5) * .2, .12 + (index % 2) * .12, 0);
        group.add(mark);
      });
      break;
    case "well": {
      const ring = new THREE.Mesh(new THREE.RingGeometry(.5, .7, 24, 1, 0, Math.PI), CreatePaperMaterial("#5a5650"));
      ring.position.y = .45;
      group.add(ring);
      AddBox(1.4, .22, 0, .12, dark);
      break;
    }
    case "decoy":
      AddBox(1.35, .75, 0, .38, CreatePaperMaterial("#3e3027"));
      AddBox(.08, .9, -.5, .45, brown, .03);
      AddBox(.08, .9, .5, .45, brown, .03);
      break;
    case "map":
    case "proof":
    case "ledger":
      AddBox(1.05, .72, 0, .42, CreatePaperMaterial("#c4b48d"));
      for (let index = 0; index < 3; index += 1) AddBox(.72, .025, 0, .24 + index * .16, CreatePaperMaterial("#695743", .65), .03);
      if (kind === "proof") {
        [-.28, 0, .28].forEach((x) => {
          const dent = new THREE.Mesh(new THREE.RingGeometry(.055, .085, 18), dark);
          dent.position.set(x, .7, .05);
          group.add(dent);
        });
      }
      break;
    case "smoke":
      AddBox(.62, .13, 0, .18, dark);
      [0, 1, 2, 3].forEach((index) => {
        const puff = new THREE.Mesh(new THREE.CircleGeometry(.24 + index * .06, 20), CreatePaperMaterial("#7f8580", .26 - index * .035));
        puff.scale.set(1.3, .62 + index * .1, 1);
        puff.position.set((index % 2 ? .14 : -.08), .45 + index * .32, .04);
        puff.name = "smokePuff";
        group.add(puff);
      });
      break;
    case "telephone":
      AddBox(.08, 1.7, 0, .85, dark);
      AddBox(1.1, .07, 0, 1.5, brown);
      AddBox(1.7, .025, .78, 1.45, chalk).rotation.z = -.12;
      break;
    case "grain":
      [-.4, .05, .48].forEach((x, index) => {
        const bag = new THREE.Mesh(new THREE.CircleGeometry(.34, 20), CreatePaperMaterial(index === 1 ? "#a28759" : "#89714e"));
        bag.scale.y = 1.35;
        bag.position.set(x, .43, index * .01);
        group.add(bag);
      });
      break;
    default:
      AddBox(.8, .8, 0, .4, brown);
  }
  return group;
}

function DisposeTree(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  root.traverse?.((child) => {
    if (child.geometry) geometries.add(child.geometry);
    const ownedMaterials = Array.isArray(child.material) ? child.material : [child.material];
    ownedMaterials.filter(Boolean).forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => material.dispose?.());
}

function DisposeChildren(root) {
  if (!root) return;
  [...root.children].forEach((child) => {
    root.remove(child);
    DisposeTree(child);
  });
}

function ClearHeldProp() {
  if (gameState.heldProp?.parent) gameState.heldProp.parent.remove(gameState.heldProp);
  DisposeTree(gameState.heldProp);
  gameState.heldProp = null;
  gameState.heldPropKind = "";
}

function EquipHeldProp(kind) {
  ClearHeldProp();
  if (!kind || !gameState.player) return;
  const prop = CreateProp(kind, false);
  const scale = kind === "well" ? .24 : kind === "vent" ? .28 : .34;
  prop.scale.setScalar(scale);
  prop.position.set(.72, 1.22, 3.45);
  prop.rotation.z = -.16;
  prop.traverse((child) => {
    if (!child.isMesh) return;
    child.renderOrder = Math.max(child.renderOrder || 0, 14);
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      material.userData.heldBaseOpacity = material.opacity;
      material.transparent = true;
      material.depthWrite = false;
    });
  });
  gameState.player.add(prop);
  gameState.heldProp = prop;
  gameState.heldPropKind = kind;
}

function SetHeldPropVisibility(alpha) {
  if (!gameState.heldProp) return;
  gameState.heldProp.traverse((child) => {
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      const baseOpacity = material.userData.heldBaseOpacity ?? 1;
      material.opacity = baseOpacity * THREE.MathUtils.clamp(alpha, 0, 1);
    });
  });
}

function ActionDependsOn(actionMap, actionId, requiredId, visited = new Set()) {
  if (actionId === requiredId) return true;
  if (visited.has(actionId)) return false;
  visited.add(actionId);
  const action = actionMap.get(actionId);
  return (action?.requires || []).some((dependencyId) => (
    dependencyId === requiredId || ActionDependsOn(actionMap, dependencyId, requiredId, visited)
  ));
}

function RestoreHeldPropForChapter(chapter, savedHeldKind = "") {
  ClearHeldProp();
  const actionMap = new Map(chapter.interactions.map((action) => [action.id, action]));
  const pendingPlacementKinds = new Set(chapter.interactions
    .filter((placement) => placement.requiresHeld && !gameState.completed.has(placement.id))
    .map((placement) => placement.requiresHeld));
  if (savedHeldKind && pendingPlacementKinds.has(savedHeldKind)) {
    EquipHeldProp(savedHeldKind);
    return;
  }
  const pendingPickup = chapter.interactions.find((pickup) => {
    if (!pickup.pickupKind || !gameState.completed.has(pickup.id)) return false;
    return chapter.interactions.some((placement) => (
      placement.requiresHeld === pickup.pickupKind
      && !gameState.completed.has(placement.id)
      && ActionDependsOn(actionMap, placement.id, pickup.id)
    ));
  });
  if (pendingPickup) EquipHeldProp(pendingPickup.pickupKind);
}

function CreateMarker(action) {
  const root = new THREE.Group();
  const layerY = action.layer === "surface" ? SurfaceFootY : TunnelFootY;
  const prop = CreateProp(action.kind);
  prop.position.y = 0;
  root.add(prop);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: "#e6d9b5", transparent: true, opacity: .5, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(.22, .27, 32), ringMaterial);
  const markerY = prop.userData.markerY || 1.65;
  ring.position.set(0, markerY, .45);
  root.add(ring);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(.06, 12), CreatePaperMaterial("#d6a05a", .85));
  dot.position.set(0, markerY, .46);
  root.add(dot);
  root.position.set(action.x, layerY, 2.2);
  root.userData = { action, ring, dot, prop, baseY: layerY, completedApplied: false };
  return root;
}

function ApplyCompletedMarkerState(marker) {
  if (marker.userData.completedApplied) return;
  marker.userData.completedApplied = true;
  const { action, prop } = marker.userData;
  prop.traverse((child) => {
    if (!child.isMesh || !child.material?.color) return;
    child.material.color.lerp(new THREE.Color("#b58b58"), .13);
  });
  const finished = new THREE.Group();
  finished.name = "completedState";
  const amber = CreatePaperMaterial("#d7aa63", .88);
  const dark = CreatePaperMaterial("#59422f", .9);
  const AddBar = (width, height, x, y, rotation = 0, material = amber) => {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    bar.position.set(x, y, .18);
    bar.rotation.z = rotation;
    finished.add(bar);
    return bar;
  };
  if (["timber", "brace", "seal", "decoy"].includes(action.kind)) {
    AddBar(1.28, .11, 0, .56, .48, dark);
    AddBar(.32, .12, .38, .92, -.58, amber);
    AddBar(.32, .12, -.38, .25, -.58, amber);
  } else if (["vent", "smokeVent", "air", "lamp"].includes(action.kind)) {
    [0, 1, 2].forEach((index) => {
      const arc = new THREE.Mesh(new THREE.RingGeometry(.38 + index * .2, .41 + index * .2, 28, 1, -.65, 1.3), CreatePaperMaterial("#d7aa63", .72 - index * .16));
      arc.position.set(.3, .72, .18);
      finished.add(arc);
    });
    AddBar(.08, .42, 0, .7, -.08, amber);
  } else if (["network", "networkFinal", "listen", "signal"].includes(action.kind)) {
    [0, 1, 2].forEach((index) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(.22 + index * .18, .25 + index * .18, 30), CreatePaperMaterial("#d8aa61", .78 - index * .16));
      ring.scale.y = .48;
      ring.position.set(0, .78, .18);
      finished.add(ring);
    });
  } else if (["map", "ledger"].includes(action.kind)) {
    AddBar(.32, .055, -.12, .42, -.75, dark);
    AddBar(.68, .055, .16, .55, .64, dark);
  } else if (action.kind === "telephone") {
    AddBar(.62, .045, .28, 1.12, -.72, dark);
    AddBar(.62, .045, -.18, .67, -.72, dark);
  } else if (action.kind === "grain") {
    AddBar(1.35, .055, .04, .56, .05, dark);
    AddBar(.055, .72, .04, .55, 0, dark);
  } else {
    const seal = new THREE.Mesh(new THREE.CircleGeometry(.16, 18), amber);
    seal.position.set(.46, 1.42, .18);
    finished.add(seal);
  }
  marker.add(finished);
}

function CreateSearchlight() {
  const group = new THREE.Group();
  const material = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      float Hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        float halfWidth = mix(.48, .025, vUv.y);
        float distanceFromCenter = abs(vUv.x - .5);
        float softEdge = 1.0 - smoothstep(halfWidth * .46, halfWidth, distanceFromCenter);
        float verticalFade = smoothstep(0.0, .12, vUv.y) * (1.0 - smoothstep(.91, 1.0, vUv.y));
        float dust = .82 + Hash(floor(vUv * vec2(92.0, 138.0))) * .18;
        float alpha = softEdge * verticalFade * dust * .13;
        gl_FragColor = vec4(vec3(.92, .84, .62), alpha);
      }
    `
  });
  const cone = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 7), material);
  cone.position.y = -3.5;
  group.add(cone);
  group.position.set(0, 3.4, 1.3);
  return group;
}

function CreatePatrolGuard(texture) {
  const root = new THREE.Group();
  const shadowMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color("#4b4339") }, uOpacity: { value: .22 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vUv; uniform vec3 uColor; uniform float uOpacity; void main(){vec2 p=(vUv-.5)*vec2(1.0,3.2); float a=(1.0-smoothstep(.05,.5,length(p)))*uOpacity; gl_FragColor=vec4(uColor,a);}`
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.26, .42), shadowMaterial);
  shadow.position.set(0, .03, 2.08);
  shadow.renderOrder = 7;

  const facingPivot = new THREE.Group();
  facingPivot.position.z = 2.18;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: "#e8e3d7",
    transparent: true,
    alphaTest: .018,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const geometry = new THREE.PlaneGeometry(1.5, 3);
  SetGridAtlasFrame(geometry, 4, 1, 3);
  const sprite = new THREE.Mesh(geometry, material);
  sprite.position.y = 1.5;
  sprite.renderOrder = 8;
  facingPivot.add(sprite);

  root.add(shadow, facingPivot);
  root.position.set(0, SurfaceFootY, 0);
  root.userData = {
    facingPivot,
    sprite,
    shadow,
    facing: 1,
    targetFacing: 1,
    patrolDirection: 1,
    patrolX: -7.65,
    phase: "walk",
    phaseElapsed: 0,
    turnSwapped: false,
    walkDistance: 0,
    frame: 3,
    baseSpriteY: 1.5
  };
  root.visible = false;
  return root;
}

function SetPatrolFrame(patrol, frameIndex) {
  if (!patrol?.userData?.sprite || patrol.userData.frame === frameIndex) return;
  SetGridAtlasFrame(patrol.userData.sprite.geometry, 4, 1, frameIndex);
  patrol.userData.frame = frameIndex;
}

function CreateMobileFirewoodCart(texture) {
  const root = new THREE.Group();
  const shadow = CreateSoftContactShadow(3.05, .4, .2, "#51483e");
  shadow.position.z = .02;
  const geometry = new THREE.PlaneGeometry(3.72, 1.86);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: "#e4ded2",
    transparent: true,
    alphaTest: .014,
    depthWrite: false
  });
  const cart = new THREE.Mesh(geometry, material);
  cart.position.set(0, .9, .16);
  cart.renderOrder = 13;
  root.add(shadow, cart);
  root.userData = {
    cart,
    shadow,
    stops: [4.9, 1, -2.2],
    targetStopIndex: 0,
    lastStopIndex: 0,
    wheelPhase: 0
  };
  root.visible = false;
  return root;
}

function CreateDepthOccluder() {
  const root = new THREE.Group();
  const curtainMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uOpacity: { value: 0 },
      uProgress: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uOpacity;
      uniform float uProgress;

      float Hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float Noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(Hash(i), Hash(i + vec2(1.0, 0.0)), f.x),
          mix(Hash(i + vec2(0.0, 1.0)), Hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      void main() {
        vec2 paperUv = vUv * vec2(32.0, 18.0);
        float broad = Noise(paperUv * .32 + vec2(0.0, uProgress * 1.7));
        float grain = Noise(paperUv * 2.8);
        float strataWave = sin(vUv.y * 82.0 + broad * 5.4 + sin(vUv.x * 17.0) * .9);
        float strata = 1.0 - smoothstep(.025, .18, abs(strataWave));
        float pebbles = step(.965, Hash(floor(paperUv * 1.35))) * (.35 + grain * .45);
        vec3 darkSoil = vec3(.115, .086, .066);
        vec3 rawEarth = vec3(.305, .218, .154);
        vec3 clay = vec3(.42, .29, .19);
        vec3 color = mix(darkSoil, rawEarth, .36 + broad * .52);
        color = mix(color, clay, strata * .22);
        color += pebbles * vec3(.12, .09, .06);
        color *= .87 + (grain - .5) * .18;
        float edgeInk = smoothstep(.0, .055, vUv.y) * smoothstep(.0, .055, 1.0 - vUv.y);
        float shaft = smoothstep(.038, .073, abs(vUv.x - .5));
        float alpha = uOpacity * mix(.91, .995, broad) * edgeInk * mix(.12, 1.0, shaft);
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
  const curtain = new THREE.Mesh(
    new THREE.PlaneGeometry(31, 22),
    curtainMaterial
  );
  curtain.position.set(0, 2.2, .34);
  curtain.renderOrder = 16;
  const strataMaterials = [];
  for (let index = 0; index < 10; index += 1) {
    const material = new THREE.LineBasicMaterial({
      color: index % 3 === 0 ? "#8a7052" : index % 3 === 1 ? "#2d2822" : "#65513d",
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const y = -2.1 + index * 1.02;
    const points = [];
    for (let point = 0; point <= 14; point += 1) {
      const x = -15.5 + point * (31 / 14);
      points.push(new THREE.Vector3(x, y + Math.sin(point * 1.7 + index) * .11, .36));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
    line.renderOrder = 17;
    root.add(line);
    strataMaterials.push(material);
  }
  const MakeIrregularLoop = (radiusX, radiusY, count, phase = 0) => {
    const points = [];
    for (let index = 0; index < count; index += 1) {
      const angle = Math.PI * 2 * index / count;
      const wobble = 1 + Math.sin(index * 2.37 + phase) * .08 + Math.sin(index * 4.11 + phase) * .035;
      points.push(new THREE.Vector2(Math.cos(angle) * radiusX * wobble, Math.sin(angle) * radiusY * wobble));
    }
    return points;
  };
  const hollowShape = new THREE.Shape(MakeIrregularLoop(.84, .34, 22, .4));
  const hollow = new THREE.Mesh(new THREE.ShapeGeometry(hollowShape), CreatePaperMaterial("#17120f", .97));
  hollow.position.set(0, .13, .26);
  hollow.renderOrder = 13;
  const rimShape = new THREE.Shape(MakeIrregularLoop(1.02, .46, 24, 1.2));
  const rimHole = new THREE.Path(MakeIrregularLoop(.78, .3, 22, .4).reverse());
  rimShape.holes.push(rimHole);
  const rim = new THREE.Mesh(new THREE.ShapeGeometry(rimShape), CreatePaperMaterial("#4a3829", .94));
  rim.position.set(0, .13, .28);
  rim.renderOrder = 14;
  const grass = new THREE.Group();
  [-.82, -.67, -.48, -.29, -.08, .14, .34, .53, .7, .84].forEach((x, index) => {
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(.035, .16 + (index % 3) * .045), CreatePaperMaterial(index % 2 ? "#6c6042" : "#3c3829", .9));
    blade.position.set(x, .38 + (index % 2) * .025, .3);
    blade.rotation.z = -.42 + (index % 5) * .2;
    blade.renderOrder = 15;
    grass.add(blade);
  });
  root.add(hollow, rim, grass, curtain);
  root.userData.curtain = curtain;
  root.userData.strataMaterials = strataMaterials;
  root.visible = false;
  return root;
}

function CreateDust(count, color, yMin, yMax, z) {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (Math.random() - .5) * 34;
    positions[index * 3 + 1] = THREE.MathUtils.lerp(yMin, yMax, Math.random());
    positions[index * 3 + 2] = z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color, size: .035, transparent: true, opacity: .46, depthWrite: false });
  return new THREE.Points(geometry, material);
}

function CreateTunnelLightPool(x, color, width = 5.4, height = 4.4, baseOpacity = .24) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0 }
    },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main(){
        vec2 p=(vUv-.5)*vec2(1.0,1.34);
        float pool=1.0-smoothstep(.05,.52,length(p));
        float falloff=smoothstep(0.0,.16,vUv.y)*(1.0-smoothstep(.8,1.0,vUv.y));
        gl_FragColor=vec4(uColor,pool*falloff*uOpacity);
      }
    `
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.set(x, TunnelFootY + 1.62, 1.16);
  mesh.renderOrder = 5;
  mesh.userData.baseOpacity = baseOpacity;
  return mesh;
}

async function CreateWorld() {
  const initialPixelRatio = GetPixelRatio(window.innerWidth, window.innerHeight);
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(initialPixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  document.getElementById("rendererHost").appendChild(renderer.domElement);
  gameState.renderer = renderer;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#10191f");
  gameState.scene = scene;
  const camera = new THREE.OrthographicCamera(-8, 8, ViewHeight * .5, -ViewHeight * .5, .1, 100);
  camera.position.set(0, -.45, 24);
  camera.lookAt(0, -.45, 0);
  gameState.camera = camera;

  const textureLoader = new THREE.TextureLoader();
  const fullAtlasSupported = renderer.capabilities.maxTextureSize >= 2172;
  const roadTexturePath = fullAtlasSupported
    ? "./Assets/Texture_VillageRoadRibbonV3.webp"
    : "./Assets/Texture_VillageRoadRibbonSafeV3.webp";
  const characterTexturePath = fullAtlasSupported
    ? "./Assets/Texture_CharacterLinQingheStripV3.webp"
    : "./Assets/Texture_CharacterLinQingheStripSafeV3.webp";
  const walkTexturePath = renderer.capabilities.maxTextureSize >= 2304
    ? "./Assets/Texture_CharacterLinQingheWalkV2.webp"
    : "./Assets/Texture_CharacterLinQingheWalkSafeV2.webp";
  const [mountainTexture, villageMidTexture, villageForegroundTexture, roadTexture, tunnelTexture, tunnelMidgroundTexture, tunnelForegroundTexture, injuredTexture, sluiceTexture, culvertTexture, firewoodCartTexture, characterTexture, characterWalkTexture, patrolGuardTexture, chapterSetDressTexture, villagePropAtlasTexture, evacuationPropAtlasTexture, prologueGaoChuanbaoTexture, prologueGaoLaozhongTexture, prologueBellFrameTexture, prologueBellBodyTexture, prologueBellRopeTexture] = await Promise.all([
    textureLoader.loadAsync("./Assets/Texture_MountainFarV2.webp"),
    textureLoader.loadAsync("./Assets/Texture_VillageMidgroundV2.webp"),
    textureLoader.loadAsync("./Assets/Texture_VillageForegroundV2.webp"),
    textureLoader.loadAsync(roadTexturePath),
    textureLoader.loadAsync("./Assets/Texture_TunnelGraphicNovelV2.webp"),
    textureLoader.loadAsync("./Assets/Texture_TunnelMidgroundV3.webp"),
    textureLoader.loadAsync("./Assets/Texture_TunnelForegroundV2.webp"),
    textureLoader.loadAsync("./Assets/Texture_CharacterDuXiaomanInjuredV3.webp"),
    textureLoader.loadAsync("./Assets/Texture_PropIrrigationSluiceV2.webp"),
    textureLoader.loadAsync("./Assets/Texture_PropWaterCartCulvertV2.webp"),
    textureLoader.loadAsync("./Assets/Texture_PropFirewoodCartV2.webp"),
    textureLoader.loadAsync(characterTexturePath),
    textureLoader.loadAsync(walkTexturePath),
    textureLoader.loadAsync("./Assets/Texture_CharacterPatrolGuardAtlasV2.webp"),
    textureLoader.loadAsync("./Assets/Texture_ChapterSetDressFarAtlasV4.webp"),
    textureLoader.loadAsync("./Assets/Texture_PropAtlasVillageTunnelV3.webp"),
    textureLoader.loadAsync("./Assets/Texture_PropAtlasEvacuationNetworkV3.webp"),
    textureLoader.loadAsync("./Assets/Texture_CharacterGaoChuanbaoPrologueV2.png"),
    textureLoader.loadAsync("./Assets/Texture_CharacterGaoLaozhongPrologueV2.png"),
    textureLoader.loadAsync("./Assets/Texture_PropPrologueBellFrameV1.png"),
    textureLoader.loadAsync("./Assets/Texture_PropPrologueBellBodyV1.png"),
    textureLoader.loadAsync("./Assets/Texture_PropPrologueBellRopeV1.png")
  ]);
  [mountainTexture, villageMidTexture, villageForegroundTexture, roadTexture, tunnelTexture, tunnelMidgroundTexture, tunnelForegroundTexture, injuredTexture, sluiceTexture, culvertTexture, firewoodCartTexture, characterTexture, characterWalkTexture, patrolGuardTexture, chapterSetDressTexture, villagePropAtlasTexture, evacuationPropAtlasTexture, prologueGaoChuanbaoTexture, prologueGaoLaozhongTexture, prologueBellFrameTexture, prologueBellBodyTexture, prologueBellRopeTexture].forEach((texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 1;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
  });

  const world = {};
  world.surfaceFar = new THREE.Group();
  world.surfaceDress = new THREE.Group();
  world.surfaceMid = new THREE.Group();
  world.surfaceNear = new THREE.Group();
  world.tunnelFar = new THREE.Group();
  world.tunnelNear = new THREE.Group();
  world.tunnelLightLayer = new THREE.Group();
  world.tunnelForeground = new THREE.Group();
  world.gameplay = new THREE.Group();
  world.consequences = new THREE.Group();
  world.prologue = new THREE.Group();
  world.epilogue = new THREE.Group();
  world.foreground = new THREE.Group();
  world.effects = new THREE.Group();
  world.searchlight = CreateSearchlight();
  world.patrolGuard = CreatePatrolGuard(patrolGuardTexture);
  world.mobileCover = CreateMobileFirewoodCart(firewoodCartTexture);
  world.depthOccluder = CreateDepthOccluder();

  const mountainMaterial = new THREE.MeshBasicMaterial({
    map: mountainTexture, color: "#ffffff", transparent: true, opacity: 1, depthWrite: false
  });
  mountainMaterial.userData.depthOpacity = .96;
  const mountainPlane = new THREE.Mesh(new THREE.PlaneGeometry(SceneWidth, 18.82), mountainMaterial);
  mountainPlane.position.set(0, 1.15, -20);
  world.surfaceFar.add(mountainPlane);

  const chapterDressMaterial = new THREE.MeshBasicMaterial({
    map: chapterSetDressTexture, color: "#ffffff", transparent: true, opacity: .58, alphaTest: .008, depthWrite: false
  });
  chapterDressMaterial.userData.depthOpacity = .58;
  const chapterDressGeometry = new THREE.PlaneGeometry(SceneWidth, SceneWidth * 4 / 9);
  SetGridAtlasFrame(chapterDressGeometry, 2, 3, 0);
  const chapterDressPlane = new THREE.Mesh(chapterDressGeometry, chapterDressMaterial);
  chapterDressPlane.position.set(0, -.58, -15);
  world.surfaceDress.add(chapterDressPlane);
  world.chapterDressPlane = chapterDressPlane;
  world.chapterDressMaterial = chapterDressMaterial;

  const villageMaterial = new THREE.MeshBasicMaterial({
    map: villageMidTexture, color: "#ffffff", transparent: true, alphaTest: .018, depthWrite: false
  });
  villageMaterial.userData.depthOpacity = .94;
  const villagePlane = new THREE.Mesh(new THREE.PlaneGeometry(SceneWidth, 18.82), villageMaterial);
  villagePlane.position.set(0, 1.15, -9);
  world.surfaceMid.add(villagePlane);

  const groundMaterial = new THREE.MeshBasicMaterial({
    map: roadTexture, color: "#ffffff", transparent: true, alphaTest: .012, depthWrite: false
  });
  groundMaterial.userData.depthOpacity = .97;
  const groundPlaneHeight = 5.39;
  const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(SceneWidth, groundPlaneHeight), groundMaterial);
  groundPlane.position.set(0, -4.995, -4.6);
  world.surfaceNear.add(groundPlane);

  const foregroundMaterial = new THREE.MeshBasicMaterial({
    map: villageForegroundTexture, color: "#ffffff", transparent: true, alphaTest: .015, depthWrite: false
  });
  foregroundMaterial.userData.depthOpacity = .9;
  const foregroundPlane = new THREE.Mesh(new THREE.PlaneGeometry(36, 20.25), foregroundMaterial);
  foregroundPlane.position.set(0, 1.15, 4.2);
  foregroundPlane.renderOrder = 18;
  world.foreground.add(foregroundPlane);
  world.surfaceMaterials = [mountainMaterial, chapterDressMaterial, villageMaterial, groundMaterial, foregroundMaterial];
  world.surfaceLayerMaterials = { mountainMaterial, chapterDressMaterial, villageMaterial, groundMaterial, foregroundMaterial };

  const tunnelMaterial = new THREE.MeshBasicMaterial({
    map: tunnelTexture, color: "#ffffff", transparent: true, opacity: 0, depthWrite: false
  });
  const tunnelPlane = new THREE.Mesh(new THREE.PlaneGeometry(SceneWidth, 18.82), tunnelMaterial);
  tunnelPlane.position.set(0, -13.48, -19);
  world.tunnelFar.add(tunnelPlane);
  world.tunnelMaterial = tunnelMaterial;
  const tunnelMidgroundHeight = SceneWidth * 555 / 1672;
  const tunnelMidgroundMaterial = new THREE.MeshBasicMaterial({
    map: tunnelMidgroundTexture, color: "#ffffff", transparent: true, opacity: 0, alphaTest: .012, depthWrite: false
  });
  const tunnelMidgroundPlane = new THREE.Mesh(new THREE.PlaneGeometry(SceneWidth, tunnelMidgroundHeight), tunnelMidgroundMaterial);
  tunnelMidgroundPlane.position.set(0, TunnelFootY + tunnelMidgroundHeight * .5, -4.8);
  tunnelMidgroundPlane.renderOrder = 5;
  world.tunnelNear.add(tunnelMidgroundPlane);
  const tunnelForegroundMaterial = new THREE.MeshBasicMaterial({
    map: tunnelForegroundTexture, color: "#ffffff", transparent: true, alphaTest: .015, depthWrite: false
  });
  const tunnelForegroundPlane = new THREE.Mesh(new THREE.PlaneGeometry(36, 20.25), tunnelForegroundMaterial);
  tunnelForegroundPlane.position.set(0, -13.48, 4.35);
  tunnelForegroundPlane.renderOrder = 17;
  world.tunnelForeground.add(tunnelForegroundPlane);
  world.tunnelForeground.visible = false;
  world.tunnelMaterials = [tunnelMaterial, tunnelMidgroundMaterial, tunnelForegroundMaterial];
  const tunnelShadeMaterial = new THREE.MeshBasicMaterial({
    color: "#090b0b", transparent: true, opacity: 0, depthWrite: false
  });
  const tunnelShade = new THREE.Mesh(new THREE.PlaneGeometry(SceneWidth + 3.5, 8.65), tunnelShadeMaterial);
  tunnelShade.position.set(0, TunnelFootY + 2.35, 1.08);
  tunnelShade.renderOrder = 4;
  world.tunnelLightLayer.add(tunnelShade);
  world.tunnelShadeMaterial = tunnelShadeMaterial;
  world.tunnelLightPools = [
    CreateTunnelLightPool(-8.1, "#b8783e", 5.7, 4.5, .2),
    CreateTunnelLightPool(-.15, "#d59a55", 6.2, 4.8, .24),
    CreateTunnelLightPool(8.05, "#d9a65d", 5.5, 4.4, .22)
  ];
  world.tunnelLightLayer.add(...world.tunnelLightPools);
  world.tunnelLightLayer.visible = false;
  world.characterTexture = characterTexture;
  world.characterWalkTexture = characterWalkTexture;
  world.walkTexturePath = walkTexturePath;
  world.characterTexturePath = characterTexturePath;
  world.roadTexturePath = roadTexturePath;
  world.injuredTexture = injuredTexture;
  world.propTextures = { sluice: sluiceTexture, culvert: culvertTexture };
  world.villagePropAtlas = villagePropAtlasTexture;
  world.evacuationPropAtlas = evacuationPropAtlasTexture;
  world.prologueGaoChuanbaoTexture = prologueGaoChuanbaoTexture;
  world.prologueGaoLaozhongTexture = prologueGaoLaozhongTexture;
  world.patrolGuardTexture = patrolGuardTexture;
  world.prologueBellFrameTexture = prologueBellFrameTexture;
  world.prologueBellBodyTexture = prologueBellBodyTexture;
  world.prologueBellRopeTexture = prologueBellRopeTexture;
  world.actorSurfaceColor = new THREE.Color();
  world.actorTunnelColor = new THREE.Color();
  world.actorCurrentColor = new THREE.Color();
  world.actorLightColor = new THREE.Color("#f3ddb0");
  world.actorWhiteColor = new THREE.Color("#ffffff");

  const haze = new THREE.Mesh(new THREE.PlaneGeometry(37, 8), new THREE.MeshBasicMaterial({
    color: "#9aa9ac", transparent: true, opacity: .07, depthWrite: false
  }));
  haze.position.set(1.5, 1.7, -12);
  world.surfaceMid.add(haze);

  world.surfaceDust = CreateDust(IsMobile() ? 100 : 180, "#a5a08a", -2.5, 4.3, 1.8);
  world.tunnelDust = CreateDust(IsMobile() ? 80 : 140, "#c09a6b", -14.2, -5.3, 1.8);
  world.effects.add(world.surfaceDust, world.tunnelDust);
  world.gameplay.add(world.searchlight, world.patrolGuard, world.mobileCover, world.depthOccluder, world.consequences, world.epilogue);
  world.smokeLine = null;
  world.epilogue.visible = false;
  world.searchlight.visible = false;
  world.patrolGuard.visible = false;
  world.mobileCover.visible = false;
  world.prologue.visible = false;

  scene.add(world.surfaceFar, world.surfaceDress, world.surfaceMid, world.surfaceNear, world.tunnelFar, world.tunnelNear, world.tunnelLightLayer, world.prologue, world.gameplay, world.foreground, world.tunnelForeground, world.effects);
  gameState.world = world;

  const player = CreateSpriteActor(characterTexture, characterWalkTexture);
  player.position.set(-10.6, SurfaceFootY, 2.8);
  world.gameplay.add(player);
  gameState.player = player;
  Resize();
}

function IsMobile() {
  return matchMedia("(pointer: coarse)").matches
    || window.innerWidth < 760
    || (window.innerWidth <= 920 && window.innerHeight <= 500);
}

function GetPixelRatio(width, height) {
  const deviceRatio = window.devicePixelRatio || 1;
  const cap = IsMobile() ? 1.25 : 1.5;
  const pixelBudget = IsMobile() ? 1800000 : 4200000;
  const budgetRatio = Math.sqrt(pixelBudget / Math.max(1, width * height));
  return Math.max(.5, Math.min(deviceRatio, cap, budgetRatio));
}

function GetCameraHorizontalLimit() {
  if (!gameState.camera) return 0;
  const halfViewWidth = Math.abs(gameState.camera.right - gameState.camera.left) * .5 / Math.max(.001, gameState.camera.zoom || 1);
  return Math.max(0, SceneWidth * .5 - halfViewWidth - .015);
}

function ClampCameraX(value) {
  const limit = GetCameraHorizontalLimit();
  return THREE.MathUtils.clamp(value, -limit, limit);
}

function Resize() {
  if (!gameState.renderer || !gameState.camera) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspect = width / Math.max(height, 1);
  gameState.camera.left = -ViewHeight * aspect * .5;
  gameState.camera.right = ViewHeight * aspect * .5;
  gameState.camera.top = ViewHeight * .5;
  gameState.camera.bottom = -ViewHeight * .5;
  gameState.camera.updateProjectionMatrix();
  gameState.camera.zoom = gameState.cameraZoom;
  gameState.camera.updateProjectionMatrix();
  gameState.cameraX = ClampCameraX(gameState.cameraX);
  gameState.camera.position.x = gameState.cameraX;
  gameState.camera.position.y = gameState.cameraY;
  gameState.camera.lookAt(gameState.cameraX, gameState.cameraY, 0);
  gameState.renderer.setPixelRatio(GetPixelRatio(width, height));
  gameState.renderer.setSize(width, height, false);
  gameState.renderer.domElement.style.width = "100%";
  gameState.renderer.domElement.style.height = "100%";
  gameState.renderer.domElement.style.inset = "0";
  ApplyParallax(gameState.cameraX);
  RenderOnce();
}

function ScheduleResize() {
  if (gameState.resizeFrame) return;
  gameState.resizeFrame = requestAnimationFrame(() => {
    gameState.resizeFrame = 0;
    Resize();
  });
}

function WakeTouchControls() {
  document.body.classList.remove("touchIdle");
  window.clearTimeout(WakeTouchControls.timer);
  WakeTouchControls.timer = window.setTimeout(() => document.body.classList.add("touchIdle"), 1200);
}

function BindEvents() {
  window.addEventListener("resize", ScheduleResize);
  window.visualViewport?.addEventListener("resize", ScheduleResize);
  if (typeof ResizeObserver !== "undefined") {
    gameState.resizeObserver = new ResizeObserver(() => ScheduleResize());
    gameState.resizeObserver.observe(document.documentElement);
  }
  window.addEventListener("blur", ResetInputState);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    ResetInputState();
    if (gameState.inDialogue || gameState.challenge) gameState.audio?.context?.suspend?.();
    else if (gameState.chapterActive) SetPaused(true);
  });
  document.addEventListener("keydown", HandleKeyDown);
  document.addEventListener("keyup", HandleKeyUp);

  ui.startButton.addEventListener("click", StartPrologue);
  ui.continueButton.addEventListener("click", () => StartGame(gameState.savedProgress?.currentChapter ?? gameState.unlockedChapter, true));
  ui.chapterButton.addEventListener("click", () => OpenPanel("chapters"));
  ui.accessButton.addEventListener("click", () => OpenPanel("access"));
  document.querySelectorAll("[data-close-panel]").forEach((button) => button.addEventListener("click", ClosePanels));
  ui.pauseButton.addEventListener("click", () => SetPaused(true));
  ui.resumeButton.addEventListener("click", () => SetPaused(false));
  ui.restartChapterButton.addEventListener("click", () => StartGame(gameState.chapterIndex, false));
  ui.pauseAccessButton.addEventListener("click", () => OpenPanel("access", true));
  ui.titleButton.addEventListener("click", ShowTitle);
  ui.hintButton.addEventListener("click", () => ShowObjective(true));
  ui.soundButton.addEventListener("click", ToggleSound);
  ui.dialogueNext.addEventListener("click", AdvanceDialogue);
  ui.dialoguePanel.addEventListener("click", (event) => { if (!event.target.closest("#dialogueNext")) AdvanceDialogue(); });
  ui.challengeCancel.addEventListener("click", () => CloseChallenge());
  ui.challengePanel.addEventListener("keydown", TrapChallengeFocus);
  ui.nextChapterButton.addEventListener("click", NextChapter);
  ui.endingChaptersButton.addEventListener("click", () => OpenPanel("chapters"));
  ui.endingRestartButton.addEventListener("click", StartPrologue);
  ui.prologueSkip.addEventListener("click", () => FinishPrologue(true));

  ui.captionToggle.addEventListener("change", ApplySettings);
  ui.motionToggle.addEventListener("change", ApplySettings);
  ui.contrastToggle.addEventListener("change", ApplySettings);
  ui.volumeSlider.addEventListener("input", ApplySettings);

  document.querySelectorAll("[data-touch]").forEach((button) => {
    const key = button.dataset.touch;
    const Begin = (event) => {
      event.preventDefault();
      WakeTouchControls();
      if (key === "left" || key === "right") {
        gameState.keys[key] = true;
        NudgePlayer(key === "left" ? -1 : 1);
      }
      if (key === "interact") HandleAction();
      if (key === "depth") HandleDepth();
      if (key === "listen") {
        gameState.keys.listen = true;
        ObserveWorld();
      }
      if (key === "crouch") gameState.keys.crouch = true;
    };
    const End = (event) => {
      event.preventDefault();
      if (key === "left" || key === "right") gameState.keys[key] = false;
      if (key === "interact") EndActionInput();
      if (key === "listen") gameState.keys.listen = false;
      if (key === "crouch") gameState.keys.crouch = false;
    };
    button.addEventListener("pointerdown", Begin);
    button.addEventListener("pointerup", End);
    button.addEventListener("pointercancel", End);
    button.addEventListener("pointerleave", End);
  });
}

function HandleKeyDown(event) {
  const targetElement = event.target instanceof Element ? event.target : null;
  const nativeControl = targetElement?.closest("button,input,select,textarea,[contenteditable]");
  if (event.key === "Escape") {
    if (gameState.challenge) CloseChallenge();
    else if (!ui.accessPanel.hidden || !ui.chapterSelect.hidden) ClosePanels();
    else if (gameState.chapterActive) SetPaused(!gameState.paused);
    return;
  }
  if (nativeControl) return;
  if (gameState.chapterActive && ["ArrowLeft", "ArrowRight", "ArrowDown", " "].includes(event.key)) event.preventDefault();
  if (gameState.inDialogue && ["Enter", " ", "e", "E"].includes(event.key)) {
    if (!event.repeat) AdvanceDialogue();
    return;
  }
  if (!gameState.chapterActive && ui.titleScreen.classList.contains("isVisible") && ui.chapterSelect.hidden && ui.accessPanel.hidden && event.key === "Enter") {
    StartPrologue();
    return;
  }
  if (gameState.paused) return;
  if (QaMode && gameState.worldTask && ["[", "]"].includes(event.key) && !event.repeat) {
    event.preventDefault();
    MoveQaWorldTaskMarker(event.key === "]" ? 1 : -1);
    return;
  }
  if (QaMode && gameState.worldTask?.definition.type === "holdSequence" && event.key === "\\" && !event.repeat) {
    event.preventDefault();
    AdvanceQaWorldTaskPulse();
    return;
  }
  if (["a", "A", "ArrowLeft"].includes(event.key)) {
    gameState.keys.left = true;
    if (!event.repeat) NudgePlayer(-1);
  }
  if (["d", "D", "ArrowRight"].includes(event.key)) {
    gameState.keys.right = true;
    if (!event.repeat) NudgePlayer(1);
  }
  if (["s", "S", "ArrowDown"].includes(event.key)) gameState.keys.crouch = true;
  if (["f", "F"].includes(event.key)) {
    gameState.keys.listen = true;
    if (!event.repeat) ObserveWorld();
  }
  if (["e", "E", " "].includes(event.key) && !event.repeat) HandleAction();
  if (["s", "S", "ArrowDown"].includes(event.key) && !event.repeat) HandleDepth();
  if (["h", "H"].includes(event.key) && !event.repeat) ShowObjective(true);
}

function HandleKeyUp(event) {
  if (["a", "A", "ArrowLeft"].includes(event.key)) gameState.keys.left = false;
  if (["d", "D", "ArrowRight"].includes(event.key)) gameState.keys.right = false;
  if (["s", "S", "ArrowDown"].includes(event.key)) gameState.keys.crouch = false;
  if (["f", "F"].includes(event.key)) gameState.keys.listen = false;
  if (["e", "E", " "].includes(event.key)) EndActionInput();
}

function ApplySettings(shouldSave = true) {
  gameState.settings.captions = ui.captionToggle.checked;
  gameState.settings.reduceMotion = ui.motionToggle.checked;
  gameState.settings.highContrast = ui.contrastToggle.checked;
  gameState.settings.volume = Number(ui.volumeSlider.value) / 100;
  document.body.classList.toggle("reduceMotion", gameState.settings.reduceMotion);
  document.body.classList.toggle("highContrast", gameState.settings.highContrast);
  gameState.audio?.SetVolume(gameState.settings.volume);
  if (shouldSave) ScheduleSaveProgress();
}

function ResetInputState() {
  Object.keys(gameState.keys).forEach((key) => { gameState.keys[key] = false; });
  if (gameState.worldTask?.pressStart) {
    gameState.worldTask.step = 0;
    gameState.worldTask.pressStart = 0;
    gameState.worldTask.lastRelease = 0;
    gameState.worldTask.error = true;
    RenderWorldTaskHud("动作被打断；从这一小段的第一步重新来。");
  }
}

function ScheduleSaveProgress() {
  window.clearTimeout(ScheduleSaveProgress.timer);
  ScheduleSaveProgress.timer = window.setTimeout(SaveProgress, 260);
}

function OpenPanel(panelName, fromPause = false) {
  if (panelName === "chapters") {
    BuildChapterList();
    ui.chapterSelect.hidden = false;
  } else {
    if (fromPause) ui.pausePanel.hidden = true;
    ui.accessPanel.hidden = false;
    ui.accessPanel.dataset.fromPause = fromPause ? "true" : "false";
  }
  document.body.classList.add("uiBlocked");
}

function ClosePanels() {
  const returnToPause = ui.accessPanel.dataset.fromPause === "true";
  ui.chapterSelect.hidden = true;
  ui.accessPanel.hidden = true;
  ui.accessPanel.dataset.fromPause = "false";
  if (returnToPause && gameState.chapterActive) ui.pausePanel.hidden = false;
  if (!gameState.paused && !gameState.inDialogue) document.body.classList.remove("uiBlocked");
}

function BuildChapterList() {
  ui.chapterList.replaceChildren();
  ChapterData.forEach((chapter, index) => {
    const unlocked = index <= gameState.unlockedChapter || QaMode;
    const button = document.createElement("button");
    button.className = "chapterChoice";
    button.type = "button";
    button.disabled = !unlocked;
    button.innerHTML = `<span>${chapter.shortNumber}</span><span><b>${chapter.title}</b><small>${chapter.act} · ${chapter.date} · ${chapter.location}</small></span><em>${unlocked ? "›" : "·"}</em>`;
    button.addEventListener("click", () => StartGame(index, false));
    ui.chapterList.appendChild(button);
  });
}

function LoadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(StorageKey) || "null");
    if (saved && typeof saved === "object") {
      const currentChapter = THREE.MathUtils.clamp(Number(saved.currentChapter) || 0, 0, ChapterData.length - 1);
      const completed = Array.isArray(saved.completed) ? saved.completed.filter((id) => typeof id === "string") : [];
      gameState.savedProgress = {
        ...saved,
        currentChapter,
        completed,
        heldPropKind: typeof saved.heldPropKind === "string" ? saved.heldPropKind : "",
        playerX: saved.playerX !== null && Number.isFinite(Number(saved.playerX)) ? THREE.MathUtils.clamp(Number(saved.playerX), -StageLimit, StageLimit) : null,
        lastSafeX: saved.lastSafeX !== null && Number.isFinite(Number(saved.lastSafeX)) ? THREE.MathUtils.clamp(Number(saved.lastSafeX), -StageLimit, StageLimit) : null,
        currentLayer: saved.currentLayer === "tunnel" ? "tunnel" : "surface",
        phase: ["playing", "outro", "complete"].includes(saved.phase) ? saved.phase : "playing",
        pendingDialogue: saved.pendingDialogue && typeof saved.pendingDialogue === "object" ? saved.pendingDialogue : null
      };
      gameState.unlockedChapter = THREE.MathUtils.clamp(Number(saved.unlockedChapter) || 0, 0, ChapterData.length - 1);
      gameState.settings = { ...gameState.settings, ...(saved.settings || {}) };
      const hasCheckpoint = completed.length > 0 || currentChapter > 0 || gameState.unlockedChapter > 0 || gameState.savedProgress.phase !== "playing";
      if (hasCheckpoint) {
        ui.continueButton.hidden = false;
        ui.continueButton.querySelector("span").textContent = ChapterData[currentChapter].title;
      }
    }
  } catch (error) {
    console.warn("Progress could not be loaded.", error);
    gameState.savedProgress = null;
  }
  ui.captionToggle.checked = gameState.settings.captions;
  ui.motionToggle.checked = gameState.settings.reduceMotion;
  ui.contrastToggle.checked = gameState.settings.highContrast;
  ui.volumeSlider.value = Math.round(gameState.settings.volume * 100);
  ApplySettings(false);
  gameState.progressLoaded = true;
}

function SaveProgress() {
  if (!gameState.progressLoaded || QaMode) return;
  const previous = gameState.savedProgress;
  const useLiveState = gameState.chapterActive || !previous;
  const payload = {
    unlockedChapter: gameState.unlockedChapter,
    currentChapter: useLiveState ? gameState.chapterIndex : previous.currentChapter,
    completed: useLiveState ? [...gameState.completed] : [...(previous.completed || [])],
    heldPropKind: useLiveState ? gameState.heldPropKind : (previous.heldPropKind || ""),
    playerX: useLiveState ? Number(gameState.player?.position.x ?? ChapterData[gameState.chapterIndex].startX) : previous.playerX,
    lastSafeX: useLiveState ? Number(gameState.lastSafeX) : previous.lastSafeX,
    currentLayer: useLiveState ? gameState.currentLayer : previous.currentLayer,
    phase: useLiveState ? gameState.chapterPhase : previous.phase,
    pendingDialogue: useLiveState ? gameState.pendingDialogue : previous.pendingDialogue,
    settings: gameState.settings
  };
  gameState.savedProgress = payload;
  try { localStorage.setItem(StorageKey, JSON.stringify(payload)); } catch { /* private mode */ }
  const hasCheckpoint = payload.completed.length > 0 || payload.currentChapter > 0 || payload.unlockedChapter > 0 || payload.phase !== "playing";
  ui.continueButton.hidden = !hasCheckpoint;
  if (hasCheckpoint) ui.continueButton.querySelector("span").textContent = ChapterData[payload.currentChapter].title;
}

function GetPrologueBeat() {
  return gameState.prologue ? PrologueBeatData[gameState.prologue.beatIndex] : null;
}

function ShowPrologueObjective(beat = GetPrologueBeat()) {
  if (!beat) return;
  ui.objectiveText.textContent = beat.title;
  ui.objectiveProgress.textContent = `${gameState.prologue.beatIndex + 1} / ${PrologueBeatData.length}`;
  ui.objectiveCard.hidden = false;
  ui.objectiveCard.style.opacity = "1";
  ui.objectiveCard.style.transform = "translateY(0)";
}

function BeginPrologueBeat(beatIndex) {
  const prologue = gameState.prologue;
  if (!prologue) return;
  prologue.beatIndex = THREE.MathUtils.clamp(beatIndex, 0, PrologueBeatData.length - 1);
  prologue.beatStart = performance.now();
  prologue.lockPlayer = false;
  prologue.cameraWeight = .42;
  prologue.cameraX = gameState.player.position.x;
  prologue.cameraY = null;
  prologue.zoom = 1;
  gameState.promptSignature = "";
  const beat = GetPrologueBeat();
  ShowPrologueObjective(beat);
  if (beat.caption) ShowSoundCaption(beat.caption, beat.actionX ?? prologue.cameraX);

  if (beat.id === "preface") {
    prologue.lockPlayer = true;
    prologue.cameraX = 4.8;
    prologue.cameraWeight = 1;
    prologue.zoom = .84;
    gameState.world.prologue.userData.smokeColumns.forEach((column) => { column.visible = true; });
  } else if (beat.id === "infiltration") {
    prologue.lockPlayer = true;
    prologue.cameraX = 5.7;
    prologue.cameraWeight = 1;
    prologue.zoom = .82;
    gameState.world.prologue.userData.enemyLine.visible = true;
    gameState.world.prologue.userData.smokeColumns.forEach((column) => { column.visible = false; });
  } else if (beat.id === "alarm") {
    prologue.cameraX = -7.35;
    prologue.cameraWeight = .58;
    prologue.zoom = .96;
    gameState.world.prologue.userData.gaoLaozhong.visible = true;
  } else if (beat.id === "sacrifice") {
    prologue.lockPlayer = true;
    prologue.cameraX = -7.15;
    prologue.cameraWeight = 1;
    prologue.zoom = 1.09;
    prologue.sacrificeStarted = performance.now();
    prologue.sacrificeGunPlayed = false;
    gameState.world.prologue.userData.bell.userData.ringing = 1;
    gameState.audio.PlaySfx("metal", -7.35);
    AddCameraImpact(.52);
  } else if (beat.id === "evacuate") {
    gameState.world.prologue.userData.crowdPeople.forEach((person) => { person.visible = true; });
    prologue.cameraX = -.8;
    prologue.cameraWeight = .48;
    prologue.zoom = .96;
  } else if (beat.id === "seal") {
    prologue.cameraX = 2.55;
    prologue.cameraWeight = .5;
    prologue.zoom = 1.04;
  } else if (beat.id === "search") {
    prologue.lockPlayer = true;
    prologue.cameraX = 3.7;
    prologue.cameraY = -6.65;
    prologue.cameraWeight = 1;
    prologue.zoom = .88;
    gameState.world.prologue.userData.enemyLine.visible = true;
    gameState.world.prologue.userData.fire.visible = true;
    gameState.world.prologue.userData.smokeColumns.forEach((column) => { column.visible = true; });
    gameState.depthBlend = .64;
    AddCameraImpact(.58);
    gameState.audio.PlaySfx("earth", 5.1);
  } else if (beat.id === "aftermath") {
    prologue.lockPlayer = true;
    gameState.currentLayer = "surface";
    gameState.depthBlend = 0;
    gameState.player.position.set(4.2, SurfaceFootY, 2.8);
    gameState.player.userData.previousX = 4.2;
    prologue.cameraX = 3.5;
    prologue.cameraWeight = 1;
    prologue.zoom = .82;
    gameState.world.prologue.userData.enemyLine.visible = false;
    gameState.world.prologue.userData.crowdPeople.forEach((person) => { person.visible = false; });
    gameState.world.prologue.userData.fire.visible = true;
    gameState.world.prologue.userData.burntWall.visible = true;
    gameState.world.prologue.userData.gaoChuanbao.visible = true;
    QueueDialogue(beat.lines, () => FinishPrologue(false));
  }
}

async function StartPrologue() {
  if (gameState.prologue) return;
  ResetInputState();
  ResetChallenge();
  ResetWorldTask(false);
  await gameState.audio.Start();
  gameState.audio.SetVolume(gameState.settings.volume);
  ClosePanels();
  ui.pausePanel.hidden = true;
  ui.chapterComplete.hidden = true;
  ui.endingScreen.hidden = true;
  ui.titleScreen.classList.remove("isVisible");
  ui.titleScreen.hidden = true;
  ui.gameHeader.hidden = true;
  ui.prologueSkip.hidden = false;
  ui.controlsGuide.hidden = true;
  ui.dialoguePanel.hidden = true;
  gameState.chapterActive = true;
  gameState.paused = false;
  gameState.inDialogue = false;
  gameState.dialogueQueue = [];
  gameState.dialogueDone = null;
  gameState.dialogueSource = null;
  gameState.pendingDialogue = null;
  gameState.chapterPhase = "prologue";
  gameState.completed = new Set();
  document.body.classList.remove("endingWalk", "touchIdle", "isDialogue", "uiBlocked");
  document.body.classList.add("isPlaying", "isPrologue");
  ui.cinematicBars.classList.add("isActive");
  LoadChapter(0);
  gameState.world.consequences.visible = false;
  gameState.world.searchlight.visible = false;
  gameState.world.patrolGuard.visible = false;
  gameState.world.mobileCover.visible = false;
  gameState.markers.forEach((marker) => { marker.visible = false; });
  BuildPrologueTableau();
  gameState.player.position.set(-10.45, SurfaceFootY, 2.8);
  gameState.player.userData.previousX = -10.45;
  gameState.cameraX = -8.7;
  gameState.cameraY = SurfaceFootY + 2.55;
  gameState.cameraZoom = .9;
  gameState.camera.zoom = .9;
  gameState.camera.updateProjectionMatrix();
  gameState.prologue = {
    beatIndex: -1,
    beatStart: performance.now(),
    lockPlayer: true,
    cameraX: -7.35,
    cameraY: null,
    cameraWeight: 1,
    zoom: .84,
    evacuationStarted: 0,
    waitingForDepth: false
  };
  ui.colorWash.style.background = "radial-gradient(ellipse at 44% 38%, transparent 34%, rgba(16,20,18,.22) 88%), linear-gradient(180deg, rgba(122,139,135,.12), rgba(117,80,45,.16))";
  ui.chapterNumber.textContent = "序章 · 一九四二";
  ui.chapterTitle.textContent = "高老忠的钟声";
  ui.chapterDate.textContent = "一九四二年五月 · 深夜";
  ui.chapterLocation.textContent = "冀中平原 · 高家庄 · 黑风口偷袭";
  ui.chapterCard.hidden = false;
  window.setTimeout(() => {
    if (gameState.prologue) ui.chapterCard.hidden = true;
  }, gameState.settings.reduceMotion ? 900 : 3200);
  BeginPrologueBeat(0);
  ApplyQaPrologueBeat(QaPrologueBeatId);
  if (QaPrologueAutoAction && QaPrologueBeatId) {
    window.setTimeout(() => {
      if (gameState.prologue && GetPrologueBeat()?.id === QaPrologueBeatId) HandlePrologueAction();
    }, 300);
  }
  RenderOnce();
}

function FinishPrologue(skipped = false) {
  if (!gameState.prologue) return;
  gameState.prologue = null;
  gameState.world.prologue.visible = false;
  ui.prologueSkip.hidden = true;
  ui.objectiveCard.hidden = true;
  ui.interactionPrompt.hidden = true;
  ui.dialoguePanel.hidden = true;
  ui.chapterCard.hidden = true;
  ui.cinematicBars.classList.remove("isActive");
  gameState.dialogueQueue = [];
  gameState.dialogueDone = null;
  gameState.inDialogue = false;
  gameState.paused = true;
  document.body.classList.remove("isDialogue", "isPrologue");
  if (!skipped) {
    ui.screenFlash.style.opacity = ".18";
    window.setTimeout(() => { ui.screenFlash.style.opacity = "0"; }, 260);
  }
  StartGame(0, false);
}

function HandlePrologueAction() {
  const prologue = gameState.prologue;
  const beat = GetPrologueBeat();
  if (!prologue || !beat || gameState.paused || gameState.inDialogue || gameState.depthTransition) return;
  const distance = Math.abs(gameState.player.position.x - Number(beat.actionX));
  if (!Number.isFinite(Number(beat.actionX)) || distance > 1.3) return;
  if (beat.id === "alarm") {
    gameState.world.prologue.userData.bell.userData.ringing = 1;
    gameState.audio.PlaySfx("metal", beat.actionX);
    AddCameraImpact(.48);
    ShowSoundCaption("高老忠抓住钟绳；第一声警钟越过高家庄屋脊", beat.actionX);
    BeginPrologueBeat(3);
  } else if (beat.id === "evacuate") {
    prologue.evacuationStarted = performance.now();
    prologue.lockPlayer = true;
    gameState.audio.PlaySfx("crowd", beat.actionX);
    ShowSoundCaption("前景 · 老幼贴墙移向近洞；后景 · 民兵仍在逐户点名", beat.actionX);
    StartCameraShot(.5, { zoom: .9, duration: 5200, enter: 500, exit: 800 });
  } else if (beat.id === "seal") {
    prologue.waitingForDepth = true;
    prologue.lockPlayer = true;
    gameState.audio.PlaySfx("wood", beat.actionX);
    ShowSoundCaption("最后一双脚离开井口，门板才从内侧合上", beat.actionX);
    gameState.world.prologue.userData.crowdPeople.forEach((person) => { person.visible = false; });
    TransitionDepth(beat.actionX);
  }
}

function ApplyQaPrologueBeat(beatId) {
  if (!QaMode || !gameState.prologue || !beatId) return;
  const beatIndex = PrologueBeatData.findIndex((beat) => beat.id === beatId);
  if (beatIndex < 0) return;
  const beat = PrologueBeatData[beatIndex];
  const tableau = gameState.world.prologue.userData;
  if (beatIndex > 0) ui.chapterCard.hidden = true;
  if (Number.isFinite(Number(beat.actionX))) {
    gameState.player.position.set(Number(beat.actionX), SurfaceFootY, 2.8);
    gameState.player.userData.previousX = Number(beat.actionX);
  }
  if (beatIndex >= 2) tableau.gaoLaozhong.visible = true;
  if (beatIndex >= 3) {
    gameState.prologue.sacrificeStarted = performance.now() - 9000;
    gameState.prologue.sacrificeGunPlayed = true;
  }
  if (beatIndex === 4) tableau.crowdPeople.forEach((person) => { person.visible = true; });
  if (beatIndex >= 6) {
    tableau.crowdPeople.forEach((person) => { person.visible = false; });
    gameState.currentLayer = "tunnel";
    gameState.player.position.set(2.55, TunnelFootY, 2.8);
    gameState.player.userData.previousX = 2.55;
    gameState.depthBlend = .64;
  }
  BeginPrologueBeat(beatIndex);
}

function UpdatePrologue(delta, time, now) {
  const prologue = gameState.prologue;
  const beat = GetPrologueBeat();
  if (!prologue || !beat) return;
  const elapsed = now - prologue.beatStart;
  const tableau = gameState.world.prologue.userData;
  const bellEnergy = tableau.bell.userData.ringing;
  if (bellEnergy > .001) {
    tableau.bell.userData.ringing = Math.max(0, bellEnergy - delta * .44);
    tableau.bell.userData.bell.rotation.z = Math.sin(time * 11.5) * .14 * bellEnergy;
    tableau.bell.userData.rope.rotation.z = Math.sin(time * 8.8 + .6) * .045 * bellEnergy;
  }

  tableau.crowdPeople.forEach((person, index) => {
    const evacuationProgress = prologue.evacuationStarted
      ? THREE.MathUtils.smoothstep(now - prologue.evacuationStarted, 0, 4300)
      : 0;
    const moving = evacuationProgress > 0 && evacuationProgress < 1;
    if (moving) person.position.x = THREE.MathUtils.lerp(person.userData.homeX, person.userData.entryX, evacuationProgress);
    AnimatePerson(person, time, moving ? 1 : 0, false, index === 0);
    if (evacuationProgress >= .96) person.visible = false;
  });

  if (tableau.gaoLaozhong.visible) {
    const sacrificeElapsed = prologue.sacrificeStarted ? now - prologue.sacrificeStarted : 0;
    const falling = prologue.sacrificeStarted ? THREE.MathUtils.smoothstep(sacrificeElapsed, 5400, 8200) : 0;
    tableau.gaoLaozhong.userData.fallen = falling;
    tableau.gaoLaozhong.userData.posePivot.rotation.z = THREE.MathUtils.lerp(0, -1.18, falling);
    tableau.gaoLaozhong.userData.posePivot.position.x = THREE.MathUtils.lerp(0, -.1, falling);
    tableau.gaoLaozhong.userData.shadow.position.x = THREE.MathUtils.lerp(0, -.78, falling);
    tableau.gaoLaozhong.userData.shadow.scale.set(
      THREE.MathUtils.lerp(1, 2.25, falling),
      THREE.MathUtils.lerp(1, 1.28, falling),
      1
    );
    tableau.gaoLaozhong.position.y = SurfaceFootY - falling * .05;
    AnimatePerson(tableau.gaoLaozhong, time, beat.id === "alarm" ? .45 : 0, false, false);
    if (beat.id === "sacrifice" && sacrificeElapsed > 3000 && !prologue.sacrificeGunPlayed) {
      prologue.sacrificeGunPlayed = true;
      gameState.audio.PlaySfx("metal", -7.35);
      AddCameraImpact(.72);
    }
  }

  const sequenceProgress = beat.duration ? THREE.MathUtils.clamp(elapsed / beat.duration, 0, 1) : 0;
  tableau.enemies.forEach((enemy, index) => {
    const startX = beat.id === "search" ? 7.8 : 11.4;
    const distance = beat.id === "search" ? 12.2 : 7.2;
    enemy.position.x = startX + enemy.userData.columnOffset - sequenceProgress * distance;
    SetPatrolFrame(enemy, sequenceProgress < 1 ? (Math.floor(time * 4.1 + index * .7) % 2) : 3);
    enemy.userData.sprite.position.y = enemy.userData.baseSpriteY + Math.sin(time * 5.2 + index) * .012;
  });
  tableau.smokeColumns.forEach((column, columnIndex) => {
    column.userData.puffs.forEach((puff, puffIndex) => {
      const drift = Math.sin(time * .42 + puffIndex * .8 + columnIndex) * .12;
      puff.position.x = Math.sin(puffIndex * 1.7) * .28 + drift;
      puff.scale.x = 1.25 + (puffIndex % 3) * .18 + Math.sin(time * .58 + puffIndex) * .05;
    });
  });
  tableau.fire.userData.flames.forEach((flame, index) => {
    const quiet = beat.id === "aftermath" ? .34 : 1;
    flame.scale.y = quiet * (.84 + Math.sin(time * 7.4 + index) * .17);
    flame.scale.x = .94 + Math.sin(time * 5.3 + index * .7) * .09;
  });

  if (beat.id === "preface" && elapsed >= beat.duration) BeginPrologueBeat(1);
  else if (beat.id === "infiltration" && elapsed >= beat.duration) BeginPrologueBeat(2);
  else if (beat.id === "sacrifice" && elapsed >= beat.duration) BeginPrologueBeat(4);
  else if (beat.id === "evacuate" && prologue.evacuationStarted && now - prologue.evacuationStarted >= 5200) {
    BeginPrologueBeat(5);
  } else if (beat.id === "seal" && prologue.waitingForDepth && !gameState.depthTransition && gameState.currentLayer === "tunnel") {
    BeginPrologueBeat(6);
  } else if (beat.id === "search" && elapsed >= beat.duration) BeginPrologueBeat(7);
}

async function StartGame(chapterIndex, resume = false) {
  gameState.prologue = null;
  gameState.world.prologue.visible = false;
  ui.prologueSkip.hidden = true;
  document.body.classList.remove("isPrologue");
  ResetInputState();
  ResetChallenge();
  ResetWorldTask(false);
  await gameState.audio.Start();
  gameState.audio.SetVolume(gameState.settings.volume);
  ClosePanels();
  ui.pausePanel.hidden = true;
  ui.chapterComplete.hidden = true;
  ui.endingScreen.hidden = true;
  ui.endingScreen.classList.remove("isVisible", "isEpilogue", "isSettled");
  ui.titleScreen.classList.remove("isVisible");
  ui.titleScreen.hidden = true;
  ui.gameHeader.hidden = false;
  gameState.chapterActive = true;
  gameState.paused = true;
  document.body.classList.remove("endingWalk", "touchIdle");
  document.body.classList.remove("isDialogue");
  document.body.classList.add("isPlaying", "uiBlocked");
  WakeTouchControls();
  gameState.inDialogue = false;
  gameState.dialogueQueue = [];
  gameState.dialogueSource = null;
  gameState.pendingDialogue = null;
  gameState.chapterEnding = false;
  gameState.smokeDecayCinematic = false;
  gameState.chapterPhase = "playing";
  gameState.epilogue = false;
  gameState.completed = new Set();
  const resumeData = resume ? gameState.savedProgress : null;
  if (resume) {
    if (resumeData?.currentChapter === chapterIndex) {
      gameState.completed = new Set(resumeData.completed || []);
      gameState.pendingDialogue = resumeData.pendingDialogue || null;
      gameState.chapterPhase = resumeData.phase || "playing";
    }
  }
  const qaTargetAction = QaActionId ? ChapterData[chapterIndex].interactions.find((action) => action.id === QaActionId) : null;
  if (qaTargetAction && !resume) {
    const actionMap = new Map(ChapterData[chapterIndex].interactions.map((action) => [action.id, action]));
    const AddRequirements = (action) => {
      (action?.requires || []).forEach((requiredId) => {
        const requiredAction = actionMap.get(requiredId);
        AddRequirements(requiredAction);
        gameState.completed.add(requiredId);
      });
    };
    AddRequirements(qaTargetAction);
  }
  const restoredHeldKind = resumeData?.currentChapter === chapterIndex ? (resumeData.heldPropKind || "") : "";
  const restoredPlayerX = resumeData?.currentChapter === chapterIndex ? resumeData.playerX : null;
  const restoredSafeX = resumeData?.currentChapter === chapterIndex ? resumeData.lastSafeX : null;
  LoadChapter(chapterIndex, restoredHeldKind, restoredPlayerX, restoredSafeX);
  if (qaTargetAction) ApplyQaActionPosition(qaTargetAction);
  if (!resume && !qaTargetAction) {
    const chapter = ChapterData[chapterIndex];
    const firstActionX = chapter.interactions[0]?.x ?? chapter.startX;
    StartCameraShot((chapter.startX + firstActionX) * .5, { zoom: .86, duration: 3250, enter: 520, exit: 720 });
  }
  if (resumeData?.currentChapter === chapterIndex && resumeData.currentLayer === "tunnel" && CanUseEntrances()) {
    gameState.currentLayer = "tunnel";
    gameState.depthBlend = 1;
    gameState.player.position.y = TunnelFootY;
    gameState.cameraY = TunnelFootY + 1.9;
    gameState.camera.position.y = gameState.cameraY;
    gameState.audio.SetDepth(1);
    ui.touchDepthLabel.textContent = "上行";
  }
  SaveProgress();
  await ShowChapterCard();
  if (resume) {
    ResumeCheckpoint();
    return;
  }
  QueueDialogue(ChapterData[chapterIndex].intro, () => {
    gameState.paused = false;
    document.body.classList.remove("uiBlocked");
    ShowObjective(true);
    if (chapterIndex === 0) {
      ui.controlsGuide.hidden = false;
      window.setTimeout(() => { ui.controlsGuide.hidden = true; }, 7000);
    }
  });
}

function ApplyQaActionPosition(action) {
  gameState.currentLayer = action.layer;
  gameState.depthBlend = action.layer === "tunnel" ? 1 : 0;
  if (gameState.chapterIndex === 4 && gameState.completed.has("readBlockade")) {
    // A dependency checkpoint skips the original side effect that starts the
    // smoke simulation. Seed a visible in-flight plume so seal/decay can still
    // be verified in the real browser without replaying the entire chapter.
    gameState.smokePressure = Math.max(gameState.smokePressure, .58);
  }
  gameState.player.position.set(action.x, action.layer === "tunnel" ? TunnelFootY : SurfaceFootY, 2.8);
  gameState.player.userData.previousX = action.x;
  if (gameState.chapterIndex === 4) gameState.lastSmokeSafeX = action.x;
  gameState.cameraX = ClampCameraX(action.x);
  gameState.cameraY = gameState.player.position.y + (action.layer === "tunnel" ? 1.9 : 2.55);
  gameState.camera.position.set(gameState.cameraX, gameState.cameraY, 24);
  gameState.camera.lookAt(gameState.cameraX, gameState.cameraY, 0);
  ui.touchDepthLabel.textContent = action.layer === "surface" ? "下行" : "上行";
  gameState.audio.SetDepth(gameState.depthBlend);
  UpdateEnvironment(0, gameState.clock.elapsedTime);
  UpdateMarkers();
  ApplyParallax(gameState.cameraX);
  RenderOnce();
}

function LoadChapter(chapterIndex, restoredHeldKind = "", restoredPlayerX = null, restoredSafeX = null) {
  gameState.chapterIndex = chapterIndex;
  gameState.world.prologue.visible = false;
  gameState.world.epilogue.visible = false;
  DisposeChildren(gameState.world.epilogue);
  gameState.world.epilogue.userData.beatObjects = {};
  gameState.currentLayer = "surface";
  ui.touchDepthLabel.textContent = "下行";
  gameState.depthBlend = 0;
  gameState.depthTransition = null;
  gameState.world.depthOccluder.visible = false;
  gameState.carry = gameState.completed.has("liftXiaoman") && chapterIndex === 0;
  ClearHeldProp();
  gameState.noiseCover = 0;
  gameState.smokePressure = 0;
  gameState.suspicion = 0;
  gameState.crouchPathFailures = new Set();
  gameState.cameraShot = null;
  gameState.cameraShake = 0;
  gameState.cameraZoom = 1;
  const chapter = ChapterData[chapterIndex];
  let spawnX = restoredPlayerX !== null && Number.isFinite(Number(restoredPlayerX))
    ? THREE.MathUtils.clamp(Number(restoredPlayerX), -StageLimit, StageLimit)
    : chapter.startX;
  if (chapterIndex === 1 && restoredHeldKind === "medicine") {
    const mobileAction = chapter.interactions.find((action) => action.mobileCover);
    const authoredStops = mobileAction?.mobileCover?.stops || [4.85];
    const safeMedicineX = gameState.completed.has(mobileAction?.id)
      ? authoredStops[authoredStops.length - 1]
      : authoredStops[0];
    spawnX = Number(safeMedicineX);
  }
  const safeX = restoredSafeX !== null && Number.isFinite(Number(restoredSafeX))
    ? THREE.MathUtils.clamp(Number(restoredSafeX), -StageLimit, StageLimit)
    : spawnX;
  gameState.lastSafeX = chapterIndex === 1 && restoredHeldKind === "medicine" ? spawnX : safeX;
  gameState.lastSmokeSafeX = chapter.startX;
  gameState.player.position.set(spawnX, SurfaceFootY, 2.8);
  gameState.player.userData.previousX = spawnX;
  gameState.player.userData.walkDistance = 0;
  gameState.player.userData.spriteMesh.material.opacity = 1;
  gameState.player.userData.spriteMesh.scale.y = 1;
  gameState.player.userData.spriteMesh.position.y = gameState.player.userData.baseVisualY;
  SetSpriteFrame(gameState.player, gameState.carry ? 5 : 0);
  RestoreHeldPropForChapter(chapter, restoredHeldKind);
  gameState.cameraX = ClampCameraX(spawnX);
  gameState.cameraY = SurfaceFootY + 2.55;
  gameState.camera.position.set(gameState.cameraX, gameState.cameraY, 24);
  gameState.camera.zoom = 1;
  gameState.camera.updateProjectionMatrix();
  gameState.camera.lookAt(gameState.cameraX, gameState.cameraY, 0);
  ApplyParallax(gameState.cameraX);
  const surfaceTint = new THREE.Color(chapter.surfaceTint);
  const layers = gameState.world.surfaceLayerMaterials;
  layers.mountainMaterial.color.copy(surfaceTint).lerp(new THREE.Color("#aebbb9"), .46);
  layers.chapterDressMaterial.color.copy(surfaceTint).lerp(new THREE.Color("#c5c7bd"), .56);
  layers.villageMaterial.color.copy(surfaceTint).lerp(new THREE.Color("#e0d8c7"), .67);
  layers.groundMaterial.color.copy(surfaceTint).lerp(new THREE.Color("#dec7a7"), .58);
  layers.foregroundMaterial.color.copy(surfaceTint).lerp(new THREE.Color("#6f746c"), .27);
  const dressOpacityByChapter = [.54, .58, .55, .6, .57, .62];
  gameState.world.chapterDressMaterial.userData.depthOpacity = dressOpacityByChapter[chapterIndex] ?? .58;
  gameState.world.chapterDressMaterial.opacity = gameState.world.chapterDressMaterial.userData.depthOpacity;
  SetGridAtlasFrame(gameState.world.chapterDressPlane.geometry, 2, 3, chapterIndex);
  gameState.world.tunnelMaterials.forEach((material) => material.color.set(chapter.tunnelTint));
  const usesPatrol = chapter.threatMode === "patrol";
  gameState.world.searchlight.visible = Boolean(chapter.threat && !usesPatrol);
  gameState.world.patrolGuard.visible = Boolean(chapter.threat && usesPatrol);
  const patrol = gameState.world.patrolGuard;
  if (patrol) {
    patrol.position.x = -7.65;
    patrol.userData.facing = 1;
    patrol.userData.targetFacing = 1;
    patrol.userData.patrolDirection = 1;
    patrol.userData.patrolX = -7.65;
    patrol.userData.phase = "walk";
    patrol.userData.phaseElapsed = 0;
    patrol.userData.turnSwapped = false;
    patrol.userData.walkDistance = 0;
    patrol.userData.frame = 0;
    patrol.userData.facingPivot.scale.set(1, 1, 1);
    patrol.userData.sprite.position.set(0, patrol.userData.baseSpriteY, 0);
    patrol.userData.sprite.rotation.z = 0;
    patrol.userData.sprite.material.opacity = 1;
    SetGridAtlasFrame(patrol.userData.sprite.geometry, 4, 1, 0);
  }
  const mobileCoverAction = chapter.interactions.find((action) => action.mobileCover);
  const mobileCover = gameState.world.mobileCover;
  if (mobileCoverAction?.mobileCover && mobileCover) {
    const authoredStops = mobileCoverAction.mobileCover.stops.map(Number);
    const restoredStop = gameState.completed.has(mobileCoverAction.id) ? authoredStops.length - 1 : 0;
    mobileCover.userData.stops = authoredStops;
    mobileCover.userData.targetStopIndex = restoredStop;
    mobileCover.userData.lastStopIndex = restoredStop;
    mobileCover.userData.wheelPhase = 0;
    mobileCover.position.set(authoredStops[restoredStop], SurfaceFootY, 3.24);
    mobileCover.userData.cart.position.y = .9;
    mobileCover.userData.cart.rotation.z = 0;
    mobileCover.visible = true;
  } else if (mobileCover) {
    mobileCover.visible = false;
  }
  gameState.world.surfaceFar.visible = true;
  gameState.world.surfaceDress.visible = true;
  gameState.world.surfaceMid.visible = true;
  gameState.world.surfaceNear.visible = true;
  gameState.world.foreground.visible = true;
  gameState.world.tunnelFar.visible = false;
  gameState.world.tunnelNear.visible = false;
  gameState.world.tunnelLightLayer.visible = false;
  gameState.world.tunnelForeground.visible = false;
  gameState.world.surfaceDust.visible = true;
  gameState.world.tunnelDust.visible = false;
  ui.colorWash.style.background = chapter.wash;
  ui.chapterStampNumber.textContent = chapter.shortNumber;
  ui.chapterStampTitle.textContent = chapter.title;
  gameState.audio.SetChapter(chapterIndex);
  gameState.audio.SetDepth(0);
  const tunnelXs = chapter.interactions
    .filter((action) => action.layer === "tunnel")
    .map((action) => Number(action.x))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (tunnelXs.length) {
    const lightIndexes = [0, Math.floor((tunnelXs.length - 1) * .5), tunnelXs.length - 1];
    gameState.world.tunnelLightPools.forEach((pool, index) => {
      pool.position.x = tunnelXs[lightIndexes[index]];
      pool.userData.storyActionId = chapter.interactions.find((action) => (
        action.layer === "tunnel" && Math.abs(Number(action.x) - pool.position.x) < .01
      ))?.id || "";
    });
  }
  BuildChapterConsequences(chapterIndex);
  BuildChapterMarkers();
  RenderOnce();
}

function ResumeCheckpoint() {
  const chapter = ChapterData[gameState.chapterIndex];
  const pending = gameState.pendingDialogue;
  if (pending?.type === "action") {
    const action = chapter.interactions.find((item) => item.id === pending.actionId);
    if (action?.dialogue?.length) {
      QueueDialogue(action.dialogue, AfterActionResolution, { type: "action", actionId: action.id }, Number(pending.index) || 0);
      return;
    }
    gameState.pendingDialogue = null;
  }
  if (pending?.type === "outro" || gameState.chapterPhase === "outro") {
    FinishChapter(Number(pending?.index) || 0);
    return;
  }
  if (gameState.chapterPhase === "complete") {
    PresentChapterComplete();
    return;
  }
  if (chapter.interactions.every((item) => gameState.completed.has(item.id))) {
    FinishChapter();
    return;
  }
  gameState.paused = false;
  document.body.classList.remove("uiBlocked");
  UpdateMarkers();
  ShowObjective(true);
}

async function ShowChapterCard() {
  const chapter = ChapterData[gameState.chapterIndex];
  ui.chapterNumber.textContent = `${chapter.act} · ${chapter.number}`;
  ui.chapterTitle.textContent = chapter.title;
  ui.chapterDate.textContent = chapter.date;
  ui.chapterLocation.textContent = chapter.location;
  ui.chapterCard.hidden = false;
  await Delay(gameState.settings.reduceMotion ? 750 : 1850);
  ui.chapterCard.hidden = true;
}

function BuildChapterMarkers() {
  gameState.markers.forEach((marker) => {
    gameState.world.gameplay.remove(marker);
    DisposeTree(marker);
  });
  gameState.markers.clear();
  const chapter = ChapterData[gameState.chapterIndex];
  chapter.interactions.forEach((action) => {
    const marker = CreateMarker(action);
    gameState.world.gameplay.add(marker);
    gameState.markers.set(action.id, marker);
  });
  UpdateMarkers();
}

function BuildChapterConsequences(chapterIndex) {
  const layer = gameState.world.consequences;
  DisposeChildren(layer);
  layer.visible = true;
  gameState.world.smokeLine = null;
  const Place = (kind, x, worldLayer, scale = 1) => {
    const prop = CreateProp(kind);
    prop.position.set(x, worldLayer === "tunnel" ? TunnelFootY : SurfaceFootY, 1.55);
    prop.scale.setScalar(scale);
    prop.userData.consequence = true;
    layer.add(prop);
    return prop;
  };

  const chapter = ChapterData[chapterIndex];
  (chapter.physicalCovers || []).forEach((cover) => {
    const prop = Place(cover.kind, cover.x, "surface", cover.scale || 1);
    prop.position.z = 3.24;
    prop.userData.physicalCover = true;
    prop.traverse((child) => {
      if (child.isMesh) child.renderOrder = Math.max(12, child.renderOrder || 0);
    });
  });

  if (chapterIndex >= 3) {
    Place("brace", 0, "tunnel", .92);
    Place("duckboard", 7.25, "tunnel", 1.08);
  }
  if (chapterIndex >= 4) {
    const sealedDecoy = Place("seal", -5.65, "tunnel", .82);
    sealedDecoy.rotation.z = -.04;
  }
  if (chapterIndex >= 5) {
    const wetSeed = Place("grain", 6.75, "surface", .78);
    wetSeed.traverse((child) => {
      if (child.isMesh && child.material?.color) child.material.color.lerp(new THREE.Color("#52615d"), .5);
    });
  }
  if (chapterIndex === 4) {
    const smokeLine = Place("smoke", -8.8, "tunnel", 1.3);
    smokeLine.visible = false;
    smokeLine.position.z = 2.05;
    gameState.world.smokeLine = smokeLine;
  }
}

function GetCurrentObjective() {
  const chapter = ChapterData[gameState.chapterIndex];
  return chapter.objectives.find((objective) => objective.ids.some((id) => !gameState.completed.has(id))) || null;
}

function ShowObjective(force = false) {
  const objective = GetCurrentObjective();
  if (!objective) return;
  const completeCount = objective.ids.filter((id) => gameState.completed.has(id)).length;
  ui.objectiveText.textContent = objective.title;
  ui.objectiveProgress.textContent = objective.ids.length > 1 ? `${completeCount} / ${objective.ids.length}` : "";
  ui.objectiveCard.hidden = false;
  ui.objectiveCard.style.opacity = "1";
  ui.objectiveCard.style.transform = "translateY(0)";
  const delay = force ? 4600 : 2600;
  window.clearTimeout(ShowObjective.timer);
  ShowObjective.timer = window.setTimeout(() => {
    ui.objectiveCard.style.opacity = "0";
    ui.objectiveCard.style.transform = "translateY(-8px)";
    window.setTimeout(() => { if (ui.objectiveCard.style.opacity === "0") ui.objectiveCard.hidden = true; }, 320);
  }, delay);
}

function ObserveWorld() {
  if (gameState.paused || gameState.inDialogue || !gameState.chapterActive) return;
  if (gameState.prologue) {
    ShowPrologueObjective();
    return;
  }
  ShowObjective(true);
  const chapter = ChapterData[gameState.chapterIndex];
  const candidates = chapter.interactions.filter((action) => action.layer === gameState.currentLayer && IsActionAvailable(action));
  if (!candidates.length) return;
  const nearest = candidates.reduce((best, action) => Math.abs(action.x - gameState.player.position.x) < Math.abs(best.x - gameState.player.position.x) ? action : best);
  StartCameraShot(THREE.MathUtils.lerp(gameState.player.position.x, nearest.x, .62), { zoom: 1.1, duration: 1500, enter: 350, exit: 500 });
  ShowSoundCaption(`可留意：${nearest.name}`, nearest.x);
  gameState.audio.PlaySfx(gameState.currentLayer === "tunnel" ? "knock" : "wind", nearest.x);
}

function IsActionAvailable(action) {
  if (gameState.completed.has(action.id)) {
    const canRepeat = action.repeatUntil
      && !gameState.completed.has(action.repeatUntil)
      && (!action.noiseCover || gameState.noiseCover <= .05);
    if (!canRepeat) return false;
  }
  if (action.requiresHeld && gameState.heldPropKind !== action.requiresHeld) return false;
  return (action.requires || []).every((id) => gameState.completed.has(id));
}

function UpdateMarkers(time = 0) {
  gameState.markers.forEach((marker, id) => {
    const action = marker.userData.action;
    const available = IsActionAvailable(action);
    const blocked = available ? GetActionBlock(action) : null;
    const completed = gameState.completed.has(id);
    const persistent = completed && !action.pickupKind && PersistentPropKinds.has(action.kind);
    const activeStationsTask = gameState.worldTask?.action.id === action.id
      && gameState.worldTask.definition.type === "stations"
      ? gameState.worldTask
      : null;
    const markerLayer = activeStationsTask?.taskLayer || action.layer;
    const layerVisible = markerLayer === "surface" ? gameState.depthBlend < .5 : gameState.depthBlend >= .5;
    const hiddenByFreeTask = gameState.worldTask?.action.id === action.id
      && ["configuration", "evidence"].includes(gameState.worldTask.definition.type);
    if (hiddenByFreeTask) {
      marker.visible = false;
      return;
    }
    marker.visible = (available || persistent) && layerVisible;
    marker.userData.ring.visible = available;
    marker.userData.dot.visible = available;
    if (persistent) {
      ApplyCompletedMarkerState(marker);
      if (!available) return;
    }
    const highContrast = gameState.settings.highContrast;
    marker.userData.ring.material.opacity = available ? (highContrast ? .92 : .46 + Math.sin(time * 3 + action.x) * .13) : (highContrast ? .2 : .08);
    marker.userData.ring.material.color.set(blocked ? "#b56e53" : "#e6d9b5");
    marker.userData.dot.material.opacity = available ? .85 : .14;
    marker.userData.dot.material.color.set(blocked ? "#a95142" : "#d6a05a");
    marker.userData.ring.scale.setScalar(highContrast ? 1.3 : 1 + Math.sin(time * 2.2 + action.x) * .09);
    const flame = marker.getObjectByName("flame");
    if (flame) {
      flame.scale.y = 1.45 + Math.sin(time * 9 + action.x) * .14;
      flame.rotation.z = Math.sin(time * 6) * .08;
    }
  });
}

function FindNearestAction() {
  const chapter = ChapterData[gameState.chapterIndex];
  let nearest = null;
  let nearestDistance = Infinity;
  chapter.interactions.forEach((action) => {
    if (action.layer !== gameState.currentLayer || !IsActionAvailable(action)) return;
    const distance = Math.abs(gameState.player.position.x - action.x);
    if (distance < 1.35 && distance < nearestDistance) {
      nearest = action;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function CanUseEntrances() {
  if (gameState.epilogue) return false;
  const chapter = ChapterData[gameState.chapterIndex];
  return !chapter.entryGate || gameState.completed.has(chapter.entryGate);
}

function FindNearestEntrance() {
  if (!CanUseEntrances()) return null;
  const chapter = ChapterData[gameState.chapterIndex];
  let nearest = null;
  let distance = Infinity;
  chapter.entrances.forEach((entryX) => {
    const currentDistance = Math.abs(gameState.player.position.x - entryX);
    if (currentDistance < 1.15 && currentDistance < distance) {
      nearest = entryX;
      distance = currentDistance;
    }
  });
  return nearest;
}

function UpdatePrompt() {
  if (gameState.prologue) {
    UpdateProloguePrompt();
    return;
  }
  if (gameState.worldTask) {
    ui.interactionPrompt.hidden = true;
    gameState.currentPrompt = null;
    gameState.promptSignature = "worldTask";
    return;
  }
  if (gameState.epilogue) {
    ui.interactionPrompt.hidden = true;
    gameState.currentPrompt = null;
    gameState.promptSignature = "epilogue";
    return;
  }
  if (gameState.paused || gameState.inDialogue || gameState.depthTransition) {
    if (gameState.promptSignature !== "blocked") ui.interactionPrompt.hidden = true;
    gameState.promptSignature = "blocked";
    gameState.currentPrompt = null;
    return;
  }
  const action = FindNearestAction();
  if (action) {
    gameState.currentPrompt = { type: "action", action };
    const block = GetActionBlock(action);
    const signature = `action:${action.id}:${block?.code || (action.autoWhenCrouched ? "crouch" : "ready")}`;
    if (signature !== gameState.promptSignature) {
      ui.interactionVerb.textContent = block?.verb || (action.autoWhenCrouched ? "伏低穿过" : action.verb);
      ui.interactionName.textContent = action.name;
      ui.interactionKey.textContent = block ? "…" : (action.autoWhenCrouched ? "S" : "E");
      ui.touchInteractLabel.textContent = block?.verb || (action.autoWhenCrouched ? "蹲伏" : action.verb);
      ui.interactionPrompt.hidden = false;
      gameState.promptSignature = signature;
    }
    return;
  }
  const entrance = FindNearestEntrance();
  if (entrance !== null) {
    gameState.currentPrompt = { type: "depth", entrance };
    const signature = `depth:${gameState.currentLayer}:${entrance}`;
    if (signature !== gameState.promptSignature) {
      ui.interactionVerb.textContent = gameState.currentLayer === "surface" ? "下入地道" : "回到地面";
      ui.interactionName.textContent = gameState.currentLayer === "surface" ? "入口保持伪装" : "先听清出口动静";
      ui.interactionKey.textContent = "S";
      ui.touchDepthLabel.textContent = gameState.currentLayer === "surface" ? "下行" : "上行";
      ui.interactionPrompt.hidden = false;
      gameState.promptSignature = signature;
    }
    return;
  }
  gameState.currentPrompt = null;
  ui.touchInteractLabel.textContent = "行动";
  if (gameState.promptSignature !== "none") ui.interactionPrompt.hidden = true;
  gameState.promptSignature = "none";
}

function UpdateProloguePrompt() {
  const beat = GetPrologueBeat();
  if (!beat || gameState.paused || gameState.inDialogue || gameState.depthTransition) {
    ui.interactionPrompt.hidden = true;
    gameState.currentPrompt = null;
    gameState.promptSignature = "prologueBlocked";
    return;
  }
  const actionX = Number(beat.actionX);
  const inRange = Number.isFinite(actionX) && Math.abs(gameState.player.position.x - actionX) <= 1.3;
  if (!inRange || !["alarm", "evacuate", "seal"].includes(beat.id)) {
    ui.interactionPrompt.hidden = true;
    gameState.currentPrompt = null;
    gameState.promptSignature = `prologue:${beat.id}:travel`;
    return;
  }
  const copy = {
    alarm: ["拉响警钟", "让各院同时听见", "警讯"],
    evacuate: ["接住队尾", "老幼先走，民兵逐户点名", "引导"],
    seal: ["合上门板", "等最后一双脚离开井口", "关门"]
  }[beat.id];
  const signature = `prologue:${beat.id}:ready`;
  if (signature !== gameState.promptSignature) {
    ui.interactionVerb.textContent = copy[0];
    ui.interactionName.textContent = copy[1];
    ui.interactionKey.textContent = "E";
    ui.touchInteractLabel.textContent = copy[2];
    ui.interactionPrompt.hidden = false;
    gameState.promptSignature = signature;
  }
  gameState.currentPrompt = { type: "prologue", beatId: beat.id };
}

function HandleAction() {
  if (gameState.prologue) {
    HandlePrologueAction();
    return;
  }
  BeginActionInput();
}

function HandleDepth() {
  if (gameState.prologue) return;
  if (gameState.paused || gameState.inDialogue || gameState.depthTransition) return;
  const task = gameState.worldTask;
  if (task && !task.definition.allowDepthTransitions) return;
  const entrance = FindNearestEntrance();
  if (entrance === null) {
    if (task?.definition.allowDepthTransitions) {
      const node = task.definition.nodes?.[task.step];
      task.error = true;
      RenderWorldTaskHud(node?.transitionHint || "先回到最近的伪装入口，再按 S 切换地上与地下。这里只能从真实入口换层。");
    }
    return;
  }
  TransitionDepth(entrance);
}

function GetActionBlock(action) {
  if (action.crouchPath && gameState.crouchPathFailures.has(action.id)) {
    return {
      code: "crouchPath",
      verb: "退回上一遮挡",
      caption: "途中曾起身露出轮廓。退回上一处实体遮挡，再从头伏低穿过。"
    };
  }
  if (action.requiresNoiseCover && gameState.noiseCover <= .05) {
    return {
      code: "noise",
      verb: action.waitVerb || "先续磨声",
      caption: action.waitCaption || "石磨声已经停了。抱紧东西退回磨盘，按原来的错拍再推一轮。"
    };
  }
  if (action.requiresBeamAway) {
    const threatX = gameState.world.patrolGuard?.visible
      ? gameState.world.patrolGuard.position.x
      : gameState.world.searchlight?.position.x;
    if (Number.isFinite(threatX) && Math.abs(action.x - threatX) < Number(action.requiresBeamAway)) {
      return {
        code: "watch",
        verb: action.waitVerb || "等视线转开",
        caption: action.waitCaption || "视线还压在这里。贴住遮挡，等巡查者转身。"
      };
    }
  }
  return null;
}

function GetWorldTaskNodes(definition) {
  return definition.type === "placement"
    ? [...(definition.pieces || []), ...(definition.sockets || [])]
    : (definition.nodes || []);
}

function RenderWorldTaskHud(feedback = "") {
  const task = gameState.worldTask;
  if (!task || !ui.worldTaskHud) return;
  const { definition } = task;
  let marks = [];
  let currentLabel = "";
  if (definition.type === "stations") {
    marks = definition.nodes.map((node, index) => ({ done: index < task.step, current: index === task.step, label: node.verb }));
    currentLabel = definition.nodes[task.step]?.verb || "";
  } else if (definition.type === "holdSequence") {
    marks = definition.pulses.map((pulse, index) => ({ done: index < task.step, current: index === task.step, label: pulse.label }));
    currentLabel = definition.pulses[task.step]?.label || "";
  } else if (definition.type === "configuration") {
    marks = definition.nodes.map((node) => ({ done: task.touched.has(node.id), current: false, label: node.label }));
    marks.push({ done: false, current: task.touched.size === definition.nodes.length, label: definition.verify.label });
    currentLabel = task.nearestLabel || (task.touched.size === definition.nodes.length ? definition.verify.label : "走近一处实物");
  } else if (definition.type === "placement") {
    marks = definition.pieces.map((piece) => ({
      done: task.placements.get(piece.id) === piece.correctSocket,
      current: task.selectedPiece === piece.id,
      label: piece.label
    }));
    marks.push({ done: false, current: task.placements.size === definition.pieces.length, label: definition.verify.label });
    currentLabel = task.nearestLabel || (task.selectedPiece
      ? `抱着${definition.pieces.find((piece) => piece.id === task.selectedPiece)?.label || "材料"}，走到一处落位`
      : "先抬起一件材料");
  } else if (definition.type === "evidence") {
    marks = definition.listens.map((node) => ({ done: task.heard.has(node.id), current: false, label: node.label }));
    marks.push({ done: false, current: task.heard.size === definition.listens.length, label: definition.choiceLabel || "作出现场判断" });
    currentLabel = task.nearestLabel || (task.heard.size === definition.listens.length
      ? (definition.readyPrompt || "在候选位置中判断")
      : (definition.listenPrompt || "先听完现场线索"));
  }
  ui.worldTaskKicker.textContent = definition.kicker;
  ui.worldTaskTitle.textContent = definition.title;
  ui.worldTaskProgress.replaceChildren();
  marks.forEach((state) => {
    const mark = document.createElement("i");
    mark.classList.toggle("isDone", state.done);
    mark.classList.toggle("isCurrent", state.current);
    mark.title = state.label;
    ui.worldTaskProgress.appendChild(mark);
  });
  ui.worldTaskHint.textContent = feedback || `${definition.hint}${currentLabel ? ` · 当前：${currentLabel}` : ""}`;
  ui.worldTaskHud.classList.toggle("isPressing", Boolean(task.pressStart));
  ui.worldTaskHud.classList.toggle("isError", Boolean(task.error));
  ui.worldTaskHud.hidden = false;
}

function CreateWorldTaskFreeMarker(task, node, role) {
  const marker = CreateMarker({
    id: `${task.action.id}_${node.id || role}`,
    x: task.action.x + Number(node.xOffset || 0),
    layer: task.action.layer,
    kind: node.kind || task.action.kind,
    verb: node.label || "操作",
    name: node.label || task.action.name
  });
  marker.userData.taskRole = role;
  marker.userData.taskNode = node;
  marker.userData.ring.material.opacity = .34;
  marker.userData.dot.material.opacity = .7;
  marker.scale.setScalar(.92);
  gameState.world.gameplay.add(marker);
  return marker;
}

function BuildWorldTaskFreeMarkers(task) {
  const { definition } = task;
  task.nodeMarkers = [];
  if (definition.type === "configuration") {
    definition.nodes.forEach((node) => {
      const marker = CreateWorldTaskFreeMarker(task, node, "config");
      const initialOption = node.options.find((option) => option.id === task.values.get(node.id)) || node.options[0];
      ApplyConfigurationMarkerState(marker, node, initialOption);
      task.nodeMarkers.push(marker);
    });
    task.nodeMarkers.push(CreateWorldTaskFreeMarker(task, { ...definition.verify, id: "verify" }, "verify"));
  } else if (definition.type === "placement") {
    definition.pieces.forEach((piece) => task.nodeMarkers.push(CreateWorldTaskFreeMarker(task, piece, "piece")));
    definition.sockets.forEach((socket) => task.nodeMarkers.push(CreateWorldTaskFreeMarker(task, socket, "socket")));
    task.nodeMarkers.push(CreateWorldTaskFreeMarker(task, { ...definition.verify, id: "verify" }, "verify"));
  } else if (definition.type === "evidence") {
    definition.listens.forEach((node) => task.nodeMarkers.push(CreateWorldTaskFreeMarker(task, node, "listen")));
    definition.choices.forEach((node) => {
      const marker = CreateWorldTaskFreeMarker(task, node, "choice");
      marker.visible = definition.listens.length === 0;
      task.nodeMarkers.push(marker);
    });
  }
}

function ClearWorldTaskFreeMarkers(task) {
  (task?.nodeMarkers || []).forEach((marker) => {
    gameState.world.gameplay.remove(marker);
    DisposeTree(marker);
  });
  if (task) task.nodeMarkers = [];
}

function FindNearestWorldTaskFreeMarker(task) {
  if (!task?.nodeMarkers?.length || gameState.currentLayer !== task.action.layer) return null;
  let nearest = null;
  let nearestDistance = Infinity;
  task.nodeMarkers.forEach((marker) => {
    if (!marker.visible) return;
    const distance = Math.abs(gameState.player.position.x - marker.position.x);
    // Configuration stations can be only 1.45 world units apart. Keeping the
    // interaction radius below half that spacing prevents one key press from
    // changing a neighbour while the HUD highlights the intended station.
    if (distance < .7 && distance < nearestDistance) {
      nearest = marker;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function MoveQaWorldTaskMarker(direction) {
  if (!QaMode) return;
  const task = gameState.worldTask;
  const markers = (task?.nodeMarkers || []).filter((marker) => marker.visible);
  if (!task || markers.length === 0) return;
  const current = FindNearestWorldTaskFreeMarker(task);
  const currentIndex = current ? markers.indexOf(current) : -1;
  const nextIndex = currentIndex < 0
    ? (direction > 0 ? 0 : markers.length - 1)
    : (currentIndex + direction + markers.length) % markers.length;
  const target = markers[nextIndex];
  gameState.player.position.x = target.position.x;
  gameState.player.userData.previousX = target.position.x;
  gameState.lastSafeX = target.position.x;
  gameState.lastSmokeSafeX = target.position.x;
  gameState.suspicion = 0;
  task.nearestLabel = "";
  UpdateWorldTask(0);
  RenderOnce();
}

function AdvanceQaWorldTaskPulse() {
  if (!QaMode) return;
  const task = gameState.worldTask;
  const pulse = task?.definition?.pulses?.[task.step];
  if (!task || task.definition.type !== "holdSequence" || !pulse) return;
  const now = performance.now();
  if (task.step > 0) {
    const restMin = Number(pulse.restMin) || .1;
    const restMax = Number(pulse.restMax) || restMin + .2;
    task.lastRelease = now - ((restMin + restMax) * .5 * 1000);
  }
  task.pressStart = now - ((pulse.holdMin + pulse.holdMax) * .5 * 1000);
  task.error = false;
  EndWorldTaskPulse();
}

function ClearWorldTaskNodeProp(task) {
  if (!task?.nodeProp) return;
  task.marker?.remove(task.nodeProp);
  DisposeTree(task.nodeProp);
  task.nodeProp = null;
}

function SetWorldTaskNode(task) {
  const node = task.definition.nodes?.[task.step];
  if (!node || !task.marker) return;
  ClearWorldTaskNodeProp(task);
  const nodeLayer = node.layer || task.action.layer;
  const layerY = nodeLayer === "surface" ? SurfaceFootY : TunnelFootY;
  task.taskLayer = nodeLayer;
  task.marker.position.x = task.action.x + node.xOffset;
  task.marker.position.y = layerY;
  task.marker.userData.baseY = layerY;
  task.marker.userData.taskLayer = nodeLayer;
  task.marker.userData.prop.visible = false;
  const nodeProp = CreateProp(node.kind || task.action.kind);
  nodeProp.position.y = 0;
  task.marker.add(nodeProp);
  task.nodeProp = nodeProp;
  const markerY = nodeProp.userData.markerY || 1.65;
  task.marker.userData.ring.position.y = markerY;
  task.marker.userData.dot.position.y = markerY;
  const layerVisible = nodeLayer === "surface" ? gameState.depthBlend < .5 : gameState.depthBlend >= .5;
  task.marker.visible = layerVisible;
  task.marker.userData.ring.visible = layerVisible;
  task.marker.userData.dot.visible = layerVisible;
}

function ResetWorldTask(showPrompt = true) {
  const task = gameState.worldTask;
  if (task?.definition.type === "placement" && task.selectedPiece) ClearHeldProp();
  ClearWorldTaskFreeMarkers(task);
  if (task?.marker) {
    ClearWorldTaskNodeProp(task);
    task.marker.position.x = task.action.x;
    task.marker.position.y = task.action.layer === "surface" ? SurfaceFootY : TunnelFootY;
    task.marker.userData.baseY = task.marker.position.y;
    task.marker.userData.taskLayer = task.action.layer;
    task.marker.userData.prop.visible = true;
    task.marker.userData.ring.position.y = task.marker.userData.originalMarkerY;
    task.marker.userData.dot.position.y = task.marker.userData.originalMarkerY;
  }
  gameState.worldTask = null;
  if (ui.worldTaskHud) {
    ui.worldTaskHud.hidden = true;
    ui.worldTaskHud.classList.remove("isPressing", "isError");
  }
  if (showPrompt && gameState.chapterActive && !gameState.paused && !gameState.inDialogue) UpdatePrompt();
}

function StartWorldTask(action, definition, beginHeld = false) {
  const marker = gameState.markers.get(action.id) || null;
  if (marker && !Number.isFinite(marker.userData.originalMarkerY)) {
    marker.userData.originalMarkerY = marker.userData.ring.position.y;
  }
  gameState.worldTask = {
    action,
    definition,
    marker,
    nodeProp: null,
    nodeMarkers: [],
    step: 0,
    pressStart: beginHeld ? performance.now() : 0,
    lastRelease: 0,
    error: false,
    touched: new Set(),
    heard: new Set(),
    values: new Map((definition.nodes || []).map((node) => [node.id, node.initial])),
    placements: new Map(),
    selectedPiece: null,
    nearestLabel: "",
    taskLayer: action.layer,
    stationWaitStart: 0
  };
  ui.interactionPrompt.hidden = true;
  gameState.promptSignature = "worldTask";
  if (definition.type === "stations") SetWorldTaskNode(gameState.worldTask);
  if (definition.type === "configuration" || definition.type === "placement" || definition.type === "evidence") {
    if (marker) marker.visible = false;
    BuildWorldTaskFreeMarkers(gameState.worldTask);
  }
  if (["openSmokeVent", "handoffStretcherWest", "handoffStretcherEast"].includes(action.id)) {
    gameState.lastSmokeSafeX = action.x;
  }
  if (beginHeld) gameState.audio.PlaySfx(action.sound, action.x);
  RenderWorldTaskHud();
}

function RecoverWorldTaskStation(task, node, caption = "") {
  if (!task || task.definition.type !== "stations" || !task.definition.localRecovery || !node) return false;
  const recoveryLayer = node.recoveryLayer || node.layer || task.action.layer;
  if (gameState.currentLayer !== recoveryLayer || gameState.depthTransition) return false;
  const recoveryOffsets = Array.isArray(node.recoveryXOffsets) && node.recoveryXOffsets.length
    ? node.recoveryXOffsets
    : [node.recoveryXOffset ?? node.xOffset ?? 0];
  const nearestRecoveryOffset = recoveryOffsets.reduce((nearest, offset) => {
    const nearestDistance = Math.abs(task.action.x + Number(nearest) - gameState.player.position.x);
    const candidateDistance = Math.abs(task.action.x + Number(offset) - gameState.player.position.x);
    return candidateDistance < nearestDistance ? offset : nearest;
  }, recoveryOffsets[0]);
  const recoveryX = task.action.x + Number(nearestRecoveryOffset);
  task.pressStart = 0;
  task.lastRelease = 0;
  task.stationWaitStart = 0;
  task.error = true;
  gameState.player.position.x = THREE.MathUtils.clamp(recoveryX, -StageLimit, StageLimit);
  gameState.player.userData.previousX = gameState.player.position.x;
  if (recoveryLayer === "surface") gameState.lastSafeX = gameState.player.position.x;
  else gameState.lastSmokeSafeX = gameState.player.position.x;
  if (task.definition.failSuspicion) {
    gameState.suspicion = Math.min(.92, gameState.suspicion + Number(task.definition.failSuspicion));
  }
  AddCameraImpact(.16);
  StartCameraShot(gameState.player.position.x, { zoom: 1.08, duration: 880, enter: 180, exit: 320 });
  gameState.audio.PlaySfx("steps", gameState.player.position.x + .45);
  const feedback = caption || node.recoveryCaption || "脚步停了。退回当前段最近的实体遮蔽，等动静散开再试。";
  ShowSoundCaption(feedback, gameState.player.position.x);
  RenderWorldTaskHud(feedback);
  return true;
}

function FailWorldTask(caption) {
  const task = gameState.worldTask;
  if (!task) return;
  task.step = 0;
  task.pressStart = 0;
  task.lastRelease = 0;
  task.error = true;
  if (task.definition.failSuspicion) {
    gameState.suspicion = Math.min(.92, gameState.suspicion + Number(task.definition.failSuspicion));
  }
  AddCameraImpact(.24);
  gameState.audio.PlaySfx("steps", task.action.x + 1.2);
  ShowSoundCaption(caption || task.definition.failCaption, task.action.x);
  RenderWorldTaskHud(caption || task.definition.failCaption);
}

function CompleteWorldTask() {
  const task = gameState.worldTask;
  if (!task) return;
  const action = task.action;
  ResetWorldTask(false);
  ResolveAction(action);
}

function BeginWorldTaskPulse() {
  const task = gameState.worldTask;
  if (!task || task.definition.type !== "holdSequence" || task.pressStart) return;
  const now = performance.now();
  const pulse = task.definition.pulses[task.step];
  if (task.step > 0 && pulse && task.lastRelease) {
    const rest = (now - task.lastRelease) / 1000;
    if (rest < pulse.restMin || rest > pulse.restMax) {
      FailWorldTask(task.definition.failCaption);
      const restarted = gameState.worldTask;
      if (restarted) {
        restarted.pressStart = now;
        restarted.error = false;
        RenderWorldTaskHud();
      }
      return;
    }
  }
  task.error = false;
  task.pressStart = now;
  RenderWorldTaskHud();
}

function EndWorldTaskPulse() {
  const task = gameState.worldTask;
  if (!task || task.definition.type !== "holdSequence" || !task.pressStart) return;
  const now = performance.now();
  const pulse = task.definition.pulses[task.step];
  const held = (now - task.pressStart) / 1000;
  task.pressStart = 0;
  if (!pulse || held < pulse.holdMin || held > pulse.holdMax) {
    const failCaption = QaMode && pulse
      ? `${task.definition.failCaption}〔QA：${held.toFixed(3)} 秒；应为 ${pulse.holdMin.toFixed(2)}–${pulse.holdMax.toFixed(2)} 秒〕`
      : task.definition.failCaption;
    FailWorldTask(failCaption);
    return;
  }
  task.error = false;
  task.step += 1;
  task.lastRelease = now;
  if (task.marker?.userData?.prop) task.marker.userData.prop.rotation.z += task.action.kind === "mill" ? .32 : .08;
  gameState.audio.PlaySfx(pulse.sound || task.action.sound, task.action.x + (task.step % 2 ? -.6 : .8));
  CreateChalkBurst(task.action.x, task.action.layer === "surface" ? SurfaceFootY + 1.45 : TunnelFootY + 1.45);
  if (task.step >= task.definition.pulses.length) {
    CompleteWorldTask();
    return;
  }
  RenderWorldTaskHud(`${pulse.label}相合。按现场停顿，再做下一记。`);
}

function CompleteWorldTaskStation(task, node, nodeX) {
  if (!task || gameState.worldTask !== task) return;
  const nodeLayer = node.layer || task.action.layer;
  task.stationWaitStart = 0;
  task.error = false;
  if (["handoffStretcherWest", "handoffStretcherEast"].includes(task.action.id)) gameState.lastSmokeSafeX = nodeX;
  gameState.audio.PlaySfx(node.sound || task.action.sound, nodeX);
  ShowSoundCaption(node.caption, nodeX);
  CreateChalkBurst(nodeX, nodeLayer === "surface" ? SurfaceFootY + 1.4 : TunnelFootY + 1.4);
  task.step += 1;
  if (task.step >= task.definition.nodes.length) {
    CompleteWorldTask();
    return;
  }
  SetWorldTaskNode(task);
  RenderWorldTaskHud(node.nextHint || `${node.verb}已经落稳。沿白灰环去下一处。`);
}

function AdvanceWorldTaskStation() {
  const task = gameState.worldTask;
  if (!task || task.definition.type !== "stations") return;
  const node = task.definition.nodes[task.step];
  const nodeX = task.action.x + node.xOffset;
  const nodeLayer = node.layer || task.action.layer;
  if (gameState.currentLayer !== nodeLayer) {
    task.error = true;
    const transitionHint = node.transitionHint || `当前位置在${nodeLayer === "surface" ? "地面" : "地下"}；先从真实入口换层。`;
    ShowSoundCaption(transitionHint, gameState.player.position.x);
    RenderWorldTaskHud(transitionHint);
    return;
  }
  if (Math.abs(gameState.player.position.x - nodeX) > .82) {
    const nearOutOfSequenceStation = task.definition.nodes.some((candidate, index) => {
      if (index === task.step || (candidate.layer || task.action.layer) !== gameState.currentLayer) return false;
      return Math.abs(gameState.player.position.x - (task.action.x + candidate.xOffset)) <= .82;
    });
    const caption = `次序走乱了。退回“${node.verb}”这一段最近的遮蔽，再跟白灰环靠近。`;
    if (nearOutOfSequenceStation && RecoverWorldTaskStation(task, node, caption)) return;
    task.error = true;
    ShowSoundCaption(`还没到“${node.verb}”的位置；跟着白灰环走。`, nodeX);
    RenderWorldTaskHud(`靠近白灰环再按 E / 行动 · 当前：${node.verb}`);
    return;
  }
  if (node.requiresCrouch && !gameState.keys.crouch) {
    RecoverWorldTaskStation(task, node, node.recoveryCaption || "轮廓露出遮蔽。伏低回到最近掩体，再等下一次动静。 ");
    return;
  }
  if (Number(node.waitDuration) > 0) {
    if (task.stationWaitStart) return;
    task.error = false;
    task.stationWaitStart = performance.now();
    gameState.audio.PlaySfx(node.waitStartSound || "steps", nodeX + .35);
    RenderWorldTaskHud(node.waitingHint || "伏住别动，等这一段现场动静完整走过。 ");
    return;
  }
  CompleteWorldTaskStation(task, node, nodeX);
}

function ApplyConfigurationMarkerState(marker, node, option) {
  const optionIndex = Math.max(0, node.options.findIndex((candidate) => candidate.id === option.id));
  marker.userData.prop.rotation.z = (optionIndex - (node.options.length - 1) * .5) * .11;
  const neutralRings = ["#9d765d", "#aa8562", "#8f8169"];
  const neutralDots = ["#c18b6b", "#c8a16f", "#aea076"];
  marker.userData.ring.material.color.set(neutralRings[optionIndex % neutralRings.length]);
  marker.userData.dot.material.color.set(neutralDots[optionIndex % neutralDots.length]);
}

function SetPlacementSocketPiece(task, socketId, piece = null) {
  const marker = task.nodeMarkers.find((candidate) => candidate.userData.taskRole === "socket"
    && candidate.userData.taskNode.id === socketId);
  if (!marker) return;
  if (marker.userData.placedProp) {
    marker.remove(marker.userData.placedProp);
    DisposeTree(marker.userData.placedProp);
    marker.userData.placedProp = null;
  }
  if (!piece) {
    marker.userData.ring.material.color.set("#aa7657");
    marker.userData.dot.material.color.set("#bd795c");
    return;
  }
  const prop = CreateProp(piece.kind);
  prop.position.set(0, .05, .24);
  prop.scale.setScalar(.78);
  prop.rotation.z = piece.id === "frame" ? -.04 : piece.id === "treads" ? .035 : 0;
  marker.add(prop);
  marker.userData.placedProp = prop;
  const correct = piece.correctSocket === socketId;
  marker.userData.ring.material.color.set(correct ? "#c8aa67" : "#9e6d55");
  marker.userData.dot.material.color.set(correct ? "#e1bd72" : "#b66f58");
}

function SelectPlacementPiece(task, piece) {
  const placedSocket = task.placements.get(piece.id);
  if (placedSocket) {
    task.placements.delete(piece.id);
    SetPlacementSocketPiece(task, placedSocket, null);
  }
  task.selectedPiece = piece.id;
  ClearHeldProp();
  EquipHeldProp(piece.kind);
  const sourceMarker = task.nodeMarkers.find((candidate) => candidate.userData.taskRole === "piece"
    && candidate.userData.taskNode.id === piece.id);
  if (sourceMarker) {
    sourceMarker.userData.ring.material.color.set("#c8aa67");
    sourceMarker.userData.dot.material.color.set("#e1bd72");
  }
}

function AdvanceConfigurationTask() {
  const task = gameState.worldTask;
  if (!task || task.definition.type !== "configuration") return;
  const marker = FindNearestWorldTaskFreeMarker(task);
  if (!marker) {
    task.error = true;
    ShowSoundCaption(task.definition.approachCaption || "先走近一处现场实物，再按 E / 行动。", task.action.x);
    RenderWorldTaskHud(task.definition.approachHint || "没有隔空操作：走近一处实物再动手。");
    return;
  }
  const node = marker.userData.taskNode;
  if (marker.userData.taskRole === "verify") {
    if (task.touched.size < task.definition.nodes.length) {
      task.error = true;
      ShowSoundCaption(task.definition.untouchedCaption || "还有实物没有亲手检查，回验只会重复现象。", marker.position.x);
      RenderWorldTaskHud(task.definition.untouchedHint || "每一处都亲手调整过，回验才有意义。");
      return;
    }
    const wrongNodes = task.definition.nodes.filter((candidate) => task.values.get(candidate.id) !== candidate.correct);
    if (wrongNodes.length === 0) {
      ShowSoundCaption(task.definition.verify.success, marker.position.x);
      CompleteWorldTask();
      return;
    }
    task.error = true;
    const firstWrong = wrongNodes[0];
    const currentOption = firstWrong.options.find((option) => option.id === task.values.get(firstWrong.id));
    if (task.action.id === "openSmokeVent") gameState.smokePressure = Math.min(.93, gameState.smokePressure + .09);
    AddCameraImpact(.18);
    gameState.audio.PlaySfx(task.definition.failSound || task.action.sound || "earth", marker.position.x);
    ShowSoundCaption(currentOption?.caption || "回验没有通过；沿烟线和灯焰找出仍不对的一处。", marker.position.x);
    RenderWorldTaskHud(task.definition.failureHint || "回验未通过：看现场反馈找出不对的一处；状态已经保留，不会直接标出答案。");
    return;
  }

  const currentId = task.values.get(node.id);
  const currentIndex = Math.max(0, node.options.findIndex((option) => option.id === currentId));
  const nextOption = node.options[(currentIndex + 1) % node.options.length];
  task.values.set(node.id, nextOption.id);
  task.touched.add(node.id);
  task.step = task.touched.size;
  task.error = false;
  ApplyConfigurationMarkerState(marker, node, nextOption);
  gameState.audio.PlaySfx(node.sound || task.action.sound, marker.position.x);
  ShowSoundCaption(`${node.label} · ${nextOption.label}：${nextOption.caption}`, marker.position.x);
  CreateChalkBurst(marker.position.x, task.action.layer === "surface" ? SurfaceFootY + 1.35 : TunnelFootY + 1.35);
  if (task.action.id === "openSmokeVent") gameState.lastSmokeSafeX = marker.position.x;
  RenderWorldTaskHud(`${node.label}调为“${nextOption.label}”。${task.definition.adjustHint || "去别处看它如何改变整个现场。"}`);
}

function AdvancePlacementTask() {
  const task = gameState.worldTask;
  if (!task || task.definition.type !== "placement") return;
  const marker = FindNearestWorldTaskFreeMarker(task);
  if (!marker) {
    task.error = true;
    ShowSoundCaption("先走到矮框、低沟、踏板或空担架旁，再亲手重摆。", task.action.x);
    RenderWorldTaskHud("没有隔空摆放：靠近一件实物再按 E / 行动。");
    return;
  }
  const node = marker.userData.taskNode;
  if (marker.userData.taskRole === "verify") {
    if (task.placements.size < task.definition.pieces.length) {
      task.error = true;
      ShowSoundCaption("还有材料握在手里或没落位，空担架现在走不完整。", marker.position.x);
      RenderWorldTaskHud("矮框、低沟和踏板都落到现场后，再让空担架回验。");
      return;
    }
    const wrongPieces = task.definition.pieces.filter((piece) => task.placements.get(piece.id) !== piece.correctSocket);
    if (wrongPieces.length === 0) {
      ShowSoundCaption(task.definition.verify.success, marker.position.x);
      CompleteWorldTask();
      return;
    }
    const firstWrong = wrongPieces[0];
    const wrongSocket = task.definition.sockets.find((socket) => socket.id === task.placements.get(firstWrong.id));
    task.error = true;
    AddCameraImpact(.2);
    gameState.audio.PlaySfx(firstWrong.sound || "earth", marker.position.x);
    ShowSoundCaption(wrongSocket?.responses?.[firstWrong.id] || "空担架没有走通；刚才摆过的状态都保留，沿受力、水线和换肩位逐件查。", marker.position.x);
    RenderWorldTaskHud("试走未通过：错误摆法仍留在现场。看梁木、水线或担架肩位，再只重摆那一件。");
    return;
  }
  if (marker.userData.taskRole === "piece") {
    SelectPlacementPiece(task, node);
    task.error = false;
    gameState.audio.PlaySfx(node.sound || task.action.sound, marker.position.x);
    ShowSoundCaption(node.pickupCaption, marker.position.x);
    RenderWorldTaskHud(`${node.label}已经抬起。走到短实干土、右下湿侧或旧水印东弯落位。`);
    return;
  }
  if (marker.userData.taskRole !== "socket") return;
  if (!task.selectedPiece) {
    const occupyingEntry = [...task.placements.entries()].find(([, socketId]) => socketId === node.id);
    if (!occupyingEntry) {
      task.error = true;
      ShowSoundCaption("这处落位还是空的。先到左边抬起一件材料。", marker.position.x);
      RenderWorldTaskHud("空手不能落位：先抬矮框、低沟土样或踏板。");
      return;
    }
    const occupyingPiece = task.definition.pieces.find((piece) => piece.id === occupyingEntry[0]);
    SelectPlacementPiece(task, occupyingPiece);
    task.error = false;
    gameState.audio.PlaySfx(occupyingPiece.sound || task.action.sound, marker.position.x);
    ShowSoundCaption(`从${node.label}取回${occupyingPiece.label}；原来的错误状态没有牵动另外两处`, marker.position.x);
    RenderWorldTaskHud(`${occupyingPiece.label}已取回。换一处落位，其余摆法仍保留。`);
    return;
  }
  const piece = task.definition.pieces.find((candidate) => candidate.id === task.selectedPiece);
  const occupant = [...task.placements.entries()].find(([, socketId]) => socketId === node.id);
  if (occupant) task.placements.delete(occupant[0]);
  task.placements.set(piece.id, node.id);
  task.selectedPiece = null;
  ClearHeldProp();
  SetPlacementSocketPiece(task, node.id, piece);
  task.touched.add(piece.id);
  task.step = task.placements.size;
  task.error = false;
  gameState.audio.PlaySfx(piece.sound || task.action.sound, marker.position.x);
  const feedback = node.responses?.[piece.id] || `${piece.label}落在${node.label}`;
  ShowSoundCaption(`${node.label} · ${feedback}`, marker.position.x);
  CreateChalkBurst(marker.position.x, TunnelFootY + 1.25);
  RenderWorldTaskHud(`${piece.label}已经落位；现场状态保留。可取回重摆，或继续放下一件。`);
}

function AdvanceEvidenceTask() {
  const task = gameState.worldTask;
  if (!task || task.definition.type !== "evidence") return;
  const marker = FindNearestWorldTaskFreeMarker(task);
  if (!marker) {
    task.error = true;
    ShowSoundCaption("贴近白灰听点或候选位置再操作。", task.action.x);
    RenderWorldTaskHud("声音来自墙和头顶；必须走到现场听。");
    return;
  }
  const node = marker.userData.taskNode;
  if (marker.userData.taskRole === "listen") {
    task.heard.add(node.id);
    task.step = task.heard.size;
    task.error = false;
    marker.userData.ring.material.color.set("#c8aa67");
    marker.userData.dot.material.color.set("#e1bd72");
    gameState.audio.PlaySfx(node.sound || task.action.sound, marker.position.x);
    ShowSoundCaption(node.caption, marker.position.x);
    if (task.heard.size === task.definition.listens.length) {
      task.nodeMarkers.filter((candidate) => candidate.userData.taskRole === "listen").forEach((candidate) => { candidate.visible = false; });
      task.nodeMarkers.filter((candidate) => candidate.userData.taskRole === "choice").forEach((candidate) => { candidate.visible = true; });
      RenderWorldTaskHud(task.definition.readyFeedback || "现场线索已经听全。现在亲自走到一处位置作出判断。");
    } else {
      const remaining = task.definition.listens.length - task.heard.size;
      RenderWorldTaskHud(`${node.label}已经听完；还有${remaining === 1 ? "一处" : `${remaining}处`}没有听全。`);
    }
    return;
  }
  if (marker.userData.taskRole !== "choice") return;
  gameState.audio.PlaySfx(node.sound || task.action.sound, marker.position.x);
  ShowSoundCaption(node.caption, marker.position.x);
  if (node.correct) {
    CompleteWorldTask();
    return;
  }
  task.error = true;
  gameState.suspicion = Math.min(.92, gameState.suspicion + .16);
  AddCameraImpact(.22);
  RenderWorldTaskHud(task.definition.wrongHint || `${node.label}与现场线索对不上；已经听到的内容仍会保留，换一处判断。`);
}

function BeginActionInput() {
  if (gameState.paused || gameState.inDialogue || gameState.depthTransition) return;
  if (gameState.worldTask) {
    if (gameState.worldTask.definition.type === "holdSequence") BeginWorldTaskPulse();
    else if (gameState.worldTask.definition.type === "stations") AdvanceWorldTaskStation();
    else if (gameState.worldTask.definition.type === "configuration") AdvanceConfigurationTask();
    else if (gameState.worldTask.definition.type === "placement") AdvancePlacementTask();
    else if (gameState.worldTask.definition.type === "evidence") AdvanceEvidenceTask();
    return;
  }
  const action = FindNearestAction();
  if (!action) return;
  const block = GetActionBlock(action);
  if (block) {
    ShowSoundCaption(block.caption, action.x);
    gameState.audio.PlaySfx("steps", action.x + 1);
    return;
  }
  if (action.autoWhenCrouched) {
    ShowSoundCaption("这里要伏低从遮挡里穿过去；不用伸手碰光圈。", action.x);
    return;
  }
  const worldDefinition = WorldTaskData[action.id];
  if (worldDefinition) {
    StartWorldTask(action, worldDefinition, worldDefinition.type === "holdSequence");
    return;
  }
  PerformAction(action);
}

function EndActionInput() {
  if (gameState.worldTask?.definition.type === "holdSequence") EndWorldTaskPulse();
}

function UpdateWorldTask(delta) {
  const task = gameState.worldTask;
  if (!task || gameState.paused || gameState.inDialogue || gameState.depthTransition) return;
  const maxDistance = Number(task.definition.maxDistance) || 1.75;
  const wrongFixedLayer = !task.definition.allowDepthTransitions && gameState.currentLayer !== task.action.layer;
  const beyondTaskBounds = Math.abs(gameState.player.position.x - task.action.x) > maxDistance;
  if (wrongFixedLayer || beyondTaskBounds) {
    if (task.definition.localRecovery && task.definition.type === "stations") {
      const node = task.definition.nodes?.[task.step];
      const recovered = beyondTaskBounds && gameState.currentLayer === (node?.recoveryLayer || node?.layer || task.action.layer)
        ? RecoverWorldTaskStation(task, node, "离开观察线太远。退回当前段最近的遮蔽，已听清的次序仍然保留。")
        : false;
      if (!recovered) {
        task.error = true;
        RenderWorldTaskHud(node?.transitionHint || "当前段仍保留：回到真实入口换层，再靠近白灰环。 ");
      }
      return;
    }
    const caption = "离开现场太远，这一小段动作保留在原处；回来后从第一步重新做。";
    const sourceX = task.action.x;
    ResetWorldTask(false);
    ShowSoundCaption(caption, sourceX);
    return;
  }
  if (task.definition.type === "stations") {
    const node = task.definition.nodes?.[task.step];
    const nodeLayer = node?.layer || task.action.layer;
    const nodeX = task.action.x + Number(node?.xOffset || 0);
    if (node?.requiresCrouch && node.crouchPath && gameState.currentLayer === nodeLayer) {
      const pathMin = task.action.x + Math.min(node.crouchPath.minOffset, node.crouchPath.maxOffset);
      const pathMax = task.action.x + Math.max(node.crouchPath.minOffset, node.crouchPath.maxOffset);
      const insideExposedPath = gameState.player.position.x > pathMin && gameState.player.position.x < pathMax;
      const recoveryOffsets = Array.isArray(node.recoveryXOffsets) ? node.recoveryXOffsets : [node.recoveryXOffset];
      const insideRecoveryCover = recoveryOffsets.some((offset) => Number.isFinite(offset)
        && Math.abs(gameState.player.position.x - (task.action.x + offset)) <= Number(node.recoveryCoverRadius || .28));
      if (insideExposedPath && !insideRecoveryCover && !gameState.keys.crouch) {
        RecoverWorldTaskStation(task, node, node.recoveryCaption || "站起的轮廓越过遮蔽。退回最近掩体，整段伏低再走。 ");
        return;
      }
    }
    if (task.stationWaitStart && node) {
      const stayedLow = !node.requiresCrouch || gameState.keys.crouch;
      const heldPosition = gameState.currentLayer === nodeLayer && Math.abs(gameState.player.position.x - nodeX) <= .34;
      if (!stayedLow || !heldPosition) {
        RecoverWorldTaskStation(task, node, node.recoveryCaption || "等待中动了身形。退回最近遮蔽，等下一轮动静。 ");
        return;
      }
      const waitedSeconds = (performance.now() - task.stationWaitStart) / 1000;
      if (waitedSeconds >= Number(node.waitDuration)) {
        CompleteWorldTaskStation(task, node, nodeX);
        return;
      }
    }
  }
  if (task.pressStart && task.marker?.userData?.prop) {
    task.marker.userData.prop.rotation.z += delta * (task.action.kind === "mill" ? .58 : .12);
  }
  if (task.definition.type === "configuration" || task.definition.type === "placement" || task.definition.type === "evidence") {
    const nearest = FindNearestWorldTaskFreeMarker(task);
    const nearestLabel = nearest?.userData?.taskNode?.label || "";
    if (nearestLabel !== task.nearestLabel) {
      task.nearestLabel = nearestLabel;
      task.nodeMarkers.forEach((marker) => {
        const active = marker === nearest;
        marker.userData.ring.scale.setScalar(active ? 1.28 : 1);
        marker.userData.ring.material.opacity = active ? .8 : .34;
      });
      RenderWorldTaskHud();
    }
  }
}

function UpdateSpatialActions() {
  if (gameState.paused || gameState.inDialogue || gameState.depthTransition || gameState.worldTask) return;
  const chapter = ChapterData[gameState.chapterIndex];
  const action = chapter.interactions.find((candidate) => candidate.autoWhenCrouched
    && candidate.layer === gameState.currentLayer
    && IsActionAvailable(candidate));
  if (!action || Math.abs(gameState.player.position.x - action.x) > .58 || !gameState.keys.crouch) return;
  const block = GetActionBlock(action);
  if (block) {
    if (performance.now() - gameState.lastCaptionTime > 1300) ShowSoundCaption(block.caption, action.x);
    return;
  }
  ResolveAction(action);
}

function UpdateCrouchPaths() {
  if (gameState.paused || gameState.inDialogue || gameState.depthTransition || gameState.currentLayer !== "surface") return;
  const chapter = ChapterData[gameState.chapterIndex];
  chapter.interactions.forEach((action) => {
    const path = action.crouchPath;
    if (!path || gameState.completed.has(action.id) || !IsActionAvailable(action)) return;
    const x = gameState.player.position.x;
    const atResetCover = x >= path.resetMin && x <= path.resetMax;
    if (atResetCover) {
      gameState.crouchPathFailures.delete(action.id);
      return;
    }
    const insideCrossing = x > path.min && x < path.max;
    if (!insideCrossing || gameState.keys.crouch) return;
    const firstFailure = !gameState.crouchPathFailures.has(action.id);
    gameState.crouchPathFailures.add(action.id);
    if (firstFailure) {
      gameState.suspicion = Math.min(.94, gameState.suspicion + .24);
      AddCameraImpact(.22);
      ShowSoundCaption("肩背露出遮挡：退回上一处阴影，整段伏低再走。", x);
      gameState.audio.PlaySfx("steps", x + .7);
    }
  });
}

function CreateChallengeState(definition) {
  const state = { feedback: "", feedbackType: "", finishing: false, previousFocus: document.activeElement };
  if (definition.type === "allocation") Object.assign(state, { step: 0, selection: "" });
  if (definition.type === "sequence") Object.assign(state, { input: [] });
  if (definition.type === "echo") Object.assign(state, { heard: [] });
  if (definition.type === "airflow") Object.assign(state, { phase: 0, values: {} });
  if (definition.type === "rollcall") Object.assign(state, { index: 0, mode: "call" });
  if (definition.type === "redundancy") Object.assign(state, { listened: false });
  return state;
}

function OpenChallenge(action, definition) {
  if (gameState.challenge || gameState.paused || gameState.inDialogue || gameState.depthTransition) return;
  ResetInputState();
  gameState.challenge = { action, definition, state: CreateChallengeState(definition) };
  gameState.paused = true;
  ui.interactionPrompt.hidden = true;
  gameState.promptSignature = "blocked";
  ui.challengeKicker.textContent = definition.kicker;
  ui.challengeTitle.textContent = definition.title;
  ui.challengeBrief.textContent = definition.brief;
  ui.challengeCancel.disabled = false;
  ui.challengePanel.hidden = false;
  document.body.classList.add("uiBlocked");
  RenderChallenge();
  requestAnimationFrame(() => {
    ui.challengeWorkspace.querySelector("button:not(:disabled), select:not(:disabled)")?.focus();
  });
}

function ResetChallenge() {
  const activeChallenge = gameState.challenge;
  if (activeChallenge?.state?.timer) window.clearTimeout(activeChallenge.state.timer);
  gameState.challenge = null;
  if (ui.challengePanel) ui.challengePanel.hidden = true;
  if (ui.challengeCancel) ui.challengeCancel.disabled = false;
}

function CloseChallenge(force = false) {
  const activeChallenge = gameState.challenge;
  if (!activeChallenge || (activeChallenge.state.finishing && !force)) return;
  if (activeChallenge.state.timer) window.clearTimeout(activeChallenge.state.timer);
  const previousFocus = activeChallenge.state.previousFocus;
  gameState.challenge = null;
  ui.challengePanel.hidden = true;
  ui.challengeCancel.disabled = false;
  if (gameState.chapterActive && !gameState.inDialogue) {
    gameState.paused = false;
    gameState.audio?.context?.resume?.();
    document.body.classList.remove("uiBlocked");
    UpdatePrompt();
  }
  if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
}

function TrapChallengeFocus(event) {
  if (!gameState.challenge) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    CloseChallenge();
    return;
  }
  if (gameState.challenge.definition.type === "sequence" && ["1", "2"].includes(event.key)) {
    event.preventDefault();
    const beat = event.key === "1" ? "short" : "long";
    ui.challengeWorkspace.querySelector(`[data-sequence="${beat}"]`)?.click();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...ui.challengePanel.querySelectorAll("button:not(:disabled), select:not(:disabled)")]
    .filter((element) => element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function SetChallengeFeedback(text = "", type = "") {
  const state = gameState.challenge?.state;
  if (state) {
    state.feedback = text;
    state.feedbackType = type;
  }
  ui.challengeFeedback.textContent = text;
  ui.challengeFeedback.classList.toggle("isError", type === "error");
  ui.challengeFeedback.classList.toggle("isSuccess", type === "success");
}

function RestoreChallengeFeedback() {
  const state = gameState.challenge?.state;
  SetChallengeFeedback(state?.feedback || "", state?.feedbackType || "");
}

function SetChallengeProgress(total, current, done = current) {
  ui.challengeProgress.replaceChildren();
  for (let index = 0; index < total; index += 1) {
    const mark = document.createElement("i");
    mark.classList.toggle("isDone", index < done);
    mark.classList.toggle("isCurrent", index === current && done < total);
    ui.challengeProgress.appendChild(mark);
  }
}

function CreateChallengeButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", (event) => {
    gameState.audio?.context?.resume?.();
    onClick(event);
  });
  return button;
}

function CreateChallengeSelect(options, accessibleLabel, value = "") {
  const select = document.createElement("select");
  select.className = "challengeSelect";
  select.setAttribute("aria-label", accessibleLabel);
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "选择现场处置……";
  select.appendChild(placeholder);
  options.forEach(([optionValue, label]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    select.appendChild(option);
  });
  select.value = value;
  return select;
}

function AddChallengeText(className, text, tagName = "p") {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  ui.challengeWorkspace.appendChild(element);
  return element;
}

function RenderChallenge() {
  const activeChallenge = gameState.challenge;
  if (!activeChallenge) return;
  ui.challengeWorkspace.replaceChildren();
  const { definition, state } = activeChallenge;
  if (definition.type === "allocation") RenderAllocationChallenge(definition, state);
  else if (definition.type === "sequence") RenderSequenceChallenge(definition, state);
  else if (definition.type === "echo") RenderEchoChallenge(definition, state);
  else if (definition.type === "airflow") RenderAirflowChallenge(definition, state);
  else if (definition.type === "choice") RenderChoiceChallenge(definition, state);
  else if (definition.type === "rollcall") RenderRollcallChallenge(definition, state);
  else if (definition.type === "redundancy") RenderRedundancyChallenge(definition, state);
  RestoreChallengeFeedback();
  requestAnimationFrame(() => {
    if (!gameState.challenge || ui.challengePanel.contains(document.activeElement)) return;
    ui.challengeWorkspace.querySelector("button:not(:disabled), select:not(:disabled)")?.focus();
  });
}

function RenderAllocationChallenge(definition, state) {
  const step = definition.steps[state.step];
  SetChallengeProgress(definition.steps.length, state.step, state.step);
  AddChallengeText("challengeClue", step.clue);
  AddChallengeText("challengeQuestion", step.prompt);
  const select = CreateChallengeSelect(step.options, step.prompt, state.selection);
  ui.challengeWorkspace.appendChild(select);
  const submit = CreateChallengeButton("确认这一处", "challengeSubmit", () => {
    state.selection = select.value;
    if (state.selection !== step.correct) {
      SetChallengeFeedback(step.error, "error");
      select.focus();
      return;
    }
    if (state.step >= definition.steps.length - 1) {
      CompleteChallenge(definition.success);
      return;
    }
    state.step += 1;
    state.selection = "";
    state.feedback = `第 ${state.step} 处已经按证据落纸。继续核对下一处。`;
    state.feedbackType = "success";
    RenderChallenge();
    ui.challengeWorkspace.querySelector("select")?.focus();
  });
  submit.disabled = !state.selection;
  select.addEventListener("change", () => {
    state.selection = select.value;
    submit.disabled = !select.value;
    SetChallengeFeedback("", "");
  });
  ui.challengeWorkspace.appendChild(submit);
}

function RenderSequenceChallenge(definition, state) {
  SetChallengeProgress(definition.expected.length, state.input.length, state.input.length);
  const legend = document.createElement("div");
  legend.className = "sequenceLegend";
  legend.innerHTML = "<span><b>1</b> · 短敲</span><span><b>2</b> ━ 长敲</span>";
  ui.challengeWorkspace.appendChild(legend);
  const trace = document.createElement("div");
  trace.className = "sequenceTrace";
  if (!state.input.length) {
    const empty = document.createElement("small");
    empty.textContent = "等待第一记回敲";
    trace.appendChild(empty);
  } else {
    state.input.forEach((beat) => {
      const mark = document.createElement("span");
      mark.classList.toggle("isLong", beat === "long");
      mark.setAttribute("aria-label", beat === "long" ? "长敲" : "短敲");
      trace.appendChild(mark);
    });
  }
  ui.challengeWorkspace.appendChild(trace);
  const row = document.createElement("div");
  row.className = "challengeButtonRow";
  const AddBeat = (beat) => {
    const expectedBeat = definition.expected[state.input.length];
    gameState.audio.PlaySfx("knock", gameState.player.position.x + (beat === "long" ? 1.5 : -.8));
    if (beat !== expectedBeat) {
      const wrongIndex = state.input.length + 1;
      state.input = [];
      state.feedback = definition.mismatch.replace("{index}", String(wrongIndex));
      state.feedbackType = "error";
      RenderChallenge();
      return;
    }
    state.input.push(beat);
    if (state.input.length === definition.expected.length) {
      CompleteChallenge(definition.success);
      return;
    }
    state.feedback = `第 ${state.input.length} 记相合，继续。`;
    state.feedbackType = "success";
    RenderChallenge();
  };
  const shortButton = CreateChallengeButton("短敲", "sequenceButton", () => AddBeat("short"));
  shortButton.dataset.sequence = "short";
  const shortHint = document.createElement("b");
  shortHint.textContent = "键盘 1";
  shortButton.prepend(shortHint);
  const longButton = CreateChallengeButton("长敲", "sequenceButton", () => AddBeat("long"));
  longButton.dataset.sequence = "long";
  const longHint = document.createElement("b");
  longHint.textContent = "键盘 2";
  longButton.prepend(longHint);
  row.append(shortButton, longButton);
  ui.challengeWorkspace.appendChild(row);
}

function RenderEchoChallenge(definition, state) {
  const heard = new Set(state.heard);
  SetChallengeProgress(3, Math.min(2, heard.size), heard.size);
  const row = document.createElement("div");
  row.className = "challengeButtonRow";
  definition.listens.forEach((listen) => {
    const button = CreateChallengeButton(listen.label, "challengeListen", () => {
      if (!heard.has(listen.id)) state.heard.push(listen.id);
      state.feedback = `${listen.label}：${listen.text}`;
      state.feedbackType = "success";
      gameState.audio.PlaySfx(listen.sound, gameState.player.position.x + listen.pan);
      RenderChallenge();
    });
    button.classList.toggle("isHeard", heard.has(listen.id));
    row.appendChild(button);
  });
  ui.challengeWorkspace.appendChild(row);
  if (state.heard.length) {
    const notes = document.createElement("div");
    notes.className = "listenNotes";
    definition.listens.filter((listen) => heard.has(listen.id)).forEach((listen) => {
      const note = document.createElement("p");
      note.className = "listenNote";
      const label = document.createElement("b");
      label.textContent = `${listen.label}：`;
      note.append(label, document.createTextNode(listen.text));
      notes.appendChild(note);
    });
    ui.challengeWorkspace.appendChild(notes);
  }
  if (heard.size < definition.listens.length) {
    AddChallengeText("challengeQuestion", "左右都听过，才能把声音和脚步对在一起。");
    return;
  }
  AddChallengeText("challengeQuestion", definition.question);
  const choices = document.createElement("div");
  choices.className = "challengeButtonRow";
  definition.choices.forEach(([value, label]) => {
    choices.appendChild(CreateChallengeButton(label, "challengeOption", () => {
      if (value === definition.correct) CompleteChallenge(definition.success);
      else SetChallengeFeedback(definition.errors[value] || "这项与刚才的两侧回声没有同时对上。", "error");
    }));
  });
  ui.challengeWorkspace.appendChild(choices);
}

function RenderAirflowChallenge(definition, state) {
  const phase = definition.phases[state.phase];
  const phaseValues = state.values[state.phase] || (state.values[state.phase] = {});
  SetChallengeProgress(definition.phases.length, state.phase, state.phase);
  AddChallengeText("challengeQuestion", phase.label);
  AddChallengeText("challengeClue", phase.cue);
  const grid = document.createElement("div");
  grid.className = "airflowGrid";
  const selects = [];
  phase.controls.forEach((control) => {
    const label = document.createElement("label");
    label.className = "airflowControl";
    const text = document.createElement("span");
    text.textContent = control.label;
    const select = CreateChallengeSelect(control.options, control.label, phaseValues[control.id] || "");
    select.addEventListener("change", () => {
      phaseValues[control.id] = select.value;
      submit.disabled = selects.some((item) => !item.value);
      SetChallengeFeedback("", "");
    });
    label.append(text, select);
    grid.appendChild(label);
    selects.push(select);
  });
  ui.challengeWorkspace.appendChild(grid);
  const submit = CreateChallengeButton("试一次风与灯", "challengeSubmit", () => {
    const wrongControl = phase.controls.find((control) => phaseValues[control.id] !== control.correct);
    if (wrongControl) {
      SetChallengeFeedback(wrongControl.error, "error");
      selects[phase.controls.indexOf(wrongControl)]?.focus();
      gameState.audio.PlaySfx("air", gameState.player.position.x);
      return;
    }
    if (state.phase >= definition.phases.length - 1) {
      CompleteChallenge(definition.success);
      return;
    }
    state.phase += 1;
    state.feedback = "风塞位置相合。现在用小焰检验真实风向。";
    state.feedbackType = "success";
    RenderChallenge();
    ui.challengeWorkspace.querySelector("select")?.focus();
  });
  submit.disabled = selects.some((select) => !select.value);
  ui.challengeWorkspace.appendChild(submit);
}

function RenderChoiceChallenge(definition) {
  SetChallengeProgress(1, 0, 0);
  const choices = document.createElement("div");
  choices.className = "challengeButtonRow";
  definition.choices.forEach(([value, label]) => {
    choices.appendChild(CreateChallengeButton(label, "challengeOption", () => {
      if (value === definition.correct) CompleteChallenge(definition.success);
      else SetChallengeFeedback(definition.errors[value] || "这项处置与眼前尚未确认的人数相冲突。", "error");
    }));
  });
  ui.challengeWorkspace.appendChild(choices);
}

function RenderRollcallChallenge(definition, state) {
  const person = definition.people[state.index];
  SetChallengeProgress(definition.people.length, state.index, state.index);
  const card = document.createElement("div");
  card.className = "rollcallName";
  const name = document.createElement("b");
  name.textContent = person.name;
  const location = document.createElement("small");
  location.textContent = state.mode === "responded" ? "已有具体方位" : "等待本人或小组回应";
  card.append(name, location);
  ui.challengeWorkspace.appendChild(card);
  const row = document.createElement("div");
  row.className = "challengeButtonRow";
  if (state.mode === "call") {
    row.appendChild(CreateChallengeButton(`点名：${person.name}`, "challengeSubmit", () => {
      gameState.audio.PlaySfx("crowd", gameState.player.position.x);
      if (person.delayed) {
        state.mode = "silent";
        state.feedback = person.silence;
        state.feedbackType = "error";
      } else {
        state.mode = "responded";
        state.feedback = person.response;
        state.feedbackType = "success";
      }
      RenderChallenge();
    }));
  } else if (state.mode === "silent") {
    row.appendChild(CreateChallengeButton("立刻划作失联", "challengeOption", () => {
      SetChallengeFeedback("中央段的沉默不能替代结论。东侧刚有木轮停顿和两下轻敲，先听方位再落笔。", "error");
    }));
    row.appendChild(CreateChallengeButton("保留名字，再听东侧", "challengeOption", () => {
      state.mode = "responded";
      state.feedback = person.response;
      state.feedbackType = "success";
      gameState.audio.PlaySfx("knock", gameState.player.position.x + 3);
      RenderChallenge();
    }));
  } else {
    row.appendChild(CreateChallengeButton(state.index === definition.people.length - 1 ? "记下最后回应" : "记下回应，点下一名", "challengeSubmit", () => {
      if (state.index >= definition.people.length - 1) {
        CompleteChallenge(definition.success);
        return;
      }
      state.index += 1;
      state.mode = "call";
      state.feedback = "上一人的方位已经写下。";
      state.feedbackType = "success";
      RenderChallenge();
    }));
  }
  ui.challengeWorkspace.appendChild(row);
}

function RenderRedundancyChallenge(definition, state) {
  SetChallengeProgress(2, state.listened ? 1 : 0, state.listened ? 1 : 0);
  if (!state.listened) {
    AddChallengeText("challengeClue", "约定的一轮尚未走完。此时催敲会盖住迟到回声。");
    ui.challengeWorkspace.appendChild(CreateChallengeButton("等满一轮，分辨尾音", "challengeSubmit", () => {
      state.listened = true;
      state.feedback = definition.report;
      state.feedbackType = "success";
      gameState.audio.PlaySfx("network", gameState.player.position.x + 2);
      RenderChallenge();
    }));
    return;
  }
  AddChallengeText("challengeClue", definition.report);
  AddChallengeText("challengeQuestion", "下一步从哪条短湾接向西平交通口？");
  const row = document.createElement("div");
  row.className = "challengeButtonRow";
  definition.choices.forEach(([value, label]) => {
    row.appendChild(CreateChallengeButton(label, "challengeOption", () => {
      if (value === definition.correct) CompleteChallenge(definition.success);
      else SetChallengeFeedback(definition.errors[value], "error");
    }));
  });
  ui.challengeWorkspace.appendChild(row);
}

function CompleteChallenge(successText) {
  const activeChallenge = gameState.challenge;
  if (!activeChallenge || activeChallenge.state.finishing) return;
  activeChallenge.state.finishing = true;
  ui.challengeCancel.disabled = true;
  ui.challengeWorkspace.querySelectorAll("button, select").forEach((control) => { control.disabled = true; });
  SetChallengeFeedback(successText, "success");
  const delay = gameState.settings.reduceMotion ? 90 : 520;
  activeChallenge.state.timer = window.setTimeout(() => {
    if (gameState.challenge !== activeChallenge) return;
    const { action } = activeChallenge;
    CloseChallenge(true);
    ResolveAction(action);
  }, delay);
}

function PerformAction(action) {
  const challenge = ChallengeData[action.id];
  if (challenge) {
    OpenChallenge(action, challenge);
    return;
  }
  ResolveAction(action);
}

function StartCausalShot(action) {
  const shot = action.causalShot;
  if (!shot || !gameState.world?.consequences) return;
  const foreground = shot.foreground;
  const background = shot.background;
  const targetX = THREE.MathUtils.clamp(Number(shot.targetX) || action.x, -StageLimit, StageLimit);
  const duration = THREE.MathUtils.clamp(Number(shot.duration) || 1800, 700, 5000);
  const shotLayer = shot.layer || action.layer;
  const oldTableau = gameState.world.consequences.getObjectByName("causalShotTableau");
  if (oldTableau) {
    oldTableau.parent.remove(oldTableau);
    DisposeTree(oldTableau);
  }
  const tableau = new THREE.Group();
  tableau.name = "causalShotTableau";
  tableau.position.set(targetX, shotLayer === "surface" ? SurfaceFootY : TunnelFootY, 0);
  const foregroundProp = CreateProp(shot.foregroundKind || (action.kind === "listen" ? "listen" : "network"));
  foregroundProp.position.set(-.86, .02, 3.25);
  foregroundProp.scale.setScalar(.82);
  foregroundProp.traverse((child) => { if (child.isMesh) child.renderOrder = Math.max(11, child.renderOrder || 0); });
  const backgroundProp = CreateProp(shot.kind || "group");
  backgroundProp.position.set(.92, .12, .55);
  backgroundProp.scale.setScalar(.76);
  backgroundProp.traverse((child) => {
    if (child.isMesh) {
      child.renderOrder = Math.min(6, child.renderOrder || 6);
      if (child.material?.color) child.material.color.lerp(new THREE.Color("#8c806e"), .24);
    }
  });
  tableau.add(foregroundProp, backgroundProp);
  gameState.world.consequences.add(tableau);
  StartCameraShot(targetX, { zoom: shot.depth === "foreground" ? 1.08 : 1.02, duration, enter: 320, exit: 560 });
  ShowSoundCaption(`${foreground}；后景：${background}`, targetX);
  window.setTimeout(() => {
    if (!tableau.parent) return;
    tableau.parent.remove(tableau);
    DisposeTree(tableau);
  }, duration + 180);
}

function ResolveAction(action) {
  const repeated = gameState.completed.has(action.id);
  if (repeated && action.repeatUntil) {
    if (action.noiseCover) gameState.noiseCover = Math.max(gameState.noiseCover, Number(action.noiseCover) || 0);
    gameState.suspicion = Math.max(0, gameState.suspicion - .12);
    StartCameraShot(action.x, { zoom: 1.06, duration: 1150, enter: 260, exit: 420 });
    gameState.audio.PlaySfx(action.sound, action.x);
    ShowSoundCaption(action.repeatCaption || action.caption, action.x);
    UpdateMarkers();
    RenderOnce();
    return;
  }
  gameState.completed.add(action.id);
  gameState.crouchPathFailures.delete(action.id);
  StartCameraShot(THREE.MathUtils.lerp(gameState.player.position.x, action.x, .62), {
    zoom: action.kind === "group" || action.kind === "stretcher" || action.kind === "rescue" ? 1.04 : 1.1,
    duration: action.dialogue?.length > 1 ? 2600 : 1750,
    enter: 380,
    exit: 560
  });
  if (action.causalShot) StartCausalShot(action);
  gameState.pendingDialogue = action.dialogue?.length ? { type: "action", actionId: action.id, index: 0 } : null;
  if (action.mutate === "carry") {
    gameState.carry = true;
    SetSpriteFrame(gameState.player, 5);
  }
  if (action.consumeHeld) ClearHeldProp();
  if (action.pickupKind) EquipHeldProp(action.pickupKind);
  if (action.noiseCover) gameState.noiseCover = Math.max(gameState.noiseCover, Number(action.noiseCover) || 0);
  if (action.startsSmoke) gameState.smokePressure = Math.max(gameState.smokePressure, .16);
  if (action.smokeRelief) gameState.smokePressure = Math.max(0, gameState.smokePressure - action.smokeRelief);
  gameState.suspicion = Math.max(0, gameState.suspicion - .16);
  gameState.audio.PlaySfx(action.sound, action.x);
  if (action.caption) ShowSoundCaption(action.caption, action.x);
  const marker = gameState.markers.get(action.id);
  if (marker) {
    marker.visible = false;
    CreateChalkBurst(action.x, action.layer === "surface" ? SurfaceFootY + 1.3 : TunnelFootY + 1.3);
  }
  RenderOnce();
  SaveProgress();
  if (action.dialogue?.length) QueueDialogue(action.dialogue, AfterActionResolution, { type: "action", actionId: action.id });
  else AfterActionResolution();
}

function AfterActionResolution() {
  gameState.pendingDialogue = null;
  UpdateMarkers();
  SaveProgress();
  const chapter = ChapterData[gameState.chapterIndex];
  const chapterComplete = chapter.interactions.every((item) => gameState.completed.has(item.id));
  if (chapterComplete && gameState.chapterIndex === 4 && gameState.completed.has("sealBranch") && !gameState.smokeDecayCinematic) {
    const duration = gameState.settings.reduceMotion ? 2600 : 4400;
    gameState.smokeDecayCinematic = true;
    gameState.paused = true;
    document.body.classList.add("uiBlocked");
    ui.cinematicBars.classList.add("isActive");
    StartCameraShot(gameState.player.position.x - 1.15, { zoom: 1.03, duration, enter: 420, exit: 620 });
    ShowSoundCaption("最后一楔截住新烟；通道里原有的湿烟仍沿清洁风路缓慢变淡", gameState.player.position.x - 1.4);
    gameState.audio.PlaySfx("air", gameState.player.position.x - 1.8);
    window.setTimeout(() => {
      gameState.smokeDecayCinematic = false;
      gameState.paused = false;
      document.body.classList.remove("uiBlocked");
      ui.cinematicBars.classList.remove("isActive");
      FinishChapter();
    }, duration);
    return;
  }
  if (chapterComplete) FinishChapter();
  else ShowObjective();
}

function TransitionDepth(entryX) {
  const toLayer = gameState.currentLayer === "surface" ? "tunnel" : "surface";
  const duration = gameState.settings.reduceMotion ? 620 : DepthTransitionDuration;
  gameState.depthTransition = {
    start: performance.now(),
    duration,
    from: gameState.depthBlend,
    to: toLayer === "tunnel" ? 1 : 0,
    toLayer,
    entryX,
    fromY: gameState.player.position.y,
    toY: toLayer === "surface" ? SurfaceFootY : TunnelFootY
  };
  gameState.player.position.x = entryX;
  gameState.world.depthOccluder.position.set(entryX, SurfaceFootY, 3.12);
  gameState.world.depthOccluder.visible = true;
  gameState.world.depthOccluder.userData.curtain.material.uniforms.uOpacity.value = 0;
  gameState.world.depthOccluder.userData.curtain.material.uniforms.uProgress.value = 0;
  gameState.world.depthOccluder.userData.strataMaterials.forEach((material) => { material.opacity = 0; });
  StartCameraShot(entryX, { zoom: 1.1, duration: duration + 360, enter: 220, exit: 420 });
  gameState.audio.PlaySfx(toLayer === "tunnel" ? "earth" : "air", entryX);
  ui.cinematicBars.classList.add("isActive");
  ShowSoundCaption(toLayer === "tunnel" ? "脚步下沉：地面声被土层滤去" : "头顶：天光与风声靠近", entryX);
}

function UpdateDepthTransition(now) {
  const transition = gameState.depthTransition;
  if (!transition) return;
  const raw = THREE.MathUtils.clamp((now - transition.start) / transition.duration, 0, 1);
  const travel = THREE.MathUtils.smoothstep(raw, .18, .84);
  const eased = travel < .5 ? 4 * travel * travel * travel : 1 - Math.pow(-2 * travel + 2, 3) / 2;
  gameState.depthBlend = THREE.MathUtils.lerp(transition.from, transition.to, eased);
  const midpointOcclusion = Math.sin(raw * Math.PI);
  const visibility = THREE.MathUtils.lerp(1, DepthPlayerMinOpacity, Math.pow(midpointOcclusion, .78));
  gameState.player.position.y = THREE.MathUtils.lerp(transition.fromY, transition.toY, eased);
  const curtainRise = THREE.MathUtils.smoothstep(raw, .06, .38);
  const curtainFall = 1 - THREE.MathUtils.smoothstep(raw, .56, .78);
  const curtainOpacity = curtainRise * curtainFall;
  gameState.world.depthOccluder.userData.curtain.material.uniforms.uOpacity.value = curtainOpacity * DepthCurtainMaxOpacity;
  gameState.world.depthOccluder.userData.curtain.material.uniforms.uProgress.value = raw;
  gameState.world.depthOccluder.userData.strataMaterials.forEach((material, index) => {
    material.opacity = curtainOpacity * (.28 + (index % 3) * .08);
  });
  gameState.player.userData.spriteMesh.material.opacity = THREE.MathUtils.clamp(visibility, DepthPlayerMinOpacity, 1);
  SetHeldPropVisibility(visibility);
  const depthScale = THREE.MathUtils.lerp(1, .78, gameState.depthBlend);
  gameState.player.userData.spriteMesh.scale.set(
    gameState.player.userData.facing * depthScale,
    depthScale,
    1
  );
  gameState.player.userData.spriteMesh.position.y = gameState.player.userData.baseVisualY * depthScale;
  SetSpriteFrame(gameState.player, 3);
  gameState.audio.SetDepth(gameState.depthBlend);
  if (raw >= 1) {
    gameState.currentLayer = transition.toLayer;
    ui.touchDepthLabel.textContent = gameState.currentLayer === "surface" ? "下行" : "上行";
    gameState.depthTransition = null;
    gameState.player.position.y = transition.toY;
    gameState.world.depthOccluder.visible = false;
    gameState.world.depthOccluder.userData.curtain.material.uniforms.uOpacity.value = 0;
    gameState.world.depthOccluder.userData.curtain.material.uniforms.uProgress.value = 1;
    gameState.world.depthOccluder.userData.strataMaterials.forEach((material) => { material.opacity = 0; });
    gameState.player.userData.spriteMesh.material.opacity = 1;
    SetHeldPropVisibility(1);
    const finalDepthScale = gameState.currentLayer === "tunnel" ? .78 : 1;
    gameState.player.userData.spriteMesh.scale.set(
      gameState.player.userData.facing * finalDepthScale,
      finalDepthScale,
      1
    );
    gameState.player.userData.spriteMesh.position.y = gameState.player.userData.baseVisualY * finalDepthScale;
    SetSpriteFrame(gameState.player, gameState.carry ? 5 : 0);
    ui.cinematicBars.classList.remove("isActive");
    if (!gameState.prologue) SaveProgress();
    UpdatePrompt();
  }
}

function QueueDialogue(lines, onDone = null, source = null, startIndex = 0) {
  if (!Array.isArray(lines) || lines.length === 0) {
    onDone?.();
    return;
  }
  const safeStart = THREE.MathUtils.clamp(Math.floor(Number(startIndex) || 0), 0, Math.max(0, lines.length - 1));
  gameState.dialogueQueue = lines.slice(safeStart).map(([speaker, text]) => ({ speaker, text }));
  gameState.dialogueDone = onDone;
  gameState.dialogueSource = source;
  gameState.dialogueIndex = safeStart;
  if (source) gameState.pendingDialogue = { ...source, index: safeStart };
  gameState.inDialogue = true;
  gameState.paused = true;
  ui.interactionPrompt.hidden = true;
  gameState.promptSignature = "blocked";
  document.body.classList.add("uiBlocked", "isDialogue");
  ui.dialoguePanel.hidden = false;
  gameState.dialogueUsesBars = !source || source.type === "outro" || lines.length > 1;
  ui.cinematicBars.classList.toggle("isActive", gameState.dialogueUsesBars);
  DisplayDialogueLine();
}

function DisplayDialogueLine() {
  const line = gameState.dialogueQueue[0];
  if (!line) return;
  ui.dialogueSpeaker.textContent = line.speaker;
  ui.dialogueText.textContent = line.text;
}

function AdvanceDialogue() {
  if (!gameState.inDialogue) return;
  gameState.audio?.context?.resume?.();
  gameState.dialogueQueue.shift();
  gameState.dialogueIndex += 1;
  if (gameState.dialogueSource) {
    gameState.pendingDialogue = { ...gameState.dialogueSource, index: gameState.dialogueIndex };
    SaveProgress();
  }
  if (gameState.dialogueQueue.length) {
    DisplayDialogueLine();
    gameState.audio.PlaySfx("paper", gameState.player.position.x);
    return;
  }
  ui.dialoguePanel.hidden = true;
  if (gameState.dialogueUsesBars) ui.cinematicBars.classList.remove("isActive");
  gameState.dialogueUsesBars = false;
  gameState.inDialogue = false;
  gameState.paused = false;
  gameState.dialogueSource = null;
  gameState.pendingDialogue = null;
  document.body.classList.remove("uiBlocked", "isDialogue");
  const callback = gameState.dialogueDone;
  gameState.dialogueDone = null;
  callback?.();
  SaveProgress();
}

function ShowSoundCaption(text, sourceX = gameState.cameraX) {
  if (!gameState.settings.captions) return;
  const direction = sourceX < gameState.cameraX - 1 ? "左侧 · " : sourceX > gameState.cameraX + 1 ? "右侧 · " : "";
  ui.soundCaption.querySelector("span").textContent = direction + text;
  ui.soundCaption.hidden = false;
  gameState.lastCaptionTime = performance.now();
  window.clearTimeout(ShowSoundCaption.timer);
  ShowSoundCaption.timer = window.setTimeout(() => { ui.soundCaption.hidden = true; }, 2600);
}

function CreateChalkBurst(x, y) {
  const count = IsMobile() ? 12 : 22;
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = 3.2;
    velocities.push({ x: (Math.random() - .5) * 1.4, y: Math.random() * 1.2 + .2 });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: "#dfd0a8", size: .06, transparent: true, opacity: .78, depthWrite: false });
  const points = new THREE.Points(geometry, material);
  points.userData = { born: performance.now(), velocities };
  gameState.world.effects.add(points);
  window.setTimeout(() => {
    gameState.world.effects.remove(points);
    geometry.dispose();
    material.dispose();
  }, 950);
}

function UpdateEffectBursts(now, delta) {
  gameState.world.effects.children.forEach((child) => {
    if (!child.userData.born || !child.userData.velocities) return;
    const position = child.geometry.attributes.position;
    child.userData.velocities.forEach((velocity, index) => {
      position.array[index * 3] += velocity.x * delta;
      position.array[index * 3 + 1] += velocity.y * delta;
      velocity.y -= 2.1 * delta;
    });
    position.needsUpdate = true;
    child.material.opacity = THREE.MathUtils.clamp(1 - (now - child.userData.born) / 900, 0, 1) * .75;
  });
}

function FinishChapter(resumeIndex = 0) {
  if (gameState.chapterEnding && gameState.inDialogue) return;
  gameState.chapterEnding = true;
  gameState.chapterPhase = "outro";
  gameState.pendingDialogue = { type: "outro", index: resumeIndex };
  SaveProgress();
  gameState.paused = true;
  document.body.classList.add("uiBlocked");
  const chapter = ChapterData[gameState.chapterIndex];
  StartCameraShot(gameState.player.position.x, { zoom: .86, duration: 2800, enter: 460, exit: 620 });
  QueueDialogue(chapter.outro, PresentChapterComplete, { type: "outro" }, resumeIndex);
}

function PresentChapterComplete() {
  const chapter = ChapterData[gameState.chapterIndex];
  gameState.paused = true;
  gameState.chapterEnding = false;
  gameState.chapterPhase = "complete";
  gameState.pendingDialogue = null;
  gameState.unlockedChapter = Math.max(gameState.unlockedChapter, Math.min(ChapterData.length - 1, gameState.chapterIndex + 1));
  SaveProgress();
  ui.completeTitle.textContent = chapter.title;
  ui.completeQuote.textContent = chapter.quote;
  if (chapter.cost) {
    ui.costLedger.hidden = false;
    ui.costLedger.querySelector("p").textContent = chapter.cost;
  } else {
    ui.costLedger.hidden = true;
  }
  ui.nextChapterButton.textContent = gameState.chapterIndex === ChapterData.length - 1 ? "看见黎明" : "继续下一章";
  ui.chapterComplete.hidden = false;
}

function NextChapter() {
  ui.chapterComplete.hidden = true;
  if (gameState.chapterIndex >= ChapterData.length - 1) {
    ShowEnding();
  } else {
    StartGame(gameState.chapterIndex + 1, false);
  }
}

function BuildEpilogueTableau() {
  const tableau = gameState.world.epilogue;
  DisposeChildren(tableau);
  const beatObjects = {};
  const Place = (kind, x, scale = 1, y = SurfaceFootY) => {
    const prop = CreateProp(kind);
    prop.position.set(x, y, 2.1);
    prop.scale.setScalar(scale);
    tableau.add(prop);
    return prop;
  };

  const bellMemorial = CreatePrologueBell();
  bellMemorial.position.set(-9.35, SurfaceFootY, 2.05);
  bellMemorial.scale.setScalar(.72);
  tableau.add(bellMemorial);
  const memorialStone = new THREE.Mesh(new THREE.PlaneGeometry(1.18, .46), CreatePaperMaterial("#524b42", .96));
  memorialStone.position.set(-9.35, SurfaceFootY + .22, 2.16);
  tableau.add(memorialStone);
  beatObjects.bellMemorial = [bellMemorial, memorialStone];

  const cutaway = new THREE.Mesh(
    new THREE.PlaneGeometry(3.3, 1.7),
    new THREE.MeshBasicMaterial({ color: "#2d241d", transparent: true, opacity: .92, depthWrite: false })
  );
  cutaway.position.set(-5.85, SurfaceFootY - 1.34, 1.8);
  tableau.add(cutaway);
  const smokeSeal = Place("seal", -5.85, 1.02, SurfaceFootY - 2.08);
  const oldBrace = Place("brace", -5.15, .82, SurfaceFootY - 2.08);
  beatObjects.sealedSmokeBranch = [cutaway, smokeSeal, oldBrace];

  const villageMilitia = Place("group", -2.65, .88);
  const guerrillas = Place("rescue", -1.55, .84);
  guerrillas.scale.x = -.84;
  const mainForce = Place("group", -.32, .92);
  mainForce.scale.x = -.92;
  beatObjects.threeForces = [villageMilitia, guerrillas, mainForce];

  const stronghold = new THREE.Group();
  const towerDark = CreatePaperMaterial("#252b2b", .98);
  const AddTowerPart = (width, height, x, y) => {
    const part = new THREE.Mesh(new THREE.PlaneGeometry(width, height), towerDark);
    part.position.set(x, y, 0);
    stronghold.add(part);
    return part;
  };
  AddTowerPart(.16, 2.65, -.68, 1.32);
  AddTowerPart(.16, 2.65, .68, 1.32);
  AddTowerPart(1.68, .22, 0, 2.52);
  AddTowerPart(1.18, .76, 0, 2.94);
  AddTowerPart(1.58, .13, 0, 3.38);
  const lastLamp = new THREE.Mesh(new THREE.CircleGeometry(.16, 24), CreatePaperMaterial("#e7a45b", .96));
  lastLamp.position.set(.34, 3.02, .08);
  lastLamp.renderOrder = 9;
  stronghold.add(lastLamp);
  stronghold.position.set(2.45, SurfaceFootY, 2.05);
  stronghold.userData.lastLamp = lastLamp;
  tableau.add(stronghold);
  beatObjects.blackWindDark = [stronghold];

  const villageNode = Place("network", 6.8, .92);
  const fieldNode = Place("network", 8.1, .88);
  const strongholdNode = Place("networkFinal", 9.4, 1.04);
  beatObjects.connectedNetwork = [villageNode, fieldNode, strongholdNode];
  tableau.userData.beatObjects = beatObjects;
  tableau.visible = true;
}

function ActivateEpilogueBeat(beat) {
  if (!beat || gameState.epilogueBeats.has(beat.id)) return;
  gameState.epilogueBeats.add(beat.id);
  const objects = gameState.world.epilogue.userData.beatObjects?.[beat.id] || [];
  objects.forEach((object, index) => {
    object.traverse?.((child) => {
      if (child.isMesh && child.material?.color) child.material.color.lerp(new THREE.Color("#d6ad6c"), .12);
    });
    object.position.y += index % 2 ? .035 : .07;
  });
  if (beat.id === "bellMemorial") {
    const bell = objects[0];
    if (bell?.userData) bell.userData.ringing = 1;
  } else if (beat.id === "sealedSmokeBranch") {
    if (objects[1]) objects[1].scale.x *= 1.08;
    if (objects[2]) objects[2].position.x -= .12;
  } else if (beat.id === "threeForces") {
    if (objects[0]) objects[0].position.x += .16;
    if (objects[2]) objects[2].position.x -= .16;
  } else if (beat.id === "blackWindDark") {
    const lamp = objects[0]?.userData?.lastLamp;
    if (lamp?.material) lamp.material.opacity = .08;
  } else if (beat.id === "connectedNetwork") {
    if (objects[0]) objects[0].position.x += .14;
    if (objects[2]) objects[2].position.x -= .14;
  }
  ui.endingBeatText.textContent = beat.lines.map(([speaker, line]) => `${speaker}：“${line}”`).join("　");
  gameState.audio.PlaySfx(beat.sound, beat.x);
  StartCameraShot(beat.x, { zoom: 1.04, duration: 1600, enter: 300, exit: 520 });
  if (gameState.epilogueBeats.size >= EpilogueBeatData.length) {
    ui.endingSummary.textContent = "高老忠的钟声、高家庄的翻口、西平的围点与黑风口的最后一盏灯，终于被同一张联防地道网接在一起。";
    ui.endingFinalQuote.hidden = false;
    ui.endingScreen.classList.add("isSettled");
  }
}

function UpdateEpilogueBeats() {
  if (!gameState.epilogue || gameState.paused || gameState.inDialogue) return;
  const nextBeat = EpilogueBeatData.find((beat) => !gameState.epilogueBeats.has(beat.id));
  if (nextBeat && gameState.player.position.x >= nextBeat.x) ActivateEpilogueBeat(nextBeat);
}

function ShowEnding() {
  ResetInputState();
  gameState.chapterActive = true;
  gameState.paused = false;
  gameState.epilogue = true;
  gameState.chapterPhase = "epilogue";
  gameState.currentLayer = "surface";
  gameState.depthBlend = 0;
  gameState.carry = false;
  ClearHeldProp();
  gameState.epilogueBeats = new Set();
  gameState.world.searchlight.visible = false;
  gameState.world.patrolGuard.visible = false;
  gameState.world.consequences.visible = false;
  gameState.player.position.set(-11.1, SurfaceFootY, 2.8);
  gameState.player.userData.previousX = -11.1;
  gameState.player.userData.walkDistance = 0;
  SetSpriteFrame(gameState.player, 0);
  gameState.markers.forEach((marker) => { marker.visible = false; });
  BuildEpilogueTableau();
  document.body.classList.remove("uiBlocked");
  document.body.classList.add("isPlaying", "endingWalk");
  ui.gameHeader.hidden = true;
  ui.objectiveCard.hidden = true;
  ui.interactionPrompt.hidden = true;
  ui.endingScreen.hidden = false;
  ui.endingScreen.classList.add("isEpilogue");
  ui.endingSummary.textContent = "天快亮了。沿着村路向右走：钟楼、封住的烟路、三支会合的队伍、熄灯的黑风口与新接成的地道网都留在同一幅长镜头里。";
  ui.endingBeatText.textContent = "钟楼下，风又推了一下没有人拉动的钟绳。";
  ui.endingFinalQuote.hidden = true;
  requestAnimationFrame(() => ui.endingScreen.classList.add("isVisible"));
  StartCameraShot(-6.4, { zoom: .88, duration: 3600, enter: 620, exit: 720 });
  gameState.audio.PlaySfx("network", gameState.cameraX);
}

function SetPaused(paused) {
  if (!gameState.chapterActive || gameState.inDialogue) return;
  if (paused) ResetInputState();
  gameState.paused = paused;
  ui.pausePanel.hidden = !paused;
  document.body.classList.toggle("uiBlocked", paused);
  if (paused) ui.interactionPrompt.hidden = true;
  if (paused) gameState.audio?.context?.suspend?.();
  else gameState.audio?.context?.resume?.();
}

function ToggleSound() {
  const muted = gameState.audio.ToggleMute();
  ui.soundButton.classList.toggle("isMuted", muted);
  ui.soundButton.setAttribute("aria-label", muted ? "开启声音" : "静音");
}

function ShowTitle() {
  ResetChallenge();
  ResetWorldTask(false);
  gameState.chapterActive = false;
  gameState.paused = true;
  gameState.prologue = null;
  gameState.world.prologue.visible = false;
  ui.prologueSkip.hidden = true;
  document.body.classList.remove("isPlaying", "isPrologue", "uiBlocked", "isDialogue", "endingWalk", "touchIdle");
  ui.pausePanel.hidden = true;
  ui.chapterComplete.hidden = true;
  ui.gameHeader.hidden = true;
  ui.objectiveCard.hidden = true;
  ui.interactionPrompt.hidden = true;
  ui.dialoguePanel.hidden = true;
  gameState.audio?.context?.suspend?.();
  ui.titleScreen.hidden = false;
  requestAnimationFrame(() => ui.titleScreen.classList.add("isVisible"));
}

function UpdatePlayer(delta, time) {
  if (!gameState.chapterActive || gameState.paused || gameState.inDialogue || gameState.depthTransition || gameState.prologue?.lockPlayer) {
    AnimateSpriteActor(gameState.player, delta, time, false, false, gameState.carry || Boolean(gameState.heldPropKind));
    return;
  }
  const direction = (gameState.keys.right ? 1 : 0) - (gameState.keys.left ? 1 : 0);
  const crouched = gameState.keys.crouch;
  const burdened = gameState.carry || Boolean(gameState.heldPropKind);
  const baseSpeed = burdened ? (crouched ? 1.18 : 1.72) : crouched ? 1.42 : 3.05;
  if (direction !== 0) {
    gameState.player.position.x = THREE.MathUtils.clamp(gameState.player.position.x + direction * baseSpeed * delta, -StageLimit, StageLimit);
    gameState.player.userData.spriteMesh.scale.x = direction;
    gameState.player.userData.facing = direction;
  }
  UpdateEpilogueBeats();
  AnimateSpriteActor(gameState.player, delta, time, Math.abs(direction), crouched, burdened);
}

function NudgePlayer(direction) {
  if (!gameState.chapterActive || gameState.paused || gameState.inDialogue || gameState.depthTransition) return;
  const amount = gameState.carry || gameState.heldPropKind ? .14 : gameState.keys.crouch ? .12 : .21;
  gameState.player.position.x = THREE.MathUtils.clamp(gameState.player.position.x + direction * amount, -StageLimit, StageLimit);
  gameState.player.userData.spriteMesh.scale.x = direction;
  gameState.player.userData.facing = direction;
}

function StartCameraShot(targetX, options = {}) {
  const now = performance.now();
  const duration = gameState.settings.reduceMotion
    ? Math.min(Number(options.duration) || 1500, 760)
    : Number(options.duration) || 1500;
  gameState.cameraShot = {
    start: now,
    duration,
    enter: Math.min(Number(options.enter) || 360, duration * .42),
    exit: Math.min(Number(options.exit) || 520, duration * .46),
    targetX: ClampCameraX(Number(targetX) || 0),
    zoom: THREE.MathUtils.clamp(Number(options.zoom) || 1.08, .82, 1.16),
    yOffset: Number(options.yOffset) || 0
  };
}

function AddCameraImpact(amount = 1) {
  if (gameState.settings.reduceMotion) return;
  gameState.cameraShake = Math.max(gameState.cameraShake, THREE.MathUtils.clamp(amount, 0, 1));
}

function GetCameraShotWeight(now, shot) {
  const elapsed = now - shot.start;
  if (elapsed <= 0) return 0;
  if (elapsed >= shot.duration) return 0;
  if (elapsed < shot.enter) return THREE.MathUtils.smoothstep(elapsed, 0, shot.enter);
  const exitStart = shot.duration - shot.exit;
  if (elapsed <= exitStart) return 1;
  return 1 - THREE.MathUtils.smoothstep(elapsed, exitStart, shot.duration);
}

function ApplyParallax(stableCameraX = gameState.cameraX) {
  if (!gameState.world?.surfaceFar) return;
  const parallaxScale = gameState.settings.reduceMotion ? .42 : 1;
  const OffsetFor = (layerScroll) => stableCameraX * (1 - THREE.MathUtils.lerp(1, layerScroll, parallaxScale));
  gameState.world.surfaceFar.position.x = OffsetFor(LayerScroll.surfaceFar);
  gameState.world.surfaceDress.position.x = OffsetFor(LayerScroll.surfaceDress);
  gameState.world.surfaceMid.position.x = OffsetFor(LayerScroll.surfaceMid);
  gameState.world.surfaceNear.position.x = OffsetFor(LayerScroll.surfaceNear);
  gameState.world.foreground.position.x = OffsetFor(LayerScroll.surfaceForeground);
  gameState.world.tunnelFar.position.x = OffsetFor(LayerScroll.tunnelFar);
  gameState.world.tunnelNear.position.x = OffsetFor(LayerScroll.tunnelNear);
  gameState.world.tunnelForeground.position.x = OffsetFor(LayerScroll.tunnelForeground);
}

function UpdateCamera(delta) {
  const now = performance.now();
  const reduceFactor = gameState.settings.reduceMotion ? .45 : 1;
  const lookAhead = gameState.keys.right ? 1.35 : gameState.keys.left ? -1.35 : 0;
  let targetZoom = gameState.suspicion > .42 && gameState.currentLayer === "surface" ? .96 : 1;
  let targetX = gameState.player.position.x + lookAhead * reduceFactor;
  if (gameState.inDialogue) {
    targetX = gameState.player.position.x + gameState.player.userData.facing * 2.05 * reduceFactor;
    targetZoom = 1.04;
  }
  if (gameState.suspicion > .2 && gameState.currentLayer === "surface") {
    const threatWeight = THREE.MathUtils.smoothstep(gameState.suspicion, .2, .9) * .28;
    const threatX = gameState.world.patrolGuard?.visible
      ? gameState.world.patrolGuard.position.x
      : gameState.world.searchlight.position.x;
    targetX = THREE.MathUtils.lerp(targetX, threatX, threatWeight);
  }
  const verticalOffset = THREE.MathUtils.lerp(2.55, 1.9, gameState.depthBlend);
  let targetY = gameState.player.position.y + verticalOffset;
  if (gameState.prologue) {
    const prologue = gameState.prologue;
    const prologueY = Number.isFinite(prologue.cameraY)
      ? prologue.cameraY
      : gameState.player.position.y + verticalOffset;
    targetX = THREE.MathUtils.lerp(targetX, prologue.cameraX, prologue.cameraWeight);
    targetY = THREE.MathUtils.lerp(targetY, prologueY, prologue.cameraWeight);
    targetZoom = THREE.MathUtils.lerp(targetZoom, prologue.zoom, prologue.cameraWeight);
  }
  const shot = gameState.cameraShot;
  if (shot) {
    const shotWeight = GetCameraShotWeight(now, shot);
    targetX = THREE.MathUtils.lerp(targetX, shot.targetX, shotWeight);
    targetY += shot.yOffset * shotWeight;
    targetZoom = THREE.MathUtils.lerp(targetZoom, shot.zoom, shotWeight);
    if (now - shot.start >= shot.duration) gameState.cameraShot = null;
  }
  const zoomFollow = 1 - Math.exp(-delta / .28);
  const nextZoom = THREE.MathUtils.lerp(gameState.cameraZoom, targetZoom, zoomFollow);
  if (Math.abs(nextZoom - gameState.cameraZoom) > .0001) {
    gameState.cameraZoom = THREE.MathUtils.clamp(nextZoom, .82, 1.16);
    gameState.camera.zoom = gameState.cameraZoom;
    gameState.camera.updateProjectionMatrix();
  }
  targetX = ClampCameraX(targetX);
  const followTime = gameState.depthTransition
    ? (gameState.settings.reduceMotion ? .025 : .055)
    : gameState.inDialogue
      ? .46
      : (gameState.keys.left || gameState.keys.right ? .34 : .55);
  const follow = 1 - Math.exp(-delta / followTime);
  gameState.cameraX = THREE.MathUtils.lerp(gameState.cameraX, targetX, follow);
  gameState.cameraY = THREE.MathUtils.lerp(gameState.cameraY, targetY, follow);
  gameState.cameraShake = Math.max(0, gameState.cameraShake - delta * 2.35);
  const shakeTime = now * .001;
  const shakeX = (Math.sin(shakeTime * 37) + Math.sin(shakeTime * 61 + .9) * .42) * .064 * gameState.cameraShake;
  const shakeY = (Math.sin(shakeTime * 43 + 1.7) + Math.sin(shakeTime * 29) * .35) * .032 * gameState.cameraShake;
  gameState.camera.position.x = gameState.cameraX + shakeX;
  gameState.camera.position.y = gameState.cameraY + shakeY;
  gameState.camera.lookAt(gameState.cameraX + shakeX, gameState.cameraY + shakeY, 0);

  ApplyParallax(gameState.cameraX);
}

function GetMobileCoverAction(chapter = ChapterData[gameState.chapterIndex]) {
  return chapter?.interactions?.find((action) => action.mobileCover) || null;
}

function GetMobileCoverZone(chapter = ChapterData[gameState.chapterIndex]) {
  const action = GetMobileCoverAction(chapter);
  const mobileCover = gameState.world.mobileCover;
  if (!action?.mobileCover || !mobileCover?.visible) return null;
  const halfWidth = Number(action.mobileCover.coverHalfWidth) || .82;
  return [mobileCover.position.x - halfWidth, mobileCover.position.x + halfWidth];
}

function UpdateMobileCover(delta, time) {
  const chapter = ChapterData[gameState.chapterIndex];
  const action = GetMobileCoverAction(chapter);
  const mobileCover = gameState.world.mobileCover;
  if (!mobileCover || !action?.mobileCover) {
    if (mobileCover) mobileCover.visible = false;
    return;
  }
  mobileCover.visible = gameState.depthBlend < .985;
  const stops = action.mobileCover.stops.map(Number);
  mobileCover.userData.stops = stops;
  let mobileCoverStopIndex = 0;
  if (gameState.heldPropKind === "medicine") {
    mobileCoverStopIndex = gameState.completed.has(action.id) ? stops.length - 1 : Math.min(1, stops.length - 1);
  } else if (gameState.completed.has(action.id)) {
    mobileCoverStopIndex = stops.length - 1;
  }
  mobileCover.userData.targetStopIndex = mobileCoverStopIndex;
  const targetX = stops[mobileCoverStopIndex];
  const canMove = mobileCoverStopIndex !== mobileCover.userData.lastStopIndex
    && gameState.noiseCover > .05
    && !gameState.paused
    && !gameState.inDialogue;
  const previousX = mobileCover.position.x;
  if (canMove) {
    const distance = targetX - mobileCover.position.x;
    const travel = Math.sign(distance) * Math.min(Math.abs(distance), delta * .58);
    mobileCover.position.x += travel;
    mobileCover.userData.wheelPhase += travel * 3.4;
    if (Math.abs(targetX - mobileCover.position.x) < .018) {
      mobileCover.position.x = targetX;
      mobileCover.userData.lastStopIndex = mobileCoverStopIndex;
      ShowSoundCaption(mobileCoverStopIndex === 1 ? "柴车在泥沟停稳：轴声短歇，第二处实影落定" : "柴车贴到灶后旧柜：最后一段阴影接上", targetX);
    }
  }
  const moving = Math.abs(mobileCover.position.x - previousX) > .0001;
  mobileCover.userData.cart.position.y = .9 + (moving ? Math.sin(mobileCover.userData.wheelPhase * 2) * .012 : 0);
  mobileCover.userData.cart.rotation.z = moving ? Math.sin(mobileCover.userData.wheelPhase) * .005 : 0;
  mobileCover.userData.shadow.material.uniforms.uOpacity.value = moving ? .17 : .2;
}

function RecoverMobileCover() {
  const chapter = ChapterData[gameState.chapterIndex];
  const action = GetMobileCoverAction(chapter);
  const mobileCover = gameState.world.mobileCover;
  if (!action?.mobileCover || !mobileCover?.visible || gameState.heldPropKind !== "medicine") return null;
  const stops = action.mobileCover.stops.map(Number);
  const stopIndex = THREE.MathUtils.clamp(Number(mobileCover.userData.lastStopIndex) || 0, 0, stops.length - 1);
  const stopX = stops[stopIndex];
  mobileCover.position.x = stopX;
  mobileCover.userData.targetStopIndex = stopIndex;
  return stopX;
}

function GetActiveCoverZones(chapter) {
  const carryingMedicine = gameState.heldPropKind === "medicine" && !gameState.completed.has("hideMedicine");
  const mobileZone = carryingMedicine ? GetMobileCoverZone(chapter) : null;
  if (mobileZone) return [mobileZone];
  return carryingMedicine && chapter.medicineCoverZones?.length
    ? chapter.medicineCoverZones
    : (chapter.coverZones || []);
}

function UpdateThreat(delta, time) {
  const chapter = ChapterData[gameState.chapterIndex];
  const light = gameState.world.searchlight;
  const patrol = gameState.world.patrolGuard;
  if (!gameState.paused) gameState.noiseCover = Math.max(0, gameState.noiseCover - delta);
  if (!chapter.threat || !gameState.chapterActive) {
    if (patrol) patrol.visible = false;
    gameState.suspicion = Math.max(0, gameState.suspicion - delta * .4);
    const nextOpacity = gameState.suspicion * .62;
    if (Math.abs(nextOpacity - gameState.vignetteOpacity) > .01) {
      ui.dangerVignette.style.opacity = String(nextOpacity);
      gameState.vignetteOpacity = nextOpacity;
    }
    return;
  }
  const crouched = gameState.keys.crouch;
  const playerX = gameState.player.position.x;
  const coverZones = GetActiveCoverZones(chapter);
  const taskSheltered = Boolean(gameState.worldTask
    && (gameState.worldTask.definition.sheltered || gameState.worldTask.action.shelteredTask));
  const physicalInCover = coverZones.some(([left, right]) => playerX >= left && playerX <= right);
  const inCover = taskSheltered || physicalInCover;
  const onSurface = gameState.currentLayer === "surface" && !gameState.depthTransition;
  if (onSurface && physicalInCover) gameState.lastSafeX = playerX;
  let threatX = 0;
  let visualExposure = false;
  let audibleExposure = false;

  if (chapter.threatMode === "patrol") {
    light.visible = false;
    patrol.visible = gameState.depthBlend < .985;
    const patrolData = patrol.userData;
    const patrolExtent = 7.65;
    const patrolSpeed = 1.56;
    const listenDuration = .78;
    const turnDuration = .5;
    let walking = false;
    let turning = false;
    if (patrolData.phase === "walk") {
      const previousPatrolX = patrol.position.x;
      patrol.position.x += patrolData.patrolDirection * patrolSpeed * delta;
      const reachedEnd = patrolData.patrolDirection > 0
        ? patrol.position.x >= patrolExtent
        : patrol.position.x <= -patrolExtent;
      if (reachedEnd) {
        patrol.position.x = patrolData.patrolDirection > 0 ? patrolExtent : -patrolExtent;
        patrolData.phase = "listen";
        patrolData.phaseElapsed = 0;
      }
      const travelled = Math.abs(patrol.position.x - previousPatrolX);
      patrolData.walkDistance += travelled;
      walking = travelled > .0001;
      SetPatrolFrame(patrol, Math.floor(patrolData.walkDistance / .44) % 2);
    } else if (patrolData.phase === "listen") {
      patrolData.phaseElapsed += delta;
      SetPatrolFrame(patrol, 3);
      if (patrolData.phaseElapsed >= listenDuration) {
        patrolData.phase = "turn";
        patrolData.phaseElapsed = 0;
        patrolData.turnSwapped = false;
        patrolData.targetFacing = -patrolData.facing;
      }
    } else {
      turning = true;
      patrolData.phaseElapsed += delta;
      const turnProgress = THREE.MathUtils.clamp(patrolData.phaseElapsed / turnDuration, 0, 1);
      SetPatrolFrame(patrol, 2);
      if (!patrolData.turnSwapped && turnProgress >= .5) {
        patrolData.facing = patrolData.targetFacing;
        patrolData.patrolDirection = patrolData.targetFacing;
        patrolData.turnSwapped = true;
      }
      if (turnProgress >= 1) {
        patrolData.phase = "walk";
        patrolData.phaseElapsed = 0;
        patrolData.turnSwapped = false;
        turning = false;
      }
    }
    patrolData.patrolX = patrol.position.x;
    threatX = patrol.position.x;
    const facing = patrolData.facing;
    patrolData.facingPivot.scale.set(facing, 1, 1);
    const walkCycle = patrolData.walkDistance * 7.1;
    const turnProgress = patrolData.phase === "turn"
      ? THREE.MathUtils.clamp(patrolData.phaseElapsed / turnDuration, 0, 1)
      : 0;
    patrolData.sprite.position.y = patrolData.baseSpriteY
      + (walking ? Math.abs(Math.sin(walkCycle)) * .018 : Math.sin(time * 1.2) * .005);
    patrolData.sprite.position.x = turning ? Math.sin(turnProgress * Math.PI) * -.045 * facing : 0;
    patrolData.sprite.rotation.z = turning
      ? Math.sin(turnProgress * Math.PI) * -.026 * facing
      : walking ? Math.sin(walkCycle) * .006 * facing : 0;
    patrolData.sprite.material.opacity = 1;
    patrol.userData.shadow.material.uniforms.uOpacity.value = walking ? .2 : .24;
    const ahead = (playerX - threatX) * facing;
    const bodyContact = onSurface && !inCover && Math.abs(playerX - threatX) < 1.55;
    visualExposure = onSurface && !inCover && ahead > .32 && ahead < (crouched ? 2.65 : 4.35);
    const playerMoving = gameState.keys.left || gameState.keys.right;
    audibleExposure = onSurface && !inCover && playerMoving
      && Math.abs(playerX - threatX) < (crouched ? 2.25 : 3.85)
      && gameState.noiseCover <= .05;
    if (bodyContact && !gameState.paused) gameState.suspicion = 1;
  } else {
    patrol.visible = false;
    light.visible = gameState.depthBlend < .985;
    threatX = Math.sin(time * .52 + gameState.chapterIndex * 1.3) * 7.8;
    light.position.x = threatX;
    light.rotation.z = Math.sin(time * .31) * .12;
    visualExposure = onSurface && !inCover
      && Math.abs(playerX - threatX) < (crouched ? .75 : 1.85);
  }

  if ((visualExposure || audibleExposure) && !gameState.paused) {
    const visualGain = visualExposure
      ? (chapter.threatMode === "patrol" ? (crouched ? .24 : 1.05) : (crouched ? .22 : .82))
      : 0;
    const audibleGain = audibleExposure ? (crouched ? .1 : .32) : 0;
    gameState.suspicion = Math.min(1.08, gameState.suspicion + delta * Math.max(visualGain, audibleGain));
    if (gameState.suspicion > .54 && performance.now() - gameState.lastCaptionTime > 2800) {
      ShowSoundCaption(
        chapter.threatMode === "patrol"
          ? (visualExposure ? "巡查者转过肩，视线正压向院墙缺口" : "巡查者听见了院内脚步，正在停下分辨")
          : "搜查者停步，灯光正在回转",
        threatX
      );
    }
  } else {
    gameState.suspicion = Math.max(0, gameState.suspicion - delta * .23);
  }
  const nextOpacity = gameState.suspicion * .76;
  if (Math.abs(nextOpacity - gameState.vignetteOpacity) > .01) {
    ui.dangerVignette.style.opacity = String(nextOpacity);
    gameState.vignetteOpacity = nextOpacity;
  }
  if (gameState.suspicion >= 1) RecoverFromDetection();
}

function RecoverFromDetection() {
  gameState.suspicion = .2;
  const chapter = ChapterData[gameState.chapterIndex];
  const mobileCover = gameState.world.mobileCover;
  const lastStop = RecoverMobileCover();
  const mobileSafeX = mobileCover?.visible ? lastStop : null;
  const safeX = THREE.MathUtils.clamp(mobileSafeX ?? gameState.lastSafeX, -StageLimit, StageLimit);
  gameState.player.position.x = safeX;
  gameState.player.userData.previousX = safeX;
  AddCameraImpact(1);
  StartCameraShot(gameState.player.position.x, { zoom: 1.04, duration: 720, enter: 140, exit: 430 });
  ui.screenFlash.style.opacity = ".24";
  window.setTimeout(() => { ui.screenFlash.style.opacity = "0"; }, 160);
  ShowSoundCaption(mobileSafeX === null ? "警戒升高：退回最近的土墙阴影" : "巡查者回头：你和柴车退回上一停靠点，工具包仍在", gameState.player.position.x);
  gameState.audio.PlaySfx("steps", gameState.player.position.x + 2);
  if (chapter.number === "第一章") gameState.carry = gameState.completed.has("liftXiaoman");
}

function UpdateChapterHazards(delta, time) {
  const smokeLine = gameState.world.smokeLine;
  const smokeScene = gameState.chapterIndex === 4
    && gameState.completed.has("readBlockade")
    && !gameState.epilogue;
  const branchSealed = gameState.completed.has("sealBranch");
  const smokeVisible = smokeScene && (!branchSealed || gameState.smokePressure > .015);
  if (smokeLine) smokeLine.visible = smokeVisible;
  if (!smokeScene) {
    gameState.smokePressure = Math.max(0, gameState.smokePressure - delta * .12);
    return;
  }
  if ((!gameState.paused || gameState.smokeDecayCinematic) && !gameState.inDialogue) {
    if (branchSealed) {
      const decayRate = gameState.smokeDecayCinematic ? .11 : .075;
      gameState.smokePressure = Math.max(0, gameState.smokePressure - delta * decayRate);
    } else {
      let rate = gameState.completed.has("openSmokeVent") ? .012 : .027;
      const smokeTask = gameState.worldTask?.action.id === "openSmokeVent" ? gameState.worldTask : null;
      if (smokeTask?.definition.type === "configuration") {
        if (smokeTask.values.get("mat") === "wet") rate *= .84;
        if (smokeTask.values.get("seam") === "mat") rate *= .68;
        if (smokeTask.values.get("edges") === "sealed") rate *= .74;
        if (smokeTask.values.get("listen") === "closed") rate *= .58;
      }
      gameState.smokePressure = Math.min(1.05, gameState.smokePressure + delta * rate);
    }
  }
  if (smokeLine) {
    smokeLine.position.x = THREE.MathUtils.lerp(-8.8, 8.7, THREE.MathUtils.smoothstep(gameState.smokePressure, .05, 1));
    smokeLine.children.forEach((child, index) => {
      if (child.name !== "smokePuff") return;
      child.position.x += Math.sin(time * 1.2 + index) * delta * .035;
      child.scale.x = 1.05 + Math.sin(time * .9 + index * .7) * .12;
    });
  }
  if (gameState.smokePressure > .72 && performance.now() - gameState.lastCaptionTime > 3200) {
    ShowSoundCaption(branchSealed
      ? "最后一楔截住了新烟；通道里原有的湿烟仍沿清洁风路缓慢变淡"
      : "地下右侧：湿烟已经占满旧砖转角，仍在向有人支路逼近", smokeLine?.position.x ?? gameState.player.position.x);
  }
  if (!branchSealed && gameState.smokePressure >= 1) {
    gameState.smokePressure = .56;
    const safeX = THREE.MathUtils.clamp(gameState.lastSmokeSafeX, -StageLimit, StageLimit);
    if (gameState.worldTask) ResetWorldTask(false);
    gameState.player.position.x = safeX;
    gameState.player.userData.previousX = safeX;
    AddCameraImpact(.72);
    ShowSoundCaption("湿席边缘发干：退回上一处换肩位重新压实", gameState.player.position.x);
    gameState.audio.PlaySfx("air", gameState.player.position.x + 1.5);
  }
  const smokeVignette = gameState.smokePressure * .58;
  ui.dangerVignette.style.opacity = String(smokeVignette);
  gameState.vignetteOpacity = smokeVignette;
}

function UpdateEnvironment(delta, time) {
  const surfacePositions = gameState.world.surfaceDust.geometry.attributes.position;
  const tunnelPositions = gameState.world.tunnelDust.geometry.attributes.position;
  if (gameState.depthBlend < .98) {
    for (let index = 0; index < surfacePositions.count; index += 1) {
      surfacePositions.array[index * 3] += delta * (.03 + (index % 5) * .006);
      surfacePositions.array[index * 3 + 1] += Math.sin(time * .4 + index) * delta * .004;
      if (surfacePositions.array[index * 3] > 17) surfacePositions.array[index * 3] = -17;
    }
    surfacePositions.needsUpdate = true;
  }
  if (gameState.depthBlend > .02) {
    for (let index = 0; index < tunnelPositions.count; index += 1) {
      tunnelPositions.array[index * 3 + 1] -= delta * (.018 + (index % 4) * .006);
      if (tunnelPositions.array[index * 3 + 1] < -14.4) tunnelPositions.array[index * 3 + 1] = -5.3;
    }
    tunnelPositions.needsUpdate = true;
  }
  gameState.world.surfaceDust.material.opacity = THREE.MathUtils.lerp(.42, .1, gameState.depthBlend);
  gameState.world.tunnelDust.material.opacity = THREE.MathUtils.lerp(.08, .5, gameState.depthBlend);
  const surfaceVisible = gameState.depthBlend < .995;
  const tunnelVisible = gameState.depthBlend > .005;
  gameState.world.surfaceFar.visible = surfaceVisible;
  gameState.world.surfaceDress.visible = surfaceVisible;
  gameState.world.surfaceMid.visible = surfaceVisible;
  gameState.world.surfaceNear.visible = surfaceVisible;
  gameState.world.foreground.visible = surfaceVisible;
  gameState.world.tunnelFar.visible = tunnelVisible;
  gameState.world.tunnelNear.visible = tunnelVisible;
  gameState.world.tunnelLightLayer.visible = tunnelVisible;
  gameState.world.surfaceDust.visible = gameState.depthBlend < .98;
  gameState.world.tunnelDust.visible = gameState.depthBlend > .02;
  gameState.world.tunnelForeground.visible = gameState.depthBlend > .045;
  const surfaceReveal = 1 - THREE.MathUtils.smoothstep(gameState.depthBlend, .08, .74);
  const tunnelReveal = THREE.MathUtils.smoothstep(gameState.depthBlend, .04, .28);
  gameState.world.surfaceMaterials.forEach((material) => {
    material.opacity = surfaceReveal * (material.userData.depthOpacity ?? 1);
  });
  gameState.world.tunnelMaterials[0].opacity = tunnelReveal;
  gameState.world.tunnelMaterials[1].opacity = tunnelReveal * .92;
  gameState.world.tunnelMaterials[2].opacity = tunnelReveal * .82;
  const smokeDimming = 1 - THREE.MathUtils.clamp(gameState.smokePressure, 0, 1) * .72;
  gameState.world.tunnelShadeMaterial.opacity = tunnelReveal * (.34 + gameState.smokePressure * .2);
  gameState.world.tunnelLightPools.forEach((pool, index) => {
    const flicker = gameState.settings.reduceMotion
      ? 1
      : .94 + Math.sin(time * (2.1 + index * .37) + index * 1.7) * .035
        + Math.sin(time * 6.7 + index) * .018;
    let storyMultiplier = 1;
    if (gameState.chapterIndex === 5 && index === gameState.world.tunnelLightPools.length - 1) {
      const reedTask = gameState.worldTask?.action.id === "relayReed" ? gameState.worldTask : null;
      const wick = reedTask?.values.get("wick") || "high";
      if (gameState.completed.has("relayReed")) storyMultiplier = 0;
      else if (!reedTask) storyMultiplier = .18;
      else if (wick === "out") storyMultiplier = 0;
      else storyMultiplier = wick === "high" ? 1.72 : 1.28;
    }
    pool.material.uniforms.uOpacity.value = pool.userData.baseOpacity
      * tunnelReveal
      * smokeDimming
      * flicker
      * storyMultiplier;
  });
  const chapter = ChapterData[gameState.chapterIndex];
  const colors = gameState.world;
  colors.actorSurfaceColor.set(chapter.surfaceTint).lerp(colors.actorWhiteColor, .48);
  colors.actorTunnelColor.set(chapter.tunnelTint).lerp(colors.actorLightColor, .42);
  colors.actorCurrentColor.copy(colors.actorSurfaceColor).lerp(colors.actorTunnelColor, gameState.depthBlend);
  if (chapter.threat && chapter.threatMode !== "patrol" && gameState.depthBlend < .16) {
    const beamDistance = Math.abs(gameState.player.position.x - gameState.world.searchlight.position.x);
    const beamInfluence = (1 - THREE.MathUtils.smoothstep(beamDistance, .25, 2.5)) * .42;
    colors.actorCurrentColor.lerp(colors.actorLightColor, beamInfluence);
  }
  if (gameState.depthBlend > .08) {
    let localLight = 0;
    gameState.world.tunnelLightPools.forEach((pool) => {
      const distance = Math.abs(gameState.player.position.x - pool.position.x);
      const proximity = 1 - THREE.MathUtils.smoothstep(distance, .3, 3.5);
      localLight = Math.max(localLight, pool.material.uniforms.uOpacity.value * proximity * 1.9);
    });
    colors.actorCurrentColor.lerp(colors.actorLightColor, THREE.MathUtils.clamp(localLight, 0, .52));
  }
  gameState.player.userData.spriteMesh.material.color.copy(colors.actorCurrentColor);
  if (gameState.world.patrolGuard?.visible) {
    gameState.world.patrolGuard.userData.sprite.material.color.copy(colors.actorSurfaceColor).lerp(colors.actorWhiteColor, .38);
  }
}

function UpdateFps(delta) {
  const fps = 1 / Math.max(delta, .0001);
  gameState.fpsSamples.push(fps);
  if (gameState.fpsSamples.length > 120) gameState.fpsSamples.shift();
}

function RenderLoop(now) {
  requestAnimationFrame(RenderLoop);
  const delta = Math.min(gameState.clock.getDelta(), .05);
  const time = gameState.clock.elapsedTime;
  if (!gameState.chapterActive) return;
  UpdatePlayer(delta, time);
  if (gameState.prologue) {
    UpdateDepthTransition(now);
    UpdatePrologue(gameState.paused ? 0 : delta, time, now);
    UpdateCamera(delta);
    UpdateEnvironment(delta, time);
    UpdateEffectBursts(now, delta);
    UpdatePrompt();
    gameState.audio.Tick(time, 0);
    UpdateFps(delta);
    gameState.renderer.render(gameState.scene, gameState.camera);
    return;
  }
  UpdateCrouchPaths();
  UpdateWorldTask(delta);
  UpdateSpatialActions();
  UpdateDepthTransition(now);
  UpdateCamera(delta);
  UpdateMobileCover(gameState.paused ? 0 : delta, time);
  UpdateThreat(gameState.paused ? 0 : delta, time);
  UpdateChapterHazards(gameState.paused ? 0 : delta, time);
  UpdateEnvironment(delta, time);
  UpdateEffectBursts(now, delta);
  const markerTick = Math.floor(time * (gameState.settings.reduceMotion ? 3 : 18));
  if (markerTick !== gameState.markerTick) {
    gameState.markerTick = markerTick;
    UpdateMarkers(time);
  }
  UpdatePrompt();
  gameState.audio.Tick(time, gameState.suspicion);
  UpdateFps(delta);
  gameState.renderer.render(gameState.scene, gameState.camera);
}

function RenderOnce() {
  if (!gameState.renderer || !gameState.scene || !gameState.camera) return;
  gameState.renderer.render(gameState.scene, gameState.camera);
}

function Delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function BuildDebugApi() {
  window.EarthVeinsDebug = Object.freeze({
    GetState: () => ({
      chapterIndex: gameState.chapterIndex,
      chapterTitle: ChapterData[gameState.chapterIndex].title,
      layer: gameState.currentLayer,
      completed: [...gameState.completed],
      objective: GetCurrentObjective()?.title || null,
      playerX: Number(gameState.player.position.x.toFixed(2)),
      suspicion: Number(gameState.suspicion.toFixed(2)),
      paused: gameState.paused,
      dialogue: gameState.inDialogue,
      challenge: gameState.challenge?.action.id || null,
      challengeType: gameState.challenge?.definition.type || null,
      worldTask: gameState.worldTask?.action.id || null,
      worldTaskType: gameState.worldTask?.definition.type || null,
      worldTaskStep: gameState.worldTask?.step ?? null,
      heldProp: gameState.heldPropKind || null,
      noiseCover: Number(gameState.noiseCover.toFixed(2)),
      smokePressure: Number(gameState.smokePressure.toFixed(2)),
      crouchPathFailures: [...gameState.crouchPathFailures],
      patrolX: gameState.world.patrolGuard?.visible ? Number(gameState.world.patrolGuard.position.x.toFixed(2)) : null,
      patrolFacing: gameState.world.patrolGuard?.visible ? gameState.world.patrolGuard.userData.facing : null,
      prologueBeat: GetPrologueBeat()?.id || null,
      prologueBeatIndex: gameState.prologue?.beatIndex ?? null
    }),
    GetChallengeState: () => gameState.challenge ? {
      actionId: gameState.challenge.action.id,
      type: gameState.challenge.definition.type,
      step: gameState.challenge.state.step ?? gameState.challenge.state.phase ?? gameState.challenge.state.index ?? null,
      heard: [...(gameState.challenge.state.heard || [])],
      input: [...(gameState.challenge.state.input || [])],
      listened: Boolean(gameState.challenge.state.listened),
      finishing: Boolean(gameState.challenge.state.finishing)
    } : null,
    GetWorldTaskState: () => gameState.worldTask ? {
      actionId: gameState.worldTask.action.id,
      type: gameState.worldTask.definition.type,
      step: gameState.worldTask.step,
      touched: [...gameState.worldTask.touched],
      heard: [...gameState.worldTask.heard],
      values: Object.fromEntries(gameState.worldTask.values)
    } : null,
    StartPrologue: () => StartPrologue(),
    StartChapter: (index) => StartGame(THREE.MathUtils.clamp(Number(index) || 0, 0, ChapterData.length - 1), false),
    CompleteCurrentAction: () => {
      if (gameState.paused || gameState.inDialogue || gameState.depthTransition) return null;
      const action = FindNearestAction();
      if (action) BeginActionInput();
      return action?.id || null;
    },
    MoveTo: (x) => { gameState.player.position.x = THREE.MathUtils.clamp(Number(x) || 0, -StageLimit, StageLimit); },
    ToggleDepth: () => {
      if (gameState.paused || gameState.inDialogue || gameState.depthTransition) return false;
      const entry = FindNearestEntrance();
      if (entry === null) return false;
      TransitionDepth(entry);
      return true;
    },
    GetMetrics: () => ({
      fps: Math.round(gameState.fpsSamples.reduce((sum, value) => sum + value, 0) / Math.max(1, gameState.fpsSamples.length)),
      calls: gameState.renderer.info.render.calls,
      triangles: gameState.renderer.info.render.triangles,
      geometries: gameState.renderer.info.memory.geometries,
      textures: gameState.renderer.info.memory.textures,
      pixelRatio: gameState.renderer.getPixelRatio(),
      maxTextureSize: gameState.renderer.capabilities.maxTextureSize,
      walkAtlas: gameState.world.walkTexturePath
    })
  });
}

async function Boot() {
  CacheUi();
  gameState.audio = new AudioEngine();
  BindEvents();
  ui.loadingStatus.textContent = "正在铺开地上与地下的路……";
  try {
    await CreateWorld();
  } catch (error) {
    console.error(error);
    ui.loadingStatus.textContent = "画面未能载入。请确认浏览器支持 WebGL，并刷新重试。";
    return;
  }
  LoadProgress();
  BuildDebugApi();
  requestAnimationFrame(RenderLoop);
  await Delay(500);
  ui.loadingScreen.classList.remove("isVisible");
  await Delay(650);
  ui.loadingScreen.hidden = true;
  ui.titleScreen.classList.add("isVisible");
}

Boot();
