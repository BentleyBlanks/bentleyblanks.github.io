"use strict";

const storageKey = "taierzhuang1938_audio_review_v2";
const incompetechLicenseUrl = "https://incompetech.com/music/royalty-free/licenses/";
const sonnissLicenseUrl = "https://sonniss.com/gdc-bundle-license/";

function IncompetechUrl(title) {
  return `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(title)}.mp3`;
}

const groupInfo = {
  prewar: { kind: "bgm", title: "战前阴影 · 菜单与集结", desc: "不急着煽情，让危险先压在画面上。", order: 10 },
  siege: { kind: "bgm", title: "围城压迫 · 阵地持续承压", desc: "低沉、重复、难以喘息，服务炮火与阵地崩解。", order: 20 },
  night: { kind: "bgm", title: "夜战紧张 · 第二批", desc: "旧的三条已撤；这一批改用环境压力、风声与低速暗涌，给脚步和远处枪炮留空间。", order: 30 },
  charge: { kind: "bgm", title: "决死冲锋 · 白热交火", desc: "推进感强，但避免胜利进行曲式的昂扬。", order: 40 },
  aftermath: { kind: "bgm", title: "战后余烬 · 失守与回望", desc: "不是凯旋，是付出代价后的空旷与回声。", order: 50 },
  nraNear: { kind: "sfx", title: "中方步枪近射", desc: "中正式 / 汉阳造方向：7.9 mm 全威力步枪的近场爆裂与枪口尾音。", order: 60 },
  nraFar: { kind: "sfx", title: "中方步枪远射", desc: "真实野外距离尾音，不用近射低通伪造。", order: 70 },
  ijaNear: { kind: "sfx", title: "日军步枪近射", desc: "三八式方向：比中方 7.9 mm 更尖、更短，最终会做 6.5 mm 音色适配。", order: 80 },
  ijaFar: { kind: "sfx", title: "日军步枪远射", desc: "优先比较远场破空感与环境尾巴，选中后再做口径适配。", order: 90 },
  type11: { kind: "sfx", title: "十一年式轻机枪", desc: "寻找更轻、更脆的 6.5 mm 自动火器底色；射速由游戏按史实排。", order: 100 },
  type92: { kind: "sfx", title: "九二式重机枪", desc: "寻找枪架金属余振和沉重远场尾音；保留约 200 rpm 的啄木鸟节奏。", order: 110 },
};

