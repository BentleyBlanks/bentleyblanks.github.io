"use strict";

const STORAGE_KEY = "tunnellight1943_bgm_review_v1";

const TRACKS = [
  {
    id: "cicadas",
    title: "Cicadas",
    file: "./Audio/AudioBgm_Cicadas.mp3",
    sourcePage: "https://www.scottbuckley.com.au/library/cicadas/",
    duration: 393.22,
    cue: 35,
    palette: "钢琴 · 弦乐 · 独奏小提琴 · 蝉鸣",
    description: "乡野感最强的一首。适合先让梁家村像一个真实生活着的地方，再让灾难进入；也可以在第八章以清晨环境的方式轻轻回返。",
    risk: "独奏小提琴比较抒情，蝉鸣来自澳大利亚田野录音；若存在感太强，会让地域感跑偏。",
    chapters: ["一", "八"],
  },
  {
    id: "withTheseHands",
    title: "With These Hands",
    file: "./Audio/AudioBgm_WithTheseHands.mp3",
    sourcePage: "https://www.scottbuckley.com.au/library/with-these-hands/",
    duration: 305.70,
    cue: 42,
    palette: "钢琴 · 弦乐 · 氛围合成器",
    description: "“手艺”主题最贴题：父亲的刨子、柱子的墨斗、乡亲们一锹一锹挖出的地道，可以用同一条克制的人物动机连起来。",
    risk: "现代电影配乐感偏明显；不适合突袭和追逐，只适合人物、施工与回望。",
    chapters: ["一", "五", "八"],
  },
  {
    id: "unraveling",
    title: "Unraveling",
    file: "./Audio/AudioBgm_Unraveling.mp3",
    sourcePage: "https://www.scottbuckley.com.au/library/unraveling/",
    duration: 444.02,
    cue: 38,
    palette: "氛围弦乐 · 合成器",
    description: "悬置、难以置信、悲伤里留一点微光。适合母亲与妹妹被带走、烟水之后人数对不上、兄妹重逢却不能说出母亲去向。",
    risk: "情绪方向太准确，反而最容易替观众哭；建议只在关键短段进入，并把响度压低。",
    chapters: ["二", "四", "七"],
  },
  {
    id: "nightfall",
    title: "Nightfall — No Solo Strings",
    file: "./Audio/AudioBgm_NightfallNoSoloStrings.mp3",
    sourcePage: "https://www.scottbuckley.com.au/library/nightfall/",
    duration: 263.41,
    cue: 26,
    palette: "低频节奏 · 合成器 · 钢琴（无独奏弦乐版）",
    description: "有持续推进力，但没有旋律抢台词。适合狗叫、灯笼、封口、灌烟、岗哨增加等“危险正在合拢”的段落。",
    risk: "电子脉冲有现代惊悚片质感；如果听起来像谍战预告片，就应退回现有程序化 raid 层。",
    chapters: ["二", "五", "六"],
  },
  {
    id: "shadowsAndDust",
    title: "Shadows and Dust",
    file: "./Audio/AudioBgm_ShadowsAndDust.mp3",
    sourcePage: "https://www.scottbuckley.com.au/library/shadows-and-dust/",
    duration: 408.38,
    cue: 32,
    palette: "无人声氛围 · 木管气息 · 弦乐纹理",
    description: "不急着制造动作，而是让空间变得不可测。适合庄稼地里先观察、辨岗哨，以及行动前夜看门板图。",
    risk: "气质偏空灵；若木管听感太“远古遗迹”，会削弱华北敌后的具体生活质地。",
    chapters: ["三", "六"],
  },
  {
    id: "signalToNoise",
    title: "Signal to Noise — No Piano Melody",
    file: "./Audio/AudioBgm_SignalToNoiseNoMelody.mp3",
    sourcePage: "https://www.scottbuckley.com.au/library/signal-to-noise/",
    duration: 354.35,
    cue: 30,
    palette: "低弦 · 温暖合成器（无钢琴旋律版）",
    description: "十首里最不抢旁白的一首。适合侦察、地图研判、狭窄地道潜入；低弦提供压力，去掉钢琴后不会替玩家规定情绪。",
    risk: "合成器底色略带科幻感；如果在土洞里显得过于光滑，需要与滴水、土层闷响混得更脏。",
    chapters: ["三", "四", "六"],
  },
  {
    id: "theLongDark",
    title: "The Long Dark",
    file: "./Audio/AudioBgm_TheLongDark.mp3",
    sourcePage: "https://www.scottbuckley.com.au/library/the-long-dark/",
    duration: 439.79,
    cue: 28,
    palette: "氛围钢琴 · 弦乐 · 低温合成器",
    description: "漫长、缓慢、黑暗，但不是恐怖。适合第一次进入地道、据点地下的长距离掘进，以及灯芯快烧尽的疲惫感。",
    risk: "钢琴会把地道变得过于诗意；比较时要确认它有没有稀释烟、水、塌方的物理危险。",
    chapters: ["四", "七"],
  },
  {
    id: "undertow",
    title: "Undertow",
    file: "./Audio/AudioBgm_Undertow.mp3",
    sourcePage: "https://www.scottbuckley.com.au/library/undertow/",
    duration: 249.93,
    cue: 31,
    palette: "钢琴 · 弦乐 · 潮汐式合成器",
    description: "像被局势拖着走，适合烟、水不断逼近和年轻民兵被压住时的无可挽回；有流动，但没有胜利姿态。",
    risk: "新古典悲剧情绪较熟悉；若牺牲段听起来像电影规定动作，就宁可留白。",
    chapters: ["四", "五"],
  },
  {
    id: "theClimb",
    title: "The Climb",
    file: "./Audio/AudioBgm_TheClimb.mp3",
    sourcePage: "https://www.scottbuckley.com.au/library/the-climb/",
    duration: 347.09,
    cue: 48,
    palette: "渐进管弦 · 合成器 · 克制打击乐",
    description: "从低处慢慢建立力量，适合第七章返回旁洞、把最后一个乡亲推出洞口的长线高潮。它是本页故意保留的“更电影化”对照方案。",
    risk: "最容易英雄化、最可能过头。只有在不盖过群众和代价时才值得用，绝不默认主推。",
    chapters: ["七"],
  },
  {
    id: "aKindOfHope",
    title: "A Kind Of Hope",
    file: "./Audio/AudioBgm_AKindOfHope.mp3",
    sourcePage: "https://www.scottbuckley.com.au/library/a-kind-of-hope/",
    duration: 342.60,
    cue: 27,
    palette: "钢琴 · 弦乐 · 温暖合成器",
    description: "希望里仍然有迟疑，适合烧毁的院子、两道刻痕、妹妹点头和柱子再次走向地道；不是大团圆，只是继续活下去。",
    risk: "钢琴与弦乐仍有现代温情片气质；结尾必须保留残墙、旧木凳和离开的重量。",
    chapters: ["八"],
  },
];

