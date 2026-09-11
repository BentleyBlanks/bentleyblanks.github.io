const Dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
function Axis(q,[x,y,z]){
  const [qx,qy,qz,qw]=q,tx=2*(qy*z-qz*y),ty=2*(qz*x-qx*z),tz=2*(qx*y-qy*x);
  return [x+qw*tx+qy*tz-qz*ty,y+qw*ty+qz*tx-qx*tz,z+qw*tz+qx*ty-qy*tx];
}

// +Z 是真实勺碗开口；镊尖沿 ±X 合拢，不能把一片夹臂朝皮肤里压也算夹住。
export function InstrumentContact(id,rotation,normal,{jawContact=true}={}){
  const face=Axis(rotation,[0,0,1]),jaws=Axis(rotation,[1,0,0]);
  const facing=Dot(face,normal),jawTilt=Math.abs(Dot(jaws,normal));
  const aligned=id==='scoop'?facing>.28:id==='tweezers'?jawTilt<.48&&jawContact:true;
  // 勺面决定能否托住，刮除力沿壁面法线向管腔加载，不能随握持旋转变成斜拉。
  const direction=id==='scoop'?normal.map(v=>v/(Math.hypot(...normal)||1)):id==='tweezers'?face.map(v=>v*(facing<0?-1:1)):face;
  return {aligned,direction,facing,jawTilt};
}

// 原生微屑是一簇独立细粒；递归切片必须真的足够小，代数不能代替尺寸。
export function IsFeatherDebris({form,fragment,mass,footprint}){
  return form==='microdust'||!!(fragment&&mass<=.045&&footprint&&Math.max(...footprint)*2<=.65);
}