const audioItems = [
  {
    id: "bgmDarkWalk", code: "B01", kind: "bgm", group: "prewar", title: "Dark Walk", author: "Kevin MacLeod",
    file: "./Audio/Bgm/AudioBgm_CandidateDarkWalk.mp3",
    desc: "缓慢、冷峻、压着走；先试主菜单、战前简报和空城镜头。",
    tags: ["阴影", "慢速", "少煽情"], source: "Incompetech 独立配乐库",
    sourceUrl: IncompetechUrl("Dark Walk"), license: "CC BY 4.0（以来源页为准）", licenseUrl: incompetechLicenseUrl,
  },
  {
    id: "bgmGatheringDarkness", code: "B02", kind: "bgm", group: "prewar", title: "Gathering Darkness", author: "Kevin MacLeod",
    file: "./Audio/Bgm/AudioBgm_CandidateGatheringDarkness.mp3",
    desc: "危险逐层靠近；适合敌军集结、关卡加载与炮击前的等待。",
    tags: ["逼近", "累积", "战前"], source: "Incompetech 独立配乐库",
    sourceUrl: IncompetechUrl("Gathering Darkness"), license: "CC BY 4.0（以来源页为准）", licenseUrl: incompetechLicenseUrl,
  },
  {
    id: "bgmTheDescent", code: "B03", kind: "bgm", group: "prewar", title: "The Descent", author: "Kevin MacLeod",
    file: "./Audio/Bgm/AudioBgm_CandidateTheDescent.mp3",
    desc: "下坠式压迫，不给明确胜利预期；可试大军压境和防线收缩。",
    tags: ["下坠", "压迫", "大军压境"], source: "Incompetech 独立配乐库",
    sourceUrl: IncompetechUrl("The Descent"), license: "CC BY 4.0（以来源页为准）", licenseUrl: incompetechLicenseUrl,
  },
  {
    id: "bgmDarkestChild", code: "B04", kind: "bgm", group: "siege", title: "Darkest Child", author: "Kevin MacLeod",
    file: "./Audio/Bgm/AudioBgm_CandidateDarkestChild.mp3",
    desc: "低沉威胁持续存在；适合城墙炮击、工事被逐步摧毁。",
    tags: ["低沉", "持续威胁", "围城"], source: "Incompetech 独立配乐库",
    sourceUrl: IncompetechUrl("Darkest Child"), license: "CC BY 4.0（以来源页为准）", licenseUrl: incompetechLicenseUrl,
  },
  {
    id: "bgmGraveBlow", code: "B05", kind: "bgm", group: "siege", title: "Grave Blow", author: "Kevin MacLeod",
    file: "./Audio/Bgm/AudioBgm_CandidateGraveBlow.mp3",
    desc: "重击感比旋律更突出；适合炮弹落点、城门危急和伤亡上升。",
    tags: ["重击", "窒息", "城门"], source: "Incompetech 独立配乐库",
    sourceUrl: IncompetechUrl("Grave Blow"), license: "CC BY 4.0（以来源页为准）", licenseUrl: incompetechLicenseUrl,
  },
  {
    id: "bgmHeartOfTheBeast", code: "B06", kind: "bgm", group: "siege", title: "Heart of the Beast", author: "Kevin MacLeod",
    file: "./Audio/Bgm/AudioBgm_CandidateHeartOfTheBeast.mp3",
    desc: "持续高压、体量更大；先试攻城最猛烈阶段，避免铺满整关。",
    tags: ["高压", "厚重", "攻城"], source: "Incompetech 独立配乐库",
    sourceUrl: IncompetechUrl("Heart of the Beast"), license: "CC BY 4.0（以来源页为准）", licenseUrl: incompetechLicenseUrl,
  },
  {
    id: "bgmNightDarkAmbient", code: "N01", kind: "bgm", group: "night", title: "Dark Ambient", author: "Alexandr Zhelanov",
    file: "./Audio/Bgm/AudioBgm_CandidateNightDarkAmbient.mp3",
    desc: "低速、持续、没有英雄感；先试摸黑挖阵地和敌军尚未现身的等待。",
    tags: ["低速压力", "等待", "无英雄感"], source: "OpenGameArt",
    sourceUrl: "https://opengameart.org/content/dark-ambient-0", license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
  },
  {
    id: "bgmNightScaryAmbientWind", code: "N02", kind: "bgm", group: "night", title: "Scary Ambient Wind", author: "Alexandr Zhelanov",
    file: "./Audio/Bgm/AudioBgm_CandidateNightScaryAmbientWind.mp3",
    desc: "风压与空旷感更强；适合北沙河野外、低能见度和远处炮火间隙。",
    tags: ["夜风", "空旷", "野外"], source: "OpenGameArt",
    sourceUrl: "https://opengameart.org/content/scary-ambient-wind", license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
  },
  {
    id: "bgmNightDarkSneakyAmbient", code: "N03", kind: "bgm", group: "night", title: "Dark Sneaky Ambient", author: "MrAlex99",
    file: "./Audio/Bgm/AudioBgm_CandidateNightDarkSneakyAmbient.mp3",
    desc: "更接近潜行节奏，但不走快拍；适合穿铁路、贴街角和避开巡逻。",
    tags: ["潜行", "街角", "克制节奏"], source: "OpenGameArt",
    sourceUrl: "https://opengameart.org/content/dark-sneaky-ambient", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  },
  {
    id: "bgmNightAmbientHorrorTrack01", code: "N04", kind: "bgm", group: "night", title: "Ambient Horror Track 01", author: "Cleyton Kauffman",
    file: "./Audio/Bgm/AudioBgm_CandidateNightAmbientHorrorTrack01.mp3",
    desc: "短而压迫，像搜索圈逐步收紧；试敌军逼近、暴露风险上升的片段。",
    tags: ["逼近", "搜索", "短段"], source: "OpenGameArt",
    sourceUrl: "https://opengameart.org/content/ambient-horror-track-01", license: "CC0 1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  {
    id: "bgmNightDarkAmbientDrone", code: "N05", kind: "bgm", group: "night", title: "Dark Ambient Drone", author: "Tsorthan Grove",
    file: "./Audio/Bgm/AudioBgm_CandidateNightDarkAmbientDrone.mp3",
    desc: "低频底床更厚，变化慢；适合阵地死守前的长时间等待，不抢枪炮声。",
    tags: ["低频底床", "慢变化", "阵地"], source: "OpenGameArt",
    sourceUrl: "https://opengameart.org/content/dark-ambient-drone", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  },
  {
    id: "bgmNightDarkAmbientDrone02", code: "N06", kind: "bgm", group: "night", title: "Dark Ambient Drone #2", author: "Tsorthan Grove",
    file: "./Audio/Bgm/AudioBgm_CandidateNightDarkAmbientDrone02.mp3",
    desc: "比 N05 更冷、更疏离；适合撤退路线上看不见敌人的压迫感。",
    tags: ["冷", "疏离", "撤退"], source: "OpenGameArt",
    sourceUrl: "https://opengameart.org/content/dark-ambient-drone-2", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  },
  {
    id: "bgmNightDarkDrone", code: "N07", kind: "bgm", group: "night", title: "Dark Drone", author: "jdagenet",
    file: "./Audio/Bgm/AudioBgm_CandidateNightDarkDrone.mp3",
    desc: "最接近轰炸后废墟的残响；试进城前后、空街与断壁场景。",
    tags: ["废墟", "残响", "空街"], source: "OpenGameArt",
    sourceUrl: "https://opengameart.org/content/dark-drone", license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
  },
  {
    id: "bgmBlackVortex", code: "B10", kind: "bgm", group: "charge", title: "Black Vortex", author: "Kevin MacLeod",
    file: "./Audio/Bgm/AudioBgm_CandidateBlackVortex.mp3",
    desc: "不安的高速推进；适合近距离遭遇和防线即将失控。",
    tags: ["高速", "不安", "遭遇战"], source: "Incompetech 独立配乐库",
    sourceUrl: IncompetechUrl("Black Vortex"), license: "CC BY 4.0（以来源页为准）", licenseUrl: incompetechLicenseUrl,
  },
  {
    id: "bgmDeathAndAxes", code: "B11", kind: "bgm", group: "charge", title: "Death and Axes", author: "Kevin MacLeod",
    file: "./Audio/Bgm/AudioBgm_CandidateDeathAndAxes.mp3",
    desc: "粗粝、直接、带重量；先试白刃接敌和绝境反击。",
    tags: ["粗粝", "白刃", "绝境"], source: "Incompetech 独立配乐库",
    sourceUrl: IncompetechUrl("Death and Axes"), license: "CC BY 4.0（以来源页为准）", licenseUrl: incompetechLicenseUrl,
  },
  {
    id: "bgmVolatileReaction", code: "B12", kind: "bgm", group: "charge", title: "Volatile Reaction", author: "Kevin MacLeod",
    file: "./Audio/Bgm/AudioBgm_CandidateVolatileReaction.mp3",
    desc: "爆发性最强的一条；适合短时高潮，不建议长时间循环。",
    tags: ["爆发", "短时高潮", "近战"], source: "Incompetech 独立配乐库",
    sourceUrl: IncompetechUrl("Volatile Reaction"), license: "CC BY 4.0（以来源页为准）", licenseUrl: incompetechLicenseUrl,
  },
  {
    id: "bgmBentAndBroken", code: "B13", kind: "bgm", group: "aftermath", title: "Bent and Broken", author: "Kevin MacLeod",
    file: "./Audio/Bgm/AudioBgm_CandidateBentAndBroken.mp3",
    desc: "疲惫、破损而非凯旋；适合撤退、失守与伤亡结算。",
    tags: ["疲惫", "失守", "伤亡"], source: "Incompetech 独立配乐库",
    sourceUrl: IncompetechUrl("Bent and Broken"), license: "CC BY 4.0（以来源页为准）", licenseUrl: incompetechLicenseUrl,
  },
  {
    id: "bgmEchoesOfTimeV2", code: "B14", kind: "bgm", group: "aftermath", title: "Echoes of Time v2", author: "Kevin MacLeod",
    file: "./Audio/Bgm/AudioBgm_CandidateEchoesOfTimeV2.mp3",
    desc: "回望式尾声；适合历史字幕、幸存者镜头和章节结束。",
    tags: ["回望", "尾声", "历史字幕"], source: "Incompetech 独立配乐库",
    sourceUrl: IncompetechUrl("Echoes of Time v2"), license: "CC BY 4.0（以来源页为准）", licenseUrl: incompetechLicenseUrl,
  },

  {
    id: "sfxNraNearMauserMedium", code: "G01", kind: "sfx", group: "nraNear", title: "毛瑟 8 mm · 中距离实录", author: "Watson Wu",
    file: "./Audio/Sfx/AudioSfxCandidate_NraNearMauserMedium.mp3",
    desc: "与中正式同属 7.92 mm 毛瑟体系，爆裂更完整；候选用于近射主体。",
    tags: ["Mauser 8mm", "实枪", "主体候选"], source: "Sonniss Game Audio Monthly #3",
    sourceUrl: "https://archive.org/details/game-audio-monthly", license: "Sonniss 免版税许可", licenseUrl: sonnissLicenseUrl,
  },
  {
    id: "sfxNraNearMosinClose", code: "G02", kind: "sfx", group: "nraNear", title: "莫辛纳甘 · 1 m 近射", author: "FLYSOUND",
    file: "./Audio/Sfx/AudioSfxCandidate_NraNearMosinClose.mp3",
    desc: "全威力栓动步枪的更重尾音；用于比较汉阳造方向是否需要更粗粝。",
    tags: ["Mosin", "1m", "重尾音"], source: "Sonniss GDC 2020",
    sourceUrl: "https://archive.org/details/sonniss-gdc-2020-game-audio-bundle-normalized", license: "Sonniss GDC 免版税许可", licenseUrl: sonnissLicenseUrl,
  },
  {
    id: "sfxNraFarMosinShort", code: "G03", kind: "sfx", group: "nraFar", title: "短管莫辛纳甘 · 远射", author: "Watson Wu",
    file: "./Audio/Sfx/AudioSfxCandidate_NraFarMosinShort.mp3",
    desc: "短促远场脆响；适合城外或街巷另一端的单发。",
    tags: ["远场", "短促", "单发"], source: "Sonniss Game Audio Monthly #3",
    sourceUrl: "https://archive.org/details/game-audio-monthly", license: "Sonniss 免版税许可", licenseUrl: sonnissLicenseUrl,
  },
  {
    id: "sfxNraFarMosinMixed", code: "G04", kind: "sfx", group: "nraFar", title: "莫辛纳甘 · 长距离混录", author: "FLYSOUND",
    file: "./Audio/Sfx/AudioSfxCandidate_NraFarMosinMixed.mp3",
    desc: "环境尾巴更长；适合旷地与城墙外，不靠滤波器伪造距离。",
    tags: ["长距离", "环境尾音", "旷地"], source: "Sonniss GDC 2020",
    sourceUrl: "https://archive.org/details/sonniss-gdc-2020-game-audio-bundle-normalized", license: "Sonniss GDC 免版税许可", licenseUrl: sonnissLicenseUrl,
  },
  {
    id: "sfxIjaNearGarandClose", code: "G05", kind: "sfx", group: "ijaNear", title: "M1 Garand · 近射原始音", author: "Watson Wu",
    file: "./Audio/Sfx/AudioSfxCandidate_IjaNearGarandClose.mp3",
    desc: "先比较更尖、更干的近射瞬态；入选后会按三八式 6.5 mm 再缩短与升调。",
    tags: ["近射", "尖锐", "待口径适配"], source: "Sonniss Game Audio Monthly #3",
    sourceUrl: "https://archive.org/details/game-audio-monthly", license: "Sonniss 免版税许可", licenseUrl: sonnissLicenseUrl,
  },
  {
    id: "sfxIjaNearM38", code: "G06", kind: "sfx", group: "ijaNear", title: "M38 栓动步枪 · 近射", author: "Pole Position Production",
    file: "./Audio/Sfx/AudioSfxCandidate_IjaNearM38.mp3",
    desc: "短管栓动步枪录音，瞬态更硬；用于替换当前 M1903A3 方案。",
    tags: ["栓动", "硬瞬态", "新来源"], source: "Sonniss GDC 2020",
    sourceUrl: "https://archive.org/details/sonniss-gdc-2020-game-audio-bundle-normalized", license: "Sonniss GDC 免版税许可", licenseUrl: sonnissLicenseUrl,
  },
  {
    id: "sfxIjaFarBar300", code: "G07", kind: "sfx", group: "ijaFar", title: "BAR · 300 m 远场双发", author: "Pole Position Production",
    file: "./Audio/Sfx/AudioSfxCandidate_IjaFarBar300.mp3",
    desc: "先听 300 m 环境给出的尾音；最终只切单发并按三八式口径适配。",
    tags: ["300m", "野外尾音", "待单发切片"], source: "Sonniss GDC 2016",
    sourceUrl: "https://archive.org/details/sonniss-gdc-2016-game-audio-bundle-normalized", license: "Sonniss GDC 免版税许可", licenseUrl: sonnissLicenseUrl,
  },
  {
    id: "sfxIjaFarMosin", code: "G08", kind: "sfx", group: "ijaFar", title: "莫辛纳甘长距离 · 三八式适配底", author: "FLYSOUND",
    file: "./Audio/Sfx/AudioSfxCandidate_IjaFarMosinPitchedSource.mp3",
    desc: "另一条长距离底色；入选后会单独升调并缩短，不与中方远射共用成品。",
    tags: ["长距离", "适配底", "区分敌我"], source: "Sonniss GDC 2020",
    sourceUrl: "https://archive.org/details/sonniss-gdc-2020-game-audio-bundle-normalized", license: "Sonniss GDC 免版税许可", licenseUrl: sonnissLicenseUrl,
  },
  {
    id: "sfxType11BarClose", code: "G09", kind: "sfx", group: "type11", title: "BAR · 近场双发实录", author: "Pole Position Production",
    file: "./Audio/Sfx/AudioSfxCandidate_Type11BarClose.mp3",
    desc: "弹匣供弹自动步枪的实录底；最终切单发、升调并交给引擎排十一年式射速。",
    tags: ["弹匣供弹", "近场", "待切单发"], source: "Sonniss GDC 2016",
    sourceUrl: "https://archive.org/details/sonniss-gdc-2016-game-audio-bundle-normalized", license: "Sonniss GDC 免版税许可", licenseUrl: sonnissLicenseUrl,
  },
  {
    id: "sfxType11GpmgDistant", code: "G10", kind: "sfx", group: "type11", title: "L7A2 · 50 m 后方单发", author: "Pole Position Production",
    file: "./Audio/Sfx/AudioSfxCandidate_Type11GpmgDistant.mp3",
    desc: "真正单发、尾巴干净；比较是否比 BAR 更适合做轻机枪的基础冲头。",
    tags: ["50m", "真正单发", "干净尾巴"], source: "Sonniss GDC 2016",
    sourceUrl: "https://archive.org/details/sonniss-gdc-2016-game-audio-bundle-normalized", license: "Sonniss GDC 免版税许可", licenseUrl: sonnissLicenseUrl,
  },
  {
    id: "sfxType92M1919Distant", code: "G11", kind: "sfx", group: "type92", title: "M1919A4 · 200 m 侧后", author: "Pole Position Production",
    file: "./Audio/Sfx/AudioSfxCandidate_Type92M1919Distant.mp3",
    desc: "与当前 5 m 方案不同的远场实录，听重机枪在战场层里的辨识度。",
    tags: ["200m", "侧后", "重机枪"], source: "Sonniss GDC 2016",
    sourceUrl: "https://archive.org/details/sonniss-gdc-2016-game-audio-bundle-normalized", license: "Sonniss GDC 免版税许可", licenseUrl: sonnissLicenseUrl,
  },
  {
    id: "sfxType92M1919TurretDistant", code: "G12", kind: "sfx", group: "type92", title: "M1919A4 枪架 · 300 m 正面", author: "Pole Position Production",
    file: "./Audio/Sfx/AudioSfxCandidate_Type92M1919TurretDistant.mp3",
    desc: "枪架版本的金属余振与 300 m 空间尾音；用于九二式远处支援火力。",
    tags: ["枪架", "300m", "金属余振"], source: "Sonniss GDC 2016",
    sourceUrl: "https://archive.org/details/sonniss-gdc-2016-game-audio-bundle-normalized", license: "Sonniss GDC 免版税许可", licenseUrl: sonnissLicenseUrl,
  },
];

