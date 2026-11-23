import { RetargetViewer } from "./retarget_viewer.mjs";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const appState = {
  config: null,
  tasks: [],
  characters: [],
  floorplan: null,
  dreamina: null,
  cloud: null,
  imageProviders: [],
  recentLogs: [],
  host: null,
  routeFilter: "mocap", // "mocap" | "all" | "mixamo"
  selectedTaskId: null,
  activeStage: 5,
  s6Tab: "brief",
  sysTab: "overview",
  sysOpen: false,
  pendingCreditAction: null,
  retViewer: null,
  retPlaying: false,
  retTime: 0,
  retDuration: 10,
  retRate: 1,
  retRafLast: 0,
};

function toast(msg, ms = 2600) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), ms);
}

let inflightApiCount = 0;
let viewerLoadingText = "";

function updateGlobalBusyUI() {
  const bar = $("#globalLoadBar");
  const pill = $("#topBusyPill");
  const pillText = $("#topBusyText");

  // Detect any active background job across all tasks
  let bgLabel = "";
  let bgTarget = null;
  for (const t of appState.tasks || []) {
    const run = (t.stage4?.runs || []).find((r) => r.status === "running" || r.status === "queued");
    if (run) {
      bgLabel = `${t.beatCode} 提骨中 ${run.progress ?? 0}%`;
      bgTarget = { taskId: t.id, stage: 4 };
      break;
    }
    const take = (t.stage3?.takes || []).find((x) => x.status === "running");
    if (take) {
      bgLabel = `${t.beatCode} 生成视频中…`;
      bgTarget = { taskId: t.id, stage: 3 };
      break;
    }
    const shot = (t.storyboard?.shots || []).find((s) => s.status === "running");
    if (shot) {
      bgLabel = `${t.beatCode} 分镜出图中…`;
      bgTarget = { taskId: t.id, stage: 2 };
      break;
    }
    const refRun = (t.stage6?.runs || []).find((r) => r.status === "running");
    if (refRun) {
      bgLabel = `${t.beatCode} Blender 修缮中…`;
      bgTarget = { taskId: t.id, stage: 6 };
      break;
    }
  }

  const label = bgLabel || viewerLoadingText || (inflightApiCount > 0 ? "请求处理中…" : "");
  const busy = Boolean(label);
  if (bar) bar.classList.toggle("active", busy);
  if (pill && pillText) {
    pill.classList.toggle("hidden", !busy);
    if (busy) pillText.textContent = label;
    pill.dataset.taskId = bgTarget?.taskId || "";
    pill.dataset.stage = bgTarget ? String(bgTarget.stage) : "";
  }
}

