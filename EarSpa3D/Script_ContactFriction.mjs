const Clamp=value=>Math.max(0,Math.min(1,value));

// 力不是速度：静止保持的弹簧反力和材料自行回弹都不能维持摩擦声。
export function ContactFriction(state,toolId,type){
  if(!['scoop','brush','feather'].includes(toolId)||state.slipped||state.wrongDirection||state.wrongTool||state.detached||!(state.scrapeSpeed>.015)||!(state.force>.02))return null;
  const speed01=Clamp(state.scrapeSpeed/3),pressure01=Clamp(state.force/70);
  return{kind:toolId==='scoop'?(type==='dry'||type==='impacted'?'scrape':'wipe'):'sweep',speed01,pressure01,roughness01:type==='dry'?.45:.12};
}