const dom = {
  audio: document.querySelector("#audio"),
  catalog: document.querySelector("#catalog"),
  filterBar: document.querySelector("#filterBar"),
  viewButtons: document.querySelector("#viewButtons"),
  bgmCount: document.querySelector("#bgmCount"),
  sfxCount: document.querySelector("#sfxCount"),
  favoriteCount: document.querySelector("#favoriteCount"),
  mainPlay: document.querySelector("#mainPlay"),
  seek: document.querySelector("#seek"),
  volume: document.querySelector("#volume"),
  currentTime: document.querySelector("#currentTime"),
  duration: document.querySelector("#duration"),
  nowCode: document.querySelector("#nowCode"),
  nowTitle: document.querySelector("#nowTitle"),
  exportButton: document.querySelector("#exportButton"),
  copyButton: document.querySelector("#copyButton"),
  clearButton: document.querySelector("#clearButton"),
  toast: document.querySelector("#toast"),
};

let view = "all";
let groupFilter = "all";
let currentId = null;
let toastTimer = null;
let reviewState = LoadState();

function LoadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return {
      favorites: Array.isArray(saved.favorites) ? saved.favorites : [],
      notes: saved.notes && typeof saved.notes === "object" ? saved.notes : {},
      volume: Number.isFinite(saved.volume) ? saved.volume : 0.78,
    };
  } catch {
    return { favorites: [], notes: {}, volume: 0.78 };
  }
}

