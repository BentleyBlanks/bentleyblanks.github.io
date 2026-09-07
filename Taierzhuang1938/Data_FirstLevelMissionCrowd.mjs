// Covered work areas: arriving teams fan out before joining a narrow doorway or loading bay.
export const MISSION_CROWD_AREAS = Object.freeze([
 {id:"courtyard",trigger:{x:58,z:18},entryZ:18,exitZ:32.2,merge:{x:53,z:32.2},
  pockets:[[39,21],[62,21.3],[44,22.1],[68,22.2],[49,20.8],[54,22],
   [41,25.4],[64,25.8],[46.5,26],[68.5,26.3],[52,25.6],[57.5,26],
   [39,29.5],[63.4,30.1],[44.2,29.6],[68.3,30],[49,29.7],[58.5,30],
   [66,18.8],[59.4,21.5]].map(([x,z])=>({x,z}))},
 {id:"transfer",trigger:{x:76,z:85},entryZ:88,exitZ:111,merge:{x:74,z:111},
  pockets:[[60,93],[83,95],[66,92],[72,96],[78,91],[87,92],
   [58.5,99],[62,101],[69,99],[76,102],[82,100],[86.5,102],
   [59,105],[69,106],[75,107],[82,106],[62,96],[73,91],
   [85,106],[67,96]].map(([x,z])=>({x,z}))}
]);

for(const area of MISSION_CROWD_AREAS){
  // Fill the farthest pockets first so later arrivals do not walk through resting teams.
  area.pockets.sort((a,b)=>b.z-a.z);
  const bounds=area.id==="courtyard"?{x:39,z:19,w:30.7,d:12.1}:{x:57,z:91,w:32,d:17};
  const points=[];
  for(let attempt=0;attempt<6000&&points.length<58;attempt++){
    const x=bounds.x+((attempt*.61803398875+.27)%1)*bounds.w;
    const z=bounds.z+((attempt*.41421356237+.19)%1)*bounds.d;
    if(area.pockets.some(p=>Math.hypot(x-p.x,z-p.z)<1.95))continue;
    if(points.some(p=>Math.hypot(x-p.x,z-p.z)<1.15))continue;
    if(area.id==="courtyard"&&Math.abs(x-36)<1.2)continue;
    if(area.id==="transfer"&&(Math.abs(x-64)<1||Math.abs(x-88)<1))continue;
    points.push({x,z});
  }
  area.walkerPockets=points;
}
