import {EncounterCanPlay,EncounterFirstPlayable} from "../Script_EncounterPlayPlan.mjs";
import {ENCOUNTER_PLAY_STARTUP} from "../Data_Tuning_EncounterPlayStartup.mjs";

// One dormant host per editor: Stop clears simulation, retaining loaded assets.
export class LevelFlowPlay {
  constructor({snapshot,restore,pause,toast,onState,showSource}) {
    Object.assign(this,{snapshot,restore,pause,toast,onState,showSource});
    this.active=false;this.paused=false;this.state=null;this.cursorTime=0;this.generation=0;
    this.button=document.getElementById("playGame");this.pauseButton=document.getElementById("pauseGame");this.stopButton=document.getElementById("stopGame");
    this.menu=document.getElementById("playGameStart");this.layout=document.getElementById("viewportLayout");
    this.button.onclick=()=>this.active?this.Pause(false):this.Start(this.menu.value);
    this.pauseButton.onclick=()=>this.Pause(!this.paused);this.stopButton.onclick=()=>this.Stop();
    this.menu.onchange=()=>this.UpdateControls();
    // Keyboard events do not cross iframe boundaries. Keep an escape route
    // when a toolbar/sidebar control owns focus while the game is running.
    document.addEventListener("keydown",event=>{
      if(event.key!=="Escape"||event.repeat||!this.active||!this.state?.ready||this.launching)return;
      event.preventDefault();this.Pause(!this.paused);
    });
    window.addEventListener("message",e=>{
      if(!this.active||e.source!==this.frame?.contentWindow||e.origin!==location.origin||e.data?.token!==this.token)return;
      if(e.data.type==="encounter-play-ready")this.StartHost();
      if(e.data.type==="encounter-play-state"){this.state=e.data.state;this.paused=!!this.state.paused;this.onState?.(this.state);this.UpdateControls();}
      if(e.data.type==="encounter-play-error")this.LoadError(e.data.message);
      if(e.data.type==="encounter-play-stop")this.Stop();
    });
    window.addEventListener("pagehide",()=>this.DropHost(),{once:true});this.UpdateControls();
  }
  SetCursorTime(time){this.cursorTime=time;this.UpdateControls();}
  UpdateControls() {
    const allowed=this.menu.value==="beginning"||EncounterCanPlay(this.cursorTime);
    this.button.disabled=this.active?!this.paused:!allowed;
    this.button.title=!allowed&&!this.active?"镜头动画段暂不支持 Play":this.paused?"继续 Play":"播放";
    this.button.setAttribute("aria-pressed",String(this.active&&!this.paused));
    this.pauseButton.disabled=!this.active||!this.state?.ready||this.launching;
    this.pauseButton.setAttribute("aria-pressed",String(this.paused));this.pauseButton.title=this.paused?"继续":"暂停";
    this.stopButton.disabled=!this.active;this.menu.disabled=this.active;
  }
  async SceneStamp() {
    const paths=["Scenes/FirstLevelEncounter/Scene_FirstLevelEncounter.json","Scenes/FirstLevelEncounter/Scene_FirstLevelEncounter.height.bin",
      "Scenes/FirstLevelEncounter/Scene_FirstLevelEncounter.trench.bin","Scenes/FirstLevelEncounter/Environment_FirstLevelEncounter.json",
      "Environment/EnvPreset_FirstLevelEncounter.json","Scenes/FirstLevelEncounter/Data_Play.mjs"];
    return (await Promise.all(paths.map(async path=>{
      const response=await fetch(new URL("../"+path,import.meta.url),{cache:"no-store"});
      if(!response.ok)throw new Error("场景读取失败："+response.status);
      const hash=await crypto.subtle.digest("SHA-256",await response.arrayBuffer());
      return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,"0")).join("");
    }))).join(":");
  }
  Start(mode="current") {
    if(this.active)return false;
    this.saved=this.snapshot();
    const time=mode==="beginning"?EncounterFirstPlayable().start:this.saved.time;
    if(!EncounterCanPlay(time)){this.saved=null;this.toast("镜头动画段暂不支持 Play，请选择战斗关键帧。");return false;}
    clearTimeout(this.cacheTimer);this.pause();this.token=crypto.randomUUID();this.state=null;this.paused=false;this.launching=true;
    const payload={token:this.token,time,document:this.saved.document};
    try{sessionStorage.setItem("tengxian1938_encounter_play_session_v1",JSON.stringify(payload));}
    catch(error){this.toast("Play 开局数据保存失败："+error.message,true);this.saved=null;return false;}
    this.active=true;this.startedAt=performance.now();this.startTime=time;const generation=++this.generation;
    this.deadline=setTimeout(()=>{if(this.active&&generation===this.generation){this.Stop();this.toast("Play 加载超时，已停止；可以重新尝试。",true);}},ENCOUNTER_PLAY_STARTUP.maxLoadMs);
    for(const option of this.layout.options)option.hidden=option.disabled=Number(option.value)>2;
    this.layout.value="1";document.body.classList.add("lfPlayingGame");
    document.querySelector("#chatPane").inert=true;document.querySelector(".lfTimeline").inert=true;
    this.showSource?.();this.UpdateControls();
    this.Launch(payload,generation).catch(error=>{
      if(!this.active||generation!==this.generation)return;
      this.LoadError(error.message);
    });
    return true;
  }
  async Launch(payload,generation) {
    const stamp=await this.SceneStamp();
    if(!this.active||generation!==this.generation)return;
    const api=this.frame?.contentWindow.Tengxian?.Debug.EncounterPlay;
    if(api?.State().initialized&&!api.State().error&&stamp===this.cachedStamp) {
      this.host.className="lfPlayHost";this.host.hidden=false;this.loading.hidden=false;this.loading.textContent="正在重置试玩…";
      await api.Begin(payload);
      if(!this.active||generation!==this.generation)return;
      this.launching=false;this.StartHost();return;
    }
    this.DropHost();this.cachedStamp=stamp;
    this.host=document.createElement("div");this.host.className="lfPlayHost";
    this.loading=document.createElement("div");this.loading.className="lfPlayLoading";this.loading.textContent="正在载入战斗场景…";
    this.frame=document.createElement("iframe");this.frame.title="Encounter Play";this.frame.allow="autoplay; fullscreen";this.frame.src="../index.html?encounterPlay=1";
    this.host.append(this.frame,this.loading);document.querySelector(".lfViewport").append(this.host);
    this.launching=false;this.timer=setInterval(()=>this.StartHost(),100);
  }
  StartHost() {
    if(!this.active||this.launching||!this.frame)return;
    const win=this.frame.contentWindow,game=win.Tengxian,api=game?.Debug?.EncounterPlay;
    const step=win.document.getElementById("bootStep")?.textContent;if(step)this.loading.textContent=step;
    if(step?.startsWith("启动失败")){this.LoadError(step);return;}
    if(api?.State().error){this.LoadError(api.State().error.split("\n")[0]);return;}
    if(!api?.State().ready)return;
    const button=win.document.getElementById("bootStart"),boot=win.document.getElementById("boot");
    if(!boot?.classList.contains("gone")&&button&&!button.disabled&&button.getClientRects().length)button.click();
    if(game.state.running) {
      clearInterval(this.timer);clearTimeout(this.deadline);this.loading.hidden=true;this.state=api.State();this.loadMs=performance.now()-this.startedAt;
      this.onState?.(this.state);this.UpdateControls();this.frame.focus();
    }
  }
  Pause(on) {
    if(!this.active||!this.state?.ready)return false;
    this.paused=this.frame.contentWindow.Tengxian.Debug.EncounterPlay.Pause(on);
    this.state=this.frame.contentWindow.Tengxian.Debug.EncounterPlay.State();this.onState?.(this.state);this.UpdateControls();
    if(!this.paused)this.frame.focus();
    return this.paused;
  }
  LoadError(message){
    clearInterval(this.timer);clearTimeout(this.deadline);this.launching=false;
    this.state={ready:false,error:message,paused:false,timelineTime:this.startTime,hints:{title:"Play 加载失败",task:message,hint:"停止后可以重试"}};
    if(this.loading)this.loading.textContent=message;
    this.onState?.(this.state);this.UpdateControls();
  }
  SetLayout(count) {
    if(!this.active)return false;
    count=count===2?2:1;this.layout.value=String(count);
    this.frame?.contentWindow.postMessage({type:"encounter-play-layout",token:this.token,count},location.origin);
    if(!this.paused&&this.state?.ready)this.frame?.focus();
    return true;
  }
  Stop() {
    if(!this.active)return;
    this.active=false;this.paused=false;this.launching=false;this.generation++;clearInterval(this.timer);clearTimeout(this.deadline);
    const api=this.frame?.contentWindow.Tengxian?.Debug.EncounterPlay;
    if(api?.State().initialized&&!api.State().starting&&!api.State().error){api.Suspend();this.host.hidden=true;this.host.className="lfPlayCache";this.cacheTimer=setTimeout(()=>this.DropHost(),ENCOUNTER_PLAY_STARTUP.idleCacheMs);}
    else this.DropHost();
    sessionStorage.removeItem("tengxian1938_encounter_play_session_v1");
    for(const option of this.layout.options)option.hidden=option.disabled=false;
    document.body.classList.remove("lfPlayingGame");
    document.querySelector("#chatPane").inert=false;document.querySelector(".lfTimeline").inert=false;
    this.restore(this.saved);this.layout.value=String(this.saved.viewports.count);this.saved=null;this.state=null;this.UpdateControls();this.button.focus();
  }
  DropHost(){
    clearTimeout(this.cacheTimer);
    try{this.frame?.contentWindow.Tengxian?.Debug?.EncounterPlay?.Dispose?.();}catch{}
    if(this.frame)this.frame.src="about:blank";this.host?.remove();this.frame=null;this.host=null;
  }
  Inspect(){return {active:this.active,paused:this.paused,state:this.state,savedTime:this.saved?.time??null,loadMs:this.loadMs??null,cached:!!this.frame};}
}