function SaveState() {
  localStorage.setItem(storageKey, JSON.stringify(reviewState));
}

function IsFavorite(id) {
  return reviewState.favorites.includes(id);
}

function VisibleItems() {
  return audioItems.filter((item) => {
    if (view === "bgm" && item.kind !== "bgm") return false;
    if (view === "sfx" && item.kind !== "sfx") return false;
    if (view === "favorites" && !IsFavorite(item.id)) return false;
    return groupFilter === "all" || item.group === groupFilter;
  });
}

function RenderFilters() {
  const groups = Object.entries(groupInfo)
    .filter(([groupId, info]) => {
      if (view === "bgm") return info.kind === "bgm";
      if (view === "sfx") return info.kind === "sfx";
      if (view === "favorites") return audioItems.some((item) => item.group === groupId && IsFavorite(item.id));
      return true;
    })
    .sort((a, b) => a[1].order - b[1].order);

  if (groupFilter !== "all" && !groups.some(([groupId]) => groupId === groupFilter)) groupFilter = "all";
  dom.filterBar.innerHTML = "";
  const allButton = document.createElement("button");
  allButton.className = `chip${groupFilter === "all" ? " active" : ""}`;
  allButton.dataset.group = "all";
  allButton.textContent = "全部场景";
  dom.filterBar.append(allButton);
  groups.forEach(([groupId, info]) => {
    const button = document.createElement("button");
    button.className = `chip${groupFilter === groupId ? " active" : ""}`;
    button.dataset.group = groupId;
    button.textContent = info.title.split(" · ")[0];
    dom.filterBar.append(button);
  });
}