async function api(url, opts = {}) {
  const silent = Boolean(opts.silent);
  const relUrl = typeof url === "string" && url.startsWith("/") ? `.${url}` : url;
  if (!silent) {
    inflightApiCount++;
    updateGlobalBusyUI();
  }
  try {
    const res = await fetch(relUrl, {
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `请求失败 (${res.status})`);
    }
    return data;
  } finally {
    if (!silent) {
      inflightApiCount = Math.max(0, inflightApiCount - 1);
      updateGlobalBusyUI();
    }
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)}M`;
  if (bytes > 1e3) return `${(bytes / 1e3).toFixed(0)}K`;
  return `${bytes}B`;
}

function shortExtLabel(relPath) {
  const name = relPath.split("/").pop();
  if (name === "overlay.mp4") return "Overlay";
  if (name === "world.mp4") return "World";
  return name.split(".").pop().toUpperCase() || name;
}

function filteredTasks() {
  if (appState.routeFilter === "all") return appState.tasks;
  return appState.tasks.filter((t) => (t.routeType || "mocap") === appState.routeFilter);
}

function currentTask() {
  return appState.tasks.find((t) => t.id === appState.selectedTaskId) || filteredTasks()[0] || appState.tasks[0] || null;
}

function activeMocapRun(task) {
  if (!task) return null;
  return (
    (task.stage4?.runs || []).find((r) => r.jobId === task.stage4.activeRunId) ||
    (task.stage4?.runs || [])[0] ||
    null
  );
}

function charInfo(charId) {
  return appState.characters.find((c) => c.id === charId) || appState.characters[0] || {
    id: "xbot",
    name: "X Bot",
    hipsScale: 1,
    modelUrl: "game-assets/Animation/Mixamo/Model_MixamoXBot.glb",
  };
}

function stageStates(task) {
  if (!task) return Array.from({ length: 6 }, () => ({ done: false, running: false, badge: "" }));
  const isMixamo = task.routeType === "mixamo";
  if (isMixamo) {
    const s5Ok = task.stage5?.status === "approved";
    return [
      { done: true, running: false, badge: "通用" },
      { done: true, running: false, badge: "跳过" },
      { done: true, running: false, badge: "跳过" },
      { done: true, running: false, badge: "Mixamo" },
      { done: s5Ok, running: false, badge: s5Ok ? "已通过" : "待验收" },
      { done: false, running: false, badge: "按需" },
    ];
  }

  const s1Done = task.whitebox?.status === "approved";
  const shots = task.storyboard?.shots || [];
  const s2Run = shots.some((s) => s.status === "running");
  const s2Ready = shots.filter((s) => s.status === "succeeded").length;
  const s2Done = Boolean(task.storyboard?.approved);

  const takes = task.stage3?.takes || [];
  const s3Run = takes.some((t) => t.status === "running");
  const s3Ok = takes.filter((t) => t.status === "succeeded").length;

  const runs = task.stage4?.runs || [];
  const s4Run = runs.some((r) => r.status === "queued" || r.status === "running");
  const s4Succ = runs.find((r) => r.status === "succeeded");
  const s4Done = Boolean(s4Succ);

  const s5Has = Boolean(task.stage5?.mixamoGlb?.url);
  const s5Approved = task.stage5?.status === "approved";

  const issues = task.stage6?.issues || [];
  const openIssues = issues.filter((i) => i.status !== "done").length;
  const s6Run = (task.stage6?.runs || []).some((r) => r.status === "running");
  const s6Done = issues.length > 0 && openIssues === 0;

  return [
    { done: s1Done, running: false, badge: s1Done ? "已定" : "待确认" },
    { done: s2Done, running: s2Run, badge: s2Run ? "生图中" : s2Done ? "已确认" : s2Ready ? `${s2Ready}/${shots.length}` : `${shots.length}镜` },
    { done: s3Ok > 0, running: s3Run, badge: s3Run ? "抽卡中" : s3Ok ? `${s3Ok}条` : "待生成" },
    { done: s4Done, running: s4Run, badge: s4Run ? `${runs.find((r) => r.status === "running" || r.status === "queued")?.progress ?? 0}%` : s4Done ? `${s4Succ.summary?.frames || 300}帧` : "待提骨" },
    { done: s5Approved, running: false, badge: s5Approved ? "已入库" : s5Has ? "待二验" : "未转换" },
    { done: s6Done, running: s6Run, badge: s6Run ? "修缮中" : openIssues ? `${openIssues}项` : s5Approved ? "免修" : "按需" },
  ];
}

function activeImageProviderId() {
  return appState.config?.storyboardImageProvider || "seedream";
}

function getProviderInfo(id = activeImageProviderId()) {
  return (
    appState.imageProviders.find((p) => p.id === id) || {
      id: "seedream",
      code: "01",
      name: "Seedream",
      shortName: "Seedream",
      modelLabel: "5.0 Flash · 2K",
      ready: Boolean(appState.dreamina?.loggedIn),
      statusText: appState.dreamina?.loggedIn ? "已就绪" : "未登录",
      detail: "即梦画布生图",
      needsCreditQuote: true,
    }
  );
}

async function selectImageProvider(providerId) {
  try {
    const res = await api("/api/config", {
      method: "POST",
      body: JSON.stringify({ storyboardImageProvider: providerId }),
    });
    appState.config = res.config;
    appState.dreamina = res.dreamina || appState.dreamina;
    appState.cloud = res.cloud || appState.cloud;
    appState.imageProviders = res.imageProviders || appState.imageProviders;
    renderAll();
    const p = getProviderInfo(providerId);
    toast(`分镜图来源已切换：${p.name}`);
  } catch (err) {
    toast(err.message, 4000);
  }
}

function setSysTab(tabName) {
  appState.sysTab = tabName || "overview";
  $$(".mwSysTab").forEach((b) => b.classList.toggle("active", b.dataset.systab === appState.sysTab));
  $$("[data-syspanel]").forEach((p) => p.classList.toggle("hidden", p.dataset.syspanel !== appState.sysTab));
  if (appState.sysTab === "config") populateConfigInputs();
}

function populateConfigInputs() {
  const c = appState.config;
  if (!c) return;
  $("#cfgImageProvider").value = c.storyboardImageProvider || "seedream";
  $("#cfgSeedreamModel").value = c.seedreamModel || "high_aes_general_v50_flash";
  $("#cfgCursorPath").value = c.cursorCliPath || "";
  $("#cfgCursorModel").value = c.cursorGrokModel && c.cursorGrokModel !== "grok" ? c.cursorGrokModel : "grok-4.7-xhigh";
  $("#cfgCodexPath").value = c.codexCliPath || "codex";
  $("#cfgCodexModel").value = c.codexModel || "";
  $("#cfgOpenAiKey").value = "";
  $("#cfgOpenAiKeyBadge").textContent = c.hasOpenaiApiKey ? "（已配置密钥）" : "";
  $("#cfgOpenAiBase").value = c.openaiBaseUrl || "https://api.openai.com";
  $("#cfgOpenAiModel").value = c.openaiImageModel || "gpt-image-1";
  $("#cfgMocapBackend").value = c.mocapBackend || "colab_cli";
  $("#cfgColabPath").value = c.colabCliPath || "";
  $("#cfgColabAutoStop").value = String(c.colabAutoStopSec ?? 180);
  $("#cfgModalUrl").value = c.modalBaseUrl || "";
  $("#cfgModalToken").value = c.modalApiToken || "";
  $("#cfgDreaminaPath").value = c.dreaminaCliPath || "";
  $("#cfgExportMirror").value = c.exportMirrorDir || "";
  $("#cfgRefineCmd").value = c.refineCommandTemplate || "";
  $("#cfgTestStatus").textContent = "";
}

/* --- 聚合「系统与资源」指挥抽屉 & 顶栏 --- */
function renderSystemAggregated() {
  const d = appState.dreamina;
  const c = appState.cloud;
  const task = currentTask();
  const run = activeMocapRun(task);
  const runningRun = appState.tasks
    .flatMap((t) => t.stage4?.runs || [])
    .find((r) => r.status === "running" || r.status === "queued");

  const dot = $("#sysDot");
  const label = $("#sysBtnLabel");
  if (runningRun) {
    dot.className = "mwDot busy";
    label.textContent = `GPU ${runningRun.progress ?? 0}%`;
  } else if (d?.loggedIn && c?.online) {
    dot.className = "mwDot ok";
    label.textContent = "系统";
  } else {
    dot.className = "mwDot warn";
    label.textContent = "系统";
  }

  // Top 3-column metric strip
  $("#dotDreamina").className = `mwTinyDot ${d?.loggedIn ? "ok" : "warn"}`;
  $("#sysDreaminaCredits").textContent =
    d?.availableCredits != null ? Number(d.availableCredits).toLocaleString("en-US") : "—";
  $("#sysDreaminaUser").textContent = d?.loggedIn
    ? `${d.displayName || "已登录"} (${d.profile || "default"})`
    : `未登录 (${d?.profile || "default"})`;

  // Dreamina dual-account buttons
  const curProf = appState.config?.dreaminaProfile || d?.profile || "default";
  $$("#dreaminaProfileRow .mwAccBtn").forEach((b) => {
    b.classList.toggle("active", b.dataset.dprof === curProf);
  });

  // Cloud GPU metric
  const tmRun = runningRun || run;
  const tm = tmRun?.telemetry || {};
  const isSleep = !tmRun || tmRun.containerState === "scaled_to_zero" || tmRun.status === "succeeded";
  const isColab = (c?.backend || appState.config?.mocapBackend || "colab_cli") === "colab_cli";
  $("#dotCloud").className = `mwTinyDot ${c?.online ? "ok" : "warn"}`;
  if (isColab) {
    if (c?.online) {
      $("#kpiGpuState").textContent = c.balance != null ? `${c.balance} 单元` : c.activeJobs > 0 ? "运行中" : "已就绪";
      $("#kpiGpuSub").textContent = c.hourlyRate != null ? `Colab · ${c.hourlyRate}/时` : `Colab v${c.version || "0.8"}`;
    } else if (c?.installed) {
      $("#kpiGpuState").textContent = "Colab CLI";
      $("#kpiGpuSub").textContent = "待授权登录";
    } else {
      $("#kpiGpuState").textContent = "未安装";
      $("#kpiGpuSub").textContent = "google-colab-cli";
    }
  } else if (c?.online) {
    $("#kpiGpuState").textContent = c.activeJobs > 0 ? `${tm.gpuUtilPct ?? 0}%` : "0 卡休眠";
    $("#kpiGpuSub").textContent = `Modal · ${c.latencyMs ?? "--"}ms`;
  } else {
    $("#kpiGpuState").textContent = c?.configured ? "离线" : "未配置";
    $("#kpiGpuSub").textContent = "Modal 网关";
  }

  // Local host RAM
  if (appState.host) {
    $("#sysHostName").textContent = `${appState.host.hostname} · 共 ${appState.host.ramTotalGb}G`;
    $("#sysHostRam").textContent = `${appState.host.ramFreeGb} GB`;
  }

  // 4-provider minimal list
  const provList = $("#sysProvList");
  if (provList) {
    const activeId = activeImageProviderId();
    provList.innerHTML = appState.imageProviders
      .map((p) => {
        const isAct = p.id === activeId;
        return `
          <div class="mwProvRow ${isAct ? "active" : ""}">
            <i class="mwTinyDot ${p.ready ? "ok" : ""}"></i>
            <div class="mwProvInfo">
              <div class="mwProvTitle">${escapeHtml(p.name)}</div>
              <div class="mwProvDesc">${escapeHtml(p.modelLabel || "")} · ${escapeHtml(p.statusText)}</div>
            </div>
            ${
              isAct
                ? `<span class="mwProvActiveTag">使用中</span>`
                : `<button class="mwBtn mwSm" data-pick-provider="${p.id}" type="button">选用</button>`
            }
          </div>
        `;
      })
      .join("");
    provList.querySelectorAll("[data-pick-provider]").forEach((btn) => {
      btn.onclick = () => selectImageProvider(btn.dataset.pickProvider);
    });
  }

  // Cloud GPU telemetry panel
  $("#gGpuName").textContent = isSleep
    ? `${isColab ? "Colab CLI" : tm.gpuName || "NVIDIA L4"} · 0 卡休眠`
    : tm.gpuName || "NVIDIA GPU · 运行中";
  $("#gGpuUtil").textContent = `${tm.gpuUtilPct ?? 0}% · ${tm.gpuTempC ?? "--"}°C`;
  const needAction = isColab ? !c?.online : !c?.configured;
  $("#sysGpuUnconfiguredNote").classList.toggle("hidden", !needAction);
  if (needAction) {
    $("#sysGpuNoticeText").textContent = isColab
      ? "首次使用需完成一次 Google 授权"
      : "未绑定 Modal 网关，当前 0 卡零计费";
    $("#btnColabLogin").classList.toggle("hidden", !isColab || !c?.installed);
    $("#btnJumpModalCfg").classList.toggle("hidden", isColab);
  } else {
    $("#colabAuthBox").classList.add("hidden");
  }
  $("#btnColabStopGpu").classList.toggle("hidden", !isColab || !(c?.activeJobs > 0));
  $("#sysGpuMeters").classList.toggle("dimmed", isSleep && needAction);

  const vramU = tm.gpuVramUsedGb ?? 0;
  const vramT = tm.gpuVramTotalGb || 24;
  $("#gVram").textContent = `${vramU}/${vramT}G`;
  $("#gVramBar").style.width = `${Math.min(100, (vramU / vramT) * 100)}%`;

  const ramU = tm.ramUsedGb ?? 0;
  const ramT = tm.ramTotalGb || 53;
  $("#gRam").textContent = `${ramU}/${ramT}G`;
  $("#gRamBar").style.width = `${Math.min(100, (ramU / ramT) * 100)}%`;

  const dU = tm.diskUsedGb ?? 0;
  const dT = tm.diskTotalGb || 235;
  $("#gDisk").textContent = `${dU}/${dT}G`;
  $("#gDiskBar").style.width = `${Math.min(100, (dU / dT) * 100)}%`;

  // Unified logs (recent storyboard provider logs + cloud mocap logs)
  const combinedLogs = [
    ...(appState.recentLogs || []),
    ...(tmRun?.logs || []),
  ];
  $("#s4Logs").textContent = combinedLogs.join("\n") || "暂无运行日志";

  setSysTab(appState.sysTab);
}

function setSystemDrawer(open, targetTab = null) {
  appState.sysOpen = open;
  if (targetTab) appState.sysTab = targetTab;
  $("#sysDrawer").classList.toggle("hidden", !open);
  $("#sysBackdrop").classList.toggle("hidden", !open);
  $("#btnSystem").classList.toggle("open", open);
  $("#btnSystem").setAttribute("aria-expanded", String(open));
  if (open) {
    populateConfigInputs();
    setSysTab(appState.sysTab);
  }
}

/* --- 左栏：概念图封面动作卡 --- */
function renderTaskList() {
  const list = filteredTasks();
  const mocapCount = appState.tasks.filter((t) => t.routeType !== "mixamo").length;
  $("#taskCountBadge").textContent = `${list.length} / ${appState.tasks.length}（定制 ${mocapCount}）`;

  $$(".mwFilterBtn").forEach((b) => b.classList.toggle("active", b.dataset.filter === appState.routeFilter));

  const box = $("#taskList");
  box.innerHTML = "";
  for (const task of list) {
    const st = stageStates(task);
    const isMixamo = task.routeType === "mixamo";
    const card = document.createElement("button");
    card.type = "button";
    card.className = `mwActionCard ${task.id === appState.selectedTaskId ? "active" : ""}`;
    card.innerHTML = `
      <div class="mwCoverSlot">
        ${task.conceptCoverUrl ? `<img src="${task.conceptCoverUrl}" alt="${escapeHtml(task.title)}">` : `<span class="mwCoverPlaceholder">概念图待补</span>`}
        <span class="mwCoverBeat">${escapeHtml(task.beatCode || "")}</span>
        <span class="mwCoverRoute ${isMixamo ? "mixamo" : "mocap"}">${isMixamo ? "Mixamo" : "GEM-X"}</span>
      </div>
      <div class="mwCardInfo">
        <div class="mwCardTitle">${escapeHtml(task.title)}</div>
        <div class="mwSegBar">${st.map((s) => `<i class="${s.running ? "run" : s.done ? "done" : ""}"></i>`).join("")}</div>
      </div>
    `;
    card.onclick = () => {
      appState.selectedTaskId = task.id;
      // Smart default stage: Mixamo items jump straight to Stage 5 3D preview; new mocap items jump to their latest ready stage
      if (task.routeType === "mixamo") {
        appState.activeStage = 5;
      } else if (task.stage5?.mixamoGlb?.url) {
        appState.activeStage = 5;
      } else if (task.stage4?.runs?.some((r) => r.status === "succeeded")) {
        appState.activeStage = 4;
      } else if (task.stage3?.takes?.some((t) => t.status === "succeeded")) {
        appState.activeStage = 3;
      } else if (task.whitebox?.status === "approved") {
        appState.activeStage = 2;
      } else {
        appState.activeStage = 1;
      }
      renderAll();
    };
    box.appendChild(card);
  }
}

/* --- 顶部 6 阶段流程轨 --- */
function renderStageRail(task) {
  const st = stageStates(task);
  $$(".mwStep").forEach((btn) => {
    const s = Number(btn.dataset.stage);
    const info = st[s - 1];
    btn.classList.toggle("active", s === appState.activeStage);
    btn.classList.toggle("done", info.done);
    btn.classList.toggle("running", info.running);
    const badgeEl = btn.querySelector(`[data-step-state="${s}"]`);
    if (badgeEl) badgeEl.textContent = info.badge || "待处理";
  });
  $$(".mwBridge").forEach((br) => {
    const idx = Number(br.dataset.bridge);
    const leftDone = st[idx - 1]?.done;
    const leadsToActive = idx + 1 === appState.activeStage;
    br.classList.toggle("done", Boolean(leftDone) && !leadsToActive);
    br.classList.toggle("lead", leadsToActive);
  });
  $$(".mwStage").forEach((sec) => {
    sec.classList.toggle("hidden", Number(sec.dataset.panel) !== appState.activeStage);
  });
  if (appState.activeStage === 5) {
    syncRetargetViewer(task);
  }
}

function setVideoSrcIfChanged(el, url) {
  if (!el) return;
  const target = url || "";
  if (el.dataset.loadedUrl !== target) {
    if (target) el.src = target;
    else el.removeAttribute("src");
    el.dataset.loadedUrl = target;
    if (!target) el.load();
  }
}

/* --- 01 防炮洞 6 人白盒合演平面图 SVG --- */
function renderBunkerFloorplan(task) {
  const fp = appState.floorplan;
  const box = $("#s1FloorStage");
  if (!fp || !box) return;
  const activeId = task.actorFloorId || task.characterId;
  const activeActor = fp.actors.find((a) => a.id === activeId);
  $("#s1FloorHighlight").textContent = activeActor ? `高亮：${activeActor.name} · ${activeActor.note}` : "01 防炮洞 6 人合演";

  const nodesSvg = fp.actors
    .map((a) => {
      const cx = 36 + a.x * 3.8;
      const cy = 32 + a.y * 2.15;
      const isMe = a.id === activeId;
      const rad = (a.facing * Math.PI) / 180;
      const fx = cx + Math.cos(rad) * 20;
      const fy = cy + Math.sin(rad) * 20;
      return `
        <g>
          ${isMe ? `<circle cx="${cx}" cy="${cy}" r="22" fill="#edca831c" stroke="#edca8366" stroke-dasharray="3 3"/>` : ""}
          <line x1="${cx}" y1="${cy}" x2="${fx}" y2="${fy}" stroke="${isMe ? "#edca83" : "#9dc0e466"}" stroke-width="${isMe ? 2 : 1.2}"/>
          <circle cx="${cx}" cy="${cy}" r="${isMe ? 8.5 : 6}" fill="${isMe ? "#edca83" : "#1c242b"}" stroke="${isMe ? "#fff0c8" : "#9dc0e4"}" stroke-width="1.5"/>
          <text x="${cx}" y="${cy + 21}" text-anchor="middle" fill="${isMe ? "#ffe0a1" : "#c2c3b6"}" font-size="${isMe ? 12 : 10.5}" font-weight="${isMe ? 700 : 400}">${escapeHtml(a.name)}</text>
        </g>
      `;
    })
    .join("");

  box.innerHTML = `
    <svg viewBox="0 0 460 280" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- 坐标网格 -->
      <defs>
        <pattern id="fpGrid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M 28 0 L 0 0 0 28" stroke="#c1bdab14" stroke-width="0.7"/>
        </pattern>
      </defs>
      <rect x="8" y="8" width="444" height="264" fill="url(#fpGrid)" stroke="#c1bdab28"/>
      <!-- 防炮洞土壁几何 -->
      <path d="M 38 42 L 352 42 L 352 104 L 418 104 M 418 164 L 352 164 L 352 238 L 38 238 Z" fill="#12140f" stroke="#c1bdab55" stroke-width="2"/>
      <!-- 洞口标注 -->
      <line x1="352" y1="104" x2="352" y2="164" stroke="#edca8366" stroke-width="1.5" stroke-dasharray="4 3"/>
      <text x="388" y="92" text-anchor="middle" fill="#edca83bb" font-size="10" letter-spacing="1.5">洞口 → 东前沟</text>
      <text x="52" y="28" fill="#7f7e72" font-size="10" letter-spacing="2">北壁（土壁）</text>
      <text x="52" y="258" fill="#7f7e72" font-size="10" letter-spacing="2">南壁（冬瓜 / 幺娃侧）</text>
      ${nodesSvg}
    </svg>
  `;
}

/* --- Stage 2: 电影分镜板 --- */
function renderStage2Storyboard(task) {
  const board = $("#s2StoryboardBoard");
  board.innerHTML = "";
  const shots = task.storyboard?.shots || [];
  const isMixamo = task.routeType === "mixamo";

  if (isMixamo || !shots.length) {
    board.style.gridTemplateColumns = "1fr";
    board.innerHTML = `
      <div class="mwPlaceholder">
        <div class="mwPhTitle">${isMixamo ? "此条目复用 Mixamo 通用动作 · 无需分镜" : "暂无分镜格"}</div>
        <div class="mwPhActions">
          <button class="mwBtn mwPrimary" id="btnS2SkipTo5" type="button">直接前往 05 重定向 3D 验收 →</button>
        </div>
      </div>
    `;
    const btn = $("#btnS2SkipTo5");
    if (btn) btn.onclick = () => gotoStage(5);
  } else {
    board.style.gridTemplateColumns = `repeat(${Math.min(4, shots.length)}, minmax(0, 1fr))`;
    for (const sh of shots) {
      const card = document.createElement("div");
      card.className = `mwShotCard ${sh.lockRole ? "locked" : ""}`;
      card.innerHTML = `
        <div class="mwShotTop">
          <span class="mwShotCode">${escapeHtml(sh.code)}</span>
          <span class="mwShotTopRight">
            ${sh.providerLabel ? `<span class="mwShotProvTag">${escapeHtml(sh.providerLabel)}</span>` : ""}
            <span class="mwShotTime">${escapeHtml(sh.timeRange)}</span>
          </span>
        </div>
        <div class="mwShotFrame">
          ${
            sh.url
              ? `<img src="${sh.url}" alt="${escapeHtml(sh.role)}">`
              : `<span class="mwShotEmptyLabel ${sh.status === "failed" ? "err" : ""}" title="${escapeHtml(sh.progressText || "")}">${sh.status === "running" || sh.status === "failed" ? escapeHtml(sh.progressText || "生图中…") : "分镜格 · 待生成"}</span>`
          }
        </div>
        <div class="mwShotBody">
          <div class="mwShotRole">${escapeHtml(sh.role)}</div>
          <div class="mwShotBeat">${escapeHtml(sh.beat)}</div>
        </div>
        <div class="mwShotFoot">
          <button class="mwLockChip ${sh.lockRole === "start" ? "on" : ""}" data-shot-lock="${sh.id}:start" type="button">首帧</button>
          <button class="mwLockChip ${sh.lockRole === "ref" ? "on" : ""}" data-shot-lock="${sh.id}:ref" type="button">过程</button>
          <button class="mwLockChip ${sh.lockRole === "end" ? "on" : ""}" data-shot-lock="${sh.id}:end" type="button">尾帧</button>
          <button class="mwBtn mwSm" data-shot-gen="${sh.id}" type="button">${sh.url ? "重抽" : "生成"}</button>
        </div>
      `;
      board.appendChild(card);
    }

    board.querySelectorAll("[data-shot-lock]").forEach((btn) => {
      btn.onclick = async () => {
        const [sid, role] = btn.dataset.shotLock.split(":");
        const nextShots = shots.map((s) =>
          s.id === sid ? { ...s, lockRole: s.lockRole === role ? "" : role } : s
        );
        const res = await api(`/api/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({ storyboard: { ...task.storyboard, shots: nextShots } }),
        });
        replaceTask(res.task);
      };
    });

    board.querySelectorAll("[data-shot-gen]").forEach((btn) => {
      btn.onclick = () => quoteAndRunStoryboardShot(task, btn.dataset.shotGen);
    });
  }

  // Stage 02: 4-source storyboard image provider selector
  const provGrid = $("#s2ProviderGrid");
  if (provGrid) {
    const activeId = activeImageProviderId();
    provGrid.innerHTML = appState.imageProviders
      .map(
        (p) => `
          <button class="mwProvBtn ${p.id === activeId ? "active" : ""}" data-s2-prov="${p.id}" type="button" title="${escapeHtml(p.detail || p.engine)}">
            <span class="mwProvBtnTop">
              <span class="mwProvName">${escapeHtml(p.code)} ${escapeHtml(p.shortName)}</span>
              <span class="mwProvDot ${p.ready ? "ok" : "warn"}"></span>
            </span>
            <span class="mwProvSub">${escapeHtml(p.modelLabel || p.statusText)}</span>
          </button>
        `
      )
      .join("");
    provGrid.querySelectorAll("[data-s2-prov]").forEach((btn) => {
      btn.onclick = () => selectImageProvider(btn.dataset.s2Prov);
    });
    const curProv = getProviderInfo(activeId);
    $("#s2ProviderHint").textContent = `${curProv.name} · ${curProv.statusText}（${curProv.detail || curProv.engine}）`;
  }

  // Quality presets
  const qVal = task.storyboard?.qualityPreset || "720p";
  $$("#s2QualityPresets .mwPresetBtn").forEach((b) => {
    b.classList.toggle("active", b.dataset.q === qVal);
    b.onclick = async () => {
      const res = await api(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ storyboard: { ...task.storyboard, qualityPreset: b.dataset.q } }),
      });
      replaceTask(res.task);
    };
  });

  // Drive mode readout
  const locked = shots.filter((s) => s.lockRole);
  const readyLocked = locked.filter((s) => s.status === "succeeded" && (s.nodeId || s.resourceId || s.localPath));
  const modeLabel =
    readyLocked.length === 0
      ? `文本 + 白盒规划（${qVal} · ${task.durationSec || 10}s）`
      : readyLocked.length === 1
      ? `单图首帧锁定 · first_last_frame（${qVal}）`
      : readyLocked.length === 2
      ? `首尾双帧锁定 · first_last_frame（${qVal}）`
      : `多镜连续参考 · m2v（${readyLocked.length} 图 · ${qVal}）`;

  $("#s2DriveModeText").textContent = modeLabel;
  $("#s2LockSummary").textContent = shots.length
    ? `已规划 ${shots.length} 镜 · 已生成 ${shots.filter((s) => s.status === "succeeded").length} 张 · 锁定 ${locked.map((s) => s.code).join(" / ") || "无"}`
    : "通用复用项无需分镜";

  $("#s2TimelineTicks").innerHTML = shots
    .map((s) => `<span class="mwTick ${s.status === "succeeded" ? "on" : ""}">${escapeHtml(s.code)} · ${escapeHtml(s.timeRange)}</span>`)
    .join("");
}