const CHAPTERS = [
  {
    id: "c1",
    number: "01",
    num: "第一章",
    title: "门框上的刻痕",
    mood: "日常 → 伏笔 → 突袭",
    summary: "先建立父子、手艺和村庄日常，再让锣声切断它。音乐最重要的任务是让“失去之前的家”成立。",
    candidates: [
      { trackId: "withTheseHands", use: "主推 · 父子、木匠手艺与门框" },
      { trackId: "cicadas", use: "备选 · 更具体的乡村日常与天气" },
    ],
    hint: "建议：锣声响起时硬切音乐，突袭交给环境声和现有程序化 raid 层。",
  },
  {
    id: "c2",
    number: "02",
    num: "第二章",
    title: "第一次失去",
    mood: "夜袭 → 陷阱 → 失去",
    summary: "这一章不适合一首到底：前半是灯笼和脚步逼近，后半是娘没回来、妹妹被拽走后的空白。",
    candidates: [
      { trackId: "nightfall", use: "前半 · 危险逐步合拢" },
      { trackId: "unraveling", use: "后半 · 失去后的悬置与难以置信" },
    ],
    hint: "建议：分段使用；枪托和妹妹脱手的瞬间可先静音，再让悲伤层极慢进入。",
  },
  {
    id: "c3",
    number: "03",
    num: "第三章",
    title: "寻找妹妹",
    mood: "观察 → 接头 → 情报",
    summary: "第一次学会“先看”。音乐需要把注意力交给岗哨、脚步和人物位置，不能把侦察变成动作戏。",
    candidates: [
      { trackId: "shadowsAndDust", use: "主推 · 空间不确定与田野潜伏" },
      { trackId: "signalToNoise", use: "备选 · 更克制、更适合压在旁白下" },
    ],
    hint: "建议：先比木管氛围与无旋律低弦，优先选择对配音干扰最少的一首。",
  },
  {
    id: "c4",
    number: "04",
    num: "第四章",
    title: "地道里的第一次光",
    mood: "学习 → 烟水 → 代价",
    summary: "全剧第一次真正进入地道。压迫来自土、烟、水和数不对的人，不需要传统恐怖片的尖锐惊吓。",
    candidates: [
      { trackId: "theLongDark", use: "主推 · 进入地道与漫长黑暗" },
      { trackId: "signalToNoise", use: "备选 · 烟水玩法下更不抢声音" },
      { trackId: "unraveling", use: "结尾短段 · 人数对不上" },
    ],
    hint: "建议：玩法段首先比较 The Long Dark 与无旋律版；人数清点后才考虑悲伤层。",
  },
  {
    id: "c5",
    number: "05",
    num: "第五章",
    title: "反击地道",
    mood: "施工 → 验证 → 牺牲",
    summary: "“反击”不是歼敌，而是翻口、新暗口、预警铃让乡亲活下来。施工感与末尾牺牲应是两种音乐功能。",
    candidates: [
      { trackId: "withTheseHands", use: "施工 · 手艺转化为保护人的技术" },
      { trackId: "nightfall", use: "灌烟 · 有压力但不抢旋律" },
      { trackId: "undertow", use: "末尾 · 被局势拖住的牺牲" },
    ],
    hint: "建议：三段切换；不要用凯旋式主题覆盖“一个人也没找到”后的代价。",
  },
  {
    id: "c6",
    number: "06",
    num: "第六章",
    title: "敌人的陷阱",
    mood: "侦察 → 研判 → 决意",
    summary: "柱子从寻找家人转向承担行动。张力应来自信息变清楚，而不是鼓点越来越密。",
    candidates: [
      { trackId: "shadowsAndDust", use: "侦察 · 岗哨与据点外围" },
      { trackId: "signalToNoise", use: "研判 · 门板图和行动说明" },
      { trackId: "nightfall", use: "备选 · 只用于岗哨加密的危险段" },
    ],
    hint: "建议：地图与对白优先无旋律版；“我去”之后不需要英雄主题，留一拍安静更有力。",
  },
  {
    id: "c7",
    number: "07",
    num: "第七章",
    title: "地道里的光",
    mood: "掘进 → 重逢 → 返回救人 → 天亮",
    summary: "一章包含全剧最暗、最痛和最亮的三个节点，明确需要分段。营救高潮不能抹掉妹妹问“娘呢？”的停顿。",
    candidates: [
      { trackId: "theLongDark", use: "掘进 · 最暗的据点地道" },
      { trackId: "unraveling", use: "重逢短段 · 哥，娘呢？" },
      { trackId: "theClimb", use: "冒险对照 · 返回旁洞救最后的人" },
    ],
    hint: "建议：The Climb 只作为强烈对照；若它把群众营救听成个人英雄主义，就淘汰。",
  },
  {
    id: "c8",
    number: "08",
    num: "第八章",
    title: "回家的路",
    mood: "残墙 → 刻痕 → 继续出发",
    summary: "结尾不是胜利庆典。家被烧了，人还要继续做事；音乐应给出微光，也保留没能回来的人。",
    candidates: [
      { trackId: "aKindOfHope", use: "主推 · 有迟疑的希望，不是大团圆" },
      { trackId: "withTheseHands", use: "回环 · 把第一章的手艺主题带回来" },
      { trackId: "cicadas", use: "备选 · 黎明与村庄重新有了呼吸" },
    ],
    hint: "建议：优先比较新主题与第一章主题回环；最后两道刻痕出现时保持克制。",
  },
];