function RenderCard(item) {
  const card = document.createElement("article");
  card.className = `card${IsFavorite(item.id) ? " favorite" : ""}${currentId === item.id && !dom.audio.paused ? " playing" : ""}`;
  card.dataset.id = item.id;
  card.innerHTML = `
    <button class="playBtn" data-action="play" aria-label="试听 ${item.title}">${currentId === item.id && !dom.audio.paused ? "Ⅱ" : "▶"}</button>
    <div>
      <div class="trackCode">${item.code} · ${item.kind === "bgm" ? "BGM 评审段" : "实录源试听"}</div>
      <h3 class="trackTitle">${item.title} <small>${item.author}</small></h3>
      <p class="trackDesc">${item.desc}</p>
      <div class="tags">${item.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}</div>
      <div class="sourceRow">来源：<a href="${item.sourceUrl}" target="_blank" rel="noreferrer">${item.source}</a> · <a href="${item.licenseUrl}" target="_blank" rel="noreferrer">${item.license}</a></div>
      <textarea class="noteInput" data-action="note" placeholder="写试听备注，例如：喜欢前 30 秒、尾音太长……" aria-label="${item.title} 试听备注"></textarea>
    </div>
    <button class="starBtn" data-action="favorite" aria-label="收藏 ${item.title}" aria-pressed="${IsFavorite(item.id)}">★</button>`;
  card.querySelector(".noteInput").value = reviewState.notes[item.id] || "";
  return card;
}