/* --- 主任务渲染 --- */
function renderTaskDetail() {
  const task = currentTask();
  if (!task) return;
  const isMixamo = task.routeType === "mixamo";

  $("#topBeatCode").textContent = task.beatCode || "—";
  $("#topTaskTitle").textContent = task.title;
  const pill = $("#topRouteTag");
  pill.textContent = isMixamo ? "Mixamo 复用" : "GEM-X 77骨定制";
  pill.className = `mwRoutePill ${isMixamo ? "mixamo" : "mocap"}`;

  renderStageRail(task);

  // Stage 01 · 白盒导演
  $("#s1ConceptCaption").textContent = task.conceptCaption || task.stage1?.description || "";
  renderBunkerFloorplan(task);
  $("#s1EnsembleNote").textContent = task.whitebox?.ensembleNote || "—";
  $("#s1Displacement").textContent = task.whitebox?.soloDisplacement || "—";
  $("#s1SoloStrategy").textContent = task.whitebox?.soloStrategy || "—";
  $("#s1MetaBeat").textContent = `${task.chapter || "第一关"} · ${task.beatCode || ""}`;
  $("#s1MetaChar").textContent = task.stage1?.character || "—";
  $("#s1MetaDur").textContent = `${task.durationSec || 10} s`;
  $("#s1MetaRoute").textContent = isMixamo ? "Mixamo 通用库复用" : "白盒驱动 → Seedance → GEM-X";
  $("#s1MetaCue").textContent = task.whitebox?.dialogueCue || "—";
  $("#s1MetaReason").textContent = task.routeReason || "—";
  $("#s1MetaDesc").textContent = task.stage1?.description || "—";
  $("#btnApproveStage1").textContent = isMixamo
    ? "直接前往 05 重定向 3D 验收 →"
    : task.whitebox?.status === "approved"
    ? "✓ 白盒走位已确认 → 前往分镜"
    : "✓ 确认白盒走位 → 进入分镜";

  // Stage 02 · 电影分镜
  renderStage2Storyboard(task);

  // Stage 03 · 视频生成
  const takes = task.stage3?.takes || [];
  const selectedTake =
    takes.find((t) => t.id === task.stage3.selectedTakeId) ||
    takes.find((t) => t.status === "succeeded") ||
    null;

  const hasHero = Boolean(selectedTake?.url);
  $("#s3PlayerEmpty").classList.toggle("hidden", hasHero);
  $("#s3MainVideo").classList.toggle("hidden", !hasHero);
  $("#s3MainCap").classList.toggle("hidden", !hasHero);
  if (hasHero) {
    setVideoSrcIfChanged($("#s3MainVideo"), selectedTake.url);
    $("#s3MainCap").textContent = `${selectedTake.label} · ${fmtSize(selectedTake.sizeBytes)}`;
  } else {
    setVideoSrcIfChanged($("#s3MainVideo"), "");
  }

  const mPreset = task.stage3?.modelPreset || "seedance_2.5_flash";
  $$("#s3ModelPresets .mwPresetBtn").forEach((b) => {
    b.classList.toggle("active", b.dataset.m === mPreset);
    b.onclick = async () => {
      const res = await api(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ modelPreset: b.dataset.m }),
      });
      replaceTask(res.task);
    };
  });
  const s2ReadyCount = (task.storyboard?.shots || []).filter((s) => s.status === "succeeded").length;
  $("#s3SourceSummary").textContent = `白盒：${task.whitebox?.status === "approved" ? "已确认" : "待确认"} · 分镜：${s2ReadyCount} 张就绪 · ${task.storyboard?.qualityPreset || "720p"} · ${task.durationSec || 10}s`;

  const s3Box = $("#s3Takes");
  s3Box.innerHTML = "";
  for (const tk of takes) {
    const sel = tk.id === task.stage3.selectedTakeId;
    const tile = document.createElement("div");
    tile.className = `mwTakeTile ${sel ? "selected" : ""}`;
    tile.innerHTML = `
      <div class="mwTakeThumb">
        ${tk.url ? `<video src="${tk.url}" muted playsinline preload="metadata"></video>` : `<span>${escapeHtml(tk.progressText || tk.status)}</span>`}
      </div>
      <div class="mwTakeMeta">
        <span>${escapeHtml(tk.label)}</span>
        <span class="mwMono">${sel ? "●" : fmtSize(tk.sizeBytes)}</span>
      </div>
    `;
    if (tk.status === "succeeded") {
      tile.onclick = async () => {
        const res = await api(`/api/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({ selectedTakeId: tk.id }),
        });
        replaceTask(res.task);
      };
    }
    s3Box.appendChild(tile);
  }

  // Stage 04 · 骨骼提取
  const pPreset = task.stage4?.precisionPreset || "standard_l4";
  $$("#s4PrecisionPresets .mwPresetBtn").forEach((b) => {
    b.classList.toggle("active", b.dataset.p === pPreset);
    b.onclick = async () => {
      const res = await api(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ precisionPreset: b.dataset.p }),
      });
      replaceTask(res.task);
    };
  });
  $("#s4SelectedVideo").textContent = selectedTake
    ? `${selectedTake.label} (${fmtSize(selectedTake.sizeBytes)})`
    : isMixamo
    ? "复用 Mixamo 动作（跳过提骨）"
    : "未选定视频";

  const run = activeMocapRun(task);
  const isRunning = run && (run.status === "running" || run.status === "queued");
  const isFailed = run && run.status === "failed";
  const files = run?.files || {};
  const hasResult = run?.status === "succeeded" && Object.keys(files).length > 0;

  function parseMocapFailure(r) {
    const raw = [r?.stageLabel || "", ...(r?.logs || [])].join("\n");
    const isColabAuth = /未授权|authorization code|accounts\.google\.com\/o\/oauth2|一键登录 Colab|去登录 Colab/i.test(raw);
    const isNetErr = /timed out|timeout|ECONNREFUSED|ENOTFOUND|网络不可达/i.test(raw);
    if (isColabAuth) {
      return {
        shortTag: "Colab 未授权",
        title: "Colab CLI 尚未完成 Google 授权",
        hint: "本机已装好 Colab CLI，但尚未登录你的 Google 账号，因此无法向 Colab 申请 L4 / A100 GPU。点下方「去登录 Colab」在浏览器同意授权并贴回授权码后即可直接提骨。",
        isColabAuth: true,
        raw: (r?.logs || []).join("\n") || r?.stageLabel || "无详细日志",
      };
    }
    if (isNetErr) {
      return {
        shortTag: "网络超时",
        title: "连接云端算力超时或网络受阻",
        hint: "请确认本机代理可访问 Google Colab / Modal 接口，然后点击「重新提骨」。",
        isColabAuth: false,
        raw: (r?.logs || []).join("\n") || r?.stageLabel || "无详细日志",
      };
    }
    const cleanLine = String(r?.stageLabel || "云端提骨执行失败")
      .replace(/^失败[：:]\s*/, "")
      .split(/\r?\n/)[0]
      .slice(0, 120);
    return {
      shortTag: cleanLine.slice(0, 18) || "执行异常",
      title: cleanLine || "云端提骨执行失败",
      hint: "可展开下方原始错误日志排查原因，或在「系统 → 运行日志」查看完整输出。",
      isColabAuth: false,
      raw: (r?.logs || []).join("\n") || r?.stageLabel || "无详细日志",
    };
  }

  $("#s4LiveBar").classList.toggle("hidden", !isRunning);
  if (isRunning) {
    const pct = Math.max(0, Math.min(100, Number(run.progress || 0)));
    $("#s4LiveText").textContent = run.stageLabel || "云端 GPU 提骨中";
    $("#s4LivePct").textContent = `${pct}%`;
    $("#s4LiveFill").style.width = `${pct}%`;
  }

  $("#s4Empty").classList.toggle("hidden", hasResult);
  $("#s4ResultArea").classList.toggle("hidden", !hasResult);
  if (!hasResult) {
    const showFail = Boolean(isFailed && !isMixamo);
    $("#s4IdleBlock").classList.toggle("hidden", showFail);
    $("#s4FailCard").classList.toggle("hidden", !showFail);
    if (showFail) {
      const diag = parseMocapFailure(run);
      $("#s4FailJobId").textContent = run.jobId;
      $("#s4FailTitle").textContent = diag.title;
      $("#s4FailHint").textContent = diag.hint;
      $("#btnS4FixColabLogin").classList.toggle("hidden", !diag.isColabAuth);
      $("#s4FailLogPre").textContent = diag.raw;
    } else {
      $("#s4EmptyTitle").textContent = isMixamo
        ? "Mixamo 通用动作 · 直接前往 05 重定向 3D 验收"
        : isRunning
        ? "正在云端提取 77 关节骨骼…"
        : selectedTake
        ? "已就绪 · 点击提交云端提骨"
        : "请先在「03 视频生成」定稿视频";
    }
  } else {
    setVideoSrcIfChanged($("#vidOrig"), selectedTake?.url || "");
    setVideoSrcIfChanged($("#vidOverlay"), files["render/overlay.mp4"]?.url || "");
    setVideoSrcIfChanged($("#vidWorld"), files["render/world.mp4"]?.url || "");

    const sum = run.summary;
    $("#s4MetricSummary").textContent = sum
      ? `${sum.frames} 帧 · ${sum.fps} FPS · ${sum.joints} 关节 · FK ${sum.bvh_fk_error_mm ?? "--"} mm`
      : "";

    const dlBar = $("#s4Downloads");
    dlBar.innerHTML = "";
    const order = [".glb", ".fbx", ".bvh", ".usd", "overlay.mp4", "world.mp4"];
    const entries = Object.entries(files)
      .filter(([rel]) => !rel.endsWith(".json"))
      .sort(([a], [b]) => {
        const ia = order.findIndex((k) => a.endsWith(k));
        const ib = order.findIndex((k) => b.endsWith(k));
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
    for (const [rel, f] of entries) {
      const a = document.createElement("a");
      a.className = "mwDlLink";
      a.href = `${f.url}?download=1`;
      a.download = rel.split("/").pop();
      a.innerHTML = `${shortExtLabel(rel)} <span>${fmtSize(f.sizeBytes)}</span>`;
      dlBar.appendChild(a);
    }
  }

  const runs = task.stage4?.runs || [];
  $("#s4RunsSec").classList.toggle("hidden", runs.length === 0);
  const runBox = $("#s4RunTabs");
  runBox.innerHTML = "";
  for (const r of runs) {
    const b = document.createElement("button");
    b.type = "button";
    const failed = r.status === "failed";
    b.className = `mwRunItem ${r.jobId === run?.jobId ? "active" : ""} ${failed ? "isFailed" : ""}`;
    const mainLine = `${r.jobId} · ${r.status === "succeeded" ? "完成" : failed ? "失败" : `${r.progress ?? 0}%`}`;
    if (failed) {
      const diag = parseMocapFailure(r);
      b.innerHTML = `<span>${escapeHtml(mainLine)}</span><span class="mwRunItemSub">${escapeHtml(diag.shortTag)}</span>`;
    } else {
      b.textContent = mainLine;
    }
    b.onclick = async () => {
      const res = await api(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activeRunId: r.jobId }),
      });
      replaceTask(res.task);
    };
    runBox.appendChild(b);
  }

  // Stage 05 · 重定向验收
  renderStage5Retarget(task, selectedTake);

  // Stage 06 · 修缮
  setVideoSrcIfChanged($("#vidRefOrig"), selectedTake?.url || "");
  setVideoSrcIfChanged($("#vidRefOverlay"), files["render/overlay.mp4"]?.url || "");
  renderStage6(task);
}

/* --- STAGE 05 · 独立重定向二次验收 --- */
function renderStage5Retarget(task, selectedTake) {
  const hasClip = Boolean(task.stage5?.mixamoGlb?.url);
  $("#s5RetargetEmpty").classList.toggle("hidden", hasClip);
  $("#s5RetargetStage").classList.toggle("hidden", !hasClip);

  // Character switcher grid
  const activeCharId = task.stage5?.characterId || task.characterId || "xbot";
  const cInfo = charInfo(activeCharId);
  const grid = $("#s5CharGrid");
  grid.innerHTML = "";
  for (const ch of appState.characters) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `mwCharBtn ${ch.id === activeCharId ? "active" : ""}`;
    b.innerHTML = `<span class="cn">${escapeHtml(ch.name)}</span><span class="cs">${ch.hipsScale.toFixed(2)}</span>`;
    b.onclick = async () => {
      const res = await api(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ retargetCharacterId: ch.id }),
      });
      replaceTask(res.task);
    };
    grid.appendChild(b);
  }

  const qa = task.stage5?.qa;
  $("#qaMapped").textContent = qa ? `${qa.mappedBones} / ${qa.totalTargetBones} 骨` : "—";
  $("#qaMapped").className = `v mwMono ${qa ? "ok" : ""}`;
  $("#qaFingers").textContent = qa ? `${qa.fingerChannels} / 30 通道` : "—";
  $("#qaFingers").className = `v mwMono ${qa?.fingerChannels >= 30 ? "ok" : "warn"}`;
  $("#qaScale").textContent = `${cInfo.name} · hipsScale ${cInfo.hipsScale}`;
  $("#qaFoot").textContent = qa ? `minY ${qa.minFootY} m` : "—";
  $("#qaFoot").className = `v mwMono ${qa?.groundStatus === "warn" ? "warn" : "ok"}`;
  $("#qaWrist").textContent = qa ? `最大步角 ${qa.maxWristStepDeg}°` : "—";
  $("#qaWrist").className = `v mwMono ${qa?.wristStatus === "warn" ? "warn" : "ok"}`;
  $("#qaHint").textContent = cInfo.clipOverrideHint || "—";

  $("#btnApproveRetarget").textContent =
    task.stage5?.status === "approved" ? "✓ 已通过二次验收（可入库）" : "✓ 二次验收通过 · 可入库";

  if (!hasClip) return;

  const hasVid = Boolean(selectedTake?.url);
  $("#vidRetargetOrig").classList.toggle("hidden", !hasVid);
  $("#s5NoVideoNote").classList.toggle("hidden", hasVid);
  setVideoSrcIfChanged($("#vidRetargetOrig"), hasVid ? selectedTake.url : "");

  $("#s5CharViewportTitle").textContent = `${cInfo.name}（Mixamo · hipsScale ${cInfo.hipsScale}）`;
  $("#s5RetSummary").textContent = qa
    ? `${qa.targetSkeleton} · ${qa.frames} 帧 @ ${qa.fps} FPS · 胯高比 ${qa.legRatio}`
    : "";

  const dl = $("#s5RetDownloads");
  dl.innerHTML = "";
  const mg = task.stage5.mixamoGlb;
  if (mg?.url) {
    const a = document.createElement("a");
    a.className = "mwDlLink";
    a.href = mg.url.startsWith("workspace/") || mg.url.startsWith("/workspace/") ? `${mg.url}?download=1` : mg.url;
    a.download = mg.fileName || "retargeted_mixamo.glb";
    a.innerHTML = `Mixamo GLB <span>${fmtSize(mg.sizeBytes) || "库件"}</span>`;
    dl.appendChild(a);
  }

  if (appState.activeStage === 5) {
    syncRetargetViewer(task);
  }
}

async function syncRetargetViewer(task) {
  if (!task || !task.stage5?.mixamoGlb?.url) return;
  if (!appState.retViewer) {
    const canvas = $("#retargetCanvas");
    if (!canvas) return;
    appState.retViewer = new RetargetViewer(canvas);
  }
  const cInfo = charInfo(task.stage5?.characterId || task.characterId || "xbot");
  const statusEl = $("#s5ViewerStatus");
  const statusTxt = $("#s5ViewerStatusText");
  try {
    const res = await appState.retViewer.load({
      modelUrl: cInfo.modelUrl,
      clipUrl: task.stage5.mixamoGlb.url,
      hipsScale: cInfo.hipsScale,
      onStatus: (txt) => {
        viewerLoadingText = txt || "";
        updateGlobalBusyUI();
        if (statusTxt) statusTxt.textContent = txt || "";
        else statusEl.textContent = txt || "";
        statusEl.classList.toggle("hidden", !txt);
      },
    });
    if (res && res.duration > 0) {
      appState.retDuration = res.duration;
      $("#s5RetScrub").max = String(res.duration);
      setRetargetTime(appState.retTime % res.duration);
    }
  } catch (err) {
    viewerLoadingText = "";
    updateGlobalBusyUI();
    if (statusTxt) statusTxt.textContent = `3D 加载失败：${err.message}`;
    else statusEl.textContent = `3D 加载失败：${err.message}`;
    statusEl.classList.remove("hidden");
  }
}

function setRetargetTime(t) {
  const dur = appState.retDuration || 10;
  const clamped = Math.max(0, Math.min(dur, t));
  appState.retTime = clamped;
  const v = $("#vidRetargetOrig");
  if (v && v.getAttribute("src") && !v.classList.contains("hidden")) {
    if (Math.abs((v.currentTime || 0) - clamped) > 0.04) v.currentTime = clamped;
  }
  appState.retViewer?.setTime(clamped);
  $("#s5RetScrub").value = String(clamped);
  $("#s5RetTime").textContent = `${clamped.toFixed(2)} / ${dur.toFixed(2)} s`;
}

function retargetClockLoop(ts) {
  requestAnimationFrame(retargetClockLoop);
  if (!appState.retPlaying || appState.activeStage !== 5) {
    appState.retRafLast = ts;
    return;
  }
  const dt = Math.min(0.1, (ts - (appState.retRafLast || ts)) / 1000) * appState.retRate;
  appState.retRafLast = ts;
  const v = $("#vidRetargetOrig");
  if (v && v.getAttribute("src") && !v.classList.contains("hidden") && !v.paused) {
    appState.retTime = v.currentTime;
    appState.retViewer?.setTime(v.currentTime);
    $("#s5RetScrub").value = String(v.currentTime);
    $("#s5RetTime").textContent = `${v.currentTime.toFixed(2)} / ${(v.duration || appState.retDuration).toFixed(2)} s`;
  } else {
    const dur = appState.retDuration || 10;
    const next = (appState.retTime + dt) % Math.max(dur, 0.01);
    setRetargetTime(next);
  }
}
requestAnimationFrame(retargetClockLoop);

/* --- Stage 06 · 修缮 --- */
function renderStage6(task) {
  const list = $("#s6IssueList");
  list.innerHTML = "";
  const issues = task.stage6?.issues || [];
  if (!issues.length) {
    list.innerHTML = `<div class="mwIssueEmpty">拖动上方画面定位问题帧，填表记录后派发 BlenderMCP</div>`;
  }
  for (const it of issues) {
    const row = document.createElement("div");
    row.className = `mwIssueRow ${it.status === "done" ? "done" : ""}`;
    row.innerHTML = `
      <span class="mwIssueFrame">${escapeHtml(it.frameRange || "全程")}</span>
      <span class="mwIssuePart">${escapeHtml(it.bodyPart || "全身")}</span>
      <span class="mwIssueDesc">${escapeHtml(it.description)}<small>${escapeHtml(it.targetFix || "")}</small></span>
      <span class="mwIssueActs">
        <button class="mwBtn mwSm" type="button" data-toggle-iss="${it.id}">${it.status === "done" ? "重开" : "已修"}</button>
        <button class="mwBtn mwSm mwDanger" type="button" data-del-iss="${it.id}">✕</button>
      </span>
    `;
    list.appendChild(row);
  }

  list.querySelectorAll("[data-toggle-iss]").forEach((b) => {
    b.onclick = async () => {
      const next = issues.map((x) =>
        x.id === b.dataset.toggleIss ? { ...x, status: x.status === "done" ? "open" : "done" } : x
      );
      const res = await api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ issues: next }) });
      replaceTask(res.task);
    };
  });
  list.querySelectorAll("[data-del-iss]").forEach((b) => {
    b.onclick = async () => {
      const next = issues.filter((x) => x.id !== b.dataset.delIss);
      const res = await api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ issues: next }) });
      replaceTask(res.task);
    };
  });

  const latestRefine = (task.stage6?.runs || [])[0];
  if (latestRefine) {
    $("#s6RefineLogs").textContent =
      `[${latestRefine.status}] ${latestRefine.commandTemplate}\n` + (latestRefine.logs || []).join("\n");
  }
  updateStage6Tabs();
}

function updateStage6Tabs() {
  $$(".mwSubTab").forEach((b) => b.classList.toggle("active", b.dataset.s6tab === appState.s6Tab));
  $("#s6BriefPreview").classList.toggle("hidden", appState.s6Tab !== "brief");
  $("#s6RefineLogs").classList.toggle("hidden", appState.s6Tab !== "logs");
}

function replaceTask(updated) {
  const idx = appState.tasks.findIndex((t) => t.id === updated.id);
  if (idx >= 0) appState.tasks[idx] = updated;
  else appState.tasks.unshift(updated);
  renderAll();
}

function renderAll() {
  renderSystemAggregated();
  renderTaskList();
  renderTaskDetail();
  updateGlobalBusyUI();
}

/* --- 积分确认弹窗 --- */
function openCreditConfirm(html, onApprove) {
  $("#creditModalBody").innerHTML = html;
  appState.pendingCreditAction = onApprove;
  $("#creditModal").classList.remove("hidden");
}
const closeCreditModal = () => {
  $("#creditModal").classList.add("hidden");
  appState.pendingCreditAction = null;
};
$("#btnCancelCredit").onclick = closeCreditModal;
$("#btnAbortCredit").onclick = closeCreditModal;
$("#btnApproveCredit").onclick = async () => {
  const fn = appState.pendingCreditAction;
  closeCreditModal();
  if (fn) await fn();
};

/* --- Stage 1 / 2 / 3 / 4 / 5 / 6 动作绑定 --- */
function gotoStage(n) {
  appState.activeStage = Number(n);
  renderStageRail(currentTask());
}

$$(".mwFilterBtn").forEach((btn) => {
  btn.onclick = () => {
    appState.routeFilter = btn.dataset.filter;
    const list = filteredTasks();
    if (!list.some((t) => t.id === appState.selectedTaskId) && list[0]) {
      appState.selectedTaskId = list[0].id;
    }
    renderAll();
  };
});

$$(".mwStep").forEach((btn) => {
  btn.onclick = () => gotoStage(btn.dataset.stage);
});
$$("[data-goto]").forEach((btn) => {
  btn.onclick = () => gotoStage(btn.dataset.goto);
});
$$(".mwSubTab").forEach((btn) => {
  btn.onclick = () => {
    appState.s6Tab = btn.dataset.s6tab;
    updateStage6Tabs();
  };
});

// Stage 1 approve
$("#btnApproveStage1").onclick = async () => {
  const task = currentTask();
  if (!task) return;
  if (task.routeType === "mixamo") return gotoStage(5);
  const res = await api(`/api/tasks/${task.id}/stage1/approve`, {
    method: "POST",
    body: JSON.stringify({ status: "approved" }),
  });
  replaceTask(res.task);
  toast("白盒走位已确认");
  gotoStage(2);
};

// Stage 2: quote & run a specific storyboard shot using the selected provider
async function quoteAndRunStoryboardShot(task, shotId) {
  const providerId = activeImageProviderId();
  const prov = getProviderInfo(providerId);
  const sh = (task.storyboard?.shots || []).find((s) => s.id === shotId);

  if (!prov.ready) {
    toast(`${prov.name} 当前未就绪：${prov.detail}`, 4200);
    setSystemDrawer(true, "config");
    return;
  }

  try {
    if (providerId === "seedream") {
      toast("查询 Seedream 报价…");
      const q = await api(`/api/tasks/${task.id}/stage2/shot/${encodeURIComponent(shotId)}/quote`, {
        method: "POST",
        body: JSON.stringify({ provider: "seedream", ratio: "16:9" }),
      });
      openCreditConfirm(
        `使用 <strong>Seedream</strong>（${escapeHtml(q.quote.model)} · ${escapeHtml(q.quote.resolution || "2K")} · 16:9）生成分镜 <strong>${escapeHtml(sh?.code || shotId)} · ${escapeHtml(sh?.role || "")}</strong><br>上限消耗：<strong class="mwGold">${q.quote.maxCredits} 积分</strong>`,
        async () => {
          const res = await api(`/api/tasks/${task.id}/stage2/shot/${encodeURIComponent(shotId)}/run`, {
            method: "POST",
            body: JSON.stringify({
              provider: "seedream",
              model: q.quote.model,
              nodeId: q.quote.nodeId,
              creditCeiling: q.quote.maxCredits,
            }),
          });
          replaceTask(res.task);
          toast("Seedream 分镜已提交生成");
        }
      );
    } else {
      toast(`已提交至 ${prov.name} 生成 ${sh?.code || shotId}…`);
      const res = await api(`/api/tasks/${task.id}/stage2/shot/${encodeURIComponent(shotId)}/run`, {
        method: "POST",
        body: JSON.stringify({ provider: providerId }),
      });
      replaceTask(res.task);
    }
  } catch (err) {
    toast(err.message, 4500);
  }
}

$("#btnGenNextShot").onclick = () => {
  const task = currentTask();
  if (!task) return;
  const next = (task.storyboard?.shots || []).find((s) => s.status !== "succeeded");
  if (!next) return toast("当前分镜已全部生成");
  quoteAndRunStoryboardShot(task, next.id);
};

async function triggerSeedanceFromStoryboard() {
  const task = currentTask();
  if (!task) return;
  try {
    await api(`/api/tasks/${task.id}/stage2/approve`, {
      method: "POST",
      body: JSON.stringify({ approved: true }),
    });
    const model = task.stage3?.modelPreset || "seedance_2.5_flash";
    const resolution = task.storyboard?.qualityPreset || "720p";
    const duration = task.durationSec || 10;

    if (model === "minimax_h3_colab") {
      toast("已提交至 Colab 96G G4 运行 MiniMax-H3（0 积分）…");
      const res = await api(`/api/tasks/${task.id}/stage3/run`, {
        method: "POST",
        body: JSON.stringify({ model, resolution, duration, ratio: "16:9" }),
      });
      replaceTask(res.task);
      gotoStage(3);
      return;
    }

    toast("查询 Seedance 报价…");
    const q = await api(`/api/tasks/${task.id}/stage3/quote`, {
      method: "POST",
      body: JSON.stringify({ model, resolution, duration, ratio: "16:9" }),
    });
    openCreditConfirm(
      `按已确认分镜生成 <strong>1 条视频</strong>（${escapeHtml(q.quote.model)} · ${q.quote.mode} · ${q.quote.resolution} · ${q.quote.duration}s）<br>上限消耗：<strong class="mwGold">${q.quote.maxCredits} 积分</strong>`,
      async () => {
        const res = await api(`/api/tasks/${task.id}/stage3/run`, {
          method: "POST",
          body: JSON.stringify({
            model,
            resolution,
            duration,
            nodeId: q.quote.nodeId,
            creditCeiling: q.quote.maxCredits,
          }),
        });
        replaceTask(res.task);
        gotoStage(3);
        toast("已送入 Seedance 生成");
      }
    );
  } catch (err) {
    toast(err.message, 4800);
  }
}

$("#btnApproveAndSeedance").onclick = triggerSeedanceFromStoryboard;
$("#btnStage3Gen").onclick = triggerSeedanceFromStoryboard;
$("#btnStage3GenCenter").onclick = triggerSeedanceFromStoryboard;

async function handleUploadMp4(e) {
  const task = currentTask();
  const file = e.target.files?.[0];
  if (!task || !file) return;
  try {
    toast(`导入 ${file.name}…`);
    const buf = await file.arrayBuffer();
    const res = await fetch(
      `./api/tasks/${encodeURIComponent(task.id)}/stage3/upload?filename=${encodeURIComponent(file.name)}`,
      { method: "POST", body: buf }
    );
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    replaceTask(data.task);
    toast(`已导入 ${file.name}`);
  } catch (err) {
    toast(err.message, 4500);
  } finally {
    e.target.value = "";
  }
}
$("#inputUploadMp4").onchange = handleUploadMp4;
$("#inputUploadMp4Alt").onchange = handleUploadMp4;

// Stage 4 controls
function s4Videos() {
  return [$("#vidOrig"), $("#vidOverlay"), $("#vidWorld")].filter((v) => v && v.getAttribute("src"));
}
function updateS4TimeUi() {
  const v = $("#vidOrig");
  const cur = v?.currentTime || 0;
  const dur = v?.duration || 10;
  $("#s4Scrub").max = String(dur || 10);
  $("#s4Scrub").value = String(cur);
  $("#syncTimeDisplay").textContent = `${cur.toFixed(2)} / ${dur.toFixed(2)} s`;
  $("#btnSyncPlay").textContent = v && !v.paused ? "❚❚ 暂停" : "▶ 播放";
}
function seekS4(t) {
  for (const v of s4Videos()) {
    v.pause();
    v.currentTime = Math.max(0, Math.min(v.duration || 10, t));
  }
  updateS4TimeUi();
}
$("#btnSyncPlay").onclick = () => {
  const vids = s4Videos();
  if (!vids.length) return;
  const shouldPlay = vids[0].paused;
  const t = vids[0].currentTime;
  for (const v of vids) {
    v.currentTime = t;
    if (shouldPlay) v.play().catch(() => {});
    else v.pause();
  }
  setTimeout(updateS4TimeUi, 40);
};
$("#btnStepBack").onclick = () => seekS4(($("#vidOrig").currentTime || 0) - 1 / 30);
$("#btnStepFwd").onclick = () => seekS4(($("#vidOrig").currentTime || 0) + 1 / 30);
$("#s4Scrub").oninput = (e) => seekS4(Number(e.target.value));
$("#selSyncRate").onchange = (e) => {
  const r = Number(e.target.value);
  for (const v of s4Videos()) v.playbackRate = r;
};
$("#vidOrig").addEventListener("loadedmetadata", updateS4TimeUi);
$("#vidOrig").addEventListener("timeupdate", updateS4TimeUi);
$("#vidOrig").addEventListener("pause", updateS4TimeUi);
$("#vidOrig").addEventListener("play", updateS4TimeUi);

async function triggerStage4Run() {
  const task = currentTask();
  if (!task) return;
  try {
    toast("已提交云端 GPU 提骨…");
    const res = await api(`/api/tasks/${task.id}/stage4/submit`, {
      method: "POST",
      body: JSON.stringify({ cameraMode: "static", useContactIk: true, exportFbxAndGlb: true }),
    });
    replaceTask(res.task);
  } catch (err) {
    toast(err.message, 4800);
    if (String(err.message).includes("Modal")) setSystemDrawer(true);
  }
}
$("#btnStage4Run").onclick = triggerStage4Run;
$("#btnStage4RunCenter").onclick = triggerStage4Run;

$("#btnApproveStage4").onclick = async () => {
  const task = currentTask();
  if (!task) return;
  try {
    const res = await api(`/api/tasks/${task.id}/stage4/approve`, { method: "POST", body: "{}" });
    replaceTask(res.task);
    gotoStage(5);
    toast("提骨已通过，已自动生成 Mixamo 重定向预览");
  } catch (err) {
    toast(err.message, 4500);
  }
};

// Stage 5 controls (Retarget QA + 3D viewer)
$("#btnRetPlay").onclick = () => {
  appState.retPlaying = !appState.retPlaying;
  $("#btnRetPlay").textContent = appState.retPlaying ? "❚❚ 暂停" : "▶ 播放";
  const v = $("#vidRetargetOrig");
  if (v && v.getAttribute("src") && !v.classList.contains("hidden")) {
    v.playbackRate = appState.retRate;
    if (appState.retPlaying) {
      v.currentTime = appState.retTime;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }
};
$("#btnRetBack").onclick = () => {
  appState.retPlaying = false;
  $("#btnRetPlay").textContent = "▶ 播放";
  $("#vidRetargetOrig")?.pause();
  setRetargetTime(appState.retTime - 1 / 30);
};
$("#btnRetFwd").onclick = () => {
  appState.retPlaying = false;
  $("#btnRetPlay").textContent = "▶ 播放";
  $("#vidRetargetOrig")?.pause();
  setRetargetTime(appState.retTime + 1 / 30);
};
$("#s5RetScrub").oninput = (e) => {
  appState.retPlaying = false;
  $("#btnRetPlay").textContent = "▶ 播放";
  $("#vidRetargetOrig")?.pause();
  setRetargetTime(Number(e.target.value));
};
$("#selRetRate").onchange = (e) => {
  appState.retRate = Number(e.target.value);
  const v = $("#vidRetargetOrig");
  if (v) v.playbackRate = appState.retRate;
};

$$(".mwCamBtn[data-cam]").forEach((btn) => {
  btn.onclick = () => {
    $$(".mwCamBtn[data-cam]").forEach((x) => x.classList.toggle("active", x === btn));
    appState.retViewer?.setCameraPreset(btn.dataset.cam);
  };
});
$("#btnToggleSkel").onclick = () => {
  const on = !$("#btnToggleSkel").classList.contains("active");
  $("#btnToggleSkel").classList.toggle("active", on);
  appState.retViewer?.setShowSkeleton(on);
};

$("#btnRunRetarget").onclick = async () => {
  const task = currentTask();
  if (!task) return;
  try {
    toast("重新重定向 SOMA-77 → Mixamo X Bot…");
    const res = await api(`/api/tasks/${task.id}/stage5/retarget`, {
      method: "POST",
      body: JSON.stringify({ characterId: task.stage5?.characterId || task.characterId }),
    });
    if (appState.retViewer) {
      appState.retViewer.clipCache.clear();
      appState.retViewer.currentClipUrl = null;
    }
    replaceTask(res.task);
    toast("Mixamo 重定向已刷新");
  } catch (err) {
    toast(err.message, 4500);
  }
};

$("#btnApproveRetarget").onclick = async () => {
  const task = currentTask();
  if (!task) return;
  const res = await api(`/api/tasks/${task.id}/stage5/approve`, {
    method: "POST",
    body: JSON.stringify({ status: "approved", characterId: task.stage5?.characterId || task.characterId }),
  });
  replaceTask(res.task);
  toast("二次验收通过，已标记可入库");
};

$("#btnSendToRefine").onclick = async () => {
  const task = currentTask();
  if (!task) return;
  const res = await api(`/api/tasks/${task.id}/stage5/approve`, {
    method: "POST",
    body: JSON.stringify({ status: "needs_refine", characterId: task.stage5?.characterId || task.characterId }),
  });
  replaceTask(res.task);
  gotoStage(6);
};

// Stage 6 controls
function s6Videos() {
  return [$("#vidRefOrig"), $("#vidRefOverlay")].filter((v) => v && v.getAttribute("src"));
}
function updateS6TimeUi() {
  const v = $("#vidRefOrig");
  const cur = v?.currentTime || 0;
  const dur = v?.duration || 10;
  $("#s6Scrub").max = String(dur || 10);
  $("#s6Scrub").value = String(cur);
  $("#s6FrameDisplay").textContent = `F${String(Math.round(cur * 30)).padStart(3, "0")}`;
  $("#btnRefPlay").textContent = v && !v.paused ? "❚❚" : "▶";
}
$("#btnRefPlay").onclick = () => {
  const vids = s6Videos();
  if (!vids.length) return;
  const shouldPlay = vids[0].paused;
  const t = vids[0].currentTime;
  for (const v of vids) {
    v.currentTime = t;
    if (shouldPlay) v.play().catch(() => {});
    else v.pause();
  }
  setTimeout(updateS6TimeUi, 40);
};
$("#s6Scrub").oninput = (e) => {
  const t = Number(e.target.value);
  for (const v of s6Videos()) {
    v.pause();
    v.currentTime = t;
  }
  updateS6TimeUi();
};
$("#vidRefOrig").addEventListener("loadedmetadata", updateS6TimeUi);
$("#vidRefOrig").addEventListener("timeupdate", updateS6TimeUi);
$("#btnMarkFrame").onclick = () => {
  const f = Math.round(($("#vidRefOrig").currentTime || 0) * 30);
  const el = $("#issFrames");
  el.value = !el.value.trim() || el.value.includes("-") ? `${f}-${f + 30}` : `${el.value.trim()}-${f}`;
  el.focus();
};

$("#btnAddIssue").onclick = async () => {
  const task = currentTask();
  if (!task) return;
  const desc = $("#issDesc").value.trim();
  if (!desc) return toast("请填写问题");
  const next = [
    ...(task.stage6?.issues || []),
    {
      id: `iss_${Date.now().toString(36)}`,
      frameRange: $("#issFrames").value.trim() || "全程",
      bodyPart: $("#issPart").value.trim() || "全身",
      description: desc,
      targetFix: $("#issFix").value.trim() || "贴合原视频",
      status: "open",
    },
  ];
  const res = await api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ issues: next }) });
  $("#issDesc").value = "";
  $("#issFix").value = "";
  replaceTask(res.task);
};

$("#btnGenBrief").onclick = async () => {
  const task = currentTask();
  if (!task) return;
  try {
    const res = await api(`/api/tasks/${task.id}/stage6/brief`, { method: "POST", body: "{}" });
    $("#s6BriefPreview").textContent = res.briefText;
    appState.s6Tab = "brief";
    replaceTask(res.task);
    toast("任务单已生成");
  } catch (err) {
    toast(err.message, 4000);
  }
};

$("#btnCopyBrief").onclick = async () => {
  await navigator.clipboard.writeText($("#s6BriefPreview").textContent);
  toast("已复制");
};

$("#btnDispatchRefine").onclick = async () => {
  const task = currentTask();
  if (!task) return;
  try {
    const res = await api(`/api/tasks/${task.id}/stage6/dispatch`, { method: "POST", body: "{}" });
    $("#s6BriefPreview").textContent = res.briefText;
    appState.s6Tab = "logs";
    replaceTask(res.task);
    toast("已派发 BlenderMCP 修缮");
  } catch (err) {
    toast(err.message, 4500);
  }
};

/* --- 系统抽屉 --- */
$("#btnSystem").onclick = () => setSystemDrawer(!appState.sysOpen);
$("#btnCloseSys").onclick = () => setSystemDrawer(false);
$("#sysBackdrop").onclick = () => setSystemDrawer(false);
$("#btnOpenSysFromRun").onclick = () => setSystemDrawer(true, "overview");
$("#btnS2ProviderCfg").onclick = () => setSystemDrawer(true, "config");
$("#kpiGpuCard").onclick = () => setSystemDrawer(true, "config");
$$(".mwSysTab").forEach((b) => {
  b.onclick = () => setSysTab(b.dataset.systab);
});
$$("[data-jump-systab]").forEach((b) => {
  b.onclick = () => setSysTab(b.dataset.jumpSystab);
});
$("#btnCopySysLogs").onclick = async () => {
  await navigator.clipboard.writeText($("#s4Logs").textContent);
  toast("日志已复制");
};
$("#btnRefreshSys").onclick = async () => {
  try {
    toast("刷新服务与引擎状态…");
    const data = await api("/api/bootstrap?refresh=1");
    appState.config = data.config;
    appState.dreamina = data.dreamina;
    appState.cloud = data.cloud;
    appState.imageProviders = data.imageProviders || [];
    appState.recentLogs = data.recentLogs || [];
    appState.host = data.host;
    populateConfigInputs();
    renderAll();
    toast("已刷新");
  } catch (err) {
    toast(err.message, 4000);
  }
};
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && appState.sysOpen) setSystemDrawer(false);
});

$("#btnOpenWorkspace").onclick = async () => {
  const task = currentTask();
  if (!appState.host) return;
  const target = task ? `${appState.host.workspaceDir}\\tasks\\${task.id}` : appState.host.workspaceDir;
  await api("/api/open-folder", { method: "POST", body: JSON.stringify({ path: target }) });
};

$$("#dreaminaProfileRow .mwAccBtn").forEach((b) => {
  b.onclick = async () => {
    try {
      toast(`切换即梦账号至 ${b.dataset.dprof}…`);
      const res = await api("/api/dreamina/profile", {
        method: "POST",
        body: JSON.stringify({ profile: b.dataset.dprof }),
      });
      appState.config = res.config;
      appState.dreamina = res.dreamina;
      appState.imageProviders = res.imageProviders || appState.imageProviders;
      renderAll();
      toast(res.dreamina?.loggedIn ? `已切换：${res.dreamina.displayName}（${res.dreamina.availableCredits} 积分）` : `已切至 ${b.dataset.dprof}（未登录，点右侧登录）`);
    } catch (err) {
      toast(err.message, 4500);
    }
  };
});
$("#btnDreaminaLogin").onclick = async () => {
  try {
    const profile = appState.config?.dreaminaProfile || "default";
    await api("/api/dreamina/login", { method: "POST", body: JSON.stringify({ profile }) });
    toast(`已为 ${profile} 打开即梦登录页，扫码完成后点右上角「刷新」`, 5000);
  } catch (err) {
    toast(err.message, 4500);
  }
};
$("#btnColabLogin").onclick = async () => {
  try {
    toast("正在向 Colab CLI 获取 Google 授权链接…");
    const res = await api("/api/cloud/colab/login", { method: "POST", body: "{}" });
    if (res.alreadyLoggedIn) {
      appState.cloud = res.cloud;
      renderAll();
      toast("Colab CLI 已处于登录状态");
      return;
    }
    if (res.authUrl) {
      $("#colabAuthLink").href = res.authUrl;
      $("#colabAuthBox").classList.remove("hidden");
      $("#inputColabAuthCode").value = "";
      $("#inputColabAuthCode").focus();
      window.open(res.authUrl, "_blank", "noopener");
      toast("已打开 Google 授权页，同意后把授权码贴回此处", 5000);
    }
  } catch (err) {
    toast(err.message, 5000);
  }
};
$("#btnSubmitColabCode").onclick = async () => {
  const code = $("#inputColabAuthCode").value.trim();
  if (!code) return toast("请先粘贴 Google 返回的授权码");
  try {
    toast("正在提交授权码并保存凭据…");
    const res = await api("/api/cloud/colab/auth-code", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    appState.cloud = res.cloud;
    $("#colabAuthBox").classList.add("hidden");
    renderAll();
    toast("Colab Pro+ 授权成功！");
  } catch (err) {
    toast(err.message, 5000);
  }
};
$("#btnColabStopGpu").onclick = async () => {
  try {
    const res = await api("/api/cloud/colab/stop", { method: "POST", body: "{}" });
    appState.cloud = res.cloud;
    renderAll();
    toast(res.stopped?.length ? `已释放 Colab 会话：${res.stopped.join(", ")}` : "当前无活跃 Colab 会话");
  } catch (err) {
    toast(err.message, 4500);
  }
};
$("#btnSaveConfig").onclick = async () => {
  try {
    $("#cfgTestStatus").textContent = "保存并探测中…";
    const res = await api("/api/config", {
      method: "POST",
      body: JSON.stringify({
        storyboardImageProvider: $("#cfgImageProvider").value,
        seedreamModel: $("#cfgSeedreamModel").value,
        cursorCliPath: $("#cfgCursorPath").value.trim(),
        cursorGrokModel: $("#cfgCursorModel").value.trim() || "grok-4.7-xhigh",
        codexCliPath: $("#cfgCodexPath").value.trim() || "codex",
        codexModel: $("#cfgCodexModel").value.trim(),
        openaiApiKey: $("#cfgOpenAiKey").value.trim(),
        openaiBaseUrl: $("#cfgOpenAiBase").value.trim() || "https://api.openai.com",
        openaiImageModel: $("#cfgOpenAiModel").value.trim() || "gpt-image-1",
        mocapBackend: $("#cfgMocapBackend").value,
        colabCliPath: $("#cfgColabPath").value.trim(),
        colabAutoStopSec: Math.max(0, Number($("#cfgColabAutoStop").value.trim() || 180)),
        modalBaseUrl: $("#cfgModalUrl").value.trim(),
        modalApiToken: $("#cfgModalToken").value.trim(),
        dreaminaCliPath: $("#cfgDreaminaPath").value.trim(),
        exportMirrorDir: $("#cfgExportMirror").value.trim(),
        refineCommandTemplate: $("#cfgRefineCmd").value.trim(),
      }),
    });
    appState.config = res.config;
    appState.dreamina = res.dreamina || appState.dreamina;
    appState.cloud = res.cloud;
    appState.imageProviders = res.imageProviders || appState.imageProviders;
    populateConfigInputs();
    renderAll();
    $("#cfgTestStatus").textContent = res.cloud.online
      ? `已保存 · Modal 在线 (${res.cloud.latencyMs}ms)`
      : `已保存 · ${res.cloud.message}`;
  } catch (err) {
    $("#cfgTestStatus").textContent = err.message;
  }
};

/* --- 启动 --- */
$("#topBusyPill").onclick = () => {
  const tid = $("#topBusyPill").dataset.taskId;
  const stg = Number($("#topBusyPill").dataset.stage || 0);
  if (tid) appState.selectedTaskId = tid;
  if (stg >= 1 && stg <= 6) appState.activeStage = stg;
  renderAll();
};
$("#btnS4FixColabLogin").onclick = () => {
  setSystemDrawer(true, "overview");
  $("#btnColabLogin")?.click();
};
$("#btnS4RetryFromFail").onclick = () => $("#btnStage4Run")?.click();
$("#btnS4OpenLogs").onclick = () => setSystemDrawer(true, "logs");

async function boot() {
  try {
    const data = await api("/api/bootstrap");
    appState.config = data.config;
    appState.tasks = data.tasks;
    appState.characters = data.characters || [];
    appState.floorplan = data.floorplan || null;
    appState.dreamina = data.dreamina;
    appState.cloud = data.cloud;
    appState.imageProviders = data.imageProviders || [];
    appState.recentLogs = data.recentLogs || [];
    appState.host = data.host;
    appState.selectedTaskId = filteredTasks()[0]?.id || data.tasks[0]?.id || null;
    appState.activeStage = 5;
    populateConfigInputs();
    renderAll();
  } finally {
    $("#bootOverlay")?.classList.add("hidden");
    updateGlobalBusyUI();
  }

  setInterval(async () => {
    const anyActive = appState.tasks.some(
      (t) =>
        (t.storyboard?.shots || []).some((s) => s.status === "running") ||
        (t.stage3?.takes || []).some((x) => x.status === "running") ||
        (t.stage4?.runs || []).some((r) => r.status === "queued" || r.status === "running") ||
        (t.stage6?.runs || []).some((r) => r.status === "running")
    );
    if (!anyActive) return;
    try {
      const [tasksRes, bootRes] = await Promise.all([
        api("/api/tasks", { silent: true }),
        api("/api/bootstrap", { silent: true }),
      ]);
      appState.tasks = tasksRes.tasks;
      appState.dreamina = bootRes.dreamina;
      appState.recentLogs = bootRes.recentLogs || [];
      renderAll();
    } catch {}
  }, 2500);
}

boot().catch((err) => {
  $("#bootOverlay")?.classList.add("hidden");
  updateGlobalBusyUI();
  toast(err.message, 6000);
});
