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
  schedule: null,
  recentLogs: [],
  host: null,
  routeFilter: "mocap", // "mocap" | "all" | "mixamo"
  selectedTaskId: null,
  inspectedTakeByTask: {},
  activeStage: 5,
  s6Tab: "brief",
  sysTab: "overview",
  sysOpen: false,
  schOpen: false,
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

  // Only surface the top-bar busy pill for background jobs NOT already visible in the active canvas
  const viewingTask = currentTask();
  const viewingSameStage =
    bgTarget && viewingTask && viewingTask.id === bgTarget.taskId && appState.activeStage === bgTarget.stage;
  const pillLabel = (!viewingSameStage ? bgLabel : "") || viewerLoadingText || (inflightApiCount > 0 ? "请求处理中…" : "");
  const barBusy = Boolean(bgLabel || viewerLoadingText || inflightApiCount > 0);
  if (bar) bar.classList.toggle("active", barBusy);
  if (pill && pillText) {
    pill.classList.toggle("hidden", !pillLabel);
    if (pillLabel) pillText.textContent = pillLabel;
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
  label.textContent = "系统";
  if (runningRun) {
    dot.className = "mwDot busy";
  } else if (d?.loggedIn && c?.online) {
    dot.className = "mwDot ok";
  } else {
    dot.className = "mwDot warn";
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
  const balRow = $("#sysColabBalanceRow");
  const balEl = $("#sysColabBalance");
  const rateEl = $("#sysColabRate");
  if (balRow) balRow.classList.toggle("hidden", !isColab);
  if (isColab) {
    if (c?.online) {
      const balNum = c.balance != null ? Number(c.balance) : null;
      if (balEl) balEl.textContent = balNum != null && Number.isFinite(balNum) ? balNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
      if (rateEl) {
        const r = c.hourlyRate != null ? Number(c.hourlyRate) : 0;
        rateEl.textContent = r > 0 ? `消耗 ${r.toFixed(2)} / 时` : "当前 0.00 / 时";
        rateEl.classList.toggle("isBurning", r > 0);
      }
      $("#kpiGpuState").textContent = balNum != null ? `${balNum} 单元` : c.activeJobs > 0 ? "运行中" : "已就绪";
      $("#kpiGpuSub").textContent = c.activeJobs > 0 ? `${c.activeJobs} 个活跃会话 · v${c.version || "0.8"}` : `Colab CLI v${c.version || "0.8"} · 已连接`;
    } else if (c?.installed) {
      if (balEl) balEl.textContent = "—";
      if (rateEl) { rateEl.textContent = "未授权"; rateEl.classList.remove("isBurning"); }
      $("#kpiGpuState").textContent = "Colab CLI";
      $("#kpiGpuSub").textContent = "待授权登录";
    } else {
      if (balEl) balEl.textContent = "—";
      if (rateEl) { rateEl.textContent = "未安装"; rateEl.classList.remove("isBurning"); }
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

/* --- 左栏：参照角色制作管线（ModelWorkbench）的卡片式任务卡 + 重定向 3D 封面 --- */
const CARD_STEP_LABELS = ["白盒", "分镜", "视频", "提骨", "重定"];

function taskStatusMeta(task, st) {
  const activeRun = activeMocapRun(task);
  if (activeRun && (activeRun.status === "running" || activeRun.status === "queued")) {
    return { text: `提骨中 ${activeRun.progress ?? 0}%`, state: "running" };
  }
  if ((task.stage3?.takes || []).some((x) => x.status === "running")) {
    return { text: "生成视频中", state: "running" };
  }
  if ((task.storyboard?.shots || []).some((s) => s.status === "running")) {
    return { text: "分镜出图中", state: "running" };
  }
  if (activeRun?.status === "failed" && !task.stage5?.mixamoGlb?.url) {
    return { text: "提骨失败", state: "failed" };
  }
  if (task.stage5?.status === "approved") return { text: "已入库", state: "done" };
  if (task.stage5?.mixamoGlb?.url) return { text: "待二验", state: "ready" };
  if ((task.stage3?.takes || []).some((x) => x.status === "succeeded")) return { text: "待提骨", state: "ready" };
  if ((task.storyboard?.shots || []).some((s) => s.status === "succeeded")) return { text: "待出视频", state: "idle" };
  return { text: "待分镜", state: "idle" };
}

function renderTaskList() {
  const list = filteredTasks();
  $("#taskCountBadge").textContent = `${list.length} / ${appState.tasks.length}`;

  $$(".mwFilterBtn").forEach((b) => b.classList.toggle("active", b.dataset.filter === appState.routeFilter));

  const box = $("#taskList");
  box.innerHTML = "";
  for (const task of list) {
    const st = stageStates(task);
    const isMixamo = task.routeType === "mixamo";
    const activeRun = activeMocapRun(task);
    const statusMeta = taskStatusMeta(task, st);

    // 封面优先级：重定向 3D 角色动画封面 > 概念图 > 首张已生成分镜图 > 极简占位
    const coverUrl = task.retargetCoverUrl || task.conceptCoverUrl || task.storyboardCoverUrl || null;
    const coverTag = task.retargetCoverUrl
      ? { text: "3D 动画", cls: "is3d" }
      : isMixamo
      ? { text: "Mixamo", cls: "isMixamo" }
      : task.storyboardCoverUrl
      ? { text: "分镜", cls: "" }
      : { text: "GEM-X", cls: "" };

    // 计算每个管线节点状态（5 阶段：白盒 · 分镜 · 视频 · 提骨 · 重定）
    const st5 = st.slice(0, 5);
    const firstUndone = st5.findIndex((s) => !s.done);
    const nodesHtml = st5
      .map((s, idx) => {
        let nState = "pending";
        let mark = `${idx + 1}`;
        if (idx === 3 && activeRun?.status === "failed" && !s.done) {
          nState = "failed";
          mark = "!";
        } else if (s.running) {
          nState = "current";
          mark = "●";
        } else if (s.done) {
          nState = "done";
          mark = "✓";
        } else if (idx === firstUndone) {
          nState = "current";
          mark = "·";
        }
        return `<span class="mwNode" data-state="${nState}"><span class="mwNodeMark">${mark}</span><span>${CARD_STEP_LABELS[idx]}</span></span>`;
      })
      .join("");

    const schItems = (appState.schedule?.items || []).filter(
      (x) => x.taskId === task.id && (x.status === "pending" || x.status === "running")
    );
    const schSlot = schItems[0]?.scheduledTime || appState.schedule?.runTime || "06:00";
    const schKinds = schItems.map((x) => (x.kind === "stage4_mocap" ? "提骨" : "H3 视频")).join(" + ");
    const schBadgeHtml = schItems.length
      ? `<div class="mwCoverSchRibbon" title="已加入定时队列"><span>⏱ 已入队 · ${escapeHtml(schSlot)}</span><span>${escapeHtml(schKinds)}</span></div>`
      : "";
    const card = document.createElement("button");
    card.type = "button";
    card.className = `mwActionCard ${task.id === appState.selectedTaskId ? "active" : ""} ${schItems.length ? "isQueuedCard" : ""}`;
    card.innerHTML = `
      <div class="mwCoverSlot">
        ${coverUrl ? `<img src="${coverUrl}" alt="${escapeHtml(task.title)}">` : `<span class="mwCoverPlaceholder">待生成封面</span>`}
        <span class="mwCoverBeat">${escapeHtml(task.beatCode || "")}</span>
        <span class="mwCoverTag ${coverTag.cls}">${coverTag.text}</span>
        ${schBadgeHtml}
      </div>
      <div class="mwCardInfo">
        <div class="mwCardHead">
          <div class="mwCardTitle">${escapeHtml(task.title)}</div>
          <span class="mwCardStatus" data-state="${statusMeta.state}">${escapeHtml(statusMeta.text)}</span>
        </div>
        <div class="mwNodeTrack">${nodesHtml}</div>
      </div>
    `;
    card.onclick = () => {
      appState.selectedTaskId = task.id;
      if (task.routeType === "mixamo") {
        appState.activeStage = 5;
      } else if (task.stage5?.mixamoGlb?.url) {
        appState.activeStage = 5;
      } else if (task.stage4?.runs?.some((r) => r.status === "running" || r.status === "queued" || r.status === "succeeded")) {
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
  const broken = Boolean(target && (el.error || (el.readyState === 0 && el.networkState === 3)));
  if (el.dataset.loadedUrl !== target || broken) {
    if (target) {
      el.src = target;
      el.load();
    } else {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    el.dataset.loadedUrl = target;
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
  const genAllBtn = $("#btnGenAllShots");
  if (genAllBtn) {
    const runningShots = shots.filter((s) => s.status === "running").length;
    const pendingShots = shots.filter((s) => s.status !== "succeeded").length;
    genAllBtn.disabled = !shots.length || runningShots > 0;
    if (!shots.length) {
      genAllBtn.textContent = "通用动作无需生成分镜";
    } else if (runningShots > 0) {
      genAllBtn.textContent = `分镜生成中（${shots.length - pendingShots} / ${shots.length}）…`;
    } else if (pendingShots > 0) {
      genAllBtn.textContent = `一键生成全部分镜图（待出 ${pendingShots} 张）`;
    } else {
      genAllBtn.textContent = `重抽全部分镜图（共 ${shots.length} 张）`;
    }
  }

  $("#s2TimelineTicks").innerHTML = shots
    .map((s) => `<span class="mwTick ${s.status === "succeeded" ? "on" : ""}">${escapeHtml(s.code)} · ${escapeHtml(s.timeRange)}</span>`)
    .join("");
}

/* --- 主任务渲染 --- */
function renderTaskDetail() {
  const task = currentTask();
  if (!task) return;
  const isMixamo = task.routeType === "mixamo";

  if ($("#topBeatCode")) $("#topBeatCode").textContent = task.beatCode || "—";
  if ($("#topTaskTitle")) $("#topTaskTitle").textContent = task.title;
  const pill = $("#topRouteTag");
  if (pill) {
    pill.textContent = isMixamo ? "Mixamo 复用" : "GEM-X 77骨定制";
    pill.className = `mwRoutePill ${isMixamo ? "mixamo" : "mocap"}`;
  }

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
    takes.find((t) => t.id === task.stage3.selectedTakeId && t.status === "succeeded") ||
    takes.find((t) => t.status === "succeeded") ||
    null;

  const inspectedId = appState.inspectedTakeByTask[task.id];
  const viewedTake =
    takes.find((t) => t.id === inspectedId) ||
    selectedTake ||
    takes.find((t) => t.status === "running") ||
    takes[0] ||
    null;

  function formatTakeLogHtml(line) {
    const raw = String(line || "");
    const safe = escapeHtml(raw);
    let cls = "";
    if (/ERROR|失败|Traceback|RuntimeError|Service Unavailable|503|超时/i.test(raw)) cls = "isErr";
    else if (/自动切换|重试|暂不可用|warn|排队/i.test(raw)) cls = "isWarn";
    else if (/已分配|复用热机|完成|就绪|回传|已下载|\[完成\]/i.test(raw)) cls = "isOk";
    let html = safe
      .replace(/^(\[\d\d:\d\d:\d\d\])/i, '<span class="lgCmd">$1</span>')
      .replace(/(\[MiniMax-H3[^\]]*\]|\[Colab CLI[^\]]*\])/i, '<span class="lgTag">$1</span>')
      .replace(/(\[Seedance[^\]]*\]|\[Dreamina[^\]]*\])/i, '<span class="lgTagBlue">$1</span>');
    return `<div class="mwLogLine ${cls}">${html}</div>`;
  }

  function inferTakeProgress(tk) {
    if (typeof tk?.progress === "number" && tk.progress > 0) return Math.max(0, Math.min(100, Math.round(tk.progress)));
    const txt = String(tk?.progressText || "");
    const mPct = /(\d{1,3})%/.exec(txt);
    if (mPct) return Math.max(5, Math.min(98, Number(mPct[1])));
    if (/回传|下载成片|download/i.test(txt)) return 92;
    if (/超分|RealESRGAN|1080p/i.test(txt)) return 86;
    if (/推理|ComfyUI|采样|FL2V|渲染|生成中/i.test(txt)) return 52;
    if (/权重|aria2|safetensors/i.test(txt)) return 28;
    if (/上传|已受理|submitId/i.test(txt)) return 20;
    return 10;
  }

  const showS3Video = Boolean(viewedTake?.status === "succeeded" && viewedTake?.url);
  const showS3Prog = Boolean(viewedTake?.status === "running");
  const showS3Fail = Boolean(viewedTake?.status === "failed");
  const showS3Empty = !showS3Video && !showS3Prog && !showS3Fail;

  $("#s3PlayerEmpty").classList.toggle("hidden", !showS3Empty);
  $("#s3ProgressCard").classList.toggle("hidden", !showS3Prog);
  $("#s3FailCard").classList.toggle("hidden", !showS3Fail);
  $("#s3MainVideo").classList.toggle("hidden", !showS3Video);
  $("#s3MainCap").classList.toggle("hidden", !showS3Video);

  if (showS3Video) {
    setVideoSrcIfChanged($("#s3MainVideo"), appState.activeStage === 3 ? viewedTake.url : "");
    $("#s3MainCap").textContent = `${viewedTake.label} · ${fmtSize(viewedTake.sizeBytes)}`;
  } else {
    setVideoSrcIfChanged($("#s3MainVideo"), "");
  }

  if (showS3Prog && viewedTake) {
    const isH3 = viewedTake.model === "minimax_h3_colab";
    const pct = inferTakeProgress(viewedTake);
    const engineTag = isH3
      ? `MiniMax-H3 · Colab 96G G4 · ${viewedTake.resolution || "720p"}`
      : `${viewedTake.model || "Seedance"} · 即梦画布 · ${viewedTake.resolution || "720p"}`;
    $("#s3ProgSpec").textContent = engineTag;
    $("#s3ProgTakeLabel").textContent = `${viewedTake.label}${viewedTake.nodeId ? ` · ${viewedTake.nodeId}` : ""}`;

    const elapsedSec = Math.max(0, Math.floor((Date.now() - Number(viewedTake.createdAt || Date.now())) / 1000));
    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    const ss = String(elapsedSec % 60).padStart(2, "0");
    $("#s3ProgElapsed").textContent = `已用时 ${mm}:${ss}`;

    const rawMsg = String(viewedTake.progressText || "云端生成中").replace(/…+$/, "");
    $("#s3LiveText").textContent = rawMsg;
    $("#s3LiveHint").textContent = isH3
      ? "首轮冷启需机房光纤拉取 44~61GB 权重（约 2~3 分钟），后续热机复用直跑 FL2V 推理"
      : "已交由即梦云端集群渲染，每 2.5 秒自动同步进度，完成后自动拉回本地";
    $("#s3LivePct").textContent = `${pct}%`;
    $("#s3LiveFill").style.width = `${pct}%`;

    const backBtn = $("#btnS3BackToVideo");
    if (backBtn) {
      backBtn.classList.toggle("hidden", !selectedTake?.url);
      backBtn.onclick = () => {
        if (selectedTake) {
          appState.inspectedTakeByTask[task.id] = selectedTake.id;
          renderAll();
        }
      };
    }

    const activeIdx = isH3
      ? pct < 16 ? 0 : pct < 56 ? 1 : pct < 86 ? 2 : 3
      : pct < 18 ? 0 : pct < 40 ? 1 : pct < 84 ? 2 : 3;
    const stageDefs = isH3
      ? [
          { title: "申请 96G G4", doneSub: "G4 运行时已就绪", curSub: "排队分配 / 复用热机", waitSub: "等待分配" },
          { title: "权重与首尾帧", doneSub: "模型与分镜就绪", curSub: "光纤直拉权重 / 上传分镜", waitSub: "等待 GPU 就绪" },
          { title: "FL2V 推理", doneSub: "视频采样完成", curSub: "ComfyUI 首尾帧生成中", waitSub: "等待权重就绪" },
          { title: "超分与回传", doneSub: "MP4 已落盘本地", curSub: viewedTake.resolution === "1080p" ? "RealESRGAN 2x 超分 + 回传" : "打包回传本地", waitSub: "等待推理完成" },
        ]
      : [
          { title: "提交分镜引用", doneSub: "分镜与参数已上传", curSub: "托管分镜至即梦画布", waitSub: "等待提交" },
          { title: "云端队列受理", doneSub: "已进入渲染队列", curSub: "等待即梦集群分配算力", waitSub: "等待受理" },
          { title: "Seedance 渲染", doneSub: "云端成片已生成", curSub: `${viewedTake.resolution || "720p"} · ${viewedTake.duration || 8}s 渲染中`, waitSub: "等待排班" },
          { title: "下载到本地", doneSub: "MP4 已落盘本地", curSub: "拉取成片至本地工作区", waitSub: "等待渲染完成" },
        ];
    $("#s3Milestones").innerHTML = stageDefs
      .map((d, i) => {
        const st = i < activeIdx ? "done" : i === activeIdx ? "current" : "pending";
        const mk = i < activeIdx ? "✓" : i === activeIdx ? "●" : `${i + 1}`;
        const sub = st === "done" ? d.doneSub : st === "current" ? d.curSub : d.waitSub;
        return `
          <div class="mwPipeTile" data-state="${st}">
            <div class="mwPipeTileHead"><span class="mwPipeIdx">${mk}</span><span>${d.title}</span></div>
            <div class="mwPipeTileSub">${escapeHtml(sub)}</div>
          </div>
        `;
      })
      .join("");

    const takeLogs = Array.isArray(viewedTake.logs) && viewedTake.logs.length
      ? viewedTake.logs
      : [viewedTake.progressText || "已提交云端，等待返回详细执行日志…"];
    $("#s3TermCount").textContent = `实时生成日志 · ${takeLogs.length} 行`;
    const termEl = $("#s3ProgLogs");
    termEl.innerHTML = takeLogs.slice(-50).map(formatTakeLogHtml).join("");
    termEl.scrollTop = termEl.scrollHeight;
    $("#btnCopyS3Logs").onclick = async () => {
      await navigator.clipboard.writeText(takeLogs.join("\n"));
      toast("已复制当前抽卡日志");
    };
  }

  function summarizeTakeError(tk) {
    const combined = [tk?.error || "", tk?.progressText || "", ...(tk?.logs || [])].join("\n");
    if (/未授权|authorization code|accounts\.google\.com\/o\/oauth2|去登录 Colab/i.test(combined)) {
      return {
        isColabAuth: true,
        title: "Colab CLI 尚未完成 Google 授权",
        hint: "请点击「去登录 Colab」在浏览器同意授权并贴回授权码后重试。",
      };
    }
    if (/Service Unavailable|503/i.test(combined)) {
      return {
        isColabAuth: false,
        title: "Google Colab 算力分配接口返回 503 Service Unavailable",
        hint: "Google Colab 的 /tun/m/assign 接口拒绝了 GPU 分配（机房满载或当前代理节点受限，你的算力点数未消耗）。建议切换代理节点（如美/日/新）后重试，或改用右侧 Seedance 引擎生成视频。",
      };
    }
    if (/Connection was lost/i.test(combined)) {
      return {
        isColabAuth: false,
        title: "Colab 云端会话中途断连（Connection was lost）",
        hint: "Colab GPU 运行时在执行中途与本机断开连接（常见于代理抖动或 Colab 回收实例），请重新抽卡或交由错峰队列自动顺延重试。",
      };
    }
    if (/ProxyError|SSLEOFError|SSLError|RemoteDisconnected|UNEXPECTED_EOF/i.test(combined)) {
      return {
        isColabAuth: false,
        title: "连接 Google Colab 时代理 / SSL 连接中断",
        hint: "请求 colab.research.google.com 时本机代理主动断开或 SSL EOF，请切换稳定代理节点后重试。",
      };
    }
    if (/超时|timed out|timeout/i.test(combined)) {
      return {
        isColabAuth: false,
        title: "云端执行或排队超时",
        hint: "云端算力排队或网络超时，可直接点击「重新抽 1 条视频」或在右侧切换引擎/分辨率后重试。",
      };
    }
    const raw = String(tk?.error || tk?.progressText || "视频生成失败").replace(/^失败[：:]\s*/, "");
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^[┌┐└┘│─\s]+$/.test(l) && !/^\[colab\] Creating session/i.test(l));
    const best =
      lines.find((l) => /(?:Error|Exception|失败|拒绝|不足)[:：]/i.test(l)) ||
      lines[lines.length - 1] ||
      "视频生成失败";
    return {
      isColabAuth: false,
      title: best.slice(0, 140),
      hint: "可查看下方原始执行日志排查具体报错，或直接删除此失败记录并重新抽卡。",
    };
  }

  if (showS3Fail && viewedTake) {
    const diag = summarizeTakeError(viewedTake);
    $("#s3FailTakeLabel").textContent = viewedTake.label;
    $("#s3FailTitle").textContent = diag.title;
    $("#s3FailHint").textContent = diag.hint;
    $("#btnS3FailColabLogin").classList.toggle("hidden", !diag.isColabAuth);
    const failBackBtn = $("#btnS3FailBackToVideo");
    if (failBackBtn) {
      failBackBtn.classList.toggle("hidden", !selectedTake?.url);
      failBackBtn.onclick = () => {
        if (selectedTake) {
          appState.inspectedTakeByTask[task.id] = selectedTake.id;
          renderAll();
        }
      };
    }
    $("#btnS3DeleteFromFail").onclick = async () => {
      try {
        const res = await api(`/api/tasks/${task.id}/stage3/takes/${viewedTake.id}`, { method: "DELETE" });
        delete appState.inspectedTakeByTask[task.id];
        replaceTask(res.task);
        toast("已删除该条失败记录");
      } catch (err) {
        toast(err.message, 3500);
      }
    };
    const rawLogs = (viewedTake.logs && viewedTake.logs.length ? viewedTake.logs : [viewedTake.error || viewedTake.progressText || "无详细日志"]).join("\n");
    $("#s3FailLogPre").textContent = rawLogs;
  }

  const mPreset = task.stage3?.modelPreset || "seedance_2.5_flash";
  $$("#s3ModelPresets .mwPresetBtn").forEach((b) => {
    b.classList.toggle("active", b.dataset.m === mPreset);
    b.onclick = async () => {
      const patch = { modelPreset: b.dataset.m };
      // MiniMax-H3 defaults to 720p when switching from 480p draft (still manually switchable to 1080p/480p)
      if (b.dataset.m === "minimax_h3_colab" && (!task.storyboard?.qualityPreset || task.storyboard.qualityPreset === "480p")) {
        patch.storyboard = { ...(task.storyboard || {}), qualityPreset: "720p" };
      }
      const res = await api(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      replaceTask(res.task);
    };
  });
  const s2ReadyCount = (task.storyboard?.shots || []).filter((s) => s.status === "succeeded").length;
  $("#s3SourceSummary").textContent = `白盒：${task.whitebox?.status === "approved" ? "已确认" : "待确认"} · 分镜：${s2ReadyCount} 张就绪 · ${task.storyboard?.qualityPreset || "720p"} · ${task.durationSec || 10}s`;

  const curH3Sch = (appState.schedule?.items || []).find(
    (x) => x.taskId === task.id && x.kind === "stage3_h3" && (x.status === "pending" || x.status === "running")
  );
  const s3Banner = $("#s3QueuedBanner");
  if (s3Banner) {
    s3Banner.classList.toggle("hidden", !curH3Sch);
    if (curH3Sch) {
      const slot = curH3Sch.scheduledTime || getNearestUpcomingSlot(appState.schedule);
      $("#s3QueuedBannerText").textContent =
        curH3Sch.status === "running"
          ? `定时队列执行中 · MiniMax-H3（${curH3Sch.resolution || "720p"} ${curH3Sch.duration || 6}s）`
          : `已排入 ${slot} 定时队列 · MiniMax-H3（${curH3Sch.resolution || "720p"} ${curH3Sch.duration || 6}s），到点自动开跑`;
    }
  }

  const readyCount = takes.filter((t) => t.status === "succeeded").length;
  const runCount = takes.filter((t) => t.status === "running").length;
  const failCount = takes.filter((t) => t.status === "failed").length;
  const titleParts = [];
  if (curH3Sch) titleParts.push(`1 条定时排队（${curH3Sch.scheduledTime || getNearestUpcomingSlot(appState.schedule)}）`);
  titleParts.push(`${readyCount} 条成片`);
  if (runCount) titleParts.push(`${runCount} 条生成中`);
  if (failCount) titleParts.push(`${failCount} 条失败`);
  const takesTitleEl = $("#s3TakesTitle");
  if (takesTitleEl) {
    takesTitleEl.textContent = `${task.beatCode} 本任务抽卡记录（${titleParts.join(" · ")}）`;
  }

  const s3Box = $("#s3Takes");
  s3Box.innerHTML = "";
  if (curH3Sch) {
    const slot = curH3Sch.scheduledTime || getNearestUpcomingSlot(appState.schedule);
    const schTile = document.createElement("div");
    schTile.className = "mwTakeTile isScheduled";
    schTile.title = "点击打开错峰定时队列查看或调整时间";
    schTile.innerHTML = `
      <div class="mwTakeThumb">
        <span class="mwTakeStateBadge sch">⏱ 已排 ${escapeHtml(slot)}</span>
        <span class="mwTakeThumbMsg mwGold">${curH3Sch.status === "running" ? "定时任务执行中…" : `等待 ${escapeHtml(slot)} 自动生成`}</span>
      </div>
      <div class="mwTakeMeta">
        <span class="mwTakeMetaTitle">MiniMax-H3 · ${escapeHtml(curH3Sch.resolution || "720p")} ${escapeHtml(curH3Sch.duration || 6)}s</span>
        <span class="mwMono mwGold">队列中</span>
      </div>
    `;
    schTile.onclick = () => setScheduleDrawer(true);
    s3Box.appendChild(schTile);
  }
  if (!takes.length && !curH3Sch) {
    s3Box.innerHTML = `<div class="mwTakeEmpty">当前动作尚无抽卡记录，点击右侧「生成 1 条视频」或导入本地 MP4</div>`;
  }
  for (const tk of takes) {
    const sel = tk.id === task.stage3.selectedTakeId && tk.status === "succeeded";
    const isViewing = viewedTake && tk.id === viewedTake.id;
    const isRun = tk.status === "running";
    const isErr = tk.status === "failed";
    const tkPct = isRun ? inferTakeProgress(tk) : 0;
    const tile = document.createElement("div");
    tile.className = `mwTakeTile ${sel ? "selected" : ""} ${isViewing ? "viewing" : ""} ${isErr ? "isFailed" : ""}`;
    tile.title = isRun ? "点击在主视口查看实时生成状态与日志" : isErr ? "点击查看失败诊断与原始日志" : "点击播放并设为当前定稿视频";

    const badgeHtml = sel
      ? `<span class="mwTakeStateBadge sel">当前定稿</span>`
      : isRun
      ? `<span class="mwTakeStateBadge run">${isViewing ? "查看中 · " : ""}生成中 ${tkPct}%</span>`
      : isErr
      ? `<span class="mwTakeStateBadge err">${isViewing ? "查看中 · " : ""}失败</span>`
      : `<span class="mwTakeStateBadge">成片</span>`;

    const thumbInner = tk.url
      ? appState.activeStage === 3
        ? `<video src="${tk.url}" muted playsinline preload="metadata"></video>`
        : `<span class="mwTakeThumbMsg">${escapeHtml(tk.label)}</span>`
      : isRun
      ? `<span class="mwSpinner mwSpinnerSm" aria-hidden="true"></span><span class="mwTakeThumbMsg">${escapeHtml(tk.progressText || "云端生成中…")}</span><div class="mwTakeMiniProg"><i style="width:${tkPct}%"></i></div>`
      : `<span class="mwTakeThumbMsg">${escapeHtml(summarizeTakeError(tk).title)}</span>`;

    tile.innerHTML = `
      <div class="mwTakeThumb ${tk.url ? "hasVideo" : ""}">
        ${badgeHtml}
        <button class="mwTakeDelBtn" type="button" title="删除此条抽卡记录">✕</button>
        ${thumbInner}
      </div>
      <div class="mwTakeMeta">
        <span class="mwTakeMetaTitle" title="${escapeHtml(tk.label)}">${escapeHtml(tk.label)}</span>
        <span class="mwMono">${fmtSize(tk.sizeBytes) || (isRun ? `${tkPct}%` : "")}</span>
      </div>
    `;
    const delBtn = tile.querySelector(".mwTakeDelBtn");
    if (delBtn) {
      delBtn.onclick = async (ev) => {
        ev.stopPropagation();
        try {
          const res = await api(`/api/tasks/${task.id}/stage3/takes/${tk.id}`, { method: "DELETE" });
          if (appState.inspectedTakeByTask[task.id] === tk.id) delete appState.inspectedTakeByTask[task.id];
          replaceTask(res.task);
          toast("已移除该条抽卡记录");
        } catch (err) {
          toast(err.message, 3500);
        }
      };
    }
    tile.onclick = async () => {
      appState.inspectedTakeByTask[task.id] = tk.id;
      if (tk.status === "succeeded") {
        const res = await api(`/api/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({ selectedTakeId: tk.id }),
        });
        replaceTask(res.task);
      } else {
        renderAll();
      }
    };
    s3Box.appendChild(tile);
  }

  // Stage 03 resolution selector (H3 defaults to 720p; supports 480p / 720p / 1080p)
  const activeRes = task.storyboard?.qualityPreset || "720p";
  $$("#s3ResolutionPresets .mwResBtn").forEach((b) => {
    b.classList.toggle("active", b.dataset.r === activeRes);
    b.onclick = async () => {
      const res = await api(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ storyboard: { ...(task.storyboard || {}), qualityPreset: b.dataset.r } }),
      });
      replaceTask(res.task);
    };
  });
  $("#btnStage3Gen").textContent = takes.length > 0 ? "再抽 1 条视频" : "生成 1 条视频";
  $("#s3InspFoot")?.classList.toggle("hidden", !selectedTake?.url);

  // Stage 04 · 骨骼提取
  const curMocapSch = (appState.schedule?.items || []).find(
    (x) => x.taskId === task.id && x.kind === "stage4_mocap" && (x.status === "pending" || x.status === "running")
  );
  const s4Banner = $("#s4QueuedBanner");
  if (s4Banner) {
    s4Banner.classList.toggle("hidden", !curMocapSch);
    if (curMocapSch) {
      const slot = curMocapSch.scheduledTime || getNearestUpcomingSlot(appState.schedule);
      const gpuLabel = curMocapSch.precisionPreset === "high_a100" ? "A100" : "L4";
      $("#s4QueuedBannerText").textContent =
        curMocapSch.status === "running"
          ? `定时队列执行中 · Colab 提骨（${gpuLabel}）`
          : `已排入 ${slot} 定时队列 · Colab 提骨（${gpuLabel}），到点自动开跑`;
    }
  }
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

  // Visual Input Video Source Card (only bind video stream when Stage 04 is active to avoid HTTP/1.1 6-socket starvation)
  const isStage4Active = appState.activeStage === 4;
  const hasInputVid = Boolean(selectedTake?.url);
  $("#s4InputThumb").classList.toggle("hidden", !hasInputVid);
  $("#s4InputEmpty").classList.toggle("hidden", hasInputVid);
  setVideoSrcIfChanged($("#s4InputThumb"), hasInputVid && isStage4Active ? selectedTake.url : "");
  $("#s4SelectedVideo").textContent = selectedTake
    ? selectedTake.label
    : isMixamo
    ? "复用 Mixamo 通用库动作"
    : "尚未定稿输入视频";
  $("#s4SelectedVideoSub").textContent = selectedTake
    ? `${selectedTake.resolution || "720p"} · ${selectedTake.duration || task.durationSec || 6}s · ${fmtSize(selectedTake.sizeBytes)}`
    : isMixamo
    ? "可直接进入 05 重定向 3D 验收"
    : "请先在 03 视频生成出片";

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

  const runs = task.stage4?.runs || [];
  $("#s4Empty").classList.toggle("hidden", hasResult);
  $("#s4ResultArea").classList.toggle("hidden", !hasResult);
  $("#s4InspFoot")?.classList.toggle("hidden", !hasResult);
  $("#btnStage4Run").disabled = Boolean(isRunning);
  $("#btnStage4Run").textContent = isRunning ? "云端提骨进行中…" : runs.length > 0 ? "重新提交云端提骨" : "提交云端提骨";

  function formatLogLineHtml(line) {
    const raw = String(line || "");
    const safe = escapeHtml(raw);
    let cls = "";
    if (/ERROR|失败|Traceback|RuntimeError|Service Unavailable|503/i.test(raw)) cls = "isErr";
    else if (/自动切换|重试|暂不可用|warn|超时/i.test(raw)) cls = "isWarn";
    else if (/已分配|复用热机|已导出|完成|就绪|\[DONE\]/i.test(raw)) cls = "isOk";
    let html = safe
      .replace(/^(\[Colab CLI[^\]]*\])/i, '<span class="lgTag">$1</span>')
      .replace(/^(\[GEM-X[^\]]*\])/i, '<span class="lgTagBlue">$1</span>')
      .replace(/^(\$\s+.+)$/i, '<span class="lgCmd">$1</span>');
    return `<div class="mwLogLine ${cls}">${html}</div>`;
  }

  if (!hasResult) {
    const showProg = Boolean(isRunning && !isMixamo);
    const showFail = Boolean(isFailed && !isMixamo && !showProg);
    $("#s4ProgressCard").classList.toggle("hidden", !showProg);
    $("#s4FailCard").classList.toggle("hidden", !showFail);
    $("#s4IdleBlock").classList.toggle("hidden", showProg || showFail);

    if (showProg) {
      const pct = Math.max(0, Math.min(100, Number(run.progress || 0)));
      const isModalRun = run.backend === "modal_serverless" || task.stage4?.precisionPreset === "modal_l4";
      const isA100 = !isModalRun && task.stage4?.precisionPreset === "high_a100";
      const gpuTag = isModalRun
        ? "Modal Serverless · L4→A10G→L40S→A100"
        : isA100
        ? "A100 · GEM-X + WiLoR"
        : "L4 · NVIDIA GEM-X 77 骨";
      $("#s4ProgSpec").textContent = gpuTag;
      $("#s4ProgJob").textContent = run.jobId;

      // Elapsed time mm:ss
      const elapsedSec = Math.max(0, Math.floor((Date.now() - Number(run.createdAt || Date.now())) / 1000));
      const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
      const ss = String(elapsedSec % 60).padStart(2, "0");
      $("#s4ProgElapsed").textContent = `已用时 ${mm}:${ss}`;

      $("#s4LivePct").textContent = `${pct}%`;
      $("#s4LiveFill").style.width = `${pct}%`;

      // Split formal short title vs secondary muted note (strip parenthetical hints out of main headline)
      const rawStage = String(run.stageLabel || "申请云端 GPU").replace(/…+$/, "");
      const parenMatch = /^([^（(]+)[（(]([^）)]+)[）)]/.exec(rawStage);
      const shortHeadline = (parenMatch ? parenMatch[1] : rawStage).trim();
      const subNote = parenMatch
        ? parenMatch[2].trim()
        : pct < 15
        ? isModalRun
          ? "Modal Serverless 按需冷启容器（约 10~25 秒），L4 暂满自动顺延 A10G / L40S / A100"
          : "高峰期可能排队 1~3 分钟 · 当前卡型暂满时自动顺延备选 GPU"
        : pct < 22
        ? isModalRun
          ? "正在上传输入视频至 Modal 持久化卷"
          : "正在经 Colab CLI 直传输入视频至云端临时盘"
        : pct < 88
        ? "YOLOX 追踪 → ViTPose77 关键点 → 12 层时序 Transformer → Contact/IK"
        : "打包 GLB / FBX / BVH / USD 并自动执行 Retarget v3 转换";
      $("#s4LiveText").textContent = shortHeadline;
      $("#s4LiveHint").textContent = subNote;

      // 4 rich pipeline stage cards with live per-stage sub-status
      const activeIdx = pct < 15 ? 0 : pct < 22 ? 1 : pct < 88 ? 2 : 3;
      const vidSize = selectedTake ? fmtSize(selectedTake.sizeBytes) : "";
      const stageDefs = [
        {
          title: isModalRun ? "拉起 Modal GPU" : "申请 GPU",
          doneSub: isModalRun ? "已就绪 · Modal GPU" : isA100 ? "已就绪 · 高配 GPU" : "已就绪 · 云端 GPU",
          curSub: isModalRun ? "顺位 L4→A10G→L40S→A100" : isA100 ? "分配 A100 (备选 G4/L4)" : "分配 L4 (备选 A100/G4)",
          waitSub: "等待分配",
        },
        {
          title: "上传视频",
          doneSub: vidSize ? `已上传 · ${vidSize}` : "已上传至运行时",
          curSub: vidSize ? `直传中 · ${vidSize}` : "直传至云端临时盘",
          waitSub: "等待 GPU 就绪",
        },
        {
          title: "GEM-X 推理",
          doneSub: "77 关节提取完成",
          curSub: shortHeadline.length <= 18 ? shortHeadline : "77 骨重建 + Contact/IK",
          waitSub: "等待视频上传",
        },
        {
          title: "回传重定向",
          doneSub: "已生成 Mixamo GLB",
          curSub: "打包回传 + Retarget v3",
          waitSub: "等待推理完成",
        },
      ];
      $("#s4Milestones").innerHTML = stageDefs
        .map((d, i) => {
          const st = i < activeIdx ? "done" : i === activeIdx ? "current" : "pending";
          const mk = i < activeIdx ? "✓" : i === activeIdx ? "●" : `${i + 1}`;
          const sub = st === "done" ? d.doneSub : st === "current" ? d.curSub : d.waitSub;
          return `
            <div class="mwPipeTile" data-state="${st}">
              <div class="mwPipeTileHead"><span class="mwPipeIdx">${mk}</span><span>${d.title}</span></div>
              <div class="mwPipeTileSub">${escapeHtml(sub)}</div>
            </div>
          `;
        })
        .join("");

      const allLogs = run.logs || [];
      $("#s4TermCount").textContent = `实时执行终端 · ${allLogs.length} 行`;
      const termEl = $("#s4ProgLogs");
      if (allLogs.length > 0) {
        termEl.innerHTML = allLogs.slice(-40).map(formatLogLineHtml).join("");
        termEl.scrollTop = termEl.scrollHeight;
      } else {
        termEl.innerHTML = `<div class="mwLogEmpty">等待云端返回执行日志…</div>`;
      }
      $("#btnCopyS4Logs").onclick = async () => {
        await navigator.clipboard.writeText(allLogs.join("\n"));
        toast("已复制当前批次日志");
      };
    } else if (showFail) {
      const diag = parseMocapFailure(run);
      $("#s4FailJobId").textContent = run.jobId;
      $("#s4FailTitle").textContent = diag.title;
      $("#s4FailHint").textContent = diag.hint;
      $("#btnS4FixColabLogin").classList.toggle("hidden", !diag.isColabAuth);
      $("#s4FailLogPre").textContent = diag.raw;
    } else {
      $("#s4EmptyTitle").textContent = isMixamo
        ? "Mixamo 通用动作 · 直接前往 05 重定向 3D 验收"
        : selectedTake
        ? "已就绪 · 点击右侧「提交云端提骨」开始"
        : "请先在「03 视频生成」定稿视频";
    }
  } else {
    setVideoSrcIfChanged($("#vidOrig"), isStage4Active ? (selectedTake?.url || "") : "");
    setVideoSrcIfChanged($("#vidOverlay"), isStage4Active ? (files["render/overlay.mp4"]?.url || "") : "");
    setVideoSrcIfChanged($("#vidWorld"), isStage4Active ? (files["render/world.mp4"]?.url || "") : "");

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

  $("#s4RunsSec").classList.toggle("hidden", runs.length === 0);
  const runsSumEl = $("#s4RunsSummary");
  if (runsSumEl) runsSumEl.textContent = `历史批次 (${runs.length})`;
  const runBox = $("#s4RunTabs");
  runBox.innerHTML = "";
  for (const r of runs) {
    const b = document.createElement("button");
    b.type = "button";
    const failed = r.status === "failed";
    b.className = `mwRunItem ${r.jobId === run?.jobId ? "active" : ""} ${failed ? "isFailed" : ""}`;
    const mainLine = `${r.jobId} · ${r.status === "succeeded" ? "完成" : failed ? "失败" : "运行中"}`;
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
  $("#qaFingers").textContent = qa ? `${qa.fingerChannels} / 30` : "—";
  $("#qaFingers").className = `v mwMono ${qa?.fingerChannels >= 30 ? "ok" : "warn"}`;
  $("#qaScale").textContent = `${cInfo.name} · ${Number(cInfo.hipsScale).toFixed(2)}×`;
  $("#qaFoot").textContent = qa ? `${qa.minFootY} m` : "—";
  $("#qaFoot").className = `v mwMono ${qa?.groundStatus === "warn" ? "warn" : "ok"}`;
  $("#qaWrist").textContent = qa ? `${qa.maxWristStepDeg}°` : "—";
  $("#qaWrist").className = `v mwMono ${qa?.wristStatus === "warn" ? "warn" : "ok"}`;
  const cleanHint = String(cInfo.clipOverrideHint || "").replace(/建议第\s*6\s*步/g, "可在入库前").trim();
  const qaHintEl = $("#qaHint");
  if (qaHintEl) {
    qaHintEl.textContent = cleanHint;
    qaHintEl.classList.toggle("hidden", !cleanHint || cleanHint === "—");
  }

  $("#btnApproveRetarget").textContent =
    task.stage5?.status === "approved" ? "✓ 已通过二次验收（可入库）" : "✓ 二次验收通过 · 可入库";

  if (!hasClip) return;

  const hasVid = Boolean(selectedTake?.url);
  $("#vidRetargetOrig").classList.toggle("hidden", !hasVid);
  $("#s5NoVideoNote").classList.toggle("hidden", hasVid);
  setVideoSrcIfChanged($("#vidRetargetOrig"), hasVid && appState.activeStage === 5 ? selectedTake.url : "");

  $("#s5CharViewportTitle").textContent = `${cInfo.name} · 3D 预览`;
  $("#s5RetSummary").textContent = qa
    ? `${qa.frames} 帧 @ ${qa.fps} FPS · 胯高比 ${qa.legRatio}`
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

const capturedCoverTasks = new Set();
function captureRetargetCover(task) {
  if (!task || capturedCoverTasks.has(task.id)) return;
  const srcCanvas = $("#retargetCanvas");
  if (!srcCanvas || srcCanvas.width < 100 || srcCanvas.height < 100) return;
  capturedCoverTasks.add(task.id);
  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
      try {
        const outW = 480;
        const outH = 270;
        const tmp = document.createElement("canvas");
        tmp.width = outW;
        tmp.height = outH;
        const ctx = tmp.getContext("2d");
        // Center-crop 16:9 from the 3D canvas around the character torso/head
        const srcRatio = srcCanvas.width / srcCanvas.height;
        const dstRatio = outW / outH;
        let sx = 0, sy = 0, sw = srcCanvas.width, sh = srcCanvas.height;
        if (srcRatio > dstRatio) {
          sw = Math.round(srcCanvas.height * dstRatio);
          sx = Math.round((srcCanvas.width - sw) / 2);
        } else {
          sh = Math.round(srcCanvas.width / dstRatio);
          sy = Math.round((srcCanvas.height - sh) * 0.36);
        }
        ctx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, outW, outH);
        const dataUrl = tmp.toDataURL("image/jpeg", 0.86);
        const res = await api(`/api/tasks/${task.id}/cover`, {
          method: "POST",
          silent: true,
          body: JSON.stringify({ dataUrl, version: 3 }),
        });
        if (res?.task) replaceTask(res.task);
      } catch {
        capturedCoverTasks.delete(task.id);
      }
    });
  });
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
      // 自动截取重定向 3D 角色动画封面（若尚未保存最新版平衡曝光封面）
      if (!task.retargetCoverUrl || (task.retargetCoverVersion || 0) < 3) {
        captureRetargetCover(task);
      }
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

const DEFAULT_SLOTS = ["04:00", "06:00", "08:00", "12:00", "14:00", "16:00"];

function parseSlotMinutes(slot) {
  const [hh, mm] = String(slot || "").split(":").map(Number);
  return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : 360;
}

function getNearestUpcomingSlot(sch) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const triggered = sch?.lastTriggeredSlots || {};
  const base = Array.isArray(sch?.cascadeSlots) && sch.cascadeSlots.length ? sch.cascadeSlots : DEFAULT_SLOTS;
  const set = new Set(base.filter((s) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(s || ""))));
  if (sch?.runTime && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(sch.runTime)) set.add(sch.runTime);
  const slots = [...set].sort((a, b) => parseSlotMinutes(a) - parseSlotMinutes(b));
  for (const s of slots) {
    if (parseSlotMinutes(s) > nowMin && triggered[s] !== today) return s;
  }
  return slots[0] || "04:00";
}

function pickEarliestPendingSlot(pendingItems, fallbackSlot) {
  if (!pendingItems.length) return fallbackSlot;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let bestSlot = pendingItems[0].scheduledTime || fallbackSlot;
  let bestDelta = Infinity;
  for (const it of pendingItems) {
    const s = it.scheduledTime || fallbackSlot;
    let delta = parseSlotMinutes(s) - nowMin;
    if (delta <= 0) delta += 1440;
    if (delta < bestDelta) {
      bestDelta = delta;
      bestSlot = s;
    }
  }
  return bestSlot;
}

function animateFlyToSchedule(fromEl, labelText) {
  const targetEl = $("#btnSchedule");
  if (!targetEl) return;

  const pulseTarget = () => {
    targetEl.classList.remove("mwSchPulse");
    void targetEl.offsetWidth;
    targetEl.classList.add("mwSchPulse");
    const badge = $("#schCountBadge");
    if (badge && !badge.classList.contains("hidden")) {
      badge.classList.remove("mwSchBadgePop");
      void badge.offsetWidth;
      badge.classList.add("mwSchBadgePop");
    }
    setTimeout(() => {
      targetEl.classList.remove("mwSchPulse");
      badge?.classList.remove("mwSchBadgePop");
    }, 680);
  };

  if (!fromEl || typeof fromEl.getBoundingClientRect !== "function") {
    pulseTarget();
    return;
  }

  const from = fromEl.getBoundingClientRect();
  const to = targetEl.getBoundingClientRect();
  if (!from.width || !to.width) {
    pulseTarget();
    return;
  }

  const startX = from.left + from.width / 2;
  const startY = from.top + from.height / 2;
  const endX = to.left + to.width / 2;
  const endY = to.top + to.height / 2;
  const midX = (startX + endX) / 2 - 42;
  const midY = Math.min(startY, endY) - 44;

  const chip = document.createElement("div");
  chip.className = "mwFlyToken";
  chip.textContent = labelText || "⏱ 已入队";
  chip.style.left = `${startX}px`;
  chip.style.top = `${startY}px`;
  document.body.appendChild(chip);

  const dxMid = midX - startX;
  const dyMid = midY - startY;
  const dxEnd = endX - startX;
  const dyEnd = endY - startY;

  const anim = chip.animate(
    [
      { transform: "translate(-50%, -50%) scale(0.92)", opacity: 0.95 },
      { transform: `translate(calc(-50% + ${dxMid}px), calc(-50% + ${dyMid}px)) scale(1.06)`, opacity: 1, offset: 0.45 },
      { transform: `translate(calc(-50% + ${dxEnd}px), calc(-50% + ${dyEnd}px)) scale(0.55)`, opacity: 0.15 },
    ],
    { duration: 540, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }
  );
  setTimeout(pulseTarget, 440);
  anim.onfinish = () => chip.remove();
}

function renderScheduleUI() {
  const sch = appState.schedule;
  if (!sch) return;
  const nearestSlot = getNearestUpcomingSlot(sch);
  const runTime = sch.runTime || nearestSlot;
  const items = sch.items || [];
  const pendingItems = items.filter((x) => x.status === "pending" || x.status === "running");
  const pendingCount = pendingItems.length;
  const nextPendingSlot = pickEarliestPendingSlot(pendingItems, nearestSlot);
  const cur = currentTask();

  const btnSch = $("#btnSchedule");
  if (btnSch) btnSch.classList.toggle("hasQueue", pendingCount > 0 || Boolean(sch.runningBatch));
  const btnLbl = $("#schBtnLabel");
  if (btnLbl) {
    btnLbl.textContent = sch.runningBatch
      ? "定时运行中"
      : pendingCount > 0
      ? `已排 ${nextPendingSlot}`
      : `定时 ${nearestSlot}`;
  }
  const badge = $("#schCountBadge");
  if (badge) {
    badge.textContent = String(pendingCount);
    badge.classList.toggle("hidden", pendingCount === 0);
  }

  // Stage 03 / Stage 04 inspector buttons: always show nearest upcoming slot, or queued slot if already added
  const curH3Item = cur ? pendingItems.find((x) => x.taskId === cur.id && x.kind === "stage3_h3") : null;
  const curMocapItem = cur ? pendingItems.find((x) => x.taskId === cur.id && x.kind === "stage4_mocap") : null;
  const s3q = $("#btnStage3QueueSch");
  if (s3q) {
    s3q.classList.toggle("isQueued", Boolean(curH3Item));
    s3q.textContent = curH3Item
      ? `✓ 已排入 ${curH3Item.scheduledTime || nearestSlot} 队列 · 查看`
      : `⏱ 加入 ${nearestSlot} 定时队列（H3）`;
  }
  const s4q = $("#btnStage4QueueSch");
  if (s4q) {
    s4q.classList.toggle("isQueued", Boolean(curMocapItem));
    s4q.textContent = curMocapItem
      ? `✓ 已排入 ${curMocapItem.scheduledTime || nearestSlot} 队列 · 查看`
      : `⏱ 加入 ${nearestSlot} 定时队列（提骨）`;
  }

  if ($("#schEnabled")) $("#schEnabled").checked = Boolean(sch.enabled);
  if ($("#schAutoStop")) $("#schAutoStop").checked = sch.autoStopAfterBatch !== false;
  if ($("#schAutoDefer")) $("#schAutoDefer").checked = sch.autoDeferToAfternoon !== false;
  if ($("#schRunTime") && document.activeElement !== $("#schRunTime")) $("#schRunTime").value = nearestSlot;
  const activeSlotForHighlight = pendingCount > 0 ? nextPendingSlot : nearestSlot;
  $$(".mwSchPreset").forEach((b) => b.classList.toggle("active", b.dataset.time === activeSlotForHighlight));

  const heroTime = $("#schHeroTime");
  if (heroTime) {
    heroTime.textContent = sch.runningBatch ? "执行中" : sch.enabled ? activeSlotForHighlight : "已暂停";
  }
  if ($("#schNextRunText")) {
    const serverTxt = sch.nextRunText || "";
    $("#schNextRunText").textContent =
      pendingCount === 0 && sch.enabled
        ? `下次最近档位：${nearestSlot}（队列当前为空，入队即自动排入此档）`
        : serverTxt || "—";
  }
  if ($("#schQueueTitle")) $("#schQueueTitle").textContent = `排队任务 (${pendingCount} 待执行 / 共 ${items.length})`;

  const runBtn = $("#btnSchRunNow");
  if (runBtn) {
    runBtn.disabled = Boolean(sch.runningBatch || pendingCount === 0);
    runBtn.textContent = sch.runningBatch ? "正在按序执行错峰队列…" : `立即执行当前队列（${pendingCount} 项）`;
  }

  const listEl = $("#schItemsList");
  if (!listEl) return;
  listEl.innerHTML = "";
  if (!items.length) {
    listEl.innerHTML = `<div class="mwSchEmpty">暂无排队任务<br>可在 03/04 阶段点「加入 ${escapeHtml(nearestSlot)} 定时队列」，或点上方快捷批量入队</div>`;
    return;
  }
  for (const it of items) {
    const isRun = it.status === "running";
    const isErr = it.status === "failed";
    const isDone = it.status === "succeeded";
    const isCur = cur && it.taskId === cur.id;
    const row = document.createElement("div");
    row.className = `mwSchItem ${isCur ? "isCurrent" : ""} ${isRun ? "isRun" : ""} ${isDone ? "isDone" : ""} ${isErr ? "isErr" : ""}`;
    row.title = "点击跳转到该动作对应阶段";
    const kindLabel =
      it.kind === "stage4_mocap"
        ? `Colab 提骨 · ${it.precisionPreset === "high_a100" ? "A100" : "L4"}${it.fallbackToModal ? " → Modal" : ""}`
        : `MiniMax-H3 · ${it.resolution || "720p"} ${it.duration || 6}s`;
    const itemSlot = it.scheduledTime || runTime;
    const deferCnt = Array.isArray(it.deferHistory) ? it.deferHistory.length : it.deferredFrom ? 1 : 0;
    const stText = isRun
      ? "运行中"
      : isDone
      ? "已完成"
      : isErr
      ? "失败"
      : deferCnt > 0
      ? `待 ${itemSlot} · 顺延 ${deferCnt} 次`
      : `待 ${itemSlot}`;
    const showDetailMsg = isErr || isRun || deferCnt > 0 || isDone;
    row.innerHTML = `
      <div class="mwSchItemMain">
        <div class="mwSchItemTop">
          <span class="mwSchItemCode">${escapeHtml(it.beatCode)}</span>
          <span class="mwSchItemTitle">${escapeHtml(it.taskTitle)}</span>
        </div>
        <div class="mwSchItemBot">
          <span class="mwSchItemKind">${escapeHtml(kindLabel)}</span>
          <span class="mwSchStateChip">${escapeHtml(stText)}</span>
        </div>
        ${showDetailMsg && it.message ? `<div class="mwSchItemMsg">${escapeHtml(it.message)}</div>` : ""}
      </div>
      ${isRun ? "" : `<button class="mwIconBtn" type="button" data-del-sch="${escapeHtml(it.id)}" title="移出队列">✕</button>`}
    `;
    row.onclick = () => {
      appState.selectedTaskId = it.taskId;
      appState.activeStage = it.kind === "stage4_mocap" ? 4 : 3;
      setScheduleDrawer(false);
      renderAll();
    };
    const delBtn = row.querySelector("[data-del-sch]");
    if (delBtn) {
      delBtn.onclick = async (ev) => {
        ev.stopPropagation();
        try {
          const res = await api(`/api/schedule/items/${encodeURIComponent(it.id)}`, { method: "DELETE" });
          appState.schedule = res.schedule;
          renderAll();
        } catch (err) {
          toast(err.message, 3500);
        }
      };
    }
    listEl.appendChild(row);
  }
}

function setScheduleDrawer(open) {
  appState.schOpen = Boolean(open);
  $("#schDrawer")?.classList.toggle("hidden", !appState.schOpen);
  $("#schScrim")?.classList.toggle("hidden", !appState.schOpen);
  $("#btnSchedule")?.setAttribute("aria-expanded", String(appState.schOpen));
  if (appState.schOpen) {
    renderScheduleUI();
    syncLiveState({ includeBootstrap: true }).catch(() => {});
  }
}

function renderAll() {
  renderSystemAggregated();
  renderScheduleUI();
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
  renderTaskDetail();
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

$("#btnGenAllShots").onclick = async () => {
  const task = currentTask();
  if (!task) return;
  const shots = task.storyboard?.shots || [];
  if (!shots.length) return toast("当前动作无需生成分镜");
  const targets = shots.filter((s) => s.status !== "succeeded");
  const batch = targets.length > 0 ? targets : shots;
  const providerId = activeImageProviderId();
  const prov = getProviderInfo(providerId);
  if (!prov.ready) {
    toast(`${prov.name} 当前未就绪：${prov.detail}`, 4200);
    setSystemDrawer(true, "config");
    return;
  }

  try {
    if (providerId === "seedream") {
      toast(`正在查询 ${batch.length} 张分镜的 Seedream 总报价…`);
      const quotes = await Promise.all(
        batch.map(async (sh) => {
          const q = await api(`/api/tasks/${task.id}/stage2/shot/${encodeURIComponent(sh.id)}/quote`, {
            method: "POST",
            body: JSON.stringify({ provider: "seedream", ratio: "16:9" }),
          });
          return { sh, quote: q.quote };
        })
      );
      const totalCredits = quotes.reduce((acc, x) => acc + Number(x.quote?.maxCredits || 0), 0);
      const codes = quotes.map((x) => x.sh.code).join(" / ");
      openCreditConfirm(
        `批量使用 <strong>Seedream</strong>（${escapeHtml(quotes[0]?.quote?.model || "5.0 Flash")} · ${escapeHtml(quotes[0]?.quote?.resolution || "2K")} · 16:9）一次生成 <strong>${quotes.length} 张分镜（${escapeHtml(codes)}）</strong><br>合计上限消耗：<strong class="mwGold">${totalCredits} 积分</strong>`,
        async () => {
          let latestTask = null;
          for (const { sh, quote } of quotes) {
            const res = await api(`/api/tasks/${task.id}/stage2/shot/${encodeURIComponent(sh.id)}/run`, {
              method: "POST",
              body: JSON.stringify({
                provider: "seedream",
                model: quote.model,
                nodeId: quote.nodeId,
                creditCeiling: quote.maxCredits,
              }),
            });
            latestTask = res.task;
          }
          if (latestTask) replaceTask(latestTask);
          toast(`已批量提交 ${quotes.length} 张分镜生成`);
        }
      );
    } else {
      toast(`已批量提交 ${batch.length} 张分镜至 ${prov.name}…`);
      let latestTask = null;
      for (const sh of batch) {
        const res = await api(`/api/tasks/${task.id}/stage2/shot/${encodeURIComponent(sh.id)}/run`, {
          method: "POST",
          body: JSON.stringify({ provider: providerId }),
        });
        latestTask = res.task;
      }
      if (latestTask) replaceTask(latestTask);
    }
  } catch (err) {
    toast(err.message, 4500);
  }
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
      if (res.task?.stage3?.takes?.[0]?.id) {
        appState.inspectedTakeByTask[task.id] = res.task.stage3.takes[0].id;
      }
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
        if (res.task?.stage3?.takes?.[0]?.id) {
          appState.inspectedTakeByTask[task.id] = res.task.stage3.takes[0].id;
        }
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
$("#btnToggleLight").onclick = () => {
  const isDay = !$("#btnToggleLight").classList.contains("active");
  $("#btnToggleLight").classList.toggle("active", isDay);
  $("#btnToggleLight").textContent = isDay ? "天空" : "暗棚";
  appState.retViewer?.setLightingMode(isDay ? "daylight" : "dark");
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

// Space 键全局切换播放 / 暂停（输入法/文本框聚焦时不拦截）
window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (document.activeElement?.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable) return;
  if (appState.sysOpen) return;
  if (appState.activeStage === 5 && !$("#s5RetargetStage")?.classList.contains("hidden")) {
    e.preventDefault();
    $("#btnRetPlay")?.click();
  } else if (appState.activeStage === 4 && !$("#s4ResultArea")?.classList.contains("hidden")) {
    e.preventDefault();
    $("#btnSyncPlay")?.click();
  } else if (appState.activeStage === 3) {
    const v = $("#s3MainVideo");
    if (v && v.getAttribute("src") && !v.classList.contains("hidden")) {
      e.preventDefault();
      if (v.paused) v.play().catch(() => {});
      else v.pause();
    }
  }
});

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
$("#btnS3OpenSys").onclick = () => setSystemDrawer(true, "logs");
$("#btnS3FailColabLogin").onclick = () => {
  setSystemDrawer(true, "overview");
  $("#btnColabLogin")?.click();
};
$("#btnS3RetryFromFail").onclick = () => $("#btnStage3Gen")?.click();
$("#btnS3FailOpenLogs").onclick = () => setSystemDrawer(true, "logs");

$("#btnS4FixColabLogin").onclick = () => {
  setSystemDrawer(true, "overview");
  $("#btnColabLogin")?.click();
};
$("#btnS4RetryFromFail").onclick = () => $("#btnStage4Run")?.click();
$("#btnS4OpenLogs").onclick = () => setSystemDrawer(true, "logs");

// Off-peak scheduled batch queue controls
$("#btnSchedule").onclick = () => setScheduleDrawer(!appState.schOpen);
$("#btnCloseSch").onclick = () => setScheduleDrawer(false);
$("#schScrim").onclick = () => setScheduleDrawer(false);
if ($("#btnS3BannerOpenSch")) $("#btnS3BannerOpenSch").onclick = () => setScheduleDrawer(true);
if ($("#btnS4BannerOpenSch")) $("#btnS4BannerOpenSch").onclick = () => setScheduleDrawer(true);

async function saveScheduleConfig(patch) {
  try {
    const res = await api("/api/schedule/config", {
      method: "POST",
      body: JSON.stringify(patch),
    });
    appState.schedule = res.schedule;
    renderAll();
    toast(
      patch.runTime
        ? `已将待执行队列改排至 ${res.schedule.runTime}`
        : `定时策略已更新：${res.schedule.enabled ? `已开启自动触发` : "已暂停自动触发"}`
    );
  } catch (err) {
    toast(err.message, 4000);
  }
}
$("#schEnabled").onchange = (e) => saveScheduleConfig({ enabled: Boolean(e.target.checked) });
$("#schAutoStop").onchange = (e) => saveScheduleConfig({ autoStopAfterBatch: Boolean(e.target.checked) });
$("#schAutoDefer").onchange = (e) => saveScheduleConfig({ autoDeferToAfternoon: Boolean(e.target.checked) });
$("#schRunTime").onchange = (e) => {
  if (e.target.value) saveScheduleConfig({ runTime: e.target.value });
};
$$(".mwSchPreset").forEach((b) => {
  b.onclick = () => saveScheduleConfig({ runTime: b.dataset.time, enabled: true });
});

$("#btnStage3QueueSch").onclick = async (ev) => {
  const task = currentTask();
  if (!task) return;
  const existing = (appState.schedule?.items || []).find(
    (x) => x.taskId === task.id && x.kind === "stage3_h3" && (x.status === "pending" || x.status === "running")
  );
  if (existing) {
    setScheduleDrawer(true);
    return;
  }
  try {
    const targetSlot = getNearestUpcomingSlot(appState.schedule);
    const res = await api("/api/schedule/items", {
      method: "POST",
      body: JSON.stringify({
        taskId: task.id,
        kind: "stage3_h3",
        resolution: task.storyboard?.qualityPreset || "720p",
        duration: task.durationSec || 6,
        scheduledTime: targetSlot,
      }),
    });
    appState.schedule = res.schedule;
    renderAll();
    if (res.addedCount > 0) {
      animateFlyToSchedule(ev.currentTarget, `⏱ ${task.beatCode} → ${targetSlot}`);
      toast(`已排入最近 ${targetSlot} 队列（MiniMax-H3）`);
    } else {
      setScheduleDrawer(true);
      toast("该动作已在定时队列中");
    }
  } catch (err) {
    toast(err.message, 4000);
  }
};
$("#btnStage4QueueSch").onclick = async (ev) => {
  const task = currentTask();
  if (!task) return;
  const existing = (appState.schedule?.items || []).find(
    (x) => x.taskId === task.id && x.kind === "stage4_mocap" && (x.status === "pending" || x.status === "running")
  );
  if (existing) {
    setScheduleDrawer(true);
    return;
  }
  try {
    const preset = task.stage4?.precisionPreset === "high_a100" ? "high_a100" : "standard_l4";
    const targetSlot = getNearestUpcomingSlot(appState.schedule);
    const res = await api("/api/schedule/items", {
      method: "POST",
      body: JSON.stringify({
        taskId: task.id,
        kind: "stage4_mocap",
        precisionPreset: preset,
        scheduledTime: targetSlot,
      }),
    });
    appState.schedule = res.schedule;
    renderAll();
    if (res.addedCount > 0) {
      animateFlyToSchedule(ev.currentTarget, `⏱ ${task.beatCode} → ${targetSlot}`);
      toast(`已排入最近 ${targetSlot} 队列（Colab 提骨）`);
    } else {
      setScheduleDrawer(true);
      toast("该动作已在定时队列中");
    }
  } catch (err) {
    toast(err.message, 4000);
  }
};
$("#btnSchAddAllH3").onclick = async () => {
  try {
    const targetSlot = getNearestUpcomingSlot(appState.schedule);
    const res = await api("/api/schedule/items", {
      method: "POST",
      body: JSON.stringify({ batchMode: "all_pending_h3", scheduledTime: targetSlot }),
    });
    appState.schedule = res.schedule;
    renderAll();
    if (res.addedCount > 0) animateFlyToSchedule(null);
    toast(res.addedCount > 0 ? `已批量排入 ${targetSlot} 队列（${res.addedCount} 个待出片任务）` : "没有新的待出片任务（需先有分镜图且尚无成片）");
  } catch (err) {
    toast(err.message, 4000);
  }
};
$("#btnSchAddAllMocap").onclick = async () => {
  try {
    const targetSlot = getNearestUpcomingSlot(appState.schedule);
    const res = await api("/api/schedule/items", {
      method: "POST",
      body: JSON.stringify({ batchMode: "all_pending_mocap", scheduledTime: targetSlot }),
    });
    appState.schedule = res.schedule;
    renderAll();
    if (res.addedCount > 0) animateFlyToSchedule(null);
    toast(res.addedCount > 0 ? `已批量排入 ${targetSlot} 队列（${res.addedCount} 个待提骨任务）` : "没有新的待提骨任务（需先有成片视频且尚未提骨）");
  } catch (err) {
    toast(err.message, 4000);
  }
};
$("#btnSchClearDone").onclick = async () => {
  try {
    const res = await api("/api/schedule/items?scope=done", { method: "DELETE" });
    appState.schedule = res.schedule;
    renderScheduleUI();
    toast("已清理已完成/失败的队列记录");
  } catch (err) {
    toast(err.message, 3500);
  }
};
$("#btnSchRunNow").onclick = async () => {
  try {
    const res = await api("/api/schedule/run-now", { method: "POST", body: "{}" });
    appState.schedule = res.schedule;
    renderScheduleUI();
    toast(res.started ? `已开始按序执行 ${res.count} 项队列任务` : res.reason || "无法启动");
  } catch (err) {
    toast(err.message, 4000);
  }
};

let syncInflight = false;
async function syncLiveState({ includeBootstrap = false } = {}) {
  if (syncInflight) return;
  syncInflight = true;
  try {
    if (includeBootstrap) {
      const [tasksRes, bootRes] = await Promise.all([
        api("/api/tasks", { silent: true }),
        api("/api/bootstrap", { silent: true }),
      ]);
      appState.tasks = tasksRes.tasks;
      appState.dreamina = bootRes.dreamina;
      appState.cloud = bootRes.cloud || appState.cloud;
      appState.schedule = bootRes.schedule || appState.schedule;
      appState.recentLogs = bootRes.recentLogs || [];
    } else {
      const [tasksRes, schRes] = await Promise.all([
        api("/api/tasks", { silent: true }),
        api("/api/schedule", { silent: true }),
      ]);
      appState.tasks = tasksRes.tasks;
      if (schRes?.schedule) appState.schedule = schRes.schedule;
    }
    renderAll();
  } catch {}
  finally {
    syncInflight = false;
  }
}

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
    appState.schedule = data.schedule || null;
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

  // Immediately refresh when returning to this browser tab (fixes overnight stale snapshot)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      syncLiveState({ includeBootstrap: true });
    }
  });
  window.addEventListener("focus", () => {
    syncLiveState({ includeBootstrap: false });
  });

  // Always poll: 2.5s while any job/batch is active; every 15s while idle so 06:00 auto-triggers & countdowns stay live
  let idleTickCount = 0;
  setInterval(() => {
    const anyActive =
      Boolean(appState.schedule?.runningBatch) ||
      appState.tasks.some(
        (t) =>
          (t.storyboard?.shots || []).some((s) => s.status === "running") ||
          (t.stage3?.takes || []).some((x) => x.status === "running") ||
          (t.stage4?.runs || []).some((r) => r.status === "queued" || r.status === "running") ||
          (t.stage6?.runs || []).some((r) => r.status === "running")
      );
    if (anyActive) {
      idleTickCount = 0;
      syncLiveState({ includeBootstrap: true });
      return;
    }
    idleTickCount += 1;
    if (idleTickCount >= 6) {
      idleTickCount = 0;
      syncLiveState({ includeBootstrap: false });
    }
  }, 2500);
}

boot().catch((err) => {
  $("#bootOverlay")?.classList.add("hidden");
  updateGlobalBusyUI();
  toast(err.message, 6000);
});