function RenderCatalog() {
  RenderFilters();
  const items = VisibleItems();
  dom.catalog.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = view === "favorites" ? "还没有收藏。先回到全部候选试听。" : "当前筛选没有候选。";
    dom.catalog.append(empty);
  } else {
    const grouped = new Map();
    items.forEach((item) => {
      if (!grouped.has(item.group)) grouped.set(item.group, []);
      grouped.get(item.group).push(item);
    });
    [...grouped.entries()]
      .sort((a, b) => groupInfo[a[0]].order - groupInfo[b[0]].order)
      .forEach(([groupId, groupItems]) => {
        const info = groupInfo[groupId];
        const section = document.createElement("section");
        section.className = "group";
        section.innerHTML = `<div class="groupHead"><div><h2 class="groupTitle">${info.title}</h2><p class="groupDesc">${info.desc}</p></div><span class="groupCount">${groupItems.length} CANDIDATES</span></div>`;
        const grid = document.createElement("div");
        grid.className = "grid";
        groupItems.forEach((item) => grid.append(RenderCard(item)));
        section.append(grid);
        dom.catalog.append(section);
      });
  }
  dom.bgmCount.textContent = String(audioItems.filter((item) => item.kind === "bgm").length);
  dom.sfxCount.textContent = String(audioItems.filter((item) => item.kind === "sfx").length);
  dom.favoriteCount.textContent = String(reviewState.favorites.length);
}

