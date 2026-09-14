import {SOUTH_TRANSITION as R} from './Data_FirstLevelFrontRoute.mjs';
import {Localize} from './Script_Text.mjs';
// Owned by the mission runtime; simulation time makes pause/replay deterministic.
export class FirstLevelTransition {
  constructor(){
    this.root=document.createElement('div');this.root.id='firstLevelSouthTransition';
    Object.assign(this.root.style,{position:'fixed',inset:'0',zIndex:'80',background:'#000',color:'#ddd',
      display:'none',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'24px',
      textAlign:'center',pointerEvents:'none',fontFamily:'serif',padding:'32px'});
    const title=document.createElement('div'),body=document.createElement('div');
    title.textContent=Localize('firstLevel.transition.south.title',R.title);
    body.textContent=Localize('firstLevel.transition.south.text',R.text);
    Object.assign(title.style,{fontSize:'30px',letterSpacing:'.3em'});
    Object.assign(body.style,{fontSize:'20px',lineHeight:'2',whiteSpace:'pre-line'});
    this.root.append(title,body);document.body.append(this.root);
  }
  Update(time){
    this.root.style.display='flex';
    this.root.style.opacity=String(Math.max(0,Math.min(1,time/R.fadeOutS,
      (R.fadeOutS+R.holdS+R.fadeInS-time)/R.fadeInS)));
  }
  Hide(){this.root.style.display='none';}
  Dispose(){this.root.remove();}
}