const trackById = new Map(TRACKS.map((track) => [track.id, track]));
const chapterById = new Map(CHAPTERS.map((chapter) => [chapter.id, chapter]));

const chapterGrid = document.getElementById("chapterGrid");
const trackGrid = document.getElementById("trackGrid");
const audioPlayer = document.getElementById("audioPlayer");
const playerDock = document.getElementById("playerDock");
const playerTitle = document.getElementById("playerTitle");
const playerContext = document.getElementById("playerContext");
const playerToggle = document.getElementById("playerToggle");
const skipBack = document.getElementById("skipBack");
const skipForward = document.getElementById("skipForward");
const playerSeek = document.getElementById("playerSeek");
const currentTime = document.getElementById("currentTime");
const durationTime = document.getElementById("durationTime");
const loopToggle = document.getElementById("loopToggle");
const volumeControl = document.getElementById("volumeControl");
const closePlayer = document.getElementById("closePlayer");
const decisionSummary = document.getElementById("decisionSummary");
const decisionStatus = document.getElementById("decisionStatus");
const copyDecision = document.getElementById("copyDecision");
const downloadDecision = document.getElementById("downloadDecision");
const clearDecision = document.getElementById("clearDecision");

let reviewState = LoadState();
let currentTrackId = null;
let currentPlaybackContext = "";

function LoadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed && typeof parsed === "object") {
      return {
        selections: parsed.selections && typeof parsed.selections === "object" ? parsed.selections : {},
        notes: parsed.notes && typeof parsed.notes === "object" ? parsed.notes : {},
      };
    }
  } catch (error) {
    // 本地存储损坏时从空白状态继续，试听本身不应被阻塞。
  }
  return { selections: {}, notes: {} };
}

function SaveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reviewState));
  } catch (error) {
    SetStatus("浏览器没有保存选择，但仍可继续试听并下载 JSON。", true);
  }
}

function FormatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
}

function RenderChapters() {
  chapterGrid.innerHTML = CHAPTERS.map((chapter) => {
    const candidates = chapter.candidates.map((candidate) => {
      const track = trackById.get(candidate.trackId);
      return `
        <div class="candidateRow" data-chapter-id="${chapter.id}" data-track-id="${track.id}">
          <button class="listenButton" type="button" data-action="listen" data-track-id="${track.id}" data-chapter-id="${chapter.id}" aria-label="试听 ${track.title}">▶</button>
          <div class="candidateText">
            <b>${track.title}</b>
            <span>${candidate.use} · 从 ${FormatTime(track.cue)} 听</span>
          </div>
          <button class="pickButton" type="button" data-action="pick" data-track-id="${track.id}" data-chapter-id="${chapter.id}">选为本章</button>
        </div>`;
    }).join("");

    return `
      <article class="chapterCard" data-number="${chapter.number}">
        <header class="chapterHeader">
          <div>
            <p class="chapterNumber">${chapter.num}</p>
            <h3>${chapter.title}</h3>
          </div>
          <span class="chapterMood">${chapter.mood}</span>
        </header>
        <p class="chapterSummary">${chapter.summary}</p>
        <div class="candidateList">${candidates}</div>
        <p class="chapterHint">${chapter.hint}</p>
        <textarea class="chapterNote" data-chapter-id="${chapter.id}" aria-label="${chapter.num}选曲备注" placeholder="写一句判断，例如：钢琴太煽情；用无旋律版……"></textarea>
      </article>`;
  }).join("");

  for (const note of chapterGrid.querySelectorAll(".chapterNote")) {
    note.value = reviewState.notes[note.dataset.chapterId] || "";
  }
  UpdateSelectionUi();
}

function RenderTracks() {
  trackGrid.innerHTML = TRACKS.map((track, index) => `
    <article class="trackCard" id="track-${track.id}">
      <div class="trackIndex">${String(index + 1).padStart(2, "0")}</div>
      <div class="trackBody">
        <div class="trackTop">
          <div>
            <h3>${track.title}</h3>
            <p class="trackMeta">${track.palette} · ${FormatTime(track.duration)} · 建议从 ${FormatTime(track.cue)} 听</p>
          </div>
          <button class="trackPlay" type="button" data-action="listen" data-track-id="${track.id}">▶ 试听</button>
        </div>
        <p class="trackDescription">${track.description}</p>
        <p class="trackRisk"><b>注意：</b>${track.risk}</p>
        <div class="trackFooter">
          ${track.chapters.map((chapter) => `<span class="chapterTag">第${chapter}章</span>`).join("")}
          <a href="${track.sourcePage}" target="_blank" rel="noreferrer">作者原曲页 ↗</a>
        </div>
      </div>
    </article>`).join("");
}