function FindItem(id) {
  return audioItems.find((item) => item.id === id) || null;
}

async function PlayItem(id) {
  const item = FindItem(id);
  if (!item) return;
  if (currentId === id) {
    if (dom.audio.paused) await dom.audio.play();
    else dom.audio.pause();
    return;
  }
  currentId = id;
  dom.audio.src = item.file;
  dom.nowCode.textContent = `${item.code} · ${groupInfo[item.group].title}`;
  dom.nowTitle.textContent = `${item.title} — ${item.author}`;
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: item.title, artist: item.author, album: "台儿庄 1938 音频候选" });
  }
  try {
    await dom.audio.play();
  } catch {
    ShowToast("浏览器未允许播放，请再点一次播放键");
  }
  RenderCatalog();
}

function ToggleFavorite(id) {
  if (IsFavorite(id)) reviewState.favorites = reviewState.favorites.filter((favoriteId) => favoriteId !== id);
  else reviewState.favorites.push(id);
  SaveState();
  RenderCatalog();
  ShowToast(IsFavorite(id) ? "已加入交付收藏" : "已取消收藏");
}

function FormatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function SyncPlayer() {
  const duration = Number.isFinite(dom.audio.duration) ? dom.audio.duration : 0;
  dom.seek.value = duration ? String(Math.round((dom.audio.currentTime / duration) * 1000)) : "0";
  dom.currentTime.textContent = FormatTime(dom.audio.currentTime);
  dom.duration.textContent = FormatTime(duration);
  dom.mainPlay.textContent = dom.audio.paused ? "▶" : "Ⅱ";
  document.querySelectorAll(".card").forEach((card) => {
    const playing = card.dataset.id === currentId && !dom.audio.paused;
    card.classList.toggle("playing", playing);
    const button = card.querySelector(".playBtn");
    if (button) button.textContent = playing ? "Ⅱ" : "▶";
  });
}

