const Dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
function Axis(q,[x,y,z]){
  const [qx,qy,qz,qw]=q,tx=2*(qy*z-qz*y),ty=2*(qz*x-qx*z),tz=2*(qx*y-qy*x);
  return [x+qw*tx+qy*tz-qz*ty,y+qw*ty+qz*tx-qx*tz,z+qw*tz+qx*ty-qy*tx];
}

// +Z 是真实勺碗开口；镊尖沿 ±X 合拢，不能把一片夹臂朝皮肤里压也算夹住。
export function InstrumentContact(id,rotation,normal,{jawContact=true,edgeContact=null,motion=null}={}){
  const face=Axis(rotation,[0,0,1]),jaws=Axis(rotation,[1,0,0]);
  const unitNormal=normal.map(v=>v/(Math.hypot(...normal)||1));
  const facing=Dot(face,unitNormal),jawTilt=Math.abs(Dot(jaws,unitNormal));
  const edgeFacing=edgeContact?Dot(face,edgeContact.inward):-1;
  // 仅留约 2.3 度数值死区；浅角度凹面仍可工作，不要求固定的 16 度抬角。
  const faceAligned=facing>.04,edgeAligned=!!edgeContact&&edgeFacing>.04;
  const aligned=id==='scoop'?faceAligned||edgeAligned:id==='tweezers'?jawTilt<.48&&jawContact:true;
  // 侧刃可以从任何外边界推入；离开边缘的勺子不变成双向夹爪。
  const withdrawing=!!motion&&!!edgeContact&&Dot(motion,edgeContact.inward)<-1e-6;
  const loading=id!=='scoop'||aligned&&(!withdrawing||faceAligned&&Dot(motion,unitNormal)>1e-6);
  // 勺面决定能否托住；direction 是参考法线，耳勺的实际加载位移由鼠标与碰撞后的位姿计算。
  const direction=id==='scoop'?normal.map(v=>v/(Math.hypot(...normal)||1)):id==='tweezers'?face.map(v=>v*(facing<0?-1:1)):face;
  return {aligned,loading,direction,facing,jawTilt,edgeFacing,edgeAligned};
}

// 原生微屑是一簇独立细粒；递归切片必须真的足够小，代数不能代替尺寸。
export function IsFeatherDebris({form,fragment,mass,footprint}){
  return form==='microdust'||!!(fragment&&mass<=.045&&footprint&&Math.max(...footprint)*2<=.65);
}
