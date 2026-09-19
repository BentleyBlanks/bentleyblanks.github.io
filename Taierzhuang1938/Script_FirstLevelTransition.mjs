// 参数化的黑屏字幕（标题/正文由调用方从文本表取，时长由调用方给）。
// 关尾夜行军用它；旧的「向南」转场已随 2026.09.19 重构下线。
// Owned by the mission runtime; simulation time makes pause/replay deterministic.
export class FirstLevelTransition {
  constructor(){
    this.timing={fadeOutS:1,holdS:4,fadeInS:1};
    this.root=document.createElement('div');this.root.id='firstLevelTransition';
    Object.assign(this.root.style,{position:'fixed',inset:'0',zIndex:'80',background:'#000',color:'#ddd',
      display:'none',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'24px',
      textAlign:'center',pointerEvents:'none',fontFamily:'serif',padding:'32px'});
    this.title=document.createElement('div');this.body=document.createElement('div');
    Object.assign(this.title.style,{fontSize:'30px',letterSpacing:'.3em'});
    Object.assign(this.body.style,{fontSize:'20px',lineHeight:'2',whiteSpace:'pre-line'});
    this.root.append(this.title,this.body);document.body.append(this.root);
  }
  /** @param {{title:string,text:string,fadeOutS:number,holdS:number,fadeInS:number}} spec */
  Show(spec){
    this.title.textContent=spec.title||'';
    this.body.textContent=spec.text||'';
    this.timing={fadeOutS:spec.fadeOutS,holdS:spec.holdS,fadeInS:spec.fadeInS};
  }
  Update(time){
    const T=this.timing;
    this.root.style.display='flex';
    this.root.style.opacity=String(Math.max(0,Math.min(1,time/T.fadeOutS,
      (T.fadeOutS+T.holdS+T.fadeInS-time)/T.fadeInS)));
  }
  Hide(){this.root.style.display='none';}
  Dispose(){this.root.remove();}
}