function FavoritePayload() {
  return reviewState.favorites.map((id) => {
    const item = FindItem(id);
    if (!item) return null;
    return {
      code: item.code,
      id: item.id,
      type: item.kind,
      category: groupInfo[item.group].title,
      title: item.title,
      author: item.author,
      reviewFile: item.file.replace(/^\.\//, ""),
      source: item.source,
      sourceUrl: item.sourceUrl,
      license: item.license,
      licenseUrl: item.licenseUrl,
      note: reviewState.notes[item.id] || "",
    };
  }).filter(Boolean);
}

function ExportFavorites() {
  const payload = {
    project: "Taierzhuang1938",
    purpose: "Audio candidate delivery selection",
    exportedAt: new Date().toISOString(),
    count: reviewState.favorites.length,
    selections: FavoritePayload(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Data_AudioSelections_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  ShowToast(`已导出 ${payload.count} 个收藏`);
}

async function CopyFavorites() {
  const payload = FavoritePayload();
  const lines = payload.length
    ? payload.map((item) => `${item.code}｜${item.category}｜${item.title}${item.note ? `｜备注：${item.note}` : ""}`)
    : ["尚未收藏任何候选"];
  await navigator.clipboard.writeText(lines.join("\n"));
  ShowToast("交付清单已复制");
}

function ShowToast(message) {
  window.clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  toastTimer = window.setTimeout(() => dom.toast.classList.remove("show"), 1700);
}

dom.viewButtons.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  view = button.dataset.view;
  groupFilter = "all";
  dom.viewButtons.querySelectorAll("[data-view]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  RenderCatalog();
});

dom.filterBar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-group]");
  if (!button) return;
  groupFilter = button.dataset.group;
  RenderCatalog();
});

dom.catalog.addEventListener("click", (event) => {
  const card = event.target.closest(".card");
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!card || !action) return;
  if (action === "play") PlayItem(card.dataset.id);
  if (action === "favorite") ToggleFavorite(card.dataset.id);
});

dom.catalog.addEventListener("input", (event) => {
  if (event.target.dataset.action !== "note") return;
  const card = event.target.closest(".card");
  if (!card) return;
  reviewState.notes[card.dataset.id] = event.target.value;
  SaveState();
});

dom.audio.addEventListener("timeupdate", SyncPlayer);
dom.audio.addEventListener("durationchange", SyncPlayer);
dom.audio.addEventListener("play", SyncPlayer);
dom.audio.addEventListener("pause", SyncPlayer);
dom.audio.addEventListener("ended", SyncPlayer);
dom.audio.addEventListener("error", () => ShowToast("音频载入失败，请确认从本目录打开页面"));
dom.mainPlay.addEventListener("click", () => {
  if (!currentId) PlayItem(VisibleItems()[0]?.id);
  else if (dom.audio.paused) dom.audio.play();
  else dom.audio.pause();
});
dom.seek.addEventListener("input", () => {
  if (Number.isFinite(dom.audio.duration)) dom.audio.currentTime = (Number(dom.seek.value) / 1000) * dom.audio.duration;
});
dom.volume.addEventListener("input", () => {
  dom.audio.volume = Number(dom.volume.value);
  reviewState.volume = dom.audio.volume;
  SaveState();
});
dom.exportButton.addEventListener("click", ExportFavorites);
dom.copyButton.addEventListener("click", () => CopyFavorites().catch(() => ShowToast("复制失败，请使用导出 JSON")));
dom.clearButton.addEventListener("click", () => {
  if (!reviewState.favorites.length) return;
  if (!window.confirm("清空全部收藏？试听备注会保留。")) return;
  reviewState.favorites = [];
  SaveState();
  RenderCatalog();
  ShowToast("收藏已清空");
});
document.addEventListener("keydown", (event) => {
  if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || "")) return;
  if (event.code === "Space") {
    event.preventDefault();
    dom.mainPlay.click();
  }
  if (event.code === "ArrowLeft") dom.audio.currentTime = Math.max(0, dom.audio.currentTime - 5);
  if (event.code === "ArrowRight") dom.audio.currentTime = Math.min(dom.audio.duration || 0, dom.audio.currentTime + 5);
});

dom.audio.volume = reviewState.volume;
dom.volume.value = String(reviewState.volume);
RenderCatalog();
SyncPlayer();