function UpdateSelectionUi() {
  for (const row of chapterGrid.querySelectorAll(".candidateRow")) {
    const isSelected = reviewState.selections[row.dataset.chapterId] === row.dataset.trackId;
    row.classList.toggle("selected", isSelected);
    const button = row.querySelector(".pickButton");
    button.textContent = isSelected ? "已选" : "选为本章";
    button.setAttribute("aria-pressed", String(isSelected));
  }

  const selectedChapters = CHAPTERS.filter((chapter) => trackById.has(reviewState.selections[chapter.id]));
  if (!selectedChapters.length) {
    decisionSummary.textContent = "还没有选择。可以先从第一、二、四、七、八章开始，它们决定全剧音乐语言。";
    return;
  }

  const names = selectedChapters.map((chapter) => `${chapter.num}《${chapter.title}》`).join("、");
  decisionSummary.textContent = `已选 ${selectedChapters.length} / ${CHAPTERS.length} 章：${names}。未选章节可先保留现有程序化配乐。`;
}

function SetStatus(message, isError = false) {
  decisionStatus.textContent = message;
  decisionStatus.style.color = isError ? "#d18a76" : "";
  window.clearTimeout(SetStatus.timer);
  SetStatus.timer = window.setTimeout(() => {
    decisionStatus.textContent = "";
    decisionStatus.style.color = "";
  }, 4500);
}

function PickTrack(chapterId, trackId) {
  if (!chapterById.has(chapterId) || !trackById.has(trackId)) return;
  if (reviewState.selections[chapterId] === trackId) delete reviewState.selections[chapterId];
  else reviewState.selections[chapterId] = trackId;
  SaveState();
  UpdateSelectionUi();
}

async function ListenToTrack(trackId, chapterId = "") {
  const track = trackById.get(trackId);
  if (!track) return;

  const chapter = chapterById.get(chapterId);
  currentPlaybackContext = chapter ? `${chapter.num}《${chapter.title}》候选 · 从 ${FormatTime(track.cue)} 开始` : `完整候选 · 从 ${FormatTime(track.cue)} 开始`;
  playerContext.textContent = currentPlaybackContext;
  playerTitle.textContent = track.title;
  playerDock.hidden = false;

  if (currentTrackId === trackId) {
    if (audioPlayer.paused) {
      try { await audioPlayer.play(); } catch (error) { SetStatus("浏览器阻止了播放，请再点一次试听。", true); }
    } else audioPlayer.pause();
    return;
  }

  currentTrackId = trackId;
  let cueApplied = false;
  const ApplyCue = () => {
    if (cueApplied || !Number.isFinite(audioPlayer.duration)) return;
    cueApplied = true;
    audioPlayer.currentTime = Math.min(track.cue, Math.max(0, audioPlayer.duration - 1));
  };

  audioPlayer.addEventListener("loadedmetadata", ApplyCue, { once: true });
  audioPlayer.src = track.file;
  audioPlayer.load();
  if (audioPlayer.readyState >= 1) ApplyCue();

  try {
    await audioPlayer.play();
    if (audioPlayer.readyState >= 1) ApplyCue();
  } catch (error) {
    SetStatus("音频没有开始播放，请检查本地文件是否完整或再点一次试听。", true);
  }
}

function UpdatePlaybackUi() {
  const isPlaying = currentTrackId !== null && !audioPlayer.paused;
  playerToggle.textContent = isPlaying ? "❚❚" : "▶";
  playerToggle.setAttribute("aria-label", isPlaying ? "暂停" : "播放");

  for (const button of document.querySelectorAll("button[data-action='listen']")) {
    const active = isPlaying && button.dataset.trackId === currentTrackId;
    button.classList.toggle("isPlaying", active);
    if (button.classList.contains("trackPlay")) button.textContent = active ? "❚❚ 暂停" : "▶ 试听";
    else button.textContent = active ? "❚❚" : "▶";
  }
}

function BuildExport() {
  return {
    project: "TunnelLight1943",
    page: "BgmReview",
    generatedAt: new Date().toISOString(),
    license: "Scott Buckley · CC BY 4.0 · https://www.scottbuckley.com.au/library/",
    chapters: CHAPTERS.map((chapter) => {
      const track = trackById.get(reviewState.selections[chapter.id]);
      return {
        id: chapter.id,
        chapter: chapter.num,
        title: chapter.title,
        selectedTrackId: track ? track.id : null,
        selectedTrackTitle: track ? track.title : null,
        note: reviewState.notes[chapter.id] || "",
      };
    }),
  };
}

