// P012-only finite train recruits. All points are WORLD coordinates; shared
// station surfaces own height. No geometry, population loop or combat reserve.
import {P012_STATION_EXITS} from './Data_FirstLevelP012Station.mjs';
const Point=(x,z)=>Object.freeze({x,z});
export const trainColumn=Object.freeze({
  total:40,extraCount:34,speedMps:3.05,arrivalRadiusM:.2,routeArrivalRadiusM:.45,bodySpacingM:.9,
  weaponSeconds:1,ammoSeconds:.8,
  cars:Object.freeze(P012_STATION_EXITS.map((exit,carIndex)=>{
    const count=carIndex===1?24:8,center=exit.route[0].z;
    // Leave the middle wagon's door approach and player pocket genuinely free.
    // Three abreast farther inside; the centre man exits first, then his sides.
    const seats=Array.from({length:count},(_,i)=>carIndex===1
      ?Point([-66,-64.65,-67.35][i%3],center-.55+Math.floor(i/3))
      :Point(i%2?-64.65:-67.35,center-6+Math.floor(i/2)*2.7));
    seats.sort((a,b)=>Math.abs(a.z-exit.route[1].z)-Math.abs(b.z-exit.route[1].z)
      ||Math.abs(a.x+66)-Math.abs(b.x+66)||b.x-a.x);
    const z=exit.route.at(-1).z;
    return Object.freeze({carIndex,seats:Object.freeze(seats),exitRoute:exit.route,
      weaponPoint:Point(-55,z),ammoPoint:carIndex===0?Point(-55,94):Point(-51,z),
      onward:Object.freeze(carIndex===0?[Point(-51,94),Point(-49,92)]:[...(carIndex===2?[Point(-51,137),Point(-47,137)]:[]),Point(-47,z===139?121:z),Point(-47,100),Point(-49,100),Point(-49,92)]),
    });
  })),
  mergePoints:Object.freeze([Point(-47,121),Point(-48,101),Point(-49,92)]),
  originalMuster:Object.freeze(Array.from({length:6},(_,i)=>Point(-43.8-(i%3)*1.6,90.8+Math.floor(i/3)*1.2))),
  extraApproach:Object.freeze([Point(-50,92),Point(-50,86),Point(-48,86)]),
  extraMuster:Object.freeze(Array.from({length:34},(_,i)=>{
    const group=i<8?0:i<26?1:2,n=i-(group===0?0:group===1?8:26),width=group===1?3:4;
    return Point(-60+(n%width)*2,(group===0?68:group===1?72:84)+Math.floor(n/width)*2);
  })),
});
export default trainColumn;
