// Editor session boundary: snapshot authoring state, mount one game, restore on Stop.
export class LevelFlowPlay {
  constructor({snapshot,restore,pause,toast}) {
    this.snapshot=snapshot;this.restore=restore;this.pause=pause;this.toast=toast;this.active=false;this.state=null;
    this.button=document.getElementById("playGame");this.menu=document.getElementById("playGameStart");
    this.layout=document.getElementById("viewportLayout");
    this.button.onclick=()=>this.active?this.Stop():this.Start(this.menu.value);
    this.onMessage=e=>{
      if(!this.active||e.source!==this.frame?.contentWindow||e.origin!==location.origin||e.data?.token!==this.token)return;
      const kind=e.data.type;
      if(kind==="encounter-play-ready")this.StartHost();
      if(kind==="encounter-play-state")this.state=e.data.state;
      if(kind==="encounter-play-error"){this.loading.textContent=e.data.message;this.toast(e.data.message,true);}
      if(kind==="encounter-play-stop")this.Stop();
    };
    window.addEventListener("message",this.onMessage);
  }
  Start(mode="current") {
    if(this.active)return false;
    this.saved=this.snapshot();this.pause();this.token=crypto.randomUUID();this.state=null;
    const time=mode==="beginning"?0:this.saved.time;
    try{sessionStorage.setItem("tengxian1938_encounter_play_session_v1",JSON.stringify({token:this.token,time,document:this.saved.document}));}
    catch(error){this.toast("Play 开局数据保存失败："+error.message,true);return false;}
    this.active=true;this.button.innerHTML="■";this.button.title="停止 Play";this.button.setAttribute("aria-label","停止 Play");this.button.setAttribute("aria-pressed","true");
    this.menu.disabled=true;
    for(const option of this.layout.options)option.hidden=option.disabled=Number(option.value)>2;
    this.layout.value="1";
    document.body.classList.add("lfPlayingGame");
    document.querySelector(".lfInspector").inert=true;document.querySelector(".lfTimeline").inert=true;
    this.host=document.createElement("div");this.host.className="lfPlayHost";
    this.loading=document.createElement("div");this.loading.className="lfPlayLoading";this.loading.textContent="正在载入独立场景与正式角色…";
    this.frame=document.createElement("iframe");this.frame.title="Encounter Play";this.frame.allow="autoplay; fullscreen";
    this.frame.src="../index.html?encounterPlay=1";
    this.host.append(this.frame,this.loading);document.querySelector(".lfViewport").append(this.host);
    this.timer=setInterval(()=>this.StartHost(),250);
    return true;
  }
  StartHost() {
    if(!this.active)return;
    const win=this.frame.contentWindow,game=win.Tengxian;
    const step=win.document.getElementById("bootStep")?.textContent;
    if(step)this.loading.textContent=step;
    if(!game?.Debug?.EncounterPlay?.State().ready)return;
    const button=win.document.getElementById("bootStart");
    if(button&&!button.disabled&&win.getComputedStyle(button).display!=="none")button.click();
    if(game.state.running) {clearInterval(this.timer);this.loading.hidden=true;this.frame.focus();}
  }
  SetLayout(count) {
    if(!this.active)return false;
    count=count===2?2:1;this.layout.value=String(count);
    this.frame.contentWindow.postMessage({type:"encounter-play-layout",token:this.token,count},location.origin);
    return true;
  }
  Stop() {
    if(!this.active)return;
    this.active=false;clearInterval(this.timer);
    try{this.frame.contentWindow.Tengxian?.Debug?.EncounterPlay?.Dispose?.();}catch{}
    this.frame.src="about:blank";this.host.remove();
    sessionStorage.removeItem("tengxian1938_encounter_play_session_v1");
    this.menu.disabled=false;for(const option of this.layout.options)option.hidden=option.disabled=false;
    this.button.innerHTML="▶";this.button.title="Play · 从所选关键帧开始";this.button.setAttribute("aria-label","Play");this.button.setAttribute("aria-pressed","false");
    document.body.classList.remove("lfPlayingGame");
    document.querySelector(".lfInspector").inert=false;document.querySelector(".lfTimeline").inert=false;
    this.restore(this.saved);this.layout.value=String(this.saved.viewports.count);
    this.frame=null;this.host=null;this.saved=null;this.button.focus();
  }
  Inspect(){return {active:this.active,state:this.state,savedTime:this.saved?.time??null};}
}