function BuildExportText() {
  const data = BuildExport();
  const lines = ["《地道里的光》BGM 选择", ""];
  for (const chapter of data.chapters) {
    lines.push(`${chapter.chapter}《${chapter.title}》：${chapter.selectedTrackTitle || "未选（保留程序化配乐）"}`);
    if (chapter.note) lines.push(`  备注：${chapter.note}`);
  }
  lines.push("", "统一授权：Scott Buckley · CC BY 4.0 · www.scottbuckley.com.au");
  return lines.join("\n");
}

async function CopyExport() {
  const text = BuildExportText();
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      if (!copied) throw new Error("copy failed");
    }
    SetStatus("选择结果已复制。");
  } catch (error) {
    SetStatus("无法自动复制；请使用“下载 JSON”。", true);
  }
}

function DownloadExport() {
  const blob = new Blob([JSON.stringify(BuildExport(), null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "Data_BgmSelection.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  SetStatus("已下载 Data_BgmSelection.json。");
}

chapterGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "listen") ListenToTrack(button.dataset.trackId, button.dataset.chapterId);
  if (button.dataset.action === "pick") PickTrack(button.dataset.chapterId, button.dataset.trackId);
});

trackGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='listen']");
  if (button) ListenToTrack(button.dataset.trackId);
});

chapterGrid.addEventListener("input", (event) => {
  if (!event.target.classList.contains("chapterNote")) return;
  reviewState.notes[event.target.dataset.chapterId] = event.target.value;
  SaveState();
});

audioPlayer.addEventListener("play", UpdatePlaybackUi);
audioPlayer.addEventListener("pause", UpdatePlaybackUi);
audioPlayer.addEventListener("ended", UpdatePlaybackUi);
audioPlayer.addEventListener("error", () => SetStatus("音频读取失败，请确认 Audio 文件夹与 HTML 保持在一起。", true));
audioPlayer.addEventListener("loadedmetadata", () => {
  playerSeek.max = String(audioPlayer.duration || 0);
  durationTime.textContent = FormatTime(audioPlayer.duration);
});
audioPlayer.addEventListener("timeupdate", () => {
  playerSeek.value = String(audioPlayer.currentTime || 0);
  currentTime.textContent = FormatTime(audioPlayer.currentTime);
});

playerToggle.addEventListener("click", async () => {
  if (!currentTrackId) return;
  if (audioPlayer.paused) {
    try { await audioPlayer.play(); } catch (error) { SetStatus("浏览器阻止了播放，请再试一次。", true); }
  } else audioPlayer.pause();
});

skipBack.addEventListener("click", () => {
  audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 30);
});

skipForward.addEventListener("click", () => {
  audioPlayer.currentTime = Math.min(audioPlayer.duration || Infinity, audioPlayer.currentTime + 30);
});

playerSeek.addEventListener("input", () => {
  if (Number.isFinite(audioPlayer.duration)) audioPlayer.currentTime = Number(playerSeek.value);
});

loopToggle.addEventListener("click", () => {
  audioPlayer.loop = !audioPlayer.loop;
  loopToggle.setAttribute("aria-pressed", String(audioPlayer.loop));
});

volumeControl.addEventListener("input", () => {
  audioPlayer.volume = Number(volumeControl.value);
});

closePlayer.addEventListener("click", () => {
  audioPlayer.pause();
  playerDock.hidden = true;
});

copyDecision.addEventListener("click", CopyExport);
downloadDecision.addEventListener("click", DownloadExport);
clearDecision.addEventListener("click", () => {
  const hasData = Object.keys(reviewState.selections).length || Object.values(reviewState.notes).some(Boolean);
  if (hasData && !window.confirm("清空八章的选曲和备注？")) return;
  reviewState = { selections: {}, notes: {} };
  SaveState();
  for (const note of chapterGrid.querySelectorAll(".chapterNote")) note.value = "";
  UpdateSelectionUi();
  SetStatus("选择已清空。");
});

audioPlayer.volume = Number(volumeControl.value);
RenderChapters();
RenderTracks();
UpdatePlaybackUi();
